(function () {
  'use strict'

  const routes = {
    welcome: 'welcome/round-19-rf4-b-refinement.html',
    account: 'account/final.html',
    'world-select': 'world-select/round-20-ws-rf23-b1-adaptation.html',
    'world-customize': 'world-customize/round-07-ws-b1-adaptation.html',
    'character-create': 'character-create/round-15-ws-b1-adaptation.html',
    'talent-draw': 'talent-draw/round-refactor-18-rf17-2-b1-adaptation.html',
    'attribute-alloc': 'attribute-alloc/final.html',
    'fate-preview': 'fate-preview/round-refactor-01-style-1.html',
    'game-story': 'game-story/round-refactor-20-style-1.html',
    'game-over': 'game-over/final.html',
    'mythic-inheritance': 'mythic-inheritance/round-14-legacy-layout-b1-rebirth.html',
    settings: 'settings/final.html',
    help: 'help/final.html',
    feedback: 'feedback/final.html',
  }

  const order = [
    'welcome',
    'world-select',
    'world-customize',
    'character-create',
    'talent-draw',
    'mythic-inheritance',
    'attribute-alloc',
    'fate-preview',
    'game-story',
    'game-over',
  ]

  function mobileRootUrl() {
    const script = document.currentScript || Array.from(document.scripts).find((item) => /assets\/prototype\.js(?:\?|$)/.test(item.src))
    return script ? new URL('../', script.src) : new URL('../', window.location.href)
  }

  const rootUrl = mobileRootUrl()
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const handoffKey = 'ai-life-sim-prototype-handoff'
  const flowStateKey = 'ai-life-sim-prototype-flow-state'
  let navigating = false

  if (window.parent !== window) document.documentElement.classList.add('embedded-preview')

  function routeUrl(screen) {
    const route = routes[screen]
    if (!route) return null
    const target = new URL(route, rootUrl)
    if (window.location.search) target.search = window.location.search
    return target.href
  }

  function readState() {
    try {
      const value = JSON.parse(sessionStorage.getItem(flowStateKey) || '{}')
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
    } catch (_error) {
      return {}
    }
  }

  function writeState(patch) {
    const next = Object.assign({}, readState(), patch, { updatedAt: Date.now() })
    try {
      sessionStorage.setItem(flowStateKey, JSON.stringify(next))
    } catch (_error) {
      // The linked prototype remains usable when session storage is unavailable.
    }
    return next
  }

  function resetState() {
    try {
      sessionStorage.removeItem(flowStateKey)
      sessionStorage.removeItem('ai-life-sim-prototype-fate-state')
    } catch (_error) {
      // The next page still opens with its local defaults.
    }
  }

  function notifyParent(screen) {
    if (window.parent === window) return
    window.parent.postMessage({ type: 'ai-life-sim-prototype-ready', screen }, '*')
  }

  function transitionLayer() {
    let layer = document.querySelector('.prototype-transition-layer')
    if (!layer) {
      layer = document.createElement('div')
      layer.className = 'prototype-transition-layer'
      layer.setAttribute('aria-hidden', 'true')
      document.body.appendChild(layer)
    }
    return layer
  }

  function enter() {
    if (!document.body.dataset.screen) return
    let handoff = null
    try {
      handoff = JSON.parse(sessionStorage.getItem(handoffKey) || 'null')
    } catch (_error) {
      sessionStorage.removeItem(handoffKey)
    }
    const isCurrentHandoff = handoff
      && handoff.to === document.body.dataset.screen
      && Date.now() - handoff.createdAt < 5000
    if (isCurrentHandoff) {
      document.documentElement.classList.add('flow-handoff-entering')
      document.body.dataset.flowHandoffFrom = handoff.from || ''
      sessionStorage.removeItem(handoffKey)
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          window.dispatchEvent(new CustomEvent('prototype:handoff-enter', { detail: handoff }))
          notifyParent(document.body.dataset.screen)
        })
      })
      return
    }
    transitionLayer()
    document.documentElement.classList.add('flow-entering')
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        document.documentElement.classList.remove('flow-entering')
        notifyParent(document.body.dataset.screen)
      })
    })
  }

  function go(screen, options) {
    const target = routeUrl(screen)
    if (!target || navigating) return false
    navigating = true
    const current = document.body.dataset.screen || ''
    if (current && current !== screen) sessionStorage.setItem('ai-life-sim-prototype-last-screen', current)
    transitionLayer()
    document.documentElement.classList.add('flow-leaving')
    const replace = options && options.replace
    window.setTimeout(function () {
      if (replace) window.location.replace(target)
      else window.location.assign(target)
    }, reducedMotion ? 0 : 220)
    return true
  }

  function handoff(screen, options) {
    const target = routeUrl(screen)
    if (!target || navigating) return false
    navigating = true
    const current = document.body.dataset.screen || ''
    if (current && current !== screen) sessionStorage.setItem('ai-life-sim-prototype-last-screen', current)
    sessionStorage.setItem(handoffKey, JSON.stringify({
      from: current,
      to: screen,
      kind: options && options.kind ? options.kind : 'shared-element',
      createdAt: Date.now(),
    }))
    document.documentElement.classList.add('flow-handoff-leaving')
    window.dispatchEvent(new CustomEvent('prototype:handoff-leave', { detail: { from: current, to: screen } }))
    window.setTimeout(function () {
      window.location.assign(target)
    }, reducedMotion ? 0 : options && Number.isFinite(options.delay) ? options.delay : 420)
    return true
  }

  function back(fallback) {
    const stored = sessionStorage.getItem('ai-life-sim-prototype-last-screen')
    return go(fallback || stored || 'welcome')
  }

  function bindFlowControls() {
    document.addEventListener('click', function (event) {
      const target = event.target.closest('[data-flow-to], [data-flow-back]')
      if (!target || target.disabled || target.getAttribute('aria-disabled') === 'true') return
      if (target.hasAttribute('data-flow-to')) {
        const screen = target.getAttribute('data-flow-to')
        if (!routes[screen]) return
        event.preventDefault()
        event.stopPropagation()
        if (target.hasAttribute('data-flow-reset')) resetState()
        go(screen)
        return
      }
      event.preventDefault()
      event.stopPropagation()
      back(target.getAttribute('data-flow-back') || undefined)
    }, true)
  }

  window.selectChoice = function selectChoice(element) {
    document.querySelectorAll('.option-card.selected').forEach(function (item) { item.classList.remove('selected') })
    element.classList.add('selected')
    const choice = element.dataset.choice || ''
    const selection = document.querySelector('[data-selection]')
    if (selection) selection.textContent = choice ? '当前选择：' + choice : '尚未选择'
  }

  window.PrototypeFlow = {
    routes,
    order,
    go,
    handoff,
    back,
    routeUrl,
    state: { read: readState, write: writeState, reset: resetState },
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      bindFlowControls()
      enter()
    }, { once: true })
  } else {
    bindFlowControls()
    enter()
  }
})()
