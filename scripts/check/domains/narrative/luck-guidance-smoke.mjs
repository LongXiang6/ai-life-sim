import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  classifyLuckDirection,
  createLuckNarrativeGuidance,
  LuckSystem,
  resolveLuckDirectionProbabilities,
} from '../../../../src/mods/mod-character/subsystems/luck-system.ts'

const context = {
  contextId: 'context:luck-smoke',
  contextScope: 'active',
  worldId: 'context:luck-smoke',
  characterId: 'character:luck-smoke',
  round: { year: 1, season: 0, month: 1 },
  timeStep: { unit: 'year', value: 1 },
  difficulty: 'normal',
  subsystemStates: {},
  roundSequence: 1,
  daysPassed: 365,
  totalDays: 365,
}

const system = new LuckSystem()
const initial = system.collectState(context).data
assert.ok(initial.luck >= -3 && initial.luck <= 3)
assert.equal(initial.contextId, context.contextId)
assert.equal(initial.narrativeGuidance, null)

assert.deepEqual(resolveLuckDirectionProbabilities(0), {
  badProbabilityPercent: 25,
  neutralProbabilityPercent: 50,
  goodProbabilityPercent: 25,
})
assert.deepEqual(resolveLuckDirectionProbabilities(10), {
  badProbabilityPercent: 0,
  neutralProbabilityPercent: 25,
  goodProbabilityPercent: 75,
})
assert.deepEqual(resolveLuckDirectionProbabilities(-10), {
  badProbabilityPercent: 75,
  neutralProbabilityPercent: 25,
  goodProbabilityPercent: 0,
})
assert.equal(classifyLuckDirection(10, 24.99), 'neutral')
assert.equal(classifyLuckDirection(10, 25), 'good')
assert.equal(classifyLuckDirection(-10, 74.99), 'bad')
assert.equal(classifyLuckDirection(-10, 75), 'neutral')

const deterministicGood = createLuckNarrativeGuidance(10, 1, 365, 0.999)
assert.equal(deterministicGood.direction, 'good')
assert.equal(deterministicGood.roll, 99.9)
assert.equal(deterministicGood.goodProbabilityPercent, 75)
assert.equal(createLuckNarrativeGuidance(0, 1, 365, 0.999999999).roll, 99.99)

const guidance = system.prepareNarrativeGuidance(context)
assert.equal(system.prepareNarrativeGuidance(context).roll, guidance.roll)
assert.equal(system.getNarrativeGuidance(context.contextId)?.direction, guidance.direction)

const previewSnapshot = system.capturePreviewState()
const nextContext = { ...context, roundSequence: 2, totalDays: 730 }
const nextGuidance = system.prepareNarrativeGuidance(nextContext)
assert.notEqual(nextGuidance.generatedAtRound, guidance.generatedAtRound)
system.restorePreviewState(previewSnapshot)
assert.deepEqual(system.getNarrativeGuidance(context.contextId), guidance)
assert.deepEqual(system.prepareNarrativeGuidance(nextContext, nextGuidance), nextGuidance)
assert.throws(
  () => system.prepareNarrativeGuidance(nextContext, { ...nextGuidance, roll: 100 }),
  /随机刻度无效/,
)

assert.throws(
  () => system.applyChanges({ id: 'luck', description: 'AI 改写气运', changes: { luck: 10 } }, context),
  /本地随机系统维护/,
)

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const preGenSource = fs.readFileSync(path.join(projectRoot, 'src/mods/mod-engine/helpers/pre-gen-queue.ts'), 'utf8')
const hooksSource = fs.readFileSync(path.join(projectRoot, 'src/mods/mod-engine/hooks.ts'), 'utf8')
const campaignSource = fs.readFileSync(path.join(projectRoot, 'src/mods/mod-engine/campaigns/default/index.ts'), 'utf8')
const runtimeConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, 'src/mods/mod-engine/helpers/mvp-stages-config.default.json'), 'utf8'))
const fieldRegistry = fs.readFileSync(path.join(projectRoot, 'src/mods/mod-engine/helpers/subsystem-field-registry.ts'), 'utf8')
const systemPromptSource = fs.readFileSync(path.join(projectRoot, 'src/mods/mod-engine/server/narrative-system-prompt.ts'), 'utf8')

assert.match(preGenSource, /luckGuidance: LuckNarrativeGuidance/)
assert.match(preGenSource, /getLastNarrativeLuckGuidance\(\)/)
assert.match(hooksSource, /setPrefetchedNarrative\(cached\.fullContent, cached\.luckGuidance\)/)
assert.match(campaignSource, /orchestrator\.advanceAllSubsystems\(\)/)
assert.ok(Object.values(runtimeConfig.stages).every((stage) => !stage.systemInstruction.includes('luck')))
assert.doesNotMatch(fieldRegistry, /['"]luck['"]:\s*\{[\s\S]*validated-write/)
assert.match(systemPromptSource, /玩家自定义分支内容 > 低优先级运气方向与其他参考建议/)
assert.match(campaignSource, /const cachedNarrative = orchestrator\.consumePrefetchedNarrative\(\)/)

console.log('PASS: luck-guidance-smoke')
