import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function ProjectOverviewSkeleton() {
  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Skeleton className="size-11 rounded-xl shrink-0" />
        <div>
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-64 mt-1.5" />
          <div className="flex items-center gap-3 mt-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      </div>

      {/* Tabs bar */}
      <div className="flex gap-4 border-b border-border/40 pb-2">
        {["Features", "Scanner", "Configuration", "Danger Zone"].map((t) => (
          <Skeleton key={t} className="h-7 rounded-md" style={{ width: `${t.length * 9}px` }} />
        ))}
      </div>

      {/* Feature stats grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="border-border/40">
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <Skeleton className="size-8 rounded-lg shrink-0" />
              <div>
                <Skeleton className="h-5 w-10" />
                <Skeleton className="h-3 w-16 mt-1" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Feature groups skeleton */}
      <div className="space-y-4">
        {/* Group header */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-20" />
        </div>
        {/* Feature list */}
        <div className="rounded-xl border border-border/40 overflow-hidden divide-y divide-border/30">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="size-2 rounded-full shrink-0" />
              <div className="flex-1">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-64 mt-1" />
              </div>
              <div className="hidden sm:flex items-center gap-3">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-3 w-12" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ScannerSectionSkeleton() {
  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Hero card */}
      <Card className="border-border/40">
        <CardContent className="py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-xl" />
              <div>
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-56 mt-1.5" />
              </div>
            </div>
            <Skeleton className="h-8 w-24 rounded-md" />
          </div>
        </CardContent>
      </Card>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="border-border/40">
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <Skeleton className="size-8 rounded-lg shrink-0" />
              <div>
                <Skeleton className="h-5 w-10" />
                <Skeleton className="h-3 w-16 mt-1" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Scan history */}
      <Card className="border-border/40">
        <CardHeader>
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-7 w-20 rounded-md" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-border/40">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-3.5">
                <Skeleton className="size-2.5 rounded-full shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-5 w-20 rounded-full" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-3 w-36 mt-1" />
                </div>
                <div className="hidden sm:block text-right">
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="h-3 w-16 mt-1" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
