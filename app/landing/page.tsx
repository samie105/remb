"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

import { NAV_SECTIONS } from "./_components/data";
import { Nav } from "./_components/nav";
import { HeroSection } from "./_components/hero";
import { ProblemSection } from "./_components/problem";
import { FeaturesSection } from "./_components/features";
import { HowItWorksSection } from "./_components/how-it-works";
import { McpSection } from "./_components/mcp";
import { CliSection } from "./_components/cli";
import { InstallSection } from "./_components/install";
import { CtaSection, FooterSection } from "./_components/cta-footer";

gsap.registerPlugin(ScrollTrigger);

export default function LandingPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeSection, setActiveSection] = useState("hero");
  const lenisRef = useRef<Lenis | null>(null);

  const scrollTo = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el && lenisRef.current) {
      lenisRef.current.scrollTo(el, { offset: id === "hero" ? -100 : -72 });
    }
  }, []);

  useEffect(() => {
    /* ── Lenis smooth scroll ── */
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    });
    lenisRef.current = lenis;
    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);

    /* ── Active section observer ── */
    const sectionEls = NAV_SECTIONS.map((s) =>
      document.getElementById(s.id)
    ).filter(Boolean) as HTMLElement[];
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          const top = visible.reduce((a, b) =>
            a.boundingClientRect.top < b.boundingClientRect.top ? a : b
          );
          setActiveSection(top.target.id);
        }
      },
      { rootMargin: "-40% 0px -55% 0px", threshold: 0 }
    );
    sectionEls.forEach((el) => observer.observe(el));

    /* ── Hero stagger ── */
    const heroTl = gsap.timeline({ defaults: { ease: "power3.out" } });
    heroTl
      .fromTo(
        ".hero-badge",
        { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: 0.5 }
      )
      .fromTo(
        ".hero-h1",
        { opacity: 0, y: 40 },
        { opacity: 1, y: 0, duration: 0.8 },
        "-=0.25"
      )
      .fromTo(
        ".hero-sub",
        { opacity: 0, y: 24 },
        { opacity: 1, y: 0, duration: 0.6 },
        "-=0.4"
      )
      .fromTo(
        ".hero-ctas",
        { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: 0.5 },
        "-=0.25"
      )
      .fromTo(
        ".hero-terminal",
        { opacity: 0, y: 30, scale: 0.98 },
        { opacity: 1, y: 0, scale: 1, duration: 0.7 },
        "-=0.2"
      );

    /* ── Scroll-triggered reveals ── */
    [
      { sel: ".reveal-up", y: 40, stagger: 0.08 },
      { sel: ".reveal-card", y: 32, stagger: 0.1 },
      { sel: ".reveal-row", y: 24, stagger: 0.12 },
    ].forEach(({ sel, y, stagger }) => {
      document.querySelectorAll(sel).forEach((el) => {
        const parent = el.closest("section") || el.parentElement;
        gsap.fromTo(
          el,
          { opacity: 0, y },
          {
            opacity: 1,
            y: 0,
            duration: 0.65,
            stagger,
            ease: "power2.out",
            scrollTrigger: { trigger: parent, start: "top 78%" },
          }
        );
      });
    });

    /* ── Section headings slide in ── */
    document.querySelectorAll(".section-intro").forEach((el) => {
      gsap.fromTo(
        el,
        { opacity: 0, y: 48 },
        {
          opacity: 1,
          y: 0,
          duration: 0.85,
          ease: "power3.out",
          scrollTrigger: { trigger: el, start: "top 85%" },
        }
      );
    });

    /* ── How It Works steps (slide from left along timeline) ── */
    gsap.utils.toArray<HTMLElement>(".how-step").forEach((step) => {
      gsap.fromTo(
        step,
        { opacity: 0, x: -30 },
        {
          opacity: 1,
          x: 0,
          duration: 0.7,
          ease: "power2.out",
          scrollTrigger: { trigger: step, start: "top 82%" },
        }
      );
    });

    /* ── Feature cards scale-in ── */
    gsap.utils.toArray<HTMLElement>(".feature-card").forEach((card, i) => {
      gsap.fromTo(
        card,
        { opacity: 0, y: 50, scale: 0.96 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.6,
          delay: i * 0.08,
          ease: "power2.out",
          scrollTrigger: { trigger: card, start: "top 85%" },
        }
      );
    });

    /* ── CLI commands slide left ── */
    gsap.utils.toArray<HTMLElement>(".cli-cmd").forEach((cmd, i) => {
      gsap.fromTo(
        cmd,
        { opacity: 0, x: -40 },
        {
          opacity: 1,
          x: 0,
          duration: 0.5,
          delay: i * 0.06,
          ease: "power2.out",
          scrollTrigger: { trigger: cmd, start: "top 85%" },
        }
      );
    });

    return () => {
      observer.disconnect();
      lenis.destroy();
      ScrollTrigger.getAll().forEach((t) => t.kill());
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="dark min-h-screen bg-[oklch(0.09_0_0)] text-[oklch(0.93_0_0)] selection:bg-[oklch(0.93_0_0/12%)]"
    >
      <Nav activeSection={activeSection} scrollTo={scrollTo} />
      <HeroSection scrollTo={scrollTo} />
      <ProblemSection />
      <FeaturesSection />
      <HowItWorksSection />
      <McpSection />
      <CliSection />
      <InstallSection />
      <CtaSection scrollTo={scrollTo} />
      <FooterSection />
    </div>
  );
}
