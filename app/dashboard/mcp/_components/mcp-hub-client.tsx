"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  PlugSocketIcon,
  Add01Icon,
  Delete02Icon,
  Loading03Icon,
  AlertCircleIcon,
  LockIcon,
  MoreVerticalIcon,
  Wrench01Icon,
  RefreshIcon,
  Copy01Icon,
  CheckmarkCircle01Icon,
  InformationCircleIcon,
  ApiIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  addMcpServer,
  removeMcpServer,
  toggleMcpServer,
  testMcpServer,
  fetchServerTools,
  updateDisabledTools,
  type McpServerInfo,
} from "@/lib/mcp-actions";
import { initMcpOAuth, checkMcpOAuthStatus } from "@/lib/mcp-oauth";
import type { HealthResult, ServerTool } from "@/lib/mcp-proxy";
import { addNotification } from "@/components/dashboard/notification-center";

/* ─── copy helper ─── */

function useCopy(resetMs = 2000) {
  const [copied, setCopied] = React.useState(false);
  const copy = React.useCallback(
    (text: string) => {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), resetMs);
    },
    [resetMs]
  );
  return { copied, copy };
}

/* ─── status dot config ─── */

const STATUS_DOT = {
  healthy: "bg-emerald-500",
  unhealthy: "bg-red-400",
  unknown: "bg-zinc-400",
} as const;

/* ─── IDE logos ─── */

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
      <rect width="24" height="24" rx="6" fill="#0d0d0d" />
      <path d="M4 17c4-6 10-9 16-9-4 6-10 9-16 9z" fill="#5fd4f4" />
      <path
        d="M4 13c3-4 7-6 12-6-3 4-7 6-12 6z"
        fill="#5fd4f4"
        opacity="0.6"
      />
    </svg>
  );
}

function ZedLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <rect width="24" height="24" rx="6" fill="#000" />
      <text
        x="4"
        y="17"
        fontFamily="monospace"
        fontSize="12"
        fontWeight="bold"
        fill="white"
      >
        Z
      </text>
    </svg>
  );
}

function NeovimLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <rect width="24" height="24" rx="6" fill="#1f1f1f" />
      <path
        d="M5 19V6l4 5 4-7 6 15"
        stroke="#57A143"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ─── IDE config data ─── */

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
      icon: <CursorLogo className="size-4" />,
      authMethod: "oauth",
      configPath: "~/.cursor/mcp.json",
      snippet: (url) =>
        JSON.stringify(
          { mcpServers: { remb: { type: "http", url } } },
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
      icon: <VSCodeLogo className="size-4" />,
      authMethod: "oauth",
      configPath: ".vscode/mcp.json (workspace) or settings.json (global)",
      snippet: (url) =>
        JSON.stringify(
          { servers: { remb: { type: "http", url } } },
          null,
          2
        ),
      steps: (url) => [
        'Open Command Palette (⌘⇧P) → "MCP: Add Server..."',
        `Choose HTTP and enter: ${url}`,
        "Or create .vscode/mcp.json in your workspace with the config below",
        "VS Code will prompt you to authorize via OAuth automatically",
      ],
      note: "Requires VS Code 1.99+ or VS Code Insiders with the MCP extension.",
    },
    {
      id: "windsurf",
      name: "Windsurf",
      icon: <WindsurfLogo className="size-4" />,
      authMethod: "api-key",
      configPath: "~/.codeium/windsurf/mcp_config.json",
      snippet: (url) =>
        JSON.stringify(
          {
            mcpServers: {
              remb: {
                serverUrl: url,
                headers: { Authorization: "Bearer <your-api-key>" },
              },
            },
          },
          null,
          2
        ),
      steps: () => [
        "Go to Dashboard → API Keys and create a new key",
        "Open Windsurf Settings → Cascade → MCP Servers",
        "Or edit ~/.codeium/windsurf/mcp_config.json with the config below",
        "Replace <your-api-key> with your actual key and restart Windsurf",
      ],
      note: "Windsurf doesn't support OAuth for MCP yet — use an API key from your dashboard.",
    },
    {
      id: "zed",
      name: "Zed",
      icon: <ZedLogo className="size-4" />,
      authMethod: "api-key",
      configPath: "~/.config/zed/settings.json",
      snippet: (url) =>
        JSON.stringify(
          {
            context_servers: {
              remb: {
                settings: {
                  url,
                  headers: { Authorization: "Bearer <your-api-key>" },
                },
              },
            },
          },
          null,
          2
        ),
      steps: () => [
        "Go to Dashboard → API Keys and create a new key",
        "Open Zed → Settings (⌘,) and find context_servers",
        "Add the remb config below to your settings.json",
        "Replace <your-api-key> with your actual key",
      ],
      note: "Zed uses context_servers instead of mcpServers.",
    },
    {
      id: "neovim",
      name: "Neovim",
      icon: <NeovimLogo className="size-4" />,
      authMethod: "api-key",
      configPath: "Plugin config (e.g. mcphub.nvim or avante.nvim)",
      snippet: (url) =>
        `-- Example using mcphub.nvim\nrequire("mcphub").setup({\n  servers = {\n    remb = {\n      url = "${url}",\n      headers = {\n        Authorization = "Bearer <your-api-key>",\n      },\n    },\n  },\n})`,
      steps: () => [
        "Go to Dashboard → API Keys and create a new key",
        "Install an MCP plugin (mcphub.nvim, avante.nvim, etc.)",
        "Add the remb server config to your plugin setup",
        "Replace <your-api-key> with your actual key and restart Neovim",
      ],
      note: "The exact config format depends on your Neovim MCP plugin. The snippet uses mcphub.nvim syntax.",
    },
  ];
}

