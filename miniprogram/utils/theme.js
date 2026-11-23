/* 主题：三套皮肤的开机与切换，跟 Web 版同一组色值
   WXSS 里的 --bg/--text 等变量由 app.wxss 的 .theme-xxx 提供，
   这里只负责导航栏、窗口底色、tabBar 这类原生外壳跟着变 */

var THEMES = {
  ink: {
    bg: '#FBF7EE', nav: '#FBF7EE', front: '#000000',
    tabBg: '#FDFBF5', tabColor: '#948B7A', tabActive: '#D9503A', border: 'white'
  },
  pebble: {
    bg: '#FBFBFD', nav: '#FBFBFD', front: '#000000',
    tabBg: '#FFFFFF', tabColor: '#8B8B99', tabActive: '#5B6CFF', border: 'white'
  },
  aurora: {
    bg: '#0A0B0F', nav: '#0A0B0F', front: '#ffffff',
    tabBg: '#12141B', tabColor: '#6A7186', tabActive: '#8B5CF6', border: 'black'
  }
}

function get(name) { return THEMES[name] || THEMES.ink }

/* 返回给页面用的 data 片段 */
function boot(name) {
  var t = THEMES[name] ? name : 'ink'
  var c = THEMES[t]
  wx.setNavigationBarColor({
    frontColor: c.front,
    backgroundColor: c.nav,
    fail: function () {}
  })
  wx.setBackgroundColor({
    backgroundColor: c.bg,
    backgroundColorTop: c.bg,
    backgroundColorBottom: c.bg,
    fail: function () {}
  })
  wx.setTabBarStyle({
    color: c.tabColor,
    selectedColor: c.tabActive,
    backgroundColor: c.tabBg,
    borderStyle: c.border,
    fail: function () {}
  })
  return { theme: t, pageStyle: 'background:' + c.bg + ';', tx: c }
}

module.exports = { THEMES: THEMES, get: get, boot: boot }
