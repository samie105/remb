"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";

/* ─── types ─── */

export type VideoStyle = "slideshow" | "pitch" | "code-tour";

export type VideoSegment = {
  order: number;
  title: string;
  prompt: string;
  video_url: string | null;
};

export type VideoPresentation = {
  id: string;
  project_id: string;
  user_id: string;
  style: VideoStyle;
  status: "queued" | "generating" | "done" | "failed";
  segments: VideoSegment[];
  error: string | null;
  created_at: string;
  completed_at: string | null;
};

/* ─── helpers ─── */

async function requireUser() {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");
  return session.dbUser;
}

/* ─── actions ─── */

/** Cancel an in-progress video presentation. */
export async function cancelVideoPresentation(presentationId: string): Promise<void> {
  const user = await requireUser();
  const db = createAdminClient();

  const { data } = await db
    .from("video_presentations")
    .select("id, user_id, status")
    .eq("id", presentationId)
    .single();

  if (!data || data.user_id !== user.id) throw new Error("Not found");
  if (data.status !== "queued" && data.status !== "generating") return;

  await db
    .from("video_presentations")
    .update({
      status: "failed",
      error: "Cancelled by user",
      completed_at: new Date().toISOString(),
    })
    .eq("id", presentationId);
}

/** Request a new video presentation. Inserts a queued row then fires generation. */
export async function requestVideoPresentation(
  projectId: string,
  style: VideoStyle,
): Promise<VideoPresentation> {
  const user = await requireUser();
  const db = createAdminClient();

  // Check for in-progress generation on this project
  const { data: existing } = await db
    .from("video_presentations")
    .select("id, status")
    .eq("project_id", projectId)
    .in("status", ["queued", "generating"])
    .limit(1);

  if (existing && existing.length > 0) {
    throw new Error("A video is already being generated for this project");
  }

  // Enforce max 2 successful presentations per project per user
  const { count } = await db
    .from("video_presentations")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .eq("status", "done");

  if (count !== null && count >= 2) {
    throw new Error("You've reached the maximum of 2 presentations per project. Delete one to generate again.");
  }

  // Insert queued row
  const { data, error } = await db
    .from("video_presentations")
    .insert({
      project_id: projectId,
      user_id: user.id,
      style,
      status: "queued",
      segments: [],
    })
    .select()
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to create video presentation");

  // Fire-and-forget: trigger the background worker
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const workerSecret = process.env.SCAN_WORKER_SECRET?.trim();

  fetch(`${appUrl}/api/video/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      presentationId: data.id,
      secret: workerSecret,
    }),
  }).catch(() => {
    // Fire-and-forget — errors logged in the worker itself
  });

  return data as unknown as VideoPresentation;
}

/** Get a single video presentation by ID. */
export async function getVideoPresentation(
  presentationId: string,
): Promise<VideoPresentation | null> {
  const user = await requireUser();
  const db = createAdminClient();

  const { data } = await db
    .from("video_presentations")
    .select("*")
    .eq("id", presentationId)
    .eq("user_id", user.id)
    .single();

  return (data as unknown as VideoPresentation) ?? null;
}

/** List all video presentations for a project. */
export async function listVideoPresentations(
  projectId: string,
): Promise<VideoPresentation[]> {
  const user = await requireUser();
  const db = createAdminClient();

  const { data } = await db
    .from("video_presentations")
    .select("*")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (data as unknown as VideoPresentation[]) ?? [];
}

/** Delete a video presentation and clean up storage. */
export async function deleteVideoPresentation(
  presentationId: string,
): Promise<void> {
  const user = await requireUser();
  const db = createAdminClient();

  // Fetch to get project_id for storage cleanup
  const { data: presentation } = await db
    .from("video_presentations")
    .select("id, project_id, user_id")
    .eq("id", presentationId)
    .eq("user_id", user.id)
    .single();

  if (!presentation) throw new Error("Presentation not found");

  // Clean up storage files
  const folderPath = `${user.id}/${presentation.project_id}/${presentationId}`;
  const { data: files } = await db.storage.from("project-videos").list(folderPath);
  if (files && files.length > 0) {
    await db.storage
      .from("project-videos")
      .remove(files.map((f) => `${folderPath}/${f.name}`));
  }

  // Delete DB row
  const { error } = await db
    .from("video_presentations")
    .delete()
    .eq("id", presentationId)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
}
