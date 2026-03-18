"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Copy, Check } from "lucide-react";

gsap.registerPlugin(ScrollTrigger);

/* ─── Copy to clipboard button ─── */
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="absolute right-3 top-3 p-1.5 rounded-md bg-[oklch(1_0_0/4%)] hover:bg-[oklch(1_0_0/8%)] transition-colors text-[oklch(0.55_0_0)] hover:text-[oklch(0.93_0_0)]"
    >
      {copied ? (
        <Check className="w-3.5 h-3.5 text-[oklch(0.93_0_0)]" />
      ) : (
        <Copy className="w-3.5 h-3.5" />
      )}
    </button>
  );
}

/* ─── Word-by-word blur reveal on scroll ─── */
export function BlurReveal({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const words = ref.current.querySelectorAll(".blur-word");
    gsap.fromTo(
      words,
      { opacity: 0.08, filter: "blur(8px)" },
      {
        opacity: 1,
        filter: "blur(0px)",
        stagger: 0.06,
        duration: 0.5,
        ease: "power2.out",
        scrollTrigger: {
          trigger: ref.current,
          start: "top 82%",
          end: "top 40%",
          scrub: 1,
        },
      }
    );
  }, []);
  return (
    <span ref={ref} className={className}>
      {text.split(" ").map((word, i) => (
        <span key={i} className="blur-word inline-block mr-[0.3em]">
          {word}
        </span>
      ))}
    </span>
  );
}

/* ─── Terminal window dots ─── */
export function TermDots({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 mb-3.5">
      <div className="size-2.5 rounded-full bg-[oklch(0.35_0_0)]" />
      <div className="size-2.5 rounded-full bg-[oklch(0.35_0_0)]" />
      <div className="size-2.5 rounded-full bg-[oklch(0.35_0_0)]" />
      {label && (
        <span className="ml-2 text-[oklch(0.35_0_0)] text-[11px]">
          {label}
        </span>
      )}
    </div>
  );
}
