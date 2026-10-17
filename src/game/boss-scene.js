// @ts-check
/* ============================================================================
 * Scene 'boss' + OG.BossScene — KHUNG ĐẤU TRÙM (arena)
 * ----------------------------------------------------------------------------
 * Vai trò:      Scene lo người chơi, va chạm (giẫm điểm yếu / chạm hurtbox), HUD và chuyển cảnh; HÀNH VI trùm do
 *               OG.Bosses cung cấp (BossInstance). OG.Game.finishStage() chuyển vào đây khi màn có trùm.
 *               OG.BossScene cho scene khác (pause/gameover) vẽ lại trận và cho công cụ test đọc trạng thái.
 * Khái niệm:    tách "khung" (scene: luật chơi chung) khỏi "nội dung" (trùm: AI riêng) qua một hợp đồng (Arena +
 *               BossInstance) · dependency injection (trùm chỉ gọi API của arena, không đụng thẳng OG.Game) ·
 *               pha trận ('fight' → 'end' | 'skip') · weakspot (điểm yếu) vs hurtbox · time scale theo độ khó
 * Bài học:      docs/learn/09-ai-ke-dich-boss.md, docs/learn/05-state-machine-scene.md
 * Phụ thuộc:    LÚC LOAD: OG.Config, OG.util, OG.Scenes.register. LÚC CHẠY: OG.Bosses (getArena, create), OG.Game,
 *               OG.Player, OG.Enemies, OG.Level.stompOk/touchOk, OG.Physics, OG.Particles, OG.Camera, OG.DOM,
 *               OG.Sprites, OG.Difficulty (setupBoss, applyAssist, bossTimeScale, trackSafe, onFall, params — tuỳ chọn)
 * Event:        phát: 'boss:start', 'boss:hit', 'boss:defeated', 'enemy:stomp', 'game:resume' (+ event của trùm qua arena.emit)
 *               · nghe: (không)
 * API công khai: scene 'boss' (params {levelId, bossId}); OG.BossScene.isActive(), draw(ctx), getPlayer(), getArena(), getBoss()
 * Đọc tiếp:     src/bosses/bosses.js (kit dựng trùm, setState) → src/bosses/deedee.js (ví dụ trùm cụ thể)
 *               → src/game/difficulty.js (setupBoss, bossTimeScale)
 * Dữ liệu:      Arena, BossInstance, BossDef (src/types.d.ts); hợp đồng docs/ARCHITECTURE.md mục 8.3.
 *
 * Vòng đời: level qua cửa → OG.Game.finishStage() → go('boss', {levelId, bossId})
 *   → enter: arena = OG.Bosses.getArena(bossId) || mặc định; boss = OG.Bosses.create(bossId, arena)
 *   → nếu boss null: bỏ qua, hoàn thành màn luôn.
 *   → mỗi frame: player update; boss.update(dt, arena); giẫm boss.getWeakspot() → boss.onHit(1, arena);
 *     chạm boss.getHurtboxes() → player bị thương; boss.isDefeated() → boss:defeated → completeLevel.
 * ========================================================================== */

/**
 * @typedef {Object} BattleState  trạng thái trận đang diễn ra
 * @property {string} levelId
 * @property {string} bossId
 * @property {Arena} arena
 * @property {BossInstance | null} boss     null = không tạo được trùm → pha 'skip'
 * @property {'fight'|'end'|'skip'} phase
 * @property {number} endT                  giây đã trôi trong pha 'end'
 * @property {number | null} prevWeakTop    đỉnh điểm yếu ở frame trước, px (trùm nhảy vẫn giẫm được)
 */
