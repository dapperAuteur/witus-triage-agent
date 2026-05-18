import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Status badge. Tone always pairs a color with a text label — color is never
 * the only signal (STYLEGUIDE §2, accessibility).
 */
export type BadgeTone = "slate" | "amber" | "emerald" | "red" | "violet";

const TONE_CLASSES: Record<BadgeTone, string> = {
  slate:
    "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  amber:
    "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  emerald:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  red: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
  violet:
    "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
};

export function Badge({
  tone = "slate",
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
