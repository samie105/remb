import { Suspense } from "react";
import { getSession } from "@/lib/auth";
import { getProjects } from "@/lib/project-actions";
import { getAllScanJobs } from "@/lib/scan-actions";
import { DashboardContent } from "@/components/dashboard/dashboard-content";
import { DashboardHomeSkeleton } from "@/components/dashboard/skeletons/dashboard-home-skeleton";

async function DashboardData() {
  const session = (await getSession())!;
  const [projects, recentScans] = await Promise.all([
    getProjects(),
    getAllScanJobs(),
  ]);

  return (
    <DashboardContent
      user={{
        name: session.dbUser.name ?? session.user.login,
        login: session.user.login,
      }}
      projects={projects}
      recentScans={recentScans}
    />
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardHomeSkeleton />}>
      <DashboardData />
    </Suspense>
  );
}
