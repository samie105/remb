"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import type { MemoryImageRow, UserRow } from "@/lib/supabase/types";

/* ─── helpers ─── */

async function requireUser(): Promise<UserRow> {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");
  return session.dbUser;
}

const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/* ─── types ─── */

export type ImageUploadResult = {
  image: MemoryImageRow;
  ocrText: string | null;
  description: string | null;
};

export type MemoryImageInfo = {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  ocr_text: string | null;
  description: string | null;
  width: number | null;
  height: number | null;
  url: string;
  created_at: string;
};

/* ─── OCR via OpenAI Vision ─── */

async function extractImageContent(
  base64Data: string,
  mimeType: string
): Promise<{ text: string | null; description: string | null }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { text: null, description: null };

  try {
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey });

    const response = await client.chat.completions.create({
      model: process.env.OPENAI_VISION_MODEL ?? "gpt-4o-mini",
      max_tokens: 2000,
      messages: [
        {
          role: "system",
          content: `You extract text and describe images for a developer context management system.
Return a JSON object with two fields:
- "ocr_text": All readable text in the image, preserving structure. If no text, use null.
- "description": A concise description of the image content (what it shows, UI elements, diagrams, architecture, etc). 2-3 sentences max.
Return ONLY valid JSON.`,
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Data}`,
                detail: "auto",
              },
            },
            {
              type: "text",
              text: "Extract all text and describe this image.",
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return { text: null, description: null };

    const parsed = JSON.parse(content) as {
      ocr_text?: string | null;
      description?: string | null;
    };

    return {
      text: parsed.ocr_text || null,
      description: parsed.description || null,
    };
  } catch (err) {
    console.error("OCR extraction failed:", err);
    return { text: null, description: null };
  }
}

/* ─── Upload image to a memory ─── */

export async function uploadMemoryImage(
  memoryId: string,
  formData: FormData
): Promise<ImageUploadResult> {
  const user = await requireUser();
  const db = createAdminClient();

  // Verify memory ownership
  const { data: memory } = await db
    .from("memories")
    .select("id")
    .eq("id", memoryId)
    .eq("user_id", user.id)
    .single();

  if (!memory) throw new Error("Memory not found");

  const file = formData.get("file") as File | null;
  if (!file) throw new Error("No file provided");
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new Error(`Unsupported file type: ${file.type}`);
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error("File size exceeds 10 MB limit");
  }

  // Read file into buffer
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const base64Data = buffer.toString("base64");

  // Upload to Supabase Storage
  const ext = file.name.split(".").pop() ?? "png";
  const storagePath = `${user.id}/${memoryId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await db.storage
    .from("memory-images")
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

  // Extract text + description via Vision API
  const { text: ocrText, description } = await extractImageContent(
    base64Data,
    file.type
  );

  // Insert metadata record
  const { data: imageRecord, error: insertError } = await db
    .from("memory_images")
    .insert({
      memory_id: memoryId,
      user_id: user.id,
      storage_path: storagePath,
      filename: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      ocr_text: ocrText,
      description,
    })
    .select()
    .single();

  if (insertError) throw new Error(insertError.message);

  // Append OCR text to memory content if extracted
  if (ocrText) {
    const { data: currentMemory } = await db
      .from("memories")
      .select("content, token_count")
      .eq("id", memoryId)
      .single();

    if (currentMemory) {
      const imageContext = `\n\n---\n📷 Image: ${file.name}\n${ocrText}`;
      const newContent = currentMemory.content + imageContext;
      const newTokens = Math.ceil(newContent.length / 4);

      await db
        .from("memories")
        .update({
          content: newContent,
          token_count: newTokens,
        })
        .eq("id", memoryId);
    }
  }

  return {
    image: imageRecord,
    ocrText,
    description,
  };
}

/* ─── Upload from raw bytes (for CLI/MCP) ─── */

export async function uploadMemoryImageFromBuffer(
  userId: string,
  memoryId: string,
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<ImageUploadResult> {
  const db = createAdminClient();

  // Verify memory ownership
  const { data: memory } = await db
    .from("memories")
    .select("id")
    .eq("id", memoryId)
    .eq("user_id", userId)
    .single();

  if (!memory) throw new Error("Memory not found");
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error(`Unsupported file type: ${mimeType}`);
  }
  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error("File size exceeds 10 MB limit");
  }

  const base64Data = buffer.toString("base64");

  // Upload to storage
  const ext = filename.split(".").pop() ?? "png";
  const storagePath = `${userId}/${memoryId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await db.storage
    .from("memory-images")
    .upload(storagePath, buffer, {
      contentType: mimeType,
      upsert: false,
    });

  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

  // OCR
  const { text: ocrText, description } = await extractImageContent(
    base64Data,
    mimeType
  );

  // Insert record
  const { data: imageRecord, error: insertError } = await db
    .from("memory_images")
    .insert({
      memory_id: memoryId,
      user_id: userId,
      storage_path: storagePath,
      filename,
      mime_type: mimeType,
      size_bytes: buffer.length,
      ocr_text: ocrText,
      description,
    })
    .select()
    .single();

  if (insertError) throw new Error(insertError.message);

  // Append OCR text to memory
  if (ocrText) {
    const { data: currentMemory } = await db
      .from("memories")
      .select("content, token_count")
      .eq("id", memoryId)
      .single();

    if (currentMemory) {
      const imageContext = `\n\n---\n📷 Image: ${filename}\n${ocrText}`;
      const newContent = currentMemory.content + imageContext;
      await db
        .from("memories")
        .update({
          content: newContent,
          token_count: Math.ceil(newContent.length / 4),
        })
        .eq("id", memoryId);
    }
  }

  return { image: imageRecord, ocrText, description };
}

/* ─── Get images for a memory ─── */

export async function getMemoryImages(
  memoryId: string
): Promise<MemoryImageInfo[]> {
  const user = await requireUser();
  const db = createAdminClient();

  const { data: images, error } = await db
    .from("memory_images")
    .select("*")
    .eq("memory_id", memoryId)
    .eq("user_id", user.id)
    .order("created_at");

  if (error) throw new Error(error.message);

  return (images ?? []).map((img) => ({
    id: img.id,
    filename: img.filename,
    mime_type: img.mime_type,
    size_bytes: img.size_bytes,
    ocr_text: img.ocr_text,
    description: img.description,
    width: img.width,
    height: img.height,
    url: `/api/images/${img.id}`,
    created_at: img.created_at,
  }));
}

/* ─── Get images for a memory (admin/system context — no auth check) ─── */

export async function getMemoryImagesForUser(
  userId: string,
  memoryId: string
): Promise<MemoryImageInfo[]> {
  const db = createAdminClient();

  const { data: images, error } = await db
    .from("memory_images")
    .select("*")
    .eq("memory_id", memoryId)
    .eq("user_id", userId)
    .order("created_at");

  if (error) throw new Error(error.message);

  return (images ?? []).map((img) => ({
    id: img.id,
    filename: img.filename,
    mime_type: img.mime_type,
    size_bytes: img.size_bytes,
    ocr_text: img.ocr_text,
    description: img.description,
    width: img.width,
    height: img.height,
    url: `/api/images/${img.id}`,
    created_at: img.created_at,
  }));
}

/* ─── Delete an image ─── */

export async function deleteMemoryImage(imageId: string): Promise<void> {
  const user = await requireUser();
  const db = createAdminClient();

  const { data: image } = await db
    .from("memory_images")
    .select("storage_path")
    .eq("id", imageId)
    .eq("user_id", user.id)
    .single();

  if (!image) throw new Error("Image not found");

  // Delete from storage
  await db.storage.from("memory-images").remove([image.storage_path]);

  // Delete record
  await db
    .from("memory_images")
    .delete()
    .eq("id", imageId)
    .eq("user_id", user.id);
}

/* ─── Re-run OCR on an existing image ─── */

export async function rerunImageOcr(imageId: string): Promise<{
  ocrText: string | null;
  description: string | null;
}> {
  const user = await requireUser();
  const db = createAdminClient();

  const { data: image } = await db
    .from("memory_images")
    .select("storage_path, mime_type")
    .eq("id", imageId)
    .eq("user_id", user.id)
    .single();

  if (!image) throw new Error("Image not found");

  // Download from storage
  const { data: fileData, error: dlError } = await db.storage
    .from("memory-images")
    .download(image.storage_path);

  if (dlError || !fileData) throw new Error("Failed to download image");

  const buffer = Buffer.from(await fileData.arrayBuffer());
  const base64Data = buffer.toString("base64");

  const { text: ocrText, description } = await extractImageContent(
    base64Data,
    image.mime_type
  );

  // Update record
  await db
    .from("memory_images")
    .update({ ocr_text: ocrText, description })
    .eq("id", imageId);

  return { ocrText, description };
}
