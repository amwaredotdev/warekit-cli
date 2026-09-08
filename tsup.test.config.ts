import { defineConfig } from 'tsup'

/**
 * Tests build to a gitignored folder rather than into `dist`.
 *
 * They need the same `.js`-specifier resolution the source uses, which node's
 * type stripping does not do, and `dist` is what npm publishes — test files
 * have no business shipping to consumers.
 */
export default defineConfig({
  entry: ['src/**/*.test.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist-test',
  outExtension: () => ({ js: '.mjs' }),
  clean: true,
  platform: 'node',
  splitting: false,
  // tsup strips the node: prefix by default, which turns node:test into a
  // bare "test" specifier and fails to resolve. Real builtins survive it;
  // node:test does not.
  removeNodeProtocol: false
})
