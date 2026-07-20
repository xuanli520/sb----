import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AppTheme = 'enterprise' | 'cyberpunk';
export type ColorMode = 'light' | 'dark' | 'system';
export interface FontSettings {
  fontCn: string;
  fontEn: string;
  fontMono: string;
}

interface ThemeState {
  appTheme: AppTheme;
  colorMode: ColorMode;
  fontCn: string;
  fontEn: string;
  fontMono: string;
  isHydrated: boolean;
  isLoading: boolean;
  setHydrated: (hydrated: boolean) => void;
  setAppTheme: (theme: AppTheme) => void;
  setColorMode: (mode: ColorMode) => void;
  setFontCn: (font: string) => void;
  setFontEn: (font: string) => void;
  setFontMono: (font: string) => void;
  toggleEasterEgg: () => void;
  isEnterprise: () => boolean;
  isCyberpunk: () => boolean;
}

const DEFAULT_FONTS: FontSettings = {
  fontCn: "'Source Han Sans SC', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', 'Hiragino Sans GB'",
  fontEn: "'Inter', 'Helvetica Neue', 'Arial'",
  fontMono: "'JetBrains Mono', 'SFMono-Regular', 'Menlo', 'Consolas'",
};

const resolveColorMode = (colorMode: ColorMode) => {
  if (colorMode === 'system') {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  }
  return colorMode;
};

const applyFontsToDOM = (fonts: FontSettings) => {
  if (typeof document === 'undefined') return;
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty('--font-sans-cn', fonts.fontCn);
  rootStyle.setProperty('--font-sans-en', fonts.fontEn);
  rootStyle.setProperty('--font-mono', fonts.fontMono);
  rootStyle.setProperty('--font-sans', `${fonts.fontCn}, ${fonts.fontEn}, sans-serif`);
};

const applyThemeToDOM = (appTheme: AppTheme, colorMode: ColorMode, fonts: FontSettings) => {
  if (typeof window === 'undefined') return;

  const root = document.documentElement;
  root.setAttribute('data-theme', appTheme);
  const resolved = resolveColorMode(colorMode);
  root.classList.toggle('dark', resolved === 'dark');
  applyFontsToDOM(fonts);
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      appTheme: 'enterprise',
      colorMode: 'system',
      fontCn: DEFAULT_FONTS.fontCn,
      fontEn: DEFAULT_FONTS.fontEn,
      fontMono: DEFAULT_FONTS.fontMono,
      isHydrated: false,
      isLoading: true,
      setHydrated: (hydrated) => set({ isHydrated: hydrated, isLoading: !hydrated }),

      setAppTheme: (appTheme) => {
        set({ appTheme });
        applyThemeToDOM(appTheme, get().colorMode, {
          fontCn: get().fontCn,
          fontEn: get().fontEn,
          fontMono: get().fontMono,
        });
      },

      setColorMode: (colorMode) => {
        set({ colorMode });
        applyThemeToDOM(get().appTheme, colorMode, {
          fontCn: get().fontCn,
          fontEn: get().fontEn,
          fontMono: get().fontMono,
        });
      },

      setFontCn: (fontCn) => {
        set({ fontCn });
        applyFontsToDOM({ fontCn, fontEn: get().fontEn, fontMono: get().fontMono });
      },
      setFontEn: (fontEn) => {
        set({ fontEn });
        applyFontsToDOM({ fontCn: get().fontCn, fontEn, fontMono: get().fontMono });
      },
      setFontMono: (fontMono) => {
        set({ fontMono });
        applyFontsToDOM({ fontCn: get().fontCn, fontEn: get().fontEn, fontMono });
      },

      toggleEasterEgg: () => {
        const currentTheme = get().appTheme;
        const newTheme = currentTheme === 'enterprise' ? 'cyberpunk' : 'enterprise';
        set({ appTheme: newTheme });
        applyThemeToDOM(newTheme, get().colorMode, {
          fontCn: get().fontCn,
          fontEn: get().fontEn,
          fontMono: get().fontMono,
        });
      },

      isEnterprise: () => get().appTheme === 'enterprise',
      isCyberpunk: () => get().appTheme === 'cyberpunk',
    }),
    {
      name: 'app-theme-storage',
      partialize: (state) => ({
        appTheme: state.appTheme,
        colorMode: state.colorMode,
        fontCn: state.fontCn,
        fontEn: state.fontEn,
        fontMono: state.fontMono,
      }),
      onRehydrateStorage: () => () => {
        const state = useThemeStore.getState();
        state.setHydrated(true);
        applyThemeToDOM(state.appTheme, state.colorMode, {
          fontCn: state.fontCn,
          fontEn: state.fontEn,
          fontMono: state.fontMono,
        });
      },
    }
  )
);

export const initializeTheme = () => {
  const state = useThemeStore.getState();
  applyThemeToDOM(state.appTheme, state.colorMode, {
    fontCn: state.fontCn,
    fontEn: state.fontEn,
    fontMono: state.fontMono,
  });
};
