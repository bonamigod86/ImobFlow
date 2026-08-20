import * as React from "react";
import { cn } from "@/lib/utils";

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Completion 0..100 (clamped for rendering). */
  value: number;
  /** Tailwind class overriding the fill color, e.g. `bg-amber-400`. */
  indicatorClassName?: string;
}

/**
 * Lightweight bounded progress bar (shadcn API surface) styled for the dark
 * dashboard theme. Exposes the value through ARIA for screen readers.
 */
const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, indicatorClassName, value, ...props }, ref) => {
    const clamped = Math.min(100, Math.max(0, value));
    return (
      <div
        ref={ref}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped)}
        aria-label={props["aria-label"] ?? undefined}
        className={cn(
          "h-2 w-full overflow-hidden rounded-full bg-ink-700",
          className,
        )}
        {...props}
      >
        <div
          className={cn("h-full rounded-full bg-brand-500 transition-[width] duration-300", indicatorClassName)}
          style={{ width: `${clamped}%` }}
        />
      </div>
    );
  },
);
Progress.displayName = "Progress";

export { Progress };