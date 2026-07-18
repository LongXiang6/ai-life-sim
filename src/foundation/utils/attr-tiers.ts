/**
 * @module attr-tiers
 * @description 属性语义映射 —— 将 4 属性 × 多档数值映射为 AI 可消费的语义描述
 * @mod foundation
 *
 * 用于 Prompt 注入，将数值属性转化为自然语言描述，
 * 使 AI 在叙事时能准确理解角色的实际能力水平。
 */

// ──── 类型 ────

/** 属性语义映射键（与 AttributeId 中可分配属性对应） */
export type AttrKey = 'physique' | 'mind' | 'comprehension' | 'charisma'

/** 属性档位描述 */
export interface AttrTier {
  value: number,       // 1-10
  label: string,       // 档位名称
  description: string, // 详细描述（用于 Prompt 注入）,
}

// ──── 语义映射表 ────

/**
 * 属性档位语义映射表
 *
 * 每个属性 10 档（value 1-10），每档包含：
 * - label: 档位名称（简短标签）
 * - description: 详细描述（用于 Prompt 注入）
 */
const ATTR_TIER_MAP: Readonly<Record<AttrKey, ReadonlyArray<AttrTier>>> = {
  physique: [
    { value: 1, label: '病弱', description: '体弱多病，风吹即倒' },
    { value: 2, label: '瘦弱', description: '身形单薄，体力不济' },
    { value: 3, label: '一般', description: '体格平平，无甚突出' },
    { value: 4, label: '健康', description: '身体康健，精力充沛' },
    { value: 5, label: '强壮', description: '肌肉结实，力大过人' },
    { value: 6, label: '健壮', description: '体魄雄健，耐力惊人' },
    { value: 7, label: '魁梧', description: '身材魁梧，力大无穷' },
    { value: 8, label: '虎背熊腰', description: '虎背熊腰，威武雄壮' },
    { value: 9, label: '铜筋铁骨', description: '铜筋铁骨，刀枪难伤' },
    { value: 10, label: '肉身成圣', description: '肉身成圣，超凡脱俗' },
  ],
  mind: [
    { value: 1, label: '痴呆', description: '神志不清，懵懂无知' },
    { value: 2, label: '愚钝', description: '思维迟缓，反应慢半拍' },
    { value: 3, label: '平庸', description: '智力平平，中规中矩' },
    { value: 4, label: '正常', description: '心智正常，能思能想' },
    { value: 5, label: '聪慧', description: '思维敏捷，聪慧过人' },
    { value: 6, label: '机智', description: '机智灵活，应变自如' },
    { value: 7, label: '博学', description: '博学多才，见多识广' },
    { value: 8, label: '睿智', description: '睿智深邃，洞察入微' },
    { value: 9, label: '智冠天下', description: '智谋无双，算无遗策' },
    { value: 10, label: '超凡入圣', description: '智慧通天，超凡入圣' },
  ],
  comprehension: [
    { value: 1, label: '朽木', description: '朽木不可雕，难以点化' },
    { value: 2, label: '驽钝', description: '驽钝愚顽，开窍极慢' },
    { value: 3, label: '普通', description: '悟性平平，循序渐进' },
    { value: 4, label: '可塑', description: '可塑之才，教导有方则进' },
    { value: 5, label: '聪颖', description: '聪颖好学，举一反三' },
    { value: 6, label: '天资', description: '天资过人，悟性极佳' },
    { value: 7, label: '天才', description: '天才横溢，一通百通' },
    { value: 8, label: '百年一遇', description: '百年一遇，悟道如饮水' },
    { value: 9, label: '千年一遇', description: '千年一遇，近乎妖孽' },
    { value: 10, label: '旷世奇才', description: '旷世奇才，悟道通天' },
  ],
  charisma: [
    { value: 1, label: '丑陋', description: '相貌丑陋，令人避之不及' },
    { value: 2, label: '平凡', description: '相貌平平，泯然众人' },
    { value: 3, label: '一般', description: '五官端正，无甚特色' },
    { value: 4, label: '顺眼', description: '眉清目秀，看着顺眼' },
    { value: 5, label: '清秀', description: '面容清秀，气质宜人' },
    { value: 6, label: '俊美', description: '俊美非凡，引人注目' },
    { value: 7, label: '风度翩翩', description: '风度翩翩，气质出众' },
    { value: 8, label: '倾倒众生', description: '倾倒众生，见者难忘' },
    { value: 9, label: '倾国倾城', description: '倾国倾城，绝世风华' },
    { value: 10, label: '仙姿玉貌', description: '仙姿玉貌，不染凡尘' },
  ],
}

// ──── 属性中文名称映射 ────

const ATTR_NAMES: Readonly<Record<AttrKey, string>> = {
  physique: '体魄',
  mind: '心智',
  comprehension: '悟性',
  charisma: '魅力',
}

// ──── 公开函数 ────

/**
 * 获取属性的语义档位描述
 *
 * @param attr - 属性键
 * @param value - 属性值（1-10），超出范围会被 clamp 到 [1, 10]
 * @returns 对应档位的 AttrTier
 */
export function getAttrTier(attr: AttrKey, value: number): AttrTier {
  const clamped = Math.min(10, Math.max(1, value))
  const tiers = ATTR_TIER_MAP[attr]
  return tiers[clamped - 1]
}

/**
 * * 获取属性的完整语义描述文本（用于 Prompt 注入）
 *
 * 格式："角色{属性名}{label}，{description}。"
 *
 * @param attr - 属性键
 * @param value - 属性值（1-10）
 * @returns 语义描述文本
 */
export function getAttrSemanticText(attr: AttrKey, value: number): string {
  const tier = getAttrTier(attr, value)
  const name = ATTR_NAMES[attr]
  return `角色${name}${tier.label}，${tier.description}。`
}

/**
 * 获取所有属性的语义描述文本（用于 Prompt 注入）
 *
 * 将多个属性的语义描述拼接为一个完整段落。
 *
 * @param attrs - 属性键值对（Partial，只包含需要描述的属性）
 * @returns 拼接后的语义描述文本
 */
export function getAllAttrSemanticText(attrs: Partial<Record<AttrKey, number>>): string {
  const entries = Object.entries(attrs) as [AttrKey, number][]
  return entries
    .map(([attr, value]) => getAttrSemanticText(attr, value))
    .join('')
}

