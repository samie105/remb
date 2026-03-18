"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  GithubIcon,
  ArrowRight01Icon,
  CommandLineIcon,
  Layers01Icon,
  Radar01Icon,
  LinkSquare01Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { initiateGitHubOAuth } from "@/lib/github-actions";
import { toast } from "sonner";

const features = [
  {
    icon: CommandLineIcon,
    title: "CLI + IDE Integration",
    description: "Save context from your terminal or editor in one command.",
  },
  {
    icon: Layers01Icon,
    title: "Feature Mapping",
    description: "Organize knowledge by feature, not by file.",
  },
  {
    icon: Radar01Icon,
    title: "Auto-Scanner",
    description: "Let AI scan your codebase and build context automatically.",
  },
  {
    icon: LinkSquare01Icon,
    title: "Session Memory",
    description: "Persistent memory that survives across AI sessions.",
  },
];

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.2 },
  },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] as const },
  },
};

const floatUp = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.25, 0.1, 0.25, 1] as const },
  },
};

export function AuthClient() {
  const [isLoading, setIsLoading] = React.useState(false);

  async function handleGitHubSignIn() {
    setIsLoading(true);
    try {
      const { url } = await initiateGitHubOAuth();
      window.location.href = url;
    } catch {
      setIsLoading(false);
      toast.error("Sign-in failed. Please check your connection and try again.");
    }
  }

  return (
    <div className="relative flex min-h-svh">
      {/* Background grid pattern */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.02)_1px,transparent_1px)] bg-size-[64px_64px] dark:bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,transparent_0%,var(--background)_70%)]" />
      </div>

      {/* Theme toggle */}
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggle />
      </div>

      {/* Left panel — branding + features (hidden on mobile) */}
      <div className="relative z-10 hidden w-1/2 flex-col justify-between p-12 lg:flex">
        {/* Top: Logo */}
        <motion.div
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
          className="flex items-center gap-3"
        >
          <div className="flex size-9 items-center justify-center rounded-xl bg-foreground">
            <span className="text-sm font-bold text-background">C</span>
          </div>
          <span className="text-lg font-semibold tracking-[-0.03em] text-foreground">
            Remb
          </span>
        </motion.div>

        {/* Center: Feature grid */}
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="max-w-md space-y-8"
        >
          <motion.div variants={item} className="space-y-3">
            <h2 className="text-[28px] font-semibold tracking-[-0.04em] text-foreground leading-tight">
              Your AI&apos;s
              <br />
              persistent memory.
            </h2>
            <p className="text-[15px] text-muted-foreground leading-relaxed max-w-sm">
              Stop repeating yourself to AI. Remb remembers your
              codebase decisions, architecture, and context across every
              session.
            </p>
          </motion.div>

          <motion.div variants={item} className="grid grid-cols-2 gap-4">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="group space-y-2.5 rounded-2xl border border-border/40 bg-card/50 p-4 transition-all duration-300 hover:border-border/80 hover:bg-card"
              >
                <div className="flex size-9 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground transition-colors duration-300 group-hover:bg-muted group-hover:text-foreground">
                  <HugeiconsIcon
                    icon={feature.icon}
                    strokeWidth={2}
                    className="size-4"
                  />
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-foreground tracking-[-0.01em]">
                    {feature.title}
                  </p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </motion.div>
        </motion.div>

        {/* Bottom: Testimonial-like text */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.6 }}
          className="space-y-2"
        >
          <p className="text-xs text-muted-foreground/60">
            Trusted by developers building with AI-first workflows.
          </p>
        </motion.div>
      </div>

      {/* Right panel — sign in card */}
      <div className="relative z-10 flex w-full flex-col items-center justify-center px-6 lg:w-1/2">
        {/* Subtle gradient background on right panel */}
        <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-transparent via-muted/20 to-muted/40 dark:via-muted/10 dark:to-muted/20" />

        <motion.div
          variants={floatUp}
          initial="hidden"
          animate="show"
          className="relative z-10 w-full max-w-95 space-y-8"
        >
          {/* Mobile logo (shown only on small screens) */}
          <div className="flex items-center justify-center gap-3 lg:hidden">
            <div className="flex size-9 items-center justify-center rounded-xl bg-foreground">
              <span className="text-sm font-bold text-background">C</span>
            </div>
            <span className="text-lg font-semibold tracking-[-0.03em] text-foreground">
              Remb
            </span>
          </div>

          {/* Header */}
          <div className="space-y-2 text-center lg:text-left">
            <h1 className="text-xl font-semibold tracking-[-0.04em] text-foreground sm:text-2xl">
              Welcome back
            </h1>
            <p className="text-[13px] text-muted-foreground">
              Sign in with your GitHub account to continue.
            </p>
          </div>

          {/* Sign-in card */}
          <div className="space-y-4">
            {/* GitHub button */}
            <Button
              size="lg"
              className="group relative w-full gap-2.5 h-12 text-[14px] font-medium"
              onClick={handleGitHubSignIn}
              disabled={isLoading}
              aria-busy={isLoading}
            >
              {isLoading ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                  className="size-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground"
                />
              ) : (
                <HugeiconsIcon
                  icon={GithubIcon}
                  strokeWidth={2}
                  className="size-4.5"
                />
              )}
              {isLoading ? "Redirecting..." : "Continue with GitHub"}
              {!isLoading && (
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  strokeWidth={2}
                  className="size-4 opacity-50 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0.5"
                />
              )}
            </Button>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border/60" />
              </div>
              <div className="relative flex justify-center text-[11px] uppercase tracking-widest">
                <span className="bg-background px-3 text-muted-foreground/50">
                  or
                </span>
              </div>
            </div>

            {/* CLI sign-in hint */}
            <div className="rounded-xl border border-border/40 bg-card/60 p-4 space-y-2.5">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-lg bg-muted/60">
                  <HugeiconsIcon
                    icon={CommandLineIcon}
                    strokeWidth={2}
                    className="size-3.5 text-muted-foreground"
                  />
                </div>
                <div>
                  <p className="text-[13px] font-medium text-foreground">
                    Using the CLI?
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Authenticate directly from your terminal.
                  </p>
                </div>
              </div>
              <div className="rounded-lg bg-muted/40 border border-border/30 px-3 py-2">
                <code className="text-[12px] font-mono text-muted-foreground">
                  <span className="text-foreground/70">$</span>{" "}
                  <span className="text-foreground">remb</span> auth login
                </code>
              </div>
            </div>
          </div>

          {/* Terms */}
          <p className="text-center text-[11px] text-muted-foreground/50 leading-relaxed">
            By continuing, you agree to Remb&apos;s{" "}
            <span className="underline underline-offset-2 cursor-default" title="Coming soon">
              Terms of Service
            </span>{" "}
            and{" "}
            <span className="underline underline-offset-2 cursor-default" title="Coming soon">
              Privacy Policy
            </span>
            .
          </p>
        </motion.div>
      </div>
    </div>
  );
}
