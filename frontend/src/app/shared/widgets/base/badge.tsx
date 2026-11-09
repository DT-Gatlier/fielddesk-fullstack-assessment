import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/app/shared/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-emerald-100 text-emerald-800",
        emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
        blue: "border-sky-200 bg-sky-50 text-sky-700",
        purple: "border-purple-200 bg-purple-50 text-purple-700",
        amber: "border-amber-200 bg-amber-50 text-amber-700",
        secondary: "border-transparent bg-slate-100 text-slate-900",
        destructive: "border-rose-200 bg-rose-50 text-rose-700",
        outline: "border-slate-300 text-slate-700",
        slate: "border-slate-200 bg-slate-100 text-slate-700",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }

