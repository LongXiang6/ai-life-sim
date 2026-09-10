/**
 * Purpose: Regress the AI-judged plot phase contract against canonical time rounds.
 * Owner: quality:narrative
 * Responsibility: Plot phase advancement via plot guidance only; collectState must not advance time.
 */
import assert from 'node:assert/strict'

import { PlotStructureSystem } from '../../../../src/mods/mod-engine/subsystems/plot-structure-system.ts'

// 新契约：剧情阶段由剧情引导 AI 判定，collectState 只读取快照，不得按时间自行推进。
const plot = new PlotStructureSystem()
for (let roundSequence = 1; roundSequence <= 96; roundSequence++) {
  plot.collectState({
    roundSequence,
    basePointsPassed: 1000,
    totalBasePoints: roundSequence * 1000,
    daysPassed: 365,
    totalDays: roundSequence * 365,
    contextId: 'plot-test',
  })
}

const collectedState = plot.getState()
assert.equal(collectedState.currentPhase, 'setup')
assert.equal(collectedState.phaseStartedAtBasePoints, 0)
assert.equal(collectedState.phaseElapsedBasePoints, 0)
assert.equal(collectedState.phaseStartedAtTotalDays, 0)
assert.equal(collectedState.phaseElapsedDays, 0)
assert.equal(collectedState.chapterCount, 1)
assert.equal(collectedState.tensionLevel, 30)
assert.equal(collectedState.phaseHistory.length, 0)

// 阶段只能通过 prepareGuidance + commitPreparedGuidance 提交剧情引导结果后改变。
const context = {
  roundSequence: 96,
  basePointsPassed: 1000,
  totalBasePoints: 96 * 1000,
  daysPassed: 365,
  totalDays: 96 * 365,
  contextId: 'plot-test',
}
const prepared = plot.prepareGuidance({ 阶段: '推进', 张力: 45, 进展说明: '情节正在推进。' }, context)
assert.equal(prepared.nextState.currentPhase, 'rising_action')
assert.equal(prepared.nextState.phaseStartedAtBasePoints, context.totalBasePoints)
assert.equal(prepared.nextState.phaseElapsedBasePoints, 0)
assert.equal(prepared.nextState.phaseStartedAtTotalDays, context.totalDays)
assert.equal(prepared.nextState.phaseElapsedDays, 0)
plot.commitPreparedGuidance(prepared, context)

const committedState = plot.getState()
assert.equal(committedState.currentPhase, 'rising_action')
assert.equal(committedState.tensionLevel, 45)
assert.equal(committedState.phaseStartedAtBasePoints, context.totalBasePoints)
assert.equal(committedState.phaseElapsedBasePoints, 0)
assert.equal(committedState.phaseStartedAtTotalDays, context.totalDays)
assert.equal(committedState.phaseHistory.length, 1)
assert.equal(committedState.phaseHistory[0]?.phase, 'rising_action')
assert.equal(committedState.phaseHistory[0]?.roundSequence, 96)
assert.equal(committedState.phaseHistory[0]?.totalBasePoints, context.totalBasePoints)
assert.equal(committedState.phaseHistory[0]?.totalDays, context.totalDays)
assert.match(plot.buildPhaseGuidance(), /推进/)

// 新保存只写当前 PlotStructureState，恢复后保持同一当前格式。
const currentSnapshot = plot.capturePersistenceState()
assert.equal(Object.hasOwn(currentSnapshot, 'state'), false)
assert.equal(Object.hasOwn(currentSnapshot, 'lastProcessedRound'), false)
const currentRestoredPlot = new PlotStructureSystem()
currentRestoredPlot.restorePersistenceState(currentSnapshot)
assert.deepEqual(currentRestoredPlot.capturePersistenceState(), currentSnapshot)

// 历史包装只在持久化恢复边界拆开；其旧日历字段继续归一化为当前基础点格式。
const migratedPlot = new PlotStructureSystem()
migratedPlot.restorePersistenceState({
  state: {
    enabled: true,
    currentPhase: 'rising_action',
    phaseStartedAtTotalDays: 365,
    phaseElapsedDays: 365,
    chapterCount: 1,
    tensionLevel: 45,
    lastClimaxTotalDays: 365,
    lastConflictIntensity: 25,
    phaseHistory: [{
      phase: 'rising_action',
      roundSequence: 12,
      totalDays: 365,
      contextId: 'plot-test',
    }],
  },
  lastProcessedRound: 12,
})
const migratedState = migratedPlot.getState()
assert.equal(migratedState.phaseStartedAtBasePoints, 1000)
assert.equal(migratedState.phaseElapsedBasePoints, 1000)
assert.equal(migratedState.phaseStartedAtTotalDays, 365)
assert.equal(migratedState.phaseElapsedDays, 365)
assert.equal(migratedState.phaseHistory[0]?.totalBasePoints, 1000)
assert.equal(migratedState.phaseHistory[0]?.totalDays, 365)
assert.equal(migratedState.progressSummary, '人生与世界仍在建立最初的联系。')
assert.equal(Object.hasOwn(migratedState, 'lastClimaxTotalDays'), false)
assert.equal(Object.hasOwn(migratedState, 'lastConflictIntensity'), false)
assert.equal(Object.hasOwn(migratedPlot.capturePersistenceState(), 'state'), false)

const preservedProgressPlot = new PlotStructureSystem()
preservedProgressPlot.restorePersistenceState({
  state: {
    ...currentSnapshot,
    progressSummary: '旧存档阶段。',
  },
  lastProcessedRound: 13,
})
assert.equal(preservedProgressPlot.getState().progressSummary, '旧存档阶段。')

// 事务恢复仍只接收当前格式，伪历史包装与无效内层状态都必须明确失败。
assert.throws(
  () => new PlotStructureSystem().restoreTransactionState({ state: currentSnapshot, lastProcessedRound: 96 }),
  /剧情结构阶段无效/,
)
assert.throws(
  () => new PlotStructureSystem().restorePersistenceState({ state: currentSnapshot }),
  /剧情结构历史持久化状态无效/,
)
assert.throws(
  () => new PlotStructureSystem().restorePersistenceState({ state: currentSnapshot, lastProcessedRound: 1.5 }),
  /剧情结构历史持久化状态无效/,
)
assert.throws(
  () => new PlotStructureSystem().restorePersistenceState({
    state: { ...currentSnapshot, currentPhase: 'unknown' },
    lastProcessedRound: 96,
  }),
  /剧情结构阶段无效/,
)
const currentWithoutProgressSummary = { ...currentSnapshot }
delete currentWithoutProgressSummary.progressSummary
assert.throws(
  () => new PlotStructureSystem().restorePersistenceState(currentWithoutProgressSummary),
  /剧情进展说明不能为空/,
)

console.log('PASS: plot-structure-canonical-time-smoke')
