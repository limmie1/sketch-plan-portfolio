# Sketch Plan — 项目开发提示词（交给 Claude Code 的完整任务书）

> **版本 v1.1**（在 v1.0 基础上增补：三套可切换主题、双端（桌面 / 平板 / 手机）体系、Notion 式属性与视图。请先读第 0–16 节，再读第 17 节。）
> 本文件是**唯一事实来源（Single Source of Truth）**。请先完整读完，再输出你的实施计划。
> 目标不是"做一个日历 demo"，而是**交付一个可以真实上线、供真实用户长期使用的日程产品**，且视觉与动效达到设计作品集水准。

---

## 0. 你的角色与工作方式（必读）

你是一名 **资深全栈工程师 + 顶级视觉设计师 + 动效设计师** 的合体：

- **工程侧**：10 年经验，精通 TypeScript、Next.js App Router、PostgreSQL、任务队列、时区与重复规则（RFC 5545）等"日历类产品的真正难点"。你写可维护的代码，不写一次性脚本。
- **设计侧**：你有强烈的个人审美。你能把"手绘 / 纸张 / 墨水"这种材质语言做得很克制、很高级，而不是幼稚卡通。你懂排版、留白、层级、节奏。
- **动效侧**：你信奉"动效是物理的隐喻"。每个动画都有重量、惯性、落点；你从不滥用弹跳和渐变。

### 工作协议（严格执行）

1. **先计划，后动手。** 第一轮回复只输出：技术方案要点 / 目录结构 / 数据模型 / 里程碑拆解 / 你不确定的地方（最多 3 条，并各给 2 个方案 + 你的推荐）。等我确认后再写代码。
2. **按里程碑推进，每个里程碑必须可运行、可验收、可提交。** 不允许"一次性写完 200 个文件再一起报错"。
3. **每个里程碑结束时输出**：改动摘要 → 如何本地验证（具体命令/点击路径）→ 已知问题 → 下一里程碑内容。
4. **遇到产品歧义不要停下来问开放问题**：给出两个具体方案 + 推荐 + 影响面，然后**按推荐方案继续**，并在交付摘要里标注"此决策待你确认"。
5. **不要伪造完成度。** 没测过的不要说"已完成"。所有 `TODO` 必须显式标记并在里程碑摘要里列出。
6. **禁止占位内容**：不允许 `Lorem ipsum`、`TODO: implement`、空函数体、假数据混在生产代码里（种子数据只能存在于 `prisma/seed.ts` 且由脚本显式执行）。

---

## 1. 项目定义

**名称**：Sketch Plan
**一句话**：把日程"画"在纸上——一个以手绘纸张为视觉语言的日程管理 + 长期进度追踪 + 可靠提醒工具。
**形态**：可安装的 PWA 网站（桌面 + 移动端浏览器均可完整使用），支持多设备同步。
**语言**：简体中文优先（文案要自然、有人味，不要机翻感），架构上预留 i18n。
**部署**：自托管（我有服务器，Docker 部署），因此**所有依赖必须可自托管，不绑定任何 SaaS 才能跑起来**（邮件、推送走可配置的 SMTP / VAPID）。

### 产品气质（做设计时的北极星）

> 像一本被认真使用过的纸质手账：米白的纸、微微洇开的墨、贴着胶带的便签、被荧光笔划过的重点。
> 它可以很安静（长时间只显示一张月历），也可以很热闹（一天的日程像贴纸一样层层叠叠）。
> **不要**：紫色渐变、玻璃拟态、AI 感光斑、无意义的粒子特效、Ant Design 默认皮肤。

### 明确不做什么（防止范围失控）

- 不做团队协作 / 共享日历 / 多人编辑（v1 纯个人）。
- 不做原生 App（iOS/Android 客户端），只做 PWA。
- 不做支付、会员、社交。
- 不做复杂的甘特依赖关系（FS/SS 前置任务），时间轴只做"展示 + 拖拽调整"。

---

## 2. 目标用户与关键场景（用它们校验每个决策）

**P1 学生 / 备考党**：一周固定课表 + 一堆 DDL + 一个"读完 32 篇英语文章"的长期任务。
**P2 自由职业 / 远程工作者**：日程碎片化，需要"今天到底该干什么"的强引导，以及跨时区不混乱。
**P3 自我管理爱好者**：喜欢把计划可视化，需要统计、连续打卡、进度回顾。

**场景走查（必须都能顺畅完成，不允许超过 3 次点击才到达）：**

- S1：新用户注册 → 邮箱验证 → 落地页直接看到"今天"，30 秒内建好第一个日程。
- S2：把"周二 14:30 学 C 语言"一次设置成 8.9–9.22 每周二、四重复。
- S3：打开时间轴，一眼看出"英语阅读"横跨 10.15–11.23，还剩 18 天，落后 4 篇。
- S4：下午 4:10 收到"16:30 英语课"的提醒（提前 20 分钟），点开直接跳到该日程。
- S5：手机锁屏状态收到推送（PWA 已安装），点开后应用恢复到该日程详情。
- S6：月底回看"这个月完成了多少"，进度条与打卡记录一致、可追溯到每一条明细。

---

## 3. 技术栈（除非有强理由，否则不要换）

| 层 | 选型 | 说明 |
|---|---|---|
| 框架 | **Next.js 15（App Router）+ React 19 + TypeScript strict** | Server Components 优先，交互岛用 `"use client"` |
| 样式 | **Tailwind CSS v4** + CSS 变量设计令牌 | 令牌集中在 `app/styles/tokens.css`，禁止散落魔法值 |
| 组件基座 | **shadcn/ui（Radix）** | **仅作无障碍基座**，样式必须完全重写为 Sketch 语言，不允许保留默认观感 |
| 动效 | **Motion（framer-motion 后继）+ 少量原生 CSS** | 列表/布局动画用 Motion，纯装饰用 CSS；统一从 `lib/motion.ts` 取 token |
| 数据库 | **PostgreSQL 16** | `timestamptz` 存 UTC，业务时区在应用层处理 |
| ORM | **Prisma**（或 Drizzle，二选一，说明理由） | 必须有迁移文件，禁止 `db push` 上生产 |
| 认证 | **Better Auth**（自托管，邮箱+密码 + 邮箱验证 + 找回密码 + 可选 OAuth） | httpOnly Cookie 会话，禁止 JWT 存 localStorage |
| 队列/定时 | **Redis 7 + BullMQ**（独立 worker 进程） | 提醒扫描、批量展开、邮件发送、每日摘要 |
| 邮件 | **Nodemailer + 可配置 SMTP** + React Email 模板 | 必须能在 .env 里换成任意 SMTP（含国内服务商） |
| 推送 | **Web Push（VAPID）** + Service Worker | iOS 需"添加到主屏幕"后才可用，必须有降级说明 |
| 校验 | **Zod** | 所有 API 入参、环境变量、表单都必须校验 |
| 测试 | **Vitest**（单测）+ **Playwright**（E2E 关键路径） | 重复规则、时区、提醒时间是重点覆盖对象 |
| 部署 | **Docker Compose**：`web` / `worker` / `db` / `redis` / `caddy` | 一键 `docker compose up -d`，Caddy 自动 HTTPS |

> 如果你认为某项选型有问题，先说明理由和替代方案，**等我同意后再改**。

---

## 4. 目录结构（请按此组织，允许微调但要说明）

