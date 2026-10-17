// @ts-check
/* ============================================================================
 * OG.Difficulty — ĐỘ KHÓ: 'kid' (mặc định, rất dễ cho bé 5–10 tuổi) và 'challenge' (= cảm giác v1)
 * ----------------------------------------------------------------------------
 * Vai trò:      Một chỗ duy nhất chứa MỌI con số làm game dễ/khó: số mạng, coyote time, trọng lực khi giữ nút nhảy,
 *               kích thước hurtbox của địch, máu & nhịp đòn trùm, checkpoint, trợ giúp tự động khi thua nhiều lần.
 *               Code gameplay không if (kid) rải rác; nó chỉ hỏi OG.Difficulty.get('tênThamSố').
 *               Nơi gọi: Game.newRun (mạng), Player.update (coyote/buffer, trọng lực nhảy giữ nút/rơi chậm),
 *               Player.hurt (bất tử, lực đẩy), Enemies.create/hurtbox, scene level/boss (giẫm, chạm sượt, rơi vực,
 *               máu & nhịp trùm, arena.difficulty), Game.loseLife (softFail). Checkpoint là level hook 'checkpoints'.
 * Khái niệm:    data-driven tuning (bảng tham số theo chế độ) · dynamic difficulty adjustment (trợ giúp tự bật khi
 *               thua nhiều lần) · cache có khoá phiên bản (version) · nới lỏng va chạm (stomp tolerance, graze) ·
 *               soft fail (thua mà không game over) · checkpoint + vị trí an toàn · level hook
 * Bài học:      docs/learn/09-ai-ke-dich-boss.md (setupBoss, bossTimeScale), docs/learn/04-vat-ly-va-cham-aabb.md
 *               (isStomp, enemyHurtbox, touches), docs/learn/03-input.md (coyote time, jump buffer)
 * Phụ thuộc:    LÚC LOAD: OG.util. LÚC CHẠY: OG.Save (settings.difficulty, ns('difficulty')), OG.Events, OG.Game,
 *               OG.Level (addHook, state), OG.BossScene, OG.Scenes, OG.Particles, OG.DOM, OG.Sprites.drawProp, OG.Story (tuỳ chọn)
 * Event:        phát: 'difficulty:change' {mode, prev}, 'assist:on' {levelId, level, fails}, 'lives:change',
 *               'player:respawn' {cause, x, y, levelId}, 'checkpoint:reach' {levelId, index, x, y}
 *               · nghe: 'save:reset', 'level:complete', 'game:over'
 * API công khai: OG.Difficulty.MODES, ASSIST, init(), mode(), isKid(), label(m), list(), set(m), toggle(), params(levelId),
 *               get(key, levelId), assistLevel, isAssist, recordFail, recordClear, startLives, scaleEnemy, enemyHurtbox,
 *               isStomp, touches, setupBoss, bossTimeScale, weakenBoss, applyAssist, trackSafe, onFall, softFail
 * Đọc tiếp:     src/game/player.js (đọc coyoteTime, jumpBuffer...) → src/game/level.js (stompOk/touchOk gọi isStomp/touches)
 *               → src/game/boss-scene.js (setupBoss, bossTimeScale) → docs/STORY.md mục 5 (hợp đồng)
 *
 * Mở rộng ngoài hợp đồng (giữ nguyên chữ ký cũ):
 *   isStomp(p, prevBottom, target, tol, prevTop) -> bool   giẫm rộng lượng + bù chuyển động của mục tiêu
 *   touches(p, box) -> bool                                 chạm "thật" (bỏ qua chạm sượt vài px)
 *   weakenBoss(boss, arena)                                 trợ giúp giữa trận: trùm mất bớt máu
 *   applyAssist(player, levelId)                            khiên/tim trợ giúp khi vào màn/trận
 *
 * Lưu: OG.Save.data.settings.difficulty ('kid'|'challenge'), số lần thua: OG.Save.ns('difficulty').fails
 * ========================================================================== */

/**
 * @typedef {Object} Checkpoint  một cờ checkpoint trong màn (st.checkpoints[i])
 * @property {number} x         chân cột cờ, px thế giới
 * @property {number} y         mặt nền tại cờ, px thế giới
 * @property {number} index
 * @property {boolean} reached
 * @property {number} raiseT    giây kể từ lúc chạm cờ (hoạt ảnh dựng cờ)
 */
