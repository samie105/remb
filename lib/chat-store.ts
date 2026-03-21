"use client";

import * as React from "react";

/* ─── Types ─── */

export type ChatWindowState = "pill" | "mini" | "full";

export type PanelType = "plan" | "architecture" | "mermaid";

export interface ChatPanel {
  id: string;
  type: PanelType;
  title: string;
  data: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
}

export interface DetectedProject {
  id: string;
  name: string;
  slug: string;
}

export interface ContextFile {
  path: string;
  projectId: string;
  projectName: string;
}

export interface UploadedFile {
  id: string;
  name: string;
  content: string;
  size: number;
}

interface ChatState {
  windowState: ChatWindowState;
  messages: ChatMessage[];
  isStreaming: boolean;
  detectedProjects: DetectedProject[];
  activeProjectId: string | null;
  contextFiles: ContextFile[];
  uploadedFiles: UploadedFile[];
  panel: ChatPanel | null;
}

/* ─── External store (singleton) ─── */

let listeners: Array<() => void> = [];
let state: ChatState = {
  windowState: "pill",
  messages: [],
  isStreaming: false,
  detectedProjects: [],
  activeProjectId: null,
  contextFiles: [],
  uploadedFiles: [],
  panel: null,
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

const serverSnapshot: ChatState = {
  windowState: "pill",
  messages: [],
  isStreaming: false,
  detectedProjects: [],
  activeProjectId: null,
  contextFiles: [],
  uploadedFiles: [],
  panel: null,
};

function getServerSnapshot() {
  return serverSnapshot;
}

/* ─── Actions ─── */

export function setWindowState(windowState: ChatWindowState) {
  state = { ...state, windowState };
  emitChange();
}

export function openChat() {
  state = { ...state, windowState: "mini" };
  emitChange();
}

export function expandChat() {
  state = { ...state, windowState: "full" };
  emitChange();
}

export function minimizeChat() {
  state = { ...state, windowState: state.windowState === "full" ? "mini" : "pill" };
  emitChange();
}

export function closeChat() {
  state = { ...state, windowState: "pill" };
  emitChange();
}

export function setMessages(messages: ChatMessage[]) {
  state = { ...state, messages };
  emitChange();
}

export function addMessage(message: ChatMessage) {
  state = { ...state, messages: [...state.messages, message] };
  emitChange();
}

export function updateLastAssistantMessage(content: string) {
  const msgs = [...state.messages];
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === "assistant") {
      msgs[i] = { ...msgs[i], content };
      break;
    }
  }
  state = { ...state, messages: msgs };
  emitChange();
}

export function setStreaming(isStreaming: boolean) {
  state = { ...state, isStreaming };
  emitChange();
}

export function setDetectedProjects(projects: DetectedProject[]) {
  state = { ...state, detectedProjects: projects };
  emitChange();
}

export function setActiveProject(projectId: string | null) {
  state = { ...state, activeProjectId: projectId };
  emitChange();
}

export function setContextFiles(files: ContextFile[]) {
  state = { ...state, contextFiles: files };
  emitChange();
}

export function addUploadedFile(file: UploadedFile) {
  state = { ...state, uploadedFiles: [...state.uploadedFiles, file] };
  emitChange();
}

export function removeUploadedFile(fileId: string) {
  state = { ...state, uploadedFiles: state.uploadedFiles.filter((f) => f.id !== fileId) };
  emitChange();
}

export function removeContextFile(path: string) {
  state = { ...state, contextFiles: state.contextFiles.filter((f) => f.path !== path) };
  emitChange();
}

export function clearAllContext() {
  state = { ...state, contextFiles: [], uploadedFiles: [] };
  emitChange();
}

export function setPanel(panel: ChatPanel | null) {
  state = { ...state, panel };
  emitChange();
}

export function updatePanelData(data: Record<string, unknown>) {
  if (!state.panel) return;
  state = { ...state, panel: { ...state.panel, data: { ...state.panel.data, ...data } } };
  emitChange();
}

export function closePanel() {
  state = { ...state, panel: null };
  emitChange();
}

/* ─── Hook ─── */

export function useChatStore() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