```
sketch-plan/
├─ app/
│  ├─ (marketing)/page.tsx            # 落地页：一屏讲清产品，带可交互的迷你日历
│  ├─ (auth)/login|register|verify|reset/
│  ├─ (app)/
│  │   ├─ layout.tsx                  # 应用外壳：左栏 + 顶部 + 右侧检查器
│  │   ├─ today/page.tsx              # 默认视图（重定向到 /day 或 /month）
│  │   ├─ month|week|day/page.tsx
│  │   ├─ timeline/page.tsx
│  │   ├─ progress/page.tsx
│  │   ├─ settings/page.tsx
│  │   └─ event/[id]/page.tsx
│  ├─ api/                            # 仅保留必须为 HTTP 的部分（推送、webhook、cron 触发）
│  ├─ dev/design/page.tsx             # 🎨 活的设计系统页（所有组件 + 状态 + 动效演示）
│  └─ styles/tokens.css
├─ components/
│  ├─ calendar/ (MonthGrid, WeekGrid, DayColumn, EventChip, TimeGutter)
│  ├─ timeline/ (TimelineCanvas, GanttBar, DeadlinePin, TodayLine, ZoomControl)
│  ├─ progress/ (ProgressCard, InkBar, LogDialog, Sparkline)
│  ├─ event/ (EventDialog, RecurrenceBuilder, FieldEditor, ChecklistEditor)
│  ├─ reminder/ (ReminderList, OffsetPicker, ChannelPicker)
│  ├─ shell/ (Rail, Topbar, Inspector, CommandPalette)
│  └─ sketch/ (SketchBox, PaperCard, Tape, Highlighter, DoodleEmpty, InkCheckbox)
├─ lib/ (db, auth, dal, recurrence, time, reminders, mail, push, motion, utils)
├─ server/ (actions, services, jobs)
├─ worker/ (index.ts, processors/)
├─ prisma/ (schema.prisma, migrations/, seed.ts)
├─ tests/ (unit/, e2e/)
├─ docs/ (design-system.md, adr/, screenshots/)
├─ docker-compose.yml
├─ CLAUDE.md
└─ README.md
```

---

## 5. 数据模型（这是产品质量的地基，请严格实现）

### 5.1 核心表

```prisma
model User {
  id             String   @id @default(cuid())
  email          String   @unique
  emailVerifiedAt DateTime?
  passwordHash   String?          // Argon2id
  name           String?
  avatarUrl      String?
  timezone       String   @default("Asia/Shanghai")  // IANA
  locale         String   @default("zh-CN")
  weekStartsOn   Int      @default(1)                // 1=周一
  createdAt      DateTime @default(now())
}

model Session {
  id        String   @id
  userId    String
  tokenHash String   @unique
  expiresAt DateTime
  ip        String?
  userAgent String?
}

model VerificationToken {           // 邮箱验证 / 找回密码 共用
  id         String   @id @default(cuid())
  identifier String                 // email
  tokenHash  String   @unique
  purpose    Purpose                // VERIFY_EMAIL | RESET_PASSWORD
  expiresAt  DateTime
  consumedAt DateTime?
}

model Category {                    // 分类/标签，带颜色与图标
  id     String @id @default(cuid())
  userId String
  name   String
  color  String                     // 令牌名，如 "vermilion"，不要存 hex
  icon   String
  sort   Int
}

model EventSeries {                 // 一个"系列"= 一次创建行为（可含重复规则）
  id           String   @id @default(cuid())
  userId       String
  title        String
  notes        String?              // 富文本受限子集（sanitize）
  location     String?
  url          String?
  categoryId   String?
  priority     Int      @default(2) // 1 紧急 2 普通 3 低
  allDay       Boolean  @default(false)
  isFloating   Boolean  @default(false)  // true=浮动本地时间（上课这类），跨时区不变
  startsAtUtc  DateTime
  endsAtUtc    DateTime
  timezone     String
  rrule        String?              // RFC 5545，如 FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=...
  recurrenceEnd DateTime?
  checklist    Json?                // [{id,text,done}]
  customFields Json?                // 用户自定义字段值
  templateId   String?
  createdAt    DateTime @default(now())
  deletedAt    DateTime?
}

model EventOccurrence {             // 展开后的单次实例（查询/勾选/拖拽都作用于它）
  id             String   @id @default(cuid())
  seriesId       String
  userId         String
  startsAtUtc    DateTime
  endsAtUtc      DateTime
  status         Status   @default(SCHEDULED)  // SCHEDULED|DONE|SKIPPED
  isException    Boolean  @default(false)      // 单次被修改过
  titleOverride  String?
  notesOverride  String?
  startsOverride DateTime?
  endsOverride   DateTime?
  completedAt    DateTime?

  @@unique([seriesId, startsAtUtc])
  @@index([userId, startsAtUtc])
}

model Reminder {
  id            String   @id @default(cuid())
  userId        String
  occurrenceId  String?
  seriesId      String?
  offsetMinutes Int                    // 提前多少分钟；0=准时；1440=提前一天
  fireAtUtc     DateTime
  channels      Channel[]              // IN_APP | EMAIL | PUSH
  state         ReminderState @default(PENDING) // PENDING|SENT|FAILED|CANCELLED
  attempts      Int      @default(0)
  sentAt        DateTime?
  idempotencyKey String  @unique
  @@index([state, fireAtUtc])
}

model LongTask {                    // 中长期进度任务
  id          String   @id @default(cuid())
  userId      String
  title       String
  unit        String                 // 篇 / 章 / 小时 / 次
  targetValue Float
  startDate   DateTime
  dueDate     DateTime
  categoryId  String?
  cadence     Cadence  @default(DAILY)   // 记录节奏提醒
  status      TaskStatus @default(ACTIVE)
  createdAt   DateTime @default(now())
}

model TaskLog {                     // 每一次进度记录（真实来源，进度=sum）
  id      String   @id @default(cuid())
  taskId  String
  userId  String
  value   Float    @default(1)
  loggedAt DateTime @default(now())
  note    String?
}

model PushSubscription { id, userId, endpoint @unique, p256dh, auth, createdAt }
model Notification { id, userId, kind, title, body, payload Json, readAt, createdAt }
model UserSettings {
  userId String @id
  defaultReminders Json   @default("[{\"offsetMinutes\":20,\"channels\":[\"IN_APP\"]}]")
  quietHoursStart String? // "23:00"
  quietHoursEnd   String? // "07:30"
  dailyDigestAt   String? // "08:00"
  theme String @default("paper")   // paper | night
  density String @default("comfortable")
}
```

### 5.2 不变量（必须由代码与数据库约束共同保证）

1. `EventOccurrence` 的 `startsAtUtc` 在**同一 series 内唯一**（防重复展开）。
2. 修改单次实例（scope=this）→ 创建 override，**不修改** series；修改"此后所有" → 截断 series 的 `UNTIL` 并新建 series。
3. `Reminder.idempotencyKey = sha1(occurrenceId|seriesId + offsetMinutes + fireAtUtc + channel)`，投递前先抢占状态。
4. 进度 = `sum(TaskLog.value)`，**永远不存冗余 progress 字段**；如需缓存必须能重建。
5. 所有查询必须带 `userId` 过滤（在 DAL 层统一实现，禁止在组件里手写 where）。

---

## 6. 功能规格（逐条给交互 + 边界 + 验收）

### F1 账号系统

