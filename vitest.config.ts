import { readFile } from 'node:fs/promises'
import { defineConfig, configDefaults } from 'vitest/config'

export default defineConfig({
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
