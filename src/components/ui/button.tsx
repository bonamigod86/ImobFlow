import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-1 focus-visible:ring-offset-white disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-emerald-600 text-white border border-transparent shadow-sm hover:border-emerald-600 hover:bg-white hover:text-emerald-700",
        secondary: "bg-emerald-600 text-white border border-transparent hover:border-emerald-600 hover:bg-white hover:text-emerald-700",
        outline: "bg-emerald-600 text-white border border-transparent hover:border-emerald-600 hover:bg-white hover:text-emerald-700",
        ghost: "bg-emerald-600 text-white border border-transparent hover:border-emerald-600 hover:bg-white hover:text-emerald-700",
        destructive: "bg-red-600 text-white hover:bg-red-700",
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