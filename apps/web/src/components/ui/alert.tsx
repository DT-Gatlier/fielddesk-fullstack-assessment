import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
export function Alert({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      role="alert"
      className={cn(
        'rounded-xl border border-input bg-card p-4 text-sm',
        className,
      )}
      {...props}
    />
  );
}
