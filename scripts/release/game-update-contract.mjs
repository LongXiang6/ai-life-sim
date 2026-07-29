export function parseReleaseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value)
  if (!match) throw new Error(`invalid release version: ${value}`)
  return match.slice(1).map(Number)
}

export function incrementReleaseVersion(value) {
  let [major, minor, revision] = parseReleaseVersion(value)
  revision += 1
  if (revision >= 10) {
    revision = 0
    minor += 1
  }
  if (minor >= 10) {
    minor = 0
    major += 1
  }
  return `${major}.${minor}.${revision}`
}

export function formatShanghaiTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day} ${value.hour}:${value.minute}:${value.second}`
}

export const CHANGELOG_VERSIONS_PER_CHUNK = 10

const INTERNAL_CHANGELOG_TERMS = /\b(?:API|JSON|KVCache|MCP|MOD|Prompt|Provider|Schema|SQL|Store|Token)\b|(?:src|scripts|public|docs)[\\/]|\.(?:cjs|js|json|md|mjs|ts|tsx)\b|内部系统|内部实现|服务端|数据库|缓存(?:命中|策略)?|脚本|路由|提示词|协议(?:字段)?|校验(?:器)?|请求链路|响应结构|架构分层|工程过程|部署|构建产物|测试数量|文件名/iu

export function parseChangelogEntries(content, fileName = 'changelog') {
  const sections = content
    .replace(/\r\n?/gu, '\n')
    .split(/^---\s*$/mu)
    .map((section) => section.trim())
    .filter(Boolean)

  if (sections.length === 0) throw new Error(`${fileName}: no changelog entries`)

  return sections.map((section, index) => {
    const version = section.match(/^Version:\s*(\S+)\s*$/mu)?.[1]
    const timestamp = section.match(/^Date:\s*(.+?)\s*$/mu)?.[1]
    if (!version || !timestamp) throw new Error(`${fileName}#${index + 1}: missing Version or Date`)
    const bullets = section.split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('- '))
      .map((line) => line.slice(2).trim())
    return { version, timestamp, bullets }
  })
}

export function parseChangelogHeader(content, fileName = 'changelog') {
  const [{ version, timestamp }] = parseChangelogEntries(content, fileName)
  return { version, timestamp }
}

export function parseChangelogBullets(content, fileName = 'changelog') {
  return parseChangelogEntries(content, fileName)[0].bullets
}

export function validatePlayerFacingChangelogBullet(value) {
  const summary = value.trim()
  if (INTERNAL_CHANGELOG_TERMS.test(summary)) {
    throw new Error(`summary exposes internal implementation details: ${summary}`)
  }
  return summary
}
