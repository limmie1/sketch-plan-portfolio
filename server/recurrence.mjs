/**
 * 重复规则：RFC 5545 的最小子集
 * 支持 FREQ=DAILY|WEEKLY|MONTHLY、INTERVAL、BYDAY、COUNT、UNTIL
 * 前端产生的规则不会超过这个范围；完整实现可换 rrule 库。
 */

const WD = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

export function parseRRule(text) {
  if (!text) return null;
  const out = {};
  String(text).replace(/^RRULE:/i, '').split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i < 0) return;
    out[part.slice(0, i).trim().toUpperCase()] = part.slice(i + 1).trim();
  });
  if (!out.FREQ) return null;
  return {
    freq: out.FREQ.toUpperCase(),
    interval: Math.max(1, Number(out.INTERVAL) || 1),
    byday: out.BYDAY ? out.BYDAY.split(',').map(x => WD[x.trim().toUpperCase().slice(-2)]).filter(v => v !== undefined) : null,
    count: out.COUNT ? Number(out.COUNT) : null,
    until: out.UNTIL ? normalizeUntil(out.UNTIL) : null
  };
}

function normalizeUntil(v) {
  if (/^\d{8}$/.test(v)) return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
  return v.slice(0, 10);
}

const pad = n => String(n).padStart(2, '0');
const toKey = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const parseKey = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const dayDiff = (a, b) => Math.round((b - a) / 864e5);

/**
 * 展开一个系列在 [from, to] 内的日期
 * @returns {string[]} YYYY-MM-DD 列表
 */
export function expandDates({ startDate, rrule, until }, from, to, cap = 4000) {
  const rule = parseRRule(rrule);
  const start = parseKey(startDate);
  const end = parseKey(to);
  const hard = rule && rule.until ? (parseKey(rule.until) < end ? parseKey(rule.until) : end) : end;
  if (!rule) return (startDate >= from && startDate <= to) ? [startDate] : [];

  const baseDow = start.getDay();
  const baseDom = start.getDate();
  const out = [];
  let matched = 0;
  let d = start;
  // guard 只防死循环（异常输入），不限制合法结果；上限按日期跨度放大，
  // 覆盖「长期重复（如每天重复一年）」这类正常场景。
  let guard = 0;
  const daySpan = Math.max(1, dayDiff(start, hard) + 1);
  const guardCap = Math.min(400000, Math.max(4000, daySpan * 2));

  while (d <= hard && guard++ < guardCap) {
    let hit = false;
    if (rule.freq === 'DAILY') {
      hit = dayDiff(start, d) % rule.interval === 0;
    } else if (rule.freq === 'WEEKLY') {
      const dim = d.getDay();
      const weekDiff = Math.floor(dayDiff(start, d) / 7);
      const daysOk = rule.byday ? rule.byday.includes(dim) : dim === baseDow;
      hit = daysOk && weekDiff % rule.interval === 0;
    } else if (rule.freq === 'MONTHLY') {
      const months = (d.getFullYear() - start.getFullYear()) * 12 + (d.getMonth() - start.getMonth());
      hit = d.getDate() === baseDom && months % rule.interval === 0;
    }
    if (hit) {
      matched++;
      if (rule.count && matched > rule.count) break;
      const key = toKey(d);
      if (key >= from && key <= to) out.push(key);
      if (out.length >= cap) break;
    }
    d = addDays(d, 1);
  }
  return out;
}

/** 把分钟数转成 HH:mm */
export const hhmm = min => pad(Math.floor(min / 60) % 24) + ':' + pad(min % 60);
export const toMin = hhmmStr => {
  const [h, m] = String(hhmmStr || '09:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
