"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  CommandLineIcon,
  Copy01Icon,
  CheckmarkCircle01Icon,
  Key01Icon,
  ArrowRight01Icon,
} from "@hugeicons/core-free-icons";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] as const },
  },
};

const commands = [
  {
    name: "remb save",
    description: "Save a context entry for a project feature",
    usage: "remb save --project <name> --feature <name> --content <text>",
    flags: [
      { flag: "--project, -p", desc: "Target project name" },
      { flag: "--feature, -f", desc: "Feature or module name" },
      { flag: "--content, -c", desc: "Context content text" },
      { flag: "--tags, -t", desc: "Comma-separated tags" },
    ],
    example: 'remb save -p my-saas -f auth -c "Added PKCE flow for OAuth"',
    category: "Core",
  },
  {
    name: "remb get",
    description: "Retrieve context entries with optional filtering",
    usage: "remb get --project <name> [--feature <name>] [--limit <n>]",
    flags: [
      { flag: "--project, -p", desc: "Target project name" },
      { flag: "--feature, -f", desc: "Filter by feature (optional)" },
      { flag: "--limit, -l", desc: "Max entries to return (default: 10)" },
      { flag: "--format", desc: "Output format: json, table, markdown" },
    ],
    example: "remb get -p my-saas -f auth --format json",
    category: "Core",
  },
  {
    name: "remb scan",
    description: "Auto-scan a directory to generate context entries",
    usage: "remb scan --project <name> --path <directory>",
    flags: [
      { flag: "--project, -p", desc: "Target project name" },
      { flag: "--path", desc: "Directory path to scan" },
      { flag: "--depth, -d", desc: "Max recursion depth (default: 5)" },
      { flag: "--ignore", desc: "Glob patterns to ignore" },
    ],
    example: "remb scan -p my-saas --path src/auth --depth 3",
    category: "Scanning",
  },
  {
    name: "remb init",
    description: "Initialize a new project with remb tracking",
    usage: "remb init [project-name]",
    flags: [
      { flag: "--template", desc: "Use a project template" },
      { flag: "--force", desc: "Overwrite existing configuration" },
    ],
    example: "remb init my-new-project",
    category: "Setup",
  },
  {
    name: "remb link",
    description: "Link features together with dependency relationships",
    usage: "remb link --from <feature> --to <feature> --type <relation>",
    flags: [
      { flag: "--from", desc: "Source feature name" },
      { flag: "--to", desc: "Target feature name" },
      { flag: "--type", desc: "Relationship type: depends_on, extends, uses" },
      { flag: "--project, -p", desc: "Target project" },
    ],
    example: 'remb link --from oauth --to session --type depends_on -p my-saas',
    category: "Relations",
  },
  {
    name: "remb serve",
    description: "Start the MCP server for AI tool integration",
    usage: "remb serve [--port <number>]",
    flags: [
      { flag: "--port", desc: "Server port (default: 3100)" },
      { flag: "--host", desc: "Host to bind to (default: localhost)" },
      { flag: "--cors", desc: "Enable CORS for web clients" },
    ],
    example: "remb serve --port 3100 --cors",
    category: "Server",
  },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);

  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={copy}
      className="text-muted-foreground hover:text-foreground shrink-0"
    >
      <HugeiconsIcon
        icon={copied ? CheckmarkCircle01Icon : Copy01Icon}
        strokeWidth={2}
        className="size-3.5"
      />
    </Button>
  );
}

