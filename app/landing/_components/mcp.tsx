import {
  MCP_CAPS,
  MCP_REMOTE_CONFIG,
  MCP_LOCAL_CONFIG,
  SUPPORTED_TOOLS,
} from "./data";
import { BlurReveal, CopyButton, TermDots } from "./shared";

export function McpSection() {
  return (
    <section
      id="mcp"
      className="py-24 md:py-32 px-4 md:px-6 border-t border-[oklch(1_0_0/6%)]"
    >
      <div className="max-w-280 mx-auto">
        <div className="section-intro text-center mb-12 md:mb-16 opacity-0">
          <p className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[oklch(0.5_0_0)] mb-3">
            Model Context Protocol
          </p>
          <h2 className="text-[clamp(1.5rem,4vw,2.75rem)] font-semibold tracking-[-0.04em]">
            Native MCP integration
          </h2>
        </div>

        <p className="text-center max-w-2xl mx-auto mb-12 md:mb-16">
          <BlurReveal
            text="MCP is the open protocol that lets AI assistants connect to external tools. Remb exposes 42 tools as a first-class MCP server — meaning Claude, Cursor, Windsurf, VS Code Copilot, and any MCP client can access your project memory, code graph, plans, and scanning pipeline natively."
            className="text-[oklch(0.5_0_0)] text-[13px] md:text-[14px] leading-relaxed"
          />
        </p>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Capabilities */}
          <div className="space-y-3">
            {MCP_CAPS.map((item, i) => (
              <div
                key={i}
                className="reveal-row opacity-0 flex items-start gap-3.5 p-4 rounded-xl border border-[oklch(1_0_0/6%)] bg-[oklch(1_0_0/2%)] hover:border-[oklch(1_0_0/10%)] transition-colors"
              >
                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-[oklch(1_0_0/4%)]">
                  <item.icon className="size-4 text-[oklch(0.55_0_0)]" />
                </div>
                <div>
                  <p className="text-[14px] font-medium mb-0.5">
                    {item.title}
                  </p>
                  <p className="text-[13px] text-[oklch(0.45_0_0)] leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Config examples */}
          <div className="space-y-4">
            <div className="reveal-card opacity-0">
              <p className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[oklch(0.4_0_0)] mb-2">
                Remote (HTTP)
              </p>
              <div className="relative rounded-xl border border-[oklch(1_0_0/8%)] bg-[oklch(0.13_0_0)] p-4 md:p-5 font-mono text-[12px] md:text-[13px]">
                <TermDots label="mcp config" />
                <pre className="text-[oklch(0.65_0_0)] overflow-x-auto">
                  {MCP_REMOTE_CONFIG}
                </pre>
                <CopyButton text={MCP_REMOTE_CONFIG} />
              </div>
            </div>

            <div className="reveal-card opacity-0">
              <p className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[oklch(0.4_0_0)] mb-2">
                Local stdio (offline)
              </p>
              <div className="relative rounded-xl border border-[oklch(1_0_0/8%)] bg-[oklch(0.13_0_0)] p-4 md:p-5 font-mono text-[12px] md:text-[13px]">
                <TermDots label="mcp config" />
                <pre className="text-[oklch(0.65_0_0)] overflow-x-auto">
                  {MCP_LOCAL_CONFIG}
                </pre>
                <CopyButton text={MCP_LOCAL_CONFIG} />
              </div>
            </div>

            <div className="reveal-card opacity-0 flex flex-wrap gap-2">
              {SUPPORTED_TOOLS.map((tool) => (
                <span
                  key={tool}
                  className="px-3 py-1.5 rounded-md border border-[oklch(1_0_0/6%)] bg-[oklch(1_0_0/2%)] text-[12px] text-[oklch(0.5_0_0)]"
                >
                  {tool}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
