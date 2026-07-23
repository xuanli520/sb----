/* eslint-disable @next/next/no-img-element */

import { useState } from 'react';
import { cn } from '@/app/components/ui/utils';

const managedCoverPattern = /^\/media\/covers\/[0-9a-fA-F-]{36}\.(?:png|jpg)$/;
const managedBannerPattern = /^\/media\/banners\/[0-9a-fA-F-]{36}\.(?:png|jpg)$/;

/** Only server-generated media paths render as images. All other values use the neutral panel. */
export function isManagedBookCoverImage(cover: string | null | undefined): cover is string {
  return typeof cover === 'string' && managedCoverPattern.test(cover);
}

/** Public home banners use the same immutable, server-generated media contract as covers. */
export function isManagedHomeBannerImage(value: string | null | undefined): value is string {
  return typeof value === 'string' && managedBannerPattern.test(value);
}

export function isManagedNovelMediaImage(value: string | null | undefined): value is string {
  return isManagedBookCoverImage(value) || isManagedHomeBannerImage(value);
}

type BookCoverProps = {
  cover: string | null | undefined;
  title: string;
  category?: string;
  className?: string;
  showLabel?: boolean;
  /** Used after a failed banner load so the work cover remains the visible fallback. */
  fallbackCover?: string | null;
  /** Banners are decorative when the slide text already names the work. */
  imageAlt?: string;
};

export function BookCover({
  cover,
  title,
  category,
  className,
  showLabel = true,
  fallbackCover,
  imageAlt,
}: BookCoverProps) {
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const imageSources = Array.from(new Set([cover, fallbackCover].filter(isManagedNovelMediaImage)));
  const imageSource = imageSources.find((source) => !failedSources.includes(source));

  if (imageSource) {
    return (
      <div className={cn('relative overflow-hidden bg-stone-100', className)}>
        <img
          key={imageSource}
          src={imageSource}
          alt={imageAlt ?? `《${title}》封面`}
          className="absolute inset-0 size-full object-cover"
          onError={() => setFailedSources((sources) => sources.includes(imageSource) ? sources : [...sources, imageSource])}
        />
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
      className={cn('flex flex-col justify-between bg-stone-200 p-3 text-stone-700', className)}
      aria-label={`《${title}》中性封面`}
    >
      {category ? <span className="text-xs font-semibold text-stone-500">{category}</span> : <span />}
      {showLabel ? <span className="text-sm font-semibold leading-5">{title.slice(0, 4)}</span> : null}
    </div>
  );
}
