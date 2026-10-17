// @ts-check
/* ============================================================================
 * OG.Social (phần 2) — BẢNG XẾP HẠNG: LƯU CỤC BỘ, ADAPTER BACKEND (online), SCENE 'leaderboard'
 * ----------------------------------------------------------------------------
 * Vai trò:      Giữ top 10 điểm trong save của trình duyệt (nguồn sự thật), tuỳ chọn gửi kèm lên một máy chủ
 *               bảng xếp hạng online, và hiển thị scene 'leaderboard' (panel DOM có tab Trên máy / Trực tuyến).
 *               social.js (submitResult, mountResult) và scene journeyEnd gọi vào đây. Nạp SAU src/social/social.js.
 * Khái niệm:    adapter pattern (mọi backend cùng một "giao diện" {id, name, online, submit, list, clear?}) ·
 *               registry backend + chọn lúc chạy (strategy) · local-first (cục bộ đồng bộ, online bất đồng bộ,
 *               không chặn game) · Promise + timeout bằng AbortController · không tin dữ liệu ngoài (sanitize) ·
 *               chống race condition khi đổi tab (request id) · xác nhận bấm 2 lần thay cho confirm()
 * Bài học:      docs/learn/11-luu-tru-migrate.md (OG.Save.ns, dữ liệu hỏng) · docs/learn/05-state-machine-scene.md
 *               (scene 'leaderboard', back/backParams) · docs/learn/06-event-bus-observer.md (leaderboard:submit)
 * Phụ thuộc:    LOAD: OG.Social (social.js tạo trước; dùng S.cleanName, S.renderList, S.getPlayerName/setPlayerName,
 *               S.NAME_MAX lúc CHẠY). CHẠY: OG.Save (ns, data, commit), OG.Events, OG.DOM (panel, hidePanel, toast,
 *               setHudVisible, setControlsVisible), OG.Scenes (has, go, register), OG.Input, OG.Config.LEADERBOARD_URL,
 *               window.OG_LEADERBOARD_URL, window.fetch, OG.drawLastPlayScene, OG.drawTitleBackdrop
 * Event:        phát: 'leaderboard:submit' {entry, rank, rename?}, 'leaderboard:clear' {}, 'social:onlineSubmit'
 *               {entry, ok, rank}, 'ui:click' · nghe: (không)
 * API công khai: OG.Social.submitScore/getLeaderboard/clearLeaderboard/renameEntry/fetchLeaderboard,
 *               sanitizeEntry/compareEntries, backend/backends/registerBackend/setBackend/isOnline,
 *               createHttpBackend/useOnline, initLeaderboard · scene 'leaderboard'
 * Đọc tiếp:     docs/leaderboard-worker.example.js (máy chủ REST mẫu khớp createHttpBackend) → src/social/social.js
 *               (mountResult: nơi người chơi lưu điểm)
 * Dữ liệu:      LeaderboardEntry, LeaderboardBackend (typedef bên dưới)
 *
 * Hợp đồng (đồng bộ, luôn dùng bản CỤC BỘ — nguồn sự thật trên máy):
 *   OG.Social.submitScore(entry) -> rank (1-based) | -1
 *        entry = {name, score, charId, levelId, levelsCompleted:int, time, date, type, (+ id, stars, skinId, levelName)}
 *        Lưu trong OG.Save.ns('social').leaderboard (tối đa 10 mục). Emit 'leaderboard:submit' {entry, rank}.
 *        Nếu đang dùng backend online thì gửi kèm (không chặn), xong emit 'social:onlineSubmit' {entry, ok, rank}.
 *   OG.Social.getLeaderboard(limit) -> [entry]
 *   OG.Social.clearLeaderboard()
 * ADAPTER BACKEND:
 *   backend = { id, name, online:bool,
 *               submit(entry) -> Promise<{rank}>, list(limit) -> Promise<[entry]>, clear?() -> Promise }
 *   OG.Social.backend                     — backend hiện tại (mặc định OG.Social.backends.local)
 *   OG.Social.backends                    — {local, ...} các backend đã đăng ký
 *   OG.Social.registerBackend(backend)    — thêm backend tuỳ biến (Firebase, Supabase...).
 *   OG.Social.setBackend(idOrBackend)     — chọn backend.
 *   OG.Social.createHttpBackend({url, name, timeout}) — backend REST (xem docs/leaderboard-worker.example.js):
 *        GET  {url}/scores?limit=N  -> {scores:[entry]}
 *        POST {url}/scores  (entry JSON) -> {rank, scores?}
 *   OG.Social.useOnline(url, {persist}) — bật nhanh backend HTTP. Cũng tự bật nếu khai báo
 *        window.OG_LEADERBOARD_URL hoặc OG.Config.LEADERBOARD_URL trước khi init, hoặc đã persist.
 *   OG.Social.fetchLeaderboard(limit, source) -> Promise<[entry]>  (source: 'local' | 'online')
 * Scene 'leaderboard': params {back, backParams, highlightId, tab}. Esc/nút Quay lại → về scene `back`.
 * ========================================================================== */