- 邮箱 + 密码注册（密码 ≥ 8 位，含字母数字；Argon2id 哈希）；**必须邮件验证后才能登录**。
- 支持**任意邮箱域名**（不要写死 QQ/163 白名单）。
- 找回密码、修改密码、修改邮箱、删除账号（级联删除全部数据，需二次确认 + 输入邮箱）。
- 可选 OAuth：Google / GitHub（通过环境变量开关，默认关闭）。
- 会话：httpOnly + Secure + SameSite=Lax，30 天滑动过期；"退出所有设备"。
- 限流：登录 5 次/10 分钟（按 IP + 账号双维度），注册 3 次/小时，验证邮件 1 分钟 1 封。
- 注册成功后：自动创建默认分类（学习/工作/生活/健康），时区取自 `Intl.DateTimeFormat().resolvedOptions().timeZone`，跳转 `/today` 并展示 3 步引导（可跳过）。

**验收**：用未验证账号访问任意页面 → 拦截并提示重发邮件；重置密码后旧会话全部失效；并发注册同邮箱只有一个成功。

### F2 日历与日程（月 / 周 / 日）

- **月视图**：6 行 × 7 列；周一为首列（可设置）；非本月日期降透明度但可点击；今天用**手绘红圈**标记；每格最多展示 3 条事件，其余显示"+N 更多"并在右侧检查器展开。
- **周视图**：7 列时间网格，07:00–24:00 可滚动（默认滚动到当前时间前 2 小时）；重叠事件按列宽等分并显示数量；支持 15 分钟粒度拖拽创建（拖选时间段）与拖拽移动。
- **日视图**：单列时间轴 + 左侧"全天事项"区 + 右侧"今日进度/提醒"。
- **事件卡片**：标题、时间、分类色条、优先级、子任务完成比（如 2/5）、提醒图标。全天事件置顶单独一行。
- **新建/编辑**：表单字段见 F3；支持"点击空白时间段直接创建"（默认 1 小时）。
- **拖拽**：跨天、跨时间移动；`Alt+拖拽` = 复制；拖拽时显示虚线的"落点幽灵"。
- **快捷键**：`N` 新建、`T` 今天、`←/→` 切换周期、`M/W/D/G` 切换视图、`/` 搜索、`⌘K` 命令面板、`Esc` 关闭。

**验收**：创建跨月重复事件后在月/周/日三视图时间一致；DST 切换日不出现"少一小时/多一小时"的错位（用 `America/New_York` 单测）；1000 条事件下月视图滚动 60fps。

### F3 高度可自定义的事件

字段清单（用户可在设置里勾选常用字段、可保存为**事件模板**）：

| 字段 | 类型 | 备注 |
|---|---|---|
| 标题 / 备注 | 文本 / 轻富文本 | 备注支持链接、列表、勾选，禁止任意 HTML 注入 |
| 日期时间 | 单次 / 跨天 / 全天 | 全天事件按时区边界计算 |
| 重复 | RRULE 构建器 | 每天/工作日/每周几/每月几号或第 n 个周几/每 n 天/自定义 |
| 分类 | 单选 + 自定义颜色 | 颜色用令牌，暗色模式自动适配 |
| 优先级 | 3 级 | 用"墨水重量"视觉表达（粗/中/细线） |
| 地点 / 链接 | 文本 / URL | 地点可一键复制 |
| 子任务 | checklist | 可拖拽排序，完成度反馈到事件卡片 |
| 提醒 | 多组 | 每个事件可挂多个提醒（如提前 1 天 + 提前 20 分钟），每个可独立选渠道 |
| 自定义字段 | text/number/select/checkbox/date | 用户可定义字段名与类型，值存 `customFields` JSON |
| 精力预估 | 1–5 | 用于"今日负荷"提示（超载时给出温和警告） |

**验收**：自定义字段在事件详情、导出 JSON、搜索中都能正确往返；模板一键填充可覆盖除日期外的全部字段。

### F4 时间轴（产品的差异化记忆点）

- **横向时间轴**（类甘特）：X 轴时间（支持 日/周/月 缩放，`⌘+滚轮` 缩放），Y 轴为"计划/任务"行。
- 每个长条：标题在条内左对齐、圆角手绘边、按分类着色、条内显示"已过/剩余"的斜纹填充。
- **DDL 标记**：菱形墨点 + 竖虚线延伸到轴线；**倒计时**：`还剩 18 天` / `已逾期 3 天`（逾期用朱红，且不闪烁、不用感叹号轰炸）。
- **今日线**：朱红竖线贯穿全图，带 `今天` 标签，轻微呼吸（opacity 0.85↔1，4s）。
- 条可拖拽平移、拖拽两端改持续期；拖动时顶部实时显示新日期区间 + 天数。
- 支持筛选：仅显示某分类 / 仅显示有 DDL 的 / 仅显示进行中。
- 移动端降级为**纵向列表 + 迷你条**，不做横向拖拽。

**验收**：100 条计划在 3 年跨度下缩放流畅；拖拽改期后月视图与提醒同步更新；DDL 与倒计时计算在时区边界正确。

### F5 进度（中长期任务）

- 创建：标题 + 目标量 + 单位 + 起止日期 + 记录节奏（每天/每周/自定义）。
- 展示：手绘进度条（墨迹填充，带 25/50/75 刻度小疤）、`14 / 32 篇`、百分比。
- **节奏诊断**（关键，做出"聪明感"）：
  - `剩余 18 篇 / 剩余 9 天 = 每天 2 篇`（required pace）
  - 近 7 天实际日均 vs 需要日均 → 判定 `on_track | at_risk | behind`
  - 预测完成日：基于近 14 天线性回归，若晚于 DDL 则显示"按当前速度将晚 6 天完成"，并提供"帮我补上"（一键生成补课日程）
- 记录：`+1` 快速记录、`+自定义值`、撤销（5 秒内）、备注。
- 迷你趋势图：近 14 天柱状（手绘柱），空白日用浅灰点。
- 连续打卡（streak）用"铅笔勾"标记，不搞夸张火焰 emoji。

**验收**：删除某条 log 后进度与预测同步回退；跨越 DDL 后状态自动变为逾期并出现在"需要关注"区。

### F6 提醒（可靠性是重点，不允许"大概能响"）

- 每个事件可配多个提醒（提前 0/5/10/15/20/30/60 分钟、1 小时、1 天、自定义）。
- 渠道：**站内**（默认）、**邮件**、**Web Push**。渠道不可用时自动降级到站内并告知。
- 投递流程：worker 每 30 秒扫描 `state=PENDING AND fireAtUtc <= now()`，`FOR UPDATE SKIP LOCKED` 抢占 → 入队投递 → 成功置 SENT，失败指数退避重试 3 次（30s/2m/10m）后置 FAILED 并生成一条站内"提醒发送失败"通知。
- **勿扰时段**：落在 quiet hours 内的提醒，除"准时"提醒外顺延到结束时刻，并在通知里注明"已顺延"。
- **合并**：5 分钟内到期的多条提醒合并为一张汇总卡（"接下来 1 小时有 3 件事"）。
- **每日摘要**：可选，每天 08:00 一封"今日 3 件事 + 进度需关注 1 项"。
- **服务端时区**：所有 `fireAtUtc` 在写入时按"事件时区 + 用户当前时区"计算并持久化，worker 不做任何本地时区推断。
- iOS 限制必须写进设置页文案：Safari 需"添加到主屏幕"才能接收推送，并提供邮件渠道作为兜底。

**验收**：修改事件时间 → 关联提醒的 `fireAtUtc` 事务内一并更新；重复事件的提醒按实例生成且不重复；worker 重启后不丢不重；用 `pnpm test:reminders` 能在 10 秒内模拟时间流逝跑完一天。

### F7 批量设置与复制（用户明确点名，务必做好）

