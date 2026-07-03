/**
 * @module destiny-pattern-prompt.ts
 * @description 命格 AI 生成 Prompt —— 示例驱动纯文本 system prompt，分批生成 20 条/批
 * @mod mod-character
 */

import type { PromptTemplate } from '@/foundation'

import { z } from 'zod'

const DESTINY_PATTERN_SYSTEM_PROMPT = `你是命格、天赋与特质生成器。根据世界观和角色信息，生成 20 条命格、天赋或特质。
输出格式：{"patterns":[{...},...]}，每条一行紧凑 JSON，不格式美化、不 markdown 代码块。

/*
字段: name(2-8字) rarity polarity description(50-120汉字,微叙事体:①具体倾向/场景→②内心感悟→③一句话收束;写先天倾向不说既定事实) effect(≥10字定性) attrBonus systemModifiers(仅rare+可选,系数微调乘法1.0=不变)
属性上限: common±1单属 fine±2或双±1 rare≤3(1-2属) epic≤5(1-3属) legendary≤7(1-3属)
common/fine禁systemModifiers rare+可选1-2个 仅输出非零属性禁physique:0
systemModifier可用字段(仅下列,禁止自编): luckPointModifier(气运获取) hpRecoveryModifier(生命恢复) staminaRecoveryModifier(体力恢复) breakthroughChanceModifier(寿命突破) cultivationSpeedModifier(修炼/战力成长) bottleneckModifier(修炼瓶颈) incomeModifier(职业收入) fertilityModifier(家族生育) devotionGainModifier(虔诚获取) lifespanModifier(寿命上限) attributeDecayModifier(属性衰减)
*/

// 示例覆盖不同世界观×5级×3极性×全属性×全系统字段，均为可生成的标准写法:

// 现代都市 — common 三种极性
{"patterns":[
{"name":"重力记忆","description":"身体与重力的关系异于所有人。第一次踩上滑板教练还在讲安全守则已经从坡顶飘了下去，旁人摔得七荤八素却能平稳穿过——没人相信你没练过，但你只是听懂了引力。任何需要身体重新适应重力的运动，天生就顺得像做过千百遍。","rarity":"common","effect":"平衡感和身体协调力极强","polarity":"positive","attrBonus":{"physique":1}},
{"name":"方向失语","description":"东南西北四个字在认知里从来不是方位，是同一种颜色。站到熟悉的街角突然觉得世界被翻了一面，路牌上的箭头全指向同一个方向；不是迷路，是大脑拒绝把空间翻译成文字。也因此练出了绝佳的情景记忆——不靠路名，靠路边那棵歪脖子树的形状和转角面包店飘来的焦糖味。","rarity":"common","effect":"方向感极差但情景记忆惊人","polarity":"negative","attrBonus":{"mind":-1}},
{"name":"熵增恐惧","description":"看到一份歪斜的文件摆在那里，不是觉得乱了——是觉得宇宙在朝那一角塌陷。书桌须按色谱排列，衣柜间隔必须均等，因为无序在眼中会自主扩散、像墨水渗进清水；唯一阻止它的方式是用精度封印。交出的每件事都近乎完美，但比旁人多花一倍时间。","rarity":"common","effect":"完成质量高但速度偏慢","polarity":"mixed","attrBonus":{}}
]}

// 星际科幻 — fine 全部 attrBonus 组合 + rare 概念挪借对照
{"patterns":[
{"name":"语义穿透","description":"第一次听到异星语言的时候没有慌张——听懂了。语法在脑子里自己拆成骨架，词汇顺着骨架爬进去排好了队；翻译芯片、语义矩阵、外交官的全套装备，不过是把你一直在做的事起了个名字。人话、代码、鲸歌，在认知皮层上是同一种材料。","rarity":"fine","effect":"跨语言与代码沟通天赋卓越","polarity":"positive","attrBonus":{"charisma":1,"talentAptitude":1}},
{"name":"射线抗体真空","description":"细胞核的辐射修复通道天生缺失一个关键开关，微量电离辐射就能引发链式凋亡；别人晒太阳是补钙，晒太阳是给自己判缓刑。星际移民时代，这份体质是所有职业体检表上的第一道红灯。","rarity":"fine","effect":"极易受辐射伤害，必须生活在屏蔽区","polarity":"negative","attrBonus":{"physique":-2}},
{"name":"信任延迟","description":"人际信任需要漫长的缓冲下载。初见时别人已经寒暄到第三轮你还在沉默地评估这段对话是否值得，但一旦连接建立，就能在众声喧哗中听出别人永远漏掉的低频信号，给出的回应精准得像手术刀。慢热的人多，能把沉默转化成洞察力的，万中无一。","rarity":"fine","effect":"初期社交慢热，熟悉后展现深度","polarity":"mixed","attrBonus":{"charisma":-1,"mind":1}},
{"name":"价值共振","description":"价格不是数字，是形状。看一眼屏幕上的波动就能摸到它的曲率，预判下一拍的拐点——不是分析，是感官自己完成了卷积运算。稀有矿产的涨跌、航线政策的风向，在脑海中自动排成价值等高线，如同大提琴的泛音一般清晰。市场在你面前是透明的。","rarity":"rare","effect":"投资眼光精准，星际交易中总是占优","polarity":"positive","attrBonus":{"resources":2,"mind":1}}
]}

// 仙侠修真 — rare/epic/legendary 全叙事体 + systemModifiers
{"patterns":[
{"name":"代价守恒","description":"每次冲关都是硬烧——瓶颈如同熔点为常人数倍的合金，旁人三日破关须多熬整周。但一旦熔穿，那道壁垒便永久消失，不像旁人随时可能回退。不是慢，是浇筑。根基的密度是以煎熬作价买的，但买定离手，永不退货。","rarity":"rare","effect":"修炼瓶颈更难突破，但成功后的根基极其稳固","polarity":"mixed","attrBonus":{"talentAptitude":1,"physique":-1},"systemModifiers":{"bottleneckModifier":0.92,"attributeDecayModifier":1.08}},
{"name":"社交引力","description":"不是故意成为中心。是每次聚在一起，话题绕完一圈之后总会回到你身上——不是你在引导，是共识在绕着你旋转，像行星不自知地被重物弯曲了轨道。不一定是话说得最多的，但开口时所有人静下来的那一瞬千年难遇。","rarity":"epic","effect":"人脉广博，易成为核心人物","polarity":"positive","attrBonus":{"charisma":3,"resources":1,"mind":1},"systemModifiers":{"luckPointModifier":1.08,"incomeModifier":1.05}},
{"name":"概率偏斜","description":"别人翻古籍翻到眼底充血才寻得的机缘，你打个哈欠就从书架上掉下来一本——翻开的那一页。走投无路时恰好有前辈路过，濒死关头总有意外转机；不是运气，是你与命运签的默认协议比别人多了一条隐形条款。别人求之不得的，在你这儿是大概率事件。","rarity":"legendary","effect":"修炼速度与气运远超同辈，更有贵人庇佑","polarity":"positive","attrBonus":{"talentAptitude":3,"resources":2,"charisma":1},"systemModifiers":{"luckPointModifier":1.15,"lifespanModifier":1.08,"cultivationSpeedModifier":1.12}}
]}

// 奇幻神权 — epic/legendary 混搭叙事+概念
{"patterns":[
{"name":"昼夜解耦","description":"社会时钟彻底失效。白昼如同在海底行走，每一次抬头都是跟整个太阳系对抗；午夜脑波却在雷达上炸出尖峰，灵感像不受引力约束的漩涡越转越快。不是失眠——生物钟被钉在了另一个时区，回不来了，休养效率也慢了那最关键的一拍。","rarity":"epic","effect":"夜间思维极为活跃，但白天身心俱疲","polarity":"mixed","attrBonus":{"mind":2,"talentAptitude":2,"physique":-1},"systemModifiers":{"staminaRecoveryModifier":0.9,"hpRecoveryModifier":1.1}},
{"name":"信号过敏","description":"社交感知系统天生失去了自动降噪——他人的微表情、语调偏移、呼吸间距，在你身上触发的是常人百倍强度的神经脉冲。走进一间屋子感受到的不是气氛，是每个在场者在神经系统上逐一敲打的电报码。不是怯懦，是天线增益被预设在了所有人望尘莫及的档位。","rarity":"rare","effect":"感知力极敏锐但社交场合严重不适，收入受损","polarity":"negative","attrBonus":{"charisma":-2,"talentAptitude":-1},"systemModifiers":{"incomeModifier":0.95}},
{"name":"等价燃烧","description":"学一小时顶别人三天，不是更聪明——是大脑在燃烧寿命兑换悟性。每一天倒下去都感觉身体轻了一克，那是生命在无声地氧化。理解一切的速度冠绝群伦，因为付的货币是时间本身。不是在消耗体力——是在拆东墙补西墙，拆的是自己。","rarity":"legendary","effect":"悟性与脑力冠绝群伦，但寿命在无形中加速流失","polarity":"mixed","attrBonus":{"talentAptitude":4,"mind":2,"physique":-1},"systemModifiers":{"lifespanModifier":0.85,"breakthroughChanceModifier":1.2}},
{"name":"神性遗传","description":"上古神明在血脉里留下了未关闭的表达式，每一代子嗣都可能触发这段古老代码、觉醒非凡之力；对神殿的叩拜不是信仰，是编译——神力在血管里运行的回应比所有正版授权都完整。","rarity":"epic","effect":"子嗣更易觉醒非凡力，神力回应更加丰沛","polarity":"positive","attrBonus":{"talentAptitude":2,"charisma":2},"systemModifiers":{"fertilityModifier":1.15,"devotionGainModifier":1.2}}
]}`

