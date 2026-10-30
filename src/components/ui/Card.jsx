import { cn } from '@/lib/utils';

export function Card({ children, className, ...rest }) {
  return (
    <div
      className={cn('rounded-2xl border border-slate-200 bg-white p-5 shadow-sm', className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children, className }) {
  return <h3 className={cn('text-sm font-semibold text-slate-500 uppercase tracking-wide', className)}>{children}</h3>;
}

export function CardValue({ children, className }) {
  return <p className={cn('mt-2 text-2xl font-bold text-slate-900', className)}>{children}</p>;
}
