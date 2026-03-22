"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  SparklesIcon,
  Cancel01Icon,
  Loading03Icon,
  ArrowExpand01Icon,
  ArrowShrink01Icon,
  MinusSignIcon,
  ArrowUp01Icon,
  ArrowDown01Icon,
  File01Icon,
  Attachment01Icon,
  FolderLibraryIcon,
  MessageMultiple02Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";
import { useRouter, usePathname } from "next/navigation";
import {
  useChatStore,
  openChat,
  expandChat,
  minimizeChat,
  closeChat,
  addMessage,
  updateLastAssistantMessage,
  setStreaming,
  setDetectedProjects,
  setActiveProject,
  setContextFiles,
  addUploadedFile,
  removeUploadedFile,
  removeContextFile,
  setPanel,
  setConversations,
  setActiveConversation,
  toggleConversationList,
  setShowConversationList,
  newConversation,
  setMessages,
  setModelMode,
  setModelUsage,
  removeConversation,
  editMessage,
  removeMessagesFrom,
  type ChatMessage,
  type DetectedProject,
  type ConversationSummary,
  type ModelUsage,
} from "@/lib/chat-store";
import { useIsMobile } from "@/hooks/use-mobile";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FileContextPicker } from "@/components/dashboard/plan/file-context-picker";
import { ChatPanelRenderer } from "@/components/dashboard/chat-panel";
import { ToolIndicator, type ToolCallEvent } from "@/components/dashboard/chat/tool-indicator";
import { ModelSelector } from "@/components/dashboard/chat/model-selector";
import { MessageBubble } from "@/components/dashboard/chat/message-bubble";
import { ConversationList, ConversationListHeader } from "@/components/dashboard/chat/conversation-list";
import { EmptyState } from "@/components/dashboard/chat/empty-state";

/* ─── native action handlers ─── */

interface NativeAction {
  type: "theme" | "navigate" | "back";
  payload?: string;
}

function parseNativeActions(text: string): NativeAction[] {
  const actions: NativeAction[] = [];
  const themeMatch = text.match(/\[ACTION:theme:(dark|light|system)\]/g);
  if (themeMatch) {
    for (const m of themeMatch) {
      const mode = m.match(/:(dark|light|system)\]/)?.[1];
      if (mode) actions.push({ type: "theme", payload: mode });
    }
  }
  const navMatch = text.match(/\[ACTION:navigate:([^\]]+)\]/g);
  if (navMatch) {
    for (const m of navMatch) {
      const route = m.match(/navigate:([^\]]+)\]/)?.[1];
      if (route) actions.push({ type: "navigate", payload: route });
    }
  }
  if (text.includes("[ACTION:back]")) {
    actions.push({ type: "back" });
  }
  return actions;
}

function stripActionTags(text: string): string {
  return text.replace(/\[ACTION:[^\]]+\]/g, "").trim();
}

/* ─── project detection ─── */

async function detectProjects(message: string): Promise<DetectedProject[]> {
  try {
    const res = await fetch("/api/plan/detect-projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: message }),
    });
    if (!res.ok) return [];
    return (await res.json()) as DetectedProject[];
  } catch {
    return [];
  }
}

/* ─── conversation history loader ─── */

async function loadConversations(): Promise<ConversationSummary[]> {
  try {
    const res = await fetch("/api/chat/conversations");
    if (!res.ok) return [];
    const data = (await res.json()) as { conversations: ConversationSummary[] };
    return data.conversations;
  } catch {
    return [];
  }
}

