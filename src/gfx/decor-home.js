// @ts-check
/* ============================================================================
 * OG.Decor (phần mở rộng) — DECOR ĐỒ VẬT TRONG NHÀ, GAG NỀN & KHOA HỌC
 * ----------------------------------------------------------------------------
 * Vai trò:      Lúc load, đăng ký thêm ~30 kind decor dùng chung (không tiền tố) vào OG.Scenery qua OG.Decor.define.
 *               ThemeDef của hành trình (vd src/journeys/home/theme.js) và chủ đề gốc 'kitchen' chỉ gọi theo tên.
 * Khái niệm:    hàm vẽ có tham số tái sử dụng (vẽ quanh chân, opts đổi màu/mood) · registry · vẽ procedural ·
 *               hoạt ảnh theo chu kỳ thời gian (wrap(t, chu kỳ) → kịch bản nhỏ nhiều pha, như state machine không lưu trạng thái) ·
 *               biến thể ổn định bằng hash(vị trí) · tái dùng decor khác (pepper → salt, gagCat → bush)
 * Bài học:      docs/learn/07-ve-canvas-procedural-cache.md (chính) · docs/learn/12-data-driven-man-cau-do-hanh-trinh.md
 * Phụ thuộc:    LÚC LOAD: OG.Decor (define, face, inkFill, outline, shade, rr, hash, wrap, INK) — load SAU src/gfx/decor.js.
 *               LÚC CHẠY: OG.Scenery.drawDecor (decor gọi decor khác), OG.font
 * Event:        phát: (không) · nghe: (không)
 * API công khai: các kind decor dưới đây (vẽ bằng OG.Scenery.drawDecor(ctx, kind, x, y, scale, t, opts));
 *               tiện ích OG.Decor.steam(ctx, t, seed), OG.Decor.babyRoach(ctx, t, mood, runK)
 * Đọc tiếp:     src/gfx/decor-places.js (nhà cửa, danh thắng — cùng cách viết) → src/journeys/home/theme.js (nơi dùng)
 * ========================================================================== */
/* Mọi decor: fn(ctx, x, y, scale, t, opts), x = tâm, y = mặt đất (chân). Trong hàm define: o = opts, wx = x thế giới.
 * Trong nhà: fridge, teapot, salt, pepper, stove, plant, clock, cake, toaster, cup, sofa, tv, rug
 * Gag nền:   gagBob (Bob ngủ gật, bong bóng mũi), gagRoach (gián con lén ăn bánh rồi chuồn), gagCat (mèo lén nhìn)
 * Khoa học:  rocket, beaker, microscope, atom, dinoEgg, satellite, fossil, magnet */
