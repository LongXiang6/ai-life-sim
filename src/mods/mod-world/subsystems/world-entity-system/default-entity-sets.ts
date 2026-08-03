/**
 * Purpose: Provide curated offline entity sets keyed by world essence.
 * Owner: mod-world / world-entity.
 * Responsibility: Static fallback data only; no AI calls, Store writes, or runtime validation.
 */

export interface EntitySet {
  nations: Array<{ id: string; name: string; capital: string; stability: number; description: string }>
  factions: Array<{ id: string; name: string; factionType: 'military' | 'religious' | 'merchant' | 'academic' | 'political'; power: number; joinRequirement: string; description: string }>
  nobleHouses: Array<{ id: string; name: string; homeRegion: string; rank: 'duke' | 'marquis' | 'earl' | 'count' | 'baron'; influence: number; description: string }>
  settlements: Array<{ id: string; name: string; tier: 'village' | 'town' | 'city' | 'metropolis'; developmentLevel: number; description: string }>
  tradeRoutes: Array<{ id: string; name: string; fromSettlementId: string; toSettlementId: string; description: string }>
}

const XIANXIA_ENTITIES: EntitySet = {
  nations: [
    { id: 'nation-0', name: '天玄王朝', capital: '帝京', stability: 75, description: '统御九州千年的修仙帝国，皇族血脉传承上古道统' },
    { id: 'nation-1', name: '苍云古国', capital: '云都', stability: 60, description: '位于西北边陲的古老国度，以炼器术闻名天下' },
  ],
  factions: [
    { id: 'faction-0', name: '青云剑宗', factionType: 'military', power: 85, joinRequirement: '剑意入门，通过九重剑阁试炼', description: '天下第一剑修门派，镇守南疆妖域千年' },
    { id: 'faction-1', name: '丹霞阁', factionType: 'merchant', power: 55, joinRequirement: '通过炼丹基础考核，缴纳灵石一万', description: '垄断七成丹药贸易的商业联盟' },
    { id: 'faction-2', name: '太虚书院', factionType: 'academic', power: 40, joinRequirement: '通过入院考试，年龄不限', description: '藏书百万的修仙学府，号称算尽天机' },
  ],
  nobleHouses: [
    { id: 'noble-0', name: '龙家', homeRegion: '', rank: 'duke', influence: 90, description: '帝京第一世家，历代出过七位皇后' },
    { id: 'noble-1', name: '凤家', homeRegion: '', rank: 'marquis', influence: 75, description: '以医术和阵法闻名的古老世家' },
  ],
  settlements: [
    { id: 'settlement-0', name: '青石镇', tier: 'town', developmentLevel: 25, description: '灵脉余脉上的小镇，往来散修歇脚之处' },
    { id: 'settlement-1', name: '流云城', tier: 'city', developmentLevel: 70, description: '依山而建的修仙大城，云海中若隐若现' },
  ],
  tradeRoutes: [
    { id: 'trade-0', name: '灵脉商道', fromSettlementId: 'settlement-0', toSettlementId: 'settlement-1', description: '连接青石镇与流云城的灵石运输要道' },
  ],
}

const FANTASY_ENTITIES: EntitySet = {
  nations: [
    { id: 'nation-0', name: '艾泽兰王国', capital: '王冠城', stability: 70, description: '雄踞大陆中央的人类王国，狮鹫军团威名远扬' },
    { id: 'nation-1', name: '北境诸邦', capital: '霜石堡', stability: 55, description: '蛮族与矮人共治的北方联盟' },
  ],
  factions: [
    { id: 'faction-0', name: '晨光骑士团', factionType: 'military', power: 75, joinRequirement: '通过骑士试炼，宣誓七美德誓言', description: '守护圣光信仰的骑士修道会' },
    { id: 'faction-1', name: '秘法塔', factionType: 'academic', power: 60, joinRequirement: '魔力感知达到三级，通过学徒考核', description: '研究奥术的学术组织，藏有失传禁术' },
    { id: 'faction-2', name: '商人工会', factionType: 'merchant', power: 45, joinRequirement: '缴纳年费一千金币，有两名会员推荐', description: '控制大陆贸易命脉的商人联合体' },
  ],
  nobleHouses: [
    { id: 'noble-0', name: '狮鹫家族', homeRegion: '', rank: 'duke', influence: 85, description: '开国元勋后裔，世袭御前首相之职' },
    { id: 'noble-1', name: '银叶家族', homeRegion: '', rank: 'marquis', influence: 65, description: '掌握银叶森林的精灵混血贵族' },
  ],
  settlements: [
    { id: 'settlement-0', name: '边境村', tier: 'village', developmentLevel: 15, description: '王国最南端的农耕村庄' },
    { id: 'settlement-1', name: '王冠城', tier: 'metropolis', developmentLevel: 85, description: '大陆最繁华的都城，圣光大教堂所在地' },
  ],
  tradeRoutes: [
    { id: 'trade-0', name: '黄金商路', fromSettlementId: 'settlement-0', toSettlementId: 'settlement-1', description: '贯通南北的贸易干道，商队络绎不绝' },
  ],
}

