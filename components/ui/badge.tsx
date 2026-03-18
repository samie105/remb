import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "h-[22px] gap-1 rounded-md border border-transparent px-2 py-0.5 text-[11px] font-medium tracking-wide uppercase transition-all duration-200 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&>svg]:size-2.5! inline-flex items-center justify-center w-fit whitespace-nowrap shrink-0 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive overflow-hidden group/badge",
  {
    variants: {
      variant: {
        default: "bg-foreground text-background [a]:hover:bg-foreground/85",
        secondary: "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/70",
        destructive: "bg-destructive/8 text-destructive border-destructive/15 [a]:hover:bg-destructive/15 dark:bg-destructive/15",
        outline: "border-border text-muted-foreground [a]:hover:bg-muted [a]:hover:text-foreground",
        ghost: "text-muted-foreground hover:bg-muted hover:text-foreground dark:hover:bg-muted/50",
        link: "text-foreground underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
