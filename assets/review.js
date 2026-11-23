/* ============================================================
 * Sketch Plan · 复盘卡
 * 周 / 月 / 年 × 5 种视觉风格 + 复盘方法论（KISS / GRAI / 年度四问）
 * ============================================================ */
(function (global) {
  'use strict';

  var SP = global.SP;
  var st = { period: 'week', style: 's1', all: false };
  var host = null;

  try {
    var q = new URLSearchParams(location.search);
    if (q.get('rperiod')) st.period = q.get('rperiod');
    if (q.get('rstyle')) st.style = q.get('rstyle');
    if (q.get('rall') === '1') st.all = true;
  } catch (e) {}

  var STYLES = [
    { id: 's1', name: '手账', hint: '纸 · 墨 · 印章' },
    { id: 's2', name: '柔彩', hint: '色块 · 大数字' },
    { id: 's3', name: '夜航', hint: '数据 · 发光' },
    { id: 's4', name: '杂志', hint: '排版 · 黑白' },
    { id: 's5', name: '票根', hint: '打孔 · 条码' }
  ];

  /* KISS / GRAI / 年度四问 */
  var METHODS = {
    week: {
      id: 'kiss', name: 'KISS 复盘', sub: '每周只回答四个问题',
      items: [
        { key: 'keep', en: 'Keep', label: '保持', hint: '哪些做得好的，继续做', c: '#5C9E6B' },
        { key: 'improve', en: 'Improve', label: '改进', hint: '哪些不满意，怎么调整', c: '#D8A23B' },
        { key: 'stop', en: 'Stop', label: '停止', hint: '哪些对结果不利，及时止损', c: '#D96B84' },
        { key: 'start', en: 'Start', label: '开始', hint: '哪些对结果有利，还没开始', c: '#4C9AC4' }
      ]
    },
    month: {
      id: 'grai', name: 'GRAI 复盘', sub: '回顾目标 → 评估结果 → 分析原因 → 归类总结',
      items: [
        { key: 'keep', en: 'Goal', label: '目标', hint: '这个月原本想做成什么', c: '#5C7FBF' },
        { key: 'improve', en: 'Result', label: '结果', hint: '真实完成了多少', c: '#5C9E6B' },
        { key: 'stop', en: 'Analysis', label: '分析', hint: '为什么差在这里', c: '#D8A23B' },
        { key: 'start', en: 'Insight', label: '洞察', hint: '下个月改哪一件事', c: '#D96B84' }
      ]
    },
    year: {
      id: 'annual', name: '年度四问', sub: '用四个问题把一年收拢',
      items: [
        { key: 'keep', en: 'Highlight', label: '高光', hint: '最值得记住的一刻', c: '#D96B84' },
        { key: 'improve', en: 'Hard', label: '艰难', hint: '最难的时候，你怎么过来的', c: '#8B7BB8' },
        { key: 'stop', en: 'Lesson', label: '学到', hint: '最大的一个教训', c: '#5C9E6B' },
        { key: 'start', en: 'Next', label: '明年', hint: '明年要开始的一件事', c: '#4C9AC4' }
      ]
    }
  };

  var ANNUAL_QUESTIONS = [
    '为这一年整体打分，为什么是这个分数？',
    '三个高光时刻，当时你是什么感受？',
    '三个艰难时刻，你是怎么应对的？',
    '三个成长时刻，你从中收获了什么？',
    '生病几次？锻炼数据如何？坚持最久的运动是什么？',
    '收入和支出大概多少？哪几笔花销其实可以避免？',
    '和谁的关系变近了，和谁变远了？',
    '做过最明智的决定是什么？承担过的最大风险是什么？',
    '最宝贵的一课是什么？最大的失误与遗憾分别是什么？',
    '最想感谢的人是谁？',
    '哪件事你一直想做却始终没开始？',
    '明年要改进 / 停止 / 保持 / 开始的事各一件'
  ];

  function pad(n) { return String(n).padStart(2, '0'); }
  function md(k) { var p = k.split('-'); return Number(p[1]) + '.' + Number(p[2]); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function rangeOf(period) {
    var today = SP.parseKey(SP.TODAY);
    var y = today.getFullYear(), m = today.getMonth();
    if (period === 'week') {
      var off = (today.getDay() + 6) % 7;
      var from = SP.addDays(today, -off), to = SP.addDays(from, 6);
      var week = Math.ceil((((from - new Date(y, 0, 1)) / 864e5) + new Date(y, 0, 1).getDay() + 1) / 7);
      return {
        from: SP.dateKey(from), to: SP.dateKey(to),
        title: '本周复盘', kicker: 'WEEKLY REVIEW',
        label: md(SP.dateKey(from)) + ' – ' + md(SP.dateKey(to)),
        tag: '第 ' + week + ' 周', key: 'week:' + SP.dateKey(from)
      };
    }
    if (period === 'month') {
      var f = new Date(y, m, 1), t = new Date(y, m + 1, 0);
      return {
        from: SP.dateKey(f), to: SP.dateKey(t),
        title: '本月复盘', kicker: 'MONTHLY REVIEW',
        label: y + ' 年 ' + (m + 1) + ' 月', tag: (m + 1) + ' 月',
        key: 'month:' + y + '-' + pad(m + 1)
      };
    }
    return {
      from: SP.dateKey(new Date(y, 0, 1)), to: SP.dateKey(new Date(y, 11, 31)),
      title: '年度复盘', kicker: 'YEARLY REVIEW',
      label: y + ' 年', tag: String(y), key: 'year:' + y
    };
  }

  function suggestions(period, d) {
    var s = d.s, cats = d.cats;
    var top = cats[0] || { name: '—', count: 0 };
    var out = {};
    if (period === 'week') {
      out.keep = top.count ? '「' + top.name + '」完成 ' + top.count + ' 件，是这周的主力' : '这周开了个头，先记一笔';
      out.improve = s.postponed ? '有 ' + s.postponed + ' 件事顺延了，试着把时段往前挪半小时' : '安排和实际差不多，可以再收紧一点';
      out.stop = d.busiest.count >= 4 ? '「' + d.busiest.label + '」那天排了 ' + d.busiest.count + ' 件，别再这样排' : '别在晚上排超过两件事';
      out.start = d.progress[0] ? '「' + d.progress[0].title + '」还剩 ' + Math.max(0, d.progress[0].target - d.progress[0].cur) + ' ' + d.progress[0].unit + '，下周先补一半' : '给下周留一件一直没开始的事';
    } else if (period === 'month') {
      out.keep = '原计划 ' + s.total + ' 件，覆盖 ' + cats.length + ' 个分类';
      out.improve = '实际完成 ' + s.done + ' 件（' + s.rate + '%），投入 ' + s.hours + ' 小时';
      out.stop = s.postponed ? '顺延了 ' + s.postponed + ' 次，问题集中在月末' : '完成曲线比较平，没有明显断点';
      out.start = d.advice;
    } else {
      out.keep = d.busiest.count ? '最忙的一天完成了 ' + d.busiest.count + ' 件事' : '这一年慢慢有了节奏';
      out.improve = s.worstMonth ? s.worstMonth.label + ' 完成率只有 ' + s.worstMonth.rate + '%，那段时间排得太满' : '有些月份明显松，有些月份挤';
      out.stop = d.progress[0] ? '「' + d.progress[0].title + '」推得最慢，几次想放弃' : '有件事反复开始又放下';
      out.start = '明年先把「' + (d.progress[0] ? d.progress[0].title : '最想做的事') + '」做完';
    }
    return out;
  }

  function build(period) {
    var r = rangeOf(period);
    var s = SP.rangeStats(r.from, r.to);
    var cats = Object.keys(s.byCat).map(function (k) {
      return {
        key: k, name: SP.catName(k), c: SP.catColor(k),
        count: s.byCat[k].count, mins: s.byCat[k].mins
      };
    }).filter(function (c) { return c.count > 0; })
      .sort(function (a, b) { return b.mins - a.mins; });

    var totalMins = cats.reduce(function (a, c) { return a + c.mins; }, 0) || 1;
    cats.forEach(function (c) { c.pct = Math.round(c.mins / totalMins * 100); });

    var series = [];
    if (period === 'year') {
      var monthRates = [];
      for (var mo = 0; mo < 12; mo++) {
        var sum = 0, dn = 0;
        s.days.forEach(function (dd) {
          if (Number(dd.split('-')[1]) === mo + 1) { sum += s.perDay[dd].count; dn += s.perDay[dd].done; }
        });
        series.push({ label: (mo + 1) + '月', value: sum, done: dn });
        if (sum) monthRates.push({ label: (mo + 1) + ' 月', rate: Math.round(dn / sum * 100), sum: sum });
      }
      s.worstMonth = monthRates.slice().sort(function (a, b) { return a.rate - b.rate; })[0] || null;
    } else {
      s.days.forEach(function (dd) {
        var d2 = SP.parseKey(dd);
        series.push({
          label: period === 'week' ? '日一二三四五六'[d2.getDay()]
            : (d2.getDate() === 1 || d2.getDate() % 5 === 0 ? String(d2.getDate()) : ''),
          value: s.perDay[dd].count, done: s.perDay[dd].done, date: dd
        });
      });
    }
    var maxV = Math.max.apply(null, series.map(function (x) { return x.value; }).concat([1]));

    s.postponed = s.list.filter(function (e) { return e.postponeCount; }).length;

    var topCat = cats[0] || { name: '—', pct: 0 };
    var busiest = s.busiest ? {
      label: period === 'year' ? (Number(s.busiest.split('-')[1]) + ' 月') : md(s.busiest),
      count: s.perDay[s.busiest].count
    } : { label: '—', count: 0 };

    var unit = period === 'week' ? '这周' : period === 'month' ? '这个月' : '今年';
    var note, advice;
    if (s.rate >= 85) note = unit + '的节奏很稳，几乎没有拖欠。';
    else if (s.rate >= 60) note = unit + '大体跟上了，只是有几件事被推迟。';
    else note = unit + '有点满，完成得比计划少。';
    if (s.done > 0) note += ' 完成率 ' + s.rate + '%，最长连续 ' + s.streak + ' 天。';

    if (s.rate >= 85) advice = '保持现在的安排密度，把空出来的时间留给意外。';
    else if (topCat.pct > 50) advice = '「' + topCat.name + '」占了大头，下' + (period === 'week' ? '周' : period === 'month' ? '个月' : '一年') + '试着挪出两成给别的。';
    else advice = '把最容易拖的那类事，固定放在精力最好的时段。';

    var saved = SP.getReview(r.key) || {};
    var d = {
      period: period, range: r, s: s,
      total: s.total, done: s.done, rate: s.rate,
      hours: s.hours, doneHours: s.doneHours,
      streak: s.streak,
      cats: cats, series: series, maxV: maxV,
      topCat: topCat, busiest: busiest,
      note: note, advice: advice,
      progress: s.progress.slice(0, 2),
      score: saved.score || 0,
      saved: saved
    };

    var M = METHODS[period];
    var sug = suggestions(period, d);
    d.method = {
      id: M.id, name: M.name, sub: M.sub,
      items: M.items.map(function (it) {
        var user = (saved && saved[it.key]) || '';
        return {
          key: it.key, en: it.en, label: it.label, hint: it.hint, c: it.c,
          text: user || sug[it.key] || it.hint, user: !!user
        };
      })
    };
    return d;
  }

  /* ---------------- 共用零件 ---------------- */
  function barsHTML(d, cls) {
    return '<div class="bars ' + cls + '">' + d.series.map(function (x) {
      var hEm = Math.max(0.08, x.value / d.maxV * 3.2).toFixed(2);
      var dEm = Math.min(3.2, x.done / d.maxV * 3.2).toFixed(2);
      return '<div class="rb"><i class="all" style="height:' + hEm + 'em"></i>' +
        '<i class="fill" style="height:' + dEm + 'em"></i>' +
        '<span>' + x.label + '</span></div>';
    }).join('') + '</div>';
  }

  function ringSVG(pct, size) {
    var R = 42, C = 2 * Math.PI * R;
    var dash = (pct / 100) * C;
    return '<svg class="ring" viewBox="0 0 100 100" width="' + (size || 100) + '">' +
      '<circle cx="50" cy="50" r="' + R + '" class="track"/>' +
      '<circle cx="50" cy="50" r="' + R + '" class="val" stroke-dasharray="' + dash + ' ' + C + '" transform="rotate(-90 50 50)"/>' +
      '<text x="50" y="50" text-anchor="middle" dominant-baseline="central">' + pct + '%</text></svg>';
  }

  function catDots(d) {
    return d.cats.map(function (c) {
      return '<span class="cd" style="--c:' + c.c + '">' + c.name + ' ' + c.pct + '%</span>';
    }).join('');
  }

  /* 四象限：所有风格共用结构，靠外层 class 换皮 */
  function methodHTML(d, cls) {
    return '<div class="meth ' + (cls || '') + '">' +
      d.method.items.map(function (it) {
        return '<div class="mi" style="--mc:' + it.c + '">' +
          '<div class="mi-h"><b>' + it.en + '</b><span>' + it.label + '</span>' +
          (it.user ? '' : '<em class="sug">建议</em>') + '</div>' +
          '<p>' + esc(it.text) + '</p></div>';
      }).join('') + '</div>';
  }

  /* ---------------- 风格 1：手账 ---------------- */
  function S1(d) {
    return '<div class="rc rc-s1">' +
      '<i class="tape"></i>' +
      '<div class="s1-head">' +
      '<div class="k">' + d.range.kicker + ' · ' + d.range.tag + ' · ' + d.method.name + '</div>' +
      '<h2>' + d.range.title + '</h2>' +
      '<div class="sub">' + d.range.label + '</div>' +
      '</div>' +
      '<div class="s1-ring">' + ringSVG(d.rate, 96) + '<span class="hand">完成率</span></div>' +
      '<div class="s1-nums">' +
      '<div><b>' + d.done + '</b><span>件完成</span></div>' +
      '<div><b>' + d.hours + '</b><span>小时投入</span></div>' +
      '<div><b>' + d.streak + '</b><span>天连续</span></div>' +
      '</div>' +
      '<div class="s1-bars">' + barsHTML(d, 'bars-hand') + '</div>' +
      methodHTML(d) +
      '<div class="s1-cats">' + catDots(d) + '</div>' +
      '<div class="s1-foot"><span>最忙 · ' + d.busiest.label + '（' + d.busiest.count + ' 件）</span><span>Sketch Plan</span></div>' +
      '</div>';
  }

  /* ---------------- 风格 2：柔彩 ---------------- */
  function S2(d) {
    return '<div class="rc rc-s2">' +
      '<div class="s2-top">' +
      '<span class="pill">' + d.range.label + '</span>' +
      '<span class="mini">' + d.method.name + '</span>' +
      '</div>' +
      '<h2>' + d.range.title + '</h2>' +
      '<div class="s2-tiles">' +
      '<div class="tile a"><b>' + d.done + '</b><span>完成事项</span></div>' +
      '<div class="tile b"><b>' + d.hours + 'h</b><span>专注时长</span></div>' +
      '<div class="tile c"><b>' + d.streak + '</b><span>连续天数</span></div>' +
      '</div>' +
      '<div class="s2-mid">' +
      '<div class="s2-donut" style="--p:' + d.rate + '"><b>' + d.rate + '%</b></div>' +
      '<div class="s2-cats">' + d.cats.map(function (c) {
        return '<div class="row"><i style="--c:' + c.c + '"></i><span>' + c.name + '</span>' +
          '<div class="track"><b style="width:' + c.pct + '%;--c:' + c.c + '"></b></div>' +
          '<em>' + c.pct + '%</em></div>';
      }).join('') + '</div>' +
      '</div>' +
      methodHTML(d) +
      '<div class="s2-foot"><span>Sketch Plan</span><span>' + d.range.tag + '</span></div>' +
      '</div>';
  }

  /* ---------------- 风格 3：夜航 ---------------- */
  function S3(d) {
    return '<div class="rc rc-s3">' +
      '<div class="glow"></div>' +
      '<div class="s3-head">' +
      '<div class="who"><i></i>SKETCH PLAN / ' + d.range.kicker + '</div>' +
      '<div class="rng">' + d.range.label + '</div>' +
      '</div>' +
      '<h2>' + d.range.title + '</h2>' +
      '<div class="s3-kpi">' +
      '<div><b>' + d.rate + '<em>%</em></b><span>完成率</span></div>' +
      '<div><b>' + d.done + '<em>/' + d.total + '</em></b><span>完成 / 计划</span></div>' +
      '<div><b>' + d.hours + '<em>h</em></b><span>投入时长</span></div>' +
      '</div>' +
      barsHTML(d, 'bars-dark') +
      '<div class="s3-grid">' +
      d.cats.slice(0, 4).map(function (c) {
        return '<div class="cell"><span>' + c.name + '</span><b>' + c.pct + '%</b>' +
          '<div class="ln"><i style="width:' + c.pct + '%;background:' + c.c + '"></i></div></div>';
      }).join('') +
      '</div>' +
      methodHTML(d, 'meth-dark') +
      '<div class="s3-foot"><span>BUSIEST ' + d.busiest.label + '</span><span>STREAK ' + d.streak + 'D</span></div>' +
      '</div>';
  }

  /* ---------------- 风格 4：杂志 ---------------- */
  function S4(d) {
    return '<div class="rc rc-s4">' +
      '<div class="s4-top"><span>SKETCH PLAN</span><span>' + d.range.kicker + '</span><span>NO.' + d.range.tag + '</span></div>' +
      '<div class="s4-hero">' +
      '<div class="big">' + d.rate + '</div>' +
      '<div class="hero-t">' +
      '<h2>' + d.range.title.replace('复盘', '') + '<br>复盘</h2>' +
      '<p>' + d.range.label + ' / ' + d.method.name + '</p>' +
      '</div>' +
      '</div>' +
      '<div class="s4-cols">' +
      '<div class="col"><h6>完成</h6><b>' + d.done + '</b><span>件事</span></div>' +
      '<div class="col"><h6>投入</h6><b>' + d.hours + '</b><span>小时</span></div>' +
      '<div class="col"><h6>连续</h6><b>' + d.streak + '</b><span>天</span></div>' +
      '</div>' +
      '<div class="rule thin"></div>' +
      methodHTML(d, 'meth-editorial') +
      barsHTML(d, 'bars-editorial') +
      '<div class="s4-foot"><span>' + d.topCat.name + ' 占 ' + d.topCat.pct + '%</span><span>最忙 ' + d.busiest.label + '</span></div>' +
      '</div>';
  }

  /* ---------------- 风格 5：票根 ---------------- */
  function S5(d) {
    return '<div class="rc rc-s5">' +
      '<div class="ticket">' +
      '<div class="tk-head"><span class="tk-no">NO. ' + d.range.tag + '</span><span class="tk-brand">SKETCH PLAN / ' + d.method.id.toUpperCase() + '</span></div>' +
      '<h2>' + d.range.title + '</h2>' +
      '<div class="tk-range">' + d.range.label + ' / ADMIT ONE</div>' +
      '<div class="perf"></div>' +
      '<div class="tk-rows">' +
      '<div class="tk-row"><span>完成事项</span><b>' + d.done + '<em>/' + d.total + '</em></b></div>' +
      '<div class="tk-row"><span>完成率</span><b>' + d.rate + '<em>%</em></b></div>' +
      '<div class="tk-row"><span>投入时长</span><b>' + d.hours + '<em>h</em></b></div>' +
      '<div class="tk-row"><span>连续打卡</span><b>' + d.streak + '<em>d</em></b></div>' +
      '</div>' +
      methodHTML(d, 'meth-ticket') +
      '<div class="barcode">' + new Array(44).join('<i></i>') + '</div>' +
      '<div class="tk-foot"><span>' + d.range.kicker + '</span><span>KEEP THIS STUB</span></div>' +
      '</div>' +
      '</div>';
  }

  var RENDER = { s1: S1, s2: S2, s3: S3, s4: S4, s5: S5 };

  /* ---------------- 页面 ---------------- */
  function toolbar() {
    return '<div class="rv-bar">' +
      '<div class="seg" id="rvPeriod">' +
      ['week', 'month', 'year'].map(function (p) {
        return '<button class="' + (st.period === p ? 'on' : '') + '" onclick="Review.period(\'' + p + '\')">' +
          ({ week: '周', month: '月', year: '年' })[p] + '</button>';
      }).join('') + '</div>' +
      '<div class="rv-styles">' +
      STYLES.map(function (s) {
        return '<button class="rv-style ' + (st.style === s.id ? 'on' : '') + '" onclick="Review.style(\'' + s.id + '\')">' +
          '<b>' + s.name + '</b><span>' + s.hint + '</span></button>';
      }).join('') + '</div>' +
      '<div class="grow"></div>' +
      '<button class="btn sm ' + (st.all ? 'primary' : 'ghost') + '" onclick="Review.all()">' +
      (st.all ? '看单张' : '并排看五版') + '</button>' +
      '</div>';
  }

  function stars(d) {
    var out = '';
    for (var i = 1; i <= 5; i++) {
      out += '<button class="star ' + (d.score >= i ? 'on' : '') + '" onclick="Review.score(' + i + ')">★</button>';
    }
    return '<div class="rv-score"><span>给自己打个分</span>' + out + '</div>';
  }

  function editor(d) {
    return '<div class="rv-side">' +
      '<div class="rv-method-head"><b>' + d.method.name + '</b><span>' + d.method.sub + '</span></div>' +
      stars(d) +
      '<div class="rv-fields">' +
      d.method.items.map(function (it) {
        return '<label class="rv-field" style="--mc:' + it.c + '">' +
          '<span>' + it.en + ' · ' + it.label + '</span>' +
          '<textarea rows="2" onchange="Review.fill(\'' + it.key + '\', this.value)" ' +
          'placeholder="' + esc(it.hint) + '">' + esc(it.user ? it.text : '') + '</textarea>' +
          '</label>';
      }).join('') +
      '</div>' +
      '<div class="rv-actions">' +
      '<button class="btn sm" onclick="Review.fillAll()">用建议填满</button>' +
      '<button class="btn sm ghost" onclick="Review.clear()">清空重写</button>' +
      '</div>' +
      '<div class="rv-saved">' + (d.saved.updatedAt ? '已保存 · ' + d.saved.updatedAt.slice(5, 16).replace('T', ' ') : '还没写，卡片上先显示自动建议') + '</div>' +
      (st.period === 'year' ? '<details class="rv-annual"><summary>年度 20 问（点开照着写）</summary><ol>' +
        ANNUAL_QUESTIONS.map(function (qq) { return '<li>' + esc(qq) + '</li>'; }).join('') + '</ol></details>' : '') +
      '<div class="rv-tip">卡片会实时读取你写的内容；没写的格子显示自动建议，不会覆盖你的原文。</div>' +
      '</div>';
  }

  function render(el) {
    host = el || host || document.getElementById('v-review');
    el = host;
    if (!el) return;
    var d = build(st.period);
    var html = toolbar();

    if (st.all) {
      html += '<div class="rv-grid">' + STYLES.map(function (s) {
        return '<div class="rv-item"><div class="rv-cap"><b>' + s.name + '</b><span>' + s.hint + '</span></div>' +
          '<div class="rc-wrap">' + RENDER[s.id](d) + '</div></div>';
      }).join('') + '</div>';
    } else {
      html += '<div class="rv-stage"><div class="rc-wrap rv-single">' + RENDER[st.style](d) + '</div>' +
        editor(d) + '</div>';
    }

    el.innerHTML = html;
  }

  function rerender() { render(host); }

  global.Review = {
    render: render,
    period: function (p) { st.period = p; rerender(); },
    style: function (s) { st.style = s; rerender(); },
    all: function () { st.all = !st.all; rerender(); },
    fill: function (key, val) {
      var d = build(st.period);
      var patch = {};
      patch[key] = val;
      SP.setReview(d.range.key, patch);
      rerender();
    },
    score: function (n) {
      var d = build(st.period);
      SP.setReview(d.range.key, { score: n });
      rerender();
    },
    fillAll: function () {
      var d = build(st.period);
      var patch = {};
      d.method.items.forEach(function (it) { patch[it.key] = it.text; });
      SP.setReview(d.range.key, patch);
      rerender();
    },
    clear: function () {
      var d = build(st.period);
      SP.setReview(d.range.key, { keep: '', improve: '', stop: '', start: '', score: 0 });
      rerender();
    },
    stats: function () { return build(st.period); }
  };
})(window);
