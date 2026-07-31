#!/usr/bin/env node
/**
 * 项目标准化门禁：验证技能、治理文档、机器配置和生成物的共同格式契约。
 * 业务执行顺序由活动权威负责；本门禁只检查可机械判断的结构和表示。
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDir, '../../../../')
const workspaceRoot = path.resolve(projectRoot, '..')
const configPath = path.join(projectRoot, 'scripts', 'check', 'rules', 'standardization.json')
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
const issues = []

function relative(file) {
  return path.relative(workspaceRoot, file).replace(/\\/g, '/') || '.'
}

function fail(rule, file, message) {
  issues.push({ rule, file: relative(file), message })
}

function readText(file) {
  return fs.readFileSync(file, 'utf8')
}

function walkFiles(root) {
  if (!fs.existsSync(root)) return []
  const result = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) result.push(...walkFiles(full))
    else if (entry.isFile()) result.push(full)
  }
  return result
}

function checkTextFormat(file) {
  const buffer = fs.readFileSync(file)
  const text = buffer.toString('utf8')
  if (buffer.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) {
    fail('STD-ENCODING', file, '文本必须为 UTF-8 且不得带 BOM')
  }
  if (buffer.includes(Buffer.from('\r\n'))) {
    fail('STD-LINE-ENDINGS', file, '必须统一使用 LF 换行')
  }
  if (/\t/.test(text)) {
    fail('STD-WHITESPACE', file, '禁止使用制表符')
  }
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    if (/[ \t]+$/.test(lines[i])) {
      fail('STD-WHITESPACE', file, `第 ${i + 1} 行存在行尾空白`)
      break
    }
  }
  if (!text.endsWith('\n')) {
    fail('STD-FINAL-NEWLINE', file, '文件必须以单一换行结束')
  }
  if (text.endsWith('\n\n')) {
    fail('STD-FINAL-NEWLINE', file, '文件末尾只能保留一个换行')
  }
}

function checkMarkdownHeadings(file, requiredSections = null) {
  const headings = readText(file)
    .split('\n')
    .map((line, index) => {
      const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line)
      return match ? { level: match[1].length, title: match[2], line: index + 1 } : null
    })
    .filter(Boolean)

  const h1 = headings.filter((heading) => heading.level === 1)
  if (h1.length !== 1) {
    fail('STD-MARKDOWN-H1', file, `必须有且只有一个一级标题，当前为 ${h1.length} 个`)
  }

  const seen = new Set()
  for (const heading of headings) {
    const key = `${heading.level}:${heading.title}`
    if (seen.has(key)) {
      fail('STD-MARKDOWN-DUPLICATE-HEADING', file, `标题重复：${heading.title}`)
      break
    }
    seen.add(key)
  }

  for (let i = 1; i < headings.length; i += 1) {
    if (headings[i].level > headings[i - 1].level + 1) {
      fail('STD-MARKDOWN-HEADING-LEVEL', file, `第 ${headings[i].line} 行标题层级跳跃`)
      break
    }
  }

  if (requiredSections) {
    const sections = headings.filter((heading) => heading.level === 2).map((heading) => heading.title)
    if (JSON.stringify(sections) !== JSON.stringify(requiredSections)) {
      fail(
        'STD-SKILL-SECTIONS',
        file,
        `二级标题必须按固定顺序排列：${requiredSections.join(' -> ')}`,
      )
    }
  }
}

function checkSkill(skillDir, names) {
  const skillName = path.basename(skillDir)
  if (!new RegExp(config.skillNamePattern).test(skillName)) {
    fail('STD-SKILL-NAME', skillDir, 'Skill 目录必须使用 ASCII 小写 kebab-case')
  }

  const entries = fs.readdirSync(skillDir).sort((a, b) => a.localeCompare(b, 'en'))
  for (const entry of entries) {
    if (!config.skillAllowedEntries.includes(entry)) {
      fail('STD-SKILL-ENTRY', path.join(skillDir, entry), 'Skill 根目录存在未声明的入口')
    }
  }

  for (const required of config.skillRequiredFiles) {
    const file = path.join(skillDir, required)
    if (!fs.existsSync(file)) {
      fail('STD-SKILL-REQUIRED', file, 'Skill 缺少必需文件')
    }
  }

  const skillFile = path.join(skillDir, 'SKILL.md')
  if (fs.existsSync(skillFile)) {
    const text = readText(skillFile)
    const match = /^---\n([\s\S]*?)\n---\n/.exec(text)
    if (!match) {
      fail('STD-SKILL-FRONTMATTER', skillFile, 'frontmatter 必须位于文件开头并使用 LF')
    } else {
      const frontmatter = match[1].split('\n').filter(Boolean)
      const keys = frontmatter.map((line) => line.split(':', 1)[0])
      if (JSON.stringify(keys) !== JSON.stringify(['name', 'description'])) {
        fail('STD-SKILL-FRONTMATTER', skillFile, 'frontmatter 只能按顺序包含 name、description')
      }
      const nameLine = frontmatter.find((line) => line.startsWith('name:')) ?? ''
      const descriptionLine = frontmatter.find((line) => line.startsWith('description:')) ?? ''
      if (nameLine.slice('name:'.length).trim() !== skillName) {
        fail('STD-SKILL-NAME', skillFile, 'frontmatter.name 必须等于 Skill 目录名')
      }
      if (!descriptionLine.slice('description:'.length).trim()) {
        fail('STD-SKILL-DESCRIPTION', skillFile, 'frontmatter.description 不能为空')
      }
    }
    checkMarkdownHeadings(skillFile, config.skillSections)

    const references = [...text.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1])
    for (const target of references) {
      let resolved = null
      if (target.startsWith('references/')) {
        resolved = path.resolve(skillDir, target)
      } else if (target.startsWith('../ai-life-sim/references/')) {
        resolved = path.resolve(skillDir, '..', 'ai-life-sim', target.slice('../ai-life-sim/'.length))
      }
      if (resolved && !fs.existsSync(resolved)) {
        fail('STD-REFERENCE-LINK', skillFile, `引用不存在：${target}`)
      }
    }
  }

  const agentFile = path.join(skillDir, 'agents', 'openai.yaml')
  if (fs.existsSync(agentFile)) {
    const lines = readText(agentFile).split('\n').filter(Boolean)
    const expected = ['interface:', '  display_name:', '  short_description:', '  default_prompt:']
    const actual = lines.map((line) => line.replace(/\s*[^:]+:\s*.*/, (full) => full.split(':')[0] + ':'))
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      fail('STD-SKILL-YAML', agentFile, 'agents/openai.yaml 必须按固定接口键序书写')
    }
    if (lines.some((line) => !/^interface:$/.test(line) && !/^  (display_name|short_description|default_prompt):\s+.+$/.test(line))) {
      fail('STD-SKILL-YAML', agentFile, 'agents/openai.yaml 含未声明字段或空值')
    }
  }

  const referencesDir = path.join(skillDir, 'references')
  if (fs.existsSync(referencesDir)) {
    for (const file of walkFiles(referencesDir)) {
      const name = path.basename(file)
      if (!new RegExp(config.referenceFilePattern).test(name)) {
        fail('STD-REFERENCE-NAME', file, 'reference 文件名必须使用 ASCII 小写 kebab-case.md')
      }
      if (path.extname(file) === '.md') checkMarkdownHeadings(file)
    }
  }

  for (const file of walkFiles(skillDir)) {
    const rel = path.relative(skillDir, file).replace(/\\/g, '/')
    const parts = rel.split('/')
    const name = parts.at(-1)
    if (rel === 'SKILL.md' || rel === 'agents/openai.yaml') continue
    if (parts[0] === 'references') continue
    if (parts[0] === 'scripts' && !/^[a-z0-9]+(?:-[a-z0-9]+)*\.(?:mjs|js|ps1|sh|py|ts|tsx)$/.test(name)) {
      fail('STD-FILE-NAME', file, 'Skill scripts 文件必须使用 ASCII 小写 kebab-case 和明确扩展名')
    }
    if (parts[0] === 'assets' && !/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9-]+)*\.[a-z0-9]+$/.test(name)) {
      fail('STD-FILE-NAME', file, 'Skill assets 文件必须使用稳定 ASCII 文件名')
    }
  }

  names.push(skillName)
}

