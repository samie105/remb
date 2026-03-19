/**
 * Mock of the VS Code API for unit testing extension modules.
 * Provides stubs for EventEmitter, SecretStorage, workspace, window, etc.
 */

export class EventEmitter<T> {
  private listeners: Array<(e: T) => void> = [];
  event = (listener: (e: T) => void) => {
    this.listeners.push(listener);
    return { dispose: () => { this.listeners = this.listeners.filter(l => l !== listener); } };
  };
  fire(data: T) { this.listeners.forEach(l => l(data)); }
  dispose() { this.listeners = []; }
}

export class Uri {
  scheme: string; authority: string; path: string; query: string; fragment: string;
  constructor(scheme: string, authority: string, path: string, query = "", fragment = "") {
    this.scheme = scheme; this.authority = authority; this.path = path;
    this.query = query; this.fragment = fragment;
  }
  get fsPath() { return this.path; }
  toString() { return `${this.scheme}://${this.authority}${this.path}`; }
  static parse(value: string) { return new Uri("https", "", value); }
  static file(path: string) { return new Uri("file", "", path); }
  static joinPath(base: Uri, ...segments: string[]) {
    return new Uri(base.scheme, base.authority, [base.path, ...segments].join("/"));
  }
}

export enum ProgressLocation { Notification = 15 }
export enum TreeItemCollapsibleState { None = 0, Collapsed = 1, Expanded = 2 }

export class ThemeColor { constructor(public id: string) {} }
export class ThemeIcon { constructor(public id: string) {} }
export class TreeItem {
  label: string; collapsibleState: TreeItemCollapsibleState;
  description?: string; tooltip?: unknown; iconPath?: unknown;
  command?: unknown; contextValue?: string; backgroundColor?: unknown;
  constructor(label: string, collapsibleState = TreeItemCollapsibleState.None) {
    this.label = label; this.collapsibleState = collapsibleState;
  }
}

class MarkdownString {
  value: string;
  constructor(value = "") { this.value = value; }
}

class StatusBarItemStub {
  text = ""; tooltip = ""; command = ""; backgroundColor: unknown;
  show() {} hide() {} dispose() {}
}

const secretStore = new Map<string, string>();

export const workspace = {
  getConfiguration: () => ({
    get: (key: string) => {
      if (key === "apiUrl") return "https://www.useremb.com";
      return undefined;
    },
  }),
  workspaceFolders: [{ uri: Uri.file("/test-workspace") }],
  onDidSaveTextDocument: (_fn: unknown) => ({ dispose: () => {} }),
  findFiles: async () => [],
  fs: {
    readFile: async () => Buffer.from(""),
    writeFile: async () => {},
    createDirectory: async () => {},
  },
  asRelativePath: (uri: unknown) => String(uri),
};

export const window = {
  showInformationMessage: async (..._args: unknown[]) => undefined,
  showWarningMessage: async (..._args: unknown[]) => undefined,
  showErrorMessage: async (..._args: unknown[]) => undefined,
  createStatusBarItem: () => new StatusBarItemStub(),
  withProgress: async (_opts: unknown, task: (p: unknown, t: { isCancellationRequested: boolean }) => Promise<unknown>) =>
    task({}, { isCancellationRequested: false }),
  registerTreeDataProvider: () => ({ dispose: () => {} }),
};

export const commands = {
  executeCommand: async (..._args: unknown[]) => {},
  registerCommand: (_id: string, _fn: unknown) => ({ dispose: () => {} }),
};

export const env = {
  openExternal: async () => true,
};

export const StatusBarAlignment = { Left: 1, Right: 2 };

export { MarkdownString };
