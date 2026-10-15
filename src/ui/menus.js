/* OG.Menus — menu chính, chọn nhân vật & skin, cài đặt, tạm dừng, màn kết quả.
 * Chủ sở hữu: agent Menus & Shop (src/ui/). HUD nằm ở src/ui/hud.js, cửa hàng ở src/ui/shop.js.
 *
 * HỢP ĐỒNG (docs/ARCHITECTURE.md mục 8.5):
 *   OG.Menus.init() — đăng ký scene: menu, charselect, settings, pause, gameover, victory.
 *   OG.Menus.updateHud(hud) / OG.Menus.drawHud(ctx, hud) — xem hud.js.
 *
 * Giao diện dùng lớp DOM #overlay (qua OG.DOM.panel) giống MVP. Mọi panel của module này có class
 * .ui-panel và được điều khiển bằng:
 *   - Chuột / cảm ứng: bấm trực tiếp (nút tối thiểu 44px).
 *   - Bàn phím: mũi tên hoặc WASD di chuyển focus (điều hướng theo không gian), Enter/Space chọn,
 *     Esc quay lại (scene tự xử lý qua OG.Input 'back').
 * Tiện ích dùng chung cho shop.js được đặt ở OG.Menus.ui (nội bộ của module UI). */
(function () {
  'use strict';
  var OG = window.OG;
  var U = OG.util;

  var Menus = (OG.Menus = OG.Menus || {});
  var UI = (Menus.ui = Menus.ui || {});

  // ======================================================================
  // Tiện ích chung
  // ======================================================================
  UI.esc = function (s) { return U.escapeHtml(s); };
  UI.save = function () { return (OG.Save && OG.Save.data) || null; };
  UI.coins = function () { return OG.Save && OG.Save.getCoins ? OG.Save.getCoins() : 0; };
  UI.fmt = function (n) {
    n = Math.round(+n || 0);
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };
  UI.toast = function (text, sec) { U.call('DOM', 'toast', text, sec); };
  UI.charName = function (id) {
    var ch = OG.Data && OG.Data.characters && OG.Data.characters[id];
    return ch ? ch.name : (id || 'Oggy');
  };
  UI.levelName = function (id) {
    var l = OG.Data && OG.Data.getLevel ? OG.Data.getLevel(id) : null;
    return l ? l.name : (id || '');
  };
  UI.isUnlockedChar = function (id) {
    var s = UI.save();
    return !!(s && s.unlockedChars && s.unlockedChars.indexOf(id) >= 0);
  };
  UI.equippedSkin = function (charId) {
    var s = UI.save();
    var id = s && s.equippedSkins ? s.equippedSkins[charId] : null;
    return id || (charId + '_default');
  };
  UI.ownsSkin = function (skinId) {
    var s = UI.save();
    if (!s) return false;
    var sk = OG.Data.getSkin(skinId);
    if (sk && !sk.price) return true; // skin miễn phí luôn có
    return (s.ownedSkins || []).indexOf(skinId) >= 0;
  };
  // Ẩn HUD và nút cảm ứng khi ở menu.
  UI.hideGameUi = function () {
    U.call('DOM', 'setHudVisible', false);
    U.call('DOM', 'setControlsVisible', false);
  };
  // Nền tiêu đề dùng chung cho các scene menu.
  UI.drawBackdrop = function (ctx) {
    try {
      if (typeof OG.drawTitleBackdrop === 'function') { ctx.save(); OG.drawTitleBackdrop(ctx); ctx.restore(); return; }
    } catch (e) { ctx.restore(); }
    var g = ctx.createLinearGradient(0, 0, 0, OG.H);
    g.addColorStop(0, OG.Palette.skyTop); g.addColorStop(1, OG.Palette.skyBottom);
    ctx.fillStyle = g; ctx.fillRect(0, 0, OG.W, OG.H);
  };
  UI.drawLastPlay = function (ctx) {
    try {
      if (typeof OG.drawLastPlayScene === 'function') { ctx.save(); OG.drawLastPlayScene(ctx); ctx.restore(); return; }
    } catch (e) { ctx.restore(); }
    UI.drawBackdrop(ctx);
  };

  // ======================================================================
  // Panel + uỷ quyền sự kiện click (data-act)
  // ======================================================================
  UI.panel = null;
  UI.handlers = {};
  UI.previews = [];

  // Mở panel. opts: {title, html, small, className, handlers:{act: fn(arg, el, e)}, focus: selector}
  // Phần tử có [data-act] sẽ gọi handlers[act](data-arg). [data-primary] là nút mặc định cho Enter.
  UI.open = function (opts) {
    opts = opts || {};
    UI.previews = [];
    var p = OG.DOM.panel({
      title: opts.title, html: opts.html, small: opts.small, buttons: opts.buttons,
      className: 'ui-panel ' + (opts.className || '')
    });
    UI.panel = p;
    UI.handlers = opts.handlers || {};
    p.addEventListener('click', function (e) {
      var el = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
      if (!el || !p.contains(el)) return;
      var act = el.getAttribute('data-act');
      OG.Events.emit('ui:click', { id: el.getAttribute('data-id') || act });
      var fn = UI.handlers[act];
      if (fn) U.safe('ui.' + act, fn, null, [el.getAttribute('data-arg'), el, e]);
    });
    // Canvas xem trước nhân vật.
    var cvs = p.querySelectorAll('canvas[data-preview]');
    for (var i = 0; i < cvs.length; i++) UI.previews.push(cvs[i]);
    UI.drawPreviews(OG.time || 0);
    UI.focusIn(p, opts.focus);
    return p;
  };

  UI.close = function () {
    if (UI.panel && OG.DOM.overlay && OG.DOM.overlay.contains(UI.panel)) OG.DOM.hidePanel();
    UI.panel = null;
    UI.handlers = {};
    UI.previews = [];
  };

  // Panel đang hiển thị có phải của module UI không.
  UI.isMine = function () {
    return !!(UI.panel && OG.DOM.isPanelOpen() && document.body.contains(UI.panel));
  };

  UI.focusables = function (root) {
    root = root || UI.panel;
    if (!root) return [];
    var list = root.querySelectorAll('button, [tabindex="0"], input, select, textarea, a[href]');
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (el.disabled || el.getAttribute('tabindex') === '-1') continue;
      if (el.offsetParent === null && el.getClientRects().length === 0) continue; // đang ẩn
      out.push(el);
    }
    return out;
  };

  UI.focusEl = function (el) {
    if (!el) return;
    try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
    if (el.scrollIntoView) { try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e2) { /* bỏ qua */ } }
  };

  // Đặt focus ban đầu. Có selector (vẽ lại panel) thì cuộn tới phần tử; không thì giữ panel ở đầu.
  UI.focusIn = function (p, sel) {
    var target = sel && p.querySelector(sel);
    var el = target || p.querySelector('[data-primary]') || UI.focusables(p)[0];
    if (target) { UI.focusEl(el); return; }
    if (el) { try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); } }
    p.scrollTop = 0;
  };

  // Loại nhiệm vụ (tra từ OG.Quests) để biết có nên hiện tiến độ dạng "x/y" không.
  var questTypeCache = {};
  UI.questType = function (levelId, questId) {
    var key = String(levelId);
    if (!questTypeCache[key]) {
      var map = {};
      var list = U.call('Quests', 'getForLevel', levelId);
      if (Array.isArray(list)) list.forEach(function (q) { if (q && q.id) map[q.id] = q.type; });
      if (!Array.isArray(list) || !list.length) return null; // chưa sẵn sàng: không cache
      questTypeCache[key] = map;
    }
    return questTypeCache[key][questId] || null;
  };
  var COUNTABLE = { collect_all: 1, stomp_n: 1, coins_n: 1, pizza_n: 1, boss_n: 1, complete_n: 1 };
  // HTML một dòng nhiệm vụ: biểu tượng trạng thái + chữ + tiến độ (chỉ với loại đếm được).
  UI.questLine = function (q, levelId) {
    var type = UI.questType(levelId, q.id);
    var countable = type ? !!COUNTABLE[type] : !/time/i.test(q.id || '');
    var prog = !q.done && !q.failed && countable && q.target > 1
      ? ' <small>' + (q.progress | 0) + '/' + q.target + '</small>' : '';
    var icon = q.done ? '✅ ' : q.failed ? '❌ ' : '◻️ ';
    return '<li class="' + (q.done ? 'is-done' : q.failed ? 'is-failed' : '') + '">' + icon + UI.esc(q.text || '') + prog + '</li>';
  };

  // Điều hướng focus theo hướng (left/right/up/down) dựa trên vị trí trên màn hình.
  UI.moveFocus = function (dir) {
    var els = UI.focusables();
    if (!els.length) return;
    var cur = document.activeElement;
    var idx = els.indexOf(cur);
    if (idx < 0) { UI.focusEl(els[0]); return; }
    var r0 = cur.getBoundingClientRect();
    var cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
    var best = null, bestScore = Infinity;
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el === cur) continue;
      var r = el.getBoundingClientRect();
      var ex = r.left + r.width / 2, ey = r.top + r.height / 2;
      var dx = ex - cx, dy = ey - cy, main, side;
      if (dir === 'right') { main = dx; side = Math.abs(dy); }
      else if (dir === 'left') { main = -dx; side = Math.abs(dy); }
      else if (dir === 'down') { main = dy; side = Math.abs(dx); }
      else { main = -dy; side = Math.abs(dx); }
      if (main <= 4) continue;
      // Ưu tiên phần tử thẳng hàng (cùng hàng / cùng cột).
      var aligned = (dir === 'left' || dir === 'right')
        ? (r.top < r0.bottom && r.bottom > r0.top)
        : (r.left < r0.right && r.right > r0.left);
      var score = main + side * (aligned ? 0.5 : 2.5);
      if (score < bestScore) { bestScore = score; best = el; }
    }
    if (!best) {
      // Không có ở hướng đó: đi vòng theo thứ tự DOM.
      var step = (dir === 'down' || dir === 'right') ? 1 : -1;
      best = els[(idx + step + els.length) % els.length];
    }
    UI.focusEl(best);
  };

  var NAV_KEYS = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
    KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down'
  };

  // Bàn phím cho panel: chạy ở pha capture để Enter kích hoạt đúng nút đang focus
  // (thay vì luôn bấm nút primary như OG.DOM mặc định).
  function onKeyDown(e) {
    if (!UI.isMine()) return;
    var p = UI.panel, ae = document.activeElement;
    var inPanel = !!(ae && ae !== p && p.contains(ae));
    var tag = ae && ae.tagName;
    var typing = inPanel && (tag === 'TEXTAREA' || ae.isContentEditable ||
      (tag === 'INPUT' && !/^(button|checkbox|radio|range|submit)$/i.test(ae.type || '')));
    var code = e.code;

    if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') {
      if (typing) return; // để module Social tự xử lý ô nhập tên
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      var target = inPanel ? ae : (p.querySelector('[data-primary]') || UI.focusables(p)[0]);
      if (target && typeof target.click === 'function') target.click();
      return;
    }

    var dir = NAV_KEYS[code];
    if (!dir) return;
    if (typing && (dir === 'left' || dir === 'right' || /^Key/.test(code))) return;
    // Thanh trượt: ←/→ chỉnh giá trị.
    if (inPanel && ae.hasAttribute('data-slider') && (dir === 'left' || dir === 'right')) {
      e.preventDefault();
      var fn = UI.handlers.slideStep;
      if (fn) U.safe('ui.slideStep', fn, null, [ae.getAttribute('data-slider'), dir === 'left' ? -1 : 1, ae]);
      return;
    }
    e.preventDefault();
    UI.moveFocus(dir);
  }

  // ======================================================================
  // Xem trước nhân vật (canvas nhỏ trong panel)
  // ======================================================================
  // <canvas data-preview="charId" data-skin="skinId" data-anim="idle" data-face="1">
  UI.previewHtml = function (charId, skinId, size, anim, extraClass) {
    size = size || 84;
    return '<canvas class="ui-preview ' + (extraClass || '') + '" width="' + (size * 2) + '" height="' + (size * 2) +
      '" style="width:' + size + 'px;height:' + size + 'px" data-preview="' + UI.esc(charId) +
      '" data-skin="' + UI.esc(skinId || '') + '" data-anim="' + UI.esc(anim || 'idle') + '" aria-hidden="true"></canvas>';
  };

  function drawFallbackChar(c, colors, w, h) {
    // Hình đơn giản nếu OG.Sprites chưa sẵn sàng.
    c.fillStyle = colors.body || '#2877d5';
    U.fillRound(c, -w / 2, -h * 0.62, w, h * 0.62, w * 0.3, colors.body || '#2877d5');
    c.fillStyle = colors.head || colors.body || '#328be7';
    c.beginPath(); c.arc(0, -h * 0.72, w * 0.42, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff';
    c.beginPath(); c.arc(-w * 0.14, -h * 0.75, 4, 0, 7); c.arc(w * 0.14, -h * 0.75, 4, 0, 7); c.fill();
  }

  UI.drawPreview = function (cv, t) {
    var c = cv.getContext && cv.getContext('2d');
    if (!c) return;
    var charId = cv.getAttribute('data-preview');
    var skinId = cv.getAttribute('data-skin') || null;
    var anim = cv.getAttribute('data-anim') || 'idle';
    var face = +(cv.getAttribute('data-face') || 1) || 1;
    var ch = OG.Data.getCharacter(charId);
    var W = cv.width, H = cv.height;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, W, H);
    var s = Math.min(W / (ch.w * 1.9), (H * 0.8) / (ch.h * 1.25));
    c.save();
    // bóng dưới chân
    c.fillStyle = 'rgba(23,35,61,0.18)';
    c.beginPath(); c.ellipse(W / 2, H * 0.9, ch.w * s * 0.55, ch.w * s * 0.14, 0, 0, Math.PI * 2); c.fill();
    c.translate(W / 2, H * 0.9);
    c.scale(s, s);
    var colors = OG.Data.resolveColors ? OG.Data.resolveColors(ch.id, skinId) : ch.colors;
    var ok = false;
    if (OG.Sprites && typeof OG.Sprites.drawCharacter === 'function') {
      ok = U.safe('Sprites.drawCharacter(preview)', function () {
        OG.Sprites.drawCharacter(c, ch.id, anim, t, { face: face, skin: skinId, colors: colors, w: ch.w, h: ch.h, time: t });
        return true;
      }) === true;
    }
    if (!ok) drawFallbackChar(c, colors || {}, ch.w, ch.h);
    c.restore();
  };

  UI.drawPreviews = function (t) {
    for (var i = 0; i < UI.previews.length; i++) UI.drawPreview(UI.previews[i], t);
  };

  // Chỉ số nhân vật đã tính đặc tính (perk) từ OG.Shop.
  UI.charStats = function (charId) {
    var ch = OG.Data.getCharacter(charId);
    var perk = U.call('Shop', 'getCharPerk', charId) || {};
    var m = perk.mods || {};
    return {
      speed: Math.round((ch.speed || OG.Config.MOVE_SPEED) * (m.speedMul || 1)),
      jump: Math.round((ch.jump || OG.Config.JUMP_VELOCITY) * (m.jumpMul || 1)),
      lives: OG.Config.START_LIVES + (m.extraLives | 0),
      shield: m.shield | 0,
      perk: perk
    };
  };

  function bar(label, value, min, max, text) {
    var pct = U.clamp((value - min) / (max - min), 0.08, 1) * 100;
    return '<div class="ui-stat"><span>' + label + '</span><i><b style="width:' + pct.toFixed(0) + '%"></b></i><em>' + text + '</em></div>';
  }
  UI.statBars = function (charId) {
    var s = UI.charStats(charId);
    return bar('Tốc độ', s.speed, 200, 300, s.speed) +
      bar('Sức bật', s.jump, 520, 680, s.jump) +
      bar('Sức bền', s.lives + s.shield, 2, 5, '❤️' + s.lives + (s.shield ? ' +🛡️' + s.shield : ''));
  };

  // ======================================================================
  // Scene: menu chính
  // ======================================================================
  function menuScene() {
    return {
      enter: function () {
        UI.hideGameUi();
        var s = UI.save() || {};
        var charId = s.selectedChar || 'oggy';
        var stars = U.call('Progress', 'totalStars') || 0;
        var maxStars = U.call('Progress', 'maxStars') || 0;
        var hasLb = OG.Scenes.has('leaderboard');
        var html =
          '<p class="ui-tagline">Ba chú gián tinh nghịch đã lấy mất đồ ăn của Oggy! Thu thập pizza, hạ bộ ba gián và giành lại căn bếp.</p>' +
          '<div class="ui-stats">' +
            '<span title="Xu">🪙 <b class="ui-coin-val">' + UI.fmt(UI.coins()) + '</b></span>' +
            '<span title="Kỷ lục">🏆 ' + UI.fmt(s.bestScore || 0) + '</span>' +
            (maxStars ? '<span title="Sao">⭐ ' + stars + '/' + maxStars + '</span>' : '') +
          '</div>' +
          '<div class="ui-menu-main">' +
            '<button type="button" class="ui-hero-chip secondary" data-act="chars" data-id="menu_char" aria-label="Đổi nhân vật">' +
              UI.previewHtml(charId, UI.equippedSkin(charId), 52, 'idle') +
              '<span><small>Nhân vật</small><b>' + UI.esc(UI.charName(charId)) + '</b></span></button>' +
            '<button type="button" class="ui-btn-big" data-act="play" data-id="play" data-primary>▶ CHƠI</button>' +
          '</div>' +
          // v2: Hành trình học tập (Tích hợp sẽ sắp xếp lại bố cục menu; xem docs/STORY.md mục 10).
          (OG.Scenes.has('journeySelect') ? '<div class="ui-menu-main"><button type="button" class="ui-btn-big secondary" data-act="journey" data-id="journey">📖 PHIÊU LƯU HỌC TẬP</button></div>' : '') +
          '<div class="ui-menu-grid">' +
            '<button type="button" class="secondary" data-act="chars" data-id="chars">🐱 Nhân vật</button>' +
            '<button type="button" class="secondary" data-act="shop" data-id="shop">🛒 Cửa hàng</button>' +
            (hasLb ? '<button type="button" class="secondary" data-act="lb" data-id="leaderboard">🏆 Xếp hạng</button>' : '') +
            '<button type="button" class="secondary" data-act="settings" data-id="settings">⚙️ Cài đặt</button>' +
          '</div>';
        UI.open({
          title: 'OGGY ADVENTURE!',
          className: 'ui-menu',
          html: html,
          small: 'PC: A/D hoặc ←/→ đi · Space/W/↑ nhảy · E tương tác · Esc/P tạm dừng<br>Mobile: dùng nút trên màn hình · Game fan-made, không chính thức.',
          handlers: {
            play: function () { OG.Game.newRun(); OG.Scenes.go('worldmap'); },
            journey: function () { OG.Scenes.go('journeySelect', { back: 'menu' }); },
            chars: function () { OG.Scenes.go('charselect', { back: 'menu' }); },
            shop: function () { if (OG.Scenes.has('shop')) OG.Scenes.go('shop', { back: 'menu' }); },
            lb: function () { OG.Scenes.go('leaderboard', { back: 'menu' }); },
            settings: function () { OG.Scenes.go('settings', { back: 'menu' }); }
          }
        });
      },
      exit: function () { UI.close(); },
      update: function () {},
      draw: function (ctx) { UI.drawBackdrop(ctx); UI.drawPreviews(OG.time); }
    };
  }

  // ======================================================================
  // Scene: chọn nhân vật & skin
  // ======================================================================
  function charSelectScene() {
    var S = {
      back: 'menu', view: 'oggy', pending: null,

      enter: function (params) {
        UI.hideGameUi();
        S.back = (params && params.back) || 'menu';
        var s = UI.save() || {};
        S.view = s.selectedChar || 'oggy';
        S.pending = null;
        S.render('[data-fk="char-' + S.view + '"]');
      },

      // Mô tả điều kiện mở khoá.
      lockText: function (ch) {
        var u = ch.unlock || { type: 'free' };
        if (u.type === 'coins') return '🔒 ' + UI.fmt(u.cost) + ' 🪙';
        if (u.type === 'level') return '🔒 Qua màn: ' + UI.esc(UI.levelName(u.levelId));
        return '🔒 Chưa mở';
      },

      render: function (focusSel) {
        var s = UI.save() || {};
        var ids = (OG.Data.playable || ['oggy']).slice();
        var cards = ids.map(function (id) {
          var ch = OG.Data.getCharacter(id);
          var unlocked = UI.isUnlockedChar(id);
          var selected = s.selectedChar === id;
          var viewing = S.view === id;
          var st = UI.charStats(id);
          var status = selected ? '<span class="ui-tag ui-tag-ok">✔ Đang chọn</span>'
            : unlocked ? '<span class="ui-tag">Bấm để chọn</span>'
            : '<span class="ui-tag ui-tag-lock">' + S.lockText(ch) + '</span>';
          return '<button type="button" class="ui-card ui-char' + (selected ? ' is-selected' : '') + (viewing ? ' is-viewing' : '') +
            (unlocked ? '' : ' is-locked') + '" data-act="pick" data-arg="' + UI.esc(id) + '" data-fk="char-' + UI.esc(id) + '" data-id="char_' + UI.esc(id) + '">' +
            UI.previewHtml(id, UI.equippedSkin(id), 76, selected ? 'run' : 'idle', unlocked ? '' : 'is-locked') +
            '<b class="ui-card-name">' + UI.esc(ch.name) + '</b>' +
            (st.perk && st.perk.label ? '<span class="ui-perk">' + UI.esc(st.perk.label) + '</span>' : '') +
            '<div class="ui-stats-bars">' + UI.statBars(id) + '</div>' +
            status + '</button>';
        }).join('');

        // Chi tiết nhân vật đang xem + skin.
        var vch = OG.Data.getCharacter(S.view);
        var vUnlocked = UI.isUnlockedChar(S.view);
        var vst = UI.charStats(S.view);
        var detail = '<p class="ui-desc"><b>' + UI.esc(vch.name) + ':</b> ' + UI.esc(vch.desc || '') +
          (vst.perk && vst.perk.desc ? ' <span class="ui-perk-desc">✨ ' + UI.esc(vst.perk.desc) + '</span>' : '') + '</p>';
        if (!vUnlocked) {
          var u = vch.unlock || {};
          if (u.type === 'coins') {
            var confirm = S.pending === 'char:' + S.view;
            detail += '<div class="ui-row"><button type="button" class="' + (confirm ? '' : 'secondary') + '" data-act="unlock" data-arg="' + UI.esc(S.view) +
              '" data-fk="unlock" data-id="unlock_' + UI.esc(S.view) + '">' +
              (confirm ? 'Bấm lần nữa để mua (' + UI.fmt(u.cost) + ' 🪙)' : '🔓 Mở khoá ' + UI.fmt(u.cost) + ' 🪙') + '</button></div>';
          } else if (u.type === 'level') {
            detail += '<p class="ui-note">Hoàn thành màn <b>' + UI.esc(UI.levelName(u.levelId)) + '</b> để mở khoá.</p>';
          }
        }
        var skins = (OG.Data.skinsFor ? OG.Data.skinsFor(S.view) : []);
        var equipped = UI.equippedSkin(S.view);
        var chips = skins.map(function (sk) {
          var owned = UI.ownsSkin(sk.id);
          var on = equipped === sk.id;
          var confirm = S.pending === 'skin:' + sk.id;
          var label = on ? '✔ Đang dùng' : owned ? 'Trang bị' : confirm ? 'Bấm lần nữa!' : UI.fmt(sk.price) + ' 🪙';
          return '<button type="button" class="ui-skin' + (on ? ' is-on' : '') + (owned ? '' : ' is-shop') + (confirm ? ' is-confirm' : '') +
            '" data-act="skin" data-arg="' + UI.esc(sk.id) + '" data-fk="skin-' + UI.esc(sk.id) + '" data-id="skin_' + UI.esc(sk.id) + '">' +
            UI.previewHtml(S.view, sk.id, 54, on ? 'victory' : 'idle') +
            '<b>' + UI.esc(sk.name) + '</b><small>' + label + '</small></button>';
        }).join('');

        var html =
          '<div class="ui-topbar"><span>🪙 <b class="ui-coin-val">' + UI.fmt(UI.coins()) + '</b></span></div>' +
          '<div class="ui-char-grid">' + cards + '</div>' +
          '<div class="ui-detail">' + detail +
            '<h3>Trang phục' + (vUnlocked ? '' : ' <small>(mở khoá nhân vật để dùng)</small>') + '</h3>' +
            '<div class="ui-skin-row">' + (chips || '<p class="ui-note">Chưa có skin.</p>') + '</div>' +
          '</div>' +
          '<div class="actions">' +
            '<button type="button" data-act="done" data-id="charselect_done" data-primary>✔ XONG</button>' +
            (OG.Scenes.has('shop') ? '<button type="button" class="secondary" data-act="shop" data-id="charselect_shop">🛒 Cửa hàng</button>' : '') +
          '</div>';

        UI.open({
          title: 'CHỌN NHÂN VẬT',
          className: 'ui-wide ui-charselect',
          html: html,
          focus: focusSel,
          handlers: {
            pick: function (id) { S.pick(id); },
            skin: function (id) { S.skin(id); },
            unlock: function (id) { S.unlock(id); },
            done: function () { S.leave(); },
            shop: function () { OG.Scenes.go('shop', { back: 'charselect', backParams: { back: S.back } }); }
          }
        });
      },

      pick: function (id) {
        S.view = id;
        S.pending = null;
        if (UI.isUnlockedChar(id)) {
          var s = UI.save();
          if (s.selectedChar !== id) {
            s.selectedChar = id;
            OG.Save.commit();
            OG.Events.emit('char:select', { charId: id });
            UI.toast('Đã chọn ' + UI.charName(id) + '!');
          }
        }
        S.render('[data-fk="char-' + id + '"]');
      },

      skin: function (skinId) {
        var sk = OG.Data.getSkin(skinId);
        if (!sk) return;
        var s = UI.save();
        if (!UI.ownsSkin(skinId)) {
          // Mua 2 bước để tránh bấm nhầm.
          if (S.pending !== 'skin:' + skinId) { S.pending = 'skin:' + skinId; S.render('[data-fk="skin-' + skinId + '"]'); return; }
          S.pending = null;
          var ok = U.call('Shop', 'buy', skinId);
          if (!ok) {
            UI.toast(UI.coins() < (sk.price | 0) ? 'Chưa đủ xu! Cần ' + UI.fmt(sk.price) + ' 🪙' : 'Không mua được skin này.');
            S.render('[data-fk="skin-' + skinId + '"]');
            return;
          }
          UI.toast('Đã mua ' + sk.name + '! 🎉');
        }
        if (!UI.isUnlockedChar(sk.charId)) {
          UI.toast('Mở khoá ' + UI.charName(sk.charId) + ' để dùng skin này.');
          S.render('[data-fk="skin-' + skinId + '"]');
          return;
        }
        if (!s.equippedSkins) s.equippedSkins = {};
        s.equippedSkins[sk.charId] = skinId;
        OG.Save.commit();
        OG.Events.emit('skin:equip', { charId: sk.charId, skinId: skinId });
        S.render('[data-fk="skin-' + skinId + '"]');
      },

      unlock: function (id) {
        var ch = OG.Data.getCharacter(id);
        var cost = ch.unlock && ch.unlock.cost | 0;
        if (S.pending !== 'char:' + id) { S.pending = 'char:' + id; S.render('[data-fk="unlock"]'); return; }
        S.pending = null;
        if (U.call('Shop', 'buy', 'char:' + id)) {
          UI.toast('Đã mở khoá ' + ch.name + '! 🎉');
          S.pick(id);
        } else {
          UI.toast(UI.coins() < cost ? 'Chưa đủ xu! Cần ' + UI.fmt(cost) + ' 🪙' : 'Không mở khoá được.');
          S.render('[data-fk="char-' + id + '"]');
        }
      },

      leave: function () { OG.Scenes.go(S.back && OG.Scenes.has(S.back) ? S.back : 'menu', { back: 'menu' }); },

      exit: function () { UI.close(); },
      update: function () {
        if (OG.Input.pressed('back')) { OG.Input.consume('back'); S.leave(); }
      },
      draw: function (ctx) { UI.drawBackdrop(ctx); UI.drawPreviews(OG.time); }
    };
    return S;
  }

  // ======================================================================
  // Scene: cài đặt (go từ menu, hoặc push từ pause với params.overlay)
  // ======================================================================
  function settingsScene() {
    var S = {
      back: 'menu', overlay: false, confirmReset: false, drawBelow: true,

      enter: function (params) {
        params = params || {};
        S.back = params.back || 'menu';
        S.overlay = !!params.overlay;
        S.confirmReset = false;
        if (!S.overlay) UI.hideGameUi();
        S.render();
      },

      vol: function (ch) {
        var v = U.call('Audio', 'getVolume', ch);
        if (typeof v !== 'number') {
          var st = (UI.save() || {}).settings || {};
          v = ch === 'music' ? st.musicVolume : st.sfxVolume;
        }
        return U.clamp(+v || 0, 0, 1);
      },
      setVol: function (ch, v) {
        v = Math.round(U.clamp(v, 0, 1) * 20) / 20;
        if (OG.Audio && typeof OG.Audio.setVolume === 'function') U.call('Audio', 'setVolume', ch, v);
        else OG.Save.setSetting(ch === 'music' ? 'musicVolume' : 'sfxVolume', v);
        S.updateSlider(ch);
      },
      muted: function () {
        var m = U.call('Audio', 'isMuted');
        if (typeof m === 'boolean') return m;
        return !!((UI.save() || {}).settings || {}).muted;
      },

      sliderHtml: function (ch, label) {
        var v = S.vol(ch);
        return '<div class="ui-setting"><span class="ui-setting-label">' + label + '</span>' +
          '<div class="ui-slider-wrap">' +
          '<button type="button" class="secondary ui-mini" data-act="vol" data-arg="' + ch + ':-1" data-id="vol_' + ch + '_down" aria-label="Giảm">−</button>' +
          '<div class="ui-slider" tabindex="0" role="slider" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(v * 100) +
            '" data-slider="' + ch + '" aria-label="' + label + '"><b style="width:' + Math.round(v * 100) + '%"></b></div>' +
          '<button type="button" class="secondary ui-mini" data-act="vol" data-arg="' + ch + ':1" data-id="vol_' + ch + '_up" aria-label="Tăng">+</button>' +
          '<em data-vol-label="' + ch + '">' + Math.round(v * 100) + '%</em></div></div>';
      },

      updateSlider: function (ch) {
        if (!UI.panel) return;
        var v = S.vol(ch);
        var sl = UI.panel.querySelector('[data-slider="' + ch + '"]');
        if (sl) { sl.firstChild.style.width = Math.round(v * 100) + '%'; sl.setAttribute('aria-valuenow', Math.round(v * 100)); }
        var lb = UI.panel.querySelector('[data-vol-label="' + ch + '"]');
        if (lb) lb.textContent = Math.round(v * 100) + '%';
      },

      render: function (focusSel) {
        var st = (UI.save() || {}).settings || {};
        var touch = st.touchControls || 'auto';
        var seg = function (val, label) {
          return '<button type="button" class="' + (touch === val ? 'is-on' : 'secondary') + '" data-act="touch" data-arg="' + val +
            '" data-fk="touch-' + val + '" data-id="touch_' + val + '">' + label + '</button>';
        };
        var muted = S.muted();
        var html =
          S.sliderHtml('music', '🎵 Nhạc nền') +
          S.sliderHtml('sfx', '🔊 Hiệu ứng') +
          '<div class="ui-setting"><span class="ui-setting-label">🔇 Tắt tiếng</span>' +
            '<button type="button" class="' + (muted ? '' : 'secondary') + ' ui-toggle" data-act="mute" data-fk="mute" data-id="mute">' +
            (muted ? 'Đang tắt' : 'Đang bật') + '</button></div>' +
          '<div class="ui-setting"><span class="ui-setting-label">📱 Nút cảm ứng</span>' +
            '<div class="ui-seg">' + seg('auto', 'Tự động') + seg('on', 'Luôn hiện') + seg('off', 'Ẩn') + '</div></div>' +
          '<details class="ui-help"><summary>🎮 Cách điều khiển</summary>' +
            '<p>←/→ hoặc A/D: di chuyển · Space/W/↑: nhảy · E/J: tương tác<br>Esc/P: tạm dừng · Enter: chọn · Mũi tên: di chuyển giữa các nút</p></details>' +
          (S.overlay ? '' :
            '<div class="ui-setting ui-danger-row"><span class="ui-setting-label">🗑️ Dữ liệu</span>' +
            '<button type="button" class="ui-danger' + (S.confirmReset ? ' is-confirm' : '') + '" data-act="reset" data-fk="reset" data-id="reset">' +
            (S.confirmReset ? 'Chắc chắn? Bấm lần nữa' : 'Xoá toàn bộ tiến độ') + '</button></div>') +
          '<div class="actions"><button type="button" data-act="back" data-id="settings_back" data-primary>✔ XONG</button></div>';

        UI.open({
          title: 'CÀI ĐẶT',
          className: 'ui-settings',
          html: html,
          focus: focusSel,
          handlers: {
            vol: function (arg) {
              var parts = String(arg).split(':');
              S.setVol(parts[0], S.vol(parts[0]) + 0.1 * (+parts[1] || 0));
            },
            slideStep: function (ch, d) { S.setVol(ch, S.vol(ch) + 0.1 * d); },
            mute: function () {
              if (OG.Audio && typeof OG.Audio.mute === 'function') U.call('Audio', 'mute', !S.muted());
              else OG.Save.setSetting('muted', !S.muted());
              S.render('[data-fk="mute"]');
            },
            touch: function (val) {
              OG.Save.setSetting('touchControls', val);
              S.render('[data-fk="touch-' + val + '"]');
            },
            reset: function () {
              if (!S.confirmReset) { S.confirmReset = true; S.render('[data-fk="reset"]'); return; }
              S.confirmReset = false;
              OG.Save.reset();
              U.call('Progress', 'init');
              UI.toast('Đã xoá toàn bộ dữ liệu.');
              S.render('[data-fk="reset"]');
            },
            back: function () { S.leave(); }
          }
        });
        S.bindSliders();
      },

      // Kéo/chạm trên thanh trượt.
      bindSliders: function () {
        if (!UI.panel) return;
        var list = UI.panel.querySelectorAll('[data-slider]');
        Array.prototype.forEach.call(list, function (sl) {
          var ch = sl.getAttribute('data-slider');
          var dragging = false;
          var apply = function (e) {
            var r = sl.getBoundingClientRect();
            if (r.width > 0) S.setVol(ch, (e.clientX - r.left) / r.width);
          };
          sl.addEventListener('pointerdown', function (e) {
            dragging = true; apply(e);
            try { sl.setPointerCapture(e.pointerId); } catch (err) { /* bỏ qua */ }
          });
          sl.addEventListener('pointermove', function (e) { if (dragging) apply(e); });
          var stop = function () { if (dragging) { dragging = false; OG.Events.emit('ui:click', { id: 'vol_' + ch }); } };
          sl.addEventListener('pointerup', stop);
          sl.addEventListener('pointercancel', stop);
        });
      },

      leave: function () {
        if (S.overlay) { OG.Scenes.pop(); return; }
        OG.Scenes.go(OG.Scenes.has(S.back) ? S.back : 'menu');
      },

      exit: function () { UI.close(); },
      update: function () {
        if (OG.Input.pressed('back')) { OG.Input.consume('back'); OG.Input.consume('pause'); S.leave(); }
      },
      draw: function (ctx) {
        if (S.overlay) return; // scene dưới (level + pause) đã được vẽ
        UI.drawBackdrop(ctx);
      }
    };
    return S;
  }

  // ======================================================================
  // Scene: tạm dừng (push trên level/boss)
  // ======================================================================
  function pauseScene() {
    var S = {
      drawBelow: true, from: 'level',

      enter: function (params) {
        S.from = (params && params.from) || OG.Scenes.base() || 'level';
        OG.Events.emit('game:pause', { scene: S.from });
        S.render();
      },
      // Quay lại từ settings (đã push lên trên pause).
      resume: function () { S.render('[data-act="settings"]'); },

      render: function (focusSel) {
        var h = (OG.Game && OG.Game.hud) || {};
        var run = OG.Game && OG.Game.run;
        var items = U.call('Shop', 'getActiveSummary') || [];
        var quests = Array.isArray(h.quests) ? h.quests : [];
        var lives = run ? run.lives : h.lives;
        var html =
          '<p class="ui-pause-level">' + UI.esc((h.icon || '📍') + ' ' + (h.levelName || '')) +
            (S.from === 'boss' && h.boss ? ' · ⚔️ ' + UI.esc(h.boss.name) : '') + '</p>' +
          '<div class="ui-stats">' +
            '<span>⭐ ' + UI.fmt(h.score || 0) + '</span>' +
            '<span>❤️ ' + (lives | 0) + '</span>' +
            (S.from === 'level' ? '<span>🍕 ' + (h.pizzas | 0) + '/' + (h.goal | 0) + '</span>' : '') +
            '<span>⏱ ' + U.formatTime(h.time || 0) + '</span>' +
            '<span>🪙 ' + UI.fmt(UI.coins()) + '</span>' +
          '</div>' +
          (items.length ? '<p class="ui-note">Đang dùng: ' + items.map(function (it) { return UI.esc(it.icon + ' ' + it.name); }).join(' · ') + '</p>' : '') +
          (quests.length ? '<ul class="ui-quest-list">' + quests.map(function (q) { return UI.questLine(q, h.levelId); }).join('') + '</ul>' : '') +
          '<div class="ui-pause-actions">' +
            '<button type="button" data-act="resume" data-id="resume" data-primary>▶ TIẾP TỤC</button>' +
            '<button type="button" class="secondary" data-act="restart" data-id="restart">↻ Chơi lại màn</button>' +
            '<button type="button" class="secondary" data-act="settings" data-id="pause_settings">⚙️ Cài đặt</button>' +
            (OG.Scenes.has('worldmap') ? '<button type="button" class="secondary" data-act="map" data-id="pause_map">🗺️ Bản đồ</button>' : '') +
            '<button type="button" class="secondary" data-act="quit" data-id="quit">🏠 Về menu</button>' +
          '</div>';
        UI.open({
          title: 'TẠM DỪNG',
          className: 'ui-pause',
          html: html,
          focus: focusSel,
          small: 'Nhấn Esc hoặc P để chơi tiếp',
          handlers: {
            resume: function () { OG.Scenes.pop(); },
            restart: function () {
              if (OG.Game.restartLevel) { OG.Game.restartLevel(); return; }
              var run = OG.Game.run;
              OG.Game.startLevel(run ? (run.nextLevel | 0) : 0);
            },
            settings: function () { OG.Scenes.push('settings', { back: 'pause', overlay: true }); },
            map: function () { if (OG.Game.backToMap) OG.Game.backToMap(); else OG.Scenes.go('worldmap'); },
            quit: function () { OG.Scenes.go('menu'); }
          }
        });
      },

      exit: function () { UI.close(); },
      update: function () {
        if (OG.Input.pressed('pause') || OG.Input.pressed('back')) {
          OG.Input.consume('pause'); OG.Input.consume('back');
          OG.Scenes.pop();
        }
      },
      draw: function (ctx) { ctx.fillStyle = 'rgba(16,25,43,0.45)'; ctx.fillRect(0, 0, OG.W, OG.H); }
    };
    return S;
  }

  // ======================================================================
  // Scene: kết quả (gameover / victory)
  // ======================================================================
  function confettiBurst(list, n) {
    var colors = ['#ffc94a', '#f27a43', '#52c5ee', '#3fbf6f', '#f29bb8', '#ffffff'];
    for (var i = 0; i < n; i++) {
      list.push({
        x: U.rand(0, OG.W), y: U.rand(-OG.H, -10), vx: U.rand(-40, 40), vy: U.rand(60, 160),
        r: U.rand(0, 6.28), vr: U.rand(-6, 6), w: U.rand(6, 11), h: U.rand(3, 6), c: U.choice(colors)
      });
    }
  }

  function resultScene(type) {
    var win = type === 'victory';
    var S = {
      confetti: [],

      enter: function (params) {
        UI.hideGameUi();
        var r = (params && params.result) || (OG.Game && OG.Game.buildResult ? OG.Game.buildResult(type) : { score: 0, stats: {} });
        S.result = r;
        S.confetti = [];
        if (win || r.isNewBest) confettiBurst(S.confetti, win ? 90 : 40);
        var st = r.stats || {};
        var name = UI.charName(r.charId);
        var lvCount = (r.levelsCompleted || []).length;
        var title = win ? 'CHIẾN THẮNG! 🏆' : 'HẾT LƯỢT! 💫';
        var lead = win
          ? UI.esc(name) + ' đã đánh bại bộ ba gián và lấy lại toàn bộ đồ ăn!'
          : UI.esc(name) + ' cần nghỉ một chút' + (r.levelName ? ' ở <b>' + UI.esc(r.levelName) + '</b>' : '') + '. Thử lại nhé!';
        var html =
          '<p>' + lead + '</p>' +
          '<div class="ui-result-score">' +
            '<span class="ui-big-score">' + UI.fmt(r.score) + '</span><small>điểm</small>' +
            (r.isNewBest ? '<span class="ui-badge">🎉 KỶ LỤC MỚI!</span>' : '<span class="ui-best">Kỷ lục: ' + UI.fmt(r.bestScore || 0) + '</span>') +
          '</div>' +
          '<div class="ui-result-grid">' +
            '<span>🗺️ <b>' + lvCount + '</b> màn</span>' +
            '<span>🍕 <b>' + (st.pizzas | 0) + '</b> pizza</span>' +
            '<span>🪳 <b>' + (st.stomps | 0) + '</b> gián</span>' +
            '<span>👑 <b>' + (st.bosses | 0) + '</b> trùm</span>' +
            '<span>🪙 <b>+' + UI.fmt(r.coinsEarned | 0) + '</b> xu</span>' +
            '<span>⏱ <b>' + U.formatTime(r.time) + '</b></span>' +
          '</div>' +
          '<div class="actions">' +
            '<button type="button" data-act="again" data-id="' + (win ? 'again' : 'retry') + '" data-primary>' + (win ? '↻ CHƠI LẠI' : '↻ THỬ LẠI') + '</button>' +
            (OG.Scenes.has('shop') ? '<button type="button" class="secondary" data-act="shop" data-id="result_shop">🛒 Cửa hàng</button>' : '') +
            '<button type="button" class="secondary" data-act="menu" data-id="menu">🏠 Về menu</button>' +
          '</div>';
        var panel = UI.open({
          title: title,
          className: 'ui-result ' + (win ? 'ui-victory' : 'ui-gameover'),
          html: html,
          handlers: {
            again: function () { if (OG.Game.retryRun) OG.Game.retryRun(); else { OG.Game.newRun(); OG.Scenes.go('worldmap'); } },
            shop: function () { OG.Scenes.go('shop', { back: 'menu' }); },
            menu: function () { OG.Scenes.go('menu'); }
          }
        });
        // BẮT BUỘC theo hợp đồng: Social gắn ô nhập tên, lưu điểm, chia sẻ...
        U.call('Social', 'mountResult', panel, r);
        UI.focusIn(panel); // giữ tiêu đề trong tầm nhìn (không cuộn)
      },

      exit: function () { UI.close(); S.confetti = []; },
      update: function (dt) {
        for (var i = 0; i < S.confetti.length; i++) {
          var c = S.confetti[i];
          c.x += c.vx * dt; c.y += c.vy * dt; c.r += c.vr * dt;
          c.vx += Math.sin(OG.time * 2 + i) * 8 * dt;
          if (c.y > OG.H + 20) { if (win) { c.y = -10; c.x = U.rand(0, OG.W); } else { S.confetti.splice(i, 1); i--; } }
        }
      },
      draw: function (ctx) {
        UI.drawLastPlay(ctx);
        ctx.fillStyle = win ? 'rgba(255,201,74,0.12)' : 'rgba(16,25,43,0.35)';
        ctx.fillRect(0, 0, OG.W, OG.H);
        for (var i = 0; i < S.confetti.length; i++) {
          var c = S.confetti[i];
          ctx.save();
          ctx.translate(c.x, c.y); ctx.rotate(c.r);
          ctx.fillStyle = c.c;
          ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
          ctx.restore();
        }
      }
    };
    return S;
  }

  // ======================================================================
  // init
  // ======================================================================
  var inited = false;
  Menus.init = function () {
    if (!inited) {
      inited = true;
      window.addEventListener('keydown', onKeyDown, true);

      // Cập nhật số xu trên panel đang mở.
      OG.Events.on('coins:change', function (e) {
        if (!UI.panel) return;
        var els = UI.panel.querySelectorAll('.ui-coin-val');
        for (var i = 0; i < els.length; i++) els[i].textContent = UI.fmt(e.coins);
      });
      // Thông báo mở khoá nhân vật do qua màn.
      OG.Events.on('char:unlock', function (e) {
        if (e && e.reason === 'level') UI.toast('🎉 Đã mở khoá ' + UI.charName(e.charId) + '! Đổi ở mục Nhân vật.', 2.6);
      });
      // Thông báo hoàn thành nhiệm vụ — chỉ khi thiếu OG.Quests (Quests tự xếp hàng toast của nó;
      // toast thêm ở đây sẽ đè lên và làm mất/lặp thông báo khi nhiều nhiệm vụ xong cùng lúc).
      OG.Events.on('quest:complete', function (e) {
        if (!e || OG.Quests) return;
        UI.toast('✅ Nhiệm vụ: ' + (e.text || '') + (e.reward ? ' · +' + e.reward + ' 🪙' : ''), 2.4);
      });
    }

    OG.Scenes.register('menu', menuScene());
    OG.Scenes.register('charselect', charSelectScene());
    OG.Scenes.register('settings', settingsScene());
    OG.Scenes.register('pause', pauseScene());
    OG.Scenes.register('gameover', resultScene('gameover'));
    OG.Scenes.register('victory', resultScene('victory'));
  };
})();
