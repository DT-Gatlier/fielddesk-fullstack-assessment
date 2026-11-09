import React from 'react';
import { cn } from '../../lib/utils';
import { AlertCircle, CheckCircle2, Info, XCircle } from 'lucide-react';

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'info' | 'success' | 'warning' | 'danger';
  title?: string;
}

export const Alert: React.FC<AlertProps> = ({
  className,
  variant = 'info',
  title,
  children,
  ...props
}) => {
  const styles = {
    info: {
      container: 'bg-sky-50 border-sky-200 text-sky-800',
      icon: <Info className="h-5 w-5 text-sky-500 shrink-0" />,
    },
    success: {
      container: 'bg-emerald-50 border-emerald-200 text-emerald-800',
      icon: <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />,
    },
    warning: {
      container: 'bg-amber-50 border-amber-200 text-amber-800',
      icon: <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />,
    },
    danger: {
      container: 'bg-rose-50 border-rose-200 text-rose-800',
      icon: <XCircle className="h-5 w-5 text-rose-500 shrink-0" />,
    },
  };

  const current = styles[variant];

  return (
    <div
      role="alert"
      className={cn('flex items-start gap-3 rounded-lg border p-4 text-sm', current.container, className)}
      {...props}
    >
      {current.icon}
      <div className="space-y-0.5">
        {title && <h5 className="font-semibold leading-tight">{title}</h5>}
        <div className="text-sm opacity-90">{children}</div>
      </div>
    </div>
  );
};

