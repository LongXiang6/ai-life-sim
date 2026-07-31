import { BaseSubsystem } from '@/core'
import type {
  AchievementDefinition,
  AchievementProgress,
  AchievementSystemPersistenceState,
  AchievementUnlock,
  HistoricalEventView,
  RoundContext,
  SubSystemChanges,
  SubSystemState,
} from '@/foundation'

import {
  assertKnownKeys,
  clone,
  isRecord,
  queryAllHistoricalEvents,
  requireInteger,
  requireString,
  requireStringList,
  requireTotalDays,
} from '../utils'

const NARRATIVE_FACT_TAGS = ['narrative-key-event', 'narrative-digest-fact']

const DEFAULT_DEFINITIONS: AchievementDefinition[] = [
  {
    achievementId: 'achievement:first-recorded-step',
    name: '初见于史',
    description: '留下一件已经提交的生平事实',
    points: 5,
    scopeKind: 'global',
    criteria: { eventTypes: [], tags: NARRATIVE_FACT_TAGS, minimumCount: 1, requireCharacterParticipation: false },
  },
  {
    achievementId: 'achievement:ten-recorded-events',
    name: '人生有迹',
    description: '留下十件已经提交的生平事实',
    points: 15,
    scopeKind: 'global',
    criteria: { eventTypes: [], tags: NARRATIVE_FACT_TAGS, minimumCount: 10, requireCharacterParticipation: false },
  },
  {
    achievementId: 'achievement:first-discovery',
    name: '有所发现',
    description: '完成一次已经入账的发现',
    points: 10,
    scopeKind: 'global',
    criteria: { eventTypes: ['discovery'], tags: NARRATIVE_FACT_TAGS, minimumCount: 1, requireCharacterParticipation: false },
  },
  {
    achievementId: 'achievement:first-creation',
    name: '有所创造',
    description: '完成一次已经入账的创造',
    points: 10,
    scopeKind: 'global',
    criteria: { eventTypes: ['creation'], tags: NARRATIVE_FACT_TAGS, minimumCount: 1, requireCharacterParticipation: false },
  },
  {
    achievementId: 'achievement:three-journeys',
    name: '行路有方',
    description: '完成三次已经入账的旅程',
    points: 20,
    scopeKind: 'global',
    criteria: { eventTypes: ['journey'], tags: NARRATIVE_FACT_TAGS, minimumCount: 3, requireCharacterParticipation: false },
  },
  {
    achievementId: 'achievement:three-conflicts',
    name: '历经交锋',
    description: '经历三次已经入账的冲突',
    points: 20,
    scopeKind: 'global',
    criteria: { eventTypes: ['conflict'], tags: NARRATIVE_FACT_TAGS, minimumCount: 3, requireCharacterParticipation: false },
  },
]

function validateDefinition(value: unknown, index: number): AchievementDefinition {
  if (!isRecord(value)) throw new Error(`definitions[${index}]必须是对象`)
  assertKnownKeys(value, ['achievementId', 'name', 'description', 'points', 'scopeKind', 'contextId', 'criteria'], `definitions[${index}]`)
  if (value.scopeKind !== 'global' && value.scopeKind !== 'context') throw new Error(`definitions[${index}].scopeKind 无效`)
  const contextId = value.contextId === undefined ? undefined : requireString(value.contextId, `definitions[${index}].contextId`)
  if (value.scopeKind === 'context' && !contextId) throw new Error(`definitions[${index}]当地成就缺少 contextId`)
  if (value.scopeKind === 'global' && contextId !== undefined) throw new Error(`definitions[${index}]全局成就不能绑定 contextId`)
  if (!isRecord(value.criteria)) throw new Error(`definitions[${index}].criteria 必须是对象`)
  assertKnownKeys(value.criteria, ['eventTypes', 'tags', 'minimumCount', 'requireCharacterParticipation'], `definitions[${index}].criteria`)
  if (typeof value.criteria.requireCharacterParticipation !== 'boolean') {
    throw new Error(`definitions[${index}].criteria.requireCharacterParticipation 必须是布尔值`)
  }
  return {
    achievementId: requireString(value.achievementId, `definitions[${index}].achievementId`),
    name: requireString(value.name, `definitions[${index}].name`),
    description: requireString(value.description, `definitions[${index}].description`),
    points: requireInteger(value.points, `definitions[${index}].points`, 0, 10000),
    scopeKind: value.scopeKind,
    ...(contextId ? { contextId } : {}),
    criteria: {
      eventTypes: requireStringList(value.criteria.eventTypes, `definitions[${index}].criteria.eventTypes`),
      tags: requireStringList(value.criteria.tags, `definitions[${index}].criteria.tags`),
      minimumCount: requireInteger(value.criteria.minimumCount, `definitions[${index}].criteria.minimumCount`, 1, 100000),
      requireCharacterParticipation: value.criteria.requireCharacterParticipation,
    },
  }
}

