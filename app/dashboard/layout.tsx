import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getProjects } from "@/lib/project-actions";
import { DashboardShell } from "@/components/dashboard/shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect("/auth");
  }

  const projects = await getProjects();

  return (
    <DashboardShell
      user={{
        name: session.dbUser.name ?? session.user.login,
        login: session.user.login,
        avatarUrl: session.user.avatar_url,
        email: session.dbUser.email ?? undefined,
        plan: session.dbUser.plan,
      }}
      initialProjects={projects}
    >
      {children}
    </DashboardShell>
  );
}
