// @ts-check
/* ============================================================================
 * OG.Decor (phần mở rộng) — DECOR NHÀ CỬA & DANH THẮNG
 * ----------------------------------------------------------------------------
 * Vai trò:      Lúc load, đăng ký thêm ~20 kind decor dùng chung (không tiền tố) vào OG.Scenery qua OG.Decor.define:
 *               nhà, ống khói, đèn, thuyền, chùa, tháp, kim tự tháp... Hành trình (world, vietnam) và chủ đề gốc 'roof'
 *               chỉ tham chiếu theo tên trong ThemeDef.decor.
 * Khái niệm:    hàm vẽ có tham số tái sử dụng (một kind nhiều kiểu qua opts.style / opts.sail / opts.tiers) · registry ·
 *               vẽ procedural · clip để tô hoa văn trong hình · vẽ 2 lần (clip rồi viền) · hoạt ảnh theo chu kỳ (wrap)
 * Bài học:      docs/learn/07-ve-canvas-procedural-cache.md (chính) · docs/learn/12-data-driven-man-cau-do-hanh-trinh.md
 * Phụ thuộc:    LÚC LOAD: OG.Decor (define, face, inkFill, outline, shade, rr, hash, wrap, heart, star, shadow, alpha, INK)
 *               — load SAU src/gfx/decor.js.
 * Event:        phát: (không) · nghe: (không)
 * API công khai: các kind decor dưới đây (vẽ bằng OG.Scenery.drawDecor(ctx, kind, x, y, scale, t, opts));
 *               tiện ích OG.Decor.heartSmoke(ctx, t, seed, color)
 * Đọc tiếp:     src/gfx/decor-home.js (đồ vật trong nhà, gag) → src/journeys/world/theme.js (ThemeDef dùng nhiều danh thắng)
 * ========================================================================== */
/* Mọi decor: fn(ctx, x, y, scale, t, opts), x = tâm, y = mặt đất (chân). opts.flip lật ngang, opts.mood đổi nét mặt.
 * Trong hàm define: o = opts, wx/wy = toạ độ thế giới của chân (hash(wx) cho biến thể riêng từng cái).
 * Danh sách: house, chimney, antenna, lamp, fence, bench, boat, lantern, pagoda, temple, tower, pyramid, sphinx,
 *            eiffel, torii, crate, bin, flag, stall, windmill. */
