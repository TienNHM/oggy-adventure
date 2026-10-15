/* OG.Social — bảng xếp hạng: lưu cục bộ, lớp adapter backend (để cắm leaderboard online), scene 'leaderboard'.
 * Chủ sở hữu: agent Social (src/social/). Load SAU src/social/social.js.
 *
 * HỢP ĐỒNG (đồng bộ, luôn dùng bản CỤC BỘ — nguồn sự thật trên máy):
 *   OG.Social.submitScore(entry) -> rank (1-based) | -1
 *        entry = {name, score, charId, levelId, levelsCompleted:int, time, date, type, (+ id, stars, skinId, levelName)}
 *        Lưu trong OG.Save.ns('social').leaderboard (tối đa 10 mục). Emit 'leaderboard:submit' {entry, rank}.
 *        Nếu đang dùng backend online thì gửi kèm (không chặn), xong emit 'social:onlineSubmit' {entry, ok, rank}.
 *   OG.Social.getLeaderboard(limit) -> [entry]
 *   OG.Social.clearLeaderboard()
 *
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
 *
 * Scene 'leaderboard': params {back, backParams, highlightId, tab}. Esc/nút Quay lại → về scene `back`. */
(function () {
  'use strict';
  var OG = window.OG;
  var S = (OG.Social = OG.Social || {});
  var MAX_ENTRIES = 10;

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
  function store() {
    if (!OG.Save || typeof OG.Save.ns !== 'function' || !OG.Save.data) return null;
    var ns = OG.Save.ns('social');
    if (!Array.isArray(ns.leaderboard)) ns.leaderboard = [];
    return ns;
  }

  // ---------------------------------------------------------------------------
  // Chuẩn hoá entry (dùng cho cả dữ liệu cục bộ lẫn dữ liệu từ máy chủ — không tin dữ liệu ngoài)
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

  // Thứ tự xếp hạng: điểm ↓, sao ↓, thời gian ↑, ai đạt trước xếp trên.
  function compare(a, b) {
    return (b.score - a.score) || (b.stars - a.stars) || ((a.time || 1e9) - (b.time || 1e9)) ||
      (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  }
  S.compareEntries = compare;

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
  // ---------------------------------------------------------------------------
  var local = {
    id: 'local',
    name: 'Trên máy này',
    online: false,
    // Đồng bộ — được API công khai dùng trực tiếp.
    submitSync: function (entry) {
      var ns = store();
      if (!ns) return -1;
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

  S.registerBackend = function (backend) {
    if (!backend || !backend.id || typeof backend.submit !== 'function' || typeof backend.list !== 'function') {
      console.warn('[OG.Social] backend không hợp lệ (cần id, submit, list).');
      return null;
    }
    S.backends[backend.id] = backend;
    return backend;
  };
  S.setBackend = function (idOrBackend) {
    var b = typeof idOrBackend === 'string' ? S.backends[idOrBackend] : S.registerBackend(idOrBackend);
    S.backend = b || local;
    return S.backend;
  };
  S.isOnline = function () { return !!(S.backend && S.backend !== local && S.backend.online); };

  // ---------------------------------------------------------------------------
  // Backend HTTP (REST) — ví dụ máy chủ: docs/leaderboard-worker.example.js
  // ---------------------------------------------------------------------------
  S.createHttpBackend = function (opts) {
    opts = opts || {};
    var base = String(opts.url || '').replace(/\/+$/, '');
    var timeout = opts.timeout || 8000;

    function request(method, path, body) {
      if (typeof window.fetch !== 'function') return Promise.reject(new Error('Trình duyệt không hỗ trợ fetch'));
      var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeout) : null;
      var init = { method: method, headers: { 'Accept': 'application/json' }, mode: 'cors', credentials: 'omit' };
      if (ctrl) init.signal = ctrl.signal;
      if (body !== undefined) {
        init.headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(body);
      }
      return window.fetch(base + path, init).then(function (res) {
        if (timer) clearTimeout(timer);
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
        var n = Math.max(1, Math.min(100, limit | 0 || MAX_ENTRIES));
        return request('GET', '/scores?limit=' + n).then(function (data) {
          var arr = data && Array.isArray(data.scores) ? data.scores : (Array.isArray(data) ? data : []);
          return arr.map(sanitize).sort(compare).slice(0, n);
        });
      }
      // Không có clear(): xoá bảng online phải làm ở phía máy chủ.
    };
  };

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
  S.submitScore = function (entry) {
    var clean = sanitize(entry);
    var rank = local.submitSync(clean);
    emit('leaderboard:submit', { entry: clean, rank: rank });
    pushOnline(clean);
    return rank;
  };

  // Đổi tên một mục đã lưu (cùng id). Trả về hạng hiện tại hoặc -1.
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

  S.getLeaderboard = function (limit) { return local.listSync(limit); };

  S.clearLeaderboard = function () {
    local.clear();
    emit('leaderboard:clear', {});
  };

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

  S.fetchLeaderboard = function (limit, source) {
    if (source === 'online' && S.isOnline()) {
      try { return Promise.resolve(S.backend.list(limit || MAX_ENTRIES)); } catch (e) { return Promise.reject(e); }
    }
    return Promise.resolve(local.listSync(limit));
  };

  // ---------------------------------------------------------------------------
  // Scene 'leaderboard'
  // ---------------------------------------------------------------------------
  var PLAY_SCENES = { gameover: 1, victory: 1, level: 1, boss: 1, pause: 1 };

  var scene = {
    enter: function (params) {
      params = params || {};
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
      this.reqId++;
      if (OG.DOM && OG.DOM.hidePanel) OG.DOM.hidePanel();
    },
    goBack: function () {
      var back = this.back;
      if (!OG.Scenes.has(back)) back = 'menu';
      OG.Scenes.go(back, this.backParams);
    },
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
      input.maxLength = (S.NAME_MAX || 16) * 2;
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
      input.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Escape') input.blur(); });
      var actions = panel.querySelector('.actions');
      if (actions) panel.insertBefore(form, actions); else panel.appendChild(form);

      // Tab local/online
      var tabBtns = panel.querySelectorAll('.social-tab');
      for (var i = 0; i < tabBtns.length; i++) {
        tabBtns[i].addEventListener('click', function (e) {
          emit('ui:click', { id: 'lbTab' });
          self.setTab(e.currentTarget.getAttribute('data-tab'));
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
      if (this.clearBtn) this.clearBtn.style.display = this.tab === 'local' ? '' : 'none';
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
        this.clearArmed = true;
        if (this.clearBtn) this.clearBtn.innerHTML = 'BẤM LẦN NỮA ĐỂ XOÁ';
        var self = this;
        clearTimeout(this.armTimer);
        this.armTimer = setTimeout(function () {
          self.clearArmed = false;
          if (self.clearBtn) self.clearBtn.innerHTML = 'XOÁ BẢNG';
        }, 3000);
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

  // Gọi từ OG.Social.init() (social.js).
  S.initLeaderboard = function () {
    // Bật backend online nếu được cấu hình.
    var url = window.OG_LEADERBOARD_URL || (OG.Config && OG.Config.LEADERBOARD_URL) || null;
    if (!url) { var ns = store(); if (ns && ns.onlineUrl) url = ns.onlineUrl; }
    if (url) S.useOnline(url);
    if (OG.Scenes && typeof OG.Scenes.register === 'function') OG.Scenes.register('leaderboard', scene);
  };
})();
