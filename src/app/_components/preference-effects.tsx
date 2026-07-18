'use client'

import { useEffect } from 'react'

import { useSettingsStore } from '@/mods/mod-settings'

/** 将已定版的阅读与动效偏好映射到全局呈现属性。 */
export function PreferenceEffects() {
  const comfortableParagraphs = useSettingsStore((state) => state.comfortableParagraphs)
  const reduceMotion = useSettingsStore((state) => state.reduceMotion)

  useEffect(() => {
    document.documentElement.dataset.paragraphComfort = comfortableParagraphs ? 'true' : 'false'
  }, [comfortableParagraphs])

  useEffect(() => {
    document.documentElement.dataset.reduceMotion = reduceMotion ? 'true' : 'false'
  }, [reduceMotion])

  return null
}
