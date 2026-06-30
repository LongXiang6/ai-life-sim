/**
 * @module world-tag-defaults.ts
 * @description 世界标签 V2 默认值 —— 12 种世界观的 6×39 子类别默认标签
 * @mod mod-world
 *
 * 来源：废案 world-tag-defaults.ts（完整迁移）
 *
 * 设计：每种世界观有一份完整的标签默认值，世界初始化时根据 essenceTag 匹配，
 *      以后可接入 AI 在默认值基础上微调（而非从零生成）。
 */

import type { WorldTagsV2, WorldTagConstraints } from '../types'

// ==================== 帮助函数 ====================

function t(args: Omit<WorldTagsV2, 'constraints'> & { constraints: WorldTagConstraints }): WorldTagsV2 {
  return args
}

// ==================== 12 种世界观默认标签 ====================

const MATERIALIST: WorldTagsV2 = t({
  worldview: 'materialist',
  society: {
    socialClass: 'hierarchical',
    politicalStability: 'turbulent',
    factionDensity: 'fewPowers',
    urbanization: 'cityBased',
    legalSystem: 'codified',
    educationLevel: 'universal',
    familyStructure: 'nuclear',
  },
  environment: {
    disasterFrequency: 'occasional',
    climateType: 'temperate',
    terrainType: 'diverse',
    resourceAbundance: 'moderate',
    biomeDiversity: 'moderate',
    pollutionLevel: 'moderate',
  },
  economy: {
    economyType: 'market',
    wealthDistribution: 'unequal',
    tradeNetwork: 'global',
    currencySystem: 'fiat',
    techLevel: 'information',
    industryFocus: 'service',
  },
  supernatural: {
    powerSystem: 'none',
    powerDensity: 'nullZone',
    powerAccessibility: 'forbidden',
    divineActivity: 'absent',
    monsterPresence: 'none',
    cultivationCeiling: 'mortal',
    supernaturalTaboo: 'forbidden',
  },
  demographics: {
    populationDensity: 'dense',
    raceDiversity: 'singleRace',
    lifespanBaseline: 'normal',
    healthLevel: 'good',
    literacyRate: 'high',
    socialMobility: 'moderate',
  },
  culturalFabric: {
    honorImportance: 'moderate',
    artStyle: 'modern',
    religiousInfluence: 'secular',
    traditionStrength: 'weak',
    innovationRate: 'rapid',
    culturalDiversity: 'multicultural',
    narrativeTone: 'realistic',
  },
  constraints: {
    hardForbidden: ['supernaturalPowers', 'magic', 'qi', 'gods', 'monsters'],
    softForbidden: [],
    narrativeRules: ['科技决定论：所有现象必须可被科学解释'],
  },
})

const IDEALIST: WorldTagsV2 = t({
  worldview: 'idealist',
  society: {
    socialClass: 'hierarchical',
    politicalStability: 'turbulent',
    factionDensity: 'multiPower',
    urbanization: 'townBased',
    legalSystem: 'codified',
    educationLevel: 'basic',
    familyStructure: 'extended',
  },
  environment: {
    disasterFrequency: 'frequent',
    climateType: 'varied',
    terrainType: 'diverse',
    resourceAbundance: 'abundant',
    biomeDiversity: 'high',
    pollutionLevel: 'low',
  },
  economy: {
    economyType: 'feudal',
    wealthDistribution: 'extreme',
    tradeNetwork: 'regional',
    currencySystem: 'commodity',
    techLevel: 'medieval',
    industryFocus: 'agriculture',
  },
  supernatural: {
    powerSystem: 'mixed',
    powerDensity: 'moderate',
    powerAccessibility: 'rare',
    divineActivity: 'distant',
    monsterPresence: 'uncommon',
    cultivationCeiling: 'extended_life',
    supernaturalTaboo: 'neutral',
  },
  demographics: {
    populationDensity: 'sparse',
    raceDiversity: 'multiRace',
    lifespanBaseline: 'extended',
    healthLevel: 'moderate',
    literacyRate: 'low',
    socialMobility: 'low',
  },
  culturalFabric: {
    honorImportance: 'high',
    artStyle: 'classical',
    religiousInfluence: 'dominant',
    traditionStrength: 'strong',
    innovationRate: 'slow',
    culturalDiversity: 'dualCulture',
    narrativeTone: 'heroic',
  },
  constraints: {
    hardForbidden: [],
    softForbidden: [],
    narrativeRules: ['超自然力量是世界的自然组成部分'],
  },
})

