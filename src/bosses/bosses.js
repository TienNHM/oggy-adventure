// @ts-check
/* ============================================================================
 * OG.Bosses — REGISTRY TRÙM + BỘ CÔNG CỤ DÙNG CHUNG (kit) + KHUNG TRÙM STATE MACHINE
 * ----------------------------------------------------------------------------
 * Vai trò:      Nơi các file trùm (joey.js, marky.js, deedee.js, trio.js) đăng ký định nghĩa lúc load,
 *               và nơi scene 'boss' (src/game/boss-scene.js) gọi create(id, arena) để lấy một trùm đang đánh.
 *               OG.Bosses.kit chứa phần dùng chung: khung trùm (createBase), đạn, telegraph, vẽ dự phòng.
 * Khái niệm:    registry (bảng đăng ký theo id) · finite state machine (máy trạng thái hữu hạn) cho AI trùm ·
 *               telegraph (báo hiệu trước đòn) · phase theo ngưỡng máu · i-frames (thời gian bất tử) ·
 *               hitbox vs hurtbox vs weakspot · pattern xoay vòng · strategy qua hàm gán thêm (think/startAction) ·
 *               damping độc lập frame rate (v *= k^dt) · cô lập lỗi bằng try/catch + hình dự phòng
 * Bài học:      docs/learn/09-ai-ke-dich-boss.md (chính) · docs/learn/07-ve-canvas-procedural-cache.md (vẽ telegraph)
 * Phụ thuộc:    LÚC LOAD: OG.util (namespace.js), OG.Events (đăng ký listener ngay khi load).
 *               LÚC CHẠY: OG.Config.GRAVITY, OG.Sprites.drawCharacter/getAnimStates, OG.Data.characters,
 *               OG.Physics.isStomp, OG.Player.hurt, OG.Camera.shake, OG.Particles, OG.DOM.toast, OG.Game.addScore,
 *               OG.Enemies.create, OG.font (đều kiểm tra tồn tại trước khi dùng).
 * Event:        phát: 'boss:phase', 'boss:hit' (source:'reflect') · bộ điều khiển độc lập còn phát
 *               'boss:start', 'boss:hit', 'boss:defeated' · nghe: 'player:action'
 * API công khai: OG.Bosses.init/register/has/list/getInfo/getArena/create · OG.Bosses.factories[id](arena, cfg) ·
 *               OG.Bosses.kit.* · (tuỳ chọn) OG.Bosses.start/update/draw/stop/active
 * Đọc tiếp:     src/bosses/deedee.js (trùm đơn giản nhất: roll → dizzy) → src/bosses/joey.js (đạn phản được)
 *               → src/bosses/marky.js (bẫy, sóng xung kích) → src/bosses/trio.js (điều phối lượt 3 trùm)
 *               → src/game/boss-scene.js (scene dùng BossInstance) → src/game/difficulty.js (tham số độ khó)
 * Dữ liệu:      BossDef, BossInstance, Arena (src/types.d.ts) · BossSpec, BossCfg, BossProjectile,
 *               BossDifficulty, BossFight (typedef ngay bên dưới, dùng chung cho các file trùm)
 *
 * Hợp đồng (docs/ARCHITECTURE.md mục 8.3):
 *   init()  register(def)  has(id)  list()  getInfo(id)  getArena(id)  create(id, arena)
 *   def = { id, name, maxHp, arena?: {width, platforms:[[x,y,w,h]], spawn:{x,y}, theme}, create(arena) -> BossInstance }
 *   BossInstance = { id, name, hp, maxHp, phase, x, y, w, h, update(dt, arena), draw(ctx, arena),
 *                    getHurtboxes() -> [rect], getWeakspot() -> rect|null, onHit(dmg, arena), isDefeated() }
 *   Mở rộng (scene 'boss' KHÔNG dùng): start(bossId, arenaLike) -> fight|null tự lo giẫm/chạm/emit
 *   boss:start|hit|defeated; update(dt), draw(ctx), stop(), active(); factories[id](arena, cfg) để tạo trùm
 *   có cấu hình (trio dùng lại joey/marky/deedee).
 *
 * Cơ chế chung của mọi trùm:
 *   - Có 2–3 pha theo ngưỡng máu (phaseAt). Đổi pha: trùm gầm (bất tử ngắn) và tự phát 'boss:phase'.
 *   - Mọi đòn đều có báo trước (chấm than, vùng đỏ trên sàn, mũi tên, bóng đổ). Quy ước tên: trạng thái
 *     báo trước đòn kết thúc bằng "Wind" (wind-up — lấy đà), vd 'rollWind' → 'roll'.
 *   - Điểm yếu: giẫm lên đầu khi trùm lộ sơ hở (có mũi tên vàng "GIẪM!"), hoặc nhấn E/J (nút ✦)
 *     gần đạn có thể phản (nắp chai, cờ lê) để đánh bật nó về phía trùm.
 *   - Sau khi trúng đòn: bất tử 1,2 s và không gây sát thương khi chạm trong 0,9 s (công bằng sau cú giẫm).
 *   - Biến `b` trong mọi file trùm = chính BossInstance đang xét (giống `p` = player).
 *   - Toạ độ: mọi thứ ở toạ độ THẾ GIỚI của đấu trường (gốc góc trên-trái, rộng ~960 px, sàn ở floorY).
 *     b.x, b.y = góc trên-trái hitbox trùm; hàm vẽ thân dùng gốc ở CHÂN (giữa-đáy hitbox).
 * ========================================================================== */

/**
 * @typedef {Object} BossSpec  thông số cố định của một loại trùm (khai báo ở đầu mỗi file trùm)
 * @property {string} id
 * @property {string} name
 * @property {string} charId  id nhân vật để OG.Sprites vẽ ('joey' | 'marky' | 'deedee')
 * @property {number} maxHp
 * @property {number} [scale]  hệ số phóng to so với kích thước gốc trong OG.Data.characters
 * @property {number} [baseW]  bề ngang gốc (px) nếu OG.Data chưa có
 * @property {number} [baseH]  chiều cao gốc (px) nếu OG.Data chưa có
 * @property {number[]} [phaseAt]  ngưỡng máu đổi pha, vd [4, 2]: hp ≤ 4 → pha 2, hp ≤ 2 → pha 3
 * @property {Object<number, string>} [phaseLines]  câu toast khi vào pha 2, 3
 * @property {Object<number, string[]>} [patterns]  pha → danh sách đòn lần lượt dùng (xoay vòng)
 */

/**
 * @typedef {Object} BossCfg  cấu hình khi tạo trùm qua factories[id](arena, cfg) — mọi field đều tuỳ chọn
 * @property {number} [maxHp]  ghi đè máu (trio dùng; khi có thì KHÔNG co máu theo độ khó nữa)
 * @property {number} [scale]
 * @property {number[]} [phaseAt]
 * @property {boolean} [emitPhase]  false = không tự phát 'boss:phase' (trio tự phát thay)
 * @property {number} [speedMul]  hệ số tốc độ đòn đánh (1 = bình thường)
 * @property {BossTurnCtrl} [ctrl]  bộ điều phối lượt (trận nhiều trùm)
 * @property {Object} [root]  trùm "gốc" giữ tổng máu (trio)
 * @property {number} [x]  vị trí ban đầu theo x (px, góc trái hitbox)
 * @property {Object<number, string[]>} [patterns]
 * @property {boolean} [miniBar]  vẽ thanh máu nhỏ trên đầu
 * @property {function(Object, Object): void} [onDeath]  gọi khi trùm gục (mặc định: dọn lính)
 * @property {string} [name]
 * @property {number} [summonCount]  (joey) số lính mỗi lần gọi
 * @property {number} [capCount]  (joey) số nắp chai mỗi lần ném
 */

/**
 * @typedef {Object} BossTurnCtrl  bộ điều phối lượt: chỉ trùm đang "giữ lượt" được ra đòn
 * @property {function(Object): boolean} request  xin lượt; true = được đánh
 * @property {function(Object): void} release  trả lượt sau khi đánh xong
 */

/**
 * @typedef {Object} BossProjectile  đạn / bẫy do trùm sinh ra qua kit.spawnProj. Toạ độ THẾ GIỚI, (x, y) = TÂM.
 * @property {string} kind  khoá trong kit.drawers để chọn hàm vẽ: 'cap' | 'wrench' | 'wave' | 'trap' | 'pot'
 * @property {number} x
 * @property {number} y
 * @property {number} [r]  bán kính (px); hitbox mặc định là hình vuông 2r × 2r quanh tâm
 * @property {number} [vx]  px/giây
 * @property {number} [vy]  px/giây
 * @property {number} [g]  trọng lực riêng (px/giây²); 0 = bay thẳng
 * @property {number} [ax]  gia tốc ngang (px/giây²), vd cờ lê boomerang
 * @property {number} [life]  số giây còn sống (hết thì tự biến mất)
 * @property {number} [t]  số giây đã sống (dùng làm thời gian hoạt ảnh)
 * @property {boolean} [hurts]  chạm người chơi có gây sát thương không
 * @property {boolean} [armed]  undefined = luôn nguy hiểm; false = bẫy chưa giương (vô hại)
 * @property {boolean} [reflectable]  có thể bị đánh bật bằng phím action
 * @property {boolean} [reflected]  đã bị đánh bật → bay về phía trùm, không còn hại người chơi
 * @property {number} [bounces]  số lần đã nảy trên sàn
 * @property {number} [maxBounces]
 * @property {boolean} [dead]  true = sẽ bị xoá khỏi danh sách ở lượt cập nhật này
 * @property {Object} [owner]  trùm đã sinh ra viên đạn (đích bay về khi bị phản)
 * @property {function(BossProjectile): AABB} [rect]  hitbox riêng (bẫy, sóng)
 * @property {function(BossProjectile, number, Object, Object): void} [update]  tự di chuyển thay cho vật lý mặc định
 * @property {function(BossProjectile, Object, Object): void} [onFloor]  chạm sàn (mặc định: nảy hoặc vỡ)
 * @property {function(BossProjectile, Object, Object): void} [onHitPlayer]  trúng người chơi (mặc định: biến mất)
 * @property {number} [floorY]  (pot, trap, wave) mặt sàn, px
 * @property {number} [hgt]  (wave) chiều cao sóng, px
 * @property {number} [armT]  (trap) số giây còn lại trước khi giương
 * @property {number} [armMax]  (trap) tổng thời gian giương
 * @property {boolean} [snapped]  (trap) đã sập
 */

