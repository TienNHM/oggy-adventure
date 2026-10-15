/* OG.Decor — THƯ VIỆN decor và lớp parallax dùng chung cho mọi hành trình.
 * Chủ sở hữu v2: agent cảnh nền (src/gfx/scenery.js, src/gfx/decor*.js). Hợp đồng: docs/STORY.md mục 4.
 *
 * Đăng ký qua sổ OG.Scenery (src/core/scenery-registry.js):
 *   OG.Scenery.registerDecor(kind, fn(ctx, x, y, scale, t, opts))   x = tâm, y = mặt đất; không gian thế giới
 *   OG.Scenery.registerLayer(kind, fn(ctx, layer, camX, t, theme))   không gian màn hình, phủ ngang 960 px
 * Hành trình chỉ THAM CHIẾU kind theo tên; thiếu kind -> OG.Scenery vẽ hình dự phòng (không lỗi).
 *
 * BẢN STUB: vài kind mẫu. Agent cảnh nền bổ sung (có thể tách thêm decor-<nhóm>.js, ghi vào INTEGRATION.md).
 * Phong cách: viền ink dày bo tròn, màu tươi, đồ vật có khuôn mặt (OG.Decor.face). */
(function () {
  'use strict';
  var OG = window.OG;
  var TAU = Math.PI * 2;
  var INK = '#17233d';

  function wrap(x, span) { return ((x % span) + span) % span; }

  // Khuôn mặt dễ thương dùng chung cho đồ vật: mắt tròn + má hồng + miệng cười.
  function face(ctx, x, y, s, mood) {
    ctx.save();
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.arc(x - 6 * s, y, 2.4 * s, 0, TAU); ctx.arc(x + 6 * s, y, 2.4 * s, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,120,150,0.55)';
    ctx.beginPath(); ctx.arc(x - 10 * s, y + 5 * s, 2.6 * s, 0, TAU); ctx.arc(x + 10 * s, y + 5 * s, 2.6 * s, 0, TAU); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.8 * s; ctx.lineCap = 'round';
    ctx.beginPath();
    if (mood === 'o') ctx.arc(x, y + 6 * s, 2.5 * s, 0, TAU);
    else ctx.arc(x, y + 3 * s, 4 * s, 0.25, Math.PI - 0.25);
    ctx.stroke();
    ctx.restore();
  }

  function outline(ctx, w) { ctx.strokeStyle = INK; ctx.lineWidth = w || 3; ctx.lineJoin = 'round'; ctx.stroke(); }

  var Decor = (OG.Decor = { face: face, outline: outline });

  // ---- Decor mẫu ----
  OG.Scenery.registerDecor('bush', function (ctx, x, y, s, t, o) {
    ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = o.color || '#6cc35a';
    ctx.beginPath(); ctx.arc(-16, -14, 15, 0, TAU); ctx.arc(0, -24, 18, 0, TAU); ctx.arc(16, -14, 15, 0, TAU); ctx.rect(-30, -14, 60, 14);
    ctx.fill(); outline(ctx);
    face(ctx, 0, -18, 1);
  });

  OG.Scenery.registerDecor('flower', function (ctx, x, y, s, t, o) {
    ctx.translate(x, y); ctx.scale(s, s);
    ctx.strokeStyle = '#3f9a45'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.sin(t * 2) * 3, -34); ctx.stroke();
    ctx.translate(Math.sin(t * 2) * 3, -38);
    ctx.fillStyle = o.color || '#ff8fb1';
    for (var i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(Math.cos(i * TAU / 6) * 9, Math.sin(i * TAU / 6) * 9, 7, 0, TAU); ctx.fill(); outline(ctx, 2); }
    ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.fill(); outline(ctx, 2);
    face(ctx, 0, -1, 0.55);
  });

  OG.Scenery.registerDecor('rock', function (ctx, x, y, s, t, o) {
    ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = o.color || '#a3a9b8';
    ctx.beginPath(); ctx.ellipse(0, -14, 26, 16, 0, Math.PI, 0); ctx.lineTo(26, 0); ctx.lineTo(-26, 0); ctx.closePath(); ctx.fill(); outline(ctx);
    face(ctx, 0, -12, 0.8);
  });

  // Cuốn sách có mặt (biểu tượng Bách Khoa / Sổ tay).
  OG.Scenery.registerDecor('book', function (ctx, x, y, s, t, o) {
    ctx.translate(x, y); ctx.scale(s, s);
    OG.util.roundRectPath(ctx, -22, -50, 44, 50, 6); ctx.fillStyle = o.color || '#ed713c'; ctx.fill(); outline(ctx);
    ctx.fillStyle = '#fff6df'; ctx.fillRect(-16, -44, 32, 6);
    face(ctx, 0, -24, 1);
  });

  // ---- Lớp parallax mẫu ----
  // layer: {kind, parallax, y, height, color, spacing}
  OG.Scenery.registerLayer('hills', function (ctx, L, cam) {
    var px = L.parallax == null ? 0.3 : L.parallax, span = L.spacing || 360, y = L.y == null ? 420 : L.y, hgt = L.height || 70;
    ctx.fillStyle = L.color || '#8fd27a';
    for (var i = -1; i < OG.W / span + 2; i++) {
      var cx = i * span - wrap(cam * px, span) + span / 2;
      ctx.beginPath(); ctx.ellipse(cx, y, span * 0.6, hgt, 0, Math.PI, TAU); ctx.fill();
    }
    ctx.fillRect(0, y, OG.W, OG.H - y);
  });

  OG.Scenery.registerLayer('mountains', function (ctx, L, cam) {
    var px = L.parallax == null ? 0.15 : L.parallax, span = L.spacing || 300, y = L.y == null ? 430 : L.y, hgt = L.height || 160;
    ctx.fillStyle = L.color || '#7fa4c9';
    ctx.beginPath(); ctx.moveTo(0, OG.H);
    for (var i = -1; i < OG.W / span + 2; i++) {
      var x0 = i * span - wrap(cam * px, span);
      ctx.lineTo(x0, y); ctx.lineTo(x0 + span / 2, y - hgt * (0.7 + 0.3 * ((i * 7 + 3) % 3) / 2)); ctx.lineTo(x0 + span, y);
    }
    ctx.lineTo(OG.W, OG.H); ctx.closePath(); ctx.fill();
  });

  OG.Scenery.registerLayer('waves', function (ctx, L, cam, t) {
    var px = L.parallax == null ? 0.4 : L.parallax, y = L.y == null ? 440 : L.y;
    ctx.fillStyle = L.color || '#4fb3e8';
    ctx.beginPath(); ctx.moveTo(0, OG.H);
    for (var x = 0; x <= OG.W; x += 12) ctx.lineTo(x, y + Math.sin((x + cam * px) / 40 + t * 2) * 6);
    ctx.lineTo(OG.W, OG.H); ctx.closePath(); ctx.fill();
  });

  // Lớp rải decor lặp lại ở xa (vd hàng cây): {kind:'decorRow', decor:'bush', y, scale, spacing, parallax}
  OG.Scenery.registerLayer('decorRow', function (ctx, L, cam, t) {
    var px = L.parallax == null ? 0.3 : L.parallax, span = L.spacing || 220;
    for (var i = -1; i < OG.W / span + 2; i++) {
      OG.Scenery.drawDecor(ctx, L.decor || 'bush', i * span - wrap(cam * px, span), L.y == null ? 430 : L.y, L.scale || 0.8, t, L.opts);
    }
  });

  Decor.ready = true;
})();