function parseJsonFile(file) {
  let parsed
  try {
    parsed = JSON.parse(readText(file))
  } catch (error) {
    fail('STD-JSON', file, `JSON 无法解析：${error.message}`)
    return null
  }
  const canonical = `${JSON.stringify(parsed, null, 2)}\n`
  if (readText(file) !== canonical) {
    fail('STD-JSON-FORMAT', file, 'JSON 必须使用 2 个空格缩进并以单一换行结束')
  }
  return parsed
}

function checkSortedArrays(file, parsed, fields) {
  for (const field of fields) {
    if (!Array.isArray(parsed?.[field])) {
      fail('STD-SORTED-ARRAY', file, `缺少可排序数组：${field}`)
      continue
    }
    const expected = [...parsed[field]].sort((a, b) => String(a).localeCompare(String(b), 'en'))
    if (JSON.stringify(parsed[field]) !== JSON.stringify(expected)) {
      fail('STD-SORTED-ARRAY', file, `${field} 必须按 ASCII 升序排列`)
    }
  }
}

function checkGeneratedFiles() {
  const pattern = new RegExp(config.generatedFilePattern)
  for (const root of [path.join(projectRoot, 'src'), path.join(projectRoot, 'scripts')]) {
    for (const file of walkFiles(root)) {
      if (!pattern.test(path.basename(file))) continue
      const text = readText(file).slice(0, 4096)
      if (!config.generatedMarkers.some((marker) => text.includes(marker))) {
        fail('STD-GENERATED-MARKER', file, '生成文件必须声明自动生成来源并禁止手工编辑')
      }
    }
  }
}

