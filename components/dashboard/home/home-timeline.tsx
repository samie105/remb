"use client";

import { motion } from "framer-motion";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Radar01Icon,
  CheckmarkCircle01Icon,
} from "@hugeicons/core-free-icons";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { item } from "./shared";
import type { ProjectWithCounts } from "@/lib/project-actions";

interface HomeTimelineProps {
  projects: ProjectWithCounts[];
}

function TimelineStep({
  step,
  title,
  description,
  done,
  isLast,
}: {
  step: number;
  title: string;
  description: string;
  done: boolean;
  isLast: boolean;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div
          className={`flex size-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
            done
              ? "border-blue-500 bg-blue-500 text-white"
              : "border-border bg-background text-muted-foreground"
          }`}
        >
          {done ? (
            <HugeiconsIcon icon={CheckmarkCircle01Icon} strokeWidth={2.5} className="size-4" />
          ) : (
            <span className="text-xs font-semibold">{step}</span>
          )}
        </div>
        {!isLast && (
          <div
            className={`w-0.5 flex-1 min-h-8 transition-colors ${
              done ? "bg-blue-500" : "bg-border"
            }`}
          />
        )}
      </div>
      <div className="pb-6">
        <p
          className={`text-[13px] font-medium ${
            done ? "text-muted-foreground line-through" : "text-foreground"
          }`}
        >
          {title}
        </p>
        <p className="text-[12px] text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
  );
}

export function HomeTimeline({ projects }: HomeTimelineProps) {
  const totalFeatures = projects.reduce((a, p) => a + p.feature_count, 0);
  const totalEntries = projects.reduce((a, p) => a + p.entry_count, 0);

  const steps = [
    {
      title: "Import a GitHub repository",
      description: "Connect a repo from the project switcher above.",
      done: projects.length > 0,
    },
    {
      title: "Run your first scan",
      description: "AI analyzes your code and extracts features automatically.",
      done: totalFeatures > 0,
    },
    {
      title: "Review extracted context",
      description: "Browse features, entries, and tech stack from the scan.",
      done: totalEntries > 0,
    },
    {
      title: "Set up the CLI",
      description: "Push context from your terminal into any project.",
      done: false,
    },
  ];

  const completedSteps = steps.filter((s) => s.done).length;

  return (
    <motion.div variants={item} className="lg:col-span-2">
      <Card className="border-border/40">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <HugeiconsIcon
                icon={Radar01Icon}
                strokeWidth={2}
                className="size-4 text-blue-500"
              />
              Getting Started
            </CardTitle>
            <Badge variant="secondary" className="h-5 text-[10px] px-2 font-medium">
              {completedSteps}/{steps.length}
            </Badge>
          </div>
          <div className="mt-3">
            <div className="h-1.5 w-full rounded-full bg-muted/60 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-blue-500"
                initial={{ width: 0 }}
                animate={{ width: `${(completedSteps / steps.length) * 100}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mt-1">
            {steps.map((s, i) => (
              <TimelineStep
                key={i}
                step={i + 1}
                title={s.title}
                description={s.description}
                done={s.done}
                isLast={i === steps.length - 1}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
