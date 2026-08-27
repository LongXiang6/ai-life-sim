/**
 * Purpose: Hold the curated preset-world catalog and its stable preset contracts.
 * Owner: mod-world / preset catalog.
 * Responsibility: Static preset definitions only; selectors and display options are delegated.
 */

export type WorldCategory =
  | 'cultivation'
  | 'western_fantasy'
  | 'eastern_fantasy'
  | 'scifi'
  | 'post_apocalyptic'
  | 'modern'
  | 'survival_horror'
  | 'mixed'

export interface PresetWorld {
  id: string
  name: string
  description: string
  worldviewId: 'materialist' | 'idealist' | 'survival_horror'
  category: WorldCategory
  summary: string
  era: string
  config: Record<string, unknown>
  races: string[]
  genders: string[]
  icon: string,
}

// ---- 6 个基础世界 ----

const BASE_WORLDS: PresetWorld[] = [
  {
    id: 'modern-earth',
    name: '现代地球',
    description: '2000年的现代世界，科技正在飞速发展，互联网初露锋芒。千禧年的钟声敲响，你将在这个充满机遇与挑战的时代体验一段独特的人生。',
    worldviewId: 'materialist',
    category: 'modern',
    summary: '现实世界的延伸，在日常生活中书写不平凡的故事',
    era: '公元2000年',
    config: { eraStartYear: 2000, },
    races: ['人类',],
    genders: ['男', '女',],
    icon: '🌍',
  },
  {
    id: 'wu-dao-world',
    name: '武道割据',
    description: `【世界总览】本界名武界，是纯粹的唯心世界：绝无灵气、魔力等任何外部自然能量，唯一力量来源是自身的意志——只要自身坚信力量就存在，世界原本有无该体系、他人是否相信均不影响自身力量成立。地形为无限大的超级大陆，立于无尽海之上，八阶强者也无法探索到尽头。专属模因"意志即力量"：凡人无法主动使用，唯有开始修炼才能触发激活。

【修炼逻辑与顺序】修炼必须按序而行，不可跨越、不可逆行。第一步入门：必须依靠功法才能开启修炼，功法品级仅是引子，决定能否入门与进阶的核心是天资、悟性与根骨；无资质者纵得无敌功法，到老死也无法入门，且凡人接触修炼知识极难，武道界极度保守排外。第二步玄关境：须先掌控自身血肉，共十重，每掌控一成血肉为一重，多数人穷其一生卡在此境。第三步觉醒心相：在玄关境期间须觉醒心相（越早觉醒，后期心相总量上限越高）；若未觉醒心相，玄关修满也只是凡人，绝不可踏入下一阶段。第四步踏入登天路：将心相转化为自身坚信的专属体系，方可迈入登天路一阶，成为凌驾亿万人的超级强者。

【核心能量：心相】心相是意志的具象化，如同许愿机能量。心相总量决定体系强度与上限；意志越强，修炼越快、心相恢复越快，心相不绝则战斗不息；越早觉醒，后期积累的心相总量越多。

【登天路与体系】踏入登天路的前提是选定专属体系。只要自身坚信，就能将心相彻底转化为任何体系——修仙、科技、魔法、变身皆可创造；同一本功法因信念不同，必练出天差地别的体系。

【境界划分与战力铁律】登天路每一阶全面碾压上一阶，绝不可能跨阶而战。玄关境：掌控血肉，共十重。登天路：每升一阶可觉醒新的自定义天赋——一至三阶每阶力量质变；四阶可扭曲代替区域规则，寿千年；五阶掌握规则、打穿维度前往其他寰宇，寿万年；六阶掌控绝对领域、无惧时间线变动，寿万万年；七阶触碰时间线，肆意扭曲定义时间；八阶不可思议，随意摧毁创造宇宙，是无尽寰宇的由来；九阶悖论存在，不可定义。

【势力与格局】大蔡王朝覆灭已逾千年，天下九洲武道割据，以一座座城池为基本单元各自为治，武者高高在上、普通人命如草芥。武界大陆宗门林立、极度保守，四阶为明面最强，五阶多打穿维度前往其他世界。武者群像：全员践行己道，世界显得疯癫；登天路万中无一，实力呈绝对金字塔。无尽寰宇：混沌海无限大，包含主神、梦魇空间等多元势力，八阶穷尽无限寿命也难相遇。诸天生态：登天路能无中生有不缺资源，但诸天不止此体系；高阶者无心干涉他人穿越或突破，皆在推演自身突破可能。`,
    worldviewId: 'idealist',
    category: 'cultivation',
    summary: '意志即力量：从血肉凡躯十重玄关，到悖论不可定义之境',
    era: '武道纪元1001年',
    config: {
      eraStartYear: 1001,
      powerFramework: {
        label: '意志武道·玄关与登天路',
        progression: 'bounded',
        ranks: [
          { label: '玄关境一重', description: '掌控自身血肉一成，肉身初蜕' },
          { label: '玄关境二重', description: '掌控血肉两成，气血充盈' },
          { label: '玄关境三重', description: '掌控血肉三成，筋骨坚韧' },
          { label: '玄关境四重', description: '掌控血肉四成，力贯全身' },
          { label: '玄关境五重', description: '掌控血肉五成，拳开金石' },
          { label: '玄关境六重', description: '掌控血肉六成，脏腑凝炼' },
          { label: '玄关境七重', description: '掌控血肉七成，脱胎换骨' },
          { label: '玄关境八重', description: '掌控血肉八成，肉身几近圆满' },
          { label: '玄关境九重', description: '掌控血肉九成，只差一线' },
          { label: '玄关境十重', description: '血肉尽掌，未觉醒心相终是凡人' },
          { label: '登天路一阶', description: '心相化为专属体系，凌驾亿万凡人' },
          { label: '登天路二阶', description: '专属体系稳固，力量质变' },
          { label: '登天路三阶', description: '力量再度质变，威震一域' },
          { label: '登天路四阶', description: '可扭曲代替区域规则，寿至千年' },
          { label: '登天路五阶', description: '掌握规则、打穿维度前往其他寰宇，寿至万年' },
          { label: '登天路六阶', description: '掌控绝对领域、无惧时间线变动，寿至万万年' },
          { label: '登天路七阶', description: '触碰时间线，肆意扭曲定义时间' },
          { label: '登天路八阶', description: '不可思议，随意摧毁创造宇宙，无尽寰宇的由来' },
          { label: '登天路九阶', description: '悖论存在，不可定义' },
        ],
      },
    },
    races: ['人类', '妖族', '灵兽', '半妖', '灵体',],
    genders: ['男', '女', '双性', '非二元',],
    icon: '⚔️',
  },
  {
    id: 'scp-foundation',
    name: 'SCP基金会',
    description: '这个世界表层是"常态"——物理法则、因果律、时间线性，看似坚固，实则脆弱。全球各地不断出现违背常理的异常：会自我复制的蛋糕、看见就会扭断脖子的雕像、让人陷入认知崩溃的数字。基金会为每一个已记录的收容物赋予SCP编号。休谟指数是衡量现实强度的单位，现实扭曲者拥有远高于周遭的休谟值，能以意志改写物理规则。',
    worldviewId: 'idealist',
    category: 'mixed',
    summary: '在常态与异常的夹缝中，守护人类文明的最后防线',
    era: '公元2000年',
    config: { eraStartYear: 2000, },
    races: ['人类', '异常实体', '半人半异常', '人造生命', '外星生命',],
    genders: ['男', '女', '无性别', '赛博生命体', '流性别',],
    icon: '📜',
  },
  {
    id: 'warhammer-40k',
    name: '战锤40K',
    description: '那是第41个千年，银河系正在燃烧。人类帝国已经存在了一万年，它是一个垂死的帝国，饱受内外敌人的折磨。帝皇坐在泰拉的黄金王座上，已经坐了一万年。银河中到处都是危险：混沌邪神的威胁从未消失，太空死灵正在苏醒，泰伦虫族吞噬一切生物。在这个黑暗的未来，只有战争。',
    worldviewId: 'idealist',
    category: 'post_apocalyptic',
    summary: '文明崩塌后的求生，在废土中重建秩序',
    era: '帝国历40999年',
    config: { eraStartYear: 40999, },
    races: ['人类', '灵能者', '机械义体人', '兽人', '钛族人',],
    genders: ['男', '女', '无性别', '改造人',],
    icon: '💀',
  },
  {
    id: 'cyberpunk-2077',
    name: '赛博朋克2077',
    description: '2077年的夜之城，一个位于美国西海岸的独立城邦。巨型企业掌控着一切——荒坂、军用科技、康陶等公司拥有自己的私人军队，凌驾于法律之上。义体改造已经成为常态，但过度改造会导致赛博精神病。夜之城是一座由霓虹灯光和全息广告照亮的城市，但在光鲜亮丽的表面下，是犯罪、腐败和贫困。',
    worldviewId: 'materialist',
    category: 'scifi',
    summary: '星际探索与科技文明，在宇宙中开辟人类新纪元',
    era: '公元2077年',
    config: { eraStartYear: 2077, },
    races: ['人类', '义体改造人', '数字生命', '克隆人', '仿生人',],
    genders: ['男', '女', '赛博生命体', '无性别', '跨性别',],
    icon: '🌃',
  },
  {
    id: 'harry-potter',
    name: '哈利波特',
    description: '1991年的英国，你收到了一封来自霍格沃茨魔法学校的录取通知书。原来，你是一名巫师。魔法世界隐藏在麻瓜世界的阴影中。对角巷是巫师们购物的地方，霍格沃茨是欧洲最著名的魔法学校。伏地魔，史上最危险的黑巫师，曾经试图征服魔法世界，但在1981年被婴儿哈利波特击败。',
    worldviewId: 'idealist',
    category: 'western_fantasy',
    summary: '魔法与剑的史诗，骑士、法师与龙的传奇',
    era: '公元1991年',
    config: { eraStartYear: 1991, },
    races: ['人类（巫师）', '人类（麻瓜）', '混血巫师', '妖精', '家养小精灵',],
    genders: ['男', '女',],
    icon: '✨',
  },
]

