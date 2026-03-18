import { SettingsNav } from "./_components/settings-nav";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6 pb-16">
      <div>
        <h1 className="text-xl font-semibold tracking-[-0.04em] text-foreground">
          Settings
        </h1>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Manage your account and application preferences.
        </p>
      </div>

      <SettingsNav basePath="/dashboard/settings" />

      <div className="max-w-2xl">{children}</div>
    </div>
  );
}
