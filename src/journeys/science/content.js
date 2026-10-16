/* Hành trình "science" — NỘI DUNG HỌC: thẻ kiến thức, câu đố, truyện tranh.
 * Chủ sở hữu v2: agent journey-science (CHỈ src/journeys/science/). Hợp đồng: docs/STORY.md mục 2.
 *
 * 4 khu: dino (thời khủng long) · body (bên trong cơ thể) · ocean (đại dương sâu) · space (Hệ Mặt Trời).
 * 18 thẻ (mỗi khu 4–5), 9 câu đố (mỗi khu 2–3), truyện mở đầu / mở-đóng mỗi khu / giữa màn / kết thúc.
 * Mọi hình minh hoạ vẽ bằng canvas: drawIcon(ctx, x, y, size, t) với (x, y) = tâm.
 * Kiến thức chọn lọc: đúng, phổ biến, số tròn an toàn, dành cho trẻ 5–10 tuổi. */
(function () {
  'use strict';
  var OG = window.OG;
  if (!OG.Journeys) return;

  var TAU = Math.PI * 2;
  var INK = '#17233d';

  function font(px, w) { return OG.font ? OG.font(px, w || 'bold') : (w || 'bold') + ' ' + px + 'px ' + (OG.FONT || 'sans-serif'); }
  function ink(ctx, w) { ctx.strokeStyle = INK; ctx.lineWidth = w || 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); }
  function face(ctx, x, y, s, mood) {
    ctx.save();
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.arc(x - 6 * s, y, 2.5 * s, 0, TAU); ctx.arc(x + 6 * s, y, 2.5 * s, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(x - 5.2 * s, y - 0.9 * s, 0.9 * s, 0, TAU); ctx.arc(x + 6.8 * s, y - 0.9 * s, 0.9 * s, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,120,150,0.55)';
    ctx.beginPath(); ctx.arc(x - 10.5 * s, y + 5 * s, 2.6 * s, 0, TAU); ctx.arc(x + 10.5 * s, y + 5 * s, 2.6 * s, 0, TAU); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.8 * s; ctx.lineCap = 'round';
    ctx.beginPath();
    if (mood === 'o') { ctx.fillStyle = INK; ctx.arc(x, y + 6 * s, 2.4 * s, 0, TAU); ctx.fill(); }
    else if (mood === 'sad') { ctx.arc(x, y + 8 * s, 4 * s, Math.PI + 0.4, TAU - 0.4); ctx.stroke(); }
    else { ctx.arc(x, y + 3 * s, 4 * s, 0.25, Math.PI - 0.25); ctx.stroke(); }
    ctx.restore();
  }
  function starPath(ctx, x, y, ro, ri) {
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var r = i % 2 ? ri : ro, a = i * Math.PI / 5 - Math.PI / 2;
      if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
  }

  // Bọc hàm vẽ: dịch về tâm và chuẩn hoá kích thước (vẽ trong khung 100×100, tâm 0,0).
  function icon(fn) {
    return function (ctx, x, y, size, t) {
      ctx.save();
      ctx.translate(x, y);
      var k = (size || 64) / 100;
      ctx.scale(k, k);
      try { fn(ctx, t || 0); } catch (e) { /* hình hỏng thì bỏ qua, không làm vỡ scene */ }
      ctx.restore();
    };
  }
  // Dùng decor đã đăng ký trong theme.js làm hình (y = mặt đất nên dịch xuống).
  function decorIcon(kind, scale, groundY, opts) {
    return icon(function (ctx, t) {
      if (OG.Scenery && OG.Scenery.drawDecor) OG.Scenery.drawDecor(ctx, kind, 0, groundY, scale, t, opts || {});
    });
  }

  // ---------------------------------------------------------------------------
  // Hình vẽ (khung 100×100, tâm 0,0)
  // ---------------------------------------------------------------------------
  function leafShape(ctx, c) {
    ctx.beginPath(); ctx.moveTo(-30, 28); ctx.quadraticCurveTo(-34, -30, 30, -32); ctx.quadraticCurveTo(28, 28, -30, 28); ctx.closePath();
    ctx.fillStyle = c || '#6cc35a'; ctx.fill(); ink(ctx, 4);
    ctx.beginPath(); ctx.moveTo(-30, 28); ctx.lineTo(22, -24); ink(ctx, 3);
  }

  var draw = {
    // Khủng long cổ dài đang ăn lá.
    longneck: function (ctx, t) {
      ctx.fillStyle = '#6cc35a';
      ctx.beginPath(); ctx.arc(30, -32, 14, 0, TAU); ctx.fill(); ink(ctx, 3);
      ctx.beginPath(); ctx.ellipse(-8, 20, 30, 18, 0, 0, TAU); ctx.fillStyle = '#7ed957'; ctx.fill(); ink(ctx, 3.5);
      ctx.fillStyle = '#7ed957';
      [-26, -12, 4, 14].forEach(function (lx) { ctx.beginPath(); ctx.rect(lx, 28, 9, 16); ctx.fill(); ink(ctx, 3); });
      ctx.beginPath(); ctx.moveTo(-36, 16); ctx.quadraticCurveTo(-50, 22, -46, 36); ctx.quadraticCurveTo(-40, 26, -34, 26); ctx.fill(); ink(ctx, 3);
      ctx.beginPath(); ctx.moveTo(8, 10); ctx.quadraticCurveTo(14, -16, 12, -28); ctx.lineTo(24, -26); ctx.quadraticCurveTo(26, -10, 18, 14); ctx.closePath(); ctx.fill(); ink(ctx, 3);
      ctx.beginPath(); ctx.ellipse(18, -32, 13, 9, 0.2, 0, TAU); ctx.fill(); ink(ctx, 3);
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(21, -35, 2.4, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(-14, 12, 4, 0, TAU); ctx.arc(0, 8, 3, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(31 + Math.sin(t * 4) * 1.5, -29, 5, 3, 0.5, 0, TAU); ctx.fillStyle = '#4fb04a'; ctx.fill();
    },
    // T. rex dễ thương: đầu to, răng trắng, tay ngắn tũn.
    trex: function (ctx, t) {
      ctx.fillStyle = '#ff9f5a';
      ctx.beginPath(); ctx.moveTo(-14, 6); ctx.quadraticCurveTo(-44, 20, -48, 40); ctx.quadraticCurveTo(-30, 30, -10, 26); ctx.closePath(); ctx.fill(); ink(ctx, 3);
      ctx.beginPath(); ctx.ellipse(-4, 16, 22, 24, 0, 0, TAU); ctx.fill(); ink(ctx, 3.5);
      ctx.beginPath(); ctx.rect(-14, 34, 10, 12); ctx.rect(4, 34, 10, 12); ctx.fill(); ink(ctx, 3);
      // đầu
      ctx.beginPath(); ctx.ellipse(10, -20, 30, 20, -0.15, 0, TAU); ctx.fill(); ink(ctx, 3.5);
      // miệng cười + răng
      ctx.beginPath(); ctx.moveTo(-6, -10); ctx.quadraticCurveTo(16, 2, 36, -14); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = '#ffffff';
      for (var i = 0; i < 4; i++) { var tx = 2 + i * 8; ctx.beginPath(); ctx.moveTo(tx, -8 + i * -0.8); ctx.lineTo(tx + 3, -2 - i); ctx.lineTo(tx + 6, -9 - i); ctx.closePath(); ctx.fill(); ink(ctx, 1.5); }
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(14, -28, 3.2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(15, -29, 1.2, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,120,150,0.55)'; ctx.beginPath(); ctx.arc(24, -18, 3.5, 0, TAU); ctx.fill();
      // tay ngắn tũn vẫy vẫy
      var wv = Math.sin(t * 6) * 0.4;
      ctx.save(); ctx.translate(12, 10); ctx.rotate(-0.4 + wv);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(10, 2); ctx.strokeStyle = INK; ctx.lineWidth = 7; ctx.stroke(); ctx.strokeStyle = '#ff9f5a'; ctx.lineWidth = 3.5; ctx.stroke();
      ctx.restore();
    },
    // Hoá thạch xương trong phiến đá.
    fossil: function (ctx) {
      ctx.beginPath(); ctx.ellipse(0, 4, 44, 34, 0, 0, TAU); ctx.fillStyle = '#c7a27c'; ctx.fill(); ink(ctx, 4);
      ctx.strokeStyle = '#fff7e8'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-28, 10); ctx.quadraticCurveTo(0, -8, 26, 6); ctx.stroke();
      for (var i = -3; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 8 + 2, 2 + Math.abs(i)); ctx.lineTo(i * 8 - 1, 20); ctx.stroke(); }
      ctx.fillStyle = '#fff7e8'; ctx.beginPath(); ctx.ellipse(30, 2, 10, 8, 0.2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#7a5a3f'; ctx.beginPath(); ctx.arc(33, 0, 2, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(23,35,61,0.2)'; ctx.beginPath(); ctx.arc(-30, -14, 4, 0, TAU); ctx.arc(-14, -22, 3, 0, TAU); ctx.fill();
    },
    // Gà con cạnh dấu chân khủng long: chim là con cháu của khủng long.
    bird: function (ctx, t) {
      ctx.fillStyle = 'rgba(126,217,87,0.45)';
      ctx.beginPath(); ctx.moveTo(-40, 40); ctx.quadraticCurveTo(-44, -20, -10, -40); ctx.quadraticCurveTo(10, -30, 0, -6); ctx.quadraticCurveTo(30, 10, 40, 40); ctx.closePath(); ctx.fill();
      var hop = Math.abs(Math.sin(t * 4)) * -4;
      ctx.save(); ctx.translate(4, hop);
      ctx.beginPath(); ctx.arc(0, 14, 22, 0, TAU); ctx.fillStyle = '#ffd23f'; ctx.fill(); ink(ctx, 3.5);
      ctx.beginPath(); ctx.arc(2, -12, 14, 0, TAU); ctx.fill(); ink(ctx, 3);
      ctx.beginPath(); ctx.moveTo(14, -12); ctx.lineTo(24, -8); ctx.lineTo(14, -4); ctx.closePath(); ctx.fillStyle = '#ff9f1c'; ctx.fill(); ink(ctx, 2);
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(6, -15, 2.4, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-8, 12, 9, 6, -0.4, 0, TAU); ctx.fillStyle = '#ffc21a'; ctx.fill(); ink(ctx, 2);
      ctx.strokeStyle = '#ff9f1c'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-6, 34); ctx.lineTo(-6, 42); ctx.moveTo(8, 34); ctx.lineTo(8, 42); ctx.stroke();
      ctx.restore();
    },
    heart: function (ctx, t) {
      var b = 1 + Math.max(0, Math.sin(t * 6)) * 0.08;
      ctx.scale(b, b);
      ctx.beginPath(); ctx.moveTo(0, 38);
      ctx.bezierCurveTo(-58, 0, -44, -48, 0, -20); ctx.bezierCurveTo(44, -48, 58, 0, 0, 38); ctx.closePath();
      ctx.fillStyle = '#ff5a6e'; ctx.fill(); ink(ctx, 4);
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.ellipse(-20, -14, 7, 4, -0.6, 0, TAU); ctx.fill();
      face(ctx, 0, 0, 1.3);
    },
    lungs: function (ctx, t) {
      var br = 1 + Math.sin(t * 2) * 0.06;
      ctx.beginPath(); ctx.moveTo(0, -42); ctx.lineTo(0, -12); ctx.moveTo(0, -12); ctx.lineTo(-10, -2); ctx.moveTo(0, -12); ctx.lineTo(10, -2);
      ctx.strokeStyle = INK; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.stroke(); ctx.strokeStyle = '#ffd1dc'; ctx.lineWidth = 5; ctx.stroke();
      for (var k = -1; k <= 1; k += 2) {
        ctx.save(); ctx.translate(k * 22, 8); ctx.scale(br, br);
        ctx.beginPath(); ctx.ellipse(0, 0, 18, 30, k * -0.15, 0, TAU); ctx.fillStyle = '#ff8fa3'; ctx.fill(); ink(ctx, 3.5);
        ctx.restore();
      }
      face(ctx, -22, 6, 0.6); face(ctx, 22, 6, 0.6);
    },
    // Khúc xương + số 206.
    bones: function (ctx) {
      ctx.save(); ctx.rotate(-0.5);
      ctx.beginPath(); ctx.rect(-30, -8, 60, 16);
      [[-32, -9], [-32, 9], [32, -9], [32, 9]].forEach(function (p) { ctx.moveTo(p[0] + 11, p[1]); ctx.arc(p[0], p[1], 11, 0, TAU); });
      ctx.strokeStyle = INK; ctx.lineWidth = 7; ctx.stroke();
      ctx.fillStyle = '#fff7e8'; ctx.fill();
      face(ctx, 0, -1, 0.7);
      ctx.restore();
      ctx.font = font(20); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 5; ctx.strokeStyle = '#ffffff'; ctx.strokeText('206', 22, 34); ctx.fillStyle = '#3f6fb5'; ctx.fillText('206', 22, 34);
    },
    tooth: function (ctx, t) {
      ctx.beginPath();
      ctx.moveTo(-28, -26); ctx.quadraticCurveTo(-36, 14, -22, 36); ctx.quadraticCurveTo(-14, 44, -10, 32);
      ctx.quadraticCurveTo(0, 12, 10, 32); ctx.quadraticCurveTo(14, 44, 22, 36); ctx.quadraticCurveTo(36, 14, 28, -26);
      ctx.quadraticCurveTo(14, -40, 0, -30); ctx.quadraticCurveTo(-14, -40, -28, -26); ctx.closePath();
      ctx.fillStyle = '#ffffff'; ctx.fill(); ink(ctx, 4);
      face(ctx, 0, -6, 1.1);
      var k = 0.5 + 0.5 * Math.sin(t * 4);
      ctx.fillStyle = 'rgba(127,224,255,' + k.toFixed(2) + ')'; starPath(ctx, 30, -34, 9, 3.5); ctx.fill();
    },
    // Hồng cầu chạy trong mạch máu.
    blood: function (ctx, t) {
      ctx.beginPath(); ctx.moveTo(-50, -10); ctx.bezierCurveTo(-20, -40, 20, 20, 50, -10);
      ctx.strokeStyle = INK; ctx.lineWidth = 34; ctx.lineCap = 'round'; ctx.stroke(); ctx.strokeStyle = '#ffb8c8'; ctx.lineWidth = 27; ctx.stroke();
      for (var i = 0; i < 3; i++) {
        var u = ((t * 0.3 + i / 3) % 1), x = -40 + u * 80;
        var y = -10 + Math.sin(u * Math.PI * 2) * -12;
        ctx.beginPath(); ctx.ellipse(x, y, 10, 7, 0, 0, TAU); ctx.fillStyle = '#e5484d'; ctx.fill(); ink(ctx, 2);
      }
      ctx.beginPath(); ctx.ellipse(0, 26, 20, 15, 0, 0, TAU); ctx.fillStyle = '#ef4f5f'; ctx.fill(); ink(ctx, 3);
      face(ctx, 0, 24, 0.7);
    },
    whale: function (ctx, t) {
      ctx.fillStyle = '#4f7fc9';
      var sw = Math.sin(t * 2) * 6;
      ctx.beginPath(); ctx.moveTo(-34, 0); ctx.quadraticCurveTo(-46, -14 + sw, -50, -6 + sw); ctx.quadraticCurveTo(-44, 2, -50, 12 + sw); ctx.quadraticCurveTo(-42, 8, -34, 6); ctx.closePath(); ctx.fill(); ink(ctx, 3);
      ctx.beginPath(); ctx.ellipse(4, 4, 40, 24, 0, 0, TAU); ctx.fill(); ink(ctx, 4);
      ctx.fillStyle = '#cfe3ff'; ctx.beginPath(); ctx.ellipse(10, 14, 28, 9, 0, 0, Math.PI); ctx.fill();
      face(ctx, 24, 0, 0.9);
      var k = (t * 0.6) % 1;
      ctx.fillStyle = 'rgba(127,224,255,' + (1 - k).toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(14, -26 - k * 14, 5, 0, TAU); ctx.arc(22, -30 - k * 14, 4, 0, TAU); ctx.fill();
    },
    octopus: function (ctx, t) {
      ctx.strokeStyle = '#ff7aa2'; ctx.lineCap = 'round';
      for (var i = 0; i < 8; i++) {
        var a = Math.PI * (0.12 + i * 0.108);
        var x0 = Math.cos(a) * 18, y0 = 6;
        ctx.beginPath(); ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(Math.cos(a) * 40 + Math.sin(t * 3 + i) * 5, 26, Math.cos(a) * 44, 40);
        ctx.strokeStyle = INK; ctx.lineWidth = 9; ctx.stroke();
        ctx.strokeStyle = '#ff7aa2'; ctx.lineWidth = 5; ctx.stroke();
      }
      ctx.beginPath(); ctx.ellipse(0, -10, 28, 28, 0, 0, TAU); ctx.fillStyle = '#ff7aa2'; ctx.fill(); ink(ctx, 4);
      face(ctx, 0, -6, 1);
      // 3 trái tim nhỏ
      ctx.fillStyle = '#ff3b5c';
      for (var h = 0; h < 3; h++) {
        ctx.save(); ctx.translate(-14 + h * 14, -30); ctx.scale(0.25, 0.25);
        ctx.beginPath(); ctx.moveTo(0, 18); ctx.bezierCurveTo(-26, 0, -18, -20, 0, -8); ctx.bezierCurveTo(18, -20, 26, 0, 0, 18); ctx.fill();
        ctx.restore();
      }
    },
    // Trái Đất phần lớn là biển xanh.
    earthOcean: function (ctx, t) {
      ctx.beginPath(); ctx.arc(0, 0, 40, 0, TAU); ctx.fillStyle = '#3f8ff0'; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.fillStyle = '#6cc35a';
      var o = (t * 6) % 120;
      ctx.beginPath(); ctx.ellipse(-30 + o * 0.2, -12, 16, 10, 0.5, 0, TAU); ctx.ellipse(18 + o * 0.2, 16, 12, 8, -0.4, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.ellipse(-10, -30, 20, 5, 0, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.beginPath(); ctx.arc(0, 0, 40, 0, TAU); ink(ctx, 4);
      face(ctx, 0, 2, 1);
      // bong bóng
      ctx.strokeStyle = 'rgba(127,224,255,0.9)'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(38, -34, 5, 0, TAU); ctx.moveTo(48, -20); ctx.arc(44, -20, 4, 0, TAU); ctx.stroke();
    },
    sun: function (ctx, t) {
      ctx.save(); ctx.rotate(t * 0.4);
      ctx.fillStyle = '#ffb02e';
      for (var i = 0; i < 12; i++) { ctx.rotate(TAU / 12); ctx.beginPath(); ctx.moveTo(-8, -32); ctx.lineTo(0, -48); ctx.lineTo(8, -32); ctx.closePath(); ctx.fill(); ink(ctx, 2.5); }
      ctx.restore();
      ctx.beginPath(); ctx.arc(0, 0, 32, 0, TAU); ctx.fillStyle = '#ffd23f'; ctx.fill(); ink(ctx, 4);
      face(ctx, 0, 0, 1.2);
    },
    // Mặt Trời và 8 hành tinh xếp hàng.
    planets: function (ctx, t) {
      ctx.beginPath(); ctx.arc(-50, 0, 26, 0, TAU); ctx.fillStyle = '#ffd23f'; ctx.fill(); ink(ctx, 3);
      var cols = ['#b8b0a8', '#f3c26a', '#4fa8f0', '#e7774f', '#e7b98a', '#f1d27a', '#8fe3e8', '#5b7cf0'];
      var rs = [3, 5, 5.5, 4, 10, 8.5, 6.5, 6.5];
      var x = -18;
      for (var i = 0; i < 8; i++) {
        x += rs[i] + 2.5;
        var y = Math.sin(t * 2 + i) * 3;
        if (i === 5) { ctx.beginPath(); ctx.ellipse(x, y, rs[i] * 1.7, rs[i] * 0.45, -0.3, 0, TAU); ctx.strokeStyle = '#d9b45a'; ctx.lineWidth = 2.5; ctx.stroke(); }
        ctx.beginPath(); ctx.arc(x, y, rs[i], 0, TAU); ctx.fillStyle = cols[i]; ctx.fill(); ink(ctx, 2);
        if (i === 2) { ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x - 1.8, y - 1, 0.9, 0, TAU); ctx.arc(x + 1.8, y - 1, 0.9, 0, TAU); ctx.fill(); }
        x += rs[i];
      }
      ctx.font = font(18); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 5; ctx.strokeStyle = '#ffffff'; ctx.strokeText('8', 30, 32); ctx.fillStyle = '#7b6cf0'; ctx.fillText('8', 30, 32);
    },
    // Mặt Trăng sáng nhờ ánh Mặt Trời.
    moon: function (ctx, t) {
      ctx.beginPath(); ctx.arc(-38, -30, 14, 0, TAU); ctx.fillStyle = '#ffd23f'; ctx.fill(); ink(ctx, 2.5);
      ctx.strokeStyle = 'rgba(255,210,63,0.8)'; ctx.lineWidth = 3; ctx.setLineDash([6, 6]); ctx.lineDashOffset = -t * 20;
      ctx.beginPath(); ctx.moveTo(-24, -22); ctx.lineTo(-6, -10); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(10, 8, 32, 0, TAU); ctx.fillStyle = '#e3e6ef'; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.fillStyle = 'rgba(23,35,61,0.28)'; ctx.beginPath(); ctx.arc(30, 20, 30, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(23,35,61,0.12)'; ctx.beginPath(); ctx.arc(-4, 22, 6, 0, TAU); ctx.arc(10, -10, 4, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.beginPath(); ctx.arc(10, 8, 32, 0, TAU); ink(ctx, 4);
      face(ctx, 4, 6, 0.9);
    },
    astronaut: function (ctx, t) {
      var fl = Math.sin(t * 1.5) * 3;
      ctx.translate(0, fl);
      ctx.beginPath(); ctx.ellipse(0, 26, 22, 18, 0, 0, TAU); ctx.fillStyle = '#f4f7fb'; ctx.fill(); ink(ctx, 3.5);
      ctx.beginPath(); ctx.rect(-6, 18, 12, 9); ctx.fillStyle = '#ff7d5c'; ctx.fill(); ink(ctx, 2);
      ctx.beginPath(); ctx.arc(0, -10, 28, 0, TAU); ctx.fillStyle = '#f4f7fb'; ctx.fill(); ink(ctx, 4);
      ctx.beginPath(); ctx.ellipse(0, -8, 20, 16, 0, 0, TAU); ctx.fillStyle = '#4b4f8c'; ctx.fill(); ink(ctx, 2.5);
      face(ctx, 0, -8, 0.8);
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.ellipse(-9, -16, 5, 3, -0.6, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffd84a'; starPath(ctx, 38, -32, 8, 3.5); ctx.fill(); starPath(ctx, -40, 30, 6, 2.5); ctx.fill();
    },
    jupiter: function (ctx, t) {
      ctx.beginPath(); ctx.arc(-4, 2, 40, 0, TAU); ctx.fillStyle = '#e7b98a'; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.fillStyle = '#c98a5a';
      for (var b = -2; b <= 2; b++) ctx.fillRect(-50, b * 15 - 3, 100, 6);
      ctx.fillStyle = '#d8573f'; ctx.beginPath(); ctx.ellipse(12, 20, 9, 5, 0, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.beginPath(); ctx.arc(-4, 2, 40, 0, TAU); ink(ctx, 4);
      face(ctx, -6, -4, 1);
      // Trái Đất tí hon bên cạnh để so sánh
      ctx.beginPath(); ctx.arc(42, -34, 5, 0, TAU); ctx.fillStyle = '#4fa8f0'; ctx.fill(); ink(ctx, 2);
    }
  };

  // Hình cho đáp án câu đố.
  var pick = {
    leaf: function (ctx) { leafShape(ctx); },
    fish: function (ctx, t) {
      ctx.save(); ctx.rotate(Math.sin(t * 3) * 0.1);
      ctx.beginPath(); ctx.moveTo(22, 0); ctx.lineTo(42, -16); ctx.lineTo(42, 16); ctx.closePath(); ctx.fillStyle = '#52c5ee'; ctx.fill(); ink(ctx, 3);
      ctx.beginPath(); ctx.ellipse(-4, 0, 32, 20, 0, 0, TAU); ctx.fill(); ink(ctx, 4);
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(-20, -4, 3, 0, TAU); ctx.fill();
      ctx.restore();
    },
    camera: function (ctx) {
      ctx.beginPath(); ctx.rect(-36, -20, 72, 46); ctx.fillStyle = '#5d7891'; ctx.fill(); ink(ctx, 4);
      ctx.beginPath(); ctx.rect(-14, -30, 28, 12); ctx.fill(); ink(ctx, 3);
      ctx.beginPath(); ctx.arc(0, 3, 15, 0, TAU); ctx.fillStyle = '#7fe0ff'; ctx.fill(); ink(ctx, 3);
      ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(26, -12, 4, 0, TAU); ctx.fill();
    },
    bulb: function (ctx, t) {
      ctx.beginPath(); ctx.arc(0, -10, 26, 0.75 * Math.PI, 0.25 * Math.PI); ctx.lineTo(10, 24); ctx.lineTo(-10, 24); ctx.closePath();
      ctx.fillStyle = '#fff3a0'; ctx.fill(); ink(ctx, 4);
      ctx.beginPath(); ctx.rect(-11, 24, 22, 14); ctx.fillStyle = '#9fb4c8'; ctx.fill(); ink(ctx, 3);
      face(ctx, 0, -10, 0.8);
    },
    hair: function (ctx) {
      ctx.strokeStyle = '#8a5a32'; ctx.lineCap = 'round';
      for (var i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 10, 34); ctx.bezierCurveTo(i * 10 - 20, 0, i * 10 + 20, -10, i * 10 + 4, -36); ctx.strokeStyle = INK; ctx.lineWidth = 8; ctx.stroke(); ctx.strokeStyle = '#a8703c'; ctx.lineWidth = 4; ctx.stroke(); }
    },
    mirror: function (ctx) {
      ctx.beginPath(); ctx.ellipse(0, -8, 26, 32, 0, 0, TAU); ctx.fillStyle = '#9fb4c8'; ctx.fill(); ink(ctx, 4);
      ctx.beginPath(); ctx.ellipse(0, -8, 19, 25, 0, 0, TAU); ctx.fillStyle = '#dff3ff'; ctx.fill(); ink(ctx, 2);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-8, -20); ctx.lineTo(6, -2); ctx.stroke();
      ctx.beginPath(); ctx.rect(-5, 24, 10, 18); ctx.fillStyle = '#9fb4c8'; ctx.fill(); ink(ctx, 3);
    }
  };

  // Ô số tròn kèm hình nhỏ (dùng cho câu đố đếm).
  function numberIcon(n, color, mini) {
    return icon(function (ctx, t) {
      ctx.beginPath(); ctx.arc(0, 0, 40, 0, TAU); ctx.fillStyle = color || '#7b6cf0'; ctx.fill(); ink(ctx, 4);
      ctx.font = font(String(n).length > 2 ? 32 : 40); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff'; ctx.fillText(String(n), 0, 2);
      if (mini) { ctx.save(); ctx.translate(30, -30); ctx.scale(0.32, 0.32); mini(ctx, t); ctx.restore(); }
    });
  }

  var I = {};
  Object.keys(draw).forEach(function (k) { I[k] = icon(draw[k]); });
  Object.keys(pick).forEach(function (k) { I[k] = icon(pick[k]); });
  I.earth = decorIcon('science-planet', 1.25, 0, { kind: 'earth', center: true, r: 30 });
  I.moonPlanet = decorIcon('science-planet', 1.25, 0, { kind: 'moon', center: true, r: 30 });
  I.star = decorIcon('science-star', 1.6, 0, {});

  // Nền truyện tranh: cảnh của theme + một hình nổi bật cố định (cá voi, Trái Đất…).
  // Vẽ sàn tại x = 0 trong toạ độ màn hình để khớp nền; extra(ctx, t) vẽ thêm phía trên.
  function sceneBg(theme, camX, extra) {
    return function (ctx, x, y, w, h, t) {
      if (OG.Sprites && OG.Sprites.drawBackground) {
        OG.Sprites.drawBackground(ctx, theme, camX || 0, t);
        if (OG.Sprites.drawPlatform) OG.Sprites.drawPlatform(ctx, { x: 0, y: OG.FLOOR_Y || 480, w: w, h: 60, isFloor: true }, theme, t);
      } else { ctx.fillStyle = '#123d75'; ctx.fillRect(0, 0, w, h); }
      if (extra) extra(ctx, t);
    };
  }

  // ---------------------------------------------------------------------------
  // Đăng ký
  // ---------------------------------------------------------------------------
  OG.Journeys.register({
    id: 'science',

    cards: [
      // ---- Thời khủng long ----
      { id: 'dn_herbivore', areaId: 'dino', title: 'Khủng long ăn cỏ',
        fact: 'Khủng long cổ dài chỉ ăn lá cây. Cái cổ dài giúp chúng với tới lá cây trên cao, giống hươu cao cổ vậy!', drawIcon: I.longneck },
      { id: 'dn_trex', areaId: 'dino', title: 'Khủng long bạo chúa',
        fact: 'T-rex là khủng long ăn thịt. Răng nó to như quả chuối, nhưng đôi tay lại ngắn tũn!', drawIcon: I.trex },
      { id: 'dn_fossil', areaId: 'dino', title: 'Hoá thạch',
        fact: 'Hoá thạch là xương hay dấu chân đã hoá đá từ rất lâu. Nhờ hoá thạch, ta biết khủng long trông thế nào.', drawIcon: I.fossil },
      { id: 'dn_bird', areaId: 'dino', title: 'Họ hàng khủng long',
        fact: 'Chim ngày nay là con cháu của khủng long! Chú gà con cũng là họ hàng xa của chúng đấy.', drawIcon: I.bird },

      // ---- Bên trong cơ thể ----
      { id: 'bd_heart', areaId: 'body', title: 'Trái tim',
        fact: 'Tim là một cơ bắp chăm chỉ, đập cả ngày lẫn đêm để bơm máu đi khắp cơ thể. Tim em to cỡ nắm tay em.', drawIcon: I.heart },
      { id: 'bd_blood', areaId: 'body', title: 'Hồng cầu',
        fact: 'Máu chảy trong những ống nhỏ gọi là mạch máu. Hồng cầu chở ô-xy đến mọi nơi trong cơ thể.', drawIcon: I.blood },
      { id: 'bd_lungs', areaId: 'body', title: 'Lá phổi',
        fact: 'Hai lá phổi giống hai quả bóng. Khi em hít vào, phổi phồng lên để lấy ô-xy từ không khí.', drawIcon: I.lungs },
      { id: 'bd_bones', areaId: 'body', title: 'Bộ xương',
        fact: 'Người lớn có khoảng 206 cái xương. Xương giúp em đứng thẳng, chạy nhảy và bảo vệ cơ thể.', drawIcon: I.bones },
      { id: 'bd_teeth', areaId: 'body', title: 'Răng sữa',
        fact: 'Trẻ em có 20 chiếc răng sữa. Từ khoảng 6 tuổi, răng sữa rụng dần để răng mới mọc lên.', drawIcon: I.tooth },

      // ---- Đại dương sâu ----
      { id: 'oc_ocean', areaId: 'ocean', title: 'Hành tinh xanh',
        fact: 'Biển và đại dương phủ phần lớn bề mặt Trái Đất. Vì thế nhìn từ vũ trụ, Trái Đất có màu xanh dương.', drawIcon: I.earthOcean },
      { id: 'oc_octopus', areaId: 'ocean', title: 'Bạch tuộc',
        fact: 'Bạch tuộc có 8 xúc tu và tới 3 quả tim! Nó còn đổi được màu da để trốn.', drawIcon: I.octopus },
      { id: 'oc_glow', areaId: 'ocean', title: 'Đèn dưới biển sâu',
        fact: 'Biển sâu tối om, nhưng nhiều con vật tự phát sáng. Cá cần câu có một chiếc "đèn" nhỏ trên đầu.',
        drawIcon: decorIcon('science-anglerfish', 0.9, 8, {}) },
      { id: 'oc_whale', areaId: 'ocean', title: 'Cá voi xanh',
        fact: 'Cá voi xanh là con vật to nhất đang sống ngày nay. Nó nặng hơn khủng long bạo chúa rất nhiều lần!', drawIcon: I.whale },

      // ---- Hệ Mặt Trời ----
      { id: 'sp_sun', areaId: 'space', title: 'Mặt Trời',
        fact: 'Mặt Trời là một ngôi sao! Nó rất to và rất nóng, cho Trái Đất ánh sáng và hơi ấm.', drawIcon: I.sun },
      { id: 'sp_moon', areaId: 'space', title: 'Mặt Trăng',
        fact: 'Mặt Trăng không tự phát sáng. Nó sáng lên nhờ phản chiếu ánh sáng của Mặt Trời.', drawIcon: I.moon },
      { id: 'sp_astronaut', areaId: 'space', title: 'Phi hành gia',
        fact: 'Khi ra ngoài vũ trụ, phi hành gia mặc bộ đồ đặc biệt có không khí để thở. Trên trạm vũ trụ, họ bay lơ lửng!', drawIcon: I.astronaut },
      { id: 'sp_planets', areaId: 'space', title: '8 hành tinh',
        fact: 'Có 8 hành tinh quay quanh Mặt Trời. Trái Đất là hành tinh thứ ba, nơi chúng ta sống.', drawIcon: I.planets },
      { id: 'sp_jupiter', areaId: 'space', title: 'Sao Mộc khổng lồ',
        fact: 'Sao Mộc là hành tinh lớn nhất. Hơn một nghìn Trái Đất có thể xếp vừa bên trong nó!', drawIcon: I.jupiter }
    ],

    quizzes: [
      { id: 'q_dn_food', areaId: 'dino', question: 'Khủng long cổ dài thích ăn gì?',
        choices: [{ text: 'Lá cây', icon: I.leaf }, { text: 'Cá', icon: I.fish }],
        answer: 0, hint: 'Gợi ý: cổ dài giúp nó với tới ngọn cây đấy!',
        explain: 'Đúng rồi! Khủng long cổ dài là khủng long ăn cỏ, chúng ăn lá cây.', cardId: 'dn_herbivore' },
      { id: 'q_dn_fossil', areaId: 'dino', question: 'Nhờ đâu ta biết khủng long trông thế nào?',
        choices: [{ text: 'Ảnh chụp', icon: I.camera }, { text: 'Hoá thạch', icon: I.fossil }, { text: 'Bóng đèn', icon: I.bulb }],
        answer: 1, hint: 'Gợi ý: thời khủng long chưa có máy ảnh. Hãy nhớ những khúc xương trong đá!',
        explain: 'Chính xác! Các nhà khoa học tìm hoá thạch trong đá để tìm hiểu khủng long.', cardId: 'dn_fossil' },

      { id: 'q_bd_heart', areaId: 'body', question: 'Bộ phận nào bơm máu đi khắp cơ thể?',
        choices: [{ text: 'Răng', icon: I.tooth }, { text: 'Tim', icon: I.heart }, { text: 'Tóc', icon: I.hair }],
        answer: 1, hint: 'Gợi ý: nó kêu thình thịch trong ngực em đấy!',
        explain: 'Giỏi quá! Tim đập liên tục để đưa máu đi khắp người.', cardId: 'bd_heart' },
      { id: 'q_bd_teeth', areaId: 'body', question: 'Trẻ em có bao nhiêu chiếc răng sữa?',
        choices: [{ text: '5 chiếc', icon: numberIcon(5, '#9fb4c8', draw.tooth) }, { text: '20 chiếc', icon: numberIcon(20, '#52c5ee', draw.tooth) }, { text: '100 chiếc', icon: numberIcon(100, '#ff8fa3', draw.tooth) }],
        answer: 1, hint: 'Gợi ý: bằng số ngón tay và ngón chân của em cộng lại!',
        explain: 'Đúng rồi! 20 chiếc răng sữa. Nhớ đánh răng sáng và tối nhé!', cardId: 'bd_teeth' },

      { id: 'q_oc_octopus', areaId: 'ocean', question: 'Bạch tuộc có mấy xúc tu?',
        choices: [{ text: '2 xúc tu', icon: numberIcon(2, '#9fb4c8', draw.octopus) }, { text: '8 xúc tu', icon: numberIcon(8, '#ff7aa2', draw.octopus) }, { text: '4 xúc tu', icon: numberIcon(4, '#52c5ee', draw.octopus) }],
        answer: 1, hint: 'Gợi ý: nhiều hơn số ngón của một bàn tay, nhưng ít hơn hai bàn tay!',
        explain: 'Tuyệt! Bạch tuộc có 8 xúc tu và 3 quả tim.', cardId: 'oc_octopus' },
      { id: 'q_oc_whale', areaId: 'ocean', question: 'Con vật nào to nhất đang sống ngày nay?',
        choices: [{ text: 'Cá voi xanh', icon: I.whale }, { text: 'Khủng long T-rex', icon: I.trex }, { text: 'Bạch tuộc', icon: I.octopus }],
        answer: 0, hint: 'Gợi ý: nó sống dưới biển và phải ngoi lên mặt nước để thở!',
        explain: 'Đúng vậy! Cá voi xanh là con vật to nhất đang sống ngày nay.', cardId: 'oc_whale' },

      { id: 'q_sp_sun', areaId: 'space', question: 'Mặt Trời thật ra là gì?',
        choices: [{ text: 'Một ngôi sao', icon: I.star }, { text: 'Một bóng đèn to', icon: I.bulb }],
        answer: 0, hint: 'Gợi ý: nhiều đốm sáng lấp lánh ban đêm cũng giống nó, chỉ là ở rất xa!',
        explain: 'Chính xác! Mặt Trời là ngôi sao ở gần Trái Đất nhất.', cardId: 'sp_sun' },
      { id: 'q_sp_moon', areaId: 'space', question: 'Vì sao Mặt Trăng sáng?',
        choices: [{ text: 'Có bóng đèn bên trong', icon: I.bulb }, { text: 'Phản chiếu ánh Mặt Trời', icon: I.moon }],
        answer: 1, hint: 'Gợi ý: Mặt Trăng giống như một chiếc gương, nhận ánh sáng từ nơi khác.',
        explain: 'Giỏi lắm! Mặt Trăng phản chiếu ánh sáng của Mặt Trời.', cardId: 'sp_moon' },
      { id: 'q_sp_planets', areaId: 'space', question: 'Chúng ta sống trên hành tinh nào?',
        choices: [{ text: 'Sao Mộc', icon: I.jupiter }, { text: 'Mặt Trăng', icon: I.moonPlanet }, { text: 'Trái Đất', icon: I.earth }],
        answer: 2, hint: 'Gợi ý: hành tinh thứ ba, có biển xanh và cây cối!',
        explain: 'Đúng rồi! Trái Đất là ngôi nhà xanh của chúng ta.', cardId: 'sp_planets' }
    ],

    comics: {
      // ---------------- Mở đầu ----------------
      intro: [
        { bg: 'science-lab',
          chars: [{ id: 'robot', anim: 'wave', x: 0.3 }, { id: 'oggy', anim: 'idle', x: 0.7, face: -1 }],
          bubbles: [{ who: 'robot', text: 'Bíp bíp! Chào Oggy! Mình vừa chế xong cỗ máy thời gian!' }] },
        { bg: 'science-lab',
          chars: [{ id: 'oggy', anim: 'think', x: 0.62, face: -1 }, { id: 'robot', anim: 'point', x: 0.3 }],
          bubbles: [{ who: 'oggy', text: 'Wow! Nó đưa mình đi đâu được?' },
            { who: 'robot', text: 'Về thời khủng long, xuống biển sâu, lên cả vũ trụ!' }] },
        { bg: 'science-lab',
          chars: [{ id: 'joey', anim: 'run', x: 0.45 }, { id: 'marky', anim: 'run', x: 0.6 }, { id: 'deedee', anim: 'run', x: 0.76 }],
          bubbles: [{ who: 'joey', text: 'Hí hí! Cỗ máy xịn quá! Tụi mình đi chơi đây!' }],
          caption: 'Đúng lúc đó, ba chú gián tinh nghịch nhảy tót vào cỗ máy…' },
        { bg: 'science-lab',
          chars: [{ id: 'oggy', anim: 'hurt', x: 0.62, face: -1 }, { id: 'robot', anim: 'point', x: 0.3 }],
          bubbles: [{ who: 'robot', text: 'Ôi không! Họ bấm nút lung tung! Mau đuổi theo nào!' },
            { who: 'oggy', text: 'Chờ mình với! Mình chưa ăn xong bánh!' }],
          caption: 'VÈO! Cỗ máy biến mất. Cuộc phiêu lưu khoa học bắt đầu!' }
      ],

      // ---------------- Khu 1: Thời khủng long ----------------
      dino_intro: [
        { bg: 'science-dino',
          chars: [{ id: 'oggy', anim: 'idle', x: 0.35 }, { id: 'robot', anim: 'talk', x: 0.2 }],
          bubbles: [{ who: 'robot', text: 'Chúng ta về thời khủng long rồi! Cách đây hàng chục triệu năm!' }] },
        { bg: 'science-dino',
          chars: [{ id: 'oggy', anim: 'hurt', x: 0.35 }, { id: 'dino', anim: 'wave', x: 0.68, face: -1 }],
          bubbles: [{ who: 'dino', text: 'Xin chào! Mình là Khủng Long Con. Mình chỉ ăn lá cây thôi!' },
            { who: 'oggy', text: 'Phù… may quá! Mình cứ tưởng bạn muốn ăn mình!' }] }
      ],
      dino_dig: [
        { bg: 'science-dino',
          chars: [{ id: 'robot', anim: 'point', x: 0.3 }, { id: 'oggy', anim: 'think', x: 0.6, face: -1 }],
          bubbles: [{ who: 'robot', text: 'Nhìn kìa! Những khúc xương nằm trong đá. Đó là hoá thạch!' },
            { who: 'oggy', text: 'Xương già ơi là già! Già hơn cả ông nội mình!' }] }
      ],
      dino_outro: [
        { bg: 'science-dino',
          chars: [{ id: 'joey', anim: 'hurt', x: 0.5 }],
          bubbles: [{ who: 'joey', text: 'Ui da… mình chỉ muốn cưỡi khủng long thôi mà!' }] },
        { bg: 'science-dino',
          chars: [{ id: 'robot', anim: 'point', x: 0.3 }, { id: 'oggy', anim: 'idle', x: 0.6, face: -1 }],
          bubbles: [{ who: 'robot', text: 'Marky và Dee Dee lái cỗ máy đi rồi! Lần này… vào cơ thể người!' }] }
      ],

      // ---------------- Khu 2: Bên trong cơ thể ----------------
      body_intro: [
        { bg: 'science-body',
          chars: [{ id: 'robot', anim: 'talk', x: 0.25 }, { id: 'oggy', anim: 'idle', x: 0.45 }],
          caption: 'Cỗ máy thu nhỏ mọi người, rồi bay vào mô hình cơ thể khổng lồ ở bảo tàng!',
          bubbles: [{ who: 'robot', text: 'Ở đây có tim, phổi, xương, răng y như cơ thể thật!' }] },
        { bg: 'science-body',
          chars: [{ id: 'oggy', anim: 'think', x: 0.35 }, { id: 'blood_cell', anim: 'wave', x: 0.68, face: -1 }],
          bubbles: [{ who: 'oggy', text: 'Thình thịch, thình thịch… tiếng gì vậy?' },
            { who: 'blood_cell', text: 'Tiếng tim đập đó! Chào bạn, mình là Hồng Cầu!' }] }
      ],
      body_teeth: [
        { bg: 'science-body',
          chars: [{ id: 'oggy', anim: 'hurt', x: 0.4 }, { id: 'robot', anim: 'talk', x: 0.2 }],
          bubbles: [{ who: 'oggy', text: 'Răng to quá! Phải dùng bàn chải khổng lồ mất!' },
            { who: 'robot', text: 'Bíp! Đánh răng sáng và tối giúp răng chắc khoẻ đấy!' }] }
      ],
      body_outro: [
        { bg: 'science-body',
          chars: [{ id: 'marky', anim: 'hurt', x: 0.5 }],
          bubbles: [{ who: 'marky', text: 'Hắt xì! Thôi được rồi, mình chịu thua!' }] },
        { bg: 'science-body',
          chars: [{ id: 'robot', anim: 'point', x: 0.3 }, { id: 'oggy', anim: 'idle', x: 0.6, face: -1 }],
          bubbles: [{ who: 'robot', text: 'Dee Dee lái cỗ máy lặn xuống đại dương sâu rồi! Đuổi theo!' }] }
      ],

      // ---------------- Khu 3: Đại dương sâu ----------------
      ocean_intro: [
        { bg: 'science-ocean',
          chars: [{ id: 'robot', anim: 'talk', x: 0.25 }, { id: 'oggy', anim: 'idle', x: 0.5 }],
          caption: 'Ùm! Cỗ máy biến thành tàu ngầm, lặn xuống biển sâu.',
          bubbles: [{ who: 'robot', text: 'Càng xuống sâu, nước càng tối và càng lạnh.' }] },
        { bg: 'science-ocean',
          chars: [{ id: 'oggy', anim: 'point', x: 0.4 }],
          bubbles: [{ who: 'oggy', text: 'Ơ kìa! Con cá kia mang đèn pin trên đầu!' }] }
      ],
      ocean_whale: [
        { bg: sceneBg('science-ocean', 0, function (ctx, t) { I.whale(ctx, 700, 200 + Math.sin(t) * 8, 300, t); }),
          chars: [{ id: 'oggy', anim: 'victory', x: 0.4 }, { id: 'robot', anim: 'point', x: 0.2 }],
          bubbles: [{ who: 'oggy', text: 'Wow! Một chú cá voi xanh to ơi là to!' },
            { who: 'robot', text: 'Nó to hơn khủng long bạo chúa nhiều lần đấy!' }] }
      ],
      ocean_outro: [
        { bg: 'science-ocean',
          chars: [{ id: 'deedee', anim: 'hurt', x: 0.5 }],
          bubbles: [{ who: 'deedee', text: 'Thôi thôi, mình xin lỗi mà! Đừng giẫm nữa!' }] },
        { bg: 'science-ocean',
          chars: [{ id: 'joey', anim: 'run', x: 0.55 }, { id: 'marky', anim: 'run', x: 0.68 }, { id: 'deedee', anim: 'run', x: 0.82 }],
          caption: 'Nhưng cả ba chú gián lại chui vào cỗ máy… và phóng thẳng lên vũ trụ!' }
      ],

      // ---------------- Khu 4: Hệ Mặt Trời ----------------
      space_intro: [
        { bg: 'science-space',
          chars: [{ id: 'robot', anim: 'talk', x: 0.25 }, { id: 'oggy', anim: 'idle', x: 0.5 }],
          caption: 'Vút! Cỗ máy biến thành tên lửa, bay vào Hệ Mặt Trời.',
          bubbles: [{ who: 'robot', text: 'Ngoài vũ trụ không có không khí. Nhớ mặc đồ phi hành gia nhé!' }] },
        { bg: 'science-space',
          chars: [{ id: 'oggy', anim: 'jump', x: 0.45, y: 0.75 }],
          bubbles: [{ who: 'oggy', text: 'Trên Mặt Trăng, mình nhẹ tênh! Nhảy cao ghê!' }] }
      ],
      space_earth: [
        { bg: sceneBg('science-space', 0, function (ctx, t) { I.earth(ctx, 700, 220, 150, t); }),
          chars: [{ id: 'oggy', anim: 'point', x: 0.45 }, { id: 'robot', anim: 'talk', x: 0.25 }],
          bubbles: [{ who: 'oggy', text: 'Trái Đất kia rồi! Nhà mình ở dưới đó!' },
            { who: 'robot', text: 'Màu xanh là biển và đại dương đó!' }] }
      ],

      // ---------------- Kết thúc ----------------
      ending: [
        { bg: 'science-space',
          chars: [{ id: 'joey', anim: 'idle', x: 0.55 }, { id: 'marky', anim: 'idle', x: 0.68 }, { id: 'deedee', anim: 'idle', x: 0.82 }],
          bubbles: [{ who: 'joey', text: 'Tụi mình xin lỗi… tụi mình chỉ muốn ngắm các vì sao thôi.' }] },
        { bg: 'science-space',
          chars: [{ id: 'oggy', anim: 'talk', x: 0.3 }, { id: 'joey', anim: 'idle', x: 0.6, face: -1 }],
          bubbles: [{ who: 'oggy', text: 'Lần sau hãy hỏi trước nhé. Rồi mình cùng đi khám phá!' }] },
        { bg: 'science-lab',
          chars: [{ id: 'robot', anim: 'victory', x: 0.25 }, { id: 'oggy', anim: 'victory', x: 0.42 }, { id: 'joey', anim: 'victory', x: 0.6 }, { id: 'marky', anim: 'victory', x: 0.73 }, { id: 'deedee', anim: 'victory', x: 0.86 }],
          bubbles: [{ who: 'robot', text: 'Bíp! Khoa học vui nhất khi cùng nhau khám phá!' }],
          caption: 'Tối đó, cả nhóm cùng ngắm sao. Hẹn gặp lại ở chuyến phiêu lưu sau!' }
      ]
    }
  });
})();
