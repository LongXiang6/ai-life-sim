/**
 * Purpose: Assemble the main-narrative data-layer payload.
 * Owner: core:ai-service
 * Responsibility: Preserve the five fields from D:/AI/docs/数据层示例.txt.
 */

import type { PromptContext, PromptTemplate } from '@/foundation'

export type PromptSegmentStrategy = 'S4'

export interface PromptSegments {
  stablePrefixChars: number
  full: string
  globalSegmentChars: number
  userSegments: string[]
  userMessageCount: number
  strategy: PromptSegmentStrategy
  memorySegmentChars: number
  roundSegmentChars: number
  totalChars: number
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() || undefined : undefined
}

function formatNarrativeAddressing(value: PromptContext['narrativeAddressing']): string {
  switch (value) {
    case 'first-person':
      return '第一人称（用“我/我的”）'
    case 'character-name':
      return '角色姓名（用主角姓名称呼）'
    case 'second-person':
    default:
      return '第二人称（用“你/你的”）'
  }
}

function integerString(value: unknown): string | undefined {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? String(Math.trunc(numeric)) : undefined
}

function buildNarrativeAttributes(value: unknown): Record<'心智' | '体魄' | '魅力' | '财富', string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { 心智: '0', 体魄: '0', 魅力: '0', 财富: '0' }
  }
  const source = value as Record<string, unknown>
  const numericSet = source.当前数值 && typeof source.当前数值 === 'object' && !Array.isArray(source.当前数值)
    ? source.当前数值 as Record<string, unknown>
    : source
  return {
    心智: integerString(numericSet.mind ?? numericSet.心智) ?? '0',
    体魄: integerString(numericSet.physique ?? numericSet.体魄) ?? '0',
    魅力: integerString(numericSet.charisma ?? numericSet.魅力) ?? '0',
    财富: integerString(numericSet.familyBackground ?? numericSet.财富) ?? '0',
  }
}

function buildHistoricalEvents(context: PromptContext): string[] {
  const timeline = (context.timelineMemory ?? [])
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim())
  const recent = (context.recentStories ?? [])
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim())
  return [...timeline, ...recent]
}

function buildNarrativeWindowProjection(context: PromptContext): string {
  return nonEmpty(context.narrativeTimeWindow) ?? '本轮采用日历时间尺度。'
}

function buildControlPlaneProjection(context: PromptContext): Record<string, unknown> | undefined {
  const controlPlane = context.controlPlane
  if (!controlPlane) return undefined
  const stripInternalMetadata = (value: object): Record<string, unknown> => {
    const source = value as Record<string, unknown>
    const { id: _id, sourceFingerprint: _sourceFingerprint, ...publicValue } = source
    return publicValue
  }
  const stripTimelineMetadata = (value: object): Record<string, unknown> => {
    const source = value as Record<string, unknown>
    const {
      id: _id,
      sourceFingerprint: _sourceFingerprint,
      触发状态: _status,
      ...publicValue
    } = source
    return publicValue
  }
  // 事件卡池只投影名称：正负、权重、合龄与指纹留在本地校验与消费扣除，不进模型输入。
  const eventCards = controlPlane.eventCards
    .map((card) => nonEmpty(card.名称))
    .filter((name): name is string => Boolean(name))
  const difficultyGuidance = nonEmpty(controlPlane.difficultyGuidance)
  return {
    ...(controlPlane.birthProfile ? { 出生背景: stripInternalMetadata(controlPlane.birthProfile) } : {}),
    ...(controlPlane.lifePlan ? { 人生规划: stripInternalMetadata(controlPlane.lifePlan) } : {}),
    ...(controlPlane.dramaticBiasLabel
      ? { 命运转折调性: controlPlane.dramaticBiasLabel }
      : {}),
    ...(difficultyGuidance ? { 难度指引: difficultyGuidance } : {}),
    ...(eventCards.length > 0
      ? { 事件卡池: eventCards }
      : {}),
    ...(controlPlane.dueWorldEvents.length > 0
      ? { 到期世界事实: controlPlane.dueWorldEvents.map(stripTimelineMetadata) }
      : {}),
  }
}

function buildWorldDescription(context: PromptContext, description: unknown): string {
  const baseDescription = nonEmpty(description) ?? ''
  const stateSummaries = (context.subsystemSummaries ?? [])
    .map((summary) => nonEmpty(summary))
    .filter((summary): summary is string => Boolean(summary))
  if (stateSummaries.length === 0) return baseDescription
  return [
    baseDescription,
    '当前世界状态（只读事实，不是本轮题目）：',
    ...stateSummaries,
  ].filter(Boolean).join('\n')
}

