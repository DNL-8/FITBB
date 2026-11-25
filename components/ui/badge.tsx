import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-sm border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap transition-colors focus-visible:border-orange-500 focus-visible:ring-2 focus-visible:ring-orange-500/40 [&>svg]:pointer-events-none",
  {
    variants: {
      variant: {
        default: "border-orange-500/40 bg-orange-500/10 text-orange-400",
        secondary:
          "border-[#27272A] bg-[#111113] text-zinc-300",
        destructive:
          "border-red-500/40 bg-red-950/40 text-red-300",
        outline:
          "border-[#27272A] bg-transparent text-zinc-300",
        ghost:
          "border-transparent bg-transparent text-zinc-400 hover:bg-[#18181B]",
        link: "border-transparent text-[#F97316] underline-offset-4 hover:underline",
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
