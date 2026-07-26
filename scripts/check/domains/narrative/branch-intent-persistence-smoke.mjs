/**
 * EngineStore 分支意图投影与旧 orchestrator snapshot 恢复回归。
 */

import {
  ENGINE_STORE_SCHEMA_VERSION,
  migrateEnginePersistedState,
  useEngineStore,
} from '../../../../src/mods/mod-engine/store.ts'
import { OrchestratorSystem } from '../../../../src/mods/mod-engine/subsystems/orchestrator-system.ts'
import {
  calculateNarrativeRepetitionMetric,
} from '../../../../src/mods/mod-engine/helpers/narrative-repetition-metrics.ts'

let failed = 0

function assertOk(condition, message) {
  if (condition) return
  console.error(`FAIL: ${message}`)
  failed++
}

const legacyChoice = '寻找失落的北境航道'
const legacyIntentId = 'branch:legacy-branch'
const progressingResolution = {
  intentId: legacyIntentId,
  feasibility: 'conditional',
  executionMode: 'progressive',
  status: 'progressing',
  riskLevel: 'medium',
  progress: 35,
  blockers: ['缺少完整海图'],
  prerequisites: ['找到旧港领航员'],
  costs: ['投入一个月调查'],
  timeHorizon: '预计还需数月',
  reason: '航路线索存在，但尚不足以直接启航。',
  nextStep: '前往旧港核对潮汐记录',
}

const migrated = migrateEnginePersistedState({
  narrativeHistory: [
    {
      id: 'legacy-branch',
      text: '你选择寻找北境航道。',
      isComplete: true,
      timestamp: 1,
      resolvedChoice: legacyChoice,
    },
    {
      id: 'legacy-progress',
      text: '你在旧港找到第一批潮汐记录。',
      isComplete: true,
      timestamp: 2,
      intentResolution: progressingResolution,
    },
  ],
}, 3)

assertOk(ENGINE_STORE_SCHEMA_VERSION === 5, 'EngineStore branch and legendary encounter projection must use schema version 5')
assertOk(
  Array.isArray(migrated.branchIntents)
    && migrated.branchIntents.length === 1
    && migrated.branchIntents[0]?.resolution?.progress === 35,
  'v3 persistence must rebuild the unresolved intent and its committed progress from history',
)
assertOk(
  migrated.focusedBranchIntentId === legacyIntentId,
  'v3 persistence migration must rebuild focused intent ownership',
)

const rebuiltAfterInvalidProjection = migrateEnginePersistedState({
  ...migrated,
  branchIntents: [{ intentId: 'malformed-partial-entry' }],
  archivedBranchIntents: [],
}, 4)
assertOk(
  rebuiltAfterInvalidProjection.branchIntents?.[0]?.intentId === legacyIntentId,
  'a malformed current projection must be rejected as a whole and rebuilt from committed history',
)

useEngineStore.getState().reset()
useEngineStore.setState({
  totalRounds: 2,
  narrativeHistory: [
    {
      id: 'refresh-old',
      text: '你在旧港议事厅看见第一条去往北境的线索。',
      isComplete: true,
      timestamp: 10,
      isBranchPoint: true,
      branchOptions: [legacyChoice, '留在旧港经营船坞'],
      resolvedChoice: legacyChoice,
    },
    {
      id: 'refresh-new',
      text: '新的领航员带来了同一目标的另一条入口。',
      isComplete: true,
      timestamp: 11,
      isBranchPoint: true,
      branchOptions: [legacyChoice, '转向南境商路'],
    },
  ],
  currentNarrative: '新的领航员带来了同一目标的另一条入口。',
})

const beforeRefresh = new OrchestratorSystem()
beforeRefresh.hydrateFromEngineStore()
useEngineStore.getState().resolveBranch('refresh-new', legacyChoice)
beforeRefresh.resolveBranchChoice('refresh-new', legacyChoice)

