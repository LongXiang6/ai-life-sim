'use client'

/**
 * @module StarfieldBackground.tsx
 * @description 银河系宏观视角背景动画 —— 带倾角的银河盘 + 大量静态粒子 + 四周随机星系
 * @mod mod-ui
 *
 * 设计理念：
 *   - 银河盘：带随机倾角，大面积螺旋臂粒子，暖黄→冷蓝渐变
 *   - 背景星：80% 静态不计算，20% 极慢漂移，大幅降低性能开销
 *   - 四周星系：6 个随机位置 + 随机倾角的小星系散落在画面边缘
 *   - 核心辉光：暖白炽光晕模拟银河核球
 *   - 星云：蓝紫红色调弥散
 *
 * Apple HIG 设计原则：
 *   - Deference：作为背景层，不干扰内容
 *   - Depth：多层动画营造宇宙空间深度感
 *
 * 移动端优化：小屏设备（<768px 或触屏）自动降级为仅星空粒子，
 *   节省 ~70% GPU 开销，防止低端设备崩溃。
 */

'use client'

import { useEffect, useRef, useState } from 'react'

import { useThemeStore, type ThemeType } from '@/core/theme/theme-store'
import styles from './StarfieldBackground.module.css'

/* ------------------------------------------------------------------ */
/*  类型                                                              */
/* ------------------------------------------------------------------ */

/** 星星粒子 */
interface Star {
  x: number
  y: number
  z: number
  size: number
  opacity: number
  speed: number
  /** false = 静态（不移动/不闪烁，零性能开销） */
  moving: boolean,
}

/** 螺旋臂粒子（极坐标） */
interface SpiralParticle {
  /** 角度 */
  theta: number
  /** 距中心半径 */
  radius: number
  /** 随机偏移 */
  ox: number
  oy: number
  size: number
  opacity: number,
}

/** 星云区域 */
interface Nebula {
  x: number
  y: number
  radius: number
  hue: number
  saturation: number
  opacity: number,
}

/** 行星轨道 */
interface OrbitConfig {
  semiMajor: number
  semiMinor: number
  angle: number
  phase: number
  speed: number
  color: string
  planetRadius: number
  orbitColor: string,
}

/** 遥远星系（画面四周随机分布的小星系） */
interface DistantGalaxy {
  x: number
  y: number
  /** 随机倾角（弧度） */
  angle: number
  /** 缩放因子 */
  scale: number
  /** 主色调 */
  hue: number
  /** 星系粒子（相对坐标） */
  particles: { ox: number; oy: number; size: number; opacity: number }[],
}

/* ------------------------------------------------------------------ */
/*  常量                                                              */
/* ------------------------------------------------------------------ */

/** 背景恒星总数 */
const STAR_COUNT = 400

/** 静态恒星比例（不移动不闪烁） */
const STATIC_RATIO = 0.8

/** 最大星星尺寸 */
const MAX_STAR_SIZE = 2.5

/** 螺旋臂数量 */
const SPIRAL_ARM_COUNT = 3

/** 每臂粒子数 */
const PARTICLES_PER_ARM = 3000

/** 星云数量 */
const NEBULA_COUNT = 4

/** 银河中心轨道数 */
const ORBIT_COUNT = 3

/** 四周遥远星系数量 */
const DISTANT_GALAXY_COUNT = 6

/** 螺旋臂旋转角速度（弧度/秒） */
const SPIRAL_ROTATION_SPEED = 0.0015

/** 主题颜色映射 */
const THEME_COLORS: Record<ThemeType, { star: string }> = {
  'minimal-white': { star: '#94a3b8' },
  'minimal-black': { star: '#e2e8f0' },
  'reading-yellow': { star: '#b8a07a' },
  'dark-cosmos': { star: '#c0c8e0' },
  'light-aurora': { star: '#a0b4c8' },
  'cyber-neon': { star: '#80ffea' },
}

/* ------------------------------------------------------------------ */
/*  Props                                                             */
/* ------------------------------------------------------------------ */

export interface StarfieldBackgroundProps {
  count?: number
  speed?: number
  paused?: boolean
  className?: string
  enableSpiralArms?: boolean
  enableNebulae?: boolean
  enableOrbits?: boolean
  enableDistantGalaxies?: boolean,
}

/* ------------------------------------------------------------------ */
/*  工具函数                                                          */
/* ------------------------------------------------------------------ */

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min
}

function hsl(h: number, s: number, l: number, a = 1): string {
  return `hsla(${h},${s}%,${l}%,${a})`
}

/* ------------------------------------------------------------------ */
/*  组件                                                              */
/* ------------------------------------------------------------------ */

/**
 * 银河系宏观视角背景动画组件 —— 带倾角的银河盘 + 大量静态粒子 + 四周随机星系
 * @param {StarfieldBackgroundProps} props - 组件属性
 */
