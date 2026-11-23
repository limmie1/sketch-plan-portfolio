/* ============================================================
 * Sketch Plan · 数据层（原型）
 * - 统一的数据模型，桌面端与移动端共用同一份 store
 * - localStorage 持久化；真实后端见 docs 中的 API 契约
 * - 重复事件以"系列 + 实例"存储，与正式实现保持一致
 * ============================================================ */
(function (global) {
  'use strict';

  var KEY = 'sketchplan.v1';
  var curKey = KEY;
  var cloudMode = false;

  function keyFor(user) { return user ? KEY + '::' + user : KEY; }
  function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function legacyOwner() {
    try {
      var d = JSON.parse(safeGet(KEY) || 'null');
      return d && d.settings && d.settings.name ? d.settings.name : null;
    } catch (e) { return null; }
  }

  /* ---------- 日期工具（全部按本地时区，正式版走 lib/time.ts） ---------- */
  var pad = function (n) { return String(n).padStart(2, '0'); };
  function dateKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseKey(s) { var p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function diffDays(a, b) { return Math.round((startOfDay(parseKey(b)) - startOfDay(parseKey(a))) / 864e5); }
  function minutesOf(hhmm) { var p = hhmm.split(':').map(Number); return p[0] * 60 + p[1]; }
  function hhmmOf(min) { min = ((min % 1440) + 1440) % 1440; return pad(Math.floor(min / 60)) + ':' + pad(min % 60); }
  function endTime(e) { return hhmmOf(minutesOf(e.start) + e.dur); }

  /* 「今天」不是启动时算死的常量：每次读都按当前时间重新算。
     页面跨过午夜、或从后台切回前台时，时间轴的今天线会跟着走 */
  function todayKey() { return dateKey(new Date()); }
  function D(n) { return dateKey(addDays(parseKey(todayKey()), n)); }

  /* ---------- 分类 ----------
     v1.8.0 起分类由用户自己管理，数据存在 settings.cats（跟账号一起同步）：
       { id, name, desc, color, builtin }
     id 是日程 / 计划 / 工作集里 cat 字段真正存的值，改名不动 id，
     所以重命名不会打断任何已有引用。CATS 只是给老代码用的 id → 分类 映射，
     每次读都会按当前 settings.cats 重建。 */
  var CATS = {};

  function defaultCats() {
    return [
      { id: 'study', name: '学习', desc: '课程、考试、写作，一切要啃下来的东西', color: 'var(--c-study)', builtin: 1 },
      { id: 'work', name: '工作', desc: '项目、会议、要交付的东西', color: 'var(--c-work)', builtin: 1 },
      { id: 'life', name: '生活', desc: '家务、社交、日常琐事', color: 'var(--c-life)', builtin: 1 },
      { id: 'health', name: '健康', desc: '运动、睡眠、饮食', color: 'var(--c-health)', builtin: 1 }
    ];
  }

  /* 新建分类时按顺序取一个颜色，用满一轮再从头来 */
  var CAT_PALETTE = ['#C95A44', '#5B7FA6', '#7C8B5A', '#A06A8E', '#B58A3C', '#4E8C86', '#8C6B4F', '#6E6BA8'];
  function nextCatColor(list) {
    return CAT_PALETTE[list.length % CAT_PALETTE.length];
  }

  /* 读当前分类列表；数据缺失或损坏时回落到内置四个 */
  function catList() {
    var list = state && state.settings && state.settings.cats;
    if (!Array.isArray(list) || !list.length) return defaultCats();
    return list;
  }

  function catById(id) {
    var list = catList();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function catName(id) {
    var c = catById(id);
    return c ? c.name : '未分类';
  }

  function catColor(id) {
    var list = catList();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id !== id) continue;
      return list[i].color || CAT_PALETTE[i % CAT_PALETTE.length];
    }
    return 'var(--text-3)';
  }

  function defaultCat() {
    var list = catList();
    return list.length ? list[0].id : 'study';
  }

  /* 把 CATS 映射刷成当前分类（原地改键，导出的对象引用不会失效） */
  function syncCats() {
    Object.keys(CATS).forEach(function (k) { delete CATS[k]; });
    catList().forEach(function (c) {
      CATS[c.id] = { id: c.id, name: c.name, desc: c.desc || '', c: c.color, color: c.color, builtin: !!c.builtin };
    });
    return CATS;
  }

  /* 分类改了要整块回写 settings（settings 是整份 JSON 同步的） */
  function saveCats() {
    save();
    syncCats();
    emit({ type: 'settings', settings: JSON.parse(JSON.stringify(state.settings)) });
  }

  /** 每个分类被多少日程 / 计划 / 工作集引用 */
  function catUsage(id) {
    var events = 0, tasks = 0, collections = 0;
    (state.events || []).forEach(function (e) { if (e.cat === id) events++; });
    (state.tasks || []).forEach(function (t) { if (t.cat === id) tasks++; });
    (state.collections || []).forEach(function (c) { if (c.cat === id) collections++; });
    return { events: events, tasks: tasks, collections: collections, total: events + tasks + collections };
  }

  function addCat(name, desc) {
    var list = catList().slice();
    var nm = String(name || '').trim();
    if (!nm) return { error: '给分类起个名字' };
    if (nm.length > 12) return { error: '分类名称最多 12 个字' };
    var dup = list.some(function (c) { return c.name === nm; });
    if (dup) return { error: '已经有同名分类了' };
    var c = {
      id: 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      name: nm, desc: String(desc || '').trim().slice(0, 60), color: nextCatColor(list), builtin: 0
    };
    list.push(c);
    state.settings.cats = list;
    saveCats();
    return { cat: c };
  }

  function updateCat(id, patch) {
    var list = catList().slice();
    var idx = -1;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) idx = i;
    if (idx < 0) return { error: '分类不存在' };
    var next = Object.assign({}, list[idx]);
    if (patch.name !== undefined) {
      var nm = String(patch.name).trim();
      if (!nm) return { error: '名称不能为空' };
      if (nm.length > 12) return { error: '分类名称最多 12 个字' };
      var dup = list.some(function (c, j) { return j !== idx && c.name === nm; });
      if (dup) return { error: '已经有同名分类了' };
      next.name = nm;
    }
    if (patch.desc !== undefined) next.desc = String(patch.desc).trim().slice(0, 60);
    list[idx] = next;
    state.settings.cats = list;
    saveCats();
    return { cat: next };
  }

  /**
   * 删除分类。关联内容有两种处理：
   * - moveTo 传入另一个分类 id → 把日程 / 计划 / 工作集整体转到那个分类再删
   * - 没有关联内容 → 直接删
   * 不能删最后一个分类（否则新内容没有默认分类可用）
   */
  function removeCat(id, moveTo) {
    var list = catList().slice();
    var c = null, idx = -1;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) { c = list[i]; idx = i; }
    if (!c) return { error: '分类不存在' };
    if (list.length <= 1) return { error: '至少保留一个分类' };
    var use = catUsage(id);
    if (moveTo) {
      if (moveTo === id || !catById(moveTo)) return { error: '请选择一个其它分类' };
      (state.events || []).forEach(function (e) {
        if (e.cat !== id) return;
        e.cat = moveTo;
        emit({ type: 'update', id: e.id, patch: { cat: moveTo } });
      });
      (state.tasks || []).forEach(function (t) {
        if (t.cat !== id) return;
        t.cat = moveTo;
        emit({ type: 'taskUpdate', id: t.id, patch: { cat: moveTo } });
      });
      (state.collections || []).forEach(function (k) {
        if (k.cat !== id) return;
        k.cat = moveTo;
        emit({ type: 'collectionUpdate', id: k.id, patch: { cat: moveTo } });
      });
    } else if (use.total) {
      return { error: '还有内容在用这个分类', usage: use };
    }
    list.splice(idx, 1);
    state.settings.cats = list;
    saveCats();
    return { cat: c, moved: use.total, moveTo: moveTo || null };
  }

  /* ---------- 种子数据（相对今天生成，保证任何日期打开都是"活"的） ---------- */
  var seq = 1;
  function ev(date, start, dur, title, cat, done, remind) {
    return {
      id: 'e' + (seq++), date: date, start: start, dur: dur, title: title,
      cat: cat, done: !!done, remind: remind === undefined ? 20 : remind,
      note: '', seriesId: null, sub: []
    };
  }

  /* 按标题把日程归到默认工作集；老数据迁移也用它 */
  function guessCollection(title) {
    if (/论文|设计评审|组会|上线|作品集|设计分享/.test(title)) return 'c2';
    if (/C 语言|期中复习|指针|结构体|链表|排序/.test(title)) return 'c1';
    if (/英语|读书|德语|听力/.test(title)) return 'c3';
    if (/健身|跑步|体检|运动/.test(title)) return 'c4';
    return null;
  }

  function seed() {
    var events = [
      ev(D(-20), '09:00', 90, '项目周会', 'work', true),
      ev(D(-16), '14:30', 90, 'C 语言 · 指针', 'study', true),
      ev(D(-12), '19:00', 60, '健身 · 上肢', 'health', true),
      ev(D(-9), '15:00', 90, '设计评审', 'work', true),
      ev(D(-6), '20:00', 60, '读书会', 'life', true),
      ev(D(-3), '10:00', 120, '论文写作 · 第二章', 'work', true),
      ev(D(-2), '14:30', 90, 'C 语言 · 结构体', 'study', true),
      ev(D(-1), '20:00', 60, '英语阅读 · 3 篇', 'study', true),

      ev(todayKey(), '09:30', 60, '晨间复盘', 'life', true, 0),
      ev(todayKey(), '11:00', 90, '论文写作 · 第三章', 'work', false),
      ev(todayKey(), '14:30', 90, 'C 语言 · 链表', 'study', false, 20),
      ev(todayKey(), '16:30', 60, '英语课', 'study', false, 20),
      ev(todayKey(), '19:00', 60, '健身 · 跑步 5km', 'health', false, 30),
      ev(todayKey(), '21:00', 30, '给妈妈打电话', 'life', false, 10),

      ev(D(1), '10:00', 60, '组会', 'work', false, 15),
      ev(D(1), '14:30', 90, 'C 语言 · 文件读写', 'study', false, 20),
      ev(D(1), '20:00', 60, '英语阅读 · 3 篇', 'study', false),
      ev(D(2), '09:00', 120, '体检', 'health', false, 1440),
      ev(D(2), '16:00', 60, '设计分享会', 'work', false, 30),
      ev(D(3), '14:30', 90, 'C 语言 · 树', 'study', false, 20),
      ev(D(4), '19:00', 180, '朋友生日', 'life', false, 60),
      ev(D(5), '10:00', 120, '项目上线检查', 'work', false, 1440),
      ev(D(6), '20:00', 60, '月度复盘', 'life', false),
      ev(D(7), '14:30', 90, 'C 语言 · 排序', 'study', false, 20),
      ev(D(9), '20:00', 60, '英语阅读 · 4 篇', 'study', false),
      ev(D(11), '23:00', 60, '论文初稿 DDL', 'work', false, 1440),

      ev(D(-7), '09:00', 60, '论文初稿 · 搭大纲', 'work', true),
      ev(D(-4), '19:30', 45, '英语听力 · 20 分钟', 'study', true),
      ev(D(8), '14:00', 60, '德语课 A1.2', 'life', false, 30),
      ev(D(10), '10:00', 90, '作品集整理', 'work', false),
    ];

    var collections = [
      { id: 'c1', name: 'C 语言期末', cat: 'study', note: '指针 / 结构体 / 树 / 排序，11 月考试', created: D(-30) },
      { id: 'c2', name: '毕业论文', cat: 'work', note: '初稿 10 月底，二稿 11 月中', created: D(-40) },
      { id: 'c3', name: '英语阅读', cat: 'study', note: '32 篇，每天 2–3 篇', created: D(-20) },
      { id: 'c4', name: '体能与作息', cat: 'health', note: '每周三次，跑步 + 力量', created: D(-60) }
    ];

    events.forEach(function (e) { e.collectionId = guessCollection(e.title); });

    var tasks = [
      {
        id: 't1', title: '英语阅读 32 篇', unit: '篇', target: 32,
        start: D(-2), due: D(37), cat: 'study',
        logs: [2, 0, 2, 1, 3, 1, 0, 2, 2, 0, 1, 2, 1, 1]
      },
      {
        id: 't2', title: '论文初稿', unit: '节', target: 8,
        start: D(-16), due: D(14), cat: 'work',
        logs: [1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1]
      },
      {
        id: 't3', title: '读完 12 本书', unit: '本', target: 12,
        start: D(-46), due: D(75), cat: 'life',
        logs: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0]
      },
      {
        id: 't4', title: '跑步 100 公里', unit: 'km', target: 100,
        start: D(-16), due: D(44), cat: 'health',
        logs: [0, 5, 0, 0, 4, 0, 0, 6, 0, 0, 3, 0, 0, 5]
      }
    ];

    var plans = [
      { title: '英语阅读 32 篇', cat: 'study', from: D(-2), to: D(37), ddl: D(37), pct: 44 },
      { title: '论文初稿', cat: 'work', from: D(-16), to: D(14), ddl: D(14), pct: 38 },
      { title: '项目上线', cat: 'work', from: D(-7), to: D(8), ddl: D(8), pct: 70 },
      { title: '期中复习', cat: 'study', from: D(3), to: D(19), ddl: D(19), pct: 10 },
      { title: '英语听力 · 每日 20 分钟', cat: 'study', from: D(-9), to: D(34), ddl: null, pct: 60 },
      { title: '每周三次健身', cat: 'health', from: D(-16), to: D(29), ddl: null, pct: 55 },
      { title: '德语入门 A1', cat: 'life', from: D(-12), to: D(44), ddl: D(44), pct: 22 },
      { title: '作品集整理', cat: 'work', from: D(15), to: D(42), ddl: D(42), pct: 0 }
    ];

    return {
      events: events, tasks: tasks, plans: plans, collections: collections,
      settings: defaultSettings()
    };
  }

  function defaultSettings() {
    return {
      theme: 'ink', view: 'month', weekStart: 1,
      name: '林小满',
      defaultRemind: 20,
      quietOn: true, quietStart: '23:00', quietEnd: '07:30',
      notifyInApp: true, notifyPush: false,
      density: 'comfortable',
      autoComplete: true, autoGrace: 15, autoScope: 'today',
      postponeReasons: ['时间不够', '状态不好', '临时有事', '优先级变了'],
      /* 分类：用户可增删改，存在 settings 里跟账号同步 */
      cats: defaultCats(),
      /* 便签：一张纸，随手记。放在 settings 里可以跟账号同步 */
      note: { text: '', updatedAt: null },
      tz: '', geo: ''
    };
  }

  /* 邮箱功能在 v1.7.0 下线，老数据里残留的这几个键读进来就清掉，
     否则会被整块 settings 同步回服务端，永远留在库里 */
  function pruneSettings(st) {
    delete st.email;
    delete st.digestOn;
    delete st.digestAt;
    delete st.notifyEmail;
    return st;
  }

  /* ---------- 存取 ---------- */
  var state = null;
  var hook = null;
  function onMutate(fn) { hook = fn; }
  function emit(op) { if (hook) { try { hook(op); } catch (e) { console.warn('[sync]', e.message); } } }

  function emptyState(user) {
    var st = defaultSettings();
    if (user) { st.name = user; }
    return { events: [], tasks: [], plans: [], collections: [], reviews: {}, settings: st };
  }

  /**
   * @param {string} user 登录用户名；为空时用演示库
   */
  function load(user) {
    curKey = keyFor(user);
    try {
      /* 老版本只有一份全局库：如果它属于当前登录的人，就把这份数据迁到他的独立库里 */
      if (user && !safeGet(curKey) && safeGet(KEY) && legacyOwner() === user) {
        safeSet(curKey, safeGet(KEY));
      }
      var raw = safeGet(curKey);
      if (raw) {
        var d = JSON.parse(raw);
        if (d && d.events && d.tasks && d.settings) {
          d.settings = pruneSettings(Object.assign(defaultSettings(), d.settings));
          d.events.forEach(function (e) {
            if (!Array.isArray(e.sub)) e.sub = [];
            if (!e.hasOwnProperty('collectionId')) e.collectionId = guessCollection(e.title);
          });
          var anyAssigned = d.events.some(function (e) { return !!e.collectionId; });
          if (!anyAssigned && d.events.length) {
            d.events.forEach(function (e) { e.collectionId = guessCollection(e.title); });
          }
          if (!Array.isArray(d.collections)) d.collections = seed().collections;
          if (!d.reviews || typeof d.reviews !== 'object') d.reviews = {};
          state = d;
          return state;
        }
      }
    } catch (e) { /* 损坏则重建 */ }

    /* 新账号：从零开始；未登录：给演示数据 */
    state = user ? emptyState(user) : seed();
    save();
    return state;
  }

  function save() {
    var k = cloudMode
      ? KEY + '::cache::' + ((state.settings && state.settings.name) || 'me')
      : curKey;
    safeSet(k, JSON.stringify(state));
  }

  /* ---------- 用服务端数据重建（同步模式） ---------- */
  function logsFor(task, rows) {
    var out = [];
    for (var i = 0; i < 14; i++) out.push(0);
    var today = new Date(); today.setHours(0, 0, 0, 0);
    (rows || []).filter(function (r) { return r.task_id === task.id; }).forEach(function (r) {
      var d = new Date(r.logged_at);
      var idx = 13 - Math.round((today - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
      if (idx >= 0 && idx < 14) out[idx] += Number(r.value) || 0;
    });
    return out;
  }

  function hydrate(d) {
    cloudMode = true;
    if (Array.isArray(d.collections)) {
      state.collections = d.collections.map(function (c) {
        return { id: c.id, name: c.name, cat: c.cat || defaultCat(), note: c.note || '', created: c.created_at };
      });
    }
    if (Array.isArray(d.events)) {
      state.events = d.events.map(function (e) {
        return {
          id: e.id, seriesId: e.seriesId, date: e.date, start: e.start, dur: e.dur,
          title: e.title, cat: e.cat, done: !!e.done, remind: e.remind,
          note: '', collectionId: e.collectionId || null,
          postponeCount: e.postponeCount || 0, postponeReason: e.postponeReason || '', sub: []
        };
      });
    }
    if (Array.isArray(d.tasks)) {
      state.tasks = d.tasks.map(function (t) {
        return {
          id: t.id, title: t.title, unit: t.unit, target: t.target,
          start: t.start, due: t.due, cat: t.cat,
          logs: logsFor(t, d.taskLogs)
        };
      });
    }
    if (Array.isArray(d.reviews)) {
      state.reviews = {};
      d.reviews.forEach(function (r) {
        state.reviews[r.period_key] = {
          score: r.score || 0, keep: r.keep || '', improve: r.improve || '',
          stop: r.stop_text || '', start: r.start_text || '', updatedAt: r.updated_at
        };
      });
    }
    if (d.settings) state.settings = pruneSettings(Object.assign(defaultSettings(), d.settings));
    save();
    return state;
  }

  /* ---------- 查询 ---------- */
  function byDate(k) {
    return state.events
      .filter(function (e) { return e.date === k; })
      .sort(function (a, b) { return a.start.localeCompare(b.start); });
  }

  function upcoming(limit) {
    var now = new Date();
    var nowKey = dateKey(now);
    var nowMin = now.getHours() * 60 + now.getMinutes();
    return state.events
      .filter(function (e) {
        if (e.done) return false;
        if (e.date > nowKey) return true;
        return e.date === nowKey && minutesOf(e.start) + e.dur >= nowMin;
      })
      .sort(function (a, b) { return (a.date + a.start).localeCompare(b.date + b.start); })
      .slice(0, limit || 5);
  }

  /* ---------- 变更 ---------- */
  function addEvent(data, silent) {
    var e = {
      id: 'e' + (Date.now().toString(36)) + (seq++),
      date: data.date, start: data.start, dur: data.dur || 60,
      title: data.title || '未命名的事', cat: data.cat || defaultCat(),
      collectionId: data.collectionId || null,
      done: false,
      remind: data.remind === undefined ? state.settings.defaultRemind : data.remind,
      note: data.note || '', seriesId: data.seriesId || null, sub: data.sub || []
    };
    state.events.push(e);
    save();
    if (!silent) emit({ type: 'create', event: e });
    return e;
  }

  /* 重复展开：把一次创建变成 N 个实例（正式版为 series + occurrence） */
  function addRepeat(data) {
    var created = [];
    var seriesId = 's' + Date.now().toString(36);
    var d = parseKey(data.date), end = parseKey(data.until);
    var guard = 0;
    // 上限按实际跨度放宽，覆盖「每天重复一年」这类长期排期；只作兜底防死循环
    var span = Math.round((end - d) / 864e5) + 1;
    var cap = Math.max(400, span);
    while (d <= end && guard++ < cap) {
      var w = d.getDay();
      var hit = data.rule === 'daily' ||
        (data.rule === 'weekdays' && w >= 1 && w <= 5) ||
        (data.rule === 'tuth' && (w === 2 || w === 4)) ||
        (data.rule === 'weekly' && data.weekdays.indexOf(w) >= 0);
      if (hit) {
        created.push(addEvent({
          date: dateKey(d), start: data.start, dur: data.dur,
          title: data.title, cat: data.cat, remind: data.remind,
          collectionId: data.collectionId, seriesId: seriesId
        }, true));
      }
      d = addDays(d, 1);
    }
    emit({ type: 'createRepeat', data: data, seriesId: seriesId });
    return created;
  }

  function toggle(id) {
    var e = state.events.find(function (x) { return x.id === id; });
    if (!e) return null;
    e.done = !e.done;
    if (!e.done) { e.auto = false; if (endMs(e) <= Date.now()) e.autoSkip = true; }
    if (e.done) e.autoSkip = false;
    save();
    emit({ type: 'toggle', id: id, done: e.done });
    return e;
  }

  function remove(id) {
    state.events = state.events.filter(function (x) { return x.id !== id; });
    save();
    emit({ type: 'remove', id: id });
  }

  /* 删掉整条重复规则：本地展开的所有实例一起移除 */
  function removeSeries(sid) {
    if (!sid) return;
    state.events = state.events.filter(function (x) { return x.seriesId !== sid; });
    save();
    emit({ type: 'seriesRemove', id: sid });
  }

  function update(id, patch) {
    var e = state.events.find(function (x) { return x.id === id; });
    if (!e) return null;
    Object.keys(patch).forEach(function (k) { e[k] = patch[k]; });
    save();
    emit({ type: 'update', id: id, patch: patch });
    return e;
  }

  function getEvent(id) {
    return state.events.find(function (x) { return x.id === id; }) || null;
  }

  function duplicate(id) {
    var src = getEvent(id);
    if (!src) return null;
    return addEvent({
      date: src.date, start: src.start, dur: src.dur,
      title: src.title + '（副本）', cat: src.cat, remind: src.remind,
      note: src.note, sub: JSON.parse(JSON.stringify(src.sub || []))
    });
  }

  function addSub(id, text) {
    var e = getEvent(id);
    if (!e || !text) return null;
    e.sub = e.sub || [];
    e.sub.push({ id: 's' + Date.now().toString(36), text: text, done: false });
    save();
    return e;
  }

  function toggleSub(id, subId) {
    var e = getEvent(id);
    if (!e) return null;
    var s = (e.sub || []).find(function (x) { return x.id === subId; });
    if (s) { s.done = !s.done; save(); }
    return e;
  }

  function removeSub(id, subId) {
    var e = getEvent(id);
    if (!e) return null;
    e.sub = (e.sub || []).filter(function (x) { return x.id !== subId; });
    save();
    return e;
  }

  /* ---------- 时区与学生成本 ---------- */
  function zone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'; }
    catch (e) { return 'Asia/Shanghai'; }
  }

  function offsetText() {
    var off = -new Date().getTimezoneOffset();
    var sign = off >= 0 ? '+' : '-';
    var h = Math.floor(Math.abs(off) / 60);
    var m = Math.abs(off) % 60;
    return 'UTC' + sign + h + (m ? ':' + pad(m) : '');
  }

  /* 事件结束时刻（本地时间毫秒） */
  function endMs(e) {
    return parseKey(e.date).getTime() + (minutesOf(e.start) + (e.dur || 0)) * 60000;
  }

  /**
   * 自动完成：把"已经过去"的日程打勾
   * @param {number} graceMin 宽限分钟（结束后多久才算过去）
   * @param {string} scope    today | 3d | all
   */
  function autoComplete(graceMin, scope) {
    if (!state.settings.autoComplete) return [];
    var now = Date.now();
    var grace = (Number(graceMin) || 0) * 60000;
    var cutoff = scope === 'all' ? null : (scope === '3d' ? D(-2) : todayKey());
    var done = [];
    state.events.forEach(function (e) {
      if (e.done || e.autoSkip) return;
      if (cutoff && e.date < cutoff) return;
      if (endMs(e) + grace <= now) {
        e.done = true;
        e.auto = true;
        emit({ type: 'toggle', id: e.id, done: true });
        done.push({ id: e.id, title: e.title, date: e.date, start: e.start });
      }
    });
    if (done.length) save();
    return done;
  }

  function undoAuto(list) {
    var n = 0;
    (list || []).forEach(function (item) {
      var e = getEvent(item.id);
      if (!e) return;
      e.done = false;
      e.auto = false;
      e.autoSkip = true;   // 用户撤销过的不再自动勾
      n++;
    });
    if (n) save();
    return n;
  }

  /* ---------- 工作集（任务集） ---------- */
  function addCollection(name, cat, note) {
    var c = {
      id: 'c' + Date.now().toString(36),
      name: name || '未命名工作集',
      cat: cat || defaultCat(),
      note: note || '',
      created: todayKey()
    };
    state.collections.push(c);
    save();
    emit({ type: 'collectionAdd', collection: c });
    return c;
  }

  function updateCollection(id, patch) {
    var c = state.collections.find(function (x) { return x.id === id; });
    if (!c) return null;
    Object.keys(patch).forEach(function (k) { c[k] = patch[k]; });
    save();
    emit({ type: 'collectionUpdate', id: id, patch: patch });
    return c;
  }

  function removeCollection(id) {
    state.collections = state.collections.filter(function (x) { return x.id !== id; });
    state.events.forEach(function (e) { if (e.collectionId === id) e.collectionId = null; });
    save();
    emit({ type: 'collectionRemove', id: id });
  }

  function collectionEvents(id) {
    return state.events
      .filter(function (e) { return e.collectionId === id; })
      .sort(function (a, b) { return (a.date + a.start).localeCompare(b.date + b.start); });
  }

  function collectionStats(id) {
    var list = collectionEvents(id);
    var now = Date.now();
    var done = list.filter(function (e) { return e.done; }).length;
    var overdue = list.filter(function (e) { return !e.done && endMs(e) < now; }).length;
    var next = list.filter(function (e) { return !e.done && endMs(e) >= now; })[0] || null;
    return {
      total: list.length, done: done, overdue: overdue, left: list.length - done,
      group: list.reduce(function (a, e) { a[e.cat] = (a[e.cat] || 0) + 1; return a; }, {}),
      next: next,
      span: list.length ? [list[0].date, list[list.length - 1].date] : null
    };
  }

  /* ---------- 顺延 ---------- */
  function postpone(id, target) {
    var e = getEvent(id);
    if (!e) return null;
    e.postponedFrom = e.date;
    e.date = target.date || e.date;
    if (target.start) e.start = target.start;
    e.done = false;
    e.auto = false;
    e.autoSkip = false;
    e.postponeCount = (e.postponeCount || 0) + 1;
    e.postponeReason = target.reason || '';
    e.postponedAt = new Date().toISOString();
    save();
    emit({ type: 'postpone', id: id, date: e.date, start: e.start, reason: e.postponeReason });
    return e;
  }

  /* ---------- 区间统计（复盘卡用） ---------- */
  function rangeStats(from, to) {
    var list = state.events.filter(function (e) { return e.date >= from && e.date <= to; });
    var doneList = list.filter(function (e) { return e.done; });
    var mins = list.reduce(function (a, e) { return a + (e.dur || 0); }, 0);
    var doneMins = doneList.reduce(function (a, e) { return a + (e.dur || 0); }, 0);

    var byCat = {};
    Object.keys(syncCats()).forEach(function (k) { byCat[k] = { count: 0, done: 0, mins: 0 }; });
    list.forEach(function (e) {
      var b = byCat[e.cat] || (byCat[e.cat] = { count: 0, done: 0, mins: 0 });
      b.count++; b.mins += e.dur || 0; if (e.done) b.done++;
    });

    var perDay = {};
    var cur = parseKey(from), end = parseKey(to);
    while (cur <= end) { perDay[dateKey(cur)] = { count: 0, done: 0, mins: 0 }; cur = addDays(cur, 1); }
    list.forEach(function (e) {
      var p = perDay[e.date];
      if (!p) return;
      p.count++; p.mins += e.dur || 0; if (e.done) p.done++;
    });

    var days = Object.keys(perDay).sort();
    var busiest = days.slice().sort(function (a, b) { return perDay[b].count - perDay[a].count; })[0] || null;
    var streak = 0;
    for (var i = days.length - 1; i >= 0; i--) {
      if (days[i] > todayKey()) continue;
      if (perDay[days[i]].done > 0) streak++;
      else if (days[i] !== todayKey()) break;
    }

    return {
      from: from, to: to,
      list: list, total: list.length, done: doneList.length,
      rate: list.length ? Math.round(doneList.length / list.length * 100) : 0,
      mins: mins, doneMins: doneMins,
      hours: Math.round(mins / 60), doneHours: Math.round(doneMins / 60),
      byCat: byCat,
      days: days, perDay: perDay,
      busiest: busiest,
      streak: streak,
      peaks: days.filter(function (d) { return perDay[d].count >= 3; }),
      progress: state.tasks.map(function (t) {
        var p = taskProgress(t);
        return { title: t.title, cur: p.cur, target: t.target, unit: t.unit, pct: p.pct, health: p.health };
      })
    };
  }

  function addTask(data) {
    var t = {
      id: 't' + Date.now().toString(36),
      title: data.title || '新的计划',
      unit: data.unit || '次',
      target: Math.max(1, Number(data.target) || 1),
      start: data.start || todayKey(),
      due: data.due || D(30),
      cat: data.cat || defaultCat(),
      logs: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    };
    state.tasks.push(t);
    save();
    emit({ type: 'task', task: t });
    return t;
  }

  /* 时间轴的计划条 = 长期计划（目标 + 起止 + 进度），不再写死演示数据 */
  function plans() {
    return (state.tasks || []).map(function (t) {
      var p = taskProgress(t);
      return {
        title: t.title,
        cat: t.cat,
        from: t.start,
        to: t.due,
        ddl: t.due,
        pct: Math.round(p.pct)
      };
    });
  }

  function logTask(id, delta) {
    var t = state.tasks.find(function (x) { return x.id === id; });
    if (!t) return null;
    t.logs[t.logs.length - 1] = (t.logs[t.logs.length - 1] || 0) + (delta || 1);
    save();
    emit({ type: 'log', id: id, delta: delta || 1 });
    return t;
  }

  /* 修改计划内容：只改传入的字段，logs（打卡记录）原样保留 */
  function updateTask(id, patch) {
    var t = state.tasks.find(function (x) { return x.id === id; });
    if (!t) return null;
    if (patch.title !== undefined) {
      var title = String(patch.title).trim();
      if (title) t.title = title.slice(0, 100);
    }
    if (patch.target !== undefined) {
      var n = Number(patch.target);
      if (Number.isFinite(n) && n >= 1) t.target = Math.floor(n);
    }
    if (patch.unit !== undefined) t.unit = String(patch.unit).trim() || '次';
    if (patch.start !== undefined && patch.start) t.start = patch.start;
    if (patch.due !== undefined && patch.due) t.due = patch.due;
    if (patch.cat !== undefined) t.cat = patch.cat;
    save();
    emit({ type: 'taskUpdate', id: id, patch: patch });
    return t;
  }

  function removeTask(id) {
    var t = state.tasks.find(function (x) { return x.id === id; });
    if (!t) return null;
    state.tasks = state.tasks.filter(function (x) { return x.id !== id; });
    save();
    emit({ type: 'taskDelete', id: id });
    return t;
  }

  function taskProgress(t) {
    var cur = t.logs.reduce(function (a, b) { return a + b; }, 0);
    var pct = Math.min(100, (cur / t.target) * 100);
    var left = Math.max(diffDays(todayKey(), t.due), 0);
    var need = (t.target - cur) / Math.max(1, left);
    var sum = t.logs.reduce(function (a, b) { return a + b; }, 0);
    var avg = sum / Math.max(1, t.logs.length);
    var health = avg >= need * 0.95 ? 'ok' : avg >= need * 0.7 ? 'risk' : 'bad';
    return {
      cur: cur, pct: pct, left: left, need: need, avg: avg, health: health,
      label: health === 'ok' ? '跟得上' : health === 'risk' ? '有点紧张' : '落后了'
    };
  }

  function reminderList(dayKey) {
    var out = [];
    var s = state.settings;
    function inQuiet(mins) {
      if (!s.quietOn) return false;
      var a = minutesOf(s.quietStart), b = minutesOf(s.quietEnd);
      return a > b ? (mins >= a || mins < b) : (mins >= a && mins < b);
    }
    byDate(dayKey).forEach(function (e) {
      if (e.remind === null) return;
      var mins = minutesOf(e.start) - e.remind;
      out.push({
        at: hhmmOf(mins), mins: ((mins % 1440) + 1440) % 1440,
        title: e.title, offset: e.remind, cat: e.cat, id: e.id, quiet: inQuiet(((mins % 1440) + 1440) % 1440)
      });
    });
    return out.sort(function (a, b) { return a.mins - b.mins; });
  }

  /* ---------- 复盘填写 ---------- */
  function getReview(key) {
    if (!state.reviews) state.reviews = {};
    return state.reviews[key] || null;
  }

  function setReview(key, patch) {
    if (!state.reviews) state.reviews = {};
    var r = state.reviews[key] || { score: 0, keep: '', improve: '', stop: '', start: '', updatedAt: '' };
    Object.keys(patch).forEach(function (k) { r[k] = patch[k]; });
    r.updatedAt = new Date().toISOString();
    state.reviews[key] = r;
    save();
    emit({ type: 'review', key: key, patch: patch });
    return r;
  }

  function setTheme(t) { state.settings.theme = t; save(); }
  function setSetting(k, v) { state.settings[k] = v; save(); }

  /* ---------- 便签 ---------- */
  function note() {
    var s = state.settings;
    if (!s.note || typeof s.note !== 'object') s.note = { text: '', updatedAt: null };
    return s.note;
  }

  /** 自动保存：内容没变就不落盘，避免每次按键都发请求 */
  function saveNote(text) {
    var n = note();
    var t = String(text == null ? '' : text);
    if (n.text === t) return n;
    n.text = t;
    n.updatedAt = new Date().toISOString();
    save();
    /* settings 是整块 JSON 同步的，深拷贝一份再发，防止发送途中被改 */
    emit({ type: 'settings', settings: JSON.parse(JSON.stringify(state.settings)) });
    return n;
  }

  function isDemo() { return curKey === KEY; }

  function reset() {
    var demo = !state || !state.settings || !curKey || curKey === KEY;
    state = demo ? seed() : emptyState(state.settings.name);
    save();
    return state;
  }

  /* ---------- 跨日检测：页面一直开着，也要跟着换天 ---------- */
  var dayWatchers = [];
  var lastDayKey = todayKey();
  function onDayChange(fn) {
    if (typeof fn === 'function') dayWatchers.push(fn);
    return fn;
  }
  function checkDay() {
    var k = todayKey();
    if (k === lastDayKey) return false;
    var prev = lastDayKey;
    lastDayKey = k;
    dayWatchers.forEach(function (fn) {
      try { fn(k, prev); } catch (e) { console.warn('[day]', e.message); }
    });
    return true;
  }
  setInterval(checkDay, 20000);                       // 20 秒检查一次，跨天误差可忽略
  document.addEventListener('visibilitychange', function () { if (!document.hidden) checkDay(); });
  window.addEventListener('focus', checkDay);          // 息屏/切后台回来立刻补一次

  global.SP = {
    VERSION: '1.9.0',
    BUILD: '2026-10-23',
    get state() { return state; },
    load: load, save: save, reset: reset, keyFor: keyFor, emptyState: emptyState, isDemo: isDemo,
    onMutate: onMutate, hydrate: hydrate,
    onDayChange: onDayChange, checkDay: checkDay, todayKey: todayKey,
    isCloud: function () { return cloudMode; },
    get TODAY() { return todayKey(); },
    /* 每次读都按当前 settings.cats 重建，改分类后所有旧调用点自动拿到新数据 */
    get CATS() { return syncCats(); },
    catList: catList, catById: catById, catName: catName, catColor: catColor,
    catUsage: catUsage, defaultCat: defaultCat, defaultCats: defaultCats,
    addCat: addCat, updateCat: updateCat, removeCat: removeCat,
    D: D,
    dateKey: dateKey, parseKey: parseKey, addDays: addDays, diffDays: diffDays,
    minutesOf: minutesOf, hhmmOf: hhmmOf, endTime: endTime,
    byDate: byDate, upcoming: upcoming,
    addEvent: addEvent, addRepeat: addRepeat, toggle: toggle, remove: remove,
    removeSeries: removeSeries, update: update,
    getEvent: getEvent, duplicate: duplicate,
    addCollection: addCollection, updateCollection: updateCollection, removeCollection: removeCollection,
    collectionEvents: collectionEvents, collectionStats: collectionStats,
    postpone: postpone, rangeStats: rangeStats,
    addSub: addSub, toggleSub: toggleSub, removeSub: removeSub,
    addTask: addTask, updateTask: updateTask, removeTask: removeTask,
    logTask: logTask, taskProgress: taskProgress, plans: plans, reminderList: reminderList,
    zone: zone, offsetText: offsetText, endMs: endMs,
    autoComplete: autoComplete, undoAuto: undoAuto,
    getReview: getReview, setReview: setReview, guessCollection: guessCollection,
    setTheme: setTheme, setSetting: setSetting, defaultSettings: defaultSettings,
    note: note, saveNote: saveNote
  };
})(window);
