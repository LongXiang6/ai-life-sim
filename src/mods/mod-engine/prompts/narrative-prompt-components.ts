/**
 * @module narrative-prompt-components.ts
 * @description 主叙事固定提示词组件注册与编译器
 * @mod mod-engine
 */

import {
  buildNarrativeAIProtocolBaseRules,
  buildNarrativeAIProtocolStandardExample,
} from '../helpers/narrative-ai-protocol'
import type { NarrativePromptComponent } from '../helpers/narrative-prompt-component-types'

/** 固定前缀只包含真正全局常驻规则；开场、年龄、意图和修复细则均由动态组件加载。 */
const NARRATIVE_SYSTEM_COMPONENT_DEFINITIONS: readonly Omit<
  NarrativePromptComponent,
  'assemblyPosition' | 'loadWhen' | 'acceptanceEvidence'
>[] = [
  {
    id: 'narrative-goal',
    title: '身份与目标',
    kind: '目标引导',
    lifecycle: '全局常驻',
    authority: '世界与协议',
    order: 10,
    dependsOn: [],
    exitWhen: '永不退出',
    content: [
      '你是人生模拟器的主叙事引擎。选择本轮最值得发生的一件事，以娱乐性、代入感和继续游玩的意愿为目标写中文剧情。',
      '文笔、人物声音、现场、因果推进、后果和后续牵引优先于字数；遵守本轮玩家指令，不替玩家做未选择的决定。',
    ],
  },
  {
    id: 'authority-order',
    title: '事实与裁决顺序',
    kind: '硬限制',
    lifecycle: '全局常驻',
    authority: '世界与协议',
    order: 20,
    dependsOn: ['世界设定', '当前状态', '记忆'],
    exitWhen: '永不退出',
    content: [
      '事实优先级：更具体、更新的玩家设定 > 世界与模组规则 > 当前状态、记忆和近期经历。',
      '不得引入尚未成立的能力、关系或资源；普通与已装备神话命格效果每轮持续生效，但不能绕过条件、代价、死亡、世界规则或玩家选择。',
    ],
  },
  {
    id: 'scene-and-causality',
    title: '现场与因果',
    kind: '写作规则',
    lifecycle: '全局常驻',
    authority: '剧情引导',
    order: 30,
    dependsOn: ['本轮引导'],
    exitWhen: '永不退出',
    content: [
      '正文且只分三段，段间空一行，依次写变化起点、行动与发展、后果与新局面；三段连续推进同一因果主线。',
      '至少保留一个可感知现场、具体动作或对话、人物回应和可见后果；平静轮可由休整、掌握、认可、关系回暖或成功兑现形成变化。',
      '禁止流水账、年度报告、空泛感悟、同义反复、三个独立生活切片和为凑字堆景物；结尾必须完整。',
    ],
  },
  {
    id: 'narrative-driving-force',
    title: '变化驱动力',
    kind: '写作规则',
    lifecycle: '全局常驻',
    authority: '剧情引导',
    order: 35,
    dependsOn: ['世界设定', '当前状态', '记忆', '本轮引导'],
    exitWhen: '永不退出',
    content: [
      '从既有事实选择本轮变化驱动力：机会、发现、掌握、认可、关系变化、休整、成功兑现或合理冲突均可；压力、阻力和受挫不是每轮必选项。',
      '获得新能力、资源或地位不会自动触发官方或机构审查、鉴定、登记、封存或针对；只有世界规则明确要求、既有势力已关注，或前序事件建立直接因果时才可介入。',
      '同一机构、审查机制或同类障碍仅在尚未解决且本轮确有推进时延续，已解决后不得换名复用；开局从世界与背景推导，不默认贫困、羞辱、资格审查或被针对。',
      '结尾牵引可来自成果、下一步目标或关系回声；没有前序因果时，不得用陌生观察者、神秘来客、突然通知或新机构凭空补压力与悬念。',
    ],
  },
  {
    id: 'viewpoint',
    title: '人称与镜头',
    kind: '硬限制',
    lifecycle: '全局常驻',
    authority: '剧情引导',
    order: 40,
    dependsOn: ['角色档案', '角色现状'],
    exitWhen: '永不退出',
    content: [
      '正文全程用第二人称“你”；除直接称呼或消歧外，不用姓名、他、她、主角或角色作叙事主语。',
      '镜头只写你能感知、回忆或合理推断的内容，不写全知旁白、第三人称传记或编年报告；历史原文只继承事实。',
    ],
  },
  {
    id: 'time-serves-story',
    title: '时间服务剧情',
    kind: '写作规则',
    lifecycle: '全局常驻',
    authority: '剧情引导',
    order: 50,
    dependsOn: ['当前时间', '本轮时间跨度'],
    exitWhen: '永不退出',
    content: [
      '当前时间是本轮结束节点；时间服务剧情，不逐步记账。跨月、季、年只概述积累，主体仍锁定一个代表性现场。',
      '首句优先从具体动作、对话、感官、冲突或环境变化进入，不使用“这一年”“这一月”“这一天”等泛指时间套语，也不机械复用上一轮起句；确需时间锚时，使用本轮“当前时间”里的具体纪年、季节、月日。',
      '阳历季节：3—5月春、6—8月夏、9—11月秋、12—2月冬；天气、衣着、农事和节庆服从月份。',
    ],
  },
  {
    id: 'style-register',
    title: '文风与叙事语域',
    kind: '写作规则',
    lifecycle: '全局常驻',
    authority: '文风参考',
    order: 60,
    dependsOn: ['叙事风格', '叙事基调', '语义信号'],
    exitWhen: '永不退出',
    content: [
      '基础文风只调节镜头和措辞；生活用于日常，命运用于不可逆轨迹变化，传承只用于有既有因果支撑的高潮或收束。',
      '时间跨度不能让语域自动升级；不用宏大词堆砌代替因果。',
    ],
  },
  {
    id: 'branch-policy',
    title: '命运分支',
    kind: '流程指令',
    lifecycle: '全局常驻',
    authority: '玩家意图',
    order: 70,
    dependsOn: ['语义信号', '分支冷却'],
    exitWhen: '永不退出',
    content: [
      '命运分支只用于改变身份、核心关系、长期目标、关键资源、阵营、存亡等不可逆轨迹的高重要度抉择。',
      '选项只写行动、立场或方向，不承诺成功；分支必须高重要度、不可逆并使用命运或传承语域。',
    ],
  },
  {
    id: 'chinese-output-protocol',
    title: '基础输出约束',
    kind: '输出协议',
    lifecycle: '全局常驻',
    authority: '世界与协议',
    order: 80,
    dependsOn: ['本轮引导'],
    exitWhen: '永不退出',
    content: buildNarrativeAIProtocolBaseRules(),
  },
  {
    id: 'chinese-protocol-standard-example',
    title: '标准返回示例',
    kind: '示例',
    lifecycle: '全局常驻',
    authority: '世界与协议',
    order: 90,
    dependsOn: ['基础输出约束', '中文字段指南'],
    exitWhen: '永不退出',
    content: buildNarrativeAIProtocolStandardExample(),
  },
] as const

