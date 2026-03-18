import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AuthClient } from "./_components/auth-client";

export const metadata = {
  title: "Sign in — Remb",
  description: "Sign in to Remb with your GitHub account.",
};

export default async function AuthPage() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  return <AuthClient />;
}
