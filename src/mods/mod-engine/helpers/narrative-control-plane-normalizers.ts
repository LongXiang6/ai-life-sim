/**
 * Purpose: Normalize conditional narrative AI results into reusable control-plane records.
 * Owner: mod-engine
 * Responsibility: Shape and default auxiliary results without committing player facts.
 */

import type {
  NarrativeBirthProfile,
  NarrativeDirectionHint,
  NarrativeEventCandidate,
  NarrativeLifePlan,
  NarrativeWorldTimelineCommitment,
} from '@/foundation'

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function textList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map(text).filter(Boolean)
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export function normalizeBirthProfile(
  value: unknown,
  sourceFingerprint: string,
): NarrativeBirthProfile {
  const source = record(value)
  const narrative = text(source.叙事背景)
  if (!narrative) throw new Error('出生背景响应缺少出生叙事')
  return {
    出生地点: text(source.出生地点) || '未明确的出生地',
    家庭结构: text(source.家庭结构) || '由当前世界规则决定的家庭结构',
    照料者: text(source.照料者) || '存在能够直接影响玩家早期处境的照料者',
    家庭资源: text(source.家庭资源) || '资源状况尚待人生经历进一步确认',
    社会处境: text(source.社会处境) || '处于当前世界可成立的普通社会位置',
    机会: textList(source.机会),
    限制: textList(source.限制),
    叙事背景: narrative,
    sourceFingerprint,
  }
}

export function normalizeLifePlan(
  value: unknown,
  sourceFingerprint: string,
): NarrativeLifePlan {
  const source = record(value)
  return {
    阶段标识: text(source.阶段标识) || '当前阶段',
    当前阶段: text(source.当前阶段) || '当前人生阶段',
    阶段目标: text(source.阶段目标) || '在当前条件下形成新的生活位置',
    未解决目标: textList(source.未解决目标),
    关系与资源变化: textList(source.关系与资源变化),
    下一阶段入口: textList(source.下一阶段入口),
    阶段转移条件: textList(source.阶段转移条件),
    sourceFingerprint,
  }
}

export function normalizeDirections(
  value: unknown,
  sourceFingerprint: string,
): NarrativeDirectionHint[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item, index) => {
    const source = record(item)
    const direction = text(source.方向)
    if (!direction) return []
    return [{
      id: text(source.id) || `direction:${sourceFingerprint}:${index + 1}`,
      方向: direction,
      适用条件: text(source.适用条件) || '适合当前阶段与角色条件',
      可能推动: text(source.可能推动) || '推动玩家形成新的行动、关系或位置变化',
      失效条件: text(source.失效条件) || '当前阶段、玩家意图或世界条件改变',
      sourceFingerprint,
    }]
  })
}

export function normalizeEvents(
  value: unknown,
  sourceFingerprint: string,
): NarrativeEventCandidate[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item, index) => {
    const source = record(item)
    const eventType = text(source.事件类型)
    if (!eventType) return []
    return [{
      id: text(source.id) || `event:${sourceFingerprint}:${index + 1}`,
      事件类型: eventType,
      核心矛盾: text(source.核心矛盾) || '当前条件下出现需要玩家参与的现实矛盾',
      参与者类型: text(source.参与者类型) || '与玩家处境直接相关的行动者',
      适用条件: text(source.适用条件) || '适合当前世界、阶段和玩家状态',
      可能影响: text(source.可能影响) || '关系、资源、能力或社会位置',
      不适用条件: text(source.不适用条件) || '与已成立事实或玩家明确意图冲突',
      sourceFingerprint,
    }]
  })
}

export function normalizeTimeline(
  value: unknown,
  sourceFingerprint: string,
): NarrativeWorldTimelineCommitment[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item, index) => {
    const source = record(item)
    const eventName = text(source.事件名称)
    const targetAge = Number(source.目标年龄)
    if (!eventName || !Number.isSafeInteger(targetAge) || targetAge < 0) return []
    return [{
      id: text(source.id) || `timeline:${sourceFingerprint}:${index + 1}`,
      事件名称: eventName,
      目标年龄: targetAge,
      影响范围: text(source.影响范围) || '当前世界范围',
      因果前提: text(source.因果前提) || '由当前世界规则与相关者行动逐步形成',
      玩家关联条件: text(source.玩家关联条件) || '仅在玩家所在范围或关系受到影响时进入正文',
      触发状态: 'scheduled' as const,
      sourceFingerprint,
    }]
  })
}
