export interface GameOverShareDimension {
  label: string
  value: number
  comment?: string
}

export interface GameOverShareMythic {
  name: string
  concept: string
  effect: string
}

export interface GameOverShareCardData {
  lifeRunId: string
  characterName: string
  worldName: string
  ageLabel: string
  rounds: number
  moralityLabel: string
  overallScore: number
  dimensions: readonly GameOverShareDimension[]
  mythic?: GameOverShareMythic | null
  shareUrl?: string
}

export interface GameOverShareFact {
  label: string
  value: string
}

export type GameOverShareOutcome = 'shared' | 'downloaded' | 'cancelled'

interface PreparedCardLayout {
  nameLines: string[]
  worldLines: string[]
  facts: Array<GameOverShareFact & { lines: string[] }>
  mythicTitleLines: string[]
  mythicEffectLines: string[]
  height: number
}

const CARD_WIDTH = 1080
const CARD_MIN_HEIGHT = 1440
const CARD_PADDING = 88
const CARD_CONTENT_WIDTH = CARD_WIDTH - CARD_PADDING * 2
const FONT_SERIF = '"Songti SC", "Noto Serif SC", "Microsoft YaHei", serif'
const FONT_SANS = '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif'

const COLORS = {
  background: '#f2f4f3',
  paper: '#ffffff',
  text: '#20252b',
  secondary: '#606a75',
  tertiary: '#8c98a4',
  border: '#dfe5ea',
  accent: '#6d7f94',
  accentSoft: '#eef2f5',
  warm: '#9a7966',
}

export function getStrongestShareDimension(
  dimensions: readonly GameOverShareDimension[],
): GameOverShareDimension | null {
  if (dimensions.length === 0) return null
  return dimensions.reduce((strongest, current) => (
    current.value > strongest.value ? current : strongest
  ))
}

function getDimensionComment(dimension: GameOverShareDimension): string {
  return dimension.comment?.trim() || '未记录'
}

export function buildGameOverShareFacts(data: GameOverShareCardData): GameOverShareFact[] {
  const strongest = getStrongestShareDimension(data.dimensions)
  return [
    { label: '此生行程', value: `${data.rounds} 轮世事` },
    { label: '此生年岁', value: data.ageLabel },
    { label: '此生品性', value: data.moralityLabel },
    {
      label: '最鲜明力量',
      value: strongest
        ? `${strongest.label} ${strongest.value} · ${getDimensionComment(strongest)}`
        : '尚无四维记录',
    },
  ]
}

export function buildGameOverShareText(data: GameOverShareCardData): string {
  const strongest = getStrongestShareDimension(data.dimensions)
  const lines = [
    `${data.characterName || '无名之辈'}在「${data.worldName}」走完了一生。`,
    `${data.rounds} 轮世事 · ${data.ageLabel} · 四维均分 ${data.overallScore} · ${data.moralityLabel}`,
    strongest
      ? `最鲜明的力量：${strongest.label} ${strongest.value}（${getDimensionComment(strongest)}）`
      : '',
    data.mythic ? `此生留下的命格余响：${data.mythic.name} · ${data.mythic.concept}` : '',
    '#AI人生模拟器',
    data.shareUrl?.trim() ?? '',
  ]
  return lines.filter(Boolean).join('\n')
}

export function buildGameOverShareFileName(data: Pick<GameOverShareCardData, 'lifeRunId'>): string {
  const safeRunId = data.lifeRunId.replace(/[^a-zA-Z0-9_-]/g, '-') || 'life'
  return `ai-life-sim-${safeRunId}.png`
}

function getCanvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前浏览器无法生成分享图片')
  return context
}

function wrapCanvasText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const units = Array.from(text || '未记录')
  const lines: string[] = []
  let current = ''

  for (const unit of units) {
    const candidate = current + unit
    if (current && context.measureText(candidate).width > maxWidth) {
      lines.push(current)
      current = unit
    } else {
      current = candidate
    }
  }
  if (current || lines.length === 0) lines.push(current || '未记录')
  return lines
}

function prepareCardLayout(
  context: CanvasRenderingContext2D,
  data: GameOverShareCardData,
): PreparedCardLayout {
  context.font = `600 76px ${FONT_SERIF}`
  const nameLines = wrapCanvasText(context, data.characterName || '无名之辈', CARD_CONTENT_WIDTH)

  context.font = `400 32px ${FONT_SANS}`
  const worldLines = wrapCanvasText(context, data.worldName || '未知世界', CARD_CONTENT_WIDTH)

  context.font = `600 32px ${FONT_SANS}`
  const facts = buildGameOverShareFacts(data).map((fact) => ({
    ...fact,
    lines: wrapCanvasText(context, fact.value, CARD_CONTENT_WIDTH - 56),
  }))

  context.font = `600 50px ${FONT_SERIF}`
  const mythicTitleLines = wrapCanvasText(
    context,
    data.mythic?.name ?? '此生已经留下回声',
    CARD_CONTENT_WIDTH - 160,
  )

  context.font = `400 30px ${FONT_SANS}`
  const mythicEffectLines = wrapCanvasText(
    context,
    data.mythic?.effect ?? '分享卡只记录当前结算事实，不从故事正文推断未发生的成就。',
    CARD_CONTENT_WIDTH - 160,
  )

  const factsBoxesHeight = facts.reduce(
    (sum, fact) => sum + 62 + fact.lines.length * 44 + 16,
    0,
  )
  const mythicBoxHeight = 108 + mythicTitleLines.length * 62 + mythicEffectLines.length * 44
  const contentBottom = 268
    + nameLines.length * 92
    + 8
    + worldLines.length * 46
    + 34
    + 176
    + 48
    + factsBoxesHeight
    + 30
    + 48
    + data.dimensions.length * 82
    + 34
    + mythicBoxHeight
  const height = Math.max(
    CARD_MIN_HEIGHT,
    contentBottom + 200,
  )

  return {
    nameLines,
    worldLines,
    facts,
    mythicTitleLines,
    mythicEffectLines,
    height,
  }
}

function roundedRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const safeRadius = Math.min(radius, width / 2, height / 2)
  context.beginPath()
  context.moveTo(x + safeRadius, y)
  context.lineTo(x + width - safeRadius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius)
  context.lineTo(x + width, y + height - safeRadius)
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height)
  context.lineTo(x + safeRadius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius)
  context.lineTo(x, y + safeRadius)
  context.quadraticCurveTo(x, y, x + safeRadius, y)
  context.closePath()
}

function fillRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: string,
  stroke?: string,
): void {
  roundedRectPath(context, x, y, width, height, radius)
  context.fillStyle = fill
  context.fill()
  if (stroke) {
    context.strokeStyle = stroke
    context.lineWidth = 2
    context.stroke()
  }
}

function drawLines(
  context: CanvasRenderingContext2D,
  lines: readonly string[],
  x: number,
  startY: number,
  lineHeight: number,
): number {
  let y = startY
  for (const line of lines) {
    context.fillText(line, x, y)
    y += lineHeight
  }
  return y
}

function drawShareCard(
  context: CanvasRenderingContext2D,
  data: GameOverShareCardData,
  layout: PreparedCardLayout,
): void {
  const { width } = context.canvas
  const strongest = getStrongestShareDimension(data.dimensions)
  context.fillStyle = COLORS.background
  context.fillRect(0, 0, width, layout.height)

  fillRoundedRect(
    context,
    38,
    38,
    width - 76,
    layout.height - 76,
    38,
    COLORS.paper,
    COLORS.border,
  )

  context.save()
  context.globalAlpha = 0.12
  context.strokeStyle = COLORS.accent
  context.lineWidth = 3
  context.beginPath()
  context.arc(width - 72, 72, 190, 0, Math.PI * 2)
  context.stroke()
  context.beginPath()
  context.arc(width - 72, 72, 132, 0, Math.PI * 2)
  context.stroke()
  context.restore()

  let y = 112
  context.fillStyle = COLORS.tertiary
  context.font = `700 24px ${FONT_SANS}`
  context.letterSpacing = '3px'
  context.fillText('AI LIFE SIM · 命书', CARD_PADDING, y)
  context.textAlign = 'right'
  context.fillText(`终章 · ${String(data.rounds).padStart(3, '0')}`, width - CARD_PADDING, y)
  context.textAlign = 'left'
  context.letterSpacing = '0px'

  y += 64
  context.strokeStyle = COLORS.border
  context.lineWidth = 2
  context.beginPath()
  context.moveTo(CARD_PADDING, y)
  context.lineTo(width - CARD_PADDING, y)
  context.stroke()

  y += 92
  context.fillStyle = COLORS.text
  context.font = `600 76px ${FONT_SERIF}`
  y = drawLines(context, layout.nameLines, CARD_PADDING, y, 92)

  y += 8
  context.fillStyle = COLORS.secondary
  context.font = `400 32px ${FONT_SANS}`
  y = drawLines(context, layout.worldLines, CARD_PADDING, y, 46)

  y += 34
  fillRoundedRect(context, CARD_PADDING, y, CARD_CONTENT_WIDTH, 116, 24, COLORS.accentSoft)
  context.fillStyle = COLORS.accent
  context.font = `600 48px ${FONT_SERIF}`
  context.fillText(String(data.overallScore), CARD_PADDING + 34, y + 70)
  context.fillStyle = COLORS.secondary
  context.font = `600 28px ${FONT_SANS}`
  context.fillText('四维均分', CARD_PADDING + 132, y + 52)
  context.fillStyle = COLORS.tertiary
  context.font = `400 24px ${FONT_SANS}`
  context.fillText(
    strongest ? `此生最鲜明的力量：${strongest.label}` : '此生四维尚无记录',
    CARD_PADDING + 132,
    y + 84,
  )
  y += 176

  context.fillStyle = COLORS.text
  context.font = `600 42px ${FONT_SERIF}`
  context.fillText('此生留痕', CARD_PADDING, y)
  y += 48

  for (const fact of layout.facts) {
    const boxHeight = 62 + fact.lines.length * 44
    fillRoundedRect(context, CARD_PADDING, y, CARD_CONTENT_WIDTH, boxHeight, 20, '#fbfcfc', COLORS.border)
    context.fillStyle = COLORS.tertiary
    context.font = `700 22px ${FONT_SANS}`
    context.fillText(fact.label, CARD_PADDING + 28, y + 36)
    context.fillStyle = COLORS.text
    context.font = `600 32px ${FONT_SANS}`
    drawLines(context, fact.lines, CARD_PADDING + 28, y + 82, 44)
    y += boxHeight + 16
  }

  y += 30
  context.fillStyle = COLORS.text
  context.font = `600 42px ${FONT_SERIF}`
  context.fillText('真实四维', CARD_PADDING, y)
  y += 48

  const dimensionMaxWidth = CARD_CONTENT_WIDTH - 172
  for (const dimension of data.dimensions) {
    context.fillStyle = COLORS.secondary
    context.font = `600 27px ${FONT_SANS}`
    context.fillText(dimension.label, CARD_PADDING, y + 31)
    context.fillStyle = COLORS.tertiary
    context.font = `400 22px ${FONT_SANS}`
    context.fillText(getDimensionComment(dimension), CARD_PADDING, y + 61)
    context.textAlign = 'right'
    context.fillStyle = COLORS.text
    context.font = `600 32px ${FONT_SERIF}`
    context.fillText(String(dimension.value), width - CARD_PADDING, y + 42)
    context.textAlign = 'left'

    const barX = CARD_PADDING + 130
    const barY = y + 20
    fillRoundedRect(context, barX, barY, dimensionMaxWidth, 18, 9, COLORS.accentSoft)
    const normalizedValue = Math.max(0, Math.min(100, dimension.value))
    if (normalizedValue > 0) {
      fillRoundedRect(
        context,
        barX,
        barY,
        Math.max(18, dimensionMaxWidth * normalizedValue / 100),
        18,
        9,
        COLORS.accent,
      )
    }
    y += 82
  }

  y += 34
  const mythicBoxHeight = 108 + layout.mythicTitleLines.length * 62 + layout.mythicEffectLines.length * 44
  fillRoundedRect(context, CARD_PADDING, y, CARD_CONTENT_WIDTH, mythicBoxHeight, 28, COLORS.accentSoft, COLORS.border)
  context.fillStyle = COLORS.accent
  context.font = `700 22px ${FONT_SANS}`
  context.fillText(data.mythic ? `命格余响 · ${data.mythic.concept}` : '命格余响', CARD_PADDING + 34, y + 42)
  context.fillStyle = COLORS.text
  context.font = `600 50px ${FONT_SERIF}`
  let mythicY = drawLines(context, layout.mythicTitleLines, CARD_PADDING + 34, y + 102, 62)
  mythicY += 6
  context.fillStyle = COLORS.secondary
  context.font = `400 30px ${FONT_SANS}`
  drawLines(context, layout.mythicEffectLines, CARD_PADDING + 34, mythicY, 44)

  const footerY = layout.height - 100
  context.strokeStyle = COLORS.border
  context.beginPath()
  context.moveTo(CARD_PADDING, footerY - 44)
  context.lineTo(width - CARD_PADDING, footerY - 44)
  context.stroke()
  context.fillStyle = COLORS.tertiary
  context.font = `400 22px ${FONT_SANS}`
  context.fillText('由真实结算数据在本机生成 · 不含故事正文与私密配置', CARD_PADDING, footerY)
  context.textAlign = 'right'
  context.fillStyle = COLORS.warm
  context.fillText(data.shareUrl?.trim() || 'AI 人生模拟器', width - CARD_PADDING, footerY)
  context.textAlign = 'left'
}

