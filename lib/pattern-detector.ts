/**
 * Architecture pattern detector.
 * Detects common architecture patterns from code summaries, tags, and file paths.
 * Enriches code nodes with pattern labels. No LLM calls — pure heuristics.
 *
 * Inspired by UA's language-lesson.ts concept detection but adapted
 * for architectural patterns instead of language concepts.
 */

export interface DetectedPattern {
  name: string;
  category: "structural" | "behavioral" | "data" | "integration" | "resilience";
  confidence: number; // 0-1
}

interface PatternRule {
  name: string;
  category: DetectedPattern["category"];
  /** Patterns matched against summary + tags (lowercased). */
  keywords: string[];
  /** Minimum number of keyword matches required. */
  minMatches: number;
}

const PATTERN_RULES: PatternRule[] = [
  // Structural patterns
  { name: "Repository Pattern", category: "structural", keywords: ["repository", "query", "persistence", "findby", "findall", "getby"], minMatches: 1 },
  { name: "Service Layer", category: "structural", keywords: ["service", "business logic", "use case", "domain"], minMatches: 2 },
  { name: "MVC/MVVM", category: "structural", keywords: ["controller", "view", "model", "viewmodel"], minMatches: 2 },
  { name: "Middleware Pipeline", category: "structural", keywords: ["middleware", "interceptor", "pipe", "guard", "next()"], minMatches: 1 },
  { name: "Factory Pattern", category: "structural", keywords: ["factory", "create", "builder", "construct"], minMatches: 2 },
  { name: "Singleton", category: "structural", keywords: ["singleton", "instance", "getinstance", "shared instance"], minMatches: 1 },
  { name: "Dependency Injection", category: "structural", keywords: ["inject", "provider", "container", "dependency injection", "di"], minMatches: 1 },
  { name: "Plugin Architecture", category: "structural", keywords: ["plugin", "extension", "addon", "hook system", "register"], minMatches: 2 },

  // Behavioral patterns
  { name: "Event-Driven", category: "behavioral", keywords: ["event", "listener", "emit", "publish", "subscribe", "on(", "eventbus"], minMatches: 2 },
  { name: "Observer Pattern", category: "behavioral", keywords: ["observer", "subscribe", "notify", "watch", "reactive"], minMatches: 2 },
  { name: "Command Pattern", category: "behavioral", keywords: ["command", "execute", "undo", "dispatch", "action"], minMatches: 2 },
  { name: "Strategy Pattern", category: "behavioral", keywords: ["strategy", "algorithm", "policy", "interchangeable"], minMatches: 1 },
  { name: "State Machine", category: "behavioral", keywords: ["state machine", "transition", "fsm", "status", "lifecycle"], minMatches: 2 },

  // Data patterns
  { name: "Caching Strategy", category: "data", keywords: ["cache", "ttl", "invalidat", "memoiz", "lru", "redis"], minMatches: 1 },
  { name: "CQRS", category: "data", keywords: ["command", "query", "cqrs", "read model", "write model"], minMatches: 2 },
  { name: "Data Transform Pipeline", category: "data", keywords: ["transform", "pipeline", "map", "reduce", "aggregate", "etl"], minMatches: 2 },
  { name: "Pagination", category: "data", keywords: ["paginate", "cursor", "offset", "limit", "page", "next page"], minMatches: 2 },
  { name: "Optimistic Updates", category: "data", keywords: ["optimistic", "rollback", "pending", "revert"], minMatches: 1 },

  // Integration patterns
  { name: "OAuth/SSO", category: "integration", keywords: ["oauth", "sso", "token", "refresh token", "authorize", "openid"], minMatches: 2 },
  { name: "Webhook Handler", category: "integration", keywords: ["webhook", "callback", "payload", "signature", "verify"], minMatches: 2 },
  { name: "API Gateway", category: "integration", keywords: ["gateway", "proxy", "route", "upstream", "downstream"], minMatches: 2 },
  { name: "Queue/Worker", category: "integration", keywords: ["queue", "worker", "job", "task", "background", "process"], minMatches: 2 },

  // Resilience patterns
  { name: "Retry with Backoff", category: "resilience", keywords: ["retry", "backoff", "exponential", "attempt", "maxretries"], minMatches: 2 },
  { name: "Circuit Breaker", category: "resilience", keywords: ["circuit breaker", "trip", "fallback", "degraded"], minMatches: 1 },
  { name: "Rate Limiting", category: "resilience", keywords: ["rate limit", "throttle", "quota", "bucket", "window"], minMatches: 1 },
  { name: "Graceful Degradation", category: "resilience", keywords: ["fallback", "graceful", "degraded", "default"], minMatches: 2 },
];

