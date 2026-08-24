import { configStore } from '@/core/storage'

const PER_LIFE_DRAFT_PREFIXES = ['talent-draw:', 'fate-preview:'] as const
const LEGACY_PER_LIFE_DRAFT_PREFIXES = ['attribute-alloc:', 'character-create-form:'] as const

/** 清理只属于当前人生的草稿，不触碰长期角色设定、设置或跨局神话库。 */
export function clearNewLifeCreationDrafts(): void {
  for (const key of configStore.keys('mod-pages')) {
    if (
      PER_LIFE_DRAFT_PREFIXES.some((prefix) => key.startsWith(prefix))
      || LEGACY_PER_LIFE_DRAFT_PREFIXES.some((prefix) => key.startsWith(prefix))
    ) {
      configStore.remove('mod-pages', key)
    }
  }
}
