// @ts-check
/* ============================================================================
 * OG.Menus (phần HUD) — HUD (heads-up display: thông tin nổi trên màn chơi) bằng DOM + canvas
 * ----------------------------------------------------------------------------
 * Vai trò:      Hiện điểm, mạng, pizza, xu, vật phẩm đang dùng, nhiệm vụ (lớp DOM #hud) và đồng hồ, thanh máu
 *               trùm, banner giai đoạn, viền cảnh báo còn 1 mạng (vẽ canvas). OG.Game.refreshHud() gọi updateHud
 *               khi số liệu đổi; scene 'level' / 'boss' gọi drawHud MỖI FRAME sau khi vẽ thế giới.
 * Khái niệm:    DOM overlay vs canvas UI (chọn lớp nào cho loại thông tin nào) · dirty checking (chỉ ghi DOM
 *               khi giá trị đổi) · chạy lại CSS animation bằng ép reflow · thanh máu "trễ" (lag bar) ·
 *               observer (nghe 'boss:phase') · thoát HTML chống chèn mã (escape)
 * Bài học:      docs/learn/06-event-bus-observer.md · docs/learn/07-ve-canvas-procedural-cache.md (phần canvas)
 * Phụ thuộc:    OG.Events.on (đọc lúc LOAD) · lúc CHẠY: OG.util, OG.Scenes, OG.Level.state, OG.BossScene,
 *               OG.Shop (getActive, tickPlayer), OG.Journeys.isJourneyLevel, OG.Sprites.drawCharacter,
 *               OG.Menus.ui.questLine (menus.js). File load SAU src/ui/menus.js.
 * Event:        phát: (không — nhảy đôi do OG.Shop.tickPlayer phát) · nghe: 'boss:phase', 'boss:start'
 * API công khai: OG.Menus.updateHud(hud), OG.Menus.drawHud(ctx, hud), OG.Menus.showsPages
 * Đọc tiếp:     src/ui/menus.js (panel menu DOM) → src/game/game.js (nơi dựng HudState, refreshHud)
 *               → src/game/level.js (gọi drawHud trong draw)
 * Dữ liệu:      HudState (typedef bên dưới)
 *
 * 💡 Khái niệm — vì sao HUD chia HAI lớp?
 *   DOM (#hud nằm đè lên canvas): chữ/emoji sắc nét ở mọi độ phân giải, CSS lo bố cục co giãn và hiệu ứng
 *   "nảy" — hợp với số liệu ÍT ĐỔI (điểm, xu, mạng). Canvas: vẽ lại mỗi frame, đồng bộ tuyệt đối với game —
 *   hợp với thứ đổi LIÊN TỤC (đồng hồ, thanh máu tụt mượt, viền đỏ nhấp nháy). Ghi DOM 60 lần/giây thì
 *   trình duyệt phải tính lại bố cục liên tục (chậm), vẽ chữ lên canvas thì mất tiện ích của CSS.
 *
 * Hợp đồng (BẮT BUỘC):
 *   OG.Menus.updateHud(hud)    — gọi khi HUD state đổi. Dựng lại (một lần) rồi cập nhật DOM trong #hud.
 *   OG.Menus.drawHud(ctx, hud) — gọi MỖI FRAME sau khi vẽ thế giới, KHÔNG GIAN MÀN HÌNH (960x540):
 *                                đồng hồ, thanh máu trùm, banner phase, viền cảnh báo khi còn 1 mạng.
 * drawHud cũng gọi OG.Shop.tickPlayer (nhảy đôi) như phương án dự phòng khi Player chưa có hook.
 * ========================================================================== */