/**
 * @typedef {Object} BossDifficulty  tham số độ khó đã chuẩn hoá từ arena.difficulty (OG.Difficulty.params)
 * @property {boolean} kid  chế độ trẻ em: vẽ telegraph rõ hơn
 * @property {number} hpMul  hệ số máu trùm (< 1 = ít máu hơn)
 * @property {number} telegraph  hệ số thời gian báo trước đòn (> 1 = báo lâu hơn)
 * @property {number} stun  hệ số thời gian sơ hở (> 1 = choáng lâu hơn)
 * @property {number} rest  số giây nghỉ thở (breather) sau mỗi đòn; 0 = không nghỉ
 */

/**
 * @typedef {Object} BossFight  trận do bộ điều khiển độc lập OG.Bosses.start quản lý
 * @property {string} bossId
 * @property {Object} arena
 * @property {Object} boss  BossInstance
 * @property {boolean} done  đã phát 'boss:defeated'
 * @property {number} t  giây đã đánh
 */
(function () {
  'use strict';
  var OG = window.OG;
  var U = OG.util;
  /** @type {Object<string, BossDef>} id trùm -> định nghĩa đã đăng ký */
  var defs = {};

  // ---------------------------------------------------------------------------
  // Hằng số chung (giây / px / px/giây)
  // ---------------------------------------------------------------------------
  var INV_TIME = 1.2;          // giây bất tử (i-frames) sau khi trúng đòn
  var STAGGER_TIME = 0.9;      // giây hurtbox tắt sau khi trúng đòn (người chơi rơi lại xuống không bị thương oan)
  var HIT_FLASH_TIME = 0.3;    // giây thân trùm nháy trắng khi trúng đòn
  var REFLECT_RANGE = 80;      // px: khoảng cách từ tâm người chơi tới đạn để đánh bật được
  var REFLECT_SPEED = 600;     // px/giây: tốc độ đạn bay ngược về trùm
  var REFLECT_COOLDOWN = 0.5;  // giây hồi chiêu giữa 2 cú vung đánh bật
  var REFLECTED_LIFE = 2;      // giây sống của đạn sau khi bị đánh bật
  var PHASE_ROAR_INV = 1.4;    // giây bất tử tối thiểu khi gầm đổi pha
  var PHASE_ROAR_TIME = 1.1;   // giây của trạng thái 'roar'
  var RECOIL_SPEED = 160;      // px/giây bị đẩy lùi khi trúng đòn (trùm không có onHurt riêng)
  var RECOIL_TIME = 0.6;       // giây của trạng thái 'recoil'
  var MAX_FALL_SPEED = 1100;   // px/giây: vận tốc rơi tối đa của trùm
  var DEATH_HOP_VY = -420;     // px/giây: cú bật lên khi gục (âm = đi lên)
  var DEATH_PUSH_VX = 120;     // px/giây: văng ra xa người chơi khi gục
  var BOUNCE_KEEP_VY = 0.5;    // tỉ lệ vận tốc dọc còn lại sau mỗi lần đạn nảy
  var BOUNCE_KEEP_VX = 0.8;    // tỉ lệ vận tốc ngang còn lại sau mỗi lần đạn nảy
  var PROJ_MARGIN_X = 80;      // px: đạn ra ngoài sân quá chừng này theo chiều ngang thì xoá
  var PROJ_MARGIN_BELOW = 120; // px: đạn rơi dưới sàn quá chừng này thì xoá

  function gravity() { return (OG.Config && OG.Config.GRAVITY) || 1500; }

  // ---------------------------------------------------------------------------
  // Kit: tiện ích dùng chung cho các file trùm (OG.Bosses.kit, các file trùm gọi là K).
  // ---------------------------------------------------------------------------
  var K = {
    // 💡 Khái niệm: đổi event thành bộ đếm. Listener 'player:action' chỉ tăng số; mỗi trùm nhớ số đã thấy
    //   (b._seenAction) nên tự biết "có cú bấm MỚI" mà không cần đọc OG.Input → bosses không phụ thuộc Input.
    actionSeq: 0,          // tăng mỗi khi người chơi nhấn action (E/J/✦)
    INV_TIME: INV_TIME,
    STAGGER_TIME: STAGGER_TIME,
    drawers: {},           // kind -> function(ctx, proj, t, boss) vẽ đạn; file trùm tự đăng ký loại đạn của mình
    _spriteBroken: false,  // true sau lần đầu OG.Sprites.drawCharacter ném lỗi → luôn vẽ hình dự phòng
    _anims: null           // cache danh sách animState mà Sprites hỗ trợ
  };

  /**
   * Gọi an toàn arena[name](...args) nếu arena có hàm đó; lỗi chỉ được log, không lan ra ngoài.
   * Nhờ vậy trùm chạy được cả với arena "thiếu" (stub, test) — không có hàm thì coi như không làm gì.
   * @param {Object} arena  đấu trường (Arena) hoặc null
   * @param {string} name  tên hàm trên arena, vd 'shake', 'toast' (các tham số sau name được chuyển tiếp nguyên vẹn)
   * @returns {any} giá trị hàm trả về, hoặc undefined nếu không có hàm / bị lỗi
   * @example
   *   K.call(arena, 'shake', 8, 0.3); // rung màn hình 8 px trong 0,3 s
   */
  K.call = function (arena, name) {
    if (!arena || typeof arena[name] !== 'function') return undefined;
    try { return arena[name].apply(arena, Array.prototype.slice.call(arguments, 2)); }
    catch (e) { console.error('[OG.Bosses] arena.' + name, e); return undefined; }
  };

  /**
   * Lấy toạ độ y của mặt sàn đấu trường (px).
   * @param {Object} arena
   * @returns {number}
   */
  K.floorY = function (arena) { return (arena && arena.floorY) || OG.FLOOR_Y || 480; };
  /**
   * Lấy bề ngang đấu trường (px).
   * @param {Object} arena
   * @returns {number}
   */
  K.width = function (arena) { return (arena && arena.width) || OG.W || 960; };

  // Người chơi giả khi arena chưa có player (test / stub) — giúp mọi phép tính không phải kiểm tra null.
  var DUMMY_PLAYER = { x: 80, y: 428, w: 34, h: 52, vx: 0, vy: 0, inv: 0 };
  /**
   * Lấy người chơi của arena (hoặc người chơi giả nếu chưa có).
   * @param {Object} arena
   * @returns {Player}
   */
  K.player = function (arena) { return (arena && arena.player) || DUMMY_PLAYER; };
  /**
   * Lấy toạ độ x TÂM người chơi (px, thế giới).
   * @param {Object} arena
   * @returns {number}
   */
  K.pcx = function (arena) { var p = K.player(arena); return p.x + p.w / 2; };
  /**
   * Lấy toạ độ y TÂM người chơi (px, thế giới).
   * @param {Object} arena
   * @returns {number}
   */
  K.pcy = function (arena) { var p = K.player(arena); return p.y + p.h / 2; };

  /**
   * Kiểm tra 2 hình chữ nhật AABB (x,y = góc trên-trái) có chồng lên nhau không.
   * @param {AABB} a
   * @param {AABB} b
   * @returns {boolean}
   */
  K.overlap = function (a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  };
  /**
   * Kiểm tra rect có chạm người chơi không (ưu tiên hàm của arena — scene có thể dùng hitbox riêng).
   * @param {Object} arena
   * @param {AABB} rect
   * @returns {boolean}
   */
  K.overlapsPlayer = function (arena, rect) {
    if (arena && typeof arena.overlapsPlayer === 'function') return !!K.call(arena, 'overlapsPlayer', rect);
    return K.overlap(K.player(arena), rect);
  };
  /**
   * Làm người chơi bị thương qua arena.hurtPlayer (scene lo trừ mạng, i-frames, phát 'player:hurt').
   * @param {Object} arena
   * @param {string} [cause='projectile']  nguyên nhân: 'projectile' | 'boss'
   * @returns {boolean} true nếu arena báo đã gây thương
   */
  K.hurtPlayer = function (arena, cause) { return !!K.call(arena, 'hurtPlayer', cause || 'projectile'); };
  /**
   * Phát event qua arena.emit (để scene chặn/ghi log được), không có thì phát thẳng OG.Events.
   * @param {Object} arena
   * @param {string} name  tên event, vd 'boss:phase'
   * @param {Object} [payload]
   */
  K.emit = function (arena, name, payload) {
    if (arena && typeof arena.emit === 'function') K.call(arena, 'emit', name, payload);
    else if (OG.Events) OG.Events.emit(name, payload);
  };
  /**
   * Tạo chùm hạt (khói, bụi, tia) tại (x, y) — toạ độ thế giới.
   * @param {Object} arena
   * @param {number} x
   * @param {number} y
   * @param {string} [color='#ffffff']
   * @param {number} [count=8]  số hạt
   * @param {number} [speed=160]  tốc độ toả ra, px/giây
   */
  K.puff = function (arena, x, y, color, count, speed) {
    K.call(arena, 'particles', x, y, { color: color || '#ffffff', count: count || 8, speed: speed || 160 });
  };
  /**
   * Hiện chữ bay lên tại (x, y), vd "+100", "Phản đòn!".
   * @param {Object} arena
   * @param {number} x
   * @param {number} y
   * @param {string} text
   * @param {string} [color]
   */
  K.text = function (arena, x, y, text, color) { K.call(arena, 'floatText', x, y, text, color); };

  /**
   * Điền giá trị và hàm còn thiếu của arena (khi scene khác / stub truyền arena chưa đầy đủ). SỬA trực tiếp arena.
   * 💡 Khái niệm: "null object" — thay vì kiểm tra `if (arena.shake)` khắp nơi, ta lấp sẵn hàm mặc định
   *   gọi tới module thật (Camera, Particles...) một lần ở đây; code trùm luôn gọi được.
   * @param {Object} [arena]  arena một phần (có thể undefined)
   * @returns {Arena} chính object đó, đã đủ field
   */
  K.normalizeArena = function (arena) {
    arena = arena || {};
    if (!arena.width) arena.width = OG.W || 960;
    if (!arena.height) arena.height = OG.H || 540;
    if (!arena.floorY) arena.floorY = OG.FLOOR_Y || 480;
    if (arena.t == null) arena.t = 0;
    if (!arena.enemies) arena.enemies = [];
    if (!arena.platforms) arena.platforms = [{ x: 0, y: arena.floorY, w: arena.width, h: 60, isFloor: true }];
    if (!arena.player) arena.player = { x: 80, y: arena.floorY - 52, w: 34, h: 52, vx: 0, vy: 0, inv: 0 };
    var fallbacks = {
      hurtPlayer: function (cause) {
        if (OG.Player && OG.Player.hurt) return OG.Player.hurt(arena.player, cause || 'boss');
        return false;
      },
      overlapsPlayer: function (r) { return K.overlap(arena.player, r); },
      shake: function (m, d) { if (OG.Camera && OG.Camera.shake) OG.Camera.shake(m, d); },
      particles: function (x, y, o) { if (OG.Particles && OG.Particles.spawn) OG.Particles.spawn(x, y, o); },
      floatText: function (x, y, s, c) { if (OG.Particles && OG.Particles.floatText) OG.Particles.floatText(x, y, s, c); },
      toast: function (s) { if (OG.DOM && OG.DOM.toast) OG.DOM.toast(s); },
      emit: function (n, p) { if (OG.Events) OG.Events.emit(n, p); },
      addScore: function (n) { if (OG.Game && OG.Game.addScore) OG.Game.addScore(n); },
      spawnEnemy: function (src) {
        if (!OG.Enemies || !OG.Enemies.create) return null;
        var e = OG.Enemies.create(src, arena.enemies.length);
        arena.enemies.push(e);
        return e;
      }
    };
    // Chỉ lấp hàm CÒN THIẾU: hàm scene đã cung cấp luôn được ưu tiên.
    for (var k in fallbacks) if (typeof arena[k] !== 'function') arena[k] = fallbacks[k];
    return arena;
  };

  /**
   * Dời toạ độ tâm cx ra khỏi vùng ngay dưới các bục, rồi kẹp trong sân.
   * Lý do: platform là one-way (nền một chiều — đứng lên được từ trên, nhảy xuyên từ dưới), nó chặn người chơi
   * rơi xuống chỗ ngay dưới bục → trùm choáng dưới bục sẽ không giẫm được.
   * @param {Object} arena
   * @param {number} cx  tâm mong muốn (px, thế giới)
   * @param {number} halfW  nửa bề ngang trùm (px)
   * @returns {number} tâm mới, không nằm dưới bục nào
   */
  K.clearSpot = function (arena, cx, halfW) {
    var W = K.width(arena), floorY = K.floorY(arena), list = (arena && arena.platforms) || [];
    // Chạy tối đa 3 lượt: dời khỏi bục này có thể rơi vào dưới bục bên cạnh.
    for (var pass = 0; pass < 3; pass++) {
      var moved = false;
      for (var i = 0; i < list.length; i++) {
        var plat = list[i];
        if (!plat || plat.isFloor || plat.y >= floorY - 1) continue;
        if (cx + halfW > plat.x && cx - halfW < plat.x + plat.w) {
          // Hai lựa chọn: sát mép trái hoặc mép phải của bục (cách thêm 6 px), chọn bên gần hơn nếu nằm trong sân.
          var leftX = plat.x - halfW - 6, rightX = plat.x + plat.w + halfW + 6;
          var okL = leftX >= halfW, okR = rightX <= W - halfW;
          cx = okL && (!okR || Math.abs(cx - leftX) <= Math.abs(cx - rightX)) ? leftX : rightX;
          moved = true;
        }
      }
      if (!moved) break;
    }
    return Math.max(halfW, Math.min(W - halfW, cx));
  };

  /**
   * Đếm số lính gián còn sống trong arena (Joey dùng để giới hạn tối đa 3 con).
   * @param {Object} arena
   * @returns {number}
   */
  K.aliveMinions = function (arena) {
    var n = 0, list = (arena && arena.enemies) || [];
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].alive) n++;
    return n;
  };
  /**
   * Dọn mọi lính khi trùm gục: ẩn ngay (deadT > 0.5 để OG.Enemies.draw bỏ qua) kèm khói. SỬA arena.enemies.
   * @param {Object} arena
   */
  K.killMinions = function (arena) {
    var list = (arena && arena.enemies) || [];
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e || !e.alive) continue;
      e.alive = false;
      e.deadT = 0.6;
      K.puff(arena, e.x + e.w / 2, e.y + e.h / 2, '#b56bc7', 8, 140);
    }
  };

  /**
   * Chuyển tên animation mong muốn thành tên OG.Sprites thật sự hỗ trợ.
   * Trạng thái tuỳ chọn (walk, stunned, dead, roll) quy về trạng thái bắt buộc (run, hurt, attack) nếu Sprites không có.
   * @param {string} want  vd 'stunned'
   * @returns {string} vd 'hurt' (hoặc 'stunned' nếu Sprites hỗ trợ)
   */
  K.anim = function (want) {
    if (!K._anims) {
      var list = null;
      try { if (OG.Sprites && typeof OG.Sprites.getAnimStates === 'function') list = OG.Sprites.getAnimStates(); } catch (e) { list = null; }
      K._anims = Array.isArray(list) && list.length ? list : ['idle', 'run', 'jump', 'fall', 'hurt', 'attack', 'victory'];
    }
    if (K._anims.indexOf(want) >= 0) return want;
    var map = { walk: 'run', stunned: 'hurt', dead: 'hurt', roll: 'attack' };
    return map[want] || 'idle';
  };

  /**
   * Lấy màu chủ đạo của trùm (để vẽ dự phòng và chi tiết phụ như khói khi gục).
   * @param {string} charId
   * @returns {string} mã màu CSS
   */
  K.colorOf = function (charId) {
    var P = OG.Palette || {};
    var c = { joey: P.joey || '#c45bd1', marky: P.marky || '#5fae4e', deedee: P.deedee || '#e08a3c' };
    return c[charId] || P.roachBody || '#7d3e9b';
  };

  /**
   * Vẽ thân trùm bằng OG.Sprites.drawCharacter; nếu không có hoặc lỗi thì tự vẽ hình gián đơn giản.
   * Gốc toạ độ hiện tại của ctx phải là CHÂN trùm (giữa-đáy hitbox) — bên gọi translate trước.
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} b  trùm (BossInstance)
   * @param {string} anim  animState mong muốn
   * @param {{alpha?: number, colors?: Object}} [opts]
   */
  K.drawSprite = function (ctx, b, anim, opts) {
    opts = opts || {};
    var spriteOpts = {
      face: b.face || 1, scale: b.scale, w: b.baseW, h: b.baseH,
      flash: b.flashT > 0, alpha: opts.alpha != null ? opts.alpha : 1, time: OG.time,
      vx: b.vx, vy: b.vy
    };
    if (opts.colors) spriteOpts.colors = opts.colors;
    // 💡 Khái niệm: cô lập lỗi module — Sprites do người khác viết; nếu nó ném lỗi một lần, ta bật cờ
    //   _spriteBroken và vẽ hình dự phòng mãi về sau, thay vì log lỗi 60 lần/giây hay làm đứng trận đấu.
    if (!K._spriteBroken && OG.Sprites && typeof OG.Sprites.drawCharacter === 'function') {
      // ctx.save/restore: Sprites có thể đổi transform/alpha giữa chừng rồi ném lỗi → restore đưa ctx về như cũ.
      ctx.save();
      try {
        OG.Sprites.drawCharacter(ctx, b.charId, K.anim(anim), b.animT, spriteOpts);
        ctx.restore();
        return;
      } catch (e) {
        ctx.restore();
        K._spriteBroken = true;
        console.error('[OG.Bosses] OG.Sprites.drawCharacter lỗi, chuyển sang hình dự phòng', e);
      }
    }
    K.drawFallback(ctx, b, spriteOpts);
  };

  /**
   * Vẽ hình dự phòng: gián bo tròn theo màu trùm. Gốc ctx = chân trùm.
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} b  trùm
   * @param {{face: number, flash: boolean, alpha: number}} spriteOpts
   */
  K.drawFallback = function (ctx, b, spriteOpts) {
    var w = b.baseW * b.scale, h = b.baseH * b.scale;
    var col = spriteOpts.flash ? '#ffffff' : K.colorOf(b.charId);
    ctx.save();
    ctx.globalAlpha *= spriteOpts.alpha;
    // Lật ngang bằng scale(-1, 1): chỉ cần vẽ một hướng, hướng kia là ảnh gương.
    ctx.scale(spriteOpts.face < 0 ? -1 : 1, 1);
    // thân + vệt sáng
    U.fillRound(ctx, -w / 2, -h, w, h * 0.92, Math.min(w, h) * 0.4, col);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.ellipse(-w * 0.08, -h * 0.62, w * 0.3, h * 0.22, 0, 0, Math.PI * 2); ctx.fill();
    // mắt (lòng trắng rồi con ngươi)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(-w * 0.12, -h * 0.78, w * 0.13, 0, 7); ctx.arc(w * 0.18, -h * 0.78, w * 0.13, 0, 7); ctx.fill();
    ctx.fillStyle = '#17233d';
    ctx.beginPath(); ctx.arc(-w * 0.07, -h * 0.77, w * 0.05, 0, 7); ctx.arc(w * 0.23, -h * 0.77, w * 0.05, 0, 7); ctx.fill();
    // râu
    ctx.strokeStyle = '#17233d'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-w * 0.05, -h); ctx.quadraticCurveTo(-w * 0.2, -h * 1.15, -w * 0.35, -h * 1.08);
    ctx.moveTo(w * 0.1, -h); ctx.quadraticCurveTo(w * 0.25, -h * 1.15, w * 0.4, -h * 1.08); ctx.stroke();
    // chân
    ctx.lineWidth = 3;
    for (var i = 0; i < 3; i++) {
      var lx = -w * 0.3 + i * w * 0.3;
      ctx.beginPath(); ctx.moveTo(lx, -h * 0.1); ctx.lineTo(lx - 4, 0); ctx.stroke();
    }
    ctx.restore();
  };

  // ---------------------------------------------------------------------------
  // Telegraph & hiệu ứng vẽ
  // 💡 Khái niệm: telegraph (báo hiệu trước đòn) là điều làm trận trùm "công bằng": người chơi luôn có
  //   một khoảng thời gian nhìn thấy đòn sắp tới (chấm than, vùng đỏ, mũi tên, bóng đổ) để phản ứng.
  //   Mọi hàm dưới đây dao động theo t (giây) bằng Math.sin → nhấp nháy/nhún nhảy mà không cần lưu trạng thái.
  // ---------------------------------------------------------------------------

  /**
   * Vẽ bong bóng chấm than (hoặc biểu tượng) phía trên đầu, nhún lên xuống theo t.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x  tâm bong bóng (px, thế giới)
   * @param {number} y  đáy bong bóng (px)
   * @param {number} t  thời gian (giây) để làm hoạt ảnh
   * @param {string} [text='!']  chữ / emoji bên trong
   * @param {string} [color='#e5484d']
   */
  K.drawBubble = function (ctx, x, y, t, text, color) {
    var bob = Math.sin(t * 10) * 3;
    ctx.save();
    ctx.translate(x, y + bob);
    // khung bong bóng + đuôi nhọn chỉ xuống đầu trùm
    U.fillRound(ctx, -16, -30, 32, 30, 10, '#ffffff');
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(-5, -1); ctx.lineTo(5, -1); ctx.lineTo(0, 8); ctx.fill();
    ctx.strokeStyle = '#17233d'; ctx.lineWidth = 2;
    U.roundRectPath(ctx, -16, -30, 32, 30, 10); ctx.stroke();
    ctx.fillStyle = color || '#e5484d';
    ctx.font = OG.font(22, 'bold');
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text || '!', 0, -14);
    ctx.restore();
  };

  /**
   * Vẽ vùng cảnh báo đỏ trên sàn (sọc trắng chéo, nhấp nháy), đậm dần khi sắp đánh.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x  mép trái vùng (px, thế giới)
   * @param {number} w  bề ngang vùng (px)
   * @param {number} floorY  mặt sàn (px)
   * @param {number} t  thời gian (giây)
   * @param {number} [intensity=0]  0..1, thường = stateT / stateDur của trạng thái "...Wind"
   * @param {number} [height=26]  chiều cao vùng (px)
   */
  K.drawWarnZone = function (ctx, x, w, floorY, t, intensity, height) {
    var hgt = height || 26;
    var a = 0.18 + 0.32 * (intensity || 0) + Math.sin(t * 18) * 0.08;
    ctx.save();
    ctx.globalAlpha = Math.max(0.05, Math.min(0.75, a));
    ctx.fillStyle = '#e5484d';
    ctx.fillRect(x, floorY - hgt, w, hgt);
    ctx.globalAlpha *= 0.8;
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
    // clip() giới hạn nét vẽ trong hình chữ nhật → sọc chéo không lòi ra ngoài vùng.
    ctx.beginPath();
    ctx.rect(x, floorY - hgt, w, hgt);
    ctx.clip();
    for (var sx = x - hgt; sx < x + w + hgt; sx += 18) {
      ctx.moveTo(sx, floorY); ctx.lineTo(sx + hgt, floorY - hgt);
    }
    ctx.stroke();
    ctx.restore();
  };

  /**
   * Vẽ mũi tên ngang chỉ hướng lao, nhích qua lại theo t.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x  gốc mũi tên (px)
   * @param {number} y  (px)
   * @param {number} dir  1 = sang phải, -1 = sang trái
   * @param {number} t  thời gian (giây)
   * @param {string} [color='#e5484d']
   */
  K.drawArrow = function (ctx, x, y, dir, t, color) {
    var off = Math.sin(t * 14) * 5;
    ctx.save();
    ctx.translate(x + dir * off, y);
    ctx.scale(dir, 1); // vẽ mũi tên hướng phải, scale(-1) lật thành hướng trái
    ctx.fillStyle = color || '#e5484d';
    ctx.strokeStyle = '#17233d'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(22, -7); ctx.lineTo(22, -15); ctx.lineTo(40, 0);
    ctx.lineTo(22, 15); ctx.lineTo(22, 7); ctx.lineTo(0, 7); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  };

  /**
   * Vẽ mũi tên vàng "GIẪM!" báo điểm yếu đang mở (bên trên đầu trùm).
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x  tâm (px)
   * @param {number} y  đỉnh đầu trùm (px)
   * @param {number} t  thời gian (giây)
   */
  K.drawStompHint = function (ctx, x, y, t) {
    var bob = Math.abs(Math.sin(t * 6)) * 8;
    ctx.save();
    ctx.translate(x, y - 18 - bob);
    ctx.fillStyle = '#ffc94a'; ctx.strokeStyle = '#17233d'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-7, -18); ctx.lineTo(7, -18); ctx.lineTo(7, -8); ctx.lineTo(14, -8);
    ctx.lineTo(0, 4); ctx.lineTo(-14, -8); ctx.lineTo(-7, -8); ctx.closePath();
    ctx.fill(); ctx.stroke();
    // chữ có viền: strokeText trước, fillText sau để viền nằm dưới
    ctx.font = OG.font(12, 'bold'); ctx.textAlign = 'center';
    ctx.lineWidth = 3; ctx.strokeText('GIẪM!', 0, -23);
    ctx.fillStyle = '#ffffff'; ctx.fillText('GIẪM!', 0, -23);
    ctx.restore();
  };

  /**
   * Vẽ 3 ngôi sao xoay quanh đầu khi choáng (quỹ đạo elip dẹt để trông như vòng nằm ngang).
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x  tâm quỹ đạo (px)
   * @param {number} y  (px)
   * @param {number} t  thời gian (giây)
   * @param {number} [r=22]  bán kính quỹ đạo (px)
   */
  K.drawStars = function (ctx, x, y, t, r) {
    r = r || 22;
    ctx.save();
    for (var i = 0; i < 3; i++) {
      var a = t * 5 + i * (Math.PI * 2 / 3);
      var sx = x + Math.cos(a) * r, sy = y + Math.sin(a) * r * 0.35;
      ctx.fillStyle = '#ffc94a'; ctx.strokeStyle = '#17233d'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      // ngôi sao 5 cánh = 10 đỉnh xen kẽ bán kính ngoài 7 / trong 3
      for (var k = 0; k < 10; k++) {
        var rr = k % 2 ? 3 : 7, aa = k * Math.PI / 5 - Math.PI / 2;
        ctx.lineTo(sx + Math.cos(aa) * rr, sy + Math.sin(aa) * rr);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  };

  /**
   * Vẽ bóng đổ trên sàn báo đồ vật sắp rơi xuống (kèm vòng đỏ cảnh báo).
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x  tâm bóng (px)
   * @param {number} floorY  mặt sàn (px)
   * @param {number} r  bán kính ngang (px)
   * @param {number} alpha  độ đậm 0..1 (càng gần sàn càng đậm)
   */
  K.drawShadow = function (ctx, x, floorY, r, alpha) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.fillStyle = '#17233d';
    ctx.beginPath(); ctx.ellipse(x, floorY - 2, r, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha *= 0.8;
    ctx.strokeStyle = '#e5484d'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x, floorY - 2, r + 6, (r + 6) * 0.3, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  };

  /**
   * Vẽ thanh máu nhỏ + tên trên đầu (dùng cho từng thành viên trận bộ ba).
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} b  trùm (cần x, y, w, hp, maxHp, name)
   */
  K.drawMiniBar = function (ctx, b) {
    var w = Math.max(44, b.w), x = b.x + b.w / 2 - w / 2, y = b.y - 16;
    ctx.save();
    U.fillRound(ctx, x - 2, y - 2, w + 4, 10, 5, '#17233dcc');
    var ratio = b.maxHp ? Math.max(0, b.hp / b.maxHp) : 0;
    if (ratio > 0) U.fillRound(ctx, x, y, Math.max(6, w * ratio), 6, 3, '#e5484d');
    ctx.font = OG.font(11, 'bold'); ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#17233d'; ctx.lineWidth = 3;
    ctx.strokeText(b.name, b.x + b.w / 2, y - 5); ctx.fillText(b.name, b.x + b.w / 2, y - 5);
    ctx.restore();
  };

  // ---------------------------------------------------------------------------
  // Đạn / bẫy (BossProjectile)
  // ---------------------------------------------------------------------------

  /**
   * Thêm một viên đạn / bẫy vào danh sách của trùm, điền giá trị mặc định cho field còn thiếu. SỬA p và b.projectiles.
   * 💡 Khái niệm: data-driven projectile — mọi loại đạn chung một vòng cập nhật (updateProjectiles);
   *   khác biệt nằm ở DỮ LIỆU (g, maxBounces, reflectable...) và vài hook tuỳ chọn (update, onFloor, onHitPlayer, rect).
   * @param {Object} b  trùm sở hữu
   * @param {BossProjectile} p  đạn (tối thiểu kind, x, y)
   * @returns {BossProjectile} chính p
   * @example
   *   K.spawnProj(b, { kind: 'cap', x: 100, y: 300, vx: 200, vy: -400, g: 900, reflectable: true });
   */
  K.spawnProj = function (b, p) {
    p.t = 0; p.dead = false;
    if (p.r == null) p.r = 8;
    if (p.vx == null) p.vx = 0;
    if (p.vy == null) p.vy = 0;
    if (p.g == null) p.g = 0;
    if (p.life == null) p.life = 4;
    if (p.hurts == null) p.hurts = true;
    if (p.bounces == null) p.bounces = 0;
    if (p.maxBounces == null) p.maxBounces = 0;
    p.owner = b;
    b.projectiles.push(p);
    return p;
  };
  /**
   * Lấy hitbox của đạn: p.rect(p) nếu có, không thì hình vuông 2r × 2r quanh tâm.
   * @param {BossProjectile} p
   * @returns {AABB}
   */
  K.projRect = function (p) {
    if (typeof p.rect === 'function') return p.rect(p);
    return { x: p.x - p.r, y: p.y - p.r, w: p.r * 2, h: p.r * 2 };
  };

  /**
   * Đánh bật đạn khi người chơi vừa nhấn action ở gần.
   * Mỗi cú vung có hồi chiêu REFLECT_COOLDOWN để không thể bấm liên tục mà phản mọi thứ (cần canh thời điểm).
   * @param {Object} b
   * @param {Object} arena
   * @param {number} dt  giây
   */
  function tryReflect(b, arena, dt) {
    b._reflectCd = Math.max(0, (b._reflectCd || 0) - dt);
    // Phát hiện cú bấm MỚI: so bộ đếm toàn cục với số đã thấy lần trước (xem K.actionSeq).
    if (b._seenAction === K.actionSeq) return;
    b._seenAction = K.actionSeq;
    if (b._reflectCd > 0) return;
    b._reflectCd = REFLECT_COOLDOWN;
    var px = K.pcx(arena), py = K.pcy(arena);
    for (var i = 0; i < b.projectiles.length; i++) {
      var p = b.projectiles[i];
      if (p.dead || !p.reflectable || p.reflected) continue;
      var dx = p.x - px, dy = p.y - py;
      // So bình phương khoảng cách với bình phương bán kính: tránh Math.sqrt không cần thiết.
      if (dx * dx + dy * dy > REFLECT_RANGE * REFLECT_RANGE) continue;
      reflect(p, arena);
    }
  }
  /**
   * Đổi hướng đạn bay thẳng về giữa thân trùm chủ (vector đơn vị × tốc độ). SỬA p.
   * @param {BossProjectile} p
   * @param {Object} arena
   */
  function reflect(p, arena) {
    var target = p.owner;
    var tx = target.x + target.w / 2, ty = target.y + target.h * 0.45;
    var dx = tx - p.x, dy = ty - p.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
    p.reflected = true;
    p.g = 0;   // bay thẳng, không rơi — để chắc chắn trúng trùm
    p.ax = 0;
    p.vx = dx / d * REFLECT_SPEED;
    p.vy = dy / d * REFLECT_SPEED;
    p.life = REFLECTED_LIFE;
    K.puff(arena, p.x, p.y, '#7fe0ff', 10, 200);
    K.text(arena, p.x, p.y - 16, 'Phản đòn!', '#7fe0ff');
    K.call(arena, 'shake', 3, 0.12);
  }

  /**
   * Xử lý đạn phản trúng trùm: trừ máu qua root (trio gộp máu), cộng 100 điểm, PHÁT 'boss:hit' (source:'reflect').
   * @param {Object} b  trùm bị trúng (thành viên, nếu là trio)
   * @param {Object} arena
   * @returns {boolean} false nếu trùm đang bất tử (đạn "Keng!" bật ra)
   */
  K.reflectHit = function (b, arena) {
    var root = b.root || b;
    var ok = root.onHit(1, arena, b);
    if (!ok) return false;
    K.call(arena, 'addScore', 100);
    K.text(arena, b.x + b.w / 2, b.y - 10, '+100', '#ffc94a');
    K.emit(arena, 'boss:hit', { bossId: root.id, hp: root.hp, maxHp: root.maxHp, source: 'reflect' });
    return true;
  };

  /**
   * Vật lý mặc định của đạn (khi đạn không có hook update riêng): tích phân Euler bán ẩn + nảy / vỡ khi chạm sàn.
   * @param {BossProjectile} p
   * @param {number} dt  giây
   * @param {Object} arena
   * @param {Object} b  trùm sở hữu
   * @param {number} floorY  mặt sàn (px)
   */
  function integrateProjectile(p, dt, arena, b, floorY) {
    // 💡 Khái niệm: tích phân semi-implicit Euler (Euler bán ẩn) — cập nhật vận tốc từ gia tốc TRƯỚC, rồi dùng
    //   vận tốc MỚI đó để cập nhật vị trí (đều nhân dt). Đảo thứ tự (vị trí trước) là Euler hiện, kém ổn định hơn khi nảy.
    p.vx += (p.ax || 0) * dt;
    p.vy += p.g * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    // Chỉ xét sàn khi đang RƠI xuống (vy > 0); đạn đã phản thì bay xuyên, không nảy.
    if (p.y + p.r >= floorY && p.vy > 0 && !p.reflected) {
      if (typeof p.onFloor === 'function') p.onFloor(p, arena, b);
      else if (p.bounces < p.maxBounces) {
        p.bounces++;
        p.y = floorY - p.r;  // đặt lại lên mặt sàn để frame sau không bị "kẹt" dưới sàn
        p.vy = -p.vy * BOUNCE_KEEP_VY;
        p.vx *= BOUNCE_KEEP_VX;
      } else {
        p.dead = true;
        K.puff(arena, p.x, floorY - 4, '#d9dde3', 5, 90);
      }
    }
  }

  /**
   * Cập nhật mọi đạn của trùm: đánh bật, di chuyển, va chạm với người chơi / với trùm (khi đã phản). SỬA b.projectiles.
   * Trùm gọi hàm này ở cuối b.update, SAU physics của thân trùm.
   * @param {Object} b  trùm sở hữu
   * @param {number} dt  giây
   * @param {Object} arena
   */
  K.updateProjectiles = function (b, dt, arena) {
    if (!b.dead) tryReflect(b, arena, dt);
    var floorY = K.floorY(arena), W = K.width(arena);
    // ⚠️ Bẫy: duyệt NGƯỢC (từ cuối về đầu) vì ta splice() phần tử giữa vòng lặp. Duyệt xuôi thì xoá phần tử i
    //   làm phần tử i+1 dồn về i và bị BỎ QUA ở frame này.
    for (var i = b.projectiles.length - 1; i >= 0; i--) {
      var p = b.projectiles[i];
      if (!p) continue; // danh sách có thể bị xoá giữa chừng (trùm gục vì đạn phản)
      p.t += dt;
      p.life -= dt;
      if (b.dead) p.dead = true;
      if (!p.dead && typeof p.update === 'function') p.update(p, dt, arena, b);
      else if (!p.dead) integrateProjectile(p, dt, arena, b, floorY);
      if (p.life <= 0 || p.x < -PROJ_MARGIN_X || p.x > W + PROJ_MARGIN_X || p.y > floorY + PROJ_MARGIN_BELOW) p.dead = true;
      if (p.dead) { b.projectiles.splice(i, 1); continue; }

      var rect = K.projRect(p);
      if (p.reflected) {
        // Bay về phía trùm chủ; trúng thì trùm mất máu.
        var tb = p.owner;
        if (!tb.dead && K.overlap(rect, { x: tb.x, y: tb.y, w: tb.w, h: tb.h })) {
          p.dead = true;
          K.puff(arena, p.x, p.y, '#ffc94a', 12, 220);
          if (!K.reflectHit(tb, arena)) K.text(arena, p.x, p.y, 'Keng!', '#ffffff');
          b.projectiles.splice(i, 1);
        }
        continue;
      }
      // armed === undefined nghĩa là loại đạn không có khái niệm "giương" → luôn nguy hiểm.
      if (p.hurts && (p.armed === undefined || p.armed) && K.overlapsPlayer(arena, rect)) {
        var pl = K.player(arena);
        // Người chơi đang bất tử thì đạn bay xuyên qua (không biến mất) — tránh "phí" đạn vô ích.
        if (!(pl.inv > 0)) {
          K.hurtPlayer(arena, 'projectile');
          if (typeof p.onHitPlayer === 'function') p.onHitPlayer(p, arena, b);
          else p.dead = true;
          if (p.dead) b.projectiles.splice(i, 1);
        }
      }
    }
  };

  /**
   * Vẽ mọi đạn của trùm bằng hàm trong K.drawers theo p.kind (không có thì vẽ chấm tròn trắng).
   * Mỗi viên được bọc save/restore nên hàm vẽ đạn được tự do translate/rotate.
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} b
   */
  K.drawProjectiles = function (ctx, b) {
    for (var i = 0; i < b.projectiles.length; i++) {
      var p = b.projectiles[i];
      var fn = K.drawers[p.kind];
      ctx.save();
      if (p.reflected) {
        // vệt sáng xanh khi bị đánh bật (lùi về sau theo vận tốc ~0,03 s)
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#7fe0ff';
        ctx.beginPath(); ctx.arc(p.x - p.vx * 0.03, p.y - p.vy * 0.03, p.r + 6, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (fn) fn(ctx, p, OG.time || 0, b);
      else { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
  };

  // ---------------------------------------------------------------------------
  // Độ khó (arena.difficulty = OG.Difficulty.params)
  // ---------------------------------------------------------------------------
  var STUN_STATES = ['stuck', 'dizzy', 'rest'];   // trạng thái sơ hở của marky / deedee / joey
  var CALM_ACTIONS = ['walk', 'idle'];            // không cần nghỉ sau những "đòn" này

  /**
   * Đọc tham số độ khó từ arena.difficulty, thiếu field nào thì dùng giá trị "bình thường" (hệ số 1, không nghỉ).
   * @param {Object} arena
   * @returns {BossDifficulty}
   */
  K.diffOf = function (arena) {
    var d = (arena && arena.difficulty) || {};
    return {
      kid: d.mode === 'kid',
      hpMul: typeof d.bossHpMul === 'number' ? d.bossHpMul : 1,
      telegraph: typeof d.bossTelegraphMul === 'number' ? d.bossTelegraphMul : 1,
      stun: typeof d.bossStunMul === 'number' ? d.bossStunMul : 1,
      rest: typeof d.bossRest === 'number' ? d.bossRest : 0
    };
  };

  /**
   * Vẽ telegraph rõ hơn cho chế độ kid: vòng sáng vàng nhấp nháy quanh trùm + vòng đếm ngược trên đầu.
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} b  trùm
   * @param {number} t  thời gian (giây)
   * @param {number} k  tiến độ báo trước 0..1 (1 = sắp đánh); vòng đỏ co lại theo 1 - k
   */
  K.drawTelegraph = function (ctx, b, t, k) {
    k = Math.max(0, Math.min(1, k));
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.35 * Math.abs(Math.sin(t * 9));
    ctx.strokeStyle = '#ffc94a'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.ellipse(b.cx(), b.y + b.h / 2, b.w * 0.75, b.h * 0.62, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
    var x = b.cx() + b.w * 0.55, y = b.y - 22;
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#17233d'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // cung tròn bắt đầu ở 12 giờ (-π/2), dài 2π·(1 - k) → "đồng hồ" đếm ngược
    ctx.strokeStyle = '#e5484d'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(x, y, 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - k)); ctx.stroke();
    ctx.restore();
  };
  /**
   * Vẽ hiệu ứng nghỉ thở (breather): 3 bong bóng "phù phù" mờ dần bay lên trước miệng trùm.
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} b
   * @param {number} t  thời gian (giây)
   */
  K.drawPant = function (ctx, b, t) {
    ctx.save();
    for (var i = 0; i < 3; i++) {
      // ph = pha 0..1 lặp lại; lệch i/3 để 3 bong bóng không trùng nhau
      var ph = (t * 1.2 + i / 3) % 1;
      ctx.globalAlpha = 0.8 * (1 - ph);
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#17233d'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(b.cx() + b.face * (b.w * 0.35 + ph * 18), b.y + b.h * 0.25 - ph * 26, 4 + ph * 5, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  };

  // ---------------------------------------------------------------------------
  // Khung trùm dùng chung (K.createBase)
  // ---------------------------------------------------------------------------

  /**
   * Co máu và ngưỡng pha theo hệ số độ khó (tối thiểu 2 máu). Ngưỡng trùng nhau / vượt máu bị loại.
   * @param {number} maxHp  máu gốc
   * @param {number[]} phaseAt  ngưỡng gốc
   * @param {number} hpMul  hệ số máu (< 1)
   * @returns {{maxHp: number, phaseAt: number[]}}
   */
  function scaleHpForDifficulty(maxHp, phaseAt, hpMul) {
    var hp0 = maxHp;
    maxHp = Math.max(2, Math.round(hp0 * hpMul));
    phaseAt = phaseAt.map(function (v) { return Math.round(v * maxHp / hp0); })
      .filter(function (v, i, a) { return v > 0 && v < maxHp && a.indexOf(v) === i; });
    return { maxHp: maxHp, phaseAt: phaseAt };
  }

  /**
   * Tạo khung trùm (BossInstance) có sẵn state machine, pha, i-frames, weakspot/hurtbox, vật lý và vẽ.
   * File trùm cụ thể gán thêm các hàm "strategy" để quyết định hành vi riêng:
   *   startAction(name, arena) — bắt đầu một đòn (chuyển sang trạng thái "...Wind")
   *   think(dt, arena)         — xử lý trạng thái riêng của trùm mỗi frame (switch theo b.state)
   *   isVulnerable() / isFullHurt() — trạng thái nào giẫm được / trạng thái nào cả thân đều gây đau
   *   onHurt(arena), onPhase(np, arena), onBreather(dt, arena), drawBehind/drawBody/drawFront(ctx, arena, ...)
   * 💡 Khái niệm: template method — b.update() là "khung" cố định (bộ đếm thời gian → trạng thái chung →
   *   think() riêng → vật lý → đạn); trùm con chỉ lấp các bước riêng, không phải viết lại phần chung.
   * @param {BossSpec} spec  thông số loại trùm
   * @param {Object} arena  đấu trường (Arena)
   * @param {BossCfg} [cfg]  cấu hình khi tạo
   * @returns {Object} BossInstance (có thêm field state, stateT, stateDur, projectiles, phase...)
   * @example
   *   var b = K.createBase(SPEC, arena, cfg);
   *   b.startAction = function (a, arena) { b.setState('rollWind', 0.9); };
   *   b.think = function (dt, arena) { if (b.state === 'rollWind' && b.stateDone()) b.setState('roll', 4); };
   */
  K.createBase = function (spec, arena, cfg) {
    cfg = cfg || {};
    var ch = (OG.Data && OG.Data.characters && OG.Data.characters[spec.charId]) || null;
    var baseW = (ch && ch.w) || spec.baseW || 40;
    var baseH = (ch && ch.h) || spec.baseH || 40;
    var scale = cfg.scale || spec.scale || 2;
    var dz = K.diffOf(arena);
    var maxHp = cfg.maxHp || spec.maxHp || 5;
    var phaseAt = cfg.phaseAt || spec.phaseAt || [];
    // Độ khó: máu ít hơn (tối thiểu 2), ngưỡng pha co theo. Thành viên trùm ghép (cfg.maxHp) do trùm ghép tự tính.
    if (!cfg.maxHp && dz.hpMul < 1) {
      var scaled = scaleHpForDifficulty(maxHp, phaseAt, dz.hpMul);
      maxHp = scaled.maxHp;
      phaseAt = scaled.phaseAt;
    }
    var floorY = K.floorY(arena);
    var b = {
      id: spec.id, name: cfg.name || spec.name, charId: spec.charId,
      hp: maxHp, maxHp: maxHp, phase: 1,
      phaseAt: phaseAt,
      diff: dz, diffApplied: !!arena && !!arena.difficulty, _acted: false,
      phaseLines: spec.phaseLines || {},
      emitPhase: cfg.emitPhase !== false,
      baseW: baseW, baseH: baseH, scale: scale,
      w: Math.round(baseW * scale), h: Math.round(baseH * scale),
      fullH: Math.round(baseH * scale),
      x: 0, y: 0, vx: 0, vy: 0, face: -1, ground: true, hitWall: 0,
      // Trạng thái FSM: state = tên trạng thái, stateT = giây đã ở trong trạng thái, stateDur = thời lượng dự kiến.
      state: 'intro', stateT: 0, stateDur: 1.2, anim: 'idle', animT: 0, t: 0,
      inv: 0, stagger: 0, flashT: 0,
      dead: false, deadT: 0, spin: 0,
      step: 0, projectiles: [],
      speedMul: cfg.speedMul || 1,
      ctrl: cfg.ctrl || null, hasTurn: false,
      root: cfg.root || null,
      miniBar: !!cfg.miniBar,
      cfg: cfg, arena: arena,
      patterns: cfg.patterns || spec.patterns || { 1: ['idle'] },
      noGravity: false
    };
    b.x = cfg.x != null ? cfg.x : K.width(arena) - 200 - b.w / 2;
    b.y = floorY - b.h;

    // ---- Tiện ích nhỏ ----
    b.cx = function () { return b.x + b.w / 2; };
    // Chỉ reset animT khi ĐỔI animation — gọi setAnim mỗi frame với cùng tên không làm hoạt ảnh giật về đầu.
    b.setAnim = function (a) { if (a !== b.anim) { b.anim = a; b.animT = 0; } };

    // 💡 Khái niệm: finite state machine (máy trạng thái hữu hạn). Trùm luôn ở ĐÚNG MỘT trạng thái
    //   ('intro', 'rollWind', 'roll', 'dizzy'...). setState() đổi trạng thái + đặt hẹn giờ; mỗi frame think()
    //   chỉ chạy code của trạng thái hiện tại và hỏi stateDone() để biết lúc chuyển tiếp.
    b.setState = function (s, dur) {
      dur = dur || 0;
      // Độ khó: báo trước đòn (…Wind) lâu hơn, sơ hở (choáng/kẹt búa/nghỉ) lâu hơn.
      // ⚠️ Bẫy: dựa vào QUY ƯỚC TÊN — trạng thái báo trước phải kết thúc bằng "Wind". Đặt tên khác (vd 'rollPrep')
      //   thì chế độ kid không kéo dài telegraph và không vẽ vòng đếm ngược cho đòn đó.
      if (/Wind$/.test(s)) dur *= dz.telegraph;
      else if (STUN_STATES.indexOf(s) >= 0) dur *= dz.stun;
      b.state = s; b.stateT = 0; b.stateDur = dur;
    };
    b.stateDone = function () { return b.stateT >= b.stateDur; };
    b.faceToPlayer = function (arena) { b.face = K.pcx(arena) < b.cx() ? -1 : 1; };
    b.dirToPlayer = function (arena) { return K.pcx(arena) < b.cx() ? -1 : 1; };
    // Đổi chiều cao hitbox nhưng giữ nguyên chân (dùng cho tư thế cúi/choáng).
    b.setHeight = function (nh) { var foot = b.y + b.h; b.h = Math.round(nh); b.y = foot - b.h; };
    b.p = function () { return Math.max(1, Math.min(3, b.phase)); };
    // Giá trị theo pha: arr[phase-1] — vd b.byPhase([0.9, 0.75, 0.6]) = telegraph ngắn dần khi trùm yếu máu.
    b.byPhase = function (arr) { return arr[Math.min(arr.length - 1, b.p() - 1)]; };

    // 💡 Khái niệm: phase theo máu — pha = 1 + số ngưỡng phaseAt mà hp đã xuống tới. Pha cao dùng bộ đòn khó hơn.
    b.computePhase = function () {
      var ph = 1;
      for (var i = 0; i < b.phaseAt.length; i++) if (b.hp <= b.phaseAt[i]) ph = i + 2;
      return Math.max(b.phase, ph); // pha không lùi lại (kể cả khi hồi máu)
    };

    // Chọn đòn tiếp theo theo pattern của pha hiện tại. Trận bộ ba: phải đến lượt mới được đánh.
    // 💡 Khái niệm: AI theo pattern xoay vòng (b.step % list.length) — dễ đoán có chủ đích: người chơi học được
    //   nhịp của trùm, khác với chọn ngẫu nhiên (khó, dễ "bất công" với trẻ em).
    b.choose = function (arena) {
      arena = arena || b.arena;
      if (b.ctrl && b.hasTurn) { b.ctrl.release(b); b.hasTurn = false; }
      // Chế độ kid: nghỉ thở (breather) một chút sau mỗi đòn (đứng yên, giẫm được). Trùm ghép nhường lượt trước khi nghỉ.
      if (b._acted && dz.rest > 0) {
        b._acted = false;
        b.vx = 0;
        b.setState('breather', dz.rest);
        return;
      }
      if (b.ctrl) {
        if (!b.ctrl.request(b)) { b.setState('wait', 0.5); return; }
        b.hasTurn = true;
      }
      var list = b.patterns[b.p()] || b.patterns[1] || ['idle'];
      var a = list[b.step % list.length];
      b.step++;
      b._acted = CALM_ACTIONS.indexOf(a) < 0;
      if (typeof b.startAction === 'function') b.startAction(a, arena);
      else b.setState('idle', 1);
    };

    // ---- Trúng đòn & gục ----
    b.die = function (arena) {
      b.dead = true;
      b.hp = 0;
      b.deadT = 0;
      b.setState('dead', 99);
      b.setAnim('dead');
      b.vy = DEATH_HOP_VY;
      b.vx = -b.dirToPlayer(arena) * DEATH_PUSH_VX;
      if (b.fullH && b.h !== b.fullH) b.setHeight(b.fullH);
      for (var i = 0; i < b.projectiles.length; i++) K.puff(arena, b.projectiles[i].x, b.projectiles[i].y, '#ffffff', 5, 100);
      b.projectiles.length = 0;
      K.puff(arena, b.cx(), b.y + b.h / 2, K.colorOf(b.charId), 18, 260);
      K.call(arena, 'shake', 10, 0.5);
      if (typeof cfg.onDeath === 'function') cfg.onDeath(b, arena);
      else K.killMinions(arena);
      if (b.ctrl && b.hasTurn) { b.ctrl.release(b); b.hasTurn = false; }
    };

    // Trả về true nếu đòn được tính (để bên gọi cộng điểm, phát 'boss:hit'); false nếu đang bất tử / đã gục.
    b.onHit = function (dmg, arena) {
      arena = arena || b.arena;
      // 💡 Khái niệm: i-frames (invulnerability frames — khoảng bất tử). Một cú giẫm có thể chạm weakspot
      //   nhiều frame liên tiếp; nhờ b.inv > 0 nên chỉ frame đầu tiên bị trừ máu.
      if (b.dead || b.inv > 0) return false;
      dmg = dmg || 1;
      b.hp = Math.max(0, b.hp - dmg);
      b.inv = INV_TIME;
      b.stagger = STAGGER_TIME;
      b.flashT = HIT_FLASH_TIME;
      K.puff(arena, b.cx(), b.y + 8, '#ffc94a', 12, 220);
      K.text(arena, b.cx(), b.y - 24, U.choice(['Bốp!', 'Á!', 'Ui da!', 'Trúng rồi!']), '#ffffff');
      if (b.hp <= 0) { b.die(arena); return true; }
      var np = b.computePhase();
      if (np > b.phase) {
        // Sang pha mới: reset pattern về đòn đầu, gầm (bất tử) để người chơi kịp thở và nhận ra trùm đã đổi.
        b.phase = np;
        b.step = 0;
        if (b.emitPhase) {
          K.emit(arena, 'boss:phase', { bossId: b.id, phase: np });
          if (b.phaseLines[np]) K.call(arena, 'toast', b.phaseLines[np]);
        }
        if (typeof b.onPhase === 'function') b.onPhase(np, arena);
        if (b.fullH && b.h !== b.fullH) b.setHeight(b.fullH);
        b.inv = Math.max(b.inv, PHASE_ROAR_INV);
        b.vx = 0;
        b.setState('roar', PHASE_ROAR_TIME);
        K.call(arena, 'shake', 8, 0.6);
      } else if (typeof b.onHurt === 'function') {
        b.onHurt(arena);
      } else {
        b.vx = -b.dirToPlayer(arena) * RECOIL_SPEED;
        b.setState('recoil', RECOIL_TIME);
      }
      return true;
    };

    b.isDefeated = function () { return b.hp <= 0; };

    // 💡 Khái niệm: weakspot (điểm yếu) và hurtbox (vùng gây đau) là HAI hình chữ nhật khác nhau.
    //   Weakspot = dải mỏng trên đỉnh đầu, chỉ tồn tại khi trùm lộ sơ hở; hurtbox = thân dưới, chạm vào là đau.
    //   Scene 'boss' xét weakspot trước (giẫm), không giẫm được mới xét hurtbox.
    b.getWeakspot = function () {
      if (b.dead || b.inv > 0) return null;
      if (b.state === 'roar' || b.state === 'recoil' || b.state === 'intro') return null;
      var breathing = b.state === 'breather' && b.ground;
      if (!breathing && typeof b.isVulnerable === 'function' && !b.isVulnerable()) return null;
      return { x: b.x + b.w * 0.1, y: b.y - 6, w: b.w * 0.8, h: Math.max(16, b.h * 0.35) + 6 };
    };

    b.getHurtboxes = function () {
      // ⚠️ Bẫy: phải trả [] trong lúc stagger. Người chơi vừa giẫm xong nảy lên rồi rơi lại đúng lên thân trùm;
      //   nếu hurtbox vẫn bật thì giẫm trúng xong lại bị thương ngay → cảm giác "bị lừa".
      if (b.dead || b.stagger > 0 || b.state === 'intro') return [];
      var boxes;
      if (typeof b.isFullHurt === 'function' && b.isFullHurt()) {
        // Đang lao / lăn / nhảy: gần như cả thân đều gây đau.
        boxes = [{ x: b.x + 4, y: b.y + 4, w: b.w - 8, h: b.h - 6 }];
      } else {
        // Bình thường: chỉ 58% dưới của thân → phần đầu để dành cho cú giẫm.
        boxes = [{ x: b.x + b.w * 0.14, y: b.y + b.h * 0.42, w: b.w * 0.72, h: b.h * 0.58 }];
      }
      if (typeof b.extraHurtboxes === 'function') boxes = boxes.concat(b.extraHurtboxes() || []);
      return boxes;
    };

    // Vật lý đơn giản: trọng lực xuống sàn, kẹp trong arena. Trùm KHÔNG đứng trên bục (chỉ sàn chính).
    b.physics = function (dt, arena) {
      var floorY = K.floorY(arena), W = K.width(arena);
      if (!b.noGravity) b.vy = Math.min(MAX_FALL_SPEED, b.vy + gravity() * dt);
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      // hitWall = -1/1 khi vừa đụng tường trái/phải ở frame này — AI dùng để biết cú lăn/lao đã tới tường.
      b.hitWall = 0;
      if (b.x < 0) { b.x = 0; b.hitWall = -1; }
      if (b.x + b.w > W) { b.x = W - b.w; b.hitWall = 1; }
      var wasGround = b.ground;
      b.ground = false;
      if (b.y + b.h >= floorY) {
        b.y = floorY - b.h;
        if (b.vy > 0) b.vy = 0;
        b.ground = true;
      }
      b.landed = b.ground && !wasGround; // cạnh lên: chỉ true đúng frame vừa chạm đất
    };

    // ---- Vòng cập nhật (template method) ----
    b.update = function (dt, arena) {
      arena = arena || b.arena;
      b.arena = arena;
      b.t += dt; b.animT += dt; b.stateT += dt;
      b.inv = Math.max(0, b.inv - dt);
      b.stagger = Math.max(0, b.stagger - dt);
      b.flashT = Math.max(0, b.flashT - dt);
      if (b.dead) {
        // 💡 Khái niệm: damping (giảm chấn) độc lập frame rate — v *= k^dt. Sau mỗi giây vận tốc chỉ còn k lần
        //   giá trị cũ (ở đây k = 0.1, tức 10%) dù game chạy 30 hay 144 FPS, vì tích các k^dt trong 1 giây = k^1.
        //   Viết v *= 0.9 mỗi frame thì máy nhiều FPS nhân nhiều lần hơn → trùm dừng sớm hơn máy chậm.
        b.deadT += dt;
        b.vx *= Math.pow(0.1, dt);
        b.spin = Math.min(Math.PI / 2, b.spin + dt * 5);
        b.physics(dt, arena);
        // Math.random() < dt * 6: trung bình ~6 hạt mỗi giây, không phụ thuộc FPS.
        if (b.ground && b.deadT > 0.4 && Math.random() < dt * 6) K.puff(arena, b.cx(), b.y, '#ffc94a', 1, 40);
        b.projectiles.length = 0;
        return;
      }
      // Các trạng thái CHUNG do khung xử lý; mọi trạng thái khác giao cho b.think() của từng trùm.
      if (b.state === 'roar') {
        // Gầm khi đổi pha: đứng yên, bất tử.
        b.vx = 0;
        b.setAnim('victory');
        b.faceToPlayer(arena);
        if (Math.random() < dt * 10) K.puff(arena, b.cx() + U.rand(-b.w / 2, b.w / 2), b.y + U.rand(0, b.h * 0.5), '#e5484d', 2, 120);
        if (b.stateDone()) b.choose(arena);
      } else if (b.state === 'recoil') {
        b.setAnim('hurt');
        if (b.ground) b.vx *= Math.pow(0.02, dt);
        if (b.stateDone() && b.ground) { b.vx = 0; b.choose(arena); }
      } else if (b.state === 'breather') {
        // Nghỉ thở (kid): đứng yên thở hổn hển, quay về phía người chơi — một khoảng hở chắc chắn giẫm được.
        if (b.ground) b.vx *= Math.pow(0.02, dt);
        b.faceToPlayer(arena);
        b.setAnim('idle');
        if (typeof b.onBreather === 'function') b.onBreather(dt, arena);
        if (b.stateDone()) { b.vx = 0; b.choose(arena); }
      } else if (b.state === 'wait') {
        // Trận bộ ba: chưa đến lượt — đi lững thững tại chỗ (sin theo thời gian, lệch theo x để mỗi tên khác nhịp).
        b.faceToPlayer(arena);
        b.vx = Math.sin(b.t * 1.7 + b.x * 0.01) * 40 * b.speedMul;
        b.setAnim(Math.abs(b.vx) > 12 ? 'walk' : 'idle');
        if (b.stateDone()) b.choose(arena);
      } else if (typeof b.think === 'function') {
        b.think(dt, arena);
      }
      // Thứ tự có chủ đích: quyết định (vx, vy) trước → physics di chuyển → đạn cập nhật theo vị trí mới.
      b.physics(dt, arena);
      K.updateProjectiles(b, dt, arena);
    };

    // ---- Vẽ (toạ độ thế giới; scene đã áp camera) ----
    // Thứ tự lớp: drawBehind (vùng cảnh báo, đồ ăn) → thân → drawFront (bong bóng, mũi tên) → gợi ý chung → đạn.
    b.draw = function (ctx, arena) {
      arena = arena || b.arena;
      var t = b.t;
      ctx.save();
      if (!b.dead && typeof b.drawBehind === 'function') b.drawBehind(ctx, arena, t);
      // Thân trùm
      ctx.save();
      var alpha = 1;
      if (b.dead) alpha = Math.max(0, 1 - Math.max(0, b.deadT - 1.0) * 1.5);
      // Nhấp nháy khi bất tử: Math.floor(inv * 14) % 2 đổi chẵn/lẻ ~14 lần/giây.
      else if (b.inv > 0 && Math.floor(b.inv * 14) % 2 === 0) alpha = 0.55;
      if (alpha > 0) {
        if (!b.dead && typeof b.drawBody === 'function') b.drawBody(ctx, arena, alpha);
        else {
          ctx.translate(b.cx(), b.y + b.h);
          if (b.dead) ctx.rotate(-b.face * b.spin);
          K.drawSprite(ctx, b, b.anim, { alpha: alpha });
        }
      }
      ctx.restore();
      if (b.dead && b.deadT < 1.4) K.drawStars(ctx, b.cx(), b.y - 4, t, b.w * 0.45);
      if (!b.dead) {
        if (typeof b.drawFront === 'function') b.drawFront(ctx, arena, t);
        if (b.state === 'roar') K.drawBubble(ctx, b.cx(), b.y - 12, t, '💢', '#e5484d');
        else if (b.state === 'breather') K.drawPant(ctx, b, t);
        if (dz.kid && /Wind$/.test(b.state)) K.drawTelegraph(ctx, b, t, b.stateT / Math.max(0.01, b.stateDur));
        // Mũi tên "GIẪM!" vẽ đúng khi getWeakspot() khác null → hình ảnh luôn khớp với luật va chạm.
        if (b.getWeakspot()) K.drawStompHint(ctx, b.cx(), b.y, t);
        if (b.miniBar) K.drawMiniBar(ctx, b);
      }
      K.drawProjectiles(ctx, b);
      ctx.restore();
    };

    return b;
  };

  // ---------------------------------------------------------------------------
  // Registry + bộ điều khiển trận độc lập
  // ---------------------------------------------------------------------------
  /** @type {BossFight|null} trận đang chạy của bộ điều khiển độc lập (start/update/draw) */
  var fight = null;
  var listenersOn = false;

  function bindListeners() {
    if (listenersOn || !OG.Events) return;
    listenersOn = true;
    OG.Events.on('player:action', function () { K.actionSeq++; });
  }
  // Đăng ký ngay lúc load (không đụng Save) để vẫn chạy nếu init() không được gọi.
  // ⚠️ Bẫy: cờ listenersOn chặn đăng ký lần 2 khi init() gọi lại — thiếu nó thì mỗi cú bấm tăng actionSeq 2 lần
  //   (vô hại ở đây, nhưng với listener có tác dụng phụ như cộng điểm thì là lỗi kinh điển của event bus).
  bindListeners();

  OG.Bosses = {
    /** @type {Object<string, BossDef>} */
    defs: defs,
    kit: K,
    /** @type {Object<string, function(Object, BossCfg=): Object>} id -> hàm tạo trùm có cấu hình */
    factories: {},

    /**
     * Khởi tạo module (main.js gọi sau Sprites.init): đảm bảo đã nghe 'player:action', đọc lại danh sách animState.
     */
    init: function () {
      bindListeners();
      K._anims = null; // đọc lại danh sách animState sau khi Sprites.init chạy
    },

    /**
     * Đăng ký (hoặc ghi đè) một định nghĩa trùm theo id. File trùm gọi lúc load.
     * @param {BossDef} def
     * @returns {BossDef|null} def nếu hợp lệ, null nếu thiếu id / create
     * @example
     *   OG.Bosses.register({ id: 'demo', name: 'Demo', maxHp: 3, create: function (arena) { return K.createBase(SPEC, arena); } });
     */
    register: function (def) {
      if (!def || !def.id || typeof def.create !== 'function') { console.warn('[OG.Bosses] def không hợp lệ', def); return null; }
      defs[def.id] = def;
      return def;
    },
    /**
     * Kiểm tra đã có trùm với id này chưa (Game dùng để quyết định màn có trận trùm không).
     * @param {string} id
     * @returns {boolean}
     */
    has: function (id) { return !!defs[id]; },
    /**
     * Liệt kê id mọi trùm đã đăng ký.
     * @returns {string[]}
     */
    list: function () { return Object.keys(defs); },
    /**
     * Lấy thông tin hiển thị của trùm (cho HUD / menu).
     * @param {string} id
     * @returns {{id: string, name: string, maxHp: number}|null}
     */
    getInfo: function (id) { var d = defs[id]; return d ? { id: d.id, name: d.name || d.id, maxHp: d.maxHp || 0 } : null; },
    /**
     * Lấy cấu hình đấu trường mặc định của trùm (bục [x,y,w,h], spawn, theme), null nếu không có.
     * @param {string} id
     * @returns {Object|null}
     */
    getArena: function (id) { var d = defs[id]; return (d && d.arena) || null; },
    /**
     * Tạo một trùm đang đánh. Arena được chuẩn hoá (normalizeArena) trước; lỗi khi tạo chỉ log và trả null.
     * @param {string} id
     * @param {Object} arena  đấu trường do scene 'boss' dựng (bị SỬA: lấp field/hàm còn thiếu)
     * @returns {BossInstance|null}
     * @example
     *   var boss = OG.Bosses.create('deedee', arena);
     *   if (boss) boss.update(1 / 60, arena);
     */
    create: function (id, arena) {
      var d = defs[id];
      if (!d) return null;
      arena = K.normalizeArena(arena);
      try { return d.create(arena) || null; }
      catch (e) { console.error('[OG.Bosses] tạo trùm lỗi: ' + id, e); return null; }
    },

    // ---------- Bộ điều khiển trận độc lập (tuỳ chọn) ----------
    // Dùng khi một scene muốn giao toàn bộ logic trận cho OG.Bosses. Scene 'boss' hiện tại
    // tự xử lý giẫm/chạm/emit nên KHÔNG gọi các hàm này (tránh phát event hai lần).

    /**
     * Bắt đầu một trận do OG.Bosses tự quản lý. PHÁT 'boss:start'.
     * @param {string} bossId
     * @param {Object} [arenaLike]  arena một phần
     * @returns {BossFight|null}
     */
    start: function (bossId, arenaLike) {
      var arena = K.normalizeArena(arenaLike || {});
      arena.bossId = bossId;
      var boss = OG.Bosses.create(bossId, arena);
      if (!boss) { fight = null; return null; }
      fight = { bossId: bossId, arena: arena, boss: boss, done: false, t: 0 };
      K.emit(arena, 'boss:start', { bossId: bossId, levelId: arena.levelId || null, name: boss.name, maxHp: boss.maxHp });
      return fight;
    },
    /**
     * Cập nhật trận độc lập 1 frame: trùm, xét giẫm weakspot / chạm hurtbox. Có thể PHÁT 'boss:hit', 'boss:defeated'.
     * @param {number} dt  giây
     */
    update: function (dt) {
      if (!fight) return;
      var A = fight.arena, boss = fight.boss, p = A.player;
      fight.t += dt; A.t += dt;
      U.safe('Bosses.fight.update', boss.update, boss, [dt, A]);
      if (fight.done) return;
      var weak = boss.getWeakspot();
      // Xét giẫm bằng đáy ở frame TRƯỚC: chỉ tính khi người chơi đi từ TRÊN xuống, không phải chạm từ bên hông.
      var prevBottom = p.prevBottom != null ? p.prevBottom : p.y + p.h - (p.vy || 0) * dt;
      var stomp = weak && (OG.Physics ? OG.Physics.isStomp(p, prevBottom, weak, 16) : (p.vy > 0 && K.overlap(p, weak)));
      if (stomp) {
        p.vy = -((OG.Config && OG.Config.STOMP_BOUNCE) || 420) * 1.1;
        p.inv = Math.max(p.inv || 0, 0.3);
        if (boss.onHit(1, A)) {
          K.call(A, 'addScore', 100);
          K.emit(A, 'boss:hit', { bossId: fight.bossId, hp: boss.hp, maxHp: boss.maxHp });
        }
      } else {
        var boxes = boss.getHurtboxes();
        for (var i = 0; i < boxes.length; i++) if (K.overlap(p, boxes[i])) { K.hurtPlayer(A, 'boss'); break; }
      }
      if (boss.isDefeated()) {
        fight.done = true;
        K.call(A, 'addScore', 500);
        K.emit(A, 'boss:defeated', { bossId: fight.bossId, levelId: A.levelId || null, time: fight.t });
      }
    },
    /**
     * Vẽ trận độc lập (toạ độ thế giới; bên gọi tự áp camera).
     * @param {CanvasRenderingContext2D} ctx
     */
    draw: function (ctx) { if (fight) U.safe('Bosses.fight.draw', fight.boss.draw, fight.boss, [ctx, fight.arena]); },
    /** Dừng trận độc lập (không phát event). */
    stop: function () { fight = null; },
    /**
     * Lấy trận độc lập đang chạy.
     * @returns {BossFight|null}
     */
    active: function () { return fight; }
  };

  // 🧪 Thử: đổi INV_TIME 1.2 → 3 rồi giẫm trùm: trùm nhấp nháy lâu hơn và mũi tên "GIẪM!" biến mất lâu hơn
  //   (getWeakspot trả null khi inv > 0) → trận kéo dài. Đổi REFLECT_RANGE 80 → 200: đánh bật đạn từ rất xa, trận dễ hẳn.
})();
