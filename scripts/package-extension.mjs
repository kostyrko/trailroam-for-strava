import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const browserOutputPath = join('dist', 'trailroam-for-strava', 'browser');
const rootIndexPath = join(browserOutputPath, 'index.html');
const appOutputPath = join(browserOutputPath, 'app');
const appIndexPath = join(appOutputPath, 'index.html');

const now = new Date();
const buildDate =
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;

await mkdir(appOutputPath, { recursive: true });

const rootIndex = await readFile(rootIndexPath, 'utf8');
const nestedAppIndex = rootIndex
  .replaceAll('href="favicon.ico"', 'href="../favicon.ico"')
  .replaceAll('href="styles-', 'href="../styles-')
  .replaceAll('href="chunk-', 'href="../chunk-')
  .replaceAll('src="main-', 'src="../main-')
  .replace('<html lang="en">', `<html lang="en" data-build="${buildDate}">`);

await writeFile(appIndexPath, nestedAppIndex);

console.log(`Packaged extension app page: ${appIndexPath} (build ${buildDate})`);
