/**
 * Purpose: Validate global and project Skill directory contracts without loading unrelated references.
 * Owner: quality:standardization
 * Responsibility: Skill structure, frontmatter, compact entry budget, YAML interface, names, and links.
 */

import fs from 'node:fs'
import path from 'node:path'
import {
  fail,
  readText,
  resolveProjectPath,
  standardizationConfig,
  walkFiles,
} from './context.mjs'
import { checkMarkdownHeadings } from './format-checks.mjs'

function lineCount(text) {
  if (!text) return 0
  return text.split('\n').length - (text.endsWith('\n') ? 1 : 0)
}

function checkSkill(skillDir, scope, names) {
  const skillName = path.basename(skillDir)
  if (!new RegExp(standardizationConfig.skillNamePattern).test(skillName)) {
    fail('STD-SKILL-NAME', skillDir, 'Skill 目录必须使用 ASCII 小写 kebab-case')
  }

  for (const entry of fs.readdirSync(skillDir).sort((a, b) => a.localeCompare(b, 'en'))) {
    if (!standardizationConfig.skillAllowedEntries.includes(entry)) {
      fail('STD-SKILL-ENTRY', path.join(skillDir, entry), 'Skill 根目录存在未声明入口')
    }
  }
  for (const required of standardizationConfig.skillRequiredFiles) {
    const file = path.join(skillDir, required)
    if (!fs.existsSync(file)) fail('STD-SKILL-REQUIRED', file, 'Skill 缺少必需文件')
  }

  const skillFile = path.join(skillDir, 'SKILL.md')
  if (fs.existsSync(skillFile)) {
    const text = readText(skillFile)
    const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(text)
    if (!frontmatter) {
      fail('STD-SKILL-FRONTMATTER', skillFile, 'frontmatter 必须位于文件开头并使用 LF')
    } else {
      const lines = frontmatter[1].split('\n').filter(Boolean)
      const keys = lines.map((line) => line.split(':', 1)[0])
      if (JSON.stringify(keys) !== JSON.stringify(['name', 'description'])) {
        fail('STD-SKILL-FRONTMATTER', skillFile, 'frontmatter 只能按顺序包含 name、description')
      }
      const name = lines.find((line) => line.startsWith('name:'))?.slice(5).trim()
      const description = lines.find((line) => line.startsWith('description:'))?.slice(12).trim()
      if (name !== skillName) fail('STD-SKILL-NAME', skillFile, 'frontmatter.name 必须等于 Skill 目录名')
      if (!description) fail('STD-SKILL-DESCRIPTION', skillFile, 'frontmatter.description 不能为空')
    }
    const requiredSections = scope === 'project' ? standardizationConfig.projectSkillSections : null
    checkMarkdownHeadings(skillFile, requiredSections)
    if (lineCount(text) > standardizationConfig.skillPreferredLineBudget) {
      fail('STD-SKILL-BUDGET', skillFile, `Skill 入口优先不超过 ${standardizationConfig.skillPreferredLineBudget} 行`)
    }
    checkReferenceLinks(skillDir, skillFile, text)
  }

  checkAgentYaml(skillDir)
  checkResourceNames(skillDir)
  names.push(`${scope}:${skillName}`)
}

function checkReferenceLinks(skillDir, skillFile, text) {
  const targets = [...text.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1])
  for (const target of targets) {
    let resolved = null
    if (target.startsWith('references/')) resolved = path.resolve(skillDir, target)
    if (target.startsWith('../ai-life-sim/references/')) {
      resolved = path.resolve(skillDir, '..', 'ai-life-sim', target.slice('../ai-life-sim/'.length))
    }
    if (resolved && !fs.existsSync(resolved)) {
      fail('STD-REFERENCE-LINK', skillFile, `引用不存在：${target}`)
    }
  }
}

function checkAgentYaml(skillDir) {
  const file = path.join(skillDir, 'agents', 'openai.yaml')
  if (!fs.existsSync(file)) return
  const lines = readText(file).split('\n').filter(Boolean)
  const actual = lines.map((line) => line.replace(/\s*[^:]+:\s*.*/, (full) => `${full.split(':')[0]}:`))
  const expected = ['interface:', '  display_name:', '  short_description:', '  default_prompt:']
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail('STD-SKILL-YAML', file, 'agents/openai.yaml 必须按固定接口键序书写')
  }
  if (lines.some((line) => !/^interface:$/.test(line) && !/^  (display_name|short_description|default_prompt):\s+.+$/.test(line))) {
    fail('STD-SKILL-YAML', file, 'agents/openai.yaml 含未声明字段或空值')
  }
}

function checkResourceNames(skillDir) {
  const referencePattern = new RegExp(standardizationConfig.referenceFilePattern)
  for (const file of walkFiles(skillDir)) {
    const relative = path.relative(skillDir, file).replace(/\\/g, '/')
    const [section] = relative.split('/')
    const name = path.basename(file)
    if (section === 'references') {
      if (!referencePattern.test(name)) fail('STD-REFERENCE-NAME', file, 'reference 文件名必须使用 kebab-case.md')
      if (path.extname(file) === '.md') checkMarkdownHeadings(file)
    }
    if (section === 'scripts' && !/^[a-z0-9]+(?:-[a-z0-9]+)*\.(?:mjs|js|ps1|sh|py|ts|tsx)$/.test(name)) {
      fail('STD-FILE-NAME', file, 'Skill scripts 文件必须使用 ASCII 小写 kebab-case')
    }
  }
}

export function checkSkills() {
  const names = []
  for (const rootConfig of standardizationConfig.skillRoots) {
    const root = resolveProjectPath(rootConfig.path)
    if (!fs.existsSync(root)) {
      if (rootConfig.required) fail('STD-SKILL-ROOT', root, `${rootConfig.scope} Skill 根目录不存在`)
      continue
    }
    const directories = fs.readdirSync(root)
      .map((name) => path.join(root, name))
      .filter((candidate) => fs.statSync(candidate).isDirectory())
      .sort((left, right) => path.basename(left).localeCompare(path.basename(right), 'en'))
    for (const directory of directories) checkSkill(directory, rootConfig.scope, names)
  }
  if (new Set(names).size !== names.length) {
    fail('STD-SKILL-UNIQUE', resolveProjectPath('.agents/skills'), '同一作用域内 Skill name 必须唯一')
  }
}