/* ─── Connect IDE Modal ─── */

function ConnectIdeModal({
  open,
  onOpenChange,
  endpointUrl,
  onGoToApiKeys,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  endpointUrl: string;
  onGoToApiKeys: () => void;
}) {
  const ides = React.useMemo(() => getIdes(), []);
  const [selectedIde, setSelectedIde] = React.useState(ides[0].id);
  const { copied: urlCopied, copy: copyUrl } = useCopy();
  const { copied: snippetCopied, copy: copySnippet } = useCopy();

  const ide = ides.find((i) => i.id === selectedIde) ?? ides[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Connect your IDE</DialogTitle>
          <DialogDescription>
            One endpoint for all your MCP servers. Pick your IDE and follow the
            steps below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {/* Endpoint URL */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Your MCP Endpoint
            </p>
            <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-muted/30 px-3 py-2">
              <code className="flex-1 text-xs font-mono text-foreground/90 truncate select-all">
                {endpointUrl}
              </code>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => copyUrl(endpointUrl)}
                className="shrink-0 text-muted-foreground hover:text-foreground"
                aria-label="Copy endpoint URL"
              >
                <HugeiconsIcon
                  icon={urlCopied ? CheckmarkCircle01Icon : Copy01Icon}
                  strokeWidth={2}
                  className="size-3.5"
                />
              </Button>
            </div>
          </div>

          {/* IDE selector */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              IDE
            </p>
            <Select value={selectedIde} onValueChange={setSelectedIde}>
              <SelectTrigger className="h-9">
                <SelectValue>
                  <div className="flex items-center gap-2">
                    {ide.icon}
                    <span>{ide.name}</span>
                  </div>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ides.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    <div className="flex items-center gap-2">
                      {i.icon}
                      <span>{i.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Auth badge + config path */}
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                ide.authMethod === "oauth"
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
              }`}
            >
              {ide.authMethod === "oauth" ? "OAuth (automatic)" : "API Key"}
            </span>
            <span className="text-[10px] text-muted-foreground font-mono truncate">
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
            <div className="relative group/code">
              <pre
                className={`rounded-lg border border-border/40 bg-muted/20 p-3 text-[11px] font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap ${
                  ide.id === "neovim"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-foreground/80"
                }`}
              >
                {ide.snippet(endpointUrl)}
              </pre>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => copySnippet(ide.snippet(endpointUrl))}
                className="absolute top-2 right-2 opacity-0 group-hover/code:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                aria-label="Copy configuration snippet"
              >
                <HugeiconsIcon
                  icon={snippetCopied ? CheckmarkCircle01Icon : Copy01Icon}
                  strokeWidth={2}
                  className="size-3"
                />
              </Button>
            </div>
          </div>

          {/* API key CTA for api-key IDEs */}
          {ide.authMethod === "api-key" && (
            <div className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/20 px-3 py-2.5">
              <p className="text-[11px] text-muted-foreground">
                Need an API key for this IDE?
              </p>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={() => {
                  onOpenChange(false);
                  onGoToApiKeys();
                }}
              >
                <HugeiconsIcon
                  icon={ApiIcon}
                  strokeWidth={2}
                  className="size-3"
                />
                Go to API Keys
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Auth Required Modal ─── */

function AuthRequiredModal({
  open,
  onOpenChange,
  serverName,
  isAuthenticating,
  onAuthenticate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  serverName: string;
  isAuthenticating: boolean;
  onAuthenticate: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HugeiconsIcon
              icon={LockIcon}
              strokeWidth={2}
              className="size-4 text-amber-500"
            />
            Authentication Required
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{serverName}</span>{" "}
            requires OAuth authentication. Sign in with the provider to connect.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={isAuthenticating}
            onClick={onAuthenticate}
            className="gap-1.5"
          >
            {isAuthenticating ? (
              <HugeiconsIcon
                icon={Loading03Icon}
                strokeWidth={2}
                className="size-3 animate-spin"
              />
            ) : (
              <HugeiconsIcon
                icon={LockIcon}
                strokeWidth={2}
                className="size-3"
              />
            )}
            {isAuthenticating ? "Authenticating\u2026" : "Authenticate"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Server Detail Dialog (tools + toggle) ─── */

function ServerDetailDialog({
  server,
  open,
  onOpenChange,
  onUpdated,
}: {
  server: McpServerInfo;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onUpdated: (s: McpServerInfo) => void;
}) {
  const [tools, setTools] = React.useState<ServerTool[]>([]);
  const [disabledSet, setDisabledSet] = React.useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [hasChanges, setHasChanges] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const initialDisabledRef = React.useRef<Set<string>>(new Set());
  const ns = server.name.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetchServerTools(server.id)
      .then(({ tools: t, disabledTools }) => {
        if (cancelled) return;
        setTools(t);
        const ds = new Set(disabledTools);
        setDisabledSet(ds);
        initialDisabledRef.current = new Set(disabledTools);
        setHasChanges(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load tools");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, server.id]);

  const toggleTool = (name: string) => {
    setDisabledSet((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      const changed =
        next.size !== initialDisabledRef.current.size ||
        [...next].some((n) => !initialDisabledRef.current.has(n));
      setHasChanges(changed);
      return next;
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updated = await updateDisabledTools(
        server.id,
        Array.from(disabledSet)
      );
      onUpdated(updated);
      initialDisabledRef.current = new Set(disabledSet);
      setHasChanges(false);
    } catch {
      addNotification({
        type: "error",
        title: "Failed to save tool settings",
        message: "Could not update disabled tools. Please try again.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const enabledCount = tools.length - disabledSet.size;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <span
              className={`inline-flex size-2 rounded-full ${STATUS_DOT[server.health_status]}`}
            />
            {server.name}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-1">
              <p className="text-xs truncate">{server.url}</p>
              <p className="text-xs text-muted-foreground">
                Transport: {server.transport} · Auth: {server.auth_type}
                {server.last_health_check &&
                  ` · Last checked: ${new Date(server.last_health_check).toLocaleString()}`}
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        {/* Namespacing info */}
        <div className="shrink-0 rounded-lg border border-border/40 bg-muted/20 px-3 py-2.5 space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Routing
          </p>
          <p className="text-xs text-foreground/80">
            Tools from this server are exposed through your endpoint as{" "}
            <code className="text-[11px] bg-muted rounded px-1 py-0.5 font-mono">
              {ns}__&lt;tool_name&gt;
            </code>
          </p>
          <p className="text-[10px] text-muted-foreground">
            When your IDE calls a tool, we match the namespace prefix, strip it,
            and forward the original call to{" "}
            <span className="font-medium">{server.name}</span>. The response
            flows back through us to your IDE.
          </p>
        </div>

        {/* Tools section */}
        <div className="flex items-center justify-between shrink-0">
          <p className="text-xs font-medium">
            Tools{" "}
            {tools.length > 0 && (
              <span className="text-muted-foreground font-normal">
                ({enabledCount} of {tools.length} enabled)
              </span>
            )}
          </p>
          {hasChanges && (
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isSaving}
              className="gap-1.5 text-xs h-7"
            >
              {isSaving ? (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  strokeWidth={2}
                  className="size-3 animate-spin"
                />
              ) : (
                <HugeiconsIcon
                  icon={CheckmarkCircle01Icon}
                  strokeWidth={2}
                  className="size-3"
                />
              )}
              Save changes
            </Button>
          )}
        </div>

        {/* Tools list (scrollable) */}
        <div>
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <HugeiconsIcon
                icon={Loading03Icon}
                strokeWidth={2}
                className="size-4 animate-spin"
              />
              <span className="ml-2 text-xs">Loading tools…</span>
            </div>
          ) : error ? (
            <div className="rounded-lg bg-red-500/5 border border-red-500/20 px-3 py-2 text-[11px] text-red-500 dark:text-red-400">
              {error}
            </div>
          ) : tools.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <HugeiconsIcon
                icon={Wrench01Icon}
                strokeWidth={1.5}
                className="size-5 text-muted-foreground/40"
              />
              <p className="text-xs text-muted-foreground">
                No tools discovered yet
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[45vh]">
              <div className="space-y-0.5 pr-3">
                {tools.map((tool) => {
                  const isEnabled = !disabledSet.has(tool.name);
                  const namespacedName = `${ns}__${tool.name}`;
                  return (
                    <div
                      key={tool.name}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium font-mono truncate">
                          {namespacedName}
                        </p>
                        {tool.description && (
                          <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">
                            {tool.description}
                          </p>
                        )}
                      </div>
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={() => toggleTool(tool.name)}
                      />
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── main component ─── */

export function McpHubClient({
  initialServers,
}: {
  initialServers: McpServerInfo[];
}) {
  const router = useRouter();
  const [servers, setServers] = React.useState(initialServers);
  const [showAddDialog, setShowAddDialog] = React.useState(false);
  const [showIdeModal, setShowIdeModal] = React.useState(false);
  const [testingId, setTestingId] = React.useState<string | null>(null);
  const [autoTestingIds, setAutoTestingIds] = React.useState<Set<string>>(
    new Set()
  );
  const [authenticatingId, setAuthenticatingId] = React.useState<
    string | null
  >(null);
  const [authModalServerId, setAuthModalServerId] = React.useState<
    string | null
  >(null);
  const [detailServerId, setDetailServerId] = React.useState<string | null>(
    null
  );
  const toggleAborts = React.useRef<Record<string, AbortController>>({});

  // Auto-health-check active servers on mount — notify about unhealthy ones
  React.useEffect(() => {
    const staleServers = initialServers.filter(
      (s) =>
        s.is_active &&
        (s.health_status !== "healthy" ||
          !s.last_health_check ||
          Date.now() - new Date(s.last_health_check).getTime() > 10 * 60 * 1000)
    );
    if (staleServers.length === 0) return;

    let cancelled = false;
    setAutoTestingIds((prev) => {
      const next = new Set(prev);
      staleServers.forEach((s) => next.add(s.id));
      return next;
    });

    Promise.allSettled(
      staleServers.map(async (server) => {
        try {
          const result = await testMcpServer(server.id);
          if (cancelled) return;
          setServers((prev) =>
            prev.map((s) => (s.id === server.id ? { ...result } : s))
          );
          if (result.health_status === "unhealthy") {
            addNotification({
              type: "warning",
              title: "MCP server issue detected",
              message: `"${server.name}" is unreachable or returned an error. Check connection or re-authenticate.`,
              action: result.lastTestResult.status === "auth_required"
                ? { label: "Authenticate", onClick: () => setAuthModalServerId(server.id) }
                : undefined,
            });
          }
        } catch {
          // Server may have been deleted externally
        } finally {
          if (!cancelled) {
            setAutoTestingIds((prev) => {
              const next = new Set(prev);
              next.delete(server.id);
              return next;
            });
          }
        }
      })
    );

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const endpointUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/mcp`
      : "/api/mcp";

  const { copied: endpointCopied, copy: copyEndpoint } = useCopy();

  const handleToggle = async (id: string) => {
    toggleAborts.current[id]?.abort();
    const controller = new AbortController();
    toggleAborts.current[id] = controller;

    setServers((prev) =>
      prev.map((s) => (s.id === id ? { ...s, is_active: !s.is_active } : s))
    );
    try {
      const updated = await toggleMcpServer(id);
      if (controller.signal.aborted) return;
      setServers((prev) => prev.map((s) => (s.id === id ? updated : s)));
    } catch {
      if (controller.signal.aborted) return;
      setServers((prev) =>
        prev.map((s) => (s.id === id ? { ...s, is_active: !s.is_active } : s))
      );
      const server = servers.find((s) => s.id === id);
      addNotification({
        type: "error",
        title: "Toggle failed",
        message: `Could not update "${server?.name ?? "server"}". The change has been reverted.`,
      });
    } finally {
      if (toggleAborts.current[id] === controller) {
        delete toggleAborts.current[id];
      }
    }
  };

  const handleRemove = async (id: string) => {
    const server = servers.find((s) => s.id === id);
    try {
      await removeMcpServer(id);
      setServers((prev) => prev.filter((s) => s.id !== id));
      addNotification({
        type: "info",
        title: "MCP server removed",
        message: `"${server?.name ?? "Server"}" has been disconnected. Connected IDEs will be notified to refresh their tool list.`,
      });
    } catch {
      addNotification({
        type: "error",
        title: "Failed to remove server",
        message: `Could not remove "${server?.name ?? "Server"}". Please try again.`,
      });
    }
  };

  const handleRetry = async (id: string) => {
    const server = servers.find((s) => s.id === id);
    setTestingId(id);
    try {
      const result = await testMcpServer(id);
      setServers((prev) => prev.map((s) => (s.id === id ? { ...result } : s)));
      if (result.lastTestResult.status === "auth_required") {
        setAuthModalServerId(id);
        addNotification({
          type: "warning",
          title: "Authentication required",
          message: `"${server?.name ?? "Server"}" requires re-authentication. Click to authorize.`,
          action: { label: "Authenticate", onClick: () => setAuthModalServerId(id) },
        });
      } else if (result.health_status === "unhealthy") {
        addNotification({
          type: "error",
          title: "MCP server unreachable",
          message: `"${server?.name ?? "Server"}" failed health check: ${result.lastTestResult.message ?? "connection failed"}`,
        });
      } else if (result.health_status === "healthy") {
        addNotification({
          type: "success",
          title: "MCP server connected",
          message: `"${server?.name ?? "Server"}" is healthy — ${result.tools_count} tools available.`,
        });
      }
    } catch {
      addNotification({
        type: "error",
        title: "Health check failed",
        message: `Could not reach "${server?.name ?? "Server"}". It may have been removed or is offline.`,
      });
    } finally {
      setTestingId(null);
    }
  };

  const handleAuthenticate = React.useCallback(
    async (serverId: string) => {
      setAuthenticatingId(serverId);
      try {
        const { authorizationUrl } = await initMcpOAuth(serverId);

        const w = 520;
        const h = 680;
        const left = window.screenX + (window.outerWidth - w) / 2;
        const top = window.screenY + (window.outerHeight - h) / 2;
        const popup = window.open(
          authorizationUrl,
          "mcp-oauth",
          `width=${w},height=${h},left=${left},top=${top},popup=yes`
        );
        const authWindow = popup ?? window.open(authorizationUrl, "_blank");

        const onMessage = async (event: MessageEvent) => {
          if (
            event.origin !== window.location.origin ||
            event.data?.type !== "mcp-oauth-complete"
          )
            return;
          window.removeEventListener("message", onMessage);

          if (event.data.error) {
            setAuthenticatingId(null);
            setAuthModalServerId(null);
            return;
          }

          try {
            const result = await testMcpServer(serverId);
            setServers((prev) =>
              prev.map((s) => (s.id === serverId ? { ...result } : s))
            );
          } finally {
            setAuthenticatingId(null);
            setAuthModalServerId(null);
          }
        };
        window.addEventListener("message", onMessage);

        if (authWindow) {
          const pollInterval = setInterval(async () => {
            if (authWindow.closed) {
              clearInterval(pollInterval);
              window.removeEventListener("message", onMessage);
              try {
                const { authenticated } =
                  await checkMcpOAuthStatus(serverId);
                if (authenticated) {
                  const result = await testMcpServer(serverId);
                  setServers((prev) =>
                    prev.map((s) =>
                      s.id === serverId ? { ...result } : s
                    )
                  );
                }
              } finally {
                setAuthenticatingId(null);
                setAuthModalServerId(null);
              }
            }
          }, 1000);
        }
      } catch {
        setAuthenticatingId(null);
        setAuthModalServerId(null);
        addNotification({
          type: "error",
          title: "Authentication failed",
          message: "Could not complete MCP server authentication. Please try again.",
        });
      }
    },
    []
  );

  const handleAdded = (server: McpServerInfo) => {
    setServers((prev) => [...prev, server]);
    setShowAddDialog(false);
    // Auto-test in background
    setAutoTestingIds((prev) => new Set(prev).add(server.id));
    testMcpServer(server.id)
      .then((result) => {
        setServers((prev) =>
          prev.map((s) => (s.id === server.id ? { ...result } : s))
        );
        if (result.lastTestResult.status === "auth_required") {
          setAuthModalServerId(server.id);
        }
      })
      .catch(() => {
        addNotification({
          type: "warning",
          title: "Initial health check failed",
          message: `Could not verify "${server.name}". You can retry from the server card.`,
        });
      })
      .finally(() => {
        setAutoTestingIds((prev) => {
          const next = new Set(prev);
          next.delete(server.id);
          return next;
        });
      });
  };

  const activeCount = servers.filter((s) => s.is_active).length;
  const connectedCount = servers.filter(
    (s) => s.health_status === "healthy"
  ).length;
  const totalTools = servers
    .filter((s) => s.is_active && s.health_status === "healthy")
    .reduce(
      (sum, s) => sum + Math.max(0, s.tools_count - s.disabled_tools.length),
      0
    );

  const authModalServer = authModalServerId
    ? servers.find((s) => s.id === authModalServerId)
    : null;
  const detailServer = detailServerId
    ? servers.find((s) => s.id === detailServerId)
    : null;

  return (
    <div className="space-y-8">
      {/* ─── Page header ─── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">MCP Hub</h1>
          <p className="text-[13px] text-muted-foreground mt-1 max-w-lg">
            Connect all your MCP servers here. Your IDE only needs one
            endpoint&nbsp;&mdash; we aggregate everything behind it.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 h-8 text-xs"
            onClick={() => router.push("/dashboard/api")}
          >
            <HugeiconsIcon
              icon={ApiIcon}
              strokeWidth={2}
              className="size-3.5"
            />
            API Keys
          </Button>
          <Button
            size="sm"
            className="gap-1.5 h-8 text-xs"
            onClick={() => setShowIdeModal(true)}
          >
            <HugeiconsIcon
              icon={PlugSocketIcon}
              strokeWidth={2}
              className="size-3.5"
            />
            Connect your IDE
          </Button>
        </div>
      </div>

      {/* ─── Endpoint card ─── */}
      <div className="rounded-xl border border-border/50 bg-card p-4">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
          Your MCP Endpoint
        </p>
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0 flex items-center gap-2 rounded-lg border border-border/40 bg-muted/30 px-3 py-2">
            <code className="flex-1 text-xs font-mono text-foreground/90 truncate select-all">
              {endpointUrl}
            </code>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => copyEndpoint(endpointUrl)}
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              <HugeiconsIcon
                icon={endpointCopied ? CheckmarkCircle01Icon : Copy01Icon}
                strokeWidth={2}
                className="size-3.5"
              />
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5 shrink-0"
            onClick={() => setShowIdeModal(true)}
          >
            <HugeiconsIcon
              icon={PlugSocketIcon}
              strokeWidth={2}
              className="size-3.5"
            />
            Setup guide
          </Button>
        </div>
      </div>

      {/* ─── Stats row ─── */}
      {servers.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-border/40 bg-card px-4 py-3">
            <p className="text-2xl font-semibold tabular-nums">
              {activeCount}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Active servers
            </p>
          </div>
          <div className="rounded-xl border border-border/40 bg-card px-4 py-3">
            <p className="text-2xl font-semibold tabular-nums">
              {connectedCount}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Connected
            </p>
          </div>
          <div className="rounded-xl border border-border/40 bg-card px-4 py-3">
            <p className="text-2xl font-semibold tabular-nums">{totalTools}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Tools available
            </p>
          </div>
        </div>
      )}

      {/* ─── Servers section ─── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">
            Servers{" "}
            <span className="text-muted-foreground font-normal">
              ({servers.length})
            </span>
          </p>
          <Button
            size="sm"
            onClick={() => setShowAddDialog(true)}
            className="gap-1.5 h-7 text-xs"
          >
            <HugeiconsIcon
              icon={Add01Icon}
              strokeWidth={2}
              className="size-3"
            />
            Add server
          </Button>
        </div>

        {/* Empty state */}
        {servers.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-dashed border-border/60 py-16 flex flex-col items-center gap-3"
          >
            <div className="flex size-12 items-center justify-center rounded-full bg-muted/50">
              <HugeiconsIcon
                icon={PlugSocketIcon}
                strokeWidth={1.5}
                className="size-5 text-muted-foreground/50"
              />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-muted-foreground">
                No servers yet
              </p>
              <p className="text-xs text-muted-foreground/60 max-w-xs">
                Add your upstream MCP servers and we&apos;ll aggregate them
                into one endpoint for your IDE.
              </p>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddDialog(true)}
                className="gap-1.5 text-xs"
              >
                <HugeiconsIcon
                  icon={Add01Icon}
                  strokeWidth={2}
                  className="size-3"
                />
                Add your first server
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowIdeModal(true)}
                className="gap-1.5 text-xs text-muted-foreground"
              >
                <HugeiconsIcon
                  icon={PlugSocketIcon}
                  strokeWidth={2}
                  className="size-3"
                />
                Connect IDE
              </Button>
            </div>
          </motion.div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <AnimatePresence mode="popLayout">
              {servers.map((server) => {
                const isTesting = testingId === server.id;
                const isAutoTesting = autoTestingIds.has(server.id);
                const isAuthenticating = authenticatingId === server.id;
                const isPending = isTesting || isAutoTesting || isAuthenticating;

                const dotColor = isPending
                  ? "bg-amber-400"
                  : STATUS_DOT[server.health_status];

                const pendingLabel = isAutoTesting
                  ? "Connecting\u2026"
                  : isTesting
                    ? "Retrying\u2026"
                    : "Authenticating\u2026";

                return (
                  <motion.div
                    key={server.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="group rounded-xl border border-border/50 bg-card hover:border-border/80 transition-colors cursor-pointer"
                    onClick={() => setDetailServerId(server.id)}
                  >
                    <div className="flex items-start gap-3 px-4 py-3.5">
                      {/* Status dot */}
                      <span className="relative flex size-2.5 shrink-0 mt-1.5">
                        {(server.health_status === "healthy" || isPending) && (
                          <span
                            className={`absolute inline-flex size-full animate-ping rounded-full ${isPending ? "bg-amber-400" : "bg-emerald-400"} opacity-60`}
                          />
                        )}
                        <span
                          className={`relative inline-flex size-2.5 rounded-full ${dotColor}`}
                        />
                      </span>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">
                            {server.name}
                          </span>
                          {!server.is_active && (
                            <span className="text-[9px] text-muted-foreground bg-muted rounded px-1 py-0.5 shrink-0">
                              Paused
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                          {server.url}
                        </p>
                        {isPending && (
                          <p className="text-[10px] text-amber-500 mt-1 flex items-center gap-1">
                            <HugeiconsIcon
                              icon={Loading03Icon}
                              strokeWidth={2}
                              className="size-3 animate-spin"
                            />
                            {pendingLabel}
                          </p>
                        )}
                        {!isPending &&
                          server.health_status === "unhealthy" && (
                            <p className="text-[10px] text-red-400 mt-1">
                              Connection failed
                            </p>
                          )}
                      </div>

                      {/* Right controls */}
                      <div
                        className="flex items-center gap-2 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {server.tools_count > 0 && !isPending && (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <HugeiconsIcon
                              icon={Wrench01Icon}
                              strokeWidth={2}
                              className="size-3"
                            />
                            <span className="text-[11px]">
                              {server.tools_count}
                            </span>
                          </div>
                        )}

                        {server.health_status === "unhealthy" &&
                          !isPending && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => handleRetry(server.id)}
                              className="text-red-400 hover:text-red-500 hover:bg-red-500/10"
                              title="Retry connection"
                            >
                              <HugeiconsIcon
                                icon={RefreshIcon}
                                strokeWidth={2}
                                className="size-3.5"
                              />
                            </Button>
                          )}

                        <Switch
                          checked={server.is_active}
                          onCheckedChange={() => handleToggle(server.id)}
                        />

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <HugeiconsIcon
                                icon={MoreVerticalIcon}
                                strokeWidth={2}
                                className="size-3.5"
                              />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem
                              onClick={() => setDetailServerId(server.id)}
                            >
                              <HugeiconsIcon
                                icon={Wrench01Icon}
                                strokeWidth={2}
                                className="mr-2 size-3.5"
                              />
                              View tools
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleRetry(server.id)}
                              disabled={isPending}
                            >
                              <HugeiconsIcon
                                icon={RefreshIcon}
                                strokeWidth={2}
                                className="mr-2 size-3.5"
                              />
                              Retry connection
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => handleRemove(server.id)}
                            >
                              <HugeiconsIcon
                                icon={Delete02Icon}
                                strokeWidth={2}
                                className="mr-2 size-3.5"
                              />
                              Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* ─── Modals ─── */}
      <ConnectIdeModal
        open={showIdeModal}
        onOpenChange={setShowIdeModal}
        endpointUrl={endpointUrl}
        onGoToApiKeys={() => router.push("/dashboard/api")}
      />

      <AddServerDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onAdded={handleAdded}
      />

      {authModalServer && (
        <AuthRequiredModal
          open={!!authModalServerId}
          onOpenChange={(v) => {
            if (!v) setAuthModalServerId(null);
          }}
          serverName={authModalServer.name}
          isAuthenticating={authenticatingId === authModalServerId}
          onAuthenticate={() => handleAuthenticate(authModalServer.id)}
        />
      )}

      {detailServer && (
        <ServerDetailDialog
          server={detailServer}
          open={!!detailServerId}
          onOpenChange={(v) => {
            if (!v) setDetailServerId(null);
          }}
          onUpdated={(updated) =>
            setServers((prev) =>
              prev.map((s) => (s.id === updated.id ? updated : s))
            )
          }
        />
      )}
    </div>
  );
}

