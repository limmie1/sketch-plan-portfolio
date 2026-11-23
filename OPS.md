# Sketch Plan · 运维手册（域名 + 备份）

> 服务器：腾讯云轻量应用服务器 · 中国香港 · 2 核 2G · `YOUR_SERVER_IP`
> 项目目录：`/opt/sketch-plan`
> 约定：先 `sudo -i` 切到 root，命令都用**绝对路径**，**一次只粘一行**。
>
> **当前状态（2026-10-18 11:40）**：已绑定 `https://your-domain.com`，Let's Encrypt 证书有效期至 2027-01-16 并自动续期；`COOKIE_SECURE=1`；用 IP 访问会自动 301 跳到域名。下文第一节是完整流程，仅供换服务器时参考。

---

## 一、绑定域名（自动 HTTPS）

### 0. 前提

- 香港节点**不需要 ICP 备案**，域名解析过来即可访问。
- 你手上要有：① 域名 ② 该域名的 DNS 解析控制台权限。

### 1. 加 A 记录

在**买域名的地方**（腾讯云 DNSPod / 阿里云 / Cloudflare …）进「解析设置」，添加：

| 主机记录 | 记录类型 | 记录值 | TTL |
|---|---|---|---|
| `@` | A | `YOUR_SERVER_IP` | 600 |
| `www` | A | `YOUR_SERVER_IP` | 600 |

- `@` = 裸域名 `example.com`；`www` = `www.example.com`。
- 若域名在别家买、但想用腾讯云解析：把域名的 NS 改成 DNSPod 给的两条地址，等生效（最长 24 小时）。

### 2. 验证解析生效

在**自己电脑**上执行（Windows PowerShell / 终端都行）：

```bash
nslookup 你的域名 8.8.8.8
```

返回里出现 `YOUR_SERVER_IP` 才算成功。没生效就去改 `.env`，Caddy 申请证书一定失败。

### 3. 放行端口

腾讯云控制台 → 轻量应用服务器 → 你的实例 → **防火墙**：确认 `80` 和 `443` 都是「允许」。只开 80 的话证书签不下来。

### 4. 改配置（在服务器上）

```bash
cd /opt/sketch-plan
```

```bash
sed -i 's/^DOMAIN=.*/DOMAIN=你的域名/' .env
```

> 把 `你的域名` 换成真实域名（如 `sketch.limmie.com`），**别把这几个汉字原样粘进去**。

```bash
sed -i 's/^COOKIE_SECURE=.*/COOKIE_SECURE=1/' .env
```

检查一下：

```bash
grep -E '^(DOMAIN|COOKIE_SECURE|TZ)=' .env
```

期望看到 `DOMAIN=你的真实域名`、`COOKIE_SECURE=1`、`TZ=Asia/Shanghai`。

### 5. 重启（只重建 caddy 即可）

```bash
docker compose up -d
```

### 6. 看证书签发过程

```bash
docker compose logs --tail=60 caddy
```

成功的标志：日志里出现 `certificate obtained successfully`，域名行不再是 `localhost`。
首次签发一般 10–30 秒；失败会打印 `acme: error ...`，对照文末排错表。

### 7. 验证

```bash
curl -sI https://你的域名/healthz | head -3
```

应返回 `HTTP/2 200`（或 `HTTP/1.1 200`）。然后浏览器打开 `https://你的域名`，地址栏有锁、能登录、能勾选日程就完全通了。

### 8. 关于证书续期

- Caddy **全自动**续期（到期前 30 天开始），证书存在 `caddy_data` 卷里。
- 所以：**永远不要执行 `docker compose down -v`**（`-v` 会删卷 = 删证书）。用 `down` 或 `restart` 都安全。

### 9. 想额外支持 www（可选）

Caddyfile 默认只匹配 `DOMAIN` 写的那个主机名。要让 `www.你的域名` 也能用：

```bash
sed -i '1,2s/^{\$DOMAIN:localhost} {/{$DOMAIN:localhost}, www.{$DOMAIN:localhost} {/' Caddyfile
```

```bash
head -2 Caddyfile
```

第一行应该是 `{$DOMAIN:localhost}, www.{$DOMAIN:localhost} {`。然后 `docker compose restart caddy`。
出问题就改回去：`sed -i '1,2s/, www\.{\$DOMAIN:localhost}//' Caddyfile`。

