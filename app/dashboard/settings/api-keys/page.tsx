import { Key01Icon } from "@hugeicons/core-free-icons";
import { ApiKeysSection } from "@/components/dashboard/api-keys-section";
import { SectionHeading } from "../_components/section-heading";

export default function ApiKeysSettingsPage() {
  return (
    <section>
      <SectionHeading
        icon={Key01Icon}
        title="API Keys"
        description="Create and manage keys for CLI and programmatic API access."
      />
      <ApiKeysSection />
    </section>
  );
}
