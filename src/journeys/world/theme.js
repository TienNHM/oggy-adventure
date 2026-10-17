// @ts-check
/* ============================================================================
 * Hành trình "world" — CẢNH NỀN THEO CHỦ ĐỀ + BỘ VẼ DÙNG CHUNG OG.JourneyArt.world
 * ----------------------------------------------------------------------------
 * Vai trò:      Đăng ký lớp parallax, decor và 5 chủ đề cảnh nền 'world-*' (lúc LOAD), đồng thời xuất một bộ
 *               tiện ích vẽ OG.JourneyArt.world để content.js / extras.js của cùng hành trình dùng lại.
 * Khái niệm:    theme khai báo (ThemeDef: cảnh là dữ liệu) · registry decor / lớp theo tên · namespace con chia sẻ
 *               code giữa các file (OG.JourneyArt.world) · closure tạo hàm vẽ từ bảng màu (platformDrawer) ·
 *               parallax + culling · hash giả ngẫu nhiên ổn định · procedural drawing
 * Bài học:      docs/learn/12-data-driven-man-cau-do-hanh-trinh.md · docs/learn/08-camera-parallax.md ·
 *               docs/learn/07-ve-canvas-procedural-cache.md · docs/learn/01-module-pattern-iife-namespace.md
 * Phụ thuộc:    OG.Scenery.registerLayer / registerDecor / registerTheme / drawDecor (LOAD) · lúc CHẠY:
 *               OG.Sprites.drawBackground / drawPlatform (comicBg), OG.W, OG.H (đọc mỗi lần qua W(), H())
 * Event:        (không)
 * API công khai: OG.JourneyArt.world (WorldArtKit: rr, fs, circle, ell, line, face, shades, starPath, hash, wrap,
 *               comicBg, drawCroissant, drawSushi, drawMacaw, drawSloth, drawFrog) · tên 'world-*' trong OG.Scenery
 * Đọc tiếp:     src/journeys/world/content.js (dùng OG.JourneyArt.world) → src/core/scenery-registry.js → src/gfx/scenery.js
 * Dữ liệu:      ThemeDef, SceneryLayer, PlatformPaint, DecorFn, PanelDef (src/types.d.ts; docs/STORY.md mục 4) ·
 *               WorldArtKit (@typedef bên dưới)
 *
 * Hợp đồng ThemeDef: docs/STORY.md mục 4.
 *
 * Nội dung file:
 *   - OG.JourneyArt.world: tiện ích vẽ (mặt cười, kính râm, bo góc…) + comicBg() cho truyện tranh.
 *   - Decor riêng 'world-*' (tâm x, chân y; thế giới) và lớp parallax 'world-*' (màn hình).
 *   - 5 chủ đề: world-egypt · world-france · world-japan · world-amazon · world-arctic.
 * Mọi hình vẽ bằng canvas, viền ink #17233d dày, đồ vật có mặt cười. Không phụ thuộc thư viện decor chung.
 * Hệ toạ độ: lớp parallax = MÀN HÌNH (0..960 px, gốc góc trên-trái); decor + sàn/bục = THẾ GIỚI (decor: x tâm, y chân).
 * ========================================================================== */

/**
 * @typedef {Object} WorldArtKit  bộ vẽ dùng chung của hành trình world (OG.JourneyArt.world).
 *   Mọi field đều tuỳ chọn vì content.js có thể chạy khi theme.js chưa nạp — nơi dùng phải kiểm tra trước.
 * @property {string} [INK]   màu viền "mực"
 * @property {number} [TAU]   hằng Math.PI * 2 (một vòng tròn, radian)
 * @property {function(CanvasRenderingContext2D, number, number, number, number, number): void} [rr]
 *   tạo path hình chữ nhật bo góc (x, y góc trên-trái, w, h, r bán kính góc; px)
 * @property {Function} [fs]       tô (fill) + viền ink cho path hiện tại: fs(ctx, fill, lw) — lw = 0 thì không viền
 * @property {Function} [circle]   circle(ctx, x, y, r, fill, lw)
 * @property {Function} [ell]      ell(ctx, x, y, rx, ry, fill, lw, rot)
 * @property {Function} [line]     line(ctx, x1, y1, x2, y2, color, lw)
 * @property {Function} [face]     face(ctx, x, y, s, mood) — khuôn mặt dễ thương, mood: 'o' | 'sleep' | 'cool' | 'grin'
 * @property {Function} [shades]   shades(ctx, x, y, s) — kính râm
 * @property {Function} [starPath] starPath(ctx, x, y, rOut, rIn) — path ngôi sao 5 cánh
 * @property {function(number): number} [hash]          số giả ngẫu nhiên ổn định 0..1 theo chỉ số
 * @property {function(number, number): number} [wrap]  chia lấy dư luôn dương
 * @property {Function} [comicBg]  comicBg(themeId, items, camX, extra) -> hàm nền PanelDef.bg
 * @property {Function} [drawCroissant]
 * @property {Function} [drawSushi]
 * @property {Function} [drawMacaw]
 * @property {Function} [drawSloth]
 * @property {Function} [drawFrog]
 * @property {Function} [drawGlobe]    content.js gắn thêm
 * @property {Function} [drawPenguin]  content.js gắn thêm
 */
