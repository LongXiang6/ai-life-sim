/**
 * @module adaptation-anomaly-phenomena-prompt.ts
 * @description 异常区域 AI 适配 Prompt —— 异象叙事描述
 * @mod mod-power-system
 */

import { z } from 'zod'

import type { PromptTemplate } from '@/foundation'

/** 异常区域适配输出 Schema */
export const anomalyPhenomenaOutputSchema = z.object({
  narrativeHint: z.string().describe('异常区域相关的叙事提示'),
})

/**
 * 异常区域适配 Prompt
 * 根据异常区域状态和世界观，生成符合世界观的异象叙事描述
 */
export const adaptationAnomalyPhenomenaPrompt: PromptTemplate = {
  name: 'adaptation-anomaly-phenomena',
  version: '1.1.0',
  mod: 'mod-power-system',
  systemPrompt: `你是异常区域适配 AI。根据异常区域状态和世界观，生成符合世界观的异象叙事描述。

## 适配规则
1. 异常区域描述必须符合世界观风格：
   - 仙侠：灵气秘境、禁地、阵法遗迹、灵脉交汇处
   - 武侠：武林禁地、毒谷、机关城、古墓
   - 科幻：辐射区、时空异常区、信号黑洞、AI禁区
   - 奇幻：魔法污染源、诅咒之地、元素风暴、虚空裂隙
   - 现代：自然灾害区、隔离区、未解之谜地点
   - 末日：辐射废墟、变异巢穴、黑暗区域
   - 神话：神域遗迹、神力残留区、命运交汇点
2. 异常区域应体现危险与机遇并存
3. 叙事应营造神秘感和探索欲
4. 可包含环境异常现象、潜在危险、可能收获
5. narrativeHint 是一段 50-100 字的异象描述，使用第二人称，营造神秘感

## 输出格式
\`\`\`json
{
  "narrativeHint": "异象叙事描述",
}
\`\`\``,
  userPromptTemplate: `## 世界观信息
- 世界观标签：{{worldview}}
- 世界异常等级：{{anomalyLevel}}

## 异常区域状态
- 区域名称：{{anomalyName}}
- 异常类型：{{anomalyType}}
- 异常强度：{{anomalyIntensity}}
- 环境特征：{{environmentFeature}}
- 潜在危险：{{potentialDanger}}
- 可能收获：{{potentialReward}}

请根据以上信息生成适配后的异常区域叙事提示。
{{worldCalibrationSummary}}`,
  variables: ['worldview', 'anomalyLevel', 'anomalyName', 'anomalyType', 'anomalyIntensity', 'environmentFeature', 'potentialDanger', 'potentialReward', 'worldCalibrationSummary'],
  outputFormat: 'json',
  outputSchema: anomalyPhenomenaOutputSchema,
}
