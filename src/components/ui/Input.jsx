'use client';

import { cn } from '@/lib/utils';

export function Input({ label, error, className, id, ...rest }) {
  const inputId = id || rest.name;
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-slate-700">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={cn(
          'h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100',
          error && 'border-red-500 focus:border-red-500 focus:ring-red-100',
          className
        )}
        {...rest}
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