const MATERIALIST_CULTIVATION: WorldTagsV2 = t({
  worldview: 'materialist_cultivation',
  society: {
    socialClass: 'sectBased',
    politicalStability: 'turbulent',
    factionDensity: 'multiPower',
    urbanization: 'townBased',
    legalSystem: 'codified',
    educationLevel: 'eliteOnly',
    familyStructure: 'clan',
  },
  environment: {
    disasterFrequency: 'frequent',
    climateType: 'spiritual',
    terrainType: 'diverse',
    resourceAbundance: 'abundant',
    biomeDiversity: 'high',
    pollutionLevel: 'moderate',
  },
  economy: {
    economyType: 'mixed',
    wealthDistribution: 'unequal',
    tradeNetwork: 'regional',
    currencySystem: 'mixed',
    techLevel: 'medieval',
    industryFocus: 'mixed',
  },
  supernatural: {
    powerSystem: 'qi',
    powerDensity: 'moderate',
    powerAccessibility: 'trained',
    divineActivity: 'distant',
    monsterPresence: 'common',
    cultivationCeiling: 'immortal_possible',
    supernaturalTaboo: 'neutral',
  },
  demographics: {
    populationDensity: 'moderate',
    raceDiversity: 'multiRace',
    lifespanBaseline: 'extended',
    healthLevel: 'moderate',
    literacyRate: 'low',
    socialMobility: 'low',
  },
  culturalFabric: {
    honorImportance: 'moderate',
    artStyle: 'classical',
    religiousInfluence: 'moderate',
    traditionStrength: 'moderate',
    innovationRate: 'moderate',
    culturalDiversity: 'dualCulture',
    narrativeTone: 'speculative',
  },
  constraints: {
    hardForbidden: [],
    softForbidden: [],
    narrativeRules: ['修仙可被科学解析：灵气是能量场，境界是能量层级跃迁，丹药是生物化学制剂，万物皆可被分析和测量'],
  },
})

const IDEALIST_CULTIVATION: WorldTagsV2 = t({
  worldview: 'idealist_cultivation',
  society: {
    socialClass: 'sectBased',
    politicalStability: 'cyclical',
    factionDensity: 'multiPower',
    urbanization: 'townBased',
    legalSystem: 'might',
    educationLevel: 'eliteOnly',
    familyStructure: 'clan',
  },
  environment: {
    disasterFrequency: 'cataclysmic',
    climateType: 'spiritual',
    terrainType: 'mythical',
    resourceAbundance: 'abundant',
    biomeDiversity: 'extreme',
    pollutionLevel: 'none',
  },
  economy: {
    economyType: 'spiritStone',
    wealthDistribution: 'cultivationGap',
    tradeNetwork: 'sectRoutes',
    currencySystem: 'spiritStone',
    techLevel: 'ancient',
    industryFocus: 'alchemy',
  },
  supernatural: {
    powerSystem: 'qi',
    powerDensity: 'saturated',
    powerAccessibility: 'trained',
    divineActivity: 'active',
    monsterPresence: 'widespread',
    cultivationCeiling: 'immortal_possible',
    supernaturalTaboo: 'celebrated',
  },
  demographics: {
    populationDensity: 'sparse',
    raceDiversity: 'multiRace',
    lifespanBaseline: 'extended',
    healthLevel: 'moderate',
    literacyRate: 'low',
    socialMobility: 'low',
  },
  culturalFabric: {
    honorImportance: 'absolute',
    artStyle: 'classical',
    religiousInfluence: 'dominant',
    traditionStrength: 'absolute',
    innovationRate: 'slow',
    culturalDiversity: 'sectDivided',
    narrativeTone: 'epic',
  },
  constraints: {
    hardForbidden: ['modernTech', 'futureTech', 'scientificWorldview'],
    softForbidden: [],
    narrativeRules: ['修仙不可解析：力量来自道心和悟性，灵气是天地意志的具现，境界突破依赖机缘而非积累，核心力量本质上是不可分析和不可复制的'],
  },
})

