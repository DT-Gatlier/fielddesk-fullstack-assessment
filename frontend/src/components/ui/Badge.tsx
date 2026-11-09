import React from 'react';
import { cn } from '../../lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'emerald' | 'blue' | 'amber' | 'rose' | 'slate' | 'purple';
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({
  className,
  variant = 'slate',
  size = 'md',
  children,
  ...props
}) => {
  const variants = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-600/20',
    blue: 'bg-sky-50 text-sky-700 border-sky-200 ring-sky-600/20',
    amber: 'bg-amber-50 text-amber-700 border-amber-200 ring-amber-600/20',
    rose: 'bg-rose-50 text-rose-700 border-rose-200 ring-rose-600/20',
    slate: 'bg-slate-100 text-slate-700 border-slate-200 ring-slate-600/20',
    purple: 'bg-purple-50 text-purple-700 border-purple-200 ring-purple-600/20',
  };

  const sizes = {
    sm: 'px-2 py-0.5 text-xs font-semibold',
    md: 'px-2.5 py-1 text-xs font-bold uppercase tracking-wider',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border ring-1 ring-inset',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
};