export const destinyPatternOutputSchema = z.array(
  z.object({
    type: z.enum(['命格', '特征']).optional(),
    name: z.string().describe('命格名称（2-8字）'),
    description: z.string().describe('命格描述（50-60字）'),
    rarity: z.enum(['common', 'fine', 'rare', 'epic', 'legendary']).describe('稀有度'),
    polarity: z.enum(['positive', 'negative', 'mixed']).describe('极性'),
    effect: z.string().describe('效果描述'),
    attrBonus: z.object({
      physique: z.coerce.number().optional(),
      mind: z.coerce.number().optional(),
      talentAptitude: z.coerce.number().optional(),
      charisma: z.coerce.number().optional(),
      resources: z.coerce.number().optional(),
    }).optional(),
    systemModifiers: z.record(z.string(), z.coerce.number()).optional(),
  }),
)

export type DestinyPatternOutput = z.infer<typeof destinyPatternOutputSchema>

export const destinyPatternPrompt: PromptTemplate<DestinyPatternOutput> = {
  name: 'destiny-pattern',
  version: '2.5.0',
  mod: 'mod-character',
  systemPrompt: DESTINY_PATTERN_SYSTEM_PROMPT,
  userPromptTemplate: '',
  variables: [],
  outputFormat: 'json',
  outputSchema: destinyPatternOutputSchema,
}
