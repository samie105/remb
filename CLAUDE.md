<!-- remb-dynamic-context -->
# Remb — Live Project Context

> **Project**: context-management | **Refreshed**: 2026-03-18T15:21
> This file is auto-generated and gitignored. It injects real project context into every prompt.
> For the full context bundle, call `remb_loadProjectContext`.

## Core Memories

### Navigation Component Design (pattern)
The Navigation feature is implemented in 'components/navigation.tsx' and 'components/ui/sidebar.tsx', featuring a responsive design that adjusts to different screen sizes. It includes dropdown menus and a context API for managing navigation state, improving usability.

### Theming System Implementation (decision)
The theming system is defined in 'app/globals.css' and 'components/theme-provider.tsx', utilizing CSS variables for easy customization. This approach allows for a cohesive design across the application while supporting dark and light modes.

### Form Management Components (knowledge)
The Form Management feature is structured in 'components/ui/form.tsx', providing a consistent way to create and manage forms. It integrates React Context for managing form field state and validation, ensuring a smooth user experience.

### Responsive Design in Authentication (decision)
The Authentication feature, particularly in 'app/auth/login/page.tsx' and 'app/auth/signup/page.tsx', utilizes a responsive design to ensure accessibility across devices. This design choice was made to cater to both desktop and mobile users, enhancing the overall user experience.

### Account Management Structure (knowledge)
The Account Management feature is implemented in 'components/dashboard/main/account-main.tsx', providing users with an interface to manage their personal information and security settings. It emphasizes a user-friendly design and includes a loading state to enhance user experience during data fetchi

### Landing Page — Pending TODOs & Conventions (knowledge)
Outstanding TODOs for the landing page:

1. .env.local — NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY are empty, must be filled from dashboard.clerk.com before auth works
2. Footer social links — Twitter/X, Instagram, LinkedIn all href="#", need real Worldstreet social URLs
3. Footer legal

### Landing Page — Footer Structure (knowledge)
Footer (components/Footer.tsx) — full 4-column layout:

Columns:
1. Brand logo + tagline
2. MARKETS: Forex Trading, Cryptocurrencies, Commodities, Stock Indices, CFDs → all /register
3. TRADE TOOLS: Copy Trading, PAMM Accounts, Vivid AI, Trading Signals, Economic Calendar → all /register
4. COMPANY:

### Landing Page — Page Structure & CTA Routing (knowledge)
Home page (app/page.tsx) component order:
1. Header
2. HeroGlobe — hero section, stars canvas, earth video, "Get Started Now" → /register (brand yellow button)
3. WhyChooseSection (id="features") — "Trade Together" heading, "Start trading now" CTA → /register
4. TickerMarquee — scrolling crypto tick

### Landing Page — Auth Flow (Clerk v7) (knowledge)
Auth provider: Clerk v7 (@clerk/nextjs v7.0.4) — Google OAuth ONLY, no email/password.

