# 生产服务与 TLS

仅在用户明确要求 PM2、systemd、Nginx、端口、防火墙、运营面板或 TLS 操作时读取；普通应用发布不读取或执行本文件。

## 服务与网络

- Next.js 只监听 `127.0.0.1:3000`。
- Nginx 只对公网开放 `80/443`，HTTPS 反向代理到 `http://localhost:3000`。
- 保持 `proxy_connect_timeout 10s`，`proxy_send_timeout`、`proxy_read_timeout`、`send_timeout` 为 `360s`。
- UFW 只允许 `22/80/443`，不得公开 `3000` 或运营面板 `4317`。
- `pm2-root` 保持 enabled 和 active；进程名为 `ai-life-sim`，工作目录为真实目录 `/root/ai-life-sim`，不通过软链接运行。
- 运营面板只监听 `127.0.0.1:4317`，通过 `ssh -N -L 4317:127.0.0.1:4317 tencent-vm` 查看。面板以 SQLite 只读连接查询账号、玩家内容与日志冷热库；systemd 保持数据库文件只读，只为 `/var/lib/ai-life-sim` 和 `/var/log/ai-life-sim` 目录放开 WAL/SHM 辅助文件的创建权限。

## TLS

- Snap Certbot 管理 `ai-mnrs.icu` 证书，覆盖 `ai-mnrs.icu` 和 `www.ai-mnrs.icu`。
- Nginx 从 `/etc/letsencrypt/live/ai-mnrs.icu/` 读取 `fullchain.pem` 和 `privkey.pem`。
- `snap.certbot.renew.timer` 保持 enabled 和 active。
- 修改证书或 Nginx 后运行：

```powershell
ssh tencent-vm "sudo certbot certificates"
ssh tencent-vm "sudo certbot renew --dry-run --no-random-sleep-on-renew"
ssh tencent-vm "sudo nginx -t"
```

验证两个域名 HTTPS，不得手工覆盖 Certbot 管理的 live 文件。
