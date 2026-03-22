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
    title: "Multi-Agent Scanning",
    desc: "5-phase pipeline: Scout, Analyze, Architect, Review, Finalize. Extracts features, code symbols, architecture layers, and dependency graphs from your entire codebase.",
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
    icon: GitBranch,
    title: "Code Graph & Architecture",
    desc: "Queryable graph of every function, class, and component. Architecture layers auto-detected. Trace call chains, imports, and data flows.",
    span: 3,
  },
  {
    icon: Monitor,
    title: "AI Chat with Full Context",
    desc: "Chat with your codebase. The AI assembles relevant memories, code symbols, and conversation history into every response \u2014 15 tools at its disposal.",
    span: 3,
  },
  {
    icon: Cpu,
    title: "Development Plans",
    desc: "AI creates phased development plans. Track phases, auto-complete plans when all phases finish. Visible in chat and dashboard.",
    span: 2,
  },
  {
    icon: Shield,
    title: "Secure by Default",
    desc: "Credentials stored with chmod 600. OAuth PKCE for login. Scoped tokens per project.",
    span: 2,
  },
  {
    icon: Database,
    title: "Web Dashboard",
    desc: "Visual project explorer, feature graph, memory manager, conversation history browser, MCP hub for connecting external AI tools.",
    span: 2,
  },
];

/* ─── MCP ─── */
export const MCP_CAPS: McpCapItem[] = [
  {
    icon: Database,
    title: "42 MCP Tools",
    desc: "Memory, conversations, plans, code graph, scanning, cross-project search, architecture analysis \u2014 all as autonomous tool calls.",
  },
  {
    icon: Globe,
    title: "Remote SSE Server",
    desc: "Connect via useremb.com \u2014 no local binary needed. Add the URL to your MCP config and your AI has instant access.",
  },
  {
    icon: Cpu,
    title: "Local stdio Mode",
    desc: "Run remb serve for a local MCP server. Works offline with any client that supports stdio transport.",
  },
  {
    icon: RefreshCw,
    title: "Auto-Session Protocol",
    desc: "On session start, Remb automatically loads project context, conversation history, and architecture layers.",
  },
];

export const MCP_REMOTE_CONFIG = `{
  "mcpServers": {
    "remb": {
      "type": "http",
      "url": "https://www.useremb.com/api/mcp"
    }
  }
}`;

export const MCP_LOCAL_CONFIG = `{
  "mcpServers": {
    "remb": {
      "command": "remb",
      "args": ["serve"]
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
    desc: "Initialize project \u2014 detects IDE, injects AI context, registers on Remb.",
  },
  { cmd: "remb login", desc: "Authenticate via browser OAuth or API key." },
  {
    cmd: "remb push",
    desc: "Trigger a cloud scan with live progress after pushing code.",
  },
  {
    cmd: "remb scan",
    desc: "Local scan \u2014 reads files from disk, groups by directory, uploads context.",
  },
  {
    cmd: "remb save",
    desc: "Save a context entry for a specific feature or module.",
  },
  {
    cmd: "remb get",
    desc: "Retrieve context entries with filtering by feature.",
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
    cmd: "curl -fsSL https://www.useremb.com/install.sh | sh",
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
    code: "curl -fsSL https://www.useremb.com/install.sh | sh",
  },
  {
    n: "2",
    title: "Initialize",
    desc: "Auto-detects IDE, offers sign-in, registers project, injects AI context.",
    code: "remb init",
  },
  {
    n: "3",
    title: "Push",
    desc: "Trigger a cloud scan to extract features from your codebase.",
    code: "remb push",
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
    title: "Install & Init",
    desc: "Install the CLI, then run init \u2014 it auto-detects your IDE, offers to sign in, registers the project on Remb, and injects AI context into the right config files.",
    lines: [
      { type: "cmd", text: "curl -fsSL https://www.useremb.com/install.sh | sh" },
      { type: "cmd", text: "remb init" },
      { type: "out", text: "\u2139 Detected IDE: VS Code (GitHub Copilot)" },
      { type: "out", text: "  Sign in now? [Y/n]: Y" },
      { type: "out", text: "\u2714 Authenticated as samie105!" },
      { type: "out", text: "\u2714 Project my-app initialized!" },
      { type: "out", text: "\u2139 AI context injected into: .github/copilot-instructions.md" },
    ],
  },
  {
    num: "02",
    title: "Scan & Remember",
    desc: "Push your codebase to Remb. It analyzes every file \u2014 features, patterns, dependencies. Save decisions as persistent memories.",
    lines: [
      { type: "cmd", text: "remb push" },
      { type: "out", text: "\u2714 Scanning 247 files across 12 directories..." },
      { type: "out", text: "\u2714 Extracted 31 features, 5 service boundaries" },
      {
        type: "cmd",
        text: 'remb save -f auth -c "Using PKCE OAuth with refresh rotation"',
      },
      { type: "out", text: "\u2714 Saved to auth (core tier)" },
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
