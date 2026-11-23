var auth = require('./utils/auth')
var store = require('./utils/store')

App({
  globalData: {
    theme: 'ink',
    user: null,
    cloudReady: false
  },

  onLaunch: function () {
    /* 首次启动建库并放几条示例，避免第一屏空着 */
    store.init()

    /* 登录：微信官方链路（wx.login → 云函数 getWXContext 取 OPENID）
       失败不阻断使用——数据本来就是本机存的，登录只用于认人 */
    this.globalData.cloudReady = auth.init()
    var that = this
    var u = auth.cached()
    if (u) {
      this.globalData.user = u
    } else {
      auth.login().then(function (user) {
        that.globalData.user = user
      }).catch(function () {})
    }

    this.globalData.theme = store.settings().theme || 'ink'
  },

  onShow: function () {
    this.globalData.theme = store.settings().theme || 'ink'
  }
})
