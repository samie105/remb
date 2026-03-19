import * as vscode from "vscode";
import { ApiError, type ApiClient } from "./api-client";
import type { AuthManager } from "./auth";
import type { WorkspaceDetector } from "./workspace";
import type { Memory, Project, ContextEntry, McpServer } from "./types";

// ── Shared error node ────────────────────────────────────────

function errorLabel(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.statusCode === 401) return "Not authenticated — sign in to load";
    if (err.statusCode === 0) return "Cannot reach server";
    return `API error (${err.statusCode})`;
  }
  return "Failed to load";
}

// ── Projects Tree (Local + Cloud groups) ───────────────────

type ProjectTreeItem = ProjectGroupNode | ProjectNode | StatusNode | LoadingNode;

class ProjectGroupNode {
  constructor(public group: "local" | "cloud") {}
}

class ProjectNode {
  constructor(public project: Project, public isLocal: boolean) {}
}

class StatusNode {
  constructor(public message: string, public icon: string = "info", public command?: vscode.Command) {}
}

class LoadingNode {
  constructor(public label = "Loading…") {}
}

export class ProjectsTreeProvider implements vscode.TreeDataProvider<ProjectTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ProjectTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private cloudProjects: Project[] = [];
  private loadState: "idle" | "loading" | "done" | "error" = "idle";
  private loadError = "";

  constructor(
    private api: ApiClient,
    private workspace: WorkspaceDetector
  ) {}

  refresh() {
    this.cloudProjects = [];
    this.loadState = "idle";
    this.loadError = "";
    this._onDidChangeTreeData.fire(undefined);
    this.prefetch();
  }

  private async prefetch() {
    if (this.loadState !== "idle") return;
    this.loadState = "loading";
    this._onDidChangeTreeData.fire(undefined);
    try {
      const result = await this.api.listProjects({ status: "active" });
      this.cloudProjects = result.projects;
      this.loadState = "done";
    } catch (err) {
      this.loadError = errorLabel(err);
      this.loadState = "error";
    }
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: ProjectTreeItem): vscode.TreeItem {
    if (element instanceof LoadingNode) {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
      item.iconPath = new vscode.ThemeIcon("loading~spin");
      return item;
    }

    if (element instanceof ProjectGroupNode) {
      const isLocal = element.group === "local";
      const item = new vscode.TreeItem(
        isLocal ? "This Workspace" : "All Projects",
        vscode.TreeItemCollapsibleState.Expanded
      );
      item.iconPath = new vscode.ThemeIcon(isLocal ? "folder" : "three-bars");
      item.contextValue = `projectGroup.${element.group}`;
      item.tooltip = isLocal
        ? "The Remb project linked to this VS Code workspace via .remb.yml"
        : "All your Remb cloud projects — click any project to activate it in this workspace";
      return item;
    }

    if (element instanceof StatusNode) {
      const item = new vscode.TreeItem(element.message, vscode.TreeItemCollapsibleState.None);
      item.iconPath = new vscode.ThemeIcon(element.icon);
      if (element.command) item.command = element.command;
      return item;
    }

    const p = element.project;
    const isActive = this.workspace.projectSlug === p.slug;
    const item = new vscode.TreeItem(p.name, vscode.TreeItemCollapsibleState.None);
    item.description = isActive ? "$(check) active" : `${p.feature_count} features`;
    item.tooltip = new vscode.MarkdownString(
      `**${p.name}** (\`${p.slug}\`)\n\n` +
      `| | |\n|---|---|\n` +
      `| Features | ${p.feature_count} |\n` +
      `| Entries | ${p.entry_count} |\n` +
      (p.repo_name ? `| Repo | ${p.repo_name} |\n` : "") +
      `| Status | ${p.status} |\n\n` +
      (isActive
        ? "_This project is active in this workspace_"
        : element.isLocal
        ? "_Linked to this workspace via .remb.yml_"
        : "_Click to set as the active project for this workspace_")
    );
    item.iconPath = new vscode.ThemeIcon(
      isActive ? "folder-active" : element.isLocal ? "folder-opened" : "symbol-namespace"
    );
    item.contextValue = isActive ? "project.active" : element.isLocal ? "project.local" : "project.cloud";
    if (!isActive && !element.isLocal) {
      item.command = {
        command: "remb.setActiveProject",
        title: "Set as Active Project",
        arguments: [p],
      };
    }
    return item;
  }

  async getChildren(element?: ProjectTreeItem): Promise<ProjectTreeItem[]> {
    if (!element) {
      return [new ProjectGroupNode("local"), new ProjectGroupNode("cloud")];
    }
    if (element instanceof ProjectGroupNode) {
      return element.group === "local" ? this.getLocalChildren() : this.getCloudChildren();
    }
    return [];
  }

  private getLocalChildren(): ProjectTreeItem[] {
    const slug = this.workspace.projectSlug;
    if (!slug) {
      return [
        new StatusNode(
          "No .remb.yml — run \"remb init\" to link this workspace",
          "add",
          { command: "remb.initProject", title: "Initialize Project" }
        ),
      ];
    }
    const localProject = this.cloudProjects.find((p) => p.slug === slug);
    if (localProject) return [new ProjectNode(localProject, true)];
    if (this.loadState === "loading") return [new LoadingNode(`${slug} (resolving…)`)];
    return [
      new StatusNode(
        `${slug} — not yet on cloud`,
        "cloud-upload",
        { command: "remb.triggerScan", title: "Push to Cloud" }
      ),
    ];
  }

  private getCloudChildren(): ProjectTreeItem[] {
    if (this.loadState === "idle" || this.loadState === "loading") {
      this.prefetch();
      return [new LoadingNode()];
    }
    if (this.loadState === "error") return [new StatusNode(this.loadError, "warning")];
    if (this.cloudProjects.length === 0) {
      return [new StatusNode("No projects yet — create one on the dashboard", "info")];
    }
    return this.cloudProjects.map((p) => new ProjectNode(p, false));
  }
}