function validateProgress(value: unknown, index: number): AchievementProgress {
  if (!isRecord(value)) throw new Error(`progress[${index}]必须是对象`)
  assertKnownKeys(value, ['achievementId', 'entityId', 'matchedEventIds', 'currentCount', 'requiredCount'], `progress[${index}]`)
  const matchedEventIds = requireStringList(value.matchedEventIds, `progress[${index}].matchedEventIds`)
  const currentCount = requireInteger(value.currentCount, `progress[${index}].currentCount`, 0, 1000000)
  if (currentCount !== matchedEventIds.length) throw new Error(`progress[${index}].currentCount 与事件数不一致`)
  return {
    achievementId: requireString(value.achievementId, `progress[${index}].achievementId`),
    entityId: requireString(value.entityId, `progress[${index}].entityId`),
    matchedEventIds,
    currentCount,
    requiredCount: requireInteger(value.requiredCount, `progress[${index}].requiredCount`, 1, 100000),
  }
}

function validateUnlock(value: unknown, index: number): AchievementUnlock {
  if (!isRecord(value)) throw new Error(`unlocks[${index}]必须是对象`)
  assertKnownKeys(value, ['achievementId', 'entityId', 'contextId', 'unlockedAtTotalDays', 'evidenceEventIds'], `unlocks[${index}]`)
  return {
    achievementId: requireString(value.achievementId, `unlocks[${index}].achievementId`),
    entityId: requireString(value.entityId, `unlocks[${index}].entityId`),
    ...(value.contextId === undefined ? {} : { contextId: requireString(value.contextId, `unlocks[${index}].contextId`) }),
    unlockedAtTotalDays: requireTotalDays(value.unlockedAtTotalDays, `unlocks[${index}].unlockedAtTotalDays`),
    evidenceEventIds: requireStringList(value.evidenceEventIds, `unlocks[${index}].evidenceEventIds`),
  }
}

function validatePersistenceState(value: unknown): AchievementSystemPersistenceState {
  if (!isRecord(value)) throw new Error('成就持久化快照必须是对象')
  assertKnownKeys(value, ['schemaVersion', 'definitions', 'progress', 'unlocks'], '成就持久化快照')
  if (value.schemaVersion !== 1 || !Array.isArray(value.definitions) || !Array.isArray(value.progress) || !Array.isArray(value.unlocks)) {
    throw new Error('成就持久化快照结构无效')
  }
  const definitions = value.definitions.map(validateDefinition)
  const progress = value.progress.map(validateProgress)
  const unlocks = value.unlocks.map(validateUnlock)
  if (new Set(definitions.map((item) => item.achievementId)).size !== definitions.length) throw new Error('成就定义 ID 重复')
  const definitionIds = new Set(definitions.map((item) => item.achievementId))
  const progressKeys = progress.map((item) => `${item.entityId}\u0000${item.achievementId}`)
  const unlockKeys = unlocks.map((item) => `${item.entityId}\u0000${item.achievementId}`)
  if (new Set(progressKeys).size !== progressKeys.length) throw new Error('成就进度重复')
  if (new Set(unlockKeys).size !== unlockKeys.length) throw new Error('成就解锁重复')
  if ([...progress, ...unlocks].some((item) => !definitionIds.has(item.achievementId))) throw new Error('成就状态引用未知定义')
  return { schemaVersion: 1, definitions, progress, unlocks }
}

function eventTime(event: HistoricalEventView): number {
  return event.latestTransition?.totalDays ?? event.createdTotalDays
}

function matchesDefinition(event: HistoricalEventView, definition: AchievementDefinition, entityId: string): boolean {
  const { criteria } = definition
  if (criteria.eventTypes.length > 0 && !criteria.eventTypes.includes(event.eventType)) return false
  if (criteria.tags.length > 0 && !event.tags.some((tag) => criteria.tags.includes(tag))) return false
  if (criteria.requireCharacterParticipation && !event.participants.some((item) => item.entityId === entityId)) return false
  return true
}

export class AchievementSystem extends BaseSubsystem {
  readonly id = 'achievement' as const
  readonly mod = 'mod-progression' as const
  readonly label = '历史成就' as const
  readonly description = '只根据完整历史事件账本中的已发生事实计算人物成就、进度和解锁证据' as const

  private state: AchievementSystemPersistenceState = {
    schemaVersion: 1,
    definitions: clone(DEFAULT_DEFINITIONS),
    progress: [],
    unlocks: [],
  }

