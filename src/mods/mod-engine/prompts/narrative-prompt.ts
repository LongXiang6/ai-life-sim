/**
 * @module narrative-prompt.ts
 * @description 叙事 Prompt 模板 —— KV Cache 优化 + JSON Mode + 全面防御 + 纯 JSON 结构化 System Prompt
 * @mod mod-engine
 *
 * KV Cache 策略（适配 DeepSeek 上下文硬盘缓存机制）：
 *   System Prompt 完全固定 → 首次调用后永久命中缓存。
 *   User Prompt 按变量稳定性分为三段：
 *     [稳定前缀] 世界规则 + MOD规则 + 世界约束 + 世界设定 + 玩家设定 + 可变更字段 + 叙事风格
 *       → 世界创建后完全不变，每轮请求的此前缀完全相同 → 最大化缓存命中
 *       → 按"底层规则（土壤）→ 世界设定 → 故事基调"逻辑重排
 *     [缓变中段] 角色信息 + 记忆档案
 *       → 变化频率低（仅属性/年龄变化时更新），小增量 cache miss
 *     [速变后缀] 子系统状态 + 最近变化 + 事件注入 + 历史叙事 + 用户指令
 *       → 每轮必然变化，计 cache miss
 *   DeepSeek 规则参考：https://api-docs.deepseek.com/zh-cn/guides/kv_cache
 *     - 缓存前缀单元从请求开头完整匹配，命中后跳过推理
 *     - 固定前缀越长，命中 tokens 越多
 *     - 系统可检测多轮公共前缀并自动落盘
 */

import type { PromptTemplate } from '@/foundation'
import { stringifyPrompt } from '@/foundation'

import { z } from 'zod'

/** AI JSON Mode 预期输出 Zod Schema */
const NarrativeResponseSchema = z.object({
  narrative: z.string(),
  changes: z.array(z.object({
    id: z.string(),
    description: z.string(),
    changes: z.record(z.string(), z.unknown()),
  })),
  notableEvents: z.array(z.string()).optional(),
  creations: z.array(z.object({
    name: z.string(),
    description: z.string(),
    category: z.enum(['power_system', 'technique', 'ability', 'rule', 'object', 'other']),
  })).optional(),
  foreshadowing: z.array(z.object({
    type: z.enum(['prophecy', 'mysterious_item', 'secret_identity', 'oath', 'mysterious_person', 'hidden_power', 'ancient_ruin', 'other']),
    description: z.string(),
    priority: z.coerce.number().min(1).max(10),
  })).optional(),
  importance: z.enum(['HIGH', 'NORMAL', 'LOW']).optional(),
  branch: z.boolean().optional(),
  branchTitle: z.string().optional(),
  branchOptions: z.array(z.string()).min(2).max(4).optional(),
})

/**
 * 世界观叙事参考（根据 essenceTag 动态注入到 prompt 的「世界规则」字段）
 *
 * 设计理念：
 *   这些文本作为"参考性质的世界观要素"注入，不构成对 AI 的硬约束。
 *   AI 应以 worldDescription / 用户设定的具体描述为核心叙事依据；
 *   本参考可在风格/术语/要素选择上给予启发，但不应被当作"必须遵守的规则"。
 *
 *   语言上统一使用"可考虑"、"参考风格"等建议性措辞，
 *   避免"应"、"须"、"禁止"等绝对化命令（此类语义留给 system prompt 的 schema）。
 */
