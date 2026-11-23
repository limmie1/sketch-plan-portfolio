/* ============================================================
 * Sketch Plan · 应用层
 * 桌面端与移动端共用一份 store，视图与交互按设备分别优化
 * ============================================================ */
(function () {
  'use strict';

  var SP = window.SP;

  /* 先取登录会话，再按用户加载各自的库 */
  var SESSION = null;
  try { SESSION = JSON.parse(localStorage.getItem('sketchplan.session') || 'null'); } catch (e) {}
  SP.load(SESSION && SESSION.name ? SESSION.name : null);

  var App = {};
  window.App = App;

  var MQ = window.matchMedia('(max-width: 768px)');

  var state = {
    view: SP.state.settings.view || 'month',
    mview: 'today',
    cursor: (function () { var d = SP.parseKey(SP.TODAY); return new Date(d.getFullYear(), d.getMonth(), 1); })(),
    selected: SP.TODAY
  };

  var DOW_CN = ['日', '一', '二', '三', '四', '五', '六'];
  var MONTH_CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
  var WEEK_HH = 46; // 周表每小时的像素高度

  /* 一周起始日可配置（0=周日，1=周一） */
  function ws() { return SP.state.settings.weekStart === 0 ? 0 : 1; }
  function weekOffset(d) { return (d.getDay() - ws() + 7) % 7; }
  function weekLabels() {
    var a = [];
    for (var i = 0; i < 7; i++) a.push(DOW_CN[(ws() + i) % 7]);
    return a;
  }

  /* ---------------- 小工具 ---------------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /* 分类的色与名都从 store 取：分类是用户可增删改的数据，不再是写死的四个 */
  function catColor(cat) { return SP.catColor(cat); }
  function catName(cat) { return SP.catName(cat); }
  /* 分类选择器：新建 / 修改日程、计划、工作集共用同一套按钮 */
  function catPickerHTML(current, handler) {
    return SP.catList().map(function (c) {
      return '<button type="button" data-k="' + c.id + '" class="' + (current === c.id ? 'on' : '') +
        '" style="--c:' + catColor(c.id) + '" onclick="' + handler + '(this)"><i></i>' + esc(c.name) + '</button>';
    }).join('');
  }
  function isMobile() {
    var d = document.documentElement.dataset.device;
    if (d === 'phone') return true;
    if (d === 'desktop') return false;
    return MQ.matches;
  }
  function md(key) { var p = key.split('-'); return Number(p[1]) + '/' + Number(p[2]); }
  function durText(mins) { return (mins / 60).toFixed(mins % 60 === 0 ? 0 : 1) + ' 小时'; }

  var colState = { active: null };

  /* 当前是否在看「工作集」—— 电脑端看 state.view，手机端看 state.mview，
     这样两端新建日程时的默认归属才能一致（旧的 state.view 判断在手机上永远为假） */
  function inCollections() {
    return isMobile() ? state.mview === 'collections' : state.view === 'collections';
  }
  /* 当前选中的工作集 id；「未归类」不是真实集合，返回空 */
  function activeCollId() {
    return (inCollections() && colState.active && colState.active !== '__none__') ? colState.active : '';
  }

  var RING = '<svg class="ring" viewBox="0 0 40 40"><path d="M20 3.6c9.2-.4 16.4 5.6 16.2 15.2-.2 9-6.8 17-16.4 16.8C10.6 35.4 3.4 29 3.8 19.4 4.2 10 10.8 3.8 20 3.6"/></svg>';

  /* ============================================================
     渲染 · 外壳
     ============================================================ */
  function renderChrome() {
    var t = SP.state.settings;
    $('userName').textContent = t.name;
    $('avatar').textContent = t.name.slice(0, 1);

    document.querySelectorAll('#nav .nav-item[data-view]').forEach(function (b) {
      b.classList.toggle('on', b.dataset.view === state.view);
    });
    document.querySelectorAll('#seg button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.view === state.view);
    });

    var title;
    if (isMobile()) {
      if (state.mview === 'today') title = (SP.parseKey(state.selected).getMonth() + 1) + '月' + SP.parseKey(state.selected).getDate() + '日<small>周' + DOW_CN[SP.parseKey(state.selected).getDay()] + '</small>';
      else if (state.mview === 'calendar') title = MONTH_CN[state.cursor.getMonth()] + '月<small>' + state.cursor.getFullYear() + '</small>';
      else if (state.mview === 'timeline') title = '时间轴<small>计划分布</small>';
      else if (state.mview === 'progress') title = '进度<small>中长期</small>';
      else if (state.mview === 'collections') title = '工作集<small>任务归类</small>';
      else if (state.mview === 'review') title = '复盘<small>周 · 月 · 年</small>';
      else if (state.mview === 'cats') title = '分类<small>日程与计划的分组</small>';
      else if (state.mview === 'mine') title = '我的<small>设置与账号</small>';
      else title = '我的<small>设置</small>';
    } else {
      if (state.view === 'collections') title = '工作集<small>' + SP.state.collections.length + ' 个集合</small>';
      else if (state.view === 'cats') title = '分类<small>' + SP.catList().length + ' 个分类</small>';
      else if (state.view === 'review') title = '复盘<small>周 · 月 · 年</small>';
      else if (state.view === 'me') title = '我的<small>设置与账号</small>';
      else title = MONTH_CN[state.cursor.getMonth()] + '月<small>' + state.cursor.getFullYear() + '</small>';
    }
    $('pageTitle').innerHTML = title;

    // 迷你日历
    var mini = $('miniCal');
    var html = weekLabels().map(function (d) { return '<div class="dow">' + d + '</div>'; }).join('');
    var first = new Date(state.cursor.getFullYear(), state.cursor.getMonth(), 1);
    var off = weekOffset(first);
    var st = SP.addDays(first, -off);
    for (var i = 0; i < 35; i++) {
      var d = SP.addDays(st, i), k = SP.dateKey(d);
      html += '<div class="day ' + (d.getMonth() === state.cursor.getMonth() ? '' : 'out ') +
        (k === SP.TODAY ? 'today ' : '') + (SP.byDate(k).length ? 'has' : '') +
        '" onclick="App.select(\'' + k + '\')">' + d.getDate() + '</div>';
    }
    mini.innerHTML = html;

    // 分类统计（分类由用户自己维护，点击进分类页）
    $('catList').innerHTML = SP.catList().map(function (c) {
      var n = SP.state.events.filter(function (e) { return e.cat === c.id; }).length;
      return '<div class="cat-row" onclick="App.setView(\'cats\')" title="' + esc(c.desc || '') + '">' +
        '<span class="cat-dot" style="--c:' + catColor(c.id) + '"></span>' +
        esc(c.name) + '<span class="n">' + n + '</span></div>';
    }).join('');
  }

  /* ============================================================
     渲染 · 月历
     ============================================================ */
  function monthHTML() {
    var c = state.cursor;
    var first = new Date(c.getFullYear(), c.getMonth(), 1);
    var off = weekOffset(first);
    var start = SP.addDays(first, -off);
    var cells = '';
    for (var i = 0; i < 42; i++) {
      var d = SP.addDays(start, i), k = SP.dateKey(d);
      var inM = d.getMonth() === c.getMonth();
      var list = SP.byDate(k);
      var today = k === SP.TODAY;
      cells += '<div class="cell ' + (inM ? '' : 'out ') + (today ? 'today ' : '') +
        (k === state.selected ? 'sel ' : '') + ([0, 6].indexOf(d.getDay()) >= 0 ? 'weekend' : '') +
        '" data-date="' + k + '" onclick="App.select(\'' + k + '\')" ondblclick="App.openEvent(\'' + k + '\')">' +
        '<div class="cell-head"><span class="cell-num">' + d.getDate() + (today ? RING : '') + '</span></div>' +
        '<div class="chips">' +
        list.slice(0, 3).map(function (e) {
          return '<div class="chip ' + (e.done ? 'done' : '') + '" style="--c:' + catColor(e.cat) + '"' +
            ' draggable="true" data-id="' + e.id + '" title="' + esc(e.title) + ' · 拖动可改期，按住 Alt 拖动为复制"' +
            ' onclick="event.stopPropagation();App.openChip(\'' + e.id + '\',\'' + k + '\')">' +
            '<span class="tm">' + e.start + '</span><span class="tt">' + esc(e.title) + '</span></div>';
        }).join('') +
        (list.length > 3 ? '<div class="more">+' + (list.length - 3) + ' 更多</div>' : '') +
        '</div></div>';
    }
    return '<div class="cal-head">' + weekLabels().map(function (d) { return '<span>' + d + '</span>'; }).join('') + '</div>' +
      '<div class="month">' + cells + '</div>';
  }

  /* ============================================================
     渲染 · 周表
     ============================================================ */
  function weekHTML() {
    var base = SP.parseKey(state.selected);
    var off = weekOffset(base);
    var start = SP.addDays(base, -off);
    var days = [];
    for (var i = 0; i < 7; i++) days.push(SP.addDays(start, i));

    var head = '<div class="week-head"><div></div>' + days.map(function (d) {
      var k = SP.dateKey(d);
      return '<div class="wh ' + (k === SP.TODAY ? 'today' : '') + '" onclick="App.select(\'' + k + '\')">' +
        '<span>周' + DOW_CN[d.getDay()] + '</span><b>' + d.getDate() + '</b></div>';
    }).join('') + '</div>';

    var H0 = 7, H1 = 24, HH = WEEK_HH;
    var hourCol = '<div class="hour-col">';
    for (var h = H0; h < H1; h++) hourCol += '<div class="hour-lbl">' + (h < 10 ? '0' + h : h) + ':00</div>';
    hourCol += '</div>';

    var cols = days.map(function (d) {
      var k = SP.dateKey(d);
      var list = SP.byDate(k);
      /* 计算重叠分道：互相重叠的事件错开排，避免完全盖住 */
      /* 先按时间聚成互相重叠的组，再在组内分列 */
      var clusters = [], cur = [], curEnd = -1;
      list.forEach(function (e) {
        var s0 = SP.minutesOf(e.start), e0 = s0 + (e.dur || 60);
        if (cur.length && s0 >= curEnd) { clusters.push(cur); cur = []; curEnd = -1; }
        cur.push(e); curEnd = Math.max(curEnd, e0);
      });
      if (cur.length) clusters.push(cur);

      /* 组内改为「垂直堆叠」：未完成在上、已完成沉底 */
      clusters.forEach(function (grp) {
        var anchor = Math.min.apply(null, grp.map(function (e) { return SP.minutesOf(e.start); }));
        grp.sort(function (a, b) {
          if (!!a.done !== !!b.done) return a.done ? 1 : -1;
          return SP.minutesOf(a.start) - SP.minutesOf(b.start);
        });
        grp.forEach(function (e, i2) { e._i = i2; e._n = grp.length; e._anchor = anchor; });
      });

      var evs = list.map(function (e) {
        var idx = e._i || 0;
        var n = e._n || 1;
        var pile = n > 1;
        var base = ((e._anchor !== undefined ? e._anchor : SP.minutesOf(e.start)) - H0 * 60) / 60 * HH;
        /* 堆叠时统一压成「书脊」高度，错开 13px，像一摞卡片 */
        var top = Math.max(0, base + (pile ? idx * 15 : 0));
        var hgt = pile ? 40 : Math.max(e.dur / 60 * HH, 26);
        var inset = pile ? Math.min(idx, 4) * 2 : 0;
        var opa = idx === 0 ? 1 : Math.max(0.28, 0.62 - idx * 0.12);
        var tag = (pile && idx === 0 && n > 1) ? '<i class="ev-more">×' + n + '</i>' : '';
        return '<div class="ev-block ' + (e.done ? 'done' : '') + (idx ? ' stacked' : '') +
          (pile ? ' pile' : '') +
          '" style="--c:' + catColor(e.cat) + ';--d:' + idx + ';--o:' + opa.toFixed(2) +
          ';top:' + top + 'px;height:' + hgt + 'px;left:' + (3 + inset) +
          'px;width:calc(100% - ' + (6 + inset) + 'px);z-index:' + (60 - idx) +
          '" data-id="' + e.id + '" data-date="' + e.date +
          '" data-start="' + e.start + '" onclick="App.blockClick(event,\'' + e.id + '\')">' +
          tag + '<b>' + esc(e.title) + '</b><span>' + e.start + ' – ' + SP.endTime(e) + '</span></div>';
      }).join('');
      var nowLine = '';
      if (k === SP.TODAY) {
        var now = new Date();
        var top2 = ((now.getHours() * 60 + now.getMinutes()) - H0 * 60) / 60 * HH;
        if (top2 > 0) nowLine = '<div class="now-line" style="top:' + top2 + 'px"></div>';
      }
      return '<div class="day-col ' + (k === SP.TODAY ? 'today' : '') + '">' + nowLine + evs + '</div>';
    }).join('');

    return '<div class="week-wrap">' + head +
      '<div class="week-body">' + hourCol + cols + '</div></div>' +
      '<div class="legend"><span><i class="lg-bar"></i>日程</span><span><i class="lg-today"></i>现在</span>' +
      '<span style="margin-left:auto;color:var(--text-3)">单击事件可在右侧查看 · 双击空白处新建</span></div>';
  }

  /* ============================================================
     渲染 · 时间轴
     ============================================================ */
  function tlRange() {
    var plans = SP.plans();
    if (!plans.length) {
      var f0 = SP.D(-14), t0 = SP.D(30);
      return { from: f0, to: t0, days: SP.diffDays(f0, t0) + 1 };
    }
    var from = plans[0].from, to = plans[0].to;
    plans.forEach(function (p) {
      if (p.from < from) from = p.from;
      if (p.to > to) to = p.to;
    });
    /* 今天必须落在窗口内：计划全在过去/全在未来时，
       否则 pct(今天) 会小于 0 或大于 100，线直接跑出画布，看起来像「没对齐」或消失 */
    var t = SP.TODAY;
    if (t < from) from = t;
    if (t > to) to = t;
    return { from: from, to: to, days: SP.diffDays(from, to) + 1 };
  }

  function timelineHTML(compact) {
    var r = tlRange();
    var pct = function (k) { return (SP.diffDays(r.from, k) / r.days) * 100; };

    var axis = '';
    var cursorMonth = null;
    for (var i = 0; i < r.days; i += 7) {
      var d = SP.addDays(SP.parseKey(r.from), i);
      axis += '<div class="tl-tick" style="left:' + (i / r.days * 100) + '%">' + md(SP.dateKey(d)) + '</div>';
    }
    [r.from, r.to].forEach(function (k) {
      var p = SP.parseKey(k);
      if (cursorMonth !== p.getMonth()) {
        cursorMonth = p.getMonth();
        axis += '<div class="tl-month" style="left:' + pct(k) + '%">' + (p.getMonth() + 1) + ' 月</div>';
      }
    });

    var rows = SP.plans().map(function (p, i) {
      var left = pct(p.from);
      var w = Math.max((SP.diffDays(p.from, p.to) / r.days) * 100, 2);
      var c = catColor(p.cat);
      var bar = '<div class="tl-bar" style="left:' + left + '%;width:' + w + '%;--c:' + c + '">' +
        '<div class="fill" style="width:' + p.pct + '%"></div>' +
        '<b>' + esc(p.title) + '</b><span class="pct">' + p.pct + '%</span></div>';
      var ddl = '';
      if (p.ddl) {
        var dl = SP.diffDays(SP.TODAY, p.ddl);
        ddl = '<div class="tl-ddl" style="left:' + pct(p.ddl) + '%"></div>' +
          '<div class="tl-ddl-lbl" style="left:' + pct(p.ddl) + '%">' + (dl >= 0 ? '剩 ' + dl + ' 天' : '逾期 ' + (-dl) + ' 天') + '</div>';
      }
      return '<div class="tl-row"><div class="tl-label"><span class="cat-dot" style="--c:' + c + '"></span>' +
        esc(p.title) + '<i>' + SP.diffDays(p.from, p.to) + ' 天</i></div>' +
        '<div class="tl-track">' + bar + ddl + '</div></div>';
    }).join('');

    var grid = '';
    for (var g = 0; g < r.days; g += 7) grid += '<div class="tl-grid" style="left:' + (g / r.days * 100) + '%"></div>';
    /* 网格线和「今天」线都必须放在与 .tl-track 同列的覆盖层里：.tl-rows 的整体宽度
       = 168px 标签列 + 轨道，百分比是相对整行算的，直接写 left 会整体左移 168px，
       看起来就不在对应的日期上。所以先用 .tl-overlay 扣掉标签列，再在里面按百分比定位。 */
    var tp = pct(SP.TODAY);
    var overlay = '<div class="tl-overlay">' + grid +
      '<div class="tl-today' + (tp > 88 ? ' flip' : '') +
      '" style="left:' + tp + '%"><span>今天</span></div></div>';

    return (compact ? '' : '<div class="tl-tools"><span class="hint">拖动画布查看 · 条形长度＝持续天数</span>' +
      '<div class="grow"></div>' +
      '<button class="btn ghost sm" onclick="App.openBatch()">批量排课</button></div>') +
      '<div class="tl-scroll"><div class="tl-inner">' +
      '<div class="tl-head"><div class="tl-corner"></div><div class="tl-axis">' + axis + '</div></div>' +
      '<div class="tl-rows">' + rows + (rows ? overlay : '') + '</div>' +
      '</div></div>' +
      (SP.plans().length ? '' : '<div class="empty" style="padding:24px 4px">还没有正在推进的计划。点「批量排课」或新建日程开始。</div>') +
      '<div class="legend"><span><i class="lg-bar"></i>进行中的计划</span><span><i class="lg-ddl"></i>DDL</span>' +
      '<span><i class="lg-today"></i>今天</span></div>' + heatHTML();
  }

  /* 近 30 天完成情况 */
  function heatHTML() {
    var cells = '', total = 0;
    for (var i = 29; i >= 0; i--) {
      var k = SP.D(-i);
      var done = SP.state.events.filter(function (e) { return e.date === k && e.done; }).length;
      total += done;
      var lv = done === 0 ? 0 : Math.min(4, done);
      cells += '<div class="heat' + (k === SP.TODAY ? ' today' : '') + '" data-l="' + lv +
        '" title="' + md(k) + ' · 完成 ' + done + ' 件"></div>';
    }
    return '<div class="heat-wrap"><div class="heat-h">近 30 天完成情况 <b>' + total + '</b> 件' +
      '<span class="heat-legend">少 <i></i><i style="background:color-mix(in srgb,var(--accent) 26%,var(--surface-2))"></i>' +
      '<i style="background:color-mix(in srgb,var(--accent) 55%,var(--surface-2))"></i>' +
      '<i style="background:color-mix(in srgb,var(--accent) 80%,var(--surface-2))"></i> 多</span></div>' +
      '<div class="heat-grid">' + cells + '</div></div>';
  }

  /* ============================================================
     渲染 · 进度
     ============================================================ */
  function progressCards() {
    return SP.state.tasks.map(function (t) {
      var p = SP.taskProgress(t);
      var max = Math.max.apply(null, t.logs.concat([1]));
      return '<div class="pg-card" style="--c:' + catColor(t.cat) + '">' +
        '<div class="pg-top"><div class="pg-title">' + esc(t.title) + '</div>' +
        '<span class="badge ' + p.health + '">' + p.label + '</span>' +
        '<div class="pg-sub">' + md(t.start) + ' – ' + md(t.due) + '</div>' +
        '<button class="pg-menu" onclick="App.taskMenu(\'' + t.id + '\')" aria-label="修改或删除这个计划" title="修改或删除">' +
        '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg></button>' +
        '</div>' +
        '<div class="pg-meta">目标 <b>' + t.target + ' ' + t.unit + '</b> · 已完成 <b>' + p.cur + '</b> · 还剩 <b>' + p.left + '</b> 天</div>' +
        '<div class="bar"><div class="bar-fill" style="width:' + p.pct + '%"></div></div>' +
        '<div class="bar-num"><b>' + Math.round(p.pct) + '%</b><span>' + p.cur + ' / ' + t.target + ' ' + t.unit + '</span></div>' +
        '<div class="pg-foot"><div class="pg-pace ' + (p.health !== 'ok' ? 'risk' : '') + '">' +
        '按当前速度，每天需 <b>' + p.need.toFixed(1) + '</b> ' + t.unit +
        (p.health !== 'ok' ? '<br>近 14 天平均 ' + p.avg.toFixed(1) + ' ' + t.unit : '') + '</div>' +
        '<div class="spark">' + t.logs.map(function (v) {
          return '<i class="' + (v >= max * 0.6 ? 'hi' : '') + '" style="height:' + Math.max(2, v / max * 20) + 'px"></i>';
        }).join('') + '</div>' +
        '<button class="btn sm" onclick="App.logTask(\'' + t.id + '\')">＋记录</button></div></div>';
    }).join('');
  }

  function progressHTML() {
    var tasks = SP.state.tasks;
    if (!tasks.length) {
      return '<div class="pg-head"><div class="pg-stat"><b>0</b><span>进行中的计划</span></div>' +
        '<div class="pg-note">还没有长期目标。</div></div>' +
        '<div class="empty-state"><b>还没有进行中的计划</b>' +
        '<p>比如「读完 12 本书」「跑步 100 公里」，给它一个目标量和截止日期。</p>' +
        '<button class="btn primary" onclick="App.newTask()">新建第一个计划</button></div>';
    }
    var totalLogs = tasks.reduce(function (a, t) { return a + t.logs.filter(function (v) { return v > 0; }).length; }, 0);
    var onTrack = tasks.filter(function (t) { return SP.taskProgress(t).health === 'ok'; }).length;
    return '<div class="pg-head">' +
      '<div class="pg-stat"><b>' + tasks.length + '</b><span>进行中的计划</span></div>' +
      '<div class="pg-stat"><b>' + onTrack + '</b><span>跟得上节奏</span></div>' +
      '<div class="pg-stat"><b>' + totalLogs + '</b><span>近 14 天记录次数</span></div>' +
      '<div class="pg-note">按当前节奏，<br>“' + tasks[0].title + '”每天需 ' + SP.taskProgress(tasks[0]).need.toFixed(1) + ' ' + tasks[0].unit + '。</div>' +
      '<button class="btn sm" style="margin-left:18px" onclick="App.newTask()">＋ 新建计划</button></div>' +
      '<div class="pg-grid">' + progressCards() + '</div>';
  }

  /* ============================================================
     渲染 · 右栏
     ============================================================ */
  function renderInspector() {
    var d = SP.parseKey(state.selected);
    var list = SP.byDate(state.selected);
    var mins = list.reduce(function (a, b) { return a + b.dur; }, 0);
    $('inspDate').innerHTML = (d.getMonth() + 1) + '月' + d.getDate() + '日<em>周' + DOW_CN[d.getDay()] + '</em>';
    $('inspSub').textContent = list.length ? list.length + ' 件事 · 约 ' + durText(mins) : '这一天还空着';

    $('inspEvents').innerHTML = list.length ? list.map(function (e) {
      return '<div class="ev-row ' + (e.done ? 'done' : '') + '" style="--c:' + catColor(e.cat) + '">' +
        '<span class="bar-c"></span>' +
        '<button class="check ' + (e.done ? 'on' : '') + '" onclick="App.toggle(\'' + e.id + '\')" aria-label="切换完成">' +
        '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"/></svg></button>' +
        '<div class="ev-main" style="cursor:pointer" onclick="App.openDetail(\'' + e.id + '\')"><div class="ev-t">' + esc(e.title) + '</div>' +
        '<div class="ev-m"><span>' + e.start + '–' + SP.endTime(e) + '</span><span class="c">' + catName(e.cat) + '</span>' +
        (e.remind ? '<span>· 提前 ' + e.remind + ' 分</span>' : '') +
        (e.auto ? '<span class="tag-auto">自动</span>' : '') + '</div></div></div>';
    }).join('') : '<div class="empty">这一天空着，挺好的。<br>双击日历格可以随手加一件事。</div>';

    var rems = SP.reminderList(state.selected);
    $('inspReminders').innerHTML = rems.length ? rems.map(function (r) {
      return '<div class="rem-row"><span class="bell" style="background:' + catColor(r.cat) + '"></span>' +
        '<time>' + r.at + '</time>' + esc(r.title) + '<small>' + (r.offset ? '提前 ' + r.offset + ' 分' : '准时') + '</small></div>';
    }).join('') : '<div class="empty">没有设置提醒</div>';

    var t = SP.state.tasks[0];
    if (!t) { $('inspProgress').innerHTML = '<div class="empty">还没有长期目标，去「进度」里建一个。</div>'; return; }
    var p = SP.taskProgress(t);
    $('inspProgress').innerHTML =
      '<div style="display:flex;justify-content:space-between;font-size:11.5px;margin-bottom:6px">' +
      '<span>' + esc(t.title) + '</span><b style="font-variant-numeric:tabular-nums">' + p.cur + '/' + t.target + '</b></div>' +
      '<div class="bar" style="--c:' + catColor(t.cat) + '"><div class="bar-fill" style="width:' + p.pct + '%"></div></div>' +
      '<div style="display:flex;justify-content:space-between;font-size:10.5px;color:var(--text-3);margin-top:6px">' +
      '<span>距 DDL ' + p.left + ' 天</span><span>每天 ' + p.need.toFixed(1) + ' 篇</span></div>';
  }

  /* ============================================================
     渲染 · 移动端
     ============================================================ */
  function renderMToday() {
    var k = state.selected;
    var d = SP.parseKey(k);
    var list = SP.byDate(k);
    var mins = list.reduce(function (a, b) { return a + b.dur; }, 0);
    var base = d;
    var off = (base.getDay() + 6) % 7;
    var start = SP.addDays(base, -off);

    var strip = '';
    for (var i = 0; i < 7; i++) {
      var dd = SP.addDays(start, i), kk = SP.dateKey(dd);
      strip += '<button class="' + (kk === state.selected ? 'on ' : '') + (kk === SP.TODAY ? 'today' : '') +
        '" onclick="App.select(\'' + kk + '\')"><span class="w">' + DOW_CN[dd.getDay()] + '</span>' +
        '<span class="n">' + dd.getDate() + '</span>' +
        '<span class="dot" style="opacity:' + (SP.byDate(kk).length ? .7 : 0) + '"></span></button>';
    }

    var next = list.filter(function (e) { return !e.done; })[0];
    var agenda = list.length ? '<div class="rail-list">' + list.map(function (e) {
      return '<div class="rail-item ' + (e.done ? 'done' : '') + '" style="--c:' + catColor(e.cat) + '">' +
        '<div class="time">' + e.start + '</div><span class="node"></span>' +
        '<div class="card" onclick="App.toggle(\'' + e.id + '\')">' +
        '<h5>' + esc(e.title) + '</h5>' +
        '<div class="meta"><span>' + e.start + '–' + SP.endTime(e) + '</span><span>· ' + catName(e.cat) + '</span>' +
        (e.remind ? '<span>· 提前 ' + e.remind + ' 分</span>' : '') + '</div></div></div>';
    }).join('') + '</div>' :
      '<div class="empty" style="text-align:center;padding:40px 0">这张纸还是空的。<br>点右下角加一件事。</div>';

    $('vm-today').innerHTML =
      '<div class="m-head"><div><div class="m-date">' + d.getDate() + '<em>' + (d.getMonth() + 1) + '月 · 周' + DOW_CN[d.getDay()] + '</em></div>' +
      '<div class="m-sub">' + (list.length ? list.length + ' 件事 · ' + durText(mins) + ' · 下一件 ' + (next ? next.start : '—') : '今天没有安排') + '</div></div>' +
      '<div class="grow"></div>' +
      '<button class="btn ghost sm" onclick="App.openCapture()" aria-label="速记">速记</button>' +
      '<button class="btn primary sm" onclick="App.openBatch()" aria-label="批量排课">批量排课</button>' +
      '<button class="btn ghost sm" onclick="App.goToday()">今天</button></div>' +
      '<div class="daystrip">' + strip + '</div>' + agenda;
  }

  function renderMCalendar() {
    var list = SP.byDate(state.selected);
    $('vm-calendar').innerHTML = monthHTML() +
      '<div class="block" style="margin-top:16px"><h4>' + (SP.parseKey(state.selected).getMonth() + 1) + '月' +
      SP.parseKey(state.selected).getDate() + '日 · ' + list.length + ' 件事</h4>' +
      (list.length ? list.map(function (e) {
        return '<div class="ev-row ' + (e.done ? 'done' : '') + '" style="--c:' + catColor(e.cat) + '">' +
          '<span class="bar-c"></span>' +
          '<button class="check ' + (e.done ? 'on' : '') + '" onclick="App.toggle(\'' + e.id + '\')">' +
          '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"/></svg></button>' +
          '<div class="ev-main" style="cursor:pointer" onclick="App.openDetail(\'' + e.id + '\')"><div class="ev-t">' + esc(e.title) + '</div>' +
          '<div class="ev-m"><span>' + e.start + '–' + SP.endTime(e) + '</span><span class="c">' + catName(e.cat) + '</span></div></div></div>';
      }).join('') : '<div class="empty">这一天没有安排</div>') + '</div>';
  }

  var mtZoom = 1;
  App.mtZoom = function (d) {
    mtZoom = Math.max(0, Math.min(2, mtZoom + d));
    renderMTimeline();
  };

  function renderMTimeline() {
    var r = tlRange();
    var plans = SP.plans();
    var W = [640, 920, 1340][mtZoom];
    var pct = function (k) { return (SP.diffDays(r.from, k) / r.days) * 100; };
    var ticks = '';
    for (var i = 0; i < r.days; i += 7) {
      var d0 = SP.addDays(SP.parseKey(r.from), i);
      ticks += '<i class="mtl-tick" style="left:' + (i / r.days * 100) + '%">' + md(SP.dateKey(d0)) + '</i>';
    }

    /* 页头：与「进度」页保持一致，随时能新建计划 */
    var head = '<div class="m-head"><div class="grow">' +
      '<div class="m-h1">时间轴<em>' + (plans.length ? plans.length + ' 个计划' : '计划分布') + '</em></div>' +
      '<div class="m-sub">' + (plans.length
        ? '每根条是一个计划的起止区间，左右滑动查看'
        : '把中长期目标摊到时间上看进度') + '</div>' +
      '</div>' +
      '<button class="btn primary sm" onclick="App.newTask()">＋ 新建计划</button></div>';

    if (!plans.length) {
      $('vm-timeline').innerHTML = head +
        '<div class="empty-state"><b>还没有推进中的计划</b>' +
        '<p>比如「读完 12 本书」「跑步 100 公里」，给它一个目标量和截止日期，就会在时间轴上长出一根进度条。</p>' +
        '<button class="btn primary" onclick="App.newTask()">新建第一个计划</button></div>';
      return;
    }

    var rows = plans.map(function (p) {
      var left = pct(p.from);
      var w = Math.max((SP.diffDays(p.from, p.to) / r.days) * 100, 3);
      var dl = p.ddl ? SP.diffDays(SP.TODAY, p.ddl) : null;
      return '<div class="mtl-row"><div class="mtl-lb">' + esc(p.title) +
        (dl === null ? '' : '<em class="' + (dl < 0 ? 'late' : '') + '">' + (dl < 0 ? '逾期 ' + (-dl) : '剩 ' + dl) + '</em>') +
        '</div><div class="mtl-tr">' +
        '<b class="mtl-bar" style="left:' + left + '%;width:' + w + '%;--c:' + catColor(p.cat) + '">' +
        '<i style="width:' + p.pct + '%"></i></b>' +
        (p.ddl ? '<span class="mtl-ddl" style="left:' + pct(p.ddl) + '%"></span>' : '') +
        '</div></div>';
    }).join('');
    $('vm-timeline').innerHTML = head +
      '<div class="mtl-tools"><span class="m-sub">' + md(r.from) + ' – ' + md(r.to) + ' · ' + r.days + ' 天</span>' +
      '<div class="grow"></div>' +
      '<button class="btn sm ghost" onclick="App.mtZoom(-1)" aria-label="缩小">－</button>' +
      '<button class="btn sm ghost" onclick="App.mtZoom(1)" aria-label="放大">＋</button></div>' +
      '<div class="mtl-scroll"><div class="mtl" style="min-width:' + W + 'px">' +
      '<div class="mtl-axis"><div class="mtl-corner"></div><div class="mtl-ticks">' + ticks + '</div></div>' +
      rows +
      '<div class="mtl-overlay"><i class="mtl-today' + (pct(SP.TODAY) > 88 ? ' flip' : '') +
      '" style="left:' + pct(SP.TODAY) + '%"><span>今天</span></i></div>' +
      '</div></div>' +
      '<div class="legend" style="margin-top:12px"><span><i class="lg-bar"></i>进行中的计划</span>' +
      '<span><i class="lg-ddl" style="width:7px;height:7px;border:1.4px solid var(--text);transform:rotate(45deg)"></i>DDL</span>' +
      '<span style="margin-left:auto">左右滑动查看 · 用 ＋ / － 缩放</span></div>';
  }

  function renderMProgress() {
    var tasks = SP.state.tasks;
    var head = function (sub, btn) {
      return '<div class="m-head"><div class="grow"><div class="m-h1">' +
        (tasks.length ? tasks.length + ' 个计划<em>' + sub + '</em>' : '中长期目标') + '</div>' +
        '<div class="m-sub">' + (tasks.length ? '按当前节奏算，卡片右侧显示每天该做多少' : sub) + '</div></div>' +
        (btn ? '<button class="btn primary sm" onclick="App.newTask()">＋ 新建计划</button>' : '') +
        '</div>';
    };

    if (!tasks.length) {
      $('vm-progress').innerHTML = head('还没有进行中的计划', true) +
        '<div class="empty-state"><b>还没有进行中的计划</b>' +
        '<p>比如「读完 12 本书」「跑步 100 公里」，给它一个目标量和截止日期，就能算出每天该做多少。</p>' +
        '<button class="btn primary" onclick="App.newTask()">新建第一个计划</button></div>';
      return;
    }

    var onTrack = tasks.filter(function (t) { return SP.taskProgress(t).health === 'ok'; }).length;
    var logs = tasks.reduce(function (a, t) { return a + t.logs.filter(function (v) { return v > 0; }).length; }, 0);
    $('vm-progress').innerHTML = head(onTrack + ' 个跟得上 · 记录 ' + logs + ' 次', true) + progressCards();
  }

  function themeCards() {
    var list = [
      { id: 'ink', name: '纸墨', desc: '手账 · 纸质', sw: ['#FBF7EE', '#EDE5D4', '#211E19', '#D9503A'] },
      { id: 'pebble', name: '柔彩', desc: '极简 · 圆润', sw: ['#FFFFFF', '#EFF0FF', '#5B6CFF', '#E8789B'] },
      { id: 'aurora', name: '夜航', desc: '深色 · 高饱和', sw: ['#0A0B0F', '#1E222D', '#8B5CF6', '#22D3EE'] }
    ];
    var cur = document.documentElement.dataset.theme;
    return '<div class="theme-cards">' + list.map(function (t) {
      return '<button class="theme-card ' + (t.id === cur ? 'on' : '') + '" onclick="App.setTheme(\'' + t.id + '\')">' +
        '<div class="swatch">' + t.sw.map(function (c) { return '<i style="background:' + c + '"></i>'; }).join('') + '</div>' +
        '<b>' + t.name + '</b><span>' + t.desc + '</span>' +
        '<span class="tick" style="display:' + (t.id === cur ? 'grid' : 'none') + '">✓</span></button>';
    }).join('') + '</div>';
  }

  function setRow(label, desc, ctl) {
    return '<div class="set-row"><div class="lbl">' + label +
      (desc ? '<small>' + desc + '</small>' : '') + '</div><div class="ctl">' + ctl + '</div></div>';
  }
  function swBtn(key, on) {
    return '<button class="switch ' + (on ? 'on' : '') + '" onclick="App.togglePref(\'' + key + '\', this)" aria-pressed="' + on + '"></button>';
  }
  function selPref(key, val, opts) {
    return '<select onchange="App.pref(\'' + key + '\', this.value)">' + opts.map(function (o) {
      return '<option value="' + o[0] + '"' + (String(o[0]) === String(val) ? ' selected' : '') + '>' + o[1] + '</option>';
    }).join('') + '</select>';
  }
  function timePref(key, val) {
    return '<input type="time" value="' + (val || '08:00') + '" onchange="App.pref(\'' + key + '\', this.value)">';
  }

  function devSeg() {
    var cur = document.documentElement.dataset.device || 'auto';
    return '<div class="seg dev-seg">' + [['auto', '自动'], ['desktop', '电脑版'], ['phone', '手机版']].map(function (o) {
      return '<button class="' + (cur === o[0] ? 'on' : '') + '" onclick="App.setDevice(\'' + o[0] + '\')">' + o[1] + '</button>';
    }).join('') + '</div>';
  }

  function meSections() {
    var s = SP.state.settings;
    return '<section class="me-sec"><h3>界面形态</h3><div class="me-body">' +
      setRow('用哪个版本', '手机版适合窄屏，电脑版信息更密', devSeg()) +
      '</div></section>' +
      '<section class="me-sec"><h3>外观</h3><div class="me-body">' + themeCards() + '</div></section>' +

    '<section class="me-sec"><h3>偏好</h3><div class="me-body">' +
      setRow('默认提醒', '新建日程时自动带上', selPref('defaultRemind', s.defaultRemind, [[0, '准时'], [5, '5 分钟前'], [10, '10 分钟前'], [15, '15 分钟前'], [20, '20 分钟前'], [30, '30 分钟前'], [60, '1 小时前'], [1440, '1 天前']])) +
      setRow('每周起始日', '影响月历与周表的排列', selPref('weekStart', s.weekStart, [[1, '星期一'], [0, '星期日']])) +
      setRow('勿扰时段', '期间的提醒顺延到结束时刻', swBtn('quietOn', s.quietOn)) +
      setRow('起止时间', '', timePref('quietStart', s.quietStart) + '<span class="dash">→</span>' + timePref('quietEnd', s.quietEnd)) +
    '</div></section>' +

    '<section class="me-sec"><h3>自动化</h3><div class="me-body">' +
      setRow('自动完成', '时间已过的日程自动打勾（可撤销）', swBtn('autoComplete', s.autoComplete)) +
      setRow('宽限时间', '结束后多久才算“过去了”', selPref('autoGrace', s.autoGrace, [[0, '结束即刻'], [5, '5 分钟后'], [15, '15 分钟后'], [30, '30 分钟后'], [60, '1 小时后']])) +
      setRow('整理范围', '避免一次勾掉太久以前的日程', selPref('autoScope', s.autoScope, [['today', '仅今天'], ['3d', '最近 3 天'], ['all', '全部历史']])) +
      setRow('当前地区时间', SP.zone() + ' · ' + SP.offsetText() + (s.geo ? ' · ' + s.geo : ' · 未定位'),
        '<button class="btn sm" onclick="App.locate()">定位校准</button><button class="btn sm ghost" onclick="App.runAuto()">立即整理</button>') +
    '</div></section>' +

    '<section class="me-sec"><h3>提醒渠道</h3><div class="me-body">' +
      setRow('站内提醒', '应用内的提示卡', swBtn('notifyInApp', s.notifyInApp)) +
      setRow('浏览器推送', 'iOS 需先「添加到主屏幕」', swBtn('notifyPush', s.notifyPush)) +
    '</div></section>' +

    '<section class="me-sec"><h3>数据</h3><div class="me-body">' +
      '<div class="me-btns">' +
      '<button class="btn" onclick="App.exportData()">导出全部数据（JSON）</button>' +
      '<button class="btn ghost" onclick="App.resetDemo()">' + (SP.isDemo() ? '重置演示数据' : '清空我的数据') + '</button>' +
      '</div><p class="me-note">' + (SP.isCloud()
        ? '日程与计划已同步到你的账号，换设备登录就能看到同一份。'
        : '当前是浏览器本地模式，数据只存在这台设备上。') + '</p>' +
    '</div></section>' +

    '<section class="me-sec"><h3>账号</h3><div class="me-body">' +
      setRow('显示名', esc(s.name), '<button class="btn sm ghost" onclick="App.renameMe()">修改</button>') +
      setRow('登录状态', SP.isCloud() ? '云端已同步' : '本机已登录', '<button class="btn sm" onclick="App.logout()">退出登录</button>') +
    '</div></section>';
  }

  /* 手机端「我的」顶部的快捷入口：把电脑端侧栏里的功能搬过来，
     否则手机上没有工作集 / 复盘 / 批量排课的入口 */
  function mQuick() {
    var ic = {
      coll: '<svg viewBox="0 0 24 24"><path d="M4 7.5c0-1 .8-1.8 1.8-1.8h3.4l1.6 2h7.4c1 0 1.8.8 1.8 1.8v7.7c0 1-.8 1.8-1.8 1.8H5.8c-1 0-1.8-.8-1.8-1.8z"/><path d="M4 11h16"/></svg>',
      review: '<svg viewBox="0 0 24 24"><rect x="4.5" y="4" width="15" height="16" rx="2"/><path d="M8 9h8M8 12.5h8M8 16h5"/></svg>',
      bolt: '<svg viewBox="0 0 24 24"><path d="M13 3.5L5.5 13H11l-1 7.5L18 10h-5.5z"/></svg>',
      tag: '<svg viewBox="0 0 24 24"><path d="M4.5 5.5h7l8 8-6 6-8-8z"/><circle cx="8.4" cy="8.4" r="1.2"/></svg>',
      task: '<svg viewBox="0 0 24 24"><rect x="3.5" y="10" width="17" height="6" rx="3"/><path d="M6.5 13h6"/></svg>',
      batch: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="7" height="7" rx="1.6"/><rect x="13" y="4" width="7" height="7" rx="1.6"/><rect x="4" y="13" width="7" height="7" rx="1.6"/><path d="M16.5 13.6v5M14 16.1h5"/></svg>',
      gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M17.8 6.2l-1.6 1.6M7.8 16.2l-1.6 1.6M17.8 17.8l-1.6-1.6M7.8 7.8L6.2 6.2"/></svg>'
    };
    var cell = function (act, svg, name, sub) {
      return '<button class="m-q" onclick="' + act + '"><i>' + svg + '</i>' +
        '<b>' + name + '</b><em>' + sub + '</em></button>';
    };
    return '<div class="m-quick">' +
      cell('App.goMobile(\'collections\')', ic.coll, '工作集', '按主题归类') +
      cell('App.goMobile(\'cats\')', ic.tag, '分类', SP.catList().length + ' 个分类') +
      cell('App.goMobile(\'review\')', ic.review, '复盘', '周 / 月 / 年') +
      cell('App.openCapture()', ic.bolt, '一句话速记', '像发消息一样') +
      cell('App.newTask()', ic.task, '新建计划', '长期目标') +
      cell('App.openBatch()', ic.batch, '批量排课', '一次排多节') +
      cell('App.openSettings()', ic.gear, '全部设置', '提醒 / 自动化') +
      '</div>';
  }

  function renderMe(el) {
    if (!el) return;
    var s = SP.state.settings;
    el.innerHTML =
      '<div class="me-page">' +
      '<div class="me-head">' +
      '<div class="me-ava">' + esc(s.name.slice(0, 1)) + '</div>' +
      '<div class="me-id"><h2>' + esc(s.name) + '</h2>' +
      '<p>' + (SP.isCloud() ? '云端账号' : '本机账号') + ' · <span class="me-tag">已登录</span></p></div>' +
      '<button class="btn sm ghost me-out" onclick="App.logout()">退出登录</button>' +
      '</div>' +
      (isMobile() ? mQuick() : '') +
      '<div class="me-grid">' + meSections() + '</div>' +
      '<div class="me-foot">Sketch Plan v' + SP.VERSION + ' · 三套主题 · 桌面与移动共用一份数据</div>' +
      '</div>';
  }

  App.setDevice = function (m) {
    try { localStorage.setItem('sketchplan.device', m); } catch (e) {}
    document.documentElement.dataset.device = m;
    render();
    App.toast(m === 'auto' ? '跟随屏幕大小' : m === 'phone' ? '已切到手机版' : '已切到电脑版');
  };

  App.togglePref = function (k, el) {
    var on = !el.classList.contains('on');
    el.classList.toggle('on', on);
    SP.setSetting(k, on);
    render();
  };
  App.pref = function (k, v) {
    SP.setSetting(k, /^\d+$/.test(v) ? Number(v) : v);
    render();
  };
  App.renameMe = function () {
    var v = prompt('新的用户名', SP.state.settings.name);
    if (v === null) return;
    if (!v.trim()) { App.toast('显示名不能为空'); return; }
    SP.setSetting('name', v.trim());
    render(); App.toast('已更新显示名');
  };
  App.exportData = function () {
    try {
      var blob = new Blob([JSON.stringify(SP.state, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'sketchplan-' + SP.TODAY + '.json';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
      App.toast('已导出 JSON');
    } catch (e) { App.toast('导出失败', e.message); }
  };
  /* 退出登录：铺一层和登入同款的遮罩，进度条从满退到空，再落到登录页。
     登出请求和动画并行跑，两边都收完才跳，不会出现「点了没反应」或「半路硬切」 */
  App.logout = function () {
    if (App._leaving) return;
    App._leaving = true;
    setTimeout(function () { App._leaving = false; }, 3000);

    var net = null;
    if (window.Sync && window.Sync.isSynced()) {
      net = window.Sync.logout(true);            // 只发请求，跳转交给过渡层统一收尾
    } else {
      try { localStorage.removeItem('sketchplan.session'); } catch (e) {}
    }
    if (window.Boot && Boot.exit && Boot.exit('auth.html', net)) return;

    /* 过渡层不在（老缓存）时退回原来的直接跳转 */
    if (net && net.then) net.catch(function () {}).then(function () { location.href = 'auth.html'; });
    else location.href = 'auth.html';
  };

  /* ---------------- FLIP：位置变化时补间 ---------------- */
  function captureBlocks() {
    var m = {};
    document.querySelectorAll('#v-week .ev-block').forEach(function (b) {
      var r = b.getBoundingClientRect();
      m[b.dataset.id] = { left: r.left, top: r.top, op: b.style.getPropertyValue('--o') || '1' };
    });
    return m;
  }

  function playFlip(prev) {
    document.querySelectorAll('#v-week .ev-block').forEach(function (b) {
      var p = prev[b.dataset.id];
      if (!p) return;
      var r = b.getBoundingClientRect();
      var dx = p.left - r.left, dy = p.top - r.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      b.style.transition = 'none';
      b.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      requestAnimationFrame(function () {
        b.style.transition = 'transform .34s cubic-bezier(.22,.9,.24,1), opacity .3s ease';
        b.style.transform = '';
        setTimeout(function () { b.style.transition = ''; b.style.transform = ''; }, 380);
      });
    });
  }

  App.refresh = function () { render(); };

  /* ============================================================
     渲染入口
     ============================================================ */
  function render() {
    document.body.classList.toggle('mobile', isMobile());
    document.body.dataset.mview = isMobile() ? state.mview : '';
    renderChrome();

    var back = $('mBack');
    if (back) {
      var sub = isMobile() && (state.mview === 'collections' || state.mview === 'review' || state.mview === 'cats');
      back.classList.toggle('on', !!sub);
      if (sub) $('mBackTitle').textContent = state.mview === 'collections' ? '工作集' : state.mview === 'cats' ? '分类' : '复盘';
    }

    if (isMobile()) {
      if (state.mview === 'today') renderMToday();
      if (state.mview === 'calendar') renderMCalendar();
      if (state.mview === 'timeline') renderMTimeline();
      if (state.mview === 'progress') renderMProgress();
      if (state.mview === 'collections') renderCollections($('vm-collections'));
      if (state.mview === 'cats') renderCats($('vm-cats'));
      if (state.mview === 'review') Review.render($('vm-review'));
      if (state.mview === 'mine') renderMe($('vm-mine'));
      document.querySelectorAll('.tab').forEach(function (b) {
        var sub2 = (state.mview === 'collections' || state.mview === 'review' || state.mview === 'cats') && b.dataset.mview === 'mine';
        b.classList.toggle('on', b.dataset.mview === state.mview || sub2);
      });
      document.querySelectorAll('.m-view').forEach(function (v) {
        v.classList.toggle('on', v.id === 'vm-' + state.mview);
      });
      return;
    }

    var prevRects = (state.view === 'week') ? captureBlocks() : null;

    $('v-month').innerHTML = monthHTML();
    $('v-week').innerHTML = weekHTML();
    $('v-timeline').innerHTML = timelineHTML();
    $('v-progress').innerHTML = progressHTML();
    renderCollections($('v-collections'));
    renderCats($('v-cats'));
    renderMe($('v-me'));
    if (state.view === 'review') Review.render($('v-review'));
    if (prevRects) playFlip(prevRects);
    document.querySelectorAll('.d-view').forEach(function (v) {
      v.classList.toggle('on', v.id === 'v-' + state.view);
    });
    renderInspector();
  }

  /* ============================================================
     交互
     ============================================================ */
  App.setView = function (v) {
    state.view = v;
    SP.setSetting('view', v);
    if (v === 'review') Review.render($('v-review'));
    render();
    $('content').scrollTop = 0;
  };

  App.setMView = function (v) {
    state.mview = v;
    render();
    $('content').scrollTop = 0;
  };

  /* 手机端进入「工作集 / 复盘」这类二级页（tabbar 上没有的位置） */
  App.goMobile = function (v) {
    state.mview = v;
    render();
    var c = $('content');
    if (c) c.scrollTop = 0;
  };

  App.select = function (k) {
    state.selected = k;
    var d = SP.parseKey(k);
    if (d.getMonth() !== state.cursor.getMonth()) {
      state.cursor = new Date(d.getFullYear(), d.getMonth(), 1);
    }
    render();
    if (isMobile() && state.mview === 'calendar') {
      var el = $('vm-calendar').querySelector('.block');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  App.jumpTo = function (k) { App.select(k); };

  App.step = function (n) {
    if (state.view === 'week') {
      var d = SP.addDays(SP.parseKey(state.selected), n * 7);
      state.selected = SP.dateKey(d);
      state.cursor = new Date(d.getFullYear(), d.getMonth(), 1);
    } else if (state.view === 'month') {
      state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth() + n, 1);
    }
    render();
  };

  App.goToday = function () {
    state.selected = SP.TODAY;
    var d = SP.parseKey(SP.TODAY);
    state.cursor = new Date(d.getFullYear(), d.getMonth(), 1);
    render();
    App.toast('回到今天', '周' + DOW_CN[d.getDay()] + ' · ' + SP.byDate(SP.TODAY).length + ' 件事');
  };

  App.toggle = function (id) {
    var e = SP.toggle(id);
    render();
    if (e && e.done) App.toast('完成', e.title);
  };

  App.logTask = function (id) {
    var t = SP.logTask(id, 1);
    render();
    if (t) App.toast('+1 ' + t.unit, t.title);
  };

  App.setTheme = function (t) {
    document.documentElement.dataset.theme = t;
    SP.setTheme(t);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'aurora' ? '#0A0B0F' : t === 'pebble' ? '#FBFBFD' : '#FBF7EE');
    render();
    if (document.querySelector('.modal-root.on')) App.closeModal();
    App.toast('已切换为「' + ({ ink: '纸墨', pebble: '柔彩', aurora: '夜航' })[t] + '」');
  };

  App.openAppearance = function () {
    App.modal(
      '<h3>外观</h3><div class="sub">三套主题共用同一份数据，随你心情切换。</div>' +
      themeCards() +
      '<div class="sheet-foot"><div class="preview">主题会跟随你的账号，在手机与电脑上保持一致。</div></div>',
      true
    );
  };

  /* 新建 / 修改共用一份表单；传 task 就是编辑模式 */
  function taskFormHTML(t) {
    var cat = t ? t.cat : SP.defaultCat();
    var today = SP.parseKey(SP.TODAY);
    return '<div class="field"><label>标题</label><input id="tkTitle" placeholder="例如：读完 12 本书" autofocus value="' + (t ? esc(t.title) : '') + '"></div>' +
      '<div class="field-row">' +
      '<div class="field"><label>目标量</label><input id="tkTarget" type="number" min="1" value="' + (t ? t.target : 12) + '"></div>' +
      '<div class="field"><label>单位</label><input id="tkUnit" value="' + (t ? esc(t.unit) : '本') + '" placeholder="本 / 篇 / 公里"></div>' +
      '</div>' +
      '<div class="field-row">' +
      '<div class="field"><label>开始</label><input id="tkStart" type="date" value="' + (t ? t.start : SP.TODAY) + '"></div>' +
      '<div class="field"><label>截止</label><input id="tkDue" type="date" value="' + (t ? t.due : SP.dateKey(SP.addDays(today, 30))) + '"></div>' +
      '</div>' +
      '<div class="field"><label>分类</label><div class="pick" id="tkCats">' +
      catPickerHTML(cat, 'App.pickTaskCat') + '</div></div>';
  }

  App.newTask = function () {
    state.taskEditId = null;
    state.taskCat = SP.defaultCat();
    App.modal(
      '<h3>新建一个计划</h3><div class="sub">给它一个目标量和截止日期，就能算出节奏。</div>' +
      taskFormHTML(null) +
      '<div class="sheet-foot"><div class="grow"></div>' +
      '<button class="btn ghost" onclick="App.closeModal()">取消</button>' +
      '<button class="btn primary" onclick="App.saveTask()">创建</button></div>',
      true
    );
  };

  App.pickTaskCat = function (el) {
    state.taskCat = el.dataset.k;
    var box = el.parentNode;
    Array.prototype.forEach.call(box.children, function (b) { b.classList.toggle('on', b === el); });
  };

  /* 计划卡片右上角「⋯」：修改 / 删除 */
  App.taskMenu = function (id) {
    var t = SP.state.tasks.find(function (x) { return x.id === id; });
    if (!t) return;
    var p = SP.taskProgress(t);
    App.modal(
      '<h3>' + esc(t.title) + '</h3>' +
      '<div class="sub">目标 ' + t.target + ' ' + t.unit + ' · 已完成 ' + p.cur + ' · ' +
      md(t.start) + ' – ' + md(t.due) + '</div>' +
      '<div class="task-ops">' +
      '<button class="task-op" onclick="App.editTask(\'' + id + '\')">' +
      '<svg viewBox="0 0 24 24"><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3zM14.5 6.5l3 3"/></svg>' +
      '<span><b>修改计划内容</b><em>标题、目标量、日期、分类</em></span></button>' +
      '<button class="task-op danger" onclick="App.confirmDelTask(\'' + id + '\')">' +
      '<svg viewBox="0 0 24 24"><path d="M4.5 7h15M9.5 7V5.2c0-.7.6-1.2 1.2-1.2h2.6c.6 0 1.2.5 1.2 1.2V7M6.5 7l.9 12.1c.1.9.8 1.6 1.7 1.6h5.8c.9 0 1.6-.7 1.7-1.6L17 7"/></svg>' +
      '<span><b>删除这个计划</b><em>连同打卡记录一起删除</em></span></button>' +
      '</div>' +
      '<div class="sheet-foot"><div class="grow"></div>' +
      '<button class="btn ghost" onclick="App.closeModal()">关闭</button></div>',
      true
    );
  };

  App.editTask = function (id) {
    var t = SP.state.tasks.find(function (x) { return x.id === id; });
    if (!t) return;
    state.taskEditId = id;
    state.taskCat = t.cat;
    App.modal(
      '<h3>修改计划</h3><div class="sub">改完立刻生效，已经打的卡不会丢。</div>' +
      taskFormHTML(t) +
      '<div class="sheet-foot"><div class="grow"></div>' +
      '<button class="btn ghost" onclick="App.closeModal()">取消</button>' +
      '<button class="btn primary" onclick="App.saveTask()">保存</button></div>',
      true
    );
  };

  App.confirmDelTask = function (id) {
    var t = SP.state.tasks.find(function (x) { return x.id === id; });
    if (!t) return;
    var n = (t.logs || []).filter(function (v) { return v > 0; }).length;
    App.modal(
      '<h3>删除「' + esc(t.title) + '」？</h3>' +
      '<div class="sub">计划本身' + (n ? '和它的 ' + n + ' 天打卡记录' : '') + '会一起删掉，删了没法恢复。</div>' +
      '<div class="sheet-foot"><div class="grow"></div>' +
      '<button class="btn ghost" onclick="App.closeModal()">再想想</button>' +
      '<button class="btn primary danger" onclick="App.deleteTask(\'' + id + '\')">确认删除</button></div>',
      true
    );
  };

  App.deleteTask = function (id) {
    var t = SP.removeTask(id);
    App.closeModal();
    render();
    if (t) App.toast('计划已删除', t.title);
  };

  App.saveTask = function () {
    var title = ($('tkTitle').value || '').trim();
    if (!title) { App.toast('给它起个名字'); return; }
    var data = {
      title: title,
      target: $('tkTarget').value,
      unit: ($('tkUnit').value || '次').trim(),
      start: $('tkStart').value,
      due: $('tkDue').value,
      cat: state.taskCat || SP.defaultCat()
    };
    if (data.start && data.due && data.due < data.start) {
      App.toast('截止日期不能早于开始日期'); return;
    }
    var editId = state.taskEditId || null;
    state.taskEditId = null;
    if (editId) {
      SP.updateTask(editId, data);
      App.closeModal();
      render();
      App.toast('计划已更新', title);
      return;
    }
    SP.addTask(data);
    App.closeModal();
    render();
    App.toast('计划已创建', title);
  };

  App.resetDemo = function () {
    if (!SP.isDemo() && !confirm('清空当前账号的全部日程与进度？此操作不可撤销。')) return;
    SP.reset();
    state.selected = SP.TODAY;
    var d = SP.parseKey(SP.TODAY);
    state.cursor = new Date(d.getFullYear(), d.getMonth(), 1);
    App.setTheme(SP.state.settings.theme);
    App.toast(SP.isDemo() ? '演示数据已重置' : '已清空，从零开始');
  };

  /* ---------------- 弹层 ---------------- */
  var modal = $('modalRoot');
  App.closeModal = function () {
    noteFlush();                                   // 便签防抖没触发时先落盘，再清空弹层
    modal.classList.remove('on');
    modal.innerHTML = '';
  };
  modal.addEventListener('click', function (e) {
    if (e.target.classList.contains('scrim')) App.closeModal();
  });

  App.modal = function (inner, wide) {
    modal.innerHTML = '<div class="scrim"></div><div class="sheet" style="' +
      (wide ? 'width:min(460px,92vw)' : '') + '" role="dialog" aria-modal="true">' + inner + '</div>';
    modal.classList.add('on');
  };

  /* ============================================================
     便签（自动保存）
     ============================================================ */
  var noteTimer = null;

  function two(n) { return (n < 10 ? '0' : '') + n; }

  function noteStamp(iso) {
    if (!iso) return '还没有内容';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return '上次保存 ' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' + two(d.getHours()) + ':' + two(d.getMinutes());
  }

  /* 把 textarea 里的内容立刻写库（关弹层、点遮罩、按钮都走这里） */
  function noteFlush() {
    var ta = $('noteBody');
    if (!ta) return;
    clearTimeout(noteTimer);
    noteTimer = null;
    SP.saveNote(ta.value);
  }

  App.openNote = function () {
    var n = SP.note();
    App.modal(
      '<h3>便签</h3><div class="sub">随手记点什么，边写边存，关掉也不会丢。</div>' +
      '<div class="note-card">' +
      '<div class="note-bar"><span class="note-k">NOTE</span>' +
      '<span class="note-state" id="noteState">' + noteStamp(n.updatedAt) + '</span></div>' +
      '<textarea id="noteBody" class="note-body" placeholder="今天想记的事、突然想到的点子、要买的东西…">' +
      esc(n.text || '') + '</textarea>' +
      '</div>' +
      '<div class="sheet-foot"><div class="preview" id="noteHint">自动保存 · 换设备登录也能看到</div>' +
      '<div class="grow"></div>' +
      '<button class="btn primary" onclick="App.closeNote()">保存并关闭</button></div>',
      true
    );
    var ta = $('noteBody');
    if (!ta) return;
    ta.addEventListener('input', function () {
      var st = $('noteState');
      if (st) st.textContent = '正在保存…';
      clearTimeout(noteTimer);
      noteTimer = setTimeout(function () {
        SP.saveNote(ta.value);
        var st2 = $('noteState');
        if (st2) st2.textContent = noteStamp(SP.note().updatedAt);
      }, 600);
    });
    ta.focus();
    try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch (e) {}
  };

  App.closeNote = function () {
    noteFlush();
    App.closeModal();
    App.toast('便签已保存', (SP.note().text || '').trim() ? '' : '还没写内容，下次可以接着写');
  };

  /* ---------------- 新建 ---------------- */
  var form = { cat: '', repeat: 'none', dows: [] };

  App.openEvent = function (date, collId, catId) {
    var d = date || state.selected;
    form.cat = catId || SP.defaultCat(); form.repeat = 'none'; form.dows = [];
    /* 从工作集里新建时，默认归入当前集合 */
    var autoColl = (collId !== undefined) ? collId : activeCollId();
    form.collectionId = autoColl || '';
    App.modal(
      '<h3>新建一件事</h3><div class="sub">写在纸上，就不用一直记着。</div>' +
      '<div class="field"><label>标题</label><input id="fTitle" placeholder="例如：C 语言 · 指针" autofocus></div>' +
      '<div class="field-row-3">' +
      '<div class="field"><label>日期</label><input id="fDate" type="date" value="' + d + '" onchange="App.preview()"></div>' +
      '<div class="field"><label>开始</label><input id="fStart" type="time" value="14:30" onchange="App.preview()"></div>' +
      '<div class="field"><label>时长</label><select id="fDur"><option value="30">30 分钟</option><option value="60" selected>1 小时</option><option value="90">1.5 小时</option><option value="120">2 小时</option></select></div>' +
      '</div>' +
      '<div class="field"><label>分类</label><div class="pick" id="fCats">' +
      catPickerHTML(form.cat, 'App.pickCat') + '</div>' +
      '<p class="field-hint">点一下上面的分类，这件事就会带上对应标签，不用写在标题里。</p></div>' +
      '<div class="field"><label>工作集</label><select id="fColl">' +
      '<option value="">（不放进工作集）</option>' +
      SP.state.collections.map(function (c) {
        return '<option value="' + c.id + '"' + (c.id === form.collectionId ? ' selected' : '') + '>' + esc(c.name) + '</option>';
      }).join('') + '</select>' +
      (SP.state.collections.length
        ? ''
        : '<p class="field-hint">还没有工作集，可以去「工作集」页新建一个，把相关的事归在一起。</p>') +
      '</div>' +
      '<div class="field-row">' +
      '<div class="field"><label>提前提醒</label><select id="fRemind">' +
      [[0, '准时'], [10, '10 分钟前'], [20, '20 分钟前'], [30, '30 分钟前'], [60, '1 小时前'], [1440, '1 天前']].map(function (o) {
        return '<option value="' + o[0] + '"' + (o[0] === SP.state.settings.defaultRemind ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('') + '</select></div>' +
      '<div class="field"><label>重复</label><select id="fRepeat" onchange="App.onRepeatChange()"><option value="none">不重复</option><option value="daily">每天</option><option value="weekdays">每个工作日</option><option value="tuth">每周二、四</option><option value="custom">自定义星期</option></select></div>' +
      '</div>' +
      '<div class="field" id="fUntilWrap" style="display:none"><label>重复到</label><input id="fUntil" type="date" value="' + SP.D(13) + '" onchange="App.preview()"></div>' +
      '<div class="field" id="fDowWrap" style="display:none"><label>每周几</label><div class="dows" id="fDows">' +
      [1, 2, 3, 4, 5, 6, 0].map(function (w) { return '<button type="button" data-w="' + w + '" onclick="App.pickDow(' + w + ')">' + DOW_CN[w] + '</button>'; }).join('') +
      '</div></div>' +
      '<div class="sheet-foot"><button class="btn ghost sm" onclick="App.closeModal();App.openBatch()" style="border:1px solid var(--line);color:var(--accent)">批量排课 →</button><div class="grow"></div>' +
      '<div class="preview" id="fPreview"></div></div>' +
      '<div class="sheet-foot" style="border-top:none;padding-top:0"><div class="grow"></div>' +
      '<button class="btn ghost" onclick="App.closeModal()">取消</button>' +
      '<button class="btn primary" onclick="App.saveEvent()">写下来</button></div>',
      true
    );
    App.preview();
    setTimeout(function () { var t = $('fTitle'); if (t) t.focus(); }, 60);
  };

  App.pickCat = function (el) {
    form.cat = el.dataset.k;
    var box = el.parentNode;
    Array.prototype.forEach.call(box.children, function (b) { b.classList.toggle('on', b === el); });
    // 明确反馈：让用户知道「点这个分类 = 把这件事归到这一类」
    var name = catName(el.dataset.k);
    App.toast('已归到「' + name + '」', '写下来时会带这个分类标签');
  };

  App.pickDow = function (w) {
    var i = form.dows.indexOf(w);
    if (i >= 0) form.dows.splice(i, 1); else form.dows.push(w);
    document.querySelectorAll('#fDows button').forEach(function (b) {
      b.classList.toggle('on', form.dows.indexOf(Number(b.dataset.w)) >= 0);
    });
    App.preview();
  };

  App.onRepeatChange = function () {
    var v = $('fRepeat').value;
    form.repeat = v;
    $('fUntilWrap').style.display = v === 'none' ? 'none' : 'flex';
    $('fDowWrap').style.display = v === 'custom' ? 'flex' : 'none';
    App.preview();
  };

  function countPreview() {
    if (form.repeat === 'none') return 1;
    var from = $('fDate').value, until = $('fUntil').value;
    if (!from || !until) return 0;
    var d = SP.parseKey(from), end = SP.parseKey(until), n = 0, guard = 0;
    var span = Math.round((end - d) / 864e5) + 1;
    var cap = Math.max(400, span);
    while (d <= end && guard++ < cap) {
      var w = d.getDay();
      var hit = form.repeat === 'daily' ||
        (form.repeat === 'weekdays' && w >= 1 && w <= 5) ||
        (form.repeat === 'tuth' && (w === 2 || w === 4)) ||
        (form.repeat === 'custom' && form.dows.indexOf(w) >= 0);
      if (hit) n++;
      d = SP.addDays(d, 1);
    }
    return n;
  }

  App.preview = function () {
    var el = $('fPreview');
    if (!el) return;
    var n = countPreview();
    el.innerHTML = n <= 1 ? '只此一次' : '将创建 <b>' + n + '</b> 个日程';
  };

  App.saveEvent = function () {
    var title = ($('fTitle').value || '').trim() || '未命名的事';
    var data = {
      date: $('fDate').value, start: $('fStart').value || '09:00',
      dur: Number($('fDur').value), title: title, cat: form.cat,
      remind: Number($('fRemind').value),
      collectionId: ($('fColl') ? $('fColl').value : '') || null
    };
    var n = 1;
    if (form.repeat === 'none') {
      SP.addEvent(data);
    } else {
      if (form.repeat === 'custom' && !form.dows.length) form.dows = [new Date().getDay()];
      data.rule = form.repeat;
      data.until = $('fUntil').value;
      data.weekdays = form.dows;
      n = SP.addRepeat(data).length;
    }
    App.closeModal();
    state.selected = data.date;
    var d = SP.parseKey(data.date);
    state.cursor = new Date(d.getFullYear(), d.getMonth(), 1);
    render();
    App.toast(n > 1 ? '已写下 ' + n + ' 个日程' : '已写下一个日程', title + ' · ' + data.start);
  };

  /* ---------------- 批量排课 ---------------- */
  var batch = { dows: [2, 4] };

  App.openBatch = function () {
    batch.dows = [2, 4];
    App.modal(
      '<h3>批量排课</h3><div class="sub">像排课表一样，一次画满一整段时间。</div>' +
      '<div class="field"><label>内容</label><input id="bTitle" value="C 语言 · 结构体" autofocus></div>' +
      '<div class="field"><label>每周几</label><div class="dows" id="bDows">' +
      [1, 2, 3, 4, 5, 6, 0].map(function (w) {
        return '<button type="button" data-w="' + w + '" class="' + (batch.dows.indexOf(w) >= 0 ? 'on' : '') + '" onclick="App.batchDow(' + w + ')">' + DOW_CN[w] + '</button>';
      }).join('') + '</div></div>' +
      '<div class="field-row-3">' +
      '<div class="field"><label>开始日期</label><input id="bFrom" type="date" value="' + SP.D(2) + '" onchange="App.batchPreview()"></div>' +
      '<div class="field"><label>结束日期</label><input id="bTo" type="date" value="' + SP.D(40) + '" onchange="App.batchPreview()"></div>' +
      '<div class="field"><label>时间</label><input id="bTime" type="time" value="14:30" onchange="App.batchPreview()"></div>' +
      '</div>' +
      '<div class="field-row">' +
      '<div class="field"><label>时长</label><select id="bDur"><option value="60">1 小时</option><option value="90" selected>1.5 小时</option></select></div>' +
      '<div class="field"><label>提前提醒</label><select id="bRemind"><option value="10">10 分钟前</option><option value="20" selected>20 分钟前</option><option value="60">1 小时前</option></select></div>' +
      '</div>' +
      '<div class="sheet-foot"><div class="preview" id="bPreview"></div><div class="grow"></div>' +
      '<button class="btn ghost" onclick="App.closeModal()">取消</button>' +
      '<button class="btn primary" onclick="App.saveBatch()">排进去</button></div>',
      true
    );
    App.batchPreview();
  };

  App.batchDow = function (w) {
    var i = batch.dows.indexOf(w);
    if (i >= 0) batch.dows.splice(i, 1); else batch.dows.push(w);
    document.querySelectorAll('#bDows button').forEach(function (b) {
      b.classList.toggle('on', batch.dows.indexOf(Number(b.dataset.w)) >= 0);
    });
    App.batchPreview();
  };

  App.batchPreview = function () {
    var el = $('bPreview');
    if (!el) return;
    var from = $('bFrom').value, to = $('bTo').value, time = $('bTime').value;
    if (!from || !to || !batch.dows.length) { el.textContent = '选几天、选一段日子'; return; }
    var d = SP.parseKey(from), end = SP.parseKey(to), n = 0, conflict = 0, guard = 0;
    var span = Math.round((end - d) / 864e5) + 1;
    var cap = Math.max(400, span);
    while (d <= end && guard++ < cap) {
      var k = SP.dateKey(d);
      if (batch.dows.indexOf(d.getDay()) >= 0) {
        n++;
        if (SP.byDate(k).some(function (e) { return e.start === time; })) conflict++;
      }
      d = SP.addDays(d, 1);
    }
    el.innerHTML = '将在 ' + md(from) + '–' + md(to) + ' 创建 <b>' + n + '</b> 个日程' +
      (conflict ? '，其中 ' + conflict + ' 个与已有安排冲突' : '') + '，每次 ' + time;
  };

  App.saveBatch = function () {
    var title = ($('bTitle').value || '').trim() || '未命名';
    var from = $('bFrom').value, to = $('bTo').value, time = $('bTime').value;
    var dur = Number($('bDur').value), remind = Number($('bRemind').value);
    var d = SP.parseKey(from), end = SP.parseKey(to), n = 0, guard = 0;
    var span = Math.round((end - d) / 864e5) + 1;
    var cap = Math.max(400, span);
    while (d <= end && guard++ < cap) {
      if (batch.dows.indexOf(d.getDay()) >= 0) {
        SP.addEvent({ date: SP.dateKey(d), start: time, dur: dur, title: title, cat: SP.defaultCat(), remind: remind });
        n++;
      }
      d = SP.addDays(d, 1);
    }
    App.closeModal();
    render();
    App.toast('已排入 ' + n + ' 个日程', title + ' · 每周' + batch.dows.map(function (w) { return DOW_CN[w]; }).join('、') + ' ' + time);
  };

  /* ---------------- 搜索 ---------------- */
  var si = $('searchInput'), sr = $('results');
  if (si) {
    si.addEventListener('input', function () {
      var q = si.value.trim();
      if (!q) { sr.classList.remove('show'); return; }
      var hit = SP.state.events.filter(function (e) { return e.title.indexOf(q) >= 0; }).slice(0, 8);
      sr.innerHTML = hit.length ? hit.map(function (e) {
        return '<div class="res-item" onclick="App.jump(\'' + e.date + '\')">' +
          '<span class="cat-dot" style="--c:' + catColor(e.cat) + '"></span>' + esc(e.title) +
          '<em>' + md(e.date) + ' ' + e.start + '</em></div>';
      }).join('') : '<div class="res-item" style="color:var(--text-3)">没有找到「' + esc(q) + '」</div>';
      sr.classList.add('show');
    });
    si.addEventListener('blur', function () { setTimeout(function () { sr.classList.remove('show'); }, 160); });
  }

  App.jump = function (k) {
    if (si) { si.value = ''; sr.classList.remove('show'); }
    App.select(k);
    if (isMobile()) App.setMView('today');
  };

  /* 手机端没有顶栏搜索框，改成一个弹层 */
  App.mSearch = function () {
    App.modal(
      '<h3>搜索日程</h3><div class="sub">输入标题关键词，点结果直接跳到那天。</div>' +
      '<div class="field"><input id="mSearchInput" placeholder="例如：论文 / 英语 / 跑步" autocomplete="off"></div>' +
      '<div class="m-res" id="mSearchRes"></div>' +
      '<div class="sheet-foot"><div class="preview">共 ' + SP.state.events.length + ' 条日程</div><div class="grow"></div>' +
      '<button class="btn ghost" onclick="App.closeModal()">关闭</button></div>',
      true
    );
    var inp = $('mSearchInput');
    if (!inp) return;
    inp.addEventListener('input', function () {
      var q = inp.value.trim(), box = $('mSearchRes');
      if (!q) { box.innerHTML = '<div class="m-res-hint">输入关键词开始找</div>'; return; }
      var hit = SP.state.events.filter(function (e) { return e.title.indexOf(q) >= 0; })
        .sort(function (a, b) { return (b.date + b.start).localeCompare(a.date + a.start); })
        .slice(0, 12);
      box.innerHTML = hit.length ? hit.map(function (e) {
        return '<button class="m-res-item" onclick="App.closeModal();App.jump(\'' + e.date + '\')">' +
          '<span class="cat-dot" style="--c:' + catColor(e.cat) + '"></span>' +
          '<b>' + esc(e.title) + '</b><em>' + md(e.date) + ' ' + e.start + '</em>' +
          (e.done ? '<span class="m-res-done">已完成</span>' : '') + '</button>';
      }).join('') : '<div class="m-res-hint">没有找到「' + esc(q) + '」</div>';
    });
    inp.focus();
  };

  /* ---------------- Toast ---------------- */
  function dismissToast(el) {
    if (!el || el.dataset.gone) return;
    el.dataset.gone = '1';
    el.classList.add('out');
    setTimeout(function () { el.remove(); }, 320);
  }

  App.toast = function (title, sub, opts) {
    var w = $('toasts');
    var el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = '<span class="dot"></span><div><b>' + esc(title) + '</b>' +
      (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>';
    if (opts && opts.action) {
      var b = document.createElement('button');
      b.className = 'toast-act';
      b.textContent = opts.action.label;
      b.onclick = function () {
        try { opts.action.fn(); } catch (e) {}
        dismissToast(el);
      };
      el.appendChild(b);
    }
    w.appendChild(el);
    setTimeout(function () { dismissToast(el); }, (opts && opts.duration) || 3200);
  };

  /* ============================================================
     工作集（任务集）
     ============================================================ */
  function collectionRows(list, emptyText) {
    if (!list.length) return '<div class="empty" style="padding:10px 0">' + emptyText + '</div>';
    var now = Date.now();
    return list.map(function (e) {
      var d = SP.parseKey(e.date);
      var late = !e.done && SP.endMs(e) < now;
      return '<div class="col-ev ' + (e.done ? 'done ' : '') + (late ? 'late' : '') + '" style="--c:' + catColor(e.cat) + '" onclick="App.openDetail(\'' + e.id + '\')">' +
        '<span class="ce-date">' + (d.getMonth() + 1) + '/' + d.getDate() + '<em>周' + DOW_CN[d.getDay()] + '</em></span>' +
        '<span class="ce-time">' + e.start + '</span>' +
        '<span class="ce-title">' + esc(e.title) + '</span>' +
        '<span class="ce-tag">' + catName(e.cat) + '</span>' +
        (e.postponeCount ? '<span class="ce-post">顺延 ' + e.postponeCount + '</span>' : '') +
        (e.done ? '<span class="ce-state ok">完成</span>' : late ? '<span class="ce-state late">逾期</span>' : '<span class="ce-state">待办</span>') +
        '</div>';
    }).join('');
  }

  function renderCollections(el) {
    if (!el) el = $(isMobile() ? 'vm-collections' : 'v-collections');
    if (!el) return;
    var cols = SP.state.collections.slice();
    if (!colState.active && cols.length) colState.active = cols[0].id;

    var totalAll = SP.state.events.length;
    var cards = cols.map(function (c) {
      var s = SP.collectionStats(c.id);
      var pct = s.total ? Math.round(s.done / s.total * 100) : 0;
      return '<button class="col-card ' + (c.id === colState.active ? 'on' : '') + '" style="--c:' + catColor(c.cat) + '" onclick="App.pickCollection(\'' + c.id + '\')">' +
        '<div class="cc-top"><span class="cat-dot"></span><b>' + esc(c.name) + '</b><em>' + s.total + '</em></div>' +
        '<div class="cc-note">' + esc(c.note || '') + '</div>' +
        '<div class="cc-bar"><i style="width:' + pct + '%"></i></div>' +
        '<div class="cc-foot"><span>' + s.done + ' 完成 · ' + s.left + ' 待办</span>' +
        (s.overdue ? '<em class="cc-late">' + s.overdue + ' 逾期</em>' : '<em>' + pct + '%</em>') + '</div>' +
        '</button>';
    }).join('');

    var unassigned = SP.state.events.filter(function (e) { return !e.collectionId; });
    if (unassigned.length) {
      var ud = unassigned.filter(function (e) { return e.done; }).length;
      cards += '<button class="col-card ' + (colState.active === '__none__' ? 'on' : '') +
        '" style="--c:var(--text-3)" onclick="App.pickCollection(\'__none__\')">' +
        '<div class="cc-top"><span class="cat-dot"></span><b>未归类</b><em>' + unassigned.length + '</em></div>' +
        '<div class="cc-note">还没放进工作集的日程</div>' +
        '<div class="cc-bar"><i style="width:' + Math.round(ud / unassigned.length * 100) + '%"></i></div>' +
        '<div class="cc-foot"><span>' + ud + ' 完成 · ' + (unassigned.length - ud) + ' 待办</span><em>整理 →</em></div>' +
        '</button>';
    }

    var active = colState.active === '__none__'
      ? { id: '__none__', name: '未归类', note: '这些日程还没放进工作集，点开条目可以在详情里归类。', cat: 'study' }
      : cols.filter(function (c) { return c.id === colState.active; })[0];
    var list = active
      ? (active.id === '__none__' ? unassigned.slice().sort(function (a, b) { return (a.date + a.start).localeCompare(b.date + b.start); }) : SP.collectionEvents(active.id))
      : [];
    var now = Date.now();
    var overdueList = list.filter(function (e) { return !e.done && SP.endMs(e) < now; });
    var todoList = list.filter(function (e) { return !e.done && SP.endMs(e) >= now; });
    var doneList = list.filter(function (e) { return e.done; }).reverse();
    var st = active
      ? (active.id === '__none__'
        ? (function () {
            var doneN = unassigned.filter(function (e) { return e.done; }).length;
            return {
              total: unassigned.length, done: doneN, left: unassigned.length - doneN,
              overdue: unassigned.filter(function (e) { return !e.done && SP.endMs(e) < Date.now(); }).length,
              span: unassigned.length ? [list[0].date, list[list.length - 1].date] : null
            };
          })()
        : SP.collectionStats(active.id))
      : { total: 0, done: 0, left: 0, overdue: 0 };

    var detail = active ? (
      '<div class="col-head">' +
      '<div class="ch-l"><h2>' + esc(active.name) + '</h2>' +
      '<p>' + esc(active.note || '还没有写说明') + '</p></div>' +
      '<div class="ch-r">' +
      (active.id === '__none__'
        ? '<button class="btn sm" onclick="App.autoAssign()">按标题自动归类</button>'
        : '<button class="btn sm ghost" onclick="App.editCollection()">重命名</button>' +
          '<button class="btn sm ghost" onclick="App.removeCollection()">删除</button>') +
      '<button class="btn sm" onclick="App.openEvent()">加一件事</button>' +
      '</div></div>' +
      '<div class="col-stats">' +
      '<div><b>' + st.total + '</b><span>全部任务</span></div>' +
      '<div><b>' + st.done + '</b><span>已完成</span></div>' +
      '<div><b>' + st.left + '</b><span>待办</span></div>' +
      '<div class="' + (st.overdue ? 'warn' : '') + '"><b>' + st.overdue + '</b><span>已逾期</span></div>' +
      (st.span ? '<div class="span"><b>' + md(st.span[0]) + ' – ' + md(st.span[1]) + '</b><span>时间跨度</span></div>' : '') +
      '</div>' +
      '<div class="col-block"><h4>待办 · ' + todoList.length + '</h4>' + collectionRows(todoList, '这个工作集暂时没有待办。') + '</div>' +
      (overdueList.length ? '<div class="col-block"><h4 class="late">已逾期 · ' + overdueList.length + '</h4>' + collectionRows(overdueList, '') + '</div>' : '') +
      '<div class="col-block"><h4>已完成 · ' + doneList.length + '</h4>' + collectionRows(doneList, '还没有完成任何一件。') + '</div>'
    ) : '<div class="empty">还没有工作集，先建一个吧。</div>';

    el.innerHTML =
      '<div class="col-page">' +
      '<aside class="col-list">' +
      '<div class="col-list-head">工作集<span>' + cols.length + '</span></div>' +
      cards +
      '<button class="col-new" onclick="App.newCollection()">＋ 新建工作集</button>' +
      '<div class="col-total">共 ' + totalAll + ' 件日程 · ' + cols.length + ' 个集合</div>' +
      '</aside>' +
      '<section class="col-detail">' + detail + '</section>' +
      '</div>';
  }

  App.autoAssign = function () {
    var n = 0;
    SP.state.events.forEach(function (e) {
      if (e.collectionId) return;
      var cid = SP.guessCollection(e.title);
      if (cid) { e.collectionId = cid; n++; }
    });
    if (n) { SP.save(); }
    render();
    App.toast(n ? '已归类 ' + n + ' 件' : '没有可以自动归类的',
      n ? '按标题关键词匹配到了工作集' : '可以点开条目手动选择工作集');
  };

  App.pickCollection = function (id) {
    colState.active = id;
    renderCollections();
    if (isMobile()) $('vm-collections').scrollTop = 0;
  };

  /* ============================================================
     分类（v1.8.0）：列表 + 详情，可新建 / 改名 / 改描述 / 删除
     版式沿用工作集页的 col-page / col-list / col-detail，不引入新的视觉语言
     ============================================================ */
  var catState = { active: null };

  function catEventRows(list) {
    return collectionRows(list.slice().sort(function (a, b) {
      return (a.date + a.start).localeCompare(b.date + b.start);
    }), '这个分类下还没有日程。');
  }

  function catTaskRows(list) {
    if (!list.length) return '<div class="empty" style="padding:10px 0">这个分类下还没有计划。</div>';
    return list.map(function (t) {
      var p = SP.taskProgress(t);
      return '<div class="col-ev" style="--c:' + catColor(t.cat) + '" onclick="App.taskMenu(\'' + t.id + '\')">' +
        '<span class="ce-date">' + md(t.start) + '<em>起始</em></span>' +
        '<span class="ce-time">' + Math.round(p.pct) + '%</span>' +
        '<span class="ce-title">' + esc(t.title) + '</span>' +
        '<span class="ce-tag">' + p.cur + '/' + t.target + ' ' + esc(t.unit) + '</span>' +
        '<span class="ce-state">' + (p.pct >= 100 ? '已完成' : '进行中') + '</span>' +
        '</div>';
    }).join('');
  }

  function renderCats(el) {
    if (!el) el = $(isMobile() ? 'vm-cats' : 'v-cats');
    if (!el) return;
    var list = SP.catList();
    var hit = list.filter(function (c) { return c.id === catState.active; })[0];
    if (!hit) catState.active = list.length ? list[0].id : null;

    var totalEvents = SP.state.events.length;
    var totalTasks = SP.state.tasks.length;

    var cards = list.map(function (c) {
      var u = SP.catUsage(c.id);
      var pct = totalEvents ? Math.round(u.events / totalEvents * 100) : 0;
      return '<button class="col-card ' + (c.id === catState.active ? 'on' : '') + '" style="--c:' + catColor(c.id) + '" onclick="App.pickCatCard(\'' + c.id + '\')">' +
        '<div class="cc-top"><span class="cat-dot"></span><b>' + esc(c.name) + '</b><em>' + u.total + '</em></div>' +
        '<div class="cc-note">' + esc(c.desc || '还没有写描述') + '</div>' +
        '<div class="cc-bar"><i style="width:' + pct + '%"></i></div>' +
        '<div class="cc-foot"><span>' + u.events + ' 日程 · ' + u.tasks + ' 计划</span><em>' + (u.collections ? u.collections + ' 工作集' : pct + '% 日程') + '</em></div>' +
        '</button>';
    }).join('');

    var active = list.filter(function (c) { return c.id === catState.active; })[0];
    var detail;
    if (!active) {
      detail = '<div class="empty">还没有分类，先建一个吧。</div>';
    } else {
      var evs = SP.state.events.filter(function (e) { return e.cat === active.id; });
      var tks = SP.state.tasks.filter(function (t) { return t.cat === active.id; });
      var cols = SP.state.collections.filter(function (c) { return c.cat === active.id; });
      var doneN = evs.filter(function (e) { return e.done; }).length;
      detail = '<div class="col-head">' +
        '<div class="ch-l"><h2>' + esc(active.name) + '</h2>' +
        '<p>' + esc(active.desc || '还没有写描述') + '</p></div>' +
        '<div class="ch-r">' +
        '<button class="btn sm ghost" onclick="App.editCat(\'' + active.id + '\')">重命名 / 改描述</button>' +
        '<button class="btn sm ghost" onclick="App.removeCat(\'' + active.id + '\')">删除</button>' +
        '<button class="btn sm" onclick="App.openEvent(undefined, undefined, \'' + active.id + '\')">加一件事</button>' +
        '</div></div>' +
        '<div class="col-stats">' +
        '<div><b>' + evs.length + '</b><span>日程</span></div>' +
        '<div><b>' + doneN + '</b><span>已完成</span></div>' +
        '<div><b>' + tks.length + '</b><span>计划</span></div>' +
        '<div><b>' + cols.length + '</b><span>工作集</span></div>' +
        '</div>' +
        '<div class="col-block"><h4>日程 · ' + evs.length + '</h4>' + catEventRows(evs) + '</div>' +
        '<div class="col-block"><h4>计划 · ' + tks.length + '</h4>' + catTaskRows(tks) + '</div>' +
        (cols.length ? '<div class="col-block"><h4>工作集 · ' + cols.length + '</h4>' +
          cols.map(function (c) {
            return '<div class="col-ev" style="--c:' + catColor(c.cat) + '" onclick="App.pickCollection(\'' + c.id + '\');App.setView(\'collections\')">' +
              '<span class="ce-title">' + esc(c.name) + '</span>' +
              '<span class="ce-tag">' + esc(c.note || '') + '</span></div>';
          }).join('') + '</div>' : '');
    }

    el.innerHTML =
      '<div class="col-page">' +
      '<aside class="col-list">' +
      '<div class="col-list-head">分类<span>' + list.length + '</span></div>' +
      cards +
      '<button class="col-new" onclick="App.newCat()">＋ 新建分类</button>' +
      '<div class="col-total">共 ' + totalEvents + ' 件日程 · ' + totalTasks + ' 个计划</div>' +
      '</aside>' +
      '<section class="col-detail">' + detail + '</section>' +
      '</div>';
  }

  App.pickCatCard = function (id) {
    catState.active = id;
    renderCats();
    if (isMobile()) $('vm-cats').scrollTop = 0;
  };

  /* 新建 / 编辑共用一个表单 */
  function catForm(c) {
    return '<div class="field"><label>名称</label><input id="catName" maxlength="12" autofocus value="' + (c ? esc(c.name) : '') + '" placeholder="例如：副业 / 阅读 / 健身"></div>' +
      '<div class="field"><label>描述</label><input id="catDesc" maxlength="60" value="' + (c ? esc(c.desc || '') : '') + '" placeholder="一句话说明这类事都放什么"></div>';
  }

  App.newCat = function () {
    App.modal(
      '<h3>新建分类</h3><div class="sub">分类是给日程和计划打标签的，名字和描述都可以改。</div>' +
      catForm(null) +
      '<div class="sheet-foot"><div class="grow"></div>' +
      '<button class="btn ghost" onclick="App.closeModal()">取消</button>' +
      '<button class="btn primary" onclick="App.saveCat()">创建</button></div>',
      true
    );
  };

  App.editCat = function (id) {
    var c = SP.catById(id);
    if (!c) return;
    App.modal(
      '<h3>修改分类</h3><div class="sub">改完立刻生效，已经用这个分类的日程和计划会跟着一起变。</div>' +
      catForm(c) +
      '<div class="sheet-foot"><div class="grow"></div>' +
      '<button class="btn ghost" onclick="App.closeModal()">取消</button>' +
      '<button class="btn primary" onclick="App.saveCat(\'' + id + '\')">保存</button></div>',
      true
    );
  };

  App.saveCat = function (id) {
    var name = ($('catName').value || '').trim();
    var desc = ($('catDesc').value || '').trim();
    if (!name) { App.toast('给分类起个名字'); return; }
    var r = id ? SP.updateCat(id, { name: name, desc: desc }) : SP.addCat(name, desc);
    if (r.error) { App.toast(r.error); return; }
    if (!id) catState.active = r.cat.id;
    App.closeModal();
    render();
    App.toast(id ? '分类已更新' : '分类已创建', name);
  };

  App.removeCat = function (id) {
    var c = SP.catById(id);
    if (!c) return;
    var u = SP.catUsage(id);
    if (SP.catList().length <= 1) {
      App.toast('至少保留一个分类', '可以先新建一个再删这个');
      return;
    }
    if (!u.total) {
      App.modal(
        '<h3>删除「' + esc(c.name) + '」？</h3>' +
        '<div class="sub">这个分类下还没有任何日程、计划和工作集，删掉不影响别的内容。</div>' +
        '<div class="sheet-foot"><div class="grow"></div>' +
        '<button class="btn ghost" onclick="App.closeModal()">再想想</button>' +
        '<button class="btn primary danger" onclick="App.doRemoveCat(\'' + id + '\')">确认删除</button></div>',
        true
      );
      return;
    }
    /* 还有内容在用：必须明确选择"转到哪个分类"，不做静默解除关联 */
    var others = SP.catList().filter(function (x) { return x.id !== id; });
    App.modal(
      '<h3>删除「' + esc(c.name) + '」？</h3>' +
      '<div class="sub">这个分类还在被使用：' +
      (u.events ? u.events + ' 件日程' : '') +
      (u.events && (u.tasks || u.collections) ? '、' : '') +
      (u.tasks ? u.tasks + ' 个计划' : '') +
      (u.tasks && u.collections ? '、' : '') +
      (u.collections ? u.collections + ' 个工作集' : '') +
      '。删除前请指定它们转到哪个分类。</div>' +
      '<div class="field"><label>把这些内容转到</label><select id="catMoveTo">' +
      others.map(function (x) {
        return '<option value="' + x.id + '">' + esc(x.name) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="sheet-foot"><div class="grow"></div>' +
      '<button class="btn ghost" onclick="App.closeModal()">取消</button>' +
      '<button class="btn primary danger" onclick="App.doRemoveCat(\'' + id + '\', document.getElementById(\'catMoveTo\').value)">转移并删除</button></div>',
      true
    );
  };

  App.doRemoveCat = function (id, moveTo) {
    var r = SP.removeCat(id, moveTo || null);
    if (r.error) { App.toast(r.error); return; }
    if (catState.active === id) catState.active = null;
    App.closeModal();
    render();
    App.toast('分类已删除', r.moved ? r.moved + ' 项内容已转到其它分类' : '「' + r.cat.name + '」已移除');
  };

  App.newCollection = function () {
    colState.newCat = SP.defaultCat();
    App.modal(
      '<h3>新建工作集</h3><div class="sub">把同一类事装进一个抽屉，方便一起看。</div>' +
      '<div class="field"><label>名称</label><input id="cName" placeholder="例如：C 语言期末" autofocus></div>' +
      '<div class="field"><label>一句话说明</label><input id="cNote" placeholder="12 月考试，重点是指针和树"></div>' +
      '<div class="field"><label>分类</label><div class="pick" id="cCats">' +
      catPickerHTML(colState.newCat, 'App.pickCollectionCat') + '</div></div>' +
      '<div class="sheet-foot"><div class="grow"></div>' +
      '<button class="btn ghost" onclick="App.closeModal()">取消</button>' +
      '<button class="btn primary" onclick="App.saveCollection()">创建</button></div>',
      true
    );
  };

  App.pickCollectionCat = function (el) {
    colState.newCat = el.dataset.k;
    var box = el.parentNode;
    Array.prototype.forEach.call(box.children, function (b) { b.classList.toggle('on', b === el); });
  };

  App.saveCollection = function () {
    var name = ($('cName').value || '').trim();
    if (!name) { App.toast('给它起个名字'); return; }
    var c = SP.addCollection(name, colState.newCat, ($('cNote').value || '').trim());
    colState.active = c.id;
    App.closeModal();
    render();
    App.toast('工作集已创建', name);
  };

  App.editCollection = function () {
    var c = SP.state.collections.filter(function (x) { return x.id === colState.active; })[0];
    if (!c) return;
    var name = prompt('新的名称', c.name);
    if (name === null) return;
    var note = prompt('一句话说明', c.note || '');
    SP.updateCollection(c.id, { name: name.trim() || c.name, note: note === null ? c.note : note });
    render();
    App.toast('已更新');
  };

  App.removeCollection = function () {
    var c = SP.state.collections.filter(function (x) { return x.id === colState.active; })[0];
    if (!c) return;
    if (!confirm('删除「' + c.name + '」？里面的日程会保留，只是不再归类。')) return;
    SP.removeCollection(c.id);
    colState.active = SP.state.collections[0] ? SP.state.collections[0].id : null;
    render();
    App.toast('已删除工作集');
  };

  /* ============================================================
     一句话速记
     ============================================================ */
  var capParse = null;

  App.openCapture = function () {
    App.modal(
      '<h3>一句话速记</h3><div class="sub">像发消息一样写下来，剩下的交给它。</div>' +
      '<div class="cap-box"><input id="capInput" class="cap-input" placeholder="明天下午三点半 跟导师讨论论文 1小时 提前20分钟" autocomplete="off"></div>' +
      '<div class="cap-preview" id="capPreview"><span class="hint">试试：每周二四 14:30 学 C 语言 到 11月20日</span></div>' +
      '<div class="cap-examples">' +
      ['明天 10:00 组会 1.5小时', '每周二四 14:30 学 C 语言 到 11月20日', '今晚8点 给妈妈打电话', '每天 早上7点 跑步 30分钟', '周五 下午4点 英语课 提前20分钟'].map(function (t) {
        return '<button type="button" onclick="App.capFill(this)">' + t + '</button>';
      }).join('') + '</div>' +
      '<div class="sheet-foot"><div class="preview">支持：今天 / 明天 / 周X / 10月20日 · 下午3点 / 14:30 · 1小时 / 30分钟 · 每天 / 每周二四 / 工作日 · 提前20分钟</div><div class="grow"></div>' +
      '<button class="btn ghost" onclick="App.closeModal()">取消</button>' +
      '<button class="btn primary" onclick="App.saveCapture()">记下来</button></div>',
      true
    );
    var inp = $('capInput');
    if (inp) {
      inp.addEventListener('input', App.capPreview);
      inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') App.saveCapture(); });
      inp.focus();
    }
  };

  App.capFill = function (btn) {
    var inp = $('capInput');
    if (!inp) return;
    inp.value = btn.textContent;
    inp.focus();
    App.capPreview();
  };

  App.capPreview = function () {
    var inp = $('capInput');
    var box = $('capPreview');
    if (!inp || !box) return;
    var text = inp.value.trim();
    if (!text) { box.innerHTML = '<span class="hint">试试：每周二四 14:30 学 C 语言 到 11月20日</span>'; capParse = null; return; }
    var r = SP.parseQuick(text);
    capParse = r;
    var bits = [];
    bits.push('<b>' + esc(r.title) + '</b>');
    bits.push(r.date + ' ' + r.start);
    bits.push(r.dur + ' 分钟');
    bits.push(catName(r.cat));
    if (r.rule !== 'none') {
      var ruleTxt = r.rule === 'daily' ? '每天' : r.rule === 'weekdays' ? '工作日'
        : r.rule === 'weekly' ? '每周' : '每周' + r.weekdays.map(function (w) { return DOW_CN[w]; }).join('、');
      bits.push(ruleTxt + ' · 到 ' + r.until);
    }
    if (r.remind !== null && r.remind !== undefined) bits.push('提前 ' + r.remind + ' 分');
    box.innerHTML = '<div class="cap-out">' + bits.map(function (b, i) {
      return '<span class="' + (i === 0 ? 'ttl' : '') + '">' + b + '</span>';
    }).join('<i>·</i>') + '</div>' +
      (r.rolledToTomorrow ? '<div class="cap-warn">今天这个点已经过了，已排到明天</div>' : '');
  };

  App.saveCapture = function () {
    var inp = $('capInput');
    if (!inp) return;
    var text = inp.value.trim();
    if (!text) { App.toast('先写点什么'); return; }
    var r = capParse || SP.parseQuick(text);
    var data = {
      date: r.date, start: r.start, dur: r.dur, title: r.title, cat: r.cat,
      remind: (r.remind === null || r.remind === undefined) ? SP.state.settings.defaultRemind : r.remind,
      collectionId: activeCollId() || null
    };
    var n = 1;
    if (r.rule === 'none') {
      SP.addEvent(data);
    } else {
      data.rule = r.rule;
      data.until = r.until;
      data.weekdays = r.weekdays && r.weekdays.length ? r.weekdays : [SP.parseKey(r.date).getDay()];
      n = SP.addRepeat(data).length;
    }
    App.closeModal();
    state.selected = r.date;
    var d = SP.parseKey(r.date);
    state.cursor = new Date(d.getFullYear(), d.getMonth(), 1);
    render();
    App.toast(n > 1 ? '已记下 ' + n + ' 个日程' : '已记下', r.title + ' · ' + r.date + ' ' + r.start);
  };

  /* ============================================================
     拖拽改期
     ============================================================ */
  var mDrag = null, wDrag = null, justDragged = false;

  /* 月历：HTML5 拖放（跨天移动 / Alt 复制） */
  document.addEventListener('dragstart', function (ev) {
    var chip = ev.target.closest ? ev.target.closest('.chip[data-id]') : null;
    if (!chip) return;
    mDrag = { id: chip.dataset.id, copy: !!ev.altKey };
    if (ev.dataTransfer) {
      ev.dataTransfer.effectAllowed = 'copyMove';
      try { ev.dataTransfer.setData('text/plain', mDrag.id); } catch (e) {}
    }
    chip.classList.add('is-drag');
  });

  document.addEventListener('dragend', function () {
    document.querySelectorAll('.chip.is-drag').forEach(function (c) { c.classList.remove('is-drag'); });
    document.querySelectorAll('.cell.drop').forEach(function (c) { c.classList.remove('drop'); });
    setTimeout(function () { mDrag = null; }, 0);
  });

  document.addEventListener('dragover', function (ev) {
    var cell = ev.target.closest ? ev.target.closest('.cell[data-date]') : null;
    if (!cell || !mDrag) return;
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = mDrag.copy ? 'copy' : 'move';
    document.querySelectorAll('.cell.drop').forEach(function (c) { if (c !== cell) c.classList.remove('drop'); });
    cell.classList.add('drop');
  });

  document.addEventListener('drop', function (ev) {
    var cell = ev.target.closest ? ev.target.closest('.cell[data-date]') : null;
    if (!cell || !mDrag) return;
    ev.preventDefault();
    var src = SP.getEvent(mDrag.id);
    var to = cell.dataset.date;
    cell.classList.remove('drop');
    if (!src) return;
    if (mDrag.copy || ev.altKey) {
      SP.addEvent({
        date: to, start: src.start, dur: src.dur, title: src.title, cat: src.cat,
        remind: src.remind, note: src.note, sub: JSON.parse(JSON.stringify(src.sub || []))
      });
      App.toast('已复制到 ' + md(to), src.title + ' · ' + src.start);
    } else if (src.date !== to) {
      SP.update(src.id, { date: to });
      App.toast('已移到 ' + md(to), src.title + ' · ' + src.start);
    }
    mDrag = null;
    render();
  });

  /* 周表：指针拖拽（15 分钟吸附，Alt 复制） */
  document.addEventListener('pointerdown', function (ev) {
    if (isMobile() || ev.button !== 0) return;
    var b = ev.target.closest ? ev.target.closest('.ev-block[data-id]') : null;
    if (!b) return;
    var col = b.parentElement.getBoundingClientRect();
    wDrag = {
      el: b, id: b.dataset.id, sx: ev.clientX, sy: ev.clientY,
      date: b.dataset.date, start: b.dataset.start,
      colW: Math.max(col.width, 1), dDays: 0, dMins: 0, moved: false, copy: !!ev.altKey
    };
    try { b.setPointerCapture(ev.pointerId); } catch (e) {}
  });

  document.addEventListener('pointermove', function (ev) {
    if (!wDrag) return;
    var dx = ev.clientX - wDrag.sx, dy = ev.clientY - wDrag.sy;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) wDrag.moved = true;
    if (!wDrag.moved) return;
    wDrag.dDays = Math.round(dx / wDrag.colW);
    wDrag.dMins = Math.round(dy / (WEEK_HH / 60) / 15) * 15;
    wDrag.el.classList.add('dragging');
    wDrag.el.style.transform = 'translate(' + dx + 'px,' + (wDrag.dMins / 60 * WEEK_HH) + 'px)';
    wDrag.el.dataset.hint = (wDrag.dDays ? (wDrag.dDays > 0 ? '+' : '') + wDrag.dDays + ' 天 ' : '') +
      (wDrag.dMins ? (wDrag.dMins > 0 ? '+' : '') + wDrag.dMins + ' 分' : '');
  }, { passive: true });

  document.addEventListener('pointerup', function () {
    if (!wDrag) return;
    var d = wDrag, done = false;
    if (d.moved) {
      var nd = SP.dateKey(SP.addDays(SP.parseKey(d.date), d.dDays || 0));
      var ns = SP.hhmmOf(SP.minutesOf(d.start) + (d.dMins || 0));
      var src = SP.getEvent(d.id);
      if (src && (nd !== src.date || ns !== src.start)) {
        if (d.copy) {
          SP.addEvent({ date: nd, start: ns, dur: src.dur, title: src.title, cat: src.cat, remind: src.remind, note: src.note });
          App.toast('已复制到 ' + md(nd) + ' ' + ns, src.title);
        } else {
          SP.update(src.id, { date: nd, start: ns });
          App.toast('已改为 ' + md(nd) + ' ' + ns, src.title);
        }
        done = true;
      }
      justDragged = true;
      setTimeout(function () { justDragged = false; }, 260);
    }
    d.el.classList.remove('dragging');
    d.el.style.transform = '';
    wDrag = null;
    if (done) render();
  });

  App.openChip = function (id, k) {
    if (justDragged) { justDragged = false; return; }
    App.select(k);
    App.openDetail(id);
  };

  App.blockClick = function (ev, id) {
    if (justDragged) { justDragged = false; ev.stopPropagation(); return; }
    App.openDetail(id);
  };

  /* ============================================================
     日程详情
     ============================================================ */
  var detailRoot = $('detailRoot');
  var detailId = null;
  var delArm = 0;

  App.openDetail = function (id) {
    var e = SP.getEvent(id);
    if (!e) return;
    detailId = id;
    delArm = 0;
    renderDetail();
    detailRoot.classList.add('on');
  };

  App.closeDetail = function () {
    detailRoot.classList.remove('on');
    detailId = null;
  };

  function renderDetail() {
    var e = SP.getEvent(detailId);
    if (!e) return;
    var subs = e.sub || [];
    var doneN = subs.filter(function (x) { return x.done; }).length;
    var d = SP.parseKey(e.date);
    var remindOpts = [[0, '准时'], [5, '提前 5 分钟'], [10, '提前 10 分钟'], [15, '提前 15 分钟'],
      [20, '提前 20 分钟'], [30, '提前 30 分钟'], [60, '提前 1 小时'], [1440, '提前 1 天']];
    var durOpts = [15, 30, 45, 60, 90, 120, 180];

    $('detailPanel').innerHTML =
      '<div class="d-head">' +
      '<div class="d-top"><span class="cat-dot" style="--c:' + catColor(e.cat) + '"></span>' +
      '<span class="cat-n">' + catName(e.cat) + (e.seriesId ? ' · 重复日程' : '') + (e.done ? ' · 已完成' : '') + '</span>' +
      '<button class="close" onclick="App.closeDetail()" aria-label="关闭"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      '<input class="d-title" value="' + esc(e.title) + '" onchange="App.detailUpdate(\'title\', this.value)" aria-label="标题">' +
      '<div class="d-sub">' + (d.getMonth() + 1) + '月' + d.getDate() + '日 周' + DOW_CN[d.getDay()] +
      ' · ' + e.start + '–' + SP.endTime(e) + ' · ' + e.dur + ' 分钟' +
      (e.auto ? ' · 时间已过，已自动完成' : '') + '</div>' +
      '</div>' +
      '<div class="d-body">' +
      '<div class="d-sec"><h5>属性</h5><div class="d-grid">' +
      '<div class="d-field"><label>日期</label><input type="date" value="' + e.date + '" onchange="App.detailUpdate(\'date\', this.value)"></div>' +
      '<div class="d-field"><label>开始</label><input type="time" value="' + e.start + '" onchange="App.detailUpdate(\'start\', this.value)"></div>' +
      '<div class="d-field"><label>时长</label><select onchange="App.detailUpdate(\'dur\', this.value)">' +
      durOpts.map(function (v) { return '<option value="' + v + '"' + (v === e.dur ? ' selected' : '') + '>' + v + ' 分钟</option>'; }).join('') +
      '</select></div>' +
      '<div class="d-field"><label>提醒</label><select onchange="App.detailUpdate(\'remind\', this.value)">' +
      remindOpts.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === e.remind ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
      '</select></div>' +
      '</div>' +
      '<div class="pick" style="margin-top:12px" id="dCats">' +
      catPickerHTML(e.cat, 'App.pickDetailCat') + '</div>' +
      '<p class="field-hint" style="margin-top:4px">点一下分类标签，就能给这件事换个分类。</p>' +
      '<div class="d-grid" style="margin-top:12px">' +
      '<div class="d-field"><label>工作集</label><select onchange="App.detailUpdate(\'collectionId\', this.value)">' +
      '<option value="">未归类</option>' +
      SP.state.collections.map(function (c) {
        return '<option value="' + c.id + '"' + (e.collectionId === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="d-field"><label>当前状态</label><div class="d-static">' +
      (e.done ? '已完成' : (SP.endMs(e) < Date.now() ? '已过期' : '待办')) +
      (e.postponeCount ? ' · 顺延过 ' + e.postponeCount + ' 次' : '') + '</div></div>' +
      '</div></div>' +

      '<div class="d-sec d-post"><h5>顺延</h5>' +
      '<div class="post-opts">' +
      '<button type="button" onclick="App.quickPostpone(\'tonight\')">今晚</button>' +
      '<button type="button" onclick="App.quickPostpone(\'tomorrow\')">明天此刻</button>' +
      '<button type="button" onclick="App.quickPostpone(\'p2\')">后天</button>' +
      '<button type="button" onclick="App.quickPostpone(\'nextweek\')">下周同一天</button>' +
      '</div>' +
      '<div class="d-grid" style="margin-top:10px">' +
      '<div class="d-field"><label>顺延到</label><input type="datetime-local" id="postAt" value="' +
      e.date + 'T' + e.start + '"></div>' +
      '<div class="d-field"><label>为什么没做完</label><input id="postReason" placeholder="可留空" value="' +
      esc(e.postponeReason || '') + '"></div>' +
      '</div>' +
      '<div class="post-reasons">' +
      (SP.state.settings.postponeReasons || []).map(function (r) {
        return '<button type="button" onclick="App.fillReason(this)">' + r + '</button>';
      }).join('') + '</div>' +
      '<div class="post-foot"><span class="post-hist">' +
      (e.postponeCount ? '已顺延 ' + e.postponeCount + ' 次' + (e.postponeReason ? ' · 上次：' + esc(e.postponeReason) : '') : '还没顺延过') +
      '</span><button class="btn sm" onclick="App.doPostpone()">确认顺延</button></div>' +
      '</div>' +

      '<div class="d-sec"><h5>子任务 ' + doneN + '/' + subs.length + '</h5><div class="d-sub-list">' +
      (subs.length ? subs.map(function (x) {
        return '<div class="d-subitem ' + (x.done ? 'done' : '') + '">' +
          '<button class="check ' + (x.done ? 'on' : '') + '" onclick="App.toggleSub(\'' + x.id + '\')" aria-label="切换子任务">' +
          '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"/></svg></button>' +
          '<span class="txt">' + esc(x.text) + '</span>' +
          '<button class="x" onclick="App.removeSub(\'' + x.id + '\')" aria-label="删除子任务">×</button></div>';
      }).join('') : '<div class="empty" style="padding:4px 0">把这件事拆成几步，会更容易开始。</div>') +
      '</div><div class="d-add"><input id="subInput" placeholder="添加一步…" onkeydown="if(event.key===\'Enter\'){App.addSub()}">' +
      '<button class="btn sm" onclick="App.addSub()">添加</button></div></div>' +

      '<div class="d-sec"><h5>备注</h5><textarea class="d-note" onchange="App.detailUpdate(\'note\', this.value)" placeholder="要带的东西、要问的问题、随手记…">' + esc(e.note || '') + '</textarea></div>' +
      '</div>' +
      '<div class="d-foot">' +
      '<button class="btn sm" onclick="App.detailToggle()">' + (e.done ? '取消完成' : '标记完成') + '</button>' +
      '<button class="btn sm ghost" onclick="App.detailDuplicate()">复制</button>' +
      '<button class="btn sm ghost d-del" onclick="App.detailDelete()">删除</button>' +
      '</div>';
  }

  /* 详情面板里的分类：点一下立刻改（本地先改，再同步到服务端） */
  App.pickDetailCat = function (el) {
    var box = el.parentNode;
    Array.prototype.forEach.call(box.children, function (b) { b.classList.toggle('on', b === el); });
    App.detailUpdate('cat', el.dataset.k);
    App.toast('已改到「' + catName(el.dataset.k) + '」', '这个日程的分类已更新');
  };

  App.detailUpdate = function (k, v) {
    if (!detailId) return;
    var patch = {};
    patch[k] = (k === 'dur' || k === 'remind') ? Number(v) : (k === 'collectionId' ? (v || null) : v);
    if (k === 'title' && !String(v).trim()) return;
    SP.update(detailId, patch);
    if (k === 'date') {
      state.selected = v;
      var d = SP.parseKey(v);
      state.cursor = new Date(d.getFullYear(), d.getMonth(), 1);
    }
    render();
    if (k !== 'title' && k !== 'note') renderDetail();
  };

  App.fillReason = function (btn) {
    var inp = $('postReason');
    if (inp) { inp.value = btn.textContent; inp.focus(); }
  };

  function postponeTo(dateStr, start, reason) {
    var e = SP.getEvent(detailId);
    if (!e) return;
    var from = { date: e.date, start: e.start, count: e.postponeCount || 0, reason: e.postponeReason || '' };
    SP.postpone(detailId, { date: dateStr, start: start, reason: reason });
    state.selected = dateStr;
    var d = SP.parseKey(dateStr);
    state.cursor = new Date(d.getFullYear(), d.getMonth(), 1);
    render();
    renderDetail();
    App.toast('已顺延到 ' + md(dateStr) + ' ' + start,
      (reason ? '原因：' + reason + ' · ' : '') + e.title, {
        duration: 5200,
        action: {
          label: '撤销',
          fn: function () {
            SP.update(detailId, {
              date: from.date, start: from.start, done: false,
              postponeCount: from.count, postponeReason: from.reason
            });
            render(); renderDetail();
            App.toast('已撤销顺延');
          }
        }
      });
  }

  App.quickPostpone = function (kind) {
    var e = SP.getEvent(detailId);
    if (!e) return;
    var start = e.start;
    var base = new Date();
    var dk;
    if (kind === 'tonight') {
      dk = SP.TODAY;
      var mins = base.getHours() * 60 + base.getMinutes() + 60;
      mins = Math.min(Math.round(mins / 30) * 30, 23 * 60);
      start = SP.hhmmOf(Math.max(mins, 20 * 60));
    } else if (kind === 'tomorrow') {
      dk = SP.dateKey(SP.addDays(base, 1));
    } else if (kind === 'p2') {
      dk = SP.dateKey(SP.addDays(base, 2));
    } else {
      dk = SP.dateKey(SP.addDays(base, 7));
    }
    var reasonInp = $('postReason');
    postponeTo(dk, start, reasonInp ? reasonInp.value.trim() : '');
  };

  App.doPostpone = function () {
    var at = $('postAt') ? $('postAt').value : '';
    if (!at) { App.toast('先选一个时间'); return; }
    var parts = at.split('T');
    postponeTo(parts[0], (parts[1] || '09:00').slice(0, 5), ($('postReason') || {}).value || '');
  };

  App.detailToggle = function () {
    if (!detailId) return;
    var e = SP.toggle(detailId);
    render();
    renderDetail();
    if (e && e.done) App.toast('完成', e.title);
  };

  App.detailDuplicate = function () {
    if (!detailId) return;
    var n = SP.duplicate(detailId);
    render();
    App.toast('已复制', n ? n.title : '');
    if (n) App.openDetail(n.id);
  };

  /* 删除日程：统一走显式确认，重复日程可以选「只删这次」或「删整个系列」 */
  App.detailDelete = function () {
    if (!detailId) return;
    var e = SP.getEvent(detailId);
    if (!e) return;
    var desc = md(e.date) + ' ' + e.start + '–' + SP.endTime(e) + ' · ' + esc(e.title);
    /* 服务端每条日程都挂在 series 下，判断"是否真的是重复日程"要看同一系列还有几场 */
    var siblings = e.seriesId
      ? SP.state.events.filter(function (x) { return x.seriesId === e.seriesId; }).length
      : 0;
    if (siblings > 1) {
      App.modal(
        '<h3>删除这条重复日程</h3><div class="sub">' + desc + '</div>' +
        '<div class="task-ops">' +
        '<button class="task-op" onclick="App.delOnce()">' +
        '<span><b>只删这一次</b><em>这一天的日程移除，其余照旧</em></span></button>' +
        '<button class="task-op danger" onclick="App.delSeries()">' +
        '<span><b>删除整个系列</b><em>这条重复规则之后都不再出现</em></span></button>' +
        '</div>' +
        '<div class="sheet-foot"><div class="grow"></div>' +
        '<button class="btn ghost" onclick="App.closeModal()">取消</button></div>',
        true
      );
      return;
    }
    App.modal(
      '<h3>删除这条日程？</h3><div class="sub">' + desc + '<br>删了就找不回来了。</div>' +
      '<div class="sheet-foot"><div class="grow"></div>' +
      '<button class="btn ghost" onclick="App.closeModal()">再想想</button>' +
      '<button class="btn primary danger" onclick="App.delOnce()">确认删除</button></div>',
      true
    );
  };

  App.delOnce = function () {
    var e = SP.getEvent(detailId);
    if (!e) { App.closeModal(); return; }
    SP.remove(detailId);
    App.closeModal();
    App.closeDetail();
    render();
    App.toast('已删除', e.title);
  };

  App.delSeries = function () {
    var e = SP.getEvent(detailId);
    if (!e || !e.seriesId) { App.closeModal(); return; }
    SP.removeSeries(e.seriesId);
    App.closeModal();
    App.closeDetail();
    render();
    App.toast('整个系列已删除', e.title);
  };

  App.addSub = function () {
    var input = $('subInput');
    if (!input) return;
    var v = (input.value || '').trim();
    if (!v) return;
    SP.addSub(detailId, v);
    input.value = '';
    renderDetail();
    var i2 = $('subInput');
    if (i2) i2.focus();
  };

  App.toggleSub = function (sid) {
    SP.toggleSub(detailId, sid);
    renderDetail();
    render();
  };

  App.removeSub = function (sid) {
    SP.removeSub(detailId, sid);
    renderDetail();
  };

  /* ============================================================
     偏好设置
     ============================================================ */
  App.openSettings = function () {
    /* 直接复用「我的」页的同一套设置，避免电脑端与脚本里的两套 UI 各说各话 */
    App.modal(
      '<h3>偏好设置</h3><div class="sub">改完立刻生效，手机与电脑共用同一份。</div>' +
      '<div class="me-grid one">' + meSections() + '</div>' +
      '<div class="sheet-foot"><div class="preview">这些开关在「我的」页里同样能改。</div><div class="grow"></div>' +
      '<button class="btn primary" onclick="App.closeModal()">完成</button></div>',
      true
    );
  };

  /* ============================================================
     自动完成：按当地时区，把时间已过的日程打勾
     ============================================================ */
  App.runAuto = function (silent) {
    var s = SP.state.settings;
    if (!s.autoComplete) return 0;
    var list = SP.autoComplete(s.autoGrace, s.autoScope);
    if (!list.length) return 0;
    render();
    if (!silent) {
      var names = list.slice(0, 2).map(function (x) { return x.title; }).join('、');
      App.toast('已自动完成 ' + list.length + ' 项',
        names + (list.length > 2 ? ' 等' : '') + ' · 按 ' + SP.offsetText() + ' 当地时间',
        {
          duration: 6000,
          action: {
            label: '撤销',
            fn: function () { SP.undoAuto(list); render(); App.toast('已撤销这批自动完成'); }
          }
        });
    }
    return list.length;
  };

  App.locate = function () {
    if (!navigator.geolocation) {
      App.toast('无法定位', '浏览器不支持定位，将使用设备时区 ' + SP.zone());
      return;
    }
    App.toast('正在定位…', '需要授权后才能读取地区');
    navigator.geolocation.getCurrentPosition(function (pos) {
      var la = pos.coords.latitude.toFixed(3), lo = pos.coords.longitude.toFixed(3);
      SP.setSetting('geo', la + ', ' + lo);
      SP.setSetting('tz', SP.zone());
      App.closeModal();
      App.openSettings();
      App.toast('已按当地时区校准', SP.zone() + ' · ' + SP.offsetText() + ' · ' + la + ', ' + lo);
      App.runAuto(true);
    }, function () {
      App.toast('定位未授权', '已改用设备时区 ' + SP.zone() + ' · ' + SP.offsetText());
    }, { timeout: 8000, maximumAge: 60000 });
  };

  /* ---------------- 键盘 ---------------- */
  document.addEventListener('keydown', function (e) {
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') {
      if (e.key === 'Escape') { App.closeModal(); App.closeDetail(); }
      return;
    }
    if (e.key === 'n') { e.preventDefault(); App.openEvent(); }
    if (e.key === 'b') { e.preventDefault(); App.openNote(); }
    if (e.key === 't') App.goToday();
    if (e.key === 'm') App.setView('month');
    if (e.key === 'w') App.setView('week');
    if (e.key === 'g') App.setView('timeline');
    if (e.key === 'p') App.setView('progress');
    if (e.key === 'q') { e.preventDefault(); App.openCapture(); }
    if (e.key === 'c') App.setView('collections');
    if (e.key === 'l') App.setView('cats');
    if (e.key === 'r') App.setView('review');
    if (e.key === '/') { e.preventDefault(); if (si) si.focus(); }
    if (e.key === 'Escape') { App.closeModal(); App.closeDetail(); }
  });

  /* ---------------- 启动 ---------------- */
  /* 支持 ?theme=ink|pebble|aurora &view=month|week|timeline|progress &embed=1
     供 preview.html 的主题对比与机模预览使用 */
  var qs = {};
  try {
    new URLSearchParams(location.search).forEach(function (v, k) { qs[k] = v; });
  } catch (e) {}
  if (qs.theme) SP.state.settings.theme = qs.theme;
  if (qs.view) state.view = qs.view;
  if (qs.mview) state.mview = qs.mview;
  if (qs.date) { state.selected = qs.date; var qd = SP.parseKey(qs.date); state.cursor = new Date(qd.getFullYear(), qd.getMonth(), 1); }

  try {
    var savedTheme = localStorage.getItem('sketchplan.theme');
    if (savedTheme) SP.state.settings.theme = savedTheme;
  } catch (e) {}

  document.documentElement.dataset.theme = SP.state.settings.theme || 'ink';

  /* 时区：设备所在地区时区，变化时提示并按新时区重算 */
  /* 界面形态偏好：auto / phone / desktop */
  try {
    var devPref = localStorage.getItem('sketchplan.device') || 'auto';
    var qDev = new URLSearchParams(location.search).get('device');
    if (qDev) devPref = qDev;
    document.documentElement.dataset.device = devPref;
  } catch (e) {}

  /* 登录会话（原型：auth.html 写入 localStorage） */
  try {
    var sess = JSON.parse(localStorage.getItem('sketchplan.session') || 'null');
    if (sess && sess.name) {
      SP.state.settings.name = sess.name;
    }
  } catch (e) {}

  var curZone = SP.zone();
  if (SP.state.settings.tz && SP.state.settings.tz !== curZone) {
    var oldZone = SP.state.settings.tz;
    setTimeout(function () {
      App.toast('时区已更新', oldZone + ' → ' + curZone + '，已按当地时间重新计算');
    }, 1200);
  }
  SP.setSetting('tz', curZone);

  render();

  /* 跨过午夜：月历高亮、时间轴「今天」线、剩余天数都按新的日期重画 */
  if (SP.onDayChange) SP.onDayChange(function (k, prev) {
    /* 如果正停在「昨天」（也就是旧的今天），就跟着跳到新的一天；
       用户主动挑过的其它日期不动 */
    if (state.selected === prev) {
      state.selected = k;
      var d = SP.parseKey(k);
      if (d.getMonth() !== state.cursor.getMonth()) {
        state.cursor = new Date(d.getFullYear(), d.getMonth(), 1);
      }
    }
    render();
    App.toast('新的一天 · ' + k.slice(5).replace('-', '/'), '时间轴和剩余天数已按今天重新计算');
  });

  /* 自动完成：进入时跑一次，之后每分钟检查一次，回到前台再跑一次 */
  setTimeout(function () { App.runAuto(); }, 700);
  setInterval(function () {
    if (document.visibilityState === 'visible') App.runAuto();
  }, 60000);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') App.runAuto();
  });

  if (MQ.addEventListener) MQ.addEventListener('change', function () { render(); });
  else if (MQ.addListener) MQ.addListener(function () { render(); });

  if (qs.panel === 'theme') setTimeout(function () { App.openAppearance(); }, 200);
  if (qs.panel === 'settings') setTimeout(function () { App.openSettings(); }, 200);
  if (qs.panel === 'capture') setTimeout(function () {
    App.openCapture();
    var i = $('capInput'); if (i) { i.value = '每周二四 14:30 学 C 语言 到 11月20日 提前20分钟'; App.capPreview(); }
  }, 300);
  if (qs.panel === 'detail') setTimeout(function () {
    var l = SP.byDate(SP.TODAY);
    if (l.length) App.openDetail(l[Math.min(2, l.length - 1)].id);
  }, 200);

  setTimeout(function () {
    if (qs.embed) return;
    var up = SP.upcoming(1)[0];
    if (up) App.toast('提醒 · ' + up.title, up.start + ' 开始，别错过');
  }, 1500);

  window.App = App;

})();
