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
  CheckmarkCircle02Icon,
  Search01Icon,
  PlusSignCircleIcon,
  Layers01Icon,
  ArrowDown01Icon,
  File01Icon,
  Attachment01Icon,
  FolderLibraryIcon,
  StructureCheckIcon,
  FlowIcon,
  AnalyticsUpIcon,
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
  type ChatMessage,
  type DetectedProject,
  type ContextFile,
  type UploadedFile,
} from "@/lib/chat-store";
import { useIsMobile } from "@/hooks/use-mobile";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileContextPicker } from "@/components/dashboard/plan/file-context-picker";
import { ChatPanelRenderer } from "@/components/dashboard/chat-panel";

/* ─── tool call types ─── */

interface ToolCallEvent {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: string;
  action?: { type: string; payload?: string };
  status: "calling" | "done";
}

/* ─── tool metadata ─── */

const TOOL_META: Record<string, { label: string; icon: typeof SparklesIcon; color: string }> = {
  get_project_context: { label: "Loading project context", icon: Search01Icon, color: "emerald" },
  search_projects: { label: "Searching projects", icon: Search01Icon, color: "blue" },
  search_across_projects: { label: "Searching across projects", icon: Search01Icon, color: "purple" },
  change_theme: { label: "Changing theme", icon: SparklesIcon, color: "amber" },
  navigate: { label: "Navigating", icon: ArrowUp01Icon, color: "blue" },
  create_plan: { label: "Creating plan", icon: PlusSignCircleIcon, color: "blue" },
  create_phase: { label: "Creating phase", icon: PlusSignCircleIcon, color: "emerald" },
  list_plans: { label: "Listing plans", icon: Layers01Icon, color: "zinc" },
  query_knowledge_graph: { label: "Querying knowledge graph", icon: Search01Icon, color: "purple" },
  search_memories: { label: "Searching memories", icon: Search01Icon, color: "emerald" },
  get_impact_analysis: { label: "Analyzing impact", icon: AnalyticsUpIcon, color: "amber" },
  get_thread_history: { label: "Loading thread history", icon: Search01Icon, color: "zinc" },
  show_plan_tree: { label: "Showing plan", icon: Layers01Icon, color: "blue" },
  show_architecture: { label: "Generating architecture", icon: StructureCheckIcon, color: "purple" },
  show_diagram: { label: "Rendering diagram", icon: FlowIcon, color: "emerald" },
  trigger_scan: { label: "Triggering scan", icon: AnalyticsUpIcon, color: "amber" },
};

const COLOR_MAP: Record<string, { border: string; bg: string; text: string; icon: string }> = {
  emerald: {
    border: "border-emerald-500/25 dark:border-emerald-500/20",
    bg: "bg-emerald-500/[0.06] dark:bg-emerald-500/[0.04]",
    text: "text-emerald-700 dark:text-emerald-400",
    icon: "text-emerald-600 dark:text-emerald-400",
  },
  blue: {
    border: "border-blue-500/25 dark:border-blue-500/20",
    bg: "bg-blue-500/[0.06] dark:bg-blue-500/[0.04]",
    text: "text-blue-700 dark:text-blue-400",
    icon: "text-blue-600 dark:text-blue-400",
  },
  amber: {
    border: "border-amber-500/25 dark:border-amber-500/20",
    bg: "bg-amber-500/[0.06] dark:bg-amber-500/[0.04]",
    text: "text-amber-700 dark:text-amber-400",
    icon: "text-amber-600 dark:text-amber-400",
  },
  purple: {
    border: "border-purple-500/25 dark:border-purple-500/20",
    bg: "bg-purple-500/[0.06] dark:bg-purple-500/[0.04]",
    text: "text-purple-700 dark:text-purple-400",
    icon: "text-purple-600 dark:text-purple-400",
  },
  zinc: {
    border: "border-border",
    bg: "bg-muted/50",
    text: "text-muted-foreground",
    icon: "text-muted-foreground",
  },
};

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

/* ─── markdown components ─── */

