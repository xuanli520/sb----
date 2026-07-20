'use client';

import { Toaster as Sonner, ToasterProps } from 'sonner';
import { useThemeStore } from '@/stores/themeStore';

const Toaster = ({ ...props }: ToasterProps) => {
  const { colorMode } = useThemeStore();

  return (
    <Sonner
      theme={colorMode as ToasterProps['theme']}
      className="toaster group"
      position="top-center"
      richColors
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg group-[.toaster]:rounded-xl',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton:
            'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton:
            'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
        },
        style: {
          borderRadius: '12px',
          border: '1px solid var(--border)',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
