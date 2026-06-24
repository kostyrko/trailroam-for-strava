import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

const browserOutputPath = join(projectRoot, 'dist', 'trailroam-for-strava', 'browser');
const rootIndexPath = join(browserOutputPath, 'index.html');
const appOutputPath = join(browserOutputPath, 'app');
const appIndexPath = join(appOutputPath, 'index.html');

const now = new Date();
const buildDate =
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;

await mkdir(appOutputPath, { recursive: true });

// Move angular app index.html into nested app/ directory
const rootIndex = await readFile(rootIndexPath, 'utf8');
const nestedAppIndex = rootIndex
  .replaceAll('href="favicon.ico"', 'href="../favicon.ico"')
  .replaceAll('href="styles-', 'href="../styles-')
  .replaceAll('href="chunk-', 'href="../chunk-')
  .replaceAll('src="main-', 'src="../main-')
  .replace(/<base\s[^>]*>/, '')
  .replace('<html lang="en">', `<html lang="en" data-build="${buildDate}">`);

await writeFile(appIndexPath, nestedAppIndex);

// Copy welcome.html to output bundle
await copyFile(join(projectRoot, 'public', 'welcome.html'), join(browserOutputPath, 'welcome.html'));

// Copy background.js to output bundle
await copyFile(join(projectRoot, 'public', 'background.js'), join(browserOutputPath, 'background.js'));

// Copy popup.html to output bundle
try { await copyFile(join(projectRoot, 'public', 'popup.html'), join(browserOutputPath, 'popup.html')); } catch {}

console.log(`Packaged extension app page: ${appIndexPath} (build ${buildDate})`);
