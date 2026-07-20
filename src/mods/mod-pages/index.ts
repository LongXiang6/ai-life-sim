/**
 * @module index.ts
 * @description MOD 公共 API 导出 —— 页面路由
 * @mod mod-pages
 */

export type { PageRoute } from './types'

export { default as WelcomePage } from './pages/welcome/page'
export { default as NewGamePage } from './pages/new-game/page'
export { default as WorldBuildPage } from './pages/world-build/page'
export { default as CharacterCreatePage } from './pages/character-create/page'
export { default as TalentDrawPage } from './pages/talent-draw/page'
export { default as FatePreviewPage } from './pages/fate-preview/page'
export { default as GameStoryPage } from './pages/game-story/page'
export { default as WorldSelectPage } from './pages/world-select/page'
export { default as SaveManagerPage } from './pages/save-manager/page'
export { default as FeedbackPage } from './pages/feedback/page'
export { default as DebugLogPage } from './pages/debug-log/page'
export { default as GameOverPage } from './pages/game-over/page'
