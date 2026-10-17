// @ts-check
/* ============================================================================
 * Scene v2 của HÀNH TRÌNH HỌC TẬP — journeySelect · journeyMap · comic · card · quiz · notebook · journeyEnd
 * ----------------------------------------------------------------------------
 * Vai trò:      Toàn bộ màn hình "ngoài màn chơi" của chế độ Hành trình: chọn hành trình, bản đồ (bản DOM dự phòng),
 *               truyện tranh (comic), thẻ kiến thức (card), câu đố mở cửa (quiz), Sổ tay khám phá (notebook) và
 *               màn kết thúc (journeyEnd). OG.Story / OG.Learn mở các scene này bằng OG.Scenes.go/push.
 * Khái niệm:    scene = một trạng thái của finite state machine (máy trạng thái hữu hạn) có vòng đời
 *               enter/update/draw/exit/resume · scene stack: go (thay) vs push (đè lên, drawBelow để thấy scene
 *               dưới) · hai cách dựng UI: panel DOM (HTML + data-act) và canvas (vẽ + hit-test) · timeline hiện
 *               chữ theo "nhịp" (beat) · co giãn đều kiểu cover · bố trí bong bóng tránh đè · ảnh polaroid +
 *               lazy-load (OG.Photos) · điều hướng lưới bằng phím · hiệu ứng lật thẻ bằng scale
 * Bài học:      docs/learn/05-state-machine-scene.md (vòng đời & stack) · docs/learn/07-ve-canvas-procedural-cache.md
 *               (vẽ khung truyện, polaroid) · docs/learn/12-data-driven-man-cau-do-hanh-trinh.md (dữ liệu thẻ/câu đố/truyện)
 * Phụ thuộc:    LOAD: OG.util (U), OG.Scenes.register (đăng ký ngay khi nạp file), OG.Story (gán drawComicPanel).
 *               CHẠY: OG.Story.ui, OG.Journeys, OG.Learn, OG.Guide.guideOf, OG.Photos, OG.Input, OG.DOM
 *               (panel, hidePanel, toast, setHudVisible, setControlsVisible, overlay, shell), OG.Sprites, OG.Data,
 *               OG.Progress, OG.Difficulty, OG.Game (run, newRun, buildResult), OG.util.call('Social', 'mountResult')
 * Event:        phát: 'ui:click' (nút DOM), 'comic:start', 'comic:end', 'photo:zoom' (+ event do OG.Learn/OG.Story phát)
 *               · nghe: (không)
 * API công khai: các scene đăng ký bằng tên: 'journeySelect', 'journeyMap', 'comic', 'card', 'quiz', 'notebook',
 *               'journeyEnd' · OG.Story.drawComicPanel(ctx, panel, frameRect, t, appear, state) · OG.Story._beatsOf (test)
 * Đọc tiếp:     src/core/scenes.js (go/push/pop, drawBelow) → src/story/story.js (bộ công cụ ui dùng ở đây)
 *               → src/world/journey-map.js (bản đồ canvas thay thế scene journeyMap DOM bên dưới)
 *
 * Hợp đồng (params, phím, event): docs/STORY.md mục 6.5 — smoke test điều khiển các scene bằng đúng phím/selector đó.
 * Giao diện cho trẻ 5–10 tuổi: chữ to, nút to (≥ 56 px), nhiều hình, điều khiển bằng bàn phím lẫn cảm ứng.
 *   - journeySelect, journeyMap, journeyEnd: panel DOM (#overlay) — style trong src/story/story.css (.story-*).
 *   - comic, card, quiz, notebook: vẽ canvas 960×540 (tự co giãn theo khung). Toạ độ trong file là toạ độ
 *     MÀN HÌNH logic 960×540, gốc góc trên-trái (trừ phần vẽ cảnh trong khung truyện).
 * ========================================================================== */

/* Kiểu UiRect (hình chữ nhật màn hình cho nút/hit-test) khai báo ở src/story/story.js. */
/**
 * @typedef {Object} ComicBeat  một "nhịp" kể chuyện trong khung truyện
 * @property {string} kind  'caption' = lời dẫn; 'bubble' = lời thoại của nhân vật
 * @property {string} text
 * @property {string} [who]  charId người nói (bubble), 'narrator' = người kể chuyện
 */
/**
 * @typedef {Object} RevealState  trạng thái hiện chữ của khung truyện tại một thời điểm
 * @property {number[]} reveal        số ký tự đang hiện của từng nhịp
 * @property {string|null} speaking   charId đang nói (để nhân vật đó mấp máy miệng, nhún nhẹ)
 * @property {boolean} done           mọi nhịp đã hiện hết chữ
 */
/**
 * @typedef {Object} PanelView  phép co giãn từ "sân khấu" 960×540 vào khung truyện
 * @property {number} s     hệ số scale
 * @property {number} visW  bề rộng phần sân khấu nhìn thấy, px sân khấu
 * @property {number} visH  bề cao phần nhìn thấy
 * @property {number} ox    lệch trái của phần nhìn thấy, px sân khấu
 * @property {number} oy    lệch trên (phần bầu trời bị cắt), px sân khấu
 */
