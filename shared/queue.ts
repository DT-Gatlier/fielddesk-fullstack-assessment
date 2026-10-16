/** Names shared by the outbox relay, the worker and tests. */
export const NOTIFICATION_QUEUE = 'notifications';
export const NOTIFY_JOB = 'notify-technician';

export interface NotifyJobData {
  notificationId: string;
}
