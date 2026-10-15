/* Scene 'level' — gameplay một màn (logic MVP: nhặt đủ pizza, tránh/giẫm gián, qua cửa EXIT).
 * Chủ sở hữu: agent Tích hợp.
 * OG.Level.state giữ trạng thái màn hiện tại (để scene khác, vd gameover, vẽ lại khung cảnh). */
(function () {
  'use strict';
  var OG = window.OG;
  var C = OG.Config;
  var U = OG.util;

  var CLEAR_DELAY = 0.9; // giây ăn mừng trước khi chuyển màn/boss

  // ---- Level hooks (v2) ----
  // Module khác (OG.Learn, OG.Guide, OG.Difficulty...) gắn hành vi vào màn mà không sửa file này.
  // hook = { id, order?, enter(st), update(st, dt, player) -> true để dừng frame (vd vừa push scene),
  //          canExit(st, player) -> false để chặn cửa EXIT (hook tự mở câu đố/thông báo),
  //          drawWorld(ctx, st, t) (thế giới, trước người chơi), drawFront(ctx, st, t) (thế giới, sau người chơi),
  //          drawScreen(ctx, st, t) (màn hình, trước HUD) }
  var hooks = [];
  function runHooks(method, args) {
    for (var i = 0; i < hooks.length; i++) {
      var h = hooks[i];
      if (typeof h[method] === 'function') U.safe('levelHook ' + h.id + '.' + method, h[method], h, args);
    }
  }

  function buildState(level) {
    var run = OG.Game.ensureRun();
    var mods = OG.Game.levelMods(level.id);
    var st = {
      level: level,
      width: level.width,
      platforms: level.platforms.map(function (a, i) { return { x: a[0], y: a[1], w: a[2], h: a[3], isFloor: i === 0 && a[1] >= 470 }; }),
      items: [],
      enemies: (level.enemies || []).map(function (e, i) { return OG.Enemies.create(e, i); }),
      exit: { x: level.exit.x, y: 400, floorY: OG.FLOOR_Y },
      player: OG.Player.create(run.charId, level.spawn.x, level.spawn.y, mods, run.skinId),
      t: 0, phase: 'play', clearT: 0, lockedCooldown: 0,
      journeyId: level.journey || null // màn hành trình v2 (null = cổ điển)
    };
    level.pizzas.forEach(function (a) { st.items.push(OG.Collectibles.create('pizza', a[0], a[1])); });
    (level.coins || []).forEach(function (a) { st.items.push(OG.Collectibles.create('coin', a[0], a[1])); });
    return st;
  }

  var Level = (OG.Level = {
    state: null,

    // Gắn/gỡ level hook (cùng id = thay thế). Gọi trong init() của module.
    addHook: function (hook) {
      if (!hook || !hook.id) return null;
      Level.removeHook(hook.id);
      hooks.push(hook);
      hooks.sort(function (a, b) { return (a.order || 50) - (b.order || 50); });
      return hook;
    },
    removeHook: function (id) { hooks = hooks.filter(function (h) { return h.id !== id; }); },
    hookIds: function () { return hooks.map(function (h) { return h.id; }); },

    // Vẽ thế giới của màn (dùng chung cho scene level và nền của pause/gameover).
    drawWorld: function (ctx, st) {
      st = st || Level.state;
      if (!st) return;
      var theme = st.level.theme, t = OG.time;
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

  // true nếu có hook chặn cửa EXIT (dừng ở hook đầu tiên trả false).
  function exitBlocked(st, p) {
    for (var i = 0; i < hooks.length; i++) {
      var h = hooks[i];
      if (typeof h.canExit !== 'function') continue;
      if (U.safe('levelHook ' + h.id + '.canExit', h.canExit, h, [st, p]) === false) return true;
    }
    return false;
  }

  function hasSpriteFx() { return !!(OG.Sprites && OG.Sprites.fx); }

  // Giẫm / chạm theo độ khó (OG.Difficulty có thể vẫn là stub -> dùng phép thử v1).
  // Dùng chung cho scene boss qua OG.Level.stompOk / touchOk.
  function stompOk(p, prevBottom, target, tol, prevTop) {
    var D = OG.Difficulty;
    if (D && typeof D.isStomp === 'function') {
      var r = U.safe('Difficulty.isStomp', D.isStomp, D, [p, prevBottom, target, tol, prevTop]);
      if (typeof r === 'boolean') return r;
    }
    var top = prevTop != null ? Math.max(target.y, prevTop) : target.y;
    return p.vy > 0 && prevBottom <= top + (tol == null ? 12 : tol) && U.overlap(p, target);
  }
  function touchOk(p, box) {
    var D = OG.Difficulty;
    if (D && typeof D.touches === 'function') {
      var r = U.safe('Difficulty.touches', D.touches, D, [p, box]);
      if (typeof r === 'boolean') return r;
    }
    return U.overlap(p, box);
  }
  Level.stompOk = stompOk;
  Level.touchOk = touchOk;

  function collect(st, it) {
    var stage = OG.Game.stage;
    it.got = true;
    if (it.type === 'pizza') {
      stage.pizzas++;
      OG.Game.run.stats.pizzas++;
      OG.Save.data.stats.pizzas++;
      OG.Game.hud.pizzas = stage.pizzas;
      OG.Game.addScore(100);
      OG.DOM.toast('Yum! +100 điểm 🍕');
      // Sprites (nếu có) tự phát lấp lánh qua item:collect; chỉ dùng hạt vuông khi thiếu Sprites.fx.
      if (!hasSpriteFx()) OG.Particles.spawn(it.x, it.y - 10, { color: '#ffc94a', count: 10 });
      if (stage.pizzas === st.level.goal) OG.DOM.toast('Đủ pizza rồi! Cửa EXIT đã mở 🚪');
    } else if (it.type === 'coin') {
      OG.Game.addScore(10);
      OG.Game.pickupCoins(1);
      OG.Particles.floatText(it.x, it.y - 14, '+1', '#ffc94a');
    }
    OG.Events.emit('item:collect', { type: it.type, x: it.x, y: it.y, value: it.type === 'pizza' ? 100 : 10, count: it.type === 'pizza' ? stage.pizzas : stage.coins, goal: st.level.goal });
  }

  OG.Scenes.register('level', {
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
      runHooks('enter', [st]);
      OG.Game.refreshHud();
      OG.Camera.follow(st.player, st.width);
    },

    resume: function () { OG.DOM.hidePanel(); OG.Events.emit('game:resume', { scene: 'level' }); },

    update: function (dt) {
      var st = Level.state;
      if (!st) return;
      if (OG.Input.pressed('pause')) { OG.Input.consume('pause'); OG.Scenes.push('pause', { from: 'level' }); return; }
      var p = st.player, stage = OG.Game.stage;
      st.t += dt;
      st.lockedCooldown = Math.max(0, st.lockedCooldown - dt);
      OG.Game.tickTime(dt);

      var res = OG.Player.update(p, dt, st);

      // Rơi khỏi màn hình. 'kid': OG.Difficulty hồi về chỗ đứng an toàn, không mất mạng.
      // 'challenge' (như MVP): mất mạng, đặt lại gần đó.
      if (p.y > OG.H + 80 && U.call('Difficulty', 'onFall', p, st) !== true) {
        OG.Player.hurt(p, 'fall');
        if (OG.Scenes.base() !== 'level') return;
        p.y = 350; p.x = Math.max(20, p.x - 100); p.vy = 0;
      }

      // Level hooks (trang sách, cổng câu đố, người dẫn đường, checkpoint...).
      for (var h = 0; h < hooks.length; h++) {
        var hk = hooks[h];
        if (typeof hk.update !== 'function') continue;
        var stop = U.safe('levelHook ' + hk.id + '.update', hk.update, hk, [st, dt, p]);
        if (stop === true || OG.Scenes.current() !== 'level' || Level.state !== st) return;
      }

      // Vật phẩm
      for (var i = 0; i < st.items.length; i++) {
        var it = st.items[i];
        if (!it.got && OG.Collectibles.touches(it, p, dt, p.magnet)) collect(st, it);
      }

      // Kẻ địch: giẫm từ trên xuống = tiêu diệt, chạm ngang = bị thương.
      for (var k = 0; k < st.enemies.length; k++) {
        var e = st.enemies[k];
        OG.Enemies.update(e, dt, st);
        if (!e.alive || st.phase !== 'play') continue;
        if (e.stompable && stompOk(p, res.prevBottom, e, 12, e.prevY)) {
          OG.Enemies.kill(e);
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
          if (OG.Scenes.base() !== 'level') return;
        }
      }

      // Cửa EXIT
      if (st.phase === 'play' && p.x > st.exit.x && p.y + p.h > st.exit.y - 100) {
        if (stage.pizzas >= st.level.goal && !exitBlocked(st, p)) {
          st.phase = 'clear';
          st.clearT = 0;
          p.celebrate = true;
          OG.Events.emit('door:enter', { levelId: st.level.id, x: st.exit.x, y: st.exit.y });
          OG.Events.emit('level:clear', { levelId: st.level.id });
          OG.DOM.toast(st.level.boss && OG.util.call('Bosses', 'has', st.level.boss) ? 'Có biến! Trùm gián xuất hiện!' : 'Hoàn thành màn! 🎉');
        } else if (stage.pizzas >= st.level.goal) {
          // Hook (vd cổng câu đố ở cửa) đã chặn và tự xử lý.
          if (OG.Scenes.current() !== 'level') return;
        } else if (st.lockedCooldown <= 0) {
          st.lockedCooldown = 1.5;
          OG.DOM.toast('Cần thu thập đủ pizza trước khi qua cửa!');
          OG.Events.emit('level:exitLocked', { levelId: st.level.id, have: stage.pizzas, need: st.level.goal });
        }
      }

      if (st.phase === 'clear') {
        st.clearT += dt;
        if (st.clearT >= CLEAR_DELAY) { st.phase = 'done'; OG.Game.finishStage(st.level.id); return; }
      }

      OG.Particles.update(dt);
      OG.Camera.follow(p, st.width);
    },

    draw: function (ctx) {
      Level.drawWorld(ctx);
      OG.util.call('Menus', 'drawHud', ctx, OG.Game.hud);
    }
  });
})();
