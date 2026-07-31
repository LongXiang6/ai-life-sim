import type { DecimalInteger } from '../utils/decimal-integer'

export type MonetaryMode =
  | 'none'
  | 'reciprocity'
  | 'barter'
  | 'commodity'
  | 'currency'
  | 'post-scarcity'

/** Explicit context-scale calibration. All large integer quantities are JSON-safe strings. */
export interface WorldScaleCalibration {
  populationTotal: DecimalInteger
  populationCarryingCapacity: DecimalInteger
  annualBirthsPerMillion: number
  annualDeathsPerMillion: number
  annualNetMigrationPerMillion: number
  urbanizationBasisPoints: number
  literacyBasisPoints: number
  monetaryMode: MonetaryMode
  annualEconomicOutput: DecimalInteger
  moneySupply: DecimalInteger
  subsistenceIncomePerCapita: DecimalInteger
  priceIndexBasisPoints: number
  annualInflationPerMillion: number
  industrialProductivityBasisPoints: number
  resourceDemandBasisPoints: number
  pollutionPressureBasisPoints: number
}