(function () {
  'use strict';
  var OG = window.OG;
  var C = OG.Config;
  var U = OG.util;

  // Đấu trường dự phòng khi trùm không tự khai báo: một màn hình, sàn + hai bục để né.
  var DEFAULT_ARENA = {
    width: 960,
    platforms: [[0, 480, 960, 60], [150, 370, 160, 18], [650, 370, 160, 18]],
    spawn: { x: 80, y: 420 }
  };

  var FLOOR_DETECT_Y = 470;        // platform[0] có y ≥ 470 mới là sàn (isFloor) — giống level.js
  var FALL_MARGIN = 80;            // rơi quá đáy màn hình 80 px coi là rơi khỏi màn
  var RESPAWN_X = 80;              // đặt lại sau khi rơi (chế độ challenge), px thế giới
  var RESPAWN_Y = 300;
  var WEAKSPOT_TOLERANCE = 16;     // dung sai giẫm điểm yếu, px — rộng hơn gián thường (12) vì trùm di chuyển nhiều
  var MINION_STOMP_TOLERANCE = 12;
  var BOSS_BOUNCE_MUL = 1.1;       // nảy cao hơn khi giẫm trùm → dễ thoát khỏi người trùm
  var HIT_INVULN = 0.3;            // bất tử ngắn sau khi giẫm trúng, giây — tránh vừa giẫm vừa bị chạm ở frame sau
  var BOSS_HIT_SCORE = 100;
  var BOSS_DEFEAT_SCORE = 500;
  var HIT_SHAKE_MAG = 6;           // px
  var HIT_SHAKE_DUR = 0.2;         // giây
  var DEFEAT_SHAKE_MAG = 10;       // px
  var DEFEAT_SHAKE_DUR = 0.6;      // giây
  var END_DELAY = 1.6;             // giây xem trùm gục ngã trước khi hoàn thành màn

  /** @type {BattleState | null} trạng thái scene boss (null = không có trận) */
  var battle = null;

  // Giẫm / chạm theo độ khó (OG.Level.stompOk/touchOk; dự phòng = phép thử v1).
  /**
   * @param {PhysicsBody} p
   * @param {number} prevBottom
   * @param {AABB} target
   * @param {number} [tol]
   * @param {number | null} [prevTop]
   * @returns {boolean}
   */
  function stomp(p, prevBottom, target, tol, prevTop) {
    if (OG.Level && OG.Level.stompOk) return OG.Level.stompOk(p, prevBottom, target, tol, prevTop);
    return OG.Physics.isStomp(p, prevBottom, target, tol);
  }
  /** @param {AABB} p @param {AABB} box @returns {boolean} */
  function touch(p, box) {
    if (OG.Level && OG.Level.touchOk) return OG.Level.touchOk(p, box);
    return U.overlap(p, box);
  }

  /**
   * Dựng Arena cho trận: hình học (ưu tiên hành trình → trùm → mặc định) + người chơi + API cho trùm.
   * 💡 Khái niệm: dependency injection — trùm nhận `arena` có sẵn các hàm hurtPlayer/shake/particles/addScore...
   *   thay vì tự gọi OG.Player, OG.Camera, OG.Game. Trùm vì thế dễ test (đưa arena giả) và không phụ thuộc
   *   cách core được tổ chức.
   * @param {LevelDef} level
   * @param {string} bossId
   * @returns {Arena}
   */
  function makeArena(level, bossId) {
    var def = OG.util.call('Bosses', 'getArena', bossId) || {};
    // Hành trình v2: area.boss.arena (level.bossArena) ghi đè; cảnh nền mặc định theo chủ đề của khu.
    var jd = level.journey ? (level.bossArena || {}) : {};
    var src = {
      width: jd.width || def.width || DEFAULT_ARENA.width,
      platforms: jd.platforms || def.platforms || DEFAULT_ARENA.platforms,
      spawn: jd.spawn || def.spawn || DEFAULT_ARENA.spawn,
      theme: jd.theme || (level.journey ? level.theme : def.theme) || level.theme || 'boss'
    };
    var run = OG.Game.ensureRun();
    var mods = OG.Game.levelMods(level.id);
    /** @type {Arena} */
    var arena = {
      levelId: level.id, bossId: bossId, theme: src.theme,
      width: src.width, height: OG.H, floorY: OG.FLOOR_Y, t: 0,
      platforms: src.platforms.map(function (/** @type {number[]} */ a, /** @type {number} */ i) { return { x: a[0], y: a[1], w: a[2], h: a[3], isFloor: i === 0 && a[1] >= FLOOR_DETECT_Y }; }),
      player: OG.Player.create(run.charId, src.spawn.x, src.spawn.y, mods, run.skinId),
      // --- API cho boss ---
      hurtPlayer: function (cause) { return OG.Player.hurt(arena.player, cause || 'boss'); },
      // Đạn/bẫy của trùm: chạm sượt không tính (chế độ kid).
      overlapsPlayer: function (rect) { return touch(arena.player, rect); },
      shake: function (mag, dur) { OG.Camera.shake(mag, dur); },
      particles: function (x, y, opts) { OG.Particles.spawn(x, y, opts); },
      floatText: function (x, y, text, color) { OG.Particles.floatText(x, y, text, color); },
      toast: function (text) { OG.DOM.toast(text); },
      emit: function (name, payload) { OG.Events.emit(name, payload); },
      addScore: function (n) { OG.Game.addScore(n); },
      spawnEnemy: function (src) { var e = OG.Enemies.create(src, arena.enemies.length); arena.enemies.push(e); return e; },
      enemies: [],
      journeyId: level.journey || null,
      // Tham số độ khó (OG.Difficulty.params) để trùm tự điều chỉnh nếu muốn: bossHpMul, bossSpeedMul, mode...
      difficulty: OG.util.call('Difficulty', 'params', level.id) || null
    };
    return arena;
  }

  /** Kết thúc trận và hoàn thành màn. Xoá battle TRƯỚC để BossScene.isActive() = false khi completeLevel đổi scene. */
  function finish() {
    var levelId = battle.levelId;
    battle = null;
    OG.Game.completeLevel(levelId);
  }

  // ---------------------------------------------------------------------------
  // Các bước của update trong pha 'fight' (hàm con). Trả true = dừng frame (scene đã đổi).
  // ---------------------------------------------------------------------------

  /**
   * Giẫm điểm yếu của trùm, hoặc (nếu không giẫm) xét chạm hurtbox của trùm.
   * @param {BattleState} b
   * @param {Player} p
   * @param {BossInstance} boss
   * @param {MoveResult} res
   * @returns {boolean}
   */
  function stompBossOrGetHurt(b, p, boss, res) {
    var arena = b.arena;
    // 💡 Khái niệm: weakspot vs hurtbox — trùm có MỘT vùng để giẫm (thường là đỉnh đầu, có khi chỉ mở trong lúc
    //   choáng) và NHIỀU vùng gây đau (thân, đòn tấn công). getWeakspot() trả null = lúc này không giẫm được.
    var weak = U.safe('boss.getWeakspot', boss.getWeakspot, boss, []) || null;
    // prevWeakTop: điểm yếu frame trước — trùm đang nhảy lên/đáp xuống vẫn giẫm được.
    var wasTop = b.prevWeakTop;
    b.prevWeakTop = weak ? weak.y : null;
    if (weak && stomp(p, res.prevBottom, weak, WEAKSPOT_TOLERANCE, wasTop)) {
      p.vy = -C.STOMP_BOUNCE * BOSS_BOUNCE_MUL;
      p.inv = Math.max(p.inv, HIT_INVULN);
      U.safe('boss.onHit', boss.onHit, boss, [1, arena]);
      OG.Game.addScore(BOSS_HIT_SCORE);
      OG.Camera.shake(HIT_SHAKE_MAG, HIT_SHAKE_DUR);
      OG.Events.emit('boss:hit', { bossId: b.bossId, hp: boss.hp, maxHp: boss.maxHp });
    } else {
      var boxes = U.safe('boss.getHurtboxes', boss.getHurtboxes, boss, []) || [];
      // break sau lần chạm đầu: nhiều hurtbox chồng nhau cũng chỉ tính một lần trúng đòn.
      for (var i = 0; i < boxes.length; i++) {
        if (touch(p, boxes[i])) { OG.Player.hurt(p, 'boss'); break; }
      }
      if (OG.Scenes.base() !== 'boss') return true;
    }
    return false;
  }

  /**
   * Lính gián do trùm gọi ra: cập nhật và xét giẫm/chạm (giống màn thường).
   * @param {Arena} arena
   * @param {number} dt
   * @param {Player} p
   * @param {MoveResult} res
   * @returns {boolean}
   */
  function updateMinions(arena, dt, p, res) {
    for (var k = 0; k < arena.enemies.length; k++) {
      var e = arena.enemies[k];
      OG.Enemies.update(e, dt, arena);
      if (!e.alive) continue;
      if (stomp(p, res.prevBottom, e, MINION_STOMP_TOLERANCE, e.prevY)) {
        OG.Enemies.kill(e); p.vy = -C.STOMP_BOUNCE; OG.Game.addScore(e.score);
        if (OG.Game.stage) OG.Game.stage.stomps++;
        OG.Game.run.stats.stomps++;
        OG.Save.data.stats.stomps++;
        OG.Particles.floatText(e.x + e.w / 2, e.y - 6, '+' + e.score);
        OG.Events.emit('enemy:stomp', { type: e.type, x: e.x, y: e.y, score: e.score });
      } else if (touch(p, OG.Enemies.hurtbox(e))) {
        OG.Player.hurt(p, 'enemy');
        if (OG.Scenes.base() !== 'boss') return true;
      }
    }
    return false;
  }

  /**
   * Cập nhật máu trên HUD và kiểm tra trùm đã bị hạ chưa (→ pha 'end', phát 'boss:defeated').
   * @param {BattleState} b
   * @param {Player} p
   * @param {BossInstance} boss
   */
  function checkBossDefeated(b, p, boss) {
    var hud = OG.Game.hud;
    // Chỉ refresh HUD khi máu ĐỔI — refreshHud chạm DOM, gọi 60 lần/giây là lãng phí.
    if (hud.boss && hud.boss.hp !== boss.hp) { hud.boss.hp = boss.hp; OG.Game.refreshHud(); }
    if (U.safe('boss.isDefeated', boss.isDefeated, boss, [])) {
      b.phase = 'end';
      b.endT = 0;
      p.celebrate = true;
      OG.Game.stage.bossDefeated = true;
      OG.Game.run.stats.bosses++;
      OG.Save.data.stats.bossesDefeated++;
      OG.Game.addScore(BOSS_DEFEAT_SCORE);
      OG.Camera.shake(DEFEAT_SHAKE_MAG, DEFEAT_SHAKE_DUR);
      OG.DOM.toast('Hạ gục ' + (boss.name || 'trùm') + '! 🏆');
      OG.Events.emit('boss:defeated', { bossId: b.bossId, levelId: b.levelId, time: b.arena.t });
    }
  }

  OG.Scenes.register('boss', {
    /** @param {{levelId?: string, bossId?: string}} params */
    enter: function (params) {
      var level = OG.Data.getLevel(params.levelId) || OG.Data.levels[0];
      var bossId = params.bossId || level.boss;
      OG.DOM.hidePanel();
      OG.DOM.setHudVisible(true);
      OG.DOM.setControlsVisible(true);
      OG.Particles.clear();
      OG.Camera.reset();
      // Vào thẳng scene boss (vd test) mà chưa qua màn → vẫn có stage để cộng điểm/thống kê.
      if (!OG.Game.stage) OG.Game.beginStage(level);
      var arena = makeArena(level, bossId);
      var boss = OG.util.call('Bosses', 'create', bossId, arena) || null;
      if (boss) OG.util.call('Difficulty', 'setupBoss', boss, arena); // máu trùm theo độ khó
      battle = { levelId: level.id, bossId: bossId, arena: arena, boss: boss, phase: boss ? 'fight' : 'skip', endT: 0, prevWeakTop: null };
      // Trợ giúp (thua nhiều lần): khiên + tim khi vào trận.
      if (boss) U.call('Difficulty', 'applyAssist', arena.player, level.id);
      var hud = OG.Game.hud;
      hud.scene = 'boss';
      hud.boss = boss ? { id: bossId, name: boss.name || bossId, hp: boss.hp, maxHp: boss.maxHp } : null;
      hud.shield = arena.player.shield;
      if (boss) OG.Events.emit('boss:start', { bossId: bossId, levelId: level.id, name: boss.name || bossId, maxHp: boss.maxHp });
      OG.Game.refreshHud();
    },

    resume: function () { OG.DOM.hidePanel(); OG.Events.emit('game:resume', { scene: 'boss' }); },

    /** @param {number} dt delta time (khoảng thời gian giữa 2 frame), giây */
    update: function (dt) {
      if (!battle) return;
      // ⚠️ Bẫy: bỏ qua trận ở frame update đầu tiên thay vì gọi finish() ngay trong enter(): enter đang chạy bên trong
      //   Scenes.go(), đổi scene lồng vào đó dễ làm thứ tự exit/enter/'scene:change' bị rối.
      if (battle.phase === 'skip') { finish(); return; }
      if (OG.Input.pressed('pause')) { OG.Input.consume('pause'); OG.Scenes.push('pause', { from: 'boss' }); return; }
      var arena = battle.arena, p = arena.player, boss = battle.boss;
      arena.t += dt;
      if (battle.phase === 'fight') OG.Game.tickTime(dt);
      var res = OG.Player.update(p, dt, arena);
      if (p.y > OG.H + FALL_MARGIN && U.call('Difficulty', 'onFall', p, arena) !== true) {
        OG.Player.hurt(p, 'fall');
        if (OG.Scenes.base() !== 'boss') return;
        p.x = RESPAWN_X; p.y = RESPAWN_Y; p.vy = 0;
      }

      if (battle.phase === 'fight') {
        // 💡 Khái niệm: time scale — trùm nhận dt đã nhân hệ số (< 1 ở chế độ 'kid') nên MỌI bộ đếm giờ của trùm
        //   (telegraph, thời gian choáng, tốc độ) chậm lại đồng loạt, mà người chơi vẫn chạy ở tốc độ thật.
        // 🧪 Thử: trong console gõ  OG.Difficulty.bossTimeScale = function () { return 0.3; }  rồi vào trận trùm — trùm như quay chậm.
        var bdt = dt * (U.call('Difficulty', 'bossTimeScale') || 1);
        U.call('Difficulty', 'trackSafe', p, arena);
        U.safe('boss.update', boss.update, boss, [bdt, arena]);
        if (OG.Scenes.base() !== 'boss') return;
        if (stompBossOrGetHurt(battle, p, boss, res)) return;
        if (updateMinions(arena, dt, p, res)) return;
        checkBossDefeated(battle, p, boss);
      } else if (battle.phase === 'end') {
        U.safe('boss.update', boss.update, boss, [dt, arena]); // cho phép animation gục ngã
        battle.endT += dt;
        if (battle.endT > END_DELAY) { finish(); return; }
      }
      OG.Particles.update(dt);
      OG.Camera.follow(p, arena.width);
    },

    /** @param {CanvasRenderingContext2D} ctx */
    draw: function (ctx) {
      if (!battle) return;
      var arena = battle.arena, t = OG.time;
      // Thứ tự vẽ: nền → [camera] bục, lính, trùm, hạt, người chơi → [bỏ camera] HUD.
      OG.Sprites.drawBackground(ctx, arena.theme, OG.Camera.x, t);
      ctx.save();
      OG.Camera.apply(ctx);
      for (var i = 0; i < arena.platforms.length; i++) OG.Sprites.drawPlatform(ctx, arena.platforms[i], arena.theme, t);
      for (var k = 0; k < arena.enemies.length; k++) OG.Enemies.draw(ctx, arena.enemies[k], t);
      if (battle.boss) U.safe('boss.draw', battle.boss.draw, battle.boss, [ctx, arena]);
      OG.Particles.draw(ctx);
      OG.Player.draw(ctx, arena.player, t);
      ctx.restore();
      OG.util.call('Menus', 'drawHud', ctx, OG.Game.hud);
    }
  });

  // Cho scene khác (pause/gameover) vẽ lại khung cảnh boss.
  OG.BossScene = {
    /** @returns {boolean} đang có trận trùm */
    isActive: function () { return !!battle; },
    /** Vẽ lại trận đang diễn ra (vd làm nền cho pause). @param {CanvasRenderingContext2D} ctx */
    draw: function (ctx) { var sc = OG.Scenes.get('boss'); if (battle && sc) sc.draw(ctx); },
    // Cho HUD/Shop (nhảy đôi dự phòng) và công cụ test truy cập trận đang diễn ra.
    /** @returns {Player | null} */
    getPlayer: function () { return battle ? battle.arena.player : null; },
    /** @returns {Arena | null} */
    getArena: function () { return battle ? battle.arena : null; },
    /** @returns {BossInstance | null} */
    getBoss: function () { return battle ? battle.boss : null; }
  };
})();