/**
 * Detect architecture patterns from a code node's summary and tags.
 * Returns all patterns with confidence > 0.
 */
export function detectPatterns(
  summary: string,
  tags: string[] = [],
  filePath?: string,
): DetectedPattern[] {
  const corpus = [
    summary.toLowerCase(),
    ...tags.map((t) => t.toLowerCase()),
    filePath?.toLowerCase() ?? "",
  ].join(" ");

  const detected: DetectedPattern[] = [];

  for (const rule of PATTERN_RULES) {
    let matches = 0;
    for (const kw of rule.keywords) {
      if (corpus.includes(kw.toLowerCase())) matches++;
    }

    if (matches >= rule.minMatches) {
      const confidence = Math.min(1, matches / Math.max(rule.keywords.length * 0.4, rule.minMatches + 1));
      detected.push({
        name: rule.name,
        category: rule.category,
        confidence: Math.round(confidence * 100) / 100,
      });
    }
  }

  // Sort by confidence descending
  return detected.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Get a one-line explanation of an architecture pattern for AI context.
 */
export function getPatternExplanation(patternName: string): string {
  const explanations: Record<string, string> = {
    "Repository Pattern": "Abstracts data access behind a query interface, decoupling business logic from storage.",
    "Service Layer": "Encapsulates business logic in dedicated services, keeping controllers thin.",
    "MVC/MVVM": "Separates concerns into Model (data), View (UI), and Controller/ViewModel (logic).",
    "Middleware Pipeline": "Chains request/response processors in sequence, each handling a cross-cutting concern.",
    "Factory Pattern": "Centralizes object creation logic, hiding instantiation complexity from consumers.",
    "Singleton": "Ensures a single shared instance across the application, typically for global state or connections.",
    "Dependency Injection": "Inverts control by injecting dependencies rather than hardcoding them.",
    "Plugin Architecture": "Allows extending functionality via registered plugins without modifying core code.",
    "Event-Driven": "Components communicate through events rather than direct calls, enabling loose coupling.",
    "Observer Pattern": "Objects subscribe to changes in other objects and react automatically.",
    "Command Pattern": "Encapsulates operations as objects, enabling undo/redo and command queuing.",
    "Strategy Pattern": "Allows swapping algorithms at runtime by defining them behind a common interface.",
    "State Machine": "Models component behavior as a finite set of states with defined transitions.",
    "Caching Strategy": "Stores computed results to avoid redundant work, with TTL-based invalidation.",
    "CQRS": "Separates read and write models for optimized query performance and scalability.",
    "Data Transform Pipeline": "Processes data through sequential transformation stages.",
    "Pagination": "Returns data in bounded pages to manage memory and response size.",
    "Optimistic Updates": "Applies changes immediately in UI and reconciles with server asynchronously.",
    "OAuth/SSO": "Delegates authentication to a trusted identity provider via token exchange.",
    "Webhook Handler": "Receives and processes HTTP callbacks from external services.",
    "API Gateway": "Central entry point that routes, transforms, and secures API requests.",
    "Queue/Worker": "Offloads work to background processors via a job queue.",
    "Retry with Backoff": "Retries failed operations with increasing delays to handle transient failures.",
    "Circuit Breaker": "Stops calling a failing service after threshold, allowing it to recover.",
    "Rate Limiting": "Constrains request volume to prevent abuse and ensure fair resource distribution.",
    "Graceful Degradation": "Falls back to reduced functionality when dependencies fail.",
  };

  return explanations[patternName] ?? "";
}
