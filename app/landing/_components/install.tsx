import { Download } from "lucide-react";
import { INSTALL_METHODS, QUICK_STEPS } from "./data";
import { CopyButton } from "./shared";

export function InstallSection() {
  return (
    <section
      id="install"
      className="py-24 md:py-32 px-4 md:px-6 border-t border-[oklch(1_0_0/6%)]"
    >
      <div className="max-w-225 mx-auto">
        <div className="section-intro text-center mb-12 md:mb-16 opacity-0">
          <p className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[oklch(0.5_0_0)] mb-3">
            Get Started
          </p>
          <h2 className="text-[clamp(1.5rem,4vw,2.75rem)] font-semibold tracking-[-0.04em]">
            Install in seconds
          </h2>
        </div>

        <div className="grid sm:grid-cols-2 gap-3 mb-12">
          {INSTALL_METHODS.map((m, i) => (
            <div
              key={i}
              className="reveal-card opacity-0 p-4 md:p-5 rounded-xl border border-[oklch(1_0_0/6%)] bg-[oklch(1_0_0/2%)]"
            >
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[oklch(0.5_0_0)]">
                  {m.label}
                </span>
                <Download className="size-3.5 text-[oklch(0.35_0_0)]" />
              </div>
              <p className="text-[11px] text-[oklch(0.4_0_0)] mb-2.5">
                {m.desc}
              </p>
              <div className="relative">
                <code className="block text-[11px] md:text-[12px] text-[oklch(0.65_0_0)] bg-[oklch(0.13_0_0)] rounded-lg p-3 pr-10 overflow-x-auto whitespace-nowrap font-mono border border-[oklch(1_0_0/5%)]">
                  {m.cmd}
                </code>
                <CopyButton text={m.cmd} />
              </div>
            </div>
          ))}
        </div>

        {/* Quick start */}
        <div className="reveal-card opacity-0 rounded-xl border border-[oklch(1_0_0/6%)] bg-[oklch(1_0_0/2%)] p-5 sm:p-6 md:p-8">
          <h3 className="text-[17px] md:text-[18px] font-semibold tracking-[-0.02em] mb-1.5">
            Quick Start
          </h3>
          <p className="text-[13px] text-[oklch(0.45_0_0)] mb-6">
            From zero to full AI context in 4 steps.
          </p>

          <div className="space-y-5">
            {QUICK_STEPS.map((s, i) => (
              <div key={i} className="flex gap-3 md:gap-4">
                <div className="shrink-0 flex size-7 md:size-8 items-center justify-center rounded-lg border border-[oklch(1_0_0/8%)] bg-[oklch(1_0_0/3%)] text-[11px] md:text-[12px] font-mono font-semibold text-[oklch(0.55_0_0)]">
                  {s.n}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium mb-0.5">{s.title}</p>
                  <p className="text-[13px] text-[oklch(0.45_0_0)] mb-2.5">
                    {s.desc}
                  </p>
                  <div className="relative">
                    <pre className="text-[11px] md:text-[12px] text-[oklch(0.65_0_0)] bg-[oklch(0.13_0_0)] rounded-lg p-3 md:p-3.5 pr-10 overflow-x-auto font-mono border border-[oklch(1_0_0/5%)]">
                      {s.code}
                    </pre>
                    <CopyButton text={s.code} />
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
