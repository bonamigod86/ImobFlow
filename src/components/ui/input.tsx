import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex h-9 w-full rounded-md border border-ink-700 bg-ink-950/60 px-3 py-1 text-sm text-ink-100 shadow-sm transition-colors",
        "placeholder:text-ink-500 focus-visible:border-brand-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500/60",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };