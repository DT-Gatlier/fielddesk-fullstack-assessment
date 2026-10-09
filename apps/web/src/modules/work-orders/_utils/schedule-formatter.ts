export interface FormattedScheduleWindow {
  primary: string;
  secondary: string;
  fullText: string;
  isSameDay: boolean;
}

export function formatScheduleWindow(
  startInput: string | Date | null | undefined,
  endInput: string | Date | null | undefined,
): FormattedScheduleWindow | null {
  if (!startInput || !endInput) return null;

  const start = typeof startInput === 'string' ? new Date(startInput) : startInput;
  const end = typeof endInput === 'string' ? new Date(endInput) : endInput;

  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;

  const isSameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();

  const startDateStr = start.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const startTimeStr = start.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  const endTimeStr = end.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (isSameDay) {
    return {
      primary: startDateStr,
      secondary: `${startTimeStr} – ${endTimeStr}`,
      fullText: `${startDateStr}, ${startTimeStr} – ${endTimeStr}`,
      isSameDay: true,
    };
  }

  const endDateStr = end.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return {
    primary: `${startDateStr}, ${startTimeStr}`,
    secondary: `to ${endDateStr}, ${endTimeStr}`,
    fullText: `${startDateStr}, ${startTimeStr} – ${endDateStr}, ${endTimeStr}`,
    isSameDay: false,
  };
}
