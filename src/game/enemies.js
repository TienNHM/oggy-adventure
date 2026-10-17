// @ts-check
/* ============================================================================
 * OG.Enemies — KẺ ĐỊCH THƯỜNG (gián tuần tra) + REGISTRY LOẠI KẺ ĐỊCH
 * ----------------------------------------------------------------------------
 * Vai trò:      Tạo kẻ địch từ LevelDef.enemies, cập nhật AI mỗi frame, vẽ, và cho biết hurtbox (vùng gây đau).
 *               Scene 'level' (và trùm qua arena.spawnEnemy) gọi create/update/draw/kill. Mở rộng loại mới
 *               qua OG.Enemies.registerType() mà không sửa code gọi.
 * Khái niệm:    registry + strategy pattern (mỗi loại tự mang init/update/draw riêng) · AI tuần tra qua lại ·
 *               state machine nhỏ bằng bộ đếm giờ (Joey: run → wait → dash) · trọng lực tự tính cho cú nhảy (Marky) ·
 *               hitbox vs hurtbox · AI "nhường" người chơi nhỏ tuổi (Dee Dee đứng yên khi bé tới gần)
 * Bài học:      docs/learn/09-ai-ke-dich-boss.md, docs/learn/04-vat-ly-va-cham-aabb.md (hurtbox)
 * Phụ thuộc:    OG.FLOOR_Y, OG.Config.GRAVITY, OG.Sprites.drawCharacter, OG.Difficulty.scaleEnemy/enemyHurtbox (tuỳ chọn)
 *               — đều đọc LÚC CHẠY
 * Event:        phát: (không — Level phát 'enemy:stomp') · nghe: (không)
 * API công khai: OG.Enemies.types, registerType(name, def), create(src, index), update(e, dt, world), draw(ctx, e, t),
 *               hurtbox(e), kill(e)
 * Đọc tiếp:     src/game/level.js (va chạm player ↔ địch) → src/game/difficulty.js (scaleEnemy, enemyHurtbox)
 *               → src/bosses/bosses.js (AI phức tạp hơn: trùm)
 * Dữ liệu:      Enemy, EnemySpawn, EnemyTypeDef (src/types.d.ts). x,y = góc TRÊN-TRÁI hitbox, px thế giới;
 *               mặc định đứng trên sàn (y = 480 − h).
 * ========================================================================== */

/**
 * @typedef {EnemyTypeDef & {hurtTop?: number}} EnemyTypeDefEx
 *   hurtTop: tỉ lệ (0..1) chiều cao phía TRÊN không gây đau (vd Dee Dee bụng mềm: 0.45)
 */

/**
 * @typedef {Object} EnemyWorld  thông tin màn mà AI kẻ địch được đọc
 * @property {Platform[]} [platforms]
 * @property {Player} [player]
 */
