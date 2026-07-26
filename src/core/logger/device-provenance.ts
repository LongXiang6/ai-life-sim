/**
 * @module device-provenance.ts
 * @description 服务端分配的稳定浏览器设备来源编号契约
 * @mod core
 */

export const DEVICE_PROVENANCE_ID_COOKIE = 'ai-life-sim-device-provenance-id'

const DEVICE_PROVENANCE_ID_PATTERN = /^DEV-[A-F0-9]{32}$/u

export function normalizeDeviceProvenanceId(
  value: string | null | undefined,
): string | undefined {
  if (!value) return undefined
  const normalized = value.trim().toUpperCase()
  return DEVICE_PROVENANCE_ID_PATTERN.test(normalized) ? normalized : undefined
}
