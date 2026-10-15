/* OG.Particles — hạt hiệu ứng đơn giản (vụn khi giẫm gián, lấp lánh khi nhặt đồ).
 * Toạ độ thế giới; vẽ sau camera. Chủ sở hữu: agent Tích hợp.
 * spawn(x, y, {color, count, speed, life, size, gravity, lift, shape})
 *   shape: 'dust' | 'spark' | 'star' | 'circle' — vẽ bằng OG.Sprites.drawParticle nếu có, không thì ô vuông. */
(function () {
  'use strict';
  var OG = window.OG;
  var list = [];
  var shapeBroken = false; // Sprites.drawParticle lỗi 1 lần -> quay về ô vuông

  function drawShaped(ctx, p) {
    if (shapeBroken) return false;
    try { return !!OG.Sprites.drawParticle(ctx, p); } catch (e) { shapeBroken = true; console.error('[OG.Particles] drawParticle lỗi:', e); return false; }
  }

  OG.Particles = {
    spawn: function (x, y, opts) {
      opts = opts || {};
      var n = opts.count || 8;
      for (var i = 0; i < n; i++) {
        var a = Math.random() * Math.PI * 2, s = (opts.speed || 160) * (0.4 + Math.random() * 0.6);
        list.push({
          x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (opts.lift || 80),
          life: opts.life || 0.6, max: opts.life || 0.6, size: opts.size || 4,
          color: opts.color || '#ffffff', g: opts.gravity != null ? opts.gravity : 600, text: null,
          shape: opts.shape || null, seed: Math.random() * 6
        });
      }
    },
    // Chữ bay lên (vd "+100").
    floatText: function (x, y, text, color) {
      list.push({ x: x, y: y, vx: 0, vy: -60, life: 0.9, max: 0.9, size: 16, color: color || '#ffffff', g: 0, text: text });
    },
    update: function (dt) {
      for (var i = list.length - 1; i >= 0; i--) {
        var p = list[i];
        p.life -= dt;
        if (p.life <= 0) { list.splice(i, 1); continue; }
        p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      }
    },
    draw: function (ctx) {
      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        ctx.globalAlpha = Math.max(0, p.life / p.max);
        ctx.fillStyle = p.color;
        if (p.text) {
          ctx.font = 'bold ' + p.size + 'px "Segoe UI", system-ui, Roboto, Arial, sans-serif';
          ctx.textAlign = 'center';
          ctx.strokeStyle = '#17233d'; ctx.lineWidth = 3;
          ctx.strokeText(p.text, p.x, p.y); ctx.fillText(p.text, p.x, p.y);
        } else if (p.shape && OG.Sprites && OG.Sprites.drawParticle && drawShaped(ctx, p)) {
          // đã vẽ bằng Sprites (bụi, lấp lánh, sao)
        } else {
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
      }
      ctx.globalAlpha = 1;
    },
    clear: function () { list.length = 0; },
    count: function () { return list.length; }
  };
})();
