/**
 * Purpose: Format equipped mythic and destiny patterns for main-narrative prompt fields.
 * Owner: mod-engine
 * Responsibility: Talent text projection only; pattern ownership and prompt assembly remain separate.
 */

export function formatEquippedMythicPatternForPrompt(patterns: readonly {
  name: string
  concept: string
  effect: string
}[] | null | undefined): string | undefined {
  const rules = (patterns ?? []).flatMap((pattern) => {
    const effect = pattern.effect.trim()
    if (!effect) return []
    const name = pattern.name.trim() || '未命名轮回天赋'
    const concept = pattern.concept.trim()
    return [`${name}${concept ? `（${concept}）` : ''}：${effect}`]
  })
  return rules.length > 0 ? `【轮回天赋】${rules.join('\n')}` : undefined
}

export function formatDestinyPatternsForPrompt(
  patterns: readonly { name: string; description: string; effect: string }[],
  includeDescription: boolean,
): string | undefined {
  const rows = patterns.flatMap((pattern) => {
    const name = pattern.name.trim()
    const effect = pattern.effect.trim()
    const description = pattern.description.trim()
    const rule = effect || description
    if (!name || !rule) return []
    const openingDetail = includeDescription && description && description !== rule
      ? `；特质说明：${description}`
      : ''
    return [`${name}：${rule}${openingDetail}`]
  })
  return rows.length > 0 ? `【普通命格】${rows.join('；')}` : undefined
}
