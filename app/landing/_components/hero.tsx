import { Zap, ArrowRight } from "lucide-react";
import { TermDots } from "./shared";

type Props = { scrollTo: (id: string) => void };

export function HeroSection({ scrollTo }: Props) {
  return (
    <section
      id="hero"
      className="relative min-h-screen flex flex-col items-center justify-center px-4 md:px-6 pt-20"
    >
      <div className="max-w-3xl mx-auto text-center">
        <div className="hero-badge inline-flex items-center gap-2 px-3.5 py-1 rounded-full border border-[oklch(1_0_0/8%)] bg-[oklch(1_0_0/3%)] text-[oklch(0.55_0_0)] text-[11px] md:text-[12px] font-medium tracking-[0.04em] uppercase mb-8 opacity-0">
          <Zap className="size-3" />
          Available on npm, VS Code &amp; Homebrew
        </div>

        <h1 className="hero-h1 text-[clamp(2rem,6vw,4.5rem)] font-semibold tracking-[-0.04em] leading-[1.08] opacity-0">
          Your AI never
          <br />
          forgets again
        </h1>

        <p className="hero-sub mt-5 text-[clamp(0.95rem,2vw,1.15rem)] text-[oklch(0.55_0_0)] max-w-xl mx-auto leading-relaxed opacity-0">
          Persistent memory layer for AI coding sessions. Context, decisions,
          and patterns survive across every conversation.
        </p>

        <div className="hero-ctas flex flex-col sm:flex-row items-center justify-center gap-3 mt-8 opacity-0">
          <button
            onClick={() => scrollTo("install")}
            className="group w-full sm:w-auto px-5 py-2.5 text-[13px] font-medium rounded-lg bg-[oklch(0.93_0_0)] text-[oklch(0.09_0_0)] hover:bg-[oklch(0.85_0_0)] transition-colors flex items-center justify-center gap-2"
          >
            Install Now
            <ArrowRight className="size-3.5 group-hover:translate-x-0.5 transition-transform" />
          </button>
          <button
            onClick={() => scrollTo("how-it-works")}
            className="w-full sm:w-auto px-5 py-2.5 text-[13px] font-medium rounded-lg border border-[oklch(1_0_0/8%)] bg-[oklch(1_0_0/3%)] text-[oklch(0.78_0_0)] hover:bg-[oklch(1_0_0/6%)] transition-colors"
          >
            How It Works
          </button>
        </div>
      </div>

      {/* Hero terminal */}
      <div className="hero-terminal mt-14 w-full max-w-2xl mx-auto opacity-0">
        <div className="rounded-xl border border-[oklch(1_0_0/8%)] bg-[oklch(0.13_0_0)] p-4 md:p-5 font-mono text-[12px] md:text-[13px]">
          <TermDots label="Terminal" />
          <div className="space-y-1.5">
            <p>
              <span className="text-[oklch(0.55_0_0)]">$</span>{" "}
              <span className="text-[oklch(0.78_0_0)]">remb init</span>
            </p>
            <p className="text-[oklch(0.45_0_0)]">
              {"\u2714"} Project &quot;my-app&quot; registered
            </p>
            <p className="text-[oklch(0.45_0_0)]">
              {"\u2714"} GitHub connected, scanning 132 files...
            </p>
            <p className="text-[oklch(0.45_0_0)]">
              {"\u2714"} 24 features extracted, 8 core memories saved
            </p>
            <p className="mt-2">
              <span className="text-[oklch(0.55_0_0)]">$</span>{" "}
              <span className="text-[oklch(0.78_0_0)]">remb context</span>
            </p>
            <p className="text-[oklch(0.45_0_0)]">
              {"  \u2192 "}8 core memories loaded
            </p>
            <p className="text-[oklch(0.45_0_0)]">
              {"  \u2192 "}3 recent conversations restored
            </p>
            <p className="text-[oklch(0.45_0_0)]">
              {"  \u2192 "}Architecture: Next.js + tRPC + Prisma
            </p>
            <p className="mt-2">
              <span className="text-[oklch(0.55_0_0)]">$</span>{" "}
              <span className="text-[oklch(0.93_0_0)]">
                AI now has full project context
              </span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
