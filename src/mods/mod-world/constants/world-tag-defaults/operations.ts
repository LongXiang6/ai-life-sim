/**
 * Purpose: Merge, translate, and format structured world-tag values.
 * Owner: mod-world / world tags.
 * Responsibility: Tag operations only; the curated default profile catalog stays in its owning data file.
 */

import type { WorldTagsV2 } from '../../types'

export function combineTagDefaults(primary: WorldTagsV2, secondary: WorldTagsV2): WorldTagsV2 {
  return {
    worldview: `${primary.worldview}+${secondary.worldview}`,
    society: {
      ...primary.society,
      urbanization: secondary.society.urbanization,
      educationLevel: secondary.society.educationLevel,
    },
    environment: {
      ...primary.environment,
      pollutionLevel: secondary.environment.pollutionLevel,
      resourceAbundance: secondary.environment.resourceAbundance,
    },
    economy: { ...secondary.economy },
    supernatural: { ...primary.supernatural },
    demographics: {
      ...primary.demographics,
      populationDensity: secondary.demographics.populationDensity,
      healthLevel: secondary.demographics.healthLevel,
      literacyRate: secondary.demographics.literacyRate,
      socialMobility: secondary.demographics.socialMobility,
    },
    culturalFabric: {
      ...primary.culturalFabric,
      artStyle: secondary.culturalFabric.artStyle,
      innovationRate: secondary.culturalFabric.innovationRate,
      culturalDiversity: secondary.culturalFabric.culturalDiversity,
    },
    constraints: {
      hardForbidden: [...new Set([...primary.constraints.hardForbidden, ...secondary.constraints.hardForbidden])],
      softForbidden: [...new Set([...primary.constraints.softForbidden, ...secondary.constraints.softForbidden])],
      narrativeRules: [...primary.constraints.narrativeRules, ...secondary.constraints.narrativeRules],
    },
  }
}

