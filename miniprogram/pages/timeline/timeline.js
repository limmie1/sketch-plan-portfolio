var store = require('../../utils/store')
var D = require('../../utils/date')
var theme = require('../../utils/theme')

var HOUR_H = 100      /* 每小时 100rpx */
var START_H = 6       /* 时间轴从 06:00 画到 24:00 */

Page({
  data: {
    theme: 'ink',
    pageStyle: '',
    date: '',
    dateLabel: '',
    chips: [],
    hours: [],
    blocks: [],
    nowTop: -1,
    count: 0,
    doneCount: 0
  },

  onLoad: function () {
    this.setData({ date: D.todayKey() })
  },

  onShow: function () {
    /* 从搜索页点「看这天」过来时，带上目标日期 */
    var app = getApp()
    if (app && app.globalData && app.globalData.jumpDate) {
      this.setData({ date: app.globalData.jumpDate })
      app.globalData.jumpDate = null
    }
    this.build()
  },

  build: function () {
    var s = store.settings()
    var t = theme.boot(s.theme)
    var d = this.data.date || D.todayKey()
    var list = store.byDate(d)

    var blocks = list.map(function (e) {
      var st = D.minutesOf(e.start)
      var top = (st - START_H * 60) / 60 * HOUR_H
      if (top < 0) top = 0
      return {
        id: e.id,
        title: e.title,
        time: e.start + '–' + D.addMinutes(e.start, e.dur),
        dur: e.dur,
        done: e.done,
        cat: e.cat,
        catName: store.catName(e.cat),
        color: store.catColor(e.cat),
        top: Math.round(top),
        h: Math.max(52, Math.round(e.dur / 60 * HOUR_H) - 10)
      }
    })

    var hours = []
    for (var h = START_H; h <= 24; h++) hours.push(D.pad(h % 24) + ':00')

    var nowTop = -1
    if (d === D.todayKey()) {
      var now = new Date()
      nowTop = Math.round(((now.getHours() * 60 + now.getMinutes()) - START_H * 60) / 60 * HOUR_H)
    }

    var done = list.filter(function (e) { return e.done }).length

    this.setData({
      theme: t.theme,
      pageStyle: t.pageStyle,
      dateLabel: D.cnDate(d) + ' 周' + D.weekday(d),
      chips: [
        { k: D.addDays(d, -1), label: '前一天' },
        { k: D.todayKey(), label: '今天' },
        { k: D.addDays(d, 1), label: '后一天' }
      ],
      hours: hours,
      blocks: blocks,
      nowTop: nowTop,
      count: list.length,
      doneCount: done
    })
  },

  pickDay: function (e) {
    this.setData({ date: e.currentTarget.dataset.k })
    this.build()
  },

  shift: function (e) {
    this.setData({ date: D.addDays(this.data.date, Number(e.currentTarget.dataset.d)) })
    this.build()
  },

  tapBlock: function (e) {
    var id = e.currentTarget.dataset.id
    var ev = store.eventById(id)
    if (!ev) return
    var that = this
    wx.showActionSheet({
      itemList: [ev.done ? '标记未完成' : '标记完成', '推迟一天', '改标题', '删除'],
      success: function (r) {
        if (r.tapIndex === 0) {
          store.toggleEvent(id)
          that.build()
        } else if (r.tapIndex === 1) {
          store.postponeEvent(id, D.addDays(ev.date, 1))
          that.build()
          wx.showToast({ title: '已推迟到明天', icon: 'none' })
        } else if (r.tapIndex === 2) {
          wx.showModal({
            title: '改标题',
            editable: true,
            placeholderText: ev.title,
            success: function (m) {
              if (!m.confirm) return
              var v = String(m.content || '').trim()
              if (!v) return
              store.updateEvent(id, { title: v })
              that.build()
            }
          })
        } else if (r.tapIndex === 3) {
          store.removeEvent(id)
          that.build()
        }
      }
    })
  },

  addHere: function () {
    var d = this.data.date
    wx.navigateTo({ url: '/pages/capture/capture?date=' + d })
  }
})
