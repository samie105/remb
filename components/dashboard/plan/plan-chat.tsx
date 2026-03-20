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
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  getPlanMessages,
  getPlan,
  updatePhaseStatus,
  type Plan,
  type PlanPhase,
} from "@/lib/plan-actions";

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

/* ─── tool metadata ─── */

const TOOL_META: Record<string, { label: string; icon: typeof SparklesIcon; color: string }> = {
  create_phase: { label: "Creating phase", icon: PlusSignCircleIcon, color: "blue" },
  update_phase: { label: "Updating phase", icon: ArrowTurnDownIcon, color: "amber" },
  delete_phase: { label: "Removing phase", icon: Delete02Icon, color: "red" },
  get_project_context: { label: "Loading project context", icon: Search01Icon, color: "emerald" },
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

  // Auto-scroll when at bottom
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
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || isSending || plan.status !== "active") return;

    setInput("");
    setIsSending(true);
    setIsAtBottom(true);

    const userMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    const assistantId = `assistant-${Date.now()}`;
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      toolCalls: [],
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, assistantMsg]);

    try {
      const res = await fetch("/api/plan/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id, message: text, projectSlug }),
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
            } catch { /* skip malformed */ }
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
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: m.content + (data.content as string) }
              : m,
          ),
        );
        break;

      case "tool_call":
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  toolCalls: [
                    ...(m.toolCalls ?? []),
                    {
                      id: `tc-${Date.now()}-${Math.random()}`,
                      name: data.name as string,
                      args: data.args as Record<string, unknown>,
                      status: "calling" as const,
                    },
                  ],
                }
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
          <div className="relative">
            <div className="size-10 rounded-xl bg-zinc-800/80 flex items-center justify-center">
              <HugeiconsIcon icon={Loading03Icon} className="size-5 animate-spin text-zinc-400" />
            </div>
          </div>
          <p className="text-xs text-zinc-500">Loading conversation...</p>
        </div>
      </div>
    );
  }

  return (
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
                className="rounded-full shadow-lg bg-zinc-900 border-zinc-700 hover:bg-zinc-800"
              >
                <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5 text-zinc-300" />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input area */}
        <div className="border-t border-zinc-800/60 bg-background/80 backdrop-blur-sm px-4 py-3">
          <div className="mx-auto max-w-3xl">
            <div className="relative flex items-end gap-2">
              {/* Phases toggle */}
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setShowPhases(!showPhases)}
                className={cn(
                  "shrink-0 mb-0.5 rounded-lg transition-all",
                  showPhases ? "bg-zinc-800 text-zinc-200" : "text-zinc-500 hover:text-zinc-300",
                )}
              >
                <HugeiconsIcon icon={Layers01Icon} className="size-4" />
                {phases.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 size-4 rounded-full bg-emerald-600 text-[9px] font-bold text-white flex items-center justify-center">
                    {phases.length}
                  </span>
                )}
              </Button>

              {/* Input */}
              <div className="relative flex-1">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    // Auto-resize
                    e.target.style.height = "auto";
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Describe your architecture plan..."
                  className="w-full resize-none rounded-xl border border-zinc-800/60 bg-zinc-900/60 px-4 py-3 pr-12 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-700 transition-all"
                  rows={1}
                  disabled={isSending || plan.status !== "active"}
                  style={{ minHeight: "44px", maxHeight: "160px" }}
                />
                <Button
                  size="icon-sm"
                  className={cn(
                    "absolute bottom-2 right-2 rounded-lg transition-all",
                    input.trim()
                      ? "bg-white text-zinc-900 hover:bg-zinc-200"
                      : "bg-zinc-800 text-zinc-500",
                  )}
                  onClick={handleSend}
                  disabled={!input.trim() || isSending || plan.status !== "active"}
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
              <p className="mt-2 text-xs text-zinc-600 text-center">
                This plan is {plan.status}. Reactivate it to continue.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Phases sidebar */}
      <AnimatePresence>
        {showPhases && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 300, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="shrink-0 overflow-hidden border-l border-zinc-800/60"
          >
            <div className="w-[300px] flex h-full flex-col bg-zinc-950/40">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-zinc-800/60 px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <div className="size-7 rounded-lg bg-zinc-800/60 flex items-center justify-center">
                    <HugeiconsIcon icon={Layers01Icon} className="size-3.5 text-zinc-400" />
                  </div>
                  <div>
                    <h3 className="text-[13px] font-semibold text-zinc-200">Phases</h3>
                    <p className="text-[11px] text-zinc-600">
                      {completedCount}/{phases.length} completed
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="icon-sm" onClick={() => setShowPhases(false)} className="text-zinc-500 hover:text-zinc-300">
                  <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
                </Button>
              </div>

              {/* Progress bar */}
              {phases.length > 0 && (
                <div className="px-4 py-2.5">
                  <div className="h-1 rounded-full bg-zinc-800/80 overflow-hidden">
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
                      <div className="mx-auto size-8 rounded-lg bg-zinc-800/40 flex items-center justify-center mb-2">
                        <HugeiconsIcon icon={Layers01Icon} className="size-4 text-zinc-600" />
                      </div>
                      <p className="text-xs text-zinc-600">
                        No phases yet. Start chatting to create a plan.
                      </p>
                    </div>
                  ) : (
                    phases.map((phase, i) => (
                      <PhaseItem
                        key={phase.id}
                        phase={phase}
                        index={i}
                        onToggle={() => handlePhaseToggle(phase.id, phase.status)}
                      />
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Empty state ─── */

function EmptyState({ planTitle }: { planTitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="relative mb-5">
        <div className="size-14 rounded-2xl bg-gradient-to-br from-zinc-800 to-zinc-900 border border-zinc-700/50 flex items-center justify-center shadow-lg">
          <HugeiconsIcon icon={SparklesIcon} className="size-7 text-zinc-400" />
        </div>
        <div className="absolute -bottom-1 -right-1 size-5 rounded-full bg-emerald-600 flex items-center justify-center">
          <HugeiconsIcon icon={CodeIcon} className="size-3 text-white" />
        </div>
      </div>
      <h3 className="text-base font-semibold text-zinc-200">{planTitle}</h3>
      <p className="mt-2 max-w-sm text-sm text-zinc-500 leading-relaxed">
        Describe what you want to build and I&apos;ll help break it into actionable phases with
        your project&apos;s architecture in mind.
      </p>
      <div className="mt-6 flex flex-wrap gap-2 justify-center">
        {["Add a new feature", "Refactor architecture", "Plan a migration"].map((s) => (
          <span
            key={s}
            className="px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 text-xs text-zinc-500"
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
        "hover:bg-zinc-800/40",
        isCompleted && "opacity-50",
      )}
    >
      <div
        className={cn(
          "mt-0.5 shrink-0 size-5 rounded-md border flex items-center justify-center transition-all",
          isCompleted
            ? "bg-emerald-600/20 border-emerald-600/40"
            : isInProgress
              ? "bg-amber-600/20 border-amber-600/40"
              : "border-zinc-700 group-hover:border-zinc-600",
        )}
      >
        {isCompleted ? (
          <HugeiconsIcon icon={Tick02Icon} className="size-3 text-emerald-400" />
        ) : isInProgress ? (
          <div className="size-2 rounded-full bg-amber-500 animate-pulse" />
        ) : (
          <span className="text-[9px] font-bold text-zinc-600">{index + 1}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-[13px] font-medium leading-snug text-zinc-300",
            isCompleted && "line-through text-zinc-500",
          )}
        >
          {phase.title}
        </p>
        {phase.description && (
          <p className="mt-0.5 text-[11px] text-zinc-600 line-clamp-2 leading-relaxed">
            {phase.description}
          </p>
        )}
      </div>
    </button>
  );
}

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
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-zinc-800 px-4 py-2.5 text-sm text-zinc-100 leading-relaxed">
          {message.content}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Tool calls */}
          {message.toolCalls && message.toolCalls.length > 0 && (
            <div className="space-y-2">
              {message.toolCalls.map((tc) => (
                <ToolCallCard key={tc.id} toolCall={tc} />
              ))}
            </div>
          )}

          {/* Text content — markdown rendered */}
          {message.content ? (
            <div className="prose-chat">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
            </div>
          ) : (
            !isUser &&
            isSending &&
            (!message.toolCalls || message.toolCalls.length === 0) && (
              <div className="flex items-center gap-2.5">
                <ThinkingDots />
              </div>
            )
          )}

          {/* Streaming cursor */}
          {isSending && isLast && message.content && (
            <span className="inline-block w-1.5 h-4 bg-zinc-400 rounded-sm animate-pulse ml-0.5" />
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
          className="size-1.5 rounded-full bg-zinc-500"
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

  const colorMap: Record<string, { border: string; bg: string; text: string; icon: string; glow: string }> = {
    emerald: {
      border: "border-emerald-500/20",
      bg: "bg-emerald-500/[0.04]",
      text: "text-emerald-400",
      icon: "text-emerald-400",
      glow: "shadow-emerald-500/5",
    },
    blue: {
      border: "border-blue-500/20",
      bg: "bg-blue-500/[0.04]",
      text: "text-blue-400",
      icon: "text-blue-400",
      glow: "shadow-blue-500/5",
    },
    amber: {
      border: "border-amber-500/20",
      bg: "bg-amber-500/[0.04]",
      text: "text-amber-400",
      icon: "text-amber-400",
      glow: "shadow-amber-500/5",
    },
    red: {
      border: "border-red-500/20",
      bg: "bg-red-500/[0.04]",
      text: "text-red-400",
      icon: "text-red-400",
      glow: "shadow-red-500/5",
    },
    zinc: {
      border: "border-zinc-700/40",
      bg: "bg-zinc-800/30",
      text: "text-zinc-400",
      icon: "text-zinc-400",
      glow: "",
    },
  };

  const colors = hasError
    ? colorMap.red
    : colorMap[meta.color] ?? colorMap.zinc;

  return (
    <Collapsible>
      <motion.div
        initial={{ opacity: 0, y: 4, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.25 }}
        className={cn(
          "rounded-xl border overflow-hidden transition-all",
          colors.border,
          colors.bg,
          colors.glow && `shadow-lg ${colors.glow}`,
        )}
      >
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-white/[0.02] transition-colors">
            {/* Status icon */}
            <div className={cn("shrink-0", isDone ? colors.icon : "text-zinc-500")}>
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

            {/* Label */}
            <span className={cn("text-xs font-medium flex-1", isDone ? colors.text : "text-zinc-500")}>
              {meta.label}
            </span>

            {/* Phase badge for create_phase */}
            {isPhaseCreate && isDone && toolCall.result && (
              <Badge variant="outline" className="text-[10px] border-zinc-700 text-zinc-400">
                {(toolCall.result as { phase?: { title?: string } })?.phase?.title ?? "Phase"}
              </Badge>
            )}

            {/* Expand hint if has result data */}
            {hasResult && (
              <HugeiconsIcon icon={ArrowDown01Icon} className="size-3 text-zinc-600 transition-transform [[data-state=open]_&]:rotate-180" />
            )}
          </button>
        </CollapsibleTrigger>

        {/* Expanded content */}
        {hasResult && (
          <CollapsibleContent>
            <div className="border-t border-zinc-800/40 px-3 py-2.5">
              {isContext ? (
                <ContextResultDisplay result={toolCall.result!} />
              ) : (
                <pre className="text-[11px] text-zinc-500 leading-relaxed whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">
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

/* ─── Context result display (for get_project_context) ─── */

function ContextResultDisplay({ result }: { result: Record<string, unknown> }) {
  const project = result.project as { name?: string; slug?: string; language?: string; repo_name?: string } | undefined;
  const techStack = result.techStack as string[] | undefined;
  const features = result.features as Array<{ name: string; importance: number; category: string; description?: string }> | undefined;
  const memories = result.memories as Array<{ title: string; category: string }> | undefined;

  return (
    <div className="space-y-3">
      {/* Project info */}
      {project && (
        <div className="flex items-center gap-2">
          <div className="size-6 rounded-md bg-emerald-500/10 flex items-center justify-center">
            <HugeiconsIcon icon={CodeIcon} className="size-3 text-emerald-400" />
          </div>
          <span className="text-xs font-medium text-zinc-300">{project.name}</span>
          {project.language && (
            <Badge variant="outline" className="text-[10px] border-zinc-700/50 text-zinc-500">{project.language}</Badge>
          )}
        </div>
      )}

      {/* Tech stack chips */}
      {techStack && techStack.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {techStack.slice(0, 12).map((t) => (
            <span
              key={t}
              className="px-2 py-0.5 rounded-md bg-emerald-500/[0.06] border border-emerald-500/10 text-[10px] text-emerald-400/80"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {/* Features count */}
      {features && features.length > 0 && (
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
          <HugeiconsIcon icon={Layers01Icon} className="size-3 text-zinc-600" />
          <span>{features.length} features loaded</span>
          <span className="text-zinc-700">·</span>
          <span>Top: {features.slice(0, 3).map((f) => f.name).join(", ")}</span>
        </div>
      )}

      {/* Memories count */}
      {memories && memories.length > 0 && (
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
          <HugeiconsIcon icon={SparklesIcon} className="size-3 text-zinc-600" />
          <span>{memories.length} memories loaded</span>
        </div>
      )}
    </div>
  );
}

