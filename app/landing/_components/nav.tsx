import { useState } from "react";
import { Brain, Github, Menu, X } from "lucide-react";
import { NAV_SECTIONS } from "./data";

type NavProps = { activeSection: string; scrollTo: (id: string) => void };

export function Nav({ activeSection, scrollTo }: NavProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleNav = (id: string) => {
    scrollTo(id);
    setMobileOpen(false);
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-[oklch(0.09_0_0/80%)] border-b border-[oklch(1_0_0/6%)]">
      <div className="max-w-280 mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <button
          onClick={() => handleNav("hero")}
          className="flex items-center gap-2 group"
        >
          <div className="size-7 rounded-lg bg-[oklch(0.93_0_0)] flex items-center justify-center">
            <Brain className="size-3.5 text-[oklch(0.09_0_0)]" />
          </div>
          <span className="text-[15px] font-semibold tracking-[-0.02em]">
            Remb
          </span>
        </button>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-1">
          {NAV_SECTIONS.filter((s) => s.id !== "hero").map((s) => (
            <button
              key={s.id}
              onClick={() => handleNav(s.id)}
              className={`px-3 py-1.5 rounded-lg text-[13px] transition-colors duration-200 ${
                activeSection === s.id
                  ? "bg-[oklch(1_0_0/8%)] text-[oklch(0.93_0_0)]"
                  : "text-[oklch(0.55_0_0)] hover:text-[oklch(0.78_0_0)]"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          <a
            href="https://github.com/samie105/remb"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[oklch(0.55_0_0)] hover:text-[oklch(0.93_0_0)] transition-colors"
          >
            <Github className="size-4" />
          </a>
          <a
            href="/auth"
            className="hidden sm:inline-flex px-4 py-1.5 text-[13px] font-medium rounded-lg bg-[oklch(0.93_0_0)] text-[oklch(0.09_0_0)] hover:bg-[oklch(0.85_0_0)] transition-colors"
          >
            Get Started
          </a>
          <button
            className="md:hidden p-1.5 rounded-lg text-[oklch(0.55_0_0)] hover:text-[oklch(0.93_0_0)] hover:bg-[oklch(1_0_0/6%)] transition-colors"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? (
              <X className="size-5" />
            ) : (
              <Menu className="size-5" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="md:hidden border-t border-[oklch(1_0_0/6%)] bg-[oklch(0.09_0_0/95%)] backdrop-blur-xl">
          <div className="px-4 py-3 space-y-1">
            {NAV_SECTIONS.filter((s) => s.id !== "hero").map((s) => (
              <button
                key={s.id}
                onClick={() => handleNav(s.id)}
                className={`block w-full text-left px-3 py-2.5 rounded-lg text-[14px] transition-colors ${
                  activeSection === s.id
                    ? "bg-[oklch(1_0_0/8%)] text-[oklch(0.93_0_0)]"
                    : "text-[oklch(0.55_0_0)] hover:text-[oklch(0.78_0_0)] hover:bg-[oklch(1_0_0/4%)]"
                }`}
              >
                {s.label}
              </button>
            ))}
            <a
              href="/auth"
              onClick={() => setMobileOpen(false)}
              className="block w-full text-center mt-2 px-4 py-2.5 text-[14px] font-medium rounded-lg bg-[oklch(0.93_0_0)] text-[oklch(0.09_0_0)] hover:bg-[oklch(0.85_0_0)] transition-colors"
            >
              Get Started
            </a>
          </div>
        </div>
      )}
    </nav>
  );
}
