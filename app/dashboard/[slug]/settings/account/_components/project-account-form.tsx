"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Building01Icon,
  Globe02Icon,
  Delete02Icon,
  FloppyDiskIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SectionHeading } from "../../../../settings/_components/section-heading";
import { updateProject, deleteProject } from "@/lib/project-actions";
import type { ProjectRow } from "@/lib/supabase/types";

export function ProjectAccountForm({ project }: { project: ProjectRow }) {
  const router = useRouter();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(project.website_url ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateProject(project.id, {
        name: name.trim() || undefined,
        description: description.trim() !== "" ? description.trim() : null,
        website_url: websiteUrl.trim() !== "" ? websiteUrl.trim() : null,
      });
      // Navigate to new slug if name changed
      if (updated.slug !== project.slug) {
        router.replace(`/dashboard/${updated.slug}/settings/account`);
      } else {
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const { remainingSlug } = await deleteProject(project.id);
      try { localStorage.removeItem("remb:active-project"); } catch { /* noop */ }
      router.push(remainingSlug ? `/dashboard/${remainingSlug}` : "/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete project");
      setDeleting(false);
      setShowDeleteDialog(false);
    }
  }

  const isDirty =
    name !== project.name ||
    description !== (project.description ?? "") ||
    websiteUrl !== (project.website_url ?? "");

  return (
    <section>
      <SectionHeading
        icon={Building01Icon}
        title="Project"
        description="Manage your project's name, description, and website."
      />

      <div className="space-y-5">
        {/* Name */}
        <div className="space-y-1.5">
          <Label className="text-[12px] font-medium">Project name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-project"
            className="text-[13px]"
          />
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <Label className="text-[12px] font-medium">Description</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this project do?"
            rows={3}
            className="text-[13px] resize-none"
          />
        </div>

        {/* Website URL */}
        <div className="space-y-1.5">
          <Label className="text-[12px] font-medium flex items-center gap-1.5">
            <HugeiconsIcon icon={Globe02Icon} strokeWidth={2} className="size-3.5 text-muted-foreground" />
            Website URL
          </Label>
          <Input
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://yourproject.com"
            type="url"
            className="text-[13px]"
          />
          <p className="text-[11px] text-muted-foreground">
            Used to fetch your project&apos;s favicon, like Vercel does.
          </p>
        </div>

        {error && (
          <p className="text-[12px] text-destructive">{error}</p>
        )}

        <div className="flex items-center justify-between pt-1">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!isDirty || saving || !name.trim()}
            className="gap-2"
          >
            <HugeiconsIcon icon={FloppyDiskIcon} strokeWidth={2} className="size-3.5" />
            {saving ? "Saving…" : "Save changes"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDeleteDialog(true)}
            disabled={deleting}
            className="text-destructive hover:text-destructive gap-2"
          >
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} className="size-3.5" />
            {deleting ? "Deleting…" : "Delete project"}
          </Button>
        </div>
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={(open) => !open && setShowDeleteDialog(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {project.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this project and all its data including features, context entries, memories, and scan history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete Project"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
