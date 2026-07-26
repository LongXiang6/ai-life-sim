#!/usr/bin/env node

import { execFile } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

import Database from 'better-sqlite3'

const execFileAsync = promisify(execFile)
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000
const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 4317
const CACHE_MS = 30_000
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const analyzerPath = path.join(scriptDirectory, 'analyze-ai-logs.mjs')

function parseArgs(argv) {
  const options = {
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
    logRoot: process.env.AI_LOG_DB_PATH || process.env.AI_LOG_DIR || '/var/lib/ai-life-sim/logs.sqlite',
    accountDatabase: process.env.ACCOUNT_DB_PATH || '/var/lib/ai-life-sim/accounts.sqlite',
    playerContentDatabase: process.env.PLAYER_CONTENT_DB_PATH || '/var/lib/ai-life-sim/player-content.sqlite',
  }
  for (let index = 0; index < argv.length; index += 1) {
    const next = () => {
      const value = argv[++index]
      if (!value) throw new Error(`${argv[index - 1]} 缺少参数`)
      return value
    }
    if (argv[index] === '--host') options.host = next()
    else if (argv[index] === '--port') options.port = Number(next())
    else if (argv[index] === '--log-root') options.logRoot = next()
    else if (argv[index] === '--account-database') options.accountDatabase = next()
    else if (argv[index] === '--player-content-database') options.playerContentDatabase = next()
    else if (argv[index] === '--help' || argv[index] === '-h') {
      console.log('Usage: operations-dashboard.mjs [--host 127.0.0.1] [--port 4317] [--log-root <path>] [--account-database <path>] [--player-content-database <path>]')
      process.exit(0)
    } else throw new Error(`未知参数：${argv[index]}`)
  }
  if (!['127.0.0.1', '::1', 'localhost'].includes(options.host)) {
    throw new Error('运营面板只允许监听本机回环地址')
  }
  if (!Number.isSafeInteger(options.port) || options.port < 1 || options.port > 65535) {
    throw new Error('--port 必须是有效端口')
  }
  return {
    ...options,
    logRoot: path.resolve(options.logRoot),
    accountDatabase: path.resolve(options.accountDatabase),
    playerContentDatabase: path.resolve(options.playerContentDatabase),
  }
}

function shanghaiDayStart(now) {
  const local = new Date(now + SHANGHAI_OFFSET_MS)
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - SHANGHAI_OFFSET_MS
}

function count(database, sql, ...params) {
  return Number(database.prepare(sql).get(...params)?.count ?? 0)
}

function readAccountStats(databasePath, now) {
  if (!fs.existsSync(databasePath)) return { available: false, registered: 0, registeredToday: 0, activeToday: 0, activeLast24Hours: 0, activeSessions: 0 }
  const database = new Database(databasePath, { readonly: true, fileMustExist: true })
  try {
    const today = shanghaiDayStart(now)
    return {
      available: true,
      registered: count(database, 'SELECT COUNT(*) AS count FROM accounts'),
      registeredToday: count(database, 'SELECT COUNT(*) AS count FROM accounts WHERE created_at >= ? AND created_at < ?', today, now),
      activeToday: count(database, 'SELECT COUNT(*) AS count FROM accounts WHERE last_active_at >= ? AND last_active_at < ?', today, now),
      activeLast24Hours: count(database, 'SELECT COUNT(*) AS count FROM accounts WHERE last_active_at >= ? AND last_active_at < ?', now - 24 * 60 * 60 * 1000, now),
      activeSessions: count(database, 'SELECT COUNT(DISTINCT account_id) AS count FROM account_sessions WHERE expires_at > ?', now),
    }
  } finally {
    database.close()
  }
}

function readContentStats(databasePath) {
  if (!fs.existsSync(databasePath)) return { available: false, cloudSaves: 0, leaderboardAccounts: 0, pendingPortraits: 0, deliveredMail: 0 }
  const database = new Database(databasePath, { readonly: true, fileMustExist: true })
  try {
    return {
      available: true,
      cloudSaves: count(database, 'SELECT COUNT(*) AS count FROM cloud_manual_saves'),
      leaderboardAccounts: count(database, 'SELECT COUNT(*) AS count FROM leaderboard_best_runs'),
      pendingPortraits: count(database, "SELECT COUNT(*) AS count FROM portrait_mail_jobs WHERE status IN ('awaiting_brief', 'processing')"),
      deliveredMail: count(database, 'SELECT COUNT(*) AS count FROM player_mail_messages'),
    }
  } finally {
    database.close()
  }
}

