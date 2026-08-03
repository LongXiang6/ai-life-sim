import { BaseSubsystem } from '@/core'
import { normalizeDecimalInteger, type RoundContext, type SubSystemChanges, type SubSystemState } from '@/foundation'
import type { ItemPersistenceState, ItemState, Item } from '../types'
import { DEFAULT_INVENTORY_CAPACITY, getItemPoolForWorldview } from '../constants'
import { calculateItemPrice } from '../utils'
import { clone, contextConfig, requiredContextId } from './economy-runtime'

export class ItemSystem extends BaseSubsystem {
  readonly id = 'item' as const
  readonly mod = 'mod-economy' as const
  readonly label = '物品' as const
  readonly description = '拥有物品身份、库存、装备、耐久与世界观过滤' as const
  private states: Record<string, ItemState> = {}
  private ensure(context: RoundContext): ItemState { return this.states[requiredContextId(context)] ??= { inventory: [], equipped: {}, capacity: DEFAULT_INVENTORY_CAPACITY } }
  advance(context: RoundContext): void {
    const state = this.ensure(context)
    for (const item of state.inventory) {
      if (item.durability < 0) continue
      item.durability = Math.max(0, item.durability - Math.floor(context.daysPassed / 365))
      if (item.durability === 0) item.tradable = false
    }
  }
  collectState(context: RoundContext): SubSystemState { const state = this.ensure(context); return { id: this.id, summary: `【物品】${state.inventory.length}/${state.capacity} 格`, data: structuredClone(state) } }
  applyChanges(changes: SubSystemChanges, context: RoundContext): void {
    const state = this.ensure(context)
    const payload = changes.changes
    if (payload.action === 'acquire' && typeof payload.name === 'string') {
      const config = contextConfig(context)
      const pool = getItemPoolForWorldview(config?.essenceTag ?? 'default')
      const template = pool.find((item) => item.name === payload.name)
      if (!template) throw new Error(`世界观没有该物品模板：${payload.name}`)
      const quantity = typeof payload.quantity === 'number' && Number.isInteger(payload.quantity) && payload.quantity > 0 ? payload.quantity : 1
      const price = calculateItemPrice(template.value, template.economicTierHint)
      const item: Item = {
        id: `item:${context.contextId}:${context.totalDays}:${state.inventory.length}`,
        ...template,
        quantity,
        value: normalizeDecimalInteger(price < 0 ? 0 : price),
        tradable: price >= 0,
        durability: template.category === 'consumable' ? -1 : 100,
      }
      if (state.inventory.length >= state.capacity) throw new Error('库存已满')
      state.inventory.push(item)
    }
    if (payload.action === 'discard' && typeof payload.itemId === 'string') state.inventory = state.inventory.filter((item) => item.id !== payload.itemId)
  }
  capturePersistenceState(): ItemPersistenceState { return { schemaVersion: 1, contexts: clone(this.states) } }
  restorePersistenceState(snapshot: unknown): void { this.states = snapshot ? clone((snapshot as ItemPersistenceState).contexts ?? {}) : {} }
  reset(): void { this.states = {} }
}
export const itemSystem = new ItemSystem()
