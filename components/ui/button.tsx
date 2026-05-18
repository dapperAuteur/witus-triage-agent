import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "danger";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-violet-600 text-white hover:bg-violet-500 disabled:bg-violet-600/50",
  secondary:
    "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 " +
    "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800",
  danger:
    "border border-red-300 bg-white text-red-700 hover:bg-red-50 " +
    "dark:border-red-500/40 dark:bg-slate-900 dark:text-red-300 dark:hover:bg-red-500/10",
};

/**
 * Button. Tap target is >= 44px tall (STYLEGUIDE §2, mobile-first), with a
 * visible violet focus ring on every variant.
 */
export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn(
        "inline-flex min-h-11 items-center justify-center rounded-md px-4 " +
          "text-sm font-medium transition-colors disabled:cursor-not-allowed " +
          "focus-visible:outline-2 focus-visible:outline-offset-2 " +
          "focus-visible:outline-violet-500",
        VARIANT_CLASSES[variant],
        className,
      )}
      {...props}
    />
  );
}