function emptyTraffic() {
  return {
    available: false,
    estimatedPlayers: 0,
    aiRequests: 0,
    failures: 0,
    hourly: Array.from({ length: 24 }, (_, hour) => ({ hour, requests: 0, failures: 0, estimatedPlayers: 0 })),
    storyRepetition: {
      observedGames: 0,
      observedRounds: 0,
      comparedRounds: 0,
      averageWordRepeatRate: 0,
      recentAverageWordRepeatRate: 0,
      peakWordRepeatRate: 0,
      highRepeatRounds: 0,
      highRepeatRatio: 0,
      risingGames: 0,
    },
  }
}

async function readTrafficStats(logRoot, now) {
  if (!fs.existsSync(logRoot)) return emptyTraffic()
  const from = new Date(shanghaiDayStart(now)).toISOString()
  const to = new Date(now).toISOString()
  const { stdout } = await execFileAsync(process.execPath, [
    analyzerPath,
    '--root', logRoot,
    '--from', from,
    '--to', to,
    '--bucket-minutes', '60',
    '--top', '10',
  ], { encoding: 'utf8', maxBuffer: 12 * 1024 * 1024 })
  const report = JSON.parse(stdout)
  const overall = report.overall
  const repetition = overall.storyRepetition ?? {}
  return {
    available: true,
    estimatedPlayers: Number(overall.traffic?.estimatedActivePlayers ?? 0),
    aiRequests: Number(overall.traffic?.requests ?? 0),
    failures: Number(overall.traffic?.failed ?? 0),
    hourly: overall.localHourDistribution ?? emptyTraffic().hourly,
    storyRepetition: {
      observedGames: Number(repetition.observedGames ?? 0),
      observedRounds: Number(repetition.observedRounds ?? 0),
      comparedRounds: Number(repetition.comparedRounds ?? 0),
      averageWordRepeatRate: Number(repetition.averageWordRepeatRate ?? 0),
      recentAverageWordRepeatRate: Number(repetition.recentAverageWordRepeatRate ?? 0),
      peakWordRepeatRate: Number(repetition.peakWordRepeatRate ?? 0),
      highRepeatRounds: Number(repetition.highRepeatRounds ?? 0),
      highRepeatRatio: Number(repetition.highRepeatRatio ?? 0),
      risingGames: Number(repetition.risingGames ?? 0),
    },
  }
}

export async function buildDashboardSnapshot(options, now = Date.now()) {
  const [traffic, accounts, content] = await Promise.all([
    readTrafficStats(options.logRoot, now),
    Promise.resolve(readAccountStats(options.accountDatabase, now)),
    Promise.resolve(readContentStats(options.playerContentDatabase)),
  ])
  return {
    schemaVersion: 1,
    generatedAt: new Date(now).toISOString(),
    timeZone: 'Asia/Shanghai',
    traffic,
    accounts,
    content,
  }
}

const dashboardHtml = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI Life Sim 运营面板</title><link rel="stylesheet" href="/styles.css"></head>
<body><header><div><p>AI LIFE SIM / OPERATIONS</p><h1>运营统计</h1></div><div class="status"><span id="status-dot"></span><strong id="status">读取中</strong><small id="updated">--</small></div></header>
<main><section class="metrics" aria-label="今日概览">
<article><small>今日 AI 请求玩家</small><strong id="players">0</strong><span>请求来源</span></article>
<article><small>今日 AI 请求</small><strong id="calls">0</strong><span>模型调用</span></article>
<article><small>今日 AI 失败</small><strong id="failures">0</strong><span>异常响应</span></article>
<article><small>总注册玩家</small><strong id="registered">0</strong><span id="registered-today">今日 +0</span></article>
<article><small>今日登录活跃</small><strong id="active">0</strong><span>已认证活动</span></article>
<article><small>云端手动存档</small><strong id="cloud">0</strong><span>独立栏位</span></article>
</section>
<section class="grid"><article class="panel"><div class="panel-head"><div><small>今日分时</small><h2>AI 请求与失败</h2></div><span>北京时间</span></div><canvas id="hourly" aria-label="今日分时 AI 请求图"></canvas><div class="legend"><span><i class="requests"></i>AI 请求</span><span><i class="failures"></i>失败</span></div></article>
  <article class="panel"><div class="panel-head"><div><small>功能状态</small><h2>账号与内容</h2></div><span>当前值</span></div><dl><div><dt>近 24 小时登录活跃</dt><dd id="active24">0</dd></div><div><dt>有效会话账号</dt><dd id="sessions">0</dd></div><div><dt>排行榜合格账号</dt><dd id="leaderboard">0</dd></div><div><dt>已投递站内邮件</dt><dd id="mail">0</dd></div><div><dt>画像待处理</dt><dd id="portraits">0</dd></div></dl></article>
  <article class="panel"><div class="panel-head"><div><small>故事质量</small><h2>叙事重复率</h2></div><span>质量指标</span></div><dl><div><dt>观察局数 / 轮数</dt><dd><span id="repeat-games">0</span> / <span id="repeat-observed">0</span></dd></div><div><dt>可比轮数</dt><dd id="repeat-compared">0</dd></div><div><dt>平均 / 近五轮平均</dt><dd><span id="repeat-average">0%</span> / <span id="repeat-recent">0%</span></dd></div><div><dt>重复率峰值</dt><dd id="repeat-max">0%</dd></div><div><dt>高重复轮 / 占比</dt><dd><span id="repeat-high">0</span> / <span id="repeat-high-ratio">0%</span></dd></div><div><dt>重复率上升局数</dt><dd id="repeat-rising">0</dd></div></dl></article></section></main>
