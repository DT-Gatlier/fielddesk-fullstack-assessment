export function formatStatus(value: string): string {
  return value.replace(/_/g, " ");
}

export function formatRole(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    dateStyle: "medium",
  });
}

export function formatTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString(undefined, {
    timeStyle: "short",
  });
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isScheduledToday(value: string | null): boolean {
  if (!value) return false;
  const date = new Date(value);
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

export function isOverdue(workOrder: {
  status: string;
  scheduledEnd: string | null;
}): boolean {
  if (!workOrder.scheduledEnd) return false;
  if (workOrder.status === "completed" || workOrder.status === "cancelled") {
    return false;
  }
  return new Date(workOrder.scheduledEnd) < new Date();
}

export function formatScheduleWindow(
  start: string | null,
  end: string | null,
): string {
  if (!start && !end) return "Not scheduled";
  if (start && !end) return formatDateTime(start);
  if (!start && end) return `Until ${formatDateTime(end)}`;
  const sameDay =
    new Date(start!).toDateString() === new Date(end!).toDateString();
  if (sameDay) {
    return `${formatDate(start)} · ${formatTime(start)} – ${formatTime(end)}`;
  }
  return `${formatDateTime(start)} – ${formatDateTime(end)}`;
}
