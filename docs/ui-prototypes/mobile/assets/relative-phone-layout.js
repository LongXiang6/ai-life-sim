(function () {
  'use strict'

  function setupPhone(phone) {
    const baseWidth = Number(phone.dataset.relativePhoneWidth || 320)
    const baseHeight = Number(phone.dataset.relativePhoneHeight || 674)
    if (!Number.isFinite(baseWidth) || !Number.isFinite(baseHeight) || baseWidth <= 0 || baseHeight <= 0) return

    phone.style.setProperty('--relative-phone-base-width', String(baseWidth))
    phone.style.setProperty('--relative-phone-base-height', String(baseHeight))

    let canvas = phone.querySelector(':scope > .relative-phone-canvas')
    if (!canvas) {
      canvas = document.createElement('div')
      canvas.className = 'relative-phone-canvas'
      while (phone.firstChild) canvas.appendChild(phone.firstChild)
      phone.appendChild(canvas)
    }

    canvas.style.width = `${baseWidth}px`
    canvas.style.height = `${baseHeight}px`

    const resize = function () {
      canvas.style.transform = `scale(${phone.clientWidth / baseWidth})`
    }

    resize()
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(phone)
    else window.addEventListener('resize', resize)
  }

  function init() {
    document.querySelectorAll('[data-relative-phone]').forEach(setupPhone)
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true })
  else init()
})()
