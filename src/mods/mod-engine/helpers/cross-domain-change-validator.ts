/**
 * @module cross-domain-change-validator.ts
 * @description 跨域联动变更专用校验 —— 与 AI narrative schema 分离
 * @mod mod-engine
 */

import { z } from 'zod'
import type { SubSystemChanges } from '@/foundation'

const CROSS_DOMAIN_CHANGE_SCHEMAS: Record<string, z.ZodObject<z.ZodRawShape>> = {
  population: z.object({
    populationDelta: z.coerce.number().optional(),
    totalPopulation: z.coerce.number().optional(),
    growthRate: z.coerce.number().optional(),
    migrationInflow: z.coerce.number().optional(),
  }).passthrough(),

  economy: z.object({
    wealthDelta: z.coerce.number().optional(),
    playerWealth: z.coerce.number().optional(),
  }).passthrough(),

  'faction-dynamics': z.object({
    addContribution: z.coerce.number().optional(),
  }).passthrough(),

  'culture-tech': z.object({
    techProgress: z.coerce.number().optional(),
    techProgressDelta: z.coerce.number().optional(),
  }).passthrough(),

  legal: z.object({
    enforcementDelta: z.coerce.number().optional(),
    enforcementLevel: z.coerce.number().optional(),
    corruptionDelta: z.coerce.number().optional(),
  }).passthrough(),

  education: z.object({
    literacyRateDelta: z.coerce.number().optional(),
    literacyRate: z.coerce.number().optional(),
  }).passthrough(),

  reputation: z.object({
    addFame: z.coerce.number().optional(),
    setFame: z.coerce.number().optional(),
  }).passthrough(),

  'social-values': z.object({
    valueShiftDelta: z.coerce.number().optional(),
  }).passthrough(),

  celestial: z.object({
    triggerBlessing: z.boolean().optional(),
  }).passthrough(),

  'conflict-cycle': z.object({
    tensionDelta: z.coerce.number().optional(),
  }).passthrough(),
}

/**
 * 将规则产出的 legacy 字段名映射为子系统 applyChanges 可识别字段
 */
export function normalizeCrossDomainChange(change: SubSystemChanges): SubSystemChanges {
  const next: Record<string, unknown> = { ...change.changes }

  switch (change.id) {
    case 'population':
      if (typeof next.total === 'number' && next.populationDelta === undefined) {
        next.populationDelta = -Math.abs(next.total as number)
        delete next.total
      }
      if (typeof next.refugees === 'number' && next.migrationInflow === undefined) {
        next.migrationInflow = next.refugees
        delete next.refugees
      }
      break
    case 'faction-dynamics':
      if (typeof next.playerContribution === 'number' && next.addContribution === undefined) {
        next.addContribution = next.playerContribution
        delete next.playerContribution
      }
      delete next.tension
      break
    case 'economy':
      if (typeof next.wealth === 'number' && next.wealthDelta === undefined) {
        next.wealthDelta = next.wealth
        delete next.wealth
      }
      delete next.activityLevel
      break
    case 'legal':
      if (typeof next.crimeRate === 'number' && next.corruptionDelta === undefined) {
        next.corruptionDelta = next.crimeRate
        delete next.crimeRate
      }
      if (typeof next.enforcementLevel === 'number' && next.enforcementDelta === undefined) {
        next.enforcementDelta = next.enforcementLevel
        delete next.enforcementLevel
      }
      break
    case 'education':
      if (typeof next.disruption === 'number' && next.literacyRateDelta === undefined) {
        next.literacyRateDelta = -(next.disruption as number)
        delete next.disruption
      }
      if (typeof next.literacyRate === 'number' && next.literacyRateDelta === undefined) {
        next.literacyRateDelta = next.literacyRate
        delete next.literacyRate
      }
      break
    case 'reputation':
      if (typeof next.fame === 'number' && next.addFame === undefined) {
        next.addFame = next.fame
        delete next.fame
      }
      break
    case 'social-values':
      if (typeof next.valueShiftProgress === 'number' && next.valueShiftDelta === undefined) {
        next.valueShiftDelta = next.valueShiftProgress
        delete next.valueShiftProgress
      }
      break
    case 'celestial':
      if (typeof next.blessingEvent === 'number' && next.triggerBlessing === undefined) {
        next.triggerBlessing = (next.blessingEvent as number) > 0
        delete next.blessingEvent
      }
      break
    default:
      break
  }

  return { ...change, changes: next }
}

export function validateCrossDomainChange(change: SubSystemChanges): SubSystemChanges | null {
  const normalized = normalizeCrossDomainChange(change)
  const schema = CROSS_DOMAIN_CHANGE_SCHEMAS[normalized.id]
  if (!schema) {
    console.warn(`[CrossDomain] 未登记子系统 "${normalized.id}"，变更被丢弃`)
    return null
  }

  const result = schema.safeParse(normalized.changes)
  if (!result.success) {
    console.warn(
      `[CrossDomain] ${normalized.id} 校验失败:`,
      result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    )
    return null
  }

  return { ...normalized, changes: result.data as Record<string, unknown> }
}

export function validateCrossDomainChanges(changes: SubSystemChanges[]): SubSystemChanges[] {
  const valid: SubSystemChanges[] = []
  for (const change of changes) {
    const validated = validateCrossDomainChange(change)
    if (validated) valid.push(validated)
  }
  return valid
}
