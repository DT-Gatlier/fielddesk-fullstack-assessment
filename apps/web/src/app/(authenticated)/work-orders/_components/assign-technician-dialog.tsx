'use client';

import * as React from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { assignTechnicianSchema, type AssignTechnicianFormValues } from '@/modules/work-orders/_schemas/work-order.schema';
import { useAssignWorkOrder } from '@/modules/work-orders/_hooks/use-work-orders';
import { useUsers } from '@/modules/users/_hooks/use-users';
import type { WorkOrderResDto } from '@/modules/work-orders/_api/api.types';

interface AssignTechnicianDialogProps {
  workOrder: WorkOrderResDto | null;
  onClose: () => void;
}

export function AssignTechnicianDialog({ workOrder, onClose }: AssignTechnicianDialogProps) {
  const assignMutation = useAssignWorkOrder();
  const { data: usersData } = useUsers(
    { role: 'TECHNICIAN', limit: 100 },
    { enabled: Boolean(workOrder) },
  );

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<AssignTechnicianFormValues>({
    resolver: zodResolver(assignTechnicianSchema),
    defaultValues: {
      assignedTechnicianId: workOrder?.assignedTechnicianId ?? '',
      scheduledStart: '',
      scheduledEnd: '',
    },
  });

  const scheduledStart = useWatch({ control, name: 'scheduledStart' });

  const [minDateTime] = React.useState(() =>
    new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16),
  );

  React.useEffect(() => {
    if (workOrder) {
      const start = workOrder.scheduledStart
        ? new Date(workOrder.scheduledStart).toISOString().slice(0, 16)
        : '';
      const end = workOrder.scheduledEnd
        ? new Date(workOrder.scheduledEnd).toISOString().slice(0, 16)
        : '';

      reset({
        assignedTechnicianId: workOrder.assignedTechnicianId ?? '',
        scheduledStart: start,
        scheduledEnd: end,
      });
    }
  }, [workOrder, reset]);

  if (!workOrder) return null;

  async function onSubmit(values: AssignTechnicianFormValues) {
    if (!workOrder) return;
    try {
      await assignMutation.mutateAsync({
        id: workOrder.id,
        input: {
          assignedTechnicianId: values.assignedTechnicianId,
          scheduledStart: new Date(values.scheduledStart).toISOString(),
          scheduledEnd: new Date(values.scheduledEnd).toISOString(),
        },
      });
      toast.success('Technician assigned and scheduled successfully');
      onClose();
    } catch (error: unknown) {
      const message =
        error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
          ? error.message
          : 'Scheduling conflict detected';
      toast.error(message);
    }
  }

  return (
    <Dialog open={Boolean(workOrder)} onOpenChange={(open) => !open && onClose()}>
      <DialogHeader>
        <DialogTitle>
          {workOrder?.assignedTechnicianId ? 'Reassign & Reschedule' : 'Assign & Schedule'} ({workOrder?.reference})
        </DialogTitle>
        <DialogDescription>
          Select a technician and assign an unconflicted time window. Overlapping assignments will be rejected.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Field label="Technician" error={errors.assignedTechnicianId?.message}>
          <Select {...register('assignedTechnicianId')}>
            <option value="">Select a technician</option>
            {usersData?.items.map((tech) => (
              <option key={tech.id} value={tech.id}>
                {tech.name} ({tech.email})
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Start Time" error={errors.scheduledStart?.message}>
            <Input
              type="datetime-local"
              min={minDateTime || undefined}
              {...register('scheduledStart')}
            />
          </Field>
          <Field label="End Time" error={errors.scheduledEnd?.message}>
            <Input
              type="datetime-local"
              min={scheduledStart || minDateTime || undefined}
              {...register('scheduledEnd')}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={assignMutation.isPending}>
            {assignMutation.isPending ? 'Scheduling…' : 'Save Schedule'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
