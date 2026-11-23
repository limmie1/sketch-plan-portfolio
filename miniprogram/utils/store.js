/* ============================================================
   数据层 v2 — 与 Web 版 assets/store.js 对齐的数据模型
   events / tasks / plans / collections / reviews / settings(cats, note)
   全部落在本机 wx.storage，无网络请求、无域名、无需备案；
   将来接云开发同步，只需要换掉 load / save 两处。
   ============================================================ */
var D = require('./date')

var KEY = 'sketchplan.mp.v2'
var OLD = 'sketchplan.mp.v1'

/* 内置四色的色值来自 app.wxss 的三套主题令牌（ink 为基准） */
var PALETTE = ['#C95A44', '#5B7FA6', '#7C8B5A', '#A06A8E', '#B58A3C', '#4E8C86', '#8C6B4F', '#6E6BA8']

var state = null

/* ---------------- 分类 ---------------- */
function defaultCats() {
  return [
    { id: 'study', name: '学习', desc: '课程、考试、写作，一切要啃下来的东西', color: '#37547F', builtin: 1 },
    { id: 'work', name: '工作', desc: '项目、会议、要交付的东西', color: '#8A5A72', builtin: 1 },
    { id: 'life', name: '生活', desc: '家务、社交、日常琐事', color: '#C0902F', builtin: 1 },
    { id: 'health', name: '健康', desc: '运动、睡眠、饮食', color: '#5C7C4C', builtin: 1 }
  ]
}

function defaultSettings() {
  return {
    name: '我',
    theme: 'ink',
    weekStart: 1,
    defaultRemind: 20,
    autoComplete: true,
    cats: defaultCats(),
    note: { text: '', updatedAt: null }
  }
}

function emptyState() {
  return {
    events: [],
    tasks: [],
    plans: [],
    collections: [],
    reviews: {},
    settings: defaultSettings()
  }
}

/* ---------------- 读写 ---------------- */
function save() {
  try { wx.setStorageSync(KEY, state) } catch (e) {}
}

function migrateOld() {
  var old = null
  try { old = wx.getStorageSync(OLD) } catch (e) { old = null }
  if (!old || !old.events) return null
  var st = emptyState()
  st.events = (old.events || []).map(function (e) {
    return {
      id: e.id || newId('e'),
      title: e.title || '未命名',
      date: e.date || D.todayKey(),
      start: e.start || '09:00',
      dur: Number(e.dur) || 60,
      cat: e.cat || 'life',
      done: !!e.done,
      remind: 20,
      note: e.notes || '',
      collectionId: null,
      seriesId: null,
      postponeCount: 0
    }
  })
  st.tasks = (old.tasks || []).map(function (t) {
    return {
      id: t.id || newId('t'),
      title: t.title || '未命名',
      unit: t.unit || '次',
      target: Math.max(1, Number(t.target) || 1),
      start: D.todayKey(),
      due: null,
      cat: t.cat || 'life',
      logs: t.done ? [Number(t.done) || 0] : [0]
    }
  })
  var s = old.settings || {}
  if (s.name) st.settings.name = s.name
  if (s.theme) st.settings.theme = s.theme
  if (s.weekStart === 0 || s.weekStart === 1) st.settings.weekStart = s.weekStart
  return st
}

function init() {
  if (state) return state
  var raw = null
  try { raw = wx.getStorageSync(KEY) } catch (e) { raw = null }
  if (raw && raw.events && raw.settings) {
    state = raw
    state.tasks = state.tasks || []
    state.plans = state.plans || []
    state.collections = state.collections || []
    state.reviews = state.reviews || {}
    var def = defaultSettings()
    for (var k in def) {
      if (state.settings[k] === undefined) state.settings[k] = def[k]
    }
    if (!Array.isArray(state.settings.cats) || !state.settings.cats.length) state.settings.cats = defaultCats()
    if (!state.settings.note) state.settings.note = { text: '', updatedAt: null }
    if (!state.settings.name) state.settings.name = '我'
  } else {
    var migrated = migrateOld()
    if (migrated) {
      state = migrated
    } else {
      state = emptyState()
      seed()
    }
    save()
  }
  return state
}

