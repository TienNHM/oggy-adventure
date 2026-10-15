/* OG.Sprites (phần cảnh vật) — nền, sàn, đạo cụ.
 * Chủ sở hữu: agent Sprites (src/gfx/). Load SAU src/gfx/sprites.js.
 * Đạo cụ (pizza, xu, tim, khiên, sao, cửa EXIT) vẽ hoàn toàn bằng Canvas (không emoji).
 * Nền/sàn/trang trí hiện vẫn giữ đồ hoạ MVP.
 *
 * HỢP ĐỒNG:
 *   OG.Sprites.drawBackground(ctx, theme, camX, t)   — KHÔNG gian màn hình (trước camera), phủ kín 960x540
 *   OG.Sprites.drawPlatform(ctx, plat, theme, t)     — KHÔNG gian thế giới; plat = {x,y,w,h,isFloor}
 *   OG.Sprites.drawDecor(ctx, theme, worldW, t)      — KHÔNG gian thế giới, vẽ sau sàn, trước vật phẩm
 *   OG.Sprites.drawProp(ctx, propId, x, y, t, opts)  — KHÔNG gian thế giới. Trả về true nếu đã vẽ.
 *        propId: pizza (x,y = tâm) | coin (tâm) | exit (x = mép trái cửa, y = mặt sàn; opts.open: bool)
 *                | heart | shield | star (tâm) | (khác: trả false)
 *   theme: kitchen | garden | roof | lair | boss (hoặc chuỗi khác → dùng nền mặc định) */
