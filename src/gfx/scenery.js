/* OG.Sprites (phần cảnh vật) — nền, sàn, đạo cụ. [STUB — agent Sprites sẽ viết lại]
 * Chủ sở hữu: agent Sprites (src/gfx/). Load SAU src/gfx/sprites.js.
 *
 * HỢP ĐỒNG:
 *   OG.Sprites.drawBackground(ctx, theme, camX, t)   — KHÔNG gian màn hình (trước camera), phủ kín 960x540
 *   OG.Sprites.drawPlatform(ctx, plat, theme, t)     — KHÔNG gian thế giới; plat = {x,y,w,h,isFloor}
 *   OG.Sprites.drawDecor(ctx, theme, worldW, t)      — KHÔNG gian thế giới, vẽ sau sàn, trước vật phẩm
 *   OG.Sprites.drawProp(ctx, propId, x, y, t, opts)  — KHÔNG gian thế giới. Trả về true nếu đã vẽ.
 *        propId: pizza (x,y = tâm) | coin (tâm) | exit (x = mép trái cửa, y = mặt sàn; opts.open: bool)
 *                | heart | shield | star | (khác: trả false)
 *   theme: kitchen | garden | roof | lair | boss (hoặc chuỗi khác → dùng nền mặc định)
 * Stub dưới đây là đồ hoạ nguyên bản của MVP. */
(function () {
  'use strict';
  var OG = window.OG;
  var P = OG.Palette;
  var fillRound = OG.util.fillRound;
  var W = OG.W, H = OG.H;

  function wrap(x, span) { return ((x % span) + span) % span; }

  OG.Sprites.drawBackground = function (ctx, theme, cam, t) {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, theme === 'lair' ? '#5d6f9a' : P.skyTop);
    g.addColorStop(1, theme === 'lair' ? '#c8b9d8' : P.skyBottom);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // mây trôi parallax
    for (var i = 0; i < 7; i++) {
      var x = wrap(i * 230 - cam * 0.22, W + 180) - 80, y = 65 + (i % 3) * 45;
      ctx.fillStyle = P.cloud; ctx.beginPath(); ctx.arc(x, y, 25, 0, 7); ctx.arc(x + 25, y - 9, 31, 0, 7); ctx.arc(x + 55, y, 23, 0, 7); ctx.fill();
    }
    if (theme === 'kitchen' || theme === 'boss') {
      fillRound(ctx, 40 - cam * 0.1, 120, 210, 250, 16, P.kitchenWall);
      fillRound(ctx, 65 - cam * 0.1, 150, 160, 90, 10, P.kitchenWindow);
      fillRound(ctx, 700 - cam * 0.12, 130, 190, 250, 15, P.kitchenCabinet);
    } else {
      for (var j = 0; j < 8; j++) {
        var tx = wrap(j * 260 - cam * 0.3, W + 200) - 80;
        fillRound(ctx, tx, 285, 24, 195, 10, P.treeTrunk);
        ctx.fillStyle = P.treeTop; ctx.beginPath(); ctx.arc(tx + 10, 270, 48, 0, 7); ctx.fill();
      }
    }
  };

  OG.Sprites.drawPlatform = function (ctx, a, theme, t) {
    var floor = a.isFloor || a.y > 470;
    fillRound(ctx, a.x, a.y, a.w, a.h, 8, floor ? P.floor : P.plank);
    if (floor) { ctx.fillStyle = P.grass; ctx.fillRect(a.x, a.y, a.w, 8); }
    else { ctx.fillStyle = P.plankTop; ctx.fillRect(a.x, a.y, a.w, 5); }
  };

  OG.Sprites.drawDecor = function (ctx, theme, worldW, t) {
    for (var x = 100; x < worldW; x += 300) fillRound(ctx, x, 445, 55, 35, 8, theme === 'kitchen' ? P.kitchenDecor : P.gardenDecor);
  };

  OG.Sprites.drawProp = function (ctx, id, x, y, t, opts) {
    opts = opts || {};
    if (id === 'pizza' || id === 'heart' || id === 'star' || id === 'shield') {
      ctx.font = '30px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText({ pizza: '🍕', heart: '❤️', star: '⭐', shield: '🛡️' }[id], x, y);
      return true;
    }
    if (id === 'coin') {
      var sx = Math.abs(Math.cos(t * 4)) * 9 + 1;
      ctx.fillStyle = '#e0a11b'; ctx.beginPath(); ctx.ellipse(x, y, sx + 1.5, 11, 0, 0, 7); ctx.fill();
      ctx.fillStyle = P.gold; ctx.beginPath(); ctx.ellipse(x, y, sx, 9, 0, 0, 7); ctx.fill();
      return true;
    }
    if (id === 'exit') {
      // y = mặt sàn; cửa cao 125 (giống MVP: 355..480)
      fillRound(ctx, x, y - 125, 48, 125, 20, P.portalFrame);
      fillRound(ctx, x + 8, y - 115, 32, 115, 16, opts.open ? '#7fd36b' : P.portalDoor);
      ctx.fillStyle = 'white'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('EXIT', x + 24, y - 135);
      return true;
    }
    return false;
  };
})();
