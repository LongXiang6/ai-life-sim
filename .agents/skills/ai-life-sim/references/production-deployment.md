# 生产部署

仅在用户明确要求生产部署时执行。唯一入口是 [production-deploy.ps1](../scripts/production-deploy.ps1)，不复制、拆分或临时扩展步骤。

## 固定流程

1. 按 `D:\AI\.agents\task-trace.md` 创建部署溯源。
2. 本地入口用 `git archive HEAD` 生成当前已提交版本的临时归档，不执行 fetch、pull、push、提交、差异计划或工作树清理。
3. 把归档和固定远端脚本上传到 `tencent-vm:/tmp`。
4. 远端确认 `/root/ai-life-sim` 是真实目录而不是软链接，只保留 `node_modules` 与 `.env.production.local`，删除其余旧项目文件。
5. 将新归档解压到同一目录，执行 `npm run build`。
6. 构建成功后执行 `pm2 restart ai-life-sim --update-env`，返回 `DEPLOY_OK`。

```powershell
$DeployTool = 'D:\AI\ai-life-sim\.agents\skills\ai-life-sim\scripts\production-deploy.ps1'
& $DeployTool
```

## 行为边界

- 只上传当前 `HEAD`；未提交和未跟踪文件不会进入生产归档。
- 保留服务器现有 `node_modules`，不运行 `npm install` 或 `npm ci`。
- 保留服务器唯一 `.env.production.local`，不读取、打印、下载或覆盖其内容。
- `/root/ai-life-sim` 是唯一真实部署目录；软链接、版本号目录或其他活动路径会使部署立即失败。
- 账号、玩家内容、叙事记忆和日志均位于 `/var/lib` 或 `/var/log`，部署不读取、复制、备份、迁移或删除这些数据。
- 不创建 release 目录、候选实例、代码备份、部署状态、恢复脚本或回滚版本。
- 不执行本地或远端 gate-check、HTTP、浏览器、TLS、Nginx、日志或运营面板检查。
- 任一步失败立即返回失败；不重试、不切换备用实现、不自动恢复旧代码。

## 成功判据

只有远端清理、解压、`npm run build` 和 PM2 重启全部成功并输出 `DEPLOY_OK`，才说明本次部署命令完成。失败时只报告实际失败命令和退出状态，不宣称服务已更新。
