/**
 * @module GoldenFingerSystem
 * @description 金手指子系统 —— 管理角色特有的超常规能力：分配/成长/被动加成/面板操作
 * @mod mod-golden-finger
 */
import { getRoundSequence } from '@/foundation'

import type {
  ISubSystem,
  SubSystemState,
  SubSystemChanges,
  RoundContext,
} from '@/foundation'
import type {
  GoldenFingerState,
  GoldenFingerTemplate,
  GoldenFingerKind,
  GoldenFingerBoosts,
  PanelActionResult,
} from '../types'

import {
  GOLDEN_FINGER_TEMPLATES,
  WORLDVIEW_WEIGHTS,
} from '../constants'

// ========== 工具函数 ==========

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max)
}

function pickWeightedRandom<T>(entries: Array<[T, number]>): T | undefined {
  const total = entries.reduce((s, [, w]) => s + w, 0)
  if (total <= 0) return undefined
  let roll = Math.random() * total
  for (const [key, w] of entries) {
    roll -= w
    if (roll <= 0) return key
  }
  return entries[0]?.[0]
}

// ========== 子系统 ==========

export class GoldenFingerSystem implements ISubSystem {
  readonly id = 'golden-finger' as const
  readonly mod = 'mod-golden-finger' as const
  readonly label = '金手指系统' as const
  readonly description = '管理角色金手指：10种系统面板+5种非面板类型，关闭/随机/手动3模式' as const

  private _state: GoldenFingerState = {
    mode: 'off',
    assigned: false,
    template: null,
    level: 0,
    levelProgress: 0,
    unlockedFeatures: [],
  }

  private _lastProcessedRound = -1

  collectState(context: RoundContext): SubSystemState {
    if (getRoundSequence(context) === this._lastProcessedRound) {
      return this._buildResult()
    }
    this._lastProcessedRound = getRoundSequence(context)

    // 每轮推进成长
    this._advanceGrowth(1, 1)
    return this._buildResult()
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext): void {
    const { id } = changes;
    const plain = changes.changes ?? {};
    const desc = changes.description ?? '';
    void desc;
    void changes.changes;
    if (!changes || typeof changes !== 'object') return
    if (changes.changes && changes.id === this.id) {
      const c = changes.changes
      if (typeof c.mode !== 'undefined') this._state.mode = c.mode as GoldenFingerState['mode']
      if (typeof c.assigned !== 'undefined') this._state.assigned = c.assigned as boolean
    }
    void id; void plain;
  }

  reset(): void {
    this._state = {
      mode: 'off', assigned: false, template: null,
      level: 0, levelProgress: 0, unlockedFeatures: [],
    }
    this._lastProcessedRound = -1
  }

  // ========== 公开方法 ==========

  /** 系统分配金手指（random 模式） */
  assignRandom(worldview?: string, luckBonus: number = 5, talentTags: string[] = []): GoldenFingerState {
    if (this._state.mode === 'off') return this._state

    const weights = worldview && WORLDVIEW_WEIGHTS[worldview]
      ? { ...WORLDVIEW_WEIGHTS[worldview] }
      : { ...WORLDVIEW_WEIGHTS['mixed'] }

    // 天赋调整权重
    if (talentTags.includes('cultivation_genius')) {
      weights.cultivation_legacy = (weights.cultivation_legacy ?? 0) * 1.5
      weights.bloodline_awakening = (weights.bloodline_awakening ?? 0) * 1.3
    }
    if (talentTags.includes('spirit_body')) {
      weights.innate_ability = (weights.innate_ability ?? 0) * 1.5
    }
    if (talentTags.includes('strategist')) {
      weights.knowledge_awakening = (weights.knowledge_awakening ?? 0) * 1.5
    }

    const entries = Object.entries(weights).filter(
      ([, w]) => w !== undefined && w > 0,
    ) as Array<[GoldenFingerKind, number]>

    const selectedKind = pickWeightedRandom(entries)
    if (!selectedKind) return this._state

    // 运�影响品质
    const candidates = GOLDEN_FINGER_TEMPLATES.filter((t) => t.kind === selectedKind)
    if (candidates.length === 0) return this._state

    let template: GoldenFingerTemplate
    if (luckBonus >= 8 || Math.random() < (luckBonus >= 6 ? 0.33 : 0)) {
      const high = candidates.filter((t) => ['legendary', 'unique'].includes(t.tier))
      template = high.length > 0
        ? high[Math.floor(Math.random() * high.length)]
        : candidates[Math.floor(Math.random() * candidates.length)]
    } else {
      template = candidates[Math.floor(Math.random() * candidates.length)]
    }

    return this._assignTemplate(template)
  }

