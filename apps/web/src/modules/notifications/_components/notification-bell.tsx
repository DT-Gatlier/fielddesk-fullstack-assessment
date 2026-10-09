'use client';

import { useState } from 'react';
import { Bell, CheckCheck, Trash2, ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useNotifications } from '../_hooks/use-notifications';
import { formatRelativeTime } from '../_utils/notification-formatter';

export function NotificationBell() {
  const router = useRouter();
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    clearAll,
  } = useNotifications();

  const [isOpen, setIsOpen] = useState(false);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    // When the user opens the notification dropdown, automatically mark all unread notifications as read
    if (open && unreadCount > 0) {
      markAllAsRead();
    }
  };

  const handleNotificationClick = (workOrderId?: string | null, id?: string) => {
    if (id) {
      markAsRead(id);
    }
    if (workOrderId) {
      router.push(`/work-orders/${workOrderId}`);
    }
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="relative h-9 w-9 p-0"
          aria-label={
            unreadCount > 0
              ? `Notifications, ${unreadCount} unread`
              : 'Notifications'
          }
        >
          <Bell className="size-4 text-foreground" aria-hidden="true" />
          {unreadCount > 0 && (
            <span
              className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground animate-in fade-in zoom-in"
              aria-hidden="true"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-80 max-w-[90vw] p-0 shadow-lg"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              Notifications
            </span>
            {unreadCount > 0 && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {unreadCount} new
              </span>
            )}
          </div>
          {notifications.length > 0 && (
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllAsRead}
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  title="Mark all as read"
                >
                  <CheckCheck className="size-3" aria-hidden="true" />
                  <span>Mark all read</span>
                </button>
              )}
              <button
                type="button"
                onClick={clearAll}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                title="Clear all notifications"
              >
                <Trash2 className="size-3" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>

        {/* Notification List */}
        <div className="max-h-80 overflow-y-auto divide-y divide-border/60">
          {notifications.length === 0 ? (
            <div className="py-8 text-center">
              <Bell className="mx-auto size-7 text-muted-foreground/40" />
              <p className="mt-2 text-xs font-medium text-muted-foreground">
                No notifications yet
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground/80">
                You will see live updates here as work orders are assigned and updated.
              </p>
            </div>
          ) : (
            notifications.map((item) => (
              <DropdownMenuItem
                key={item.id}
                onClick={() => handleNotificationClick(item.workOrderId, item.id)}
                className={`flex cursor-pointer items-start gap-2.5 p-3 text-left transition-colors ${
                  !item.isRead ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-muted/50'
                }`}
              >
                {/* Unread indicator */}
                <div className="mt-1 flex-shrink-0">
                  <span
                    className={`block size-2 rounded-full ${
                      !item.isRead ? 'bg-primary ring-2 ring-primary/20' : 'bg-transparent'
                    }`}
                    aria-hidden="true"
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-1">
                    <p className="truncate text-xs font-semibold text-foreground">
                      {item.title}
                    </p>
                    <span className="flex-shrink-0 text-[10px] text-muted-foreground">
                      {formatRelativeTime(item.createdAt)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                    {item.description}
                  </p>
                  {Boolean('reference' in item && item.reference) && (
                    <div className="mt-1 flex items-center gap-1 text-[11px] font-medium text-primary">
                      <span>{String((item as { reference?: string }).reference)}</span>
                      <ExternalLink className="size-2.5 opacity-60" aria-hidden="true" />
                    </div>
                  )}
                </div>
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