- **重复构建器**：起止日期 + 星期多选 + 时间 + 间隔（每 n 周）+ 结束条件（按次数/按日期）；实时预览"将创建 24 个日程"，并列出**冲突检测**（"其中 3 个与已有日程重叠"），冲突项用虚线框标出，可选择"仍然创建 / 跳过冲突"。
- **批量编辑**：框选多日 / 多选事件 → 批量改时间、改分类、改提醒、删除。
- **复制**：`复制到…`（选择目标日期区间 + 目标星期）与 `Alt+拖拽` 复制；复制保留除日期外全部字段。
- **课程表模式**：一张"周课表"网格，直接填格子创建整学期重复事件，支持单双周（隔周）。
- 系列编辑语义与 Google Calendar 一致：仅此 / 此后所有 / 全部；UI 上用三选一弹层明确说明影响范围与数量。

**验收**：8.9→9.22 每周二、四 14:30 应精确生成 14 个（含边界日）事件；"仅此一次"修改不改动其他实例；单双周不串周。

### F8 搜索 / 筛选 / 命令面板

- `/` 或 `⌘K` 打开命令面板：可搜事件标题/备注、跳转日期、切换视图、执行"新建进度"等动作。
- 筛选：分类、完成状态、有无提醒、日期范围；筛选状态写进 URL（可分享/刷新保持）。
- **今日页**（产品的灵魂）：一屏回答"现在该做什么"——当前/下一个事件卡、今日剩余时长、需关注的进度、逾期未完成项。

### F9 设置 / 主题 / 数据

- 主题：`paper`（米白纸）/ `night`（夜航纸，深墨底 + 暖白字），跟随系统可选。
- 一周起始日、时间格式（12/24）、默认提醒、默认时长、勿扰时段、每日摘要。
- 数据：导出全部为 JSON + `.ics`；导入 `.ics`；删除账号。
- PWA：可安装、离线可看最近 30 天日程（只读缓存）、断网时有明确提示条。

---

## 7. 视觉设计系统（Sketch 语言 — 请把它做成"能拿去做作品集"的水准）

### 7.1 设计原则

1. **纸是容器，墨是信息。** 背景永远是纸（有极轻的纤维噪点与 24px 点阵），信息用墨的浓淡分级，而不是靠彩色卡片堆叠。
2. **手绘感来自"不完美"，不来自"卡通"。** 用不规则圆角、1.5px 墨线、硬投影（像贴纸）、轻微倾斜；**不要**用涂鸦字体写正文，不要画卡通人物。
3. **克制用色。** 90% 的画面是纸白 + 墨黑 + 灰，只在"今天/逾期/强调"处出现朱红。
4. **大量留白。** 月历格子内边距 ≥ 12px；每个视图最多一个视觉焦点。
5. **动效服务理解。** 每个动画都在解释"东西从哪来、到哪去"，不做无意义的入场秀。

### 7.2 色彩令牌（写入 `tokens.css`，组件只引用变量名）

```
paper      #FCF9F2   纸面
paper-2    #F5EFE3   次级纸面（侧栏、卡片）
paper-3    #EFE7D7   凹陷/悬停
ink        #1F1D1A   主墨（正文、线条）
ink-2      #5B554A   次墨（辅助文字）
ink-3      #938B7C   淡墨（占位、网格线）
rule       rgba(31,29,26,.14)  分隔线
vermilion  #D9503A   朱红：今天 / 逾期 / 破坏性操作
indigo     #33507E   靛青：学习类
moss       #5F7F4E   苔绿：健康类
ochre      #DFA53C   姜黄：荧光笔 / 提醒
plum       #8A5A72   紫檀：生活类
night 主题：bg #171512 / surface #1F1C18 / ink #F1EADC / rule rgba(241,234,220,.14)
           朱红降饱和为 #C9563F，其余色相不变、亮度 +8%
```

**禁止**：纯黑 `#000`、纯白 `#FFF`、任何 `linear-gradient` 大面积渐变背景、彩色玻璃模糊。

### 7.3 字体

```
展示（标题/大数字）： "Fraunces", "Songti SC", "Source Han Serif SC", Georgia, serif
正文/UI：           "Inter", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif
手写注解（仅限小面积）： "LXGW WenKai", "Kaiti SC", cursive —— 只用于标签、空状态、批注
数字：              font-variant-numeric: tabular-nums; 倒计时必须等宽
字阶：12 / 13 / 14 / 16 / 20 / 26 / 34 / 48（1.25 比例），行高 1.6（正文）/ 1.15（标题）
字重只用 400 / 500 / 600；标题可用 600 + letter-spacing -0.01em
```

### 7.4 手绘形状（核心技法，必须实现为 `components/sketch` 的可复用组件）

**A. 不规则边框**（低成本、高可信度，用不对称圆角模拟手画方框）：

```css
.sketch-box {
  border: 1.5px solid var(--ink);
  border-radius: 14px 8px 16px 6px / 8px 16px 6px 14px;
  box-shadow: 2px 3px 0 rgba(31,29,26,.07);
}
.sketch-box:nth-child(2n) { border-radius: 8px 16px 6px 14px / 14px 6px 16px 8px; }
```

**B. 墨线抖动**（用于分隔线、手绘圈、进度条轮廓；**不要**用于正文边框，性能与时序都有代价）：

```html
<svg width="0" height="0"><filter id="rough">
  <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="3" seed="7"/>
  <feDisplacementMap in="SourceGraphic" scale="1.6"/>
</filter></svg>
```

**C. 荧光笔**（关键词、今日高亮）：

```css
.highlight {
  background: linear-gradient(104deg, transparent 1%, rgba(223,165,60,.38) 3%,
              rgba(223,165,60,.38) 97%, transparent 99%);
  box-decoration-break: clone;
}
```

**D. 胶带**（卡片角上 28×10px 的半透明姜黄条，`transform: rotate(-8deg)`，`mix-blend-mode: multiply`）。

**E. 纸张噪点**：全屏 `::after` 覆盖 `feTurbulence` 生成的 base64 PNG，`opacity: .035`，`pointer-events: none`，**只在最外层出现一次**。

**F. 硬投影**：`2px 3px 0 rgba(31,29,26,.07)` + 悬停时 `4px 6px 0`（位移而非模糊），像纸片被抬起。

### 7.5 组件规范要点

- **事件卡（EventChip）**：左缘 3px 分类色墨条 + 标题 13px + 时间 11px 淡墨；完成态文字加"手写删除线"（两段略微错位的线，不是一条干净的 line-through）；逾期时左侧墨条变朱红并加一个小三角标记。
- **月历单元格**：今天 = 数字外一圈手绘红圆（SVG path 不是 `border-radius`），非本月日期 `opacity:.45`。
- **按钮**：三种——纸面按钮（描边墨线）、墨块按钮（实心 ink，文字 paper）、笔迹文字按钮（下划线是手绘短线）；按下时 `translateY(1px)` 且投影收为 1px，模拟"按进纸里"。
- **输入框**：无圆角矩形描边，改为**底部一条手绘横线**（focus 时线变粗 + 朱红节点），更像在纸上写字。
- **空状态**：手绘涂鸦（如空日历画一个打哈欠的小闹钟）+ 一句人话（"这一天空着，挺好的。"）+ 一个主操作。
- **深色模式**：不是简单反转——纸变成"夜航纸"（暖调深褐黑），墨变暖白，朱红降饱和，所有阴影改为"更深的同色"而非黑。
- **响应式**：`<768px` 单列，底部 Tab（今天/月/时间轴/进度/我的）；`768–1200` 双栏（去掉右侧检查器，改为抽屉）；`>1200` 三栏。

### 7.6 必须交付 `/dev/design` 页面