  advance(context: RoundContext): void {
    this.refreshEntity(context.characterId, context.totalDays)
  }

  onHistoricalEventsCommitted(_eventIds: string[], context: RoundContext): void {
    this.refreshEntity(context.characterId, context.totalDays)
  }

  collectState(context: RoundContext): SubSystemState {
    const progress = this.state.progress.filter((item) => item.entityId === context.characterId)
    const unlocks = this.state.unlocks.filter((item) => item.entityId === context.characterId)
    const unlockedIds = new Set(unlocks.map((item) => item.achievementId))
    const unlockedDefinitions = this.state.definitions.filter((item) => unlockedIds.has(item.achievementId))
    return {
      id: this.id,
      summary: `【${this.label}】已由历史事实确认 ${unlocks.length}/${this.state.definitions.length} 项，共 ${unlockedDefinitions.reduce((sum, item) => sum + item.points, 0)} 点`,
      data: structuredClone({
        entityId: context.characterId,
        definitions: this.state.definitions,
        progress,
        unlocks,
      }),
    }
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext): void {
    void changes
    throw new Error('[achievement] 只读取历史事实账本，不接受叙事 AI 或调用方直接解锁')
  }

  defineAchievement(definition: AchievementDefinition): void {
    const validated = validateDefinition(definition, this.state.definitions.length)
    if (this.state.definitions.some((item) => item.achievementId === validated.achievementId)) {
      throw new Error(`成就定义已经存在：${validated.achievementId}`)
    }
    this.state.definitions.push(validated)
  }

  refreshEntity(entityId: string, totalDays: number): AchievementUnlock[] {
    requireString(entityId, '成就人物实体')
    requireTotalDays(totalDays, '成就刷新时间')
    const newUnlocks: AchievementUnlock[] = []
    for (const definition of this.state.definitions) {
      const events = queryAllHistoricalEvents({
        ...(definition.contextId ? { contextId: definition.contextId } : {}),
        statuses: ['occurred', 'resolved'],
        ...(definition.criteria.requireCharacterParticipation ? { entityIds: [entityId] } : {}),
      }).filter((event) => matchesDefinition(event, definition, entityId))
        .sort((left, right) => eventTime(left) - eventTime(right) || left.eventId.localeCompare(right.eventId))
      const matchedEventIds = events.map((event) => event.eventId)
      const progress: AchievementProgress = {
        achievementId: definition.achievementId,
        entityId,
        matchedEventIds,
        currentCount: matchedEventIds.length,
        requiredCount: definition.criteria.minimumCount,
      }
      const progressIndex = this.state.progress.findIndex((item) => item.achievementId === definition.achievementId && item.entityId === entityId)
      if (progressIndex < 0) this.state.progress.push(progress)
      else this.state.progress[progressIndex] = progress

      if (matchedEventIds.length < definition.criteria.minimumCount) continue
      if (this.state.unlocks.some((item) => item.achievementId === definition.achievementId && item.entityId === entityId)) continue
      const evidence = events.slice(0, definition.criteria.minimumCount)
      const unlock: AchievementUnlock = {
        achievementId: definition.achievementId,
        entityId,
        ...(definition.contextId ? { contextId: definition.contextId } : {}),
        unlockedAtTotalDays: evidence.length > 0 ? eventTime(evidence[evidence.length - 1]) : totalDays,
        evidenceEventIds: evidence.map((event) => event.eventId),
      }
      this.state.unlocks.push(unlock)
      newUnlocks.push(clone(unlock))
    }
    return newUnlocks
  }

  listUnlocks(entityId: string): AchievementUnlock[] {
    return clone(this.state.unlocks.filter((item) => item.entityId === entityId))
  }

  capturePersistenceState(): AchievementSystemPersistenceState {
    return validatePersistenceState(clone(this.state))
  }

  restorePersistenceState(snapshot: unknown): void {
    this.state = snapshot === undefined
      ? { schemaVersion: 1, definitions: clone(DEFAULT_DEFINITIONS), progress: [], unlocks: [] }
      : validatePersistenceState(snapshot)
  }

  capturePreviewState(): AchievementSystemPersistenceState {
    return this.capturePersistenceState()
  }

  restorePreviewState(snapshot: unknown): void {
    this.restorePersistenceState(snapshot)
  }

  reset(): void {
    this.state = { schemaVersion: 1, definitions: clone(DEFAULT_DEFINITIONS), progress: [], unlocks: [] }
  }
}

let runtimeAchievementSystem: AchievementSystem | undefined

export function getAchievementSystem(): AchievementSystem {
  runtimeAchievementSystem ??= new AchievementSystem()
  return runtimeAchievementSystem
}
