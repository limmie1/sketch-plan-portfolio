/**
 * Sketch Plan API · 零依赖 Node 服务
 * 运行：node server/index.mjs   （默认 http://localhost:4310）
 * 环境变量见 .env.example
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { all, get, run, tx, uid, nowISO } from './db.mjs';
import * as A from './auth.mjs';
import { expandDates, hhmm, toMin } from './recurrence.mjs';

const PORT = Number(process.env.PORT || 4310);
const ROOT = process.cwd();
const PROD = process.env.NODE_ENV === 'production';
const SECURE_COOKIE = process.env.COOKIE_SECURE !== undefined
  ? process.env.COOKIE_SECURE === '1'
  : PROD;

/* ---------------- 工具 ---------------- */
function json(res, code, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}
const bad = (res, code, msg) => json(res, code, { error: msg });

function readBody(req, limit = 1 << 20) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new Error('payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new Error('invalid json')); }
    });
    req.on('error', reject);
  });
}

const pad = n => String(n).padStart(2, '0');
const dateKey = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const TZ = process.env.TZ_DEFAULT || 'Asia/Shanghai';

/* 生成 RRULE 文本 */
function buildRRule({ rule, weekdays, until }) {
  if (!rule || rule === 'none') return null;
  const byday = (weekdays || []).map(n => ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][Number(n)]);
  let out;
  if (rule === 'daily') out = 'FREQ=DAILY';
  else if (rule === 'weekdays') out = 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
  else if (rule === 'weekly') out = 'FREQ=WEEKLY';
  else out = 'FREQ=WEEKLY' + (byday.length ? ';BYDAY=' + byday.join(',') : '');
  if (until) out += ';UNTIL=' + String(until).replace(/-/g, '');
  return out;
}

/* 把系列展开成实例 + 提醒 */
function materialize(series, from, to) {
  const dates = expandDates({ startDate: series.start_date, rrule: series.rrule, until: series.until_at }, from, to);
  const created = [];
  for (const date of dates) {
    const exists = get(
      'SELECT id FROM event_occurrences WHERE series_id = ? AND date = ? AND start_min = ?',
      series.id, date, series.start_min
    );
    if (exists) { created.push(exists.id); continue; }
    const occId = uid('o_');
    run(
      `INSERT INTO event_occurrences (id, series_id, user_id, date, start_min, dur_min, status, postpone_count)
       VALUES (?,?,?,?,?,?, 'scheduled', 0)`,
      occId, series.id, series.user_id, date, series.start_min, series.dur_min
    );
    if (series.remind_min !== null && series.remind_min !== undefined) {
      const fireMin = series.start_min - series.remind_min;
      const fireDate = fireMin < 0 ? dateKey(addDays(new Date(date + 'T00:00:00'), -1)) : date;
      const fireAt = fireDate + 'T' + hhmm(((fireMin % 1440) + 1440) % 1440) + ':00';
      run(
        `INSERT OR IGNORE INTO reminders (id, user_id, occurrence_id, offset_min, fire_at, channels, state, attempts, idempotency_key)
         VALUES (?,?,?,?,?, 'inapp', 'pending', 0, ?)`,
        uid('r_'), series.user_id, occId, series.remind_min, fireAt,
        `${occId}:${series.remind_min}`
      );
    }
    created.push(occId);
  }
  return created;
}

const occRow = r => ({
  id: r.id,
  seriesId: r.series_id,
  title: r.title_override || r.title,
  date: r.date_override || r.date,
  start: hhmm(r.start_override ?? r.start_min),
  dur: r.dur_override ?? r.dur_min,
  cat: r.cat_override || r.cat,
  collectionId: r.collection_id || null,
  done: r.status === 'done',
  remind: r.remind_min,
  postponeCount: r.postpone_count || 0,
  postponeReason: r.postpone_reason || ''
});

const OCC_SELECT = `
  SELECT o.*, s.title, s.cat, s.collection_id, s.remind_min, s.timezone
  FROM event_occurrences o JOIN event_series s ON s.id = o.series_id
  WHERE o.user_id = ? AND s.deleted_at IS NULL AND o.status <> 'skipped'`;