(function () {
  'use strict';
  var OG = window.OG;
  var D = OG.Decor;
  if (!D || !D.define) { if (window.console) console.warn('[OG.Decor] decor-places.js cần decor.js load trước'); return; }
  var TAU = Math.PI * 2, INK = D.INK;
  var def = D.define, face = D.face, inkFill = D.inkFill, outline = D.outline, shade = D.shade, rr = D.rr, hash = D.hash, wrap = D.wrap;

  /**
   * Vẽ 3 cụm khói hình trái tim bay lên từ gốc (0, 0) hiện tại (dùng cho ống khói).
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} t      giây
   * @param {number} seed   0..1, lệch pha giữa các ống khói (thường là hash(wx))
   * @param {string} [color='#ffd0dc']
   */
  function heartSmoke(ctx, t, seed, color) {
    for (var i = 0; i < 3; i++) {
      // k = tuổi cụm khói 0..1; i/3 rải đều 3 cụm trong chu kỳ để lúc nào cũng có khói đang bay
      var k = wrap(t * 0.32 + i / 3 + seed, 1);
      // 💡 Khái niệm: đường cong độ mờ (alpha envelope) — hiện nhanh trong 15% đầu đời, rồi mờ dần đều tới lúc biến mất.
      // Nếu alpha nhảy thẳng 0 → 1 thì khói "bật" ra ở miệng ống rất giả.
      var a = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
      ctx.save();
      ctx.globalAlpha *= Math.max(0, a) * 0.9;
      ctx.translate(Math.sin(k * 7 + i) * 10, -k * 90);
      ctx.rotate(Math.sin(k * 5 + i) * 0.3);
      D.heart(ctx, 0, 0, 7 + k * 9);
      ctx.fillStyle = color || '#ffd0dc'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(23,35,61,0.35)'; ctx.stroke();
      ctx.restore();
    }
  }
  D.heartSmoke = heartSmoke;

  // Ngôi nhà nhỏ: cửa sổ là mắt, cửa ra vào là miệng. opts: color, roof, chimney(bool), w.
  def('house', function (ctx, t, o, wx) {
    var c = o.color || ['#ffd98a', '#9fd8ff', '#ffb3c7', '#b8e6a0'][Math.floor(hash(wx) * 4)], rf = o.roof || '#e5674b', w = o.w || 110;
    var hw = w / 2, hh = 80; // hw = nửa bề ngang, hh = chiều cao thân nhà (px ở scale 1)
    // thứ tự: bóng → khói + ống khói (sau mái) → thân → mái → cửa sổ "mắt" → cửa "miệng" → má hồng
    D.shadow(ctx, hw + 10);
    if (o.chimney !== false) {
      ctx.save(); ctx.translate(hw * 0.5, -hh - 52); heartSmoke(ctx, t, hash(wx)); ctx.restore();
      rr(ctx, hw * 0.38, -hh - 52, 20, 40, 3); inkFill(ctx, shade(rf, -0.2), 2.5);
    }
    rr(ctx, -hw, -hh, w, hh, 6); inkFill(ctx, c, 3);
    ctx.beginPath(); ctx.moveTo(-hw - 14, -hh + 4); ctx.lineTo(0, -hh - 58); ctx.lineTo(hw + 14, -hh + 4); ctx.closePath(); inkFill(ctx, rf, 3);
    ctx.strokeStyle = shade(rf, -0.25); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-hw * 0.55, -hh - 20); ctx.lineTo(hw * 0.55, -hh - 20); ctx.moveTo(-hw * 0.28, -hh - 40); ctx.lineTo(hw * 0.28, -hh - 40); ctx.stroke();
    // cửa sổ = mắt (chớp)
    var blink = wrap(t * 0.7 + hash(wx) * 5, 5) < 0.15;
    [-1, 1].forEach(function (sd) {
      var cx = sd * hw * 0.48, cy = -hh + 28;
      rr(ctx, cx - 14, cy - 13, 28, 26, 8); inkFill(ctx, blink ? c : '#fff6c8', 2.5);
      if (!blink) { ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(cx + 2, cy + 2, 4.5, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx + 3.5, cy, 1.6, 0, TAU); ctx.fill(); }
      else { ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(cx - 9, cy + 2); ctx.lineTo(cx + 9, cy + 2); ctx.stroke(); }
    });
    // cửa = miệng cười
    ctx.beginPath(); ctx.moveTo(-15, 0); ctx.lineTo(-15, -26); ctx.quadraticCurveTo(0, -36, 15, -26); ctx.lineTo(15, 0); ctx.closePath(); inkFill(ctx, '#b0613a', 2.5);
    ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(8, -13, 2.5, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,120,150,0.5)'; ctx.beginPath(); ctx.ellipse(-hw * 0.48, -hh + 50, 7, 4, 0, 0, TAU); ctx.ellipse(hw * 0.48, -hh + 50, 7, 4, 0, 0, TAU); ctx.fill();
  });

  // Ống khói phun khói trái tim (đặt trên mái). opts.color.
  def('chimney', function (ctx, t, o, wx) {
    var c = o.color || '#a5503f';
    ctx.save(); ctx.translate(0, -62); heartSmoke(ctx, t, hash(wx), o.smoke); ctx.restore();
    rr(ctx, -18, -56, 36, 56, 4); inkFill(ctx, c, 2.5);
    ctx.strokeStyle = shade(c, -0.25); ctx.lineWidth = 1.6; ctx.beginPath();
    for (var y = -44; y < 0; y += 12) { ctx.moveTo(-18, y); ctx.lineTo(18, y); }
    ctx.stroke();
    rr(ctx, -23, -62, 46, 12, 4); inkFill(ctx, shade(c, 0.25), 2.5);
    face(ctx, 0, -30, 0.8, o.mood || 'happy', t);
  });

  // Ăng-ten TV trên mái (có chim nhỏ đậu).
  def('antenna', function (ctx, t) {
    ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.lineCap = 'round';
    function bars() { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -60); ctx.moveTo(-18, -50); ctx.lineTo(18, -50); ctx.moveTo(-13, -40); ctx.lineTo(13, -40); ctx.moveTo(-8, -30); ctx.lineTo(8, -30); ctx.stroke(); }
    bars(); ctx.strokeStyle = '#c8d4e2'; ctx.lineWidth = 3; bars();
    var hop = Math.max(0, Math.sin(t * 3)) * 3;
    ctx.save(); ctx.translate(10, -53 - hop);
    ctx.beginPath(); ctx.ellipse(0, -5, 7, 6, 0, 0, TAU); inkFill(ctx, '#7ab8ff', 1.5);
    ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.moveTo(6, -6); ctx.lineTo(11, -4); ctx.lineTo(6, -3); ctx.fill();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(3, -7, 1.3, 0, TAU); ctx.fill();
    ctx.restore();
  });

  // Đèn đường toả sáng (mặt đèn cười). opts.color ánh sáng, opts.night: quầng sáng to hơn.
  def('lamp', function (ctx, t, o) {
    var glow = o.color || '#ffe38a', pul = 0.5 + 0.12 * Math.sin(t * 3);
    ctx.fillStyle = D.alpha(glow, o.night ? pul : pul * 0.55);
    ctx.beginPath(); ctx.arc(0, -112, o.night ? 46 : 32, 0, TAU); ctx.fill();
    rr(ctx, -12, -8, 24, 8, 3); inkFill(ctx, o.pole || '#3b4a6b', 2);
    rr(ctx, -4, -100, 8, 94, 3); inkFill(ctx, o.pole || '#3b4a6b', 2);
    ctx.beginPath(); ctx.moveTo(-16, -96); ctx.lineTo(16, -96); ctx.lineTo(11, -128); ctx.lineTo(-11, -128); ctx.closePath(); inkFill(ctx, glow, 2.5);
    ctx.beginPath(); ctx.moveTo(-15, -128); ctx.lineTo(0, -140); ctx.lineTo(15, -128); ctx.closePath(); inkFill(ctx, o.pole || '#3b4a6b', 2);
    face(ctx, 0, -114, 0.6, o.mood || 'happy');
  });

  // Hàng rào gỗ (rộng 120). opts.color, opts.flowers.
  def('fence', function (ctx, t, o, wx) {
    var c = o.color || '#fff6df';
    /** @type {Array<[number, string]>} [x px, màu hoa] */
    var flowerSpots = [[-40, '#ff8fb1'], [14, '#ffd23f'], [44, '#b58cff']];
    rr(ctx, -62, -36, 124, 8, 3); inkFill(ctx, c, 2); rr(ctx, -62, -18, 124, 8, 3); inkFill(ctx, c, 2);
    for (var i = 0; i < 5; i++) {
      var px = -54 + i * 27;
      ctx.beginPath(); ctx.moveTo(px - 8, 0); ctx.lineTo(px - 8, -42); ctx.lineTo(px, -52); ctx.lineTo(px + 8, -42); ctx.lineTo(px + 8, 0); ctx.closePath(); inkFill(ctx, c, 2);
    }
    if (o.flowers !== false) {
      flowerSpots.forEach(function (f, i) {
        var sw = Math.sin(t * 2.5 + i + wx * 0.01) * 2;
        ctx.strokeStyle = '#3f9a45'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(f[0], 0); ctx.lineTo(f[0] + sw, -24); ctx.stroke();
        ctx.beginPath(); ctx.arc(f[0] + sw, -27, 5, 0, TAU); inkFill(ctx, f[1], 1.4);
        ctx.fillStyle = '#fff6c8'; ctx.beginPath(); ctx.arc(f[0] + sw, -27, 2, 0, TAU); ctx.fill();
      });
    }
  });

  // Ghế đá công viên. opts.color.
  def('bench', function (ctx, t, o) {
    var c = o.color || '#c98b4f';
    rr(ctx, -40, -24, 8, 24, 2); inkFill(ctx, '#3b4a6b', 2); rr(ctx, 32, -24, 8, 24, 2); inkFill(ctx, '#3b4a6b', 2);
    rr(ctx, -48, -30, 96, 9, 4); inkFill(ctx, c, 2);
    rr(ctx, -46, -54, 92, 8, 4); inkFill(ctx, c, 2); rr(ctx, -46, -42, 92, 8, 4); inkFill(ctx, c, 2);
    // bồ câu nhỏ
    var peck = Math.max(0, Math.sin(t * 4)) * 0.4;
    ctx.save(); ctx.translate(22, -30);
    ctx.beginPath(); ctx.ellipse(0, -7, 9, 7, 0, 0, TAU); inkFill(ctx, '#c8d0e0', 1.5);
    ctx.save(); ctx.translate(7, -12); ctx.rotate(peck); ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); inkFill(ctx, '#c8d0e0', 1.5);
    ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(8, 1); ctx.lineTo(4, 2); ctx.fill(); ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(1.5, -1, 1.2, 0, TAU); ctx.fill();
    ctx.restore(); ctx.restore();
  });

  // Thuyền bập bềnh (y = mặt nước). opts.sail: 'junk' (buồm nâu đỏ Hạ Long) | 'sail' | false; opts.color thân.
  def('boat', function (ctx, t, o, wx) {
    var ph = hash(wx) * 6, c = o.color || '#c98b4f';
    ctx.translate(0, Math.sin(t * 1.6 + ph) * 3);
    ctx.rotate(Math.sin(t * 1.3 + ph) * 0.04);
    var sail = o.sail == null ? 'junk' : o.sail;
    if (sail) {
      ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(0, -96); ctx.stroke();
      if (sail === 'junk') {
        var sc = o.sailColor || '#d9663b';
        ctx.beginPath(); ctx.moveTo(4, -92); ctx.quadraticCurveTo(40, -88, 46, -76); ctx.lineTo(50, -24); ctx.lineTo(4, -22); ctx.closePath(); inkFill(ctx, sc, 2.5);
        ctx.strokeStyle = shade(sc, -0.3); ctx.lineWidth = 2; ctx.beginPath();
        for (var y = -78; y < -26; y += 13) { ctx.moveTo(4, y); ctx.lineTo(48, y + 1); }
        ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-4, -80); ctx.quadraticCurveTo(-30, -74, -34, -62); ctx.lineTo(-36, -24); ctx.lineTo(-4, -22); ctx.closePath(); inkFill(ctx, sc, 2.5);
      } else {
        ctx.beginPath(); ctx.moveTo(4, -92); ctx.quadraticCurveTo(44, -50, 42, -22); ctx.lineTo(4, -22); ctx.closePath(); inkFill(ctx, o.sailColor || '#ffffff', 2.5);
        ctx.fillStyle = '#e5484d'; ctx.beginPath(); ctx.moveTo(0, -96); ctx.lineTo(16, -100); ctx.lineTo(0, -106); ctx.fill();
      }
    }
    ctx.beginPath(); ctx.moveTo(-62, -20); ctx.lineTo(62, -20); ctx.quadraticCurveTo(54, 6, 34, 8); ctx.lineTo(-38, 8); ctx.quadraticCurveTo(-58, 4, -62, -20); ctx.closePath();
    inkFill(ctx, c, 2.5);
    ctx.fillStyle = shade(c, 0.25); ctx.fillRect(-56, -18, 112, 5);
    face(ctx, 0, -4, 0.9, o.mood || 'happy', t);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    var r = wrap(t * 0.8, 1);
    ctx.beginPath(); ctx.moveTo(-70 - r * 10, 10); ctx.lineTo(-56 - r * 10, 10); ctx.moveTo(56 + r * 10, 10); ctx.lineTo(72 + r * 10, 10); ctx.stroke();
  });

  // Đèn lồng (Hội An / Trung thu). y = mặt đất -> đứng trên cột; y < 440 -> treo dây lên trên. opts.color, opts.pole.
  def('lantern', function (ctx, t, o, wx, wy) {
    var c = o.color || ['#ff5a5a', '#ffb347', '#ffd23f', '#ff7eb6', '#7fd08a'][Math.floor(hash(wx) * 5)];
    // Tự chọn kiểu theo vị trí đặt: y < 440 (lơ lửng giữa không trung) thì treo dây; trên mặt đất thì cắm cột.
    // ⚠️ Bẫy: wy là y THẾ GIỚI truyền vào drawDecor; vẽ đèn trong ô biểu tượng/thẻ (toạ độ nhỏ, vd y = 60) sẽ tự thành
    // kiểu treo — muốn có cột thì truyền opts.pole: true.
    var hang = o.pole === false || o.hang || (o.pole !== true && wy < 440);
    if (!hang) { rr(ctx, -3, -84, 6, 84, 3); inkFill(ctx, '#8a5a3a', 1.6); ctx.translate(0, -84); }
    else { ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -60); ctx.stroke(); }
    ctx.rotate(Math.sin(t * 1.8 + hash(wx) * 6) * 0.12);
    var g = 0.35 + 0.15 * Math.sin(t * 3 + wx);
    ctx.fillStyle = D.alpha(c, g); ctx.beginPath(); ctx.arc(0, 26, 34, 0, TAU); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 6); ctx.stroke();
    rr(ctx, -8, 4, 16, 6, 2); inkFill(ctx, '#ffd23f', 1.5);
    ctx.beginPath(); ctx.ellipse(0, 26, 20, 17, 0, 0, TAU); inkFill(ctx, c, 2.5);
    ctx.strokeStyle = shade(c, -0.25); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(0, 26, 9, 17, 0, 0, TAU); ctx.moveTo(0, 9); ctx.lineTo(0, 43); ctx.stroke();
    rr(ctx, -8, 42, 16, 6, 2); inkFill(ctx, '#ffd23f', 1.5);
    ctx.strokeStyle = '#ff5a5a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 48); ctx.lineTo(Math.sin(t * 2) * 2, 62); ctx.stroke();
    face(ctx, 0, 24, 0.6, o.mood || 'happy');
  });

  // Chùa nhiều tầng mái cong. opts.tiers (2..5), opts.color tường, opts.roof.
  // 🧪 Thử: trong ThemeDef đặt { kind: 'pagoda', opts: { tiers: 5 } } — cùng một hàm vẽ ra chùa 5 tầng, không cần code mới.
  def('pagoda', function (ctx, t, o) {
    var tiers = o.tiers || 3, wall = o.color || '#ffe6b3', roof = o.roof || '#d9473b';
    D.shadow(ctx, 70);
    rr(ctx, -64, -14, 128, 14, 4); inkFill(ctx, '#c8b49a', 2.5);
    // y = "con trỏ" độ cao: mỗi tầng vẽ thân + mái rồi dời y lên trên; tầng sau hẹp hơn 18 px → dáng tháp thuôn.
    var y = -14;
    for (var i = 0; i < tiers; i++) {
      var w = 96 - i * 18, h = 36 - i * 3;
      rr(ctx, -w / 2, y - h, w, h, 4); inkFill(ctx, wall, 2.5);
      ctx.fillStyle = '#b0613a';
      if (i === 0) { ctx.beginPath(); ctx.moveTo(-11, y); ctx.lineTo(-11, y - 20); ctx.quadraticCurveTo(0, y - 28, 11, y - 20); ctx.lineTo(11, y); ctx.fill(); }
      else { rr(ctx, -6, y - h + 8, 12, 14, 3); ctx.fill(); }
      y -= h;
      var rw = w / 2 + 20;
      ctx.beginPath(); ctx.moveTo(-rw - 8, y - 12); ctx.quadraticCurveTo(-rw + 4, y + 2, -rw + 12, y + 2); ctx.lineTo(rw - 12, y + 2); ctx.quadraticCurveTo(rw - 4, y + 2, rw + 8, y - 12);
      ctx.quadraticCurveTo(rw - 10, y - 8, w / 2 - 4, y - 16); ctx.lineTo(-w / 2 + 4, y - 16); ctx.quadraticCurveTo(-rw + 10, y - 8, -rw - 8, y - 12); ctx.closePath();
      inkFill(ctx, roof, 2.5);
      y -= 16;
    }
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(0, y - 22); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, y - 24, 5, 0, TAU); inkFill(ctx, '#ffd23f', 1.5);
    face(ctx, 0, -40, 0.8, o.mood || 'happy', t);
  });

  // Đền: opts.style 'asian' (mặc định: cột đỏ, mái vàng 2 tầng) | 'greek' (cột trắng, mái tam giác).
  def('temple', function (ctx, t, o) {
    D.shadow(ctx, 90);
    if (o.style === 'greek') {
      var col = o.color || '#f4efe4';
      rr(ctx, -90, -16, 180, 16, 3); inkFill(ctx, shade(col, -0.08), 2.5);
      rr(ctx, -80, -26, 160, 10, 3); inkFill(ctx, col, 2.5);
      for (var i = 0; i < 6; i++) { rr(ctx, -72 + i * 28, -102, 16, 76, 3); inkFill(ctx, col, 2.5); ctx.strokeStyle = shade(col, -0.2); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-64 + i * 28, -98); ctx.lineTo(-64 + i * 28, -30); ctx.stroke(); }
      rr(ctx, -86, -114, 172, 12, 3); inkFill(ctx, col, 2.5);
      ctx.beginPath(); ctx.moveTo(-90, -114); ctx.lineTo(0, -150); ctx.lineTo(90, -114); ctx.closePath(); inkFill(ctx, col, 2.5);
      face(ctx, 0, -126, 0.8, o.mood || 'smile', t);
      return;
    }
    var red = o.color || '#c8372d', gold = o.roof || '#f2b134';
    rr(ctx, -96, -14, 192, 14, 3); inkFill(ctx, '#d8c3a5', 2.5);
    rr(ctx, -78, -84, 156, 70, 4); inkFill(ctx, '#ffe6b3', 2.5);
    for (var c2 = 0; c2 < 4; c2++) { rr(ctx, -72 + c2 * 44, -84, 12, 70, 3); inkFill(ctx, red, 2); }
    ctx.beginPath(); ctx.moveTo(-14, -14); ctx.lineTo(-14, -48); ctx.quadraticCurveTo(0, -58, 14, -48); ctx.lineTo(14, -14); ctx.closePath(); inkFill(ctx, '#8a3a2a', 2);
    // Hàm con vẽ một tầng mái cong theo (độ cao y, nửa bề ngang hw) — gọi 2 lần với kích thước khác nhau.
    function roofTier(y, hw) {
      ctx.beginPath(); ctx.moveTo(-hw - 14, y - 16); ctx.quadraticCurveTo(-hw, y + 2, -hw + 14, y); ctx.lineTo(hw - 14, y); ctx.quadraticCurveTo(hw, y + 2, hw + 14, y - 16);
      ctx.quadraticCurveTo(hw - 14, y - 12, hw - 26, y - 26); ctx.lineTo(-hw + 26, y - 26); ctx.quadraticCurveTo(-hw + 14, y - 12, -hw - 14, y - 16); ctx.closePath();
      inkFill(ctx, gold, 2.5);
      ctx.strokeStyle = shade(gold, -0.3); ctx.lineWidth = 1.5; ctx.beginPath(); for (var x = -hw + 20; x < hw - 16; x += 10) { ctx.moveTo(x, y - 2); ctx.lineTo(x + 3, y - 22); } ctx.stroke();
    }
    roofTier(-84, 100);
    rr(ctx, -50, -128, 100, 22, 3); inkFill(ctx, red, 2);
    rr(ctx, -26, -124, 52, 14, 3); inkFill(ctx, '#ffd23f', 1.5);
    roofTier(-126, 70);
    // rồng mái nhỏ dễ thương (hai đầu đao)
    ctx.fillStyle = '#5fbf6a';
    [-1, 1].forEach(function (sd) { ctx.beginPath(); ctx.arc(sd * 82, -102, 6, 0, TAU); ctx.fill(); outline(ctx, 1.5); });
    ctx.beginPath(); ctx.arc(0, -158, 7, 0, TAU); inkFill(ctx, '#ffd23f', 1.5);
    face(ctx, 0, -66, 0.75, o.mood || 'happy', t);
  });

  // Tháp: opts.style 'clock' (tháp đồng hồ có mặt) | 'castle' | 'lighthouse' (hải đăng có tia sáng quay).
  def('tower', function (ctx, t, o) {
    var c = o.color, style = o.style || 'clock';
    D.shadow(ctx, 40);
    if (style === 'lighthouse') {
      c = c || '#ffffff';
      var beam = t * 1.2;
      ctx.save(); ctx.translate(0, -168);
      ctx.fillStyle = 'rgba(255,240,150,0.35)';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(beam) * 160, Math.sin(beam) * 30 - 18); ctx.lineTo(Math.cos(beam) * 160, Math.sin(beam) * 30 + 18); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.beginPath(); ctx.moveTo(-30, 0); ctx.lineTo(-20, -150); ctx.lineTo(20, -150); ctx.lineTo(30, 0); ctx.closePath(); inkFill(ctx, c, 2.5);
      // sọc đỏ: clip theo thân tháp (path vừa vẽ) để sọc chữ nhật tự cắt vừa hình thang, rồi vẽ lại viền đè lên
      ctx.save(); ctx.clip(); ctx.fillStyle = '#e5484d'; ctx.fillRect(-40, -50, 80, 24); ctx.fillRect(-40, -110, 80, 24); ctx.restore();
      ctx.beginPath(); ctx.moveTo(-30, 0); ctx.lineTo(-20, -150); ctx.lineTo(20, -150); ctx.lineTo(30, 0); ctx.closePath(); outline(ctx, 2.5);
      rr(ctx, -16, -182, 32, 32, 4); inkFill(ctx, '#fff1a8', 2.5);
      ctx.beginPath(); ctx.moveTo(-22, -182); ctx.lineTo(0, -200); ctx.lineTo(22, -182); ctx.closePath(); inkFill(ctx, '#e5484d', 2.5);
      face(ctx, 0, -168, 0.6, 'happy');
      return;
    }
    if (style === 'castle') {
      c = c || '#d8d2e8';
      rr(ctx, -34, -130, 68, 130, 4); inkFill(ctx, c, 2.5);
      for (var i = 0; i < 4; i++) { rr(ctx, -34 + i * 19, -144, 12, 16, 2); inkFill(ctx, c, 2.5); }
      ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(-10, -30); ctx.arc(0, -30, 10, Math.PI, 0); ctx.lineTo(10, 0); ctx.closePath(); inkFill(ctx, '#8a5a3a', 2);
      ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(0, -144); ctx.lineTo(0, -176); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -176); ctx.quadraticCurveTo(14, -172 + Math.sin(t * 4) * 3, 26, -170); ctx.lineTo(0, -162); ctx.closePath(); inkFill(ctx, '#ff7eb6', 1.5);
      face(ctx, 0, -90, 1, o.mood || 'smile', t);
      return;
    }
    c = c || '#e8c69a';
    rr(ctx, -30, -150, 60, 150, 4); inkFill(ctx, c, 2.5);
    ctx.beginPath(); ctx.moveTo(-36, -150); ctx.lineTo(0, -196); ctx.lineTo(36, -150); ctx.closePath(); inkFill(ctx, o.roof || '#6a8fd8', 2.5);
    ctx.beginPath(); ctx.arc(0, -116, 22, 0, TAU); inkFill(ctx, '#fff6df', 2.5);
    face(ctx, 0, -114, 0.75, 'smile');
    var hm = t * 0.5, mm = t * 6;
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(0, -116); ctx.lineTo(Math.sin(hm) * 10, -116 - Math.cos(hm) * 10); ctx.moveTo(0, -116); ctx.lineTo(Math.sin(mm) * 16, -116 - Math.cos(mm) * 16); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(-10, -26); ctx.arc(0, -26, 10, Math.PI, 0); ctx.lineTo(10, 0); ctx.closePath(); inkFill(ctx, '#8a5a3a', 2);
    rr(ctx, -16, -72, 12, 18, 4); inkFill(ctx, '#9ce7f1', 2); rr(ctx, 4, -72, 12, 18, 4); inkFill(ctx, '#9ce7f1', 2);
  });

  // Kim tự tháp (mặt cười tươi, đá xếp lớp). opts.color.
  def('pyramid', function (ctx, t, o) {
    var c = o.color || '#f0c46a', s2 = 120; // s2 = nửa bề ngang đáy = chiều cao, px
    D.shadow(ctx, s2 + 10);
    ctx.beginPath(); ctx.moveTo(-s2, 0); ctx.lineTo(-6, -s2 + 4); ctx.quadraticCurveTo(0, -s2 - 4, 6, -s2 + 4); ctx.lineTo(s2, 0); ctx.closePath(); inkFill(ctx, c, 3);
    ctx.fillStyle = shade(c, -0.15); ctx.beginPath(); ctx.moveTo(4, -s2 + 6); ctx.lineTo(s2 - 2, -1); ctx.lineTo(30, -1); ctx.closePath(); ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.moveTo(-s2, 0); ctx.lineTo(0, -s2); ctx.lineTo(s2, 0); ctx.closePath(); ctx.clip();
    ctx.strokeStyle = shade(c, -0.25); ctx.lineWidth = 1.5; ctx.beginPath();
    for (var y = -14; y > -s2; y -= 16) { ctx.moveTo(-s2, y); ctx.lineTo(s2, y); for (var x = -s2 + ((y / 16) % 2 ? 0 : 14); x < s2; x += 28) { ctx.moveTo(x, y); ctx.lineTo(x, y + 16); } }
    ctx.stroke(); ctx.restore();
    ctx.beginPath(); ctx.moveTo(-s2, 0); ctx.lineTo(-6, -s2 + 4); ctx.quadraticCurveTo(0, -s2 - 4, 6, -s2 + 4); ctx.lineTo(s2, 0); ctx.closePath(); outline(ctx, 3);
    ctx.fillStyle = '#fff1a8'; ctx.beginPath(); ctx.moveTo(-8, -s2 + 8); ctx.lineTo(0, -s2 - 2); ctx.lineTo(8, -s2 + 8); ctx.closePath(); ctx.fill();
    face(ctx, 0, -46, 1.5, o.mood || 'happy', t);
  });

  // Tượng nhân sư nằm (khăn sọc xanh vàng, cười hiền).
  def('sphinx', function (ctx, t, o) {
    var c = o.color || '#e8b866';
    D.shadow(ctx, 90);
    ctx.beginPath(); ctx.moveTo(-90, 0); ctx.lineTo(-90, -26); ctx.quadraticCurveTo(-86, -48, -50, -50); ctx.lineTo(10, -50); ctx.lineTo(10, 0); ctx.closePath(); inkFill(ctx, c, 2.5);
    rr(ctx, 10, -18, 70, 18, 8); inkFill(ctx, c, 2.5);
    ctx.strokeStyle = shade(c, -0.3); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(60, -18); ctx.lineTo(60, -4); ctx.moveTo(70, -18); ctx.lineTo(70, -4); ctx.stroke();
    // đầu + khăn sọc
    ctx.beginPath(); ctx.moveTo(-4, -40); ctx.lineTo(-10, -96); ctx.quadraticCurveTo(22, -116, 54, -96); ctx.lineTo(48, -40); ctx.closePath(); inkFill(ctx, '#4f7fd8', 2.5);
    ctx.save(); ctx.clip(); ctx.fillStyle = '#ffd23f'; for (var y = -110; y < -40; y += 12) ctx.fillRect(-12, y, 70, 6); ctx.restore();
    ctx.beginPath(); ctx.moveTo(-4, -40); ctx.lineTo(-10, -96); ctx.quadraticCurveTo(22, -116, 54, -96); ctx.lineTo(48, -40); ctx.closePath(); outline(ctx, 2.5);
    rr(ctx, 4, -94, 36, 44, 14); inkFill(ctx, c, 2.5);
    face(ctx, 22, -74, 0.9, o.mood || 'smile', t);
  });

  // Tháp Eiffel (khung lưới, cờ nhỏ bay).
  def('eiffel', function (ctx, t, o) {
    var c = o.color || '#8a6a5c', Hh = 220;
    D.shadow(ctx, 60);
    function legs(lw, col) {
      ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-56, 0); ctx.quadraticCurveTo(-26, -70, -12, -Hh + 30); ctx.lineTo(-4, -Hh);
      ctx.moveTo(56, 0); ctx.quadraticCurveTo(26, -70, 12, -Hh + 30); ctx.lineTo(4, -Hh);
      ctx.moveTo(-40, -50); ctx.lineTo(40, -50); ctx.moveTo(-22, -110); ctx.lineTo(22, -110); ctx.moveTo(-13, -160); ctx.lineTo(13, -160);
      ctx.stroke();
    }
    legs(11, INK); legs(5, c);
    ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(-40, -50); ctx.lineTo(-20, -110); ctx.lineTo(20, -50); ctx.moveTo(40, -50); ctx.lineTo(20, -110); ctx.lineTo(-20, -50);
    ctx.moveTo(-20, -110); ctx.lineTo(10, -160); ctx.moveTo(20, -110); ctx.lineTo(-10, -160); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-34, 0); ctx.quadraticCurveTo(0, -40, 34, 0); ctx.strokeStyle = INK; ctx.lineWidth = 9; ctx.stroke(); ctx.strokeStyle = c; ctx.lineWidth = 4; ctx.stroke();
    rr(ctx, -46, -58, 92, 10, 3); inkFill(ctx, c, 2); rr(ctx, -26, -116, 52, 9, 3); inkFill(ctx, c, 2);
    face(ctx, 0, -80, 0.7, o.mood || 'happy', t);
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -Hh); ctx.lineTo(0, -Hh - 18); ctx.stroke();
    var fl = Math.sin(t * 5) * 2;
    ctx.fillStyle = '#4f7fd8'; ctx.fillRect(1, -Hh - 18, 7, 10 + fl * 0.2);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(8, -Hh - 18, 7, 10 + fl * 0.2);
    ctx.fillStyle = '#e5484d'; ctx.fillRect(15, -Hh - 18, 7, 10 + fl * 0.2);
  });

  // Cổng torii Nhật Bản. opts.color.
  def('torii', function (ctx, t, o) {
    var c = o.color || '#e5483b';
    rr(ctx, -50, -120, 14, 120, 4); inkFill(ctx, c, 2.5); rr(ctx, 36, -120, 14, 120, 4); inkFill(ctx, c, 2.5);
    rr(ctx, -54, -10, 22, 10, 2); inkFill(ctx, INK, 1); rr(ctx, 32, -10, 22, 10, 2); inkFill(ctx, INK, 1);
    rr(ctx, -62, -102, 124, 12, 3); inkFill(ctx, c, 2.5);
    ctx.beginPath(); ctx.moveTo(-82, -132); ctx.quadraticCurveTo(0, -122, 82, -132); ctx.lineTo(76, -118); ctx.quadraticCurveTo(0, -112, -76, -118); ctx.closePath(); inkFill(ctx, INK, 1);
    ctx.beginPath(); ctx.moveTo(-76, -122); ctx.quadraticCurveTo(0, -114, 76, -122); ctx.lineTo(72, -112); ctx.quadraticCurveTo(0, -106, -72, -112); ctx.closePath(); inkFill(ctx, c, 1.5);
    rr(ctx, -8, -116, 16, 16, 2); inkFill(ctx, '#ffd23f', 1.5);
    face(ctx, 0, -60, 0.9, o.mood || 'happy', t);
  });

  // Thùng gỗ có mặt. opts.color, opts.size.
  def('crate', function (ctx, t, o, wx) {
    var c = o.color || '#d9a066', s2 = o.size || 40;
    rr(ctx, -s2 / 2, -s2, s2, s2, 4); inkFill(ctx, c, 2.5);
    ctx.strokeStyle = shade(c, -0.3); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-s2 / 2 + 4, -s2 + 4); ctx.lineTo(s2 / 2 - 4, -4); ctx.moveTo(-s2 / 2, -s2 / 2); ctx.lineTo(s2 / 2, -s2 / 2); ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = 2.5; rr(ctx, -s2 / 2 + 4, -s2 + 4, s2 - 8, s2 - 8, 2); ctx.stroke();
    face(ctx, 0, -s2 * 0.55, s2 / 46, o.mood || (hash(wx) > 0.5 ? 'smile' : 'sleep'), t);
  });

  // Thùng rác có mặt — nắp thỉnh thoảng hé, gián con thò mắt nhìn trộm.
  def('bin', function (ctx, t, o, wx) {
    var c = o.color || '#7fb8a8', ph = hash(wx) * 9;
    // chu kỳ 6 s: trong 4..5.4 s nắp hé lên tối đa 12 px (cung sin) và gián con thò mắt ra
    var k = wrap(t + ph, 6), lift = k > 4 && k < 5.4 ? Math.sin((k - 4) / 1.4 * Math.PI) * 12 : 0;
    ctx.beginPath(); ctx.moveTo(-22, -52); ctx.lineTo(-18, 0); ctx.lineTo(18, 0); ctx.lineTo(22, -52); ctx.closePath(); inkFill(ctx, c, 2.5);
    ctx.strokeStyle = shade(c, -0.25); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-8, -46); ctx.lineTo(-7, -6); ctx.moveTo(8, -46); ctx.lineTo(7, -6); ctx.stroke();
    if (lift > 1) {
      ctx.fillStyle = '#7d3e9b'; ctx.beginPath(); ctx.ellipse(0, -52, 14, Math.min(8, lift * 0.6), 0, Math.PI, TAU); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-5, -54, 3.4, 0, TAU); ctx.arc(5, -54, 3.4, 0, TAU); ctx.fill();
      ctx.fillStyle = INK; var lk = Math.sin(t * 3) * 1.5; ctx.beginPath(); ctx.arc(-5 + lk, -54, 1.6, 0, TAU); ctx.arc(5 + lk, -54, 1.6, 0, TAU); ctx.fill();
    }
    ctx.save(); ctx.translate(-24, -54 - lift); ctx.rotate(-lift * 0.02);
    rr(ctx, 0, -6, 48, 8, 4); inkFill(ctx, shade(c, 0.15), 2.5);
    rr(ctx, 18, -11, 12, 6, 3); inkFill(ctx, shade(c, 0.15), 2);
    ctx.restore();
    face(ctx, 0, -26, 0.8, lift > 1 ? 'o' : (o.mood || 'smile'), t);
  });

  // Cờ phấp phới. opts.colors: [màu1, màu2, màu3] (sọc dọc) hoặc opts.color 1 màu, opts.star: ngôi sao vàng giữa.
  def('flag', function (ctx, t, o) {
    rr(ctx, -3, -110, 6, 110, 3); inkFill(ctx, '#c8d4e2', 1.6);
    ctx.beginPath(); ctx.arc(0, -112, 5, 0, TAU); inkFill(ctx, '#ffd23f', 1.5);
    var cols = o.colors || [o.color || '#e5484d'];
    var fw = 60, fh = 40; // kích thước lá cờ, px
    // Path lá cờ gợn sóng: biên độ sin nhân (x / fw) → sát cán đứng yên, càng ra đuôi càng bay mạnh.
    // Gọi 2 lần: lần 1 làm vùng clip cho các sọc màu, lần 2 để viền.
    function pathFlag() {
      ctx.beginPath(); ctx.moveTo(3, -106);
      for (var x = 0; x <= fw; x += 6) ctx.lineTo(3 + x, -106 + Math.sin(x / 12 - t * 6) * 3 * (x / fw));
      for (var x2 = fw; x2 >= 0; x2 -= 6) ctx.lineTo(3 + x2, -106 + fh + Math.sin(x2 / 12 - t * 6) * 3 * (x2 / fw));
      ctx.closePath();
    }
    pathFlag(); ctx.save(); ctx.clip();
    for (var i = 0; i < cols.length; i++) { ctx.fillStyle = cols[i]; ctx.fillRect(3 + i * fw / cols.length, -112, fw / cols.length + 1, fh + 12); }
    if (o.star) { ctx.fillStyle = '#ffd23f'; D.star(ctx, 3 + fw / 2, -86 + Math.sin(fw / 24 - t * 6) * 1.5, 11, 4.5, 0); ctx.fill(); }
    ctx.restore();
    pathFlag(); outline(ctx, 2.5);
  });

  // Quầy hàng / sạp chợ có mái bạt sọc và đồ ăn. opts.color sọc.
  def('stall', function (ctx, t, o) {
    var c = o.color || '#e5484d';
    rr(ctx, -56, -44, 112, 44, 4); inkFill(ctx, '#d9a066', 2.5);
    rr(ctx, -62, -50, 124, 10, 4); inkFill(ctx, '#f5d28b', 2.5);
    rr(ctx, -52, -120, 6, 72, 2); inkFill(ctx, '#8a5a3a', 1.5); rr(ctx, 46, -120, 6, 72, 2); inkFill(ctx, '#8a5a3a', 1.5);
    ctx.beginPath(); ctx.moveTo(-66, -110); ctx.lineTo(66, -110); ctx.lineTo(60, -136); ctx.lineTo(-60, -136); ctx.closePath(); ctx.save(); ctx.clip();
    for (var i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? '#ffffff' : c; ctx.fillRect(-66 + i * 17, -140, 17, 32); }
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(-66, -110); ctx.lineTo(66, -110); ctx.lineTo(60, -136); ctx.lineTo(-60, -136); ctx.closePath(); outline(ctx, 2.5);
    ctx.beginPath(); for (var j = 0; j < 8; j++) { ctx.moveTo(-66 + j * 16.5 + 16.5, -110); ctx.arc(-66 + j * 16.5 + 8.25, -110, 8.25, 0, Math.PI); }
    inkFill(ctx, c, 2);
    /** @type {Array<[string, number]>} [màu, x px] */
    var fruits = [['#ff5a5a', -36], ['#ffd23f', -12], ['#7fd08a', 12], ['#ff9a3c', 36]];
    fruits.forEach(function (f, k) { ctx.beginPath(); ctx.arc(f[1], -58, 9, 0, TAU); inkFill(ctx, f[0], 1.6); if (k === 1) face(ctx, f[1], -59, 0.4, 'happy'); });
    face(ctx, 0, -24, 0.9, o.mood || 'smile', t);
  });

  // Cối xay gió (Hà Lan / đồng quê) cánh quay chậm.
  def('windmill', function (ctx, t, o) {
    var c = o.color || '#ffe6b3';
    D.shadow(ctx, 40);
    ctx.beginPath(); ctx.moveTo(-34, 0); ctx.lineTo(-22, -120); ctx.lineTo(22, -120); ctx.lineTo(34, 0); ctx.closePath(); inkFill(ctx, c, 2.5);
    ctx.beginPath(); ctx.moveTo(-28, -118); ctx.quadraticCurveTo(0, -156, 28, -118); ctx.closePath(); inkFill(ctx, o.roof || '#d9663b', 2.5);
    ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(-10, -24); ctx.arc(0, -24, 10, Math.PI, 0); ctx.lineTo(10, 0); ctx.closePath(); inkFill(ctx, '#8a5a3a', 2);
    face(ctx, 0, -66, 0.9, o.mood || 'happy', t);
    // cánh quạt: dời gốc về trục, xoay theo t; trong vòng lặp mỗi cánh xoay thêm 90° (phép xoay cộng dồn)
    // nên cả 4 cánh dùng chung đúng một đoạn lệnh vẽ.
    ctx.save(); ctx.translate(0, -112); ctx.rotate(t * 0.8);
    for (var i = 0; i < 4; i++) { ctx.rotate(TAU / 4); rr(ctx, -6, -84, 20, 74, 3); inkFill(ctx, '#ffffff', 2); ctx.strokeStyle = '#c8b49a'; ctx.lineWidth = 1.5; ctx.beginPath(); for (var y = -78; y < -14; y += 12) { ctx.moveTo(-6, y); ctx.lineTo(14, y); } ctx.stroke(); }
    ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); inkFill(ctx, '#8a5a3a', 2);
    ctx.restore();
  });
})();
