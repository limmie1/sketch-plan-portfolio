var store = require('../../utils/store')
var D = require('../../utils/date')
var theme = require('../../utils/theme')

Page({
  data: {
    theme: 'ink',
    pageStyle: '',
    list: [],
    expanded: '',
    detail: []
  },

  onShow: function () {
    this.build()
  },

  build: function () {
    var s = store.settings()
    var t = theme.boot(s.theme)
    var expanded = this.data.expanded
    var list = store.collections().map(function (c) {
      var st = store.collectionStats(c.id)
      return {
        id: c.id,
        name: c.name,
        note: c.note,
        cat: c.cat,
        catName: store.catName(c.cat),
        color: store.catColor(c.cat),
        total: st.total,
        done: st.done,
        rate: st.rate,
        hours: st.hours
      }
    })
    this.setData({ theme: t.theme, pageStyle: t.pageStyle, list: list })
    if (expanded) this.loadDetail(expanded)
  },

  loadDetail: function (id) {
    var detail = store.collectionEvents(id).map(function (e) {
      return {
        id: e.id,
        title: e.title,
        date: D.cnDate(e.date),
        time: e.start,
        done: e.done,
        color: store.catColor(e.cat)
      }
    })
    this.setData({ detail: detail })
  },

  toggle: function (e) {
    var id = e.currentTarget.dataset.id
    if (this.data.expanded === id) {
      this.setData({ expanded: '', detail: [] })
      return
    }
    this.setData({ expanded: id })
    this.loadDetail(id)
  },

  create: function () {
    var that = this
    var cats = store.catList()
    wx.showModal({
      title: '新建工作集',
      editable: true,
      placeholderText: '比如：毕业论文',
      success: function (r) {
        if (!r.confirm) return
        var name = String(r.content || '').trim()
        if (!name) return
        var res = store.addCollection(name, (cats[0] || {}).id, '')
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
    var c = store.collectionById(id)
    if (!c) return
    var that = this
    wx.showActionSheet({
      itemList: ['改名', '写点说明', '换分类', '删除工作集'],
      success: function (r) {
        if (r.tapIndex === 0 || r.tapIndex === 1) {
          wx.showModal({
            title: r.tapIndex === 0 ? '改名' : '说明',
            editable: true,
            placeholderText: r.tapIndex === 0 ? c.name : '这个工作集在推进什么',
            content: r.tapIndex === 1 ? c.note : '',
            success: function (m) {
              if (!m.confirm) return
              var v = String(m.content || '').trim()
              if (!v) return
              store.updateCollection(id, r.tapIndex === 0 ? { name: v } : { note: v })
              that.build()
            }
          })
        } else if (r.tapIndex === 2) {
          var cats = store.catList()
          wx.showActionSheet({
            itemList: cats.map(function (c2) { return c2.name }),
            success: function (m) {
              var target = cats[m.tapIndex]
              if (!target) return
              store.updateCollection(id, { cat: target.id })
              that.build()
            }
          })
        } else {
          wx.showModal({
            title: '删除「' + c.name + '」？',
            content: '里面的日程不会删，只是不再属于这个工作集',
            confirmText: '删除',
            confirmColor: '#D9503A',
            success: function (m) {
              if (!m.confirm) return
              store.removeCollection(id)
              that.setData({ expanded: '' })
              that.build()
            }
          })
        }
      }
    })
  },

  goCalendar: function () {
    wx.switchTab({ url: '/pages/calendar/calendar' })
  }
})
