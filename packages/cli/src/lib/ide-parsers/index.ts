import type { IDEParser, IDESource, ParsedConversation } from "./types.js";

/** Matches the RawConversationEvent shape from the server — inlined to avoid cross-package imports */
interface RawConversationEvent {
  type: "user_message" | "ai_response" | "tool_call" | "file_save" | "chat_turn" | "editor_focus";
  text?: string;
  path?: string;
  name?: string;
  timestamp?: number;
}

/* ── Parser imports ─────────────────────────────────── */
import { CursorParser } from "./cursor.js";
import { VSCodeCopilotParser } from "./vscode-copilot.js";
import { WindsurfParser } from "./windsurf.js";
import { VisualStudioParser } from "./visual-studio.js";
import { ClaudeCodeParser } from "./claude-code.js";
import { ZedParser } from "./zed.js";
import { SublimeTextParser } from "./sublime-text.js";
import { IntelliJParser } from "./intellij.js";
import { PyCharmParser } from "./pycharm.js";
import { AndroidStudioParser } from "./android-studio.js";

/* ── Exports ────────────────────────────────────────── */
export type { IDEParser, IDESource } from "./types.js";
export type { IDEProject, ParsedConversation, ConversationMessage } from "./types.js";

/** All registered parsers — one per supported IDE */
export const ALL_PARSERS: IDEParser[] = [
  new CursorParser(),
  new ClaudeCodeParser(),
  new VSCodeCopilotParser(),
  new WindsurfParser(),
  new IntelliJParser(),
  new PyCharmParser(),
  new AndroidStudioParser(),
  new VisualStudioParser(),
  new ZedParser(),
  new SublimeTextParser(),
];

/** Get a specific parser by IDE id */
export function getParser(id: IDESource): IDEParser | undefined {
  return ALL_PARSERS.find((p) => p.id === id);
}

/** Detect which IDEs are available on this machine */
export async function detectAvailableIDEs(): Promise<IDEParser[]> {
  const results = await Promise.all(
    ALL_PARSERS.map(async (parser) => {
      try {
        const available = await parser.detect();
        return available ? parser : null;
      } catch {
        return null;
      }
    }),
  );
  return results.filter((p): p is IDEParser => p !== null);
}

/**
 * Convert a ParsedConversation into RawConversationEvent[] for the smart ingestion pipeline.
 * This bridges IDE-specific parsed data → the universal Remb event format.
 */
export function conversationToEvents(conversation: ParsedConversation): RawConversationEvent[] {
  const events: RawConversationEvent[] = [];

  for (const msg of conversation.messages) {
    if (msg.role === "user") {
      events.push({
        type: "user_message",
        text: msg.text.slice(0, 2000), // Cap individual messages for LLM summarization
        timestamp: msg.timestamp,
      });
    } else if (msg.role === "assistant") {
      events.push({
        type: "ai_response",
        text: msg.text.slice(0, 4000),
        timestamp: msg.timestamp,
      });
    } else if (msg.role === "tool") {
      events.push({
        type: "tool_call",
        text: msg.text.slice(0, 500),
        name: msg.toolName,
        timestamp: msg.timestamp,
      });
    }
  }

  return events;
}
