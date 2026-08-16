/**
 * Build: one host-side ESM bundle for Node.
 *
 * @deepseek-ai/* stay external — the profile's node_modules provides them at
 * runtime (mirrors dsh-balance-meter / dsh-markdown-color). The only runtime
 * import is createUserMessage from @deepseek-ai/dsh-llm; everything else is
 * type-only. No client half: there is no statusline surface in DSH web yet.
 */
import { build } from 'esbuild'
import { mkdirSync } from 'node:fs'

mkdirSync('lib', { recursive: true })

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: ['node22'],
  sourcemap: true,
  external: ['@deepseek-ai/cordis', '@deepseek-ai/dsh-*'],
  logLevel: 'info',
})
