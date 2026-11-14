/**
 * Purpose: Normalize conditional narrative AI results into reusable control-plane records.
 * Owner: mod-engine
 * Responsibility: Shape and default auxiliary results without committing player facts.
 */

import type {
  NarrativeBirthProfile,
  NarrativeEventCard,
  NarrativeLifePlan,
  NarrativeWorldTimelineCommitment,
} from '@/foundation'

const EVENT_CARD_NAME_MIN = 2
const EVENT_CARD_NAME_MAX = 8
const EVENT_CARD_POLARITIES: readonly NarrativeEventCard['正负'][] = ['正', '负', '双面']

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function stableText(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    return value.map(stableText).filter(Boolean).join('；')
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => {
        const itemText = stableText(item)
        return itemText ? `${key}：${itemText}` : ''
      })
      .filter(Boolean)
      .join('；')
  }
  return ''
}

function textList(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value]
  return values.map(stableText).filter(Boolean)
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function canonicalText(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase()
}

function boundedWeight(value: unknown): number {
  const numeric = Number(value)
  return Number.isSafeInteger(numeric) ? Math.min(5, Math.max(1, numeric)) : 3
}

export function normalizeBirthProfile(
  value: unknown,
  sourceFingerprint: string,
  startingAge = 0,
): NarrativeBirthProfile {
  const source = record(value)
  const narrative = text(source.叙事背景)
  if (!narrative) throw new Error('出生背景响应缺少出生叙事')
  const interventionHistory = text(source.介入前史)
  if (startingAge > 0 && !interventionHistory) {
    throw new Error('非零年龄开局的出生背景响应缺少介入前史')
  }
  return {
    出生地点: text(source.出生地点) || '未明确的出生地',
    家庭结构: text(source.家庭结构) || '由当前世界规则决定的家庭结构',
    照料者: text(source.照料者) || '存在能够直接影响玩家早期处境的照料者',
    家庭资源: text(source.家庭资源) || '资源状况尚待人生经历进一步确认',
    社会处境: text(source.社会处境) || '处于当前世界可成立的普通社会位置',
    机会: textList(source.机会),
    限制: textList(source.限制),
    叙事背景: narrative,
    ...(startingAge > 0 ? { 介入前史: interventionHistory } : {}),
    sourceFingerprint,
  }
}

export function normalizeLifePlan(
  value: unknown,
  sourceFingerprint: string,
): NarrativeLifePlan {
  const source = record(value)
  const stageId = text(source.阶段标识)
  const currentStage = text(source.当前阶段)
  // 阶段目标可能是单个字符串，也可能是分条数组；与列表字段同一套可读文本展开。
  const stageGoal = stableText(source.阶段目标)
  if (!stageId || !currentStage || !stageGoal) {
    throw new Error('人生规划响应缺少阶段标识、当前阶段或阶段目标')
  }
  return {
    阶段标识: stageId,
    当前阶段: currentStage,
    阶段目标: stageGoal,
    未解决目标: textList(source.未解决目标),
    关系与资源变化: textList(source.关系与资源变化),
    下一阶段入口: textList(source.下一阶段入口),
    阶段转移条件: textList(source.阶段转移条件),
    sourceFingerprint,
  }
}

export function normalizeEventCards(
  value: unknown,
  sourceFingerprint: string,
): NarrativeEventCard[] {
  const source = record(value)
  const rawList = Array.isArray(value)
    ? value
    : Array.isArray(source.事件卡)
      ? source.事件卡 as unknown[]
      : []
  const seenIds = new Set<string>()
  const seenNames = new Set<string>()
  return rawList.flatMap((item, index) => {
    const card = record(item)
    const name = text(card.名称)
    const nameLength = Array.from(name).length
    const polarity = text(card.正负)
    if (
      nameLength < EVENT_CARD_NAME_MIN
      || nameLength > EVENT_CARD_NAME_MAX
      || !(EVENT_CARD_POLARITIES as readonly string[]).includes(polarity)
    ) return []
    const nameKey = canonicalText(name)
    const id = text(card.id) || `event-card:${sourceFingerprint}:${index + 1}`
    if (seenNames.has(nameKey) || seenIds.has(id)) return []
    seenNames.add(nameKey)
    seenIds.add(id)
    return [{
      id,
      名称: name,
      正负: polarity as NarrativeEventCard['正负'],
      权重: boundedWeight(card.权重),
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