function listEvents(userId, from, to) {
  const rows = all(
    OCC_SELECT + ` AND COALESCE(o.date_override, o.date) BETWEEN ? AND ? ORDER BY date, start_min`,
    userId, from, to
  );
  return rows.map(occRow);
}

/* ---------------- 路由 ---------------- */
async function handleApi(req, res, url) {
  const p = url.pathname.replace(/\/+$/, '');
  const m = req.method;

  /* 健康检查 */
  if (p === '/healthz') return json(res, 200, { ok: true, ts: nowISO() });

  /* --- 注册（v1.7.1 起恢复，只收用户名 + 密码，不再收集邮箱） --- */
  if (p === '/api/auth/register') {
    if (m !== 'POST') return bad(res, 405, 'Method Not Allowed');
    const ip = req.socket.remoteAddress || 'x';
    if (!A.rateLimit('reg:' + ip, 20, 3600e3)) return bad(res, 429, '注册太频繁，请稍后再试');
    const { username, password } = await readBody(req);
    const name = String(username || '').trim();
    if (!A.RE_USER.test(name)) return bad(res, 400, '用户名 3–20 位，只能中文、字母、数字、下划线');
    if (!A.passOk(password)) return bad(res, 400, '密码至少 8 位，且包含字母和数字');
    if (get('SELECT id FROM users WHERE username = ?', name)) return bad(res, 409, '这个用户名已经被占用了');

    const id = uid('u_');
    run('INSERT INTO users (id, username, pass_hash, timezone, created_at) VALUES (?,?,?,?,?)',
      id, name, A.hashPassword(password), TZ, nowISO());
    const sess = A.createSession(id, req);
    return json(res, 201, { user: { id, username: name, timezone: TZ } },
      { 'Set-Cookie': A.sessionCookie(sess, SECURE_COOKIE) });
  }

  /* --- 登录 --- */
  if (p === '/api/auth/login' && m === 'POST') {
    const ip = req.socket.remoteAddress || 'x';
    const { username, password } = await readBody(req);
    if (!A.rateLimit('login:' + ip, 10, 600e3)) return bad(res, 429, '尝试太频繁，请 10 分钟后再试');
    const u = get('SELECT * FROM users WHERE username = ?', String(username || ''));
    if (!u || !A.verifyPassword(password, u.pass_hash)) return bad(res, 401, '用户名或密码不对');
    const sess = A.createSession(u.id, req);
    return json(res, 200, { user: { id: u.id, username: u.username } },
      { 'Set-Cookie': A.sessionCookie(sess, SECURE_COOKIE) });
  }

  if (p === '/api/auth/logout' && m === 'POST') {
    A.destroySession(req);
    return json(res, 200, { ok: true }, { 'Set-Cookie': A.clearCookie() });
  }

  /* 之后所有接口都需要登录 */
  const user = A.currentUser(req);
  if (!user) return bad(res, 401, '未登录');

  if (p === '/api/me' && m === 'GET') {
    const st = get('SELECT json FROM settings WHERE user_id = ?', user.id);
    return json(res, 200, {
      user: { id: user.id, username: user.username, timezone: user.timezone },
      settings: st ? JSON.parse(st.json) : null
    });
  }

  if (p === '/api/settings' && m === 'PUT') {
    const body = await readBody(req);
    run('INSERT INTO settings (user_id, json) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET json = excluded.json',
      user.id, JSON.stringify(body || {}));
    return json(res, 200, { ok: true });
  }

  /* 一次性拉取整个界面需要的数据 */
  if (p === '/api/state' && m === 'GET') {
    const today = dateKey(new Date());
    const from = url.searchParams.get('from') || today;
    const to = url.searchParams.get('to') || dateKey(addDays(new Date(), 730));
    const st = get('SELECT json FROM settings WHERE user_id = ?', user.id);
    return json(res, 200, {
      user: { id: user.id, username: user.username, timezone: user.timezone },
      settings: st ? JSON.parse(st.json) : null,
      collections: all('SELECT * FROM collections WHERE user_id = ? ORDER BY sort, created_at', user.id)
        .map(c => ({ id: c.id, name: c.name, cat: c.cat, note: c.note })),
      events: listEvents(user.id, from, to),
      tasks: all('SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at', user.id).map(t => ({
        id: t.id, title: t.title, unit: t.unit, target: t.target,
        start: t.start_date, due: t.due_date, cat: t.cat
      })),
      taskLogs: all('SELECT * FROM task_logs WHERE user_id = ? ORDER BY logged_at', user.id),
      reviews: all('SELECT * FROM reviews WHERE user_id = ?', user.id)
    });
  }

  /* --- 事件 --- */
  if (p === '/api/events' && m === 'GET') {
    const from = url.searchParams.get('from') || dateKey(new Date());
    const to = url.searchParams.get('to') || dateKey(addDays(new Date(), 730));
    return json(res, 200, { events: listEvents(user.id, from, to) });
  }

  if (p === '/api/events' && m === 'POST') {
    const b = await readBody(req);
    if (!b.title || !b.date) return bad(res, 400, '标题和日期是必填的');
    const dur = Math.max(5, Number(b.dur) || 60);
    const startMin = toMin(b.start);
    const rrule = buildRRule({ rule: b.rule, weekdays: b.weekdays, until: b.until });
    const id = uid('se_');

    const n = tx(() => {
      run(
        `INSERT INTO event_series
         (id, user_id, title, notes, cat, collection_id, is_floating, timezone, start_date, start_min, dur_min, rrule, until_at, remind_min, created_at)
         VALUES (?,?,?,?,?,?,1,?,?,?,?,?,?,?,?)`,
        id, user.id, String(b.title).slice(0, 200), b.notes || '', b.cat || 'study',
        b.collectionId || null, user.timezone || TZ,
        b.date, startMin, dur, rrule, b.until || null,
        b.remind === undefined || b.remind === null ? 20 : Number(b.remind), nowISO()
      );
      const end = b.until || dateKey(addDays(new Date(b.date + 'T00:00:00'), 730));
      const series = get('SELECT * FROM event_series WHERE id = ?', id);
      return materialize(series, b.date, end);
    });
    return json(res, 201, { seriesId: id, occurrences: n.length, events: listEvents(user.id, b.date, b.until || dateKey(addDays(new Date(b.date + 'T00:00:00'), 730))) });
  }

  const mMatch = p.match(/^\/api\/events\/([^/]+)(\/[a-z]+)?$/);
  if (mMatch) {
    const occId = mMatch[1];
    const action = mMatch[2] || '';
    const occ = get('SELECT * FROM event_occurrences WHERE id = ? AND user_id = ?', occId, user.id);
    if (!occ) return bad(res, 404, '日程不存在');

    if (action === '/toggle' && m === 'POST') {
      const next = occ.status === 'done' ? 'scheduled' : 'done';
      run('UPDATE event_occurrences SET status = ?, done_at = ? WHERE id = ?', next, next === 'done' ? nowISO() : null, occId);
      return json(res, 200, { id: occId, done: next === 'done' });
    }

    if (action === '/postpone' && m === 'POST') {
      const b = await readBody(req);
      if (!b.date) return bad(res, 400, '需要顺延到哪一天');
      run(
        `UPDATE event_occurrences
         SET date = ?, start_min = ?, status = 'scheduled', done_at = NULL,
             postpone_count = postpone_count + 1, postpone_reason = ?, is_exception = 1
         WHERE id = ?`,
        b.date, b.start ? toMin(b.start) : occ.start_min, String(b.reason || '').slice(0, 120), occId
      );
      // 提醒跟着改
      const ser = get('SELECT remind_min FROM event_series WHERE id = ?', occ.series_id);
      run('DELETE FROM reminders WHERE occurrence_id = ?', occId);
      if (ser && ser.remind_min !== null) {
        const sm = b.start ? toMin(b.start) : occ.start_min;
        const fm = sm - ser.remind_min;
        const fd = fm < 0 ? dateKey(addDays(new Date(b.date + 'T00:00:00'), -1)) : b.date;
        run(`INSERT OR IGNORE INTO reminders (id,user_id,occurrence_id,offset_min,fire_at,channels,state,attempts,idempotency_key)
             VALUES (?,?,?,?,?, 'inapp','pending',0,?)`,
          uid('r_'), user.id, occId, ser.remind_min, fd + 'T' + hhmm(((fm % 1440) + 1440) % 1440) + ':00', `${occId}:${ser.remind_min}:p${Date.now()}`);
      }
      return json(res, 200, { ok: true });
    }

    if (m === 'PATCH') {
      const b = await readBody(req);
      const sets = [], vals = [];
      const map = { title: 'title_override', notes: 'note_override', cat: 'cat_override' };
      for (const k of Object.keys(map)) {
        if (b[k] !== undefined) { sets.push(`${map[k]} = ?`); vals.push(String(b[k])); }
      }
      if (b.date !== undefined) { sets.push('date_override = ?'); vals.push(b.date); }
      if (b.start !== undefined) { sets.push('start_override = ?'); vals.push(toMin(b.start)); }
      if (b.dur !== undefined) { sets.push('dur_override = ?'); vals.push(Number(b.dur)); }
      if (!sets.length) return bad(res, 400, '没有要修改的字段');
      sets.push('is_exception = 1');
      run(`UPDATE event_occurrences SET ${sets.join(', ')} WHERE id = ?`, ...vals, occId);
      // 单次修改后同步提醒时间
      if (b.date !== undefined || b.start !== undefined) {
        const cur = get('SELECT * FROM event_occurrences WHERE id = ?', occId);
        run('DELETE FROM reminders WHERE occurrence_id = ?', occId);
        const ser = get('SELECT remind_min FROM event_series WHERE id = ?', occ.series_id);
        if (ser && ser.remind_min !== null) {
          const sm = cur.start_override ?? cur.start_min;
          const dt = cur.date_override || cur.date;
          const fm = sm - ser.remind_min;
          const fd = fm < 0 ? dateKey(addDays(new Date(dt + 'T00:00:00'), -1)) : dt;
          run(`INSERT OR IGNORE INTO reminders (id,user_id,occurrence_id,offset_min,fire_at,channels,state,attempts,idempotency_key)
               VALUES (?,?,?,?,?, 'inapp','pending',0,?)`,
            uid('r_'), user.id, occId, ser.remind_min, fd + 'T' + hhmm(((fm % 1440) + 1440) % 1440) + ':00', `${occId}:${ser.remind_min}:m${Date.now()}`);
        }
      }
      return json(res, 200, { ok: true });
    }

    if (m === 'DELETE') {
      // 删除单次：把该实例标记为 skipped（保留系列）
      run(`UPDATE event_occurrences SET status = 'skipped' WHERE id = ?`, occId);
      run('DELETE FROM reminders WHERE occurrence_id = ?', occId);
      return json(res, 200, { ok: true });
    }
  }

  /* 系列级删除（整个重复规则） */
  const sMatch = p.match(/^\/api\/series\/([^/]+)$/);
  if (sMatch && m === 'DELETE') {
    const sid = sMatch[1];
    const s = get('SELECT id FROM event_series WHERE id = ? AND user_id = ?', sid, user.id);
    if (!s) return bad(res, 404, '系列不存在');
    tx(() => {
      run('DELETE FROM reminders WHERE occurrence_id IN (SELECT id FROM event_occurrences WHERE series_id = ?)', sid);
      run('DELETE FROM event_occurrences WHERE series_id = ?', sid);
      run("UPDATE event_series SET deleted_at = ? WHERE id = ?", nowISO(), sid);
    });
    return json(res, 200, { ok: true });
  }

  /* 批量排课 */
  if (p === '/api/batch' && m === 'POST') {
    const b = await readBody(req);
    if (!b.title || !b.from || !b.to || !Array.isArray(b.weekdays) || !b.weekdays.length) {
      return bad(res, 400, '标题、起止日期、星期都是必填的');
    }
    const make = buildRRule({ rule: 'custom', weekdays: b.weekdays, until: b.to });
    const id = uid('se_');
    const count = tx(() => {
      run(`INSERT INTO event_series
        (id,user_id,title,notes,cat,collection_id,is_floating,timezone,start_date,start_min,dur_min,rrule,until_at,remind_min,created_at)
        VALUES (?,?,?,?,?,?,1,?,?,?,?,?,?,?,?)`,
        id, user.id, String(b.title).slice(0, 200), '', b.cat || 'study', b.collectionId || null,
        user.timezone || TZ, b.from, toMin(b.time), Math.max(5, Number(b.dur) || 90), make, b.to,
        b.remind === undefined ? 20 : Number(b.remind), nowISO());
      const series = get('SELECT * FROM event_series WHERE id = ?', id);
      return materialize(series, b.from, b.to).length;
    });
    return json(res, 201, { seriesId: id, created: count });
  }

  /* --- 工作集 --- */
  if (p === '/api/collections' && m === 'GET') {
    return json(res, 200, { collections: all('SELECT * FROM collections WHERE user_id = ? ORDER BY sort, created_at', user.id) });
  }
  if (p === '/api/collections' && m === 'POST') {
    const b = await readBody(req);
    if (!b.name) return bad(res, 400, '名称必填');
    const id = uid('c_');
    run('INSERT INTO collections (id,user_id,name,cat,note,sort,created_at) VALUES (?,?,?,?,?,?,?)',
      id, user.id, String(b.name).slice(0, 60), b.cat || 'study', b.note || '', Date.now() % 100000, nowISO());
    return json(res, 201, { id });
  }
  const cMatch = p.match(/^\/api\/collections\/([^/]+)$/);
  if (cMatch) {
    const cid = cMatch[1];
    const c = get('SELECT * FROM collections WHERE id = ? AND user_id = ?', cid, user.id);
    if (!c) return bad(res, 404, '工作集不存在');
    if (m === 'PATCH') {
      const b = await readBody(req);
      run('UPDATE collections SET name = ?, note = ?, cat = ? WHERE id = ?',
        b.name ?? c.name, b.note ?? c.note, b.cat ?? c.cat, cid);
      return json(res, 200, { ok: true });
    }
    if (m === 'DELETE') {
      tx(() => {
        run('UPDATE event_series SET collection_id = NULL WHERE collection_id = ? AND user_id = ?', cid, user.id);
        run('DELETE FROM collections WHERE id = ?', cid);
      });
      return json(res, 200, { ok: true });
    }
  }

  /* --- 长期任务 --- */
  if (p === '/api/tasks' && m === 'GET') {
    return json(res, 200, {
      tasks: all('SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at', user.id),
      logs: all('SELECT * FROM task_logs WHERE user_id = ? ORDER BY logged_at', user.id)
    });
  }
  if (p === '/api/tasks' && m === 'POST') {
    const b = await readBody(req);
    if (!b.title || !b.target) return bad(res, 400, '标题和目标量必填');
    const id = uid('t_');
    run('INSERT INTO tasks (id,user_id,title,unit,target,start_date,due_date,cat,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      id, user.id, String(b.title).slice(0, 100), b.unit || '次', Number(b.target),
      b.start || dateKey(new Date()), b.due || dateKey(addDays(new Date(), 30)), b.cat || 'study', nowISO());
    return json(res, 201, { id });
  }
  const tMatch = p.match(/^\/api\/tasks\/([^/]+)\/logs$/);
  if (tMatch && m === 'POST') {
    const tid = tMatch[1];
    const t = get('SELECT * FROM tasks WHERE id = ? AND user_id = ?', tid, user.id);
    if (!t) return bad(res, 404, '计划不存在');
    const b = await readBody(req);
    run('INSERT INTO task_logs (id,task_id,user_id,value,note,logged_at) VALUES (?,?,?,?,?,?)',
      uid('l_'), tid, user.id, Number(b.value ?? 1), b.note || '', nowISO());
    const sum = get('SELECT COALESCE(SUM(value),0) AS s FROM task_logs WHERE task_id = ?', tid).s;
    return json(res, 201, { total: sum, target: t.target });
  }

  /* 单个计划：修改内容 / 删除 */
  const tkMatch = p.match(/^\/api\/tasks\/([^/]+)$/);
  if (tkMatch && (m === 'PATCH' || m === 'DELETE')) {
    const tid = tkMatch[1];
    const t = get('SELECT * FROM tasks WHERE id = ? AND user_id = ?', tid, user.id);
    if (!t) return bad(res, 404, '计划不存在');

    if (m === 'PATCH') {
      const b = await readBody(req);
      const map = { title: 'title', unit: 'unit', start: 'start_date', due: 'due_date', cat: 'cat' };
      const sets = [], vals = [];
      for (const k of Object.keys(map)) {
        if (b[k] !== undefined) { sets.push(`${map[k]} = ?`); vals.push(String(b[k])); }
      }
      if (b.target !== undefined) {
        const n = Number(b.target);
        if (!Number.isFinite(n) || n < 1) return bad(res, 400, '目标量要是大于 0 的数字');
        sets.push('target = ?'); vals.push(Math.floor(n));
      }
      if (!sets.length) return bad(res, 400, '没有要修改的字段');
      run(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`, ...vals, tid);
      return json(res, 200, { ok: true });
    }

    /* DELETE：连同该计划的所有打卡记录一起删（不留孤儿数据） */
    tx(() => {
      run('DELETE FROM task_logs WHERE task_id = ? AND user_id = ?', tid, user.id);
      run('DELETE FROM tasks WHERE id = ? AND user_id = ?', tid, user.id);
    });
    return json(res, 200, { ok: true });
  }

  /* --- 复盘 --- */
  const rMatch = p.match(/^\/api\/reviews\/(.+)$/);
  if (rMatch) {
    const key = decodeURIComponent(rMatch[1]);
    if (m === 'GET') return json(res, 200, { review: get('SELECT * FROM reviews WHERE user_id = ? AND period_key = ?', user.id, key) || null });
    if (m === 'PUT') {
      const b = await readBody(req);
      run(`INSERT INTO reviews (user_id, period_key, score, keep, improve, stop_text, start_text, updated_at)
           VALUES (?,?,?,?,?,?,?,?)
           ON CONFLICT(user_id, period_key) DO UPDATE SET
             score = excluded.score, keep = excluded.keep, improve = excluded.improve,
             stop_text = excluded.stop_text, start_text = excluded.start_text, updated_at = excluded.updated_at`,
        user.id, key, Number(b.score || 0), b.keep || '', b.improve || '', b.stop || '', b.start || '', nowISO());
      return json(res, 200, { ok: true });
    }
  }

  /* 开发用：给自己灌一份演示数据（生产环境禁用） */
  if (p === '/api/dev/seed' && m === 'POST' && !PROD) {
    const seed = await import('./seed.mjs');
    const n = seed.seedFor(user.id);
    return json(res, 200, { ok: true, events: n });
  }

  return bad(res, 404, '没有这个接口');
}

/* ---------------- 静态文件 ---------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.map': 'application/json',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

const STATIC_ALLOW = /^\/(index\.html|auth\.html|favicon\.ico|manifest\.webmanifest|robots\.txt|assets\/[A-Za-z0-9._-]+)$/;

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/') rel = '/index.html';
  if (!STATIC_ALLOW.test(rel)) return notFound(res);   // 白名单之外一律 404
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) return notFound(res);
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return notFound(res);
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
    });
    fs.createReadStream(file).pipe(res);
  });
}
function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404');
}

/* ---------------- 启动 ---------------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  try {
    if (url.pathname.startsWith('/api/') || url.pathname === '/healthz') {
      await handleApi(req, res, url);
      return;
    }
    serveStatic(req, res, url.pathname);
  } catch (e) {
    if (String(e.message).includes('json')) return bad(res, 400, '请求体不是合法 JSON');
    console.error('[500]', req.method, url.pathname, e);
    if (!res.headersSent) bad(res, 500, '服务器开小差了');
    else res.end();
  }
});

server.listen(PORT, () => {
  console.log(`Sketch Plan API  →  http://localhost:${PORT}`);
  console.log(`  静态目录: ${ROOT}`);
  console.log(`  环境: ${PROD ? 'production' : 'development'}`);
});

/* 提醒投递 worker（同进程，单机版；未来换 Redis + BullMQ） */
import('./worker.mjs').then(w => w.startWorker()).catch(e => console.warn('worker 未启动:', e.message));
