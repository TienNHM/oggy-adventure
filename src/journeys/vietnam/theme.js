// @ts-check
/* ============================================================================
 * Hành trình "vietnam" — CẢNH NỀN THEO CHỦ ĐỀ + THƯ VIỆN DECOR / LỚP PARALLAX 'vietnam-*'
 * ----------------------------------------------------------------------------
 * Vai trò:      Đăng ký ~30 decor, 7 lớp parallax và 7 chủ đề cảnh nền của hành trình vietnam (lúc LOAD).
 *               Bộ vẽ chung src/gfx/scenery.js đọc ThemeDef rồi gọi các hàm vẽ ở đây mỗi frame; content.js
 *               mượn decor ở đây làm hình thẻ kiến thức.
 * Khái niệm:    theme khai báo (ThemeDef: cảnh là dữ liệu) · registry decor / lớp theo tên · lớp có tham số
 *               (vietnam-row nhận danh sách items trong dữ liệu) · hàm trợ giúp sinh phần lặp của dữ liệu
 *               (theme() dựng platformStyle + drawCustom từ một bảng style ngắn) · parallax · procedural drawing
 * Bài học:      docs/learn/12-data-driven-man-cau-do-hanh-trinh.md · docs/learn/08-camera-parallax.md ·
 *               docs/learn/07-ve-canvas-procedural-cache.md
 * Phụ thuộc:    OG.Scenery.registerDecor / registerLayer / registerTheme / drawDecor (LOAD) ·
 *               OG.util.roundRectPath (lúc CHẠY) · OG.Decor.face (tuỳ chọn) · OG.W, OG.H (LOAD, có dự phòng)
 * Event:        (không)
 * API công khai: (không) — chỉ đăng ký tên 'vietnam-*' vào OG.Scenery
 * Đọc tiếp:     src/core/scenery-registry.js → src/gfx/scenery.js → src/journeys/vietnam/content.js
 * Dữ liệu:      ThemeDef, SceneryLayer, PlatformPaint, DecorFn (src/types.d.ts; docs/STORY.md mục 4)
 *
 * Hợp đồng ThemeDef: docs/STORY.md mục 4.
 *
 * Chủ đề: vietnam-hanoi · vietnam-halong · vietnam-halongcave · vietnam-hue · vietnam-hoian · vietnam-saigon · vietnam-mientay
 * Decor (x = tâm, y = mặt đất, vẽ trong không gian thế giới; cao ~100 px ở scale 1):
 *   turtletower, thehuc, tubehouse, pho, puppet, flowerbike, tree, karst, junk, kissrocks, cave, heritage,
 *   ngomon, dragonboat, nonla, pagoda7, saola, lantern, lanternpost, chuacau, yellowhouse, douc,
 *   benthanh, banhmi, banhmicart, scooter, monkey, coconut, floatboat, fruits, rice, dragon
 * Lớp (màn hình): vietnam-water, vietnam-row, vietnam-karsts, vietnam-skyline, vietnam-ricefield,
 *   vietnam-stalactites, vietnam-garland
 * Phong cách: viền ink #17233d dày bo tròn, màu tươi, đồ vật có khuôn mặt (OG.Decor.face nếu có).
 * ========================================================================== */
