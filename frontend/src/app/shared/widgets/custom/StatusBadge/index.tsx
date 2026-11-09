import { APP_USER_ROLES } from "@/app/shared/configs"
import { cn } from "@/app/shared/lib/utils"
import { Badge } from "@/app/shared/widgets/base/badge"

import type { StatusBadgeProps } from "./type"

/**
 * StatusBadge Component
 *
 * A reusable badge widget that dynamically applies styling
 * based on role or work order status.
 */
export function StatusBadge({ status, className }: StatusBadgeProps) {
  const normalized = status?.toLowerCase() || ""

  let variant: "default" | "emerald" | "blue" | "purple" | "destructive" | "amber" | "secondary" | "slate" = "default"

  switch (normalized) {
    case APP_USER_ROLES.OWNER:
      variant = "purple"
      break
    case APP_USER_ROLES.DISPATCHER:
      variant = "emerald"
      break
    case APP_USER_ROLES.TECHNICIAN:
      variant = "blue"
      break
    case "urgent":
    case "failed":
    case "revoked":
    case "blocked":
      variant = "destructive"
      break
    case "high":
      variant = "amber"
      break
    case "medium":
      variant = "blue"
      break
    case "low":
    case "open":
    case "cancelled":
      variant = "slate"
      break
    case "completed":
    case "active":
      variant = "emerald"
      break
    case "pending":
    case "in_progress":
      variant = "blue"
      break
    default:
      variant = "slate"
  }

  return (
    <Badge
      variant={variant}
      className={cn("capitalize font-medium text-xs", className)}
    >
      {status?.replace("_", " ")}
    </Badge>
  )
}

export default StatusBadge

