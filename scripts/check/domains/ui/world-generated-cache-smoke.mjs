import assert from 'node:assert/strict'

class MemoryStorage {
  #entries = new Map()

  get length() {
    return this.#entries.size
  }

  key(index) {
    return [...this.#entries.keys()][index] ?? null
  }

  getItem(key) {
    return this.#entries.get(key) ?? null
  }

  setItem(key, value) {
    this.#entries.set(String(key), String(value))
  }

  removeItem(key) {
    this.#entries.delete(key)
  }
}

const storage = new MemoryStorage()
globalThis.localStorage = storage
globalThis.window = globalThis

const targetWorldCode = 2
const otherWorldCode = 12
const targetKeys = [
  `ai-life-sim:mod-character:cache:destiny-pool:${targetWorldCode}`,
  `ai-life-sim:mod-character:cache:destiny-pool:3.4.0:${targetWorldCode}`,
  `ai-life-sim:mod-character:cache:destiny-pool:retired-version:${targetWorldCode}`,
  `ai-life-sim:mod-world:save:0:init-cal:${targetWorldCode}`,
  `ai-life-sim:mod-world:save:0:entities:${targetWorldCode}`,
  `ai-life-sim:mod-pages:config:talent-draw:${targetWorldCode}`,
  `ai-life-sim:mod-pages:config:fate-preview:${targetWorldCode}`,
  `ai-life-sim:mod-pages:config:attribute-alloc:${targetWorldCode}`,
  `ai-life-sim:mod-pages:config:character-create-form:${targetWorldCode}`,
]
const preservedKeys = [
  `ai-life-sim:mod-character:cache:destiny-pool:3.4.0:${otherWorldCode}`,
  `ai-life-sim:mod-world:save:0:init-cal:${otherWorldCode}`,
  'ai-life-sim:mod-pages:save:0:custom-worlds',
  'ai-life-sim:mod-world:save:0:world-state',
  'ai-life-sim:mod-settings:config:provider',
]

for (const key of [...targetKeys, ...preservedKeys]) {
  storage.setItem(key, JSON.stringify({ key }))
}

const {
  clearWorldGeneratedCache,
  hasWorldGeneratedCache,
  scanWorldCodesWithGeneratedCache,
} = await import('../../../../src/mods/mod-world/utils/world-generated-cache.ts')

const scannedCodes = scanWorldCodesWithGeneratedCache()
assert.equal(scannedCodes.has(targetWorldCode), true, 'versioned destiny pools must mark the world as cached')
assert.equal(scannedCodes.has(otherWorldCode), true, 'cache scanning must preserve other world codes')
assert.equal(hasWorldGeneratedCache(targetWorldCode), true, 'cached world lookup must include versioned destiny pools')

clearWorldGeneratedCache(targetWorldCode)

for (const key of targetKeys) {
  assert.equal(storage.getItem(key), null, `target-world cache key should be removed: ${key}`)
}
for (const key of preservedKeys) {
  assert.notEqual(storage.getItem(key), null, `unrelated state must be preserved: ${key}`)
}
assert.equal(hasWorldGeneratedCache(targetWorldCode), false, 'the cleared world must leave the cache index')
assert.equal(hasWorldGeneratedCache(otherWorldCode), true, 'another world cache must remain indexed')

console.log('PASS: world-generated-cache-smoke')
