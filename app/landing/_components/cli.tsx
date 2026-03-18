import { CLI_CMDS } from "./data";
import { TermDots } from "./shared";

export function CliSection() {
  return (
    <section
      id="cli"
      className="py-24 md:py-32 px-4 md:px-6 border-t border-[oklch(1_0_0/6%)]"
    >
      <div className="max-w-280 mx-auto">
        <div className="section-intro text-center mb-12 md:mb-16 opacity-0">
          <p className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[oklch(0.5_0_0)] mb-3">
            Command Line
          </p>
          <h2 className="text-[clamp(1.5rem,4vw,2.75rem)] font-semibold tracking-[-0.04em]">
            Full-featured CLI
          </h2>
          <p className="mt-3 text-[13px] md:text-[14px] text-[oklch(0.5_0_0)] max-w-lg mx-auto">
            Written in Go for instant startup. Ships as a single binary with
            zero runtime dependencies. Also available as a Node.js CLI via npm.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 items-start">
          {/* Commands list */}
          <div className="space-y-2">
            {CLI_CMDS.map((item, i) => (
              <div
                key={i}
                className="cli-cmd opacity-0 flex flex-col sm:flex-row items-start gap-2 sm:gap-3.5 p-3 md:p-3.5 rounded-lg border border-[oklch(1_0_0/5%)] bg-[oklch(1_0_0/1.5%)] hover:border-[oklch(1_0_0/10%)] transition-colors"
              >
                <code className="shrink-0 text-[12px] font-mono text-[oklch(0.7_0_0)] bg-[oklch(1_0_0/4%)] px-2 py-0.5 rounded-md">
                  {item.cmd}
                </code>
                <p className="text-[13px] text-[oklch(0.45_0_0)] leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>

          {/* Terminal demo */}
          <div className="reveal-card opacity-0 md:sticky md:top-20">
            <div className="rounded-xl border border-[oklch(1_0_0/8%)] bg-[oklch(0.13_0_0)] p-4 md:p-5 font-mono text-[11px] md:text-[12px] overflow-x-auto">
              <TermDots label="Terminal \u2014 remb" />
              <div className="space-y-1.5">
                <p>
                  <span className="text-[oklch(0.5_0_0)]">$</span>{" "}
                  <span className="text-[oklch(0.78_0_0)]">
                    remb scan --path src/auth --depth 3
                  </span>
                </p>
                <p className="text-[oklch(0.42_0_0)]">
                  Scanning src/auth (depth: 3)...
                </p>
                <p className="text-[oklch(0.42_0_0)]">
                  {" \u2192 "}Found 8 files, 3 feature boundaries
                </p>
                <p className="text-[oklch(0.42_0_0)]">
                  {" \u2192 "}auth-provider.tsx {"\u2192"} Authentication
                </p>
                <p className="text-[oklch(0.42_0_0)]">
                  {" \u2192 "}session.ts {"\u2192"} Session Management
                </p>
                <p className="text-[oklch(0.42_0_0)]">
                  {" \u2192 "}middleware.ts {"\u2192"} Auth Middleware
                </p>
                <p className="text-[oklch(0.42_0_0)]">
                  {"\u2714"} 3 features updated, 12 context entries saved
                </p>
                <p className="mt-3">
                  <span className="text-[oklch(0.5_0_0)]">$</span>{" "}
                  <span className="text-[oklch(0.78_0_0)]">
                    remb get -f auth --format table
                  </span>
                </p>
                <p className="text-[oklch(0.42_0_0)] whitespace-nowrap">
                  {"\u250C"}
                  {"\u2500".repeat(18)}
                  {"\u252C"}
                  {"\u2500".repeat(29)}
                  {"\u2510"}
                </p>
                <p className="text-[oklch(0.42_0_0)] whitespace-nowrap">
                  {"\u2502"} Feature{"  \u00A0".repeat(4)}
                  {"\u2502"} Content{"  \u00A0".repeat(8)}
                  {"\u2502"}
                </p>
                <p className="text-[oklch(0.42_0_0)] whitespace-nowrap">
                  {"\u251C"}
                  {"\u2500".repeat(18)}
                  {"\u253C"}
                  {"\u2500".repeat(29)}
                  {"\u2524"}
                </p>
                <p className="text-[oklch(0.42_0_0)] whitespace-nowrap">
                  {"\u2502"} Authentication{"\u00A0\u00A0\u00A0"}
                  {"\u2502"} PKCE OAuth + refresh tokens{"\u00A0"}
                  {"\u2502"}
                </p>
                <p className="text-[oklch(0.42_0_0)] whitespace-nowrap">
                  {"\u2502"} Session Mgmt{"\u00A0\u00A0\u00A0\u00A0\u00A0"}
                  {"\u2502"} Server-side with httpOnly{"\u00A0\u00A0\u00A0"}
                  {"\u2502"}
                </p>
                <p className="text-[oklch(0.42_0_0)] whitespace-nowrap">
                  {"\u2502"} Auth Middleware{"\u00A0\u00A0\u00A0"}
                  {"\u2502"} Edge middleware, JWT verify{"\u00A0"}
                  {"\u2502"}
                </p>
                <p className="text-[oklch(0.42_0_0)] whitespace-nowrap">
                  {"\u2514"}
                  {"\u2500".repeat(18)}
                  {"\u2534"}
                  {"\u2500".repeat(29)}
                  {"\u2518"}
                </p>
                <p className="mt-3">
                  <span className="text-[oklch(0.5_0_0)]">$</span>{" "}
                  <span className="text-[oklch(0.78_0_0)]">
                    remb link --from auth --to session --type depends_on
                  </span>
                </p>
                <p className="text-[oklch(0.42_0_0)]">
                  {"\u2714"} Linked auth {"\u2192"} session (depends_on)
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
