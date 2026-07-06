'use client'

/**
 * @file WorldCustomizeDesktop.tsx
 * @description 世界自定义桌面端 —— 4维度 + 世界描述 + 标签锁定
 * @mod mod-pages
 */

import React from 'react'

import { BottomActionBar, Dropdown } from '@/mods/mod-ui'

import { useWorldCustomize } from './useWorldCustomize'
import { FIELD_MODE_LABELS, WORLD_CUSTOM_TEXT_MAX_LENGTH, type EditableField, type FieldMode } from './world-customize.types'

import styles from './WorldCustomizeDesktop.module.css'

const MODES: FieldMode[] = ['ai', 'adaptive', 'custom']

function DimensionCard({
  field,
  onModeChange,
  onValueChange,
  onCustomChange,
}: {
  field: EditableField
  onModeChange: (mode: FieldMode) => void
  onValueChange: (value: string) => void
  onCustomChange: (value: string) => void
}) {
  return (
    <div className={styles.dimCard}>
      <div className={styles.dimTop}>
        <div className={styles.dimIcon}>{field.icon}</div>
        <div className={styles.dimBody}>
          <div className={styles.dimLabel}>{field.label}</div>
          <div className={styles.dimDesc}>{field.description}</div>
        </div>
      </div>

      <div className={styles.modeBar}>
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            className={`${styles.modeBtn} ${field.mode === m ? styles.modeBtnActive : ''}`}
            onClick={() => onModeChange(m)}
          >
            {FIELD_MODE_LABELS[m]}
          </button>
        ))}
      </div>

      {field.mode === 'ai' && (
        <div className={styles.aiHint}>由 AI 根据世界描述判断</div>
      )}
      {field.mode === 'adaptive' && (
        <Dropdown
          value={field.playerValue}
          options={field.options}
          onChange={onValueChange}
          placeholder="请选择"
          className={styles.dimDropdown}
        />
      )}
      {field.mode === 'custom' && (
        <textarea
          value={field.customValue || ''}
          onChange={(e) => {
            onCustomChange(e.target.value.slice(0, WORLD_CUSTOM_TEXT_MAX_LENGTH))
            const el = e.target
            el.style.height = 'auto'
            el.style.height = el.scrollHeight + 'px'
          }}
          placeholder="输入自定义内容..."
          className={styles.customInput}
          rows={1}
          maxLength={WORLD_CUSTOM_TEXT_MAX_LENGTH}
        />
      )}
    </div>
  )
}

export function WorldCustomizeDesktop() {
  const {
    groupedFields,
    worldDescription,
    setFieldMode,
    setFieldValue,
    setCustomValue,
    setWorldDescription,
    save,
    skip,
    conflictModal,
  } = useWorldCustomize()

  const macroFields = groupedFields['macro'] || []

  return (
    <>
      {conflictModal}
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.headerIcon}>🌌</div>
          <h1 className={styles.title}>世界自定义</h1>
          <p className={styles.hint}>设定宇宙的宏观参数，后续叙事会按这些规则展开</p>
        </div>

        <div className={styles.descSection}>
          <label className={styles.descLabel}>世界描述</label>
          <textarea
            className={styles.descInput}
            value={worldDescription}
            onChange={(e) => setWorldDescription(e.target.value.slice(0, WORLD_CUSTOM_TEXT_MAX_LENGTH))}
            placeholder="补充你的世界背景、氛围、禁忌或核心规则…"
            rows={3}
            maxLength={WORLD_CUSTOM_TEXT_MAX_LENGTH}
          />
          <div className={styles.descCharCount}>
            {worldDescription.length}/{WORLD_CUSTOM_TEXT_MAX_LENGTH}
          </div>
        </div>

        <div className={styles.dimList}>
          {macroFields.map((field) => (
            <DimensionCard
              key={field.key}
              field={field}
              onModeChange={(mode) => setFieldMode(field.key, mode)}
              onValueChange={(v) => setFieldValue(field.key, v)}
              onCustomChange={(v) => setCustomValue(field.key, v)}
            />
          ))}
        </div>
      </div>

      <BottomActionBar
        onBack={skip}
        backTitle="返回世界选择"
        onConfirm={save}
        confirmText="确认世界"
        confirmTitle="确认自定义值并进入角色设定"
      />
    </>
  )
}

export default WorldCustomizeDesktop