/** PromptContext 转为数据层示例声明的五元素数组。 */
export function buildNarrativeUserJson(context: PromptContext): unknown {
  const rawWorld = context.worldNarrativeView
  const world = {
    名称: nonEmpty(rawWorld.名称) ?? '',
    描述: buildWorldDescription(context, rawWorld.描述),
  }
  const rawCharacter = context.characterProfileView
  const rawBaseAttributes = rawCharacter.基础属性 && typeof rawCharacter.基础属性 === 'object'
    && !Array.isArray(rawCharacter.基础属性)
    ? rawCharacter.基础属性 as Record<string, unknown>
    : {}
  const currentAge = context.characterStatusView.年龄
  const character = {
    姓名: nonEmpty(rawCharacter.姓名) ?? '',
    性别: nonEmpty(rawCharacter.性别) ?? '未设定',
    种族: nonEmpty(rawCharacter.种族) ?? '未设定',
    背景: nonEmpty(rawCharacter.背景) ?? '',
    属性尺度: '-10为凡人最差下限，0为凡世凡人基准，+10为凡人正面上限；超出±10才属于超凡',
    当前属性语义: rawBaseAttributes.当前状态 ?? {},
    天赋技能: (context.talents ?? []).map((talent) => ({
      ...(talent.引用 ? { 引用: talent.引用 } : {}),
      名称: talent.名称,
      资质阶位: talent.资质阶位,
      开发阶段: talent.开发阶段,
      ...(Number.isSafeInteger(talent.至高强化阶数) ? { 至高强化阶数: talent.至高强化阶数 } : {}),
      效果: talent.效果,
    })),
  }
  const historicalEvents = buildHistoricalEvents(context)
  const currentAgeNumeric = Number(currentAge)
  const currentAgeValue = Number.isFinite(currentAgeNumeric) ? Math.max(0, Math.floor(currentAgeNumeric)) : 0
  const branch = nonEmpty(context.playerBranchIntent?.命运分支) ?? ''
  const controlPlane = buildControlPlaneProjection(context)
  return [
    { 世界: world },
    { 玩家信息: character },
    { 历史输出: { 事件: historicalEvents } },
    {
      玩家本次点属性: buildNarrativeAttributes(
        context.characterStatusView.属性数值 ?? rawCharacter.基础属性,
      ),
    },
    {
      本次信息: {
        时间节点: `当前年龄=${currentAgeValue}；内部阶段索引=${currentAgeValue}；只用于合龄裁决，不转写为正文`,
        时间窗口: buildNarrativeWindowProjection(context),
        ...(Number.isFinite(context.characterStatusView.自然寿命参考年龄)
          ? { 自然寿命参考年龄: Math.max(1, Math.trunc(Number(context.characterStatusView.自然寿命参考年龄))) }
          : {}),
        ...(Number.isSafeInteger(context.narrativeBatchSize) && (context.narrativeBatchSize ?? 0) > 1
          ? { 批量输出: `请在同一次调用中按顺序生成最多${context.narrativeBatchSize}轮故事；第一项对应本轮，其余项作为后续轮次缓存；每项独立覆盖各自时间跨度，允许自然跳时，只承接已成立事实。遇到命运分支、结局或人生阶段结束时，该轮即本批最后一项，不再生成其后的回合；不足${context.narrativeBatchSize}轮是正常结果。` }
          : {}),
        命运分支: branch,
        篇幅偏好: nonEmpty(context.wordCountInstruction) ?? '',
        叙事称呼: formatNarrativeAddressing(context.narrativeAddressing),
        文风偏好: nonEmpty(context.narrativeStyle) ?? '',
        ...(controlPlane ? { 控制平面: controlPlane } : {}),
      },
    },
  ]
}

/** 输出单条数据层消息；服务端受保护资产将其填入 prompt.txt。 */
export function buildSegmentedPrompt(
  _template: PromptTemplate,
  context: PromptContext,
): PromptSegments {
  const input = buildNarrativeUserJson(context)
  const dataLayerSegment = JSON.stringify(input)
  const segments = [dataLayerSegment]

  return {
    stablePrefixChars: dataLayerSegment.length,
    full: segments.join('\n'),
    globalSegmentChars: dataLayerSegment.length,
    userSegments: segments,
    userMessageCount: segments.length,
    strategy: 'S4',
    memorySegmentChars: dataLayerSegment.length,
    roundSegmentChars: dataLayerSegment.length,
    totalChars: dataLayerSegment.length,
  }
}