/* ─── Add server dialog ─── */

function AddServerDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdded: (server: McpServerInfo) => void;
}) {
  const [name, setName] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [transport, setTransport] = React.useState<"streamable-http" | "sse">(
    "streamable-http"
  );
  const [authType, setAuthType] = React.useState<
    "none" | "bearer" | "custom-header" | "oauth"
  >("none");
  const [authToken, setAuthToken] = React.useState("");
  const [isAdding, setIsAdding] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const reset = () => {
    setName("");
    setUrl("");
    setTransport("streamable-http");
    setAuthType("none");
    setAuthToken("");
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !url.trim()) {
      setError("Name and URL are required");
      return;
    }
    setIsAdding(true);
    try {
      const server = await addMcpServer({
        name: name.trim(),
        url: url.trim(),
        transport,
        auth_type: authType,
        auth_token: authType === "bearer" ? authToken : undefined,
      });
      onAdded(server);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add server");
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add MCP Server</DialogTitle>
          <DialogDescription>
            Register an MCP server to aggregate into your endpoint.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="add-name" className="text-xs">
              Name
            </Label>
            <Input
              id="add-name"
              placeholder="e.g. supabase, figma, github"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="add-url" className="text-xs">
              Server URL
            </Label>
            <Input
              id="add-url"
              placeholder="https://mcp.example.com/mcp"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="h-8"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Transport</Label>
              <Select
                value={transport}
                onValueChange={(v) =>
                  setTransport(v as "streamable-http" | "sse")
                }
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="streamable-http">
                    Streamable HTTP
                  </SelectItem>
                  <SelectItem value="sse">SSE</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Authentication</Label>
              <Select
                value={authType}
                onValueChange={(v) =>
                  setAuthType(
                    v as "none" | "bearer" | "custom-header" | "oauth"
                  )
                }
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="bearer">Bearer Token</SelectItem>
                  <SelectItem value="custom-header">Custom Header</SelectItem>
                  <SelectItem value="oauth">OAuth</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {authType === "bearer" && (
            <div className="space-y-1.5">
              <Label htmlFor="add-token" className="text-xs">
                Bearer Token
              </Label>
              <Input
                id="add-token"
                type="password"
                placeholder="Token for upstream auth"
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
                className="h-8"
              />
              <p className="text-[10px] text-muted-foreground/60">
                Some MCPs require authentication. Provide the token here so we
                can forward it when connecting.
              </p>
            </div>
          )}

          {authType === "oauth" && (
            <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 px-3 py-2 text-[11px] text-amber-600 dark:text-amber-400">
              <p>
                After adding the server, test the connection and you&apos;ll be
                prompted to authenticate with the provider via a popup.
              </p>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-500/5 border border-red-500/20 px-3 py-2 text-[11px] text-red-500 dark:text-red-400">
              <HugeiconsIcon
                icon={AlertCircleIcon}
                strokeWidth={2}
                className="size-3.5 shrink-0"
              />
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isAdding || !name.trim() || !url.trim()}
              className="gap-1.5"
            >
              {isAdding ? (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  strokeWidth={2}
                  className="size-3 animate-spin"
                />
              ) : (
                <HugeiconsIcon
                  icon={Add01Icon}
                  strokeWidth={2}
                  className="size-3"
                />
              )}
              Add Server
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
