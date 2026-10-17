// @ts-check
/* ============================================================================
 * OG.Sprites (phần cảnh vật) — BỘ VẼ CẢNH NỀN THEO CHỦ ĐỀ (ThemeDef renderer)
 * ----------------------------------------------------------------------------
 * Vai trò:      Biến một ThemeDef (dữ liệu mô tả chủ đề: trời, lớp nền, kiểu sàn, decor, hạt bay) thành hình trên canvas.
 *               Scene level/boss/story gọi 4 hàm vẽ mỗi frame theo đúng thứ tự lớp:
 *               drawBackground → (camera) drawPlatform + drawDecor → nhân vật → drawOverlay.
 * Khái niệm:    parallax (lớp xa trôi chậm hơn lớp gần) · toạ độ màn hình vs thế giới · culling (bỏ qua phần ngoài khung nhìn) ·
 *               registry theme + chủ đề dự phòng (fallback) · data-driven design · bảng chiến lược (strategy table: PATTERNS, AMBIENT) ·
 *               số giả ngẫu nhiên ổn định (hash) · vẽ procedural · ctx.save/restore + try/finally
 * Bài học:      docs/learn/08-camera-parallax.md (chính) · docs/learn/07-ve-canvas-procedural-cache.md ·
 *               docs/learn/12-data-driven-man-cau-do-hanh-trinh.md
 * Phụ thuộc:    LÚC LOAD: OG.Palette, OG.util, OG.W/H/FLOOR_Y (đọc một lần để lấy hằng) — load SAU src/gfx/sprites.js.
 *               LÚC CHẠY: OG.Scenery (getTheme, baseOf, drawLayer, drawDecor), OG.Decor (shade, face), OG.Level.state, OG.font
 * Event:        phát: (không) · nghe: (không)
 * API công khai: OG.Sprites.drawBackground(ctx, theme, camX, t), drawPlatform(ctx, plat, theme, t),
 *               drawDecor(ctx, theme, worldW, t), drawOverlay(ctx, theme, camX, t), drawProp(ctx, id, x, y, t, opts) -> bool,
 *               drawAmbient(ctx, amb, camX, t), resolveTheme(id), SCENERY_BUILTIN, PLATFORM_PATTERNS, AMBIENT_KINDS
 * Đọc tiếp:     src/core/scenery-registry.js (sổ đăng ký theme/decor/lớp) → src/gfx/decor.js (thư viện lớp parallax + cache)
 *               → src/journeys/home/theme.js (một ThemeDef thật) → src/game/level.js (nơi gọi các hàm vẽ)
 * Dữ liệu:      ThemeDef, SceneryLayer, Platform (src/types.d.ts); typedef cục bộ ResolvedTheme, PlatformStyle, PatternDef bên dưới.
 * ========================================================================== */
/* Hợp đồng: docs/ARCHITECTURE.md mục 8.1 + docs/STORY.md mục 4.
 *
 *   OG.Sprites.drawBackground(ctx, theme, camX, t)   MÀN HÌNH, phủ kín 960×540: trời → mặt trời/trăng/sao → mây → các lớp parallax
 *   OG.Sprites.drawPlatform(ctx, plat, theme, t)     THẾ GIỚI; plat = {x,y,w,h,isFloor}; kiểu sàn theo platformStyle
 *   OG.Sprites.drawDecor(ctx, theme, worldW, t)      THẾ GIỚI, sau sàn: decor không 'front' + gag nền
 *   OG.Sprites.drawOverlay(ctx, theme, camX, t)      MÀN HÌNH, sau thế giới: decor 'front' + hạt môi trường (ambient)
 *   OG.Sprites.drawProp(ctx, id, x, y, t, opts) -> bool
 *        pizza | coin | heart | shield | star (tâm) · exit (x = mép trái, y = mặt sàn, opts.open)
 *        page (tâm, opts.collected) · gate (x = mép trái, y = mặt sàn, opts.open) · checkpoint (x = cột, y = mặt sàn, opts.reached)
 *
 * theme = id chủ đề: 5 chủ đề gốc v1 (kitchen | garden | roof | lair | boss) vẽ bằng ThemeDef dựng sẵn bên dưới,
 * hoặc id đăng ký qua OG.Scenery.registerTheme. Chủ đề chỉ có {base} = vẽ y như chủ đề gốc. Phần nào ThemeDef bỏ trống
 * (nền / sàn / decor / lớp phủ) thì mượn chủ đề gốc (def.base, mặc định 'garden').
 *
 * Mở rộng ThemeDef (tuỳ chọn, ngoài hợp đồng tối thiểu):
 *   sky.mid (màu giữa), sky.sun {x,y,r,color,face}, sky.moon {x,y,r}, sky.rainbow, sky.stars (true | số lượng),
 *   sky.clouds {color,count,y,spread,speed,scale,face}
 *   platformStyle.floor/ledge.pattern: 'plain'|'grass'|'tiles'|'wood'|'roof'|'brick'|'stone'|'metal'|'sand'|'snow'|'ice'|'cave'|'cloud'
 *     + accent (màu phụ), hazard (sọc vàng đen cho metal), flowers (grass)
 *   decor[i].kinds: ['a','b'] (luân phiên), decor[i].jitter (px, lệch ngẫu nhiên ổn định), decor[i].air: true (không cần sàn)
 *   gags: ['gagBob','gagRoach','gagCat'] — gag nền đặt ngẫu nhiên (ổn định) dọc màn
 *   ambient: {kind:'snow'|'leaves'|'petals'|'bubbles'|'sparkle'|'fireflies'|'dust'|'hearts'|'stars', color, count, speed}
 * Hiệu năng: lớp tĩnh (hills, mountains, city, forest, kitchenWall…) được cache vào canvas phụ (OG.Decor.registerTiled),
 * mây là ảnh cache; decor/sàn chỉ vẽ phần nằm trong khung nhìn. */

/**
 * @typedef {Object} ResolvedTheme  kết quả resolve(): mỗi PHẦN của cảnh lấy từ ThemeDef nào
 * @property {any} bg     ThemeDef dùng cho nền (trời + lớp parallax)
 * @property {any} plat   ThemeDef dùng cho sàn/bục
 * @property {any} decor  ThemeDef dùng cho decor thế giới, null = không vẽ decor
 * @property {any} over   ThemeDef dùng cho lớp phủ (decor 'front' + ambient), null = không vẽ
 * @property {any} base   chủ đề gốc v1 dùng làm dự phòng
 * @property {string} id  id chủ đề được yêu cầu
 */
/**
 * @typedef {Object} PlatformStyle  kiểu sàn đã gộp xong (ThemeDef → chủ đề gốc → bảng màu mặc định)
 * @property {string} pattern  tên hoạ tiết trong PATTERNS
 * @property {string} fill     màu thân
 * @property {string} top      màu mép trên
 * @property {number} topH     độ dày mép trên, px
 * @property {number} radius   bo góc, px
 * @property {string} [accent]   màu phụ của hoạ tiết
 * @property {boolean} [hazard]  metal: sọc cảnh báo vàng đen
 * @property {boolean} [flowers] grass: false = không rải hoa
 * @property {number} [size]     tiles: cạnh ô gạch, px
 * @property {boolean} [outline]  false = không viền ink
 */
/**
 * @typedef {(ctx: CanvasRenderingContext2D, plat: any, st: PlatformStyle, x0: number, x1: number, t?: number) => void} PatternPaintFn
 *   vẽ một phần hoạ tiết; [x0, x1] = khoảng x THẾ GIỚI đang nhìn thấy của bục (đã culling)
 */
/**
 * @typedef {Object} PatternDef  một hoạ tiết sàn = tối đa 3 bước vẽ
 * @property {PatternPaintFn} [body]   thân (vẽ trong vùng clip của bục)
 * @property {PatternPaintFn} [top]    mép trên (trong vùng clip)
 * @property {PatternPaintFn} [above]  phần nhô LÊN trên mép (ngoài clip, vẽ sau viền: ngọn cỏ, tuyết...)
 */

