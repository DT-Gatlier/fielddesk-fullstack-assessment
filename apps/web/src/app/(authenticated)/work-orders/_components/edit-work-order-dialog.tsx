'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  updateWorkOrderSchema,
  type UpdateWorkOrderFormValues,
} from '@/modules/work-orders/_schemas/work-order.schema';
import { useUpdateWorkOrder } from '@/modules/work-orders/_hooks/use-work-orders';
import type { WorkOrderResDto } from '@/modules/work-orders/_api/api.types';

interface EditWorkOrderDialogProps {
  workOrder: WorkOrderResDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditWorkOrderDialog({
  workOrder,
  open,
  onOpenChange,
}: EditWorkOrderDialogProps) {
  const updateMutation = useUpdateWorkOrder();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UpdateWorkOrderFormValues>({
    resolver: zodResolver(updateWorkOrderSchema),
    defaultValues: {
      title: workOrder?.title ?? '',
      description: workOrder?.description ?? '',
      siteName: workOrder?.siteName ?? '',
      priority: (workOrder?.priority as UpdateWorkOrderFormValues['priority']) ?? 'MEDIUM',
    },
  });

  React.useEffect(() => {
    if (workOrder) {
      reset({
        title: workOrder.title,
        description: workOrder.description,
        siteName: workOrder.siteName,
        priority: workOrder.priority as UpdateWorkOrderFormValues['priority'],
      });
    }
  }, [workOrder, reset]);

  async function onSubmit(values: UpdateWorkOrderFormValues) {
    if (!workOrder) return;
    try {
      await updateMutation.mutateAsync({
        id: workOrder.id,
        input: {
          title: values.title,
          description: values.description,
          siteName: values.siteName,
          priority: values.priority,
        },
      });
      toast.success('Work order updated successfully');
      onOpenChange(false);
    } catch (error: unknown) {
      const message =
        error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
          ? error.message
          : 'Failed to update work order';
      toast.error(message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Edit Work Order</DialogTitle>
        <DialogDescription>
          Update the work order title, location site, description, or priority level.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Field label="Work Order Title" error={errors.title?.message}>
          <Input placeholder="HVAC maintenance on 3rd floor" {...register('title')} />
        </Field>
        <Field label="Site / Location Name" error={errors.siteName?.message}>
          <Input placeholder="Main Headquarters, Bldg B" {...register('siteName')} />
        </Field>
        <Field label="Description" error={errors.description?.message}>
          <Input placeholder="Detail the issue or maintenance scope…" {...register('description')} />
        </Field>
        <Field label="Priority" error={errors.priority?.message}>
          <Select {...register('priority')}>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </Select>
        </Field>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
