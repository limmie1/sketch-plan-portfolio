var store = require('../../utils/store')
var theme = require('../../utils/theme')

Page({
  data: {
    theme: 'ink',
    pageStyle: '',
    kw: '',
    results: [],
    total: 0,
    searched: false
  },

  onShow: function () {
    var s = store.settings()
    var t = theme.boot(s.theme)
    this.setData({ theme: t.theme, pageStyle: t.pageStyle })
  },

  onInput: function (e) {
    var kw = e.detail.value
    this.setData({ kw: kw })
    var that = this
    if (this._timer) clearTimeout(this._timer)
    this._timer = setTimeout(function () {
      var list = store.search(kw)
      that.setData({ results: list, total: list.length, searched: !!String(kw).trim() })
    }, 180)
  },

  tapItem: function (e) {
    var i = Number(e.currentTarget.dataset.i)
    var item = this.data.results[i]
    if (!item) return
    if (item.type === 'collection') {
      wx.navigateTo({ url: '/pages/collections/collections' })
      return
    }
    if (item.type === 'task') {
      wx.switchTab({ url: '/pages/progress/progress' })
      return
    }
    var that = this
    wx.showModal({
      title: item.title,
      content: item.sub + ' · ' + item.catName + (item.done ? '（已完成）' : ''),
      confirmText: '看这天',
      cancelText: '关闭',
      success: function (r) {
        if (!r.confirm) return
        that.jump(item.date)
      }
    })
  },

  jump: function (date) {
    var app = getApp()
    if (app) app.globalData.jumpDate = date
    wx.switchTab({ url: '/pages/timeline/timeline' })
  },

  clear: function () {
    this.setData({ kw: '', results: [], total: 0, searched: false })
  }
})
