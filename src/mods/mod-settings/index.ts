/**
 * @module index.ts
 * @description MOD 公共 API 导出 —— 设置面板
 * @mod mod-settings
 */

export { SettingsModal } from './components/SettingsModal'
export { SettingsTabPrompt } from './components/SettingsTabPrompt'
export { useSettingsStore, isApiConfigured } from './store'
export type { NarrativeStyle, StreamingMode, ReasoningEffort } from './store'
