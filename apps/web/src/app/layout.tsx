import '../styles/index.css';
import type { Metadata } from 'next';
import { Providers } from './providers';
import { ErrorBoundary } from '@/lib/error/boundary';

export const metadata: Metadata = {
  title: '阅界小说平台',
  description: '读者、作者与运营一体化小说平台',
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <ErrorBoundary>
          <Providers>
            {children}
          </Providers>
        </ErrorBoundary>
      </body>
    </html>
  );
}
