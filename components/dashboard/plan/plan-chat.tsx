"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  SentIcon,
  Loading03Icon,
  CheckmarkCircle02Icon,
  Cancel01Icon,
  ArrowDown01Icon,
  Layers01Icon,
  SparklesIcon,
  CodeIcon,
  Search01Icon,
  PlusSignCircleIcon,
  Delete02Icon,
  ArrowTurnDownIcon,
  CheckListIcon,
  Tick02Icon,
  File02Icon,
  AttachmentIcon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  getPlanMessages,
  getPlan,
  updatePhaseStatus,
  type Plan,
  type PlanPhase,
} from "@/lib/plan-actions";
import { FileContextPicker, type ContextFile } from "@/components/dashboard/plan/file-context-picker";

/* ─── types ─── */

interface ToolCallEvent {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: Record<string, unknown>;
  status: "calling" | "done" | "error";
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  toolCalls?: ToolCallEvent[];
  createdAt: string;
}

interface PlanChatProps {
  plan: Plan;
  projectSlug: string;
}

/* ─── file path detection ─── */

const FILE_PATH_RE = /(?:^|\s|`)((?:[\w@.-]+\/)+[\w.-]+\.\w{1,10})(?:`|\s|$|[,;:)])/g;

/** Maps file extensions to short descriptive labels */
function getFileLabel(filePath: string): { name: string; type: string; description: string } {
  const parts = filePath.split("/");
  const fileName = parts[parts.length - 1];
  const ext = fileName.split(".").pop() ?? "";

  // Route files
  if (fileName === "route.ts" || fileName === "route.tsx") {
    const method = parts.includes("api") ? "API" : "Page";
    const routePath = parts.slice(parts.indexOf("api") >= 0 ? parts.indexOf("api") : 0, -1).join("/");
    return { name: routePath || fileName, type: `${method} Route`, description: `${method} endpoint at ${filePath}` };
  }
  // Page files
  if (fileName === "page.tsx" || fileName === "page.ts") {
    const pagePath = parts.slice(parts.indexOf("app") >= 0 ? parts.indexOf("app") + 1 : 0, -1).join("/");
    return { name: pagePath || "root", type: "Page", description: `Next.js page at /${pagePath}` };
  }
  // Components
  if (parts.includes("components")) {
    return { name: fileName.replace(/\.\w+$/, ""), type: "Component", description: `React component at ${filePath}` };
  }
  // Hooks
  if (fileName.startsWith("use") || parts.includes("hooks")) {
    return { name: fileName.replace(/\.\w+$/, ""), type: "Hook", description: `React hook at ${filePath}` };
  }
  // Lib/utils
  if (parts.includes("lib") || parts.includes("utils")) {
    return { name: fileName.replace(/\.\w+$/, ""), type: "Library", description: `Utility module at ${filePath}` };
  }

  const typeMap: Record<string, string> = {
    ts: "TypeScript", tsx: "Component", js: "JavaScript", jsx: "Component",
    css: "Stylesheet", json: "Config", md: "Document", sql: "Migration",
  };
  return { name: fileName.replace(/\.\w+$/, ""), type: typeMap[ext] ?? "File", description: filePath };
}

/* ─── tool metadata ─── */

const TOOL_META: Record<string, { label: string; icon: typeof SparklesIcon; color: string }> = {
  create_phase: { label: "Creating phase", icon: PlusSignCircleIcon, color: "blue" },
  update_phase: { label: "Updating phase", icon: ArrowTurnDownIcon, color: "amber" },
  delete_phase: { label: "Removing phase", icon: Delete02Icon, color: "red" },
  get_project_context: { label: "Loading project context", icon: Search01Icon, color: "emerald" },
  search_across_projects: { label: "Searching across projects", icon: Search01Icon, color: "purple" },
  complete_plan: { label: "Completing plan", icon: CheckmarkCircle02Icon, color: "emerald" },
  list_phases: { label: "Checking phases", icon: CheckListIcon, color: "zinc" },
};

/* ─── main component ─── */

