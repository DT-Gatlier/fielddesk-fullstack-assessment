import type { ReactNode } from "react";

type StatTileProps = {
  label: string;
  value: number | string;
  hint?: string;
  variant?: "default" | "attention" | "active" | "success" | "neutral";
  icon?: ReactNode;
};

const VARIANT_CLASS: Record<NonNullable<StatTileProps["variant"]>, string> = {
  default: "stat-tile--default",
  attention: "stat-tile--attention",
  active: "stat-tile--active",
  success: "stat-tile--success",
  neutral: "stat-tile--neutral",
};

export function StatTile({
  label,
  value,
  hint,
  variant = "default",
  icon,
}: StatTileProps) {
  return (
    <div className={`stat-tile ${VARIANT_CLASS[variant]}`}>
      <div className="stat-tile__header">
        {icon ? <span className="stat-tile__icon">{icon}</span> : null}
        <span className="stat-tile__label">{label}</span>
      </div>
      <p className="stat-tile__value">{value}</p>
      {hint ? <p className="stat-tile__hint">{hint}</p> : null}
    </div>
  );
}
