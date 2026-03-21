import * as vscode from "vscode";
import { ApiError, type ApiClient } from "./api-client";
import type { WorkspaceDetector } from "./workspace";
import { type ConversationCapture, wrapToolWithCapture } from "./conversation-capture";
import type { EventBus } from "./event-bus";

/**
 * Registers VS Code Language Model Tools that Copilot can invoke autonomously.
 * These tools make AI agents automatically follow Remb's session protocol.
 *
 * When a `capture` instance is provided, every tool invocation is silently
 * recorded so the extension can auto-log conversation activity.
 *
 * When an `eventBus` is provided, tool invocations and results are emitted
 * as events for cross-component coordination (e.g. triggering context refreshes).
 */
export function registerLmTools(
  context: vscode.ExtensionContext,
  api: ApiClient,
  workspace: WorkspaceDetector,
  capture?: ConversationCapture,
  eventBus?: EventBus,
): void {
  /** Register a tool, optionally wrapping it with passive capture and event bus emission. */
  function reg<T>(name: string, tool: vscode.LanguageModelTool<T>): void {
    let wrapped: vscode.LanguageModelTool<T> = tool;
    if (capture) wrapped = wrapToolWithCapture(capture, name, wrapped);
    if (eventBus) {
      const inner = wrapped;
      wrapped = {
        async invoke(options, token) {
          const start = Date.now();
          eventBus.emit("tool:invoked", { toolName: name, args: options.input as Record<string, unknown>, timestamp: start });
          const result = await inner.invoke(options, token);
          eventBus.emit("tool:result", {
            toolName: name,
            args: options.input as Record<string, unknown>,
            result: null, // don't capture sensitive result data
            durationMs: Date.now() - start,
            timestamp: Date.now(),
          });
          return result;
        },
        prepareInvocation: inner.prepareInvocation?.bind(inner),
      };
    }
    context.subscriptions.push(vscode.lm.registerTool(name, wrapped));
  }
  function resolveSlug(input?: string): string | undefined {
    return input || workspace.projectSlug || undefined;
  }

  /** Return an actionable error message for the AI when auth fails. */
  function formatError(err: unknown): string {
    if (err instanceof ApiError && err.statusCode === 401) {
      return 'Error: Not authenticated. The user needs to run the "Remb: Sign In" command (remb.login) before Remb tools can be used. Tell the user to sign in.';
    }
    if (err instanceof ApiError && err.statusCode === 0) {
      return `Error: Cannot reach the Remb server. The user may be offline or the server is down. Message: ${err.message}`;
    }
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }

  function cancelled() {
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart("Operation cancelled."),
    ]);
  }

  // ── remb_loadProjectContext ───────────────────────────────

  reg("remb_loadProjectContext", new (class implements vscode.LanguageModelTool<{ projectSlug?: string }> {
        async invoke(
          options: vscode.LanguageModelToolInvocationOptions<{ projectSlug?: string }>,
          token: vscode.CancellationToken
        ) {
          if (token.isCancellationRequested) return cancelled();
          const slug = resolveSlug(options.input.projectSlug);
          if (!slug) {
            return new vscode.LanguageModelToolResult([
              new vscode.LanguageModelTextPart("Error: No project found. Open a workspace with .remb.yml or pass projectSlug."),
            ]);
          }
          try {
            const bundle = await api.bundleContext(slug);
            if (token.isCancellationRequested) return cancelled();
            return new vscode.LanguageModelToolResult([
              new vscode.LanguageModelTextPart(bundle.markdown),
            ]);
          } catch (err) {
            return new vscode.LanguageModelToolResult([
              new vscode.LanguageModelTextPart(formatError(err)),
            ]);
          }
        }

        async prepareInvocation(
          options: vscode.LanguageModelToolInvocationPrepareOptions<{ projectSlug?: string }>,
          _token: vscode.CancellationToken
        ) {
          const slug = resolveSlug(options.input.projectSlug);
          return {
            invocationMessage: `Loading project context for "${slug}"…`,
          };
        }
      })()
  );

  // ── remb_conversationHistory ──────────────────────────────

  reg("remb_conversationHistory", new (class implements vscode.LanguageModelTool<{ projectSlug?: string; limit?: number }> {
        async invoke(
          options: vscode.LanguageModelToolInvocationOptions<{ projectSlug?: string; limit?: number }>,
          token: vscode.CancellationToken
        ) {
          if (token.isCancellationRequested) return cancelled();
          try {
            const slug = resolveSlug(options.input.projectSlug);
            const result = await api.getConversationHistory({
              projectSlug: slug,
              limit: options.input.limit ?? 20,
              format: "markdown",
            });
            if (token.isCancellationRequested) return cancelled();
            if (result.entries.length === 0) {
              return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart("No conversation history found. This may be the first session."),
              ]);
            }
            const formatted = result.entries
              .map((e) => `**[${e.created_at.slice(0, 16)}]** (${e.type}) ${e.content}`)
              .join("\n\n");
            return new vscode.LanguageModelToolResult([
              new vscode.LanguageModelTextPart(`## Conversation History (${result.total} total)\n\n${formatted}`),
            ]);
          } catch (err) {
            return new vscode.LanguageModelToolResult([
              new vscode.LanguageModelTextPart(formatError(err)),
            ]);
          }
        }

        async prepareInvocation(
          _options: vscode.LanguageModelToolInvocationPrepareOptions<{ projectSlug?: string; limit?: number }>,
          _token: vscode.CancellationToken
        ) {
          return { invocationMessage: "Loading conversation history…" };
        }
      })()
  );

  // ── remb_conversationLog ──────────────────────────────────

  reg("remb_conversationLog", new (class implements vscode.LanguageModelTool<{ content: string; projectSlug?: string; type?: string }> {
        async invoke(
          options: vscode.LanguageModelToolInvocationOptions<{ content: string; projectSlug?: string; type?: string }>,
          token: vscode.CancellationToken
        ) {
          if (token.isCancellationRequested) return cancelled();
          try {
            const slug = resolveSlug(options.input.projectSlug);
            const result = await api.logConversation({
              content: options.input.content,
              projectSlug: slug,
              type: options.input.type ?? "summary",
            });
            return new vscode.LanguageModelToolResult([
              new vscode.LanguageModelTextPart(`Conversation logged (ID: ${result.id}).`),
            ]);
          } catch (err) {
            return new vscode.LanguageModelToolResult([
              new vscode.LanguageModelTextPart(formatError(err)),
            ]);
          }
        }

        async prepareInvocation(
          _options: vscode.LanguageModelToolInvocationPrepareOptions<{ content: string; projectSlug?: string; type?: string }>,
          _token: vscode.CancellationToken
        ) {
          return { invocationMessage: "Logging conversation entry…" };
        }
      })()
  );

  // ── remb_saveContext ──────────────────────────────────────

  reg("remb_saveContext", new (class implements vscode.LanguageModelTool<{ featureName: string; content: string; projectSlug?: string; entryType?: string }> {
        async invoke(
          options: vscode.LanguageModelToolInvocationOptions<{ featureName: string; content: string; projectSlug?: string; entryType?: string }>,
          token: vscode.CancellationToken
        ) {
          if (token.isCancellationRequested) return cancelled();
          const slug = resolveSlug(options.input.projectSlug);
          if (!slug) {
            return new vscode.LanguageModelToolResult([
              new vscode.LanguageModelTextPart("Error: No project found. Pass projectSlug or open a workspace with .remb.yml."),
            ]);
          }
          try {
            const result = await api.saveContext({
              projectSlug: slug,
              featureName: options.input.featureName,
              content: options.input.content,
              entryType: options.input.entryType,
            });
            return new vscode.LanguageModelToolResult([
              new vscode.LanguageModelTextPart(`Context saved for feature "${result.featureName}" (ID: ${result.id}).`),
            ]);
          } catch (err) {
            return new vscode.LanguageModelToolResult([
              new vscode.LanguageModelTextPart(formatError(err)),
            ]);
          }
        }

        async prepareInvocation(
          options: vscode.LanguageModelToolInvocationPrepareOptions<{ featureName: string; content: string; projectSlug?: string; entryType?: string }>,
          _token: vscode.CancellationToken
        ) {
          return { invocationMessage: `Saving context for "${options.input.featureName}"…` };
        }
      })()
  );

  // ── remb_getContext ───────────────────────────────────────

  reg("remb_getContext", new (class implements vscode.LanguageModelTool<{ projectSlug?: string; featureName?: string; limit?: number }> {
        async invoke(
          options: vscode.LanguageModelToolInvocationOptions<{ projectSlug?: string; featureName?: string; limit?: number }>,
          token: vscode.CancellationToken
        ) {
          if (token.isCancellationRequested) return cancelled();
          const slug = resolveSlug(options.input.projectSlug);
          if (!slug) {
            return new vscode.LanguageModelToolResult([
              new vscode.LanguageModelTextPart("Error: No project found. Pass projectSlug or open a workspace with .remb.yml."),
            ]);
          }
          try {
            const result = await api.getContext({
              projectSlug: slug,
              featureName: options.input.featureName,
              limit: options.input.limit,
            });
            if (result.entries.length === 0) {
              return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(
                  options.input.featureName
                    ? `No context entries for feature "${options.input.featureName}" in project "${slug}".`
                    : `No context entries for project "${slug}".`
                ),
              ]);
            }
            const formatted = result.entries
              .map((e) => `## ${e.feature} [${e.entry_type}]\n_${e.source} — ${e.created_at.slice(0, 10)}_\n\n${e.content}`)
              .join("\n\n---\n\n");
            return new vscode.LanguageModelToolResult([
              new vscode.LanguageModelTextPart(`Found ${result.total} entries:\n\n${formatted}`),
            ]);
          } catch (err) {
            return new vscode.LanguageModelToolResult([
              new vscode.LanguageModelTextPart(formatError(err)),
            ]);
          }
        }

        async prepareInvocation(
          options: vscode.LanguageModelToolInvocationPrepareOptions<{ projectSlug?: string; featureName?: string; limit?: number }>,
          _token: vscode.CancellationToken
        ) {
          const feature = options.input.featureName ? ` for "${options.input.featureName}"` : "";
          return { invocationMessage: `Retrieving context${feature}…` };
        }
      })()
  );

  // ── remb_listMemories ────────────────────────────────────

  reg("remb_listMemories", new (class implements vscode.LanguageModelTool<{ tier?: string; category?: string; search?: string; limit?: number }> {
        async invoke(
          options: vscode.LanguageModelToolInvocationOptions<{ tier?: string; category?: string; search?: string; limit?: number }>,
          token: vscode.CancellationToken
        ) {
          if (token.isCancellationRequested) return cancelled();
          try {
            const result = await api.listMemories({
              tier: options.input.tier,
              category: options.input.category,
              search: options.input.search,
              limit: options.input.limit ?? 20,
            });
            if (result.memories.length === 0) {
              return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart("No memories found matching the criteria."),
              ]);
            }
            const formatted = result.memories
              .map((m) => `### ${m.title} (${m.tier}/${m.category})\n${m.content}`)
              .join("\n\n---\n\n");
            return new vscode.LanguageModelToolResult([
              new vscode.LanguageModelTextPart(`## Memories (${result.total} total)\n\n${formatted}`),
            ]);
          } catch (err) {
            return new vscode.LanguageModelToolResult([
              new vscode.LanguageModelTextPart(formatError(err)),
            ]);
          }
        }

        async prepareInvocation(
          _options: vscode.LanguageModelToolInvocationPrepareOptions<{ tier?: string; category?: string; search?: string; limit?: number }>,
          _token: vscode.CancellationToken
        ) {
          return { invocationMessage: "Listing memories…" };
        }
      })()
  );

  // ── remb_createMemory ────────────────────────────────────

  reg("remb_createMemory", new (class implements vscode.LanguageModelTool<{ title: string; content: string; tier?: string; category?: string; projectSlug?: string }> {
        async invoke(
          options: vscode.LanguageModelToolInvocationOptions<{ title: string; content: string; tier?: string; category?: string; projectSlug?: string }>,
          token: vscode.CancellationToken
        ) {
          if (token.isCancellationRequested) return cancelled();
          try {
            const result = await api.createMemory({
              title: options.input.title,
              content: options.input.content,
              tier: options.input.tier,
              category: options.input.category,
              projectSlug: resolveSlug(options.input.projectSlug),
            });
            return new vscode.LanguageModelToolResult([
              new vscode.LanguageModelTextPart(`Memory created: "${result.title}" (${result.tier}/${result.category}, ID: ${result.id}).`),
            ]);
          } catch (err) {
            return new vscode.LanguageModelToolResult([
              new vscode.LanguageModelTextPart(formatError(err)),
            ]);
          }
        }

        async prepareInvocation(
          options: vscode.LanguageModelToolInvocationPrepareOptions<{ title: string; content: string; tier?: string; category?: string; projectSlug?: string }>,
          _token: vscode.CancellationToken
        ) {
          return { invocationMessage: `Creating memory "${options.input.title}"…` };
        }
      })()
  );

  // ── remb_triggerScan ─────────────────────────────────────

  reg("remb_triggerScan", new (class implements vscode.LanguageModelTool<{ projectSlug?: string }> {
        async invoke(
          options: vscode.LanguageModelToolInvocationOptions<{ projectSlug?: string }>,
          token: vscode.CancellationToken
        ) {
          if (token.isCancellationRequested) return cancelled();
          const slug = resolveSlug(options.input.projectSlug);
          if (!slug) {
            return new vscode.LanguageModelToolResult([
              new vscode.LanguageModelTextPart("Error: No project found. Pass projectSlug or open a workspace with .remb.yml."),
            ]);
          }
          try {
            const result = await api.triggerScan(slug);
            return new vscode.LanguageModelToolResult([
              new vscode.LanguageModelTextPart(
                result.status === "started"
                  ? `Scan started (ID: ${result.scanId}). Use remb_scanStatus to check progress.`
                  : `Scan status: ${result.status} — ${result.message}`
              ),
            ]);
          } catch (err) {
            return new vscode.LanguageModelToolResult([
              new vscode.LanguageModelTextPart(formatError(err)),
            ]);
          }
        }

        async prepareInvocation(
          _options: vscode.LanguageModelToolInvocationPrepareOptions<{ projectSlug?: string }>,
          _token: vscode.CancellationToken
        ) {
          return { invocationMessage: "Triggering cloud scan…" };
        }
      })()
  );

  // ── remb_scanStatus ──────────────────────────────────────

  reg("remb_scanStatus", new (class implements vscode.LanguageModelTool<{ scanId: string }> {
        async invoke(
          options: vscode.LanguageModelToolInvocationOptions<{ scanId: string }>,
          token: vscode.CancellationToken
        ) {
          if (token.isCancellationRequested) return cancelled();
          try {
            const s = await api.getScanStatus(options.input.scanId);
            const parts = [
              `**Status**: ${s.status}`,
              `**Progress**: ${s.percentage}% (${s.filesScanned}/${s.filesTotal} files)`,
              `**Features created**: ${s.featuresCreated}`,
              `**Errors**: ${s.errors}`,
            ];
            if (s.durationMs > 0) parts.push(`**Duration**: ${(s.durationMs / 1000).toFixed(1)}s`);
            return new vscode.LanguageModelToolResult([
              new vscode.LanguageModelTextPart(parts.join("\n")),
            ]);
          } catch (err) {
            return new vscode.LanguageModelToolResult([
              new vscode.LanguageModelTextPart(formatError(err)),
            ]);
          }
        }

        async prepareInvocation(
          _options: vscode.LanguageModelToolInvocationPrepareOptions<{ scanId: string }>,
          _token: vscode.CancellationToken
        ) {
          return { invocationMessage: "Checking scan progress…" };
        }
      })()
  );
}
