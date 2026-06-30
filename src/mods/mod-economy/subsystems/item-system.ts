/**
 * @module ItemSystem
 * @description 物品子系统：背包管理、耐久度衰减、叙事检测、世界观过滤、物品使用
 * @mod mod-economy
 */

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import { getRoundSequence, getAgeYearsDelta } from '@/foundation'
import type { ItemState, Item } from '../types'

import {
  DEFAULT_INVENTORY_CAPACITY,
  WORLDVIEW_ITEM_POOLS,
  getItemPoolForWorldview,
  NARRATIVE_ITEM_KEYWORDS,
  ITEM_ACQUIRE_VERBS,
  ITEM_LOSE_VERBS,
  ITEM_QUALITY_LABELS,
  clamp,
} from '../constants'
import { resolveStaticPoolWorldviewKey } from '@/mods/mod-world'

export class ItemSystem implements ISubSystem {
  readonly id = 'item' as const
  readonly mod = 'mod-economy' as const
  readonly label = '物品' as const
  readonly description = '管理背包物品、装备栏、耐久度衰减、叙事自动检测与世界观过滤' as const

  private state: ItemState = this.createInitialState()
  private _lastProcessedRound = -1

  private createInitialState(): ItemState {
    return {
      inventory: [],
      equipped: {},
      capacity: DEFAULT_INVENTORY_CAPACITY,
    }
  }

  collectState(context: RoundContext): SubSystemState {
    if (getRoundSequence(context) === this._lastProcessedRound) {
      return {
        id: this.id,
        summary: this.getSummaryText(),
        data: structuredClone(this.state as unknown as Record<string, unknown>),
      }
    }
    this._lastProcessedRound = getRoundSequence(context)

    // 每轮自动推进：耐久度衰减 + 清理损坏物品
    this.advanceItems(context)

    return {
      id: this.id,
      summary: this.getSummaryText(),
      data: structuredClone(this.state as unknown as Record<string, unknown>),
    }
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext): void {
    if (!changes || typeof changes !== 'object') {
      throw new Error(`[${this.id}] Invalid changes: expected object`)
    }
    if (changes.id !== this.id) {
      throw new Error(`[${this.id}] Changes ID mismatch`)
    }
    if (!changes.changes || typeof changes.changes !== 'object' || Array.isArray(changes.changes)) {
      throw new Error(`[${this.id}] Invalid changes.changes: expected plain object`)
    }
    if (!changes.description || changes.description.trim() === '') {
      throw new Error(`[${this.id}] Missing changes.description`)
    }
    const c = changes.changes as Record<string, unknown>

    // 添加物品到背包（支持预定义物品 + 自定义物品）
    if (c.addItem && typeof c.addItem === 'object') {
      this.addItem(c.addItem as Item)
    }

    // 自定义物品添加（AI 叙事中任意命名）
    if (c.addCustomItem && typeof c.addCustomItem === 'object') {
      const ci = c.addCustomItem as Record<string, unknown>
      const customItem: Item = {
        id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: typeof ci.name === 'string' ? ci.name : '未知物品',
        category: typeof ci.category === 'string' ? ci.category as Item['category'] : 'material',
        quality: typeof ci.quality === 'string' ? ci.quality as Item['quality'] : 'common',
        quantity: typeof ci.quantity === 'number' ? ci.quantity : 1,
        value: typeof ci.value === 'number' ? ci.value : 5,
        description: typeof ci.description === 'string' ? ci.description : '',
        tradable: true,
        durability: -1,
        narrativeEffect: typeof ci.narrativeEffect === 'string' ? ci.narrativeEffect : undefined,
      }
      this.addItem(customItem)
    }

    // 移除物品
    if (typeof c.removeItemId === 'string') {
      this.removeItem(c.removeItemId)
    }

    // 使用/消耗物品（减少数量）
    if (typeof c.useItemId === 'string' && typeof c.useQuantity === 'number') {
      this.useItem(c.useItemId, c.useQuantity)
    }

    // 装备物品
    if (typeof c.equipItemId === 'string') {
      this.equipItem(c.equipItemId)
    }

    // 卸下装备
    if (typeof c.unequipSlot === 'string') {
      this.unequipItem(c.unequipSlot)
    }

    // 调整背包容量
    if (typeof c.capacity === 'number') {
      this.state.capacity = clamp(c.capacity, 1, 200)
    }

    // 直接设置背包物品（AI 适配）
    if (Array.isArray(c.inventory)) {
      this.state.inventory = c.inventory as Item[]
    }
    if (c.equipped && typeof c.equipped === 'object') {
      this.state.equipped = c.equipped as Record<string, Item>
    }
  }