### 10. 域名绑定后的行为变化

- `http://YOUR_SERVER_IP` 会变成 404 —— 正常，因为 Caddy 现在只认这个域名。
- 必须用 **https 域名**访问；`COOKIE_SECURE=1` 下 http 访问会被浏览器丢弃 Cookie，表现是「登录后又跳回登录页」。

---

## 二、每日自动备份

> **状态：已配置（2026-10-23 09:41）**。root crontab 里每天 **03:10（北京时间）** 跑一次，日志 `/var/log/sketch-backup.log`，保留最近 14 份。
> 当前实际内容：
> ```
> 10 3 * * * cd /opt/sketch-plan && docker compose exec -T app node server/backup.mjs >> /var/log/sketch-backup.log 2>&1
> 0 4 * * 0 : > /var/log/sketch-backup.log
> ```

### 原理

`server/backup.mjs` 用 SQLite 的 `VACUUM INTO` 生成**一致性快照**（不用停服），写到 `data/backup-<时间>.db`，并自动只保留最近 **14 份**。

文件名用的是**容器本地时区**（compose 里 `TZ=Asia/Shanghai`），所以凌晨 3:10 跑出来叫 `backup-2026-10-24-03-10-02.db`。
> 注意：alpine 镜像没装 tzdata，容器里 `date` 命令仍显示 UTC，但 **Node 有完整 ICU、时区是对的** —— 别被 `date` 的输出误导。

### 1. 先手动跑一次，确认能出文件

```bash
cd /opt/sketch-plan && docker compose exec -T app node server/backup.mjs
```

```bash
ls -lh /opt/sketch-plan/data
```

应看到 `backup-2026-10-23-09-38-17.db` 这样一份，大小几百 KB 到几 MB。**这一步不成功就别配 cron。**

### 2. 写进 crontab

确认 cron 服务在跑：

```bash
systemctl is-active cron
```

输出 `active` 即可。然后：

```bash
crontab -e
```

第一次会让你选编辑器，选 `nano`（按 `1` 或直接回车）。在文件**最末尾**加这两行：

```
# Sketch Plan · 每日备份（凌晨 3:10，Asia/Shanghai），保留最近 14 份
10 3 * * * cd /opt/sketch-plan && docker compose exec -T app node server/backup.mjs >> /var/log/sketch-backup.log 2>&1
# Sketch Plan · 每周日 4:00 清空备份日志，防止无限增长
0 4 * * 0 : > /var/log/sketch-backup.log
```

保存：`Ctrl+O` → 回车 → `Ctrl+X`。确认写入：

```bash
crontab -l
```

> 四个坑：
> ① 必须用 **root 的 crontab**（上面的 `sudo -i` 之后再执行），否则没权限调 docker；
> ② 一定保留 `cd /opt/sketch-plan &&`，cron 的工作目录不是项目目录；
> ③ 一行写完整，不要在中间换行；
> ④ 腾讯云自带一条 `*/5 ... stargate` 的 crontab，**别整份覆盖**。用脚本批量清理旧行时，过滤词必须是 `sketch-plan`（带连字符）—— 写成 `sketchplan` 匹配不到，会留下重复的 `*/2` 测试行和重复的日志轮转行。

### 3. 验证它真的在跑

- 最简单：等到第二天 3:10 之后 `cat /var/log/sketch-backup.log`，应有一行 `已备份 → /data/backup-...`。
- 想立刻确认：把 `10 3` 临时改成 `*/2 * * * *`（每 2 分钟），等 2–3 分钟看日志能出结果，然后再改回 `10 3`。
- 另一种立刻确认法：手动执行 cron 里的**同一条命令**，能出文件就说明命令本身没问题，剩下只是时间点。

```bash
cd /opt/sketch-plan && docker compose exec -T app node server/backup.mjs >> /var/log/sketch-backup.log 2>&1
```

```bash
tail -5 /var/log/sketch-backup.log
```

> **2026-10-23 实测**：装成 `*/2` 后，09:40 准点自动生成 `backup-2026-10-23-09-40-01.db`，日志写入 `/var/log/sketch-backup.log`，说明 cron 的极简环境（`PATH=/usr/bin:/bin`）里 docker 也能找到（docker 在 `/usr/bin/docker`）。随后已改回 `10 3`。

