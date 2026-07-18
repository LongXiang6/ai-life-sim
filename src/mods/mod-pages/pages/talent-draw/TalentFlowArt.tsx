'use client'

import styles from './TalentDraw.module.css'

type FlowIconName = 'arrow' | 'back' | 'plus' | 'close' | 'shuffle'

const ICON_PATHS: Record<FlowIconName, string[]> = {
  arrow: ['M5 12h14', 'M13 6l6 6-6 6'],
  back: ['M19 12H5', 'M11 6l-6 6 6 6'],
  plus: ['M12 5v14', 'M5 12h14'],
  close: ['m6 6 12 12', 'M18 6 6 18'],
  shuffle: ['M4 7h3c5 0 5 10 10 10h3', 'M17 14l3 3-3 3', 'M4 17h3c2 0 3-.8 4-2', 'M15 7h5', 'M17 4l3 3-3 3'],
}

export function FlowIcon({ name }: { name: FlowIconName }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {ICON_PATHS[name].map((path) => <path key={path} d={path} />)}
    </svg>
  )
}

function Medallion({ className, reduced = false }: { className: string; reduced?: boolean }) {
  return (
    <svg className={`${styles.medallion} ${className}`} viewBox="0 0 160 160" aria-hidden="true">
      <g transform="translate(80 80)">
        <circle r="75" />
        {!reduced ? <><circle r="70" /><circle r="64" strokeDasharray="1 5" strokeWidth="1.15" /></> : null}
        <circle r="57" />
        {!reduced ? <circle r="45" /> : null}
        <circle r="31" />
        {!reduced ? <circle r="17" /> : null}
        {[0, 45, 90, 135].map((rotation) => (
          <path key={`outer-${rotation}`} d="M0-70 5-60 0-49-5-60Z" transform={rotation ? `rotate(${rotation})` : undefined} />
        ))}
        {!reduced ? [0, 45, 90, 135].map((rotation) => (
          <path key={`inner-${rotation}`} d="M0-45 9-35 0-25-9-35Z" transform={rotation ? `rotate(${rotation})` : undefined} />
        )) : null}
        {!reduced ? [0, 45, 90, 135].map((rotation) => (
          <ellipse key={`petal-${rotation}`} cy="-18" rx="6" ry="16" transform={rotation ? `rotate(${rotation})` : undefined} />
        )) : null}
        <rect x="-12" y="-12" width="24" height="24" transform="rotate(45)" />
        <circle r="5" />
        {!reduced ? <circle r="1.8" fill="currentColor" stroke="none" /> : null}
      </g>
    </svg>
  )
}

export function TalentFlowArt() {
  return (
    <div className={styles.flowArt} aria-hidden="true">
      <Medallion className={styles.medallionTopLeft} />
      <Medallion className={styles.medallionTopRight} />
      <Medallion className={styles.medallionBottomLeft} reduced />
      <Medallion className={styles.medallionBottomRight} reduced />
      <svg className={styles.inkArt} viewBox="0 0 340 220" preserveAspectRatio="xMidYMax meet">
        <path className={styles.inkFar} d="M0 170c25-16 48-21 72-14 18-26 39-39 62-35 19-39 47-61 77-54 18-26 40-35 63-25 22-16 44-18 66-9v187H0Z" />
        <path className={styles.inkMist} d="M0 181c34-12 63-13 89-4 24-25 50-34 78-25 28-25 59-31 92-16 27-18 54-20 81-11v95H0Z" />
        <path className={styles.inkMid} d="M0 190c31-18 62-20 92-8 24-22 51-29 79-19 28-23 59-28 92-14 26-16 52-18 77-9v80H0Z" />
        <path className={styles.inkNear} d="M0 204c36-10 68-9 98 2 33-13 66-14 99-2 32-12 64-13 96-2 18-6 34-6 47-2v20H0Z" />
        <path className={styles.inkLine} d="M7 177c38-25 74-27 109-9 37-27 76-33 116-14 35-22 70-24 103-7" />
        <path className={styles.inkRipple} d="M22 201c25-5 49-5 73 0m35 8c32-5 64-5 95 0m31-9c23-4 45-4 66 0" />
      </svg>
    </div>
  )
}
