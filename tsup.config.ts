import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'bin/npm-outdated-check': 'src/bin/cli.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  shims: true,
  splitting: false,
  sourcemap: true,
  minify: false,
  target: 'node18',
  outDir: 'dist',
  external: ['chalk', 'cli-table3', 'commander', 'semver'],
  bundle: true,
  esbuildOptions(options) {
    // Only add shebang to CJS output for Node.js compatibility
    if (options.format === 'cjs') {
      options.banner = { js: '#!/usr/bin/env node' };
    }
  },
});