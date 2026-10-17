// @ts-check
/* ============================================================================
 * OG.Level + scene 'level' — GAMEPLAY MỘT MÀN (nhặt đủ pizza, tránh/giẫm gián, qua cửa EXIT)
 * ----------------------------------------------------------------------------
 * Vai trò:      Biến LevelDef (dữ liệu) thành trạng thái màn đang chơi (OG.Level.state), chạy vòng update mỗi frame
 *               (người chơi → hook → vật phẩm → kẻ địch → cửa ra → pha ăn mừng) và vẽ thế giới. OG.Game.startLevel
 *               chuyển vào scene này; khi qua cửa nó gọi OG.Game.finishStage. OG.Level.state cũng được scene khác
 *               (pause, gameover) dùng để vẽ lại khung cảnh màn.
 * Khái niệm:    scene với pha nội bộ (st.phase: 'play' → 'clear' → 'done') · dữ liệu → trạng thái chạy (buildState) ·
 *               xét va chạm: giẫm (stomp) vs chạm (touch), hitbox vs hurtbox · hook mở rộng (plugin) có thứ tự ·
 *               thứ tự vẽ theo lớp (nền → thế giới → người chơi → màn hình) · phát event cho hệ thống khác
 * Bài học:      docs/learn/04-vat-ly-va-cham-aabb.md, docs/learn/05-state-machine-scene.md,
 *               docs/learn/12-data-driven-man-cau-do-hanh-trinh.md (addHook)
 * Phụ thuộc:    LÚC LOAD: OG.Config, OG.util, OG.Scenes.register. LÚC CHẠY: OG.Game, OG.Player, OG.Enemies,
 *               OG.Collectibles, OG.Particles, OG.Camera, OG.Sprites, OG.DOM, OG.Input, OG.Data, OG.Save,
 *               OG.Difficulty (isStomp/touches/onFall — tuỳ chọn), OG.Bosses.has, OG.Menus.drawHud (tuỳ chọn)
 * Event:        phát: 'level:start', 'item:collect', 'enemy:stomp', 'door:enter', 'level:clear', 'level:exitLocked',
 *               'game:resume' (+ các event do Player/Game phát) · nghe: (không)
 * API công khai: OG.Level.state, addHook(hook), removeHook(id), hookIds(), drawWorld(ctx, st), stompOk(...), touchOk(p, box);
 *               scene 'level' (params.levelId)
 * Đọc tiếp:     src/game/game.js (finishStage → boss/completeLevel) → src/game/boss-scene.js (scene trùm dùng lại
 *               stompOk/touchOk) → src/story/learn.js (ví dụ một level hook)
 *
 * Hợp đồng level hook (docs/STORY.md mục 6.1) — module khác (OG.Learn, OG.Guide, OG.Difficulty...) gắn hành vi
 * vào màn mà không sửa file này:
 *   hook = { id, order?(50), enter(st), update(st, dt, player) -> true để dừng frame (vd vừa push scene),
 *            canExit(st, player) -> false để chặn cửa EXIT (hook tự mở câu đố/thông báo),
 *            drawWorld(ctx, st, t) (thế giới, trước người chơi), drawFront(ctx, st, t) (thế giới, sau người chơi),
 *            drawScreen(ctx, st, t) (màn hình, trước HUD) }
 * ========================================================================== */

/**
 * @typedef {Object} LevelState  trạng thái màn đang chơi (OG.Level.state). Hook được thêm field riêng.
 * @property {LevelDef} level       dữ liệu màn gốc
 * @property {number} width         bề rộng thế giới, px
 * @property {Platform[]} platforms đã đổi từ [x,y,w,h] sang object; platforms[0] là sàn (isFloor)
 * @property {Object[]} items       pizza + xu (OG.Collectibles), x,y = tâm
 * @property {Enemy[]} enemies
 * @property {{x: number, y: number, floorY: number}} exit  cửa ra; qua cửa khi player.x > exit.x
 * @property {Player} player
 * @property {number} t             giây đã chơi trong màn (không tính lúc pause)
 * @property {'play'|'clear'|'done'} phase
 * @property {number} clearT        giây đã ăn mừng trong pha 'clear'
 * @property {number} lockedCooldown giây chờ trước khi nhắc lại "cần đủ pizza"
 * @property {string|null} journeyId id hành trình v2 (null = màn cổ điển)
 */