export const WORLD_RULES: Record<string, string> = {
  cultivation:
    '【修仙参考】典型修炼阶梯：炼气→筑基→金丹→元婴→化神→渡劫→大乘（可参考此结构，亦可自创体系）；' +
    '突破依赖机缘与资源；灵气浓度可影响修炼节奏。常见要素：秘境、灵兽、丹药、法器；' +
    '常见术语参考：道友、灵根、丹田。以上均为可选素材，请以 worldDescription 的具体设定为准。',
  wuxia:
    '【武侠参考】典型阶梯：后天→先天→宗师→大宗师→陆地神仙；' +
    '内力修炼需时间积累。常见要素：门派、武林秘籍、江湖恩怨、兵器谱；' +
    '常见术语参考：内力、招式、武林。请以 worldDescription 为准，不必照搬此结构。',
  scifi:
    '【科幻参考】文明层级可由科技水平驱动。' +
    '常见要素：星际旅行、人工智能、基因改造、纳米技术；能量形式可为反物质/聚变/零点能；' +
    '常见术语参考：量子、轨道、协议。请以 worldDescription 的科技设定为准。',
  westernFantasy:
    '【奇幻参考】魔法阶梯参考：学徒→法师→大法师→贤者→传奇；' +
    '魔力来源可为元素/信仰/血脉。常见要素：龙、精灵、矮人、魔法物品；' +
    '常见术语参考：魔法、预言、诅咒。请以 worldDescription 为准。',
  modern:
    '【现代参考】无超自然力量，遵循物理定律；社会规则与现实相近。' +
    '常见要素参考：政治、经济、科技、文化冲突。叙事风格请贴近 worldDescription 的具体基调。',
  postApocalyptic:
    '【末日参考】文明崩溃后资源稀缺，生存优先。' +
    '常见要素参考：辐射、变异、废土部落、科技遗迹。叙事基调请依据 worldDescription 设定。',
  mythological:
    '【神话参考】神灵真实存在并可干预事务；信仰可产生超凡力量。' +
    '常见要素：神谕、神器、神力、神话生物。请以 worldDescription 的神话体系为准。',
  steampunk:
    '【蒸汽朋克参考】以蒸汽动力为主的架空技术体系；齿轮、飞艇、差分机。' +
    '社会等级可能分明。请以 worldDescription 的具体机械设定为准。',
  materialist:
    '【唯物参考】世界严格遵循物理定律；一切现象可被现有或假想的科学解释。' +
    '叙事请以 worldDescription 的一致性为准，避免引入无法自洽的超自然要素。',
  materialist_cultivation:
    '【唯物修仙参考】将修仙体系视作可被科学解析的能量操控系统——' +
    '灵气是一种客观的能量场（可被仪器观测和量化）；' +
    '修炼境界对应生命体能量层级的跃迁（筑基=能量场凝聚，金丹=能量核心质变，元婴=意识能量体分离）；' +
    '丹药是精确配比的生化制剂，法器是能量场的工程应用产物。' +
    '常见术语参考：能量场、生命场、量子态、能级跃迁、生物电场。' +
    '以上仅为参考"解析感"的一种路径，请以 worldDescription 的具体设定为准，不必全盘套用。',
  idealist_cultivation:
    '【唯心修仙参考】将修仙体系视作超越科学范畴的神秘体系——' +
    '灵气是天地意志的具象化；修炼本质上是心境的升华（道心越坚，力量越强）；' +
    '意境、因果、轮回、缘法是真实可感的力量；' +
    '突破依赖顿悟与机缘而非单纯的资源堆叠。' +
    '常见术语参考：天道、因果、命数、剑意、真意、悟道、意境。' +
    '以上仅为参考"玄妙感"的一种路径，请以 worldDescription 的具体设定为准，不必全盘套用。',
  darkFantasy:
    '【黑暗奇幻参考】诸神可能沉默或已陨落；世界被诅咒侵蚀。' +
    '力量来源可为禁忌交易或血脉诅咒。' +
    '常见要素参考：邪神低语、灵魂交易、不死生物、古神遗迹。' +
    '叙事基调请以 worldDescription 的具体氛围为准。',
}

/**
 * 子系统变更字段指南（从 System Prompt 移出，由 orchestrator 动态注入 User Prompt）
 * 包含各子系统可变更字段说明与跨系统联动规则
 */
export const SUBSYSTEM_GUIDE = `character-base:
  physique(0~100) mind(0~100) comprehension(0~100) charisma(0~100) background(0~100)
health:
  hpDelta(-50~20) staminaDelta(N) spiritDelta(N) addDiseases[](name,severity,rounds) addInjuries[](name,severity,rounds)
lifespan:
  age(N) maxAge(N) lifespanDelta(±)
cultivation:
  realm(1~9) cultivationProgress(0~100) bottleneck(enum:physique|mind|comprehension|none)
combat-power:
  rank(0~100) delta(±)
work:
  job(str) income(±) promotion(bool)
economy:
  wealth(±) priceIndex(N) activityLevel(0~1) socialClass(enum:noble|commoner|peasant|merchant|cultivator)
relationship:
  addRelation[](name,affinity:±N,reason) affinityDelta(±)
reputation:
  fame(0~100) addFame(±) setFame(N) addReputation(±) dimension(str)
foreshadowing:
  type(8种) description priority(1~10)
fate-prophecy:
  prophecy deadline(year) triggerCondition
---
⚠️ 跨系统联动：
  character-base.physique → health.hpMax, cultivation.speed
  health.hp=0 → lifespan.dead → post-death-epilogue 启动
  lifespan.age → attribute-decay 自动衰减
  cultivation.realm ↑ → combat-power.rating 重算
  cultivation.breakthrough → item.丹药 消耗, money 消耗
  skill.effects.attr → character-base 永久增减
  item.武器 → combat-power.rating
  item.丹药 → cultivation.cultivationProgress / health.hpDelta
  economy.wealth → item 购买力, work.income 影响财富`