一个活的样式指南，包含：所有色彩/字阶/间距令牌、每个组件的 default / hover / active / focus / disabled / loading / empty / error 状态、所有动效的可点击触发按钮。**这是验收设计质量的主要依据**，必须真实可用，不能是静态截图。

---

## 8. 动效规范（Motion Spec）

### 8.1 令牌（`lib/motion.ts`）

```ts
export const D = { instant: 0.12, fast: 0.18, base: 0.24, slow: 0.38, page: 0.52 };
export const EASE = {
  out:   [0.22, 0.90, 0.24, 1],   // 落纸：快进慢出
  inOut: [0.60, 0.02, 0.20, 1],
  paper: [0.34, 1.10, 0.64, 1],   // 轻微过冲，模拟纸片
};
export const SPRING = { type: 'spring', stiffness: 420, damping: 34, mass: 0.9 };
```

规则：位移/缩放只动 `transform`，颜色只动 `opacity`/`background-color`；单次动画不超过 520ms；同一屏同时动画元素 ≤ 24 个；`prefers-reduced-motion` 时保留下淡入、去掉位移与旋转。

### 8.2 十二个关键动效（逐个实现，别偷懒）

1. **首屏开卷**：整页 `clip-path: inset(0 0 100% 0)` → `inset(0)`，配合 `rotateX(3deg)→0`，420ms；同时墨线标题做 stroke-dashoffset 描边（0.6s）。只在首次进入播放。
2. **月切换**：新月份从右侧 24px 推入 + `opacity 0→1`，日期格子按对角线 stagger（每格延迟 8ms，总时长封顶 180ms），旧月份反向淡出。
3. **新建事件**：对话框以"纸片展开"出现（`scaleY .92→1`, `transform-origin: top`）；保存后新 chip 先画出一条下划线，再 `scale .94→1` 弹入，同时列表其余项 `layout` 平滑让位。
4. **拖拽**：抓起时 `scale 1.02 / rotate 2deg / 阴影加深`；落点显示虚线手绘框；松手用 SPRING 归位，落点若有冲突则框线转朱红并抖动 2 次（每次 80ms，位移 2px）。
5. **完成打卡**：勾选路径 `stroke-dashoffset` 由 1→0（180ms），随后删除线从左到右画出（200ms），再飘出 6 个极小纸屑（`opacity` 衰减，220ms），**不弹窗、不播放音效**。
6. **进度填充**：宽度 transition 620ms `EASE.out`，数字用 `useSpring` 从旧值滚到新值；每到 25/50/75 刻度，刻度线做一次 120ms 的轻微弹动。
7. **时间轴进入**：条形从左侧按行 stagger 12ms 生长（`scaleX 0→1`, origin left）；今日线从上到下"落下"一次 380ms，之后进入 4s 呼吸循环。
8. **倒计时跳秒**：数字用 tabular-nums，仅"分钟"位做 `y: -8px → 0` 的翻页，秒位不动画（避免视觉噪音）。
9. **提醒 Toast**：像便利贴从右下飞入（`y 16 → 0`, `rotate 4deg → -1deg`, SPRING），停留 3.2s 后向上飘走；重要提醒（准时）用朱红左侧条，其余用姜黄。
10. **删除**：内容先 `scale .96` + `blur 2px`，再旋转 12° 飞出屏幕（320ms `EASE.inOut`），列表以 layout 动画收拢。
11. **空状态涂鸦**：进场时 SVG path 描边 0.8s；之后插图内部元素做 6s 的极慢上下浮动（±2px），像呼吸。
12. **侧栏折叠**：`grid-template-columns` 240px→64px（260ms），文字 `opacity` 先隐后退场，图标位置用 layout 动画补间。

### 8.3 性能红线

- 首屏 LCP < 2.0s（4G），INP < 200ms，CLS < 0.05，首屏 JS ≤ 200KB gzip。
- 日历 1000 事件时滚动 60fps；时间轴 200 条时缩放不掉帧（必要时用 canvas 绘条、DOM 只留交互层）。
- 所有动画在低端机（4× CPU 降速）下仍不阻塞输入；`will-change` 只在动画期间加，结束即移除。

---

## 9. 可访问性与国际化

- WCAG 2.1 AA：正文对比度 ≥ 4.5:1（纸上的淡墨要实测，不能凭感觉）；焦点态用**虚线墨圈**（`outline: 2px dashed var(--ink); outline-offset: 3px`），不允许 `outline: none`。
- 全键盘可达：Tab 顺序符合视觉顺序；弹层 focus trap + `Esc` 关闭 + 关闭后焦点回到触发元素。
- 屏幕阅读器：日历格用 `role="grid"` + `aria-label="2026年10月17日，周六，3 个日程"`；提醒到达用 `aria-live="assertive"`。
- 触控目标 ≥ 44×44px；移动端底部 Tab 不遮挡内容（`padding-bottom: env(safe-area-inset-bottom)`）。
- 文案全部走 `messages/zh-CN.json`，日期用 `Intl.DateTimeFormat`，不手拼"年月日"。

---

## 10. 安全与隐私

- 密码 Argon2id；登录错误不区分"账号不存在/密码错误"（防枚举）。
- CSRF：Server Actions 天然防护 + 自定义 API 校验 Origin；CSP（`default-src 'self'`，字体/图片白名单）。
- 越权：DAL 层统一 `where: { userId }`；写一个 `assertOwnership()` 并被所有写操作调用；E2E 里加一条"用 A 的会话访问 B 的事件 ID 返回 404"的用例。
- 备注富文本：服务端 sanitize（白名单标签），渲染时不允许 `dangerouslySetInnerHTML` 直接输出用户内容。
- 密钥全部走 env，`.env.example` 只放占位；日志中脱敏 email/token；数据库不存明文 token（只存 hash）。
- 备份：`pg_dump` 每日 03:00 到挂载卷，保留 14 天；提供 `scripts/restore.sh`。
- 隐私：不引入任何第三方分析脚本（如需统计，用自托管 Umami 并默认关闭）。

---

## 11. 质量门禁（Definition of Done）

每个里程碑必须同时满足：

- [ ] `pnpm typecheck` / `pnpm lint` / `pnpm test` 全绿（CI 里也要跑）。
- [ ] 新功能有 Zod schema + 至少 1 个单测（重复规则/时区/提醒逻辑必须有）。
- [ ] 关键路径有 Playwright 用例（注册登录、建重复事件、批量创建、完成打卡、进度记录）。
- [ ] 加载态是"纸骨架屏"（不是灰色方块闪烁），错误态有人话提示 + 重试按钮，空态有涂鸦。
- [ ] 移动端 375px 宽度下无横向滚动、无遮挡。
- [ ] 深色模式检查过一遍（不是简单反转导致的脏色）。
- [ ] `docs/screenshots/` 下有该里程碑主要界面的截图（用 Playwright 自动截图，1440×900 + 390×844 各一张）。
- [ ] README 里的启动步骤在干净环境验证过一遍。

---

## 12. 里程碑（按顺序，逐个验收）

