"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  BookOpen01Icon,
  ArrowUpRight01Icon,
  Search01Icon,
  CommandLineIcon,
  Globe02Icon,
  Settings01Icon,
  Layers01Icon,
  WorkflowSquare10Icon,
} from "@hugeicons/core-free-icons";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

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

const sections = [
  {
    title: "Getting Started",
    description: "Set up Remb and create your first project",
    icon: BookOpen01Icon,
    articles: [
      { title: "Installation Guide", time: "3 min read" },
      { title: "Quick Start Tutorial", time: "5 min read" },
      { title: "Project Configuration", time: "4 min read" },
    ],
  },
  {
    title: "CLI Usage",
    description: "Complete reference for CLI commands and flags",
    icon: CommandLineIcon,
    articles: [
      { title: "Core Commands", time: "6 min read" },
      { title: "Scanning & Auto-indexing", time: "4 min read" },
      { title: "Feature Linking", time: "3 min read" },
    ],
  },
  {
    title: "MCP Server",
    description: "Deploy and configure the Model Context Protocol server",
    icon: Globe02Icon,
    articles: [
      { title: "Server Setup", time: "5 min read" },
      { title: "AI Tool Integration", time: "7 min read" },
      { title: "Custom Endpoints", time: "4 min read" },
    ],
  },
  {
    title: "Web Dashboard",
    description: "Navigate and use the visual dashboard interface",
    icon: Layers01Icon,
    articles: [
      { title: "Dashboard Overview", time: "3 min read" },
      { title: "Project Management", time: "4 min read" },
      { title: "Context Search", time: "3 min read" },
    ],
  },
  {
    title: "Visualizer",
    description: "Feature graph and dependency visualization tools",
    icon: WorkflowSquare10Icon,
    articles: [
      { title: "Using the Visualizer", time: "5 min read" },
      { title: "Node & Edge Types", time: "3 min read" },
      { title: "Exporting Graphs", time: "2 min read" },
    ],
  },
  {
    title: "Configuration",
    description: "Advanced settings and environment configuration",
    icon: Settings01Icon,
    articles: [
      { title: "Config File Reference", time: "6 min read" },
      { title: "Environment Variables", time: "3 min read" },
      { title: "Ignore Patterns", time: "2 min read" },
    ],
  },
];

export default function DocsPage() {
  const [search, setSearch] = React.useState("");

  const filtered = sections.filter(
    (s) =>
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.description.toLowerCase().includes(search.toLowerCase()) ||
      s.articles.some((a) =>
        a.title.toLowerCase().includes(search.toLowerCase())
      )
  );

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
          Documentation
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Learn how to use Remb for persistent AI session memory.
        </p>
      </motion.div>

      {/* Search */}
      <motion.div variants={item} className="max-w-md">
        <div className="relative">
          <HugeiconsIcon
            icon={Search01Icon}
            strokeWidth={2}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground"
          />
          <Input
            placeholder="Search documentation..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
      </motion.div>

      {/* Docs grid */}
      <motion.div
        variants={item}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
      >
        {filtered.map((section) => (
          <Card
            key={section.title}
            className="group border-border/40 hover:border-border/80 transition-all duration-300"
          >
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-xl bg-muted/50 transition-colors group-hover:bg-muted">
                  <HugeiconsIcon
                    icon={section.icon}
                    strokeWidth={2}
                    className="size-4 text-foreground/70"
                  />
                </div>
                <div>
                  <CardTitle className="text-[14px]">{section.title}</CardTitle>
                  <CardDescription className="text-[11px]">
                    {section.description}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-1">
              {section.articles.map((article) => (
                <div
                  key={article.title}
                  className="flex items-center justify-between rounded-lg px-2 py-2 -mx-2 cursor-pointer hover:bg-muted/40 transition-colors group/article"
                >
                  <span className="text-[13px] text-foreground/80 group-hover/article:text-foreground transition-colors">
                    {article.title}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground/60">
                      {article.time}
                    </span>
                    <HugeiconsIcon
                      icon={ArrowUpRight01Icon}
                      strokeWidth={2}
                      className="size-3 text-muted-foreground/40 group-hover/article:text-foreground transition-colors"
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </motion.div>
    </motion.div>
  );
}
