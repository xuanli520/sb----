import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeTheme, useThemeStore } from '@/stores/themeStore';

describe('themeStore', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.classList.remove('dark');
    document.documentElement.style.cssText = '';
    useThemeStore.setState({
      appTheme: 'enterprise',
      colorMode: 'system',
      isHydrated: false,
      fontCn: "'Source Han Sans SC', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', 'Hiragino Sans GB'",
      fontEn: "'Inter', 'Helvetica Neue', 'Arial'",
      fontMono: "'JetBrains Mono', 'SFMono-Regular', 'Menlo', 'Consolas'",
    });
  });

  it('applies dark mode for enterprise', () => {
    useThemeStore.getState().setAppTheme('enterprise');
    useThemeStore.getState().setColorMode('dark');

    expect(document.documentElement.getAttribute('data-theme')).toBe('enterprise');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('applies dark mode for cyberpunk', () => {
    useThemeStore.getState().setAppTheme('cyberpunk');
    useThemeStore.getState().setColorMode('dark');

    expect(document.documentElement.getAttribute('data-theme')).toBe('cyberpunk');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('uses system mode when colorMode=system', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: true,
        media: '(prefers-color-scheme: dark)',
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    );

    useThemeStore.getState().setAppTheme('enterprise');
    useThemeStore.getState().setColorMode('system');

    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('updates font variables when fonts are changed', () => {
    const cn = "'Test CN'";
    const en = "'Test EN'";
    const mono = "'Test Mono'";

    useThemeStore.getState().setFontCn(cn);
    useThemeStore.getState().setFontEn(en);
    useThemeStore.getState().setFontMono(mono);

    const style = document.documentElement.style;
    expect(style.getPropertyValue('--font-sans-cn').trim()).toBe(cn);
    expect(style.getPropertyValue('--font-sans-en').trim()).toBe(en);
    expect(style.getPropertyValue('--font-mono').trim()).toBe(mono);
    expect(style.getPropertyValue('--font-sans')).toContain(cn);
    expect(style.getPropertyValue('--font-sans')).toContain(en);
  });
});

describe('themeStore hydration', () => {
  it('sets isHydrated true after rehydrate', async () => {
    useThemeStore.setState({ isHydrated: false });
    await useThemeStore.persist.rehydrate();
    expect(useThemeStore.getState().isHydrated).toBe(true);
  });

  it('applies default fonts on initializeTheme', () => {
    document.documentElement.style.cssText = '';
    useThemeStore.setState({
      fontCn: 'CN',
      fontEn: 'EN',
      fontMono: 'MONO',
      appTheme: 'enterprise',
      colorMode: 'light',
      isHydrated: true,
      isLoading: false,
    });
    initializeTheme();
    const style = document.documentElement.style;
    expect(style.getPropertyValue('--font-sans-cn')).toBe('CN');
    expect(style.getPropertyValue('--font-sans-en')).toBe('EN');
    expect(style.getPropertyValue('--font-mono')).toBe('MONO');
    expect(style.getPropertyValue('--font-sans')).toContain('CN');
    expect(style.getPropertyValue('--font-sans')).toContain('EN');
  });
});
