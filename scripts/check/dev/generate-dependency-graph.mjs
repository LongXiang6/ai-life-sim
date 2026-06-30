/**
 * @module generate-dependency-graph.mjs
 * @description 从 manifest 生成 MOD 依赖 Mermaid 图（蓝图 Phase 5.4）
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const MODS = path.join(ROOT, 'src', 'mods')
const OUT = path.join(ROOT, 'reports', 'mod-dependency-graph.md')

const mods = fs.readdirSync(MODS).filter((d) => d.startsWith('mod-'))
const edges = []

for (const mod of mods) {
  const manifestPath = path.join(MODS, mod, 'manifest.ts')
  if (!fs.existsSync(manifestPath)) continue
  const content = fs.readFileSync(manifestPath, 'utf8')
  const depMatch = content.match(/dependencies:\s*\[([\s\S]*?)\]/)
  if (!depMatch) continue
  const deps = [...depMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1].replace(/^[\?\~!]\s*/, '').trim())
  for (const dep of deps) {
    if (dep.startsWith('mod-')) edges.push(`  ${dep} --> ${mod}`)
  }
}

const mermaid = ['```mermaid', 'flowchart LR', ...edges, '```'].join('\n')
fs.mkdirSync(path.dirname(OUT), { recursive: true })
const now = new Date()
const bjTime = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
fs.writeFileSync(OUT, `# MOD 依赖图\n\n自动生成: ${bjTime} (北京时间)\n\n${mermaid}\n`, 'utf8')
console.log(`[generate-dependency-graph] 写入 ${OUT} (${edges.length} 条边)`)
