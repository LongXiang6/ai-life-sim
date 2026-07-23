import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const policyUrl = pathToFileURL(path.resolve(
  'src/mods/mod-pages/pages/game-story/narrative-retry-policy.ts',
)).href
const {
  AUTO_NARRATIVE_RETRY_DELAYS_MS,
  getAutoNarrativeRetryDelay,
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

console.log('[narrative-retry-policy-smoke] PASS')
