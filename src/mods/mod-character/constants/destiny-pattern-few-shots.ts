/**
 * @module destiny-pattern-few-shots.ts
 * @description 命格生成 Few-shot（对齐废弃项目 talent-generate.ts，特质导向 + 完整 JSON 格式规范）
 * @mod mod-character
 */

/** 压缩版快速参考：全部为先天特质/能力，无出生场景、无婴儿描写 */
const FEW_SHOT_QUICK_REF = `
例1【现代都市】特征「商业嗅觉」：对市场动向有着本能的敏锐，能在别人观望时率先发现机会；谈判与投研中总能快人一步抓住关键信息。
例2【现代都市】特征「逻辑天才」：数理推理能力出类拔萃，复杂公式与算法在你眼中如同阅读小说；同龄人尚在苦思，你已找到更优解。
例3【科幻】特征「跨星商才」：对不同星球物价波动有天生直觉，低价囤货高价出手；陌生星球也能迅速摸清市场行情。
例4【奇幻】命格「吉星高照」：冥冥中有股眷顾之力，危机关头常多出一条路、一位贵人；巧合在你身上反复出现。
例5【修真】特征「剑心通明」：对剑道领悟力超凡，招招式精髓在你眼中毫无遮掩；苦练十年方能掌握的剑意，你数月可感。
`.trim()

