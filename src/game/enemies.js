/* OG.Enemies — kẻ địch thường (gián tuần tra). Mở rộng loại mới qua OG.Enemies.registerType().
 * Chủ sở hữu: agent Tích hợp.
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
    hurtbox: function (e) { return { x: e.x + 3, y: e.y + 3, w: e.w - 6, h: e.h - 3 }; },

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
})();
