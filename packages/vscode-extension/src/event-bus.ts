import * as vscode from "vscode";

/* ─── Event types ─── */

export interface ToolInvokedEvent {
  toolName: string;
  args: Record<string, unknown>;
  timestamp: number;
}

export interface ToolResultEvent {
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
  durationMs: number;
  timestamp: number;
}

export interface FileSavedEvent {
  uri: vscode.Uri;
  relativePath: string;
  timestamp: number;
}

export interface ContextUpdatedEvent {
  source: "scan" | "mcp" | "poll" | "manual";
  projectSlug?: string;
  timestamp: number;
}

export interface ScanEvent {
  status: "started" | "completed" | "failed";
  scanId?: string;
  projectSlug?: string;
  timestamp: number;
}

export type EventMap = {
  "tool:invoked": ToolInvokedEvent;
  "tool:result": ToolResultEvent;
  "file:saved": FileSavedEvent;
  "context:updated": ContextUpdatedEvent;
  "scan:status": ScanEvent;
  "flush:requested": { reason: string };
};

/* ─── Event Bus ─── */

/**
 * Central event bus for the Remb extension. Replaces independent timer-based
 * polling with event-driven coordination between components.
 *
 * Components emit events (e.g. tool results, file saves) and others listen
 * (e.g. conversation capture, instructions refresh, sync manager).
 */
export class EventBus implements vscode.Disposable {
  private emitters = new Map<string, vscode.EventEmitter<unknown>>();

  /** Get or create a typed event emitter for a specific event type. */
  private getEmitter<K extends keyof EventMap>(event: K): vscode.EventEmitter<EventMap[K]> {
    let emitter = this.emitters.get(event);
    if (!emitter) {
      emitter = new vscode.EventEmitter<EventMap[K]>();
      this.emitters.set(event, emitter);
    }
    return emitter as vscode.EventEmitter<EventMap[K]>;
  }

  /** Subscribe to typed events. Returns a Disposable. */
  on<K extends keyof EventMap>(event: K, listener: (e: EventMap[K]) => void): vscode.Disposable {
    return this.getEmitter(event).event(listener);
  }

  /** Emit a typed event. */
  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    const emitter = this.emitters.get(event);
    if (emitter) emitter.fire(data);
  }

  dispose(): void {
    for (const emitter of this.emitters.values()) {
      emitter.dispose();
    }
    this.emitters.clear();
  }
}
