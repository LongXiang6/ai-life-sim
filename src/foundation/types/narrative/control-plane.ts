/**
 * Purpose: Define the conditional narrative control-plane contracts.
 * Owner: foundation:types
 * Responsibility: Shared shapes only; generation, selection, and persistence stay in mod-engine.
 */

export interface NarrativeBirthProfile {
  出生地点: string
  家庭结构: string
  照料者: string
  家庭资源: string
  社会处境: string
  机会: string[]
  限制: string[]
  /** 可直接阅读的出生开场，只覆盖出生与早期处境，不写未来剧情。 */
  叙事背景: string
  sourceFingerprint: string
}

export interface NarrativeLifePlan {
  阶段标识: string
  当前阶段: string
  阶段目标: string
  未解决目标: string[]
  关系与资源变化: string[]
  下一阶段入口: string[]
  阶段转移条件: string[]
  sourceFingerprint: string
}

export interface NarrativeDirectionHint {
  id: string
  方向: string
  适用条件: string
  可能推动: string
  失效条件: string
  sourceFingerprint: string
}

export interface NarrativeEventCandidate {
  id: string
  事件类型: string
  核心矛盾: string
  参与者类型: string
  适用条件: string
  可能影响: string
  不适用条件: string
  sourceFingerprint: string
}

export interface NarrativeWorldTimelineCommitment {
  id: string
  事件名称: string
  目标年龄: number
  影响范围: string
  因果前提: string
  玩家关联条件: string
  触发状态: 'scheduled' | 'due' | 'consumed' | 'invalidated'
  sourceFingerprint: string
}

export interface NarrativeControlPlaneView {
  birthProfile?: NarrativeBirthProfile
  lifePlan?: NarrativeLifePlan
  directionHints: NarrativeDirectionHint[]
  eventCandidates: NarrativeEventCandidate[]
  dueWorldEvents: NarrativeWorldTimelineCommitment[]
}
