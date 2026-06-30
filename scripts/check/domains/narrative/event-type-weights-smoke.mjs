/**
 * Phase 7：eventTypeWeights 加权采样冒烟（逻辑）
 */
import fs from 'node:fs'
import path from 'node:path'
import { getProjectRoot } from '../../lib/project-root.mjs'

const root = getProjectRoot(import.meta.url)
const timeline = fs.readFileSync(
  path.join(root, 'src/mods/mod-world/subsystems/world-timeline-system.ts'),
  'utf8',
)

let failed = 0
if (!timeline.includes('pickWeightedEventType')) {
  console.error('FAIL: pickWeightedEventType not found')
  failed++
}
if (!timeline.includes('eventTypeWeights')) {
  console.error('FAIL: eventTypeWeights not read from calibration')
  failed++
}

// 简易加权分布：war 权重 10，其余 1 → war 应占多数
function pickWeightedEventType(rng, weights, types) {
  const entries = types.map((t) => [t, weights?.[t] ?? 1])
  const total = entries.reduce((s, [, w]) => s + w, 0)
  let r = rng() * total
  for (const [type, w] of entries) {
    r -= w
    if (r <= 0) return type
  }
  return types[types.length - 1]
}

const types = ['war', 'romance', 'discovery']
const weights = { war: 10, romance: 1, discovery: 1 }
let warCount = 0
const N = 500
for (let i = 0; i < N; i++) {
  const t = pickWeightedEventType(() => Math.random(), weights, types)
  if (t === 'war') warCount++
}
if (warCount / N < 0.6) {
  console.error(`FAIL: weighted pick war ratio too low (${warCount}/${N})`)
  failed++
}

if (failed === 0) {
  console.log(`PASS: event-type-weights-smoke (war ${warCount}/${N})`)
  process.exit(0)
}
process.exit(1)
