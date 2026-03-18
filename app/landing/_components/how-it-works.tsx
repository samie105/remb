import { HOW_STEPS } from "./data";
import { TermDots } from "./shared";

export function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      className="py-24 md:py-32 px-4 md:px-6 border-t border-[oklch(1_0_0/6%)]"
    >
      <div className="max-w-280 mx-auto">
        <div className="section-intro text-center mb-16 md:mb-20 opacity-0">
          <p className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[oklch(0.5_0_0)] mb-3">
            How It Works
          </p>
          <h2 className="text-[clamp(1.5rem,4vw,2.75rem)] font-semibold tracking-[-0.04em]">
            Three steps to permanent context
          </h2>
        </div>

        <div className="relative max-w-4xl mx-auto">
          {/* Vertical connector line */}
          <div className="absolute left-3.75 md:left-4.75 top-4 bottom-4 w-px bg-[oklch(1_0_0/6%)]" />

          <div className="space-y-12 md:space-y-20">
            {HOW_STEPS.map((step, i) => (
              <div
                key={i}
                className="how-step opacity-0 relative pl-10 md:pl-14"
              >
                {/* Step number on the timeline */}
                <div className="absolute left-0 flex size-7.5 md:size-9.5 items-center justify-center rounded-full border border-[oklch(1_0_0/8%)] bg-[oklch(0.12_0_0)] text-[11px] md:text-[12px] font-mono font-semibold text-[oklch(0.55_0_0)]">
                  {step.num}
                </div>

                <div className="grid md:grid-cols-2 gap-5 md:gap-10 items-start">
                  {/* Text */}
                  <div>
                    <h3 className="text-[20px] md:text-[28px] font-semibold tracking-[-0.03em] mb-2 md:mb-3">
                      {step.title}
                    </h3>
                    <p className="text-[13px] md:text-[14px] text-[oklch(0.5_0_0)] leading-relaxed">
                      {step.desc}
                    </p>
                  </div>

                  {/* Terminal mock */}
                  <div className="rounded-xl border border-[oklch(1_0_0/8%)] bg-[oklch(0.13_0_0)] p-4 md:p-5 font-mono text-[11px] md:text-[13px] overflow-x-auto">
                    <TermDots label="Terminal" />
                    <div className="space-y-1">
                      {step.lines.map((line, j) => (
                        <p key={j} className="whitespace-nowrap">
                          {line.type === "cmd" ? (
                            <>
                              <span className="text-[oklch(0.5_0_0)]">$</span>
                              {" "}
                              <span className="text-[oklch(0.78_0_0)]">
                                {line.text}
                              </span>
                            </>
                          ) : (
                            <span className="text-[oklch(0.42_0_0)]">
                              {line.text}
                            </span>
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
  );
}