/* ---------------- 种子数据（相对今天，打开就是"活"的） ---------------- */
function seed() {
  var t = D.todayKey()
  var n = function (i) { return D.addDays(t, i) }
  function ev(date, start, dur, title, cat, done, cid) {
    return {
      id: newId('e'), date: date, start: start, dur: dur, title: title, cat: cat,
      done: !!done, remind: 20, note: '', collectionId: cid || null, seriesId: null, postponeCount: 0
    }
  }
  state.collections = [
    { id: 'c1', name: 'C 语言期末', cat: 'study', note: '指针 / 结构体 / 树 / 排序', created: n(-30) },
    { id: 'c2', name: '毕业论文', cat: 'work', note: '初稿 10 月底，二稿 11 月中', created: n(-40) },
    { id: 'c3', name: '英语阅读', cat: 'study', note: '32 篇，每天 2–3 篇', created: n(-20) },
    { id: 'c4', name: '体能与作息', cat: 'health', note: '每周三次，跑步 + 力量', created: n(-60) }
  ]
  state.events = [
    ev(n(-3), '10:00', 120, '论文写作 · 第二章', 'work', true, 'c2'),
    ev(n(-2), '14:30', 90, 'C 语言 · 结构体', 'study', true, 'c1'),
    ev(n(-1), '20:00', 60, '英语阅读 · 3 篇', 'study', true, 'c3'),

    ev(t, '09:30', 30, '晨间复盘', 'life', true),
    ev(t, '11:00', 90, '论文写作 · 第三章', 'work', false, 'c2'),
    ev(t, '14:30', 90, 'C 语言 · 链表', 'study', false, 'c1'),
    ev(t, '16:30', 60, '英语课', 'study', false, 'c3'),
    ev(t, '19:00', 60, '健身 · 跑步 5km', 'health', false, 'c4'),
    ev(t, '21:00', 30, '给妈妈打电话', 'life', false),

    ev(n(1), '10:00', 60, '组会', 'work', false, 'c2'),
    ev(n(1), '14:30', 90, 'C 语言 · 文件读写', 'study', false, 'c1'),
    ev(n(1), '20:00', 60, '英语阅读 · 3 篇', 'study', false, 'c3'),
    ev(n(2), '09:00', 120, '体检', 'health', false, 'c4'),
    ev(n(3), '14:30', 90, 'C 语言 · 树', 'study', false, 'c1'),
    ev(n(4), '19:00', 180, '朋友生日', 'life', false),
    ev(n(6), '20:00', 60, '月度复盘', 'life', false)
  ].map(function (e) {
    e.dur = e.dur
    return e
  })

  state.tasks = [
    { id: 't1', title: '英语阅读 32 篇', unit: '篇', target: 32, start: n(-2), due: n(37), cat: 'study', logs: [2, 0, 2, 1, 3, 1, 0, 2, 2, 0, 1, 2, 1, 1] },
    { id: 't2', title: '论文初稿', unit: '节', target: 8, start: n(-16), due: n(14), cat: 'work', logs: [1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1] },
    { id: 't3', title: '读完 12 本书', unit: '本', target: 12, start: n(-46), due: n(75), cat: 'life', logs: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0] },
    { id: 't4', title: '跑步 100 公里', unit: 'km', target: 100, start: n(-16), due: n(44), cat: 'health', logs: [0, 5, 0, 0, 4, 0, 0, 6, 0, 0, 3, 0, 0, 5] }
  ]

  state.plans = [
    { title: '英语阅读 32 篇', cat: 'study', from: n(-2), to: n(37), ddl: n(37), pct: 44 },
    { title: '论文初稿', cat: 'work', from: n(-16), to: n(14), ddl: n(14), pct: 38 },
    { title: '期中复习', cat: 'study', from: n(3), to: n(19), ddl: n(19), pct: 10 }
  ]
}

/* ---------------- 设置 ---------------- */
function settings() { return init().settings }
function setSetting(k, v) { init().settings[k] = v; save() }
function setTheme(t) { setSetting('theme', t) }
function setNote(text) {
  init().settings.note = { text: String(text || ''), updatedAt: Date.now() }
  save()
  return init().settings.note
}
function getNote() { return init().settings.note || { text: '', updatedAt: null } }

/* ---------------- 分类 ---------------- */
function catList() {
  var list = init().settings.cats
  if (!Array.isArray(list) || !list.length) return defaultCats()
  return list
}

function catById(id) {
  var list = catList()
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]
  return null
}

function catName(id) {
  var c = catById(id)
  return c ? c.name : '未分类'
}

