import { expect, test } from '@playwright/test';

type ApiEnvelope<T> = { data: T };
type AccountProfile = { id: number; name: string; roles: string[] };
type AuthorBook = { id: number; title: string; author: string; status: string };
type AuthorBookPage = { items: AuthorBook[] };
type PublicBookList = { items: Array<{ id: number; title: string }> };

const bootstrapAdministrator = {
  username: 'e2e.admin@example.test',
  password: 'e2e-bootstrap-admin-password',
};
const activatedBootstrapAdministrator = {
  username: bootstrapAdministrator.username,
  password: 'e2e-bootstrap-admin-password-updated',
};
const smtpMailboxUrl = `http://127.0.0.1:${process.env.E2E_SMTP_MAILBOX_PORT ?? '18025'}`;

type SmtpMailboxMessage = {
  recipients: string[];
  data: string;
};

function mailboxText(message: string) {
  const separator = message.search(/\r?\n\r?\n/);
  if (separator < 0) return message;
  const headers = message.slice(0, separator);
  const body = message.slice(separator).replace(/^\r?\n\r?\n/, '');
  if (/^content-transfer-encoding:\s*base64\s*$/im.test(headers)) {
    return Buffer.from(body.replace(/\s/g, ''), 'base64').toString('utf8');
  }
  if (/^content-transfer-encoding:\s*quoted-printable\s*$/im.test(headers)) {
    const unfolded = body.replace(/=\r?\n/g, '');
    const bytes = unfolded.replace(/=([0-9a-f]{2})/gi, (_match, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
    return Buffer.from(bytes, 'latin1').toString('utf8');
  }
  return body;
}

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
    code = message ? mailboxText(message.data).match(/\b(\d{6})\b/)?.[1] ?? '' : '';
    return code;
  }, { timeout: 15_000, intervals: [100, 250, 500] }).toMatch(/^\d{6}$/);
  return code;
}

async function readMailboxMessage(page: import('@playwright/test').Page, email: string) {
  let message: SmtpMailboxMessage | undefined;
  await expect.poll(async () => {
    const inbox = await page.request.get(`${smtpMailboxUrl}/messages`);
    if (!inbox.ok()) return false;
    const payload = await inbox.json() as { messages?: SmtpMailboxMessage[] };
    message = payload.messages?.find((candidate) => candidate.recipients.some((recipient) => recipient.toLowerCase() === email.toLowerCase()));
    return Boolean(message);
  }, { timeout: 15_000, intervals: [100, 250, 500] }).toBe(true);
  if (!message) throw new Error('SMTP mailbox did not return the expected message');
  return message;
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

async function loginAdministrator(page: import('@playwright/test').Page, origin: string) {
  let response = await page.request.post('/api/novel/session', {
    data: { action: 'login', ...bootstrapAdministrator },
    headers: { Origin: origin },
  });
  if (response.status() === 401) {
    response = await page.request.post('/api/novel/session', {
      data: { action: 'login', ...activatedBootstrapAdministrator },
      headers: { Origin: origin },
    });
    expect(response.status()).toBe(200);
    return response;
  }
  expect(response.status()).toBe(200);
  const payload = await response.json() as { data?: { user?: { passwordChangeRequired?: boolean } } };
  if (!payload.data?.user?.passwordChangeRequired) return response;

  const csrfToken = (await page.context().cookies()).find((cookie) => cookie.name === 'novel_csrf')?.value;
  expect(csrfToken).toMatch(/^[A-Za-z0-9_-]{32}$/);

  const passwordChange = await page.request.put('/api/novel/account/password', {
    data: {
      currentPassword: bootstrapAdministrator.password,
      newPassword: activatedBootstrapAdministrator.password,
    },
    headers: { Origin: origin, 'X-Novel-Csrf': csrfToken! },
  });
  expect(passwordChange.status()).toBe(200);
  response = await page.request.post('/api/novel/session', {
    data: { action: 'login', ...activatedBootstrapAdministrator },
    headers: { Origin: origin },
  });
  expect(response.status()).toBe(200);
  return response;
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
  await expect(page.getByRole('heading',{name:'首页精选'})).toBeVisible();
  await expect(page.getByRole('link', { name: '作家中心' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '站长中心' })).toHaveCount(0);
  await expect(page.getByLabel('书城精选').getByRole('heading', { name: '星海拾光' })).toBeVisible();
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
  await page.goto('/novel-admin');
  await expect(page.getByRole('heading', { name: 'SMTP 邮件服务' })).toHaveCount(0);
  await loginAdministrator(page, origin);
  await page.goto('/novel-admin');
  await expect(page.getByRole('heading',{name:'工作台'})).toBeVisible();
  await expect(page.getByRole('link', { name: '站长中心' })).toBeVisible();
  await expect(page.getByRole('link', { name: '作家中心' })).toHaveCount(0);
  await expect(page.getByLabel('运营概览').getByText('活跃读者', { exact: true })).toBeVisible();
  await page.goto('/novel-admin/content/words');
  const sensitiveWordForm = page.locator('form').filter({ has: page.getByRole('heading', { name: '敏感词库' }) });
  await sensitiveWordForm.getByRole('textbox', { name: '敏感词', exact: true }).fill('测试词条');
  await sensitiveWordForm.getByRole('button',{name:'添加'}).click();
  await expect(page.getByRole('status').filter({ hasText: '敏感词已加入审核规则' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '敏感词 测试词条' })).toHaveValue('测试词条');
});

