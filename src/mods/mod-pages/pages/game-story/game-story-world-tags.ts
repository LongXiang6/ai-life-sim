/**
 * Purpose: Project persisted world tags into read-only information-panel sections.
 * Owner: mod-pages/game-story
 * Responsibility: World-tag presentation only; world state remains in mod-world.
 */

export interface WorldTagSection {
  name: string
  tags: Array<{ key: string; value: string }>
}

export function projectWorldTagsToSections(tags: readonly string[]): WorldTagSection[] {
  const values = [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))]
  if (values.length === 0) return []
  return [{
    name: '世界标签',
    tags: values.map((value, index) => ({
      key: String(index + 1).padStart(2, '0'),
      value,
    })),
  }]
}
