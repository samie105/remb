import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { TwoFactorClient } from "./_components/two-factor-client";

export const metadata = {
  title: "Two-Factor Authentication — Remb",
  description: "Verify your identity to continue signing in.",
};

export default async function TwoFactorPage() {
  const cookieStore = await cookies();
  const pending = cookieStore.get("2fa_pending_user")?.value;

  // No pending 2FA session — redirect away
  if (!pending) redirect("/auth");

  return <TwoFactorClient />;
}
