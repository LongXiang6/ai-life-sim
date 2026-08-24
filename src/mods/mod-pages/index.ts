/**
 * @module index.ts
 * @description MOD 公共 API 导出 —— 页面路由
 * @mod mod-pages
 */

export type { PageRoute } from './types'

export { default as WelcomePage } from './pages/welcome/page'
export { default as NewGamePage } from './pages/new-game/page'
export { default as CharacterCreatePage } from './pages/character-create/page'
export { default as TalentDrawPage } from './pages/talent-draw/page'
export { default as FatePreviewPage } from './pages/fate-preview/page'
export { default as GameStoryPage } from './pages/game-story/page'
export { default as WorldSelectPage } from './pages/world-select/page'
export { default as AccountPage } from './pages/account/page'
export { default as SettingsPage } from './pages/settings/page'
export { default as HelpPage } from './pages/help/page'
export { default as FeedbackPage } from './pages/feedback/page'
export { default as LeaderboardPage } from './pages/leaderboard/page'
export { default as MailboxPage } from './pages/mailbox/page'
export { default as DebugLogPage } from './pages/debug-log/page'
export { default as GameOverPage } from './pages/game-over/page'
