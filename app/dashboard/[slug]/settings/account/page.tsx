import { notFound } from "next/navigation";
import { getProject } from "@/lib/project-actions";
import { ProjectAccountForm } from "./_components/project-account-form";

export default async function ProjectAccountPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = await getProject(slug);
  if (!project) notFound();

  return <ProjectAccountForm project={project} />;
}

