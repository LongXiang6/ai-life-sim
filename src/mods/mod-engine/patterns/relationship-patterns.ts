/**
 * @module relationship-patterns.ts
 * @description 统一模式管理层 - 人际关系提取模式
 * @mod mod-engine
 *
 * 从 AI 叙事文本中提取人际关系信息。
 */

import { BasePattern } from './base-pattern'

// ============================================================
// 关系类型定义
// ============================================================

export interface RelationshipData {
  [key: string]: unknown
  type: string
  name: string
  action?: string
  quality?: number
}

// ============================================================
// 配偶关系模式
// ============================================================

export class SpousePattern extends BasePattern {
  constructor() {
    super(
      'relationship.spouse',
      'relationship',
      10,
      '检测配偶关系：娶、嫁、成婚、结婚、配偶、伴侣',
      /(娶|嫁|成婚|结婚|配偶|伴侣)(.+?)[，。！]/
    )
  }

  protected extractData(match: RegExpMatchArray): Record<string, unknown> {
    return {
      type: 'spouse',
      action: match[1]?.trim() || '',
      name: match[2]?.trim() || '',
      quality: 80,
    } as RelationshipData
  }
}

// ============================================================
// 父母关系模式
// ============================================================

export class FatherPattern extends BasePattern {
  constructor() {
    super(
      'relationship.father',
      'relationship',
      9,
      '检测父亲关系',
      /父亲(.+?)(?:，|。|的)/
    )
  }

  protected extractData(match: RegExpMatchArray): Record<string, unknown> {
    return {
      type: 'father',
      name: match[1]?.trim() || '',
      quality: 90,
    } as RelationshipData
  }
}

export class MotherPattern extends BasePattern {
  constructor() {
    super(
      'relationship.mother',
      'relationship',
      9,
      '检测母亲关系',
      /母亲(.+?)(?:，|。|的)/
    )
  }

  protected extractData(match: RegExpMatchArray): Record<string, unknown> {
    return {
      type: 'mother',
      name: match[1]?.trim() || '',
      quality: 90,
    } as RelationshipData
  }
}

// ============================================================
// 子女关系模式
// ============================================================

export class ChildPattern extends BasePattern {
  constructor() {
    super(
      'relationship.child',
      'relationship',
      9,
      '检测子女关系：生下、诞下、得子',
      /(生下|诞下|得子)(.+?)[，。]/
    )
  }

  protected extractData(match: RegExpMatchArray): Record<string, unknown> {
    return {
      type: 'child',
      action: match[1]?.trim() || '',
      name: match[2]?.trim() || '',
      quality: 95,
    } as RelationshipData
  }
}

// ============================================================
// 朋友关系模式
// ============================================================

export class FriendPattern extends BasePattern {
  constructor() {
    super(
      'relationship.friend',
      'relationship',
      8,
      '检测朋友关系：成为好友、结识、结盟',
      /(与(.+?)成为好友|结识(.+?)，成为知己|和(.+?)是好友)/
    )
  }

  protected extractData(match: RegExpMatchArray): Record<string, unknown> {
    const name = [match[2], match[3]].find(n => n && n.trim())?.trim() || ''
    return {
      type: 'friend',
      name,
      quality: 70,
    } as RelationshipData
  }

  protected calculateConfidence(match: RegExpMatchArray, _text: string): number {
    const fullMatch = match[0] || ''
    return fullMatch.length > 10 ? 0.9 : 0.7
  }
}

// ============================================================
// 敌人关系模式
// ============================================================

export class EnemyPattern extends BasePattern {
  constructor() {
    super(
      'relationship.enemy',
      'relationship',
      8,
      '检测敌人关系：反目成仇、仇敌、结下梁子',
      /(与(.+?)反目成仇|视(.+?)为仇敌|与(.+?)结下梁子)/
    )
  }

  protected extractData(match: RegExpMatchArray): Record<string, unknown> {
    const name = [match[2], match[3]].find(n => n && n.trim())?.trim() || ''
    return {
      type: 'enemy',
      name,
      quality: -50,
    } as RelationshipData
  }
}

// ============================================================
// 师徒关系模式
// ============================================================

export class MasterPattern extends BasePattern {
  constructor() {
    super(
      'relationship.master',
      'relationship',
      8,
      '检测拜师关系',
      /拜(.+?)为师/
    )
  }

  protected extractData(match: RegExpMatchArray): Record<string, unknown> {
    return {
      type: 'master',
      name: match[1]?.trim() || '',
      quality: 85,
    } as RelationshipData
  }
}

export class DisciplePattern extends BasePattern {
  constructor() {
    super(
      'relationship.disciple',
      'relationship',
      8,
      '检测收徒关系',
      /收(.+?)为徒/
    )
  }

  protected extractData(match: RegExpMatchArray): Record<string, unknown> {
    return {
      type: 'disciple',
      name: match[1]?.trim() || '',
      quality: 75,
    } as RelationshipData
  }
}

// ============================================================
// 兄弟姐妹关系模式
// ============================================================

export class SiblingPattern extends BasePattern {
  constructor() {
    super(
      'relationship.sibling',
      'relationship',
      7,
      '检测兄弟姐妹关系',
      /(兄|弟|姐|妹)(.+?)(?:，|。|的)/
    )
  }

  protected extractData(match: RegExpMatchArray): Record<string, unknown> {
    const typeMap: Record<string, string> = {
      '兄': 'brother',
      '弟': 'brother',
      '姐': 'sister',
      '妹': 'sister',
    }
    return {
      type: typeMap[match[1]] || 'sibling',
      name: match[2]?.trim() || '',
      quality: 80,
    } as RelationshipData
  }
}

// ============================================================
// 导出所有关系模式
// ============================================================

export const RELATIONSHIP_PATTERNS: BasePattern[] = [
  new SpousePattern(),
  new FatherPattern(),
  new MotherPattern(),
  new ChildPattern(),
  new FriendPattern(),
  new EnemyPattern(),
  new MasterPattern(),
  new DisciplePattern(),
  new SiblingPattern(),
]