(function () {
  'use strict';
  var OG = window.OG;
  var C = OG.Config;
  var U = OG.util;

  var CLEAR_DELAY = 0.9;          // giây ăn mừng trước khi chuyển màn/boss
  var FLOOR_DETECT_Y = 470;       // platform[0] có y ≥ 470 mới được đánh dấu là sàn (isFloor)
  var EXIT_Y = 400;               // y tham chiếu của cửa ra, px thế giới
  var EXIT_REACH = 100;           // chân người chơi phải thấp hơn (EXIT_Y − 100) — đứng trên bục cao không tính qua cửa
  var FALL_MARGIN = 80;           // rơi quá đáy màn hình 80 px coi là rơi khỏi màn
  var RESPAWN_Y = 350;            // đặt lại sau khi rơi (chế độ challenge), px thế giới
  var RESPAWN_BACK = 100;         // lùi về sau 100 px so với chỗ rơi
  var RESPAWN_MIN_X = 20;
  var STOMP_TOLERANCE = 12;       // dung sai giẫm, px (xem OG.Physics.isStomp)
  var EXIT_LOCKED_COOLDOWN = 1.5; // giây giữa hai lần nhắc "cần đủ pizza"
  var DEFAULT_HOOK_ORDER = 50;
  var PIZZA_SCORE = 100;
  var COIN_SCORE = 10;

  // ---------------------------------------------------------------------------
  // Level hooks (v2)
  // ---------------------------------------------------------------------------
  /** @type {LevelHook[]} luôn được sắp theo order tăng dần */
  var hooks = [];
  /**
   * Gọi method trên mọi hook có method đó, theo thứ tự order. Lỗi trong hook bị cô lập (OG.util.safe).
   * @param {string} method
   * @param {any[]} args
   */
  function runHooks(method, args) {
    for (var i = 0; i < hooks.length; i++) {
      var h = hooks[i];
      if (typeof h[method] === 'function') U.safe('levelHook ' + h.id + '.' + method, h[method], h, args);
    }
  }

  /**
   * Dựng trạng thái chạy của màn từ dữ liệu LevelDef.
   * 💡 Khái niệm: tách DỮ LIỆU (LevelDef — không bao giờ bị sửa) khỏi TRẠNG THÁI (st — thay đổi mỗi frame).
   *   Chơi lại màn chỉ cần dựng st mới từ cùng LevelDef, không lo "pizza đã ăn" còn sót lại.
   * @param {LevelDef} level
   * @returns {LevelState}
   */
  function buildState(level) {
    var run = OG.Game.ensureRun();
    var mods = OG.Game.levelMods(level.id);
    var st = /** @type {LevelState} */ ({
      level: level,
      width: level.width,
      platforms: level.platforms.map(function (a, i) { return { x: a[0], y: a[1], w: a[2], h: a[3], isFloor: i === 0 && a[1] >= FLOOR_DETECT_Y }; }),
      items: [],
      enemies: (level.enemies || []).map(function (e, i) { return OG.Enemies.create(e, i); }),
      exit: { x: level.exit.x, y: EXIT_Y, floorY: OG.FLOOR_Y },
      player: OG.Player.create(run.charId, level.spawn.x, level.spawn.y, mods, run.skinId),
      t: 0, phase: 'play', clearT: 0, lockedCooldown: 0,
      journeyId: level.journey || null // màn hành trình v2 (null = cổ điển)
    });
    level.pizzas.forEach(function (a) { st.items.push(OG.Collectibles.create('pizza', a[0], a[1])); });
    (level.coins || []).forEach(function (a) { st.items.push(OG.Collectibles.create('coin', a[0], a[1])); });
    return st;
  }

  var Level = (OG.Level = {
    /** @type {LevelState | null} màn đang chơi (hoặc vừa chơi) */
    state: null,

    /**
     * Gắn (hoặc thay thế, nếu cùng id) một level hook. Gọi trong init() của module.
     * 💡 Khái niệm: hook / plugin — level.js không biết gì về thẻ học, câu đố hay checkpoint; các module đó tự
     *   "cắm" vào những điểm mở sẵn (enter/update/canExit/draw*). order nhỏ chạy trước.
     * @param {LevelHook} hook
     * @returns {LevelHook | null} null nếu thiếu id
     * @example
     *   OG.Level.addHook({ id: 'demo', order: 60,
     *     drawScreen: function (ctx, st) { ctx.fillText('Pizza: ' + OG.Game.stage.pizzas, 20, 520); } });
     */
    addHook: function (hook) {
      if (!hook || !hook.id) return null;
      Level.removeHook(hook.id);
      hooks.push(hook);
      hooks.sort(function (a, b) { return (a.order || DEFAULT_HOOK_ORDER) - (b.order || DEFAULT_HOOK_ORDER); });
      return hook;
    },
    /** @param {string} id gỡ hook theo id (không có thì thôi) */
    removeHook: function (id) { hooks = hooks.filter(function (h) { return h.id !== id; }); },
    /** @returns {string[]} id các hook theo thứ tự chạy */
    hookIds: function () { return hooks.map(function (h) { return h.id; }); },

    /**
     * Vẽ thế giới của màn (dùng chung cho scene level và nền của pause/gameover).
     * @param {CanvasRenderingContext2D} ctx
     * @param {LevelState} [st] mặc định OG.Level.state
     */
    drawWorld: function (ctx, st) {
      st = st || Level.state;
      if (!st) return;
      var theme = st.level.theme, t = OG.time;
      // 💡 Khái niệm: vẽ theo lớp (painter's algorithm) — vẽ từ xa tới gần, cái vẽ SAU đè lên cái vẽ TRƯỚC:
      //   nền parallax (toạ độ màn hình) → [camera] bục, decor, vật phẩm, địch, cửa, hook, hạt, người chơi, hook trước mặt
      //   → [bỏ camera] lớp phủ, hook màn hình. HUD vẽ sau cùng ở scene.draw.
      OG.Sprites.drawBackground(ctx, theme, OG.Camera.x, t);
      ctx.save();
      OG.Camera.apply(ctx);
      for (var i = 0; i < st.platforms.length; i++) OG.Sprites.drawPlatform(ctx, st.platforms[i], theme, t);
      OG.Sprites.drawDecor(ctx, theme, st.width, t);
      for (var j = 0; j < st.items.length; j++) OG.Collectibles.draw(ctx, st.items[j], t);
      for (var k = 0; k < st.enemies.length; k++) OG.Enemies.draw(ctx, st.enemies[k], t);
      OG.Sprites.drawProp(ctx, 'exit', st.exit.x, st.exit.floorY, t, { open: OG.Game.stage && OG.Game.stage.pizzas >= st.level.goal });
      runHooks('drawWorld', [ctx, st, t]);
      OG.Particles.draw(ctx);
      OG.Player.draw(ctx, st.player, t);
      runHooks('drawFront', [ctx, st, t]);
      ctx.restore();
      if (OG.Sprites.drawOverlay) U.safe('Sprites.drawOverlay', OG.Sprites.drawOverlay, OG.Sprites, [ctx, theme, OG.Camera.x, t]);
      runHooks('drawScreen', [ctx, st, t]);
      // viền mảnh phía trên như MVP
      ctx.fillStyle = '#17233d22'; ctx.fillRect(0, 0, OG.W, 5);
    }
  });

  /**
   * Có hook nào chặn cửa EXIT không (dừng ở hook đầu tiên trả false).
   * @param {LevelState} st
   * @param {Player} p
   * @returns {boolean}
   */
  function exitBlocked(st, p) {
    for (var i = 0; i < hooks.length; i++) {
      var h = hooks[i];
      if (typeof h.canExit !== 'function') continue;
      // So sánh === false (không phải falsy): hook không trả gì (undefined) nghĩa là "không ý kiến", không chặn.
      if (U.safe('levelHook ' + h.id + '.canExit', h.canExit, h, [st, p]) === false) return true;
    }
    return false;
  }

  function hasSpriteFx() { return !!(OG.Sprites && OG.Sprites.fx); }

  // ---------------------------------------------------------------------------
  // Phép thử va chạm theo độ khó (OG.Difficulty có thể vẫn là stub -> dùng phép thử v1).
  // Dùng chung cho scene boss qua OG.Level.stompOk / touchOk.
  // ---------------------------------------------------------------------------

  /**
   * Kiểm tra người chơi GIẪM lên target. Ưu tiên OG.Difficulty.isStomp (chế độ 'kid' nới lỏng), không có thì dùng phép v1.
   * @param {PhysicsBody} p người chơi
   * @param {number} prevBottom đáy người chơi ở frame trước, px
   * @param {AABB} target hitbox bị giẫm
   * @param {number} [tol=12] dung sai, px
   * @param {number} [prevTop] đỉnh target ở frame trước (kẻ địch tự nhảy), px
   * @returns {boolean}
   */
  function stompOk(p, prevBottom, target, tol, prevTop) {
    var D = OG.Difficulty;
    if (D && typeof D.isStomp === 'function') {
      var r = U.safe('Difficulty.isStomp', D.isStomp, D, [p, prevBottom, target, tol, prevTop]);
      if (typeof r === 'boolean') return r;
    }
    // ⚠️ Bẫy: kẻ địch đang nhảy LÊN (đỉnh frame này cao hơn frame trước) — lấy đỉnh THẤP hơn trong hai frame
    //   (max của y, vì y hướng xuống) để cú giẫm hợp lệ không bị tính thành "bị đâm từ dưới".
    var top = prevTop != null ? Math.max(target.y, prevTop) : target.y;
    return p.vy > 0 && prevBottom <= top + (tol == null ? STOMP_TOLERANCE : tol) && U.overlap(p, target);
  }
  /**
   * Kiểm tra người chơi CHẠM vùng gây đau. Ưu tiên OG.Difficulty.touches, không có thì AABB thường.
   * @param {AABB} p
   * @param {AABB} box hurtbox
   * @returns {boolean}
   */
  function touchOk(p, box) {
    var D = OG.Difficulty;
    if (D && typeof D.touches === 'function') {
      var r = U.safe('Difficulty.touches', D.touches, D, [p, box]);
      if (typeof r === 'boolean') return r;
    }
    return U.overlap(p, box);
  }
  // Gắn vào OG.Level SAU khi định nghĩa (ép kiểu any vì object literal ở trên không khai hai field này).
  /** @type {any} */ (Level).stompOk = stompOk;
  /** @type {any} */ (Level).touchOk = touchOk;

  /**
   * Nhặt một vật phẩm: cộng điểm/thống kê, hiệu ứng, phát 'item:collect'.
   * @param {LevelState} st
   * @param {any} it vật phẩm (bị SỬA: got = true)
   */
  function collect(st, it) {
    var stage = OG.Game.stage;
    it.got = true;
    if (it.type === 'pizza') {
      // Ba tầng thống kê: màn này (stage), lượt chơi (run), trọn đời (Save) — mỗi tầng phục vụ một màn hình khác.
      stage.pizzas++;
      OG.Game.run.stats.pizzas++;
      OG.Save.data.stats.pizzas++;
      OG.Game.hud.pizzas = stage.pizzas;
      OG.Game.addScore(PIZZA_SCORE);
      OG.DOM.toast('Yum! +100 điểm 🍕');
      // Sprites (nếu có) tự phát lấp lánh qua item:collect; chỉ dùng hạt vuông khi thiếu Sprites.fx.
      if (!hasSpriteFx()) OG.Particles.spawn(it.x, it.y - 10, { color: '#ffc94a', count: 10 });
      if (stage.pizzas === st.level.goal) OG.DOM.toast('Đủ pizza rồi! Cửa EXIT đã mở 🚪');
    } else if (it.type === 'coin') {
      OG.Game.addScore(COIN_SCORE);
      OG.Game.pickupCoins(1);
      OG.Particles.floatText(it.x, it.y - 14, '+1', '#ffc94a');
    }
    OG.Events.emit('item:collect', { type: it.type, x: it.x, y: it.y, value: it.type === 'pizza' ? PIZZA_SCORE : COIN_SCORE, count: it.type === 'pizza' ? stage.pizzas : stage.coins, goal: st.level.goal });
  }

  // ---------------------------------------------------------------------------
  // Các bước của update (hàm con). Hàm trả true = "dừng frame này" (scene đã đổi hoặc hook yêu cầu dừng).
  // ---------------------------------------------------------------------------

  /**
   * Xử lý rơi khỏi màn hình. 'kid': OG.Difficulty hồi về chỗ đứng an toàn, không mất mạng.
   * 'challenge' (như MVP): mất mạng, đặt lại gần đó.
   * @param {LevelState} st
   * @param {Player} p
   * @returns {boolean} true nếu phải dừng frame (vừa game over / rời scene)
   */
  function handleFall(st, p) {
    if (p.y > OG.H + FALL_MARGIN && U.call('Difficulty', 'onFall', p, st) !== true) {
      OG.Player.hurt(p, 'fall');
      // ⚠️ Bẫy: hurt() có thể đã chuyển sang gameover (hết mạng). Kiểm tra lại scene trước khi đụng tiếp vào st —
      //   nếu không, ta sẽ đặt lại vị trí cho một màn đã kết thúc.
      if (OG.Scenes.base() !== 'level') return true;
      p.y = RESPAWN_Y; p.x = Math.max(RESPAWN_MIN_X, p.x - RESPAWN_BACK); p.vy = 0;
    }
    return false;
  }

  /**
   * Chạy update của các hook (trang sách, cổng câu đố, người dẫn đường, checkpoint...).
   * @returns {boolean} true nếu hook yêu cầu dừng hoặc đã đổi scene/màn
   */
  function runUpdateHooks(st, dt, p) {
    for (var h = 0; h < hooks.length; h++) {
      var hk = hooks[h];
      if (typeof hk.update !== 'function') continue;
      var stop = U.safe('levelHook ' + hk.id + '.update', hk.update, hk, [st, dt, p]);
      // Level.state !== st: hook đã khởi động lại màn (vd hồi sinh) → st cũ không còn hiệu lực.
      if (stop === true || OG.Scenes.current() !== 'level' || Level.state !== st) return true;
    }
    return false;
  }

  /** Vật phẩm: xét nhặt (kèm nam châm). */
  function updateItems(st, dt, p) {
    for (var i = 0; i < st.items.length; i++) {
      var it = st.items[i];
      if (!it.got && OG.Collectibles.touches(it, p, dt, p.magnet)) collect(st, it);
    }
  }

  /**
   * Kẻ địch: cập nhật AI rồi xét va chạm — giẫm từ trên xuống = tiêu diệt, chạm ngang = bị thương.
   * @param {LevelState} st
   * @param {number} dt
   * @param {Player} p
   * @param {MoveResult} res kết quả vật lý của người chơi frame này
   * @param {any} stage OG.Game.stage
   * @returns {boolean} true nếu phải dừng frame (bị thương dẫn tới game over)
   */
  function updateEnemies(st, dt, p, res, stage) {
    for (var k = 0; k < st.enemies.length; k++) {
      var e = st.enemies[k];
      OG.Enemies.update(e, dt, st);
      if (!e.alive || st.phase !== 'play') continue;
      // 💡 Khái niệm: xét GIẪM trước, CHẠM sau (else if). Cùng một lần chồng hitbox, nếu đủ điều kiện giẫm thì
      //   người chơi thắng; chỉ khi không phải giẫm mới xét hurtbox để trừ mạng.
      if (e.stompable && stompOk(p, res.prevBottom, e, STOMP_TOLERANCE, e.prevY)) {
        OG.Enemies.kill(e);
        // Nảy lên sau khi giẫm: cảm giác "đã" + có thể giẫm liên hoàn con kế tiếp.
        p.vy = -C.STOMP_BOUNCE;
        stage.stomps++;
        OG.Game.run.stats.stomps++;
        OG.Save.data.stats.stomps++;
        OG.Game.addScore(e.score);
        if (!hasSpriteFx()) OG.Particles.spawn(e.x + e.w / 2, e.y + e.h / 2, { color: '#b56bc7', count: 12 });
        OG.Particles.floatText(e.x + e.w / 2, e.y - 6, '+' + e.score);
        OG.Events.emit('enemy:stomp', { type: e.type, x: e.x, y: e.y, score: e.score });
      } else if (e.hurts && touchOk(p, OG.Enemies.hurtbox(e))) {
        OG.Player.hurt(p, 'enemy');
        if (OG.Scenes.base() !== 'level') return true;
      }
    }
    return false;
  }

  /**
   * Cửa EXIT: đủ pizza và không hook nào chặn → chuyển pha 'clear'; thiếu pizza → nhắc (có cooldown).
   * @returns {boolean} true nếu phải dừng frame (hook ở cửa đã mở scene khác)
   */
  function checkExit(st, p, stage) {
    if (st.phase === 'play' && p.x > st.exit.x && p.y + p.h > st.exit.y - EXIT_REACH) {
      if (stage.pizzas >= st.level.goal && !exitBlocked(st, p)) {
        // 💡 Khái niệm: pha trong scene — 'play' → 'clear' (ăn mừng 0.9 giây, kẻ địch không gây đau nữa) → 'done'.
        //   Một state machine nhỏ BÊN TRONG scene, không cần tạo scene riêng cho mấy giây ăn mừng.
        st.phase = 'clear';
        st.clearT = 0;
        p.celebrate = true;
        OG.Events.emit('door:enter', { levelId: st.level.id, x: st.exit.x, y: st.exit.y });
        OG.Events.emit('level:clear', { levelId: st.level.id });
        OG.DOM.toast(st.level.boss && OG.util.call('Bosses', 'has', st.level.boss) ? 'Có biến! Trùm gián xuất hiện!' : 'Hoàn thành màn! 🎉');
      } else if (stage.pizzas >= st.level.goal) {
        // Hook (vd cổng câu đố ở cửa) đã chặn và tự xử lý.
        if (OG.Scenes.current() !== 'level') return true;
      } else if (st.lockedCooldown <= 0) {
        // Cooldown: người chơi đứng ở cửa sẽ chạm điều kiện mỗi frame — không có nó toast/event lặp 60 lần/giây.
        st.lockedCooldown = EXIT_LOCKED_COOLDOWN;
        OG.DOM.toast('Cần thu thập đủ pizza trước khi qua cửa!');
        OG.Events.emit('level:exitLocked', { levelId: st.level.id, have: stage.pizzas, need: st.level.goal });
      }
    }
    return false;
  }

  OG.Scenes.register('level', {
    /** @param {{levelId?: string|number}} params */
    enter: function (params) {
      var level = OG.Data.getLevel(params.levelId != null ? params.levelId : 0) || OG.Data.levels[0];
      OG.DOM.hidePanel();
      OG.DOM.setHudVisible(true);
      OG.DOM.setControlsVisible(true);
      OG.Particles.clear();
      OG.Camera.reset();
      var st = (Level.state = buildState(level));
      OG.Game.beginStage(level);
      var hud = OG.Game.hud;
      hud.scene = 'level'; hud.levelId = level.id; hud.levelName = level.name; hud.icon = level.icon || '📍';
      hud.pizzas = 0; hud.goal = level.goal; hud.boss = null; hud.shield = st.player.shield;
      OG.Events.emit('level:start', {
        levelId: level.id, index: OG.Data.levelIndex(level.id), name: level.name, theme: level.theme,
        music: level.music || level.theme, boss: level.boss || null, quests: level.quests || []
      });
      // Hook enter SAU level:start: module nghe level:start (vd Quests) đã sẵn sàng khi hook chạy.
      runHooks('enter', [st]);
      OG.Game.refreshHud();
      OG.Camera.follow(st.player, st.width);
    },

    resume: function () { OG.DOM.hidePanel(); OG.Events.emit('game:resume', { scene: 'level' }); },

    /** @param {number} dt delta time, giây */
    update: function (dt) {
      var st = Level.state;
      if (!st) return;
      if (OG.Input.pressed('pause')) { OG.Input.consume('pause'); OG.Scenes.push('pause', { from: 'level' }); return; }
      var p = st.player, stage = OG.Game.stage;
      st.t += dt;
      st.lockedCooldown = Math.max(0, st.lockedCooldown - dt);
      OG.Game.tickTime(dt);

      // ⚠️ Bẫy: thứ tự các bước dưới đây có chủ đích. Người chơi di chuyển TRƯỚC để có prevBottom mới nhất cho
      //   phép giẫm; hook chạy trước vật phẩm/kẻ địch để cổng câu đố kịp dừng frame; cửa ra xét SAU kẻ địch.
      var res = OG.Player.update(p, dt, st);
      if (handleFall(st, p)) return;
      if (runUpdateHooks(st, dt, p)) return;
      updateItems(st, dt, p);
      if (updateEnemies(st, dt, p, res, stage)) return;
      if (checkExit(st, p, stage)) return;

      if (st.phase === 'clear') {
        st.clearT += dt;
        if (st.clearT >= CLEAR_DELAY) { st.phase = 'done'; OG.Game.finishStage(st.level.id); return; }
      }

      OG.Particles.update(dt);
      // 🧪 Thử: comment dòng dưới — camera đứng yên, nhân vật chạy ra khỏi màn hình (thấy rõ vai trò của camera).
      OG.Camera.follow(p, st.width);
    },

    /** @param {CanvasRenderingContext2D} ctx */
    draw: function (ctx) {
      Level.drawWorld(ctx);
      OG.util.call('Menus', 'drawHud', ctx, OG.Game.hud);
    }
  });
})();
