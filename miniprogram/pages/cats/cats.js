var store = require('../../utils/store')
var theme = require('../../utils/theme')

Page({
  data: {
    theme: 'ink',
    pageStyle: '',
    list: [],
    total: 0
  },

  onShow: function () {
    this.build()
  },

  build: function () {
    var s = store.settings()
    var t = theme.boot(s.theme)
    var list = store.catList().map(function (c) {
      var u = store.catUsage(c.id)
      return {
        id: c.id,
        name: c.name,
        desc: c.desc || '',
        color: c.color,
        builtin: c.builtin,
        events: u.events,
        tasks: u.tasks,
        collections: u.collections,
        total: u.total
      }
    })
    this.setData({
      theme: t.theme,
      pageStyle: t.pageStyle,
      list: list,
      total: list.length
    })
  },

  create: function () {
    var that = this
    wx.showModal({
      title: '新建分类',
      editable: true,
      placeholderText: '比如：健身、家务、副业',
      success: function (r) {
        if (!r.confirm) return
        var res = store.addCat(String(r.content || '').trim(), '')
        if (res.error) {
          wx.showToast({ title: res.error, icon: 'none' })
          return
        }
        that.build()
        wx.showToast({ title: '已新建', icon: 'none' })
      }
    })
  },

  more: function (e) {
    var id = e.currentTarget.dataset.id
    var c = store.catById(id)
    if (!c) return
    var that = this
    wx.showActionSheet({
      itemList: ['改名', '改描述', '删除分类'],
      success: function (r) {
        if (r.tapIndex === 0 || r.tapIndex === 1) {
          wx.showModal({
            title: r.tapIndex === 0 ? '改名' : '描述',
            editable: true,
            placeholderText: r.tapIndex === 0 ? c.name : '这个分类装什么',
            content: r.tapIndex === 1 ? (c.desc || '') : '',
            success: function (m) {
              if (!m.confirm) return
              var v = String(m.content || '').trim()
              var res = store.updateCat(id, r.tapIndex === 0 ? { name: v } : { desc: v })
              if (res.error) {
                wx.showToast({ title: res.error, icon: 'none' })
                return
              }
              that.build()
            }
          })
          return
        }
        that.tryRemove(id)
      }
    })
  },

  /* 删除：有内容先让用户选一个迁移目标，避免日程变孤儿 */
  tryRemove: function (id) {
    var that = this
    var c = store.catById(id)
    if (!c) return
    var use = store.catUsage(id)
    var others = store.catList().filter(function (x) { return x.id !== id })
    if (!others.length) {
      wx.showToast({ title: '至少保留一个分类', icon: 'none' })
      return
    }
    if (!use.total) {
      wx.showModal({
        title: '删除「' + c.name + '」？',
        content: '这个分类下没有内容',
        confirmText: '删除',
        confirmColor: '#D9503A',
        success: function (m) {
          if (!m.confirm) return
          var res = store.removeCat(id)
          if (res.error) wx.showToast({ title: res.error, icon: 'none' })
          that.build()
        }
      })
      return
    }
    wx.showModal({
      title: '「' + c.name + '」里还有 ' + use.total + ' 项',
      content: '删除前，先把它们挪到另一个分类',
      confirmText: '选分类',
      success: function (m) {
        if (!m.confirm) return
        wx.showActionSheet({
          itemList: others.map(function (x) { return x.name }),
          success: function (r) {
            var target = others[r.tapIndex]
            if (!target) return
            var res = store.removeCat(id, target.id)
            if (res.error) {
              wx.showToast({ title: res.error, icon: 'none' })
              return
            }
            that.build()
            wx.showToast({ title: '已并入 ' + target.name, icon: 'none' })
          }
        })
      }
    })
  }
})
