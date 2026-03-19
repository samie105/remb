import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getInternalApiUrl } from "@/lib/utils";
import { extractFeaturesFromFile, generateEmbedding } from "@/lib/openai";
import type { ScanLogEntry, ScanResult } from "@/lib/scan-actions";
import type { Json } from "@/lib/supabase/types";

export const maxDuration = 300;

/**
 * POST /api/scan/run-local
 *
 * Processes a batch of locally-uploaded files through the AI feature extraction
 * pipeline. Same extraction quality as GitHub scans, but files come from the CLI.
 *
 * Body: { scanJobId, projectId, files, batch, totalBatches }
 */
export async function POST(request: NextRequest) {
  const secret = process.env.SCAN_WORKER_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    scanJobId: string;
    projectId: string;
    files: Array<{ path: string; content: string; sha?: string }>;
    batch: number;
    totalBatches: number;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { scanJobId, projectId, files, batch, totalBatches } = body;
  if (!scanJobId || !projectId || !files) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const db = createAdminClient();

  // Verify scan job
  const { data: job } = await db
    .from("scan_jobs")
    .select("id, status, result")
    .eq("id", scanJobId)
    .single();

  if (!job || job.status === "failed") {
    return NextResponse.json({ error: "Scan job not found or cancelled" }, { status: 409 });
  }

  const prevResult = (job.result ?? {}) as Record<string, unknown>;
  const logs = (prevResult.logs as ScanLogEntry[]) ?? [];
  const languages: Record<string, number> = (prevResult.languages as Record<string, number>) ?? {};
  const techStackSet = new Set<string>((prevResult.tech_stack as string[]) ?? []);
  let filesTotal = (prevResult.files_total as number) ?? 0;
  let filesProcessed = (prevResult.files_scanned as number) ?? 0;
  let featuresCreated = (prevResult.features_created as number) ?? 0;
  let entriesCreated = (prevResult.entries_created as number) ?? 0;
  let errors = (prevResult.errors as number) ?? 0;
  const featureIds = new Set<string>((prevResult.feature_ids as string[]) ?? []);

  filesTotal += files.length;

  function trackFile(filePath: string) {
    const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
    const langMap: Record<string, string> = {
      ts: "TypeScript", tsx: "TypeScript", js: "JavaScript", jsx: "JavaScript",
      py: "Python", go: "Go", rs: "Rust", rb: "Ruby", java: "Java",
      kt: "Kotlin", swift: "Swift", vue: "Vue", svelte: "Svelte",
      css: "CSS", scss: "SCSS", sql: "SQL",
    };
    const lang = langMap[ext];
    if (lang) languages[lang] = (languages[lang] ?? 0) + 1;

    if (filePath.includes("next.config")) techStackSet.add("Next.js");
    if (filePath.includes("tailwind")) techStackSet.add("Tailwind CSS");
    if (filePath.includes("prisma")) techStackSet.add("Prisma");
    if (filePath.includes("supabase")) techStackSet.add("Supabase");
    if (filePath.endsWith("package.json")) techStackSet.add("Node.js");
    if (filePath.endsWith("go.mod")) techStackSet.add("Go");
  }

  logs.push({
    timestamp: new Date().toISOString(),
    file: "",
    status: "scanning",
    message: `Processing batch ${batch}/${totalBatches} (${files.length} files)`,
  });

  const scanStart = Date.now();

  for (const file of files) {
    trackFile(file.path);

    // Check cancellation
    const { data: check } = await db
      .from("scan_jobs")
      .select("status")
      .eq("id", scanJobId)
      .single();
    if (check?.status === "failed") break;

    try {
      const extracted = await extractFeaturesFromFile(file.content, file.path);
      filesProcessed++;

      if (!extracted) {
        logs.push({
          timestamp: new Date().toISOString(),
          file: file.path,
          status: "skipped",
          message: "No features extracted",
        });
        continue;
      }

      // Enrich tech stack
      for (const dep of extracted.dependencies) {
        const d = dep.toLowerCase();
        if (d.includes("react")) techStackSet.add("React");
        if (d.includes("next")) techStackSet.add("Next.js");
        if (d.includes("tailwind")) techStackSet.add("Tailwind CSS");
        if (d.includes("supabase")) techStackSet.add("Supabase");
        if (d.includes("openai")) techStackSet.add("OpenAI");
      }

      // Upsert feature
      const { data: existingFeature } = await db
        .from("features")
        .select("id")
        .eq("project_id", projectId)
        .ilike("name", extracted.feature_name)
        .limit(1)
        .single();

      let featureId: string;
      if (existingFeature) {
        featureId = existingFeature.id;
      } else {
        const { data: newFeature, error: featureError } = await db
          .from("features")
          .insert({
            project_id: projectId,
            name: extracted.feature_name,
            description: extracted.summary,
            status: "active",
          })
          .select("id")
          .single();

        if (featureError || !newFeature) {
          errors++;
          continue;
        }
        featureId = newFeature.id;
        featuresCreated++;
      }

      featureIds.add(featureId);

      // Build context content
      const contextContent = [
        `File: ${file.path}`,
        `Feature: ${extracted.feature_name}`,
        `Summary: ${extracted.summary}`,
        `Category: ${extracted.category}`,
        extracted.dependencies.length > 0 ? `Dependencies: ${extracted.dependencies.join(", ")}` : null,
        extracted.gotchas ? `Gotchas: ${extracted.gotchas}` : null,
      ].filter(Boolean).join("\n");

      const embedding = await generateEmbedding(contextContent);

      const { error: entryError } = await db.from("context_entries").insert({
        feature_id: featureId,
        content: contextContent,
        entry_type: "scan",
        source: "worker",
        metadata: {
          file_path: file.path,
          file_sha: file.sha ?? null,
          feature_name: extracted.feature_name,
          category: extracted.category,
          importance: extracted.importance,
          tags: extracted.tags,
          dependencies: extracted.dependencies,
          scan_job_id: scanJobId,
          scan_type: "local",
        },
        ...(embedding ? { embedding: `[${embedding.join(",")}]` } : {}),
      });

      if (!entryError) entriesCreated++;

      logs.push({
        timestamp: new Date().toISOString(),
        file: file.path,
        status: "done",
        feature: extracted.feature_name,
        message: `Extracted: ${extracted.feature_name}`,
      });
    } catch (err) {
      errors++;
      logs.push({
        timestamp: new Date().toISOString(),
        file: file.path,
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }

    // Flush progress every 3 files
    if (filesProcessed % 3 === 0) {
      await db
        .from("scan_jobs")
        .update({
          result: {
            scan_type: "local",
            files_total: filesTotal,
            files_scanned: filesProcessed,
            features_created: featuresCreated,
            entries_created: entriesCreated,
            errors,
            logs: logs.slice(-50),
            tech_stack: [...techStackSet],
            languages,
            feature_ids: [...featureIds],
            duration_ms: Date.now() - scanStart,
          },
        })
        .eq("id", scanJobId);
    }
  }

  // Final update for this batch
  const isFinalBatch = batch >= totalBatches;

  const finalResult: Record<string, Json> = {
    scan_type: "local",
    files_total: filesTotal,
    files_scanned: filesProcessed,
    features_created: featuresCreated,
    entries_created: entriesCreated,
    errors,
    logs: logs.slice(-100),
    tech_stack: [...techStackSet],
    languages,
    feature_ids: [...featureIds],
    duration_ms: Date.now() - scanStart,
  };

  await db
    .from("scan_jobs")
    .update({
      status: isFinalBatch ? "done" : "running",
      ...(isFinalBatch ? { finished_at: new Date().toISOString() } : {}),
      result: finalResult,
    })
    .eq("id", scanJobId);

  if (isFinalBatch) {
    // Update project info
    await db
      .from("projects")
      .update({
        status: "active",
        tech_stack: [...techStackSet],
        last_scanned_at: new Date().toISOString(),
      })
      .eq("id", projectId);

    // Trigger queue processing — free up a slot for the next queued scan
    const appUrl = getInternalApiUrl();
    if (secret) {
      fetch(`${appUrl}/api/scan/process-queue`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
      }).catch(() => {});
    }
  }

  return NextResponse.json({
    ok: true,
    batch,
    filesProcessed,
    featuresCreated,
    done: isFinalBatch,
  });
}
