import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { resolve, extname } from 'path';
import { createServer, type Server } from 'http';

const BROWSER_DIR = resolve('dist/trailroam-for-strava/browser');
let server: Server | null = null;
let PORT = 9877;
const MAX_PORT_ATTEMPTS = 5;

test.beforeAll(async () => {
  const manifest = JSON.parse(readFileSync(resolve(BROWSER_DIR, 'manifest.json'), 'utf-8'));
  let extId = '';
  if (manifest.key) {
    const { createHash } = await import('node:crypto');
    const der = Buffer.from(manifest.key, 'base64');
    const hash = createHash('sha256').update(der).digest();
    for (let i = 0; i < 16; i++) {
      extId += String.fromCharCode(0x61 + ((hash[i * 2] & 0xF0) >> 4));
      extId += String.fromCharCode(0x61 + (hash[i * 2] & 0x0F));
    }
  }

  // Start a static file server that also serves chrome-extension://<id> path
  server = createServer((req, res) => {
    let url = req.url || '/';
    // Strip chrome-extension scheme prefix if present
    if (url.startsWith('/chrome-extension')) {
      url = url.replace(/^\/chrome-extension\/[^/]+\/app\//, '/app/');
    }
    if (url === '/') url = '/app/index.html';
    const filePath = resolve(BROWSER_DIR, url.slice(1));
    try {
      const content = readFileSync(filePath);
      const ext = extname(filePath);
      const mime: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.png': 'image/png',
        '.ico': 'image/x-icon',
        '.json': 'application/json',
        '.svg': 'image/svg+xml',
        '.map': 'application/octet-stream',
      };
      res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  for (let attempt = 0; attempt < MAX_PORT_ATTEMPTS; attempt++) {
    try {
      await new Promise<void>((resolve, reject) => {
        server!.listen(PORT, () => resolve());
        server!.once('error', reject);
      });
      break;
    } catch (err: any) {
      if (err.code === 'EADDRINUSE' && attempt < MAX_PORT_ATTEMPTS - 1) {
        PORT += 1;
        continue;
      }
      throw err;
    }
  }
});

test.afterAll(async () => {
  if (server) {
    await new Promise((resolve) => server!.close(resolve));
  }
});

test.describe('App shell (static serve)', () => {
  test('should load the app page', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}/`);
    await expect(page.locator('.app-header')).toBeVisible({ timeout: 15000 });
  });

  test('should show the header brand name', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}/`);
    await expect(page.getByText('TrailRoam for Strava')).toBeVisible({ timeout: 15000 });
  });

  test('should show navigation with three links', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}/`);
    const navLinks = page.locator('.app-header nav a');
    await expect(navLinks).toHaveCount(3, { timeout: 15000 });
  });

  test('should show Sync Strava button', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}/`);
    await expect(page.getByText('Sync Strava')).toBeVisible({ timeout: 15000 });
  });

  test('should navigate to Activities page via nav', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}/`);
    await page.getByText('Activities').first().click();
    await page.waitForURL('**/activities');
    await expect(page.locator('app-activities-page')).toBeVisible({ timeout: 10000 });
  });

  test('should navigate to Settings page via nav', async ({ page }) => {
    await page.goto(`http://localhost:${PORT}/`);
    await page.getByText('Settings').first().click();
    await page.waitForURL('**/settings');
    await expect(page.locator('app-settings-page')).toBeVisible({ timeout: 10000 });
  });
});