const SURVIVAL_HORROR: WorldTagsV2 = t({
  worldview: 'survival_horror',
  society: {
    socialClass: 'collapsed',
    politicalStability: 'anarchy',
    factionDensity: 'scattered',
    urbanization: 'ruins',
    legalSystem: 'none',
    educationLevel: 'illiterate',
    familyStructure: 'fractured',
  },
  environment: {
    disasterFrequency: 'cataclysmic',
    climateType: 'hostile',
    terrainType: 'wasteland',
    resourceAbundance: 'scarce',
    biomeDiversity: 'low',
    pollutionLevel: 'toxic',
  },
  economy: {
    economyType: 'barter',
    wealthDistribution: 'survival',
    tradeNetwork: 'none',
    currencySystem: 'scrap',
    techLevel: 'collapsed',
    industryFocus: 'salvage',
  },
  supernatural: {
    powerSystem: 'none',
    powerDensity: 'nullZone',
    powerAccessibility: 'forbidden',
    divineActivity: 'absent',
    monsterPresence: 'widespread',
    cultivationCeiling: 'mortal',
    supernaturalTaboo: 'forbidden',
  },
  demographics: {
    populationDensity: 'desolate',
    raceDiversity: 'singleRace',
    lifespanBaseline: 'short',
    healthLevel: 'plagueRidden',
    literacyRate: 'low',
    socialMobility: 'none',
  },
  culturalFabric: {
    honorImportance: 'none',
    artStyle: 'lost',
    religiousInfluence: 'crisis',
    traditionStrength: 'broken',
    innovationRate: 'stagnant',
    culturalDiversity: 'monoculture',
    narrativeTone: 'horror',
  },
  constraints: {
    hardForbidden: ['escape', 'returnToReality', 'magic', 'qi', 'gods', 'exitPortals'],
    softForbidden: [],
    narrativeRules: ['恐怖隔离：世界是封闭的，无法逃离或回归现实'],
  },
})

const XIANXIA: WorldTagsV2 = t({
  worldview: 'xianxia',
  society: {
    socialClass: 'sectBased',
    politicalStability: 'turbulent',
    factionDensity: 'multiPower',
    urbanization: 'townBased',
    legalSystem: 'might',
    educationLevel: 'eliteOnly',
    familyStructure: 'clan',
  },
  environment: {
    disasterFrequency: 'cataclysmic',
    climateType: 'spiritual',
    terrainType: 'mythical',
    resourceAbundance: 'abundant',
    biomeDiversity: 'extreme',
    pollutionLevel: 'none',
  },
  economy: {
    economyType: 'spiritStone',
    wealthDistribution: 'cultivationGap',
    tradeNetwork: 'sectRoutes',
    currencySystem: 'spiritStone',
    techLevel: 'ancient',
    industryFocus: 'alchemy',
  },
  supernatural: {
    powerSystem: 'qi',
    powerDensity: 'saturated',
    powerAccessibility: 'trained',
    divineActivity: 'active',
    monsterPresence: 'widespread',
    cultivationCeiling: 'immortal_possible',
    supernaturalTaboo: 'celebrated',
  },
  demographics: {
    populationDensity: 'moderate',
    raceDiversity: 'multiRace',
    lifespanBaseline: 'immortal',
    healthLevel: 'enhanced',
    literacyRate: 'low',
    socialMobility: 'breakthrough',
  },
  culturalFabric: {
    honorImportance: 'absolute',
    artStyle: 'daoist',
    religiousInfluence: 'integrated',
    traditionStrength: 'absolute',
    innovationRate: 'cyclical',
    culturalDiversity: 'sectDivided',
    narrativeTone: 'epic',
  },
  constraints: {
    hardForbidden: ['modernTech', 'futureTech'],
    softForbidden: [],
    narrativeRules: ['修仙法则：力量来自修炼，科技无法比肩仙道'],
  },
})