(function () {
  'use strict';
  var OG = window.OG;
  var D = OG.Decor;
  if (!D || !D.define) { if (window.console) console.warn('[OG.Decor] decor-home.js cần decor.js load trước'); return; }
  var TAU = Math.PI * 2, INK = D.INK;
  var def = D.define, face = D.face, inkFill = D.inkFill, outline = D.outline, shade = D.shade, rr = D.rr, hash = D.hash, wrap = D.wrap;

  /**
   * Vẽ 2 làn hơi nước xoăn bay lên từ gốc (0, 0) hiện tại, mờ dần theo độ cao.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} t     giây
   * @param {number} seed  0..1, lệch pha để các ấm/cốc không bốc hơi cùng nhịp (thường là hash(wx))
   */
  function steam(ctx, t, seed) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (var i = 0; i < 2; i++) {
      // k = "tuổi" làn hơi 0..1: k tăng → bay cao hơn (−k × 30 px) và mờ hơn (alpha = 1 − k)
      var k = wrap(t * 0.6 + i * 0.5 + seed, 1);
      ctx.globalAlpha = 1 - k;
      ctx.beginPath();
      for (var j = 0; j <= 8; j++) { var yy = -k * 30 - j * 3, xx = Math.sin(j * 0.9 + t * 3 + i) * 3 + i * 8 - 4; if (j === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy); }
      ctx.stroke();
    }
    ctx.restore();
  }
  D.steam = steam;

  // ===========================================================================
  // ĐỒ VẬT TRONG NHÀ (có mặt cười)
  // ===========================================================================

  // Tủ lạnh: thỉnh thoảng cửa hé, ánh sáng lọt ra. opts.color.
  def('fridge', function (ctx, t, o, wx) {
    var c = o.color || '#e8f6ff', k = wrap(t * 0.5 + hash(wx) * 5, 7);
    // 💡 Khái niệm: hoạt ảnh theo chu kỳ — k chạy 0..7 rồi lặp; chỉ trong khoảng 5.6..6.6 cửa mới hé
    // (sin của nửa chu kỳ: mở dần rồi đóng lại). Không lưu biến trạng thái nào, chỉ cần t.
    var open = k > 5.6 && k < 6.6 ? Math.sin((k - 5.6) * Math.PI) : 0;
    D.shadow(ctx, 40);
    rr(ctx, -36, -150, 72, 150, 14); inkFill(ctx, c, 3);
    if (open > 0.05) { ctx.fillStyle = 'rgba(255,248,190,0.9)'; rr(ctx, -30, -142, 60, 72, 8); ctx.fill(); }
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-36, -64); ctx.lineTo(36, -64); ctx.stroke();
    // cửa ngăn đá xoay quanh bản lề trái: dời gốc về bản lề rồi co bề ngang (giả phối cảnh khi cửa mở)
    ctx.save(); ctx.translate(-36, 0); ctx.scale(1 - open * 0.55, 1);
    rr(ctx, 0, -150, 72, 86, 14); inkFill(ctx, c, 3);
    rr(ctx, 58, -132, 7, 34, 3); inkFill(ctx, '#b8c8d8', 1.5);
    ctx.restore();
    rr(ctx, 22, -54, 7, 30, 3); inkFill(ctx, '#b8c8d8', 1.5);
    face(ctx, 0, -106, 1.2, open > 0.05 ? 'o' : (o.mood || 'grin'), t);
    // nam châm
    ctx.fillStyle = '#ff6f6f'; ctx.beginPath(); ctx.arc(-18, -40, 6, 0, TAU); ctx.fill(); outline(ctx, 1.5);
    ctx.fillStyle = '#ffd23f'; D.star(ctx, 0, -30, 7, 3, 0); ctx.fill(); outline(ctx, 1.2);
    ctx.fillStyle = '#7fd08a'; D.heart(ctx, -6, -48, 5); ctx.fill(); outline(ctx, 1.2);
  });

  // Ấm trà có mặt, nắp nhảy và hơi nước. opts.color.
  def('teapot', function (ctx, t, o, wx) {
    var c = o.color || '#8fd3ff', hop = Math.max(0, Math.sin(t * 6 + hash(wx) * 6)) * 3;
    ctx.save(); ctx.translate(-30, -30); steam(ctx, t, hash(wx)); ctx.restore();
    ctx.beginPath(); ctx.moveTo(-18, -14); ctx.quadraticCurveTo(-34, -18, -36, -32); ctx.lineTo(-30, -34); ctx.quadraticCurveTo(-26, -24, -16, -24); ctx.closePath(); inkFill(ctx, c, 2);
    ctx.beginPath(); ctx.arc(22, -20, 10, -1.4, 1.4); ctx.strokeStyle = INK; ctx.lineWidth = 8; ctx.stroke(); ctx.strokeStyle = c; ctx.lineWidth = 3.5; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, -18, 24, 18, 0, 0, TAU); inkFill(ctx, c, 2.5);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(-12, -24, 3, 0, TAU); ctx.arc(10, -10, 2.4, 0, TAU); ctx.fill();
    ctx.save(); ctx.translate(0, -hop);
    ctx.beginPath(); ctx.ellipse(0, -35, 14, 5, 0, 0, TAU); inkFill(ctx, shade(c, -0.1), 2);
    ctx.beginPath(); ctx.arc(0, -42, 4, 0, TAU); inkFill(ctx, '#ffd23f', 1.5);
    ctx.restore();
    face(ctx, 0, -20, 0.8, o.mood || 'happy', t);
  });

  // Lọ muối (lắc rắc muối). opts.color nắp, opts.pepper -> lọ tiêu.
  def('salt', function (ctx, t, o, wx) {
    var pep = !!o.pepper, ph = hash(wx) * 6, k = wrap(t * 0.4 + ph, 4);
    var tilt = k < 1 ? Math.sin(k * Math.PI * 3) * 0.25 : 0;
    ctx.rotate(tilt);
    rr(ctx, -14, -46, 28, 46, 10); inkFill(ctx, pep ? '#5b6378' : '#ffffff', 2.5);
    ctx.beginPath(); ctx.moveTo(-14, -42); ctx.quadraticCurveTo(0, -60, 14, -42); ctx.closePath(); inkFill(ctx, o.color || (pep ? '#e5484d' : '#52c5ee'), 2);
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(-4, -50, 1.2, 0, TAU); ctx.arc(0, -52, 1.2, 0, TAU); ctx.arc(4, -50, 1.2, 0, TAU); ctx.fill();
    if (k < 1) { ctx.fillStyle = pep ? '#3b3f58' : '#ffffff'; for (var i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(-6 + i * 4, -60 - wrap(t * 40 + i * 7, 14), 1.5, 0, TAU); ctx.fill(); } }
    face(ctx, 0, -24, 0.7, pep ? (o.mood || 'wink') : (o.mood || 'smile'), pep ? null : t);
    if (pep) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(-6, -24, 1, 0, TAU); ctx.fill(); }
  });
  // Lọ tiêu = lọ muối với opts.pepper: tái dùng decor khác qua registry, gốc (0,0) vì đã translate/scale sẵn.
  // flip: false — phép lật (nếu có) đã áp ở lớp ngoài, áp lần nữa sẽ lật ngược trở lại.
  def('pepper', function (ctx, t, o) {
    OG.Scenery.drawDecor(ctx, 'salt', 0, 0, 1, t, Object.assign({}, o, { pepper: true, flip: false }));
  });

  // Bếp lò với nồi sôi lục bục. opts.color nồi.
  def('stove', function (ctx, t, o) {
    rr(ctx, -40, -56, 80, 56, 8); inkFill(ctx, '#f4f4f8', 2.5);
    rr(ctx, -30, -40, 60, 30, 6); inkFill(ctx, '#3b3f58', 2);
    ctx.fillStyle = 'rgba(255,170,90,' + (0.5 + 0.3 * Math.sin(t * 8)).toFixed(2) + ')'; rr(ctx, -24, -34, 48, 18, 4); ctx.fill();
    [-24, -8, 8, 24].forEach(function (x) { ctx.beginPath(); ctx.arc(x, -50, 3, 0, TAU); ctx.fillStyle = '#ff9a3c'; ctx.fill(); outline(ctx, 1.2); });
    var c = o.color || '#ff8a5c', bob = Math.sin(t * 10) * 1;
    rr(ctx, -26, -92 + bob, 52, 36, 10); inkFill(ctx, c, 2.5);
    rr(ctx, -30, -96 + bob, 60, 9, 4); inkFill(ctx, shade(c, -0.15), 2);
    ctx.fillStyle = '#ffffff';
    for (var i = 0; i < 3; i++) { var k = wrap(t * 1.4 + i / 3, 1); ctx.globalAlpha = 1 - k; ctx.beginPath(); ctx.arc(-12 + i * 12, -100 - k * 26, 3 + k * 4, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
    face(ctx, 0, -76 + bob, 0.8, o.mood || 'happy', t);
  });

  // Chậu cây có mặt. opts.color chậu, opts.leaf.
  def('plant', function (ctx, t, o, wx) {
    var sw = Math.sin(t * 1.6 + wx * 0.02) * 0.08, leaf = o.leaf || '#5bbf55';
    ctx.save(); ctx.translate(0, -34); ctx.rotate(sw);
    [-0.9, -0.35, 0.2, 0.75].forEach(function (a, i) {
      ctx.save(); ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-12, -22, 0, -40); ctx.quadraticCurveTo(12, -22, 0, 0); ctx.closePath();
      inkFill(ctx, i % 2 ? leaf : shade(leaf, 0.15), 2); ctx.restore();
    });
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(-20, -36); ctx.lineTo(20, -36); ctx.lineTo(15, 0); ctx.lineTo(-15, 0); ctx.closePath(); inkFill(ctx, o.color || '#f27a43', 2.5);
    rr(ctx, -23, -40, 46, 9, 4); inkFill(ctx, shade(o.color || '#f27a43', 0.2), 2);
    face(ctx, 0, -18, 0.75, o.mood || 'smile', t);
  });

  // Đồng hồ quả lắc đứng. opts.color.
  def('clock', function (ctx, t, o) {
    var c = o.color || '#c98b4f';
    rr(ctx, -24, -150, 48, 150, 12); inkFill(ctx, c, 2.5);
    rr(ctx, -14, -84, 28, 70, 8); inkFill(ctx, shade(c, -0.25), 2);
    var sw = Math.sin(t * 3) * 0.35;
    ctx.save(); ctx.translate(0, -82); ctx.rotate(sw);
    ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 46); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 50, 7, 0, TAU); inkFill(ctx, '#ffd23f', 1.5);
    ctx.restore();
    ctx.beginPath(); ctx.arc(0, -118, 20, 0, TAU); inkFill(ctx, '#fff6df', 2.5);
    face(ctx, 0, -116, 0.65, o.mood || 'smile', t);
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -118); ctx.lineTo(Math.sin(t * 0.4) * 9, -118 - Math.cos(t * 0.4) * 9); ctx.moveTo(0, -118); ctx.lineTo(Math.sin(t * 4) * 14, -118 - Math.cos(t * 4) * 14); ctx.stroke();
  });

  // Bánh kem nhiều tầng + quả anh đào. opts.color kem.
  def('cake', function (ctx, t, o) {
    var c = o.color || '#ffb3c7';
    rr(ctx, -34, -6, 68, 6, 3); inkFill(ctx, '#ffffff', 2);
    rr(ctx, -28, -34, 56, 30, 8); inkFill(ctx, '#f5d28b', 2.5);
    ctx.beginPath(); ctx.moveTo(-28, -26);
    for (var x = -28; x <= 28; x += 8) ctx.quadraticCurveTo(x + 4, -16 - (x % 16 ? 0 : 4), x + 8, -26);
    ctx.lineTo(28, -34); ctx.lineTo(-28, -34); ctx.closePath(); inkFill(ctx, c, 2);
    rr(ctx, -18, -54, 36, 22, 7); inkFill(ctx, c, 2.5);
    ctx.beginPath(); ctx.arc(0, -60, 6, 0, TAU); inkFill(ctx, '#e5484d', 1.5);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -66); ctx.quadraticCurveTo(3, -72, 7, -72); ctx.stroke();
    face(ctx, 0, -44, 0.6, o.mood || 'happy', t);
  });

  // Máy nướng bánh: bánh mì bật lên định kỳ.
  def('toaster', function (ctx, t, o, wx) {
    // chu kỳ 4 nhịp: 0.6 nhịp đầu bánh bật lên (cung sin, cao tối đa 30 px) rồi rơi về, phần còn lại nằm yên
    var k = wrap(t * 0.5 + hash(wx) * 4, 4), pop = k < 0.6 ? Math.sin(k / 0.6 * Math.PI) * 30 : 0;
    [-9, 9].forEach(function (x) {
      rr(ctx, x - 7, -46 - pop, 14, 22, 5); inkFill(ctx, '#e8b56a', 2);
      ctx.fillStyle = '#c98b4f'; ctx.fillRect(x - 5, -44 - pop, 10, 3);
    });
    if (pop > 8) face(ctx, -9, -38 - pop, 0.3, 'happy');
    rr(ctx, -28, -40, 56, 40, 12); inkFill(ctx, o.color || '#c8d4e2', 2.5);
    ctx.fillStyle = INK; ctx.fillRect(-16, -40, 14, 3); ctx.fillRect(2, -40, 14, 3);
    rr(ctx, 26, -26, 6, 10, 2); inkFill(ctx, '#3b3f58', 1.2);
    face(ctx, 0, -20, 0.8, pop > 2 ? 'o' : 'smile', t);
  });

  // Cốc có mặt + hơi nóng. opts.color.
  def('cup', function (ctx, t, o, wx) {
    var c = o.color || '#ffd23f';
    ctx.save(); ctx.translate(0, -30); steam(ctx, t, hash(wx)); ctx.restore();
    ctx.beginPath(); ctx.arc(16, -16, 7, -1.3, 1.3); ctx.strokeStyle = INK; ctx.lineWidth = 7; ctx.stroke(); ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-16, -30); ctx.lineTo(16, -30); ctx.lineTo(13, -2); ctx.quadraticCurveTo(0, 2, -13, -2); ctx.closePath(); inkFill(ctx, c, 2.5);
    face(ctx, 0, -18, 0.6, o.mood || 'happy', t);
  });

  // Ghế sofa êm (có gối). opts.color.
  def('sofa', function (ctx, t, o) {
    var c = o.color || '#f27a43';
    rr(ctx, -70, -60, 140, 44, 16); inkFill(ctx, c, 2.5);
    rr(ctx, -80, -44, 28, 40, 12); inkFill(ctx, shade(c, -0.08), 2.5); rr(ctx, 52, -44, 28, 40, 12); inkFill(ctx, shade(c, -0.08), 2.5);
    rr(ctx, -54, -30, 108, 22, 8); inkFill(ctx, shade(c, 0.12), 2.5);
    ctx.save(); ctx.translate(-30, -40); ctx.rotate(-0.2); rr(ctx, -12, -12, 24, 22, 7); inkFill(ctx, '#8fd3ff', 2); face(ctx, 0, -2, 0.4, 'happy'); ctx.restore();
    rr(ctx, -66, -8, 8, 8, 2); inkFill(ctx, '#8a5a3a', 1.5); rr(ctx, 58, -8, 8, 8, 2); inkFill(ctx, '#8a5a3a', 1.5);
    face(ctx, 20, -46, 0.8, o.mood || 'sleep', t);
  });

  // Ti vi cổ có ăng-ten, màn hình đổi màu. opts.color.
  def('tv', function (ctx, t, o) {
    var c = o.color || '#c98b4f';
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -66); ctx.lineTo(-16, -90); ctx.moveTo(0, -66); ctx.lineTo(18, -88); ctx.stroke();
    rr(ctx, -6, -14, 12, 14, 3); inkFill(ctx, '#3b3f58', 1.5);
    rr(ctx, -40, -68, 80, 56, 12); inkFill(ctx, c, 2.5);
    var hue = Math.floor(wrap(t * 30, 360)); // màn hình đổi màu cầu vồng: hue HSL quay 30 độ/giây
    rr(ctx, -32, -60, 52, 40, 8); ctx.fillStyle = 'hsl(' + hue + ',70%,75%)'; ctx.fill(); outline(ctx, 2);
    face(ctx, -6, -42, 0.7, 'grin', t);
    ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(30, -50, 3.5, 0, TAU); ctx.arc(30, -36, 3.5, 0, TAU); ctx.fill();
  });

  // Thảm tròn sọc (nằm sát sàn). opts.color.
  def('rug', function (ctx, t, o) {
    var c = o.color || '#ff9fc1';
    ctx.beginPath(); ctx.ellipse(0, -3, 60, 7, 0, 0, TAU); inkFill(ctx, c, 2);
    ctx.strokeStyle = shade(c, 0.4); ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, -3, 40, 4, 0, 0, TAU); ctx.stroke();
  });

  // ===========================================================================
  // GAG NỀN (nhỏ, hài hước, không đáng sợ)
  // ===========================================================================

  // Bob (chó bun nâu) ngủ gật: bong bóng mũi phồng xẹp, chữ Z bay; thỉnh thoảng giật mình mở 1 mắt.
  def('gagBob', function (ctx, t, o, wx) {
    var ph = hash(wx) * 10, cyc = wrap(t + ph, 12), peek = cyc > 10.6 && cyc < 11.6; // chu kỳ 12 s, hé mắt 1 s
    var breath = Math.sin(t * 1.6) * 0.04; // thở = squash & stretch nhẹ (rộng ra thì thấp xuống)
    var brown = o.color || '#b7814f', light = shade(brown, 0.35);
    D.shadow(ctx, 44);
    ctx.save(); ctx.scale(1 + breath, 1 - breath);
    // thân nằm
    ctx.beginPath(); ctx.ellipse(10, -16, 40, 18, 0, 0, TAU); inkFill(ctx, brown, 2.5);
    ctx.fillStyle = light; ctx.beginPath(); ctx.ellipse(14, -10, 24, 9, 0, 0, TAU); ctx.fill();
    // đuôi vẫy nhẹ
    ctx.beginPath(); ctx.ellipse(50, -24, 7, 5, Math.sin(t * 4) * 0.4 - 0.6, 0, TAU); inkFill(ctx, brown, 2);
    // chân trước + đầu gối lên
    rr(ctx, -40, -10, 30, 10, 5); inkFill(ctx, light, 2);
    ctx.restore();
    ctx.save(); ctx.translate(-24, -26);
    ctx.beginPath(); ctx.ellipse(0, 0, 24, 19, 0, 0, TAU); inkFill(ctx, brown, 2.5);
    // tai cụp
    ctx.beginPath(); ctx.ellipse(-18, -12, 8, 6, -0.6, 0, TAU); inkFill(ctx, shade(brown, -0.25), 2);
    ctx.beginPath(); ctx.ellipse(18, -12, 8, 6, 0.6, 0, TAU); inkFill(ctx, shade(brown, -0.25), 2);
    // mõm phị
    ctx.beginPath(); ctx.ellipse(0, 7, 15, 9, 0, 0, TAU); inkFill(ctx, light, 2);
    ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(0, 2, 5, 3.5, 0, 0, TAU); ctx.fill();
    // mắt
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(-9, -4, 3.5, 0.2, Math.PI - 0.2); ctx.stroke();
    if (peek) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(9, -4, 4, 0, TAU); ctx.fill(); outline(ctx, 1.5); ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(10, -4, 2, 0, TAU); ctx.fill(); }
    else { ctx.beginPath(); ctx.arc(9, -4, 3.5, 0.2, Math.PI - 0.2); ctx.stroke(); }
    // mũ ngủ
    ctx.beginPath(); ctx.moveTo(-12, -16); ctx.quadraticCurveTo(4, -40, 30, -30); ctx.lineTo(12, -15); ctx.closePath(); inkFill(ctx, o.hat || '#7b6cf0', 2);
    ctx.beginPath(); ctx.arc(31, -30, 4.5, 0, TAU); inkFill(ctx, '#ffffff', 1.5);
    // bong bóng mũi
    if (!peek) {
      var b = 3 + (0.5 + 0.5 * Math.sin(t * 1.6)) * 9;
      ctx.fillStyle = 'rgba(190,230,255,0.75)'; ctx.beginPath(); ctx.arc(6 + b * 0.6, 6, b, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(23,35,61,0.5)'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(4 + b * 0.6, 3, b * 0.25, 0, TAU); ctx.fill();
    }
    ctx.restore();
    // chữ Z bay lên: alpha = sin(k·π) → hiện dần rồi mờ dần; cỡ chữ lớn dần theo k
    ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (var i = 0; i < 3; i++) {
      var k = wrap(t * 0.35 + i / 3, 1);
      ctx.globalAlpha = Math.sin(k * Math.PI);
      ctx.font = OG.font ? OG.font(10 + k * 10, 'bold') : 'bold 14px sans-serif';
      ctx.fillText('z', -10 + k * 22 + Math.sin(k * 6) * 4, -58 - k * 44);
    }
    ctx.globalAlpha = 1;
  });

  // Gián con lén ăn bánh: rón rén vào, gặm, giật mình "!", ôm vụn bánh chạy mất. Chu kỳ ~14 giây.
  /**
   * Vẽ một con gián con dễ thương, gốc = chân, mặt hướng sang phải (+x).
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} t  giây (nhịp chân)
   * @param {string} mood  'look' (đảo mắt) | 'eat' | 'scared' | khác = cười
   * @param {boolean} [runK]  true = đang chạy (chân đạp nhanh hơn)
   */
  function babyRoach(ctx, t, mood, runK) {
    var leg = Math.sin(t * (runK ? 30 : 12)) * 3;
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); for (var i = -1; i <= 1; i++) { ctx.moveTo(i * 6, -6); ctx.lineTo(i * 6 + (i % 2 ? leg : -leg), 0); } ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, -10, 13, 8, 0, 0, TAU); inkFill(ctx, '#b56bc7', 2);
    ctx.strokeStyle = '#7d3e9b'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-2, -17); ctx.lineTo(-2, -3); ctx.stroke();
    ctx.beginPath(); ctx.arc(13, -13, 8, 0, TAU); inkFill(ctx, '#7d3e9b', 2);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(15, -20); ctx.quadraticCurveTo(18, -30, 24, -30); ctx.moveTo(11, -20); ctx.quadraticCurveTo(12, -30, 6, -32); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(12, -15, 3.4, 0, TAU); ctx.arc(18, -15, 3.4, 0, TAU); ctx.fill();
    ctx.fillStyle = INK; var lk = mood === 'look' ? Math.sin(t * 3) * 1.5 : 1;
    ctx.beginPath(); ctx.arc(12 + lk, -15, 1.7, 0, TAU); ctx.arc(18 + lk, -15, 1.7, 0, TAU); ctx.fill();
    ctx.lineWidth = 1.4; ctx.beginPath();
    if (mood === 'eat') { ctx.arc(16, -9, 2.2, 0, TAU); ctx.stroke(); }
    else if (mood === 'scared') { ctx.ellipse(16, -9, 2, 2.6, 0, 0, TAU); ctx.fill(); }
    else { ctx.arc(16, -11, 3, 0.3, Math.PI - 0.3); ctx.stroke(); }
  }
  D.babyRoach = babyRoach;
  def('gagRoach', function (ctx, t, o, wx) {
    var cyc = wrap(t + hash(wx) * 14, 14);
    // 💡 Khái niệm: kịch bản nhiều pha dựa trên thời gian — cyc (0..14 giây) quyết định pha giống một state machine,
    // nhưng trạng thái được TÍNH từ t chứ không lưu: vẽ lại bất kỳ frame nào cũng ra đúng cảnh.
    // 🧪 Thử: đổi các mốc 2/4/9/10/12 bên dưới (vd 9 → 6) để gián gặm bánh ngắn hơn và bỏ chạy sớm.
    // miếng bánh (bị gặm dần)
    var bites = cyc < 4 ? 0 : cyc < 9 ? Math.floor((cyc - 4) / 1.25) : cyc < 13.5 ? 3 : 0;
    ctx.save(); ctx.translate(18, 0);
    ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(18, 0); ctx.lineTo(18, -18); ctx.lineTo(-18, -30); ctx.closePath(); inkFill(ctx, '#f5d28b', 2);
    ctx.fillStyle = o.color || '#ffb3c7'; ctx.beginPath(); ctx.moveTo(-18, -30); ctx.lineTo(18, -18); ctx.lineTo(18, -12); ctx.lineTo(-18, -22); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff';
    for (var b = 0; b < bites; b++) { ctx.beginPath(); ctx.arc(-18, -6 - b * 8, 6, 0, TAU); ctx.fill(); }
    ctx.beginPath(); ctx.arc(6, -26, 4, 0, TAU); inkFill(ctx, '#e5484d', 1.2);
    face(ctx, 4, -10, 0.45, cyc > 4 && cyc < 9.5 ? 'o' : 'smile');
    ctx.restore();
    // gián con
    var x, mood = 'smile', dir = 1, run = false;
    if (cyc < 2) return;
    if (cyc < 4) { x = -70 + (cyc - 2) / 2 * 48; mood = 'look'; }          // rón rén vào
    else if (cyc < 9) { x = -22 + Math.sin(cyc * 8) * 1; mood = 'eat'; }   // gặm bánh
    else if (cyc < 10) { x = -22; mood = 'scared'; }                        // giật mình
    else if (cyc < 12) { x = -22 - (cyc - 10) * 70; mood = 'smile'; dir = -1; run = true; } // chạy mất
    else return;
    ctx.save(); ctx.translate(x, Math.abs(Math.sin(t * (run ? 22 : 8))) * -2); ctx.scale(dir, 1);
    babyRoach(ctx, t, mood, run);
    if (run) { ctx.fillStyle = '#f5d28b'; ctx.beginPath(); ctx.arc(18, -24, 4, 0, TAU); ctx.fill(); outline(ctx, 1.2); }
    ctx.restore();
    if (cyc >= 9 && cyc < 10.2) {
      ctx.fillStyle = '#e5484d'; ctx.textAlign = 'center'; ctx.font = OG.font ? OG.font(18, 'bold') : 'bold 18px sans-serif';
      ctx.fillText('!', -8, -42 - Math.sin((cyc - 9) * 10) * 3);
    }
  });

  // Mèo Oggy (bóng xanh) lén thò đầu sau bụi/hộp, nhìn trái phải rồi thụt vào. Gag nền nhỏ.
  def('gagCat', function (ctx, t, o, wx) {
    // up = 0..1 độ thò đầu theo chu kỳ 9 s: ẩn → nhô lên (0.5 s) → nhìn quanh (2.5 s) → thụt xuống (0.5 s) → ẩn
    var cyc = wrap(t + hash(wx) * 9, 9), up = cyc < 1 ? 0 : cyc < 1.5 ? (cyc - 1) / 0.5 : cyc < 4 ? 1 : cyc < 4.5 ? 1 - (cyc - 4) / 0.5 : 0;
    // bụi che phía trước được vẽ sau (painter's algorithm: vẽ sau = nằm trên) nên phần dưới đầu mèo bị bụi che
    if (up > 0.02) {
      ctx.save(); ctx.translate(0, -22 + (1 - up) * 26);
      var c = o.color || '#328be7';
      ctx.beginPath(); ctx.moveTo(-16, -6); ctx.lineTo(-14, -26); ctx.lineTo(-4, -16); ctx.moveTo(16, -6); ctx.lineTo(14, -26); ctx.lineTo(4, -16);
      ctx.moveTo(18, -4); ctx.ellipse(0, -4, 18, 15, 0, 0, TAU); inkFill(ctx, c, 2);
      ctx.fillStyle = '#d9f0ff'; ctx.beginPath(); ctx.ellipse(0, 2, 10, 6, 0, 0, TAU); ctx.fill();
      var lk = Math.sin(t * 2.5) * 3;
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(-6, -8, 5, 6, 0, 0, TAU); ctx.ellipse(6, -8, 5, 6, 0, 0, TAU); ctx.fill(); outline(ctx, 1.4);
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(-6 + lk, -7, 2.2, 0, TAU); ctx.arc(6 + lk, -7, 2.2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ff8fa3'; ctx.beginPath(); ctx.arc(0, -1, 2.2, 0, TAU); ctx.fill();
      ctx.restore();
    }
    OG.Scenery.drawDecor(ctx, 'bush', 0, 0, 0.9, t, { berries: false, mood: up > 0.5 ? 'o' : 'smile' });
  });

  // ===========================================================================
  // KHOA HỌC & VŨ TRỤ
  // ===========================================================================

  // Tên lửa lắc lư, phụt lửa nhỏ (y = đáy). opts.color, opts.fly: bay lơ lửng.
  def('rocket', function (ctx, t, o, wx) {
    var c = o.color || '#ffffff', ph = hash(wx) * 6;
    if (o.fly) ctx.translate(0, -30 + Math.sin(t * 2 + ph) * 8);
    ctx.rotate(Math.sin(t * 3 + ph) * 0.04);
    // lửa
    var fl = 0.8 + Math.abs(Math.sin(t * 20)) * 0.4;
    ctx.beginPath(); ctx.moveTo(-10, -14); ctx.quadraticCurveTo(0, -14 + 30 * fl, 10, -14); ctx.closePath(); inkFill(ctx, '#ff9a3c', 1.5);
    ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.moveTo(-5, -14); ctx.quadraticCurveTo(0, -14 + 18 * fl, 5, -14); ctx.closePath(); ctx.fill();
    // cánh
    ctx.beginPath(); ctx.moveTo(-16, -40); ctx.lineTo(-30, -14); ctx.lineTo(-14, -18); ctx.closePath(); ctx.moveTo(16, -40); ctx.lineTo(30, -14); ctx.lineTo(14, -18); ctx.closePath(); inkFill(ctx, '#e5484d', 2);
    ctx.beginPath(); ctx.moveTo(-16, -18); ctx.quadraticCurveTo(-20, -70, 0, -100); ctx.quadraticCurveTo(20, -70, 16, -18); ctx.closePath(); inkFill(ctx, c, 2.5);
    ctx.beginPath(); ctx.moveTo(-12, -78); ctx.quadraticCurveTo(-6, -94, 0, -100); ctx.quadraticCurveTo(6, -94, 12, -78); ctx.closePath(); inkFill(ctx, '#e5484d', 2);
    ctx.beginPath(); ctx.arc(0, -56, 10, 0, TAU); inkFill(ctx, '#8fd3ff', 2.2);
    face(ctx, 0, -56, 0.45, 'happy');
    rr(ctx, -16, -22, 32, 6, 2); inkFill(ctx, '#c8d4e2', 1.5);
  });

  // Bình thí nghiệm sủi bọt màu. opts.color dung dịch.
  def('beaker', function (ctx, t, o, wx) {
    var c = o.color || '#7fd08a';
    // Vẽ hình bình 2 lần: lần 1 làm vùng clip cho dung dịch + bọt bên trong, lần 2 chỉ để viền (viền không bị clip cắt mất nửa nét).
    ctx.beginPath(); ctx.moveTo(-8, -50); ctx.lineTo(-8, -32); ctx.lineTo(-24, -4); ctx.quadraticCurveTo(-26, 0, -20, 0); ctx.lineTo(20, 0); ctx.quadraticCurveTo(26, 0, 24, -4); ctx.lineTo(8, -32); ctx.lineTo(8, -50); ctx.closePath();
    ctx.save(); ctx.clip();
    ctx.fillStyle = 'rgba(230,246,255,0.9)'; ctx.fillRect(-30, -60, 60, 60);
    var lv = -24 + Math.sin(t * 2) * 1.5;
    ctx.fillStyle = c; ctx.fillRect(-30, lv, 60, 30);
    ctx.fillStyle = shade(c, 0.4);
    for (var i = 0; i < 4; i++) { var k = wrap(t * 0.8 + i / 4 + hash(wx), 1); ctx.beginPath(); ctx.arc(-10 + i * 7, -2 - k * 22, 2 + k * 1.5, 0, TAU); ctx.fill(); }
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(-8, -50); ctx.lineTo(-8, -32); ctx.lineTo(-24, -4); ctx.quadraticCurveTo(-26, 0, -20, 0); ctx.lineTo(20, 0); ctx.quadraticCurveTo(26, 0, 24, -4); ctx.lineTo(8, -32); ctx.lineTo(8, -50); ctx.closePath(); outline(ctx, 2.5);
    rr(ctx, -11, -54, 22, 6, 3); inkFill(ctx, '#ffffff', 2);
    for (var j = 0; j < 3; j++) { var k2 = wrap(t * 0.6 + j / 3, 1); ctx.fillStyle = D.alpha(c, 1 - k2); ctx.beginPath(); ctx.arc(Math.sin(k2 * 6 + j) * 6, -58 - k2 * 30, 3 + k2 * 4, 0, TAU); ctx.fill(); }
    face(ctx, 0, -14, 0.6, o.mood || 'happy', t);
  });

  // Kính hiển vi có mặt.
  def('microscope', function (ctx, t, o) {
    var c = o.color || '#52c5ee';
    rr(ctx, -30, -10, 60, 10, 4); inkFill(ctx, '#3b4a6b', 2);
    ctx.beginPath(); ctx.moveTo(10, -10); ctx.quadraticCurveTo(26, -40, 6, -66); ctx.lineTo(-2, -60); ctx.quadraticCurveTo(14, -40, 0, -10); ctx.closePath(); inkFill(ctx, c, 2.5);
    rr(ctx, -22, -34, 30, 6, 2); inkFill(ctx, '#c8d4e2', 1.6);
    ctx.save(); ctx.translate(-4, -64); ctx.rotate(-0.5);
    rr(ctx, -7, -34, 14, 40, 4); inkFill(ctx, '#ffffff', 2.2);
    rr(ctx, -9, -40, 18, 8, 3); inkFill(ctx, '#3b4a6b', 1.6);
    ctx.restore();
    face(ctx, 10, -44, 0.5, o.mood || 'happy', t);
  });

  // Nguyên tử: hạt nhân + 3 electron quay (y = đáy).
  def('atom', function (ctx, t, o) {
    ctx.translate(0, -40);
    var c = o.color || '#7b6cf0';
    ctx.strokeStyle = c; ctx.lineWidth = 2.5;
    for (var i = 0; i < 3; i++) { ctx.save(); ctx.rotate(i * Math.PI / 3); ctx.beginPath(); ctx.ellipse(0, 0, 36, 12, 0, 0, TAU); ctx.stroke(); ctx.restore(); }
    for (var j = 0; j < 3; j++) {
      var a = t * (2 + j * 0.4) + j * 2;
      ctx.save(); ctx.rotate(j * Math.PI / 3);
      ctx.beginPath(); ctx.arc(Math.cos(a) * 36, Math.sin(a) * 12, 4.5, 0, TAU); inkFill(ctx, '#52c5ee', 1.5);
      ctx.restore();
    }
    ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU); inkFill(ctx, '#ff8a5c', 2.2);
    face(ctx, 0, -1, 0.5, o.mood || 'happy');
  });

  // Trứng khủng long lắc lắc, thỉnh thoảng nứt và ló mắt nhìn.
  def('dinoEgg', function (ctx, t, o, wx) {
    var cyc = wrap(t + hash(wx) * 8, 8), wob = cyc > 5 && cyc < 7 ? Math.sin(cyc * 18) * 0.15 : 0;
    var c = o.color || '#c8f0b8';
    ctx.rotate(wob);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-30, 0, -26, -56, 0, -56); ctx.bezierCurveTo(26, -56, 30, 0, 0, 0); ctx.closePath(); inkFill(ctx, c, 2.5);
    ctx.fillStyle = shade(c, -0.2); ctx.beginPath(); ctx.arc(-8, -30, 4, 0, TAU); ctx.arc(9, -16, 5, 0, TAU); ctx.arc(6, -42, 3, 0, TAU); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-18, -30); ctx.lineTo(-10, -26); ctx.lineTo(-4, -32); ctx.lineTo(4, -26); ctx.lineTo(10, -32); ctx.lineTo(18, -28); ctx.stroke();
    if (cyc > 6) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(-5, -38, 4, 0, TAU); ctx.arc(5, -38, 4, 0, TAU); ctx.fill(); ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(-5, -38, 2, 0, TAU); ctx.arc(5, -38, 2, 0, TAU); ctx.fill(); }
    else face(ctx, 0, -18, 0.6, 'sleep');
  });

  // Vệ tinh (bay lơ lửng, tấm pin mặt trời).
  def('satellite', function (ctx, t, o, wx) {
    ctx.translate(0, -40 + Math.sin(t * 1.5 + wx) * 6); ctx.rotate(Math.sin(t * 0.7) * 0.2);
    [-1, 1].forEach(function (sd) {
      rr(ctx, sd > 0 ? 16 : -56, -10, 40, 20, 3); inkFill(ctx, '#4f7fd8', 2);
      ctx.strokeStyle = '#8fd3ff'; ctx.lineWidth = 1.2; ctx.beginPath(); for (var x = 10; x < 40; x += 10) { ctx.moveTo((sd > 0 ? 16 : -56) + x, -10); ctx.lineTo((sd > 0 ? 16 : -56) + x, 10); } ctx.stroke();
    });
    rr(ctx, -16, -16, 32, 32, 8); inkFill(ctx, o.color || '#ffd23f', 2.5);
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(0, -28); ctx.stroke(); ctx.beginPath(); ctx.arc(0, -30, 4, 0, TAU); inkFill(ctx, '#e5484d', 1.2);
    face(ctx, 0, -2, 0.55, 'happy', t);
  });

  // Hoá thạch (xương cá trong phiến đá).
  def('fossil', function (ctx, t, o) {
    var c = o.color || '#d8c3a5';
    ctx.beginPath(); ctx.moveTo(-36, 0); ctx.quadraticCurveTo(-40, -36, -6, -40); ctx.quadraticCurveTo(34, -42, 38, -14); ctx.lineTo(36, 0); ctx.closePath(); inkFill(ctx, c, 2.5);
    ctx.strokeStyle = '#fff6df'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-22, -20); ctx.lineTo(18, -20);
    for (var i = -14; i <= 10; i += 8) { ctx.moveTo(i, -20); ctx.lineTo(i - 3, -30); ctx.moveTo(i, -20); ctx.lineTo(i - 3, -10); }
    ctx.moveTo(18, -20); ctx.lineTo(26, -28); ctx.moveTo(18, -20); ctx.lineTo(26, -12); ctx.stroke();
    ctx.beginPath(); ctx.arc(-26, -20, 6, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#fff6df'; ctx.beginPath(); ctx.arc(-28, -22, 1.5, 0, TAU); ctx.fill();
  });

  // Nam châm chữ U có mặt, hút ốc vít nhỏ.
  def('magnet', function (ctx, t, o) {
    ctx.translate(0, -8);
    ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.arc(0, -30, 20, Math.PI, 0); ctx.strokeStyle = INK; ctx.lineWidth = 20; ctx.stroke(); ctx.strokeStyle = o.color || '#e5484d'; ctx.lineWidth = 14; ctx.stroke();
    rr(ctx, -27, -30, 14, 24, 2); inkFill(ctx, o.color || '#e5484d', 2); rr(ctx, 13, -30, 14, 24, 2); inkFill(ctx, o.color || '#e5484d', 2);
    rr(ctx, -27, -12, 14, 10, 2); inkFill(ctx, '#e8eef6', 2); rr(ctx, 13, -12, 14, 10, 2); inkFill(ctx, '#e8eef6', 2);
    face(ctx, 0, -46, 0.55, o.mood || 'grin');
    var j = Math.sin(t * 6) * 2;
    ctx.fillStyle = '#c8d4e2'; ctx.beginPath(); ctx.arc(-20, 6 + j, 3, 0, TAU); ctx.arc(20, 6 - j, 3, 0, TAU); ctx.fill(); outline(ctx, 1);
  });
})();
