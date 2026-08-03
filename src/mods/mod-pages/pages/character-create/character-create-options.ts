/**
 * Purpose: Define character-creation labels, option icons, and display adapters.
 * Owner: mod-pages/character-create
 * Responsibility: Stable presentation metadata only; form state remains in the page hook.
 */

import { RACE_LIFESPAN } from '@/mods/mod-character'

const DEFAULT_GENDER_ICONS: Record<string, string> = {
  '男': '♂️', '女': '♀️',
}

export const ADDITIONAL_GENDERS: Record<string, string> = {
  '哈基米': '🐱', '赛博生命体': '🤖', '无性别': '⚪', '神': '☀️',
  '男娘': '💅', '双性': '⚧', '非二元': '🏳️‍⚧️', '跨性别': '🏳️‍⚧️',
  '流性别': '⬌', '薛定谔的性别': '🌀', '不方便透露': '🚫', '奶龙': '🐉',
  '武装直升机': '🚁', '外星生物': '👽', '机器人': '🤖', '独角兽': '🦄',
  '沃尔玛购物袋': '🛒', '性感母蟑螂': '🪳', '香菜': '🥬', '神奇海螺': '🐚',
}

const DEFAULT_RACE_ICONS: Record<string, string> = {
  '人类': '🧑', '妖族': '🦊', '魔族': '👿', '精灵': '🧝', '龙裔': '🐲',
  'AI意识体': '💻', '灵兽': '🐉', '灵体': '👻', '半妖': '👤',
}

const BG_PRESET_ICONS: Record<string, string> = {
  '贵族': '👑', '平民': '👤', '科学家': '🔬', '武士': '⚔️',
  '忍者': '🥷', '浪人': '🍂', '商人': '💰', '孤儿': '💔',
  '学者': '📚', '街头': '🏚️', '农家': '🌾', '流浪者': '🚶',
}

export const LABELS = {
  headerIcon: '👤' as const,
  headerTitle: '角色设定' as const,
  headerSubtitle: '设定你的性别和物种' as const,
  nameLabel: '姓名' as const,
  nameHint: '(可选，留空则从本地姓名库随机生成)' as const,
  namePlaceholder: '输入角色姓名...' as const,
  diceBtnTitle: '随机名称' as const,
  genderLabel: '性别' as const,
  genderHint: '（默认：男）' as const,
  moreBtnText: '更多' as const,
  moreGenderBtnTitle: '添加更多性别选项' as const,
  maleText: '男' as const,
  femaleText: '女' as const,
  customGenderPlaceholder: '输入性别名称...' as const,
  customAddBtn: '添加' as const,
  raceLabel: '种族' as const,
  moreRaceBtnTitle: '添加更多种族选项' as const,
  humanRaceText: '人类' as const,
  customRaceText: '自定义' as const,
  raceSearchPlaceholder: '搜索种族...' as const,
  customRacePlaceholder: '输入种族名称...' as const,
  lifespanLabel: '寿命设定' as const,
  detectBtnText: '🔄 检测寿命' as const,
  detectBtnTitle: '根据种族/背景重新计算寿命与起始年龄' as const,
  lifespanPlaceholder: '寿命上限(岁)' as const,
  startingAgePlaceholder: '起始年龄(岁)' as const,
  autoHint: '留空则自动' as const,
  lifespanPrefix: '🕐 寿命约' as const,
  lifespanUnit: '岁' as const,
  startingAgePrefix: '· 起始' as const,
  startingAgeUnit: '岁' as const,
  birthText: '· 出生' as const,
  bgLabel: '背景信息' as const,
  bgHint: '(可选)' as const,
  bgPlaceholder: '告诉命运编织者更多关于你的角色的事...' as const,
  presetNamePlaceholder: '预设名称...' as const,
  saveBtn: '保存' as const,
  cancelBtn: '取消' as const,
  savePresetBtn: '+ 保存预设' as const,
  backTitle: '返回世界选择' as const,
  backTitleMobile: '返回' as const,
  confirmText: '确认' as const,
  raceInfoPrefix: '基础寿命' as const,
  raceInfoYearUnit: '年' as const,
  charCountSeparator: '/' as const,
  raceDisplaySeparator: ' · ' as const,
}

export function getGenderIcon(gender: string): string {
  return DEFAULT_GENDER_ICONS[gender] || ADDITIONAL_GENDERS[gender] || '👤'
}

export function getRaceDisplayName(race: string): string {
  return RACE_LIFESPAN[race]?.name || race
}

export function getRaceIcon(race: string): string {
  return DEFAULT_RACE_ICONS[getRaceDisplayName(race)] || '👤'
}

export function getBgPresetIcon(name: string): string {
  return BG_PRESET_ICONS[name] || '📋'
}

export function isGenderOptionActive(option: string, current: string): boolean {
  if (option === '男') return current === 'male'
  if (option === '女') return current === 'female'
  return current === option
}

export function genderOptionToValue(option: string): 'male' | 'female' {
  if (option === '男') return 'male'
  if (option === '女') return 'female'
  return option as 'male' | 'female'
}
