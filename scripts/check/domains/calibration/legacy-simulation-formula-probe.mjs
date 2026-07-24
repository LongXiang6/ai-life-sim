/**
 * Reproduce two long-horizon formulas from the retired project without copying
 * their implementations into the current runtime.
 */

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const SEED = 20260724
const YEARS = 100

function mulberry32(seed) {
  let value = seed >>> 0
  return () => {
    value = (value + 0x6D2B79F5) >>> 0
    let result = value
    result = Math.imul(result ^ (result >>> 15), result | 1)
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61)
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296
  }
}

const legacyRoot = new URL('../../../../../废弃项目/src/lib/engine/', import.meta.url)
const marketModuleUrl = new URL('systems/society/market-cycle-system.ts', legacyRoot)
const populationModuleUrl = new URL('systems/world/population-system.ts', legacyRoot)

let marketModule
let populationModule
try {
  ;[marketModule, populationModule] = await Promise.all([
    import(marketModuleUrl),
    import(populationModuleUrl),
  ])
} catch (error) {
  console.error('[legacy-simulation-formula-probe] retired source is unavailable:', legacyRoot.pathname)
  throw error
}

const originalRandom = Math.random
let market
let population
let initialMarket
let initialPopulation
try {
  // This is the original stress fixture's explicit shared random stream and
  // call order. Changing either one intentionally changes the result.
  Math.random = mulberry32(SEED)
  market = marketModule.createInitialMarketState()
  initialMarket = structuredClone(market)
  population = populationModule.createInitialPopulationState(5000)
  initialPopulation = structuredClone(population)
  for (let year = 0; year < YEARS; year += 1) {
    market = marketModule.advanceMarketCycle(
      market,
      (year % 12) + 1,
      0, // Neutral luck.
      1,
    )
    population = populationModule.advancePopulation(
      population,
      1,
      0, // Neutral prosperity.
      5, // Deliberate persistent-disaster stress input.
      false,
    )
  }
} finally {
  Math.random = originalRandom
}

assert.equal(initialMarket.priceIndex, 100)
assert.equal(initialPopulation.total, 5000)
assert.equal(market.priceIndex, 547368166042059970)
assert.equal(population.total, 50, 'retired population formula should reach its hard lower bound')
assert.equal(population.growthRate, -0.2)

const sourceHash = (url) => createHash('sha256').update(readFileSync(url)).digest('hex')

console.log(JSON.stringify({
  source: {
    market: {
      path: fileURLToPath(marketModuleUrl),
      sha256: sourceHash(marketModuleUrl),
    },
    population: {
      path: fileURLToPath(populationModuleUrl),
      sha256: sourceHash(populationModuleUrl),
    },
  },
  inputs: {
    seed: SEED,
    years: YEARS,
    randomStream: 'one shared Mulberry32 stream',
    callOrderPerYear: ['market', 'population'],
    market: { currentMonth: '(zeroBasedYear % 12) + 1', luckModifier: 0, yearsAdvancedPerCall: 1 },
    population: {
      initialTotal: 5000,
      yearsAdvancedPerCall: 1,
      prosperityFactor: 0,
      disasterCount: 5,
      warActive: false,
    },
  },
  initial: { market: initialMarket, population: initialPopulation },
  final: { market, population },
}, null, 2))
console.log('[legacy-simulation-formula-probe] PASS')
