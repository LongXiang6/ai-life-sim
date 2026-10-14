/**
 * Purpose: Regress account draft and completed-life persistence limits.
 * Owner: quality:account
 * Responsibility: Isolated storage fixtures and persistence assertions only.
 */

import assert from 'node:assert/strict'

class MemoryStorage {
  constructor() { this.data = new Map() }
  get length() { return this.data.size }
  key(index) { return [...this.data.keys()][index] ?? null }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null }
  setItem(key, value) { this.data.set(String(key), String(value)) }
  removeItem(key) { this.data.delete(String(key)) }
}

const storage = new MemoryStorage()
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true })
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true })

storage.setItem('mod-pages:persist:character-creation-draft', JSON.stringify({
  state: { draft: { schemaVersion: 99, name: '恶意未来版本' } },
  version: 99,
}))

const [
  { getCharacterCreationDraftSnapshot, useCharacterCreationDraftStore },
  { clearNewLifeCreationDrafts },
  { configStore },
  contract,
  { saveManager },
  { useLifeRecordStore },
  { useReincarnationLibraryStore },
] = await Promise.all([
  import('../../../../src/mods/mod-pages/helpers/character-creation-draft-store.ts'),
  import('../../../../src/mods/mod-pages/helpers/creation-draft-storage.ts'),
  import('../../../../src/core/storage/local-storage.ts'),
  import('../../../../src/core/account/account-contract.ts'),
  import('../../../../src/core/storage/save-manager.ts'),
  import('../../../../src/mods/mod-character/life-record-store.ts'),
  import('../../../../src/mods/mod-character/reincarnation-library-store.ts'),
])

assert.equal(useCharacterCreationDraftStore.getState().draft.name, '')
assert.equal(contract.CloudCharacterDraftSchema.safeParse({ schemaVersion: 2 }).success, false)

const background = `长期背景：${'原文必须保留。'.repeat(2000)}`
useCharacterCreationDraftStore.getState().updateDraft({
  name: '沈长明',
  gender: '流性别',
  race: '云上住民',
  background,
  manualLifespan: '240',
  manualStartingAge: '21',
  customGenders: ['流性别'],
  customRaces: ['云上住民'],
  backgroundPresets: { 云城: background },
})

const expected = structuredClone(useCharacterCreationDraftStore.getState().draft)
const persisted = JSON.parse(storage.getItem('mod-pages:persist:character-creation-draft'))
assert.equal(persisted.state.draft.background, background)
assert.equal('attributes' in expected, false)
assert.equal('attributes' in persisted.state.draft, false)
assert.deepEqual(getCharacterCreationDraftSnapshot().attributes, {
  mind: 0,
  physique: 0,
  charisma: 0,
  familyBackground: 0,
})

let changes = 0
const unsubscribe = useCharacterCreationDraftStore.subscribe(() => { changes++ })
useCharacterCreationDraftStore.getState().replaceDraft(expected)
unsubscribe()
assert.equal(changes, 0, 'equal cloud snapshots must not trigger another sync')

configStore.set('mod-pages', 'talent-draw:1', { phase: 'ready' })
configStore.set('mod-pages', 'character-create-form:1', { name: '废弃格式' })
clearNewLifeCreationDrafts()
assert.deepEqual(useCharacterCreationDraftStore.getState().draft, expected)
assert.equal(configStore.get('mod-pages', 'talent-draw:1'), null)
assert.equal(configStore.get('mod-pages', 'character-create-form:1'), null)

await assert.rejects(
  () => saveManager.saveToSlot(11, '越界存档', '', '', {}),
  /1-10/u,
)

const records = Array.from({ length: 10 }, (_, index) => ({
  recordId: `record-${index}`,
  completedAt: index,
  characterName: '沈长明',
  worldName: '云城',
  finalAge: 80,
  rounds: 10,
  died: true,
  overallScore: 80,
  dimensions: [],
  destinyNames: [],
  gameVersion: '5.2.2',
}))
useLifeRecordStore.getState().replaceRecords(records)
assert.throws(
  () => useLifeRecordStore.getState().upsertRecord({ ...records[0], recordId: 'record-11' }),
  /战绩栏位已满/u,
)
assert.equal(useLifeRecordStore.getState().records.length, 10)

const talents = Array.from({ length: 36 }, (_, index) => ({
  id: `reincarnation-${index}`,
  lineageId: `lineage-${index}`,
  version: 1,
  name: `神话${index}`,
  description: `概念${index}`,
  category: 'enhancement',
  rarity: 'mythic',
  effect: '保持完整。',
  attrBonus: {},
  strengthenLevel: 1,
  acquiredAt: index,
  source: { worldName: '云城', characterName: '沈长明', runId: `run-${index}` },
}))
useReincarnationLibraryStore.getState().replaceReincarnationTalents(talents)
assert.throws(
  () => useReincarnationLibraryStore.getState().addReincarnationTalent({
    ...talents[0],
    id: 'reincarnation-36',
    lineageId: 'lineage-36',
    name: '第三十七项',
    source: { ...talents[0].source, runId: 'run-36' },
  }),
  /轮回天赋栏位已满/u,
)
assert.equal(useReincarnationLibraryStore.getState().talents.length, 36)

console.log('[character-draft-persistence-smoke] PASS')