(function () {
  'use strict';
  var OG = window.OG;
  var S = OG.Scenery;
  var TAU = Math.PI * 2;
  var INK = '#17233d';

  // ---------------------------------------------------------------------------
  // Tiện ích vẽ (dùng chung cho theme.js, content.js, extras.js của hành trình này)
  // ---------------------------------------------------------------------------
  // Đọc kích thước màn hình logic (px) mỗi lần gọi thay vì chụp lúc LOAD → luôn khớp nếu OG.W được gán muộn.
  function W() { return OG.W || 960; }
  function H() { return OG.H || 540; }
  function wrap(x, span) { return ((x % span) + span) % span; }
  // Số giả ngẫu nhiên ổn định theo chỉ số (0..1).
  function hash(k) { var s = Math.sin(k * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

  function rr(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  // Tô + viền ink cho path hiện tại.
  function fs(ctx, fill, lw) {
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (lw !== 0) { ctx.strokeStyle = INK; ctx.lineWidth = lw || 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); }
  }
  function circle(ctx, x, y, r, fill, lw) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); fs(ctx, fill, lw); }
  function ell(ctx, x, y, rx, ry, fill, lw, rot) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, TAU); fs(ctx, fill, lw); }
  function line(ctx, x1, y1, x2, y2, color, lw) {
    ctx.strokeStyle = color || INK; ctx.lineWidth = lw || 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }

  // Khuôn mặt dễ thương. mood: undefined (cười) | 'o' (ngạc nhiên) | 'sleep' (nhắm mắt) | 'cool' (kính râm) | 'grin'
  function face(ctx, x, y, s, mood) {
    s = s || 1;
    ctx.save();
    ctx.fillStyle = 'rgba(255,120,150,0.55)';
    ctx.beginPath(); ctx.arc(x - 10 * s, y + 5 * s, 2.8 * s, 0, TAU); ctx.arc(x + 10 * s, y + 5 * s, 2.8 * s, 0, TAU); ctx.fill();
    ctx.strokeStyle = INK; ctx.fillStyle = INK; ctx.lineCap = 'round'; ctx.lineWidth = 1.8 * s;
    if (mood === 'sleep') {
      ctx.beginPath(); ctx.arc(x - 6 * s, y - 1 * s, 2.6 * s, Math.PI * 0.1, Math.PI * 0.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + 6 * s, y - 1 * s, 2.6 * s, Math.PI * 0.1, Math.PI * 0.9); ctx.stroke();
    } else if (mood === 'cool') {
      shades(ctx, x, y - 1 * s, s);
    } else {
      ctx.beginPath(); ctx.arc(x - 6 * s, y, 2.5 * s, 0, TAU); ctx.arc(x + 6 * s, y, 2.5 * s, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x - 5.2 * s, y - 0.9 * s, 0.9 * s, 0, TAU); ctx.arc(x + 6.8 * s, y - 0.9 * s, 0.9 * s, 0, TAU); ctx.fill();
    }
    ctx.beginPath();
    if (mood === 'o') { ctx.arc(x, y + 6 * s, 2.5 * s, 0, TAU); ctx.stroke(); }
    else if (mood === 'grin') {
      ctx.arc(x, y + 3 * s, 4.5 * s, 0.1, Math.PI - 0.1); ctx.closePath();
      ctx.fillStyle = '#c0394b'; ctx.fill(); ctx.stroke();
    } else { ctx.arc(x, y + 3 * s, 4 * s, 0.25, Math.PI - 0.25); ctx.stroke(); }
    ctx.restore();
  }
  // Kính râm cool ngầu (tâm giữa hai mắt).
  function shades(ctx, x, y, s) {
    ctx.save();
    ctx.fillStyle = INK; ctx.strokeStyle = INK; ctx.lineWidth = 1.6 * s;
    ctx.beginPath(); ctx.ellipse(x - 6 * s, y, 5 * s, 3.6 * s, 0, 0, TAU); ctx.ellipse(x + 6 * s, y, 5 * s, 3.6 * s, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 1.5 * s, y - 1 * s); ctx.lineTo(x + 1.5 * s, y - 1 * s); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.arc(x - 8 * s, y - 1.3 * s, 1.1 * s, 0, TAU); ctx.arc(x + 4 * s, y - 1.3 * s, 1.1 * s, 0, TAU); ctx.fill();
    ctx.restore();
  }
  // Ngôi sao 5 cánh (path).
  function starPath(ctx, x, y, ro, ri) {
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var r = i % 2 ? ri : ro, a = (i * Math.PI) / 5 - Math.PI / 2;
      if (i) ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
  }

  // Lặp hình theo ô parallax: fn(screenX, worldIndex). Chỉ số ổn định theo thế giới để hình không "nhảy".
  // 💡 Khái niệm: parallax + culling — lớp dịch theo cam × px (px nhỏ = ở xa, trôi chậm); vòng lặp chỉ chạy qua các
  //   ô k đang lọt vào khung 960 px. k gắn với vị trí trong thế giới, nên hash(k) cho cùng một ô luôn ra cùng
  //   chiều cao / màu khi camera di chuyển (thay vì đổi mỗi frame như Math.random()).
  function tile(L, cam, defSpan, defPx, fn) {
    var px = L.parallax == null ? defPx : L.parallax, span = L.spacing || defSpan;
    var off = cam * px, k = Math.floor(off / span) - 1;
    for (; k * span - off < W() + span; k++) fn(k * span - off, k, span);
  }

  // 💡 Khái niệm: namespace con — các file của hành trình chia sẻ hàm vẽ qua OG.JourneyArt.world thay vì biến
  //   toàn cục. `OG.JourneyArt || {}` giữ lại kit của hành trình khác nếu đã có (không ghi đè cả OG.JourneyArt).
  OG.JourneyArt = OG.JourneyArt || {};
  /** @type {WorldArtKit} */
  var A = OG.JourneyArt.world = {
    INK: INK, TAU: TAU, rr: rr, fs: fs, circle: circle, ell: ell, line: line, face: face, shades: shades,
    starPath: starPath, hash: hash, wrap: wrap,
    /**
     * Tạo hàm nền truyện tranh (dùng làm PanelDef.bg): vẽ chủ đề + sàn + vài decor + phần vẽ thêm.
     * Lỗi khi vẽ nền thì tô màu trời dự phòng, panel vẫn hiện được.
     * @param {string} themeId   id chủ đề cảnh nền, vd 'world-egypt'
     * @param {{kind: string, x: number, y?: number, scale?: number, opts?: any}[]} [items]
     *   decor đặt trong khung: x ≤ 1 hiểu là tỉ lệ bề rộng khung, x > 1 là px; y mặc định 480 (mặt sàn)
     * @param {number} [camX=0]  độ dời camera giả (px) để mỗi panel nhìn một đoạn cảnh khác
     * @param {function(CanvasRenderingContext2D, number): void} [extra]  vẽ thêm phía trên (ctx, t giây)
     * @returns {function(CanvasRenderingContext2D, number, number, number, number, number): void}
     *   hàm (ctx, x0, y0, w, h, t) đúng hợp đồng PanelDef.bg
     * @example
     *   { bg: OG.JourneyArt.world.comicBg('world-egypt', [{ kind: 'world-camel', x: 0.7 }], 300),
     *     caption: 'Sa mạc nóng quá!' }
     */
    comicBg: function (themeId, items, camX, extra) {
      return function (ctx, x0, y0, w, h, t) {
        try {
          if (OG.Sprites && OG.Sprites.drawBackground) {
            OG.Sprites.drawBackground(ctx, themeId, camX || 0, t);
            if (OG.Sprites.drawPlatform) OG.Sprites.drawPlatform(ctx, { x: -20, y: 480, w: w + 40, h: 60, isFloor: true }, themeId, t);
          } else { ctx.fillStyle = '#bfe6ff'; ctx.fillRect(0, 0, w, h); }
        } catch (e) { ctx.fillStyle = '#bfe6ff'; ctx.fillRect(0, 0, w, h); }
        (items || []).forEach(function (it) {
          var px = it.x <= 1 ? it.x * w : it.x;
          S.drawDecor(ctx, it.kind, px, it.y == null ? 480 : it.y, it.scale || 1, t, it.opts);
        });
        if (extra) { ctx.save(); extra(ctx, t); ctx.restore(); }
      };
    }
  };

  // ---------------------------------------------------------------------------
  // Vẽ sàn & bục theo chủ đề (drawCustom.platform). pal: màu + kiểu hoa văn.
  // ---------------------------------------------------------------------------
  // 💡 Khái niệm: closure — platformDrawer(pal) "nhớ" bảng màu pal và trả về hàm vẽ sàn riêng cho từng chủ đề;
  //   dữ liệu theme chỉ cần ghi bảng màu + kiểu hoa văn ('bricks' | 'ice' | mặc định chấm).
  // a = Platform {x, y, w, h, isFloor} (thế giới, góc trên-trái); sàn chính y = 480 nên y > 470 coi là sàn.
  function platformDrawer(pal) {
    return function (ctx, a, t) {
      var floor = a.isFloor || a.y > 470;
      ctx.save();
      if (floor) {
        ctx.fillStyle = pal.floor; ctx.fillRect(a.x, a.y, a.w, a.h + 4);
        // hoa văn
        var x0 = Math.floor(a.x / 48) * 48;
        for (var x = x0; x < a.x + a.w; x += 48) {
          var k = hash(x * 0.37);
          if (x < a.x - 10) continue;
          if (pal.pattern === 'bricks') {
            ctx.strokeStyle = pal.line; ctx.lineWidth = 2;
            // Hàng gạch dưới lệch nửa viên hay không tuỳ hash → tường gạch trông tự nhiên nhưng ổn định.
            ctx.strokeRect(x + 2, a.y + 16, 44, 18); ctx.strokeRect(x + 26 - 24 * (k > 0.5 ? 1 : 0), a.y + 36, 44, 18);
          } else if (pal.pattern === 'ice') {
            ctx.strokeStyle = pal.line; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(x + 6, a.y + 22 + k * 10); ctx.lineTo(x + 20, a.y + 30); ctx.lineTo(x + 30, a.y + 24 + k * 8); ctx.stroke();
          } else {
            ctx.fillStyle = pal.line;
            ctx.beginPath(); ctx.ellipse(x + 14 + k * 20, a.y + 26 + k * 18, 5 + k * 3, 3, 0, 0, TAU); ctx.fill();
          }
        }
        // mép trên lượn sóng
        ctx.fillStyle = pal.top;
        ctx.beginPath(); ctx.moveTo(a.x, a.y - 2);
        for (var xx = a.x; xx <= a.x + a.w; xx += 16) ctx.lineTo(xx, a.y + (pal.topH || 10) + Math.sin(xx * 0.09) * 3);
        ctx.lineTo(a.x + a.w, a.y - 2); ctx.closePath(); ctx.fill();
        if (pal.dots) {
          ctx.fillStyle = pal.dots;
          for (var d = x0 + 20; d < a.x + a.w; d += 48) if (d > a.x) { ctx.beginPath(); ctx.arc(d + hash(d) * 20, a.y + 4, 2.4, 0, TAU); ctx.fill(); }
        }
        ctx.strokeStyle = INK; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x + a.w, a.y); ctx.stroke();
        if (a.x > 0) line(ctx, a.x, a.y, a.x, a.y + a.h, INK, 3);
        line(ctx, a.x + a.w, a.y, a.x + a.w, a.y + a.h, INK, 3);
      } else {
        rr(ctx, a.x, a.y, a.w, Math.max(a.h, 18), 9); fs(ctx, pal.ledge, 3);
        ctx.save(); rr(ctx, a.x, a.y, a.w, Math.max(a.h, 18), 9); ctx.clip();
        ctx.fillStyle = pal.ledgeTop; ctx.fillRect(a.x, a.y, a.w, 7);
        ctx.strokeStyle = pal.line; ctx.lineWidth = 2;
        for (var bx = a.x + 30; bx < a.x + a.w - 10; bx += 40) { ctx.beginPath(); ctx.moveTo(bx, a.y + 9); ctx.lineTo(bx, a.y + a.h); ctx.stroke(); }
        ctx.restore();
        rr(ctx, a.x, a.y, a.w, Math.max(a.h, 18), 9); fs(ctx, null, 3);
        if (a.w >= 150) face(ctx, a.x + a.w / 2, a.y + 9, 0.5);
      }
      ctx.restore();
      return true;
    };
  }

  // ---------------------------------------------------------------------------
  // LỚP PARALLAX (không gian màn hình). layer: {kind, parallax, y, height, color, spacing, ...}
  // ---------------------------------------------------------------------------
  // Đồi/cồn cát lượn sóng.
  S.registerLayer('world-dunes', function (ctx, L, cam) {
    var px = L.parallax == null ? 0.3 : L.parallax, span = L.spacing || 420, y = L.y == null ? 440 : L.y, h = L.height || 50;
    ctx.fillStyle = L.color || '#f0c97a';
    ctx.beginPath(); ctx.moveTo(0, H());
    for (var x = 0; x <= W() + 12; x += 12) {
      var k = (x + cam * px) / span * TAU;
      ctx.lineTo(x, y - (Math.sin(k) * 0.5 + 0.5) * h - Math.sin(k * 0.5 + 1) * h * 0.25);
    }
    ctx.lineTo(W(), H()); ctx.closePath(); ctx.fill();
    if (L.crest) { ctx.strokeStyle = L.crest; ctx.lineWidth = 3; ctx.stroke(); }
  });

  // Kim tự tháp phía xa (cái lớn có mặt ngái ngủ).
  S.registerLayer('world-pyramids', function (ctx, L, cam, t) {
    var y = L.y == null ? 420 : L.y, h = L.height || 170;
    tile(L, cam, 900, 0.1, function (x, k) {
      var r = hash(k);
      var list = [[0.35, 1], [0.62, 0.68], [0.8, 0.45]];
      if (r > 0.6) list = [[0.4, 0.85], [0.7, 0.55]];
      list.forEach(function (p, i) {
        var bx = x + p[0] * 900, ph = h * p[1], bw = ph * 1.7;
        ctx.beginPath(); ctx.moveTo(bx - bw / 2, y); ctx.lineTo(bx, y - ph); ctx.lineTo(bx + bw / 2, y); ctx.closePath();
        ctx.fillStyle = L.color || '#e6b35c'; ctx.fill();
        ctx.beginPath(); ctx.moveTo(bx, y - ph); ctx.lineTo(bx + bw / 2, y); ctx.lineTo(bx + bw * 0.1, y); ctx.closePath();
        ctx.fillStyle = L.shade || '#c98f3f'; ctx.fill();
        ctx.beginPath(); ctx.moveTo(bx - bw / 2, y); ctx.lineTo(bx, y - ph); ctx.lineTo(bx + bw / 2, y);
        ctx.strokeStyle = 'rgba(23,35,61,0.45)'; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.stroke();
        // vài hàng đá
        ctx.strokeStyle = 'rgba(23,35,61,0.12)'; ctx.lineWidth = 2;
        for (var s = 1; s < 6; s++) {
          var yy = y - ph * s / 6, half = (bw / 2) * (1 - s / 6);
          ctx.beginPath(); ctx.moveTo(bx - half, yy); ctx.lineTo(bx + half, yy); ctx.stroke();
        }
        if (i === 0) face(ctx, bx - ph * 0.08, y - ph * 0.38, ph / 120, Math.sin(t * 0.7 + k) > 0.6 ? 'o' : 'sleep');
      });
    });
  });

  // Dòng sông (Nile/Amazon) có thuyền buồm & lau sậy.
  S.registerLayer('world-river', function (ctx, L, cam, t) {
    var px = L.parallax == null ? 0.35 : L.parallax, y = L.y == null ? 420 : L.y, h = L.height || 40;
    ctx.fillStyle = L.color || '#4fb3e8';
    ctx.beginPath(); ctx.moveTo(0, y + h);
    for (var x = 0; x <= W() + 10; x += 10) ctx.lineTo(x, y + Math.sin((x + cam * px) / 38 + t * 1.6) * 3);
    ctx.lineTo(W(), y + h); ctx.lineTo(W(), H()); ctx.lineTo(0, H()); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2;
    tile(L, cam, 90, px, function (sx, k) {
      var yy = y + 10 + hash(k) * (h - 14);
      ctx.beginPath(); ctx.moveTo(sx, yy); ctx.lineTo(sx + 16, yy); ctx.stroke();
    });
    if (L.boats) tile(L, cam, 560, px, function (sx, k) {
      if (hash(k + 3) < 0.35) return;
      var bx = sx + 200, by = y + 8 + Math.sin(t * 2 + k) * 2;
      ctx.beginPath(); ctx.moveTo(bx - 28, by - 6); ctx.quadraticCurveTo(bx, by + 10, bx + 28, by - 6); ctx.closePath(); fs(ctx, '#9c6644', 2.5);
      line(ctx, bx, by - 4, bx, by - 52, INK, 2.5);
      ctx.beginPath(); ctx.moveTo(bx + 1, by - 50); ctx.lineTo(bx + 24, by - 10); ctx.lineTo(bx + 1, by - 10); ctx.closePath(); fs(ctx, '#fffaf0', 2.5);
      face(ctx, bx + 8, by - 22, 0.45);
    });
    if (L.reeds) tile(L, cam, 170, px + 0.05, function (sx, k) {
      var rx = sx + hash(k) * 60;
      for (var i = -2; i <= 2; i++) {
        line(ctx, rx, y + h * 0.4, rx + i * 6, y - 22 - Math.abs(i) * -3, L.reeds, 3);
        ctx.fillStyle = L.reeds; ctx.beginPath(); ctx.ellipse(rx + i * 7, y - 24, 6, 3, i * 0.4, 0, TAU); ctx.fill();
      }
    });
    if (L.lilies) tile(L, cam, 210, px, function (sx, k) {
      var lx = sx + hash(k) * 80, ly = y + 14 + hash(k + 1) * (h - 20);
      ctx.beginPath(); ctx.ellipse(lx, ly, 18, 6, 0, 0.3, TAU - 0.1); ctx.lineTo(lx, ly); ctx.closePath(); fs(ctx, '#5fbf4f', 2);
    });
  });

  // Tháp Eiffel phía xa (mặt cười ở tầng 1).
  S.registerLayer('world-eiffel', function (ctx, L, cam, t) {
    var y = L.y == null ? 440 : L.y, h = L.height || 330, c = L.color || '#b57b4f', dark = L.shade || '#8a5636';
    tile(L, cam, 1500, 0.06, function (x) {
      var cx = x + 1000, w = h * 0.52;
      ctx.save(); ctx.translate(cx, y);
      ctx.beginPath();
      ctx.moveTo(-w / 2, 0);
      ctx.quadraticCurveTo(-w * 0.2, -h * 0.3, -w * 0.09, -h * 0.62);
      ctx.lineTo(-w * 0.025, -h * 0.93); ctx.lineTo(0, -h); ctx.lineTo(w * 0.025, -h * 0.93); ctx.lineTo(w * 0.09, -h * 0.62);
      ctx.quadraticCurveTo(w * 0.2, -h * 0.3, w / 2, 0);
      ctx.lineTo(w * 0.28, 0); ctx.quadraticCurveTo(0, -h * 0.26, -w * 0.28, 0); ctx.closePath();
      fs(ctx, c, 3);
      // lưới sắt
      ctx.strokeStyle = dark; ctx.lineWidth = 1.5;
      for (var i = 1; i < 9; i++) {
        var yy = -h * 0.62 * i / 9, hw = w / 2 - (w / 2 - w * 0.09) * Math.pow(i / 9, 0.8);
        ctx.beginPath(); ctx.moveTo(-hw, yy); ctx.lineTo(hw, yy - h * 0.06); ctx.moveTo(hw, yy); ctx.lineTo(-hw, yy - h * 0.06); ctx.stroke();
      }
      // các tầng
      rr(ctx, -w * 0.32, -h * 0.29, w * 0.64, 10, 3); fs(ctx, dark, 2.5);
      rr(ctx, -w * 0.15, -h * 0.62, w * 0.3, 8, 3); fs(ctx, dark, 2.5);
      // cờ trên đỉnh
      line(ctx, 0, -h, 0, -h - 18, INK, 2);
      ctx.fillStyle = '#e63946'; ctx.beginPath(); ctx.moveTo(0, -h - 18); ctx.lineTo(14 + Math.sin(t * 4) * 2, -h - 13); ctx.lineTo(0, -h - 8); ctx.fill();
      face(ctx, 0, -h * 0.4, h / 260);
      ctx.restore();
    });
  });

  // Dãy nhà Paris: tường kem, mái xám xanh, ô cửa sổ.
  S.registerLayer('world-paris', function (ctx, L, cam) {
    var y = L.y == null ? 440 : L.y;
    tile(L, cam, 170, 0.3, function (x, k) {
      var r = hash(k), bw = 150, bh = (L.height || 150) * (0.75 + r * 0.4);
      var walls = L.walls || ['#f6e7c8', '#f2dcc0', '#efe1d0'];
      rr(ctx, x + 6, y - bh, bw, bh + 20, 4); fs(ctx, walls[k & 1 ? 1 : (r > 0.5 ? 2 : 0)], 2.5);
      // mái mansard + ống khói
      ctx.beginPath(); ctx.moveTo(x, y - bh); ctx.lineTo(x + 18, y - bh - 34); ctx.lineTo(x + bw - 6, y - bh - 34); ctx.lineTo(x + bw + 12, y - bh); ctx.closePath();
      fs(ctx, L.roof || '#7d8fa8', 2.5);
      rr(ctx, x + 30 + r * 70, y - bh - 52, 14, 22, 2); fs(ctx, '#c46b4f', 2);
      // cửa sổ
      for (var row = 0; row < 3; row++) for (var col = 0; col < 3; col++) {
        var wx = x + 22 + col * 44, wy = y - bh + 18 + row * 42;
        if (wy > y - 30) continue;
        rr(ctx, wx, wy, 20, 28, 3); fs(ctx, '#9fd3f5', 2);
        line(ctx, wx - 2, wy + 30, wx + 22, wy + 30, '#4b5a73', 2.5);
      }
    });
  });

  // Hàng cây tròn (cây ngô đồng Paris / anh đào Nhật / tán rừng).
  S.registerLayer('world-treerow', function (ctx, L, cam) {
    var y = L.y == null ? 450 : L.y, h = L.height || 70;
    tile(L, cam, 130, 0.45, function (x, k) {
      var r = hash(k), cx = x + 60, top = y - h * (0.8 + r * 0.4);
      if (L.trunk !== false) { rr(ctx, cx - 5, top + 20, 10, y - top, 3); fs(ctx, L.trunk || '#8a5a32', 2); }
      ctx.beginPath(); ctx.arc(cx - 22, top + 18, 24, 0, TAU); ctx.arc(cx, top, 30, 0, TAU); ctx.arc(cx + 22, top + 16, 24, 0, TAU);
      var cols = L.colors || [L.color || '#6cbf5a'];
      ctx.fillStyle = cols[(k & 1) % cols.length]; ctx.fill();
      ctx.strokeStyle = 'rgba(23,35,61,0.35)'; ctx.lineWidth = 2.5; ctx.stroke();
      if (L.blossom) { ctx.fillStyle = L.blossom; for (var i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(cx - 20 + hash(k * 7 + i) * 40, top - 10 + hash(k * 3 + i) * 34, 3, 0, TAU); ctx.fill(); } }
    });
  });

  // Tán rừng dày (Amazon): hàng vòm tròn chồng nhau.
  S.registerLayer('world-canopy', function (ctx, L, cam) {
    var y = L.y == null ? 330 : L.y, h = L.height || 90;
    ctx.fillStyle = L.color || '#2f8a4c';
    ctx.fillRect(0, y, W(), H() - y);
    tile(L, cam, 110, 0.15, function (x, k) {
      var r = hash(k);
      ctx.beginPath(); ctx.arc(x + 55, y - r * h * 0.6, 50 + r * 30, Math.PI, 0); ctx.lineTo(x + 140, y + 10); ctx.lineTo(x - 30, y + 10); ctx.closePath();
      ctx.fill();
      if (L.light) { ctx.fillStyle = L.light; ctx.beginPath(); ctx.arc(x + 40, y - r * h * 0.6 - 20, 14, 0, TAU); ctx.fill(); ctx.fillStyle = L.color || '#2f8a4c'; }
    });
  });

  // Dây leo rủ từ trên xuống (gần, parallax lớn).
  S.registerLayer('world-vines', function (ctx, L, cam, t) {
    tile(L, cam, 150, 0.7, function (x, k) {
      var r = hash(k), len = 50 + r * (L.height || 120), cx = x + r * 80;
      var sway = Math.sin(t * 1.2 + k) * 6;
      ctx.strokeStyle = L.color || '#2e7d32'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx, -5); ctx.quadraticCurveTo(cx + sway, len * 0.5, cx + sway * 1.5, len); ctx.stroke();
      ctx.fillStyle = L.leaf || '#4caf50';
      for (var i = 1; i < 5; i++) {
        var ly = len * i / 5, lx = cx + sway * (i / 5) * 1.3;
        ctx.beginPath(); ctx.ellipse(lx + (i & 1 ? 7 : -7), ly, 8, 4, i & 1 ? 0.5 : -0.5, 0, TAU); ctx.fill();
      }
      if (r > 0.7) { ctx.fillStyle = '#ff6fa8'; ctx.beginPath(); ctx.arc(cx + sway * 1.5, len + 4, 5, 0, TAU); ctx.fill(); }
    });
  });

  // Núi Phú Sĩ phía xa: mũ tuyết, mặt ngủ ngon (núi lửa đang ngủ).
  S.registerLayer('world-fuji', function (ctx, L, cam, t) {
    var y = L.y == null ? 430 : L.y, h = L.height || 250;
    tile(L, cam, 1500, 0.05, function (x) {
      var cx = x + 700, bw = h * 2.8, tw = h * 0.42;
      ctx.beginPath(); ctx.moveTo(cx - bw / 2, y); ctx.quadraticCurveTo(cx - tw, y - h * 0.6, cx - tw / 2, y - h);
      ctx.lineTo(cx + tw / 2, y - h); ctx.quadraticCurveTo(cx + tw, y - h * 0.6, cx + bw / 2, y); ctx.closePath();
      fs(ctx, L.color || '#6f86c4', 3);
      // mũ tuyết lởm chởm
      ctx.beginPath(); ctx.moveTo(cx - tw / 2, y - h);
      ctx.quadraticCurveTo(cx - tw * 0.8, y - h * 0.8, cx - tw * 0.95, y - h * 0.66);
      var pts = [-0.95, -0.6, -0.35, 0, 0.3, 0.6, 0.95];
      for (var i = 0; i < pts.length; i++) ctx.lineTo(cx + pts[i] * tw, y - h * (i & 1 ? 0.74 : 0.62));
      ctx.quadraticCurveTo(cx + tw * 0.8, y - h * 0.8, cx + tw / 2, y - h); ctx.closePath();
      fs(ctx, '#ffffff', 3);
      face(ctx, cx, y - h * 0.48, h / 120, 'sleep');
      // chữ "z" ngủ
      ctx.fillStyle = 'rgba(23,35,61,0.6)'; ctx.font = OG.font ? OG.font(16 + 4 * Math.sin(t), 'bold') : 'bold 18px sans-serif';
      ctx.fillText('z', cx + tw * 0.7, y - h - 10 - (t * 12) % 20);
      // dải mây
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath(); ctx.ellipse(cx - bw * 0.22, y - h * 0.3, 70, 14, 0, 0, TAU); ctx.ellipse(cx + bw * 0.2, y - h * 0.22, 90, 16, 0, 0, TAU); ctx.fill();
    });
  });

  // Chùa tháp nhiều tầng mờ xa.
  S.registerLayer('world-pagodas', function (ctx, L, cam) {
    var y = L.y == null ? 440 : L.y, c = L.color || '#b48fb8';
    tile(L, cam, 520, 0.2, function (x, k) {
      if (hash(k) < 0.3) return;
      var cx = x + 260, n = 3 + (hash(k + 5) * 2 | 0);
      ctx.fillStyle = c;
      rr(ctx, cx - 20, y - n * 30, 40, n * 30, 2); ctx.fill();
      for (var i = 0; i < n; i++) {
        var yy = y - i * 30 - 26, w = 70 - i * 8;
        ctx.beginPath(); ctx.moveTo(cx - w / 2 - 8, yy + 4); ctx.quadraticCurveTo(cx, yy - 14, cx + w / 2 + 8, yy + 4); ctx.lineTo(cx + w / 2 - 4, yy + 8); ctx.lineTo(cx - w / 2 + 4, yy + 8); ctx.closePath(); ctx.fill();
      }
      ctx.fillRect(cx - 2, y - n * 30 - 30, 4, 24);
    });
  });

  // Cực quang nhảy múa (dải màu trong suốt).
  S.registerLayer('world-aurora', function (ctx, L, cam, t) {
    var cols = L.colors || ['#5cffb0', '#53d8ff', '#c77dff'];
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < cols.length; i++) {
      ctx.strokeStyle = cols[i]; ctx.globalAlpha = 0.22; ctx.lineWidth = 34 - i * 6; ctx.lineCap = 'round';
      ctx.beginPath();
      for (var x = -20; x <= W() + 20; x += 20) {
        var yy = (L.y || 120) + i * 34 + Math.sin(x / 130 + t * 0.5 + i * 1.7 + cam * 0.002) * 26 + Math.sin(x / 47 + t * 0.9) * 6;
        if (x === -20) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
      ctx.globalAlpha = 0.12; ctx.lineWidth = 70; ctx.stroke();
    }
    ctx.restore();
  });

  // Biển băng có tảng băng trôi (vài tảng có mặt).
  S.registerLayer('world-icebergs', function (ctx, L, cam, t) {
    var y = L.y == null ? 420 : L.y;
    ctx.fillStyle = L.sea || '#2b5f9e'; ctx.fillRect(0, y, W(), H() - y);
    tile(L, cam, 330, 0.22, function (x, k) {
      var r = hash(k), cx = x + 160, bh = 40 + r * 70, bw = 90 + r * 70, bob = Math.sin(t * 1.3 + k) * 2;
      ctx.beginPath(); ctx.moveTo(cx - bw / 2, y + bob); ctx.lineTo(cx - bw * 0.3, y - bh * 0.6 + bob); ctx.lineTo(cx - bw * 0.05, y - bh + bob);
      ctx.lineTo(cx + bw * 0.2, y - bh * 0.7 + bob); ctx.lineTo(cx + bw / 2, y + bob); ctx.closePath();
      fs(ctx, '#eaf6ff', 2.5);
      ctx.beginPath(); ctx.moveTo(cx - bw * 0.05, y - bh + bob); ctx.lineTo(cx + bw * 0.2, y - bh * 0.7 + bob); ctx.lineTo(cx + bw / 2, y + bob); ctx.lineTo(cx + bw * 0.05, y + bob); ctx.closePath();
      ctx.fillStyle = '#bfe0f5'; ctx.fill();
      if (r > 0.45) face(ctx, cx - bw * 0.08, y - bh * 0.35 + bob, 0.7);
    });
  });

  // ---------------------------------------------------------------------------
  // DECOR riêng (thế giới; x = tâm, y = mặt đất). fn(ctx, x, y, scale, t, opts)
  // ---------------------------------------------------------------------------
  // Bọc fn(ctx, t, opts) — vẽ quanh gốc (0,0) = tâm chân, y âm hướng lên — thành DecorFn đúng hợp đồng.
  function decor(kind, fn) {
    S.registerDecor(kind, function (ctx, x, y, s, t, o) {
      ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
      fn(ctx, t || 0, o || {});
      ctx.restore();
    });
  }

  // ===== AI CẬP =====
  decor('world-palm', function (ctx, t) {
    var sw = Math.sin(t * 1.3) * 3;
    ctx.beginPath(); ctx.moveTo(-8, 0); ctx.quadraticCurveTo(-4 + sw, -60, 6 + sw, -118); ctx.lineTo(16 + sw, -116); ctx.quadraticCurveTo(8 + sw, -60, 10, 0); ctx.closePath();
    fs(ctx, '#b07a45', 3);
    for (var i = 1; i < 6; i++) line(ctx, -5 + sw * i / 6 + i, -i * 20, 9 + sw * i / 6 + i, -i * 20 - 3, '#8a5a32', 2);
    var tx = 11 + sw, ty = -118;
    var angs = [-2.7, -2.1, -1.4, -0.8, -0.25];
    angs.forEach(function (a, i) {
      var ex = tx + Math.cos(a) * 62, ey = ty + Math.sin(a) * 30 + 26;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.quadraticCurveTo(tx + Math.cos(a) * 40, ty + Math.sin(a) * 40 - 8, ex, ey);
      ctx.quadraticCurveTo(tx + Math.cos(a) * 30, ty + Math.sin(a) * 20 + 6, tx, ty); fs(ctx, i & 1 ? '#3fae5a' : '#55c46a', 2.5);
    });
    circle(ctx, tx - 6, ty + 8, 7, '#7a4e2b', 2.5); circle(ctx, tx + 7, ty + 9, 7, '#7a4e2b', 2.5);
    face(ctx, 1, -40, 0.7);
  });

  // Lạc đà một bướu đeo kính râm, nhai nhóp nhép.
  decor('world-camel', function (ctx, t, o) {
    var chew = Math.sin(t * 6) * 1.5;
    var c = o.color || '#d9a66b', d = '#b98549';
    [-26, -12, 14, 28].forEach(function (lx, i) { rr(ctx, lx - 4, -42, 8, 42, 4); fs(ctx, i & 1 ? d : c, 2.5); });
    ell(ctx, 0, -52, 40, 20, c, 3);
    ctx.beginPath(); ctx.ellipse(-2, -68, 20, 18, 0, Math.PI, 0); fs(ctx, c, 3); // bướu
    ell(ctx, -2, -60, 16, 6, c, 0);
    // cổ + đầu
    ctx.beginPath(); ctx.moveTo(28, -58); ctx.quadraticCurveTo(46, -64, 44, -92); ctx.lineTo(56, -94); ctx.quadraticCurveTo(58, -60, 36, -44); ctx.closePath(); fs(ctx, c, 3);
    ell(ctx, 58, -98, 17, 11, c, 3, 0.1);
    ell(ctx, 70, -92 + chew, 7, 5, '#e8c08d', 2);
    ell(ctx, 46, -110, 4, 7, d, 2, -0.4);
    shades(ctx, 58, -101, 0.9);
    line(ctx, -38, -56, -46, -40 + Math.sin(t * 3) * 3, INK, 3);
  });

  // Cột đá tháp nhọn có chữ tượng hình.
  decor('world-obelisk', function (ctx) {
    ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(-12, -150); ctx.lineTo(12, -150); ctx.lineTo(18, 0); ctx.closePath(); fs(ctx, '#e3bd7a', 3);
    ctx.beginPath(); ctx.moveTo(-12, -150); ctx.lineTo(0, -172); ctx.lineTo(12, -150); ctx.closePath(); fs(ctx, '#ffd23f', 3);
    ctx.strokeStyle = '#8a5a32'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, -128, 6, 3.5, 0, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(0, -128, 1.5, 0, TAU); ctx.stroke(); // con mắt
    ctx.beginPath(); for (var i = 0; i < 4; i++) ctx.lineTo(-7 + i * 4.6, -108 + (i & 1 ? -3 : 3)); ctx.stroke(); // sóng nước
    ctx.beginPath(); ctx.arc(0, -90, 4, 0, TAU); ctx.moveTo(0, -86); ctx.lineTo(0, -74); ctx.moveTo(-5, -82); ctx.lineTo(5, -82); ctx.stroke(); // biểu tượng
    ctx.beginPath(); ctx.moveTo(-6, -60); ctx.quadraticCurveTo(0, -70, 6, -60); ctx.lineTo(4, -56); ctx.stroke(); // chim
    face(ctx, 0, -28, 0.8);
  });

  // Xác ướp hiền lành, vẫy tay chào khẽ (có thể ngáp ngủ với opts.sleep).
  decor('world-mummy', function (ctx, t, o) {
    var bob = Math.sin(t * 2) * 1.5, wave = Math.sin(t * 3) * 0.4;
    var c = '#f3e8cc', l = '#d8c9a3';
    rr(ctx, -10, -18, 8, 18, 3); fs(ctx, c, 2.5); rr(ctx, 3, -18, 8, 18, 3); fs(ctx, c, 2.5);
    rr(ctx, -16, -58 + bob, 32, 44, 12); fs(ctx, c, 3);
    ctx.save(); rr(ctx, -16, -58 + bob, 32, 44, 12); ctx.clip();
    ctx.strokeStyle = l; ctx.lineWidth = 2;
    for (var i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(-18, -54 + i * 8 + bob); ctx.lineTo(18, -50 + i * 8 + (i & 1 ? 3 : -2) + bob); ctx.stroke(); }
    ctx.restore();
    // tay trái vẫy
    ctx.save(); ctx.translate(-14, -50 + bob); ctx.rotate(-2.2 + wave); rr(ctx, -4, 0, 9, 24, 4); fs(ctx, c, 2.5); ctx.restore();
    ctx.save(); ctx.translate(14, -48 + bob); ctx.rotate(-0.3); rr(ctx, -4, 0, 9, 22, 4); fs(ctx, c, 2.5); ctx.restore();
    // đầu
    circle(ctx, 0, -72 + bob, 17, c, 3);
    ctx.strokeStyle = l; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-16, -80 + bob); ctx.lineTo(16, -84 + bob); ctx.moveTo(-15, -64 + bob); ctx.lineTo(16, -60 + bob); ctx.stroke();
    rr(ctx, -12, -77 + bob, 24, 11, 5); ctx.fillStyle = '#5b4a3a'; ctx.fill();
    face(ctx, 0, -72 + bob, 0.65, o.sleep ? 'sleep' : undefined);
    // dải băng bay phấp phới
    ctx.strokeStyle = c; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(14, -76 + bob); ctx.quadraticCurveTo(26, -80 + Math.sin(t * 4) * 5, 34, -70 + Math.sin(t * 4 + 1) * 6); ctx.stroke();
    if (o.sleep) { ctx.fillStyle = INK; ctx.font = OG.font ? OG.font(14, 'bold') : 'bold 14px sans-serif'; ctx.fillText('z', 18, -96 - (t * 10) % 14); }
  });

  // Tượng Nhân sư... nhưng là mèo (giống Oggy!) đội khăn sọc.
  decor('world-sphinx', function (ctx, t) {
    rr(ctx, -80, -36, 150, 36, 14); fs(ctx, '#e3b56c', 3);
    rr(ctx, 40, -16, 46, 16, 8); fs(ctx, '#e3b56c', 3);
    ctx.beginPath(); ctx.moveTo(-80, -26); ctx.quadraticCurveTo(-110, -40 + Math.sin(t * 2) * 6, -100, -60); fs(ctx, null, 4);
    // đầu + khăn sọc
    ctx.beginPath(); ctx.moveTo(10, -30); ctx.lineTo(16, -96); ctx.quadraticCurveTo(44, -112, 72, -96); ctx.lineTo(78, -30); ctx.closePath(); fs(ctx, '#3f6fb5', 3);
    ctx.save(); ctx.clip(); ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 5;
    for (var i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(0, -36 - i * 12); ctx.lineTo(90, -36 - i * 12); ctx.stroke(); }
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(10, -30); ctx.lineTo(16, -96); ctx.quadraticCurveTo(44, -112, 72, -96); ctx.lineTo(78, -30); ctx.closePath(); fs(ctx, null, 3);
    ell(ctx, 44, -64, 22, 24, '#f0c98a', 3);
    ctx.beginPath(); ctx.moveTo(28, -80); ctx.lineTo(24, -98); ctx.lineTo(36, -86); fs(ctx, '#f0c98a', 2.5);
    ctx.beginPath(); ctx.moveTo(60, -80); ctx.lineTo(64, -98); ctx.lineTo(52, -86); fs(ctx, '#f0c98a', 2.5);
    face(ctx, 44, -66, 0.9);
    line(ctx, 26, -58, 14, -60, INK, 1.5); line(ctx, 62, -58, 74, -60, INK, 1.5);
  });

  // ===== PHÁP =====
  decor('world-lamp', function (ctx, t) {
    rr(ctx, -10, -8, 20, 8, 3); fs(ctx, '#2f4a3f', 2.5);
    rr(ctx, -4, -120, 8, 114, 3); fs(ctx, '#3c5a4c', 2.5);
    ctx.beginPath(); ctx.moveTo(-16, -150); ctx.lineTo(16, -150); ctx.lineTo(10, -122); ctx.lineTo(-10, -122); ctx.closePath();
    fs(ctx, 'rgba(255,226,120,' + (0.85 + 0.15 * Math.sin(t * 3)).toFixed(2) + ')', 2.5);
    ctx.beginPath(); ctx.moveTo(-20, -150); ctx.lineTo(0, -164); ctx.lineTo(20, -150); ctx.closePath(); fs(ctx, '#3c5a4c', 2.5);
    face(ctx, 0, -138, 0.6);
  });

  // Bàn cà phê vỉa hè với tách cacao và bánh sừng bò.
  decor('world-cafe', function (ctx, t) {
    line(ctx, -30, 0, -30, -36, INK, 3); line(ctx, -44, -36, -26, -36, INK, 3); line(ctx, -44, -36, -44, -62, INK, 3); line(ctx, -44, 0, -44, -36, INK, 3);
    line(ctx, 30, 0, 30, -36, INK, 3); line(ctx, 44, -36, 26, -36, INK, 3); line(ctx, 44, -36, 44, -62, INK, 3); line(ctx, 44, 0, 44, -36, INK, 3);
    line(ctx, 0, 0, 0, -46, INK, 4); line(ctx, -12, 0, 12, 0, INK, 4);
    ell(ctx, 0, -48, 30, 7, '#f7f2e8', 3);
    rr(ctx, -16, -66, 12, 14, 3); fs(ctx, '#e63946', 2);
    ctx.strokeStyle = 'rgba(23,35,61,0.4)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-10, -70); ctx.quadraticCurveTo(-6 + Math.sin(t * 3) * 3, -78, -10, -86); ctx.stroke();
    drawCroissant(ctx, 12, -58, 0.5, t);
  });

  function drawCroissant(ctx, x, y, s, t) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    var segs = [[-30, 6, 12, 0.5], [-16, -4, 16, 0.25], [0, -8, 18, 0], [16, -4, 16, -0.25], [30, 6, 12, -0.5]];
    segs.forEach(function (g) { ell(ctx, g[0], g[1], g[2], g[2] * 0.85, '#f2a541', 3, g[3]); });
    segs.forEach(function (g) { line(ctx, g[0] - 3, g[1] - g[2] * 0.6, g[0] + 2, g[1] + g[2] * 0.5, '#c46d1f', 2); });
    face(ctx, 0, -8, 0.8);
    ctx.restore();
  }
  A.drawCroissant = drawCroissant;

  decor('world-croissant', function (ctx, t) {
    rr(ctx, -26, -10, 52, 10, 4); fs(ctx, '#e5e5e5', 2.5);
    drawCroissant(ctx, 0, -28 + Math.sin(t * 2) * 2, 1, t);
  });

  // Giá vẽ với bức tranh mặt trời (gợi nhớ bảo tàng Louvre).
  decor('world-easel', function (ctx) {
    line(ctx, -22, 0, -8, -100, '#8a5a32', 5); line(ctx, 22, 0, 8, -100, '#8a5a32', 5); line(ctx, 0, -10, 0, -96, '#8a5a32', 4);
    rr(ctx, -34, -96, 68, 56, 3); fs(ctx, '#d9a441', 3);
    ctx.fillStyle = '#bfe6ff'; ctx.fillRect(-28, -90, 56, 44);
    ctx.fillStyle = '#7ccf6a'; ctx.beginPath(); ctx.ellipse(0, -46, 30, 12, 0, Math.PI, 0); ctx.fill();
    circle(ctx, 12, -76, 8, '#ffd23f', 2);
    face(ctx, 12, -77, 0.35);
    line(ctx, -30, -38, 30, -38, '#8a5a32', 4);
  });

  // ===== NHẬT BẢN =====
  decor('world-sakura', function (ctx, t) {
    ctx.beginPath(); ctx.moveTo(-10, 0); ctx.quadraticCurveTo(-6, -50, -20, -90); ctx.lineTo(-8, -92); ctx.quadraticCurveTo(4, -60, 4, -40);
    ctx.quadraticCurveTo(14, -70, 30, -84); ctx.lineTo(36, -78); ctx.quadraticCurveTo(14, -50, 12, 0); ctx.closePath(); fs(ctx, '#7a4e3a', 3);
    ctx.beginPath(); ctx.arc(-36, -100, 30, 0, TAU); ctx.arc(-4, -122, 36, 0, TAU); ctx.arc(32, -100, 30, 0, TAU); ctx.arc(0, -92, 30, 0, TAU);
    fs(ctx, '#ffc4dc', 3);
    ctx.fillStyle = '#ff94bf';
    for (var i = 0; i < 12; i++) { ctx.beginPath(); ctx.arc(-50 + hash(i) * 100, -140 + hash(i + 9) * 60, 3.5, 0, TAU); ctx.fill(); }
    face(ctx, -2, -108, 0.9);
    // cánh hoa rơi
    ctx.fillStyle = '#ffb3d1';
    for (var p = 0; p < 4; p++) {
      var ft = (t * 0.5 + p * 0.25) % 1;
      ctx.beginPath(); ctx.ellipse(-40 + p * 26 + Math.sin(ft * 9 + p) * 10, -80 + ft * 80, 4, 2.5, ft * 6, 0, TAU); ctx.fill();
    }
  });

  decor('world-torii', function (ctx) {
    rr(ctx, -46, -110, 12, 110, 3); fs(ctx, '#e5484d', 3);
    rr(ctx, 34, -110, 12, 110, 3); fs(ctx, '#e5484d', 3);
    rr(ctx, -56, -96, 112, 10, 3); fs(ctx, '#e5484d', 3);
    rr(ctx, -6, -110, 12, 16, 2); fs(ctx, '#e5484d', 2.5);
    ctx.beginPath(); ctx.moveTo(-70, -116); ctx.quadraticCurveTo(0, -126, 70, -116); ctx.lineTo(66, -130); ctx.quadraticCurveTo(0, -140, -66, -130); ctx.closePath(); fs(ctx, '#2b2b3a', 3);
    rr(ctx, -62, -118, 124, 8, 2); fs(ctx, '#e5484d', 2.5);
    face(ctx, 0, -76, 0.7);
  });

  decor('world-stonelantern', function (ctx, t) {
    rr(ctx, -16, -12, 32, 12, 3); fs(ctx, '#9aa3ad', 2.5);
    rr(ctx, -6, -44, 12, 32, 2); fs(ctx, '#b3bac3', 2.5);
    rr(ctx, -18, -50, 36, 8, 3); fs(ctx, '#9aa3ad', 2.5);
    rr(ctx, -14, -76, 28, 26, 4); fs(ctx, '#b3bac3', 2.5);
    rr(ctx, -8, -71, 16, 14, 3); fs(ctx, 'rgba(255,214,102,' + (0.75 + 0.25 * Math.sin(t * 4)).toFixed(2) + ')', 2);
    ctx.beginPath(); ctx.moveTo(-26, -76); ctx.quadraticCurveTo(0, -96, 26, -76); ctx.closePath(); fs(ctx, '#9aa3ad', 2.5);
    circle(ctx, 0, -92, 5, '#9aa3ad', 2);
    face(ctx, 0, -66, 0.45);
  });

  // Miếng sushi khổng lồ biết cười.
  function drawSushi(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    rr(ctx, -30, -30, 60, 30, 14); fs(ctx, '#ffffff', 3);
    ctx.fillStyle = 'rgba(23,35,61,0.08)'; for (var i = 0; i < 7; i++) { ctx.beginPath(); ctx.arc(-22 + i * 7.5, -10 - (i & 1) * 8, 2.5, 0, TAU); ctx.fill(); }
    ctx.beginPath(); ctx.moveTo(-36, -26); ctx.quadraticCurveTo(0, -52, 36, -26); ctx.quadraticCurveTo(0, -34, -36, -26); fs(ctx, '#ff8a5c', 3);
    ctx.strokeStyle = '#ffd5c2'; ctx.lineWidth = 2.5;
    for (var j = -2; j <= 2; j++) { ctx.beginPath(); ctx.moveTo(j * 11 - 4, -42 + Math.abs(j) * 3); ctx.lineTo(j * 11 + 4, -30); ctx.stroke(); }
    face(ctx, 0, -16, 0.8);
    ctx.restore();
  }
  A.drawSushi = drawSushi;
  decor('world-sushi', function (ctx, t) { drawSushi(ctx, 0, Math.sin(t * 2) > 0.95 ? -3 : 0, 1); });

  decor('world-bamboo', function (ctx, t) {
    for (var i = -1; i <= 1; i++) {
      var hgt = 120 + i * 20 + (i === 0 ? 30 : 0), x = i * 16, sw = Math.sin(t + i) * 3;
      ctx.save(); ctx.translate(x, 0); ctx.rotate(sw * 0.01);
      rr(ctx, -5, -hgt, 10, hgt, 4); fs(ctx, '#7cc46b', 2.5);
      for (var k = 1; k < hgt / 28; k++) line(ctx, -5, -k * 28, 5, -k * 28, '#4f8f45', 2);
      ctx.fillStyle = '#5aaf4e'; ctx.beginPath(); ctx.ellipse(10, -hgt + 10, 14, 4, -0.5, 0, TAU); ctx.ellipse(-10, -hgt + 26, 14, 4, 0.5, 0, TAU); ctx.fill();
      ctx.restore();
    }
    face(ctx, 0, -40, 0.5);
  });

  // ===== AMAZON =====
  decor('world-jungletree', function (ctx, t) {
    ctx.beginPath(); ctx.moveTo(-40, 0); ctx.quadraticCurveTo(-16, -10, -16, -40); ctx.lineTo(-14, -170); ctx.lineTo(14, -170); ctx.lineTo(16, -40);
    ctx.quadraticCurveTo(16, -10, 40, 0); ctx.closePath(); fs(ctx, '#7a5236', 3);
    line(ctx, -6, -60, -4, -120, '#5d3d27', 2); line(ctx, 6, -80, 5, -150, '#5d3d27', 2);
    ctx.beginPath(); ctx.arc(-50, -178, 40, 0, TAU); ctx.arc(0, -210, 50, 0, TAU); ctx.arc(52, -180, 42, 0, TAU); ctx.arc(0, -168, 40, 0, TAU);
    fs(ctx, '#2f9e55', 3);
    ctx.fillStyle = '#4cc06d'; ctx.beginPath(); ctx.arc(-20, -220, 18, 0, TAU); ctx.arc(30, -196, 14, 0, TAU); ctx.fill();
    face(ctx, 0, -96, 0.9);
  });

  decor('world-fern', function (ctx, t, o) {
    var c = o.color || '#3fae5a';
    for (var i = -3; i <= 3; i++) {
      var a = -Math.PI / 2 + i * 0.32 + Math.sin(t * 1.5 + i) * 0.04, len = 54 - Math.abs(i) * 6;
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(Math.cos(a) * len * 0.6 - 6, Math.sin(a) * len * 0.6, Math.cos(a) * len, Math.sin(a) * len);
      ctx.quadraticCurveTo(Math.cos(a) * len * 0.6 + 6, Math.sin(a) * len * 0.6, 0, 0);
      fs(ctx, i & 1 ? c : '#55c46a', 2);
    }
  });

  // Vẹt đuôi dài (macaw) đậu trên cành.
  function drawMacaw(ctx, x, y, s, t) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.beginPath(); ctx.moveTo(-4, 6); ctx.lineTo(-14, 44); ctx.lineTo(-2, 44); ctx.lineTo(6, 8); fs(ctx, '#2a7bd4', 2.5);
    ell(ctx, 0, -4, 13, 18, '#e63946', 3);
    ctx.beginPath(); ctx.ellipse(-4, 0, 8, 14, 0.25 + Math.sin(t * 5) * 0.05, 0, TAU); fs(ctx, '#ffd23f', 2.5);
    ctx.beginPath(); ctx.ellipse(-6, 6, 5, 10, 0.3, 0, TAU); fs(ctx, '#2a7bd4', 2);
    circle(ctx, 4, -22, 11, '#e63946', 3);
    ell(ctx, 7, -22, 5, 4, '#ffffff', 1.5);
    circle(ctx, 8, -23, 1.8, INK, 0);
    ctx.beginPath(); ctx.moveTo(12, -26); ctx.quadraticCurveTo(24, -24, 18, -12); ctx.quadraticCurveTo(14, -16, 12, -18); ctx.closePath(); fs(ctx, '#f2e6c9', 2.5);
    ctx.restore();
  }
  A.drawMacaw = drawMacaw;
  decor('world-parrot', function (ctx, t) {
    line(ctx, 0, 0, 0, -80, '#8a5a32', 5); line(ctx, -26, -80, 26, -80, '#8a5a32', 5);
    drawMacaw(ctx, 0, -100 + Math.sin(t * 2) * 1.5, 1, t);
  });

  // Con lười treo trên cành, đung đưa chậm rãi.
  function drawSloth(ctx, x, y, s, t) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.rotate(Math.sin(t * 0.8) * 0.08);
    line(ctx, -12, 0, -14, 24, '#9b7b5c', 7); line(ctx, 12, 0, 14, 24, '#9b7b5c', 7);
    ell(ctx, 0, 32, 20, 16, '#a88463', 3);
    circle(ctx, 0, 52, 15, '#a88463', 3);
    ell(ctx, 0, 53, 11, 9, '#f1dfc4', 2);
    ell(ctx, -5, 51, 4, 3, '#5a3e2b', 0, 0.4); ell(ctx, 5, 51, 4, 3, '#5a3e2b', 0, -0.4);
    circle(ctx, -5, 51, 1.4, '#fff', 0); circle(ctx, 5, 51, 1.4, '#fff', 0);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(0, 55, 3, 0.2, Math.PI - 0.2); ctx.stroke();
    circle(ctx, 0, 54, 1.5, INK, 0);
    ctx.restore();
  }
  A.drawSloth = drawSloth;
  decor('world-sloth', function (ctx, t) {
    rr(ctx, -46, -150, 12, 150, 4); fs(ctx, '#7a5236', 3);
    rr(ctx, -40, -146, 96, 10, 5); fs(ctx, '#7a5236', 3);
    ctx.fillStyle = '#4cc06d'; ctx.beginPath(); ctx.ellipse(52, -146, 14, 7, 0.3, 0, TAU); ctx.fill();
    drawSloth(ctx, 10, -140, 1, t);
  });

  // Ếch phi tiêu xanh dương trên chiếc lá.
  function drawFrog(ctx, x, y, s, t, color) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    var c = color || '#2f80ed', puff = Math.max(0, Math.sin(t * 3)) * 3;
    ell(ctx, 0, -12, 20, 13, c, 3);
    ell(ctx, 0, -6 + puff * 0.3, 10 + puff, 5 + puff, '#9ad0ff', 2);
    circle(ctx, -9, -24, 7, c, 3); circle(ctx, 9, -24, 7, c, 3);
    circle(ctx, -9, -24, 3.5, '#fff', 0); circle(ctx, 9, -24, 3.5, '#fff', 0);
    circle(ctx, -8.5, -24, 2, INK, 0); circle(ctx, 9.5, -24, 2, INK, 0);
    ctx.fillStyle = INK; [[-10, -12], [8, -14], [0, -18], [13, -8], [-14, -6]].forEach(function (d) { ctx.beginPath(); ctx.arc(d[0], d[1], 2.4, 0, TAU); ctx.fill(); });
    ctx.strokeStyle = INK; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(0, -15, 6, 0.3, Math.PI - 0.3); ctx.stroke();
    ell(ctx, -18, -2, 7, 3, c, 2); ell(ctx, 18, -2, 7, 3, c, 2);
    ctx.restore();
  }
  A.drawFrog = drawFrog;
  decor('world-frog', function (ctx, t, o) {
    ctx.beginPath(); ctx.ellipse(0, -4, 36, 8, 0, 0, TAU); fs(ctx, '#4caf50', 2.5);
    line(ctx, -30, -4, 30, -4, '#2e7d32', 2);
    drawFrog(ctx, 0, -8, 0.9, t, o.color);
  });

  decor('world-tropflower', function (ctx, t) {
    line(ctx, 0, 0, 0, -60, '#2e7d32', 4);
    ctx.beginPath(); ctx.ellipse(-14, -26, 16, 6, -0.6, 0, TAU); fs(ctx, '#3fae5a', 2);
    for (var i = 0; i < 4; i++) {
      var yy = -60 - i * 14, dir = i & 1 ? 1 : -1;
      ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(dir * 22, yy - 4); ctx.lineTo(0, yy - 10); ctx.closePath(); fs(ctx, i & 1 ? '#ff7a2f' : '#e63946', 2);
    }
    face(ctx, 0, -40, 0.45);
  });

  // ===== BẮC CỰC =====
  decor('world-igloo', function (ctx) {
    ctx.beginPath(); ctx.arc(0, 0, 62, Math.PI, 0); ctx.closePath(); fs(ctx, '#f4fbff', 3);
    ctx.save(); ctx.beginPath(); ctx.arc(0, 0, 62, Math.PI, 0); ctx.clip();
    ctx.strokeStyle = '#b9d9ef'; ctx.lineWidth = 2;
    for (var r = 1; r < 4; r++) { ctx.beginPath(); ctx.moveTo(-70, -r * 16); ctx.lineTo(70, -r * 16); ctx.stroke(); }
    for (var c = -3; c <= 3; c++) for (var rw = 0; rw < 4; rw++) { var bx = c * 22 + (rw & 1 ? 11 : 0); ctx.beginPath(); ctx.moveTo(bx, -rw * 16); ctx.lineTo(bx, -rw * 16 - 16); ctx.stroke(); }
    ctx.restore();
    ctx.beginPath(); ctx.arc(34, 0, 20, Math.PI, 0); ctx.closePath(); fs(ctx, '#4b6b8a', 3);
    face(ctx, -14, -30, 1);
  });

  decor('world-ice', function (ctx, t, o) {
    var s = o.size || 1;
    rr(ctx, -24 * s, -44 * s, 48 * s, 44 * s, 8); fs(ctx, '#bfe6ff', 3);
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.moveTo(-18 * s, -38 * s); ctx.lineTo(-6 * s, -38 * s); ctx.lineTo(-18 * s, -24 * s); ctx.fill();
    face(ctx, 0, -22 * s, 0.8 * s, Math.sin(t * 0.9) > 0.85 ? 'o' : undefined);
  });

  // Cột mốc Bắc Cực sọc đỏ trắng.
  decor('world-pole', function (ctx, t) {
    rr(ctx, -6, -130, 12, 130, 5); fs(ctx, '#ffffff', 3);
    ctx.save(); rr(ctx, -6, -130, 12, 130, 5); ctx.clip(); ctx.fillStyle = '#e63946';
    for (var i = 0; i < 10; i++) { ctx.beginPath(); ctx.moveTo(-8, -i * 26); ctx.lineTo(8, -i * 26 - 10); ctx.lineTo(8, -i * 26 - 22); ctx.lineTo(-8, -i * 26 - 12); ctx.fill(); }
    ctx.restore(); rr(ctx, -6, -130, 12, 130, 5); fs(ctx, null, 3);
    circle(ctx, 0, -138, 10, '#ffd23f', 3);
    rr(ctx, 6, -110, 70, 26, 5); fs(ctx, '#7a5236', 3);
    ctx.fillStyle = '#fff'; ctx.font = OG.font ? OG.font(12, 'bold') : 'bold 12px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('BẮC CỰC', 41, -97);
  });

  decor('world-snowman', function (ctx, t) {
    circle(ctx, 0, -24, 26, '#ffffff', 3);
    circle(ctx, 0, -64, 19, '#ffffff', 3);
    rr(ctx, -20, -50, 40, 9, 4); fs(ctx, '#e63946', 2.5);
    rr(ctx, 8, -48, 9, 22, 3); fs(ctx, '#e63946', 2.5);
    line(ctx, -22, -32, -46, -50 + Math.sin(t * 3) * 6, '#7a5236', 3); line(ctx, 22, -32, 44, -46, '#7a5236', 3);
    face(ctx, 0, -68, 0.8);
    ctx.beginPath(); ctx.moveTo(0, -63); ctx.lineTo(14, -60); ctx.lineTo(0, -58); ctx.closePath(); fs(ctx, '#ff8c2f', 1.5);
  });

  // Hải cẩu tròn vo vẫy vây.
  decor('world-seal', function (ctx, t) {
    ctx.beginPath(); ctx.moveTo(-40, 0); ctx.quadraticCurveTo(-50, -10, -58, -2); ctx.lineTo(-56, 6); ctx.quadraticCurveTo(-44, 2, -36, 2); fs(ctx, '#8fa3b5', 2.5);
    ctx.beginPath(); ctx.ellipse(-6, -16, 36, 18, -0.15, 0, TAU); fs(ctx, '#a7bacb', 3);
    circle(ctx, 26, -34, 16, '#a7bacb', 3);
    ctx.save(); ctx.translate(10, -10); ctx.rotate(-0.5 + Math.sin(t * 4) * 0.4); ell(ctx, 0, 10, 5, 11, '#8fa3b5', 2.5); ctx.restore();
    face(ctx, 28, -36, 0.7);
    ell(ctx, 30, -29, 4, 3, '#5b6b7a', 0);
  });

  // ---------------------------------------------------------------------------
  // CHỦ ĐỀ CẢNH NỀN
  // ---------------------------------------------------------------------------
  // Mẫu ThemeDef: layers xếp XA → GẦN (parallax 0.08 → 0.42); lớp có thể mang tham số riêng (shade, boats, reeds)
  // mà hàm lớp tự đọc. platformStyle là dự phòng; drawCustom.platform mới là hình thật (trả true = đã vẽ).
  // 🧪 Thử: đổi pattern: 'bricks' thành 'ice' rồi vào màn world-egypt-1: sàn sa mạc có vết nứt như băng.
  // Ai Cập: trời nắng vàng, kim tự tháp, sông Nile, lạc đà đeo kính râm, xác ướp vẫy tay.
  S.registerTheme('world-egypt', {
    name: 'Ai Cập', base: 'roof',
    sky: { top: '#ffcf7a', bottom: '#fff3cf', sun: { x: 800, y: 96, r: 54, color: '#fff7c2' }, clouds: { color: 'rgba(255,255,255,0.75)', count: 3 } },
    layers: [
      { kind: 'world-pyramids', parallax: 0.08, y: 400, height: 180, color: '#ecbd68', shade: '#cf9447' },
      { kind: 'world-dunes', parallax: 0.18, y: 410, height: 30, spacing: 520, color: '#f2cf8a' },
      { kind: 'world-river', parallax: 0.3, y: 418, height: 26, color: '#3fa3e0', boats: true, reeds: '#5aa84a' },
      { kind: 'world-dunes', parallax: 0.42, y: 452, height: 22, spacing: 380, color: '#eabc6c' }
    ],
    platformStyle: { floor: { fill: '#e2b15f', top: '#f6d58c', topH: 8 }, ledge: { fill: '#d9a85a', top: '#f6d58c', radius: 8 } },
    drawCustom: { platform: platformDrawer({ floor: '#e0ab5a', top: '#f8d995', line: 'rgba(138,90,50,0.35)', dots: '#c98f3f', ledge: '#e3b56c', ledgeTop: '#f8d995', pattern: 'bricks' }) },
    decor: [
      { kind: 'world-palm', every: 760, start: 160, scale: 0.95 },
      { kind: 'world-camel', every: 1500, start: 560, scale: 0.9 },
      { kind: 'world-obelisk', every: 1400, start: 1020, scale: 0.85 },
      { kind: 'world-mummy', every: 1800, start: 1350, scale: 0.9, opts: { sleep: true } },
      { kind: 'world-sphinx', every: 2400, start: 1900, scale: 0.85 }
    ],
    ambient: { kind: 'sparkle', color: 'rgba(255,240,190,0.7)' }
  });

  // Pháp: Paris, tháp Eiffel, đèn đường, quán cà phê vỉa hè.
  S.registerTheme('world-france', {
    name: 'Pháp', base: 'garden',
    sky: { top: '#8fd0ff', bottom: '#eaf7ff', sun: { x: 140, y: 90, r: 44, color: '#fff5b8' }, clouds: { color: '#ffffff', count: 5 } },
    layers: [
      { kind: 'world-eiffel', parallax: 0.06, y: 430, height: 340, color: '#b9805a', shade: '#8a5636' },
      { kind: 'world-paris', parallax: 0.25, y: 440, height: 150, roof: '#7d8fa8' },
      { kind: 'world-treerow', parallax: 0.45, y: 462, height: 60, colors: ['#6cbf5a', '#5aae4b'], trunk: '#8a6a4a' }
    ],
    platformStyle: { floor: { fill: '#a9b2bd', top: '#cfd5dc', topH: 8 }, ledge: { fill: '#c8a27a', top: '#e8cfae', radius: 8 } },
    drawCustom: { platform: platformDrawer({ floor: '#9aa4b1', top: '#d5dbe2', line: 'rgba(23,35,61,0.22)', ledge: '#d9b48a', ledgeTop: '#f0dcc0', pattern: 'cobble' }) },
    decor: [
      { kind: 'world-lamp', every: 620, start: 140 },
      { kind: 'world-cafe', every: 1300, start: 420, scale: 0.95 },
      { kind: 'world-croissant', every: 1700, start: 900, scale: 0.9 },
      { kind: 'world-easel', every: 1900, start: 1500, scale: 0.9 },
      { kind: 'flower', every: 900, start: 680, scale: 0.7, opts: { color: '#ff8fb1' } }
    ]
  });

  // Nhật Bản: núi Phú Sĩ, chùa tháp, hoa anh đào, cổng torii.
  S.registerTheme('world-japan', {
    name: 'Nhật Bản', base: 'garden',
    sky: { top: '#a9d8ff', bottom: '#ffe8f1', sun: { x: 820, y: 100, r: 46, color: '#ff6b6b' }, clouds: { color: 'rgba(255,255,255,0.85)', count: 4 } },
    layers: [
      { kind: 'world-fuji', parallax: 0.05, y: 430, height: 250, color: '#7389c9' },
      { kind: 'world-pagodas', parallax: 0.18, y: 440, color: '#c3a2c9' },
      { kind: 'world-treerow', parallax: 0.32, y: 452, height: 70, colors: ['#ffc4dc', '#ffb0cf'], trunk: '#7a4e3a', blossom: '#ff8fbd' },
      { kind: 'hills', parallax: 0.45, y: 470, height: 30, color: '#9fd88a', spacing: 420 }
    ],
    platformStyle: { floor: { fill: '#8b6a4e', top: '#9ccf6a', topH: 10 }, ledge: { fill: '#b07a52', top: '#e8c9a2', radius: 8 } },
    drawCustom: { platform: platformDrawer({ floor: '#8f6b4f', top: '#9fd36b', line: 'rgba(60,40,25,0.3)', dots: '#ffb3d1', ledge: '#c58a5c', ledgeTop: '#f0d2a8', pattern: 'cobble' }) },
    decor: [
      { kind: 'world-sakura', every: 820, start: 200, scale: 0.95 },
      { kind: 'world-stonelantern', every: 900, start: 520 },
      { kind: 'world-torii', every: 1600, start: 1100, scale: 0.95 },
      { kind: 'world-bamboo', every: 1300, start: 760 },
      { kind: 'world-sushi', every: 2100, start: 1600, scale: 0.9 }
    ],
    ambient: { kind: 'leaves', color: 'rgba(255,170,205,0.85)' }
  });

  // Rừng Amazon: tán rừng nhiều tầng, sông, dây leo, vẹt, lười, ếch.
  S.registerTheme('world-amazon', {
    name: 'Rừng Amazon', base: 'garden',
    sky: { top: '#7fd6c3', bottom: '#e6fff4', sun: { x: 760, y: 80, r: 40, color: '#fffbd0' }, clouds: { color: 'rgba(255,255,255,0.7)', count: 3 } },
    layers: [
      { kind: 'world-canopy', parallax: 0.08, y: 300, height: 90, color: '#3c9a62' },
      { kind: 'world-canopy', parallax: 0.2, y: 370, height: 80, color: '#2c7f4a', light: 'rgba(120,220,130,0.5)' },
      { kind: 'world-river', parallax: 0.32, y: 432, height: 30, color: '#b88b4a', lilies: true },
      { kind: 'world-vines', parallax: 0.6, height: 130, color: '#2e7d32', leaf: '#4caf50' }
    ],
    platformStyle: { floor: { fill: '#6b4a2f', top: '#4caf50', topH: 10 }, ledge: { fill: '#8a5a32', top: '#6cc35a', radius: 8 } },
    drawCustom: { platform: platformDrawer({ floor: '#6b4a2f', top: '#53b957', line: 'rgba(30,20,10,0.3)', dots: '#ff6fa8', ledge: '#94633a', ledgeTop: '#6cc35a', pattern: 'cobble' }) },
    decor: [
      { kind: 'world-jungletree', every: 900, start: 300, scale: 0.9 },
      { kind: 'world-fern', every: 420, start: 120 },
      { kind: 'world-parrot', every: 1500, start: 700 },
      { kind: 'world-sloth', every: 1700, start: 1150 },
      { kind: 'world-frog', every: 1300, start: 980, scale: 0.9 },
      { kind: 'world-tropflower', every: 800, start: 560 },
      { kind: 'world-fern', every: 1300, start: 820, scale: 0.8, front: true, opts: { color: '#2f9e55' } }
    ],
    ambient: { kind: 'leaves', color: 'rgba(90,190,100,0.7)' }
  });

  // Bắc Cực: đêm sao, cực quang, biển băng, lều tuyết, gấu & hải cẩu.
  S.registerTheme('world-arctic', {
    name: 'Bắc Cực', base: 'roof',
    sky: { top: '#0f2a5c', bottom: '#4f7fc0', stars: true, clouds: false },
    layers: [
      { kind: 'world-aurora', parallax: 0.02, y: 110 },
      { kind: 'world-icebergs', parallax: 0.2, y: 420, sea: '#24548f' },
      { kind: 'world-dunes', parallax: 0.42, y: 466, height: 26, spacing: 460, color: '#e8f4ff', crest: '#c4dcf0' }
    ],
    platformStyle: { floor: { fill: '#bfe0f5', top: '#ffffff', topH: 10 }, ledge: { fill: '#a9d6f2', top: '#ffffff', radius: 8 } },
    drawCustom: { platform: platformDrawer({ floor: '#a7d3f0', top: '#ffffff', line: 'rgba(60,110,160,0.45)', ledge: '#bfe6ff', ledgeTop: '#ffffff', pattern: 'ice' }) },
    decor: [
      { kind: 'world-igloo', every: 1400, start: 300, scale: 0.9 },
      { kind: 'world-ice', every: 540, start: 120 },
      { kind: 'world-snowman', every: 1300, start: 760 },
      { kind: 'world-seal', every: 1600, start: 1100 },
      { kind: 'world-pole', every: 2600, start: 1700 }
    ],
    ambient: { kind: 'snow', color: 'rgba(255,255,255,0.9)' }
  });
})();
