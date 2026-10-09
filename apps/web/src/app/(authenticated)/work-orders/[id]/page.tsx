'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { useSession } from '@/modules/auth/hooks/use-session';
import { Button } from '@/components/ui/button';
import {
  useUpdateWorkOrderStatus,
  useWorkOrder,
  useWorkOrderEvents,
} from '@/modules/work-orders/_hooks/use-work-orders';
import { AssignTechnicianDialog } from '../_components/assign-technician-dialog';
import { EditWorkOrderDialog } from '../_components/edit-work-order-dialog';
import { ActivityTimeline } from '@/modules/work-orders/_components/activity-timeline';
import { AttachmentsPanel } from '@/modules/work-orders/_components/attachments-panel';
import {
  SubmitProgressDialog,
  type ProgressDialogConfig,
} from '@/modules/work-orders/_components/submit-progress-dialog';
import { WorkOrderDetailSkeleton } from './_components/work-order-detail-skeleton';
import { WorkOrderHeader } from './_components/work-order-header';
import { WorkOrderDetails } from './_components/work-order-details';
import { WorkOrderScheduleCard } from './_components/work-order-schedule-card';
import { ReassignedAlertModal } from './_components/reassigned-alert-modal';

export default function WorkOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const { session } = useSession();
  const user = session.data;

  const [editOpen, setEditOpen] = React.useState(false);
  const [assignOpen, setAssignOpen] = React.useState(false);
  const [progressConfig, setProgressConfig] = React.useState<ProgressDialogConfig | null>(null);
  const [reassignedState, setReassignedState] = React.useState<{
    isOpen: boolean;
    reference?: string;
  }>({ isOpen: false });

  const { data: order, isLoading } = useWorkOrder(params.id);
  const { data: events, isLoading: eventsLoading } = useWorkOrderEvents(params.id);
  const updateStatusMutation = useUpdateWorkOrderStatus();

  // Listen for real-time reassignment notification targeted to this technician
  React.useEffect(() => {
    // Owners and dispatchers retain full organizational access and must not be redirected
    if (user?.role !== 'TECHNICIAN') {
      return;
    }

    function handleUnassigned(event: Event) {
      const customEvent = event as CustomEvent<{
        workOrderId: string;
        reference?: string;
        assignedTechnicianId?: string | null;
      }>;

      // Only trigger if this work order matches AND was unassigned from this specific technician
      const isTargetWorkOrder = customEvent.detail?.workOrderId === params.id;
      const isUnassignedFromMe =
        !customEvent.detail?.assignedTechnicianId ||
        customEvent.detail.assignedTechnicianId === user?.id;

      if (isTargetWorkOrder && isUnassignedFromMe) {
        setReassignedState({
          isOpen: true,
          reference: customEvent.detail?.reference || order?.reference,
        });
      }
    }

    window.addEventListener('work-order-unassigned', handleUnassigned);
    return () => {
      window.removeEventListener('work-order-unassigned', handleUnassigned);
    };
  }, [params.id, order?.reference, user?.role, user?.id]);

  if (reassignedState.isOpen) {
    return (
      <div className="space-y-6">
        <WorkOrderDetailSkeleton />
        <ReassignedAlertModal
          open={true}
          reference={reassignedState.reference}
        />
      </div>
    );
  }

  if (isLoading) {
    return <WorkOrderDetailSkeleton />;
  }

  if (!order) {
    return (
      <div className="space-y-4 rounded-xl border border-border bg-card p-8 text-center">
        <h2 className="text-lg font-semibold">Work Order Not Found</h2>
        <p className="text-sm text-muted-foreground">
          The requested work order does not exist or you do not have permission to view it.
        </p>
        <Button variant="outline" asChild>
          <Link href="/work-orders">
            <ArrowLeft className="size-4" />
            Back to Work Orders
          </Link>
        </Button>
      </div>
    );
  }

  const isTechnician = user?.role === 'TECHNICIAN';
  const isAssignedToMe = isTechnician && order.assignedTechnicianId === user?.id;

  async function handleDirectCancel() {
    if (!order) return;
    try {
      await updateStatusMutation.mutateAsync({
        id: order.id,
        input: { status: 'CANCELLED' },
      });
      toast.success('Work order cancelled');
    } catch (error: unknown) {
      const message =
        error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
          ? error.message
          : 'Failed to cancel work order';
      toast.error(message);
    }
  }

  return (
    <div className="space-y-6">
      <WorkOrderHeader
        order={order}
        isTechnician={isTechnician}
        isAssignedToMe={isAssignedToMe}
        isCancelPending={updateStatusMutation.isPending}
        onOpenEdit={() => setEditOpen(true)}
        onOpenAssign={() => setAssignOpen(true)}
        onOpenProgress={(cfg) => setProgressConfig(cfg)}
        onCancelJob={() => void handleDirectCancel()}
      />

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-7">
          <WorkOrderDetails order={order} />

          {/* Activity History & Audit Trail */}
          <section className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-base font-semibold">Activity & Audit History</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Immutable chronological audit log of all events and transitions.
                </p>
              </div>
              {(isAssignedToMe || !isTechnician) && order.status !== 'CANCELLED' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setProgressConfig({
                      type: 'NOTE_ADDED',
                      title: 'Add Progress Note',
                      description: 'Record an observation or field update.',
                    })
                  }
                >
                  <MessageSquare className="size-3.5" />
                  Add Note
                </Button>
              )}
            </div>

            <ActivityTimeline events={events} isLoading={eventsLoading} />
          </section>
        </div>

        <div className="space-y-6 lg:col-span-5">
          <WorkOrderScheduleCard
            order={order}
            isTechnician={isTechnician}
            onOpenAssign={() => setAssignOpen(true)}
          />

          {/* Attachments & Photos Panel */}
          <AttachmentsPanel
            workOrderId={order.id}
            isTechnician={isTechnician}
            isAssignedToMe={isAssignedToMe}
            currentUserId={user?.id}
            isOwner={user?.role === 'OWNER'}
          />
        </div>
      </div>

      <EditWorkOrderDialog
        workOrder={editOpen ? order : null}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      <AssignTechnicianDialog
        workOrder={assignOpen ? order : null}
        onClose={() => setAssignOpen(false)}
      />

      {progressConfig && (
        <SubmitProgressDialog
          workOrderId={order.id}
          config={progressConfig}
          onClose={() => setProgressConfig(null)}
        />
      )}
    </div>
  );
}
