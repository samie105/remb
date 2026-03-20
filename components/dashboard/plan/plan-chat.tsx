"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  SentIcon,
  Loading03Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  getPlanMessages,
  getPlan,
  sendPlanMessage,
  updatePhaseStatus,
  type Plan,
  type PlanMessage,
  type PlanPhase,
} from "@/lib/plan-actions";

interface PlanChatProps {
  plan: Plan;
  projectSlug: string;
}

export function PlanChat({ plan, projectSlug }: PlanChatProps) {
  const [messages, setMessages] = React.useState<PlanMessage[]>([]);
  const [phases, setPhases] = React.useState<PlanPhase[]>([]);
  const [input, setInput] = React.useState("");
  const [isSending, setIsSending] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [showPhases, setShowPhases] = React.useState(true);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Load messages + phases when plan changes
  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    async function load() {
      try {
        const [msgs, planData] = await Promise.all([
          getPlanMessages(plan.id),
          getPlan(plan.id),
        ]);
        if (!cancelled) {
          setMessages(msgs);
          setPhases(planData.phases);
          setIsLoading(false);
        }
      } catch {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [plan.id]);

  // Scroll to bottom on new messages
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || isSending) return;

    setInput("");
    setIsSending(true);

    // Optimistic: add user message
    const tempUserMsg: PlanMessage = {
      id: `temp-${Date.now()}`,
      plan_id: plan.id,
      role: "user",
      content: trimmed,
      metadata: {},
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const result = await sendPlanMessage({
        planId: plan.id,
        message: trimmed,
        projectSlug,
      });

      // Replace optimistic + add assistant reply
      const assistantMsg: PlanMessage = {
        id: `reply-${Date.now()}`,
        plan_id: plan.id,
        role: "assistant",
        content: result.reply,
        metadata: {},
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMsg]);

      // Refresh phases if AI proposed new ones
      if (result.phases?.length) {
        const updated = await getPlan(plan.id);
        setPhases(updated.phases);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setIsSending(false);
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function handlePhaseToggle(phaseId: string, currentStatus: string) {
    const newStatus = currentStatus === "completed" ? "pending" : "completed";
    try {
      const updated = await updatePhaseStatus(phaseId, newStatus);
      setPhases((prev) => prev.map((p) => (p.id === phaseId ? updated : p)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update phase");
    }
  }

  const phaseStatusIcon: Record<string, string> = {
    pending: "⬜",
    in_progress: "🔄",
    completed: "✅",
    skipped: "⏭️",
  };

  return (
    <div className="flex h-full">
      {/* Chat area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">{plan.title}</h2>
            {plan.description && (
              <p className="text-xs text-muted-foreground">{plan.description}</p>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPhases(!showPhases)}
          >
            {showPhases ? "Hide" : "Show"} Phases
            {phases.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-[10px]">
                {phases.filter((p) => p.status === "completed").length}/{phases.length}
              </Badge>
            )}
          </Button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <HugeiconsIcon icon={Loading03Icon} className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-lg font-medium">Start planning</p>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Describe what you want to build or the architecture you&apos;re planning.
                The AI will help you break it down into phases.
              </p>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-4">
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
              {isSending && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <HugeiconsIcon icon={Loading03Icon} className="size-4 animate-spin" />
                  <span className="text-sm">Thinking...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-border p-4">
          <div className="mx-auto max-w-3xl">
            <div className="relative">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe your architecture plan..."
                className="min-h-15 max-h-50 resize-none pr-12"
                disabled={isSending || plan.status !== "active"}
              />
              <Button
                size="icon-sm"
                className="absolute bottom-2 right-2"
                onClick={handleSend}
                disabled={!input.trim() || isSending || plan.status !== "active"}
              >
                <HugeiconsIcon icon={SentIcon} className="size-4" />
              </Button>
            </div>
            {plan.status !== "active" && (
              <p className="mt-2 text-xs text-muted-foreground">
                This plan is {plan.status}. Reactivate it to continue the conversation.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Phases sidebar */}
      {showPhases && phases.length > 0 && (
        <motion.div
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 280, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          className="shrink-0 overflow-hidden border-l border-border"
        >
          <div className="w-70">
            <div className="border-b border-border px-4 py-3">
              <h3 className="text-sm font-semibold">Phases</h3>
              <p className="text-xs text-muted-foreground">
                {phases.filter((p) => p.status === "completed").length} of {phases.length} completed
              </p>
            </div>
            <div className="overflow-y-auto p-3">
              <div className="space-y-2">
                {phases.map((phase) => (
                  <button
                    key={phase.id}
                    onClick={() => handlePhaseToggle(phase.id, phase.status)}
                    className={cn(
                      "flex w-full items-start gap-2.5 rounded-lg p-2.5 text-left transition-colors hover:bg-muted/50",
                      phase.status === "completed" && "opacity-60",
                    )}
                  >
                    <span className="mt-0.5 text-sm shrink-0">
                      {phaseStatusIcon[phase.status]}
                    </span>
                    <div className="min-w-0">
                      <p className={cn(
                        "text-sm font-medium",
                        phase.status === "completed" && "line-through",
                      )}>
                        {phase.title}
                      </p>
                      {phase.description && (
                        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                          {phase.description}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}

/* ─── Message bubble ─── */

function MessageBubble({ message }: { message: PlanMessage }) {
  const isUser = message.role === "user";

  // Strip phases block from display
  const displayContent = message.content.replace(/```phases\n[\s\S]*?\n```/g, "").trim();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("flex", isUser ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-3",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted/70",
        )}
      >
        <div className="whitespace-pre-wrap text-sm leading-relaxed">
          {displayContent}
        </div>
        <p className={cn(
          "mt-1.5 text-[10px]",
          isUser ? "text-primary-foreground/50" : "text-muted-foreground/50",
        )}>
          {new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
    </motion.div>
  );
}
