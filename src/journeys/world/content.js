/* Hành trình "world" — NỘI DUNG HỌC: thẻ kiến thức, câu đố, truyện tranh.
 * Chủ sở hữu v2: agent journey-world (CHỈ src/journeys/world/). Hợp đồng: docs/STORY.md mục 2.
 * Mọi hình minh hoạ vẽ bằng canvas (drawIcon(ctx, x, y, size, t), (x,y) = tâm).
 * Cốt truyện: lũ gián giật Quả Địa Cầu Thần Kỳ của Giáo sư Cú, nó vỡ thành 5 mảnh bay khắp thế giới.
 * Oggy và Giáo sư Cú đi tìm lại; cuối cùng lũ gián xin lỗi và cả nhóm cùng nhau du lịch. */
(function () {
  'use strict';
  var OG = window.OG;
  var A = (OG.JourneyArt && OG.JourneyArt.world) || {};
  var TAU = Math.PI * 2;
  var INK = '#17233d';

  // ---- Tiện ích vẽ (dự phòng nếu theme.js chưa nạp) ----
  function rr(ctx, x, y, w, h, r) {
    if (A.rr) return A.rr(ctx, x, y, w, h, r);
    ctx.beginPath(); ctx.rect(x, y, w, h);
  }
  function fs(ctx, fill, lw) {
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (lw !== 0) { ctx.strokeStyle = INK; ctx.lineWidth = lw || 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); }
  }
  function circle(ctx, x, y, r, fill, lw) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); fs(ctx, fill, lw); }
  function ell(ctx, x, y, rx, ry, fill, lw, rot) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, TAU); fs(ctx, fill, lw); }
  function line(ctx, x1, y1, x2, y2, c, lw) { ctx.strokeStyle = c || INK; ctx.lineWidth = lw || 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
  function face(ctx, x, y, s, mood) {
    if (A.face) return A.face(ctx, x, y, s, mood);
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x - 6 * s, y, 2.4 * s, 0, TAU); ctx.arc(x + 6 * s, y, 2.4 * s, 0, TAU); ctx.fill();
  }
  function font(px, w) { return OG.font ? OG.font(px, w) : (w || '') + ' ' + px + 'px "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif'; }
  function text(ctx, s, x, y, px, color) {
    ctx.fillStyle = color || INK; ctx.font = font(px, 'bold'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y);
  }
  function decor(ctx, kind, x, y, s, t, o) { if (OG.Scenery) OG.Scenery.drawDecor(ctx, kind, x, y, s, t, o); }

  // Bọc hàm vẽ trong hộp chuẩn 100×100 (tâm 0,0) rồi co theo size.
  function ic(fn) {
    return function (ctx, x, y, size, t) {
      ctx.save(); ctx.translate(x, y); var k = (size || 100) / 100; ctx.scale(k, k);
      try { fn(ctx, t || 0); } catch (e) { /* vẽ hỏng thì bỏ qua, không làm vỡ thẻ */ }
      ctx.restore();
    };
  }

  // ---------------------------------------------------------------------------
  // HÌNH MINH HOẠ
  // ---------------------------------------------------------------------------
  function drawPyramid(ctx, t) {
    circle(ctx, 30, -28, 12, '#ffd23f', 2.5);
    ell(ctx, 0, 34, 46, 8, '#f2cf8a', 0);
    ctx.beginPath(); ctx.moveTo(-42, 34); ctx.lineTo(0, -32); ctx.lineTo(42, 34); ctx.closePath(); fs(ctx, '#ecbd68', 3);
    ctx.beginPath(); ctx.moveTo(0, -32); ctx.lineTo(42, 34); ctx.lineTo(6, 34); ctx.closePath(); ctx.fillStyle = '#cf9447'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-42, 34); ctx.lineTo(0, -32); ctx.lineTo(42, 34); ctx.closePath(); fs(ctx, null, 3);
    ctx.strokeStyle = 'rgba(23,35,61,0.2)'; ctx.lineWidth = 1.5;
    for (var i = 1; i < 5; i++) { var y = 34 - i * 13, hw = 42 * (1 - i * 13 / 66); ctx.beginPath(); ctx.moveTo(-hw, y); ctx.lineTo(hw, y); ctx.stroke(); }
    face(ctx, -4, 10, 0.9);
  }
  function drawNile(ctx, t) {
    ctx.beginPath(); ctx.moveTo(-48, 6);
    for (var x = -48; x <= 48; x += 8) ctx.lineTo(x, 6 + Math.sin(x / 9 + t * 2) * 2.5);
    ctx.lineTo(48, 38); ctx.lineTo(-48, 38); ctx.closePath(); fs(ctx, '#3fa3e0', 3);
    line(ctx, -30, 24, -16, 24, 'rgba(255,255,255,0.7)', 2); line(ctx, 18, 30, 34, 30, 'rgba(255,255,255,0.7)', 2);
    var by = 6 + Math.sin(t * 2) * 1.5;
    ctx.beginPath(); ctx.moveTo(-22, by - 2); ctx.quadraticCurveTo(0, by + 14, 22, by - 2); ctx.closePath(); fs(ctx, '#9c6644', 2.5);
    line(ctx, 0, by, 0, by - 46, INK, 2.5);
    ctx.beginPath(); ctx.moveTo(1, by - 44); ctx.lineTo(24, by - 6); ctx.lineTo(1, by - 6); ctx.closePath(); fs(ctx, '#fffaf0', 2.5);
    face(ctx, 9, by - 18, 0.5);
    for (var i = -1; i <= 1; i++) { line(ctx, -38, 8, -38 + i * 6, -20, '#5aa84a', 2.5); ell(ctx, -38 + i * 7, -22, 5, 2.5, '#5aa84a', 0, i * 0.4); }
  }
  function drawHiero(ctx) {
    rr(ctx, -32, -42, 64, 84, 8); fs(ctx, '#e8c48a', 3);
    ctx.strokeStyle = '#7a4e2b'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.ellipse(-12, -26, 10, 6, 0, 0, TAU); ctx.stroke(); circle(ctx, -12, -26, 3, '#7a4e2b', 0); // mắt
    ctx.beginPath(); ctx.moveTo(-22, -16); ctx.lineTo(-18, -20); // lông mày
    ctx.moveTo(6, -18); ctx.quadraticCurveTo(14, -34, 22, -22); ctx.lineTo(26, -24); ctx.moveTo(10, -18); ctx.lineTo(10, -12); ctx.stroke(); // chim
    ctx.beginPath(); for (var i = 0; i < 6; i++) ctx.lineTo(-24 + i * 9, -2 + (i & 1 ? -5 : 4)); ctx.stroke(); // nước
    ctx.beginPath(); ctx.ellipse(0, 14, 5, 6, 0, 0, TAU); ctx.moveTo(0, 20); ctx.lineTo(0, 34); ctx.moveTo(-8, 24); ctx.lineTo(8, 24); ctx.stroke(); // biểu tượng
    ctx.fillStyle = '#7a4e2b'; ctx.beginPath(); ctx.ellipse(-18, 26, 6, 4, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(18, 26, 6, 4, 0, 0, TAU); ctx.fill();
  }
  function drawEiffel(ctx, x, y, h, t) {
    var w = h * 0.55;
    ctx.save(); ctx.translate(x, y);
    ctx.beginPath(); ctx.moveTo(-w / 2, 0);
    ctx.quadraticCurveTo(-w * 0.2, -h * 0.3, -w * 0.09, -h * 0.62); ctx.lineTo(-w * 0.03, -h * 0.93); ctx.lineTo(0, -h);
    ctx.lineTo(w * 0.03, -h * 0.93); ctx.lineTo(w * 0.09, -h * 0.62); ctx.quadraticCurveTo(w * 0.2, -h * 0.3, w / 2, 0);
    ctx.lineTo(w * 0.27, 0); ctx.quadraticCurveTo(0, -h * 0.28, -w * 0.27, 0); ctx.closePath(); fs(ctx, '#b9805a', 3);
    rr(ctx, -w * 0.33, -h * 0.3, w * 0.66, 7, 3); fs(ctx, '#8a5636', 2.5);
    rr(ctx, -w * 0.15, -h * 0.62, w * 0.3, 6, 3); fs(ctx, '#8a5636', 2.5);
    ctx.strokeStyle = '#8a5636'; ctx.lineWidth = 1.5;
    for (var i = 1; i < 6; i++) { var yy = -h * 0.6 * i / 6, hw = w * 0.3 * (1 - i / 7); ctx.beginPath(); ctx.moveTo(-hw, yy); ctx.lineTo(hw, yy - 8); ctx.moveTo(hw, yy); ctx.lineTo(-hw, yy - 8); ctx.stroke(); }
    face(ctx, 0, -h * 0.44, h / 110);
    ctx.restore();
  }
  function drawMona(ctx) {
    rr(ctx, -34, -44, 68, 88, 6); fs(ctx, '#d9a441', 3);
    rr(ctx, -26, -36, 52, 72, 3); fs(ctx, '#7fa37a', 2);
    ctx.fillStyle = '#a7c48f'; ctx.beginPath(); ctx.ellipse(-14, -20, 14, 6, 0, 0, TAU); ctx.ellipse(16, -12, 12, 5, 0, 0, TAU); ctx.fill();
    ctx.save(); rr(ctx, -26, -36, 52, 72, 3); ctx.clip();
    ell(ctx, 0, 34, 24, 20, '#3b3226', 2);
    ell(ctx, 0, -8, 15, 22, '#4a3423', 0);
    ell(ctx, 0, -10, 10, 13, '#f1c98f', 2);
    ctx.restore();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(-4, -12, 1.5, 0, TAU); ctx.arc(4, -12, 1.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, -6, 3.5, 0.3, Math.PI - 0.3); ctx.stroke();
  }
  function drawBonjour(ctx, t) {
    rr(ctx, -46, -20, 92, 40, 14); fs(ctx, '#ffffff', 3);
    ctx.beginPath(); ctx.moveTo(-12, 19); ctx.lineTo(-20, 36); ctx.lineTo(2, 19); fs(ctx, '#ffffff', 0);
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-12, 20); ctx.lineTo(-20, 36); ctx.lineTo(2, 20); ctx.stroke();
    text(ctx, 'Bonjour!', 0, 0, 19, '#3f6fb5');
    ctx.save(); ctx.translate(-30, -24); ctx.rotate(-0.25 + Math.sin(t * 2) * 0.05);
    ell(ctx, 0, 0, 20, 8, '#2b2b3a', 2.5); line(ctx, 0, -8, 2, -14, INK, 3);
    ctx.restore();
  }
  function drawFuji(ctx, t) {
    circle(ctx, 26, -22, 15, '#ff6b6b', 2.5);
    ctx.beginPath(); ctx.moveTo(-48, 34); ctx.quadraticCurveTo(-20, 0, -12, -26); ctx.lineTo(12, -26); ctx.quadraticCurveTo(20, 0, 48, 34); ctx.closePath(); fs(ctx, '#7389c9', 3);
    ctx.beginPath(); ctx.moveTo(-12, -26); ctx.lineTo(-20, -8); ctx.lineTo(-10, -12); ctx.lineTo(-4, -4); ctx.lineTo(4, -12); ctx.lineTo(12, -6); ctx.lineTo(20, -8); ctx.lineTo(12, -26); ctx.closePath(); fs(ctx, '#ffffff', 2.5);
    face(ctx, 0, 12, 0.9, 'sleep');
  }
  function drawSakura(ctx, t) {
    ctx.save(); ctx.rotate(Math.sin(t) * 0.1);
    for (var i = 0; i < 5; i++) {
      var a = i * TAU / 5 - Math.PI / 2;
      ctx.save(); ctx.rotate(a); ctx.beginPath();
      ctx.moveTo(0, 0); ctx.quadraticCurveTo(-20, -16, -10, -36); ctx.lineTo(0, -30); ctx.lineTo(10, -36); ctx.quadraticCurveTo(20, -16, 0, 0);
      fs(ctx, '#ffc4dc', 2.5); ctx.restore();
    }
    circle(ctx, 0, 0, 13, '#ffe27a', 2.5);
    face(ctx, 0, -1, 0.7);
    ctx.restore();
  }
  function drawTrain(ctx, t) {
    line(ctx, -48, 30, 48, 30, '#8a8f99', 4);
    var bob = Math.sin(t * 8) * 0.8;
    ctx.save(); ctx.translate(0, bob);
    ctx.beginPath(); ctx.moveTo(-46, 24); ctx.lineTo(-46, -8); ctx.lineTo(0, -12); ctx.quadraticCurveTo(38, -10, 50, 22); ctx.lineTo(50, 24); ctx.closePath(); fs(ctx, '#ffffff', 3);
    ctx.fillStyle = '#2a63c9'; ctx.beginPath(); ctx.moveTo(-46, 10); ctx.lineTo(44, 10); ctx.lineTo(48, 16); ctx.lineTo(-46, 16); ctx.closePath(); ctx.fill();
    for (var i = 0; i < 4; i++) { rr(ctx, -40 + i * 12, -4, 8, 8, 2); fs(ctx, '#9fd3f5', 1.5); }
    ctx.beginPath(); ctx.moveTo(14, -8); ctx.quadraticCurveTo(28, -6, 34, 2); ctx.lineTo(16, 2); ctx.closePath(); fs(ctx, '#2b3f63', 2);
    circle(ctx, 26, 0, 1.8, '#ffffff', 0);
    circle(ctx, -30, 26, 5, '#4b5563', 2); circle(ctx, 20, 26, 5, '#4b5563', 2);
    ctx.restore();
    line(ctx, -50, -18, -36, -18, 'rgba(63,111,181,0.5)', 3); line(ctx, -50, -26, -40, -26, 'rgba(63,111,181,0.4)', 3);
  }
  function drawRainforest(ctx, t) {
    rr(ctx, -7, 0, 14, 40, 4); fs(ctx, '#7a5236', 3);
    ctx.beginPath(); ctx.arc(-22, 4, 18, 0, TAU); ctx.arc(0, -10, 24, 0, TAU); ctx.arc(22, 4, 18, 0, TAU); fs(ctx, '#2f9e55', 3);
    face(ctx, 0, -2, 0.8);
    ctx.beginPath(); ctx.arc(-14, -38, 12, 0, TAU); ctx.arc(2, -44, 14, 0, TAU); ctx.arc(18, -38, 11, 0, TAU); fs(ctx, '#d9e6f2', 2.5);
    ctx.fillStyle = '#3fa3e0';
    for (var i = 0; i < 5; i++) { var dy = ((t * 50 + i * 13) % 26); ctx.beginPath(); ctx.ellipse(-20 + i * 10, -26 + dy, 1.8, 3.5, 0, 0, TAU); ctx.fill(); }
  }
  function drawPolarBear(ctx, t) {
    circle(ctx, -22, -22, 10, '#f7fbff', 3); circle(ctx, 22, -22, 10, '#f7fbff', 3);
    circle(ctx, -22, -22, 4.5, '#cfdbe6', 0); circle(ctx, 22, -22, 4.5, '#cfdbe6', 0);
    circle(ctx, 0, 2, 32, '#f7fbff', 3);
    ell(ctx, 0, 14, 15, 11, '#ffffff', 2.5);
    ell(ctx, 0, 8, 6, 4, INK, 0);
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 12); ctx.lineTo(0, 16); ctx.arc(-4, 16, 4, 0, Math.PI * 0.8); ctx.moveTo(0, 16); ctx.arc(4, 16, 4, Math.PI, Math.PI * 0.2, true); ctx.stroke();
    var blink = Math.sin(t * 1.3) > 0.97;
    if (blink) { line(ctx, -15, -6, -7, -6, INK, 2); line(ctx, 7, -6, 15, -6, INK, 2); }
    else { circle(ctx, -11, -6, 3.5, INK, 0); circle(ctx, 11, -6, 3.5, INK, 0); circle(ctx, -10, -7, 1.2, '#fff', 0); circle(ctx, 12, -7, 1.2, '#fff', 0); }
    ctx.fillStyle = 'rgba(255,120,150,0.5)'; ctx.beginPath(); ctx.arc(-20, 6, 4, 0, TAU); ctx.arc(20, 6, 4, 0, TAU); ctx.fill();
  }
  function drawIceFloe(ctx, t) {
    ell(ctx, 0, 20, 48, 16, '#2b5f9e', 0);
    var bob = Math.sin(t * 1.5) * 2;
    ctx.beginPath(); ctx.moveTo(-36, 14 + bob); ctx.lineTo(-30, -6 + bob); ctx.lineTo(-8, -12 + bob); ctx.lineTo(20, -8 + bob); ctx.lineTo(36, 4 + bob); ctx.lineTo(30, 16 + bob); ctx.closePath(); fs(ctx, '#f4fbff', 3);
    ctx.fillStyle = '#bfe0f5'; ctx.beginPath(); ctx.moveTo(-36, 14 + bob); ctx.lineTo(30, 16 + bob); ctx.lineTo(30, 10 + bob); ctx.lineTo(-34, 8 + bob); ctx.fill();
    face(ctx, 0, -1 + bob, 0.8);
    line(ctx, -40, 30, -26, 30, 'rgba(255,255,255,0.6)', 2); line(ctx, 22, 32, 38, 32, 'rgba(255,255,255,0.6)', 2);
  }
  function drawAurora(ctx, t) {
    rr(ctx, -46, -46, 92, 92, 18); fs(ctx, '#123a6b', 3);
    ctx.save(); rr(ctx, -46, -46, 92, 92, 18); ctx.clip();
    ctx.fillStyle = '#ffffff';
    [[-30, -34], [22, -38], [34, -14], [-12, -28]].forEach(function (s) { ctx.fillRect(s[0], s[1], 2, 2); });
    var cols = ['#5cffb0', '#53d8ff', '#c77dff'];
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < 3; i++) {
      ctx.strokeStyle = cols[i]; ctx.globalAlpha = 0.5; ctx.lineWidth = 9; ctx.beginPath();
      for (var x = -50; x <= 50; x += 5) { var y = -10 + i * 9 + Math.sin(x / 14 + t + i) * 7; if (x === -50) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ell(ctx, 0, 50, 70, 22, '#eaf6ff', 0);
    ctx.restore();
    rr(ctx, -46, -46, 92, 92, 18); fs(ctx, null, 3);
  }
  function drawPenguin(ctx, x, y, s, t) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.rotate(Math.sin(t * 4) * 0.05);
    ell(ctx, -8, 0, 7, 3, '#ffb703', 2); ell(ctx, 8, 0, 7, 3, '#ffb703', 2);
    ell(ctx, 0, -24, 18, 24, '#22303f', 3);
    ell(ctx, 0, -20, 12, 18, '#ffffff', 0);
    ell(ctx, -18, -24, 5, 13, '#22303f', 2.5, 0.3); ell(ctx, 18, -24, 5, 13, '#22303f', 2.5, -0.3);
    circle(ctx, -5, -36, 2.4, INK, 0); circle(ctx, 5, -36, 2.4, INK, 0);
    ctx.beginPath(); ctx.moveTo(-4, -32); ctx.lineTo(4, -32); ctx.lineTo(0, -27); ctx.closePath(); fs(ctx, '#ffb703', 1.5);
    ctx.fillStyle = 'rgba(255,120,150,0.55)'; ctx.beginPath(); ctx.arc(-9, -30, 2.5, 0, TAU); ctx.arc(9, -30, 2.5, 0, TAU); ctx.fill();
    ctx.restore();
  }
  function drawPenguinCard(ctx, t) {
    line(ctx, 26, 34, 26, -24, '#7a5236', 4);
    rr(ctx, 4, -40, 44, 20, 4); fs(ctx, '#ffffff', 2.5);
    text(ctx, 'NAM CỰC', 26, -30, 9, '#3f6fb5');
    drawPenguin(ctx, -14, 34, 1.3, t);
    rr(ctx, -48, 12, 18, 16, 3); fs(ctx, '#e63946', 2.5); line(ctx, -44, 12, -44, 6, INK, 2); line(ctx, -34, 12, -34, 6, INK, 2); line(ctx, -44, 6, -34, 6, INK, 2);
  }
  // Quả địa cầu thần kỳ (dùng cho truyện tranh).
  function drawGlobe(ctx, x, y, r, t, broken) {
    ctx.save(); ctx.translate(x, y);
    if (!broken) {
      ctx.fillStyle = 'rgba(255,240,150,0.35)'; ctx.beginPath(); ctx.arc(0, 0, r * 1.35 + Math.sin(t * 3) * 4, 0, TAU); ctx.fill();
      circle(ctx, 0, 0, r, '#4fb3e8', 3);
      ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.clip();
      ctx.fillStyle = '#6cc35a';
      var off = (t * 12) % (r * 2);
      for (var k = -1; k <= 1; k++) {
        var ox = k * r * 2 - off;
        ctx.beginPath(); ctx.ellipse(ox - r * 0.3, -r * 0.3, r * 0.35, r * 0.25, 0.4, 0, TAU); ctx.ellipse(ox + r * 0.45, r * 0.25, r * 0.3, r * 0.4, -0.3, 0, TAU); ctx.fill();
      }
      ctx.restore();
      circle(ctx, 0, 0, r, null, 3);
      face(ctx, 0, 0, r / 28);
    } else {
      var cols = ['#ffd23f', '#ff8fb1', '#7ed957', '#53d8ff', '#c77dff'];
      for (var i = 0; i < 5; i++) {
        var a = i * TAU / 5 + t * 0.6, d = r * 0.6 + ((t * 60) % (r * 3));
        var px = Math.cos(a) * d, py = Math.sin(a) * d * 0.6 - d * 0.3;
        ctx.strokeStyle = cols[i]; ctx.globalAlpha = 0.5; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(px, py); ctx.stroke(); ctx.globalAlpha = 1;
        if (A.starPath) { A.starPath(ctx, px, py, 14, 6); fs(ctx, cols[i], 2.5); } else circle(ctx, px, py, 10, cols[i], 2.5);
      }
    }
    ctx.restore();
  }
  A.drawGlobe = drawGlobe;
  A.drawPenguin = drawPenguin;

  // Biểu tượng nhỏ cho đáp án câu đố
  function shape(kind, color) {
    return ic(function (ctx, t) {
      ctx.save(); ctx.rotate(Math.sin(t * 2) * 0.05);
      if (kind === 'tri') { ctx.beginPath(); ctx.moveTo(-36, 30); ctx.lineTo(0, -32); ctx.lineTo(36, 30); ctx.closePath(); }
      else if (kind === 'circle') { ctx.beginPath(); ctx.arc(0, 0, 34, 0, TAU); }
      else rr(ctx, -32, -32, 64, 64, 6);
      fs(ctx, color, 3); face(ctx, 0, kind === 'tri' ? 10 : 0, 0.9);
      ctx.restore();
    });
  }
  function swatch(color, mood) {
    return ic(function (ctx) { rr(ctx, -34, -34, 68, 68, 16); fs(ctx, color, 3); face(ctx, 0, 0, 1, mood); });
  }
  var drawDrop = ic(function (ctx) { ctx.beginPath(); ctx.moveTo(0, -38); ctx.quadraticCurveTo(32, 4, 26, 18); ctx.arc(0, 14, 26, 0.15, Math.PI - 0.15); ctx.quadraticCurveTo(-32, 4, 0, -38); fs(ctx, '#53b8f0', 3); face(ctx, 0, 14, 0.9); });
  var drawEnergy = ic(function (ctx) {
    rr(ctx, -24, -34, 48, 70, 10); fs(ctx, '#ffd23f', 3); rr(ctx, -10, -42, 20, 10, 3); fs(ctx, '#ffd23f', 3);
    ctx.beginPath(); ctx.moveTo(4, -24); ctx.lineTo(-12, 4); ctx.lineTo(0, 4); ctx.lineTo(-6, 26); ctx.lineTo(12, -4); ctx.lineTo(0, -4); ctx.closePath(); fs(ctx, '#ff8c2f', 2.5);
  });
  var drawDigits = ic(function (ctx) { rr(ctx, -40, -28, 80, 56, 10); fs(ctx, '#ffffff', 3); text(ctx, '1 2 3', 0, 2, 26, '#3f6fb5'); });
  var drawIron = ic(function (ctx) {
    for (var i = 0; i < 3; i++) { ctx.save(); ctx.translate(-4 + i * 4, 20 - i * 18); rr(ctx, -34, -8, 68, 16, 4); fs(ctx, i & 1 ? '#a9b2bd' : '#8d97a3', 3); ctx.restore(); }
    face(ctx, 4, -16, 0.6);
  });
  var drawWood = ic(function (ctx) { rr(ctx, -38, -18, 76, 36, 18); fs(ctx, '#b07a45', 3); ell(ctx, 30, 0, 9, 16, '#e8c08d', 2.5); ell(ctx, 30, 0, 4, 8, null, 1.5); face(ctx, -6, -2, 0.8); });
  var drawCandy = ic(function (ctx) {
    ctx.beginPath(); ctx.moveTo(-22, 0); ctx.lineTo(-42, -16); ctx.lineTo(-42, 16); ctx.closePath(); fs(ctx, '#ff8fb1', 3);
    ctx.beginPath(); ctx.moveTo(22, 0); ctx.lineTo(42, -16); ctx.lineTo(42, 16); ctx.closePath(); fs(ctx, '#ff8fb1', 3);
    circle(ctx, 0, 0, 24, '#ff5d8f', 3); face(ctx, 0, 0, 0.8);
  });
  var drawSquareBread = ic(function (ctx) { rr(ctx, -32, -30, 64, 60, 8); fs(ctx, '#f2c47a', 3); face(ctx, 0, 0, 0.9, 'o'); });
  var drawVolcano = ic(function (ctx, t) {
    ctx.beginPath(); ctx.moveTo(-44, 34); ctx.lineTo(-12, -20); ctx.lineTo(12, -20); ctx.lineTo(44, 34); ctx.closePath(); fs(ctx, '#7389c9', 3);
    ctx.fillStyle = 'rgba(200,200,210,0.9)';
    for (var i = 0; i < 3; i++) { var k = (t * 0.6 + i / 3) % 1; ctx.beginPath(); ctx.arc(Math.sin(k * 6) * 6, -26 - k * 20, 5 + k * 6, 0, TAU); ctx.fill(); }
    face(ctx, 0, 8, 0.9, 'sleep');
  });
  var drawIceCream = ic(function (ctx) {
    ctx.beginPath(); ctx.moveTo(-18, -2); ctx.lineTo(0, 40); ctx.lineTo(18, -2); ctx.closePath(); fs(ctx, '#e0a85b', 3);
    circle(ctx, 0, -14, 20, '#ffc4dc', 3); circle(ctx, 0, -36, 13, '#fff3c4', 3); face(ctx, 0, -14, 0.7);
  });
  var drawSunflower = ic(function (ctx) {
    line(ctx, 0, 10, 0, 44, '#3f9a45', 4);
    for (var i = 0; i < 10; i++) { ctx.save(); ctx.rotate(i * TAU / 10); ell(ctx, 0, -22, 6, 12, '#ffd23f', 2); ctx.restore(); }
    circle(ctx, 0, 0, 14, '#8a5a32', 2.5); face(ctx, 0, -1, 0.6);
  });
  var drawRocket = ic(function (ctx, t) {
    ctx.save(); ctx.rotate(0.6);
    ctx.beginPath(); ctx.moveTo(0, -40); ctx.quadraticCurveTo(18, -18, 14, 22); ctx.lineTo(-14, 22); ctx.quadraticCurveTo(-18, -18, 0, -40); fs(ctx, '#f4f7fb', 3);
    circle(ctx, 0, -8, 7, '#53b8f0', 2.5);
    ctx.beginPath(); ctx.moveTo(-8, 22); ctx.lineTo(0, 36 + Math.sin(t * 20) * 4); ctx.lineTo(8, 22); fs(ctx, '#ff8c2f', 2);
    ctx.restore();
  });
  var drawPartyFrog = ic(function (ctx, t) {
    if (A.drawFrog) A.drawFrog(ctx, 0, 30, 1.5, t, '#7ed957');
    ctx.beginPath(); ctx.moveTo(-10, -16); ctx.lineTo(0, -44); ctx.lineTo(10, -16); ctx.closePath(); fs(ctx, '#c77dff', 2.5);
    circle(ctx, 0, -46, 4, '#ffd23f', 2);
  });
  var drawWarnFrog = ic(function (ctx, t) {
    if (A.drawFrog) A.drawFrog(ctx, 0, 34, 1.5, t, '#2f80ed');
    rr(ctx, -40, -46, 80, 22, 8); fs(ctx, '#fff3c4', 2.5); text(ctx, 'ĐỪNG ĂN!', 0, -35, 13, '#e63946');
  });
  var drawFish = ic(function (ctx, t) {
    ctx.save(); ctx.rotate(Math.sin(t * 3) * 0.08);
    ctx.beginPath(); ctx.moveTo(22, 0); ctx.lineTo(42, -16); ctx.lineTo(42, 16); ctx.closePath(); fs(ctx, '#ffb703', 3);
    ell(ctx, -4, 0, 30, 20, '#ffd23f', 3);
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(-4, -6, 22, 0, TAU); ctx.globalAlpha = 0.25; ctx.fill(); ctx.globalAlpha = 1;
    face(ctx, -14, -2, 0.7);
    ctx.restore();
  });
  function globePointer(down) {
    return ic(function (ctx, t) {
      circle(ctx, 0, 0, 32, '#4fb3e8', 3);
      ctx.save(); ctx.beginPath(); ctx.arc(0, 0, 32, 0, TAU); ctx.clip();
      ctx.fillStyle = '#6cc35a'; ctx.beginPath(); ctx.ellipse(-10, -4, 12, 9, 0.3, 0, TAU); ctx.ellipse(14, 8, 9, 12, -0.3, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.fillRect(-40, down ? 22 : -40, 80, 18);
      ctx.restore(); circle(ctx, 0, 0, 32, null, 3);
      var b = Math.sin(t * 5) * 3, ay = down ? 44 + b : -44 - b, d = down ? -1 : 1;
      ctx.beginPath(); ctx.moveTo(0, ay); ctx.lineTo(-10, ay + 12 * d); ctx.lineTo(10, ay + 12 * d); ctx.closePath(); fs(ctx, '#e63946', 2.5);
    });
  }

  // ---------------------------------------------------------------------------
  // NỀN TRUYỆN TRANH
  // ---------------------------------------------------------------------------
  function bg(theme, items, camX, extra) {
    if (A.comicBg) return A.comicBg(theme, items, camX, extra);
    return theme;
  }
  function globeExtra(x, y, r, broken) { return function (ctx, t) { drawGlobe(ctx, x, y, r, t, broken); }; }

  // ---------------------------------------------------------------------------
  // ĐĂNG KÝ
  // ---------------------------------------------------------------------------
  OG.Journeys.register({
    id: 'world',
    cards: [
      // ---- Ai Cập ----
      { id: 'eg_pyramid', areaId: 'egypt', title: 'Kim tự tháp Giza',
        fact: 'Kim tự tháp lớn ở Giza hơn 4.500 tuổi, có bốn mặt hình tam giác nhọn đỉnh. Nó là kỳ quan cổ đại duy nhất còn đứng vững!',
        drawIcon: ic(drawPyramid) },
      { id: 'eg_nile', areaId: 'egypt', title: 'Sông Nile',
        fact: 'Sông Nile là một trong những con sông dài nhất thế giới. Người Ai Cập xưa trồng lúa mì nhờ nước và đất phù sa của sông.',
        drawIcon: ic(drawNile) },
      { id: 'eg_hiero', areaId: 'egypt', title: 'Chữ tượng hình',
        fact: 'Người Ai Cập xưa viết bằng chữ tượng hình. Mỗi kí hiệu là một hình nhỏ như con mắt, con chim hay gợn sóng nước.',
        drawIcon: ic(drawHiero) },
      { id: 'eg_camel', areaId: 'egypt', title: 'Lạc đà sa mạc',
        fact: 'Bướu lạc đà chứa mỡ chứ không chứa nước! Mỡ là kho năng lượng giúp lạc đà đi nhiều ngày qua sa mạc.',
        drawIcon: ic(function (ctx, t) { decor(ctx, 'world-camel', -14, 42, 0.62, t); }) },
      // ---- Pháp ----
      { id: 'fr_eiffel', areaId: 'france', title: 'Tháp Eiffel',
        fact: 'Tháp Eiffel ở Paris cao hơn 300 mét, làm bằng sắt. Cứ khoảng 7 năm, người ta lại sơn mới cả tòa tháp!',
        drawIcon: ic(function (ctx, t) { drawEiffel(ctx, 0, 44, 90, t); }) },
      { id: 'fr_croissant', areaId: 'france', title: 'Bánh sừng bò',
        fact: 'Bánh sừng bò (croissant) cong như vầng trăng khuyết, vỏ giòn có rất nhiều lớp mỏng. Người Pháp hay ăn vào bữa sáng.',
        drawIcon: ic(function (ctx, t) { if (A.drawCroissant) A.drawCroissant(ctx, 0, 8, 1.15, t); }) },
      { id: 'fr_louvre', areaId: 'france', title: 'Bảo tàng Louvre',
        fact: 'Louvre ở Paris là bảo tàng nghệ thuật đông khách nhất thế giới. Ở đó có bức tranh nàng Mona Lisa với nụ cười bí ẩn.',
        drawIcon: ic(drawMona) },
      { id: 'fr_bonjour', areaId: 'france', title: 'Bonjour!',
        fact: 'Người Pháp chào nhau bằng câu "Bonjour!" (đọc là bông-giua), nghĩa là "Xin chào". Em thử nói xem!',
        drawIcon: ic(drawBonjour) },
      // ---- Nhật Bản ----
      { id: 'jp_fuji', areaId: 'japan', title: 'Núi Phú Sĩ',
        fact: 'Phú Sĩ là ngọn núi cao nhất Nhật Bản. Nó là một núi lửa đã ngủ yên hơn 300 năm, đỉnh thường phủ tuyết trắng.',
        drawIcon: ic(drawFuji) },
      { id: 'jp_sakura', areaId: 'japan', title: 'Hoa anh đào',
        fact: 'Mùa xuân, hoa anh đào nở hồng khắp Nhật Bản. Mọi người rủ nhau ngồi dưới gốc cây ngắm hoa, gọi là "hanami".',
        drawIcon: ic(drawSakura) },
      { id: 'jp_sushi', areaId: 'japan', title: 'Sushi',
        fact: 'Sushi là món cơm trộn giấm, ăn cùng cá, trứng hay rau. Người Nhật thường ăn sushi bằng đũa, giống người Việt mình!',
        drawIcon: ic(function (ctx, t) { if (A.drawSushi) A.drawSushi(ctx, 0, 26, 1.2); }) },
      { id: 'jp_train', areaId: 'japan', title: 'Tàu Shinkansen',
        fact: 'Tàu Shinkansen của Nhật có thể chạy tới khoảng 300 km mỗi giờ, nhanh như tên bắn! Người ta còn gọi nó là "tàu viên đạn".',
        drawIcon: ic(drawTrain) },
      // ---- Amazon ----
      { id: 'am_forest', areaId: 'amazon', title: 'Rừng mưa Amazon',
        fact: 'Amazon là khu rừng mưa nhiệt đới lớn nhất thế giới. Mưa nhiều nên cây xanh tốt quanh năm, là nhà của vô số loài vật.',
        drawIcon: ic(drawRainforest) },
      { id: 'am_macaw', areaId: 'amazon', title: 'Vẹt đuôi dài',
        fact: 'Vẹt đuôi dài có bộ lông đỏ, vàng, xanh rực rỡ. Chiếc mỏ cong rất khoẻ giúp chúng tách vỏ những hạt cứng.',
        drawIcon: ic(function (ctx, t) { if (A.drawMacaw) A.drawMacaw(ctx, 0, 2, 1.15, t); }) },
      { id: 'am_sloth', areaId: 'amazon', title: 'Con lười',
        fact: 'Con lười sống treo mình trên cây và đi cực kỳ chậm. Nó nghỉ ngơi rất nhiều và chỉ trèo xuống đất khoảng một lần mỗi tuần.',
        drawIcon: ic(function (ctx, t) { line(ctx, -44, -36, 44, -36, '#7a5236', 7); if (A.drawSloth) A.drawSloth(ctx, 0, -36, 1, t); }) },
      { id: 'am_frog', areaId: 'amazon', title: 'Ếch phi tiêu',
        fact: 'Ếch phi tiêu bé tí nhưng màu sắc sặc sỡ. Màu sáng ấy như lời nhắn: "Đừng ăn tớ, tớ có độc đấy!"',
        drawIcon: ic(function (ctx, t) { if (A.drawFrog) A.drawFrog(ctx, 0, 28, 1.7, t, '#2f80ed'); }) },
      // ---- Bắc Cực ----
      { id: 'ar_bear', areaId: 'arctic', title: 'Gấu Bắc Cực',
        fact: 'Lông gấu Bắc Cực trông trắng muốt, nhưng da bên dưới lại màu đen! Lớp mỡ dày giúp gấu ấm áp giữa trời băng giá.',
        drawIcon: ic(drawPolarBear) },
      { id: 'ar_ice', areaId: 'arctic', title: 'Biển băng',
        fact: 'Giữa Bắc Cực không có đất liền, chỉ có biển đóng băng. Băng nổi trên mặt nước như một tấm thảm trắng khổng lồ.',
        drawIcon: ic(drawIceFloe) },
      { id: 'ar_aurora', areaId: 'arctic', title: 'Cực quang',
        fact: 'Cực quang là những dải ánh sáng xanh, hồng nhảy múa trên trời đêm vùng cực. Chúng sinh ra khi gió Mặt Trời chạm vào bầu khí quyển.',
        drawIcon: ic(drawAurora) },
      { id: 'ar_penguin', areaId: 'arctic', title: 'Cánh cụt ở đâu?',
        fact: 'Hầu hết chim cánh cụt sống ở nửa phía nam Trái Đất, không có ở Bắc Cực. Vì thế ngoài tự nhiên, gấu Bắc Cực và cánh cụt chẳng gặp nhau!',
        drawIcon: ic(drawPenguinCard) }
    ],

    quizzes: [
      { id: 'q_pyramid', areaId: 'egypt', question: 'Nhìn từ bên cạnh, kim tự tháp giống hình gì?',
        choices: [{ text: 'Hình tròn', icon: shape('circle', '#ff8fb1') }, { text: 'Hình tam giác', icon: shape('tri', '#ecbd68') }, { text: 'Hình vuông', icon: shape('square', '#7ed957') }],
        answer: 1, hint: 'Gợi ý: nhìn kim tự tháp xem, đỉnh của nó nhọn hoắt!', explain: 'Đúng rồi! Bốn mặt kim tự tháp đều là hình tam giác.', cardId: 'eg_pyramid' },
      { id: 'q_hiero', areaId: 'egypt', question: 'Chữ tượng hình của người Ai Cập xưa trông thế nào?',
        choices: [{ text: 'Những hình nhỏ', icon: ic(drawHiero) }, { text: 'Chữ số 1, 2, 3', icon: drawDigits }],
        answer: 0, hint: 'Gợi ý: nhớ tấm đá có con mắt và con chim không?', explain: 'Chính xác! Mỗi chữ tượng hình là một hình nhỏ.', cardId: 'eg_hiero' },
      { id: 'q_camel', areaId: 'egypt', question: 'Bướu lạc đà chứa gì?',
        choices: [{ text: 'Nước', icon: drawDrop }, { text: 'Mỡ (năng lượng)', icon: drawEnergy }],
        answer: 1, hint: 'Gợi ý: không phải nước đâu! Nó giúp lạc đà có sức đi xa.', explain: 'Giỏi quá! Bướu chứa mỡ, là kho năng lượng của lạc đà.', cardId: 'eg_camel' },
      { id: 'q_eiffel', areaId: 'france', question: 'Tháp Eiffel được làm bằng gì?',
        choices: [{ text: 'Sắt', icon: drawIron }, { text: 'Gỗ', icon: drawWood }, { text: 'Kẹo', icon: drawCandy }],
        answer: 0, hint: 'Gợi ý: vật liệu này cứng, màu xám và rất chắc chắn.', explain: 'Đúng rồi! Tháp Eiffel làm bằng sắt, nên phải sơn lại để không gỉ.', cardId: 'fr_eiffel' },
      { id: 'q_croissant', areaId: 'france', question: 'Bánh sừng bò có hình gì?',
        choices: [{ text: 'Hình vuông', icon: drawSquareBread }, { text: 'Trăng khuyết', icon: ic(function (ctx, t) { if (A.drawCroissant) A.drawCroissant(ctx, 0, 8, 1.1, t); }) }],
        answer: 1, hint: 'Gợi ý: nó cong cong như mặt trăng lúc đầu tháng.', explain: 'Chính xác! Bánh sừng bò cong như vầng trăng khuyết.', cardId: 'fr_croissant' },
      { id: 'q_fuji', areaId: 'japan', question: 'Núi Phú Sĩ thật ra là gì?',
        choices: [{ text: 'Một núi lửa', icon: drawVolcano }, { text: 'Một núi kem', icon: drawIceCream }],
        answer: 0, hint: 'Gợi ý: ngọn núi này đang ngủ yên, nhưng ngày xưa từng phun lửa.', explain: 'Đúng vậy! Phú Sĩ là núi lửa đã ngủ yên hơn 300 năm.', cardId: 'jp_fuji' },
      { id: 'q_sakura', areaId: 'japan', question: 'Mùa xuân, người Nhật ngồi ngắm hoa gì?',
        choices: [{ text: 'Hoa hướng dương', icon: drawSunflower }, { text: 'Hoa anh đào', icon: ic(drawSakura) }],
        answer: 1, hint: 'Gợi ý: hoa màu hồng, nở đầy cây vào mùa xuân.', explain: 'Tuyệt! Ngắm hoa anh đào gọi là "hanami".', cardId: 'jp_sakura' },
      { id: 'q_sloth', areaId: 'amazon', question: 'Con lười di chuyển như thế nào?',
        choices: [{ text: 'Nhanh như tên lửa', icon: drawRocket }, { text: 'Rất rất chậm', icon: ic(function (ctx, t) { line(ctx, -44, -36, 44, -36, '#7a5236', 7); if (A.drawSloth) A.drawSloth(ctx, 0, -36, 1, t); }) }],
        answer: 1, hint: 'Gợi ý: cái tên của nó đã nói lên tất cả đấy!', explain: 'Đúng rồi! Con lười đi chậm ơi là chậm.', cardId: 'am_sloth' },
      { id: 'q_frog', areaId: 'amazon', question: 'Màu sặc sỡ của ếch phi tiêu muốn nói gì?',
        choices: [{ text: '"Đừng ăn tớ!"', icon: drawWarnFrog }, { text: '"Tớ đi dự tiệc!"', icon: drawPartyFrog }],
        answer: 0, hint: 'Gợi ý: ếch phi tiêu có độc, màu sáng là để cảnh báo.', explain: 'Chính xác! Màu sáng báo cho kẻ khác: đừng ăn tớ!', cardId: 'am_frog' },
      { id: 'q_bear', areaId: 'arctic', question: 'Dưới lớp lông trắng, da gấu Bắc Cực màu gì?',
        choices: [{ text: 'Màu hồng', icon: swatch('#ffb3c7') }, { text: 'Màu xanh lá', icon: swatch('#7ed957') }, { text: 'Màu đen', icon: swatch('#2b2f3a', 'cool') }],
        answer: 2, hint: 'Gợi ý: màu này giống màu bầu trời lúc nửa đêm.', explain: 'Đúng rồi! Da gấu Bắc Cực màu đen, lông thì trông trắng.', cardId: 'ar_bear' },
      { id: 'q_penguin', areaId: 'arctic', question: 'Chim cánh cụt sống ở đâu?',
        choices: [{ text: 'Nửa phía bắc', icon: globePointer(false) }, { text: 'Nửa phía nam', icon: globePointer(true) }],
        answer: 1, hint: 'Gợi ý: ngoài tự nhiên, cánh cụt chẳng gặp gấu Bắc Cực đâu!', explain: 'Giỏi quá! Hầu hết cánh cụt sống ở nửa phía nam Trái Đất.', cardId: 'ar_penguin' },
      { id: 'q_aurora', areaId: 'arctic', question: 'Cực quang là gì?',
        choices: [{ text: 'Ánh sáng múa trên trời đêm', icon: ic(drawAurora) }, { text: 'Cá phát sáng', icon: drawFish }],
        answer: 0, hint: 'Gợi ý: muốn thấy cực quang, em phải ngước nhìn lên trời.', explain: 'Tuyệt vời! Cực quang là những dải sáng nhảy múa trên trời đêm.', cardId: 'ar_aurora' }
    ],

    comics: {
      // ===== MỞ ĐẦU =====
      intro: [
        { bg: bg('garden', [], 0, globeExtra(480, 250, 46)),
          chars: [{ id: 'owl', anim: 'talk', x: 0.3 }, { id: 'oggy', anim: 'idle', x: 0.68, face: -1 }],
          bubbles: [{ who: 'owl', text: 'Chào Oggy! Ta là Giáo sư Cú. Xem Quả Địa Cầu Thần Kỳ của ta này!' }] },
        { bg: bg('garden', [], 120, globeExtra(700, 330, 30)),
          chars: [{ id: 'joey', anim: 'run', x: 0.5 }, { id: 'marky', anim: 'run', x: 0.62 }, { id: 'deedee', anim: 'run', x: 0.78 }],
          bubbles: [{ who: 'joey', text: 'Hí hí! Quả bóng đẹp quá, của bọn tớ nhé!' }],
          caption: 'Vèo! Lũ gián giật quả địa cầu rồi chạy biến!' },
        { bg: bg('garden', [], 200, globeExtra(480, 220, 40, true)),
          chars: [{ id: 'oggy', anim: 'think', x: 0.3 }, { id: 'owl', anim: 'think', x: 0.7, face: -1 }],
          caption: 'Bụp! Quả địa cầu vỡ thành 5 mảnh, bay tới 5 nơi trên thế giới!' },
        { bg: bg('garden', [], 260),
          chars: [{ id: 'owl', anim: 'point', x: 0.32 }, { id: 'oggy', anim: 'victory', x: 0.66, face: -1 }],
          bubbles: [{ who: 'owl', text: 'Đừng lo! Ta cùng bay vòng quanh thế giới tìm lại nhé!' }, { who: 'oggy', text: 'Đi thôi!' }] }
      ],

      // ===== AI CẬP =====
      egypt_intro: [
        { bg: bg('world-egypt', [{ kind: 'world-palm', x: 0.1 }, { kind: 'world-camel', x: 0.84, scale: 1.1 }]),
          chars: [{ id: 'owl', anim: 'talk', x: 0.3 }, { id: 'oggy', anim: 'idle', x: 0.55, face: -1 }],
          bubbles: [{ who: 'owl', text: 'Chào mừng tới Ai Cập, xứ sở của kim tự tháp và sa mạc vàng!' }] },
        { bg: bg('world-egypt', [{ kind: 'world-mummy', x: 0.7, scale: 1.6 }], 300),
          chars: [{ id: 'oggy', anim: 'hurt', x: 0.32 }],
          bubbles: [{ who: 'oggy', text: 'Ối! Xác ướp kìa!' }, { who: 'narrator', text: 'Xác ướp (thì thầm): Suỵt… nói khẽ thôi nhé. Chào bạn mèo dễ thương!' }] },
        { bg: bg('world-egypt', [{ kind: 'world-mummy', x: 0.7, scale: 1.6 }], 300),
          chars: [{ id: 'oggy', anim: 'victory', x: 0.32 }],
          caption: 'Hoá ra xác ướp rất hiền và lễ phép. Còn mảnh địa cầu thì ở đâu nhỉ?' }
      ],
      egypt_mid: [
        { bg: bg('world-egypt', [{ kind: 'world-camel', x: 0.66, scale: 1.4 }], 600),
          chars: [{ id: 'oggy', anim: 'think', x: 0.28 }],
          bubbles: [{ who: 'oggy', text: 'Bạn Lạc Đà ơi, sao bạn đeo kính râm?' }, { who: 'narrator', text: 'Lạc Đà: Nắng sa mạc chói lắm! Mà trông tớ ngầu không?' }] }
      ],
      egypt_boss: [
        { bg: bg('world-egypt', [{ kind: 'world-sphinx', x: 0.78, scale: 1.3 }], 900),
          chars: [{ id: 'joey', anim: 'victory', x: 0.55 }, { id: 'oggy', anim: 'idle', x: 0.22 }],
          bubbles: [{ who: 'joey', text: 'Ta là Pha-ra-ông Joey! Mảnh địa cầu này là của ta!' }, { who: 'oggy', text: 'Trả lại đây nào!' }] }
      ],
      egypt_outro: [
        { bg: bg('world-egypt', [{ kind: 'world-obelisk', x: 0.85 }], 1200, globeExtra(480, 200, 20)),
          chars: [{ id: 'joey', anim: 'hurt', x: 0.62 }, { id: 'oggy', anim: 'victory', x: 0.35 }],
          caption: 'Bẹp! Joey đành trả lại mảnh địa cầu thứ nhất.' },
        { bg: bg('world-egypt', [{ kind: 'world-mummy', x: 0.8, scale: 1.4 }], 1200),
          chars: [{ id: 'owl', anim: 'point', x: 0.4 }],
          bubbles: [{ who: 'owl', text: 'Mảnh tiếp theo bay tới nước Pháp. Lên đường thôi!' }] }
      ],

      // ===== PHÁP =====
      france_intro: [
        { bg: bg('world-france', [{ kind: 'world-lamp', x: 0.1 }, { kind: 'world-cafe', x: 0.82 }]),
          chars: [{ id: 'owl', anim: 'wave', x: 0.3 }, { id: 'oggy', anim: 'idle', x: 0.55, face: -1 }],
          bubbles: [{ who: 'owl', text: 'Bonjour! Chào mừng tới Paris, thủ đô nước Pháp!' }, { who: 'oggy', text: 'Ồ, mùi bánh thơm quá!' }] }
      ],
      france_mid: [
        { bg: bg('world-france', [{ kind: 'world-croissant', x: 0.62, scale: 1.6 }], 500),
          chars: [{ id: 'oggy', anim: 'victory', x: 0.3 }],
          bubbles: [{ who: 'oggy', text: 'Bánh sừng bò giòn tan! Rộp rộp rộp!' }],
          caption: 'Oggy ăn nhiều quá, bụng tròn như quả bóng!' }
      ],
      france_boss: [
        { bg: bg('world-france', [{ kind: 'world-easel', x: 0.72, scale: 1.4 }], 900),
          chars: [{ id: 'marky', anim: 'victory', x: 0.55 }, { id: 'oggy', anim: 'idle', x: 0.22 }],
          bubbles: [{ who: 'marky', text: 'Ta là hoạ sĩ Marky! Mảnh địa cầu là mặt trời trong tranh của ta!' }] }
      ],
      france_outro: [
        { bg: bg('world-france', [{ kind: 'world-easel', x: 0.78, scale: 1.3 }], 1200, globeExtra(480, 200, 20)),
          chars: [{ id: 'marky', anim: 'hurt', x: 0.6 }, { id: 'oggy', anim: 'victory', x: 0.32 }],
          bubbles: [{ who: 'marky', text: 'Thôi được, trả cậu đấy. Nhưng nhớ khen tranh ta đẹp nhé!' }, { who: 'oggy', text: 'Tranh đẹp lắm!' }] },
        { bg: bg('world-france', [], 1400),
          chars: [{ id: 'owl', anim: 'point', x: 0.4 }],
          bubbles: [{ who: 'owl', text: 'Hai mảnh rồi! Tiếp theo, ta bay sang Nhật Bản.' }] }
      ],

      // ===== NHẬT BẢN =====
      japan_intro: [
        { bg: bg('world-japan', [{ kind: 'world-sakura', x: 0.12 }, { kind: 'world-torii', x: 0.84 }]),
          chars: [{ id: 'owl', anim: 'talk', x: 0.32 }, { id: 'oggy', anim: 'idle', x: 0.56, face: -1 }],
          bubbles: [{ who: 'owl', text: 'Konnichiwa! Ở Nhật, câu này có nghĩa là "xin chào".' }, { who: 'oggy', text: 'Nhìn kìa, núi Phú Sĩ đang ngủ say!' }] }
      ],
      japan_mid: [
        { bg: bg('world-japan', [{ kind: 'world-sakura', x: 0.7, scale: 1.3 }], 500),
          chars: [{ id: 'oggy', anim: 'idle', x: 0.3 }, { id: 'owl', anim: 'talk', x: 0.5, face: -1 }],
          bubbles: [{ who: 'owl', text: 'Cánh hoa anh đào bay như tuyết hồng. Đẹp quá phải không?' }] }
      ],
      japan_boss: [
        { bg: bg('world-japan', [{ kind: 'world-sushi', x: 0.8, scale: 1.6 }], 900),
          chars: [{ id: 'deedee', anim: 'victory', x: 0.55 }, { id: 'oggy', anim: 'idle', x: 0.22 }],
          bubbles: [{ who: 'deedee', text: 'Măm măm! Sushi ngon quá! Mảnh địa cầu à? Để ta ăn xong đã!' }] }
      ],
      japan_outro: [
        { bg: bg('world-japan', [{ kind: 'world-stonelantern', x: 0.85 }], 1200, globeExtra(480, 200, 20)),
          chars: [{ id: 'deedee', anim: 'hurt', x: 0.6 }, { id: 'oggy', anim: 'victory', x: 0.32 }],
          bubbles: [{ who: 'deedee', text: 'Ợ… no căng bụng rồi. Cầm lấy mảnh địa cầu này!' }] },
        { bg: bg('world-japan', [], 1400),
          chars: [{ id: 'owl', anim: 'point', x: 0.4 }],
          bubbles: [{ who: 'owl', text: 'Ba mảnh rồi! Giờ ta tới rừng Amazon xanh mướt.' }] }
      ],

      // ===== AMAZON =====
      amazon_intro: [
        { bg: bg('world-amazon', [{ kind: 'world-jungletree', x: 0.12, scale: 0.9 }, { kind: 'world-frog', x: 0.85 }]),
          chars: [{ id: 'toucan', anim: 'wave', x: 0.62 }, { id: 'oggy', anim: 'idle', x: 0.36 }],
          bubbles: [{ who: 'toucan', text: 'Chào mừng tới rừng mưa Amazon! Ở đây mưa nhiều lắm đó!' }, { who: 'oggy', text: 'Ướt hết râu rồi!' }] }
      ],
      amazon_mid: [
        { bg: bg('world-amazon', [{ kind: 'world-sloth', x: 0.66, scale: 1.4 }], 500),
          chars: [{ id: 'oggy', anim: 'wave', x: 0.28 }],
          bubbles: [{ who: 'oggy', text: 'Chào bạn Lười!' }, { who: 'narrator', text: 'Con lười: Chàoooo… bạaaan… Oggyyyy… (một phút sau mới nói xong)' }] }
      ],
      amazon_boss: [
        { bg: bg('world-amazon', [{ kind: 'world-parrot', x: 0.82, scale: 1.2 }], 900),
          chars: [{ id: 'joey', anim: 'run', x: 0.55 }, { id: 'oggy', anim: 'idle', x: 0.22 }],
          bubbles: [{ who: 'joey', text: 'Lại là ta, Joey rừng xanh! Đuổi kịp ta thì lấy mảnh địa cầu!' }] }
      ],
      amazon_outro: [
        { bg: bg('world-amazon', [{ kind: 'world-frog', x: 0.82 }], 1200, globeExtra(480, 200, 20)),
          chars: [{ id: 'joey', anim: 'hurt', x: 0.6 }, { id: 'oggy', anim: 'victory', x: 0.32 }],
          bubbles: [{ who: 'joey', text: 'Ối, ếch xanh nhìn tớ kìa! Trả cậu mảnh địa cầu đấy!' }] },
        { bg: bg('world-amazon', [], 1400),
          chars: [{ id: 'owl', anim: 'point', x: 0.4 }, { id: 'toucan', anim: 'wave', x: 0.7, face: -1 }],
          bubbles: [{ who: 'owl', text: 'Mảnh cuối ở Bắc Cực lạnh giá. Mặc thật ấm vào nhé!' }] }
      ],

      // ===== BẮC CỰC =====
      arctic_intro: [
        { bg: bg('world-arctic', [{ kind: 'world-igloo', x: 0.86 }]),
          chars: [{ id: 'polar_bear', anim: 'wave', x: 0.6 }, { id: 'oggy', anim: 'idle', x: 0.3 }],
          bubbles: [{ who: 'polar_bear', text: 'Chào bạn! Tớ là Gấu Bắc Cực. Ở đây toàn băng với tuyết!' }, { who: 'oggy', text: 'Brrr… lạnh quá!' }] },
        { bg: bg('world-arctic', [{ kind: 'world-ice', x: 0.12 }], 200),
          chars: [{ id: 'penguin', anim: 'wave', x: 0.62 }, { id: 'oggy', anim: 'think', x: 0.32 }],
          bubbles: [{ who: 'penguin', text: 'Tớ chỉ đến du lịch thôi! Nhà tớ ở tận nửa phía nam Trái Đất.' }] }
      ],
      arctic_mid: [
        { bg: bg('world-arctic', [{ kind: 'world-snowman', x: 0.8 }], 500),
          chars: [{ id: 'owl', anim: 'point', x: 0.36 }, { id: 'oggy', anim: 'victory', x: 0.58, face: -1 }],
          bubbles: [{ who: 'owl', text: 'Nhìn lên trời kìa! Cực quang đang nhảy múa đó!' }] }
      ],
      arctic_boss: [
        { bg: bg('world-arctic', [{ kind: 'world-pole', x: 0.86 }], 900),
          chars: [{ id: 'joey', anim: 'victory', x: 0.48 }, { id: 'marky', anim: 'idle', x: 0.62 }, { id: 'deedee', anim: 'idle', x: 0.76 }, { id: 'oggy', anim: 'idle', x: 0.2 }],
          bubbles: [{ who: 'joey', text: 'Cả ba bọn ta đây! Mảnh cuối cùng là của bọn ta!' }] }
      ],

      // ===== KẾT THÚC =====
      ending: [
        { bg: bg('world-arctic', [{ kind: 'world-igloo', x: 0.88 }], 1200),
          chars: [{ id: 'joey', anim: 'think', x: 0.52 }, { id: 'marky', anim: 'think', x: 0.66 }, { id: 'deedee', anim: 'think', x: 0.8 }, { id: 'oggy', anim: 'idle', x: 0.24 }],
          bubbles: [{ who: 'deedee', text: 'Bọn tớ xin lỗi… Bọn tớ chỉ muốn được đi du lịch cùng thôi.' }] },
        { bg: bg('world-arctic', [], 1300),
          chars: [{ id: 'oggy', anim: 'wave', x: 0.3 }, { id: 'owl', anim: 'talk', x: 0.55, face: -1 }, { id: 'joey', anim: 'idle', x: 0.78, face: -1 }],
          bubbles: [{ who: 'oggy', text: 'Lần sau cứ hỏi mượn nhé! Đi chung mới vui!' }, { who: 'owl', text: 'Đúng thế! Chia sẻ thì niềm vui nhân đôi.' }] },
        { bg: bg('world-arctic', [], 1400, globeExtra(480, 190, 52)),
          chars: [{ id: 'oggy', anim: 'victory', x: 0.22 }, { id: 'joey', anim: 'victory', x: 0.66 }, { id: 'marky', anim: 'victory', x: 0.78 }, { id: 'deedee', anim: 'victory', x: 0.9 }],
          caption: 'Năm mảnh ghép lại, Quả Địa Cầu Thần Kỳ sáng lấp lánh!' },
        { bg: bg('world-arctic', [{ kind: 'world-pole', x: 0.88 }], 1500),
          chars: [{ id: 'owl', anim: 'wave', x: 0.3 }, { id: 'oggy', anim: 'victory', x: 0.52, face: -1 }],
          bubbles: [{ who: 'owl', text: 'Thế giới thật rộng lớn và kỳ diệu. Hẹn gặp lại ở chuyến đi sau!' }],
          caption: 'Bài học: muốn gì thì hỏi mượn, và cùng nhau khám phá thế giới!' }
      ]
    }
  });
})();
