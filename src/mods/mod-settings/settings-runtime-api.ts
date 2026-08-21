/**
 * Purpose: Expose the settings Store to runtime MODs without loading settings UI components.
 * Owner: mod-settings
 * Responsibility: Lightweight runtime settings API only; modal components and page state stay in the primary barrel.
 */

export {
  useSettingsStore,
  isApiConfigured,
  hasAvailableApiConfiguration,
} from './store'
export type { NarrativeAddressing, NarrativeStyle, StreamingMode, ReasoningEffort } from './store'
