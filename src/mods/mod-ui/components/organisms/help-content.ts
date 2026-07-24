export interface HelpChapter {
  id: string
  label: string
  heading: string
}

export const HELP_CHAPTERS: HelpChapter[] = [
  { id: 'help-start-settings', label: '开始', heading: '开始与设置' },
  { id: 'help-world-select', label: '世界选择', heading: '世界选择' },
  { id: 'help-world-customize', label: '世界配置', heading: '世界定制' },
  { id: 'help-character-create', label: '角色创建', heading: '角色创建' },
  { id: 'help-talent-select', label: '命格', heading: '命格选取' },
  { id: 'help-story', label: '故事', heading: '主故事页' },
]

function normalizeHeading(value: string): string {
  return value.replace(/^\d+[.、]\s*/, '').trim()
}

const HELP_CHAPTER_IDS_BY_HEADING = new Map(
  HELP_CHAPTERS.map((chapter) => [normalizeHeading(chapter.heading), chapter.id]),
)

/** 为未登记标题生成基于标题文本的稳定 ID，避免插入章节后其余锚点整体漂移。 */
function stableFallbackSectionId(heading: string): string {
  let hash = 2166136261
  for (let index = 0; index < heading.length; index++) {
    hash ^= heading.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `help-section-${(hash >>> 0).toString(36)}`
}

function resolveHelpSectionId(heading: string): string {
  const normalized = normalizeHeading(heading)
  return HELP_CHAPTER_IDS_BY_HEADING.get(normalized) ?? stableFallbackSectionId(normalized)
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatInline(value: string): string {
  return escapeHtml(value).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
}

export function renderMdToHtml(md: string): string {
  // 静态文档可能来自 Windows CRLF、Unix LF 或局部编辑后的混合换行。
  // 先规范化再识别标题，避免行尾 \r 让章节标题退化成普通段落。
  const lines = md.replace(/\r\n?/g, '\n').split('\n')
  const htmlParts: string[] = []
  let inList = false
  let inSection = false

  const closeList = () => {
    if (!inList) return
    htmlParts.push('</ul>')
    inList = false
  }

  for (const line of lines) {
    const trimmed = line.trim()
    const heading3 = line.match(/^### (.+)$/)
    const heading2 = line.match(/^## (.+)$/)
    const heading1 = line.match(/^# (.+)$/)
    const listItem = line.match(/^- (.+)$/)

    if (heading3) {
      closeList()
      htmlParts.push(`<h3>${formatInline(heading3[1])}</h3>`)
    } else if (heading2) {
      closeList()
      if (inSection) htmlParts.push('</section>')
      const id = resolveHelpSectionId(heading2[1])
      htmlParts.push(`<section id="${id}" class="help-doc-section"><h2>${formatInline(heading2[1])}</h2>`)
      inSection = true
    } else if (heading1) {
      closeList()
      htmlParts.push(`<h1>${formatInline(heading1[1])}</h1>`)
    } else if (listItem) {
      if (!inList) {
        htmlParts.push('<ul>')
        inList = true
      }
      htmlParts.push(`<li>${formatInline(listItem[1])}</li>`)
    } else if (trimmed === '') {
      closeList()
    } else {
      closeList()
      htmlParts.push(`<p>${formatInline(line)}</p>`)
    }
  }

  closeList()
  if (inSection) htmlParts.push('</section>')
  return htmlParts.join('')
}

export function renderChangelogToHtml(text: string): string {
  const htmlParts: string[] = []
  const sections = text.split(/^---\s*$/m).map((section) => section.trim()).filter(Boolean)

  for (const section of sections) {
    const lines = section.split('\n')
    const version = lines.find((line) => /^Version:\s*/i.test(line.trim()))?.replace(/^Version:\s*/i, '').trim() ?? ''
    const date = lines.find((line) => /^Date:\s*/i.test(line.trim()))?.replace(/^Date:\s*/i, '').trim() ?? ''
    let currentCategory = ''
    let inList = false

    htmlParts.push('<section class="help-changelog-section">')
    if (version || date) {
      htmlParts.push(`<header><strong>${escapeHtml(version)}</strong><time>${escapeHtml(date)}</time></header>`)
    }

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || /^Version:\s*/i.test(trimmed) || /^Date:\s*/i.test(trimmed)) continue

      if ((trimmed.endsWith(':') || trimmed.endsWith('：')) && !trimmed.startsWith('-')) {
        if (inList) { htmlParts.push('</ul>'); inList = false }
        currentCategory = trimmed.slice(0, -1)
      } else if (trimmed.startsWith('-')) {
        if (!inList) {
          if (currentCategory) htmlParts.push(`<h3>${escapeHtml(currentCategory)}</h3>`)
          htmlParts.push('<ul>')
          inList = true
        }
        htmlParts.push(`<li>${escapeHtml(trimmed.replace(/^-+\s*/, ''))}</li>`)
      } else {
        if (inList) { htmlParts.push('</ul>'); inList = false }
        currentCategory = ''
        htmlParts.push(`<p>${escapeHtml(trimmed)}</p>`)
      }
    }

    if (inList) htmlParts.push('</ul>')
    htmlParts.push('</section>')
  }

  return htmlParts.join('')
}

const MAX_CHANGELOG_CHUNKS = 100

export async function probeMaxChunk(
  loadChunk: (idx: number) => Promise<string | null>,
): Promise<{ maxFound: number; newestHtml: string | null }> {
  let lo = 1
  let hi = MAX_CHANGELOG_CHUNKS
  let lastSuccess = 0
  let lastHtml: string | null = null

  while (lo <= hi) {
    const mid = Math.ceil((lo + hi) / 2)
    try {
      const html = await loadChunk(mid)
      if (html !== null) {
        lastSuccess = mid
        lastHtml = html
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    } catch {
      hi = mid - 1
    }
  }

  return { maxFound: lastSuccess, newestHtml: lastHtml }
}
