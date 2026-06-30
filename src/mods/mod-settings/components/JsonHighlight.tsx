/**
 * @module JsonHighlight
 * @description JSON 语法高亮渲染器 —— VS Code 风格彩色显示
 *   键名、字符串、数字、布尔值、null、括号分别着色
 * @mod mod-settings
 *
 * @param json - JSON 字符串
 */

import styles from './JsonHighlight.module.css'

interface JsonHighlightProps {
  json: string
}

/** JSON token 类型 */
type TokenType =
  | 'key'
  | 'string'
  | 'number'
  | 'boolean'
  | 'null'
  | 'bracket'
  | 'colon'
  | 'comma'

interface Token {
  type: TokenType
  value: string
}

/**
 * 将 JSON 字符串解析为带类型的 token 序列
 */
function tokenize(json: string): Token[] {
  const tokens: Token[] = []
  let i = 0

  while (i < json.length) {
    // 字符串（键或值）
    if (json[i] === '"') {
      const start = i
      i++
      while (i < json.length && json[i] !== '"') {
        if (json[i] === '\\') i++ // 跳过转义字符
        i++
      }
      i++ // 跳过闭合引号
      const raw = json.slice(start, i)

      // 判断是键还是值：看后面是否紧跟 :
      const after = json.slice(i).trimStart()
      const isKey = after.startsWith(':')
      tokens.push({ type: isKey ? 'key' : 'string', value: raw })
      continue
    }

    // 数字
    if (/[-\d]/.test(json[i])) {
      const match = json.slice(i).match(/^-?\d+(\.\d+)?([eE][+-]?\d+)?/)
      if (match) {
        tokens.push({ type: 'number', value: match[0] })
        i += match[0].length
        continue
      }
    }

    // true / false
    if (json.startsWith('true', i)) {
      tokens.push({ type: 'boolean', value: 'true' })
      i += 4
      continue
    }
    if (json.startsWith('false', i)) {
      tokens.push({ type: 'boolean', value: 'false' })
      i += 5
      continue
    }

    // null
    if (json.startsWith('null', i)) {
      tokens.push({ type: 'null', value: 'null' })
      i += 4
      continue
    }

    // 括号
    if ('{}[]'.includes(json[i])) {
      tokens.push({ type: 'bracket', value: json[i] })
      i++
      continue
    }

    // 冒号
    if (json[i] === ':') {
      tokens.push({ type: 'colon', value: ':' })
      i++
      continue
    }

    // 逗号
    if (json[i] === ',') {
      tokens.push({ type: 'comma', value: ',' })
      i++
      continue
    }

    // 其他（空白字符）
    tokens.push({ type: 'comma', value: json[i] })
    i++
  }

  return tokens
}

/** CSS 类名映射 */
const TOKEN_CLASS: Record<TokenType, string> = {
  key: styles.tkKey,
  string: styles.tkString,
  number: styles.tkNumber,
  boolean: styles.tkBool,
  null: styles.tkNull,
  bracket: styles.tkBracket,
  colon: styles.tkColon,
  comma: styles.tkComma,
}

export function JsonHighlight({ json }: JsonHighlightProps) {
  const tokens = tokenize(json)

  return (
    <code className={styles.code}>
      {tokens.map((t, i) => (
        <span key={i} className={TOKEN_CLASS[t.type]}>{t.value}</span>
      ))}
    </code>
  )
}
