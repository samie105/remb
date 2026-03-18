"use client";

export function TokenIndicator({
  used,
  budget,
}: {
  used: number;
  budget: number;
}) {
  const pct = Math.min((used / budget) * 100, 100);
  return (
    <div className="flex items-center gap-2 min-w-30">
      <div className="flex-1 h-1 rounded-full bg-border/60 overflow-hidden">
        <div
          className="h-full rounded-full bg-foreground/25 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] tabular-nums text-muted-foreground/60 whitespace-nowrap">
        {used.toLocaleString()}/{budget.toLocaleString()}
      </span>
    </div>
  );
}
