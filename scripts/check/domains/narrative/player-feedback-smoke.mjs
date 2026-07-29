#!/usr/bin/env node

import fs from 'node:fs'
import { promises as fsp } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { PlayerFeedbackEnvelopeSchema } from '../../../../src/core/logger/feedback-contract.ts'

const root = process.cwd()

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

const completeStory = '这是完整故事正文。'.repeat(400)
const parsed = PlayerFeedbackEnvelopeSchema.parse({
  category: 'bug',
  subject: '故事推进异常',
  message: '推进后没有显示新内容。',
  submittedAt: Date.now(),
  diagnostics: {
    app: { version: 'test', page: '/game-story' },
    device: { userAgent: 'test-agent', serialNumber: 'SERIAL-PLAIN' },
    globalConfig: {
      theme: 'minimal-white',
      customKey: 'plain-feedback-key',
      authorization: 'Bearer plain-feedback-token',
    },
    gameState: { round: 21 },
    recentStory: [{ text: completeStory, round: 20 }],
    recentClientLogs: [{ level: 'error', message: 'failed' }],
  },
})
assert(parsed.diagnostics.recentStory[0].text === completeStory, 'recent story text must remain complete')
assert(!('consent' in parsed), 'feedback contract must not require a consent field')

const collector = read('src/mods/mod-pages/pages/feedback/build-feedback-diagnostics.ts')
const route = read('src/app/api/feedback/route.ts')
const page = read('src/mods/mod-pages/pages/feedback/page.tsx')
const disclaimer = read('public/disclaimer.txt')
const help = read('public/help.md')

assert(
  collector.includes('.slice(-RECENT_NARRATIVE_WINDOW)')
    && !/entry\.text\.slice|substring\(|substr\(/.test(collector),
  'collector must select the recent window without truncating story text',
)
assert(
  !/redact|excludedTerms|delete safeSettings|customKey.*delete/.test(collector),
  'feedback collector must not redact or omit user configuration fields',
)
assert(
  route.includes('反馈内容过大，未保存任何内容') && route.includes('storePlayerFeedback'),
  'oversized or failed feedback must reject the whole submission',
)
assert(
  page.includes('ensureDiagnosticPlayerCode')
    && page.includes('六位诊断编号')
    && page.includes('复制诊断编号')
    && page.includes('重新获取')
    && !/consent|附带诊断|API Key、认证信息|隐私|脱敏|采集/.test(page),
  'feedback page must expose the six-character diagnostic code without restoring consent or collection disclosure UI',
)
assert(
  !/诊断日志|隐私|脱敏|采集|哈希去重|诊断编号|环境快照/.test(disclaimer + help),
  'user-facing disclaimer and help must contain no logging or collection disclosure',
)

const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'ai-life-sim-feedback-plaintext-'))
process.env.AI_LOG_DB_PATH = path.join(tempRoot, 'logs.sqlite')
const [feedbackStore, logStore] = await Promise.all([
  import('../../../../src/core/logger/player-feedback-store.ts'),
  import('../../../../src/core/logger/server-log-store.ts'),
])
try {
  const source = {
    ip: '203.0.113.22',
    sourceId: 'ip-203.0.113.22',
    diagnosticCode: '7K3M9Q',
    isRegistered: false,
  }
  const stored = await feedbackStore.storePlayerFeedback(parsed, source)
  assert(stored?.feedbackId, 'feedback must be stored in the plaintext database')
  const row = logStore.queryServerLogEntries({ feedbackId: stored.feedbackId }).entries[0]
  assert(row.entryType === 'feedback', 'feedback must own a database row')
  assert(row.payload.diagnostics.globalConfig.customKey === 'plain-feedback-key', 'feedback API key field must remain plaintext')
  assert(row.payload.diagnostics.globalConfig.authorization === 'Bearer plain-feedback-token', 'feedback authorization field must remain plaintext')
  assert(row.payload.diagnostics.device.serialNumber === 'SERIAL-PLAIN', 'device field must remain plaintext')
  assert(row.payload.diagnostics.recentStory[0].text === completeStory, 'feedback story must round-trip without compression or truncation')
  console.log('[player-feedback-smoke] PASS')
} finally {
  logStore.closeServerLogDatabaseForTests()
  await fsp.rm(tempRoot, { recursive: true, force: true })
  delete process.env.AI_LOG_DB_PATH
}