export async function renderGameOverShareCard(data: GameOverShareCardData): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = CARD_WIDTH
  canvas.height = CARD_MIN_HEIGHT
  let context = getCanvasContext(canvas)
  const layout = prepareCardLayout(context, data)
  canvas.height = layout.height
  context = getCanvasContext(canvas)
  drawShareCard(context, data, layout)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('分享图片生成失败'))
    }, 'image/png')
  })
}

function downloadShareCard(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function saveGameOverShareCard(data: GameOverShareCardData): Promise<void> {
  const blob = await renderGameOverShareCard(data)
  downloadShareCard(blob, buildGameOverShareFileName(data))
}

export async function shareGameOverLife(data: GameOverShareCardData): Promise<GameOverShareOutcome> {
  const blob = await renderGameOverShareCard(data)
  const fileName = buildGameOverShareFileName(data)
  const file = typeof File === 'function'
    ? new File([blob], fileName, { type: 'image/png' })
    : null
  let canShareFile = false
  if (file && typeof navigator.share === 'function') {
    try {
      canShareFile = typeof navigator.canShare !== 'function' || navigator.canShare({ files: [file] })
    } catch {
      canShareFile = false
    }
  }

  if (file && canShareFile) {
    try {
      await navigator.share({
        title: `${data.characterName || '无名之辈'}的一生回望`,
        text: buildGameOverShareText(data),
        files: [file],
      })
      return 'shared'
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return 'cancelled'
    }
  }

  downloadShareCard(blob, fileName)
  return 'downloaded'
}
