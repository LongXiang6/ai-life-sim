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

export function parseChangelogHeader(content, fileName = 'changelog') {
  const version = content.match(/^Version:\s*(\S+)\s*$/m)?.[1]
  const timestamp = content.match(/^Date:\s*(.+?)\s*$/m)?.[1]
  if (!version || !timestamp) throw new Error(`${fileName}: missing Version or Date`)
  return { version, timestamp }
}

export function parseChangelogBullets(content) {
  return content.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim())
}
