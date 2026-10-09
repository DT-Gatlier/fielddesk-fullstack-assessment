'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { updateRoleSchema, type UpdateRoleFormValues } from '@/modules/users/_schemas/user.schema';
import { useUpdateUserRole } from '@/modules/users/_hooks/use-users';
import type { UserResDto } from '@/modules/users/_api/api.types';

interface UpdateRoleDialogProps {
  user: UserResDto | null;
  onClose: () => void;
}

export function UpdateRoleDialog({ user, onClose }: UpdateRoleDialogProps) {
  const updateRoleMutation = useUpdateUserRole();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UpdateRoleFormValues>({
    resolver: zodResolver(updateRoleSchema),
    defaultValues: {
      role: user?.role ?? 'TECHNICIAN',
    },
  });

  React.useEffect(() => {
    if (user) {
      reset({ role: user.role });
    }
  }, [user, reset]);

  if (!user) return null;

  async function onSubmit(values: UpdateRoleFormValues) {
    if (!user) return;
    try {
      await updateRoleMutation.mutateAsync({ userId: user.id, input: values });
      toast.success(`Updated role for ${user.name}`);
      onClose();
    } catch (error: unknown) {
      const message =
        error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
          ? error.message
          : 'Failed to update user role';
      toast.error(message);
    }
  }

  return (
    <Dialog open={Boolean(user)} onOpenChange={(open) => !open && onClose()}>
      <DialogHeader>
        <DialogTitle>Change Role for {user.name}</DialogTitle>
        <DialogDescription>
          Updating the role will atomically revoke all existing active sessions for this user.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Field label="Assign New Role" error={errors.role?.message}>
          <Select {...register('role')}>
            <option value="TECHNICIAN">Technician</option>
            <option value="DISPATCHER">Dispatcher</option>
            <option value="OWNER">Owner</option>
          </Select>
        </Field>
        {user.role === 'OWNER' && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Note: If this is the only remaining owner in the organisation, demotion will be rejected.
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={updateRoleMutation.isPending}>
            {updateRoleMutation.isPending ? 'Updating…' : 'Update Role'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
