#!/usr/bin/env node

import assert from 'node:assert/strict'
import {
  calculateNarrativeRepetitionMetric,
  isNarrativeRepetitionMetric,
  summarizeNarrativeRepetitionMetrics,
  tokenizeNarrative,
} from '../../../../src/mods/mod-engine/helpers/narrative-repetition-metrics.ts'

const first = '你在北岸点亮灯塔，旧船从雾里出现，守塔人递来一枚铜牌。'
const second = '你在北岸点亮灯塔，旧船从雾里出现，守塔人递来一枚铜牌。'
const third = '雨季之后，你沿着盐碱地寻找失散的商队，新的盟友在石桥边等你。'
assert.ok(tokenizeNarrative(first).length > 0, 'Chinese tokenization must produce significant tokens')
const firstMetric = calculateNarrativeRepetitionMetric({ round: 1, text: first, recentHistory: [] })
const secondMetric = calculateNarrativeRepetitionMetric({
  round: 2,
  text: second,
  recentHistory: [{ round: 1, text: first }],
})
const thirdMetric = calculateNarrativeRepetitionMetric({
  round: 3,
  text: third,
  recentHistory: [{ round: 1, text: first }, { round: 2, text: second }],
})
assert.equal(firstMetric.wordRepeatRate, 0)
assert.ok(secondMetric.wordRepeatRate > 0.7, 'identical story must be high word repetition')
assert.ok(secondMetric.maxRecentNgramSimilarity > 0.85, 'identical story must be high ngram repetition')
assert.ok(thirdMetric.wordRepeatRate < secondMetric.wordRepeatRate, 'new scene should reduce repeated words')
const summary = summarizeNarrativeRepetitionMetrics([firstMetric, secondMetric, thirdMetric])
assert.equal(summary.rounds, 3)
assert.equal(summary.highRepeatRounds, 1)
assert.equal(summary.peakRound, 2)

assert.equal(isNarrativeRepetitionMetric(firstMetric), true)
assert.equal(isNarrativeRepetitionMetric({
  ...secondMetric,
  repeatedTokenCount: secondMetric.significantTokenCount + 1,
}), false, 'repeated token count cannot exceed significant token count')
assert.equal(isNarrativeRepetitionMetric({
  ...secondMetric,
  comparedRounds: [1, 1],
}), false, 'comparison rounds must be unique')
assert.equal(isNarrativeRepetitionMetric({
  ...secondMetric,
  comparedRounds: [2],
}), false, 'a metric cannot compare its own or a future round')
assert.equal(isNarrativeRepetitionMetric({
  ...secondMetric,
  matchedRound: 3,
}), false, 'matched round must come from the comparison window')
assert.equal(isNarrativeRepetitionMetric({
  ...secondMetric,
  round: 0,
}), false, 'round zero is not a committed narrative round')

console.log('[narrative-repetition-metrics-smoke] PASS')
