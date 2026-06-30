/**
 * @module SpecialMaterialSystem
 * @description 特殊材料子系统 —— 4类别稀有材料发现、库存管理、季度补货
 * @mod mod-power-system
 */

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import { getRoundSequence } from '@/foundation'
import { clamp } from '@/core/shared'
import type { SpecialMaterial, MaterialState } from '../types'

import { RARITY_LABELS, CATEGORY_LABELS } from '../constants'

const MATERIAL_CATALOG: Record<string, Omit<SpecialMaterial, 'usesCount' | 'lastDiscoveryYear'>[]> = {
  cultivation: [
    { id: 'spirit_stone', name: '灵石', category: 'cultivation', rarity: 'common', baseQuantity: 100, currentQuantity: 100, discovered: true },
    { id: 'thousand_year_ice', name: '千年寒冰', category: 'cultivation', rarity: 'rare', baseQuantity: 5, currentQuantity: 5, discovered: false },
    { id: 'phoenix_feather', name: '凤凰尾羽', category: 'cultivation', rarity: 'legendary', baseQuantity: 1, currentQuantity: 1, discovered: false },
    { id: 'jade_essence', name: '玉髓', category: 'cultivation', rarity: 'fine', baseQuantity: 20, currentQuantity: 20, discovered: false },
    { id: 'dragon_blood_resin', name: '龙血树脂', category: 'cultivation', rarity: 'epic', baseQuantity: 2, currentQuantity: 2, discovered: false },
  ],
  magic: [
    { id: 'mana_crystal', name: '魔力水晶', category: 'magic', rarity: 'common', baseQuantity: 80, currentQuantity: 80, discovered: true },
    { id: 'dragon_scale', name: '龙鳞', category: 'magic', rarity: 'rare', baseQuantity: 3, currentQuantity: 3, discovered: false },
    { id: 'philosopher_stone', name: '贤者之石碎片', category: 'magic', rarity: 'legendary', baseQuantity: 1, currentQuantity: 1, discovered: false },
    { id: 'star_dust', name: '星尘', category: 'magic', rarity: 'fine', baseQuantity: 15, currentQuantity: 15, discovered: false },
    { id: 'void_essence', name: '虚空精华', category: 'magic', rarity: 'epic', baseQuantity: 3, currentQuantity: 3, discovered: false },
  ],
  scifi: [
    { id: 'dark_matter', name: '暗物质颗粒', category: 'scifi', rarity: 'rare', baseQuantity: 10, currentQuantity: 10, discovered: false },
    { id: 'neutronium', name: '中子星物质', category: 'scifi', rarity: 'legendary', baseQuantity: 1, currentQuantity: 1, discovered: false },
    { id: 'quantum_core', name: '量子核心', category: 'scifi', rarity: 'common', baseQuantity: 50, currentQuantity: 50, discovered: true },
    { id: 'antimatter_vial', name: '反物质瓶', category: 'scifi', rarity: 'epic', baseQuantity: 2, currentQuantity: 2, discovered: false },
  ],
  wasteland: [
    { id: 'scrap_metal', name: '废铁', category: 'wasteland', rarity: 'common', baseQuantity: 200, currentQuantity: 200, discovered: true },
    { id: 'rad_crystal', name: '辐射结晶', category: 'wasteland', rarity: 'rare', baseQuantity: 5, currentQuantity: 5, discovered: false },
    { id: 'purifier_chip', name: '净化芯片', category: 'wasteland', rarity: 'fine', baseQuantity: 10, currentQuantity: 10, discovered: false },
    { id: 'mutagen_sample', name: '变异样本', category: 'wasteland', rarity: 'epic', baseQuantity: 2, currentQuantity: 2, discovered: false },
  ],
}

const DISCOVERY_CHANCE = 0.05

export class SpecialMaterialSystem implements ISubSystem {
  readonly id = 'special-material' as const
  readonly mod = 'mod-power-system' as const
  readonly label = '特殊材料' as const
  readonly description = '管理稀有材料：4类别×4稀有度、发现判定、库存管理、季度补货' as const

  private _state: MaterialState = { initialized: false, materials: [], activeCategory: 'cultivation' }
  private _lastProcessedRound = -1

  collectState(context: RoundContext): SubSystemState {
    if (getRoundSequence(context) === this._lastProcessedRound) return this._buildResult()
    this._lastProcessedRound = getRoundSequence(context)

    // 首次初始化
    if (!this._state.initialized) {
      const worldview = (context.subsystemStates['celestial']?.data as Record<string, unknown> | undefined)?.worldview as string | undefined
      const cat = worldview && ['cultivation', 'eastern_fantasy', 'idealist'].includes(worldview) ? 'cultivation'
        : worldview && ['western_fantasy', 'mixed'].includes(worldview) ? 'magic'
        : worldview === 'scifi' ? 'scifi'
        : worldview === 'post_apocalyptic' || worldview === 'survival_horror' ? 'wasteland'
        : 'cultivation'
      this._state.activeCategory = cat
      this._state.materials = (MATERIAL_CATALOG[cat] ?? MATERIAL_CATALOG['cultivation']).map(m => ({ ...m, usesCount: 0, lastDiscoveryYear: 0 }))
      this._state.initialized = true
    }

    // 每季度：发现新材料
    const undetected = this._state.materials.filter(m => !m.discovered)
    if (undetected.length > 0 && Math.random() < DISCOVERY_CHANCE) {
      const discovered = undetected[Math.floor(Math.random() * undetected.length)]
      discovered.discovered = true
      discovered.lastDiscoveryYear = context.round.year
    }

    return this._buildResult()
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext): void {
    const { id } = changes;
    const plain = changes.changes ?? {};
    const desc = changes.description ?? '';
    void desc;
    void changes.changes;
    if (!changes?.changes || changes.id !== this.id) return
    const c = changes.changes
    if (typeof c.materialId !== 'undefined' && typeof c.delta === 'number') {
      const m = this._state.materials.find(m => m.id === c.materialId)
      if (m) {
        m.currentQuantity = clamp(m.currentQuantity + (c.delta as number), 0, Infinity)
        if ((c.delta as number) < 0) m.usesCount++
      }
    }
    void id; void plain;
  }

  reset(): void { this._state = { initialized: false, materials: [], activeCategory: 'cultivation' }; this._lastProcessedRound = -1 }

  private _buildResult(): SubSystemState {
    const discovered = this._state.materials.filter(m => m.discovered)
    const catLabel = CATEGORY_LABELS[this._state.activeCategory] ?? this._state.activeCategory
    const maxRarity = discovered.length > 0
      ? RARITY_LABELS[discovered.reduce((a, b) => {
        const order = ['common', 'uncommon', 'rare', 'fine', 'epic', 'legendary']
        return order.indexOf(a.rarity) > order.indexOf(b.rarity) ? a : b
      }).rarity]
      : ''
    return {
      id: this.id,
      summary: `${catLabel}材料 | 已发现${discovered.length}种${maxRarity ? `（最高${maxRarity}）` : ''}`,
      data: structuredClone(this._state as unknown as Record<string, unknown>),
    }
  }
}