function checkManagedText() {
  const roots = [
    path.join(workspaceRoot, 'AGENTS.md'),
    path.join(workspaceRoot, '.agents', 'README.md'),
    path.join(workspaceRoot, '.agents', 'task-trace.md'),
    path.join(workspaceRoot, '.agents', 'skills'),
    path.join(projectRoot, 'docs', 'authority'),
    path.join(projectRoot, 'scripts', 'check', 'domains', 'standardization'),
    configPath,
  ]
  const files = roots.flatMap((root) => (fs.existsSync(root) ? (fs.statSync(root).isFile() ? [root] : walkFiles(root)) : []))
  const textExtensions = new Set(['.md', '.yaml', '.yml', '.json', '.mjs', '.ps1', '.sh', '.ts', '.tsx'])
  for (const file of files) {
    if (textExtensions.has(path.extname(file))) checkTextFormat(file)
  }
}

function main() {
  checkManagedText()

  const skillRoot = path.resolve(projectRoot, config.skillRoot)
  const skillNames = []
  if (!fs.existsSync(skillRoot)) {
    fail('STD-SKILL-ROOT', skillRoot, '项目 Skill 根目录不存在')
  } else {
    const skillDirs = fs.readdirSync(skillRoot)
      .map((name) => path.join(skillRoot, name))
      .filter((dir) => fs.statSync(dir).isDirectory())
      .sort((a, b) => path.basename(a).localeCompare(path.basename(b), 'en'))
    for (const dir of skillDirs) checkSkill(dir, skillNames)
  }

  if (new Set(skillNames).size !== skillNames.length) {
    fail('STD-SKILL-UNIQUE', skillRoot, 'Skill name 必须全局唯一')
  }

  for (const relativePath of config.managedJsonFiles) {
    const file = path.join(projectRoot, relativePath)
    if (!fs.existsSync(file)) {
      fail('STD-JSON-FILE', file, '标准化管理 JSON 不存在')
      continue
    }
    const parsed = parseJsonFile(file)
    const sortedFields = config.sortedArrays[relativePath]
    if (parsed && sortedFields) checkSortedArrays(file, parsed, sortedFields)
  }

  checkGeneratedFiles()

  if (issues.length > 0) {
    for (const issue of issues) {
      console.error(`[FAIL] [${issue.rule}] ${issue.file} — ${issue.message}`)
    }
    console.error(`[standardization] FAIL — ${issues.length} issue(s)`)
    process.exitCode = 1
    return
  }

  console.log('[standardization] PASS — skills, governance text, JSON, generated markers and stable ordering conform')
}

main()
