import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A bordered content panel — the standard surface from STYLEGUIDE §4. */
export function Card({
  children,
  className,
  as: Tag = "div",
  ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article" | "li";
  ariaLabel?: string;
}) {
  return (
    <Tag
      aria-label={ariaLabel}
      className={cn(
        "rounded-lg border border-slate-200 bg-white p-4 " +
          "dark:border-slate-800 dark:bg-slate-900",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/** A small uppercase section label. */
export function CardLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
      {children}
    </h2>
  );
}
