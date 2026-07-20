'use client'

/** 诊断披露版本提升后，旧接受记录必须重新确认。 */
export const DIAGNOSTIC_DISCLOSURE_KEY = 'ai-life-sim:disclaimer-accepted'
export const DIAGNOSTIC_DISCLOSURE_VERSION = '2.3.0'

export function isDiagnosticDisclosureAccepted(): boolean {
  if (typeof localStorage === 'undefined') return false
  try {
    return localStorage.getItem(DIAGNOSTIC_DISCLOSURE_KEY) === DIAGNOSTIC_DISCLOSURE_VERSION
  } catch {
    return false
  }
}