<script src="/app.js" defer></script></body></html>`

const dashboardCss = `:root{color-scheme:light;--ink:#182027;--muted:#66717a;--line:#dfe4e7;--paper:#f5f7f6;--white:#fff;--blue:#526f86;--green:#4e7860;--warm:#a16d43}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:Inter,"PingFang SC","Microsoft YaHei UI",sans-serif}header{display:flex;align-items:end;justify-content:space-between;gap:2rem;padding:1.5rem clamp(1rem,4vw,3rem);border-bottom:1px solid var(--line);background:var(--white)}header p,.panel-head small{margin:0;color:var(--muted);font-size:.68rem;font-weight:700}h1{margin:.25rem 0 0;font-size:1.55rem;letter-spacing:0}.status{display:grid;grid-template-columns:auto auto;align-items:center;gap:.2rem .45rem;text-align:right}.status span{width:.55rem;height:.55rem;border-radius:50%;background:var(--warm)}.status span.ready{background:var(--green)}.status strong{font-size:.75rem}.status small{grid-column:1/-1;color:var(--muted);font-size:.65rem}main{width:min(100%,90rem);margin:auto;padding:1.25rem clamp(1rem,4vw,3rem) 3rem}.metrics{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));border:1px solid var(--line);background:var(--white)}.metrics article{display:grid;min-width:0;gap:.25rem;padding:1rem;border-right:1px solid var(--line)}.metrics article:last-child{border-right:0}.metrics small,.metrics span{color:var(--muted);font-size:.67rem}.metrics strong{font-size:1.8rem;letter-spacing:0}.grid{display:grid;grid-template-columns:minmax(0,2fr) minmax(17rem,1fr);gap:1rem;margin-top:1rem}.panel{min-width:0;padding:1rem;border:1px solid var(--line);border-radius:6px;background:var(--white)}.panel-head{display:flex;align-items:start;justify-content:space-between;gap:1rem;margin-bottom:1rem}.panel-head h2{margin:.2rem 0 0;font-size:1rem;letter-spacing:0}.panel-head>span{color:var(--muted);font-size:.65rem}canvas{display:block;width:100%;height:18rem}.legend{display:flex;gap:1rem;color:var(--muted);font-size:.68rem}.legend i{display:inline-block;width:.65rem;height:.65rem;margin-right:.35rem;border-radius:2px;background:var(--blue)}.legend i.failures{background:var(--warm)}dl{margin:0}dl div{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.7rem 0;border-top:1px solid var(--line)}dt{color:var(--muted);font-size:.72rem}dd{margin:0;font-size:.78rem;font-weight:750}@media(max-width:900px){.metrics{grid-template-columns:repeat(3,minmax(0,1fr))}.metrics article:nth-child(3){border-right:0}.metrics article:nth-child(-n+3){border-bottom:1px solid var(--line)}.grid{grid-template-columns:1fr}}@media(max-width:540px){header{align-items:start}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.metrics article:nth-child(3){border-right:1px solid var(--line)}.metrics article:nth-child(2n){border-right:0}.metrics article:nth-child(-n+4){border-bottom:1px solid var(--line)}canvas{height:14rem}}`

const dashboardJs = `const byId=(id)=>document.getElementById(id);const number=(value)=>new Intl.NumberFormat('zh-CN').format(value||0);const percent=(value)=>(Number(value||0)*100).toFixed(1)+'%';function setText(id,value){byId(id).textContent=value}function drawHourly(rows){const canvas=byId('hourly');const ratio=window.devicePixelRatio||1;const rect=canvas.getBoundingClientRect();canvas.width=Math.max(1,Math.floor(rect.width*ratio));canvas.height=Math.max(1,Math.floor(rect.height*ratio));const ctx=canvas.getContext('2d');ctx.scale(ratio,ratio);const width=rect.width,height=rect.height,pad={top:12,right:8,bottom:28,left:32};const chartW=width-pad.left-pad.right,chartH=height-pad.top-pad.bottom;const max=Math.max(1,...rows.flatMap(row=>[row.requests,row.failures]));ctx.strokeStyle='#dfe4e7';ctx.lineWidth=1;for(let i=0;i<=4;i++){const y=pad.top+chartH*i/4;ctx.beginPath();ctx.moveTo(pad.left,y);ctx.lineTo(width-pad.right,y);ctx.stroke()}const group=chartW/24,bar=Math.max(2,group*.28);rows.forEach((row,index)=>{const x=pad.left+group*index+group*.18;const requestH=chartH*row.requests/max;const failureH=chartH*row.failures/max;ctx.fillStyle='#526f86';ctx.fillRect(x,pad.top+chartH-requestH,bar,requestH);ctx.fillStyle='#a16d43';ctx.fillRect(x+bar+1,pad.top+chartH-failureH,bar,failureH);if(index%3===0){ctx.fillStyle='#66717a';ctx.font='10px sans-serif';ctx.textAlign='center';ctx.fillText(String(row.hour).padStart(2,'0'),x+bar,pad.top+chartH+17)}})}function render(data){const repetition=data.traffic.storyRepetition||{};setText('players',number(data.traffic.estimatedPlayers));setText('calls',number(data.traffic.aiRequests));setText('failures',number(data.traffic.failures));setText('registered',number(data.accounts.registered));setText('registered-today','今日 +'+number(data.accounts.registeredToday));setText('active',number(data.accounts.activeToday));setText('cloud',number(data.content.cloudSaves));setText('portraits',number(data.content.pendingPortraits));setText('active24',number(data.accounts.activeLast24Hours));setText('sessions',number(data.accounts.activeSessions));setText('leaderboard',number(data.content.leaderboardAccounts));setText('mail',number(data.content.deliveredMail));setText('repeat-games',number(repetition.observedGames));setText('repeat-observed',number(repetition.observedRounds));setText('repeat-compared',number(repetition.comparedRounds));setText('repeat-average',percent(repetition.averageWordRepeatRate));setText('repeat-recent',percent(repetition.recentAverageWordRepeatRate));setText('repeat-max',percent(repetition.peakWordRepeatRate));setText('repeat-high',number(repetition.highRepeatRounds));setText('repeat-high-ratio',percent(repetition.highRepeatRatio));setText('repeat-rising',number(repetition.risingGames));setText('updated',new Date(data.generatedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}));drawHourly(data.traffic.hourly);byId('status-dot').classList.add('ready');setText('status','已连接')}async function load(){try{const response=await fetch('/api/stats',{cache:'no-store'});if(!response.ok)throw new Error();render(await response.json())}catch{byId('status-dot').classList.remove('ready');setText('status','读取失败')}}window.addEventListener('resize',()=>load());load();setInterval(load,60000);`

function send(response, status, type, body) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    'Content-Type': `${type}; charset=utf-8`,
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(body)
}

