#!/usr/bin/env node
/**
 * CI gate: built asset filenames must not disclose the technology stack.
 *
 * PentestTools (CWE-200 / OWASP A02) fingerprinted Gradr partly from chunk
 * filenames like `react-dom-*.js` and `motion-*.js` in the HTML. We can't
 * control Cloudflare's `server:`/`cf-ray` headers, but we do control build
 * output naming, so this fails the build if a recognisable library, route, or
 * component name creeps back into `dist/assets`.
 */
import { readdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const ASSETS = resolve(process.cwd(), 'dist/assets')

if (!existsSync(ASSETS)) {
  console.error('check-bundle-fingerprint: dist/assets missing — run the build first.')
  process.exit(1)
}

// Content-hashed names only: no alphabetic "word" prefixes.
const ALLOWED = /^[A-Za-z0-9_-]{6,12}\.(js|css|map)$/
const KNOWN_TECH = /(react|vue|angular|svelte|next|nuxt|vite|rollup|rolldown|webpack|motion|framer|radix|tailwind|supabase|router|query|recharts|chart|lucide|heroui|nextui|shadcn|paddle|posthog|sentry|admin|auth)/i

const offenders = []
for (const name of readdirSync(ASSETS)) {
  // Fonts/images keep their extensions; only flag names that carry words.
  if (KNOWN_TECH.test(name) || (!ALLOWED.test(name) && /[A-Za-z]{5,}/.test(name.split('.')[0]))) {
    offenders.push(name)
  }
}

if (offenders.length > 0) {
  console.error('check-bundle-fingerprint: asset filenames disclose the stack:')
  for (const name of offenders) console.error(`  - dist/assets/${name}`)
  console.error('\nKeep `build.rollupOptions.output.*FileNames` as opaque `[hash]` patterns in vite.config.ts.')
  process.exit(1)
}

console.log('check-bundle-fingerprint: OK — all asset filenames are opaque hashes.')