/**
 * Số liệu HUD do OG.Game dựng (OG.Game.hud).
 * @typedef {Object} HudState
 * @property {string} scene        'level' | 'boss' | ...
 * @property {string} levelId
 * @property {string} levelName
 * @property {string} [icon]
 * @property {number} pizzas
 * @property {number} goal         số pizza cần để mở cửa
 * @property {number} lives
 * @property {number} maxLives
 * @property {number} score
 * @property {number} coins
 * @property {number} [shield]
 * @property {number} time         giây đã chơi
 * @property {{id: string, name: string, hp: number, maxHp: number}|null} boss
 * @property {{id: string, text: string, done: boolean, progress?: number, target?: number, failed?: boolean}[]} quests
 * @property {{have: number, total: number}} [pages]  v2: số trang sách của màn hành trình (do OG.Learn cập nhật)
 */
(function () {
  'use strict';
  var OG = window.OG;
  var U = OG.util;
  var Menus = /** @type {any} */ (OG.Menus = OG.Menus || {}); // menus.js đã tạo trước; file này gắn thêm hàm

  // ---------------------------------------------------------------------------
  // Hằng số
  // ---------------------------------------------------------------------------
  var MAX_HEARTS = 6;          // quá 6 mạng thì hiện "❤️×N" thay vì một hàng tim dài
  var HUD_QUEST_LINES = 3;     // số dòng nhiệm vụ tối đa trên HUD
  var HUD_MAX_DT = 0.05;       // giây — kẹp dt tự tính trong drawHud (tab ẩn lâu không làm hiệu ứng nhảy cóc)
  var HIT_FLASH_SEC = 0.35;    // giây thanh máu trùm loé trắng khi trúng đòn
  var LAG_MIN_SPEED = 0.6;     // HP/giây — tốc độ tối thiểu thanh "trễ" tụt về máu thật
  var LAG_CATCHUP = 2.5;       // 1/giây — càng chênh nhiều thì thanh trễ tụt càng nhanh
  var HP_TICK_MAX = 24;        // trùm có ≤ 24 máu thì vẽ vạch chia từng máu
  var PHASE_BANNER_SEC = 1.8;  // giây hiện banner "GIAI ĐOẠN N"
  var PHASE_POP_UNTIL = 1.5;   // giây — khi thời gian còn lại > 1.5 thì chữ đang "bật" to ra

  // Định dạng số kiểu Việt Nam: 12345 → "12.345" (regex chèn dấu chấm trước mỗi nhóm 3 chữ số).
  function fmt(n) { return String(Math.round(+n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  // 💡 Khái niệm: dirty checking — chỉ ghi vào DOM khi giá trị THẬT SỰ đổi. Gán textContent/innerHTML
  //   (kể cả cùng giá trị) làm trình duyệt xoá và tạo lại nút con, rồi đánh dấu bố cục cần tính lại (layout);
  //   updateHud được gọi rất thường xuyên nên so sánh trước rẻ hơn nhiều.
  function setText(el, s) { if (el && el.textContent !== s) el.textContent = s; }
  // innerHTML đọc lại sẽ bị trình duyệt "chuẩn hoá" (khác chuỗi gốc) → lưu chuỗi gốc vào el.__html để so.
  function setHtml(el, s) { if (el && el.__html !== s) { el.__html = s; el.innerHTML = s; } }
  // Chạy lại animation CSS (thêm/xoá class).
  // ⚠️ Bẫy: remove rồi add class ngay trong cùng một lượt JS thì trình duyệt coi như KHÔNG đổi gì → animation
  //   không chạy lại. Đọc offsetWidth ép trình duyệt tính bố cục (reflow) ở giữa, nên lần add được tính là mới.
  function bump(el, cls) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth; // ép reflow để animation chạy lại
    el.classList.add(cls);
  }

  // ---------------------------------------------------------------------------
  // HUD DOM
  // ---------------------------------------------------------------------------
  var refs = null;  // tham chiếu tới các phần tử con của #hud (tìm một lần, dùng mãi)
  // Giá trị lần trước, để biết số TĂNG hay GIẢM mà chọn hiệu ứng (nảy xanh / rung đỏ). null = chưa có.
  var last = { score: null, lives: null, coins: null, pizzas: null };

  // Dựng khung HTML của HUD một lần rồi cache các phần tử (querySelector mỗi lần cập nhật là lãng phí).
  // Dựng lại nếu #hud bị thay (vd module khác ghi đè innerHTML).
  function buildHud() {
    var hud = document.getElementById('hud');
    if (!hud) return null;
    if (refs && refs.root === hud && hud.querySelector('.ui-hud-left')) return refs;
    hud.classList.add('ui-hud');
    hud.innerHTML =
      '<div class="ui-hud-col ui-hud-left">' +
        '<div class="ui-hud-row">' +
          '<div class="pill ui-pill ui-pill-level" id="level"></div>' +
          '<div class="pill ui-pill ui-goal" id="objective"><span class="ui-goal-text"></span><i class="ui-goal-bar"><b></b></i></div>' +
          // v2: số trang sách của màn hành trình (OG.Game.hud.pages = {have, total}, do OG.Learn cập nhật)
          '<div class="pill ui-pill ui-pages" id="pages" style="display:none"></div>' +
        '</div>' +
        '<div class="ui-items"></div>' +
      '</div>' +
      '<div class="ui-hud-col ui-hud-right">' +
        '<div class="ui-hud-row">' +
          '<div class="pill ui-pill" id="coins"></div>' +
          '<div class="pill ui-pill ui-lives" id="lives"></div>' +
          '<div class="pill ui-pill ui-score" id="score"></div>' +
        '</div>' +
        '<ul class="ui-quests"></ul>' +
      '</div>';
    refs = {
      root: hud,
      level: hud.querySelector('#level'),
      goal: hud.querySelector('#objective'),
      goalText: hud.querySelector('.ui-goal-text'),
      goalBar: hud.querySelector('.ui-goal-bar b'),
      pages: hud.querySelector('#pages'),
      items: hud.querySelector('.ui-items'),
      coins: hud.querySelector('#coins'),
      lives: hud.querySelector('#lives'),
      score: hud.querySelector('#score'),
      quests: hud.querySelector('.ui-quests')
    };
    last = { score: null, lives: null, coins: null, pizzas: null, pages: null };
    return refs;
  }

  function livesHtml(lives, max) {
    lives = Math.max(0, lives | 0);
    max = Math.max(lives, max | 0);
    if (max > MAX_HEARTS) return '❤️<span class="ui-x">×' + lives + '</span>';
    var s = '';
    for (var i = 0; i < max; i++) s += i < lives ? '<span class="ui-heart">❤️</span>' : '<span class="ui-heart is-empty">🖤</span>';
    return s;
  }

  // Màn của hành trình học tập v2? (OG.Journeys có thể chưa load)
  function isJourneyLevel(id) {
    return !!(id && OG.Journeys && typeof OG.Journeys.isJourneyLevel === 'function' && OG.Journeys.isJourneyLevel(id));
  }
  // OG.Learn đọc cờ này: HUD DOM đã hiện số trang sách → không vẽ thêm pill trên canvas.
  Menus.showsPages = true;

  /**
   * Cập nhật lớp HUD DOM (#hud) theo số liệu mới; dựng khung HTML ở lần gọi đầu.
   * Chỉ ghi phần tử nào có giá trị đổi, và kích hoạt hiệu ứng CSS khi số tăng (ui-bump) / mạng giảm (ui-hurt).
   * @param {HudState} h
   * @example
   *   OG.Menus.updateHud(OG.Game.hud); // thường gọi gián tiếp qua OG.Game.refreshHud()
   */
  Menus.updateHud = function (h) {
    if (!h) return;
    var r = buildHud();
    if (!r) return;
    var inBoss = h.scene === 'boss';

    setText(r.level, (h.icon || '📍') + ' ' + (h.levelName || ''));

    // Mục tiêu pizza (ẩn trong trận trùm).
    r.goal.style.display = inBoss ? 'none' : '';
    var goal = Math.max(1, h.goal | 0), piz = h.pizzas | 0;
    setText(r.goalText, '🍕 ' + piz + '/' + (h.goal | 0));
    r.goalBar.style.width = Math.min(100, (piz / goal) * 100).toFixed(0) + '%';
    r.goal.classList.toggle('is-done', piz >= goal && goal > 0);
    if (last.pizzas !== null && piz > last.pizzas) bump(r.goal, 'ui-bump');
    last.pizzas = piz;

    // Trang sách (chỉ màn hành trình). Trẻ em: không đồng hồ, không danh sách nhiệm vụ để bé chơi thong thả.
    var journey = isJourneyLevel(h.levelId);
    var pg = journey && !inBoss && h.pages && h.pages.total > 0 ? h.pages : null;
    r.pages.style.display = pg ? '' : 'none';
    if (pg) {
      setText(r.pages, '📖 ' + (pg.have | 0) + '/' + (pg.total | 0));
      r.pages.classList.toggle('is-done', pg.have >= pg.total);
      if (last.pages !== null && pg.have > last.pages) bump(r.pages, 'ui-bump');
    }
    last.pages = pg ? pg.have : null;
    r.root.classList.toggle('ui-hud-journey', journey);

    // Xu
    setText(r.coins, '🪙 ' + fmt(h.coins));
    if (last.coins !== null && h.coins > last.coins) bump(r.coins, 'ui-bump');
    last.coins = h.coins;

    // Mạng
    setHtml(r.lives, livesHtml(h.lives, h.maxLives));
    if (last.lives !== null && h.lives < last.lives) bump(r.lives, 'ui-hurt');
    else if (last.lives !== null && h.lives > last.lives) bump(r.lives, 'ui-bump');
    r.lives.classList.toggle('is-low', (h.lives | 0) === 1);
    last.lives = h.lives;

    // Điểm
    setText(r.score, '⭐ ' + fmt(h.score));
    if (last.score !== null && h.score > last.score) bump(r.score, 'ui-bump');
    last.score = h.score;

    // Vật phẩm đang có tác dụng
    var chips = '';
    if ((h.shield | 0) > 0) chips += '<span class="ui-chip" title="Khiên">🛡️<b>' + (h.shield | 0) + '</b></span>';
    var act = U.call('Shop', 'getActive');
    if (act && act.levelId === h.levelId) {
      if (act.doubleJump) chips += '<span class="ui-chip" title="Nhảy đôi">👟<b>×2</b></span>';
      if (act.magnet) chips += '<span class="ui-chip" title="Nam châm">🧲</span>';
    }
    setHtml(r.items, chips);

    // Nhiệm vụ (tối đa 3 dòng). Chữ do dữ liệu cung cấp nên luôn đi qua escape trước khi vào innerHTML.
    var qs = !journey && Array.isArray(h.quests) ? h.quests.slice(0, HUD_QUEST_LINES) : [];
    var UI = Menus.ui;
    setHtml(r.quests, qs.map(function (q) {
      if (UI && UI.questLine) return UI.questLine(q, h.levelId);
      // ⚠️ Bẫy: ghép thẳng q.text vào innerHTML mà không escapeHtml → một chuỗi có '<img onerror=...>'
      //   trong dữ liệu (vd hành trình do người khác viết) sẽ chạy được mã JS.
      return '<li class="' + (q.done ? 'is-done' : '') + '">' + (q.done ? '✅ ' : '◻️ ') + U.escapeHtml(q.text || '') + '</li>';
    }).join(''));
  };

  // ---------------------------------------------------------------------------
  // HUD canvas (toạ độ MÀN HÌNH 960×540, vẽ sau thế giới nên không bị camera dịch)
  // ---------------------------------------------------------------------------
  var FONT = OG.FONT; // font chuẩn đủ dấu tiếng Việt (src/core/namespace.js)
  // Trạng thái hiệu ứng thanh máu trùm. lagHp = máu "trễ" (thanh vàng tụt từ từ), shownHp = máu frame trước
  // (để phát hiện vừa mất máu), flash = giây loé trắng còn lại, lastT = OG.time lần vẽ trước (tự tính dt).
  var bossFx = { id: null, lagHp: 0, shownHp: 0, flash: 0, lastT: 0 };
  var phaseBanner = { text: '', t: 0 }; // t = giây còn hiện banner

  // Observer: trùm chỉ phát 'boss:phase', không cần biết HUD tồn tại; HUD tự nghe và hiện banner.
  OG.Events.on('boss:phase', function (e) {
    if (!e) return;
    phaseBanner.text = 'GIAI ĐOẠN ' + (e.phase | 0 || e.phase);
    phaseBanner.t = PHASE_BANNER_SEC;
  });
  OG.Events.on('boss:start', function () { bossFx.id = null; phaseBanner.t = 0; });

  // Lấy player đang chơi (để xử lý nhảy đôi).
  function currentPlayer(h) {
    var cur = OG.Scenes.current();
    if (cur === 'level' && OG.Level && OG.Level.state) return OG.Level.state.player;
    if (cur === 'boss' && OG.BossScene) {
      if (typeof OG.BossScene.getPlayer === 'function') return U.safe('BossScene.getPlayer', OG.BossScene.getPlayer, OG.BossScene);
      if (OG.BossScene.arena && OG.BossScene.arena.player) return OG.BossScene.arena.player;
    }
    return null;
  }

  function pill(ctx, x, y, w, h, fill, stroke) {
    U.fillRound(ctx, x, y, w, h, h / 2, fill);
    if (stroke) {
      ctx.lineWidth = 2; ctx.strokeStyle = stroke;
      U.roundRectPath(ctx, x, y, w, h, h / 2); ctx.stroke();
    }
  }

  function drawTimer(ctx, h) {
    var text = '⏱ ' + U.formatTime(h.time);
    ctx.font = 'bold 15px ' + FONT;
    var w = Math.max(70, ctx.measureText(text).width + 22);
    var x = (OG.W - w) / 2, y = 62;
    pill(ctx, x, y, w, 26, 'rgba(23,35,61,0.72)', 'rgba(255,244,214,0.8)');
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, OG.W / 2, y + 14);
  }

  /**
   * Vẽ khung + chân dung + tên + thanh máu trùm ở giữa trên màn hình.
   * @param {CanvasRenderingContext2D} ctx
   * @param {{id: string, name: string, hp: number, maxHp: number}} b
   * @param {number} dt  giây
   */
  function drawBossBar(ctx, b, dt) {
    var maxHp = Math.max(1, b.maxHp | 0 || 1);
    var hp = U.clamp(+b.hp || 0, 0, maxHp);
    // Trùm mới (id khác) → reset hiệu ứng, không để thanh trễ của trùm trước "tụt" sang trùm này.
    if (bossFx.id !== b.id) { bossFx.id = b.id; bossFx.lagHp = hp; bossFx.shownHp = hp; bossFx.flash = 0; }
    if (hp < bossFx.shownHp) bossFx.flash = HIT_FLASH_SEC;
    bossFx.shownHp = hp;
    // 💡 Khái niệm: lag bar (thanh máu trễ) — thanh đỏ nhảy NGAY về máu thật, thanh vàng phía sau tụt từ từ.
    //   Khoảng vàng lộ ra cho người chơi THẤY mình vừa gây bao nhiêu sát thương. Tốc độ tụt tỉ lệ với khoảng
    //   chênh (chênh nhiều tụt nhanh) nhưng không chậm hơn LAG_MIN_SPEED; Math.max(hp, …) để không tụt quá máu thật.
    // 🧪 Thử: đổi LAG_CATCHUP 2.5 → 0.3 rồi đánh trùm: vệt vàng đọng lại rất lâu sau mỗi cú giẫm.
    bossFx.lagHp = Math.max(hp, bossFx.lagHp - Math.max(LAG_MIN_SPEED, (bossFx.lagHp - hp) * LAG_CATCHUP) * dt);
    bossFx.flash = Math.max(0, bossFx.flash - dt);

    var W = 380, H = 18, x = (OG.W - W) / 2, y = 82;
    var t = OG.time;
    ctx.save();
    // Khung
    U.fillRound(ctx, x - 52, y - 26, W + 64, H + 38, 16, 'rgba(23,35,61,0.86)');
    ctx.lineWidth = 3; ctx.strokeStyle = '#fff4d6';
    U.roundRectPath(ctx, x - 52, y - 26, W + 64, H + 38, 16); ctx.stroke();

    // Chân dung trùm
    // Trận cuối "trio" không phải 1 nhân vật: dùng chân dung Joey (thủ lĩnh bộ ba).
    var cid = OG.Data.characters[b.id] ? b.id : (b.id === 'trio' ? 'joey' : b.id);
    var ch = OG.Data.characters[cid];
    var col = (ch && ch.colors && ch.colors.body) || OG.Palette.danger;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x - 26, y + 3, 21, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#fff4d6'; ctx.stroke();
    if (ch && OG.Sprites && typeof OG.Sprites.drawCharacter === 'function') {
      ctx.save();
      ctx.beginPath(); ctx.arc(x - 26, y + 3, 19, 0, Math.PI * 2); ctx.clip();
      var sc = Math.min(30 / ch.w, 34 / ch.h);
      ctx.translate(x - 26, y + 20);
      ctx.scale(sc, sc);
      U.safe('Sprites.drawCharacter(bossHud)', OG.Sprites.drawCharacter, OG.Sprites,
        [ctx, cid, bossFx.flash > 0 ? 'hurt' : 'idle', t, { face: 1, w: ch.w, h: ch.h, time: t }]);
      ctx.restore();
    }

    // Tên
    ctx.font = 'bold 14px ' + FONT;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ffd36b';
    ctx.fillText('👑 ' + (b.name || b.id), x, y - 7);
    ctx.textAlign = 'right'; ctx.fillStyle = '#fff6df';
    ctx.fillText(Math.ceil(hp) + '/' + maxHp, x + W, y - 7);

    // Thanh máu: nền tối → lớp trễ (vàng) → lớp máu thật (đỏ, loé trắng khi trúng đòn) → vệt sáng.
    // Vẽ theo thứ tự này để lớp đỏ đè lên lớp vàng; phần vàng lộ ra chính là sát thương vừa gây.
    U.fillRound(ctx, x, y, W, H, H / 2, '#3a2333');
    var lagW = W * (bossFx.lagHp / maxHp);
    if (lagW > 1) U.fillRound(ctx, x, y, Math.max(H, lagW), H, H / 2, '#ffd36b');
    var hpW = W * (hp / maxHp);
    if (hpW > 1) {
      var g = ctx.createLinearGradient(0, y, 0, y + H);
      g.addColorStop(0, bossFx.flash > 0 ? '#ffffff' : '#ff6b6f');
      g.addColorStop(1, bossFx.flash > 0 ? '#ffd0d0' : '#c9343a');
      U.fillRound(ctx, x, y, Math.max(H, hpW), H, H / 2, g);
      // vệt sáng
      U.fillRound(ctx, x + 4, y + 3, Math.max(4, hpW - 8), 4, 2, 'rgba(255,255,255,0.35)');
    }
    // Vạch chia theo HP (nếu ít máu) — trẻ đếm được "còn mấy cú giẫm nữa"
    if (maxHp <= HP_TICK_MAX) {
      ctx.fillStyle = 'rgba(23,35,61,0.55)';
      for (var i = 1; i < maxHp; i++) ctx.fillRect(Math.round(x + (W * i) / maxHp) - 1, y + 2, 2, H - 4);
    }
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,244,214,0.9)';
    U.roundRectPath(ctx, x, y, W, H, H / 2); ctx.stroke();
    ctx.restore();
  }

  // Banner "GIAI ĐOẠN N": độ mờ a hiện dần 0.25 giây đầu và mờ dần 0.25 giây cuối (min của 2 phía × 4);
  // 0.3 giây đầu chữ to hơn rồi co về cỡ thường → cảm giác "đập" vào màn hình.
  function drawPhaseBanner(ctx, dt) {
    if (phaseBanner.t <= 0) return;
    phaseBanner.t -= dt;
    var a = U.clamp(Math.min(phaseBanner.t, PHASE_BANNER_SEC - phaseBanner.t) * 4, 0, 1);
    var sc = 1 + Math.max(0, phaseBanner.t - PHASE_POP_UNTIL) * 1.2;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(OG.W / 2, 170);
    ctx.scale(sc, sc);
    ctx.font = '900 38px ' + FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 8; ctx.strokeStyle = '#17233d';
    ctx.strokeText(phaseBanner.text, 0, 0);
    ctx.fillStyle = '#ffd36b';
    ctx.fillText(phaseBanner.text, 0, 0);
    ctx.restore();
  }

  // Viền đỏ nhấp nháy khi còn 1 mạng: gradient tròn trong suốt ở giữa, đỏ dần ra 4 góc (vignette) —
  // cảnh báo bằng ngoại vi thị giác, không che nhân vật ở giữa màn hình.
  function drawLowLife(ctx) {
    var a = 0.22 + Math.sin(OG.time * 5) * 0.1;
    ctx.save();
    var g = ctx.createRadialGradient(OG.W / 2, OG.H / 2, OG.H * 0.42, OG.W / 2, OG.H / 2, OG.W * 0.62);
    g.addColorStop(0, 'rgba(229,72,77,0)');
    g.addColorStop(1, 'rgba(229,72,77,' + a.toFixed(3) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, OG.W, OG.H);
    ctx.restore();
  }

  /**
   * Vẽ phần HUD trên canvas (đồng hồ hoặc thanh máu trùm, banner giai đoạn, viền cảnh báo). Gọi MỖI FRAME,
   * sau khi vẽ thế giới và SAU ctx.restore() của camera (toạ độ màn hình). Cũng gọi OG.Shop.tickPlayer (nhảy đôi).
   * @param {CanvasRenderingContext2D} ctx
   * @param {HudState} h
   */
  Menus.drawHud = function (ctx, h) {
    if (!ctx || !h) return;
    // drawHud không được truyền dt nên tự tính từ OG.time (giây) giữa hai lần vẽ, kẹp để không nhảy cóc.
    var now = OG.time;
    var dt = U.clamp(now - (bossFx.lastT || now), 0, HUD_MAX_DT);
    bossFx.lastT = now;

    // Nhảy đôi (dự phòng): chỉ khi scene chơi đang ở trên cùng (không phải lúc pause).
    // ⚠️ Bẫy: đây là logic GAMEPLAY đặt trong hàm VẼ — chạy được vì draw cũng chạy mỗi frame, nhưng nếu
    //   một ngày draw bị bỏ qua (vd tab ẩn) thì nhảy đôi cũng ngừng. Chỗ đúng là cuối OG.Player.update
    //   (xem src/ui/INTEGRATION.md); tickPlayer tự chống gọi trùng nên giữ cả hai chỗ vẫn an toàn.
    var p = currentPlayer(h);
    if (p) U.call('Shop', 'tickPlayer', p, dt);

    var playing = h.scene === 'level' || h.scene === 'boss';
    ctx.save();
    if (playing && (h.lives | 0) === 1) drawLowLife(ctx);
    if (h.boss) drawBossBar(ctx, h.boss, dt);
    else if (h.scene === 'level' && !isJourneyLevel(h.levelId)) drawTimer(ctx, h);
    drawPhaseBanner(ctx, dt);
    ctx.restore();
  };
})();
