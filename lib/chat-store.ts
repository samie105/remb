"use client";

import * as React from "react";

/* ─── Types ─── */

export type ChatWindowState = "pill" | "mini" | "full";

export type ChatModel = "o4-mini" | "gpt-4.1";

export interface ModelUsage {
  model: ChatModel;
  used: number;
  limit: number;
  remaining: number;
}

export type PanelType = "plan";

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

export interface ConversationSummary {
  id: string;
  title: string;
  preview: string;
  createdAt: string;
  source: string;
  messageCount: number;
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
  /* model selection + usage */
  modelMode: ChatModel;
  modelUsage: ModelUsage[];
  detectedProjects: DetectedProject[];
  activeProjectId: string | null;
  contextFiles: ContextFile[];
  uploadedFiles: UploadedFile[];
  panel: ChatPanel | null;
  /* conversation history */
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  showConversationList: boolean;
  conversationsLoaded: boolean;
}

/* ─── External store (singleton) ─── */

let listeners: Array<() => void> = [];
let state: ChatState = {
  windowState: "pill",
  messages: [],
  isStreaming: false,
  modelMode: "gpt-4.1",
  modelUsage: [],
  detectedProjects: [],
  activeProjectId: null,
  contextFiles: [],
  uploadedFiles: [],
  panel: null,
  conversations: [],
  activeConversationId: null,
  showConversationList: false,
  conversationsLoaded: false,
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
  modelMode: "gpt-4.1",
  modelUsage: [],
  detectedProjects: [],
  activeProjectId: null,
  contextFiles: [],
  uploadedFiles: [],
  panel: null,
  conversations: [],
  activeConversationId: null,
  showConversationList: false,
  conversationsLoaded: false,
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

export function editMessage(messageId: string, newContent: string) {
  const idx = state.messages.findIndex((m) => m.id === messageId);
  if (idx === -1) return;
  // Replace the message content and truncate everything after it
  const updated = state.messages.slice(0, idx + 1);
  updated[idx] = { ...updated[idx], content: newContent };
  state = { ...state, messages: updated };
  emitChange();
}

export function removeMessagesFrom(messageId: string) {
  const idx = state.messages.findIndex((m) => m.id === messageId);
  if (idx === -1) return;
  state = { ...state, messages: state.messages.slice(0, idx) };
  emitChange();
}

export function removeConversation(sessionId: string) {
  state = {
    ...state,
    conversations: state.conversations.filter((c) => c.id !== sessionId),
    ...(state.activeConversationId === sessionId
      ? { activeConversationId: null, messages: [], panel: null }
      : {}),
  };
  emitChange();
}

export function setStreaming(isStreaming: boolean) {
  state = { ...state, isStreaming };
  emitChange();
}

export function setModelMode(modelMode: ChatModel) {
  state = { ...state, modelMode };
  emitChange();
}

export function setModelUsage(modelUsage: ModelUsage[]) {
  state = { ...state, modelUsage };
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

/* ─── Conversation actions ─── */

export function setConversations(conversations: ConversationSummary[]) {
  state = { ...state, conversations, conversationsLoaded: true };
  emitChange();
}

export function setActiveConversation(id: string | null) {
  state = { ...state, activeConversationId: id };
  emitChange();
}

export function toggleConversationList() {
  state = { ...state, showConversationList: !state.showConversationList };
  emitChange();
}

export function setShowConversationList(show: boolean) {
  state = { ...state, showConversationList: show };
  emitChange();
}

export function newConversation() {
  state = {
    ...state,
    activeConversationId: null,
    messages: [],
    panel: null,
    showConversationList: false,
  };
  emitChange();
}

/* ─── Hook ─── */

export function useChatStore() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