// ---- 18 个扩展世界 ----

const EXTENDED_WORLDS: PresetWorld[] = [
  {
    id: 'ancient-greece',
    name: '古希腊城邦',
    description: '雅典的民主在伯里克利的黄金时代达到顶峰，斯巴达的铁血战士磨刀霍霍。哲学、戏剧、奥林匹克——西方文明的摇篮正处在最辉煌的时期，但伯罗奔尼撒的战云已悄然聚集。苏格拉底在广场上追问真理，帕特农神庙的廊柱映着爱琴海的蔚蓝。',
    worldviewId: 'materialist',
    category: 'modern',
    summary: '现实世界的延伸，在日常生活中书写不平凡的故事',
    era: '公元前431年',
    config: { eraStartYear: -431, },
    races: ['人类',],
    genders: ['男', '女',],
    icon: '🏛️',
  },
  {
    id: 'roman-empire',
    name: '罗马帝国',
    description: '罗马的鹰旗飘扬在三大洲的上空，奥古斯都的 Pax Romana（罗马和平）正值巅峰。斗兽场中角斗士的呐喊、元老院里政治家的辩论、军团在边境的征伐——条条大路通罗马，而你就在这座永恒之城。',
    worldviewId: 'materialist',
    category: 'modern',
    summary: '现实世界的延伸，在日常生活中书写不平凡的故事',
    era: '罗马纪年870年',
    config: { eraStartYear: 870, },
    races: ['人类',],
    genders: ['男', '女',],
    icon: '🏟️',
  },
  {
    id: 'yongle-ming',
    name: '永乐大明',
    description: '明成祖朱棣迁都北京，紫禁城拔地而起。郑和的宝船舰队七下西洋，大明帝国的威望远播海外。《永乐大典》正在编纂，这是中华文明最自信的时代。',
    worldviewId: 'materialist',
    category: 'modern',
    summary: '现实世界的延伸，在日常生活中书写不平凡的故事',
    era: '永乐5年',
    config: { eraStartYear: 1407, },
    races: ['人类',],
    genders: ['男', '女',],
    icon: '🏯',
  },
  {
    id: 'ancient-egypt',
    name: '古埃及王朝',
    description: '尼罗河畔的金字塔矗立千年，法老的神权统治着这片肥沃的土地。神庙的祭司、沙漠中的商队、河畔的农夫——这里是人类文明最古老的源头之一。象形文字铭刻着生死的秘密，木乃伊等待着复活的黎明。',
    worldviewId: 'materialist',
    category: 'modern',
    summary: '现实世界的延伸，在日常生活中书写不平凡的故事',
    era: '法老纪年1250年',
    config: { eraStartYear: -1250, },
    races: ['人类',],
    genders: ['男', '女',],
    icon: '🏺',
  },
  {
    id: 'crusades',
    name: '十字军东征',
    description: '教皇乌尔班二世号召基督徒夺回圣地，第一次十字军东征席卷近东。骑士们身披十字，穿越千山万水，在圣城耶路撒冷的城墙下浴血奋战。信仰与贪婪交织，荣耀与暴行并存。',
    worldviewId: 'materialist',
    category: 'modern',
    summary: '现实世界的延伸，在日常生活中书写不平凡的故事',
    era: '公元1096年',
    config: { eraStartYear: 1096, },
    races: ['人类',],
    genders: ['男', '女',],
    icon: '✝️',
  },
  {
    id: 'warring-states',
    name: '战国争霸',
    description: '三家分晋，战国七雄并立。商鞅变法让秦国脱胎换骨，苏秦张仪纵横捭阖。这是一个礼崩乐坏却百家争鸣的时代，也是中国走向大一统的前夜。合纵连横，兵戈铁马，天下谁主沉浮？',
    worldviewId: 'materialist',
    category: 'modern',
    summary: '现实世界的延伸，在日常生活中书写不平凡的故事',
    era: '周纪年370年',
    config: { eraStartYear: -370, },
    races: ['人类',],
    genders: ['男', '女',],
    icon: '🏹',
  },
  {
    id: 'song-prosperity',
    name: '大宋风华',
    description: '北宋仁宗年间，汴京城繁华似锦。柳永的词唱遍勾栏瓦舍，范仲淹心怀天下。《清明上河图》中的盛世景象正在眼前——但西夏与辽国的威胁从未远离。这是一个文化极度繁荣的时代。',
    worldviewId: 'materialist',
    category: 'modern',
    summary: '现实世界的延伸，在日常生活中书写不平凡的故事',
    era: '大宋纪年80年',
    config: { eraStartYear: 1080, },
    races: ['人类',],
    genders: ['男', '女',],
    icon: '🏮',
  },
  {
    id: 'late-ming-crisis',
    name: '明末风云',
    description: '崇祯帝登基，大明王朝已千疮百孔。李自成在西北崛起，皇太极在关外虎视。天灾人祸交织，帝国的末日钟声已经敲响。在这个王朝末路的乱世中，每个人都要做出自己的选择。',
    worldviewId: 'materialist',
    category: 'modern',
    summary: '现实世界的延伸，在日常生活中书写不平凡的故事',
    era: '崇祯元年',
    config: { eraStartYear: 1628, },
    races: ['人类',],
    genders: ['男', '女',],
    icon: '🗡️',
  },
  {
    id: 'medieval-europe',
    name: '中世纪欧洲',
    description: '封建领主各自为政，教会的钟声统治着人们的精神世界。城堡与骑士、修道院与农庄、黑死病的阴影——中世纪的欧洲既是黑暗时代，也是新生文明在废墟中萌发的温床。',
    worldviewId: 'materialist',
    category: 'modern',
    summary: '现实世界的延伸，在日常生活中书写不平凡的故事',
    era: '公元1250年',
    config: { eraStartYear: 1250, },
    races: ['人类',],
    genders: ['男', '女',],
    icon: '🏰',
  },
  {
    id: 'maya-civilization',
    name: '玛雅文明',
    description: '尤卡坦半岛的热带雨林中，玛雅人建造了高耸的金字塔神庙。天文学家精确计算金星周期，书写着神秘的象形文字。城邦之间合纵连横，球赛的输赢有时决定一个王朝的命运。',
    worldviewId: 'materialist',
    category: 'modern',
    summary: '现实世界的延伸，在日常生活中书写不平凡的故事',
    era: '玛雅纪年600年',
    config: { eraStartYear: 600, },
    races: ['人类',],
    genders: ['男', '女',],
    icon: '🗿',
  },
  {
    id: 'sixteen-kingdoms',
    name: '五胡乱华',
    description: '西晋八王之乱后，匈奴、鲜卑、羯、氐、羌五胡涌入中原。北方大地陷入前所未有的动荡，汉人衣冠南渡。这是一个血腥的乱世，也是民族大融合的前奏。',
    worldviewId: 'materialist',
    category: 'modern',
    summary: '现实世界的延伸，在日常生活中书写不平凡的故事',
    era: '建兴纪年10年',
    config: { eraStartYear: 317, },
    races: ['人类',],
    genders: ['男', '女',],
    icon: '🐎',
  },
  {
    id: 'caribbean-pirates',
    name: '加勒比海盗',
    description: '拿骚港的海盗共和国正处在黄金时代。黑胡子、棉布杰克等传奇海盗横行加勒比海，西班牙宝藏船队是他们的猎物。朗姆酒、自由与冒险，吸引着每一个不甘平凡的灵魂。',
    worldviewId: 'materialist',
    category: 'modern',
    summary: '现实世界的延伸，在日常生活中书写不平凡的故事',
    era: '海盗纪年10年',
    config: { eraStartYear: 1718, },
    races: ['人类',],
    genders: ['男', '女', '双性',],
    icon: '🏴‍☠️',
  },
  {
    id: 'forbidden-palace',
    name: '朱门深宫',
    description: '大晟朝鼎盛之年，皇城朱墙巍峨，九重宫阙深锁无数女子的命运。入宫即是踏入无声的战场：圣心难测，妃嫔倾轧，皇子夺嫡，宦官弄权，朝臣博弈。一颦一笑皆算计，一步一行定生死。',
    worldviewId: 'materialist',
    category: 'modern',
    summary: '现实世界的延伸，在日常生活中书写不平凡的故事',
    era: '晟永元年',
    config: { eraStartYear: 1, },
    races: ['人类',],
    genders: ['男', '女', '男娘', '双性',],
    icon: '👑',
  },
  {
    id: 'douhun-continent',
    name: '斗魂大陆',
    description: '斗罗联邦统一大陆，魂导科技高度发达。人类扩张挤压魂兽生存空间，魂兽濒临灭绝。联邦、史莱克学院、唐门、传灵塔四大势力相互制衡。魂师修炼从魂士到封号斗罗共十阶，依靠魂环或人造魂灵进阶。',
    worldviewId: 'idealist',
    category: 'cultivation',
    summary: '踏入仙途，逆天改命，从凡人到仙人的修炼之路',
    era: '斗世历20000年',
    config: { eraStartYear: 20000, },
    races: ['人类', '魂兽', '半魂兽', '机械体', '异族',],
    genders: ['男', '女', '双性', '非二元',],
    icon: '💎',
  },
  {
    id: 'lord-of-rings',
    name: '中土世界',
    description: '托尔金笔下的中土世界，一个充满精灵、矮人、霍比特人、巫师和远古力量的奇幻大陆。至尊魔戒的传说仍在回响，黑暗领主索伦虽已覆灭，但邪恶从未真正消散。精灵即将西渡，人类的时代即将来临。',
    worldviewId: 'idealist',
    category: 'western_fantasy',
    summary: '魔法与剑的史诗，骑士、法师与龙的传奇',
    era: '第三纪元148年',
    config: { eraStartYear: 148, },
    races: ['人类', '精灵', '矮人', '霍比特人', '半精灵',],
    genders: ['男', '女',],
    icon: '💍',
  },
  {
    id: 'marvel-universe',
    name: '漫威宇宙',
    description: '一个由超级英雄和超级反派构成的宇宙。复仇者联盟、神盾局、X战警、银河护卫队……钢铁侠、美国队长、雷神、蜘蛛侠各路英雄在这个世界汇聚。灭霸的响指已经打响又逆转，时间线支离破碎。',
    worldviewId: 'idealist',
    category: 'western_fantasy',
    summary: '魔法与剑的史诗，骑士、法师与龙的传奇',
    era: '公元2000年',
    config: { eraStartYear: 2000, },
    races: ['人类', '变种人', '阿斯加德人', '外星人', '机械生命',],
    genders: ['男', '女', '无性别', '流性别',],
    icon: '🦸',
  },
  {
    id: 'elden-ring',
    name: '艾尔登法环',
    description: '黄金树的光芒已经黯淡，交界地的秩序崩塌。艾尔登法环碎裂，半神们争夺着大卢恩的碎片，褪色者们被赐福召回，在这片破碎的世界中挣扎求存。满月女王蕾娜菈、碎星将军薛克拉……无数势力在这片大陆上交织。',
    worldviewId: 'idealist',
    category: 'western_fantasy',
    summary: '魔法与剑的史诗，骑士、法师与龙的传奇',
    era: '交界地历元年',
    config: { eraStartYear: 1, },
    races: ['人类', '半神', '魔法师', '黄金树民', '褪色者',],
    genders: ['男', '女', '双性', '非二元',],
    icon: '🌳',
  },
  {
    id: 'battle-through-heavens',
    name: '斗气大陆',
    description: '斗气大陆，强者为尊。斗之气、斗者、斗师、大斗师、斗灵、斗王、斗皇、斗宗、斗尊、斗圣、斗帝——每一个境界都是一道鸿沟。药老沉睡于戒指之中，等待有缘人。纳兰嫣然退婚的羞辱还未洗刷，三年之约的诺言等待兑现。',
    worldviewId: 'idealist',
    category: 'cultivation',
    summary: '踏入仙途，逆天改命，从凡人到仙人的修炼之路',
    era: '斗气纪元元年',
    config: { eraStartYear: 1, },
    races: ['人类', '魔兽', '妖族', '灵魂体', '异火生灵',],
    genders: ['男', '女', '双性', '非二元',],
    icon: '🌋',
  },
  {
    id: 'backrooms',
    name: '后室',
    description: '如果你在不经意间从现实"卡出"，你将坠入后室——一个由潮湿地毯、泛黄墙纸和永不停歇的荧光灯嗡鸣构成的无限迷宫。后室由无数层级组成：Level 0是初始的潮湿走廊，越深入越危险。这里的物理规则诡异莫测，空间会自行重组。',
    worldviewId: 'survival_horror',
    category: 'survival_horror',
    summary: '黑暗中的未知恐惧，每一步都可能是最后一步',
    era: '公元2000年',
    config: { eraStartYear: 2000, },
    races: ['人类', '实体', '流浪者', '后室原住民',],
    genders: ['男', '女', '无性别', '薛定谔的性别',],
    icon: '🚪',
  },
]

// ---- 合并导出 ----

export const PRESET_WORLDS: PresetWorld[] = [...BASE_WORLDS, ...EXTENDED_WORLDS,]