const SCIFI_ENTITIES: EntitySet = {
  nations: [
    { id: 'nation-0', name: '星际联邦', capital: '地球', stability: 65, description: '以太阳系为核心的银河政治联合体' },
    { id: 'nation-1', name: '自由星系联盟', capital: '新坦率', stability: 45, description: '由独立殖民星系组成的松散联盟' },
  ],
  factions: [
    { id: 'faction-0', name: '星际矿业集团', factionType: 'merchant', power: 90, joinRequirement: '通过企业入职筛选，签署五年合同', description: '垄断银河系稀有矿藏开采的超级企业' },
    { id: 'faction-1', name: '舰队司令部', factionType: 'military', power: 80, joinRequirement: '通过军事学院考核，身体改造适应率 > 90%', description: '人类联合舰队的最高指挥机构' },
    { id: 'faction-2', name: '科研理事会', factionType: 'academic', power: 55, joinRequirement: '拥有博士学历，发表过三篇以上核心期刊', description: '管控前沿科技研究的学术机构' },
  ],
  nobleHouses: [],
  settlements: [
    { id: 'settlement-0', name: '空间站α', tier: 'city', developmentLevel: 90, description: '地球轨道上的巨型枢纽空间站' },
    { id: 'settlement-1', name: '火星殖民地', tier: 'town', developmentLevel: 60, description: '人类首个地外行星自治城市' },
  ],
  tradeRoutes: [
    { id: 'trade-0', name: '星际贸易航线', fromSettlementId: 'settlement-0', toSettlementId: 'settlement-1', description: '地球-火星常规跃迁航道' },
  ],
}

const POST_APOCALYPTIC_ENTITIES: EntitySet = {
  nations: [
    { id: 'nation-0', name: '新秩序军', capital: '铁堡', stability: 40, description: '从废墟中崛起的军事政权，试图重建文明秩序' },
  ],
  factions: [
    { id: 'faction-0', name: '掠夺者帮', factionType: 'military', power: 70, joinRequirement: '证明自己能守住一罐汽油', description: '荒野上最凶残的掠夺者联盟' },
    { id: 'faction-1', name: '废土商队', factionType: 'merchant', power: 50, joinRequirement: '自备武装车辆，通过商队长的信任考验', description: '穿梭于各据点之间的武装商队' },
  ],
  nobleHouses: [],
  settlements: [
    { id: 'settlement-0', name: '废土营地', tier: 'village', developmentLevel: 10, description: '由幸存者自发组建的简陋聚居点' },
    { id: 'settlement-1', name: '铁堡', tier: 'town', developmentLevel: 40, description: '拥有钢铁围墙的防御性城镇' },
  ],
  tradeRoutes: [
    { id: 'trade-0', name: '废土商路', fromSettlementId: 'settlement-0', toSettlementId: 'settlement-1', description: '废土商队踏出的危险贸易路线' },
  ],
}

const GENERIC_ENTITIES: EntitySet = {
  nations: [
    { id: 'nation-0', name: '大陆帝国', capital: '帝都', stability: 75, description: '统一大陆千年的中央帝国' },
    { id: 'nation-1', name: '北方联盟', capital: '联盟城', stability: 60, description: '由北方诸邦组成的军事同盟' },
  ],
  factions: [
    { id: 'faction-0', name: '光明教团', factionType: 'religious', power: 70, joinRequirement: '通过洗礼仪式，宣誓信仰誓言', description: '信奉光明的宗教组织，拥有广泛的信徒基础' },
    { id: 'faction-1', name: '暗影商会', factionType: 'merchant', power: 50, joinRequirement: '通过忠诚度测试，缴纳入会费', description: '掌控地下贸易网络的秘密商会' },
  ],
  nobleHouses: [
    { id: 'noble-0', name: '龙血世家', homeRegion: '', rank: 'duke', influence: 80, description: '远古龙裔血脉后裔，世袭帝国公爵' },
  ],
  settlements: [
    { id: 'settlement-0', name: '起始村', tier: 'village', developmentLevel: 15, description: '冒险者旅途开始的宁静村庄' },
    { id: 'settlement-1', name: '商港城', tier: 'city', developmentLevel: 70, description: '繁忙的港口贸易城市' },
  ],
  tradeRoutes: [
    { id: 'trade-0', name: '黄金商路', fromSettlementId: 'settlement-0', toSettlementId: 'settlement-1', description: '连接起始村与商港城的主要商道' },
  ],
}

const ENTITY_SETS: Record<string, EntitySet> = {
  cultivation: XIANXIA_ENTITIES,
  easternFantasy: XIANXIA_ENTITIES,
  medieval: FANTASY_ENTITIES,
  modern: SCIFI_ENTITIES,
  mythological: FANTASY_ENTITIES,
  postApocalyptic: POST_APOCALYPTIC_ENTITIES,
  scifi: SCIFI_ENTITIES,
  steampunk: FANTASY_ENTITIES,
  westernFantasy: FANTASY_ENTITIES,
  wuxia: {
    ...XIANXIA_ENTITIES,
    settlements: [
      { id: 'settlement-0', name: '江南小镇', tier: 'town', developmentLevel: 30, description: '宁静的江南水乡' },
      { id: 'settlement-1', name: '京城', tier: 'city', developmentLevel: 80, description: '繁华的帝国都城' },
    ],
  },
}

export function getDefaultEntitySet(essenceTag: string): EntitySet {
  return ENTITY_SETS[essenceTag] ?? GENERIC_ENTITIES
}
