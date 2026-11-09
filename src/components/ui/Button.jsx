'use client';
import { cn } from '@/lib/utils';

export function Button({ children, variant = 'primary', size = 'md', className, disabled, type = 'button', ...rest }) {
  const variants = {
    primary: 'bg-[#075b43] text-white shadow-sm hover:bg-[#064b38] hover:shadow-md focus-visible:ring-2 focus-visible:ring-[#34a779] focus-visible:ring-offset-2 disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none',
    secondary: 'border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2 disabled:opacity-50',
    ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2 disabled:opacity-50',
    danger: 'bg-[#a63835] text-white shadow-sm hover:bg-[#8f2d2b] focus-visible:ring-2 focus-visible:ring-red-300 focus-visible:ring-offset-2 disabled:opacity-50',
    outline: 'border border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2 disabled:opacity-50',
  };
  const sizes = { sm: 'min-h-9 px-3 text-xs', md: 'min-h-10 px-4 text-sm', lg: 'min-h-11 px-5 text-sm sm:min-h-12 sm:px-6' };
  return (
    <button type={type} disabled={disabled}
      className={cn('inline-flex items-center justify-center gap-2 rounded-xl font-semibold tracking-[-0.01em] transition-all duration-150 active:scale-[0.98] focus-visible:outline-none disabled:cursor-not-allowed disabled:active:scale-100',
        variants[variant] || variants.primary, sizes[size] || sizes.md, className)} {...rest}>
      {children}
    </button>
  );
}
