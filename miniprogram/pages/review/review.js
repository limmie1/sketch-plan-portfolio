var store = require('../../utils/store')
var D = require('../../utils/date')
var theme = require('../../utils/theme')

Page({
  data: {
    theme: 'ink',
    pageStyle: '',
    weekKey: '',
    label: '',
    stat: null,
    cats: [],
    series: [],
    form: { wins: '', blocks: '', next: '' },
    savedAt: '',
    isThisWeek: true
  },

  onLoad: function (q) {
    this.setData({ weekKey: (q && q.week) || store.weekKeyOf(D.todayKey()) })
  },

  onShow: function () {
    this.build()
  },

  build: function () {
    var s = store.settings()
    var t = theme.boot(s.theme)
    var wk = this.data.weekKey || store.weekKeyOf(D.todayKey())
    var stat = store.reviewStats(wk)
    var r = store.getReview(wk)
    this.setData({
      theme: t.theme,
      pageStyle: t.pageStyle,
      weekKey: wk,
      label: stat.label,
      stat: stat,
      cats: stat.cats,
      series: stat.series,
      form: { wins: r.wins || '', blocks: r.blocks || '', next: r.next || '' },
      savedAt: r.at ? this.fmt(r.at) : '',
      isThisWeek: wk === store.weekKeyOf(D.todayKey())
    })
  },

  fmt: function (ts) {
    var d = new Date(ts)
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + D.pad(d.getHours()) + ':' + D.pad(d.getMinutes())
  },

  shift: function (e) {
    var n = Number(e.currentTarget.dataset.d)
    this.setData({ weekKey: D.addDays(this.data.weekKey, n * 7) })
    this.build()
  },

  onInput: function (e) {
    var k = e.currentTarget.dataset.k
    var patch = {}
    patch['form.' + k] = e.detail.value
    this.setData(patch)
  },

  save: function () {
    var f = this.data.form
    if (!String(f.wins + f.blocks + f.next).trim()) {
      wx.showToast({ title: '写两句再存', icon: 'none' })
      return
    }
    store.setReview(this.data.weekKey, { wins: f.wins, blocks: f.blocks, next: f.next })
    this.build()
    wx.showToast({ title: '已存到这一周', icon: 'none' })
  }
})
