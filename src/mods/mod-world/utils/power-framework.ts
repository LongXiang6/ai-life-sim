import type {
  PowerFrameworkDefinition,
  PowerFrameworkProgression,
  PowerFrameworkProposal,
  PowerFrameworkSource,
} from '@/foundation'

const DEFAULT_RANKS: Record<string, Array<[string, string]>> = {
  cultivation: [
    ['炼体', '锤炼身体并感知世界中的修炼媒介'],
    ['聚气', '能够稳定积累并运用当地超常能量'],
    ['筑基', '形成可持续的个人力量结构'],
    ['结丹', '力量完成质变并能影响周边环境'],
    ['元神', '精神或核心力量可脱离常规肉身限制'],
    ['合道', '能够直接触及本世界的高层规则'],
  ],
  martial: [
    ['入门', '掌握稳定的基础技艺'],
    ['精通', '能够在实战中完整运用技艺'],
    ['大师', '形成个人体系并影响一地'],
    ['宗师', '能够开创流派并改变大型冲突'],
    ['化境', '技艺触及本世界允许的极限'],
  ],
  magic: [
    ['学徒', '能够感知并安全引导魔法'],
    ['施法者', '能够独立完成稳定法术'],
    ['法师', '掌握成体系的法术与研究方法'],
    ['大法师', '能够改变广域环境或大型事件'],
    ['奥术宗师', '能够触及本世界魔法规则的边界'],
  ],
  technology: [
    ['民用', '依赖当地普及的通用技术'],
    ['专业', '掌握需要专门训练和设备的技术'],
    ['尖端', '使用当前文明前沿的工程能力'],
    ['战略', '能够影响国家或行星尺度的系统'],
    ['突破', '触及当前世界技术规律的边界'],
  ],
  psychic: [
    ['感知', '能够稳定察觉精神或灵能现象'],
    ['操控', '能够主动影响自身之外的目标'],
    ['领域', '形成持续稳定的影响范围'],
    ['超越', '突破常规生理和物理限制'],
    ['规则', '能够触及本世界灵能规则的边界'],
  ],
  faith: [
    ['信众', '能够感知并回应信仰共同体'],
    ['司祭', '能够稳定主持仪式与教义实践'],
    ['圣徒', '信仰力量能产生可验证影响'],
    ['代行者', '能够代表高位存在介入大型事件'],
    ['神圣化身', '触及本世界信仰力量的边界'],
  ],
  mixed: [
    ['觉醒', '能够稳定接触本世界的特殊力量'],
    ['掌握', '能够独立、可重复地运用力量'],
    ['蜕变', '力量发生质变并超出常规范畴'],
    ['领域', '能够持续影响广域环境或群体'],
    ['规则', '能够触及本世界力量体系的边界'],
  ],
}

function normalizedTag(value: string): string {
  const tag = value.trim().toLowerCase()
  if (tag === 'none' || tag === '无' || tag === '') return 'none'
  if (tag.includes('cultivation') || tag.includes('修仙')) return 'cultivation'
  if (tag.includes('martial') || tag.includes('武')) return 'martial'
  if (tag.includes('magic') || tag.includes('魔法')) return 'magic'
  if (tag.includes('tech') || tag.includes('科技')) return 'technology'
  if (tag.includes('psychic') || tag.includes('灵能')) return 'psychic'
  if (tag.includes('faith') || tag.includes('信仰')) return 'faith'
  return 'mixed'
}

function frameworkLabel(tag: string): string {
  const labels: Record<string, string> = {
    cultivation: '修炼体系',
    martial: '武学体系',
    magic: '魔法体系',
    technology: '技术能力体系',
    psychic: '灵能体系',
    faith: '信仰力量体系',
    mixed: '世界力量体系',
  }
  return labels[tag] ?? labels.mixed
}

function cleanText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