export function PlanChat({ plan, projectSlug }: PlanChatProps) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [phases, setPhases] = React.useState<PlanPhase[]>([]);
  const [input, setInput] = React.useState("");
  const [isSending, setIsSending] = React.useState(false);
  const [showPhases, setShowPhases] = React.useState(false);
  const [isLoaded, setIsLoaded] = React.useState(false);
  const [isAtBottom, setIsAtBottom] = React.useState(true);
  const [contextFiles, setContextFiles] = React.useState<ContextFile[]>([]);
  const [showFilePicker, setShowFilePicker] = React.useState(false);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    async function load() {
      try {
        const [msgs, planData] = await Promise.all([
          getPlanMessages(plan.id),
          getPlan(plan.id),
        ]);
        setMessages(
          msgs.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            createdAt: m.created_at,
          })),
        );
        setPhases(planData.phases);
      } catch {
        toast.error("Failed to load plan messages");
      } finally {
        setIsLoaded(true);
      }
    }
    load();
  }, [plan.id]);

  React.useEffect(() => {
    if (isAtBottom && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isAtBottom]);

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
    if (!text || isSending || plan.status !== "active") return;

    setInput("");
    setIsSending(true);
    setIsAtBottom(true);
    if (textareaRef.current) {
      textareaRef.current.style.height = "44px";
    }

    // Build message with context files — grouped by project for AI attribution
    const attachedFiles = [...contextFiles];
    let fullMessage = text;
    if (attachedFiles.length > 0) {
      const byProject = new Map<string, { name: string; paths: string[] }>();
      for (const f of attachedFiles) {
        if (!byProject.has(f.projectId)) byProject.set(f.projectId, { name: f.projectName, paths: [] });
        byProject.get(f.projectId)!.paths.push(f.path);
      }
      const sections = [...byProject.values()].map(
        ({ name, paths }) => `From project **${name}**:\n${paths.map((p) => `- ${p}`).join("\n")}`,
      );
      fullMessage += `\n\n---\nContext files attached by user:\n\n${sections.join("\n\n")}`;
    }

    const userMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setContextFiles([]);

    const assistantId = `assistant-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "", toolCalls: [], createdAt: new Date().toISOString() },
    ]);

    try {
      // Collect project IDs referenced via attached files (excluding the current plan project)
      const referencedProjectIds = [
        ...new Set(
          contextFiles
            .map((f) => f.projectId)
            .filter((id) => id !== plan.project_id),
        ),
      ];

      const res = await fetch("/api/plan/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: plan.id,
          message: fullMessage,
          projectSlug,
          referencedProjectIds,
        }),
      });
      if (!res.ok) throw new Error(await res.text());

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");

      const decoder = new TextDecoder();
      let buffer = "";

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
              handleSSEEvent(assistantId, currentEvent, data);
            } catch { /* skip */ }
            currentEvent = "";
          }
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send message");
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
    } finally {
      setIsSending(false);
      textareaRef.current?.focus();
    }
  }

  function handleSSEEvent(assistantId: string, event: string, data: Record<string, unknown>) {
    switch (event) {
      case "text":
        setMessages((prev) =>
          prev.map((m) => m.id === assistantId ? { ...m, content: m.content + (data.content as string) } : m),
        );
        break;
      case "tool_call":
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, toolCalls: [...(m.toolCalls ?? []), { id: `tc-${Date.now()}-${Math.random()}`, name: data.name as string, args: data.args as Record<string, unknown>, status: "calling" as const }] }
              : m,
          ),
        );
        break;
      case "tool_result":
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== assistantId) return m;
            const toolCalls = (m.toolCalls ?? []).map((tc) =>
              tc.name === (data.name as string) && tc.status === "calling"
                ? { ...tc, result: data.result as Record<string, unknown>, status: "done" as const }
                : tc,
            );
            return { ...m, toolCalls };
          }),
        );
        break;
      case "phases":
        setPhases((data.phases as PlanPhase[]) ?? []);
        break;
      case "error":
        toast.error(data.message as string);
        break;
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function handlePhaseToggle(phaseId: string, currentStatus: string) {
    const newStatus = currentStatus === "completed" ? "pending" : "completed";
    try {
      const updated = await updatePhaseStatus(phaseId, newStatus as PlanPhase["status"]);
      setPhases((prev) => prev.map((p) => (p.id === phaseId ? updated : p)));
    } catch {
      toast.error("Failed to update phase");
    }
  }

  const completedCount = phases.filter((p) => p.status === "completed").length;

  if (!isLoaded) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="size-10 rounded-xl bg-muted flex items-center justify-center">
            <HugeiconsIcon icon={Loading03Icon} className="size-5 animate-spin text-muted-foreground" />
          </div>
          <p className="text-xs text-muted-foreground">Loading conversation...</p>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex flex-1 overflow-hidden">
        {/* Main chat area */}
        <div className="relative flex flex-1 flex-col">
          {/* Messages */}
          <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto scroll-smooth">
            <div className="mx-auto max-w-3xl px-4 py-6">
              {messages.length === 0 ? (
                <EmptyState planTitle={plan.title} />
              ) : (
                <div className="space-y-1">
                  {messages.map((msg, i) => (
                    <MessageBubble
                      key={msg.id}
                      message={msg}
                      isSending={isSending && msg.id.startsWith("assistant-")}
                      isLast={i === messages.length - 1}
                    />
                  ))}
                </div>
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
                className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10"
              >
                <Button
                  size="icon-sm"
                  variant="outline"
                  onClick={scrollToBottom}
                  className="rounded-full shadow-lg"
                >
                  <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5" />
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Input area */}
          <div className="border-t border-border bg-background px-4 py-3">
            <div className="mx-auto max-w-3xl">
              <div className="rounded-2xl border border-border bg-muted/30 transition-all focus-within:ring-2 focus-within:ring-ring/20 focus-within:border-border">
                {/* Context file chips */}
                <AnimatePresence>
                  {contextFiles.length > 0 && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="overflow-hidden"
                    >
                      <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2.5 pb-1">
                        {contextFiles.map((file) => {
                          const name = file.path.split("/").pop() ?? file.path;
                          return (
                            <motion.span
                              key={file.path}
                              initial={{ scale: 0.9, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              exit={{ scale: 0.9, opacity: 0 }}
                              className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground shadow-sm"
                            >
                              <HugeiconsIcon icon={File02Icon} className="size-3 text-muted-foreground shrink-0" />
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="max-w-[120px] truncate cursor-default">{name}</span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs max-w-xs">
                                  <p className="font-medium text-muted-foreground mb-0.5">{file.projectName}</p>
                                  <p>{file.path}</p>
                                </TooltipContent>
                              </Tooltip>
                              <button
                                onClick={() => setContextFiles((prev) => prev.filter((f) => f.path !== file.path))}
                                className="ml-0.5 rounded-sm p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                              >
                                <HugeiconsIcon icon={Cancel01Icon} className="size-2.5" />
                              </button>
                            </motion.span>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Separator */}
                {contextFiles.length > 0 && (
                  <div className="mx-3 h-px bg-border/40" />
                )}

                {/* Textarea */}
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Describe your architecture plan..."
                  className="w-full resize-none bg-transparent px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
                  rows={1}
                  disabled={isSending || plan.status !== "active"}
                  style={{ minHeight: "40px", maxHeight: "140px" }}
                />

                {/* Separator */}
                <div className="mx-3 h-px bg-border/40" />

                {/* Toolbar */}
                <div className="flex items-center justify-between px-2.5 pb-2">
                  <div className="flex items-center gap-1">
                    {/* Add files */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowFilePicker(true)}
                      disabled={isSending || plan.status !== "active"}
                      className="h-7 gap-1.5 rounded-lg px-2 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <HugeiconsIcon icon={AttachmentIcon} className="size-3.5" />
                      <span>Add files</span>
                      {contextFiles.length > 0 && (
                        <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                          {contextFiles.length}
                        </span>
                      )}
                    </Button>

                    {/* Phases toggle */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowPhases(!showPhases)}
                      className={cn(
                        "relative h-7 gap-1.5 rounded-lg px-2 text-xs",
                        showPhases ? "text-foreground bg-accent" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <HugeiconsIcon icon={Layers01Icon} className="size-3.5" />
                      <span>Phases</span>
                      {phases.length > 0 && (
                        <span className="flex size-4 items-center justify-center rounded-full bg-emerald-600 text-[9px] font-bold text-white">
                          {phases.length}
                        </span>
                      )}
                    </Button>
                  </div>

                  <Button
                    size="icon-sm"
                    onClick={handleSend}
                    disabled={!input.trim() || isSending || plan.status !== "active"}
                    className="rounded-lg"
                  >
                    {isSending ? (
                      <HugeiconsIcon icon={Loading03Icon} className="size-3.5 animate-spin" />
                    ) : (
                      <HugeiconsIcon icon={SentIcon} className="size-3.5" />
                    )}
                  </Button>
                </div>
              </div>

              {plan.status !== "active" && (
                <p className="mt-2 text-xs text-muted-foreground text-center">
                  This plan is {plan.status}. Reactivate it to continue.
                </p>
              )}
            </div>
          </div>

          {/* File context picker */}
          <FileContextPicker
            open={showFilePicker}
            onOpenChange={setShowFilePicker}
            currentProjectId={plan.project_id}
            selectedFiles={contextFiles}
            onFilesChange={setContextFiles}
          />
        </div>

        {/* Phases sidebar */}
        <AnimatePresence>
          {showPhases && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 300, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="shrink-0 overflow-hidden border-l border-border"
            >
              <div className="w-[300px] flex h-full flex-col bg-muted/30">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="size-7 rounded-lg bg-muted flex items-center justify-center">
                      <HugeiconsIcon icon={Layers01Icon} className="size-3.5 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="text-[13px] font-semibold text-foreground">Phases</h3>
                      <p className="text-[11px] text-muted-foreground">
                        {completedCount}/{phases.length} completed
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon-sm" onClick={() => setShowPhases(false)}>
                    <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
                  </Button>
                </div>

                {/* Progress bar */}
                {phases.length > 0 && (
                  <div className="px-4 py-2.5">
                    <div className="h-1 rounded-full bg-muted overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-emerald-500"
                        initial={{ width: 0 }}
                        animate={{ width: `${phases.length ? (completedCount / phases.length) * 100 : 0}%` }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>
                  </div>
                )}

                {/* Phase list */}
                <ScrollArea className="flex-1">
                  <div className="p-3 space-y-1">
                    {phases.length === 0 ? (
                      <div className="py-12 text-center">
                        <div className="mx-auto size-8 rounded-lg bg-muted flex items-center justify-center mb-2">
                          <HugeiconsIcon icon={Layers01Icon} className="size-4 text-muted-foreground" />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          No phases yet. Start chatting to create a plan.
                        </p>
                      </div>
                    ) : (
                      phases.map((phase, i) => (
                        <PhaseItem key={phase.id} phase={phase} index={i} onToggle={() => handlePhaseToggle(phase.id, phase.status)} />
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </TooltipProvider>
  );
}

/* ─── Empty state ─── */

function EmptyState({ planTitle }: { planTitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="relative mb-5">
        <div className="size-14 rounded-2xl bg-gradient-to-br from-muted to-muted/60 border border-border flex items-center justify-center shadow-sm">
          <HugeiconsIcon icon={SparklesIcon} className="size-7 text-muted-foreground" />
        </div>
        <div className="absolute -bottom-1 -right-1 size-5 rounded-full bg-emerald-600 flex items-center justify-center">
          <HugeiconsIcon icon={CodeIcon} className="size-3 text-white" />
        </div>
      </div>
      <h3 className="text-base font-semibold text-foreground">{planTitle}</h3>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground leading-relaxed">
        Describe what you want to build and I&apos;ll help break it into actionable phases with
        your project&apos;s architecture in mind.
      </p>
      <div className="mt-6 flex flex-wrap gap-2 justify-center">
        {["Add a new feature", "Refactor architecture", "Plan a migration"].map((s) => (
          <span
            key={s}
            className="px-3 py-1.5 rounded-lg border border-border bg-muted/50 text-xs text-muted-foreground"
          >
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ─── Phase item ─── */

function PhaseItem({ phase, index, onToggle }: { phase: PlanPhase; index: number; onToggle: () => void }) {
  const isCompleted = phase.status === "completed";
  const isInProgress = phase.status === "in_progress";

  return (
    <button
      onClick={onToggle}
      className={cn(
        "group flex w-full items-start gap-3 rounded-xl p-3 text-left transition-all",
        "hover:bg-accent/60",
        isCompleted && "opacity-50",
      )}
    >
      <div
        className={cn(
          "mt-0.5 shrink-0 size-5 rounded-md border flex items-center justify-center transition-all",
          isCompleted
            ? "bg-emerald-600/15 border-emerald-600/40 dark:bg-emerald-600/20"
            : isInProgress
              ? "bg-amber-500/15 border-amber-500/40 dark:bg-amber-600/20"
              : "border-border group-hover:border-muted-foreground/30",
        )}
      >
        {isCompleted ? (
          <HugeiconsIcon icon={Tick02Icon} className="size-3 text-emerald-600 dark:text-emerald-400" />
        ) : isInProgress ? (
          <div className="size-2 rounded-full bg-amber-500 animate-pulse" />
        ) : (
          <span className="text-[9px] font-bold text-muted-foreground">{index + 1}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn("text-[13px] font-medium leading-snug text-foreground", isCompleted && "line-through text-muted-foreground")}>
          {phase.title}
        </p>
        {phase.description && (
          <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
            {phase.description}
          </p>
        )}
      </div>
    </button>
  );
}

/* ─── File path tooltip ─── */

function FilePathLink({ filePath }: { filePath: string }) {
  const info = getFileLabel(filePath);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-[12px] font-medium text-foreground cursor-default hover:bg-accent transition-colors">
          <HugeiconsIcon icon={File02Icon} className="size-3 text-muted-foreground shrink-0" />
          <span className="truncate max-w-[180px]">{info.name}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="p-0 bg-popover text-popover-foreground border border-border shadow-xl rounded-xl overflow-hidden max-w-xs">
        <div className="px-3 py-2.5 space-y-1.5">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px]">{info.type}</Badge>
            <span className="text-[11px] font-semibold text-foreground truncate">{info.name}</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">{info.description}</p>
          <code className="block text-[10px] text-muted-foreground/70 font-mono truncate">{filePath}</code>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

/* ─── Markdown with file-path detection ─── */

const markdownComponents: Components = {
  code({ className, children, ...props }) {
    const isInline = !className;
    const text = String(children).replace(/\n$/, "");

    // Inline code: check if it's a file path
    if (isInline && FILE_PATH_RE.test(text)) {
      FILE_PATH_RE.lastIndex = 0; // reset regex state
      return <FilePathLink filePath={text} />;
    }

    // Block code
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

/* ─── Message bubble ─── */

function MessageBubble({
  message,
  isSending,
  isLast,
}: {
  message: ChatMessage;
  isSending: boolean;
  isLast: boolean;
}) {
  const isUser = message.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn("py-3", isUser && "flex justify-end")}
    >
      {isUser ? (
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground leading-relaxed">
          {message.content}
        </div>
      ) : (
        <div className="space-y-3">
          {message.toolCalls && message.toolCalls.length > 0 && (
            <div className="space-y-2">
              {message.toolCalls.map((tc) => (
                <ToolCallCard key={tc.id} toolCall={tc} />
              ))}
            </div>
          )}

          {message.content ? (
            <div className="prose-chat">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {message.content}
              </ReactMarkdown>
            </div>
          ) : (
            !isUser &&
            isSending &&
            (!message.toolCalls || message.toolCalls.length === 0) && (
              <ThinkingDots />
            )
          )}

          {isSending && isLast && message.content && (
            <span className="inline-block w-1.5 h-4 bg-foreground/40 rounded-sm animate-pulse ml-0.5" />
          )}
        </div>
      )}
    </motion.div>
  );
}

/* ─── Thinking animation ─── */

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

function ToolCallCard({ toolCall }: { toolCall: ToolCallEvent }) {
  const meta = TOOL_META[toolCall.name] ?? { label: toolCall.name, icon: SparklesIcon, color: "zinc" };
  const isDone = toolCall.status === "done";
  const hasError = toolCall.status === "error" || (toolCall.result && "error" in toolCall.result);
  const isContext = toolCall.name === "get_project_context";
  const isPhaseCreate = toolCall.name === "create_phase";
  const hasResult = isDone && toolCall.result && !hasError;

  const colorMap: Record<string, { border: string; bg: string; text: string; icon: string }> = {
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
    red: {
      border: "border-red-500/25 dark:border-red-500/20",
      bg: "bg-red-500/[0.06] dark:bg-red-500/[0.04]",
      text: "text-red-700 dark:text-red-400",
      icon: "text-red-600 dark:text-red-400",
    },
    zinc: {
      border: "border-border",
      bg: "bg-muted/50",
      text: "text-muted-foreground",
      icon: "text-muted-foreground",
    },
  };

  const colors = hasError ? colorMap.red : colorMap[meta.color] ?? colorMap.zinc;

  return (
    <Collapsible>
      <motion.div
        initial={{ opacity: 0, y: 4, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.25 }}
        className={cn("rounded-xl border overflow-hidden", colors.border, colors.bg)}
      >
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
            <div className={cn("shrink-0", isDone ? colors.icon : "text-muted-foreground")}>
              {isDone ? (
                hasError ? (
                  <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
                ) : (
                  <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-4" />
                )
              ) : (
                <HugeiconsIcon icon={Loading03Icon} className="size-4 animate-spin" />
              )}
            </div>
            <span className={cn("text-xs font-medium flex-1", isDone ? colors.text : "text-muted-foreground")}>
              {meta.label}
            </span>
            {isPhaseCreate && isDone && toolCall.result && (
              <Badge variant="outline" className="text-[10px]">
                {(toolCall.result as { phase?: { title?: string } })?.phase?.title ?? "Phase"}
              </Badge>
            )}
            {hasResult && (
              <HugeiconsIcon icon={ArrowDown01Icon} className="size-3 text-muted-foreground transition-transform [[data-state=open]_&]:rotate-180" />
            )}
          </button>
        </CollapsibleTrigger>

        {hasResult && (
          <CollapsibleContent>
            <div className="border-t border-border/60 px-3 py-2.5">
              {isContext ? (
                <ContextResultDisplay result={toolCall.result!} />
              ) : (
                <pre className="text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">
                  {JSON.stringify(toolCall.result, null, 2)}
                </pre>
              )}
            </div>
          </CollapsibleContent>
        )}
      </motion.div>
    </Collapsible>
  );
}

/* ─── Context result display ─── */

function ContextResultDisplay({ result }: { result: Record<string, unknown> }) {
  const project = result.project as { name?: string; slug?: string; language?: string; repo_name?: string } | undefined;
  const techStack = result.techStack as string[] | undefined;
  const features = result.features as Array<{ name: string; importance: number; category: string }> | undefined;
  const memories = result.memories as Array<{ title: string; category: string }> | undefined;

  return (
    <div className="space-y-2.5">
      {project && (
        <div className="flex items-center gap-2">
          <div className="size-6 rounded-md bg-emerald-500/10 dark:bg-emerald-500/15 flex items-center justify-center">
            <HugeiconsIcon icon={CodeIcon} className="size-3 text-emerald-600 dark:text-emerald-400" />
          </div>
          <span className="text-xs font-medium text-foreground">{project.name}</span>
          {project.language && (
            <Badge variant="outline" className="text-[10px]">{project.language}</Badge>
          )}
        </div>
      )}

      {techStack && techStack.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {techStack.slice(0, 12).map((t) => (
            <span
              key={t}
              className="px-2 py-0.5 rounded-md bg-emerald-500/[0.08] dark:bg-emerald-500/[0.06] border border-emerald-500/15 dark:border-emerald-500/10 text-[10px] text-emerald-700 dark:text-emerald-400/80 font-medium"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {features && features.length > 0 && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <HugeiconsIcon icon={Layers01Icon} className="size-3" />
          <span>{features.length} features loaded</span>
          <span className="text-border">·</span>
          <span className="truncate">Top: {features.slice(0, 3).map((f) => f.name).join(", ")}</span>
        </div>
      )}

      {memories && memories.length > 0 && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <HugeiconsIcon icon={SparklesIcon} className="size-3" />
          <span>{memories.length} memories loaded</span>
        </div>
      )}
    </div>
  );
}

