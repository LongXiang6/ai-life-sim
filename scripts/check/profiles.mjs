/**
 * @module profiles.mjs
 * @description 检测 profile 定义 —— 与 ATCE / 变更分级对齐
 */

/** @type {Record<string, { label: string, domainIds: string[], atceProfile?: boolean, stepMode?: 'all'|'critical' }>} */
export const PROFILES = {
  /** ATCE 必跑：结构性规则（= quick 语义） */
  structural: {
    label: 'ATCE 结构性扫描',
    domainIds: ['standardization', 'wiring', 'loader'],
    atceProfile: true,
  },
  quick: {
    label: 'L1 快速（结构性）',
    domainIds: ['standardization', 'wiring', 'loader'],
    atceProfile: true,
  },
  critical: {
    label: '本地关键检查',
    domainIds: ['standardization', 'wiring', 'loader', 'account', 'mod', 'calibration', 'narrative', 'ui'],
    stepMode: 'critical',
  },
  /** 纯架构重构：不含 UI / 叙事噪声 */
  refactor: {
    label: '架构重构',
    domainIds: ['standardization', 'wiring', 'loader', 'mod'],
    atceProfile: true,
  },
  full: {
    label: '全量',
    domainIds: ['standardization', 'wiring', 'loader', 'account', 'mod', 'calibration', 'narrative', 'ui'],
  },
  account: { label: 'Account / persistence', domainIds: ['account'] },
  ui: { label: 'UI', domainIds: ['ui'] },
  mod: { label: 'MOD 架构', domainIds: ['mod'] },
  narrative: { label: '叙事', domainIds: ['narrative'] },
  calibration: { label: '校准', domainIds: ['calibration'] },
}

/**
 * @param {string} profileOrDomain
 * @param {Record<string, unknown>} domains
 */
export function resolveProfile(profileOrDomain, domains, modName = '') {
  if (PROFILES[profileOrDomain]) {
    return {
      ids: PROFILES[profileOrDomain].domainIds,
      profile: profileOrDomain,
      modName,
      atceProfile: PROFILES[profileOrDomain].atceProfile ?? false,
      stepMode: PROFILES[profileOrDomain].stepMode ?? 'all',
    }
  }
  if (domains[profileOrDomain]) {
    return {
      ids: [profileOrDomain],
      profile: profileOrDomain,
      modName,
      atceProfile: false,
      stepMode: 'all',
    }
  }
  throw new Error(`Unknown profile/domain: ${profileOrDomain}`)
}
