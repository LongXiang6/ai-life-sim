/**
 * Purpose: Assemble per-round dynamic narrative guidance and the active player branch projection.
 * Owner: mod-engine
 * Responsibility: Guidance components only; world/state projections and final PromptContext stay separate.
 */

import type { LuckNarrativeGuidance } from '@/foundation'
import {
  buildNarrativeHints,
  type NarrativePromptComponent,
} from '../../orchestrator-shared'
import { buildNarrativeBranchIntentProjection } from '../../helpers/branch-intent-resolution'
import { compileNarrativeDynamicComponents } from '../../prompts/narrative-prompt-components'
import type { OrchestratorSystem } from '../orchestrator-system'

function formatLuckNarrativeGuidance(guidance: LuckNarrativeGuidance): string {
  const directionText: Record<LuckNarrativeGuidance['direction'], string> = {
    bad: '坏方向：可轻微增加阻力、代价或不利巧合',
    neutral: '无干扰：不施加好运或厄运方向，按既有因果自然推进',
    good: '好方向：可轻微增加机会、转机或有利巧合',
  }
  return [
    '【低优先级运气方向】',
    directionText[guidance.direction],
    '这只是叙事倾向，不是必然结果；不得强制成功或失败，不得改写玩家选择、世界硬规则或已经成立的事实。',
  ].join('\n')
}

export function buildRoundGuidanceInputRuntime(
  orchestrator: OrchestratorSystem,
  luckNarrativeGuidance?: LuckNarrativeGuidance,
): {
  roundSystemGuidanceText?: string
  playerBranchIntent?: Record<string, unknown>
} {
  const components: NarrativePromptComponent[] = []
  let order = 10
  const addComponent = (
    id: string,
    content: string,
    kind: NarrativePromptComponent['kind'] = '流程指令',
    authority: NarrativePromptComponent['authority'] = '玩家意图',
  ) => {
    if (!content.trim()) return
    components.push({
      id,
      title: id,
      kind,
      lifecycle: '条件触发',
      authority,
      order,
      dependsOn: [],
      assemblyPosition: '本轮引导',
      loadWhen: '对应玩家、系统或生命周期触发条件成立',
      exitWhen: '触发条件不再成立',
      acceptanceEvidence: 'npm run test:narrative-protocol',
      content,
    })
    order += 10
  }

  const hints = buildNarrativeHints(orchestrator['buildHintInput']())
  if (hints.mandatory.length > 0) {
    addComponent(
      'mandatory-round-hints',
      `【本轮必须遵守】${hints.mandatory.join('。')}`,
      '硬限制',
      '当前事实',
    )
  }
  if (hints.optional.length > 0) {
    addComponent(
      'optional-round-hints',
      `【本轮参考建议】${hints.optional.join('。')}`,
      '写作规则',
      '剧情引导',
    )
  }
  if (luckNarrativeGuidance) {
    addComponent(
      'luck-narrative-guidance',
      formatLuckNarrativeGuidance(luckNarrativeGuidance),
      '写作规则',
      '剧情引导',
    )
  }

  const focusedIntent = orchestrator['getFocusedBranchIntentRuntime']()
  const freshPlayerChoice = orchestrator['lastPlayerChoice']?.trim()
  let playerBranchIntent: Record<string, unknown> | undefined
  if (focusedIntent) {
    const otherActiveIntents = orchestrator['branchIntents'].filter(
      (intent) => intent.intentId !== focusedIntent.intentId,
    )
    playerBranchIntent = buildNarrativeBranchIntentProjection(focusedIntent, otherActiveIntents)
  }
  if (freshPlayerChoice) {
    if (!focusedIntent) playerBranchIntent = { 玩家选择: freshPlayerChoice }
    orchestrator['lastCommittedPlayerChoice'] = freshPlayerChoice
    orchestrator['lastPlayerChoice'] = undefined
  }

  const roundSystemGuidanceText = compileNarrativeDynamicComponents(components)
  return {
    ...(roundSystemGuidanceText ? { roundSystemGuidanceText } : {}),
    ...(playerBranchIntent ? { playerBranchIntent } : {}),
  }
}
