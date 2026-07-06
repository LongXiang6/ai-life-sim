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
字段: name(2-8字) rarity polarity description(50-120汉字,微叙事体:①具体场景切入→②感官细节→③收束;写先天倾向不说既定事实。严禁否定转折模板、对照炫技模板、破折号反转、口号式总结；每条description使用不同句法、不同节奏、不同开头) effect(≥10字定性) attrBonus
属性上限: common±1单属 fine±2或双±1 rare≤3(1-2属) epic≤5(1-3属) legendary≤7(1-3属)
仅输出非零属性禁physique:0
*/

// 风格轮换：按条目顺序在 白描微场景 / 机制暗示 / 诗性意象 / 幽默日常 / 冷静档案 五类之间切换；同一批20条不得连续使用同一种句型。
// 示例覆盖不同世界观×5级×3极性×全属性×全系统字段，每条用不同句法节奏：

// 现代都市 — common（白描场景→细节收束）
{"patterns":[
{"name":"重力记忆","description":"第一次踩上滑板时，安全守则还没讲到刹车，身体已经顺着坡道滑了下去。风从耳边擦过，脚踝轻轻一拧，重心便自己找回原位。需要重新适应重力的运动，总像早已练过许多年。","rarity":"common","effect":"平衡感和身体协调力极强","polarity":"positive","attrBonus":{"physique":1}},
{"name":"方向失语","description":"东南西北在认知里是同一种颜色。站到熟悉街角，世界忽然被翻了一面，路牌上的箭头全指向同一个方向。也因此练出了绝佳的情景记忆——靠歪脖子树的形状认路，靠转角面包店飘来的焦糖味。","rarity":"common","effect":"方向感极差但情景记忆惊人","polarity":"negative","attrBonus":{"mind":-1}},
{"name":"熵增恐惧","description":"歪斜的文件在桌上多待一秒，就像宇宙在朝那一角塌陷。书桌须按色谱排列，衣柜间隔必须均等。交出的每件事近乎完美，但比旁人多花一倍时间。精确是恐惧养出的纪律。","rarity":"common","effect":"完成质量高但速度偏慢","polarity":"mixed","attrBonus":{}}
]}

// 星际科幻 — fine + rare（现象切入→机制揭示→后果收束）
{"patterns":[
{"name":"语义穿透","description":"第一次听到异星语言，语法在脑子里自己拆成骨架，词汇顺着骨架爬进去。翻译芯片、语义矩阵、外交官的全套装备，不过是把你一直在做的事起了个名字。人话、代码、鲸歌，在认知皮层上是同一种材料。","rarity":"fine","effect":"跨语言与代码沟通天赋卓越","polarity":"positive","attrBonus":{"charisma":1,"talentAptitude":1}},
{"name":"射线抗体真空","description":"细胞核的辐射修复通道天生缺了一个关键开关。微量电离辐射便能引发链式凋亡，皮肤在恒星灯下泛起细密刺痛。星际移民时代，这份体质会让所有职业体检表亮起第一道红灯。","rarity":"fine","effect":"极易受辐射伤害，必须生活在屏蔽区","polarity":"negative","attrBonus":{"physique":-2}},
{"name":"信任延迟","description":"初见时，寒暄像隔着厚玻璃传来，你习惯先观察杯沿水痕、语速停顿和眼神落点。一旦连接建立，喧哗里那些低频信号会变得异常清晰，回应精准得像手术刀。慢热被磨成了洞察。","rarity":"fine","effect":"初期社交慢热，熟悉后展现深度","polarity":"mixed","attrBonus":{"charisma":-1,"mind":1}},
{"name":"价值共振","description":"价格在你眼中是形状。看一眼屏幕上的波动就能摸到它的曲率，预判下一拍的拐点。稀有矿产的涨跌、航线政策的风向，在脑海中自动排成价值等高线，如同大提琴泛音般清晰。","rarity":"rare","effect":"投资眼光精准，星际交易中占优","polarity":"positive","attrBonus":{"resources":2,"mind":1}},
{"name":"航道偏幸","description":"星际货船的航线由算法规划，货舱间距精确到厘米。唯独你的船，每次出港都恰好抢在陨石雨前三十分钟穿过航路。调度中心查了二十次日志，每次结论都是程序没算错。你的运数不在算法可及的范围。","rarity":"rare","effect":"冒险行动中意外风险显著降低","polarity":"positive","attrBonus":{"resources":1,"talentAptitude":2}}
]}

