/* OG.Enemies — kẻ địch thường (gián tuần tra). Mở rộng loại mới qua OG.Enemies.registerType().
 * Chủ sở hữu: agent Tích hợp.
 * Loại có sẵn: roach (gián con), joey, marky, deedee (bộ ba gián đi tuần, dùng sprite tương ứng).
 * Enemy object: {type, x, y, w, h, base, range, speed, dir, alive, stompable, hurts, score, t, deadT}
 * (x,y = góc trên-trái hitbox; đứng trên sàn y=480). */
(function () {
  'use strict';
  var OG = window.OG;
  var types = {};

  var Enemies = (OG.Enemies = {
    types: types,

    // def: {w, h, score, stompable, init(e, src), update(e, dt, world), draw(ctx, e, t)}
    registerType: function (name, def) { types[name] = def; return def; },

    // src: một phần tử của level.enemies — {type, x, y?, range?, speed?, dir?}
    create: function (src, index) {
      var T = types[src.type] || types.roach;
      var e = {
        type: src.type || 'roach', w: T.w, h: T.h,
        x: src.x, y: src.y != null ? src.y : OG.FLOOR_Y - T.h,
        base: src.x, range: src.range != null ? src.range : 100,
        speed: src.speed != null ? src.speed : 75,
        dir: src.dir != null ? src.dir : (index % 2 ? 1 : -1),
        alive: true, stompable: T.stompable !== false, hurts: true,
        score: T.score || 50, t: Math.random() * 3, deadT: 0
      };
      if (T.init) T.init(e, src);
      OG.util.call('Difficulty', 'scaleEnemy', e); // tốc độ theo độ khó
      return e;
    },

    update: function (e, dt, world) {
      e.t += dt;
      if (!e.alive) { e.deadT += dt; return; }
      var T = types[e.type] || types.roach;
      T.update(e, dt, world);
    },

    draw: function (ctx, e, t) {
      var T = types[e.type] || types.roach;
      if (!e.alive && e.deadT > 0.5) return;
      T.draw(ctx, e, t);
    },

    // Hộp gây sát thương (thu nhỏ 3px cho công bằng).
    // OG.Difficulty có thể thu nhỏ thêm (chế độ 'kid').
    hurtbox: function (e) {
      var box = { x: e.x + 3, y: e.y + 3, w: e.w - 6, h: e.h - 3 };
      return OG.util.call('Difficulty', 'enemyHurtbox', box) || box;
    },

    // Bị giẫm.
    kill: function (e) { e.alive = false; e.deadT = 0; }
  });

  // Gián tuần tra kiểu MVP: đi qua lại ±range quanh base.
  Enemies.registerType('roach', {
    w: 34, h: 28, score: 50,
    update: function (e, dt) {
      e.x += e.dir * e.speed * dt;
      if (Math.abs(e.x - e.base) > e.range) e.dir *= -1;
    },
    draw: function (ctx, e, t) {
      ctx.save();
      ctx.translate(e.x + e.w / 2, e.y + e.h);
      if (!e.alive) {
        // bẹp dí rồi mờ dần
        ctx.globalAlpha = Math.max(0, 1 - e.deadT * 2);
        ctx.scale(1.2, 0.35);
      }
      OG.Sprites.drawCharacter(ctx, 'roach', e.alive ? 'run' : 'hurt', e.t, { face: e.dir, w: e.w, h: e.h });
      ctx.restore();
    }
  });

  // ---- Bộ ba gián xuất hiện như kẻ địch thường trong màn (dùng sprite Joey / Marky / Dee Dee) ----
  // Vẽ chung: neo ở chân, bẹp + mờ dần khi bị giẫm. anim(e) chọn trạng thái animation.
  function drawTrio(charId, anim) {
    return function (ctx, e, t) {
      ctx.save();
      ctx.translate(e.x + e.w / 2, e.y + e.h);
      if (!e.alive) {
        ctx.globalAlpha = Math.max(0, 1 - e.deadT * 2);
        ctx.scale(1.2, 0.35);
      }
      OG.Sprites.drawCharacter(ctx, charId, e.alive ? anim(e) : 'hurt', e.t, { face: e.dir, w: e.w, h: e.h, time: t });
      ctx.restore();
    };
  }
  function patrol(e, dt, speed) {
    e.x += e.dir * speed * dt;
    if (e.x - e.base > e.range) { e.x = e.base + e.range; e.dir = -1; }
    else if (e.base - e.x > e.range) { e.x = e.base - e.range; e.dir = 1; }
  }

  // Joey: nhỏ, nhanh, thỉnh thoảng đứng lại nhìn rồi lao nhanh gấp đôi.
  Enemies.registerType('joey', {
    w: 30, h: 40, score: 70,
    init: function (e) { e.mode = 'run'; e.modeT = 1.5 + Math.random(); },
    update: function (e, dt) {
      e.modeT -= dt;
      if (e.modeT <= 0) {
        e.mode = e.mode === 'run' ? 'wait' : (e.mode === 'wait' ? 'dash' : 'run');
        e.modeT = e.mode === 'wait' ? 0.6 : e.mode === 'dash' ? 0.7 : 1.6 + Math.random();
      }
      if (e.mode !== 'wait') patrol(e, dt, e.speed * (e.mode === 'dash' ? 2 : 1));
    },
    draw: drawTrio('joey', function (e) { return e.mode === 'wait' ? 'idle' : e.mode === 'dash' ? 'attack' : 'run'; })
  });

  // Marky: cao gầy, đi chậm, nhảy cò cò (e.hop = độ cao so với sàn, hitbox nâng theo).
  Enemies.registerType('marky', {
    w: 30, h: 60, score: 70,
    init: function (e) { e.hop = 0; e.hopV = 0; e.hopT = 1 + Math.random() * 1.5; e.groundY = e.y; },
    update: function (e, dt) {
      patrol(e, dt, e.speed);
      e.hopT -= dt;
      if (e.hopT <= 0 && e.hop === 0) { e.hopV = -380; e.hopT = 1.6 + Math.random() * 1.2; }
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
  Enemies.registerType('deedee', {
    w: 50, h: 50, score: 80,
    init: function (e) { e.eatT = 0; e.nextEat = 2 + Math.random() * 2; },
    update: function (e, dt) {
      if (e.eatT > 0) { e.eatT -= dt; return; }
      e.nextEat -= dt;
      if (e.nextEat <= 0) { e.eatT = 1; e.nextEat = 3 + Math.random() * 2; return; }
      patrol(e, dt, e.speed);
    },
    draw: drawTrio('deedee', function (e) { return e.eatT > 0 ? 'attack' : 'walk'; })
  });
})();
