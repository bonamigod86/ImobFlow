import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.7rem] font-medium leading-normal transition-colors",
  {
    variants: {
      variant: {
        default: "border-brand-500/30 bg-brand-500/15 text-brand-300",
        secondary: "border-ink-700 bg-ink-700/60 text-ink-200",
        outline: "border-ink-700 bg-transparent text-ink-300",
        success: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
        warning: "border-amber-500/30 bg-amber-500/15 text-amber-300",
        danger: "border-red-500/30 bg-red-500/15 text-red-300",
        info: "border-sky-500/30 bg-sky-500/15 text-sky-300",
        neutral: "border-violet-500/30 bg-violet-500/15 text-violet-300",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };