import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getProjects, getFeatures } from "@/lib/project-actions";
import { ProjectOverview } from "@/components/dashboard/project-overview";
import { ProjectOverviewSkeleton } from "@/components/dashboard/skeletons/project-skeleton";

async function ProjectData({ slug }: { slug: string }) {
  const projects = await getProjects();
  const project = projects.find((p) => p.slug === slug);

  if (!project) notFound();

  const features = await getFeatures(project.id);

  return <ProjectOverview project={project} features={features} />;
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <Suspense fallback={<ProjectOverviewSkeleton />}>
      <ProjectData slug={slug} />
    </Suspense>
  );
}
