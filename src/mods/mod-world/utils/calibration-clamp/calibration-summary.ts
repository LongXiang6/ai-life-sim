/**
 * Purpose: Format validated world calibration into compact prompt-facing semantic summaries.
 * Owner: mod-world / world calibration.
 * Responsibility: Read-only presentation helpers; no calibration mutation or default inference.
 */

import { formatChineseMagnitude } from '@/foundation'
import type { WorldCalibration, WorldCalibrationFormulas } from '../../types'
import { WORLDVIEW_STYLE_HINTS } from '../../constants'
import { shouldUseGenericSimulationPools } from '../world-pool-selectors'
import { FORMULA_KEYS } from './modifier-contract'

const SUMMARY_DEVIATION_RATIO = 0.2
const SUMMARY_MODIFIER_LABELS: Partial<Record<keyof WorldCalibrationFormulas, string>> = {
  eventDistributionStrategy: '事件策略',
  cultivationSpeedModifier: '修炼速度',
  bottleneckModifier: '修炼瓶颈',
  techProgressModifier: '科技进度',
  monsterThreatModifier: '怪物威胁',
  birthRateModifier: '人口生育',
  fertilityModifier: '家族生育',
  deathRateModifier: '死亡率',
  warFrequencyModifier: '战争频率',
  vitalityRecoveryModifier: '生命恢复',
  staminaRecoveryModifier: '体力恢复',
  spiritRecoveryModifier: '精神恢复',
  conditionProgressionModifier: '伤病进展',
  incomeModifier: '职业收入',
  disasterFrequencyModifier: '灾难频率',
  inflationModifier: '通胀',
  socialMobilityModifier: '阶层流动',
  luckPointModifier: '气运',
  devotionGainModifier: '信仰虔诚',
  conflictEscalationModifier: '冲突节奏',
  migrationRateModifier: '人口迁移',
  literacyGrowthModifier: '识字增长',
  economyModifier: '宏观经济',
  resourceConsumptionModifier: '资源消耗',
}

export function getWorldviewStyleHint(
  calibration: WorldCalibration | null | undefined,
  essenceTag: string,
): string {
  const fromCalibration = calibration?.styleGuide?.worldviewStyleHint?.trim()
  if (fromCalibration) return fromCalibration
  if (shouldUseGenericSimulationPools()) return ''
  return WORLDVIEW_STYLE_HINTS[essenceTag] ?? ''
}

function modifierDeviatesFromDefault(value: number, defaultValue = 1): boolean {
  if (!Number.isFinite(value)) return false
  return Math.abs(value - defaultValue) / defaultValue >= SUMMARY_DEVIATION_RATIO
}

function formatModifierForSummary(value: number): string {
  return String(Math.round(value * 100) / 100)
}

export function formatCalibrationSummary(calibration: WorldCalibration): string {
  const parts: string[] = []
  const formulas = calibration.formulas
  const strategy = formulas?.eventDistributionStrategy
  if (strategy && strategy !== 'balanced') {
    const strategyLabels: Record<string, string> = {
      prehistoric: '史前生存',
      political: '政治博弈',
      cosmic_epic: '宇宙史诗',
      apocalyptic: '灾变求生',
      mystical: '神秘演进',
    }
    parts.push(`事件策略=${strategyLabels[strategy] ?? '按世界设定分布'}`)
  }
  parts.push(`人口=${formatChineseMagnitude(calibration.scale.populationTotal)}`)
  if (formulas) {
    for (const key of FORMULA_KEYS) {
      if (key === 'eventDistributionStrategy') continue
      const label = SUMMARY_MODIFIER_LABELS[key]
      if (!label) continue
      const value = formulas[key]
      if (typeof value === 'number' && modifierDeviatesFromDefault(value)) {
        parts.push(`${label}×${formatModifierForSummary(value)}`)
      }
    }
  }
  return parts.length === 0 ? '默认校准' : parts.join('；')
}