| # | 内容 | 交付物 |
|---|---|---|
| **M0** | 项目脚手架、Docker Compose、Prisma 初始迁移、设计令牌、`/dev/design` 空壳、CI | 能 `docker compose up` 打开一个"纸质"空页面 |
| **M1** | 认证全套（注册/验证/登录/找回/限流）+ App Shell（Rail/Topbar/Inspector） | 可注册登录，进入空日历 |
| **M2** | 事件 CRUD + 月/周/日视图 + 拖拽 + 详情抽屉 | 能手动安排一天的日程 |
| **M3** | RRULE 重复 + 批量创建/复制/课程表模式 + 系列编辑三选一 | S2、F7 全部验收通过 |
| **M4** | 时间轴视图（缩放/拖拽/DDL/倒计时）+ 长任务与进度 + 趋势 | S3 验收通过 |
| **M5** | 提醒系统（worker + 邮件 + Web Push + 勿扰 + 摘要） | 真机收到邮件/推送；`test:reminders` 通过 |
| **M6** | 今日页 + 命令面板 + 搜索筛选 + 设置页 + 导入导出 | S1、S6 验收通过 |
| **M7** | 全站动效打磨 + 空/错/载态 + 深色模式 + 响应式 + 无障碍 + 性能预算 | Lighthouse ≥ 95（性能/无障碍） |
| **M8** | 部署（Caddy HTTPS、健康检查、备份、日志）+ 文档 + 上线清单 | 公网可访问，手机可安装 PWA |

---

## 13. 禁止清单（违反即返工）

1. ❌ 保留 shadcn 默认样式、默认灰色边框、`rounded-lg` 一统天下。
2. ❌ 大面积渐变、玻璃拟态、发光、紫蓝配色、"AI 味"插画。
3. ❌ 用 emoji 当图标（图标统一用 lucide + 少量自绘 SVG，线宽 1.5px，与墨线一致）。
4. ❌ 在客户端 `new Date()` 直接算时区/重复；禁止手写日期加减（统一走 `lib/time.ts`）。
5. ❌ 用 `any`、`as unknown as`、`@ts-ignore` 蒙混过关。
6. ❌ 把进度存成可漂移的冗余字段、或在组件里拼 SQL/where。
7. ❌ 用 `setTimeout` 轮询做提醒；必须走队列。
8. ❌ 假数据留在生产代码路径；不写 `// TODO: later` 就交付。
9. ❌ 一次性重构多个模块再一起提交（里程碑内的小步提交）。
10. ❌ 动画无限循环（除今日线呼吸、空状态浮动这类极低频装饰）。

---

## 14. 附录 A：关键算法要求

**重复展开**（`lib/recurrence.ts`）
- 用 `rrule` 库，`dtstart` 以事件时区构造，输出再转 UTC 存储。
- 滚动窗口：展开"今天 −30 天 ~ 今天 +180 天"；查询超出窗口时按需展开并落库。
- 例外：`EXDATE` 删除单次；override 存 `EventOccurrence` 的 `*Override` 字段。
- 单测必须覆盖：月末 31 号、2 月 29 日、每周跨年、DST 前后、单双周、`UNTIL` 含边界。

**提醒计算**（`lib/reminders.ts`）
- `fireAt = occurrenceStartUtc - offsetMinutes`（浮动事件先按用户当前时区还原本地时间再减）。
- 事件时间/时区/重复规则变更 → 在同一事务里 `deleteMany` 旧提醒 + 重建（幂等）。
- 勿扰顺延：若 `fireAt` 落在 quiet hours 内，`fireAt = quietHoursEnd`（当天）；"准时"提醒不顺延。

**节奏预测**（`lib/progress.ts`）
- 需要日均 = 剩余量 / max(1, 剩余天数)。
- 实际日均 = 近 14 天 log 总量 / 14（无记录按 0，不插值）。
- 预测完成日 = 今天 + 剩余量 / max(实际日均, 0.01)；晚于 DDL 则 `behind`。
- 状态阈值：`剩余天数 × 实际日均 ≥ 剩余量 × 0.95` → on_track；`≥ 0.7` → at_risk；否则 behind。

---

## 15. 附录 B：API / Server Action 契约（节选）

| 方法 | 路径 | 入参要点 | 出参 |
|---|---|---|---|
| POST | `/api/auth/register` | email, password, timezone | 202 + 发验证邮件 |
| GET | `/api/events?from&to` | ISO 区间（用户时区） | occurrences[]（含 series 摘要） |
| POST | `/api/events` | series + rrule + reminders[] | series + 已展开 occurrences[] |
| PATCH | `/api/events/:occurrenceId` | scope=this\|following\|all | 受影响 occurrences[] |
| DELETE | `/api/events/:occurrenceId` | scope | `{ affected: n }` |
| POST | `/api/events/batch` | template + weekdays[] + range + conflictPolicy | `{ created, conflicts[] }` |
| POST | `/api/tasks` / `PATCH` | LongTask 字段 | task |
| POST | `/api/tasks/:id/logs` | value, note, loggedAt | task(含重算 progress) |
| POST | `/api/push/subscribe` | endpoint, p256dh, auth | 204 |
| GET | `/api/notifications?unread=1` | — | notifications[] |

所有写操作：Zod 校验 → 鉴权 → 归属校验 → 事务 → 触发副作用（重建提醒/发通知）→ 返回被影响数据（前端乐观更新用）。

---

## 16. 交付第一步

现在请只回复以下内容，不要写代码：

1. 你对这个产品的理解（3 句以内，证明你抓住了重点）。
2. 技术方案确认表（选型 + 一处你认为需要调整的地方 + 理由）。
3. 目录结构与你打算先做的 M0 具体文件清单。
4. 数据模型里你认为最容易出问题的 2 个点 + 你的处理方案。
5. 视觉方向：用 6 个关键词 + 1 段 80 字以内的描述，说明你打算怎么把"纸与墨"做得高级而不幼稚；并说明事件卡、月历格、进度条三个组件你打算怎么画。
6. 你需要在开始前问我的 3 个问题（最多 3 个，其余自行决策并标注）。

我确认之后，你从 M0 开始，一个里程碑一交付。

---

# 17. v1.1 增补

## 17.1 三套可切换主题

产品必须提供三套视觉主题，用户可在应用内随时切换，选择跟随账号（跨设备一致），并按设备记忆（手机可单独用深色）。

| 主题 | 定位 | 关键 token |
|---|---|---|
| **Ink Paper 纸墨** | 一本用旧了的纸质手账。衬线标题、不对称圆角、硬投影、纸纹噪点、朱红只用于"今天/逾期/危险"。 | bg `#FBF7EE` / text `#211E19` / accent `#D9503A` / r `14px 8px 16px 6px` / shadow `2px 3px 0` |
| **Pebble 柔彩** | 干净的白色工作台。无边框色块、大圆角、柔光阴影、无衬线 600 标题。 | bg `#FBFBFD` / text `#15151B` / accent `#5B6CFF` / r `18px` / 柔光阴影 |
| **Aurora 夜航** | 深夜数据舱。渐变事件块、1px 描边、等宽数字、几乎无位移的快动效。 | bg `#0A0B0F` / text `#ECEEF6` / accent `#8B5CF6→#22D3EE` / r `12px` / 描边 |

**实现约束（必须遵守）**

1. 组件只消费 CSS 变量（`--bg/--surface/--text/--accent/--c-*/--r-*/--sh-*`），**禁止**为某个主题写独立组件。
2. 三套主题共用同一网格与组件尺寸，切换时**不允许布局跳动**（只换填充、描边、圆角、阴影、字体、局部装饰六类属性）。
3. 主题状态存 `user_settings.theme`，SSR 首屏必须直出正确主题（用 cookie 或 `<html data-theme>` 内联变量），**不允许**先渲染再切换导致闪烁。
4. 新增第四套主题的成本必须 ≤ 一个 60 行的 token 块 + 4 个分类色。

## 17.2 双端系统（桌面 / 平板 / 手机）

**架构原则**：一套 API、一份数据模型、一套业务逻辑（`server/services`），三套布局与交互层。移动端是独立的布局实现，不是桌面缩小的结果。

