/**
 * Purpose: Regress the batched main-story response and persistent queue lifecycle.
 * Owner: quality:narrative
 * Responsibility: Verify batch parsing, one-round consumption, invalidation, and save/restore.
 */

import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

import { getProjectRoot } from '../../lib/project-root.mjs'
import { useSettingsStore } from '../../../../src/mods/mod-settings/settings-runtime-api.ts'
import { buildSegmentedPrompt } from '../../../../src/core/ai-service/prompt-builder.ts'
import { executeMainNarrativeRequest, prepareMainNarrativeRequest } from '../../../../src/mods/mod-engine/helpers/main-narrative-call.ts'
import { narrativePrompt } from '../../../../src/mods/mod-engine/prompts/narrative-prompt.ts'
import { OrchestratorSystem } from '../../../../src/mods/mod-engine/subsystems/orchestrator-system.ts'

const root = getProjectRoot(import.meta.url)
const read = (relativePath) => fs.readFile(path.join(root, relativePath), 'utf8')
const campaign = await read('src/mods/mod-engine/campaigns/default/index.ts')
const orchestratorSource = await read('src/mods/mod-engine/subsystems/orchestrator-system.ts')
const mainCallSource = await read('src/mods/mod-engine/helpers/main-narrative-call.ts')
const hooksSource = await read('src/mods/mod-engine/hooks.ts')
const acceptanceSource = await read('src/mods/mod-engine/subsystems/orchestrator-system/narrative-acceptance-runtime.ts')

assert.equal(mainCallSource.includes('故事批次'), true)
assert.equal(mainCallSource.includes('queuedResponses'), true)
assert.equal(campaign.includes('consumePendingNarrativeBatch('), true)
assert.equal(campaign.includes('setPendingNarrativeBatch('), true)
assert.equal(campaign.includes('clearPendingNarrativeBatch()'), true)
assert.equal(orchestratorSource.includes('pendingNarrativeBatch: Array.isArray(rawState.pendingNarrativeBatch)'), true)
assert.equal(hooksSource.includes('pendingNarrativeBatch: structuredClone(o.pendingNarrativeBatch)'), true)
assert.equal(acceptanceSource.includes('orchestrator.clearPendingNarrativeBatch()'), true)

useSettingsStore.setState({
  provider: 'custom',
  customKey: 'fixture-key',
  customUrl: 'https://example.invalid/v1',
  customModel: 'fixture-model',
  temperature: 0.4,
  reasoningEffort: 'high',
  storySeed: '',
  narrativeStyleText: '',
  narrativeStyleVersion: 0,
  narrativeAddressing: 'second-person',
  wordCountTarget: 100,
  preGenerateRounds: 1,
})

const owner = new OrchestratorSystem()
const promptContext = {
  worldNarrativeView: { 名称: '测试世界', 描述: '存在明确制度与资源边界的测试世界。' },
  characterProfileView: {
    姓名: '测试者',
    性别: '未设定',
    种族: '人类',
    背景: '已确认的出生背景与早期处境。',
    基础属性: {},
  },
  characterStatusView: { 年龄: 0, 属性数值: { mind: 1, physique: 1, charisma: 1, familyBackground: 2 } },
  subsystemSummaries: [],
  timelineMemory: [],
  recentStories: [],
  currentTime: '测试纪元',
  narrativeTimeWindow: '本轮覆盖一年。',
  narrativeBatchSize: 3,
  wordCountInstruction: '正文约100字。',
  narrativeAddressing: 'second-person',
  talents: [{ 名称: '测试天赋', 效果: '在符合条件时改变玩家获得机会的方式。', 引用: '命格-1' }],
  playerBranchIntent: undefined,
}
owner.setContext(
  { contextId: 'world:batch', contextKind: 'world', simulationScope: 'active', name: '测试世界', description: '存在明确制度与资源边界的测试世界。', era: '测试纪元', config: {} },
  { characterId: 'character:batch', name: '测试者', age: 0, gender: 'unknown', background: '已确认的出生背景与早期处境。', attributes: {} },
)

const stories = [
  { 正文: '第一轮宏观事件已经改变了你的机会。', 命运分支: false, 属性: { 心智: 1, 体魄: 1, 魅力: 1, 财富: 2 }, 结局: false },
  { 正文: '第二轮事件让你进入新的组织网络。', 命运分支: false, 属性: { 心智: 1, 体魄: 1, 魅力: 1, 财富: 2 }, 结局: false },
  { 正文: '第三轮事件把你的责任推向更大的公共范围。', 命运分支: false, 属性: { 心智: 1, 体魄: 1, 魅力: 1, 财富: 2 }, 结局: false },
]

