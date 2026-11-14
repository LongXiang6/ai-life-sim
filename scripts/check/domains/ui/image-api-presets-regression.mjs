#!/usr/bin/env node
/**
 * Purpose: Regress local image API key persistence, preset selection, migration ordering, and export exclusion.
 * Owner: quality:ui
 * Responsibility: Settings image-preset behavior and secret-boundary assertions only.
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'

const values = new Map()
const localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
  clear: () => values.clear(),
}
globalThis.localStorage = localStorage
globalThis.window = { localStorage }

localStorage.setItem('mod-settings:store', JSON.stringify({
  state: {
    provider: 'custom',
    customKey: '',
    customUrl: 'https://api.deepseek.com/v1',
    customModel: 'deepseek-flash',
    imageApiBaseUrl: 'https://dasuapi.com',
    imageModel: 'gpt-image-2',
  },
  version: 15,
}))

const { useSettingsStore } = await import('../../../../src/mods/mod-settings/store.ts')
const { migrateLegacyImageApiKey } = await import('../../../../src/mods/mod-settings/image-api-key-migration.ts')
const settings = useSettingsStore.getState()
assert.equal(settings.imageApiBaseUrl, '', 'the precise legacy image endpoint default must migrate to empty')
assert.equal(settings.imageModel, 'gpt-image-2', 'the image model hint must remain')

const localKey = 'image-key-local-only-fixture'
settings.setImageApiBaseUrl('https://images.example.test/api/v2')
settings.setImageModel('gpt-image-2')
settings.setImageApiKey(localKey)
settings.saveImageApiPreset('本机网关')
const preset = useSettingsStore.getState().imageApiPresets[0]
assert.equal(preset.baseUrl, 'https://images.example.test/api/v2')
assert.equal(preset.apiKey, localKey)
assert.equal(
  JSON.parse(localStorage.getItem('mod-settings:store')).state.imageApiKey,
  localKey,
  'the current image key must persist automatically in local storage',
)
assert.equal(
  JSON.parse(localStorage.getItem('mod-settings:store')).state.imageApiBaseUrl,
  'https://images.example.test/api/v2',
  'the current image API URL must persist automatically in local storage',
)

useSettingsStore.getState().setImageApiBaseUrl('https://other.example.test')
useSettingsStore.getState().setImageModel('another-image-model')
useSettingsStore.getState().setImageApiKey('another-local-key')
useSettingsStore.getState().activateImageApiPreset(preset.id)
assert.equal(useSettingsStore.getState().imageApiBaseUrl, preset.baseUrl)
assert.equal(useSettingsStore.getState().imageModel, preset.model)
assert.equal(useSettingsStore.getState().imageApiKey, preset.apiKey)
useSettingsStore.getState().selectCurrentImageApiConfiguration()
assert.equal(useSettingsStore.getState().activeImageApiPresetId, null)
assert.equal(useSettingsStore.getState().imageApiKey, preset.apiKey, 'selecting the current config must preserve its local values')

useSettingsStore.getState().setImageApiBaseUrl('https://override.example.test/api/v2')
useSettingsStore.getState().setImageModel('replacement-model')
useSettingsStore.getState().setImageApiKey('replacement-local-key')
useSettingsStore.getState().saveImageApiPreset('本机网关')
const overwrittenPreset = useSettingsStore.getState().imageApiPresets[0]
assert.equal(overwrittenPreset.id, preset.id, 'saving a preset with the same name must overwrite it')
assert.equal(overwrittenPreset.baseUrl, 'https://override.example.test/api/v2')
assert.equal(overwrittenPreset.model, 'replacement-model')
assert.equal(overwrittenPreset.apiKey, 'replacement-local-key')
assert.equal(useSettingsStore.getState().imageApiPresets.length, 1)

useSettingsStore.getState().deleteImageApiPreset(preset.id)
assert.equal(useSettingsStore.getState().imageApiPresets.length, 0)
assert.equal(useSettingsStore.getState().imageApiKey, 'replacement-local-key', 'deleting a preset must not erase the current local configuration')

let legacyKeyRemains = true
await assert.rejects(migrateLegacyImageApiKey({
  readLegacyKey: async () => 'legacy-server-key',
  saveLocalKey: async () => {},
  verifyLocalKey: () => false,
  deleteLegacyKey: async () => { legacyKeyRemains = false },
}), /旧版服务端 Key 保持不变/u)
assert.equal(legacyKeyRemains, true, 'failed local persistence must preserve the legacy server key')

await assert.rejects(migrateLegacyImageApiKey({
  readLegacyKey: async () => 'legacy-server-key',
  saveLocalKey: async () => {},
  verifyLocalKey: () => true,
  deleteLegacyKey: async () => { throw new Error('legacy delete failed') },
}), /legacy delete failed/u)
assert.equal(legacyKeyRemains, true, 'failed server deletion must leave the legacy key available')

const migrationOrder = []
await migrateLegacyImageApiKey({
  readLegacyKey: async () => 'legacy-server-key',
  saveLocalKey: async () => { migrationOrder.push('local-save') },
  verifyLocalKey: () => { migrationOrder.push('local-verify'); return true },
  deleteLegacyKey: async () => { migrationOrder.push('server-delete'); legacyKeyRemains = false },
})
assert.deepEqual(migrationOrder, ['local-save', 'local-verify', 'server-delete'])
assert.equal(legacyKeyRemains, false)

const dataManagement = fs.readFileSync(
  new URL('../../../../src/mods/mod-settings/components/SettingsDataManagement.tsx', import.meta.url),
  'utf8',
)
const exportHandler = dataManagement.match(/const handleExport[\s\S]*?(?=const handleImport)/u)?.[0] ?? ''
assert.ok(exportHandler, 'the settings export handler must remain explicit')
assert.equal(exportHandler.includes('imageApiKey'), false, '.ailf export must not reference image API keys')
assert.equal(exportHandler.includes('imageApiPresets'), false, '.ailf export must not reference image presets')
const importHandler = dataManagement.match(/const handleImport[\s\S]*?(?=const handleCancelReset)/u)?.[0] ?? ''
assert.ok(importHandler, 'the settings import handler must remain explicit')
assert.equal(importHandler.includes('clearImageApiKey'), false, 'settings import must not delete a legacy server key')
assert.equal(importHandler.includes('imageApiKey:'), false, 'settings import must not overwrite the current local image key')
assert.equal(importHandler.includes('imageApiPresets:'), false, 'settings import must not overwrite local image presets')

console.log('[image-api-presets-regression] PASS')
