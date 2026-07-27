import assert from 'node:assert/strict'

import { PlotStructureSystem } from '../../../../src/mods/mod-engine/subsystems/plot-structure-system.ts'

const annualPlot = new PlotStructureSystem()
for (let roundSequence = 1; roundSequence <= 8; roundSequence++) {
  annualPlot.collectState({
    roundSequence,
    daysPassed: 365,
    totalDays: roundSequence * 365,
    contextId: 'plot-test',
  })
}

const monthlyPlot = new PlotStructureSystem()
const monthDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
let monthlyTotalDays = 0
let monthlyRoundSequence = 0
for (let year = 0; year < 8; year++) {
  for (const daysPassed of monthDays) {
    monthlyTotalDays += daysPassed
    monthlyRoundSequence += 1
    monthlyPlot.collectState({
      roundSequence: monthlyRoundSequence,
      daysPassed,
      totalDays: monthlyTotalDays,
      contextId: 'plot-test',
    })
  }
}

const annualState = annualPlot.getState()
const monthlyState = monthlyPlot.getState()
assert.equal(annualState.currentPhase, 'rising_action')
assert.equal(monthlyState.currentPhase, annualState.currentPhase)
assert.equal(monthlyState.phaseStartedAtTotalDays, annualState.phaseStartedAtTotalDays)
assert.equal(monthlyState.phaseElapsedDays, 0)
assert.equal(monthlyState.phaseHistory[0]?.totalDays, 8 * 365)
assert.equal(monthlyState.phaseHistory[0]?.roundSequence, 96)
assert.ok(Math.abs(monthlyState.tensionLevel - annualState.tensionLevel) < 1e-9)

console.log('PASS: plot-structure-canonical-time-smoke')
