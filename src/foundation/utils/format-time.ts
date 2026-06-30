/**
 * @module format-time.ts
 * @description 纪元年份格式化（对齐废弃项目 format-time.ts）
 * @mod foundation
 */

export interface EraEntry {
  name: string
  startAnchorYear: number
}

function resolveDisplayEra(
  anchorYear: number,
  defaultEraName: string,
  timeline?: EraEntry[],
): { displayName: string; displayYear: number } {
  if (anchorYear < 0) {
    return { displayName: '公元前', displayYear: Math.abs(anchorYear) }
  }
  if (!timeline || timeline.length === 0) {
    return { displayName: defaultEraName, displayYear: anchorYear }
  }
  const sorted = [...timeline].sort((a, b) => a.startAnchorYear - b.startAnchorYear)
  let current = sorted[0]
  for (const entry of sorted) {
    if (entry.startAnchorYear <= anchorYear) current = entry
  }
  return { displayName: current.name, displayYear: anchorYear - current.startAnchorYear + 1 }
}

/** 格式化纪元年份为可读字符串 */
export function formatEraYear(eraYear: number, eraName: string, timeline?: EraEntry[]): string {
  if (eraYear < 0) {
    return `公元前${Math.abs(eraYear)}年`
  }
  if (timeline && timeline.length > 0) {
    const resolved = resolveDisplayEra(eraYear, eraName, timeline)
    return `${resolved.displayName}${resolved.displayYear}年`
  }
  return `${eraName}${eraYear}年`
}
