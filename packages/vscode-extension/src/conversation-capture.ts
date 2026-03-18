import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import type { ApiClient } from "./api-client";
import type { WorkspaceDetector } from "./workspace";
import type { AuthManager } from "./auth";

interface CaptureEvent {
  type:
    | "tool_call"
    | "file_save"
    | "editor_focus"
    | "chat_turn"
    | "user_message"
    | "ai_response";
  timestamp: number;
  data: Record<string, unknown>;
}

/** Source file extensions worth tracking (ignores build artifacts, locks, etc.) */
const SOURCE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".go", ".rs", ".java", ".kt", ".swift",
  ".css", ".scss", ".sass", ".less",
  ".html", ".vue", ".svelte",
  ".sql", ".graphql", ".gql",
  ".json", ".yaml", ".yml", ".toml", ".env",
  ".md", ".mdx",
  ".sh", ".bash", ".zsh",
]);

function isSourceFile(rel: string): boolean {
  const dot = rel.lastIndexOf(".");
  return dot !== -1 && SOURCE_EXTENSIONS.has(rel.slice(dot).toLowerCase());
}

const IGNORE_PATTERNS = [
  ".git/",
  "node_modules",
  ".remb-context",
  "remb-context.instructions.md",
  "remb-context.mdc",
  "remb-context.md",
  "CLAUDE.md",
  ".remb/",
  ".DS_Store",
  "dist/",
  // Build caches & compiler output
  ".next/",
  ".nuxt/",
  ".turbo/",
  ".vercel/",
  "turbopack",
  ".cache/",
  "__pycache__",
  ".pytest_cache",
  ".tsbuildinfo",
  "*.sst",
  "*.meta",
  // Lock files and generated assets
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
];

/** Local session log directory (inside workspace, gitignored). */
const SESSION_DIR = ".remb";
const SESSION_FILE = "session.md";

// ── Chat Session JSONL reader ─────────────────────────────────

/** Parsed turn from a VS Code chatSessions/*.jsonl file. */
interface ChatTurn {
  role: "user" | "assistant";
  text: string;
  timestamp: number;
}

/**
 * Watches the VS Code `chatSessions/` directory for JSONL changes
 * and extracts user prompts + AI responses from the append-only log.
 *
 * The JSONL format (VS Code internal, undocumented but stable since 2024):
 *   kind=0  → session header (sessionId, creationDate, etc.)
 *   kind=1  → incremental state update; k=["inputState","inputText"] = user typed text
 *   kind=2  → incremental state update; k=["requests"] = new request with message.text
 *             k=["requests",N,"response"] = AI response items
 */
class ChatSessionWatcher implements vscode.Disposable {
  private watchers: fs.FSWatcher[] = [];
  /** Tracks how many lines we've already processed per file. */
  private fileOffsets = new Map<string, number>();
  private callback: (turns: ChatTurn[]) => void;
  private offsetsFile: string | undefined;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(callback: (turns: ChatTurn[]) => void) {
    this.callback = callback;
  }

