/**
 * @module manifest.ts
 * @description MOD 身份声明 —— 文化/个人发展系统
 * @mod mod-culture
 *
 * 拆分自 mod-social-civilization（10 个子系统）
 */

import { defineMod } from '@/core'

export default defineMod({
  name: 'mod-culture',
  version: '1.0.0',
  description: '文化系统：文化、艺术、教育、声望、成就、作品、关系、家族、弟子、个人能力',
  dependencies: ['mod-character', 'mod-world'],
  provides: [
    'culture', 'art', 'education', 'reputation',
    'achievement', 'works',
    'relationship', 'family', 'disciple', 'personal-ability',
  ],
  consumes: [],
  subsystems: [
    'CultureSystem',
    'ArtSystem',
    'EducationSystem',
    'ReputationSystem',
    'AchievementSystem',
    'WorksSystem',
    'RelationshipSystem',
    'FamilySystem',
    'DiscipleSystem',
    'PersonalAbilitySystem',
  ],
  stores: ['useCultureStore'],
  events: {
    emits: [
      'mod-culture:festival-triggered',
      'mod-culture:masterpiece-created',
      'mod-culture:tech-advance',
      'mod-culture:reputation-milestone',
      'mod-culture:achievement-unlocked',
      'mod-culture:relationship-change',
      'mod-culture:family-birth',
      'mod-culture:family-death',
      'mod-culture:disciple-joined',
      'mod-culture:skill-mastered',
    ],
    listens: ['mod-engine:round-complete'],
  },
})
