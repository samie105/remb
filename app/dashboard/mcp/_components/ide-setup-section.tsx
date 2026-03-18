"use client";

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Copy01Icon,
  CheckmarkCircle01Icon,
  ZapIcon,
  InformationCircleIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

/* ─── copy helper ─── */

function useCopy() {
  const [copied, setCopied] = React.useState(false);
  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return { copied, copy };
}

/* ─── IDE icons ─── */

function CursorLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <rect width="24" height="24" rx="6" fill="#1a1a2e" />
      <path d="M6 18L18 12L6 6v4.5L12.5 12 6 13.5V18z" fill="white" />
    </svg>
  );
}

function VSCodeLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <rect width="24" height="24" rx="6" fill="#1e1e1e" />
      <path
        d="M16.5 3L8.5 10.2 5.5 7.8 4 8.7v6.6l1.5.9 3-2.4L16.5 21l3.5-1.7V4.7L16.5 3zm0 3.4v11.2l-5.5-5.6 5.5-5.6z"
        fill="#007acc"
      />
    </svg>
  );
}

function WindsurfLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <rect width="24" height="24" rx="6" fill="#0a1628" />
      <path
        d="M6 17c2-3 4-8 12-11-2 4-3.5 7-5 9.5C11.5 18 8 18 6 17z"
        fill="#00c2ff"
      />
    </svg>
  );
}

function ZedLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <rect width="24" height="24" rx="6" fill="#18181b" />
      <text
        x="12"
        y="16"
        textAnchor="middle"
        fill="#f59e0b"
        fontSize="12"
        fontWeight="bold"
        fontFamily="system-ui"
      >
        Z
      </text>
    </svg>
  );
}

function NeovimLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <rect width="24" height="24" rx="6" fill="#18181b" />
      <path
        d="M6 6l6 12V6h-2v7L6 6zm6 0v12l6-12h-2l-4 7V6z"
        fill="#57a143"
      />
    </svg>
  );
}

/* ─── IDE definition type ─── */

type IdeConfig = {
  id: string;
  name: string;
  icon: React.ReactNode;
  authMethod: "oauth" | "api-key";
  configPath: string;
  snippet: (url: string) => string;
  steps: (url: string) => string[];
  note?: string;
};

function getIdes(): IdeConfig[] {
  return [
    {
      id: "cursor",
      name: "Cursor",
      icon: <CursorLogo className="size-5" />,
      authMethod: "oauth",
      configPath: "~/.cursor/mcp.json",
      snippet: (url) =>
        JSON.stringify(
          {
            mcpServers: {
              remb: {
                type: "http",
                url,
              },
            },
          },
          null,
          2
        ),
      steps: () => [
        "Open Cursor Settings → MCP → Add new global MCP server",
        "Or edit ~/.cursor/mcp.json directly with the config below",
        "Restart Cursor — it will prompt you to authorize via OAuth",
        "Approve in the browser and you're connected",
      ],
      note: "Cursor supports OAuth natively — no API key needed.",
    },
    {
      id: "vscode",
      name: "VS Code",
      icon: <VSCodeLogo className="size-5" />,
      authMethod: "oauth",
      configPath: ".vscode/mcp.json (workspace) or settings.json (global)",
      snippet: (url) =>
        JSON.stringify(
          {
            servers: {
              remb: {
                type: "http",
                url,
              },
            },
          },
          null,
          2
        ),
      steps: (url) => [
        "Open Command Palette (⌘⇧P) → \"MCP: Add Server...\"",
        `Choose HTTP and enter: ${url}`,
        "Or create .vscode/mcp.json in your workspace with the config below",
        "VS Code will prompt you to authorize via OAuth automatically",
      ],
      note:
        "Requires VS Code 1.99+ or VS Code Insiders with the MCP extension. OAuth is built-in.",
    },
    {
      id: "windsurf",
      name: "Windsurf",
      icon: <WindsurfLogo className="size-5" />,
      authMethod: "api-key",
      configPath: "~/.codeium/windsurf/mcp_config.json",
      snippet: (url) =>
        JSON.stringify(
          {
            mcpServers: {
              remb: {
                serverUrl: url,
                headers: {
                  Authorization: "Bearer <your-api-key>",
                },
              },
            },
          },
          null,
          2
        ),
      steps: () => [
        "Go to Dashboard → Settings → API Keys and create a key",
        "Open Windsurf Settings → Cascade → MCP Servers",
        "Or edit ~/.codeium/windsurf/mcp_config.json with the config below",
        "Replace <your-api-key> with your actual key and restart Windsurf",
      ],
      note:
        "Windsurf doesn't support OAuth for MCP yet — use an API key from your dashboard.",
    },
    {
      id: "zed",
      name: "Zed",
      icon: <ZedLogo className="size-5" />,
      authMethod: "api-key",
      configPath: "~/.config/zed/settings.json",
      snippet: (url) =>
        JSON.stringify(
          {
            context_servers: {
              remb: {
                settings: {
                  url,
                  headers: {
                    Authorization: "Bearer <your-api-key>",
                  },
                },
              },
            },
          },
          null,
          2
        ),
      steps: () => [
        "Go to Dashboard → Settings → API Keys and create a key",
        "Open Zed → Settings (⌘,) and find context_servers",
        "Add the remb config below to your settings.json",
        "Replace <your-api-key> with your actual key",
      ],
      note: "Zed uses context_servers instead of mcpServers.",
    },
    {
      id: "neovim",
      name: "Neovim",
      icon: <NeovimLogo className="size-5" />,
      authMethod: "api-key",
      configPath: "Plugin config (e.g. mcphub.nvim or avante.nvim)",
      snippet: (url) =>
        `-- Example using mcphub.nvim
require("mcphub").setup({
  servers = {
    remb = {
      url = "${url}",
      headers = {
        Authorization = "Bearer <your-api-key>",
      },
    },
  },
})`,
      steps: () => [
        "Go to Dashboard → Settings → API Keys and create a key",
        "Install an MCP plugin (mcphub.nvim, avante.nvim, etc.)",
        "Add the remb server config to your plugin setup",
        "Replace <your-api-key> with your actual key and restart Neovim",
      ],
      note:
        "The exact config format depends on your Neovim MCP plugin. The snippet below uses mcphub.nvim syntax.",
    },
  ];
}