const markdownComponents: Components = {
  code({ className, children, ...props }) {
    const isInline = !className;
    if (!isInline) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }
    return <code {...props}>{children}</code>;
  },
};

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

  async function handleSend() {
    const text = input.trim();
    if (!text || chat.isStreaming) return;

    setInput("");
    setToolCalls([]);
    if (textareaRef.current) textareaRef.current.style.height = "36px";
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
          contextFiles: chat.contextFiles.length > 0 ? chat.contextFiles : undefined,
          uploadedFiles: chat.uploadedFiles.length > 0
            ? chat.uploadedFiles.map((f) => ({ name: f.name, content: f.content }))
            : undefined,
        }),
      });

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
                      args: data.args as Record<string, unknown>,
                      status: "calling",
                    },
                  ]);
                  break;
                case "tool_result": {
                  const resultData = data as { name: string; result: string; action?: { type: string; payload?: string } };
                  setToolCalls((prev) =>
                    prev.map((tc) =>
                      tc.name === resultData.name && tc.status === "calling"
                        ? { ...tc, result: resultData.result, action: resultData.action, status: "done" as const }
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
                  setPanel(data as { id: string; type: "plan" | "architecture" | "mermaid"; title: string; data: Record<string, unknown> });
                  // Auto-expand to full if showing a panel in mini mode
                  if (chat.windowState === "mini") expandChat();
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
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Something went wrong";
      updateLastAssistantMessage(`Sorry, I ran into an error: ${errMsg}`);
    } finally {
      setStreaming(false);
    }
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
              {chat.activeProjectId && chat.detectedProjects.length > 0 && (
                <span className="text-[11px] text-muted-foreground">
                  · {chat.detectedProjects.find((p) => p.id === chat.activeProjectId)?.name}
                </span>
              )}
            </div>
            <div className="flex items-center gap-0.5">
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

          {/* Messages */}
          <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {chat.messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
                <div className="flex size-10 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/20 to-blue-500/20 ring-1 ring-violet-500/10">
                  <HugeiconsIcon icon={SparklesIcon} className="size-5 text-violet-600 dark:text-violet-400" />
                </div>
                <p className="text-xs text-muted-foreground/60">
                  Ask anything about your projects
                </p>
              </div>
            ) : (
              chat.messages.map((msg, i) => (
                <React.Fragment key={msg.id}>
                  {/* Show tool activity before the assistant message */}
                  {msg.role === "assistant" && i === chat.messages.length - 1 && toolCalls.length > 0 && (
                    <ToolActivityIndicator toolCalls={toolCalls} compact />
                  )}
                  <MessageBubble message={msg} />
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
        className="fixed inset-0 z-50 flex flex-col bg-background"
      >
        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-border/40 px-6 py-3 shrink-0">
          <div className="flex items-center gap-3">
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
              <div className="flex flex-col items-center justify-center py-24 gap-4">
                <div className="flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/20 to-blue-500/20 ring-1 ring-violet-500/10">
                  <HugeiconsIcon icon={SparklesIcon} className="size-6 text-violet-600 dark:text-violet-400" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-sm font-medium text-foreground/80">Remb AI</p>
                  <p className="text-xs text-muted-foreground/50">
                    Ask about your projects, change settings, navigate — anything.
                  </p>
                </div>
              </div>
            ) : (
              chat.messages.map((msg, i) => (
                <React.Fragment key={msg.id}>
                  {msg.role === "assistant" && i === chat.messages.length - 1 && toolCalls.length > 0 && (
                    <ToolActivityIndicator toolCalls={toolCalls} />
                  )}
                  <MessageBubble message={msg} variant="full" />
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

/* ─── Tool call card ─── */

function ToolCallCard({ toolCall, compact }: { toolCall: ToolCallEvent; compact?: boolean }) {
  const meta = TOOL_META[toolCall.name] ?? { label: toolCall.name, icon: SparklesIcon, color: "zinc" };
  const isDone = toolCall.status === "done";
  const colors = COLOR_MAP[meta.color] ?? COLOR_MAP.zinc;

  return (
    <Collapsible>
      <motion.div
        initial={{ opacity: 0, y: 4, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.25 }}
        className={cn("rounded-xl border overflow-hidden", colors.border, colors.bg)}
      >
        <CollapsibleTrigger asChild>
          <button className={cn(
            "flex w-full items-center gap-2 text-left transition-colors hover:bg-black/2 dark:hover:bg-white/2",
            compact ? "px-2.5 py-1.5" : "px-3 py-2.5",
          )}>
            <div className={cn("shrink-0", isDone ? colors.icon : "text-muted-foreground")}>
              {isDone ? (
                <HugeiconsIcon icon={CheckmarkCircle02Icon} className={compact ? "size-3" : "size-4"} />
              ) : (
                <HugeiconsIcon icon={Loading03Icon} className={cn(compact ? "size-3" : "size-4", "animate-spin")} />
              )}
            </div>
            <span className={cn("flex-1 font-medium", isDone ? colors.text : "text-muted-foreground", compact ? "text-[11px]" : "text-xs")}>
              {meta.label}
            </span>
            {isDone && toolCall.result && (
              <HugeiconsIcon icon={ArrowDown01Icon} className="size-3 text-muted-foreground transition-transform in-data-[state=open]:rotate-180" />
            )}
          </button>
        </CollapsibleTrigger>

        {isDone && toolCall.result && (
          <CollapsibleContent>
            <div className="border-t border-border/60 px-3 py-2">
              <pre className={cn("text-muted-foreground leading-relaxed whitespace-pre-wrap font-mono max-h-32 overflow-y-auto", compact ? "text-[10px]" : "text-[11px]")}>
                {toolCall.result.slice(0, 500)}
              </pre>
            </div>
          </CollapsibleContent>
        )}
      </motion.div>
    </Collapsible>
  );
}

/* ─── Collapsed tool activity indicator ─── */

function ToolActivityIndicator({ toolCalls, compact }: { toolCalls: ToolCallEvent[]; compact?: boolean }) {
  const allDone = toolCalls.every((tc) => tc.status === "done");
  const doneCount = toolCalls.filter((tc) => tc.status === "done").length;
  const currentTool = toolCalls.find((tc) => tc.status === "calling");
  const currentMeta = currentTool
    ? (TOOL_META[currentTool.name] ?? { label: currentTool.name, icon: SparklesIcon, color: "zinc" })
    : null;

  return (
    <Collapsible>
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className={cn(
          "rounded-xl border border-border/40 bg-muted/30 overflow-hidden",
          compact ? "ml-0" : "ml-9",
        )}
      >
        <CollapsibleTrigger asChild>
          <button className={cn(
            "flex w-full items-center gap-2 text-left transition-colors hover:bg-muted/50",
            compact ? "px-2.5 py-1.5" : "px-3 py-2",
          )}>
            {allDone ? (
              <HugeiconsIcon icon={CheckmarkCircle02Icon} className={cn("shrink-0 text-emerald-500", compact ? "size-3" : "size-3.5")} />
            ) : (
              <HugeiconsIcon icon={Loading03Icon} className={cn("shrink-0 text-muted-foreground animate-spin", compact ? "size-3" : "size-3.5")} />
            )}
            <span className={cn("flex-1 text-muted-foreground", compact ? "text-[11px]" : "text-xs")}>
              {allDone
                ? `Used ${toolCalls.length} tool${toolCalls.length > 1 ? "s" : ""}`
                : currentMeta
                  ? currentMeta.label
                  : `Working… (${doneCount}/${toolCalls.length})`}
            </span>
            <HugeiconsIcon icon={ArrowDown01Icon} className="size-3 text-muted-foreground/50 transition-transform in-data-[state=open]:rotate-180" />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className={cn("border-t border-border/30 space-y-1", compact ? "p-1.5" : "p-2")}>
            {toolCalls.map((tc) => (
              <ToolCallCard key={tc.id} toolCall={tc} compact />
            ))}
          </div>
        </CollapsibleContent>
      </motion.div>
    </Collapsible>
  );
}

/* ─── AI Avatar ─── */

function AiAvatar({ size = "sm" }: { size?: "sm" | "md" }) {
  const dim = size === "sm" ? "size-6" : "size-7";
  const iconDim = size === "sm" ? "size-3" : "size-3.5";
  return (
    <div className={cn(
      "shrink-0 flex items-center justify-center rounded-full bg-gradient-to-br from-violet-500/20 to-blue-500/20 ring-1 ring-violet-500/10",
      dim,
    )}>
      <HugeiconsIcon icon={SparklesIcon} strokeWidth={2} className={cn(iconDim, "text-violet-600 dark:text-violet-400")} />
    </div>
  );
}

/* ─── Message bubble ─── */

function MessageBubble({
  message,
  variant = "mini",
}: {
  message: ChatMessage;
  variant?: "mini" | "full";
}) {
  const isUser = message.role === "user";
  if (!message.content && !isUser) return null;

  const isFull = variant === "full";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5 leading-relaxed bg-foreground text-background",
          isFull ? "text-sm rounded-br-md" : "text-[13px]",
        )}>
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5">
      <AiAvatar size={isFull ? "md" : "sm"} />
      <div className={cn(
        "max-w-[90%] leading-relaxed prose-chat pt-0.5",
        isFull ? "text-sm" : "text-[13px]",
      )}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {message.content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