export function createDefaultPowerFramework(
  powerSystemTag: string,
  options?: {
    contextId?: string
    progression?: PowerFrameworkProgression
    source?: PowerFrameworkSource
    label?: string
  },
): PowerFrameworkDefinition {
  const tag = normalizedTag(powerSystemTag)
  const contextId = options?.contextId?.trim() || 'pending'
  const id = `world:${contextId}:power`
  if (tag === 'none') {
    return {
      id,
      label: '无超常力量体系',
      enabled: false,
      progression: 'bounded',
      ranks: [],
      source: options?.source ?? 'world-default',
    }
  }

  const ranks = (DEFAULT_RANKS[tag] ?? DEFAULT_RANKS.mixed).map(([label, description], offset) => ({
    id: `${id}:rank:${offset + 1}`,
    index: offset + 1,
    label,
    description,
  }))
  return {
    id,
    label: cleanText(options?.label, frameworkLabel(tag)),
    enabled: true,
    progression: options?.progression ?? 'bounded',
    ranks,
    source: options?.source ?? 'world-default',
  }
}

export function materializePowerFramework(
  proposal: PowerFrameworkProposal | PowerFrameworkDefinition | null | undefined,
  options: {
    contextId: string
    powerSystemTag: string
    source: PowerFrameworkSource
  },
): PowerFrameworkDefinition {
  const tag = normalizedTag(options.powerSystemTag)
  if (tag === 'none') {
    return createDefaultPowerFramework('none', {
      contextId: options.contextId,
      source: options.source,
    })
  }

  const fallback = createDefaultPowerFramework(options.powerSystemTag, {
    contextId: options.contextId,
    source: options.source,
  })
  const proposedRanks = Array.isArray(proposal?.ranks)
    ? proposal.ranks
      .map((rank, offset) => ({
        label: cleanText(rank?.label, ''),
        description: cleanText(rank?.description, ''),
        offset,
      }))
      .filter((rank) => rank.label && rank.description)
    : []
  if (proposedRanks.length === 0) return fallback

  const id = `world:${options.contextId}:power`
  const progression = proposal?.progression === 'open' ? 'open' : 'bounded'
  return {
    id,
    label: cleanText(proposal?.label, fallback.label),
    enabled: true,
    progression,
    ranks: proposedRanks.map((rank, offset) => ({
      id: `${id}:rank:${offset + 1}`,
      index: offset + 1,
      label: rank.label,
      description: rank.description,
    })),
    source: options.source,
  }
}

export function assertValidPowerFramework(framework: PowerFrameworkDefinition): void {
  if (!framework.id.trim() || !framework.label.trim()) throw new Error('世界力量框架缺少稳定身份或名称')
  if (!framework.enabled) {
    if (framework.ranks.length > 0) throw new Error('未启用的世界力量框架不能包含阶位')
    return
  }
  if (framework.ranks.length === 0) throw new Error('已启用的世界力量框架必须包含阶位')
  const ids = new Set<string>()
  framework.ranks.forEach((rank, offset) => {
    if (rank.index !== offset + 1) throw new Error('世界力量阶位必须从 1 连续编号')
    if (!rank.id.trim() || ids.has(rank.id)) throw new Error(`世界力量阶位 ID 无效：${rank.id}`)
    if (!rank.label.trim() || !rank.description.trim()) throw new Error(`世界力量阶位内容不完整：${rank.id}`)
    ids.add(rank.id)
  })
}

export function formatPowerFrameworkForPrompt(
  framework: PowerFrameworkDefinition | null | undefined,
): string | undefined {
  if (!framework?.enabled || framework.ranks.length === 0) return undefined
  const boundary = framework.progression === 'open'
    ? '开放进阶；当前已知阶位之后可由世界内事实继续定义'
    : '有限体系；最高阶位就是当前世界可达边界'
  return [
    `${framework.label}（${boundary}）`,
    ...framework.ranks.map((rank) => `${rank.index}. ${rank.label}：${rank.description}`),
  ].join('\n')
}
