var store = require('../../utils/store')
var theme = require('../../utils/theme')

Page({
  data: {
    theme: 'ink',
    pageStyle: '',
    version: '1.0.0'
  },

  onShow: function () {
    var s = store.settings()
    var t = theme.boot(s.theme)
    this.setData({ theme: t.theme, pageStyle: t.pageStyle })
  }
})