### 4. 日志别无限长

每周日 4:00 清空日志（已随上面的 crontab 一起装好）：

```
0 4 * * 0 : > /var/log/sketch-backup.log
```

### 5. 异地备份（强烈建议）

服务器炸了，同盘的 14 份备份一起没。每周把备份拉回自己电脑一次：

```bash
scp root@YOUR_SERVER_IP:/opt/sketch-plan/data/backup-*.db D:/sketch-backup/
```

Windows 的 `D:/sketch-backup/` 目录要先建好；只想拉最新一份就写具体文件名。

### 6. 恢复演练（务必做一次，知道能用才叫备份）

```bash
cd /opt/sketch-plan && docker compose stop app
```

```bash
cp data/sketchplan.db data/before-restore.db
```

```bash
cp data/backup-2026-10-17-19-00-00.db data/sketchplan.db
```

把上面文件名换成你实际存在的那份。然后：

```bash
cd /opt/sketch-plan && docker compose start app
```

```bash
docker compose exec -T app node -e "fetch('http://127.0.0.1:4310/healthz').then(r=>r.text()).then(console.log)"
```

返回 `{"ok":true,...}` 就恢复成功。浏览器登录，确认日程/工作集都在。
确认无误后可删掉 `data/before-restore.db` 省空间（**确认无误再删**）。

---

## 三、排错表

| 现象 | 原因 | 处理 |
|---|---|---|
| `acme: error: no such host` | DNS 没生效 / 记录写错 | 重新 `nslookup 域名 8.8.8.8` |
| `challenge failed` + `challenge_type: tls-alpn-01` | 外网连不进 443（防火墙没放行 / 被前端代理挡住） | 控制台放行 443；服务器上 `ss -tlnp \| grep 443` 确认 caddy 在听；外部 `Test-NetConnection 域名 -Port 443` 应 True |
| `connection refused` / 超时 | 443 没放行 | 腾讯云防火墙加 443 |
| `too many failed authorizations` | Let's Encrypt 限流（同域名 1 小时 5 次失败） | 先修好解析和端口，等 1 小时再试 |
| 打开域名是 502 | app 容器没起 | `docker compose logs --tail=50 app` |
| 登录后跳回登录页 | http 访问 + `COOKIE_SECURE=1` | 换成 https 域名访问 |
| 证书签下来了但浏览器报不安全 | 用了旧缓存 / 访问的是 IP | 清缓存，确认地址栏是 https 域名 |
| 备份文件是 0 字节 | 磁盘满 / 数据目录权限 | `df -h`、`ls -l data`，看 `docker compose logs app` |
| 备份文件名像「早了一天」（凌晨 3 点备份却叫前一天 19:10） | 旧版用 `toISOString()`（UTC）命名 | v1.6.3 起改用容器本地时区，已修；升级 `server/backup.mjs` 后需 `docker compose up -d --build app` |
| cron 没执行 | 加在了普通用户 crontab / cron 没装 / 装了 `*/2` 测试行忘了改回 | `systemctl status cron`、`crontab -l` 确认在 root 下且只有一条 `10 3 * * *` |
| cron 执行了但报 `docker: not found` | cron 的 `PATH` 只有 `/usr/bin:/bin` | `which docker` 应是 `/usr/bin/docker`；不在的话在 crontab 行首加 `PATH=/usr/local/bin:/usr/bin:/bin ` |
| 浏览器报 `ERR_SSL_PROTOCOL_ERROR` | `DOMAIN` 写的是纯 IP，Caddy 拿不到证书却把 http 308 跳到 https | 见「五、无域名模式」 |
| 页面打开是空白（curl 返回 200 但 `size=0`） | 改过 `.env` 的 `DOMAIN` 却只 `restart`，容器环境变量还是旧值 | `docker compose up -d caddy` 重建容器，`restart` 不够 |
| 登录页找不到「注册」、也找不到「忘记密码」 | 正常。v1.7.0 起没有邮箱，注册与找回密码一并下线 | 见「六、账号管理」，用 `server/users.mjs` 加账号 / 改密码 |
| 启动日志里没有 `[迁移]` | 说明这库已经迁过（`users` 里没有 `email` 列），不是失败 | `docker compose exec -T app node server/users.mjs list` 能列出账号就正常 |