// ── Memories Tree (project + general groups) ──────────────

type MemoryTreeItem = MemoryGroupNode | MemoryNode | MemoryStatusNode;

class MemoryGroupNode {
  constructor(
    public group: "project" | "general",
    public label: string
  ) {}
}

class MemoryNode {
  constructor(public memory: Memory) {}
}

class MemoryStatusNode {
  constructor(public message: string, public icon = "info") {}
}

export class MemoriesTreeProvider implements vscode.TreeDataProvider<MemoryTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<MemoryTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private projectMemories: Memory[] = [];
  private generalMemories: Memory[] = [];
  private loadState: "idle" | "loading" | "done" | "error" = "idle";
  private loadError = "";

  constructor(
    private api: ApiClient,
    private workspace: WorkspaceDetector
  ) {}

  refresh() {
    this.projectMemories = [];
    this.generalMemories = [];
    this.loadState = "idle";
    this.loadError = "";
    this._onDidChangeTreeData.fire(undefined);
    this.prefetch();
  }

  private async prefetch() {
    if (this.loadState !== "idle") return;
    this.loadState = "loading";
    this._onDidChangeTreeData.fire(undefined);
    try {
      const slug = this.workspace.projectSlug;
      if (slug) {
        // After the API fix, project query returns both project-scoped + global (null project_id)
        const result = await this.api.listMemories({ project: slug, limit: 100 });
        this.projectMemories = result.memories.filter((m) => m.project_id !== null);
        this.generalMemories = result.memories.filter((m) => m.project_id === null);
      } else {
        // No project linked — show all as general
        const result = await this.api.listMemories({ limit: 100 });
        this.generalMemories = result.memories;
      }
      this.loadState = "done";
    } catch (err) {
      this.loadError = errorLabel(err);
      this.loadState = "error";
    }
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: MemoryTreeItem): vscode.TreeItem {
    if (element instanceof MemoryStatusNode) {
      const item = new vscode.TreeItem(element.message, vscode.TreeItemCollapsibleState.None);
      item.iconPath = new vscode.ThemeIcon(element.icon);
      return item;
    }

    if (element instanceof MemoryGroupNode) {
      const isProject = element.group === "project";
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Expanded);
      item.iconPath = new vscode.ThemeIcon(isProject ? "folder" : "globe");
      item.contextValue = `memoryGroup.${element.group}`;
      item.tooltip = isProject
        ? "Memories scoped to this project — relevant to this specific codebase"
        : "General memories — apply across all your projects (no project scope)";
      return item;
    }

    const m = element.memory;
    const tierIcons: Record<string, string> = { core: "star-full", active: "zap", archive: "archive" };
    const item = new vscode.TreeItem(m.title, vscode.TreeItemCollapsibleState.None);
    item.description = `${m.tier} · ${m.category}`;
    item.tooltip = new vscode.MarkdownString(
      `**${m.title}**\n\n> ${m.tier} / ${m.category}\n\n${m.content.slice(0, 300)}${m.content.length > 300 ? "…" : ""}\n\n---\n*Edit or delete on the web dashboard*`
    );
    item.iconPath = new vscode.ThemeIcon(tierIcons[m.tier] ?? "note");
    item.contextValue = "memory";
    item.command = {
      command: "remb.viewMemory",
      title: "View Memory",
      arguments: [m],
    };
    return item;
  }

  async getChildren(element?: MemoryTreeItem): Promise<MemoryTreeItem[]> {
    if (this.loadState === "idle") {
      this.prefetch();
    }

    if (!element) {
      if (this.loadState === "loading") {
        return [new MemoryStatusNode("Loading…", "loading~spin")];
      }
      if (this.loadState === "error") {
        return [new MemoryStatusNode(this.loadError, "warning")];
      }
      const slug = this.workspace.projectSlug;
      const groups: MemoryTreeItem[] = [];
      if (slug) {
        groups.push(new MemoryGroupNode("project", `${slug} — Project`));
      }
      groups.push(new MemoryGroupNode("general", "General"));
      return groups;
    }

    if (element instanceof MemoryGroupNode) {
      if (this.loadState !== "done") return [new MemoryStatusNode("Loading…", "loading~spin")];
      const list = element.group === "project" ? this.projectMemories : this.generalMemories;
      if (list.length === 0) {
        return [
          new MemoryStatusNode(
            element.group === "project" ? "No project memories yet" : "No general memories yet",
            "info"
          ),
        ];
      }
      return list.map((m) => new MemoryNode(m));
    }

    return [];
  }
}

