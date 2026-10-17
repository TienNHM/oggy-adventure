// @ts-check
/* ============================================================================
 * Hành trình "home" — NỘI DUNG HỌC: THẺ KIẾN THỨC, CÂU ĐỐ, TRUYỆN TRANH
 * ----------------------------------------------------------------------------
 * Vai trò:      Khai báo toàn bộ nội dung học của hành trình home (20 thẻ, 13 câu đố, các truyện tranh)
 *               kèm hình minh hoạ vẽ bằng canvas. OG.Learn mở thẻ / câu đố khi bé chạm trang sách / cổng;
 *               OG.Story chiếu truyện. Gọi OG.Journeys.register({ id: 'home', cards, quizzes, comics }) —
 *               được GỘP với phần khung trong journey.js.
 * Khái niệm:    data-driven design (nội dung là dữ liệu thuần) · tham chiếu chéo bằng id (thẻ ↔ câu đố ↔ màn) ·
 *               procedural drawing (vẽ thủ tục: hình tạo bằng lệnh Canvas 2D, không dùng ảnh) ·
 *               higher-order function (hàm nhận/trả hàm: icon(fn) bọc phần chuẩn hoá toạ độ)
 * Bài học:      docs/learn/12-data-driven-man-cau-do-hanh-trinh.md · docs/learn/07-ve-canvas-procedural-cache.md
 * Phụ thuộc:    OG.Journeys.register (LOAD) · OG.font (lúc CHẠY, khi vẽ chữ trong hình)
 * Event:        (không)
 * API công khai: (không) — chỉ đăng ký dữ liệu
 * Đọc tiếp:     src/journeys/home/journey.js (màn nào đặt trang sách / cổng nào) → src/story/learn.js (cách thẻ
 *               và câu đố được hiển thị) → src/core/journeys.js (validate kiểm tham chiếu id)
 * Dữ liệu:      CardDef, QuizDef, PanelDef, DrawIconFn, IconSpec (src/types.d.ts; đặc tả docs/STORY.md mục 2.3–2.5)
 *
 * 4 khu: kitchen (dinh dưỡng, vệ sinh, an toàn bếp) · garden (cây, côn trùng có ích, vòng tuần hoàn nước)
 *        roof (mây, mưa, cầu vồng, gió, Mặt Trời, Mặt Trăng) · basement (nam châm, điện an toàn, tái chế).
 * Câu chữ: ngắn, tích cực, chính xác (trẻ 5–10 tuổi). Mọi hình minh hoạ vẽ bằng canvas.
 * ========================================================================== */
