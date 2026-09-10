/**
 * Purpose: Regress deterministic local world-event candidate selection and Prompt adoption boundaries.
 * Owner: quality:narrative
 * Responsibility: Verify candidate generation stays read-only and reaches the approved dynamic message shape.
 */

import { buildNarrativeUserJson } from '../../../../src/core/ai-service/prompt-builder.ts'
import {
  buildWorldEventCandidateBatch,
  getWorldEventCatalogCategoryCounts,
  getWorldEventCatalogSize,
  isWorldEventCooldownReady,
} from '../../../../src/mods/mod-world/utils/world-event-candidates.ts'
import { buildWorldEventCandidatePromptProjection } from '../../../../src/mods/mod-engine/helpers/world-event-prompt-projection.ts'

let failed = 0

function assertOk(condition, message) {
  if (condition) return
  console.error(`FAIL: ${message}`)
  failed += 1
}

const catalogSize = getWorldEventCatalogSize()
const catalogCategoryCounts = getWorldEventCatalogCategoryCounts()
assertOk(catalogSize >= 20, 'world-event catalog must contain at least twenty reusable entries')
assertOk(
  Object.values(catalogCategoryCounts).every((count) => count >= 2),
  'world-event catalog must provide at least two entries for every category',
)

const regionProfile = {
  regionId: 'region:river',
  name: '雾河谷',
  summary: '有集市与河道的谷地',
  climate: '温带多雨',
  ecology: '湿地与季节性迁徙',
  resources: ['水', '木材'],
  pollution: '低',
  economy: '区域贸易',
  population: '中等',
  settlement: '城镇',
  culture: '多群体往来',
  education: '基础',
  socialStructure: '行会与家族并存',
  factions: '两支地方势力',
  law: '成文规章',
  updatedAtGlobalDay: 0,
}

const worldConfig = {
  name: '候选测试世界',
  essenceTag: 'modern',
  powerSystemTag: 'none',
  powerFramework: {
    id: 'fixture:power',
    label: '无超常力量',
    enabled: false,
    progression: 'bounded',
    ranks: [],
    source: 'world-default',
  },
  spatialForm: 'plane',
  civilizationStage: 'modern',
  difficulty: 'normal',
  description: '用于本地候选库测试。',
  festivalScope: 'china',
}

function makeInput(overrides = {}) {
  return {
    contextId: 'context:candidate-smoke',
    regionId: 'region:river',
    worldConfig,
    worldTags: null,
    legacyWorldTags: ['市场', '区域贸易'],
    calibration: {
      metadata: {
        essenceTag: 'modern',
        civilizationStage: 'modern',
        powerSystemTag: 'none',
        spatialForm: 'plane',
      },
      formulas: {
        eventDistributionStrategy: 'balanced',
        migrationRateModifier: 1.2,
        techProgressModifier: 1.2,
        disasterFrequencyModifier: 1,
      },
      scale: {},
    },
    regionProfile,
    roundSequence: 12,
    storySeed: 'candidate-seed',
    ...overrides,
  }
}

const first = buildWorldEventCandidateBatch(makeInput())
const repeat = buildWorldEventCandidateBatch(makeInput())
assertOk(
  JSON.stringify(first) === JSON.stringify(repeat),
  'same seed, context, region, and round must produce the same candidates and order',
)
assertOk(
  first.candidates.length >= 1 && first.candidates.length <= 3,
  'one round must expose a bounded candidate batch',
)
assertOk(
  first.candidates.every((candidate) => (
    candidate.contextId === 'context:candidate-smoke'
      && candidate.regionId === 'region:river'
      && candidate.generatedAtRound === 12
      && candidate.cooldownRounds >= 0
      && candidate.seedSelector === first.seedSelector
  )),
  'candidate metadata must retain deterministic scope, round, seed selector, and cooldown data',
)

