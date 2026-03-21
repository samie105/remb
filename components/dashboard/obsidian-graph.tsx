"use client";

import * as React from "react";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import type { StructureNode, StructureEdge, FileNodeType } from "@/lib/project-actions";

/* ─── Color map ─── */
const NODE_COLORS: Record<FileNodeType, string> = {
  route:     "#3b82f6",
  api:       "#10b981",
  component: "#8b5cf6",
  lib:       "#f59e0b",
  hook:      "#f43f5e",
  config:    "#6b7280",
  style:     "#ec4899",
  other:     "#6b7280",
};

const NODE_LABELS: Record<FileNodeType, string> = {
  route: "Page", api: "API", component: "Component",
  lib: "Library", hook: "Hook", config: "Config",
  style: "Style", other: "File",
};

/**
 * Soft cluster angles — each type gets a subtle directional pull so
 * same-type nodes group organically without a rigid layout.
 */
const CLUSTER_ANGLE: Record<FileNodeType, number> = {
  route:      -Math.PI / 2,
  api:        -Math.PI / 4,
  component:   0,
  lib:         Math.PI * 0.75,
  hook:        Math.PI / 4,
  config:      Math.PI / 6,
  style:      -Math.PI * 0.75,
  other:       Math.PI / 2,
};
const CLUSTER_R = 160;

/* ─── Theme palettes ─── */
interface Palette {
  bg: string;
  grid: string;
  linkDefault: string; linkShared: string;
  linkHL: string;      linkSharedHL: string;
  linkDim: string;
  labelDefault: string; labelHover: string; labelDim: string;
  edgeLabelDefault: string; edgeLabelShared: string;
}
const DARK: Palette = {
  bg: "rgb(13,13,15)",
  grid: "rgba(255,255,255,0.025)",
  linkDefault: "rgba(255,255,255,0.09)",   linkShared: "rgba(96,165,250,0.22)",
  linkHL: "rgba(255,255,255,0.42)",        linkSharedHL: "rgba(96,165,250,0.65)",
  linkDim: "rgba(255,255,255,0.025)",
  labelDefault: "rgba(255,255,255,0.68)",  labelHover: "#fff",  labelDim: "rgba(255,255,255,0.10)",
  edgeLabelDefault: "rgba(255,255,255,0.38)", edgeLabelShared: "rgba(96,165,250,0.80)",
};
const LIGHT: Palette = {
  bg: "rgb(248,248,250)",
  grid: "rgba(0,0,0,0.04)",
  linkDefault: "rgba(0,0,0,0.13)",          linkShared: "rgba(59,130,246,0.32)",
  linkHL: "rgba(0,0,0,0.45)",               linkSharedHL: "rgba(59,130,246,0.65)",
  linkDim: "rgba(0,0,0,0.03)",
  labelDefault: "rgba(0,0,0,0.62)",         labelHover: "#000",  labelDim: "rgba(0,0,0,0.15)",
  edgeLabelDefault: "rgba(0,0,0,0.32)",     edgeLabelShared: "rgba(59,130,246,0.80)",
};

/* ─── Simulation types ─── */
interface GraphNode extends SimulationNodeDatum {
  id: string;
  label: string;
  path: string;
  nodeType: FileNodeType;
  features: string[];
  importance?: number;
  featureCount: number;
  radius: number;
  connections: number;
}

interface GraphLink extends SimulationLinkDatum<GraphNode> {
  id: string;
  relation: "import" | "dynamic" | "re-export" | "feature" | "shared";
  weight: number;
  label?: string;
  importedSymbols?: string[];
}

