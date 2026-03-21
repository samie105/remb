/* ─── IDE Parser abstraction ─── */

/** All IDE sources that can be imported */
export type IDESource =
  | "cursor"
  | "claude-code"
  | "vscode"
  | "windsurf"
  | "intellij"
  | "pycharm"
  | "android-studio"
  | "visual-studio"
  | "zed"
  | "sublime-text";

/** A discoverable project/workspace inside an IDE's local storage */
export interface IDEProject {
  /** Unique identifier within the IDE (hash, folder name, etc.) */
  id: string;
  /** Human-readable project name (resolved from workspace.json, path, etc.) */
  name: string;
  /** Absolute path to the IDE storage location for this project */
  storagePath: string;
  /** Original workspace folder path if resolvable */
  workspacePath?: string;
  /** Last time the storage was modified */
  lastModified: Date;
}

/** A single parsed conversation from an IDE */
export interface ParsedConversation {
  /** Conversation-level identifier (hash, file name, session id) */
  id: string;
  /** Conversation messages in order */
  messages: ConversationMessage[];
  /** When the conversation started */
  startedAt?: Date;
  /** When the conversation ended */
  endedAt?: Date;
  /** Title or first user message summary */
  title?: string;
}

/** A single message in a conversation */
export interface ConversationMessage {
  role: "user" | "assistant" | "tool";
  text: string;
  timestamp?: number;
  /** Tool name if role is "tool" */
  toolName?: string;
}

/**
 * Every IDE parser implements this interface.
 * Each parser knows how to locate, list, and extract conversations
 * from a specific IDE's local storage format.
 */
export interface IDEParser {
  /** Unique identifier for this IDE */
  readonly id: IDESource;
  /** Display name shown to users */
  readonly displayName: string;

  /**
   * Check if this IDE's storage exists on this machine.
   * Returns true if we can find the storage directory.
   */
  detect(): Promise<boolean>;

  /**
   * List all projects/workspaces found in the IDE's storage.
   * Only call after detect() returns true.
   */
  listProjects(): Promise<IDEProject[]>;

  /**
   * Parse all conversations from a specific project.
   * Returns normalized conversation data ready for ingestion.
   */
  parseConversations(projectId: string): Promise<ParsedConversation[]>;
}
