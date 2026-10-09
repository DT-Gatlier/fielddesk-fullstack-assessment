'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Calendar, ChevronLeft, ChevronRight, Download, Loader2, Plus, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { useSession } from '@/modules/auth/hooks/use-session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { downloadWorkOrdersCsv } from '@/modules/work-orders/_api/work-orders-export';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useWorkOrders } from '@/modules/work-orders/_hooks/use-work-orders';
import type {
  WorkOrderPriority,
  WorkOrderResDto,
  WorkOrderStatus,
} from '@/modules/work-orders/_api/api.types';
import { PriorityBadge, StatusBadge } from '@/modules/work-orders/_components/badges';
import { formatScheduleWindow } from '@/modules/work-orders/_utils/schedule-formatter';
import { CreateWorkOrderDialog } from './_components/create-work-order-dialog';
import { AssignTechnicianDialog } from './_components/assign-technician-dialog';

export default function WorkOrdersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session } = useSession();
  const user = session.data;

  const statusParam = (searchParams.get('status') || '') as WorkOrderStatus | '';
  const priorityParam = (searchParams.get('priority') || '') as WorkOrderPriority | '';
  const searchParam = searchParams.get('search') || '';
  const pageParam = Math.max(1, Number(searchParams.get('page') || '1'));
  const newParam = searchParams.get('new') === 'true';

  const [createOpenManual, setCreateOpenManual] = React.useState(false);
  const isCreateOpen = createOpenManual || newParam;

  function handleCreateOpenChange(open: boolean) {
    if (!open) {
      setCreateOpenManual(false);
      if (newParam) {
        updateParams({ new: null });
      }
    } else {
      setCreateOpenManual(true);
    }
  }

  const [assigningOrder, setAssigningOrder] = React.useState<WorkOrderResDto | null>(null);
  const [isExporting, setIsExporting] = React.useState(false);

  const { data, isLoading } = useWorkOrders({
    status: statusParam || undefined,
    priority: priorityParam || undefined,
    search: searchParam || undefined,
    page: pageParam,
    limit: 20,
  });

  async function handleExport() {
    setIsExporting(true);
    try {
      await downloadWorkOrdersCsv({
        status: statusParam || undefined,
        priority: priorityParam || undefined,
        search: searchParam || undefined,
      });
      toast.success('Work orders exported successfully');
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Failed to export work orders';
      toast.error(message);
    } finally {
      setIsExporting(false);
    }
  }

  function updateParams(newParams: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(newParams)) {
      if (!value) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    }
    router.replace(`/work-orders?${next.toString()}`);
  }

  const isTechnician = user?.role === 'TECHNICIAN';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {isTechnician ? 'My Assigned Work Orders' : 'Work Orders'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isTechnician
              ? 'View and record progress for your assigned site tasks.'
              : `Manage, schedule, and assign field maintenance jobs for ${user?.organisation.name}.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => void handleExport()}
            disabled={isExporting}
          >
            {isExporting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            <span>Export CSV</span>
          </Button>
          {!isTechnician && (
            <Button onClick={() => handleCreateOpenChange(true)}>
              <Plus className="size-4" />
              New Work Order
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_180px_180px]">
        <Input
          placeholder="Search by title, reference, site…"
          defaultValue={searchParam}
          onChange={(e) => updateParams({ search: e.target.value, page: '1' })}
        />
        <Select
          value={statusParam}
          onChange={(e) => updateParams({ status: e.target.value, page: '1' })}
        >
          <option value="">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="SCHEDULED">Scheduled</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </Select>
        <Select
          value={priorityParam}
          onChange={(e) => updateParams({ priority: e.target.value, page: '1' })}
        >
          <option value="">All Priorities</option>
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
          <option value="URGENT">Urgent</option>
        </Select>
      </div>

      <div className="rounded-xl border border-border bg-card">
        {isLoading ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="p-12 text-center">
            <Wrench className="mx-auto size-8 text-muted-foreground/60" />
            <h3 className="mt-3 text-base font-medium">No work orders found</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {isTechnician
                ? 'You do not have any work orders assigned matching this filter.'
                : 'Create a new work order or adjust your active search filters.'}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ref</TableHead>
                <TableHead>Title & Site</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Assigned Tech</TableHead>
                <TableHead>Schedule Window</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-mono text-xs font-semibold text-primary">
                    <Link href={`/work-orders/${order.id}`} className="hover:underline">
                      {order.reference}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-foreground">{order.title}</div>
                    <div className="text-xs text-muted-foreground">{order.siteName}</div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={order.status} />
                  </TableCell>
                  <TableCell>
                    <PriorityBadge priority={order.priority} />
                  </TableCell>
                  <TableCell className="text-sm">
                    {order.assignedTechnicianName ? (
                      order.assignedTechnicianName
                    ) : (
                      <span className="text-muted-foreground italic">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {(() => {
                      const schedule = formatScheduleWindow(order.scheduledStart, order.scheduledEnd);
                      if (!schedule) return <span>—</span>;
                      return (
                        <div>
                          <div className="font-medium text-foreground/90">{schedule.primary}</div>
                          <div className="text-[11px] text-muted-foreground/80">{schedule.secondary}</div>
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {!isTechnician && order.status !== 'COMPLETED' && order.status !== 'IN_PROGRESS' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setAssigningOrder(order)}
                        >
                          <Calendar className="size-3.5" />
                          {order.assignedTechnicianId ? 'Reassign' : 'Assign'}
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/work-orders/${order.id}`}>
                          View
                          <ChevronRight className="size-3.5" />
                        </Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Pagination Controls */}
        {data && data.total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border px-4 py-3 bg-card/50">
            <p className="text-xs text-muted-foreground">
              Showing{' '}
              <span className="font-medium text-foreground">
                {(pageParam - 1) * 20 + 1}
              </span>{' '}
              to{' '}
              <span className="font-medium text-foreground">
                {Math.min(pageParam * 20, data.total)}
              </span>{' '}
              of <span className="font-medium text-foreground">{data.total}</span> orders
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pageParam <= 1}
                onClick={() =>
                  updateParams({
                    page: pageParam > 2 ? String(pageParam - 1) : null,
                  })
                }
              >
                <ChevronLeft className="size-3.5 mr-1" />
                Previous
              </Button>
              <span className="text-xs text-muted-foreground px-1">
                Page {pageParam} of {Math.max(1, Math.ceil(data.total / 20))}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={pageParam * 20 >= data.total}
                onClick={() =>
                  updateParams({
                    page: String(pageParam + 1),
                  })
                }
              >
                Next
                <ChevronRight className="size-3.5 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <CreateWorkOrderDialog open={isCreateOpen} onOpenChange={handleCreateOpenChange} />
      <AssignTechnicianDialog
        workOrder={assigningOrder}
        onClose={() => setAssigningOrder(null)}
      />
    </div>
  );
}
