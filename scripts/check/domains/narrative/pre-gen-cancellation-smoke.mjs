import assert from 'node:assert/strict'

import { PreGenActivityState } from '../../../../src/mods/mod-engine/helpers/pre-gen-activity-state.ts'

const activity = new PreGenActivityState()
const generation = activity.begin()
const signal = activity.getSignal(generation)
let released = false
const idle = activity.waitForIdle().then(() => {
  released = true
})

activity.invalidate()
await Promise.resolve()
assert.equal(signal?.aborted, true)
assert.equal(activity.isActive(), false)
assert.equal(activity.isRunning(), true)
assert.equal(released, false)

activity.finish(generation)
await idle
assert.equal(activity.isRunning(), false)
assert.equal(released, true)

console.log('PASS: pre-gen-cancellation-smoke')
