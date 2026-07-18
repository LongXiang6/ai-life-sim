/**
 * @module campaigns/default/prompts/system-prompt.ts
 * @description 默认 Campaign 系统 Prompt — Few-Shot 示例 + 世界观规则转发
 * @mod mod-engine
 *
 * WORLD_RULES / getWorldRules 统一由 mod-engine/prompts/narrative-prompt.ts 维护，
 * 本文件 re-export 以保持 campaign → orchestrator 导入路径兼容。
 */

export { WORLD_RULES, getWorldRules } from '../../../prompts/narrative-prompt'

/** Few-Shot 示例 */
export const FEW_SHOT_EXAMPLE = `## 示例

以下是一个完整的输出示例：

【输入】
角色：李逍遥，16岁，体魄6 心智7 悟性8 魅力5
世界观：仙侠修真，灵气充沛的修仙世界
当前状态：炼气三层，刚进入青云剑宗外门

【输出】
{
  "narrative": "青云剑宗外门的晨钟敲响时，李逍遥已在后山打坐了两个周天。三缕灵气沿着经脉缓缓汇入丹田，却总是在最后一刻溃散——炼气三层的瓶颈比想象中更加坚固。他睁开眼，望着掌心若隐若现的灵光，想起昨日外门长老的话：'悟性够了，但体魄跟不上，灵气再多也留不住。'于是他在任务牌上接了一个采集铁线草的任务，决定用药浴强体，再图突破。",
  "changes": [
    { "id": "cultivation", "description": "修炼进度停滞，体魄不足成为瓶颈", "changes": { "cultivationProgress": -5, "bottleneck": "physique" } },
    { "id": "lifespan", "description": "年龄增长", "changes": { "age": 16 } },
    { "id": "skill", "description": "李逍遥在锻炼中领悟了新的战斗技巧", "changes": { "newSkills": [{ "name": "铁线拳", "description": "采集铁线草时悟出的拳法，刚猛有力", "effects": [{ "attr": "physique", "value": 3 }] }] } }
  ],
  "notableEvents": ["李逍遥发现炼气三层瓶颈，决定用药浴强体"],
  "direction": "修炼/突破"
}

## 技能操作示例

赋予技能（完整数据格式）：
{ "id": "skill", "description": "经历严苛训练后获得新技能", "changes": { "newSkills": [{ "name": "钢铁体魄", "description": "铁血训练锻造的强健身躯", "effects": [{ "attr": "physique", "value": 3 }] }] } }

移除技能（仅需 ID）：
{ "id": "skill", "description": "重病后身体大不如前", "changes": { "removeSkillId": "skill_xxx" } }

同时在叙事中自然地体现这一变化，技能名和描述必须匹配当前世界观风格。`
