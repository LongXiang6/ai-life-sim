import {
  multiplyDecimalInteger,
  normalizeDecimalInteger,
  type MonetaryMode,
  type WorldScaleCalibration,
} from '@/foundation'

import type { WorldConfig } from '../types'

const BASIS_POINTS_MAX = 10_000
const RATE_PER_MILLION_MAX = 1_000_000

const SCALE_BASELINES: Record<string, WorldScaleCalibration> = {
  primitive: {
    populationTotal: '1000000',
    populationCarryingCapacity: '2000000',
    annualBirthsPerMillion: 40000,
    annualDeathsPerMillion: 39000,
    annualNetMigrationPerMillion: 0,
    urbanizationBasisPoints: 50,
    literacyBasisPoints: 0,
    monetaryMode: 'barter',
    annualEconomicOutput: '1000000000',
    moneySupply: '0',
    subsistenceIncomePerCapita: '1000',
    priceIndexBasisPoints: 10000,
    annualInflationPerMillion: 0,
    industrialProductivityBasisPoints: 1000,
    resourceDemandBasisPoints: 2500,
    pollutionPressureBasisPoints: 50,
  },
  ancient: {
    populationTotal: '170000000',
    populationCarryingCapacity: '300000000',
    annualBirthsPerMillion: 42000,
    annualDeathsPerMillion: 40000,
    annualNetMigrationPerMillion: 0,
    urbanizationBasisPoints: 1000,
    literacyBasisPoints: 500,
    monetaryMode: 'commodity',
    annualEconomicOutput: '187000000000',
    moneySupply: '30000000000',
    subsistenceIncomePerCapita: '1100',
    priceIndexBasisPoints: 10000,
    annualInflationPerMillion: 20000,
    industrialProductivityBasisPoints: 1500,
    resourceDemandBasisPoints: 3000,
    pollutionPressureBasisPoints: 100,
  },
  medieval: {
    populationTotal: '400000000',
    populationCarryingCapacity: '650000000',
    annualBirthsPerMillion: 40000,
    annualDeathsPerMillion: 38000,
    annualNetMigrationPerMillion: 0,
    urbanizationBasisPoints: 1200,
    literacyBasisPoints: 1000,
    monetaryMode: 'commodity',
    annualEconomicOutput: '480000000000',
    moneySupply: '80000000000',
    subsistenceIncomePerCapita: '1200',
    priceIndexBasisPoints: 10000,
    annualInflationPerMillion: 15000,
    industrialProductivityBasisPoints: 2000,
    resourceDemandBasisPoints: 3500,
    pollutionPressureBasisPoints: 150,
  },
  renaissance: {
    populationTotal: '550000000',
    populationCarryingCapacity: '900000000',
    annualBirthsPerMillion: 38000,
    annualDeathsPerMillion: 34000,
    annualNetMigrationPerMillion: 0,
    urbanizationBasisPoints: 1800,
    literacyBasisPoints: 2000,
    monetaryMode: 'commodity',
    annualEconomicOutput: '825000000000',
    moneySupply: '200000000000',
    subsistenceIncomePerCapita: '1500',
    priceIndexBasisPoints: 10000,
    annualInflationPerMillion: 20000,
    industrialProductivityBasisPoints: 3000,
    resourceDemandBasisPoints: 4500,
    pollutionPressureBasisPoints: 300,
  },
  industrial: {
    populationTotal: '1650000000',
    populationCarryingCapacity: '2500000000',
    annualBirthsPerMillion: 35000,
    annualDeathsPerMillion: 25000,
    annualNetMigrationPerMillion: 0,
    urbanizationBasisPoints: 3500,
    literacyBasisPoints: 5000,
    monetaryMode: 'currency',
    annualEconomicOutput: '6600000000000',
    moneySupply: '2000000000000',
    subsistenceIncomePerCapita: '4000',
    priceIndexBasisPoints: 10000,
    annualInflationPerMillion: 20000,
    industrialProductivityBasisPoints: 6000,
    resourceDemandBasisPoints: 8000,
    pollutionPressureBasisPoints: 6000,
  },
  modern: {
    populationTotal: '8200000000',
    populationCarryingCapacity: '12000000000',
    annualBirthsPerMillion: 16500,
    annualDeathsPerMillion: 8000,
    annualNetMigrationPerMillion: 0,
    urbanizationBasisPoints: 5800,
    literacyBasisPoints: 8700,
    monetaryMode: 'currency',
    annualEconomicOutput: '147600000000000',
    moneySupply: '110000000000000',
    subsistenceIncomePerCapita: '18000',
    priceIndexBasisPoints: 10000,
    annualInflationPerMillion: 25000,
    industrialProductivityBasisPoints: 10000,
    resourceDemandBasisPoints: 10000,
    pollutionPressureBasisPoints: 5000,
  },
  information: {
    populationTotal: '10000000000',
    populationCarryingCapacity: '15000000000',
    annualBirthsPerMillion: 13000,
    annualDeathsPerMillion: 10000,
    annualNetMigrationPerMillion: 0,
    urbanizationBasisPoints: 7500,
    literacyBasisPoints: 9700,
    monetaryMode: 'currency',
    annualEconomicOutput: '300000000000000',
    moneySupply: '210000000000000',
    subsistenceIncomePerCapita: '30000',
    priceIndexBasisPoints: 10000,
    annualInflationPerMillion: 20000,
    industrialProductivityBasisPoints: 16000,
    resourceDemandBasisPoints: 8000,
    pollutionPressureBasisPoints: 3000,
  },
  space: {
    populationTotal: '100000000000',
    populationCarryingCapacity: '1000000000000',
    annualBirthsPerMillion: 12000,
    annualDeathsPerMillion: 8000,
    annualNetMigrationPerMillion: 0,
    urbanizationBasisPoints: 9000,
    literacyBasisPoints: 9900,
    monetaryMode: 'currency',
    annualEconomicOutput: '8000000000000000',
    moneySupply: '5000000000000000',
    subsistenceIncomePerCapita: '80000',
    priceIndexBasisPoints: 10000,
    annualInflationPerMillion: 15000,
    industrialProductivityBasisPoints: 40000,
    resourceDemandBasisPoints: 12000,
    pollutionPressureBasisPoints: 2000,
  },
}

