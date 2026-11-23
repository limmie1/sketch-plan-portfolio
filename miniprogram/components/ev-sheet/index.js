Component({
  properties: {
    show: { type: Boolean, value: false },
    value: { type: Object, value: null },
    cats: { type: Array, value: [] }
  },

  data: {
    form: { title: '', date: '', start: '09:00', dur: 60, cat: 'life', notes: '' },
    durList: [15, 30, 45, 60, 90, 120, 180],
    durIndex: 3,
    catIndex: 0,
    editing: false
  },

  observers: {
    'show, value': function (show, value) {
      if (!show) return
      var v = value || {}
      var dur = Number(v.dur) || 60
      var di = this.data.durList.indexOf(dur)
      if (di < 0) di = 3
      var cats = this.data.cats || []
      var ci = 0
      for (var i = 0; i < cats.length; i++) {
        if (cats[i].id === v.cat) ci = i
      }
      this.setData({
        form: {
          title: v.title || '',
          date: v.date || '',
          start: v.start || '09:00',
          dur: dur,
          cat: v.cat || 'life',
          notes: v.notes || ''
        },
        durIndex: di,
        catIndex: ci,
        editing: !!v.id
      })
    }
  },

  methods: {
    onTitle: function (e) {
      this.setData({ 'form.title': e.detail.value })
    },
    onDate: function (e) {
      this.setData({ 'form.date': e.detail.value })
    },
    onTime: function (e) {
      this.setData({ 'form.start': e.detail.value })
    },
    onDur: function (e) {
      var i = Number(e.detail.value)
      this.setData({ durIndex: i, 'form.dur': this.data.durList[i] })
    },
    onCat: function (e) {
      var i = Number(e.detail.value)
      var cats = this.data.cats || []
      this.setData({ catIndex: i, 'form.cat': (cats[i] || {}).id || 'life' })
    },

    submit: function () {
      var f = this.data.form
      if (!String(f.title || '').trim()) {
        wx.showToast({ title: '写点什么吧', icon: 'none' })
        return
      }
      if (!f.date) {
        wx.showToast({ title: '选个日期', icon: 'none' })
        return
      }
      this.triggerEvent('submit', { value: f, editing: this.data.editing })
    },

    cancel: function () {
      this.triggerEvent('cancel')
    },

    remove: function () {
      this.triggerEvent('remove')
    },

    /* 吃掉冒泡与穿透滚动，避免点弹层时把后面的列表也带动 */
    noop: function () {}
  }
})
