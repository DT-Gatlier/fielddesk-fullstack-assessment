import type { Priority, WorkOrderStatus } from '../types';

export const titleCase = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
export const formatDateTime = (value?: string | null) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Not scheduled';
export const formatBytes = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
export const toDateTimeLocal = (value?: string | null) => value ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : '';
export const statusTone = (status: WorkOrderStatus) => status === 'completed' ? 'success' : status === 'cancelled' ? 'danger' : status === 'in_progress' ? 'info' : status === 'scheduled' ? 'warning' : 'neutral';
export const priorityTone = (priority: Priority) => priority === 'urgent' ? 'danger' : priority === 'high' ? 'warning' : priority === 'medium' ? 'info' : 'neutral';
