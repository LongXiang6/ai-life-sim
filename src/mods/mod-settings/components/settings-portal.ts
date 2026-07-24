export interface SettingsPortalMetrics {
  root: HTMLElement
  top: number
  left: number
  width: number
  height: number
  scale: number
}

export function getSettingsPortalRoot(): HTMLElement {
  return document.querySelector<HTMLElement>('[data-settings-modal-root]') ?? document.body
}

export function getSettingsPortalMetrics(): SettingsPortalMetrics {
  const root = getSettingsPortalRoot()
  if (root === document.body) {
    return {
      root,
      top: 0,
      left: 0,
      width: window.innerWidth,
      height: window.innerHeight,
      scale: 1,
    }
  }

  const rect = root.getBoundingClientRect()
  const scale = rect.width > 0 && root.clientWidth > 0 ? rect.width / root.clientWidth : 1
  return {
    root,
    top: rect.top,
    left: rect.left,
    width: rect.width / scale,
    height: rect.height / scale,
    scale,
  }
}
