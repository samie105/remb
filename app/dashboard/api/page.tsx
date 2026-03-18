"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ApiIcon,
  Copy01Icon,
  CheckmarkCircle01Icon,
  ArrowRight01Icon,
  Key01Icon,
  CommandLineIcon,
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
import { ApiKeysSection } from "@/components/dashboard/api-keys-section";

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

export default function ApiPage() {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-6 sm:space-y-8"
    >
      <motion.div variants={item}>
        <h1 className="text-xl sm:text-2xl font-semibold tracking-[-0.04em] text-foreground">
          API Reference
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Manage API keys and call Remb endpoints from scripts, tools, and CI.
        </p>
      </motion.div>

      <motion.div variants={item}>
        <ApiKeysSection />
      </motion.div>

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
              Pass your key as a Bearer token in the Authorization header.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg bg-muted/40 p-3">
              <div className="flex items-start justify-between gap-2">
                <code className="text-xs font-mono text-foreground break-all">
                  Authorization: Bearer remb_your_key_here
                </code>
                <CopyButton text="Authorization: Bearer remb_your_key_here" />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={item}>
        <Card className="border-border/40">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <HugeiconsIcon
                icon={ApiIcon}
                strokeWidth={2}
                className="size-4 text-muted-foreground"
              />
              <CardTitle className="text-[14px]">Endpoints</CardTitle>
            </div>
            <CardDescription className="text-xs">
              Two core endpoints are available right now: save context and retrieve context.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="h-4.5 text-[9px] px-1.5 font-mono">
                  POST
                </Badge>
                <code className="text-xs font-mono text-foreground">/api/cli/context/save</code>
              </div>
              <div className="rounded-lg bg-foreground/3 dark:bg-foreground/6 p-3">
                <div className="flex items-start justify-between gap-2">
                  <code className="text-xs font-mono text-blue-600 dark:text-blue-400 break-all whitespace-pre-wrap">{`$ curl -X POST /api/cli/context/save \\
  -H "Authorization: Bearer remb_..." \\
  -H "Content-Type: application/json" \\
  -d '{"projectSlug":"my-app","featureName":"auth","content":"Added PKCE flow"}'`}</code>
                  <CopyButton text={`curl -X POST /api/cli/context/save -H "Authorization: Bearer remb_..." -H "Content-Type: application/json" -d '{"projectSlug":"my-app","featureName":"auth","content":"Added PKCE flow"}'`} />
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="h-4.5 text-[9px] px-1.5 font-mono">
                  GET
                </Badge>
                <code className="text-xs font-mono text-foreground">/api/cli/context/get</code>
              </div>
              <div className="rounded-lg bg-foreground/3 dark:bg-foreground/6 p-3">
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

      <motion.div variants={item}>
        <Card className="border-border/40">
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <HugeiconsIcon icon={CommandLineIcon} strokeWidth={2} className="size-3.5" />
              The CLI uses these same endpoints under the hood.
              <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-3" />
              You can test both with curl first.
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
