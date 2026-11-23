/* ============================================================
 * 同步层：把同步的 store 接到异步 API 上
 * 策略：本地先改（乐观更新）→ 发请求 → 用服务端数据重建
 * - file:// 打开时自动关闭（保持纯前端原型可用）
 * - 任何写失败都会回滚（重新拉一次服务端状态）
 * ============================================================ */
(function (global) {
  'use strict';

  var SP = global.SP;
  var App = null;
  var synced = false;
  var queue = [];
  var working = false;
  var refreshTimer = null;

  function req(method, path, body) {
    return fetch(path, {
      method: method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        return { status: r.status, data: d };
      });
    });
  }

  function range() {
    var t = new Date();
    var fmt = function (d) { return d.toISOString().slice(0, 10); };
    var from = new Date(t); from.setDate(from.getDate() - 45);
    // 未来拉到两年后：用户可能排到很远的长期日程，若只拉 75 天，
    // 翻到更晚的月份时日程会「闪现后消失」。两年足够覆盖绝大多数排期。
    var to = new Date(t); to.setDate(to.getDate() + 730);
    return { from: fmt(from), to: fmt(to) };
  }

  function refresh() {
    var r = range();
    return req('GET', '/api/state?from=' + r.from + '&to=' + r.to).then(function (res) {
      if (res.status === 401) return toLogin();
      if (res.status !== 200) return;
      SP.hydrate(res.data);
      if (App && App.refresh) App.refresh();
    });
  }

  function refreshSoon(delay) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(function () { refresh(); }, delay || 260);
  }

  /* 会话失效也要有个收尾：走和主动退出登录同一条过渡，别把界面硬切掉 */
  var leaving = false;
  function toLogin() {
    if (leaving) return;
    leaving = true;
    try { localStorage.removeItem('sketchplan.session'); } catch (e) {}
    if (global.Boot && global.Boot.exit && global.Boot.exit('/auth.html')) return;
    location.href = '/auth.html';
  }

  /* 把一次本地变更翻译成一个请求 */
  function send(op) {
    switch (op.type) {
      case 'create':
        return req('POST', '/api/events', {
          title: op.event.title, date: op.event.date, start: op.event.start,
          dur: op.event.dur, cat: op.event.cat, collectionId: op.event.collectionId,
          remind: op.event.remind
        });
      case 'createRepeat':
        return req('POST', '/api/events', {
          title: op.data.title, date: op.data.date, start: op.data.start, dur: op.data.dur,
          cat: op.data.cat, collectionId: op.data.collectionId, remind: op.data.remind,
          rule: op.data.rule, weekdays: op.data.weekdays || [], until: op.data.until
        });
      case 'toggle':
        return req('POST', '/api/events/' + op.id + '/toggle');
      case 'update':
        return req('PATCH', '/api/events/' + op.id, op.patch);
      case 'remove':
        return req('DELETE', '/api/events/' + op.id);
      case 'seriesRemove':
        return req('DELETE', '/api/series/' + op.id);
      case 'postpone':
        return req('POST', '/api/events/' + op.id + '/postpone', { date: op.date, start: op.start, reason: op.reason });
      case 'task':
        return req('POST', '/api/tasks', {
          title: op.task.title, unit: op.task.unit, target: op.task.target,
          start: op.task.start, due: op.task.due, cat: op.task.cat
        });
      case 'taskUpdate':
        return req('PATCH', '/api/tasks/' + op.id, op.patch);
      case 'taskDelete':
        return req('DELETE', '/api/tasks/' + op.id);
      case 'log':
        return req('POST', '/api/tasks/' + op.id + '/logs', { value: op.delta });
      case 'collectionAdd':
        return req('POST', '/api/collections', {
          name: op.collection.name, cat: op.collection.cat, note: op.collection.note
        });
      case 'collectionUpdate':
        return req('PATCH', '/api/collections/' + op.id, op.patch);
      case 'collectionRemove':
        return req('DELETE', '/api/collections/' + op.id);
      case 'review':
        return req('PUT', '/api/reviews/' + encodeURIComponent(op.key), op.patch);
      case 'settings':
        return req('PUT', '/api/settings', op.settings);
      default:
        return Promise.resolve({ status: 200 });
    }
  }

  /* 新建类操作会换 id，处理完立刻重建，避免后续操作打到临时 id */
  var ID_CHANGING = { create: 1, createRepeat: 1, collectionAdd: 1, task: 1 };

  function drain() {
    if (working) return;
    var op = queue.shift();
    if (!op) return;
    working = true;
    send(op)
      .then(function (res) {
        if (res.status === 401) return toLogin();
        if (res.status >= 400) {
          console.warn('[sync] 写入失败', op.type, res.status, res.data);
          if (App && App.toast) App.toast('保存失败', res.data && res.data.error ? res.data.error : '请稍后重试');
          return refresh();
        }
        if (ID_CHANGING[op.type]) return refresh();
        refreshSoon();
      })
      .catch(function (e) {
        console.warn('[sync] 网络错误', e.message);
        if (App && App.toast) App.toast('网络不稳', '改动会在恢复后重试');
        queue.unshift(op);           // 放回队列，稍后再试
        return new Promise(function (r) { setTimeout(r, 3000); });
      })
      .then(function () { working = false; drain(); });
  }

  function push(op) {
    if (!synced) return;
    queue.push(op);
    drain();
  }

  function boot(app) {
    App = app;
    if (location.protocol === 'file:') return Promise.resolve(false);   // 本地原型，不做同步
    return req('GET', '/api/me').then(function (r) {
      if (r.status === 401) { toLogin(); return false; }
      /* 静态托管会把 /api/me 当普通路径，返回 404 或一段 HTML —— 都视为"没有后端" */
      if (r.status !== 200 || !r.data || !r.data.user) return false;
      synced = true;
      SP.onMutate(push);
      document.body.classList.add('synced');
      var u = r.data.user || {};
      return refresh().then(function () {
        /* 云端身份以服务端为准，覆盖本地缓存里的显示名 */
        if (u.username) {
          SP.state.settings.name = u.username;
          SP.setSetting('name', u.username);
        }
        if (App && App.refresh) App.refresh();
        return true;
      });
    }).catch(function () {
      return false;                                                     // 网络异常不阻塞界面
    });
  }

  /* 脚本加载完即尝试接入；app.js 已先行执行并暴露 App */
  if (global.App) {
    setTimeout(function () { boot(global.App); }, 0);
  }

  global.Sync = {
    boot: boot,
    refresh: refresh,
    isSynced: function () { return synced; },
    logout: function (silent) {
      return req('POST', '/api/auth/logout').catch(function () {}).then(function () {
        if (!silent) toLogin();          // silent：由调用方（过渡层）负责跳转
      });
    }
  };
})(window);
