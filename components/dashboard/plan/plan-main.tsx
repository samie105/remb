"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  PlusSignIcon,
  ArrowRight01Icon,
  Archive01Icon,
  CheckmarkCircle02Icon,
  Delete02Icon,
  MoreHorizontalIcon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import type { ProjectWithCounts } from "@/lib/project-actions";
import {
  createPlan,
  updatePlanStatus,
  deletePlan,
  type Plan,
} from "@/lib/plan-actions";
import { PlanChat } from "@/components/dashboard/plan/plan-chat";
import { NewPlanDialog } from "@/components/dashboard/plan/new-plan-dialog";

interface PlanMainProps {
  project: ProjectWithCounts;
  initialPlans: Plan[];
}

export function PlanMain({ project, initialPlans }: PlanMainProps) {
  const [plans, setPlans] = React.useState(initialPlans);
  const [activePlanId, setActivePlanId] = React.useState<string | null>(
    initialPlans.find((p) => p.status === "active")?.id ?? null,
  );
  const [isCreating, setIsCreating] = React.useState(false);

  const activePlan = plans.find((p) => p.id === activePlanId);

  async function handleCreatePlan(title: string, description?: string) {
    try {
      const plan = await createPlan({
        projectId: project.id,
        title,
        description,
      });
      setPlans((prev) => [plan, ...prev]);
      setActivePlanId(plan.id);
      setIsCreating(false);
      toast.success("Plan created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create plan");
    }
  }

  async function handleStatusChange(planId: string, status: Plan["status"]) {
    try {
      const updated = await updatePlanStatus(planId, status);
      setPlans((prev) => prev.map((p) => (p.id === planId ? updated : p)));
      if (status !== "active" && activePlanId === planId) {
        setActivePlanId(null);
      }
      toast.success(`Plan ${status === "completed" ? "completed" : "archived"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update plan");
    }
  }

  async function handleDeletePlan(planId: string) {
    try {
      await deletePlan(planId);
      setPlans((prev) => prev.filter((p) => p.id !== planId));
      if (activePlanId === planId) setActivePlanId(null);
      toast.success("Plan deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete plan");
    }
  }

  const statusColors: Record<string, string> = {
    active: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    completed: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    archived: "bg-zinc-500/10 text-zinc-500",
  };

  return (
    <div className="-m-4 sm:-m-6 flex h-[calc(100vh-3.5rem)]">
      {/* Sidebar — Plan list */}
      <div className="flex w-72 shrink-0 flex-col border-r border-border bg-sidebar/50">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Plans</h2>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setIsCreating(true)}
          >
            <HugeiconsIcon icon={PlusSignIcon} className="size-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          <AnimatePresence mode="popLayout">
            {plans.map((plan) => (
              <motion.button
                key={plan.id}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                onClick={() => setActivePlanId(plan.id)}
                className={cn(
                  "group flex w-full items-start gap-2 rounded-lg p-3 text-left transition-colors",
                  activePlanId === plan.id
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-muted/50",
                )}
              >
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium">{plan.title}</p>
                  {plan.description && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {plan.description}
                    </p>
                  )}
                  <Badge
                    variant="secondary"
                    className={cn("mt-1.5 text-[10px]", statusColors[plan.status])}
                  >
                    {plan.status}
                  </Badge>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="opacity-0 group-hover:opacity-100 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <HugeiconsIcon icon={MoreHorizontalIcon} className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {plan.status === "active" && (
                      <DropdownMenuItem onClick={() => handleStatusChange(plan.id, "completed")}>
                        <HugeiconsIcon icon={CheckmarkCircle02Icon} className="mr-2 size-4" />
                        Complete
                      </DropdownMenuItem>
                    )}
                    {plan.status !== "archived" && (
                      <DropdownMenuItem onClick={() => handleStatusChange(plan.id, "archived")}>
                        <HugeiconsIcon icon={Archive01Icon} className="mr-2 size-4" />
                        Archive
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={() => handleDeletePlan(plan.id)}
                      className="text-destructive"
                    >
                      <HugeiconsIcon icon={Delete02Icon} className="mr-2 size-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </motion.button>
            ))}
          </AnimatePresence>

          {plans.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm text-muted-foreground">No plans yet</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => setIsCreating(true)}
              >
                <HugeiconsIcon icon={PlusSignIcon} className="mr-1.5 size-3.5" />
                Create your first plan
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Main content — Chat */}
      <div className="flex flex-1 flex-col min-w-0">
        {activePlan ? (
          <PlanChat plan={activePlan} projectSlug={project.slug} />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <div className="rounded-2xl bg-muted/50 p-6">
              <HugeiconsIcon icon={ArrowRight01Icon} className="size-10 text-muted-foreground" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Select or create a plan</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Plan your project architecture with AI assistance
              </p>
            </div>
            <Button onClick={() => setIsCreating(true)}>
              <HugeiconsIcon icon={PlusSignIcon} className="mr-1.5 size-4" />
              New Plan
            </Button>
          </div>
        )}
      </div>

      <NewPlanDialog
        open={isCreating}
        onOpenChange={setIsCreating}
        onSubmit={handleCreatePlan}
      />
    </div>
  );
}
