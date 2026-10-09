'use client';

import Link from 'next/link';
import {
  Briefcase,
  Clock,
  Plus,
  Users,
  Wrench,
} from 'lucide-react';
import { useSession } from '@/modules/auth/hooks/use-session';
import { useWorkOrders } from '@/modules/work-orders/_hooks/use-work-orders';
import { StatusBadge, PriorityBadge } from '@/modules/work-orders/_components/badges';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardPage() {
  const { session } = useSession();
  const user = session.data;

  const { data: allWorkOrders, isLoading } = useWorkOrders({ limit: 5 });

  if (!user) return null;

  const isOwner = user.role === 'OWNER';
  const isDispatcher = user.role === 'DISPATCHER';
  const canManage = isOwner || isDispatcher;

  const total = allWorkOrders?.total ?? 0;
  const recentOrders = allWorkOrders?.items ?? [];

  return (
    <div className="space-y-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Workspace Overview</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Welcome back, {user.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Signed in to {user.organisation.name} as{' '}
            <span className="font-medium text-foreground">
              {user.role.charAt(0) + user.role.slice(1).toLowerCase()}
            </span>
          </p>
        </div>

        {canManage && (
          <Link href="/work-orders?new=true">
            <Button className="gap-2">
              <Plus className="size-4" />
              New Work Order
            </Button>
          </Link>
        )}
      </div>

      {/* Quick stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Total Work Orders</span>
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Briefcase className="size-4" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-semibold">{isLoading ? '…' : total}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {user.role === 'TECHNICIAN' ? 'Assigned to your schedule' : 'Across organisation'}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">My Role</span>
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Wrench className="size-4" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-semibold">
            {user.role.charAt(0) + user.role.slice(1).toLowerCase()}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {isOwner
              ? 'Full administrative control'
              : isDispatcher
                ? 'Dispatching and scheduling privileges'
                : 'Field execution privileges'}
          </p>
        </div>

        {isOwner && (
          <Link
            href="/users"
            className="group rounded-xl border border-border bg-card p-5 transition hover:border-primary/50"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Team Management</span>
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Users className="size-4" />
              </div>
            </div>
            <p className="mt-3 text-2xl font-semibold">Manage Users</p>
            <p className="mt-1 text-xs text-muted-foreground group-hover:text-primary">
              Invite dispatchers and technicians &rarr;
            </p>
          </Link>
        )}
      </div>

      {/* Recent Work Orders Section */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div>
            <h2 className="text-lg font-semibold">Recent Work Orders</h2>
            <p className="text-xs text-muted-foreground">
              {user.role === 'TECHNICIAN'
                ? 'Your recently assigned jobs'
                : 'Latest work orders across the organisation'}
            </p>
          </div>
          <Link
            href="/work-orders"
            className="text-xs font-medium text-primary hover:underline"
          >
            View all
          </Link>
        </div>

        {isLoading ? (
          <div className="space-y-3 py-6">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : recentOrders.length === 0 ? (
          <div className="py-12 text-center">
            <Clock className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">No work orders found</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {canManage
                ? 'Get started by creating your first work order.'
                : 'No work orders are currently assigned to you.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {recentOrders.map((wo) => (
              <Link
                key={wo.id}
                href={`/work-orders/${wo.id}`}
                className="group flex flex-col gap-2 py-3.5 transition sm:flex-row sm:items-center sm:justify-between hover:bg-muted/30 px-2 rounded-lg"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-primary">
                      {wo.reference}
                    </span>
                    <span className="truncate text-sm font-medium text-foreground group-hover:text-primary">
                      {wo.title}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Site: {wo.siteName}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <PriorityBadge priority={wo.priority} />
                  <StatusBadge status={wo.status} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
