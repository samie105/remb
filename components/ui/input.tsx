import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "bg-background border-border/60 focus-visible:border-foreground/20 focus-visible:ring-foreground/5 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 h-9 rounded-lg border px-3 py-1 text-[13px] transition-all duration-200 file:h-7 file:text-[13px] file:font-medium focus-visible:ring-2 aria-invalid:ring-2 file:text-foreground placeholder:text-muted-foreground/60 w-full min-w-0 outline-none file:inline-flex file:border-0 file:bg-transparent disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40 shadow-sm",
        className
      )}
      {...props}
    />
  )
}

export { Input }