  /**
   * Resolve the chatSessions directory from the extension's storageUri.
   * Path: <workspaceStorage>/<hash>/chatSessions/
   */
  start(storageUri: vscode.Uri | undefined): void {
    if (!storageUri) return;

    // storageUri = .../workspaceStorage/<hash>/<extensionId>
    // chatSessions is at .../workspaceStorage/<hash>/chatSessions
    const wsStorageDir = path.dirname(storageUri.fsPath);
    const chatDir = path.join(wsStorageDir, "chatSessions");

    // Persist offsets alongside the chat sessions directory so they
    // survive extension restarts and editor crashes.
    this.offsetsFile = path.join(wsStorageDir, "remb-chat-offsets.json");

    if (!fs.existsSync(chatDir)) return;

    // Load persisted offsets from previous session
    const persisted = this.loadOffsets();

    // Seed offsets for all existing JSONL files
    try {
      const files = fs.readdirSync(chatDir).filter((f) => f.endsWith(".jsonl"));
      for (const file of files) {
        const fullPath = path.join(chatDir, file);
        try {
          const content = fs.readFileSync(fullPath, "utf-8");
          const lineCount = content.split("\n").filter(Boolean).length;
          const savedOffset = persisted[fullPath] ?? 0;

          if (savedOffset > 0 && savedOffset < lineCount) {
            // Lines were written while we were down — catch up silently
            const allLines = content.split("\n").filter(Boolean);
            const missed = allLines.slice(savedOffset);
            const turns = this.parseLines(missed);
            if (turns.length > 0) this.callback(turns);
          }

          // Always advance to current end-of-file
          this.fileOffsets.set(fullPath, lineCount);
        } catch { /* skip unreadable */ }
      }
    } catch { /* dir might not be readable */ }

    this.saveOffsets();

    // Watch for changes
    try {
      const watcher = fs.watch(chatDir, (eventType, filename) => {
        if (!filename || !filename.endsWith(".jsonl")) return;
        const fullPath = path.join(chatDir, filename);
        // Debounce: VS Code writes multiple lines in quick bursts
        setTimeout(() => this.readNewLines(fullPath), 500);
      });
      this.watchers.push(watcher);
    } catch { /* fs.watch might fail on some platforms */ }
  }

  private loadOffsets(): Record<string, number> {
    if (!this.offsetsFile) return {};
    try {
      return JSON.parse(fs.readFileSync(this.offsetsFile, "utf-8")) as Record<string, number>;
    } catch {
      return {};
    }
  }

