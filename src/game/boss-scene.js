/* Scene 'boss' — khung đấu trùm. Scene lo player, va chạm giẫm điểm yếu, HUD, chuyển cảnh;
 * hành vi trùm do OG.Bosses cung cấp (BossInstance). Chủ sở hữu: agent Tích hợp.
 *
 * Vòng đời: level qua cửa → OG.Game.finishStage() → go('boss', {levelId, bossId})
 *   → enter: arena = OG.Bosses.getArena(bossId) || mặc định; boss = OG.Bosses.create(bossId, arena)
 *   → nếu boss null: bỏ qua, hoàn thành màn luôn.
 *   → mỗi frame: player update; boss.update(dt, arena); giẫm boss.getWeakspot() → boss.onHit(1, arena);
 *     chạm boss.getHurtboxes() → player bị thương; boss.isDefeated() → boss:defeated → completeLevel.
 * Xem docs/ARCHITECTURE.md mục OG.Bosses cho hợp đồng BossInstance & Arena. */
(function () {
  'use strict';
  var OG = window.OG;
  var C = OG.Config;
  var U = OG.util;

  var DEFAULT_ARENA = {
    width: 960,
    platforms: [[0, 480, 960, 60], [150, 370, 160, 18], [650, 370, 160, 18]],
    spawn: { x: 80, y: 420 }
  };

  var S = null; // trạng thái scene boss

  function makeArena(level, bossId) {
    var def = OG.util.call('Bosses', 'getArena', bossId) || {};
    var src = {
      width: def.width || DEFAULT_ARENA.width,
      platforms: def.platforms || DEFAULT_ARENA.platforms,
      spawn: def.spawn || DEFAULT_ARENA.spawn,
      theme: def.theme || level.theme || 'boss'
    };
    var run = OG.Game.ensureRun();
    var mods = OG.Game.levelMods(level.id);
    var arena = {
      levelId: level.id, bossId: bossId, theme: src.theme,
      width: src.width, height: OG.H, floorY: OG.FLOOR_Y, t: 0,
      platforms: src.platforms.map(function (a, i) { return { x: a[0], y: a[1], w: a[2], h: a[3], isFloor: i === 0 && a[1] >= 470 }; }),
      player: OG.Player.create(run.charId, src.spawn.x, src.spawn.y, mods, run.skinId),
      // --- API cho boss ---
      hurtPlayer: function (cause) { return OG.Player.hurt(arena.player, cause || 'boss'); },
      overlapsPlayer: function (rect) { return U.overlap(arena.player, rect); },
      shake: function (mag, dur) { OG.Camera.shake(mag, dur); },
      particles: function (x, y, opts) { OG.Particles.spawn(x, y, opts); },
      floatText: function (x, y, text, color) { OG.Particles.floatText(x, y, text, color); },
      toast: function (text) { OG.DOM.toast(text); },
      emit: function (name, payload) { OG.Events.emit(name, payload); },
      addScore: function (n) { OG.Game.addScore(n); },
      spawnEnemy: function (src) { var e = OG.Enemies.create(src, arena.enemies.length); arena.enemies.push(e); return e; },
      enemies: []
    };
    return arena;
  }

  function finish() {
    var levelId = S.levelId;
    S = null;
    OG.Game.completeLevel(levelId);
  }

  OG.Scenes.register('boss', {
    enter: function (params) {
      var level = OG.Data.getLevel(params.levelId) || OG.Data.levels[0];
      var bossId = params.bossId || level.boss;
      OG.DOM.hidePanel();
      OG.DOM.setHudVisible(true);
      OG.DOM.setControlsVisible(true);
      OG.Particles.clear();
      OG.Camera.reset();
      if (!OG.Game.stage) OG.Game.beginStage(level);
      var arena = makeArena(level, bossId);
      var boss = OG.util.call('Bosses', 'create', bossId, arena) || null;
      S = { levelId: level.id, bossId: bossId, arena: arena, boss: boss, phase: boss ? 'fight' : 'skip', endT: 0 };
      var hud = OG.Game.hud;
      hud.scene = 'boss';
      hud.boss = boss ? { id: bossId, name: boss.name || bossId, hp: boss.hp, maxHp: boss.maxHp } : null;
      hud.shield = arena.player.shield;
      if (boss) OG.Events.emit('boss:start', { bossId: bossId, levelId: level.id, name: boss.name || bossId, maxHp: boss.maxHp });
      OG.Game.refreshHud();
    },

    resume: function () { OG.DOM.hidePanel(); OG.Events.emit('game:resume', { scene: 'boss' }); },

    update: function (dt) {
      if (!S) return;
      if (S.phase === 'skip') { finish(); return; }
      if (OG.Input.pressed('pause')) { OG.Input.consume('pause'); OG.Scenes.push('pause', { from: 'boss' }); return; }
      var A = S.arena, p = A.player, boss = S.boss;
      A.t += dt;
      if (S.phase === 'fight') OG.Game.tickTime(dt);
      var res = OG.Player.update(p, dt, A);
      if (p.y > OG.H + 80) {
        OG.Player.hurt(p, 'fall');
        if (OG.Scenes.base() !== 'boss') return;
        p.x = 80; p.y = 300; p.vy = 0;
      }

      if (S.phase === 'fight') {
        U.safe('boss.update', boss.update, boss, [dt, A]);
        if (OG.Scenes.base() !== 'boss') return;
        // Giẫm điểm yếu
        var weak = U.safe('boss.getWeakspot', boss.getWeakspot, boss, []) || null;
        if (weak && OG.Physics.isStomp(p, res.prevBottom, weak, 16)) {
          p.vy = -C.STOMP_BOUNCE * 1.1;
          p.inv = Math.max(p.inv, 0.3);
          U.safe('boss.onHit', boss.onHit, boss, [1, A]);
          OG.Game.addScore(100);
          OG.Camera.shake(6, 0.2);
          OG.Events.emit('boss:hit', { bossId: S.bossId, hp: boss.hp, maxHp: boss.maxHp });
        } else {
          var boxes = U.safe('boss.getHurtboxes', boss.getHurtboxes, boss, []) || [];
          for (var i = 0; i < boxes.length; i++) {
            if (U.overlap(p, boxes[i])) { OG.Player.hurt(p, 'boss'); break; }
          }
          if (OG.Scenes.base() !== 'boss') return;
        }
        // Lính gián do boss gọi ra
        for (var k = 0; k < A.enemies.length; k++) {
          var e = A.enemies[k];
          OG.Enemies.update(e, dt, A);
          if (!e.alive) continue;
          if (OG.Physics.isStomp(p, res.prevBottom, e, 12)) {
            OG.Enemies.kill(e); p.vy = -C.STOMP_BOUNCE; OG.Game.addScore(e.score);
            if (OG.Game.stage) OG.Game.stage.stomps++;
            OG.Game.run.stats.stomps++;
            OG.Save.data.stats.stomps++;
            OG.Particles.floatText(e.x + e.w / 2, e.y - 6, '+' + e.score);
            OG.Events.emit('enemy:stomp', { type: e.type, x: e.x, y: e.y, score: e.score });
          } else if (U.overlap(p, OG.Enemies.hurtbox(e))) {
            OG.Player.hurt(p, 'enemy');
            if (OG.Scenes.base() !== 'boss') return;
          }
        }
        var hud = OG.Game.hud;
        if (hud.boss && hud.boss.hp !== boss.hp) { hud.boss.hp = boss.hp; OG.Game.refreshHud(); }
        if (U.safe('boss.isDefeated', boss.isDefeated, boss, [])) {
          S.phase = 'end';
          S.endT = 0;
          p.celebrate = true;
          OG.Game.stage.bossDefeated = true;
          OG.Game.run.stats.bosses++;
          OG.Save.data.stats.bossesDefeated++;
          OG.Game.addScore(500);
          OG.Camera.shake(10, 0.6);
          OG.DOM.toast('Hạ gục ' + (boss.name || 'trùm') + '! 🏆');
          OG.Events.emit('boss:defeated', { bossId: S.bossId, levelId: S.levelId, time: A.t });
        }
      } else if (S.phase === 'end') {
        U.safe('boss.update', boss.update, boss, [dt, A]); // cho phép animation gục ngã
        S.endT += dt;
        if (S.endT > 1.6) { finish(); return; }
      }
      OG.Particles.update(dt);
      OG.Camera.follow(p, A.width);
    },

    draw: function (ctx) {
      if (!S) return;
      var A = S.arena, t = OG.time;
      OG.Sprites.drawBackground(ctx, A.theme, OG.Camera.x, t);
      ctx.save();
      OG.Camera.apply(ctx);
      for (var i = 0; i < A.platforms.length; i++) OG.Sprites.drawPlatform(ctx, A.platforms[i], A.theme, t);
      for (var k = 0; k < A.enemies.length; k++) OG.Enemies.draw(ctx, A.enemies[k], t);
      if (S.boss) U.safe('boss.draw', S.boss.draw, S.boss, [ctx, A]);
      OG.Particles.draw(ctx);
      OG.Player.draw(ctx, A.player, t);
      ctx.restore();
      OG.util.call('Menus', 'drawHud', ctx, OG.Game.hud);
    }
  });

  // Cho scene khác (pause/gameover) vẽ lại khung cảnh boss.
  OG.BossScene = {
    isActive: function () { return !!S; },
    draw: function (ctx) { var sc = OG.Scenes.get('boss'); if (S && sc) sc.draw(ctx); },
    // Cho HUD/Shop (nhảy đôi dự phòng) và công cụ test truy cập trận đang diễn ra.
    getPlayer: function () { return S ? S.arena.player : null; },
    getArena: function () { return S ? S.arena : null; },
    getBoss: function () { return S ? S.boss : null; }
  };
})();