const variedSeedKeys = new Set(
  ['seed-a', 'seed-b', 'seed-c'].map((storySeed) => (
    buildWorldEventCandidateBatch(makeInput({ storySeed })).candidates.map((candidate) => candidate.candidateKey).join('|')
  )),
)
assertOk(variedSeedKeys.size > 1, 'changing the story seed must be able to vary candidate selection')

const variedRound = buildWorldEventCandidateBatch(makeInput({ roundSequence: 13 }))
assertOk(
  variedRound.seedSelector !== first.seedSelector
    || JSON.stringify(variedRound.candidates) !== JSON.stringify(first.candidates),
  'changing the event round must change the deterministic selector or candidate batch',
)

const reserved = buildWorldEventCandidateBatch(makeInput({ cooldownState: first.nextCooldownState, roundSequence: 13 }))
assertOk(
  reserved.candidates.every((candidate) => !first.candidates.some((previous) => previous.candidateKey === candidate.candidateKey)),
  'caller-owned cooldown reservations must suppress the same candidate until its cooldown expires',
)
assertOk(!isWorldEventCooldownReady(15, 12, 3), 'cooldown remains active through the configured number of full rounds')
assertOk(isWorldEventCooldownReady(16, 12, 3), 'cooldown becomes eligible after the configured rounds elapse')

const apocalypseInputs = makeInput({
  storySeed: 'hazard-seed',
  worldConfig: { ...worldConfig, essenceTag: 'postApocalyptic', civilizationStage: 'industrial' },
  calibration: {
    metadata: {
      essenceTag: 'postApocalyptic',
      civilizationStage: 'industrial',
      powerSystemTag: 'none',
      spatialForm: 'plane',
    },
    formulas: {
      eventDistributionStrategy: 'apocalyptic',
      disasterFrequencyModifier: 2,
      migrationRateModifier: 1.4,
    },
    scale: {},
  },
})
const hazardRounds = Array.from({ length: 32 }, (_, index) => (
  buildWorldEventCandidateBatch({ ...apocalypseInputs, roundSequence: index }).candidates
))
assertOk(
  hazardRounds.flat().some((candidate) => candidate.category === 'hazard'),
  'trigger and calibration weighting must allow hazard candidates in an apocalyptic world',
)

const projection = buildWorldEventCandidatePromptProjection(first)
assertOk(Boolean(projection), 'non-empty candidate batches must have a Prompt projection')
assertOk(
  projection.includes('不是已经确认的状态')
    && projection.includes('合理采用、改写、略过或延后')
    && projection.includes('正文实际写出的内容才交给后续状态提取'),
  'Prompt projection must expose optional event material and正文-only state extraction',
)
assertOk(
  first.candidates.every((candidate) => (
    !projection.includes(candidate.candidateKey)
      && !projection.includes(candidate.contextId)
      && !projection.includes(candidate.seedSelector)
  )),
  'Prompt projection must not leak candidate keys, context IDs, or seed selectors',
)

const promptInput = buildNarrativeUserJson({
  worldNarrativeView: { 名称: '候选测试世界', 描述: '用于动态事实接线。' },
  characterProfileView: {
    姓名: '测试者',
    性别: '未设定',
    种族: '人类',
    背景: '普通居民',
    基础属性: {},
  },
  characterStatusView: { 年龄: 20 },
  subsystemSummaries: [],
  currentTime: '测试时间',
  narrativeStyle: '',
  narrativeAddressing: 'second-person',
  timelineMemory: [],
  talents: [],
  eventInjectionText: projection,
})
const roundFacts = promptInput[3]?.当前信息?.命运抉择
assertOk(
  typeof roundFacts === 'string'
    && roundFacts.includes('不是已经确认的状态')
    && roundFacts.includes('合理采用、改写、略过或延后'),
  'candidate projection must enter 当前信息.命运抉择 through eventInjectionText',
)

if (failed > 0) {
  console.error(`world-event-candidate-smoke: ${failed} failure(s)`)
  process.exit(1)
}

console.log('PASS: world-event-candidate-smoke')
