/**
 * Purpose: Validate managed text, Markdown, JSON, and generated-file representation rules.
 * Owner: quality:standardization
 * Responsibility: Format validation only; it does not decide module ownership or file budgets.
 */

import fs from 'node:fs'
import path from 'node:path'
import {
  canonicalJson,
  fail,
  projectRoot,
  readText,
  resolveProjectPath,
  standardizationConfig,
  walkFiles,
} from './context.mjs'

export function checkTextFormat(file) {
  const buffer = fs.readFileSync(file)
  const text = buffer.toString('utf8')
  if (buffer.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) {
    fail('STD-ENCODING', file, '文本必须为 UTF-8 且不得带 BOM')
  }
  if (buffer.includes(Buffer.from('\r\n'))) {
    fail('STD-LINE-ENDINGS', file, '必须统一使用 LF 换行')
  }
  if (/\t/.test(text)) fail('STD-WHITESPACE', file, '禁止使用制表符')

  const lines = text.split('\n')
  const trailingLine = lines.findIndex((line) => /[ \t]+$/.test(line))
  if (trailingLine >= 0) {
    fail('STD-WHITESPACE', file, `第 ${trailingLine + 1} 行存在行尾空白`)
  }
  if (!text.endsWith('\n') || text.endsWith('\n\n')) {
    fail('STD-FINAL-NEWLINE', file, '文件末尾必须且只能保留一个换行')
  }
}

export function checkMarkdownHeadings(file, requiredSections = null) {
  const headings = readText(file)
    .split('\n')
    .map((line, index) => {
      const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line)
      return match ? { level: match[1].length, title: match[2], line: index + 1 } : null
    })
    .filter(Boolean)

  const h1 = headings.filter((heading) => heading.level === 1)
  if (h1.length !== 1) fail('STD-MARKDOWN-H1', file, `必须有且只有一个一级标题，当前为 ${h1.length} 个`)

  const seen = new Set()
  for (const heading of headings) {
    const key = `${heading.level}:${heading.title}`
    if (seen.has(key)) {
      fail('STD-MARKDOWN-DUPLICATE-HEADING', file, `标题重复：${heading.title}`)
      break
    }
    seen.add(key)
  }

  for (let index = 1; index < headings.length; index += 1) {
    if (headings[index].level > headings[index - 1].level + 1) {
      fail('STD-MARKDOWN-HEADING-LEVEL', file, `第 ${headings[index].line} 行标题层级跳跃`)
      break
    }
  }

  if (requiredSections) {
    const actual = headings.filter((heading) => heading.level === 2).map((heading) => heading.title)
    if (JSON.stringify(actual) !== JSON.stringify(requiredSections)) {
      fail('STD-SKILL-SECTIONS', file, `二级标题必须按固定顺序排列：${requiredSections.join(' -> ')}`)
    }
  }
}

export function parseJsonFile(file) {
  let parsed
  try {
    parsed = JSON.parse(readText(file))
  } catch (error) {
    fail('STD-JSON', file, `JSON 无法解析：${error.message}`)
    return null
  }
  if (readText(file) !== canonicalJson(parsed)) {
    fail('STD-JSON-FORMAT', file, 'JSON 必须使用 2 个空格缩进并以单一换行结束')
  }
  return parsed
}

export function checkManagedJson() {
  for (const relativePath of standardizationConfig.managedJsonFiles) {
    const file = path.join(projectRoot, relativePath)
    if (!fs.existsSync(file)) {
      fail('STD-JSON-FILE', file, '标准化管理 JSON 不存在')
      continue
    }
    const parsed = parseJsonFile(file)
    const fields = standardizationConfig.sortedArrays[relativePath]
    if (!parsed || !fields) continue
    for (const field of fields) {
      if (!Array.isArray(parsed[field])) {
        fail('STD-SORTED-ARRAY', file, `缺少可排序数组：${field}`)
        continue
      }
      const expected = [...parsed[field]].sort((a, b) => String(a).localeCompare(String(b), 'en'))
      if (JSON.stringify(parsed[field]) !== JSON.stringify(expected)) {
        fail('STD-SORTED-ARRAY', file, `${field} 必须按 ASCII 升序排列`)
      }
    }
  }
}

export function checkGeneratedFiles() {
  const pattern = new RegExp(standardizationConfig.generatedFilePattern)
  for (const root of [path.join(projectRoot, 'src'), path.join(projectRoot, 'scripts')]) {
    for (const file of walkFiles(root, ['node_modules', '.next', 'reports'])) {
      if (!pattern.test(path.basename(file))) continue
      const text = readText(file).slice(0, 4096)
      if (!standardizationConfig.generatedMarkers.some((marker) => text.includes(marker))) {
        fail('STD-GENERATED-MARKER', file, '生成文件必须声明自动生成来源并禁止手工编辑')
      }
    }
  }
}

export function checkManagedText() {
  const files = standardizationConfig.managedTextRoots.flatMap((root) => {
    const resolved = resolveProjectPath(root)
    return walkFiles(resolved, ['node_modules', '.next', 'reports'])
  })
  const extensions = new Set(['.md', '.yaml', '.yml', '.json', '.mjs', '.ps1', '.sh', '.ts', '.tsx'])
  for (const file of new Set(files)) {
    if (extensions.has(path.extname(file))) checkTextFormat(file)
  }
}
