#!/usr/bin/env node
// d37-config-override.mjs
// 检测 WorldConfig 构造时丢弃预设世界观名称/描述的代码模式

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, extname } from 'path';

const SRC_DIR = join(import.meta.dirname, '..', '..', '..', '..', 'src');

/** 递归收集指定后缀的文件 */
function collectFiles(dir, exts) {
  const results = [];
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') continue;
      results.push(...collectFiles(full, exts));
    } else if (exts.includes(extname(entry))) {
      results.push(full);
    }
  }
  return results;
}

const files = collectFiles(SRC_DIR, ['.ts', '.tsx']);
let warnings = 0;

for (const file of files) {
  const rel = relative(SRC_DIR, file).replace(/\\/g, '/');
  const content = readFileSync(file, 'utf-8');

  // Pattern A: hardcoded 自定义世界 in object literal
  // 匹配 name: ... '自定义世界' 模式（包括三元表达式中的回退值）
  if (/name:.*自定义世界/.test(content)) {
    console.log(`  [WARN] [D37-CONFIG-OVERRIDE] src/${rel} — Hardcoded '自定义世界' in object literal, may discard preset/custom world name`);
    warnings++;
  }

  // Pattern B: template-generated description
  // 匹配 description: ... 世界观 ... 空间形态 ... 文明阶段 模式
  if (/description:.*世界观.*空间形态.*文明阶段/.test(content)) {
    console.log(`  [WARN] [D37-CONFIG-OVERRIDE] src/${rel} — Template-generated description (世界观/空间形态/文明阶段), may discard preset worldview text`);
    warnings++;
  }
}

console.log(`\n  [D37] Checking WorldConfig preset override... done: ${warnings} warnings`);
process.exit(0);
