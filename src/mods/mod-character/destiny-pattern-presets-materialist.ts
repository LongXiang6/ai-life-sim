/**
 * @module destiny-pattern-presets-materialist.ts
 * @description 唯物世界观命格预设库（对齐废弃项目 talent-presets-life-materialist.ts）
 *   —— 纯现实/纯科技世界，命格偏身体/物质/实践技能
 *   —— 已移除 luck 字段，由 LuckSystem 独立管理
 * @mod mod-character
 */

import type { DestinyPattern } from './types'

export const DESTINY_PATTERN_PRESETS_MATERIALIST: Omit<DestinyPattern, 'id'>[] = [
  // ===================== 传说命格 =====================
  // ----- 正面 -----
  { name: '铁打的身躯', description: '你的身体恢复能力远超常人，伤病很难击倒你', rarity: 'legendary', effect: '体质抗性大幅提升，伤病恢复速度翻倍', polarity: 'positive', attrBonus: { physique: 4 } },
  { name: '商业巨头', description: '你对商业运作的直觉无懈可击，白手起家也能建立商业帝国', rarity: 'legendary', effect: '所有商业判定大幅提升，资本积累速度翻倍', polarity: 'positive', attrBonus: { resources: 4, mind: 2, charisma: 1 } },
  { name: '天生赢家', description: '你好像做什么都比别人容易成功', rarity: 'legendary', effect: '所有竞争类事件获得巨大优势', polarity: 'positive', attrBonus: { mind: 1, charisma: 1 } },
  { name: '工匠精神', description: '你在任何领域都追求极致，作品质量远超常人', rarity: 'legendary', effect: '所有技能类事件成果质量翻倍', polarity: 'positive', attrBonus: { talentAptitude: 3, mind: 2 } },
  { name: '机械天才', description: '你对机械的理解超越常人，任何复杂的机械在你面前都如玩具', rarity: 'legendary', effect: '机械相关技能学习速度四倍，发明创造能力大幅提升', polarity: 'positive', attrBonus: { talentAptitude: 4, mind: 3 } },
  { name: '编程大师', description: '你天生就是编程的料，任何编程语言都能快速上手', rarity: 'legendary', effect: '编程技能学习速度四倍，代码质量和效率大幅提升', polarity: 'positive', attrBonus: { talentAptitude: 4, mind: 3 } },
  { name: '金融帝王', description: '你对金融市场的直觉无人能及，任何投资都能获得超额回报', rarity: 'legendary', effect: '所有金融相关事件获得巨大优势，资本积累速度三倍', polarity: 'positive', attrBonus: { resources: 4, mind: 3, charisma: 1 } },
  { name: '全能学霸', description: '你是真正的学神，任何知识都能快速掌握', rarity: 'legendary', effect: '所有技能学习速度三倍，学科上限大幅提升', polarity: 'positive', attrBonus: { talentAptitude: 4, mind: 3 } },

  // ===================== 史诗命格 =====================
  // ----- 正面 -----
  { name: '商业奇才', description: '你对财富有着天生的嗅觉，投资总能获得超额回报', rarity: 'epic', effect: '经商收入翻倍，理财决策成功率高', polarity: 'positive', attrBonus: { resources: 3, mind: 1 } },
  { name: '健身达人', description: '你的身体素质和身材管理堪称完美', rarity: 'epic', effect: '体质相关判定大幅提升，外在形象加分', polarity: 'positive', attrBonus: { physique: 3, charisma: 1 } },
  { name: '技术天才', description: '你在技术领域有特别的天赋', rarity: 'epic', effect: '技术类技能学习速度翻倍，创新能力大幅提升', polarity: 'positive', attrBonus: { mind: 3, talentAptitude: 1 } },
  { name: '理财专家', description: '你对数字和财务异常敏感，总能做出最优决策', rarity: 'epic', effect: '财富积累速度翻倍，投资风险大幅降低', polarity: 'positive', attrBonus: { resources: 3, mind: 1 } },
  { name: '黑客高手', description: '你在网络安全方面有惊人的天赋', rarity: 'epic', effect: '黑客技能学习速度翻倍，入侵和防御能力大幅提升', polarity: 'positive', attrBonus: { talentAptitude: 3, mind: 2 } },
  { name: '物理天才', description: '你对物理规律的理解远超常人', rarity: 'epic', effect: '物理相关技能学习速度翻倍，工程能力大幅提升', polarity: 'positive', attrBonus: { mind: 3, talentAptitude: 2 } },
  { name: '生物专家', description: '你对生命科学有特别的天赋', rarity: 'epic', effect: '生物相关技能学习速度翻倍，医学和生物工程能力大幅提升', polarity: 'positive', attrBonus: { mind: 3, talentAptitude: 2 } },
  { name: '化学达人', description: '你对化学的理解和应用能力超强', rarity: 'epic', effect: '化学相关技能学习速度翻倍，实验成功率大幅提升', polarity: 'positive', attrBonus: { mind: 3, talentAptitude: 2 } },
  { name: '数学天才', description: '你对数字和逻辑有惊人的天赋', rarity: 'epic', effect: '数学相关技能学习速度翻倍，逻辑推理能力大幅提升', polarity: 'positive', attrBonus: { mind: 3, talentAptitude: 1 } },
  // ----- 中立 -----
  { name: '逆天改命', description: '你不甘于平凡的命运，总能在关键时刻突破极限', rarity: 'epic', effect: '每次重大抉择时有概率触发额外选项', polarity: 'mixed', attrBonus: { physique: -1 } },

  // ===================== 稀有命格 =====================
  // ----- 正面 -----
  { name: '运动健将', description: '你的身体素质出类拔萃，擅长各种运动', rarity: 'rare', effect: '体力消耗减半，运动相关判定大幅提升', polarity: 'positive', attrBonus: { physique: 2 } },
  { name: '手眼通天', description: '你的手工艺技巧精湛无比，做什么都又快又好', rarity: 'rare', effect: '手工技能熟练度获取速度翻倍', polarity: 'positive', attrBonus: { talentAptitude: 2 } },
  { name: '谈判高手', description: '你总能在谈判中获得最大利益', rarity: 'rare', effect: '商业和社交谈判获得大幅优势', polarity: 'positive', attrBonus: { charisma: 2, mind: 1 } },
  { name: '精明能干', description: '你把个人生活打理得井井有条', rarity: 'rare', effect: '日常事务效率大幅提升，生活成本降低', polarity: 'positive', attrBonus: { resources: 2, mind: 1 } },
  { name: '机械精通', description: '你对各种机械都很精通', rarity: 'rare', effect: '机械相关技能学习速度大幅提升', polarity: 'positive', attrBonus: { talentAptitude: 2, mind: 1 } },
  { name: '编程天赋', description: '你在编程方面有特别的天赋', rarity: 'rare', effect: '编程技能学习速度大幅提升', polarity: 'positive', attrBonus: { talentAptitude: 2, mind: 1 } },
  { name: '商业敏感', description: '你对商业机会有敏锐的嗅觉', rarity: 'rare', effect: '商业相关事件有大幅优势', polarity: 'positive', attrBonus: { resources: 2, mind: 1 } },
  { name: '工程思维', description: '你天生就有工程思维', rarity: 'rare', effect: '工程相关技能学习速度大幅提升', polarity: 'positive', attrBonus: { talentAptitude: 2, mind: 1 } },
  { name: '科学天赋', description: '你对科学有特别的领悟力', rarity: 'rare', effect: '科学相关技能学习速度大幅提升', polarity: 'positive', attrBonus: { mind: 2, talentAptitude: 1 } },
  { name: '分析能力', description: '你的逻辑分析能力特别强', rarity: 'rare', effect: '分析类事件获得大幅优势', polarity: 'positive', attrBonus: { mind: 2 } },
  // ----- 中立 -----
  { name: '工作狂', description: '你工作起来废寝忘食，效率奇高', rarity: 'rare', effect: '工作效率翻倍，但需要付出健康代价', polarity: 'mixed', attrBonus: { talentAptitude: 2, physique: -1 } },
  // ----- 负面 -----
  { name: '过劳成疾', description: '你太拼了，身体已经亮起红灯', rarity: 'rare', effect: '长期高强度工作会持续扣除体力值', polarity: 'negative', attrBonus: { physique: -2, resources: 1 } },

  // ===================== 精良命格 =====================
  // ----- 正面 -----
  { name: '能说会道', description: '你的口才不错，能在大多数场合得体地表达自己', rarity: 'fine', effect: '社交场合略有优势', polarity: 'positive', attrBonus: { charisma: 1 } },
  { name: '勤俭持家', description: '你懂得量入为出，钱财管理得当', rarity: 'fine', effect: '日常开销略微降低', polarity: 'positive', attrBonus: { resources: 1 } },
  { name: '动手能力强', description: '你的动手能力不错', rarity: 'fine', effect: '手工和维修类任务有小优势', polarity: 'positive', attrBonus: { talentAptitude: 1 } },
  { name: '精打细算', description: '你把每一分钱都花在刀刃上', rarity: 'fine', effect: '日常开销有小幅节省', polarity: 'positive', attrBonus: { resources: 1 } },
  { name: '身体结实', description: '你的身体比一般人更耐造', rarity: 'fine', effect: '体力有小幅提升', polarity: 'positive', attrBonus: { physique: 1 } },
  { name: '理科思维', description: '你比较擅长理科', rarity: 'fine', effect: '理科相关技能有小优势', polarity: 'positive', attrBonus: { mind: 1 } },
  { name: '逻辑清晰', description: '你的逻辑思维很清晰', rarity: 'fine', effect: '逻辑类事件有小优势', polarity: 'positive', attrBonus: { mind: 1 } },
  { name: '数字敏感', description: '你对数字比较敏感', rarity: 'fine', effect: '数学和财务类任务有小优势', polarity: 'positive', attrBonus: { mind: 1, resources: 1 } },
  { name: '动手达人', description: '你喜欢动手做东西', rarity: 'fine', effect: '手工类任务有小优势', polarity: 'positive', attrBonus: { talentAptitude: 1 } },
  { name: '商业头脑', description: '你有点商业头脑', rarity: 'fine', effect: '商业相关事件有小优势', polarity: 'positive', attrBonus: { resources: 1, mind: 1 } },
  // ----- 负面 -----
  { name: '体弱多病', description: '从小就三天两头往医院跑，身体底子比较差', rarity: 'fine', effect: '体力上限略微降低，伤病概率增加', polarity: 'negative', attrBonus: { physique: -1 } },

  // ===================== 普通命格 =====================
  // ----- 正面 -----
  { name: '身体健康', description: '你拥有健康的体魄，没什么明显缺陷', rarity: 'common', effect: '基础体质略有优势', polarity: 'positive', attrBonus: { physique: 1 } },
  { name: '乐天派', description: '无论发生什么你都能笑着面对，也因此承受力远超常人', rarity: 'common', effect: '负面事件的影响减半，幸福感更易保持', polarity: 'positive', attrBonus: {} },
  { name: '勤劳', description: '你相信努力付出总有回报', rarity: 'common', effect: '工作效率有小幅提升', polarity: 'positive', attrBonus: { talentAptitude: 1 } },
  { name: '节俭', description: '你从不乱花钱', rarity: 'common', effect: '日常开支有轻微节省', polarity: 'positive', attrBonus: { resources: 1 } },
  { name: '健壮', description: '你的身体比一般人更结实', rarity: 'common', effect: '基础体质有小幅优势', polarity: 'positive', attrBonus: { physique: 1 } },
  { name: '冷静', description: '你遇事总能保持冷静', rarity: 'common', effect: '危机处理有小幅优势', polarity: 'positive', attrBonus: { mind: 1 } },
  { name: '细心', description: '你做事情很细致认真', rarity: 'common', effect: '细节相关工作有加成', polarity: 'positive', attrBonus: { mind: 1 } },
  { name: '麻利', description: '你做事情干脆利落', rarity: 'common', effect: '工作效率有小幅提升', polarity: 'positive', attrBonus: { talentAptitude: 1 } },
  { name: '喜欢钻研', description: '你喜欢钻研技术问题', rarity: 'common', effect: '学习技术时有小幅加成', polarity: 'positive', attrBonus: { talentAptitude: 1 } },
  { name: '动手能力不错', description: '你的动手能力比一般人强', rarity: 'common', effect: '手工类任务有小幅加成', polarity: 'positive', attrBonus: { talentAptitude: 1 } },
  { name: '数学不错', description: '你的数学比一般人好', rarity: 'common', effect: '数学相关任务有小幅加成', polarity: 'positive', attrBonus: { mind: 1 } },
  { name: '喜欢科技', description: '你对科技产品有浓厚的兴趣', rarity: 'common', effect: '学习科技类知识时有加成', polarity: 'positive', attrBonus: { talentAptitude: 1 } },
  { name: '理性思维', description: '你习惯用理性思考问题', rarity: 'common', effect: '分析类事件有小幅加成', polarity: 'positive', attrBonus: { mind: 1 } },
  { name: '动手实践', description: '你喜欢通过实践学习', rarity: 'common', effect: '实践类学习有小幅加成', polarity: 'positive', attrBonus: { talentAptitude: 1 } },
  { name: '喜欢读书', description: '你喜欢阅读各种书籍', rarity: 'common', effect: '学识积累速度略快', polarity: 'positive', attrBonus: { mind: 1 } },
  { name: '喜欢整洁', description: '你喜欢整洁的环境', rarity: 'common', effect: '生活环境舒适，心情愉悦', polarity: 'positive', attrBonus: { mind: 1 } },
  { name: '喜欢音乐', description: '你喜欢听音乐', rarity: 'common', effect: '生活品味略有提升', polarity: 'positive', attrBonus: { talentAptitude: 1 } },
  { name: '喜欢旅行', description: '你喜欢去不同的地方', rarity: 'common', effect: '见识更广', polarity: 'positive', attrBonus: { mind: 1 } },
  // ----- 中立 -----
  { name: '务实', description: '你只相信看得见摸得着的东西', rarity: 'common', effect: '现实事务有加成，但缺乏想象力', polarity: 'mixed', attrBonus: { mind: 1, talentAptitude: -1 } },
  { name: '爱财', description: '你对金钱格外敏感', rarity: 'common', effect: '理财有加成，但可能为了钱做出妥协', polarity: 'mixed', attrBonus: { resources: 1, charisma: -1 } },
  { name: '现实', description: '你很现实，从不过高期望', rarity: 'common', effect: '不容易失望，但缺乏激情', polarity: 'mixed', attrBonus: { mind: 1, charisma: -1 } },
  // ----- 负面 -----
  { name: '手头拮据', description: '你好像天生和钱过不去，钱包总是瘪的', rarity: 'common', effect: '初始资金略微减少', polarity: 'negative', attrBonus: { resources: -1 } },
  { name: '体质较弱', description: '你体质比一般人差一点', rarity: 'common', effect: '容易生病', polarity: 'negative', attrBonus: { physique: -1 } },
  { name: '不善言辞', description: '你说话不太利索', rarity: 'common', effect: '表达容易出问题', polarity: 'negative', attrBonus: { charisma: -1 } },
]
