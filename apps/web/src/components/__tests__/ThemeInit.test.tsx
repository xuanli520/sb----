import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { ThemeInit } from '@/components/ThemeInit';
import { useThemeStore } from '@/stores/themeStore';

describe('ThemeInit', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.classList.remove('dark');
  });

  it('rehydrates and applies theme on mount', async () => {
    useThemeStore.setState({ appTheme: 'cyberpunk', colorMode: 'dark', isHydrated: false, isLoading: true });

    render(<ThemeInit />);

    expect(document.documentElement.getAttribute('data-theme')).toBe('cyberpunk');
  });

  it('listens to system theme when colorMode=system', () => {
    const add = vi.fn();
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        media: '(prefers-color-scheme: dark)',
        onchange: null,
        addEventListener: add,
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    );

    useThemeStore.setState({ appTheme: 'cyberpunk', colorMode: 'system', isHydrated: true, isLoading: false });

    render(<ThemeInit />);

    expect(add).toHaveBeenCalled();
  });
});
