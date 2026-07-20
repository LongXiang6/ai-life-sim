#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { PlayerFeedbackEnvelopeSchema } from '../../../../src/core/logger/feedback-contract.ts'
import { redactSensitiveData } from '../../../../src/core/logger/redact-sensitive-data.ts'

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
  message: '点击推进后没有显示新内容。',
  submittedAt: Date.now(),
  consent: true,
  diagnostics: {
    app: { version: 'test', page: '/game-story' },
    device: { userAgent: 'test-agent' },
    globalConfig: { theme: 'minimal-white' },
    gameState: { round: 21 },
    recentStory: [{ text: completeStory, round: 20 }],
    recentClientLogs: [{ level: 'error', message: 'failed' }],
  },
})
assert(parsed.diagnostics.recentStory[0].text === completeStory, 'recent story text must remain complete')

const redacted = redactSensitiveData({
  customKey: 'player-secret',
  authorization: 'Bearer hidden-value',
  serialNumber: 'SERIAL-001',
  hardwareId: 'HW-001',
  story: completeStory,
})
assert(redacted.customKey === '[REDACTED]', 'custom API key must be redacted')
assert(redacted.authorization === '[REDACTED]', 'authorization must be redacted')
assert(redacted.serialNumber === '[REDACTED]', 'device serial number must be redacted')
assert(redacted.hardwareId === '[REDACTED]', 'hardware ID must be redacted')
assert(redacted.story === completeStory, 'non-secret story content must not be shortened')

const collector = read('src/mods/mod-pages/pages/feedback/build-feedback-diagnostics.ts')
const route = read('src/app/api/feedback/route.ts')
const store = read('src/core/logger/player-feedback-store.ts')
const page = read('src/mods/mod-pages/pages/feedback/page.tsx')
const disclaimer = read('public/disclaimer.txt')
const disclaimerModal = read('src/mods/mod-ui/components/organisms/DisclaimerModal.tsx')

assert(
  collector.includes('.slice(-RECENT_NARRATIVE_WINDOW)')
    && !/entry\.text\.slice|substring\(|substr\(/.test(collector),
  'collector must select the recent window without truncating story text',
)
assert(
  collector.includes("['provider', 'customKey', 'customUrl', 'customModel']"),
  'collector must exclude player API routing and credential fields',
)
assert(
  collector.includes('getCachedDiagnosticPlayerCode()'),
  'feedback diagnostics must carry the current server-issued player code',
)
assert(
  !/serialNumber|hardwareId|deviceId|imei|macAddress/.test(collector),
  'device collector must not collect stable hardware identifiers',
)
assert(
  route.includes('诊断包过大，未保存任何内容') && route.includes('storePlayerFeedback'),
  'oversized or failed feedback must reject the whole diagnostic package',
)
assert(
  store.includes('feedback/submissions/${date}/${feedbackId}.json')
    && store.includes('appendSourceJsonLine')
    && store.includes('diagnosticCode: source.diagnosticCode'),
  'feedback must persist a full private submission with IP and player-code indexes',
)
assert(
  page.includes('近期完整故事')
    && page.includes('不包含 API Key、认证信息或设备序列号')
    && page.includes('此浏览器的诊断编号'),
  'feedback page must give a concise truthful diagnostic-package disclosure',
)
assert(
  disclaimer.includes('版本：2.2.0')
    && disclaimer.includes('反馈诊断包只在玩家明确确认并提交时上传')
    && disclaimer.includes('六位诊断编号')
    && disclaimerModal.includes("const DISCLAIMER_VERSION = '2.2.0'"),
  'the versioned disclaimer must replace the obsolete no-server-storage claim',
)

console.log('[player-feedback-smoke] PASS')
