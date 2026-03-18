import { Notification02Icon } from "@hugeicons/core-free-icons";
import { NotificationSettings } from "@/components/dashboard/notification-settings";
import { SectionHeading } from "../_components/section-heading";

export default function NotificationsSettingsPage() {
  return (
    <section>
      <SectionHeading
        icon={Notification02Icon}
        title="Notifications"
        description="Control how and when you receive push notifications."
      />
      <NotificationSettings />
    </section>
  );
}
