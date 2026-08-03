/**
 * @module narrative-event-recognition-system-prompt.ts
 * @description 已发生事件元数据与未来候选识别的服务端固定 Prompt 资产
 * @mod mod-engine
 */

import {
  AI_ACTION_SCALES,
  AI_ARC_STATUSES,
  AI_ARC_TYPES,
  AI_CONTEXT_CAPABILITIES,
  AI_CREATION_CATEGORIES,
  AI_DEFERRED_CAUSAL_SEVERITIES,
  AI_DEFERRED_CAUSAL_TYPES,
  AI_DELIVERED_CAUSAL_STATUSES,
  AI_EVENT_CANDIDATE_SCOPES,
  AI_EVENT_TYPES,
  AI_FORESHADOWING_TYPES,
  AI_IMPACT_SCOPES,
  AI_IMPORTANCE_LEVELS,
  AI_INTENT_EXECUTION_MODES,
  AI_INTENT_FEASIBILITIES,
  AI_INTENT_RISK_LEVELS,
  AI_INTENT_STATUSES,
  AI_NARRATIVE_REGISTERS,
} from '../helpers/narrative-ai-protocol'

function enumText(values: readonly string[]): string {
  return values.join('|')
}

export function buildNarrativeOccurredEventContract(): Record<string, unknown> {
  return {
    摘要: '必需；一句话完整记录本轮已经成立的故事事实',
    注册事件: '{内容,重要度[0,100],涉及实体?}[]；只写本轮正文已经发生且值得进入历史账本的事件',
    长期事件: '可选；对后续人生有持续影响的已发生事实文本数组',
    原创内容: `可选；{名称,说明,类别(${enumText(AI_CREATION_CATEGORIES.aiValues)})}[]`,
    新伏笔: `可选；{类型(${enumText(AI_FORESHADOWING_TYPES.aiValues)}),说明,优先级[1,10]}[]`,
    重要程度: `可选；${enumText(AI_IMPORTANCE_LEVELS.aiValues)}`,
    情节状态: `可选；${enumText(AI_ARC_STATUSES.aiValues)}`,
    语义信号: {
      事件类型: enumText(AI_EVENT_TYPES.aiValues),
      冲突强度: '整数[0,100]',
      张力变化: '整数[-10,15]',
      行动规模: enumText(AI_ACTION_SCALES.aiValues),
      不可逆: '布尔',
      影响范围: enumText(AI_IMPACT_SCOPES.aiValues),
      叙事语域: enumText(AI_NARRATIVE_REGISTERS.aiValues),
      语域理由: '非空字符串',
      情节类型: enumText(AI_ARC_TYPES.aiValues),
      关系变化: '可选；{姓名,类型,说明}[]',
      已回收伏笔编号: '可选；输入事件相关状态中已有伏笔编号[]',
    },
    命运意图判定: {
      意图编号: '仅回合上下文提供命运意图时必需，且必须完全相同',
      可行性: enumText(AI_INTENT_FEASIBILITIES.aiValues),
      执行方式: enumText(AI_INTENT_EXECUTION_MODES.aiValues),
      状态: enumText(AI_INTENT_STATUSES.aiValues),
      风险等级: enumText(AI_INTENT_RISK_LEVELS.aiValues),
      进度: '数值[0,100]',
      阻碍: '可选；非空字符串数组',
      前置条件: '可选；非空字符串数组',
      代价: '可选；非空字符串数组',
      预计耗时: '非空字符串',
      判定理由: '非空字符串',
      下一步: '可选；非空字符串',
    },
    新延迟因果: `可选；{类型(${enumText(AI_DEFERRED_CAUSAL_TYPES.aiValues)}),严重程度(${enumText(AI_DEFERRED_CAUSAL_SEVERITIES.aiValues)}),已成立事实,相关人物?,相关势力?}[]`,
    到期因果判定: `输入“本轮已投递因果”非空时必需且逐项一一对应；{因果编号,状态(${enumText(AI_DELIVERED_CAUSAL_STATUSES.aiValues)}),判定理由,继续延迟天数?}[]；继续或未触及必须提供正整数延迟天数，已解决必须省略`,
  }
}

export function buildNarrativeFutureEventContract(): Record<string, unknown> {
  return {
    类型: '非空字符串；候选事件类别',
    标题: '非空字符串；尚未发生的待触发事项',
    说明: '非空字符串；只陈述故事已经建立的未来牵引及边界',
    作用域: enumText(AI_EVENT_CANDIDATE_SCOPES.aiValues),
    触发条件: '非空字符串；未来满足什么条件时才可进入正式事件流程',
    延迟天数: '可选；正整数，表示从当前规范时间起最早等待天数',
    相关人物: '可选；故事中明确出现的人物名称数组',
    相关地点: '可选；故事中明确出现的地点名称数组',
    所需能力: `可选；${enumText(AI_CONTEXT_CAPABILITIES.aiValues)} 数组；全局候选必须省略`,
    标签: '可选；非空字符串数组',
  }
}

export function buildNarrativeEventRecognitionContractLine(): string {
  return `⟦事件识别契约⟧${JSON.stringify({
    回合事件: buildNarrativeOccurredEventContract(),
    待触发事件: [buildNarrativeFutureEventContract()],
  })}`
}

export function buildNarrativeEventRecognitionStandardExample(): string {
  return JSON.stringify({
    回合事件: {
      摘要: '<本轮已经成立的事实摘要>',
      注册事件: [],
    },
    待触发事件: [],
  })
}

export const COMPILED_NARRATIVE_EVENT_RECOGNITION_SYSTEM_PROMPT = [
  '你是人生模拟器的事件识别器。只读取同一回合的完整事件相关状态和最近故事，同时判断本轮已经发生的可注册事件与尚未发生的未来候选；不续写、不改写故事。',
  '回合事件必须包含摘要和注册事件。注册事件只能写本轮故事已发生的具体事实；是否存在新事件由系统根据注册事件数组是否非空派生，AI 不重复输出布尔值。稳定事件 ID 由历史账本分配。',
  '长期事件、原创内容、新伏笔、重要程度、情节状态、语义信号、命运意图判定和新延迟因果都归回合事件元数据。重要程度、情节状态和语义信号必须同时提交或同时省略。',
  '“本轮已投递因果”中的稳定编号来自主叙事实际收到的因果事项。必须逐项判断故事是已解决、继续还是未触及；不得换编号，不得把同一事项重新登记为新延迟因果。继续或未触及时给出新的未来延迟天数，避免下一轮立即重复。',
  '第一次故事含命运分支时，语义核心必须如实满足高重要度、不可逆和命运或传承语域。当前存在命运意图时必须提交相同编号的判定；没有时禁止提交。',
  '待触发事件只写故事已经明确建立、但尚未发生且需要未来条件的事项。已发生事实、系统数值变化、普通情绪和无具体条件的猜测不得登记为候选。逐项对照已有候选，不得重复。',
  '输出只能是一个合法 JSON 对象，根对象只含“回合事件”与“待触发事件”。禁止代码块、标签、标题、解释和结束标记。',
  buildNarrativeEventRecognitionContractLine(),
  '中性格式示例；尖括号内容必须替换为本轮真实摘要，空数组不预设本轮是否存在事件：',
  buildNarrativeEventRecognitionStandardExample(),
].join('\n')
