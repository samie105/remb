import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import OpenAI from "openai";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/* ─── prompt generation ─── */

type VideoStyle = "slideshow" | "pitch" | "code-tour";

interface SegmentPrompt {
  order: number;
  title: string;
  prompt: string;
}

async function generateSegmentPrompts(
  projectName: string,
  techStack: string[],
  languages: Record<string, number>,
  features: { name: string; description: string | null }[],
  style: VideoStyle,
): Promise<SegmentPrompt[]> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const featureSummary = features
    .slice(0, 15)
    .map((f) => `- ${f.name}${f.description ? `: ${f.description}` : ""}`)
    .join("\n");

  const langSummary = Object.entries(languages)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([lang, count]) => `${lang} (${count} files)`)
    .join(", ");

  const styleInstructions: Record<VideoStyle, string> = {
    slideshow: `Create 5 segments as animated presentation slides. Each segment should visualize one key area of the project:
1. Title/Overview — project name, logo animation, tech stack icons floating in
2. Architecture — animated diagram showing how layers connect (frontend → API → DB)
3. Key Features — most important features with icon animations and text overlays
4. Tech Stack Deep Dive — logos of technologies with connecting lines showing integration
5. Summary — stats, metrics, and closing animation with the project name`,

    pitch: `Create 5 segments as a cinematic tech pitch video. High production value:
1. Hook — dramatic opening, dark background, glowing code particles forming the project name
2. Problem — visual metaphor for the problem the project solves, abstract animations
3. Solution — clean UI mockup reveals, smooth transitions showing the product in action
4. Technology — futuristic visualization of the tech stack, circuit board aesthetics
5. Call to Action — bold project name with tagline, gradient sweep, particle burst ending`,

    "code-tour": `Create 5 segments as a developer-focused code architecture tour:
1. Repo Overview — file tree animation building up, directories expanding, code editor aesthetic
2. Frontend Layer — React/UI components floating, connecting with arrows, component tree visualization
3. Backend/API Layer — server routes, database connections, data flow arrows with glow effects
4. Infrastructure — deployment pipeline, CI/CD visualization, cloud architecture diagram animation
5. Developer Experience — terminal commands running, test suites passing, green checkmarks cascading`,
  };

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_EXTRACT_MODEL ?? "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are an expert video director creating prompts for Veo 3 (Google's AI video generator).
Each prompt must be a detailed, cinematic scene description for an 8-second video clip.
Include: camera movements, lighting, colors, animations, text overlays, mood, pacing.
Make it feel professional and high-production. The style should be modern tech/SaaS aesthetic.
IMPORTANT: Never include human faces or people outside of silhouettes. Focus on abstract, tech-visuals.
Return ONLY valid JSON: { "segments": [{ "order": 1, "title": "...", "prompt": "..." }, ...] }`,
      },
      {
        role: "user",
        content: `Project: "${projectName}"
Tech Stack: ${techStack.join(", ") || "Not specified"}
Languages: ${langSummary || "Not specified"}
Features:
${featureSummary || "No features scanned yet"}

Style: ${style}
${styleInstructions[style]}

Generate 5 detailed Veo 3 video prompts. Each prompt should be 3-5 sentences of rich, detailed visual description for an 8-second clip.`,
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned no content");

  const parsed = JSON.parse(content) as { segments: SegmentPrompt[] };
  return parsed.segments;
}

/* ─── route handler ─── */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { presentationId, secret } = body;

    // Auth: verify internal secret
    if (secret !== process.env.SCAN_WORKER_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!presentationId) {
      return NextResponse.json({ error: "Missing presentationId" }, { status: 400 });
    }

    const db = createAdminClient();

    // Fetch the presentation
    const { data: presentation } = await db
      .from("video_presentations")
      .select("*")
      .eq("id", presentationId)
      .single();

    if (!presentation) {
      return NextResponse.json({ error: "Presentation not found" }, { status: 404 });
    }

    if (presentation.status !== "queued") {
      return NextResponse.json({ error: "Presentation already processed" }, { status: 409 });
    }

    // Mark as generating
    await db
      .from("video_presentations")
      .update({ status: "generating" })
      .eq("id", presentationId);

    // Fetch project data
    const { data: project } = await db
      .from("projects")
      .select("*")
      .eq("id", presentation.project_id)
      .single();

    if (!project) throw new Error("Project not found");

    // Get features
    const { data: features } = await db
      .from("features")
      .select("name, description")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false })
      .limit(20);

    // Get latest scan result for tech_stack and languages
    const { data: latestScan } = await db
      .from("scan_jobs")
      .select("result")
      .eq("project_id", project.id)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(1)
      .single();

    const scanResult = latestScan?.result as Record<string, unknown> | null;
    const techStack = (scanResult?.tech_stack as string[]) ?? [];
    const languages = (scanResult?.languages as Record<string, number>) ?? {};

    // Generate prompts via GPT-4o
    const style = presentation.style as "slideshow" | "pitch" | "code-tour";
    const segmentPrompts = await generateSegmentPrompts(
      project.name,
      techStack,
      languages,
      features ?? [],
      style,
    );

    // Store prompts in segments
    const segments: { order: number; title: string; prompt: string; video_url: string | null }[] = segmentPrompts.map((sp) => ({
      order: sp.order,
      title: sp.title,
      prompt: sp.prompt,
      video_url: null as string | null,
    }));

    await db
      .from("video_presentations")
      .update({ segments, pending_segments: segments.length })
      .eq("id", presentationId);

    // Fire parallel per-segment workers (each runs in its own 300s serverless call)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const workerSecret = process.env.SCAN_WORKER_SECRET;

    for (let i = 0; i < segments.length; i++) {
      const storagePath = `${presentation.user_id}/${project.id}/${presentationId}/segment-${i}.mp4`;

      fetch(`${appUrl}/api/video/generate-segment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          presentationId,
          segmentIndex: i,
          prompt: segments[i].prompt,
          storagePath,
          secret: workerSecret,
        }),
      }).catch((err) => {
        console.error(`Failed to dispatch segment ${i}:`, err);
      });
    }

    return NextResponse.json({ success: true, status: "dispatched" });
  } catch (err) {
    console.error("Video generation failed:", err);

    // Try to mark as failed
    try {
      const body = await request.clone().json();
      if (body.presentationId) {
        const db = createAdminClient();
        await db
          .from("video_presentations")
          .update({
            status: "failed",
            error: err instanceof Error ? err.message : "Unknown error",
            completed_at: new Date().toISOString(),
          })
          .eq("id", body.presentationId);
      }
    } catch {
      // Best effort
    }

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Video generation failed" },
      { status: 500 },
    );
  }
}
