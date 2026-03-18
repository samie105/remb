import { FEATURES } from "./data";

export function FeaturesSection() {
  return (
    <section
      id="features"
      className="py-24 md:py-32 px-4 md:px-6 border-t border-[oklch(1_0_0/6%)]"
    >
      <div className="max-w-280 mx-auto">
        <div className="section-intro text-center mb-12 md:mb-16 opacity-0">
          <p className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[oklch(0.5_0_0)] mb-3">
            Features
          </p>
          <h2 className="text-[clamp(1.5rem,4vw,2.75rem)] font-semibold tracking-[-0.04em]">
            Everything your AI needs to remember
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          {FEATURES.map((f, i) => (
            <div
              key={i}
              className={`feature-card ${
                f.span === 4
                  ? "md:col-span-4"
                  : f.span === 3
                    ? "md:col-span-3"
                    : "md:col-span-2"
              } p-5 md:p-6 rounded-xl border border-[oklch(1_0_0/6%)] bg-[oklch(1_0_0/2%)] hover:border-[oklch(1_0_0/10%)] transition-colors`}
            >
              {f.badge ? (
                <div className="flex items-start justify-between mb-4 md:mb-5">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-[oklch(1_0_0/4%)]">
                    <f.icon className="size-4 text-[oklch(0.55_0_0)]" />
                  </div>
                  <span className="text-[9px] font-semibold tracking-[0.08em] uppercase text-[oklch(0.4_0_0)]">
                    {f.badge}
                  </span>
                </div>
              ) : (
                <div className="flex size-9 items-center justify-center rounded-lg bg-[oklch(1_0_0/4%)] mb-4">
                  <f.icon className="size-4 text-[oklch(0.55_0_0)]" />
                </div>
              )}
              <h3
                className={`${
                  f.span === 4 ? "text-[17px] md:text-[18px]" : "text-[15px]"
                } font-semibold tracking-[-0.02em] mb-2`}
              >
                {f.title}
              </h3>
              <p
                className={`text-[13px] ${
                  f.span === 4
                    ? "text-[oklch(0.5_0_0)]"
                    : "text-[oklch(0.45_0_0)]"
                } leading-relaxed max-w-lg`}
              >
                {f.desc}
              </p>
              {f.extra && (
                <div className="mt-4 md:mt-5 flex items-center gap-2 text-[11px]">
                  <span className="px-2.5 py-1 rounded-md bg-[oklch(1_0_0/5%)] text-[oklch(0.6_0_0)] border border-[oklch(1_0_0/6%)]">
                    core
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-[oklch(1_0_0/3%)] text-[oklch(0.5_0_0)] border border-[oklch(1_0_0/4%)]">
                    active
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-[oklch(1_0_0/2%)] text-[oklch(0.4_0_0)] border border-[oklch(1_0_0/3%)]">
                    archive
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