const URBAN_FANTASY: WorldTagsV2 = t({
  worldview: 'urban_fantasy',
  society: {
    socialClass: 'dualWorld',
    politicalStability: 'stable',
    factionDensity: 'hiddenPowers',
    urbanization: 'cityBased',
    legalSystem: 'codified',
    educationLevel: 'universal',
    familyStructure: 'nuclear',
  },
  environment: {
    disasterFrequency: 'rare',
    climateType: 'temperate',
    terrainType: 'urban',
    resourceAbundance: 'moderate',
    biomeDiversity: 'low',
    pollutionLevel: 'high',
  },
  economy: {
    economyType: 'market',
    wealthDistribution: 'unequal',
    tradeNetwork: 'global',
    currencySystem: 'fiat',
    techLevel: 'information',
    industryFocus: 'service',
  },
  supernatural: {
    powerSystem: 'hidden',
    powerDensity: 'low',
    powerAccessibility: 'rare',
    divineActivity: 'hidden',
    monsterPresence: 'hidden',
    cultivationCeiling: 'extended_life',
    supernaturalTaboo: 'secret',
  },
  demographics: {
    populationDensity: 'dense',
    raceDiversity: 'dualWorld',
    lifespanBaseline: 'normal',
    healthLevel: 'good',
    literacyRate: 'high',
    socialMobility: 'moderate',
  },
  culturalFabric: {
    honorImportance: 'moderate',
    artStyle: 'modern',
    religiousInfluence: 'secular',
    traditionStrength: 'weak',
    innovationRate: 'rapid',
    culturalDiversity: 'multicultural',
    narrativeTone: 'mystery',
  },
  constraints: {
    hardForbidden: ['magic', 'qi', 'gods', 'supernaturalPowers'],
    softForbidden: ['publicSupernaturalRevelation'],
    narrativeRules: ['保密法则：超自然世界必须对普通人隐藏'],
  },
})

const HISTORICAL: WorldTagsV2 = t({
  worldview: 'historical',
  society: {
    socialClass: 'caste',
    politicalStability: 'cyclical',
    factionDensity: 'fewPowers',
    urbanization: 'townBased',
    legalSystem: 'traditional',
    educationLevel: 'eliteOnly',
    familyStructure: 'extended',
  },
  environment: {
    disasterFrequency: 'frequent',
    climateType: 'temperate',
    terrainType: 'diverse',
    resourceAbundance: 'moderate',
    biomeDiversity: 'moderate',
    pollutionLevel: 'low',
  },
  economy: {
    economyType: 'agrarian',
    wealthDistribution: 'extreme',
    tradeNetwork: 'regional',
    currencySystem: 'commodity',
    techLevel: 'preIndustrial',
    industryFocus: 'agriculture',
  },
  supernatural: {
    powerSystem: 'none',
    powerDensity: 'nullZone',
    powerAccessibility: 'forbidden',
    divineActivity: 'distant',
    monsterPresence: 'none',
    cultivationCeiling: 'mortal',
    supernaturalTaboo: 'forbidden',
  },
  demographics: {
    populationDensity: 'sparse',
    raceDiversity: 'singleRace',
    lifespanBaseline: 'short',
    healthLevel: 'poor',
    literacyRate: 'low',
    socialMobility: 'none',
  },
  culturalFabric: {
    honorImportance: 'high',
    artStyle: 'classical',
    religiousInfluence: 'dominant',
    traditionStrength: 'absolute',
    innovationRate: 'slow',
    culturalDiversity: 'monoculture',
    narrativeTone: 'historical',
  },
  constraints: {
    hardForbidden: ['supernaturalPowers', 'magic', 'qi', 'modernTech', 'futureTech'],
    softForbidden: [],
    narrativeRules: ['严格历史：不包含超自然元素和未来科技'],
  },
})