export const TAG_VALUE_ZH_MAP: Record<string, Record<string, string>> = {
  socialClass: { hierarchical: '等级分明', collapsed: '崩塌瓦解', sectBased: '门派主导', dualWorld: '双轨并存', caste: '种姓固化', techStratified: '技术分层', feudal: '封建等级', imperial: '帝国集权', middleClass: '中产社会' },
  politicalStability: { turbulent: '动荡不安', stable: '政局稳定', anarchy: '无政府状态', cyclical: '治乱循环' },
  factionDensity: { fewPowers: '少数强权', multiPower: '群雄割据', scattered: '零星散据', hiddenPowers: '暗中操控' },
  urbanization: { cityBased: '城市为主', townBased: '城镇为主', ruins: '废墟遍布', megaCity: '巨型都市' },
  legalSystem: { codified: '成文法', none: '无法无天', might: '弱肉强食', traditional: '习惯法', feudal: '封建法', imperial: '帝国律法' },
  educationLevel: { universal: '全民教育', basic: '基础教育', illiterate: '文盲遍地', eliteOnly: '精英教育' },
  familyStructure: { nuclear: '核心家庭', extended: '大家族', fractured: '家庭破碎', clan: '宗族体系', nobleHouse: '贵族门阀' },
  disasterFrequency: { occasional: '偶发灾害', frequent: '频繁灾害', cataclysmic: '天灾浩劫', rare: '少有灾害' },
  climateType: { temperate: '温带气候', varied: '多样气候', hostile: '极端气候', spiritual: '灵气气候', controlled: '人工调控' },
  terrainType: { diverse: '地形多样', wasteland: '荒芜废土', mythical: '神话地貌', urban: '都市地形' },
  resourceAbundance: { moderate: '资源适中', abundant: '资源丰富', scarce: '资源匮乏' },
  biomeDiversity: { moderate: '生态适中', high: '生态丰富', low: '生态单调', extreme: '生态极端' },
  pollutionLevel: { moderate: '污染中等', low: '污染较少', toxic: '剧毒污染', high: '污染严重', none: '零污染' },
  economyType: { market: '市场经济', feudal: '封建经济', barter: '以物易物', spiritStone: '灵石经济', agrarian: '农耕经济', postScarcity: '后稀缺经济', mixed: '混合经济' },
  wealthDistribution: { unequal: '贫富悬殊', extreme: '极度不均', survival: '求生均贫', cultivationGap: '修为差距', techGap: '技术鸿沟' },
  tradeNetwork: { global: '全球贸易', regional: '区域贸易', none: '无贸易', sectRoutes: '门派商路', interstellar: '星际贸易', imperial: '帝国商路' },
  currencySystem: { fiat: '法定货币', commodity: '商品货币', scrap: '废品代币', spiritStone: '灵石', digital: '数字货币', preciousMetal: '贵金属' },
  techLevel: { information: '信息时代', medieval: '中世纪', collapsed: '科技崩塌', ancient: '古代', preIndustrial: '前工业时代', future: '未来科技' },
  industryFocus: { service: '服务业', agriculture: '农业', salvage: '废品回收', alchemy: '炼丹制药', craftsmanship: '手工业', tech: '科技产业', mixed: '混合产业' },
  powerSystem: { none: '无超自然', mixed: '混合体系', qi: '灵气修炼', hidden: '隐秘力量', magic: '魔法', wuXiaInternal: '武侠内力' },
  powerDensity: { nullZone: '灵力荒漠', moderate: '灵力适中', saturated: '灵气充沛', low: '灵力稀薄' },
  powerAccessibility: { forbidden: '禁止接触', rare: '极难获得', trained: '修行可及' },
  divineActivity: { absent: '神明不存在', distant: '神明遥远', active: '神明活跃', hidden: '神明隐匿' },
  monsterPresence: { none: '无怪物', uncommon: '偶见怪物', widespread: '怪物横行', hidden: '怪物隐匿', common: '常见怪物', rare: '稀有怪物' },
  cultivationCeiling: { mortal: '凡人极限', extended_life: '延年益寿', immortal_possible: '可成仙佛' },
  supernaturalTaboo: { forbidden: '严禁超自然', neutral: '无禁忌', celebrated: '推崇超自然', secret: '隐秘禁忌', regulated: '受管制的' },
  populationDensity: { dense: '人口稠密', sparse: '人口稀少', desolate: '人烟荒凉', moderate: '人口适中' },
  raceDiversity: { singleRace: '单一种族', multiRace: '多种族', dualWorld: '双轨种族', multiSpecies: '多物种' },
  lifespanBaseline: { normal: '正常寿命', extended: '寿命延长', short: '寿命短暂', immortal: '长生不老' },
  healthLevel: { good: '健康良好', moderate: '健康一般', plagueRidden: '瘟疫横行', enhanced: '体质强化', poor: '健康堪忧' },
  literacyRate: { high: '识字率高', low: '识字率低', universal: '全民识字', moderate: '识字率中等' },
  socialMobility: { moderate: '流动适中', low: '流动受限', none: '阶级固化', breakthrough: '突破式流动', high: '流动自由' },
  honorImportance: { moderate: '荣誉一般', high: '荣誉至上', none: '荣誉无关', absolute: '荣誉绝对', low: '荣誉淡漠' },
  artStyle: { modern: '现代风格', classical: '古典风格', lost: '艺术失落', daoist: '道家美学', futurist: '未来主义', medieval: '中世纪风格', oriental: '东方美学', eclectic: '折衷风格' },
  religiousInfluence: { secular: '世俗化', dominant: '宗教主导', crisis: '信仰危机', integrated: '宗教融合', moderate: '宗教一般' },
  traditionStrength: { weak: '传统薄弱', strong: '传统深厚', broken: '传统断裂', absolute: '传统至上', moderate: '传统适中' },
  innovationRate: { rapid: '快速创新', slow: '缓慢演进', stagnant: '停滞不前', cyclical: '周期性创新', exponential: '指数级爆发', moderate: '创新适中' },
  culturalDiversity: { multicultural: '多元文化', dualCulture: '双重文化', monoculture: '单一文化', sectDivided: '门派分裂' },
  narrativeTone: { realistic: '写实基调', heroic: '英雄史诗', horror: '恐怖基调', epic: '宏大史诗', mystery: '悬疑神秘', historical: '历史纪实', speculative: '思辨推演', grim: '灰暗压抑', wuxia: '武侠江湖', mixed: '混合基调' },
  constraints: { supernaturalPowers: '超自然力量', magic: '魔法', qi: '灵气修炼', gods: '神明', monsters: '怪物', modernTech: '现代科技', futureTech: '未来科技', scientificWorldview: '科学世界观', publicSupernaturalRevelation: '公开超自然揭示', escape: '逃离世界', returnToReality: '回归现实', exitPortals: '出口传送门', westernMagicSystem: '西方魔法体系' },
}

export function translateTagValue(subcategory: string, value: string): string {
  if (value.includes(',')) {
    return value.split(',').map((item) => TAG_VALUE_ZH_MAP[subcategory]?.[item.trim()] || item.trim()).join('、')
  }
  return TAG_VALUE_ZH_MAP[subcategory]?.[value] || value
}

const CATEGORY_ZH: Record<string, string> = {
  society: '社会',
  environment: '环境',
  economy: '经济',
  supernatural: '超自然',
  demographics: '人口',
  culturalFabric: '文化',
}

export function formatWorldTagsText(tags: WorldTagsV2): string {
  const lines: string[] = ['【世界标签】']
  for (const [categoryKey, categoryLabel] of Object.entries(CATEGORY_ZH)) {
    const category = tags[categoryKey as keyof Omit<WorldTagsV2, 'worldview' | 'constraints'>]
    if (!category || typeof category !== 'object') continue
    const items = Object.entries(category as unknown as Record<string, string>)
      .map(([key, value]) => translateTagValue(key, value))
      .filter(Boolean)
    if (items.length > 0) lines.push(`${categoryLabel}：${items.join('，')}`)
  }
  const constraints = tags.constraints
  if (constraints) {
    lines.push('', '【叙事约束】')
    if (constraints.hardForbidden.length > 0) {
      lines.push(`硬性禁止：${constraints.hardForbidden.map((value) => translateTagValue('constraints', value)).join('，')}`)
    }
    if (constraints.softForbidden.length > 0) {
      lines.push(`软性禁止：${constraints.softForbidden.map((value) => translateTagValue('constraints', value)).join('，')}`)
    }
    if (constraints.narrativeRules.length > 0) {
      lines.push(`叙事规则：${constraints.narrativeRules.join('；')}`)
    }
  }
  return lines.join('\n')
}
