# Sketch Plan 服务端

零依赖 Node 服务（Node 22 自带 `node:sqlite`），负责账号、会话、日程/重复规则、工作集、任务、复盘与提醒投递。

## 本地跑起来

```bash
cd sketch-plan
node server/index.mjs
# → http://localhost:4310  （静态站 + /api）
```

首次启动会自动建表（`data/sketchplan.db`）。

## 接口冒烟测试

```bash
node server/index.mjs &          # 另开一个终端
node server/test.mjs             # 27 项：注册/登录/日程/重复/顺延/批量/任务/复盘/权限
```

> `test.mjs` 直接调 `/api/auth/register` 建一个 `test_xxxxx` 账号（同名已存在时先跳过注册），
> 所以服务端必须已经起好（容器里跑：`docker compose exec -T app node server/test.mjs`）。

## 账号管理

注册在登录页可以自助完成（只需用户名 + 密码，不收集邮箱）。服务器上另有 CLI 用于批量管理：

```bash
node server/users.mjs list                 # 列出账号
node server/users.mjs add 林小满            # 新建（会提示输入密码）
node server/users.mjs passwd 林小满         # 重置密码（顺带踢掉旧会话）
node server/users.mjs del 林小满 --yes      # 删除账号及其全部数据
```

## 主要接口

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/register` | 用户名 + 密码（无需邮箱），成功即登录，返回 201 |
| POST | `/api/auth/login` | 用户名 + 密码 |
| POST | `/api/auth/logout` | 清会话 |
| GET | `/api/me` | 当前用户 + 设置 |
| GET | `/api/state?from&to` | 一次拿齐界面数据（日程/工作集/任务/复盘） |
| POST | `/api/events` | 新建日程；带 `rule/weekdays/until` 时按 RRULE 展开 |
| PATCH | `/api/events/:id` | 改单次（生成例外，不动系列） |
| DELETE | `/api/events/:id` | 删除单次（标记 skipped） |
| DELETE | `/api/series/:id` | 删除整个重复系列 |
| POST | `/api/events/:id/toggle` | 勾选完成 |
| POST | `/api/events/:id/postpone` | 顺延（记次数与原因） |
| POST | `/api/batch` | 批量排课（周几 + 区间） |
| GET/POST | `/api/collections` | 工作集 |
| GET/POST | `/api/tasks`、`/api/tasks/:id/logs` | 长期计划与进度 |
| GET/PUT | `/api/reviews/:key` | 复盘（键如 `week:2026-10-12`） |

**约定**：所有时间按“墙钟”存储（`date` + `start_min` + 时区字段），重复展开在墙钟上做，与前端模型一致；跨时区/夏令时的 UTC 换算在下一阶段补。

## 部署到服务器

1. 服务器装 Docker（Ubuntu：`curl -fsSL https://get.docker.com | sh`）
2. 把 `sketch-plan/` 整个目录传上去（`scp -r` 或 git）
3. `cp .env.example .env`，改 `DOMAIN=你的域名`
4. 域名 A 记录指向服务器 IP，等解析生效
5. `docker compose up -d --build`
6. 访问 `https://你的域名`（Caddy 自动申请证书）

首次启动 `COOKIE_SECURE=1` 要求 HTTPS，请务必用域名访问；本地测试请把 `NODE_ENV` 设为 `development`。

## 备份

```bash
# 每天 03:10 备份，保留 14 天
10 3 * * * cd /opt/sketch-plan && docker compose exec -T app node server/backup.mjs >> /var/log/sketch-backup.log 2>&1
```

恢复：把 `data/backup-xxx.db` 覆盖回 `data/sketchplan.db` 后 `docker compose restart app`。

## 前端如何接这套接口

- `index.html` 加载 `assets/sync.js`：先 `GET /api/me`，401 跳登录页；成功后 `GET /api/state` 拉全量到内存。
- **写操作**：本地先改（乐观更新）→ 发请求 → 用服务端数据重建；失败会提示并回滚。
- 用 `file://` 直接打开时自动跳过同步，仍然是纯前端原型（数据在 localStorage）。
- 新建类操作会换 id，所以请求成功后立刻重建一次，避免后续操作打到临时 id。

## 已知边界（下一阶段）

- 会话与限流在单机内存/库中，多实例部署需要 Redis。
- 提醒用进程内定时器，服务重启会补齐（`pending` 且未过期），但多副本会重复投递。
- 未接 Web Push，只有站内提示；iOS 需 PWA 才有推送。邮件渠道已在 v1.7.0 移除。
- 时间按墙钟存，跨时区/夏令时的 UTC 换算待补。
- 时间轴的「计划条」目前来自前端内置演示数据，还没接 `tasks`。