function catColor(id) {
  var c = catById(id)
  return c ? c.color : '#948B7A'
}

function catUsage(id) {
  var s = init()
  var events = 0, tasks = 0, collections = 0
  s.events.forEach(function (e) { if (e.cat === id) events++ })
  s.tasks.forEach(function (t) { if (t.cat === id) tasks++ })
  s.collections.forEach(function (c) { if (c.cat === id) collections++ })
  return { events: events, tasks: tasks, collections: collections, total: events + tasks + collections }
}

function addCat(name, desc) {
  var list = catList().slice()
  var nm = String(name || '').trim()
  if (!nm) return { error: '给分类起个名字' }
  if (nm.length > 12) return { error: '分类名称最多 12 个字' }
  for (var i = 0; i < list.length; i++) if (list[i].name === nm) return { error: '已经有同名分类了' }
  var c = {
    id: 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    name: nm,
    desc: String(desc || '').trim().slice(0, 60),
    color: PALETTE[list.length % PALETTE.length],
    builtin: 0
  }
  list.push(c)
  init().settings.cats = list
  save()
  return { cat: c }
}

function updateCat(id, patch) {
  var list = catList().slice()
  var idx = -1
  for (var i = 0; i < list.length; i++) if (list[i].id === id) idx = i
  if (idx < 0) return { error: '分类不存在' }
  var next = {}
  for (var k in list[idx]) next[k] = list[idx][k]
  if (patch.name !== undefined) {
    var nm = String(patch.name).trim()
    if (!nm) return { error: '名称不能为空' }
    if (nm.length > 12) return { error: '分类名称最多 12 个字' }
    for (var j = 0; j < list.length; j++) {
      if (j !== idx && list[j].name === nm) return { error: '已经有同名分类了' }
    }
    next.name = nm
  }
  if (patch.desc !== undefined) next.desc = String(patch.desc).trim().slice(0, 60)
  list[idx] = next
  init().settings.cats = list
  save()
  return { cat: next }
}

function removeCat(id, moveTo) {
  var list = catList().slice()
  var found = null, idx = -1
  for (var i = 0; i < list.length; i++) if (list[i].id === id) { found = list[i]; idx = i }
  if (!found) return { error: '分类不存在' }
  if (list.length <= 1) return { error: '至少保留一个分类' }
  var use = catUsage(id)
  if (use.total && !moveTo) return { error: '还有内容在用这个分类', usage: use }
  if (moveTo) {
    if (moveTo === id || !catById(moveTo)) return { error: '请选择一个其它分类' }
    var s = init()
    s.events.forEach(function (e) { if (e.cat === id) e.cat = moveTo })
    s.tasks.forEach(function (t) { if (t.cat === id) t.cat = moveTo })
    s.collections.forEach(function (c) { if (c.cat === id) c.cat = moveTo })
  }
  list.splice(idx, 1)
  init().settings.cats = list
  save()
  return { cat: found, moved: use.total, moveTo: moveTo || null }
}

/* ---------------- 日程 ---------------- */
function newId(prefix) {
  return prefix + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36)
}

function sortByStart(list) {
  return list.slice().sort(function (a, b) { return a.start < b.start ? -1 : a.start > b.start ? 1 : 0 })
}

function byDate(date) {
  return sortByStart(init().events.filter(function (e) { return e.date === date }))
}

function eventById(id) {
  var list = init().events
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]
  return null
}

function addEvent(d) {
  var ev = {
    id: newId('e'),
    title: String(d.title || '').trim(),
    date: d.date || D.todayKey(),
    start: d.start || '09:00',
    dur: Number(d.dur) || 60,
    cat: d.cat || catList()[0].id,
    done: false,
    remind: d.remind === undefined ? (settings().defaultRemind || 20) : Number(d.remind),
    note: d.note || d.notes || '',
    collectionId: d.collectionId || null,
    seriesId: null,
    postponeCount: 0
  }
  if (!ev.title) return null
  init().events.push(ev)
  save()
  return ev
}

function updateEvent(id, patch) {
  var ev = eventById(id)
  if (!ev) return null
  for (var k in patch) {
    if (Object.prototype.hasOwnProperty.call(patch, k)) ev[k] = patch[k]
  }
  if (!String(ev.title || '').trim()) ev.title = '未命名'
  save()
  return ev
}

function toggleEvent(id) {
  var ev = eventById(id)
  if (!ev) return null
  ev.done = !ev.done
  save()
  return ev
}

