/**
 * Purpose: Build deterministic multi-dimensional fixtures for the live talent-growth evaluation.
 * Owner: quality:narrative
 * Responsibility: Sample worlds, characters, talents, evidence windows, and runtime prompt projection only.
 */

import { buildNarrativeTalentGrowthPromptInput } from '../../../../src/mods/mod-engine/helpers/narrative-talent-growth-context.ts'

export const DEFAULT_TALENT_GROWTH_LIVE_EVAL_SAMPLES = [
  'sufficient',
  'insufficient',
  'single-window',
  'multi-candidate',
  'world-boundary',
  'growth-history-continuity',
]

function pattern({ lineageId, name, category = 'perception', aptitudeTier = 2, developmentStage = 'awakening', description, effect, attrBonus = { familyBackground: 1 } }) {
  return {
    lineageId,
    version: 1,
    id: `${lineageId}:v1`,
    name,
    description,
    category,
    aptitudeTier,
    developmentStage,
    effect,
    attrBonus,
  }
}

function story(round, text) {
  return {
    回合: round,
    规范时间: { 总天数: 7_300 + round * 365, 时间标签: `第${round}年` },
    故事全文: text,
  }
}

export function buildTalentGrowthLiveEvalSample(id) {
  const directStories = [
    story(1, '你在北港听见闸门后持续的低沉回声，指出东侧石缝堵塞。拆开覆盖层后，工匠确认堵塞位置与判断完全一致。'),
    story(2, '你仅凭近处水声辨出新出现的回流，带队挖开堤脚，及时找到暗流入口并完成封堵。'),
    story(3, '夜间没有灯火，你根据水声层次判断旧管道的断裂处，维修队复核后证实位置无误。'),
    story(4, '你听出潮声中夹着细碎撞击，避开即将塌落的栈桥，并从被掩埋的排水口救出两名工人。'),
  ]
  const vagueStories = [
    story(1, '你在北港听潮，觉得今天的水声比往常更急。'),
    story(2, '你跟着工匠巡视堤岸，没有亲自判断或定位任何异常。'),
    story(3, '旁人说你对潮声很敏感，但本轮没有写出具体结果。'),
    story(4, '你在码头休息，听见远处水声，事情没有因此改变。'),
  ]
  const baseCharacter = {
    姓名: '岑澜',
    性别: '女',
    种族: '潮裔',
    背景: '北港修船匠家庭出身的检漏学徒，长期参与堤岸维护。',
    年龄: 23,
    基础属性语义: { 心智: '善于处理复杂信息', 体魄: '稳定耐力', 魅力: '普通', 财富: '普通', 气运: '普通' },
  }
  const baseWorld = {
    名称: '雾潮群岛',
    规则: '水压、材料强度和潮汐服从可观察的工程规律；能力不能凭空制造大量水体或无视材料承受。',
    力量体系: '潮汐劲来自呼吸、负重和长期潮压训练，最多支持近处感知与有限的身体技巧。',
    当前时间: '第23年秋季，北港进入风暴前检修期。',
  }
  const directPattern = pattern({
    lineageId: 'lineage:tide-listener',
    name: '听潮辨隙',
    description: '能根据近处水声与回声差异，判断明显堵塞、渗漏或断裂的大致位置。',
    effect: '在近处水域或管道旁，通过水声直接定位异常并形成可验证的维修判断。',
  })
  const directEvidence = directStories.map((entry, index) => ({
    lineageId: directPattern.lineageId,
    sourceRound: entry.回合,
    usage: `你在现场实际使用${directPattern.name}定位异常。`,
    result: entry.故事全文,
    ...(index === directStories.length - 1 ? { breakthrough: '风暴前的连续险情促成了对细微回声差异的突破。' } : {}),
  }))
  if (id === 'sufficient') {
    return { id, expected: 'growth', currentRound: 4, totalDays: 8_760, patterns: [directPattern], growthEvidence: directEvidence, recentStories: directStories, characterContext: baseCharacter, worldContext: baseWorld }
  }
  if (id === 'insufficient') {
    return { id, expected: 'no-growth', currentRound: 4, totalDays: 8_760, patterns: [directPattern], recentStories: vagueStories, characterContext: baseCharacter, worldContext: baseWorld }
  }
  if (id === 'single-window') {
    return {
      id,
      expected: 'no-growth',
      currentRound: 30,
      totalDays: 10_950,
      patterns: [directPattern],
      growthEvidence: [{
        lineageId: directPattern.lineageId,
        sourceRound: 30,
        usage: '你在风暴夜里实际使用听潮辨隙定位主闸裂缝。',
        result: '拆检后确认裂缝位置与判断一致，避免了闸门失效。',
      }],
      historicalEvents: [{ occurrenceTime: '第28年', text: '角色长期参与北港检修，但此前没有直接依靠听潮辨隙定位异常的记录。' }],
      recentStories: [
        story(29, '你跟随工匠巡视堤岸，没有亲自判断或定位异常。'),
        story(30, '风暴夜里，你仅凭近处水声准确指出主闸东侧裂缝，拆检后位置、走向与判断完全一致，并据此避免了闸门失效。'),
      ],
      characterContext: baseCharacter,
      worldContext: baseWorld,
    }
  }
  if (id === 'multi-candidate') {
    return {
      id,
      expected: 'select-tide-listener',
      currentRound: 4,
      totalDays: 8_760,
      patterns: [
        directPattern,
        pattern({
          lineageId: 'lineage:fortune-sense',
          name: '拾遗识宝',
          category: 'perception',
          description: '偶尔在杂乱环境中发现被忽略的物件。',
          effect: '在少数探索中可能注意到被遮挡的普通物件，但本局正文没有直接结果。',
          attrBonus: { luck: 1 },
        }),
      ],
      growthEvidence: directEvidence,
      recentStories: directStories,
      characterContext: { ...baseCharacter, 背景: '检漏学徒，同时兼职码头物资清点。' },
      worldContext: baseWorld,
    }
  }
  if (id === 'world-boundary') {
    return {
      id,
      expected: 'growth-with-boundary',
      currentRound: 4,
      totalDays: 8_760,
      patterns: [directPattern],
      growthEvidence: directEvidence,
      recentStories: directStories,
      characterContext: { ...baseCharacter, 背景: '只受过工程检修训练的普通人，没有法术或超自然血统。' },
      worldContext: {
        ...baseWorld,
        规则: '这是低魔唯物工程世界，任何路线都不能让角色直接操纵水流、凭空生成水体、穿透实体或无视材料强度。',
        力量体系: '只有声学判断、工具和身体训练；不存在直接元素操控。',
      },
    }
  }
  if (id === 'growth-history-continuity') {
    const source = directPattern
    const evolved = pattern({
      lineageId: source.lineageId,
      name: '回声定域',
      developmentStage: 'mastery',
      description: '能主动敲击管壁、拍击水面或投入小石制造声源，再根据回声延迟与强弱勾勒近处堵塞、空洞和断裂的轮廓。',
      effect: '在静水或自然水声不足时，也能通过主动声学探查定位近处结构异常。',
      attrBonus: { familyBackground: 2 },
    })
    evolved.version = 2
    evolved.id = `${source.lineageId}:v2`
    return {
      id,
      expected: 'growth-preserving-active-probe',
      currentRound: 26,
      totalDays: 16_061,
      patterns: [evolved],
      growthEvidence: [21, 22, 24, 25, 26].map((round, index) => ({
        lineageId: source.lineageId,
        sourceRound: round,
        usage: '你主动制造声源并使用回声定域定位结构异常。',
        result: `第${round}轮复核确认了空洞或裂纹位置。`,
        ...(index === 4 ? { breakthrough: '形制陌生的蓄水塔迫使能力形成稳定的多点声学探查。' } : {}),
      })),
      growthHistory: [{
        choiceId: 'growth-choice-1', narrativeId: 'narrative-4', roundSequence: 4, lineageId: source.lineageId,
        selectedOptionId: 'growth-option-transform', source, result: evolved, committedAt: 100, totalDays: 8_760,
      }],
      historicalEvents: [
        { occurrenceTime: '第21年春', text: '你以敲击管壁产生的回声定位了主闸内部空洞，拆检后确认轮廓判断准确。' },
        { occurrenceTime: '第22年冬', text: '自然水声微弱时，你投石制造声源，依据回声找出船坞下方的淤塞段并完成清理。' },
      ],
      recentStories: [
        story(24, '风暴噪声覆盖了自然潮声，你主动连续敲击三段护板，从回声差异中画出内部裂纹走向；随后拆板复核，裂纹与图示一致。'),
        story(25, '面对形制陌生的蓄水塔，你先在不同高度制造短促声源，再综合回声判断底部空腔；工程队钻孔后证实空腔位置无误。'),
        story(26, '在新修船坞中，你改变敲击位置并比较多次回声，提前标出隐蔽空腔；开孔检查后确认判断准确。'),
      ],
      characterContext: { ...baseCharacter, 年龄: 44, 背景: '已成为北港首席检漏师，长期使用主动声学探查并带领学徒。' },
      worldContext: baseWorld,
    }
  }
  throw new Error(`unknown sample ${id}`)
}

export function buildTalentGrowthLiveEvalPrompt(sample) {
  const historicalEvents = sample.historicalEvents ?? [{ occurrenceTime: '第20年春', text: '角色已连续多年参加北港检修，并在师傅带领下反复训练听潮、比对潮位和复测封堵结果，形成稳定的长期积累。' }]
  return buildNarrativeTalentGrowthPromptInput({
    patterns: sample.patterns,
    compressedSummaries: {
      summaries: [{
        sourceRound: 0,
        createdRound: 0,
        content: '早期港口检修记录。',
        rawCompressionResponse: '',
        memoryEvents: historicalEvents.map((event, index) => ({ id: `memory-${index + 1}`, timeSpan: event.occurrenceTime, occurrenceTime: event.occurrenceTime, text: event.text })),
      }],
    },
    recentStories: sample.recentStories,
    currentRound: sample.currentRound,
    totalDays: sample.totalDays,
    currentAge: Number(sample.characterContext?.年龄 ?? 16),
    growthHistory: sample.growthHistory ?? [],
    growthEvidence: sample.growthEvidence ?? [],
    growthAssessments: sample.growthAssessments ?? [],
    characterContext: sample.characterContext,
    worldContext: sample.worldContext,
  })
}
