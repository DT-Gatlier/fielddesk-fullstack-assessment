export const STATUSES = ['open', 'in_progress', 'on_hold', 'completed', 'cancelled'] as const;
export type Status = (typeof STATUSES)[number];

export const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type Priority = (typeof PRIORITIES)[number];

/** Allowed status transitions. completed and cancelled are terminal. */
export const TRANSITIONS: Record<Status, readonly Status[]> = {
  open: ['in_progress', 'on_hold', 'cancelled'],
  in_progress: ['on_hold', 'completed', 'cancelled'],
  on_hold: ['in_progress', 'cancelled'],
  completed: [],
  cancelled: [],
};

/** Statuses a technician may set through progress events. */
export const TECHNICIAN_SETTABLE: readonly Status[] = ['in_progress', 'on_hold', 'completed'];

export const CLOSED_STATUSES: readonly Status[] = ['completed', 'cancelled'];

export const canTransition = (from: Status, to: Status) => TRANSITIONS[from].includes(to);
