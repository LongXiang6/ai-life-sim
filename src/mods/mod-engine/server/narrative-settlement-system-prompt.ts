/**
 * @module narrative-settlement-system-prompt.ts
 * @description 第二次叙事结算调用的服务端固定 Prompt 资产
 * @mod mod-engine
 */

import {
  AI_ACTION_SCALES,
  AI_ARC_STATUSES,
  AI_ARC_TYPES,
  AI_CREATION_CATEGORIES,
  AI_DEFERRED_CAUSAL_SEVERITIES,
  AI_DEFERRED_CAUSAL_TYPES,
  AI_EVENT_TYPES,
  AI_FORESHADOWING_TYPES,
  AI_IMPACT_SCOPES,
  AI_IMPORTANCE_LEVELS,
  AI_INTENT_EXECUTION_MODES,
  AI_INTENT_FEASIBILITIES,
  AI_INTENT_RISK_LEVELS,
  AI_INTENT_STATUSES,
  AI_NARRATIVE_REGISTERS,
  NARRATIVE_DATA_TAG,
} from '../helpers/narrative-ai-protocol'
import { MVP_SYSTEM_INSTRUCTION_SUBSYSTEM_IDS } from '../helpers/mvp-runtime-policy'
import { getNarrativeAISubsystemContracts } from '../helpers/subsystem-field-registry'

const TARGET_RULES: Readonly<Record<string, string>> = {
  'character-base': 'player:current',
  lifespan: 'player:current',
  luck: 'player:current',
  morality: 'player:current',
  'npc-system': '使用输入状态中已有的稳定 NPC 实体 ID；创建身份时使用已登记的 NPC 实体 ID',
  'relationship-system': '建立关系时使用起点实体 ID；调整、解除或变更作用域时使用输入状态中的关系 ID',
}

function enumText(values: readonly string[]): string {
  return values.join('|')
}

/** 每个系统一行；字段和操作始终从运行时字段注册契约派生。 */
export function buildNarrativeSettlementSystemContractLines(): string[] {
  return getNarrativeAISubsystemContracts(MVP_SYSTEM_INSTRUCTION_SUBSYSTEM_IDS).map((contract) => {
    const operations = Object.fromEntries(
      Object.entries(contract.operations).map(([internalOperation, aiOperation]) => [
        aiOperation,
        contract.operationFields[internalOperation]
          ?? Object.keys(contract.fields),
      ]),
    )
    const fields = Object.fromEntries(
      Object.values(contract.fields).map((field) => [field.aiName, field.description]),
    )
    return `⟦可写系统:${contract.aiName}⟧${JSON.stringify({
      系统: contract.aiName,
      目标对象: TARGET_RULES[contract.internalId],
      操作与变更字段: operations,
      字段规则: fields,
    })}`
  })
}

export function buildNarrativeSettlementDataContractLine(): string {
  return `⟦数据契约⟧${JSON.stringify({
    摘要: '必需；一句话记录本轮已经成立的事实',
    长期事件: '可选；非空字符串数组',
    原创内容: `可选；{名称,说明,类别(${enumText(AI_CREATION_CATEGORIES.aiValues)})}[]`,
    新伏笔: `可选；{类型(${enumText(AI_FORESHADOWING_TYPES.aiValues)}),说明,优先级[1,10]}[]`,
    重要程度: `可选；${enumText(AI_IMPORTANCE_LEVELS.aiValues)}`,
    关键事件: '可选；{内容,重要度[0,100],涉及实体?}[]',
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
      已回收伏笔编号: '可选；输入中已有的伏笔编号[]',
    },
    命运意图判定: {
      意图编号: '仅当前输入提供命运意图时必需，且必须完全相同',
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
  })}`
}

export function buildNarrativeSettlementStandardExample(): string {
  return [
    `⟦系统1⟧${JSON.stringify({
      系统: '基础属性',
      目标对象: 'player:current',
      目标上下文: 'context:world-a',
      操作: '增量',
      说明: '救援后体魄提升',
      变更: { 体魄变化: 1 },
      依据事件: ['event:accepted-123'],
    })}`,
    `⟦系统2⟧${JSON.stringify({
      系统: '通用关系系统',
      目标对象: 'relationship:abc',
      目标上下文: 'context:world-a',
      操作: '调整',
      说明: '救援后信任上升',
      变更: { 好感变化: 1, 信任变化: 2 },
      依据事件: ['event:accepted-123'],
    })}`,
    `${NARRATIVE_DATA_TAG}${JSON.stringify({
      摘要: '救援改变了逃离路线并提升了双方信任',
      重要程度: '高',
      情节状态: '进行中',
      语义信号: {
        事件类型: '关系',
        冲突强度: 20,
        张力变化: 3,
        行动规模: '中',
        不可逆: true,
        影响范围: '关系圈',
        叙事语域: '命运',
        语域理由: '救援与共同逃离改变了双方的长期关系和路线',
        情节类型: '关系',
        关系变化: [{ 姓名: '阿禾', 类型: '结盟', 说明: '救援建立了更高的信任' }],
      },
    })}`,
  ].join('\n\n')
}

export const COMPILED_NARRATIVE_SETTLEMENT_SYSTEM_PROMPT = [
  '你是人生模拟器的回合结算引擎。只根据输入中的同一回合系统状态、稳定引用和最终叙事，提出本轮已经成立的源变化与机器数据；不续写、不改写故事。',
  '输出零至多个连续编号的 ⟦系统N⟧ 单行 JSON，最后输出唯一 ⟦数据⟧ 单行 JSON；每个分段之间空一行，禁止代码块、标题、解释和结束标记。',
  '每个系统段只含一条操作，且对象键固定为系统、目标对象、目标上下文、操作、说明、变更、依据事件；同一系统多次操作也必须拆成多个连续编号段。',
  '只可提交输入中实际出现的可写系统及稳定目标；目标上下文必须等于本轮上下文。没有变化的系统省略整段，不输出零变化、空字符串、null 或全量当前状态；只有通用关系系统的解除操作使用空变更对象。',
  '数值必须是 JSON 数字，布尔必须是 JSON 布尔；不得使用带单位字符串、近义键、英文协议键或额外字段。任一分段不合法都会使整轮回滚。',
  '依据事件只能使用回合上下文明确提供的可引用事件 ID；没有依据事件时使用空数组，不得为本轮正文自造稳定事件 ID。',
  '数据段必须包含摘要，且不得包含系统操作或玩家分支。重要程度、情节状态和语义信号必须同时提交或同时省略；第一次响应含玩家分支或当前存在命运意图时必须提交完整语义核心。',
  '命运意图判定只记录最终叙事已经写成的执行结果；不得重新裁决玩家方向、续写未发生结果，或让结构化状态超前于正文事实。',
  '第一次响应含玩家分支时，语义必须如实满足高重要度、不可逆及命运或传承语域；当前存在命运意图时必须提交相同意图编号的判定，没有命运意图时禁止提交该字段。',
  ...buildNarrativeSettlementSystemContractLines(),
  buildNarrativeSettlementDataContractLine(),
  '标准返回示例：',
  buildNarrativeSettlementStandardExample(),
].join('\n')
