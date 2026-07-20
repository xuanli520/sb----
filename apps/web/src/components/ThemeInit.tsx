'use client';

import { useEffect } from 'react';
import { useThemeStore } from '@/stores/themeStore';

export function ThemeInit() {
  const { colorMode } = useThemeStore();

  useEffect(() => {
    void useThemeStore.persist.rehydrate();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (colorMode !== 'system') return;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      const state = useThemeStore.getState();
      state.setAppTheme(state.appTheme);
    };

    media.addEventListener('change', handler);
    return () => {
      media.removeEventListener('change', handler);
    };
  }, [colorMode]);

  return null;
}
