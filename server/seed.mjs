/** 给当前登录用户灌一份演示数据（仅开发环境） */
import { run, uid, nowISO } from './db.mjs';

const pad = n => String(n).padStart(2, '0');
const key = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

const ITEMS = [
  ['09:30', 60, '晨间复盘', 'life', 0],
  ['11:00', 90, '论文写作 · 第三章', 'work', 20],
  ['14:30', 90, 'C 语言 · 链表', 'study', 20],
  ['16:30', 60, '英语课', 'study', 20],
  ['19:00', 60, '健身 · 跑步 5km', 'health', 30],
  ['21:00', 30, '给妈妈打电话', 'life', 10]
];

export function seedFor(userId) {
  const today = new Date();
  let n = 0;
  for (const [start, dur, title, cat, remind] of ITEMS) {
    const sid = uid('se_');
    const [h, m] = start.split(':').map(Number);
    run(`INSERT INTO event_series (id,user_id,title,notes,cat,collection_id,is_floating,timezone,start_date,start_min,dur_min,rrule,until_at,remind_min,created_at)
         VALUES (?,?,?,'',?,NULL,1,'Asia/Shanghai',?,?,?,NULL,NULL,?,?)`,
      sid, userId, title, cat, key(today), h * 60 + m, dur, remind, nowISO());
    const oid = uid('o_');
    run('INSERT INTO event_occurrences (id,series_id,user_id,date,start_min,dur_min,status,postpone_count) VALUES (?,?,?,?,?,?,\'scheduled\',0)',
      oid, sid, userId, key(today), h * 60 + m, dur);
    const fm = h * 60 + m - remind;
    const fd = fm < 0 ? key(addDays(today, -1)) : key(today);
    run(`INSERT OR IGNORE INTO reminders (id,user_id,occurrence_id,offset_min,fire_at,channels,state,attempts,idempotency_key)
         VALUES (?,?,?,?,?, 'inapp','pending',0,?)`,
      uid('r_'), userId, oid, remind, fd + 'T' + pad(Math.floor(((fm % 1440) + 1440) % 1440 / 60)) + ':' + pad(((fm % 1440) + 1440) % 60) + ':00', oid + ':' + remind);
    n++;
  }
  run('INSERT INTO collections (id,user_id,name,cat,note,sort,created_at) VALUES (?,?,?,?,?,?,?)',
    uid('c_'), userId, 'C 语言期末', 'study', '指针 / 结构体 / 树 / 排序', 1, nowISO());
  run('INSERT INTO tasks (id,user_id,title,unit,target,start_date,due_date,cat,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    uid('t_'), userId, '英语阅读 32 篇', '篇', 32, key(today), key(addDays(today, 37)), 'study', nowISO());
  return n + 2;
}
