/**
 * Purpose: Execute and normalize conditional narrative control-plane AI calls.
 * Owner: mod-engine
 * Responsibility: Transport and protocol decoding only; control-plane state stays with its owner.
 */

import type { AIModelConfig, PromptTemplate } from '@/foundation'
import { callAIWithPromptTemplate, isAiResponseTruncatedError, parseAIJSON } from '@/core'
import { useSettingsStore } from '@/mods/mod-settings/settings-runtime-api'
import { logger } from '@/core/logger/client-logger'
import type { NarrativeControlCallKind } from './narrative-control-plane'
import { NARRATIVE_BIRTH_PROFILE_VERSION } from './narrative-control-plane-input'

const CONTROL_REASONING_EFFORT = 'disabled' as const

const CALL_LABELS: Record<NarrativeControlCallKind, string> = {
  birth: '出生背景',
  plan: '人生规划',
  direction: '下一轮方向',
  event: '抽象事件库',
  timeline: '世界时间线',
}

const SYSTEM_PROMPTS: Record<NarrativeControlCallKind, string> = {
  birth: '你是人生模拟器的出生背景生成器。依据输入世界、角色设定、开局属性语义和已选天赋，生成结构化出生事实与一段可直接阅读、像电影开场一样介绍玩家人生起点的出生叙事。开局属性和天赋是已经确认的角色条件，必须与家庭资源、早期环境、关系、照料和可获得机会保持一致：财富语义直接反映为家庭资源与支持条件，心智、体魄和魅力语义也应在适合的成长环境与早期处境中体现；天赋效果适合时可自然呈现在家世或成长条件中，但不强行绑定。叙事采用“宏观环境 → 微观家庭处境 → 拉回宏观的开局总结”的镜头结构：先从世界、时代氛围、出生地点和周围环境建立全景，再贴近家庭、父母或照料者、住房、资源、日常条件、机会与现实限制，最后拉回全景，说明这些已成立的条件如何共同构成玩家即将开始的人生起点。叙事中涉及玩家时始终使用第二人称“你/你的”，不使用玩家姓名或第三人称，不写成角色档案、字段摘要或年份报告，不以姓名、年份或年龄作为正文开头。不规划后续剧情，不补造未提供的前史，不替玩家写完整人生。',
  plan: '你是人生模拟器的宏观人生规划器。只规划当前阶段与相邻阶段入口，保持软规划，不保证结果，不改写已成立事实。',
  direction: '你是人生模拟器的方向库生成器。生成抽象、可复用的近期发展倾向，不生成完整故事，不把方向当成必然结果。',
  event: '你是人生模拟器的抽象事件库生成器。生成适配当前世界和人生阶段的事件模式，不生成完整正文，不声明事件已经发生。',
  timeline: '你是人生模拟器的世界时间线生成器。生成有因果前提的未来世界事件承诺，只返回未来可能进入玩家视野的宏观事实。',
}

export interface NarrativeControlCallResult {
  value: unknown
  rawResponse: string
}

export function buildNarrativeControlPrompt(
  kind: NarrativeControlCallKind,
  input: Record<string, unknown>,
): PromptTemplate {
  const outputInstructions = kind === 'birth'
    ? `出生调用返回对象必须包含：
{"出生地点":"","家庭结构":"","照料者":"","家庭资源":"","社会处境":"","机会":[],"限制":[],"叙事背景":""}
“叙事背景”必须是一段连贯、可直接阅读、像电影开场的出生叙事，而不是字段摘要。正文按“宏观环境 → 微观家庭处境 → 拉回宏观的开局总结”展开：第一层建立世界、时代氛围、出生地点和周围环境；第二层具体写家庭、照料者、住房、资源、日常条件、机会与限制；最后回到宏观视角，说明这些条件如何共同构成玩家的人生起点。叙事介绍玩家时全程使用第二人称“你/你的”，不得出现玩家姓名、第三人称代称、角色资料报告口吻或以年份/年龄为句首坐标。只写出生及早期处境，不写未来事件、成长路线或完整人生。结构化字段与叙事必须表达同一组事实。开局属性语义和已选天赋是已确认条件，生成的家庭资源、早期环境、照料、关系、机会与限制必须与其一致；财富语义直接影响家庭资源，其余属性与天赋效果在适合的家世或成长条件中体现，不强行套用天赋。`
    : '输出是候选或承诺，不是玩家已经经历的事实。'
  return {
    name: `narrative-control-${kind}`,
    version: kind === 'birth' ? NARRATIVE_BIRTH_PROFILE_VERSION : '1.0.0',
    mod: 'mod-engine',
    systemPrompt: `${SYSTEM_PROMPTS[kind]}

返回一个合法 JSON 对象，不添加解释或代码围栏。所有文本必须适配输入世界，不使用现实默认规则替代未知内容。${outputInstructions}`,
    userPromptTemplate: `输入：${JSON.stringify(input)}`,
    variables: [],
    outputFormat: 'json',
  }
}

export async function executeNarrativeControlCall(input: {
  kind: NarrativeControlCallKind
  trigger: string
  payload: Record<string, unknown>
  aiConfig: AIModelConfig
  lifeRunId: string
  round: number
  sessionId?: string
}): Promise<NarrativeControlCallResult> {
  const settings = useSettingsStore.getState()
  const model = settings.customModel || input.aiConfig.model
  const prompt = buildNarrativeControlPrompt(input.kind, input.payload)
  let response: string
  try {
    response = await callAIWithPromptTemplate(prompt, JSON.stringify(input.payload), {
      config: { ...input.aiConfig, model, reasoningEffort: CONTROL_REASONING_EFFORT },
      pool: 'narrative',
      sessionId: input.sessionId,
      providerId: settings.provider,
      customBaseUrl: settings.customUrl || undefined,
      customModel: model,
      apiKey: settings.customKey || undefined,
      overrideTemperature: 0,
      reasoningEffort: CONTROL_REASONING_EFFORT,
      userSegments: [JSON.stringify(input.payload)],
      logContext: {
        lifeRunId: input.lifeRunId,
        round: input.round,
        strategy: 'S4',
        callKind: `narrative-control-${input.kind}`,
        trigger: input.trigger,
        pool: 'narrative',
        model,
        sessionId: input.sessionId,
        executionKind: 'real',
        promptVersion: prompt.version,
      },
    })
  } catch (error) {
    if (!isAiResponseTruncatedError(error) || !error.content?.trim()) throw error
    response = error.content
  }
  const value = parseAIJSON(response)
  if (value === null) throw new Error(`${CALL_LABELS[input.kind]}响应不是可解析 JSON`)
  logger.info('narrative-control-plane', 'call-accepted', {
    kind: input.kind,
    round: input.round,
    trigger: input.trigger,
  })
  return { value, rawResponse: response }
}
