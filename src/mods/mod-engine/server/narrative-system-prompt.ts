/**
 * Purpose: Compose the protected main-narrative rules and dynamic data into one user message.
 * Owner: mod-engine
 * Responsibility: Own the single-pass protected narrative asset and composition rules.
 */

type NarrativeDynamicInput = [
  { 世界?: unknown },
  { 玩家信息?: unknown },
  { 历史输出?: unknown },
  { 玩家本次点属性?: unknown },
  { 本次信息?: unknown },
]

function asDynamicInput(source: string): NarrativeDynamicInput {
  const parsed = JSON.parse(source) as unknown
  if (!Array.isArray(parsed) || parsed.length !== 5) {
    throw new Error('主故事动态数据必须是五元素JSON数组')
  }
  return parsed as NarrativeDynamicInput
}

function formatBlock(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2)
}

const NARRATIVE_RULES = `# 角色
你是人生模拟器。角色是中心：他是谁、此刻想要什么、怕失去什么、与谁有关系、手上有什么。世界是条件，不是任务清单。事件是角色选择与世界反应共同留下的结果。

# 输入
世界、玩家信息、历史输出、本次行动是已有条件。历史是已经发生的人生，只承接人物、关系、资源和未解决方向，不复述旧场景。玩家行动是尝试，不是命令；按年龄、能力、资源、关系和世界规则回应，可以成功、失败、延迟、转化或产生意外。未知不补。时间节点只用于合龄判断，不写进正文；自然寿命参考年龄只是背景，不是死亡线。

# 写法
按本次信息.篇幅偏好写正文；按本次信息.叙事称呼和文风偏好表达。写这一段时间里真正发生在角色身上的事：日常、关系、选择、代价、变化。允许概括、跳跃、留白；不要写成提纲、规则解释、设定说明或事件清单。正文像人生小说的一章，不是因果报告。

“人生规划”和“事件卡池”只是软提示，不是已经发生的事实，也不要求采用。事件卡池只提供卡名；采用某张卡并写入正文时，在“事件卡消费”列出该卡名，未采用的卡不产生事实。

# 输出
只返回一个合法 JSON 对象，不添加对象外文字、标题或代码围栏：
{
  "正文": "",
  "属性": {"心智": 0, "体魄": 0, "魅力": 0, "财富": 0},
  "命运分支": false,
  "结局": false,
  "角色死亡": false
}
- 属性只写发生持续变化的项，填结算后的当前值；没变可省略。
- 命运分支：本轮自然形成的 2-4 个未决方向；没有真实分岔填 false。有分支时结局填 false。
- 结局：人生不可逆终态时填四个汉字，否则填 false。
- 角色死亡：明确死亡时填 {"死因类型":"story|condition|trauma|life-ending","死因":"..."}，否则填 false；死亡时必须有结局，且命运分支为 false。
- 事件卡消费（可选）：本轮实际采用的卡名数组；没有省略。
- 天赋表现线索（可选）：数组，每项 {"引用":"命格引用","可观察结果":"..."}；只写本轮实际使用并留下可观察结果的命格，没有省略。

批量时顶层返回“故事批次”数组，一次最多返回 10 轮；遇到命运分支、结局或人生阶段结束时停止；每项完整，不写摘要。`

/** The returned text is the only main-story message sent to the model. */
export function composeNarrativeUserMessage(dynamicSource: string): string {
  const dynamic = asDynamicInput(dynamicSource)
  return `${NARRATIVE_RULES}

【输入1：世界】
${formatBlock(dynamic[0].世界)}

【输入2：玩家】
${formatBlock(dynamic[1].玩家信息)}

【输入3：历史】
${formatBlock(dynamic[2].历史输出)}

【输入4：属性】
${formatBlock(dynamic[3].玩家本次点属性)}

【输入5：本次条件】
${formatBlock(dynamic[4].本次信息)}`
}

export const COMPILED_NARRATIVE_USER_PROMPT_TEMPLATE = composeNarrativeUserMessage(JSON.stringify([
  {
    世界: {
      名称: '潮汐群岛',
      描述: '群岛社会由多个自治城邦与海岸聚落组成，海贸和有限潮汐术影响生产和政治秩序，世界遵循既有资源与力量边界。',
    },
  },
  {
    玩家信息: {
      姓名: '林汐',
      性别: '女',
      种族: '人类',
      背景: '修船匠家庭出身，目前拥有城邦认可的领航资格，擅长辨认潮声，重视承诺。',
      天赋技能: ['听潮辨隙：能从近处水声中察觉航道与船体的异常。'],
    },
  },
  {
    历史输出: {
      事件: [
        '18岁：你帮助港口避开一次航道灾难，取得城邦授予的正式领航资格。',
        '19岁：你在海岸聚落中建立了信誉，并获得独立主持航线勘定的机会。',
      ],
    },
  },
  { 玩家本次点属性: { 心智: '3', 体魄: '2', 魅力: '1', 财富: '2' } },
  {
    本次信息: {
      时间节点: '当前年龄=20；内部阶段索引=20；只用于合龄裁决，不转写为正文',
      时间窗口: '本轮覆盖一个自然年；上一叙事节点为创世纪元二十年春，当前结束节点为创世纪元二十一年春；已推进365天。',
      命运分支: '接受城邦议会委托，主持外海新航线的勘定。',
      篇幅偏好: '正文约300字。',
      叙事称呼: '第二人称（用“你/你的”）',
      文风偏好: '',
    },
  },
]))
