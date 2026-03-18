import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "focus-visible:border-ring focus-visible:ring-ring/20 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 rounded-lg border border-transparent text-[13px] font-medium tracking-[-0.01em] focus-visible:ring-2 aria-invalid:ring-2 [&_svg:not([class*='size-'])]:size-4 inline-flex items-center justify-center whitespace-nowrap transition-all duration-200 ease-out disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none shrink-0 [&_svg]:shrink-0 outline-none group/button select-none cursor-pointer active:scale-[0.97]",
  {
    variants: {
      variant: {
        default:
          "bg-foreground text-background shadow-sm hover:bg-foreground/85 active:bg-foreground/75",
        outline:
          "border-border bg-background hover:bg-muted/60 hover:text-foreground shadow-sm",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/70 shadow-sm",
        ghost:
          "hover:bg-muted/70 hover:text-foreground",
        destructive:
          "bg-destructive/10 hover:bg-destructive/15 text-destructive border-destructive/20 dark:bg-destructive/15 dark:hover:bg-destructive/25",
        link: "text-foreground underline-offset-4 hover:underline hover:text-foreground/80",
      },
      size: {
        default:
          "h-8 gap-1.5 px-3 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 [&_svg:not([class*='size-'])]:size-3.5",
        xs: "h-6 gap-1 rounded-md px-2 text-[11px] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-md px-2.5 text-xs has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-2 px-4 text-sm has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3 [&_svg:not([class*='size-'])]:size-4",
        icon: "size-8 relative after:absolute after:inset-[-6px] after:content-[''] [&_svg:not([class*='size-'])]:size-4",
        "icon-xs": "size-6 rounded-md relative after:absolute after:inset-[-9px] after:content-[''] [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7 rounded-md relative after:absolute after:inset-[-8px] after:content-[''] [&_svg:not([class*='size-'])]:size-3.5",
        "icon-lg": "size-9 relative after:absolute after:inset-[-4px] after:content-[''] [&_svg:not([class*='size-'])]:size-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
