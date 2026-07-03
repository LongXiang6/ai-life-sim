/**
 * @module scan-persist-format.mjs
 * @description A-?? — Zustand persist 序列化格式一致性扫描
 *
 * 问题：Zustand persist 启用 version 选项后，数据序列化为 { state: {...}, version: N }
 *       而非扁平对象。若其他代码直接用 JSON.parse 解析该 localStorage 条目但访问了
 *       顶层而非 .state，会导致所有字段丢失 → 数据被静默清空。
 *
 * 扫描逻辑：
 *   1. 收集所有 persist({ name: 'xxx', version: N }) 的 store → 记录 name + version
 *   2. 收集所有 localStorage.getItem('xxx') 引用 → 记录文件+行号
 *   3. 交叉比对：若某文件读取了带 version 的 store，检查该文件是否访问 .state
 *      （在 getItem 行前后 20 行范围内搜索 obj.state / data.state / .state 等模式）
 *   4. 未通过的报告 WARN —— 可能遗漏 version 包装层处理
 *
 * 文件范围：src/ 下所有 .ts/.tsx（不含 node_modules、.next）
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { logDomainSummary } from '../../lib/quiet.mjs'
import { getProjectRoot } from '../../lib/project-root.mjs'

const ROOT = getProjectRoot(import.meta.url)
const SRC = path.join(ROOT, 'src')

let warnCount = 0
let errCount = 0

// ============================================================
// Step 1: 收集所有 Zustand persist store 的 name + version
// ============================================================

/** @type {Map<string, { name: string, version: number, file: string }>} */
const storeRegistry = new Map()

function collectStores(dir) {
  const entries = fs.readdirSync(dir, { withFallback: true })
  for (const entry of entries) {
    const full = path.join(dir, entry)
    if (entry === 'node_modules' || entry === '.next') continue
    const stat = fs.lstatSync(full)
    if (stat.isDirectory()) {
      collectStores(full)
    } else if (/\.(ts|tsx)$/.test(entry)) {
      const content = fs.readFileSync(full, 'utf8')
      // 匹配 persist(..., { name: 'xxx', ..., version: N, ... })
      const persistBlockRe = /\bpersist\s*\([\s\S]*?\{[\s\S]*?name:\s*['"]([^'"]+)['"][\s\S]*?\}/g
      let match
      while ((match = persistBlockRe.exec(content)) !== null) {
        const blockText = match[0]
        const storeName = match[1] // name value
        // 检查是否有 version
        const versionMatch = blockText.match(/\bversion:\s*(\d+)/)
        if (versionMatch) {
          const version = parseInt(versionMatch[1], 10)
          // 排除 devtools 等不是 name 来自 persist 的误匹配
          // 再确认这个 name 确实来自 persist 的 config 对象（在 persist 调用内）
          const persistIndex = blockText.indexOf('persist(')
          const nameIndex = blockText.indexOf(`name: '${storeName}'`)
          if (nameIndex < persistIndex) continue // name 在 persist 之前，不匹配
          storeRegistry.set(storeName, { name: storeName, version, file: path.relative(SRC, full).replace(/\\/g, '/') })
        }
      }
    }
  }
}

// ============================================================
// Step 2: 查找 localStorage.getItem 引用 + 验证 .state 访问
// ============================================================

/** 检查 content 中 lineIdx 前后 span 行内是否包含 .state 访问模式 */
function hasStateAccess(content, lineIdx, span = 20) {
  const lines = content.split('\n')
  const start = Math.max(0, lineIdx - 1)
  const end = Math.min(lines.length, lineIdx + span)
  const window = lines.slice(start, end).join('\n')
  // 匹配 .state 作为属性访问（不含 .stateKey 等长写法的误匹配）
  return /\.state\b/.test(window)
}

/** 检查文件是否提供了 getItem() 的豁免注释（显式标记"handled"） */
const HANDLED_COMMENT_RE = /(?:无 version|versionless|扁平存储|no.*version|handled.*version|已处理.*version)/i

function scanFile(fullPath) {
  const relPath = path.relative(SRC, fullPath).replace(/\\/g, '/')
  const content = fs.readFileSync(fullPath, 'utf8')

  // 如果文件本身是一个 store 定义文件，跳过（store 自己读 localStorage 是正常的）
  if (storeRegistry.size > 0) {
    const isStoreFile = [...storeRegistry.values()].some(s => content.includes(`name: '${s.name}'`))
    if (isStoreFile) return
  }

  // 匹配 localStorage.getItem('key') 或 localStorage.getItem("key") 或 localStorage.getItem(keyVar)
  const getItemRegex = /localStorage\.getItem\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  let match
  while ((match = getItemRegex.exec(content)) !== null) {
    const storeName = match[1]
    const storeInfo = storeRegistry.get(storeName)
    if (!storeInfo || !storeInfo.version) continue // 不是 versioned store，跳过

    const lineIdx = content.substring(0, match.index).split('\n').length

    // 豁免：文件中有明确注释说明已处理 version
    if (HANDLED_COMMENT_RE.test(content)) continue

    // 检查是否有 .state 访问
    if (hasStateAccess(content, lineIdx)) continue

    // 报告
    warnCount++
    const absPath = path.relative(ROOT, fullPath).replace(/\\/g, '/')
    console.warn(
      `\x1b[33m[WARN]\x1b[0m ${absPath}:${lineIdx} — localStorage.getItem('${storeName}')` +
      ` 读取的 store 有 version:${storeInfo.version}（定义于 ${storeInfo.file}），` +
      `但该文件未检测到 .state 访问（数据可能嵌套在 obj.state 内）`
    )
  }
}

function scanAll(dir) {
  const entries = fs.readdirSync(dir, { withFallback: true })
  for (const entry of entries) {
    const full = path.join(dir, entry)
    if (entry === 'node_modules' || entry === '.next') continue
    const stat = fs.lstatSync(full)
    if (stat.isDirectory()) {
      scanAll(full)
    } else if (/\.(ts|tsx)$/.test(entry)) {
      try {
        scanFile(full)
      } catch {
        errCount++
        console.error(`\x1b[31m[ERR]\x1b[0m Failed to scan ${full}`)
      }
    }
  }
}

// ============================================================
// 主流程
// ============================================================

collectStores(SRC)
console.info(`[persist-format] Found ${storeRegistry.size} versioned persist stores`)

scanAll(SRC)

const status = (warnCount > 0 || errCount > 0) ? 'FAIL' : 'PASS'
const detail = `${warnCount} warnings, ${errCount} errors`
logDomainSummary('persist-format', status, detail)
process.exit(status === 'FAIL' ? 1 : 0)
