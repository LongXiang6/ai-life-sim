/**
 * Purpose: Verify the canonical annual base-point clock contract.
 * Owner: quality:narrative
 * Responsibility: Deterministic event allocation and calendar projection only.
 */

import assert from 'node:assert/strict'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const clock = await import(pathToFileURL(path.join(root, 'src/foundation/utils/annual-clock.ts')).href)

const {
  BASE_POINTS_PER_YEAR,
  DEFAULT_ANNUAL_EVENT_COUNT,
  MAX_ANNUAL_EVENT_COUNT,
  annualEventBasePointDelta,
  annualEventCumulativeBasePoints,
  advanceAnnualEvent,
  basePointsFromCalendarDays,
  calendarDaysFromBasePoints,
  normalizeAnnualEventCount,
} = clock

assert.equal(BASE_POINTS_PER_YEAR, 1000)
assert.equal(DEFAULT_ANNUAL_EVENT_COUNT, 12)
assert.equal(MAX_ANNUAL_EVENT_COUNT, 1000)
assert.equal(normalizeAnnualEventCount(0), 12)
assert.equal(normalizeAnnualEventCount(5000), 1000)
assert.deepEqual(
  [1, 2, 3].map((index) => annualEventBasePointDelta(index - 1, index, 3)),
  [333, 333, 334],
)
assert.equal(annualEventCumulativeBasePoints(3, 3), 1000)
assert.deepEqual(
  [1, 2, 3, 4].map((index) => annualEventBasePointDelta(index - 1, index, 4)),
  [250, 250, 250, 250],
)

let cursor = {
  year: 0,
  eventIndex: 0,
  eventCount: 3,
  totalBasePoints: 0,
}
const deltas = []
for (let index = 0; index < 3; index += 1) {
  const result = advanceAnnualEvent(cursor)
  deltas.push(result.basePointsPassed)
  cursor = result.cursor
}
assert.deepEqual(deltas, [333, 333, 334])
assert.deepEqual(cursor, {
  year: 1,
  eventIndex: 0,
  eventCount: 3,
  totalBasePoints: 1000,
})

assert.equal(calendarDaysFromBasePoints(1000), 365)
assert.equal(calendarDaysFromBasePoints(333), 121)
assert.equal(basePointsFromCalendarDays(365), 1000)
assert.equal(calendarDaysFromBasePoints(1001), 365)

console.log('PASS: annual-clock-smoke')
