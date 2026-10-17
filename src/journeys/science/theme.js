// @ts-check
/* ============================================================================
 * Hành trình "science" — CẢNH NỀN THEO CHỦ ĐỀ + THƯ VIỆN DECOR / LỚP PARALLAX 'science-*'
 * ----------------------------------------------------------------------------
 * Vai trò:      Đăng ký decor, lớp parallax và 5 chủ đề cảnh nền của hành trình science (chạy lúc LOAD).
 *               Bộ vẽ chung src/gfx/scenery.js đọc ThemeDef rồi gọi lại các hàm vẽ ở đây mỗi frame;
 *               content.js còn mượn decor ở đây làm hình thẻ kiến thức.
 * Khái niệm:    theme khai báo (ThemeDef: cảnh là dữ liệu) · registry decor / lớp theo tên ·
 *               lớp có tham số (một hàm vẽ dùng lại với decor/spacing/scale khác nhau trong dữ liệu) ·
 *               parallax · procedural drawing · hoạt ảnh theo thời gian t
 * Bài học:      docs/learn/12-data-driven-man-cau-do-hanh-trinh.md · docs/learn/08-camera-parallax.md ·
 *               docs/learn/07-ve-canvas-procedural-cache.md
 * Phụ thuộc:    OG.Scenery.registerDecor / registerLayer / registerTheme / drawDecor (LOAD; thiếu OG.Scenery thì
 *               bỏ qua cả file) · OG.W, OG.H (LOAD, có dự phòng)
 * Event:        (không)
 * API công khai: (không) — chỉ đăng ký tên 'science-*' vào OG.Scenery
 * Đọc tiếp:     src/core/scenery-registry.js (drawDecor / drawLayer tự save/restore) → src/gfx/scenery.js
 *               → src/journeys/science/content.js (decorIcon dùng lại decor ở đây)
 * Dữ liệu:      ThemeDef, SceneryLayer, PlatformPaint, DecorFn (src/types.d.ts; docs/STORY.md mục 4)
 *
 * Hợp đồng ThemeDef: docs/STORY.md mục 4. Mọi tên riêng có tiền tố 'science-'.
 * Hệ toạ độ: decor + sàn/bục vẽ trong toạ độ THẾ GIỚI (x = tâm, y = mặt đất); lớp parallax vẽ trong toạ độ
 *   MÀN HÌNH (0..960 px, gốc góc trên-trái) và tự trừ cam × parallax.
 *
 * Chủ đề: science-lab (phòng thí nghiệm, chỉ dùng cho truyện tranh) · science-dino (thời khủng long)
 *         · science-body (bên trong cơ thể) · science-ocean (đại dương sâu) · science-space (Hệ Mặt Trời).
 * Decor riêng (thế giới; x = tâm, y = mặt đất): science-volcano, -fern, -egg, -fossil, -bone, -heart, -cell,
 *   -tooth, -coral, -seaweed, -shell, -anglerfish, -jelly, -rocket, -flag, -crater, -satellite, -planet, -star,
 *   -timemachine.
 * Lớp parallax riêng (màn hình): science-row, -longnecks, -vessels, -cells, -bigheart, -rays, -kelp, -whale,
 *   -fishes, -planets, -moonhills, -labwall.
 * Tất cả vẽ bằng canvas, tự chứa (không phụ thuộc thư viện decor chung) nên luôn có hình.
 * ========================================================================== */
