import { Suspense } from "react";
import { getMemories, getMemoryStats } from "@/lib/memory-actions";
import { getSession } from "@/lib/auth";
import { MemoryClient } from "./_components/memory-client";
import { MemorySkeleton } from "@/components/dashboard/skeletons/page-skeletons";

async function MemoryData() {
  const session = await getSession();
  if (!session) return null;

  const [memories, stats] = await Promise.all([
    getMemories(),
    getMemoryStats(),
  ]);

  return <MemoryClient initialMemories={memories} initialStats={stats} />;
}

export default function MemoryPage() {
  return (
    <Suspense fallback={<MemorySkeleton />}>
      <MemoryData />
    </Suspense>
  );
}
