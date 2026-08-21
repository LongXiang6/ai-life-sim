/**
 * Purpose: Define and normalize locally saved custom-model profiles.
 * Owner: mod-settings
 * Responsibility: Profile data shape and migration-safe normalization only.
 */

export interface CustomModelProfile {
  id: string
  name: string
  customKey: string
  customUrl: string
  customModel: string
  updatedAt: number
}

export function createCustomModelProfileId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function normalizeCustomModelProfiles(value: unknown): CustomModelProfile[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const record = item as Partial<CustomModelProfile>
    const name = typeof record.name === 'string' ? record.name.trim() : ''
    const customKey = typeof record.customKey === 'string' ? record.customKey.trim() : ''
    const customUrl = typeof record.customUrl === 'string' ? record.customUrl.trim() : ''
    const customModel = typeof record.customModel === 'string' ? record.customModel.trim() : ''
    const id = typeof record.id === 'string' && record.id.trim()
      ? record.id.trim()
      : createCustomModelProfileId()
    if (!name || !customKey || !customUrl || !customModel || seen.has(id)) return []
    seen.add(id)
    return [{
      id,
      name: name.slice(0, 32),
      customKey,
      customUrl,
      customModel,
      updatedAt: typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)
        ? Math.max(0, record.updatedAt)
        : 0,
    }]
  })
}
