export function CategoryImage({ categoryId, image, size = 'md' }) {
  const sizes = {
    sm: 'h-10 w-10',
    md: 'h-12 w-12',
    lg: 'h-16 w-16',
  };
  
  const s = sizes[size] || sizes.md;

  return (
    <div className={`shrink-0 overflow-hidden rounded-xl bg-slate-100 ${s} shadow-sm border border-slate-200`}>
      <img
        src={image || 'https://raw.githubusercontent.com/exaucenapopolo/Pata/refs/heads/main/illustrations/autre.jpg'}
        alt="Illustration catégorie"
        className="h-full w-full object-cover"
        loading="lazy"
      />
    </div>
  );
        }
