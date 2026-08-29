#!/usr/bin/env node
/**
 * Vertical-rhythm lint over the public/marketing surfaces.
 *
 * The target list used to live inline in package.json, which meant deleting a
 * page (e.g. the affiliate portal moving to partners.gradr.me) broke CI with
 * "No files matching the pattern". Paths are filtered against the filesystem
 * here so the gate keeps linting whatever still exists.
 */
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const TARGETS = [
  'src/surfaces',
  'src/components/PublicShell.tsx',
  'src/pages/legal',
  'src/pages/blog',
  'src/pages/AiCareerCoach.tsx',
  'src/pages/AtsResumeChecker.tsx',
  'src/pages/AiCoverLetterGenerator.tsx',
  'src/pages/AiInterviewCoach.tsx',
  'src/pages/JobApplicationTracker.tsx',
  'src/pages/JobSearchIndex.tsx',
  'src/pages/JobLanding.tsx',
  'src/pages/GuideArticle.tsx',
  'src/pages/CareerAdvice.tsx',
  'src/pages/Pricing.tsx',
  'src/pages/AffiliateProgram.tsx',
]

const present = TARGETS.filter((p) => existsSync(p))
const missing = TARGETS.filter((p) => !existsSync(p))

if (missing.length > 0) {
  console.log(`lint:rhythm: skipping removed paths — ${missing.join(', ')}`)
}

if (present.length === 0) {
  console.error('lint:rhythm: no target paths exist — the list in scripts/lint-rhythm.mjs is stale.')
  process.exit(1)
}

const result = spawnSync('npx', ['eslint', ...present], { stdio: 'inherit' })
process.exit(result.status ?? 1)
