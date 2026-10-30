'use client';

import { cn } from '@/lib/utils';

export function Button({
  children, variant = 'primary', size = 'md',
  className, disabled, type = 'button', ...rest
}) {
  const variants = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-300',
    secondary: 'bg-slate-100 text-slate-800 hover:bg-slate-200 disabled:opacity-50',
    ghost: 'bg-transparent text-slate-700 hover:bg-slate-100',
    danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300',
    outline: 'border border-slate-300 text-slate-700 hover:bg-slate-50',
  };
  const sizes = {
    sm: 'h-8 px-3 text-sm',
    md: 'h-10 px-4 text-sm',
    lg: 'h-12 px-6 text-base',
  };
  return (
    <button
      type={type}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed',
        variants[variant], sizes[size], className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
