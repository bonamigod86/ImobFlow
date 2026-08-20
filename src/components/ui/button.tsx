import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 focus-visible:ring-offset-1 focus-visible:ring-offset-ink-950 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-brand-500 text-white shadow-sm hover:bg-brand-400",
        secondary: "bg-ink-700 text-ink-100 hover:bg-ink-500/80",
        outline: "border border-ink-700 bg-transparent text-ink-100 hover:bg-ink-900 hover:text-white",
        ghost: "text-ink-300 hover:bg-ink-700/60 hover:text-white",
        destructive: "bg-red-500/90 text-white hover:bg-red-500",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-11 rounded-lg px-6",
        icon: "h-9 w-9",
        "icon-sm": "h-8 w-8 rounded-md",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} type={type} {...props} />
  ),
);
Button.displayName = "Button";

export { Button, buttonVariants };