function removeEvent(id) {
  var s = init()
  s.events = s.events.filter(function (e) { return e.id !== id })
  save()
}

function duplicateEvent(id) {
  var ev = eventById(id)
  if (!ev) return null
  var copy = {}
  for (var k in ev) copy[k] = ev[k]
  copy.id = newId('e')
  copy.done = false
  copy.date = D.addDays(ev.date, 1)
  copy.title = ev.title
  init().events.push(copy)
  save()
  return copy
}

function postponeEvent(id, target) {
  var ev = eventById(id)
  if (!ev) return null
  ev.date = target || D.addDays(ev.date, 1)
  ev.postponeCount = (ev.postponeCount || 0) + 1
  save()
  return ev
}

/* 重复日程：一次性生成到 until 为止的实例，同一 seriesId 便于整组删除 */
function addRepeat(data) {
  var rule = data.rule || 'weekly'
  var weekdays = data.weekdays || []
  var startDate = data.date || D.todayKey()
  var until = data.until || D.addDays(startDate, 60)
  var days = D.rangeDays(startDate, until)
  var seriesId = newId('s')
  var made = []
  days.forEach(function (k) {
    var wd = D.parse(k).getDay()
    var hit = false
    if (rule === 'daily') hit = true
    else if (rule === 'weekdays') hit = wd >= 1 && wd <= 5
    else if (rule === 'weekly') hit = wd === D.parse(startDate).getDay()
    else if (rule === 'custom') hit = weekdays.indexOf(wd) >= 0
    if (!hit) return
    var ev = addEvent({
      title: data.title, date: k, start: data.start, dur: data.dur,
      cat: data.cat, remind: data.remind, collectionId: data.collectionId, note: data.note
    })
    if (ev) { ev.seriesId = seriesId; made.push(ev) }
  })
  save()
  return { seriesId: seriesId, count: made.length }
}

function removeSeries(seriesId) {
  var s = init()
  s.events = s.events.filter(function (e) { return e.seriesId !== seriesId })
  save()
}

/* 有日程的日期集合，月历画点用 */
function markedDays() {
  var map = {}
  init().events.forEach(function (e) { map[e.date] = true })
  return map
}

/* 未来 n 天内的日程（时间轴/提醒用） */
function upcoming(limit) {
  var t = D.todayKey()
  var list = init().events.filter(function (e) { return !e.done && e.date >= t })
  list.sort(function (a, b) { return (a.date + a.start) < (b.date + b.start) ? -1 : 1 })
  return limit ? list.slice(0, limit) : list
}

/* ---------------- 工作集 ---------------- */
function collections() {
  return init().collections.slice().sort(function (a, b) { return a.created < b.created ? 1 : -1 })
}

function collectionById(id) {
  var list = init().collections
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]
  return null
}

function addCollection(name, cat, note) {
  var nm = String(name || '').trim()
  if (!nm) return { error: '给工作集起个名字' }
  var c = { id: newId('c'), name: nm.slice(0, 24), cat: cat || catList()[0].id, note: String(note || '').trim().slice(0, 120), created: D.todayKey() }
  init().collections.push(c)
  save()
  return { collection: c }
}

function updateCollection(id, patch) {
  var c = collectionById(id)
  if (!c) return { error: '工作集不存在' }
  for (var k in patch) {
    if (Object.prototype.hasOwnProperty.call(patch, k)) c[k] = patch[k]
  }
  save()
  return { collection: c }
}

function removeCollection(id) {
  var s = init()
  s.collections = s.collections.filter(function (c) { return c.id !== id })
  s.events.forEach(function (e) { if (e.collectionId === id) e.collectionId = null })
  save()
}

function collectionEvents(id) {
  var list = init().events.filter(function (e) { return e.collectionId === id })
  list.sort(function (a, b) { return (b.date + b.start) < (a.date + a.start) ? -1 : 1 })
  return list
}

function collectionStats(id) {
  var list = collectionEvents(id)
  var done = list.filter(function (e) { return e.done }).length
  var mins = list.reduce(function (a, e) { return a + Number(e.dur || 0) }, 0)
  return {
    total: list.length,
    done: done,
    rate: list.length ? Math.round(done / list.length * 100) : 0,
    hours: Math.round(mins / 6) / 10
  }
}

