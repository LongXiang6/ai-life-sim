import { configStore } from '@/core/storage'

const CHARACTER_CREATE_DRAFT_PREFIX = 'character-create-form:'
const PER_LIFE_DRAFT_PREFIXES = ['talent-draw:', 'attribute-alloc:', 'fate-preview:'] as const

export const WORLD_CUSTOMIZE_DRAFT_KEY = 'mod-pages:world-customize-fields'

export function getCharacterCreateDraftKey(worldCode: number): string {
  return `${CHARACTER_CREATE_DRAFT_PREFIX}${worldCode || 0}`
}

export function clearCharacterCreateDrafts(): void {
  for (const key of configStore.keys('mod-pages')) {
    if (key.startsWith(CHARACTER_CREATE_DRAFT_PREFIX)) {
      configStore.remove('mod-pages', key)
    }
  }
}

export function clearWorldCustomizeDraft(): void {
  try {
    configStore.remove('mod-pages', WORLD_CUSTOMIZE_DRAFT_KEY)
  } catch {
    // 存储不可用时不阻断新人生重置。
  }
}

/** 清理只属于当前人生的创建流程草稿，不触碰设置或跨局神话库。 */
export function clearNewLifeCreationDrafts(): void {
  clearCharacterCreateDrafts()
  clearWorldCustomizeDraft()
  for (const key of configStore.keys('mod-pages')) {
    if (PER_LIFE_DRAFT_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      configStore.remove('mod-pages', key)
    }
  }
}
