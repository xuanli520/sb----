import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const backendPort = parsePort(process.env.E2E_BACKEND_PORT, 18080);
const webPort = parsePort(process.env.E2E_WEB_PORT, 13000);
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
    { command: `SERVER_PORT=${backendPort} NOVEL_INTERNAL_API_KEY=local-novel-internal-key NOVEL_DEVELOPMENT_AUTH_ENABLED=true NOVEL_RUNTIME_MODE=DEVELOPMENT NOVEL_AUDIT_DEVELOPMENT_SIMULATION_ENABLED=true mvn -q -pl apps/backend spring-boot:run`, cwd: root, url: `${backendUrl}/actuator/health`, timeout: 90_000, reuseExistingServer: false },
    { command: `API_PROXY_TARGET=${backendUrl} NOVEL_INTERNAL_API_KEY=local-novel-internal-key NOVEL_SESSION_STORE=memory NOVEL_DEV_LOGIN_ENABLED=true npm run dev -- --port ${webPort}`, cwd: '.', url: webUrl, timeout: 90_000, reuseExistingServer: false },
  ],
});
