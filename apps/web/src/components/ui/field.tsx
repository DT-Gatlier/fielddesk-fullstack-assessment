import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
interface FieldProps extends ComponentProps<'div'> {
  label?: string;
  error?: string;
}

export function Field({ className, label, error, children, ...props }: FieldProps) {
  return (
    <div className={cn('space-y-1.5', className)} {...props}>
      {label && <label className="block text-sm font-medium">{label}</label>}
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function FieldLabel({ className, ...props }: ComponentProps<'label'>) {
  return (
    <label className={cn('block text-sm font-medium', className)} {...props} />
  );
}

export function FieldError({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('text-sm text-destructive', className)} {...props} />;
}
