'use client'

/**
 * @module NPCRelationshipPanel
 * @description NPC 关系图谱面板 —— 展示角色与其他 NPC 的关系历史和互动摘要
 * @mod mod-ui
 *
 * 数据来源：CoreMemorySystem → useEngineStore.coreMemoryNpcMap（Zustand persist 自动持久化）
 */

import { useEngineStore } from '@/mods/mod-engine'
import type { NPCInteractionRecord } from '@/mods/mod-engine/engine-api'

// ==================== 类型 ====================

/** 关系类型显示配置 */
const RELATION_TYPE_CONFIG: Record<NPCInteractionRecord['type'], { label: string; icon: string }> = {
  first_meeting: { label: '初遇', icon: '👋' },
  conflict: { label: '冲突', icon: '⚔️' },
  alliance: { label: '结盟', icon: '🤝' },
  betrayal: { label: '背叛', icon: '💔' },
  marriage: { label: '婚约', icon: '💍' },
  death: { label: '离世', icon: '🕯️' },
  other: { label: '互动', icon: '💬' },
}

interface NPCRelationshipPanelProps {
  onClose?: () => void
}

// ==================== 组件 ====================

export function NPCRelationshipPanel({ onClose }: NPCRelationshipPanelProps) {
  const npcMap = useEngineStore((s) => s.coreMemoryNpcMap)
  const entries = Object.entries(npcMap)

  if (entries.length === 0) {
    return (
      <div className="npc-relationship-panel npc-relationship-panel--empty">
        <div className="npc-panel-header">
          <h3 className="npc-panel-title">👥 人物关系</h3>
          {onClose && (
            <button type="button" className="npc-panel-close" onClick={onClose}>
              关闭
            </button>
          )}
        </div>
        <p className="npc-panel-empty-hint">
          推进模拟后，与 NPC 的互动会记录在这里。目前尚未结识任何人物。
        </p>
      </div>
    )
  }

  // 按最近互动轮次降序排列
  const sorted = entries.sort(([, a], [, b]) => {
    const aLast = a[a.length - 1]?.round ?? 0
    const bLast = b[b.length - 1]?.round ?? 0
    return bLast - aLast
  })

  return (
    <div className="npc-relationship-panel">
      <div className="npc-panel-header">
        <h3 className="npc-panel-title">
          👥 人物关系（{entries.length}人）
        </h3>
        {onClose && (
          <button type="button" className="npc-panel-close" onClick={onClose}>
            关闭
          </button>
        )}
      </div>
      <div className="npc-relationship-list">
        {sorted.map(([name, records]) => (
          <NPCCard key={name} name={name} records={records} />
        ))}
      </div>
    </div>
  )
}

/** 单个 NPC 关系卡片 */
function NPCCard({ name, records }: { name: string; records: NPCInteractionRecord[] }) {
  const lastRound = records[records.length - 1]?.round
  const relationType = records[records.length - 1]?.type ?? 'other'
  const config = RELATION_TYPE_CONFIG[relationType]

  return (
    <div className="npc-card">
      <div className="npc-card-header">
        <span className="npc-name">{name}</span>
        <span className="npc-relation-badge" title={config.label}>
          {config.icon} {config.label}
        </span>
        {lastRound && <span className="npc-round">第{lastRound}轮</span>}
      </div>
      <ul className="npc-interaction-list">
        {records.map((r, i) => (
          <li key={i} className={`npc-interaction-item npc-interaction-${r.type}`}>
            <span className="interaction-icon">{RELATION_TYPE_CONFIG[r.type].icon}</span>
            <span className="interaction-round">[第{r.round}轮]</span>
            <span className="interaction-summary">{r.summary}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