(function () {
  'use strict';
  var OG = window.OG;
  var TAU = Math.PI * 2;
  var INK = '#17233d';   // màu viền "mực" chung của mọi hình (phong cách hoạt hình viền đậm)

  // ---------------------------------------------------------------------------
  // Bộ vẽ hình minh hoạ: mỗi hình vẽ trong ô 100×100, tâm (0,0).
  // icon(fn) -> drawIcon(ctx, x, y, size, t) đúng hợp đồng CardDef/IconSpec.
  // ---------------------------------------------------------------------------
  // 💡 Khái niệm: chuẩn hoá hệ toạ độ — mỗi hình chỉ cần vẽ trong ô 100×100 tâm (0,0); icon() dời gốc tới
  //   (x, y) và scale theo size, nên cùng một hình dùng được cho thẻ to (sổ tay) lẫn đáp án nhỏ (câu đố).
  //   ctx.save()/restore() lưu rồi khôi phục transform + màu, để hình này không "rò" trạng thái sang hình sau.
  /**
   * Bọc hàm vẽ cục bộ thành DrawIconFn đúng hợp đồng (x, y = tâm, size = cạnh ô, px).
   * @param {function(CanvasRenderingContext2D, number): void} fn  vẽ trong ô 100×100 tâm (0,0); nhận (ctx, t giây)
   * @returns {DrawIconFn}
   */
  function icon(fn) {
    return function (ctx, x, y, size, t) {
      ctx.save();
      ctx.translate(x, y);
      var k = (size || 100) / 100;
      ctx.scale(k, k);
      ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      fn(ctx, t || 0);
      ctx.restore();
    };
  }
  function rr(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  function fs(ctx, color, w) { ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = w || 4; ctx.stroke(); }
  function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }
  // Khuôn mặt nhỏ: mood 'o' = ngạc nhiên, 'sad' = buồn, 'sleep' = nhắm mắt.
  function face(ctx, x, y, s, mood) {
    ctx.save();
    ctx.strokeStyle = INK; ctx.fillStyle = INK; ctx.lineCap = 'round'; ctx.lineWidth = 2.4 * s;
    if (mood === 'sleep') {
      ctx.beginPath(); ctx.arc(x - 7 * s, y, 3.5 * s, 0.1, Math.PI - 0.1); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + 7 * s, y, 3.5 * s, 0.1, Math.PI - 0.1); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(x - 7 * s, y, 3 * s, 0, TAU); ctx.arc(x + 7 * s, y, 3 * s, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(x - 6 * s, y - 1 * s, 1.1 * s, 0, TAU); ctx.arc(x + 8 * s, y - 1 * s, 1.1 * s, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,120,150,0.55)';
    ctx.beginPath(); ctx.arc(x - 12 * s, y + 6 * s, 3 * s, 0, TAU); ctx.arc(x + 12 * s, y + 6 * s, 3 * s, 0, TAU); ctx.fill();
    ctx.beginPath();
    if (mood === 'o') { ctx.arc(x, y + 7 * s, 3 * s, 0, TAU); ctx.stroke(); }
    else if (mood === 'sad') { ctx.arc(x, y + 10 * s, 4.5 * s, Math.PI + 0.4, TAU - 0.4); ctx.stroke(); }
    else { ctx.arc(x, y + 4 * s, 5 * s, 0.25, Math.PI - 0.25); ctx.stroke(); }
    ctx.restore();
  }
  function star5(ctx, x, y, ro, ri) {
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var r = i % 2 ? ri : ro, a = i * Math.PI / 5 - Math.PI / 2;
      if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
  }
  function cloudPath(ctx, x, y, s) {
    ctx.beginPath();
    ctx.arc(x - 22 * s, y + 4 * s, 16 * s, Math.PI * 0.5, Math.PI * 1.5);
    ctx.arc(x - 4 * s, y - 10 * s, 20 * s, Math.PI, TAU);
    ctx.arc(x + 20 * s, y + 0 * s, 16 * s, Math.PI * 1.3, Math.PI * 0.5);
    ctx.closePath();
  }
  function drop(ctx, x, y, s, color) {
    ctx.beginPath();
    ctx.moveTo(x, y - 14 * s);
    ctx.quadraticCurveTo(x + 11 * s, y, x + 9 * s, y + 5 * s);
    ctx.arc(x, y + 5 * s, 9 * s, 0, Math.PI);
    ctx.quadraticCurveTo(x - 11 * s, y, x, y - 14 * s);
    ctx.closePath();
    fs(ctx, color || '#6cc6f2', 3 * s);
  }
  function sparkle(ctx, x, y, r, t) {
    var k = 0.6 + 0.4 * Math.sin(t * 5 + x);
    ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.25, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 0.25, 0); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(0, r * 0.25); ctx.lineTo(r, 0); ctx.lineTo(0, -r * 0.25); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  // Dấu X đỏ / dấu tích xanh nhỏ ở góc (cho lựa chọn "nên/không nên").
  function badge(ctx, ok) {
    ctx.save(); ctx.translate(30, -30);
    circle(ctx, 0, 0, 13); fs(ctx, ok ? '#55c96b' : '#ff5a5f', 3);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4;
    ctx.beginPath();
    if (ok) { ctx.moveTo(-6, 0); ctx.lineTo(-1, 5); ctx.lineTo(7, -5); } else { ctx.moveTo(-5, -5); ctx.lineTo(5, 5); ctx.moveTo(5, -5); ctx.lineTo(-5, 5); }
    ctx.stroke();
    ctx.restore();
  }

  // ---- NHÀ BẾP ----
  // Hình nào có hoạt ảnh thì dùng t (giây) trong Math.sin(t * k) — lặp mượt, không cần lưu trạng thái.
  var veggies = icon(function (ctx, t) {
    // cà rốt
    ctx.save(); ctx.translate(-22, 6); ctx.rotate(-0.35);
    ctx.fillStyle = '#55c96b';
    ctx.beginPath(); ctx.ellipse(-5, -38, 4, 11, -0.4, 0, TAU); ctx.ellipse(5, -38, 4, 11, 0.4, 0, TAU); fs(ctx, '#55c96b', 2.5);
    ctx.beginPath(); ctx.moveTo(-12, -28); ctx.quadraticCurveTo(0, -34, 12, -28); ctx.lineTo(0, 36); ctx.closePath(); fs(ctx, '#ff8c2e');
    face(ctx, 0, -14, 0.6);
    ctx.restore();
    // bông cải xanh
    ctx.beginPath(); ctx.moveTo(14, 40); ctx.lineTo(18, 8); ctx.lineTo(30, 8); ctx.lineTo(34, 40); ctx.closePath(); fs(ctx, '#8fdc6a', 3);
    ctx.beginPath(); ctx.arc(10, 0, 14, 0, TAU); ctx.arc(38, 0, 14, 0, TAU); ctx.arc(24, -14, 17, 0, TAU); fs(ctx, '#3fa34d', 3);
    ctx.fillStyle = '#3fa34d'; circle(ctx, 24, -2, 14); ctx.fill();
    face(ctx, 24, -6, 0.6);
    // cà chua
    circle(ctx, 2, 30, 15); fs(ctx, '#ff5a5f', 3);
    ctx.fillStyle = '#55c96b'; star5(ctx, 2, 16, 7, 3); ctx.fill();
    face(ctx, 2, 30, 0.45);
  });

  var waterGlass = icon(function (ctx, t) {
    ctx.beginPath(); ctx.moveTo(-28, -38); ctx.lineTo(28, -38); ctx.lineTo(22, 40); ctx.lineTo(-22, 40); ctx.closePath();
    ctx.fillStyle = 'rgba(220,242,255,0.9)'; ctx.fill();
    // 💡 Khái niệm: clip (cắt vùng vẽ) — mặt nước gợn sóng vẽ tràn ra ngoài, nhưng chỉ phần trong lòng cốc hiện.
    //   save() trước clip() để restore() gỡ vùng cắt; nét viền cốc vẽ lại sau đó, đè lên nước.
    ctx.save(); ctx.clip();
    var w = Math.sin(t * 3) * 3;
    ctx.fillStyle = '#6cc6f2';
    ctx.beginPath(); ctx.moveTo(-40, -10 + w); ctx.quadraticCurveTo(0, -18 - w, 40, -10 + w); ctx.lineTo(40, 50); ctx.lineTo(-40, 50); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(-28, -38); ctx.lineTo(28, -38); ctx.lineTo(22, 40); ctx.lineTo(-22, 40); ctx.closePath(); ctx.stroke();
    face(ctx, 0, 12, 0.9);
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(-20, -30, 6, 50);
    drop(ctx, 34, -36, 0.8);
  });

  var handwash = icon(function (ctx, t) {
    // hai bàn tay chắp lại đầy bọt xà phòng
    function hand(dx, rot) {
      ctx.save(); ctx.translate(dx, 10); ctx.rotate(rot);
      rr(ctx, -14, -30, 28, 46, 13); fs(ctx, '#ffd9b8', 3);
      for (var i = 0; i < 3; i++) { rr(ctx, -12 + i * 8, -44, 7, 20, 4); fs(ctx, '#ffd9b8', 2.5); }
      ctx.restore();
    }
    hand(-12, -0.25); hand(12, 0.25);
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#8fc9f0'; ctx.lineWidth = 2.5;
    var b = [[-30, -20, 9], [30, -16, 8], [-24, 26, 10], [26, 28, 9], [0, -46, 7], [-38, 4, 6], [38, 6, 6]];
    for (var i = 0; i < b.length; i++) {
      var r = b[i][2] + Math.sin(t * 4 + i) * 1.5;
      circle(ctx, b[i][0], b[i][1] - ((t * 10 + i * 7) % 8), r); ctx.fill(); ctx.stroke();
    }
    // bánh xà phòng mặt cười
    rr(ctx, -20, 30, 40, 18, 8); fs(ctx, '#ff8fb1', 3);
    face(ctx, 0, 37, 0.4);
  });

  var potSafe = icon(function (ctx, t) {
    // nồi trên bếp + găng tay người lớn + biển cảnh báo
    for (var i = -1; i <= 1; i++) {
      var k = (t * 0.8 + (i + 1) / 3) % 1;
      ctx.strokeStyle = 'rgba(160,175,200,' + (1 - k).toFixed(2) + ')'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(i * 14 - 4, -22 - k * 10); ctx.quadraticCurveTo(i * 14 + 6, -32 - k * 10, i * 14 - 4, -44 - k * 10); ctx.stroke();
    }
    rr(ctx, -38, -16, 64, 40, 10); fs(ctx, '#ff6b6b');
    rr(ctx, -44, -22, 76, 9, 4); fs(ctx, '#e5484d', 3);
    face(ctx, -6, 2, 0.8);
    rr(ctx, -46, 26, 84, 12, 4); fs(ctx, '#3d4a63', 3);
    // biển tam giác "!"
    ctx.save(); ctx.translate(30, -30);
    ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(18, 14); ctx.lineTo(-18, 14); ctx.closePath(); fs(ctx, '#ffd23f', 3);
    ctx.fillStyle = INK; ctx.font = OG.font(20, 'bold'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', 0, 3);
    ctx.restore();
  });

  var guava = icon(function (ctx, t) {
    // quả ổi nguyên + nửa quả ổi ruột hồng
    circle(ctx, -14, -2, 30); fs(ctx, '#9be15d');
    ctx.fillStyle = '#7cc84a'; circle(ctx, -24, -14, 5); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-10, -36, 10, 5, -0.5, 0, TAU); fs(ctx, '#3fa34d', 2.5);
    face(ctx, -14, 2, 0.8);
    ctx.save(); ctx.translate(26, 20);
    circle(ctx, 0, 0, 20); fs(ctx, '#9be15d', 3);
    circle(ctx, 0, 0, 15); ctx.fillStyle = '#ff9fb4'; ctx.fill();
    ctx.fillStyle = '#ffd9a8';
    for (var i = 0; i < 6; i++) { var a = i * TAU / 6; circle(ctx, Math.cos(a) * 8, Math.sin(a) * 8, 2.2); ctx.fill(); }
    ctx.restore();
    // huy hiệu "C" (vitamin C)
    circle(ctx, 30, -30, 13); fs(ctx, '#ff9f43', 3);
    ctx.fillStyle = '#ffffff'; ctx.font = OG.font(16, 'bold'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('C', 30, -29);
    sparkle(ctx, 44, -44, 7, t);
  });

  var lollipop = icon(function (ctx) {
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 46); ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.strokeRect(-4, 6, 8, 40);
    circle(ctx, 0, -12, 30); fs(ctx, '#ff8fb1');
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(0, -12, 18, 0, 4.5); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -12, 8, 1, 5.5); ctx.stroke();
  });

  var cookie = icon(function (ctx) {
    circle(ctx, 0, 0, 34); fs(ctx, '#d9945a');
    ctx.fillStyle = '#6b3f22';
    var c = [[-14, -12], [12, -16], [16, 10], [-10, 14], [0, -2], [-22, 4]];
    for (var i = 0; i < c.length; i++) { circle(ctx, c[i][0], c[i][1], 4); ctx.fill(); }
  });

  var ball = icon(function (ctx, t) {
    ctx.save(); ctx.translate(0, Math.abs(Math.sin(t * 3)) * -6);
    // bóng bãi biển: 6 múi màu
    var cols = ['#ff5a5f', '#ffffff', '#ffd23f', '#ffffff', '#4fb3e8', '#ffffff'];
    for (var i = 0; i < 6; i++) {
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 32, t + i * TAU / 6, t + (i + 1) * TAU / 6); ctx.closePath();
      ctx.fillStyle = cols[i]; ctx.fill();
    }
    circle(ctx, 0, 0, 32); ctx.stroke();
    circle(ctx, 0, 0, 7); fs(ctx, '#ffffff', 3);
    ctx.restore();
  });

  var tv = icon(function (ctx) {
    ctx.beginPath(); ctx.moveTo(-14, -34); ctx.lineTo(0, -22); ctx.lineTo(14, -38); ctx.stroke();
    rr(ctx, -40, -24, 80, 56, 10); fs(ctx, '#7b6cf0');
    rr(ctx, -32, -16, 52, 40, 6); fs(ctx, '#bfe9ff', 3);
    face(ctx, -6, 2, 0.7);
    circle(ctx, 30, -6, 4); fs(ctx, '#ffd23f', 2);
    rr(ctx, -26, 32, 10, 8, 2); fs(ctx, '#3d4a63', 2); rr(ctx, 16, 32, 10, 8, 2); fs(ctx, '#3d4a63', 2);
  });

  // Người lớn giúp: bàn tay to nắm bàn tay nhỏ + trái tim.
  var helpingHands = icon(function (ctx, t) {
    ctx.save(); ctx.translate(-8, 8); ctx.rotate(-0.3);
    rr(ctx, -40, -14, 60, 34, 16); fs(ctx, '#f2c29b');
    ctx.restore();
    ctx.save(); ctx.translate(16, 4); ctx.rotate(0.3);
    rr(ctx, -12, -12, 36, 24, 12); fs(ctx, '#ffd9b8', 3);
    ctx.restore();
    var s = 1 + Math.max(0, Math.sin(t * 5)) * 0.1;
    ctx.save(); ctx.translate(4, -30); ctx.scale(s, s);
    ctx.beginPath(); ctx.moveTo(0, 12); ctx.bezierCurveTo(-18, 0, -12, -16, 0, -6); ctx.bezierCurveTo(12, -16, 18, 0, 0, 12); fs(ctx, '#ff5a6e', 3);
    ctx.restore();
    // mũ đầu bếp nhỏ (người lớn nấu ăn)
    ctx.save(); ctx.translate(-30, -30);
    ctx.beginPath(); ctx.arc(-6, 0, 8, Math.PI * 0.6, Math.PI * 1.7); ctx.arc(2, -6, 9, Math.PI, TAU); ctx.arc(9, 0, 8, Math.PI * 1.3, Math.PI * 0.4); ctx.closePath(); fs(ctx, '#ffffff', 2.5);
    rr(ctx, -9, 4, 18, 8, 2); fs(ctx, '#ffffff', 2.5);
    ctx.restore();
  });

  // Tự bật bếp một mình: núm bếp + ngọn lửa lo lắng + dấu X.
  var stoveAlone = icon(function (ctx, t) {
    rr(ctx, -40, 18, 80, 22, 6); fs(ctx, '#3d4a63');
    var f = Math.sin(t * 8) * 3;
    ctx.beginPath(); ctx.moveTo(0, -30 + f); ctx.quadraticCurveTo(22, -6, 14, 14); ctx.lineTo(-14, 14); ctx.quadraticCurveTo(-22, -6, 0, -30 + f); ctx.closePath(); fs(ctx, '#ff9f43');
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.quadraticCurveTo(10, 2, 6, 14); ctx.lineTo(-6, 14); ctx.quadraticCurveTo(-10, 2, 0, -10); ctx.closePath(); ctx.fillStyle = '#ffd23f'; ctx.fill();
    face(ctx, 0, -2, 0.55, 'o');
    badge(ctx, false);
  });

  // ---- KHU VƯỜN ----
  var leafSun = icon(function (ctx, t) {
    // chiếc lá "nhà bếp tí hon": nắng + nước -> thức ăn, nhả ô-xy
    ctx.save(); ctx.translate(-6, 10); ctx.rotate(-0.5);
    ctx.beginPath(); ctx.moveTo(-36, 0); ctx.quadraticCurveTo(0, -38, 36, 0); ctx.quadraticCurveTo(0, 38, -36, 0); ctx.closePath(); fs(ctx, '#55c96b');
    ctx.strokeStyle = '#2f8a3a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-34, 0); ctx.lineTo(30, 0); ctx.stroke();
    ctx.restore();
    face(ctx, -6, 6, 0.75);
    // mặt trời nhỏ
    ctx.save(); ctx.translate(30, -30); ctx.rotate(t * 0.5);
    ctx.fillStyle = '#ffcf3f';
    for (var i = 0; i < 8; i++) { ctx.rotate(TAU / 8); ctx.fillRect(-2, -20, 4, 7); }
    ctx.restore();
    circle(ctx, 30, -30, 11); fs(ctx, '#ffd84a', 3);
    // bong bóng ô-xy
    ctx.strokeStyle = '#4fb3e8'; ctx.lineWidth = 2.5;
    for (var b = 0; b < 3; b++) { var k = (t * 0.6 + b / 3) % 1; circle(ctx, -36 + b * 8, -10 - k * 34, 4 + b); ctx.stroke(); }
  });

  var sprout = icon(function (ctx, t) {
    var g = 0.9 + Math.sin(t * 2) * 0.05;
    ctx.save(); ctx.translate(0, 6); ctx.scale(g, g);
    ctx.strokeStyle = '#3f9a45'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(0, -26); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-14, -30, 14, 7, -0.5, 0, TAU); fs(ctx, '#7ed957', 3);
    ctx.beginPath(); ctx.ellipse(14, -34, 14, 7, 0.5, 0, TAU); fs(ctx, '#7ed957', 3);
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(-34, 10); ctx.lineTo(34, 10); ctx.lineTo(26, 46); ctx.lineTo(-26, 46); ctx.closePath(); fs(ctx, '#e8875a');
    rr(ctx, -38, 4, 76, 10, 4); fs(ctx, '#d9744a', 3);
    face(ctx, 0, 26, 0.7);
    // hạt mầm nhỏ xíu bên cạnh
    ctx.beginPath(); ctx.ellipse(36, 34, 6, 4, 0.4, 0, TAU); fs(ctx, '#c98b52', 2);
    drop(ctx, -36, -26, 0.6);
  });

  var bee = icon(function (ctx, t) {
    var fl = Math.abs(Math.sin(t * 14));
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.ellipse(-8, -26, 12, 18 * (0.6 + fl * 0.4), -0.4, 0, TAU); fs(ctx, 'rgba(255,255,255,0.9)', 3);
    ctx.beginPath(); ctx.ellipse(10, -26, 12, 18 * (0.6 + fl * 0.4), 0.4, 0, TAU); fs(ctx, 'rgba(255,255,255,0.9)', 3);
    ctx.beginPath(); ctx.ellipse(4, 2, 32, 24, 0, 0, TAU); fs(ctx, '#ffd23f');
    ctx.save(); ctx.beginPath(); ctx.ellipse(4, 2, 32, 24, 0, 0, TAU); ctx.clip();
    ctx.fillStyle = INK; ctx.fillRect(0, -30, 8, 60); ctx.fillRect(18, -30, 8, 60);
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(36, 2); ctx.lineTo(46, 2); ctx.stroke();
    circle(ctx, -26, 0, 15); fs(ctx, '#ffd23f', 3);
    ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-30, -14); ctx.quadraticCurveTo(-36, -26, -40, -26); ctx.moveTo(-22, -14); ctx.quadraticCurveTo(-20, -26, -14, -28); ctx.stroke();
    face(ctx, -26, -2, 0.5);
    // phấn hoa vàng rơi rắc
    ctx.fillStyle = '#ffb703';
    for (var i = 0; i < 4; i++) { circle(ctx, -10 + i * 9, 34 + ((t * 20 + i * 5) % 12), 2.5); ctx.fill(); }
  });

  var ladybug = icon(function (ctx, t) {
    ctx.save(); ctx.translate(0, 4); ctx.rotate(Math.sin(t * 2) * 0.05);
    ctx.strokeStyle = INK; ctx.lineWidth = 3;
    for (var i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(-26, i * 14); ctx.lineTo(-38, i * 18); ctx.moveTo(26, i * 14); ctx.lineTo(38, i * 18); ctx.stroke(); }
    circle(ctx, 0, 6, 32); fs(ctx, '#e5484d');
    ctx.beginPath(); ctx.moveTo(0, -26); ctx.lineTo(0, 38); ctx.stroke();
    ctx.fillStyle = INK;
    var d = [[-14, -6], [14, -6], [-18, 16], [18, 16], [-7, 28], [7, 28]];
    for (var k = 0; k < d.length; k++) { circle(ctx, d[k][0], d[k][1], 5); ctx.fill(); }
    ctx.beginPath(); ctx.arc(0, -24, 16, Math.PI, TAU); ctx.closePath(); fs(ctx, '#2b2f3a', 3);
    ctx.fillStyle = '#ffffff'; circle(ctx, -6, -30, 3.5); ctx.fill(); circle(ctx, 6, -30, 3.5); ctx.fill();
    ctx.fillStyle = INK; circle(ctx, -6, -30, 1.8); ctx.fill(); circle(ctx, 6, -30, 1.8); ctx.fill();
    ctx.restore();
  });

  var waterCycle = icon(function (ctx, t) {
    // vòng tròn mũi tên: nắng -> bốc hơi -> mây -> mưa
    ctx.strokeStyle = '#4fb3e8'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(0, 4, 34, 0.3 + t, 2.6 + t); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 4, 34, 3.4 + t, 5.7 + t); ctx.stroke();
    function head(a) {
      var x = Math.cos(a) * 34, y = 4 + Math.sin(a) * 34;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a + Math.PI / 2);
      ctx.fillStyle = '#4fb3e8'; ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-4, -7); ctx.lineTo(-4, 7); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    head(2.6 + t); head(5.7 + t);
    cloudPath(ctx, 0, -28, 0.7); fs(ctx, '#ffffff', 3);
    face(ctx, 0, -28, 0.4);
    drop(ctx, 0, 6, 0.9);
    face(ctx, 0, 9, 0.3);
    circle(ctx, 34, 34, 9); fs(ctx, '#ffd84a', 3);
  });

  var sunIcon = icon(function (ctx, t) {
    ctx.save(); ctx.rotate(t * 0.4);
    ctx.fillStyle = '#ffcf3f';
    for (var i = 0; i < 12; i++) { ctx.rotate(TAU / 12); ctx.beginPath(); ctx.moveTo(-6, -30); ctx.lineTo(0, -46); ctx.lineTo(6, -30); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    circle(ctx, 0, 0, 28); fs(ctx, '#ffd84a');
    face(ctx, 0, 2, 1);
  });

  var darkness = icon(function (ctx, t) {
    rr(ctx, -42, -36, 84, 72, 14); fs(ctx, '#2b2f5a');
    ctx.fillStyle = '#ffe066';
    star5(ctx, -24, -18, 6, 2.5); ctx.fill(); star5(ctx, 26, -22, 5, 2); ctx.fill(); star5(ctx, 22, 20, 4, 1.8); ctx.fill();
    ctx.fillStyle = '#ffffff'; circle(ctx, -6, 6, 5); ctx.fill(); circle(ctx, 10, 6, 5); ctx.fill();
    ctx.fillStyle = INK; circle(ctx, -5, 7, 2.5); ctx.fill(); circle(ctx, 11, 7, 2.5); ctx.fill();
  });

  var rock = icon(function (ctx) {
    ctx.beginPath(); ctx.moveTo(-40, 30); ctx.quadraticCurveTo(-42, -10, -16, -24); ctx.quadraticCurveTo(10, -34, 30, -14); ctx.quadraticCurveTo(46, 6, 40, 30); ctx.closePath(); fs(ctx, '#a3a9b8');
    ctx.fillStyle = '#c4c9d4'; ctx.beginPath(); ctx.ellipse(-12, -12, 10, 5, -0.4, 0, TAU); ctx.fill();
    face(ctx, 0, 6, 0.8, 'sleep');
  });

  var boot = icon(function (ctx) {
    ctx.beginPath(); ctx.moveTo(-26, -40); ctx.lineTo(8, -40); ctx.lineTo(8, 4); ctx.quadraticCurveTo(40, 6, 40, 28); ctx.lineTo(40, 38); ctx.lineTo(-26, 38); ctx.closePath(); fs(ctx, '#ffd23f');
    rr(ctx, -30, 30, 74, 12, 5); fs(ctx, '#3d4a63', 3);
    face(ctx, -8, -8, 0.7);
  });

  var cloudIcon = icon(function (ctx, t) {
    cloudPath(ctx, 0, -6, 1.3); fs(ctx, '#ffffff');
    face(ctx, 0, -4, 0.9);
  });

  var starIcon = icon(function (ctx, t) {
    star5(ctx, 0, 0, 38 + Math.sin(t * 3) * 2, 17); fs(ctx, '#ffe066');
    face(ctx, 0, 4, 0.8);
  });

  // ---- MÁI NHÀ ----
  var rainCloud = icon(function (ctx, t) {
    for (var i = 0; i < 4; i++) {
      var k = (t * 1.2 + i / 4) % 1;
      drop(ctx, -24 + i * 16, 14 + k * 28, 0.55);
    }
    cloudPath(ctx, 0, -14, 1.25); fs(ctx, '#dbe7f5');
    face(ctx, 0, -12, 0.85);
  });

  var COLORS7 = ['#ff5a5f', '#ff9f43', '#ffd84a', '#55c96b', '#4fb3e8', '#4b5fd1', '#9b6ae0'];
  // Cầu vồng n dải (dùng cho thẻ và đáp án "7 màu / 3 màu / 1 màu").
  function rainbowIcon(n) {
    var cols = n === 7 ? COLORS7 : n === 3 ? ['#ff5a5f', '#55c96b', '#4b5fd1'] : ['#4fb3e8'];
    return icon(function (ctx) {
      var band = 6, R = 46; // 7 dải × 6 px: bán kính trong vẫn dương
      for (var i = 0; i < cols.length; i++) {
        ctx.strokeStyle = cols[i]; ctx.lineWidth = band + 1; ctx.lineCap = 'butt';
        ctx.beginPath(); ctx.arc(0, 26, R - i * band, Math.PI, TAU); ctx.stroke();
      }
      ctx.strokeStyle = INK; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 26, R + band / 2 + 1, Math.PI, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 26, Math.max(2, R - cols.length * band + band / 2), Math.PI, TAU); ctx.stroke();
      cloudPath(ctx, -38, 30, 0.6); fs(ctx, '#ffffff', 3);
      cloudPath(ctx, 38, 30, 0.6); fs(ctx, '#ffffff', 3);
      if (n !== 7) return;
      face(ctx, 0, 14, 0.6);
    });
  }
  var rainbow7 = rainbowIcon(7), rainbow3 = rainbowIcon(3), rainbow1 = rainbowIcon(1);

  var pinwheel = icon(function (ctx, t) {
    ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 48); ctx.stroke();
    var cols = ['#ff5a5f', '#ffd84a', '#4fb3e8', '#55c96b'];
    ctx.save(); ctx.translate(0, -6); ctx.rotate(t * 3);
    for (var i = 0; i < 4; i++) {
      ctx.rotate(TAU / 4);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -34); ctx.quadraticCurveTo(22, -26, 0, 0); ctx.closePath(); fs(ctx, cols[i], 3);
    }
    ctx.restore();
    circle(ctx, 0, -6, 5); fs(ctx, '#ffffff', 2);
    // vệt gió
    ctx.strokeStyle = '#8fc9f0'; ctx.lineWidth = 3;
    for (var w = 0; w < 3; w++) { var x = -46 + ((t * 30 + w * 12) % 20); ctx.beginPath(); ctx.moveTo(x, -30 + w * 16); ctx.quadraticCurveTo(x + 8, -36 + w * 16, x + 16, -30 + w * 16); ctx.stroke(); }
  });

  var sunStar = icon(function (ctx, t) {
    // Mặt Trời là một ngôi sao: mặt trời cười có kính râm (đừng nhìn thẳng!)
    ctx.save(); ctx.rotate(t * 0.4);
    ctx.fillStyle = '#ff9f43';
    for (var i = 0; i < 10; i++) { ctx.rotate(TAU / 10); ctx.beginPath(); ctx.moveTo(-7, -28); ctx.lineTo(0, -46); ctx.lineTo(7, -28); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    circle(ctx, 0, 0, 28); fs(ctx, '#ffd84a');
    rr(ctx, -20, -10, 17, 11, 4); fs(ctx, INK, 2); rr(ctx, 3, -10, 17, 11, 4); fs(ctx, INK, 2);
    ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-3, -6); ctx.lineTo(3, -6); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 8, 8, 0.2, Math.PI - 0.2); ctx.stroke();
    ctx.fillStyle = '#ffffff'; star5(ctx, 34, -34, 8, 3.5); ctx.fill(); star5(ctx, -36, 32, 6, 2.6); ctx.fill();
  });

  var moon = icon(function (ctx, t) {
    // trăng ngái ngủ + tia nắng từ Mặt Trời chiếu tới
    ctx.strokeStyle = '#ffcf3f'; ctx.lineWidth = 3;
    for (var i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-46, -30 + i * 10); ctx.lineTo(-24, -20 + i * 8); ctx.stroke(); }
    circle(ctx, -44, -36, 8); fs(ctx, '#ffd84a', 2.5);
    circle(ctx, 8, 6, 34); fs(ctx, '#fff4c2');
    ctx.fillStyle = 'rgba(214,200,140,0.6)';
    circle(ctx, -8, -12, 7); ctx.fill(); circle(ctx, 24, 22, 6); ctx.fill(); circle(ctx, 26, -10, 4); ctx.fill();
    face(ctx, 8, 8, 0.9, 'sleep');
  });

  var bulb = icon(function (ctx, t) {
    ctx.fillStyle = 'rgba(255,230,120,0.35)'; circle(ctx, 0, -8, 40); ctx.fill();
    circle(ctx, 0, -10, 28); fs(ctx, '#fff1a0');
    rr(ctx, -14, 14, 28, 10, 3); fs(ctx, '#a3a9b8', 3);
    rr(ctx, -12, 24, 24, 10, 3); fs(ctx, '#8a93a6', 3);
    ctx.strokeStyle = '#ff9f43'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-8, 10); ctx.lineTo(-4, -6); ctx.lineTo(0, 4); ctx.lineTo(4, -6); ctx.lineTo(8, 10); ctx.stroke();
    face(ctx, 0, -16, 0.6, 'o');
  });

  var cottonCandy = icon(function (ctx) {
    ctx.strokeStyle = '#c98b52'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(0, 46); ctx.stroke();
    cloudPath(ctx, 0, -12, 1.2); fs(ctx, '#ffb3d1');
    ctx.fillStyle = '#ffd6e7'; circle(ctx, -10, -20, 6); ctx.fill(); circle(ctx, 12, -10, 5); ctx.fill();
  });

  // ---- TẦNG HẦM ----
  function horseshoe(ctx, x, y, s, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0); ctx.scale(s, s);
    ctx.lineCap = 'butt';
    ctx.strokeStyle = INK; ctx.lineWidth = 26;
    ctx.beginPath(); ctx.arc(0, 0, 22, Math.PI, TAU); ctx.lineTo(22, 26); ctx.moveTo(-22, 0); ctx.lineTo(-22, 26); ctx.stroke();
    ctx.lineWidth = 19;
    ctx.strokeStyle = '#ff5a5f'; ctx.beginPath(); ctx.arc(0, 0, 22, Math.PI, TAU); ctx.lineTo(22, 12); ctx.moveTo(-22, 0); ctx.lineTo(-22, 12); ctx.stroke();
    ctx.strokeStyle = '#e9eef5'; ctx.beginPath(); ctx.moveTo(-22, 12); ctx.lineTo(-22, 25); ctx.moveTo(22, 12); ctx.lineTo(22, 25); ctx.stroke();
    face(ctx, 0, -22, 0.5);
    ctx.restore();
  }
  function paperclipShape(ctx, x, y, s, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0); ctx.scale(s, s);
    ctx.strokeStyle = '#7a8aa0'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(4, 14); ctx.lineTo(4, -12); ctx.arc(0, -12, 4, 0, Math.PI, true); ctx.lineTo(-4, 16); ctx.arc(1, 16, 5, Math.PI, 0, true); ctx.lineTo(6, -16); ctx.stroke();
    ctx.restore();
  }
  var magnet = icon(function (ctx, t) {
    horseshoe(ctx, -4, -14, 1, 0);
    for (var i = 0; i < 3; i++) {
      var k = (Math.sin(t * 3 + i) + 1) / 2;
      paperclipShape(ctx, -24 + i * 22, 34 - k * 6, 1, (i - 1) * 0.3);
    }
    ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-34, 18); ctx.lineTo(-40, 12); ctx.moveTo(26, 18); ctx.lineTo(32, 12); ctx.stroke();
  });

  function barMagnet(ctx, x, y, flip) {
    ctx.save(); ctx.translate(x, y);
    rr(ctx, -30, -11, 30, 22, 4); fs(ctx, flip ? '#4fb3e8' : '#ff5a5f', 3);
    rr(ctx, 0, -11, 30, 22, 4); fs(ctx, flip ? '#ff5a5f' : '#4fb3e8', 3);
    ctx.fillStyle = '#ffffff'; ctx.font = OG.font(14, 'bold'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(flip ? 'S' : 'N', -15, 1); ctx.fillText(flip ? 'N' : 'S', 15, 1);
    ctx.restore();
  }
  var magnetPoles = icon(function (ctx, t) {
    // trên: S–N hút nhau (tim); dưới: S–S đẩy nhau (vệt bật ra)
    var j = Math.sin(t * 4) * 2;
    ctx.scale(0.72, 0.72); ctx.translate(-9, 0); // vừa khung 100×100
    barMagnet(ctx, -22 + j, -22, false); barMagnet(ctx, 40 - j, -22, false);
    ctx.fillStyle = '#ff5a6e'; ctx.beginPath(); ctx.moveTo(9, -34); ctx.bezierCurveTo(1, -40, 3, -48, 9, -44); ctx.bezierCurveTo(15, -48, 17, -40, 9, -34); ctx.fill();
    barMagnet(ctx, -30 - j, 22, false); barMagnet(ctx, 48 + j, 22, true);
    ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(4, 14); ctx.lineTo(10, 22); ctx.lineTo(4, 30); ctx.moveTo(14, 14); ctx.lineTo(8, 22); ctx.lineTo(14, 30); ctx.stroke();
  });

  function socket(ctx, x, y, s, worried) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    rr(ctx, -30, -30, 60, 60, 12); fs(ctx, '#ffffff');
    circle(ctx, 0, 0, 20); fs(ctx, '#e9eef5', 3);
    ctx.fillStyle = INK; rr(ctx, -10, -8, 5, 12, 2); ctx.fill(); rr(ctx, 5, -8, 5, 12, 2); ctx.fill();
    ctx.lineWidth = 2.5; ctx.beginPath();
    if (worried) ctx.arc(0, 12, 4, Math.PI + 0.4, TAU - 0.4); else ctx.arc(0, 8, 5, 0.3, Math.PI - 0.3);
    ctx.stroke();
    ctx.restore();
  }
  var electricSafe = icon(function (ctx, t) {
    socket(ctx, -10, 4, 1, false);
    // tia điện nhỏ + khiên an toàn
    ctx.save(); ctx.translate(30, -28);
    ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(14, -10); ctx.quadraticCurveTo(14, 8, 0, 16); ctx.quadraticCurveTo(-14, 8, -14, -10); ctx.closePath(); fs(ctx, '#55c96b', 3);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-1, 5); ctx.lineTo(7, -5); ctx.stroke();
    ctx.restore();
    if (Math.sin(t * 6) > 0) {
      ctx.beginPath(); ctx.moveTo(-40, -30); ctx.lineTo(-30, -36); ctx.lineTo(-34, -26); ctx.lineTo(-24, -32); ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 3; ctx.stroke();
    }
  });

  var dryHands = icon(function (ctx) {
    // khăn lau tay + bàn tay khô + dấu tích
    rr(ctx, -40, -30, 46, 64, 8); fs(ctx, '#7fc8a9');
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-36, 20); ctx.lineTo(2, 20); ctx.moveTo(-36, 26); ctx.lineTo(2, 26); ctx.stroke();
    ctx.save(); ctx.translate(18, 8); ctx.rotate(0.2);
    rr(ctx, -14, -18, 28, 40, 12); fs(ctx, '#ffd9b8', 3);
    for (var i = 0; i < 3; i++) { rr(ctx, -12 + i * 8, -32, 7, 18, 4); fs(ctx, '#ffd9b8', 2.5); }
    ctx.restore();
    badge(ctx, true);
  });

  var stickSocket = icon(function (ctx) {
    socket(ctx, 8, 6, 0.95, true);
    ctx.save(); ctx.translate(-30, -18); ctx.rotate(0.7);
    rr(ctx, -4, -30, 8, 46, 3); fs(ctx, '#c98b52', 3);
    ctx.restore();
    badge(ctx, false);
  });

  var recycle = icon(function (ctx, t) {
    // chai nhựa + lon nhôm + vòng mũi tên tái chế
    ctx.save(); ctx.rotate(t * 0.6);
    ctx.strokeStyle = '#55c96b'; ctx.lineWidth = 6;
    for (var i = 0; i < 3; i++) {
      ctx.rotate(TAU / 3);
      ctx.beginPath(); ctx.arc(0, 0, 42, 0.15, 1.75); ctx.stroke();
      var a = 1.75, x = Math.cos(a) * 42, y = Math.sin(a) * 42;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a + Math.PI / 2);
      ctx.fillStyle = '#55c96b'; ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-4, -8); ctx.lineTo(-4, 8); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    rr(ctx, -26, -18, 22, 44, 8); fs(ctx, '#8fd6f7', 3);
    rr(ctx, -20, -26, 10, 9, 2); fs(ctx, '#3fbf6f', 2.5);
    face(ctx, -15, 2, 0.45);
    rr(ctx, 4, -10, 22, 36, 5); fs(ctx, '#d6dde8', 3);
    ctx.fillStyle = '#ff5a5f'; ctx.fillRect(6, 0, 18, 10);
    face(ctx, 15, 14, 0.4);
  });

  function binShape(ctx, x, y, color, symbol) {
    ctx.save(); ctx.translate(x, y);
    ctx.beginPath(); ctx.moveTo(-20, -26); ctx.lineTo(20, -26); ctx.lineTo(16, 34); ctx.lineTo(-16, 34); ctx.closePath(); fs(ctx, color, 3);
    rr(ctx, -24, -36, 48, 11, 4); fs(ctx, color, 3);
    face(ctx, 0, -6, 0.55);
    ctx.fillStyle = '#ffffff';
    if (symbol === 'leaf') { ctx.beginPath(); ctx.ellipse(0, 18, 5, 9, 0.6, 0, TAU); ctx.fill(); }
    else if (symbol === 'recycle') { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 18, 7, 0.4, 5.6); ctx.stroke(); }
    else { circle(ctx, 0, 18, 4); ctx.fill(); }
    ctx.restore();
  }
  var sortBins = icon(function (ctx, t) {
    var b = Math.sin(t * 3) * 2;
    binShape(ctx, -30, 8 + b, '#55c96b', 'leaf');
    binShape(ctx, 0, 8 - b, '#4fb3e8', 'recycle');
    binShape(ctx, 30, 8 + b, '#a3a9b8', 'other');
  });
  var binOrganic = icon(function (ctx, t) {
    binShape(ctx, 0, 6, '#55c96b', 'leaf');
    ctx.save(); ctx.translate(26, -34); ctx.rotate(0.3);
    ctx.beginPath(); ctx.ellipse(0, 0, 10, 6, 0, 0, TAU); fs(ctx, '#e8875a', 2.5);
    ctx.restore();
  });
  var binRecycle = icon(function (ctx) {
    binShape(ctx, 0, 6, '#4fb3e8', 'recycle');
    rr(ctx, 20, -46, 14, 26, 5); fs(ctx, '#8fd6f7', 2.5);
  });
  var bananaPeel = icon(function (ctx, t) {
    ctx.fillStyle = '#ffe066';
    for (var i = -1; i <= 1; i++) {
      ctx.save(); ctx.translate(i * 8, 10); ctx.rotate(i * 0.7);
      ctx.beginPath(); ctx.moveTo(-8, 0); ctx.quadraticCurveTo(-10, 26, 0, 34); ctx.quadraticCurveTo(10, 26, 8, 0); ctx.closePath(); fs(ctx, '#ffe066', 3);
      ctx.restore();
    }
    ctx.beginPath(); ctx.ellipse(0, -8, 16, 22, 0, 0, TAU); fs(ctx, '#ffd23f');
    rr(ctx, -4, -36, 8, 10, 3); fs(ctx, '#8a5a32', 2.5);
    face(ctx, 0, -8, 0.6);
  });
  var eraser = icon(function (ctx) {
    ctx.save(); ctx.rotate(-0.3);
    rr(ctx, -36, -18, 72, 36, 8); fs(ctx, '#ff8fb1');
    ctx.fillStyle = '#4fb3e8'; ctx.fillRect(4, -16, 30, 32);
    rr(ctx, -36, -18, 72, 36, 8); ctx.stroke();
    face(ctx, -14, -2, 0.7);
    ctx.restore();
  });
  var leaf = icon(function (ctx, t) {
    ctx.save(); ctx.rotate(-0.6 + Math.sin(t * 2) * 0.1);
    ctx.beginPath(); ctx.moveTo(-40, 0); ctx.quadraticCurveTo(0, -36, 40, 0); ctx.quadraticCurveTo(0, 36, -40, 0); ctx.closePath(); fs(ctx, '#ff9f43');
    ctx.strokeStyle = '#c66a1e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-44, 0); ctx.lineTo(34, 0); ctx.stroke();
    ctx.restore();
    face(ctx, 0, 0, 0.7);
  });
  var paperclips = icon(function (ctx) {
    paperclipShape(ctx, -14, 0, 1.6, -0.3);
    paperclipShape(ctx, 16, 4, 1.6, 0.4);
  });
  var riverTrash = icon(function (ctx, t) {
    ctx.fillStyle = '#6cc6f2';
    ctx.beginPath(); ctx.moveTo(-46, 10);
    for (var x = -46; x <= 46; x += 8) ctx.lineTo(x, 10 + Math.sin(x / 8 + t * 3) * 3);
    ctx.lineTo(46, 44); ctx.lineTo(-46, 44); ctx.closePath(); fs(ctx, '#6cc6f2', 3);
    ctx.save(); ctx.translate(0, 4); ctx.rotate(0.5);
    rr(ctx, -12, -20, 24, 36, 5); fs(ctx, '#d6dde8', 3);
    ctx.fillStyle = '#ff5a5f'; ctx.fillRect(-10, -8, 20, 10);
    ctx.restore();
    face(ctx, -26, 28, 0.5, 'sad');
    badge(ctx, false);
  });

  // ---------------------------------------------------------------------------
  // Đăng ký nội dung
  // ---------------------------------------------------------------------------
  // 💡 Khái niệm: cùng id 'home' với journey.js → OG.Journeys GỘP (cards/quizzes nối theo id, comics gộp khoá).
  //   Tách file theo vai trò: người viết nội dung chỉ sửa file này, người thiết kế màn sửa journey.js.
  OG.Journeys.register({
    id: 'home',

    // ---- THẺ KIẾN THỨC (20 thẻ, mỗi khu 5) ----
    // Mẫu CardDef: id duy nhất trong hành trình (được pages[].card và quiz.cardId tham chiếu), areaId = khu,
    // fact 1–2 câu (validate cảnh báo nếu quá dài), drawIcon = hình canvas (ưu tiên hơn icon).
    // 🧪 Thử: đổi id 'k_veggie' thành 'k_veggie2' rồi chạy node tests/smoke.js — validate báo lỗi
    //   "thẻ không tồn tại" ở pages[] của màn home-kitchen-1 (tham chiếu id bị gãy).
    cards: [
      // Nhà bếp
      { id: 'k_veggie', areaId: 'kitchen', title: 'Đĩa ăn cầu vồng', drawIcon: veggies,
        fact: 'Rau củ có nhiều vitamin và chất xơ giúp em lớn lên khoẻ mạnh. Đĩa ăn càng nhiều màu càng tốt!' },
      { id: 'k_water', areaId: 'kitchen', title: 'Uống đủ nước', drawIcon: waterGlass,
        fact: 'Hơn một nửa cơ thể em là nước! Uống nước đều đặn mỗi ngày giúp em tỉnh táo và khoẻ mạnh.' },
      { id: 'k_handwash', areaId: 'kitchen', title: 'Rửa tay sạch', drawIcon: handwash,
        fact: 'Rửa tay với xà phòng khoảng 20 giây sẽ đuổi bay vi khuẩn. Hãy rửa tay trước khi ăn và sau khi đi vệ sinh nhé!' },
      { id: 'k_fruit', areaId: 'kitchen', title: 'Siêu sao vitamin C', drawIcon: guava,
        fact: 'Quả ổi có nhiều vitamin C hơn cả quả cam! Vitamin C giúp cơ thể khoẻ mạnh và vết xước mau lành.' },
      { id: 'k_hot', areaId: 'kitchen', title: 'An toàn trong bếp', drawIcon: potSafe,
        fact: 'Bếp, nồi nóng và dao sắc rất nguy hiểm. Muốn nấu ăn, em luôn nhờ người lớn giúp nhé!' },

      // Khu vườn
      { id: 'g_plant', areaId: 'garden', title: 'Lá cây tự nấu ăn', drawIcon: leafSun,
        fact: 'Lá cây dùng ánh nắng, nước và không khí để tự làm thức ăn. Cây còn nhả ra khí ô-xy cho chúng ta thở!' },
      { id: 'g_seed', areaId: 'garden', title: 'Hạt mầm tí hon', drawIcon: sprout,
        fact: 'Hạt cần nước, không khí và hơi ấm để nảy mầm. Cây non cần đất và nắng để lớn. Nhiều cây to lớn lên từ hạt nhỏ xíu!' },
      { id: 'g_bee', areaId: 'garden', title: 'Chú ong chăm chỉ', drawIcon: bee,
        fact: 'Ong bay từ hoa này sang hoa khác, mang theo phấn hoa giúp cây kết quả. Ong còn làm ra mật ngọt!' },
      { id: 'g_ladybug', areaId: 'garden', title: 'Bọ rùa chấm bi', drawIcon: ladybug,
        fact: 'Bọ rùa là bạn của nhà vườn. Một chú bọ rùa có thể ăn hàng nghìn con rệp hại cây trong đời!' },
      { id: 'g_water', areaId: 'garden', title: 'Vòng tuần hoàn nước', drawIcon: waterCycle,
        fact: 'Nắng làm nước bốc hơi bay lên. Gặp lạnh, hơi nước tụ thành mây. Mây đổ mưa, rồi nước lại bay lên. Cứ thế mãi!' },

      // Mái nhà
      { id: 'r_cloud', areaId: 'roof', title: 'Mây và mưa', drawIcon: rainCloud,
        fact: 'Mây là vô số giọt nước tí hon bay lơ lửng. Khi các giọt gộp lại to và nặng, chúng rơi xuống thành mưa!' },
      { id: 'r_wind', areaId: 'roof', title: 'Gió ở đâu ra?', drawIcon: pinwheel,
        fact: 'Gió là không khí đang chuyển động. Gió giúp diều bay cao và làm chong chóng quay tít!' },
      { id: 'r_rainbow', areaId: 'roof', title: 'Cầu vồng', drawIcon: rainbow7,
        fact: 'Ánh nắng đi qua giọt mưa thì tách ra 7 màu: đỏ, cam, vàng, lục, lam, chàm, tím. Đó là cầu vồng!' },
      { id: 'r_sun', areaId: 'roof', title: 'Mặt Trời là ngôi sao', drawIcon: sunStar,
        fact: 'Mặt Trời là một ngôi sao, gần chúng ta hơn mọi ngôi sao khác. Đừng bao giờ nhìn thẳng vào Mặt Trời nhé!' },
      { id: 'r_moon', areaId: 'roof', title: 'Mặt Trăng', drawIcon: moon,
        fact: 'Mặt Trăng không tự phát sáng mà phản chiếu ánh nắng Mặt Trời. Nó quay quanh Trái Đất khoảng một tháng một vòng.' },

      // Tầng hầm
      { id: 'b_magnet', areaId: 'basement', title: 'Nam châm kỳ diệu', drawIcon: magnet,
        fact: 'Nam châm hút được đồ bằng sắt như kẹp giấy, đinh sắt. Nhưng nó không hút gỗ, nhựa hay giấy đâu!' },
      { id: 'b_poles', areaId: 'basement', title: 'Hai cực nam châm', drawIcon: magnetPoles,
        fact: 'Mỗi nam châm có cực Bắc (N) và cực Nam (S). Hai cực khác nhau thì hút nhau, giống nhau thì đẩy nhau!' },
      { id: 'b_electric', areaId: 'basement', title: 'Điện an toàn', drawIcon: electricSafe,
        fact: 'Điện làm đèn sáng, quạt quay nhưng rất nguy hiểm. Không chạm vào ổ cắm và không cầm đồ điện khi tay ướt!' },
      { id: 'b_recycle', areaId: 'basement', title: 'Tái chế', drawIcon: recycle,
        fact: 'Chai nhựa, lon nhôm và giấy cũ có thể tái chế thành đồ mới. Lon nhôm tái chế được rất nhiều lần!' },
      { id: 'b_sort', areaId: 'basement', title: 'Phân loại rác', drawIcon: sortBins,
        fact: 'Chia rác làm 3 nhóm: rác hữu cơ (vỏ trái cây), rác tái chế (giấy, chai, lon) và rác còn lại.' }
    ],

    // ---- CÂU ĐỐ MỞ CỬA (13 câu; mỗi câu gắn với thẻ đã gặp trước đó) ----
    // Mẫu QuizDef: 2–3 choices CÓ HÌNH (bé chưa đọc giỏi), answer = chỉ số đáp án đúng (đếm từ 0),
    // hint hiện khi chọn sai, explain hiện khi đúng, cardId = thẻ được mở khoá nếu bé chưa nhặt.
    // ⚠️ Bẫy: thêm/bớt/đổi thứ tự choices mà quên sửa answer → đáp án "đúng" bị chấm sai.
    quizzes: [
      { id: 'q_wash', areaId: 'kitchen', cardId: 'k_handwash',
        question: 'Trước khi ăn cơm, em cần làm gì?',
        choices: [{ text: 'Rửa tay với xà phòng', icon: handwash }, { text: 'Chơi bóng', icon: ball }, { text: 'Xem ti vi', icon: tv }],
        answer: 0, hint: 'Gợi ý: có bọt xà phòng trắng xoá đuổi vi khuẩn đi!',
        explain: 'Đúng rồi! Tay sạch thì vi khuẩn không theo thức ăn vào bụng.' },
      { id: 'q_vitc', areaId: 'kitchen', cardId: 'k_fruit',
        question: 'Món nào có nhiều vitamin C hơn cả quả cam?',
        choices: [{ text: 'Kẹo mút', icon: lollipop }, { text: 'Quả ổi', icon: guava }, { text: 'Bánh quy', icon: cookie }],
        answer: 1, hint: 'Gợi ý: đó là một loại trái cây, vỏ xanh, ruột hồng hoặc trắng.',
        explain: 'Chính xác! Quả ổi là siêu sao vitamin C.' },
      { id: 'q_safe', areaId: 'kitchen', cardId: 'k_hot',
        question: 'Em muốn nấu mì. Em nên làm gì?',
        choices: [{ text: 'Tự bật bếp một mình', icon: stoveAlone }, { text: 'Nhờ người lớn giúp', icon: helpingHands }],
        answer: 1, hint: 'Gợi ý: bếp rất nóng, ai nên đứng cạnh em nhỉ?',
        explain: 'Tuyệt vời! Có người lớn giúp, vào bếp thật an toàn.' },

      { id: 'q_plant', areaId: 'garden', cardId: 'g_plant',
        question: 'Lá cây cần gì để tự làm thức ăn?',
        choices: [{ text: 'Ánh nắng', icon: sunIcon }, { text: 'Bóng tối', icon: darkness }, { text: 'Kẹo mút', icon: lollipop }],
        answer: 0, hint: 'Gợi ý: thứ này chiếu sáng từ trên trời mỗi ban ngày.',
        explain: 'Đúng rồi! Lá cây dùng ánh nắng, nước và không khí để làm thức ăn.' },
      { id: 'q_bee', areaId: 'garden', cardId: 'g_bee',
        question: 'Bạn nào giúp hoa kết thành quả?',
        choices: [{ text: 'Hòn đá', icon: rock }, { text: 'Chiếc ủng', icon: boot }, { text: 'Chú ong', icon: bee }],
        answer: 2, hint: 'Gợi ý: bạn ấy kêu "vo ve" và làm ra mật ngọt.',
        explain: 'Giỏi quá! Ong mang phấn hoa từ bông này sang bông khác.' },
      { id: 'q_water', areaId: 'garden', cardId: 'g_water',
        question: 'Nước bốc hơi bay lên trời sẽ tạo thành gì?',
        choices: [{ text: 'Ngôi sao', icon: starIcon }, { text: 'Đám mây', icon: cloudIcon }],
        answer: 1, hint: 'Gợi ý: nó trắng bông, trôi trên trời và có thể đổ mưa.',
        explain: 'Chính xác! Hơi nước tụ lại thành mây, rồi mây đổ mưa.' },

      { id: 'q_rain', areaId: 'roof', cardId: 'r_cloud',
        question: 'Giọt nước trong mây to và nặng thì sao?',
        choices: [{ text: 'Rơi xuống thành mưa', icon: rainCloud }, { text: 'Biến thành kẹo bông', icon: cottonCandy }],
        answer: 0, hint: 'Gợi ý: lúc đó em cần mang ô đấy!',
        explain: 'Đúng rồi! Giọt nước nặng rơi xuống thành mưa.' },
      { id: 'q_rainbow', areaId: 'roof', cardId: 'r_rainbow',
        question: 'Cầu vồng có mấy màu?',
        choices: [{ text: '1 màu', icon: rainbow1 }, { text: '3 màu', icon: rainbow3 }, { text: '7 màu', icon: rainbow7 }],
        answer: 2, hint: 'Gợi ý: đỏ, cam, vàng, lục, lam, chàm, tím. Đếm thử xem!',
        explain: 'Tuyệt! Cầu vồng có 7 màu rực rỡ.' },
      { id: 'q_moon', areaId: 'roof', cardId: 'r_moon',
        question: 'Vì sao Mặt Trăng sáng vào ban đêm?',
        choices: [{ text: 'Có bóng đèn bên trong', icon: bulb }, { text: 'Phản chiếu nắng Mặt Trời', icon: moon }],
        answer: 1, hint: 'Gợi ý: Mặt Trăng không tự phát sáng đâu. Ai chiếu sáng nó nhỉ?',
        explain: 'Chính xác! Mặt Trăng sáng nhờ ánh nắng Mặt Trời chiếu vào.' },

      { id: 'q_magnet', areaId: 'basement', cardId: 'b_magnet',
        question: 'Nam châm hút được vật nào?',
        choices: [{ text: 'Cục tẩy', icon: eraser }, { text: 'Chiếc lá', icon: leaf }, { text: 'Kẹp giấy bằng sắt', icon: paperclips }],
        answer: 2, hint: 'Gợi ý: nam châm thích đồ làm bằng sắt.',
        explain: 'Giỏi lắm! Kẹp giấy bằng sắt nên bị nam châm hút.' },
      { id: 'q_electric', areaId: 'basement', cardId: 'b_electric',
        question: 'Việc nào AN TOÀN với điện?',
        choices: [{ text: 'Lau khô tay, nhờ người lớn', icon: dryHands }, { text: 'Chọc que vào ổ cắm', icon: stickSocket }],
        answer: 0, hint: 'Gợi ý: không bao giờ đưa vật gì vào ổ cắm.',
        explain: 'Đúng rồi! Tay khô và có người lớn giúp mới an toàn.' },
      { id: 'q_recycle', areaId: 'basement', cardId: 'b_recycle',
        question: 'Lon nước ngọt đã uống hết, em làm gì?',
        choices: [{ text: 'Vứt xuống sông', icon: riverTrash }, { text: 'Bỏ vào thùng tái chế', icon: binRecycle }],
        answer: 1, hint: 'Gợi ý: lon nhôm có thể tái chế thành đồ mới!',
        explain: 'Tuyệt vời! Lon nhôm sẽ được tái chế thành đồ mới.' },
      { id: 'q_sort', areaId: 'basement', cardId: 'b_sort',
        question: 'Vỏ chuối nên bỏ vào thùng nào?',
        choices: [{ text: 'Thùng rác hữu cơ', icon: binOrganic }, { text: 'Thùng tái chế', icon: binRecycle }],
        answer: 0, hint: 'Gợi ý: vỏ chuối là vỏ trái cây, có thể ủ thành phân bón.',
        explain: 'Chính xác! Vỏ trái cây là rác hữu cơ, ủ thành phân bón cho cây.' }
    ],

    // ---- TRUYỆN TRANH ----
    // comics: { comicId: [PanelDef] }. Mẫu PanelDef: bg = id chủ đề cảnh nền | {theme, camX} (dời cảnh để đỡ
    // lặp) | 'color:#hex' | hàm vẽ; chars[].x, y là TỈ LỆ khung 0..1 (vị trí chân), không phải px;
    // bubbles[].who = charId của nhân vật có trong panel (bong bóng có đuôi chỉ vào) hoặc 'narrator'.
    comics: {
      // Mở đầu hành trình
      intro: [
        { bg: 'home-kitchen', chars: [{ id: 'oggy', anim: 'idle', x: 0.3 }, { id: 'olivia', anim: 'wave', x: 0.66, face: -1 }],
          bubbles: [{ who: 'olivia', text: 'Oggy ơi! Tặng bạn Cuốn Bách Khoa Kỳ Diệu. Mỗi trang là một điều bất ngờ!' },
                    { who: 'oggy', text: 'Ồ! Hình trong sách còn biết cười kìa!' }] },
        { bg: { theme: 'home-kitchen', camX: 400 }, chars: [{ id: 'joey', anim: 'point', x: 0.25 }, { id: 'marky', anim: 'think', x: 0.47 }, { id: 'deedee', anim: 'idle', x: 0.7 }],
          bubbles: [{ who: 'joey', text: 'Sách gì mà to thế? Mượn chơi tí nào!' },
                    { who: 'deedee', text: 'Trong đó có hình bánh kem không? Tớ đói!' }] },
        { bg: { theme: 'home-kitchen', camX: 200 }, chars: [{ id: 'oggy', anim: 'hurt', x: 0.25 }, { id: 'joey', anim: 'run', x: 0.55 }, { id: 'marky', anim: 'run', x: 0.7 }, { id: 'deedee', anim: 'run', x: 0.85 }],
          bubbles: [{ who: 'oggy', text: 'Á á! Trả sách cho tớ!' }],
          caption: 'Rẹt! Cả ba giành nhau, các trang sách bay tung khắp nhà!' },
        { bg: 'home-garden', chars: [{ id: 'oggy', anim: 'victory', x: 0.33 }, { id: 'olivia', anim: 'point', x: 0.66, face: -1 }],
          bubbles: [{ who: 'olivia', text: 'Đừng lo! Ta cùng nhặt lại từng trang sách 📄 khắp nhà nhé!' },
                    { who: 'oggy', text: 'Đi thôi! Vừa nhặt vừa học!' }] }
      ],

      // Nhà bếp
      kitchen_intro: [
        { bg: 'home-kitchen', chars: [{ id: 'oggy', anim: 'think', x: 0.28 }, { id: 'deedee', anim: 'idle', x: 0.65, face: -1 }],
          bubbles: [{ who: 'deedee', text: 'Măm măm! Trang sách này dính sô-cô-la, thơm ghê!' },
                    { who: 'oggy', text: 'Dee Dee! Đó là sách, không phải bánh!' }] },
        { bg: { theme: 'home-kitchen', camX: 300 }, chars: [{ id: 'olivia', anim: 'talk', x: 0.5 }],
          bubbles: [{ who: 'olivia', text: 'Nhặt trang sách 📄 để mở thẻ kiến thức. Gặp cổng dấu hỏi thì trả lời nhé!' }] }
      ],
      kitchen_boss: [
        { bg: 'home-kitchen', chars: [{ id: 'oggy', anim: 'idle', x: 0.28 }, { id: 'deedee', anim: 'attack', x: 0.68, face: -1, scale: 1.3 }],
          bubbles: [{ who: 'deedee', text: 'Tủ lạnh là của tớ! Muốn lấy trang sách thì bắt tớ đi!' },
                    { who: 'oggy', text: 'Nhảy lên đầu cậu ấy là được!' }] }
      ],
      kitchen_outro: [
        { bg: 'home-kitchen', chars: [{ id: 'oggy', anim: 'idle', x: 0.3 }, { id: 'deedee', anim: 'hurt', x: 0.65, face: -1 }],
          bubbles: [{ who: 'deedee', text: 'Ui da… ăn toàn bánh kẹo nên đau bụng quá!' }] },
        { bg: 'home-kitchen', chars: [{ id: 'olivia', anim: 'point', x: 0.35 }, { id: 'deedee', anim: 'idle', x: 0.68, face: -1 }],
          bubbles: [{ who: 'olivia', text: 'Bớt bánh kẹo, ăn thêm rau, trái cây và uống đủ nước nhé!' },
                    { who: 'deedee', text: 'Rau cũng ngon ghê! Trả cậu trang sách nè!' }] },
        { bg: { theme: 'home-kitchen', camX: 600 }, chars: [{ id: 'oggy', anim: 'point', x: 0.4 }],
          caption: 'Dee Dee chạy vụt ra vườn. Hình như Marky đang ở ngoài đó!' }
      ],

      // Khu vườn
      garden_intro: [
        { bg: 'home-garden', chars: [{ id: 'marky', anim: 'victory', x: 0.5 }, { id: 'bee', anim: 'idle', x: 0.78, y: 0.6, face: -1 }],
          bubbles: [{ who: 'marky', text: 'Ta sẽ hái hết hoa để kết vòng hoa đẹp nhất thế giới!' },
                    { who: 'bee', text: 'Bzz! Đừng hái hết! Ong cần hoa để làm mật mà!' }] },
        { bg: { theme: 'home-garden', camX: 500 }, chars: [{ id: 'olivia', anim: 'talk', x: 0.35 }, { id: 'oggy', anim: 'idle', x: 0.62, face: -1 }],
          bubbles: [{ who: 'olivia', text: 'Khu vườn có nhiều bạn nhỏ có ích. Hỏi Ong Vàng và Bọ Rùa nhé!' }] }
      ],
      garden_ladybug: [
        { bg: { theme: 'home-garden', camX: 700 }, chars: [{ id: 'oggy', anim: 'idle', x: 0.3 }, { id: 'ladybug', anim: 'wave', x: 0.62, face: -1 }],
          bubbles: [{ who: 'ladybug', text: 'Chào Oggy! Mình đang bảo vệ lá cây khỏi lũ rệp đấy!' },
                    { who: 'oggy', text: 'Cảm ơn bạn Bọ Rùa nhé!' }] }
      ],
      garden_boss: [
        { bg: 'home-garden', chars: [{ id: 'oggy', anim: 'idle', x: 0.28 }, { id: 'marky', anim: 'attack', x: 0.68, face: -1, scale: 1.3 }],
          bubbles: [{ who: 'marky', text: 'Hừm! Ai dám làm rối vòng hoa của ta? Đấu nào!' }] }
      ],
      garden_outro: [
        { bg: 'home-garden', chars: [{ id: 'marky', anim: 'think', x: 0.45 }, { id: 'bee', anim: 'idle', x: 0.72, y: 0.62, face: -1 }],
          bubbles: [{ who: 'marky', text: 'Để hoa trên cây thì ong có mật, còn vườn đẹp mỗi ngày…' }] },
        { bg: { theme: 'home-garden', camX: 300 }, chars: [{ id: 'marky', anim: 'victory', x: 0.5 }],
          bubbles: [{ who: 'marky', text: 'Ta sẽ gieo hạt hướng dương. Hẹn mùa hoa sau nhé!' }],
          caption: 'Marky trả lại trang sách và trồng thêm hoa. Giỏi lắm Marky!' },
        { bg: 'home-roof', chars: [{ id: 'oggy', anim: 'think', x: 0.35 }, { id: 'olivia', anim: 'point', x: 0.62, face: -1 }],
          bubbles: [{ who: 'olivia', text: 'Nhìn kìa! Joey cầm trang sách trèo lên mái nhà rồi!' }] }
      ],

      // Mái nhà
      roof_intro: [
        { bg: 'home-roof', chars: [{ id: 'oggy', anim: 'hurt', x: 0.28 }, { id: 'joey', anim: 'victory', x: 0.66, face: -1 }],
          bubbles: [{ who: 'joey', text: 'Diều làm từ trang sách bay cao nhất nè! Hí hí!' },
                    { who: 'oggy', text: 'Joey! Xuống đây ngay!' }] },
        { bg: { theme: 'home-roof', camX: 300 }, chars: [{ id: 'olivia', anim: 'idle', x: 0.3 }, { id: 'droplet', anim: 'wave', x: 0.62, face: -1 }],
          bubbles: [{ who: 'droplet', text: 'Chào! Mình là Giọt Nước. Mình vừa từ trên mây rơi xuống đấy!' },
                    { who: 'olivia', text: 'Cùng nghe Giọt Nước kể chuyện bầu trời nhé!' }] }
      ],
      roof_night: [
        { bg: 'home-roof-night', chars: [{ id: 'oggy', anim: 'think', x: 0.3 }, { id: 'olivia', anim: 'point', x: 0.62, face: -1 }],
          bubbles: [{ who: 'olivia', text: 'Trời tối rồi! Vừa ngắm trăng sao vừa tìm trang sách nào.' },
                    { who: 'oggy', text: 'Mặt Trăng tròn và sáng quá!' }] }
      ],
      roof_boss: [
        { bg: 'home-roof-night', chars: [{ id: 'oggy', anim: 'idle', x: 0.28 }, { id: 'joey', anim: 'attack', x: 0.68, face: -1, scale: 1.4 }],
          bubbles: [{ who: 'joey', text: 'Muốn lấy lại diều sách à? Bắt được tớ đi!' }] }
      ],
      roof_outro: [
        { bg: 'home-roof', chars: [{ id: 'oggy', anim: 'victory', x: 0.3 }, { id: 'joey', anim: 'think', x: 0.64, face: -1 }],
          bubbles: [{ who: 'joey', text: 'Ôi… cầu vồng! Còn đẹp hơn diều giấy nữa!' },
                    { who: 'oggy', text: 'Nắng chiếu qua giọt mưa đó!' }],
          caption: 'Sáng hôm sau, mưa vừa tạnh, nắng đã lên.' },
        { bg: { theme: 'home-roof', camX: 500 }, chars: [{ id: 'joey', anim: 'point', x: 0.45 }, { id: 'olivia', anim: 'think', x: 0.72, face: -1 }],
          bubbles: [{ who: 'joey', text: 'Trả cậu trang sách. Marky với Dee Dee đang chế máy dưới hầm!' },
                    { who: 'olivia', text: 'Ta xuống xem nào!' }] }
      ],

      // Tầng hầm
      basement_intro: [
        { bg: 'home-basement', chars: [{ id: 'jack', anim: 'wave', x: 0.3 }, { id: 'oggy', anim: 'idle', x: 0.6, face: -1 }],
          bubbles: [{ who: 'jack', text: 'Chào em! Đây là xưởng của anh Jack. Cẩn thận ổ điện nhé!' }] },
        { bg: { theme: 'home-basement', camX: 450 }, chars: [{ id: 'joey', anim: 'point', x: 0.3 }, { id: 'marky', anim: 'think', x: 0.5 }, { id: 'deedee', anim: 'victory', x: 0.72 }],
          bubbles: [{ who: 'joey', text: 'Hì hì! Máy hút sách sẽ gom hết trang sách cho tụi mình!' }],
          caption: 'Bộ ba gián lấy pin, nam châm và đồ cũ để chế một cỗ máy to đùng!' }
      ],
      basement_peek: [
        { bg: { theme: 'home-basement', camX: 900 }, chars: [{ id: 'marky', anim: 'think', x: 0.4 }, { id: 'deedee', anim: 'idle', x: 0.62, face: -1 }],
          bubbles: [{ who: 'marky', text: 'Suỵt! Oggy tới rồi! Mau lắp nốt cái nam châm!' },
                    { who: 'deedee', text: 'Tớ ăn nốt cái bánh đã…' }] }
      ],
      basement_boss: [
        { bg: 'home-basement', chars: [{ id: 'joey', anim: 'attack', x: 0.4 }, { id: 'marky', anim: 'attack', x: 0.58 }, { id: 'deedee', anim: 'attack', x: 0.78, face: -1 }],
          bubbles: [{ who: 'joey', text: 'Bộ ba gián xuất trận! Cỗ máy, chạy nào!' },
                    { who: 'deedee', text: 'Ơ… sao nó kêu xì xì thế?' }] }
      ],

      // Kết thúc ấm áp: làm hoà, cùng đọc sách
      ending: [
        { bg: 'home-basement', chars: [{ id: 'joey', anim: 'hurt', x: 0.35 }, { id: 'marky', anim: 'hurt', x: 0.52 }, { id: 'deedee', anim: 'hurt', x: 0.7 }],
          caption: 'Bụp! Cỗ máy xì hơi rồi tắt. Không ai bị đau, chỉ hơi lấm lem một chút!' },
        { bg: { theme: 'home-basement', camX: 300 }, chars: [{ id: 'oggy', anim: 'think', x: 0.28 }, { id: 'joey', anim: 'idle', x: 0.62, face: -1 }],
          bubbles: [{ who: 'joey', text: 'Tụi tớ chỉ muốn xem hình trong sách… mà lại chưa biết đọc.' }] },
        { bg: 'home-kitchen', chars: [{ id: 'oggy', anim: 'wave', x: 0.3 }, { id: 'olivia', anim: 'victory', x: 0.66, face: -1 }],
          bubbles: [{ who: 'oggy', text: 'Vậy thì mình cùng đọc nhé! Sách hay phải đọc cùng bạn bè!' }] },
        { bg: 'home-roof-night', chars: [{ id: 'oggy', anim: 'victory', x: 0.22 }, { id: 'olivia', anim: 'victory', x: 0.38 }, { id: 'joey', anim: 'victory', x: 0.56 }, { id: 'marky', anim: 'victory', x: 0.7 }, { id: 'deedee', anim: 'victory', x: 0.85 }],
          bubbles: [{ who: 'deedee', text: 'Từ nay tớ sẽ ăn thêm rau!' }, { who: 'joey', text: 'Còn tớ sẽ phân loại rác!' }],
          caption: 'Tối đó, cả nhà ngồi trên mái ngắm trăng và cùng đọc Cuốn Bách Khoa Kỳ Diệu.' }
      ]
    }
  });
})();
