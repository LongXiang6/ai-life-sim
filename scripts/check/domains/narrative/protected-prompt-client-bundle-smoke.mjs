#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { getProjectRoot } from '../../lib/project-root.mjs'

const root = getProjectRoot(import.meta.url)
const staticRoot = path.join(root, '.next', 'static', 'chunks')
if (!fs.existsSync(staticRoot)) {
  console.error('FAIL: .next/static/chunks 不存在，请先运行 npm run build')
  process.exit(1)
}

function collectFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) collectFiles(full, out)
    else if (entry.isFile() && /\.(?:js|map)$/u.test(entry.name)) out.push(full)
  }
  return out
}

const bundleText = collectFiles(staticRoot)
  .map((file) => fs.readFileSync(file, 'utf8'))
  .join('\n')

for (const forbidden of [
  '受世界事实与模拟规则约束的世界叙事演算者',
  '获得新能力、资源或地位不会自动触发官方或机构审查',
  '你撞开仓房木门，把林舟的铜扣递给阿禾',
  '提示词预览',
]) {
  if (bundleText.includes(forbidden)) {
    console.error(`FAIL: 客户端生产 bundle 泄露受保护内容: ${forbidden}`)
    process.exit(1)
  }
}

console.log('PASS: protected-prompt-client-bundle-smoke')
