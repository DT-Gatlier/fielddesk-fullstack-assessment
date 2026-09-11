type BadgeVariant = "status" | "priority" | "role" | "neutral";

type BadgeProps = {
  value: string;
  variant?: BadgeVariant;
};

const STATUS_CLASS: Record<string, string> = {
  draft: "badge--draft",
  scheduled: "badge--scheduled",
  in_progress: "badge--in-progress",
  completed: "badge--completed",
  cancelled: "badge--cancelled",
};

const PRIORITY_CLASS: Record<string, string> = {
  low: "badge--priority-low",
  medium: "badge--priority-medium",
  high: "badge--priority-high",
  urgent: "badge--priority-urgent",
};

export function Badge({ value, variant = "neutral" }: BadgeProps) {
  const normalized = value.toLowerCase();
  let tone = "badge--neutral";

  if (variant === "status") {
    tone = STATUS_CLASS[normalized] ?? "badge--neutral";
  } else if (variant === "priority") {
    tone = PRIORITY_CLASS[normalized] ?? "badge--neutral";
  } else if (variant === "role") {
    tone = "badge--role";
  }

  const label =
    variant === "status" || variant === "priority"
      ? normalized.replace(/_/g, " ")
      : value;

  return <span className={`badge ${tone}`}>{label}</span>;
}
