"use client";

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Radar01Icon,
  Loading03Icon,
  RefreshIcon,
  Layers01Icon,
  AlertCircleIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { useParams } from "next/navigation";
import { useProjects } from "@/lib/project-store";
import { toast } from "sonner";
import {
  getProjectStructureGraph,
  type StructureNode,
  type StructureEdge,
} from "@/lib/project-actions";
import { ObsidianGraph } from "@/components/dashboard/obsidian-graph";

/* ─── Visualizer Page ─── */
export default function VisualizerPage() {
  const { slug } = useParams<{ slug: string }>();
  const projects = useProjects();
  const activeProject = slug
    ? projects.find((p) => p.slug === slug)
    : null;

  const [graphNodes, setGraphNodes] = React.useState<StructureNode[]>([]);
  const [graphEdges, setGraphEdges] = React.useState<StructureEdge[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const loadGraph = React.useCallback(async () => {
    if (!activeProject) {
      setGraphNodes([]);
      setGraphEdges([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setLoadError(null);
    try {
      const graph = await getProjectStructureGraph(activeProject.id);
      setGraphNodes(graph.nodes);
      setGraphEdges(graph.edges);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load project structure";
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [activeProject]);

  React.useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-[-0.04em] text-foreground">
            Structure Visualizer
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {activeProject
              ? `Project structure and connections for ${activeProject.name}`
              : "Select a project to visualize its structure."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeProject && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={loadGraph} aria-label="Refresh graph">
              <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} className="size-3.5" />
              Refresh
            </Button>
          )}
        </div>
      </div>

      {/* Graph Area — takes all remaining viewport height */}
      <div className="rounded-xl border border-border/50 overflow-hidden" style={{ height: "calc(100dvh - 180px)", minHeight: 500 }}>
        {isLoading && (
          <div className="flex items-center justify-center h-full bg-muted/20">
            <div className="flex items-center gap-2 text-muted-foreground">
              <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="size-5 animate-spin" />
              <span className="text-[13px]">Analyzing project structure...</span>
            </div>
          </div>
        )}

        {!isLoading && !activeProject && (
          <div className="flex items-center justify-center h-full bg-muted/20">
            <div className="text-center">
              <HugeiconsIcon icon={Layers01Icon} strokeWidth={1.5} className="size-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-[14px] font-medium text-foreground mb-1">No project selected</p>
              <p className="text-[12px] text-muted-foreground">Select a project from the nav to visualize.</p>
            </div>
          </div>
        )}

        {!isLoading && activeProject && graphNodes.length === 0 && !loadError && (
          <div className="flex items-center justify-center h-full bg-muted/20">
            <div className="text-center">
              <HugeiconsIcon icon={Radar01Icon} strokeWidth={1.5} className="size-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-[14px] font-medium text-foreground mb-1">No structure data</p>
              <p className="text-[12px] text-muted-foreground">Run a scan to analyze the project structure.</p>
            </div>
          </div>
        )}

        {!isLoading && loadError && (
          <div className="flex items-center justify-center h-full bg-muted/20">
            <div className="text-center">
              <HugeiconsIcon icon={AlertCircleIcon} strokeWidth={1.5} className="size-10 text-destructive/40 mx-auto mb-3" />
              <p className="text-[14px] font-medium text-foreground mb-1">Failed to load graph</p>
              <p className="text-[12px] text-muted-foreground mb-3">{loadError}</p>
              <Button variant="outline" size="sm" onClick={loadGraph} className="gap-1.5">
                <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} className="size-3.5" />
                Retry
              </Button>
            </div>
          </div>
        )}

        {!isLoading && graphNodes.length > 0 && (
          <ObsidianGraph nodes={graphNodes} edges={graphEdges} />
        )}
      </div>
    </div>
  );
}
