/**
 * Purpose: Provide optional gender and race display choices shared by world presets.
 * Owner: mod-world / preset options.
 * Responsibility: Static option dictionaries only; preset catalog and filtering stay outside.
 */

export const DEFAULT_GENDERS = ['男', '女']

export const ADDITIONAL_GENDERS: Record<string, string> = {
  '哈基米': '🐱',
  '赛博生命体': '🤖',
  '无性别': '⚪',
  '神': '☀️',
  '男娘': '💅',
  '双性': '⚧',
  '非二元': '🏳️‍⚧️',
  '跨性别': '🏳️‍⚧️',
  '流性别': '⬌',
  '薛定谔的性别': '🌀',
  '不方便透露': '🚫',
  '奶龙': '🐉',
  '武装直升机': '🚁',
  '外星生物': '👽',
  '机器人': '🤖',
  '独角兽': '🦄',
  '沃尔玛购物袋': '🛒',
  '性感母蟑螂': '🪳',
  '香菜': '🥬',
  '神奇海螺': '🐚',
}

export const ADDITIONAL_RACES: Record<string, string> = {
  '猫人': '🐱',
  '魔法少女': '✨',
  '虫族': '🐛',
  '虫人': '🐜',
  '狼人': '🐺',
  '蘑菇人': '🍄',
  '神族': '⚡',
  '魅魔': '😈',
  '半精灵': '🧝',
  '半神': '⚡',
  '巨龙': '🐉',
  '天使': '👼',
  '恶魔': '😈',
  '吸血鬼': '🧛',
  '不死族': '💀',
  '亡灵': '💀',
  '丧尸': '🧟',
  '狐妖': '🦊',
  '妖怪': '👹',
  '亚人': '👤',
  '兽人': '🐺',
  '哥布林': '👺',
  '人鱼': '🧜',
  '元素灵': '🌊',
  '树人': '🌳',
  '史莱姆': '💧',
  '仿生人': '🤖',
  '数字生命': '🔢',
  '新人类': '👤',
  '外星人': '👽',
  '人工智能': '🤖',
  '赛亚人': '👊',
  '克苏鲁': '🐙',
  '奇美拉': '🐉',
}
