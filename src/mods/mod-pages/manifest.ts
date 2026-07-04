/**
 * @module manifest.ts
 * @description MOD 身份声明 —— 页面路由
 * @mod mod-pages
 */

import { defineMod } from '@/core'

export default defineMod({
  name: 'mod-pages',
  version: '1.0.0',
  description: '页面组件 + 路由注册',
  dependencies: ['mod-engine', 'mod-ui', 'mod-world', 'mod-character', 'mod-power-system', 'mod-environment-ecology', 'mod-settings', 'mod-economy', 'mod-politics', 'mod-culture', 'mod-golden-finger'],
  provides: ['pages'],
  consumes: ['engine', 'ui', 'world', 'character', 'economy', 'politics', 'culture', 'power-system', 'environment-ecology', 'settings', 'golden-finger'],
  routes: [
    { path: '/', page: 'welcome' },
    { path: '/welcome', page: 'welcome' },
    { path: '/new-game', page: 'new-game' },
    { path: '/new-game/world-select', page: 'world-select' },
    { path: '/new-game/world-customize', page: 'world-customize' },
    { path: '/new-game/world-build', page: 'world-build' },
    { path: '/new-game/character-create', page: 'character-create' },
    { path: '/talent-draw', page: 'talent-draw' },
    { path: '/attribute-alloc', page: 'attribute-alloc' },
    { path: '/fate-preview', page: 'fate-preview' },
    { path: '/game-story', page: 'game-story' },
    { path: '/game-over', page: 'game-over' },
  ],
  stores: [],
})
