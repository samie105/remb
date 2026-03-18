import { NextRequest, NextResponse } from "next/server";
import { authenticateCliRequest } from "@/lib/cli-auth";
import { uploadMemoryImageFromBuffer } from "@/lib/image-actions";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * POST /api/cli/memory/image — upload an image to a memory
 * Multipart form: memory_id (string) + file (File)
 *
 * GET /api/cli/memory/image?memory_id=xxx — list images for a memory
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateCliRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;

  const formData = await request.formData();
  const memoryId = formData.get("memory_id");
  const file = formData.get("file");

  if (!memoryId || typeof memoryId !== "string") {
    return NextResponse.json(
      { error: "memory_id is required" },
      { status: 400 }
    );
  }

  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "file is required" },
      { status: 400 }
    );
  }

  // Verify the memory belongs to this user
  const db = createAdminClient();
  const { data: memory } = await db
    .from("memories")
    .select("id")
    .eq("id", memoryId)
    .eq("user_id", user.id)
    .single();

  if (!memory) {
    return NextResponse.json(
      { error: "Memory not found" },
      { status: 404 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await uploadMemoryImageFromBuffer(
    user.id,
    memoryId,
    buffer,
    file.name,
    file.type
  );

  return NextResponse.json(result);
}

export async function GET(request: NextRequest) {
  const auth = await authenticateCliRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;

  const memoryId = request.nextUrl.searchParams.get("memory_id");
  if (!memoryId) {
    return NextResponse.json(
      { error: "memory_id query param is required" },
      { status: 400 }
    );
  }

  const db = createAdminClient();
  const { data: images, error } = await db
    .from("memory_images")
    .select("id, filename, mime_type, size_bytes, ocr_text, description, width, height, created_at")
    .eq("memory_id", memoryId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    images: (images ?? []).map((img) => ({
      ...img,
      url: `/api/images/${img.id}`,
    })),
  });
}