/* ---------------- 计划（任务） ---------------- */
function tasks() { return init().tasks }
function plans() { return init().plans }

function addTask(d) {
  var t = {
    id: newId('t'),
    title: String(d.title || '').trim(),
    unit: d.unit || '次',
    target: Math.max(1, Number(d.target) || 1),
    start: d.start || D.todayKey(),
    due: d.due || null,
    cat: d.cat || catList()[0].id,
    logs: [Number(d.done) || 0]
  }
  if (!t.title) return null
  init().tasks.push(t)
  save()
  return t
}

function taskById(id) {
  var list = init().tasks
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]
  return null
}

function taskProgress(t) {
  var sum = (t.logs || []).reduce(function (a, b) { return a + Number(b || 0) }, 0)
  var target = t.target || 1
  var pct = Math.max(0, Math.min(100, Math.round(sum / target * 100)))
  return { done: Math.max(0, sum), target: target, pct: pct, left: Math.max(0, target - sum) }
}

function logTask(id, delta) {
  var t = taskById(id)
  if (!t) return null
  if (!Array.isArray(t.logs)) t.logs = [0]
  t.logs.push(Number(delta) || 0)
  save()
  return taskProgress(t)
}

function updateTask(id, patch) {
  var t = taskById(id)
  if (!t) return null
  for (var k in patch) {
    if (Object.prototype.hasOwnProperty.call(patch, k)) t[k] = patch[k]
  }
  if (!String(t.title || '').trim()) t.title = '未命名'
  save()
  return t
}

function removeTask(id) {
  var s = init()
  s.tasks = s.tasks.filter(function (t) { return t.id !== id })
  save()
}

/* ---------------- 复盘 ---------------- */
function weekKeyOf(dateKey) {
  return D.weekStartKey(dateKey || D.todayKey(), settings().weekStart)
}

function getReview(key) {
  return init().reviews[key] || { wins: '', blocks: '', next: '', at: null }
}

function setReview(key, patch) {
  var cur = getReview(key)
  for (var k in patch) {
    if (Object.prototype.hasOwnProperty.call(patch, k)) cur[k] = patch[k]
  }
  cur.at = Date.now()
  init().reviews[key] = cur
  save()
  return cur
}

/* 一周的复盘数据：完成率、按分类的时间分布、每日曲线 */
function reviewStats(weekKey) {
  var s = init()
  var start = weekKey || weekKeyOf(D.todayKey())
  var days = D.rangeDays(start, D.addDays(start, 6))
  var list = s.events.filter(function (e) { return days.indexOf(e.date) >= 0 })
  var done = list.filter(function (e) { return e.done }).length
  var mins = list.reduce(function (a, e) { return a + Number(e.dur || 0) }, 0)

  var byCat = {}
  list.forEach(function (e) {
    byCat[e.cat] = byCat[e.cat] || { cat: e.cat, mins: 0, count: 0 }
    byCat[e.cat].mins += Number(e.dur || 0)
    byCat[e.cat].count++
  })
  var cats = Object.keys(byCat).map(function (k) {
    var c = byCat[k]
    c.name = catName(k)
    c.color = catColor(k)
    c.pct = mins ? Math.round(c.mins / mins * 100) : 0
    c.hours = Math.round(c.mins / 6) / 10
    return c
  }).sort(function (a, b) { return b.mins - a.mins })

  var series = days.map(function (k) {
    var dayList = list.filter(function (e) { return e.date === k })
    var d = dayList.filter(function (e) { return e.done }).length
    return {
      k: k,
      label: ['日', '一', '二', '三', '四', '五', '六'][D.parse(k).getDay()],
      total: dayList.length,
      done: d,
      rate: dayList.length ? Math.round(d / dayList.length * 100) : 0
    }
  })

  var postponed = list.filter(function (e) { return (e.postponeCount || 0) > 0 }).length

  return {
    key: start,
    from: days[0],
    to: days[6],
    label: D.cnDate(days[0]) + ' – ' + D.cnDate(days[6]),
    total: list.length,
    done: done,
    rate: list.length ? Math.round(done / list.length * 100) : 0,
    hours: Math.round(mins / 6) / 10,
    cats: cats,
    series: series,
    postponed: postponed
  }
}

