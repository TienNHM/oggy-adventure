/* Hành trình "home" — CẢNH NỀN theo chủ đề (Cuốn Bách Khoa Kỳ Diệu).
 * Chủ sở hữu v2: agent journey-home (CHỈ src/journeys/home/). Hợp đồng ThemeDef: docs/STORY.md mục 4.
 *
 * 5 chủ đề: home-kitchen, home-garden, home-roof (ban ngày, cầu vồng), home-roof-night (trăng sao),
 * home-basement (xưởng chế tạo ấm áp, không đáng sợ).
 * - Lớp parallax: dùng { kind:'custom', draw } (OG.Scenery.drawLayer gọi layer.draw) => không phụ thuộc
 *   thư viện decor chung; riêng lớp 'hills' tham chiếu theo tên (thiếu thì OG.Scenery vẽ đồi dự phòng).
 * - Decor riêng: OG.Scenery.registerDecor('home-...') (x = tâm, y = mặt đất, không gian thế giới).
 * - Sàn/bục: drawCustom.platform (trả true) + platformStyle làm dự phòng cho bộ vẽ khác.
 * Mọi đồ vật đều có khuôn mặt dễ thương, viền ink #17233d dày. */
(function () {
  'use strict';
  var OG = window.OG;
  var S = OG.Scenery;
  var TAU = Math.PI * 2;
  var INK = '#17233d';
  var W = OG.W || 960, H = OG.H || 540, FLOOR = OG.FLOOR_Y || 480;

  // ---------------------------------------------------------------------------
  // Tiện ích vẽ
  // ---------------------------------------------------------------------------
  function wrap(x, span) { return ((x % span) + span) % span; }
  // Chấm tròn tô màu hiện tại (mỗi chấm một path riêng để không bị nối nét).
  function dot(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
  function rr(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  function ink(ctx, w) { ctx.strokeStyle = INK; ctx.lineWidth = w || 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); }
  function fillInk(ctx, color, w) { ctx.fillStyle = color; ctx.fill(); ink(ctx, w); }
  // Khuôn mặt: ưu tiên OG.Decor.face của thư viện chung; thiếu thì tự vẽ.
  function face(ctx, x, y, s, mood) {
    if (OG.Decor && typeof OG.Decor.face === 'function') { OG.Decor.face(ctx, x, y, s, mood); return; }
    ctx.save();
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.arc(x - 6 * s, y, 2.4 * s, 0, TAU); ctx.arc(x + 6 * s, y, 2.4 * s, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,120,150,0.55)';
    ctx.beginPath(); ctx.arc(x - 10 * s, y + 5 * s, 2.6 * s, 0, TAU); ctx.arc(x + 10 * s, y + 5 * s, 2.6 * s, 0, TAU); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.8 * s; ctx.lineCap = 'round';
    ctx.beginPath();
    if (mood === 'o') ctx.arc(x, y + 6 * s, 2.5 * s, 0, TAU); else ctx.arc(x, y + 3 * s, 4 * s, 0.25, Math.PI - 0.25);
    ctx.stroke();
    ctx.restore();
  }
  // Mắt nhắm ngủ (cho Mặt Trăng, bóng đèn...).
  function sleepyFace(ctx, x, y, s) {
    ctx.save();
    ctx.strokeStyle = INK; ctx.lineWidth = 2 * s; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x - 6 * s, y, 3 * s, 0.1, Math.PI - 0.1); ctx.moveTo(x + 9 * s, y); ctx.arc(x + 6 * s, y, 3 * s, 0.1, Math.PI - 0.1); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y + 5 * s, 3 * s, 0.2, Math.PI - 0.2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,120,150,0.5)';
    ctx.beginPath(); ctx.arc(x - 11 * s, y + 5 * s, 2.6 * s, 0, TAU); ctx.arc(x + 11 * s, y + 5 * s, 2.6 * s, 0, TAU); ctx.fill();
    ctx.restore();
  }
  // Vẽ hợp của nhiều vòng tròn với viền ngoài sạch: tô viền dày từng vòng trước, rồi tô màu đè lên.
  // circles: [[x, y, r], ...]
  function blob(ctx, circles, fill, stroke, lw) {
    var i;
    ctx.fillStyle = stroke || INK;
    for (i = 0; i < circles.length; i++) { ctx.beginPath(); ctx.arc(circles[i][0], circles[i][1], circles[i][2] + (lw || 3) / 2, 0, TAU); ctx.fill(); }
    ctx.fillStyle = fill;
    for (i = 0; i < circles.length; i++) { ctx.beginPath(); ctx.arc(circles[i][0], circles[i][1], circles[i][2] - (lw || 3) / 2, 0, TAU); ctx.fill(); }
  }
  function cloudCircles(x, y, s) {
    return [[x - 26 * s, y + 6 * s, 16 * s], [x - 6 * s, y - 8 * s, 22 * s], [x + 18 * s, y - 2 * s, 19 * s],
      [x + 34 * s, y + 8 * s, 13 * s], [x - 10 * s, y + 10 * s, 15 * s], [x + 12 * s, y + 10 * s, 15 * s]];
  }
  // Mây mặt cười (dùng ở vườn, mái nhà, truyện tranh).
  function smileCloud(ctx, x, y, s, color, t, sleepy) {
    ctx.save();
    blob(ctx, cloudCircles(x, y, s), color || '#ffffff', 'rgba(23,35,61,0.45)', 3);
    if (sleepy) sleepyFace(ctx, x + 4 * s, y + 4 * s, 0.8 * s); else face(ctx, x + 4 * s, y + 4 * s, 0.8 * s);
    ctx.restore();
  }
  // Mặt Trời mặt cười với tia nắng xoay chậm.
  function smileSun(ctx, x, y, r, t) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(255,236,140,0.35)';
    ctx.beginPath(); ctx.arc(0, 0, r * 1.6, 0, TAU); ctx.fill();
    ctx.rotate(t * 0.25);
    ctx.fillStyle = '#ffcf3f';
    for (var i = 0; i < 12; i++) {
      ctx.rotate(TAU / 12);
      ctx.beginPath(); ctx.moveTo(-6, -r - 2); ctx.lineTo(0, -r - 18); ctx.lineTo(6, -r - 2); ctx.closePath(); ctx.fill();
    }
    ctx.rotate(-t * 0.25);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); fillInk(ctx, '#ffd84a', 3);
    face(ctx, 0, 2, r / 22);
    ctx.restore();
  }
  // Cầu vồng 7 màu (đỏ, cam, vàng, lục, lam, chàm, tím) — đúng thứ tự từ ngoài vào trong.
  var RAINBOW = ['#ff5a5f', '#ff9f43', '#ffd84a', '#55c96b', '#4fb3e8', '#4b5fd1', '#9b6ae0'];
  function rainbow(ctx, cx, cy, r, band, alpha) {
    ctx.save();
    ctx.globalAlpha *= alpha == null ? 1 : alpha;
    ctx.lineWidth = band; ctx.lineCap = 'butt';
    for (var i = 0; i < RAINBOW.length; i++) {
      ctx.strokeStyle = RAINBOW[i];
      ctx.beginPath(); ctx.arc(cx, cy, r - i * band, Math.PI, TAU); ctx.stroke();
    }
    ctx.restore();
  }
  function star5(ctx, x, y, ro, ri, rot) {
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var r = i % 2 ? ri : ro, a = (rot || 0) + i * Math.PI / 5 - Math.PI / 2;
      if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
  }
  // Lặp một hình theo chu kỳ span trên màn hình (parallax px).
  function repeat(camX, px, span, fn) {
    var off = wrap(camX * px, span);
    for (var i = -1; i <= Math.ceil(W / span) + 1; i++) fn(i * span - off, i + Math.floor(camX * px / span));
  }
  // Số giả ngẫu nhiên ổn định theo chỉ số.
  function hash(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

  // ---------------------------------------------------------------------------
  // DECOR RIÊNG (thế giới; x = tâm, y = mặt đất). Nhỏ gọn (≤ ~70 px) để không che bục.
  // ---------------------------------------------------------------------------
  function decor(kind, fn) {
    S.registerDecor(kind, function (ctx, x, y, s, t, o) {
      ctx.translate(x, y); ctx.scale(s, s);
      fn(ctx, t || 0, o || {});
    });
  }

  // Giỏ trái cây: táo, cam, chuối — mỗi quả một khuôn mặt.
  decor('home-fruitbasket', function (ctx, t) {
    ctx.beginPath(); ctx.arc(-14, -30, 12, 0, TAU); fillInk(ctx, '#ff6b6b', 2.5); face(ctx, -14, -31, 0.5);
    ctx.beginPath(); ctx.arc(10, -32, 12, 0, TAU); fillInk(ctx, '#ffa53d', 2.5); face(ctx, 10, -33, 0.5);
    ctx.save(); ctx.translate(0, -40); ctx.rotate(-0.3);
    ctx.beginPath(); ctx.ellipse(0, 0, 16, 6, 0, 0, Math.PI); fillInk(ctx, '#ffe066', 2.5); ctx.restore();
    ctx.beginPath(); ctx.moveTo(-30, -24); ctx.lineTo(30, -24); ctx.lineTo(22, 0); ctx.lineTo(-22, 0); ctx.closePath();
    fillInk(ctx, '#c98b52', 3);
    ctx.strokeStyle = '#a06a38'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-26, -15); ctx.lineTo(26, -15); ctx.moveTo(-24, -7); ctx.lineTo(24, -7); ctx.stroke();
  });

  // Chậu cây thơm trên sàn bếp.
  decor('home-herbpot', function (ctx, t) {
    var sway = Math.sin(t * 2) * 0.08;
    ctx.save(); ctx.translate(0, -28); ctx.rotate(sway);
    ctx.fillStyle = '#55c96b';
    for (var i = -2; i <= 2; i++) {
      ctx.save(); ctx.rotate(i * 0.35);
      ctx.beginPath(); ctx.ellipse(0, -16, 6, 15, 0, 0, TAU); fillInk(ctx, '#55c96b', 2); ctx.restore();
    }
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(-18, -30); ctx.lineTo(18, -30); ctx.lineTo(14, 0); ctx.lineTo(-14, 0); ctx.closePath();
    fillInk(ctx, '#e8875a', 3);
    face(ctx, 0, -16, 0.7);
  });

  // Hướng dương khổng lồ mặt cười, đung đưa.
  decor('home-sunflower', function (ctx, t) {
    var sw = Math.sin(t * 1.6) * 4;
    ctx.strokeStyle = '#3f9a45'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(sw * 0.5, -40, sw, -78); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-12, -36, 12, 6, -0.5, 0, TAU); fillInk(ctx, '#55c96b', 2);
    ctx.beginPath(); ctx.ellipse(12, -48, 12, 6, 0.5, 0, TAU); fillInk(ctx, '#55c96b', 2);
    ctx.save(); ctx.translate(sw, -86);
    for (var i = 0; i < 12; i++) {
      var a = i * TAU / 12;
      ctx.beginPath(); ctx.ellipse(Math.cos(a) * 17, Math.sin(a) * 17, 9, 5, a, 0, TAU); fillInk(ctx, '#ffd23f', 2);
    }
    ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU); fillInk(ctx, '#8a5a32', 2.5);
    face(ctx, 0, -1, 0.75);
    ctx.restore();
  });

  // Luống cà rốt: lá xanh vẫy vẫy, củ cam ló đầu cười.
  decor('home-carrots', function (ctx, t) {
    ctx.beginPath(); ctx.ellipse(0, -2, 46, 10, 0, Math.PI, TAU); fillInk(ctx, '#8a5a32', 2.5);
    for (var i = -1; i <= 1; i++) {
      var x = i * 26, w = Math.sin(t * 3 + i) * 0.15;
      ctx.save(); ctx.translate(x, -12); ctx.rotate(w);
      ctx.fillStyle = '#55c96b';
      ctx.beginPath(); ctx.ellipse(-5, -14, 4, 12, -0.4, 0, TAU); ctx.ellipse(5, -14, 4, 12, 0.4, 0, TAU); ctx.ellipse(0, -16, 4, 13, 0, 0, TAU); fillInk(ctx, '#55c96b', 2);
      ctx.restore();
      ctx.beginPath(); ctx.moveTo(x - 10, -12); ctx.lineTo(x + 10, -12); ctx.lineTo(x, 2); ctx.closePath(); fillInk(ctx, '#ff8c2e', 2.5);
      face(ctx, x, -8, 0.4);
    }
  });

  // Bình tưới mặt cười (vòng tuần hoàn nước: cây cần nước).
  decor('home-wateringcan', function (ctx, t) {
    ctx.beginPath(); ctx.moveTo(14, -24); ctx.lineTo(38, -42); ctx.lineTo(42, -36); ctx.lineTo(18, -16); ctx.closePath(); fillInk(ctx, '#4fb3e8', 2.5);
    rr(ctx, -22, -36, 40, 36, 8); fillInk(ctx, '#52b9df', 3);
    ctx.beginPath(); ctx.arc(-2, -36, 14, Math.PI, TAU); ink(ctx, 4);
    face(ctx, -2, -20, 0.7);
    var d = (t * 1.5) % 1;
    ctx.fillStyle = 'rgba(108,198,242,' + (1 - d).toFixed(2) + ')';
    ctx.beginPath(); ctx.ellipse(44 + d * 6, -34 + d * 30, 3, 4.5, 0, 0, TAU); ctx.fill();
  });

  // Ống khói nhỏ có mặt, nhả khói tròn.
  decor('home-chimney', function (ctx, t, o) {
    var night = !!o.night;
    for (var i = 0; i < 3; i++) {
      var k = (t * 0.6 + i / 3) % 1;
      ctx.fillStyle = night ? 'rgba(200,200,230,' + (0.5 * (1 - k)).toFixed(2) + ')' : 'rgba(255,255,255,' + (0.8 * (1 - k)).toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(Math.sin(k * 6 + i) * 6, -62 - k * 50, 7 + k * 9, 0, TAU); ctx.fill();
    }
    rr(ctx, -16, -56, 32, 56, 4); fillInk(ctx, night ? '#8e4a3c' : '#c4573f', 3);
    rr(ctx, -21, -62, 42, 10, 3); fillInk(ctx, night ? '#6e3a30' : '#a6452f', 3);
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-16, -18); ctx.lineTo(16, -18); ctx.moveTo(-16, -38); ctx.lineTo(16, -38); ctx.stroke();
    face(ctx, 0, -30, 0.75);
  });

  // Chong chóng gió hình gà trống (gió thổi -> quay).
  decor('home-weathervane', function (ctx, t) {
    ctx.strokeStyle = INK; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -64); ctx.stroke();
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-16, -44); ctx.lineTo(16, -44); ctx.moveTo(0, -36); ctx.lineTo(0, -52); ctx.stroke();
    ctx.fillStyle = INK; ctx.font = OG.font(9, 'bold'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Đ', 22, -44); ctx.fillText('T', -22, -44); ctx.fillText('B', 0, -58);
    var sq = Math.cos(t * 0.9); // quay quanh trục đứng -> co giãn ngang
    ctx.save(); ctx.translate(0, -74); ctx.scale(sq, 1);
    ctx.beginPath(); ctx.moveTo(-18, 6); ctx.quadraticCurveTo(-20, -8, -6, -10); ctx.lineTo(6, -16); ctx.lineTo(14, -8); ctx.lineTo(20, 4); ctx.closePath();
    fillInk(ctx, '#ffc94a', 2.5);
    ctx.fillStyle = '#ff5a5f'; ctx.beginPath(); ctx.arc(8, -18, 4, 0, TAU); ctx.fill();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(10, -10, 1.8, 0, TAU); ctx.fill();
    ctx.restore();
  });

  // Chú chim sẻ đậu trên mái, thỉnh thoảng nhún.
  decor('home-birdie', function (ctx, t, o) {
    var hop = Math.max(0, Math.sin(t * 3)) * 4;
    ctx.save(); ctx.translate(0, -hop);
    ctx.strokeStyle = '#f29b38'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-4, -2); ctx.lineTo(-4, 4 + hop); ctx.moveTo(4, -2); ctx.lineTo(4, 4 + hop); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, -14, 15, 13, 0, 0, TAU); fillInk(ctx, o.color || '#8fb7e8', 2.5);
    ctx.beginPath(); ctx.ellipse(-6, -12, 8, 5, -0.4, 0, TAU); fillInk(ctx, '#ffffff', 2);
    ctx.beginPath(); ctx.moveTo(13, -16); ctx.lineTo(22, -13); ctx.lineTo(13, -10); ctx.closePath(); fillInk(ctx, '#ffb347', 2);
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(6, -18, 2, 0, TAU); ctx.fill();
    ctx.restore();
  });

  // Kính thiên văn của Olivia (ngắm sao).
  decor('home-telescope', function (ctx, t) {
    ctx.strokeStyle = INK; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(-16, 0); ctx.moveTo(0, -30); ctx.lineTo(16, 0); ctx.moveTo(0, -30); ctx.lineTo(0, 0); ctx.stroke();
    ctx.save(); ctx.translate(0, -36); ctx.rotate(-0.6);
    rr(ctx, -26, -9, 52, 18, 6); fillInk(ctx, '#7b6cf0', 3);
    rr(ctx, 22, -12, 10, 24, 3); fillInk(ctx, '#ffc94a', 2.5);
    ctx.fillStyle = '#ffffff'; star5(ctx, -6, 0, 5, 2.2, 0); ctx.fill();
    ctx.restore();
  });

  // Bộ 3 thùng rác phân loại (hữu cơ xanh lá / tái chế xanh dương / còn lại xám) có mặt.
  decor('home-bins', function (ctx, t) {
    var cols = ['#55c96b', '#4fb3e8', '#a3a9b8'];
    for (var i = 0; i < 3; i++) {
      var x = (i - 1) * 34, bob = Math.sin(t * 3 + i) * 1.5;
      ctx.save(); ctx.translate(x, 0);
      ctx.beginPath(); ctx.moveTo(-14, -44); ctx.lineTo(14, -44); ctx.lineTo(11, 0); ctx.lineTo(-11, 0); ctx.closePath(); fillInk(ctx, cols[i], 2.5);
      rr(ctx, -17, -52 + bob, 34, 9, 3); fillInk(ctx, cols[i], 2.5);
      face(ctx, 0, -28, 0.6);
      if (i === 1) { // biểu tượng tái chế vẽ bằng 3 mũi tên tròn
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, -12, 5, 0.3, 5.6); ctx.stroke();
      } else if (i === 0) { // lá cây (hữu cơ)
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(0, -12, 3, 5, 0.6, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
  });

  // Cục pin to mặt cười.
  decor('home-battery', function (ctx, t) {
    rr(ctx, -16, -62, 32, 62, 8); fillInk(ctx, '#55c96b', 3);
    ctx.save(); rr(ctx, -16, -62, 32, 26, 8); ctx.clip(); ctx.fillStyle = '#2f3b52'; ctx.fillRect(-16, -62, 32, 26); ctx.restore();
    rr(ctx, -16, -62, 32, 62, 8); ink(ctx, 3);
    rr(ctx, -6, -70, 12, 9, 2); fillInk(ctx, '#c6d5e3', 2.5);
    ctx.fillStyle = '#ffffff'; ctx.font = OG.font(14, 'bold'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('+', 0, -50);
    face(ctx, 0, -22, 0.75);
    if (Math.sin(t * 4) > 0.6) { // tia lấp lánh
      ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(22, -60); ctx.lineTo(30, -66); ctx.moveTo(24, -50); ctx.lineTo(34, -50); ctx.stroke();
    }
  });

  // Nam châm hình móng ngựa hút mấy chiếc kẹp giấy.
  decor('home-magnet', function (ctx, t) {
    ctx.save(); ctx.translate(0, -40);
    ctx.lineWidth = 16; ctx.lineCap = 'butt';
    ctx.strokeStyle = INK; ctx.beginPath(); ctx.arc(0, 0, 20, Math.PI, TAU); ctx.lineTo(20, 22); ctx.moveTo(-20, 0); ctx.lineTo(-20, 22); ctx.stroke();
    ctx.lineWidth = 11;
    ctx.strokeStyle = '#ff5a5f'; ctx.beginPath(); ctx.arc(0, 0, 20, Math.PI, TAU); ctx.lineTo(20, 12); ctx.moveTo(-20, 0); ctx.lineTo(-20, 12); ctx.stroke();
    ctx.strokeStyle = '#e9eef5'; ctx.beginPath(); ctx.moveTo(-20, 12); ctx.lineTo(-20, 21); ctx.moveTo(20, 12); ctx.lineTo(20, 21); ctx.stroke();
    face(ctx, 0, -18, 0.55);
    ctx.restore();
    // kẹp giấy nhảy lên phía nam châm
    for (var i = 0; i < 3; i++) {
      var k = (t * 0.8 + i * 0.33) % 1, y = -6 - k * 8;
      ctx.save(); ctx.translate((i - 1) * 16, y); ctx.rotate((i - 1) * 0.4);
      rr(ctx, -3, -7, 6, 14, 3); ctx.strokeStyle = '#7a8aa0'; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
    }
  });

  // Thùng các-tông có mặt (đồ cũ chờ tái chế).
  decor('home-box', function (ctx, t) {
    rr(ctx, -24, -38, 48, 38, 3); fillInk(ctx, '#d9a066', 3);
    ctx.beginPath(); ctx.moveTo(-24, -38); ctx.lineTo(-30, -48); ctx.lineTo(-4, -48); ctx.lineTo(0, -38); ctx.closePath(); fillInk(ctx, '#e8b57e', 2.5);
    ctx.fillStyle = '#c48a50'; ctx.fillRect(-4, -38, 8, 38);
    face(ctx, 0, -20, 0.7, Math.sin(t) > 0.7 ? 'o' : null);
  });

  // ---------------------------------------------------------------------------
  // Sàn/bục vẽ riêng (trả true để bộ vẽ chung không vẽ đè)
  // ---------------------------------------------------------------------------
  function isFloor(a) { return a.isFloor || a.y > 470; }

  function kitchenPlatform(ctx, a) {
    if (isFloor(a)) {
      // gạch ô bàn cờ mint/kem
      ctx.save();
      ctx.beginPath(); ctx.rect(a.x, a.y, a.w, a.h); ctx.clip();
      var sz = 30, x0 = Math.floor(a.x / sz) * sz;
      for (var x = x0; x < a.x + a.w; x += sz) for (var y = a.y; y < a.y + a.h; y += sz) {
        ctx.fillStyle = ((x / sz + (y - a.y) / sz) & 1) ? '#bfeadb' : '#fff6df';
        ctx.fillRect(x, y, sz, sz);
      }
      ctx.restore();
      ctx.fillStyle = '#e48a5a'; ctx.fillRect(a.x, a.y, a.w, 8);
      ctx.fillStyle = INK; ctx.fillRect(a.x, a.y + 8, a.w, 2);
      return true;
    }
    // kệ gỗ có giá đỡ
    ctx.fillStyle = '#a8693c';
    for (var bx = a.x + 14; bx < a.x + a.w - 10; bx += Math.max(60, a.w - 34)) {
      ctx.beginPath(); ctx.moveTo(bx, a.y + a.h); ctx.lineTo(bx + 14, a.y + a.h); ctx.lineTo(bx, a.y + a.h + 14); ctx.closePath(); ctx.fill();
    }
    rr(ctx, a.x, a.y, a.w, a.h, 6); fillInk(ctx, '#d9945a', 3);
    ctx.fillStyle = '#f2b77c'; ctx.fillRect(a.x + 4, a.y + 3, a.w - 8, 4);
    return true;
  }

  function gardenPlatform(ctx, a) {
    if (isFloor(a)) {
      ctx.fillStyle = '#b97a45'; ctx.fillRect(a.x, a.y, a.w, a.h);
      ctx.fillStyle = '#a0683a';
      for (var x = Math.floor(a.x / 70) * 70; x < a.x + a.w; x += 70) {
        if (x < a.x - 10) continue;
        ctx.beginPath(); ctx.ellipse(x + 30, a.y + 34, 7, 4, 0, 0, TAU); ctx.ellipse(x + 58, a.y + 48, 5, 3, 0, 0, TAU); ctx.fill();
      }
      // cỏ lượn sóng
      ctx.fillStyle = '#6cc35a';
      ctx.beginPath(); ctx.moveTo(a.x, a.y + 12);
      for (var gx = a.x; gx <= a.x + a.w; gx += 16) ctx.quadraticCurveTo(gx + 8, a.y + 18, Math.min(gx + 16, a.x + a.w), a.y + 12);
      ctx.lineTo(a.x + a.w, a.y - 2); ctx.lineTo(a.x, a.y - 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#8fdc6a'; ctx.fillRect(a.x, a.y - 2, a.w, 4);
      return true;
    }
    // bục: tấm gỗ có cỏ + lá
    rr(ctx, a.x, a.y, a.w, a.h, 9); fillInk(ctx, '#b97945', 3);
    rr(ctx, a.x - 2, a.y - 3, a.w + 4, 9, 5); fillInk(ctx, '#7ed957', 2.5);
    ctx.beginPath(); ctx.ellipse(a.x + 8, a.y + 2, 9, 5, -0.6, 0, TAU); fillInk(ctx, '#55c96b', 2);
    ctx.beginPath(); ctx.ellipse(a.x + a.w - 8, a.y + 2, 9, 5, 0.6, 0, TAU); fillInk(ctx, '#55c96b', 2);
    return true;
  }

  function roofPlatform(ctx, a, night) {
    var tile = night ? '#9a4b3f' : '#d9603f', top = night ? '#b8665a' : '#f08a5d', line = night ? '#6b2f28' : '#a6452f';
    if (isFloor(a)) {
      ctx.fillStyle = tile; ctx.fillRect(a.x, a.y, a.w, a.h);
      ctx.save(); ctx.beginPath(); ctx.rect(a.x, a.y, a.w, a.h); ctx.clip();
      ctx.strokeStyle = line; ctx.lineWidth = 2.5;
      var x0 = Math.floor(a.x / 28) * 28;
      for (var row = 0; row < 4; row++) {
        var ry = a.y + 14 + row * 14;
        ctx.beginPath();
        for (var x = x0 - 28 + (row % 2) * 14; x < a.x + a.w + 28; x += 28) { ctx.moveTo(x + 28, ry); ctx.arc(x + 14, ry, 14, 0, Math.PI); }
        ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = top; ctx.fillRect(a.x, a.y, a.w, 8);
      ctx.fillStyle = INK; ctx.fillRect(a.x, a.y + 8, a.w, 2);
      // nóc mái hai đầu đoạn sàn (hố giữa hai mái nhà)
      ctx.beginPath(); ctx.arc(a.x + 4, a.y + 4, 6, 0, TAU); ctx.arc(a.x + a.w - 4, a.y + 4, 6, 0, TAU); fillInk(ctx, top, 2);
      return true;
    }
    // bục: gờ ống khói gạch
    rr(ctx, a.x, a.y, a.w, a.h, 4); fillInk(ctx, night ? '#7d4a52' : '#b5523b', 3);
    ctx.fillStyle = night ? '#a8707a' : '#f0a77e'; ctx.fillRect(a.x + 3, a.y + 3, a.w - 6, 4);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (var bx = a.x + 22; bx < a.x + a.w - 6; bx += 26) ctx.fillRect(bx, a.y + 8, 2, a.h - 10);
    return true;
  }

  function basementPlatform(ctx, a) {
    if (isFloor(a)) {
      ctx.fillStyle = '#8f9bb0'; ctx.fillRect(a.x, a.y, a.w, a.h);
      // vệt sơn màu vui mắt
      var cols = ['#ff8fb1', '#ffd84a', '#7ed957', '#52b9df'];
      for (var x = Math.floor(a.x / 110) * 110; x < a.x + a.w; x += 110) {
        if (x < a.x) continue;
        var k = Math.abs(Math.floor(x / 110)) % 4;
        ctx.fillStyle = cols[k];
        ctx.beginPath(); ctx.ellipse(x + 40, a.y + 30 + (k % 2) * 12, 9, 5, 0.3, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = '#b8c3d4'; ctx.fillRect(a.x, a.y, a.w, 8);
      ctx.fillStyle = INK; ctx.fillRect(a.x, a.y + 8, a.w, 2);
      return true;
    }
    // bục: thùng gỗ ghép
    rr(ctx, a.x, a.y, a.w, a.h, 4); fillInk(ctx, '#c98b52', 3);
    ctx.strokeStyle = '#8a5a32'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (var bx = a.x + 30; bx < a.x + a.w - 10; bx += 30) { ctx.moveTo(bx, a.y + 3); ctx.lineTo(bx, a.y + a.h - 3); }
    ctx.stroke();
    ctx.fillStyle = '#e8b57e'; ctx.fillRect(a.x + 3, a.y + 3, a.w - 6, 3);
    return true;
  }

  // ---------------------------------------------------------------------------
  // 1) NHÀ BẾP
  // ---------------------------------------------------------------------------
  function kitchenWall(ctx, camX, t) {
    // gạch men tường (đứng yên nhẹ)
    ctx.fillStyle = '#fff1d6'; ctx.fillRect(0, 0, W, FLOOR);
    var off = wrap(camX * 0.08, 40);
    ctx.strokeStyle = 'rgba(232,180,120,0.45)'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (var y = 170; y < FLOOR; y += 40) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    for (var x = -off; x < W + 40; x += 40) { ctx.moveTo(x, 170); ctx.lineTo(x, FLOOR); }
    ctx.stroke();
    // cửa sổ: trời xanh + mặt trời cười + rèm kẻ caro
    repeat(camX, 0.1, 900, function (x) {
      var wx = x + 300;
      rr(ctx, wx, 50, 230, 170, 14); fillInk(ctx, '#9fdcf7', 4);
      ctx.save(); rr(ctx, wx, 50, 230, 170, 14); ctx.clip();
      smileSun(ctx, wx + 160, 110, 26, t);
      smileCloud(ctx, wx + 60, 150, 0.6, '#ffffff', t);
      ctx.restore();
      ctx.strokeStyle = INK; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(wx + 115, 50); ctx.lineTo(wx + 115, 220); ctx.moveTo(wx, 135); ctx.lineTo(wx + 230, 135); ctx.stroke();
      ctx.fillStyle = '#ff8fb1';
      ctx.beginPath(); ctx.moveTo(wx - 12, 40); ctx.lineTo(wx + 40, 40); ctx.quadraticCurveTo(wx + 20, 140, wx + 34, 228); ctx.lineTo(wx - 12, 228); ctx.closePath(); fillInk(ctx, '#ff8fb1', 3);
      ctx.beginPath(); ctx.moveTo(wx + 242, 40); ctx.lineTo(wx + 190, 40); ctx.quadraticCurveTo(wx + 210, 140, wx + 196, 228); ctx.lineTo(wx + 242, 228); ctx.closePath(); fillInk(ctx, '#ff8fb1', 3);
      rr(ctx, wx - 20, 30, 270, 12, 6); fillInk(ctx, '#c98b52', 3);
    });
  }

  function kitchenCabinets(ctx, camX, t) {
    repeat(camX, 0.3, 640, function (x, i) {
      // tủ trên có mặt (tay nắm = lông mày), nồi treo
      var cx = x + 20;
      rr(ctx, cx, 20, 180, 96, 10); fillInk(ctx, '#7fc8a9', 3);
      ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(cx + 90, 26); ctx.lineTo(cx + 90, 110); ctx.stroke();
      face(ctx, cx + 90, 70, 1.4);
      // tủ lạnh to bên phải (có nam châm hình trái tim)
      var fx = x + 440;
      rr(ctx, fx, 190, 120, 290, 18); fillInk(ctx, '#e9f4ff', 4);
      ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(fx, 290); ctx.lineTo(fx + 120, 290); ctx.stroke();
      rr(ctx, fx + 98, 220, 8, 50, 4); fillInk(ctx, '#a3a9b8', 2);
      rr(ctx, fx + 98, 310, 8, 60, 4); fillInk(ctx, '#a3a9b8', 2);
      face(ctx, fx + 56, 240, 1.3, Math.sin(t * 0.7 + i) > 0.8 ? 'o' : null);
      ctx.fillStyle = '#ff5a6e'; ctx.beginPath(); ctx.arc(fx + 30, 330, 7, 0, TAU); ctx.arc(fx + 42, 330, 7, 0, TAU); ctx.moveTo(fx + 23, 333); ctx.lineTo(fx + 36, 348); ctx.lineTo(fx + 49, 333); ctx.fill();
      // quầy bếp dưới + bếp có nồi cười bốc hơi
      rr(ctx, x + 10, 330, 380, 150, 8); fillInk(ctx, '#f6c177', 3);
      rr(ctx, x, 316, 400, 20, 6); fillInk(ctx, '#ffffff', 3);
      for (var d = 0; d < 3; d++) { rr(ctx, x + 30 + d * 120, 352, 100, 50, 6); fillInk(ctx, '#ffd9a0', 2.5); rr(ctx, x + 66 + d * 120, 370, 28, 7, 3); fillInk(ctx, '#c98b52', 2); }
      rr(ctx, x + 250, 300, 90, 18, 5); fillInk(ctx, '#3d4a63', 3);
      rr(ctx, x + 262, 266, 66, 38, 10); fillInk(ctx, '#ff6b6b', 3);
      face(ctx, x + 295, 284, 0.9);
      for (var s = 0; s < 3; s++) {
        var k = (t * 0.7 + s / 3) % 1;
        ctx.fillStyle = 'rgba(255,255,255,' + (0.8 * (1 - k)).toFixed(2) + ')';
        ctx.beginPath(); ctx.arc(x + 280 + s * 14 + Math.sin(k * 8) * 4, 258 - k * 60, 6 + k * 6, 0, TAU); ctx.fill();
      }
      // lọ bánh quy và lọ muối
      rr(ctx, x + 60, 270, 46, 48, 12); fillInk(ctx, 'rgba(210,240,255,0.9)', 3);
      ctx.fillStyle = '#d9945a'; dot(ctx, x + 76, 302, 8); dot(ctx, x + 92, 296, 8);
      rr(ctx, x + 64, 262, 38, 10, 4); fillInk(ctx, '#ff8fb1', 2.5);
    });
    // dải sàn cho truyện tranh (trong màn chơi bị sàn thật che)
    ctx.fillStyle = '#bfeadb'; ctx.fillRect(0, FLOOR, W, H - FLOOR);
    ctx.fillStyle = '#e48a5a'; ctx.fillRect(0, FLOOR, W, 8);
  }

  S.registerTheme('home-kitchen', {
    name: 'Nhà bếp', base: 'kitchen',
    sky: { top: '#fff1d6', bottom: '#ffe2b8', clouds: false },
    layers: [
      { kind: 'custom', parallax: 0.08, draw: function (ctx, camX, t) { kitchenWall(ctx, camX, t); } },
      { kind: 'custom', parallax: 0.3, draw: function (ctx, camX, t) { kitchenCabinets(ctx, camX, t); } }
    ],
    platformStyle: { floor: { fill: '#fff6df', top: '#e48a5a', topH: 8, radius: 0 }, ledge: { fill: '#d9945a', top: '#f2b77c', topH: 5, radius: 6 } },
    decor: [
      { kind: 'home-fruitbasket', every: 760, start: 420 },
      { kind: 'home-herbpot', every: 980, start: 120 }
    ],
    ambient: { kind: 'bubbles', color: 'rgba(255,255,255,0.55)' },
    drawCustom: { platform: function (ctx, a) { return kitchenPlatform(ctx, a); } }
  });

  // ---------------------------------------------------------------------------
  // 2) KHU VƯỜN
  // ---------------------------------------------------------------------------
  function gardenSky(ctx, camX, t) {
    smileSun(ctx, 800 - camX * 0.02, 96, 40, t);
    for (var i = 0; i < 5; i++) {
      var x = wrap(i * 260 + 60 - camX * 0.08 - t * 6, W + 240) - 120;
      smileCloud(ctx, x, 70 + (i % 3) * 36, 0.8 + (i % 2) * 0.25, '#ffffff', t);
    }
  }
  // Ngôi nhà xanh của Oggy ở xa.
  function oggyHouse(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    rr(ctx, -80, -110, 160, 110, 6); fillInk(ctx, '#7fc4e8', 3);
    ctx.beginPath(); ctx.moveTo(-96, -106); ctx.lineTo(0, -180); ctx.lineTo(96, -106); ctx.closePath(); fillInk(ctx, '#e5604d', 3);
    rr(ctx, 40, -172, 20, 40, 3); fillInk(ctx, '#b5523b', 3);
    rr(ctx, -60, -84, 38, 34, 5); fillInk(ctx, '#fff3b8', 3);
    rr(ctx, 22, -84, 38, 34, 5); fillInk(ctx, '#fff3b8', 3);
    rr(ctx, -16, -58, 32, 58, 6); fillInk(ctx, '#c98b52', 3);
    ctx.restore();
  }
  function gardenFar(ctx, camX, t) {
    repeat(camX, 0.18, 1300, function (x) {
      oggyHouse(ctx, x + 420, 410, 0.85);
      // cây tán tròn mặt cười
      for (var k = 0; k < 2; k++) {
        var tx = x + 120 + k * 760;
        rr(ctx, tx - 9, 330, 18, 80, 6); fillInk(ctx, '#a0683a', 3);
        blob(ctx, [[tx - 26, 320, 34], [tx + 26, 320, 34], [tx, 290, 40], [tx, 318, 34]], '#5fbf55', INK, 3);
        face(ctx, tx, 310, 1.2);
        ctx.fillStyle = '#ff6b6b';
        dot(ctx, tx - 30, 300, 6); dot(ctx, tx + 32, 312, 6); dot(ctx, tx + 10, 276, 6);
      }
    });
  }
  function gardenFence(ctx, camX, t) {
    var off = wrap(camX * 0.45, 40);
    ctx.fillStyle = '#ffffff';
    for (var x = -off - 40; x < W + 40; x += 40) {
      ctx.beginPath(); ctx.moveTo(x + 6, FLOOR); ctx.lineTo(x + 6, 410); ctx.lineTo(x + 18, 398); ctx.lineTo(x + 30, 410); ctx.lineTo(x + 30, FLOOR); ctx.closePath();
      fillInk(ctx, '#fffaf0', 2.5);
    }
    rr(ctx, -10, 424, W + 20, 10, 4); fillInk(ctx, '#fffaf0', 2.5);
    rr(ctx, -10, 452, W + 20, 10, 4); fillInk(ctx, '#fffaf0', 2.5);
    // bướm bay lượn
    for (var i = 0; i < 3; i++) {
      var bx = wrap(i * 340 + t * 40 - camX * 0.45, W + 100) - 50, by = 360 + Math.sin(t * 2 + i * 2) * 26;
      var fl = Math.abs(Math.sin(t * 12 + i));
      ctx.fillStyle = ['#ff8fb1', '#ffd23f', '#b18cff'][i];
      ctx.beginPath(); ctx.ellipse(bx - 6 * fl, by, 7 * fl + 1, 6, 0, 0, TAU); ctx.ellipse(bx + 6 * fl, by, 7 * fl + 1, 6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = INK; ctx.fillRect(bx - 1, by - 5, 2, 10);
    }
    ctx.fillStyle = '#6cc35a'; ctx.fillRect(0, FLOOR, W, H - FLOOR);
  }

  S.registerTheme('home-garden', {
    name: 'Khu vườn', base: 'garden',
    sky: { top: '#7fd6f5', bottom: '#e9f8cf', clouds: false },
    layers: [
      { kind: 'custom', parallax: 0.05, draw: function (ctx, camX, t) { gardenSky(ctx, camX, t); } },
      { kind: 'hills', parallax: 0.12, y: 420, height: 90, color: '#bfe6a0', spacing: 420 },
      { kind: 'custom', parallax: 0.18, draw: function (ctx, camX, t) { gardenFar(ctx, camX, t); } },
      { kind: 'custom', parallax: 0.45, draw: function (ctx, camX, t) { gardenFence(ctx, camX, t); } }
    ],
    platformStyle: { floor: { fill: '#b97a45', top: '#6cc35a', topH: 12 }, ledge: { fill: '#b97945', top: '#7ed957', radius: 9 } },
    decor: [
      { kind: 'home-sunflower', every: 700, start: 260 },
      { kind: 'flower', every: 420, start: 120, opts: { color: '#ff8fb1' } },
      { kind: 'home-carrots', every: 1100, start: 620 },
      { kind: 'home-wateringcan', every: 1500, start: 980 }
    ],
    ambient: { kind: 'sparkle', color: 'rgba(255,240,150,0.75)' },
    drawCustom: { platform: function (ctx, a) { return gardenPlatform(ctx, a); } }
  });

  // ---------------------------------------------------------------------------
  // 3) MÁI NHÀ (ban ngày, cầu vồng) và 4) MÁI NHÀ BAN ĐÊM (trăng, sao)
  // ---------------------------------------------------------------------------
  // Dãy nhà phố có cửa sổ làm "mắt" và cửa làm "miệng".
  function townRow(ctx, camX, px, baseY, scale, night, t) {
    var cols = night ? ['#4b4f8a', '#5a5e9c', '#43477c', '#55598f'] : ['#ffb3a7', '#a7d8ff', '#ffe08a', '#b8f0c0'];
    var roofs = night ? ['#3a3d6e', '#34376a'] : ['#e5604d', '#7b6cf0', '#ff9f43', '#4fb3e8'];
    repeat(camX, px, 210 * scale, function (x, i) {
      var k = ((i % 4) + 4) % 4, h = (90 + hash(i) * 60) * scale, w = 160 * scale, top = baseY - h;
      rr(ctx, x, top, w, h + 4, 4); fillInk(ctx, cols[k], 2.5);
      ctx.beginPath(); ctx.moveTo(x - 10 * scale, top + 2); ctx.lineTo(x + w / 2, top - 46 * scale); ctx.lineTo(x + w + 10 * scale, top + 2); ctx.closePath(); fillInk(ctx, roofs[k % roofs.length], 2.5);
      var lit = night ? '#ffe9a0' : '#ffffff';
      var blink = Math.sin(t * 0.9 + i * 1.7) > 0.93;
      rr(ctx, x + 30 * scale, top + 24 * scale, 30 * scale, blink ? 6 * scale : 26 * scale, 5); fillInk(ctx, lit, 2);
      rr(ctx, x + 100 * scale, top + 24 * scale, 30 * scale, blink ? 6 * scale : 26 * scale, 5); fillInk(ctx, lit, 2);
      if (!blink) {
        ctx.fillStyle = INK;
        ctx.beginPath(); ctx.arc(x + 45 * scale, top + 40 * scale, 4 * scale, 0, TAU); ctx.arc(x + 115 * scale, top + 40 * scale, 4 * scale, 0, TAU); ctx.fill();
      }
      ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x + w / 2, top + 66 * scale, 14 * scale, 0.2, Math.PI - 0.2); ctx.stroke();
    });
  }
  function roofSky(ctx, camX, t) {
    rainbow(ctx, 520 - camX * 0.02, 470, 300, 16, 0.85);
    smileSun(ctx, 130 - camX * 0.02, 90, 34, t);
    for (var i = 0; i < 5; i++) {
      var x = wrap(i * 250 + 40 - camX * 0.1 - t * 10, W + 240) - 120;
      smileCloud(ctx, x, 60 + (i % 3) * 40, 0.75 + (i % 2) * 0.3, '#ffffff', t);
    }
    // diều giấy bay trong gió (gió = không khí chuyển động)
    var kx = 700 - camX * 0.06 + Math.sin(t * 0.8) * 30, ky = 150 + Math.sin(t * 1.3) * 16;
    ctx.strokeStyle = 'rgba(23,35,61,0.5)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(kx, ky + 24); ctx.quadraticCurveTo(kx - 40, ky + 140, kx - 10, ky + 260); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(kx, ky - 26); ctx.lineTo(kx + 20, ky); ctx.lineTo(kx, ky + 26); ctx.lineTo(kx - 20, ky); ctx.closePath(); fillInk(ctx, '#ff8fb1', 2.5);
    face(ctx, kx, ky, 0.6);
    for (var b = 0; b < 3; b++) { ctx.fillStyle = RAINBOW[b * 2]; ctx.beginPath(); ctx.arc(kx - 8 - b * 10 + Math.sin(t * 4 + b) * 3, ky + 46 + b * 22, 4, 0, TAU); ctx.fill(); }
  }
  function nightSky(ctx, camX, t) {
    // sao lấp lánh: chấm nhỏ + vài ngôi sao 5 cánh mặt cười
    for (var i = 0; i < 60; i++) {
      var sx = wrap(hash(i) * 1400 - camX * 0.03, W), sy = hash(i + 99) * 330;
      var a = 0.5 + 0.5 * Math.sin(t * 2 + i);
      ctx.fillStyle = 'rgba(255,255,255,' + (0.35 + a * 0.6).toFixed(2) + ')';
      ctx.fillRect(sx, sy, 2.5, 2.5);
    }
    for (var k = 0; k < 4; k++) {
      var x = wrap(k * 290 + 90 - camX * 0.05, W + 100) - 50, y = 60 + (k % 2) * 90, r = 13 + Math.sin(t * 3 + k) * 2;
      star5(ctx, x, y, r, r * 0.45, Math.sin(t + k) * 0.2); fillInk(ctx, '#ffe066', 2);
      face(ctx, x, y + 1, 0.35);
    }
    // Mặt Trăng ngái ngủ (được Mặt Trời chiếu sáng)
    var mx = 740 - camX * 0.02, my = 110;
    ctx.fillStyle = 'rgba(255,248,200,0.18)'; ctx.beginPath(); ctx.arc(mx, my, 80, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(mx, my, 50, 0, TAU); fillInk(ctx, '#fff4c2', 3);
    ctx.fillStyle = 'rgba(214,200,140,0.55)';
    dot(ctx, mx - 22, my - 18, 8); dot(ctx, mx + 20, my + 22, 6); dot(ctx, mx + 26, my - 10, 4);
    sleepyFace(ctx, mx, my + 4, 1.4);
    // chữ Z bay
    ctx.fillStyle = '#ffffff'; ctx.font = OG.font(16, 'bold'); ctx.textAlign = 'center';
    var z = (t * 0.5) % 1;
    ctx.globalAlpha = 1 - z; ctx.fillText('z', mx + 50 + z * 20, my - 40 - z * 30); ctx.globalAlpha = 1;
    // sao băng thỉnh thoảng
    var sh = (t * 0.25) % 1;
    if (sh < 0.12) {
      var p = sh / 0.12, x0 = 80 + p * 400, y0 = 40 + p * 120;
      ctx.strokeStyle = 'rgba(255,255,255,' + (1 - p).toFixed(2) + ')'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 - 60, y0 - 18); ctx.stroke();
    }
  }

  S.registerTheme('home-roof', {
    name: 'Mái nhà', base: 'roof',
    sky: { top: '#6cc6f2', bottom: '#ffe3b8', clouds: false },
    layers: [
      { kind: 'custom', parallax: 0.04, draw: function (ctx, camX, t) { roofSky(ctx, camX, t); } },
      { kind: 'custom', parallax: 0.18, draw: function (ctx, camX, t) { townRow(ctx, camX, 0.18, 440, 0.75, false, t); } },
      { kind: 'custom', parallax: 0.35, draw: function (ctx, camX, t) { townRow(ctx, camX, 0.35, 500, 1, false, t); } }
    ],
    platformStyle: { floor: { fill: '#d9603f', top: '#f08a5d', topH: 8 }, ledge: { fill: '#b5523b', top: '#f0a77e', radius: 4 } },
    decor: [
      { kind: 'home-chimney', every: 820, start: 430 },
      { kind: 'home-weathervane', every: 1300, start: 860 },
      { kind: 'home-birdie', every: 960, start: 220 }
    ],
    drawCustom: { platform: function (ctx, a) { return roofPlatform(ctx, a, false); } }
  });

  S.registerTheme('home-roof-night', {
    name: 'Mái nhà ban đêm', base: 'roof',
    sky: { top: '#1f2b63', bottom: '#6b5aa8', clouds: false },
    layers: [
      { kind: 'custom', parallax: 0.03, draw: function (ctx, camX, t) { nightSky(ctx, camX, t); } },
      { kind: 'custom', parallax: 0.18, draw: function (ctx, camX, t) { townRow(ctx, camX, 0.18, 440, 0.75, true, t); } },
      { kind: 'custom', parallax: 0.35, draw: function (ctx, camX, t) { townRow(ctx, camX, 0.35, 500, 1, true, t); } }
    ],
    platformStyle: { floor: { fill: '#9a4b3f', top: '#b8665a', topH: 8 }, ledge: { fill: '#7d4a52', top: '#a8707a', radius: 4 } },
    decor: [
      { kind: 'home-chimney', every: 820, start: 430, opts: { night: true } },
      { kind: 'home-telescope', every: 1250, start: 760 },
      { kind: 'home-birdie', every: 1100, start: 260, opts: { color: '#c9b8ff' } }
    ],
    ambient: { kind: 'sparkle', color: 'rgba(255,245,180,0.7)' },
    drawCustom: { platform: function (ctx, a) { return roofPlatform(ctx, a, true); } }
  });

  // ---------------------------------------------------------------------------
  // 5) TẦNG HẦM — xưởng chế tạo ấm áp (đèn vàng, kệ đồ, ống nước, thùng tái chế)
  // ---------------------------------------------------------------------------
  function basementWall(ctx, camX, t) {
    ctx.fillStyle = '#d9a774'; ctx.fillRect(0, 0, W, FLOOR);
    var off = wrap(camX * 0.06, 64);
    ctx.strokeStyle = 'rgba(138,90,50,0.35)'; ctx.lineWidth = 3;
    ctx.beginPath();
    for (var x = -off; x < W + 64; x += 64) { ctx.moveTo(x, 0); ctx.lineTo(x, FLOOR); }
    ctx.stroke();
    // cửa sổ nhỏ trên cao: ánh nắng xiên vào (không tối tăm)
    repeat(camX, 0.06, 760, function (x) {
      ctx.fillStyle = 'rgba(255,245,200,0.22)';
      ctx.beginPath(); ctx.moveTo(x + 200, 70); ctx.lineTo(x + 290, 70); ctx.lineTo(x + 420, FLOOR); ctx.lineTo(x + 240, FLOOR); ctx.closePath(); ctx.fill();
      rr(ctx, x + 196, 26, 98, 50, 8); fillInk(ctx, '#bfe9ff', 3);
      ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + 245, 26); ctx.lineTo(x + 245, 76); ctx.stroke();
    });
    // ống nước chạy ngang trần
    ctx.fillStyle = '#9fb4c8'; ctx.fillRect(0, 14, W, 12);
    ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.strokeRect(-4, 14, W + 8, 12);
  }
  function basementShelves(ctx, camX, t) {
    repeat(camX, 0.25, 700, function (x, i) {
      // kệ 2 tầng với lọ ốc vít, hộp có mặt
      for (var r = 0; r < 2; r++) {
        var sy = 190 + r * 110;
        rr(ctx, x + 40, sy, 260, 12, 4); fillInk(ctx, '#a0683a', 3);
        for (var j = 0; j < 4; j++) {
          var jx = x + 60 + j * 62, kind = (j + r + i) % 3;
          if (kind === 0) { rr(ctx, jx, sy - 44, 40, 44, 10); fillInk(ctx, 'rgba(200,235,255,0.9)', 2.5); ctx.fillStyle = '#7a8aa0'; ctx.fillRect(jx + 8, sy - 18, 24, 14); rr(ctx, jx + 4, sy - 50, 32, 8, 3); fillInk(ctx, '#ff8fb1', 2); }
          else if (kind === 1) { rr(ctx, jx, sy - 36, 46, 36, 4); fillInk(ctx, '#ffd36b', 2.5); face(ctx, jx + 23, sy - 18, 0.7); }
          else { ctx.beginPath(); ctx.arc(jx + 20, sy - 18, 18, 0, TAU); fillInk(ctx, '#ff9f43', 2.5); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(jx + 20, sy - 36); ctx.lineTo(jx + 20, sy); ctx.stroke(); }
        }
      }
      // bóng đèn treo đung đưa, toả sáng ấm
      var lx = x + 520, sw = Math.sin(t * 1.4 + i) * 0.12;
      ctx.save(); ctx.translate(lx, 20); ctx.rotate(sw);
      ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 120); ctx.stroke();
      ctx.fillStyle = 'rgba(255,230,140,0.28)'; ctx.beginPath(); ctx.arc(0, 140, 70, 0, TAU); ctx.fill();
      rr(ctx, -9, 116, 18, 12, 3); fillInk(ctx, '#a3a9b8', 2);
      ctx.beginPath(); ctx.arc(0, 142, 17, 0, TAU); fillInk(ctx, '#ffe680', 2.5);
      face(ctx, 0, 142, 0.7);
      ctx.restore();
      // bảng ghim: sơ đồ "máy móc" của Jack
      rr(ctx, x + 340, 230, 120, 90, 6); fillInk(ctx, '#f7f2e6', 3);
      ctx.strokeStyle = '#52b9df'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x + 380, 270, 18, 0, TAU); ctx.moveTo(x + 398, 270); ctx.lineTo(x + 440, 270); ctx.lineTo(x + 440, 300); ctx.stroke();
      ctx.fillStyle = '#ff5a5f'; ctx.beginPath(); ctx.arc(x + 400, 236, 4, 0, TAU); ctx.fill();
    });
    ctx.fillStyle = '#8f9bb0'; ctx.fillRect(0, FLOOR, W, H - FLOOR);
    ctx.fillStyle = '#b8c3d4'; ctx.fillRect(0, FLOOR, W, 8);
  }

  S.registerTheme('home-basement', {
    name: 'Tầng hầm', base: 'lair',
    sky: { top: '#d9a774', bottom: '#c99064', clouds: false },
    layers: [
      { kind: 'custom', parallax: 0.06, draw: function (ctx, camX, t) { basementWall(ctx, camX, t); } },
      { kind: 'custom', parallax: 0.25, draw: function (ctx, camX, t) { basementShelves(ctx, camX, t); } }
    ],
    platformStyle: { floor: { fill: '#8f9bb0', top: '#b8c3d4', topH: 8 }, ledge: { fill: '#c98b52', top: '#e8b57e', radius: 4 } },
    decor: [
      { kind: 'home-bins', every: 1000, start: 340 },
      { kind: 'home-battery', every: 1200, start: 760 },
      { kind: 'home-magnet', every: 1100, start: 1150 },
      { kind: 'home-box', every: 900, start: 140 }
    ],
    ambient: { kind: 'sparkle', color: 'rgba(255,230,150,0.6)' },
    drawCustom: { platform: function (ctx, a) { return basementPlatform(ctx, a); } }
  });
})();
