/** 叙事重复与修复候选提交门禁回归。 */

import { readFileSync } from 'node:fs'

import {
  checkNarrativeRepetition,
  chooseNarrativeRepetitionRepair,
  inspectPrefetchedNarrativeRepetition,
} from '../../../../src/mods/mod-engine/helpers/narrative-repetition-detection.ts'
import {
  NARRATIVE_REPETITION_AUDIT_SERVER_PROMPT_ASSET_ID,
  NARRATIVE_REPETITION_REPAIR_SERVER_PROMPT_ASSET_ID,
  narrativeRepetitionAuditPrompt,
  narrativeRepetitionRepairPrompt,
  parseNarrativeRepetitionAuditOutput,
  parseNarrativeRepetitionRepairOutput,
} from '../../../../src/mods/mod-engine/prompts/narrative-repetition-repair-prompt.ts'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const monthOne = '三月，四人来到旧公会训练场。导师摆好木桩，众人依次练习剑术，傍晚又围在地图旁讨论远征路线，最后收拾行囊等待命令。'
const monthTwo = '四月，四人来到旧公会训练场。导师摆好木桩，众人依次练习剑术，傍晚又围在地图旁讨论远征路线，最后收拾行囊等待命令。'
assert(
  checkNarrativeRepetition(monthTwo, [monthOne]).kind === 'text-overlap',
  'changing only the month must still be detected as repeated narrative',
)
assert(
  inspectPrefetchedNarrativeRepetition(monthTwo, [monthOne]).canConsume === false,
  'a repeated prefetched candidate must be discarded before player-visible consumption',
)

const campaignSource = readFileSync(
  new URL('../../../../src/mods/mod-engine/campaigns/default/index.ts', import.meta.url),
  'utf8',
)
const prefetchedStart = campaignSource.indexOf(
  'const prefetched = orchestrator.consumePrefetchedNarrative()',
)
const prefetchedGate = campaignSource.indexOf(
  'const prefetchDecision = inspectPrefetchedNarrativeRepetition(',
  prefetchedStart,
)
const prefetchedConsume = campaignSource.indexOf(
  'if (prefetchDecision.canConsume)',
  prefetchedGate,
)
const realtimeGeneration = campaignSource.indexOf(
  'const { customKey, provider, customUrl, customModel, storySeed }',
  prefetchedConsume,
)
const prefetchedBlock = campaignSource.slice(prefetchedConsume, realtimeGeneration)
assert(
  prefetchedStart >= 0
    && prefetchedGate > prefetchedStart
    && prefetchedConsume > prefetchedGate
    && realtimeGeneration > prefetchedConsume
    && prefetchedBlock.includes('ctx._fullContent = candidateContent')
    && prefetchedBlock.includes('return')
    && prefetchedBlock.includes('已丢弃缓存并改为实时生成'),
  'prefetched narratives must pass repetition gating before return, with rejected cache falling through to realtime generation',
)

const departedHistory = [
  '队伍完成补给后正式出发，越过城门前往北方遗迹。',
  '他们踏上征途，沿河谷行进并在夜里确认了遗迹方向。',
]
const regressed = checkNarrativeRepetition(
  '新的一月，众人再次站在公会训练场，准备重新出发，并制定远征计划。',
  departedHistory,
)
assert(
  regressed.isRepetitive && regressed.kind === 'stage-regression' && regressed.matchedIndex === 1,
  'departure followed by unexplained preparation reset must be rejected',
)

const previousContent = '<正文开始>上一版完整正文<正文结束><摘要开始>摘要<摘要结束><数据开始>{"changes":[]}<数据结束>'
const invalidCandidate = chooseNarrativeRepetitionRepair({
  previousContent,
  candidateContent: '短兜底',
  candidateBody: null,
  candidateProtocolValid: false,
  recentHistory: [monthOne],
})
assert(
  !invalidCandidate.accepted && invalidCandidate.content === previousContent,
  'short fallback or invalid protocol must not overwrite the complete previous output',
)

const repeatedCandidate = chooseNarrativeRepetitionRepair({
  previousContent,
  candidateContent: '<正文开始>重复候选<正文结束>',
  candidateBody: monthTwo,
  candidateProtocolValid: true,
  recentHistory: [monthOne],
})
assert(
  !repeatedCandidate.accepted && repeatedCandidate.content === previousContent,
  'a retry that remains repetitive must preserve the previous output',
)

const foreshadowing = checkNarrativeRepetition(
  '抵达遗迹后，主角想起出发前训练场里导师提过的刻痕，于是把那条长期线索与门上的星图对应起来，找到了新的入口。',
  departedHistory,
)
assert(!foreshadowing.isRepetitive, 'causally advanced long-term foreshadowing must not be treated as a stage reset')
assert(
  inspectPrefetchedNarrativeRepetition(
    '队伍抵达遗迹后破解星图机关，石门后显露出新的地下通道。',
    departedHistory,
  ).canConsume === true,
  'a causally advancing prefetched candidate must remain consumable',
)

