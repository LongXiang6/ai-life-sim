/**
 * P3 geography owner.
 * Geography is partitioned by world context and spatial node. Collection is read-only.
 */

import { BaseSubsystem } from '@/core'
import type {
  GeographyChangeRecord,
  GeographyMutationInput,
  GeographyPersistenceState,
  NodeGeographyRecord,
  RoundContext,
  SubSystemChanges,
  SubSystemState,
  TerrainClass,
} from '@/foundation'
import { getHistoricalEvent } from '@/mods/mod-history-dynamics/historical-event-api'
import {
  assertWorldSpatialNode,
  contextHasCapability,
  listWorldContexts,
} from '@/mods/mod-world'

const TERRAIN_ALIASES: Readonly<Record<string, TerrainClass>> = {
  plain: 'plain', plains: 'plain', grassland: 'plain',
  forest: 'forest', woodland: 'forest', jungle: 'forest',
  mountain: 'mountain', mountains: 'mountain', plateau: 'mountain', valley: 'mountain',
  desert: 'desert', wasteland: 'desert',
  ocean: 'water', sea: 'water', lake: 'water', river: 'water', coast: 'water', island: 'water',
  swamp: 'wetland', wetland: 'wetland',
  tundra: 'ice', ice: 'ice', glacier: 'ice',
  volcanic: 'volcanic', volcano: 'volcanic',
  underground: 'underground', cave: 'underground',
  artificial: 'artificial', station: 'artificial', city: 'artificial',
  celestial: 'celestial', star: 'celestial',
  void: 'void',
  abstract: 'abstract', dream: 'abstract', digital: 'abstract',
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} 必须是非空字符串`)
  return value.trim()
}

function requireFinite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} 必须是有限数字`)
  return value
}

function requireTotalDays(value: unknown, label: string): number {
  const totalDays = requireFinite(value, label)
  if (!Number.isInteger(totalDays) || totalDays < 0) throw new Error(`${label} 必须是非负整数`)
  return totalDays
}

function stringList(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error(`${label} 必须是非空字符串数组`)
  }
  return [...new Set(value.map((item) => (item as string).trim()))]
}

function terrainClass(value: unknown): TerrainClass {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase().replaceAll('_', '-') : ''
  return TERRAIN_ALIASES[normalized] ?? 'unknown'
}

function normalizeUnitInterval(value: unknown, label: string): number {
  const number = requireFinite(value, label)
  if (number < 0 || number > 1) throw new Error(`${label} 必须位于 0 至 1`)
  return number
}

function validateEvidence(eventIds: readonly string[], contextId: string): void {
  for (const eventId of eventIds) {
    const event = getHistoricalEvent(eventId)
    if (!event || (event.status !== 'occurred' && event.status !== 'resolved')) {
      throw new Error(`地理变化依据不是已发生或已解决的历史事件：${eventId}`)
    }
    if (event.scope.kind !== 'global' && !event.scope.contextIds.includes(contextId)) {
      throw new Error(`地理变化依据不属于目标上下文：${eventId}`)
    }
  }
}

function normalizeNode(value: unknown, index: number): NodeGeographyRecord {
  if (!isRecord(value)) throw new Error(`nodes[${index}] 必须是对象`)
  const contextId = requireString(value.contextId, `nodes[${index}].contextId`)
  const nodeId = requireString(value.nodeId, `nodes[${index}].nodeId`)
  assertWorldSpatialNode(contextId, nodeId)
  return {
    contextId,
    nodeId,
    terrainClass: terrainClass(value.terrainClass),
    displayName: requireString(value.displayName, `nodes[${index}].displayName`),
    ...(value.elevation === undefined ? {} : { elevation: requireFinite(value.elevation, `nodes[${index}].elevation`) }),
    ...(value.temperature === undefined ? {} : { temperature: requireFinite(value.temperature, `nodes[${index}].temperature`) }),
    ...(value.humidity === undefined ? {} : { humidity: requireFinite(value.humidity, `nodes[${index}].humidity`) }),
    traversability: normalizeUnitInterval(value.traversability, `nodes[${index}].traversability`),
    traitTags: stringList(value.traitTags, `nodes[${index}].traitTags`),
    hazardTags: stringList(value.hazardTags, `nodes[${index}].hazardTags`),
    sourceEventIds: stringList(value.sourceEventIds, `nodes[${index}].sourceEventIds`),
    updatedAtTotalDays: requireTotalDays(value.updatedAtTotalDays, `nodes[${index}].updatedAtTotalDays`),
  }
}

