import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback, useMemo } from 'react';

export type QueryCodec<T> = {
  parse: (sp: URLSearchParams) => T;
  serialize: (state: T) => Record<string, string | undefined>;
  resetPageOnChangeKeys?: (keyof T)[];
};

export function useQueryState<T>(codec: QueryCodec<T>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const state = useMemo(() => codec.parse(searchParams), [searchParams, codec]);

  const setState = useCallback(
    (newState: Partial<T> | ((prev: T) => Partial<T>), opts?: { resetPage?: boolean }) => {
      const current = codec.parse(searchParams);
      const nextPartial = typeof newState === 'function' ? newState(current) : newState;
      const next = { ...current, ...nextPartial };

      // Check if we need to reset page
      let shouldResetPage = opts?.resetPage;
      
      if (shouldResetPage === undefined && codec.resetPageOnChangeKeys) {
        // Auto-detect if watched keys changed
        const currentSerialized = codec.serialize(current);
        const nextSerialized = codec.serialize(next);
        
        shouldResetPage = codec.resetPageOnChangeKeys.some(key => {
           // We compare the serialized values of the keys
           // This assumes simple string/undefined values in the serialized record
           return currentSerialized[key as string] !== nextSerialized[key as string];
        });
      }

      if (shouldResetPage) {
        // Assume 'page' is the key for pagination, reset to 1
        // This requires T to likely have a 'page' field or we force it in the serialized output
        (next as any).page = 1;
      }

      const serialized = codec.serialize(next);
      const newSearchParams = new URLSearchParams();

      Object.entries(serialized).forEach(([key, value]) => {
        if (value !== undefined && value !== '' && value !== null) {
          newSearchParams.set(key, value);
        }
      });

      router.push(`${pathname}?${newSearchParams.toString()}`);
    },
    [router, pathname, searchParams, codec]
  );

  return [state, setState] as const;
}
