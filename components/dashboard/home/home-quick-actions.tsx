"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  CommandLineIcon,
  BookOpen01Icon,
  PlugSocketIcon,
} from "@hugeicons/core-free-icons";
import { item } from "./shared";

const actions = [
  {
    label: "CLI Reference",
    description: "Push context from terminal",
    href: "/dashboard/cli",
    icon: CommandLineIcon,
  },
  {
    label: "MCP Hub",
    description: "Connect AI tools",
    href: "/dashboard/mcp",
    icon: PlugSocketIcon,
  },
  {
    label: "Docs",
    description: "Guides & reference",
    href: "/dashboard/docs",
    icon: BookOpen01Icon,
  },
];

export function HomeQuickActions() {
  return (
    <motion.div variants={item} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {actions.map((action) => (
        <Link key={action.label} href={action.href}>
          <div className="group flex items-center gap-3 rounded-xl border border-border/40 bg-card px-4 py-3.5 transition-colors duration-200 hover:border-border/80 hover:bg-muted/30 cursor-pointer">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/50">
              <HugeiconsIcon
                icon={action.icon}
                strokeWidth={2}
                className="size-3.5 text-muted-foreground transition-colors group-hover:text-foreground"
              />
            </div>
            <div>
              <p className="text-[13px] font-medium text-foreground">
                {action.label}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {action.description}
              </p>
            </div>
          </div>
        </Link>
      ))}
    </motion.div>
  );
}