const SCIFI: WorldTagsV2 = t({
  worldview: 'scifi',
  society: {
    socialClass: 'techStratified',
    politicalStability: 'stable',
    factionDensity: 'multiPower',
    urbanization: 'megaCity',
    legalSystem: 'codified',
    educationLevel: 'universal',
    familyStructure: 'nuclear',
  },
  environment: {
    disasterFrequency: 'rare',
    climateType: 'controlled',
    terrainType: 'urban',
    resourceAbundance: 'abundant',
    biomeDiversity: 'low',
    pollutionLevel: 'high',
  },
  economy: {
    economyType: 'postScarcity',
    wealthDistribution: 'techGap',
    tradeNetwork: 'interstellar',
    currencySystem: 'digital',
    techLevel: 'future',
    industryFocus: 'tech',
  },
  supernatural: {
    powerSystem: 'none',
    powerDensity: 'nullZone',
    powerAccessibility: 'forbidden',
    divineActivity: 'absent',
    monsterPresence: 'none',
    cultivationCeiling: 'mortal',
    supernaturalTaboo: 'forbidden',
  },
  demographics: {
    populationDensity: 'dense',
    raceDiversity: 'multiSpecies',
    lifespanBaseline: 'extended',
    healthLevel: 'enhanced',
    literacyRate: 'universal',
    socialMobility: 'high',
  },
  culturalFabric: {
    honorImportance: 'low',
    artStyle: 'futurist',
    religiousInfluence: 'secular',
    traditionStrength: 'weak',
    innovationRate: 'exponential',
    culturalDiversity: 'multicultural',
    narrativeTone: 'speculative',
  },
  constraints: {
    hardForbidden: ['supernaturalPowers', 'magic', 'qi', 'gods'],
    softForbidden: [],
    narrativeRules: ['科技为唯一力量来源，不存在超自然力量'],
  },
})

const POST_APOCALYPTIC: WorldTagsV2 = t({
  worldview: 'post_apocalyptic',
  society: {
    socialClass: 'collapsed',
    politicalStability: 'anarchy',
    factionDensity: 'scattered',
    urbanization: 'ruins',
    legalSystem: 'might',
    educationLevel: 'illiterate',
    familyStructure: 'fractured',
  },
  environment: {
    disasterFrequency: 'cataclysmic',
    climateType: 'hostile',
    terrainType: 'wasteland',
    resourceAbundance: 'scarce',
    biomeDiversity: 'low',
    pollutionLevel: 'toxic',
  },
  economy: {
    economyType: 'barter',
    wealthDistribution: 'survival',
    tradeNetwork: 'none',
    currencySystem: 'scrap',
    techLevel: 'collapsed',
    industryFocus: 'salvage',
  },
  supernatural: {
    powerSystem: 'none',
    powerDensity: 'nullZone',
    powerAccessibility: 'forbidden',
    divineActivity: 'absent',
    monsterPresence: 'rare',
    cultivationCeiling: 'mortal',
    supernaturalTaboo: 'forbidden',
  },
  demographics: {
    populationDensity: 'desolate',
    raceDiversity: 'singleRace',
    lifespanBaseline: 'short',
    healthLevel: 'plagueRidden',
    literacyRate: 'low',
    socialMobility: 'none',
  },
  culturalFabric: {
    honorImportance: 'moderate',
    artStyle: 'lost',
    religiousInfluence: 'crisis',
    traditionStrength: 'broken',
    innovationRate: 'stagnant',
    culturalDiversity: 'monoculture',
    narrativeTone: 'grim',
  },
  constraints: {
    hardForbidden: ['supernaturalPowers', 'magic', 'qi'],
    softForbidden: [],
    narrativeRules: ['文明废墟中求生，不存在完整的政治实体'],
  },
})