function validatePersistenceState(value: unknown): GeographyPersistenceState {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.nodes) || !Array.isArray(value.changes)) {
    throw new Error('地理持久化快照结构无效')
  }
  const nodes = value.nodes.map(normalizeNode)
  const nodeKeys = new Set<string>()
  for (const node of nodes) {
    const key = `${node.contextId}\u0000${node.nodeId}`
    if (nodeKeys.has(key)) throw new Error(`地理节点重复：${node.nodeId}`)
    nodeKeys.add(key)
  }
  const changeIds = new Set<string>()
  const changes = value.changes.map((item, index): GeographyChangeRecord => {
    if (!isRecord(item)) throw new Error(`changes[${index}] 必须是对象`)
    const contextId = requireString(item.contextId, `changes[${index}].contextId`)
    const nodeId = requireString(item.nodeId, `changes[${index}].nodeId`)
    if (!nodeKeys.has(`${contextId}\u0000${nodeId}`)) throw new Error(`地理变化引用未知节点：${nodeId}`)
    const changeId = requireString(item.changeId, `changes[${index}].changeId`)
    if (changeIds.has(changeId)) throw new Error(`地理变化 ID 重复：${changeId}`)
    changeIds.add(changeId)
    return {
      changeId,
      contextId,
      nodeId,
      changeType: requireString(item.changeType, `changes[${index}].changeType`),
      description: requireString(item.description, `changes[${index}].description`),
      occurredAtTotalDays: requireTotalDays(item.occurredAtTotalDays, `changes[${index}].occurredAtTotalDays`),
      evidenceEventIds: stringList(item.evidenceEventIds, `changes[${index}].evidenceEventIds`),
    }
  })
  return { schemaVersion: 1, nodes, changes }
}

function initialGeographyForNode(input: {
  contextId: string
  nodeId: string
  name: string
  terrainTag?: unknown
  temperature?: unknown
  humidity?: unknown
  totalDays: number
}): NodeGeographyRecord {
  const terrain = terrainClass(input.terrainTag)
  return {
    contextId: input.contextId,
    nodeId: input.nodeId,
    terrainClass: terrain,
    displayName: input.name,
    ...(typeof input.temperature === 'number' && Number.isFinite(input.temperature)
      ? { temperature: input.temperature }
      : {}),
    ...(typeof input.humidity === 'number' && Number.isFinite(input.humidity)
      ? { humidity: input.humidity }
      : {}),
    traversability: ['water', 'void'].includes(terrain) ? 0.2 : terrain === 'mountain' ? 0.45 : 1,
    traitTags: terrain === 'unknown' ? [] : [terrain],
    hazardTags: [],
    sourceEventIds: [],
    updatedAtTotalDays: input.totalDays,
  }
}

export class GeographySystem extends BaseSubsystem {
  readonly id = 'geography' as const
  readonly mod = 'mod-environment-ecology' as const
  readonly label = '地理系统' as const
  readonly description = '按世界上下文和空间节点拥有地形、地理属性与有历史依据的变化' as const

  private state: GeographyPersistenceState = { schemaVersion: 1, nodes: [], changes: [] }

  advance(context: RoundContext): void {
    const known = new Set(this.state.nodes.map((node) => `${node.contextId}\u0000${node.nodeId}`))
    const additions: NodeGeographyRecord[] = []
    for (const instance of listWorldContexts()) {
      const contextId = instance.record.id
      if (!contextHasCapability(contextId, 'space')) continue
      const regions = new Map(instance.regions.map((region) => [region.id, region]))
      for (const node of Object.values(instance.spatialGraph.nodes)) {
        const key = `${contextId}\u0000${node.id}`
        if (known.has(key)) continue
        const region = regions.get(node.id)
        additions.push(initialGeographyForNode({
          contextId,
          nodeId: node.id,
          name: node.name,
          terrainTag: region?.terrainTag ?? node.attributes.terrainTag,
          temperature: region?.temperature,
          humidity: region?.humidity,
          totalDays: context.totalDays,
        }))
        known.add(key)
      }
    }
    if (additions.length > 0) this.state.nodes.push(...additions)
  }

