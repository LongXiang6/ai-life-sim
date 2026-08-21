/** Purpose: Render user-facing guides for sibling workspace projects. Owner: mod-ui. Responsibility: Static project descriptions only. */

import type { WorkspaceProjectHelpTab } from './help-tabs'
import styles from './HelpModal.module.css'

interface ProjectGuideSection {
  heading: string
  body?: string
  items?: string[]
}

interface ProjectGuide {
  eyebrow: string
  title: string
  summary: string
  sections: ProjectGuideSection[]
}

const WORKSPACE_PROJECT_GUIDES: Record<WorkspaceProjectHelpTab, ProjectGuide> = {
  'qq-bot': {
    eyebrow: '群聊辅助项目',
    title: 'QQ群机器人',
    summary: '面向 QQ 群聊的独立 AI 群友与互动工具，在自然对话之外承载群内服务、小游戏和管理能力。',
    sections: [
      {
        heading: '主要能力',
        items: [
          '在群聊中参与问答、陪伴和项目相关交流，并根据上下文决定是否接话。',
          '提供签到、积分、排行、文字修仙、QQ 农场等群内互动。',
          '支持图片理解、收藏表情、连续记忆、群话题趋势和受控任务处理。',
        ],
      },
      {
        heading: '使用方式',
        items: [
          '群管理员先授权目标群并开启该群的 AI，再由成员通过 @、自然语言或明确指令使用。',
          '管理台集中配置群组策略、人格、模型、记忆、表情包、积分和权限。',
          '确定性的账号、积分和管理操作由对应功能直接执行，聊天模型只负责交流内容。',
        ],
      },
      {
        heading: '与主游戏的关系',
        body: '机器人拥有独立运行环境和群聊数据，不读取或代替主游戏存档。需要共享账号或积分时，通过明确的账号绑定与主项目接口完成。',
      },
    ],
  },
  'factorio-localizer': {
    eyebrow: '桌面汉化工具',
    title: 'FACTORIO模组汉化器',
    summary: '扫描 Factorio 模组的 locale 内容，只补齐缺失或变化的译文，校验后生成可安装的独立汉化模组。',
    sections: [
      {
        heading: '标准流程',
        items: [
          '配置模组目录、输出目录和本地模型或 OpenAI 兼容服务。',
          '扫描全部模组包，区分完整汉化、部分汉化、未汉化和解析失败状态。',
          '选择需要处理的模组，增量生成译文并逐块校验保存。',
          '检查结果后打包为独立汉化模组，并查看本轮成功、部分完成或失败记录。',
        ],
      },
      {
        heading: '翻译与复用',
        items: [
          '保留 locale 键和文件结构，已验证译文会被复用，原文变化的词条才重新处理。',
          '未完成项目可以单独重试，已经保存的成果可在重启后继续使用。',
          'Factorio 官方知识库可更新到本地，用于术语查询和翻译上下文。',
        ],
      },
      {
        heading: '输出边界',
        body: '工具以新的汉化模组作为输出，不要求修改原始模组包；打包前可以继续检查和重试未完成内容。',
      },
    ],
  },
  'novelist-sim': {
    eyebrow: '长篇创作项目',
    title: '小说模拟器',
    summary: '本地运行的 AI 长篇小说创作与世界模拟工作台，从世界设定、全书规划一直管理到章节正文和完本成果。',
    sections: [
      {
        heading: '创作工作区',
        items: [
          '书架管理每一本作品，设定总览组织世界、人物、势力、关系和故事结构。',
          '总设计师可以统筹全书，也可以进入设定、正文或作品控制台处理具体内容。',
          '创作树按分卷、章节、场景和节拍组织规划，正文可以手动编写，也可以交给 AI 协作。',
        ],
      },
      {
        heading: '模拟与审查',
        items: [
          '新章节会按规划推进世界时间，并把气候、资源、经济、人口、势力和关系变化带入正文。',
          '写作结果经过多个独立视角审查，再由总设计师汇总修订后提交。',
          '重写已有章节复用原来的模拟轨迹，不会重复推进世界时间。',
        ],
      },
      {
        heading: '保存与输出',
        body: '工程、设定、正文、修订和模拟状态保存在本地；支持恢复删除、整书备份，以及 Markdown 和 EPUB 3 导出。AI 默认不影响手动创作，配置模型后再启用相关能力。',
      },
    ],
  },
  'wechat-advisor': {
    eyebrow: '关系沟通项目',
    title: '微信聊天军师',
    summary: '面向真实聊天记录的本地 AI 沟通工作台，用来整理关系背景、理解对话变化并生成更贴合当下语境的回复建议。',
    sections: [
      {
        heading: '开始分析',
        items: [
          '选择已有联系人，或直接粘贴带时间和说话人的微信聊天记录。',
          '确认双方身份与认识方式，再向军师说明这次最想解决的问题。',
          '分析结果会结合关系阶段、交流节奏、情绪信号和个人背景给出判断。',
        ],
      },
      {
        heading: '持续使用',
        items: [
          '军师对话用于继续追问策略，回复候选可直接选择和复制。',
          '记录页保留联系人对话，画像页汇总沟通风格、关系信号和已有证据。',
          '“我”的资料与模型设置独立维护，后续建议会使用当前资料。',
        ],
      },
      {
        heading: '数据边界',
        body: '联系人、聊天历史和画像保存在本地应用数据中；需要 AI 分析时，只把本次所需内容发送给设置中启用的模型服务。',
      },
    ],
  },
}

export function HelpWorkspaceProjectContent({ tab }: { tab: WorkspaceProjectHelpTab }) {
  const guide = WORKSPACE_PROJECT_GUIDES[tab]

  return (
    <div className={styles.projectContent}>
      <section className={styles.projectIntro}>
        <span className={styles.projectEyebrow}>{guide.eyebrow}</span>
        <h3>{guide.title}</h3>
        <p>{guide.summary}</p>
      </section>
      {guide.sections.map((section, index) => (
        <article key={section.heading} className={styles.chapter}>
          <span className={styles.chapterIndex}>{String(index + 1).padStart(2, '0')} / 项目说明</span>
          <h3>{section.heading}</h3>
          {section.body && <p>{section.body}</p>}
          {section.items && (
            <ul>
              {section.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          )}
        </article>
      ))}
    </div>
  )
}