const freshCandidate = '<正文开始>队伍抵达遗迹并破解星图机关。<正文结束><摘要开始>抵达遗迹<摘要结束><数据开始>{"changes":[]}<数据结束>'
const accepted = chooseNarrativeRepetitionRepair({
  previousContent,
  candidateContent: freshCandidate,
  candidateBody: '队伍抵达遗迹并破解星图机关，门后出现了新的地下通道。',
  candidateProtocolValid: true,
  recentHistory: departedHistory,
})
assert(accepted.accepted && accepted.content === freshCandidate, 'valid advancing repair must be accepted')

const bodyOnlyRepair = [
  '⟦正文⟧',
  '你沿河谷抵达遗迹，先前确认的星图在石门上逐格亮起。',
  '',
  '机关转动后，通往地下的新入口终于显露。',
  '⟦结束⟧',
].join('\n')
const parsedBodyOnlyRepair = parseNarrativeRepetitionRepairOutput(bodyOnlyRepair)
assert(
  parsedBodyOnlyRepair?.narrative.includes('通往地下的新入口'),
  'dedicated repetition repair must accept a complete body-to-end envelope',
)
for (const [invalidOutput, label] of [
  ['⟦正文⟧\n改写正文\n⟦摘要⟧\n新增摘要\n⟦结束⟧', 'summary section'],
  ['⟦正文⟧\n改写正文\n⟦数据⟧\n{}\n⟦结束⟧', 'data section'],
  ['以下是结果\n⟦正文⟧\n改写正文\n⟦结束⟧', 'protocol-external explanation'],
  ['⟦正文⟧\n\n⟦结束⟧', 'empty body'],
]) {
  assert(
    parseNarrativeRepetitionRepairOutput(invalidOutput) === undefined,
    `dedicated repetition repair must reject ${label}`,
  )
}

assert(
  parseNarrativeRepetitionAuditOutput({
    事实一致: true,
    完整覆盖: true,
    覆盖证据: [{ 原文事实: '导师交付星图', 候选对应: '导师把星图递到你手中' }],
    冲突: [],
    遗漏: [],
  })?.完整覆盖 === true,
  'fact audit must accept only explicit consistency plus non-empty source coverage evidence',
)
const rejectedFactAudit = parseNarrativeRepetitionAuditOutput({
  事实一致: false,
  完整覆盖: true,
  覆盖证据: [{ 原文事实: '导师仍然存活', 候选对应: '候选声称导师已经死亡' }],
  冲突: [' 原文中导师仍然存活，候选却写成导师已经死亡 '],
  遗漏: [],
})
assert(
  rejectedFactAudit?.事实一致 === false
    && rejectedFactAudit.冲突[0] === '原文中导师仍然存活，候选却写成导师已经死亡',
  'fact audit must preserve a concrete trimmed conflict when rejecting a candidate',
)
for (const [invalidAudit, label] of [
  [{ 事实一致: true, 完整覆盖: true, 覆盖证据: [], 冲突: [], 遗漏: [] }, 'accepted result without coverage evidence'],
  [{ 事实一致: true, 完整覆盖: true, 覆盖证据: [{ 原文事实: '甲', 候选对应: '乙' }], 冲突: ['存在冲突'], 遗漏: [] }, 'consistent result with conflicts'],
  [{ 事实一致: false, 完整覆盖: true, 覆盖证据: [], 冲突: [], 遗漏: [] }, 'inconsistent result without conflicts'],
  [{ 事实一致: true, 完整覆盖: false, 覆盖证据: [], 冲突: [], 遗漏: [] }, 'incomplete result without omissions'],
  [{ 事实一致: true, 完整覆盖: true, 覆盖证据: [{ 原文事实: '甲', 候选对应: '乙' }], 冲突: [], 遗漏: [], 评分: 1 }, 'extra field'],
  [{ 事实一致: true, 冲突事实: [] }, 'legacy conflict field'],
  [{ 事实一致: 'true', 冲突: [] }, 'non-boolean verdict'],
  [null, 'null output'],
]) {
  assert(
    parseNarrativeRepetitionAuditOutput(invalidAudit) === undefined,
    `fact audit must reject ${label}`,
  )
}

assert(
  narrativeRepetitionRepairPrompt.systemPrompt === ''
    && narrativeRepetitionRepairPrompt.outputFormat === 'text'
    && narrativeRepetitionRepairPrompt.serverPromptAssetId
      === NARRATIVE_REPETITION_REPAIR_SERVER_PROMPT_ASSET_ID,
  'repetition repair client contract must carry only its protected text asset ID',
)
assert(
  narrativeRepetitionAuditPrompt.systemPrompt === ''
    && narrativeRepetitionAuditPrompt.outputFormat === 'json'
    && narrativeRepetitionAuditPrompt.outputSchema
    && narrativeRepetitionAuditPrompt.serverPromptAssetId
      === NARRATIVE_REPETITION_AUDIT_SERVER_PROMPT_ASSET_ID,
  'fact audit client contract must carry its protected JSON asset ID and strict schema',
)
assert(
  NARRATIVE_REPETITION_REPAIR_SERVER_PROMPT_ASSET_ID
    !== NARRATIVE_REPETITION_AUDIT_SERVER_PROMPT_ASSET_ID,
  'repair and fact audit must remain independent protected assets',
)

console.log('[narrative-repetition-smoke] PASS')
