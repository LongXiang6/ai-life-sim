/**
 * @module AnomalyPhenomenaSystem
 * @description 异常现象子系统 —— 规则怪谈/诅咒之地/时间异常区的自然生成+扩散
 * @mod mod-power-system
 */

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import { getRoundSequence } from '@/foundation'
import type { AnomalyZone } from '../types'

const ANOMALY_RULES = [
  { id: 'paradox_space', name: '悖论空间', rule: '进入者会遇见不同时间线的自己', severity: 'dangerous' as const },
  { id: 'silent_hollow', name: '寂静谷', rule: '所有声音在区域内消失，无法通讯', severity: 'mild' as const },
  { id: 'curse_land', name: '诅咒之地', rule: '入内者在72小时后开始石化', severity: 'deadly' as const },
  { id: 'time_loop', name: '轮回小镇', rule: '每天循环重复，只有外来者可打破', severity: 'dangerous' as const },
  { id: 'mirror_void', name: '镜面深渊', rule: '镜中的倒影会与现实交换位置', severity: 'deadly' as const },
  { id: 'memory_fog', name: '遗忘迷雾', rule: '穿过后会失去最近72小时的记忆', severity: 'mild' as const },
  { id: 'gravity_well', name: '引力井', rule: '区域内重力方向随机变化，无法正常行走', severity: 'dangerous' as const },
  { id: 'soul_leak', name: '灵魂泄漏', rule: '区域内生命力会缓慢流失，必须尽快离开', severity: 'deadly' as const },
  { id: 'time_dilation', name: '时间膨胀', rule: '区域内时间流速是外界的10倍', severity: 'mild' as const },
  { id: 'reality_tear', name: '现实撕裂', rule: '区域内物理法则完全失效', severity: 'deadly' as const },
]

const SPAWN_CHANCE = 0.03
const SPREAD_RATES = { mild: 0.03, dangerous: 0.08, deadly: 0.15 }
const ZONE_DETECTION_RANGE = 5

export class AnomalyPhenomenaSystem implements ISubSystem {
  readonly id = 'anomaly-phenomena' as const
  readonly mod = 'mod-power-system' as const
  readonly label = '异常现象' as const
  readonly description = '管理异常区域：自然生成/扩散/全局不稳定度/坐标系检测' as const

  private _state: { initialized: boolean; enabled: boolean; zones: AnomalyZone[]; globalInstability: number } = {
    initialized: false, enabled: false, zones: [], globalInstability: 0,
  }
  private _lastProcessedRound = -1

  collectState(context: RoundContext): SubSystemState {
    if (getRoundSequence(context) === this._lastProcessedRound) return this._buildResult()
    this._lastProcessedRound = getRoundSequence(context)

    // 世界观判定：仅 supernatural/horror 启用
    const worldview = (context.subsystemStates['celestial']?.data as Record<string, unknown> | undefined)?.worldview as string | undefined
    this._state.enabled = worldview === 'survival_horror' || worldview === 'post_apocalyptic' || !!worldview?.includes('horror') || !!worldview?.includes('supernatural')
    if (!this._state.enabled) return this._buildResult()

    if (!this._state.initialized) { this._state.initialized = true; this._state.zones = [] }

    // 每季：自然生成
    if (Math.random() < SPAWN_CHANCE) {
      const rule = ANOMALY_RULES[Math.floor(Math.random() * ANOMALY_RULES.length)]
      this._state.zones.push({
        id: `anomaly_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: rule.name,
        description: rule.rule,
        ruleDescription: rule.rule,
        severity: rule.severity,
        x: Math.floor(Math.random() * 200 - 100),
        y: Math.floor(Math.random() * 200 - 100),
        spreadCount: 0,
        active: true,
        createdYear: context.round.year,
        lastSpreadYear: context.round.year,
      })
    }

    // 扩散
    const newZones: AnomalyZone[] = []
    for (const zone of this._state.zones) {
      zone.spreadCount++
      zone.lastSpreadYear = context.round.year
      const rate = SPREAD_RATES[zone.severity]
      if (Math.random() < rate) {
        const nextSeverity = zone.severity === 'deadly' ? 'dangerous' : zone.severity === 'dangerous' ? 'mild' : 'mild'
        newZones.push({
          ...zone,
          id: `${zone.id}_s${zone.spreadCount}`,
          x: zone.x + Math.floor(Math.random() * 16 - 8),
          y: zone.y + Math.floor(Math.random() * 16 - 8),
          severity: nextSeverity,
          spreadCount: 0,
          createdYear: context.round.year,
          lastSpreadYear: context.round.year,
        })
      }
    }
    this._state.zones.push(...newZones)

    // 全局不稳定度
    this._state.globalInstability = this._state.zones.length > 0
      ? Math.min(100, this._state.globalInstability + 1)
      : Math.max(0, this._state.globalInstability - 1)

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
    if (Array.isArray(c.zones)) this._state.zones = c.zones as AnomalyZone[]
    void id; void plain;
  }

  reset(): void {
    this._state = { initialized: false, enabled: false, zones: [], globalInstability: 0 }
    this._lastProcessedRound = -1
  }

  /** 检测坐标是否在异常区域内 */
  checkZoneHazard(x: number, y: number): { inZone: boolean; severity?: string; ruleDescription?: string } {
    for (const z of this._state.zones) {
      const dist = Math.sqrt((z.x - x) ** 2 + (z.y - y) ** 2)
      if (dist <= ZONE_DETECTION_RANGE) return { inZone: true, severity: z.severity, ruleDescription: z.ruleDescription }
    }
    return { inZone: false }
  }

  private _buildResult(): SubSystemState {
    if (!this._state.enabled) {
      return { id: this.id, summary: '', data: structuredClone(this._state as unknown as Record<string, unknown>) }
    }
    return {
      id: this.id,
      summary: `异常区域${this._state.zones.length}个 | 全局不稳定度${this._state.globalInstability}`,
      data: structuredClone(this._state as unknown as Record<string, unknown>),
    }
  }
}
