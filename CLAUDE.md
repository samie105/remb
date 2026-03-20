<!-- remb-dynamic-context -->
# Remb — Live Project Context

> **Project**: remb | **Refreshed**: 2026-03-20T15:16
> This file is auto-generated and gitignored. It injects real project context into every prompt.
> For the full context bundle, call `remb_loadProjectContext`.

## Core Memories

### API Layer Uses Dedicated Routes with Function Handlers for POST Requests (pattern)
API endpoints such as app/api/vivid/token/route.ts and app/api/vivid/function/route.ts implement POST request handling using function handlers. This pattern streamlines backend integration, supports authentication validation via Clerk, and manages token creation and function invocation securely.

### Authorization with Privy Uses Clerk JWTs for Secure Wallet Operations (knowledge)
Authorization logic in lib/privy/authorization.ts uses Clerk-issued JWTs to authenticate with the Privy service, obtaining per-session authorization keys. This ensures secure wallet operations by validating authorization contexts before allowing blockchain transactions.

### Binary Options Trading UI Uses Lightweight-Charts for Performance (preference)
The binary-client.tsx component provides an interactive UI for binary options trading across crypto, forex, and commodities. It leverages the lightweight-charts library for performant candlestick and volume charts, enabling real-time price updates and trade placement with responsive design.

### Asset Management Uses Component-Based Architecture with Onboarding (pattern)
The asset management UI is split between app/assets/page.tsx and components/assets/assets-client.tsx, encapsulating asset operations in reusable components. It supports multi-chain wallet display, token addition, and onboarding guidance to help users manage crypto assets effectively.

### Blockchain Integration Centralizes Chain and Token Configurations (knowledge)
The lib/bridge-config.ts file maintains a constant structure defining supported blockchain networks and their tokens. This shared configuration enables seamless multi-chain token transactions and integration across the app's wallet and trading features.


_...5 more memories — call `remb_loadProjectContext` for all_

## Current Session Activity

- `14:52:10` 🤖 **ai**: Interesting! In tar-stream v3.1.8, `extract` IS a function when using `require`. The issue might be with the ESM dynamic import `await import("tar-stream")`.

Let me test that:
- `14:55:15` 💬 **user**: how does this projject handle it's spot trading page?
Fetching project context
It seems I wasn't able to fetch detailed context about the project's cu
- `14:56:10` 🤖 **ai**: The user has two issues:
1. The AI in the plan chat doesn't know about the project context even though it was scanned - the system prompt needs to be enhanced to load actual project context (features,
- `14:56:10` 🤖 **ai**: OK so the dynamic import does expose `extract` as a named export. So `const { extract } = await import("tar-stream")` should work... but the user is seeing "extract is not a function."

Wait, the erro
- `14:57:10` 🤖 **ai**: Interesting! So `tar-stream` v3.1.8 is a CommonJS module with `exports.extract = require('./extract')`. And when you do `const { extract } = await import("tar-stream")`, you get `extract` from the nam
- `14:58:00` saved `lib/github-reader.ts`
- `14:58:10` 🤖 **ai**: Interesting! So `tar-stream` v3.1.8 is a CommonJS module with `exports.extract = require('./extract')`. And when you do `const { extract } = await import("tar-stream")`, you get `extract` from the nam
- `15:00:10` 🤖 **ai**: Now let me look at the context bundle route to understand how to load full project context:
Now I have the full picture. Let me install react-markdown and start implementing.
- `15:10:16` 🤖 **ai**: Zero errors. Now commit and deploy:
- `15:11:13` 🤖 **ai**: Good, packages installed. Now let me check the current state of the files that seem to have been emptied in a previous session:
All files still have content. Now let me proceed with the two main tasks
- `15:11:15` saved `app/api/plan/chat/route.ts`
- `15:11:25` saved `app/api/plan/chat/route.ts`
- `15:11:44` saved `app/api/plan/chat/route.ts`
- `15:12:13` 🤖 **ai**: ```
```
Now update the
tool to return the full context, and update the system prompt:
```
```
Now update the system prompt to include full project context:
```
```
Now let me look at how the rest of t
- `15:13:13` 🤖 **ai**: All UI components I need are available. Now let me build the redesigned plan-chat.tsx. This is a complete rewrite with:
1. Rich tool call displays with expandable contexts (green for context fetching,
- `15:14:53` saved `components/dashboard/plan/plan-chat.tsx`
- `15:15:15` 🤖 **ai**: ```
```
Now add the markdown styles. Let me check the globals.css:
- `15:15:27` saved `app/globals.css`
- `15:16:13` 🤖 **ai**: Wait, it looks like those files from a previous session were staged and committed in the previous session... but now there are still staged files remaining. Let me see if the deploy was successful - i
- `15:16:14` 🤖 **ai**: Now add the markdown styles for the chat:
```
```

## Project Context Summary

# remb — Project Context

> Auto-generated by Remb. Last updated: 2026-03-20



_(truncated — call `remb_loadProjectContext` for full context)_

---

_You already have the above context. Use `remb_conversationLog` to record what you accomplish in this session. Use `remb_createMemory` for important discoveries._
