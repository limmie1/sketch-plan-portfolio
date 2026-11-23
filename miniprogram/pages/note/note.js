var store = require('../../utils/store')
var D = require('../../utils/date')
var theme = require('../../utils/theme')

Page({
  data: {
    theme: 'ink',
    pageStyle: '',
    text: '',
    count: 0,
    updatedAt: ''
  },

  onShow: function () {
    var s = store.settings()
    var t = theme.boot(s.theme)
    var n = store.getNote()
    this.setData({
      theme: t.theme,
      pageStyle: t.pageStyle,
      text: n.text || '',
      count: (n.text || '').length,
      updatedAt: n.updatedAt ? this.fmt(n.updatedAt) : ''
    })
  },

  onHide: function () { this.flush() },
  onUnload: function () { this.flush() },

  fmt: function (ts) {
    var d = new Date(ts)
    return D.cnDate(D.key(d)) + ' ' + D.pad(d.getHours()) + ':' + D.pad(d.getMinutes())
  },

  /* 输入就存，但节流到 600ms，避免每敲一个字写一次 storage */
  onInput: function (e) {
    var v = e.detail.value
    this.setData({ text: v, count: v.length })
    var that = this
    if (this._timer) clearTimeout(this._timer)
    this._timer = setTimeout(function () { that.flush() }, 600)
  },

  flush: function () {
    if (this._timer) { clearTimeout(this._timer); this._timer = null }
    var n = store.setNote(this.data.text)
    this.setData({ updatedAt: this.fmt(n.updatedAt) })
  },

  clear: function () {
    var that = this
    wx.showModal({
      title: '清空这张便签？',
      content: '内容删掉就找不回来了',
      confirmText: '清空',
      confirmColor: '#D9503A',
      success: function (r) {
        if (!r.confirm) return
        that.setData({ text: '', count: 0 })
        that.flush()
      }
    })
  }
})
