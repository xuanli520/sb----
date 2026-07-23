import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const backendTestClasses = fileURLToPath(new URL('../backend/target/test-classes', import.meta.url));
const backendPort = parsePort(process.env.E2E_BACKEND_PORT, 18080);
const webPort = parsePort(process.env.E2E_WEB_PORT, 13000);
const smtpPort = parsePort(process.env.E2E_SMTP_PORT, 11025);
const smtpMailboxPort = parsePort(process.env.E2E_SMTP_MAILBOX_PORT, 18025);
const backendUrl = `http://127.0.0.1:${backendPort}`;
const webUrl = `http://127.0.0.1:${webPort}`;

function parsePort(value: string | undefined, fallback: number) {
  const port = Number(value ?? fallback);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error(`Invalid E2E port: ${value}`);
  return port;
}

export default defineConfig({
  testDir: './e2e', timeout: 45_000, reporter: 'line',
  use: { baseURL: webUrl, headless: true, screenshot: 'only-on-failure', launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : undefined },
  webServer: [
    { command: `node e2e/smtp-mailbox.mjs --smtp-port ${smtpPort} --http-port ${smtpMailboxPort}`, cwd: '.', url: `http://127.0.0.1:${smtpMailboxPort}/health`, timeout: 15_000, reuseExistingServer: false },
    { command: `SERVER_PORT=${backendPort} SPRING_DATASOURCE_URL='jdbc:h2:mem:novel_e2e;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1' SPRING_FLYWAY_LOCATIONS=classpath:db/migration,classpath:db/test-migration SPRING_MAIL_HOST=127.0.0.1 SPRING_MAIL_PORT=${smtpPort} SPRING_MAIL_USERNAME=e2e-mailer SPRING_MAIL_PASSWORD=e2e-smtp-test-password NOVEL_INTERNAL_API_KEY=local-novel-internal-key NOVEL_BOOTSTRAP_ADMIN_USERNAME=e2e.admin@example.test NOVEL_BOOTSTRAP_ADMIN_DISPLAY_NAME=E2EAdmin NOVEL_BOOTSTRAP_ADMIN_PASSWORD=e2e-bootstrap-admin-password NOVEL_RUNTIME_MODE=DEVELOPMENT NOVEL_AUDIT_DEVELOPMENT_SIMULATION_ENABLED=true NOVEL_AUDIT_FULL_BOOK_SCHEDULER_ENABLED=true NOVEL_AUDIT_FULL_BOOK_INITIAL_DELAY=PT0S NOVEL_AUDIT_FULL_BOOK_FIXED_DELAY=PT1S NOVEL_EMAIL_VERIFICATION_ENABLED=true NOVEL_SMTP_AUTH=false NOVEL_SMTP_SSL_ENABLE=false NOVEL_EMAIL_VERIFICATION_FROM=e2e-mailer@example.test NOVEL_EMAIL_VERIFICATION_HASH_SECRET=e2e-email-verification-hmac-secret NOVEL_EMAIL_DELIVERY_SETTINGS_ENCRYPTION_KEY=MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY mvn -q -pl apps/backend -Dspring-boot.run.useTestClasspath=true -Dspring-boot.run.additional-classpath-elements=${backendTestClasses} spring-boot:run`, cwd: root, url: `${backendUrl}/actuator/health`, timeout: 90_000, reuseExistingServer: false },
    { command: `API_PROXY_TARGET=${backendUrl} NOVEL_INTERNAL_API_KEY=local-novel-internal-key NOVEL_SESSION_STORE=memory npm run dev -- --port ${webPort}`, cwd: '.', url: webUrl, timeout: 90_000, reuseExistingServer: false },
  ],
});
