#!/usr/bin/env node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-life-sim-feedback-status-'))
const projectRoot = process.cwd()
const statusScript = path.join(projectRoot, 'scripts', 'ops', 'feedback-status.mjs')
const inspectorScript = path.join(projectRoot, 'scripts', 'ops', 'inspect-ai-logs.mjs')
const feedbackId = 'FB-20260721-TEST1234'
const playerCode = 'AB2CD3'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function run(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `command failed: ${script}`)
  return result.stdout.trim()
}

try {
  fs.mkdirSync(path.join(root, 'feedback'), { recursive: true })
  fs.writeFileSync(
    path.join(root, 'feedback', 'feedback-2026-07-21.jsonl'),
    `${JSON.stringify({ feedbackId, receivedAt: Date.now(), sourceIp: '127.0.0.1', category: 'bug', subject: 'test feedback' })}\n`,
  )
  fs.mkdirSync(path.join(root, 'players', playerCode), { recursive: true })
  fs.writeFileSync(
    path.join(root, 'players', playerCode, 'feedback-2026-07-21.jsonl'),
    `${JSON.stringify({ feedbackId, receivedAt: Date.now(), sourceIp: '127.0.0.1', diagnosticCode: playerCode, category: 'bug', subject: 'test feedback' })}\n`,
  )

  const initial = JSON.parse(run(statusScript, ['--root', root, '--feedback-id', feedbackId, '--show']))
  assert(initial.status === 'new', 'feedback without status events must be new')

  run(statusScript, ['--root', root, '--feedback-id', feedbackId, '--status', 'in_progress', '--operator', 'smoke'])
  run(statusScript, ['--root', root, '--feedback-id', feedbackId, '--status', 'resolved', '--operator', 'smoke', '--evidence', 'commit and focused regression passed'])

  const resolved = JSON.parse(run(inspectorScript, ['--root', root, '--all', '--limit', '10']))
  assert(resolved.totals.feedbackStatusEvents === 2, 'inspector must count status events')
  assert(resolved.recentFeedback[0].status === 'resolved', 'inspector must expose the latest feedback status')
  assert(resolved.recentFeedback[0].statusLabel === '已完成', 'resolved status must have a player-independent Chinese label')
  assert(resolved.recentFeedbackStatusEvents[0].evidence === 'commit and focused regression passed', 'inspector must retain resolution evidence')

  const playerResolved = JSON.parse(run(inspectorScript, [
    '--root', root,
    '--all',
    '--player-code', playerCode,
    '--limit', '10',
  ]))
  assert(playerResolved.recentFeedback[0].status === 'resolved', 'player-code lookup must merge root feedback status events')
  assert(playerResolved.totals.feedbackStatusEvents === 2, 'player-code lookup must expose the correlated status history')

  const reopened = run(statusScript, ['--root', root, '--feedback-id', feedbackId, '--show'])
  assert(JSON.parse(reopened).status === 'resolved', 'show must derive the latest status')
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}

console.log('[feedback-status-smoke] PASS')
