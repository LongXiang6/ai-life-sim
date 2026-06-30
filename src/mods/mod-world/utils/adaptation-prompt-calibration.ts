/**
 * @module adaptation-prompt-calibration.ts
 * @description 世界创建期 adaptation Prompt 可选注入 Step 0 校准摘要
 * @mod mod-world
 */

/** 供 adaptation-* userPrompt 追加的校准块（空则返回 ''） */
export function formatAdaptationCalibrationBlock(summary: string | null | undefined): string {
  const trimmed = summary?.trim()
  if (!trimmed || trimmed === '默认校准') return ''
  return [
    '',
    '## 世界校准摘要',
    trimmed,
    '（叙事强度与上述校准一致；勿重复 W02 描述字段）',
  ].join('\n')
}

/**
 * 填充 adaptation Prompt 模板并注入校准摘要
 * @param template - userPromptTemplate 原文
 * @param vars - 模板变量（不含 worldCalibrationSummary）
 * @param summary - Step 0 formatCalibrationSummary 输出
 */
export function fillAdaptationPrompt(
  template: string,
  vars: Record<string, string>,
  summary?: string | null,
): string {
  const enriched: Record<string, string> = {
    ...vars,
    worldCalibrationSummary: formatAdaptationCalibrationBlock(summary),
  }
  let result = template
  for (const [key, value] of Object.entries(enriched)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value ?? '')
  }
  return result.replace(/\{\{#if \w+\}\}[\s\S]*?\{\{\/if\}\}/g, '')
}
