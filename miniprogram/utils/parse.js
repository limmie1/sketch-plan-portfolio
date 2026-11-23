/* ============================================================
   一句话速记解析（与 Web 版 assets/parse.js 同一套规则，纯本地、无网络）
   例：「明天下午三点半 跟导师讨论论文 1小时 提前20分钟」
   ============================================================ */
var D = require('./date')

var CN = { '零': 0, '〇': 0, '一': 1, '两': 2, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10, '十一': 11, '十二': 12 }
var WD = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0, '七': 0 }
var P = D.pad

function cn2num(s) {
  if (s === undefined || s === null || s === '') return null
  if (/^\d+$/.test(s)) return Number(s)
  return CN[s] !== undefined ? CN[s] : null
}

function parseKeySafe(k) {
  var p = String(k).split('-').map(Number)
  return new Date(p[0], p[1] - 1, p[2])
}

function addDaysDate(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x }

/**
 * @param {string} text 用户输入
 * @param {Date}   base 基准时间（默认现在）
 */
function quick(text, base) {
  var raw = String(text || '').trim()
  var rest = raw
  var now = base || new Date()
  var out = {
    ok: false, raw: raw, title: '',
    date: D.key(now), start: null, dur: null, cat: null,
    rule: 'none', weekdays: [], until: null, remind: null,
    matched: []
  }
  if (!raw) return out

  function eat(re, fn) {
    rest = rest.replace(re, function () {
      var args = arguments
      try { fn.apply(null, args) } catch (e) {}
      return ' '
    })
  }

  /* ---------- 1. 重复 ---------- */
  eat(/到\s*(\d{1,2})\s*[月\/]\s*(\d{1,2})\s*[日号]?/, function (m, mo, da) {
    var y = now.getFullYear()
    var d = new Date(y, Number(mo) - 1, Number(da))
    if (d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) d = new Date(y + 1, Number(mo) - 1, Number(da))
    out.until = D.key(d)
    out.matched.push('到 ' + (d.getMonth() + 1) + '/' + d.getDate())
  })

  eat(/每(?:个)?(?:周|星期|礼拜)([一二三四五六日天、,，和\s]+)/, function (m, w) {
    var list = []
    String(w).replace(/[一二三四五六日天]/g, function (ch) { list.push(WD[ch]) })
    out.rule = 'custom'
    var uniq = []
    list.forEach(function (v) { if (uniq.indexOf(v) < 0) uniq.push(v) })
    out.weekdays = uniq
    out.matched.push('每周' + out.weekdays.map(function (i) { return '日一二三四五六'[i] }).join('、'))
  })

  if (!out.weekdays.length) {
    eat(/(?:每(?:个)?)?工作日/, function () {
      out.rule = 'weekdays'; out.weekdays = [1, 2, 3, 4, 5]
      out.matched.push('每个工作日')
    })
  }
  if (out.rule === 'none') {
    eat(/每(?:天|日)/, function () { out.rule = 'daily'; out.matched.push('每天') })
  }
  if (out.rule === 'none') {
    eat(/每(?:个)?(?:周|星期|礼拜)(?![一二三四五六日天])/, function () { out.rule = 'weekly'; out.matched.push('每周') })
  }
  if (out.rule === 'none') {
    eat(/每\s*(\d+)\s*天/, function (m, n) {
      out.rule = 'daily'; out.interval = Number(n)
      out.matched.push('每 ' + n + ' 天')
    })
  }

  /* ---------- 2. 日期 ---------- */
  var dated = false
  var rel = [
    [/大后天/, 3], [/后天/, 2], [/明天|明日|明儿|明晚|明早/, 1], [/今天|今日|今晚|今早/, 0]
  ]
  rel.forEach(function (pair) {
    if (dated) return
    eat(pair[0], function () {
      out.date = D.key(addDaysDate(now, pair[1]))
      dated = true
      out.matched.push(pair[0].source.replace(/[\\|]/g, '').split('|')[0])
    })
  })

  if (!dated) {
    eat(/下(?:个)?(?:周|星期|礼拜)([一二三四五六日天])/, function (m, w) {
      var target = WD[w]
      var cur = now.getDay()
      var delta = (target - cur + 7) % 7 + 7
      out.date = D.key(addDaysDate(now, delta))
      dated = true
      out.matched.push('下周' + w)
    })
  }
  if (!dated) {
    eat(/(?:这|本)?(?:周|星期|礼拜)([一二三四五六日天])/, function (m, w) {
      var target = WD[w]
      var cur = now.getDay()
      var delta = (target - cur + 7) % 7
      if (delta === 0) delta = 7
      out.date = D.key(addDaysDate(now, delta))
      dated = true
      out.matched.push('周' + w)
    })
  }
  if (!dated) {
    eat(/(\d{1,2})\s*[月\/]\s*(\d{1,2})\s*[日号]?/, function (m, mo, da) {
      var y = now.getFullYear()
      var d = new Date(y, Number(mo) - 1, Number(da))
      if (d < new Date(now.getFullYear(), now.getMonth(), now.getDate())) d = new Date(y + 1, Number(mo) - 1, Number(da))
      out.date = D.key(d)
      dated = true
      out.matched.push(Number(mo) + '/' + Number(da))
    })
  }
  if (!dated) {
    eat(/(\d{1,2})\s*[日号](?![线])/, function (m, da) {
      var d = new Date(now.getFullYear(), now.getMonth(), Number(da))
      if (Number(da) < now.getDate()) d = new Date(now.getFullYear(), now.getMonth() + 1, Number(da))
      out.date = D.key(d)
      dated = true
      out.matched.push(Number(da) + '号')
    })
  }

  /* ---------- 3. 时间 ---------- */
  var hours = null, minute = 0, ampm = null
  var ampmRe = /(凌晨|早上|早晨|上午|中午|下午|傍晚|晚上|晚间|夜里|今晚|明晚|今早|明早|晚)/

  eat(/(\d{1,2})\s*[:：]\s*(\d{1,2})/, function (m, h, mi) {
    hours = Number(h); minute = Number(mi)
    out.matched.push(P(hours) + ':' + P(minute))
  })
  if (hours === null) {
    eat(/(?:(\d{1,2}|[一二三四五六七八九十]{1,3})\s*[点時时])\s*(半|一刻|三刻|(\d{1,2}|[一二三四五六七八九十]{1,3})\s*分?)?/, function (m, h, tail) {
      var hv = cn2num(String(h))
      if (hv === null) return
      hours = hv
      if (!tail) { minute = 0; return }
      if (tail.indexOf('半') === 0) minute = 30
      else if (tail.indexOf('一刻') === 0) minute = 15
      else if (tail.indexOf('三刻') === 0) minute = 45
      else {
        var n = String(tail).match(/\d{1,2}|[一二三四五六七八九十]{1,3}/)
        minute = n ? (cn2num(n[0]) || 0) : 0
      }
      out.matched.push(P(hours) + ':' + P(minute))
    })
  }
  if (hours === null) {
    var am = raw.match(ampmRe)
    if (am) ampm = am[1]
  }

  if (hours !== null) {
    var am2 = ampm || (raw.match(ampmRe) || [])[1] || null
    if (am2 && /下午|傍晚|晚上|晚间|夜里|晚/.test(am2) && hours < 12) hours += 12
    if (am2 && /中午/.test(am2) && hours < 11) hours += 12
    if (am2 && /凌晨/.test(am2) && hours === 12) hours = 0
    out.start = P(((hours % 24) + 24) % 24) + ':' + P(minute)
    if (out.matched.indexOf(out.start) < 0) out.matched.push(out.start)
  }

  rest = rest.replace(ampmRe, ' ')

  /* ---------- 4. 提醒（必须先于时长解析） ---------- */
  eat(/提前\s*(\d{1,2})\s*分钟/, function (m, mi) { out.remind = Number(mi); out.matched.push('提前 ' + mi + ' 分') })
  if (out.remind === null) {
    eat(/提前\s*(\d{1,2})\s*(?:小时|钟头)/, function (m, h) { out.remind = Number(h) * 60; out.matched.push('提前 ' + h + ' 小时') })
  }

  /* ---------- 5. 时长 ---------- */
  eat(/(\d+(?:\.\d+)?)\s*(?:个)?\s*(?:小时|钟头)/, function (m, h) {
    out.dur = Math.round(Number(h) * 60)
    out.matched.push(h + ' 小时')
  })
  if (!out.dur) {
    eat(/半\s*(?:个)?\s*小时/, function () { out.dur = 30; out.matched.push('半小时') })
  }
  if (!out.dur) {
    eat(/(\d{1,3})\s*分钟/, function (m, mi) { out.dur = Number(mi); out.matched.push(mi + ' 分钟') })
  }

  /* ---------- 6. 分类 ---------- */
  var CAT_HINT = [
    ['health', /健身|跑步|游泳|运动|体检|瑜伽|球|拉伸|骑车|力量/],
    ['work', /开会|会议|评审|汇报|项目|上线|客户|方案|论文|答辩|投稿|面试|组会|晨会|例会|周会|分享会/],
    ['study', /上课|课|学习|复习|考试|背单词|刷题|作业|英语|德语|C\s*语言|数学|读书|阅读|听写/],
    ['life', /吃饭|午饭|晚饭|聚餐|生日|买东西|取快递|家里|电话|收拾|洗衣|旅行|电影|理发|缴费/]
  ]
  for (var i = 0; i < CAT_HINT.length; i++) {
    if (CAT_HINT[i][1].test(raw)) { out.cat = CAT_HINT[i][0]; break }
  }

  /* ---------- 7. 标题 ---------- */
  var title = rest
    .replace(/[，,。.；;、]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^(要|去|在|安排|提醒我|记一下)/, '')
    .trim()
  if (!title) title = raw.replace(/\s+/g, '')
  out.title = title
  out.ok = true

  /* ---------- 8. 兜底 ---------- */
  if (!out.start) {
    if (out.date > D.key(now)) {
      out.start = '09:00'
    } else {
      var t = new Date(now.getTime() + 60 * 60 * 1000)
      t.setMinutes(0, 0, 0)
      out.start = P(t.getHours()) + ':' + P(t.getMinutes())
    }
    out.assumedTime = true
  }
  if (!out.dur) out.dur = 60
  if (!out.cat) out.cat = 'life'
  if (out.rule !== 'none' && !out.until) out.until = D.addDays(out.date, 30)

  if ((out.rule === 'custom' || out.rule === 'weekdays') && out.weekdays.length) {
    var dd = parseKeySafe(out.date)
    var guard = 0
    while (guard++ < 14 && out.weekdays.indexOf(dd.getDay()) < 0) dd = addDaysDate(dd, 1)
    out.date = D.key(dd)
    out.rolledToTomorrow = false
  }

  var dt = parseKeySafe(out.date).getTime() + D.minutesOf(out.start) * 60000
  if (out.date === D.key(now) && dt < now.getTime()) {
    out.date = D.key(addDaysDate(now, 1))
    out.rolledToTomorrow = true
  }

  return out
}

module.exports = { quick: quick }