  /** 手动分配（manual 模式） */
  assignManual(templateId: string): GoldenFingerState {
    if (this._state.mode === 'off') return this._state

    const template = GOLDEN_FINGER_TEMPLATES.find((t) => t.id === templateId)
    if (!template) return this._state
    return this._assignTemplate(template)
  }

  /** 获取被动加成（供引擎在 applyChanges 阶段叠加到各子系统） */
  getPassiveBoosts(): GoldenFingerBoosts {
    if (!this._state.assigned || !this._state.template) return {}

    const { template, level } = this._state
    const boosts: GoldenFingerBoosts = {}

    for (const target of template.targetSubsystems) {
      for (const [attr, base] of Object.entries(template.boosts)) {
        if (!boosts[target]) boosts[target] = {}
        ;(boosts[target] as Record<string, number>)[attr] = base * level
      }
    }

    return boosts
  }

  /** 触发面板操作（系统面板型专属） */
  triggerPanelAction(actionType: string, params: Record<string, unknown> = {}): PanelActionResult {
    if (!this._state.assigned || !this._state.template) {
      return { success: false, description: '金手指未分配', targetSubsystem: '', changes: {} }
    }

    const { template } = this._state
    switch (actionType) {
      case 'gacha_roll':
        return {
          success: true,
          description: `${template.name}抽出了稀有物品`,
          targetSubsystem: 'item',
          changes: { action: 'add_item', itemTier: 'rare' },
        }
      case 'appraise':
        return {
          success: true,
          description: `${template.name}揭示了隐藏信息`,
          targetSubsystem: template.targetSubsystems[0] ?? '',
          changes: { reveal: true },
        }
      case 'quest_complete':
        return {
          success: true,
          description: '任务完成，获得奖励',
          targetSubsystem: 'event-pool',
          changes: { reward: params.reward ?? {} },
        }
      case 'shop_buy':
        return {
          success: true,
          description: '购买成功',
          targetSubsystem: 'economy',
          changes: { deduct: params.price ?? 0, add_item: params.itemId ?? '' },
        }
      case 'check_in':
        return {
          success: true,
          description: `连续签到${(this._state.checkInStreak ?? 0) + 1}天`,
          targetSubsystem: 'item',
          changes: { streak: (this._state.checkInStreak ?? 0) + 1 },
        }
      default:
        return { success: false, description: `未知操作: ${actionType}`, targetSubsystem: '', changes: {} }
    }
  }

  // ========== 私有方法 ==========

  private _assignTemplate(template: GoldenFingerTemplate): GoldenFingerState {
    this._state = {
      ...this._state,
      assigned: true,
      template,
      level: 1,
      levelProgress: 0,
      unlockedFeatures: template.activationCondition ? [] : [template.features[0]],
      checkInStreak: 0,
    }
    return this._state
  }

  private _advanceGrowth(narrativeEvents: number, yearsAdvanced: number): void {
    if (!this._state.assigned || !this._state.template) return

    const xpGain = narrativeEvents * 2 + yearsAdvanced * 0.5
    let progress = this._state.levelProgress + xpGain
    let level = this._state.level
    const features = [...this._state.unlockedFeatures]
    const template = this._state.template

    const xpNeeded = 10 * level
    while (progress >= xpNeeded && features.length < template.features.length) {
      progress -= xpNeeded
      level++
      const nextFeature = template.features[features.length]
      if (nextFeature) features.push(nextFeature)
    }

    this._state.level = level
    this._state.levelProgress = clamp(progress, 0, xpNeeded * 2)
    this._state.unlockedFeatures = features
  }

  private _buildResult(): SubSystemState {
    const s = this._state
    if (!s.assigned || !s.template) {
      return {
        id: this.id,
        summary: s.mode === 'off' ? '' : '金手指待分配',
        data: structuredClone(s as unknown as Record<string, unknown>),
      }
    }

    const parts: string[] = []
    parts.push(`金手指：${s.template.name} (Lv.${s.level})`)
    parts.push(`类型：${s.template.kind}`)
    if (s.unlockedFeatures.length > 0) {
      parts.push(`已解锁：${s.unlockedFeatures.join('、')}`)
    }
    parts.push(`经验：${s.levelProgress.toFixed(1)}/${10 * s.level}`)
    parts.push('注意：金手指不受世界观约束限制，可以呈现超越世界规则的效果')

    return {
      id: this.id,
      summary: parts.join(' | '),
      data: structuredClone(s as unknown as Record<string, unknown>),
    }
  }
}
