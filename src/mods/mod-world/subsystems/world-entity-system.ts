/**
 * @module world-entity-system.ts
 * @description 具名实体生成子系统 —— 根据世界设定生成国家/势力/贵族/定居点/商路
 * @mod mod-world
 *
 * 当前阶段（B2.1）：降级默认实体列表按世界观标签分化。
 * B2.3+：如果已注入 AI 服务，调用 AI 生成，解析 JSON + 拼写容错。
 */

import type { SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import { BaseSubsystem, eventBus, saveStore } from '@/core'

import type { WorldConfig, AnyWorldEntity, RegionData, EntityCountRange } from '../types'

import { useWorldStore } from '../store'
import { worldEntityPrompt } from '../prompts'
import { parseAIJSON } from '../utils/parse-ai-json'
import {
  isWorldInitAIAvailable,
  shouldUseStaticEntityFallback,
} from '../utils/world-init-fallback'
import {
  buildCoherenceRetryHint,
  detectCoherenceViolations,
} from '../utils/world-coherence-output-guard'

/** 内部状态 */
interface InternalState {
  entities: AnyWorldEntity[],
}

// ==================== 降级实体：按世界观标签分化 ====================

interface EntitySet {
  nations: Array<{ id: string; name: string; capital: string; stability: number; population: number; description: string }>
  factions: Array<{ id: string; name: string; factionType: 'military' | 'religious' | 'merchant' | 'academic' | 'political'; power: number; joinRequirement: string; description: string }>
  nobleHouses: Array<{ id: string; name: string; homeRegion: string; rank: 'duke' | 'marquis' | 'earl' | 'count' | 'baron'; influence: number; description: string }>
  settlements: Array<{ id: string; name: string; tier: 'village' | 'town' | 'city' | 'metropolis'; population: number; developmentLevel: number; description: string }>
  tradeRoutes: Array<{ id: string; name: string; fromSettlementId: string; toSettlementId: string; description: string }>,
}

/** 仙侠/东方玄幻 — 王朝/仙门/世家体系 */
const XIANXIA_ENTITIES: EntitySet = {
  nations: [
    { id: 'nation-0', name: '天玄王朝', capital: '帝京', stability: 75, population: 10_000_000, description: '统御九州千年的修仙帝国，皇族血脉传承上古道统', },
    { id: 'nation-1', name: '苍云古国', capital: '云都', stability: 60, population: 4_000_000, description: '位于西北边陲的古老国度，以炼器术闻名天下', },
  ],
  factions: [
    { id: 'faction-0', name: '青云剑宗', factionType: 'military', power: 85, joinRequirement: '剑意入门，通过九重剑阁试炼', description: '天下第一剑修门派，镇守南疆妖域千年', },
    { id: 'faction-1', name: '丹霞阁', factionType: 'merchant', power: 55, joinRequirement: '通过炼丹基础考核，缴纳灵石一万', description: '垄断七成丹药贸易的商业联盟', },
    { id: 'faction-2', name: '太虚书院', factionType: 'academic', power: 40, joinRequirement: '通过入院考试，年龄不限', description: '藏书百万的修仙学府，号称算尽天机', },
  ],
  nobleHouses: [
    { id: 'noble-0', name: '龙家', homeRegion: '', rank: 'duke', influence: 90, description: '帝京第一世家，历代出过七位皇后', },
    { id: 'noble-1', name: '凤家', homeRegion: '', rank: 'marquis', influence: 75, description: '以医术和阵法闻名的古老世家', },
  ],
  settlements: [
    { id: 'settlement-0', name: '青石镇', tier: 'town', population: 3000, developmentLevel: 25, description: '灵脉余脉上的小镇，往来散修歇脚之处', },
    { id: 'settlement-1', name: '流云城', tier: 'city', population: 80000, developmentLevel: 70, description: '依山而建的修仙大城，云海中若隐若现', },
  ],
  tradeRoutes: [
    { id: 'trade-0', name: '灵脉商道', fromSettlementId: 'settlement-0', toSettlementId: 'settlement-1', description: '连接青石镇与流云城的灵石运输要道', },
  ],
}

/** 西方奇幻 — 王国/骑士团/法师塔/贵族领 */
const FANTASY_ENTITIES: EntitySet = {
  nations: [
    { id: 'nation-0', name: '艾泽兰王国', capital: '王冠城', stability: 70, population: 3_000_000, description: '雄踞大陆中央的人类王国，狮鹫军团威名远扬', },
    { id: 'nation-1', name: '北境诸邦', capital: '霜石堡', stability: 55, population: 1_500_000, description: '蛮族与矮人共治的北方联盟', },
  ],
  factions: [
    { id: 'faction-0', name: '晨光骑士团', factionType: 'military', power: 75, joinRequirement: '通过骑士试炼，宣誓七美德誓言', description: '守护圣光信仰的骑士修道会', },
    { id: 'faction-1', name: '秘法塔', factionType: 'academic', power: 60, joinRequirement: '魔力感知达到三级，通过学徒考核', description: '研究奥术的学术组织，藏有失传禁术', },
    { id: 'faction-2', name: '商人工会', factionType: 'merchant', power: 45, joinRequirement: '缴纳年费一千金币，有两名会员推荐', description: '控制大陆贸易命脉的商人联合体', },
  ],
  nobleHouses: [
    { id: 'noble-0', name: '狮鹫家族', homeRegion: '', rank: 'duke', influence: 85, description: '开国元勋后裔，世袭御前首相之职', },
    { id: 'noble-1', name: '银叶家族', homeRegion: '', rank: 'marquis', influence: 65, description: '掌握银叶森林的精灵混血贵族', },
  ],
  settlements: [
    { id: 'settlement-0', name: '边境村', tier: 'village', population: 800, developmentLevel: 15, description: '王国最南端的农耕村庄', },
    { id: 'settlement-1', name: '王冠城', tier: 'metropolis', population: 120000, developmentLevel: 85, description: '大陆最繁华的都城，圣光大教堂所在地', },
  ],
  tradeRoutes: [
    { id: 'trade-0', name: '黄金商路', fromSettlementId: 'settlement-0', toSettlementId: 'settlement-1', description: '贯通南北的贸易干道，商队络绎不绝', },
  ],
}

/** 科幻未来 — 星系联邦/巨企/舰队 */
const SCIFI_ENTITIES: EntitySet = {
  nations: [
    { id: 'nation-0', name: '星际联邦', capital: '地球', stability: 65, population: 5_000_000_000, description: '以太阳系为核心的银河政治联合体', },
    { id: 'nation-1', name: '自由星系联盟', capital: '新坦率', stability: 45, population: 800_000_000, description: '由独立殖民星系组成的松散联盟', },
  ],
  factions: [
    { id: 'faction-0', name: '星际矿业集团', factionType: 'merchant', power: 90, joinRequirement: '通过企业入职筛选，签署五年合同', description: '垄断银河系稀有矿藏开采的超级企业', },
    { id: 'faction-1', name: '舰队司令部', factionType: 'military', power: 80, joinRequirement: '通过军事学院考核，身体改造适应率 > 90%', description: '人类联合舰队的最高指挥机构', },
    { id: 'faction-2', name: '科研理事会', factionType: 'academic', power: 55, joinRequirement: '拥有博士学历，发表过三篇以上核心期刊', description: '管控前沿科技研究的学术机构', },
  ],
  nobleHouses: [],
  settlements: [
    { id: 'settlement-0', name: '空间站α', tier: 'city', population: 50000, developmentLevel: 90, description: '地球轨道上的巨型枢纽空间站', },
    { id: 'settlement-1', name: '火星殖民地', tier: 'town', population: 20000, developmentLevel: 60, description: '人类首个地外行星自治城市', },
  ],
  tradeRoutes: [
    { id: 'trade-0', name: '星际贸易航线', fromSettlementId: 'settlement-0', toSettlementId: 'settlement-1', description: '地球-火星常规跃迁航道', },
  ],
}

/** 末日废土 — 聚居地/掠夺者/商队 */
const POST_APOCALYPTIC_ENTITIES: EntitySet = {
  nations: [
    { id: 'nation-0', name: '新秩序军', capital: '铁堡', stability: 40, population: 500_000, description: '从废墟中崛起的军事政权，试图重建文明秩序', },
  ],
  factions: [
    { id: 'faction-0', name: '掠夺者帮', factionType: 'military', power: 70, joinRequirement: '证明自己能守住一罐汽油', description: '荒野上最凶残的掠夺者联盟', },
    { id: 'faction-1', name: '废土商队', factionType: 'merchant', power: 50, joinRequirement: '自备武装车辆，通过商队长的信任考验', description: '穿梭于各据点之间的武装商队', },
  ],
  nobleHouses: [],
  settlements: [
    { id: 'settlement-0', name: '废土营地', tier: 'village', population: 200, developmentLevel: 10, description: '由幸存者自发组建的简陋聚居点', },
    { id: 'settlement-1', name: '铁堡', tier: 'town', population: 15000, developmentLevel: 40, description: '拥有钢铁围墙的防御性城镇', },
  ],
  tradeRoutes: [
    { id: 'trade-0', name: '废土商路', fromSettlementId: 'settlement-0', toSettlementId: 'settlement-1', description: '废土商队踏出的危险贸易路线', },
  ],
}

/** 默认通用（fallback of fallback） */
const GENERIC_ENTITIES: EntitySet = {
  nations: [
    { id: 'nation-0', name: '大陆帝国', capital: '帝都', stability: 75, population: 5_000_000, description: '统一大陆千年的中央帝国', },
    { id: 'nation-1', name: '北方联盟', capital: '联盟城', stability: 60, population: 2_000_000, description: '由北方诸邦组成的军事同盟', },
  ],
  factions: [
    { id: 'faction-0', name: '光明教团', factionType: 'religious', power: 70, joinRequirement: '通过洗礼仪式，宣誓信仰誓言', description: '信奉光明的宗教组织，拥有广泛的信徒基础', },
    { id: 'faction-1', name: '暗影商会', factionType: 'merchant', power: 50, joinRequirement: '通过忠诚度测试，缴纳入会费', description: '掌控地下贸易网络的秘密商会', },
  ],
  nobleHouses: [
    { id: 'noble-0', name: '龙血世家', homeRegion: '', rank: 'duke', influence: 80, description: '远古龙裔血脉后裔，世袭帝国公爵', },
  ],
  settlements: [
    { id: 'settlement-0', name: '起始村', tier: 'village', population: 500, developmentLevel: 15, description: '冒险者旅途开始的宁静村庄', },
    { id: 'settlement-1', name: '商港城', tier: 'city', population: 50000, developmentLevel: 70, description: '繁忙的港口贸易城市', },
  ],
  tradeRoutes: [
    { id: 'trade-0', name: '黄金商路', fromSettlementId: 'settlement-0', toSettlementId: 'settlement-1', description: '连接起始村与商港城的主要商道', },
  ],
}

/** essenceTag → EntitySet 映射 */
const ENTITY_SETS: Record<string, EntitySet> = {
  cultivation: XIANXIA_ENTITIES,
  easternFantasy: XIANXIA_ENTITIES,
  wuxia: {
    ...XIANXIA_ENTITIES,
    settlements: [
      { id: 'settlement-0', name: '江南小镇', tier: 'town', population: 5000, developmentLevel: 30, description: '宁静的江南水乡' },
      { id: 'settlement-1', name: '京城', tier: 'city', population: 200000, developmentLevel: 80, description: '繁华的帝国都城' },
    ],
  },
  westernFantasy: FANTASY_ENTITIES,
  medieval: FANTASY_ENTITIES,
  mythological: FANTASY_ENTITIES,
  scifi: SCIFI_ENTITIES,
  postApocalyptic: POST_APOCALYPTIC_ENTITIES,
  modern: SCIFI_ENTITIES,
  steampunk: FANTASY_ENTITIES,
}

export class WorldEntitySystem extends BaseSubsystem {
  readonly id = 'world-entity' as const
  readonly mod = 'mod-world' as const
  readonly label = '具名实体生成' as const
  readonly description = '生成世界的国家、势力、贵族世家、定居点和商路' as const

  private state: InternalState = { entities: [] }
  private regions: RegionData[] = []

  /** AI 服务函数 */
  private callAI: ((prompt: string, extraUserMessages?: string[]) => Promise<string>) | null = null

  /** 世界名称（用于 AI prompt） */
  private worldName: string = ''

  /** 世界描述（用于 AI prompt） */
  private worldDescription: string = ''
  private civilizationStage: string = ''
  private coherenceHint: string = ''
  private coherenceNote: string = ''
  private worldType: string = 'idealist'
  private worldTags: string = ''
  private calibrationSummary: string = ''
  private entityRanges: string = ''
  private mapRegions: string = ''

  // ========== AI 服务注入 ==========

  setAIService(callAI: (prompt: string, extraUserMessages?: string[]) => Promise<string>): void {
    this.callAI = callAI
  }

  /** 注入世界名称与描述（AI 生成实体时使用） */
  setWorldContext(
    name: string,
    description: string,
    civilizationStage?: string,
    coherenceHint?: string,
    coherenceNote?: string,
    worldType?: string,
    worldTags?: string,
    calibrationSummary?: string,
    entityRanges?: string,
    mapRegions?: string,
  ): void {
    this.worldName = name
    this.worldDescription = description
    this.civilizationStage = civilizationStage ?? ''
    this.coherenceHint = coherenceHint ?? ''
    this.coherenceNote = coherenceNote ?? ''
    this.worldType = worldType ?? 'idealist'
    this.worldTags = worldTags ?? ''
    this.calibrationSummary = calibrationSummary ?? ''
    this.entityRanges = entityRanges ?? ''
    this.mapRegions = mapRegions ?? ''
  }

  hasAIService(): boolean {
    return this.callAI !== null
  }

  // ========== 区域注入 ==========

  setRegions(regions: RegionData[]): void {
    this.regions = regions
  }

  getRegions(): RegionData[] {
    return this.regions
  }

  /** 校验 AI 返回的 regionId，无效则按序号回退 */
  private resolveRegionId(
    regionId: string | undefined,
    fallbackIndex: number,
  ): string {
    if (!this.regions.length) return ''
    if (regionId && this.regions.some((r) => r.id === regionId)) return regionId
    return this.regions[fallbackIndex % this.regions.length].id
  }

  // ========== 实体生成 ==========

  /**
   * 生成具名实体
   *
   * B2.1：根据 config.essenceTag 选择对应的降级实体集，按区域分布分配 regionId
   * B2.3+：如果已注入 AI 服务，调用 AI 生成，解析 JSON + 拼写容错
   *
   * 实体→区域 绑定策略：
   * - settlement：均匀分配到所有区域（按序号循环）
   * - nation：分配到人口最多的区域
   * - faction：分散到不同区域
   * - nobleHouse：分配到区域的定居点
   * - tradeRoute：关联到已分配 regionId 的 settlement
   */
  /** 按校准范围截取实体列表 */
  private sliceEntitySet<T>(items: T[], range: EntityCountRange | undefined, fallbackLen: number): T[] {
    if (!range) return items.slice(0, fallbackLen)
    const count = Math.max(range.min, Math.min(range.max, items.length))
    return items.slice(0, count)
  }

  async generateEntities(config: WorldConfig): Promise<AnyWorldEntity[]> {
    if (this.callAI && this.worldName) {
      try {
        const aiEntities = await this.generateEntitiesAI(config)
        if (aiEntities && aiEntities.length > 0) {
          this.state.entities = aiEntities
          eventBus.emit('mod-world:entities-generated', aiEntities)
          useWorldStore.getState().setEntities(aiEntities)
          this.state.entities = structuredClone(useWorldStore.getState().entities)
          return this.state.entities
        }
      } catch {
        // AI 调用失败
      }
      if (isWorldInitAIAvailable()) {
        return []
      }
    }

    if (!shouldUseStaticEntityFallback()) {
      return []
    }

    // 离线兜底：仅无 API Key 时使用硬编码实体集
    const set = ENTITY_SETS[config.essenceTag] ?? GENERIC_ENTITIES
    const cal = useWorldStore.getState().calibration
    const trimmedSet: EntitySet = {
      nations: this.sliceEntitySet(set.nations, cal?.entities?.nationCount, set.nations.length),
      factions: this.sliceEntitySet(set.factions, cal?.entities?.factionCount, set.factions.length),
      nobleHouses: this.sliceEntitySet(set.nobleHouses, cal?.entities?.nobleHouseCount, set.nobleHouses.length),
      settlements: this.sliceEntitySet(set.settlements, cal?.entities?.settlementCount, set.settlements.length),
      tradeRoutes: this.sliceEntitySet(set.tradeRoutes, cal?.entities?.tradeRouteCount, set.tradeRoutes.length),
    }
    const regionCount = this.regions.length

    if (regionCount === 0) {
      const entities = this.flattenEntitySet(trimmedSet)
      this.state.entities = entities
      return entities
    }

    const sortedRegionIndices = this.regions
      .map((r, i) => ({ index: i, population: r.population, }))
      .sort((a, b) => b.population - a.population)

    const assignedSettlementIds: string[] = []
    const settlementEntities = trimmedSet.settlements.map((s, i) => ({
      ...s,
      type: 'settlement' as const,
      regionId: this.regions[i % regionCount].id,
      attributes: {} as Record<string, unknown>,
    }))
    assignedSettlementIds.push(...settlementEntities.map((s) => s.id))

    const nationEntities = trimmedSet.nations.map((n, i) => ({
      ...n,
      type: 'nation' as const,
      regionId: sortedRegionIndices[i % sortedRegionIndices.length]?.index !== undefined
        ? this.regions[sortedRegionIndices[i % sortedRegionIndices.length].index].id
        : this.regions[0]?.id ?? '',
      attributes: {} as Record<string, unknown>,
    }))

    const factionEntities = trimmedSet.factions.map((f, i) => ({
      ...f,
      type: 'faction' as const,
      regionId: this.regions[i % regionCount].id,
      influenceRegionIds: [] as string[],
      attributes: {} as Record<string, unknown>,
    }))

    const nobleHouseEntities = trimmedSet.nobleHouses.map((h, i) => ({
      ...h,
      type: 'nobleHouse' as const,
      regionId: this.regions[i % regionCount].id,
      attributes: {} as Record<string, unknown>,
    }))

    const tradeRouteEntities = trimmedSet.tradeRoutes.map((r) => ({
      ...r,
      type: 'tradeRoute' as const,
      regionId: '',
      prosperity: 60,
      attributes: {} as Record<string, unknown>,
    }))

    const entities: AnyWorldEntity[] = [
      ...nationEntities,
      ...factionEntities,
      ...nobleHouseEntities,
      ...settlementEntities,
      ...tradeRouteEntities,
    ]

    this.state.entities = entities
    eventBus.emit('mod-world:entities-generated', entities)
    useWorldStore.getState().setEntities(entities)
    this.state.entities = structuredClone(useWorldStore.getState().entities)
    return this.state.entities
  }

  /**
   * AI 生成实体（B2.3+）
   */
  private async generateEntitiesAI(config: WorldConfig): Promise<AnyWorldEntity[] | null> {
    if (!this.callAI) return null

    const hasExisting = this.state.entities.length > 0
    const existingContent = hasExisting
      ? `已存在的实体（请与之协调，避免重复）：\n${this.state.entities.map((e) => `- ${e.name}（${e.type}）`).join('\n')}`
      : ''

    let prompt = worldEntityPrompt.userPromptTemplate
      .replace('{{worldName}}', this.worldName)
      .replace('{{essenceTag}}', config.essenceTag)
      .replace('{{powerSystemTag}}', config.powerSystemTag)
      .replace('{{civilizationStage}}', config.civilizationStage || this.civilizationStage)
      .replace('{{spatialForm}}', config.spatialForm)
      .replace('{{worldDescription}}', this.worldDescription)
      .replace('{{coherenceHint}}', this.coherenceHint)
      .replace('{{coherenceNote}}', this.coherenceNote)
      .replace('{{worldType}}', this.worldType)
      .replace('{{worldTags}}', this.worldTags)
      .replace('{{calibrationSummary}}', this.calibrationSummary)
      .replace('{{entityRanges}}', this.entityRanges)
      .replace('{{mapRegions}}', this.mapRegions)
      .replace('{{existingEntities}}', existingContent)
    prompt = prompt.replace(/\{\{#if \w+\}\}[\s\S]*?\{\{\/if\}\}/g, '')

    const guardCtx = {
      worldDescription: this.worldDescription,
      worldType: this.worldType,
    }

    try {
      let response = ''
      let retryHint = ''

      for (let attempt = 0; attempt < 2; attempt++) {
        response = await this.callAI!(
          prompt,
          retryHint ? [retryHint] : undefined,
        )
        if (!response || response.trim() === '' || response.trim() === '无') {
          return null
        }

        const violations = detectCoherenceViolations(response, guardCtx)
        if (violations.length > 0 && attempt === 0) {
          console.warn(`[mod-world] 实体 AI 输出含禁词 ${violations.join('、')}，重试`)
          retryHint = buildCoherenceRetryHint(violations)
          continue
        }
        break
      }

      // 解析 JSON
      const parsed = parseAIJSON<{
        systemApplicability?: Partial<Record<'nations' | 'factions' | 'nobleHouses' | 'settlements' | 'tradeRoutes', boolean>>
        nations: Array<{ name: string; capital: string; stability: number; population: number; regionId?: string; description: string }>
        factions: Array<{ name: string; factionType: string; power: number; regionId?: string; description: string; joinRequirement: string }>
        nobleHouses: Array<{ name: string; rank: string; influence: number; regionId?: string; description: string }>
        settlements: Array<{ name: string; tier: string; population: number; developmentLevel: number; regionId?: string; description: string }>
        tradeRoutes: Array<{ name: string; fromSettlementId: string; toSettlementId: string; prosperity: number }>,
        nobles?: Array<{ name: string; rank: string; influence: number; regionId?: string; description: string }>,
      }>(response)
      if (!parsed) return null

      const applicability = parsed.systemApplicability
      const layerEnabled = (key: keyof NonNullable<typeof applicability>): boolean =>
        applicability?.[key] !== false

      // 拼写容错：nobleHouses / nobles（来源废案 parseEntityResponse）
      const nobleHouses = layerEnabled('nobleHouses')
        ? (Array.isArray(parsed.nobleHouses) ? parsed.nobleHouses
          : Array.isArray(parsed.nobles) ? parsed.nobles
          : [])
        : []

      const entities: AnyWorldEntity[] = []

      // 转换 nations
      if (layerEnabled('nations') && Array.isArray(parsed.nations)) {
        for (const n of parsed.nations) {
          entities.push({
            id: `nation-ai-${entities.length}`,
            name: n.name,
            type: 'nation',
            capital: n.capital ?? '',
            stability: n.stability ?? 50,
            population: n.population ?? 1000000,
            description: n.description ?? '',
            regionId: this.resolveRegionId(n.regionId, entities.length),
            attributes: {},
          })
        }
      }

      // 转换 factions
      if (layerEnabled('factions') && Array.isArray(parsed.factions)) {
        for (const f of parsed.factions) {
          entities.push({
            id: `faction-ai-${entities.length}`,
            name: f.name,
            type: 'faction',
            factionType: (f.factionType ?? 'political') as 'military' | 'religious' | 'merchant' | 'academic' | 'political',
            power: f.power ?? 50,
            influenceRegionIds: [],
            joinRequirement: f.joinRequirement ?? '',
            description: f.description ?? '',
            regionId: this.resolveRegionId(f.regionId, entities.length),
            attributes: {},
          })
        }
      }

      // 转换 nobleHouses（使用容错后的数组）
      for (const h of nobleHouses) {
        entities.push({
          id: `noble-ai-${entities.length}`,
          name: h.name,
          type: 'nobleHouse',
          homeRegion: '',
          rank: (h.rank ?? 'count') as 'duke' | 'marquis' | 'earl' | 'count' | 'baron',
          influence: h.influence ?? 50,
          description: h.description ?? '',
          regionId: this.resolveRegionId(h.regionId, entities.length),
          attributes: {},
        })
      }

      // 转换 settlements
      if (layerEnabled('settlements') && Array.isArray(parsed.settlements)) {
        for (const s of parsed.settlements) {
          entities.push({
            id: `settlement-ai-${entities.length}`,
            name: s.name,
            type: 'settlement',
            tier: (s.tier ?? 'town') as 'village' | 'town' | 'city' | 'metropolis',
            population: s.population ?? 5000,
            developmentLevel: s.developmentLevel ?? 30,
            description: s.description ?? '',
            regionId: this.resolveRegionId(s.regionId, entities.length),
            attributes: {},
          })
        }
      }

      // 转换 tradeRoutes
      if (layerEnabled('tradeRoutes') && Array.isArray(parsed.tradeRoutes)) {
        for (const t of parsed.tradeRoutes) {
          entities.push({
            id: `trade-ai-${entities.length}`,
            name: t.name,
            type: 'tradeRoute',
            fromSettlementId: t.fromSettlementId ?? '',
            toSettlementId: t.toSettlementId ?? '',
            prosperity: t.prosperity ?? 60,
            description: '',
            regionId: '',
            attributes: {},
          })
        }
      }

      return entities.length > 0 ? entities : null
    } catch {
      return null
    }
  }

  /** 平铺 EntitySet 为 Array<AnyWorldEntity>（无区域绑定时用） */
  private flattenEntitySet(set: EntitySet): AnyWorldEntity[] {
    const result: AnyWorldEntity[] = [
      ...set.nations.map((n) => ({ ...n, type: 'nation' as const, regionId: '', attributes: {} as Record<string, unknown>, })),
      ...set.factions.map((f) => ({ ...f, type: 'faction' as const, regionId: '', influenceRegionIds: [] as string[], attributes: {} as Record<string, unknown>, })),
      ...set.nobleHouses.map((h) => ({ ...h, type: 'nobleHouse' as const, regionId: '', attributes: {} as Record<string, unknown>, })),
      ...set.settlements.map((s) => ({ ...s, type: 'settlement' as const, regionId: '', attributes: {} as Record<string, unknown>, })),
      ...set.tradeRoutes.map((r) => ({ ...r, type: 'tradeRoute' as const, regionId: '', prosperity: 60, attributes: {} as Record<string, unknown>, })),
    ]
    return result
  }

  /** 获取所有实体 */
  getEntities(): AnyWorldEntity[] {
    const state = useWorldStore.getState()
    const instance = state.currentContextId ? state.contexts[state.currentContextId] : undefined
    return structuredClone(instance?.entities ?? this.state.entities)
  }

  /** 按类型筛选实体 */
  getEntitiesByType<T extends AnyWorldEntity>(type: T['type']): T[] {
    return this.getEntities().filter((e) => e.type === type) as T[]
  }

  // ========== 持久化 ==========

  saveEntities(worldCode: number): void {
    if (typeof window === 'undefined') return
    try {
      saveStore.set('mod-world', 0, `entities:${worldCode}`, this.state.entities)
    } catch (error) { console.warn('world-entity: 实体数据写入失败', error) }
  }

  async loadEntities(worldCode: number): Promise<AnyWorldEntity[]> {
    if (typeof window === 'undefined') return []
    try {
      const entities = saveStore.get<AnyWorldEntity[]>('mod-world', 0, `entities:${worldCode}`)
      if (!entities) return []
      this.state.entities = entities
      return entities
    } catch {
      return []
    }
  }

  // ========== ISubSystem 接口 ==========

  collectState(context: RoundContext): SubSystemState {
    const instance = useWorldStore.getState().contexts[context.contextId]
    const entities = instance?.entities ?? this.state.entities
    const count = entities.length
    const summary = count > 0
      ? `实体：${count} 个（${entities.filter((e) => e.type === 'nation').length} 国家，${entities.filter((e) => e.type === 'faction').length} 势力，${entities.filter((e) => e.type === 'settlement').length} 定居点）`
      : ''
    return {
      id: this.id,
      summary,
      data: { contextId: context.contextId, entities: structuredClone(entities) },
    }
  }

  applyChanges(changes: SubSystemChanges, context: RoundContext): void {
    if (!changes || typeof changes !== 'object') {
      throw new Error(`[${this.id}] Invalid changes`);
    }
    if (changes.id !== this.id) {
      throw new Error(`[${this.id}] Changes ID mismatch`);
    }
    if (!changes.changes || typeof changes.changes !== 'object') {
      throw new Error(`[${this.id}] Invalid changes.changes`);
    }
    if (!changes.description || changes.description.trim() === '') {
      throw new Error(`[${this.id}] Missing changes.description`);
    }
    void context;
    // 实体是初始化时生成的，不接受运行时变更
  }

  reset(): void {
    this.state = { entities: [], }
    this.regions = []
    this.callAI = null
    this.worldName = ''
    this.worldDescription = ''
  }

  /** 将世界初始化流程写入 Store 的实体同步到叙事运行时单例。 */
  hydrateFromStore(): void {
    this.restoreCollectedState({ entities: useWorldStore.getState().entities })
  }

  /** 从 orchestrator collectState().data 恢复实体权威。 */
  restoreCollectedState(snapshot: unknown): void {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return
    const entities = (snapshot as { entities?: unknown }).entities
    if (!Array.isArray(entities)) return
    this.state = { entities: structuredClone(entities) as AnyWorldEntity[] }
    useWorldStore.getState().setEntities(this.state.entities)
  }
}

let runtimeWorldEntitySystem: WorldEntitySystem | undefined

/** Loader 与叙事引擎共享的懒加载实体单例。 */
export function getWorldEntitySystem(): WorldEntitySystem {
  runtimeWorldEntitySystem ??= new WorldEntitySystem()
  return runtimeWorldEntitySystem
}
