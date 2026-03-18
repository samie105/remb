import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getProjects } from "@/lib/project-actions";
import { getScanJob } from "@/lib/scan-actions";
import { ScanDetail } from "@/components/dashboard/scan-detail";
import { ScanDetailSkeleton } from "@/components/dashboard/skeletons/page-skeletons";

async function ScanData({ slug, scanId }: { slug: string; scanId: string }) {
  const projects = await getProjects();
  const project = projects.find((p) => p.slug === slug);

  if (!project) notFound();

  const job = await getScanJob(scanId);
  if (!job) notFound();

  return <ScanDetail scanJobId={scanId} projectSlug={slug} />;
}

export default async function ScanPage({
  params,
}: {
  params: Promise<{ slug: string; scanId: string }>;
}) {
  const { slug, scanId } = await params;

  return (
    <Suspense fallback={<ScanDetailSkeleton />}>
      <ScanData slug={slug} scanId={scanId} />
    </Suspense>
  );
}
