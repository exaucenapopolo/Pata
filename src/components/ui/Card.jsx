import { cn } from '@/lib/utils';

export function Card({ children, className, ...rest }) {
  return (
    <div className={cn(
      'min-w-0 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_2px_12px_rgba(7,91,67,0.055)] sm:p-5',
      className
    )} {...rest}>
      {children}
    </div>
  );
}
export function CardTitle({ children, className }) {
  return <h3 className={cn('text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500 sm:text-xs', className)}>{children}</h3>;
}
export function CardValue({ children, className }) {
  return <p className={cn('mt-1.5 text-xl font-bold tracking-tight text-slate-900 sm:mt-2 sm:text-2xl', className)}>{children}</p>;
}
