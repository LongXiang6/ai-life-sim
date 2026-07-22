/** 叙事重复与修复候选提交门禁回归。 */

import {
  checkNarrativeRepetition,
  chooseNarrativeRepetitionRepair,
} from '../../../../src/mods/mod-engine/helpers/narrative-repetition-detection.ts'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const monthOne = '三月，四人来到旧公会训练场。导师摆好木桩，众人依次练习剑术，傍晚又围在地图旁讨论远征路线，最后收拾行囊等待命令。'
const monthTwo = '四月，四人来到旧公会训练场。导师摆好木桩，众人依次练习剑术，傍晚又围在地图旁讨论远征路线，最后收拾行囊等待命令。'
assert(
  checkNarrativeRepetition(monthTwo, [monthOne]).kind === 'text-overlap',
  'changing only the month must still be detected as repeated narrative',
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

const freshCandidate = '<正文开始>队伍抵达遗迹并破解星图机关。<正文结束><摘要开始>抵达遗迹<摘要结束><数据开始>{"changes":[]}<数据结束>'
const accepted = chooseNarrativeRepetitionRepair({
  previousContent,
  candidateContent: freshCandidate,
  candidateBody: '队伍抵达遗迹并破解星图机关，门后出现了新的地下通道。',
  candidateProtocolValid: true,
  recentHistory: departedHistory,
})
assert(accepted.accepted && accepted.content === freshCandidate, 'valid advancing repair must be accepted')

console.log('[narrative-repetition-smoke] PASS')
