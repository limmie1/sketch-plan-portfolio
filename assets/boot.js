/* ============================================================
   Sketch Plan · 进出场过渡（登录 ⇄ 应用）
   - Boot.leave(url)   登入：进度条 0 → 100，走完跳转（默认 1 秒）
   - Boot.exit(url, p) 登出：进度条 100 → 0，等 p（登出请求）一起收尾
   - Boot.reveal()     落地页首屏就绪后淡出（index.html / auth.html 共用）
   两个方向共用同一套 DOM、同一套时长、同一套缓动，只是倒着走
   全部读 CSS 变量，不写死颜色，三套主题自动跟着变
   ============================================================ */
(function (global) {
  'use strict';

  var FLAG_IN = 'sketchplan.booting';   // 跨页面标记：这次进入是登录成功后的
  var FLAG_OUT = 'sketchplan.leaving';  // 跨页面标记：这次进入是退出登录后的
  var BAR = 700;                        // 进度条走完的时间
  var HOLD = 60;                        // 到点后停一下再走，别急着闪
  var MIN_TOTAL = 850;                  // 从点击到遮罩开始淡出，拢共约 1 秒
  var NET_MAX = 2200;                   // 登出请求最多等这么久，不能一直挡着

  var reduce = false;
  try { reduce = global.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  var SVG = '<path pathLength="1" d="M4 6.5h16M5.5 6v13h13V6M9 10l2.6 3.1L16 8.2"/>';

  /* 两种模式只差一句文案和一个初始百分比，骨架完全一样 */
  function label(m) { return m === 'out' ? '正在退出登录' : '正在载入数据'; }

  function template(m) {
    return '<div class="boot-inner">' +
      '<div class="boot-brand">' +
        '<div class="boot-mark"><svg viewBox="0 0 24 24">' + SVG + '</svg></div>' +
        '<div class="boot-name">Sketch Plan<em>把日程画在纸上</em></div>' +
      '</div>' +
      '<div class="boot-row">' +
        '<span class="boot-text">' + label(m) + '</span>' +
        '<span class="boot-pct">' + (m === 'out' ? '100%' : '0%') + '</span>' +
      '</div>' +
      '<div class="boot-track"><div class="boot-fill" style="width:' + (m === 'out' ? '100%' : '0') + '"></div></div>' +
    '</div>';
  }

  var mode = 'in';
  var el = null, fill = null, pct = null;
  var playing = false, revealing = false, raf = 0;

  function build() {
    el = el || document.querySelector('.boot');
    if (!el) {
      el = document.createElement('div');
      el.className = 'boot';
      el.dataset.mode = mode;
      if (mode === 'out') el.classList.add('bye');
      el.innerHTML = template(mode);
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.setAttribute('aria-label', label(mode));
      document.body.appendChild(el);
    } else if (el.dataset.mode !== mode) {
      /* 页面里预置的那张是另一个方向写的，就地换掉内容 */
      el.dataset.mode = mode;
      el.classList.toggle('bye', mode === 'out');
      el.setAttribute('aria-label', label(mode));
      el.innerHTML = template(mode);
    }
    fill = el.querySelector('.boot-fill');
    pct = el.querySelector('.boot-pct');
    return el;
  }

  function setValue(p) {
    var v = p < 0 ? 0 : p > 1 ? 1 : p;
    if (fill) fill.style.width = (v * 100).toFixed(2) + '%';
    if (pct) pct.textContent = Math.round(v * 100) + '%';
  }

  function show(fade) {
    build();
    document.documentElement.classList.add('boot-on');
    if (fade && !reduce) {
      el.classList.add('fresh');
      el.getBoundingClientRect();                 // 先按 0 算一次样式，过渡才真的跑
      el.classList.add('in');
    }
  }

  /* 登入：起步快、收尾慢；登出：原曲线上下翻过来，起步快、收尾稳。
     两者是同一根曲线关于中线的镜像，观感才一致 */
  function run(duration, then) {
    var out = mode === 'out';
    var start = 0, last = out ? 1 : 0;    // 起点就位：入从 0 起、出从满格起
    var total = reduce ? 240 : duration;

    function frame(ts) {
      if (!start) start = ts;
      var t = (ts - start) / total;
      if (t > 1) t = 1;
      /* 同一个「余量」曲线 e：起步快、收尾慢。
         登入把余量填进去（1-e），登出把余量清掉（e）—— 一根曲线两头用 */
      var e = Math.pow(1 - t, 2.4);
      var v = out ? e : 1 - e;
      /* 掉帧让时间戳回跳时，进度只往一个方向走：入只进、出只退 */
      if (out ? v > last : v < last) v = last;
      last = v;
      setValue(v);
      if (t < 1) { raf = global.requestAnimationFrame(frame); return; }
      raf = 0;
      if (then) global.setTimeout(then, reduce ? 40 : HOLD);
    }
    raf = global.requestAnimationFrame(frame);
  }

  /* 登录成功后调用：铺遮罩 → 进度条跑满 → 回调里跳转 */
  function play(then, duration) {
    if (playing) return;
    playing = true;
    mode = 'in';
    show(true);
    run(duration || BAR, then);
  }

  function leave(url) {
    try { sessionStorage.setItem(FLAG_IN, String(Date.now())); } catch (e) {}
    play(function () { global.location.href = url; });
  }

  /* 退出登录：遮罩铺开的同时把登出请求发出去，两边都收完再走。
     进度条退到底只是一个「收拾好了」的动作，不会真的卡住等网络 */
  function exit(url, pending) {
    if (playing) return false;
    /* 正在做登入过渡时被踢出去（会话中途失效），别叠两层动画，直接走 */
    if (document.documentElement.classList.contains('boot-on')) {
      global.location.href = url;
      return true;
    }

    playing = true;
    mode = 'out';
    try { sessionStorage.setItem(FLAG_OUT, String(Date.now())); } catch (e) {}
    /* 落地页要接着用同一套皮肤，别让登录页跳回默认主题 */
    try {
      var th = document.documentElement.dataset.theme;
      if (th) localStorage.setItem('sketchplan.theme', th);
    } catch (e) {}

    /* 静态页面上预置的是登入版遮罩，先把它换成登出的样子再淡入 */
    el = document.querySelector('.boot');
    if (el) el.dataset.mode = '';
    build();
    show(true);

    var net = (pending && typeof pending.then === 'function') ? pending : Promise.resolve();
    var anim = new Promise(function (res) { run(BAR, res); });
    var guard = new Promise(function (res) { global.setTimeout(res, NET_MAX); });

    Promise.all([anim, Promise.race([net.catch(function () {}), guard])]).then(function () {
      global.location.href = url;
    });
    return true;
  }

  /* 落地页侧：应用 / 登录页已经画好了，把遮罩淡掉 */
  function reveal() {
    if (playing || revealing) return;      // 出发页自己铺的那张不归这里管
    revealing = true;

    if (!document.documentElement.classList.contains('boot-on')) return;
    mode = document.documentElement.classList.contains('boot-bye') ? 'out' : 'in';
    build();

    var since = 0;
    try { since = Date.now() - (+sessionStorage.getItem(mode === 'out' ? FLAG_OUT : FLAG_IN) || 0); } catch (e) {}
    var wait = Math.min(260, Math.max(0, MIN_TOTAL - since));

    global.setTimeout(function () {
      setValue(mode === 'out' ? 0 : 1);     // 登入停在满格、登出停在空，各自接住上一页
      if (!el) return;
      el.classList.add('out');
      global.setTimeout(function () {
        document.documentElement.classList.remove('boot-on', 'boot-bye');
        if (el && el.parentNode) el.parentNode.removeChild(el);
        el = null;
        try {
          sessionStorage.removeItem(FLAG_IN);
          sessionStorage.removeItem(FLAG_OUT);
        } catch (e) {}
      }, reduce ? 10 : 260);
    }, wait);
  }

  /* 万一落地页脚本出错，遮罩也不能一直挡着 */
  function failsafe() {
    if (playing) return;                   // 正在跑过渡，别插一脚
    if (!document.documentElement.classList.contains('boot-on')) return;
    reveal();
  }

  /* 只有「带着遮罩进来」的页面才需要自动收尾 */
  var arriving = document.documentElement.classList.contains('boot-on');

  if (arriving) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        global.requestAnimationFrame(function () { global.requestAnimationFrame(reveal); });
      });
    } else {
      global.requestAnimationFrame(reveal);
    }
    global.setTimeout(failsafe, 2600);
  }

  /* 从缓存后退回来时复位，否则遮罩状态会卡住 */
  global.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    playing = false; revealing = false;
    if (raf) { global.cancelAnimationFrame(raf); raf = 0; }
    document.documentElement.classList.remove('boot-on', 'boot-bye');
    if (el && el.parentNode) el.parentNode.removeChild(el);
    el = fill = pct = null;
    try {
      sessionStorage.removeItem(FLAG_IN);
      sessionStorage.removeItem(FLAG_OUT);
    } catch (err) {}
  });

  global.Boot = {
    play: play,
    leave: leave,
    exit: exit,
    reveal: reveal,
    active: function () { return playing; }
  };
})(window);
