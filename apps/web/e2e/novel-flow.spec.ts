import { expect, test } from '@playwright/test';

type ApiEnvelope<T> = { data: T };
type AccountProfile = { id: number; name: string; roles: string[] };
type AuthorBook = { id: number; title: string; author: string; status: string };
type PublicBookList = { items: Array<{ id: number; title: string }> };

const bootstrapAdministrator = {
  username: 'e2e.admin@example.test',
  password: 'e2e-bootstrap-admin-password',
};
const smtpMailboxUrl = `http://127.0.0.1:${process.env.E2E_SMTP_MAILBOX_PORT ?? '18025'}`;

type SmtpMailboxMessage = {
  recipients: string[];
  data: string;
};

async function requestEmailVerification(page: import('@playwright/test').Page, email: string, origin: string) {
  const response = await page.request.post('/api/novel/email-verification', {
    data: { email },
    headers: { Origin: origin },
  });
  expect(response.status()).toBe(200);
  return readEmailVerificationCode(page, email);
}

async function readEmailVerificationCode(page: import('@playwright/test').Page, email: string) {
  let code = '';
  await expect.poll(async () => {
    const inbox = await page.request.get(`${smtpMailboxUrl}/messages`);
    if (!inbox.ok()) return '';
    const payload = await inbox.json() as { messages?: SmtpMailboxMessage[] };
    const message = payload.messages?.find((candidate) => candidate.recipients.some((recipient) => recipient.toLowerCase() === email.toLowerCase()));
    code = message?.data.match(/\b(\d{6})\b/)?.[1] ?? '';
    return code;
  }, { timeout: 15_000, intervals: [100, 250, 500] }).toMatch(/^\d{6}$/);
  return code;
}

async function registerReader(
  page: import('@playwright/test').Page,
  email: string,
  displayName: string,
  password: string,
  origin: string,
) {
  const verificationCode = await requestEmailVerification(page, email, origin);
  return page.request.post('/api/novel/session', {
    data: { action: 'register', username: email, displayName, password, verificationCode },
    headers: { Origin: origin },
  });
}

test('reader and administrator journeys render through real BFF accounts', async ({ page }, testInfo) => {
  const origin = new URL(String(testInfo.project.use.baseURL)).origin;
  const suffix = `${Date.now().toString(36)}-${testInfo.parallelIndex}-${testInfo.retry}`;
  const readerPassword = 'reader-journey-password-2026';
  const anonymous = await page.request.get('/api/novel/admin/dashboard');
  expect(anonymous.status()).toBe(401);
  const readerSession = await registerReader(
    page,
    `reader-journey-${suffix}@example.test`,
    `读者旅程 ${suffix}`,
    readerPassword,
    origin,
  );
  expect(readerSession.status()).toBe(200);
  const csrfDenied = await page.request.post('/api/novel/account/checkin', { headers:{ Origin:'https://untrusted.example' } });
  expect(csrfDenied.status()).toBe(403);
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'编辑推荐'})).toBeVisible();
  await expect(page.getByRole('link', { name: '作家中心' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '站长中心' })).toHaveCount(0);
  await expect(page.getByLabel('书城精选').getByRole('heading', { name: '星海拾光' })).toBeVisible();
  await expect(page.getByRole('img', { name: '星海拾光的深空探索场景' })).toHaveAttribute('src', /novel-store-hero-gpt-image-2-v2/);
  await page.getByRole('link',{name:/开始阅读/}).first().click();
  await expect(page.getByRole('heading',{name:'第一章 旧港'})).toBeVisible();
  await page.getByRole('button',{name:'加入书架'}).click();
  await expect(page.getByRole('button',{name:'已加入书架'})).toBeVisible();
  await page.getByRole('button',{name:'添加书签'}).click();
  await expect(page.getByRole('status').filter({ hasText: '已添加书签' })).toBeVisible();
  await page.getByLabel('发表评论').fill('浏览器端的阅读反馈');
  await page.getByRole('button',{name:'发布'}).click();
  await expect(page.getByRole('status').filter({ hasText: '评论已发布' })).toBeVisible();
  await expect(page.getByText('浏览器端的阅读反馈').last()).toBeVisible();
  const adminSession = await page.request.post('/api/novel/session', {
    data: { action: 'login', ...bootstrapAdministrator },
    headers: { Origin: origin },
  });
  expect(adminSession.status()).toBe(200);
  await page.goto('/novel-admin');
  await expect(page.getByRole('heading',{name:'内容与运营，清晰可追溯。'})).toBeVisible();
  await expect(page.getByRole('link', { name: '站长中心' })).toBeVisible();
  await expect(page.getByRole('link', { name: '作家中心' })).toHaveCount(0);
  await expect(page.getByLabel('运营概览').getByText('活跃读者', { exact: true })).toBeVisible();
  const sensitiveWordForm = page.locator('form').filter({ has: page.getByRole('heading', { name: '敏感词库' }) });
  await sensitiveWordForm.getByRole('textbox', { name: '敏感词' }).fill('测试词条');
  await sensitiveWordForm.getByRole('button',{name:'添加'}).click();
  await expect(page.getByRole('status').filter({ hasText: '敏感词已加入审核规则' })).toBeVisible();
  await expect(page.getByText('测试词条', { exact: true })).toBeVisible();
});

