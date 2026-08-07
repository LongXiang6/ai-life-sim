'use client'

/**
 * @module hooks.ts
 * @description 角色系统自定义 Hook
 * @mod mod-character
 */

import { useCharacterStore } from './store'

export function useCharacter() {
  return useCharacterStore((s) => ({
    name: s.name,
    gender: s.gender,
    age: s.age,
    characterBase: s.characterBase,
  }))
}

export function useCharacterStatus() {
  return useCharacterStore((s) => ({
    status: s.characterBase.status,
  }))
}

export function useDestinyPatterns() {
  return useCharacterStore((s) => ({
    destinyPatterns: s.destinyPatterns,
    setDestinyPatterns: s.setDestinyPatterns,
  }))
}
