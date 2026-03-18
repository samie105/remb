import * as vscode from "vscode";
import { ApiError, type ApiClient } from "./api-client";
import type { AuthManager } from "./auth";
import type { WorkspaceDetector } from "./workspace";
import type { MemoriesTreeProvider, ProjectsTreeProvider, ContextTreeProvider } from "./views";
import type { Memory } from "./types";

export function registerCommands(
  context: vscode.ExtensionContext,
  api: ApiClient,
  auth: AuthManager,
  workspace: WorkspaceDetector,
  trees: {
    memoriesTree: MemoriesTreeProvider;
    projectsTree: ProjectsTreeProvider;
    contextTree: ContextTreeProvider;
  }
): void {
  // ── Auth ──────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand("remb.login", () => auth.login()),
    vscode.commands.registerCommand("remb.logout", () => auth.logout())
  );

  // ── Save context from editor selection ────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand("remb.saveContext", async () => {
      const editor = vscode.window.activeTextEditor;
      const selection = editor?.selection;
      const selectedText = editor?.document.getText(selection);

      if (!selectedText) {
        vscode.window.showWarningMessage("Select some text first, then run this command.");
        return;
      }

      const slug = workspace.projectSlug;
      if (!slug) {
        vscode.window.showWarningMessage("No project detected. Open a workspace with .remb.yml.");
        return;
      }

      const featureName = await vscode.window.showInputBox({
        prompt: "Feature name",
        placeHolder: "e.g. auth-flow, api-design, db-schema",
        validateInput: (v) => {
          if (!v.trim()) return "Feature name is required";
          if (v.length > 200) return "Feature name must be ≤ 200 characters";
          return undefined;
        },
      });
      if (!featureName) return;

      try {
        const result = await api.saveContext({
          projectSlug: slug,
          featureName: featureName.trim(),
          content: selectedText,
          entryType: "manual",
        });
        vscode.window.showInformationMessage(`Context saved for "${result.featureName}".`);
        trees.contextTree.refresh();
      } catch (err) {
        vscode.window.showErrorMessage(formatCommandError("save context", err));
      }
    })
  );

  // ── Create memory ─────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand("remb.createMemory", async () => {
      const title = await vscode.window.showInputBox({
        prompt: "Memory title",
        placeHolder: "e.g. Always use server actions instead of API routes",
        validateInput: (v) => {
          if (!v.trim()) return "Title is required";
          if (v.length > 200) return "Title must be ≤ 200 characters";
          return undefined;
        },
      });
      if (!title) return;

      const content = await vscode.window.showInputBox({
        prompt: "Memory content",
        placeHolder: "Describe the pattern, decision, or preference…",
        validateInput: (v) => {
          if (!v.trim()) return "Content is required";
          if (v.length > 50000) return "Content must be ≤ 50,000 characters";
          return undefined;
        },
      });
      if (!content) return;

      const tier = await vscode.window.showQuickPick(
        [
          { label: "core", description: "Always loaded in every session" },
          { label: "active", description: "Loaded on-demand when relevant" },
          { label: "archive", description: "Historical — long-term storage" },
        ],
        { placeHolder: "Select tier" }
      );

      try {
        const result = await api.createMemory({
          title: title.trim(),
          content: content.trim(),
          tier: tier?.label,
          projectSlug: workspace.projectSlug ?? undefined,
        });
        vscode.window.showInformationMessage(`Memory created: "${result.title}" (${result.tier}).`);
        trees.memoriesTree.refresh();
      } catch (err) {
        vscode.window.showErrorMessage(formatCommandError("create memory", err));
      }
    })
  );

  // ── Search memories ───────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand("remb.searchMemories", async () => {
      const query = await vscode.window.showInputBox({
        prompt: "Search memories",
        placeHolder: "e.g. auth pattern, database schema…",
        validateInput: (v) => {
          if (!v.trim()) return "Search query is required";
          if (v.length > 500) return "Query must be ≤ 500 characters";
          return undefined;
        },
      });
      if (!query) return;

      try {
        const result = await api.listMemories({ search: query.trim(), limit: 10 });
        if (result.memories.length === 0) {
          vscode.window.showInformationMessage("No memories matched your search.");
          return;
        }

        const pick = await vscode.window.showQuickPick(
          result.memories.map((m) => ({
            label: m.title,
            description: `${m.tier}/${m.category}`,
            detail: m.content.slice(0, 120),
            memory: m,
          })),
          { placeHolder: `${result.total} results` }
        );
        if (pick) {
          showMemoryDocument(pick.memory);
        }
      } catch (err) {
        vscode.window.showErrorMessage(formatCommandError("search memories", err));
      }
    })
  );

  // ── Trigger scan ──────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand("remb.triggerScan", async () => {
      const slug = workspace.projectSlug;
      if (!slug) {
        vscode.window.showWarningMessage("No project detected.");
        return;
      }
      try {
        const result = await api.triggerScan(slug);
        if (result.status === "started") {
          vscode.window.showInformationMessage(`Scan started for "${slug}". Check progress in the dashboard.`);
        } else {
          vscode.window.showInformationMessage(`${result.status}: ${result.message}`);
        }
      } catch (err) {
        vscode.window.showErrorMessage(formatCommandError("trigger scan", err));
      }
    })
  );

  // ── Switch project ────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand("remb.switchProject", async () => {
      try {
        const result = await api.listProjects({ status: "active" });
        if (result.projects.length === 0) {
          vscode.window.showInformationMessage("No projects found. Create one in the Dashboard.");
          return;
        }
        const pick = await vscode.window.showQuickPick(
          result.projects.map((p) => ({
            label: p.name,
            description: p.slug,
            detail: `${p.feature_count} features, ${p.entry_count} entries`,
          })),
          { placeHolder: "Select project" }
        );
        if (pick) {
          // Write .remb.yml in the workspace root
          const folders = vscode.workspace.workspaceFolders;
          if (folders && folders.length > 0) {
            const rembYmlUri = vscode.Uri.joinPath(folders[0].uri, ".remb.yml");
            const content = `project: ${pick.description}\napi_url: ${vscode.workspace.getConfiguration("remb").get<string>("apiUrl") ?? "https://remb.vercel.app"}\n`;
            await vscode.workspace.fs.writeFile(rembYmlUri, Buffer.from(content, "utf-8"));
            vscode.window.showInformationMessage(`Switched to project "${pick.label}". Updated .remb.yml.`);
          } else {
            vscode.window.showWarningMessage(`Selected: ${pick.label}. Open a folder to persist in .remb.yml.`);
          }
        }
      } catch (err) {
        vscode.window.showErrorMessage(formatCommandError("switch project", err));
      }
    })
  );

  // ── Open dashboard ────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand("remb.openDashboard", () => {
      const config = vscode.workspace.getConfiguration("remb");
      const baseUrl = config.get<string>("apiUrl") ?? "https://useremb.com";
      vscode.env.openExternal(vscode.Uri.parse(`${baseUrl}/dashboard`));
    })
  );

  // ── Tree view actions ─────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand("remb.refreshMemories", () => trees.memoriesTree.refresh()),
    vscode.commands.registerCommand("remb.refreshContext", () => trees.contextTree.refresh())
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("remb.deleteMemory", async (node: { memory: Memory }) => {
      if (!node?.memory) return;
      const confirm = await vscode.window.showWarningMessage(
        `Delete memory "${node.memory.title}"?`,
        { modal: true },
        "Delete"
      );
      if (confirm !== "Delete") return;
      try {
        await api.deleteMemory(node.memory.id);
        trees.memoriesTree.refresh();
        vscode.window.showInformationMessage("Memory deleted.");
      } catch (err) {
        vscode.window.showErrorMessage(formatCommandError("delete memory", err));
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("remb.promoteMemory", async (node: { memory: Memory }) => {
      if (!node?.memory) return;
      const nextTier = node.memory.tier === "archive" ? "active" : "core";

      // Warn when demoting from core
      if (node.memory.tier === "core") {
        const confirm = await vscode.window.showWarningMessage(
          `Demote core memory "${node.memory.title}"? Core memories are always loaded in every session.`,
          { modal: true },
          "Demote"
        );
        if (confirm !== "Demote") return;
      }

      try {
        await api.updateMemory(node.memory.id, { tier: nextTier });
        trees.memoriesTree.refresh();
        vscode.window.showInformationMessage(`Memory ${node.memory.tier === "core" ? "demoted" : "promoted"} to "${nextTier}".`);
      } catch (err) {
        vscode.window.showErrorMessage(formatCommandError("update memory tier", err));
      }
    })
  );

  // ── View memory in editor ─────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand("remb.viewMemory", (memory: Memory) => {
      showMemoryDocument(memory);
    })
  );
}

async function showMemoryDocument(memory: Memory) {
  const content = `# ${memory.title}\n\n` +
    `**Tier**: ${memory.tier} | **Category**: ${memory.category}\n` +
    `**Tags**: ${memory.tags.join(", ") || "none"}\n` +
    `**Created**: ${memory.created_at.slice(0, 10)}\n\n---\n\n${memory.content}`;

  const doc = await vscode.workspace.openTextDocument({
    content,
    language: "markdown",
  });
  await vscode.window.showTextDocument(doc, { preview: true });
}

function formatCommandError(action: string, err: unknown): string {
  if (err instanceof ApiError) {
    if (err.statusCode === 401) return "Session expired. Please sign in again.";
    if (err.statusCode === 403) return "Permission denied. Check your API key permissions.";
    if (err.statusCode === 0) return "Cannot reach the Remb server. Check your internet connection.";
    if (err.statusCode === 429) return "Rate limited. Please wait a moment and try again.";
    return `Failed to ${action}: ${err.message}`;
  }
  return `Failed to ${action}: ${err instanceof Error ? err.message : String(err)}`;
}