// ── MCP Servers Tree (connect/disconnect) ──────────────────

type McpTreeItem = McpServerNode | McpStatusNode;

class McpServerNode {
  constructor(public server: McpServer) {}
}

class McpStatusNode {
  constructor(public message: string, public icon: string = "info") {}
}

export class McpServersTreeProvider implements vscode.TreeDataProvider<McpTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<McpTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private servers: McpServer[] = [];
  private loadState: "idle" | "loading" | "done" | "error" = "idle";

  constructor(private api: ApiClient) {}

  refresh() {
    this.servers = [];
    this.loadState = "idle";
    this._onDidChangeTreeData.fire(undefined);
    this.prefetch();
  }

  private async prefetch() {
    if (this.loadState !== "idle") return;
    this.loadState = "loading";
    this._onDidChangeTreeData.fire(undefined);
    try {
      const result = await this.api.listMcpServers();
      this.servers = result.servers;
      this.loadState = "done";
    } catch {
      this.loadState = "error";
    }
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: McpTreeItem): vscode.TreeItem {
    if (element instanceof McpStatusNode) {
      const item = new vscode.TreeItem(element.message, vscode.TreeItemCollapsibleState.None);
      item.iconPath = new vscode.ThemeIcon(element.icon);
      return item;
    }

    const s = element.server;
    const item = new vscode.TreeItem(s.name, vscode.TreeItemCollapsibleState.None);
    item.description = s.isActive ? `${s.toolsCount} tools · connected` : "disconnected";
    item.tooltip = new vscode.MarkdownString(
      `**${s.name}**\n\n` +
      `| | |\n|---|---|\n` +
      `| URL | \`${s.url}\` |\n` +
      `| Status | ${s.isActive ? "🟢 Connected" : "⚫ Disconnected"} |\n` +
      `| Tools | ${s.toolsCount} |\n` +
      `| Health | ${s.healthStatus} |\n\n` +
      `Use the inline **Connect** / **Disconnect** buttons to toggle.`
    );
    const healthIcon = s.healthStatus === "healthy" ? "plug" : s.healthStatus === "unhealthy" ? "warning" : "circle-outline";
    item.iconPath = new vscode.ThemeIcon(s.isActive ? healthIcon : "debug-disconnect");
    // contextValue drives which inline buttons appear via package.json view/item/context menus:
    //   mcpServer.active   → shows Disconnect button
    //   mcpServer.inactive → shows Connect button
    item.contextValue = s.isActive ? "mcpServer.active" : "mcpServer.inactive";
    return item;
  }

  async getChildren(): Promise<McpTreeItem[]> {
    if (this.loadState === "idle") {
      this.prefetch();
      return [new McpStatusNode("Loading…", "loading~spin")];
    }
    if (this.loadState === "loading") {
      return [new McpStatusNode("Loading…", "loading~spin")];
    }
    if (this.loadState === "error") {
      return [new McpStatusNode("Failed to load MCP servers", "warning")];
    }
    if (this.servers.length === 0) {
      return [
        new McpStatusNode("No MCP servers connected", "info"),
        new McpStatusNode("Add servers on the web dashboard", "link-external"),
      ];
    }
    return this.servers.map((s) => new McpServerNode(s));
  }
}

