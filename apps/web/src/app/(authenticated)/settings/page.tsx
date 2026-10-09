'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { Building2, Database, Save } from 'lucide-react';
import { useSession } from '@/modules/auth/hooks/use-session';
import {
  useCurrentOrganisation,
  useUpdateOrganisation,
} from '@/modules/organisation/_hooks/use-organisation';
import { useStorageUsage } from '@/modules/work-orders/_hooks/use-work-orders';
import {
  updateOrganisationSchema,
  type UpdateOrganisationFormValues,
} from '@/modules/organisation/_schemas/organisation.schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function SettingsPage() {
  const { session } = useSession();
  const user = session.data;
  const orgQuery = useCurrentOrganisation();
  const storageQuery = useStorageUsage();
  const updateMutation = useUpdateOrganisation();

  const isOwner = user?.role === 'OWNER';

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<UpdateOrganisationFormValues>({
    resolver: zodResolver(updateOrganisationSchema),
    defaultValues: {
      name: '',
    },
  });

  useEffect(() => {
    if (orgQuery.data) {
      reset({ name: orgQuery.data.name });
    }
  }, [orgQuery.data, reset]);

  function onSubmit(values: UpdateOrganisationFormValues) {
    if (!isOwner) return;
    updateMutation.mutate(values);
  }

  return (
    <div className="space-y-7">
      <div>
        <p className="text-sm text-muted-foreground">Administration</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Organisation Settings</h1>
        <p className="mt-3 text-muted-foreground">
          Manage organisation profile and general settings.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Building2 className="size-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">General Information</h2>
            <p className="text-sm text-muted-foreground">
              Update the business name associated with your FieldDesk workspace.
            </p>
          </div>
        </div>

        {orgQuery.isLoading ? (
          <div className="mt-8 space-y-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-10 w-full max-w-md" />
            <Skeleton className="h-10 w-28 ml-auto max-w-md" />
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="mt-8 max-w-md space-y-6">
            <div>
              <label htmlFor="org-name" className="block text-sm font-medium">
                Organisation Name
              </label>
              <Input
                id="org-name"
                disabled={!isOwner || updateMutation.isPending}
                className="mt-2"
                {...register('name')}
              />
              {errors.name?.message && (
                <p className="mt-1.5 text-xs text-destructive">{errors.name.message}</p>
              )}
              {!isOwner && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Only users with the Owner role can update organisation settings.
                </p>
              )}
            </div>

            {isOwner && (
              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={!isDirty || updateMutation.isPending}
                  className="gap-2"
                >
                  <Save className="size-4" />
                  {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
                </Button>
              </div>
            )}
          </form>
        )}
      </div>

      {/* Storage Quota & Capacity */}
      <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Database className="size-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Storage & Quotas</h2>
            <p className="text-sm text-muted-foreground">
              Monitor cloud attachment consumption and remaining capacity for your organisation.
            </p>
          </div>
        </div>

        {storageQuery.isLoading ? (
          <div className="mt-6 space-y-3 max-w-md">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-4 w-24" />
          </div>
        ) : storageQuery.data ? (
          <div className="mt-6 max-w-md space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-foreground">
                {storageQuery.data.percentageUsed}% Used
              </span>
              <span className="text-muted-foreground">
                {formatBytes(storageQuery.data.usedBytes)} of {formatBytes(storageQuery.data.quotaBytes)}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  storageQuery.data.percentageUsed >= 95
                    ? 'bg-destructive'
                    : storageQuery.data.percentageUsed >= 85
                      ? 'bg-amber-500'
                      : 'bg-primary'
                }`}
                style={{
                  width: `${Math.min(100, Math.max(storageQuery.data.usedBytes > 0 ? 1 : 0, storageQuery.data.percentageUsed))}%`,
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Tenant storage capacity applies to work order documents, equipment manuals, and completion photos.
            </p>
          </div>
        ) : (
          <p className="mt-4 text-xs text-muted-foreground">
            Unable to retrieve storage quota details at this time.
          </p>
        )}
      </div>
    </div>
  );
}
