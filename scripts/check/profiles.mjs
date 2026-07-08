/**
 * @module profiles.mjs
 * @description 检测 profile 定义 —— 与 ATCE / 变更分级对齐
 */

/** @type {Record<string, { label: string, domainIds: string[], atceProfile?: boolean }>} */
export const PROFILES = {
  /** ATCE 必跑：结构性规则（= quick 语义） */
  structural: {
    label: 'ATCE 结构性扫描',
    domainIds: ['wiring', 'loader'],
    atceProfile: true,
  },
  quick: {
    label: 'L1 快速（结构性）',
    domainIds: ['wiring', 'loader'],
    atceProfile: true,
  },
  /** 纯架构重构：不含 UI / 叙事噪声 */
  refactor: {
    label: '架构重构',
    domainIds: ['wiring', 'loader', 'mod'],
    atceProfile: true,
  },
  full: {
    label: '全量（暂不含 mod domain，见下方说明）',
    // ⚠️ 2026-07-08 暂时移除 mod domain：大部分模拟系统（health/economy/reputation/
    //    faction-dynamics 等）当前不在 MVP 白名单内运行（见 mvp-stages-config.default.json），
    //    mod domain 扫描器按 MOD 目录整体检查，无法区分目录内"已接入/未接入"的子系统，
    //    导致 mod-character 等活跃 MOD 也被大量未接入子系统的历史问题拖累报 FAIL，阻断交付。
    //    需要恢复时：① 优先把 mod domain 扫描器改为按 MVP 白名单精确到子系统粒度过滤，
    //    而不是简单加回 'mod'（否则会重现同样的问题）；② 各模拟系统逐个恢复运行时，
    //    应同步移除其被排除的报告项。独立检查入口 `npm run check:mod` 仍保留，可随时手动跑。
    domainIds: ['wiring', 'loader', 'calibration', 'narrative', 'ui'],
  },
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
    }
  }
  if (domains[profileOrDomain]) {
    return { ids: [profileOrDomain], profile: profileOrDomain, modName, atceProfile: false }
  }
  throw new Error(`Unknown profile/domain: ${profileOrDomain}`)
}
