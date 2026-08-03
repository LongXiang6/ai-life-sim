/**
 * Purpose: Define the existing worldview constraint vocabulary and safety notice.
 * Owner: foundation:types
 * Responsibility: Immutable narrative constraint constants only; enforcement remains with consumers.
 */

export interface ForbiddenActionPattern {
  directionKeywords: string[]
  playerInputPatterns: RegExp[]
  aiHardConstraint: string
}

export const FORBIDDEN_ACTION_PATTERNS: Record<string, ForbiddenActionPattern> = {
  materialist: {
    directionKeywords: [
      '修仙', '修真', '魔法', '灵气', '修炼', '法术',
      '异能', '超凡', '神力', '仙术', '道术', '巫术',
      '魂力', '感应预知', '仙人托梦', '天降异象', '法宝',
    ],
    playerInputPatterns: [
      /修仙|修真|魔法|灵气|修炼|法术|异能|超凡|神力|仙术|道术|巫术|魂力|感应预知|仙人托梦|天降异象|法宝/i,
    ],
    aiHardConstraint: '禁止在叙事中出现任何超自然、修仙、魔法、灵气相关内容',
  },
}

export const SAFETY_GUIDE = '【内容说明】本程序为虚构文字娱乐，所有内容均为虚构世界中的故事，请勿与现实世界关联。请避免涉及现实政治、敏感事件及人物。'
