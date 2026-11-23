var store = require('../../utils/store')
var theme = require('../../utils/theme')
var auth = require('../../utils/auth')

Page({
  data: {
    theme: 'ink',
    pageStyle: '',
    name: '我',
    avatar: '',
    mode: '',
    openidShort: '',
    cloudReady: false,
    stats: {}
  },

  onShow: function () {
    this.build()
  },

  build: function () {
    var s = store.settings()
    var t = theme.boot(s.theme)
    var u = auth.cached() || {}
    this.setData({
      theme: t.theme,
      pageStyle: t.pageStyle,
      name: u.nickName || s.name || '我',
      avatar: u.avatarUrl || '',
      mode: u.mode === 'cloud' ? '微信登录' : '本机模式',
      openidShort: u.openid ? String(u.openid).slice(-6) : '',
      cloudReady: auth.hasCloud(),
      stats: store.stats()
    })
  },

  /* 官方现行方式：button open-type="chooseAvatar" 拿头像 */
  onAvatar: function (e) {
    var url = e.detail && e.detail.avatarUrl
    if (!url) return
    auth.saveProfile({ avatarUrl: url })
    this.setData({ avatar: url })
  },

  /* 官方现行方式：input type="nickname"，键盘上方带微信昵称快捷填充 */
  onNick: function (e) {
    var v = String(e.detail.value || '').trim()
    if (!v) return
    auth.saveProfile({ nickName: v })
    store.setSetting('name', v)
    this.setData({ name: v })
  },

  relogin: function () {
    var that = this
    wx.showLoading({ title: '正在登录' })
    auth.login().then(function () {
      wx.hideLoading()
      that.build()
    }).catch(function (e) {
      wx.hideLoading()
      wx.showToast({ title: (e && e.message) || '登录失败', icon: 'none' })
    })
  },

  go: function (e) {
    wx.navigateTo({ url: e.currentTarget.dataset.url })
  },

  setTheme: function (e) {
    var v = e.currentTarget.dataset.t
    if (v === this.data.theme) return
    store.setTheme(v)
    this.build()
  }
})
