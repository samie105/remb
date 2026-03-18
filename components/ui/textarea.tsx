import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-border/60 bg-background focus-visible:border-foreground/20 focus-visible:ring-foreground/5 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 resize-none rounded-lg border px-3 py-2.5 text-[13px] transition-all duration-200 focus-visible:ring-2 aria-invalid:ring-2 placeholder:text-muted-foreground/60 flex field-sizing-content min-h-20 w-full outline-none disabled:cursor-not-allowed disabled:opacity-40 shadow-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
