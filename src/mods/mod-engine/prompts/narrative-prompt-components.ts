/**
 * @module narrative-prompt-components.ts
 * @description 浏览器侧只装配本轮动态提示；固定主叙事资产由服务端拥有。
 * @mod mod-engine
 */

import type { NarrativePromptComponent } from '../helpers/narrative-prompt-component-types'

export type NarrativePromptComponentAuditCode =
  | 'duplicate-component-content'
  | 'duplicate-component-id'
  | 'duplicate-component-title'
  | 'empty-component-content'
  | 'invalid-component-metadata'
  | 'overlapping-component-guidance'

export interface NarrativePromptComponentAuditIssue {
  code: NarrativePromptComponentAuditCode
  componentId: string
  message: string
  relatedComponentId?: string
  severity: 'error' | 'warning'
}

function compareAscii(left: string, right: string): number {
  if (left === right) return 0
  return left < right ? -1 : 1
}

function componentText(component: NarrativePromptComponent): string {
  return (Array.isArray(component.content)
    ? component.content.join('\n')
    : component.content).replace(/\r\n?/gu, '\n').trim()
}

function normalizeComparableText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\s，、：；。！？“”‘’（）()【】<>]/gu, '')
    .toLowerCase()
}

function splitGuidanceUnits(value: string): string[] {
  return value
    .split(/[\n。；！？]+/u)
    .map((part) => part.trim())
    .filter((part) => normalizeComparableText(part).length >= 12)
}

export function compareNarrativePromptComponents(
  left: NarrativePromptComponent,
  right: NarrativePromptComponent,
): number {
  return left.order - right.order || compareAscii(left.id, right.id)
}

/** 只读审计组件治理信息与文本重叠；不会修改或过滤实际 Prompt。 */
export function auditNarrativePromptComponents(
  components: readonly NarrativePromptComponent[],
): NarrativePromptComponentAuditIssue[] {
  const issues: NarrativePromptComponentAuditIssue[] = []
  const ids = new Map<string, string>()
  const titles = new Map<string, string>()
  const contents = new Map<string, string>()
  const units: Array<{ componentId: string; normalized: string }> = []

  for (const component of [...components].sort(compareNarrativePromptComponents)) {
    const idOwner = ids.get(component.id)
    if (idOwner) {
      issues.push({
        code: 'duplicate-component-id',
        componentId: component.id,
        relatedComponentId: idOwner,
        severity: 'error',
        message: `组件标识重复：${component.id}`,
      })
    } else {
      ids.set(component.id, component.id)
    }

    const titleOwner = titles.get(component.title)
    if (titleOwner) {
      issues.push({
        code: 'duplicate-component-title',
        componentId: component.id,
        relatedComponentId: titleOwner,
        severity: 'error',
        message: `组件标题重复：${component.title}`,
      })
    } else {
      titles.set(component.title, component.id)
    }

    if (
      !Number.isInteger(component.order)
      || !component.id.trim()
      || !component.title.trim()
      || !component.loadWhen.trim()
      || !component.exitWhen.trim()
      || !component.acceptanceEvidence.trim()
      || new Set(component.dependsOn).size !== component.dependsOn.length
    ) {
      issues.push({
        code: 'invalid-component-metadata',
        componentId: component.id,
        severity: 'error',
        message: `组件治理字段不完整或不确定：${component.id}`,
      })
    }

    const content = componentText(component)
    if (!content) {
      issues.push({
        code: 'empty-component-content',
        componentId: component.id,
        severity: 'warning',
        message: `组件内容为空：${component.id}`,
      })
      continue
    }

    const normalizedContent = normalizeComparableText(content)
    const contentOwner = contents.get(normalizedContent)
    if (contentOwner) {
      issues.push({
        code: 'duplicate-component-content',
        componentId: component.id,
        relatedComponentId: contentOwner,
        severity: 'warning',
        message: `组件全文与 ${contentOwner} 重复`,
      })
    } else {
      contents.set(normalizedContent, component.id)
    }

    for (const unit of splitGuidanceUnits(content)) {
      units.push({ componentId: component.id, normalized: normalizeComparableText(unit) })
    }
  }

  const overlapKeys = new Set<string>()
  for (let leftIndex = 0; leftIndex < units.length; leftIndex += 1) {
    const left = units[leftIndex]
    for (let rightIndex = leftIndex + 1; rightIndex < units.length; rightIndex += 1) {
      const right = units[rightIndex]
      if (left.componentId === right.componentId) continue
      const shorter = left.normalized.length <= right.normalized.length ? left : right
      const longer = shorter === left ? right : left
      if (shorter.normalized.length < 12 || !longer.normalized.includes(shorter.normalized)) continue
      const key = [shorter.componentId, longer.componentId, shorter.normalized].join('|')
      if (overlapKeys.has(key)) continue
      overlapKeys.add(key)
      issues.push({
        code: 'overlapping-component-guidance',
        componentId: longer.componentId,
        relatedComponentId: shorter.componentId,
        severity: 'warning',
        message: `${longer.componentId} 包含 ${shorter.componentId} 已声明的同义规则`,
      })
    }
  }

  return issues
}

/** 动态组件按权威与顺序装配为紧凑文本；组件元数据只供本地治理，不发送给 AI。 */
export function compileNarrativeDynamicComponents(
  components: readonly NarrativePromptComponent[],
): string | undefined {
  const seenIds = new Set<string>()
  const seenContent = new Set<string>()
  const parts: string[] = []
  for (const component of [...components].sort(compareNarrativePromptComponents)) {
    if (seenIds.has(component.id)) {
      throw new Error(`主叙事动态提示词组件重复：${component.id}`)
    }
    seenIds.add(component.id)
    const normalized = componentText(component)
    if (normalized && !seenContent.has(normalized)) {
      seenContent.add(normalized)
      parts.push(normalized)
    }
  }
  return parts.length > 0 ? parts.join('\n') : undefined
}
