var store = require('../../utils/store')
var D = require('../../utils/date')
var parse = require('../../utils/parse')
var theme = require('../../utils/theme')

Page({
  data: {
    theme: 'ink',
    pageStyle: '',
    text: '',
    baseDate: '',
    preview: null,
    samples: [
      '明天下午三点半 跟导师讨论论文 1小时 提前20分钟',
      '周五晚八点 健身 1小时',
      '每天早上七点半 背单词 30分钟'
    ]
  },

  onLoad: function (q) {
    this.setData({ baseDate: (q && q.date) || D.todayKey() })
  },

  onShow: function () {
    var s = store.settings()
    var t = theme.boot(s.theme)
    this.setData({ theme: t.theme, pageStyle: t.pageStyle })
  },

  onInput: function (e) {
    this.setData({ text: e.detail.value })
    var that = this
    if (this._timer) clearTimeout(this._timer)
    this._timer = setTimeout(function () { that.analyze() }, 220)
  },

  useSample: function (e) {
    this.setData({ text: e.currentTarget.dataset.t })
    this.analyze()
  },

  analyze: function () {
    var raw = String(this.data.text || '').trim()
    if (!raw) {
      this.setData({ preview: null })
      return
    }
    var p = parse.quick(raw)
    var base = this.data.baseDate
    /* 用户是从某天点进来的，句子里又没写日期 → 落到那一天 */
    if (base && base !== D.todayKey() && p.date === D.todayKey()) p.date = base
    var repeat = ''
    if (p.rule === 'daily') repeat = '每天'
    else if (p.rule === 'weekdays') repeat = '每个工作日'
    else if (p.rule === 'weekly') repeat = '每周'
    else if (p.rule === 'custom') repeat = '每周' + p.weekdays.map(function (i) { return '日一二三四五六'[i] }).join('、')
    if (repeat) repeat += p.until ? '，直到 ' + D.cnDate(p.until) : ''

    this._p = p
    this.setData({
      preview: {
        title: p.title,
        date: p.date,
        dateLabel: D.cnDate(p.date) + ' 周' + D.weekday(p.date) + (p.date === D.todayKey() ? '（今天）' : ''),
        time: p.start + '–' + D.addMinutes(p.start, p.dur),
        dur: p.dur + ' 分钟',
        catName: store.catName(p.cat),
        color: store.catColor(p.cat),
        remind: p.remind === null ? '默认提醒' : '提前 ' + p.remind + ' 分钟',
        repeat: repeat,
        assumed: !!p.assumedTime,
        roll: !!p.rolledToTomorrow
      }
    })
  },

  save: function () {
    if (!this._p) this.analyze()
    var p = this._p
    if (!p) {
      wx.showToast({ title: '先写一句', icon: 'none' })
      return
    }
    var payload = {
      title: p.title,
      date: p.date,
      start: p.start,
      dur: p.dur,
      cat: p.cat,
      remind: p.remind === null ? undefined : p.remind
    }
    var made = null
    if (p.rule !== 'none') {
      payload.rule = p.rule
      payload.weekdays = p.weekdays
      payload.until = p.until
      made = store.addRepeat(payload)
      wx.showToast({ title: made.count + ' 条已排好', icon: 'none' })
    } else {
      store.addEvent(payload)
      wx.showToast({ title: '记下了', icon: 'none' })
    }
    var that = this
    setTimeout(function () {
      wx.navigateBack({
        fail: function () { wx.switchTab({ url: '/pages/today/today' }) }
      })
    }, 500)
  }
})
