"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/* ─── Tech icon mapping using simple cdn SVGs ─── */
const TECH_ICONS: Record<string, { icon: string; color: string; bg: string }> = {
  "TypeScript": { icon: "https://cdn.simpleicons.org/typescript", color: "text-blue-500", bg: "bg-blue-500/10" },
  "JavaScript": { icon: "https://cdn.simpleicons.org/javascript", color: "text-yellow-500", bg: "bg-yellow-500/10" },
  "Python": { icon: "https://cdn.simpleicons.org/python", color: "text-yellow-600", bg: "bg-yellow-600/10" },
  "Go": { icon: "https://cdn.simpleicons.org/go", color: "text-cyan-500", bg: "bg-cyan-500/10" },
  "Rust": { icon: "https://cdn.simpleicons.org/rust", color: "text-orange-600", bg: "bg-orange-600/10" },
  "Ruby": { icon: "https://cdn.simpleicons.org/ruby", color: "text-red-500", bg: "bg-red-500/10" },
  "Java": { icon: "https://cdn.simpleicons.org/openjdk", color: "text-red-600", bg: "bg-red-600/10" },
  "Kotlin": { icon: "https://cdn.simpleicons.org/kotlin", color: "text-purple-500", bg: "bg-purple-500/10" },
  "Swift": { icon: "https://cdn.simpleicons.org/swift", color: "text-orange-500", bg: "bg-orange-500/10" },
  "React": { icon: "https://cdn.simpleicons.org/react", color: "text-cyan-400", bg: "bg-cyan-400/10" },
  "Next.js": { icon: "https://cdn.simpleicons.org/nextdotjs", color: "text-foreground", bg: "bg-foreground/10" },
  "Vue": { icon: "https://cdn.simpleicons.org/vuedotjs", color: "text-emerald-500", bg: "bg-emerald-500/10" },
  "Svelte": { icon: "https://cdn.simpleicons.org/svelte", color: "text-orange-500", bg: "bg-orange-500/10" },
  "Astro": { icon: "https://cdn.simpleicons.org/astro", color: "text-purple-500", bg: "bg-purple-500/10" },
  "Tailwind CSS": { icon: "https://cdn.simpleicons.org/tailwindcss", color: "text-cyan-500", bg: "bg-cyan-500/10" },
  "Node.js": { icon: "https://cdn.simpleicons.org/nodedotjs", color: "text-green-600", bg: "bg-green-600/10" },
  "Docker": { icon: "https://cdn.simpleicons.org/docker", color: "text-blue-500", bg: "bg-blue-500/10" },
  "PostgreSQL": { icon: "https://cdn.simpleicons.org/postgresql", color: "text-blue-600", bg: "bg-blue-600/10" },
  "MongoDB": { icon: "https://cdn.simpleicons.org/mongodb", color: "text-green-600", bg: "bg-green-600/10" },
  "Redis": { icon: "https://cdn.simpleicons.org/redis", color: "text-red-500", bg: "bg-red-500/10" },
  "Supabase": { icon: "https://cdn.simpleicons.org/supabase", color: "text-emerald-500", bg: "bg-emerald-500/10" },
  "Prisma": { icon: "https://cdn.simpleicons.org/prisma", color: "text-slate-700", bg: "bg-slate-700/10" },
  "Stripe": { icon: "https://cdn.simpleicons.org/stripe", color: "text-purple-500", bg: "bg-purple-500/10" },
  "OpenAI": { icon: "https://cdn.simpleicons.org/openai", color: "text-foreground", bg: "bg-foreground/10" },
  "Express": { icon: "https://cdn.simpleicons.org/express", color: "text-foreground", bg: "bg-foreground/10" },
  "Fastify": { icon: "https://cdn.simpleicons.org/fastify", color: "text-foreground", bg: "bg-foreground/10" },
  "Zod": { icon: "https://cdn.simpleicons.org/zod", color: "text-blue-600", bg: "bg-blue-600/10" },
  "Framer Motion": { icon: "https://cdn.simpleicons.org/framer", color: "text-foreground", bg: "bg-foreground/10" },
  "GraphQL": { icon: "https://cdn.simpleicons.org/graphql", color: "text-pink-500", bg: "bg-pink-500/10" },
  "CSS": { icon: "https://cdn.simpleicons.org/css3", color: "text-blue-500", bg: "bg-blue-500/10" },
  "SCSS": { icon: "https://cdn.simpleicons.org/sass", color: "text-pink-500", bg: "bg-pink-500/10" },
  "SQL": { icon: "https://cdn.simpleicons.org/postgresql", color: "text-blue-600", bg: "bg-blue-600/10" },
  "YAML": { icon: "", color: "text-muted-foreground", bg: "bg-muted/50" },
  "TOML": { icon: "", color: "text-muted-foreground", bg: "bg-muted/50" },
};

const sizes = {
  xs: "size-3.5",
  sm: "size-5",
  md: "size-7",
  lg: "size-9",
};

const containerSizes = {
  xs: "size-5",
  sm: "size-7",
  md: "size-9",
  lg: "size-12",
};

interface TechStackIconsProps {
  items: string[];
  size?: "xs" | "sm" | "md" | "lg";
  maxVisible?: number;
  className?: string;
}

export function TechStackIcons({
  items,
  size = "sm",
  maxVisible = 8,
  className,
}: TechStackIconsProps) {
  const visible = items.slice(0, maxVisible);
  const overflow = items.length - maxVisible;

  return (
    <div className={cn("flex items-center -space-x-1", className)}>
      {visible.map((name) => {
        const tech = TECH_ICONS[name];
        if (!tech) {
          // Fallback for unknown tech
          return (
            <div
              key={name}
              className={cn(
                "flex items-center justify-center rounded-full border-2 border-background bg-muted/60 shrink-0",
                containerSizes[size]
              )}
              title={name}
            >
              <span className="text-[8px] font-bold text-muted-foreground uppercase">
                {name.slice(0, 2)}
              </span>
            </div>
          );
        }

        return (
          <div
            key={name}
            className={cn(
              "flex items-center justify-center rounded-full border-2 border-background shrink-0",
              tech.bg,
              containerSizes[size]
            )}
            title={name}
          >
            {tech.icon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={tech.icon}
                alt={name}
                className={cn(sizes[size], "object-contain dark:invert-0")}
                loading="lazy"
              />
            ) : (
              <span className="text-[8px] font-bold text-muted-foreground uppercase">
                {name.slice(0, 2)}
              </span>
            )}
          </div>
        );
      })}
      {overflow > 0 && (
        <div
          className={cn(
            "flex items-center justify-center rounded-full border-2 border-background bg-muted/80 shrink-0",
            containerSizes[size]
          )}
        >
          <span className="text-[9px] font-semibold text-muted-foreground">
            +{overflow}
          </span>
        </div>
      )}
    </div>
  );
}