Clerk v7 API differences from v6:
- useSignIn() returns { signIn, fetchStatus } — NOT isLoaded
- OAuth: signIn.sso({ strategy: "oauth_google", redirectUrl: "/sso-callback", redirectCallbackUrl: "https://dashboard

### Landing Page — Tech Stack & Project Structure (knowledge)
Project: Worldstreet landing page at /Users/richie/Desktop/spot/landing-page

Stack:
- Next.js 16.1.6 (App Router), React 19.2.3, TypeScript
- Tailwind CSS v4, Framer Motion, Lenis smooth scroll (v1.3.x)
- pnpm package manager
- @clerk/nextjs v7.0.4 (auth)
- lucide-react (icons)

Directory layout:
-

## Current Session Activity

- `15:12:07` saved `app/landing/_components/install.tsx`
- `15:12:32` saved `app/landing/_components/cta-footer.tsx`
- `15:13:43` 🤖 **ai**: Now rewriting the main
as a slim orchestrator — removing the broken pinned How It Works animation and adding proper
animation:
- `15:14:55` saved `app/landing/page.tsx`
- `15:15:47` saved `app/landing/_components/how-it-works.tsx`
- `15:15:59` saved `app/landing/_components/nav.tsx`
- `15:15:59` saved `app/landing/page.tsx`
- `15:15:59` saved `app/landing/_components/data.ts`
- `15:15:59` saved `app/landing/_components/hero.tsx`
- `15:15:59` saved `app/landing/_components/shared.tsx`
- `15:15:59` saved `app/landing/_components/problem.tsx`
- `15:15:59` saved `app/landing/_components/mcp.tsx`
- `15:15:59` saved `app/landing/_components/how-it-works.tsx`
- `15:15:59` saved `app/landing/_components/cta-footer.tsx`
- `15:15:59` saved `app/landing/_components/cli.tsx`
- `15:15:59` saved `app/landing/_components/install.tsx`
- `15:15:59` saved `app/landing/_components/features.tsx`
- `15:16:00` 🤖 **ai**: Just lint suggestions on how-it-works.tsx. Let me fix those and check remaining files:
```
```
- `15:17:04` 🤖 **ai**: Zero errors. Now build:
- `15:19:23` 🤖 **ai**: Build passes. Here's what was done:

**How It Works fix** — The broken pinned-scroll approach (`absolute inset-0` +
collapsed panels to zero height) was replaced with a vertical timeline layout. Each 

## Project Context Summary

# context-management — Project Context

> Auto-generated by Remb. Last updated: 2026-03-18

## Core Knowledge (Always Active)

### Uses TypeScript with Next.js
_preference_

The user prefers TypeScript with functional components, Tailwind CSS for styling, and Shadcn UI components. Uses Zustand or useSyncExternalStore for state management.

### Landing Page — Page Structure & CTA Routing
_knowledge_

Home page (app/page.tsx) component order:
1. Header
2. HeroGlobe — hero section, stars canvas, earth video, "Get Started Now" → /register (brand yellow button)
3. WhyChooseSection (id="features") — "Trade Together" heading, "Start trading now" CTA → /register
4. TickerMarquee — scrolling crypto ticker
5. OpportunitiesSlider — 3-up card slider (Cryptocurrencies, Vivid AI[coming soon], e-Commerce, Forex Markets, Xtreme, Community) with teal Enter buttons → /register, left/right arrows, dot indicators
6. TextRevealScroll — scroll-driven text reveal
7. DashboardPreview — parallax 3D dashboard image tilt
8. FAQSection (id="faq") — accordion, "Create account now" → /register
9. CTASection (id="pricing") — "Get started now" → /register
10. Footer

Smooth scroll: Lenis via SmoothScrollProvider wraps entire layout. Hash anchors (/#features, /#faq, /#pricing) handled via hashchange listener → lenis.scrollTo(el, { offset: -80 }).

All CTA buttons wired:
- "Get Started Now" (hero) → /register
- "Start trading now" (WhyChooseSection) → /register
- "Create account now" (FAQ) → /register
- "Get started now" (CTASection) → /register
- "Get Started" / "Sign In" (Header) → /register or /login
- "See Pricing" button REMOVED from hero

### Landing Page — Footer Structure
_knowledge_

Footer (components/Footer.tsx) — full 4-column layout:

Columns:
1. Brand logo + tagline
2. MARKETS: Forex Trading, Cryptocurrencies, Commodities, Stock Indices, CFDs → all /register
3. TRADE TOOLS: Copy Trading, PAMM Accounts, Vivid AI, Trading Signals, Economic Calendar → all /register
4. COMPANY: About Us (/about), Contact (mailto:support@worldstreetgold.com), WS Academy (/academy), Blog (/blog), Support (mailto:)

Below columns:
- Newsletter subscribe section with email input + teal Subscribe button (form onSubmit preventDefault — no backend yet)
- Regulatory Information block (Worldstreet Markets Limited, 6 regulated activities)
- Risk Warning block (CFD/forex/crypto risk disclosure)
- Bottom bar: "Copyright © 2026 Worldstreet. All rights reserved." + Legal / Privacy Policy / Terms of Service links

Social links (Twitter/X, Instagram, LinkedIn) still href="#" — real URLs not yet provided.

Footer uses next/link <Link> for all internal routes, plain <a> for mailto links.

### Landing Page — Pending TODOs & Conventions
_knowledge_

Outstanding TODOs for the landing page:

1. .env.local — NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY are empty, must be filled from dashboard.clerk.com before auth works
2. Footer social links — Twitter/X, Instagram, LinkedIn all href="#", need real 

_(truncated — call `remb_loadProjectContext` for full context)_

---

_You already have the above context. Use `remb_conversationLog` to record what you accomplish in this session. Use `remb_createMemory` for important discoveries._
