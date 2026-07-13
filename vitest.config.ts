import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { defineConfig, configDefaults } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      // workers-og ships Workers-runtime wasm imports Node can't evaluate —
      // tests run against a stub; the real bundle is verified by wrangler.
      'workers-og': fileURLToPath(new URL('./src/test-stubs/workers-og.ts', import.meta.url)),
    },
  },
  plugins: [
    {
      name: 'markdown-as-text',
      enforce: 'pre',
      async load(id) {
        if (!id.endsWith('.md')) return null
        const content = await readFile(id, 'utf8')
        return `export default ${JSON.stringify(content)};`
      },
    },
  ],
  test: {
    setupFiles: ['./src/test-setup.ts'],
    testTimeout: 30_000,
    exclude: [
      ...configDefaults.exclude,
      '**/.claude/**',
    ],
  },
})
