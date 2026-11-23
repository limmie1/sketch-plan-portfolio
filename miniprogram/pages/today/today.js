var store = require('../../utils/store')
var D = require('../../utils/date')
var theme = require('../../utils/theme')

Page({
  data: {
    theme: 'ink',
    pageStyle: '',
    todayLabel: '',
    weekday: '',
    greeting: '',
    events: [],
    total: 0,
    doneCount: 0,
    rate: 0,
    cats: store.CATS,
    sheet: false,
    form: null,
    editingId: ''
  },

  onShow: function () {
    this.refresh()
  },

  refresh: function () {
    var s = store.settings()
    var t = theme.boot(s.theme)
    var tk = D.todayKey()
    var events = store.eventsOf(tk).map(function (e) {
      return {
        id: e.id,
        title: e.title,
        start: e.start,
        end: D.addMinutes(e.start, e.dur),
        cat: e.cat,
        catName: store.catName(e.cat),
        color: store.catColor(e.cat),
        done: e.done
      }
    })
    var st = store.stats()
    this.setData({
      theme: t.theme,
      pageStyle: t.pageStyle,
      todayLabel: D.cnDate(tk),
      weekday: D.weekday(tk),
      greeting: this.greet(),
      events: events,
      cats: store.catList(),
      total: st.todayTotal,
      doneCount: st.todayDone,
      rate: st.todayRate
    })
  },

  greet: function () {
    var h = new Date().getHours()
    if (h < 5) return '夜深了，先睡吧'
    if (h < 11) return '早上好，今天慢慢来'
    if (h < 14) return '中午好，吃过了吗'
    if (h < 18) return '下午好，接着推进'
    return '晚上好，收个尾'
  },

  toggle: function (e) {
    store.toggleEvent(e.currentTarget.dataset.id)
    this.refresh()
  },

  openNew: function () {
    this.setData({
      sheet: true,
      editingId: '',
      form: { title: '', date: D.todayKey(), start: '09:00', dur: 60, cat: 'life' }
    })
  },

  go: function (e) {
    wx.navigateTo({ url: e.currentTarget.dataset.url })
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
    } else {
      store.addEvent(v)
    }
    this.setData({ sheet: false })
    this.refresh()
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
        that.refresh()
      }
    })
  },

  more: function (e) {    var id = e.currentTarget.dataset.id
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
              that.refresh()
            }
          })
        }
      }
    })
  }
})
