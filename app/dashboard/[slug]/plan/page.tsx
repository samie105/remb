import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getProjects } from "@/lib/project-actions";
import { getPlans } from "@/lib/plan-actions";
import { PlanMain } from "@/components/dashboard/plan/plan-main";

async function PlanData({ slug }: { slug: string }) {
  const projects = await getProjects();
  const project = projects.find((p) => p.slug === slug);

  if (!project) notFound();

  const plans = await getPlans(project.id);

  return <PlanMain project={project} initialPlans={plans} />;
}

export default async function PlanPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <Suspense
      fallback={
        <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center">
          <div className="animate-pulse text-muted-foreground">Loading plans...</div>
        </div>
      }
    >
      <PlanData slug={slug} />
    </Suspense>
  );
}
