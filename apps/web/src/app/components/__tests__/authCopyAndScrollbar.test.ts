import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function readText(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('auth pages localized copy', () => {
  it('uses Chinese copy in login and register views', () => {
    const loginPage = readText('src/app/components/LoginPage.tsx');
    const registerPage = readText('src/app/components/RegisterPage.tsx');
    const loginRoutePage = readText('src/app/(auth)/login/page.tsx');

    expect(loginPage).not.toContain('Identity / Email');
    expect(loginPage).not.toContain('Security / Password');
    expect(loginPage).not.toContain('SYSTEM OPERATIONAL 99.9%');
    expect(loginPage).toContain('系统运行状态 99.9%');

    expect(registerPage).not.toContain('Identity / Username');
    expect(registerPage).not.toContain('Email / Contact');
    expect(registerPage).not.toContain('Security / Password');
    expect(registerPage).not.toContain('Confirm / Password');
    expect(registerPage).not.toContain('your@email.com');
    expect(registerPage).not.toContain('SYSTEM OPERATIONAL 99.9%');
    expect(registerPage).toContain('系统运行状态 99.9%');

    expect(loginRoutePage).not.toContain('Loading...');
    expect(loginRoutePage).toContain('正在登录...');
  });
});

describe('global scrollbar theme', () => {
  it('applies sidebar scrollbar style to themed global scrollbars', () => {
    const cyberpunkTheme = readText('src/styles/themes/cyberpunk.css');
    const enterpriseTheme = readText('src/styles/themes/enterprise.css');
    const dashboardPage = readText('src/app/(main)/dashboard/page.tsx');
    const compassPage = readText('src/app/(main)/compass/page.tsx');
    const metricDetailPage = readText('src/app/(main)/metric-detail/page.tsx');
    const metricCard = readText('src/components/dashboard/MetricCard.tsx');
    const userFormDialog = readText('src/app/components/UserFormDialog.tsx');

    expect(cyberpunkTheme).toContain(':root[data-theme="cyberpunk"] *::-webkit-scrollbar');
    expect(enterpriseTheme).toContain(':root[data-theme="enterprise"] *::-webkit-scrollbar');

    expect(dashboardPage).not.toContain('scrollbar-none');
    expect(compassPage).not.toContain('scrollbar-none');
    expect(metricDetailPage).not.toContain('no-scrollbar');
    expect(metricCard).not.toContain('custom-scrollbar');
    expect(userFormDialog).not.toContain('custom-scrollbar');
  });
});
