/**
 * @module manifest.ts
 * @description MOD 身份声明 —— 页面路由
 * @mod mod-pages
 */

import { defineMod } from '@/core'

export default defineMod({
  name: 'mod-pages',
  order: 900,
  version: '1.0.0',
  description: '页面组件 + 路由注册',
  dependencies: ['mod-engine', 'mod-ui', 'mod-world', 'mod-character', 'mod-power-system', 'mod-settings'],
  provides: ['pages'],
  consumes: ['engine', 'ui', 'world', 'character', 'power-system', 'settings'],
  secondaryPublicEntries: ['account-cloud-api.ts'],
  remoteApi: [],
  routes: [
    { path: '/new-game', page: 'new-game' },
    { path: '/new-game/world-select', page: 'world-select' },
    { path: '/new-game/character-create', page: 'character-create' },
    // The mobile solution library uses /new-game/* for every creation step.
    // Keep those links first-class while retaining the shorter legacy paths.
    { path: '/new-game/talent-draw', page: 'talent-draw' },
    { path: '/new-game/mythic-inheritance', page: 'talent-draw' },
    { path: '/new-game/attribute-alloc', page: 'attribute-alloc' },
    { path: '/new-game/fate-preview', page: 'fate-preview' },
    { path: '/new-game/game-story', page: 'game-story' },
    { path: '/new-game/game-over', page: 'game-over' },
    { path: '/talent-draw', page: 'talent-draw' },
    { path: '/attribute-alloc', page: 'attribute-alloc' },
    { path: '/fate-preview', page: 'fate-preview' },
    { path: '/game-story', page: 'game-story' },
    { path: '/save-manager', page: 'save-manager' },
    { path: '/account', page: 'account' },
    { path: '/settings', page: 'settings' },
    { path: '/help', page: 'help' },
    { path: '/feedback', page: 'feedback' },
    { path: '/leaderboard', page: 'leaderboard' },
    { path: '/mailbox', page: 'mailbox' },
    { path: '/debug-log', page: 'debug-log' },
    { path: '/game-over', page: 'game-over' },
  ],
  stores: [],
})