(function () {
  'use strict';
  var OG = window.OG;
  var U = OG.util;
  var TAU = Math.PI * 2;
  var INK = '#17233d';

  function J() { return OG.Journeys; }
  function ui() { return OG.Story.ui; }
  function esc(s) { return U.escapeHtml(s); }
  function I() { return OG.Input; }
  // Cú chạm/nhấp chuột ở frame này (cạnh lên) và toạ độ logic 960×540 của nó.
  function tapped() { return I().pointer.justPressed; }
  function pt() { return I().pointer; }
  // Esc hoặc P. consume() để scene NẰM DƯỚI (sau khi pop) không nhận lại cùng cú bấm trong frame này.
  function backPressed() {
    if (I().pressed('back') || I().pressed('pause')) { I().consume('back'); I().consume('pause'); return true; }
    return false;
  }
  // Phím "chọn": Enter, E, Space (nhưng KHÔNG tính ↑/W — hai phím này vừa là 'jump' vừa là 'up' để di chuyển lựa chọn).
  function selectPressed() {
    var inp = I();
    return inp.pressed('confirm') || inp.pressed('action') || (inp.pressed('jump') && !inp.pressed('up'));
  }
  // Đang focus một nút trong panel → để trình duyệt tự bấm nút đó, scene không xử lý Enter nữa.
  function overlayButtonFocused() {
    var ae = document.activeElement, ov = OG.DOM.overlay;
    return !!(ae && ae.tagName === 'BUTTON' && ov && ov.contains(ae));
  }
  function hideChrome() { OG.DOM.setHudVisible(false); OG.DOM.setControlsVisible(false); }
  // Scene push (thẻ, câu đố, truyện chen giữa) ẩn HUD + nút cảm ứng để không che nút to;
  // khi pop về màn chơi thì hiện lại (scene 'level' không tự bật lại lúc resume).
  function restoreChrome(to) {
    if (to === 'level' || to === 'boss') { OG.DOM.setHudVisible(true); OG.DOM.setControlsVisible(true); }
  }
  function isTouch() {
    var shell = OG.DOM.shell;
    return !!(shell && shell.classList && shell.classList.contains('touch-on')) ||
      !!(window.matchMedia && window.matchMedia('(pointer:coarse)').matches);
  }
  function charInfo(id) {
    var c = OG.Data.getCharacter && OG.Data.getCharacter(id);
    return c || { id: id, name: id, w: 34, h: 50 };
  }
  function charName(id) {
    return id && OG.Data.characters && OG.Data.characters[id] ? charInfo(id).name : null;
  }
  function drawChar(ctx, id, anim, t, opts) {
    ui().guard(ctx, 'nhân vật ' + id, function () { OG.Sprites.drawCharacter(ctx, id, anim || 'idle', t, opts || {}); });
  }

  // 💡 Khái niệm: "data-act" — HTML chỉ khai báo Ý ĐỊNH (data-act="journey" data-arg="home"), JS gắn một
  //   bảng handlers {tên hành động: hàm}. Thêm nút mới = thêm HTML + 1 handler; mọi cú bấm đều phát 'ui:click'
  //   (âm thanh, thống kê) ở một chỗ duy nhất. Smoke test cũng bấm nút qua đúng selector [data-act].
  /**
   * @param {HTMLElement} panel
   * @param {Object<string, function(string, HTMLElement): void>} handlers  act → hàm(arg, phần tử)
   */
  function bindActs(panel, handlers) {
    var els = panel.querySelectorAll('[data-act]');
    for (var i = 0; i < els.length; i++) {
      // IIFE trong vòng lặp: mỗi listener "chụp" đúng phần tử của mình (var không có block scope).
      (/** @param {any} el  nút/phần tử có data-act */ function (el) {
        el.addEventListener('click', function () {
          if (el.disabled) return;
          var act = el.getAttribute('data-act'), arg = el.getAttribute('data-arg');
          OG.Events.emit('ui:click', { id: act + (arg ? ':' + arg : '') });
          if (handlers[act]) handlers[act](arg, el);
        });
      })(els[i]);
    }
  }

  // Chân dung nhân vật vẽ bằng canvas nhỏ đặt trong panel DOM: <span class="story-portrait" data-char="bob" data-size="48">
  // Cùng một hàm vẽ procedural (OG.Sprites.drawPortrait) phục vụ cả canvas game lẫn giao diện HTML.
  function mountPortraits(root) {
    if (!OG.Sprites || !OG.Sprites.drawPortrait) return;
    var els = root.querySelectorAll('.story-portrait');
    for (var i = 0; i < els.length; i++) {
      var el = els[i], id = el.getAttribute('data-char'), size = +el.getAttribute('data-size') || 48;
      if (!id) continue;
      var cv = document.createElement('canvas');
      // Bộ đệm gấp đôi kích thước hiển thị (CSS co về size px) + scale(2,2) → nét trên màn hình mật độ điểm ảnh cao.
      cv.width = size * 2; cv.height = size * 2;
      var c = cv.getContext && cv.getContext('2d');
      if (!c) continue;
      (function (c, id, size) {
        ui().guard(c, 'chân dung ' + id, function () {
          c.scale(2, 2);
          OG.Sprites.drawPortrait(c, id, size / 2, size / 2, size - 3, { t: 0.4, state: 'idle', bg: '#fff6df' });
        });
      })(c, id, size);
      el.appendChild(cv);
    }
  }

  function firstTheme(jid) {
    var j = J().get(jid);
    return (j && j.areas && j.areas[0] && j.areas[0].sceneryTheme) || 'garden';
  }
  function themeOfLevel(levelId, jid) {
    var L = levelId && J().getLevel(levelId);
    return (L && L.theme) || firstTheme(jid);
  }
  // Nền canvas phía sau panel: cảnh nền chủ đề cuộn chậm + lớp tối mờ.
  function backdrop(ctx, theme, dim) {
    ui().guard(ctx, 'nền ' + theme, function () {
      OG.Sprites.drawBackground(ctx, theme || 'garden', OG.time * 22, OG.time);
      OG.Sprites.drawPlatform(ctx, { x: 0, y: OG.FLOOR_Y, w: OG.W, h: 60, isFloor: true }, theme || 'garden', OG.time);
    });
    ctx.fillStyle = 'rgba(16,25,43,' + (dim == null ? 0.35 : dim) + ')';
    ctx.fillRect(0, 0, OG.W, OG.H);
  }
  function starsHtml(n) {
    var s = '';
    for (var i = 0; i < 3; i++) s += i < n ? '★' : '☆';
    return s;
  }
  function paletteStyle(jid) {
    var p = ui().palette(jid);
    return '--jp:' + esc(p.primary) + ';--js:' + esc(p.secondary) + ';--ja:' + esc(p.accent) + ';--jb:' + esc(p.bg) +
      ';--jpd:' + esc(ui().shade(p.primary, -0.3)) + ';--jsd:' + esc(ui().shade(p.secondary, -0.3));
  }

  // ===========================================================================
  // journeySelect — chọn hành trình + độ khó.  params: {back}
  //   Chạm thẻ hành trình [data-act="journey"][data-arg=jid]; ←→↑↓ chọn, Enter bắt đầu; Esc = quay lại.
  // 💡 Khái niệm: scene "lai" DOM + canvas — UI chính là panel HTML (chữ sắc nét, cuộn được, truy cập bằng
  //   Tab), còn draw() vẫn vẽ cảnh nền động trên canvas phía sau. update() vẫn chạy mỗi frame để nhận phím.
  // ===========================================================================
  var DIFF_HINT = { kid: 'Nhiều mạng, rơi hố không sao, có trợ giúp', challenge: 'Ít mạng hơn, kẻ địch nhanh hơn' };
  var journeySelect = {
    enter: function (params) {
      this.back = (params && params.back) || 'menu';
      this.selId = null;
      hideChrome();
      ui().fx.clear();
      this.render();
    },
    // Dựng lại TOÀN BỘ panel từ dữ liệu (đơn giản hơn cập nhật từng phần tử; panel nhỏ nên rẻ).
    // ⚠️ Bẫy: `self` thay cho `this` trong các handler — bên trong function(){} của listener, `this` không còn là scene.
    render: function () {
      var self = this;
      var list = J().list().filter(function (j) { return !j.invalid; });
      this.ids = list.map(function (j) { return j.id; });
      if (!this.selId || this.ids.indexOf(this.selId) < 0) {
        var last = OG.Story.lastJourney();
        this.selId = this.ids.indexOf(last) >= 0 ? last : this.ids[0];
      }
      var cards = list.map(function (j) {
        var pr = J().progress(j.id), c = OG.Learn.count(j.id);
        var done = J().isComplete(j.id), started = pr.levelsDone > 0 || c.have > 0;
        var pct = pr.levels ? Math.round((pr.levelsDone / pr.levels) * 100) : 0;
        var g = j.guide || {};
        var areas = (j.areas || []).map(function (a) { return esc(a.emoji || '📍'); }).join(' ');
        return '<button type="button" class="story-jcard' + (done ? ' is-done' : '') + '" data-act="journey" data-arg="' + esc(j.id) + '" style="' + paletteStyle(j.id) + '">' +
          '<span class="story-jcard-top"><span class="story-jcard-emoji">' + esc(j.emoji) + '</span>' +
          (done ? '<span class="story-ribbon">✅ Xong</span>' : '') + '</span>' +
          '<span class="story-jcard-title">' + esc(j.title) + '</span>' +
          '<span class="story-jcard-desc">' + esc(j.description) + '</span>' +
          '<span class="story-jcard-areas">' + areas + '</span>' +
          '<span class="story-jcard-guide"><span class="story-portrait" data-char="' + esc(g.charId || 'olivia') + '" data-size="36" style="width:36px;height:36px"></span>' +
          '<span>Đi cùng <b>' + esc(g.name || '') + '</b></span></span>' +
          '<span class="story-bar"><i style="width:' + pct + '%"></i></span>' +
          '<span class="story-jcard-stats"><span>🏁 ' + pr.levelsDone + '/' + pr.levels + '</span><span>⭐ ' + pr.stars + '/' + pr.maxStars + '</span><span>📒 ' + c.have + '/' + c.total + '</span></span>' +
          '<span class="story-jcard-cta">' + (done ? '🏆 Chơi lại' : started ? '▶ Chơi tiếp' : '▶ Bắt đầu') + '</span>' +
          '</button>';
      }).join('');
      if (!cards) cards = '<p class="story-empty">Các hành trình đang được xây dựng, quay lại sau nhé! 🛠️</p>';
      var diff = '';
      if (OG.Difficulty && OG.Difficulty.list) {
        var mode = OG.Difficulty.mode();
        diff = '<div class="story-diff"><span class="story-diff-label">Độ khó:</span>' +
          OG.Difficulty.list().map(function (m) {
            return '<button type="button" class="story-diff-btn' + (m === mode ? ' is-on' : '') + '" data-act="diff" data-arg="' + esc(m) + '">' + esc(OG.Difficulty.label(m)) + '</button>';
          }).join('') +
          '<small class="story-diff-hint">' + esc(DIFF_HINT[mode] || '') + '</small></div>';
      }
      var panel = OG.DOM.panel({
        title: '📖 PHIÊU LƯU HỌC TẬP',
        className: 'story-panel story-select',
        html: '<p class="story-sub">Chọn một chuyến phiêu lưu — vừa chơi vừa học nhé! ✨</p>' +
          '<div class="story-journeys">' + cards + '</div>' + diff +
          '<div class="actions"><button type="button" class="secondary" data-act="back">↩ Quay lại</button></div>'
      });
      bindActs(panel, {
        journey: function (id) { self.selId = id; OG.Story.startJourney(id); },
        diff: function (m) { if (OG.Difficulty) OG.Difficulty.set(m); self.render(); },
        back: function () { OG.Scenes.go(self.back); }
      });
      mountPortraits(panel);
      this.panel = panel;
      this.highlight();
    },
    highlight: function () {
      if (!this.panel) return;
      var els = this.panel.querySelectorAll('.story-jcard');
      for (var i = 0; i < els.length; i++) {
        var on = els[i].getAttribute('data-arg') === this.selId;
        els[i].classList.toggle('is-sel', on);
        if (on && this.moved && els[i].scrollIntoView) els[i].scrollIntoView({ block: 'nearest' });
      }
    },
    exit: function () { OG.DOM.hidePanel(); this.panel = null; },
    update: function (dt) {
      ui().fx.update(dt);
      if (backPressed()) { OG.Scenes.go(this.back); return; }
      var n = this.ids ? this.ids.length : 0, inp = I();
      if (!n) return;
      var i = Math.max(0, this.ids.indexOf(this.selId)), ni = i;
      // Điều hướng lưới: ←→ đi ±1, ↑↓ đi ±số cột. Số cột phải KHỚP CSS (≤ 700 px: 1 cột, còn lại 2 cột).
      var cols = window.innerWidth && window.innerWidth <= 700 ? 1 : 2;
      if (inp.pressed('left')) ni = Math.max(0, i - 1);
      if (inp.pressed('right')) ni = Math.min(n - 1, i + 1);
      if (inp.pressed('up')) ni = Math.max(0, i - cols);
      if (inp.pressed('down')) ni = Math.min(n - 1, i + cols);
      if (ni !== i) { this.selId = this.ids[ni]; this.moved = true; this.highlight(); }
      // ⚠️ Bẫy: nếu một nút DOM đang focus, Enter đã "click" nút đó rồi — xử lý thêm ở đây là chạy 2 lần.
      if (inp.pressed('confirm') && !overlayButtonFocused()) OG.Story.startJourney(this.selId);
    },
    draw: function (ctx) {
      backdrop(ctx, 'garden', 0.25);
      // Oggy và bốn người dẫn đường vẫy chào dưới chân trang
      var who = ['oggy'].concat(J().list().map(function (j) { return (j.guide && j.guide.charId) || 'olivia'; }));
      for (var i = 0; i < who.length; i++) {
        ctx.save();
        ctx.translate(90 + i * ((OG.W - 180) / Math.max(1, who.length - 1)), OG.FLOOR_Y + 4 + Math.abs(Math.sin(OG.time * 3 + i)) * -6);
        drawChar(ctx, who[i], i % 2 ? 'wave' : 'victory', OG.time + i, { scale: 1.6, face: i < who.length / 2 ? 1 : -1, time: OG.time });
        ctx.restore();
      }
      ui().fx.draw(ctx);
    }
  };

  // ===========================================================================
  // journeyMap — các khu & màn của 1 hành trình.  params: {journeyId, completed?, result?}
  //   Enter = ▶ CHƠI TIẾP (màn chưa xong đầu tiên; ←→ đổi màn được chọn); nút màn [data-act="level"][data-arg];
  //   📒 Sổ tay; Esc → journeySelect.
  // 💡 Khái niệm: "stub rồi ghi đè" — đây là bản DOM DỰ PHÒNG. src/world/journey-map.js đăng ký scene cùng tên
  //   'journeyMap' trong init() (chạy SAU khi mọi file đã nạp) nên bản canvas đẹp hơn sẽ thay thế bản này;
  //   thiếu file đó (hoặc nó lỗi) thì game vẫn có bản đồ để chơi.
  // ===========================================================================
  var journeyMap = {
    enter: function (params) {
      params = params || {};
      this.jid = params.journeyId || OG.Story.current() || OG.Story.lastJourney();
      var j = J().get(this.jid);
      hideChrome();
      ui().fx.clear();
      if (!j || j.invalid) { OG.Scenes.go('journeySelect'); return; }
      if (!OG.Game.run || OG.Game.run.over || OG.Game.run.journeyId !== this.jid) OG.Game.newRun({ journeyId: this.jid });
      this.completed = params.completed || null;
      this.t = 0;
      var done = J().isComplete(this.jid), ids = J().levelIds(this.jid);
      this.selId = done ? ids[0] : J().firstIncomplete(this.jid);
      if (this.completed) {
        ui().fx.confetti(OG.W / 2, OG.H * 0.6, 70, 2.6);
        var L = J().getLevel(this.completed);
        OG.DOM.toast('Giỏi quá! Hoàn thành ' + (L ? '“' + L.name + '”' : 'màn') + ' 🎉', 2.2);
      }
      this.render();
    },
    render: function () {
      var self = this, jid = this.jid, j = J().get(jid);
      var pr = J().progress(jid), c = OG.Learn.count(jid), done = J().isComplete(jid);
      var next = J().firstIncomplete(jid), nextL = J().getLevel(next), g = j.guide || {};
      var doneL = this.completed && J().getLevel(this.completed);
      var msg = doneL ? 'Giỏi quá! Bạn vừa xong “' + doneL.name + '”! ' + (done ? 'Hết hành trình rồi! 🏆' : 'Đi tiếp nào! 🎉')
        : done ? 'Bạn đã đi hết hành trình! Chơi lại để lấy thêm sao nhé! ⭐'
          : pr.levelsDone === 0 ? 'Bắt đầu thôi! Bấm ▶ CHƠI TIẾP nhé!'
            : 'Màn tiếp theo: “' + (nextL ? nextL.name : '') + '”. Đi nào!';
      var head = '<div class="story-map-head">' +
        '<span class="story-portrait story-portrait-big" data-char="' + esc(g.charId || 'olivia') + '" data-size="64" style="width:64px;height:64px"></span>' +
        '<div class="story-say"><b>' + esc(g.name || '') + '</b><span>' + esc(msg) + '</span></div>' +
        '<div class="story-map-stats"><span>⭐ ' + pr.stars + '/' + pr.maxStars + '</span><span>📒 ' + c.have + '/' + c.total + '</span></div></div>';
      var levels = J().levelsOf(jid);
      var areas = (j.areas || []).map(function (a, ai) {
        var lv = levels.filter(function (l) { return l.areaId === a.id; });
        var unlocked = J().isAreaUnlocked(jid, a.id), adone = J().isAreaDone(jid, a.id);
        var cur = !done && lv.some(function (l) { return l.id === next; });
        var ac = OG.Learn.count(jid, a.id);
        var nodes = lv.map(function (l, i) {
          var open = J().isLevelUnlocked(l.id), d = OG.Progress.isCompleted(l.id);
          var rec = OG.Progress.getRecord ? OG.Progress.getRecord(l.id) : null, stars = rec ? rec.stars | 0 : 0;
          var cls = 'story-node' + (d ? ' is-done' : open ? ' is-open' : ' is-locked') +
            (l.id === next && !done ? ' is-next' : '') + (l.id === self.completed ? ' is-new' : '');
          return '<button type="button" class="' + cls + '" data-act="level" data-arg="' + esc(l.id) + '"' + (open ? '' : ' disabled') +
            ' title="' + esc(l.name) + '" aria-label="Màn ' + (i + 1) + ': ' + esc(l.name) + '">' +
            '<span class="story-node-num">' + (open ? (i + 1) : '🔒') + '</span>' +
            '<span class="story-node-stars">' + (d ? starsHtml(stars) : open ? 'MỚI' : '') + '</span></button>' +
            (i < lv.length - 1 ? '<span class="story-link' + (d ? ' is-done' : '') + '"></span>' : '');
        }).join('');
        var boss = a.boss && a.boss.bossId
          ? '<span class="story-link' + (adone ? ' is-done' : '') + '"></span><span class="story-node story-node-boss' + (adone ? ' is-done' : '') + '" title="Trùm gián">' + (adone ? '🏆' : '👾') + '</span>' : '';
        return '<section class="story-area' + (adone ? ' is-done' : '') + (!unlocked ? ' is-locked' : '') + (cur ? ' is-current' : '') + '" style="--d:' + ai + '">' +
          '<header><span class="story-area-emoji">' + esc(a.emoji || '📍') + '</span><span class="story-area-name">' + esc(a.name) + '</span>' +
          '<span class="story-area-tag">' + (adone ? '✅' : !unlocked ? '🔒' : cur ? '📍' : '') + '</span></header>' +
          '<div class="story-path">' + nodes + boss + '</div>' +
          (ac.total ? '<small class="story-area-cards">📒 ' + ac.have + '/' + ac.total + ' thẻ</small>' : '') + '</section>';
      }).join('');
      var panel = OG.DOM.panel({
        title: esc(j.emoji) + ' ' + esc(j.title),
        className: 'story-panel story-map',
        html: head + '<div class="story-areas">' + areas + '</div>' +
          '<div class="actions story-map-actions">' +
          '<button type="button" class="story-play" data-act="play">' + (done ? '🔁 CHƠI LẠI' : '▶ CHƠI TIẾP') + '</button>' +
          '<button type="button" class="secondary" data-act="notebook">📒 Sổ tay ' + c.have + '/' + c.total + '</button>' +
          '<button type="button" class="secondary" data-act="back">↩ Hành trình khác</button></div>'
      });
      panel.setAttribute('style', paletteStyle(jid));
      bindActs(panel, {
        level: function (id) { self.play(id); },
        play: function () { self.play(done ? J().levelIds(jid)[0] : next); },
        notebook: function () { OG.Learn.openNotebook(jid, 'journeyMap', { journeyId: jid }); },
        back: function () { OG.Scenes.go('journeySelect'); }
      });
      mountPortraits(panel);
      this.panel = panel;
      this.highlight();
    },
    play: function (id) {
      if (!id || !J().isLevelUnlocked(id)) { OG.DOM.toast('Hoàn thành màn trước để mở màn này nhé! 🔒'); return; }
      OG.Story.playLevel(id);
    },
    highlight: function () {
      if (!this.panel) return;
      var els = this.panel.querySelectorAll('.story-node[data-arg]');
      for (var i = 0; i < els.length; i++) {
        var on = els[i].getAttribute('data-arg') === this.selId;
        els[i].classList.toggle('is-sel', on);
        if (on && this.moved && els[i].scrollIntoView) els[i].scrollIntoView({ block: 'nearest' });
      }
    },
    exit: function () { OG.DOM.hidePanel(); this.panel = null; },
    update: function (dt) {
      this.t += dt;
      ui().fx.update(dt);
      if (backPressed()) { OG.Scenes.go('journeySelect'); return; }
      var inp = I(), open = J().levelIds(this.jid).filter(function (id) { return J().isLevelUnlocked(id); });
      var i = open.indexOf(this.selId);
      if (open.length && (inp.pressed('left') || inp.pressed('up') || inp.pressed('right') || inp.pressed('down'))) {
        var d = inp.pressed('left') || inp.pressed('up') ? -1 : 1;
        this.selId = open[U.clamp((i < 0 ? 0 : i) + d, 0, open.length - 1)];
        this.moved = true;
        this.highlight();
      }
      if (inp.pressed('confirm') && !overlayButtonFocused()) this.play(this.selId);
    },
    draw: function (ctx) {
      backdrop(ctx, themeOfLevel(this.selId, this.jid), 0.3);
      var g = OG.Guide.guideOf(this.jid);
      ctx.save();
      ctx.translate(70, OG.FLOOR_Y + 4);
      drawChar(ctx, g.charId, 'wave', OG.time, { scale: 1.7, face: 1, time: OG.time });
      ctx.restore();
      ctx.save();
      ctx.translate(OG.W - 70, OG.FLOOR_Y + 4);
      drawChar(ctx, 'oggy', this.completed && this.t < 3 ? 'victory' : 'idle', OG.time, { scale: 1.7, face: -1, time: OG.time });
      ctx.restore();
      ui().fx.draw(ctx);
    }
  };

  // ===========================================================================
  // comic — truyện tranh dạng khung.  params: {journeyId, comicId, onDone?, overlay?}
  //   Lướt: chạm / Enter / Space / E / → (chữ đang hiện thì hiện hết trước). ← = khung trước.
  //   Bỏ qua: Esc hoặc nút "Bỏ qua ⏭". Luôn phát comic:start / comic:end.
  //   overlay:true = được push lên màn đang chơi, tự pop khi xong.
  // ===========================================================================
  // Bố cục cố định (px màn hình): khung truyện, nút Bỏ qua / Tiếp / Trước. Vẽ và hit-test dùng CHUNG các rect này.
  var CF = { x: 24, y: 66, w: 912, h: 402 };
  var SKIP = { x: 786, y: 8, w: 156, h: 50 };
  var NEXT = { x: 806, y: 478, w: 136, h: 54 };
  var PREV = { x: 18, y: 478, w: 70, h: 54 };
  var CPS = 38;          // ký tự/giây khi hiện chữ
  var BEAT_GAP = 0.35;   // nghỉ giữa hai bong bóng, giây
  var REVEAL_ALL_T = 999; // gán rt bằng số này = "tua tới cuối" → mọi nhịp hiện hết chữ, giây
  var INPUT_GRACE = 0.2;  // giây đầu của mỗi khung bỏ qua phím/chạm "tiến tới" (tránh một cú bấm lướt 2 khung)
  // 🧪 Thử: đổi CPS 38 → 8 rồi mở một truyện: chữ hiện chậm từng ký tự, bấm Enter lần đầu chỉ hiện hết chữ, lần hai mới sang khung.

  /**
   * Tách 1 khung truyện thành các "nhịp": lời dẫn (caption) trước, rồi lần lượt từng bong bóng có chữ.
   * @param {PanelDef|null} pn
   * @returns {ComicBeat[]}
   */
  function beatsOf(pn) {
    var out = [];
    if (!pn) return out;
    if (pn.caption) out.push({ kind: 'caption', text: String(pn.caption) });
    (pn.bubbles || []).forEach(function (b) { if (b && b.text) out.push({ kind: 'bubble', who: b.who, text: String(b.text) }); });
    return out;
  }
  /**
   * Tính số ký tự đang hiện của từng nhịp tại thời điểm rt.
   * 💡 Khái niệm: timeline thuần (pure function of time) — không lưu "đang ở nhịp nào"; mọi thứ suy ra từ rt.
   *   Nhịp i bắt đầu ở t0 = tổng (thời lượng gõ + BEAT_GAP) của các nhịp trước. Nhờ vậy tua (rt = REVEAL_ALL_T)
   *   hay lùi khung chỉ là gán lại một con số.
   * @param {ComicBeat[]} beats
   * @param {number} rt  giây kể từ khi khung bắt đầu hiện chữ
   * @returns {RevealState}
   */
  function revealAt(beats, rt) {
    var res = { reveal: [], speaking: null, done: true }, t0 = 0;
    for (var i = 0; i < beats.length; i++) {
      var len = beats[i].text.length, dur = len / CPS;
      var n = Math.floor((rt - t0) * CPS);
      if (n < len) {
        res.done = false;
        if (n >= 0 && beats[i].kind === 'bubble') res.speaking = beats[i].who;
      }
      // Nhịp đã tới giờ thì hiện ít nhất 1 ký tự (bong bóng xuất hiện ngay, không "trống" một frame).
      res.reveal.push(U.clamp(n, rt >= t0 ? 1 : 0, len));
      t0 += dur + BEAT_GAP;
    }
    return res;
  }

  // 💡 Khái niệm: một scene, hai cách vào — go() khi chiếu giữa các màn (thay cả stack), push() với overlay:true
  //   khi chen giữa màn chơi (màn chơi đứng yên bên dưới, drawBelow = true để vẫn thấy nó mờ phía sau).
  /** @type {any} scene object — field (p, panels, i, t, rt...) gắn động lúc enter() */
  var comic = {
    drawBelow: false,
    enter: function (params) {
      this.p = params || {};
      this.panels = J().getComic(this.p.journeyId, this.p.comicId) || [];
      this.i = 0; this.done = false;
      this.drawBelow = !!this.p.overlay; // truyện chen giữa màn: thấy màn chơi mờ phía sau
      OG.DOM.hidePanel();
      hideChrome();
      ui().fx.clear();
      this.prep();
      OG.Events.emit('comic:start', { journeyId: this.p.journeyId, comicId: this.p.comicId, panels: this.panels.length });
      if (!this.panels.length) this.finish(true);
    },
    prep: function () {
      this.beats = beatsOf(this.panels[this.i]);
      this.t = 0; this.rt = 0;
    },
    // Kết thúc truyện (xem hết hoặc bỏ qua): đánh dấu đã xem, phát 'comic:end', rồi gọi continuation onDone.
    finish: function (skipped) {
      // Cờ done chống gọi 2 lần (vd chạm Bỏ qua và Esc cùng frame) → onDone chạy 2 lần → nhảy 2 scene.
      if (this.done) return;
      this.done = true;
      OG.Story.markSeen(this.p.journeyId, this.p.comicId);
      OG.Events.emit('comic:end', { journeyId: this.p.journeyId, comicId: this.p.comicId, skipped: !!skipped });
      var cb = this.p.onDone;
      if (this.p.overlay) {
        // ⚠️ Bẫy: pop TRƯỚC rồi mới gọi cb — cb có thể push scene khác; làm ngược lại sẽ pop nhầm scene mới.
        OG.Scenes.pop(); // exit() bật lại HUD khi về màn chơi
        if (cb) cb();
        return;
      }
      if (cb) cb(); else OG.Scenes.go('journeyMap', { journeyId: this.p.journeyId });
    },
    advance: function () {
      if (!revealAt(this.beats, this.rt).done) { this.rt = REVEAL_ALL_T; return; } // hiện hết chữ trước
      this.i++;
      if (this.i >= this.panels.length) { this.finish(false); return; }
      this.prep();
    },
    back: function () {
      if (this.i <= 0) return;
      this.i--; this.prep(); this.rt = REVEAL_ALL_T; // khung đã đọc rồi → hiện hết chữ ngay
    },
    resume: function () { hideChrome(); },
    exit: function (to) { if (this.p && this.p.overlay) restoreChrome(to); },
    update: function (dt) {
      if (this.done) return;
      this.t += dt; this.rt += dt;
      ui().fx.update(dt);
      if (backPressed()) { this.finish(true); return; }
      if (tapped()) {
        var px = pt().x, py = pt().y;
        if (ui().hit(SKIP, px, py)) { this.finish(true); return; }
        if (this.i > 0 && ui().hit(PREV, px, py)) { this.back(); return; }
        if (this.t > INPUT_GRACE) { this.advance(); return; }
      }
      if (this.t > INPUT_GRACE && ui().advancePressed()) { this.advance(); return; }
      if (I().pressed('left')) this.back();
    },
    draw: function (ctx) {
      var jid = this.p.journeyId, pal = ui().palette(jid), j = J().get(jid) || {};
      if (this.p.overlay) { ctx.fillStyle = 'rgba(10,16,30,0.72)'; ctx.fillRect(0, 0, OG.W, OG.H); }
      else {
        var gr = ctx.createLinearGradient(0, 0, 0, OG.H);
        gr.addColorStop(0, ui().shade(pal.primary, -0.55)); gr.addColorStop(1, '#10192b');
        ctx.fillStyle = gr; ctx.fillRect(0, 0, OG.W, OG.H);
        // chấm bán sắc kiểu truyện tranh
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        for (var yy = 12; yy < OG.H; yy += 24) for (var xx = (yy / 24) % 2 ? 12 : 0; xx < OG.W; xx += 24) { ctx.beginPath(); ctx.arc(xx, yy, 3, 0, TAU); ctx.fill(); }
      }
      var pn = this.panels[Math.min(this.i, this.panels.length - 1)];
      // Thanh trên: tên hành trình + số trang + nút bỏ qua
      ctx.save();
      ctx.font = ui().font(20); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      var head = (j.emoji ? j.emoji + ' ' : '') + (j.title || 'Truyện tranh');
      var hw = Math.min(560, ctx.measureText(head).width + 36);
      ctx.fillStyle = pal.primary; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
      U.roundRectPath(ctx, 22, 12, hw, 44, 22); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.fillText(head, 40, 35);
      ctx.restore();
      ui().drawButton(ctx, SKIP, 'Bỏ qua ⏭', { color: '#52b9df', shadow: '#2582aa', size: 19 });
      if (!pn) return;
      // Khung truyện trượt vào
      var k = ui().easeOutBack(Math.min(1, this.t / 0.32));
      var st = revealAt(this.beats, this.rt);
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.t / 0.18);
      ctx.translate((1 - k) * 70, 0);
      drawComicPanel(ctx, pn, CF, OG.time, k, { reveal: st.reveal, speaking: st.speaking, beats: this.beats });
      ctx.restore();
      // Thanh dưới: khung trước, chấm tiến độ, gợi ý, nút tiếp
      if (this.i > 0) ui().drawButton(ctx, PREV, '◀', { color: '#52b9df', shadow: '#2582aa', size: 22 });
      var n = this.panels.length;
      for (var d = 0; d < n; d++) {
        var on = d === this.i;
        ctx.fillStyle = on ? '#ffc94a' : d < this.i ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.3)';
        ctx.beginPath(); ctx.arc(OG.W / 2 - (n - 1) * 13 + d * 26, 505, on ? 9 : 6.5, 0, TAU); ctx.fill();
      }
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = ui().font(15); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      if (n < 9) ctx.fillText(isTouch() ? 'Chạm để xem tiếp' : 'Enter / Space ▶', this.i > 0 ? 100 : 26, 505);
      ctx.restore();
      var last = this.i >= n - 1;
      ui().drawButton(ctx, NEXT, st.done ? (last ? 'Xong ✓' : 'Tiếp ▶') : '▶▶', { color: st.done ? '#3fbf6f' : '#f27a43', shadow: st.done ? '#2b8c4f' : '#b74b2b', size: 21, pulse: st.done });
      ui().fx.draw(ctx);
    }
  };

  /**
   * Vẽ 1 khung truyện: viền khung, cảnh nền + nhân vật (co giãn từ sân khấu 960×540), rồi lời dẫn và bong bóng.
   * 💡 Khái niệm: "sân khấu" ảo — dữ liệu truyện mô tả cảnh trên một sân khấu 960×540 giống hệt màn chơi
   *   (dùng chung drawBackground/drawPlatform/drawCharacter), rồi cả sân khấu được scale vào khung. Người soạn
   *   truyện không cần biết khung to bao nhiêu.
   * @param {CanvasRenderingContext2D} ctx
   * @param {PanelDef} pn  {bg, chars:[{id, anim, x, y?, face?, scale?}], bubbles:[{who, text}], caption?}
   * @param {UiRect} F  khung ngoài, px màn hình
   * @param {number} t  giây (hoạt ảnh)
   * @param {number} [appear=1]  0..1 tiến độ hiệu ứng xuất hiện (nhân vật nảy vào lần lượt)
   * @param {{reveal?:number[], speaking?:string|null, beats?:ComicBeat[]}} [state]  trạng thái hiện chữ; thiếu = hiện hết
   * @example
   *   var panels = OG.Journeys.getComic('home', OG.Journeys.get('home').intro);
   *   OG.Story.drawComicPanel(ctx, panels[0], { x: 24, y: 66, w: 912, h: 402 }, OG.time, 1);
   */
  function drawComicPanel(ctx, pn, F, t, appear, state) {
    if (!pn) return;
    appear = appear == null ? 1 : appear;
    var beats = (state && state.beats) || beatsOf(pn);
    var reveal = (state && state.reveal) || beats.map(function (b) { return b.text.length; });
    var speaking = state ? state.speaking : null;
    ui().drawFrame(ctx, F.x, F.y, F.w, F.h, '#ffffff', 18, { gloss: false, lineWidth: 5 });
    var IN = { x: F.x + 7, y: F.y + 7, w: F.w - 14, h: F.h - 14 };
    // Co giãn ĐỀU (không méo nhân vật): phủ kín khung, canh đáy (giữ mặt sàn), cắt bớt bầu trời.
    // Lấy max của hai tỉ lệ = kiểu "cover"; lấy min sẽ là "contain" (thừa viền trống hai bên).
    var s = Math.max(IN.w / OG.W, IN.h / OG.H);
    var visW = IN.w / s, visH = IN.h / s, ox = (OG.W - visW) / 2, oy = OG.H - visH;
    /** @type {PanelView} */
    var view = { s: s, visW: visW, visH: visH, ox: ox, oy: oy };
    ctx.save();
    U.roundRectPath(ctx, IN.x, IN.y, IN.w, IN.h, 13); ctx.clip();
    ctx.save();
    // Từ đây vẽ bằng toạ độ SÂN KHẤU: dời gốc về góc khung → scale → lùi phần bị cắt (ox, oy).
    ctx.translate(IN.x, IN.y); ctx.scale(s, s); ctx.translate(-ox, -oy);
    drawPanelBackground(ctx, pn.bg, t);
    var heads = drawPanelChars(ctx, pn, IN, view, t, appear, speaking);
    ctx.restore();
    // Chữ vẽ ở toạ độ MÀN HÌNH (sau restore) để cỡ chữ không bị scale theo khung.
    drawPanelText(ctx, beats, reveal, heads, IN, speaking);
    ctx.restore();
  }

  /**
   * Vẽ nền khung truyện (toạ độ sân khấu 960×540). bg: hàm vẽ | 'color:#hex' | tên theme | {theme, camX}.
   * @param {CanvasRenderingContext2D} ctx
   * @param {any} bg  PanelDef.bg
   * @param {number} t  giây
   */
  function drawPanelBackground(ctx, bg, t) {
    ui().guard(ctx, 'nền truyện', function () {
      if (typeof bg === 'function') bg(ctx, 0, 0, OG.W, OG.H, t);
      else if (typeof bg === 'string' && bg.indexOf('color:') === 0) { ctx.fillStyle = bg.slice(6); ctx.fillRect(0, 0, OG.W, OG.H); }
      else {
        var theme = (bg && bg.theme) || bg || 'kitchen';
        var camX = (bg && bg.camX) || 0;
        OG.Sprites.drawBackground(ctx, theme, camX, t);
        // Sàn vẽ ở toạ độ thế giới: dịch -camX để sàn phủ kín khung (sửa lỗi khoảng trống bên trái khi camX > 0).
        ctx.save(); ctx.translate(-camX, 0);
        OG.Sprites.drawPlatform(ctx, { x: camX, y: OG.FLOOR_Y, w: OG.W, h: 60, isFloor: true }, theme, t);
        ctx.restore();
      }
    });
  }

  /**
   * Vẽ nhân vật của khung (toạ độ sân khấu) và trả vị trí ĐỈNH ĐẦU từng nhân vật ở toạ độ MÀN HÌNH (để đặt bong bóng).
   * Nhân vật: x 0..1 theo bề ngang phần nhìn thấy; chân ở y (0..1 theo chiều cao, mặc định mặt sàn).
   * @param {CanvasRenderingContext2D} ctx
   * @param {PanelDef} pn
   * @param {UiRect} IN  vùng trong của khung, px màn hình
   * @param {PanelView} view
   * @param {number} t
   * @param {number} appear  0..1
   * @param {string|null} speaking  charId đang nói
   * @returns {Object<string, {x:number, y:number}>} charId → điểm đầu đuôi bong bóng
   */
  function drawPanelChars(ctx, pn, IN, view, t, appear, speaking) {
    var s = view.s, ox = view.ox, oy = view.oy;
    /** @type {Object<string, {x:number, y:number}>} */
    var heads = {};
    (pn.chars || []).forEach(function (c, ci) {
      if (!c || !c.id) return;
      var info = charInfo(c.id);
      // Mỗi nhân vật trễ 0,12 nhịp so với người trước → nảy vào lần lượt, không đồng loạt.
      var pop = ui().easeOutBack(U.clamp(appear * 1.3 - ci * 0.12, 0, 1));
      var sc = (c.scale || 1.8) * (0.7 + 0.3 * pop);
      var cx = ox + (c.x == null ? 0.5 : c.x) * view.visW, cy = c.y == null ? OG.FLOOR_Y : oy + c.y * view.visH;
      var anim = c.anim || 'idle';
      if (speaking === c.id && anim === 'idle') anim = 'talk';
      ctx.save();
      ctx.translate(cx, cy);
      if (speaking === c.id) ctx.translate(0, -Math.abs(Math.sin(t * 9)) * 3); // người đang nói nhún nhẹ
      drawChar(ctx, c.id, anim, t + ci * 0.37, { face: c.face || 1, scale: sc, w: info.w, h: info.h, time: t });
      ctx.restore();
      // Đổi toạ độ sân khấu → màn hình: màn hình = IN + (sân khấu − lệch cắt) × s.
      heads[c.id] = { x: IN.x + (cx - ox) * s, y: IN.y + (cy - info.h * sc - 10 - oy) * s };
    });
    return heads;
  }

  /**
   * Vẽ lời dẫn + bong bóng thoại (toạ độ màn hình, giới hạn trong khung), xếp tránh đè nhau.
   * @param {CanvasRenderingContext2D} ctx
   * @param {ComicBeat[]} beats
   * @param {number[]} reveal  số ký tự đang hiện của từng nhịp
   * @param {Object<string, {x:number, y:number}>} heads  từ drawPanelChars
   * @param {UiRect} IN
   * @param {string|null} speaking
   */
  function drawPanelText(ctx, beats, reveal, heads, IN, speaking) {
    var placed = [], narrTop = IN.y + 10;
    beats.forEach(function (b, bi) {
      var rv = reveal[bi] | 0;
      if (rv <= 0) return;
      // Lời dẫn: hộp vàng ở đáy khung, không đuôi.
      if (b.kind === 'caption') {
        var mc = ui().measureBubble(ctx, b.text, { maxW: Math.min(720, IN.w - 40), size: 20 });
        ui().drawBubble(ctx, IN.x + IN.w / 2, 0, b.text, { tail: 'none', boxX: IN.x + (IN.w - mc.w) / 2, boxY: IN.y + IN.h - mc.h - 10,
          maxW: Math.min(720, IN.w - 40), size: 20, bg: '#fff3c4', reveal: rv, bounds: IN, align: mc.lines.length === 1 ? 'center' : 'left' });
        return;
      }
      var h = heads[b.who];
      var name = b.who && b.who !== 'narrator' ? charName(b.who) : null;
      if (!h) { // người kể chuyện / nhân vật không có trong khung: hộp vàng phía trên, xếp chồng từ trên xuống
        var mn = ui().measureBubble(ctx, b.text, { maxW: Math.min(640, IN.w - 40), size: 20, name: name });
        var box0 = ui().drawBubble(ctx, 0, 0, b.text, { tail: 'none', boxX: IN.x + (IN.w - mn.w) / 2, boxY: narrTop + (name ? 12 : 0),
          maxW: Math.min(640, IN.w - 40), size: 20, bg: '#fff3c4', name: name, reveal: rv, bounds: IN });
        narrTop = box0.y + box0.h + 10;
        placed.push(box0);
        return;
      }
      /** @type {any} */
      var opts = { maxW: 330, size: 20, name: name, reveal: rv, bounds: IN, nameColor: speaking === b.who ? '#ed713c' : '#8a94a8' };
      var m = ui().measureBubble(ctx, b.text, opts);
      var bx = h.x - m.w / 2, by = h.y - 16 - m.h;
      // 💡 Khái niệm: bố trí tham lam (greedy layout) — so hộp mới với từng hộp đã đặt bằng phép giao AABB
      //   (có lề 8/14 px); chồng thì đẩy sang phía người nói nếu còn chỗ, hết chỗ thì đẩy lên trên.
      //   Không tối ưu toàn cục nhưng đủ tốt với 2–4 bong bóng mỗi khung.
      for (var k = 0; k < placed.length; k++) {
        var p = placed[k];
        if (bx < p.x + p.w + 8 && bx + m.w + 8 > p.x && by < p.y + p.h + 14 && by + m.h + 14 > p.y) {
          var right = p.x + p.w + 10, left = p.x - m.w - 10;
          if (h.x >= p.x + p.w / 2 && right + m.w < IN.x + IN.w - 6) bx = right;
          else if (h.x < p.x + p.w / 2 && left > IN.x + 6) bx = left;
          else by = p.y - m.h - 24;
        }
      }
      // Không cho bong bóng nhân vật đè lên các hộp lời kể ở trên cùng.
      opts.boxX = bx; opts.boxY = Math.max(by, narrTop + (name ? 14 : 0));
      placed.push(ui().drawBubble(ctx, h.x, h.y, b.text, opts));
    });
  }

  // ===========================================================================
  // card — thẻ kiến thức (push).  params: {journeyId, cardId, isNew, from:'level'|'notebook', onClose?}
  //   Đóng: Enter / Space / E / → / Esc / chạm (sau 0,35 giây). Nút 🔊 đọc to (khi trình duyệt có giọng tiếng Việt).
  //   Thẻ có ẢNH THẬT (OG.Photos): bố cục rộng hơn — chữ bên trái, ảnh kiểu polaroid bên phải, hình vẽ cartoon
  //   thu nhỏ thành "sticker" dán ở góc ảnh, dòng ghi công dưới ảnh. Ảnh lỗi → quay về bố cục cũ.
  //   Mở từ Sổ tay (from:'notebook'): ảnh lớn hơn; chạm vào ảnh / phím ↓ để phóng to toàn màn hình, chạm lần nữa để đóng.
  // ===========================================================================
  var CARD = { w: 660, h: 400 };
  // Bố cục thẻ có ảnh. photoW/photoH = kích thước phần ẢNH bên trong khung polaroid.
  var CARD_PHOTO = {
    level: { x: 40, y: 50, w: 880, h: 440, photoW: 372, photoH: 256 },
    notebook: { x: 16, y: 14, w: 928, h: 508, photoW: 430, photoH: 300 }
  };
  var POLA = { pad: 12, bottom: 46, r: 22 }; // viền trắng polaroid: lề 3 cạnh + dải dưới (chứa dòng ghi công)
  var ZOOM_BOX = { x: 24, y: 20, w: 912, h: 452 };

  /**
   * Vẽ khung ảnh polaroid: viền trắng dày, bo góc lớn, bóng mềm, hơi nghiêng cho dễ thương.
   * Ảnh chưa tải xong → vẽ shimmer; frame sau tự thấy ảnh (vòng lặp vẽ lại mỗi frame, không cần callback).
   * @param {CanvasRenderingContext2D} ctx
   * @param {any} P  khung ngoài {x, y, w, h}, px màn hình (UiRect; caller dựng dần nên để any)
   * @param {PhotoEntry} e  entry OG.Photos
   * @param {PhotoRecord} rec  {img, state}
   * @param {number} [tilt=0]  góc nghiêng, radian
   * @returns {UiRect} vùng ẢNH bên trong (để hit-test chạm phóng to)
   */
  function drawPolaroid(ctx, P, e, rec, tilt) {
    ctx.save();
    ctx.translate(P.x + P.w / 2, P.y + P.h / 2); ctx.rotate(tilt || 0); ctx.translate(-P.x - P.w / 2, -P.y - P.h / 2);
    // bóng mềm (shadowBlur) rồi mới vẽ khung trắng có viền mực.
    // ⚠️ Bẫy: shadow* áp cho MỌI lệnh vẽ sau đó → bọc trong save/restore riêng, nếu không ảnh và chữ cũng bị đổ bóng mờ.
    ctx.save();
    ctx.shadowColor = 'rgba(23,35,61,0.38)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 8;
    ctx.fillStyle = '#ffffff';
    U.roundRectPath(ctx, P.x, P.y, P.w, P.h, POLA.r); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = INK; ctx.lineWidth = 4;
    U.roundRectPath(ctx, P.x, P.y, P.w, P.h, POLA.r); ctx.stroke();
    // phần ảnh
    var ix = P.x + POLA.pad, iy = P.y + POLA.pad, iw = P.w - POLA.pad * 2, ih = P.h - POLA.pad - POLA.bottom;
    if (rec.state === 'ready') OG.Photos.drawCover(ctx, rec.img, ix, iy, iw, ih, 14, e.focus, e);
    else OG.Photos.drawShimmer(ctx, ix, iy, iw, ih, 14, OG.time);
    ctx.strokeStyle = 'rgba(23,35,61,0.25)'; ctx.lineWidth = 2;
    U.roundRectPath(ctx, ix, iy, iw, ih, 14); ctx.stroke();
    // dòng ghi công trong dải trắng phía dưới (cắt ngắn tên tác giả cho vừa)
    ctx.fillStyle = '#4a5670'; ctx.font = ui().font(13, '600'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // Giấy phép bắt buộc ghi công → không được bỏ dòng này; tràn thì cắt tên tác giả ngắn dần (bước 3 ký tự).
    var line = OG.Photos.creditLine(e, 28);
    for (var n = 24; ctx.measureText(line).width > iw && n > 6; n -= 3) line = OG.Photos.creditLine(e, n);
    ctx.fillText(line, P.x + P.w / 2, P.y + P.h - POLA.bottom / 2);
    ctx.restore();
    return { x: ix, y: iy, w: iw, h: ih };
  }

  // Hình vẽ cartoon của thẻ thu nhỏ thành sticker tròn dán ở góc ảnh.
  function drawSticker(ctx, c, cx, cy, r, color) {
    ctx.save();
    ctx.translate(cx, cy + Math.sin(OG.time * 2.4) * 3); ctx.rotate(-0.12 + Math.sin(OG.time * 1.7) * 0.04);
    ctx.save();
    ctx.shadowColor = 'rgba(23,35,61,0.3)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 4;
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = INK; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, r - 7, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, r - 7, 0, TAU); ctx.clip();
    OG.Learn.drawCardIcon(ctx, c, 0, 0, r * 1.5, OG.time);
    ctx.restore();
  }

  var card = {
    drawBelow: true,
    enter: function (params) {
      this.p = params || {}; this.t = 0;
      this.c = J().getCard(this.p.journeyId, this.p.cardId);
      this.area = this.c && J().getArea(this.p.journeyId, this.c.areaId);
      this.speakBtn = null;
      this.photoRect = null; this.zoom = false; this.zoomT = 0;
      // Bắt đầu tải ảnh thật ngay (nếu có) — trong lúc chờ, khung ảnh hiện shimmer.
      if (this.c && OG.Photos) OG.Photos.image(this.p.journeyId, this.c.id);
      hideChrome();
      if (this.c && this.p.isNew) {
        ui().fx.confetti(OG.W / 2, 150, 70, 2.8);
        ui().fx.firework(OG.W / 2 - 250, 120, 18);
        ui().fx.firework(OG.W / 2 + 250, 130, 18);
      }
    },
    exit: function (to) { ui().stopSpeak(); restoreChrome(to); },
    close: function () {
      var cb = this.p.onClose;
      OG.Scenes.pop();
      if (cb) cb();
    },
    // Ảnh của thẻ đang mở: {e, rec} hoặc null (không có ảnh / ảnh lỗi → dùng bố cục cũ).
    photo: function () {
      if (!this.c || !OG.Photos) return null;
      var e = OG.Photos.get(this.p.journeyId, this.c.id);
      var rec = e && OG.Photos.image(this.p.journeyId, this.c.id);
      return rec && rec.state !== 'error' ? { e: e, rec: rec } : null;
    },
    // Chỉ cho phóng to khi xem từ Sổ tay và ảnh đã tải xong.
    canZoom: function () {
      var ph = this.photo();
      return this.p.from === 'notebook' && !!ph && ph.rec.state === 'ready';
    },
    update: function (dt) {
      this.t += dt;
      ui().fx.update(dt);
      if (!this.c) { if (this.t > 0.1) this.close(); return; }
      // 💡 Khái niệm: trạng thái con (sub-state) trong scene — khi zoom = true, scene chỉ xử lý input của chế độ
      //   phóng to rồi return sớm; các nhánh bên dưới coi như không tồn tại (giống một FSM lồng nhau).
      // Đang phóng to: mọi cú chạm / phím chỉ đóng chế độ phóng to (không đóng thẻ).
      if (this.zoom) {
        this.zoomT += dt;
        if (this.zoomT > 0.12 && (tapped() || backPressed() || ui().advancePressed() || I().pressed('down'))) { this.zoom = false; }
        return;
      }
      // Khoá input 0,35 giây đầu: cú chạm/phím vừa nhặt trang sách không được đóng luôn thẻ vừa mở (hợp đồng STORY.md 6.5).
      if (this.t < 0.35) return;
      // Hit-test theo rect lưu ở frame vẽ TRƯỚC (draw chạy sau update) — chấp nhận lệch 1 frame, mắt không thấy.
      if (tapped() && this.speakBtn && ui().hit(this.speakBtn, pt().x, pt().y)) { ui().speak(this.c.title + '. ' + this.c.fact); return; }
      if (this.canZoom() && ((tapped() && ui().hit(this.photoRect, pt().x, pt().y)) || I().pressed('down'))) {
        this.zoom = true; this.zoomT = 0;
        OG.Events.emit('photo:zoom', { journeyId: this.p.journeyId, cardId: this.c.id });
        return;
      }
      if (backPressed() || ui().advancePressed() || tapped()) this.close();
    },
    draw: function (ctx) {
      ctx.fillStyle = 'rgba(12,19,34,0.66)'; ctx.fillRect(0, 0, OG.W, OG.H);
      var c = this.c;
      if (!c) return;
      var ph = this.photo();
      if (ph) this.drawWithPhoto(ctx, ph);
      else this.drawClassic(ctx);
      if (this.zoom && ph && ph.rec.state === 'ready') this.drawZoom(ctx, ph);
      ui().fx.draw(ctx);
    },
    // Hiệu ứng lật thẻ khi mở: co giãn ngang từ 0 → 1 quanh tâm thẻ.
    // 💡 Khái niệm: "giả 3D" bằng 2D — scale trục x từ ~0 lên 1 trông như tấm thẻ xoay quanh trục dọc;
    //   Math.max(0.02, k) tránh scale 0 (ma trận suy biến, một số trình duyệt bỏ không vẽ).
    flip: function (ctx, cy) {
      var k = ui().easeOutBack(Math.min(1, this.t / 0.42));
      ctx.translate(OG.W / 2, cy);
      ctx.scale(Math.max(0.02, k), 0.9 + 0.1 * Math.min(1, k));
      ctx.translate(-OG.W / 2, -cy);
    },
    // Nút 🔊 + nút đóng + ruy băng "THẺ MỚI" (dùng chung cho hai bố cục).
    drawButtons: function (ctx, tx, tw, by, ribbonX, ribbonY) {
      var bw = 230, btn = { x: tx + tw - bw, y: by, w: bw, h: 58 };
      ui().drawButton(ctx, btn, this.p.isNew ? 'Tuyệt vời! ▶' : 'Đóng ✓', { color: '#3fbf6f', shadow: '#2b8c4f', size: 22, pulse: this.t > 0.6 });
      this.speakBtn = null;
      if (ui().canSpeak()) {
        this.speakBtn = { x: tx, y: by, w: 58, h: 58 };
        ui().drawButton(ctx, this.speakBtn, '🔊', { color: '#52b9df', shadow: '#2582aa', size: 24 });
      }
      if (this.p.isNew) {
        ctx.save();
        ctx.translate(ribbonX, ribbonY);
        ctx.rotate(0.12);
        ui().drawButton(ctx, { x: -86, y: -24, w: 172, h: 44 }, 'THẺ MỚI! ✨', { color: '#ff5c8a', shadow: '#b8335e', size: 19 });
        ctx.restore();
      }
    },

    // ---- Bố cục cũ (không có ảnh thật): ô hình vẽ bên trái, chữ bên phải ----
    drawClassic: function (ctx) {
      var c = this.c, jid = this.p.journeyId, pal = ui().palette(jid);
      var x = (OG.W - CARD.w) / 2, y = 64, w = CARD.w, h = CARD.h;
      this.photoRect = null;
      ctx.save();
      this.flip(ctx, y + h / 2);
      ui().drawFrame(ctx, x, y, w, h, '#fffaf0', 24, { lineWidth: 5 });
      // Ô hình bên trái
      var ax = x + 18, ay = y + 18, aw = 236, ah = h - 36;
      ctx.save();
      ctx.fillStyle = ui().shade(pal.primary, 0.55);
      U.roundRectPath(ctx, ax, ay, aw, ah, 18); ctx.fill();
      U.roundRectPath(ctx, ax, ay, aw, ah, 18); ctx.clip();
      ui().drawRays(ctx, ax + aw / 2, ay + ah * 0.42, 260, OG.time, this.p.isNew ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.25)', 14);
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = INK; ctx.lineWidth = 3.5;
      U.roundRectPath(ctx, ax, ay, aw, ah, 18); ctx.stroke();
      ctx.restore();
      var bob = Math.sin(OG.time * 2.4) * 5;
      OG.Learn.drawCardIcon(ctx, c, ax + aw / 2, ay + ah * 0.42 + bob, 170, OG.time);
      // nhãn khu
      if (this.area) {
        ctx.save();
        ctx.font = ui().font(17);
        var lab = (this.area.emoji || '📍') + ' ' + this.area.name, lw = Math.min(aw - 20, ctx.measureText(lab).width + 26);
        ctx.fillStyle = pal.primary; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
        U.roundRectPath(ctx, ax + (aw - lw) / 2, ay + ah - 52, lw, 36, 18); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(lab, ax + aw / 2, ay + ah - 33);
        ctx.restore();
      }
      // Chữ bên phải
      var tx = ax + aw + 26, tw = x + w - tx - 24, ty = y + 34;
      ctx.save();
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillStyle = ui().shade(pal.primary, -0.15); ctx.font = ui().font(32, '900');
      var tl = ui().wrap(ctx, c.title, tw).slice(0, 2);
      tl.forEach(function (l, i) { ctx.fillText(l, tx, ty + i * 38); });
      ty += tl.length * 38 + 10;
      ctx.fillStyle = INK; ctx.font = ui().font(22, '600');
      ui().wrap(ctx, c.fact, tw).slice(0, 6).forEach(function (l, i) { ctx.fillText(l, tx, ty + i * 30); });
      var cnt = OG.Learn.count(jid);
      ctx.fillStyle = 'rgba(23,35,61,0.55)'; ctx.font = ui().font(15);
      ctx.fillText('📒 Sổ tay: ' + cnt.have + '/' + cnt.total + ' thẻ', tx, y + h - 112);
      ctx.restore();
      this.drawButtons(ctx, tx, tw, y + h - 80, x + w - 70, y + 6);
      ctx.restore();
    },

    // ---- Bố cục có ảnh thật: chữ bên trái, polaroid bên phải, sticker hình vẽ ở góc ảnh ----
    drawWithPhoto: function (ctx, ph) {
      var c = this.c, jid = this.p.journeyId, pal = ui().palette(jid);
      var L = this.p.from === 'notebook' ? CARD_PHOTO.notebook : CARD_PHOTO.level;
      var x = L.x, y = L.y, w = L.w, h = L.h;
      // Khung polaroid (ngoài) căn phải, căn giữa theo chiều dọc (nhích lên một chút chừa chỗ cho gợi ý).
      var P = { w: L.photoW + POLA.pad * 2, h: L.photoH + POLA.pad + POLA.bottom };
      P.x = x + w - 28 - P.w; P.y = y + (h - P.h) / 2 - 12;
      ctx.save();
      this.flip(ctx, y + h / 2);
      ui().drawFrame(ctx, x, y, w, h, '#fffaf0', 26, { lineWidth: 5 });
      // nền nhạt sau ảnh có tia sáng (giữ "chất" thẻ kiến thức cũ)
      ctx.save();
      U.roundRectPath(ctx, P.x - 14, y + 16, w - (P.x - x) + 14 - 16, h - 32, 20); ctx.clip();
      ctx.fillStyle = ui().shade(pal.primary, 0.7); ctx.fillRect(P.x - 14, y, w, h);
      ui().drawRays(ctx, P.x + P.w / 2, P.y + P.h / 2, 340, OG.time, this.p.isNew ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.3)', 14);
      ctx.restore();
      var inner = drawPolaroid(ctx, P, ph.e, ph.rec, -0.025);
      this.photoRect = inner;
      drawSticker(ctx, c, P.x + 8, P.y + 8, this.p.from === 'notebook' ? 56 : 50, ui().shade(pal.primary, 0.45));
      // gợi ý phóng to (chỉ trong Sổ tay, khi ảnh đã tải)
      if (this.canZoom()) {
        ctx.save();
        ctx.fillStyle = INK; ctx.font = ui().font(15); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.globalAlpha *= 0.75;
        ctx.fillText(isTouch() ? '🔍 Chạm vào ảnh để phóng to' : '🔍 Bấm vào ảnh hoặc nhấn ↓ để phóng to', P.x + P.w / 2, P.y + P.h + 20);
        ctx.restore();
      }
      // Cột chữ bên trái
      var tx = x + 30, tw = P.x - 14 - 26 - tx, ty = y + 26;
      ctx.save();
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      if (this.area) { // nhãn khu nhỏ ở trên tiêu đề
        ctx.font = ui().font(16);
        var lab = (this.area.emoji || '📍') + ' ' + this.area.name, lw = Math.min(tw, ctx.measureText(lab).width + 26);
        ctx.fillStyle = pal.primary; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
        U.roundRectPath(ctx, tx, ty, lw, 34, 17); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffffff'; ctx.textBaseline = 'middle';
        ctx.fillText(lab, tx + 13, ty + 18);
        ctx.textBaseline = 'top';
        ty += 46;
      }
      ctx.fillStyle = ui().shade(pal.primary, -0.15); ctx.font = ui().font(32, '900');
      var tl = ui().wrap(ctx, c.title, tw).slice(0, 2);
      tl.forEach(function (l, i) { ctx.fillText(l, tx, ty + i * 38); });
      ty += tl.length * 38 + 8;
      // Số dòng tối đa để chữ không đè lên dòng "Sổ tay" và hàng nút ở đáy thẻ.
      var maxLines = Math.max(2, Math.floor((y + h - 118 - ty) / 29));
      ctx.fillStyle = INK; ctx.font = ui().font(21, '600');
      ui().wrap(ctx, c.fact, tw).slice(0, maxLines).forEach(function (l, i) { ctx.fillText(l, tx, ty + i * 29); });
      var cnt = OG.Learn.count(jid);
      ctx.fillStyle = 'rgba(23,35,61,0.55)'; ctx.font = ui().font(15);
      ctx.fillText('📒 Sổ tay: ' + cnt.have + '/' + cnt.total + ' thẻ', tx, y + h - 108);
      ctx.restore();
      this.drawButtons(ctx, tx, tw, y + h - 80, x + w - 80, y + 8);
      ctx.restore();
    },

    // ---- Ảnh phóng to toàn màn hình (Sổ tay) ----
    drawZoom: function (ctx, ph) {
      var k = ui().easeOutBack(Math.min(1, this.zoomT / 0.28)), B = ZOOM_BOX;
      ctx.save();
      ctx.globalAlpha *= Math.min(1, this.zoomT / 0.15);
      ctx.fillStyle = 'rgba(8,12,22,0.93)'; ctx.fillRect(0, 0, OG.W, OG.H);
      ctx.translate(OG.W / 2, B.y + B.h / 2); ctx.scale(0.85 + 0.15 * k, 0.85 + 0.15 * k); ctx.translate(-OG.W / 2, -(B.y + B.h / 2));
      var R = OG.Photos.drawContain(ctx, ph.rec.img, B.x, B.y, B.w, B.h, 16, ph.e);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4;
      U.roundRectPath(ctx, R.x, R.y, R.w, R.h, 16); ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = ui().font(16, '600');
      var line = OG.Photos.creditLine(ph.e, 60);
      for (var n = 54; ctx.measureText(line).width > OG.W - 60 && n > 8; n -= 4) line = OG.Photos.creditLine(ph.e, n);
      ctx.fillText(line, OG.W / 2, 494);
      ctx.font = ui().font(14); ctx.globalAlpha *= 0.75;
      ctx.fillText((ph.e.note ? ph.e.note + ' · ' : '') + (isTouch() ? 'Chạm để đóng ✕' : 'Bấm vào ảnh hoặc nhấn Enter / Esc để đóng ✕'), OG.W / 2, 520);
      ctx.restore();
    }
  };

  // ===========================================================================
  // quiz — câu đố mở cửa (push).  params: {journeyId, quizId, levelId, gateId, onPass?, onClose?}
  //   Lựa chọn bắt đầu ở 0; ←/→/↑/↓ đổi; Enter/Space/E chọn; chạm vào đáp án.
  //   Sai: lắc nhẹ + gạch lựa chọn + gợi ý thân thiện, ở lại thử tiếp (KHÔNG phạt).
  //   Đúng: pháo hoa + lời giải thích → Enter/chạm để đi tiếp (pop + onPass).
  //   Esc / nút "Để sau": đóng, cổng vẫn khoá (onClose).
  // ===========================================================================
  var QF = { x: 30, y: 14, w: 900, h: 512 };

  /**
   * Vẽ một ô đáp án của câu đố: nảy vào lần lượt, rung khi sai, phóng to + tia sáng khi đúng.
   * 💡 Khái niệm: trạng thái hiển thị suy ra từ dữ liệu (right/bad/sel) thay vì lưu "màu hiện tại" của ô —
   *   chỉ cần đổi self.wrong / self.passed / self.sel là frame sau ô tự vẽ đúng.
   * @param {CanvasRenderingContext2D} ctx
   * @param {any} self  scene quiz (đọc passed, wrong, sel, t, shakeT)
   * @param {QuizDef} q
   * @param {number} i  chỉ số đáp án
   * @param {UiRect} R  vị trí ô, px màn hình (trước khi scale)
   * @param {{primary:string}} pal  bảng màu hành trình
   */
  function drawQuizChoice(ctx, self, q, i, R, pal) {
    var n = q.choices.length, opt = q.choices[i];
    var right = self.passed && i === q.answer, bad = self.wrong[i], sel = i === self.sel && !self.passed;
    // Ô thứ i trễ 0,25 nhịp so với ô trước → hiệu ứng nảy lần lượt từ trái sang phải.
    var pop = ui().easeOutBack(U.clamp(self.t * 3 - i * 0.25, 0, 1));
    ctx.save();
    var sx = ui().shake(self.shakeT[i], 0.45, 12);
    var sc = (sel ? 1.04 + Math.sin(OG.time * 5) * 0.015 : 1) * (0.6 + 0.4 * pop) * (right ? 1.06 : 1);
    // Scale quanh tâm ô rồi dời gốc về góc trên-trái ô → phần vẽ bên dưới dùng toạ độ CỤC BỘ (0..R.w, 0..R.h).
    ctx.translate(R.x + R.w / 2 + sx, R.y + R.h / 2);
    ctx.scale(sc, sc);
    ctx.translate(-R.w / 2, -R.h / 2);
    ctx.globalAlpha = bad ? 0.5 : self.passed && !right ? 0.45 : 1;
    if (right) ui().drawRays(ctx, R.w / 2, R.h / 2, 190, OG.time, 'rgba(255,214,90,0.5)', 12);
    ui().drawFrame(ctx, 0, 0, R.w, R.h, right ? '#c9f2d4' : bad ? '#e3e7ee' : sel ? '#fff1c1' : '#ffffff', 20, { lineWidth: sel || right ? 5 : 4, border: right ? '#2b8c4f' : sel ? pal.primary : INK });
    OG.Learn.drawIcon(ctx, opt.drawIcon || opt.icon, R.w / 2, 82, 116, OG.time);
    ctx.fillStyle = INK; ctx.font = ui().font(n === 2 ? 23 : 21); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ui().wrap(ctx, opt.text, R.w - 24).slice(0, 2).forEach(function (l, li) { ctx.fillText(l, R.w / 2, 150 + li * 26); });
    // Số thứ tự (khớp phím tắt 1–3)
    ctx.fillStyle = sel ? pal.primary : '#52b9df'; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(10, 10, 19, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.font = ui().font(19); ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), 10, 11);
    if (bad) { // gạch chéo đỏ
      ctx.strokeStyle = '#e5484d'; ctx.lineWidth = 9; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(R.w * 0.25, R.h * 0.22); ctx.lineTo(R.w * 0.75, R.h * 0.72);
      ctx.moveTo(R.w * 0.75, R.h * 0.22); ctx.lineTo(R.w * 0.25, R.h * 0.72); ctx.stroke();
    }
    if (right) { // dấu tích xanh
      ctx.fillStyle = '#3fbf6f'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(R.w - 12, 12, 24, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(R.w - 24, 12); ctx.lineTo(R.w - 15, 21); ctx.lineTo(R.w + 1, 3); ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Vẽ dòng dưới của câu đố: gợi ý (sai) / lời giải thích + nút "Đi tiếp" (đúng) / hướng dẫn (chưa chọn).
   * Ghi self.nextBtn (rect nút "Đi tiếp" hoặc null).
   * @param {CanvasRenderingContext2D} ctx
   * @param {any} self  scene quiz
   * @param {UiRect} F  khung câu đố
   * @param {{charId:string, name:string}} g  người dẫn đường
   */
  function drawQuizFooter(ctx, self, F, g) {
    var by = F.y + F.h - 112;
    self.nextBtn = null;
    if (self.msg) {
      var text = (self.passed ? (self.firstTry ? '🎉 ' : '👍 ') : '💡 ') + self.msg + (self.unlocked ? '\n📒 Mở khoá thẻ: ' + self.unlocked.title : '');
      if (OG.Sprites.drawPortrait) {
        var passed = self.passed;
        ui().guard(ctx, 'chân dung gợi ý', function () {
          OG.Sprites.drawPortrait(ctx, g.charId, F.x + 58, by + 54, 70, { t: OG.time, state: passed ? 'victory' : 'think', bg: passed ? '#e2f8e8' : '#ffffff' });
        });
      }
      // Lời giải thích dài (+ dòng "Mở khoá thẻ") có thể tới 3–4 dòng → thu nhỏ chữ cho vừa,
      // và kẹp bong bóng trong khung câu đố (bounds) để không tràn qua viền dưới.
      var bOpts = {
        tail: 'none', anchor: 'left', maxW: self.passed ? F.w - 360 : F.w - 140, size: 20,
        bg: self.passed ? '#e2f8e8' : '#fff9e0', reveal: Math.floor(self.msgT * 70),
        bounds: { x: F.x, y: F.y, w: F.w, h: F.h - 4 } };
      if (ui().measureBubble(ctx, text, bOpts).h > F.y + F.h - by - 24) bOpts.size = 17;
      ui().drawBubble(ctx, F.x + 102, by + 14, text, bOpts);
      if (self.passed) {
        self.nextBtn = { x: F.x + F.w - 214, y: F.y + F.h - 84, w: 192, h: 62 };
        ui().drawButton(ctx, self.nextBtn, 'Đi tiếp ▶', { color: '#3fbf6f', shadow: '#2b8c4f', size: 24, pulse: self.t > 0.4 });
      }
    } else {
      ctx.save();
      ctx.fillStyle = 'rgba(23,35,61,0.65)'; ctx.font = ui().font(18); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(isTouch() ? '👆 Chạm vào đáp án em chọn nhé!' : '⬅ ➡ chọn đáp án, rồi nhấn Enter  ·  Esc: để sau', OG.W / 2, F.y + F.h - 50);
      ctx.restore();
    }
  }
  var quiz = {
    drawBelow: true,
    enter: function (params) {
      this.p = params || {};
      this.q = J().getQuiz(this.p.journeyId, this.p.quizId);
      this.sel = 0; this.t = 0; this.msgT = 0; this.attempt = 0;
      this.wrong = {}; this.shakeT = {}; this.msg = null; this.passed = false; this.unlocked = null;
      this.rects = []; this.laterBtn = null; this.speakBtn = null; this.nextBtn = null;
      hideChrome();
    },
    exit: function (to) { ui().stopSpeak(); restoreChrome(to); },
    choose: function (i) {
      if (this.passed || this.wrong[i]) return;
      this.attempt++;
      var r = OG.Learn.answerQuiz(this.p.journeyId, this.p.quizId, i, { levelId: this.p.levelId, gateId: this.p.gateId, attempt: this.attempt });
      this.msgT = 0;
      if (r.correct) {
        this.passed = true; this.t = 0;
        this.msg = r.explain; this.firstTry = r.firstTry;
        this.unlocked = r.cardUnlocked ? J().getCard(this.p.journeyId, r.cardUnlocked) : null;
        var R = this.rects[i];
        if (R) { ui().fx.firework(R.x + R.w / 2, R.y + R.h / 2, 26); ui().fx.confetti(R.x + R.w / 2, R.y, 50); }
        ui().fx.firework(QF.x + 120, QF.y + 90, 20, '#ffc94a');
        ui().fx.firework(QF.x + QF.w - 120, QF.y + 110, 20, '#52c5ee');
      } else {
        this.wrong[i] = true; this.shakeT[i] = 0; // ô chọn giữ nguyên (hợp đồng phím của smoke test)
        var left = this.q.choices.length - Object.keys(this.wrong).length;
        this.msg = r.hint + (left === 1 ? ' Còn một đáp án nữa thôi!' : '');
      }
    },
    finishPass: function () { var cb = this.p.onPass; OG.Scenes.pop(); if (cb) cb(); },
    later: function () { var cc = this.p.onClose; OG.Scenes.pop(); if (cc) cc(); },
    update: function (dt) {
      this.t += dt; this.msgT += dt;
      for (var s in this.shakeT) this.shakeT[s] += dt;
      ui().fx.update(dt);
      if (!this.q) { this.later(); return; }
      var n = this.q.choices.length, inp = I();
      var px = pt().x, py = pt().y, tap = tapped();
      if (tap && this.speakBtn && ui().hit(this.speakBtn, px, py)) {
        ui().speak(this.passed ? this.msg : this.q.question + ' ' + this.q.choices.map(function (c) { return c.text; }).join(', '));
        return;
      }
      if (this.passed) {
        if (this.t > 0.4 && (ui().advancePressed() || tap || backPressed())) this.finishPass();
        return;
      }
      if (backPressed() || (tap && this.laterBtn && ui().hit(this.laterBtn, px, py))) { this.later(); return; }
      if (inp.pressed('left') || inp.pressed('up')) this.sel = (this.sel + n - 1) % n;
      else if (inp.pressed('right') || inp.pressed('down')) this.sel = (this.sel + 1) % n;
      if (selectPressed()) this.choose(this.sel);
      // Phím số 1–3 chọn thẳng đáp án.
      for (var d = 0; d < Math.min(3, n); d++) if (inp.pressed('num' + (d + 1))) { this.sel = d; this.choose(d); break; }
      if (tap) {
        for (var i = 0; i < this.rects.length; i++) if (ui().hit(this.rects[i], px, py)) { this.sel = i; this.choose(i); break; }
      }
    },
    draw: function (ctx) {
      ctx.fillStyle = 'rgba(12,19,34,0.62)'; ctx.fillRect(0, 0, OG.W, OG.H);
      var q = this.q;
      if (!q) return;
      var jid = this.p.journeyId, pal = ui().palette(jid), g = OG.Guide.guideOf(jid);
      var F = QF, k = ui().easeOutBack(Math.min(1, this.t / 0.35));
      if (this.passed) k = 1;
      ctx.save();
      ctx.translate(OG.W / 2, OG.H / 2); ctx.scale(0.85 + 0.15 * k, 0.85 + 0.15 * k); ctx.translate(-OG.W / 2, -OG.H / 2);
      ui().drawFrame(ctx, F.x, F.y, F.w, F.h, '#fff6df', 26, { lineWidth: 5 });
      // Nhãn + nút "Để sau" + đọc to
      ctx.save();
      ctx.font = ui().font(17); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      var lab = '❓ CÂU ĐỐ MỞ CỬA', lw = ctx.measureText(lab).width + 30;
      ctx.fillStyle = '#7b6cf0'; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
      U.roundRectPath(ctx, F.x + 22, F.y + 16, lw, 36, 18); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.fillText(lab, F.x + 37, F.y + 35);
      ctx.restore();
      this.laterBtn = null;
      if (!this.passed) {
        this.laterBtn = { x: F.x + F.w - 162, y: F.y + 12, w: 146, h: 52 };
        ui().drawButton(ctx, this.laterBtn, 'Để sau ✕', { color: '#52b9df', shadow: '#2582aa', size: 18 });
      }
      this.speakBtn = null;
      if (ui().canSpeak()) {
        this.speakBtn = { x: F.x + F.w - (this.passed ? 78 : 228), y: F.y + 12, w: 56, h: 52 };
        ui().drawButton(ctx, this.speakBtn, '🔊', { color: '#ffc94a', shadow: '#c48f1f', text: INK, size: 22 });
      }
      // Người dẫn đường hỏi
      var think = this.msg && !this.passed;
      if (OG.Sprites.drawPortrait) {
        ui().guard(ctx, 'chân dung câu đố', function () {
          OG.Sprites.drawPortrait(ctx, g.charId, F.x + 70, F.y + 118, 90, { t: OG.time, state: think ? 'think' : 'talk', bg: '#ffffff' });
        });
      }
      ui().drawBubble(ctx, F.x + 128, F.y + 82, q.question, {
        tail: 'none', anchor: 'left', maxW: F.w - 170, minW: 300, size: 27, name: g.name, nameColor: pal.primary,
        reveal: Math.floor(this.t * 60) });
      // Các lựa chọn: lưu rect từng ô vào this.rects để update() hit-test (cùng rect với lúc vẽ).
      var n = q.choices.length, cw = n === 2 ? 290 : 250, gap = n === 2 ? 50 : 30, ch = 214;
      var x0 = OG.W / 2 - (n * cw + (n - 1) * gap) / 2, cy = F.y + 172;
      this.rects = [];
      for (var i = 0; i < n; i++) {
        var R = { x: x0 + i * (cw + gap), y: cy, w: cw, h: ch };
        this.rects.push(R);
        drawQuizChoice(ctx, this, q, i, R, pal);
      }
      drawQuizFooter(ctx, this, F, g);
      ctx.restore();
      ui().fx.draw(ctx);
    }
  };

  // ===========================================================================
  // notebook — Sổ tay khám phá.  params: {journeyId, back, backParams}
  //   Thẻ chia theo khu (thẻ chưa có = bóng mờ "?"). ←/→/↑/↓ chọn, Enter mở thẻ đã có (push card),
  //   Esc / nút ↩ = về back. Chạm: tab khu, thẻ (mở luôn). Thẻ có ảnh thật (OG.Photos) → ảnh làm thumbnail.
  // ===========================================================================
  /**
   * Vẽ hàng tab khu của Sổ tay (mỗi tab: tên khu + số thẻ đã có). Ghi self.tabRects để update() hit-test.
   * @param {CanvasRenderingContext2D} ctx
   * @param {any} self  scene notebook (đọc groups, list)
   * @param {number} gi  chỉ số khu đang chọn
   * @param {{primary:string}} pal
   */
  function drawNotebookTabs(ctx, self, gi, pal) {
    // Bề rộng tab chia đều theo số khu, tối đa 176 px; cả hàng căn giữa màn hình.
    var m = self.groups.length, tw = Math.min(176, (NB.w - 70 - (m - 1) * 8) / m), tx0 = OG.W / 2 - (m * tw + (m - 1) * 8) / 2;
    self.tabRects = [];
    for (var g = 0; g < m; g++) {
      var G = self.groups[g], R = { x: tx0 + g * (tw + 8), y: 92, w: tw, h: 50 }, on = g === gi;
      self.tabRects.push(R);
      var have = 0;
      G.items.forEach(function (ix) { if (this.list[ix].unlocked) have++; }, self);
      ctx.save();
      ctx.fillStyle = on ? pal.primary : '#ffffff'; ctx.strokeStyle = INK; ctx.lineWidth = on ? 3.5 : 2.5;
      U.roundRectPath(ctx, R.x, R.y + (on ? 0 : 4), R.w, R.h - (on ? 0 : 4), 14); ctx.fill(); ctx.stroke();
      ctx.fillStyle = on ? '#ffffff' : INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      var full = have === G.items.length;
      var label = (G.area.emoji || '📍') + ' ' + G.area.name;
      ctx.font = ui().font(tw < 130 ? 14 : 16);
      if (ctx.measureText(label).width > R.w - 12) label = G.area.emoji || G.area.name;
      ctx.fillText(label, R.x + R.w / 2, R.y + 18 + (on ? 0 : 2));
      ctx.font = ui().font(12); ctx.globalAlpha = 0.85;
      ctx.fillText((full ? '✅ ' : '') + have + '/' + G.items.length, R.x + R.w / 2, R.y + 37 + (on ? 0 : 2));
      ctx.restore();
    }
  }

  /**
   * Vẽ thanh thông tin dưới đáy Sổ tay: tên thẻ đang chọn, hoặc gợi ý NƠI tìm thẻ chưa có (OG.Learn.whereIs).
   * @param {CanvasRenderingContext2D} ctx
   * @param {{card: CardDef, unlocked: boolean}} cur  ô đang chọn
   * @param {string} jid
   */
  function drawNotebookInfo(ctx, cur, jid) {
    var info;
    if (cur.unlocked) info = '⭐ ' + cur.card.title + (isTouch() ? ' — chạm để xem' : ' — nhấn Enter để xem');
    else {
      var w = OG.Learn.whereIs(jid, cur.card.id);
      info = !w ? '🔎 Thẻ bí mật! Hãy khám phá thêm nhé!'
        : w.kind === 'quiz' ? '❓ Trả lời đúng câu đố' + (w.levelName ? ' ở màn “' + w.levelName + '”' : '') + ' để mở thẻ này!'
          : w.kind === 'guide' ? '💬 Trò chuyện với người dẫn đường ở màn “' + w.levelName + '” nhé!'
            : '🔎 Tìm trang sách ở màn “' + w.levelName + '” nhé!';
    }
    ctx.save();
    ctx.fillStyle = cur.unlocked ? '#e2f8e8' : '#fff3c4'; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
    U.roundRectPath(ctx, 120, 482, OG.W - 240, 38, 19); ctx.fill(); ctx.stroke();
    ctx.fillStyle = INK; ctx.font = ui().font(17); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var shown = info;
    while (ctx.measureText(shown).width > OG.W - 270 && shown.length > 10) shown = shown.slice(0, -2);
    ctx.fillText(shown === info ? info : shown + '…', OG.W / 2, 502);
    ctx.restore();
  }

  var NB = { x: 12, y: 8, w: 936, h: 524 };
  var NB_BACK = { x: 30, y: 22, w: 66, h: 56 };
  // Lưới thẻ: COLS cột × ROWS hàng nhìn thấy; ô CW×CH px, khe GX/GY px; GRID_Y = mép trên lưới (px màn hình).
  var COLS = 5, CW = 158, CH = 148, GX = 18, GY = 16, GRID_Y = 160, ROWS = 2;
  var notebook = {
    enter: function (params) {
      this.p = params || {};
      this.jid = this.p.journeyId || OG.Story.current() || OG.Story.lastJourney();
      this.t = 0; this.shakeI = -1; this.shakeT = 9; this.scroll = 0;
      this.rects = []; this.tabRects = [];
      OG.DOM.hidePanel();
      hideChrome();
      ui().fx.clear();
      this.build();
      var first = 0;
      for (var i = 0; i < this.list.length; i++) if (this.list[i].unlocked) { first = i; break; }
      this.sel = first;
      var c = OG.Learn.count(this.jid);
      if (c.total && c.have === c.total) ui().fx.confetti(OG.W / 2, 120, 60);
    },
    // Gom thẻ theo khu: this.groups = [{area, items:[index trong list]}], this.list = [{card, unlocked, g}]
    // Một mảng phẳng `list` (←/→ duyệt hết mọi thẻ) + chỉ mục theo nhóm `groups` (tab, ↑/↓ theo hàng trong khu).
    // Thẻ không thuộc khu nào gom vào nhóm "Khác" để không thẻ nào bị ẩn mất.
    build: function () {
      var jid = this.jid, j = J().get(jid) || { areas: [] }, list = [], groups = [];
      var used = {};
      (j.areas || []).forEach(function (a) {
        var items = OG.Learn.listCards(jid, a.id);
        if (!items.length) return;
        var grp = { area: a, items: [] };
        items.forEach(function (it) { used[it.card.id] = true; grp.items.push(list.length); list.push({ card: it.card, unlocked: it.unlocked, g: groups.length }); });
        groups.push(grp);
      });
      var rest = OG.Learn.listCards(jid).filter(function (it) { return !used[it.card.id]; });
      if (rest.length) {
        var grp = { area: { id: null, name: 'Khác', emoji: '✨' }, items: [] };
        rest.forEach(function (it) { grp.items.push(list.length); list.push({ card: it.card, unlocked: it.unlocked, g: groups.length }); });
        groups.push(grp);
      }
      this.list = list; this.groups = groups;
    },
    // resume() chạy khi scene 'card' pop về: dựng lại danh sách vì trạng thái mở khoá có thể vừa đổi.
    resume: function () { hideChrome(); this.build(); },
    goBack: function () { OG.Scenes.go(this.p.back || 'journeyMap', this.p.backParams || { journeyId: this.jid }); },
    open: function (i) {
      var it = this.list[i];
      if (!it) return;
      if (it.unlocked) OG.Learn.openCard(this.jid, it.card.id, { from: 'notebook' });
      else { this.shakeI = i; this.shakeT = 0; } // thẻ khoá: lắc nhẹ thay vì báo lỗi (phản hồi thân thiện cho bé)
    },
    // Di chuyển lên/xuống theo hàng trong khu; ra khỏi khu thì sang khu trước/sau (giữ cột).
    moveRow: function (d) {
      var it = this.list[this.sel], grp = this.groups[it.g], pos = grp.items.indexOf(this.sel);
      var col = pos % COLS, np = pos + d * COLS;
      if (np >= 0 && np < grp.items.length) { this.sel = grp.items[np]; return; }
      if (d > 0 && Math.floor(pos / COLS) < Math.floor((grp.items.length - 1) / COLS)) { this.sel = grp.items[grp.items.length - 1]; return; }
      var ng = this.groups[it.g + d];
      if (!ng) return;
      var rows = Math.floor((ng.items.length - 1) / COLS);
      var tp = d > 0 ? col : rows * COLS + col;
      this.sel = ng.items[Math.min(tp, ng.items.length - 1)];
    },
    update: function (dt) {
      this.t += dt; this.shakeT += dt;
      ui().fx.update(dt);
      var n = this.list.length, inp = I();
      if (backPressed()) { this.goBack(); return; }
      var tap = tapped(), px = pt().x, py = pt().y;
      if (tap && ui().hit(NB_BACK, px, py)) { this.goBack(); return; }
      if (!n) return;
      if (inp.pressed('left')) this.sel = (this.sel + n - 1) % n;
      else if (inp.pressed('right')) this.sel = (this.sel + 1) % n;
      else if (inp.pressed('up')) this.moveRow(-1);
      else if (inp.pressed('down')) this.moveRow(1);
      if (selectPressed()) this.open(this.sel);
      if (tap) {
        for (var g = 0; g < this.tabRects.length; g++) if (ui().hit(this.tabRects[g], px, py)) { this.sel = this.groups[g].items[0]; return; }
        for (var i = 0; i < this.rects.length; i++) if (this.rects[i] && ui().hit(this.rects[i], px, py)) { this.sel = i; this.open(i); return; }
      }
    },
    draw: function (ctx) {
      var jid = this.jid, j = J().get(jid) || {}, pal = ui().palette(jid);
      backdrop(ctx, firstTheme(jid), 0.45);
      // Bìa sổ + trang giấy
      ui().drawFrame(ctx, NB.x, NB.y, NB.w, NB.h, pal.primary, 26, { lineWidth: 5 });
      ctx.save();
      ctx.fillStyle = '#fffaf0'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
      U.roundRectPath(ctx, NB.x + 12, NB.y + 10, NB.w - 24, NB.h - 20, 18); ctx.fill(); ctx.stroke();
      // dòng kẻ giấy mờ
      ctx.strokeStyle = 'rgba(82,185,223,0.14)'; ctx.lineWidth = 2;
      for (var ly = NB.y + 96; ly < NB.y + NB.h - 20; ly += 28) { ctx.beginPath(); ctx.moveTo(NB.x + 24, ly); ctx.lineTo(NB.x + NB.w - 24, ly); ctx.stroke(); }
      ctx.restore();
      ui().drawButton(ctx, NB_BACK, '↩', { color: '#52b9df', shadow: '#2582aa', size: 28 });
      // Tiêu đề + tiến độ
      var c = OG.Learn.count(jid);
      ctx.save();
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = ui().shade(pal.primary, -0.2); ctx.font = ui().font(28, '900');
      ctx.fillText('📒 Sổ tay khám phá', 112, 40);
      ctx.fillStyle = INK; ctx.font = ui().font(16);
      ctx.fillText((j.emoji || '') + ' ' + (j.title || ''), 114, 70);
      ctx.restore();
      ui().drawBar(ctx, 650, 30, 200, 22, c.total ? c.have / c.total : 0, '#3fbf6f');
      ctx.save();
      ctx.fillStyle = INK; ctx.font = ui().font(18); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(c.have + '/' + c.total, 860, 42);
      ctx.font = ui().font(14); ctx.fillStyle = 'rgba(23,35,61,0.6)'; ctx.textAlign = 'center';
      ctx.fillText(c.total && c.have === c.total ? '🏆 Đủ bộ sưu tập!' : 'thẻ đã sưu tầm', 750, 68);
      ctx.restore();
      if (!this.list.length) {
        ctx.save();
        ctx.fillStyle = INK; ctx.font = ui().font(22); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('Chưa có thẻ nào trong hành trình này.', OG.W / 2, OG.H / 2);
        ctx.restore();
        return;
      }
      var cur = this.list[this.sel] || this.list[0], gi = cur.g, grp = this.groups[gi];
      // Tab khu
      drawNotebookTabs(ctx, this, gi, pal);
      // Lưới thẻ của khu đang chọn
      // 💡 Khái niệm: cuộn theo lựa chọn ("scroll into view") — chỉ đổi this.scroll khi hàng đang chọn ra khỏi
      //   cửa sổ ROWS hàng, rồi kẹp vào [0, tổng hàng − ROWS]. Chỉ vẽ các ô nằm trong cửa sổ (culling đơn giản).
      var pos = grp.items.indexOf(this.sel), row = Math.floor(pos / COLS);
      if (row < this.scroll) this.scroll = row;
      if (row >= this.scroll + ROWS) this.scroll = row - ROWS + 1;
      var totalRows = Math.ceil(grp.items.length / COLS);
      this.scroll = U.clamp(this.scroll, 0, Math.max(0, totalRows - ROWS));
      var cols = Math.min(COLS, grp.items.length), x0 = OG.W / 2 - (cols * CW + (cols - 1) * GX) / 2;
      this.rects = [];
      for (var k = this.scroll * COLS; k < Math.min(grp.items.length, (this.scroll + ROWS) * COLS); k++) {
        var idx = grp.items[k], it = this.list[idx], kk = k - this.scroll * COLS;
        var r = { x: x0 + (kk % COLS) * (CW + GX), y: GRID_Y + Math.floor(kk / COLS) * (CH + GY), w: CW, h: CH };
        this.rects[idx] = r; // đánh chỉ số theo vị trí trong this.list (mảng thưa) → update() biết chạm vào thẻ nào
        this.drawCard(ctx, it, r, idx === this.sel, pal, idx === this.shakeI ? this.shakeT : null, k);
      }
      // mũi tên cuộn
      ctx.save();
      ctx.fillStyle = INK; ctx.font = ui().font(20); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (this.scroll > 0) ctx.fillText('▲', OG.W / 2, GRID_Y - 8);
      if (this.scroll + ROWS < totalRows) ctx.fillText('▼', OG.W / 2, GRID_Y + ROWS * (CH + GY) - 6);
      ctx.restore();
      // Thanh thông tin dưới
      drawNotebookInfo(ctx, cur, jid);
      ui().fx.draw(ctx);
    },
    drawCard: function (ctx, it, r, sel, pal, shakeT, k) {
      ctx.save();
      var lift = sel ? -4 + Math.sin(OG.time * 4) * 2 : 0, sx = ui().shake(shakeT, 0.4, 8);
      var pop = ui().easeOutBack(U.clamp(this.t * 4 - (k % 10) * 0.12, 0, 1));
      ctx.translate(r.x + r.w / 2 + sx, r.y + r.h / 2 + lift);
      ctx.scale(pop, pop);
      ctx.translate(-r.w / 2, -r.h / 2);
      if (it.unlocked) {
        ui().drawFrame(ctx, 0, 0, r.w, r.h, '#ffffff', 16, { lineWidth: sel ? 5 : 3.5, border: sel ? pal.primary : INK, gloss: false });
        ctx.fillStyle = ui().shade(pal.secondary, 0.6);
        U.roundRectPath(ctx, 8, 8, r.w - 16, 86, 12); ctx.fill();
        // Có ảnh thật (đã tải xong) → ảnh làm thumbnail, hình vẽ thu nhỏ thành huy hiệu tròn ở góc.
        // Ảnh chỉ được nạp khi thẻ hiện trên lưới (nạp lười), chưa xong thì vẫn vẽ hình cartoon như cũ.
        var thumb = OG.Photos && OG.Photos.ready(this.jid, it.card.id);
        if (thumb) {
          OG.Photos.drawCover(ctx, thumb, 8, 8, r.w - 16, 86, 12, (OG.Photos.get(this.jid, it.card.id) || {}).focus);
          ctx.fillStyle = '#ffffff'; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(r.w - 22, 80, 19, 0, TAU); ctx.fill(); ctx.stroke();
          ctx.save();
          ctx.beginPath(); ctx.arc(r.w - 22, 80, 17, 0, TAU); ctx.clip();
          OG.Learn.drawCardIcon(ctx, it.card, r.w - 22, 80, 30, OG.time);
          ctx.restore();
          ctx.font = ui().font(13); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.fillText('📷', 13, 21);
        } else OG.Learn.drawCardIcon(ctx, it.card, r.w / 2, 52, 78, OG.time);
        ctx.fillStyle = INK; ctx.font = ui().font(15); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        var tl = ui().wrap(ctx, it.card.title, r.w - 14).slice(0, 2);
        tl.forEach(function (l, i) { ctx.fillText(l, r.w / 2, 116 + (i - (tl.length - 1) / 2) * 18); });
      } else {
        ui().drawFrame(ctx, 0, 0, r.w, r.h, '#dfe4ee', 16, { lineWidth: sel ? 5 : 3, border: sel ? pal.primary : 'rgba(23,35,61,0.55)', gloss: false });
        ctx.save();
        ctx.setLineDash([8, 6]); ctx.strokeStyle = 'rgba(23,35,61,0.25)'; ctx.lineWidth = 2;
        U.roundRectPath(ctx, 9, 9, r.w - 18, r.h - 18, 10); ctx.stroke();
        ctx.restore();
        // bóng mờ của hình
        ctx.save();
        ctx.globalAlpha *= 0.16;
        // ctx.filter (CSS filter trên canvas) biến hình thành bóng đen tuyền — kiểu "Đoán xem ai đây?".
        // Trình duyệt không hỗ trợ filter thì bỏ qua lặng lẽ: vẫn thấy hình mờ 16%, chấp nhận được.
        ctx.filter = 'brightness(0)';
        OG.Learn.drawCardIcon(ctx, it.card, r.w / 2, 60, 86, 0);
        ctx.restore();
        ctx.fillStyle = 'rgba(23,35,61,0.5)'; ctx.font = ui().font(50, '900'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('?', r.w / 2, 62);
        ctx.font = ui().font(14); ctx.fillText('🔒 Chưa mở', r.w / 2, 122);
      }
      ctx.restore();
    }
  };

  // ===========================================================================
  // journeyEnd — kết thúc hành trình.  params: {journeyId}
  //   Panel DOM: Sổ tay (primary, Enter), Bản đồ hành trình, Về menu. Esc = về menu.
  // ===========================================================================
  var journeyEnd = {
    enter: function (params) {
      var jid = this.jid = (params && params.journeyId) || OG.Story.lastJourney();
      var j = J().get(jid) || {}, c = OG.Learn.count(jid), pr = J().progress(jid), g = j.guide || {};
      var end = (typeof j.ending === 'object' && j.ending) || {};
      this.t = 0; this.next = 0.2;
      hideChrome();
      ui().fx.clear();
      ui().fx.confetti(OG.W / 2, OG.H * 0.55, 90, 3);
      // Kết quả lượt chơi hành trình (bảng xếp hạng dùng chung với chiến dịch cổ điển).
      // Truyền lại params.result khi quay về từ 'leaderboard' → giữ ĐÚNG object cũ, OG.Social nhận ra đã lưu điểm
      // (khoá theo type|score|charId|date) và không tạo mục trùng.
      var result = this.result = (params && params.result) || OG.Game.buildResult('victory');
      result.journeyId = jid;
      result.levelName = (j.emoji ? j.emoji + ' ' : '') + (j.title || '');
      var panel = OG.DOM.panel({
        title: esc(end.title || 'HOÀN THÀNH! 🎉'),
        className: 'story-panel story-end',
        html: '<div class="story-trophy" aria-hidden="true">🏆</div>' +
          '<p class="story-end-text">' + esc(end.text || ('Bạn đã đi hết hành trình “' + (j.title || '') + '”!')) + '</p>' +
          '<div class="story-end-stats"><span>⭐ <b>' + pr.stars + '</b>/' + pr.maxStars + ' sao</span>' +
          '<span>📒 <b>' + c.have + '</b>/' + c.total + ' thẻ</span><span>🏁 <b>' + pr.levelsDone + '</b>/' + pr.levels + ' màn</span></div>' +
          '<div class="story-end-guide"><span class="story-portrait" data-char="' + esc(g.charId || 'olivia') + '" data-size="56" style="width:56px;height:56px"></span>' +
          '<span><b>' + esc(g.name || '') + ':</b> Cảm ơn bạn đã đi cùng mình! Hẹn gặp lại nhé! 👋</span></div>' +
          (c.have < c.total ? '<p class="story-end-tip">Còn ' + (c.total - c.have) + ' thẻ chưa tìm thấy. Chơi lại để sưu tầm đủ nhé! 🔎</p>' : '<p class="story-end-tip">Bạn đã sưu tầm ĐỦ thẻ! Siêu quá! 🌟</p>'),
        buttons: [
          { id: 'end_notebook', label: '📒 Xem Sổ tay', primary: true, onClick: function () { OG.Learn.openNotebook(jid, 'journeyEnd', { journeyId: jid }); } },
          { id: 'end_lb', label: '🏆 Bảng xếp hạng', secondary: true, onClick: function () { OG.Scenes.go('leaderboard', { back: 'journeyEnd', backParams: { journeyId: jid, result: result } }); } },
          { id: 'end_map', label: '🗺️ Bản đồ hành trình', secondary: true, onClick: function () { OG.Scenes.go('journeyMap', { journeyId: jid }); } },
          { id: 'end_menu', label: '🏠 Về menu', secondary: true, onClick: function () { OG.Scenes.go('menu'); } }
        ]
      });
      panel.setAttribute('style', paletteStyle(jid));
      mountPortraits(panel);
      // Ô nhập tên + lưu điểm + chia sẻ (OG.Social), giống màn chiến thắng cổ điển.
      U.call('Social', 'mountResult', panel, result);
    },
    exit: function () { OG.DOM.hidePanel(); },
    update: function (dt) {
      this.t += dt;
      ui().fx.update(dt);
      // Pháo hoa lác đác trong 12 giây đầu, mỗi phát cách nhau ngẫu nhiên 0,7–1,3 giây (hẹn giờ bằng mốc this.next).
      if (this.t > this.next && this.t < 12) {
        this.next = this.t + 0.7 + Math.random() * 0.6;
        ui().fx.firework(120 + Math.random() * (OG.W - 240), 70 + Math.random() * 160, 22);
      }
      if (backPressed()) OG.Scenes.go('menu');
    },
    draw: function (ctx) {
      backdrop(ctx, firstTheme(this.jid), 0.25);
      var g = OG.Guide.guideOf(this.jid);
      ctx.save(); ctx.translate(90, OG.FLOOR_Y + 4);
      drawChar(ctx, 'oggy', 'victory', OG.time, { scale: 1.9, face: 1, time: OG.time });
      ctx.restore();
      ctx.save(); ctx.translate(OG.W - 90, OG.FLOOR_Y + 4);
      drawChar(ctx, g.charId, 'victory', OG.time + 0.4, { scale: 1.9, face: -1, time: OG.time });
      ctx.restore();
      ui().fx.draw(ctx);
    }
  };

  // Đăng ký ngay lúc load (OG.Scenes.register ghi đè nếu trùng tên). Module tính năng đăng ký SAU có thể thay
  // một scene ở đây — vd src/world/journey-map.js thay 'journeyMap' trong init().
  OG.Scenes.register('journeySelect', journeySelect);
  OG.Scenes.register('journeyMap', journeyMap);
  OG.Scenes.register('comic', comic);
  OG.Scenes.register('card', card);
  OG.Scenes.register('quiz', quiz);
  OG.Scenes.register('notebook', notebook);
  OG.Scenes.register('journeyEnd', journeyEnd);

  // Ghi đè stub rỗng trong story.js bằng bản vẽ thật (story.js nạp trước file này).
  OG.Story.drawComicPanel = drawComicPanel;
  OG.Story._beatsOf = beatsOf; // chỉ cho test
})();
