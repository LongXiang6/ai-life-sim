import assert from 'node:assert/strict'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const policyUrl = pathToFileURL(path.resolve(
  'src/mods/mod-pages/pages/game-story/narrative-retry-policy.ts',
)).href
const {
  AUTO_NARRATIVE_RETRY_DELAYS_MS,
  createAutoNarrativeRetryGate,
  getAutoNarrativeRetryDelay,
  invalidateAutoNarrativeRetry,
  runAutoNarrativeRetryAttempt,
} = await import(policyUrl)

assert.deepEqual(
  [...AUTO_NARRATIVE_RETRY_DELAYS_MS],
  [1200, 2500],
  'narrative recovery should use two bounded automatic attempts with backoff',
)
assert.equal(getAutoNarrativeRetryDelay(0), 1200)
assert.equal(getAutoNarrativeRetryDelay(1), 2500)
assert.equal(getAutoNarrativeRetryDelay(2), null, 'automatic retries must stop at the bound')
assert.equal(getAutoNarrativeRetryDelay(-1), null)
assert.equal(getAutoNarrativeRetryDelay(0.5), null)
assert.equal(
  getAutoNarrativeRetryDelay(0),
  1200,
  'a manual retry reset should restore the automatic retry budget',
)

const gate = createAutoNarrativeRetryGate()
const generation = gate.generation
let releaseFirstAttempt
let startedAttempts = 0
const firstAttempt = runAutoNarrativeRetryAttempt(gate, generation, async () => {
  startedAttempts += 1
  await new Promise((resolve) => { releaseFirstAttempt = resolve })
})
await Promise.resolve()

assert.equal(
  await runAutoNarrativeRetryAttempt(gate, generation, async () => { startedAttempts += 1 }),
  false,
  'a second automatic retry must not queue while the previous attempt is still running',
)
assert.equal(startedAttempts, 1)
releaseFirstAttempt()
assert.equal(await firstAttempt, true)

invalidateAutoNarrativeRetry(gate)
assert.equal(
  await runAutoNarrativeRetryAttempt(gate, generation, async () => { startedAttempts += 1 }),
  false,
  'manual retry invalidation must reject stale automatic timers',
)
assert.equal(startedAttempts, 1)

const hooksSource = fs.readFileSync('src/mods/mod-engine/hooks.ts', 'utf8')
const mutexClaimIndex = hooksSource.indexOf('isAdvancingRef.current = true')
const finalizationWaitIndex = hooksSource.indexOf('await waitForRoundFinalization()')
const mutexReleaseIndex = hooksSource.lastIndexOf('isAdvancingRef.current = false')
assert.ok(mutexClaimIndex >= 0 && finalizationWaitIndex >= 0 && mutexReleaseIndex >= 0)
assert.ok(
  mutexClaimIndex < finalizationWaitIndex && finalizationWaitIndex < mutexReleaseIndex,
  'the round mutex must cover finalization waits so queued retries cannot become a later real round',
)

console.log('[narrative-retry-policy-smoke] PASS')
