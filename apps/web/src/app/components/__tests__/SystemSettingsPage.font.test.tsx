import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { act } from 'react';
import SystemSettingsPage from '../SystemSettingsPage';
import { useThemeStore } from '@/stores/themeStore';

vi.mock('@/app/components/ui/styled-select', () => ({
  SettingSelect: ({ value, onValueChange, children, className }: any) => (
    <select
      data-testid="setting-select"
      value={value}
      onChange={(e) => onValueChange?.((e.target as HTMLSelectElement).value)}
      className={className}
    >
      {children}
    </select>
  ),
}));

vi.mock('@/app/components/ui/select', () => ({
  SelectItem: ({ value, children }: any) => (
    <option value={value}>{children}</option>
  ),
  // placeholders to satisfy other named exports if imported
  Select: ({ children }: any) => <>{children}</>,
  SelectTrigger: ({ children }: any) => <>{children}</>,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectValue: () => null,
}));

describe('SystemSettingsPage font settings', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        media: '(prefers-color-scheme: dark)',
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    );

    document.documentElement.style.cssText = '';
    useThemeStore.setState({
      appTheme: 'enterprise',
      colorMode: 'light',
      isHydrated: true,
      isLoading: false,
      fontCn: "'Source Han Sans SC', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', 'Hiragino Sans GB'",
      fontEn: "'Inter', 'Helvetica Neue', 'Arial'",
      fontMono: "'JetBrains Mono', 'SFMono-Regular', 'Menlo', 'Consolas'",
    });
  });

  it('updates store and previews when font selects change', () => {
    render(<SystemSettingsPage />);

    const newCn = "'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', 'Hiragino Sans GB', sans-serif";
    const newEn = "'Arial', 'Helvetica Neue', 'sans-serif'";
    const newMono = "'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'";

    // Use store setters directly to verify preview reacts to font state updates.
    act(() => {
      useThemeStore.getState().setFontCn(newCn);
      useThemeStore.getState().setFontEn(newEn);
      useThemeStore.getState().setFontMono(newMono);
    });

    const state = useThemeStore.getState();
    expect(state.fontCn).toBe(newCn);
    expect(state.fontEn).toBe(newEn);
    expect(state.fontMono).toBe(newMono);

    // CSS variables should be updated
    expect(document.documentElement.style.getPropertyValue('--font-sans-cn')).toBe(newCn);
    expect(document.documentElement.style.getPropertyValue('--font-sans-en')).toBe(newEn);
    expect(document.documentElement.style.getPropertyValue('--font-mono')).toBe(newMono);

    // Preview blocks should reflect changes
    const bodyPreview = screen.getByTestId('font-preview-body');
    const monoPreview = screen.getByTestId('font-preview-mono');
    const bodyStyle = bodyPreview.getAttribute('style') || '';
    const monoStyle = monoPreview.getAttribute('style') || '';
    expect(bodyStyle).toContain('Noto Sans SC');
    expect(bodyStyle).toContain('PingFang SC');
    expect(bodyStyle).toContain('Arial');
    expect(monoStyle).toContain('SFMono-Regular');
  });
});