(function () {
  'use strict';
  var OG = window.OG;
  OG.Sprites = OG.Sprites || {};
  var P = OG.Palette || {};
  var fillRound = OG.util.fillRound;
  var W = OG.W, H = OG.H;
  var TAU = Math.PI * 2;

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

  // ---------------------------------------------------------------------------
  // Đạo cụ
  // ---------------------------------------------------------------------------
  function star(ctx, x, y, ro, ri, rot) {
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var r = i % 2 ? ri : ro, a = rot + (i * Math.PI) / 5 - Math.PI / 2;
      if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
  }
  // Tia lấp lánh nhấp nháy theo thời gian.
  function glint(ctx, x, y, r, t) {
    var k = 0.5 + 0.5 * Math.sin(t * 5);
    if (k < 0.55) return;
    ctx.fillStyle = 'rgba(255,255,255,' + ((k - 0.55) * 2).toFixed(2) + ')';
    ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.25, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.25, y); ctx.closePath();
    ctx.moveTo(x - r, y); ctx.lineTo(x, y + r * 0.25); ctx.lineTo(x + r, y); ctx.lineTo(x, y - r * 0.25); ctx.closePath();
    ctx.fill();
  }

  function drawPizza(ctx, x, y, t) {
    ctx.translate(x, y);
    ctx.rotate(Math.sin(t * 2.2) * 0.08);
    // bóng nhẹ
    ctx.fillStyle = 'rgba(23,35,61,0.18)';
    ctx.beginPath(); ctx.moveTo(-12, -8); ctx.quadraticCurveTo(2, -17, 16, -8); ctx.lineTo(2, 16); ctx.closePath(); ctx.fill();
    // phô mai
    ctx.fillStyle = '#ffd45a';
    ctx.beginPath(); ctx.moveTo(-13, -10); ctx.quadraticCurveTo(0, -18, 13, -10); ctx.lineTo(0, 14); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#e9a63a'; ctx.lineWidth = 1.2; ctx.lineJoin = 'round'; ctx.stroke();
    // vỏ bánh
    ctx.strokeStyle = '#d9893b'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-13, -10); ctx.quadraticCurveTo(0, -18, 13, -10); ctx.stroke();
    ctx.strokeStyle = '#f0b067'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(-10, -12); ctx.quadraticCurveTo(0, -17.5, 10, -12); ctx.stroke();
    // xúc xích + rau
    var pep = [[-4, -5, 3], [4, -4, 2.8], [0, 4, 2.6]];
    for (var i = 0; i < pep.length; i++) {
      ctx.fillStyle = '#d9473b'; ctx.beginPath(); ctx.arc(pep[i][0], pep[i][1], pep[i][2], 0, TAU); ctx.fill();
      ctx.fillStyle = '#ef6b5c'; ctx.beginPath(); ctx.arc(pep[i][0] - 0.8, pep[i][1] - 0.8, pep[i][2] * 0.4, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = '#5aa84a'; ctx.fillRect(6, -9, 2.5, 2); ctx.fillRect(-7, 0, 2.5, 2);
    glint(ctx, 8, -12, 4, t);
  }

  function drawHeart(ctx, x, y, t) {
    var s = 1 + Math.max(0, Math.sin(t * 6)) * 0.08;
    ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = '#ff5a6e';
    ctx.beginPath();
    ctx.moveTo(0, 12);
    ctx.bezierCurveTo(-16, 1, -12, -14, 0, -6);
    ctx.bezierCurveTo(12, -14, 16, 1, 0, 12);
    ctx.fill();
    ctx.strokeStyle = '#c93a4d'; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.ellipse(-6, -5, 2.6, 1.6, -0.6, 0, TAU); ctx.fill();
  }

  function shieldPath(ctx, k) {
    ctx.beginPath();
    ctx.moveTo(0, -14 * k); ctx.lineTo(12 * k, -9 * k); ctx.quadraticCurveTo(12 * k, 6 * k, 0, 14 * k);
    ctx.quadraticCurveTo(-12 * k, 6 * k, -12 * k, -9 * k); ctx.closePath();
  }
  function drawShield(ctx, x, y, t) {
    ctx.translate(x, y);
    ctx.fillStyle = '#ffffff'; shieldPath(ctx, 1); ctx.fill();
    ctx.strokeStyle = P.secondaryShadow || '#2582aa'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = P.blue || '#52c5ee'; shieldPath(ctx, 0.75); ctx.fill();
    ctx.fillStyle = '#ffffff'; star(ctx, 0, 0, 5, 2.2, 0); ctx.fill();
    glint(ctx, 6, -8, 4, t + 1);
  }

  function drawStar(ctx, x, y, t) {
    ctx.translate(x, y); ctx.rotate(Math.sin(t * 2) * 0.15);
    ctx.fillStyle = '#ffd84a'; star(ctx, 0, 0, 14, 6.2, 0); ctx.fill();
    ctx.strokeStyle = '#e0a11b'; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.fillStyle = P.ink || '#17233d';
    ctx.beginPath(); ctx.arc(-3, -1, 1.4, 0, TAU); ctx.arc(3, -1, 1.4, 0, TAU); ctx.fill();
    ctx.strokeStyle = P.ink || '#17233d'; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.arc(0, 1.5, 2.4, 0.2, Math.PI - 0.2); ctx.stroke();
    glint(ctx, 7, -7, 4, t);
  }

  function drawCoin(ctx, x, y, t) {
    var sx = Math.abs(Math.cos(t * 4)) * 9 + 1;
    ctx.fillStyle = '#e0a11b'; ctx.beginPath(); ctx.ellipse(x, y, sx + 1.5, 11, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = P.gold || '#ffc94a'; ctx.beginPath(); ctx.ellipse(x, y, sx, 9, 0, 0, TAU); ctx.fill();
    if (sx > 5) {
      ctx.fillStyle = '#e8a923'; ctx.beginPath(); ctx.ellipse(x, y, sx * 0.45, 4.5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff3b8'; ctx.beginPath(); ctx.ellipse(x - sx * 0.35, y - 3.5, sx * 0.18, 2, -0.5, 0, TAU); ctx.fill();
    }
    glint(ctx, x + 5, y - 7, 3.5, t + 0.7);
  }

  function drawExit(ctx, x, y, t, open) {
    // y = mặt sàn; cửa cao 125 (giống MVP: 355..480)
    if (open) {
      var g = 0.35 + 0.15 * Math.sin(t * 4);
      ctx.fillStyle = 'rgba(255,233,140,' + g.toFixed(2) + ')';
      ctx.beginPath(); ctx.ellipse(x + 24, y - 62, 42, 74, 0, 0, TAU); ctx.fill();
    }
    fillRound(ctx, x, y - 125, 48, 125, 20, P.portalFrame);
    fillRound(ctx, x + 8, y - 115, 32, 115, 16, open ? '#7fd36b' : P.portalDoor);
    if (open) {
      // vệt sáng chạy lên trong cửa
      ctx.save();
      ctx.beginPath(); ctx.rect(x + 8, y - 115, 32, 115); ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (var i = 0; i < 3; i++) ctx.fillRect(x + 12, y - ((t * 60 + i * 40) % 120), 24, 4);
      ctx.restore();
      // mũi tên chỉ vào cửa
      var bob = Math.sin(t * 5) * 4;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(x + 24, y - 140 + bob); ctx.lineTo(x + 14, y - 152 + bob); ctx.lineTo(x + 34, y - 152 + bob); ctx.closePath(); ctx.fill();
    } else {
      // ổ khoá
      fillRound(ctx, x + 16, y - 66, 16, 13, 3, P.gold || '#ffc94a');
      ctx.strokeStyle = P.gold || '#ffc94a'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x + 24, y - 66, 5, Math.PI, 0); ctx.stroke();
      ctx.fillStyle = P.ink || '#17233d'; ctx.beginPath(); ctx.arc(x + 24, y - 60, 1.8, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = '#ffe9a8'; ctx.beginPath(); ctx.arc(x + 34, y - 52, 2.6, 0, TAU); ctx.fill();
    ctx.fillStyle = 'white'; ctx.font = 'bold 13px Trebuchet MS, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('EXIT', x + 24, y - (open ? 158 : 135));
  }

  var PROPS = { pizza: drawPizza, coin: drawCoin, heart: drawHeart, shield: drawShield, star: drawStar };

  OG.Sprites.drawProp = function (ctx, id, x, y, t, opts) {
    opts = opts || {};
    t = t || 0;
    var fn = PROPS[id];
    if (!fn && id !== 'exit') return false;
    ctx.save();
    var ok = true;
    try {
      if (fn) fn(ctx, x, y, t);
      else drawExit(ctx, x, y, t, !!opts.open);
    } catch (err) {
      ok = false;
    }
    ctx.restore();
    return ok;
  };
})();