(function () {
  'use strict';
  var OG = window.OG;
  var S = OG.Scenery;
  if (!S) return;

  var TAU = Math.PI * 2;
  var INK = '#17233d';
  var W = OG.W || 960, H = OG.H || 540;

  function wrap(x, span) { return ((x % span) + span) % span; }

  // Viền ink dày bo tròn.
  function ink(ctx, w) { ctx.strokeStyle = INK; ctx.lineWidth = w || 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); }

  // Khuôn mặt dễ thương: mood = 'happy' (mặc định) | 'o' (ngạc nhiên) | 'wink' | 'sleepy' | 'grin'.
  function face(ctx, x, y, s, mood) {
    ctx.save();
    ctx.fillStyle = INK; ctx.strokeStyle = INK; ctx.lineCap = 'round';
    if (mood === 'sleepy') {
      ctx.lineWidth = 1.8 * s;
      ctx.beginPath(); ctx.arc(x - 6 * s, y, 2.6 * s, 0, Math.PI); ctx.moveTo(x + 8.6 * s, y); ctx.arc(x + 6 * s, y, 2.6 * s, 0, Math.PI); ctx.stroke();
    } else if (mood === 'wink') {
      ctx.beginPath(); ctx.arc(x - 6 * s, y, 2.5 * s, 0, TAU); ctx.fill();
      ctx.lineWidth = 1.8 * s; ctx.beginPath(); ctx.moveTo(x + 3.5 * s, y); ctx.lineTo(x + 8.5 * s, y); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(x - 6 * s, y, 2.5 * s, 0, TAU); ctx.arc(x + 6 * s, y, 2.5 * s, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(x - 5.2 * s, y - 0.9 * s, 0.9 * s, 0, TAU); ctx.arc(x + 6.8 * s, y - 0.9 * s, 0.9 * s, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,120,150,0.55)';
    ctx.beginPath(); ctx.arc(x - 10.5 * s, y + 5 * s, 2.6 * s, 0, TAU); ctx.arc(x + 10.5 * s, y + 5 * s, 2.6 * s, 0, TAU); ctx.fill();
    ctx.lineWidth = 1.8 * s;
    ctx.beginPath();
    if (mood === 'o') { ctx.fillStyle = INK; ctx.arc(x, y + 6 * s, 2.4 * s, 0, TAU); ctx.fill(); }
    else if (mood === 'grin') { ctx.fillStyle = '#ffffff'; ctx.arc(x, y + 3 * s, 4.6 * s, 0, Math.PI); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    else { ctx.arc(x, y + 3 * s, 4 * s, 0.25, Math.PI - 0.25); ctx.stroke(); }
    ctx.restore();
  }

  // Ngôi sao 5 cánh (đường dẫn).
  function starPath(ctx, x, y, ro, ri) {
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var r = i % 2 ? ri : ro, a = i * Math.PI / 5 - Math.PI / 2;
      if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
  }

  function rr(ctx, x, y, w, h, r) {
    if (OG.util && OG.util.roundRectPath) { OG.util.roundRectPath(ctx, x, y, w, h, r); return; }
    ctx.beginPath(); ctx.rect(x, y, w, h);
  }

  // =====================================================================================
  // DECOR (thế giới; x = tâm, y = mặt đất). OG.Scenery.drawDecor đã save/restore quanh mỗi lời gọi.
  // =====================================================================================

  // 💡 Khái niệm: registry theo tên — đăng ký 1 lần ở đây, rồi bất kỳ dữ liệu nào (ThemeDef.decor, lớp
  //   'science-row', thẻ kiến thức) chỉ cần ghi chuỗi 'science-volcano'. Tên sai → OG.Scenery vẽ hình dự phòng
  //   thay vì làm vỡ game. Tham số: (ctx, x tâm, y mặt đất, s = tỉ lệ, t = giây, o = opts tuỳ chọn).
  // Núi lửa tí hon có mặt, phun khói tròn như kẹo bông.
  S.registerDecor('science-volcano', function (ctx, x, y, s, t, o) {
    ctx.translate(x, y); ctx.scale(s, s);
    for (var i = 0; i < 3; i++) {
      var k = (t * 0.35 + i / 3) % 1;
      ctx.fillStyle = 'rgba(255,255,255,' + (0.85 - k * 0.7).toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(Math.sin(k * 6 + i) * 10, -112 - k * 70, 12 + k * 14, 0, TAU); ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(-80, 0); ctx.quadraticCurveTo(-40, -50, -24, -100); ctx.lineTo(24, -100); ctx.quadraticCurveTo(40, -50, 80, 0); ctx.closePath();
    ctx.fillStyle = o.color || '#b57b5c'; ctx.fill(); ink(ctx, 3);
    // dung nham đỉnh (vui mắt, như kem dâu chảy)
    ctx.beginPath();
    ctx.moveTo(-24, -100); ctx.lineTo(24, -100); ctx.lineTo(30, -86); ctx.quadraticCurveTo(20, -70, 14, -84); ctx.quadraticCurveTo(4, -64, -4, -84);
    ctx.quadraticCurveTo(-14, -72, -20, -86); ctx.closePath();
    ctx.fillStyle = '#ff8c5a'; ctx.fill(); ink(ctx, 2.5);
    face(ctx, 0, -44, 1.5, o.mood || 'happy');
  });

  // Cây dương xỉ (thời khủng long đã có dương xỉ).
  S.registerDecor('science-fern', function (ctx, x, y, s, t, o) {
    ctx.translate(x, y); ctx.scale(s, s);
    var c = o.color || '#4fb04a';
    for (var i = -3; i <= 3; i++) {
      var a = i * 0.32 + Math.sin(t * 1.5 + i) * 0.05;
      ctx.save(); ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(10, -40, 0, -70 + Math.abs(i) * 8);
      ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.stroke();
      ctx.strokeStyle = c; ctx.lineWidth = 3.5; ctx.stroke();
      for (var j = 1; j < 6; j++) {
        var yy = -j * 11;
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.ellipse(-7, yy, 7, 3.5, -0.4, 0, TAU); ctx.ellipse(7, yy, 7, 3.5, 0.4, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
  });

  // Tổ trứng khủng long, một quả rung rinh sắp nở.
  S.registerDecor('science-egg', function (ctx, x, y, s, t, o) {
    ctx.translate(x, y); ctx.scale(s, s);
    ctx.beginPath(); ctx.ellipse(0, -6, 46, 14, 0, 0, TAU); ctx.fillStyle = '#c99a5b'; ctx.fill(); ink(ctx, 3);
    var eggs = [[-22, '#fff3d6'], [22, '#e6f6d0'], [0, '#ffe1ec']];
    for (var i = 0; i < 3; i++) {
      ctx.save();
      ctx.translate(eggs[i][0], -14);
      if (i === 2) ctx.rotate(Math.sin(t * 8) * 0.12 * (Math.sin(t * 1.3) > 0.3 ? 1 : 0));
      ctx.beginPath(); ctx.ellipse(0, -16, 15, 21, 0, 0, TAU); ctx.fillStyle = eggs[i][1]; ctx.fill(); ink(ctx, 2.5);
      ctx.fillStyle = 'rgba(120,180,90,0.6)';
      ctx.beginPath(); ctx.arc(-5, -22, 3, 0, TAU); ctx.arc(6, -12, 2.5, 0, TAU); ctx.arc(3, -28, 2, 0, TAU); ctx.fill();
      if (i === 2) face(ctx, 0, -14, 0.7, 'happy');
      ctx.restore();
    }
    ctx.fillStyle = '#e0b46e';
    ctx.beginPath(); ctx.ellipse(0, -2, 48, 8, 0, 0, Math.PI); ctx.fill(); ink(ctx, 2);
  });

  // Hoá thạch nằm trong lớp đất (vẽ ở y ≈ 515, bên trong sàn).
  S.registerDecor('science-fossil', function (ctx, x, y, s, t, o) {
    ctx.translate(x, y); ctx.scale(s, s);
    ctx.beginPath(); ctx.ellipse(0, 0, 48, 20, 0, 0, TAU); ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fill();
    ctx.strokeStyle = '#f6ead2'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    // xương sống + xương sườn (cá/khủng long nhỏ)
    ctx.beginPath(); ctx.moveTo(-34, 2); ctx.quadraticCurveTo(0, -10, 30, 2); ctx.stroke();
    for (var i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(i * 8, -3 + Math.abs(i)); ctx.lineTo(i * 8 - 3, 10); ctx.stroke(); }
    ctx.fillStyle = '#f6ead2'; ctx.beginPath(); ctx.ellipse(36, 0, 9, 7, 0.2, 0, TAU); ctx.fill();
    ctx.fillStyle = '#7a5a3f'; ctx.beginPath(); ctx.arc(38, -2, 1.8, 0, TAU); ctx.fill();
  });

  // Hình khúc xương: thân chữ nhật + 4 đầu tròn. Vẽ viền ink dày bên dưới rồi tô màu lên trên (viền hợp nhất).
  function boneShape(ctx, x, y, w, h, fill) {
    var r = h * 0.62, parts = [[x + r * 0.7, y + h * 0.5 - r * 0.62], [x + r * 0.7, y + h * 0.5 + r * 0.62],
      [x + w - r * 0.7, y + h * 0.5 - r * 0.62], [x + w - r * 0.7, y + h * 0.5 + r * 0.62]];
    function path() {
      ctx.beginPath();
      ctx.rect(x + r * 0.7, y + h * 0.18, w - r * 1.4, h * 0.64);
      for (var i = 0; i < 4; i++) { ctx.moveTo(parts[i][0] + r, parts[i][1]); ctx.arc(parts[i][0], parts[i][1], r, 0, TAU); }
    }
    path(); ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.lineJoin = 'round'; ctx.stroke();
    path(); ctx.fillStyle = fill || '#fff7e8'; ctx.fill();
  }

  // Khúc xương to có mặt cười (khu cơ thể / khủng long).
  S.registerDecor('science-bone', function (ctx, x, y, s, t, o) {
    ctx.translate(x, y - 16 * s); ctx.scale(s, s); ctx.rotate(o.rot || 0);
    boneShape(ctx, -46, -12, 92, 24, o.color);
    face(ctx, 0, -2, 0.75, o.mood || 'happy');
  });

  // Trái tim hoạt hình đập thình thịch.
  function heartPath(ctx, r) {
    ctx.beginPath();
    ctx.moveTo(0, r * 0.9);
    ctx.bezierCurveTo(-r * 1.4, 0, -r * 1.05, -r * 1.15, 0, -r * 0.45);
    ctx.bezierCurveTo(r * 1.05, -r * 1.15, r * 1.4, 0, 0, r * 0.9);
    ctx.closePath();
  }
  S.registerDecor('science-heart', function (ctx, x, y, s, t, o) {
    var beat = 1 + Math.max(0, Math.sin(t * 6)) * 0.08;
    ctx.translate(x, y - 34 * s); ctx.scale(s * beat, s * beat);
    heartPath(ctx, 34); ctx.fillStyle = o.color || '#ff5a6e'; ctx.fill(); ink(ctx, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.ellipse(-14, -14, 6, 3.5, -0.6, 0, TAU); ctx.fill();
    face(ctx, 0, 0, 1.1, o.mood || 'happy');
  });

  // Hồng cầu: đĩa đỏ lõm giữa, có mặt.
  S.registerDecor('science-cell', function (ctx, x, y, s, t, o) {
    ctx.translate(x, y - 20 * s); ctx.scale(s, s); ctx.rotate(Math.sin(t + x) * 0.15);
    ctx.beginPath(); ctx.ellipse(0, 0, 24, 18, 0, 0, TAU); ctx.fillStyle = o.color || '#ef4f5f'; ctx.fill(); ink(ctx, 3);
    ctx.beginPath(); ctx.ellipse(0, 0, 13, 9, 0, 0, TAU); ctx.fillStyle = 'rgba(160,20,40,0.25)'; ctx.fill();
    face(ctx, 0, -1, 0.7, o.mood || 'happy');
  });

  // Chiếc răng cười tươi lấp lánh.
  S.registerDecor('science-tooth', function (ctx, x, y, s, t, o) {
    ctx.translate(x, y); ctx.scale(s, s);
    ctx.beginPath();
    ctx.moveTo(-22, -54); ctx.quadraticCurveTo(-28, -20, -18, -4); ctx.quadraticCurveTo(-12, 2, -8, -6);
    ctx.quadraticCurveTo(0, -22, 8, -6); ctx.quadraticCurveTo(12, 2, 18, -4); ctx.quadraticCurveTo(28, -20, 22, -54);
    ctx.quadraticCurveTo(11, -64, 0, -56); ctx.quadraticCurveTo(-11, -64, -22, -54); ctx.closePath();
    ctx.fillStyle = '#ffffff'; ctx.fill(); ink(ctx, 3);
    face(ctx, 0, -36, 0.85, 'grin');
    var k = 0.5 + 0.5 * Math.sin(t * 4 + x);
    ctx.fillStyle = 'rgba(127,224,255,' + k.toFixed(2) + ')';
    starPath(ctx, 20, -60, 7, 2.5); ctx.fill();
  });

  // San hô hồng có mặt.
  S.registerDecor('science-coral', function (ctx, x, y, s, t, o) {
    ctx.translate(x, y); ctx.scale(s, s);
    var c = o.color || '#ff7aa2';
    ctx.lineCap = 'round';
    var arms = [[-24, -50, -30], [-8, -76, -10], [12, -64, 16], [26, -40, 30]];
    for (var p = 0; p < 2; p++) {
      ctx.strokeStyle = p ? c : INK; ctx.lineWidth = p ? 10 : 16;
      ctx.beginPath();
      for (var i = 0; i < arms.length; i++) { ctx.moveTo(0, 0); ctx.quadraticCurveTo(arms[i][0] * 0.4, arms[i][1] * 0.5, arms[i][2], arms[i][1]); }
      ctx.stroke();
    }
    ctx.fillStyle = c;
    for (var j = 0; j < arms.length; j++) { ctx.beginPath(); ctx.arc(arms[j][2], arms[j][1], 7, 0, TAU); ctx.fill(); ink(ctx, 2.5); }
    ctx.beginPath(); ctx.ellipse(0, -14, 18, 16, 0, 0, TAU); ctx.fillStyle = c; ctx.fill(); ink(ctx, 3);
    face(ctx, 0, -16, 0.75, 'happy');
  });

  // Rong biển đung đưa.
  S.registerDecor('science-seaweed', function (ctx, x, y, s, t, o) {
    ctx.translate(x, y); ctx.scale(s, s);
    for (var k = -1; k <= 1; k++) {
      ctx.beginPath(); ctx.moveTo(k * 10, 0);
      for (var j = 1; j <= 6; j++) ctx.lineTo(k * 10 + Math.sin(t * 1.6 + j * 0.8 + k) * 6 * j / 3, -j * (16 + (k === 0 ? 4 : 0)));
      ctx.strokeStyle = INK; ctx.lineWidth = 11; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.strokeStyle = o.color || '#45c48a'; ctx.lineWidth = 6; ctx.stroke();
    }
  });

  // Vỏ sò.
  S.registerDecor('science-shell', function (ctx, x, y, s, t, o) {
    ctx.translate(x, y); ctx.scale(s, s);
    ctx.beginPath(); ctx.moveTo(-20, -2); ctx.quadraticCurveTo(-22, -30, 0, -32); ctx.quadraticCurveTo(22, -30, 20, -2); ctx.closePath();
    ctx.fillStyle = o.color || '#ffc8a8'; ctx.fill(); ink(ctx, 3);
    ctx.strokeStyle = 'rgba(23,35,61,0.45)'; ctx.lineWidth = 1.6;
    for (var i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(0, -2); ctx.lineTo(i * 8, -28 + Math.abs(i) * 3); ctx.stroke(); }
    face(ctx, 0, -12, 0.55, 'happy');
  });

  // Cá cần câu dễ thương (đèn nhỏ trên đầu). y = độ cao bơi (không phải mặt đất).
  S.registerDecor('science-anglerfish', function (ctx, x, y, s, t, o) {
    ctx.translate(x + Math.sin(t * 0.8) * 20, y + Math.sin(t * 1.7) * 6); ctx.scale(s * (o.face || 1), s);
    var lx = 30, ly = -44, glow = 0.55 + 0.35 * Math.sin(t * 3);
    var g = ctx.createRadialGradient(lx, ly, 2, lx, ly, 34);
    g.addColorStop(0, 'rgba(255,245,160,' + glow.toFixed(2) + ')'); g.addColorStop(1, 'rgba(255,245,160,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(lx, ly, 34, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(6, -20); ctx.quadraticCurveTo(14, -48, lx, ly); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.arc(lx, ly, 6, 0, TAU); ctx.fillStyle = '#fff3a0'; ctx.fill(); ink(ctx, 2.5);
    ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(-44, -14); ctx.lineTo(-44, 14); ctx.closePath(); ctx.fillStyle = '#8a7cf0'; ctx.fill(); ink(ctx, 2.5);
    ctx.beginPath(); ctx.ellipse(0, 0, 30, 24, 0, 0, TAU); ctx.fillStyle = o.color || '#a497ff'; ctx.fill(); ink(ctx, 3);
    face(ctx, 6, -4, 0.9, 'happy');
  });

  // Sứa tím bồng bềnh (y = độ cao bơi).
  S.registerDecor('science-jelly', function (ctx, x, y, s, t, o) {
    var bob = Math.sin(t * 1.6 + x * 0.01) * 10;
    ctx.translate(x, y + bob); ctx.scale(s, s);
    ctx.strokeStyle = o.color || '#c58cff'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    for (var i = -2; i <= 2; i++) {
      ctx.beginPath(); ctx.moveTo(i * 8, 0);
      ctx.quadraticCurveTo(i * 8 + Math.sin(t * 3 + i) * 6, 16, i * 8, 32 + Math.abs(i) * -3); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(0, 0, 22, Math.PI, 0); ctx.quadraticCurveTo(0, 8, -22, 0); ctx.closePath();
    ctx.fillStyle = 'rgba(214,170,255,0.92)'; ctx.fill(); ink(ctx, 3);
    face(ctx, 0, -8, 0.7, 'happy');
  });

  // Tên lửa nhỏ có cửa sổ mặt cười.
  S.registerDecor('science-rocket', function (ctx, x, y, s, t, o) {
    ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = '#ff7d5c';
    ctx.beginPath(); ctx.moveTo(-22, -20); ctx.lineTo(-36, 0); ctx.lineTo(-18, 0); ctx.closePath(); ctx.fill(); ink(ctx, 3);
    ctx.beginPath(); ctx.moveTo(22, -20); ctx.lineTo(36, 0); ctx.lineTo(18, 0); ctx.closePath(); ctx.fill(); ink(ctx, 3);
    ctx.beginPath(); ctx.moveTo(-22, -6); ctx.lineTo(-22, -80); ctx.quadraticCurveTo(0, -132, 22, -80); ctx.lineTo(22, -6); ctx.closePath();
    ctx.fillStyle = o.color || '#f4f7fb'; ctx.fill(); ink(ctx, 3);
    ctx.beginPath(); ctx.moveTo(-17, -96); ctx.quadraticCurveTo(0, -132, 17, -96); ctx.closePath(); ctx.fillStyle = '#ff7d5c'; ctx.fill(); ink(ctx, 2.5);
    ctx.beginPath(); ctx.arc(0, -64, 13, 0, TAU); ctx.fillStyle = '#7fe0ff'; ctx.fill(); ink(ctx, 3);
    face(ctx, 0, -66, 0.6, 'happy');
    if (o.fire) {
      var f = 0.8 + Math.sin(t * 30) * 0.2;
      ctx.beginPath(); ctx.moveTo(-12, -4); ctx.quadraticCurveTo(0, 40 * f, 12, -4); ctx.closePath(); ctx.fillStyle = '#ffd23f'; ctx.fill(); ink(ctx, 2);
    }
  });

  // Lá cờ cắm trên Mặt Trăng (cờ ngôi sao chung, không phải cờ quốc gia nào).
  S.registerDecor('science-flag', function (ctx, x, y, s, t, o) {
    ctx.translate(x, y); ctx.scale(s, s);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -80); ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.stroke();
    ctx.strokeStyle = '#c6d5e3'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(2, -78); ctx.lineTo(46, -74 + Math.sin(t * 2) * 2); ctx.lineTo(46, -48 + Math.sin(t * 2) * 2); ctx.lineTo(2, -52); ctx.closePath();
    ctx.fillStyle = o.color || '#7b6cf0'; ctx.fill(); ink(ctx, 2.5);
    ctx.fillStyle = '#ffd23f'; starPath(ctx, 24, -63, 8, 3.5); ctx.fill();
  });

  // Miệng hố thiên thạch (nằm phẳng trên mặt đất).
  S.registerDecor('science-crater', function (ctx, x, y, s, t, o) {
    ctx.translate(x, y); ctx.scale(s, s);
    ctx.beginPath(); ctx.ellipse(0, 6, 34, 8, 0, 0, TAU); ctx.fillStyle = 'rgba(23,35,61,0.25)'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 4, 26, 5, 0, 0, Math.PI); ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2; ctx.stroke();
  });

  // Vệ tinh nhỏ trôi lơ lửng (y = độ cao bay).
  S.registerDecor('science-satellite', function (ctx, x, y, s, t, o) {
    ctx.translate(x, y + Math.sin(t * 1.2 + x) * 8); ctx.scale(s, s); ctx.rotate(Math.sin(t * 0.6) * 0.2);
    for (var k = -1; k <= 1; k += 2) {
      rr(ctx, k * 46 - 18, -10, 36, 20, 3); ctx.fillStyle = '#3f6fb5'; ctx.fill(); ink(ctx, 2.5);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(k * 46 - 6, -10); ctx.lineTo(k * 46 - 6, 10); ctx.moveTo(k * 46 + 6, -10); ctx.lineTo(k * 46 + 6, 10); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(-28, 0); ctx.lineTo(28, 0); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
    rr(ctx, -16, -16, 32, 32, 8); ctx.fillStyle = '#ffd23f'; ctx.fill(); ink(ctx, 3);
    face(ctx, 0, -2, 0.6, 'happy');
    ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(0, -28); ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = '#ff7d5c'; ctx.beginPath(); ctx.arc(0, -30, 4, 0, TAU); ctx.fill();
  });

  // Hành tinh có mặt. opts.kind = 'earth' | 'mars' | 'jupiter' | 'saturn' | 'neptune' | 'moon' | 'sun'; y = tâm khi opts.center.
  function drawPlanet(ctx, kind, r, t) {
    var C = { earth: '#4fa8f0', mars: '#e7774f', jupiter: '#e7b98a', saturn: '#f1d27a', neptune: '#5b7cf0', moon: '#d9dce6', sun: '#ffcf3f', venus: '#f3c26a', mercury: '#b8b0a8', uranus: '#8fe3e8' };
    if (kind === 'sun') {
      ctx.save(); ctx.rotate(t * 0.3);
      ctx.fillStyle = '#ffb02e';
      for (var i = 0; i < 12; i++) { ctx.rotate(TAU / 12); ctx.beginPath(); ctx.moveTo(-r * 0.25, -r * 0.9); ctx.lineTo(0, -r * 1.35); ctx.lineTo(r * 0.25, -r * 0.9); ctx.closePath(); ctx.fill(); ink(ctx, 2.5); }
      ctx.restore();
    }
    if (kind === 'saturn') {
      ctx.beginPath(); ctx.ellipse(0, 0, r * 1.75, r * 0.45, -0.25, Math.PI, TAU); ctx.strokeStyle = INK; ctx.lineWidth = r * 0.28 + 4; ctx.stroke();
      ctx.strokeStyle = '#d9b45a'; ctx.lineWidth = r * 0.28; ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fillStyle = C[kind] || '#b39ddb'; ctx.fill();
    ctx.save(); ctx.clip();
    if (kind === 'earth') {
      ctx.fillStyle = '#6cc35a';
      ctx.beginPath(); ctx.ellipse(-r * 0.35, -r * 0.2, r * 0.42, r * 0.3, 0.6, 0, TAU); ctx.ellipse(r * 0.45, r * 0.35, r * 0.35, r * 0.25, -0.4, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(-r, -r, r * 2, r * 0.18);
    } else if (kind === 'jupiter') {
      ctx.fillStyle = '#c98a5a';
      for (var b = -2; b <= 2; b++) ctx.fillRect(-r, b * r * 0.36 - r * 0.07, r * 2, r * 0.14);
      ctx.fillStyle = '#d8573f'; ctx.beginPath(); ctx.ellipse(r * 0.35, r * 0.42, r * 0.2, r * 0.12, 0, 0, TAU); ctx.fill();
    } else if (kind === 'moon' || kind === 'mercury') {
      ctx.fillStyle = 'rgba(23,35,61,0.15)';
      ctx.beginPath(); ctx.arc(-r * 0.4, -r * 0.4, r * 0.2, 0, TAU); ctx.arc(r * 0.45, r * 0.1, r * 0.16, 0, TAU); ctx.arc(-r * 0.1, r * 0.55, r * 0.13, 0, TAU); ctx.fill();
    } else if (kind === 'mars') {
      ctx.fillStyle = 'rgba(150,50,30,0.35)'; ctx.beginPath(); ctx.arc(-r * 0.3, r * 0.3, r * 0.3, 0, TAU); ctx.fill();
    } else if (kind === 'sun') {
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(-r * 0.35, -r * 0.35, r * 0.35, 0, TAU); ctx.fill();
    }
    ctx.restore();
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ink(ctx, 3);
    if (kind === 'saturn') {
      ctx.beginPath(); ctx.ellipse(0, 0, r * 1.75, r * 0.45, -0.25, 0, Math.PI); ctx.strokeStyle = INK; ctx.lineWidth = r * 0.28 + 4; ctx.stroke();
      ctx.strokeStyle = '#d9b45a'; ctx.lineWidth = r * 0.28; ctx.stroke();
    }
    face(ctx, 0, r * 0.05, r / 26, kind === 'sun' ? 'grin' : 'happy');
  }
  S.registerDecor('science-planet', function (ctx, x, y, s, t, o) {
    var r = (o.r || 30);
    ctx.translate(x, o.center ? y : y - r * s); ctx.scale(s, s);
    drawPlanet(ctx, o.kind || 'earth', r, t);
  });

  // Ngôi sao vàng cười (y = độ cao).
  S.registerDecor('science-star', function (ctx, x, y, s, t, o) {
    ctx.translate(x, y); ctx.scale(s, s); ctx.rotate(Math.sin(t * 2 + x) * 0.15);
    starPath(ctx, 0, 0, 22, 10); ctx.fillStyle = o.color || '#ffd84a'; ctx.fill(); ink(ctx, 3);
    face(ctx, 0, 1, 0.6, 'happy');
  });

  // Cỗ máy thời gian của Rô-bốt Bíp: buồng tròn có mặt, đồng hồ quay, đèn nhấp nháy.
  S.registerDecor('science-timemachine', function (ctx, x, y, s, t, o) {
    ctx.translate(x, y); ctx.scale(s, s);
    rr(ctx, -60, -20, 120, 20, 8); ctx.fillStyle = '#5d7891'; ctx.fill(); ink(ctx, 3);
    ctx.beginPath(); ctx.arc(0, -84, 64, 0, TAU); ctx.fillStyle = '#9fb4c8'; ctx.fill(); ink(ctx, 3.5);
    ctx.beginPath(); ctx.arc(0, -84, 46, 0, TAU); ctx.fillStyle = '#c9f3ff'; ctx.fill(); ink(ctx, 3);
    // kim đồng hồ quay
    ctx.save(); ctx.translate(0, -84); ctx.rotate(t * 2);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -34); ctx.strokeStyle = 'rgba(123,108,240,0.6)'; ctx.lineWidth = 4; ctx.stroke();
    ctx.restore();
    face(ctx, 0, -78, 1.5, o.mood || 'happy');
    for (var i = 0; i < 6; i++) {
      var a = -Math.PI + i * Math.PI / 5;
      var on = Math.sin(t * 6 + i) > 0;
      ctx.beginPath(); ctx.arc(Math.cos(a) * 56, -84 + Math.sin(a) * 56, 5, 0, TAU);
      ctx.fillStyle = on ? ['#ff7d5c', '#ffd23f', '#7fe0ff'][i % 3] : '#5d7891'; ctx.fill(); ink(ctx, 1.5);
    }
    ctx.beginPath(); ctx.moveTo(0, -148); ctx.lineTo(0, -168); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -172, 6, 0, TAU); ctx.fillStyle = Math.sin(t * 5) > 0 ? '#ff7d5c' : '#ffd23f'; ctx.fill(); ink(ctx, 2);
  });

  // =====================================================================================
  // LỚP PARALLAX (màn hình, phủ ngang 960 px). layer = {kind, parallax, y, height, color, spacing, scale, decor, opts}
  // =====================================================================================

  // ⚠️ Bẫy: hàm đăng ký qua registerLayer nhận (ctx, layer, camX, t, theme) — KHÁC thứ tự với layer.draw của
  //   lớp 'custom' (ctx, camX, t, layer, theme). Nhầm thứ tự thì `cam * px` thành NaN và lớp biến mất im lặng.
  // Hàng decor lặp lại (tự chứa, không phụ thuộc 'decorRow' của thư viện chung).
  // 💡 Khái niệm: lớp có tham số — cùng một hàm, dữ liệu theme chọn decor / spacing / scale / offset khác nhau
  //   (xem science-dino: một hàng núi lửa xa và một hàng dương xỉ gần dùng chung 'science-row').
  S.registerLayer('science-row', function (ctx, L, cam, t) {
    var px = L.parallax == null ? 0.3 : L.parallax, span = L.spacing || 260, off = L.offset || 0;
    for (var i = -1; i < W / span + 2; i++) {
      S.drawDecor(ctx, L.decor || 'science-fern', i * span - wrap(cam * px + off, span), L.y == null ? 450 : L.y, L.scale || 0.8, t, L.opts);
    }
  });

  // Khủng long cổ dài (bóng xa) đang nhai lá trên cây.
  S.registerLayer('science-longnecks', function (ctx, L, cam, t) {
    var px = L.parallax == null ? 0.2 : L.parallax, span = L.spacing || 620, y = L.y == null ? 430 : L.y, sc = L.scale || 1;
    for (var i = -1; i < W / span + 2; i++) {
      var x = i * span - wrap(cam * px, span) + 120;
      ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
      ctx.fillStyle = L.color || '#7fae8a';
      // cây cao
      ctx.fillRect(150, -170, 14, 170);
      ctx.beginPath(); ctx.arc(157, -180, 40, 0, TAU); ctx.arc(130, -165, 26, 0, TAU); ctx.arc(184, -165, 26, 0, TAU); ctx.fill();
      // thân + chân + đuôi
      ctx.beginPath(); ctx.ellipse(0, -46, 70, 36, 0, 0, TAU); ctx.fill();
      ctx.fillRect(-50, -30, 18, 30); ctx.fillRect(30, -30, 18, 30);
      ctx.beginPath(); ctx.moveTo(-60, -50); ctx.quadraticCurveTo(-120, -40, -140, -10); ctx.quadraticCurveTo(-110, -30, -60, -30); ctx.fill();
      // cổ dài vươn lên, đầu nhai nhóp nhép
      var chew = Math.sin(t * 3 + i) * 3;
      ctx.lineWidth = 26; ctx.lineCap = 'round'; ctx.strokeStyle = ctx.fillStyle;
      ctx.beginPath(); ctx.moveTo(40, -60); ctx.quadraticCurveTo(80, -110, 110, -160); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(122, -166 + chew * 0.3, 22, 13, 0.2, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(23,35,61,0.35)'; ctx.beginPath(); ctx.arc(126, -170, 3, 0, TAU); ctx.fill();
      ctx.restore();
    }
  });

  // Mạch máu cong mềm mại (khu cơ thể).
  S.registerLayer('science-vessels', function (ctx, L, cam, t) {
    var px = L.parallax == null ? 0.12 : L.parallax, span = 480, y = L.y == null ? 200 : L.y;
    ctx.lineCap = 'round';
    for (var pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass ? (L.color || '#ff9db0') : 'rgba(200,60,90,0.35)';
      ctx.lineWidth = pass ? 34 : 44;
      for (var i = -1; i < W / span + 2; i++) {
        var x = i * span - wrap(cam * px, span);
        ctx.beginPath(); ctx.moveTo(x, y + 60);
        ctx.bezierCurveTo(x + 120, y - 80, x + 260, y + 160, x + span, y + 60); ctx.stroke();
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 6;
    for (var j = -1; j < W / span + 2; j++) {
      var x2 = j * span - wrap(cam * px, span);
      ctx.beginPath(); ctx.moveTo(x2, y + 50); ctx.bezierCurveTo(x2 + 120, y - 90, x2 + 260, y + 150, x2 + span, y + 50); ctx.stroke();
    }
  });

  // Hồng cầu trôi bồng bềnh.
  S.registerLayer('science-cells', function (ctx, L, cam, t) {
    var px = L.parallax == null ? 0.3 : L.parallax, n = L.count || 9, sc = L.scale || 0.7;
    for (var i = 0; i < n; i++) {
      var x = wrap(i * 137 + t * 30 - cam * px, W + 120) - 60;
      var y = (L.y == null ? 120 : L.y) + ((i * 71) % (L.height || 220)) + Math.sin(t * 1.4 + i) * 10;
      S.drawDecor(ctx, 'science-cell', x, y + 20 * sc, sc * (0.7 + (i % 3) * 0.2), t + i, {});
    }
  });

  // Trái tim khổng lồ đập ở xa.
  S.registerLayer('science-bigheart', function (ctx, L, cam, t) {
    var px = L.parallax == null ? 0.06 : L.parallax;
    var x = wrap(700 - cam * px, W + 400) - 200;
    ctx.globalAlpha = L.alpha || 0.55;
    S.drawDecor(ctx, 'science-heart', x, (L.y == null ? 300 : L.y), L.scale || 3, t, { color: L.color || '#ff8fa3' });
  });

  // Tia sáng chiếu xuống nước.
  S.registerLayer('science-rays', function (ctx, L, cam, t) {
    var px = L.parallax == null ? 0.1 : L.parallax;
    for (var i = 0; i < 6; i++) {
      var x = wrap(i * 190 - cam * px, W + 200) - 100;
      var a = 0.08 + 0.05 * Math.sin(t * 0.8 + i);
      ctx.fillStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')';
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 50, 0); ctx.lineTo(x + 170, H); ctx.lineTo(x + 70, H); ctx.closePath(); ctx.fill();
    }
  });

  // Bóng rong tảo xa đung đưa.
  S.registerLayer('science-kelp', function (ctx, L, cam, t) {
    var px = L.parallax == null ? 0.3 : L.parallax, span = L.spacing || 90, y = L.y == null ? 480 : L.y, hgt = L.height || 200;
    ctx.strokeStyle = L.color || 'rgba(20,90,110,0.55)'; ctx.lineWidth = 10; ctx.lineCap = 'round';
    for (var i = -1; i < W / span + 2; i++) {
      var x = i * span - wrap(cam * px, span), hh = hgt * (0.6 + ((i * 37 + 100) % 40) / 100);
      ctx.beginPath(); ctx.moveTo(x, y);
      for (var j = 1; j <= 8; j++) ctx.lineTo(x + Math.sin(t * 1.2 + j * 0.7 + i) * j * 1.5, y - hh * j / 8);
      ctx.stroke();
    }
  });

  // Cá voi xanh hiền lành bơi chầm chậm phía xa.
  S.registerLayer('science-whale', function (ctx, L, cam, t) {
    var px = L.parallax == null ? 0.08 : L.parallax;
    var x = wrap(t * 18 - cam * px, W + 700) - 350, y = (L.y == null ? 180 : L.y) + Math.sin(t * 0.7) * 10;
    var sc = L.scale || 1.2;
    ctx.translate(x, y); ctx.scale(sc, sc);
    ctx.globalAlpha = L.alpha || 0.85;
    ctx.fillStyle = L.color || '#4f7fc9';
    ctx.beginPath(); ctx.moveTo(-150, -6);
    ctx.quadraticCurveTo(-190, -40 + Math.sin(t * 1.5) * 8, -205, -20); ctx.quadraticCurveTo(-185, -4, -205, 16 + Math.sin(t * 1.5) * 8);
    ctx.quadraticCurveTo(-180, 10, -150, 6); ctx.closePath(); ctx.fill(); ink(ctx, 3);
    ctx.beginPath(); ctx.ellipse(0, 0, 160, 50, 0, 0, TAU); ctx.fill(); ink(ctx, 3);
    ctx.fillStyle = '#cfe3ff'; ctx.beginPath(); ctx.ellipse(20, 26, 120, 20, 0, 0, Math.PI); ctx.fill();
    ctx.strokeStyle = 'rgba(23,35,61,0.3)'; ctx.lineWidth = 2;
    for (var k = 0; k < 5; k++) { ctx.beginPath(); ctx.moveTo(60 + k * 14, 18); ctx.lineTo(40 + k * 14, 40); ctx.stroke(); }
    face(ctx, 110, -6, 1.3, 'happy');
    // tia nước phun hình trái tim nhỏ
    var k2 = (t * 0.5) % 1;
    ctx.fillStyle = 'rgba(200,240,255,' + (1 - k2).toFixed(2) + ')';
    ctx.beginPath(); ctx.arc(70, -60 - k2 * 30, 6 + k2 * 6, 0, TAU); ctx.arc(84, -66 - k2 * 30, 5 + k2 * 5, 0, TAU); ctx.fill();
  });

  // Đàn cá nhỏ.
  S.registerLayer('science-fishes', function (ctx, L, cam, t) {
    var px = L.parallax == null ? 0.4 : L.parallax, cols = ['#ffd23f', '#ff8fb1', '#7fe0ff', '#9be15d'];
    for (var g = 0; g < 4; g++) {
      var gx = wrap(g * 300 - t * 40 - cam * px, W + 200) - 100, gy = (L.y == null ? 150 : L.y) + g * 60 + Math.sin(t + g) * 12;
      for (var i = 0; i < 4; i++) {
        var fx = gx + (i % 2) * 22 + i * 14, fy = gy + (i % 2 ? 12 : -6);
        ctx.fillStyle = cols[(g + i) % 4];
        ctx.beginPath(); ctx.ellipse(fx, fy, 10, 6, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.moveTo(fx + 8, fy); ctx.lineTo(fx + 16, fy - 6); ctx.lineTo(fx + 16, fy + 6); ctx.closePath(); ctx.fill();
        ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(fx - 5, fy - 1, 1.5, 0, TAU); ctx.fill();
      }
    }
  });

  // Các hành tinh ở xa (Sao Thổ, Sao Mộc, Trái Đất…).
  S.registerLayer('science-planets', function (ctx, L, cam, t) {
    var px = L.parallax == null ? 0.05 : L.parallax;
    var list = L.planets || [{ kind: 'saturn', x: 160, y: 120, r: 34 }, { kind: 'earth', x: 520, y: 90, r: 26 }, { kind: 'jupiter', x: 840, y: 170, r: 46 }, { kind: 'mars', x: 1180, y: 110, r: 20 }];
    var span = L.spacing || 1300;
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      var x = wrap(p.x - cam * px, span) - 120;
      if (x < -150 || x > W + 150) continue;
      ctx.save(); ctx.translate(x, p.y + Math.sin(t * 0.6 + i) * 4);
      drawPlanet(ctx, p.kind, p.r, t);
      ctx.restore();
    }
    // sao băng thỉnh thoảng vụt qua
    var k = (t * 0.25) % 1;
    if (k < 0.3) {
      var sx = 900 - k * 2400, sy = 40 + k * 500;
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.9 - k * 3).toFixed(2) + ')'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 60, sy - 14); ctx.stroke();
    }
  });

  // Đồi Mặt Trăng xám có miệng hố.
  S.registerLayer('science-moonhills', function (ctx, L, cam, t) {
    var px = L.parallax == null ? 0.3 : L.parallax, span = L.spacing || 340, y = L.y == null ? 440 : L.y, hgt = L.height || 70;
    for (var i = -1; i < W / span + 2; i++) {
      var cx = i * span - wrap(cam * px, span) + span / 2;
      ctx.fillStyle = L.color || '#8a8fb0';
      ctx.beginPath(); ctx.ellipse(cx, y, span * 0.62, hgt, 0, Math.PI, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(23,35,61,0.15)';
      ctx.beginPath(); ctx.ellipse(cx - 40, y - hgt * 0.45, 22, 6, 0, 0, TAU); ctx.ellipse(cx + 60, y - hgt * 0.25, 14, 4, 0, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = L.color || '#8a8fb0'; ctx.fillRect(0, y - 1, W, H - y + 1);
  });

  // Tường phòng thí nghiệm: kệ, bình hoá chất sủi bọt, bảng vẽ hành tinh.
  S.registerLayer('science-labwall', function (ctx, L, cam, t) {
    var px = L.parallax == null ? 0.2 : L.parallax, span = 520;
    for (var i = -1; i < W / span + 2; i++) {
      var x = i * span - wrap(cam * px, span);
      // bảng
      rr(ctx, x + 40, 90, 200, 130, 10); ctx.fillStyle = '#2f5e4e'; ctx.fill(); ink(ctx, 4);
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x + 100, 150, 22, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(x + 100, 150, 42, 10, -0.3, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + 185, 140, 12, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 160, 190); ctx.lineTo(x + 215, 190); ctx.stroke();
      // kệ + bình
      ctx.fillStyle = '#a0704a'; ctx.fillRect(x + 300, 250, 180, 12);
      var cols = ['#7fe0ff', '#ff8fb1', '#9be15d'];
      for (var b = 0; b < 3; b++) {
        var bx = x + 330 + b * 55;
        ctx.beginPath(); ctx.moveTo(bx - 6, 200); ctx.lineTo(bx - 6, 215); ctx.lineTo(bx - 20, 250); ctx.lineTo(bx + 20, 250); ctx.lineTo(bx + 6, 215); ctx.lineTo(bx + 6, 200); ctx.closePath();
        ctx.fillStyle = cols[b]; ctx.fill(); ink(ctx, 2.5);
        var k = (t * 0.8 + b * 0.3) % 1;
        ctx.fillStyle = 'rgba(255,255,255,' + (1 - k).toFixed(2) + ')';
        ctx.beginPath(); ctx.arc(bx + Math.sin(k * 8) * 4, 196 - k * 40, 4, 0, TAU); ctx.fill();
      }
    }
  });

  // =====================================================================================
  // SÀN / BỤC riêng từng chủ đề (drawCustom.platform). Trả true = đã vẽ.
  // =====================================================================================
  function floorBase(ctx, a, fill, top, topH) {
    ctx.fillStyle = fill; ctx.fillRect(a.x, a.y, a.w, a.h);
    ctx.fillStyle = top; ctx.fillRect(a.x, a.y, a.w, topH || 9);
    ctx.fillStyle = INK; ctx.fillRect(a.x, a.y + (topH || 9), a.w, 2.5);
  }
  // a = Platform {x, y, w, h, isFloor} (thế giới, góc trên-trái). Sàn chính ở y = 480 → y > 470 coi là sàn.
  function isFloor(a) { return a.isFloor || a.y > 470; }

  function dinoPlatform(ctx, a) {
    if (isFloor(a)) {
      floorBase(ctx, a, '#9c6b45', '#7ccf5a', 10);
      ctx.fillStyle = '#86b84a';
      for (var gx = a.x + 8; gx < a.x + a.w - 6; gx += 22) { ctx.beginPath(); ctx.moveTo(gx, a.y + 1); ctx.lineTo(gx + 5, a.y - 7); ctx.lineTo(gx + 10, a.y + 1); ctx.fill(); }
      ctx.fillStyle = 'rgba(0,0,0,0.1)';
      for (var px = a.x + 30; px < a.x + a.w - 10; px += 90) { ctx.beginPath(); ctx.ellipse(px, a.y + 35, 10, 5, 0, 0, TAU); ctx.fill(); }
      return true;
    }
    rr(ctx, a.x, a.y, a.w, a.h, 9); ctx.fillStyle = '#b39477'; ctx.fill(); ink(ctx, 3);
    rr(ctx, a.x + 3, a.y + 2, a.w - 6, 6, 3); ctx.fillStyle = '#a7d86a'; ctx.fill();
    ctx.strokeStyle = 'rgba(23,35,61,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(a.x + a.w * 0.3, a.y + 9); ctx.lineTo(a.x + a.w * 0.35, a.y + a.h - 2); ctx.moveTo(a.x + a.w * 0.7, a.y + 9); ctx.lineTo(a.x + a.w * 0.66, a.y + a.h - 2); ctx.stroke();
    return true;
  }

  function bodyPlatform(ctx, a, t) {
    if (isFloor(a)) {
      floorBase(ctx, a, '#e86a86', '#ffb8c8', 10);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      for (var px = a.x + 20; px < a.x + a.w - 10; px += 60) { ctx.beginPath(); ctx.ellipse(px, a.y + 30 + (px % 3) * 6, 14, 6, 0, 0, TAU); ctx.fill(); }
      return true;
    }
    // bục hình khúc xương
    var y = a.y + a.h / 2;
    boneShape(ctx, a.x + 4, a.y, a.w - 8, a.h, '#fff7e8');
    if (a.w > 90) face(ctx, a.x + a.w / 2, y - 1, 0.55, 'happy');
    return true;
  }

  function oceanPlatform(ctx, a, t) {
    if (isFloor(a)) {
      floorBase(ctx, a, '#d9b56f', '#f6dfa8', 10);
      ctx.fillStyle = 'rgba(160,110,50,0.3)';
      for (var px = a.x + 14; px < a.x + a.w - 6; px += 34) { ctx.beginPath(); ctx.arc(px, a.y + 22 + (px * 7 % 20), 2.5, 0, TAU); ctx.fill(); }
      return true;
    }
    rr(ctx, a.x, a.y, a.w, a.h, 10); ctx.fillStyle = '#8f7fd8'; ctx.fill(); ink(ctx, 3);
    ctx.fillStyle = '#ff9ec0';
    for (var bx = a.x + 14; bx < a.x + a.w - 8; bx += 26) { ctx.beginPath(); ctx.arc(bx, a.y + 2, 6, Math.PI, 0); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.arc(a.x + 16, a.y + 11, 3, 0, TAU); ctx.arc(a.x + a.w - 20, a.y + 12, 2.5, 0, TAU); ctx.fill();
    return true;
  }

  function spacePlatform(ctx, a, t) {
    if (isFloor(a)) {
      floorBase(ctx, a, '#9aa0b8', '#d4d8e6', 9);
      ctx.fillStyle = 'rgba(23,35,61,0.18)';
      for (var px = a.x + 40; px < a.x + a.w - 20; px += 110) { ctx.beginPath(); ctx.ellipse(px, a.y + 28 + (px % 2) * 8, 18, 6, 0, 0, TAU); ctx.fill(); }
      return true;
    }
    // tấm kim loại trạm vũ trụ, đèn chạy
    rr(ctx, a.x, a.y, a.w, a.h, 6); ctx.fillStyle = '#c6d5e3'; ctx.fill(); ink(ctx, 3);
    ctx.fillStyle = '#5d7891';
    for (var rx = a.x + 10; rx < a.x + a.w - 4; rx += 30) { ctx.beginPath(); ctx.arc(rx, a.y + a.h / 2 + 2, 2, 0, TAU); ctx.fill(); }
    var k = Math.floor(t * 4) % Math.max(1, Math.floor(a.w / 30));
    ctx.fillStyle = '#7fe0ff'; ctx.fillRect(a.x + 4 + k * 30, a.y + 2, 18, 3);
    return true;
  }

  // =====================================================================================
  // CHỦ ĐỀ
  // =====================================================================================

  // Mẫu ThemeDef: layers xếp XA → GẦN (parallax tăng dần 0.06 → 0.42); 'mountains' là lớp thư viện chung,
  // 'science-*' là lớp đăng ký ở trên. decor đặt theo chu kỳ every px từ start px (thế giới);
  // fossil đặt y: 515 tức là NẰM TRONG lớp đất dưới mặt sàn 480.
  // 🧪 Thử: đổi parallax của lớp 'science-longnecks' 0.2 → 0.9 rồi chạy trong màn science-dino-1: đàn khủng long
  //   trôi gần bằng tốc độ sàn, cảm giác "ở xa" mất hẳn.
  // Thời khủng long: trời cam ấm, núi lửa cười, khủng long cổ dài nhai lá ở xa.
  S.registerTheme('science-dino', {
    name: 'Thời khủng long', base: 'garden',
    sky: { top: '#ffb38a', bottom: '#fff0c4', sun: { x: 760, y: 110, r: 48, color: '#ffe08a' }, clouds: { color: 'rgba(255,255,255,0.75)', count: 5 } },
    layers: [
      { kind: 'mountains', parallax: 0.06, y: 410, height: 150, color: '#e3a07a', spacing: 360 },
      { kind: 'science-row', decor: 'science-volcano', parallax: 0.1, y: 420, scale: 0.9, spacing: 540, offset: 120 },
      { kind: 'science-longnecks', parallax: 0.2, y: 452, scale: 0.85, spacing: 700, color: '#8fbf86' },
      { kind: 'science-row', decor: 'science-fern', parallax: 0.42, y: 470, scale: 0.9, spacing: 210, opts: { color: '#5aa94e' } }
    ],
    platformStyle: { floor: { fill: '#9c6b45', top: '#7ccf5a', topH: 10 }, ledge: { fill: '#b39477', top: '#a7d86a', radius: 9 } },
    decor: [
      { kind: 'science-fern', every: 560, start: 260, scale: 1 },
      { kind: 'science-egg', every: 1150, start: 620, scale: 0.9 },
      { kind: 'science-fossil', every: 700, start: 420, y: 515, scale: 0.9 },
      { kind: 'science-bone', every: 1300, start: 980, scale: 0.8, opts: { rot: -0.15 } }
    ],
    ambient: { kind: 'leaves', color: 'rgba(120,190,90,0.7)' },
    drawCustom: { platform: function (ctx, a, t) { return dinoPlatform(ctx, a); } }
  });

  // Bên trong cơ thể: hồng ấm, mạch máu mềm mại, hồng cầu trôi, trái tim đập ở xa.
  S.registerTheme('science-body', {
    name: 'Bên trong cơ thể', base: 'kitchen',
    sky: { top: '#ffd6e0', bottom: '#ffb0c2', clouds: false },
    layers: [
      { kind: 'science-bigheart', parallax: 0.05, y: 330, scale: 3.2, alpha: 0.45 },
      { kind: 'science-vessels', parallax: 0.12, y: 150, color: '#ff9db0' },
      { kind: 'science-cells', parallax: 0.25, y: 90, height: 240, count: 8, scale: 0.6 },
      { kind: 'hills', parallax: 0.35, y: 470, height: 50, color: '#f7a0b4', spacing: 300 }
    ],
    platformStyle: { floor: { fill: '#e86a86', top: '#ffb8c8', topH: 10 }, ledge: { fill: '#fff7e8', top: '#ffffff', radius: 10 } },
    decor: [
      { kind: 'science-tooth', every: 900, start: 330, scale: 0.8 },
      { kind: 'science-heart', every: 1200, start: 760, scale: 0.7 },
      { kind: 'science-cell', every: 520, start: 540, scale: 0.8 },
      { kind: 'science-bone', every: 1100, start: 1120, scale: 0.75 }
    ],
    ambient: { kind: 'bubbles', color: 'rgba(255,255,255,0.55)' },
    drawCustom: { platform: function (ctx, a, t) { return bodyPlatform(ctx, a, t); } }
  });

  // Đại dương sâu: xanh thẫm dịu, tia nắng, cá voi xanh bơi ở xa, san hô cười, bong bóng.
  S.registerTheme('science-ocean', {
    name: 'Đại dương sâu', base: 'garden',
    sky: { top: '#3fa4d8', bottom: '#123d75', clouds: false },
    layers: [
      { kind: 'science-rays', parallax: 0.08 },
      { kind: 'science-whale', parallax: 0.06, y: 170, scale: 1.1 },
      { kind: 'science-fishes', parallax: 0.3, y: 120 },
      { kind: 'science-kelp', parallax: 0.3, y: 480, height: 220, color: 'rgba(16,80,110,0.6)' },
      { kind: 'hills', parallax: 0.4, y: 474, height: 40, color: '#2f6f8f', spacing: 280 }
    ],
    platformStyle: { floor: { fill: '#d9b56f', top: '#f6dfa8', topH: 10 }, ledge: { fill: '#8f7fd8', top: '#ff9ec0', radius: 10 } },
    decor: [
      { kind: 'science-coral', every: 640, start: 300, scale: 1 },
      { kind: 'science-seaweed', every: 380, start: 140, scale: 1 },
      { kind: 'science-shell', every: 900, start: 560, scale: 0.9 },
      { kind: 'science-jelly', every: 1000, start: 820, y: 240, scale: 0.9 },
      { kind: 'science-anglerfish', every: 1400, start: 1150, y: 210, scale: 0.8 }
    ],
    ambient: { kind: 'bubbles', color: 'rgba(220,245,255,0.6)' },
    drawCustom: { platform: function (ctx, a, t) { return oceanPlatform(ctx, a, t); } }
  });

  // Hệ Mặt Trời: trời tím đêm đầy sao, hành tinh có mặt, sao băng, mặt đất Mặt Trăng.
  S.registerTheme('science-space', {
    name: 'Hệ Mặt Trời', base: 'lair',
    sky: { top: '#0d1240', bottom: '#3a2a78', stars: true, clouds: false, sun: { x: 90, y: 90, r: 34, color: '#ffcf3f' } },
    layers: [
      { kind: 'science-planets', parallax: 0.05 },
      { kind: 'science-moonhills', parallax: 0.2, y: 430, height: 60, color: '#5f6490', spacing: 420 },
      { kind: 'science-moonhills', parallax: 0.35, y: 462, height: 45, color: '#7d82a8', spacing: 300 }
    ],
    platformStyle: { floor: { fill: '#9aa0b8', top: '#d4d8e6', topH: 9 }, ledge: { fill: '#c6d5e3', top: '#7fe0ff', radius: 6 } },
    decor: [
      { kind: 'science-rocket', at: [150], scale: 1 },
      { kind: 'science-crater', every: 430, start: 380, y: 484, scale: 1 },
      { kind: 'science-flag', every: 1500, start: 900, scale: 0.9 },
      { kind: 'science-satellite', every: 1200, start: 700, y: 170, scale: 0.8 },
      { kind: 'science-star', every: 520, start: 450, y: 110, scale: 0.6 }
    ],
    ambient: { kind: 'sparkle', color: 'rgba(255,255,255,0.75)' },
    drawCustom: { platform: function (ctx, a, t) { return spacePlatform(ctx, a, t); } }
  });

  // Phòng thí nghiệm của Rô-bốt Bíp (chỉ dùng làm nền truyện tranh mở đầu / kết thúc).
  S.registerTheme('science-lab', {
    name: 'Phòng thí nghiệm', base: 'kitchen',
    sky: { top: '#dff3ff', bottom: '#f1f4ff', clouds: false },
    layers: [
      { kind: 'science-labwall', parallax: 0.1 },
      { kind: 'science-row', decor: 'science-timemachine', parallax: 0.25, y: 470, scale: 1, spacing: 1200, offset: -620 }
    ],
    platformStyle: { floor: { fill: '#b9c6e8', top: '#e3e9f8', topH: 9 }, ledge: { fill: '#c6d5e3', top: '#7fe0ff', radius: 6 } },
    decor: []
  });
})();
