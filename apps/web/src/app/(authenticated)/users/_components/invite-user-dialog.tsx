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
import { createUserSchema, type CreateUserFormValues } from '@/modules/users/_schemas/user.schema';
import { useCreateUser } from '@/modules/users/_hooks/use-users';

interface InviteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InviteUserDialog({ open, onOpenChange }: InviteUserDialogProps) {
  const createUserMutation = useCreateUser();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      role: 'TECHNICIAN',
    },
  });

  async function onSubmit(values: CreateUserFormValues) {
    try {
      await createUserMutation.mutateAsync(values);
      toast.success('User invited successfully');
      reset();
      onOpenChange(false);
    } catch (error: unknown) {
      const message =
        error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
          ? error.message
          : 'Failed to create user';
      toast.error(message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Invite New User</DialogTitle>
        <DialogDescription>
          Create a user account with a temporary password and assigned role.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Field label="Full Name" error={errors.name?.message}>
          <Input placeholder="Ravi Kumar" {...register('name')} />
        </Field>
        <Field label="Email Address" error={errors.email?.message}>
          <Input type="email" placeholder="ravi.kumar@company.com" {...register('email')} />
        </Field>
        <Field label="Initial Password" error={errors.password?.message}>
          <Input type="password" placeholder="••••••••" {...register('password')} />
        </Field>
        <Field label="Role" error={errors.role?.message}>
          <Select {...register('role')}>
            <option value="TECHNICIAN">Technician</option>
            <option value="DISPATCHER">Dispatcher</option>
            <option value="OWNER">Owner</option>
          </Select>
        </Field>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={createUserMutation.isPending}>
            {createUserMutation.isPending ? 'Inviting…' : 'Invite User'}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
