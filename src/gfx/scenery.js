/* OG.Sprites (phần cảnh vật) — BỘ VẼ ThemeDef: nền, sàn, decor, lớp phủ, đạo cụ.
 * Chủ sở hữu v2: agent cảnh nền (src/gfx/scenery.js, src/gfx/decor*.js). Load SAU src/gfx/sprites.js.
 * Hợp đồng: docs/ARCHITECTURE.md mục 8.1 + docs/STORY.md mục 4.
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
(function () {
  'use strict';
  var OG = window.OG;
  OG.Sprites = OG.Sprites || {};
  var P = OG.Palette || {};
  var U = OG.util || {};
  var W = OG.W || 960, H = OG.H || 540, FLOOR = OG.FLOOR_Y || 480;
  var TAU = Math.PI * 2;
  var INK = P.ink || '#17233d';

  function font(px, weight) {
    return OG.font ? OG.font(px, weight) : (weight ? weight + ' ' : '') + px + 'px "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';
  }
  function wrap(x, span) { return ((x % span) + span) % span; }
  function hash(n) { var s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
  function strHash(s) { var h = 0; s = String(s || ''); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 9973; return h; }
  function rr(ctx, x, y, w, h, r) {
    if (U.roundRectPath) U.roundRectPath(ctx, x, y, w, h, r);
    else { ctx.beginPath(); ctx.rect(x, y, w, h); }
  }
  function fillRound(ctx, x, y, w, h, r, c) { ctx.fillStyle = c; rr(ctx, x, y, w, h, r); ctx.fill(); }
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

  // Khoảng x (thế giới) đang nhìn thấy, suy từ ma trận canvas hiện tại (để bỏ qua phần ngoài khung).
  function visibleRange(ctx, pad) {
    pad = pad == null ? 60 : pad;
    try {
      var m = ctx.getTransform && ctx.getTransform();
      var cw = (ctx.canvas && ctx.canvas.width) || W;
      if (m && m.a > 0 && Math.abs(m.b) < 1e-6) { var x0 = -m.e / m.a; return [x0 - pad, x0 + cw / m.a + pad]; }
    } catch (e) { /* bỏ qua */ }
    return [-1e9, 1e9];
  }

  // ===========================================================================
  // 5 CHỦ ĐỀ GỐC v1 (dựng bằng ThemeDef + lớp/decor thư viện)
  // ===========================================================================
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
  Object.keys(BUILTIN).forEach(function (k) { BUILTIN[k].id = k; BUILTIN[k].__builtin = true; });

  // Tìm ThemeDef cho từng phần (nền / sàn / decor / lớp phủ).
  function hasBg(d) { return !!(d.sky || d.layers || (d.drawCustom && d.drawCustom.background)); }
  function resolve(theme) {
    var S = OG.Scenery;
    var reg = S && S.getTheme ? S.getTheme(theme) : null;
    if (!reg) { var b = BUILTIN[theme] || BUILTIN.garden; return { bg: b, plat: b, decor: b, over: b, base: b, id: b.id }; }
    var base = BUILTIN[S.baseOf ? S.baseOf(theme) : 'garden'] || BUILTIN.garden;
    var own = hasBg(reg), cu = reg.drawCustom || {};
    var hasPlat = !!(reg.platformStyle || cu.platform);
    var hasDec = !!(reg.decor || cu.decor || reg.gags);
    var alias = !own && !hasPlat && !hasDec && !reg.ambient;
    return {
      bg: own ? reg : base,
      plat: hasPlat ? reg : base,
      decor: hasDec ? reg : (own ? null : base),
      over: (reg.ambient || (reg.decor && hasFront(reg))) ? reg : (alias ? base : null),
      base: base, id: theme
    };
  }
  function hasFront(d) {
    if (d.__front == null) d.__front = !!(d.decor && d.decor.some && d.decor.some(function (x) { return x && x.front; }));
    return d.__front;
  }

  // ===========================================================================
  // NỀN: trời, mặt trời, trăng, sao, cầu vồng, mây, lớp parallax
  // ===========================================================================
  function drawSun(ctx, sun, cam, t) {
    var x = (sun.x == null ? 790 : sun.x) - cam * 0.03, y = sun.y == null ? 100 : sun.y, r = sun.r || 46, c = sun.color || '#ffe066';
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(255,240,170,0.35)'; ctx.beginPath(); ctx.arc(0, 0, r * 1.55 + Math.sin(t * 2) * 3, 0, TAU); ctx.fill();
    ctx.save(); ctx.rotate(t * 0.15);
    ctx.fillStyle = shade(c, 0.1);
    ctx.beginPath();
    for (var i = 0; i < 12; i++) {
      var a = i * TAU / 12, a2 = a + 0.13, l = r * (i % 2 ? 1.32 : 1.45);
      ctx.moveTo(Math.cos(a - 0.13) * r * 1.05, Math.sin(a - 0.13) * r * 1.05); ctx.lineTo(Math.cos(a) * l, Math.sin(a) * l); ctx.lineTo(Math.cos(a2) * r * 1.05, Math.sin(a2) * r * 1.05);
    }
    ctx.fill();
    ctx.restore();
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fillStyle = c; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(23,35,61,0.35)'; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.ellipse(-r * 0.4, -r * 0.45, r * 0.25, r * 0.13, -0.6, 0, TAU); ctx.fill();
    if (sun.face !== false) face(ctx, 0, -r * 0.08, r / 26, sun.mood || 'smile', t);
    ctx.restore();
  }
  function drawMoon(ctx, m, cam, t) {
    var x = (m.x == null ? 780 : m.x) - cam * 0.03, y = m.y == null ? 100 : m.y, r = m.r || 34;
    ctx.save();
    ctx.fillStyle = 'rgba(255,250,210,0.18)'; ctx.beginPath(); ctx.arc(x, y, r * 1.7, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = m.color || '#fff6c8'; ctx.fill();
    ctx.fillStyle = 'rgba(220,200,140,0.5)'; ctx.beginPath(); ctx.arc(x + r * 0.35, y + r * 0.3, r * 0.18, 0, TAU); ctx.arc(x - r * 0.4, y - r * 0.35, r * 0.12, 0, TAU); ctx.fill();
    if (m.face !== false) face(ctx, x - r * 0.1, y - r * 0.05, r / 28, 'sleep');
    ctx.restore();
  }
  function drawSkyStars(ctx, n, cam, t) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (var s = 0; s < n; s++) {
      var sx = wrap(hash(s) * 1400 - cam * 0.03, W), sy = hash(s + 77) * 320, tw = 0.5 + 0.5 * Math.sin(t * (1.2 + hash(s + 5) * 2) + s);
      var r = 0.8 + hash(s + 9) * 1.6 * tw;
      if (s % 8 === 0) { star(ctx, sx, sy, r * 2.4, r, 0); ctx.fill(); } else ctx.fillRect(sx - r / 2, sy - r / 2, r, r);
    }
    ctx.restore();
  }
  function drawRainbow(ctx, rb, cam) {
    var x = (rb.x == null ? 300 : rb.x) - cam * 0.05, y = rb.y == null ? 420 : rb.y, r = rb.r || 260;
    var cols = ['#ff6f6f', '#ffb347', '#ffe066', '#7fd08a', '#6fbcf0', '#a98cff'];
    ctx.save(); ctx.globalAlpha *= rb.alpha == null ? 0.55 : rb.alpha; ctx.lineWidth = 12;
    for (var i = 0; i < cols.length; i++) { ctx.strokeStyle = cols[i]; ctx.beginPath(); ctx.arc(x, y, r - i * 12, Math.PI, TAU); ctx.stroke(); }
    ctx.restore();
  }
  function drawSimpleClouds(ctx, cc, cam, t) {
    var n = cc.count || 5;
    ctx.save(); ctx.fillStyle = cc.color || '#ffffff';
    for (var i = 0; i < n; i++) {
      var x = wrap(i * 230 - cam * 0.15 + t * 6, W + 180) - 80, y = 60 + (i % 3) * 42;
      ctx.beginPath(); ctx.arc(x, y, 22, 0, TAU); ctx.arc(x + 24, y - 8, 28, 0, TAU); ctx.arc(x + 50, y, 20, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawLayer(ctx, L, cam, t, def) {
    var S = OG.Scenery;
    if (S && S.drawLayer) { S.drawLayer(ctx, L, cam, t, def); return; }
    // Không có sổ đăng ký (trang demo rút gọn): dãy đồi đơn giản.
    ctx.save();
    var y = L.y == null ? 420 : L.y, span = L.spacing || 320, off = wrap(cam * (L.parallax || 0.3), span);
    ctx.fillStyle = L.color || '#9fd88a';
    for (var i = -1; i * span - off < W + span; i++) { ctx.beginPath(); ctx.ellipse(i * span - off + span / 2, y, span * 0.6, L.height || 60, 0, Math.PI, TAU); ctx.fill(); }
    ctx.fillRect(0, y, W, H - y);
    ctx.restore();
  }

  function drawThemeBackground(ctx, def, cam, t) {
    var cu = def.drawCustom || {};
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
    if (sky.clouds !== false && !sky.stars || (sky.clouds && sky.stars)) {
      var cc = sky.clouds && typeof sky.clouds === 'object' ? sky.clouds : {};
      var S = OG.Scenery;
      if (S && S.hasLayer && S.hasLayer('clouds')) {
        drawLayer(ctx, { kind: 'clouds', parallax: cc.parallax == null ? 0.1 : cc.parallax, y: cc.y || 135, height: cc.spread || 85,
          count: cc.count || 5, color: cc.color || '#ffffff', speed: cc.speed, scale: cc.scale, face: cc.face, alpha: cc.alpha }, cam, t, def);
      } else drawSimpleClouds(ctx, cc, cam, t);
    }
    var layers = def.layers || [];
    for (var k = 0; k < layers.length; k++) if (layers[k]) drawLayer(ctx, layers[k], cam, t, def);
  }

  OG.Sprites.drawBackground = function (ctx, theme, cam, t) {
    var r = resolve(theme);
    ctx.save();
    try { drawThemeBackground(ctx, r.bg, cam || 0, t || 0); }
    finally { ctx.restore(); }
  };

  // ===========================================================================
  // SÀN & BỤC theo platformStyle (pattern)
  // ===========================================================================
  var PATTERNS = {};

  // Cỏ: đất có sỏi, dải cỏ viền vỏ sò, ngọn cỏ nhô lên, hoa nhỏ.
  PATTERNS.grass = {
    body: function (ctx, a, st, x0, x1) {
      var dark = shade(st.fill, -0.15), light = shade(st.fill, 0.15);
      for (var x = Math.floor(x0 / 37) * 37; x < x1; x += 37) {
        var h1 = hash(x), yy = a.y + st.topH + 10 + h1 * (a.h - st.topH - 16);
        ctx.fillStyle = h1 > 0.5 ? dark : light;
        ctx.beginPath(); ctx.ellipse(x + h1 * 20, yy, 4 + h1 * 3, 2.5 + h1 * 1.5, 0, 0, TAU); ctx.fill();
      }
    },
    top: function (ctx, a, st, x0, x1) {
      var th = st.topH;
      ctx.fillStyle = st.top; ctx.fillRect(x0, a.y, x1 - x0, th);
      ctx.beginPath();
      for (var x = Math.floor(x0 / 16) * 16; x < x1; x += 16) { ctx.moveTo(x + 16, a.y + th); ctx.arc(x + 8, a.y + th, 8, 0, Math.PI); }
      ctx.fill();
      ctx.fillStyle = shade(st.top, 0.22); ctx.fillRect(x0, a.y, x1 - x0, 3);
    },
    above: function (ctx, a, st, x0, x1, t) {
      // ngọn cỏ nhọn và hoa nhỏ trên mép sàn
      ctx.fillStyle = st.top;
      ctx.beginPath();
      for (var x = Math.floor(x0 / 24) * 24; x < x1; x += 24) {
        if (x < a.x + 6 || x > a.x + a.w - 14) continue;
        var h1 = hash(x * 0.37), sw = Math.sin(t * 2 + x * 0.05) * 1.5;
        ctx.moveTo(x, a.y + 1); ctx.lineTo(x + 3 + sw, a.y - 5 - h1 * 5); ctx.lineTo(x + 6, a.y + 1);
      }
      ctx.fill();
      if (st.flowers === false) return;
      for (var fx = Math.floor(x0 / 150) * 150; fx < x1; fx += 150) {
        var hx = hash(fx + 3); if (hx < 0.45) continue;
        var px = fx + hx * 120; if (px < a.x + 10 || px > a.x + a.w - 10) continue;
        ctx.fillStyle = ['#ffffff', '#ffd23f', '#ff9fc1'][Math.floor(hx * 30) % 3];
        ctx.beginPath(); ctx.arc(px, a.y - 3, 3.2, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.arc(px, a.y - 3, 1.2, 0, TAU); ctx.fill();
      }
    }
  };
  // Gạch men caro (bếp).
  PATTERNS.tiles = {
    body: function (ctx, a, st, x0, x1) {
      var sz = st.size || 30, acc = st.accent || shade(st.fill, -0.1);
      ctx.fillStyle = acc;
      for (var y = a.y + st.topH, row = 0; y < a.y + a.h; y += sz, row++) {
        for (var x = Math.floor(x0 / sz) * sz; x < x1; x += sz) if (((x / sz) + row) % 2 === 0) ctx.fillRect(x, y, sz, sz);
      }
      ctx.strokeStyle = 'rgba(23,35,61,0.12)'; ctx.lineWidth = 1.5; ctx.beginPath();
      for (var y2 = a.y + st.topH; y2 < a.y + a.h; y2 += sz) { ctx.moveTo(x0, y2); ctx.lineTo(x1, y2); }
      for (var x2 = Math.floor(x0 / sz) * sz; x2 < x1; x2 += sz) { ctx.moveTo(x2, a.y + st.topH); ctx.lineTo(x2, a.y + a.h); }
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (var x3 = Math.floor(x0 / (sz * 4)) * sz * 4; x3 < x1; x3 += sz * 4) ctx.fillRect(x3 + 5, a.y + st.topH + 4, 8, 3);
    },
    top: function (ctx, a, st, x0, x1) {
      ctx.fillStyle = st.top; ctx.fillRect(x0, a.y, x1 - x0, st.topH);
      ctx.fillStyle = shade(st.top, 0.25); ctx.fillRect(x0, a.y, x1 - x0, 3);
    }
  };
  // Ván gỗ: thớ ngang, mối nối so le, đinh.
  PATTERNS.wood = {
    body: function (ctx, a, st, x0, x1) {
      var rowH = a.h > 30 ? 14 : Math.max(6, (a.h - st.topH) / 2);
      ctx.strokeStyle = shade(st.fill, -0.25); ctx.lineWidth = 1.6; ctx.beginPath();
      var row = 0;
      for (var y = a.y + st.topH + rowH; y < a.y + a.h - 2; y += rowH, row++) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
      for (var r = 0, yy = a.y + st.topH; yy < a.y + a.h; yy += rowH, r++) {
        for (var x = Math.floor(x0 / 64) * 64 + (r % 2) * 32; x < x1; x += 64) { ctx.moveTo(x, yy); ctx.lineTo(x, Math.min(yy + rowH, a.y + a.h)); }
      }
      ctx.stroke();
      ctx.fillStyle = shade(st.fill, -0.35);
      for (var nx = Math.floor(x0 / 64) * 64 + 6; nx < x1; nx += 64) { ctx.beginPath(); ctx.arc(nx, a.y + st.topH + rowH * 0.5, 1.6, 0, TAU); ctx.fill(); }
      ctx.strokeStyle = shade(st.fill, 0.15); ctx.lineWidth = 1.2; ctx.beginPath();
      for (var gx = Math.floor(x0 / 90) * 90 + 20; gx < x1; gx += 90) { var gy = a.y + st.topH + rowH * 0.5 + 2; ctx.moveTo(gx, gy); ctx.quadraticCurveTo(gx + 12, gy - 3, gx + 24, gy); }
      ctx.stroke();
    },
    top: function (ctx, a, st, x0, x1) {
      ctx.fillStyle = st.top; ctx.fillRect(x0, a.y, x1 - x0, st.topH);
      ctx.fillStyle = shade(st.top, 0.25); ctx.fillRect(x0, a.y, x1 - x0, 2);
    }
  };
  // Mái ngói vảy cá.
  PATTERNS.roof = {
    body: function (ctx, a, st, x0, x1) {
      var line = st.accent || shade(st.fill, -0.25), hi = shade(st.fill, 0.12);
      for (var row = 0, ry = a.y + st.topH + 2; ry < a.y + a.h + 16; ry += 16, row++) {
        var xs = Math.floor(x0 / 30) * 30 + (row % 2) * 15 - 30;
        ctx.fillStyle = row % 2 ? st.fill : hi;
        ctx.beginPath(); for (var x = xs; x < x1 + 30; x += 30) { ctx.moveTo(x + 30, ry); ctx.arc(x + 15, ry, 15, 0, Math.PI); } ctx.fill();
        ctx.strokeStyle = line; ctx.lineWidth = 2;
        ctx.beginPath(); for (var x2 = xs; x2 < x1 + 30; x2 += 30) { ctx.moveTo(x2 + 30, ry); ctx.arc(x2 + 15, ry, 15, 0, Math.PI); } ctx.stroke();
      }
    },
    top: function (ctx, a, st, x0, x1) {
      ctx.fillStyle = st.top; ctx.fillRect(x0, a.y, x1 - x0, st.topH);
      ctx.fillStyle = shade(st.top, 0.25); ctx.fillRect(x0, a.y, x1 - x0, 2);
    }
  };
  // Gạch xây.
  PATTERNS.brick = {
    body: function (ctx, a, st, x0, x1) {
      var bh = 12, bw = 28, mortar = st.accent || shade(st.fill, 0.35);
      ctx.strokeStyle = mortar; ctx.lineWidth = 2; ctx.beginPath();
      for (var r = 0, y = a.y + st.topH; y < a.y + a.h; y += bh, r++) {
        ctx.moveTo(x0, y); ctx.lineTo(x1, y);
        for (var x = Math.floor(x0 / bw) * bw + (r % 2) * (bw / 2); x < x1; x += bw) { ctx.moveTo(x, y); ctx.lineTo(x, y + bh); }
      }
      ctx.stroke();
      ctx.fillStyle = shade(st.fill, -0.12);
      for (var x2 = Math.floor(x0 / (bw * 3)) * bw * 3 + 3; x2 < x1; x2 += bw * 3) ctx.fillRect(x2, a.y + st.topH + 2, bw - 6, bh - 4);
    },
    top: PATTERNS.wood.top
  };
  // Đá cuội bo tròn.
  PATTERNS.stone = {
    body: function (ctx, a, st, x0, x1) {
      var dark = st.accent || shade(st.fill, -0.18), light = shade(st.fill, 0.12);
      for (var r = 0, y = a.y + st.topH + 8; y < a.y + a.h + 6; y += 15, r++) {
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
    body: function (ctx, a, st, x0, x1) {
      var pw = 64;
      ctx.strokeStyle = shade(st.fill, -0.25); ctx.lineWidth = 2; ctx.beginPath();
      for (var x = Math.floor(x0 / pw) * pw; x < x1; x += pw) { ctx.moveTo(x, a.y + st.topH); ctx.lineTo(x, a.y + a.h); }
      ctx.stroke();
      ctx.fillStyle = shade(st.fill, 0.35);
      for (var x2 = Math.floor(x0 / pw) * pw; x2 < x1; x2 += pw) {
        ctx.beginPath(); ctx.arc(x2 + 7, a.y + st.topH + 6, 2.2, 0, TAU); ctx.arc(x2 + pw - 7, a.y + st.topH + 6, 2.2, 0, TAU);
        if (a.h > 30) { ctx.arc(x2 + 7, a.y + a.h - 8, 2.2, 0, TAU); ctx.arc(x2 + pw - 7, a.y + a.h - 8, 2.2, 0, TAU); }
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      for (var x3 = Math.floor(x0 / (pw * 2)) * pw * 2; x3 < x1; x3 += pw * 2) {
        ctx.beginPath(); ctx.moveTo(x3 + 16, a.y + a.h); ctx.lineTo(x3 + 30, a.y + st.topH); ctx.lineTo(x3 + 40, a.y + st.topH); ctx.lineTo(x3 + 26, a.y + a.h); ctx.closePath(); ctx.fill();
      }
    },
    top: function (ctx, a, st, x0, x1) {
      if (st.hazard) {
        ctx.fillStyle = '#ffd23f'; ctx.fillRect(x0, a.y, x1 - x0, st.topH);
        ctx.fillStyle = INK; ctx.beginPath();
        for (var x = Math.floor(x0 / 20) * 20; x < x1; x += 20) { ctx.moveTo(x, a.y + st.topH); ctx.lineTo(x + 8, a.y); ctx.lineTo(x + 16, a.y); ctx.lineTo(x + 8, a.y + st.topH); }
        ctx.fill();
      } else { ctx.fillStyle = st.top; ctx.fillRect(x0, a.y, x1 - x0, st.topH); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(x0, a.y + 1, x1 - x0, 2); }
    }
  };
  // Cát: lấm tấm hạt, mép trên lượn sóng.
  PATTERNS.sand = {
    body: function (ctx, a, st, x0, x1) {
      ctx.fillStyle = st.accent || shade(st.fill, -0.15);
      for (var x = Math.floor(x0 / 11) * 11; x < x1; x += 11) { var h1 = hash(x); ctx.fillRect(x + h1 * 8, a.y + st.topH + 4 + h1 * (a.h - st.topH - 8), 2, 2); }
      ctx.fillStyle = shade(st.fill, 0.2);
      for (var x2 = Math.floor(x0 / 23) * 23; x2 < x1; x2 += 23) { var h2 = hash(x2 + 9); ctx.fillRect(x2 + h2 * 10, a.y + st.topH + 6 + h2 * (a.h - st.topH - 10), 2, 2); }
    },
    top: function (ctx, a, st, x0, x1) {
      ctx.fillStyle = st.top; ctx.beginPath(); ctx.moveTo(x0, a.y);
      for (var x = Math.floor(x0 / 12) * 12; x <= x1 + 12; x += 12) ctx.lineTo(x, a.y + st.topH + Math.sin(x * 0.08) * 2);
      ctx.lineTo(x1 + 12, a.y); ctx.closePath(); ctx.fill();
    }
  };
  // Tuyết: thân băng xanh, lớp tuyết dày nhỏ giọt.
  PATTERNS.snow = {
    body: function (ctx, a, st, x0, x1) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (var x = Math.floor(x0 / 40) * 40; x < x1; x += 40) { var h1 = hash(x); ctx.beginPath(); ctx.arc(x + h1 * 20, a.y + st.topH + 14 + h1 * (a.h - st.topH - 20), 3, 0, TAU); ctx.fill(); }
    },
    top: function (ctx, a, st, x0, x1) {
      var c = st.top || '#ffffff';
      ctx.fillStyle = c; ctx.fillRect(x0, a.y, x1 - x0, st.topH);
      ctx.beginPath();
      for (var x = Math.floor(x0 / 22) * 22; x < x1; x += 22) {
        var d = 3 + hash(x) * 8;
        ctx.moveTo(x, a.y + st.topH - 1); ctx.quadraticCurveTo(x + 2, a.y + st.topH + d, x + 7, a.y + st.topH + d); ctx.quadraticCurveTo(x + 12, a.y + st.topH + d, x + 14, a.y + st.topH - 1);
      }
      ctx.fill();
    },
    above: function (ctx, a, st) {
      ctx.fillStyle = st.top || '#ffffff';
      ctx.beginPath(); ctx.ellipse(a.x + a.w / 2, a.y + 1, a.w / 2 - 2, 4, 0, Math.PI, TAU); ctx.fill();
    }
  };
  // Băng: trong suốt, vệt sáng chéo.
  PATTERNS.ice = {
    body: function (ctx, a, st, x0, x1, t) {
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      for (var x = Math.floor(x0 / 90) * 90; x < x1; x += 90) {
        ctx.beginPath(); ctx.moveTo(x + 10, a.y + a.h); ctx.lineTo(x + 34, a.y + st.topH); ctx.lineTo(x + 42, a.y + st.topH); ctx.lineTo(x + 18, a.y + a.h); ctx.closePath(); ctx.fill();
      }
      var k = wrap(t * 120, 600);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      for (var x2 = Math.floor(x0 / 600) * 600; x2 < x1; x2 += 600) { ctx.fillRect(x2 + k, a.y + st.topH + 2, 18, 2); }
    },
    top: PATTERNS.wood.top
  };
  // Hang: đá tối + rêu phát sáng nhấp nháy.
  PATTERNS.cave = {
    body: PATTERNS.stone.body,
    top: function (ctx, a, st, x0, x1, t) {
      ctx.fillStyle = st.top; ctx.fillRect(x0, a.y, x1 - x0, st.topH);
      for (var x = Math.floor(x0 / 70) * 70 + 12; x < x1; x += 70) {
        var g = 0.6 + 0.4 * Math.sin(t * 2 + x * 0.03);
        ctx.fillStyle = 'rgba(127,208,138,' + g.toFixed(2) + ')';
        ctx.beginPath(); ctx.ellipse(x + hash(x) * 20, a.y + 1, 9, 3.5, 0, 0, TAU); ctx.fill();
      }
    }
  };
  // Mây bông (bục trên trời / vũ trụ).
  PATTERNS.cloud = {
    body: function (ctx, a, st, x0, x1) {
      ctx.fillStyle = shade(st.fill, -0.06);
      ctx.beginPath(); for (var x = Math.floor(x0 / 26) * 26; x < x1; x += 26) { ctx.moveTo(x + 26, a.y + a.h); ctx.arc(x + 13, a.y + a.h, 13, Math.PI, TAU); } ctx.fill();
    },
    top: function (ctx, a, st, x0, x1) {
      ctx.fillStyle = st.top || '#ffffff';
      ctx.fillRect(x0, a.y, x1 - x0, st.topH);
    },
    above: function (ctx, a, st, x0, x1) {
      ctx.fillStyle = st.top || '#ffffff';
      ctx.beginPath(); for (var x = Math.max(a.x + 4, Math.floor(x0 / 22) * 22); x < Math.min(a.x + a.w - 4, x1); x += 22) { ctx.moveTo(x + 13, a.y + 2); ctx.arc(x + 11, a.y + 2, 11, Math.PI, TAU); } ctx.fill();
    }
  };
  PATTERNS.plain = {
    body: function (ctx, a, st) {
      ctx.fillStyle = 'rgba(23,35,61,0.08)'; ctx.fillRect(a.x, a.y + a.h - Math.min(10, a.h * 0.25), a.w, Math.min(10, a.h * 0.25));
    },
    top: PATTERNS.wood.top
  };

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

  function drawStyledPlatform(ctx, a, def, base, t) {
    var floor = a.isFloor || a.y > 470;
    var st = platformStyle(def, base, floor);
    var pat = PATTERNS[st.pattern] || PATTERNS.plain;
    var vr = visibleRange(ctx, 30);
    var x0 = Math.max(a.x, vr[0]), x1 = Math.min(a.x + a.w, vr[1]);
    if (x1 <= x0) return;
    var r = Math.min(st.radius, a.h / 2);
    // bóng đổ mềm dưới bục
    if (!floor) { ctx.fillStyle = 'rgba(23,35,61,0.14)'; rr(ctx, a.x + 4, a.y + 6, a.w, a.h, r); ctx.fill(); }
    rr(ctx, a.x, a.y, a.w, a.h, r);
    ctx.fillStyle = st.fill; ctx.fill();
    ctx.save();
    rr(ctx, a.x, a.y, a.w, a.h, r); ctx.clip();
    if (pat.body) pat.body(ctx, a, st, x0, x1, t);
    if (pat.top) pat.top(ctx, a, st, x0, x1, t);
    ctx.fillStyle = 'rgba(23,35,61,0.12)'; ctx.fillRect(x0, a.y + st.topH, x1 - x0, 3);
    ctx.restore();
    // viền ink dày
    if (st.outline !== false) {
      if (floor) {
        ctx.save(); rr(ctx, a.x, a.y, a.w, a.h + 20, r); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.stroke(); ctx.restore();
      } else { rr(ctx, a.x, a.y, a.w, a.h, r); inkStroke(ctx, 3); }
    }
    if (pat.above) pat.above(ctx, a, st, x0, x1, t);
  }

  OG.Sprites.drawPlatform = function (ctx, a, theme, t) {
    if (!a) return;
    var r = resolve(theme);
    ctx.save();
    try {
      var cu = r.plat.drawCustom || {};
      if (typeof cu.platform === 'function' && cu.platform(ctx, a, t || 0, r.plat) === true) return;
      drawStyledPlatform(ctx, a, r.plat, r.base, t || 0);
    } finally { ctx.restore(); }
  };

  // ===========================================================================
  // DECOR thế giới + GAG nền
  // ===========================================================================
  // Danh sách đoạn sàn (y ≥ 470) của màn hiện tại để decor mặt đất không lơ lửng trên hố.
  function floorSegments(worldW) {
    var st = OG.Level && OG.Level.state;
    if (!st || !st.platforms || (st.width && worldW && st.width !== worldW)) return null;
    var out = [];
    for (var i = 0; i < st.platforms.length; i++) {
      var p = st.platforms[i];
      var px = p.x != null ? p.x : p[0], py = p.y != null ? p.y : p[1], pw = p.w != null ? p.w : p[2];
      if (py >= 470) out.push([px, px + pw]);
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

  function drawThemeDecor(ctx, def, worldW, t, front) {
    var cu = def.drawCustom || {};
    if (!front && typeof cu.decor === 'function') { cu.decor(ctx, worldW, t, def); return; }
    var vr = visibleRange(ctx, 220);
    var segs = floorSegments(worldW);
    var list = def.decor || [];
    for (var i = 0; i < list.length; i++) {
      var d = list[i];
      if (!d || !!d.front !== !!front) continue;
      var y = d.y != null ? d.y : FLOOR, sc = d.scale || 1;
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
      var every = Math.max(40, d.every || 400), start = d.start == null ? 120 : d.start;
      var n0 = Math.max(0, Math.floor((vr[0] - start) / every));
      for (var n = n0, x = start + n0 * every; x < worldW && x < vr[1]; n++, x += every) {
        var xx = d.jitter ? x + (hash(n * 13 + i * 7) - 0.5) * 2 * d.jitter : x;
        if (ground && !onFloor(segs, xx, 24 * sc)) continue;
        drawOneDecor(ctx, def, kinds ? kinds[n % kinds.length] : d.kind, xx, y, sc, t, d.opts);
      }
    }
    if (!front) drawGags(ctx, def, worldW, t, vr, segs);
  }

  // Gag nền: vị trí "ngẫu nhiên" nhưng ổn định theo chủ đề + bề rộng màn (không nhảy lung tung mỗi lần vẽ).
  function drawGags(ctx, def, worldW, t, vr, segs) {
    var g = def.gags;
    if (!g || !g.length || !worldW) return;
    var seed = strHash(def.id) + worldW;
    var n = Math.max(1, Math.floor(worldW / 1400));
    for (var i = 0; i < n; i++) {
      var kind = g[(i + seed) % g.length];
      var x = 480 + i * 1400 + hash(seed + i) * 600;
      if (x > worldW - 300 || x < vr[0] || x > vr[1]) continue;
      if (!onFloor(segs, x, 60)) continue;
      drawOneDecor(ctx, def, kind, x, FLOOR, 1, t, {});
    }
  }

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
  // Hướng/tốc độ: rơi xuống (snow, leaves, petals, dust), bay lên (bubbles, hearts), lơ lửng (sparkle, fireflies, stars).
  var AMB_MOVE = { snow: [1, 45], leaves: [1, 38], petals: [1, 34], dust: [1, 8], bubbles: [-1, 40], hearts: [-1, 30], sparkle: [0, 0], fireflies: [0, 0], stars: [0, 0] };

  function drawAmbient(ctx, amb, cam, t) {
    var kind = AMBIENT[amb.kind] ? amb.kind : 'sparkle';
    var fn = AMBIENT[kind], mv = AMB_MOVE[kind], n = amb.count || 26, sp = amb.speed || 1;
    var px = amb.parallax == null ? 0.6 : amb.parallax;
    ctx.save();
    for (var i = 0; i < n; i++) {
      var h1 = hash(i + 1), h2 = hash(i + 40), x, y;
      if (mv[0] === 0) {
        x = wrap(h1 * W * 1.5 - cam * px * (0.6 + h2 * 0.6) + Math.sin(t * 0.5 + i) * 30, W + 40) - 20;
        y = 40 + h2 * (H - 110) + Math.sin(t * 0.8 + i * 1.3) * 18;
      } else {
        x = wrap(h1 * W * 1.5 - cam * px * (0.6 + h2 * 0.6) + Math.sin(t * 0.9 + i) * 22, W + 40) - 20;
        y = wrap(h2 * (H + 40) + t * mv[1] * sp * (0.7 + h1 * 0.6) * mv[0], H + 40) - 20;
      }
      ctx.save();
      fn(ctx, i, x, y, t, amb.color);
      ctx.restore();
    }
    ctx.restore();
  }

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
  OG.Sprites.drawAmbient = function (ctx, amb, cam, t) { ctx.save(); try { drawAmbient(ctx, amb || {}, cam || 0, t || 0); } finally { ctx.restore(); } };
  OG.Sprites.SCENERY_BUILTIN = BUILTIN;
  OG.Sprites.PLATFORM_PATTERNS = Object.keys(PATTERNS);
  OG.Sprites.AMBIENT_KINDS = Object.keys(AMBIENT);
  OG.Sprites.resolveTheme = resolve;

  // ===========================================================================
  // ĐẠO CỤ
  // ===========================================================================
  // Tia lấp lánh nhấp nháy theo thời gian.
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

  var PROPS = { pizza: drawPizza, coin: drawCoin, heart: drawHeart, shield: drawShield, star: drawStar };

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
      ok = false;
    }
    ctx.restore();
    return ok;
  };
})();
