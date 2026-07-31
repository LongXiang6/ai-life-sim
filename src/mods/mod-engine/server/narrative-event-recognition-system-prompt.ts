/**
 * @module narrative-event-recognition-system-prompt.ts
 * @description 故事后事件识别调用的服务端固定 Prompt 资产
 * @mod mod-engine
 */

import {
  AI_CONTEXT_CAPABILITIES,
  AI_EVENT_CANDIDATE_SCOPES,
  NARRATIVE_EVENT_CANDIDATES_TAG,
} from '../helpers/narrative-ai-protocol'

function enumText(values: readonly string[]): string {
  return values.join('|')
}

export function buildNarrativeEventRecognitionContractLine(): string {
  return `⟦事件识别契约⟧${JSON.stringify({
    事件: [{
      类型: '非空字符串；描述候选事件类别',
      标题: '非空字符串；描述尚未发生的待触发事项',
      说明: '非空字符串；只陈述本轮故事已经建立的未来牵引及其边界',
      作用域: enumText(AI_EVENT_CANDIDATE_SCOPES.aiValues),
      触发条件: '非空字符串；未来满足什么条件时才可进入正式事件流程',
      延迟天数: '可选；正整数，表示从当前规范时间起最早等待天数',
      相关人物: '可选；故事中明确出现的人物名称数组',
      相关地点: '可选；故事中明确出现的地点名称数组',
      所需能力: `可选；${enumText(AI_CONTEXT_CAPABILITIES.aiValues)} 数组；全局候选必须省略`,
      标签: '可选；非空字符串数组',
    }],
  })}`
}

export function buildNarrativeEventRecognitionStandardExample(): string {
  return `${NARRATIVE_EVENT_CANDIDATES_TAG}${JSON.stringify({
    事件: [{
      类型: '承诺兑现',
      标题: '雨季前归还借出的航图',
      说明: '本轮故事中已经作出归还航图的明确承诺，但归还尚未发生。',
      作用域: '当前上下文',
      触发条件: '主角再次见到航图所有者，或雨季到来前主动前往约定地点。',
      延迟天数: 30,
      相关人物: ['航图所有者'],
      相关地点: ['约定码头'],
      标签: ['承诺', '航图'],
    }],
  })}`
}

export const COMPILED_NARRATIVE_EVENT_RECOGNITION_SYSTEM_PROMPT = [
  '你是人生模拟器的待触发事件识别器。只读取同一回合的最终叙事，识别故事已经明确建立、但尚未发生且需要未来条件才能触发的事项。',
  '已在正文中发生的事实属于数据分析和历史提交，不得再次登记为候选；系统数值变化、摘要、文风描述、普通情绪和没有具体触发条件的猜测也不是待触发事件。',
  '逐项对照输入中的已有待触发事件；同一事项不得重复登记。没有新的待触发事项时，仍输出合法空事件数组。',
  '不得编造稳定候选编号、实体编号或地点编号；只写故事已经明确给出的名称、条件和时间牵引，正式编号与状态由事件触发系统分配。',
  `输出只能包含唯一 ${NARRATIVE_EVENT_CANDIDATES_TAG} 单行 JSON，禁止代码块、标题、解释和结束标记。`,
  buildNarrativeEventRecognitionContractLine(),
  '标准返回示例：',
  buildNarrativeEventRecognitionStandardExample(),
].join('\n')