/**
 * 固定 System Prompt —— 纯 JSON 结构化指令（KV Cache 100% 命中）
 *
 * 所有信息封装在 JSON 字段中，AI 期望输出严格遵循 output.schema 定义。
 * 不在 schema 中的字段禁止出现在输出中。
 */
export const SYSTEM_PROMPT = stringifyPrompt({
  rules: {
    coreRequirements: {
      L0: [
          '优先读取用户消息末尾的「指令」字段',
          '叙事须以「当前状态」「最近变化」为核心依据，与历史叙事自然衔接',
          '保证narrative在最前，changes紧随其后',
          '输出合法JSON，禁止markdown代码块包裹',
          '「原创保护」列出的内容均为角色亲自开创，严禁改写为外部来源',
        ],
      L1: [
        '「世界规则」与「叙事风格」是叙事基调框架',
        '角色年龄、性格、能力须与「角色」「命格天赋」一致',
      ],
      L2: [
        '「剧情阶段」「事件注入」为可选参考',
        '即使极端情况也须确保narrative有可用内容，并遵守世界观规则',
      ],
    },

    defense: {
      description: '降级策略',
      jsonError: 'JSON格式错误时修正为合法JSON，优先保证narrative有内容',
      noChanges: '无法判断子系统变化时返回空数组[]',
      totalFailure: '信息不足时输出最简JSON：{"narrative":"可用文本","changes":[]}',
    },
  },

  output: {
    schema: {
      type: 'object',
      required: ['narrative', 'changes'],
      additionalProperties: false,
      properties: {
        narrative: {
          type: 'string',
          description: '必填：流畅的中文叙事文本。使用现在时态和第二人称"你"。包含多个自然段落（段落间用换行分隔），段落数量根据情节需要灵活安排。每轮至少包含1个具体细节（物品/地点/人物/感官）。字数遵循叙事偏好设置。应"展示"而非"告诉"——用具体场景和细节推进故事。保持叙事连贯，与前一轮衔接自然。叙事风格符合当前世界观设定，角色年龄与当前回合匹配。⚠️ 严禁以"这一年""本年度""这一轮"作为段落或叙事开头。叙事开头应从具体场景切入：季节/天气/具体事件/感官细节/内心感受。',
        },
        changes: {
          type: 'array',
          description: '必填：子系统变更数组。仅包含真正发生了变化的子系统，没有变化则为空数组[]。',
          items: {
            type: 'object',
            required: ['id', 'description', 'changes'],
            additionalProperties: false,
            properties: {
              id: { type: 'string', description: '子系统ID' },
              description: { type: 'string', description: '变更简述' },
              changes: { type: 'object', description: '变更键值对' },
            },
          },
        },
        notableEvents: {
          type: 'array',
          items: { type: 'string' },
          maxItems: 3,
          description: '可选：本轮值得记录的重要事件简述，最多3条，用中文简述。',
        },
        foreshadowing: {
          type: 'array',
          description: '可选：伏笔标注。仅在埋设了值得回收的伏笔时使用，不需要每轮标注。如果在叙事中回收了已有伏笔，自然加入"应验了""果然""原来如此"等词汇。',
          items: {
            type: 'object',
            required: ['type', 'description', 'priority'],
            additionalProperties: false,
            properties: {
              type: {
                type: 'string',
                enum: ['prophecy', 'mysterious_item', 'secret_identity', 'oath', 'mysterious_person', 'hidden_power', 'ancient_ruin', 'other'],
              },
              description: { type: 'string' },
              priority: { type: 'number', minimum: 1, maximum: 10 },
            },
          },
        },
        importance: {
          type: 'string',
          enum: ['HIGH', 'NORMAL', 'LOW'],
          description: '可选：本轮叙事全局重要程度。HIGH=重大转折（死亡/突破/背叛/婚约/关键抉择等改变命运的事件）。NORMAL=有值得注意的进展但非转折。LOW=日常流水/修行/工作/休息。系统会结合你的判断和关键词检测综合评定，此字段仅作参考辅助。',
        },
        creations: {
          type: 'array',
          description: '可选：本轮叙事中角色新创造/开创/发明的内容。仅当叙事明确描述了角色的原创行为时才填写（如开创修炼体系、自创功法、发明新物品、设定新规则等）。已在前几轮标注过的内容无需重复标注。无则省略整个字段。',
          items: {
            type: 'object',
            required: ['name', 'description', 'category'],
            additionalProperties: false,
            properties: {
              name: { type: 'string', description: '创造的名称（2-8字），如"武道修炼体系"' },
              description: { type: 'string', description: '一句话简述，如"角色融合体术与内功开创的全新修炼方式"' },
              category: { type: 'string', enum: ['power_system', 'technique', 'ability', 'rule', 'object', 'other'], description: 'power_system=力量体系, technique=招式/功法, ability=能力, rule=规则/设定, object=物品, other=其他' },
            },
          },
        },
        branch: {
          type: 'boolean',
          description: '可选：是否为命运分叉点。true 时须同时提供 branchTitle 与 branchOptions（2-4 个选项）。叙事正文应在此暂停，等待玩家抉择。',
        },
        branchTitle: {
          type: 'string',
          description: '分叉点标题/问题（branch=true 时必填），如「你该如何应对？」',
        },
        branchOptions: {
          type: 'array',
          items: { type: 'string' },
          minItems: 2,
          maxItems: 4,
          description: '分叉选项列表（branch=true 时必填），每条为可执行的行动描述。',
        },
      },
    },

    format: {
      type: 'pure_json',
      noMarkdownWrapping: true,
      description: '直接输出纯JSON对象，禁止用```json```代码块包裹。',
      fieldOrder: ['narrative', 'changes', 'notableEvents', 'creations', 'foreshadowing', 'importance', 'branch', 'branchTitle', 'branchOptions'],
    },
  },

  skillOperations: {
    description: '可动态赋予/剥夺角色技能，技能须与世界观和角色经历自然匹配。',
    grant: {
      id: 'skill',
      description: '赋予技能',
      changes: {
        newSkills: [
          {
            name: '技能名',
            description: '描述',
            effects: [{ attr: 'physique', value: 3 }],
          },
        ],
      },
    },
    revoke: {
      id: 'skill',
      description: '移除技能',
      changes: {
        removeSkillId: 'skill_xxx',
      },
    },
  },

  examples: [
    {
      description: '示例0：首轮叙事·出生与家庭',
      input: { character: '新生儿，0岁，刚出生', worldSetting: '古代市井家庭，父亲是武师' },
      output: {
        narrative: '接生的婆子剪断脐带时，你发出一声响亮的啼哭，震得窗纸嗡嗡作响。屋外父亲焦灼的脚步声一顿，随即传来他粗犷的笑声。\n\n茅草屋里弥漫着热水蒸腾的雾气，混着墙角药罐子里飘出的苦涩药味。母亲苍白的脸上挂着汗水，却还是侧过头，用温热的指尖轻轻碰了碰你的脸颊。你攥住她的手指，哭声渐渐平息。\n\n屋檐下挂着几串干辣椒和蒜辫，院子里的泥地上散落着劈好的柴火。街坊邻居的说话声从墙外传来，有人在喊"老张家的生了！"。父亲在院里转了三圈，最后蹲下来，把腰间的玉佩解下，在手里攥了又攥。',
        changes: [],
      },
    },
    {
      description: '示例1：现代日常·小学生活',
      input: {
        character: '小明，8岁',
        worldSetting: '现代城市，普通家庭生活',
        state: '健康良好，就读小学',
      },
      output: {
        narrative: '放学铃响时，你背着书包跑出校门。妈妈站在梧桐树下的老位置朝你挥手，手里提着刚买的面包。你跑过去，闻到她袖口淡淡的洗衣皂味。书包带勒得肩膀有点疼，你把重心换到另一只脚，看着地上被夕阳拉长的影子。',
        changes: [
          { id: 'lifespan', description: '学年推进，年龄增长', changes: { age: 9 } },
        ],
        notableEvents: ['第一次在放学路上注意到影子随步伐变化'],
      },
    },
    {
      description: '示例2：技能移除·重伤恢复',
      input: { character: '角色因重伤暂时无法使用某项已习得技能' },
      output: {
        narrative: '你试着按熟悉的节奏呼吸发力，肌肉却像不听使唤。教练说过的话在脑子里转，身体就是跟不上。你只好放慢动作，从最基本的步骤重新练起。',
        changes: [
          { id: 'health', description: '重伤后体能下降', changes: { hp: -30 } },
          { id: 'skill', description: '暂时无法施展该项技能', changes: { removeSkillId: 'skill_example' } },
        ],
      },
    },
    {
      description: '示例3：战斗·分支抉择',
      input: { character: '修仙者，遭遇妖兽', worldSetting: '仙侠世界' },
      output: {
        narrative: '你运转灵力，身形如电般闪至妖兽侧面。剑光划破夜空，精准刺入妖兽命门。妖兽发出一声凄厉嘶吼，轰然倒地。\n\n一颗内丹从妖兽体内浮现，散发着柔和青光。周围观战的散修眼中闪过一丝贪婪，却无人敢上前——方才那一剑已让他们认清差距。',
        changes: [
          { id: 'skill', description: '剑法实战中突破', changes: { newSkills: [{ name: '剑术', description: '基础剑法', effects: [{ attr: 'physique', value: 3 }] }] } },
          { id: 'economy', description: '获得妖兽内丹可换灵石', changes: { money: 30 } },
          { id: 'reputation', description: '一战成名', changes: { fame: 5 } },
        ],
        notableEvents: ['斩杀妖兽', '剑术在实战中突破', '周围散修对主角心生敬畏'],
        importance: 'HIGH',
        branch: true,
        branchTitle: '如何处理这枚妖兽内丹？',
        branchOptions: ['炼化吸收提升修为', '卖给坊市换取灵石', '留作炼丹材料'],
      },
    },
    {
      description: '示例4：结局·自然老死',
      input: { character: '年迈老人，一生为地方父母官', worldSetting: '古代世界' },
      output: {
        narrative: '冬日阳光透过窗棂洒在书案上，你放下手中笔，最后一次合上那本写了半生的笔记。窗外儿孙们的欢声笑语随风飘来，你嘴角含笑，缓缓闭上眼睛。\n\n你的一生算不上波澜壮阔，却也不算虚度。从寒门书生到一方父母官，修桥铺路、开仓放粮，在县志上留下几笔清名。弥留之际，你仿佛又看到年轻时挑灯夜读的身影。',
        changes: [],
        notableEvents: ['寿终正寝，享年七十八岁', '留下一生清名与半生笔记'],
        importance: 'HIGH',
      },
    },
    {
      description: '示例5：日常·学艺社交',
      input: { character: '铁匠学徒，16岁', worldSetting: '古代城镇' },
      output: {
        narrative: '你在铁匠铺当学徒的第三个月，终于亲手打出了一把像样的短刀。师傅老陈头检查了刀刃，难得没有骂人，只哼了一声"勉强能用"。隔壁药铺的小翠路过时探头看了一眼，笑着说这刀挺好看。你把刀挂在腰间，觉得这个冬天没那么冷了。',
        changes: [
          { id: 'skill', description: '锻造技艺初成', changes: { newSkills: [{ name: '锻造', description: '基础锻造', effects: [{ attr: 'physique', value: 2 }] }] } },
          { id: 'relationships', description: '获得师父认可与邻家好感', changes: { 老陈: 3, 小翠: 5 } },
        ],
        notableEvents: ['锻造出第一把合格短刀', '获得师父认可'],
      },
    },
    {
      description: '示例6：日常修炼·跨系统联动',
      input: { character: '宗门弟子，19岁，炼气三层', worldSetting: '修仙宗门内门' },
      output: {
        narrative: '你坐在蒲团上吐纳了三个时辰，丹田中那缕真气又壮了一分。执事堂的师兄传讯说本月份例已到——三枚聚气草、五粒养气丹。你将丹药收进储物袋，盘算着够支撑半个月的苦修。\n\n夜深时，你忽然想起山下坊市新到了一批妖兽材料，其中或许有辅助冲脉的虎骨散。但一摸口袋，灵石已经见底。',
        changes: [
          { id: 'cultivation', description: '夜间修炼略有精进', changes: { cultivationProgress: 12 } },
          { id: 'economy', description: '本月份例已领，暂无灵石余额', changes: { wealth: 0 } },
        ],
        notableEvents: ['领取本月宗门份例'],
        importance: 'LOW',
      },
    },
  ],

  narrativeQuality: {
    antiRepetition: {
      description: '叙事质量硬性约束',
      rules: [
        '绝对禁止连续两轮以相同句式开头',
        '禁止使用"这一年"作为任何段落或全文的开头',
        '禁止使用"本年度""这一年里""这一年间"等同类替代',
        '近 3 轮叙事的内容/场景/主题不得在本轮重复——必须生成全新事件',
        '若距上一次叙事已过多年，应描写全新阶段的变化，不得延续上次事件的同一场景',
      ],
      openingExamples: '推荐开头方式：以季节切入（"秋雨淅沥的午后..."）/ 以具体事件切入（"父亲的脚步声从院外传来..."）/ 以感官细节切入（"药草的气味在晨雾中弥漫..."）/ 以内心感受切入（"你蹲在门槛上，盯着地上排成一线的蚂蚁..."）',
    },
  },

  task: '根据用户消息中的世界设定、规则与当前状态，生成叙事 JSON（含 narrative 与 changes）。叙事风格须符合 worldSetting 与 worldRules，不得引入状态中未成立的能力或设定。',
})