  private saveOffsets(): void {
    if (!this.offsetsFile) return;
    // Debounce disk writes
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try {
        const obj: Record<string, number> = {};
        this.fileOffsets.forEach((v, k) => { obj[k] = v; });
        fs.writeFileSync(this.offsetsFile!, JSON.stringify(obj), "utf-8");
      } catch { /* best-effort */ }
    }, 300);
  }

  private readNewLines(filePath: string): void {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const allLines = content.split("\n").filter(Boolean);
      const offset = this.fileOffsets.get(filePath) ?? 0;

      if (allLines.length <= offset) return;

      const newLines = allLines.slice(offset);
      this.fileOffsets.set(filePath, allLines.length);
      this.saveOffsets(); // persist after every advance

      const turns = this.parseLines(newLines);
      if (turns.length > 0) {
        this.callback(turns);
      }
    } catch { /* file might be locked */ }
  }

  private parseLines(lines: string[]): ChatTurn[] {
    const turns: ChatTurn[] = [];
    const now = Date.now();

    for (const line of lines) {
      let obj: { kind?: number; k?: unknown[]; v?: unknown };
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }

      // kind=1 with k=["inputState","inputText"]: user typed a message
      if (obj.kind === 1) {
        const k = obj.k as string[] | undefined;
        if (
          Array.isArray(k) &&
          k[0] === "inputState" &&
          k[1] === "inputText" &&
          typeof obj.v === "string" &&
          obj.v.trim().length > 2
        ) {
          turns.push({ role: "user", text: obj.v.trim(), timestamp: now });
        }
        continue;
      }

      // kind=2 with k=["requests",N,"response"]: AI response
      if (obj.kind === 2) {
        const k = obj.k as unknown[] | undefined;
        if (!Array.isArray(k)) continue;

        // New request added: k=["requests"] with message.text
        if (k.length === 1 && k[0] === "requests" && Array.isArray(obj.v)) {
          const reqs = obj.v as Record<string, unknown>[];
          for (const req of reqs) {
            const msg = req?.message as Record<string, unknown> | undefined;
            const text = msg?.text;
            if (typeof text === "string" && text.trim().length > 2) {
              const ts = (req?.timestamp as number) ?? now;
              turns.push({ role: "user", text: text.trim(), timestamp: ts });
            }
          }
          continue;
        }

        // Response update: k=["requests",N,"response"]
        if (
          k.length === 3 &&
          k[0] === "requests" &&
          typeof k[1] === "number" &&
          k[2] === "response" &&
          Array.isArray(obj.v)
        ) {
          const items = obj.v as Record<string, unknown>[];
          // Collect text from response items (kind="?" = markdown text, "thinking" = reasoning)
          const textParts: string[] = [];
          for (const item of items) {
            if (!item || typeof item !== "object") continue;
            // The main text content items have kind undefined or kind="?"
            // They contain a `value` or `text` field with the actual content
            const val =
              (typeof item.value === "string" ? item.value : null) ??
              (typeof item.text === "string" ? item.text : null);
            if (val && val.trim()) {
              textParts.push(val.trim());
            }
          }
          if (textParts.length > 0) {
            const combined = textParts.join("\n").slice(0, 2000);
            turns.push({ role: "assistant", text: combined, timestamp: now });
          }
          continue;
        }
      }
    }

    return this.deduplicateUserMessages(turns);
  }

  /**
   * VS Code writes both kind=1 (inputText) and kind=2 (requests[].message.text)
   * for the same user message. Deduplicate by keeping only the kind=2 version
   * (it's more complete and has a timestamp).
   */
  private deduplicateUserMessages(turns: ChatTurn[]): ChatTurn[] {
    const requestTexts = new Set(
      turns
        .filter((t) => t.role === "user")
        .map((t) => t.text.slice(0, 100).toLowerCase()),
    );

    // Keep all assistant turns + user turns that aren't near-duplicates
    const seen = new Set<string>();
    return turns.filter((t) => {
      const key = `${t.role}:${t.text.slice(0, 100).toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  dispose(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveOffsets();
    this.watchers.forEach((w) => w.close());
    this.watchers = [];
  }
}

/**
 * Passively observes IDE activity — tool calls, file changes, editor focus,
 * @remb chat turns — and periodically uploads compact summaries to the
 * Remb API as conversation log entries.
 *
 * 1. **Writes immediately** to a local `.remb/session.md` file so the record
 *    survives network issues and is always up-to-date.
 * 2. **Uploads periodically** (default every 2 min) to the Remb API as
 *    conversation log entries, then refreshes instruction files so the AI
 *    always has the latest context on its next prompt.
 *
 * Explicit actions (creating memories, running scans, etc.) remain as
 * manual LM tool / MCP calls — this only captures *what happened*.
 */
export class ConversationCapture implements vscode.Disposable {
  private buffer: CaptureEvent[] = [];
  private disposables: vscode.Disposable[] = [];
  private flushTimer: ReturnType<typeof setInterval> | undefined;
  /** Rolling local session lines (kept in memory for the dynamic context feed). */
  private sessionLines: string[] = [];
  private chatWatcher: ChatSessionWatcher | undefined;

  /** Callback to trigger instruction file refresh. Set after construction. */
  private syncDynamic: (() => Promise<void>) | undefined;

  constructor(
    private api: ApiClient,
    private workspace: WorkspaceDetector,
    private auth: AuthManager,
    private storageUri: vscode.Uri | undefined,
  ) {}

  /**
   * Provide the callback that refreshes instruction files.
   * Called after InstructionsManager is created (avoids circular init).
   */
  setSyncDynamic(fn: () => Promise<void>): void {
    this.syncDynamic = fn;
  }

  /** Returns the last N session activity lines for inclusion in dynamic context. */
  getRecentActivity(limit = 30): string[] {
    return this.sessionLines.slice(-limit);
  }

  /** Start listening. Call once after all managers are initialized. */
  start(): void {
    // ── File saves ──────────────────────────────────────────
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument((doc) => {
        const rel = vscode.workspace.asRelativePath(doc.uri, false);
        if (this.shouldIgnore(rel) || !isSourceFile(rel)) return;
        this.push("file_save", { path: rel, lang: doc.languageId });
      }),
    );

    // ── Active editor changes ──────────────────────────────
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (!editor) return;
        const rel = vscode.workspace.asRelativePath(editor.document.uri, false);
        if (this.shouldIgnore(rel)) return;
        this.push("editor_focus", { path: rel });
      }),
    );

    // ── Periodic flush ─────────────────────────────────────
    const intervalMs = this.getFlushIntervalMs();
    this.flushTimer = setInterval(() => this.flush(), intervalMs);

    // ── Chat session JSONL watcher ──────────────────────────
    this.chatWatcher = new ChatSessionWatcher((turns) => {
      for (const turn of turns) {
        if (turn.role === "user") {
          this.push("user_message", { text: turn.text.slice(0, 500) });
        } else {
          this.push("ai_response", { text: turn.text.slice(0, 1500) });
        }
      }
    });
    this.chatWatcher.start(this.storageUri);
  }

  // ── Public recording methods (called externally) ──────────

  /** Record an LM tool invocation. Called by the tool capture wrapper. */
  recordToolCall(name: string, input: unknown): void {
    this.push("tool_call", {
      name,
      input: this.summarizeInput(input),
    });
  }

  /** Record a @remb chat participant turn. */
  recordChatTurn(userPrompt: string, command?: string): void {
    this.push("chat_turn", {
      command: command ?? "freeform",
      prompt: userPrompt.slice(0, 500),
    });
  }

  // ── Internals ─────────────────────────────────────────────

  private push(type: CaptureEvent["type"], data: Record<string, unknown>): void {
    const event: CaptureEvent = { type, timestamp: Date.now(), data };
    this.buffer.push(event);

    // Write to local session file immediately (non-blocking)
    this.appendToSessionFile(event).catch(() => {});
  }

  private getFlushIntervalMs(): number {
    const config = vscode.workspace.getConfiguration("remb");
    return (config.get<number>("contextRefreshIntervalMinutes") ?? 2) * 60_000;
  }

  private shouldIgnore(rel: string): boolean {
    return IGNORE_PATTERNS.some((p) => {
      if (p.startsWith("*.")) {
        return rel.endsWith(p.slice(1)); // e.g. "*.sst" → rel.endsWith(".sst")
      }
      return rel.includes(p);
    });
  }

  private summarizeInput(input: unknown): string {
    if (!input || typeof input !== "object") return "";
    const obj = input as Record<string, unknown>;
    const safe: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === "string" && v.length > 200) {
        safe[k] = v.slice(0, 200) + "…";
      } else {
        safe[k] = v;
      }
    }
    return JSON.stringify(safe);
  }

  // ── Local session file ──────────────────────────────────────

  private formatEventLine(event: CaptureEvent): string {
    const time = new Date(event.timestamp).toISOString().slice(11, 19);
    switch (event.type) {
      case "tool_call":
        return `- \`${time}\` **${event.data.name}** ${event.data.input ? String(event.data.input).slice(0, 120) : ""}`;
      case "chat_turn": {
        const cmd = event.data.command as string;
        const prompt = (event.data.prompt as string).slice(0, 120);
        return cmd !== "freeform"
          ? `- \`${time}\` @remb **/${cmd}**`
          : `- \`${time}\` chat: "${prompt}"`;
      }
      case "file_save":
        return `- \`${time}\` saved \`${event.data.path}\``;
      case "editor_focus":
        return `- \`${time}\` viewing \`${event.data.path}\``;
      case "user_message":
        return `- \`${time}\` 💬 **user**: ${(event.data.text as string).slice(0, 150)}`;
      case "ai_response":
        return `- \`${time}\` 🤖 **ai**: ${(event.data.text as string).slice(0, 200)}`;
      default:
        return `- \`${time}\` ${event.type}`;
    }
  }

  /** Append a single event to `.remb/session.md` in the workspace. */
  private async appendToSessionFile(event: CaptureEvent): Promise<void> {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!root) return;

    const dirUri = vscode.Uri.joinPath(root, SESSION_DIR);
    const fileUri = vscode.Uri.joinPath(dirUri, SESSION_FILE);

    const line = this.formatEventLine(event);
    this.sessionLines.push(line);

    // Cap memory to last 200 lines
    if (this.sessionLines.length > 200) {
      this.sessionLines.splice(0, this.sessionLines.length - 200);
    }

    try {
      await vscode.workspace.fs.createDirectory(dirUri);
    } catch { /* exists */ }

    // Read existing content (or start fresh with header)
    let existing = "";
    try {
      existing = Buffer.from(
        await vscode.workspace.fs.readFile(fileUri),
      ).toString("utf-8");
    } catch {
      const slug = this.workspace.projectSlug ?? "unknown";
      const date = new Date().toISOString().slice(0, 10);
      existing = `# Remb Session Log — ${slug}\n> ${date} | Auto-captured, do not edit\n\n`;
    }

    await vscode.workspace.fs.writeFile(
      fileUri,
      Buffer.from(existing + line + "\n", "utf-8"),
    );
  }

  /** Drain the buffer, build a summary, upload + refresh instructions. */
  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const isAuth = await this.auth.isAuthenticated();
    const slug = this.workspace.projectSlug;
    if (!isAuth || !slug) return;

    const events = this.buffer.splice(0);
    const summary = this.buildSummary(events);
    if (!summary) return;

    // Upload conversation log entry (fire-and-forget)
    this.api
      .logConversation({
        content: summary,
        projectSlug: slug,
        type: "tool_call",
      })
      .catch(() => {});

    // Refresh instruction files so the AI gets latest context
    this.syncDynamic?.().catch(() => {});
  }

  private buildSummary(events: CaptureEvent[]): string | null {
    const toolCalls = events.filter((e) => e.type === "tool_call");
    const chatTurns = events.filter((e) => e.type === "chat_turn");
    const fileSaves = events.filter((e) => e.type === "file_save");
    const userMsgs = events.filter((e) => e.type === "user_message");
    const aiResps = events.filter((e) => e.type === "ai_response");

    // Only flush if something meaningful happened
    if (
      toolCalls.length === 0 &&
      chatTurns.length === 0 &&
      fileSaves.length === 0 &&
      userMsgs.length === 0 &&
      aiResps.length === 0
    ) {
      return null;
    }

    const parts: string[] = [];

    // Conversation turns are the most valuable signal
    if (userMsgs.length > 0) {
      const prompts = userMsgs.map(
        (e) => `"${(e.data.text as string).slice(0, 120)}"`,
      );
      parts.push(`user: ${prompts.join(", ")}`);
    }

    if (aiResps.length > 0) {
      // Summarize AI responses (take just the first ~200 chars of each)
      const summaries = aiResps.map(
        (e) => (e.data.text as string).slice(0, 200),
      );
      parts.push(`ai: ${summaries.join(" | ").slice(0, 600)}`);
    }

    if (chatTurns.length > 0) {
      const cmds = chatTurns.map((e) => {
        const cmd = e.data.command as string;
        const prompt = e.data.prompt as string;
        return cmd !== "freeform" ? `/${cmd}` : `"${prompt.slice(0, 80)}"`;
      });
      parts.push(`@remb: ${cmds.join(", ")}`);
    }

    if (toolCalls.length > 0) {
      const names = [...new Set(toolCalls.map((e) => e.data.name as string))];
      parts.push(`tools: ${names.join(", ")}`);
    }

    if (fileSaves.length > 0) {
      const files = [...new Set(fileSaves.map((e) => e.data.path as string))];
      parts.push(
        `saved: ${files.slice(0, 10).join(", ")}${files.length > 10 ? ` (+${files.length - 10} more)` : ""}`,
      );
    }

    return parts.join(" | ");
  }

  dispose(): void {
    // Flush remaining events before shutdown
    this.flush().catch(() => {});
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.chatWatcher?.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}

// ── Tool capture wrapper ──────────────────────────────────────

/**
 * Wraps a LanguageModelTool so every invocation is silently recorded
 * by the ConversationCapture system. The original tool behavior is unchanged.
 */
export function wrapToolWithCapture<T>(
  capture: ConversationCapture,
  toolName: string,
  tool: vscode.LanguageModelTool<T>,
): vscode.LanguageModelTool<T> {
  return {
    async invoke(
      options: vscode.LanguageModelToolInvocationOptions<T>,
      token: vscode.CancellationToken,
    ) {
      const result = await tool.invoke(options, token);
      capture.recordToolCall(toolName, options.input);
      return result;
    },
    prepareInvocation: tool.prepareInvocation
      ? (
          options: vscode.LanguageModelToolInvocationPrepareOptions<T>,
          token: vscode.CancellationToken,
        ) => tool.prepareInvocation!(options, token)
      : undefined,
  };
}
