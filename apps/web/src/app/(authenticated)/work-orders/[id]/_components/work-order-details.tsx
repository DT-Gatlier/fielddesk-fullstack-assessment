import { MapPin, User as UserIcon } from 'lucide-react';
import type { WorkOrderResDto } from '@/modules/work-orders/_api/api.types';

interface WorkOrderDetailsProps {
  order: WorkOrderResDto;
}

export function WorkOrderDetails({ order }: WorkOrderDetailsProps) {
  return (
    <>
      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-base font-semibold">Description & Scope</h2>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-foreground/90">
          {order.description}
        </p>
      </section>

      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-base font-semibold">Job Details</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 size-4 text-muted-foreground" />
            <div>
              <dt className="text-xs text-muted-foreground">Site Location</dt>
              <dd className="mt-1 text-sm font-medium">{order.siteName}</dd>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <UserIcon className="mt-0.5 size-4 text-muted-foreground" />
            <div>
              <dt className="text-xs text-muted-foreground">Created By</dt>
              <dd className="mt-1 text-sm font-medium">{order.creatorName}</dd>
            </div>
          </div>
        </dl>
      </section>
    </>
  );
}
