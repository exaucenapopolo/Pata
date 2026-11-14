/* eslint-disable @next/next/no-img-element */
export function CategoryImage({ categoryId, image, size = 'md' }) {
  const sizes = {
    sm: 'h-10 w-10',
    md: 'h-12 w-12',
    lg: 'h-16 w-16',
    banner: 'h-40 w-full rounded-none border-0 shadow-none sm:h-52',
  };

  const isBanner = size === 'banner';
  const s = sizes[size] || sizes.md;

  return (
    <div className={`overflow-hidden bg-slate-100 ${isBanner ? s : `shrink-0 rounded-xl ${s} shadow-sm border border-slate-200`}`}>
      <img
        src={image || 'https://raw.githubusercontent.com/exaucenapopolo/Pata/refs/heads/main/illustrations/autre.jpg'}
        alt="Illustration catégorie"
        className="h-full w-full object-cover"
        loading="lazy"
      />
    </div>
  );
}