/* ─── Code block with copy ─── */

function CodeBlock({ code, language }: { code: string; language?: string }) {
  const { copied, copy } = useCopy();
  return (
    <div className="relative group/code">
      <pre
        className={`rounded-lg border border-border/40 bg-muted/20 p-3 text-[11px] font-mono leading-relaxed overflow-x-auto ${language === "lua" ? "text-emerald-600 dark:text-emerald-400" : "text-foreground/80"}`}
      >
        {code}
      </pre>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => copy(code)}
        className="absolute top-2 right-2 opacity-0 group-hover/code:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
      >
        <HugeiconsIcon
          icon={copied ? CheckmarkCircle01Icon : Copy01Icon}
          strokeWidth={2}
          className="size-3"
        />
      </Button>
    </div>
  );
}

/* ─── Main IDE setup section ─── */

export function IdeSetupSection({ endpointUrl }: { endpointUrl: string }) {
  const ides = getIdes();
  const { copied, copy } = useCopy();

  return (
    <div className="rounded-xl border border-border/50 bg-card p-5 space-y-5">
      {/* Header + endpoint */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-foreground">
            <HugeiconsIcon
              icon={ZapIcon}
              strokeWidth={2}
              className="size-3.5 text-background"
            />
          </div>
          <div>
            <p className="text-sm font-medium">Connect your IDE</p>
            <p className="text-[11px] text-muted-foreground">
              One endpoint for all your MCP servers
            </p>
          </div>
        </div>
      </div>

      {/* Endpoint URL row */}
      <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-muted/30 px-3 py-2">
        <code className="flex-1 text-xs font-mono text-foreground/90 truncate select-all">
          {endpointUrl}
        </code>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => copy(endpointUrl)}
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <HugeiconsIcon
            icon={copied ? CheckmarkCircle01Icon : Copy01Icon}
            strokeWidth={2}
            className="size-3.5"
          />
        </Button>
      </div>

      {/* IDE tabs */}
      <Tabs defaultValue="cursor" className="w-full">
        <TabsList variant="line" className="w-full justify-start gap-0 border-b border-border/40">
          {ides.map((ide) => (
            <TabsTrigger
              key={ide.id}
              value={ide.id}
              className="gap-1.5 text-xs px-3 data-[state=active]:text-foreground"
            >
              {ide.icon}
              {ide.name}
            </TabsTrigger>
          ))}
        </TabsList>

        {ides.map((ide) => (
          <TabsContent key={ide.id} value={ide.id} className="mt-4 space-y-4">
            {/* Auth badge */}
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  ide.authMethod === "oauth"
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                }`}
              >
                {ide.authMethod === "oauth" ? "OAuth (automatic)" : "API Key"}
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">
                {ide.configPath}
              </span>
            </div>

            {/* Steps */}
            <ol className="space-y-2">
              {ide.steps(endpointUrl).map((step, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground mt-0.5">
                    {i + 1}
                  </span>
                  <p className="text-[13px] text-foreground/90 leading-relaxed">
                    {step}
                  </p>
                </li>
              ))}
            </ol>

            {/* Note */}
            {ide.note && (
              <div className="flex items-start gap-2 rounded-lg bg-primary/5 border border-primary/10 px-3 py-2.5">
                <HugeiconsIcon
                  icon={InformationCircleIcon}
                  strokeWidth={2}
                  className="size-3.5 shrink-0 text-primary mt-0.5"
                />
                <p className="text-[11px] text-foreground/70 leading-relaxed">
                  {ide.note}
                </p>
              </div>
            )}

            {/* Config snippet */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Configuration
              </p>
              <CodeBlock
                code={ide.snippet(endpointUrl)}
                language={ide.id === "neovim" ? "lua" : "json"}
              />
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
