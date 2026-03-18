import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function DashboardHomeSkeleton() {
  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-300">
      {/* Header skeleton */}
      <div>
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-72 mt-2" />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="border-border/40">
            <CardContent className="pt-5">
              <div className="flex items-start justify-between">
                <div>
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-7 w-12 mt-2" />
                  <Skeleton className="h-3 w-24 mt-2" />
                </div>
                <Skeleton className="size-9 rounded-xl" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Timeline + Projects grid */}
      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-5">
        {/* Timeline */}
        <div className="lg:col-span-2">
          <Card className="border-border/40">
            <CardHeader>
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-10 rounded-full" />
              </div>
              <Skeleton className="h-1.5 w-full rounded-full mt-3" />
            </CardHeader>
            <CardContent className="space-y-5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex gap-4">
                  <Skeleton className="size-8 rounded-full shrink-0" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-56 mt-1" />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Projects */}
        <div className="lg:col-span-3">
          <Card className="border-border/40">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-5 w-8 rounded-full" />
              </div>
              <Skeleton className="h-3 w-48 mt-1" />
            </CardHeader>
            <CardContent>
              <div className="rounded-xl border border-border/40 overflow-hidden divide-y divide-border/30">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3">
                    <Skeleton className="size-9 rounded-lg shrink-0" />
                    <div className="flex-1">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-48 mt-1" />
                    </div>
                    <div className="hidden sm:flex items-center gap-4">
                      <Skeleton className="h-8 w-12" />
                      <Skeleton className="h-8 w-12" />
                      <Skeleton className="h-3 w-14" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Recent scans */}
      <Card className="border-border/40">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-5 w-8 rounded-full" />
          </div>
          <Skeleton className="h-3 w-52 mt-1" />
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-border/40 overflow-hidden divide-y divide-border/30">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="size-2.5 rounded-full shrink-0" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-3 w-44 mt-1" />
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

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-border/40 px-4 py-3.5">
            <Skeleton className="size-8 rounded-lg shrink-0" />
            <div>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-32 mt-1" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
