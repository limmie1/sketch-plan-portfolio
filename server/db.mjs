/**
 * 数据层：SQLite（node:sqlite，零依赖）
 * - 时间统一存 ISO 字符串（UTC 或本地墙钟，见各字段注释）
 * - 语句保持接近 ANSI SQL，迁移到 PostgreSQL 时只需替换本文件
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'sketchplan.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA busy_timeout = 3000');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  timezone TEXT DEFAULT 'Asia/Shanghai',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cat TEXT DEFAULT 'study',
  note TEXT DEFAULT '',
  sort INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_collections_user ON collections(user_id);

/* 重复事件：一个系列 + 展开后的实例 */
CREATE TABLE IF NOT EXISTS event_series (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  notes TEXT DEFAULT '',
  cat TEXT DEFAULT 'study',
  collection_id TEXT,
  is_floating INTEGER DEFAULT 1,
  timezone TEXT DEFAULT 'Asia/Shanghai',
  start_date TEXT NOT NULL,      -- 首日 YYYY-MM-DD
  start_min INTEGER NOT NULL,    -- 首日第几分钟
  dur_min INTEGER NOT NULL,
  rrule TEXT,
  until_at TEXT,
  remind_min INTEGER DEFAULT 20,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_series_user ON event_series(user_id);

CREATE TABLE IF NOT EXISTS event_occurrences (
  id TEXT PRIMARY KEY,
  series_id TEXT NOT NULL REFERENCES event_series(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,            -- YYYY-MM-DD（墙钟日期）
  start_min INTEGER NOT NULL,    -- 当天第几分钟
  dur_min INTEGER NOT NULL,
  status TEXT DEFAULT 'scheduled', -- scheduled | done | skipped
  done_at TEXT,
  is_exception INTEGER DEFAULT 0,
  title_override TEXT,
  note_override TEXT,
  date_override TEXT,
  start_override INTEGER,
  dur_override INTEGER,
  postpone_count INTEGER DEFAULT 0,
  postpone_reason TEXT,
  UNIQUE (series_id, date, start_min)
);
CREATE INDEX IF NOT EXISTS idx_occ_user_date ON event_occurrences(user_id, date);

CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  occurrence_id TEXT NOT NULL REFERENCES event_occurrences(id) ON DELETE CASCADE,
  offset_min INTEGER NOT NULL,
  fire_at TEXT NOT NULL,
  channels TEXT DEFAULT 'inapp',
  state TEXT DEFAULT 'pending',  -- pending | sent | failed | cancelled
  attempts INTEGER DEFAULT 0,
  sent_at TEXT,
  idempotency_key TEXT UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_rem_state ON reminders(state, fire_at);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  unit TEXT DEFAULT '次',
  target REAL NOT NULL,
  start_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  cat TEXT DEFAULT 'study',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_logs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  value REAL DEFAULT 1,
  note TEXT DEFAULT '',
  logged_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reviews (
  user_id TEXT NOT NULL,
  period_key TEXT NOT NULL,      -- week:2026-10-12 / month:2026-10 / year:2026
  score INTEGER DEFAULT 0,
  keep TEXT DEFAULT '',
  improve TEXT DEFAULT '',
  stop_text TEXT DEFAULT '',
  start_text TEXT DEFAULT '',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, period_key)
);

CREATE TABLE IF NOT EXISTS settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  json TEXT NOT NULL
);
`;

db.exec(SCHEMA);

export const all = (sql, ...p) => db.prepare(sql).all(...p);
export const get = (sql, ...p) => db.prepare(sql).get(...p);
export const run = (sql, ...p) => db.prepare(sql).run(...p);

/* ---------------- 迁移 ---------------- */

/**
 * v1.7.0：邮箱相关功能整体下线。
 * 老库里 users 还有 email / email_verified_at，verify_tokens 表也留着，
 * 这里一次性重建 users 表把它们去掉。幂等：已经迁过就直接返回。
 */
function migrateDropEmail() {
  const cols = all('PRAGMA table_info(users)').map(c => c.name);
  if (!cols.includes('email')) {
    run('DROP TABLE IF EXISTS verify_tokens');
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const snapshot = path.join(DATA_DIR, `before-drop-email-${stamp}.db`);
  db.exec(`VACUUM INTO '${snapshot.replace(/'/g, "''")}'`);
  console.log('[迁移] 迁移前快照 →', path.basename(snapshot));

  const total = all('SELECT COUNT(*) AS n FROM users')[0].n;

  // 重建父表必须先关外键，否则 DROP TABLE users 会级联清空所有子表
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    db.exec('BEGIN');
    db.exec(`CREATE TABLE users_new (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      pass_hash TEXT NOT NULL,
      timezone TEXT DEFAULT 'Asia/Shanghai',
      created_at TEXT NOT NULL
    )`);
    db.exec(`INSERT INTO users_new (id, username, pass_hash, timezone, created_at)
             SELECT id, username, pass_hash, COALESCE(timezone, 'Asia/Shanghai'), created_at FROM users`);
    db.exec('DROP TABLE users');
    db.exec('ALTER TABLE users_new RENAME TO users');
    db.exec('DROP TABLE IF EXISTS verify_tokens');
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    console.error('[迁移] 失败，数据库保持原样：', e.message);
    throw e;
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }

  const bad = all('PRAGMA foreign_key_check');
  if (bad.length) console.warn('[迁移] 外键检查发现异常：', bad.slice(0, 3));
  const after = all('SELECT COUNT(*) AS n FROM users')[0].n;
  console.log(`[迁移] 已移除 users.email / email_verified_at 与 verify_tokens 表（账号 ${total} → ${after}）`);
}

migrateDropEmail();

/**
 * v1.8.0：日程要能单独改分类。
 * event_series.cat 是整条系列的分类，改单次实例需要一份覆盖值，
 * 之前缺这个字段，PATCH 传 cat 进来也没有地方存，于是「改分类」永远被还原。
 * 幂等：列已存在就直接返回。
 */
function migrateCatOverride() {
  const cols = all('PRAGMA table_info(event_occurrences)').map(c => c.name);
  if (cols.includes('cat_override')) return;
  run('ALTER TABLE event_occurrences ADD COLUMN cat_override TEXT');
  console.log('[迁移] event_occurrences 增加 cat_override（单次日程可单独改分类）');
}

migrateCatOverride();

export function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}

export const uid = (prefix = '') =>
  prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const nowISO = () => new Date().toISOString();
