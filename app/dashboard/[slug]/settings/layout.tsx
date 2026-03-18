import { notFound } from "next/navigation";
import { getProject } from "@/lib/project-actions";
import { SettingsNav } from "../../settings/_components/settings-nav";

export default async function ProjectSettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = await getProject(slug);
  if (!project) notFound();

  return (
    <div className="flex flex-col gap-6 pb-16">
      <div>
        <h1 className="text-xl font-semibold tracking-[-0.04em] text-foreground">
          Settings
        </h1>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Manage settings for{" "}
          <span className="font-medium text-foreground">{project.name}</span>.
        </p>
      </div>

      <SettingsNav basePath={`/dashboard/${slug}/settings`} />

      <div className="max-w-2xl">{children}</div>
    </div>
  );
}
