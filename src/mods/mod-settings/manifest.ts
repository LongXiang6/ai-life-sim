/**
 * @module manifest.ts
 * @description MOD 身份声明 —— 设置面板
 * @mod mod-settings
 */

import { defineMod } from '@/core'

export default defineMod({
  name: 'mod-settings',
  version: '1.0.0',
  description: '设置面板 MOD —— AI 模型配置、主题切换、叙事偏好、缓存统计、预设管理',
  dependencies: ['mod-ui', 'mod-engine'],
  provides: ['settings', 'settings-modal', 'settings-store'],
  consumes: ['ui', 'components'],
  subsystems: [],
  routes: [],
  stores: ['useSettingsStore'],
  events: { emits: [], listens: [] },
  prompts: [],
})