/**
 * @typedef {Object} LeaderboardEntry  một mục trên bảng xếp hạng (sau sanitize)
 * @property {string} id               chuỗi [a-zA-Z0-9_-], ≤ 24 ký tự
 * @property {string} name             ≤ 16 ký tự, mặc định 'Ẩn danh'
 * @property {number} score            số nguyên 0..1e9
 * @property {string} charId
 * @property {string|null} skinId
 * @property {string|null} levelId
 * @property {string} levelName
 * @property {number} levelsCompleted  số màn đã qua 0..99
 * @property {number} stars
 * @property {number} time             giây, làm tròn 0,1
 * @property {string} date             ISO 8601
 * @property {'victory'|'gameover'} type
 */
/**
 * @typedef {Object} LeaderboardBackend  "giao diện" chung mà mọi backend phải có (adapter pattern)
 * @property {string} id
 * @property {string} name        tên hiện trên tab
 * @property {boolean} online     false = chỉ trên máy này
 * @property {function(Object): Promise<{rank:number}>} submit
 * @property {function(number=): Promise<LeaderboardEntry[]>} list
 * @property {function(): Promise<any>} [clear]
 * @property {string} [url]
 */
(function () {
  'use strict';
  var OG = window.OG;
  /** @type {any} OG.Social dựng dần qua social.js + file này */
  var S = (OG.Social = OG.Social || {});
  var MAX_ENTRIES = 10;            // số mục giữ trong bảng cục bộ
  var MAX_ONLINE_LIMIT = 100;      // trần số mục xin từ máy chủ mỗi lần
  var HTTP_TIMEOUT_MS = 8000;      // ms chờ máy chủ trước khi huỷ request
  var CLEAR_CONFIRM_MS = 3000;     // ms cho lần bấm thứ hai của nút XOÁ BẢNG

  function esc(s) {
    if (OG.util && typeof OG.util.escapeHtml === 'function') return OG.util.escapeHtml(s);
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function emit(name, payload) {
    try { if (OG.Events && OG.Events.emit) OG.Events.emit(name, payload); } catch (e) { /* bỏ qua */ }
  }
  function toast(text) { try { if (OG.DOM && OG.DOM.toast) OG.DOM.toast(text); } catch (e) { /* bỏ qua */ } }
  function commit() { try { if (OG.Save && OG.Save.commit) OG.Save.commit(); } catch (e) { /* bỏ qua */ } }

  // Vùng lưu riêng: Save.ext.social (tạo mới nếu thiếu). Null nếu Save chưa sẵn sàng.
  // ⚠️ Bẫy: không đọc OG.Save.data lúc LOAD file (ARCHITECTURE mục 9) — Save chỉ nạp xong trong init().
  function store() {
    if (!OG.Save || typeof OG.Save.ns !== 'function' || !OG.Save.data) return null;
    var ns = OG.Save.ns('social');
    if (!Array.isArray(ns.leaderboard)) ns.leaderboard = [];
    return ns;
  }

  // ---------------------------------------------------------------------------
  // Chuẩn hoá entry (dùng cho cả dữ liệu cục bộ lẫn dữ liệu từ máy chủ — không tin dữ liệu ngoài)
  // 💡 Khái niệm: "đừng tin dữ liệu bên ngoài" — localStorage có thể bị sửa tay, máy chủ có thể trả rác.
  //   Mọi entry đi qua sanitize(): chuỗi bị cắt độ dài + bỏ ký tự điều khiển, số bị kẹp khoảng, id chỉ nhận
  //   ký tự an toàn. Phía sau (sort, render) không bao giờ gặp kiểu dữ liệu bất ngờ.
  // ---------------------------------------------------------------------------
  function str(v, max, fb) {
    if (v == null) return fb;
    var s = String(v).replace(/[\u0000-\u001f\u007f]/g, '').trim();
    return s ? s.slice(0, max) : fb;
  }
  function slug(v, fb) {
    var s = str(v, 24, '');
    return /^[a-zA-Z0-9_-]+$/.test(s) ? s : fb;
  }
  function num(v, min, max) {
    var n = +v;
    if (!isFinite(n)) n = 0;
    return Math.min(max, Math.max(min, n));
  }
  /**
   * Chuẩn hoá một entry bất kỳ thành LeaderboardEntry hợp lệ (không sửa object gốc).
   * @param {any} e
   * @returns {LeaderboardEntry}
   */
  function sanitize(e) {
    e = e || {};
    var name = typeof S.cleanName === 'function' ? S.cleanName(e.name) : str(e.name, 16, '');
    var d = new Date(e.date || Date.now());
    return {
      id: slug(e.id, Date.now().toString(36) + Math.random().toString(36).slice(2, 8)),
      name: name || 'Ẩn danh',
      score: Math.round(num(e.score, 0, 1e9)),
      charId: slug(e.charId, 'oggy'),
      skinId: e.skinId ? slug(e.skinId, null) : null,
      levelId: e.levelId ? slug(e.levelId, null) : null,
      levelName: str(e.levelName, 40, ''),
      levelsCompleted: Math.round(num(Array.isArray(e.levelsCompleted) ? e.levelsCompleted.length : e.levelsCompleted, 0, 99)),
      stars: Math.round(num(e.stars, 0, 999)),
      time: Math.round(num(e.time, 0, 360000) * 10) / 10,
      date: (isNaN(d.getTime()) ? new Date() : d).toISOString(),
      type: e.type === 'victory' ? 'victory' : 'gameover'
    };
  }
  S.sanitizeEntry = sanitize;

  /**
   * So sánh 2 entry để sắp xếp. Thứ tự xếp hạng: điểm ↓, sao ↓, thời gian ↑, ai đạt trước xếp trên.
   * Thời gian 0 (không rõ) coi như rất chậm (1e9) để không "ăn gian" lên đầu.
   * 💡 Khái niệm: so sánh nhiều tiêu chí bằng chuỗi `a || b || c` — tiêu chí trước bằng nhau (0) mới xét tiêu chí sau.
   * @param {LeaderboardEntry} a
   * @param {LeaderboardEntry} b
   * @returns {number} âm = a xếp trên
   */
  function compare(a, b) {
    return (b.score - a.score) || (b.stars - a.stars) || ((a.time || 1e9) - (b.time || 1e9)) ||
      (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  }
  S.compareEntries = compare;

  // Thêm entry (thay bản cũ cùng id), sắp xếp, cắt còn `max` mục. Trả {list, rank}; rank -1 = bị đẩy khỏi top.
  function insertSorted(list, entry, max) {
    var out = list.filter(function (x) { return x && x.id !== entry.id; });
    out.push(entry);
    out.sort(compare);
    out = out.slice(0, max);
    for (var i = 0; i < out.length; i++) if (out[i].id === entry.id) return { list: out, rank: i + 1 };
    return { list: out, rank: -1 };
  }

  // ---------------------------------------------------------------------------
  // Backend CỤC BỘ (OG.Save)
  // 💡 Khái niệm: adapter pattern — `local` có đủ giao diện chuẩn (submit/list/clear trả Promise) giống hệt một
  //   backend online, nên scene và fetchLeaderboard không cần biết đang nói chuyện với ai. Ngoài ra local có
  //   thêm bản ĐỒNG BỘ (submitSync/listSync) để API công khai trả kết quả ngay, không chờ Promise.
  // ---------------------------------------------------------------------------
  var local = {
    id: 'local',
    name: 'Trên máy này',
    online: false,
    // Đồng bộ — được API công khai dùng trực tiếp.
    submitSync: function (entry) {
      var ns = store();
      if (!ns) return -1;
      // Sanitize lại dữ liệu đã lưu mỗi lần đọc → save cũ / bị sửa tay vẫn dùng được (tự chữa).
      var res = insertSorted(ns.leaderboard.map(sanitize), entry, MAX_ENTRIES);
      ns.leaderboard = res.list;
      commit();
      return res.rank;
    },
    listSync: function (limit) {
      var ns = store();
      if (!ns) return [];
      var list = ns.leaderboard.map(sanitize).sort(compare);
      return list.slice(0, Math.max(0, Math.min(MAX_ENTRIES, limit == null ? MAX_ENTRIES : limit | 0)));
    },
    // Giao diện adapter chuẩn (Promise).
    submit: function (entry) { return Promise.resolve({ rank: local.submitSync(sanitize(entry)) }); },
    list: function (limit) { return Promise.resolve(local.listSync(limit)); },
    clear: function () {
      var ns = store();
      if (ns) { ns.leaderboard = []; commit(); }
      return Promise.resolve(true);
    }
  };

  S.backends = S.backends || {};
  S.backends.local = local;
  S.backend = local;

  /**
   * Đăng ký một backend tuỳ biến (Firebase, Supabase...). Thiếu id/submit/list → từ chối kèm cảnh báo.
   * @param {LeaderboardBackend} backend
   * @returns {LeaderboardBackend|null}
   * @example
   *   OG.Social.registerBackend({ id: 'fake', name: 'Thử', online: true,
   *     submit: function () { return Promise.resolve({ rank: 1 }); },
   *     list: function () { return Promise.resolve([]); } });
   *   OG.Social.setBackend('fake');
   */
  S.registerBackend = function (backend) {
    if (!backend || !backend.id || typeof backend.submit !== 'function' || typeof backend.list !== 'function') {
      console.warn('[OG.Social] backend không hợp lệ (cần id, submit, list).');
      return null;
    }
    S.backends[backend.id] = backend;
    return backend;
  };
  /**
   * Chọn backend hiện tại theo id đã đăng ký, hoặc truyền thẳng object (tự đăng ký). Không hợp lệ → về 'local'.
   * @param {string|LeaderboardBackend} idOrBackend
   * @returns {LeaderboardBackend}
   */
  S.setBackend = function (idOrBackend) {
    var b = typeof idOrBackend === 'string' ? S.backends[idOrBackend] : S.registerBackend(idOrBackend);
    S.backend = b || local;
    return S.backend;
  };
  /** @returns {boolean} true nếu đang dùng một backend online (khác local) */
  S.isOnline = function () { return !!(S.backend && S.backend !== local && S.backend.online); };

  // ---------------------------------------------------------------------------
  // Backend HTTP (REST) — ví dụ máy chủ: docs/leaderboard-worker.example.js
  // ---------------------------------------------------------------------------
  /**
   * Tạo backend REST dùng fetch (CORS, không gửi cookie).
   * @param {{url?:string, name?:string, timeout?:number, id?:string}} opts  timeout tính bằng ms (mặc định 8000)
   * @returns {LeaderboardBackend}
   * @example
   *   OG.Social.setBackend(OG.Social.createHttpBackend({ url: 'https://example.workers.dev' }));
   */
  S.createHttpBackend = function (opts) {
    opts = opts || {};
    var base = String(opts.url || '').replace(/\/+$/, '');
    var timeout = opts.timeout || HTTP_TIMEOUT_MS;

    // 💡 Khái niệm: fetch không có timeout sẵn → dùng AbortController: hẹn giờ gọi abort(), request bị huỷ và
    //   Promise reject. Nhớ clearTimeout ở CẢ hai nhánh thành công/thất bại để không rò rỉ bộ hẹn giờ.
    function request(method, path, body) {
      if (typeof window.fetch !== 'function') return Promise.reject(new Error('Trình duyệt không hỗ trợ fetch'));
      var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeout) : null;
      /** @type {any} RequestInit — field gắn thêm tuỳ điều kiện */
      var init = { method: method, headers: { 'Accept': 'application/json' }, mode: 'cors', credentials: 'omit' };
      if (ctrl) init.signal = ctrl.signal;
      if (body !== undefined) {
        init.headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(body);
      }
      return window.fetch(base + path, init).then(function (res) {
        if (timer) clearTimeout(timer);
        // ⚠️ Bẫy: fetch chỉ reject khi lỗi MẠNG; HTTP 404/500 vẫn "thành công" → phải tự kiểm tra res.ok.
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      }, function (err) {
        if (timer) clearTimeout(timer);
        throw err;
      });
    }

    return {
      id: opts.id || 'http',
      name: opts.name || 'Trực tuyến',
      online: true,
      url: base,
      submit: function (entry) {
        return request('POST', '/scores', sanitize(entry)).then(function (data) {
          return { rank: data && typeof data.rank === 'number' ? data.rank : -1 };
        });
      },
      list: function (limit) {
        var n = Math.max(1, Math.min(MAX_ONLINE_LIMIT, limit | 0 || MAX_ENTRIES));
        return request('GET', '/scores?limit=' + n).then(function (data) {
          // Chấp nhận cả {scores:[...]} lẫn mảng trần; dữ liệu máy chủ cũng đi qua sanitize + sort lại.
          var arr = data && Array.isArray(data.scores) ? data.scores : (Array.isArray(data) ? data : []);
          return arr.map(sanitize).sort(compare).slice(0, n);
        });
      }
      // Không có clear(): xoá bảng online phải làm ở phía máy chủ.
    };
  };

  /**
   * Bật nhanh bảng xếp hạng online bằng backend HTTP (url rỗng = tắt, về 'local').
   * @param {string|null} url  gốc API, vd 'https://example.workers.dev'
   * @param {{persist?:boolean, name?:string, timeout?:number}} [opts]  persist = nhớ url trong save cho lần sau
   * @returns {LeaderboardBackend}
   * @example
   *   OG.Social.useOnline('https://example.workers.dev', { persist: true });
   *   OG.Social.useOnline(null, { persist: true }); // tắt và quên url
   */
  S.useOnline = function (url, opts) {
    opts = opts || {};
    if (!url) {
      S.setBackend('local');
      if (opts.persist) { var ns0 = store(); if (ns0) { delete ns0.onlineUrl; commit(); } }
      return S.backend;
    }
    var b = S.registerBackend(S.createHttpBackend({ url: url, name: opts.name, timeout: opts.timeout }));
    S.setBackend(b);
    if (opts.persist) { var ns = store(); if (ns) { ns.onlineUrl = String(url); commit(); } }
    return b;
  };

  // ---------------------------------------------------------------------------
  // API công khai (đồng bộ, theo hợp đồng)
  // ---------------------------------------------------------------------------
  /**
   * Lưu điểm vào bảng CỤC BỘ (đồng bộ), phát 'leaderboard:submit', rồi gửi kèm lên backend online nếu có (không chờ).
   * 💡 Khái niệm: local-first — game luôn có kết quả ngay từ bản cục bộ; mạng chậm/mất chỉ ảnh hưởng tab online.
   * @param {Object} entry  xem hợp đồng ở đầu file; sẽ được sanitize
   * @returns {number} hạng 1-based, -1 nếu không vào top 10 (hoặc Save chưa sẵn sàng)
   */
  S.submitScore = function (entry) {
    var clean = sanitize(entry);
    var rank = local.submitSync(clean);
    emit('leaderboard:submit', { entry: clean, rank: rank });
    pushOnline(clean);
    return rank;
  };

  /**
   * Đổi tên một mục đã lưu (cùng id), phát 'leaderboard:submit' {rename:true} và đồng bộ lên online.
   * @param {string} id
   * @param {string} name
   * @returns {number} hạng hiện tại, hoặc -1 nếu không tìm thấy
   */
  S.renameEntry = function (id, name) {
    var ns = store();
    if (!ns) return -1;
    var list = ns.leaderboard.map(sanitize).sort(compare);
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        list[i].name = (typeof S.cleanName === 'function' ? S.cleanName(name) : str(name, 16, '')) || 'Ẩn danh';
        ns.leaderboard = list;
        commit();
        emit('leaderboard:submit', { entry: list[i], rank: i + 1, rename: true });
        pushOnline(list[i]); // máy chủ ví dụ cho phép cập nhật tên theo id nếu điểm không đổi
        return i + 1;
      }
    }
    return -1;
  };

  /**
   * @param {number} [limit=10]
   * @returns {LeaderboardEntry[]} bảng cục bộ đã sắp xếp (bản sao đã sanitize)
   */
  S.getLeaderboard = function (limit) { return local.listSync(limit); };

  /** Xoá bảng cục bộ và phát 'leaderboard:clear'. (Bảng online không bị xoá.) */
  S.clearLeaderboard = function () {
    local.clear();
    emit('leaderboard:clear', {});
  };

  // Gửi entry lên backend online (nếu đang bật) — "bắn rồi quên": kết quả báo qua event 'social:onlineSubmit'.
  function pushOnline(entry) {
    var b = S.backend;
    if (!b || b === local || typeof b.submit !== 'function') return;
    try {
      b.submit(entry).then(function (res) {
        emit('social:onlineSubmit', { entry: entry, ok: true, rank: res ? res.rank : -1 });
      }, function (err) {
        console.warn('[OG.Social] gửi điểm online thất bại:', err);
        emit('social:onlineSubmit', { entry: entry, ok: false, rank: -1 });
      });
    } catch (e) { /* bỏ qua */ }
  }

  /**
   * Lấy bảng xếp hạng dưới dạng Promise, từ bản cục bộ hoặc backend online.
   * @param {number} [limit=10]
   * @param {'local'|'online'} [source='local']  'online' khi chưa bật online → trả bản cục bộ
   * @returns {Promise<LeaderboardEntry[]>}
   * @example
   *   OG.Social.fetchLeaderboard(5, 'online').then(function (list) { console.table(list); });
   */
  S.fetchLeaderboard = function (limit, source) {
    if (source === 'online' && S.isOnline()) {
      try { return Promise.resolve(S.backend.list(limit || MAX_ENTRIES)); } catch (e) { return Promise.reject(e); }
    }
    return Promise.resolve(local.listSync(limit));
  };

  // ---------------------------------------------------------------------------
  // Scene 'leaderboard'
  // ---------------------------------------------------------------------------
  // Mở từ các scene này thì vẽ lại khung hình màn chơi cuối làm nền (thay cho nền tiêu đề).
  var PLAY_SCENES = { gameover: 1, victory: 1, level: 1, boss: 1, pause: 1 };

  /** @type {any} scene object — field (back, panel, tab, reqId...) gắn động lúc enter() */
  var scene = {
    enter: function (params) {
      params = params || {};
      // Chỉ quay về scene có thật và không phải chính nó (tránh vòng lặp leaderboard → leaderboard).
      this.back = params.back && OG.Scenes.has(params.back) && params.back !== 'leaderboard' ? params.back : 'menu';
      this.backParams = params.backParams || {};
      this.highlightId = params.highlightId || null;
      this.tab = params.tab === 'online' && S.isOnline() ? 'online' : 'local';
      this.clearArmed = false;
      this.reqId = 0;
      if (OG.DOM) {
        if (OG.DOM.setHudVisible) OG.DOM.setHudVisible(false);
        if (OG.DOM.setControlsVisible) OG.DOM.setControlsVisible(false);
      }
      this.build();
    },
    exit: function () {
      // Tăng reqId → mọi request online còn đang chờ bị bỏ qua khi về (không ghi vào panel đã đóng).
      this.reqId++;
      if (OG.DOM && OG.DOM.hidePanel) OG.DOM.hidePanel();
    },
    goBack: function () {
      var back = this.back;
      if (!OG.Scenes.has(back)) back = 'menu';
      OG.Scenes.go(back, this.backParams);
    },
    // Dựng panel DOM: tab (nếu online), bảng, hàng đổi tên, nút QUAY LẠI / XOÁ BẢNG.
    build: function () {
      var self = this;
      if (!OG.DOM || typeof OG.DOM.panel !== 'function') return;
      var online = S.isOnline();
      var tabs = online
        ? '<div class="social-tabs" role="tablist">' +
          '<button type="button" role="tab" class="social-tab" data-tab="local">' + esc(local.name) + '</button>' +
          '<button type="button" role="tab" class="social-tab" data-tab="online">' + esc(S.backend.name || 'Trực tuyến') + '</button>' +
          '</div>'
        : '';
      /** @type {Object[]} */
      var buttons = [{ id: 'lbBack', label: 'QUAY LẠI', primary: true, onClick: function () { self.goBack(); } }];
      buttons.push({ id: 'lbClear', label: 'XOÁ BẢNG', secondary: true, onClick: function (e) { self.onClear(e); } });
      var panel = OG.DOM.panel({
        title: 'BẢNG XẾP HẠNG 🏆',
        className: 'social-board-panel',
        html: tabs +
          '<div class="social-board-head"><span>#</span><span>Tên</span><span class="social-char">Nhân vật</span>' +
          '<span class="social-stars">Sao</span><span class="social-date">Ngày</span><span>Điểm</span></div>' +
          '<div class="social-board" aria-live="polite"></div>',
        buttons: buttons,
        small: 'Esc để quay lại · Điểm được lưu trên trình duyệt này.'
      });
      this.panel = panel;
      this.boardEl = panel.querySelector('.social-board');
      // Hàng đổi tên người chơi (để đặt tên trước khi chơi).
      var form = document.createElement('form');
      form.className = 'social-name-row';
      form.setAttribute('novalidate', '');
      form.innerHTML = '<label class="social-label">Tên của bạn<input type="text" class="social-input" ' +
        'autocomplete="off" spellcheck="false" enterkeyhint="done" aria-label="Tên người chơi" placeholder="Nhập tên…"></label>';
      var input = form.querySelector('input');
      input.maxLength = (S.NAME_MAX || 16) * 2; // cho gõ dư (emoji = 2 đơn vị UTF-16), cleanName cắt chính xác khi lưu
      input.value = typeof S.getPlayerName === 'function' ? S.getPlayerName() : '';
      var btn = document.createElement('button');
      btn.type = 'submit';
      btn.className = 'social-btn secondary social-save';
      btn.textContent = 'LƯU TÊN';
      form.appendChild(btn);
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        emit('ui:click', { id: 'lbSaveName' });
        var n = S.setPlayerName(input.value);
        input.value = n;
        toast(n ? 'Xin chào, ' + n + '!' : 'Đã xoá tên người chơi.');
        try { input.blur(); } catch (err) { /* bỏ qua */ }
      });
      // Phím gõ trong ô tên không được lọt ra OG.Input (Esc sẽ thoát scene, chữ cái sẽ thành phím điều khiển).
      input.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Escape') input.blur(); });
      var actions = panel.querySelector('.actions');
      if (actions) panel.insertBefore(form, actions); else panel.appendChild(form);

      // Tab local/online
      var tabBtns = panel.querySelectorAll('.social-tab');
      for (var i = 0; i < tabBtns.length; i++) {
        tabBtns[i].addEventListener('click', function (e) {
          emit('ui:click', { id: 'lbTab' });
          self.setTab(/** @type {HTMLElement} */ (e.currentTarget).getAttribute('data-tab'));
        });
      }
      this.clearBtn = panel.querySelector('.actions button:nth-child(2)');
      this.setTab(this.tab);
    },
    setTab: function (tab) {
      var self = this;
      this.tab = tab === 'online' && S.isOnline() ? 'online' : 'local';
      if (!this.panel) return;
      var tabBtns = this.panel.querySelectorAll('.social-tab');
      for (var i = 0; i < tabBtns.length; i++) {
        var on = tabBtns[i].getAttribute('data-tab') === this.tab;
        tabBtns[i].classList.toggle('social-tab-on', on);
        tabBtns[i].setAttribute('aria-selected', on ? 'true' : 'false');
      }
      // Bảng online không xoá được từ trình duyệt → ẩn nút XOÁ BẢNG ở tab online.
      if (this.clearBtn) this.clearBtn.style.display = this.tab === 'local' ? '' : 'none';
      // 💡 Khái niệm: chống race condition bằng request id — đổi tab nhanh local → online → local thì phản hồi
      //   online về MUỘN sẽ thấy req !== self.reqId và bị bỏ, không ghi đè bảng cục bộ đang hiện.
      var req = ++this.reqId;
      if (this.tab === 'local') {
        this.render(S.getLeaderboard(MAX_ENTRIES));
        return;
      }
      this.boardEl.innerHTML = '<p class="social-empty">Đang tải bảng xếp hạng trực tuyến…</p>';
      S.fetchLeaderboard(MAX_ENTRIES, 'online').then(function (list) {
        if (req === self.reqId) self.render(list, 'Chưa có điểm trực tuyến nào.');
      }, function () {
        if (req === self.reqId) self.boardEl.innerHTML = '<p class="social-empty social-warn">Không kết nối được máy chủ. Hãy thử lại sau.</p>';
      });
    },
    render: function (list, emptyText) {
      if (!this.boardEl) return;
      this.boardEl.innerHTML = typeof S.renderList === 'function'
        ? S.renderList(list, { highlightId: this.highlightId, emptyText: emptyText })
        : '';
    },
    onClear: function () {
      if (this.tab !== 'local') return;
      if (!S.getLeaderboard(1).length) { toast('Bảng xếp hạng đang trống.'); return; }
      if (!this.clearArmed) {
        // Xác nhận bằng lần bấm thứ hai (không dùng confirm()).
        // confirm() chặn cả luồng chính (game loop đứng hình) và bị cấm theo quy ước dự án (ARCHITECTURE mục 9).
        this.clearArmed = true;
        if (this.clearBtn) this.clearBtn.innerHTML = 'BẤM LẦN NỮA ĐỂ XOÁ';
        var self = this;
        clearTimeout(this.armTimer);
        this.armTimer = setTimeout(function () {
          self.clearArmed = false;
          if (self.clearBtn) self.clearBtn.innerHTML = 'XOÁ BẢNG';
        }, CLEAR_CONFIRM_MS);
        return;
      }
      clearTimeout(this.armTimer);
      this.clearArmed = false;
      if (this.clearBtn) this.clearBtn.innerHTML = 'XOÁ BẢNG';
      S.clearLeaderboard();
      this.render([]);
      toast('Đã xoá bảng xếp hạng.');
    },
    update: function () {
      var I = OG.Input;
      if (!I || !I.pressed) return;
      if (I.pressed('back') || I.pressed('pause')) {
        if (I.consume) { I.consume('back'); I.consume('pause'); }
        this.goBack();
        return;
      }
      if (S.isOnline() && (I.pressed('left') || I.pressed('right'))) {
        this.setTab(this.tab === 'local' ? 'online' : 'local');
      }
    },
    // Nền canvas phía sau panel: khung hình màn chơi cuối (nếu đến từ màn chơi) hoặc nền tiêu đề; lỗi → nền phẳng.
    draw: function (ctx) {
      try {
        if (PLAY_SCENES[this.back] && typeof OG.drawLastPlayScene === 'function') OG.drawLastPlayScene(ctx);
        else if (typeof OG.drawTitleBackdrop === 'function') OG.drawTitleBackdrop(ctx);
        else { ctx.fillStyle = (OG.Palette && OG.Palette.pageBg) || '#10192b'; ctx.fillRect(0, 0, OG.W || 960, OG.H || 540); }
      } catch (e) {
        ctx.fillStyle = '#10192b';
        ctx.fillRect(0, 0, OG.W || 960, OG.H || 540);
      }
    }
  };

  /**
   * Khởi tạo bảng xếp hạng: bật backend online nếu được cấu hình (window.OG_LEADERBOARD_URL →
   * OG.Config.LEADERBOARD_URL → url đã persist trong save), rồi đăng ký scene 'leaderboard'.
   * Gọi từ OG.Social.init() (social.js) — tức là SAU khi Save đã nạp.
   * 🧪 Thử: trong console gõ  OG.Social.useOnline('https://example.invalid')  rồi mở Bảng xếp hạng → xuất hiện tab
   *   "Trực tuyến"; bấm sang tab đó sẽ thấy báo không kết nối được (bảng cục bộ vẫn nguyên). Tắt: OG.Social.useOnline(null).
   */
  S.initLeaderboard = function () {
    // Bật backend online nếu được cấu hình.
    var url = window['OG_LEADERBOARD_URL'] || (OG.Config && OG.Config.LEADERBOARD_URL) || null;
    if (!url) { var ns = store(); if (ns && ns.onlineUrl) url = ns.onlineUrl; }
    if (url) S.useOnline(url);
    if (OG.Scenes && typeof OG.Scenes.register === 'function') OG.Scenes.register('leaderboard', scene);
  };
})();