## 四、日常维护清单

| 频率 | 动作 |
|---|---|
| 每天 | 自动备份（cron，无需人工） |
| 每周 | `scp` 拉一份备份到本地；看一眼 `docker compose ps` 是否 healthy |
| 每月 | `df -h` 看磁盘；`docker image prune -f` 清旧镜像 |
| 到期前 | 服务器续费（2026-11-17 到期）、域名续费 |

---

## 五、无域名模式（IP 直连，域名委派生效前的过渡态）

Let's Encrypt **不给纯 IP 签证书**。如果 `DOMAIN` 填的是 IP，Caddy 会拿不到证书，同时仍把 80 端口 308 跳到 https，结果就是浏览器报 `ERR_SSL_PROTOCOL_ERROR`。

正确写法是**显式声明走 http**，Caddyfile 第一行（非注释行）改成：

```
http://{$DOMAIN:localhost} {
```

配合 `.env`：

```
DOMAIN=YOUR_SERVER_IP
COOKIE_SECURE=0
```

> `COOKIE_SECURE=0` 必须跟着改，否则 http 下浏览器会丢弃会话 Cookie，表现为「登录后又跳回登录页」。

改完必须**重建 caddy 容器**，不能只 restart：

```
cd /opt/sketch-plan && docker compose up -d caddy
```

`docker compose restart` 只重启进程，环境变量仍是容器创建时的旧值 —— 这会导致「curl 返回 200 但页面空白」，因为 Caddy 里的 `{$DOMAIN}` 还停在旧域名，Host 匹配不上，返回空响应。

验证：

```
curl -s http://YOUR_SERVER_IP/healthz
```

应返回 `{"ok":true,...}`。

**域名委派生效后切回 HTTPS**：把 Caddyfile 那行前面的 `http://` 去掉、`.env` 改回 `DOMAIN=你的域名` 与 `COOKIE_SECURE=1`、`docker compose up -d caddy` 即可；`Strict-Transport-Security` 那行同时取消注释。

---

## 六、账号管理

v1.7.1 起**恢复了自助注册**（登录页「注册」Tab），但只收**用户名 + 密码 + 确认密码**，不收集邮箱。
所以：邮箱验证、邮件提醒、邮件找回密码**仍然没有**；忘记密码只能由管理员在服务器上重置。

账号仍然可以在服务器上直接管理：

```bash
cd /opt/sketch-plan

# 看现有账号（含日程数、最后创建时间）
docker compose exec -T app node server/users.mjs list

# 新建账号（会交互式提示输入密码，输入时不回显）
docker compose exec -T app node server/users.mjs add 林小满

# 重置密码（同时注销这个账号的所有旧登录会话）
docker compose exec -T app node server/users.mjs passwd 林小满

# 删除账号 + 它的全部数据（日程/计划/复盘/设置）
docker compose exec -T app node server/users.mjs del 林小满 --yes
```

> `-T` 不要漏：不加的话 `docker compose exec` 会分配 TTY，隐藏输入那段读不到字符。
> 非交互场景（脚本里）可以直接把密码写在第二个参数：`add 林小满 'MyPass123'`；不写则随机生成并只打印一次。

**注册接口**（`POST /api/auth/register`，前端「注册」Tab 调的就是它）：
用户名 3–20 位中文/字母/数字/下划线且唯一；密码至少 8 位并同时含字母和数字；同一 IP 限 20 次/小时。
注册成功直接建会话（自动登录）。想临时关掉自助注册，把 `server/index.mjs` 里那段路由改成返回 403 再重建 app 容器即可。

**忘记密码怎么办**：让管理员执行 `passwd <用户名>`。没有邮件、没有重置链接，这是唯一途径。

**数据库里的邮箱字段**：v1.7.0 启动时会自动把 `users` 表重建一次（去掉 `email` / `email_verified_at`，删掉 `verify_tokens` 表），
迁移前会自动生成一份 `data/before-drop-email-<时间>.db` 快照。日志里看到这两行就说明迁完了：

```
[迁移] 迁移前快照 → before-drop-email-2026-10-23T....db
[迁移] 已移除 users.email / email_verified_at 与 verify_tokens 表（账号 4 → 4）
```

迁移可重复执行，已经迁过就静默跳过。
