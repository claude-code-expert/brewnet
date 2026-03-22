import { defineConfig } from 'tsup';
import { readFileSync, cpSync, existsSync } from 'fs';
import { resolve } from 'path';

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
    const adminUiDist = resolve(__dirname, '../admin-ui/dist');
    const target = resolve(__dirname, 'dist/admin-ui');
    if (existsSync(adminUiDist)) {
      cpSync(adminUiDist, target, { recursive: true });
      console.log('✔ admin-ui bundled into dist/admin-ui');
    }
  },
});
