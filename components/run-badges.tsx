import { Badge, type BadgeTone } from "@/components/ui/badge";

/** Title-case a snake_case domain value: "pending_approval" -> "Pending approval". */
function humanize(value: string): string {
  const spaced = value.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const RUN_STATUS_TONE: Record<string, BadgeTone> = {
  running: "slate",
  pending_approval: "amber",
  approved: "violet",
  executed: "emerald",
  rejected: "slate",
  failed: "red",
};

export function RunStatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={RUN_STATUS_TONE[status] ?? "slate"}>{humanize(status)}</Badge>
  );
}

const CATEGORY_TONE: Record<string, BadgeTone> = {
  support_question: "slate",
  bug_report: "red",
  feature_request: "emerald",
  billing_issue: "amber",
  abuse: "red",
  spam: "slate",
  other: "slate",
};

export function CategoryBadge({ category }: { category: string }) {
  return (
    <Badge tone={CATEGORY_TONE[category] ?? "slate"}>
      {humanize(category)}
    </Badge>
  );
}

const HEALTH_TONE: Record<string, BadgeTone> = {
  green: "emerald",
  yellow: "amber",
  red: "red",
};

export function ProductHealthBadge({ status }: { status: string }) {
  return (
    <Badge tone={HEALTH_TONE[status] ?? "slate"}>{humanize(status)}</Badge>
  );
}
