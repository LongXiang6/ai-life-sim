'use client'

/**
 * @module hooks.ts
 * @description mod-economy 自定义 Hook —— 5 个分片选择器
 * @mod mod-economy
 */

import { useEconomyStore } from './store'

/** 经济状态 Hook */
export function useEconomy() {
  return useEconomyStore((s) => s.economy)
}

/** 定居状态 Hook */
export function useSettlement() {
  return useEconomyStore((s) => s.settlement)
}

/** 工作状态 Hook */
export function useWork() {
  return useEconomyStore((s) => s.work)
}

/** 物品状态 Hook */
export function useItem() {
  return useEconomyStore((s) => s.item)
}

/** 人口状态 Hook */
export function usePopulation() {
  return useEconomyStore((s) => s.population)
}
