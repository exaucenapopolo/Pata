export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/90 px-6 py-10 text-center shadow-[0_2px_10px_rgba(7,91,67,.035)] sm:py-12">
      {Icon && (
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
          <Icon size={23} strokeWidth={1.9} aria-hidden="true" />
        </span>
      )}
      <h3 className="text-sm font-bold tracking-tight text-slate-900 sm:text-base">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-xs leading-5 text-slate-500 sm:text-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
