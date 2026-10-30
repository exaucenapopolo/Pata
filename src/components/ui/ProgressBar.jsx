import { cn } from '@/lib/utils';

export function ProgressBar({ value = 0, color = '#10b981', className }) {
  const safe = Math.min(100, Math.max(0, value));
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-slate-100', className)}>
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${safe}%`, backgroundColor: color }}
      />
    </div>
  );
}