/** 完整 JSON Few-Shot：6 组 × 每批 4-5 条，展示精确输出格式 */
const FEW_SHOT_FULL_JSON = `
【完整 JSON 范例 —— 严格按此格式输出，每条均为"这个人有什么特质"，禁止出生/童年场景】

范例1【现代都市·白领】世界"现代地球"·角色"人类男性上班族"：
{"type":"特征","name":"商业嗅觉","description":"对市场动向有着本能的敏锐，能在别人还在观望时率先发现机会；无论是股票投资还是商务谈判，总能快人一步抓住关键信息。","rarity":"rare","effect":"投资眼光精准，谈判中占据主动","polarity":"positive","attrBonus":{"resources":2}}
{"type":"特征","name":"社交引力","description":"天生让人觉得可信任，初次见面就能留下深刻印象；无论是同事、客户还是陌生人，都愿意向你敞开心扉。","rarity":"fine","effect":"初次社交时容易获得他人好感","polarity":"positive","attrBonus":{"charisma":1}}
{"type":"命格","name":"吉星高照","description":"冥冥之中总有一股力量在眷顾着你；迟到赶上的末班车、恰好出现的贵人、危机关头多出来的那条路——别人说是巧合，可这样的巧合在你身上从未断过。","rarity":"epic","effect":"关键时刻总有意外好运降临","polarity":"positive","attrBonus":{"mind":1,"resources":2}}
{"type":"特征","name":"失眠体质","description":"睡眠质量一直很差，夜深人静时总是辗转反侧；但正因如此，你比常人多出了大量清醒的时间可以用来学习和工作。","rarity":"common","effect":"可用时间增多，但精力恢复较慢","polarity":"mixed","attrBonus":{"physique":-1}}
{"type":"命格","name":"财星入命","description":"仿佛与财富有不解之缘，无论做什么总能比旁人赚得多一些；偏财运尤其旺盛，抽奖、投资、意外的奖金，这种好事总是找上门来。","rarity":"rare","effect":"赚钱和获得财富的机会比常人多","polarity":"positive","attrBonus":{"resources":2}}

范例2【现代都市·学生】世界"现代地球"·角色"人类男性学生"：
{"type":"特征","name":"逻辑天才","description":"数理推理能力出类拔萃，面对复杂的公式和算法如同阅读小说般轻松；在同龄人还在苦思冥想时，你已经找到了最优解。","rarity":"epic","effect":"数学和编程方面天赋异禀","polarity":"positive","attrBonus":{"mind":3,"talentAptitude":2}}
{"type":"特征","name":"自律狂人","description":"拥有极强的自我管理能力，制定的计划总能严格执行；不需要别人催促，每天该做什么心里清清楚楚，效率惊人。","rarity":"fine","effect":"每日计划完成度远超常人","polarity":"positive","attrBonus":{"physique":1}}
{"type":"特征","name":"舞台气场","description":"只要踏上舞台或站在众人面前，就会自然散发出吸引目光的魅力；无论是演讲、主持还是表演，都能游刃有余。","rarity":"fine","effect":"公众场合表现力出众","polarity":"positive","attrBonus":{"charisma":1}}
{"type":"特征","name":"拖延症","description":"总是习惯把事情拖到最后一刻才动手，前期磨蹭后期爆肝；虽然过程痛苦，但在截止日前的冲刺状态下效率出奇地高。","rarity":"common","effect":"任务启动慢，但截止前会爆发","polarity":"mixed","attrBonus":{}}
{"type":"特征","name":"运动神经","description":"身体素质格外出色，反应速度极快；无论是球场上的对抗还是各种体育项目，都能轻松上手并取得优异成绩。","rarity":"fine","effect":"体育运动方面表现突出","polarity":"positive","attrBonus":{"physique":1}}

范例3【星际科幻·星际商人】世界"星际联邦"·角色"人类男性星际贸易商"：
{"type":"特征","name":"跨星商才","description":"对不同星球的物价波动有着天生的直觉，总能在低价时囤货、高价时出手；即使从未踏足过的星球，也能迅速摸清当地的市场行情。","rarity":"rare","effect":"跨星球贸易眼光独到","polarity":"positive","attrBonus":{"resources":2}}
{"type":"特征","name":"异星亲和","description":"与不同文明打交道时总能找到共同语言，对方很难对你产生敌意；即便是语言不通的陌生种族，也会觉得你是一个值得信任的访客。","rarity":"fine","effect":"跨文化交流时容易获得信任","polarity":"positive","attrBonus":{"charisma":1}}
{"type":"特征","name":"星图记忆","description":"走过的每一条航线都清晰印在脑海中，浩渺星海对你来说如同自家的街道；迷航这种事，在你身上几乎不可能发生。","rarity":"epic","effect":"航线规划能力卓越，极少迷航","polarity":"positive","attrBonus":{"mind":2,"talentAptitude":1}}
{"type":"命格","name":"星河羁旅","description":"你与茫茫星海之间似乎存在着某种说不清的联系；每次跃迁时总能感受到一阵奇异的共鸣，仿佛那些遥远的星系在呼唤着你；流浪是你的宿命，也是你的归宿。","rarity":"rare","effect":"在星际旅行中常有奇遇","polarity":"positive","attrBonus":{"resources":1}}
{"type":"特征","name":"变废为宝","description":"别人眼中的太空垃圾和废弃零件，在你手里总能变成值钱的东西；再不起眼的残骸里，你也能找到被人忽略的宝藏。","rarity":"fine","effect":"善于从废品中发现价值","polarity":"positive","attrBonus":{"mind":1}}

范例4【星际科幻·研究员】世界"星际联邦"·角色"人类女性科研员"：
{"type":"特征","name":"灵感迸发","description":"研究遇到瓶颈时，总能从意想不到的角度找到突破口；那些看似无关的事物之间，你能发现别人看不到的联系。","rarity":"epic","effect":"科研中常有突破性发现","polarity":"positive","attrBonus":{"mind":3,"talentAptitude":2}}
{"type":"特征","name":"语言天赋","description":"面对完全陌生的语言体系，你能快速抓住其中的规律和逻辑；哪怕是与人类毫无相似之处的异星表达方式，也能逐渐破译和理解。","rarity":"fine","effect":"学习陌生语言的速度极快","polarity":"positive","attrBonus":{"talentAptitude":1,"charisma":1}}
{"type":"特征","name":"数据嗅觉","description":"面对海量数据时，总能敏锐地察觉到其中的异常和规律；一篇论文里的漏洞、一份报表中的猫腻，都逃不过你的眼睛。","rarity":"rare","effect":"分析数据时能快速发现关键信息","polarity":"positive","attrBonus":{"mind":2,"talentAptitude":1}}
{"type":"特征","name":"实验室宅","description":"一旦投入研究就会忘记时间，独自在实验室待上一整天也不觉得孤独；但对于社交应酬，你总是能躲就躲。","rarity":"common","effect":"独处时高度专注，但不善社交","polarity":"mixed","attrBonus":{"mind":1,"charisma":-1}}

范例5【中世纪奇幻·行商】世界"剑与魔法大陆"·角色"人族女性行商"：
{"type":"特征","name":"鉴宝慧眼","description":"一件物品到手，翻看几眼就能断定真伪和价值；不论是贵族家道中落时流出的古董，还是地摊上蒙尘的珍品，都逃不过你的眼睛。","rarity":"rare","effect":"鉴定物品真伪和价值的眼光精准","polarity":"positive","attrBonus":{"mind":2,"resources":1}}
{"type":"特征","name":"口若悬河","description":"三寸不烂之舌是你最大的武器；讨价还价时总能找到对方的软肋，让卖家甘心让利、让买家痛快掏钱。","rarity":"fine","effect":"交易谈判中常常占得上风","polarity":"positive","attrBonus":{"charisma":1}}
{"type":"特征","name":"草药辨识","description":"自小便跟着长辈进山采药，对山中草木的药性了如指掌；哪些能救人、哪些能害人，闭着眼都能分辨清楚。","rarity":"fine","effect":"善于辨识和采集药材","polarity":"positive","attrBonus":{"talentAptitude":1}}
{"type":"命格","name":"行商天命","description":"你似乎天生就是做生意的料，命运之轮总将你推向风口浪尖；逢低必涨、逢灾必利，别人眼中的风险在你手中总能化为商机。","rarity":"rare","effect":"时局动荡时反而商机更多","polarity":"positive","attrBonus":{"resources":1}}
{"type":"命格","name":"易感体质","description":"你对各种预兆和卜卦有着超乎常人的敏感，有时确实灵验得让人惊讶；但这份敏感也让你容易被江湖术士蒙骗，在真假预言之间反复摇摆。","rarity":"common","effect":"预感偶尔灵验，但易被蒙骗","polarity":"mixed","attrBonus":{"talentAptitude":1}}

范例6【仙侠修真·散修】世界"修仙大陆"·角色"人族男性散修"：
{"type":"命格","name":"先天道体","description":"天生与天地灵气高度亲和，呼吸之间便能引气入体；别人苦修数年才能感应到的灵力流动，你幼时便已如臂使指；此等体质万中无一。","rarity":"legendary","effect":"修炼速度远超常人，突破瓶颈容易","polarity":"positive","attrBonus":{"talentAptitude":4,"mind":2}}
{"type":"特征","name":"剑心通明","description":"对剑道的领悟力超凡脱俗，一招一式的精髓在你眼中毫无遮掩；别人苦练十年才能掌握的剑意，你可能数月便能感悟。","rarity":"epic","effect":"剑法修炼速度极快，剑道悟性惊人","polarity":"positive","attrBonus":{"talentAptitude":3,"physique":1}}
{"type":"特征","name":"丹道慧根","description":"丹炉前静坐三日不倦，药材入炉的每一丝变化都逃不过你的感知；炼出的丹药品质总是比别人高上一筹，废丹率极低。","rarity":"rare","effect":"炼丹成功率高，丹药品质出众","polarity":"positive","attrBonus":{"resources":2,"mind":1}}
{"type":"命格","name":"魔种潜伏","description":"幼年误入秘境，体内被种下了一缕上古魔念；它能助你在修炼时灵力暴增，但也会在关键时刻干扰你的心境，甚至试图夺舍；这是你的劫数，也是你的机缘。","rarity":"epic","effect":"修炼灵力汇聚极快，但有心魔隐患","polarity":"mixed","attrBonus":{"talentAptitude":2,"mind":-1}}
{"type":"特征","name":"不谙世事","description":"自幼避世苦修，对人情世故一窍不通；与人交往时常常说错话、办错事，但正因心无旁骛，修炼时比常人更加专注。","rarity":"common","effect":"不善社交，但修炼时格外专注","polarity":"mixed","attrBonus":{"charisma":-1,"talentAptitude":1}}
`.trim()

export const DESTINY_PATTERN_FEW_SHOT_BLOCK = `
【Few-Shot 示例 —— 只写天赋特质，禁止出生/婴儿/襁褓场景】

${FEW_SHOT_QUICK_REF}

---

${FEW_SHOT_FULL_JSON}

---

以上所有示例的 description 均描述「这个人有什么特质」，而非「出生时发生了什么」。每条 description 约 50-60 汉字，effect 约 15-25 汉字，均为定性描述不含数字。
`.trim()
