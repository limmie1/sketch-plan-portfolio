var store = require('../../utils/store')
var D = require('../../utils/date')
var theme = require('../../utils/theme')

Page({
  data: {
    theme: 'ink',
    pageStyle: '',
    year: 0,
    month: 0,
    monthLabel: '',
    weekdays: ['一', '二', '三', '四', '五', '六', '日'],
    cells: [],
    selected: '',
    selLabel: '',
    dayEvents: [],
    cats: store.CATS,
    sheet: false,
    form: null,
    editingId: ''
  },

  onLoad: function () {
    var now = new Date()
    this.setData({
      year: now.getFullYear(),
      month: now.getMonth(),
      selected: D.todayKey()
    })
  },

  onShow: function () {
    this.build()
  },

  build: function () {
    var s = store.settings()
    var t = theme.boot(s.theme)
    var marks = store.markedDays()
    var sel = this.data.selected || D.todayKey()
    var year = this.data.year
    var month = this.data.month

    var cells = D.monthMatrix(year, month, s.weekStart || 1).map(function (c) {
      return {
        k: c.k,
        day: c.day,
        out: c.out,
        today: c.today,
        sel: c.k === sel,
        mark: !!marks[c.k]
      }
    })

    var dayEvents = store.eventsOf(sel).map(function (e) {
      return {
        id: e.id,
        title: e.title,
        start: e.start,
        end: D.addMinutes(e.start, e.dur),
        cat: e.cat,
        catName: store.catName(e.cat),
        done: e.done
      }
    })

    this.setData({
      theme: t.theme,
      pageStyle: t.pageStyle,
      monthLabel: D.cnMonth(year, month),
      cells: cells,
      selLabel: D.cnDate(sel) + ' · 周' + D.weekday(sel),
      dayEvents: dayEvents
    })
  },

  prev: function () {
    var y = this.data.year
    var m = this.data.month - 1
    if (m < 0) { m = 11; y = y - 1 }
    this.setData({ year: y, month: m })
    this.build()
  },

  next: function () {
    var y = this.data.year
    var m = this.data.month + 1
    if (m > 11) { m = 0; y = y + 1 }
    this.setData({ year: y, month: m })
    this.build()
  },

  backToday: function () {
    var now = new Date()
    this.setData({
      year: now.getFullYear(),
      month: now.getMonth(),
      selected: D.todayKey()
    })
    this.build()
  },

  pick: function (e) {
    this.setData({ selected: e.currentTarget.dataset.k })
    this.build()
  },

  toggle: function (e) {
    store.toggleEvent(e.currentTarget.dataset.id)
    this.build()
  },

  openNew: function () {
    this.setData({
      sheet: true,
      editingId: '',
      form: { title: '', date: this.data.selected || D.todayKey(), start: '09:00', dur: 60, cat: 'life' }
    })
  },

  onCancel: function () {
    this.setData({ sheet: false })
  },

  onSubmit: function (e) {
    var v = e.detail.value
    if (e.detail.editing && this.data.editingId) {
      store.updateEvent(this.data.editingId, {
        title: v.title,
        date: v.date,
        start: v.start,
        dur: v.dur,
        cat: v.cat
      })
      this.setData({ selected: v.date })
    } else {
      store.addEvent(v)
      this.setData({ selected: v.date })
    }
    this.setData({ sheet: false })
    this.build()
  },

  onRemove: function () {
    var that = this
    var id = this.data.editingId
    wx.showModal({
      title: '删除这件事？',
      content: '删掉之后就找不回来了',
      confirmText: '删除',
      confirmColor: '#D9503A',
      success: function (r) {
        if (!r.confirm) return
        store.removeEvent(id)
        that.setData({ sheet: false })
        that.build()
      }
    })
  },

  more: function (e) {
    var id = e.currentTarget.dataset.id
    var that = this
    wx.showActionSheet({
      itemList: ['编辑', '删除'],
      success: function (r) {
        if (r.tapIndex === 0) {
          var ev = store.eventById(id)
          if (!ev) return
          that.setData({
            sheet: true,
            editingId: id,
            form: {
              id: ev.id,
              title: ev.title,
              date: ev.date,
              start: ev.start,
              dur: ev.dur,
              cat: ev.cat
            }
          })
        } else if (r.tapIndex === 1) {
          wx.showModal({
            title: '删除这件事？',
            content: '删掉之后就找不回来了',
            confirmText: '删除',
            confirmColor: '#D9503A',
            success: function (m) {
              if (!m.confirm) return
              store.removeEvent(id)
              that.build()
            }
          })
        }
      }
    })
  }
})