const persistedBeforeRefresh = useEngineStore.getState()
assertOk(
  persistedBeforeRefresh.branchIntents.length === 2
    && persistedBeforeRefresh.focusedBranchIntentId === 'branch:refresh-new',
  'a new branch must focus the latest choice while preserving every non-terminal intent',
)
assertOk(
  persistedBeforeRefresh.archivedBranchIntents.length === 0,
  'a similar new choice must not archive an unresolved earlier intent',
)

const afterRefresh = new OrchestratorSystem()
afterRefresh.hydrateFromEngineStore()
assertOk(
  afterRefresh.getFocusedBranchIntent()?.branchId === 'refresh-new'
    && afterRefresh.getActiveBranchIntents().length === 2,
  'hydration must restore the focused intent and every other unresolved intent',
)
assertOk(
  afterRefresh.getArchivedBranchIntents().length === 0,
  'hydration must not invent an archive entry for a non-terminal intent',
)

const ghostProjection = migrateEnginePersistedState({
  ...migrated,
  branchIntents: [{
    intentId: 'branch:ghost-branch',
    branchId: 'ghost-branch',
    choice: '夺取不存在的王位',
    createdRound: 1,
    updatedRound: 1,
  }],
  archivedBranchIntents: [],
  focusedBranchIntentId: 'branch:ghost-branch',
}, 4)
assertOk(
  ghostProjection.branchIntents?.[0]?.intentId === legacyIntentId
    && ghostProjection.focusedBranchIntentId === legacyIntentId,
  'a valid-shaped projection without narrative-history provenance must be rejected as a whole',
)

const snapshotRuntime = new OrchestratorSystem()
const currentLifeRunId = snapshotRuntime.getState().lifeRunId
const firstText = '旧港钟楼下，领航员把潮汐表铺在木桌上。'
const secondText = '旧港钟楼下，领航员再次把潮汐表铺在木桌上。'
const firstMetric = calculateNarrativeRepetitionMetric({
  round: 1,
  text: firstText,
  recentHistory: [],
})
const secondMetric = calculateNarrativeRepetitionMetric({
  round: 2,
  text: secondText,
  recentHistory: [{ round: 1, text: firstText }],
})
const legacySnapshot = snapshotRuntime.captureSnapshot()
legacySnapshot.state = {
  ...legacySnapshot.state,
  totalRounds: 2,
  narrativeHistory: [
    { id: 'old-round-1', text: firstText, isComplete: true, timestamp: 21, repetitionMetric: firstMetric },
    { id: 'old-round-2', text: secondText, isComplete: true, timestamp: 22, repetitionMetric: secondMetric },
  ],
  currentNarrative: secondText,
}
delete legacySnapshot.state.lifeRunId
delete legacySnapshot.state.storyRepetitionStats

snapshotRuntime.restoreSnapshot(legacySnapshot)
assertOk(
  snapshotRuntime.getState().lifeRunId === currentLifeRunId,
  'a legacy snapshot without lifeRunId must retain the current valid run id',
)
assertOk(
  snapshotRuntime.getState().storyRepetitionStats.rounds === 2
    && snapshotRuntime.getState().storyRepetitionStats.measuredRounds === 1,
  'a legacy snapshot without repetition summary must rebuild it from history metrics',
)

const validProjection = useEngineStore.getState().branchIntents
const rejected = useEngineStore.getState().setBranchIntentProjection({
  branchIntents: [{
    intentId: 'branch:ghost-runtime',
    branchId: 'ghost-runtime',
    choice: '覆盖真实历史',
    createdRound: 1,
    updatedRound: 1,
  }],
  archivedBranchIntents: [],
  focusedBranchIntentId: 'branch:ghost-runtime',
})
assertOk(
  rejected === false && useEngineStore.getState().branchIntents === validProjection,
  'the Store write API must reject valid-shaped ghost projections atomically',
)

if (failed > 0) process.exit(1)
console.log('PASS: branch-intent-persistence-smoke')
