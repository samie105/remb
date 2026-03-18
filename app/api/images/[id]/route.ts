import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * GET /api/images/[id]
 * Serve a memory image. Authenticated users can only access their own images.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const db = createAdminClient();

  // Look up the image record and verify ownership
  const { data: image } = await db
    .from("memory_images")
    .select("storage_path, mime_type, filename, user_id")
    .eq("id", id)
    .single();

  if (!image || image.user_id !== session.dbUser.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Download from storage
  const { data: fileData, error } = await db.storage
    .from("memory-images")
    .download(image.storage_path);

  if (error || !fileData) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const buffer = Buffer.from(await fileData.arrayBuffer());

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": image.mime_type,
      "Content-Disposition": `inline; filename="${image.filename}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
