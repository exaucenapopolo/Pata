import { cn } from '@/lib/utils';

export function Card({ children, className, ...rest }) {
  return (
    <div
      className={cn('rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm sm:p-5', className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children, className }) {
  return <h3 className={cn('text-xs font-semibold text-slate-500 uppercase tracking-wide sm:text-sm', className)}>{children}</h3>;
}

export function CardValue({ children, className }) {
  return <p className={cn('mt-1.5 text-xl font-bold text-slate-900 sm:mt-2 sm:text-2xl', className)}>{children}</p>;
}
