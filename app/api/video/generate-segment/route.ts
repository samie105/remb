import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { generateVideoClip } from "@/lib/veo";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Per-segment worker: generates ONE video clip, uploads it, and updates
 * the presentation row. When the last segment finishes it finalizes the
 * presentation status.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { presentationId, segmentIndex, prompt, storagePath, secret } = body as {
    presentationId: string;
    segmentIndex: number;
    prompt: string;
    storagePath: string;
    secret: string;
  };

  if (secret !== process.env.SCAN_WORKER_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createAdminClient();

  try {
    // Check if cancelled before starting
    const { data: current } = await db
      .from("video_presentations")
      .select("status")
      .eq("id", presentationId)
      .single();

    if (current?.status === "failed") {
      return NextResponse.json({ success: true, status: "cancelled" });
    }

    // Generate the clip
    const clip = await generateVideoClip(prompt);

    // Upload to Supabase Storage
    const { error: uploadError } = await db.storage
      .from("project-videos")
      .upload(storagePath, clip.videoBuffer, {
        contentType: clip.mimeType,
        upsert: true,
      });

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    // Get public URL
    const { data: publicUrlData } = db.storage
      .from("project-videos")
      .getPublicUrl(storagePath);

    // Atomically update just this segment's video_url in the JSONB array
    const { data: presentation } = await db
      .from("video_presentations")
      .select("segments")
      .eq("id", presentationId)
      .single();

    if (!presentation) throw new Error("Presentation not found");

    const segments = presentation.segments as {
      order: number;
      title: string;
      prompt: string;
      video_url: string | null;
    }[];

    segments[segmentIndex].video_url = publicUrlData.publicUrl;

    await db
      .from("video_presentations")
      .update({ segments })
      .eq("id", presentationId);

    // Check if this was the last segment to finish → finalize
    await tryFinalize(db, presentationId);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(`Segment ${segmentIndex} failed:`, err);

    // Mark this segment as failed (video_url stays null) and try to finalize
    await tryFinalize(db, presentationId);

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Segment generation failed" },
      { status: 500 },
    );
  }
}

/**
 * Atomically decrement pending_segments and finalize the presentation
 * when the last segment worker completes.
 */
async function tryFinalize(
  db: ReturnType<typeof createAdminClient>,
  presentationId: string,
) {
  // Atomic decrement — avoids race when multiple segments finish at once
  const { data: rpcResult } = await db.rpc("decrement_pending_segments", {
    p_id: presentationId,
  });

  const remaining = rpcResult as number | null;

  // If there are still segments in-flight, don't finalize yet
  if (remaining === null || remaining > 0) return;

  // Last segment done — read final state and finalize
  const { data } = await db
    .from("video_presentations")
    .select("status, segments")
    .eq("id", presentationId)
    .single();

  if (!data || data.status !== "generating") return;

  const segments = data.segments as { video_url: string | null }[];
  const hasAnyVideo = segments.some((s) => s.video_url);

  await db
    .from("video_presentations")
    .update({
      status: hasAnyVideo ? "done" : "failed",
      error: hasAnyVideo ? null : "All video segments failed to generate",
      completed_at: new Date().toISOString(),
    })
    .eq("id", presentationId)
    .eq("status", "generating"); // Conditional: only if still generating
}
