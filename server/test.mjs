/**
 * 冒烟测试：起服务后运行 node server/test.mjs
 * v1.7.1 起恢复自助注册（只要用户名 + 密码），脚本直接用接口建一次性测试账号。
 */
const BASE = process.env.BASE || 'http://localhost:4310';
let cookie = '';
let pass = 0, fail = 0;

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const sc = res.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name, extra === undefined ? '' : JSON.stringify(extra)); }
}
const pad = n => String(n).padStart(2, '0');
const key = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const today = new Date();
const plus = n => { const d = new Date(today); d.setDate(d.getDate() + n); return key(d); };

const user = 'test_' + Math.random().toString(36).slice(2, 7);
const PW = 'abc12345';

console.log('1. 注册 / 登录');
let r = await call('POST', '/api/auth/register', { username: user, password: PW });
ok('注册返回 201', r.status === 201, r);
ok('拿到会话 Cookie', !!cookie);
ok('注册响应不含邮箱字段', !('email' in ((r.data && r.data.user) || {})), r.data);

r = await call('POST', '/api/auth/register', { username: user, password: PW });
ok('重名注册被拒 409', r.status === 409, r);

r = await call('POST', '/api/auth/register', { username: 'weak_' + user.slice(-4), password: '123' });
ok('弱密码被拒 400', r.status === 400, r);

r = await call('POST', '/api/auth/login', { username: user, password: PW });
ok('登录返回 200', r.status === 200, r);
ok('拿到会话 Cookie', !!cookie);
ok('返回里不含 email 字段', !('email' in (r.data.user || {})), r.data.user);

r = await call('POST', '/api/auth/login', { username: user, password: 'wrong-pass' });
ok('密码错误被拒 401', r.status === 401, r);

console.log('2. 新建日程');
r = await call('POST', '/api/events', { title: '论文 · 第三章', date: key(today), start: '11:00', dur: 90, cat: 'work', remind: 20 });
ok('单次日程 201', r.status === 201 && r.data.occurrences === 1, r);
const singleId = r.data.events[0].id;

r = await call('POST', '/api/events', { title: 'C 语言', date: plus(1), start: '14:30', dur: 90, cat: 'study', remind: 10, rule: 'custom', weekdays: [2, 4], until: plus(21) });
ok('重复日程展开 >1 条', r.status === 201 && r.data.occurrences >= 5, r.data && r.data.occurrences);
const seriesId = r.data.seriesId;

console.log('3. 查询与勾选');
r = await call('GET', `/api/state?from=${key(today)}&to=${plus(30)}`);
const total = r.data.events.length;
ok('state 返回日程', total >= 6, total);
ok('返回工作集字段', Array.isArray(r.data.collections));

r = await call('POST', `/api/events/${singleId}/toggle`);
ok('勾选成功', r.status === 200 && r.data.done === true, r.data);
r = await call('POST', `/api/events/${singleId}/toggle`);
ok('取消勾选', r.status === 200 && r.data.done === false, r.data);

console.log('4. 顺延');
r = await call('POST', `/api/events/${singleId}/postpone`, { date: plus(2), start: '09:00', reason: '时间不够' });
ok('顺延成功', r.status === 200, r);
r = await call('GET', `/api/state?from=${plus(2)}&to=${plus(2)}`);
const moved = r.data.events.find(e => e.id === singleId);
ok('顺延后日期正确', moved && moved.date === plus(2) && moved.start === '09:00' && moved.postponeCount === 1, moved);

console.log('5. 批量排课');
r = await call('POST', '/api/batch', { title: '英语听力', from: plus(1), to: plus(20), weekdays: [1, 3, 5], time: '08:00', dur: 30 });
ok('批量创建', r.status === 201 && r.data.created >= 8, r.data);

console.log('5b. 单次日程改分类（v1.8.0 修复）');
r = await call('PATCH', `/api/events/${singleId}`, { cat: 'health' });
ok('改分类返回 200', r.status === 200, r);
r = await call('GET', `/api/state?from=${plus(2)}&to=${plus(2)}`);
const recat = r.data.events.find(e => e.id === singleId);
ok('改分类已持久化', recat && recat.cat === 'health', recat && recat.cat);

console.log('6. 工作集 / 任务 / 复盘');
r = await call('POST', '/api/collections', { name: 'C 语言期末', cat: 'study', note: '期末' });
const cid = r.data.id;
ok('建工作集', r.status === 201, r);
r = await call('GET', '/api/collections');
ok('工作集列表', r.data.collections.some(c => c.id === cid));

r = await call('POST', '/api/tasks', { title: '英语阅读 32 篇', unit: '篇', target: 32, due: plus(30) });
const tid = r.data.id;
ok('建计划', r.status === 201, r);
await call('POST', `/api/tasks/${tid}/logs`, { value: 3 });
r = await call('POST', `/api/tasks/${tid}/logs`, { value: 2 });
ok('进度累计 5', r.data.total === 5, r.data);

r = await call('PUT', '/api/reviews/week%3A' + plus(0), { score: 4, keep: '保持了晨间复盘', improve: '少排一点' });
ok('保存复盘', r.status === 200, r);
r = await call('GET', '/api/reviews/week%3A' + plus(0));
ok('读取复盘', r.data.review && r.data.review.score === 4, r.data);

console.log('7. 权限与登出');
const savedCookie = cookie; cookie = '';
r = await call('GET', '/api/state');
ok('未登录被拒 401', r.status === 401, r);
cookie = savedCookie;
r = await call('POST', '/api/auth/logout');
ok('登出成功', r.status === 200, r);
r = await call('GET', '/api/me');
ok('登出后 401', r.status === 401, r);

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
