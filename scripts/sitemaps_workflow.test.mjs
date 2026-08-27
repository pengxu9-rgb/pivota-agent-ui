// The sitemap cron's IDENTITY is the thing that broke, and nothing else covers
// it. It is not expressible in the generator — it lives entirely in
// .github/workflows/sitemaps.yml — so this file asserts against the YAML text.
//
// The history it exists to stop repeating: main got branch protection on
// 2026-08-13 and the cron went red in four successive disguises, each one a
// patch of the previous symptom rather than the cause.
//
//   08-13  GH006, protected branch     — bot pushed straight to main
//   08-14  "GitHub Actions is not permitted to create or approve pull requests"
//   08-16  required check `test` never counts      <- the actual root cause
//   08-27  same thing, now surfacing at `gh pr merge` instead of at the poll
//
// The root cause is one sentence: a push made with GITHUB_TOKEN fires no
// `pull_request` event, so the bot PR never gets a pull_request-context `test`
// run, so the required check is never satisfied. Dispatching test.yml onto the
// branch produces a check run that is green, on the right sha, linked to the
// PR, and STILL not counted (measured on PR #306 and again on PR #315).
//
// Every assertion below is one line of the workflow that, if reverted, puts the
// cron back into that loop. Note there is no assertion that the cron is green:
// it was green 21 times during the outage, because a run whose sitemap is
// unchanged exits 0 in 15 seconds without ever touching the merge path.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const SITEMAPS_YML = readFileSync(
  path.join(REPO_ROOT, '.github/workflows/sitemaps.yml'),
  'utf8',
)
const TESTS_YML = readFileSync(path.join(REPO_ROOT, '.github/workflows/test.yml'), 'utf8')

const BOT_TOKEN_EXPR = /\$\{\{\s*secrets\.SITEMAP_BOT_TOKEN\s*\}\}/

// Comments in this file talk about github.token constantly, so a naive
// whole-file grep for it would pass on prose alone. Strip comments first: the
// claim is about what the workflow DOES.
function withoutComments(yaml) {
  return yaml
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n')
}

// The `- uses: actions/checkout@...` step, up to the next step at the same
// indent. Read structurally rather than by one regex so an added `with:` key or
// an interleaved comment does not silently stop matching — a test that quietly
// stops covering its line is the failure mode this whole file is about.
function checkoutStep(yaml) {
  const lines = withoutComments(yaml).split('\n')
  const start = lines.findIndex((line) => /^\s*-\s*uses:\s*actions\/checkout@/.test(line))
  expect(start, 'sitemaps.yml no longer checks out the repo').toBeGreaterThanOrEqual(0)
  const indent = lines[start].match(/^\s*/)[0].length
  let end = start + 1
  while (end < lines.length && !new RegExp(`^\\s{${indent}}-\\s`).test(lines[end])) end++
  return lines.slice(start, end).join('\n')
}

describe('sitemaps.yml lands its refresh as a real identity', () => {
  // THE load-bearing line. actions/checkout persists whatever token it is given
  // as the credential `git push` will use; without this the push is
  // GITHUB_TOKEN's, no pull_request event fires, and the merge is refused
  // forever. Reverting this one line is the whole 08-16 → 08-27 outage.
  it('checks out with the bot token so the push fires a pull_request event', () => {
    expect(checkoutStep(SITEMAPS_YML)).toMatch(BOT_TOKEN_EXPR)
  })

  it('authenticates the PR and merge calls as the bot, not GITHUB_TOKEN', () => {
    const body = withoutComments(SITEMAPS_YML)
    expect(body).toMatch(new RegExp(`GH_TOKEN:\\s*${BOT_TOKEN_EXPR.source}`))
    expect(body).not.toMatch(/GH_TOKEN:\s*\$\{\{\s*(github\.token|secrets\.GITHUB_TOKEN)\s*\}\}/)
  })

  // A fallback would look prudent and would be the bug: an unset or expired
  // secret would silently resolve to GITHUB_TOKEN and the cron would go back to
  // failing at the merge with no hint why. Same shape as the dead-Railway
  // default in generate_sitemaps.baseurl.test.mjs — a silent default IS the bug.
  it('never falls back to GITHUB_TOKEN', () => {
    expect(withoutComments(SITEMAPS_YML)).not.toMatch(
      /secrets\.SITEMAP_BOT_TOKEN\s*\|\|/,
    )
  })

  it('fails fast and explains itself when the bot token is missing', () => {
    const body = withoutComments(SITEMAPS_YML)
    expect(body).toMatch(/BOT_TOKEN:\s*\$\{\{\s*secrets\.SITEMAP_BOT_TOKEN\s*\}\}/)
    expect(body).toMatch(/if\s*\[\s*-z\s*"\$BOT_TOKEN"\s*\]/)
  })

  // The disproven workaround. It RUNS — that is the trap — and it produces a
  // green check run that GitHub does not count. If it ever comes back, the
  // eleven-day loop comes back with it.
  it('does not dispatch test.yml onto the branch', () => {
    expect(withoutComments(SITEMAPS_YML)).not.toMatch(/gh\s+workflow\s+run\s+test\.yml/)
  })

  // Not decoration: the whole fix rests on test.yml running in the
  // pull_request context. Delete that trigger and the bot token buys nothing.
  it('relies on a test.yml that still triggers on pull_request', () => {
    expect(withoutComments(TESTS_YML)).toMatch(/^\s*pull_request:\s*$/m)
  })
})