const originalFetch = globalThis.fetch
const requests = []
globalThis.fetch = async (_input, init) => {
  requests.push(JSON.parse(String(init?.body ?? '{}')))
  return new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({ 故事批次: stories }) }, finish_reason: 'stop' }],
  }), { status: 200, headers: { 'content-type': 'application/json' } })
}

try {
  const prepared = prepareMainNarrativeRequest({
    owner,
    promptTemplate: narrativePrompt,
    promptContext,
    aiConfig: { model: 'fixture-model', temperature: 0.4, stream: false, reasoningEffort: 'high' },
  })
  const result = await executeMainNarrativeRequest(prepared, 'real')
  assert.equal(result.quality.parsed.narrative, stories[0].正文)
  assert.equal(result.queuedResponses.length, 2)
  assert.equal(JSON.parse(result.queuedResponses[0]).正文, stories[1].正文)
  assert.equal(JSON.parse(result.queuedResponses[1]).正文, stories[2].正文)
  assert.equal(requests.length, 1)

  const invalidSecond = { ...stories[1], 正文: '' }
  globalThis.fetch = async (_input, init) => {
    requests.push(JSON.parse(String(init?.body ?? '{}')))
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ 故事批次: [stories[0], invalidSecond, stories[2]] }) }, finish_reason: 'stop' }],
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const partial = await executeMainNarrativeRequest(prepared, 'real')
  assert.equal(partial.queuedResponses.length, 0)

  const queued = stories.slice(1).map((story, index) => ({ roundSequence: index + 2, response: JSON.stringify(story) }))
  owner.setPendingNarrativeBatch(queued)
  assert.equal(owner.getPendingNarrativeBatch().length, 2)
  assert.equal(owner.consumePendingNarrativeBatch(1), undefined)
  assert.equal(owner.consumePendingNarrativeBatch(2), queued[0].response)
  assert.equal(owner.getPendingNarrativeBatch().length, 1)
  owner.setPendingNarrativeBatch(queued)
  const saved = owner.exportPersistenceState(false)
  const restored = new OrchestratorSystem()
  restored.importPersistenceState(saved, false)
  assert.deepEqual(restored.getPendingNarrativeBatch(), queued)
  restored.clearPendingNarrativeBatch()
  assert.deepEqual(restored.getPendingNarrativeBatch(), [])
  restored.importPersistenceState({ ...saved, state: { ...saved.state, pendingNarrativeBatch: undefined } }, false)
  assert.deepEqual(restored.getPendingNarrativeBatch(), [])

  owner.setPendingNarrativeBatch(queued)
  owner.setTimeStep({ unit: 'month', value: 1 })
  assert.deepEqual(owner.getPendingNarrativeBatch(), [])
  owner.setPendingNarrativeBatch(queued)
  owner.setLastPlayerChoice('new direction')
  assert.deepEqual(owner.getPendingNarrativeBatch(), [])

  const payload = JSON.parse(buildSegmentedPrompt(narrativePrompt, promptContext).userSegments[0])
  assert.equal(payload[4].本次信息.批量输出.includes('3轮'), true)
  assert.equal(payload[4].本次信息.批量输出.includes('每项独立覆盖各自时间跨度'), true)
  assert.equal(payload[4].本次信息.批量输出.includes('只承接已成立事实'), true)
} finally {
  globalThis.fetch = originalFetch
}

const formalBefore = owner.exportPersistenceState()
const prepared = owner.prepareNarrativeResponse({
  narrative: '正文已经发布，但后续分析仍需收束。',
})
owner.commitNarrativeResponse(prepared.narrativeId)
owner.discardNarrativeResponse(prepared.narrativeId, '附加分析测试失败')
assert.equal(owner.getState().narrativeHistory.at(-1)?.text, '正文已经发布，但后续分析仍需收束。')
assert.equal(owner.getState().narrativeHistory.at(-1)?.transitionAudit?.trusted, false)
assert.equal(formalBefore.state.narrativeHistory.length + 1, owner.getState().narrativeHistory.length)

console.log('PASS: runtime-subsystem-state-regression')
