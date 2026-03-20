/** Shared types for the Remb VS Code extension. */

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  repo_url: string | null;
  repo_name: string | null;
  language: string | null;
  branch: string;
  status: string;
  feature_count: number;
  entry_count: number;
  created_at: string;
  updated_at: string;
}

export interface Memory {
  id: string;
  project_id: string | null;
  tier: "core" | "active" | "archive";
  category: string;
  title: string;
  content: string;
  tags: string[];
  token_count: number;
  access_count: number;
  created_at: string;
  updated_at: string;
}

export interface ContextEntry {
  id: string;
  feature: string;
  content: string;
  entry_type: string;
  source: string;
  metadata: unknown;
  created_at: string;
}

export interface ContextBundle {
  project: {
    name: string;
    description: string | null;
    techStack: string[];
    languages: Record<string, number>;
  };
  memories: Array<{
    tier: string;
    category: string;
    title: string;
    content: string;
  }>;
  features: Array<{
    name: string;
    category: string;
    importance: number;
    description: string | null;
    files: string[];
  }>;
  markdown: string;
}

export interface ScanResult {
  scanId: string | null;
  status: "started" | "already_running" | "up_to_date";
  message: string;
  currentSha?: string;
}

export interface ScanStatus {
  scanId: string;
  status: "queued" | "running" | "done" | "failed";
  filesTotal: number;
  filesScanned: number;
  percentage: number;
  logs: Array<{
    timestamp: string;
    file: string;
    status: "scanning" | "done" | "skipped" | "error";
    feature?: string;
    message?: string;
  }>;
  featuresCreated: number;
  errors: number;
  durationMs: number;
  startedAt: string | null;
  finishedAt: string | null;
  machine: string | null;
  estimatedFiles: number | null;
  estimatedSizeKB: number | null;
}

export interface ConversationEntry {
  id: string;
  project_id: string | null;
  session_id: string;
  type: string;
  content: string;
  metadata: Record<string, unknown>;
  source: string;
  created_at: string;
}

export interface McpServer {
  id: string;
  name: string;
  url: string;
  transport: string;
  isActive: boolean;
  toolsCount: number;
  disabledTools: string[];
  healthStatus: "healthy" | "unhealthy" | "unknown";
  lastHealthCheck: string | null;
}

export interface SyncStatusResponse {
  synced: boolean;
  hasRepo: boolean;
  currentSha: string | null;
  lastScannedSha: string | null;
  lastScanAt: string | null;
  status: string;
  message: string;
}

export interface ProjectConfig {
  project: string;
  api_url: string;
  ide?: string;
}
