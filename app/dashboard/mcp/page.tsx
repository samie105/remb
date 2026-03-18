import { Suspense } from "react";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import type { McpServerInfo } from "@/lib/mcp-actions";
import { McpHubClient } from "./_components/mcp-hub-client";
import { McpHubSkeleton } from "@/components/dashboard/skeletons/page-skeletons";

async function McpData() {
  const session = await getSession();
  if (!session) return null; // layout already redirects

  const db = createAdminClient();
  const { data } = await db
    .from("mcp_servers")
    .select("*")
    .eq("user_id", session.dbUser.id)
    .order("created_at", { ascending: true });

  const servers: McpServerInfo[] = (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    url: row.url,
    transport: row.transport,
    auth_type: row.auth_type,
    is_active: row.is_active,
    tools_count: row.tools_count,
    disabled_tools: row.disabled_tools ?? [],
    health_status: row.health_status,
    last_health_check: row.last_health_check,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));

  return <McpHubClient initialServers={servers} />;
}

export default function McpPage() {
  return (
    <Suspense fallback={<McpHubSkeleton />}>
      <McpData />
    </Suspense>
  );
}