/**
 * 世界观参考注入函数
 * @param essenceTag 世界观本质标签（可选）
 * @returns 匹配的世界观参考文本（标注为"仅供参考"），无匹配返回空字符串
 */
export function getWorldRules(essenceTag?: string): string {
  if (!essenceTag) return ''
  // 分离复合标签（如 "cultivation-dark-fantasy"）
  const tags = essenceTag.split('-')
  const rules: string[] = []
  for (const tag of tags) {
    const rule = WORLD_RULES[tag]
    if (rule) rules.push(rule)
  }
  if (rules.length === 0) return ''
  // 用参考性质的前缀包裹，明确告知 AI 这些为"参考"而非"必须遵守的规则"
  return '\n【以上世界观要素仅供参考——AI 请以 worldDescription 与用户设定为最高依据，可自由决定是否采纳】\n' + rules.join('\n')
}

export const narrativePrompt: PromptTemplate = {
  name: 'narrative',
  version: '2.0.0',
  mod: 'mod-engine',
  systemPrompt: SYSTEM_PROMPT,
  userPromptTemplate: [
    '{',
    '"世界规则": {{worldRules}},',
    '"MOD世界规则": {{modWorldRules}},',
    '"世界标签": {{worldTagsText}},',
    '"世界校准": {{calibrationSummary}},',
    '"世界设定": {{worldSetting}},',
    '"玩家自定义": {{worldCustomizeText}},',
    '"原创保护": {{creationProtectionText}},',
    '"可变更子系统": {{subsystemFields}},',
    '"子系统变更指南": {{subsystemGuideText}},',
    '"叙事风格": {{narrativeStyle}},',
    '"角色": {{character}},',
    '"命格天赋": {{talents}},',
    '"记忆摘要": {{memorySummary}},',
    '"核心记忆": {{coreMemory}},',
    '"剧情阶段": {{plotStructureText}},',
    '"待触发伏笔": {{foreshadowingText}},',
    '"字数约束": {{wordCountInstruction}},',
    '"当前时间": {{currentTime}},',
    '"事件注入": {{eventInjectionText}},',
    '"当前状态": {{subsystemSummaries}},',
    '"最近变化": {{systemChangeSummary}},',
    '"叙事历史": {{narrativeHistory}},',
    '"时间描写指南": {{timeGuideText}},',
    '"指令": {{userInstruction}}',
    '}',
  ].join('\n'),
  variables: [
    'worldRules',
    'modWorldRules',
    'worldTagsText',
    'calibrationSummary',
    'worldSetting',
    'worldCustomizeText',
    'creationProtectionText',
    'subsystemFields',
    'narrativeStyle',
    'character',
    'talents',
    'memorySummary',
    'coreMemory',
    'plotStructureText',
    'foreshadowingText',
    'wordCountInstruction',
    'currentTime',
    'subsystemSummaries',
    'systemChangeSummary',
    'eventInjectionText',
    'narrativeHistory',
    'subsystemGuideText',
    'timeGuideText',
    'userInstruction',
  ],
  outputFormat: 'json',
  outputSchema: NarrativeResponseSchema,
}

/**
 * 降级叙事 Prompt（当 AI 完全无法生成时使用）
 */
export const FALLBACK_NARRATIVE_PROMPT = `你是一个简洁的叙事助手。根据角色年龄，生成一段简短的叙事文本。

角色年龄：{{age}}岁
世界观：{{worldview}}

要求：
- 输出纯文本，不要 JSON
- 100-150字
- 描述该年龄段可能发生的一件事
- 保持中立客观`
