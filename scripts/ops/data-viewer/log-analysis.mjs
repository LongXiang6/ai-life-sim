/**
 * Purpose: Normalize log trace usage and aggregate a deterministic log time window.
 * Owner: operations
 * Responsibility: Log analytics calculations only; database selection and result pagination are external.
 */

import { parsePlaintextJson } from './shared.mjs'

export function shanghaiDayStart(now) {
  const offset = 8 * 60 * 60 * 1000
  const local = new Date(now + offset)
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - offset
}

export function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

export function numeric(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

export function percent(numerator, denominator) {
  return denominator > 0 ? Math.round((numerator / denominator) * 10000) / 100 : 0
}

export function extractUsageObject(response) {
  if (typeof response !== 'string' || !response.trim()) return null
  const candidates = []
  try {
    candidates.push(JSON.parse(response))
  } catch {
    for (const line of response.split(/\r?\n/u)) {
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      try { candidates.push(JSON.parse(payload)) } catch { /* Keep scanning the complete stream. */ }
    }
  }
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const usage = asObject(asObject(candidates[index]).usage)
    if (Object.keys(usage).length > 0) return usage
  }
  return null
}

export function normalizeUsage(usage) {
  const source = asObject(usage)
  const promptDetails = asObject(source.prompt_tokens_details)
  const completionDetails = asObject(source.completion_tokens_details)
  const hitTokens = numeric(source.prompt_cache_hit_tokens ?? promptDetails.cached_tokens)
  const promptTokens = numeric(source.prompt_tokens)
  const explicitMiss = source.prompt_cache_miss_tokens
  const missTokens = explicitMiss === undefined
    ? Math.max(0, promptTokens - hitTokens)
    : numeric(explicitMiss)
  return {
    hitTokens,
    missTokens,
    completionTokens: numeric(source.completion_tokens),
    reasoningTokens: numeric(source.reasoning_tokens ?? completionDetails.reasoning_tokens),
    totalTokens: numeric(source.total_tokens),
  }
}

export function logTraceContext(row) {
  const meta = asObject(parsePlaintextJson(row.meta_json))
  const payload = asObject(parsePlaintextJson(row.payload_json))
  const trace = asObject(payload.trace ?? payload.traceContext ?? meta.trace)
  return {
    lifeRunId: String(
      meta.lifeRunId ?? payload.lifeRunId ?? payload.life_run_id
      ?? trace.lifeRunId ?? trace.life_run_id ?? '',
    ).trim(),
    round: Number(row.round ?? meta.round ?? payload.round ?? trace.round ?? 0),
    callKind: String(row.call_kind ?? meta.callKind ?? payload.callKind ?? trace.callKind ?? '').trim(),
    attempt: Number(meta.attempt ?? payload.attempt ?? trace.attempt ?? 0),
    durationMs: numeric(meta.durationMs ?? payload.durationMs ?? payload.duration_ms),
    meta,
    payload,
  }
}

export function aggregateLogWindow(database, from, to) {
  const rows = database.prepare(`
    SELECT * FROM log_entries
    WHERE created_at >= ? AND created_at < ?
      AND entry_type IN ('proxy-access', 'proxy-trace', 'narrative-round-commit')
    ORDER BY created_at ASC, rowid ASC, id ASC
  `).all(from, to)
  const result = {
    rows: rows.length,
    calls: 0,
    successes: 0,
    failures: 0,
    repairs: 0,
    adoptedRounds: 0,
    repairedRounds: 0,
    registeredCalls: 0,
    anonymousCalls: 0,
    latencySamples: 0,
    latencyMsTotal: 0,
    latencyMaxMs: 0,
    hitTokens: 0,
    missTokens: 0,
    completionTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    byPool: {},
  }
  for (const row of rows) {
    const trace = logTraceContext(row)
    if (row.entry_type === 'proxy-access') {
      result.calls += 1
      if (Number(row.status) >= 200 && Number(row.status) < 400) result.successes += 1
      else result.failures += 1
      if (row.is_registered === 1) result.registeredCalls += 1
      else result.anonymousCalls += 1
      if (trace.durationMs > 0) {
        result.latencySamples += 1
        result.latencyMsTotal += trace.durationMs
        result.latencyMaxMs = Math.max(result.latencyMaxMs, trace.durationMs)
      }
      if (trace.callKind.includes('repair')) result.repairs += 1
      continue
    }
    if (row.entry_type === 'narrative-round-commit') {
      const outcome = asObject(trace.payload.outcome ?? trace.payload)
      if (outcome.narrativeAdopted === true) result.adoptedRounds += 1
      if (numeric(outcome.repairAttempts) > 0) result.repairedRounds += 1
      continue
    }
    if (row.entry_type !== 'proxy-trace' || row.event !== 'response') continue
    const usage = normalizeUsage(extractUsageObject(row.response))
    const pool = trace.callKind || 'unclassified'
    const bucket = result.byPool[pool] ?? {
      calls: 0,
      hitTokens: 0,
      missTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    }
    bucket.calls += 1
    for (const key of ['hitTokens', 'missTokens', 'completionTokens', 'totalTokens']) {
      bucket[key] += usage[key]
      result[key] += usage[key]
    }
    result.reasoningTokens += usage.reasoningTokens
    result.byPool[pool] = bucket
  }
  return {
    ...result,
    successRate: percent(result.successes, result.calls),
    repairRate: percent(result.repairedRounds, result.adoptedRounds),
    cacheHitRate: percent(result.hitTokens, result.hitTokens + result.missTokens),
    averageLatencyMs: result.latencySamples > 0
      ? Math.round(result.latencyMsTotal / result.latencySamples)
      : 0,
    byPool: Object.fromEntries(Object.entries(result.byPool).map(([pool, bucket]) => [pool, {
      ...bucket,
      cacheHitRate: percent(bucket.hitTokens, bucket.hitTokens + bucket.missTokens),
    }])),
  }
}
