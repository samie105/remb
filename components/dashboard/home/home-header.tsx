"use client";

import { motion } from "framer-motion";
import { item } from "./shared";

interface HomeHeaderProps {
  userName: string;
}

export function HomeHeader({ userName }: HomeHeaderProps) {
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <motion.div variants={item}>
      <h1 className="text-xl sm:text-2xl font-semibold tracking-[-0.04em] text-foreground">
        {greeting}, {userName}
      </h1>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Here&apos;s what&apos;s happening across your projects.
      </p>
    </motion.div>
  );
}
