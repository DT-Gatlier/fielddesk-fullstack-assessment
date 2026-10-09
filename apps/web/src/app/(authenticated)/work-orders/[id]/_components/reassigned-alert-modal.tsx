'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ReassignedAlertModalProps {
  open: boolean;
  reference?: string;
  onNavigateHome?: () => void;
}

export function ReassignedAlertModal({
  open,
  reference,
  onNavigateHome,
}: ReassignedAlertModalProps) {
  const router = useRouter();
  const [countdown, setCountdown] = React.useState(5);

  const handleGoHome = React.useCallback(() => {
    if (onNavigateHome) {
      onNavigateHome();
    } else {
      router.push('/work-orders');
    }
  }, [onNavigateHome, router]);

  React.useEffect(() => {
    if (!open) {
      return;
    }

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleGoHome();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [open, handleGoHome]);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
            <AlertTriangle className="size-5" />
          </div>
          <DialogHeader className="mb-0">
            <DialogTitle className="text-lg">Work Order Reassigned</DialogTitle>
            <DialogDescription className="text-xs">
              Assignment access updated by dispatcher
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-foreground">
          <p>
            The owner/dispatcher has reassigned{' '}
            <strong className="font-semibold text-primary">
              {reference ? `work order ${reference}` : 'this work order'}
            </strong>{' '}
            to another technician.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            You no longer have permission to view or modify this task.
          </p>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Redirecting automatically:</span>
          <span className="font-mono font-semibold text-foreground bg-muted px-2 py-0.5 rounded">
            {countdown}s
          </span>
        </div>

        <DialogFooter className="mt-4">
          <Button onClick={handleGoHome} className="w-full sm:w-auto">
            <span>Go to Work Orders</span>
            <ArrowRight className="size-4 ml-1.5" />
          </Button>
        </DialogFooter>
      </div>
    </Dialog>
  );
}