const WESTERN_FANTASY: WorldTagsV2 = t({
  worldview: 'western_fantasy',
  society: {
    socialClass: 'feudal',
    politicalStability: 'turbulent',
    factionDensity: 'multiPower',
    urbanization: 'townBased',
    legalSystem: 'feudal',
    educationLevel: 'eliteOnly',
    familyStructure: 'nobleHouse',
  },
  environment: {
    disasterFrequency: 'occasional',
    climateType: 'temperate',
    terrainType: 'diverse',
    resourceAbundance: 'abundant',
    biomeDiversity: 'high',
    pollutionLevel: 'none',
  },
  economy: {
    economyType: 'feudal',
    wealthDistribution: 'extreme',
    tradeNetwork: 'regional',
    currencySystem: 'preciousMetal',
    techLevel: 'medieval',
    industryFocus: 'craftsmanship',
  },
  supernatural: {
    powerSystem: 'magic',
    powerDensity: 'moderate',
    powerAccessibility: 'rare',
    divineActivity: 'active',
    monsterPresence: 'common',
    cultivationCeiling: 'extended_life',
    supernaturalTaboo: 'regulated',
  },
  demographics: {
    populationDensity: 'sparse',
    raceDiversity: 'multiRace',
    lifespanBaseline: 'extended',
    healthLevel: 'moderate',
    literacyRate: 'low',
    socialMobility: 'low',
  },
  culturalFabric: {
    honorImportance: 'high',
    artStyle: 'medieval',
    religiousInfluence: 'dominant',
    traditionStrength: 'strong',
    innovationRate: 'slow',
    culturalDiversity: 'dualCulture',
    narrativeTone: 'heroic',
  },
  constraints: {
    hardForbidden: ['modernTech', 'futureTech', 'scientificWorldview'],
    softForbidden: [],
    narrativeRules: ['魔法与封建：力量来自魔法和血统，科学世界观不成立'],
  },
})

const EASTERN_FANTASY: WorldTagsV2 = t({
  worldview: 'eastern_fantasy',
  society: {
    socialClass: 'imperial',
    politicalStability: 'cyclical',
    factionDensity: 'multiPower',
    urbanization: 'townBased',
    legalSystem: 'imperial',
    educationLevel: 'eliteOnly',
    familyStructure: 'clan',
  },
  environment: {
    disasterFrequency: 'frequent',
    climateType: 'varied',
    terrainType: 'mythical',
    resourceAbundance: 'abundant',
    biomeDiversity: 'extreme',
    pollutionLevel: 'none',
  },
  economy: {
    economyType: 'agrarian',
    wealthDistribution: 'extreme',
    tradeNetwork: 'imperial',
    currencySystem: 'preciousMetal',
    techLevel: 'ancient',
    industryFocus: 'agriculture',
  },
  supernatural: {
    powerSystem: 'wuXiaInternal',
    powerDensity: 'moderate',
    powerAccessibility: 'trained',
    divineActivity: 'active',
    monsterPresence: 'common',
    cultivationCeiling: 'extended_life',
    supernaturalTaboo: 'neutral',
  },
  demographics: {
    populationDensity: 'moderate',
    raceDiversity: 'singleRace',
    lifespanBaseline: 'extended',
    healthLevel: 'moderate',
    literacyRate: 'low',
    socialMobility: 'low',
  },
  culturalFabric: {
    honorImportance: 'absolute',
    artStyle: 'oriental',
    religiousInfluence: 'integrated',
    traditionStrength: 'absolute',
    innovationRate: 'slow',
    culturalDiversity: 'monoculture',
    narrativeTone: 'wuxia',
  },
  constraints: {
    hardForbidden: ['modernTech', 'futureTech', 'westernMagicSystem', 'qi'],
    softForbidden: [],
    narrativeRules: ['江湖法则：武功内力是力量来源，不涉及修仙灵气'],
  },
})

