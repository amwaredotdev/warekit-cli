import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { index: 'src/index.ts', mcp: 'src/mcp.ts' },
  format: ['esm'],
  target: 'node20',
  outExtension: () => ({ js: '.mjs' }),
  clean: true,
  platform: 'node',
  // Dependencies stay external. Bundling them produced "Dynamic require of
  // events" at runtime: commander ships CJS, and inlining CJS into an ESM
  // bundle breaks require() of node builtins. npm installs them normally.
  splitting: false,
  banner: { js: '#!/usr/bin/env node' }
})
