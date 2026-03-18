import { describe, it, expect } from "vitest";
import { formatEntries, type OutputFormat } from "./output.js";

const sampleEntries = [
  {
    id: "e1",
    feature: "auth",
    content: "Implemented PKCE OAuth flow with refresh tokens",
    entry_type: "manual",
    source: "cli",
    metadata: {},
    created_at: "2026-03-15T10:30:00Z",
  },
  {
    id: "e2",
    feature: "auth",
    content: "Added rate limiting to login endpoint — 5 attempts per minute per IP",
    entry_type: "decision",
    source: "cli",
    metadata: {},
    created_at: "2026-03-14T08:00:00Z",
  },
  {
    id: "e3",
    feature: "payments",
    content: "Switched from Stripe Checkout to Stripe Elements for more flexibility",
    entry_type: "manual",
    source: "web",
    metadata: {},
    created_at: "2026-03-13T15:00:00Z",
  },
];

describe("output", () => {
  describe("formatEntries", () => {
    it("returns a message for empty entries", () => {
      const result = formatEntries([], "table");
      expect(result).toContain("No entries found");
    });

    it("formats as JSON", () => {
      const result = formatEntries(sampleEntries, "json");
      const parsed = JSON.parse(result);
      expect(parsed).toHaveLength(3);
      expect(parsed[0].id).toBe("e1");
      expect(parsed[0].feature).toBe("auth");
    });

    it("formats as markdown", () => {
      const result = formatEntries(sampleEntries, "markdown");
      expect(result).toContain("## auth");
      expect(result).toContain("## payments");
      expect(result).toContain("**manual**");
      expect(result).toContain("**decision**");
      expect(result).toContain("2026-03-15");
      expect(result).toContain("PKCE OAuth");
    });

    it("formats as table", () => {
      const result = formatEntries(sampleEntries, "table");
      expect(result).toContain("FEATURE");
      expect(result).toContain("TYPE");
      expect(result).toContain("SOURCE");
      expect(result).toContain("DATE");
      expect(result).toContain("auth");
      expect(result).toContain("payments");
      expect(result).toContain("2026-03-15");
    });

    it("truncates long content in table format", () => {
      const longEntry = {
        ...sampleEntries[0],
        content: "A".repeat(100),
      };
      const result = formatEntries([longEntry], "table");
      expect(result).toContain("...");
      // Should not contain the full 100 A's
      expect(result).not.toContain("A".repeat(100));
    });

    it("replaces newlines in table content preview", () => {
      const multilineEntry = {
        ...sampleEntries[0],
        content: "Line one\nLine two\nLine three",
      };
      const result = formatEntries([multilineEntry], "table");
      // Newlines should be replaced with spaces in table
      expect(result).toContain("Line one Line two Line three");
    });

    it("groups features in markdown output", () => {
      const result = formatEntries(sampleEntries, "markdown");
      // "auth" appears as a heading with entries beneath, then "payments"
      const authIdx = result.indexOf("## auth");
      const paymentsIdx = result.indexOf("## payments");
      expect(authIdx).toBeLessThan(paymentsIdx);
    });
  });
});
