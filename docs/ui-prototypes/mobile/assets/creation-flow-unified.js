(function () {
  'use strict'

  const icons = {
    arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
    shuffle: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h3c5 0 5 10 10 10h3M17 14l3 3-3 3M4 17h3c2 0 3-.8 4-2M15 7h5M17 4l3 3-3 3"/></svg>',
  }

  const astrolabeStepInterval = 4000
  const fateStateKey = 'ai-life-sim-prototype-fate-state'

  const ornament = `
    <div class="cf-art" aria-hidden="true">
      <svg class="cf-medallion cf-medallion-tl" viewBox="0 0 160 160"><g transform="translate(80 80)"><circle r="75"/><circle r="70"/><circle r="64" stroke-dasharray="1 5" stroke-width="1.15"/><circle r="57"/><circle r="45"/><circle r="31"/><circle r="17"/><path d="M0-70 5-60 0-49-5-60Z"/><path d="M0-70 5-60 0-49-5-60Z" transform="rotate(45)"/><path d="M0-70 5-60 0-49-5-60Z" transform="rotate(90)"/><path d="M0-70 5-60 0-49-5-60Z" transform="rotate(135)"/><path d="M0-45 9-35 0-25-9-35Z"/><path d="M0-45 9-35 0-25-9-35Z" transform="rotate(45)"/><path d="M0-45 9-35 0-25-9-35Z" transform="rotate(90)"/><path d="M0-45 9-35 0-25-9-35Z" transform="rotate(135)"/><ellipse cy="-18" rx="6" ry="16"/><ellipse cy="-18" rx="6" ry="16" transform="rotate(45)"/><ellipse cy="-18" rx="6" ry="16" transform="rotate(90)"/><ellipse cy="-18" rx="6" ry="16" transform="rotate(135)"/><rect x="-12" y="-12" width="24" height="24" transform="rotate(45)"/><circle r="5"/><circle r="1.8" fill="currentColor" stroke="none"/></g></svg>
      <svg class="cf-medallion cf-medallion-tr" viewBox="0 0 160 160"><g transform="translate(80 80)"><circle r="75"/><circle r="70"/><circle r="64" stroke-dasharray="1 5" stroke-width="1.15"/><circle r="57"/><circle r="45"/><circle r="31"/><circle r="17"/><path d="M0-70 5-60 0-49-5-60Z"/><path d="M0-70 5-60 0-49-5-60Z" transform="rotate(45)"/><path d="M0-70 5-60 0-49-5-60Z" transform="rotate(90)"/><path d="M0-70 5-60 0-49-5-60Z" transform="rotate(135)"/><path d="M0-45 9-35 0-25-9-35Z"/><path d="M0-45 9-35 0-25-9-35Z" transform="rotate(45)"/><path d="M0-45 9-35 0-25-9-35Z" transform="rotate(90)"/><path d="M0-45 9-35 0-25-9-35Z" transform="rotate(135)"/><ellipse cy="-18" rx="6" ry="16"/><ellipse cy="-18" rx="6" ry="16" transform="rotate(45)"/><ellipse cy="-18" rx="6" ry="16" transform="rotate(90)"/><ellipse cy="-18" rx="6" ry="16" transform="rotate(135)"/><rect x="-12" y="-12" width="24" height="24" transform="rotate(45)"/><circle r="5"/><circle r="1.8" fill="currentColor" stroke="none"/></g></svg>
      <svg class="cf-medallion cf-medallion-bl" viewBox="0 0 160 160"><g transform="translate(80 80)"><circle r="75"/><circle r="57"/><circle r="31"/><path d="M0-70 5-60 0-49-5-60Z"/><path d="M0-70 5-60 0-49-5-60Z" transform="rotate(45)"/><path d="M0-70 5-60 0-49-5-60Z" transform="rotate(90)"/><path d="M0-70 5-60 0-49-5-60Z" transform="rotate(135)"/><rect x="-12" y="-12" width="24" height="24" transform="rotate(45)"/><circle r="5"/></g></svg>
      <svg class="cf-medallion cf-medallion-br" viewBox="0 0 160 160"><g transform="translate(80 80)"><circle r="75"/><circle r="57"/><circle r="31"/><path d="M0-70 5-60 0-49-5-60Z"/><path d="M0-70 5-60 0-49-5-60Z" transform="rotate(45)"/><path d="M0-70 5-60 0-49-5-60Z" transform="rotate(90)"/><path d="M0-70 5-60 0-49-5-60Z" transform="rotate(135)"/><rect x="-12" y="-12" width="24" height="24" transform="rotate(45)"/><circle r="5"/></g></svg>
      <svg class="cf-ink" viewBox="0 0 340 220" preserveAspectRatio="xMidYMax meet"><path class="cf-ink-far" d="M0 170c25-16 48-21 72-14 18-26 39-39 62-35 19-39 47-61 77-54 18-26 40-35 63-25 22-16 44-18 66-9v187H0Z"/><path class="cf-ink-mist" d="M0 181c34-12 63-13 89-4 24-25 50-34 78-25 28-25 59-31 92-16 27-18 54-20 81-11v95H0Z"/><path class="cf-ink-mid" d="M0 190c31-18 62-20 92-8 24-22 51-29 79-19 28-23 59-28 92-14 26-16 52-18 77-9v80H0Z"/><path class="cf-ink-near" d="M0 204c36-10 68-9 98 2 33-13 66-14 99-2 32-12 64-13 96-2 18-6 34-6 47-2v20H0Z"/><path class="cf-ink-line" d="M7 177c38-25 74-27 109-9 37-27 76-33 116-14 35-22 70-24 103-7"/><path class="cf-ink-ripple" d="M22 201c25-5 49-5 73 0m35 8c32-5 64-5 95 0m31-9c23-4 45-4 66 0"/></svg>
    </div>`

  function makeHeader(header, step, title, subtitle) {
    header.innerHTML = `
      <div class="cf-meta"><span>AI LIFE SIM · 命书</span><span>${String(step).padStart(2, '0')} / 08</span></div>
      <div class="cf-title-row"><div class="cf-title-copy"><h2>${title}</h2><p>${subtitle}</p></div><div class="cf-title-mark"><span>${String(step).padStart(2, '0')}</span></div></div>`
  }

  function notify(message) {
    const toast = document.querySelector('.cf-toast')
    if (!toast) return
    toast.textContent = message
    toast.classList.add('is-visible')
    window.clearTimeout(toast._timer)
    toast._timer = window.setTimeout(function () { toast.classList.remove('is-visible') }, 1450)
  }

  function readFateState() {
    try {
      const value = JSON.parse(sessionStorage.getItem(fateStateKey) || '{}')
      return value && typeof value === 'object' ? value : {}
    } catch (_error) {
      return {}
    }
  }

  function writeFateState(patch) {
    const next = Object.assign({}, readFateState(), patch, { updatedAt: Date.now() })
    try {
      sessionStorage.setItem(fateStateKey, JSON.stringify(next))
    } catch (_error) {
      // The prototype remains usable when storage is unavailable (for example, a restricted file origin).
    }
    return next
  }

  function buildAstrolabe(host, options) {
    let items = Array.isArray(options.items) ? options.items.slice() : []
    const interactive = options.interactive !== false
    const initialRevealed = Number.isFinite(options.revealedCount)
      ? Math.max(0, Math.min(items.length, options.revealedCount))
      : interactive ? items.length : 0
    const rarityKeys = {
      '普通': 'common',
      '精良': 'fine',
      '稀有': 'rare',
      '史诗': 'epic',
      '传说': 'legendary',
    }
    let activeIndex = Number.isFinite(options.activeIndex) ? Number(options.activeIndex) : 0
    let timer = 0
    let wavePulse = 0
    let destroyed = false

    host.dataset.stepInterval = String(astrolabeStepInterval)
    host.dataset.wavePulse = '0'
    host.innerHTML = `<div class="cf-aura"></div><div class="cf-orbit"></div><div class="cf-inner"></div><div class="cf-stars"></div><div class="cf-water-ripples" aria-hidden="true"><i style="--ripple-delay:.68s"></i><i style="--ripple-delay:1.085s"></i><i style="--ripple-delay:2.3s"></i><i style="--ripple-delay:2.705s"></i></div><div class="cf-event-ripples" aria-hidden="true"><i class="cf-event-ripple cf-event-ripple-main"></i><i class="cf-event-ripple cf-event-ripple-tail"></i></div><div class="cf-zenith"></div><div class="cf-node-orbit">${items.map(function (item, index) {
      const rarity = rarityKeys[item.rarity] || 'common'
      return `<button class="cf-node" type="button" data-node-index="${index}" data-rarity="${rarity}" aria-label="查看命格：${item.name}" aria-hidden="true" disabled><span>${item.name}</span></button>`
    }).join('')}</div><div class="cf-core" aria-hidden="true"><span>命</span></div>`

    const nodes = Array.from(host.querySelectorAll('.cf-node'))
    const radius = Number.isFinite(options.nodeRadius) ? options.nodeRadius : 112

    function normalizeIndex(index) {
      if (!nodes.length) return 0
      return ((Number(index) % nodes.length) + nodes.length) % nodes.length
    }

    function placeNodes(index) {
      if (!nodes.length) return
      nodes.forEach(function (node, nodeIndex) {
        const position = (nodeIndex - index + nodes.length) % nodes.length
        const angle = (-90 + position * 360 / nodes.length) * Math.PI / 180
        node.style.setProperty('--node-x', `${Math.cos(angle) * radius}px`)
        node.style.setProperty('--node-y', `${Math.sin(angle) * radius}px`)
      })
    }

    function updateNode(node, item) {
      const rarity = rarityKeys[item.rarity] || 'common'
      node.dataset.rarity = rarity
      node.setAttribute('aria-label', `查看命格：${item.name}`)
      const label = node.querySelector('span')
      if (label) label.textContent = item.name
    }

    function setNodeRevealed(node, revealed) {
      node.classList.toggle('is-revealed', revealed)
      node.setAttribute('aria-hidden', String(!revealed))
      node.disabled = !interactive || !revealed
    }

    function setRevealed(count) {
      const safeCount = Math.max(0, Math.min(nodes.length, count))
      nodes.forEach(function (node, index) { setNodeRevealed(node, index < safeCount) })
    }

    function reveal(index) {
      const node = nodes[index]
      if (!node) return false
      setNodeRevealed(node, true)
      return true
    }

    function pulse() {
      if (destroyed) return
      wavePulse += 1
      host.dataset.wavePulse = String(wavePulse)
      host.classList.remove('is-wave-active')
      void host.offsetWidth
      host.classList.add('is-wave-active')
    }

    function stopCycle() {
      window.clearInterval(timer)
      timer = 0
    }

    function cycle() {
      render(activeIndex - 1, { emitWave: true })
    }

    function startCycle() {
      if (destroyed || nodes.length < 2) return
      stopCycle()
      timer = window.setInterval(cycle, astrolabeStepInterval)
    }

    function restartCycle() {
      startCycle()
    }

    const render = function (active, settings) {
      if (!items.length) return
      activeIndex = normalizeIndex(active)
      host.dataset.activeIndex = String(activeIndex)
      placeNodes(activeIndex)
      nodes.forEach(function (node, index) {
        node.classList.toggle('is-focused', interactive && index === activeIndex)
      })
      if (typeof options.onSelect === 'function' && items[activeIndex]) options.onSelect(items[activeIndex], activeIndex)
      if (settings && settings.emitWave) pulse()
      if (settings && settings.restartCycle) restartCycle()
    }

    if (interactive) {
      nodes.forEach(function (node, index) {
        node.addEventListener('click', function () { render(index, { emitWave: true, restartCycle: true }) })
      })
    }

    function replaceItems(nextItems, nextActiveIndex, emitWave) {
      if (!Array.isArray(nextItems) || nextItems.length !== nodes.length) return false
      items = nextItems.slice()
      nodes.forEach(function (node, index) { updateNode(node, items[index]) })
      render(Number.isFinite(nextActiveIndex) ? nextActiveIndex : activeIndex, { emitWave: Boolean(emitWave) })
      return true
    }

    function destroy() {
      destroyed = true
      stopCycle()
    }

    setRevealed(initialRevealed)
    render(activeIndex)
    return {
      render: render,
      reveal: reveal,
      setRevealed: setRevealed,
      replaceItems: replaceItems,
      pulse: pulse,
      startCycle: startCycle,
      stopCycle: stopCycle,
      restartCycle: restartCycle,
      getActiveIndex: function () { return activeIndex },
      getItems: function () { return items.slice() },
      destroy: destroy,
      nodes: nodes,
    }
  }

  function setupHandoff() {
    const body = document.body
    if (body.dataset.screen !== 'mythic-inheritance') return
    if (!document.documentElement.classList.contains('flow-handoff-entering')) return
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        document.documentElement.classList.remove('flow-handoff-entering')
      })
    })
  }

  function init() {
    const body = document.body
    const step = Number(body.dataset.creationStep)
    document.querySelectorAll('.creation-phone').forEach(function (phone) {
      const art = phone.querySelector('[data-flow-art]')
      if (art) art.outerHTML = ornament
      const header = phone.querySelector('[data-creation-header]')
      if (header) makeHeader(header, step, header.dataset.title || '', header.dataset.subtitle || '')
    })
    document.querySelectorAll('[data-icon]').forEach(function (node) {
      const icon = icons[node.dataset.icon]
      if (icon) node.innerHTML = icon
    })
    setupHandoff()
  }

  window.CreationFlow = {
    astrolabe: buildAstrolabe,
    notify: notify,
    fateState: {
      read: readFateState,
      write: writeFateState,
    },
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true })
  else init()
})()
