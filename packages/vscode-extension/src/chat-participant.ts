import * as vscode from "vscode";
import type { ApiClient } from "./api-client";
import type { WorkspaceDetector } from "./workspace";
import type { ConversationCapture } from "./conversation-capture";

/**
 * @remb chat participant — provides slash commands and natural language
 * interaction for memory/context management inside Copilot Chat.
 */
export function registerChatParticipant(
  context: vscode.ExtensionContext,
  api: ApiClient,
  workspace: WorkspaceDetector,
  capture?: ConversationCapture,
): void {
  const participant = vscode.chat.createChatParticipant("remb.copilot", handler);
  participant.iconPath = new vscode.ThemeIcon("database");

  context.subscriptions.push(participant);

  async function handler(
    request: vscode.ChatRequest,
    chatContext: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<vscode.ChatResult> {
    const slug = workspace.projectSlug;

    // Passively record this chat turn
    capture?.recordChatTurn(request.prompt, request.command);

    switch (request.command) {
      case "recall":
        return handleRecall(stream, slug, token);
      case "save":
        return handleSave(request, stream, slug);
      case "memory":
        return handleMemory(request, stream, slug);
      case "scan":
        return handleScan(stream, slug);
      case "history":
        return handleHistory(stream, slug);
      default:
        return handleFreeform(request, stream, slug);
    }
  }

  async function handleRecall(
    stream: vscode.ChatResponseStream,
    slug: string | null,
    token: vscode.CancellationToken
  ): Promise<vscode.ChatResult> {
    if (!slug) {
      stream.markdown("No project detected. Open a workspace with `.remb.yml` or run `remb init`.");
      return { errorDetails: { message: "No project slug found" } };
    }

    if (token.isCancellationRequested) return {};

    stream.progress("Loading project context…");
    try {
      const [bundle, history] = await Promise.all([
        api.bundleContext(slug),
        api.getConversationHistory({ projectSlug: slug, limit: 10 }),
      ]);

      if (token.isCancellationRequested) return {};

      stream.markdown(`## Project Context: ${slug}\n\n`);
      stream.markdown(bundle.markdown);

      if (history.entries.length > 0) {
        stream.markdown("\n\n---\n\n## Recent Conversation History\n\n");
        for (const entry of history.entries) {
          stream.markdown(`**[${entry.created_at.slice(0, 16)}]** (${entry.type}) ${entry.content}\n\n`);
        }
      }
    } catch (err) {
      stream.markdown(`Error loading context: ${err instanceof Error ? err.message : String(err)}`);
      return { errorDetails: { message: err instanceof Error ? err.message : "Unknown error" } };
    }
    return {};
  }

  async function handleSave(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    slug: string | null
  ): Promise<vscode.ChatResult> {
    if (!slug) {
      stream.markdown("No project detected. Open a workspace with `.remb.yml`.");
      return { errorDetails: { message: "No project slug found" } };
    }

    const prompt = request.prompt.trim();
    if (!prompt) {
      stream.markdown("Usage: `@remb /save <feature-name>: <context description>`\n\nExample: `@remb /save auth-flow: Uses NextAuth with GitHub OAuth provider`");
      return { errorDetails: { message: "No input provided" } };
    }

    // Parse "featureName: content" format
    const colonIdx = prompt.indexOf(":");
    if (colonIdx === -1) {
      stream.markdown("Please use the format: `@remb /save <feature-name>: <description>`");
      return { errorDetails: { message: "Invalid format" } };
    }

    const featureName = prompt.slice(0, colonIdx).trim();
    const content = prompt.slice(colonIdx + 1).trim();

    if (!featureName || !content) {
      stream.markdown("Both feature name and content are required.");
      return { errorDetails: { message: "Missing feature name or content" } };
    }

    stream.progress(`Saving context for "${featureName}"…`);
    try {
      const result = await api.saveContext({
        projectSlug: slug,
        featureName,
        content,
      });
      stream.markdown(`Context saved for **${result.featureName}** (ID: \`${result.id}\`).`);
    } catch (err) {
      stream.markdown(`Error: ${err instanceof Error ? err.message : String(err)}`);
      return { errorDetails: { message: err instanceof Error ? err.message : "Unknown error" } };
    }
    return {};
  }

  async function handleMemory(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    slug: string | null
  ): Promise<vscode.ChatResult> {
    const prompt = request.prompt.trim();

    if (!prompt || prompt === "list") {
      stream.progress("Loading memories…");
      try {
        const result = await api.listMemories({ limit: 20 });
        if (result.memories.length === 0) {
          stream.markdown("No memories found. Create one with `@remb /memory create: <title> | <content>`");
          return {};
        }
        stream.markdown(`## Memories (${result.total} total)\n\n`);
        for (const m of result.memories) {
          stream.markdown(`### ${m.title} \`${m.tier}/${m.category}\`\n${m.content}\n\n`);
        }
      } catch (err) {
        stream.markdown(`Error: ${err instanceof Error ? err.message : String(err)}`);
        return { errorDetails: { message: err instanceof Error ? err.message : "Unknown error" } };
      }
      return {};
    }

    if (prompt.startsWith("create:")) {
      const body = prompt.slice("create:".length).trim();
      const pipeIdx = body.indexOf("|");
      const title = pipeIdx !== -1 ? body.slice(0, pipeIdx).trim() : body.slice(0, 60);
      const content = pipeIdx !== -1 ? body.slice(pipeIdx + 1).trim() : body;

      stream.progress(`Creating memory "${title}"…`);
      try {
        const result = await api.createMemory({
          title,
          content,
          projectSlug: slug ?? undefined,
        });
        stream.markdown(`Memory created: **${result.title}** (${result.tier}/${result.category}, ID: \`${result.id}\`)`);
      } catch (err) {
        stream.markdown(`Error: ${err instanceof Error ? err.message : String(err)}`);
        return { errorDetails: { message: err instanceof Error ? err.message : "Unknown error" } };
      }
      return {};
    }

    // Treat as search
    stream.progress(`Searching memories for "${prompt}"…`);
    try {
      const result = await api.listMemories({ search: prompt, limit: 10 });
      if (result.memories.length === 0) {
        stream.markdown(`No memories found matching "${prompt}".`);
        return {};
      }
      stream.markdown(`## Search Results (${result.total} matches)\n\n`);
      for (const m of result.memories) {
        stream.markdown(`### ${m.title} \`${m.tier}/${m.category}\`\n${m.content}\n\n`);
      }
    } catch (err) {
      stream.markdown(`Error: ${err instanceof Error ? err.message : String(err)}`);
      return { errorDetails: { message: err instanceof Error ? err.message : "Unknown error" } };
    }
    return {};
  }

  async function handleScan(
    stream: vscode.ChatResponseStream,
    slug: string | null
  ): Promise<vscode.ChatResult> {
    if (!slug) {
      stream.markdown("No project detected. Open a workspace with `.remb.yml`.");
      return { errorDetails: { message: "No project slug found" } };
    }

    stream.progress("Triggering cloud scan…");
    try {
      const result = await api.triggerScan(slug);
      if (result.status === "started") {
        stream.markdown(`Scan started for **${slug}** (ID: \`${result.scanId}\`).\n\nUse the \`remb_scanStatus\` tool to check progress.`);
      } else {
        stream.markdown(`Scan: ${result.status} — ${result.message}`);
      }
    } catch (err) {
      stream.markdown(`Error: ${err instanceof Error ? err.message : String(err)}`);
      return { errorDetails: { message: err instanceof Error ? err.message : "Unknown error" } };
    }
    return {};
  }

  async function handleHistory(
    stream: vscode.ChatResponseStream,
    slug: string | null
  ): Promise<vscode.ChatResult> {
    stream.progress("Loading conversation history…");
    try {
      const result = await api.getConversationHistory({
        projectSlug: slug ?? undefined,
        limit: 20,
      });
      if (result.entries.length === 0) {
        stream.markdown("No conversation history found. AI sessions log here automatically via MCP.");
        return {};
      }
      stream.markdown(`## Conversation History (${result.total} total)\n\n`);
      for (const entry of result.entries) {
        stream.markdown(`**[${entry.created_at.slice(0, 16)}]** (${entry.type}) ${entry.content}\n\n`);
      }
    } catch (err) {
      stream.markdown(`Error: ${err instanceof Error ? err.message : String(err)}`);
      return { errorDetails: { message: err instanceof Error ? err.message : "Unknown error" } };
    }
    return {};
  }

  async function handleFreeform(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    slug: string | null
  ): Promise<vscode.ChatResult> {
    stream.markdown(
      "**Remb Commands:**\n\n" +
        "- `/recall` — Load project context and recent history\n" +
        "- `/save <feature>: <description>` — Save context for a feature\n" +
        "- `/memory` — List, create, or search memories\n" +
        "- `/scan` — Trigger a cloud scan\n" +
        "- `/history` — View conversation history\n\n" +
        `Current project: ${slug ? `**${slug}**` : "_none detected_"}`
    );
    return {};
  }
}
