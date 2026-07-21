'use client'

/**
 * @module mythic-library-store
 * @description 跨世界、跨局共享的转世天赋总库
 * @mod mod-character
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { ACCOUNT_MAX_SLOTS } from '@/core/account/account-contract'

import type { MythicPattern, MythicPatternCandidate, MythicPatternSource } from './types'
import { sanitizeMythicPattern, sanitizeMythicPatternCandidate } from './utils/character-state-migration'

function mythicIdentity(candidate: MythicPatternCandidate): string {
  return `${candidate.name.trim()}\u0000${candidate.concept.trim()}`.toLocaleLowerCase()
}

function normalizedMythicName(name: string): string {
  return name.normalize('NFKC').trim().replace(/\s+/g, '').toLocaleLowerCase()
}

function hashIdentity(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

/** 将 AI 候选封装为可持久化词条；ID 由内容身份本地生成，重复封存保持幂等。 */
export function sealMythicPatternCandidate(
  candidateInput: MythicPatternCandidate,
  source: MythicPatternSource,
  acquiredAt = Date.now(),
): MythicPattern {
  const candidate = sanitizeMythicPatternCandidate(candidateInput)
  if (!candidate) throw new Error('转世天赋候选结构无效')
  return {
    ...candidate,
    id: `mythic-${hashIdentity(mythicIdentity(candidate))}`,
    acquiredAt,
    source: {
      worldName: source.worldName.trim() || '未知世界',
      characterName: source.characterName.trim() || '无名之辈',
      ...(typeof source.finalAge === 'number' && Number.isFinite(source.finalAge)
        ? { finalAge: source.finalAge }
        : {}),
      ...(typeof source.runId === 'string' && source.runId.trim()
        ? { runId: source.runId.trim() }
        : {}),
    },
  }
}

interface MythicLibraryStore {
  patterns: MythicPattern[]
  addPattern: (
    pattern: MythicPattern | MythicPatternCandidate,
    source?: MythicPatternSource,
  ) => MythicPattern
  removePattern: (id: string) => void
  replacePatterns: (patterns: MythicPattern[]) => void
}

export const useMythicLibraryStore = create<MythicLibraryStore>()(
  persist(
    (set, get) => ({
      patterns: [],
      addPattern: (input, source) => {
        const complete = sanitizeMythicPattern(input)
        const pattern = complete ?? sealMythicPatternCandidate(
          input as MythicPatternCandidate,
          source ?? { worldName: '未知世界', characterName: '无名之辈' },
        )
        const patternName = normalizedMythicName(pattern.name)
        const existing = get().patterns.find((item) => (
          item.id === pattern.id
          || normalizedMythicName(item.name) === patternName
          || (pattern.source.runId && item.source.runId === pattern.source.runId)
        ))
        if (existing) return existing
        if (get().patterns.length >= ACCOUNT_MAX_SLOTS) {
          throw new Error('转世天赋栏位已满，请先删除一项旧天赋')
        }
        set((state) => ({ patterns: [...state.patterns, pattern] }))
        return pattern
      },
      removePattern: (id) => set((state) => ({
        patterns: state.patterns.filter((pattern) => pattern.id !== id),
      })),
      replacePatterns: (patterns) => {
        if (patterns.length > ACCOUNT_MAX_SLOTS) throw new Error('转世天赋不能超过 10 项')
        const sanitized = patterns
          .map(sanitizeMythicPattern)
          .filter((item): item is MythicPattern => item !== null)
        if (sanitized.length !== patterns.length) throw new Error('转世天赋数据无效')
        set({ patterns: sanitized })
      },
    }),
    {
      name: 'mod-character:persist:mythic-library',
      version: 2,
      migrate: (persistedState: unknown, version: number) => {
        if (version < 2) return { patterns: [] }
        const raw = persistedState && typeof persistedState === 'object' && !Array.isArray(persistedState)
          ? persistedState as { patterns?: unknown }
          : {}
        const patterns = Array.isArray(raw.patterns)
          ? raw.patterns.map(sanitizeMythicPattern).filter((item): item is MythicPattern => item !== null)
          : []
        return { patterns }
      },
      partialize: (state) => ({ patterns: state.patterns }),
    },
  ),
)
