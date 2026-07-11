/**

 * @module destiny-pattern-content-quality.ts

 * @description 命格文案质量门禁 —— 拦截未来事件 / 出生婴儿场景式描述

 * @mod mod-character

 */



/** 描述未来特定人生阶段 / 尚未发生事件的用语 */

const FUTURE_EVENT_PATTERNS: RegExp[] = [

  /初[一二三]/,

  /高[一二三]/,

  /大[一二三四]/,

  /研[一二三]/,

  /博[一二三]/,

  /毕业后/,

  /参加工作/,

  /参加工作后/,

  /将来会/,

  /日后会/,

  /未来会/,

  /将会/,

  /即将/,

  /一年后/,

  /两年后/,

  /三年后/,

  /\d+年后/,

  /高考/,

  /中考/,

  /上市/,

  /纳斯达克/,

  /期权套现/,

  /命运就此改写/,

  /误打误撞进入/,

  /从此变身/,

  /人生就此/,

  /不料.*后/,

  /没想到.*后/,

]

/** 绝对时间、年龄节点和既往履历；命格必须描述稳定特质，不是人物小传。 */
const BIOGRAPHICAL_EVENT_PATTERNS: RegExp[] = [
  /(?:公元)?\d{3,4}年/,
  /\d{1,3}岁(?:时|那年|前|后|起|开始)/,
  /(?:第一次|有一次|某天|那天|那年|后来|此后|曾经|当时)/,
  /你(?:曾|曾经|路过|遇到|收到|参加了|进入了|离开了|来到|发现了|经历了|目睹了)/,
  /(?:春|夏|秋|冬)(?:天|季|末|初)?，?你(?:去|到|在|曾|路过|遇到)/,
]



/** 出生状态 / 婴儿阶段描写（命格应写特质，不是人生开局场景） */

const BIRTH_STATE_PATTERNS: RegExp[] = [

  /你出生在/,

  /你降生/,

  /降生时/,

  /落地时/,

  /产房/,

  /襁褓/,

  /摇篮/,

  /育幼/,

  /婴儿期/,

  /还是婴儿/,

  /仍是婴儿/,

  /同龄婴儿/,

  /同龄婴/,

  /常婴/,

  /婴孩/,

  /啼哭/,

  /哭闹/,

  /喝奶/,

  /学步/,

  /刚学会/,

  /出生起/,

  /落地起/,

  /出生就/,

  /出生时/,

  /出生那/,

  /父母(?:早|双)逝/,

  /双亲/,

  /宗族/,

  /你打小就/,

  /你从小/,

  /自幼在/,

]



export function hasFutureEventLanguage(text: string, startingAge = 0): boolean {

  const normalized = text.trim()

  if (!normalized) return false



  for (const pattern of FUTURE_EVENT_PATTERNS) {

    if (pattern.test(normalized)) return true

  }

  for (const pattern of BIOGRAPHICAL_EVENT_PATTERNS) {
    if (pattern.test(normalized)) return true
  }



  const ageMatch = normalized.match(/(\d{1,2})岁时/)

  if (ageMatch) {

    const age = Number(ageMatch[1])

    if (!Number.isNaN(age) && age > startingAge) return true

  }



  return false

}



export function hasBirthStateLanguage(text: string): boolean {

  const normalized = text.trim()

  if (!normalized) return false

  return BIRTH_STATE_PATTERNS.some((p) => p.test(normalized))

}



export function rejectsFutureDestinyPatternContent(

  item: { name?: string; description?: string; effect?: string },

  startingAge = 0,

): boolean {

  const parts = [item.name, item.description, item.effect].filter(Boolean) as string[]

  return parts.some((p) => hasFutureEventLanguage(p, startingAge))

}



export function rejectsBirthStateDestinyPatternContent(

  item: { name?: string; description?: string; effect?: string },

): boolean {

  const parts = [item.name, item.description, item.effect].filter(Boolean) as string[]

  return parts.some((p) => hasBirthStateLanguage(p))

}



export const DESTINY_PATTERN_MODERN_EXAMPLE = {

  type: '特征',

  description:

    '你对机械振动与金属共鸣有着本能的辨识力，别人只觉得噪音刺耳，你却能在纷繁声响里分辨结构的节奏与隐患，这份直觉像刻在神经里一样稳定可靠。（58字）',

  effect: '擅长理解机械结构与异常振动',

} as const