(function () {
  'use strict';
  var OG = window.OG;
  var U = OG.util;

  var DEFAULT_STOMP_TOL = 12;        // dung sai giẫm mặc định, px (giống OG.Physics.isStomp)
  var RISING_EPS = 0.5;              // đỉnh mục tiêu cao hơn frame trước > 0.5 px = mục tiêu đang bay lên
  var RISING_MAX_UP_SPEED = 120;     // mục tiêu bay lên đụng chân: người chơi được phép đang đi lên chậm hơn 120 px/giây
  var KID_STOMP_MIN_VY = 60;         // kid: đang rơi nhanh hơn 60 px/giây ...
  var KID_STOMP_TOP_RATIO = 0.45;    // ... và chân ở nửa trên (45%) của mục tiêu → vẫn tính là giẫm
  var BOSS_MIN_HP = 2;               // giảm máu trùm nhưng luôn còn ≥ 2 (để vẫn là một "trận")
  var SAFE_EDGE = 6;                 // vị trí an toàn: cả hitbox cách mép bục ≥ 6 px
  var SAFE_FOOT_EPS = 2;             // chân lệch mặt bục < 2 px coi là đang đứng trên bục đó
  var SAFE_ENEMY_DX = 90;            // không lưu chỗ an toàn nếu có địch trong ±90 px ngang ...
  var SAFE_ENEMY_DY = 120;           // ... và ±120 px dọc
  var FALL_DEFAULT_X = 70;           // chưa có chỗ an toàn → thả xuống gần điểm xuất phát, px
  var FALL_DEFAULT_Y = 380;
  var FALL_DROP = 70;                // thả từ cao hơn chỗ an toàn 70 px ("rơi từ trên trời xuống")
  var FALL_INVULN = 1.5;             // giây bất tử sau khi được thả xuống
  var FLAG_RAISE_TIME = 0.5;         // giây dựng cờ checkpoint
  var FLAG_SPARKLE_TIME = 1.2;       // giây lấp lánh sau khi dựng cờ
  var CHECKPOINT_END_MARGIN = 200;   // không đặt cờ tự động trong 200 px cuối trước cửa ra
  var GROUND_EDGE = 10;              // điểm đặt cờ phải cách mép bục ≥ 10 px
  var SOLID_SCAN = 400;              // tìm chỗ có nền trong phạm vi ±400 px ...
  var SOLID_STEP = 20;               // ... bước 20 px
  var SOLID_MIN_X = 40;              // không dời cờ về sát mép trái màn

  // 💡 Khái niệm: data-driven tuning — "độ khó" là MỘT BẢNG SỐ, không phải code. Thêm chế độ 'easy' chỉ cần thêm
  //   một object cùng khoá; người thiết kế game chỉnh cảm giác chơi mà không đụng logic.
  // ⚠️ Bẫy: 'challenge' giữ đúng giá trị v1 (smoke test chạy chế độ này cho chiến dịch cổ điển) — đổi số ở đây
  //   là đổi cảm giác bản gốc và có thể làm test kiểm tra hành vi v1 thất bại.
  var MODES = {
    kid: {
      label: 'Bé chơi', emoji: '🧸',
      lives: 5,                 // số mạng đầu lượt
      coyoteTime: 0.15,         // giây vẫn nhảy được sau khi rời mép
      jumpBuffer: 0.15,         // giây nhớ phím nhảy bấm sớm trước khi chạm đất
      jumpHoldGravityMul: 0.72, // giữ nút nhảy khi đang lên: trọng lực nhẹ hơn -> nhảy cao hơn (~150px thay vì 116px)
      fallGravityMul: 0.86,     // rơi chậm hơn một chút
      maxFallMul: 0.8,          // tốc độ rơi tối đa thấp hơn (dễ canh đáp)
      enemyHitboxScale: 0.7,    // hộp gây sát thương của địch thu nhỏ còn 70%
      enemySpeedMul: 0.7,       // địch đi chậm hơn
      grazePx: 6,               // chạm sượt dưới 6px không tính
      stompTolerance: 24,       // px: đáy người chơi (frame trước) chỉ cần cao hơn đỉnh địch + chừng này
      hurtKnockMul: 0.7,        // bị đẩy lùi nhẹ hơn
      bossHpMul: 0.6,           // máu trùm còn 60% (làm tròn, tối thiểu 2)
      bossSpeedMul: 0.75,       // nhịp đòn trùm chậm lại (dt của boss.update nhân hệ số này)
      bossTelegraphMul: 1.3,    // thời gian báo trước đòn (state *Wind) dài hơn
      bossStunMul: 1.35,        // thời gian trùm choáng / sơ hở dài hơn
      bossRest: 0.9,            // giây nghỉ thở sau mỗi đòn (trùm đứng yên, giẫm được)
      hurtInvuln: 2.2,          // giây bất tử sau khi bị thương
      checkpoints: true,        // cờ checkpoint tự động
      checkpointSpacing: 600,   // px giữa các cờ tự động (khi màn không khai báo checkpoints)
      fallDamage: false,        // rơi vực: KHÔNG mất mạng, hồi về chỗ đứng an toàn gần nhất
      softFail: true,           // hết mạng trong hành trình: hồi đầy mạng tại checkpoint, không game over
      autoAssistAfter: 2        // thua 2 lần cùng màn -> bật trợ giúp
    },
    challenge: {
      label: 'Thử thách', emoji: '🔥',
      lives: 3, coyoteTime: 0.06, jumpBuffer: 0.08,
      jumpHoldGravityMul: 1, fallGravityMul: 1, maxFallMul: 1,
      enemyHitboxScale: 1, enemySpeedMul: 1, grazePx: 0, stompTolerance: 12, hurtKnockMul: 1,
      bossHpMul: 1, bossSpeedMul: 1, bossTelegraphMul: 1, bossStunMul: 1, bossRest: 0,
      hurtInvuln: 1.6, checkpoints: false, checkpointSpacing: 0,
      fallDamage: true, softFail: false, autoAssistAfter: 3
    }
  };
  // Hiệu ứng trợ giúp theo cấp (cộng dồn lên tham số chế độ).
  var ASSIST = [
    null,
    { enemySpeedMul: 0.85, bossHpMul: 0.8, bossSpeedMul: 0.9, shield: 1, extraLives: 1 },
    { enemySpeedMul: 0.7, bossHpMul: 0.6, bossSpeedMul: 0.8, shield: 2, extraLives: 2 }
  ];
  var CHEER = [
    'Cố lên! Bạn làm được mà! 💪',
    'Giỏi lắm! Thử lại lần nữa nhé! 🌟',
    'Không sao cả! Mình cùng thử lại nào! 😊'
  ];

  var mode = 'kid';
  // 💡 Khái niệm: cache có khoá phiên bản — params được đọc hàng chục lần mỗi frame; ta chỉ tính lại khi khoá
  //   (mode | màn | version) đổi. Thay vì tìm mọi chỗ cần xoá cache, chỉ cần version++ khi dữ liệu nguồn đổi.
  var version = 0;          // tăng khi mode/số lần thua đổi -> làm mới bộ nhớ đệm params
  var cache = { key: '', val: null };

  /** @returns {Object} vùng ext.difficulty trong save */
  function store() { return OG.Save.ns('difficulty'); }
  function fails() { var s = store(); if (!s.fails || typeof s.fails !== 'object') s.fails = {}; return s.fails; }
  function curLevelId() { return OG.Game && OG.Game.stage ? OG.Game.stage.levelId : null; }
  function toast(text, sec) { if (OG.DOM && OG.DOM.toast) OG.DOM.toast(text, sec); }

  /**
   * Tham số đã áp trợ giúp (đối tượng dùng chung, KHÔNG sửa). Đệm theo mode + màn + phiên bản.
   * @param {string|null} [levelId] mặc định màn đang chơi
   * @returns {Object<string, any>}
   */
  function computed(levelId) {
    if (levelId == null) levelId = curLevelId();
    var key = mode + '|' + levelId + '|' + version;
    if (cache.key === key && cache.val) return cache.val;
    var base = MODES[mode], out = {}, k;
    for (k in base) out[k] = base[k];
    out.mode = mode;
    out.shield = 0; out.extraLives = 0;
    var lv = D.assistLevel(levelId);
    out.assist = lv;
    var a = ASSIST[lv];
    // Trợ giúp NHÂN thêm vào tham số chế độ (kid ×0.7 rồi trợ giúp ×0.85 → địch còn ≈60% tốc độ).
    if (a) {
      out.enemySpeedMul *= a.enemySpeedMul;
      out.bossHpMul *= a.bossHpMul;
      out.bossSpeedMul *= a.bossSpeedMul;
      out.shield = a.shield;
      out.extraLives = a.extraLives;
    }
    cache = { key: key, val: out };
    return out;
  }

  var D = (OG.Difficulty = {
    MODES: MODES,
    ASSIST: ASSIST,

    /** Đọc chế độ đã lưu, đăng ký listener và level hook checkpoint. main.js gọi ĐẦU TIÊN trong FEATURE_INIT_ORDER. */
    init: function () {
      var m = OG.Save.data.settings && OG.Save.data.settings.difficulty;
      mode = MODES[m] ? m : 'kid';
      version++;
      OG.Events.on('save:reset', function () { mode = 'kid'; version++; });
      // Thắng màn -> xoá đếm thua. Game over (challenge / cổ điển) -> tính 1 lần thua.
      OG.Events.on('level:complete', function (r) { if (r && r.levelId) D.recordClear(r.levelId); });
      OG.Events.on('game:over', function (e) { var id = e && e.result && e.result.levelId; if (id) D.recordFail(id); });
      // Checkpoint là một level hook (OG.Level.addHook) — xem cuối file.
      if (OG.Level && OG.Level.addHook) OG.Level.addHook(checkpointHook);
    },

    /** @returns {string} 'kid' | 'challenge' */
    mode: function () { return mode; },
    /** @returns {boolean} */
    isKid: function () { return mode === 'kid'; },
    /** @param {string} [m] mặc định chế độ hiện tại @returns {string} vd '🧸 Bé chơi' */
    label: function (m) { var d = MODES[m || mode]; return d ? d.emoji + ' ' + d.label : String(m); },
    /** @returns {string[]} */
    list: function () { return Object.keys(MODES); },
    /**
     * Đổi chế độ, lưu vào settings và phát 'difficulty:change'. Chế độ lạ hoặc trùng thì bỏ qua.
     * @param {string} m 'kid' | 'challenge'
     * @returns {string} chế độ sau khi đổi
     */
    set: function (m) {
      if (!MODES[m] || m === mode) return mode;
      var prev = mode;
      mode = m;
      version++;
      if (OG.Save.data && OG.Save.data.settings) OG.Save.setSetting('difficulty', m);
      OG.Events.emit('difficulty:change', { mode: m, prev: prev });
      return mode;
    },
    /** Chuyển qua lại kid ↔ challenge. @returns {string} */
    toggle: function () { return D.set(mode === 'kid' ? 'challenge' : 'kid'); },

    /**
     * Lấy BẢN SAO tham số đã áp trợ giúp cho màn (mặc định màn đang chơi) — sửa thoải mái, không ảnh hưởng cache.
     * @param {string} [levelId]
     * @returns {Object<string, any>}
     */
    params: function (levelId) {
      var src = computed(levelId), out = {};
      for (var k in src) out[k] = src[k];
      return out;
    },
    /**
     * Đọc một tham số độ khó (nhanh, không sao chép).
     * @param {string} key vd 'coyoteTime', 'enemySpeedMul'
     * @param {string} [levelId]
     * @returns {any}
     * @example
     *   var coyote = OG.Difficulty.get('coyoteTime'); // 0.15 ở chế độ kid
     */
    get: function (key, levelId) { return computed(levelId)[key]; },

    // ---- Trợ giúp tự động ----
    /**
     * Tính cấp trợ giúp của màn: số lần thua / autoAssistAfter, tối đa ASSIST.length − 1.
     * 💡 Khái niệm: dynamic difficulty adjustment — game tự dễ dần khi người chơi kẹt (kid: thua 2 lần → cấp 1,
     *   4 lần → cấp 2), thắng màn thì xoá đếm. Bé không bao giờ bị "kẹt mãi" ở một màn.
     * @param {string} levelId
     * @returns {number} 0 = không trợ giúp
     */
    assistLevel: function (levelId) {
      if (!levelId || !OG.Save.data) return 0;
      var n = fails()[levelId] | 0, every = MODES[mode].autoAssistAfter || 2;
      return Math.min(ASSIST.length - 1, Math.floor(n / every));
    },
    /** @param {string} levelId @returns {boolean} */
    isAssist: function (levelId) { return D.assistLevel(levelId) > 0; },
    /**
     * Ghi một lần thua ở màn (commit save); lên cấp trợ giúp thì phát 'assist:on'.
     * @param {string} levelId
     * @returns {number} tổng số lần thua của màn
     */
    recordFail: function (levelId) {
      if (!levelId) return 0;
      var before = D.assistLevel(levelId);
      var f = fails();
      f[levelId] = (f[levelId] | 0) + 1;
      version++;
      OG.Save.commit();
      var after = D.assistLevel(levelId);
      if (after > before) OG.Events.emit('assist:on', { levelId: levelId, level: after, fails: f[levelId] });
      return f[levelId];
    },
    /** Xoá đếm thua khi thắng màn. @param {string} levelId */
    recordClear: function (levelId) {
      var f = fails();
      if (f[levelId]) { delete f[levelId]; version++; OG.Save.commit(); }
    },

    // ---- Hook do src/game gọi ----
    /** @returns {number} số mạng đầu lượt của chế độ hiện tại */
    startLives: function () { return MODES[mode].lives; },
    /**
     * Nhân tốc độ kẻ địch theo độ khó (SỬA e). Gọi trong OG.Enemies.create (sau init loại địch).
     * @param {Enemy} e
     * @returns {Enemy}
     */
    scaleEnemy: function (e) { e.speed *= D.get('enemySpeedMul'); return e; },
    /**
     * Thu nhỏ hộp gây sát thương: giữ đáy, co đều hai bên (đầu địch thấp xuống -> dễ giẫm, khó bị chạm oan).
     * 🧪 Thử: đổi enemyHitboxScale của kid 0.7 → 0.2 — gần như phải đâm thẳng vào chân gián mới bị đau.
     * @param {AABB} box hurtbox gốc (không bị sửa)
     * @returns {AABB} hurtbox mới (hoặc chính box nếu hệ số = 1)
     */
    enemyHurtbox: function (box) {
      var s = D.get('enemyHitboxScale');
      if (s === 1) return box;
      var w = box.w * s, h = box.h * s;
      return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h), w: w, h: h };
    },

    /**
     * Xét giẫm "rộng lượng": người chơi đang rơi (hoặc mục tiêu đang bay lên đụng chân) và đáy frame trước ở trên
     * đỉnh mục tiêu. prevTop = đỉnh mục tiêu ở frame trước (bù cho địch nhảy lên như Marky, để vẫn đạp được khi nó
     * đang nhảy). Chế độ kid: dung sai lớn hơn và chạm vào nửa trên khi đang rơi cũng tính là giẫm.
     * @param {PhysicsBody} p người chơi
     * @param {number} prevBottom đáy người chơi frame trước, px
     * @param {AABB} target
     * @param {number} [tol=12] dung sai người gọi yêu cầu, px (lấy max với stompTolerance của chế độ)
     * @param {number|null} [prevTop] đỉnh mục tiêu frame trước, px
     * @returns {boolean}
     */
    isStomp: function (p, prevBottom, target, tol, prevTop) {
      if (!target || !U.overlap(p, target)) return false;
      // y hướng xuống: max(y) = đỉnh THẤP hơn trong hai frame → dễ thoả điều kiện "chân ở trên đỉnh" hơn.
      var top = prevTop != null ? Math.max(target.y, prevTop) : target.y;
      var rising = prevTop != null && target.y < prevTop - RISING_EPS;
      if (!(p.vy > 0 || (rising && p.vy > -RISING_MAX_UP_SPEED))) return false;
      var t = Math.max(tol == null ? DEFAULT_STOMP_TOL : tol, D.get('stompTolerance') || DEFAULT_STOMP_TOL);
      if (prevBottom <= top + t) return true;
      // kid: rơi trúng nửa trên của mục tiêu
      return D.isKid() && p.vy > KID_STOMP_MIN_VY && p.y + p.h <= target.y + target.h * KID_STOMP_TOP_RATIO;
    },
    /**
     * Va chạm gây sát thương: bỏ qua chạm sượt (chồng lấn < grazePx theo một trục).
     * 💡 Khái niệm: graze (chạm sượt) — đo độ CHỒNG LẤN theo từng trục (ox, oy) thay vì chỉ hỏi "có giao không".
     *   Chồng lấn vài px thường là sai số / cảm giác "oan" của người chơi, nên không tính là trúng đòn.
     *   Ngưỡng không vượt 1/3 cạnh hộp để hộp nhỏ (đạn) vẫn trúng được.
     * @param {AABB} p
     * @param {AABB} box
     * @returns {boolean}
     */
    touches: function (p, box) {
      if (!box || !U.overlap(p, box)) return false;
      var g = D.get('grazePx') || 0;
      if (g <= 0) return true;
      var ox = Math.min(p.x + p.w, box.x + box.w) - Math.max(p.x, box.x);
      var oy = Math.min(p.y + p.h, box.y + box.h) - Math.max(p.y, box.y);
      return ox > Math.min(g, box.w / 3) && oy > Math.min(g, box.h / 3);
    },

    /**
     * Giảm máu trùm theo bossHpMul (SỬA boss). Gọi ngay sau OG.Bosses.create trong scene boss.
     * Trùm tự đọc arena.difficulty thì đánh dấu diffApplied (hàm này bỏ qua).
     * @param {BossInstance} boss
     * @param {Arena} arena
     * @returns {BossInstance}
     */
    setupBoss: function (boss, arena) {
      var mul = D.get('bossHpMul');
      // Trùm ghép (trio: máu = tổng thành viên) tự tính lại hp trong src/bosses/trio.js.
      if (!boss || boss.diffApplied || mul === 1 || typeof boss.maxHp !== 'number' || boss.members) return boss;
      var hp = Math.max(BOSS_MIN_HP, Math.round(boss.maxHp * mul));
      if (hp < boss.maxHp) { boss.maxHp = hp; boss.hp = Math.min(boss.hp, hp); }
      boss.diffApplied = true;
      return boss;
    },
    /** @returns {number} hệ số nhân dt của boss.update (< 1 = trùm chậm hơn) */
    bossTimeScale: function () { return D.get('bossSpeedMul'); },

    /**
     * Trợ giúp giữa trận: mỗi trùm (hoặc thành viên còn sống) mất 1 máu, không bao giờ về 0.
     * @param {BossInstance} boss
     * @param {Arena} [arena]
     * @returns {boolean} có trùm nào bị trừ máu không
     */
    weakenBoss: function (boss, arena) {
      if (!boss) return false;
      var hit = false;
      var list = boss.members ? boss.members : [boss];
      list.forEach(function (m) {
        if (!m || m.dead || !(m.hp > 1)) return;
        m.hp -= 1; hit = true;
        if (m.speedMul) m.speedMul *= 0.9;
        if (arena && arena.floatText && m.w) arena.floatText(m.x + m.w / 2, m.y - 20, '-1 ❤', '#ffc94a');
      });
      if (boss.members && typeof boss.syncHp === 'function') boss.syncHp();
      if (hit && OG.Game && OG.Game.hud.boss) { OG.Game.hud.boss.hp = boss.hp; OG.Game.refreshHud(); }
      return hit;
    },

    /**
     * Khiên + tim trợ giúp khi vào màn/trận (chỉ khi đang có trợ giúp). Có thể phát 'lives:change'.
     * @param {Player|null} p (bị SỬA: shield)
     * @param {string} levelId
     * @returns {number} cấp trợ giúp (0 = không làm gì)
     */
    applyAssist: function (p, levelId) {
      var P = computed(levelId);
      if (!P.assist) return 0;
      if (p) p.shield = Math.max(p.shield | 0, P.shield);
      var run = OG.Game && OG.Game.run;
      var want = P.lives + P.extraLives;
      if (run && !run.over && run.lives < want) {
        run.lives = want;
        run.maxLives = Math.max(run.maxLives, want);
        OG.Events.emit('lives:change', { lives: run.lives, maxLives: run.maxLives });
      }
      if (OG.Game) { OG.Game.hud.shield = p ? p.shield : 0; OG.Game.refreshHud(); }
      return P.assist;
    },

    /**
     * Ghi vị trí đứng an toàn (p.safeX/safeY): đứng vững trên nền (cả hai chân), không sát kẻ địch. Gọi mỗi frame.
     * 💡 Khái niệm: "điểm hồi sinh an toàn" — liên tục lưu lại chỗ người chơi vừa đứng vững; khi rơi hố chỉ cần
     *   thả về đó. Điều kiện chặt (không sát mép, không gần địch) để không hồi sinh vào chỗ lại rơi/bị đau ngay.
     * @param {Player} p
     * @param {{platforms?: Platform[], enemies?: Enemy[]}} [world]
     */
    trackSafe: function (p, world) {
      if (!p || !p.ground) return;
      if (world && world.platforms) {
        var foot = p.y + p.h, ok = false;
        for (var i = 0; i < world.platforms.length; i++) {
          var a = world.platforms[i];
          if (Math.abs(a.y - foot) < SAFE_FOOT_EPS && p.x >= a.x + SAFE_EDGE && p.x + p.w <= a.x + a.w - SAFE_EDGE) { ok = true; break; }
        }
        if (!ok) return;
        var es = world.enemies || [];
        for (var k = 0; k < es.length; k++) {
          var e = es[k];
          if (e && e.alive && Math.abs(e.x + e.w / 2 - (p.x + p.w / 2)) < SAFE_ENEMY_DX && Math.abs(e.y - p.y) < SAFE_ENEMY_DY) return;
        }
      }
      p.safeX = p.x; p.safeY = p.y;
    },
    /**
     * Rơi khỏi màn hình. Nếu chế độ không phạt rơi vực: thả Oggy "từ trên trời" xuống chỗ an toàn, phát
     * 'player:respawn' (SỬA p).
     * @param {Player} p
     * @param {any} [world]
     * @returns {boolean} true nếu đã xử lý (không mất mạng); false = người gọi tự trừ mạng như v1
     */
    onFall: function (p, world) {
      if (D.get('fallDamage')) return false;
      p.x = p.safeX != null ? p.safeX : FALL_DEFAULT_X;
      p.y = (p.safeY != null ? p.safeY : FALL_DEFAULT_Y) - FALL_DROP;
      p.vx = 0; p.vy = 0;
      p.inv = Math.max(p.inv, FALL_INVULN);
      p.invMax = Math.max(p.invMax || 0, p.inv + 1); // nhấp nháy nhưng không đổi sang dáng "đau"
      var cx = p.x + p.w / 2;
      if (OG.Particles) {
        OG.Particles.spawn(cx, p.y + p.h, { color: '#ffffff', count: 10, speed: 140 });
        OG.Particles.floatText(cx, p.y - 16, U.choice(['Bùm! Về chỗ cũ! 😄', 'Hụt chân rồi! 🙈', 'Oáp! Không sao! 😆']), '#ffc94a');
      }
      toast('Hụt chân rồi! Không sao đâu 😊');
      OG.Events.emit('player:respawn', { cause: 'fall', x: p.x, y: p.y, levelId: curLevelId() });
      return true;
    },
    /**
     * Hết mạng trong hành trình (chế độ kid): chơi tiếp tại checkpoint với đầy mạng; thẻ/trang đã nhặt vẫn giữ.
     * Phát 'lives:change' và 'player:respawn'.
     * 💡 Khái niệm: soft fail — thất bại có hậu quả nhẹ (quay lại cờ gần nhất) thay vì game over. Với trẻ nhỏ,
     *   mất hết tiến độ dễ làm bỏ cuộc; tính "thua" vẫn được ghi để bật trợ giúp tự động.
     * @param {{levelId?: string, cause?: string}} [info]
     * @returns {boolean} true nếu đã xử lý (OG.Game.loseLife sẽ không gọi gameOver)
     */
    softFail: function (info) {
      var run = OG.Game.run;
      if (!run || !run.journeyId || !D.get('softFail')) return false;
      var levelId = (info && info.levelId) || curLevelId();
      var assistBefore = D.assistLevel(levelId);
      D.recordFail(levelId);
      var P = computed(levelId);
      var assistUp = P.assist > assistBefore;
      run.lives = P.lives + P.extraLives;
      run.maxLives = Math.max(run.maxLives, run.lives);
      var p = null, scene = OG.Scenes.base();
      if (scene === 'level' && OG.Level.state) {
        var st = OG.Level.state;
        p = st.player;
        var cp = st.checkpoint || { x: st.level.spawn.x, y: st.level.spawn.y };
        p.x = cp.x; p.y = cp.y;
        p.safeX = cp.x; p.safeY = cp.y;
      } else if (scene === 'boss' && OG.BossScene && OG.BossScene.getPlayer()) {
        p = OG.BossScene.getPlayer();
        var A = OG.BossScene.getArena();
        p.x = 80; p.y = 300;
        // Trợ giúp vừa bật giữa trận: trùm yếu đi.
        if (assistUp && A) D.weakenBoss(OG.BossScene.getBoss(), A);
      }
      if (p) {
        p.vx = 0; p.vy = 0; p.inv = 2.5; p.invMax = 3;
        p.shield = Math.max(p.shield | 0, P.shield);
        if (OG.Game) OG.Game.hud.shield = p.shield;
        if (OG.Particles) OG.Particles.spawn(p.x + p.w / 2, p.y + p.h / 2, { color: '#ffc94a', count: 14, speed: 180 });
      }
      OG.Events.emit('lives:change', { lives: run.lives, maxLives: run.maxLives });
      OG.Events.emit('player:respawn', { cause: 'softfail', x: p ? p.x : 0, y: p ? p.y : 0, levelId: levelId });
      if (!U.call('Story', 'onSoftFail', { levelId: levelId, assist: P.assist })) {
        toast(assistUp ? 'Cố lên! Bạn được thêm tim và khiên nè 💪' : U.choice(CHEER), 2.2);
      }
      return true;
    }
  });

  // ---------------------------------------------------------------------------
  // Level hook: cờ checkpoint (chỉ khi params.checkpoints) + vị trí an toàn + trợ giúp lúc vào màn
  // ---------------------------------------------------------------------------

  /**
   * Tìm mặt nền tại x (ưu tiên nền thấp nhất = sàn).
   * @param {any} st LevelState
   * @param {number} x px thế giới
   * @returns {number|null} y mặt nền, hoặc null nếu là hố
   */
  function groundAt(st, x) {
    var best = null;
    for (var i = 0; i < st.platforms.length; i++) {
      var a = st.platforms[i];
      // y lớn hơn = thấp hơn (y hướng xuống) → chọn nền thấp nhất để cờ cắm trên sàn chứ không trên bục lơ lửng.
      if (x >= a.x + GROUND_EDGE && x <= a.x + a.w - GROUND_EDGE && (best == null || a.y > best)) best = a.y;
    }
    return best;
  }
  /**
   * Dời x tới chỗ có nền gần nhất (thử phải trước, rồi trái) để không cắm cờ giữa hố.
   * @param {any} st
   * @param {number} x
   * @returns {number}
   */
  function solidX(st, x) {
    for (var dx = 0; dx < SOLID_SCAN; dx += SOLID_STEP) {
      if (groundAt(st, x + dx) != null) return x + dx;
      if (x - dx > SOLID_MIN_X && groundAt(st, x - dx) != null) return x - dx;
    }
    return x;
  }

  /**
   * Vẽ cờ checkpoint dự phòng (khi Sprites không có prop 'checkpoint').
   * @param {CanvasRenderingContext2D} ctx đã áp camera
   * @param {Checkpoint} c
   * @param {number} gy mặt nền, px thế giới
   * @param {number} t giây
   */
  function drawFlag(ctx, c, gy, t) {
    // Cột cờ + lá cờ có mặt cười (vẫy theo gió), dựng lên khi chạm tới.
    // raise 0 → 1 trong FLAG_RAISE_TIME giây: lá cờ trượt từ thấp 40 px lên đỉnh cột.
    var raise = c.reached ? Math.min(1, c.raiseT / FLAG_RAISE_TIME) : 0;
    var top = gy - 78, fy = top + 2 + (1 - raise) * 40;
    var col = c.reached ? '#3fbf6f' : '#ffc94a';
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // đế
    ctx.fillStyle = '#17233d';
    ctx.beginPath(); ctx.ellipse(c.x, gy - 2, 13, 5, 0, 0, Math.PI * 2); ctx.fill();
    // cột
    U.fillRound(ctx, c.x - 4, top - 2, 8, gy - top, 4, '#17233d');
    U.fillRound(ctx, c.x - 2, top, 4, gy - top - 2, 2, '#f4f1e8');
    // lá cờ vẫy — cộng c.x vào pha để các cờ không vẫy đồng loạt
    var wave = Math.sin(t * 5 + c.x) * 3;
    ctx.beginPath();
    ctx.moveTo(c.x + 3, fy);
    ctx.quadraticCurveTo(c.x + 20, fy - 4 + wave, c.x + 40, fy + 4 + wave);
    ctx.quadraticCurveTo(c.x + 36, fy + 15, c.x + 40, fy + 26 - wave);
    ctx.quadraticCurveTo(c.x + 20, fy + 20 - wave, c.x + 3, fy + 26);
    ctx.closePath();
    ctx.fillStyle = col; ctx.fill();
    ctx.strokeStyle = '#17233d'; ctx.lineWidth = 3; ctx.stroke();
    // mặt cười trên lá cờ
    var fx = c.x + 20, fyc = fy + 12 + wave * 0.3;
    ctx.fillStyle = '#17233d';
    ctx.beginPath(); ctx.arc(fx - 5, fyc - 2, 2, 0, Math.PI * 2); ctx.arc(fx + 5, fyc - 2, 2, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (c.reached) ctx.arc(fx, fyc + 1, 5, 0.15 * Math.PI, 0.85 * Math.PI);
    else { ctx.moveTo(fx - 3, fyc + 4); ctx.lineTo(fx + 3, fyc + 4); }
    ctx.stroke();
    // núm cột
    ctx.fillStyle = '#ffc94a';
    ctx.beginPath(); ctx.arc(c.x, top - 3, 5, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2; ctx.stroke();
    // lấp lánh khi vừa dựng cờ
    if (c.reached && c.raiseT < FLAG_SPARKLE_TIME) {
      var k = c.raiseT / FLAG_SPARKLE_TIME;
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = '#ffd36b';
      for (var i = 0; i < 6; i++) {
        var a = i * Math.PI / 3 + t * 2, r = 20 + k * 30;
        ctx.beginPath(); ctx.arc(c.x + Math.cos(a) * r, fy + 10 + Math.sin(a) * r, 3.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  // 💡 Khái niệm: level hook — toàn bộ tính năng checkpoint nằm trong object này, gắn vào scene 'level' bằng
  //   OG.Level.addHook (xem init). level.js không có một dòng code nào về checkpoint. order 10 = chạy trước
  //   các hook học tập (learn 20, guide 30...) để vị trí an toàn được cập nhật sớm nhất trong frame.
  /** @type {LevelHook} */
  var checkpointHook = {
    id: 'checkpoints', order: 10,
    enter: function (st) {
      st.checkpoint = null;
      st.checkpoints = [];
      // Trợ giúp (sau khi thua nhiều lần): khiên + tim ngay khi vào màn.
      if (D.applyAssist(st.player, st.level.id)) toast(U.choice(CHEER) + ' (có trợ giúp)', 2);
      if (!D.get('checkpoints', st.level.id)) return;
      var xs = st.level.checkpoints;
      if (!xs) {
        xs = [];
        var gap = D.get('checkpointSpacing') || 600;
        for (var x = gap; x < st.level.exit.x - CHECKPOINT_END_MARGIN; x += gap) xs.push(x);
      }
      st.checkpoints = xs.map(function (x, i) {
        var sx = solidX(st, x);
        var gy = groundAt(st, sx);
        return { x: sx, y: gy != null ? gy : OG.FLOOR_Y, index: i, reached: false, raiseT: 0 };
      });
    },
    update: function (st, dt, p) {
      D.trackSafe(p, st);
      for (var i = 0; i < st.checkpoints.length; i++) {
        var c = st.checkpoints[i];
        if (c.reached) { c.raiseT += dt; continue; }
        // Chạm cờ = TÂM người chơi vượt qua x của cờ (không cần va chạm hitbox — nhảy qua trên đầu cũng tính).
        if (p.x + p.w / 2 < c.x) continue;
        c.reached = true;
        c.raiseT = 0;
        // Hồi sinh: đứng trên mặt nền tại cờ.
        st.checkpoint = { x: c.x - p.w / 2, y: c.y - p.h - 2 };
        OG.Particles.floatText(c.x, c.y - 96, 'Lưu điểm! 🚩', '#3fbf6f');
        OG.Particles.spawn(c.x + 20, c.y - 70, { color: '#3fbf6f', count: 10, speed: 150 });
        OG.Events.emit('checkpoint:reach', { levelId: st.level.id, index: c.index, x: c.x, y: c.y });
      }
    },
    drawWorld: function (ctx, st, t) {
      for (var i = 0; i < st.checkpoints.length; i++) {
        var c = st.checkpoints[i];
        if (OG.Sprites.drawProp && OG.Sprites.drawProp(ctx, 'checkpoint', c.x, c.y, t, { reached: c.reached, raise: Math.min(1, c.raiseT / FLAG_RAISE_TIME) })) continue;
        drawFlag(ctx, c, c.y, t);
      }
    }
  };
})();
