/**
 * @module fallback-narrative-builder.ts
 * @description 兜底叙事构建器 —— 按生命阶段比例 age/maxAge 生成兜底叙事
 * @mod mod-engine
 *
 * 为什么用比例而非固定年龄：
 *   人类 maxAge≈100 → 30岁 = 0.30（青年）
 *   精灵 maxAge≈1000 → 300岁 = 0.30（青年）
 *   龙族 maxAge≈50000 → 15000岁 = 0.30（青年）
 *   哥布林 maxAge≈50 → 15岁 = 0.30（青年）
 *
 *   用 age/maxAge 比例选择叙事，80岁精灵不会被当成"耄耋之年"。
 */

/** 生命阶段：age/maxAge 比例阈值 → 阶段标识符 */
const LIFE_STAGE_THRESHOLDS: Array<{ maxRatio: number; key: string }> = [
  { maxRatio: 0.03, key: 'newborn' },    // 0-3%
  { maxRatio: 0.10, key: 'infant' },     // 3-10%
  { maxRatio: 0.20, key: 'child' },      // 10-20%
  { maxRatio: 0.30, key: 'adolescent' }, // 20-30%
  { maxRatio: 0.45, key: 'youth' },      // 30-45%
  { maxRatio: 0.55, key: 'youngAdult' }, // 45-55%
  { maxRatio: 0.70, key: 'prime' },      // 55-70%
  { maxRatio: 0.85, key: 'mature' },     // 70-85%
  { maxRatio: 0.95, key: 'elder' },      // 85-95%
  { maxRatio: 1.00, key: 'twilight' },   // 95-100%
  { maxRatio: Infinity, key: 'ancient' },// >100%（已超寿命上限，依靠突破延寿）
]

const FALLBACK_NARRATIVES: Record<string, Record<string, string>> = {
  zh: {
    newborn: '你刚刚降生在这个世界上，一切都是那么新鲜而陌生。',
    infant: '你蹒跚学步，咿呀学语，每一天都在探索这个奇妙的世界。',
    child: '你开始了启蒙教育，好奇心驱使你不断提问，世界的轮廓在脑海中逐渐变得清晰。',
    adolescent: '你勤奋学习，一天天成长，无论是知识还是身体都在快速发育。',
    youth: '你正值青春年少，怀揣梦想，开始思考和探索人生的方向。',
    youngAdult: '你精力充沛，充满干劲，在事业和人生道路上奋力前行。',
    prime: '你步入壮年，经验丰富，在人生的重要阶段稳步前进。',
    mature: '你阅历渐深，开始用更成熟的眼光看待这个世界。',
    elder: '你步入暮年，回首往事，人生的画卷在眼前徐徐展开。',
    twilight: '岁月在你身上留下了深深的痕迹，但你依然以独特的方式感受着时间流动的意义。',
    ancient: '你已超越凡人寿命的极限，时间对你而言已成为一种不同的概念，每一刻都格外珍贵。',
  },
  en: {
    newborn: 'You have just been born into this world. Everything is fresh and unfamiliar.',
    infant: 'You toddle and babble, exploring this wonderful world every day.',
    child: 'You begin your early education, driven by endless curiosity.',
    adolescent: 'You study diligently, growing rapidly in both body and mind.',
    youth: 'In the bloom of youth, full of dreams, you ponder the direction of your life.',
    youngAdult: 'Full of energy and enthusiasm, you charge forward in your career and life.',
    prime: 'In your prime years, seasoned and steady, you advance through your life journey.',
    mature: 'With deep life experience, you view the world through increasingly wise eyes.',
    elder: 'Entering your twilight years, you look back at the rich tapestry of your life.',
    twilight: 'Time has left its mark upon you, yet you perceive its flow in a way only age can teach.',
    ancient: 'You have transcended the limits of mortal lifespans. Time itself bends to a different rhythm for you.',
  },
}

export class FallbackNarrativeBuilder {
  /**
   * 按龄兜底叙事（基于生命阶段比例 age/maxAge）
   *
   * @param age 当前年龄
   * @param maxAge 种族最大寿命（默认 100，人类基准）
   * @param locale 语言（'zh' / 'en'）
   */
  build(age: number, maxAge = 100, locale = 'zh'): string {
    const narratives = FALLBACK_NARRATIVES[locale] ?? FALLBACK_NARRATIVES.zh
    const ratio = maxAge > 0 ? age / maxAge : 0

    // 在阈值表中找到匹配的生命阶段
    for (const threshold of LIFE_STAGE_THRESHOLDS) {
      if (ratio <= threshold.maxRatio) {
        return narratives[threshold.key] ?? narratives.newborn
      }
    }

    // 兜底（理论上不会到这里，因为 ancient 的 Infinity 会捕获所有）
    return narratives.ancient ?? narratives.newborn
  }
}