test('public discovery applies catalog facets through the BFF and highlights the matched keyword', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '发现作品' })).toBeVisible();

  const categoryResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.endsWith('/api/novel/public/books')
      && url.searchParams.get('category') === '科幻'
      && response.status() === 200;
  });
  await page.getByRole('radio', { name: '科幻', exact: true }).click();
  await categoryResponse;

  const wordRangeResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.endsWith('/api/novel/public/books')
      && url.searchParams.get('category') === '科幻'
      && url.searchParams.get('minWords') === '100000'
      && url.searchParams.get('maxWords') === '299999'
      && response.status() === 200;
  });
  await page.getByRole('radio', { name: '10-30 万字', exact: true }).click();
  await wordRangeResponse;

  const catalog = page.locator('#books');
  await expect(catalog.getByRole('heading', { name: '星海拾光', exact: true })).toBeVisible();
  await expect(catalog.getByRole('heading', { name: '长安夜行录', exact: true })).toHaveCount(0);

  const searchResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.endsWith('/api/novel/public/books')
      && url.searchParams.get('q') === '星海'
      && url.searchParams.get('category') === '科幻'
      && response.status() === 200;
  });
  await page.getByRole('textbox', { name: '搜索作品、作者或关键词' }).fill('星海');
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  await searchResponse;
  await expect(catalog.locator('mark', { hasText: '星海' }).first()).toBeVisible();
});

test('mobile navigation and reader chapter directory sheets work through the BFF', async ({ page }, testInfo) => {
  const origin = new URL(String(testInfo.project.use.baseURL)).origin;
  const suffix = `${Date.now().toString(36)}-${testInfo.parallelIndex}-${testInfo.retry}`;
  await page.setViewportSize({ width: 390, height: 844 });

  const readerSession = await registerReader(
    page,
    `mobile-reader-${suffix}@example.test`,
    `移动读者 ${suffix}`,
    'mobile-reader-password-2026',
    origin,
  );
  expect(readerSession.status()).toBe(200);

  const profileResponse = page.waitForResponse((response) => response.url().endsWith('/api/novel/account/profile') && response.status() === 200);
  await page.goto('/');
  await profileResponse;
  await page.getByRole('button', { name: '打开导航菜单' }).click();
  const mobileNavigation = page.getByRole('dialog', { name: '阅界导航' });
  await expect(mobileNavigation).toBeVisible();
  await expect(mobileNavigation.getByRole('link', { name: '作家中心' })).toHaveCount(0);
  await expect(mobileNavigation.getByRole('link', { name: '站长中心' })).toHaveCount(0);
  await mobileNavigation.getByRole('link', { name: '个人中心' }).click();
  await expect(page).toHaveURL(/\/account$/);

  await page.goto('/reader/2');
  await expect(page.getByRole('heading', { name: '第一章 灯下人' })).toBeVisible();
  await page.getByRole('button', { name: '打开阅读目录' }).click();
  const chapterDirectory = page.getByRole('dialog', { name: '长安夜行录' });
  await expect(chapterDirectory).toBeVisible();
  const currentChapter = chapterDirectory.getByRole('button', { name: /第一章 灯下人/ });
  await expect(currentChapter).toHaveAttribute('aria-current', 'page');
  await currentChapter.click();

  await expect(chapterDirectory).toBeHidden();
  await expect(page.getByRole('heading', { name: '第一章 灯下人' })).toBeVisible();
});

