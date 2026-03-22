"use client";

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { SparklesIcon, File02Icon, PencilEdit02Icon, RepeatIcon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { InlineDiagram } from "@/components/dashboard/interactive-diagram";
import type { ChatMessage } from "@/lib/chat-store";

/* ─── mermaid code block detection ─── */

const MERMAID_RE = /```mermaid\s*\n([\s\S]*?)```/g;

export function splitContentWithDiagrams(content: string): Array<{ type: "text" | "diagram"; value: string }> {
  const parts: Array<{ type: "text" | "diagram"; value: string }> = [];
  let lastIndex = 0;
  const re = new RegExp(MERMAID_RE.source, "g");
  let match;

  while ((match = re.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: content.slice(lastIndex, match.index) });
    }
    parts.push({ type: "diagram", value: match[1].trim() });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push({ type: "text", value: content.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ type: "text", value: content }];
}

/* ─── file path detection ─── */

const FILE_PATH_RE = /(?:^|\s|`)((?:[\w@.-]+\/)+[\w.-]+\.\w{1,10})(?:`|\s|$|[,;:)])/g;

function getFileLabel(filePath: string) {
  const parts = filePath.split("/");
  const fileName = parts[parts.length - 1];
  const ext = fileName.split(".").pop() ?? "";

  if (fileName === "route.ts" || fileName === "route.tsx") {
    const method = parts.includes("api") ? "API" : "Page";
    const routePath = parts.slice(parts.indexOf("api") >= 0 ? parts.indexOf("api") : 0, -1).join("/");
    return { name: routePath || fileName, type: `${method} Route`, description: `${method} endpoint at ${filePath}` };
  }
  if (fileName === "page.tsx" || fileName === "page.ts") {
    const pagePath = parts.slice(parts.indexOf("app") >= 0 ? parts.indexOf("app") + 1 : 0, -1).join("/");
    return { name: pagePath || "root", type: "Page", description: `Next.js page at /${pagePath}` };
  }
  if (parts.includes("components")) {
    return { name: fileName.replace(/\.\w+$/, ""), type: "Component", description: `React component at ${filePath}` };
  }
  if (fileName.startsWith("use") || parts.includes("hooks")) {
    return { name: fileName.replace(/\.\w+$/, ""), type: "Hook", description: `React hook at ${filePath}` };
  }
  if (parts.includes("lib") || parts.includes("utils")) {
    return { name: fileName.replace(/\.\w+$/, ""), type: "Library", description: `Utility module at ${filePath}` };
  }

  const typeMap: Record<string, string> = {
    ts: "TypeScript", tsx: "Component", js: "JavaScript", jsx: "Component",
    css: "Stylesheet", json: "Config", md: "Document", sql: "Migration",
  };
  return { name: fileName.replace(/\.\w+$/, ""), type: typeMap[ext] ?? "File", description: filePath };
}

function FilePathLink({ filePath }: { filePath: string }) {
  const info = getFileLabel(filePath);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-[12px] font-medium text-foreground cursor-default hover:bg-accent transition-colors">
          <HugeiconsIcon icon={File02Icon} className="size-3 text-muted-foreground shrink-0" />
          <span className="truncate max-w-45">{info.name}</span>
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

/* ─── markdown components ─── */

const markdownComponents: Components = {
  code({ className, children, ...props }) {
    const isInline = !className;
    const text = String(children).replace(/\n$/, "");

    if (isInline && FILE_PATH_RE.test(text)) {
      FILE_PATH_RE.lastIndex = 0;
      return <FilePathLink filePath={text} />;
    }

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

/* ─── AI Avatar ─── */

function AiAvatar({ size = "sm" }: { size?: "sm" | "md" }) {
  const dim = size === "sm" ? "size-6" : "size-7";
  const iconDim = size === "sm" ? "size-3" : "size-3.5";
  return (
    <div className={cn(
      "shrink-0 flex items-center justify-center rounded-full bg-linear-to-br from-violet-500/20 to-blue-500/20 ring-1 ring-violet-500/10",
      dim,
    )}>
      <HugeiconsIcon icon={SparklesIcon} strokeWidth={2} className={cn(iconDim, "text-violet-600 dark:text-violet-400")} />
    </div>
  );
}

/* ─── Message bubble ─── */

export function MessageBubble({
  message,
  variant = "mini",
  isLastAssistant,
  isStreaming,
  onEdit,
  onRetry,
}: {
  message: ChatMessage;
  variant?: "mini" | "full";
  isLastAssistant?: boolean;
  isStreaming?: boolean;
  onEdit?: (messageId: string, content: string) => void;
  onRetry?: () => void;
}) {
  const isUser = message.role === "user";
  const [isEditing, setIsEditing] = React.useState(false);
  const [editContent, setEditContent] = React.useState(message.content);
  if (!message.content && !isUser) return null;

  const isFull = variant === "full";

  if (isUser) {
    return (
      <div className="group flex flex-col items-end gap-1">
        <div className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5 leading-relaxed bg-foreground text-background",
          isFull ? "text-sm rounded-br-md" : "text-[13px]",
        )}>
          {isEditing ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full rounded-lg border border-background/20 bg-background/10 px-2 py-1.5 text-background text-sm resize-none focus:outline-none min-h-15"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    setIsEditing(false);
                    if (editContent.trim() && editContent !== message.content) {
                      onEdit?.(message.id, editContent.trim());
                    }
                  }
                  if (e.key === "Escape") {
                    setIsEditing(false);
                    setEditContent(message.content);
                  }
                }}
              />
              <div className="flex justify-end gap-1.5">
                <button
                  onClick={() => { setIsEditing(false); setEditContent(message.content); }}
                  className="text-[11px] px-2 py-0.5 rounded-md text-background/70 hover:text-background transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    if (editContent.trim() && editContent !== message.content) {
                      onEdit?.(message.id, editContent.trim());
                    }
                  }}
                  className="text-[11px] px-2 py-0.5 rounded-md bg-background/20 text-background hover:bg-background/30 transition-colors"
                >
                  Send
                </button>
              </div>
            </div>
          ) : (
            message.content
          )}
        </div>
        {!isEditing && onEdit && !isStreaming && (
          <button
            onClick={() => { setEditContent(message.content); setIsEditing(true); }}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-accent text-muted-foreground"
            title="Edit message"
          >
            <HugeiconsIcon icon={PencilEdit02Icon} className="size-3" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="group flex flex-col gap-1">
      <div className="flex items-start gap-2.5">
        <AiAvatar size={isFull ? "md" : "sm"} />
        <div className={cn(
          "max-w-[90%] leading-relaxed prose-chat pt-0.5",
          isFull ? "text-sm" : "text-[13px]",
        )}>
          {splitContentWithDiagrams(message.content).map((part, i) =>
            part.type === "diagram" ? (
              <InlineDiagram key={i} code={part.value} />
            ) : (
              <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {part.value}
              </ReactMarkdown>
            ),
          )}
        </div>
      </div>
      {isLastAssistant && onRetry && !isStreaming && message.content && (
        <button
          onClick={onRetry}
          className="opacity-0 group-hover:opacity-100 transition-opacity ml-8 p-1 rounded-md hover:bg-accent text-muted-foreground self-start flex items-center gap-1 text-[11px]"
          title="Retry response"
        >
          <HugeiconsIcon icon={RepeatIcon} className="size-3" />
          <span>Retry</span>
        </button>
      )}
    </div>
  );
}
