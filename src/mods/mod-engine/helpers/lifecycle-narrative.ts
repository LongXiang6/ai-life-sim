import type {
  EntityLifecycleState,
  LifecycleNarrativeArchetype,
  LifecycleStageDefinition,
  LifespanRuleProfile,
} from '@/foundation'

const ARCHETYPE_LABELS: Record<LifecycleNarrativeArchetype, string> = {
  routine: '日常：描写一段有具体行动和反馈的生活片段',
  danger: '危机：面对真实威胁，并以符合当前能力的方式应对',
  opportunity: '机遇：出现有代价、有条件的成长或改变机会',
  social: '社交：推进人物关系、身份位置或群体互动',
  exploration: '探索：接触新的地点、规则、知识或未知对象',
  rumor: '传闻：通过可追溯的信息体现更大世界的变化',
  mystery: '谜团：建立可信线索与后续因果，不立即强行解答',
}

function selectArchetype(
  allowed: readonly LifecycleNarrativeArchetype[],
  difficulty: string,
  consecutiveConflictRounds: number,
): LifecycleNarrativeArchetype | undefined {
  if (allowed.length === 0) return undefined
  const dangerMultiplier = { normal: 1, hard: 2.5, nightmare: 4, hell: 8 }[difficulty] ?? 1
  const dangerWeight = Math.min(Math.round(3 * dangerMultiplier), 25)
  const weights: Record<LifecycleNarrativeArchetype, number> = {
    routine: 55 - Math.max(0, dangerWeight - 3),
    danger: consecutiveConflictRounds >= 5 ? 0 : dangerWeight,
    opportunity: 7,
    social: 15,
    exploration: 6,
    rumor: 7,
    mystery: 7,
  }
  const candidates = allowed.map((type) => ({ type, weight: Math.max(0, weights[type]) }))
  const total = candidates.reduce((sum, item) => sum + item.weight, 0)
  if (total <= 0) return allowed.includes('routine') ? 'routine' : allowed[0]
  let cursor = Math.random() * total
  for (const candidate of candidates) {
    cursor -= candidate.weight
    if (cursor < 0) return candidate.type
  }
  return candidates[candidates.length - 1]?.type
}

export function buildLifecycleNarrativeHint(
  entity: EntityLifecycleState | undefined,
  currentStage: LifecycleStageDefinition | undefined,
): string {
  if (!entity || !currentStage) return ''
  const ageYears = Math.floor(entity.ageDays / 365)
  return [
    '【生命周期约束】',
    `当前 ${ageYears} 岁 · ${currentStage.displayName}：${currentStage.description}`,
    `生命活力/学习/社交系数：${currentStage.coefficients.vitality}/${currentStage.coefficients.learning}/${currentStage.coefficients.social}`,
    '场景、行为能力、认知和对话复杂度必须符合当前阶段事实。',
  ].join('\n')
}

export function generateLifecycleArchetypeHint(
  currentStage: LifecycleStageDefinition | undefined,
  difficulty = 'normal',
  consecutiveConflictRounds = 0,
): string {
  if (!currentStage) return ''
  const archetype = selectArchetype(
    currentStage.allowedArchetypes,
    difficulty,
    consecutiveConflictRounds,
  )
  return archetype ? `【叙事引导】本回合参考方向：${ARCHETYPE_LABELS[archetype]}。` : ''
}

export function buildLifecycleLifespanReminder(
  profile: LifespanRuleProfile | undefined,
  entity: EntityLifecycleState | undefined,
): string {
  if (!profile || !entity) return ''
  const currentAgeYears = Math.floor(entity.ageDays / 365)
  if (profile.clockMode === 'ageless') {
    return `【生物钟】${profile.displayName}为恒常生命；当前纪年年龄 ${currentAgeYears} 岁，不得因时间流逝自动衰老或老死。`
  }
  if (profile.clockMode === 'cyclic') {
    return `【生物钟】${profile.displayName}按生命循环转换阶段；当前纪年年龄 ${currentAgeYears} 岁，不得把单次循环结束写成自然老死。`
  }
  if (profile.clockMode === 'external') {
    return `【生物钟】${profile.displayName}由外部规则维持，年龄不随规范时间自动增长；只有已确认的外部变化才能改变生命状态。`
  }
  const ratio = entity.ageDays / profile.maximumLifespanDays
  const maximumYears = Math.round(profile.maximumLifespanDays / 365)
  if (ratio >= 0.78) {
    return `【寿命边界】当前 ${currentAgeYears} 岁，规范寿命上限约 ${maximumYears} 岁；衰老事实由生命周期和健康状态决定，死亡必须形成已提交历史事件。`
  }
  if (ratio <= 0.12) {
    return `【寿命边界】当前 ${currentAgeYears} 岁，规范寿命上限约 ${maximumYears} 岁；不得仅以年龄为由触发死亡。`
  }
  return ''
}
