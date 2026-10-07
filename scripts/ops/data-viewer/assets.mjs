/**
 * Purpose: Own the embedded HTML, CSS, and browser JavaScript served by the local data viewer.
 * Owner: operations
 * Responsibility: Static viewer assets only; server routing and data queries are separate modules.
 */

export const viewerHtml = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI Life Sim 数据查看器</title><link rel="stylesheet" href="/styles.css"></head>
<body><header><div><p>AI LIFE SIM / DATA</p><h1>数据查看器</h1></div><div class="live"><i></i><span>本机只读</span><small id="updated">尚未读取</small></div></header>
<div class="shell"><nav aria-label="数据视图"><button class="active" data-view="overview">总览</button><button data-view="calls">AI 调用</button><button data-view="diagnostics">系统诊断</button><button data-view="memory">压缩记忆</button><button data-view="users">用户关联</button><button data-view="schema">数据库结构</button><button data-view="query">只读查询</button></nav><main id="main" aria-live="polite"></main></div>
<script src="/app.js" defer></script></body></html>`

export const viewerCss = `:root{color-scheme:light;--paper:#f3f5f4;--surface:#fff;--ink:#1b2226;--muted:#68737a;--line:#d9dfe1;--accent:#496a7c;--green:#4f735f;--danger:#9a4b45}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:Inter,"PingFang SC","Microsoft YaHei UI",sans-serif}button,input,select{font:inherit}header{height:76px;display:flex;align-items:center;justify-content:space-between;padding:0 28px;border-bottom:1px solid var(--line);background:var(--surface)}header p{margin:0;color:var(--muted);font-size:10px;font-weight:700}h1{margin:4px 0 0;font-size:22px;letter-spacing:0}.live{display:grid;grid-template-columns:auto auto;align-items:center;gap:3px 7px;text-align:right;font-size:12px}.live i{width:7px;height:7px;border-radius:50%;background:var(--green)}.live small{grid-column:1/-1;color:var(--muted)}.shell{display:grid;grid-template-columns:190px minmax(0,1fr);min-height:calc(100vh - 76px)}nav{padding:18px 14px;border-right:1px solid var(--line);background:var(--surface)}nav button{display:block;width:100%;padding:10px 12px;border:0;border-left:2px solid transparent;background:transparent;color:var(--muted);text-align:left;cursor:pointer}nav button:hover{color:var(--ink);background:var(--paper)}nav button.active{border-left-color:var(--accent);color:var(--ink);font-weight:700}main{min-width:0;padding:24px clamp(16px,3vw,40px) 48px}.view-head{display:flex;align-items:end;justify-content:space-between;gap:16px;margin-bottom:18px}.view-head h2{margin:0;font-size:20px}.view-head p{margin:5px 0 0;color:var(--muted);font-size:12px}.toolbar{display:flex;flex-wrap:wrap;gap:8px}.toolbar input,.toolbar select{min-height:36px;padding:0 10px;border:1px solid var(--line);border-radius:4px;background:var(--surface);color:var(--ink)}.toolbar input{width:min(360px,60vw)}button.command{min-height:36px;padding:0 14px;border:1px solid var(--accent);border-radius:4px;background:var(--accent);color:#fff;cursor:pointer}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border:1px solid var(--line);background:var(--surface)}.metric{min-width:0;padding:16px;border-right:1px solid var(--line)}.metric:nth-child(4n){border-right:0}.metric span,.metric small{display:block;color:var(--muted);font-size:11px}.metric strong{display:block;margin:6px 0;font-size:26px;letter-spacing:0}.panel{margin-top:14px;border:1px solid var(--line);border-radius:6px;background:var(--surface)}.panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-bottom:1px solid var(--line)}.panel-head h3{margin:0;font-size:14px}.panel-head span,.muted{color:var(--muted);font-size:11px}.rows{display:grid}.row{border-bottom:1px solid var(--line)}.row:last-child{border-bottom:0}.row summary{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;padding:12px 14px;cursor:pointer;list-style:none}.row summary::-webkit-details-marker{display:none}.row-title{min-width:0}.row-title strong,.row-title span{display:block;overflow-wrap:anywhere}.row-title span{margin-top:4px;color:var(--muted);font-size:11px}.tags{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:5px}.tag{padding:2px 6px;border:1px solid var(--line);border-radius:3px;color:var(--muted);font-size:10px}.detail{padding:0 14px 16px;border-top:1px solid var(--line)}dl.meta{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:14px 0}dl.meta div{min-width:0}dt{color:var(--muted);font-size:10px}dd{margin:3px 0 0;overflow-wrap:anywhere;font-size:12px}details.block{margin-top:8px;border:1px solid var(--line);border-radius:4px}details.block summary{display:block;padding:8px 10px;background:var(--paper);font-size:11px;font-weight:700}pre{max-height:560px;margin:0;padding:12px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.65 Consolas,"SFMono-Regular",monospace}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:9px 11px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top;overflow-wrap:anywhere}th{position:sticky;top:0;background:var(--paper);color:var(--muted);font-size:10px}.empty{padding:44px 16px;text-align:center;color:var(--muted);font-size:12px}.pager{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:10px 14px}.pager button{padding:5px 9px;border:1px solid var(--line);border-radius:3px;background:var(--surface);cursor:pointer}.pager button:disabled{opacity:.4}.source-path{padding:10px 14px;border-bottom:1px solid var(--line);overflow-wrap:anywhere;color:var(--muted);font:11px Consolas,monospace}.error{padding:16px;border:1px solid #e4c5c2;background:#fff8f7;color:var(--danger)}@media(max-width:820px){header{height:68px;padding:0 16px}.shell{display:block}.shell nav{position:sticky;top:0;z-index:2;display:flex;overflow-x:auto;padding:8px;border-right:0;border-bottom:1px solid var(--line)}nav button{flex:0 0 auto;width:auto;border-left:0;border-bottom:2px solid transparent}nav button.active{border-left:0;border-bottom-color:var(--accent)}main{padding:18px 12px 36px}.view-head{align-items:start;flex-direction:column}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.metric:nth-child(2n){border-right:0}dl.meta{grid-template-columns:repeat(2,minmax(0,1fr))}.row summary{display:block}.tags{justify-content:flex-start;margin-top:8px}.toolbar,.toolbar input,.toolbar select,.toolbar .command{width:100%}}`

export const viewerJs = `const main=document.getElementById('main');const updated=document.getElementById('updated');let active='overview';let callPage=1;let userPage=1;let memoryIndex=null;const esc=(value)=>String(value??'');const fmt=(value)=>Number(value??0).toLocaleString('zh-CN');const time=(value)=>value?new Date(value).toLocaleString('zh-CN'):'-';const json=(value)=>typeof value==='string'?value:JSON.stringify(value??null,null,2);async function api(url){const response=await fetch(url,{cache:'no-store'});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||'读取失败');updated.textContent=new Date().toLocaleString('zh-CN');return body}function node(tag,className,text){const element=document.createElement(tag);if(className)element.className=className;if(text!==undefined)element.textContent=text;return element}function head(title,subtitle,toolbar){const wrap=node('div','view-head');const copy=node('div');copy.append(node('h2','',title),node('p','',subtitle));wrap.append(copy);if(toolbar)wrap.append(toolbar);return wrap}function metrics(items){const wrap=node('section','metrics');items.forEach(([label,value,note])=>{const item=node('article','metric');item.append(node('span','',label),node('strong','',fmt(value)),node('small','',note));wrap.append(item)});return wrap}function panel(title,note){const wrap=node('section','panel');const top=node('div','panel-head');top.append(node('h3','',title),node('span','',note));wrap.append(top);return wrap}function toolbarSearch(id,placeholder,onSubmit){const form=node('form','toolbar');const input=node('input');input.id=id;input.placeholder=placeholder;input.value=new URLSearchParams(location.search).get('q')||'';const button=node('button','command','查询');button.type='submit';form.append(input,button);form.addEventListener('submit',(event)=>{event.preventDefault();onSubmit(input.value)});return form}function detailBlock(title,value){const block=node('details','block');const label=node('summary','',title);const pre=node('pre','',value||'');block.append(label,pre);return block}function pager(current,total,pageSize,onPage){const pages=Math.max(1,Math.ceil(total/pageSize));const wrap=node('div','pager');const previous=node('button','','上一页');previous.disabled=current<=1;previous.onclick=()=>onPage(current-1);const label=node('span','muted',current+' / '+pages+' 页 · '+fmt(total)+' 条');const next=node('button','','下一页');next.disabled=current>=pages;next.onclick=()=>onPage(current+1);wrap.append(previous,label,next);return wrap}async function renderOverview(){const data=await api('/api/overview');main.replaceChildren(head('总览','现有 SQLite、WAL 与压缩记忆的只读投影'));const today=data.logs.today||{};main.append(metrics([['今日上游调用',today.calls,'proxy-access'],['今日失败',today.failures,'HTTP 异常'],['今日修复',today.repairs,'修复调用记录'],['日志总行数',data.logs.totalRows,'昨天与今天'],['注册账号',data.accounts.total,'账号数据库'],['排行榜记录',data.content.leaderboard,'当前最佳人生'],['站内邮件',data.content.mail,'画像邮件'],['记忆存档',data.memorySaves,'独立 SQLite']]));const sources=panel('数据源','实时只读');const table=node('div','table-wrap');table.innerHTML='<table><thead><tr><th>来源</th><th>状态</th><th>记录</th></tr></thead><tbody><tr><td>明文日志</td><td>'+(data.logs.available?'可用':'不存在')+'</td><td>'+fmt(data.logs.totalRows)+'</td></tr><tr><td>压缩记忆</td><td>'+(data.memorySaves?'可用':'暂无')+'</td><td>'+fmt(data.memorySaves)+' 个存档</td></tr></tbody></table>';sources.append(table);main.append(sources)}function logRow(entry){const details=node('details','row');const summary=node('summary');const title=node('div','row-title');title.append(node('strong','',entry.callKind||entry.message||entry.entryType),node('span','',time(entry.createdAt)+' · '+(entry.username||'匿名')+' · '+(entry.requestId||'无请求 ID')));const tags=node('div','tags');[entry.entryType,entry.provider,entry.model,entry.status===null?null:'HTTP '+entry.status].filter(Boolean).forEach((value)=>tags.append(node('span','tag',value)));summary.append(title,tags);const body=node('div','detail');const meta=node('dl','meta');[['设备来源',entry.deviceProvenanceId],['诊断编号',entry.diagnosticCode],['账号 ID',entry.accountId],['来源 IP',entry.sourceIp],['轮次',entry.round],['策略',entry.strategy],['分类',entry.category],['日志 ID',entry.id]].forEach(([label,value])=>{const item=node('div');item.append(node('dt','',label),node('dd','',value??'-'));meta.append(item)});body.append(meta,detailBlock('完整 Prompt / 发送内容',entry.prompt),detailBlock('完整 AI 返回 / 接收内容',entry.response),detailBlock('错误与堆栈',[entry.error,entry.stack].filter(Boolean).join('\n\n')),detailBlock('Meta',json(entry.meta)),detailBlock('完整记录',json(entry.payload)));details.append(summary,body);return details}async function renderCalls(query=''){const bar=toolbarSearch('call-query','请求 ID、用户、设备、调用类型或正文',value=>{callPage=1;renderCalls(value)});main.replaceChildren(head('AI 调用','完整发送、完整接收、模型、用量、缓存与失败链',bar));const data=await api('/api/ai-calls?page='+callPage+'&q='+encodeURIComponent(query));const wrap=panel('调用记录',fmt(data.total)+' 条');const rows=node('div','rows');if(!data.entries.length)rows.append(node('div','empty','暂无匹配记录'));else data.entries.forEach(entry=>rows.append(logRow(entry)));wrap.append(rows,pager(data.page,data.total,data.pageSize,page=>{callPage=page;renderCalls(query)}));main.append(wrap)}async function ensureMemoryIndex(){memoryIndex=memoryIndex||await api('/api/memory');return memoryIndex}async function renderMemory(lifeRunId,view='events',page=1){const index=await ensureMemoryIndex();const bar=node('div','toolbar');const saveSelect=node('select');saveSelect.append(node('option','','选择存档'));index.saves.forEach(save=>{const option=node('option','',save.lifeRunId);option.value=save.lifeRunId;option.selected=save.lifeRunId===lifeRunId;saveSelect.append(option)});const viewSelect=node('select');[['events','记忆事件'],['summaries','摘要节点'],['archives','L1 原始归档'],['links','来源关联']].forEach(([value,label])=>{const option=node('option','',label);option.value=value;option.selected=value===view;viewSelect.append(option)});saveSelect.onchange=()=>renderMemory(saveSelect.value,view);viewSelect.onchange=()=>renderMemory(saveSelect.value,viewSelect.value);bar.append(saveSelect,viewSelect);main.replaceChildren(head('压缩记忆','L1 / L2 / L3、来源、权重、衰减与原始压缩结果',bar));if(!lifeRunId){main.append(node('div','empty','选择记忆存档后读取'));return}const data=await api('/api/memory/rows?lifeRunId='+encodeURIComponent(lifeRunId)+'&view='+view+'&page='+page);const wrap=panel(lifeRunId,fmt(data.total)+' 条');const rows=node('div','rows');data.entries.forEach((entry,index)=>{const item=detailBlock((entry.event_id||entry.summary_id||entry.id||view+'-'+index),json(entry));item.classList.add('row');rows.append(item)});if(!data.entries.length)rows.append(node('div','empty','暂无记录'));wrap.append(rows,pager(data.page,data.total,data.pageSize,next=>renderMemory(lifeRunId,view,next)));main.append(wrap)}async function renderUsers(query=''){const bar=toolbarSearch('user-query','账号、用户名、诊断编号、设备来源或 IP',value=>{userPage=1;renderUsers(value)});main.replaceChildren(head('用户关联','账号或匿名来源与生成记录的关联入口',bar));const data=await api('/api/users?page='+userPage+'&q='+encodeURIComponent(query));const wrap=panel('身份来源',fmt(data.total)+' 组');const table=node('div','table-wrap');const element=node('table');element.innerHTML='<thead><tr><th>身份</th><th>设备来源</th><th>诊断编号</th><th>IP</th><th>AI / 日志</th><th>最后出现</th></tr></thead>';const body=node('tbody');data.entries.forEach(entry=>{const row=node('tr');[entry.isRegistered?(entry.username+'\n'+entry.accountId):'匿名',entry.deviceProvenanceId||'-',entry.diagnosticCode||'-',entry.sourceIp,fmt(entry.aiCount)+' / '+fmt(entry.logCount),time(entry.lastSeenAt)].forEach(value=>row.append(node('td','',value)));row.title='点击后在 AI 调用中查询该来源';row.onclick=()=>{active='calls';document.querySelectorAll('nav button').forEach(button=>button.classList.toggle('active',button.dataset.view==='calls'));callPage=1;renderCalls(entry.deviceProvenanceId||entry.accountId||entry.diagnosticCode||entry.sourceIp)};body.append(row)});element.append(body);table.append(element);wrap.append(table,pager(data.page,data.total,data.pageSize,page=>{userPage=page;renderUsers(query)}));main.append(wrap)}async function renderSchema(source='logs'){const memory=await ensureMemoryIndex();const bar=node('div','toolbar');const select=node('select');[['logs','日志数据库'],['accounts','账号数据库'],['player-content','玩家内容数据库'],...memory.saves.map(save=>['memory:'+save.lifeRunId,'记忆 · '+save.lifeRunId])].forEach(([value,label])=>{const option=node('option','',label);option.value=value;option.selected=value===source;select.append(option)});select.onchange=()=>renderSchema(select.value);bar.append(select);main.replaceChildren(head('数据库结构','表、列、行数、WAL 状态与文件位置',bar));const data=await api('/api/schema?source='+encodeURIComponent(source));const wrap=panel(data.label,data.available?(fmt(data.bytes)+' B · '+data.journalMode):'不存在');wrap.append(node('div','source-path',data.databasePath));if(!data.available){wrap.append(node('div','empty','数据库文件不存在'));main.append(wrap);return}data.tables.forEach(table=>{const block=node('details','block');const summary=node('summary','',table.name+' · '+fmt(table.rows)+' 行');const pre=node('pre','',table.columns.map(column=>column.name+'  '+column.type+(column.primaryKey?'  PRIMARY KEY':'')+(column.notNull?'  NOT NULL':'')).join('\n'));block.append(summary,pre);wrap.append(block)});main.append(wrap)}async function render(){try{if(active==='overview')await renderOverview();else if(active==='calls')await renderCalls();else if(active==='memory')await renderMemory();else if(active==='users')await renderUsers();else await renderSchema()}catch(error){main.replaceChildren(node('div','error',error instanceof Error?error.message:String(error)))}}document.querySelectorAll('nav button').forEach(button=>button.addEventListener('click',()=>{active=button.dataset.view;document.querySelectorAll('nav button').forEach(item=>item.classList.toggle('active',item===button));render()}));render();`

// The embedded client is kept on one physical line; all runtime newlines are string escapes.
export const viewerEnhancementJs = `
const ratio = (value) => Number(value ?? 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 }) + '%';
const duration = (value) => Number(value ?? 0).toLocaleString('zh-CN') + ' ms';
metrics = function metricsEnhanced(items) {
  const wrap = node('section', 'metrics');
  items.forEach(([label, value, note]) => {
    const item = node('article', 'metric');
    item.append(
      node('span', '', label),
      node('strong', '', typeof value === 'number' ? fmt(value) : String(value ?? '-')),
      node('small', '', note),
    );
    wrap.append(item);
  });
  return wrap;
};

renderOverview = async function renderOverviewEnhanced() {
  const data = await api('/api/overview');
  const today = data.logs.today || {};
  const yesterday = data.logs.yesterday || {};
  main.replaceChildren(head('总览', '今天与昨天的完整明文日志只读聚合'));
  main.append(metrics([
    ['今日调用', today.calls, '成功率 ' + ratio(today.successRate)],
    ['已接纳回合', today.adoptedRounds, '正文已写入故事历史'],
    ['缓存命中', ratio(today.cacheHitRate), fmt(today.hitTokens) + ' / ' + fmt((today.hitTokens || 0) + (today.missTokens || 0)) + ' Token'],
    ['平均延迟', duration(today.averageLatencyMs), '最大 ' + duration(today.latencyMaxMs)],
    ['输入 Token', (today.hitTokens || 0) + (today.missTokens || 0), '命中 + 未命中'],
    ['输出 Token', today.completionTokens, '思考 ' + fmt(today.reasoningTokens)],
    ['注册 / 匿名', fmt(today.registeredCalls) + ' / ' + fmt(today.anonymousCalls), '按代理请求'],
    ['昨日调用', yesterday.calls, '成功率 ' + ratio(yesterday.successRate)],
  ]));
  const pools = panel('今日调用池', Object.keys(today.byPool || {}).length + ' 个');
  const poolTable = node('div', 'table-wrap');
  const table = node('table');
  table.innerHTML = '<thead><tr><th>调用池</th><th>调用</th><th>命中</th><th>未命中</th><th>命中率</th><th>输出</th></tr></thead>';
  const body = node('tbody');
  Object.entries(today.byPool || {}).forEach(([pool, item]) => {
    const row = node('tr');
    [pool, fmt(item.calls), fmt(item.hitTokens), fmt(item.missTokens), ratio(item.cacheHitRate), fmt(item.completionTokens)].forEach((value) => row.append(node('td', '', value)));
    body.append(row);
  });
  if (!body.children.length) {
    const row = node('tr'); const cell = node('td', 'muted', '今天暂无可聚合调用'); cell.colSpan = 6; row.append(cell); body.append(row);
  }
  table.append(body); poolTable.append(table); pools.append(poolTable); main.append(pools);
  const sources = panel('数据源', '实时只读');
  const sourceTable = node('div', 'table-wrap');
  sourceTable.innerHTML = '<table><thead><tr><th>来源</th><th>状态</th><th>记录</th></tr></thead><tbody><tr><td>明文日志</td><td>' + (data.logs.available ? '可用' : '不存在') + '</td><td>' + fmt(data.logs.totalRows) + '</td></tr><tr><td>系统诊断事件</td><td>' + (data.developmentEvents ? '可用' : '暂无') + '</td><td>' + fmt(data.developmentEvents) + ' 条事件</td></tr><tr><td>压缩记忆</td><td>' + (data.memorySaves ? '可用' : '暂无') + '</td><td>' + fmt(data.memorySaves) + ' 个存档</td></tr></tbody></table>';
  sources.append(sourceTable); main.append(sources);
};

let diagnosticPage = 1;
let diagnosticQuery = '';
let diagnosticStatus = '';
async function renderDiagnostics(page = 1) {
  diagnosticPage = page;
  const form = node('form', 'toolbar');
  const input = node('input'); input.placeholder = '系统、事件、lifeRunId、错误或详情'; input.value = diagnosticQuery;
  const select = node('select');
  [['', '全部状态'], ['error', '错误'], ['warning', '警告'], ['ok', '正常'], ['skipped', '跳过']].forEach(([value, label]) => { const option = node('option', '', label); option.value = value; option.selected = value === diagnosticStatus; select.append(option); });
  const submit = node('button', 'command', '查询'); submit.type = 'submit';
  form.append(input, select, submit);
  form.addEventListener('submit', (event) => { event.preventDefault(); diagnosticQuery = input.value; diagnosticStatus = select.value; void renderDiagnostics(1); });
  select.addEventListener('change', () => { diagnosticStatus = select.value; void renderDiagnostics(1); });
  main.replaceChildren(head('系统诊断', '开发环境关键系统边界的明文事件，不含用户操作', form));
  const params = new URLSearchParams({ page: String(page), q: diagnosticQuery, status: diagnosticStatus });
  const data = await api('/api/system-diagnostics?' + params);
  main.append(metrics([
    ['错误', data.byStatus.error || 0, '需要优先检查'],
    ['警告', data.byStatus.warning || 0, '降级、等待或部分拒绝'],
    ['正常', data.byStatus.ok || 0, '已完成边界'],
    ['跳过', data.byStatus.skipped || 0, '带原因的预期跳过'],
  ]));
  main.append(metrics([
    ['执行原始事件', data.execution.rawEvents || 0, 'ready / running / terminal'],
    ['终结节点', data.execution.terminalEvents || 0, '唯一状态结果'],
    ['执行失败', data.execution.failures || 0, '阻塞、取消与错误'],
    ['事故分类', data.incidents.total || 0, '可复盘故障样本'],
  ]));
  const phases = panel('五阶段聚合', 'prepare -> ready -> execute -> transition -> finalize');
  const phaseTable = node('div', 'table-wrap'); const phaseElement = node('table');
  phaseElement.innerHTML = '<thead><tr><th>阶段</th><th>原始事件</th><th>终结节点</th><th>失败</th><th>耗时</th></tr></thead>';
  const phaseBody = node('tbody');
  ['prepare', 'ready', 'execute', 'transition', 'finalize'].forEach((phase) => { const item = data.execution.byPhase[phase] || {}; const row = node('tr'); [phase, fmt(item.events), fmt(item.terminalEvents), fmt(item.failures), duration(item.durationMs)].forEach((value) => row.append(node('td', '', value))); phaseBody.append(row); });
  phaseElement.append(phaseBody); phaseTable.append(phaseElement); phases.append(phaseTable); main.append(phases);
  const hierarchy = panel('公司式执行层级', '部门 / MOD -> 子系统 / 团队 -> 组件节点');
  const hierarchyTable = node('div', 'table-wrap'); const hierarchyElement = node('table');
  hierarchyElement.innerHTML = '<thead><tr><th>部门 / MOD</th><th>子系统 / 团队</th><th>组件</th><th>终结节点</th><th>失败</th><th>耗时</th></tr></thead>';
  const hierarchyBody = node('tbody');
  data.execution.hierarchy.forEach((department) => department.subsystems.forEach((subsystem) => { const row = node('tr'); [department.name, subsystem.name, subsystem.components.map((component) => component.name).join('\\n'), fmt(subsystem.terminalEvents), fmt(subsystem.failures), duration(subsystem.durationMs)].forEach((value) => row.append(node('td', '', value))); hierarchyBody.append(row); }));
  if (!hierarchyBody.children.length) { const row = node('tr'); const cell = node('td', 'muted', '暂无执行序诊断'); cell.colSpan = 6; row.append(cell); hierarchyBody.append(row); }
  hierarchyElement.append(hierarchyBody); hierarchyTable.append(hierarchyElement); hierarchy.append(hierarchyTable); main.append(hierarchy);
  const wrap = panel('诊断事件', fmt(data.total) + ' 条 · ' + data.root);
  const rows = node('div', 'rows');
  data.entries.forEach((entry) => {
    const item = node('details', 'row');
    const summary = node('summary');
    const title = node('div', 'row-title');
    title.append(node('strong', '', (entry.system || 'unknown') + ' · ' + (entry.event || 'unknown')), node('span', '', time(entry.timestamp) + (entry.lifeRunId ? ' · ' + entry.lifeRunId : '') + (entry.round ? ' · 第 ' + entry.round + ' 轮' : '')));
    const tags = node('div', 'tags');
    [String(entry.status || 'unknown').toUpperCase(), entry.category || null, entry.execution ? entry.execution.department + ' / ' + entry.execution.subsystem + ' / ' + entry.execution.phase : null, entry.durationMs !== undefined ? duration(entry.durationMs) : null, entry.sourceFile || null].filter(Boolean).forEach((value) => tags.append(node('span', 'tag', value)));
    summary.append(title, tags);
    const detail = node('div', 'detail'); detail.append(detailBlock('完整诊断事件', json(entry)));
    item.append(summary, detail); rows.append(item);
  });
  if (!data.entries.length) rows.append(node('div', 'empty', '暂无匹配的系统诊断事件'));
  wrap.append(rows, pager(data.page, data.total, data.pageSize, (next) => { void renderDiagnostics(next); })); main.append(wrap);
}

let readonlyQueryPage = 1;
let readonlyQuerySql = 'SELECT * FROM log_entries ORDER BY created_at DESC, rowid DESC, id ASC';
let readonlyQuerySource = 'logs';
async function renderReadonlyQuery(page = 1) {
  readonlyQueryPage = page;
  const memory = await ensureMemoryIndex();
  const controls = node('form', 'query-form');
  const select = node('select');
  [['logs', '日志数据库'], ['accounts', '账号数据库'], ['player-content', '玩家内容数据库'], ...memory.saves.map((save) => ['memory:' + save.lifeRunId, '记忆 · ' + save.lifeRunId])].forEach(([value, label]) => { const option = node('option', '', label); option.value = value; option.selected = value === readonlyQuerySource; select.append(option); });
  const textarea = node('textarea'); textarea.value = readonlyQuerySql; textarea.spellcheck = false;
  const submit = node('button', 'command', '执行 SELECT'); submit.type = 'submit';
  controls.append(select, textarea, submit);
  controls.addEventListener('submit', (event) => { event.preventDefault(); readonlyQuerySource = select.value; readonlyQuerySql = textarea.value; void runReadonlyQuery(1, controls); });
  main.replaceChildren(head('只读查询', '仅接受 SELECT / WITH；源数据库以 query_only 打开'), controls);
  await runReadonlyQuery(page, controls);
}
async function runReadonlyQuery(page, controls) {
  [...main.querySelectorAll('.query-result')].forEach((element) => element.remove());
  const data = await api('/api/query?source=' + encodeURIComponent(readonlyQuerySource) + '&page=' + page + '&sql=' + encodeURIComponent(readonlyQuerySql));
  const wrap = panel('查询结果', fmt(data.total) + ' 行'); wrap.classList.add('query-result');
  const tableWrap = node('div', 'table-wrap'); const table = node('table');
  const thead = node('thead'); const header = node('tr'); data.columns.forEach((column) => header.append(node('th', '', column))); thead.append(header); table.append(thead);
  const tbody = node('tbody'); data.rows.forEach((entry) => { const row = node('tr'); data.columns.forEach((column) => row.append(node('td', '', typeof entry[column] === 'object' ? json(entry[column]) : String(entry[column] ?? '')))); tbody.append(row); }); table.append(tbody); tableWrap.append(table);
  wrap.append(tableWrap, pager(data.page, data.total, data.pageSize, (next) => { void runReadonlyQuery(next, controls); })); main.append(wrap);
}

render = async function renderEnhanced() {
  try {
    if (active === 'overview') await renderOverview();
    else if (active === 'calls') await renderCalls();
    else if (active === 'diagnostics') await renderDiagnostics();
    else if (active === 'memory') await renderMemory();
    else if (active === 'users') await renderUsers();
    else if (active === 'schema') await renderSchema();
    else await renderReadonlyQuery();
  } catch (error) {
    main.replaceChildren(node('div', 'error', error instanceof Error ? error.message : String(error)));
  }
};
render();
`

export const servedViewerJs = viewerJs.replaceAll('\n', '\\n') + '\n' + viewerEnhancementJs
export const servedViewerCss = viewerCss + `.query-form{display:grid;grid-template-columns:180px minmax(280px,640px) auto;gap:8px;align-items:start}.query-form select,.query-form textarea{width:100%;min-height:36px;padding:8px 10px;border:1px solid var(--line);border-radius:4px;background:var(--surface);color:var(--ink);font:12px/1.55 Consolas,"SFMono-Regular",monospace}.query-form textarea{min-height:86px;resize:vertical}.query-result td{max-width:520px;white-space:pre-wrap;font-family:Consolas,"SFMono-Regular",monospace}@media(max-width:820px){.query-form{width:100%;grid-template-columns:1fr}.query-form .command{width:100%}}`
