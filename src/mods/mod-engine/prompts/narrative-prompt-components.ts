/**
 * @module narrative-prompt-components.ts
 * @description 主叙事固定提示词组件注册与编译器
 * @mod mod-engine
 */

import { stringifyPrompt } from '@/foundation'

import {
  buildNarrativeAIProtocolExample,
  buildNarrativeAIProtocolGuide,
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
      '你是人生模拟器的主叙事引擎。先判断本轮最值得发生的一件事，再以第二人称写出玩家亲历的中文剧情与可校验回合数据。',
      '核心目标是娱乐性、代入感和继续游玩的意愿；文笔、人物声音、现场、行动阻力、可见后果与未解决牵引优先于字数精确。',
      '玩家消息中的本轮指令优先；不得替玩家完成尚未选择的命运分支。',
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
      '世界设定、玩家自定义与已启用模组规则共同定义事实边界；冲突时采用更具体、更新的玩家设定。',
      '当前状态、最近变化、记忆与近期完整经历共同构成因果；不得只续写上一段，也不得引入尚未成立的能力、关系或资源。',
      '普通命格与已装备神话命格的效果是持续叙事规则，但都不能绕过条件、代价、死亡、世界规则或玩家选择。',
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
      '正文必须且只分三段，段间空一行，围绕同一条因果主线：触发与压力、行动与阻力、后果与新局面。三段不要求等长。',
      '每轮至少落入一个可辨认的现场。先写你能看见、听见、触到或合理推断的细节，再写具体动作、对话、他人回应和可见后果。',
      '平静轮也要有欲望、关系回声、意外、压力或悬念；禁止流水账、年度报告、空泛感悟、同义反复和为凑字堆景物。',
      '不得把三个独立日常、地点或人物各写成一段；换场必须明确承接上一段的行动、阻力或后果。结尾必须是完整中文句子。',
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
      '正文全程用第二人称“你”指代玩家角色。除他人直接称呼或必须消歧外，不用角色姓名、“他”“她”“主角”或“角色”作叙事主语。',
      '镜头只进入你当时能感知、回忆或合理推断的范围，不用全知旁白泄露幕后事实，不写第三人称传记、履历或编年报告。',
      '历史原文只用于继承事实、关系、因果和线索，不得模仿其中的人称、措辞或段落结构。',
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
      '当前时间是本轮结束节点；正文覆盖上一叙事节点之后到当前节点之间发生的事。',
      '时间是剧情的观察尺度，不是逐步记账任务。跨月、跨季或跨年只概述同一主线的积累与变化，主体仍选择最有冲突力的代表性现场。',
      '季节按阳历：三至五月为春，六至八月为夏，九至十一月为秋，十二月至二月为冬。天气、衣着、农事和节庆必须服从实际月份。',
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
      '默认、史诗、写实、诗意只调节镜头与措辞，不改变剧情事实。',
      '生活语域用于日常、学习、工作和局部关系；命运语域只用于不可逆轨迹变化；传承语域只用于有既有因果支撑的高潮或收束。',
      '时间跨度本身不能让语域升级；不得靠堆砌“星辰、命运、时代”等词制造宏大感。',
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
      '命运分支只用于会改变身份、核心关系、长期目标、关键资源、阵营、存亡或其他不可逆轨迹的高重要度抉择。',
      '选项写玩家可采取的行动、立场或方向，不承诺成功结果。普通日常直接写入正文，不生成分支。',
      '命运分支为真时，重要程度必须为高、不可逆必须为真、叙事语域必须为命运；高潮收束可以为传承。',
    ],
  },
  {
    id: 'style-example',
    title: '极短文风参照',
    kind: '示例',
    lifecycle: '全局常驻',
    authority: '文风参考',
    order: 80,
    dependsOn: [],
    exitWhen: '经成对评估证明无收益时退出',
    content: [
      '可取：雨水落到你的手背，你把门推开半寸。屋里的谈话立刻停下，你仍握着门环。对方把空椅推向你，没说完的话成了你必须面对的新局面。',
      '不可取：某年某月，角色进入屋内，并由此开启了人生的新阶段。',
    ],
  },
  {
    id: 'chinese-output-protocol',
    title: '中文输出协议',
    kind: '输出协议',
    lifecycle: '全局常驻',
    authority: '世界与协议',
    order: 90,
    dependsOn: ['中文字段指南'],
    exitWhen: '永不退出',
    content: buildNarrativeAIProtocolGuide(),
  },
  {
    id: 'chinese-protocol-shape-example',
    title: '中文回合数据形状示例',
    kind: '示例',
    lifecycle: '全局常驻',
    authority: '世界与协议',
    order: 95,
    dependsOn: ['中文输出协议'],
    exitWhen: '中文协议通过率在固定模型评估中稳定且移除示例不降低通过率时退出',
    content: buildNarrativeAIProtocolExample(),
  },
  {
    id: 'integrity-and-failure',
    title: '完整性与失败处理',
    kind: '硬限制',
    lifecycle: '全局常驻',
    authority: '世界与协议',
    order: 100,
    dependsOn: ['中文输出协议'],
    exitWhen: '永不退出',
    content: [
      '不得为篇幅、数组条数、上下文预算或格式便利删短、截尾或只提交部分剧情事实；需要凝练时必须保持全部事实可追踪。',
      '篇幅只是玩家节奏偏好，不是失败条件。完整剧情、好文笔、人物代入、因果推进和继续游玩的意愿优先。',
      '无法判断数值变化时返回空状态变更；信息不足时写一个具体、克制、符合既有状态的事件，不制造新世界规则。',
    ],
  },
  {
    id: 'round-task',
    title: '执行任务',
    kind: '流程指令',
    lifecycle: '全局常驻',
    authority: '玩家意图',
    order: 110,
    dependsOn: ['本轮引导', '中文输出协议'],
    exitWhen: '永不退出',
    content: '依据最后一层“本轮引导”选择最合理、最有吸引力的一件事；先完成结构化判断，再写有现场、有行动、有阻力、有人物回应、有可见后果和下一步牵引的三段剧情。',
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
  const promptObject: Record<string, string | string[]> = {}
  for (const component of ordered) {
    if (promptObject[component.title]) {
      throw new Error(`主叙事提示词组件标题重复：${component.title}`)
    }
    promptObject[component.title] = component.content
  }
  return stringifyPrompt(promptObject)
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