export function createOperationsDashboardServer(options) {
  let cached = null
  let cachedAt = 0
  return http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://localhost')
    if (request.method !== 'GET') return send(response, 405, 'text/plain', 'Method Not Allowed')
    if (url.pathname === '/') return send(response, 200, 'text/html', dashboardHtml)
    if (url.pathname === '/favicon.ico') {
      response.writeHead(204, { 'Cache-Control': 'public, max-age=86400' })
      return response.end()
    }
    if (url.pathname === '/styles.css') return send(response, 200, 'text/css', dashboardCss)
    if (url.pathname === '/app.js') return send(response, 200, 'text/javascript', dashboardJs)
    if (url.pathname === '/api/stats') {
      try {
        if (!cached || Date.now() - cachedAt > CACHE_MS) {
          cached = await buildDashboardSnapshot(options)
          cachedAt = Date.now()
        }
        return send(response, 200, 'application/json', JSON.stringify(cached))
      } catch (error) {
        console.error('[operations-dashboard] 聚合读取失败:', error instanceof Error ? error.message : 'unknown')
        return send(response, 503, 'application/json', JSON.stringify({ error: '统计数据暂时不可用' }))
      }
    }
    return send(response, 404, 'text/plain', 'Not Found')
  })
}

export function isDirectExecution(argvEntry, moduleUrl = import.meta.url) {
  if (!argvEntry) return false
  try {
    return fs.realpathSync(path.resolve(argvEntry)) === fs.realpathSync(fileURLToPath(moduleUrl))
  } catch {
    return false
  }
}

const isMain = isDirectExecution(process.argv[1])
if (isMain) {
  const options = parseArgs(process.argv.slice(2))
  const server = createOperationsDashboardServer(options)
  server.listen(options.port, options.host, () => {
    console.log(`[operations-dashboard] http://${options.host}:${options.port}`)
  })
}