// ── Context Tree ───────────────────────────────────────────

type ContextTreeItem = FeatureNode | EntryNode;

class FeatureNode {
  constructor(
    public name: string,
    public description: string | null,
    public importance: number
  ) {}
}

class EntryNode {
  constructor(public entry: ContextEntry) {}
}

export class ContextTreeProvider implements vscode.TreeDataProvider<ContextTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ContextTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private features: Array<{ name: string; description: string | null; importance: number }> = [];

  constructor(
    private api: ApiClient,
    private workspace: WorkspaceDetector
  ) {}

  refresh() {
    this.features = [];
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: ContextTreeItem): vscode.TreeItem {
    if (element instanceof FeatureNode) {
      const item = new vscode.TreeItem(element.name, vscode.TreeItemCollapsibleState.Collapsed);
      item.description = element.description?.slice(0, 60) ?? undefined;
      item.iconPath = new vscode.ThemeIcon("symbol-module");
      item.contextValue = "feature";
      return item;
    }

    const e = element.entry;
    if (!e) {
      const item = new vscode.TreeItem("(no data)", vscode.TreeItemCollapsibleState.None);
      item.iconPath = new vscode.ThemeIcon("warning");
      return item;
    }
    const entryType = e.entry_type ?? "entry";
    const content = e.content ?? "";
    const item = new vscode.TreeItem(
      `${entryType}: ${content.slice(0, 50)}${content.length > 50 ? "…" : ""}`,
      vscode.TreeItemCollapsibleState.None
    );
    item.description = e.created_at?.slice(0, 10);
    item.tooltip = new vscode.MarkdownString(`**${e.feature ?? "unknown"}** [${entryType}]\n\n${content.slice(0, 500)}`);
    item.iconPath = new vscode.ThemeIcon("file-text");
    item.contextValue = "entry";
    return item;
  }

  async getChildren(element?: ContextTreeItem): Promise<ContextTreeItem[]> {
    const slug = this.workspace.projectSlug;
    if (!slug) return [];

    if (!element) {
      if (this.features.length === 0) {
        try {
          const bundle = await this.api.bundleContext(slug);
          this.features = bundle.features;
        } catch (err) {
          const label = errorLabel(err);
          const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
          item.iconPath = new vscode.ThemeIcon("warning");
          return [item] as unknown as ContextTreeItem[];
        }
      }
      return this.features
        .sort((a, b) => b.importance - a.importance)
        .map((f) => new FeatureNode(f.name, f.description, f.importance));
    }

    if (element instanceof FeatureNode) {
      try {
        const result = await this.api.getContext({
          projectSlug: slug,
          featureName: element.name,
          limit: 10,
        });
        return result.entries.filter((e) => e != null).map((e) => new EntryNode(e));
      } catch (err) {
        const label = errorLabel(err);
        const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
        item.iconPath = new vscode.ThemeIcon("warning");
        return [item] as unknown as ContextTreeItem[];
      }
    }

    return [];
  }
}

// ── Registration ───────────────────────────────────────────

export function registerTreeViews(
  context: vscode.ExtensionContext,
  api: ApiClient,
  auth: AuthManager,
  workspace: WorkspaceDetector
) {
  const memoriesTree = new MemoriesTreeProvider(api, workspace);
  const projectsTree = new ProjectsTreeProvider(api, workspace);
  const contextTree = new ContextTreeProvider(api, workspace);
  const mcpServersTree = new McpServersTreeProvider(api);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("remb.memoriesView", memoriesTree),
    vscode.window.registerTreeDataProvider("remb.projectsView", projectsTree),
    vscode.window.registerTreeDataProvider("remb.contextView", contextTree),
    vscode.window.registerTreeDataProvider("remb.mcpServersView", mcpServersTree)
  );

  // Track event subscriptions for proper disposal
  context.subscriptions.push(
    auth.onDidChangeAuth(() => {
      memoriesTree.refresh();
      projectsTree.refresh();
      contextTree.refresh();
      mcpServersTree.refresh();
    }),
    workspace.onDidChangeProject(() => {
      contextTree.refresh();
      projectsTree.refresh();
      memoriesTree.refresh();
    }),
    // Dispose tree provider EventEmitters
    { dispose: () => memoriesTree["_onDidChangeTreeData"].dispose() },
    { dispose: () => projectsTree["_onDidChangeTreeData"].dispose() },
    { dispose: () => contextTree["_onDidChangeTreeData"].dispose() },
    { dispose: () => mcpServersTree["_onDidChangeTreeData"].dispose() },
  );

  return { memoriesTree, projectsTree, contextTree, mcpServersTree };
}
