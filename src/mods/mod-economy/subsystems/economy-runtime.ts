import {
  addDecimalIntegers,
  annualRateDelta,
  compareDecimalIntegers,
  decimalIntegerToBigInt,
  formatChineseMagnitude,
  normalizeDecimalInteger,
  subtractDecimalIntegers,
  type RoundContext,
  type WorldScaleCalibration,
} from '@/foundation'
import { buildDefaultWorldScale, createDefaultPowerFramework, getFormulaModifier, useWorldStore } from '@/mods/mod-world'
import type { WorldConfig } from '@/mods/mod-world'

export function clone<T>(value: T): T {
  return structuredClone(value)
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function requiredContextId(context: RoundContext): string {
  if (!context.contextId.trim()) throw new Error('经济系统需要稳定上下文 ID')
  return context.contextId
}

export function contextConfig(context: RoundContext): WorldConfig | undefined {
  return useWorldStore.getState().contexts[context.contextId]?.worldConfig
}

export function scaleForContext(context: RoundContext): WorldScaleCalibration {
  const instance = useWorldStore.getState().contexts[context.contextId]
  if (instance?.calibration?.scale) return clone(instance.calibration.scale)
  if (instance?.worldConfig) return buildDefaultWorldScale(instance.worldConfig)
  return buildDefaultWorldScale({
    name: context.contextId,
    essenceTag: context.essenceTag ?? 'historical',
    powerSystemTag: 'none',
    powerFramework: createDefaultPowerFramework('none', { contextId: context.contextId }),
    spatialForm: 'plane',
    civilizationStage: 'medieval',
    difficulty: context.difficulty,
    description: '',
  })
}

export function elapsedYears(context: RoundContext): number {
  return context.daysPassed / 365
}

export function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

export function signedDecimalDelta(value: string, delta: bigint): string {
  const source = decimalIntegerToBigInt(value)
  const next = source + delta
  return (next < BigInt(0) ? BigInt(0) : next).toString()
}

export function populationDelta(
  population: string,
  scale: WorldScaleCalibration,
  daysPassed: number,
): { births: bigint; deaths: bigint; migration: bigint; net: bigint } {
  const modifier = getFormulaModifier('populationModifier', 1)
  const birthRate = getFormulaModifier('birthRateModifier', 1) * modifier
  const deathRate = getFormulaModifier('deathRateModifier', 1) * modifier
  const migrationRate = getFormulaModifier('migrationRateModifier', 1)
  const births = annualRateDelta(population, Math.round(scale.annualBirthsPerMillion * birthRate), daysPassed)
  const deaths = annualRateDelta(population, Math.round(scale.annualDeathsPerMillion * deathRate), daysPassed)
  const migration = annualRateDelta(population, Math.round(scale.annualNetMigrationPerMillion * migrationRate), daysPassed)
  return { births, deaths, migration, net: births - deaths + migration }
}

export function boundedByCapacity(value: string, capacity: string): string {
  return compareDecimalIntegers(value, capacity) > 0 ? normalizeDecimalInteger(capacity) : normalizeDecimalInteger(value)
}

export function formatQuantity(value: string): string {
  return formatChineseMagnitude(value)
}

export function addSigned(value: string, delta: bigint): string {
  return signedDecimalDelta(value, delta)
}

export function subtractSafe(left: string, right: string): string {
  return subtractDecimalIntegers(left, right)
}

export function addMany(...values: string[]): string {
  return addDecimalIntegers(...values)
}
