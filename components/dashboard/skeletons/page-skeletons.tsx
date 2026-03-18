import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export function MemorySkeleton() {
  return (
    <div className="flex flex-col gap-6 sm:gap-8 pb-16 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-64 mt-1.5" />
        </div>
        <Skeleton className="h-7 w-28 rounded-md" />
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-6 flex-wrap">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="size-7 rounded-lg" />
            <div>
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-2 w-20 mt-1 rounded-full" />
            </div>
          </div>
        ))}
        <Skeleton className="h-3 w-24 ml-auto" />
      </div>

      <Separator />

      {/* Filters row */}
      <div className="flex items-center gap-2 flex-wrap">
        <Skeleton className="h-8 w-64 rounded-md" />
        <Skeleton className="h-8 w-56 rounded-md" />
        <Skeleton className="h-8 w-32 rounded-md" />
      </div>

      {/* Tier sections */}
      <div className="space-y-6">
        {["Core", "Active", "Archive"].map((tier) => (
          <div key={tier} className="space-y-3">
            <div className="flex items-center gap-2">
              <Skeleton className="size-7 rounded-lg" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-5 w-6 rounded-full" />
            </div>
            <Separator />
            <div className="rounded-xl border border-border/40 overflow-hidden divide-y divide-border/30">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-72 mt-1" />
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-3 w-14" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function McpHubSkeleton() {
  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-80 mt-1.5" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-24 rounded-md" />
          <Skeleton className="h-8 w-36 rounded-md" />
        </div>
      </div>

      {/* Endpoint card */}
      <div className="rounded-xl border border-border/40 p-4">
        <Skeleton className="h-3 w-28 mb-2" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 flex-1 rounded-md" />
          <Skeleton className="size-8 rounded-md" />
          <Skeleton className="h-8 w-28 rounded-md" />
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border/40 px-4 py-3">
            <Skeleton className="h-7 w-8" />
            <Skeleton className="h-3 w-24 mt-1" />
          </div>
        ))}
      </div>

      {/* Servers section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-7 w-24 rounded-md" />
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border/40 px-4 py-3.5">
              <div className="flex items-center gap-3">
                <Skeleton className="size-2.5 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-40 mt-1" />
                </div>
                <Skeleton className="h-5 w-10 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ScanDetailSkeleton() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Back button */}
      <Skeleton className="h-8 w-16 rounded-md -ml-2" />

      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <Skeleton className="h-4 w-48 mt-1.5" />
        </div>
        <Skeleton className="h-4 w-20" />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="border-border/40">
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              <Skeleton className="size-8 rounded-lg" />
              <div>
                <Skeleton className="h-5 w-10" />
                <Skeleton className="h-3 w-20 mt-1" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Detected Stack card */}
      <Card className="border-border/40">
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-24 rounded-full" />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-border/40 pb-2">
        <Skeleton className="h-7 w-24 rounded-md" />
        <Skeleton className="h-7 w-20 rounded-md" />
      </div>

      {/* Feature list */}
      <div className="space-y-5">
        {Array.from({ length: 2 }).map((_, g) => (
          <div key={g} className="space-y-3">
            <div className="flex items-center gap-2">
              <Skeleton className="size-7 rounded-lg" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-5 w-6 rounded-full" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="border-border/40">
                  <CardContent className="py-3.5">
                    <div className="flex items-start gap-3">
                      <Skeleton className="size-8 rounded-lg shrink-0" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-4 w-10 rounded-full" />
                        </div>
                        <Skeleton className="h-3 w-full mt-1.5" />
                        <Skeleton className="h-3 w-3/4 mt-0.5" />
                        <div className="flex gap-1 mt-2">
                          <Skeleton className="h-5 w-20 rounded" />
                          <Skeleton className="h-5 w-16 rounded" />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
