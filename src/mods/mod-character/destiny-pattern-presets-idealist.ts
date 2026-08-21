/**
 * Purpose: Provide built-in destiny-pattern presets for supernatural worlds.
 * Owner: mod-character
 * Responsibility: Static preset content only; generation and selection remain with their systems.
 */

import type { DestinyPattern } from './types'

export const DESTINY_PATTERN_PRESETS_IDEALIST: Omit<DestinyPattern, 'id' | 'category' | 'lineageId' | 'version'>[] = [
  // ===================== 传说命格 =====================
  // ----- 正面 -----
  { name: '天命之子', description: '命运似乎格外眷顾你，绝境中总能寻得一线生机', rarity: 'legendary', effect: '遭遇负面事件概率减半', attrBonus: { talentAptitude: 2 } },
  { name: '万中无一', description: '你在某个领域拥有与生俱来的超凡悟性', rarity: 'legendary', effect: '学习速度翻倍，所有技能上限提升', attrBonus: { talentAptitude: 4, mind: 2 } },
  { name: '灵魂伴侣', description: '你注定会遇到与你心意相通的灵魂伴侣', rarity: 'legendary', effect: '在人生的某个阶段必然遇见完美契合的人', attrBonus: { charisma: 3 } },
  { name: '先知先觉', description: '你偶尔能预感到即将发生的重要事情', rarity: 'legendary', effect: '在关键抉择前获得直觉提示', attrBonus: { mind: 3 } },
  { name: '天赋异禀', description: '你是万中无一的修炼奇才', rarity: 'legendary', effect: '所有修炼速度翻倍，更容易领悟高阶功法', attrBonus: { talentAptitude: 4, mind: 3 } },
  { name: '先天道体', description: '你的身体与道相合，修炼任何功法都事半功倍', rarity: 'legendary', effect: '所有修炼速度三倍，突破瓶颈概率大幅提升', attrBonus: { physique: 3, talentAptitude: 3, mind: 2 } },
  { name: '天生剑骨', description: '你为剑而生，剑道天赋无人能及', rarity: 'legendary', effect: '剑道相关修炼速度四倍，更容易领悟剑法真谛', attrBonus: { talentAptitude: 4, mind: 2, physique: 2 } },
  { name: '先天灵体', description: '你先天就拥有强大的灵力亲和', rarity: 'legendary', effect: '灵力吸收速度三倍，修炼门槛大幅降低', attrBonus: { talentAptitude: 3, mind: 3, physique: 1 } },

  // ===================== 史诗命格 =====================
  // ----- 正面 -----
  { name: '天生领袖', description: '你有一种让人信服的天然魅力，身边总有追随者', rarity: 'epic', effect: '社交成功率大幅提升，更容易获得他人信任', attrBonus: { charisma: 3, talentAptitude: 1 } },
  { name: '过目不忘', description: '你拥有惊人的记忆力，看过的东西几乎不会忘记', rarity: 'epic', effect: '学习效率翻倍，学识相关判定大幅提升', attrBonus: { mind: 3, talentAptitude: 1 } },
  { name: '心灵手巧', description: '你的双手极其灵巧，任何精细活对你而言都很轻松', rarity: 'epic', effect: '手工、艺术、操作类技能学习速度翻倍', attrBonus: { talentAptitude: 3, mind: 1 } },
  { name: '武道奇才', description: '你在武道方面有惊人的天赋', rarity: 'epic', effect: '武道修炼速度翻倍，领悟能力大幅提升', attrBonus: { talentAptitude: 3, physique: 2, mind: 1 } },
  { name: '金丹道种', description: '你体内天生就有金丹道种的种子', rarity: 'epic', effect: '金丹大道修炼异常顺利，突破概率大幅提升', attrBonus: { talentAptitude: 3, physique: 2 } },
  { name: '剑心通明', description: '你的剑心通透，练剑事半功倍', rarity: 'epic', effect: '剑法修炼速度翻倍，领悟剑法更容易', attrBonus: { talentAptitude: 3, mind: 2 } },
  { name: '炼体奇才', description: '你的身体特别适合炼体功法', rarity: 'epic', effect: '炼体功法修炼速度翻倍，身体强度提升更快', attrBonus: { physique: 3, talentAptitude: 2 } },
  { name: '五行灵根', description: '你拥有完整的五行灵根，道法皆通', rarity: 'epic', effect: '所有五行道法修炼速度翻倍，没有克制属性', attrBonus: { talentAptitude: 2, mind: 2, physique: 1 } },
  // ----- 中立 -----
  { name: '慧极必伤', description: '太过聪明所以看透世态炎凉，内心比常人更加敏感脆弱', rarity: 'epic', effect: '智力大幅提升但易受情绪影响，精神状态易波动', attrBonus: { mind: 3 } },
  { name: '天选之子', description: '你似乎是被某种更高存在选中的人，人生轨迹格外特殊', rarity: 'epic', effect: '重要节点有额外选项，人生起伏更为剧烈', attrBonus: { mind: 1, charisma: 1 } },

  // ===================== 稀有命格 =====================
  // ----- 正面 -----
  { name: '人见人爱', description: '你天生讨人喜欢，走到哪里都能交到朋友', rarity: 'rare', effect: '社交互动获得额外好感加成', attrBonus: { charisma: 2 } },
  { name: '第六感', description: '你对危险和机遇有特别敏锐的直觉', rarity: 'rare', effect: '在重大抉择时获得微弱的直觉提示', attrBonus: {} },
  { name: '艺术天赋', description: '你在艺术方面有特别的领悟力', rarity: 'rare', effect: '艺术创作类技能收益翻倍', attrBonus: { talentAptitude: 2, mind: 1 } },
  { name: '意志力', description: '你的意志力远超常人，在困境中更难被打垮', rarity: 'rare', effect: '逆境中坚持的概率大幅提升', attrBonus: { mind: 2 } },
  { name: '炼气天赋', description: '你在炼气方面有特别的天赋', rarity: 'rare', effect: '炼气速度提升50%，基础更扎实', attrBonus: { talentAptitude: 2, mind: 1 } },
  { name: '内功深厚', description: '你天生就有不俗的内功底子', rarity: 'rare', effect: '内功修炼速度提升，内力比常人更浑厚', attrBonus: { talentAptitude: 2, physique: 1 } },
  { name: '骨骼精奇', description: '你的骨骼特别适合修炼武功', rarity: 'rare', effect: '外功修炼速度大幅提升', attrBonus: { physique: 2, talentAptitude: 1 } },
  { name: '悟性奇高', description: '你领悟任何东西都特别快', rarity: 'rare', effect: '所有修炼领悟速度大幅提升', attrBonus: { mind: 2, talentAptitude: 2 } },
  { name: '道心坚定', description: '你的道心坚如磐石，不受外界干扰', rarity: 'rare', effect: '修炼不易走火入魔，突破概率提升', attrBonus: { mind: 2 } },
  { name: '药道天赋', description: '你在炼丹制药方面有特别的天赋', rarity: 'rare', effect: '炼丹制药成功率大幅提升，药效更好', attrBonus: { talentAptitude: 2, mind: 1 } },
  // ----- 中立 -----
  { name: '沉默寡言', description: '你不爱说话，但这让你更能专注于手头的事情', rarity: 'rare', effect: '独自工作时效率提升，但社交略微困难', attrBonus: { mind: 1, charisma: -1 } },
  { name: '精神敏感', description: '你能轻易感知到周围人的情绪波动', rarity: 'rare', effect: '社交判断更准确，但也更易受他人情绪影响', attrBonus: { charisma: 1, mind: 1 } },

  // ===================== 精良命格 =====================
  // ----- 正面 -----
  { name: '善于倾听', description: '你是很好的倾听者，别人愿意向你倾诉', rarity: 'fine', effect: '获得他人信任的速度更快', attrBonus: { charisma: 1 } },
  { name: '直觉准', description: '你的直觉偶尔会出奇地准', rarity: 'fine', effect: '随机事件中偶尔获得正向偏向', attrBonus: {} },
  { name: '炼气有成', description: '你在炼气方面小有天赋', rarity: 'fine', effect: '炼气速度有小幅提升', attrBonus: { talentAptitude: 1 } },
  { name: '筋骨强健', description: '你的筋骨比常人强健', rarity: 'fine', effect: '外功修炼有小幅优势', attrBonus: { physique: 1 } },
  { name: '心思缜密', description: '你心思缜密，不易在修炼中出错', rarity: 'fine', effect: '修炼走火入魔概率降低', attrBonus: { mind: 1 } },
  { name: '耐力超群', description: '你的耐力比一般人强', rarity: 'fine', effect: '能坚持更长时间修炼', attrBonus: { physique: 1, mind: 1 } },
  { name: '记忆力强', description: '你的记忆力不错，过目不忘', rarity: 'fine', effect: '背诵秘籍和功法更快', attrBonus: { mind: 1 } },
  { name: '身手敏捷', description: '你的身手比一般人敏捷', rarity: 'fine', effect: '轻功和身法有小幅优势', attrBonus: { physique: 1 } },
  // ----- 中立 -----
  { name: '内向性格', description: '你喜欢独处，在安静环境中工作效率更高', rarity: 'fine', effect: '独自工作效率+，社交场合略-', attrBonus: { mind: 1, charisma: -1 } },
  { name: '浪漫主义', description: '你看待世界的方式充满诗意', rarity: 'fine', effect: '感情事件获得额外加成，现实事务略感吃力', attrBonus: { charisma: 1 } },
  { name: '追求完美', description: '你对自己要求很高，凡事都想做到最好', rarity: 'fine', effect: '作品质量更高，但耗时更长', attrBonus: { talentAptitude: 1, mind: -1 } },
  // ----- 负面 -----
  { name: '不拘小节', description: '你对细节不太在意，或者说根本懒得在意', rarity: 'fine', effect: '细节相关的工作容易出错', attrBonus: { mind: -1, charisma: 1 } },

  // ===================== 普通命格 =====================
  // ----- 正面 -----
  { name: '思维敏捷', description: '你的脑子转得比别人稍微快一点点', rarity: 'common', effect: '基础智力略有优势', attrBonus: { mind: 1 } },
  { name: '运气尚可', description: '你的运气不算差，偶尔能遇到点好事', rarity: 'common', effect: '随机事件略有正向偏向', attrBonus: {} },
  { name: '平凡天赋', description: '与常人无异的普通天赋，没什么特别的', rarity: 'common', effect: '无特殊效果', attrBonus: {} },
  { name: '感性', description: '你更容易被情感打动', rarity: 'common', effect: '艺术和情感类事件有加成', attrBonus: { charisma: 1 } },
  { name: '乐观', description: '你总是看到事情好的一面', rarity: 'common', effect: '负面事件影响减半', attrBonus: {} },
  { name: '细腻', description: '你能注意到别人忽略的细节', rarity: 'common', effect: '细节相关工作有加成', attrBonus: { mind: 1 } },
  { name: '爱好武道', description: '你对武道有浓厚的兴趣', rarity: 'common', effect: '武道相关修炼有小幅加成', attrBonus: { talentAptitude: 1 } },
  { name: '身体灵活', description: '你的身体比一般人灵活', rarity: 'common', effect: '身法和轻功有小幅优势', attrBonus: { physique: 1 } },
  { name: '意志坚强', description: '你的意志比一般人坚强', rarity: 'common', effect: '修炼遇到困难时更容易坚持', attrBonus: { mind: 1 } },
  { name: '兴趣广泛', description: '你对各种知识都有兴趣', rarity: 'common', effect: '涉猎其他领域时有加成', attrBonus: { talentAptitude: 1 } },
  { name: '沉得住气', description: '你性格沉稳，不骄不躁', rarity: 'common', effect: '修炼速度平稳，不易出岔子', attrBonus: { mind: 1 } },
  { name: '身强体健', description: '你的身体比一般人健康', rarity: 'common', effect: '基础体质有小幅优势', attrBonus: { physique: 1 } },
  { name: '喜欢看书', description: '你喜欢阅读各种书籍', rarity: 'common', effect: '学识积累速度略快', attrBonus: { mind: 1 } },
  { name: '动手能力强', description: '你动手做事情挺厉害的', rarity: 'common', effect: '手工类任务略占优势', attrBonus: { talentAptitude: 1 } },
  { name: '喜欢种花', description: '你喜欢养花种草', rarity: 'common', effect: '生活情趣增加', attrBonus: { talentAptitude: 1 } },
  // ----- 中立 -----
  { name: '话痨', description: '你特别能聊，和谁都能搭上话', rarity: 'common', effect: '社交破冰容易，但言多必失', attrBonus: { charisma: 1 } },
  { name: '容易相信人', description: '你觉得世界上还是好人多', rarity: 'common', effect: '获得信任更快，但也更容易被骗', attrBonus: { charisma: 1 } },
  { name: '白日梦', description: '你经常沉浸在自己的想象世界里', rarity: 'common', effect: '创意类工作有加成，但现实中容易走神', attrBonus: { talentAptitude: 1, mind: -1 } },
  { name: '理想主义', description: '你相信世界可以变得更美好', rarity: 'common', effect: '坚持原则更容易，但现实中可能碰壁', attrBonus: { charisma: 1 } },
  { name: '共情', description: '你能感同身受他人的喜怒哀乐', rarity: 'common', effect: '社交更顺利，但也更容易心累', attrBonus: { charisma: 1, mind: -1 } },
  // ----- 负面 -----
  { name: '社恐倾向', description: '你在人多的场合会有些不自在', rarity: 'common', effect: '大型社交场合略微不利', attrBonus: { charisma: -1 } },
  { name: '体质较弱', description: '你体质比一般人差一点', rarity: 'common', effect: '容易生病', attrBonus: { physique: -1 } },
  { name: '不善言辞', description: '你说话不太利索', rarity: 'common', effect: '表达容易出问题', attrBonus: { charisma: -1 } },
]
