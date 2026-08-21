/** Purpose: Expose the settings MOD public API. Owner: mod-settings. Responsibility: Public settings exports only. */
/**
 * @module index.ts
 * @description MOD 公共 API 导出 —— 设置面板
 * @mod mod-settings
 */

export { SettingsModal } from './components/SettingsModal'
export { useSettingsStore, isApiConfigured, hasAvailableApiConfiguration } from './store'
export type { NarrativeAddressing, NarrativeStyle, StreamingMode, ReasoningEffort } from './store'
