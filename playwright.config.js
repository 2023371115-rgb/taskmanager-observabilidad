// @ts-check
// Pruebas de extremo a extremo (frontend + backend) con Playwright.
// Playwright levanta la aplicacion real (node src/server.js) con una base de datos
// temporal y ejecuta las pruebas contra http://localhost:3000.
const { defineConfig, devices } = require('@playwright/test');
const os = require('os');
const path = require('path');

const PORT = process.env.E2E_PORT || 3000;
const BASE_URL = process.env.E2E_BASE_URL || `http://localhost:${PORT}`;

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  // Las pruebas comparten la misma base de datos: se ejecutan en serie
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'playwright-report/resultados.json' }]
  ],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [{
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
      // Opcional: usar un Chromium ya instalado en la maquina
      launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}
    }
  }],
  // Si E2E_BASE_URL apunta a un servidor ya desplegado, no se levanta uno local
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: 'node src/server.js',
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: {
      PORT: String(PORT),
      SOCKET_PORT: '6062',
      DB_PATH: path.join(os.tmpdir(), `taskmanager-e2e-${Date.now()}.db`),
      BACKUP_DIR: path.join(os.tmpdir(), 'taskmanager-e2e-backups'),
      GIT_SHA: process.env.GITHUB_SHA || 'local'
    }
  }
});
