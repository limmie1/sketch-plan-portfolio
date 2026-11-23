/**
 * 提醒投递：单机版用 setInterval 扫描数据库
 * 生产建议改为独立 worker + Redis 队列 + SKIP LOCKED
 *
 * v1.7.0：邮件渠道下线。这里只负责把到点的提醒标记为已投递并写日志，
 * 真正的提示由前端（站内卡片 / 浏览器推送）自己按时间触发。
 */
import { all, run, nowISO } from './db.mjs';

const TICK = Number(process.env.WORKER_TICK_MS || 30000);
const pad = n => String(n).padStart(2, '0');
const localStamp = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

let timer = null;

export function startWorker() {
  if (timer) return;
  timer = setInterval(tick, TICK);
  tick();
  console.log(`提醒 worker 已启动（每 ${TICK / 1000}s 扫描一次）`);
}

export function stopWorker() { if (timer) clearInterval(timer); timer = null; }

export async function tick() {
  const stamp = localStamp(new Date());
  const due = all(
    `SELECT r.*, o.date, o.start_min, s.title, u.username
     FROM reminders r
     JOIN event_occurrences o ON o.id = r.occurrence_id
     JOIN event_series s ON s.id = o.series_id
     JOIN users u ON u.id = r.user_id
     WHERE r.state = 'pending' AND r.fire_at <= ? AND o.status = 'scheduled'
     LIMIT 50`, stamp
  );
  for (const r of due) {
    try {
      // 抢占：先改状态，避免重复投递
      const upd = run("UPDATE reminders SET state='sent', sent_at=?, attempts=attempts+1 WHERE id=? AND state='pending'", nowISO(), r.id);
      if (upd.changes === 0) continue;
      console.log(`[提醒] ${r.username} · ${r.title} · ${r.fire_at}`);
    } catch (e) {
      run("UPDATE reminders SET state='failed', attempts=attempts+1 WHERE id=?", r.id);
      console.warn('[提醒失败]', r.id, e.message);
    }
  }
  // 超过 10 分钟仍未发出的，标记失败（避免堆积）
  run("UPDATE reminders SET state='failed' WHERE state='pending' AND fire_at < ?", localStamp(new Date(Date.now() - 6e5)));
}