test('the super administrator saves SMTP settings and receives a real verification delivery', async ({ page }, testInfo) => {
  const origin = new URL(String(testInfo.project.use.baseURL)).origin;
  const suffix = `${Date.now().toString(36)}-${testInfo.parallelIndex}-${testInfo.retry}`;
  const recipient = `smtp-verification-${suffix}@example.test`;
  const smtpPort = process.env.E2E_SMTP_PORT ?? '11025';
  await loginAdministrator(page, origin);

  await page.goto('/novel-admin/settings/email');
  await expect(page.getByRole('heading', { name: 'SMTP 邮件服务' })).toBeVisible();
  await page.getByLabel('SMTP 主机').fill('127.0.0.1');
  await page.getByLabel('SMTP 端口').fill(smtpPort);
  await page.getByLabel('SMTP 发件人地址').fill('e2e-mailer@example.test');
  await page.getByLabel('SMTP 用户名').fill('e2e-mailer');
  await page.getByLabel('SMTP 密码或授权码').fill('e2e-smtp-test-password');
  await page.getByLabel('验证码哈希密钥').fill('e2e-email-verification-hmac-secret');
  await page.getByLabel('SMTP 变更说明').fill('端到端验证 SMTP 配置保存和投递');
  await page.getByRole('button', { name: '保存邮件服务' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'SMTP 邮件服务已保存，敏感凭据未回显。' })).toBeVisible();
  await expect(page.getByText('超级管理员配置', { exact: true })).toBeVisible();

  await page.getByLabel('验证收件人').fill(recipient);
  await page.getByRole('button', { name: '发送验证邮件' }).click();
  await expect(page.getByRole('status').filter({ hasText: `验证邮件已发送至 ${recipient}。` })).toBeVisible();
  const message = await readMailboxMessage(page, recipient);
  expect(mailboxText(message.data)).toContain('站长已验证当前 SMTP 邮件服务配置。');
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

test('bookstore stays within narrow viewports and keeps carousel controls clear of reading actions', async ({ page }, testInfo) => {
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '首页精选' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '发现作品' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    const carousel = page.getByRole('region', { name: '书城精选' });
    await expect(carousel).toBeVisible();
    const readAction = carousel.getByRole('link', { name: /开始阅读/ }).first();
    const next = carousel.getByRole('button', { name: '下一张幻灯片' });
    const [readBox, nextBox] = await Promise.all([readAction.boundingBox(), next.boundingBox()]);
    expect(readBox).not.toBeNull();
    expect(nextBox).not.toBeNull();
    if (readBox && nextBox) {
      const overlaps = readBox.x < nextBox.x + nextBox.width
        && readBox.x + readBox.width > nextBox.x
        && readBox.y < nextBox.y + nextBox.height
        && readBox.y + readBox.height > nextBox.y;
      expect(overlaps).toBe(false);
    }

    await page.screenshot({ path: testInfo.outputPath(`bookstore-${viewport.width}.png`), fullPage: true });
  }
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
  await page.getByLabel('邮箱', { exact: true }).fill(username);
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

  await loginAdministrator(page, origin);
  await page.goto('/novel-admin/accounts/applications');
  await expect(page.getByRole('heading', { name: '创作者准入' })).toBeVisible();
  const application = page.locator('article').filter({
    has: page.getByRole('heading', { name: penName, exact: true }),
  });
  await expect(application).toBeVisible();
  await application.getByRole('button', { name: '通过', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '作者申请已通过' })).toBeVisible();
  await expect(application).toHaveCount(0);

  await page.goto('/login');
  await page.getByLabel('邮箱', { exact: true }).fill(username);
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
  const authorBooks = (await authorBooksResponse.json() as ApiEnvelope<AuthorBookPage>).data;
  expect(authorBooks.items).toEqual(expect.arrayContaining([
    expect.objectContaining({ title, author: penName, status: 'DRAFT' }),
  ]));
  const importedBook = authorBooks.items.find((book) => book.title === title);
  expect(importedBook).toBeTruthy();
  if (!importedBook) throw new Error('new author book was not returned by the BFF');
  await page.getByRole('button', { name: new RegExp(`^${title} `) }).click();
  await expect(page.getByRole('heading', { name: title, exact: true }).last()).toBeVisible();

  const manuscript = [
    '第1章 浏览器导入',
    ...Array.from({ length: 280 }, (_, index) => `第 ${index + 1} 段，来自浏览器上传的正文，用于分页验证。`),
  ].join('\n');
  await page.getByLabel('导入 TXT 或 DOCX 章节').setInputFiles({
    name: 'browser-import.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(manuscript),
  });
  const importResponse = page.waitForResponse((response) => response.url().endsWith(`/api/novel/author/books/${importedBook.id}/chapters/import`) && response.status() === 200);
  await page.getByRole('button', { name: '导入 TXT/DOCX' }).click();
  await importResponse;
  await expect(page.getByRole('status').filter({ hasText: '已导入 1 个章节草稿' })).toBeVisible();

  const importedChaptersResponse = await page.request.get(`/api/novel/author/books/${importedBook.id}/chapters`);
  expect(importedChaptersResponse.status()).toBe(200);
  const importedChapters = (await importedChaptersResponse.json() as ApiEnvelope<{ items: Array<{ id: number; title: string; status: string }> }>).data.items;
  const importedChapter = importedChapters.find((chapter) => chapter.title === '第1章 浏览器导入');
  expect(importedChapter).toBeTruthy();
  if (!importedChapter) throw new Error('imported chapter was not returned by the BFF');

  const authorCsrf = (await page.context().cookies()).find((cookie) => cookie.name === 'novel_csrf')?.value;
  expect(authorCsrf).toBeTruthy();
  const chapterSubmission = await page.request.post(`/api/novel/author/books/${importedBook.id}/chapters/${importedChapter.id}/submit`, {
    headers: { Origin: origin, 'X-Novel-CSRF': authorCsrf! },
  });
  expect(chapterSubmission.status()).toBe(200);

  await loginAdministrator(page, origin);
  await page.goto('/novel-admin/review/books');
  await expect(page.getByRole('heading', { name: '作品审核' })).toBeVisible();
  await page.waitForTimeout(2_000);
  await page.reload();
  const review = page.locator('article').filter({ has: page.getByText(title, { exact: true }) });
  await expect(review).toBeVisible();
  await review.getByRole('button', { name: '批准上线' }).click();
  await expect(page.getByRole('status').filter({ hasText: '作品已发布' })).toBeVisible();

  await page.goto(`/reader/${importedBook.id}`);
  await expect(page.getByRole('heading', { name: '第1章 浏览器导入' })).toBeVisible();
  await expect(page.getByText(/第 1 \/ [2-9]\d*/)).toBeVisible();
  await page.getByRole('button', { name: '下一页' }).click();
  await expect(page.getByText(/第 2 \/ [2-9]\d*/)).toBeVisible();

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
    expect(publicBooks.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ title }),
    ]));

    await otherReaderPage.goto('/');
    await expect(otherReaderPage.getByRole('heading', { name: '首页精选' })).toBeVisible();
    await expect(otherReaderPage.getByText(title, { exact: true })).toHaveCount(0);
  } finally {
    await otherReaderContext.close();
  }
});

test('homepage WebGL bands keep one rendered canvas across focus changes', async ({ page }, testInfo) => {
  await page.goto('/');
  const canvas = page.locator('canvas[data-engine^="three.js"]');
  await expect(canvas).toHaveCount(1);
  await expect.poll(async () => canvas.evaluate((element) => element.width > 0 && element.height > 0)).toBe(true);
  const initialContextAvailable = await canvas.evaluate((element) => {
    const gl = element.getContext('webgl2') ?? element.getContext('webgl');
    return Boolean(gl && !gl.isContextLost());
  });
  expect(initialContextAvailable).toBe(true);

  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForTimeout(180);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(180);
  await expect(canvas).toHaveCount(1);
  await expect.poll(async () => canvas.evaluate((element) => element.width > 0 && element.height > 0)).toBe(true);
  await expect.poll(async () => canvas.evaluate((element) => {
    const gl = element.getContext('webgl2') ?? element.getContext('webgl');
    return Boolean(gl && !gl.isContextLost());
  })).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('homepage-color-bends-focus.png'), fullPage: true });
});
