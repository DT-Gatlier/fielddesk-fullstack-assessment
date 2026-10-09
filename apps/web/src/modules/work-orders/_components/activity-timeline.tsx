'use client';

import * as React from 'react';
import {
  CheckCircle2,
  Clock,
  MessageSquare,
  Play,
  RotateCcw,
  User as UserIcon,
} from 'lucide-react';
import type { WorkOrderEventResDto, WorkOrderEventType } from '../_api/api.types';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface ActivityTimelineProps {
  events: WorkOrderEventResDto[] | undefined;
  isLoading: boolean;
}

function getEventBadge(type: WorkOrderEventType) {
  switch (type) {
    case 'WORK_STARTED':
      return (
        <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 gap-1 font-medium">
          <Play className="size-3" />
          Work Started
        </Badge>
      );
    case 'WORK_COMPLETED':
      return (
        <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 gap-1 font-medium">
          <CheckCircle2 className="size-3" />
          Completed
        </Badge>
      );
    case 'STATUS_CHANGED':
      return (
        <Badge className="bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30 gap-1 font-medium">
          <RotateCcw className="size-3" />
          Status Changed
        </Badge>
      );
    case 'NOTE_ADDED':
    default:
      return (
        <Badge variant="outline" className="gap-1 font-medium text-foreground/80">
          <MessageSquare className="size-3" />
          Progress Note
        </Badge>
      );
  }
}

function formatRelativeTimestamp(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    return new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  } catch {
    return isoDate;
  }
}

export function ActivityTimeline({ events, isLoading }: ActivityTimelineProps) {
  if (isLoading) {
    return (
      <div className="space-y-4 pt-2">
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    );
  }

  if (!events || events.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        <Clock className="mx-auto size-6 mb-2 opacity-60" />
        <p className="font-medium text-foreground/80">No activity recorded yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Progress events and status transitions will appear here in chronological order.
        </p>
      </div>
    );
  }

  // Chronological display with newest at top or bottom (newest first for quick status check)
  const sortedEvents = [...events].reverse();

  return (
    <ol className="relative border-l border-border/80 ml-3 space-y-6">
      {sortedEvents.map((event) => {
        const payload =
          event.payload && typeof event.payload === 'object'
            ? (event.payload as { note?: unknown; status?: unknown })
            : {};
        const noteText = typeof payload.note === 'string' ? payload.note.trim() : '';
        const statusText = typeof payload.status === 'string' ? payload.status.trim() : '';
        const hasNote = noteText.length > 0;
        const hasStatus = statusText.length > 0;

        return (
          <li key={event.id} className="ml-6 group">
            {/* Timeline node icon indicator */}
            <span className="absolute -left-3 flex size-6 items-center justify-center rounded-full border border-border bg-card ring-4 ring-background text-muted-foreground group-hover:border-primary group-hover:text-primary transition-colors">
              <span className="size-2 rounded-full bg-primary" />
            </span>

            <div className="flex flex-col gap-1.5 rounded-lg border border-border/70 bg-card p-4 transition-all hover:border-border">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {getEventBadge(event.type)}
                  {hasStatus && (
                    <span className="text-xs font-mono font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      → {statusText.toLowerCase().replace('_', ' ')}
                    </span>
                  )}
                </div>
                <time className="text-xs text-muted-foreground">
                  {formatRelativeTimestamp(event.occurredAt)}
                </time>
              </div>

              {hasNote && (
                <p className="mt-1 text-sm whitespace-pre-wrap leading-relaxed text-foreground/90 bg-muted/30 p-2.5 rounded-md border border-border/40">
                  {noteText}
                </p>
              )}

              <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <UserIcon className="size-3" />
                <span className="font-medium text-foreground/80">{event.user.name}</span>
                <span className="text-muted-foreground/60">({event.user.role.toLowerCase()})</span>
                <span className="text-muted-foreground/40">•</span>
                <span className="font-mono text-[10px] text-muted-foreground/70" title={`ID: ${event.eventId}`}>
                  {event.eventId}
                </span>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
