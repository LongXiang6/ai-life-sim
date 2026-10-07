/**
 * Purpose: Verify the canonical calendar-step and compatibility point projection contract.
 * Owner: quality:narrative
 * Responsibility: Calendar advancement boundary only; no event-node budget or index remains public.
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { getProjectRoot } from '../../lib/project-root.mjs'
import { TimeSystem } from '../../../../src/mods/mod-engine/subsystems/time-system.ts'
import { buildNarrativeUserJson } from '../../../../src/core/ai-service/prompt-builder.ts'

const root = getProjectRoot(import.meta.url)
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

const timeSteps = read('src/foundation/constants/time-steps.ts')
const foundationTypes = read('src/foundation/types/subsystem.types.ts')
const timeSystem = read('src/mods/mod-engine/subsystems/time-system.ts')
const constants = read('src/mods/mod-engine/constants.ts')
const store = read('src/mods/mod-engine/store.ts')
const promptBuilder = read('src/core/ai-service/prompt-builder.ts')

assert.match(foundationTypes, /export type TimeStepUnit = 'day' \| 'month' \| 'season' \| 'year'/)
assert.match(timeSteps, /unit: 'day'/)
assert.match(timeSteps, /unit: 'month'/)
assert.match(timeSteps, /unit: 'season'/)
assert.doesNotMatch(timeSteps, /unit:\s*'event'/)
assert.match(timeSteps, /return \{ unit: 'month', value: 1 \}/)
assert.match(constants, /timeStep: \{ unit: 'month', value: 1 \}/)
assert.match(timeSystem, /daysForStep/)
assert.match(timeSystem, /totalDays/)
assert.match(timeSystem, /incoming\.totalDays/)
assert.doesNotMatch(timeSystem, /eventNode|advanceAnnualEvent|unit === 'event'/)
assert.doesNotMatch(store, /eventNodeCount:\s*[^,]+|eventNodeIndex:\s*[^,]+/)
assert.doesNotMatch(promptBuilder, /事件节点|节点编号|离散事件尺度/)

const monthly = new TimeSystem()
monthly.setTimeStep({ unit: 'month', value: 1 })
assert.equal(monthly.advance().totalDays, 31, 'January must advance to the first day of February')
assert.equal(monthly.advance().totalDays, 59, 'February must use its calendar length')
assert.equal(monthly.getBasePointsPassed(), 77, 'base-point increment must be the cumulative projection delta')

const seasonal = new TimeSystem()
seasonal.setTimeStep({ unit: 'season', value: 1 })
assert.equal(seasonal.advance().totalDays, 90, 'a season must cover three consecutive calendar months')
assert.equal(seasonal.getRound().month, 3, 'January seasonal advance must end in April')
seasonal.reset()
seasonal.setTimeStep({ unit: 'month', value: 1 })
for (let index = 0; index < 10; index += 1) seasonal.advance()
assert.equal(seasonal.getRound().month, 10, 'ten monthly steps must end at November')
seasonal.setTimeStep({ unit: 'season', value: 1 })
const crossYear = seasonal.advance()
assert.equal(crossYear.totalDays, 396, 'seasonal advance must cross the year boundary using real month lengths')
assert.equal(crossYear.month, 1, 'November seasonal advance must end in February')
assert.equal(crossYear.year, 1, 'cross-year seasonal advance must increment the calendar year')

const restored = new TimeSystem()
restored.importRound({ ...restored.getRound(), totalDays: 59, totalBasePoints: 999 })
assert.equal(restored.getRound().totalBasePoints, 161, 'restoration must derive base points from totalDays')

const narrativePayload = buildNarrativeUserJson({
  worldNarrativeView: { 名称: '测试世界', 描述: '测试' },
  characterProfileView: { 姓名: '测试角色', 性别: '未设定', 种族: '人类', 背景: '' },
  characterStatusView: { 年龄: 18 },
  subsystemSummaries: [],
  narrativeTimeWindow: '本轮覆盖一个自然季。',
})
assert.match(
  narrativePayload[4].本次信息.时间窗口,
  /^本轮覆盖一个自然季/u,
  'main narrative payload must consume the canonical abstract time span',
)

console.log('PASS: calendar-clock-smoke')
