import { defineConfig } from 'tsup';
import { readFileSync, cpSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Support both CJS (__dirname) and ESM (import.meta.url) contexts
const _dir = typeof __dirname !== 'undefined'
  ? __dirname
  : dirname(fileURLToPath(import.meta.url));

const { version } = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string };

export default defineConfig({
  entry: ['src/index.ts', 'src/services/admin-daemon.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'node20',
  outDir: 'dist',
  banner: {
    js: '#!/usr/bin/env node',
  },
  define: {
    __CLI_VERSION__: JSON.stringify(version),
  },
  onSuccess: async () => {
    // Bundle admin-ui dist into cli dist so npm installs include the dashboard
    const adminUiDist = resolve(_dir, '../admin-ui/dist');
    const target = resolve(_dir, 'dist/admin-ui');
    console.log(`[tsup] admin-ui source: ${adminUiDist} (exists: ${existsSync(adminUiDist)})`);
    if (existsSync(adminUiDist)) {
      cpSync(adminUiDist, target, { recursive: true });
      const hasIndex = existsSync(resolve(target, 'index.html'));
      console.log(`✔ admin-ui bundled into dist/admin-ui (index.html: ${hasIndex})`);
    } else {
      console.warn('⚠ admin-ui/dist not found — npm package will not include dashboard');
    }
  },
});
