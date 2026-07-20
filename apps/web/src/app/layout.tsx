import '../styles/index.css';
import '../styles/themes/enterprise.css';
import '../styles/themes/cyberpunk.css';
import type { Metadata } from 'next';
import { Providers } from "./providers"
import { ErrorBoundary } from '@/lib/error/boundary';
import { UserProvider } from '@/stores/userStore';
import { ThemeInit } from '@/components/ThemeInit';

export const metadata: Metadata = {
  title: '阅界小说平台',
  description: '读者、作者与运营一体化小说平台',
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning data-theme="enterprise">
      <body>
        <ThemeInit />
        <ErrorBoundary>
          <Providers>
            <UserProvider>
              {children}
            </UserProvider>
          </Providers>
        </ErrorBoundary>
      </body>
    </html>
  );
}
