/**
 * Purpose: Project the current application version, latest updates, and QQ integration capabilities.
 * Owner: core:account
 * Responsibility: Read-only project status only; account binding and authentication remain separate.
 */

import fs from 'node:fs'
import path from 'node:path'

import changelogIndex from '../../../../public/changelog-index.json'
import { ENGINE_VERSION } from '@/core/version'

import type { QqBotProjectStatus } from './contracts'

export function readQqBotProjectStatus(): QqBotProjectStatus {
  const changelogPath = path.join(process.cwd(), 'public', `changelog-${changelogIndex.latestChunk}.txt`)
  let latestUpdates: string[] = []
  try {
    const latestEntry = fs.readFileSync(changelogPath, 'utf8')
      .replace(/\r\n?/gu, '\n')
      .split(/^---\s*$/mu)
      .map((section) => section.trim())
      .filter(Boolean)[0] ?? ''
    latestUpdates = latestEntry
      .split(/\r?\n/u)
      .filter((line) => /^\s+-\s+/u.test(line))
      .map((line) => line.replace(/^\s+-\s+/u, '').trim())
      .filter(Boolean)
  } catch {
    latestUpdates = []
  }
  return {
    project: 'AI Life Sim',
    version: ENGINE_VERSION,
    latestUpdates,
    capabilities: {
      optionalAccount: true,
      cloudSync: true,
      verifiedQqBinding: true,
      sharedPoints: true,
    },
  }
}
