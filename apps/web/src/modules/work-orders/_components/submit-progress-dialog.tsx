'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, MessageSquare, Play } from 'lucide-react';
import { toast } from 'sonner';

import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel, FieldError } from '@/components/ui/field';
import type { WorkOrderEventType, WorkOrderStatus } from '../_api/api.types';
import {
  progressEventSchema,
  type ProgressEventFormValues,
} from '../_schemas/progress-event.schema';
import { useSubmitProgressEvent } from '../_hooks/use-work-orders';

export interface ProgressDialogConfig {
  type: WorkOrderEventType;
  targetStatus?: WorkOrderStatus;
  title: string;
  description: string;
}

interface SubmitProgressDialogProps {
  workOrderId: string;
  config: ProgressDialogConfig | null;
  onClose: () => void;
}

export function SubmitProgressDialog({
  workOrderId,
  config,
  onClose,
}: SubmitProgressDialogProps) {
  const submitEventMutation = useSubmitProgressEvent();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProgressEventFormValues>({
    resolver: zodResolver(progressEventSchema),
    defaultValues: {
      type: config?.type ?? 'NOTE_ADDED',
      status: config?.targetStatus,
      note: '',
    },
  });

  const handleClose = () => {
    reset();
    onClose();
  };

  const onSubmit = async (values: ProgressEventFormValues) => {
    if (!config) return;

    try {
      // Generate client-side unique idempotency key once per submission attempt
      const eventId = `evt-${crypto.randomUUID()}`;

      await submitEventMutation.mutateAsync({
        workOrderId,
        input: {
          eventId,
          type: config.type,
          occurredAt: new Date().toISOString(),
          payload: {
            ...(config.targetStatus ? { status: config.targetStatus.toLowerCase() } : {}),
            ...(values.note?.trim() ? { note: values.note.trim() } : {}),
          },
        },
      });

      toast.success(
        config.type === 'WORK_STARTED'
          ? 'Work started successfully'
          : config.type === 'WORK_COMPLETED'
          ? 'Work order marked as completed'
          : config.type === 'STATUS_CHANGED'
          ? 'Status updated successfully'
          : 'Progress note recorded',
      );
      handleClose();
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
          ? err.message
          : 'Failed to record progress event';
      toast.error(message);
    }
  };

  const isOpen = Boolean(config);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          {config?.type === 'WORK_STARTED' ? (
            <Play className="size-4 text-amber-500" />
          ) : config?.type === 'WORK_COMPLETED' ? (
            <CheckCircle2 className="size-4 text-emerald-500" />
          ) : (
            <MessageSquare className="size-4 text-primary" />
          )}
          {config?.title ?? 'Record Progress'}
        </DialogTitle>
        <DialogDescription>
          {config?.description ??
            'Submit a progress update. This will be preserved as an immutable audit record.'}
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
        <Field error={errors.note?.message}>
          <FieldLabel htmlFor="progress-note">
            {config?.type === 'NOTE_ADDED' ? 'Note / Comments' : 'Optional Comments'}
          </FieldLabel>
          <textarea
            id="progress-note"
            {...register('note')}
            rows={4}
            maxLength={2000}
            placeholder={
              config?.type === 'WORK_STARTED'
                ? 'e.g. Arrived on site, initial inspection started...'
                : config?.type === 'WORK_COMPLETED'
                ? 'e.g. Replaced filter and verified operation. Job finished.'
                : 'Enter field progress notes or observations...'
            }
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
          />
          {errors.note && <FieldError>{errors.note.message}</FieldError>}
        </Field>

        <DialogFooter className="gap-2 sm:gap-0 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isSubmitting || submitEventMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting || submitEventMutation.isPending}
            className={
              config?.type === 'WORK_STARTED'
                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                : config?.type === 'WORK_COMPLETED'
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : ''
            }
          >
            {isSubmitting || submitEventMutation.isPending
              ? 'Recording...'
              : config?.type === 'WORK_COMPLETED'
              ? 'Mark as Completed'
              : config?.type === 'WORK_STARTED'
              ? 'Start Work'
              : 'Save Note'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
