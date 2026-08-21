#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-life-sim-round-archive-'))
process.env.NARRATIVE_ROUND_LOG_DIR = tempRoot
const previousNodeEnv = process.env.NODE_ENV
process.env.NODE_ENV = 'development'

const archive = await import('../../../../src/core/logger/narrative-round-archive.ts')

try {
  const styleText = '克制地写行动。\n第二行  保留双空格与结尾。  '
  const trace = {
    lifeRunId: 'life-exact-smoke',
    round: 9,
    callKind: 'narrative-main',
    executionKind: 'real',
    styleSource: 'custom',
    styleText,
    styleVersion: 3,
  }
  const requestOne = '{"messages":[{"role":"user","content":"原文\\n分隔符 ----- RESPONSE BEGIN -----"}]}'
  const responseOne = 'data: {"内容":"一模一样😀"}\n\ndata: [DONE]\n\n'
  const requestTwo = '{"messages":[{"role":"user","content":"第二次请求"}]}'
  const responseTwo = '{"choices":[{"message":{"content":"第二次返回"}}]}'

  await archive.appendNarrativeRoundExchange({
    trace,
    requestId: 'request-1',
    providerId: 'test-provider',
    model: 'test-model',
    attempt: 1,
    status: 200,
    requestBody: requestOne,
    responseBody: new TextEncoder().encode(responseOne),
    styleFingerprint: 'fixture-sha256',
  })
  await archive.appendNarrativeRoundOutcome({
    recordedAt: 123456,
    report: {
      schemaVersion: 1,
      lifeRunId: trace.lifeRunId,
      round: trace.round,
      executionKind: 'real',
      status: 'completed',
      startedAt: 100,
      completedAt: 200,
      durationMs: 100,
      phases: [{ name: 'ai-narration', status: 'completed', durationMs: 80 }],
      adoption: {
        responseReceived: true,
        narrativeAdopted: true,
        structuredDataPresent: true,
        structuredDataAccepted: true,
        requestedChangeCount: 1,
        committedChangeCount: 1,
        rejectedChangeCount: 0,
        rejectedReasons: [],
        narrativeId: 'narrative-9',
        narrativeChars: 321,
      },
      quality: {
        styleSource: 'custom',
        styleVersion: 3,
        initialValid: false,
        finalValid: true,
        narrativeChars: 321,
      },
      compression: { status: 'completed', l1Count: 1, l2Count: 0, l3Count: 0 },
      autoSave: { status: 'completed', round: 9 },
    },
  })
  await archive.appendNarrativeRoundExchange({
    trace,
    requestId: 'request-2',
    providerId: 'test-provider',
    model: 'test-model',
    attempt: 1,
    status: 200,
    requestBody: requestTwo,
    responseBody: responseTwo,
    transportError: undefined,
    styleFingerprint: 'fixture-sha256',
  })

  const filePath = archive.getNarrativeRoundArchivePath(trace.lifeRunId, trace.round)
  const bytes = await fs.readFile(filePath)
  const text = bytes.toString('utf8')
  assert.equal((text.match(/===== EXCHANGE BEGIN =====/g) ?? []).length, 2, 'same round must append both attempts')

  function extract(recordIndex) {
    const starts = [...text.matchAll(/===== EXCHANGE BEGIN =====/g)].map((match) => match.index)
    const start = starts[recordIndex]
    assert.notEqual(start, undefined)
    const slice = text.slice(start)
    const requestLength = Number(slice.match(/request_utf8_bytes: (\d+)/)?.[1])
    const responseLength = Number(slice.match(/response_utf8_bytes: (\d+)/)?.[1])
    const requestMarker = '----- REQUEST BEGIN -----\n'
    const requestStartText = start + slice.indexOf(requestMarker) + requestMarker.length
    const requestStart = Buffer.byteLength(text.slice(0, requestStartText), 'utf8')
    const request = bytes.subarray(requestStart, requestStart + requestLength).toString('utf8')
    const responseMarker = '----- RESPONSE BEGIN -----\n'
    const responseMarkerStart = start + slice.indexOf(responseMarker)
    const responseStartText = responseMarkerStart + responseMarker.length
    const responseStart = Buffer.byteLength(text.slice(0, responseStartText), 'utf8')
    const response = bytes.subarray(responseStart, responseStart + responseLength).toString('utf8')
    return { request, response }
  }

  assert.deepEqual(extract(0), { request: requestOne, response: responseOne }, 'first payload must round-trip byte-for-byte')
  assert.deepEqual(extract(1), { request: requestTwo, response: responseTwo }, 'second independent payload must round-trip byte-for-byte')
  assert.equal((text.match(/===== STYLE SNAPSHOT BEGIN =====/g) ?? []).length, 1, 'one real narrative round must store the active style exactly once')
  const styleLength = Number(text.match(/style_utf8_bytes: (\d+)/)?.[1])
  const styleMarker = '----- STYLE TEXT BEGIN -----\n'
  const styleStartText = text.indexOf(styleMarker) + styleMarker.length
  const styleStart = Buffer.byteLength(text.slice(0, styleStartText), 'utf8')
  assert.equal(
    bytes.subarray(styleStart, styleStart + styleLength).toString('utf8'),
    styleText,
    'the full active style must round-trip byte-for-byte without trimming or replacement',
  )
  assert(text.includes('style_fingerprint_sha256: fixture-sha256'), 'style snapshot must include its full trace fingerprint')
  assert(text.includes('life_run_id: life-exact-smoke'), 'archive must identify the save without altering payloads')
  assert(text.includes('"finalValid": true'), 'the same round archive must retain final style quality results')
  assert(!text.includes('repairAttempts'), 'the same round archive must not retain removed repair counters')
  const diagnosticPath = archive.getNarrativeRoundDiagnosticPath(trace.lifeRunId, trace.round)
  const diagnostic = await fs.readFile(diagnosticPath, 'utf8')
  assert.equal(JSON.parse(diagnostic.trim()).quality.styleVersion, 3, 'development diagnostics must link the exact style version to final quality')
  console.log('PASS: narrative-round-archive-smoke')
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true })
  delete process.env.NARRATIVE_ROUND_LOG_DIR
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = previousNodeEnv
}
