import { HugeiconsIcon } from "@hugeicons/react";
import { Separator } from "@/components/ui/separator";

export function SectionHeading({
  icon,
  title,
  description,
}: {
  icon: Parameters<typeof HugeiconsIcon>[0]["icon"];
  title: string;
  description: string;
}) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2.5 mb-1">
        <div className="flex size-7 items-center justify-center rounded-lg bg-foreground/5 border border-border/40">
          <HugeiconsIcon
            icon={icon}
            strokeWidth={2}
            className="size-3.5 text-foreground/70"
          />
        </div>
        <h2 className="text-[15px] font-semibold tracking-[-0.025em] text-foreground">
          {title}
        </h2>
      </div>
      <p className="text-[12px] text-muted-foreground pl-9.5 mb-4">
        {description}
      </p>
      <Separator />
    </div>
  );
}
