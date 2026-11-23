/**
 * 账号管理 CLI（v1.7.0 起替代「自助注册」和「邮箱改密」）
 *
 *   node server/users.mjs list
 *   node server/users.mjs add <用户名> [密码]
 *   node server/users.mjs passwd <用户名> [密码]
 *   node server/users.mjs del <用户名> --yes
 *
 * 在容器里跑：docker compose exec -T app node server/users.mjs list
 * 密码不传时会提示隐藏输入；非交互环境（无 TTY）则自动生成一个随机密码并打印一次。
 */
import crypto from 'node:crypto';
import { all, get, run, tx, uid, nowISO } from './db.mjs';
import { hashPassword, passOk, RE_USER } from './auth.mjs';

const USER_TABLES = [
  'sessions', 'collections', 'event_series', 'event_occurrences',
  'reminders', 'tasks', 'task_logs', 'reviews', 'settings'
];

function die(msg) {
  console.error('✗ ' + msg);
  process.exit(1);
}

function askHidden(question) {
  return new Promise(resolve => {
    const stdin = process.stdin, stdout = process.stdout;
    stdout.write(question);
    let buf = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = ch => {
      if (ch === '\r' || ch === '\n' || ch === '\u0004') {
        stdin.setRawMode(false); stdin.pause(); stdin.removeListener('data', onData);
        stdout.write('\n'); resolve(buf);
      } else if (ch === '\u0003') {
        stdout.write('\n'); process.exit(1);
      } else if (ch === '\u007f' || ch === '\b') {
        if (buf) { buf = buf.slice(0, -1); stdout.write('\b \b'); }
      } else {
        buf += ch; stdout.write('*');
      }
    };
    stdin.on('data', onData);
  });
}

function randomPass() {
  const abc = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 12; i++) s += abc[crypto.randomInt(abc.length)];
  return s + '7a';   // 兜底保证含字母和数字
}

async function resolvePass(given) {
  if (given) return { pw: given, generated: false };
  if (process.stdin.isTTY) {
    const a = await askHidden('密码（至少 8 位，含字母和数字）: ');
    const b = await askHidden('再输一次: ');
    if (a !== b) die('两次输入不一致');
    return { pw: a, generated: false };
  }
  return { pw: randomPass(), generated: true };
}

function checkPass(pw) {
  if (!passOk(pw)) die('密码至少 8 位，且同时包含字母和数字');
}

const [cmd, name, ...rest] = process.argv.slice(2);

if (!cmd || ['-h', '--help', 'help'].includes(cmd)) {
  console.log(`Sketch Plan 账号管理

  node server/users.mjs list                列出所有账号
  node server/users.mjs add <用户名> [密码]  新建账号
  node server/users.mjs passwd <用户名> [密码] 重置密码
  node server/users.mjs del <用户名> --yes    删除账号（连同其全部数据）

用户名 3–20 位，可用中文、字母、数字、下划线。`);
  process.exit(0);
}

if (cmd === 'list') {
  const rows = all(`SELECT u.id, u.username, u.timezone, u.created_at,
                           (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id) AS sessions,
                           (SELECT COUNT(*) FROM event_occurrences o WHERE o.user_id = u.id) AS events
                    FROM users u ORDER BY u.created_at`);
  if (!rows.length) die('还没有任何账号，用 add 建一个');
  console.log('用户名'.padEnd(18) + '时区'.padEnd(16) + '日程数'.padEnd(8) + '创建时间');
  console.log('-'.repeat(64));
  for (const r of rows) {
    console.log(
      String(r.username).padEnd(18) +
      String(r.timezone || '-').padEnd(16) +
      String(r.events).padEnd(8) +
      String(r.created_at).replace('T', ' ').slice(0, 16)
    );
  }
  console.log(`\n共 ${rows.length} 个账号`);
  process.exit(0);
}

if (cmd === 'add') {
  if (!name) die('缺少用户名。用法：add <用户名> [密码]');
  if (!RE_USER.test(name)) die('用户名 3–20 位，只能中文、字母、数字、下划线');
  if (get('SELECT id FROM users WHERE username = ?', name)) die(`「${name}」已存在`);

  const { pw, generated } = await resolvePass(rest[0]);
  checkPass(pw);
  run('INSERT INTO users (id, username, pass_hash, timezone, created_at) VALUES (?,?,?,?,?)',
    uid('u_'), name, hashPassword(pw), process.env.TZ || 'Asia/Shanghai', nowISO());

  console.log(`✓ 已创建账号「${name}」`);
  if (generated) console.log(`  随机密码：${pw}   ← 只显示这一次，请立刻保存`);
  process.exit(0);
}

if (cmd === 'passwd') {
  if (!name) die('缺少用户名。用法：passwd <用户名> [密码]');
  const u = get('SELECT id, username FROM users WHERE username = ?', name);
  if (!u) die(`没有「${name}」这个账号`);

  const { pw, generated } = await resolvePass(rest[0]);
  checkPass(pw);
  run('UPDATE users SET pass_hash = ? WHERE id = ?', hashPassword(pw), u.id);
  // 改密后踢掉所有旧会话，避免老设备继续登录着
  const killed = run('DELETE FROM sessions WHERE user_id = ?', u.id).changes;

  console.log(`✓ 已重置「${name}」的密码${generated ? `：${pw}   ← 只显示这一次` : ''}`);
  console.log(`  已注销 ${killed} 个旧登录会话`);
  process.exit(0);
}

if (cmd === 'del') {
  if (!name) die('缺少用户名。用法：del <用户名> --yes');
  const u = get('SELECT id, username FROM users WHERE username = ?', name);
  if (!u) die(`没有「${name}」这个账号`);

  const events = get('SELECT COUNT(*) AS n FROM event_occurrences WHERE user_id = ?', u.id).n;
  const tasks = get('SELECT COUNT(*) AS n FROM tasks WHERE user_id = ?', u.id).n;
  if (!rest.includes('--yes')) {
    console.error(`这会删除「${name}」及其 ${events} 条日程、${tasks} 个计划，且不可撤销。`);
    console.error(`确认无误请加 --yes：node server/users.mjs del ${name} --yes`);
    process.exit(1);
  }

  tx(() => {
    for (const t of USER_TABLES) run(`DELETE FROM ${t} WHERE user_id = ?`, u.id);
    run('DELETE FROM users WHERE id = ?', u.id);
  });
  console.log(`✓ 已删除账号「${name}」（日程 ${events} 条、计划 ${tasks} 个）`);
  process.exit(0);
}

die(`未知命令「${cmd}」，用 node server/users.mjs help 查看用法`);