/* ─── Selected Node Detail Panel ─── */
function SelectedNodePanel({
  node,
  links,
  allNodes,
  isDark,
  onClose,
}: {
  node: GraphNode;
  links: GraphLink[];
  allNodes: GraphNode[];
  isDark: boolean;
  onClose: () => void;
}) {
  const nodeMap = React.useMemo(() => new Map(allNodes.map((n) => [n.id, n])), [allNodes]);

  // Find incoming and outgoing connections
  const { incoming, outgoing } = React.useMemo(() => {
    const inc: Array<{ node: GraphNode; symbols: string[]; relation: string }> = [];
    const out: Array<{ node: GraphNode; symbols: string[]; relation: string }> = [];
    for (const link of links) {
      const srcId = typeof link.source === "object" ? link.source.id : String(link.source);
      const tgtId = typeof link.target === "object" ? link.target.id : String(link.target);
      if (tgtId === node.id) {
        const srcNode = nodeMap.get(srcId);
        if (srcNode) inc.push({ node: srcNode, symbols: link.importedSymbols ?? [], relation: link.relation });
      }
      if (srcId === node.id) {
        const tgtNode = nodeMap.get(tgtId);
        if (tgtNode) out.push({ node: tgtNode, symbols: link.importedSymbols ?? [], relation: link.relation });
      }
    }
    return { incoming: inc, outgoing: out };
  }, [node.id, links, nodeMap]);

  // Build an AI-style explanation
  const explanation = React.useMemo(() => {
    const type = NODE_LABELS[node.nodeType];
    const parts: string[] = [];

    // Role description
    if (node.nodeType === "route") {
      parts.push(`This is a ${type.toLowerCase()} file that defines a user-facing page${node.path.includes("/api/") ? " (API route)" : ""}.`);
    } else if (node.nodeType === "api") {
      parts.push(`This API endpoint handles server-side logic and data processing.`);
    } else if (node.nodeType === "component") {
      parts.push(`This is a reusable UI component${node.connections >= 3 ? " used widely across the application" : ""}.`);
    } else if (node.nodeType === "lib") {
      parts.push(`This is a library/utility module providing shared functionality.`);
    } else if (node.nodeType === "hook") {
      parts.push(`This is a custom React hook encapsulating reusable stateful logic.`);
    } else {
      parts.push(`This ${type.toLowerCase()} file is part of the project infrastructure.`);
    }

    // Importance
    if (node.importance != null && node.importance >= 7) {
      parts.push(`It has high importance (${node.importance}/10) indicating it's critical to the application architecture.`);
    } else if (node.importance != null && node.importance >= 4) {
      parts.push(`It has moderate importance (${node.importance}/10) in the overall architecture.`);
    }

    // Connectivity analysis
    if (incoming.length > 0 && outgoing.length > 0) {
      parts.push(`It imports from ${outgoing.length} module${outgoing.length !== 1 ? "s" : ""} and is imported by ${incoming.length} other file${incoming.length !== 1 ? "s" : ""}.`);
    } else if (incoming.length > 0) {
      parts.push(`It is imported by ${incoming.length} file${incoming.length !== 1 ? "s" : ""} but has no internal dependencies — likely a leaf utility.`);
    } else if (outgoing.length > 0) {
      parts.push(`It depends on ${outgoing.length} module${outgoing.length !== 1 ? "s" : ""} but nothing imports it directly — likely an entry point or page.`);
    }

    // Hub analysis
    if (node.connections >= 5) {
      parts.push(`This is a hub node with ${node.connections} connections — changes here have wide impact.`);
    }

    // Feature association
    if (node.features.length > 0) {
      parts.push(`Associated with: ${node.features.slice(0, 3).join(", ")}${node.features.length > 3 ? ` and ${node.features.length - 3} more` : ""}.`);
    }

    return parts.join(" ");
  }, [node, incoming, outgoing]);

  const D = isDark;
  const panelBg = D ? "bg-black/80 border-white/10" : "bg-white/90 border-black/10";
  const headTxt = D ? "text-white" : "text-black/90";
  const bodyTxt = D ? "text-white/70" : "text-black/65";
  const muteTxt = D ? "text-white/40" : "text-black/40";
  const chipBg  = D ? "bg-white/8 text-white/60" : "bg-black/6 text-black/55";
  const secBg   = D ? "bg-white/5" : "bg-black/4";
  const closeBg = D ? "hover:bg-white/10 text-white/50" : "hover:bg-black/10 text-black/40";

  return (
    <div className={`absolute top-3 right-12 z-20 w-80 max-h-[calc(100%-24px)] overflow-y-auto backdrop-blur-xl rounded-xl border shadow-2xl ${panelBg}`}>
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-start gap-2 px-4 pt-3 pb-2 backdrop-blur-xl" style={{ background: "inherit" }}>
        <div className="size-3 shrink-0 rounded-full mt-1" style={{ backgroundColor: NODE_COLORS[node.nodeType] }} />
        <div className="flex-1 min-w-0">
          <h3 className={`text-sm font-semibold truncate ${headTxt}`}>{node.label}</h3>
          <p className={`text-[10px] font-mono truncate ${muteTxt}`}>{node.path}</p>
        </div>
        <button onClick={onClose} className={`size-6 shrink-0 rounded-md flex items-center justify-center text-xs transition-colors ${closeBg}`}>✕</button>
      </div>

      <div className="px-4 pb-4 space-y-3">
        {/* Stats row */}
        <div className="flex items-center gap-3">
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${chipBg}`}>{NODE_LABELS[node.nodeType]}</span>
          {node.importance != null && (
            <span className={`text-[10px] ${muteTxt}`}>★ {node.importance}/10 importance</span>
          )}
          <span className={`text-[10px] ${muteTxt}`}>{node.connections} conn.</span>
        </div>

        {/* AI explanation */}
        <div className={`rounded-lg px-3 py-2.5 ${secBg}`}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-[10px]">🧠</span>
            <span className={`text-[10px] font-semibold ${D ? "text-white/60" : "text-black/50"}`}>Analysis</span>
          </div>
          <p className={`text-[11px] leading-relaxed ${bodyTxt}`}>{explanation}</p>
        </div>

        {/* Features */}
        {node.features.length > 0 && (
          <div>
            <p className={`text-[10px] font-semibold mb-1.5 ${muteTxt}`}>FEATURES ({node.features.length})</p>
            <div className="flex flex-wrap gap-1">
              {node.features.map((f) => (
                <span key={f} className={`text-[10px] rounded-md px-2 py-0.5 truncate max-w-full ${chipBg}`}>{f}</span>
              ))}
            </div>
          </div>
        )}

        {/* Imports (outgoing) */}
        {outgoing.length > 0 && (
          <div>
            <p className={`text-[10px] font-semibold mb-1.5 ${muteTxt}`}>IMPORTS ({outgoing.length})</p>
            <div className="space-y-1">
              {outgoing.slice(0, 8).map((dep) => (
                <div key={dep.node.id} className={`flex items-center gap-2 rounded-md px-2 py-1 ${secBg}`}>
                  <div className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: NODE_COLORS[dep.node.nodeType] }} />
                  <span className={`text-[10px] truncate flex-1 ${bodyTxt}`}>{dep.node.label}</span>
                  {dep.symbols.length > 0 && (
                    <span className={`text-[9px] truncate max-w-24 ${muteTxt}`}>
                      {dep.symbols.slice(0, 2).join(", ")}{dep.symbols.length > 2 ? "…" : ""}
                    </span>
                  )}
                </div>
              ))}
              {outgoing.length > 8 && <p className={`text-[9px] px-2 ${muteTxt}`}>+{outgoing.length - 8} more</p>}
            </div>
          </div>
        )}

        {/* Imported by (incoming) */}
        {incoming.length > 0 && (
          <div>
            <p className={`text-[10px] font-semibold mb-1.5 ${muteTxt}`}>IMPORTED BY ({incoming.length})</p>
            <div className="space-y-1">
              {incoming.slice(0, 8).map((dep) => (
                <div key={dep.node.id} className={`flex items-center gap-2 rounded-md px-2 py-1 ${secBg}`}>
                  <div className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: NODE_COLORS[dep.node.nodeType] }} />
                  <span className={`text-[10px] truncate flex-1 ${bodyTxt}`}>{dep.node.label}</span>
                  <span className={`text-[9px] ${muteTxt}`}>{NODE_LABELS[dep.node.nodeType]}</span>
                </div>
              ))}
              {incoming.length > 8 && <p className={`text-[9px] px-2 ${muteTxt}`}>+{incoming.length - 8} more</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Props ─── */
export interface ObsidianGraphProps {
  nodes: StructureNode[];
  edges: StructureEdge[];
  /** Called when a node is clicked — for showing detail panel */
  onNodeSelect?: (node: { id: string; label: string; path: string; nodeType: FileNodeType; features: string[]; importance?: number; connections: number } | null) => void;
}

/* ─── Main Component ─── */
export function ObsidianGraph({ nodes, edges, onNodeSelect }: ObsidianGraphProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const simRef = React.useRef<ReturnType<typeof forceSimulation<GraphNode>> | null>(null);
  const animRef = React.useRef<number>(0);

  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const selectedRef = React.useRef<GraphNode | null>(null);
  const [selectedNode, setSelectedNode] = React.useState<GraphNode | null>(null);

  // Interaction state kept in refs for canvas perf
  const transformRef = React.useRef({ x: 0, y: 0, k: 1 });
  const dragRef = React.useRef<{
    node: GraphNode | null;
    isPanning: boolean;
    startX: number;
    startY: number;
    startTx: number;
    startTy: number;
  }>({ node: null, isPanning: false, startX: 0, startY: 0, startTx: 0, startTy: 0 });
  const hoverRef = React.useRef<GraphNode | null>(null);
  const graphDataRef = React.useRef<{ nodes: GraphNode[]; links: GraphLink[] }>({ nodes: [], links: [] });
  const sizeRef = React.useRef({ w: 0, h: 0 });
  const themeRef = React.useRef<"dark" | "light">("dark");

  // For React-controlled UI overlay (hover tooltip)
  const [hoverInfo, setHoverInfo] = React.useState<{
    node: GraphNode;
    x: number;
    y: number;
    containerWidth: number;
  } | null>(null);

  const [isDark, setIsDark] = React.useState(true);
  const [searchQuery, setSearchQuery] = React.useState("");

  /* ─── Theme detection ─── */
  React.useEffect(() => {
    const root = document.documentElement;
    const detect = () => {
      const dark = root.classList.contains("dark");
      themeRef.current = dark ? "dark" : "light";
      setIsDark(dark);
    };
    detect();
    const mo = new MutationObserver(detect);
    mo.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);

  /* ─── Build simulation ─── */
  React.useEffect(() => {
    const connCount = new Map<string, number>();
    for (const e of edges) {
      connCount.set(e.source, (connCount.get(e.source) ?? 0) + 1);
      connCount.set(e.target, (connCount.get(e.target) ?? 0) + 1);
    }

    const graphNodes: GraphNode[] = nodes.map((n) => {
      const conns = connCount.get(n.id) ?? 0;
      const fc = (n as StructureNode & { featureCount?: number }).featureCount ?? n.features.length;
      return {
        id: n.id,
        label: n.label,
        path: n.path,
        nodeType: n.nodeType,
        features: n.features,
        importance: n.importance,
        featureCount: fc,
        connections: conns,
        // Hub nodes (many features/connections) are visually larger
        radius: Math.max(4, Math.min(20, 4 + conns * 1.2 + fc * 1.8 + (n.importance ?? 0) * 2.5)),
      };
    });

    const nodeSet = new Set(graphNodes.map((n) => n.id));
    const graphLinks: GraphLink[] = edges
      .filter((e) => nodeSet.has(e.source) && nodeSet.has(e.target))
      .map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        relation: e.relation as GraphLink["relation"],
        weight: (e as StructureEdge & { weight?: number }).weight ?? 1,
        label: e.label,
        importedSymbols: (e as StructureEdge & { importedSymbols?: string[] }).importedSymbols,
      }));

    graphDataRef.current = { nodes: graphNodes, links: graphLinks };

    const sim = forceSimulation<GraphNode>(graphNodes)
      .force(
        "link",
        forceLink<GraphNode, GraphLink>(graphLinks)
          .id((d) => d.id)
          // Heavier connections pull nodes closer together
          .distance((l) => Math.max(35, 100 - Math.min(l.weight, 5) * 12))
          .strength((l) => 0.3 + Math.min(l.weight, 5) * 0.04)
      )
      // Larger hub nodes repel more — prevents crowding at hubs
      .force("charge", forceManyBody<GraphNode>().strength((d) => -80 - d.radius * 9).distanceMax(500))
      .force("center", forceCenter(0, 0).strength(0.04))
      .force("collide", forceCollide<GraphNode>((d) => d.radius + 4).strength(0.8))
      // Soft cluster nudge — weak enough to remain organic, strong enough to group types
      .force("clusterX", forceX<GraphNode>((d) => Math.cos(CLUSTER_ANGLE[d.nodeType]) * CLUSTER_R).strength(0.06))
      .force("clusterY", forceY<GraphNode>((d) => Math.sin(CLUSTER_ANGLE[d.nodeType]) * CLUSTER_R).strength(0.06))
      .alphaDecay(0.018)
      .velocityDecay(0.35);

    simRef.current = sim;
    transformRef.current = { x: 0, y: 0, k: 1 };

    return () => {
      sim.stop();
      simRef.current = null;
    };
  }, [nodes, edges]);

  /* ─── Canvas draw loop ─── */
  React.useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        sizeRef.current = { w: width, h: height };
      }
    });

    resizeObserver.observe(container);

    const draw = () => {
      const { w, h } = sizeRef.current;
      const dpr = window.devicePixelRatio || 1;
      const { x: tx, y: ty, k } = transformRef.current;
      const { nodes: gNodes, links: gLinks } = graphDataRef.current;
      const hoveredNode = hoverRef.current;
      const query = searchQuery.toLowerCase();
      const pal = themeRef.current === "dark" ? DARK : LIGHT;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // Background
      ctx.fillStyle = pal.bg;
      ctx.fillRect(0, 0, w, h);

      // Subtle grid dots
      const gs = 40 * k;
      if (gs > 8) {
        ctx.fillStyle = pal.grid;
        const ox = ((tx + w / 2) % gs + gs) % gs;
        const oy = ((ty + h / 2) % gs + gs) % gs;
        for (let gx = ox; gx < w; gx += gs)
          for (let gy = oy; gy < h; gy += gs)
            ctx.fillRect(gx - 0.5, gy - 0.5, 1, 1);
      }

      ctx.save();
      ctx.translate(w / 2 + tx, h / 2 + ty);
      ctx.scale(k, k);

      // Determine highlighted set (hovered node + its neighbours)
      const highlightedIds = new Set<string>();
      if (hoveredNode) {
        highlightedIds.add(hoveredNode.id);
        for (const link of gLinks) {
          const srcId = typeof link.source === "object" ? link.source.id : link.source;
          const tgtId = typeof link.target === "object" ? link.target.id : link.target;
          if (srcId === hoveredNode.id) highlightedIds.add(String(tgtId));
          if (tgtId === hoveredNode.id) highlightedIds.add(String(srcId));
        }
      }

      const searchIds = new Set<string>();
      if (query) {
        for (const n of gNodes) {
          if (
            n.label.toLowerCase().includes(query) ||
            n.path.toLowerCase().includes(query) ||
            n.features.some((f) => f.toLowerCase().includes(query))
          ) searchIds.add(n.id);
        }
      }

      const hasHL = highlightedIds.size > 0;
      const hasSR = searchIds.size > 0;

      // Draw links
      for (const link of gLinks) {
        const src = link.source as GraphNode;
        const tgt = link.target as GraphNode;
        if (src.x == null || src.y == null || tgt.x == null || tgt.y == null) continue;

        const isHL = hasHL && highlightedIds.has(src.id) && highlightedIds.has(tgt.id);
        const isSR = hasSR && searchIds.has(src.id) && searchIds.has(tgt.id);
        const isDim = (hasHL && !isHL) || (hasSR && !isSR);
        const wf = Math.min(link.weight, 5);
        const isImport = link.relation === "import" || link.relation === "dynamic" || link.relation === "re-export";
        const isDynamic = link.relation === "dynamic";

        ctx.beginPath();

        // Dashed line for dynamic imports
        if (isDynamic) {
          ctx.setLineDash([4 / k, 3 / k]);
        } else {
          ctx.setLineDash([]);
        }

        ctx.moveTo(src.x, src.y);
        ctx.lineTo(tgt.x, tgt.y);

        if (isHL) {
          ctx.strokeStyle = link.relation === "shared" ? pal.linkSharedHL
            : isImport ? pal.linkHL
            : pal.linkHL;
          ctx.lineWidth = (link.relation === "shared" ? 1.5 : 1) + wf * 0.3;
        } else if (isDim) {
          ctx.strokeStyle = pal.linkDim;
          ctx.lineWidth = 0.4;
        } else {
          ctx.strokeStyle = link.relation === "shared" ? pal.linkShared
            : link.relation === "feature" ? pal.linkDefault
            : pal.linkDefault;
          ctx.lineWidth = (link.relation === "shared" ? 1 : isImport ? 0.8 : 0.6) + wf * 0.2;
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // Directional arrow for import edges
        if (isImport && !isDim && k > 0.45) {
          const dx = tgt.x - src.x;
          const dy = tgt.y - src.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          if (len > 0) {
            const tgtR = (tgt as GraphNode).radius ?? 5;
            // Arrow tip sits just outside the target node
            const nx = dx / len;
            const ny = dy / len;
            const ax = tgt.x - nx * (tgtR + 3);
            const ay = tgt.y - ny * (tgtR + 3);
            const arrowSize = Math.min(5, 3 + wf * 0.3) / k;

            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(ax - nx * arrowSize + ny * arrowSize * 0.5, ay - ny * arrowSize - nx * arrowSize * 0.5);
            ctx.lineTo(ax - nx * arrowSize - ny * arrowSize * 0.5, ay - ny * arrowSize + nx * arrowSize * 0.5);
            ctx.closePath();
            ctx.fillStyle = isHL ? pal.linkHL : pal.linkDefault;
            ctx.fill();
          }
        }

        // Show edge label when highlighted: symbols for imports, feature name for feature edges
        if (isHL && k > 0.65) {
          const mx = (src.x + tgt.x) / 2;
          const my = (src.y + tgt.y) / 2;
          ctx.font = `${9 / k}px Inter, system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = link.relation === "shared" ? pal.edgeLabelShared : pal.edgeLabelDefault;
          // Show imported symbols if available, otherwise feature label
          const edgeLabelText = link.importedSymbols?.length
            ? link.importedSymbols.slice(0, 3).join(", ") + (link.importedSymbols.length > 3 ? " …" : "")
            : link.label ?? "";
          if (edgeLabelText) ctx.fillText(edgeLabelText, mx, my);
        }
      }

      // Draw nodes
      const selNode = selectedRef.current;
      for (const node of gNodes) {
        if (node.x == null || node.y == null) continue;

        const color = NODE_COLORS[node.nodeType];
        const isHovered = hoveredNode?.id === node.id;
        const isSelected = selNode?.id === node.id;
        const isNeighbor = hasHL && highlightedIds.has(node.id) && !isHovered;
        const isSR = hasSR && searchIds.has(node.id);
        const isDim = (hasHL && !highlightedIds.has(node.id)) || (hasSR && !isSR);
        const isHub = node.featureCount >= 2 || node.connections >= 3;
        const r = node.radius;

        // Selection ring
        if (isSelected) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, r + 4 / k, 0, Math.PI * 2);
          ctx.strokeStyle = color;
          ctx.lineWidth = 2 / k;
          ctx.stroke();
          // Glow
          const sg = ctx.createRadialGradient(node.x, node.y, r * 0.5, node.x, node.y, r * 4);
          sg.addColorStop(0, color + "44");
          sg.addColorStop(1, color + "00");
          ctx.beginPath();
          ctx.arc(node.x, node.y, r * 4, 0, Math.PI * 2);
          ctx.fillStyle = sg;
          ctx.fill();
        }

        // Pulsing glow for hovered or search results
        if (isHovered || isSR) {
          const gw = ctx.createRadialGradient(node.x, node.y, r * 0.3, node.x, node.y, r * 3.5);
          gw.addColorStop(0, color + "55");
          gw.addColorStop(1, color + "00");
          ctx.beginPath();
          ctx.arc(node.x, node.y, r * 3.5, 0, Math.PI * 2);
          ctx.fillStyle = gw;
          ctx.fill();
        }

        // Subtle ambient glow for hub nodes (shows importance at a glance)
        if (!isDim && !isHovered && isHub) {
          const hg = ctx.createRadialGradient(node.x, node.y, r, node.x, node.y, r * 2.5);
          hg.addColorStop(0, color + "22");
          hg.addColorStop(1, color + "00");
          ctx.beginPath();
          ctx.arc(node.x, node.y, r * 2.5, 0, Math.PI * 2);
          ctx.fillStyle = hg;
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fillStyle = isDim
          ? color + "22"
          : isHovered
          ? color
          : isNeighbor || isSR
          ? color + "cc"
          : color + "88";
        ctx.fill();

        // Labels: always visible for hub nodes; visible when hovered/searched/zoomed
        const showLabel =
          isHovered || isSR ||
          (isHub  && k > 0.7 && !isDim) ||
          (k > 1.4 && !isDim);

        if (showLabel) {
          ctx.font = `${isHovered || isHub ? "600 " : ""}${(isHovered ? 12 : 10) / k}px Inter, system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillStyle = isDim ? pal.labelDim : isHovered ? pal.labelHover : pal.labelDefault;
          ctx.fillText(node.label, node.x, node.y + r + 3 / k);
        }
      }

      ctx.restore();
      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animRef.current);
      resizeObserver.disconnect();
    };
  }, [searchQuery]);

  /* ─── Hit test ─── */
  const hitTest = React.useCallback((clientX: number, clientY: number): GraphNode | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const { w, h } = sizeRef.current;
    const { x: tx, y: ty, k } = transformRef.current;

    // Convert screen → graph coordinates
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const gx = (sx - w / 2 - tx) / k;
    const gy = (sy - h / 2 - ty) / k;

    // Find closest node within hit radius
    let closest: GraphNode | null = null;
    let closestDist = Infinity;
    for (const node of graphDataRef.current.nodes) {
      if (node.x == null || node.y == null) continue;
      const dx = gx - node.x;
      const dy = gy - node.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const hitRadius = Math.max(node.radius, 8) + 4 / k;
      if (dist < hitRadius && dist < closestDist) {
        closest = node;
        closestDist = dist;
      }
    }
    return closest;
  }, []);

  /* ─── Event handlers ─── */
  const handlePointerDown = React.useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const node = hitTest(e.clientX, e.clientY);
      if (node) {
        // Start dragging node
        dragRef.current = {
          node,
          isPanning: false,
          startX: e.clientX,
          startY: e.clientY,
          startTx: 0,
          startTy: 0,
        };
        node.fx = node.x;
        node.fy = node.y;
        simRef.current?.alphaTarget(0.3).restart();
        canvas.setPointerCapture(e.pointerId);
      } else {
        // Start panning
        dragRef.current = {
          node: null,
          isPanning: true,
          startX: e.clientX,
          startY: e.clientY,
          startTx: transformRef.current.x,
          startTy: transformRef.current.y,
        };
        canvas.setPointerCapture(e.pointerId);
      }
    },
    [hitTest]
  );

  const handlePointerMove = React.useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const drag = dragRef.current;
      const { k } = transformRef.current;

      if (drag.node) {
        // Drag node
        const dx = (e.clientX - drag.startX) / k;
        const dy = (e.clientY - drag.startY) / k;
        drag.node.fx = (drag.node.fx ?? 0) + dx;
        drag.node.fy = (drag.node.fy ?? 0) + dy;
        drag.startX = e.clientX;
        drag.startY = e.clientY;
        return;
      }

      if (drag.isPanning) {
        transformRef.current.x = drag.startTx + (e.clientX - drag.startX);
        transformRef.current.y = drag.startTy + (e.clientY - drag.startY);
        return;
      }

      // Hover detection
      const node = hitTest(e.clientX, e.clientY);
      if (node !== hoverRef.current) {
        hoverRef.current = node;
        if (node) {
          const rect = canvasRef.current?.getBoundingClientRect();
          if (rect) {
            setHoverInfo({ node, x: e.clientX - rect.left, y: e.clientY - rect.top, containerWidth: rect.width });
          }
        } else {
          setHoverInfo(null);
        }
      }
      // Update tooltip position while hovering
      if (node && hoverRef.current) {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
          setHoverInfo({ node, x: e.clientX - rect.left, y: e.clientY - rect.top, containerWidth: rect.width });
        }
      }

      // Cursor
      if (canvasRef.current) {
        canvasRef.current.style.cursor = node ? "grab" : "default";
      }
    },
    [hitTest]
  );

  const handlePointerUp = React.useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const drag = dragRef.current;
      const wasDrag = drag.node
        ? Math.abs(e.clientX - drag.startX) > 4 || Math.abs(e.clientY - drag.startY) > 4
        : drag.isPanning && (Math.abs(e.clientX - drag.startX) > 4 || Math.abs(e.clientY - drag.startY) > 4);

      if (drag.node) {
        // If it was a click (not a drag), select the node
        if (!wasDrag) {
          const sel = selectedRef.current?.id === drag.node.id ? null : drag.node;
          selectedRef.current = sel;
          setSelectedNode(sel);
          onNodeSelect?.(sel ? { id: sel.id, label: sel.label, path: sel.path, nodeType: sel.nodeType, features: sel.features, importance: sel.importance, connections: sel.connections } : null);
        }
        drag.node.fx = null;
        drag.node.fy = null;
        simRef.current?.alphaTarget(0);
      } else if (!wasDrag) {
        // Clicked on empty space — deselect
        selectedRef.current = null;
        setSelectedNode(null);
        onNodeSelect?.(null);
      }
      dragRef.current = { node: null, isPanning: false, startX: 0, startY: 0, startTx: 0, startTy: 0 };
      canvasRef.current?.releasePointerCapture(e.pointerId);
    },
    [onNodeSelect]
  );

  const handleWheel = React.useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const { w, h } = sizeRef.current;
    const transform = transformRef.current;

    // Mouse position relative to canvas center
    const mx = e.clientX - rect.left - w / 2;
    const my = e.clientY - rect.top - h / 2;

    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    const newK = Math.max(0.1, Math.min(6, transform.k * factor));
    const ratio = newK / transform.k;

    // Zoom toward cursor
    transform.x = mx - ratio * (mx - transform.x);
    transform.y = my - ratio * (my - transform.y);
    transform.k = newK;
  }, []);

  /* ─── Recenter ─── */
  const recenter = React.useCallback(() => {
    transformRef.current = { x: 0, y: 0, k: 1 };
  }, []);

  /* ─── Fullscreen toggle ─── */
  const toggleFullscreen = React.useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  React.useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  /* ─── Keyboard shortcuts ─── */
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedNode) {
        setSelectedNode(null);
        selectedRef.current = null;
        onNodeSelect?.(null);
      }
      if (e.key === "f" && !e.metaKey && !e.ctrlKey && !(e.target instanceof HTMLInputElement)) {
        toggleFullscreen();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedNode, onNodeSelect, toggleFullscreen]);

  /* ─── Fit-to-view ─── */
  const fitToView = React.useCallback(() => {
    const { nodes: gNodes } = graphDataRef.current;
    if (gNodes.length === 0) return;
    const { w, h } = sizeRef.current;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of gNodes) {
      if (n.x == null || n.y == null) continue;
      minX = Math.min(minX, n.x - n.radius);
      maxX = Math.max(maxX, n.x + n.radius);
      minY = Math.min(minY, n.y - n.radius);
      maxY = Math.max(maxY, n.y + n.radius);
    }
    if (!isFinite(minX)) return;
    const padding = 60;
    const graphW = maxX - minX + padding * 2;
    const graphH = maxY - minY + padding * 2;
    const k = Math.min(w / graphW, h / graphH, 2);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    transformRef.current = { x: -cx * k, y: -cy * k, k };
  }, []);

  /* ─── Theme-adaptive UI classes ─── */
  const D = isDark;
  const inputCls = D
    ? "h-8 w-44 rounded-lg border border-white/10 bg-white/5 px-3 text-xs text-white/80 placeholder:text-white/30 outline-none focus:border-white/20 backdrop-blur-sm transition-colors"
    : "h-8 w-44 rounded-lg border border-black/10 bg-black/5 px-3 text-xs text-black/70 placeholder:text-black/30 outline-none focus:border-black/20 backdrop-blur-sm transition-colors";
  const btnCls = D
    ? "size-7 rounded-md border border-white/10 bg-white/5 text-white/50 hover:text-white/80 hover:bg-white/10 text-sm flex items-center justify-center transition-colors"
    : "size-7 rounded-md border border-black/10 bg-black/5 text-black/40 hover:text-black/70 hover:bg-black/10 text-sm flex items-center justify-center transition-colors";
  const legendCls = D
    ? "absolute bottom-3 left-3 z-10 flex flex-wrap items-center gap-2 px-2.5 py-1.5 bg-black/60 backdrop-blur-sm rounded-lg border border-white/8"
    : "absolute bottom-3 left-3 z-10 flex flex-wrap items-center gap-2 px-2.5 py-1.5 bg-white/70 backdrop-blur-sm rounded-lg border border-black/8";
  const txtCls   = D ? "text-[10px] text-white/50"  : "text-[10px] text-black/45";
  const divCls   = D ? "h-2.5 w-px bg-white/10"     : "h-2.5 w-px bg-black/10";
  const subCls   = D ? "text-white/35"               : "text-black/35";
  const tagCls   = D ? "text-white/50 bg-white/8"    : "text-black/50 bg-black/6";
  const tipCls   = D ? "bg-black/80 border-white/10" : "bg-white/92 border-black/10";
  const tipTxt   = D ? "text-white"                  : "text-black/85";

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden ${isFullscreen ? "" : "rounded-xl"}`}
      style={{ background: isDark ? "rgb(13,13,15)" : "rgb(248,248,250)" }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
      />

      {/* Top-left: search bar */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
        <input
          type="text"
          placeholder="Search nodes... (type to filter)"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={D
            ? "h-8 w-56 rounded-lg border border-white/10 bg-black/50 px-3 text-xs text-white/80 placeholder:text-white/30 outline-none focus:border-white/20 backdrop-blur-md transition-colors"
            : "h-8 w-56 rounded-lg border border-black/10 bg-white/60 px-3 text-xs text-black/70 placeholder:text-black/30 outline-none focus:border-black/20 backdrop-blur-md transition-colors"
          }
        />
      </div>

      {/* Top-right: stats + fullscreen */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
        <div className={`text-[10px] font-mono ${subCls}`}>
          {nodes.length} nodes · {edges.length} edges
        </div>
        <button
          onClick={toggleFullscreen}
          className={btnCls}
          title={isFullscreen ? "Exit fullscreen (F)" : "Fullscreen (F)"}
        >
          {isFullscreen ? "⊡" : "⊞"}
        </button>
      </div>

      {/* Bottom-right: zoom controls */}
      <div className="absolute bottom-3 right-3 z-10 flex flex-col items-center gap-1">
        <button onClick={() => { transformRef.current.k = Math.min(6, transformRef.current.k * 1.3); }} className={btnCls} title="Zoom in">+</button>
        <button onClick={() => { transformRef.current.k = Math.max(0.1, transformRef.current.k / 1.3); }} className={btnCls} title="Zoom out">−</button>
        <div className={D ? "h-px w-5 bg-white/10" : "h-px w-5 bg-black/10"} />
        <button onClick={fitToView} className={btnCls} title="Fit all nodes in view">⊙</button>
        <button onClick={recenter} className={btnCls} title="Reset to center">↺</button>
      </div>

      {/* Bottom-left: legend (collapsed in small view) */}
      <div className={D
        ? "absolute bottom-3 left-3 z-10 flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 bg-black/60 backdrop-blur-md rounded-lg border border-white/8 max-w-[calc(100%-140px)]"
        : "absolute bottom-3 left-3 z-10 flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 bg-white/70 backdrop-blur-md rounded-lg border border-black/8 max-w-[calc(100%-140px)]"
      }>
        {(["route", "api", "component", "lib", "hook", "config"] as FileNodeType[]).map((type) => (
          <div key={type} className="flex items-center gap-1.5">
            <div className="size-2 rounded-full" style={{ backgroundColor: NODE_COLORS[type] }} />
            <span className={txtCls}>{NODE_LABELS[type]}</span>
          </div>
        ))}
        <div className={divCls} />
        <div className="flex items-center gap-1.5">
          <svg width="14" height="6" viewBox="0 0 14 6" className="shrink-0">
            <line x1="0" y1="3" x2="9" y2="3" stroke={isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.4)"} strokeWidth="1" />
            <polygon points="9,0.5 14,3 9,5.5" fill={isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.4)"} />
          </svg>
          <span className={txtCls}>Import</span>
        </div>
        <div className="flex items-center gap-1.5">
          <svg width="14" height="6" viewBox="0 0 14 6" className="shrink-0">
            <line x1="0" y1="3" x2="9" y2="3" stroke={isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.3)"} strokeWidth="1" strokeDasharray="2 2" />
            <polygon points="9,1 13,3 9,5" fill={isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.3)"} />
          </svg>
          <span className={txtCls}>Dynamic</span>
        </div>
        <span className={`text-[9px] ${subCls}`}>Click node for details · F for fullscreen · Scroll to zoom</span>
      </div>

      {/* Hover tooltip (suppressed when a node is selected) */}
      {hoverInfo && !selectedNode && (
        <div
          className="absolute z-20 pointer-events-none"
          style={{
            left: Math.min(hoverInfo.x + 14, (hoverInfo.containerWidth || 400) - 230),
            top: hoverInfo.y - 8,
          }}
        >
          <div className={`backdrop-blur-md rounded-lg border px-3 py-2.5 shadow-xl w-52 ${tipCls}`}>
            <div className={`flex items-center gap-1.5 mb-1 ${tipTxt}`}>
              <div className="size-2 shrink-0 rounded-full" style={{ backgroundColor: NODE_COLORS[hoverInfo.node.nodeType] }} />
              <span className="text-xs font-semibold truncate flex-1">{hoverInfo.node.label}</span>
              <span className={`text-[9px] shrink-0 ${subCls}`}>{NODE_LABELS[hoverInfo.node.nodeType]}</span>
            </div>
            <p className={`text-[10px] font-mono truncate mb-1.5 ${subCls}`}>{hoverInfo.node.path}</p>
            <div className={`flex gap-3 text-[9px] mb-1.5 ${subCls}`}>
              <span>{hoverInfo.node.connections} connection{hoverInfo.node.connections !== 1 ? "s" : ""}</span>
              {hoverInfo.node.features.length > 0 && (
                <span>{hoverInfo.node.features.length} feature{hoverInfo.node.features.length !== 1 ? "s" : ""}</span>
              )}
              {hoverInfo.node.importance != null && (
                <span>★ {hoverInfo.node.importance}/10</span>
              )}
            </div>
            <p className={`text-[9px] ${subCls}`}>Click for detailed analysis</p>
          </div>
        </div>
      )}

      {/* Selected node detail panel */}
      {selectedNode && (
        <SelectedNodePanel
          node={selectedNode}
          links={graphDataRef.current.links}
          allNodes={graphDataRef.current.nodes}
          isDark={D}
          onClose={() => { selectedRef.current = null; setSelectedNode(null); onNodeSelect?.(null); }}
        />
      )}
    </div>
  );
}