export function StarfieldBackground({
  count = STAR_COUNT,
  speed = 1,
  paused = false,
  className = '',
  enableSpiralArms = true,
  enableNebulae = true,
  enableOrbits = true,
  enableDistantGalaxies = true,
}: StarfieldBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const starsRef = useRef<Star[]>([])
  const spiralParticlesRef = useRef<SpiralParticle[]>([])
  const nebulaeRef = useRef<Nebula[]>([])
  const orbitsRef = useRef<OrbitConfig[]>([])
  const distantGalaxiesRef = useRef<DistantGalaxy[]>([])
  /** 银河盘随机倾角 */
  const galaxyAngleRef = useRef(0)
  const animFrameRef = useRef<number>(0)
  const startTimeRef = useRef<number>(0)
  const theme = useThemeStore((s) => s.theme)

  /** 移动端检测：小屏或触屏设备降级为仅星空粒子 */
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768 || navigator.maxTouchPoints > 0)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // 移动端降级：关闭高开销图层
  const showSpiralArms = enableSpiralArms && !isMobile
  const showNebulae = enableNebulae && !isMobile
  const showOrbits = enableOrbits && !isMobile
  const showDistantGalaxies = enableDistantGalaxies && !isMobile

  /* ---------- 初始化 ---------- */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const w = canvas.width = window.innerWidth
    const h = canvas.height = window.innerHeight
    const minDim = Math.min(w, h)

    // ── 背景恒星：80% 静态，20% 极慢漂移 ──
    starsRef.current = Array.from({ length: count }, (_, i) => ({
      x: Math.random() * w,
      y: Math.random() * h,
      z: Math.random(),
      size: Math.random() * MAX_STAR_SIZE + 0.5,
      opacity: Math.random() * 0.5 + 0.15,
      speed: i / count < STATIC_RATIO ? 0 : (Math.random() * 0.01 + 0.003) * speed,
      moving: i / count >= STATIC_RATIO,
    }))

    // ── 银河盘螺旋臂（更大面积）──
    const armParticles: SpiralParticle[] = []
    const a = minDim * 0.03 // 起始半径
    const b = 0.15 // 螺旋系数
    const thetaMax = Math.PI * 12 // 更多圈 → 更大面积
    for (let arm = 0; arm < SPIRAL_ARM_COUNT; arm++) {
      const armOffset = (arm / SPIRAL_ARM_COUNT) * Math.PI * 2
      for (let i = 0; i < PARTICLES_PER_ARM; i++) {
        const theta = rand(0, thetaMax) + armOffset
        const radius = a * Math.exp(b * theta)
        const offRange = radius * 0.18
        armParticles.push({
          theta,
          radius,
          ox: rand(-offRange, offRange),
          oy: rand(-offRange, offRange),
          size: rand(0.3, 1.5),
          opacity: rand(0.12, 0.5),
        })
      }
    }
    spiralParticlesRef.current = armParticles

    // ── 银河盘随机倾角 ──
    galaxyAngleRef.current = rand(-0.8, 0.8) // 明显倾斜

    // ── 星云 ──
    nebulaeRef.current = Array.from({ length: NEBULA_COUNT }, () => ({
      x: rand(w * 0.05, w * 0.95),
      y: rand(h * 0.05, h * 0.95),
      radius: rand(minDim * 0.08, minDim * 0.2),
      hue: rand(200, 320),
      saturation: rand(40, 80),
      opacity: rand(0.02, 0.06),
    }))

    // ── 行星轨道 ──
    const planetColors = ['#60a5fa', '#f472b6', '#34d399', '#fbbf24', '#a78bfa']
    orbitsRef.current = Array.from({ length: ORBIT_COUNT }, (_, i) => {
      const semiMajor = minDim * (0.12 + i * 0.08)
      const semiMinor = semiMajor * rand(0.4, 0.7)
      return {
        semiMajor,
        semiMinor,
        angle: rand(0, Math.PI),
        phase: rand(0, Math.PI * 2),
        speed: rand(0.1, 0.3) * (i % 2 === 0 ? 1 : -1),
        color: planetColors[i % planetColors.length],
        planetRadius: rand(3, 5),
        orbitColor: hsl(200 + i * 40, 50, 70, 0.12),
      }
    })

    // ── 四周随机星系 ──
    const galaxies: DistantGalaxy[] = []
    for (let i = 0; i < DISTANT_GALAXY_COUNT; i++) {
      // 沿画面边缘随机位置（不限制在四角）
      const edge = Math.floor(Math.random() * 4)
      let gx: number, gy: number
      const margin = minDim * 0.05
      switch (edge) {
        case 0: gx = rand(margin, w - margin); gy = rand(-margin * 0.5, margin * 1.5); break // 上
        case 1: gx = rand(w - margin * 1.5, w + margin * 0.5); gy = rand(margin, h - margin); break // 右
        case 2: gx = rand(margin, w - margin); gy = rand(h - margin * 1.5, h + margin * 0.5); break // 下
        default: gx = rand(-margin * 0.5, margin * 1.5); gy = rand(margin, h - margin); break // 左
      }
      const scale = rand(0.3, 0.7)
      const hue = rand(180, 320) + rand(0, 80)
      const particleCount = Math.floor(rand(40, 100))
      const particles: DistantGalaxy['particles'] = []
      for (let j = 0; j < particleCount; j++) {
        const gt = rand(0, Math.PI * 4)
        const gr = rand(0, scale * minDim * 0.06) * (1 + gt * 0.2)
        particles.push({
          ox: gr * Math.cos(gt) + rand(-gr * 0.2, gr * 0.2),
          oy: gr * Math.sin(gt) * rand(0.4, 0.7) + rand(-gr * 0.2, gr * 0.2),
          size: rand(0.3, 1.0),
          opacity: rand(0.15, 0.4),
        })
      }
      galaxies.push({ x: gx, y: gy, angle: rand(-0.8, 0.8), scale, hue, particles })
    }
    distantGalaxiesRef.current = galaxies

    startTimeRef.current = performance.now()
  }, [count, speed])

  /* ---------- 动画循环 ---------- */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const colors = THEME_COLORS[theme] ?? THEME_COLORS['reading-yellow']

    const animate = () => {
      if (paused) {
        animFrameRef.current = requestAnimationFrame(animate)
        return
      }

      const w = canvas.width
      const h = canvas.height
      const cx = w / 2
      const cy = h / 2
      const minDim = Math.min(w, h)
      const galAngle = galaxyAngleRef.current

      ctx.clearRect(0, 0, w, h)

      // ═══════════════ 1. 星云（最底层） ═══════════════
      if (showNebulae) {
        for (const neb of nebulaeRef.current) {
          const grad = ctx.createRadialGradient(neb.x, neb.y, 0, neb.x, neb.y, neb.radius)
          grad.addColorStop(0, hsl(neb.hue, neb.saturation, 60, neb.opacity * 1.5))
          grad.addColorStop(0.4, hsl(neb.hue, neb.saturation, 45, neb.opacity))
          grad.addColorStop(1, hsl(neb.hue, neb.saturation, 30, 0))
          ctx.fillStyle = grad
          ctx.fillRect(neb.x - neb.radius, neb.y - neb.radius, neb.radius * 2, neb.radius * 2)
        }
      }

      // ═══════════════ 2. 银河系（核心 + 螺旋臂，统一旋转） ═══════════════
      if (showSpiralArms) {
        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate(galAngle)

        // ── 核心辉光 ──
        const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, minDim * 0.1)
        const hue = theme === 'minimal-white' || theme === 'minimal-black' ? 40 : 45
        coreGrad.addColorStop(0, `hsla(${hue}, 80%, 85%, 0.25)`)
        coreGrad.addColorStop(0.4, `hsla(${hue + 10}, 70%, 60%, 0.10)`)
        coreGrad.addColorStop(1, `hsla(${hue + 20}, 60%, 40%, 0)`)
        ctx.fillStyle = coreGrad
        ctx.fillRect(-minDim * 0.1, -minDim * 0.1, minDim * 0.2, minDim * 0.2)

        // 核心外圈暖光晕
        const outerGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, minDim * 0.25)
        outerGlow.addColorStop(0, `hsla(${hue}, 70%, 70%, 0.06)`)
        outerGlow.addColorStop(0.5, `hsla(${hue + 20}, 60%, 50%, 0.03)`)
        outerGlow.addColorStop(1, 'hsla(220, 50%, 50%, 0)')
        ctx.fillStyle = outerGlow
        ctx.fillRect(-minDim * 0.25, -minDim * 0.25, minDim * 0.5, minDim * 0.5)

        // ── 螺旋臂（差速旋转：内快外慢，末端几乎静止）──
        const elapsed = (performance.now() - startTimeRef.current) / 1000
        const baseRotation = elapsed * SPIRAL_ROTATION_SPEED

        for (const p of spiralParticlesRef.current) {
          // 差速因子：半径越大旋转越慢
          const radiusNorm = p.radius / (minDim * 0.45)
          const rotationFactor = 1 / (1 + radiusNorm * 4)
          const theta = p.theta + baseRotation * rotationFactor
          const px = p.radius * Math.cos(theta) + p.ox
          const py = p.radius * Math.sin(theta) + p.oy

          if (Math.abs(px) > w || Math.abs(py) > h) continue

          const distRatio = Math.min(p.radius / (minDim * 0.55), 1)
          const armHue = 40 - distRatio * 70
          const armSat = 70 - distRatio * 20
          const armLit = 75 + distRatio * 10
          const alpha = p.opacity * (0.4 + (1 - distRatio) * 0.6)

          ctx.beginPath()
          ctx.arc(px, py, p.size, 0, Math.PI * 2)
          ctx.fillStyle = hsl(armHue < 0 ? armHue + 360 : armHue, armSat, armLit, alpha)
          ctx.fill()
        }

        ctx.restore()
      }

      // ═══════════════ 3. 四周随机星系 ═══════════════
      if (showDistantGalaxies) {
        for (const g of distantGalaxiesRef.current) {
          ctx.save()
          ctx.translate(g.x, g.y)
          ctx.rotate(g.angle)

          // 星系核心光晕
          const coreR = g.scale * minDim * 0.008
          const gGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR * 5)
          gGlow.addColorStop(0, `hsla(${g.hue}, 70%, 75%, 0.15)`)
          gGlow.addColorStop(0.5, `hsla(${g.hue}, 60%, 55%, 0.06)`)
          gGlow.addColorStop(1, `hsla(${g.hue}, 50%, 40%, 0)`)
          ctx.fillStyle = gGlow
          ctx.fillRect(-coreR * 5, -coreR * 5, coreR * 10, coreR * 10)

          // 星系粒子
          for (const p of g.particles) {
            ctx.beginPath()
            ctx.arc(p.ox, p.oy, p.size, 0, Math.PI * 2)
            ctx.fillStyle = hsl(g.hue, 60, 75, p.opacity)
            ctx.fill()
          }

          ctx.restore()
        }
      }

      // ═══════════════ 4. 行星轨道 ═══════════════
      if (showOrbits) {
        const elapsed = (performance.now() - startTimeRef.current) / 1000
        for (const orb of orbitsRef.current) {
          ctx.save()
          ctx.translate(cx, cy)
          ctx.rotate(orb.angle)
          ctx.beginPath()
          ctx.ellipse(0, 0, orb.semiMajor, orb.semiMinor, 0, 0, Math.PI * 2)
          ctx.strokeStyle = orb.orbitColor
          ctx.lineWidth = 1
          ctx.stroke()
          ctx.restore()

          const phase = orb.phase + elapsed * orb.speed
          const px = cx + orb.semiMajor * Math.cos(phase) * Math.cos(orb.angle)
            - orb.semiMinor * Math.sin(phase) * Math.sin(orb.angle)
          const py = cy + orb.semiMajor * Math.cos(phase) * Math.sin(orb.angle)
            + orb.semiMinor * Math.sin(phase) * Math.cos(orb.angle)

          const glow = ctx.createRadialGradient(px, py, 0, px, py, orb.planetRadius * 3)
          glow.addColorStop(0, orb.color + '40')
          glow.addColorStop(1, orb.color + '00')
          ctx.fillStyle = glow
          ctx.fillRect(px - orb.planetRadius * 3, py - orb.planetRadius * 3, orb.planetRadius * 6, orb.planetRadius * 6)

          ctx.beginPath()
          ctx.arc(px, py, orb.planetRadius, 0, Math.PI * 2)
          ctx.fillStyle = orb.color
          ctx.fill()
        }
      }

      // ═══════════════ 5. 背景恒星（最顶层） ═══════════════
      for (const star of starsRef.current) {
        const depthFactor = star.z
        const alpha = star.opacity * (0.3 + depthFactor * 0.7)
        const size = star.size * (0.5 + depthFactor * 0.5)

        ctx.beginPath()
        ctx.arc(star.x, star.y, size, 0, Math.PI * 2)
        ctx.fillStyle = colors.star
        ctx.globalAlpha = alpha
        ctx.fill()

        if (star.moving) {
          // 仅移动的星星消耗性能
          star.y -= star.speed
          if (star.y < -5) {
            star.y = h + 5
            star.x = Math.random() * w
          }
          star.opacity += (Math.random() - 0.5) * 0.02
          star.opacity = Math.max(0.1, Math.min(0.8, star.opacity))
        }
      }

      ctx.globalAlpha = 1
      animFrameRef.current = requestAnimationFrame(animate)
    }

    animate()
    return () => { cancelAnimationFrame(animFrameRef.current) }
  }, [theme, paused, showSpiralArms, showNebulae, showOrbits, showDistantGalaxies])

  /* ---------- resize ---------- */
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Apple HIG Deference：极简模式下不渲染任何背景装饰
  if (theme === 'minimal-white' || theme === 'minimal-black') {
    return null
  }

  return (
    <canvas
      ref={canvasRef}
      className={[styles.canvas, className].filter(Boolean).join(' ')}
      aria-hidden="true"
    />
  )
}