| | 桌面 ≥1240 | 平板 768–1240 | 手机 <768 |
|---|---|---|---|
| 导航 | 左栏文字+图标 | 左栏图标条（76px） | 底部 5 Tab |
| 默认视图 | 月历 | 周表 | 今天（日议程） |
| 右栏检查器 | 常驻 | 收起 | 无 |
| 新建入口 | 顶栏 + 双击空白 | 顶栏 | 悬浮 FAB |
| 完成事项 | 勾选 | 勾选 | 点卡片直接完成 |
| 时间轴 | 横向甘特 | 横向甘特 | 纵向卡片 |
| 弹层 | 居中 520 | 居中 | 底部升起 |
| 拖拽 | 支持 | 支持 | 降级为长按菜单 |

**技术落地**

- 断点由 CSS 媒体查询与 `matchMedia` 共同驱动，两者必须一致（同一常量）。
- 移动端优先使用**原生手势**：横向滑切周、下拉刷新、底部弹层；触控目标 ≥ 44×44，预留 `env(safe-area-inset-bottom)`。
- 不允许下载两套页面；同一路由，响应式 + 条件渲染。列表长于 200 项时虚拟化。
- 同步：所有写操作用乐观更新 + 服务端返回的 `updatedAt` 校正；冲突策略为"最后写入胜出 + 把被覆盖的版本放进 `event_revisions`"，跨设备一致性靠 `updatedAt` 轮询或 SSE（v1 用轮询 30s 即可）。
- PWA：`manifest` + Service Worker，离线可读最近 30 天；iOS 需"添加到主屏幕"才能收 Push，必须有邮件兜底并在设置页写明。

## 17.3 参考 Notion 的功能与设计系统

**借鉴（做）**

1. **属性化（properties）**：事件 = 一条数据库记录，字段含分类、优先级、精力、地点、链接、提醒、子任务、自定义字段（text / number / select / checkbox / date）。自定义字段存 `jsonb`，用 Zod 按 schema 校验。
2. **多视图 + 视图配置**：月 / 周 / 时间轴 / 进度 / 清单，同一份数据；视图的筛选、排序、显示字段可保存为命名视图（`saved_views`）。
3. **条目即页面**：点开事件进入详情页，含备注块（标题/列表/待办/引用/分割线）、子任务、附件、关联的长期任务。
4. **模板**：事件模板（一节课 / 一次跑步 / 论文写作），一键填充除日期外的全部属性。
5. **命令面板（⌘K）**：新建、跳转日期、切视图、批量排课、打开设置。
6. **悬停工具条**：事件卡悬停出现"完成 / 推迟 / 复制"。
7. **克制的设计语言**：8px 网格、中性色阶、1px 分割线、轻阴影、大量留白、hover 只做背景变深——这套"安静的界面"逻辑要保留在三套主题里。

**不借鉴（不做）**：无限层级页面树、多人协作与权限、块级嵌套拖拽、AI 生成内容。v1 保持单人。

## 17.4 里程碑调整

| # | 新增内容 |
|---|---|
| **M0** | 增加：三套主题 token 文件 + `/dev/design` 页要求（所有组件 × 三主题 × 全部状态） |
| **M2** | 增加：周视图（时间网格）与移动端日议程 |
| **M4** | 增加：时间轴热力条（近 30 天完成情况） |
| **M9** | **主题系统**：切换、持久化、SSR 无闪烁、跨设备一致 |
| **M10** | **移动端**：底部 Tab、FAB、底部弹层、手势、PWA 安装、推送 |
| **M11** | **Notion 化**：自定义属性、保存视图、事件详情页、模板、命令面板 |

## 17.5 验收增补

- [ ] 三套主题下，同一页面截图并排比较，布局位置完全一致（允许 1px 内差异）。
- [ ] 主题切换 < 100ms 完成，无闪烁、无滚动跳动。
- [ ] iPhone SE（375×667）、iPhone 15（393×852）、iPad 竖屏（834×1112）、桌面 1440 四档截图齐备。
- [ ] 手机端单手可达：主要操作都在屏幕下半部或底部 Tab/FAB。
- [ ] 弱网（Slow 3G）下首屏可交互 < 3s；离线打开显示缓存日程并提示"离线只读"。
- [ ] 键盘全流程可用（桌面），读屏能正确播报日历格与提醒。

## 17.6 交互细节（原型已实现，正式版保持一致）

- **默认主题为 Ink Paper**；`user_settings.theme` 缺省即 `ink`，首次进入不弹主题选择。
- **拖拽改期**：月历用 HTML5 DnD 跨天移动，`Alt` 拖动为复制；周表用 Pointer Events + 15 分钟吸附，拖动时在块顶部显示「+1 天 +30 分」的实时提示。手机端不启用拖拽（与滚动冲突），改日期走详情页。
- **详情即页面**：桌面右侧 432px 抽屉、手机底部 88dvh 面板；标题可直接编辑，属性（日期/开始/时长/提醒/分类）改动即时落库，子任务可增删勾选，备注自动保存；删除为两步确认。
- **偏好可改**：默认提醒、每周起始日（真正改变月历与周表的列顺序）、勿扰时段、每日摘要、三个通知渠道开关。偏好同时作用于「新建」的默认值与提醒列表的「顺延」标注。
- 所有设置项必须**立即生效**（重渲染而非刷新），并持久化到账号，跨端一致。

## 17.7 验收补充

- [ ] 拖动事件到另一天后，刷新页面仍在；`Alt` 拖动后原事件仍在。
- [ ] 周表拖动只能落在 15 分钟网格上，且跨天时日期正确。
- [ ] 把「每周起始日」改为周日后，月历列头、迷你日历、周表三处同时变化。
- [ ] 详情页改标题后，月历卡片、右栏列表、提醒列表三处文案同步更新。
- [ ] 手机端打开详情即为底部抽屉，不出现桌面侧滑动画。

## 17.8 自动完成（按地区时间）

- **判定**：`occurrence.end + grace <= now`，按 `user_settings.timezone`（IANA）计算；事件是浮动本地时间，跨时区不改变钟点。
- **触发**：应用启动、60s 轮询、`visibilitychange` 回到前台、设置变更后。服务端另有一条每日 00:05 的对账任务，处理长期未打开的用户。
- **范围**：仅今天 / 最近 3 天 / 全部历史，默认仅今天；必须给用户一个「立即整理」的显式入口。
- **可撤销**：批量完成后 6 秒内提供撤销；手动取消勾选要写 `auto_skipped=true`，避免下次又被勾上。
- **审计**：自动完成写入 `event_logs(kind='auto_complete', at, by='system')`，与手动完成区分开。
- **边界**：用户改了事件时间或时区后，必须重新计算"是否已过去"，不能沿用旧的判定结果。

### 验收
- [ ] 把系统时区从 Asia/Shanghai 切到 Europe/London，重启应用后提示时区变化，并按新时区重新判定。
- [ ] 一条 16:30–17:30 的日程在 17:45（宽限 15 分钟）被自动勾选，17:44 不会。
- [ ] 点撤销后，该条保持未完成，且之后不再被自动勾选。
- [ ] 关闭自动完成后，刷新页面不会产生任何自动勾选。

## 17.9 工作集、顺延、速记、复盘（v1.2）

**工作集（Collections）**
- 数据：`collections(id, user_id, name, cat, note)`，事件带 `collection_id`（可空）。
- 页面：左侧集合列表（含完成比例、逾期数），右侧该集合的全量任务，分「待办 / 逾期 / 已完成」三组，按时间升序/降序。
- 删除集合只置空事件的 `collection_id`，不允许级联删除日程。