(function () {
  'use strict';
  var OG = window.OG;
  OG.Sprites = OG.Sprites || {};
  var P = OG.Palette || {};      // bảng màu chung (OG.Palette); P ở file này = palette
  var U = OG.util || {};
  var W = OG.W || 960, H = OG.H || 540, FLOOR = OG.FLOOR_Y || 480; // px logic; FLOOR = y mặt sàn chính (thế giới)
  var TAU = Math.PI * 2;
  var INK = P.ink || '#17233d';  // màu viền "mực" kiểu hoạt hình

  // ---- Hằng số có tên (tránh "magic number" — con số trần không rõ ý nghĩa giữa code) ----
  // 💡 Khái niệm: parallax — hệ số nhân với camX. 0 = đứng yên như dán trên kính, 1 = trôi cùng thế giới.
  // Vật càng xa (mặt trời, sao) hệ số càng nhỏ → mắt người cảm nhận chiều sâu dù tất cả chỉ là hình 2D.
  var SKY_PARALLAX = 0.03;          // mặt trời, mặt trăng, sao: gần như đứng yên
  var RAINBOW_PARALLAX = 0.05;      // cầu vồng: xa nhưng nhích hơn mặt trời một chút
  var SIMPLE_CLOUD_PARALLAX = 0.15; // mây dự phòng (khi thư viện chưa có lớp 'clouds')
  var SIMPLE_CLOUD_DRIFT = 6;       // px/giây: mây dự phòng tự trôi theo thời gian
  var CLOUD_LAYER_PARALLAX = 0.1;   // mặc định cho lớp 'clouds' sinh từ sky.clouds
  var AMBIENT_PARALLAX = 0.6;       // hạt bay ở lớp phủ: gần người xem nên trôi khá nhanh
  // Culling: độ nới (px) quanh khung nhìn. Nới đủ rộng để vật to (cây, nhà) nhô vào mép không bị "bật" ra đột ngột.
  var VIEW_PAD_DEFAULT = 60;
  var PLATFORM_VIEW_PAD = 30;
  var DECOR_VIEW_PAD = 220;
  var FLOOR_SEGMENT_MIN_Y = 470;    // px thế giới: bục có mép trên y ≥ ngưỡng này (trục y hướng xuống → nằm thấp, sát FLOOR)
                                    // được coi là sàn chính. Lưu ý: floorSegments so ≥, drawStyledPlatform so > (đúng 470 thì khác nhau).
  var DECOR_MIN_EVERY = 40;         // px: khoảng cách lặp decor nhỏ nhất (chống ThemeDef ghi every quá nhỏ → hàng nghìn decor)
  var DECOR_DEFAULT_EVERY = 400;    // px
  var DECOR_DEFAULT_START = 120;    // px thế giới: decor đầu tiên
  var DECOR_FOOT_HALF = 24;         // px (ở scale 1): nửa bề ngang "chân" decor, dùng để kiểm tra có sàn bên dưới
  var GAG_SPACING = 1400;           // px: mỗi đoạn dài chừng này có 1 gag nền
  var GAG_FIRST_X = 480;            // px thế giới: gag đầu tiên không sát điểm xuất phát
  var GAG_SPREAD = 600;             // px: độ lệch ngẫu nhiên (ổn định) của gag trong đoạn
  var GAG_END_MARGIN = 300;         // px: không đặt gag sát cửa ra
  var GAG_FOOT_HALF = 60;           // px: nửa bề ngang gag cần sàn bên dưới

  function font(px, weight) {
    return OG.font ? OG.font(px, weight) : (weight ? weight + ' ' : '') + px + 'px "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';
  }
  // ---------------------------------------------------------------------------
  // Tiện ích chung
  // ---------------------------------------------------------------------------
  // wrap: modulo luôn dương (JS: -5 % 100 = -5). Dùng cho mọi thứ "cuộn vòng" theo camera/thời gian.
  function wrap(x, span) { return ((x % span) + span) % span; }
  // 💡 Khái niệm: số giả ngẫu nhiên ỔN ĐỊNH — cùng n luôn ra cùng số 0..1. Khác Math.random(): vẽ lại mỗi frame
  // mà vị trí sỏi, hoa, sao vẫn đứng yên (không nhấp nháy), lại không cần lưu mảng toạ độ nào.
  function hash(n) { var s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
  function strHash(s) { var h = 0; s = String(s || ''); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 9973; return h; }
  function rr(ctx, x, y, w, h, r) {
    if (U.roundRectPath) U.roundRectPath(ctx, x, y, w, h, r);
    else { ctx.beginPath(); ctx.rect(x, y, w, h); }
  }
  function fillRound(ctx, x, y, w, h, r, c) { ctx.fillStyle = c; rr(ctx, x, y, w, h, r); ctx.fill(); }
  // shade/face mượn OG.Decor (load SAU file này) nên phải tra LÚC CHẠY; thiếu Decor thì vẫn vẽ được bản đơn giản.
  function shade(c, k) { return OG.Decor && OG.Decor.shade ? OG.Decor.shade(c, k) : c; }
  function face(ctx, x, y, s, mood, t) {
    if (OG.Decor && OG.Decor.face) { OG.Decor.face(ctx, x, y, s, mood, t); return; }
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x - 6 * s, y, 2.3 * s, 0, TAU); ctx.arc(x + 6 * s, y, 2.3 * s, 0, TAU); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.8 * s; ctx.beginPath(); ctx.arc(x, y + 3 * s, 4 * s, 0.25, Math.PI - 0.25); ctx.stroke();
  }
  function star(ctx, x, y, ro, ri, rot) {
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var r = i % 2 ? ri : ro, a = (rot || 0) + (i * Math.PI) / 5 - Math.PI / 2;
      if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
  }
  function inkStroke(ctx, w) { ctx.strokeStyle = INK; ctx.lineWidth = w || 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); }

  /**
   * Tính khoảng x THẾ GIỚI đang nhìn thấy, suy ngược từ ma trận biến đổi hiện tại của canvas.
   * 💡 Khái niệm: culling — chỉ vẽ phần lọt vào khung nhìn. Màn dài 6000 px nhưng mỗi frame chỉ thấy ~960 px,
   * nên bỏ qua phần còn lại giúp tiết kiệm phần lớn lệnh vẽ.
   * ctx.getTransform() trả ma trận {a, b, c, d, e, f}: a = tỉ lệ ngang, e = độ dịch ngang (px màn hình).
   * Camera dịch thế giới bằng translate(-camX) nên điểm màn hình 0 ứng với x thế giới = -e / a.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} [pad=60]  px nới thêm mỗi bên
   * @returns {number[]} [xTrái, xPhải] thế giới; [-1e9, 1e9] nếu không đọc được ma trận (vd DOM giả trong test)
   */
  function visibleRange(ctx, pad) {
    pad = pad == null ? VIEW_PAD_DEFAULT : pad;
    try {
      var m = ctx.getTransform && ctx.getTransform();
      var cw = (ctx.canvas && ctx.canvas.width) || W;
      // ⚠️ Bẫy: chỉ suy được khi ma trận không xoay (b ≈ 0) và không lật (a > 0); ngoài ra trả khoảng "vô hạn" để vẽ hết cho an toàn.
      if (m && m.a > 0 && Math.abs(m.b) < 1e-6) { var x0 = -m.e / m.a; return [x0 - pad, x0 + cw / m.a + pad]; }
    } catch (e) { /* bỏ qua */ }
    return [-1e9, 1e9];
  }

  // ===========================================================================
  // 5 CHỦ ĐỀ GỐC v1 (dựng bằng ThemeDef + lớp/decor thư viện)
  // ===========================================================================
  // 💡 Khái niệm: data-driven design — chủ đề gốc cũng chỉ là DỮ LIỆU cùng định dạng với ThemeDef của hành trình.
  // Một bộ vẽ duy nhất phục vụ mọi chủ đề; thêm chủ đề mới = thêm object, không thêm code vẽ.
  // layers xếp từ XA → GẦN (parallax tăng dần) vì lớp vẽ sau đè lên lớp vẽ trước.
  // 🧪 Thử: trong garden đổi parallax của lớp 'forest' 0.22 → 0.9 rồi chạy sang phải: rừng trôi gần bằng tốc độ sàn, mất cảm giác xa.
  var BUILTIN = {
    kitchen: {
      name: 'Nhà bếp',
      sky: { top: '#ffe2b8', bottom: '#fff3dc', clouds: false },
      layers: [
        { kind: 'kitchenWall', parallax: 0.12, y: 300, spacing: 300 },
        { kind: 'kitchenCounter', parallax: 0.35, y: 392, spacing: 420 }
      ],
      platformStyle: {
        floor: { pattern: 'tiles', fill: '#fff1d6', accent: '#ffcf9e', top: '#c98b4f', topH: 10, radius: 10 },
        ledge: { pattern: 'wood', fill: '#d9a066', top: '#f5d28b', topH: 6, radius: 8 }
      },
      decor: [
        { kind: 'toaster', every: 1500, start: 260, scale: 0.9 },
        { kind: 'teapot', every: 1100, start: 520 },
        { kind: 'salt', every: 1300, start: 820 }, { kind: 'pepper', every: 1300, start: 856 },
        { kind: 'plant', every: 1400, start: 1120, scale: 0.9 }
      ],
      gags: ['gagRoach'],
      ambient: { kind: 'dust', color: 'rgba(255,255,255,0.8)', count: 14 }
    },
    garden: {
      name: 'Khu vườn',
      sky: { top: '#76d8f2', bottom: '#e8f6c7', sun: { x: 800, y: 96, r: 42 }, clouds: { count: 5 } },
      layers: [
        { kind: 'hills', parallax: 0.1, y: 400, height: 90, color: '#b5e3a0', spacing: 420 },
        { kind: 'forest', parallax: 0.22, y: 440, height: 110, color: '#5fb36a', spacing: 92 },
        { kind: 'hills', parallax: 0.4, y: 478, height: 42, color: '#8fd27a', spacing: 300, flowers: true }
      ],
      platformStyle: {
        floor: { pattern: 'grass', fill: '#c98b4f', top: '#6cc35a', topH: 14, radius: 10 },
        ledge: { pattern: 'wood', fill: '#b97945', top: '#8fdc6a', topH: 7, radius: 9 }
      },
      decor: [
        { kind: 'flower', every: 260, start: 140, jitter: 50 },
        { kind: 'bush', every: 900, start: 520 },
        { kind: 'tree', every: 1300, start: 960, scale: 0.9 },
        { kind: 'mushroom', every: 1100, start: 760, scale: 0.8 },
        { kind: 'fence', every: 1700, start: 1320, scale: 0.9 },
        { kind: 'snail', every: 1500, start: 1150 },
        { kind: 'butterfly', every: 700, start: 360, air: true },
        { kind: 'grass', every: 330, start: 60, scale: 0.8, front: true, jitter: 60 }
      ],
      gags: ['gagBob', 'gagCat'],
      ambient: { kind: 'leaves', count: 10 }
    },
    roof: {
      name: 'Mái nhà',
      sky: { top: '#ff9f7c', mid: '#ffc49a', bottom: '#ffe3a6', sun: { x: 760, y: 170, r: 60, color: '#fff1b8' }, clouds: { color: '#ffe8de', count: 4 } },
      layers: [
        { kind: 'city', parallax: 0.1, y: 430, height: 170, color: '#d6a0a8', window: '#ffe9a8', spacing: 110 },
        { kind: 'roofHouses', parallax: 0.3, y: 480, height: 160, color: '#c97a5e', spacing: 210 }
      ],
      platformStyle: {
        floor: { pattern: 'roof', fill: '#b5523b', top: '#de7a52', topH: 8, radius: 8 },
        ledge: { pattern: 'brick', fill: '#9c4a3a', top: '#f0a77e', topH: 6, radius: 5 }
      },
      decor: [
        { kind: 'chimney', every: 900, start: 300 },
        { kind: 'antenna', every: 1100, start: 680 },
        { kind: 'plant', every: 1500, start: 1060, scale: 0.85 }
      ],
      gags: ['gagCat'],
      ambient: { kind: 'sparkle', color: '#fff3c4', count: 10 }
    },
    lair: {
      name: 'Hang ổ',
      sky: { top: '#241c3a', bottom: '#4d3d6b', clouds: false },
      layers: [
        { kind: 'caveRocks', parallax: 0.2, y: 470, height: 150, color: 'rgba(27,21,48,0.35)', spacing: 300 },
        { kind: 'caveCeiling', parallax: 0.25, height: 120, color: '#1b1530', spacing: 110 },
        { kind: 'roachEyes', parallax: 0.32, y: 170, height: 200 },
        { kind: 'caveRocks', parallax: 0.38, y: 482, height: 100, color: 'rgba(27,21,48,0.6)', spacing: 240 }
      ],
      platformStyle: {
        floor: { pattern: 'cave', fill: '#3d3352', top: '#6d5c90', topH: 8, radius: 10 },
        ledge: { pattern: 'stone', fill: '#594b78', top: '#9a89c0', topH: 6, radius: 8 }
      },
      decor: [
        { kind: 'mushroom', every: 330, start: 120, scale: 0.7, opts: { color: '#c59bff', glow: true } },
        { kind: 'crystal', every: 900, start: 600 },
        { kind: 'crate', every: 1300, start: 940 },
        { kind: 'bin', every: 1600, start: 1260 }
      ],
      ambient: { kind: 'fireflies', color: '#c8ff9a', count: 16 }
    },
    boss: null // = kitchen (gán bên dưới, đổi màu nhẹ)
  };
  BUILTIN.boss = Object.assign({}, BUILTIN.kitchen, {
    name: 'Đấu trường', gags: [],
    sky: { top: '#ffcf9a', bottom: '#fff0d4', clouds: false },
    layers: [{ kind: 'kitchenWall', parallax: 0.12, y: 300, spacing: 300, color: '#ffc58f' }, { kind: 'kitchenCounter', parallax: 0.35, y: 392, spacing: 420 }]
  });
  // __builtin đánh dấu chủ đề gốc: drawOneDecor dựa vào cờ này để KHÔNG vẽ hình dự phòng cho chủ đề gốc.
  Object.keys(BUILTIN).forEach(function (k) { BUILTIN[k].id = k; BUILTIN[k].__builtin = true; });

  // ---------------------------------------------------------------------------
  // Tra chủ đề: registry + mượn từng phần từ chủ đề gốc
  // ---------------------------------------------------------------------------
  function hasBg(d) { return !!(d.sky || d.layers || (d.drawCustom && d.drawCustom.background)); }
  /**
   * Tìm ThemeDef cho TỪNG PHẦN của cảnh (nền / sàn / decor / lớp phủ).
   * 💡 Khái niệm: registry + fallback theo phần — ThemeDef của hành trình chỉ cần khai phần nó muốn đổi
   * (vd chỉ đổi sky), phần còn lại tự mượn chủ đề gốc def.base. Nhờ vậy ThemeDef tối giản vẫn vẽ ra cảnh đầy đủ.
   * @param {string} theme  id chủ đề (gốc v1 hoặc đã registerTheme)
   * @returns {ResolvedTheme}
   */
  function resolve(theme) {
    var S = OG.Scenery;
    var reg = S && S.getTheme ? S.getTheme(theme) : null;
    if (!reg) { var b = BUILTIN[theme] || BUILTIN.garden; return { bg: b, plat: b, decor: b, over: b, base: b, id: b.id }; }
    var base = BUILTIN[S.baseOf ? S.baseOf(theme) : 'garden'] || BUILTIN.garden;
    var own = hasBg(reg), cu = reg.drawCustom || {};
    var hasPlat = !!(reg.platformStyle || cu.platform);
    var hasDec = !!(reg.decor || cu.decor || reg.gags);
    // alias = ThemeDef chỉ có {base}: coi như "tên khác" của chủ đề gốc → mượn cả lớp phủ.
    var alias = !own && !hasPlat && !hasDec && !reg.ambient;
    return {
      bg: own ? reg : base,
      plat: hasPlat ? reg : base,
      // ⚠️ Bẫy: theme có nền RIÊNG mà không khai decor thì KHÔNG mượn decor gốc — tránh cảnh biển lại mọc nấm của khu vườn.
      decor: hasDec ? reg : (own ? null : base),
      over: (reg.ambient || (reg.decor && hasFront(reg))) ? reg : (alias ? base : null),
      base: base, id: theme
    };
  }
  // Ghi nhớ (memo) kết quả vào chính ThemeDef: hàm này chạy mỗi frame, không cần quét lại mảng decor.
  function hasFront(d) {
    if (d.__front == null) d.__front = !!(d.decor && d.decor.some && d.decor.some(function (x) { return x && x.front; }));
    return d.__front;
  }

  // ===========================================================================
  // NỀN: trời, mặt trời, trăng, sao, cầu vồng, mây, lớp parallax  (toạ độ MÀN HÌNH, 0..960 × 0..540)
  // ===========================================================================
  // Mặt trời: (sun.x, sun.y) = tâm trên màn hình, r = bán kính px. Quầng sáng "thở" theo t, tia nắng quay chậm.
  function drawSun(ctx, sun, cam, t) {
    var x = (sun.x == null ? 790 : sun.x) - cam * SKY_PARALLAX, y = sun.y == null ? 100 : sun.y, r = sun.r || 46, c = sun.color || '#ffe066';
    ctx.save();
    ctx.translate(x, y);
    // quầng sáng
    ctx.fillStyle = 'rgba(255,240,170,0.35)'; ctx.beginPath(); ctx.arc(0, 0, r * 1.55 + Math.sin(t * 2) * 3, 0, TAU); ctx.fill();
    // tia nắng: save/restore lồng nhau để phép xoay chỉ áp cho tia, không áp cho mặt
    ctx.save(); ctx.rotate(t * 0.15);
    ctx.fillStyle = shade(c, 0.1);
    ctx.beginPath();
    for (var i = 0; i < 12; i++) {
      var a = i * TAU / 12, a2 = a + 0.13, l = r * (i % 2 ? 1.32 : 1.45);
      ctx.moveTo(Math.cos(a - 0.13) * r * 1.05, Math.sin(a - 0.13) * r * 1.05); ctx.lineTo(Math.cos(a) * l, Math.sin(a) * l); ctx.lineTo(Math.cos(a2) * r * 1.05, Math.sin(a2) * r * 1.05);
    }
    ctx.fill();
    ctx.restore();
    // đĩa mặt trời + vệt sáng + mặt cười
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fillStyle = c; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(23,35,61,0.35)'; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.ellipse(-r * 0.4, -r * 0.45, r * 0.25, r * 0.13, -0.6, 0, TAU); ctx.fill();
    if (sun.face !== false) face(ctx, 0, -r * 0.08, r / 26, sun.mood || 'smile', t);
    ctx.restore();
  }
  function drawMoon(ctx, m, cam, t) {
    var x = (m.x == null ? 780 : m.x) - cam * SKY_PARALLAX, y = m.y == null ? 100 : m.y, r = m.r || 34;
    ctx.save();
    ctx.fillStyle = 'rgba(255,250,210,0.18)'; ctx.beginPath(); ctx.arc(x, y, r * 1.7, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = m.color || '#fff6c8'; ctx.fill();
    ctx.fillStyle = 'rgba(220,200,140,0.5)'; ctx.beginPath(); ctx.arc(x + r * 0.35, y + r * 0.3, r * 0.18, 0, TAU); ctx.arc(x - r * 0.4, y - r * 0.35, r * 0.12, 0, TAU); ctx.fill();
    if (m.face !== false) face(ctx, x - r * 0.1, y - r * 0.05, r / 28, 'sleep');
    ctx.restore();
  }
  // Sao trên trời: vị trí từ hash(s) (ổn định), độ sáng nhấp nháy theo sin với tần số riêng từng ngôi.
  function drawSkyStars(ctx, n, cam, t) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (var s = 0; s < n; s++) {
      // wrap(..., W): sao trôi ra mép trái thì hiện lại ở mép phải → bầu trời "vô tận" chỉ với n điểm.
      var sx = wrap(hash(s) * 1400 - cam * SKY_PARALLAX, W), sy = hash(s + 77) * 320, tw = 0.5 + 0.5 * Math.sin(t * (1.2 + hash(s + 5) * 2) + s);
      var r = 0.8 + hash(s + 9) * 1.6 * tw;
      if (s % 8 === 0) { star(ctx, sx, sy, r * 2.4, r, 0); ctx.fill(); } else ctx.fillRect(sx - r / 2, sy - r / 2, r, r);
    }
    ctx.restore();
  }
  function drawRainbow(ctx, rb, cam) {
    var x = (rb.x == null ? 300 : rb.x) - cam * RAINBOW_PARALLAX, y = rb.y == null ? 420 : rb.y, r = rb.r || 260;
    var cols = ['#ff6f6f', '#ffb347', '#ffe066', '#7fd08a', '#6fbcf0', '#a98cff'];
    ctx.save(); ctx.globalAlpha *= rb.alpha == null ? 0.55 : rb.alpha; ctx.lineWidth = 12;
    for (var i = 0; i < cols.length; i++) { ctx.strokeStyle = cols[i]; ctx.beginPath(); ctx.arc(x, y, r - i * 12, Math.PI, TAU); ctx.stroke(); }
    ctx.restore();
  }
  // Mây dự phòng: chỉ dùng khi thư viện decor.js chưa đăng ký lớp 'clouds'.
  function drawSimpleClouds(ctx, cc, cam, t) {
    var n = cc.count || 5;
    ctx.save(); ctx.fillStyle = cc.color || '#ffffff';
    for (var i = 0; i < n; i++) {
      // Cuộn trong khoảng W + 180 (rộng hơn màn hình) rồi lùi 80 px: mây ra/vào khuất hẳn sau mép, không "bật" hiện ra.
      var x = wrap(i * 230 - cam * SIMPLE_CLOUD_PARALLAX + t * SIMPLE_CLOUD_DRIFT, W + 180) - 80, y = 60 + (i % 3) * 42;
      ctx.beginPath(); ctx.arc(x, y, 22, 0, TAU); ctx.arc(x + 24, y - 8, 28, 0, TAU); ctx.arc(x + 50, y, 20, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  /**
   * Vẽ một lớp parallax L (SceneryLayer) phủ ngang màn hình. Việc thật giao cho OG.Scenery.drawLayer (tra kind trong registry).
   * @param {CanvasRenderingContext2D} ctx
   * @param {SceneryLayer} L  lớp: kind, parallax, y, height, color, spacing...
   * @param {number} cam  camX, px thế giới
   * @param {number} t    đồng hồ, giây
   * @param {any} def     ThemeDef chứa lớp (để lớp tuỳ biến đọc màu chủ đề)
   */
  function drawLayer(ctx, L, cam, t, def) {
    var S = OG.Scenery;
    if (S && S.drawLayer) { S.drawLayer(ctx, L, cam, t, def); return; }
    // Không có sổ đăng ký (trang demo rút gọn): dãy đồi đơn giản.
    ctx.save();
    // 💡 Khái niệm: công thức parallax cốt lõi — độ lệch = (camX × parallax) mod span. Lớp lặp lại mỗi span px
    // nên chỉ cần vẽ đủ số ô phủ màn hình, dịch đi "off" px; camera chạy mãi vẫn không hết hình.
    var y = L.y == null ? 420 : L.y, span = L.spacing || 320, off = wrap(cam * (L.parallax || 0.3), span);
    ctx.fillStyle = L.color || '#9fd88a';
    for (var i = -1; i * span - off < W + span; i++) { ctx.beginPath(); ctx.ellipse(i * span - off + span / 2, y, span * 0.6, L.height || 60, 0, Math.PI, TAU); ctx.fill(); }
    ctx.fillRect(0, y, W, H - y);
    ctx.restore();
  }

  // Thứ tự vẽ nền = thứ tự chiều sâu (xa vẽ trước): gradient trời → sao → cầu vồng → mặt trời → trăng → mây → layers[].
  function drawThemeBackground(ctx, def, cam, t) {
    var cu = def.drawCustom || {};
    // Hook mở rộng: ThemeDef tự vẽ toàn bộ nền thì bộ vẽ chuẩn nhường hẳn.
    if (typeof cu.background === 'function') { cu.background(ctx, cam, t, def); return; }
    var sky = def.sky || {};
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, sky.top || P.skyTop || '#76d8f2');
    if (sky.mid) g.addColorStop(0.5, sky.mid);
    g.addColorStop(1, sky.bottom || P.skyBottom || '#e8f6c7');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (sky.stars) drawSkyStars(ctx, typeof sky.stars === 'number' ? sky.stars : 50, cam, t);
    if (sky.rainbow) drawRainbow(ctx, sky.rainbow === true ? {} : sky.rainbow, cam);
    if (sky.sun) drawSun(ctx, sky.sun === true ? {} : sky.sun, cam, t);
    if (sky.moon) drawMoon(ctx, sky.moon === true ? {} : sky.moon, cam, t);
    // Mây: mặc định CÓ, trừ khi clouds === false; trời có sao (ban đêm) thì mặc định KHÔNG, trừ khi khai clouds rõ ràng.
    if (sky.clouds !== false && !sky.stars || (sky.clouds && sky.stars)) {
      var cc = sky.clouds && typeof sky.clouds === 'object' ? sky.clouds : {};
      var S = OG.Scenery;
      if (S && S.hasLayer && S.hasLayer('clouds')) {
        // Dịch cấu hình sky.clouds (tên field thân thiện: spread) sang một SceneryLayer chuẩn (height) rồi vẽ như mọi lớp khác.
        drawLayer(ctx, { kind: 'clouds', parallax: cc.parallax == null ? CLOUD_LAYER_PARALLAX : cc.parallax, y: cc.y || 135, height: cc.spread || 85,
          count: cc.count || 5, color: cc.color || '#ffffff', speed: cc.speed, scale: cc.scale, face: cc.face, alpha: cc.alpha }, cam, t, def);
      } else drawSimpleClouds(ctx, cc, cam, t);
    }
    var layers = def.layers || [];
    for (var k = 0; k < layers.length; k++) if (layers[k]) drawLayer(ctx, layers[k], cam, t, def);
  }

  /**
   * Vẽ nền của chủ đề (trời + mặt trời/trăng/sao + mây + các lớp parallax), phủ kín 960×540 toạ độ MÀN HÌNH.
   * Gọi TRƯỚC khi áp camera (chưa translate), vì parallax tự tính độ lệch từ camX.
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} theme  id chủ đề, vd 'garden' hoặc id đã OG.Scenery.registerTheme
   * @param {number} [cam=0]  camX: mép trái camera, px thế giới
   * @param {number} [t=0]    đồng hồ hoạt ảnh, giây
   * @example
   *   OG.Sprites.drawBackground(ctx, 'garden', OG.Camera.x, OG.time);
   */
  OG.Sprites.drawBackground = function (ctx, theme, cam, t) {
    var r = resolve(theme);
    // ⚠️ Bẫy: try/finally bảo đảm restore() luôn chạy — một lớp lỗi giữa chừng mà thiếu restore thì
    // fillStyle/alpha/transform rò sang mọi thứ vẽ sau (nhân vật mờ, lệch...), lỗi rất khó lần ra.
    ctx.save();
    try { drawThemeBackground(ctx, r.bg, cam || 0, t || 0); }
    finally { ctx.restore(); }
  };

  // ===========================================================================
  // SÀN & BỤC theo platformStyle (pattern)  (toạ độ THẾ GIỚI, camera đã translate)
  // ===========================================================================
  // 💡 Khái niệm: bảng chiến lược (strategy table) — mỗi hoạ tiết là một object {body, top, above} cùng "chữ ký" hàm.
  // drawStyledPlatform không cần biết hoạ tiết nào, chỉ gọi PATTERNS[tên].body(...). Thêm hoạ tiết = thêm một mục.
  // Mọi hàm hoạ tiết nhận (ctx, plat, st, x0, x1, t): plat = bục {x,y,w,h}, st = PlatformStyle, [x0, x1] = phần nhìn thấy.
  // Mẹo chung: vòng lặp bắt đầu từ Math.floor(x0 / bước) * bước — neo vào lưới toạ độ THẾ GIỚI, nên khi camera
  // trượt, hoa văn đứng yên trên bục thay vì "chạy" theo khung nhìn.
  /** @type {Object<string, PatternDef>} */
  var PATTERNS = {};

  // Cỏ: đất có sỏi, dải cỏ viền vỏ sò, ngọn cỏ nhô lên, hoa nhỏ.
  PATTERNS.grass = {
    body: function (ctx, plat, st, x0, x1) {
      var dark = shade(st.fill, -0.15), light = shade(st.fill, 0.15);
      for (var x = Math.floor(x0 / 37) * 37; x < x1; x += 37) {
        var h1 = hash(x), yy = plat.y + st.topH + 10 + h1 * (plat.h - st.topH - 16);
        ctx.fillStyle = h1 > 0.5 ? dark : light;
        ctx.beginPath(); ctx.ellipse(x + h1 * 20, yy, 4 + h1 * 3, 2.5 + h1 * 1.5, 0, 0, TAU); ctx.fill();
      }
    },
    top: function (ctx, plat, st, x0, x1) {
      var th = st.topH;
      ctx.fillStyle = st.top; ctx.fillRect(x0, plat.y, x1 - x0, th);
      ctx.beginPath();
      for (var x = Math.floor(x0 / 16) * 16; x < x1; x += 16) { ctx.moveTo(x + 16, plat.y + th); ctx.arc(x + 8, plat.y + th, 8, 0, Math.PI); }
      ctx.fill();
      ctx.fillStyle = shade(st.top, 0.22); ctx.fillRect(x0, plat.y, x1 - x0, 3);
    },
    above: function (ctx, plat, st, x0, x1, t) {
      // ngọn cỏ nhọn và hoa nhỏ trên mép sàn
      ctx.fillStyle = st.top;
      ctx.beginPath();
      for (var x = Math.floor(x0 / 24) * 24; x < x1; x += 24) {
        if (x < plat.x + 6 || x > plat.x + plat.w - 14) continue;
        var h1 = hash(x * 0.37), sw = Math.sin(t * 2 + x * 0.05) * 1.5;
        ctx.moveTo(x, plat.y + 1); ctx.lineTo(x + 3 + sw, plat.y - 5 - h1 * 5); ctx.lineTo(x + 6, plat.y + 1);
      }
      ctx.fill();
      if (st.flowers === false) return;
      for (var fx = Math.floor(x0 / 150) * 150; fx < x1; fx += 150) {
        var hx = hash(fx + 3); if (hx < 0.45) continue;
        var px = fx + hx * 120; if (px < plat.x + 10 || px > plat.x + plat.w - 10) continue;
        ctx.fillStyle = ['#ffffff', '#ffd23f', '#ff9fc1'][Math.floor(hx * 30) % 3];
        ctx.beginPath(); ctx.arc(px, plat.y - 3, 3.2, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.arc(px, plat.y - 3, 1.2, 0, TAU); ctx.fill();
      }
    }
  };
  // Gạch men caro (bếp).
  PATTERNS.tiles = {
    body: function (ctx, plat, st, x0, x1) {
      var sz = st.size || 30, acc = st.accent || shade(st.fill, -0.1);
      ctx.fillStyle = acc;
      for (var y = plat.y + st.topH, row = 0; y < plat.y + plat.h; y += sz, row++) {
        for (var x = Math.floor(x0 / sz) * sz; x < x1; x += sz) if (((x / sz) + row) % 2 === 0) ctx.fillRect(x, y, sz, sz);
      }
      ctx.strokeStyle = 'rgba(23,35,61,0.12)'; ctx.lineWidth = 1.5; ctx.beginPath();
      for (var y2 = plat.y + st.topH; y2 < plat.y + plat.h; y2 += sz) { ctx.moveTo(x0, y2); ctx.lineTo(x1, y2); }
      for (var x2 = Math.floor(x0 / sz) * sz; x2 < x1; x2 += sz) { ctx.moveTo(x2, plat.y + st.topH); ctx.lineTo(x2, plat.y + plat.h); }
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (var x3 = Math.floor(x0 / (sz * 4)) * sz * 4; x3 < x1; x3 += sz * 4) ctx.fillRect(x3 + 5, plat.y + st.topH + 4, 8, 3);
    },
    top: function (ctx, plat, st, x0, x1) {
      ctx.fillStyle = st.top; ctx.fillRect(x0, plat.y, x1 - x0, st.topH);
      ctx.fillStyle = shade(st.top, 0.25); ctx.fillRect(x0, plat.y, x1 - x0, 3);
    }
  };
  // Ván gỗ: thớ ngang, mối nối so le, đinh.
  PATTERNS.wood = {
    body: function (ctx, plat, st, x0, x1) {
      var rowH = plat.h > 30 ? 14 : Math.max(6, (plat.h - st.topH) / 2);
      ctx.strokeStyle = shade(st.fill, -0.25); ctx.lineWidth = 1.6; ctx.beginPath();
      var row = 0;
      for (var y = plat.y + st.topH + rowH; y < plat.y + plat.h - 2; y += rowH, row++) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
      for (var r = 0, yy = plat.y + st.topH; yy < plat.y + plat.h; yy += rowH, r++) {
        for (var x = Math.floor(x0 / 64) * 64 + (r % 2) * 32; x < x1; x += 64) { ctx.moveTo(x, yy); ctx.lineTo(x, Math.min(yy + rowH, plat.y + plat.h)); }
      }
      ctx.stroke();
      ctx.fillStyle = shade(st.fill, -0.35);
      for (var nx = Math.floor(x0 / 64) * 64 + 6; nx < x1; nx += 64) { ctx.beginPath(); ctx.arc(nx, plat.y + st.topH + rowH * 0.5, 1.6, 0, TAU); ctx.fill(); }
      ctx.strokeStyle = shade(st.fill, 0.15); ctx.lineWidth = 1.2; ctx.beginPath();
      for (var gx = Math.floor(x0 / 90) * 90 + 20; gx < x1; gx += 90) { var gy = plat.y + st.topH + rowH * 0.5 + 2; ctx.moveTo(gx, gy); ctx.quadraticCurveTo(gx + 12, gy - 3, gx + 24, gy); }
      ctx.stroke();
    },
    top: function (ctx, plat, st, x0, x1) {
      ctx.fillStyle = st.top; ctx.fillRect(x0, plat.y, x1 - x0, st.topH);
      ctx.fillStyle = shade(st.top, 0.25); ctx.fillRect(x0, plat.y, x1 - x0, 2);
    }
  };
  // Mái ngói vảy cá.
  PATTERNS.roof = {
    body: function (ctx, plat, st, x0, x1) {
      var line = st.accent || shade(st.fill, -0.25), hi = shade(st.fill, 0.12);
      for (var row = 0, ry = plat.y + st.topH + 2; ry < plat.y + plat.h + 16; ry += 16, row++) {
        var xs = Math.floor(x0 / 30) * 30 + (row % 2) * 15 - 30;
        ctx.fillStyle = row % 2 ? st.fill : hi;
        ctx.beginPath(); for (var x = xs; x < x1 + 30; x += 30) { ctx.moveTo(x + 30, ry); ctx.arc(x + 15, ry, 15, 0, Math.PI); } ctx.fill();
        ctx.strokeStyle = line; ctx.lineWidth = 2;
        ctx.beginPath(); for (var x2 = xs; x2 < x1 + 30; x2 += 30) { ctx.moveTo(x2 + 30, ry); ctx.arc(x2 + 15, ry, 15, 0, Math.PI); } ctx.stroke();
      }
    },
    top: function (ctx, plat, st, x0, x1) {
      ctx.fillStyle = st.top; ctx.fillRect(x0, plat.y, x1 - x0, st.topH);
      ctx.fillStyle = shade(st.top, 0.25); ctx.fillRect(x0, plat.y, x1 - x0, 2);
    }
  };
  // Gạch xây.
  PATTERNS.brick = {
    body: function (ctx, plat, st, x0, x1) {
      var bh = 12, bw = 28, mortar = st.accent || shade(st.fill, 0.35);
      ctx.strokeStyle = mortar; ctx.lineWidth = 2; ctx.beginPath();
      for (var r = 0, y = plat.y + st.topH; y < plat.y + plat.h; y += bh, r++) {
        ctx.moveTo(x0, y); ctx.lineTo(x1, y);
        for (var x = Math.floor(x0 / bw) * bw + (r % 2) * (bw / 2); x < x1; x += bw) { ctx.moveTo(x, y); ctx.lineTo(x, y + bh); }
      }
      ctx.stroke();
      ctx.fillStyle = shade(st.fill, -0.12);
      for (var x2 = Math.floor(x0 / (bw * 3)) * bw * 3 + 3; x2 < x1; x2 += bw * 3) ctx.fillRect(x2, plat.y + st.topH + 2, bw - 6, bh - 4);
    },
    top: PATTERNS.wood.top
  };
  // Đá cuội bo tròn.
  PATTERNS.stone = {
    body: function (ctx, plat, st, x0, x1) {
      var dark = st.accent || shade(st.fill, -0.18), light = shade(st.fill, 0.12);
      for (var r = 0, y = plat.y + st.topH + 8; y < plat.y + plat.h + 6; y += 15, r++) {
        for (var x = Math.floor(x0 / 34) * 34 + (r % 2) * 17; x < x1 + 20; x += 34) {
          var h1 = hash(x * 0.3 + y);
          ctx.fillStyle = h1 > 0.5 ? light : dark;
          ctx.beginPath(); ctx.ellipse(x, y, 13 + h1 * 3, 6 + h1 * 1.5, 0, 0, TAU); ctx.fill();
        }
      }
    },
    top: PATTERNS.wood.top
  };
  // Kim loại: tấm ghép đinh tán, vệt sáng, (tuỳ chọn) sọc cảnh báo vàng đen.
  PATTERNS.metal = {
    body: function (ctx, plat, st, x0, x1) {
      var pw = 64;
      ctx.strokeStyle = shade(st.fill, -0.25); ctx.lineWidth = 2; ctx.beginPath();
      for (var x = Math.floor(x0 / pw) * pw; x < x1; x += pw) { ctx.moveTo(x, plat.y + st.topH); ctx.lineTo(x, plat.y + plat.h); }
      ctx.stroke();
      ctx.fillStyle = shade(st.fill, 0.35);
      for (var x2 = Math.floor(x0 / pw) * pw; x2 < x1; x2 += pw) {
        ctx.beginPath(); ctx.arc(x2 + 7, plat.y + st.topH + 6, 2.2, 0, TAU); ctx.arc(x2 + pw - 7, plat.y + st.topH + 6, 2.2, 0, TAU);
        if (plat.h > 30) { ctx.arc(x2 + 7, plat.y + plat.h - 8, 2.2, 0, TAU); ctx.arc(x2 + pw - 7, plat.y + plat.h - 8, 2.2, 0, TAU); }
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      for (var x3 = Math.floor(x0 / (pw * 2)) * pw * 2; x3 < x1; x3 += pw * 2) {
        ctx.beginPath(); ctx.moveTo(x3 + 16, plat.y + plat.h); ctx.lineTo(x3 + 30, plat.y + st.topH); ctx.lineTo(x3 + 40, plat.y + st.topH); ctx.lineTo(x3 + 26, plat.y + plat.h); ctx.closePath(); ctx.fill();
      }
    },
    top: function (ctx, plat, st, x0, x1) {
      if (st.hazard) {
        ctx.fillStyle = '#ffd23f'; ctx.fillRect(x0, plat.y, x1 - x0, st.topH);
        ctx.fillStyle = INK; ctx.beginPath();
        for (var x = Math.floor(x0 / 20) * 20; x < x1; x += 20) { ctx.moveTo(x, plat.y + st.topH); ctx.lineTo(x + 8, plat.y); ctx.lineTo(x + 16, plat.y); ctx.lineTo(x + 8, plat.y + st.topH); }
        ctx.fill();
      } else { ctx.fillStyle = st.top; ctx.fillRect(x0, plat.y, x1 - x0, st.topH); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(x0, plat.y + 1, x1 - x0, 2); }
    }
  };
  // Cát: lấm tấm hạt, mép trên lượn sóng.
  PATTERNS.sand = {
    body: function (ctx, plat, st, x0, x1) {
      ctx.fillStyle = st.accent || shade(st.fill, -0.15);
      for (var x = Math.floor(x0 / 11) * 11; x < x1; x += 11) { var h1 = hash(x); ctx.fillRect(x + h1 * 8, plat.y + st.topH + 4 + h1 * (plat.h - st.topH - 8), 2, 2); }
      ctx.fillStyle = shade(st.fill, 0.2);
      for (var x2 = Math.floor(x0 / 23) * 23; x2 < x1; x2 += 23) { var h2 = hash(x2 + 9); ctx.fillRect(x2 + h2 * 10, plat.y + st.topH + 6 + h2 * (plat.h - st.topH - 10), 2, 2); }
    },
    top: function (ctx, plat, st, x0, x1) {
      ctx.fillStyle = st.top; ctx.beginPath(); ctx.moveTo(x0, plat.y);
      for (var x = Math.floor(x0 / 12) * 12; x <= x1 + 12; x += 12) ctx.lineTo(x, plat.y + st.topH + Math.sin(x * 0.08) * 2);
      ctx.lineTo(x1 + 12, plat.y); ctx.closePath(); ctx.fill();
    }
  };
  // Tuyết: thân băng xanh, lớp tuyết dày nhỏ giọt.
  PATTERNS.snow = {
    body: function (ctx, plat, st, x0, x1) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (var x = Math.floor(x0 / 40) * 40; x < x1; x += 40) { var h1 = hash(x); ctx.beginPath(); ctx.arc(x + h1 * 20, plat.y + st.topH + 14 + h1 * (plat.h - st.topH - 20), 3, 0, TAU); ctx.fill(); }
    },
    top: function (ctx, plat, st, x0, x1) {
      var c = st.top || '#ffffff';
      ctx.fillStyle = c; ctx.fillRect(x0, plat.y, x1 - x0, st.topH);
      ctx.beginPath();
      for (var x = Math.floor(x0 / 22) * 22; x < x1; x += 22) {
        var d = 3 + hash(x) * 8;
        ctx.moveTo(x, plat.y + st.topH - 1); ctx.quadraticCurveTo(x + 2, plat.y + st.topH + d, x + 7, plat.y + st.topH + d); ctx.quadraticCurveTo(x + 12, plat.y + st.topH + d, x + 14, plat.y + st.topH - 1);
      }
      ctx.fill();
    },
    above: function (ctx, plat, st) {
      ctx.fillStyle = st.top || '#ffffff';
      ctx.beginPath(); ctx.ellipse(plat.x + plat.w / 2, plat.y + 1, plat.w / 2 - 2, 4, 0, Math.PI, TAU); ctx.fill();
    }
  };
  // Băng: trong suốt, vệt sáng chéo.
  PATTERNS.ice = {
    body: function (ctx, plat, st, x0, x1, t) {
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      for (var x = Math.floor(x0 / 90) * 90; x < x1; x += 90) {
        ctx.beginPath(); ctx.moveTo(x + 10, plat.y + plat.h); ctx.lineTo(x + 34, plat.y + st.topH); ctx.lineTo(x + 42, plat.y + st.topH); ctx.lineTo(x + 18, plat.y + plat.h); ctx.closePath(); ctx.fill();
      }
      var k = wrap(t * 120, 600);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      for (var x2 = Math.floor(x0 / 600) * 600; x2 < x1; x2 += 600) { ctx.fillRect(x2 + k, plat.y + st.topH + 2, 18, 2); }
    },
    top: PATTERNS.wood.top
  };
  // Hang: đá tối + rêu phát sáng nhấp nháy.
  PATTERNS.cave = {
    body: PATTERNS.stone.body,
    top: function (ctx, plat, st, x0, x1, t) {
      ctx.fillStyle = st.top; ctx.fillRect(x0, plat.y, x1 - x0, st.topH);
      for (var x = Math.floor(x0 / 70) * 70 + 12; x < x1; x += 70) {
        var g = 0.6 + 0.4 * Math.sin(t * 2 + x * 0.03);
        ctx.fillStyle = 'rgba(127,208,138,' + g.toFixed(2) + ')';
        ctx.beginPath(); ctx.ellipse(x + hash(x) * 20, plat.y + 1, 9, 3.5, 0, 0, TAU); ctx.fill();
      }
    }
  };
  // Mây bông (bục trên trời / vũ trụ).
  PATTERNS.cloud = {
    body: function (ctx, plat, st, x0, x1) {
      ctx.fillStyle = shade(st.fill, -0.06);
      ctx.beginPath(); for (var x = Math.floor(x0 / 26) * 26; x < x1; x += 26) { ctx.moveTo(x + 26, plat.y + plat.h); ctx.arc(x + 13, plat.y + plat.h, 13, Math.PI, TAU); } ctx.fill();
    },
    top: function (ctx, plat, st, x0, x1) {
      ctx.fillStyle = st.top || '#ffffff';
      ctx.fillRect(x0, plat.y, x1 - x0, st.topH);
    },
    above: function (ctx, plat, st, x0, x1) {
      ctx.fillStyle = st.top || '#ffffff';
      ctx.beginPath(); for (var x = Math.max(plat.x + 4, Math.floor(x0 / 22) * 22); x < Math.min(plat.x + plat.w - 4, x1); x += 22) { ctx.moveTo(x + 13, plat.y + 2); ctx.arc(x + 11, plat.y + 2, 11, Math.PI, TAU); } ctx.fill();
    }
  };
  PATTERNS.plain = {
    body: function (ctx, plat, st) {
      ctx.fillStyle = 'rgba(23,35,61,0.08)'; ctx.fillRect(plat.x, plat.y + plat.h - Math.min(10, plat.h * 0.25), plat.w, Math.min(10, plat.h * 0.25));
    },
    top: PATTERNS.wood.top
  };

  /**
   * Gộp kiểu sàn theo thứ tự ưu tiên: ThemeDef → chủ đề gốc → bảng màu mặc định (OG.Palette).
   * @param {any} def      ThemeDef đang vẽ
   * @param {any} base     chủ đề gốc dự phòng
   * @param {boolean} floor true = sàn chính, false = bục (ledge)
   * @returns {PlatformStyle}
   */
  function platformStyle(def, base, floor) {
    var ps = def.platformStyle || {};
    var st = (floor ? ps.floor : ps.ledge) || {};
    var bps = (base && base.platformStyle) || {};
    var bst = (floor ? bps.floor : bps.ledge) || {};
    return {
      pattern: st.pattern || (def === base ? null : bst.pattern) || 'plain',
      fill: st.fill || bst.fill || (floor ? (P.floor || '#e9a34f') : (P.plank || '#b97945')),
      top: st.top || bst.top || (floor ? (P.grass || '#75bd59') : (P.plankTop || '#f5d28b')),
      topH: st.topH != null ? st.topH : (floor ? 12 : 6),
      radius: st.radius != null ? st.radius : (floor ? 10 : 8),
      accent: st.accent, hazard: st.hazard, flowers: st.flowers, size: st.size,
      outline: ps.outline
    };
  }

  // Vẽ một bục theo platformStyle: bóng → thân → (clip) hoạ tiết body + top → viền ink → phần nhô "above".
  function drawStyledPlatform(ctx, plat, def, base, t) {
    var floor = plat.isFloor || plat.y > FLOOR_SEGMENT_MIN_Y;
    var st = platformStyle(def, base, floor);
    var pat = PATTERNS[st.pattern] || PATTERNS.plain;
    // Culling: sàn chính có thể dài cả nghìn px — chỉ vẽ hoạ tiết trong [x0, x1]; bục khuất hẳn thì bỏ luôn.
    var vr = visibleRange(ctx, PLATFORM_VIEW_PAD);
    var x0 = Math.max(plat.x, vr[0]), x1 = Math.min(plat.x + plat.w, vr[1]);
    if (x1 <= x0) return;
    var r = Math.min(st.radius, plat.h / 2);
    // bóng đổ mềm dưới bục
    if (!floor) { ctx.fillStyle = 'rgba(23,35,61,0.14)'; rr(ctx, plat.x + 4, plat.y + 6, plat.w, plat.h, r); ctx.fill(); }
    rr(ctx, plat.x, plat.y, plat.w, plat.h, r);
    ctx.fillStyle = st.fill; ctx.fill();
    // ctx.clip(): mọi lệnh vẽ sau đó chỉ hiện bên trong hình bục bo góc → hoạ tiết không tràn ra ngoài.
    // clip không "huỷ" được, nên bọc trong save/restore để bỏ vùng clip khi xong.
    ctx.save();
    rr(ctx, plat.x, plat.y, plat.w, plat.h, r); ctx.clip();
    if (pat.body) pat.body(ctx, plat, st, x0, x1, t);
    if (pat.top) pat.top(ctx, plat, st, x0, x1, t);
    ctx.fillStyle = 'rgba(23,35,61,0.12)'; ctx.fillRect(x0, plat.y + st.topH, x1 - x0, 3);
    ctx.restore();
    // viền ink dày
    if (st.outline !== false) {
      // Sàn chính: viền khung cao thêm 20 px để cạnh đáy rơi ra ngoài màn hình — chỉ thấy viền trên và hai đầu.
      if (floor) {
        ctx.save(); rr(ctx, plat.x, plat.y, plat.w, plat.h + 20, r); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.stroke(); ctx.restore();
      } else { rr(ctx, plat.x, plat.y, plat.w, plat.h, r); inkStroke(ctx, 3); }
    }
    if (pat.above) pat.above(ctx, plat, st, x0, x1, t);
  }

  /**
   * Vẽ một sàn/bục theo platformStyle của chủ đề, toạ độ THẾ GIỚI (gọi SAU khi camera đã translate).
   * Hook ThemeDef.drawCustom.platform trả true = đã tự vẽ xong, bộ vẽ chuẩn bỏ qua.
   * @param {CanvasRenderingContext2D} ctx
   * @param {Platform} plat  {x, y, w, h, isFloor?} — x,y = góc trên-trái, px thế giới
   * @param {string} theme   id chủ đề
   * @param {number} [t=0]   đồng hồ, giây (cỏ đung đưa, rêu nhấp nháy)
   * @example
   *   OG.Level.state.platforms.forEach(function (p) { OG.Sprites.drawPlatform(ctx, p, 'garden', OG.time); });
   */
  OG.Sprites.drawPlatform = function (ctx, plat, theme, t) {
    if (!plat) return;
    var r = resolve(theme);
    ctx.save();
    try {
      var cu = r.plat.drawCustom || {};
      if (typeof cu.platform === 'function' && cu.platform(ctx, plat, t || 0, r.plat) === true) return;
      drawStyledPlatform(ctx, plat, r.plat, r.base, t || 0);
    } finally { ctx.restore(); }
  };

  // ===========================================================================
  // DECOR thế giới + GAG nền
  // ===========================================================================
  // Danh sách đoạn sàn [xTrái, xPhải] (y ≥ FLOOR_SEGMENT_MIN_Y) của màn hiện tại để decor mặt đất không lơ lửng trên hố.
  // Trả null = không biết hình màn (vd đang vẽ nền cho menu) → onFloor() cho phép mọi vị trí.
  function floorSegments(worldW) {
    var st = OG.Level && OG.Level.state;
    // worldW khác bề rộng màn đang chơi = đang vẽ cho cảnh khác (bản đồ, trang demo) → không dùng sàn của màn này.
    if (!st || !st.platforms || (st.width && worldW && st.width !== worldW)) return null;
    var out = [];
    for (var i = 0; i < st.platforms.length; i++) {
      var p = st.platforms[i];
      // Chấp nhận cả dạng object {x,y,w,h} lẫn mảng [x,y,w,h] (định dạng LevelDef thô).
      var px = p.x != null ? p.x : p[0], py = p.y != null ? p.y : p[1], pw = p.w != null ? p.w : p[2];
      if (py >= FLOOR_SEGMENT_MIN_Y) out.push([px, px + pw]);
    }
    return out;
  }
  function onFloor(segs, x, half) {
    if (!segs) return true;
    for (var i = 0; i < segs.length; i++) if (x - half >= segs[i][0] && x + half <= segs[i][1]) return true;
    return false;
  }

  function drawOneDecor(ctx, def, kind, x, y, sc, t, opts) {
    var S = OG.Scenery;
    if (!S || !S.drawDecor) return;
    if (def.__builtin && S.hasDecor && !S.hasDecor(kind)) return; // chủ đề gốc: thiếu thư viện thì bỏ qua (không vẽ dự phòng)
    S.drawDecor(ctx, kind, x, y, sc, t, opts);
  }

  /**
   * Rải decor của ThemeDef dọc màn (toạ độ THẾ GIỚI). Mỗi mục decor là một "luật đặt":
   * at: [x...] (vị trí cố định) hoặc every/start (lặp đều mỗi `every` px từ `start`).
   * @param {CanvasRenderingContext2D} ctx
   * @param {any} def        ThemeDef
   * @param {number} worldW  bề rộng màn, px
   * @param {number} t       đồng hồ, giây
   * @param {boolean} front  true = chỉ vẽ decor front (lớp phủ), false = decor nền + gag
   */
  function drawThemeDecor(ctx, def, worldW, t, front) {
    var cu = def.drawCustom || {};
    if (!front && typeof cu.decor === 'function') { cu.decor(ctx, worldW, t, def); return; }
    var vr = visibleRange(ctx, DECOR_VIEW_PAD);
    var segs = floorSegments(worldW);
    var list = def.decor || [];
    for (var i = 0; i < list.length; i++) {
      var d = list[i];
      if (!d || !!d.front !== !!front) continue;
      var y = d.y != null ? d.y : FLOOR, sc = d.scale || 1;
      // Decor "mặt đất" = không khai y riêng và không bay (air) → phải có sàn bên dưới mới vẽ.
      var ground = d.y == null && !d.air;
      var kinds = d.kinds && d.kinds.length ? d.kinds : null;
      if (d.at) {
        for (var j = 0; j < d.at.length; j++) {
          var ax = d.at[j];
          if (ax < vr[0] || ax > vr[1]) continue;
          drawOneDecor(ctx, def, kinds ? kinds[j % kinds.length] : d.kind, ax, y, sc, t, d.opts);
        }
        continue;
      }
      var every = Math.max(DECOR_MIN_EVERY, d.every || DECOR_DEFAULT_EVERY), start = d.start == null ? DECOR_DEFAULT_START : d.start;
      // Culling bằng số học: nhảy thẳng tới chỉ số n0 của decor đầu tiên trong khung nhìn thay vì duyệt từ x = start.
      var n0 = Math.max(0, Math.floor((vr[0] - start) / every));
      for (var n = n0, x = start + n0 * every; x < worldW && x < vr[1]; n++, x += every) {
        // jitter: lệch ±jitter px theo hash(n, i) — trông ngẫu nhiên tự nhiên nhưng frame nào cũng đúng chỗ cũ.
        var xx = d.jitter ? x + (hash(n * 13 + i * 7) - 0.5) * 2 * d.jitter : x;
        if (ground && !onFloor(segs, xx, DECOR_FOOT_HALF * sc)) continue;
        drawOneDecor(ctx, def, kinds ? kinds[n % kinds.length] : d.kind, xx, y, sc, t, d.opts);
      }
    }
    if (!front) drawGags(ctx, def, worldW, t, vr, segs);
  }

  // Gag nền: vị trí "ngẫu nhiên" nhưng ổn định theo chủ đề + bề rộng màn (không nhảy lung tung mỗi lần vẽ).
  function drawGags(ctx, def, worldW, t, vr, segs) {
    var g = def.gags;
    if (!g || !g.length || !worldW) return;
    // seed = f(id chủ đề, bề rộng màn): hai màn khác nhau có bố trí gag khác nhau, cùng một màn thì luôn như nhau.
    var seed = strHash(def.id) + worldW;
    var n = Math.max(1, Math.floor(worldW / GAG_SPACING));
    for (var i = 0; i < n; i++) {
      var kind = g[(i + seed) % g.length];
      var x = GAG_FIRST_X + i * GAG_SPACING + hash(seed + i) * GAG_SPREAD;
      if (x > worldW - GAG_END_MARGIN || x < vr[0] || x > vr[1]) continue;
      if (!onFloor(segs, x, GAG_FOOT_HALF)) continue;
      drawOneDecor(ctx, def, kind, x, FLOOR, 1, t, {});
    }
  }

  /**
   * Vẽ decor thế giới (không 'front') + gag nền của chủ đề. Gọi SAU drawPlatform, TRƯỚC nhân vật, khi camera đã translate.
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} theme      id chủ đề
   * @param {number} [worldW=960] bề rộng màn, px thế giới (decor không vượt quá; cũng dùng để chọn bố trí gag)
   * @param {number} [t=0]      đồng hồ, giây
   */
  OG.Sprites.drawDecor = function (ctx, theme, worldW, t) {
    var r = resolve(theme);
    if (!r.decor) return;
    ctx.save();
    try { drawThemeDecor(ctx, r.decor, worldW || W, t || 0, false); }
    finally { ctx.restore(); }
  };

  // ===========================================================================
  // LỚP PHỦ: decor 'front' + hạt môi trường (ambient), không gian màn hình
  // ===========================================================================
  // Mỗi hàm hạt: (ctx, i = chỉ số hạt, x, y = tâm trên màn hình, t = giây, c = màu tuỳ chọn). Cũng là strategy table.
  // Hạt KHÔNG lưu trạng thái (không có mảng vị trí): vị trí là hàm của (i, t, camX) — xem drawAmbient.
  /** @type {Object<string, (ctx: CanvasRenderingContext2D, i: number, x: number, y: number, t: number, c?: string) => void>} */
  var AMBIENT = {
    snow: function (ctx, i, x, y, t, c) { ctx.fillStyle = c || '#ffffff'; ctx.beginPath(); ctx.arc(x, y, 1.6 + hash(i) * 2.4, 0, TAU); ctx.fill(); },
    leaves: function (ctx, i, x, y, t, c) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(t * (1 + hash(i)) + i);
      ctx.fillStyle = c || ['#7cc35a', '#ffb347', '#f2c94c'][i % 3];
      ctx.beginPath(); ctx.ellipse(0, 0, 6, 3, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(23,35,61,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(5, 0); ctx.stroke();
      ctx.restore();
    },
    petals: function (ctx, i, x, y, t, c) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 2 + i) * 1.2);
      ctx.fillStyle = c || '#ffc4d8'; ctx.beginPath(); ctx.ellipse(0, 0, 5, 3, 0, 0, TAU); ctx.fill();
      ctx.restore();
    },
    bubbles: function (ctx, i, x, y, t, c) {
      var r = 3 + hash(i) * 6;
      ctx.strokeStyle = c || 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.25, 0, TAU); ctx.fill();
    },
    sparkle: function (ctx, i, x, y, t, c) {
      var k = 0.5 + 0.5 * Math.sin(t * 3 + i * 1.7);
      if (k < 0.3) return;
      ctx.fillStyle = c || '#ffffff'; ctx.globalAlpha *= k;
      var r = 2 + k * 4;
      ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.25, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.25, y); ctx.closePath();
      ctx.moveTo(x - r, y); ctx.lineTo(x, y + r * 0.25); ctx.lineTo(x + r, y); ctx.lineTo(x, y - r * 0.25); ctx.closePath(); ctx.fill();
    },
    fireflies: function (ctx, i, x, y, t, c) {
      var k = 0.5 + 0.5 * Math.sin(t * 2.5 + i * 2.3);
      ctx.fillStyle = c || '#e9ff8a'; ctx.globalAlpha *= 0.25 + k * 0.4;
      ctx.beginPath(); ctx.arc(x, y, 6, 0, TAU); ctx.fill();
      ctx.globalAlpha = Math.min(1, ctx.globalAlpha * 2.5 + 0.2);
      ctx.beginPath(); ctx.arc(x, y, 2.2, 0, TAU); ctx.fill();
    },
    dust: function (ctx, i, x, y, t, c) { ctx.fillStyle = c || 'rgba(255,255,255,0.7)'; ctx.globalAlpha *= 0.5 + 0.5 * Math.sin(t + i); ctx.beginPath(); ctx.arc(x, y, 1.5 + hash(i) * 1.5, 0, TAU); ctx.fill(); },
    hearts: function (ctx, i, x, y, t, c) {
      var s = 4 + hash(i) * 3;
      ctx.fillStyle = c || '#ff8fb1'; ctx.globalAlpha *= 0.75;
      ctx.beginPath(); ctx.moveTo(x, y + s * 0.9);
      ctx.bezierCurveTo(x - s * 1.3, y, x - s * 0.9, y - s * 1.1, x, y - s * 0.4);
      ctx.bezierCurveTo(x + s * 0.9, y - s * 1.1, x + s * 1.3, y, x, y + s * 0.9); ctx.fill();
    },
    stars: function (ctx, i, x, y, t, c) { ctx.fillStyle = c || '#fff3a0'; star(ctx, x, y, 4 + hash(i) * 3, 1.8, t + i); ctx.fill(); }
  };
  // 🧪 Thử: trong ThemeDef 'garden' đổi ambient thành { kind: 'snow', count: 80 } — vườn mùa hè có tuyết rơi dày,
  // không phải sửa dòng code vẽ nào (hạt tự rơi nhờ bảng AMB_MOVE bên dưới).
  // [hướng, tốc độ px/giây]: hướng 1 = rơi xuống (snow, leaves, petals, dust), -1 = bay lên (bubbles, hearts),
  // 0 = lơ lửng tại chỗ (sparkle, fireflies, stars).
  var AMB_MOVE = { snow: [1, 45], leaves: [1, 38], petals: [1, 34], dust: [1, 8], bubbles: [-1, 40], hearts: [-1, 30], sparkle: [0, 0], fireflies: [0, 0], stars: [0, 0] };

  /**
   * Vẽ n hạt môi trường (tuyết, lá, bong bóng...) trên toạ độ MÀN HÌNH.
   * 💡 Khái niệm: hạt "không trạng thái" — vị trí = hàm thuần của (i, t, camX): y = wrap(gốc + t × tốc độ, H + 40).
   * Không cần mảng hạt, không cần update theo dt, không bao giờ "hết hạt"; đổi lại hạt không phản ứng với gameplay
   * (muốn hạt nảy khi va chạm thì phải dùng hệ hạt có trạng thái như src/game/particles.js).
   * @param {CanvasRenderingContext2D} ctx
   * @param {{kind?: string, count?: number, speed?: number, parallax?: number, color?: string}} amb
   * @param {number} cam  camX, px thế giới
   * @param {number} t    đồng hồ, giây
   */
  function drawAmbient(ctx, amb, cam, t) {
    var kind = AMBIENT[amb.kind] ? amb.kind : 'sparkle';
    var fn = AMBIENT[kind], mv = AMB_MOVE[kind], n = amb.count || 26, sp = amb.speed || 1;
    var px = amb.parallax == null ? AMBIENT_PARALLAX : amb.parallax;
    ctx.save();
    for (var i = 0; i < n; i++) {
      var h1 = hash(i + 1), h2 = hash(i + 40), x, y;
      // (0.6 + h2 × 0.6): mỗi hạt có hệ số parallax riêng → các hạt trôi lệch nhau, tạo cảm giác nhiều tầng sâu.
      if (mv[0] === 0) {
        x = wrap(h1 * W * 1.5 - cam * px * (0.6 + h2 * 0.6) + Math.sin(t * 0.5 + i) * 30, W + 40) - 20;
        y = 40 + h2 * (H - 110) + Math.sin(t * 0.8 + i * 1.3) * 18;
      } else {
        x = wrap(h1 * W * 1.5 - cam * px * (0.6 + h2 * 0.6) + Math.sin(t * 0.9 + i) * 22, W + 40) - 20;
        y = wrap(h2 * (H + 40) + t * mv[1] * sp * (0.7 + h1 * 0.6) * mv[0], H + 40) - 20;
      }
      // save/restore quanh TỪNG hạt: hàm hạt được phép đổi globalAlpha/transform mà không ảnh hưởng hạt kế tiếp.
      ctx.save();
      fn(ctx, i, x, y, t, amb.color);
      ctx.restore();
    }
    ctx.restore();
  }

  /**
   * Vẽ lớp phủ: decor 'front' (đè lên người chơi) + hạt môi trường. Gọi SAU khi vẽ thế giới, ở toạ độ MÀN HÌNH.
   * Tự translate(-camX) cho decor front vì decor tính bằng toạ độ thế giới.
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} theme    id chủ đề
   * @param {number} [cam=0]  camX, px thế giới
   * @param {number} [t=0]    đồng hồ, giây
   */
  OG.Sprites.drawOverlay = function (ctx, theme, cam, t) {
    var r = resolve(theme);
    var d = r.over;
    if (!d) return;
    t = t || 0; cam = cam || 0;
    ctx.save();
    try {
      if (d.decor && hasFront(d)) {
        ctx.save(); ctx.translate(-cam, 0);
        var ww = (OG.Level && OG.Level.state && OG.Level.state.width) || (cam + W);
        drawThemeDecor(ctx, d, ww, t, true);
        ctx.restore();
      }
      if (d.ambient) drawAmbient(ctx, d.ambient, cam, t);
    } finally { ctx.restore(); }
  };

  // Tiện ích cho trang demo / bên khác (đọc được, không bắt buộc).
  /**
   * Vẽ riêng hạt môi trường theo cấu hình ambient (giống ThemeDef.ambient), toạ độ MÀN HÌNH.
   * @param {CanvasRenderingContext2D} ctx
   * @param {{kind?: string, count?: number, speed?: number, parallax?: number, color?: string}} [amb]  kind lạ → 'sparkle'
   * @param {number} [cam=0]  camX, px
   * @param {number} [t=0]    giây
   * @example
   *   OG.Sprites.drawAmbient(ctx, { kind: 'snow', count: 40 }, 0, OG.time);
   */
  OG.Sprites.drawAmbient = function (ctx, amb, cam, t) { ctx.save(); try { drawAmbient(ctx, amb || {}, cam || 0, t || 0); } finally { ctx.restore(); } };
  // Lộ dữ liệu nội bộ (chỉ ĐỌC) cho trang demo / test: danh sách chủ đề gốc, hoạ tiết sàn, loại hạt, hàm resolve.
  OG.Sprites.SCENERY_BUILTIN = BUILTIN;
  OG.Sprites.PLATFORM_PATTERNS = Object.keys(PATTERNS);
  OG.Sprites.AMBIENT_KINDS = Object.keys(AMBIENT);
  OG.Sprites.resolveTheme = resolve;

  // ===========================================================================
  // ĐẠO CỤ (prop)  — toạ độ THẾ GIỚI; mỗi hàm vẽ được gọi bên trong save/restore của drawProp
  // nên được phép translate/rotate thoải mái.
  // ===========================================================================
  // Tia lấp lánh nhấp nháy theo thời gian (chỉ hiện khi sin đủ lớn → lóe ngắn rồi tắt).
  function glint(ctx, x, y, r, t) {
    var k = 0.5 + 0.5 * Math.sin(t * 5);
    if (k < 0.55) return;
    ctx.fillStyle = 'rgba(255,255,255,' + ((k - 0.55) * 2).toFixed(2) + ')';
    ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.25, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.25, y); ctx.closePath();
    ctx.moveTo(x - r, y); ctx.lineTo(x, y + r * 0.25); ctx.lineTo(x + r, y); ctx.lineTo(x, y - r * 0.25); ctx.closePath();
    ctx.fill();
  }

  function drawPizza(ctx, x, y, t) {
    ctx.translate(x, y);
    ctx.rotate(Math.sin(t * 2.2) * 0.08);
    ctx.fillStyle = 'rgba(23,35,61,0.18)';
    ctx.beginPath(); ctx.moveTo(-12, -8); ctx.quadraticCurveTo(2, -17, 16, -8); ctx.lineTo(2, 16); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffd45a';
    ctx.beginPath(); ctx.moveTo(-13, -10); ctx.quadraticCurveTo(0, -18, 13, -10); ctx.lineTo(0, 14); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#e9a63a'; ctx.lineWidth = 1.2; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.strokeStyle = '#d9893b'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-13, -10); ctx.quadraticCurveTo(0, -18, 13, -10); ctx.stroke();
    ctx.strokeStyle = '#f0b067'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(-10, -12); ctx.quadraticCurveTo(0, -17.5, 10, -12); ctx.stroke();
    var pep = [[-4, -5, 3], [4, -4, 2.8], [0, 4, 2.6]];
    for (var i = 0; i < pep.length; i++) {
      ctx.fillStyle = '#d9473b'; ctx.beginPath(); ctx.arc(pep[i][0], pep[i][1], pep[i][2], 0, TAU); ctx.fill();
      ctx.fillStyle = '#ef6b5c'; ctx.beginPath(); ctx.arc(pep[i][0] - 0.8, pep[i][1] - 0.8, pep[i][2] * 0.4, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = '#5aa84a'; ctx.fillRect(6, -9, 2.5, 2); ctx.fillRect(-7, 0, 2.5, 2);
    glint(ctx, 8, -12, 4, t);
  }

  function drawHeart(ctx, x, y, t) {
    // max(0, sin): chỉ nửa chu kỳ dương mới phồng → nhịp "thình thịch" như tim đập thay vì phồng xẹp đều.
    var s = 1 + Math.max(0, Math.sin(t * 6)) * 0.08;
    ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = '#ff5a6e';
    ctx.beginPath();
    ctx.moveTo(0, 12);
    ctx.bezierCurveTo(-16, 1, -12, -14, 0, -6);
    ctx.bezierCurveTo(12, -14, 16, 1, 0, 12);
    ctx.fill();
    ctx.strokeStyle = '#c93a4d'; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.ellipse(-6, -5, 2.6, 1.6, -0.6, 0, TAU); ctx.fill();
  }

  function shieldPath(ctx, k) {
    ctx.beginPath();
    ctx.moveTo(0, -14 * k); ctx.lineTo(12 * k, -9 * k); ctx.quadraticCurveTo(12 * k, 6 * k, 0, 14 * k);
    ctx.quadraticCurveTo(-12 * k, 6 * k, -12 * k, -9 * k); ctx.closePath();
  }
  function drawShield(ctx, x, y, t) {
    ctx.translate(x, y);
    ctx.fillStyle = '#ffffff'; shieldPath(ctx, 1); ctx.fill();
    ctx.strokeStyle = P.secondaryShadow || '#2582aa'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = P.blue || '#52c5ee'; shieldPath(ctx, 0.75); ctx.fill();
    ctx.fillStyle = '#ffffff'; star(ctx, 0, 0, 5, 2.2, 0); ctx.fill();
    glint(ctx, 6, -8, 4, t + 1);
  }

  function drawStar(ctx, x, y, t) {
    ctx.translate(x, y); ctx.rotate(Math.sin(t * 2) * 0.15);
    ctx.fillStyle = '#ffd84a'; star(ctx, 0, 0, 14, 6.2, 0); ctx.fill();
    ctx.strokeStyle = '#e0a11b'; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.arc(-3, -1, 1.4, 0, TAU); ctx.arc(3, -1, 1.4, 0, TAU); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.arc(0, 1.5, 2.4, 0.2, Math.PI - 0.2); ctx.stroke();
    glint(ctx, 7, -7, 4, t);
  }

  function drawCoin(ctx, x, y, t) {
    // 💡 Khái niệm: giả 3D bằng co giãn — bề ngang = |cos(t)| khiến đồng xu như đang xoay quanh trục dọc,
    // dù chỉ vẽ một hình elip phẳng. Mặt khắc (sx > 5) chỉ vẽ khi xu đủ "mở" để nhìn thấy.
    var sx = Math.abs(Math.cos(t * 4)) * 9 + 1;
    ctx.fillStyle = '#e0a11b'; ctx.beginPath(); ctx.ellipse(x, y, sx + 1.5, 11, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = P.gold || '#ffc94a'; ctx.beginPath(); ctx.ellipse(x, y, sx, 9, 0, 0, TAU); ctx.fill();
    if (sx > 5) {
      ctx.fillStyle = '#e8a923'; ctx.beginPath(); ctx.ellipse(x, y, sx * 0.45, 4.5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff3b8'; ctx.beginPath(); ctx.ellipse(x - sx * 0.35, y - 3.5, sx * 0.18, 2, -0.5, 0, TAU); ctx.fill();
    }
    glint(ctx, x + 5, y - 7, 3.5, t + 0.7);
  }

  function drawExit(ctx, x, y, t, open) {
    // y = mặt sàn; cửa cao 125 (giống MVP: 355..480)
    if (open) {
      var g = 0.35 + 0.15 * Math.sin(t * 4);
      ctx.fillStyle = 'rgba(255,233,140,' + g.toFixed(2) + ')';
      ctx.beginPath(); ctx.ellipse(x + 24, y - 62, 42, 74, 0, 0, TAU); ctx.fill();
    }
    rr(ctx, x, y - 125, 48, 125, 20); ctx.fillStyle = P.portalFrame || '#f4d45b'; ctx.fill(); inkStroke(ctx, 3);
    rr(ctx, x + 8, y - 115, 32, 115, 16); ctx.fillStyle = open ? '#7fd36b' : (P.portalDoor || '#5b9be8'); ctx.fill(); inkStroke(ctx, 2);
    if (open) {
      ctx.save();
      rr(ctx, x + 8, y - 115, 32, 115, 16); ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (var i = 0; i < 3; i++) ctx.fillRect(x + 12, y - ((t * 60 + i * 40) % 120), 24, 4);
      ctx.restore();
      var bob = Math.sin(t * 5) * 4;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(x + 24, y - 140 + bob); ctx.lineTo(x + 14, y - 152 + bob); ctx.lineTo(x + 34, y - 152 + bob); ctx.closePath(); ctx.fill(); inkStroke(ctx, 1.5);
      face(ctx, x + 24, y - 84, 0.8, 'happy');
    } else {
      fillRound(ctx, x + 16, y - 66, 16, 13, 3, P.gold || '#ffc94a');
      ctx.strokeStyle = P.gold || '#ffc94a'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x + 24, y - 66, 5, Math.PI, 0); ctx.stroke();
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x + 24, y - 60, 1.8, 0, TAU); ctx.fill();
      face(ctx, x + 24, y - 92, 0.7, 'sleep');
    }
    ctx.fillStyle = '#ffe9a8'; ctx.beginPath(); ctx.arc(x + 34, y - 52, 2.6, 0, TAU); ctx.fill();
    ctx.font = font(13, 'bold'); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
    ctx.strokeText('EXIT', x + 24, y - (open ? 158 : 135));
    ctx.fillStyle = 'white'; ctx.fillText('EXIT', x + 24, y - (open ? 158 : 135));
  }

  // Trang sách bay (tâm x,y): giấy có dòng chữ, đôi cánh vỗ, quầng sáng; opts.collected = đã có trong Sổ tay (mờ + dấu ✓).
  function drawPage(ctx, x, y, t, opts) {
    var got = !!(opts && opts.collected);
    ctx.translate(x, y);
    if (got) ctx.globalAlpha *= 0.6;
    var pulse = 0.5 + 0.5 * Math.sin(t * 4);
    ctx.fillStyle = 'rgba(255,240,150,' + (0.25 + pulse * 0.2).toFixed(2) + ')';
    ctx.beginPath(); ctx.arc(0, 0, 26 + pulse * 3, 0, TAU); ctx.fill();
    // cánh
    var flap = 0.35 + 0.65 * Math.abs(Math.sin(t * 9));
    ctx.fillStyle = '#ffffff';
    [-1, 1].forEach(function (sd) {
      ctx.save(); ctx.translate(sd * 12, -6); ctx.scale(sd, flap);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(12, -16, 22, -10); ctx.quadraticCurveTo(16, -4, 18, 2); ctx.quadraticCurveTo(8, 4, 0, 4); ctx.closePath();
      ctx.fill(); inkStroke(ctx, 2);
      ctx.restore();
    });
    ctx.rotate(Math.sin(t * 3) * 0.12);
    ctx.beginPath(); ctx.moveTo(-13, -16); ctx.lineTo(7, -16); ctx.lineTo(14, -9); ctx.lineTo(14, 16); ctx.lineTo(-13, 16); ctx.closePath();
    ctx.fillStyle = '#fffdf4'; ctx.fill(); inkStroke(ctx, 2.5);
    ctx.beginPath(); ctx.moveTo(7, -16); ctx.lineTo(7, -9); ctx.lineTo(14, -9); ctx.closePath(); ctx.fillStyle = '#e6dcc4'; ctx.fill(); inkStroke(ctx, 1.6);
    ctx.strokeStyle = '#9fb4c8'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-8, 7); ctx.lineTo(9, 7); ctx.moveTo(-8, 11); ctx.lineTo(6, 11); ctx.stroke();
    face(ctx, 0, -4, 0.55, got ? 'happy' : 'smile', got ? null : t);
    if (got) {
      ctx.globalAlpha = Math.min(1, ctx.globalAlpha / 0.6);
      ctx.beginPath(); ctx.arc(12, 13, 7, 0, TAU); ctx.fillStyle = '#3fbf6f'; ctx.fill(); inkStroke(ctx, 1.8);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(8.5, 13); ctx.lineTo(11, 15.5); ctx.lineTo(15.5, 10); ctx.stroke();
    } else glint(ctx, 13, -15, 5, t);
  }

  // Cổng câu đố (x = mép trái, y = mặt sàn, rộng 46, cao 150): khung cột sách, biển "?" nhún, cửa có mặt + ổ khoá.
  // opts.open: cửa đã kéo lên, dấu ✓ xanh.
  function drawGate(ctx, x, y, t, open) {
    var w = 46, h = 150;
    // cột hai bên (gáy sách xếp chồng)
    var cols = ['#ff8a5c', '#7fd08a', '#8fd3ff', '#ffd23f', '#c59bff'];
    [x - 10, x + w].forEach(function (cx, side) {
      for (var i = 0; i < 6; i++) {
        var by = y - (i + 1) * 25;
        rr(ctx, cx, by, 10, 25, 3); ctx.fillStyle = cols[(i + side * 2) % cols.length]; ctx.fill(); inkStroke(ctx, 2);
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(cx + 2, by + 5, 6, 2);
      }
    });
    // xà ngang trên
    rr(ctx, x - 16, y - h - 14, w + 32, 16, 7); ctx.fillStyle = '#f4d45b'; ctx.fill(); inkStroke(ctx, 3);
    if (!open) {
      // cửa tím có sọc, mặt cười và ổ khoá
      rr(ctx, x, y - h, w, h, 6); ctx.fillStyle = '#7b6cf0'; ctx.fill(); inkStroke(ctx, 2.5);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 3;
      ctx.beginPath(); for (var k = 1; k < 4; k++) { ctx.moveTo(x + k * w / 4, y - h + 6); ctx.lineTo(x + k * w / 4, y - 6); } ctx.stroke();
      face(ctx, x + w / 2, y - 92, 0.9, 'smile', t);
      rr(ctx, x + w / 2 - 9, y - 66, 18, 15, 4); ctx.fillStyle = '#ffc94a'; ctx.fill(); inkStroke(ctx, 2);
      ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x + w / 2, y - 66, 6, Math.PI, 0); ctx.stroke();
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x + w / 2, y - 59, 2, 0, TAU); ctx.fill();
      // biển "?" nhún trên đầu
      var bob = Math.sin(t * 4) * 4;
      ctx.beginPath(); ctx.arc(x + w / 2, y - h - 36 + bob, 18, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill(); inkStroke(ctx, 3);
      ctx.fillStyle = '#7b6cf0'; ctx.font = font(24, 'bold'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('?', x + w / 2, y - h - 35 + bob);
    } else {
      // cửa đã kéo lên: mép cửa thò dưới xà, lấp lánh
      rr(ctx, x, y - h, w, 14, 4); ctx.fillStyle = '#7b6cf0'; ctx.fill(); inkStroke(ctx, 2);
      for (var s = 0; s < 3; s++) glint(ctx, x + 8 + s * 15, y - 30 - s * 30, 6, t + s);
      ctx.beginPath(); ctx.arc(x + w / 2, y - h - 36, 16, 0, TAU); ctx.fillStyle = '#3fbf6f'; ctx.fill(); inkStroke(ctx, 3);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(x + w / 2 - 7, y - h - 36); ctx.lineTo(x + w / 2 - 2, y - h - 30); ctx.lineTo(x + w / 2 + 8, y - h - 43); ctx.stroke();
    }
  }

  // Cột cờ lưu điểm (x = cột, y = mặt sàn). opts.reached: cờ xanh tung bay + sao xoay; chưa tới: cờ vàng rủ, mặt ngủ.
  function drawCheckpoint(ctx, x, y, t, reached) {
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(23,35,61,0.16)'; ctx.beginPath(); ctx.ellipse(0, 0, 16, 4, 0, 0, TAU); ctx.fill();
    rr(ctx, -10, -8, 20, 8, 3); ctx.fillStyle = '#c8b49a'; ctx.fill(); inkStroke(ctx, 2);
    rr(ctx, -3, -86, 6, 80, 3); ctx.fillStyle = '#f4f4f8'; ctx.fill(); inkStroke(ctx, 2);
    var c = reached ? '#3fbf6f' : '#ffc94a';
    ctx.beginPath();
    if (reached) {
      ctx.moveTo(3, -84);
      for (var i = 0; i <= 6; i++) ctx.lineTo(3 + i * 6, -84 + Math.sin(i * 0.9 - t * 7) * 3 * (i / 6));
      for (var j = 6; j >= 0; j--) ctx.lineTo(3 + j * 6, -60 + Math.sin(j * 0.9 - t * 7) * 3 * (j / 6));
    } else {
      ctx.moveTo(3, -84); ctx.quadraticCurveTo(14, -80, 18, -66); ctx.quadraticCurveTo(12, -60, 3, -58);
    }
    ctx.closePath(); ctx.fillStyle = c; ctx.fill(); inkStroke(ctx, 2.2);
    face(ctx, reached ? 20 : 9, -72, 0.45, reached ? 'happy' : 'sleep');
    ctx.save(); ctx.translate(0, -92);
    if (reached) { ctx.rotate(t * 2); star(ctx, 0, 0, 9, 4, 0); ctx.fillStyle = '#ffd84a'; ctx.fill(); inkStroke(ctx, 1.6); }
    else { ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fillStyle = '#ffd84a'; ctx.fill(); inkStroke(ctx, 1.6); }
    ctx.restore();
    if (reached) glint(ctx, 16, -98, 5, t);
  }

  // Prop chỉ cần (ctx, x, y, t). exit/page/gate/checkpoint cần thêm opts nên xử lý riêng trong drawProp.
  var PROPS = { pizza: drawPizza, coin: drawCoin, heart: drawHeart, shield: drawShield, star: drawStar };

  /**
   * Vẽ một đạo cụ (prop) tại toạ độ THẾ GIỚI. Mốc toạ độ tuỳ loại:
   * pizza | coin | heart | shield | star | page: (x, y) = tâm · exit | gate: x = mép trái, y = mặt sàn · checkpoint: x = cột, y = mặt sàn.
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} id  loại prop
   * @param {number} x   px thế giới
   * @param {number} y   px thế giới
   * @param {number} [t=0]  đồng hồ, giây
   * @param {{open?: boolean, collected?: boolean, reached?: boolean}} [opts]  exit/gate: open · page: collected · checkpoint: reached
   * @returns {boolean} false = id không biết hoặc vẽ lỗi → bên gọi tự vẽ hình dự phòng
   * @example
   *   var ok = OG.Sprites.drawProp(ctx, 'gate', 600, 480, OG.time, { open: true }); // false → tự vẽ hình khác
   */
  OG.Sprites.drawProp = function (ctx, id, x, y, t, opts) {
    opts = opts || {};
    t = t || 0;
    var fn = PROPS[id];
    if (!fn && id !== 'exit' && id !== 'page' && id !== 'gate' && id !== 'checkpoint') return false;
    ctx.save();
    var ok = true;
    try {
      if (fn) fn(ctx, x, y, t);
      else if (id === 'exit') drawExit(ctx, x, y, t, !!opts.open);
      else if (id === 'page') drawPage(ctx, x, y, t, opts);
      else if (id === 'gate') drawGate(ctx, x, y, t, !!opts.open);
      else drawCheckpoint(ctx, x, y, t, !!opts.reached);
    } catch (err) {
      // Nuốt lỗi có chủ đích: một prop vẽ hỏng không được làm sập cả frame; trả false để bên gọi vẽ dự phòng.
      ok = false;
    }
    ctx.restore();
    return ok;
  };
})();
