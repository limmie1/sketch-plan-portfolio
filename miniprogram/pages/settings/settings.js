var store = require('../../utils/store')
var theme = require('../../utils/theme')
var auth = require('../../utils/auth')
var CFG = require('../../config')

var REMIND = [0, 5, 10, 15, 20, 30, 60, 1440]
var REMIND_TXT = ['不提醒', '5 分钟前', '10 分钟前', '15 分钟前', '20 分钟前', '30 分钟前', '1 小时前', '1 天前']

Page({
  data: {
    theme: 'ink',
    pageStyle: '',
    themes: [
      { id: 'ink', name: '纸墨' },
      { id: 'pebble', name: '柔彩' },
      { id: 'aurora', name: '夜航' }
    ],
    name: '我',
    weekOpts: ['周一', '周日'],
    remOpts: REMIND_TXT,
    weekStart: 1,
    weekStartTxt: '周一',
    remindIdx: 4,
    remindTxt: '20 分钟前',
    autoComplete: true,
    cloudReady: false,
    cloudEnv: '',
    user: null,
    userShort: '',
    loginErr: ''
  },

  onShow: function () {
    var s = store.settings()
    var t = theme.boot(s.theme)
    var idx = REMIND.indexOf(Number(s.defaultRemind))
    if (idx < 0) idx = 4
    var u = auth.cached()
    this.setData({
      theme: t.theme,
      pageStyle: t.pageStyle,
      name: s.name || '我',
      weekStart: s.weekStart === 0 ? 0 : 1,
      weekStartTxt: s.weekStart === 0 ? '周日' : '周一',
      remindIdx: idx,
      remindTxt: REMIND_TXT[idx],
      autoComplete: !!s.autoComplete,
      cloudReady: auth.hasCloud(),
      cloudEnv: CFG.CLOUD_ENV || '（未填）',
      user: u,
      userShort: u && u.openid ? String(u.openid).slice(-6) : '',
      loginErr: (u && u.error) || ''
    })
  },

  onName: function (e) {
    var v = String(e.detail.value || '').trim()
    store.setSetting('name', v || '我')
    this.setData({ name: v || '我' })
  },

  setTheme: function (e) {
    var v = e.currentTarget.dataset.t
    if (v === this.data.theme) return
    store.setTheme(v)
    this.onShow()
  },

  onWeekStart: function (e) {
    var v = Number(e.detail.value) === 0 ? 0 : 1
    store.setSetting('weekStart', v)
    this.setData({ weekStart: v, weekStartTxt: v === 0 ? '周日' : '周一' })
  },

  onRemind: function (e) {
    var i = Number(e.detail.value)
    store.setSetting('defaultRemind', REMIND[i])
    this.setData({ remindIdx: i, remindTxt: REMIND_TXT[i] })
  },

  onAuto: function (e) {
    store.setSetting('autoComplete', !!e.detail.value)
    this.setData({ autoComplete: !!e.detail.value })
  },

  /* 重新走一次微信官方登录链路（wx.login → 云函数取 OPENID） */
  relogin: function () {
    var that = this
    wx.showLoading({ title: '正在登录' })
    auth.login().then(function (u) {
      wx.hideLoading()
      that.onShow()
      if (u.mode === 'cloud') wx.showToast({ title: '已登录', icon: 'none' })
      else wx.showToast({ title: '本机模式：' + (u.error || '未配置云环境'), icon: 'none' })
    }).catch(function (e) {
      wx.hideLoading()
      wx.showToast({ title: (e && e.message) || '登录失败', icon: 'none' })
    })
  },

  logout: function () {
    var that = this
    wx.showModal({
      title: '退出登录？',
      content: '只清登录态，本机日程和计划都保留',
      success: function (r) {
        if (!r.confirm) return
        auth.logout()
        that.onShow()
      }
    })
  },

  loadDemo: function () {
    var that = this
    wx.showModal({
      title: '换成示例数据？',
      content: '现在的日程和计划会被覆盖',
      success: function (r) {
        if (!r.confirm) return
        store.loadDemo()
        that.onShow()
        wx.showToast({ title: '已载入示例', icon: 'none' })
      }
    })
  },

  clearAll: function () {
    var that = this
    wx.showModal({
      title: '清空本机数据？',
      content: '所有日程、计划、工作集、便签都会删除，且无法恢复',
      confirmText: '清空',
      confirmColor: '#D9503A',
      success: function (r) {
        if (!r.confirm) return
        store.clearAll()
        that.onShow()
        wx.showToast({ title: '已清空', icon: 'none' })
      }
    })
  },

  about: function () {
    wx.navigateTo({ url: '/pages/about/about' })
  }
})
