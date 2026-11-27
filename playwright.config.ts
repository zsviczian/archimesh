import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
import { loadProjectEnv, testDatabaseUrls } from './apps/server/src/env.js';

loadProjectEnv();
const { runtime, migration } = testDatabaseUrls();
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync('.local/browsers')) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = '.local/browsers';
}

export default defineConfig({
  testDir: './tests',
  use: { baseURL: 'http://127.0.0.1:5174', ...devices['Desktop Chrome'] },
  webServer: {
    command:
      'corepack pnpm db:migrate:test && corepack pnpm db:seed:test && corepack pnpm dev',
    url: 'http://127.0.0.1:5174/api/health',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: runtime,
      MIGRATION_DATABASE_URL: migration,
      HOST: '127.0.0.1',
      PORT: '3001',
      ARCHIMESH_WEB_PORT: '5174',
    },
  },
});