/* ---------------- 搜索 ---------------- */
function search(q) {
  var kw = String(q || '').trim().toLowerCase()
  if (!kw) return []
  var s = init()
  var out = []
  s.events.forEach(function (e) {
    var hay = (e.title + ' ' + (e.note || '') + ' ' + catName(e.cat)).toLowerCase()
    if (hay.indexOf(kw) >= 0) {
      out.push({
        type: 'event', id: e.id, title: e.title, date: e.date,
        start: e.start, cat: e.cat, catName: catName(e.cat),
        done: e.done, sub: D.cnDate(e.date) + ' ' + D.weekday(e.date) + ' · ' + e.start
      })
    }
  })
  s.collections.forEach(function (c) {
    var hay = (c.name + ' ' + (c.note || '')).toLowerCase()
    if (hay.indexOf(kw) >= 0) {
      out.push({ type: 'collection', id: c.id, title: c.name, sub: '工作集 · ' + catName(c.cat) })
    }
  })
  s.tasks.forEach(function (t) {
    if (String(t.title).toLowerCase().indexOf(kw) >= 0) {
      out.push({ type: 'task', id: t.id, title: t.title, sub: '计划 · ' + catName(t.cat) })
    }
  })
  out.sort(function (a, b) { return (b.date || '') < (a.date || '') ? -1 : 1 })
  return out
}

/* ---------------- 统计 ---------------- */
function stats() {
  var s = init()
  var t = D.todayKey()
  var today = s.events.filter(function (e) { return e.date === t })
  var done = today.filter(function (e) { return e.done }).length
  var week = D.weekKeys(t, settings().weekStart)
  var weekList = s.events.filter(function (e) { return week.indexOf(e.date) >= 0 })
  var weekDone = weekList.filter(function (e) { return e.done }).length
  return {
    todayTotal: today.length,
    todayDone: done,
    todayRate: today.length ? Math.round(done / today.length * 100) : 0,
    weekTotal: weekList.length,
    weekDone: weekDone,
    weekRate: weekList.length ? Math.round(weekDone / weekList.length * 100) : 0,
    allDone: s.events.filter(function (e) { return e.done }).length,
    total: s.events.length,
    tasks: s.tasks.length,
    collections: s.collections.length
  }
}

function rangeStats(from, to) {
  var s = init()
  var days = D.rangeDays(from, to)
  var list = s.events.filter(function (e) { return days.indexOf(e.date) >= 0 })
  var done = list.filter(function (e) { return e.done }).length
  var mins = list.reduce(function (a, e) { return a + Number(e.dur || 0) }, 0)
  return {
    total: list.length,
    done: done,
    rate: list.length ? Math.round(done / list.length * 100) : 0,
    hours: Math.round(mins / 6) / 10
  }
}

/* ---------------- 维护 ---------------- */
function clearAll() {
  state = emptyState()
  save()
}

function loadDemo() {
  state = emptyState()
  seed()
  save()
}

module.exports = {
  /* 兼容旧页面 */
  get CATS() { return catList() },
  init: init,
  settings: settings,
  setSetting: setSetting,
  setTheme: setTheme,
  catName: catName,
  eventsOf: byDate,
  eventById: eventById,
  addEvent: addEvent,
  updateEvent: updateEvent,
  toggleEvent: toggleEvent,
  removeEvent: removeEvent,
  markedDays: markedDays,
  tasks: tasks,
  addTask: addTask,
  logTask: logTask,
  removeTask: removeTask,
  stats: stats,
  clearAll: clearAll,
  loadDemo: loadDemo,

  /* v2 新增 */
  catList: catList,
  catById: catById,
  catColor: catColor,
  catUsage: catUsage,
  addCat: addCat,
  updateCat: updateCat,
  removeCat: removeCat,
  byDate: byDate,
  duplicateEvent: duplicateEvent,
  postponeEvent: postponeEvent,
  addRepeat: addRepeat,
  removeSeries: removeSeries,
  upcoming: upcoming,
  collections: collections,
  collectionById: collectionById,
  addCollection: addCollection,
  updateCollection: updateCollection,
  removeCollection: removeCollection,
  collectionEvents: collectionEvents,
  collectionStats: collectionStats,
  plans: plans,
  taskById: taskById,
  taskProgress: taskProgress,
  updateTask: updateTask,
  weekKeyOf: weekKeyOf,
  getReview: getReview,
  setReview: setReview,
  reviewStats: reviewStats,
  search: search,
  rangeStats: rangeStats,
  getNote: getNote,
  setNote: setNote
}
