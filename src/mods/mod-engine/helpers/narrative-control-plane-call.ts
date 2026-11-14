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
import {
  NARRATIVE_BIRTH_PROFILE_VERSION,
  NARRATIVE_EVENT_POOL_VERSION,
  NARRATIVE_PLAN_VERSION,
} from './narrative-control-plane-input'

const CONTROL_REASONING_EFFORT = 'disabled' as const

const CALL_LABELS: Record<NarrativeControlCallKind, string> = {
  birth: '出生背景',
  plan: '人生规划',
  event: '事件卡',
  timeline: '世界时间线',
}

const SYSTEM_PROMPTS: Record<NarrativeControlCallKind, string> = {
  birth: '你是人生模拟器的出生背景生成器。依据输入世界、角色设定、开局属性点数、属性语义和已选天赋，生成结构化出生事实与可直接阅读、像电影开场一样介绍玩家人生起点的出生叙事。属性尺度固定为：-10是凡人最差下限，0是凡世凡人基准，+10是凡人正面上限；小于-10或大于+10才是超越凡人的超凡。每项开局属性同时给出点数和对应中文语义，二者必须一起决定出生条件，不能只按属性名称想象，也不能把接近0的点数写成极端家世或天赋异禀。财富点数决定家世、住房、资源、照料和支持：远低于0是匮乏，接近0是凡世常态，接近+10是凡世优渥但仍属凡人，超出+10才是超凡家势。心智、体魄、魅力同样按各自点数和语义体现在出生时已经存在的资质、身体条件和外在条件中，不提前写成出生后的表现。家世与职业随世界和财富尺度变化，不反复套用铁匠、帮工、缝补等固定职业模板。时间停在玩家出生当时：正文只介绍出生时已经存在的世界、地点、家庭、照料、住房、资源和限制，不叙述出生之后的成长、学习、日常经历或任何后续发展。已选天赋是已经确认的角色条件，效果适合时可自然呈现在家世或出生条件中，但不强行绑定。叙事采用“宏观环境 → 微观家庭处境 → 拉回宏观的开局总结”的镜头结构，三层各自成段，段与段之间使用换行分隔：先从世界、时代氛围、出生地点和周围环境建立全景，再贴近家庭、父母或照料者、住房、资源、日常条件、机会与现实限制，最后拉回全景，说明这些出生时已成立的条件如何共同构成玩家即将开始的人生起点。叙事中涉及玩家时始终使用第二人称“你/你的”，不使用玩家姓名或第三人称，不写成角色档案、字段摘要或年份报告，不以姓名、年份或年龄作为正文开头。不规划后续剧情，不补造未提供的前史，不替玩家写完整人生。',
  plan: '你是人生模拟器的宏观人生规划器。只规划当前阶段与相邻阶段入口，保持软规划，不保证结果，不改写已成立事实。',
  event: '你是人生模拟器的事件卡生成器。依据输入的世界规则包、当前人生阶段、当前年龄、心智体魄魅力财富四项属性的点数与语义、玩家意图和最近历史摘要，生成一批抽象事件卡。每张卡只给出一个抽象事件名和一个倾向：它可能在角色身上发生，也可能不发生；卡不写剧情、不写后果、不写玩法，也没有必须采用的路径。事件卡是主故事的软素材，不是已经发生的事实，也不是任务。',
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
  const promptInput = { ...input }
  delete promptInput.difficulty
  delete promptInput.difficultyGuidance
  const birthInterventionInstructions = kind === 'birth'
    ? `\n\n出生结果还必须在上述对象中增加“介入前史”字符串字段。它与“叙事背景”严格分开：“叙事背景”只写出生时已存在的事实；当“起始年龄”大于 0 时，“介入前史”写从出生后到玩家介入年龄为止的既往生活，并作为已成立的背景事实提供给命运预览和主故事。起始年龄为 0 时该字段返回空字符串。优先遵守角色背景中明确写出的既往经历、身份、关系、目标和秘密，不得遗漏、反转或与之冲突；在其未覆盖的部分，依据世界设定、年龄、属性、天赋和既有背景补足连贯的个人经历，不把未确认的未来写成事实。若角色背景明确写有穿越、觉醒或降临，应在介入前史中交代此前人生及该介入契机。正文使用第二人称“你/你的”，像可阅读的故事开篇，不写为履历摘要。`
    : ''
  const outputInstructions = kind === 'birth'
    ? `出生调用返回对象必须包含：
{"出生地点":"","家庭结构":"","照料者":"","家庭资源":"","社会处境":"","机会":[],"限制":[],"叙事背景":""}
“叙事背景”必须是可直接阅读、像电影开场的出生叙事，而不是字段摘要。时间停在玩家出生当时，正文按“宏观环境 → 微观家庭处境 → 拉回宏观的开局总结”展开，三层各自成段，段与段之间使用换行分隔：第一段建立世界、时代氛围、出生地点和周围环境；第二段具体写出生时已经在场的家庭、照料者、住房、资源、日常条件、机会与限制；最后一段回到宏观视角，说明这些出生时已成立的条件如何共同构成玩家的人生起点。不得把出生之后的成长、学习、日常生活、能力使用或后续事件写成已经发生的事实，也不得提前进入童年或以后的人生阶段。叙事介绍玩家时全程使用第二人称“你/你的”，不得出现玩家姓名、第三人称代称、角色资料报告口吻或以年份/年龄为句首坐标。只写出生当时，不写未来事件、成长路线或完整人生。结构化字段与叙事必须表达同一组事实。开局属性同时包含点数和语义，并按输入中的属性尺度理解：-10是凡人最差，0是凡世凡人基准，+10是凡人正面上限，小于-10或大于+10是超凡。家庭资源、住房、照料、社会处境、机会与限制必须同时匹配财富点数和财富语义；心智、体魄、魅力各自的点数和语义也要体现在出生时已存在的条件中。家世与职业由世界和财富尺度决定，不套用固定职业。已选天赋效果在适合的家世或出生条件中体现，不强行套用天赋。`
    : kind === 'plan'
      ? `人生规划调用只返回一个 JSON 对象，字段固定为：
{"阶段标识":"","当前阶段":"","阶段目标":"","未解决目标":[],"关系与资源变化":[],"下一阶段入口":[],"阶段转移条件":[]}
“阶段标识”使用输入 stageId 或稳定的阶段编号；“当前阶段”写玩家当前所处的人生阶段；“阶段目标”写本阶段可追求但不必保证的软目标。列表字段允许字符串或对象条目；对象必须使用可读键值，程序会把键值展开为文本。不要返回 stageSummary、currentStagePlan 等未声明字段，不要把计划写成已经发生的事实，不要预测玩家未作出的选择。阶段目标必须结合输入年龄、世界、属性、天赋、出生背景和玩家意图；下一阶段入口写相邻阶段的可能入口、触发条件和不确定性，不是承诺。`
      : kind === 'event'
      ? `事件卡调用只返回一个数组字段：
{"事件卡":[{"名称":"","正负":"正","权重":3}]}
“名称”是 2 至 8 个字符的抽象事件名，只写发生了哪一类事，例如 外敌入侵、瘟疫爆发、天降横财、决裂、恋爱、青梅竹马、破境、拜师、认错人；不写谁做的、不写过程、不写结果，不嵌具体人名、地名或组织名，不写成一句话，超过 8 个字符的句式和解释都不合格。
同一批卡不得重名，也不得用同义换名重复同一件事。
“正负”只取 正、负、双面 三者之一，表示这张卡倾向于给玩家带来好处、坏处或两可；约各占一半，不要把整批写成同一种倾向。倾向只描述可能的好处或坏处，不表示它必然发生，也不表示玩家一定受影响。
“权重”取 1 至 5 的整数，表示这张卡在本世界的常见程度，只用于本地相对取舍，不表示发生概率，不与玩家属性、人生阶段或游戏难度挂钩。
本批给出 6 至 8 张。卡必须贴当前世界规则与玩家当前人生阶段：世界里不成立的事不给卡，不设年龄门槛字段，同一阶段内整池都可用；用不上的类别可以没有卡，不设类别配额，也不必凑齐门类。
卡不是事实，也不是玩家必须完成的任务：主故事可以采用全部、采用一张或一张也不用，同一张卡在不同世界、不同人生阶段可以写成完全不同的剧情；世界是否真的发生、以什么方式发生、落在谁身上，都由主故事按因果决定。
不要输出解释、编号、写作提示或对象外文字。`
      : '输出是候选或承诺，不是玩家已经经历的事实。'
  return {
    name: `narrative-control-${kind}`,
    version: kind === 'birth'
      ? NARRATIVE_BIRTH_PROFILE_VERSION
      : kind === 'plan'
        ? NARRATIVE_PLAN_VERSION
        : kind === 'event'
          ? NARRATIVE_EVENT_POOL_VERSION
          : '1.0.0',
    mod: 'mod-engine',
    systemPrompt: `${SYSTEM_PROMPTS[kind]}${birthInterventionInstructions}

返回一个合法 JSON 对象，不添加解释或代码围栏。所有文本必须适配输入世界，不使用现实默认规则替代未知内容。${outputInstructions}`,
    userPromptTemplate: `输入：${JSON.stringify(promptInput)}`,
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
  const payload = { ...input.payload }
  delete payload.difficulty
  delete payload.difficultyGuidance
  const prompt = buildNarrativeControlPrompt(input.kind, payload)
  let response: string
  try {
    response = await callAIWithPromptTemplate(prompt, JSON.stringify(payload), {
      config: { ...input.aiConfig, model, reasoningEffort: CONTROL_REASONING_EFFORT },
      pool: 'narrative',
      sessionId: input.sessionId,
      providerId: settings.provider,
      customBaseUrl: settings.customUrl || undefined,
      customModel: model,
      apiKey: settings.customKey || undefined,
      overrideTemperature: 0,
      reasoningEffort: CONTROL_REASONING_EFFORT,
      userSegments: [JSON.stringify(payload)],
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