const MODERN: WorldTagsV2 = t({
  worldview: 'modern',
  society: {
    socialClass: 'middleClass',
    politicalStability: 'stable',
    factionDensity: 'fewPowers',
    urbanization: 'cityBased',
    legalSystem: 'codified',
    educationLevel: 'universal',
    familyStructure: 'nuclear',
  },
  environment: {
    disasterFrequency: 'occasional',
    climateType: 'temperate',
    terrainType: 'urban',
    resourceAbundance: 'moderate',
    biomeDiversity: 'low',
    pollutionLevel: 'high',
  },
  economy: {
    economyType: 'market',
    wealthDistribution: 'unequal',
    tradeNetwork: 'global',
    currencySystem: 'fiat',
    techLevel: 'information',
    industryFocus: 'service',
  },
  supernatural: {
    powerSystem: 'none',
    powerDensity: 'nullZone',
    powerAccessibility: 'forbidden',
    divineActivity: 'absent',
    monsterPresence: 'none',
    cultivationCeiling: 'mortal',
    supernaturalTaboo: 'forbidden',
  },
  demographics: {
    populationDensity: 'dense',
    raceDiversity: 'singleRace',
    lifespanBaseline: 'normal',
    healthLevel: 'good',
    literacyRate: 'high',
    socialMobility: 'moderate',
  },
  culturalFabric: {
    honorImportance: 'low',
    artStyle: 'modern',
    religiousInfluence: 'secular',
    traditionStrength: 'weak',
    innovationRate: 'rapid',
    culturalDiversity: 'multicultural',
    narrativeTone: 'realistic',
  },
  constraints: {
    hardForbidden: ['supernaturalPowers', 'magic', 'qi', 'gods', 'monsters'],
    softForbidden: [],
    narrativeRules: ['现代都市生活，完全以科学为基础'],
  },
})

const MIXED: WorldTagsV2 = t({
  worldview: 'mixed',
  society: {
    socialClass: 'hierarchical',
    politicalStability: 'turbulent',
    factionDensity: 'multiPower',
    urbanization: 'cityBased',
    legalSystem: 'codified',
    educationLevel: 'basic',
    familyStructure: 'nuclear',
  },
  environment: {
    disasterFrequency: 'occasional',
    climateType: 'varied',
    terrainType: 'diverse',
    resourceAbundance: 'moderate',
    biomeDiversity: 'moderate',
    pollutionLevel: 'moderate',
  },
  economy: {
    economyType: 'mixed',
    wealthDistribution: 'unequal',
    tradeNetwork: 'global',
    currencySystem: 'fiat',
    techLevel: 'information',
    industryFocus: 'mixed',
  },
  supernatural: {
    powerSystem: 'mixed',
    powerDensity: 'moderate',
    powerAccessibility: 'rare',
    divineActivity: 'distant',
    monsterPresence: 'uncommon',
    cultivationCeiling: 'extended_life',
    supernaturalTaboo: 'neutral',
  },
  demographics: {
    populationDensity: 'dense',
    raceDiversity: 'multiRace',
    lifespanBaseline: 'normal',
    healthLevel: 'moderate',
    literacyRate: 'moderate',
    socialMobility: 'moderate',
  },
  culturalFabric: {
    honorImportance: 'moderate',
    artStyle: 'eclectic',
    religiousInfluence: 'moderate',
    traditionStrength: 'moderate',
    innovationRate: 'moderate',
    culturalDiversity: 'multicultural',
    narrativeTone: 'mixed',
  },
  constraints: {
    hardForbidden: [],
    softForbidden: [],
    narrativeRules: ['科技与超自然共存，二者存在张力或边界'],
  },
})

// ==================== 世界观标签默认值表 ====================

