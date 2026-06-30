/**
 * @module name.ts
 * @description 中文名字生成函数（对齐废弃项目 name.ts）
 * @mod mod-character
 */

import { SURNAME_POOL, GIVEN_MALE_POOL, GIVEN_FEMALE_POOL, GIVEN_NEUTRAL_POOL, PRIMITIVE_NAME_POOL } from './name-pools'

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function isCompoundSurname(s: string): boolean {
  return s.length >= 2
}

const CJK_START = 0x4E00
const CJK_END = 0x9FA5

function randomCJKChar(): string {
  for (let i = 0; i < 100; i++) {
    const code = CJK_START + Math.floor(Math.random() * (CJK_END - CJK_START + 1))
    const char = String.fromCodePoint(code)
    if (/^[\u4e00-\u9fa5]$/.test(char)) return char
  }
  return '\u4e00'
}

function buildNameUnicode(): string {
  const surnameLen = Math.random() < 0.3 ? 2 : 1
  let surname = ''
  for (let i = 0; i < surnameLen; i++) {
    surname += randomCJKChar()
  }

  const r = Math.random()
  const givenCount = r < 0.3 ? 1 : r < 0.7 ? 2 : 3

  let given = ''
  const used = new Set<string>()
  for (let i = 0; i < givenCount; i++) {
    let char: string
    let attempts = 0
    do {
      char = randomCJKChar()
      attempts++
    } while (used.has(char) && attempts < 50)
    used.add(char)
    given += char
  }

  return surname + given
}

function buildNamePool(surname: string, pool: string[]): string {
  const isCompound = isCompoundSurname(surname)
  let givenCount: number
  if (isCompound) {
    const r = Math.random()
    givenCount = r < 0.25 ? 1 : r < 0.65 ? 2 : 3
  } else {
    givenCount = Math.random() < 0.5 ? 1 : 2
  }

  let given = ''
  const used = new Set<string>()
  for (let i = 0; i < givenCount; i++) {
    let char: string
    let attempts = 0
    do {
      char = pickRandom(pool)
      attempts++
    } while (used.has(char) && attempts < 50)
    used.add(char)
    given += char
  }

  return surname + given
}

/**
 * 随机生成中文名字
 * @param gender 性别（'男' | '女' | 其他），不传则混合
 * @param isPrimitive 原始社会模式：有概率从原始名字池抽取
 * @returns 随机中文名
 */
export function randomName(gender?: string, isPrimitive = false): string {
  // 原始社会模式：40% 概率走原始名字池
  if (isPrimitive && Math.random() < 0.4) {
    return pickRandom(PRIMITIVE_NAME_POOL)
  }
  // 75% 池选模式，25% Unicode 随机模式
  if (Math.random() < 0.25) {
    return randomNameUnicode(gender)
  }
  return randomNamePool(gender)
}

function randomNameUnicode(gender?: string): string {
  const useCompoundSurname = Math.random() < 0.08
  const compoundSurnames = SURNAME_POOL.filter((s) => s.length >= 2)
  const isCompound = useCompoundSurname && compoundSurnames.length > 0

  if (isCompound) {
    const compound = pickRandom(compoundSurnames)
    let pool: string[]
    if (!gender || gender === '自定义') {
      pool = [...GIVEN_MALE_POOL, ...GIVEN_FEMALE_POOL, ...GIVEN_NEUTRAL_POOL]
    } else if (gender === '男') {
      pool = GIVEN_MALE_POOL
    } else if (gender === '女') {
      pool = GIVEN_FEMALE_POOL
    } else {
      pool = GIVEN_NEUTRAL_POOL
    }
    return buildNamePool(compound, pool)
  }

  return buildNameUnicode()
}

function randomNamePool(gender?: string): string {
  const surname = pickRandom(SURNAME_POOL)

  let pool: string[]
  if (!gender || gender === '自定义') {
    pool = [...GIVEN_MALE_POOL, ...GIVEN_FEMALE_POOL, ...GIVEN_NEUTRAL_POOL]
  } else if (gender === '男') {
    pool = GIVEN_MALE_POOL
  } else if (gender === '女') {
    pool = GIVEN_FEMALE_POOL
  } else {
    pool = GIVEN_NEUTRAL_POOL
  }

  return buildNamePool(surname, pool)
}
