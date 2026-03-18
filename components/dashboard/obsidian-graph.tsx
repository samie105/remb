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

/* ─── Props ─── */
export interface ObsidianGraphProps {
  nodes: StructureNode[];
  edges: StructureEdge[];
}

/* ─── Main Component ─── */
export function ObsidianGraph({ nodes, edges }: ObsidianGraphProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const simRef = React.useRef<ReturnType<typeof forceSimulation<GraphNode>> | null>(null);
  const animRef = React.useRef<number>(0);

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
      for (const node of gNodes) {
        if (node.x == null || node.y == null) continue;

        const color = NODE_COLORS[node.nodeType];
        const isHovered = hoveredNode?.id === node.id;
        const isNeighbor = hasHL && highlightedIds.has(node.id) && !isHovered;
        const isSR = hasSR && searchIds.has(node.id);
        const isDim = (hasHL && !highlightedIds.has(node.id)) || (hasSR && !isSR);
        const isHub = node.featureCount >= 2 || node.connections >= 3;
        const r = node.radius;

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
      if (drag.node) {
        drag.node.fx = null;
        drag.node.fy = null;
        simRef.current?.alphaTarget(0);
      }
      dragRef.current = { node: null, isPanning: false, startX: 0, startY: 0, startTx: 0, startTy: 0 };
      canvasRef.current?.releasePointerCapture(e.pointerId);
    },
    []
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
      className="relative w-full h-full rounded-xl overflow-hidden"
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

      {/* Search bar */}
      <div className="absolute top-3 left-3 z-10">
        <input
          type="text"
          placeholder="Filter nodes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={inputCls}
        />
      </div>

      {/* Zoom + recenter controls */}
      <div className="absolute bottom-3 right-3 z-10 flex items-center gap-1">
        <button onClick={() => { transformRef.current.k = Math.min(6, transformRef.current.k * 1.3); }} className={btnCls} title="Zoom in">+</button>
        <button onClick={() => { transformRef.current.k = Math.max(0.1, transformRef.current.k / 1.3); }} className={btnCls} title="Zoom out">−</button>
        <button onClick={recenter} className={btnCls} title="Recenter">⊙</button>
      </div>

      {/* Legend */}
      <div className={legendCls}>
        {(["route", "api", "component", "lib", "hook"] as FileNodeType[]).map((type) => (
          <div key={type} className="flex items-center gap-1.5">
            <div className="size-2 rounded-full" style={{ backgroundColor: NODE_COLORS[type] }} />
            <span className={txtCls}>{NODE_LABELS[type]}</span>
          </div>
        ))}
        <div className={divCls} />
        <div className="flex items-center gap-1.5">
          <svg width="16" height="8" viewBox="0 0 16 8" className="shrink-0">
            <line x1="0" y1="4" x2="11" y2="4" stroke={isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.4)"} strokeWidth="1.2" />
            <polygon points="11,1 16,4 11,7" fill={isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.4)"} />
          </svg>
          <span className={txtCls}>Import</span>
        </div>
        <div className="flex items-center gap-1.5">
          <svg width="16" height="8" viewBox="0 0 16 8" className="shrink-0">
            <line x1="0" y1="4" x2="11" y2="4" stroke={isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.3)"} strokeWidth="1" strokeDasharray="2 2" />
            <polygon points="11,1.5 15,4 11,6.5" fill={isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.3)"} />
          </svg>
          <span className={txtCls}>Dynamic</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-px" style={{ background: isDark ? "rgba(96,165,250,0.5)" : "rgba(59,130,246,0.5)" }} />
          <span className={txtCls}>Shared</span>
        </div>
        <div className={divCls} />
        <div className="flex items-center gap-1.5">
          <div className="size-2.5 rounded-full" style={{ background: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)" }} />
          <span className={txtCls}>Hub node</span>
        </div>
      </div>

      {/* Hover tooltip */}
      {hoverInfo && (
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
              <span>{hoverInfo.node.connections} import{hoverInfo.node.connections !== 1 ? "s" : ""}</span>
              {hoverInfo.node.features.length > 0 && (
                <span>{hoverInfo.node.features.length} feature{hoverInfo.node.features.length !== 1 ? "s" : ""}</span>
              )}
              {hoverInfo.node.importance != null && (
                <span>★ {(hoverInfo.node.importance * 10).toFixed(0)}/10</span>
              )}
            </div>
            {hoverInfo.node.features.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {hoverInfo.node.features.slice(0, 4).map((f) => (
                  <span key={f} className={`text-[9px] rounded px-1.5 py-px truncate max-w-20 ${tagCls}`}>{f}</span>
                ))}
                {hoverInfo.node.features.length > 4 && (
                  <span className={`text-[9px] ${subCls}`}>+{hoverInfo.node.features.length - 4}</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Node/edge count */}
      <div className={`absolute top-3 right-3 z-10 text-[10px] font-mono ${subCls}`}>
        {nodes.length} nodes · {edges.length} edges
      </div>
    </div>
  );
}
