import type {
  EntityLifecycleState,
  LifecycleStageDefinition,
  LifespanRuleProfile,
} from '@/foundation'

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
