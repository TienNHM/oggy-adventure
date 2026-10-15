/* OG.Collectibles — vật phẩm nhặt được trong màn (pizza = mục tiêu, coin = xu).
 * Chủ sở hữu: agent Tích hợp. Thêm loại mới qua OG.Collectibles.registerType().
 * Item: {type, x, y, got, bob}  (x,y = tâm; quy tắc nhặt như MVP: |dx|<29, |dy|<38 so với tâm player) */
(function () {
  'use strict';
  var OG = window.OG;
  var types = {};

  var Collectibles = (OG.Collectibles = {
    types: types,

    // def: {score, onCollect(item, player)}; fallbackEmoji dùng khi Sprites.drawProp trả false.
    registerType: function (name, def) { types[name] = def; return def; },

    create: function (type, x, y) {
      return { type: type, x: x, y: y, got: false, bob: Math.random() * 6 };
    },

    // Kiểm tra player chạm. magnet (px) mở rộng vùng hút & kéo vật phẩm về phía player.
    touches: function (it, p, dt, magnet) {
      var cx = p.x + p.w / 2, cy = p.y + p.h / 2;
      if (magnet > 0) {
        var dx = cx - it.x, dy = cy - it.y, d = Math.sqrt(dx * dx + dy * dy);
        if (d < magnet && d > 1) { var s = Math.min(d, 420 * dt) / d; it.x += dx * s; it.y += dy * s; }
      }
      return Math.abs(cx - it.x) < 29 && Math.abs(cy - it.y) < 38;
    },

    draw: function (ctx, it, t) {
      if (it.got) return;
      var yy = it.y + Math.sin(t * 1000 / 230 + it.bob) * 5;
      if (OG.Sprites.drawProp && OG.Sprites.drawProp(ctx, it.type, it.x, yy, t)) return;
      var T = types[it.type];
      ctx.font = '30px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText((T && T.emoji) || '❔', it.x, yy);
    }
  });

  Collectibles.registerType('pizza', { emoji: '🍕', score: 100 });
  Collectibles.registerType('coin', { emoji: '🪙', score: 10 });
})();
