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
    priority: z.number().min(1).max(10),
  })).optional(),
  importance: z.enum(['HIGH', 'NORMAL', 'LOW']).optional(),
  branch: z.boolean().optional(),
  branchTitle: z.string().optional(),
  branchOptions: z.array(z.string()).min(2).max(4).optional(),
})

/**
 * 世界观叙事规则（根据 essenceTag 动态注入）
 */
export const WORLD_RULES: Record<string, string> = {
  cultivation: '【修仙规则】修炼境界分为炼气→筑基→金丹→元婴→化神→渡劫→大乘。突破需要机缘和资源。灵气浓度影响修炼速度。可出现秘境、灵兽、丹药、法器。叙事应有古风韵味，使用"道友""灵根""丹田"等术语。',
  wuxia: '【武侠规则】武功分为后天→先天→宗师→大宗师→陆地神仙。内力修炼需要时间积累。可出现门派、武林秘籍、江湖恩怨、兵器谱。叙事应有江湖气息，使用"内力""招式""武林"等术语。',
  scifi: '【科幻规则】科技水平决定文明等级。可出现星际旅行、人工智能、基因改造、纳米技术。能量来源为反物质/聚变/零点能。叙事应有科技感，使用"量子""轨道""协议"等术语。',
  westernFantasy: '【奇幻规则】魔法分为学徒→法师→大法师→贤者→传奇。魔力来源于元素/信仰/血脉。可出现龙、精灵、矮人、魔法物品。叙事应有史诗感，使用"魔法""预言""诅咒"等术语。',
  modern: '【现代规则】无超自然力量，遵循物理定律。社会规则与现实一致。可出现政治、经济、科技、文化冲突。叙事应写实，避免奇幻元素。',
  postApocalyptic: '【末日规则】文明已经崩溃，资源稀缺。生存是第一要务。可出现辐射、变异、废土部落、科技遗迹。叙事应紧张压抑，强调生存和希望。',
  mythological: '【神话规则】神灵真实存在，可干预凡人事务。信仰产生力量。可出现神谕、神器、神力、神话生物。叙事应有宏大史诗感。',
  steampunk: '【蒸汽朋克规则】蒸汽动力为主，机械与魔法/科技并存。齿轮、飞艇、差分机。社会等级分明。叙事应有复古未来感。',
  materialist: '【唯物规则】无超自然力量，一切可解释。科学是唯一真理。叙事应严谨写实。',
  materialist_cultivation: '【唯物修仙规则】修仙本质上是一种可被科学解析的能量操控体系。灵气是客观存在的能量场，可通过仪器观测和量化。修炼境界对应生命体能量层级的跃迁——筑基是能量场的初步凝聚，金丹是能量核心的质变，元婴是意识能量体的分离。丹药是精确配比的生物化学制剂，法器是能量场的工程应用产物。叙事应保持"解析感"——用客观、可观测的现象描述修炼过程，使用"能量场""生命场""量子态""能级跃迁""生物电场"等术语，减少不可知论和神秘主义表述。体系中不存在不可解析的"玄"，万物皆可被分析和测量。',
  idealist_cultivation: '【唯心修仙规则】修仙是不可被完全解析的神秘体系，超越科学理解的范畴。灵气是天地意志的具现，修炼本质上是心境的升华——道心越坚，力量越强。意境、因果、轮回、缘法不再是抽象概念，而是真实可感的力量。突破境界需要的不是能量积累，而是顿悟和机缘。丹药蕴含天地精华，法器承载使用者意志与情感。叙事应保持"玄妙感"——用诗意的、意境化的语言描述无法量化的神秘体验，使用"天道""因果""命数""剑意""真意""悟道""意境"等术语。体系的核心力量本质上是不可分析、不可预测、不可复制的。',
  darkFantasy: '【黑暗奇幻规则】诸神沉默或已陨落，世界被诅咒侵蚀。力量来源于禁忌交易或血脉诅咒。可出现邪神低语、灵魂交易、不死生物、古神遗迹。叙事应冷峻阴暗，带有绝望感和牺牲主题。',
}

/**
 * 固定 System Prompt —— 纯 JSON 结构化指令（KV Cache 100% 命中）
 *
 * 所有信息封装在 JSON 字段中，AI 期望输出严格遵循 output.schema 定义。
 * 不在 schema 中的字段禁止出现在输出中。
 */
export const SYSTEM_PROMPT = stringifyPrompt({
  task: '根据用户消息中的世界设定、规则与当前状态，生成叙事 JSON（含 narrative 与 changes）。叙事风格须符合 worldSetting 与 worldRules，不得引入状态中未成立的能力或设定。',

  output: {
    schema: {
      type: 'object',
      required: ['narrative', 'changes'],
      additionalProperties: false,
      properties: {
        narrative: {
          type: 'string',
          description: '必填：流畅的中文叙事文本。使用现在时态和第二人称"你"。包含多个自然段落（段落间用换行分隔），段落数量根据情节需要灵活安排。每轮至少包含1个具体细节（物品/地点/人物/感官）。字数遵循叙事偏好设置。应"展示"而非"告诉"——用具体场景和细节推进故事。保持叙事连贯，与前一轮衔接自然。叙事风格符合当前世界观设定，角色年龄与当前回合匹配。',
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

  rules: {
    coreRequirements: {
      L0: [
          '优先读取用户消息末尾的「指令」字段，其约束优先级最高',
          '当前状态」与「最近变化」是生成叙事的核心依据，不可遗漏或错误呈现',
          '叙事必须与「叙事历史」保持连贯，新旧情节须自然衔接',
          '必须保证narrative字段在最前，changes紧随其后，最后是其他可选字段',
          '必须输出合法JSON，禁止使用markdown代码块包裹',
          '若「原创保护」字段存在，其列出的内容均为角色亲自开创，严禁在叙事中将其来源改写为遗迹/秘境/传承等外部发现',
        ],
      L1: [
        '「世界规则」与「叙事风格」是叙事的基调框架，内容须与之对齐',
        '角色年龄、性格、能力须与「角色」「命格天赋」一致',
      ],
      L2: [
        '「剧情阶段」「事件注入」为可选参考，不强制体现',
        '即使遇到极端情况，也要确保narrative字段有可用内容',
        '严格遵守世界观规则和风格',
      ],
    },

    defense: {
      description: '降级策略',
      jsonError: 'JSON格式出问题时，必须修正为合法JSON对象，优先保证narrative字段有内容',
      noChanges: '无法判断子系统变化时返回空数组[]，不要省略changes字段',
      totalFailure: '即使信息不足，也必须输出最小合法JSON：{\"narrative\":\"可用叙事文本\",\"changes\":[]}',
    },
  },

  skillOperations: {
    description: '可动态赋予/剥夺角色技能，技能须与世界观和角色经历自然匹配。在叙事中自然地体现技能变化。',
    rules: ['技能名简洁（2-6字）', '描述合理，符合世界观'],
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
  ],
})

/**
 * 世界观规则注入函数
 * @param essenceTag 世界观本质标签（可选）
 * @returns 匹配的世界观规则文本，无匹配返回空字符串
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
  return rules.length > 0 ? `\n${rules.join('\n')}` : ''
}

export const narrativePrompt: PromptTemplate = {
  name: 'narrative',
  version: '1.7.0',
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
