import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-[6px] border text-sm font-medium tracking-[0.01em] whitespace-nowrap transition-colors outline-none focus-visible:border-[color:var(--accent-strong)] focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_oklab,var(--accent)_24%,transparent)] disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "border-[color:var(--accent-strong)] bg-[color:var(--accent)] text-[color:var(--accent-foreground)] hover:bg-[color:color-mix(in_oklab,var(--accent)_88%,black)]",
        outline:
          "border-border bg-transparent text-foreground hover:border-[color:var(--accent-strong)] hover:bg-accent-soft",
        secondary:
          "border-border bg-[color:var(--surface-raised)] text-foreground hover:bg-accent-soft",
        ghost:
          "border-transparent bg-transparent text-foreground hover:bg-accent-soft",
        destructive:
          "border-border bg-transparent text-muted-foreground hover:border-[color:var(--danger)] hover:bg-[color:color-mix(in_oklab,var(--danger)_12%,transparent)] hover:text-foreground",
        link: "border-transparent p-0 text-[color:var(--accent-strong)] hover:text-foreground",
      },
      size: {
        default: "h-9 px-3.5",
        xs: "h-7 px-2.5 text-[11px]",
        sm: "h-8 px-3 text-[12px]",
        lg: "h-10 px-4",
        icon: "size-9",
        "icon-xs": "size-7",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
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
  variant,
  size,
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
      className={cn(buttonVariants({ className, size, variant }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
