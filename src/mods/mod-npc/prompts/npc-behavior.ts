/**
 * @module npc-behavior.ts
 * @description NPC 行为生成的 AI Prompt 模板（仅在关键 NPC 重要事件时使用）
 * @mod mod-npc
 *
 * 设计原则（来自蓝图风险提示）：
 *   NPC 行为主要依赖本地规则推演，仅在关键事件时调用 AI。
 *   N 个 NPC × 每次行为决策需要 AI 调用 → Token 开销翻倍。
 *   因此 Prompt 仅对 isKeyNPC=true 的 NPC 在重要节点（初次相遇/决斗/背叛）触发。
 */

import { z } from 'zod'

import type { PromptTemplate } from '@/foundation'

export const npcBehaviorOutputSchema = z.object({
  behaviorType: z.enum(['social', 'trade', 'combat', 'move', 'train', 'work']),
  narrative: z.string().min(1),
  targetId: z.string().nullable(),
  consequence: z.string(),
  relationChange: z.coerce.number().min(-10).max(10),
})

export type NpcBehaviorOutput = z.infer<typeof npcBehaviorOutputSchema>

export const npcBehaviorPrompt: PromptTemplate<NpcBehaviorOutput> = {
  name: 'npc-behavior',
  version: '1.1.0',
  mod: 'mod-npc',
  systemPrompt: `你是一个 NPC 行为生成器。根据下方提供的 NPC 状态、性格、记忆和与角色的关系，生成一段简洁的行为叙事。

## 规则
- 行为必须符合 NPC 的性格和当前状态
- 考虑 NPC 对目标角色的好感度和过往记忆
- 行为叙事应凝练但完整，保留动机、动作、对象与直接后果，不得为了字数删掉语义
- 输出格式严格按照 JSON

## 行为类型说明
- trade: NPC 主动发起交易
- combat: NPC 主动攻击/挑衅
- social: NPC 主动社交/对话
- move: NPC 移动到新地点
- train: NPC 在修炼/学习
- work: NPC 在工作/生产`,
  userPromptTemplate: `## NPC 信息
名称：{npcName}
性别：{npcGender}
年龄：{npcAge}
性格标签：{npcTraits}
属性：{npcAttributes}

## 目标角色
名称：{targetName}
与 NPC 关系：{relationToTarget}

## 近期记忆
{recentMemories}

## 当前情境
{context}

请输出 JSON 格式：
{
  "behaviorType": "social|trade|combat|move|train|work",
  "narrative": "行为叙事文本",
  "targetId": "目标角色ID（若无则为 null）",
  "consequence": "行为可能的结果简述",
  "relationChange": -10 到 10 的数字，表示好感度变化
}`,
  variables: [
    'npcName',
    'npcGender',
    'npcAge',
    'npcTraits',
    'npcAttributes',
    'targetName',
    'relationToTarget',
    'recentMemories',
    'context',
  ],
  outputFormat: 'json',
  outputSchema: npcBehaviorOutputSchema,
}

export const SYSTEM_PROMPT = npcBehaviorPrompt.systemPrompt