// 仙侠修真 — rare/epic/legendary（代价前置→过程展开→反转收束）
{"patterns":[
{"name":"代价守恒","description":"每次冲关都像把骨头放进炉里慢慢煅烧。瓶颈迟迟不肯松口，汗水沿着脊背浸透蒲团；可一旦熔穿，那道壁垒便彻底失去回弹。根基的密度以煎熬作价，买定离手，永不退货。","rarity":"rare","effect":"修炼瓶颈更难突破，但成功后的根基极其稳固","polarity":"mixed","attrBonus":{"talentAptitude":1,"physique":-1}},
{"name":"社交引力","description":"话题绕完一圈，总会回到你身上。开口时所有人静下来的那一瞬千年难遇，像行星不自知地弯曲了轨道，共识绕着一个看不见的重心旋转。不一定是说话最多的，但目光先到的那个一定是你。","rarity":"epic","effect":"人脉广博，易成为核心人物","polarity":"positive","attrBonus":{"charisma":3,"resources":1,"mind":1}},
{"name":"概率偏斜","description":"古籍在书架深处松了钉，落地时正好翻到缺失多年的残页。山路将尽，远处灯火忽然亮起；剑光贴近喉间，又有风把落叶卷进对方眼中。命运的缝隙总在你身边微微张开。","rarity":"legendary","effect":"修炼速度与气运远超同辈，更有贵人庇佑","polarity":"positive","attrBonus":{"talentAptitude":3,"resources":2,"charisma":1}}
]}

// 奇幻神权 — epic/legendary（状态速写→机制揭示→诗意收束）
{"patterns":[
{"name":"昼夜解耦","description":"社会时钟在你身上彻底失效。白昼如同海底行走，每一次抬头都是跟太阳系对抗；午夜脑波却在雷达上炸出尖峰，灵感像不受引力约束的漩涡越转越快。生物钟被钉在了另一个时区，休养效率慢了最关键的那一拍。","rarity":"epic","effect":"夜间思维极为活跃，但白天身心俱疲","polarity":"mixed","attrBonus":{"mind":2,"talentAptitude":2,"physique":-1}},
{"name":"信号过敏","description":"社交感知系统天生失去了自动降噪。他人的微表情、语调偏移、呼吸间距，在你身上触发常人百倍强度的神经脉冲。走进一间屋子，感受的是每个在场者在神经系统上逐一敲打的电报码。天线增益被预设在了所有人望尘莫及的档位。","rarity":"rare","effect":"感知力极敏锐但社交场合严重不适","polarity":"negative","attrBonus":{"charisma":-2,"talentAptitude":-1}},
{"name":"等价燃烧","description":"学一小时便抵得上漫长苦读，可支付的货币是时间本身。每一天倒下去都感觉身体轻了一克，生命在无声地氧化。理解一切的速度冠绝群伦，寿命的暗账却始终挂着负数。","rarity":"legendary","effect":"悟性与脑力冠绝群伦，但寿命在无形中加速流失","polarity":"mixed","attrBonus":{"talentAptitude":4,"mind":2,"physique":-1}},
{"name":"神性遗传","description":"上古神明在血脉里留下了未关闭的表达式，每一代子嗣都可能触发这段古老代码、觉醒非凡之力。对神殿的叩拜更像编译——神力在血管里运行的回应比所有正版授权都完整。","rarity":"epic","effect":"子嗣更易觉醒非凡力，神力回应更加丰沛","polarity":"positive","attrBonus":{"talentAptitude":2,"charisma":2}},
{"name":"厄运折射","description":"诅咒落到身上总会偏一寸，像雨点砸在倾斜的琉璃瓦上，最凶的一线力道滑向旁处。黑魔法反噬后，苦药汤仍然难喝，伤口却提前收口。厄运抵达你身边时，常被削去最沉的一层。","rarity":"legendary","effect":"免疫运气衰减类负面效果，厄运对你打折生效","polarity":"positive","attrBonus":{"physique":2,"talentAptitude":2,"mind":1}}
]}`

export const destinyPatternOutputSchema = z.array(
  z.object({
    type: z.enum(['命格', '特征']).optional(),
    name: z.string().describe('命格名称（2-8字）'),
    description: z.string().describe('命格描述（50-120字）'),
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