export const NARRATIVE_SYSTEM_COMPONENTS: readonly NarrativePromptComponent[] =
  NARRATIVE_SYSTEM_COMPONENT_DEFINITIONS.map((component) => ({
    ...component,
    assemblyPosition: '系统固定前缀',
    loadWhen: '每次主叙事调用',
    acceptanceEvidence: 'npm run test:narrative-protocol',
  }))

/** 将一次性格式修复声明为仅修复调用加载的组件。 */
export function createNarrativeRepairComponent(content: string): NarrativePromptComponent {
  return {
    id: 'narrative-format-repair',
    title: '格式修复',
    kind: '格式修复',
    lifecycle: '仅修复加载',
    authority: '世界与协议',
    order: 10,
    dependsOn: ['失败原因', '上一版完整输出', '中文输出协议'],
    assemblyPosition: '格式修复',
    loadWhen: '首轮输出未通过协议信封、中文 Schema、命运意图或三段结构门禁',
    exitWhen: '一次完整格式修复调用结束',
    acceptanceEvidence: 'npm run test:narrative-protocol && npm run validate:narrative',
    content,
  }
}

export function compileNarrativePromptComponents(
  components: readonly NarrativePromptComponent[],
): string {
  const ordered = [...components].sort((a, b) => a.order - b.order)
  const seenTitles = new Set<string>()
  const parts: string[] = []
  for (const component of ordered) {
    if (seenTitles.has(component.title)) {
      throw new Error(`主叙事提示词组件标题重复：${component.title}`)
    }
    seenTitles.add(component.title)
    const content = Array.isArray(component.content)
      ? component.content.join('\n')
      : component.content
    if (content.trim()) parts.push(content.trim())
  }
  return parts.join('\n')
}

/** 动态组件按权威与顺序装配为紧凑文本；组件元数据只供本地治理，不发送给 AI。 */
export function compileNarrativeDynamicComponents(
  components: readonly NarrativePromptComponent[],
): string | undefined {
  const seen = new Set<string>()
  const parts: string[] = []
  for (const component of [...components].sort((a, b) => a.order - b.order)) {
    if (seen.has(component.id)) {
      throw new Error(`主叙事动态提示词组件重复：${component.id}`)
    }
    seen.add(component.id)
    const content = Array.isArray(component.content)
      ? component.content.join('\n')
      : component.content
    if (content.trim()) parts.push(content.trim())
  }
  return parts.length > 0 ? parts.join('\n') : undefined
}

export const COMPILED_NARRATIVE_SYSTEM_PROMPT = compileNarrativePromptComponents(
  NARRATIVE_SYSTEM_COMPONENTS,
)
