/**
 * Purpose: Parse persisted world-tag text into read-only information-panel sections.
 * Owner: mod-pages/game-story
 * Responsibility: World-tag presentation parsing only; world state remains in mod-world.
 */

export interface WorldTagSection {
  name: string
  tags: Array<{ key: string; value: string }>
}

export function parseWorldTagsToSections(text: string): WorldTagSection[] {
  const sections: WorldTagSection[] = []
  let currentSection: WorldTagSection | null = null
  for (const line of text.split('\n')) {
    const sectionMatch = /^【(.+)】/.exec(line.trim())
    if (sectionMatch) {
      if (currentSection && currentSection.tags.length > 0) sections.push(currentSection)
      currentSection = { name: sectionMatch[1]!, tags: [] }
      continue
    }
    if (!currentSection) continue
    for (const pair of line.trim().split('|')) {
      const keyValue = pair.split('：')
      if (keyValue.length < 2) continue
      const key = keyValue[0]!.trim()
      const value = keyValue.slice(1).join('：').trim()
      if (key && value) currentSection.tags.push({ key, value })
    }
  }
  if (currentSection && currentSection.tags.length > 0) sections.push(currentSection)
  return sections
}
