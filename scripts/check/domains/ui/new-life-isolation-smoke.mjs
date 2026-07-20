/**
 * 新人生隔离：直接进入世界选择、切换创建世界和活动子系统重置回归。
 */

class MemoryStorage {
  constructor() {
    this.data = new Map()
  }

  get length() { return this.data.size }
  key(index) { return [...this.data.keys()][index] ?? null }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null }
  setItem(key, value) { this.data.set(String(key), String(value)) }
  removeItem(key) { this.data.delete(String(key)) }
  clear() { this.data.clear() }
}

const localStorage = new MemoryStorage()
Object.defineProperty(globalThis, 'localStorage', { value: localStorage, configurable: true })
Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true })
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true })

const [
  { configStore },
  { useGlobalStore },
  { useEngineStore },
  { orchestrator },
  { useCharacterStore },
  { useWorldStore },
  { prepareNewLifeWorldCommit },
] = await Promise.all([
  import('../../../../src/core/storage/local-storage.ts'),
  import('../../../../src/core/global-store/global-store.ts'),
  import('../../../../src/mods/mod-engine/store.ts'),
  import('../../../../src/mods/mod-engine/subsystems/orchestrator-system.ts'),
  import('../../../../src/mods/mod-character/store.ts'),
  import('../../../../src/mods/mod-world/store.ts'),
  import('../../../../src/mods/mod-pages/helpers/new-life-reset.ts'),
])

let failed = 0
function assertOk(condition, message) {
  if (condition) return
  failed++
  console.error(`FAIL: ${message}`)
}

let historicalResetCount = 0
orchestrator.clearExternalSubsystems()
orchestrator.registerSubsystem({
  id: 'historical-event-ledger',
  mod: 'mod-history-dynamics',
  label: '历史事件账本',
  description: '测试活动子系统',
  collectState: () => ({ id: 'historical-event-ledger', summary: '', data: {} }),
  applyChanges: () => {},
  reset: () => { historicalResetCount++ },
})

useGlobalStore.setState({
  allModsLoaded: true,
  gamePhase: 'simulation',
  worldviewId: 'modern',
  worldName: '旧世界',
  characterName: '旧角色',
})
useEngineStore.setState({
  totalRounds: 19,
  narrativeHistory: [{ id: 'old-story', text: '旧世界完整故事', timestamp: 1 }],
  currentNarrative: '旧世界完整故事',
})
useCharacterStore.setState({ name: '旧角色', characterId: 'char_old', age: 12, worldCode: 101 })
useWorldStore.setState({
  contexts: { ctx_old: { worldCode: 101 } },
  currentContextId: 'ctx_old',
  worldCode: 101,
  initialized: true,
  worldConfig: { name: '旧世界' },
})
configStore.set('mod-pages', 'talent-draw:101', { phase: 'ready' })
configStore.set('mod-pages', 'attribute-alloc:101', { physique: 10 })
configStore.set('mod-pages', 'fate-preview:101', { storySeed: '123' })
configStore.set('mod-pages', 'character-create-form:101', { name: '旧角色' })
configStore.set('mod-pages', 'mod-pages:world-customize-fields', { worldCode: 101 })
configStore.set('mod-settings', 'theme', 'dark')

const directEntryResult = await prepareNewLifeWorldCommit(202)
assertOk(directEntryResult === 'reset', 'direct world-selection entry with old narrative progress must force a reset')
assertOk(useEngineStore.getState().totalRounds === 0, 'new-life reset must clear old round count')
assertOk(useEngineStore.getState().narrativeHistory.length === 0, 'new-life reset must clear old complete story history')
assertOk(Object.keys(useWorldStore.getState().contexts).length === 0, 'new-life reset must clear the previous save-level world registry')
assertOk(useWorldStore.getState().worldCode === 0, 'new-life reset must clear the previous compatibility world code')
assertOk(useCharacterStore.getState().name === '', 'new-life reset must clear the previous character identity')
assertOk(historicalResetCount === 1, 'new-life reset must include the active P1 historical ledger after runtime registration')
assertOk(
  configStore.keys('mod-pages').every((key) => (
    !/^(talent-draw|attribute-alloc|fate-preview|character-create-form):/.test(key)
    && key !== 'mod-pages:world-customize-fields'
  )),
  'new-life reset must remove every per-life creation draft',
)
assertOk(configStore.get('mod-settings', 'theme') === 'dark', 'new-life reset must preserve player settings')
assertOk(useGlobalStore.getState().gamePhase === 'world_build', 'new-life reset must enter the world-build phase')
assertOk(
  useGlobalStore.getState().worldviewId === null
    && useGlobalStore.getState().worldName === ''
    && useGlobalStore.getState().characterName === '',
  'new-life reset must clear global flow projections',
)

useGlobalStore.setState({ gamePhase: 'world_build' })
useWorldStore.setState({
  contexts: { ctx_draft: { worldCode: 303 } },
  currentContextId: 'ctx_draft',
  worldCode: 303,
  initialized: true,
  worldConfig: { name: '创建中的世界' },
})
const sameDraftResult = await prepareNewLifeWorldCommit(303)
assertOk(sameDraftResult === 'preserved', 'returning to the same creation world must preserve valid draft state')
assertOk(Object.keys(useWorldStore.getState().contexts).length === 1, 'same-world creation return must keep the current context')

const changedDraftResult = await prepareNewLifeWorldCommit(404)
assertOk(changedDraftResult === 'reset', 'choosing a different world during creation must invalidate the old world and downstream state')
assertOk(Object.keys(useWorldStore.getState().contexts).length === 0, 'changed creation world must start from an empty save-level registry')
assertOk(historicalResetCount === 2, 'each forced new-life reset must clear active historical state exactly once')

const worldConfirmSource = await import('node:fs/promises')
  .then(({ readFile }) => readFile(new URL('../../../../src/mods/mod-pages/pages/world-select/useWorldConfirm.ts', import.meta.url), 'utf8'))
assertOk(
  worldConfirmSource.indexOf('await prepareNewLifeWorldCommit(worldCode)')
    < worldConfirmSource.indexOf('setWorldviewId(mappedWv)'),
  'direct-entry reset must finish before the next world projections are written',
)

orchestrator.clearExternalSubsystems()

if (failed > 0) process.exit(1)
console.log('PASS: new-life-isolation-smoke')
