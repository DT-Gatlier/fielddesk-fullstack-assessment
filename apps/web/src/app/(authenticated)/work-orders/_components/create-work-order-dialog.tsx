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
import { createWorkOrderSchema, type CreateWorkOrderFormValues } from '@/modules/work-orders/_schemas/work-order.schema';
import { useCreateWorkOrder } from '@/modules/work-orders/_hooks/use-work-orders';
import { useUsers } from '@/modules/users/_hooks/use-users';

interface CreateWorkOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateWorkOrderDialog({ open, onOpenChange }: CreateWorkOrderDialogProps) {
  const createMutation = useCreateWorkOrder();
  const { data: usersData } = useUsers({ role: 'TECHNICIAN', limit: 100 }, { enabled: open });
  const [minDateTime] = React.useState(() =>
    new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16),
  );

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<CreateWorkOrderFormValues>({
    resolver: zodResolver(createWorkOrderSchema),
    defaultValues: {
      title: '',
      description: '',
      siteName: '',
      priority: 'MEDIUM',
      assignedTechnicianId: '',
      scheduledStart: '',
      scheduledEnd: '',
    },
  });

  const scheduledStart = useWatch({ control, name: 'scheduledStart' });

  async function onSubmit(values: CreateWorkOrderFormValues) {
    try {
      await createMutation.mutateAsync({
        title: values.title,
        description: values.description,
        siteName: values.siteName,
        priority: values.priority,
        assignedTechnicianId: values.assignedTechnicianId || undefined,
        scheduledStart: values.scheduledStart
          ? new Date(values.scheduledStart).toISOString()
          : undefined,
        scheduledEnd: values.scheduledEnd
          ? new Date(values.scheduledEnd).toISOString()
          : undefined,
      });
      toast.success('Work order created successfully');
      reset();
      onOpenChange(false);
    } catch (error: unknown) {
      const message =
        error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
          ? error.message
          : 'Failed to create work order';
      toast.error(message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Create New Work Order</DialogTitle>
        <DialogDescription>
          Provide site details, priority, and optionally schedule a technician.
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

        <div className="border-t border-border pt-3 space-y-3">
          <Field label="Assign Technician (Optional)">
            <Select {...register('assignedTechnicianId')}>
              <option value="">Unassigned</option>
              {usersData?.items.map((tech) => (
                <option key={tech.id} value={tech.id}>
                  {tech.name} ({tech.email})
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Scheduled Start" error={errors.scheduledStart?.message}>
              <Input
                type="datetime-local"
                min={minDateTime || undefined}
                {...register('scheduledStart')}
              />
            </Field>
            <Field label="Scheduled End" error={errors.scheduledEnd?.message}>
              <Input
                type="datetime-local"
                min={scheduledStart || minDateTime || undefined}
                {...register('scheduledEnd')}
              />
            </Field>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Creating…' : 'Create Work Order'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
