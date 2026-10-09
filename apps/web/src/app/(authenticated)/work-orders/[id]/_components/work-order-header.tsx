import { ArrowLeft, Calendar, CheckCircle2, MessageSquare, Pencil, Play, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { PriorityBadge, StatusBadge } from '@/modules/work-orders/_components/badges';
import type { WorkOrderResDto } from '@/modules/work-orders/_api/api.types';
import type { ProgressDialogConfig } from '@/modules/work-orders/_components/submit-progress-dialog';

interface WorkOrderHeaderProps {
  order: WorkOrderResDto;
  isTechnician: boolean;
  isAssignedToMe: boolean;
  isCancelPending: boolean;
  onOpenEdit?: () => void;
  onOpenAssign: () => void;
  onOpenProgress: (config: ProgressDialogConfig) => void;
  onCancelJob: () => void;
}

export function WorkOrderHeader({
  order,
  isTechnician,
  isAssignedToMe,
  isCancelPending,
  onOpenEdit,
  onOpenAssign,
  onOpenProgress,
  onCancelJob,
}: WorkOrderHeaderProps) {
  const router = useRouter();

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => router.back()} aria-label="Go back">
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-bold text-primary">{order.reference}</span>
            <StatusBadge status={order.status} />
            <PriorityBadge priority={order.priority} />
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{order.title}</h1>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Dispatcher/Owner Edit Work Order */}
        {!isTechnician && order.status !== 'COMPLETED' && order.status !== 'CANCELLED' && onOpenEdit && (
          <Button variant="outline" onClick={onOpenEdit}>
            <Pencil className="size-4" />
            Edit
          </Button>
        )}

        {/* Dispatcher/Owner Assignment */}
        {!isTechnician && order.status !== 'COMPLETED' && order.status !== 'IN_PROGRESS' && (
          <Button variant="outline" onClick={onOpenAssign}>
            <Calendar className="size-4" />
            {order.assignedTechnicianId ? 'Reassign / Reschedule' : 'Assign Technician'}
          </Button>
        )}

        {/* Progress Note Action (Available to assigned technician or dispatcher/owner) */}
        {(isAssignedToMe || !isTechnician) && order.status !== 'CANCELLED' && (
          <Button
            variant="outline"
            onClick={() =>
              onOpenProgress({
                type: 'NOTE_ADDED',
                title: 'Add Progress Note',
                description: 'Record an observation, site note, or progress update for this job.',
              })
            }
          >
            <MessageSquare className="size-4" />
            Add Note
          </Button>
        )}

        {/* Technician: Start Work */}
        {isAssignedToMe && order.status === 'SCHEDULED' && (
          <Button
            className="bg-amber-600 hover:bg-amber-700 text-white"
            onClick={() =>
              onOpenProgress({
                type: 'WORK_STARTED',
                targetStatus: 'IN_PROGRESS',
                title: 'Start Work Order',
                description: 'Transition status to In Progress and record commencement details.',
              })
            }
          >
            <Play className="size-4" />
            Start Work
          </Button>
        )}

        {/* Technician: Complete Work */}
        {isAssignedToMe && order.status === 'IN_PROGRESS' && (
          <Button
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={() =>
              onOpenProgress({
                type: 'WORK_COMPLETED',
                targetStatus: 'COMPLETED',
                title: 'Mark as Completed',
                description: 'Confirm that this job is finished and record any final resolution notes.',
              })
            }
          >
            <CheckCircle2 className="size-4" />
            Mark as Completed
          </Button>
        )}

        {/* Dispatcher / Owner: Cancel Job */}
        {!isTechnician && order.status !== 'COMPLETED' && order.status !== 'CANCELLED' && (
          <Button
            variant="outline"
            className="text-destructive hover:bg-destructive/10"
            onClick={onCancelJob}
            disabled={isCancelPending}
          >
            <XCircle className="size-4" />
            Cancel Job
          </Button>
        )}
      </div>
    </div>
  );
}
