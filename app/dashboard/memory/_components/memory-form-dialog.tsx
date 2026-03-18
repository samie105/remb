"use client";

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  InformationCircleIcon,
  Image01Icon,
  Loading03Icon,
  Delete02Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  TIER_CONFIG,
  CATEGORY_CONFIG,
  ALL_TIERS,
  ALL_CATEGORIES,
} from "./memory-constants";
import type { MemoryWithProject, CreateMemoryInput } from "@/lib/memory-actions";
import type { MemoryTier, MemoryCategory } from "@/lib/supabase/types";
import {
  uploadMemoryImage,
  getMemoryImages,
  deleteMemoryImage,
  type MemoryImageInfo,
} from "@/lib/image-actions";
import { toast } from "sonner";

export function MemoryFormDialog({
  open,
  onOpenChange,
  memory,
  onSave,
  isSaving,
  projectName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  memory?: MemoryWithProject;
  onSave: (data: CreateMemoryInput & { id?: string }) => Promise<string | void>;
  isSaving: boolean;
  projectName?: string;
}) {
  const [title, setTitle] = React.useState(memory?.title ?? "");
  const [content, setContent] = React.useState(memory?.content ?? "");
  const [tier, setTier] = React.useState<MemoryTier>(memory?.tier ?? "active");
  const [category, setCategory] = React.useState<MemoryCategory>(
    memory?.category ?? "general",
  );
  const [tagInput, setTagInput] = React.useState("");
  const [tags, setTags] = React.useState<string[]>(memory?.tags ?? []);
  const [images, setImages] = React.useState<MemoryImageInfo[]>([]);
  const [pendingFiles, setPendingFiles] = React.useState<File[]>([]);
  const [isUploading, setIsUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) {
      setTitle(memory?.title ?? "");
      setContent(memory?.content ?? "");
      setTier(memory?.tier ?? "active");
      setCategory(memory?.category ?? "general");
      setTags(memory?.tags ?? []);
      setTagInput("");
      setPendingFiles([]);
      setImages([]);
      // Load existing images if editing
      if (memory?.id) {
        getMemoryImages(memory.id).then(setImages).catch(() => {});
      }
    }
  }, [open, memory]);

  function addTag() {
    const trimmed = tagInput.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setTagInput("");
    }
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const valid = files.filter(
      (f) => f.type.startsWith("image/") && f.size <= 10 * 1024 * 1024
    );
    if (valid.length < files.length) {
      toast.error("Some files were skipped (must be images under 10 MB)");
    }
    setPendingFiles((prev) => [...prev, ...valid]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removePendingFile(index: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleDeleteImage(imageId: string) {
    try {
      await deleteMemoryImage(imageId);
      setImages((prev) => prev.filter((img) => img.id !== imageId));
      toast.success("Image removed");
    } catch {
      toast.error("Failed to remove image");
    }
  }

  const tokenEstimate = Math.ceil(content.length / 4);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{memory ? "Edit Memory" : "Add Memory"}</DialogTitle>
          <DialogDescription>
            {memory
              ? "Update this memory entry."
              : projectName
                ? `Add context the AI should remember for ${projectName}.`
                : "Add general context the AI should remember across all projects."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="memory-title" className="text-[12px]">
              Title
            </Label>
            <Input
              id="memory-title"
              placeholder="e.g., Prefer functional components over classes"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="memory-content" className="text-[12px]">
                Content
              </Label>
              <span className="text-[10px] tabular-nums text-muted-foreground">
                ~{tokenEstimate} tokens
              </span>
            </div>
            <textarea
              id="memory-content"
              rows={4}
              className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-[13px] text-foreground shadow-xs placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/20 resize-y"
              placeholder="Describe the pattern, preference, or knowledge..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[12px]">Tier</Label>
              <Select
                value={tier}
                onValueChange={(v) => setTier(v as MemoryTier)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_TIERS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TIER_CONFIG[t].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">Category</Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as MemoryCategory)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CATEGORY_CONFIG[c].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[12px]">Tags</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Add a tag..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={addTag}
                disabled={!tagInput.trim()}
              >
                Add
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="text-[11px] gap-1 pr-1 cursor-pointer"
                    onClick={() => removeTag(tag)}
                  >
                    {tag}
                    <HugeiconsIcon
                      icon={Cancel01Icon}
                      strokeWidth={2}
                      className="size-2.5"
                    />
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Images */}
          <div className="space-y-1.5">
            <Label className="text-[12px]">Images</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
            {/* Existing images */}
            {images.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {images.map((img) => (
                  <div
                    key={img.id}
                    className="group/img relative size-16 rounded-lg border border-border/40 overflow-hidden bg-muted/30"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.url}
                      alt={img.filename}
                      className="size-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => handleDeleteImage(img.id)}
                      className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover/img:opacity-100 transition-opacity"
                    >
                      <HugeiconsIcon
                        icon={Delete02Icon}
                        className="size-3.5 text-white"
                      />
                    </button>
                    {img.ocr_text && (
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5">
                        <span className="text-[8px] text-white/80">OCR</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {/* Pending files */}
            {pendingFiles.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {pendingFiles.map((file, i) => (
                  <div
                    key={`${file.name}-${i}`}
                    className="group/img relative size-16 rounded-lg border border-dashed border-border/60 overflow-hidden bg-muted/20"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={URL.createObjectURL(file)}
                      alt={file.name}
                      className="size-full object-cover opacity-70"
                    />
                    <button
                      type="button"
                      onClick={() => removePendingFile(i)}
                      className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover/img:opacity-100 transition-opacity"
                    >
                      <HugeiconsIcon
                        icon={Cancel01Icon}
                        className="size-3.5 text-white"
                      />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 rounded-lg border border-dashed border-border/40 px-3 py-2 text-[12px] text-muted-foreground hover:border-border/60 hover:text-foreground transition-colors w-full"
            >
              <HugeiconsIcon icon={Image01Icon} className="size-3.5" />
              Add images (screenshots, diagrams, etc.)
            </button>
            <p className="text-[10px] text-muted-foreground/60">
              Text will be automatically extracted via OCR and added to the memory content.
            </p>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-border/40 bg-muted/30 p-3 text-[11px]">
            <HugeiconsIcon
              icon={InformationCircleIcon}
              strokeWidth={2}
              className="size-3.5 mt-0.5 shrink-0 text-muted-foreground"
            />
            <p className="text-muted-foreground leading-relaxed">
              {TIER_CONFIG[tier].description}
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!title.trim() || !content.trim() || isSaving || isUploading}
              onClick={async () => {
                const memoryId = await onSave({
                  id: memory?.id,
                  title: title.trim(),
                  content: content.trim(),
                  tier,
                  category,
                  tags,
                });
                // Upload pending images
                const targetId = memoryId ?? memory?.id;
                if (pendingFiles.length > 0 && targetId) {
                  setIsUploading(true);
                  try {
                    for (const file of pendingFiles) {
                      const formData = new FormData();
                      formData.append("file", file);
                      await uploadMemoryImage(targetId, formData);
                    }
                    toast.success(
                      `${pendingFiles.length} image${pendingFiles.length > 1 ? "s" : ""} uploaded with OCR`
                    );
                  } catch (err) {
                    toast.error(
                      err instanceof Error
                        ? err.message
                        : "Failed to upload images"
                    );
                  } finally {
                    setIsUploading(false);
                  }
                }
              }}
            >
              {isUploading
                ? "Uploading images..."
                : isSaving
                  ? "Saving..."
                  : memory
                    ? "Update"
                    : "Add Memory"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
