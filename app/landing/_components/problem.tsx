import { PROBLEMS } from "./data";
import { BlurReveal } from "./shared";

export function ProblemSection() {
  return (
    <section id="problem" className="py-24 md:py-32 px-4 md:px-6">
      <div className="max-w-280 mx-auto">
        <div className="section-intro text-center mb-12 md:mb-16 opacity-0">
          <p className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[oklch(0.5_0_0)] mb-3">
            The Problem
          </p>
          <h2 className="text-[clamp(1.5rem,4vw,2.75rem)] font-semibold tracking-[-0.04em]">
            Every chat starts from zero
          </h2>
        </div>

        <p className="text-center max-w-2xl mx-auto mb-12 md:mb-16">
          <BlurReveal
            text="AI assistants lose all context between conversations. You repeat yourself, re-explain architecture, and watch your AI make the same mistakes you already corrected. Hours of shared context — gone with every new window."
            className="text-[oklch(0.55_0_0)] text-[14px] md:text-[15px] leading-relaxed"
          />
        </p>

        <div className="grid md:grid-cols-2 gap-3 max-w-3xl mx-auto">
          {PROBLEMS.map((item, i) => (
            <div
              key={i}
              className="reveal-card opacity-0 p-4 md:p-5 rounded-xl border border-[oklch(1_0_0/6%)] bg-[oklch(1_0_0/2%)] hover:border-[oklch(1_0_0/10%)] transition-colors"
            >
              <div className="flex items-start gap-3.5">
                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-[oklch(1_0_0/4%)]">
                  <item.icon className="size-4 text-[oklch(0.55_0_0)]" />
                </div>
                <div>
                  <p className="text-[14px] font-medium mb-1">{item.title}</p>
                  <p className="text-[13px] text-[oklch(0.45_0_0)] leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