export default function CLIPage() {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-6 sm:space-y-8"
    >
      {/* Header */}
      <motion.div variants={item}>
        <h1 className="text-xl sm:text-2xl font-semibold tracking-[-0.04em] text-foreground">
          CLI Reference
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Complete command reference for the remb CLI tool.
        </p>
      </motion.div>

      {/* Install */}
      <motion.div variants={item}>
        <Card className="border-border/40">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex size-8 items-center justify-center rounded-lg bg-muted/60">
                  <HugeiconsIcon
                    icon={CommandLineIcon}
                    strokeWidth={2}
                    className="size-4 text-muted-foreground"
                  />
                </div>
                <div>
                  <p className="text-[13px] font-medium text-foreground">
                    Installation
                  </p>
                  <code className="text-xs text-muted-foreground font-mono">
                    npm install -g remb
                  </code>
                </div>
              </div>
              <CopyButton text="npm install -g remb" />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* API Key Setup */}
      <motion.div variants={item}>
        <Card className="border-border/40">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <HugeiconsIcon
                icon={Key01Icon}
                strokeWidth={2}
                className="size-4 text-muted-foreground"
              />
              <CardTitle className="text-[14px]">Authentication</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Generate an API key in{" "}
              <span className="font-medium text-foreground">Settings → API Keys</span>,
              then pass it as a Bearer token.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-lg bg-muted/40 p-3">
              <div className="flex items-start justify-between gap-2">
                <code className="text-xs font-mono text-foreground break-all">
                  Authorization: Bearer remb_your_key_here
                </code>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* API Endpoints */}
      <motion.div variants={item}>
        <Card className="border-border/40">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                strokeWidth={2}
                className="size-4 text-muted-foreground"
              />
              <CardTitle className="text-[14px]">API Endpoints</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Use these endpoints directly with curl, or through the CLI commands below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Save */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="h-4.5 text-[9px] px-1.5 font-mono">
                  POST
                </Badge>
                <code className="text-xs font-mono text-foreground">/api/cli/context/save</code>
              </div>
              <div className="rounded-lg bg-foreground/3 dark:bg-foreground/6 p-3 overflow-x-auto">
                <div className="flex items-start justify-between gap-2">
                  <code className="text-xs font-mono text-blue-600 dark:text-blue-400 break-all whitespace-pre-wrap">{`$ curl -X POST /api/cli/context/save \
  -H "Authorization: Bearer remb_..." \\
  -H "Content-Type: application/json" \\
  -d '{"projectSlug":"my-app","featureName":"auth","content":"Added PKCE flow"}'`}</code>
                  <CopyButton text={`curl -X POST /api/cli/context/save -H "Authorization: Bearer remb_..." -H "Content-Type: application/json" -d '{"projectSlug":"my-app","featureName":"auth","content":"Added PKCE flow"}'`} />
                </div>
              </div>
            </div>

            <Separator />

            {/* Get */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="h-4.5 text-[9px] px-1.5 font-mono">
                  GET
                </Badge>
                <code className="text-xs font-mono text-foreground">/api/cli/context/get</code>
              </div>
              <div className="rounded-lg bg-foreground/3 dark:bg-foreground/6 p-3 overflow-x-auto">
                <div className="flex items-start justify-between gap-2">
                  <code className="text-xs font-mono text-blue-600 dark:text-blue-400 break-all whitespace-pre-wrap">{`$ curl "/api/cli/context/get?projectSlug=my-app&featureName=auth&limit=5" \\
  -H "Authorization: Bearer remb_..."`}</code>
                  <CopyButton text={`curl "/api/cli/context/get?projectSlug=my-app&featureName=auth&limit=5" -H "Authorization: Bearer remb_..."`} />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Commands */}
      <div className="space-y-4">
        {commands.map((cmd) => (
          <motion.div key={cmd.name} variants={item}>
            <Card className="border-border/40">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-[14px] font-mono tracking-[-0.01em]">
                    {cmd.name}
                  </CardTitle>
                  <Badge
                    variant="secondary"
                    className="h-4.5 text-[9px] px-1.5"
                  >
                    {cmd.category}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {cmd.description}
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Usage */}
                <div className="rounded-lg bg-muted/40 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <code className="text-xs font-mono text-foreground break-all">
                      {cmd.usage}
                    </code>
                    <CopyButton text={cmd.usage} />
                  </div>
                </div>

                {/* Flags */}
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/70">
                    Flags
                  </p>
                  <div className="grid gap-1">
                    {cmd.flags.map((flag) => (
                      <div
                        key={flag.flag}
                        className="flex items-baseline gap-3 text-xs"
                      >
                        <code className="shrink-0 font-mono text-foreground/80 min-w-32.5">
                          {flag.flag}
                        </code>
                        <span className="text-muted-foreground">
                          {flag.desc}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Example */}
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/70 mb-1.5">
                    Example
                  </p>
                  <div className="rounded-lg bg-foreground/3 dark:bg-foreground/6 p-3 overflow-x-auto">
                    <div className="flex items-start justify-between gap-2">
                      <code className="text-xs font-mono text-blue-600 dark:text-blue-400 break-all">
                        $ {cmd.example}
                      </code>
                      <CopyButton text={cmd.example} />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