(function () {
  'use strict';
  var OG = window.OG;
  var S = OG.Scenery;
  var TAU = Math.PI * 2;
  var INK = '#17233d';
  /** @type {Object<string, DecorFn>} name (không tiền tố) -> hàm vẽ decor; lớp parallax gọi thẳng, khỏi tra registry */
  var D = {};

  // ---------------------------------------------------------------------------
  // Tiện ích vẽ
  // ---------------------------------------------------------------------------
  function wrap(x, span) { return ((x % span) + span) % span; }
  function ink(ctx, w) { ctx.strokeStyle = INK; ctx.lineWidth = w || 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); }
  function fillInk(ctx, color, w) { ctx.fillStyle = color; ctx.fill(); ink(ctx, w); }
  // Viền NGOÀI cho hình ghép nhiều vòng tròn (không lộ nét bên trong): nét dày trước, tô màu đè lên.
  function fillOut(ctx, color, w) { ink(ctx, (w || 3) * 2); ctx.fillStyle = color; ctx.fill(); }
  function rr(ctx, x, y, w, h, r) { OG.util.roundRectPath(ctx, x, y, w, h, r); }
  function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }
  // Khuôn mặt dễ thương (ưu tiên thư viện chung OG.Decor.face).
  function face(ctx, x, y, s, mood) {
    if (OG.Decor && typeof OG.Decor.face === 'function') { OG.Decor.face(ctx, x, y, s, mood); return; }
    ctx.save();
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.arc(x - 6 * s, y, 2.4 * s, 0, TAU); ctx.arc(x + 6 * s, y, 2.4 * s, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,120,150,0.55)';
    ctx.beginPath(); ctx.arc(x - 10 * s, y + 5 * s, 2.6 * s, 0, TAU); ctx.arc(x + 10 * s, y + 5 * s, 2.6 * s, 0, TAU); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.8 * s; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x, y + 3 * s, 4 * s, 0.25, Math.PI - 0.25); ctx.stroke();
    ctx.restore();
  }
  // Mái ngói cong kiểu Á Đông: (cx, y) = giữa chân mái, w = rộng, h = cao.
  function curvedRoof(ctx, cx, y, w, h, color, lw) {
    ctx.beginPath();
    ctx.moveTo(cx - w / 2 - 8, y - 6);
    ctx.quadraticCurveTo(cx - w / 2 + 4, y, cx - w / 2 + 10, y);
    ctx.lineTo(cx + w / 2 - 10, y);
    ctx.quadraticCurveTo(cx + w / 2 - 4, y, cx + w / 2 + 8, y - 6);
    ctx.lineTo(cx + w / 2 - 12, y - h);
    ctx.lineTo(cx - w / 2 + 12, y - h);
    ctx.closePath();
    fillInk(ctx, color, lw || 3);
  }

  // Đăng ký decor: fn(ctx, t, o) vẽ quanh gốc (0,0) = chân, hướng lên là y âm.
  // 💡 Khái niệm: một hàm vẽ, hai lối vào — lưu vào bảng D (lớp parallax trong file gọi trực tiếp, nhanh) và
  //   registry OG.Scenery với tiền tố 'vietnam-' (dữ liệu ThemeDef / thẻ kiến thức tra theo tên).
  //   translate + scale đưa mọi decor về cùng quy ước "vẽ quanh chân ở (0,0)", nên tự vẽ không cần biết x, y, s.
  /**
   * Đăng ký decor 'vietnam-<name>'.
   * @param {string} name  tên ngắn (không tiền tố)
   * @param {function(CanvasRenderingContext2D, number, any): void} fn  vẽ quanh chân (0,0); nhận (ctx, t giây, opts)
   */
  function reg(name, fn) {
    var draw = function (ctx, x, y, s, t, o) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s || 1, s || 1);
      fn(ctx, t || 0, o || {});
      ctx.restore();
    };
    D[name] = draw;
    S.registerDecor('vietnam-' + name, draw);
  }

  // ===========================================================================
  // HÀ NỘI
  // ===========================================================================
  // Tháp Rùa trên đảo nhỏ giữa Hồ Gươm.
  reg('turtletower', function (ctx, t) {
    ctx.beginPath(); ctx.ellipse(0, -6, 62, 13, 0, 0, TAU); fillInk(ctx, '#7fbf5f');
    // cây nhỏ trên đảo
    ctx.fillStyle = '#8a5a32'; ctx.fillRect(38, -36, 6, 28);
    circle(ctx, 41, -42, 14); fillInk(ctx, '#4fae5a', 2.5);
    // ba tầng tháp
    rr(ctx, -26, -60, 52, 54, 4); fillInk(ctx, '#efe2c4');
    rr(ctx, -18, -86, 36, 26, 3); fillInk(ctx, '#efe2c4');
    rr(ctx, -10, -106, 20, 20, 3); fillInk(ctx, '#efe2c4');
    ctx.fillStyle = '#b5523b';
    [[-32, -64, 64], [-23, -90, 46], [-14, -109, 28]].forEach(function (r) { rr(ctx, r[0], r[1], r[2], 7, 3); fillInk(ctx, '#b5523b', 2.5); });
    circle(ctx, 0, -114, 4); fillInk(ctx, '#f2c14e', 2);
    // cửa vòm
    ctx.fillStyle = '#5b4636';
    [-14, 14].forEach(function (dx) { ctx.beginPath(); ctx.moveTo(dx - 5, -10); ctx.lineTo(dx - 5, -20); ctx.arc(dx, -20, 5, Math.PI, 0); ctx.lineTo(dx + 5, -10); ctx.closePath(); ctx.fill(); });
    face(ctx, 0, -40, 1.1);
    // gợn nước
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2;
    var k = Math.sin(t * 2) * 3;
    ctx.beginPath(); ctx.moveTo(-58 + k, 6); ctx.lineTo(-40 + k, 6); ctx.moveTo(40 - k, 8); ctx.lineTo(58 - k, 8); ctx.stroke();
  });

  // Cầu Thê Húc đỏ cong.
  reg('thehuc', function (ctx) {
    ctx.beginPath();
    ctx.moveTo(-110, 0); ctx.quadraticCurveTo(0, -70, 110, 0); ctx.lineTo(110, 10); ctx.quadraticCurveTo(0, -56, -110, 10); ctx.closePath();
    fillInk(ctx, '#e0453a');
    ctx.strokeStyle = '#a92f27'; ctx.lineWidth = 2.5;
    for (var i = -4; i <= 4; i++) {
      var x = i * 22, yTop = -35 * (1 - (x * x) / (110 * 110)) - 4;
      ctx.beginPath(); ctx.moveTo(x, yTop); ctx.lineTo(x, yTop - 16); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(-100, -12); ctx.quadraticCurveTo(0, -84, 100, -12); ink(ctx, 3);
  });

  // Nhà ống phố cổ (opts.color, opts.h).
  reg('tubehouse', function (ctx, t, o) {
    var h = o.h || 110, c = o.color || '#f4c95d';
    rr(ctx, -30, -h, 60, h, 3); fillInk(ctx, c);
    // mái ngói nâu đỏ
    ctx.beginPath(); ctx.moveTo(-36, -h + 2); ctx.lineTo(0, -h - 22); ctx.lineTo(36, -h + 2); ctx.closePath(); fillInk(ctx, '#b5523b');
    // ban công + cửa sổ chớp xanh
    rr(ctx, -20, -h + 14, 40, 26, 3); fillInk(ctx, '#3f9a6b', 2.5);
    ctx.strokeStyle = 'rgba(23,35,61,0.5)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -h + 14); ctx.lineTo(0, -h + 40); ctx.stroke();
    ctx.fillStyle = INK; ctx.fillRect(-24, -h + 42, 48, 3);
    face(ctx, 0, -h * 0.42, 0.9);
    // cửa ra vào + mái hiên
    rr(ctx, -14, -34, 28, 34, 3); fillInk(ctx, '#7a4a2b', 2.5);
    ctx.beginPath(); ctx.moveTo(-28, -40); ctx.lineTo(28, -40); ctx.lineTo(22, -48); ctx.lineTo(-22, -48); ctx.closePath(); fillInk(ctx, o.awning || '#e5484d', 2);
  });

  // Bát phở bốc khói trên ghế đẩu.
  reg('pho', function (ctx, t) {
    // ghế đẩu nhựa đỏ
    ctx.fillStyle = '#e5484d';
    rr(ctx, -26, -30, 52, 8, 3); fillInk(ctx, '#e5484d', 2.5);
    ctx.beginPath(); ctx.moveTo(-22, -22); ctx.lineTo(-26, 0); ctx.moveTo(22, -22); ctx.lineTo(26, 0); ink(ctx, 5);
    // bát
    ctx.beginPath(); ctx.moveTo(-40, -70); ctx.quadraticCurveTo(-36, -30, 0, -30); ctx.quadraticCurveTo(36, -30, 40, -70); ctx.closePath(); fillInk(ctx, '#ffffff');
    ctx.strokeStyle = '#3f7fd0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-37, -60); ctx.quadraticCurveTo(0, -52, 37, -60); ctx.stroke();
    // nước dùng + bánh phở + hành
    ctx.beginPath(); ctx.ellipse(0, -70, 40, 9, 0, 0, TAU); fillInk(ctx, '#f6c66b', 2.5);
    ctx.strokeStyle = '#fff6df'; ctx.lineWidth = 2.5;
    for (var i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 12 - 6, -70); ctx.quadraticCurveTo(i * 12, -76, i * 12 + 6, -70); ctx.stroke(); }
    ctx.fillStyle = '#4fae5a'; [[-18, -72], [10, -68], [22, -73], [-4, -66]].forEach(function (p) { circle(ctx, p[0], p[1], 3); ctx.fill(); });
    ctx.fillStyle = '#e8a0a0'; ctx.beginPath(); ctx.ellipse(-6, -73, 8, 3, 0.2, 0, TAU); ctx.fill();
    // đũa
    ctx.beginPath(); ctx.moveTo(18, -66); ctx.lineTo(46, -104); ctx.moveTo(24, -66); ctx.lineTo(54, -100); ink(ctx, 4);
    // khói thơm
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 3;
    for (var k = -1; k <= 1; k++) {
      var ph = t * 3 + k * 2;
      ctx.beginPath(); ctx.moveTo(k * 14, -82);
      ctx.bezierCurveTo(k * 14 + Math.sin(ph) * 6, -92, k * 14 - Math.sin(ph) * 6, -102, k * 14, -112); ctx.stroke();
    }
    face(ctx, 0, -46, 1.1);
  });

  // Con rối nước "chú Tễu" bụng tròn đứng trên mặt nước.
  reg('puppet', function (ctx, t) {
    var bob = Math.sin(t * 3) * 3;
    ctx.save(); ctx.translate(0, bob);
    // thân + bụng tròn
    ctx.beginPath(); ctx.ellipse(0, -30, 24, 26, 0, 0, TAU); fillInk(ctx, '#f6d7a7');
    ctx.beginPath(); ctx.moveTo(-24, -34); ctx.lineTo(24, -34); ctx.lineTo(20, -16); ctx.lineTo(-20, -16); ctx.closePath(); fillInk(ctx, '#e5484d', 2.5);
    ctx.fillStyle = '#ffc94a'; ctx.fillRect(-21, -20, 42, 4);
    // tay vẫy
    var wv = Math.sin(t * 6) * 0.4;
    ctx.save(); ctx.translate(22, -40); ctx.rotate(-0.8 + wv); ctx.beginPath(); ctx.ellipse(10, 0, 12, 5, 0, 0, TAU); fillInk(ctx, '#f6d7a7', 2.5); ctx.restore();
    ctx.beginPath(); ctx.ellipse(-28, -34, 10, 5, 0.5, 0, TAU); fillInk(ctx, '#f6d7a7', 2.5);
    // đầu + chỏm tóc
    circle(ctx, 0, -72, 20); fillInk(ctx, '#f6d7a7');
    ctx.beginPath(); ctx.ellipse(0, -93, 6, 5, 0, 0, TAU); fillInk(ctx, INK, 2);
    face(ctx, 0, -72, 1.1);
    ctx.restore();
    // mặt nước
    ctx.beginPath(); ctx.ellipse(0, -2, 46, 9, 0, 0, TAU); fillInk(ctx, '#5fc0e8', 2.5);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-30, -3); ctx.lineTo(-18, -3); ctx.moveTo(16, -1); ctx.lineTo(30, -1); ctx.stroke();
  });

  // Xe đạp chở hoa (Hà Nội mùa thu).
  reg('flowerbike', function (ctx, t) {
    function wheel(x) { circle(ctx, x, -18, 17); ink(ctx, 4); circle(ctx, x, -18, 3); ctx.fillStyle = INK; ctx.fill(); }
    wheel(-30); wheel(32);
    ctx.beginPath(); ctx.moveTo(-30, -18); ctx.lineTo(-6, -46); ctx.lineTo(18, -18); ctx.lineTo(-30, -18); ctx.moveTo(-6, -46); ctx.lineTo(26, -50); ctx.lineTo(32, -18); ink(ctx, 4);
    ctx.beginPath(); ctx.moveTo(26, -50); ctx.lineTo(30, -62); ctx.lineTo(40, -62); ink(ctx, 4);
    rr(ctx, -14, -52, 18, 5, 2); fillInk(ctx, '#5b4636', 2);
    // giỏ hoa phía sau
    ctx.beginPath(); ctx.moveTo(-58, -48); ctx.lineTo(-20, -48); ctx.lineTo(-26, -26); ctx.lineTo(-52, -26); ctx.closePath(); fillInk(ctx, '#d9a066');
    var cols = ['#ff8fb1', '#ffd23f', '#ffffff', '#c77dff', '#ff6b6b'];
    for (var i = 0; i < 7; i++) {
      var fx = -54 + i * 5.5, fy = -54 - (i % 3) * 7 + Math.sin(t * 2 + i) * 1.5;
      circle(ctx, fx, fy, 6); fillInk(ctx, cols[i % cols.length], 1.5);
    }
    face(ctx, -39, -37, 0.7);
  });

  // Cây tròn xanh (dùng cây của thư viện chung nếu có).
  reg('tree', function (ctx, t, o) {
    if (S.hasDecor && S.hasDecor('tree') && !o.own) { S.drawDecor(ctx, 'tree', 0, 0, 1, t, o); return; }
    rr(ctx, -7, -60, 14, 60, 5); fillInk(ctx, '#8a5a32');
    ctx.beginPath(); ctx.arc(-20, -70, 24, 0, TAU); ctx.moveTo(44, -70); ctx.arc(20, -70, 24, 0, TAU); ctx.moveTo(28, -92); ctx.arc(0, -92, 28, 0, TAU);
    fillOut(ctx, o.color || '#5cbf60');
    face(ctx, 0, -80, 1);
  });

  // ===========================================================================
  // HẠ LONG
  // ===========================================================================
  // Đảo đá vôi (opts.h, opts.color, opts.face).
  reg('karst', function (ctx, t, o) {
    var h = o.h || 110, w = o.w || 46;
    ctx.beginPath();
    ctx.moveTo(-w, 0);
    ctx.bezierCurveTo(-w - 6, -h * 0.5, -w * 0.9, -h, -w * 0.25, -h);
    ctx.bezierCurveTo(w * 0.2, -h - 8, w * 0.9, -h * 0.8, w * 0.8, -h * 0.45);
    ctx.bezierCurveTo(w * 0.75, -h * 0.25, w + 6, -h * 0.15, w, 0);
    ctx.closePath();
    fillInk(ctx, o.color || '#9db5a5', o.lw || 3);
    if (o.flat) return;
    // cây xanh trên đỉnh
    ctx.fillStyle = o.green || '#5fa86a';
    ctx.beginPath(); ctx.arc(-w * 0.35, -h + 2, 12, 0, TAU); ctx.arc(-w * 0.05, -h - 2, 14, 0, TAU); ctx.arc(w * 0.3, -h + 6, 11, 0, TAU); ctx.fill();
    // vân đá
    ctx.strokeStyle = 'rgba(23,35,61,0.25)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-w * 0.5, -h * 0.6); ctx.quadraticCurveTo(-w * 0.3, -h * 0.4, -w * 0.55, -h * 0.2); ctx.stroke();
    if (o.face !== false) face(ctx, 0, -h * 0.45, 1);
  });

  // Thuyền buồm nâu đỏ Hạ Long.
  reg('junk', function (ctx, t, o) {
    var bob = Math.sin(t * 2 + (o.phase || 0)) * 3;
    ctx.save(); ctx.translate(0, bob);
    // buồm
    [[-22, 70], [8, 86], [36, 60]].forEach(function (m, i) {
      var x = m[0], hh = m[1];
      ctx.beginPath(); ctx.moveTo(x, -18); ctx.lineTo(x, -18 - hh - 6); ink(ctx, 3);
      ctx.beginPath(); ctx.moveTo(x, -22 - hh); ctx.quadraticCurveTo(x + 22, -22 - hh * 0.6, x + 20, -24); ctx.lineTo(x, -24); ctx.closePath();
      fillInk(ctx, i === 1 ? '#e07a3c' : '#d4643a', 2.5);
      ctx.strokeStyle = 'rgba(23,35,61,0.45)'; ctx.lineWidth = 1.5;
      for (var k = 1; k < 4; k++) { var yy = -24 - (hh * k) / 4; ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + 19 - k, yy - 2); ctx.stroke(); }
    });
    // thân thuyền
    ctx.beginPath(); ctx.moveTo(-56, -24); ctx.lineTo(64, -28); ctx.quadraticCurveTo(58, 0, 40, 2); ctx.lineTo(-40, 2); ctx.quadraticCurveTo(-56, -6, -56, -24); ctx.closePath();
    fillInk(ctx, '#8d5a34');
    ctx.fillStyle = '#f2c14e'; ctx.fillRect(-48, -20, 104, 4);
    face(ctx, 4, -10, 0.9);
    ctx.restore();
  });

  // Hòn Trống Mái: hai tảng đá như hai chú gà đối mặt.
  reg('kissrocks', function (ctx, t) {
    function rock(dir) {
      ctx.save(); ctx.scale(dir, 1);
      ctx.beginPath();
      ctx.moveTo(-6, 0); ctx.bezierCurveTo(-10, -30, -40, -40, -36, -70);
      ctx.bezierCurveTo(-34, -92, -10, -96, -4, -78);
      ctx.bezierCurveTo(0, -66, -2, -40, 8, 0); ctx.closePath();
      fillInk(ctx, '#a7b8ad');
      // mỏ + mào
      ctx.beginPath(); ctx.moveTo(-4, -80); ctx.lineTo(4, -76); ctx.lineTo(-4, -72); ctx.closePath(); fillInk(ctx, '#ffc94a', 2);
      ctx.beginPath(); ctx.arc(-18, -94, 5, 0, TAU); ctx.arc(-12, -96, 5, 0, TAU); fillInk(ctx, '#ff6b6b', 2);
      ctx.fillStyle = INK; circle(ctx, -14, -80, 2.5); ctx.fill();
      ctx.restore();
    }
    ctx.save(); ctx.translate(-22, 0); rock(1); ctx.restore();
    ctx.save(); ctx.translate(22, 0); rock(-1); ctx.restore();
    // trái tim nhỏ bay lên
    var k = (t * 0.6) % 1;
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = '#ff6b8a';
    ctx.save(); ctx.translate(0, -96 - k * 20); ctx.scale(0.6, 0.6);
    ctx.beginPath(); ctx.moveTo(0, 8); ctx.bezierCurveTo(-12, 0, -8, -10, 0, -4); ctx.bezierCurveTo(8, -10, 12, 0, 0, 8); ctx.fill();
    ctx.restore(); ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.ellipse(0, -2, 60, 8, 0, 0, TAU); fillInk(ctx, '#5fc0e8', 2.5);
  });

  // Cửa hang động có nhũ đá lấp lánh.
  reg('cave', function (ctx, t) {
    ctx.beginPath(); ctx.moveTo(-60, 0); ctx.bezierCurveTo(-66, -80, -30, -110, 0, -110); ctx.bezierCurveTo(30, -110, 66, -80, 60, 0); ctx.closePath();
    fillInk(ctx, '#a7b8ad');
    ctx.fillStyle = '#6fb07a'; ctx.beginPath(); ctx.arc(-20, -104, 10, 0, TAU); ctx.arc(4, -110, 12, 0, TAU); ctx.arc(24, -102, 9, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-36, 0); ctx.bezierCurveTo(-40, -56, -20, -70, 0, -70); ctx.bezierCurveTo(20, -70, 40, -56, 36, 0); ctx.closePath();
    fillInk(ctx, '#6f7fc4');
    // thạch nhũ tròn trịa màu sáng (không nhọn như răng)
    [[-18, -56, 12], [0, -66, 16], [18, -56, 11]].forEach(function (s) {
      ctx.beginPath(); ctx.moveTo(s[0] - 6, s[1]); ctx.quadraticCurveTo(s[0] - 4, s[1] + s[2], s[0], s[1] + s[2] + 2); ctx.quadraticCurveTo(s[0] + 4, s[1] + s[2], s[0] + 6, s[1]); ctx.closePath();
      fillInk(ctx, '#c3e6f5', 2);
    });
    // đom đóm lấp lánh trong hang
    for (var i = 0; i < 5; i++) {
      var a = 0.4 + 0.6 * Math.abs(Math.sin(t * 2 + i * 1.7));
      ctx.fillStyle = 'rgba(255,241,168,' + a.toFixed(2) + ')';
      circle(ctx, -22 + i * 11, -14 - (i % 2) * 12, 3); ctx.fill();
    }
    face(ctx, -36, -78, 0.8);
  });

  // Huy hiệu "Di sản thế giới": quả địa cầu cười + ngôi sao vàng + ruy băng.
  reg('heritage', function (ctx, t) {
    ctx.beginPath(); ctx.moveTo(-26, -36); ctx.lineTo(-36, 0); ctx.lineTo(-22, -8); ctx.lineTo(-12, 2); ctx.lineTo(-6, -34); ctx.closePath(); fillInk(ctx, '#e5484d', 2.5);
    ctx.beginPath(); ctx.moveTo(26, -36); ctx.lineTo(36, 0); ctx.lineTo(22, -8); ctx.lineTo(12, 2); ctx.lineTo(6, -34); ctx.closePath(); fillInk(ctx, '#e5484d', 2.5);
    circle(ctx, 0, -60, 34); fillInk(ctx, '#ffc94a');
    circle(ctx, 0, -60, 26); fillInk(ctx, '#5fc0e8', 2.5);
    ctx.fillStyle = '#7ccf5a';
    ctx.beginPath(); ctx.ellipse(-8, -68, 10, 7, 0.4, 0, TAU); ctx.ellipse(10, -52, 9, 6, -0.3, 0, TAU); ctx.fill();
    face(ctx, 0, -60, 0.9);
    // sao nhỏ xoay
    ctx.save(); ctx.translate(24, -88); ctx.rotate(t);
    ctx.beginPath();
    for (var i = 0; i < 10; i++) { var r = i % 2 ? 4 : 10, a = i * Math.PI / 5; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath(); fillInk(ctx, '#fff1a8', 2);
    ctx.restore();
  });

  // ===========================================================================
  // HUẾ
  // ===========================================================================
  // Ngọ Môn: cổng chính Hoàng thành Huế.
  reg('ngomon', function (ctx, t) {
    // bệ đá có 3 cửa vòm
    ctx.beginPath(); ctx.moveTo(-96, 0); ctx.lineTo(-90, -56); ctx.lineTo(90, -56); ctx.lineTo(96, 0); ctx.closePath(); fillInk(ctx, '#c9b48f');
    ctx.strokeStyle = 'rgba(23,35,61,0.2)'; ctx.lineWidth = 1.5;
    for (var r = 1; r < 4; r++) { ctx.beginPath(); ctx.moveTo(-93, -r * 14); ctx.lineTo(93, -r * 14); ctx.stroke(); }
    ctx.fillStyle = '#4a3b52';
    [[-56, 12], [0, 16], [56, 12]].forEach(function (g) {
      ctx.beginPath(); ctx.moveTo(g[0] - g[1], 0); ctx.lineTo(g[0] - g[1], -24); ctx.arc(g[0], -24, g[1], Math.PI, 0); ctx.lineTo(g[0] + g[1], 0); ctx.closePath(); ctx.fill();
    });
    // lầu Ngũ Phụng
    rr(ctx, -60, -84, 120, 28, 3); fillInk(ctx, '#e0453a');
    ctx.fillStyle = '#ffd23f'; for (var i = -2; i <= 2; i++) ctx.fillRect(i * 22 - 3, -80, 6, 22);
    curvedRoof(ctx, 0, -84, 136, 14, '#f2b53a');
    rr(ctx, -34, -112, 68, 16, 3); fillInk(ctx, '#e0453a', 2.5);
    curvedRoof(ctx, 0, -112, 86, 12, '#f2b53a');
    face(ctx, 0, -38, 1.1);
    // cờ bay
    var f = Math.sin(t * 4) * 4;
    ctx.beginPath(); ctx.moveTo(84, -56); ctx.lineTo(84, -120); ink(ctx, 3);
    ctx.beginPath(); ctx.moveTo(84, -120); ctx.quadraticCurveTo(98, -116 + f, 112, -114); ctx.lineTo(84, -102); ctx.closePath(); fillInk(ctx, '#ffd23f', 2);
  });

  // Thuyền rồng trên sông Hương.
  reg('dragonboat', function (ctx, t, o) {
    var bob = Math.sin(t * 2 + (o.phase || 0)) * 2.5;
    ctx.save(); ctx.translate(0, bob);
    // mái thuyền
    rr(ctx, -38, -50, 64, 26, 4); fillInk(ctx, '#e0453a');
    curvedRoof(ctx, -6, -50, 80, 12, '#f2b53a');
    // thân
    ctx.beginPath(); ctx.moveTo(-70, -26); ctx.lineTo(54, -26); ctx.quadraticCurveTo(48, 0, 30, 2); ctx.lineTo(-52, 2); ctx.quadraticCurveTo(-66, -10, -70, -26); ctx.closePath();
    fillInk(ctx, '#3fa36b');
    ctx.fillStyle = '#ffd23f'; for (var i = 0; i < 6; i++) { circle(ctx, -50 + i * 18, -14, 3.5); ctx.fill(); }
    // đầu rồng
    ctx.beginPath(); ctx.moveTo(50, -26); ctx.quadraticCurveTo(62, -60, 82, -62); ctx.quadraticCurveTo(96, -56, 90, -46); ctx.quadraticCurveTo(76, -44, 66, -24); ctx.closePath();
    fillInk(ctx, '#ffc94a');
    ctx.fillStyle = INK; circle(ctx, 80, -55, 2.6); ctx.fill();
    ctx.beginPath(); ctx.moveTo(74, -62); ctx.quadraticCurveTo(70, -76, 62, -78); ink(ctx, 2.5);
    // đuôi rồng
    ctx.beginPath(); ctx.moveTo(-70, -26); ctx.quadraticCurveTo(-84, -40, -80, -56); ctx.quadraticCurveTo(-74, -44, -62, -30); ctx.closePath(); fillInk(ctx, '#ffc94a', 2.5);
    face(ctx, -6, -37, 0.8);
    ctx.restore();
  });

  // Nón lá có mặt cười (nón bài thơ xứ Huế).
  reg('nonla', function (ctx, t, o) {
    var tilt = Math.sin(t * 2) * 0.05;
    ctx.save(); ctx.rotate(tilt);
    // quai nón
    ctx.beginPath(); ctx.moveTo(-26, -14); ctx.quadraticCurveTo(0, 18, 26, -14); ctx.strokeStyle = o.strap || '#e5484d'; ctx.lineWidth = 4; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-54, -14); ctx.quadraticCurveTo(0, -4, 54, -14); ctx.lineTo(2, -78); ctx.lineTo(-2, -78); ctx.closePath();
    fillInk(ctx, '#f3dc9b');
    ctx.strokeStyle = 'rgba(160,120,50,0.6)'; ctx.lineWidth = 1.6;
    for (var i = 1; i < 5; i++) {
      var k = i / 5, y = -78 + k * 62;
      ctx.beginPath(); ctx.moveTo(-54 * k, y); ctx.quadraticCurveTo(0, y + 8 * k, 54 * k, y); ctx.stroke();
    }
    face(ctx, 0, -32, 1);
    ctx.restore();
  });

  // Tháp Phước Duyên 7 tầng (chùa Thiên Mụ).
  reg('pagoda7', function (ctx) {
    for (var i = 0; i < 7; i++) {
      var w = 52 - i * 5.5, h = 17, y = -i * h;
      rr(ctx, -w / 2, y - h, w, h, 2); fillInk(ctx, '#ead2a8', 2.5);
      ctx.beginPath(); ctx.moveTo(-w / 2 - 6, y - h + 2); ctx.lineTo(w / 2 + 6, y - h + 2); ctx.lineTo(w / 2 - 2, y - h - 3); ctx.lineTo(-w / 2 + 2, y - h - 3); ctx.closePath();
      fillInk(ctx, '#9a5b3a', 2);
      ctx.fillStyle = '#5b4636'; rr(ctx, -3, y - h + 5, 6, 9, 2); ctx.fill();
    }
    ctx.beginPath(); ctx.moveTo(0, -122); ctx.lineTo(0, -138); ink(ctx, 3);
    circle(ctx, 0, -140, 4); fillInk(ctx, '#ffd23f', 2);
    face(ctx, 0, -28, 0.75);
  });

  // Sao la: thú rất hiếm, hai sừng dài thẳng, mặt có đốm trắng.
  reg('saola', function (ctx, t) {
    var blink = Math.sin(t * 1.3) > 0.97;
    // chân
    ctx.fillStyle = '#5b3a24';
    [-24, -12, 14, 26].forEach(function (x) { rr(ctx, x - 3, -30, 7, 30, 3); fillInk(ctx, '#6b4a30', 2); });
    // thân
    ctx.beginPath(); ctx.ellipse(0, -44, 36, 20, 0, 0, TAU); fillInk(ctx, '#8a5a32');
    ctx.fillStyle = '#6b4a30'; ctx.beginPath(); ctx.ellipse(-4, -54, 26, 6, 0, 0, TAU); ctx.fill();
    // đuôi
    ctx.beginPath(); ctx.moveTo(-34, -50); ctx.quadraticCurveTo(-44, -46, -42, -36); ink(ctx, 4);
    // cổ + đầu
    ctx.beginPath(); ctx.moveTo(22, -56); ctx.lineTo(36, -76); ctx.lineTo(48, -70); ctx.lineTo(34, -46); ctx.closePath(); fillInk(ctx, '#8a5a32');
    ctx.beginPath(); ctx.ellipse(46, -78, 15, 12, 0.3, 0, TAU); fillInk(ctx, '#8a5a32');
    // đốm trắng trên mặt (đặc trưng sao la)
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(52, -76, 5, 3.5, 0.3, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(44, -84, 4, 2.5, 0.3, 0, TAU); ctx.fill();
    // hai sừng dài thẳng hướng về sau
    ctx.beginPath(); ctx.moveTo(40, -88); ctx.lineTo(18, -120); ctx.moveTo(46, -89); ctx.lineTo(26, -122); ink(ctx, 4);
    // tai
    ctx.beginPath(); ctx.ellipse(34, -84, 8, 4, -0.6, 0, TAU); fillInk(ctx, '#a06c42', 2);
    // mắt + mũi
    ctx.fillStyle = INK;
    if (blink) { ctx.fillRect(46, -81, 6, 2); } else { circle(ctx, 49, -80, 2.6); ctx.fill(); }
    circle(ctx, 60, -74, 2); ctx.fill();
    ctx.beginPath(); ctx.arc(54, -72, 3.5, 0.2, Math.PI - 0.6); ink(ctx, 1.8);
    ctx.fillStyle = 'rgba(255,120,150,0.55)'; circle(ctx, 44, -72, 3); ctx.fill();
  });

  // ===========================================================================
  // HỘI AN
  // ===========================================================================
  var LANTERN_COLORS = ['#e5484d', '#ffc94a', '#ff8fb1', '#7ccf5a', '#c77dff', '#ff9f43'];
  // Một đèn lồng: tâm (cx, cy), r = bán kính, màu c. Có mặt khi withFace.
  function lantern(ctx, cx, cy, r, c, t, withFace) {
    // quầng sáng
    ctx.fillStyle = 'rgba(255,220,120,0.25)';
    circle(ctx, cx, cy, r * 1.8 + Math.sin(t * 3 + cx) * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 1.1, 0, 0, TAU); fillInk(ctx, c, Math.max(2, r / 7));
    ctx.strokeStyle = 'rgba(23,35,61,0.35)'; ctx.lineWidth = Math.max(1, r / 12);
    ctx.beginPath(); ctx.ellipse(cx, cy, r * 0.5, r * 1.1, 0, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#f2b53a';
    rr(ctx, cx - r * 0.45, cy - r * 1.25, r * 0.9, r * 0.3, 2); ctx.fill();
    rr(ctx, cx - r * 0.45, cy + r * 0.95, r * 0.9, r * 0.3, 2); ctx.fill();
    ctx.strokeStyle = c; ctx.lineWidth = Math.max(1.5, r / 8);
    ctx.beginPath(); ctx.moveTo(cx, cy + r * 1.25); ctx.lineTo(cx, cy + r * 1.7); ctx.stroke();
    if (withFace) face(ctx, cx, cy - r * 0.1, r / 16);
  }
  // Đèn lồng đơn (dùng cho thẻ). Gốc = đáy tua.
  reg('lantern', function (ctx, t, o) {
    var sw = Math.sin(t * 2) * 0.08;
    ctx.save(); ctx.rotate(sw);
    ctx.beginPath(); ctx.moveTo(0, -110); ctx.lineTo(0, -88); ink(ctx, 3);
    lantern(ctx, 0, -52, 30, o.color || '#e5484d', t, true);
    ctx.restore();
  });
  // Cột gỗ treo dây đèn lồng.
  reg('lanternpost', function (ctx, t, o) {
    rr(ctx, -5, -150, 10, 150, 4); fillInk(ctx, '#7a4a2b');
    ctx.beginPath(); ctx.moveTo(0, -144); ctx.lineTo(70, -144); ink(ctx, 4);
    var base = o.offset || 0;
    for (var i = 0; i < 3; i++) {
      var x = 18 + i * 22, sw = Math.sin(t * 2 + i) * 2;
      ctx.beginPath(); ctx.moveTo(x, -144); ctx.lineTo(x + sw, -128 + (i % 2) * 8); ink(ctx, 1.5);
      lantern(ctx, x + sw, -112 + (i % 2) * 8, 9, LANTERN_COLORS[(i + base) % LANTERN_COLORS.length], t, i === 1);
    }
  });

  // Chùa Cầu Hội An.
  reg('chuacau', function (ctx, t) {
    // vòm cầu
    ctx.beginPath(); ctx.moveTo(-90, 0); ctx.lineTo(-90, -34); ctx.lineTo(90, -34); ctx.lineTo(90, 0); ctx.lineTo(54, 0);
    ctx.quadraticCurveTo(0, -40, -54, 0); ctx.closePath(); fillInk(ctx, '#c9b48f');
    // nhà cầu
    rr(ctx, -80, -70, 160, 36, 3); fillInk(ctx, '#a0522d');
    ctx.fillStyle = '#ffd99a';
    for (var i = -3; i <= 3; i++) { rr(ctx, i * 22 - 7, -64, 14, 18, 3); ctx.fill(); }
    curvedRoof(ctx, 0, -70, 180, 18, '#c0503a');
    // mái nhỏ giữa (chùa)
    rr(ctx, -22, -104, 44, 18, 3); fillInk(ctx, '#a0522d', 2.5);
    curvedRoof(ctx, 0, -104, 64, 14, '#c0503a');
    ctx.fillStyle = '#ffd23f'; rr(ctx, -12, -100, 24, 10, 2); ctx.fill();
    // 2 đèn lồng
    lantern(ctx, -60, -26, 7, '#e5484d', t, false);
    lantern(ctx, 60, -26, 7, '#ffc94a', t, false);
    face(ctx, 0, -18, 1);
  });

  // Nhà tường vàng phố cổ Hội An (hoa giấy hồng + đèn lồng hiên).
  reg('yellowhouse', function (ctx, t, o) {
    var w = o.w || 110, h = o.h || 90;
    rr(ctx, -w / 2, -h, w, h, 3); fillInk(ctx, o.color || '#f6c945');
    ctx.fillStyle = 'rgba(200,140,40,0.25)'; ctx.fillRect(-w / 2 + 3, -18, w - 6, 15);
    // mái ngói
    curvedRoof(ctx, 0, -h, w + 16, 22, '#a8553e');
    ctx.strokeStyle = 'rgba(23,35,61,0.35)'; ctx.lineWidth = 1.5;
    for (var x = -w / 2; x < w / 2; x += 9) { ctx.beginPath(); ctx.moveTo(x, -h - 2); ctx.lineTo(x + 3, -h - 18); ctx.stroke(); }
    // cửa gỗ + cửa sổ
    rr(ctx, -16, -48, 32, 48, 3); fillInk(ctx, '#6b3f22', 2.5);
    rr(ctx, -w / 2 + 10, -66, 22, 22, 3); fillInk(ctx, '#2a7f62', 2.5);
    rr(ctx, w / 2 - 32, -66, 22, 22, 3); fillInk(ctx, '#2a7f62', 2.5);
    // hoa giấy
    ctx.fillStyle = '#ff5fa2';
    for (var i = 0; i < 9; i++) { circle(ctx, w / 2 - 6 - (i % 3) * 7, -h + 8 + Math.floor(i / 3) * 8, 5); ctx.fill(); }
    ctx.fillStyle = '#4fae5a'; circle(ctx, w / 2 - 22, -h + 22, 4); ctx.fill();
    // đèn lồng dưới hiên
    lantern(ctx, -w / 2 + 22, -h + 22, 7, LANTERN_COLORS[(o.c || 0) % 6], t, false);
    lantern(ctx, 0, -h + 22, 7, LANTERN_COLORS[((o.c || 0) + 1) % 6], t, false);
    face(ctx, 0, -60, 0.85);
  });

  // Voọc chà vá chân nâu ("nữ hoàng linh trưởng").
  reg('douc', function (ctx, t) {
    var sw = Math.sin(t * 2) * 6;
    // đuôi trắng dài
    ctx.beginPath(); ctx.moveTo(-14, -18); ctx.quadraticCurveTo(-46, -10 + sw, -40, 0 + sw); ink(ctx, 7);
    ctx.beginPath(); ctx.moveTo(-14, -18); ctx.quadraticCurveTo(-46, -10 + sw, -40, 0 + sw); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3.5; ctx.stroke();
    // chân nâu đỏ (đặc trưng)
    ctx.beginPath(); ctx.ellipse(-12, -10, 9, 12, 0.3, 0, TAU); fillInk(ctx, '#9b2f2f', 2.5);
    ctx.beginPath(); ctx.ellipse(14, -10, 9, 12, -0.3, 0, TAU); fillInk(ctx, '#9b2f2f', 2.5);
    ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(-16, -1, 7, 3, 0, 0, TAU); ctx.ellipse(18, -1, 7, 3, 0, 0, TAU); ctx.fill();
    // thân xám
    ctx.beginPath(); ctx.ellipse(0, -36, 22, 26, 0, 0, TAU); fillInk(ctx, '#8d93a3');
    // tay trắng
    ctx.beginPath(); ctx.ellipse(-22, -34, 6, 14, 0.4, 0, TAU); fillInk(ctx, '#ffffff', 2.5);
    ctx.beginPath(); ctx.ellipse(22, -34, 6, 14, -0.4, 0, TAU); fillInk(ctx, '#ffffff', 2.5);
    // đầu: râu trắng quanh mặt vàng cam
    circle(ctx, 0, -72, 20); fillInk(ctx, '#ffffff');
    ctx.beginPath(); ctx.ellipse(0, -70, 13, 14, 0, 0, TAU); fillInk(ctx, '#f7b84b', 2.5);
    ctx.beginPath(); ctx.arc(0, -78, 19, Math.PI * 1.08, Math.PI * 1.92); ctx.lineTo(0, -88); ctx.closePath(); fillInk(ctx, '#3b3f4f', 2);
    face(ctx, 0, -72, 0.8);
  });

  // ===========================================================================
  // TP. HỒ CHÍ MINH
  // ===========================================================================
  // Chợ Bến Thành: tháp đồng hồ có mặt đồng hồ là khuôn mặt cười.
  reg('benthanh', function (ctx, t) {
    // hai cánh chợ
    rr(ctx, -120, -54, 240, 54, 3); fillInk(ctx, '#f0e0b8');
    ctx.beginPath(); ctx.moveTo(-126, -54); ctx.lineTo(126, -54); ctx.lineTo(112, -70); ctx.lineTo(-112, -70); ctx.closePath(); fillInk(ctx, '#b5523b');
    ctx.fillStyle = '#7a4a2b';
    for (var i = -4; i <= 4; i++) { if (i === 0) continue; rr(ctx, i * 24 - 7, -42, 14, 26, 6); ctx.fill(); }
    // tháp đồng hồ
    rr(ctx, -26, -128, 52, 128, 3); fillInk(ctx, '#f6e7c1');
    ctx.beginPath(); ctx.moveTo(-32, -128); ctx.lineTo(32, -128); ctx.lineTo(0, -150); ctx.closePath(); fillInk(ctx, '#b5523b');
    rr(ctx, -12, -36, 24, 36, 10); fillInk(ctx, '#7a4a2b', 2.5);
    circle(ctx, 0, -98, 18); fillInk(ctx, '#ffffff');
    // kim đồng hồ quay chậm
    ctx.save(); ctx.translate(0, -98);
    ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(t * 0.5 - 1.6) * 9, Math.sin(t * 0.5 - 1.6) * 9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(t * 2) * 13, Math.sin(t * 2) * 13); ctx.stroke();
    ctx.restore();
    face(ctx, 0, -64, 1);
    ctx.fillStyle = '#e5484d'; rr(ctx, -50, -66, 22, 8, 2); ctx.fill(); rr(ctx, 28, -66, 22, 8, 2); ctx.fill();
  });

  // Ổ bánh mì giòn có mặt cười.
  reg('banhmi', function (ctx, t) {
    ctx.save(); ctx.rotate(-0.12);
    ctx.beginPath(); ctx.ellipse(0, -30, 54, 22, 0, 0, TAU); fillInk(ctx, '#e3a24a');
    // nhân: rau, dưa leo, thịt
    ctx.beginPath(); ctx.moveTo(-46, -30); ctx.quadraticCurveTo(0, -18, 46, -30); ctx.lineTo(46, -24); ctx.quadraticCurveTo(0, -10, -46, -24); ctx.closePath();
    fillInk(ctx, '#7ccf5a', 2);
    ctx.fillStyle = '#e8737a'; for (var i = -3; i <= 3; i++) { ctx.beginPath(); ctx.ellipse(i * 12, -22, 5, 3, 0, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#ff9f43'; for (var k = -2; k <= 2; k++) ctx.fillRect(k * 14 - 1, -27, 8, 3);
    // khía vỏ
    ctx.strokeStyle = '#b8752c'; ctx.lineWidth = 3;
    for (var j = -2; j <= 2; j++) { ctx.beginPath(); ctx.moveTo(j * 16 - 6, -46); ctx.lineTo(j * 16 + 6, -40); ctx.stroke(); }
    face(ctx, 0, -38, 0.95);
    ctx.restore();
    // vụn giòn rơi
    ctx.fillStyle = '#e3a24a';
    for (var c = 0; c < 3; c++) { var k2 = (t * 0.8 + c / 3) % 1; circle(ctx, -20 + c * 20, -6 + k2 * 10, 2); ctx.fill(); }
  });

  // Xe bánh mì có ô che.
  reg('banhmicart', function (ctx, t) {
    circle(ctx, -26, -12, 12); fillInk(ctx, '#3b3f4f'); circle(ctx, 26, -12, 12); fillInk(ctx, '#3b3f4f');
    rr(ctx, -44, -60, 88, 42, 6); fillInk(ctx, '#f2f6ff');
    ctx.fillStyle = 'rgba(95,192,232,0.35)'; rr(ctx, -38, -56, 76, 20, 4); ctx.fill();
    ctx.fillStyle = '#e3a24a'; for (var i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(-24 + i * 16, -46, 8, 4, 0.2, 0, TAU); ctx.fill(); }
    face(ctx, 0, -28, 0.9);
    ctx.beginPath(); ctx.moveTo(0, -60); ctx.lineTo(0, -98); ink(ctx, 3);
    ctx.beginPath(); ctx.moveTo(-50, -94); ctx.quadraticCurveTo(0, -124, 50, -94); ctx.closePath(); fillInk(ctx, '#e5484d');
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(-17, -102); ctx.quadraticCurveTo(0, -122, 17, -102); ctx.lineTo(0, -96); ctx.closePath(); ctx.fill();
  });

  // Xe máy có đèn pha là khuôn mặt (opts.color).
  reg('scooter', function (ctx, t, o) {
    var c = o.color || '#5fc0e8', bump = Math.abs(Math.sin(t * 8)) * 1.5;
    circle(ctx, -32, -14, 14); fillInk(ctx, '#3b3f4f'); circle(ctx, 34, -14, 14); fillInk(ctx, '#3b3f4f');
    ctx.fillStyle = '#d7dce4'; circle(ctx, -32, -14, 5); ctx.fill(); circle(ctx, 34, -14, 5); ctx.fill();
    ctx.save(); ctx.translate(0, -bump);
    ctx.beginPath(); ctx.moveTo(-50, -22); ctx.quadraticCurveTo(-50, -48, -24, -48); ctx.lineTo(4, -48); ctx.lineTo(10, -28); ctx.lineTo(22, -28); ctx.lineTo(30, -66); ctx.lineTo(42, -66); ctx.lineTo(44, -22); ctx.closePath();
    fillInk(ctx, c);
    rr(ctx, -44, -58, 40, 10, 5); fillInk(ctx, '#3b3f4f', 2.5);
    ctx.beginPath(); ctx.moveTo(34, -66); ctx.lineTo(28, -80); ctx.lineTo(44, -82); ink(ctx, 3.5);
    circle(ctx, 44, -52, 9); fillInk(ctx, '#fff1a8', 2.5);
    face(ctx, -18, -34, 0.8);
    ctx.restore();
  });

  // Khỉ ở rừng ngập mặn Cần Giờ.
  reg('monkey', function (ctx, t) {
    // rễ đước
    ctx.strokeStyle = '#7a4a2b'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    for (var i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 6, -22); ctx.quadraticCurveTo(i * 18, -12, i * 22, 0); ctx.stroke(); }
    ctx.beginPath(); ctx.ellipse(0, -2, 50, 6, 0, 0, TAU); fillInk(ctx, '#5fc0e8', 2);
    var sw = Math.sin(t * 3) * 0.15;
    ctx.save(); ctx.translate(0, -22);
    ctx.beginPath(); ctx.moveTo(14, -10); ctx.bezierCurveTo(40, -10, 40, -40, 26, -46); ink(ctx, 5);
    ctx.beginPath(); ctx.ellipse(0, -22, 18, 20, 0, 0, TAU); fillInk(ctx, '#a8784a');
    ctx.save(); ctx.translate(-16, -30); ctx.rotate(-1.2 + sw);
    ctx.beginPath(); ctx.ellipse(0, -10, 5, 12, 0, 0, TAU); fillInk(ctx, '#a8784a', 2.5);
    circle(ctx, 0, -24, 7); fillInk(ctx, '#ffc94a', 2); // quả chuối/trái cây nhỏ
    ctx.restore();
    circle(ctx, -18, -58, 7); fillInk(ctx, '#e8b98a', 2.5); circle(ctx, 18, -58, 7); fillInk(ctx, '#e8b98a', 2.5);
    circle(ctx, 0, -56, 17); fillInk(ctx, '#a8784a');
    ctx.beginPath(); ctx.ellipse(0, -52, 12, 10, 0, 0, TAU); fillInk(ctx, '#f0c9a0', 2);
    face(ctx, 0, -55, 0.8);
    ctx.restore();
  });

  // ===========================================================================
  // MIỀN TÂY
  // ===========================================================================
  // Cây dừa nghiêng có trái dừa mặt cười.
  reg('coconut', function (ctx, t, o) {
    var lean = o.lean == null ? 1 : o.lean, sw = Math.sin(t * 1.5) * 3;
    ctx.save(); ctx.scale(lean, 1);
    ctx.beginPath(); ctx.moveTo(-6, 0); ctx.quadraticCurveTo(-4, -70, 18, -128); ctx.lineTo(28, -126); ctx.quadraticCurveTo(8, -70, 8, 0); ctx.closePath();
    fillInk(ctx, '#a8784a');
    ctx.strokeStyle = 'rgba(23,35,61,0.3)'; ctx.lineWidth = 1.5;
    for (var i = 1; i < 8; i++) { var y = -i * 15; ctx.beginPath(); ctx.moveTo(-4 + i * 1.5, y); ctx.lineTo(8 + i * 1.8, y - 2); ctx.stroke(); }
    ctx.translate(22, -128);
    var leaves = [-2.8, -2.1, -1.4, -0.7, -0.1, 0.5];
    leaves.forEach(function (a, k) {
      ctx.save(); ctx.rotate(a + Math.sin(t * 1.5 + k) * 0.06);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(30, -18 + sw, 62, 6); ctx.quadraticCurveTo(30, -2, 0, 0); ctx.closePath();
      fillInk(ctx, k % 2 ? '#4fae5a' : '#3f9a4c', 2.5);
      ctx.restore();
    });
    circle(ctx, -6, 8, 9); fillInk(ctx, '#6b8f3a', 2.5); circle(ctx, 8, 10, 9); fillInk(ctx, '#7ca346', 2.5);
    face(ctx, 8, 10, 0.5);
    ctx.restore();
  });

  // Đống trái cây nhiệt đới: thanh long, xoài, chôm chôm, dưa hấu.
  function fruitPile(ctx, t) {
    // dưa hấu
    circle(ctx, 30, -18, 18); fillInk(ctx, '#3f9a4c');
    ctx.strokeStyle = '#2b6b25'; ctx.lineWidth = 2;
    for (var i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(30 + i * 8, -34); ctx.quadraticCurveTo(30 + i * 12, -18, 30 + i * 8, -2); ctx.stroke(); }
    // xoài
    ctx.beginPath(); ctx.ellipse(-30, -14, 16, 11, -0.3, 0, TAU); fillInk(ctx, '#ffc94a');
    // chôm chôm (lông xù)
    ctx.strokeStyle = '#2f9a45'; ctx.lineWidth = 2;
    for (var k = 0; k < 12; k++) { var a = k * TAU / 12; ctx.beginPath(); ctx.moveTo(-8 + Math.cos(a) * 10, -12 + Math.sin(a) * 10); ctx.lineTo(-8 + Math.cos(a) * 15, -12 + Math.sin(a) * 15); ctx.stroke(); }
    circle(ctx, -8, -12, 11); fillInk(ctx, '#e5484d', 2.5);
    // thanh long (có mặt)
    ctx.beginPath(); ctx.ellipse(4, -40, 20, 24, 0, 0, TAU); fillInk(ctx, '#ff5fa2');
    ctx.fillStyle = '#7ccf5a';
    [[-14, -50, -0.8], [18, -48, 0.8], [-10, -26, -0.6], [16, -28, 0.6], [4, -66, 0]].forEach(function (f) {
      ctx.save(); ctx.translate(f[0], f[1]); ctx.rotate(f[2]); ctx.beginPath(); ctx.ellipse(0, -4, 4, 9, 0, 0, TAU); fillInk(ctx, '#7ccf5a', 2); ctx.restore();
    });
    face(ctx, 4, -40, 0.9);
  }
  reg('fruits', function (ctx, t) {
    // rổ tre
    ctx.beginPath(); ctx.moveTo(-50, -18); ctx.lineTo(50, -18); ctx.lineTo(40, 0); ctx.lineTo(-40, 0); ctx.closePath(); fillInk(ctx, '#d9a066');
    ctx.save(); ctx.translate(0, -12); fruitPile(ctx, t); ctx.restore();
    ctx.strokeStyle = 'rgba(23,35,61,0.35)'; ctx.lineWidth = 1.5;
    for (var i = -4; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(i * 10, -16); ctx.lineTo(i * 9, -2); ctx.stroke(); }
  });

  // Thuyền chợ nổi có cây bẹo treo hàng.
  reg('floatboat', function (ctx, t, o) {
    var bob = Math.sin(t * 2 + (o.phase || 0)) * 3;
    ctx.save(); ctx.translate(0, bob);
    // cây bẹo + quả treo
    ctx.beginPath(); ctx.moveTo(-34, -24); ctx.lineTo(-34, -140); ink(ctx, 4);
    var hang = o.hang || ['#ffc94a', '#3f9a4c', '#ff5fa2'];
    hang.forEach(function (c, i) {
      var y = -128 + i * 22, sw = Math.sin(t * 2 + i) * 2;
      ctx.beginPath(); ctx.moveTo(-34, y - 8); ctx.lineTo(-34 + sw, y); ink(ctx, 1.5);
      circle(ctx, -34 + sw, y + 6, 8); fillInk(ctx, c, 2);
    });
    // hàng trên thuyền
    ctx.save(); ctx.translate(14, -24); ctx.scale(0.75, 0.75); fruitPile(ctx, t); ctx.restore();
    // thân thuyền gỗ
    ctx.beginPath(); ctx.moveTo(-70, -30); ctx.lineTo(70, -30); ctx.quadraticCurveTo(62, 0, 40, 2); ctx.lineTo(-40, 2); ctx.quadraticCurveTo(-62, 0, -70, -30); ctx.closePath();
    fillInk(ctx, '#8d5524');
    ctx.fillStyle = '#5b3416'; ctx.fillRect(-60, -24, 120, 3);
    // mắt thuyền (truyền thống) + miệng cười
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(54, -18, 7, 5, 0, 0, TAU); ctx.fill(); ink(ctx, 2);
    ctx.fillStyle = INK; circle(ctx, 56, -18, 2.6); ctx.fill();
    face(ctx, 0, -12, 0.85);
    ctx.restore();
  });

  // Cây lúa chín vàng.
  reg('rice', function (ctx, t) {
    ctx.translate(-8, 0);
    for (var i = -3; i <= 3; i++) {
      var sw = Math.sin(t * 2 + i) * 4, x = i * 12;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.quadraticCurveTo(x + sw * 0.5, -40, x + sw + 8, -70); ink(ctx, 3);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.quadraticCurveTo(x + sw * 0.5, -40, x + sw + 8, -70); ctx.strokeStyle = '#7ccf5a'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#f2c14e';
      for (var k = 0; k < 4; k++) { ctx.beginPath(); ctx.ellipse(x + sw + 10 + k * 2, -66 + k * 7, 3, 5, 0.5, 0, TAU); ctx.fill(); }
    }
    // hạt gạo cười
    ctx.beginPath(); ctx.ellipse(0, -18, 14, 20, 0, 0, TAU); fillInk(ctx, '#ffffff');
    face(ctx, 0, -18, 0.75);
  });

  // Rồng con dễ thương (Cửu Long = chín con rồng).
  reg('dragon', function (ctx, t) {
    var w = Math.sin(t * 3) * 4;
    ctx.beginPath(); ctx.moveTo(-60, -20);
    ctx.bezierCurveTo(-40, -50 + w, -20, 10 - w, 0, -24); ctx.bezierCurveTo(14, -48 + w, 30, -30, 34, -44);
    ctx.lineTo(42, -38); ctx.bezierCurveTo(32, -18, 16, -34, 4, -10); ctx.bezierCurveTo(-16, 22 - w, -40, -30 + w, -56, -8); ctx.closePath();
    fillInk(ctx, '#3fbf8a');
    ctx.fillStyle = '#ffd23f';
    for (var i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(-48 + i * 18, -30 + (i % 2) * 10); ctx.lineTo(-44 + i * 18, -40 + (i % 2) * 10); ctx.lineTo(-40 + i * 18, -30 + (i % 2) * 10); ctx.fill(); }
    circle(ctx, 46, -48, 16); fillInk(ctx, '#3fbf8a');
    ctx.beginPath(); ctx.moveTo(40, -62); ctx.lineTo(34, -76); ctx.moveTo(50, -62); ctx.lineTo(54, -78); ink(ctx, 3);
    face(ctx, 48, -48, 0.8);
  });

  // ===========================================================================
  // LỚP PARALLAX (không gian màn hình, rộng 960)
  // ===========================================================================
  var W = OG.W || 960, H = OG.H || 540;

  // Mặt nước: {y, color, parallax, shine}
  S.registerLayer('vietnam-water', function (ctx, L, cam, t) {
    var px = L.parallax == null ? 0.4 : L.parallax, y = L.y == null ? 440 : L.y;
    ctx.fillStyle = L.color || '#4fb3e8';
    ctx.beginPath(); ctx.moveTo(0, H);
    for (var x = 0; x <= W; x += 12) ctx.lineTo(x, y + Math.sin((x + cam * px) / 38 + t * 1.6) * 4);
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = L.shine || 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    for (var i = 0; i < 14; i++) {
      var sx = wrap(i * 137 - cam * px, W + 60) - 30, sy = y + 12 + (i % 4) * 9;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 16 + (i % 3) * 6, sy); ctx.stroke();
    }
  });

  // Hàng decor lặp (nhiều kiểu xen kẽ): {items:[{kind, scale, opts, dy}], y, spacing, parallax, scale}
  // 💡 Khái niệm: parallax + culling — lớp dịch theo cam × px (px < 1 → trôi chậm hơn sàn, trông xa hơn) và chỉ
  //   vẽ các ô i nằm trong khung 960 px (first .. first + W/span + 3) thay vì mọi ô của cả màn.
  //   items lặp vòng theo chỉ số ô (i mod số item) nên cùng một ô luôn ra cùng một decor khi camera di chuyển.
  S.registerLayer('vietnam-row', function (ctx, L, cam, t) {
    var px = L.parallax == null ? 0.3 : L.parallax, span = L.spacing || 240, y = L.y == null ? 440 : L.y;
    var items = L.items || [{ kind: 'tree' }];
    var shift = cam * px, first = Math.floor(shift / span) - 1;
    for (var i = first; i < first + W / span + 3; i++) {
      var it = items[((i % items.length) + items.length) % items.length];
      var x = i * span - shift + (L.offset || 0);
      var fn = D[it.kind];
      var sc = (it.scale || 1) * (L.scale || 1);
      if (fn) fn(ctx, x, y + (it.dy || 0), sc, t, it.opts || {});
      else S.drawDecor(ctx, it.kind, x, y + (it.dy || 0), sc, t, it.opts || {});
    }
  });

  // Dãy núi đá vôi Hạ Long: {y, color, green, parallax, spacing, minH, maxH, faces}
  S.registerLayer('vietnam-karsts', function (ctx, L, cam, t) {
    var px = L.parallax == null ? 0.2 : L.parallax, span = L.spacing || 170, y = L.y == null ? 440 : L.y;
    var minH = L.minH || 80, maxH = L.maxH || 170;
    var shift = cam * px, first = Math.floor(shift / span) - 1;
    for (var i = first; i < first + W / span + 3; i++) {
      var r = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1; // giả ngẫu nhiên ổn định theo i
      var h = minH + (maxH - minH) * r, w = 30 + 26 * ((r * 7) % 1);
      D.karst(ctx, i * span - shift + r * 40, y, 1, t, { h: h, w: w, color: L.color, green: L.green, face: !!L.faces && i % 3 === 0, flat: L.flat, lw: L.lw });
    }
  });

  // Đường chân trời TP. Hồ Chí Minh (có toà tháp búp sen).
  S.registerLayer('vietnam-skyline', function (ctx, L, cam, t) {
    var px = L.parallax == null ? 0.15 : L.parallax, span = 120, y = L.y == null ? 450 : L.y;
    var cols = L.colors || ['#9fc3e6', '#b6d3ee', '#8db5dc'];
    var shift = cam * px, first = Math.floor(shift / span) - 1;
    for (var i = first; i < first + W / span + 3; i++) {
      var r = Math.abs(Math.sin(i * 78.233) * 12345.678) % 1;
      var x = i * span - shift, h = 120 + r * 150, w = 70 + r * 30;
      if (((i % 7) + 7) % 7 === 3) {
        // toà tháp búp sen
        ctx.beginPath(); ctx.moveTo(x + 10, y); ctx.lineTo(x + 18, y - 250); ctx.quadraticCurveTo(x + 40, y - 290, x + 62, y - 250); ctx.lineTo(x + 70, y); ctx.closePath();
        fillInk(ctx, '#7fa8d6', 2.5);
        ctx.beginPath(); ctx.ellipse(x + 76, y - 190, 18, 5, 0, 0, TAU); fillInk(ctx, '#7fa8d6', 2);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        for (var k = 0; k < 10; k++) ctx.fillRect(x + 24, y - 230 + k * 22, 32, 4);
        face(ctx, x + 40, y - 120, 1.1);
        continue;
      }
      rr(ctx, x, y - h, w, h, 6); fillInk(ctx, cols[((i % cols.length) + cols.length) % cols.length], 2.5);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      for (var row = 0; row < h / 26 - 1; row++) for (var c = 0; c < 3; c++) {
        if ((row + c + i) % 4 === 0) continue;
        ctx.fillRect(x + 10 + c * (w - 20) / 3, y - h + 14 + row * 26, (w - 20) / 3 - 8, 12);
      }
    }
  });

  // Ruộng lúa bậc thấp: {y, parallax}
  S.registerLayer('vietnam-ricefield', function (ctx, L, cam, t) {
    var y = L.y == null ? 400 : L.y, px = L.parallax == null ? 0.25 : L.parallax;
    var bands = ['#9be36b', '#7ccf5a', '#b6ec7a', '#6cc35a'];
    for (var b = 0; b < bands.length; b++) {
      ctx.fillStyle = bands[b];
      ctx.fillRect(0, y + b * 14, W, 15);
    }
    ctx.strokeStyle = 'rgba(47,107,38,0.45)'; ctx.lineWidth = 2;
    for (var i = 0; i < 40; i++) {
      var x = wrap(i * 31 - cam * px, W + 20) - 10, yy = y + 6 + (i % 4) * 14;
      ctx.beginPath(); ctx.moveTo(x, yy + 6); ctx.lineTo(x - 3, yy - 2); ctx.moveTo(x, yy + 6); ctx.lineTo(x + 3, yy - 2); ctx.stroke();
    }
  });

  // Trần hang có nhũ đá + đốm sáng lấp lánh: {color, parallax}
  S.registerLayer('vietnam-stalactites', function (ctx, L, cam, t) {
    var px = L.parallax == null ? 0.3 : L.parallax;
    ctx.fillStyle = L.color || '#4a4f86';
    ctx.fillRect(0, 0, W, 26);
    for (var i = 0; i < 16; i++) {
      var x = wrap(i * 83 - cam * px, W + 100) - 50, len = 40 + ((i * 37) % 80);
      ctx.beginPath(); ctx.moveTo(x - 24, 20); ctx.quadraticCurveTo(x - 6, len * 0.6, x, len); ctx.quadraticCurveTo(x + 6, len * 0.6, x + 24, 20); ctx.closePath();
      fillInk(ctx, L.color || '#4a4f86', 2.5);
      if (i % 4 === 0) face(ctx, x, 30 + len * 0.25, 0.7);
      var a = 0.4 + 0.6 * Math.abs(Math.sin(t * 2 + i));
      ctx.fillStyle = 'rgba(127,224,255,' + a.toFixed(2) + ')'; circle(ctx, x, len + 4, 3); ctx.fill();
    }
  });

  // Dây đèn lồng giăng ngang phố: {y, parallax, sag}
  S.registerLayer('vietnam-garland', function (ctx, L, cam, t) {
    var px = L.parallax == null ? 0.6 : L.parallax, span = L.spacing || 320, y = L.y == null ? 60 : L.y, sag = L.sag || 40;
    var shift = cam * px, first = Math.floor(shift / span) - 1;
    for (var i = first; i < first + W / span + 3; i++) {
      var x0 = i * span - shift, x1 = x0 + span;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.quadraticCurveTo((x0 + x1) / 2, y + sag * 2, x1, y); ink(ctx, 2);
      for (var k = 1; k < 6; k++) {
        var u = k / 6, lx = x0 + span * u, ly = y + sag * 4 * u * (1 - u);
        var sw = Math.sin(t * 2 + k + i) * 2;
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + sw, ly + 10); ink(ctx, 1.2);
        lantern(ctx, lx + sw, ly + 22, 9, LANTERN_COLORS[((i * 5 + k) % 6 + 6) % 6], t, k === 3);
      }
    }
  });

  // ===========================================================================
  // SÀN / BỤC theo chủ đề (drawCustom.platform). Trả true = đã vẽ.
  // style: {fill, top, topH, texture:'brick'|'stone'|'sand'|'tile'|'plank'|'mud'|'rock', ledgeFill, ledgeTop, ledgeTexture}
  // ===========================================================================
  function texture(ctx, kind, x, y, w, h, color) {
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2;
    var i, j;
    if (kind === 'brick' || kind === 'stone') {
      var bw = kind === 'brick' ? 34 : 56, bh = kind === 'brick' ? 14 : 20;
      for (j = 0; j * bh < h; j++) {
        ctx.beginPath(); ctx.moveTo(x, y + j * bh); ctx.lineTo(x + w, y + j * bh); ctx.stroke();
        var off = (j % 2) * bw / 2;
        for (i = Math.floor(x / bw) * bw - off; i < x + w; i += bw) { ctx.beginPath(); ctx.moveTo(i, y + j * bh); ctx.lineTo(i, y + (j + 1) * bh); ctx.stroke(); }
      }
    } else if (kind === 'tile') {
      for (i = Math.floor(x / 40) * 40; i < x + w; i += 40) { ctx.beginPath(); ctx.moveTo(i, y); ctx.lineTo(i, y + h); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(x, y + 22); ctx.lineTo(x + w, y + 22); ctx.stroke();
    } else if (kind === 'plank') {
      for (i = Math.floor(x / 46) * 46; i < x + w; i += 46) { ctx.beginPath(); ctx.moveTo(i, y); ctx.lineTo(i, y + h); ctx.stroke(); }
      for (i = Math.floor(x / 46) * 46 + 10; i < x + w; i += 46) { circle(ctx, i, y + h / 2 + 2, 1.6); ctx.fill(); }
    } else if (kind === 'sand' || kind === 'mud' || kind === 'rock') {
      for (i = Math.floor(x / 23) * 23; i < x + w; i += 23) {
        var k = Math.abs(Math.sin(i * 0.37)) * 1;
        circle(ctx, i + k * 10, y + 14 + k * (h - 22), kind === 'rock' ? 4 + k * 3 : 2 + k * 1.5); ctx.fill();
      }
    }
    ctx.restore();
  }
  // Tạo hàm drawCustom.platform từ bảng style st. a = Platform {x, y, w, h, isFloor} (thế giới, góc trên-trái);
  // sàn chính ở y = 480 nên y > 470 coi là sàn. Trả true = đã vẽ, bộ vẽ chung không vẽ đè.
  function platformFn(st) {
    return function (ctx, a, t) {
      var floor = a.isFloor || a.y > 470;
      if (floor) {
        ctx.fillStyle = st.fill; ctx.fillRect(a.x, a.y, a.w, a.h);
        texture(ctx, st.texture, a.x, a.y + (st.topH || 10), a.w, a.h, st.lines || 'rgba(23,35,61,0.18)');
        ctx.fillStyle = st.top; ctx.fillRect(a.x, a.y, a.w, st.topH || 10);
        ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(a.x, a.y, a.w, 3);
        ctx.strokeStyle = INK; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(a.x, a.y + 1.5); ctx.lineTo(a.x + a.w, a.y + 1.5); ctx.stroke();
        // mép hố bo tròn
        ctx.beginPath(); ctx.moveTo(a.x + 1.5, a.y); ctx.lineTo(a.x + 1.5, a.y + a.h); ctx.moveTo(a.x + a.w - 1.5, a.y); ctx.lineTo(a.x + a.w - 1.5, a.y + a.h); ctx.stroke();
      } else {
        rr(ctx, a.x, a.y, a.w, a.h + 4, 8);
        ctx.fillStyle = st.ledgeFill || st.fill; ctx.fill();
        ctx.save(); ctx.clip();
        texture(ctx, st.ledgeTexture || 'plank', a.x, a.y, a.w, a.h + 4, 'rgba(23,35,61,0.22)');
        ctx.fillStyle = st.ledgeTop || st.top; ctx.fillRect(a.x, a.y, a.w, 6);
        ctx.restore();
        rr(ctx, a.x, a.y, a.w, a.h + 4, 8); ink(ctx, 3);
        if (st.ledgeDeco === 'lantern') {
          lantern(ctx, a.x + 14, a.y + a.h + 16, 6, LANTERN_COLORS[Math.floor(a.x / 97) % 6], t, false);
          lantern(ctx, a.x + a.w - 14, a.y + a.h + 16, 6, LANTERN_COLORS[(Math.floor(a.x / 97) + 2) % 6], t, false);
        }
      }
      return true;
    };
  }
  // 💡 Khái niệm: hàm trợ giúp cho dữ liệu — 7 chủ đề đều cần platformStyle (dự phòng) + drawCustom.platform (vẽ
  //   thật) cùng một kiểu; theme() dựng cả hai từ bảng st ngắn gọn rồi mới registerTheme. Lưu ý: hàm SỬA def.
  /**
   * Hoàn thiện rồi đăng ký một ThemeDef: thêm platformStyle + drawCustom.platform sinh từ st (SỬA trực tiếp def).
   * @param {string} id   id chủ đề, tiền tố 'vietnam-'
   * @param {ThemeDef} def
   * @param {{fill: string, top: string, topH?: number, texture?: string, lines?: string, ledgeFill?: string,
   *          ledgeTop?: string, ledgeTexture?: string, ledgeDeco?: string}} st  bảng màu / hoa văn sàn và bục
   */
  function theme(id, def, st) {
    def.platformStyle = {
      floor: { fill: st.fill, top: st.top, topH: st.topH || 10, radius: 0 },
      ledge: { fill: st.ledgeFill || st.fill, top: st.ledgeTop || st.top, topH: 6, radius: 8 },
      outline: true
    };
    def.drawCustom = def.drawCustom || {};
    def.drawCustom.platform = platformFn(st);
    S.registerTheme(id, def);
  }

  // ===========================================================================
  // CHỦ ĐỀ
  // ===========================================================================
  // Mẫu ThemeDef: layers xếp XA → GẦN (parallax 0.08 → 0.42), y là toạ độ màn hình của chân hàng decor.
  // Tham số thứ 3 là bảng style sàn/bục cho theme() ở trên.
  // 🧪 Thử: đổi texture: 'brick' thành 'tile' (hoặc 'sand', 'stone') rồi vào màn vietnam-hanoi-1: sàn đổi hoa văn.
  // Hà Nội: Hồ Gươm, Tháp Rùa, cầu Thê Húc, phố cổ nhà ống.
  theme('vietnam-hanoi', {
    name: 'Hà Nội', base: 'garden',
    sky: { top: '#8ed8f8', bottom: '#fdf3d0', sun: { x: 780, y: 100, r: 44, color: '#fff3b0' }, clouds: { color: 'rgba(255,255,255,0.9)', count: 5 } },
    layers: [
      { kind: 'hills', parallax: 0.08, y: 360, height: 50, color: '#bfe6b0', spacing: 420 },
      { kind: 'vietnam-row', parallax: 0.12, y: 360, spacing: 150, scale: 0.6, items: [{ kind: 'tree', opts: { own: true, color: '#8fd27a' } }, { kind: 'tree', opts: { own: true, color: '#7cc96a' }, scale: 0.8 }] },
      { kind: 'vietnam-water', parallax: 0.18, y: 362, color: '#7cc7e8' },
      { kind: 'vietnam-row', parallax: 0.2, y: 392, spacing: 900, items: [{ kind: 'turtletower', scale: 0.8 }, { kind: 'thehuc', scale: 0.9 }] },
      { kind: 'vietnam-row', parallax: 0.42, y: 482, spacing: 74, scale: 0.95, items: [
        { kind: 'tubehouse', opts: { color: '#f4c95d', h: 120, awning: '#e5484d' } },
        { kind: 'tubehouse', opts: { color: '#9fd3c7', h: 100, awning: '#ffc94a' } },
        { kind: 'tubehouse', opts: { color: '#f6a8a0', h: 135, awning: '#3f9a6b' } },
        { kind: 'tubehouse', opts: { color: '#fff1c7', h: 110, awning: '#5fc0e8' } },
        { kind: 'tubehouse', opts: { color: '#c9b3e8', h: 125, awning: '#e5484d' } }
      ] }
    ],
    decor: [
      { kind: 'vietnam-tree', every: 640, start: 120, opts: { own: true } },
      { kind: 'vietnam-pho', every: 1100, start: 420, scale: 0.8 },
      { kind: 'vietnam-flowerbike', every: 1300, start: 900, scale: 0.9 },
      { kind: 'flower', every: 380, start: 240, opts: { color: '#ff9fc1' } }
    ]
  }, { fill: '#d98b5f', top: '#e9b26a', texture: 'brick', lines: 'rgba(120,50,30,0.35)', ledgeFill: '#c0392b', ledgeTop: '#f4d35e', ledgeTexture: 'plank' });

  // Vịnh Hạ Long: đảo đá vôi nhiều lớp, thuyền buồm nâu, bãi cát.
  theme('vietnam-halong', {
    name: 'Vịnh Hạ Long', base: 'garden',
    sky: { top: '#7fd0f5', bottom: '#e8f8ff', sun: { x: 720, y: 96, r: 48, color: '#fff3b0' }, clouds: { color: 'rgba(255,255,255,0.92)', count: 6 } },
    layers: [
      { kind: 'vietnam-karsts', parallax: 0.06, y: 400, spacing: 120, minH: 60, maxH: 130, color: '#c4d8de', green: '#b2d2c2', flat: true, lw: 0.01 },
      { kind: 'vietnam-water', parallax: 0.1, y: 398, color: '#6fc4e6', shine: 'rgba(255,255,255,0.35)' },
      { kind: 'vietnam-karsts', parallax: 0.18, y: 420, spacing: 190, minH: 90, maxH: 190, color: '#9db5a5', green: '#6fb07a', faces: true },
      { kind: 'vietnam-row', parallax: 0.26, y: 436, spacing: 520, offset: 120, items: [{ kind: 'junk', scale: 0.8, opts: { phase: 0 } }, { kind: 'kissrocks', scale: 0.75 }, { kind: 'junk', scale: 0.65, opts: { phase: 2 } }] },
      { kind: 'vietnam-water', parallax: 0.3, y: 430, color: '#3fa6d8' }
    ],
    decor: [
      { kind: 'vietnam-junk', every: 1500, start: 700, y: 470, scale: 0.55 },
      { kind: 'rock', every: 560, start: 260, scale: 0.7, opts: { color: '#b5c4bb' } },
      { kind: 'vietnam-karst', every: 1200, start: 1000, scale: 0.55, opts: { h: 120 } }
    ],
    ambient: { kind: 'sparkle', color: 'rgba(255,255,255,0.65)' }
  }, { fill: '#e9c98e', top: '#f7e0a6', texture: 'sand', lines: 'rgba(160,110,50,0.35)', ledgeFill: '#c9a66b', ledgeTop: '#e8cf8a', ledgeTexture: 'plank' });

  // Hang động Hạ Long (màn 2): xanh tím dịu, nhũ đá lấp lánh — không đáng sợ.
  theme('vietnam-halongcave', {
    name: 'Hang động Hạ Long', base: 'lair',
    sky: { top: '#3b4a8a', bottom: '#7f8fd0', clouds: false },
    layers: [
      { kind: 'vietnam-karsts', parallax: 0.1, y: 460, spacing: 140, minH: 120, maxH: 240, color: '#5a68a8', green: '#5a68a8', flat: true, lw: 0.01 },
      { kind: 'vietnam-row', parallax: 0.25, y: 470, spacing: 460, items: [{ kind: 'cave', scale: 1.1 }, { kind: 'karst', scale: 0.9, opts: { h: 150, color: '#8e9bd6', green: '#7fd0a0' } }] },
      { kind: 'vietnam-stalactites', parallax: 0.35, color: '#4a5596' },
      { kind: 'vietnam-water', parallax: 0.4, y: 470, color: '#3fa6d8', shine: 'rgba(127,224,255,0.6)' }
    ],
    decor: [
      { kind: 'rock', every: 420, start: 200, scale: 0.75, opts: { color: '#9aa6dc' } },
      { kind: 'vietnam-cave', every: 1400, start: 900, scale: 0.6 }
    ],
    ambient: { kind: 'sparkle', color: 'rgba(127,224,255,0.75)' }
  }, { fill: '#6d78b8', top: '#9aa6dc', texture: 'rock', lines: 'rgba(23,35,61,0.25)', ledgeFill: '#8e9bd6', ledgeTop: '#c3cbf0', ledgeTexture: 'stone' });

  // Huế: Ngọ Môn, sông Hương, thuyền rồng, chùa Thiên Mụ.
  theme('vietnam-hue', {
    name: 'Cố đô Huế', base: 'garden',
    sky: { top: '#a8dcf5', bottom: '#fff1d6', sun: { x: 820, y: 110, r: 46, color: '#ffe9a0' }, clouds: { color: 'rgba(255,255,255,0.9)', count: 5 } },
    layers: [
      { kind: 'mountains', parallax: 0.06, y: 380, height: 90, color: '#b9d9c8', spacing: 360 },
      { kind: 'vietnam-water', parallax: 0.12, y: 378, color: '#8fc9e0', shine: 'rgba(255,255,255,0.45)' },
      { kind: 'vietnam-row', parallax: 0.14, y: 398, spacing: 340, items: [{ kind: 'dragonboat', scale: 0.55, opts: { phase: 0 } }, { kind: 'dragonboat', scale: 0.45, opts: { phase: 2 } }] },
      { kind: 'hills', parallax: 0.22, y: 430, height: 40, color: '#9fd88a', spacing: 380 },
      { kind: 'vietnam-row', parallax: 0.3, y: 452, spacing: 760, items: [{ kind: 'ngomon', scale: 1.15 }, { kind: 'pagoda7', scale: 1 }] },
      { kind: 'vietnam-row', parallax: 0.42, y: 470, spacing: 180, scale: 0.7, items: [{ kind: 'tree', opts: { own: true, color: '#5cbf60' } }, { kind: 'tree', opts: { own: true, color: '#7ccf5a' }, scale: 0.85 }] }
    ],
    decor: [
      { kind: 'vietnam-nonla', every: 900, start: 340, y: 476, scale: 0.55 },
      { kind: 'flower', every: 420, start: 200, opts: { color: '#c77dff' } },
      { kind: 'vietnam-tree', every: 1000, start: 700, opts: { own: true, color: '#4fae5a' } }
    ],
    ambient: { kind: 'leaves', color: 'rgba(255,214,120,0.8)' }
  }, { fill: '#b9a58a', top: '#8fcf6a', texture: 'stone', lines: 'rgba(23,35,61,0.2)', ledgeFill: '#c9433a', ledgeTop: '#f2b53a', ledgeTexture: 'plank' });

  // Hội An: phố cổ tường vàng lúc chiều tối, đèn lồng lung linh, Chùa Cầu.
  theme('vietnam-hoian', {
    name: 'Phố cổ Hội An', base: 'roof',
    sky: { top: '#5b4b9a', bottom: '#ffb37a', stars: true, sun: { x: 160, y: 120, r: 40, color: '#fff3c4' }, clouds: { color: 'rgba(255,220,200,0.45)', count: 4 } },
    layers: [
      { kind: 'vietnam-row', parallax: 0.12, y: 400, spacing: 820, offset: 300, items: [{ kind: 'chuacau', scale: 0.9 }] },
      { kind: 'vietnam-water', parallax: 0.14, y: 398, color: '#4a6fb0', shine: 'rgba(255,214,120,0.55)' },
      { kind: 'vietnam-garland', parallax: 0.25, y: 40, spacing: 360, sag: 30 },
      { kind: 'vietnam-row', parallax: 0.38, y: 484, spacing: 130, items: [
        { kind: 'yellowhouse', opts: { c: 0, h: 100 } },
        { kind: 'yellowhouse', opts: { c: 2, h: 86, color: '#f2b84b' } },
        { kind: 'yellowhouse', opts: { c: 4, h: 110 } }
      ] }
    ],
    decor: [
      { kind: 'vietnam-lanternpost', every: 520, start: 160 },
      { kind: 'vietnam-lantern', every: 1100, start: 700, y: 470, scale: 0.6, opts: { color: '#ffc94a' } }
    ],
    ambient: { kind: 'sparkle', color: 'rgba(255,214,120,0.85)' }
  }, { fill: '#8f6b4f', top: '#d9b07a', texture: 'brick', lines: 'rgba(23,35,61,0.25)', ledgeFill: '#7a4a2b', ledgeTop: '#c98b52', ledgeTexture: 'plank', ledgeDeco: 'lantern' });

  // TP. Hồ Chí Minh: nhà cao tầng, chợ Bến Thành, xe máy, xe bánh mì.
  theme('vietnam-saigon', {
    name: 'TP. Hồ Chí Minh', base: 'garden',
    sky: { top: '#6cc8f5', bottom: '#fff4cf', sun: { x: 700, y: 90, r: 52, color: '#fff1a0' }, clouds: { color: 'rgba(255,255,255,0.95)', count: 6 } },
    layers: [
      { kind: 'vietnam-skyline', parallax: 0.1, y: 430 },
      { kind: 'vietnam-row', parallax: 0.22, y: 450, spacing: 900, offset: 260, items: [{ kind: 'benthanh', scale: 1 }] },
      { kind: 'vietnam-row', parallax: 0.3, y: 462, spacing: 150, scale: 0.65, items: [{ kind: 'tree', opts: { own: true, color: '#3fae5a' } }, { kind: 'tree', opts: { own: true, color: '#56c46a' } }] },
      { kind: 'vietnam-row', parallax: 0.45, y: 476, spacing: 230, scale: 0.6, items: [
        { kind: 'scooter', opts: { color: '#ff6b6b' } }, { kind: 'scooter', opts: { color: '#ffc94a' } },
        { kind: 'scooter', opts: { color: '#5fc0e8' } }, { kind: 'scooter', opts: { color: '#7ccf5a' } }
      ] }
    ],
    decor: [
      { kind: 'vietnam-banhmicart', every: 1000, start: 520, scale: 0.85 },
      { kind: 'vietnam-tree', every: 700, start: 200, opts: { own: true, color: '#3fae5a' } },
      { kind: 'vietnam-scooter', every: 1300, start: 1100, scale: 0.8, opts: { color: '#c77dff' } }
    ]
  }, { fill: '#a9b2c3', top: '#d7dce4', texture: 'tile', lines: 'rgba(23,35,61,0.2)', ledgeFill: '#3f8fd0', ledgeTop: '#ffffff', ledgeTexture: 'tile' });

  // Miền Tây: sông Mê Kông phù sa, chợ nổi, dừa, ruộng lúa.
  theme('vietnam-mientay', {
    name: 'Miền Tây sông nước', base: 'garden',
    sky: { top: '#86d6f7', bottom: '#fff6d8', sun: { x: 820, y: 100, r: 50, color: '#fff1a0' }, clouds: { color: 'rgba(255,255,255,0.95)', count: 6 } },
    layers: [
      { kind: 'vietnam-ricefield', parallax: 0.06, y: 360 },
      { kind: 'vietnam-row', parallax: 0.1, y: 372, spacing: 170, scale: 0.45, items: [{ kind: 'coconut', opts: { lean: 1 } }, { kind: 'coconut', opts: { lean: -1 } }, { kind: 'coconut', opts: { lean: 1 } }] },
      { kind: 'vietnam-water', parallax: 0.16, y: 382, color: '#c9a66b', shine: 'rgba(255,255,255,0.45)' },
      { kind: 'vietnam-row', parallax: 0.24, y: 432, spacing: 260, scale: 0.8, items: [
        { kind: 'floatboat', opts: { phase: 0 } }, { kind: 'floatboat', opts: { phase: 1.5, hang: ['#ff5fa2', '#ffc94a'] } },
        { kind: 'floatboat', opts: { phase: 3, hang: ['#3f9a4c', '#e5484d', '#ffc94a'] } }
      ] },
      { kind: 'vietnam-water', parallax: 0.3, y: 448, color: '#b8925a' }
    ],
    decor: [
      { kind: 'vietnam-coconut', every: 520, start: 150 },
      { kind: 'vietnam-fruits', every: 900, start: 460, scale: 0.7 },
      { kind: 'vietnam-rice', every: 760, start: 700, scale: 0.6 }
    ],
    ambient: { kind: 'leaves', color: 'rgba(124,207,90,0.8)' }
  }, { fill: '#a47148', top: '#7ccf5a', texture: 'mud', lines: 'rgba(80,50,20,0.35)', ledgeFill: '#8d5524', ledgeTop: '#c98b52', ledgeTexture: 'plank' });
})();