  // ─── 内部推进逻辑 ───

  private advanceItems(context: RoundContext): void {
    const years = getAgeYearsDelta(context)
    if (years <= 0) return

    // 背包物品耐久度衰减
    for (const item of this.state.inventory) {
      if (item.durability > 0) {
        // 每年衰减 1~3 点
        item.durability = clamp(
          item.durability - Math.floor(Math.random() * 3 + 1) * years,
          0,
          100,
        )
      }
    }

    // 装备栏耐久度衰减
    for (const item of Object.values(this.state.equipped)) {
      if (item.durability > 0) {
        // 装备使用中衰减更快
        item.durability = clamp(
          item.durability - Math.floor(Math.random() * 3 + 2) * years,
          0,
          100,
        )
      }
    }

    // 清理耐久度为 0 的损坏物品
    this.state.inventory = this.state.inventory.filter(
      (item) => item.durability !== 0,
    )
    for (const [slot, item] of Object.entries(this.state.equipped)) {
      if (item.durability <= 0) {
        delete this.state.equipped[slot]
      }
    }
  }

  // ─── 物品操作 ───

  private addItem(item: Item): void {
    const currentCount = this.state.inventory.reduce(
      (sum, i) => sum + i.quantity,
      0,
    )
    if (currentCount + (item.quantity ?? 1) > this.state.capacity) return

    // 堆叠：同一名称+同一类别 且 未超过堆叠上限
    const existing = this.state.inventory.find(
      (i) => i.name === item.name && i.category === item.category,
    )
    if (existing) {
      const maxStack = existing.maxStack ?? (existing.category === 'consumable' || existing.category === 'material' ? 99 : 1)
      const canAdd = Math.min(item.quantity ?? 1, maxStack - existing.quantity)
      if (canAdd > 0) {
        existing.quantity += canAdd
      }
      // 超出堆叠上限的部分不处理（丢弃余量）
      return
    }

    this.state.inventory.push({
      ...item,
      id: item.id || `item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    })
  }

  private removeItem(itemId: string): void {
    this.state.inventory = this.state.inventory.filter((i) => i.id !== itemId)
  }

  private useItem(itemId: string, quantity: number): void {
    const item = this.state.inventory.find((i) => i.id === itemId)
    if (!item) return

    item.quantity = Math.max(0, item.quantity - quantity)
    if (item.quantity <= 0) {
      this.removeItem(itemId)
    }
  }

  private equipItem(itemId: string): void {
    const itemIdx = this.state.inventory.findIndex((i) => i.id === itemId)
    if (itemIdx === -1) return

    const item = this.state.inventory[itemIdx]

    // 卸下同槽位旧装备
    const existing = this.state.equipped[item.category]
    if (existing) {
      this.state.inventory.push(existing)
    }

    // 装备新物品
    this.state.equipped[item.category] = { ...item, quantity: 1 }
    this.state.inventory.splice(itemIdx, 1)
  }

  private unequipItem(slot: string): void {
    const item = this.state.equipped[slot]
    if (!item) return

    const currentCount = this.state.inventory.reduce(
      (sum, i) => sum + i.quantity,
      0,
    )
    if (currentCount >= this.state.capacity) return

    this.state.inventory.push(item)
    delete this.state.equipped[slot]
  }

  // ─── 叙事自动检测 ───

  /**
   * 从 AI 叙事文本中自动检测获得/失去的物品
   * @param narrative 本轮 AI 叙事文本
   * @param worldview 当前世界观（用于匹配物品池）
   */
  detectFromNarrative(narrative: string, worldview: string): string[] {
    const detected: string[] = []
    if (!narrative) return detected

    // 检测"获得"模式
    for (const verb of ITEM_ACQUIRE_VERBS) {
      const pattern = new RegExp(`${verb}[了]?[的证]?[的]?(${this.getItemNamePattern()})`, 'g')
      let match: RegExpExecArray | null
      while ((match = pattern.exec(narrative)) !== null) {
        const itemName = match[1]
        // 检查是否已在背包中（存在则叠加，不存在则创建）
        if (!this.isItemInInventory(itemName)) {
          // 查找物品池定义
          const poolItem = this.findInPools(itemName, worldview)
          if (poolItem) {
            this.addItem({
              ...poolItem,
              id: `narrative_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              quantity: 1,
              durability: 100,
            })
            detected.push(`获得:${itemName}`)
          } else {
            // 自定义物品
            this.addCustomItemFromName(itemName, worldview)
            detected.push(`获得:${itemName}(自定义)`)
          }
        } else {
          // 已有则叠加数量
          const existing = this.state.inventory.find((i) => i.name === itemName)
          if (existing) {
            const maxStack = existing.maxStack ?? (existing.category === 'consumable' || existing.category === 'material' ? 99 : 1)
            if (existing.quantity < maxStack) {
              existing.quantity = Math.min(existing.quantity + 1, maxStack)
              detected.push(`获得:${itemName}(+1)`)
            }
          }
        }
      }
    }

    // 检测"失去"模式
    for (const verb of ITEM_LOSE_VERBS) {
      const pattern = new RegExp(`${verb}[了]?[的证]?[的]?(${this.getItemNamePattern()})`, 'g')
      let match: RegExpExecArray | null
      while ((match = pattern.exec(narrative)) !== null) {
        const itemName = match[1]
        const existing = this.state.inventory.find((i) => i.name === itemName)
        if (existing) {
          existing.quantity -= 1
          if (existing.quantity <= 0) {
            this.state.inventory = this.state.inventory.filter((i) => i.id !== existing.id)
          }
          detected.push(`失去:${itemName}`)
        }
      }
    }

    return detected
  }

  /** 生成物品名正则捕获组（来自关键词映射 + 物品池） */
  private getItemNamePattern(): string {
    // 收集所有已知物品名
    const allNames = new Set<string>()
    for (const synonyms of Object.values(NARRATIVE_ITEM_KEYWORDS)) {
      for (const name of synonyms) {
        allNames.add(name)
      }
    }
    for (const pool of Object.values(WORLDVIEW_ITEM_POOLS)) {
      for (const item of pool) {
        allNames.add(item.name)
      }
    }
    // 按名称长度降序排序（优先匹配长名称）
    const sorted = Array.from(allNames).sort((a, b) => b.length - a.length)
    return sorted.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  }

  /** 检查物品名是否已在背包中 */
  private isItemInInventory(name: string): boolean {
    return this.state.inventory.some((i) => i.name === name)
  }

  /** 在物品池中查找物品定义 */
  private findInPools(itemName: string, worldview: string): (Omit<Item, 'id' | 'quantity' | 'durability'>) | null {
    // 优先当前世界观池
    const worldPool = getItemPoolForWorldview(resolveStaticPoolWorldviewKey(worldview))
    const worldMatch = worldPool.find((i) => i.name === itemName)
    if (worldMatch) return { ...worldMatch, tradable: true }

    // 再查 default 池
    const defaultPool = WORLDVIEW_ITEM_POOLS.default ?? []
    const defaultMatch = defaultPool.find((i) => i.name === itemName)
    if (defaultMatch) return { ...defaultMatch, tradable: true }

    // 最后查所有池
    for (const pool of Object.values(WORLDVIEW_ITEM_POOLS)) {
      const match = pool.find((i) => i.name === itemName)
      if (match) return { ...match, tradable: true }
    }

    return null
  }

  /** 根据物品名创建自定义物品 */
  private addCustomItemFromName(name: string, _worldview: string): void {
    // 根据名称特征推断类别
    let category: Item['category'] = 'material'
    let quality: Item['quality'] = 'common'
    let value = 5

    if (/剑|刀|枪|斧|锤|杖|弓|镖|匕/.test(name)) {
      category = 'weapon'
      value = 10
    } else if (/甲|盾|铠|衣|袍|服/.test(name)) {
      category = 'armor'
      value = 8
    } else if (/丹|药|丸|散|汤/.test(name)) {
      category = 'consumable'
      value = 5
    } else if (/玉|佩|环|坠|戒|链/.test(name)) {
      category = 'accessory'
      value = 15
    } else if (/宝|秘|法|神|仙/.test(name)) {
      quality = 'uncommon'
      value = 20
    }

    const customItem: Item = {
      id: `custom_narrative_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      category,
      quality,
      quantity: 1,
      value,
      description: `从叙事中获得的${name}`,
      tradable: true,
      durability: -1,
    }
    this.addItem(customItem)
  }

  // ─── 世界观过滤 ───

  /** 根据世界观获取可用物品列表（不修改背包，仅用于 AI 参考） */
  getAvailableItemsForWorldview(worldview: string): Array<{ name: string; category: string; description: string }> {
    const pool = getItemPoolForWorldview(resolveStaticPoolWorldviewKey(worldview))
    return pool.map((i) => ({
      name: i.name,
      category: i.category,
      description: i.description,
    }))
  }

  // ─── 领域方法 ───

  /** 获取背包物品总数（含堆叠） */
  getItemCount(): number {
    return this.state.inventory.reduce((sum, i) => sum + i.quantity, 0)
  }

  /** 获取背包容量 */
  getCapacity(): number {
    return this.state.capacity
  }

  /** 获取背包物品列表 */
  getInventory(): Item[] {
    return this.state.inventory
  }

  /** 获取装备栏 */
  getEquipped(): Record<string, Item> {
    return this.state.equipped
  }

  /** 是否有空位 */
  hasCapacity(): boolean {
    const currentCount = this.state.inventory.reduce(
      (sum, i) => sum + i.quantity,
      0,
    )
    return currentCount < this.state.capacity
  }

  /** 格式化物品信息以供 Prompt 使用（含 narrativeEffect） */
  formatForPrompt(): string {
    const lines: string[] = []

    // 装备栏
    const equippedItems = Object.values(this.state.equipped)
    if (equippedItems.length > 0) {
      lines.push('装备栏：')
      for (const item of equippedItems) {
        const qualLabel = ITEM_QUALITY_LABELS[item.quality] ?? item.quality
        const effect = item.narrativeEffect ? `（${item.narrativeEffect}）` : ''
        lines.push(`  - ${item.name}【${qualLabel}】${effect}`)
      }
    }

    // 背包
    if (this.state.inventory.length > 0) {
      lines.push('背包物品：')
      for (const item of this.state.inventory) {
        const qualLabel = ITEM_QUALITY_LABELS[item.quality] ?? item.quality
        const qty = item.quantity > 1 ? ` x${item.quantity}` : ''
        const dur = item.durability > 0 ? ` [耐久度:${item.durability}]` : ''
        const effect = item.narrativeEffect ? `（${item.narrativeEffect}）` : ''
        lines.push(`  - ${item.name}${qty}【${qualLabel}】${effect}${dur}`)
      }
    }

    return lines.length > 0 ? lines.join('\n') : '无物品'
  }

  private getSummaryText(): string {
    const itemCount = this.state.inventory.reduce(
      (sum, i) => sum + i.quantity,
      0,
    )
    const equippedCount = Object.keys(this.state.equipped).length
    const uniqueItems = this.state.inventory.length
    return `【${this.label}】物品数: ${itemCount}, 种类: ${uniqueItems}, 装备: ${equippedCount}, 容量: ${this.state.capacity}/${this.state.capacity}`
  }

  reset(): void {
    this.state = this.createInitialState()
    this._lastProcessedRound = -1
  }
}