  collectState(context: RoundContext): SubSystemState {
    const nodes = this.listNodes(context.contextId)
    const recentChanges = this.state.changes.filter((item) => item.contextId === context.contextId)
    const terrainCounts = new Map<TerrainClass, number>()
    nodes.forEach((node) => terrainCounts.set(node.terrainClass, (terrainCounts.get(node.terrainClass) ?? 0) + 1))
    const distribution = [...terrainCounts.entries()].map(([terrain, count]) => `${terrain}:${count}`).join('、')
    return {
      id: this.id,
      summary: nodes.length === 0 ? '' : `【${this.label}】${nodes.length} 个空间节点${distribution ? `；${distribution}` : ''}；已确认变化 ${recentChanges.length} 次`,
      data: { contextId: context.contextId, nodes, changes: clone(recentChanges) },
    }
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext): void {
    void changes
    throw new Error('[geography] 只接受拥有系统校验后的历史事件输入，不接受叙事 AI 直接写入')
  }

  recordMutation(input: GeographyMutationInput): NodeGeographyRecord {
    assertWorldSpatialNode(input.contextId, input.nodeId)
    if (!Number.isInteger(input.totalDays) || input.totalDays < 0) throw new Error('地理变化时间无效')
    if (input.evidenceEventIds.length === 0) throw new Error('地理变化必须引用已发生的历史事件')
    validateEvidence(input.evidenceEventIds, input.contextId)
    const index = this.state.nodes.findIndex((node) => node.contextId === input.contextId && node.nodeId === input.nodeId)
    if (index < 0) throw new Error(`地理节点尚未初始化：${input.nodeId}`)
    const current = this.state.nodes[index]
    const next: NodeGeographyRecord = {
      ...current,
      ...(input.terrainClass ? { terrainClass: input.terrainClass } : {}),
      ...(input.displayName ? { displayName: input.displayName.trim() } : {}),
      ...(input.elevation === undefined ? {} : { elevation: input.elevation }),
      ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
      ...(input.humidity === undefined ? {} : { humidity: input.humidity }),
      ...(input.traversability === undefined ? {} : { traversability: normalizeUnitInterval(input.traversability, '地理通行度') }),
      ...(input.traitTags ? { traitTags: [...new Set(input.traitTags)] } : {}),
      ...(input.hazardTags ? { hazardTags: [...new Set(input.hazardTags)] } : {}),
      sourceEventIds: [...new Set([...current.sourceEventIds, ...input.evidenceEventIds])],
      updatedAtTotalDays: input.totalDays,
    }
    const change: GeographyChangeRecord = {
      changeId: `geography-change:${encodeURIComponent(input.contextId)}:${encodeURIComponent(input.nodeId)}:${input.totalDays}:${this.state.changes.length}`,
      contextId: input.contextId,
      nodeId: input.nodeId,
      changeType: input.terrainClass && input.terrainClass !== current.terrainClass ? 'terrain-change' : 'attribute-change',
      description: requireString(input.description, '地理变化说明'),
      occurredAtTotalDays: input.totalDays,
      evidenceEventIds: [...input.evidenceEventIds],
    }
    this.state.nodes[index] = next
    this.state.changes.push(change)
    return clone(next)
  }

  listNodes(contextId: string): NodeGeographyRecord[] {
    return clone(this.state.nodes.filter((node) => node.contextId === contextId))
  }

  getNode(contextId: string, nodeId: string): NodeGeographyRecord | undefined {
    const node = this.state.nodes.find((item) => item.contextId === contextId && item.nodeId === nodeId)
    return node ? clone(node) : undefined
  }

  capturePersistenceState(): GeographyPersistenceState {
    return validatePersistenceState(clone(this.state))
  }

  restorePersistenceState(snapshot: unknown): void {
    this.state = snapshot === undefined
      ? { schemaVersion: 1, nodes: [], changes: [] }
      : validatePersistenceState(snapshot)
  }

  capturePreviewState(): GeographyPersistenceState {
    return this.capturePersistenceState()
  }

  restorePreviewState(snapshot: unknown): void {
    this.restorePersistenceState(snapshot)
  }

  reset(): void {
    this.state = { schemaVersion: 1, nodes: [], changes: [] }
  }
}

let runtimeGeographySystem: GeographySystem | undefined

export function getGeographySystem(): GeographySystem {
  runtimeGeographySystem ??= new GeographySystem()
  return runtimeGeographySystem
}
