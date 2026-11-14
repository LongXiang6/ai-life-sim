/**
 * Purpose: Verify custom-world genre defaults and narrative rule projection.
 * Owner: mod-world / custom-world settings.
 * Responsibility: Local mapping regression only; no AI calls or storage mutation.
 */

import assert from 'node:assert/strict'

import { PRESET_WORLDS } from '@/mods/mod-world/constants/presets/catalog'
import {
  buildWorldConfigFromCustom,
  buildWorldConfigFromPreset,
} from '@/mods/mod-world/utils/preset-to-config'
import { resolvePresetWorldCode } from '@/mods/mod-world/utils/preset-world-code'

function build(worldview: string, coreRules = '') {
  return buildWorldConfigFromCustom({
    name: '测试世界',
    description: '一个用于验证世界配置的原创设定。',
    worldview,
    coreRules,
  }, 'normal')
}

const cultivation = build('xianxia', '修炼会消耗记忆，不能复活死者。')
assert.equal(cultivation.essenceTag, 'xianxia')
assert.equal(cultivation.powerSystemTag, 'cultivation')
assert.equal(cultivation.powerFramework.enabled, true)
assert.match(cultivation.description, /【世界题材】仙侠修炼/)
assert.match(cultivation.description, /【核心规则】\n修炼会消耗记忆，不能复活死者。/)

const scifi = build('scifi')
assert.equal(scifi.essenceTag, 'scifi')
assert.equal(scifi.powerSystemTag, 'technology')
assert.equal(scifi.civilizationStage, 'information')
assert.match(scifi.description, /【世界题材】科幻/)

const interstellar = build('interstellar')
assert.equal(interstellar.spatialForm, 'universe')
assert.equal(interstellar.civilizationStage, 'space')

const modern = build('modern')
assert.equal(modern.powerSystemTag, 'none')
assert.equal(modern.powerFramework.enabled, false)

const legacyCultivation = build('materialist_cultivation')
assert.equal(legacyCultivation.essenceTag, 'materialist_cultivation')
assert.equal(legacyCultivation.powerSystemTag, 'cultivation')
assert.equal(build('idealist').worldType, 'xianxia')
assert.equal(build('auto').worldType, 'modern')

const custom = build('custom', '不存在灵气，所有异常均有可验证的物理原因。')
assert.equal(custom.essenceTag, 'mixed')
assert.equal(custom.powerSystemTag, 'mixed')
assert.match(custom.description, /【核心规则】\n不存在灵气，所有异常均有可验证的物理原因。/)

const unknown = build('unregistered-genre')
assert.equal(unknown.worldType, 'custom')
assert.equal(unknown.essenceTag, 'mixed')

const presetsById = new Map(PRESET_WORLDS.map((preset) => [preset.id, preset]))
const nearFuturePreset = presetsById.get('skyline-2088')
const interstellarPreset = presetsById.get('beacon-frontier')
const mysteryPreset = presetsById.get('night-crossing-records')
assert.ok(nearFuturePreset)
assert.ok(interstellarPreset)
assert.ok(mysteryPreset)

const nearFuture = buildWorldConfigFromPreset(nearFuturePreset, 'normal')
assert.equal(nearFuture.essenceTag, 'scifi')
assert.equal(nearFuture.powerSystemTag, 'technology')
assert.equal(nearFuture.powerFramework.enabled, true)
assert.equal(nearFuture.spatialForm, 'plane')
assert.equal(nearFuture.civilizationStage, 'information')

const interstellarPresetConfig = buildWorldConfigFromPreset(interstellarPreset, 'normal')
assert.equal(interstellarPresetConfig.spatialForm, 'universe')
assert.equal(interstellarPresetConfig.civilizationStage, 'space')

const mystery = buildWorldConfigFromPreset(mysteryPreset, 'normal')
assert.equal(mystery.spatialForm, 'plane')
assert.equal(mystery.civilizationStage, 'industrial')

const worldCodes = PRESET_WORLDS.map(resolvePresetWorldCode)
assert.equal(new Set(worldCodes).size, PRESET_WORLDS.length)
assert.ok(worldCodes.filter((code) => code >= 48).length === 8)

console.log('[OK] world settings — custom genre profiles and preset scale/rule mapping passed')
