import React from 'react';
import Link from 'next/link';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/app/components/ui/breadcrumb';

interface LayoutBreadcrumbItem {
  label: string;
  href?: string;
}

interface SecondaryPageLayoutProps {
  breadcrumbs: LayoutBreadcrumbItem[];
  title: string;
  children: React.ReactNode;
}

export function SecondaryPageLayout({ breadcrumbs, title, children }: SecondaryPageLayoutProps) {
  return (
    <div className="container mx-auto space-y-6 py-6">
      {breadcrumbs.length > 0 && (
        <Breadcrumb>
          <BreadcrumbList>
            {breadcrumbs.map((item, index) => (
              <React.Fragment key={`${item.label}-${index}`}>
                <BreadcrumbItem>
                  {item.href ? (
                    <BreadcrumbLink asChild>
                      <Link href={item.href}>{item.label}</Link>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>{item.label}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
                {index < breadcrumbs.length - 1 && <BreadcrumbSeparator />}
              </React.Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      )}

      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>

      {children}
    </div>
  );
}
