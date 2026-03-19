import * as vscode from "vscode";
import { AuthManager } from "./auth";
import { ApiClient } from "./api-client";
import { WorkspaceDetector } from "./workspace";
import { StatusBar } from "./status-bar";
import { registerLmTools } from "./lm-tools";
import { registerChatParticipant } from "./chat-participant";
import { ConversationCapture } from "./conversation-capture";
import { registerTreeViews } from "./views";
import { registerCommands } from "./commands";
import { SyncManager, ChangesTreeProvider } from "./sync";
import { InstructionsManager } from "./instructions";
import { SessionTracker } from "./session-tracker";
import { ContextMirror } from "./context-mirror";

/** Module-level ref so deactivate() can log the session end. */
let sessionTracker: SessionTracker | undefined;

export async function activate(context: vscode.ExtensionContext) {
  // ── Auth ──────────────────────────────────────────────────
  const auth = new AuthManager(context.secrets);

  // Try importing credentials from CLI if not already authenticated
  await auth.tryImportFromCli();

  // Set context key for when-clause visibility
  const updateAuthContext = async () => {
    const isAuth = await auth.isAuthenticated();
    vscode.commands.executeCommand("setContext", "remb.authenticated", isAuth);
  };
  await updateAuthContext();
  auth.onDidChangeAuth(() => updateAuthContext());

  // ── Workspace detection ───────────────────────────────────
  const workspace = new WorkspaceDetector();
  await workspace.initialize();

  // ── API client ────────────────────────────────────────────
  const api = new ApiClient(() => auth.getApiKey());

  // Let the API client try CLI credential import on 401 before prompting
  api.setCliImporter(() => auth.tryImportFromCli(true));

  // Notify API client of fresh logins so it can retry early 401s
  auth.onDidChangeAuth((isLoggedIn) => {
    if (isLoggedIn) api.markLogin();
  });

  // ── Sync detection ────────────────────────────────────────
  const syncManager = new SyncManager(api, workspace, auth);

  // ── Status bar (with sync state) ──────────────────────────
  const statusBar = new StatusBar(auth, workspace, api, syncManager);

  // ── Passive conversation capture ───────────────────────────
  const capture = new ConversationCapture(api, workspace, auth, context.storageUri);

  // ── LM Tools (Copilot auto-invokable, with capture) ──────
  registerLmTools(context, api, workspace, capture);

  // ── @remb chat participant (with capture) ─────────────────
  registerChatParticipant(context, api, workspace, capture);

  // ── Sidebar tree views ────────────────────────────────────
  const trees = registerTreeViews(context, api, auth, workspace);

  // ── Changes tree view (files changed since last scan) ─────
  const changesTree = new ChangesTreeProvider(syncManager);
  context.subscriptions.push(
    changesTree,
    vscode.window.registerTreeDataProvider("remb.changesView", changesTree)
  );

  // ── Commands ──────────────────────────────────────────────
  registerCommands(context, api, auth, workspace, trees);

  // ── Sync commands ─────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand("remb.checkSync", () => syncManager.check()),
    vscode.commands.registerCommand("remb.refreshChanges", () => changesTree.refresh())
  );

  // ── MCP server commands ───────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand("remb.toggleMcpServer", async (server: { id: string; name: string }) => {
      try {
        const result = await api.toggleMcpServer(server.id);
        vscode.window.showInformationMessage(result.message);
        trees.mcpServersTree.refresh();
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to toggle MCP server: ${err instanceof Error ? err.message : String(err)}`);
      }
    }),
    vscode.commands.registerCommand("remb.connectMcpServer", async (node: { server: { id: string; name: string; isActive: boolean } }) => {
      const server = node?.server ?? node as unknown as { id: string; name: string; isActive: boolean };
      if (server?.isActive) return; // already connected
      try {
        const result = await api.toggleMcpServer(server.id);
        vscode.window.showInformationMessage(`Connected: ${server.name}. ${result.message}`);
        trees.mcpServersTree.refresh();
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to connect ${server.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }),
    vscode.commands.registerCommand("remb.disconnectMcpServer", async (node: { server: { id: string; name: string; isActive: boolean } }) => {
      const server = node?.server ?? node as unknown as { id: string; name: string; isActive: boolean };
      if (!server?.isActive) return; // already disconnected
      try {
        const result = await api.toggleMcpServer(server.id);
        vscode.window.showInformationMessage(`Disconnected: ${server.name}. ${result.message}`);
        trees.mcpServersTree.refresh();
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to disconnect ${server.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }),
    vscode.commands.registerCommand("remb.refreshMcpServers", () => trees.mcpServersTree.refresh()),
    vscode.commands.registerCommand("remb.editMcpServers", () => {
      const config = vscode.workspace.getConfiguration("remb");
      const baseUrl = config.get<string>("apiUrl") ?? "https://www.useremb.com";
      vscode.env.openExternal(vscode.Uri.parse(`${baseUrl}/dashboard/mcp`));
    }),
    vscode.commands.registerCommand("remb.editMemoryOnWeb", () => {
      const config = vscode.workspace.getConfiguration("remb");
      const baseUrl = config.get<string>("apiUrl") ?? "https://www.useremb.com";
      const slug = workspace.projectSlug;
      const path = slug ? `/dashboard/${slug}/memory` : "/dashboard/memory";
      vscode.env.openExternal(vscode.Uri.parse(`${baseUrl}${path}`));
    }),
    vscode.commands.registerCommand("remb.initProject", async () => {
      const terminal = vscode.window.createTerminal("Remb Init");
      terminal.sendText("remb init");
      terminal.show();
    }),
    vscode.commands.registerCommand("remb.refreshProjects", () => trees.projectsTree.refresh()),
    vscode.commands.registerCommand("remb.setActiveProject", async (project: { id: string; name: string; slug: string }) => {
      const p = project?.slug ? project : (project as unknown as { project: { id: string; name: string; slug: string } })?.project;
      if (!p?.slug) return;
      try {
        await workspace.setProjectSlug(p.slug);
        vscode.window.showInformationMessage(`Active project set to \"${p.name}\"`);
        trees.projectsTree.refresh();
        trees.memoriesTree.refresh();
        trees.contextTree.refresh();
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to set project: ${err instanceof Error ? err.message : String(err)}`);
      }
    })
  );

  // ── Set project context keys ──────────────────────────────
  const updateProjectContext = () => {
    const hasProject = !!workspace.projectSlug;
    vscode.commands.executeCommand("setContext", "remb.hasProject", hasProject);
  };
  updateProjectContext();
  workspace.onDidChangeProject(() => updateProjectContext());

  // ── Auto-generate AI instructions ─────────────────────────
  const instructions = new InstructionsManager(workspace, auth, api);
  instructions.setCapture(capture);
  await instructions.sync();
  // Kick off dynamic context fetch (non-blocking)
  instructions.syncDynamic().catch(() => {});

  // ── Wire capture → instruction refresh, then start listening ──
  capture.setSyncDynamic(() => instructions.syncDynamic());
  capture.start();

  // ── Session lifecycle tracking ────────────────────────────
  const tracker = new SessionTracker(api, workspace, auth);
  sessionTracker = tracker;
  tracker.start().catch(() => {});

  // ── Start sync polling ────────────────────────────────────
  syncManager.start();

  // ── Context mirror (.remb/ local structure) ────────────────
  const mirror = new ContextMirror(api, workspace, auth);
  mirror.start();

  // ── Disposables ───────────────────────────────────────────
  context.subscriptions.push(auth, workspace, statusBar, syncManager, instructions, capture, tracker, mirror, api);
}

export function deactivate(): Thenable<void> | undefined {
  // Log session end before VS Code shuts down
  return sessionTracker?.end();
}
