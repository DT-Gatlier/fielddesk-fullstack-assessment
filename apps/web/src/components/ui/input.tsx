import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return (
    <input
      data-slot="input"
      type={type}
      className={cn(
        'h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base placeholder:text-muted-foreground disabled:opacity-50 md:text-sm',
        className,
      )}
      {...props}
    />
  );
}
