'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight, ShieldCheck, UserPlus, Users as UsersIcon } from 'lucide-react';
import { useSession } from '@/modules/auth/hooks/use-session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useUsers } from '@/modules/users/_hooks/use-users';
import type { UserResDto, UserRole } from '@/modules/users/_api/api.types';
import { InviteUserDialog } from './_components/invite-user-dialog';
import { UpdateRoleDialog } from './_components/update-role-dialog';

const PAGE_SIZE = 20;

export default function UsersPage() {
  const { session } = useSession();
  const user = session.data;

  const [search, setSearch] = React.useState('');
  const [roleFilter, setRoleFilter] = React.useState<UserRole | ''>('');
  const [page, setPage] = React.useState(1);
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [editingUser, setEditingUser] = React.useState<UserResDto | null>(null);

  const { data, isLoading } = useUsers({
    search: search || undefined,
    role: roleFilter ? roleFilter : undefined,
    page,
    limit: PAGE_SIZE,
  });

  if (user && user.role !== 'OWNER') {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-6 text-center">
        <h2 className="text-lg font-semibold text-destructive">Access Restricted</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Only organisation owners have permission to manage team members.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Team Management</h1>
          <p className="text-sm text-muted-foreground">
            Manage users, technicians, and administrative roles in {user?.organisation.name}.
          </p>
        </div>
        <Button onClick={() => setInviteOpen(true)}>
          <UserPlus className="size-4" />
          Invite User
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="max-w-xs flex-1">
          <Input
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="w-40">
          <select
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value as UserRole | '');
              setPage(1);
            }}
            className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <option value="">All Roles</option>
            <option value="OWNER">Owner</option>
            <option value="DISPATCHER">Dispatcher</option>
            <option value="TECHNICIAN">Technician</option>
          </select>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card">
        {isLoading ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="p-12 text-center">
            <UsersIcon className="mx-auto size-8 text-muted-foreground/60" />
            <h3 className="mt-3 text-base font-medium">No users found</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Try adjusting your search filters or invite a new team member.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">{member.name}</TableCell>
                  <TableCell className="text-muted-foreground">{member.email}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        member.role === 'OWNER'
                          ? 'default'
                          : member.role === 'DISPATCHER'
                            ? 'info'
                            : 'secondary'
                      }
                    >
                      {member.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(member.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingUser(member)}
                    >
                      <ShieldCheck className="size-3.5" />
                      Role
                    </Button>
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
                {(page - 1) * PAGE_SIZE + 1}
              </span>{' '}
              to{' '}
              <span className="font-medium text-foreground">
                {Math.min(page * PAGE_SIZE, data.total)}
              </span>{' '}
              of <span className="font-medium text-foreground">{data.total}</span> users
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="size-3.5 mr-1" />
                Previous
              </Button>
              <span className="text-xs text-muted-foreground px-1">
                Page {page} of {Math.max(1, Math.ceil(data.total / PAGE_SIZE))}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page * PAGE_SIZE >= data.total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
                <ChevronRight className="size-3.5 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <InviteUserDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      <UpdateRoleDialog user={editingUser} onClose={() => setEditingUser(null)} />
    </div>
  );
}
