import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getProject } from "@/lib/project-actions";
import { getMemories, getMemoryStats } from "@/lib/memory-actions";
import { MemoryClient } from "../../memory/_components/memory-client";
import { MemorySkeleton } from "@/components/dashboard/skeletons/page-skeletons";

async function ProjectMemoryData({ slug }: { slug: string }) {
  const session = await getSession();
  if (!session) return null;

  const project = await getProject(slug);
  if (!project) notFound();

  const [memories, stats] = await Promise.all([
    getMemories({ projectId: project.id }),
    getMemoryStats({ projectId: project.id }),
  ]);

  return (
    <MemoryClient
      initialMemories={memories}
      initialStats={stats}
      projectId={project.id}
      projectName={project.name}
    />
  );
}

export default async function ProjectMemoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <Suspense fallback={<MemorySkeleton />}>
      <ProjectMemoryData slug={slug} />
    </Suspense>
  );
}
