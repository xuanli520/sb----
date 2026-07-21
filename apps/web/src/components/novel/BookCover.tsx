/* eslint-disable @next/next/no-img-element */

import { cn } from '@/app/components/ui/utils';

const managedCoverPattern = /^\/media\/covers\/[0-9a-fA-F-]{36}\.(?:png|jpg)$/;

/** Only server-generated Nginx media paths render as images; legacy CSS-color covers remain valid. */
export function isManagedBookCoverImage(cover: string | null | undefined) {
  return typeof cover === 'string' && managedCoverPattern.test(cover);
}

type BookCoverProps = {
  cover: string | null | undefined;
  title: string;
  category?: string;
  className?: string;
  showLabel?: boolean;
};

export function BookCover({ cover, title, category, className, showLabel = true }: BookCoverProps) {
  if (cover && isManagedBookCoverImage(cover)) {
    return (
      <div className={cn('relative overflow-hidden bg-stone-100', className)}>
        <img src={cover} alt={`《${title}》封面`} className="absolute inset-0 size-full object-cover" />
        {showLabel ? (
          <div className="absolute inset-0 flex flex-col justify-between bg-[linear-gradient(180deg,rgba(15,23,42,.34),rgba(15,23,42,.08)_48%,rgba(15,23,42,.78))] p-3 text-white">
            {category ? <span className="text-xs font-semibold text-white/85">{category}</span> : <span />}
            <span className="text-sm font-semibold leading-5">{title.slice(0, 4)}</span>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn('flex flex-col justify-between bg-[#476a62] p-3 text-white', className)}
      style={cover ? { backgroundColor: cover } : undefined}
      aria-label={`《${title}》颜色封面`}
    >
      {category ? <span className="text-xs font-semibold text-white/80">{category}</span> : <span />}
      {showLabel ? <span className="text-sm font-semibold leading-5">{title.slice(0, 4)}</span> : null}
    </div>
  );
}
