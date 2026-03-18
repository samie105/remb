"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import {
  Brain,
  Terminal,
  Puzzle,
  Download,
  ArrowRight,
  Github,
  Sparkles,
  Layers,
  RefreshCw,
  ChevronDown,
  Copy,
  Check,
  Zap,
  Shield,
  GitBranch,
  Database,
  MessageSquare,
  Search,
  FileCode,
  Globe,
  Cpu,
  ArrowUpRight,
} from "lucide-react";

gsap.registerPlugin(ScrollTrigger);

/* ── Copy button ── */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="absolute right-3 top-3 p-1.5 rounded-md bg-white/5 hover:bg-white/10 transition-colors text-zinc-400 hover:text-white"
    >
      {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
    </button>
  );
}

/* ── Noise overlay SVG ── */
function NoiseOverlay() {
  return (
    <svg className="pointer-events-none fixed inset-0 z-[100] h-full w-full opacity-[0.035]">
      <filter id="noise">
        <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" stitchTiles="stitch" />
      </filter>
      <rect width="100%" height="100%" filter="url(#noise)" />
    </svg>
  );
}

/* ── Grid background ── */
function GridBg() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundSize: "60px 60px",
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.1) 1px, transparent 1px)",
        }}
      />
    </div>
  );
}

export default function LandingPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const problemRef = useRef<HTMLElement>(null);
  const featuresRef = useRef<HTMLElement>(null);
  const mcpRef = useRef<HTMLElement>(null);
  const howRef = useRef<HTMLElement>(null);
  const installRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    });

    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);

    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);

    // ── Hero ──
    const heroTl = gsap.timeline({ defaults: { ease: "power3.out" } });
    heroTl
      .fromTo(".hero-badge", { opacity: 0, y: 20, scale: 0.95 }, { opacity: 1, y: 0, scale: 1, duration: 0.6 })
      .fromTo(".hero-title", { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: 0.9 }, "-=0.3")
      .fromTo(".hero-subtitle", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.7 }, "-=0.5")
      .fromTo(".hero-ctas", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6 }, "-=0.3")
      .fromTo(".hero-terminal", { opacity: 0, y: 40, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 0.8 }, "-=0.3")
      .fromTo(".hero-scroll", { opacity: 0 }, { opacity: 1, duration: 0.5 }, "-=0.1");

    // ── Parallax glow blobs ──
    gsap.to(".glow-blob-1", {
      y: -80,
      ease: "none",
      scrollTrigger: { trigger: heroRef.current, start: "top top", end: "bottom top", scrub: 1 },
    });
    gsap.to(".glow-blob-2", {
      y: -40,
      x: 30,
      ease: "none",
      scrollTrigger: { trigger: heroRef.current, start: "top top", end: "bottom top", scrub: 1 },
    });

    // ── Generic section reveal helper ──
    const revealSections = [
      { selector: ".problem-item", trigger: problemRef.current, stagger: 0.12 },
      { selector: ".feature-card", trigger: featuresRef.current, stagger: 0.1 },
      { selector: ".mcp-item", trigger: mcpRef.current, stagger: 0.15 },
      { selector: ".how-step", trigger: howRef.current, stagger: 0.15 },
      { selector: ".install-method", trigger: installRef.current, stagger: 0.12 },
      { selector: ".install-guide-step", trigger: ".install-guide", stagger: 0.1 },
    ];
    revealSections.forEach(({ selector, trigger, stagger }) => {
      gsap.fromTo(
        selector,
        { opacity: 0, y: 50 },
        {
          opacity: 1, y: 0, duration: 0.7, stagger,
          ease: "power2.out",
          scrollTrigger: { trigger, start: "top 78%", toggleActions: "play none none none" },
        }
      );
    });

    // ── Section headings ──
    document.querySelectorAll(".section-heading").forEach((el) => {
      gsap.fromTo(el, { opacity: 0, y: 40 }, {
        opacity: 1, y: 0, duration: 0.8, ease: "power3.out",
        scrollTrigger: { trigger: el, start: "top 85%" },
      });
    });

    return () => {
      lenis.destroy();
      ScrollTrigger.getAll().forEach((t) => t.kill());
    };
  }, []);

  return (
    <div ref={containerRef} className="min-h-screen bg-zinc-950 text-white overflow-hidden relative">
      <NoiseOverlay />
      <GridBg />

      {/* ─── Navbar ─── */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-zinc-950/70 border-b border-white/5">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-linear-to-br from-emerald-400 to-cyan-400 flex items-center justify-center">
              <Brain className="w-4.5 h-4.5 text-zinc-950" />
            </div>
            <span className="text-lg font-semibold tracking-tight">Remb</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-zinc-400">
            <a href="#problem" className="hover:text-white transition-colors">Problem</a>
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#mcp" className="hover:text-white transition-colors">MCP</a>
            <a href="#how-it-works" className="hover:text-white transition-colors">How It Works</a>
            <a href="#install" className="hover:text-white transition-colors">Install</a>
            <a
              href="https://github.com/useremb/remb"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors flex items-center gap-1.5"
            >
              <Github className="w-4 h-4" /> GitHub
            </a>
          </div>
          <a
            href="/auth"
            className="px-4 py-2 text-sm font-medium rounded-lg bg-linear-to-r from-emerald-500 to-cyan-500 text-zinc-950 hover:brightness-110 transition-all"
          >
            Get Started
          </a>
        </div>
      </nav>

      {/* ════════════════════ SECTION 1 — HERO ════════════════════════ */}
      <section
        ref={heroRef}
        className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-24 pb-16"
      >
        <div className="glow-blob-1 absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-emerald-500/10 rounded-full blur-[140px] pointer-events-none" />
        <div className="glow-blob-2 absolute top-1/3 left-1/4 w-[400px] h-[400px] bg-cyan-500/8 rounded-full blur-[120px] pointer-events-none" />

        <div className="relative z-10 max-w-4xl mx-auto text-center">
          <div className="hero-badge inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 text-sm mb-8 opacity-0">
            <Sparkles className="w-3.5 h-3.5" />
            Available on npm, VS Code Marketplace & Homebrew
          </div>

          <h1 className="hero-title text-5xl sm:text-7xl lg:text-8xl font-bold tracking-tight leading-[1.05] opacity-0">
            Your AI never
            <br />
            <span className="bg-linear-to-r from-emerald-400 via-cyan-400 to-blue-500 bg-clip-text text-transparent">
              forgets again
            </span>
          </h1>

          <p className="hero-subtitle mt-6 text-lg sm:text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed opacity-0">
            Remb is the <strong className="text-white">persistent memory layer</strong> for AI coding sessions.
            Context, decisions, and patterns survive across conversations —
            so every session picks up right where the last one ended.
          </p>

          <div className="hero-ctas flex flex-col sm:flex-row items-center justify-center gap-4 mt-10 opacity-0">
            <a
              href="#install"
              className="group px-7 py-3.5 rounded-xl bg-linear-to-r from-emerald-500 to-cyan-500 text-zinc-950 font-semibold text-sm hover:brightness-110 transition-all flex items-center gap-2"
            >
              Install Now <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </a>
            <a
              href="#how-it-works"
              className="px-7 py-3.5 rounded-xl border border-white/10 bg-white/5 text-white font-medium text-sm hover:bg-white/10 transition-all"
            >
              How It Works
            </a>
          </div>
        </div>

        {/* Hero terminal preview */}
        <div className="hero-terminal relative z-10 mt-16 w-full max-w-2xl mx-auto opacity-0">
          <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/90 backdrop-blur-sm p-5 font-mono text-sm shadow-2xl shadow-emerald-500/5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-3 h-3 rounded-full bg-red-500/60" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
              <div className="w-3 h-3 rounded-full bg-green-500/60" />
              <span className="ml-3 text-zinc-500 text-xs">Terminal — remb</span>
            </div>
            <div className="space-y-1.5 text-[13px] leading-relaxed">
              <p><span className="text-emerald-400">$</span> <span className="text-zinc-300">remb init</span></p>
              <p className="text-zinc-500">✔ Project &quot;my-app&quot; registered</p>
              <p className="text-zinc-500">✔ GitHub connected, scanning 132 files...</p>
              <p className="text-zinc-500">✔ 24 features extracted, 8 core memories saved</p>
              <p className="mt-2"><span className="text-emerald-400">$</span> <span className="text-zinc-300">remb context</span></p>
              <p className="text-zinc-500">  → 8 core memories loaded</p>
              <p className="text-zinc-500">  → 3 recent conversations restored</p>
              <p className="text-zinc-500">  → Architecture: Next.js + tRPC + Prisma</p>
              <p className="mt-2"><span className="text-emerald-400">$</span> <span className="text-cyan-400">AI now has full project context ✨</span></p>
            </div>
          </div>
        </div>

        <div className="hero-scroll absolute bottom-8 text-zinc-500 animate-bounce opacity-0">
          <ChevronDown className="w-5 h-5" />
        </div>
      </section>

      {/* ════════════════ SECTION 2 — THE PROBLEM ═════════════════════ */}
      <section
        ref={problemRef}
        id="problem"
        className="relative py-32 px-6 border-t border-white/5"
      >
        <div className="max-w-6xl mx-auto">
          <div className="section-heading text-center mb-20 opacity-0">
            <p className="text-red-400 text-sm font-medium tracking-wider uppercase mb-3">
              The Problem
            </p>
            <h2 className="text-4xl sm:text-5xl font-bold tracking-tight">
              Every chat starts from <span className="text-red-400">zero</span>
            </h2>
            <p className="mt-4 text-zinc-400 max-w-2xl mx-auto text-lg">
              AI assistants lose all context between conversations. You repeat yourself, re-explain architecture,
              and watch your AI make the same mistakes you already corrected.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {[
              {
                icon: <MessageSquare className="w-5 h-5" />,
                title: "Repeated Explanations",
                desc: "\"This project uses Next.js App Router with server actions...\" — typed for the 50th time in a new chat window.",
                bad: true,
              },
              {
                icon: <GitBranch className="w-5 h-5" />,
                title: "Lost Decisions",
                desc: "You spent 2 hours deciding on a state management approach. New session? AI suggests the pattern you explicitly rejected.",
                bad: true,
              },
              {
                icon: <FileCode className="w-5 h-5" />,
                title: "No Project Awareness",
                desc: "AI doesn't know your folder structure, naming conventions, or which libraries you use. Every answer is generic.",
                bad: true,
              },
              {
                icon: <RefreshCw className="w-5 h-5" />,
                title: "Broken Continuity",
                desc: "Yesterday you built the auth system together. Today the AI asks \"what authentication approach would you like to use?\"",
                bad: true,
              },
            ].map((item, i) => (
              <div
                key={i}
                className="problem-item opacity-0 p-6 rounded-2xl border border-red-500/10 bg-red-500/[0.03] hover:border-red-500/20 transition-all"
              >
                <div className="flex items-start gap-4">
                  <div className="mt-0.5 p-2 rounded-lg bg-red-500/10 text-red-400">
                    {item.icon}
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1.5">{item.title}</h3>
                    <p className="text-zinc-500 text-sm leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-16 text-center">
            <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 text-sm font-medium">
              <Zap className="w-4 h-4" />
              Remb solves all of this. Automatically.
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════ SECTION 3 — BENTO FEATURES ══════════════════ */}
      <section
        ref={featuresRef}
        id="features"
        className="relative py-32 px-6 border-t border-white/5"
      >
        <div className="max-w-6xl mx-auto">
          <div className="section-heading text-center mb-16 opacity-0">
            <p className="text-emerald-400 text-sm font-medium tracking-wider uppercase mb-3">
              Features
            </p>
            <h2 className="text-4xl sm:text-5xl font-bold tracking-tight">
              Everything your AI <span className="text-emerald-400">needs to remember</span>
            </h2>
          </div>

          {/* Bento Grid */}
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            {/* Big card — Persistent Memory */}
            <div className="feature-card opacity-0 md:col-span-4 p-8 rounded-2xl border border-emerald-500/10 bg-linear-to-br from-emerald-500/[0.07] to-transparent hover:border-emerald-500/20 transition-all group">
              <div className="flex items-start justify-between mb-6">
                <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400">
                  <Brain className="w-6 h-6" />
                </div>
                <span className="text-xs font-medium text-emerald-400/60 uppercase tracking-wider">Core</span>
              </div>
              <h3 className="text-2xl font-bold mb-3">Tiered Persistent Memory</h3>
              <p className="text-zinc-400 leading-relaxed max-w-lg">
                Memories are organized in three layers: <strong className="text-zinc-300">Core</strong> knowledge
                loads automatically every session, <strong className="text-zinc-300">Active</strong> context 
                surfaces on-demand when relevant, and <strong className="text-zinc-300">Archive</strong> stores
                historical decisions for long-term recall. Nothing is ever lost.
              </p>
              <div className="mt-6 flex items-center gap-3 text-sm text-zinc-500">
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs">core</span>
                <span className="px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-400 text-xs">active</span>
                <span className="px-2.5 py-1 rounded-full bg-zinc-700 text-zinc-400 text-xs">archive</span>
              </div>
            </div>

            {/* Small card — Codebase Scanning */}
            <div className="feature-card opacity-0 md:col-span-2 p-6 rounded-2xl border border-cyan-500/10 bg-linear-to-b from-cyan-500/[0.07] to-transparent hover:border-cyan-500/20 transition-all">
              <div className="p-3 rounded-xl bg-cyan-500/10 text-cyan-400 w-fit mb-4">
                <Search className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Codebase Scanning</h3>
              <p className="text-zinc-500 text-sm leading-relaxed">
                Connects to GitHub, scans your repo, and extracts features, dependencies, and architectural patterns automatically.
              </p>
            </div>

            {/* Small card — Conversation History */}
            <div className="feature-card opacity-0 md:col-span-2 p-6 rounded-2xl border border-blue-500/10 bg-linear-to-b from-blue-500/[0.07] to-transparent hover:border-blue-500/20 transition-all">
              <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400 w-fit mb-4">
                <MessageSquare className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Conversation Continuity</h3>
              <p className="text-zinc-500 text-sm leading-relaxed">
                Every session is logged — what was discussed, what was built, key decisions. Your next session starts with full history.
              </p>
            </div>

            {/* Big card — CLI */}
            <div className="feature-card opacity-0 md:col-span-4 p-8 rounded-2xl border border-purple-500/10 bg-linear-to-br from-purple-500/[0.07] to-transparent hover:border-purple-500/20 transition-all">
              <div className="flex items-start justify-between mb-6">
                <div className="p-3 rounded-xl bg-purple-500/10 text-purple-400">
                  <Terminal className="w-6 h-6" />
                </div>
                <span className="text-xs font-medium text-purple-400/60 uppercase tracking-wider">CLI</span>
              </div>
              <h3 className="text-2xl font-bold mb-3">Full-Featured CLI</h3>
              <p className="text-zinc-400 leading-relaxed max-w-lg mb-5">
                Written in Go for instant startup. Scan repos, manage memories, save context, 
                link features, start the MCP server — all from your terminal. Ships as a single 
                binary with zero runtime dependencies.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[13px]">
                {["remb init", "remb scan", "remb context", "remb memory", "remb save", "remb serve"].map((cmd) => (
                  <code key={cmd} className="px-3 py-1.5 rounded-lg bg-zinc-900/80 text-zinc-300 border border-white/5 font-mono">
                    {cmd}
                  </code>
                ))}
              </div>
            </div>

            {/* Small card — Cross-Project */}
            <div className="feature-card opacity-0 md:col-span-3 p-6 rounded-2xl border border-amber-500/10 bg-linear-to-b from-amber-500/[0.07] to-transparent hover:border-amber-500/20 transition-all">
              <div className="p-3 rounded-xl bg-amber-500/10 text-amber-400 w-fit mb-4">
                <Layers className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Cross-Project Search</h3>
              <p className="text-zinc-500 text-sm leading-relaxed">
                Search memories and patterns across all your projects. Say &quot;do it like in project X&quot; and
                your AI pulls the relevant context instantly.
              </p>
            </div>

            {/* Small card — Security */}
            <div className="feature-card opacity-0 md:col-span-3 p-6 rounded-2xl border border-rose-500/10 bg-linear-to-b from-rose-500/[0.07] to-transparent hover:border-rose-500/20 transition-all">
              <div className="p-3 rounded-xl bg-rose-500/10 text-rose-400 w-fit mb-4">
                <Shield className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Secure by Default</h3>
              <p className="text-zinc-500 text-sm leading-relaxed">
                API keys stored with chmod 600. OAuth PKCE for browser login. Scoped tokens per project.
                Your context is yours — never shared across accounts.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════ SECTION 4 — MCP DEEP DIVE ═════════════════════ */}
      <section
        ref={mcpRef}
        id="mcp"
        className="relative py-32 px-6 border-t border-white/5"
      >
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-500/5 rounded-full blur-[160px] pointer-events-none" />

        <div className="max-w-6xl mx-auto relative z-10">
          <div className="section-heading text-center mb-20 opacity-0">
            <p className="text-emerald-400 text-sm font-medium tracking-wider uppercase mb-3">
              Model Context Protocol
            </p>
            <h2 className="text-4xl sm:text-5xl font-bold tracking-tight">
              Native <span className="text-emerald-400">MCP</span> integration
            </h2>
            <p className="mt-4 text-zinc-400 max-w-2xl mx-auto text-lg">
              MCP is the open protocol that lets AI assistants connect to external tools and data.
              Remb exposes your project memory as a first-class MCP server — meaning Claude, Cursor, 
              Windsurf, and any MCP-compatible client can access your context natively.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-12 items-start">
            {/* Left — Capabilities */}
            <div className="space-y-5">
              {[
                {
                  icon: <Database className="w-5 h-5" />,
                  title: "20+ MCP Tools Exposed",
                  desc: "Load context bundles, search memories, log conversations, trigger scans, manage projects — all as MCP tool calls your AI can invoke autonomously.",
                },
                {
                  icon: <Globe className="w-5 h-5" />,
                  title: "Remote SSE Server",
                  desc: "Access via https://mcp.useremb.com/sse — no local binary needed. Just add the URL to your MCP client config and you're connected.",
                },
                {
                  icon: <Cpu className="w-5 h-5" />,
                  title: "Local stdio Mode",
                  desc: "Run `remb serve` for a stdio MCP server — faster, offline-capable, works with any MCP client that supports local processes.",
                },
                {
                  icon: <RefreshCw className="w-5 h-5" />,
                  title: "Auto-Session Protocol",
                  desc: "On every session start, Remb auto-loads project context and conversation history. Your AI starts every chat already knowing your codebase.",
                },
              ].map((item, i) => (
                <div
                  key={i}
                  className="mcp-item opacity-0 flex items-start gap-4 p-5 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all"
                >
                  <div className="mt-0.5 p-2 rounded-lg bg-emerald-500/10 text-emerald-400 shrink-0">
                    {item.icon}
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">{item.title}</h3>
                    <p className="text-zinc-500 text-sm leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Right — Config Examples */}
            <div className="space-y-6">
              <div className="mcp-item opacity-0">
                <p className="text-xs font-semibold tracking-wider uppercase text-zinc-500 mb-3">Claude Desktop / Cursor</p>
                <div className="relative rounded-2xl border border-white/[0.08] bg-zinc-900/80 p-5 font-mono text-[13px]">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-3 h-3 rounded-full bg-red-500/60" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                    <div className="w-3 h-3 rounded-full bg-green-500/60" />
                    <span className="ml-2 text-zinc-500 text-xs">claude_desktop_config.json</span>
                  </div>
                  <pre className="text-zinc-300 overflow-x-auto">{`{
  "mcpServers": {
    "remb": {
      "url": "https://mcp.useremb.com/sse"
    }
  }
}`}</pre>
                  <CopyButton text={`{\n  "mcpServers": {\n    "remb": {\n      "url": "https://mcp.useremb.com/sse"\n    }\n  }\n}`} />
                </div>
              </div>

              <div className="mcp-item opacity-0">
                <p className="text-xs font-semibold tracking-wider uppercase text-zinc-500 mb-3">Local stdio (offline)</p>
                <div className="relative rounded-2xl border border-white/[0.08] bg-zinc-900/80 p-5 font-mono text-[13px]">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-3 h-3 rounded-full bg-red-500/60" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                    <div className="w-3 h-3 rounded-full bg-green-500/60" />
                    <span className="ml-2 text-zinc-500 text-xs">mcp config</span>
                  </div>
                  <pre className="text-zinc-300 overflow-x-auto">{`{
  "mcpServers": {
    "remb": {
      "command": "remb",
      "args": ["serve", "--project", "my-app"]
    }
  }
}`}</pre>
                  <CopyButton text={`{\n  "mcpServers": {\n    "remb": {\n      "command": "remb",\n      "args": ["serve", "--project", "my-app"]\n    }\n  }\n}`} />
                </div>
              </div>

              <div className="mcp-item opacity-0 flex flex-wrap gap-3">
                {["Claude Desktop", "Cursor", "Windsurf", "VS Code Copilot", "Any MCP Client"].map((tool) => (
                  <span
                    key={tool}
                    className="px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.03] text-sm text-zinc-400"
                  >
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ SECTION 5 — HOW IT WORKS ═════════════════════ */}
      <section
        ref={howRef}
        id="how-it-works"
        className="relative py-32 px-6 border-t border-white/5"
      >
        <div className="max-w-5xl mx-auto">
          <div className="section-heading text-center mb-20 opacity-0">
            <p className="text-emerald-400 text-sm font-medium tracking-wider uppercase mb-3">
              How It Works
            </p>
            <h2 className="text-4xl sm:text-5xl font-bold tracking-tight">
              Three steps to <span className="text-emerald-400">permanent context</span>
            </h2>
          </div>

          <div className="relative">
            {/* Vertical line connector */}
            <div className="absolute left-8 top-0 bottom-0 w-px bg-linear-to-b from-emerald-500/40 via-cyan-500/40 to-blue-500/40 hidden md:block" />

            <div className="space-y-16">
              {[
                {
                  num: "01",
                  title: "Connect & Scan",
                  desc: "Point Remb at your GitHub repo. It analyzes your entire codebase — folder structure, frameworks, dependencies, feature boundaries, and architectural patterns. The result is a structured knowledge graph of your project.",
                  accent: "emerald",
                  terminal: [
                    { cmd: "remb init", output: null },
                    { cmd: null, output: "✔ Connected to github.com/you/my-app" },
                    { cmd: null, output: "✔ Scanning 247 files across 12 directories..." },
                    { cmd: null, output: "✔ Extracted 31 features, 5 service boundaries" },
                    { cmd: null, output: "✔ Identified: Next.js 15, Prisma, tRPC, Tailwind" },
                  ],
                },
                {
                  num: "02",
                  title: "Learn & Remember",
                  desc: "As you code with AI, Remb captures decisions, patterns, and context. Memories are tiered by importance — critical architectural decisions in core, feature-specific notes in active, historical context in archive.",
                  accent: "cyan",
                  terminal: [
                    { cmd: "remb save -f auth -c \"Using PKCE OAuth with refresh token rotation\"", output: null },
                    { cmd: null, output: "✔ Saved to auth (core tier)" },
                    { cmd: "remb memory list --tier core", output: null },
                    { cmd: null, output: "  1. Auth: PKCE OAuth with refresh rotation" },
                    { cmd: null, output: "  2. DB: Prisma with connection pooling via PgBouncer" },
                    { cmd: null, output: "  3. State: Zustand for client, server actions for mutations" },
                  ],
                },
                {
                  num: "03",
                  title: "Auto-Load Every Session",
                  desc: "When your AI starts a new conversation, Remb's MCP server automatically injects your project context, recent conversation history, and all relevant memories. No copy-pasting, no re-explaining — your AI already knows.",
                  accent: "blue",
                  terminal: [
                    { cmd: "# AI's first action in every new chat:", output: null },
                    { cmd: null, output: "→ remb_loadProjectContext()" },
                    { cmd: null, output: "  Loading 8 core memories..." },
                    { cmd: null, output: "  Loading 3 recent conversations..." },
                    { cmd: null, output: "  Loading feature map (31 features)..." },
                    { cmd: null, output: "→ AI is now fully context-aware ✨" },
                  ],
                },
              ].map((step, i) => (
                <div key={i} className="how-step opacity-0 relative flex gap-8 md:gap-12">
                  {/* Number */}
                  <div className="relative z-10 shrink-0">
                    <div className={`w-16 h-16 rounded-2xl bg-${step.accent}-500/10 border border-${step.accent}-500/20 flex items-center justify-center`}>
                      <span className={`text-${step.accent}-400 font-bold text-lg font-mono`}>{step.num}</span>
                    </div>
                  </div>
                  {/* Content */}
                  <div className="flex-1 min-w-0 pb-4">
                    <h3 className="text-2xl font-bold mb-3">{step.title}</h3>
                    <p className="text-zinc-400 leading-relaxed mb-5 max-w-xl">{step.desc}</p>
                    <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/80 p-5 font-mono text-[13px] overflow-x-auto">
                      <div className="space-y-1">
                        {step.terminal.map((line, j) => (
                          <p key={j}>
                            {line.cmd ? (
                              <><span className="text-emerald-400">$</span> <span className="text-zinc-300">{line.cmd}</span></>
                            ) : (
                              <span className="text-zinc-500">{line.output}</span>
                            )}
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ SECTION 6 — INSTALL ═══════════════════════ */}
      <section
        ref={installRef}
        id="install"
        className="relative py-32 px-6 border-t border-white/5"
      >
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-emerald-500/5 rounded-full blur-[140px] pointer-events-none" />

        <div className="relative z-10 max-w-5xl mx-auto">
          <div className="section-heading text-center mb-16 opacity-0">
            <p className="text-emerald-400 text-sm font-medium tracking-wider uppercase mb-3">
              Get Started
            </p>
            <h2 className="text-4xl sm:text-5xl font-bold tracking-tight">
              Install in <span className="text-emerald-400">seconds</span>
            </h2>
            <p className="mt-4 text-zinc-400 max-w-xl mx-auto text-lg">
              Four ways to install. One powerful context layer.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-16">
            {[
              {
                label: "curl",
                desc: "Zero dependencies",
                cmd: "curl -fsSL https://useremb.com/install.sh | sh",
                color: "emerald",
              },
              {
                label: "npm",
                desc: "Node.js CLI",
                cmd: "npm install -g remb-cli",
                color: "cyan",
              },
              {
                label: "Homebrew",
                desc: "macOS & Linux",
                cmd: "brew tap useremb/remb && brew install remb",
                color: "blue",
              },
              {
                label: "VS Code",
                desc: "Extension",
                cmd: "ext install remb.remb",
                color: "purple",
              },
            ].map((method, i) => (
              <div
                key={i}
                className={`install-method opacity-0 group p-5 rounded-2xl border border-${method.color}-500/10 bg-${method.color}-500/[0.03] hover:border-${method.color}-500/20 transition-all`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-xs font-semibold tracking-wider uppercase text-${method.color}-400`}>
                    {method.label}
                  </span>
                  <Download className="w-4 h-4 text-zinc-600" />
                </div>
                <p className="text-xs text-zinc-500 mb-3">{method.desc}</p>
                <div className="relative">
                  <code className="block text-[12px] text-zinc-300 bg-zinc-900 rounded-lg p-3 pr-10 overflow-x-auto whitespace-nowrap font-mono">
                    {method.cmd}
                  </code>
                  <CopyButton text={method.cmd} />
                </div>
              </div>
            ))}
          </div>

          {/* Quick-start */}
          <div className="install-guide rounded-3xl border border-white/[0.06] bg-white/[0.015] p-8 sm:p-12">
            <h3 className="text-2xl font-bold mb-2">Quick Start Guide</h3>
            <p className="text-zinc-400 mb-8">From zero to full AI context in 4 steps.</p>

            <div className="space-y-6">
              {[
                {
                  step: "1",
                  title: "Install the CLI",
                  desc: "The Go binary is fastest — single binary, no runtime. Or use npm if you prefer.",
                  code: "curl -fsSL https://useremb.com/install.sh | sh",
                },
                {
                  step: "2",
                  title: "Authenticate",
                  desc: "Opens your browser for OAuth login. Creates a scoped API token for CLI and MCP access.",
                  code: "remb login",
                },
                {
                  step: "3",
                  title: "Initialize your project",
                  desc: "Connects your GitHub repo, scans the codebase, extracts features and architecture into structured memory.",
                  code: "remb init",
                },
                {
                  step: "4",
                  title: "Connect your AI",
                  desc: "Add Remb as an MCP server in Claude Desktop, Cursor, or Windsurf. Context injection is now automatic.",
                  code: `// Add to your MCP client config:
{
  "mcpServers": {
    "remb": {
      "url": "https://mcp.useremb.com/sse"
    }
  }
}`,
                },
              ].map((item, i) => (
                <div key={i} className="install-guide-step opacity-0 flex gap-6">
                  <div className="shrink-0 w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold text-sm">
                    {item.step}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-lg font-semibold mb-1">{item.title}</h4>
                    <p className="text-zinc-400 text-sm mb-3 leading-relaxed">{item.desc}</p>
                    <div className="relative">
                      <pre className="text-[13px] text-zinc-300 bg-zinc-900/80 rounded-xl p-4 pr-12 overflow-x-auto font-mono border border-white/5">
                        {item.code}
                      </pre>
                      <CopyButton text={item.code} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── CTA Banner ─── */}
      <section className="py-24 px-6 border-t border-white/5">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            Stop repeating yourself to your AI
          </h2>
          <p className="text-zinc-400 text-lg mb-8">
            Set up Remb once. Every AI conversation from here forwards starts with full project context.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="#install"
              className="group px-7 py-3.5 rounded-xl bg-linear-to-r from-emerald-500 to-cyan-500 text-zinc-950 font-semibold text-sm hover:brightness-110 transition-all flex items-center gap-2"
            >
              Get Started <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </a>
            <a
              href="https://github.com/useremb/remb"
              target="_blank"
              rel="noopener noreferrer"
              className="px-7 py-3.5 rounded-xl border border-white/10 bg-white/5 text-white font-medium text-sm hover:bg-white/10 transition-all flex items-center gap-2"
            >
              <Github className="w-4 h-4" /> Star on GitHub <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500" />
            </a>
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-white/5 py-12 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-linear-to-br from-emerald-400 to-cyan-400 flex items-center justify-center">
              <Brain className="w-3.5 h-3.5 text-zinc-950" />
            </div>
            <span className="text-sm font-semibold">Remb</span>
            <span className="text-zinc-600 text-sm">— Persistent AI context</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-zinc-500">
            <a href="https://github.com/useremb/remb" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors flex items-center gap-1.5">
              <Github className="w-4 h-4" /> GitHub
            </a>
            <a href="https://marketplace.visualstudio.com/items?itemName=remb.remb" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
              VS Code
            </a>
            <a href="https://www.npmjs.com/package/remb-cli" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
              npm
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