export const WORLDVIEW_TAG_DEFAULTS: Record<string, WorldTagsV2> = {
  materialist: MATERIALIST,
  idealist: IDEALIST,
  materialist_cultivation: MATERIALIST_CULTIVATION,
  idealist_cultivation: IDEALIST_CULTIVATION,
  survival_horror: SURVIVAL_HORROR,
  xianxia: XIANXIA,
  urban_fantasy: URBAN_FANTASY,
  historical: HISTORICAL,
  scifi: SCIFI,
  post_apocalyptic: POST_APOCALYPTIC,
  western_fantasy: WESTERN_FANTASY,
  eastern_fantasy: EASTERN_FANTASY,
  modern: MODERN,
  mixed: MIXED,
}

// ==================== 标签合并（组合世界观） ====================

/**
 * 合并两个世界观标签默认值（primary 为主，secondary 为辅）
 *
 * 合并策略（per 维度）：
 * - worldview：拼接 "primary+secondary"
 * - society：primary 为基础，urbanization/educationLevel 取 secondary
 * - environment：primary 为基础，pollutionLevel/resourceAbundance 取 secondary
 * - economy：完全替换为 secondary
 * - supernatural：完全保持 primary
 * - demographics：primary 为基础，populationDensity/healthLevel/literacyRate/socialMobility 取 secondary
 * - culturalFabric：primary 为基础，artStyle/innovationRate/culturalDiversity 取 secondary
 * - constraints：并集合并（Set 去重）
 */
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

// ==================== 中文翻译映射 ====================

/** 英文标签值 → 中文描述映射表（按子类别分组，消除歧义） */
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

/** 将英文标签值转为中文（按子类别索引消除歧义） */
export function translateTagValue(subcategory: string, value: string): string {
  if (value.includes(',')) {
    return value.split(',').map((v) => TAG_VALUE_ZH_MAP[subcategory]?.[v.trim()] || v.trim()).join('、')
  }
  return TAG_VALUE_ZH_MAP[subcategory]?.[value] || value
}

// ==================== 叙事格式化 ====================

/** 标签类别中文名 */
const CATEGORY_ZH: Record<string, string> = {
  society: '社会',
  environment: '环境',
  economy: '经济',
  supernatural: '超自然',
  demographics: '人口',
  culturalFabric: '文化',
}

/**
 * 将 WorldTagsV2 格式化为 AI 可消费的叙事文本
 * 
 * 输出示例：
 * 【世界标签】
 * 社会：等级分明，群雄割据，城市为主，成文法，精英教育，宗族体系
 * 环境：天灾浩劫，灵气气候，神话地貌，资源丰富，生态极端，零污染
 * ...
 * 【叙事约束】
 * 硬性禁止：现代科技，未来科技
 * 叙事规则：科技决定论：所有现象必须可被科学解释
 */
export function formatWorldTagsText(tags: WorldTagsV2): string {
  const lines: string[] = ['【世界标签】']

  for (const [catKey, catZh] of Object.entries(CATEGORY_ZH)) {
    const cat = tags[catKey as keyof Omit<WorldTagsV2, 'worldview' | 'constraints'>]
    if (!cat || typeof cat !== 'object') continue

    const items = Object.entries(cat as unknown as Record<string, string>)
      .map(([key, value]) => translateTagValue(key, value))
      .filter(Boolean)

    if (items.length > 0) {
      lines.push(`${catZh}：${items.join('，')}`)
    }
  }

  // 约束层
  const c = tags.constraints
  if (c) {
    lines.push('')
    lines.push('【叙事约束】')
    if (c.hardForbidden.length > 0) {
      lines.push(`硬性禁止：${c.hardForbidden.map((v) => translateTagValue('constraints', v)).join('，')}`)
    }
    if (c.softForbidden.length > 0) {
      lines.push(`软性禁止：${c.softForbidden.map((v) => translateTagValue('constraints', v)).join('，')}`)
    }
    if (c.narrativeRules.length > 0) {
      lines.push(`叙事规则：${c.narrativeRules.join('；')}`)
    }
  }

  return lines.join('\n')
}