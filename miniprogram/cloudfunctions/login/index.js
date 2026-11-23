/* 云函数 login：微信官方身份链路里服务端的那一半
   小程序端 wx.login() 拿到 code 后 callFunction 进来，
   这里用 cloud.getWXContext() 直接拿到微信颁发的 OPENID。
   OPENID 无法被客户端伪造，也不需要密码；不需要备案域名。 */
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event) => {
  const { OPENID, APPID, UNIONID } = cloud.getWXContext()
  return {
    openid: OPENID,
    appid: APPID,
    unionid: UNIONID || '',
    /* event.code 是 wx.login 的临时凭证，云开发模式下游标已足够，
       这里只回传长度做链路自检，不落库、不外传 */
    codeLen: event && event.code ? String(event.code).length : 0,
    ts: Date.now()
  }
}
