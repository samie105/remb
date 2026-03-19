import {
  Brain,
  Search,
  MessageSquare,
  FileCode,
  Shield,
  GitBranch,
  RefreshCw,
  Layers,
  Monitor,
  Database,
  Globe,
  Cpu,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/* ─── Types ─── */
export type NavSection = { id: string; label: string };
export type ProblemItem = { icon: LucideIcon; title: string; desc: string };
export type FeatureItem = {
  icon: LucideIcon;
  title: string;
  desc: string;
  span: number;
  badge?: string;
  extra?: boolean;
};
export type McpCapItem = { icon: LucideIcon; title: string; desc: string };
export type CliCmdItem = { cmd: string; desc: string };
export type InstallMethodItem = { label: string; desc: string; cmd: string };
export type QuickStepItem = {
  n: string;
  title: string;
  desc: string;
  code: string;
};
export type HowStepLine = { type: "cmd" | "out"; text: string };
export type HowStepItem = {
  num: string;
  title: string;
  desc: string;
  lines: HowStepLine[];
};

/* ─── Nav ─── */
export const NAV_SECTIONS: NavSection[] = [
  { id: "hero", label: "Home" },
  { id: "problem", label: "Problem" },
  { id: "features", label: "Features" },
  { id: "how-it-works", label: "How It Works" },
  { id: "mcp", label: "MCP" },
  { id: "cli", label: "CLI" },
  { id: "install", label: "Install" },
];

/* ─── Problems ─── */
export const PROBLEMS: ProblemItem[] = [
  {
    icon: MessageSquare,
    title: "Repeated Explanations",
    desc: '"This project uses App Router with server actions..." \u2014 typed for the 50th time.',
  },
  {
    icon: GitBranch,
    title: "Lost Decisions",
    desc: "You spent hours on a state management approach. New session? AI suggests the one you rejected.",
  },
  {
    icon: FileCode,
    title: "No Project Awareness",
    desc: "AI doesn\u2019t know your folder structure, naming conventions, or dependencies.",
  },
  {
    icon: RefreshCw,
    title: "Broken Continuity",
    desc: 'Yesterday you built auth together. Today: "What authentication approach would you like to use?"',
  },
];

/* ─── Features ─── */
export const FEATURES: FeatureItem[] = [
  {
    icon: Brain,
    title: "Tiered Persistent Memory",
    desc: "Memories in three layers \u2014 Core loads every session, Active surfaces on-demand, Archive stores long-term.",
    span: 4,
    badge: "Core",
    extra: true,
  },
  {
    icon: Search,
    title: "Codebase Scanning",
    desc: "Connects to GitHub, scans your repo, extracts features, dependencies, and architectural patterns.",
    span: 2,
  },
  {
    icon: MessageSquare,
    title: "Conversation Continuity",
    desc: "Every session is logged \u2014 what was discussed, built, decided. Next session starts with full history.",
    span: 2,
  },
  {
    icon: Layers,
    title: "Cross-Project Intelligence",
    desc: 'Search memories across all projects. Say "do it like in project X" and your AI pulls matching patterns.',
    span: 4,
    badge: "Multi-project",
  },
  {
    icon: Shield,
    title: "Secure by Default",
    desc: "Credentials stored with chmod 600. OAuth PKCE for login. Scoped tokens per project.",
    span: 3,
  },
  {
    icon: Monitor,
    title: "Web Dashboard",
    desc: "Visual project explorer, feature graph visualizer, memory management, MCP hub for connecting AI tools.",
    span: 3,
  },
];

/* ─── MCP ─── */
export const MCP_CAPS: McpCapItem[] = [
  {
    icon: Database,
    title: "21 MCP Tools",
    desc: "Load context, search memories, log conversations, trigger scans, manage projects \u2014 all as autonomous tool calls.",
  },
  {
    icon: Globe,
    title: "Remote SSE Server",
    desc: "Connect via mcp.useremb.com \u2014 no local binary needed. Add the URL to your MCP config.",
  },
  {
    icon: Cpu,
    title: "Local stdio Mode",
    desc: "Run remb serve for an offline MCP server. Works with any client that supports local processes.",
  },
  {
    icon: RefreshCw,
    title: "Auto-Session Protocol",
    desc: "On session start, Remb loads project context and conversation history automatically.",
  },
];

export const MCP_REMOTE_CONFIG = `{
  "mcpServers": {
    "remb": {
      "url": "https://mcp.useremb.com/sse"
    }
  }
}`;

export const MCP_LOCAL_CONFIG = `{
  "mcpServers": {
    "remb": {
      "command": "remb",
      "args": ["serve", "--project", "my-app"]
    }
  }
}`;

export const SUPPORTED_TOOLS = [
  "Claude Desktop",
  "Cursor",
  "VS Code Copilot",
  "Windsurf",
  "Zed",
  "Neovim",
];

/* ─── CLI ─── */
export const CLI_CMDS: CliCmdItem[] = [
  {
    cmd: "remb init",
    desc: "Initialize project tracking. Connects GitHub, scans codebase, extracts features.",
  },
  { cmd: "remb login", desc: "Authenticate via browser OAuth or API key." },
  {
    cmd: "remb save",
    desc: "Save a context entry for a specific feature or module.",
  },
  {
    cmd: "remb get",
    desc: "Retrieve context entries with filtering by feature.",
  },
  {
    cmd: "remb scan",
    desc: "Auto-scan a directory to generate context. Set depth, ignore patterns.",
  },
  {
    cmd: "remb link",
    desc: "Link features with dependency relationships (depends_on, extends, uses).",
  },
  {
    cmd: "remb serve",
    desc: "Start the MCP server over stdio for AI tool integration.",
  },
  {
    cmd: "remb context",
    desc: "Load full project context bundle \u2014 memories, features, tech stack.",
  },
  {
    cmd: "remb memory",
    desc: "Create, list, search, promote, or delete persistent memories.",
  },
];

/* ─── Install ─── */
export const INSTALL_METHODS: InstallMethodItem[] = [
  {
    label: "curl",
    desc: "Zero dependencies, Go binary",
    cmd: "curl -fsSL https://useremb.com/install.sh | sh",
  },
  { label: "npm", desc: "Node.js CLI", cmd: "npm install -g remb-cli" },
  {
    label: "Homebrew",
    desc: "macOS & Linux",
    cmd: "brew tap samie105/remb && brew install remb",
  },
  {
    label: "VS Code",
    desc: "Extension marketplace",
    cmd: "ext install remb.remb",
  },
];

export const QUICK_STEPS: QuickStepItem[] = [
  {
    n: "1",
    title: "Install",
    desc: "Go binary is fastest \u2014 single binary, no runtime.",
    code: "curl -fsSL https://useremb.com/install.sh | sh",
  },
  {
    n: "2",
    title: "Authenticate",
    desc: "Opens browser for OAuth. Creates a scoped API token.",
    code: "remb login",
  },
  {
    n: "3",
    title: "Initialize",
    desc: "Connects GitHub, scans codebase, extracts features.",
    code: "remb init",
  },
  {
    n: "4",
    title: "Connect your AI",
    desc: "Add Remb as an MCP server. Context injection is automatic.",
    code: '{\n  "mcpServers": {\n    "remb": { "url": "https://mcp.useremb.com/sse" }\n  }\n}',
  },
];

/* ─── How It Works ─── */
export const HOW_STEPS: HowStepItem[] = [
  {
    num: "01",
    title: "Connect & Scan",
    desc: "Point Remb at your GitHub repo. It analyzes your entire codebase \u2014 folder structure, frameworks, dependencies, feature boundaries, and architectural patterns.",
    lines: [
      { type: "cmd", text: "remb init" },
      { type: "out", text: "\u2714 Connected to github.com/you/my-app" },
      {
        type: "out",
        text: "\u2714 Scanning 247 files across 12 directories...",
      },
      {
        type: "out",
        text: "\u2714 Extracted 31 features, 5 service boundaries",
      },
      {
        type: "out",
        text: "\u2714 Identified: Next.js 15, Prisma, tRPC, Tailwind",
      },
    ],
  },
  {
    num: "02",
    title: "Learn & Remember",
    desc: "As you code with AI, Remb captures decisions, patterns, and context. Memories are tiered by importance.",
    lines: [
      {
        type: "cmd",
        text: 'remb save -f auth -c "Using PKCE OAuth with refresh rotation"',
      },
      { type: "out", text: "\u2714 Saved to auth (core tier)" },
      { type: "cmd", text: "remb memory list --tier core" },
      { type: "out", text: "  1. Auth: PKCE OAuth with refresh rotation" },
      {
        type: "out",
        text: "  2. DB: Prisma with connection pooling via PgBouncer",
      },
      {
        type: "out",
        text: "  3. State: Zustand for client, server actions for mutations",
      },
    ],
  },
  {
    num: "03",
    title: "Auto-Load Every Session",
    desc: "When your AI starts a new conversation, Remb\u2019s MCP server automatically injects project context, conversation history, and relevant memories.",
    lines: [
      { type: "cmd", text: "# AI automatically calls on session start:" },
      { type: "out", text: "\u2192 remb__memory_load_context()" },
      { type: "out", text: "  Loading 8 core memories..." },
      { type: "out", text: "  Loading 3 recent conversations..." },
      { type: "out", text: "  Loading feature map (31 features)..." },
      { type: "out", text: "\u2192 AI is now fully context-aware" },
    ],
  },
];
