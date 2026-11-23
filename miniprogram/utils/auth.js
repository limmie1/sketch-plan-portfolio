/* ============================================================
   登录：只用微信小程序官方链路，不自建账号体系
   ------------------------------------------------------------
   标准做法（云开发，推荐，无需域名/备案）：
     wx.login() 拿 code → 云函数 login 里 cloud.getWXContext() 拿到 OPENID
     OPENID 由微信颁发，客户端拿不到也伪造不了，不需要密码
   备选（自建服务端，需要已备案的 request 合法域名）：
     wx.login() 拿 code → 后端 code2session(appid, secret, code) 换 openid
     本项目服务器在境外、无备案，所以默认走云开发；后端方案仅留说明

   数据策略：本机独立存储（wx.storage），与网页版不互通；
   登录态只用于「认出这台设备上的是谁」，不参与数据同步。
   ============================================================ */
var CFG = require('../config')

function hasCloud() {
  return !!(wx.cloud && CFG.CLOUD_ENV && CFG.CLOUD_ENV.indexOf('请填') < 0)
}

/* 应用启动时调一次；返回是否启用了云开发 */
function init() {
  if (!hasCloud()) return false
  try {
    wx.cloud.init({ env: CFG.CLOUD_ENV, traceUser: true })
    return true
  } catch (e) {
    return false
  }
}

function cached() {
  try { return wx.getStorageSync(CFG.AUTH_KEY) || null } catch (e) { return null }
}

function cache(user) {
  try { wx.setStorageSync(CFG.AUTH_KEY, user) } catch (e) {}
}

function clearCache() {
  try { wx.removeStorageSync(CFG.AUTH_KEY) } catch (e) {}
}

/* 官方第一步：wx.login 取临时登录凭证 code（五分钟有效、一次一用） */
function code() {
  return new Promise(function (resolve, reject) {
    wx.login({
      success: function (r) {
        if (r && r.code) resolve(r.code)
        else reject(new Error('wx.login 未返回 code'))
      },
      fail: function (e) { reject(new Error(e.errMsg || 'wx.login 失败')) }
    })
  })
}

function localId() {
  var id = null
  try { id = wx.getStorageSync('sketchplan.mp.device') } catch (e) {}
  if (!id) {
    id = 'local-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
    try { wx.setStorageSync('sketchplan.mp.device', id) } catch (e) {}
  }
  return id
}

/**
 * 登录：拿到 openid 并缓存
 * @returns Promise<{mode:'cloud'|'local', openid, code?, at, error?}>
 *   mode=local 表示没配云环境，只在本地生成一个设备标识，不冒充微信身份
 */
function login() {
  init()
  return code().then(function (c) {
    var base = { code: c, at: Date.now() }
    if (!hasCloud()) {
      return {
        mode: 'local', openid: localId(), code: c, at: base.at,
        error: '未配置云开发环境（config.js 的 CLOUD_ENV）'
      }
    }
    return wx.cloud.callFunction({ name: CFG.LOGIN_FN, data: { code: c } }).then(function (res) {
      var d = (res && res.result) || {}
      if (!d.openid) throw new Error('云函数未返回 openid')
      return { mode: 'cloud', openid: d.openid, unionid: d.unionid || '', code: c, at: Date.now() }
    }).catch(function (e) {
      return {
        mode: 'local', openid: localId(), code: c, at: Date.now(),
        error: (e && e.message) || '云函数调用失败，检查是否已部署 login'
      }
    })
  }).then(function (u) {
    cache(u)
    return u
  })
}

/* 头像昵称：官方现行方式是 chooseAvatar 按钮 + type="nickname" 输入框，
   不再弹 wx.getUserInfo 授权框；这里只把结果存到本机 */
function saveProfile(patch) {
  var u = cached() || { mode: 'local', openid: localId(), at: Date.now() }
  if (patch.nickName !== undefined) u.nickName = String(patch.nickName || '').slice(0, 20)
  if (patch.avatarUrl !== undefined) u.avatarUrl = patch.avatarUrl
  cache(u)
  return u
}

/* 退出登录：只清本机登录态，业务数据保持不动（数据是本机的，不属于某个账号） */
function logout() {
  clearCache()
}

module.exports = {
  hasCloud: hasCloud,
  init: init,
  login: login,
  cached: cached,
  saveProfile: saveProfile,
  logout: logout,
  localId: localId
}
