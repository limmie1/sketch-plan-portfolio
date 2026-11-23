/* 全局配置：只有这里需要按你的环境改一次
   CLOUD_ENV 留空 = 未开通云开发，登录会退化为「本机模式」（见 utils/auth.js） */
module.exports = {
  /* 微信云开发环境 ID（形如 sketch-plan-1a2b3c），在开发者工具「云开发」里创建后填进来 */
  CLOUD_ENV: '',
  /* 云函数名：负责用官方接口取 OPENID */
  LOGIN_FN: 'login',
  /* 缓存里放登录态的 key（与业务数据分开，清数据不影响登录） */
  AUTH_KEY: 'sketchplan.mp.auth',
  /* 业务数据 key，与网页版完全独立，互不读写 */
  DATA_KEY: 'sketchplan.mp.v2'
}
