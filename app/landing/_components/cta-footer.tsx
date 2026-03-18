import { ArrowRight, Github, ArrowUpRight, Brain } from "lucide-react";

type CtaProps = { scrollTo: (id: string) => void };

export function CtaSection({ scrollTo }: CtaProps) {
  return (
    <section className="py-20 md:py-24 px-4 md:px-6 border-t border-[oklch(1_0_0/6%)]">
      <div className="section-intro max-w-2xl mx-auto text-center opacity-0">
        <h2 className="text-[clamp(1.25rem,3vw,2rem)] font-semibold tracking-[-0.03em] mb-3">
          Stop repeating yourself to your AI
        </h2>
        <p className="text-[13px] md:text-[14px] text-[oklch(0.5_0_0)] mb-8">
          Set up once. Every AI conversation from here forwards starts with full
          project context.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={() => scrollTo("install")}
            className="group w-full sm:w-auto px-5 py-2.5 text-[13px] font-medium rounded-lg bg-[oklch(0.93_0_0)] text-[oklch(0.09_0_0)] hover:bg-[oklch(0.85_0_0)] transition-colors flex items-center justify-center gap-2"
          >
            Get Started
            <ArrowRight className="size-3.5 group-hover:translate-x-0.5 transition-transform" />
          </button>
          <a
            href="https://github.com/useremb/remb"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto px-5 py-2.5 text-[13px] font-medium rounded-lg border border-[oklch(1_0_0/8%)] bg-[oklch(1_0_0/3%)] text-[oklch(0.78_0_0)] hover:bg-[oklch(1_0_0/6%)] transition-colors flex items-center justify-center gap-2"
          >
            <Github className="size-3.5" /> Star on GitHub
            <ArrowUpRight className="size-3 text-[oklch(0.4_0_0)]" />
          </a>
        </div>
      </div>
    </section>
  );
}

export function FooterSection() {
  return (
    <footer className="border-t border-[oklch(1_0_0/6%)] py-8 md:py-10 px-4 md:px-6">
      <div className="max-w-280 mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="size-6 rounded-md bg-[oklch(0.93_0_0)] flex items-center justify-center">
            <Brain className="size-3 text-[oklch(0.09_0_0)]" />
          </div>
          <span className="text-[13px] font-semibold">Remb</span>
          <span className="text-[oklch(0.35_0_0)] text-[12px]">
            {"\u2014"} Persistent AI context
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-4 md:gap-5 text-[12px] text-[oklch(0.45_0_0)]">
          <a
            href="https://github.com/useremb/remb"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[oklch(0.78_0_0)] transition-colors flex items-center gap-1.5"
          >
            <Github className="size-3.5" /> GitHub
          </a>
          <a
            href="https://marketplace.visualstudio.com/items?itemName=remb.remb"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[oklch(0.78_0_0)] transition-colors"
          >
            VS Code
          </a>
          <a
            href="https://www.npmjs.com/package/remb-cli"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[oklch(0.78_0_0)] transition-colors"
          >
            npm
          </a>
          <a
            href="https://useremb.com"
            className="hover:text-[oklch(0.78_0_0)] transition-colors"
          >
            Dashboard
          </a>
        </div>
      </div>
    </footer>
  );
}
