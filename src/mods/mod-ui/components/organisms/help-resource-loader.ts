import { renderMdToHtml } from './help-content'

export async function fetchHelpHtml(signal?: AbortSignal): Promise<string> {
  const response = await fetch('/help.md', { signal })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return renderMdToHtml(await response.text())
}

export async function fetchLatestChangelogChunk(): Promise<number> {
  const response = await fetch('/changelog-index.json', { cache: 'no-store' })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const index = await response.json() as { latestChunk?: unknown }
  if (!Number.isInteger(index.latestChunk) || Number(index.latestChunk) < 1) {
    throw new Error('更新日志索引无效')
  }
  return Number(index.latestChunk)
}