const VALID_MONETARY_MODES = new Set<MonetaryMode>([
  'none', 'reciprocity', 'barter', 'commodity', 'currency', 'post-scarcity',
])

function spatialMultiplier(config: WorldConfig): bigint {
  if (config.spatialForm === 'omniverse') return BigInt(100_000_000)
  if (config.spatialForm === 'multiverse') return BigInt(10_000)
  return BigInt(1)
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, Math.round(value)))
    : fallback
}

function quantity(value: unknown, fallback: string, label: string): string {
  try {
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint') return fallback
    return normalizeDecimalInteger(value, label)
  } catch {
    return fallback
  }
}

export function buildDefaultWorldScale(config: WorldConfig): WorldScaleCalibration {
  const stage = SCALE_BASELINES[config.civilizationStage]
    ?? (config.civilizationStage === 'future' ? SCALE_BASELINES.space : SCALE_BASELINES.medieval)
  const multiplier = spatialMultiplier(config)
  return {
    ...structuredClone(stage),
    populationTotal: multiplyDecimalInteger(stage.populationTotal, multiplier),
    populationCarryingCapacity: multiplyDecimalInteger(stage.populationCarryingCapacity, multiplier),
    annualEconomicOutput: multiplyDecimalInteger(stage.annualEconomicOutput, multiplier),
    moneySupply: multiplyDecimalInteger(stage.moneySupply, multiplier),
  }
}

export function clampWorldScale(
  raw: unknown,
  fallback: WorldScaleCalibration,
): WorldScaleCalibration {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return structuredClone(fallback)
  const input = raw as Partial<WorldScaleCalibration>
  const monetaryMode = typeof input.monetaryMode === 'string'
    && VALID_MONETARY_MODES.has(input.monetaryMode as MonetaryMode)
    ? input.monetaryMode as MonetaryMode
    : fallback.monetaryMode
  const populationTotal = quantity(input.populationTotal, fallback.populationTotal, '人口总量')
  const requestedCapacity = quantity(
      input.populationCarryingCapacity,
      fallback.populationCarryingCapacity,
      '人口承载量',
    )
  const populationCarryingCapacity = BigInt(requestedCapacity) < BigInt(populationTotal)
    ? populationTotal
    : requestedCapacity
  return {
    populationTotal,
    populationCarryingCapacity,
    annualBirthsPerMillion: clampInteger(input.annualBirthsPerMillion, fallback.annualBirthsPerMillion, 0, RATE_PER_MILLION_MAX),
    annualDeathsPerMillion: clampInteger(input.annualDeathsPerMillion, fallback.annualDeathsPerMillion, 0, RATE_PER_MILLION_MAX),
    annualNetMigrationPerMillion: clampInteger(input.annualNetMigrationPerMillion, fallback.annualNetMigrationPerMillion, -RATE_PER_MILLION_MAX, RATE_PER_MILLION_MAX),
    urbanizationBasisPoints: clampInteger(input.urbanizationBasisPoints, fallback.urbanizationBasisPoints, 0, BASIS_POINTS_MAX),
    literacyBasisPoints: clampInteger(input.literacyBasisPoints, fallback.literacyBasisPoints, 0, BASIS_POINTS_MAX),
    monetaryMode,
    annualEconomicOutput: quantity(input.annualEconomicOutput, fallback.annualEconomicOutput, '年经济产出'),
    moneySupply: monetaryMode === 'none' || monetaryMode === 'barter' || monetaryMode === 'reciprocity'
      ? '0'
      : quantity(input.moneySupply, fallback.moneySupply, '货币供应量'),
    subsistenceIncomePerCapita: quantity(input.subsistenceIncomePerCapita, fallback.subsistenceIncomePerCapita, '人均生计收入'),
    priceIndexBasisPoints: clampInteger(input.priceIndexBasisPoints, fallback.priceIndexBasisPoints, 1, 1_000_000),
    annualInflationPerMillion: clampInteger(input.annualInflationPerMillion, fallback.annualInflationPerMillion, -900_000, RATE_PER_MILLION_MAX),
    industrialProductivityBasisPoints: clampInteger(input.industrialProductivityBasisPoints, fallback.industrialProductivityBasisPoints, 0, 1_000_000),
    resourceDemandBasisPoints: clampInteger(input.resourceDemandBasisPoints, fallback.resourceDemandBasisPoints, 0, 1_000_000),
    pollutionPressureBasisPoints: clampInteger(input.pollutionPressureBasisPoints, fallback.pollutionPressureBasisPoints, 0, 1_000_000),
  }
}

export function getCivilizationScaleBaseline(stage: string): WorldScaleCalibration {
  return structuredClone(SCALE_BASELINES[stage] ?? SCALE_BASELINES.medieval)
}