(function () {
  'use strict';
  var OG = window.OG;

  // ---- Giá trị mặc định khi EnemySpawn / EnemyTypeDef không ghi ----
  var DEFAULT_RANGE = 100;        // nửa quãng tuần tra quanh điểm xuất phát, px
  var DEFAULT_SPEED = 75;         // px/giây
  var DEFAULT_SCORE = 50;
  var ANIM_PHASE_RANGE = 3;       // lệch pha hoạt ảnh ngẫu nhiên, giây — đàn gián không bước chân đồng loạt
  var HURTBOX_INSET = 3;          // thu nhỏ hurtbox mỗi cạnh, px (công bằng: chạm "sượt" không bị đau)
  var DEAD_VISIBLE_TIME = 0.5;    // xác bẹp còn hiện, giây
  var DEAD_FADE_RATE = 2;         // alpha giảm 2/giây → mờ hẳn sau 0.5 giây
  var SQUASH_X = 1.2;             // hệ số bẹp khi bị giẫm (rộng ra, thấp xuống)
  var SQUASH_Y = 0.35;

  // ---- Joey: state machine run → wait → dash → run ----
  var JOEY_FIRST_RUN = 1.5;       // lần chạy đầu: 1.5 + [0,1) giây
  var JOEY_RUN_TIME = 1.6;        // các lần chạy sau: 1.6 + [0,1) giây
  var JOEY_WAIT_TIME = 0.6;       // đứng nhìn, giây
  var JOEY_DASH_TIME = 0.7;       // lao nhanh, giây
  var JOEY_DASH_MUL = 2;          // tốc độ khi lao = 2 × tốc độ thường

  // ---- Marky: nhảy cò cò ----
  var MARKY_HOP_SPEED = 380;      // vận tốc bật lên, px/giây (đỉnh ≈ 380²/(2·1500) ≈ 48 px)
  var MARKY_FIRST_HOP = 1;        // lần nhảy đầu sau 1 + [0,1.5) giây
  var MARKY_FIRST_HOP_RANDOM = 1.5;
  var MARKY_HOP_GAP = 1.6;        // các lần sau cách nhau 1.6 + [0,1.2) giây
  var MARKY_HOP_GAP_RANDOM = 1.2;

  // ---- Dee Dee: đứng ăn khi bé tới gần ----
  var DEEDEE_NEAR_X = 140;        // khoảng cách ngang (tâm–tâm) coi là "gần", px
  var DEEDEE_NEAR_Y = 160;        // chân người chơi cao hơn đỉnh Dee Dee không quá 160 px mới tính là gần
  var DEEDEE_CALM = 0.6;          // giây
  var DEEDEE_MIN_EAT = 0.2;       // khi gần: tiếp tục ăn ít nhất 0.2 giây nữa (làm mới mỗi frame)
  var DEEDEE_EAT_TIME = 1;        // một lần ăn tự phát, giây
  var DEEDEE_FIRST_EAT = 2;       // lần ăn đầu sau 2 + [0,2) giây
  var DEEDEE_EAT_GAP = 3;         // các lần sau cách nhau 3 + [0,2) giây
  var DEEDEE_EAT_RANDOM = 2;
  var LEDGE_SCAN_ABOVE = 70;      // bục nằm trong khoảng [đỉnh − 70, đỉnh + 10] px coi là "ngay trên đầu"
  var LEDGE_SCAN_BELOW = 10;

  /** @type {Object<string, EnemyTypeDefEx>} */
  var types = {};

  var Enemies = (OG.Enemies = {
    types: types,

    /**
     * Đăng ký (hoặc ghi đè) một loại kẻ địch.
     * 💡 Khái niệm: strategy pattern — mỗi loại là một object có cùng "giao diện" (init/update/draw). Code gọi
     *   chỉ biết Enemies.update(e) và tra types[e.type]; thêm loại mới KHÔNG phải sửa if/else ở đâu cả.
     * @param {string} name
     * @param {EnemyTypeDefEx} def {w, h, score, stompable, hurtTop, init(e, src), update(e, dt, world), draw(ctx, e, t)}
     * @returns {EnemyTypeDefEx}
     * @example
     *   OG.Enemies.registerType('snail', { w: 30, h: 20, score: 30,
     *     update: function (e, dt) { e.x += e.dir * e.speed * 0.3 * dt; },
     *     draw: function (ctx, e) { ctx.fillStyle = '#9b6'; ctx.fillRect(e.x, e.y, e.w, e.h); } });
     */
    registerType: function (name, def) { types[name] = def; return def; },

    /**
     * Tạo một kẻ địch từ dữ liệu màn. Loại lạ → dùng 'roach'. Gọi OG.Difficulty.scaleEnemy để chỉnh tốc độ.
     * @param {EnemySpawn} src một phần tử của level.enemies — {type, x, y?, range?, speed?, dir?}
     * @param {number} index vị trí trong mảng (con chẵn đi trái, con lẻ đi phải khi dữ liệu không ghi dir)
     * @returns {Enemy}
     */
    create: function (src, index) {
      var T = types[src.type] || types.roach;
      /** @type {Enemy} */
      var e = {
        type: src.type || 'roach', w: T.w, h: T.h,
        x: src.x, y: src.y != null ? src.y : OG.FLOOR_Y - T.h,
        base: src.x, range: src.range != null ? src.range : DEFAULT_RANGE,
        speed: src.speed != null ? src.speed : DEFAULT_SPEED,
        dir: src.dir != null ? src.dir : (index % 2 ? 1 : -1),
        alive: true, stompable: T.stompable !== false, hurts: true,
        score: T.score || DEFAULT_SCORE, t: Math.random() * ANIM_PHASE_RANGE, deadT: 0
      };
      if (T.init) T.init(e, src);
      OG.util.call('Difficulty', 'scaleEnemy', e); // tốc độ theo độ khó
      return e;
    },

    /**
     * Cập nhật một kẻ địch 1 frame (AI của loại tương ứng). Kẻ đã chết chỉ đếm deadT để làm hoạt ảnh bẹp.
     * @param {Enemy} e (bị SỬA)
     * @param {number} dt delta time, giây
     * @param {EnemyWorld} world
     */
    update: function (e, dt, world) {
      e.t += dt;
      // ⚠️ Bẫy: lưu đỉnh hitbox frame TRƯỚC (prevY). Kẻ địch tự nhảy (Marky) thì phép xét giẫm phải bù chuyển
      //   động của CẢ HAI bên; chỉ dùng prevBottom của người chơi sẽ tính nhầm "bị đâm" thành "giẫm" và ngược lại.
      e.prevY = e.y;
      if (!e.alive) { e.deadT += dt; return; }
      var T = types[e.type] || types.roach;
      T.update(e, dt, world);
    },

    /**
     * Vẽ kẻ địch (toạ độ thế giới). Xác bẹp ngừng vẽ sau 0.5 giây.
     * @param {CanvasRenderingContext2D} ctx
     * @param {Enemy} e
     * @param {number} t thời gian, giây
     */
    draw: function (ctx, e, t) {
      var T = types[e.type] || types.roach;
      if (!e.alive && e.deadT > DEAD_VISIBLE_TIME) return;
      T.draw(ctx, e, t);
    },

    /**
     * Tính hộp gây sát thương (hurtbox) của kẻ địch: hitbox thu nhỏ 3 px; OG.Difficulty có thể thu nhỏ thêm
     * (chế độ 'kid'). Trả object MỚI, không sửa e.
     * 💡 Khái niệm: hitbox vs hurtbox — hitbox (hình chữ nhật thật để giẫm/đứng) khác hurtbox (vùng làm người chơi
     *   đau). Hurtbox nhỏ hơn một chút làm game "công bằng": chạm sượt mép không bị trừ mạng.
     * @param {Enemy} e
     * @returns {AABB}
     */
    hurtbox: function (e) {
      var box = { x: e.x + HURTBOX_INSET, y: e.y + HURTBOX_INSET, w: e.w - HURTBOX_INSET * 2, h: e.h - HURTBOX_INSET };
      // Loại có hurtTop (vd Dee Dee bụng mềm): phần trên cùng không gây đau.
      var T = types[e.type];
      if (T && T.hurtTop) { var cut = e.h * T.hurtTop; box.y = e.y + cut; box.h = e.h - cut; }
      return OG.util.call('Difficulty', 'enemyHurtbox', box) || box;
    },

    /**
     * Đánh dấu kẻ địch đã bị giẫm (bắt đầu hoạt ảnh bẹp).
     * @param {Enemy} e
     */
    kill: function (e) { e.alive = false; e.deadT = 0; }
  });

  // ---------------------------------------------------------------------------
  // Gián con: tuần tra kiểu MVP — đi qua lại ±range quanh base.
  // ---------------------------------------------------------------------------
  Enemies.registerType('roach', {
    w: 34, h: 28, score: 50,
    update: function (e, dt) {
      e.x += e.dir * e.speed * dt;
      // 💡 Khái niệm: AI tuần tra — chỉ cần một điểm gốc (base), bán kính (range) và hướng (dir). Ra quá biên thì
      //   quay đầu. Không tìm đường, không nhìn người chơi, nhưng đủ tạo "chướng ngại di động" để canh nhịp nhảy.
      if (Math.abs(e.x - e.base) > e.range) e.dir *= -1;
    },
    draw: function (ctx, e, t) {
      ctx.save();
      ctx.translate(e.x + e.w / 2, e.y + e.h);
      if (!e.alive) {
        // bẹp dí rồi mờ dần (scale quanh chân vì đã translate về chân)
        ctx.globalAlpha = Math.max(0, 1 - e.deadT * DEAD_FADE_RATE);
        ctx.scale(SQUASH_X, SQUASH_Y);
      }
      OG.Sprites.drawCharacter(ctx, 'roach', e.alive ? 'run' : 'hurt', e.t, { face: e.dir, w: e.w, h: e.h });
      ctx.restore();
    }
  });

  // ---------------------------------------------------------------------------
  // Bộ ba gián xuất hiện như kẻ địch thường trong màn (dùng sprite Joey / Marky / Dee Dee)
  // ---------------------------------------------------------------------------

  /**
   * Tạo hàm vẽ chung cho bộ ba: neo ở chân, bẹp + mờ dần khi bị giẫm.
   * @param {string} charId
   * @param {(e: Enemy) => string} anim chọn trạng thái hoạt ảnh khi còn sống
   * @returns {(ctx: CanvasRenderingContext2D, e: Enemy, t: number) => void}
   */
  function drawTrio(charId, anim) {
    return function (ctx, e, t) {
      ctx.save();
      ctx.translate(e.x + e.w / 2, e.y + e.h);
      if (!e.alive) {
        ctx.globalAlpha = Math.max(0, 1 - e.deadT * DEAD_FADE_RATE);
        ctx.scale(SQUASH_X, SQUASH_Y);
      }
      OG.Sprites.drawCharacter(ctx, charId, e.alive ? anim(e) : 'hurt', e.t, { face: e.dir, w: e.w, h: e.h, time: t });
      ctx.restore();
    };
  }

  /**
   * Tuần tra có KẸP biên: khác roach ở chỗ đặt lại x đúng biên, nên tốc độ lao (dash) lớn cũng không trôi xa dần.
   * @param {Enemy} e
   * @param {number} dt giây
   * @param {number} speed px/giây
   */
  function patrol(e, dt, speed) {
    e.x += e.dir * speed * dt;
    if (e.x - e.base > e.range) { e.x = e.base + e.range; e.dir = -1; }
    else if (e.base - e.x > e.range) { e.x = e.base - e.range; e.dir = 1; }
  }

  // Joey: nhỏ, nhanh, thỉnh thoảng đứng lại nhìn rồi lao nhanh gấp đôi.
  Enemies.registerType('joey', {
    w: 30, h: 40, score: 70,
    init: function (e) { e.mode = 'run'; e.modeT = JOEY_FIRST_RUN + Math.random(); },
    update: function (e, dt) {
      // 💡 Khái niệm: state machine bằng bộ đếm giờ — mode là trạng thái, modeT là thời gian còn lại.
      //   Hết giờ thì sang trạng thái kế: run → wait → dash → run. Khoảng "wait" chính là telegraph
      //   (báo hiệu trước) để người chơi kịp phản ứng trước cú lao.
      e.modeT -= dt;
      if (e.modeT <= 0) {
        e.mode = e.mode === 'run' ? 'wait' : (e.mode === 'wait' ? 'dash' : 'run');
        e.modeT = e.mode === 'wait' ? JOEY_WAIT_TIME : e.mode === 'dash' ? JOEY_DASH_TIME : JOEY_RUN_TIME + Math.random();
      }
      // 🧪 Thử: đổi JOEY_DASH_MUL 2 → 5 rồi vào màn 'roof' — Joey lao như tên bắn (vẫn không ra khỏi vùng tuần tra).
      if (e.mode !== 'wait') patrol(e, dt, e.speed * (e.mode === 'dash' ? JOEY_DASH_MUL : 1));
    },
    draw: drawTrio('joey', function (e) { return e.mode === 'wait' ? 'idle' : e.mode === 'dash' ? 'attack' : 'run'; })
  });

  // Marky: cao gầy, đi chậm, nhảy cò cò (e.hop = độ cao so với sàn, âm = đang ở trên; hitbox nâng theo).
  Enemies.registerType('marky', {
    w: 30, h: 60, score: 70,
    init: function (e) { e.hop = 0; e.hopV = 0; e.hopT = MARKY_FIRST_HOP + Math.random() * MARKY_FIRST_HOP_RANDOM; e.groundY = e.y; },
    update: function (e, dt) {
      patrol(e, dt, e.speed);
      e.hopT -= dt;
      if (e.hopT <= 0 && e.hop === 0) { e.hopV = -MARKY_HOP_SPEED; e.hopT = MARKY_HOP_GAP + Math.random() * MARKY_HOP_GAP_RANDOM; }
      // Tự tích phân trọng lực trên trục "hop" thay vì dùng OG.Physics: Marky chỉ nhảy tại chỗ trên sàn,
      // không cần va chạm bục. Math.min(0, …) = chạm sàn thì dừng.
      if (e.hopV !== 0 || e.hop < 0) {
        e.hopV += OG.Config.GRAVITY * dt;
        e.hop = Math.min(0, e.hop + e.hopV * dt);
        if (e.hop === 0) e.hopV = 0;
      }
      e.y = e.groundY + e.hop; // hitbox theo cú nhảy
    },
    draw: drawTrio('marky', function (e) { return e.hop < 0 ? (e.hopV < 0 ? 'jump' : 'fall') : 'walk'; })
  });

  // Dee Dee: to béo, đi chậm, thỉnh thoảng dừng lại "ăn" (attack) — giẫm được mọi lúc.
  // Thiết kế cho trẻ em (Dee Dee hay đứng chắn khe hẹp giữa hai bục, như ở màn kitchen / home-kitchen-1):
  //  - không bao giờ đứng dưới bục một chiều (ở đó không giẫm được) — tầm tuần tra bị kẹp lại;
  //  - khi người chơi tới gần (≤140px) thì đứng yên ăn bánh (mục tiêu đứng im, dễ giẫm/nhảy qua);
  //  - bụng mềm: chỉ nửa dưới gây đau (hurtTop), nửa trên coi như đầu để giẫm.

  /**
   * Có bục (không phải sàn) nằm ngay trên đầu đoạn [x0, x1] không.
   * @param {EnemyWorld} world
   * @param {number} x0 mép trái, px thế giới
   * @param {number} x1 mép phải, px thế giới
   * @param {number} top đỉnh hitbox kẻ địch, px thế giới
   * @returns {boolean}
   */
  function underLedge(world, x0, x1, top) {
    var ps = (world && world.platforms) || [];
    for (var i = 0; i < ps.length; i++) {
      var plat = ps[i];
      if (plat.isFloor || plat.y >= OG.FLOOR_Y - 1) continue;
      if (plat.y > top - LEDGE_SCAN_ABOVE && plat.y < top + LEDGE_SCAN_BELOW && x1 > plat.x && x0 < plat.x + plat.w) return true;
    }
    return false;
  }
  Enemies.registerType('deedee', {
    w: 50, h: 50, score: 80, hurtTop: 0.45,
    init: function (e) { e.eatT = 0; e.nextEat = DEEDEE_FIRST_EAT + Math.random() * DEEDEE_EAT_RANDOM; e.calm = 0; },
    update: function (e, dt, world) {
      var p = world && world.player;
      // 💡 Khái niệm: AI "nhường" người chơi — kẻ địch phản ứng với vị trí người chơi theo hướng làm game DỄ hơn
      //   (đứng yên cho bé giẫm), ngược với AI đuổi bắt thông thường. Độ khó là một quyết định thiết kế.
      var near = p && Math.abs(p.x + p.w / 2 - (e.x + e.w / 2)) < DEEDEE_NEAR_X && p.y + p.h > e.y - DEEDEE_NEAR_Y;
      if (near) { e.calm = DEEDEE_CALM; e.eatT = Math.max(e.eatT, DEEDEE_MIN_EAT); }
      if (e.eatT > 0) { e.eatT -= dt; return; }
      e.nextEat -= dt;
      if (e.nextEat <= 0) { e.eatT = DEEDEE_EAT_TIME; e.nextEat = DEEDEE_EAT_GAP + Math.random() * DEEDEE_EAT_RANDOM; return; }
      var ox = e.x;
      patrol(e, dt, e.speed);
      // Bước này đưa Dee Dee vào dưới bục → hoàn tác bước đi và quay đầu (kẹp tầm tuần tra bằng "thử rồi lùi").
      if (underLedge(world, e.x, e.x + e.w, e.y)) { e.x = ox; e.dir *= -1; }
    },
    draw: drawTrio('deedee', function (e) { return e.eatT > 0 ? 'attack' : 'walk'; })
  });
})();
