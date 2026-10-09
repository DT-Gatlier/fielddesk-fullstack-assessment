import { Calendar, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { WorkOrderResDto } from '@/modules/work-orders/_api/api.types';
import { formatScheduleWindow } from '@/modules/work-orders/_utils/schedule-formatter';

interface WorkOrderScheduleCardProps {
  order: WorkOrderResDto;
  isTechnician: boolean;
  onOpenAssign: () => void;
}

export function WorkOrderScheduleCard({
  order,
  isTechnician,
  onOpenAssign,
}: WorkOrderScheduleCardProps) {
  const schedule = formatScheduleWindow(order.scheduledStart, order.scheduledEnd);
  const canReassign = !isTechnician && order.status !== 'COMPLETED' && order.status !== 'IN_PROGRESS';

  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <h2 className="text-base font-semibold">Assignment & Schedule</h2>
      <div className="mt-4 space-y-4">
        <div>
          <span className="text-xs text-muted-foreground">Assigned Technician</span>
          <p className="mt-1 text-sm font-medium">
            {order.assignedTechnicianName ? (
              order.assignedTechnicianName
            ) : (
              <span className="text-muted-foreground italic">No technician assigned</span>
            )}
          </p>
        </div>

        <div>
          <span className="text-xs text-muted-foreground">Scheduled Window</span>
          {!schedule ? (
            <p className="mt-1 text-sm text-muted-foreground italic">No schedule set</p>
          ) : (
            <div className="mt-1 flex items-start gap-2 text-sm">
              <Clock className="mt-0.5 size-4 text-primary shrink-0" />
              <div>
                <div className="font-medium text-foreground">{schedule.primary}</div>
                <div className="text-xs text-muted-foreground">{schedule.secondary}</div>
              </div>
            </div>
          )}
        </div>

        {canReassign && (
          <div className="pt-2 border-t border-border/60">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={onOpenAssign}
            >
              <Calendar className="size-3.5" />
              {order.assignedTechnicianId ? 'Reassign / Reschedule' : 'Assign Technician'}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
