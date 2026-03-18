"use client"

import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer data-[state=checked]:bg-foreground data-[state=unchecked]:bg-input focus-visible:ring-ring/20 focus-visible:ring-2 inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent shadow-inner transition-all outline-none disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "data-[state=checked]:translate-x-[18px] data-[state=unchecked]:translate-x-0.5 pointer-events-none block size-3.5 rounded-full bg-background shadow-sm ring-0 transition-transform duration-200"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
