"use client";

import { useSyncExternalStore, useCallback, useEffect, useRef } from "react";
import { getScanJobs } from "@/lib/scan-actions";
import type { ScanJobRow } from "@/lib/supabase/types";

/* ─── types ─── */

export interface ScanMonitorState {
  /** Currently running/queued scan jobs across all projects */
  activeJobs: ScanJobRow[];
  /** Last poll timestamp */
  lastPolled: number;
  /** Whether we're currently polling */
  isPolling: boolean;
}

/* ─── singleton state ─── */

const EMPTY: ScanMonitorState = { activeJobs: [], lastPolled: 0, isPolling: false };

let state: ScanMonitorState = EMPTY;
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

function getSnapshot(): ScanMonitorState {
  return state;
}

function getServerSnapshot(): ScanMonitorState {
  return EMPTY;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/* ─── actions ─── */

function updateState(partial: Partial<ScanMonitorState>) {
  state = { ...state, ...partial };
  emit();
}

/** Poll active scan jobs for a specific project */
async function pollJobs(projectId: string): Promise<void> {
  try {
    updateState({ isPolling: true });
    const jobs = await getScanJobs(projectId);
    const active = jobs.filter(
      (j) => j.status === "running" || j.status === "queued",
    );
    updateState({ activeJobs: active, lastPolled: Date.now(), isPolling: false });
  } catch {
    updateState({ isPolling: false });
  }
}

/** Clear all tracked jobs */
function clearJobs() {
  updateState({ activeJobs: [], isPolling: false });
}

/* ─── hook ─── */

/**
 * Global scan monitor — polls for active scan jobs and makes the state
 * available across all dashboard pages without prop drilling.
 *
 * Usage:
 *   const { activeJobs, isPolling } = useScanMonitor(projectId);
 */
export function useScanMonitor(projectId: string | null, intervalMs = 5000) {
  const store = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!projectId) return;

    // Initial poll
    pollJobs(projectId);

    // Set up polling interval
    intervalRef.current = setInterval(() => {
      pollJobs(projectId);
    }, intervalMs);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [projectId, intervalMs]);

  // Stop polling when no active jobs (check after each state update)
  useEffect(() => {
    if (store.activeJobs.length === 0 && store.lastPolled > 0 && intervalRef.current) {
      // Keep polling for a bit after jobs finish to catch new ones
      const timeout = setTimeout(() => {
        if (state.activeJobs.length === 0 && intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }, 15000);
      return () => clearTimeout(timeout);
    }
  }, [store.activeJobs.length, store.lastPolled]);

  const refresh = useCallback(() => {
    if (projectId) pollJobs(projectId);
  }, [projectId]);

  return {
    ...store,
    refresh,
    hasActiveScans: store.activeJobs.length > 0,
  };
}
