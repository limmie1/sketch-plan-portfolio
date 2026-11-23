/** 备份：VACUUM INTO 生成一致性快照，并清理 14 天前的旧备份 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const src = path.join(DATA_DIR, 'sketchplan.db');
/* 文件名用容器本地时区（compose 里 TZ=Asia/Shanghai），避免凌晨 3 点的备份
   在文件名上显示成前一天 19:10（UTC），看起来像漏跑了一天 */
const p2 = (n) => String(n).padStart(2, '0');
const d = new Date();
const stamp = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
  + `-${p2(d.getHours())}-${p2(d.getMinutes())}-${p2(d.getSeconds())}`;
const out = path.join(DATA_DIR, `backup-${stamp}.db`);

if (!fs.existsSync(src)) { console.error('数据库不存在:', src); process.exit(1); }
const db = new DatabaseSync(src);
db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
db.close();
console.log('已备份 →', out);

const keep = 14;
const files = fs.readdirSync(DATA_DIR).filter(f => /^backup-.*\.db$/.test(f)).sort();
files.slice(0, Math.max(0, files.length - keep)).forEach(f => {
  fs.unlinkSync(path.join(DATA_DIR, f));
  console.log('清理旧备份', f);
});