async function loadConversationMessages(conversationId: string): Promise<ChatMessage[]> {
  try {
    const res = await fetch(`/api/chat/conversations/${encodeURIComponent(conversationId)}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { messages: ChatMessage[] };
    return data.messages;
  } catch {
    return [];
  }
}

/* ─── file upload config ─── */

const ALLOWED_EXTENSIONS = new Set([
  ".txt", ".md", ".mdx", ".json", ".csv", ".yml", ".yaml", ".xml",
  ".ts", ".tsx", ".js", ".jsx", ".py", ".rb", ".go", ".rs", ".java",
  ".c", ".cpp", ".h", ".hpp", ".cs", ".swift", ".kt", ".php",
  ".html", ".css", ".scss", ".less", ".sass",
  ".sql", ".sh", ".bash", ".zsh", ".fish",
  ".toml", ".ini", ".cfg", ".conf", ".env", ".env.local",
  ".gitignore", ".dockerignore", ".editorconfig",
  ".lock", ".log",
]);

const MAX_FILE_SIZE = 100 * 1024; // 100KB

function isReadableFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  // Match extension
  if ([...ALLOWED_EXTENSIONS].some((ext) => lower.endsWith(ext))) return true;
  // Files without extensions that are typically readable
  const baseName = lower.split("/").pop() ?? "";
  if (["makefile", "dockerfile", "readme", "license", "changelog", "procfile"].includes(baseName)) return true;
  return false;
}

/* ─── main component ─── */

export function GlobalChat() {
  const chat = useChatStore();
  const { setTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const isMobile = useIsMobile();

  const [input, setInput] = React.useState("");
  const [toolCalls, setToolCalls] = React.useState<ToolCallEvent[]>([]);
  const [showFilePicker, setShowFilePicker] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = React.useState(true);

  // Load conversations + usage on first open
  React.useEffect(() => {
    if (chat.windowState !== "pill" && !chat.conversationsLoaded) {
      loadConversations().then(setConversations);
    }
    if (chat.windowState !== "pill" && chat.modelUsage.length === 0) {
      fetch("/api/chat/usage")
        .then((r) => r.json())
        .then((d: { usage: ModelUsage[] }) => setModelUsage(d.usage))
        .catch(() => {});
    }
  }, [chat.windowState, chat.conversationsLoaded, chat.modelUsage.length]);

  // Derive active project ID from path for file picker
  const pathProjectId = React.useMemo(() => {
    const match = pathname.match(/^\/dashboard\/([^/]+)/);
    if (!match || match[1] === "settings") return "";
    return match[1]; // slug, not ID — file picker will handle this
  }, [pathname]);

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      if (!isReadableFile(file.name)) {
        continue; // silently skip non-readable files
      }
      if (file.size > MAX_FILE_SIZE) {
        continue; // skip files over 100KB
      }
      const reader = new FileReader();
      reader.onload = () => {
        const content = reader.result as string;
        addUploadedFile({
          id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: file.name,
          content,
          size: file.size,
        });
      };
      reader.readAsText(file);
    }
    // Reset so same file can be re-selected
    e.target.value = "";
  }

  const hasContext = chat.contextFiles.length > 0 || chat.uploadedFiles.length > 0;

  const executeActions = React.useCallback(
    (actions: NativeAction[]) => {
      for (const action of actions) {
        switch (action.type) {
          case "theme":
            if (action.payload) setTheme(action.payload);
            break;
          case "navigate":
            if (action.payload) router.push(action.payload);
            break;
          case "back":
            router.back();
            break;
        }
      }
    },
    [setTheme, router],
  );

  React.useEffect(() => {
    if (isAtBottom && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chat.messages, toolCalls, isAtBottom]);

  React.useEffect(() => {
    if (chat.windowState !== "pill") {
      setTimeout(() => textareaRef.current?.focus(), 150);
    }
  }, [chat.windowState]);

  function handleScroll() {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setIsAtBottom(scrollHeight - scrollTop - clientHeight < 80);
  }

  function scrollToBottom() {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }

  async function handleLoadConversation(convo: ConversationSummary) {
    setActiveConversation(convo.id);
    setShowConversationList(false);
    const msgs = await loadConversationMessages(convo.id);
    setMessages(msgs);
  }

  async function handleDeleteConversation(convo: ConversationSummary) {
    try {
      await fetch(`/api/chat/conversations/${convo.id}`, { method: "DELETE" });
      removeConversation(convo.id);
    } catch {
      /* silently fail */
    }
  }

  function handleEditMessage(messageId: string, newContent: string) {
    editMessage(messageId, newContent);
    // Re-send with the edited content
    const text = newContent.trim();
    if (!text) return;
    // Remove the assistant reply that followed it (already truncated by editMessage)
    sendMessage(text);
  }

  function handleRetryLastMessage() {
    // Find the last user message
    const lastUserMsg = [...chat.messages].reverse().find((m) => m.role === "user");
    if (!lastUserMsg) return;
    // Remove everything from the last assistant message onwards
    const lastAssistant = [...chat.messages].reverse().find((m) => m.role === "assistant");
    if (lastAssistant) removeMessagesFrom(lastAssistant.id);
    sendMessage(lastUserMsg.content);
  }

  async function sendMessage(text: string) {
    if (!text.trim() || chat.isStreaming) return;
    setToolCalls([]);
    setIsAtBottom(true);

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    addMessage(userMsg);

    detectProjects(text).then((projects) => {
      if (projects.length > 0) {
        setDetectedProjects(projects);
        if (projects.length === 1) setActiveProject(projects[0].id);
      }
    });

    const assistantMsg: ChatMessage = {
      id: `assistant-${Date.now()}`,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
    };
    addMessage(assistantMsg);
    setStreaming(true);

    try {
      // Build history from existing messages (excluding the just-added empty assistant)
      const history = chat.messages
        .filter((m) => m.role === "user" || (m.role === "assistant" && m.content))
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history,
          projectId: chat.activeProjectId,
          currentPath: pathname,
          conversationId: chat.activeConversationId,
          modelMode: chat.modelMode,
          contextFiles: chat.contextFiles.length > 0 ? chat.contextFiles : undefined,
          uploadedFiles: chat.uploadedFiles.length > 0
            ? chat.uploadedFiles.map((f) => ({ name: f.name, content: f.content }))
            : undefined,
        }),
      });

      if (res.status === 429) {
        const errorData = (await res.json()) as { error: string; message: string; usage?: ModelUsage[] };
        updateLastAssistantMessage(errorData.message);
        if (errorData.usage) setModelUsage(errorData.usage);
        return;
      }
      if (!res.ok) throw new Error(await res.text());

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");

      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let currentEvent = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7);
          } else if (line.startsWith("data: ") && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));

              switch (currentEvent) {
                case "text":
                  fullContent += data.content as string;
                  updateLastAssistantMessage(fullContent);
                  break;
                case "tool_call":
                  setToolCalls((prev) => [
                    ...prev,
                    {
                      id: `tc-${Date.now()}-${Math.random()}`,
                      name: data.name as string,
                      status: "calling",
                    },
                  ]);
                  break;
                case "tool_result": {
                  const resultData = data as { name: string; result: string; action?: { type: string; payload?: string } };
                  setToolCalls((prev) =>
                    prev.map((tc) =>
                      tc.name === resultData.name && tc.status === "calling"
                        ? { ...tc, status: "done" as const }
                        : tc,
                    ),
                  );
                  if (resultData.action) {
                    const { type, payload } = resultData.action;
                    if (type === "theme" && payload) executeActions([{ type: "theme", payload }]);
                    if (type === "navigate" && payload) executeActions([{ type: "navigate", payload }]);
                  }
                  break;
                }
                case "error":
                  updateLastAssistantMessage(`Error: ${data.message}`);
                  break;
                case "panel":
                  setPanel(data as { id: string; type: "plan"; title: string; data: Record<string, unknown> });
                  // Auto-expand to full if showing a panel in mini mode
                  if (chat.windowState === "mini") expandChat();
                  break;
                case "conversation_id":
                  setActiveConversation(data.id as string);
                  break;
                case "usage":
                  if (Array.isArray(data.usage)) {
                    setModelUsage(data.usage as ModelUsage[]);
                  }
                  break;
              }
            } catch {
              /* skip malformed */
            }
            currentEvent = "";
          }
        }
      }

      // Strip action tags from final content
      const actions = parseNativeActions(fullContent);
      if (actions.length > 0) {
        executeActions(actions);
        const cleaned = stripActionTags(fullContent);
        updateLastAssistantMessage(cleaned);
      }

      // Refresh conversation list in background
      loadConversations().then(setConversations);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Something went wrong";
      updateLastAssistantMessage(`Sorry, I ran into an error: ${errMsg}`);
    } finally {
      setStreaming(false);
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || chat.isStreaming) return;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "36px";
    await sendMessage(text);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const hasInput = input.trim().length > 0;

  // ─── Pill state ───
  if (chat.windowState === "pill") {
    return (
      <motion.button
        onClick={openChat}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-foreground px-4 py-2.5 text-background shadow-lg shadow-black/10 transition-all hover:shadow-xl hover:scale-105 active:scale-95"
      >
        <HugeiconsIcon icon={SparklesIcon} className="size-4" />
        <span className="text-sm font-medium">Ask AI</span>
      </motion.button>
    );
  }

  // ─── Mini state ───
  if (chat.windowState === "mini") {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ y: 20, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 20, opacity: 0, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-background/95 backdrop-blur-xl shadow-2xl shadow-black/8",
            isMobile
              ? "inset-x-3 bottom-3 top-auto max-h-[70vh]"
              : "bottom-6 right-6 w-95 h-130",
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 shrink-0">
            <div className="flex items-center gap-2">
              <div className="flex size-6 items-center justify-center rounded-lg bg-foreground/5">
                <HugeiconsIcon icon={SparklesIcon} className="size-3.5 text-foreground" />
              </div>
              <span className="text-sm font-semibold text-foreground">Remb AI</span>
              <ModelSelector
                modelMode={chat.modelMode}
                usage={chat.modelUsage}
                onModelChange={setModelMode}
                compact
              />
            </div>
            <div className="flex items-center gap-0.5">
              <button
                onClick={toggleConversationList}
                className={cn(
                  "rounded-lg p-1.5 transition-colors",
                  chat.showConversationList
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <HugeiconsIcon icon={MessageMultiple02Icon} className="size-3.5" />
              </button>
              <button
                onClick={expandChat}
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <HugeiconsIcon icon={ArrowExpand01Icon} className="size-3.5" />
              </button>
              <button
                onClick={closeChat}
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <HugeiconsIcon icon={MinusSignIcon} className="size-3.5" />
              </button>
            </div>
          </div>

          <div className="mx-4 h-px bg-border/40" />

          {/* Conversation list overlay (mini) */}
          <AnimatePresence>
            {chat.showConversationList && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="absolute inset-x-0 top-12 bottom-0 z-20 bg-background/98 backdrop-blur-sm overflow-hidden flex flex-col"
              >
                <ConversationListHeader onNew={newConversation} compact />
                <ConversationList
                  conversations={chat.conversations}
                  activeId={chat.activeConversationId}
                  onSelect={handleLoadConversation}
                  onDelete={handleDeleteConversation}
                  onNew={newConversation}
                  compact
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Messages */}
          <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {chat.messages.length === 0 ? (
              <EmptyState variant="mini" />
            ) : (
              chat.messages.map((msg, i) => (
                <React.Fragment key={msg.id}>
                  {msg.role === "assistant" && i === chat.messages.length - 1 && toolCalls.length > 0 && (
                    <ToolIndicator toolCalls={toolCalls} compact />
                  )}
                  <MessageBubble
                    message={msg}
                    isLastAssistant={msg.role === "assistant" && i === chat.messages.length - 1}
                    isStreaming={chat.isStreaming}
                    onEdit={handleEditMessage}
                    onRetry={handleRetryLastMessage}
                  />
                </React.Fragment>
              ))
            )}
            {chat.isStreaming && !chat.messages[chat.messages.length - 1]?.content && toolCalls.length === 0 && (
              <ThinkingDots />
            )}
          </div>

          {/* Scroll-to-bottom */}
          <AnimatePresence>
            {!isAtBottom && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10"
              >
                <button onClick={scrollToBottom} className="rounded-full border border-border bg-background p-1.5 shadow-md text-muted-foreground hover:text-foreground transition-colors">
                  <HugeiconsIcon icon={ArrowDown01Icon} className="size-3" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Project picker */}
          <AnimatePresence>
            {chat.detectedProjects.length > 1 && !chat.activeProjectId && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden border-t border-border/40 shrink-0"
              >
                <div className="px-4 py-2.5">
                  <p className="text-[11px] font-medium text-muted-foreground mb-1.5">Which project?</p>
                  <div className="flex flex-wrap gap-1.5">
                    {chat.detectedProjects.map((p) => (
                      <button key={p.id} onClick={() => setActiveProject(p.id)} className="rounded-lg border border-border/60 bg-muted/30 px-2.5 py-1 text-xs font-medium text-foreground transition-all hover:bg-accent hover:border-border">
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mx-4 h-px bg-border/40" />

          {/* Context chips */}
          {hasContext && (
            <div className="px-3 pt-2 shrink-0">
              <div className="flex flex-wrap gap-1">
                {chat.contextFiles.map((f) => (
                  <span key={f.path} className="inline-flex items-center gap-1 rounded-md bg-muted/50 border border-border/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    <HugeiconsIcon icon={File01Icon} className="size-2.5" />
                    <span className="max-w-24 truncate">{f.path.split("/").pop()}</span>
                    <button onClick={() => removeContextFile(f.path)} className="hover:text-foreground ml-0.5">
                      <HugeiconsIcon icon={Cancel01Icon} className="size-2" />
                    </button>
                  </span>
                ))}
                {chat.uploadedFiles.map((f) => (
                  <span key={f.id} className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 text-[10px] text-blue-600 dark:text-blue-400">
                    <HugeiconsIcon icon={Attachment01Icon} className="size-2.5" />
                    <span className="max-w-24 truncate">{f.name}</span>
                    <button onClick={() => removeUploadedFile(f.id)} className="hover:text-foreground ml-0.5">
                      <HugeiconsIcon icon={Cancel01Icon} className="size-2" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="px-3 py-2.5 shrink-0">
            <div className="rounded-xl border border-border/50 bg-muted/20 transition-all focus-within:border-border focus-within:ring-1 focus-within:ring-ring/20">
              <div className="flex items-end gap-2 px-3 py-2">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 80)}px`;
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything..."
                  className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
                  rows={1}
                  style={{ minHeight: "20px", maxHeight: "80px" }}
                  disabled={chat.isStreaming}
                />
                <button
                  onClick={handleSend}
                  disabled={!hasInput || chat.isStreaming}
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-lg transition-all",
                    hasInput
                      ? "text-foreground hover:bg-accent"
                      : "text-muted-foreground/30",
                    chat.isStreaming && "text-muted-foreground/30",
                  )}
                >
                  {chat.isStreaming ? (
                    <HugeiconsIcon icon={Loading03Icon} className="size-4 animate-spin" />
                  ) : (
                    <HugeiconsIcon icon={ArrowUp01Icon} className="size-4" />
                  )}
                </button>
              </div>
              {/* Toolbar */}
              <div className="flex items-center gap-0.5 px-2 pb-1.5 border-t border-border/30 pt-1.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setShowFilePicker(true)}
                      className="rounded-md p-1 text-muted-foreground/50 hover:text-muted-foreground hover:bg-accent transition-colors"
                    >
                      <HugeiconsIcon icon={FolderLibraryIcon} className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-[11px]">Add project files</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="rounded-md p-1 text-muted-foreground/50 hover:text-muted-foreground hover:bg-accent transition-colors"
                    >
                      <HugeiconsIcon icon={Attachment01Icon} className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-[11px]">Upload a file</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".txt,.md,.mdx,.json,.csv,.yml,.yaml,.xml,.ts,.tsx,.js,.jsx,.py,.rb,.go,.rs,.java,.c,.cpp,.h,.hpp,.cs,.swift,.kt,.php,.html,.css,.scss,.less,.sql,.sh,.bash,.toml,.ini,.cfg,.conf,.env,.log"
            onChange={handleFileUpload}
            className="hidden"
          />

          {/* File context picker */}
          <FileContextPicker
            open={showFilePicker}
            onOpenChange={setShowFilePicker}
            currentProjectId={chat.activeProjectId ?? pathProjectId}
            selectedFiles={chat.contextFiles}
            onFilesChange={setContextFiles}
          />
        </motion.div>
      </AnimatePresence>
    );
  }

  // ─── Full state ───
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-50 flex bg-background"
      >
        {/* Conversation sidebar */}
        <AnimatePresence>
          {chat.showConversationList && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 280, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 35 }}
              className="shrink-0 border-r border-border/40 bg-muted/20 overflow-hidden flex flex-col"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
                <span className="text-xs font-semibold text-foreground">Conversations</span>
                <ConversationListHeader onNew={newConversation} />
              </div>
              <ConversationList
                conversations={chat.conversations}
                activeId={chat.activeConversationId}
                onSelect={handleLoadConversation}
                onDelete={handleDeleteConversation}
                onNew={newConversation}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main chat area */}
        <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-border/40 px-6 py-3 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={toggleConversationList}
              className={cn(
                "rounded-xl p-2 transition-colors",
                chat.showConversationList
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <HugeiconsIcon icon={MessageMultiple02Icon} className="size-4" />
            </button>
            <div className="flex size-8 items-center justify-center rounded-xl bg-foreground/5">
              <HugeiconsIcon icon={SparklesIcon} className="size-4 text-foreground" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Remb AI</h2>
              {chat.activeProjectId && chat.detectedProjects.length > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  {chat.detectedProjects.find((p) => p.id === chat.activeProjectId)?.name}
                </p>
              )}
            </div>
            <ModelSelector
              modelMode={chat.modelMode}
              usage={chat.modelUsage}
              onModelChange={setModelMode}
            />
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={minimizeChat}
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <HugeiconsIcon icon={ArrowShrink01Icon} className="size-4" />
            </button>
            <button
              onClick={closeChat}
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
            </button>
          </div>
        </div>

        {/* Main content + panel */}
        <div className="flex flex-1 overflow-hidden">
          {/* Chat column */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Messages */}
            <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
              <div className="mx-auto max-w-2xl px-6 py-6 space-y-4">
            {chat.messages.length === 0 ? (
              <EmptyState variant="full" />
            ) : (
              chat.messages.map((msg, i) => (
                <React.Fragment key={msg.id}>
                  {msg.role === "assistant" && i === chat.messages.length - 1 && toolCalls.length > 0 && (
                    <ToolIndicator toolCalls={toolCalls} />
                  )}
                  <MessageBubble
                    message={msg}
                    variant="full"
                    isLastAssistant={msg.role === "assistant" && i === chat.messages.length - 1}
                    isStreaming={chat.isStreaming}
                    onEdit={handleEditMessage}
                    onRetry={handleRetryLastMessage}
                  />
                </React.Fragment>
              ))
            )}
            {chat.isStreaming && !chat.messages[chat.messages.length - 1]?.content && toolCalls.length === 0 && (
              <ThinkingDots />
            )}
            {chat.isStreaming && chat.messages[chat.messages.length - 1]?.content && (
              <span className="inline-block w-1.5 h-4 bg-foreground/40 rounded-sm animate-pulse ml-0.5" />
            )}
          </div>
        </div>

        {/* Scroll-to-bottom FAB */}
        <AnimatePresence>
          {!isAtBottom && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="absolute bottom-24 left-1/2 -translate-x-1/2 z-10"
            >
              <button onClick={scrollToBottom} className="rounded-full border border-border bg-background p-2 shadow-lg text-muted-foreground hover:text-foreground transition-colors">
                <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Project picker */}
        <AnimatePresence>
          {chat.detectedProjects.length > 1 && !chat.activeProjectId && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-t border-border/40 shrink-0"
            >
              <div className="mx-auto max-w-2xl px-6 py-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">Multiple projects detected — which one?</p>
                <div className="flex flex-wrap gap-2">
                  {chat.detectedProjects.map((p) => (
                    <button key={p.id} onClick={() => setActiveProject(p.id)} className="rounded-xl border border-border/60 bg-muted/30 px-3 py-1.5 text-xs font-medium text-foreground transition-all hover:bg-accent hover:border-border">
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input */}
        <div className="border-t border-border/40 px-6 py-4 shrink-0">
          <div className="mx-auto max-w-2xl">
            {/* Context chips */}
            {hasContext && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {chat.contextFiles.map((f) => (
                  <span key={f.path} className="inline-flex items-center gap-1 rounded-lg bg-muted/50 border border-border/40 px-2 py-1 text-[11px] text-muted-foreground">
                    <HugeiconsIcon icon={File01Icon} className="size-3" />
                    <span className="max-w-40 truncate" title={f.path}>{f.path.split("/").pop()}</span>
                    <span className="text-[9px] text-muted-foreground/50">{f.projectName}</span>
                    <button onClick={() => removeContextFile(f.path)} className="hover:text-foreground ml-0.5">
                      <HugeiconsIcon icon={Cancel01Icon} className="size-2.5" />
                    </button>
                  </span>
                ))}
                {chat.uploadedFiles.map((f) => (
                  <span key={f.id} className="inline-flex items-center gap-1 rounded-lg bg-blue-500/10 border border-blue-500/20 px-2 py-1 text-[11px] text-blue-600 dark:text-blue-400">
                    <HugeiconsIcon icon={Attachment01Icon} className="size-3" />
                    <span className="max-w-40 truncate">{f.name}</span>
                    <span className="text-[9px] opacity-50">{(f.size / 1024).toFixed(0)}KB</span>
                    <button onClick={() => removeUploadedFile(f.id)} className="hover:text-foreground ml-0.5">
                      <HugeiconsIcon icon={Cancel01Icon} className="size-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="rounded-2xl border border-border/50 bg-muted/20 transition-all focus-within:border-border focus-within:ring-2 focus-within:ring-ring/20">
              <div className="flex items-end gap-3 px-4 py-3">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything about your projects..."
                  className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
                  rows={1}
                  style={{ minHeight: "24px", maxHeight: "140px" }}
                  disabled={chat.isStreaming}
                />
                <button
                  onClick={handleSend}
                  disabled={!hasInput || chat.isStreaming}
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-xl transition-all",
                    hasInput
                      ? "text-foreground hover:bg-accent"
                      : "text-muted-foreground/30",
                    chat.isStreaming && "text-muted-foreground/30",
                  )}
                >
                  {chat.isStreaming ? (
                    <HugeiconsIcon icon={Loading03Icon} className="size-4 animate-spin" />
                  ) : (
                    <HugeiconsIcon icon={ArrowUp01Icon} className="size-4" />
                  )}
                </button>
              </div>
              {/* Toolbar */}
              <div className="flex items-center gap-1 px-3 pb-2 border-t border-border/30 pt-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setShowFilePicker(true)}
                      className="rounded-lg p-1.5 text-muted-foreground/50 hover:text-muted-foreground hover:bg-accent transition-colors"
                    >
                      <HugeiconsIcon icon={FolderLibraryIcon} className="size-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-[11px]">Add project files</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="rounded-lg p-1.5 text-muted-foreground/50 hover:text-muted-foreground hover:bg-accent transition-colors"
                    >
                      <HugeiconsIcon icon={Attachment01Icon} className="size-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-[11px]">Upload a file</TooltipContent>
                </Tooltip>
                {hasContext && (
                  <span className="text-[10px] text-muted-foreground/40 ml-auto">
                    {chat.contextFiles.length + chat.uploadedFiles.length} file{chat.contextFiles.length + chat.uploadedFiles.length !== 1 ? "s" : ""} attached
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
          </div>
          {/* Side panel */}
          <ChatPanelRenderer />
        </div>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".txt,.md,.mdx,.json,.csv,.yml,.yaml,.xml,.ts,.tsx,.js,.jsx,.py,.rb,.go,.rs,.java,.c,.cpp,.h,.hpp,.cs,.swift,.kt,.php,.html,.css,.scss,.less,.sql,.sh,.bash,.toml,.ini,.cfg,.conf,.env,.log"
          onChange={handleFileUpload}
          className="hidden"
        />

        {/* File context picker */}
        <FileContextPicker
          open={showFilePicker}
          onOpenChange={setShowFilePicker}
          currentProjectId={chat.activeProjectId ?? pathProjectId}
          selectedFiles={chat.contextFiles}
          onFilesChange={setContextFiles}
        />
      </motion.div>
    </AnimatePresence>
  );
}

/* ─── Thinking dots ─── */

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1.5 px-1 py-2">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="size-1.5 rounded-full bg-muted-foreground/50"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
        />
      ))}
    </div>
  );
}