test('a real reader is approved as an author and drafts stay out of another reader public catalog', async ({ page, browser }, testInfo) => {
  const baseURL = String(testInfo.project.use.baseURL);
  const origin = new URL(baseURL).origin;
  const suffix = `${Date.now().toString(36)}-${testInfo.parallelIndex}-${testInfo.retry}`;
  const username = `author-onboarding-${suffix}@example.test`;
  const password = 'author-onboarding-password-2026';
  const displayName = `真实读者 ${suffix}`;
  const penName = `北辰-${suffix}`;
  const title = `未公开作品-${suffix}`;

  await page.goto('/register');
  await page.getByLabel('显示名称').fill(displayName);
  await page.getByLabel('邮箱').fill(username);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByLabel('确认密码').fill(password);
  await page.getByRole('button', { name: '发送验证码' }).click();
  await expect(page.getByText('验证码已发送，请查收邮箱。')).toBeVisible();
  await page.getByLabel('邮箱验证码').fill(await readEmailVerificationCode(page, username));
  await page.getByRole('button', { name: '创建账户' }).click();
  await expect(page).toHaveURL(/\/$/);

  const registeredProfileResponse = await page.request.get('/api/novel/account/profile');
  expect(registeredProfileResponse.status()).toBe(200);
  const registeredProfile = (await registeredProfileResponse.json() as ApiEnvelope<AccountProfile>).data;
  expect(registeredProfile.name).toBe(displayName);
  expect(registeredProfile.roles).toContain('READER');
  expect(registeredProfile.roles).not.toContain('AUTHOR');

  await page.goto('/account');
  await expect(page.getByRole('heading', { name: '作者申请' })).toBeVisible();
  await page.getByLabel('创作笔名').fill(penName);
  await page.getByLabel('创作说明').fill('希望创作一部有完整世界观的科幻长篇。');
  await page.getByRole('button', { name: '提交作者申请' }).click();
  await expect(page.getByRole('status').filter({ hasText: '作者申请已提交' })).toBeVisible();
  await expect(page.getByText(`笔名「${penName}」的申请已提交`)).toBeVisible();

  const adminSession = await page.request.post('/api/novel/session', {
    data: { action: 'login', ...bootstrapAdministrator },
    headers: { Origin: origin },
  });
  expect(adminSession.status()).toBe(200);
  await page.goto('/novel-admin');
  await expect(page.getByRole('heading', { name: '创作者准入' })).toBeVisible();
  const application = page.locator('article').filter({
    has: page.getByRole('heading', { name: penName, exact: true }),
  });
  await expect(application).toBeVisible();
  await application.getByRole('button', { name: '通过', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '作者申请已通过' })).toBeVisible();
  await expect(application).toHaveCount(0);

  await page.goto('/login');
  await page.getByLabel('邮箱').fill(username);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);

  const approvedProfileResponse = await page.request.get('/api/novel/account/profile');
  expect(approvedProfileResponse.status()).toBe(200);
  const approvedProfile = (await approvedProfileResponse.json() as ApiEnvelope<AccountProfile>).data;
  expect(approvedProfile.id).toBe(registeredProfile.id);
  expect(approvedProfile.roles).toEqual(expect.arrayContaining(['READER', 'AUTHOR']));

  await page.goto('/account');
  await expect(page.getByText('申请已通过', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: '进入创作台' }).click();
  await expect(page).toHaveURL(/\/author$/);
  await expect(page.getByRole('heading', { name: '今天，写下新的章节。' })).toBeVisible();
  await page.getByLabel('作品名称').fill(title);
  await page.getByLabel('作品简介').fill('这部草稿只能由通过审核的作者在创作台内查看。');
  await page.getByRole('button', { name: '保存草稿' }).click();
  await expect(page.getByRole('status').filter({ hasText: '已保存为草稿' })).toBeVisible();

  const authorBooksResponse = await page.request.get('/api/novel/author/books');
  expect(authorBooksResponse.status()).toBe(200);
  const authorBooks = (await authorBooksResponse.json() as ApiEnvelope<AuthorBook[]>).data;
  expect(authorBooks).toEqual(expect.arrayContaining([
    expect.objectContaining({ title, author: penName, status: 'DRAFT' }),
  ]));

  const otherReaderContext = await browser.newContext({ baseURL });
  try {
    const otherReaderPage = await otherReaderContext.newPage();
    const otherReaderSession = await registerReader(
      otherReaderPage,
      `catalog-reader-${suffix}@example.test`,
      `目录读者 ${suffix}`,
      password,
      origin,
    );
    expect(otherReaderSession.status()).toBe(200);

    const publicBooksResponse = await otherReaderPage.request.get(`/api/novel/public/books?q=${encodeURIComponent(title)}`);
    expect(publicBooksResponse.status()).toBe(200);
    const publicBooks = (await publicBooksResponse.json() as ApiEnvelope<PublicBookList>).data;
    expect(publicBooks.items).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ title }),
    ]));

    await otherReaderPage.goto('/');
    await expect(otherReaderPage.getByRole('heading', { name: '编辑推荐' })).toBeVisible();
    await expect(otherReaderPage.getByText(title, { exact: true })).toHaveCount(0);
  } finally {
    await otherReaderContext.close();
  }
});
