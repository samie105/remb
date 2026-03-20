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
  ArrowLeft01Icon,
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
  const [showPlanList, setShowPlanList] = React.useState(!initialPlans.find((p) => p.status === "active"));

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
      setShowPlanList(false);
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
        setShowPlanList(true);
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
      if (activePlanId === planId) {
        setActivePlanId(null);
        setShowPlanList(true);
      }
      toast.success("Plan deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete plan");
    }
  }

  function selectPlan(planId: string) {
    setActivePlanId(planId);
    setShowPlanList(false);
  }

  const statusColors: Record<string, string> = {
    active: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    completed: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    archived: "bg-zinc-500/10 text-zinc-500",
  };

  // Full-bleed: negate all parent padding
  return (
    <div className="-m-4 sm:-m-6 flex h-[calc(100vh-3.5rem)] overflow-hidden">
      <AnimatePresence mode="wait">
        {showPlanList || !activePlan ? (
          /* ─── Plan List (full page) ─── */
          <motion.div
            key="plan-list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-1 flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div>
                <h1 className="text-lg font-semibold">Plans</h1>
                <p className="text-sm text-muted-foreground">
                  Plan your architecture with AI — {project.name}
                </p>
              </div>
              <Button onClick={() => setIsCreating(true)}>
                <HugeiconsIcon icon={PlusSignIcon} className="mr-1.5 size-4" />
                New Plan
              </Button>
            </div>

            {/* Plan grid */}
            <div className="flex-1 overflow-y-auto p-6">
              {plans.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <div className="rounded-2xl bg-muted/50 p-6">
                    <HugeiconsIcon icon={ArrowRight01Icon} className="size-10 text-muted-foreground" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold">No plans yet</h3>
                  <p className="mt-1 max-w-md text-sm text-muted-foreground">
                    Create a plan to start discussing architecture and implementation with AI.
                  </p>
                  <Button className="mt-4" onClick={() => setIsCreating(true)}>
                    <HugeiconsIcon icon={PlusSignIcon} className="mr-1.5 size-4" />
                    Create your first plan
                  </Button>
                </div>
              ) : (
                <div className="mx-auto grid max-w-4xl gap-3">
                  {plans.map((plan) => (
                    <motion.button
                      key={plan.id}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      onClick={() => selectPlan(plan.id)}
                      className="group flex items-center gap-4 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-accent"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-medium">{plan.title}</p>
                          <Badge
                            variant="secondary"
                            className={cn("text-[10px] shrink-0", statusColors[plan.status])}
                          >
                            {plan.status}
                          </Badge>
                        </div>
                        {plan.description && (
                          <p className="mt-1 truncate text-sm text-muted-foreground">
                            {plan.description}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-muted-foreground/60">
                          Updated {new Date(plan.updated_at).toLocaleDateString()}
                        </p>
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
                            onClick={(e) => { e.stopPropagation(); handleDeletePlan(plan.id); }}
                            className="text-destructive"
                          >
                            <HugeiconsIcon icon={Delete02Icon} className="mr-2 size-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </motion.button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          /* ─── Active Chat (full page) ─── */
          <motion.div
            key="plan-chat"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-1 flex-col"
          >
            {/* Minimal header bar */}
            <div className="flex items-center gap-3 border-b border-border px-4 py-2">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setShowPlanList(true)}
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
              </Button>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium">{activePlan.title}</p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm">
                    <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {activePlan.status === "active" && (
                    <DropdownMenuItem onClick={() => handleStatusChange(activePlan.id, "completed")}>
                      <HugeiconsIcon icon={CheckmarkCircle02Icon} className="mr-2 size-4" />
                      Complete Plan
                    </DropdownMenuItem>
                  )}
                  {activePlan.status !== "archived" && (
                    <DropdownMenuItem onClick={() => handleStatusChange(activePlan.id, "archived")}>
                      <HugeiconsIcon icon={Archive01Icon} className="mr-2 size-4" />
                      Archive Plan
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() => handleDeletePlan(activePlan.id)}
                    className="text-destructive"
                  >
                    <HugeiconsIcon icon={Delete02Icon} className="mr-2 size-4" />
                    Delete Plan
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <PlanChat plan={activePlan} projectSlug={project.slug} />
          </motion.div>
        )}
      </AnimatePresence>

      <NewPlanDialog
        open={isCreating}
        onOpenChange={setIsCreating}
        onSubmit={handleCreatePlan}
      />
    </div>
  );
}