**顺延（Postpone）**
- 字段：`postpone_count`、`postpone_reason`、`postponed_from`、`postponed_at`。
- 行为：改日期/时间 → `done=false` → 计数 +1；即使该条之前是自动完成的也要取消勾选。
- 必须提供撤销（5 秒）与原因标签；原因参与后续"为什么总在拖"的统计，但不展示给他人。

**一句话速记（Quick Capture）**
- 规则解析：日期、时间、时长、重复、提醒、分类；解析结果实时回显，允许用户在保存前看出错误。
- 重复起始日必须对齐到下一个符合条件的星期；今天已过的时刻顺延到明天。
- 解析失败要有兜底：整句作为标题 + 默认时间，不允许静默丢弃输入。

**复盘卡（Review）**
- 周期：周（周一起）/ 月 / 年；统计口径固定为：完成率、完成件数、投入时长、连续天数、分类占比、每日分布、最忙一天。
- 五种风格共用同一份 `reviewData`，只换模板；卡片 4:5，用容器查询单位 `cqw` 保证缩略图与全尺寸排版一致。
- 正式版要能导出 PNG（`html-to-image`）与生成分享长图。

### 验收
- [ ] 新建工作集后能立刻把已有日程归类；删除集合后日程仍在。
- [ ] 顺延后列表出现"顺延 1"，详情里能看到上次原因；撤销后数字回退。
- [ ] 「每周二四 14:30 学 C 语言 到 11月20日」在周六输入，第一条必须落在下周二。
- [ ] 周/月/年切换后，五张卡片的统计数字同步变化。
- [ ] 五种风格在 320px 缩略宽度下文字不溢出、不重叠。

## 17.10 复盘方法论与工作集修正（v1.3）

**复盘卡必须有"写"的部分**
- 周期绑定方法：周 KISS、月 GRAI、年 年度四问；四格内容存 `reviews(key, score, keep, improve, stop, start)`，键为 `week:YYYY-MM-DD` / `month:YYYY-MM` / `year:YYYY`。
- 未填写时显示**由数据推导的建议**（并标注"建议"），填写后以用户内容为准；不允许自动建议覆盖用户原文。
- 年度复盘提供 20 问清单作为提示。
- 五种视觉风格的卡片都要能容纳这四格，不允许只在某一种风格里支持。

**工作集统计为 0 的根因与修正**
- 根因：旧版本 localStorage 里的事件没有 `collection_id` 字段，新版本按 `collection_id` 统计 → 全部为 0。
- 修正：加载时做一次迁移（缺字段按标题关键词回填）；同时增加「未归类」虚拟集合，任何没有归类的日程都能被看到并手动归类，杜绝"数据凭空消失"。
- 规则：**任何新增的关联字段都要在 load 时做迁移，并提供兜底分组**。

### 验收
- [ ] 用旧版本数据（事件无 collection_id）打开，工作集统计不再全 0，且「未归类」里能看到未归类的日程。
- [ ] 周复盘写 Keep 后切换五种风格，内容都还在；切到月复盘不串内容。
- [ ] 未填写时四格有建议文案并标「建议」，填写后标记消失。

## 17.11 工作集归属的完整链路（v1.4）

上一轮只修了「旧数据没有 collection_id」的迁移，漏了**新建链路**：`addEvent` 没有接收 `collectionId`，且新建弹层没有工作集字段，导致从工作集里"加一件事"后统计仍是 0。

必须同时满足：
1. `createEvent` 的入参包含 `collectionId`（可为空）；重复日程展开时每个实例都继承同一个集合。
2. 新建弹层有「工作集」下拉，默认值 = 当前所在集合（在 `未归类` 里新建则默认为空）。
3. 一句话速记在工作集视图里创建时，同样归入当前集合。
4. 提供「未归类 → 按标题自动归类」的救援入口，处理历史数据。
5. 任何统计数字为 0 时，先检查"这批数据到底有没有写入关联字段"，再查渲染。

### 验收
- [ ] 在某个工作集里点「加一件事」，保存后统计 +1、列表出现该条。
- [ ] 新建弹层里改选其它工作集，保存后归到目标集合。
- [ ] 在「未归类」里点「按标题自动归类」，能被识别的日程一次性归位。

## 17.12 周表重叠布局（v1.6）

- 重叠事件摞成一叠（书堆）：组内未完成在前、已完成沉底；每张压成 40px 书脊，逐张下错 15px、右错 2px，越往下越透明，被压住的不显示文字、只留一条分类色底边。
- 顶层显示 `×N`；悬停把该张"抽出"（transform + opacity + z-index，**不得改变 left/width**），移开归位；点击进详情。
- 完成状态变化用 FLIP 补间，卡片从原位飞到堆底。
- 禁止用 hover 改变布局尺寸：曾因 `left/width` 变化造成 hover 抖动（"疯狂抽"）。

### 验收
- [ ] 3 件事叠在一起时能看到 3 条边和 `×3`，鼠标移上去能完整读出任意一张。
- [ ] 勾选完成后，该卡片以动画沉到堆底，其余上移。
- [ ] 快速在卡片上来回移动鼠标，不出现抖动或闪烁。

## 17.13 多账号与数据隔离（v1.7）

**问题**：注册新账号后，看到的仍是上一个账号的数据。原因是 localStorage 只有一份全局 key `sketchplan.v1`。

**原型做法**：按用户名分库，`sketchplan.v1::<用户名>`。
- 启动顺序必须是：**先读 session → 再 `SP.load(用户名)`**，否则会先加载默认库再纠正。
- 新账号首次进入创建**空库**（events/tasks/plans/collections 全为空，settings 用默认值），不是复制演示数据。
- 老版本只有一份全局库：只有当它的 `settings.name` 与当前登录用户一致时才迁移过来，避免把 A 的数据送给 B。
- 未登录（直接打开）才使用演示库，方便评审。
- 重命名只改显示名，不改分库 key；正式版由服务端 `user_id` 决定，不存在这个问题。

**由此暴露的空数据崩溃（必须全部处理）**：
- 时间轴无计划时 `plans[0]` 未定义 → 需给默认时间窗口；
- 进度页 / 右栏无长期任务时 `tasks[0]` 未定义 → 需空状态；
- 启动的演示提醒 toast 不能写死「英语课」，要取真实的下一条日程。

> 教训：**任何"取数组第一项"的地方，都要先问"空的时候怎么办"**。空账号是最容易漏测的路径。

## 17.14 界面形态切换（v1.8）

- 设置项 `device: auto | desktop | phone`，桌面「我的」与登录页都提供三档切换，偏好本地持久化。
- **实现要点**：不要用两套模板，也不要用 iframe；把移动端媒体查询改写成 `body.mobile` 规则，用 JS 决定是否加 class（`isMobile()` 同时考虑视口与手动偏好）。这是让"布局可被强制"的最低成本方案。
- 电脑上强制手机版：给 `.app` 一个 414px 机身（固定定位 + 圆角 + 阴影），`tabbar/fab/toast/sheet/detail` 全部改为相对机身定位，避免"浮在机身外面"。
- 手机上强制电脑版：三栏 + `zoom` 缩放 + `height: calc(100vh / zoom)`；同时隐藏 toast，避免溢出机身。
- 登录/注册页复用同一个 `data-device` 标记：手机版单列、电脑版两栏。

### 验收
- [ ] 电脑上切「手机版」后，是完整的 414px 机身，底部 Tab 与悬浮按钮都在机身内。
- [ ] 手机上切「电脑版」后，能看到完整三栏（缩放后），不出现横向滚动。
- [ ] 切回「自动」后跟随屏幕，刷新后偏好保持。
