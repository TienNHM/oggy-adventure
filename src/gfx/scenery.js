/* OG.Sprites (phần cảnh vật) — nền, sàn, đạo cụ.
 * Chủ sở hữu: agent Sprites (src/gfx/). Load SAU src/gfx/sprites.js.
 * Đạo cụ (pizza, xu, tim, khiên, sao, cửa EXIT) vẽ hoàn toàn bằng Canvas (không emoji).
 * Nền/sàn/trang trí: kitchen/garden giữ đồ hoạ MVP; roof (hoàng hôn, mái ngói) và lair (hang tối,
 * mắt gián lấp ló) do agent Tích hợp bổ sung để mỗi khu vực/trận trùm có cảnh riêng.
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

  // Bảng màu riêng cho khu mái nhà và hang ổ (agent Tích hợp bổ sung để màn/trận trùm roof, lair
  // không dùng chung nền vườn).
  var ROOF = { skyTop: '#ff9f7c', skyBottom: '#ffe3a6', sun: '#fff1b8', house: '#c97a5e', houseDark: '#a65c47',
    tile: '#b5523b', tileTop: '#de7a52', tileLine: '#8f3d2c', brick: '#9c4a3a', brickTop: '#f0a77e', chimney: '#8a3f33' };
  var LAIR = { skyTop: '#241c3a', skyBottom: '#4d3d6b', rock: '#1b1530', eye: '#ffe35c',
    floor: '#3d3352', floorTop: '#6d5c90', stone: '#594b78', stoneTop: '#9a89c0', moss: '#7fd08a' };

  function drawRoofBackground(ctx, cam, t) {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, ROOF.skyTop); g.addColorStop(1, ROOF.skyBottom);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // mặt trời lặn + mây
    ctx.fillStyle = ROOF.sun; ctx.beginPath(); ctx.arc(760 - cam * 0.05, 150, 58, 0, TAU); ctx.fill();
    for (var i = 0; i < 6; i++) {
      var x = wrap(i * 250 - cam * 0.18, W + 200) - 90, y = 70 + (i % 3) * 38;
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath(); ctx.arc(x, y, 22, 0, TAU); ctx.arc(x + 24, y - 8, 28, 0, TAU); ctx.arc(x + 52, y, 20, 0, TAU); ctx.fill();
    }
    // dãy nhà xa (parallax): thân, mái tam giác, ống khói, cửa sổ sáng đèn
    for (var j = 0; j < 7; j++) {
      var hx = wrap(j * 210 - cam * 0.3, W + 220) - 110, hh = 90 + (j % 3) * 35, top = 480 - hh;
      ctx.fillStyle = j % 2 ? ROOF.house : ROOF.houseDark;
      ctx.fillRect(hx, top, 170, hh);
      ctx.beginPath(); ctx.moveTo(hx - 12, top); ctx.lineTo(hx + 85, top - 55); ctx.lineTo(hx + 182, top); ctx.closePath(); ctx.fill();
      ctx.fillStyle = ROOF.chimney; ctx.fillRect(hx + 120, top - 52, 20, 34);
      ctx.fillStyle = 'rgba(255,240,200,0.75)'; ctx.fillRect(hx + 30, top + 25, 26, 22); ctx.fillRect(hx + 110, top + 25, 26, 22);
    }
  }

  function drawLairBackground(ctx, cam, t) {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, LAIR.skyTop); g.addColorStop(1, LAIR.skyBottom);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // nhũ đá trên trần (parallax)
    ctx.fillStyle = LAIR.rock;
    for (var i = 0; i < 12; i++) {
      var x = wrap(i * 110 - cam * 0.25, W + 120) - 60, len = 40 + ((i * 37) % 70);
      ctx.beginPath(); ctx.moveTo(x - 26, 0); ctx.lineTo(x, len); ctx.lineTo(x + 26, 0); ctx.closePath(); ctx.fill();
    }
    // tảng đá xa
    ctx.fillStyle = 'rgba(27,21,48,0.55)';
    for (var k = 0; k < 6; k++) {
      var rx = wrap(k * 240 - cam * 0.35, W + 260) - 120;
      ctx.beginPath(); ctx.ellipse(rx, 480, 120, 70 + (k % 2) * 40, 0, Math.PI, TAU); ctx.fill();
    }
    // những đôi mắt gián lấp ló trong bóng tối (thỉnh thoảng chớp)
    ctx.fillStyle = LAIR.eye;
    for (var e = 0; e < 7; e++) {
      if (Math.sin(t * 1.3 + e * 2.1) > 0.85) continue;
      var ex = wrap(e * 170 + 60 - cam * 0.32, W + 140) - 70, ey = 170 + ((e * 53) % 200);
      ctx.beginPath(); ctx.ellipse(ex, ey, 4, 3, 0, 0, TAU); ctx.ellipse(ex + 13, ey, 4, 3, 0, 0, TAU); ctx.fill();
    }
  }

  // ---------------------------------------------------------------------------
  // v2: Bộ vẽ CHUNG cho chủ đề đăng ký qua OG.Scenery.registerTheme (ThemeDef, docs/STORY.md mục 4).
  // BẢN STUB — agent cảnh nền nâng cấp (thêm kind lớp/decor đẹp hơn) nhưng giữ cách đọc ThemeDef.
  // ---------------------------------------------------------------------------
  function themeDef(theme) { return OG.Scenery && OG.Scenery.getTheme ? OG.Scenery.getTheme(theme) : null; }

  function drawThemeBackground(ctx, def, cam, t) {
    var custom = def.drawCustom || {};
    if (typeof custom.background === 'function') { custom.background(ctx, cam, t, def); return; }
    var sky = def.sky || {};
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, sky.top || P.skyTop);
    g.addColorStop(1, sky.bottom || P.skyBottom);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (sky.stars) {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (var s = 0; s < 40; s++) {
        var sx = wrap(s * 97 - cam * 0.05, W), sy = (s * 53) % 300;
        if (Math.sin(t * 2 + s) > -0.6) ctx.fillRect(sx, sy, 2, 2);
      }
    }
    if (sky.sun) {
      var sun = sky.sun;
      ctx.fillStyle = sun.color || '#fff1b8';
      ctx.beginPath(); ctx.arc((sun.x || 780) - cam * 0.04, sun.y || 110, sun.r || 50, 0, TAU); ctx.fill();
    }
    if (sky.clouds !== false) {
      var cc = (sky.clouds && sky.clouds.color) || P.cloud, n = (sky.clouds && sky.clouds.count) || 6;
      for (var i = 0; i < n; i++) {
        var x = wrap(i * 230 - cam * 0.2, W + 180) - 80, y = 60 + (i % 3) * 42;
        ctx.fillStyle = cc; ctx.beginPath(); ctx.arc(x, y, 22, 0, TAU); ctx.arc(x + 24, y - 8, 28, 0, TAU); ctx.arc(x + 50, y, 20, 0, TAU); ctx.fill();
      }
    }
    var layers = def.layers || [];
    for (var k = 0; k < layers.length; k++) OG.Scenery.drawLayer(ctx, layers[k], cam, t, def);
  }

  function drawThemePlatform(ctx, a, def, t) {
    var custom = def.drawCustom || {};
    if (typeof custom.platform === 'function' && custom.platform(ctx, a, t, def) === true) return;
    var floor = a.isFloor || a.y > 470;
    var ps = def.platformStyle || {};
    var st = (floor ? ps.floor : ps.ledge) || {};
    fillRound(ctx, a.x, a.y, a.w, a.h, st.radius != null ? st.radius : (floor ? 0 : 8), st.fill || (floor ? P.floor : P.plank));
    ctx.fillStyle = st.top || (floor ? P.grass : P.plankTop);
    ctx.fillRect(a.x, a.y, a.w, st.topH || (floor ? 8 : 5));
    if (ps.outline !== false && !floor) {
      ctx.strokeStyle = 'rgba(23,35,61,0.35)'; ctx.lineWidth = 2;
      OG.util.roundRectPath(ctx, a.x, a.y, a.w, a.h, st.radius != null ? st.radius : 8); ctx.stroke();
    }
  }

  // decor: [{kind, every?, start?, at?:[x], y?, scale?, opts?}]  (y mặc định = mặt sàn 480)
  function drawThemeDecor(ctx, def, worldW, t, front) {
    var custom = def.drawCustom || {};
    if (!front && typeof custom.decor === 'function') { custom.decor(ctx, worldW, t, def); return; }
    var list = def.decor || [];
    for (var i = 0; i < list.length; i++) {
      var d = list[i];
      if (!!d.front !== !!front) continue;
      var y = d.y != null ? d.y : OG.FLOOR_Y, sc = d.scale || 1;
      if (d.at) for (var j = 0; j < d.at.length; j++) OG.Scenery.drawDecor(ctx, d.kind, d.at[j], y, sc, t, d.opts);
      else for (var x = d.start || 120; x < worldW; x += d.every || 400) OG.Scenery.drawDecor(ctx, d.kind, x, y, sc, t, d.opts);
    }
  }

  OG.Sprites.drawBackground = function (ctx, theme, cam, t) {
    var def = themeDef(theme);
    if (def && !(def.base && !def.sky && !def.layers && !def.drawCustom)) { drawThemeBackground(ctx, def, cam, t || 0); return; }
    if (def) theme = OG.Scenery.baseOf(theme);
    if (theme === 'roof') { drawRoofBackground(ctx, cam, t || 0); return; }
    if (theme === 'lair') { drawLairBackground(ctx, cam, t || 0); return; }
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, P.skyTop);
    g.addColorStop(1, P.skyBottom);
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
    var def = themeDef(theme);
    if (def && (def.platformStyle || (def.drawCustom && def.drawCustom.platform))) { drawThemePlatform(ctx, a, def, t || 0); return; }
    if (def) theme = OG.Scenery.baseOf(theme);
    var floor = a.isFloor || a.y > 470;
    if (theme === 'roof') {
      if (floor) {
        // mái ngói: nền đỏ gạch + 3 hàng vảy ngói
        ctx.fillStyle = ROOF.tile; ctx.fillRect(a.x, a.y, a.w, a.h);
        ctx.fillStyle = ROOF.tileTop; ctx.fillRect(a.x, a.y, a.w, 8);
        ctx.strokeStyle = ROOF.tileLine; ctx.lineWidth = 2;
        var x0 = Math.floor(a.x / 30) * 30;
        for (var row = 0; row < 3; row++) {
          var ry = a.y + 18 + row * 16;
          ctx.beginPath();
          for (var x = x0 + (row % 2) * 15; x < a.x + a.w; x += 30) { ctx.moveTo(x + 30, ry); ctx.arc(x + 15, ry, 15, 0, Math.PI); }
          ctx.stroke();
        }
      } else {
        // bục gạch (như bờ tường/ống khói)
        fillRound(ctx, a.x, a.y, a.w, a.h, 4, ROOF.brick);
        ctx.fillStyle = ROOF.brickTop; ctx.fillRect(a.x, a.y, a.w, 5);
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        for (var bx = a.x + 20; bx < a.x + a.w - 4; bx += 26) ctx.fillRect(bx, a.y + 7, 2, a.h - 8);
      }
      return;
    }
    if (theme === 'lair') {
      fillRound(ctx, a.x, a.y, a.w, a.h, floor ? 0 : 7, floor ? LAIR.floor : LAIR.stone);
      ctx.fillStyle = floor ? LAIR.floorTop : LAIR.stoneTop; ctx.fillRect(a.x, a.y, a.w, floor ? 7 : 5);
      // vệt rêu phát sáng
      ctx.fillStyle = LAIR.moss;
      for (var mx = a.x + 12; mx < a.x + a.w - 8; mx += floor ? 140 : 46) ctx.fillRect(mx, a.y - 2, 10, 3);
      return;
    }
    fillRound(ctx, a.x, a.y, a.w, a.h, 8, floor ? P.floor : P.plank);
    if (floor) { ctx.fillStyle = P.grass; ctx.fillRect(a.x, a.y, a.w, 8); }
    else { ctx.fillStyle = P.plankTop; ctx.fillRect(a.x, a.y, a.w, 5); }
  };

  OG.Sprites.drawDecor = function (ctx, theme, worldW, t) {
    var def = themeDef(theme);
    if (def && (def.decor || (def.drawCustom && def.drawCustom.decor))) { drawThemeDecor(ctx, def, worldW, t || 0, false); return; }
    if (def) theme = OG.Scenery.baseOf(theme);
    if (theme === 'roof') {
      // ống khói nhỏ + ăng-ten trên mái
      ctx.strokeStyle = '#5b3a33'; ctx.lineWidth = 2;
      for (var x = 140; x < worldW; x += 420) {
        fillRound(ctx, x, 430, 34, 50, 4, ROOF.chimney);
        ctx.fillStyle = ROOF.brickTop; ctx.fillRect(x - 3, 428, 40, 6);
        ctx.beginPath();
        ctx.moveTo(x + 210, 480); ctx.lineTo(x + 210, 438);
        ctx.moveTo(x + 198, 446); ctx.lineTo(x + 222, 446);
        ctx.moveTo(x + 202, 455); ctx.lineTo(x + 218, 455);
        ctx.stroke();
      }
      return;
    }
    if (theme === 'lair') {
      // nấm phát sáng nhấp nháy
      for (var m = 120; m < worldW; m += 330) {
        var glow = 0.55 + 0.25 * Math.sin((t || 0) * 2 + m);
        ctx.fillStyle = '#d9cfe8'; ctx.fillRect(m + 8, 462, 6, 18);
        ctx.fillStyle = 'rgba(127,208,138,' + glow.toFixed(2) + ')';
        ctx.beginPath(); ctx.ellipse(m + 11, 462, 16, 9, 0, Math.PI, TAU); ctx.fill();
      }
      return;
    }
    for (var x2 = 100; x2 < worldW; x2 += 300) fillRound(ctx, x2, 445, 55, 35, 8, theme === 'kitchen' ? P.kitchenDecor : P.gardenDecor);
  };

  // Lớp phủ MÀN HÌNH sau thế giới (tuỳ chọn, Level gọi nếu có): decor front + hạt không khí của chủ đề.
  // ambient: {kind:'snow'|'leaves'|'bubbles'|'sparkle', color}
  OG.Sprites.drawOverlay = function (ctx, theme, cam, t) {
    var def = themeDef(theme);
    if (!def) return;
    if (def.decor && def.decor.some(function (d) { return d.front; })) {
      ctx.save(); ctx.translate(-cam, 0); drawThemeDecor(ctx, def, (OG.Level.state && OG.Level.state.width) || W, t || 0, true); ctx.restore();
    }
    var amb = def.ambient;
    if (!amb) return;
    ctx.save();
    ctx.fillStyle = amb.color || 'rgba(255,255,255,0.8)';
    for (var i = 0; i < 26; i++) {
      var x = wrap(i * 73 - cam * 0.6 + Math.sin(t + i) * 20, W);
      var y = wrap(i * 41 + t * (amb.kind === 'bubbles' ? -40 : 40), H);
      ctx.beginPath(); ctx.arc(x, y, amb.kind === 'snow' ? 2.5 : 3, 0, TAU); ctx.fill();
    }
    ctx.restore();
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
    ctx.fillStyle = 'white'; ctx.font = 'bold 13px "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif'; ctx.textAlign = 'center';
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
