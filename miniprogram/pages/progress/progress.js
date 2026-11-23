var store = require('../../utils/store')
var theme = require('../../utils/theme')

Page({
  data: {
    theme: 'ink',
    pageStyle: '',
    tasks: [],
    plans: [],
    sheet: false,
    units: ['次', '篇', '章', '节', '天', '小时', '个'],
    unitIndex: 1,
    form: { title: '', target: '' }
  },

  onShow: function () {
    this.build()
  },

  build: function () {
    var s = store.settings()
    var t = theme.boot(s.theme)
    var tasks = store.tasks().map(function (k) {
      var p = store.taskProgress(k)
      return {
        id: k.id,
        title: k.title,
        unit: k.unit,
        target: p.target,
        done: p.done,
        pct: p.pct,
        left: p.left,
        catName: store.catName(k.cat),
        color: store.catColor(k.cat)
      }
    })
    var plans = store.plans().map(function (p) {
      return {
        title: p.title,
        catName: store.catName(p.cat),
        color: store.catColor(p.cat),
        pct: p.pct,
        from: p.from,
        to: p.to
      }
    })
    this.setData({
      theme: t.theme,
      pageStyle: t.pageStyle,
      tasks: tasks,
      plans: plans
    })
  },

  plus: function (e) {
    store.logTask(e.currentTarget.dataset.id, 1)
    this.build()
  },

  minus: function (e) {
    store.logTask(e.currentTarget.dataset.id, -1)
    this.build()
  },

  openNew: function () {
    this.setData({ sheet: true, form: { title: '', target: '' }, unitIndex: 1 })
  },

  onCancel: function () {
    this.setData({ sheet: false })
  },

  onTitle: function (e) {
    this.setData({ 'form.title': e.detail.value })
  },

  onTarget: function (e) {
    this.setData({ 'form.target': e.detail.value })
  },

  onUnit: function (e) {
    this.setData({ unitIndex: Number(e.detail.value) })
  },

  onSubmit: function () {
    var f = this.data.form
    var target = Number(f.target)
    if (!String(f.title || '').trim()) {
      wx.showToast({ title: '写个目标名', icon: 'none' })
      return
    }
    if (!target || target < 1) {
      wx.showToast({ title: '目标要大于 0', icon: 'none' })
      return
    }
    store.addTask({
      title: f.title,
      unit: this.data.units[this.data.unitIndex],
      target: target
    })
    this.setData({ sheet: false })
    this.build()
  },

  /* 吃掉弹层的冒泡与穿透滚动 */
  noop: function () {},

  del: function (e) {    var id = e.currentTarget.dataset.id
    var that = this
    wx.showModal({
      title: '删除这个计划？',
      content: '进度也会一起清掉',
      confirmText: '删除',
      confirmColor: '#D9503A',
      success: function (r) {
        if (!r.confirm) return
        store.removeTask(id)
        that.build()
      }
    })
  }
})
