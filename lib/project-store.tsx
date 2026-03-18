"use client";

import * as React from "react";
import type { ProjectWithCounts } from "@/lib/project-actions";

/* ─── External store (shared singleton for projects list) ─── */
let listeners: Array<() => void> = [];
let state: { projects: ProjectWithCounts[] } = {
  projects: [],
};

function emitChange() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners = [...listeners, listener];
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function getSnapshot() {
  return state;
}

const serverSnapshot: { projects: ProjectWithCounts[] } = { projects: [] };

function getServerSnapshot() {
  return serverSnapshot;
}

/* ─── Actions ─── */
function setProjects(projects: ProjectWithCounts[]) {
  state = { ...state, projects };
  emitChange();
}

/* ─── Hook ─── */
export function useProjectStore() {
  const snapshot = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return {
    projects: snapshot.projects,
    setProjects,
  };
}

/* ─── Context for initial data (projects list from server) ─── */
const ProjectsContext = React.createContext<ProjectWithCounts[]>([]);

export function ProjectsProvider({
  children,
  initialProjects,
}: {
  children: React.ReactNode;
  initialProjects: ProjectWithCounts[];
}) {
  React.useEffect(() => {
    setProjects(initialProjects);
  }, [initialProjects]);

  return (
    <ProjectsContext.Provider value={initialProjects}>
      {children}
    </ProjectsContext.Provider>
  );
}

export function useProjects() {
  return React.useContext(ProjectsContext);
}
