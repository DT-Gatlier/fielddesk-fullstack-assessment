import type { WorkOrderPriority, WorkOrderStatus } from '../_api/api.types';
import { Badge } from '@/components/ui/badge';

export function StatusBadge({ status }: { status: WorkOrderStatus }) {
  const map: Record<WorkOrderStatus, { label: string; variant: 'secondary' | 'info' | 'warning' | 'success' | 'destructive' }> = {
    DRAFT: { label: 'Draft', variant: 'secondary' },
    SCHEDULED: { label: 'Scheduled', variant: 'info' },
    IN_PROGRESS: { label: 'In Progress', variant: 'warning' },
    COMPLETED: { label: 'Completed', variant: 'success' },
    CANCELLED: { label: 'Cancelled', variant: 'destructive' },
  };

  const item = map[status] ?? { label: status, variant: 'secondary' };
  return <Badge variant={item.variant}>{item.label}</Badge>;
}

export function PriorityBadge({ priority }: { priority: WorkOrderPriority }) {
  const map: Record<WorkOrderPriority, { label: string; variant: 'secondary' | 'info' | 'warning' | 'destructive' }> = {
    LOW: { label: 'Low', variant: 'secondary' },
    MEDIUM: { label: 'Medium', variant: 'info' },
    HIGH: { label: 'High', variant: 'warning' },
    URGENT: { label: 'Urgent', variant: 'destructive' },
  };

  const item = map[priority] ?? { label: priority, variant: 'secondary' };
  return <Badge variant={item.variant}>{item.label}</Badge>;
}
