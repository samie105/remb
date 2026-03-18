export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          github_login: string;
          github_avatar: string | null;
          name: string | null;
          email: string | null;
          plan: string;
          github_token: string | null;
          mcp_tools_version: number;
          two_factor_enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          github_login: string;
          github_avatar?: string | null;
          name?: string | null;
          email?: string | null;
          plan?: string;
          github_token?: string | null;
          mcp_tools_version?: number;
          two_factor_enabled?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          github_login?: string;
          github_avatar?: string | null;
          name?: string | null;
          email?: string | null;
          plan?: string;
          github_token?: string | null;
          mcp_tools_version?: number;
          two_factor_enabled?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      plan_limits: {
        Row: {
          plan: string;
          max_projects: number;
          max_memories: number;
          max_context_entries_per_project: number;
          max_conversations: number;
          max_memory_bytes: number;
          max_context_bytes: number;
          max_token_budget: number;
        };
        Insert: {
          plan: string;
          max_projects: number;
          max_memories: number;
          max_context_entries_per_project: number;
          max_conversations: number;
          max_memory_bytes: number;
          max_context_bytes: number;
          max_token_budget: number;
        };
        Update: {
          plan?: string;
          max_projects?: number;
          max_memories?: number;
          max_context_entries_per_project?: number;
          max_conversations?: number;
          max_memory_bytes?: number;
          max_context_bytes?: number;
          max_token_budget?: number;
        };
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          slug: string;
          description: string | null;
          repo_url: string | null;
          repo_name: string | null;
          language: string | null;
          branch: string;
          status: string;
          scan_on_push: boolean;
          webhook_secret: string | null;
          ignore_patterns: string | null;
          website_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          slug: string;
          description?: string | null;
          repo_url?: string | null;
          repo_name?: string | null;
          language?: string | null;
          branch?: string;
          status?: string;
          scan_on_push?: boolean;
          webhook_secret?: string | null;
          ignore_patterns?: string | null;
          website_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          slug?: string;
          description?: string | null;
          repo_url?: string | null;
          repo_name?: string | null;
          language?: string | null;
          branch?: string;
          status?: string;
          scan_on_push?: boolean;
          webhook_secret?: string | null;
          ignore_patterns?: string | null;
          website_url?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      features: {
        Row: {
          id: string;
          project_id: string;
          name: string;
          description: string | null;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          name: string;
          description?: string | null;
          status?: string;
        };
        Update: {
          name?: string;
          description?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      file_dependencies: {
        Row: {
          id: string;
          project_id: string;
          source_path: string;
          target_path: string;
          import_type: string;
          imported_symbols: string[] | null;
          scan_job_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          source_path: string;
          target_path: string;
          import_type?: string;
          imported_symbols?: string[] | null;
          scan_job_id?: string | null;
          created_at?: string;
        };
        Update: {
          import_type?: string;
          imported_symbols?: string[] | null;
          scan_job_id?: string | null;
        };
        Relationships: [];
      };
      context_entries: {
        Row: {
          id: string;
          feature_id: string;
          content: string;
          entry_type: string;
          source: string;
          metadata: Json;
          embedding: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          feature_id: string;
          content: string;
          entry_type?: string;
          source?: string;
          metadata?: Json;
          embedding?: string | null;
        };
        Update: {
          content?: string;
          entry_type?: string;
          source?: string;
          metadata?: Json;
          embedding?: string | null;
        };
        Relationships: [];
      };
      feature_links: {
        Row: {
          id: string;
          feature_id: string;
          related_feature_id: string;
          relationship: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          feature_id: string;
          related_feature_id: string;
          relationship?: string;
        };
        Update: { relationship?: string };
        Relationships: [];
      };
      api_keys: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          key_hash: string;
          key_preview: string;
          last_used_at: string | null;
          last_tools_version: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          key_hash: string;
          key_preview: string;
          last_used_at?: string | null;
          last_tools_version?: number;
        };
        Update: {
          name?: string;
          last_used_at?: string | null;
          last_tools_version?: number;
        };
        Relationships: [];
      };
      scan_jobs: {
        Row: {
          id: string;
          project_id: string;
          status: string;
          triggered_by: string;
          result: Json;
          started_at: string | null;
          finished_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          status?: string;
          triggered_by?: string;
          result?: Json;
          started_at?: string | null;
          finished_at?: string | null;
        };
        Update: {
          status?: string;
          result?: Json;
          started_at?: string | null;
          finished_at?: string | null;
        };
        Relationships: [];
      };
      cli_auth_sessions: {
        Row: {
          id: string;
          state: string;
          status: string;
          api_key: string | null;
          user_id: string | null;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          state: string;
          status?: string;
          api_key?: string | null;
          user_id?: string | null;
          expires_at: string;
        };
        Update: {
          status?: string;
          api_key?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      mcp_servers: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          url: string;
          transport: "sse" | "streamable-http";
          auth_type: "none" | "bearer" | "custom-header" | "oauth";
          auth_token: string | null;
          custom_headers: Json;
          oauth_tokens: Json | null;
          oauth_client_info: Json | null;
          oauth_code_verifier: string | null;
          is_active: boolean;
          tools_count: number;
          last_health_check: string | null;
          health_status: "healthy" | "unhealthy" | "unknown";
          disabled_tools: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          url: string;
          transport?: "sse" | "streamable-http";
          auth_type?: "none" | "bearer" | "custom-header" | "oauth";
          auth_token?: string | null;
          custom_headers?: Json;
          oauth_tokens?: Json | null;
          oauth_client_info?: Json | null;
          oauth_code_verifier?: string | null;
          is_active?: boolean;
          tools_count?: number;
          last_health_check?: string | null;
          health_status?: "healthy" | "unhealthy" | "unknown";
          disabled_tools?: string[];
        };
        Update: {
          name?: string;
          url?: string;
          transport?: "sse" | "streamable-http";
          auth_type?: "none" | "bearer" | "custom-header" | "oauth";
          auth_token?: string | null;
          custom_headers?: Json;
          oauth_tokens?: Json | null;
          oauth_client_info?: Json | null;
          oauth_code_verifier?: string | null;
          is_active?: boolean;
          tools_count?: number;
          last_health_check?: string | null;
          health_status?: "healthy" | "unhealthy" | "unknown";
          disabled_tools?: string[];
          updated_at?: string;
        };
        Relationships: [];
      };
      memories: {
        Row: {
          id: string;
          user_id: string;
          project_id: string | null;
          tier: "core" | "active" | "archive";
          category: "preference" | "pattern" | "decision" | "correction" | "knowledge" | "general";
          title: string;
          content: string;
          compressed_content: string | null;
          tags: string[];
          access_count: number;
          token_count: number;
          last_accessed_at: string | null;
          embedding: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          project_id?: string | null;
          tier?: "core" | "active" | "archive";
          category?: "preference" | "pattern" | "decision" | "correction" | "knowledge" | "general";
          title: string;
          content: string;
          compressed_content?: string | null;
          tags?: string[];
          access_count?: number;
          token_count?: number;
          last_accessed_at?: string | null;
          embedding?: string | null;
        };
        Update: {
          tier?: "core" | "active" | "archive";
          category?: "preference" | "pattern" | "decision" | "correction" | "knowledge" | "general";
          title?: string;
          content?: string;
          compressed_content?: string | null;
          tags?: string[];
          access_count?: number;
          token_count?: number;
          last_accessed_at?: string | null;
          embedding?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      mcp_oauth_codes: {
        Row: {
          id: string;
          code_hash: string;
          user_id: string;
          client_id: string;
          redirect_uri: string;
          code_challenge: string;
          code_challenge_method: string;
          scope: string | null;
          state: string | null;
          expires_at: string;
          used: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          code_hash: string;
          user_id: string;
          client_id: string;
          redirect_uri: string;
          code_challenge: string;
          code_challenge_method?: string;
          scope?: string | null;
          state?: string | null;
          expires_at: string;
          used?: boolean;
        };
        Update: {
          used?: boolean;
        };
        Relationships: [];
      };
      user_passkeys: {
        Row: {
          id: string;
          user_id: string;
          credential_id: string;
          public_key: string;
          counter: number;
          transports: string[];
          device_name: string;
          created_at: string;
          last_used_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          credential_id: string;
          public_key: string;
          counter?: number;
          transports?: string[];
          device_name: string;
          last_used_at?: string | null;
        };
        Update: {
          counter?: number;
          transports?: string[];
          device_name?: string;
          last_used_at?: string | null;
        };
        Relationships: [];
      };
      user_totp_secrets: {
        Row: {
          id: string;
          user_id: string;
          secret: string;
          verified: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          secret: string;
          verified?: boolean;
        };
        Update: {
          secret?: string;
          verified?: boolean;
        };
        Relationships: [];
      };
      mcp_oauth_clients: {
        Row: {
          id: string;
          client_id: string;
          client_name: string | null;
          redirect_uris: string[];
          grant_types: string[];
          response_types: string[];
          token_endpoint_auth_method: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          client_name?: string | null;
          redirect_uris?: string[];
          grant_types?: string[];
          response_types?: string[];
          token_endpoint_auth_method?: string;
        };
        Update: {
          client_name?: string | null;
          redirect_uris?: string[];
          grant_types?: string[];
          response_types?: string[];
          token_endpoint_auth_method?: string;
        };
        Relationships: [];
      };
      memory_images: {
        Row: {
          id: string;
          memory_id: string;
          user_id: string;
          storage_path: string;
          filename: string;
          mime_type: string;
          size_bytes: number;
          ocr_text: string | null;
          description: string | null;
          width: number | null;
          height: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          memory_id: string;
          user_id: string;
          storage_path: string;
          filename: string;
          mime_type: string;
          size_bytes?: number;
          ocr_text?: string | null;
          description?: string | null;
          width?: number | null;
          height?: number | null;
          created_at?: string;
        };
        Update: {
          ocr_text?: string | null;
          description?: string | null;
          width?: number | null;
          height?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "memory_images_memory_id_fkey";
            columns: ["memory_id"];
            referencedRelation: "memories";
            referencedColumns: ["id"];
          },
        ];
      };
      conversation_entries: {
        Row: {
          id: string;
          user_id: string;
          project_id: string | null;
          session_id: string;
          type: string;
          content: string;
          metadata: Json;
          source: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          project_id?: string | null;
          session_id: string;
          type?: string;
          content: string;
          metadata?: Json;
          source?: string;
          created_at?: string;
        };
        Update: {
          content?: string;
          metadata?: Json;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversation_entries_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversation_entries_project_id_fkey";
            columns: ["project_id"];
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      video_presentations: {
        Row: {
          id: string;
          project_id: string;
          user_id: string;
          style: string;
          status: string;
          prompt_context: Json | null;
          segments: Json;
          error: string | null;
          created_at: string;
          completed_at: string | null;
          pending_segments: number;
        };
        Insert: {
          id?: string;
          project_id: string;
          user_id: string;
          style: string;
          status?: string;
          prompt_context?: Json | null;
          segments?: Json;
          error?: string | null;
          completed_at?: string | null;
          pending_segments?: number;
        };
        Update: {
          style?: string;
          status?: string;
          prompt_context?: Json | null;
          segments?: Json;
          error?: string | null;
          completed_at?: string | null;
          pending_segments?: number;
        };
        Relationships: [
          {
            foreignKeyName: "video_presentations_project_id_fkey";
            columns: ["project_id"];
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "video_presentations_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      user_storage_stats: {
        Row: {
          user_id: string;
          plan: string;
          memory_count: number;
          total_memory_tokens: number;
          memory_bytes: number;
          context_entry_count: number;
          context_bytes: number;
          conversation_entry_count: number;
          project_count: number;
          max_projects: number;
          max_memories: number;
          max_context_entries_per_project: number;
          max_conversations: number;
          max_memory_bytes: number;
          max_context_bytes: number;
          max_token_budget: number;
        };
      };
    };
    Functions: {
      build_context_bundle: {
        Args: {
          p_user_id: string;
          p_project_id?: string | null;
          query_embedding?: string | null;
          token_budget?: number;
        };
        Returns: {
          id: string;
          tier: string;
          category: string;
          title: string;
          content: string;
          tags: string[];
          token_count: number;
          access_count: number;
          similarity: number;
          cumulative_tokens: number;
        }[];
      };
      check_memory_quota: {
        Args: {
          p_user_id: string;
        };
        Returns: boolean;
      };
      decrement_pending_segments: {
        Args: {
          p_id: string;
        };
        Returns: number;
      };
      search_context: {
        Args: {
          p_project_id: string;
          query_embedding: string;
          match_count?: number;
        };
        Returns: {
          id: string;
          feature_id: string;
          content: string;
          entry_type: string;
          source: string;
          metadata: Json;
          similarity: number;
        }[];
      };
      search_memories: {
        Args: {
          p_user_id: string;
          p_project_id?: string;
          query_embedding?: string;
          match_count?: number;
          p_tier?: string;
        };
        Returns: {
          id: string;
          tier: string;
          category: string;
          title: string;
          content: string;
          compressed_content: string | null;
          tags: string[];
          token_count: number;
          access_count: number;
          similarity: number;
        }[];
      };
      touch_memories: {
        Args: {
          memory_ids: string[];
        };
        Returns: undefined;
      };
      trim_old_conversations: {
        Args: {
          p_user_id: string;
          keep_count?: number;
        };
        Returns: number;
      };
      auto_archive_stale_memories: {
        Args: Record<string, never>;
        Returns: number;
      };
      find_duplicate_memories: {
        Args: {
          p_user_id: string;
          p_project_id?: string | null;
          similarity_threshold?: number;
        };
        Returns: {
          memory_a_id: string;
          memory_b_id: string;
          title_a: string;
          title_b: string;
          similarity: number;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

// ─── convenience row types ───────────────────────────────────────────────────
export type UserRow = Database["public"]["Tables"]["users"]["Row"];
export type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
export type FeatureRow = Database["public"]["Tables"]["features"]["Row"];
export type FileDependencyRow = Database["public"]["Tables"]["file_dependencies"]["Row"];
export type ContextEntryRow = Database["public"]["Tables"]["context_entries"]["Row"];
export type FeatureLinkRow = Database["public"]["Tables"]["feature_links"]["Row"];
export type ApiKeyRow = Database["public"]["Tables"]["api_keys"]["Row"];
export type ScanJobRow = Database["public"]["Tables"]["scan_jobs"]["Row"];
export type McpServerRow = Database["public"]["Tables"]["mcp_servers"]["Row"];
export type MemoryRow = Database["public"]["Tables"]["memories"]["Row"];
export type MemoryTier = MemoryRow["tier"];
export type MemoryCategory = MemoryRow["category"];
export type UserPasskeyRow = Database["public"]["Tables"]["user_passkeys"]["Row"];
export type UserTotpSecretRow = Database["public"]["Tables"]["user_totp_secrets"]["Row"];
export type MemoryImageRow = Database["public"]["Tables"]["memory_images"]["Row"];
export type ConversationEntryRow = Database["public"]["Tables"]["conversation_entries"]["Row"];
export type VideoPresentationRow = Database["public"]["Tables"]["video_presentations"]["Row"];
