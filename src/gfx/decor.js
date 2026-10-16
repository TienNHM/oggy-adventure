/* OG.Decor — THƯ VIỆN decor và lớp parallax dùng chung (phần lõi + thiên nhiên + mọi lớp nền).
 * Chủ sở hữu v2: agent cảnh nền (src/gfx/scenery.js, src/gfx/decor*.js). Hợp đồng: docs/STORY.md mục 4.
 *
 * Đăng ký qua sổ OG.Scenery (src/core/scenery-registry.js):
 *   OG.Scenery.registerDecor(kind, fn(ctx, x, y, scale, t, opts))   x = tâm, y = mặt đất; không gian thế giới
 *   OG.Scenery.registerLayer(kind, fn(ctx, layer, camX, t, theme))   không gian màn hình, phủ ngang 960 px
 * Hành trình chỉ THAM CHIẾU kind theo tên; thiếu kind -> OG.Scenery vẽ hình dự phòng (không lỗi).
 *
 * Tiện ích công khai (OG.Decor):
 *   face(ctx, x, y, s, mood?, t?)   mặt cười: mood 'smile'|'grin'|'o'|'sleep'|'happy'|'wink'|'worried'; t -> chớp mắt
 *   outline(ctx, w)  inkFill(ctx, fill, w)  shade(color, k)  alpha(color, a)  hash(n)  wrap(x, span)
 *   star(ctx, x, y, ro, ri, rot)  heart(ctx, x, y, s)  rr(ctx, x, y, w, h, r)  shadow(ctx, w)
 *   sprite(key, w, h, ox, oy, paint) / drawSprite(ctx, key, x, y, w, h, ox, oy, paint)  — cache ảnh tĩnh
 *   registerTiled(kind, spec)  — lớp parallax tĩnh, tự CACHE vào canvas phụ (offscreen)
 *   setCache(bool)  clearCache()  cacheStats()
 * Decor thêm: src/gfx/decor-places.js (nhà cửa, danh thắng), src/gfx/decor-home.js (đồ vật trong nhà, gag, khoa học).
 * Phong cách: viền ink #17233d dày bo tròn, màu tươi, đồ vật có khuôn mặt. */
(function () {
  'use strict';
  var OG = window.OG;
  var TAU = Math.PI * 2;
  var INK = '#17233d';
  var W = OG.W || 960, H = OG.H || 540;
  var S = OG.Scenery;
  if (!S) { if (window.console) console.warn('[OG.Decor] thiếu OG.Scenery (src/core/scenery-registry.js)'); return; }

  // ---------------------------------------------------------------------------
  // Tiện ích chung
  // ---------------------------------------------------------------------------
  function wrap(x, span) { return ((x % span) + span) % span; }
  // Số giả ngẫu nhiên ổn định 0..1 theo n (để mỗi cây/ngôi nhà khác nhau nhưng không nhấp nháy).
  function hash(n) { var s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

  function parseColor(c) {
    if (typeof c !== 'string' || c[0] !== '#') return null;
    var h = c.slice(1);
    if (h.length === 3 || h.length === 4) h = h.split('').map(function (ch) { return ch + ch; }).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    var n = parseInt(h.slice(0, 6), 16);
    if (isNaN(n)) return null;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1 };
  }
  // k > 0: sáng hơn (pha trắng), k < 0: tối hơn (pha đen). Màu không phải hex -> giữ nguyên.
  function shade(c, k) {
    var o = parseColor(c);
    if (!o) return c;
    var m = k > 0 ? 255 : 0, a = Math.min(1, Math.abs(k));
    var r = Math.round(o.r + (m - o.r) * a), g = Math.round(o.g + (m - o.g) * a), b = Math.round(o.b + (m - o.b) * a);
    return o.a < 1 ? 'rgba(' + r + ',' + g + ',' + b + ',' + o.a.toFixed(2) + ')' : 'rgb(' + r + ',' + g + ',' + b + ')';
  }
  function alpha(c, a) {
    var o = parseColor(c);
    if (!o) return c;
    return 'rgba(' + o.r + ',' + o.g + ',' + o.b + ',' + (o.a * a).toFixed(3) + ')';
  }

  function rr(ctx, x, y, w, h, r) {
    if (OG.util && OG.util.roundRectPath) { OG.util.roundRectPath(ctx, x, y, w, h, r); return; }
    ctx.beginPath(); ctx.rect(x, y, w, h);
  }
  function outline(ctx, w) {
    ctx.strokeStyle = INK; ctx.lineWidth = w || 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
  }
  // Viền dày kiểu hoạt hình cho hình ghép nhiều mảnh: vẽ nét đôi trước rồi tô đè (nét trong biến mất).
  function inkFill(ctx, fill, w) {
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = INK; ctx.lineWidth = (w || 3) * 2; ctx.stroke();
    ctx.fillStyle = fill; ctx.fill();
  }
  function star(ctx, x, y, ro, ri, rot) {
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var r = i % 2 ? ri : ro, a = (rot || 0) + (i * Math.PI) / 5 - Math.PI / 2;
      if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
  }
  // Trái tim, (x,y) = tâm, s = nửa bề ngang.
  function heart(ctx, x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.9);
    ctx.bezierCurveTo(x - s * 1.3, y + s * 0.05, x - s * 0.9, y - s * 1.15, x, y - s * 0.45);
    ctx.bezierCurveTo(x + s * 0.9, y - s * 1.15, x + s * 1.3, y + s * 0.05, x, y + s * 0.9);
    ctx.closePath();
  }
  // Bóng bầu dục dưới chân (gốc toạ độ = chân).
  function shadow(ctx, w) {
    ctx.fillStyle = 'rgba(23,35,61,0.16)';
    ctx.beginPath(); ctx.ellipse(0, 0, w, w * 0.18, 0, 0, TAU); ctx.fill();
  }

  // Khuôn mặt dễ thương dùng chung cho đồ vật. (x,y) = giữa hai mắt; s = tỉ lệ (1 ≈ mặt rộng 24 px).
  function face(ctx, x, y, s, mood, t) {
    s = s || 1;
    mood = mood || 'smile';
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    var ex = 6 * s, er = 2.4 * s;
    var blink = t != null && mood !== 'sleep' && mood !== 'happy' && wrap(t * 0.9 + hash(Math.round(x * 3 + y * 7)) * 4, 4) < 0.14;
    // má hồng
    ctx.fillStyle = 'rgba(255,120,150,0.5)';
    ctx.beginPath(); ctx.ellipse(x - 10.5 * s, y + 5 * s, 3 * s, 2.1 * s, 0, 0, TAU); ctx.ellipse(x + 10.5 * s, y + 5 * s, 3 * s, 2.1 * s, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = INK; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, 1.8 * s);
    // mắt
    if (mood === 'sleep' || blink) {
      ctx.beginPath(); ctx.arc(x - ex, y - 0.5 * s, er * 1.1, 0.15, Math.PI - 0.15); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + ex, y - 0.5 * s, er * 1.1, 0.15, Math.PI - 0.15); ctx.stroke();
    } else if (mood === 'happy') {
      ctx.beginPath(); ctx.arc(x - ex, y + 1 * s, er * 1.2, Math.PI + 0.2, TAU - 0.2); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + ex, y + 1 * s, er * 1.2, Math.PI + 0.2, TAU - 0.2); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(x - ex, y, er, 0, TAU);
      if (mood === 'wink') ctx.fill();
      else { ctx.arc(x + ex, y, er, 0, TAU); ctx.fill(); }
      if (mood === 'wink') { ctx.beginPath(); ctx.arc(x + ex, y + 1 * s, er * 1.2, Math.PI + 0.2, TAU - 0.2); ctx.stroke(); }
      if (s >= 0.7) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(x - ex + er * 0.35, y - er * 0.35, er * 0.38, 0, TAU);
        if (mood !== 'wink') ctx.arc(x + ex + er * 0.35, y - er * 0.35, er * 0.38, 0, TAU);
        ctx.fill(); ctx.fillStyle = INK;
      }
    }
    // miệng
    ctx.beginPath();
    if (mood === 'o') { ctx.ellipse(x, y + 6 * s, 2.2 * s, 2.8 * s, 0, 0, TAU); ctx.fill(); }
    else if (mood === 'sleep') { ctx.arc(x, y + 6 * s, 1.8 * s, 0, TAU); ctx.stroke(); }
    else if (mood === 'grin') {
      ctx.moveTo(x - 5 * s, y + 3.5 * s); ctx.quadraticCurveTo(x, y + 12 * s, x + 5 * s, y + 3.5 * s); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff8fa3'; ctx.beginPath(); ctx.ellipse(x, y + 7.2 * s, 2.4 * s, 1.4 * s, 0, 0, TAU); ctx.fill();
    } else if (mood === 'worried') {
      ctx.moveTo(x - 4 * s, y + 6 * s); ctx.quadraticCurveTo(x - 2 * s, y + 4 * s, x, y + 6 * s); ctx.quadraticCurveTo(x + 2 * s, y + 8 * s, x + 4 * s, y + 6 * s); ctx.stroke();
    } else { ctx.arc(x, y + 3 * s, 4 * s, 0.25, Math.PI - 0.25); ctx.stroke(); }
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Cache ảnh tĩnh (offscreen canvas). An toàn khi không có document/canvas (Node, trình duyệt cũ).
  // ---------------------------------------------------------------------------
  var cacheOn = true;
  var stats = { spriteHit: 0, spriteMiss: 0, tileHit: 0, tileMiss: 0 };
  var sprites = {}, spriteOrder = [], SPRITE_MAX = 96;
  var tiles = {}, tileOrder = [], TILE_MAX = 28;

  function makeCanvas(w, h) {
    try {
      if (typeof document === 'undefined' || !document.createElement) return null;
      var c = document.createElement('canvas');
      c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
      var g = c.getContext && c.getContext('2d');
      return g ? { canvas: c, ctx: g } : null;
    } catch (e) { return null; }
  }
  function remember(store, order, max, key, val) {
    store[key] = val; order.push(key);
    while (order.length > max) delete store[order.shift()];
  }
  // Ảnh tĩnh w×h, gốc vẽ (ox, oy) bên trong. paint(g) vẽ quanh gốc. Trả {canvas, ox, oy} hoặc null.
  function sprite(key, w, h, ox, oy, paint) {
    if (!cacheOn) return null;
    var e = sprites[key];
    if (e) { stats.spriteHit++; return e; }
    if (e === false) return null;
    var m = makeCanvas(w, h);
    if (!m) { sprites[key] = false; return null; }
    stats.spriteMiss++;
    m.ctx.save(); m.ctx.translate(ox, oy);
    try { paint(m.ctx); } catch (err) { m.ctx.restore(); sprites[key] = false; return null; }
    m.ctx.restore();
    e = { canvas: m.canvas, ox: ox, oy: oy };
    remember(sprites, spriteOrder, SPRITE_MAX, key, e);
    return e;
  }
  // Vẽ ảnh tĩnh tại (x,y) (đúng gốc), tự vẽ trực tiếp nếu không cache được.
  function drawSprite(ctx, key, x, y, w, h, ox, oy, paint) {
    var e = sprite(key, w, h, ox, oy, paint);
    if (e) { ctx.drawImage(e.canvas, x - e.ox, y - e.oy); return; }
    ctx.save(); ctx.translate(x, y); paint(ctx); ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Lớp parallax TĨNH ghép ô (tile). spec:
  //   period(L) -> bề ngang 1 ô (px)        variants: số kiểu ô khác nhau (lặp tuần hoàn)
  //   band(L) -> [top, bottom] dải dọc màn hình có hình vẽ      parallax: mặc định nếu layer không ghi
  //   paint(ctx, L, list, theme)  list = [{x, w, v}] (x = mép trái ô, v = chỉ số kiểu 0..variants-1)
  //   live(ctx, L, camX, t, theme)?  phần động vẽ thêm mỗi khung (không cache)
  // Cache: dải rộng = period × n (≥ 960) vẽ 1 lần, mỗi khung chỉ drawImage 1–2 lần.
  // ---------------------------------------------------------------------------
  var tiledSpecs = {};
  var keyMemo = typeof WeakMap === 'function' ? new WeakMap() : null;

  function layerKey(kind, L, theme) {
    var memo = keyMemo && keyMemo.get(L);
    var tid = (theme && theme.id) || '';
    if (memo && memo.tid === tid) return memo.key;
    var key = kind + '|' + tid + '|' + JSON.stringify(L, function (k, v) { return typeof v === 'function' ? undefined : v; });
    if (keyMemo) keyMemo.set(L, { tid: tid, key: key });
    return key;
  }

  function drawTiled(ctx, kind, L, cam, theme, t) {
    var spec = tiledSpecs[kind];
    var P = Math.max(40, Math.round(spec.period(L)));
    var V = Math.max(1, spec.variants || 1);
    var n = Math.ceil(Math.max(V, Math.ceil(W / P)) / V) * V;
    var stripW = P * n;
    var band = spec.band(L);
    var top = Math.max(0, Math.floor(band[0])), bot = Math.min(H, Math.ceil(band[1]));
    if (bot - top <= 0) return;
    var px = L.parallax == null ? (spec.parallax == null ? 0.3 : spec.parallax) : L.parallax;
    var off = wrap((cam || 0) * px, stripW);
    if (L.alpha != null) ctx.globalAlpha *= L.alpha;
    var e = null;
    if (cacheOn) {
      var key = layerKey(kind, L, theme) + '|' + stripW;
      e = tiles[key];
      if (e) stats.tileHit++;
      else if (e !== false) {
        var m = makeCanvas(stripW, bot - top);
        if (m) {
          stats.tileMiss++;
          var list = [];
          for (var i = -1; i <= n; i++) list.push({ x: i * P, w: P, v: wrap(i, V) });
          m.ctx.save(); m.ctx.translate(0, -top);
          try { spec.paint(m.ctx, L, list, theme); e = { canvas: m.canvas, top: top }; } catch (err) { e = false; }
          m.ctx.restore();
          remember(tiles, tileOrder, TILE_MAX, key, e);
        } else tiles[key] = false;
      }
    }
    if (e) {
      ctx.drawImage(e.canvas, -off, e.top);
      if (stripW - off < W) ctx.drawImage(e.canvas, stripW - off, e.top);
    } else {
      // Vẽ trực tiếp chỉ những ô nhìn thấy.
      var list2 = [];
      for (var j = Math.floor(off / P) - 1; j * P - off < W + P; j++) list2.push({ x: j * P - off, w: P, v: wrap(j, V) });
      spec.paint(ctx, L, list2, theme);
    }
    if (spec.live) spec.live(ctx, L, cam || 0, t || 0, theme);
  }

  function registerTiled(kind, spec) {
    tiledSpecs[kind] = spec;
    S.registerLayer(kind, function (ctx, L, cam, t, theme) {
      drawTiled(ctx, kind, L, cam, theme || null, t);
    });
  }

  var Decor = (OG.Decor = {
    INK: INK, TAU: TAU,
    face: face, outline: outline, inkFill: inkFill, shade: shade, alpha: alpha, hash: hash, wrap: wrap,
    star: star, heart: heart, rr: rr, shadow: shadow,
    sprite: sprite, drawSprite: drawSprite, makeCanvas: makeCanvas,
    registerTiled: registerTiled,
    setCache: function (on) { cacheOn = !!on; if (!on) Decor.clearCache(); },
    cacheEnabled: function () { return cacheOn; },
    clearCache: function () { sprites = {}; spriteOrder = []; tiles = {}; tileOrder = []; },
    cacheStats: function () {
      return { sprites: spriteOrder.length, tiles: tileOrder.length, spriteHit: stats.spriteHit, spriteMiss: stats.spriteMiss, tileHit: stats.tileHit, tileMiss: stats.tileMiss };
    }
  });

  // Đăng ký decor: tự dịch về (x, y) và co giãn theo scale. fn(ctx, t, opts, x, y) vẽ quanh gốc = chân.
  function def(kind, fn) {
    S.registerDecor(kind, function (ctx, x, y, s, t, o) {
      ctx.translate(x, y);
      if (o.flip) ctx.scale(-s, s); else ctx.scale(s, s);
      fn(ctx, t, o, x, y);
    });
  }
  Decor.define = def;

  // ===========================================================================
  // DECOR THIÊN NHIÊN (gốc = chân, đơn vị ở scale 1)
  // ===========================================================================

  // Bụi cây tròn có mặt (opts.color, opts.berries).
  def('bush', function (ctx, t, o, wx) {
    var c = o.color || '#6cc35a', sq = 1 + Math.sin(t * 2 + wx * 0.01) * 0.025;
    ctx.scale(1 / sq, sq);
    ctx.beginPath(); ctx.arc(-17, -15, 16, 0, TAU); ctx.moveTo(19, -25); ctx.arc(0, -25, 19, 0, TAU); ctx.moveTo(33, -15); ctx.arc(17, -15, 16, 0, TAU);
    ctx.rect(-32, -16, 64, 16);
    inkFill(ctx, c, 2.5);
    ctx.fillStyle = shade(c, 0.25);
    ctx.beginPath(); ctx.ellipse(-6, -36, 7, 4, -0.3, 0, TAU); ctx.fill();
    if (o.berries !== false && hash(wx) > 0.5) {
      ctx.fillStyle = o.berryColor || '#ff5a6e';
      ctx.beginPath(); ctx.arc(-22, -20, 3.2, 0, TAU); ctx.arc(22, -9, 3.2, 0, TAU); ctx.arc(12, -30, 3.2, 0, TAU); ctx.fill();
    }
    face(ctx, 0, -18, 0.9, o.mood, t);
  });

  // Hoa nhún nhảy (opts.color, opts.center, opts.height, opts.face).
  def('flower', function (ctx, t, o, wx) {
    var ph = hash(wx) * 6, h = o.height || 36;
    var dx = Math.sin(t * 3 + ph) * 5, bob = Math.abs(Math.sin(t * 3 + ph)) * 3;
    ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(dx * 0.2, -h * 0.5, dx, -h + bob); ctx.stroke();
    ctx.strokeStyle = o.stem || '#3f9a45'; ctx.lineWidth = 3.4; ctx.stroke();
    // lá
    ctx.fillStyle = o.leaf || '#5bbf55';
    ctx.beginPath(); ctx.ellipse(-7, -h * 0.35, 7, 3.5, -0.5 + Math.sin(t * 3 + ph) * 0.2, 0, TAU); ctx.fill(); outline(ctx, 2);
    ctx.beginPath(); ctx.ellipse(7, -h * 0.55, 7, 3.5, 0.5 - Math.sin(t * 3 + ph) * 0.2, 0, TAU); ctx.fill(); outline(ctx, 2);
    ctx.translate(dx, -h - 4 + bob);
    ctx.rotate(Math.sin(t * 3 + ph) * 0.18);
    var c = o.color || ['#ff8fb1', '#ffb347', '#b58cff', '#ff6f6f'][Math.floor(hash(wx + 3) * 4)];
    ctx.beginPath();
    for (var i = 0; i < 6; i++) { var a = i * TAU / 6; ctx.moveTo(Math.cos(a) * 10 + 7.5, Math.sin(a) * 10); ctx.arc(Math.cos(a) * 10, Math.sin(a) * 10, 7.5, 0, TAU); }
    inkFill(ctx, c, 2);
    ctx.beginPath(); ctx.arc(0, 0, 8.5, 0, TAU); ctx.fillStyle = o.center || '#ffd23f'; ctx.fill(); outline(ctx, 2);
    if (o.face !== false) face(ctx, 0, -1.5, 0.5, o.mood || 'happy');
  });

  // Khóm cỏ nhỏ (opts.color).
  def('grass', function (ctx, t, o, wx) {
    var c = o.color || '#5bbf55', sw = Math.sin(t * 2 + wx * 0.02) * 2.5;
    ctx.beginPath();
    ctx.moveTo(-12, 0); ctx.quadraticCurveTo(-12, -10, -16 + sw, -18); ctx.quadraticCurveTo(-6, -10, -5, -4);
    ctx.quadraticCurveTo(-3, -16, 0 + sw, -24); ctx.quadraticCurveTo(4, -14, 4, -4);
    ctx.quadraticCurveTo(8, -12, 15 + sw, -17); ctx.quadraticCurveTo(12, -6, 12, 0); ctx.closePath();
    inkFill(ctx, c, 2);
  });

  // Hòn đá có mặt (opts.color, opts.mood).
  def('rock', function (ctx, t, o) {
    var c = o.color || '#a3a9b8';
    ctx.beginPath(); ctx.moveTo(-27, 0); ctx.quadraticCurveTo(-30, -24, -8, -29); ctx.quadraticCurveTo(14, -34, 25, -18); ctx.quadraticCurveTo(31, -6, 27, 0); ctx.closePath();
    inkFill(ctx, c, 2.5);
    ctx.fillStyle = shade(c, 0.3); ctx.beginPath(); ctx.ellipse(-10, -22, 7, 3.5, -0.4, 0, TAU); ctx.fill();
    ctx.fillStyle = shade(c, -0.15); ctx.beginPath(); ctx.arc(16, -8, 3, 0, TAU); ctx.arc(-18, -6, 2, 0, TAU); ctx.fill();
    face(ctx, 0, -14, 0.8, o.mood || 'sleep', t);
  });

  // Cuốn sách có mặt (biểu tượng Bách Khoa / Sổ tay).
  def('book', function (ctx, t, o) {
    var c = o.color || '#ed713c';
    ctx.rotate(Math.sin(t * 2) * 0.04);
    rr(ctx, -22, -52, 44, 52, 7); inkFill(ctx, c, 2.5);
    ctx.fillStyle = '#fff6df'; rr(ctx, -16, -46, 32, 8, 3); ctx.fill();
    ctx.fillStyle = shade(c, -0.25); ctx.fillRect(-22, -52, 6, 52);
    face(ctx, 2, -25, 1, o.mood, t);
  });

  // Cây tròn (opts.color, opts.trunk, opts.fruit: màu quả | false, opts.face, opts.height).
  def('tree', function (ctx, t, o, wx) {
    var c = o.color || '#4fb05a', tk = o.trunk || '#a8693c', h = o.height || 70;
    shadow(ctx, 40);
    ctx.beginPath(); ctx.moveTo(-10, 0); ctx.quadraticCurveTo(-7, -h * 0.5, -9, -h); ctx.lineTo(9, -h); ctx.quadraticCurveTo(7, -h * 0.5, 12, 0); ctx.closePath();
    inkFill(ctx, tk, 2.5);
    ctx.strokeStyle = shade(tk, -0.25); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(2, -30); ctx.stroke();
    ctx.translate(0, -h);
    ctx.rotate(Math.sin(t * 1.3 + wx * 0.01) * 0.035);
    ctx.beginPath();
    ctx.arc(-30, -18, 28, 0, TAU); ctx.moveTo(36, -46); ctx.arc(0, -46, 36, 0, TAU); ctx.moveTo(60, -18); ctx.arc(30, -18, 30, 0, TAU);
    ctx.moveTo(34, -6); ctx.arc(0, -6, 34, 0, TAU);
    inkFill(ctx, c, 3);
    ctx.fillStyle = shade(c, 0.22);
    ctx.beginPath(); ctx.arc(-14, -60, 12, 0, TAU); ctx.arc(-38, -30, 8, 0, TAU); ctx.fill();
    if (o.fruit !== false && (o.fruit || hash(wx + 1) > 0.55)) {
      ctx.fillStyle = typeof o.fruit === 'string' ? o.fruit : '#ff5a5a';
      [[-28, -2], [24, -32], [6, -64], [36, -4], [-40, -30]].forEach(function (p) { ctx.beginPath(); ctx.arc(p[0], p[1], 5, 0, TAU); ctx.fill(); outline(ctx, 1.6); });
    }
    if (o.face !== false) face(ctx, 0, -26, 1.2, o.mood, t);
  });

  // Cây thông (opts.color, opts.snow: tuyết phủ).
  def('pine', function (ctx, t, o, wx) {
    var c = o.color || '#2f9e6b';
    shadow(ctx, 28);
    rr(ctx, -7, -22, 14, 22, 3); inkFill(ctx, o.trunk || '#9a5f37', 2.5);
    ctx.rotate(Math.sin(t * 1.2 + wx * 0.01) * 0.025);
    var tiers = [[-22, 40, 34], [-50, 32, 30], [-74, 24, 26]];
    for (var i = 0; i < tiers.length; i++) {
      var y = tiers[i][0], hw = tiers[i][1], th = tiers[i][2];
      ctx.beginPath(); ctx.moveTo(-hw, y); ctx.quadraticCurveTo(0, y + 7, hw, y); ctx.lineTo(4, y - th - 8); ctx.quadraticCurveTo(0, y - th - 12, -4, y - th - 8); ctx.closePath();
      inkFill(ctx, c, 2.5);
      if (o.snow) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.moveTo(-hw * 0.45, y - th * 0.55); ctx.lineTo(0, y - th - 10); ctx.lineTo(hw * 0.45, y - th * 0.55);
        ctx.quadraticCurveTo(hw * 0.2, y - th * 0.4, 0, y - th * 0.55); ctx.quadraticCurveTo(-hw * 0.2, y - th * 0.4, -hw * 0.45, y - th * 0.55); ctx.fill();
      }
    }
    if (o.star) { ctx.fillStyle = '#ffd84a'; star(ctx, 0, -108, 9, 4, Math.sin(t) * 0.2); ctx.fill(); outline(ctx, 2); }
    if (o.face !== false) face(ctx, 0, -42, 0.9, o.mood, t);
  });

  // Cây dừa (opts.color, opts.coconuts).
  def('palm', function (ctx, t, o, wx) {
    var c = o.color || '#3fb35d', sway = Math.sin(t * 1.4 + wx * 0.01);
    shadow(ctx, 30);
    ctx.save();
    // thân cong gồm nhiều đốt
    var segs = 7, tipX = 16 + sway * 4, tipY = -128;
    for (var i = segs - 1; i >= 0; i--) {
      var k = i / segs, x = tipX * k * k, y = tipY * k, w = 10 - k * 3;
      rr(ctx, x - w, y - 20, w * 2, 22, 6); inkFill(ctx, i % 2 ? '#c98d55' : '#b77a45', 2);
    }
    ctx.translate(tipX, tipY - 14);
    // lá
    var leaves = [-2.7, -2.1, -1.4, -0.6, 0.0, -3.4];
    for (var j = 0; j < leaves.length; j++) {
      var a = leaves[j] + sway * 0.06;
      ctx.save(); ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(30, -18, 62, 6); ctx.quadraticCurveTo(32, -2, 0, 6); ctx.closePath();
      inkFill(ctx, j % 2 ? c : shade(c, 0.15), 2);
      ctx.restore();
    }
    if (o.coconuts !== false) {
      ctx.beginPath(); ctx.arc(-7, 9, 7, 0, TAU); ctx.moveTo(14, 9); ctx.arc(7, 10, 7, 0, TAU); inkFill(ctx, '#7a4a2a', 2);
      face(ctx, 0, 8, 0.4, 'happy');
    }
    ctx.restore();
  });

  // Cây hoa anh đào (opts.color hoa).
  def('sakura', function (ctx, t, o, wx) {
    var c = o.color || '#ffb7d0';
    shadow(ctx, 40);
    ctx.beginPath(); ctx.moveTo(-9, 0); ctx.quadraticCurveTo(-4, -40, -18, -70); ctx.lineTo(-8, -74); ctx.quadraticCurveTo(2, -56, 4, -48);
    ctx.quadraticCurveTo(14, -62, 26, -70); ctx.lineTo(32, -64); ctx.quadraticCurveTo(12, -46, 11, 0); ctx.closePath();
    inkFill(ctx, '#8a5a44', 2.5);
    ctx.translate(0, -76); ctx.rotate(Math.sin(t * 1.2 + wx * 0.01) * 0.03);
    ctx.beginPath();
    var puffs = [[-34, 4, 22], [-14, -16, 26], [14, -18, 26], [36, 2, 22], [0, 8, 24]];
    puffs.forEach(function (p) { ctx.moveTo(p[0] + p[2], p[1]); ctx.arc(p[0], p[1], p[2], 0, TAU); });
    inkFill(ctx, c, 3);
    ctx.fillStyle = '#ffffff';
    for (var i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc(-36 + hash(i + wx) * 72, -30 + hash(i * 3 + wx) * 40, 2.5, 0, TAU); ctx.fill(); }
    face(ctx, 0, -2, 1, o.mood || 'happy', t);
  });

  // Dương xỉ.
  def('fern', function (ctx, t, o, wx) {
    var c = o.color || '#46a85a';
    var fr = [-1.0, -0.5, 0, 0.5, 1.0];
    for (var i = 0; i < fr.length; i++) {
      ctx.save(); ctx.rotate(fr[i] * 0.7 + Math.sin(t * 1.8 + i + wx * 0.01) * 0.06);
      ctx.beginPath(); ctx.moveTo(-3, 0); ctx.quadraticCurveTo(-14, -26, 2, -52); ctx.quadraticCurveTo(14, -26, 3, 0); ctx.closePath();
      inkFill(ctx, i % 2 ? c : shade(c, 0.12), 2);
      ctx.strokeStyle = shade(c, -0.3); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -4); ctx.quadraticCurveTo(-4, -26, 2, -48); ctx.stroke();
      ctx.restore();
    }
  });

  // Xương rồng có mặt + hoa hồng trên đầu.
  def('cactus', function (ctx, t, o) {
    var c = o.color || '#5cbf6a', wob = Math.sin(t * 2) * 0.03;
    shadow(ctx, 26);
    ctx.rotate(wob);
    ctx.beginPath();
    rr(ctx, -15, -78, 30, 78, 15);
    ctx.moveTo(-15, -36); ctx.lineTo(-28, -36); ctx.quadraticCurveTo(-36, -36, -36, -46); ctx.lineTo(-36, -60); ctx.arc(-29, -60, 7, Math.PI, 0); ctx.lineTo(-22, -46); ctx.lineTo(-15, -46);
    ctx.moveTo(15, -44); ctx.lineTo(26, -44); ctx.quadraticCurveTo(34, -44, 34, -54); ctx.lineTo(34, -64); ctx.arc(27, -64, 7, 0, Math.PI, true); ctx.lineTo(20, -54); ctx.lineTo(15, -54);
    inkFill(ctx, c, 2.5);
    ctx.strokeStyle = shade(c, -0.25); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-6, -70); ctx.lineTo(-6, -8); ctx.moveTo(6, -70); ctx.lineTo(6, -8); ctx.stroke();
    if (o.flower !== false) {
      ctx.beginPath();
      for (var i = 0; i < 5; i++) { var fx = Math.cos(i * TAU / 5) * 5, fy = -80 + Math.sin(i * TAU / 5) * 5; ctx.moveTo(fx + 4.5, fy); ctx.arc(fx, fy, 4.5, 0, TAU); }
      inkFill(ctx, o.flowerColor || '#ff7eb6', 1.5);
      ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(0, -80, 3, 0, TAU); ctx.fill();
    }
    face(ctx, 0, -50, 0.85, o.mood, t);
  });

  // Nấm có mặt (opts.color mũ, opts.glow: nấm phát sáng trong hang).
  def('mushroom', function (ctx, t, o, wx) {
    var c = o.color || '#ff5a5a';
    if (o.glow) {
      var g = 0.25 + 0.15 * Math.sin(t * 2 + wx);
      ctx.fillStyle = alpha(o.glowColor || '#7fd08a', g);
      ctx.beginPath(); ctx.arc(0, -22, 30, 0, TAU); ctx.fill();
    }
    rr(ctx, -8, -22, 16, 22, 6); inkFill(ctx, '#fff1dc', 2.5);
    ctx.beginPath(); ctx.moveTo(-24, -18); ctx.quadraticCurveTo(-24, -44, 0, -45); ctx.quadraticCurveTo(24, -44, 24, -18); ctx.quadraticCurveTo(0, -12, -24, -18); ctx.closePath();
    inkFill(ctx, c, 2.5);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(-10, -32, 4, 0, TAU); ctx.arc(8, -36, 3, 0, TAU); ctx.arc(14, -24, 2.5, 0, TAU); ctx.fill();
    face(ctx, 0, -10, 0.55, o.mood, t);
  });

  // Bướm bay vòng số 8 quanh điểm (x, y-60). opts.color.
  def('butterfly', function (ctx, t, o, wx) {
    var ph = hash(wx) * 6, c = o.color || ['#ff9fc1', '#ffd23f', '#8fd3ff', '#c59bff'][Math.floor(hash(wx + 2) * 4)];
    var bx = Math.sin(t * 0.9 + ph) * 40, by = -60 + Math.sin(t * 1.8 + ph) * 16;
    ctx.translate(bx, by);
    ctx.scale(Math.cos(t * 0.9 + ph) >= 0 ? 1 : -1, 1);
    var flap = 0.25 + 0.75 * Math.abs(Math.sin(t * 14 + ph));
    ctx.save(); ctx.scale(flap, 1);
    ctx.beginPath(); ctx.ellipse(-8, -6, 9, 8, -0.4, 0, TAU); ctx.moveTo(-1, 4); ctx.ellipse(-7, 5, 6, 5, 0.4, 0, TAU);
    ctx.moveTo(17, -6); ctx.ellipse(8, -6, 9, 8, 0.4, 0, TAU); ctx.moveTo(13, 5); ctx.ellipse(7, 5, 6, 5, -0.4, 0, TAU);
    inkFill(ctx, c, 1.6);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(-9, -7, 2.5, 0, TAU); ctx.arc(9, -7, 2.5, 0, TAU); ctx.fill();
    ctx.restore();
    rr(ctx, -2, -9, 4, 18, 2); inkFill(ctx, INK, 1);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(-1, -9); ctx.quadraticCurveTo(-4, -15, -6, -16); ctx.moveTo(1, -9); ctx.quadraticCurveTo(4, -15, 6, -16); ctx.stroke();
  });

  // Ốc sên đội mũ bò chậm qua lại (opts.hat: 'top'|'nonla'|'party'|'beret'|false, opts.color vỏ).
  def('snail', function (ctx, t, o, wx) {
    var range = o.range == null ? 40 : o.range, sp = 0.18;
    var ph = hash(wx) * 6, k = Math.sin(t * sp + ph);
    var dir = Math.cos(t * sp + ph) >= 0 ? 1 : -1;
    ctx.translate(k * range, 0);
    ctx.scale(dir, 1);
    var stretch = 1 + Math.abs(Math.sin(t * 3)) * 0.06;
    // thân
    ctx.beginPath(); ctx.moveTo(-22, 0); ctx.quadraticCurveTo(-24, -6, -14, -7); ctx.lineTo(16 * stretch, -7);
    ctx.quadraticCurveTo(26 * stretch, -8, 26 * stretch, -18); ctx.quadraticCurveTo(26 * stretch, -26, 20 * stretch, -26); ctx.quadraticCurveTo(14 * stretch, -26, 14 * stretch, -16); ctx.lineTo(14 * stretch, -6); ctx.lineTo(24 * stretch, 0); ctx.closePath();
    inkFill(ctx, o.body || '#ffd98a', 2);
    // râu mắt
    var hx = 20 * stretch;
    ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(hx - 2, -25); ctx.lineTo(hx - 5, -36); ctx.moveTo(hx + 3, -25); ctx.lineTo(hx + 7, -35); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(hx - 5, -37, 3.5, 0, TAU); ctx.arc(hx + 7, -36, 3.5, 0, TAU); ctx.fill(); outline(ctx, 1.5);
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(hx - 4, -37, 1.6, 0, TAU); ctx.arc(hx + 8, -36, 1.6, 0, TAU); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(hx + 2, -18, 3, 0.2, Math.PI - 0.2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,120,150,0.55)'; ctx.beginPath(); ctx.arc(hx + 6, -16, 2, 0, TAU); ctx.fill();
    // vỏ xoắn
    var c = o.color || '#f2994a';
    ctx.beginPath(); ctx.arc(-2, -18, 15, 0, TAU); inkFill(ctx, c, 2);
    ctx.strokeStyle = shade(c, -0.35); ctx.lineWidth = 2.2; ctx.beginPath();
    for (var a = 0; a < 9; a += 0.25) { var r = 13 - a * 1.35; var px = -2 + Math.cos(a + 1) * r, py = -18 + Math.sin(a + 1) * r; if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
    ctx.stroke();
    // mũ
    var hat = o.hat == null ? 'top' : o.hat;
    ctx.save(); ctx.translate(hx + 1, -40); ctx.rotate(0.15);
    if (hat === 'top') {
      rr(ctx, -9, -2, 18, 4, 2); inkFill(ctx, '#3b3f58', 1.5);
      rr(ctx, -6, -15, 12, 14, 2); inkFill(ctx, '#3b3f58', 1.5);
      ctx.fillStyle = '#ff5a6e'; ctx.fillRect(-6, -5, 12, 3);
    } else if (hat === 'nonla') {
      ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(0, -12); ctx.lineTo(12, 0); ctx.closePath(); inkFill(ctx, '#f3d98b', 1.5);
    } else if (hat === 'party') {
      ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(0, -18); ctx.lineTo(7, 0); ctx.closePath(); inkFill(ctx, '#8fd3ff', 1.5);
      ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(0, -19, 3, 0, TAU); ctx.fill();
    } else if (hat === 'beret') {
      ctx.beginPath(); ctx.ellipse(0, -3, 10, 5, -0.2, 0, TAU); inkFill(ctx, '#e5484d', 1.5);
    }
    ctx.restore();
  });

  // Mây trôi bồng bềnh trong thế giới (y = đáy mây). opts.color, opts.face.
  function cloudShape(ctx, c, lw) {
    ctx.beginPath();
    ctx.moveTo(-40, 0); ctx.arc(-30, -12, 14, Math.PI * 0.6, Math.PI * 1.5);
    ctx.arc(-10, -24, 20, Math.PI * 1.1, Math.PI * 1.9);
    ctx.arc(16, -22, 18, Math.PI * 1.15, Math.PI * 1.95);
    ctx.arc(34, -10, 13, Math.PI * 1.4, Math.PI * 0.45);
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = lw ? INK : 'rgba(23,35,61,0.22)'; ctx.lineWidth = lw || 3; ctx.stroke();
    ctx.fillStyle = c; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(-12, -32, 9, 4, -0.2, 0, TAU); ctx.fill();
  }
  Decor.cloudShape = cloudShape;
  def('cloud', function (ctx, t, o, wx) {
    var ph = hash(wx) * 6;
    ctx.translate(Math.sin(t * 0.5 + ph) * 10, Math.sin(t * 1.1 + ph) * 4);
    cloudShape(ctx, o.color || '#ffffff', 2.5);
    if (o.face !== false) face(ctx, 0, -14, 0.8, o.mood || (hash(wx + 9) > 0.6 ? 'sleep' : 'smile'), t);
    if (o.rain) {
      ctx.strokeStyle = '#6fbcf0'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      for (var i = 0; i < 4; i++) { var dy = wrap(t * 60 + i * 13, 40); ctx.beginPath(); ctx.moveTo(-20 + i * 13, 6 + dy); ctx.lineTo(-22 + i * 13, 12 + dy); ctx.stroke(); }
    }
  });

  // Ngọn núi lớn (decor thế giới): opts.color, opts.snow, opts.height.
  def('mountain', function (ctx, t, o) {
    var c = o.color || '#8fa8d8', hgt = o.height || 160;
    ctx.beginPath(); ctx.moveTo(-110, 0); ctx.quadraticCurveTo(-40, -hgt * 0.7, -12, -hgt); ctx.quadraticCurveTo(0, -hgt - 8, 12, -hgt); ctx.quadraticCurveTo(50, -hgt * 0.6, 110, 0); ctx.closePath();
    inkFill(ctx, c, 3);
    ctx.fillStyle = shade(c, -0.12); ctx.beginPath(); ctx.moveTo(8, -hgt + 4); ctx.quadraticCurveTo(48, -hgt * 0.55, 106, 0); ctx.lineTo(30, 0); ctx.quadraticCurveTo(26, -hgt * 0.5, 8, -hgt + 4); ctx.fill();
    if (o.snow !== false) {
      ctx.beginPath(); ctx.moveTo(-34, -hgt * 0.68); ctx.quadraticCurveTo(-14, -hgt - 4, 0, -hgt - 4); ctx.quadraticCurveTo(16, -hgt - 4, 32, -hgt * 0.7);
      ctx.lineTo(20, -hgt * 0.62); ctx.lineTo(10, -hgt * 0.72); ctx.lineTo(-2, -hgt * 0.6); ctx.lineTo(-14, -hgt * 0.72); ctx.lineTo(-24, -hgt * 0.6); ctx.closePath();
      inkFill(ctx, '#ffffff', 2);
    }
    face(ctx, 0, -hgt * 0.42, 1.3, o.mood || 'happy', t);
  });

  // Núi đá vôi (vịnh Hạ Long): cột đá bo tròn, chóp có cây xanh. opts.color, opts.height.
  def('karst', function (ctx, t, o, wx) {
    var c = o.color || '#9db4a8', hgt = o.height || (110 + hash(wx) * 60);
    ctx.beginPath();
    ctx.moveTo(-44, 0); ctx.bezierCurveTo(-52, -hgt * 0.5, -40, -hgt, -10, -hgt); ctx.bezierCurveTo(14, -hgt - 6, 34, -hgt * 0.8, 30, -hgt * 0.55);
    ctx.bezierCurveTo(48, -hgt * 0.4, 50, -hgt * 0.15, 46, 0); ctx.closePath();
    inkFill(ctx, c, 3);
    ctx.fillStyle = shade(c, -0.14);
    ctx.beginPath(); ctx.moveTo(16, -hgt * 0.75); ctx.bezierCurveTo(30, -hgt * 0.5, 42, -hgt * 0.2, 40, 0); ctx.lineTo(18, 0); ctx.bezierCurveTo(24, -hgt * 0.3, 22, -hgt * 0.55, 16, -hgt * 0.75); ctx.fill();
    ctx.beginPath(); ctx.arc(-24, -hgt + 10, 12, 0, TAU); ctx.moveTo(14, -hgt); ctx.arc(-4, -hgt - 2, 14, 0, TAU); ctx.moveTo(30, -hgt * 0.84); ctx.arc(18, -hgt * 0.86, 10, 0, TAU);
    inkFill(ctx, o.green || '#5fae4e', 2);
    if (o.face !== false) face(ctx, 0, -hgt * 0.45, 1, o.mood || 'sleep', t);
    // gợn nước ở chân
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-52 + Math.sin(t * 2) * 3, 2); ctx.lineTo(-30 + Math.sin(t * 2) * 3, 2); ctx.moveTo(30 - Math.sin(t * 2) * 3, 3); ctx.lineTo(54 - Math.sin(t * 2) * 3, 3); ctx.stroke();
  });

  // San hô lắc lư (opts.color).
  def('coral', function (ctx, t, o, wx) {
    var c = o.color || '#ff7f8f', sw = Math.sin(t * 1.6 + wx * 0.02) * 0.08;
    ctx.rotate(sw);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    function branches(w, col) {
      ctx.strokeStyle = col; ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(0, -34); ctx.lineTo(-14, -52); ctx.moveTo(0, -34); ctx.lineTo(12, -58);
      ctx.moveTo(0, -18); ctx.lineTo(-20, -30); ctx.lineTo(-26, -44); ctx.moveTo(0, -24); ctx.lineTo(20, -34); ctx.lineTo(26, -46);
      ctx.stroke();
    }
    branches(15, INK); branches(9, c);
    ctx.fillStyle = shade(c, 0.4); ctx.beginPath(); ctx.arc(-14, -52, 3, 0, TAU); ctx.arc(12, -58, 3, 0, TAU); ctx.arc(26, -46, 3, 0, TAU); ctx.fill();
    face(ctx, 0, -14, 0.5, o.mood || 'happy');
  });

  // Rong biển uốn lượn.
  def('seaweed', function (ctx, t, o, wx) {
    var c = o.color || '#3fbf8f';
    for (var k = -1; k <= 1; k++) {
      ctx.beginPath(); ctx.moveTo(k * 10 - 4, 0);
      for (var y = 0; y >= -60 + Math.abs(k) * 14; y -= 6) ctx.lineTo(k * 10 + Math.sin(y * 0.1 + t * 2 + k + wx) * 6 - 4, y);
      for (var y2 = -60 + Math.abs(k) * 14; y2 <= 0; y2 += 6) ctx.lineTo(k * 10 + Math.sin(y2 * 0.1 + t * 2 + k + wx) * 6 + 4, y2);
      ctx.closePath(); inkFill(ctx, k ? c : shade(c, 0.15), 1.8);
    }
  });

  // Vỏ sò có mặt (opts.color).
  def('shell', function (ctx, t, o) {
    var c = o.color || '#ffc2a8';
    ctx.beginPath(); ctx.moveTo(-18, -4); ctx.quadraticCurveTo(-20, -30, 0, -30); ctx.quadraticCurveTo(20, -30, 18, -4); ctx.lineTo(8, -4); ctx.lineTo(8, 0); ctx.lineTo(-8, 0); ctx.lineTo(-8, -4); ctx.closePath();
    inkFill(ctx, c, 2);
    ctx.strokeStyle = shade(c, -0.25); ctx.lineWidth = 1.6;
    ctx.beginPath(); for (var i = -2; i <= 2; i++) { ctx.moveTo(0, -4); ctx.lineTo(i * 7, -26 + Math.abs(i) * 3); } ctx.stroke();
    face(ctx, 0, -14, 0.55, o.mood || 'happy', t);
  });

  // Tảng băng có mặt (opts.color).
  def('ice', function (ctx, t, o) {
    var c = o.color || '#bfe9ff';
    ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(-28, -30); ctx.lineTo(-14, -46); ctx.lineTo(10, -48); ctx.lineTo(28, -32); ctx.lineTo(26, 0); ctx.closePath();
    inkFill(ctx, c, 2.5);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath(); ctx.moveTo(-20, -30); ctx.lineTo(-12, -40); ctx.lineTo(-8, -38); ctx.lineTo(-16, -26); ctx.closePath(); ctx.fill();
    var gl = 0.5 + 0.5 * Math.sin(t * 3);
    if (gl > 0.7) { ctx.fillStyle = '#ffffff'; star(ctx, 16, -36, 5, 1.6, 0); ctx.fill(); }
    face(ctx, 0, -20, 0.9, o.mood || 'o', t);
  });

  // Người tuyết vẫy tay (opts.scarf màu khăn).
  def('snowman', function (ctx, t, o) {
    shadow(ctx, 28);
    ctx.beginPath(); ctx.arc(0, -22, 24, 0, TAU); ctx.moveTo(18, -58); ctx.arc(0, -58, 18, 0, TAU); ctx.moveTo(14, -88); ctx.arc(0, -88, 14, 0, TAU);
    inkFill(ctx, '#ffffff', 2.5);
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(0, -52, 2.5, 0, TAU); ctx.arc(0, -62, 2.5, 0, TAU); ctx.fill();
    // tay que vẫy
    var wave = Math.sin(t * 4) * 0.35;
    ctx.strokeStyle = '#8a5a3a'; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-16, -60); ctx.lineTo(-38, -70); ctx.stroke();
    ctx.save(); ctx.translate(16, -60); ctx.rotate(-0.5 + wave); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(24, 0); ctx.moveTo(18, 0); ctx.lineTo(24, -6); ctx.stroke(); ctx.restore();
    // khăn
    ctx.beginPath(); rr(ctx, -15, -77, 30, 8, 4); inkFill(ctx, o.scarf || '#e5484d', 1.5);
    ctx.beginPath(); rr(ctx, 4, -74, 8, 18, 3); inkFill(ctx, o.scarf || '#e5484d', 1.5);
    // mũ
    rr(ctx, -12, -104, 24, 5, 2); inkFill(ctx, '#3b3f58', 1.5);
    rr(ctx, -8, -118, 16, 15, 3); inkFill(ctx, '#3b3f58', 1.5);
    face(ctx, 0, -91, 0.75, o.mood || 'grin', t);
    ctx.fillStyle = '#ff9a3c'; ctx.beginPath(); ctx.moveTo(0, -88); ctx.lineTo(13, -85); ctx.lineTo(0, -84); ctx.closePath(); ctx.fill(); outline(ctx, 1.2);
  });

  // Nhà tuyết igloo.
  def('igloo', function (ctx, t, o) {
    ctx.beginPath(); ctx.moveTo(-50, 0); ctx.arc(0, 0, 50, Math.PI, 0); ctx.closePath(); inkFill(ctx, o.color || '#eef8ff', 3);
    ctx.strokeStyle = '#a9cde6'; ctx.lineWidth = 2;
    ctx.beginPath();
    [12, 26, 38].forEach(function (y) { var hw = Math.sqrt(50 * 50 - y * y); ctx.moveTo(-hw, -y); ctx.lineTo(hw, -y); });
    for (var i = -2; i <= 2; i++) { ctx.moveTo(i * 18, 0); ctx.lineTo(i * 18, -12); ctx.moveTo(i * 18 + 9, -12); ctx.lineTo(i * 18 + 9, -26); }
    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(18, -16); ctx.arc(30, -16, 12, Math.PI, 0); ctx.lineTo(42, 0); ctx.closePath(); inkFill(ctx, '#eef8ff', 2.5);
    ctx.fillStyle = '#2b3a5c'; ctx.beginPath(); ctx.moveTo(23, 0); ctx.lineTo(23, -15); ctx.arc(30, -15, 7, Math.PI, 0); ctx.lineTo(37, 0); ctx.closePath(); ctx.fill();
    face(ctx, -14, -28, 1, o.mood || 'happy', t);
  });

  // Núi lửa dễ thương phì khói (opts.color).
  def('volcano', function (ctx, t, o, wx) {
    var c = o.color || '#9a6b52';
    // khói tròn bay lên
    for (var i = 0; i < 4; i++) {
      var k = wrap(t * 0.35 + i * 0.25 + hash(wx), 1);
      ctx.fillStyle = 'rgba(220,220,230,' + (0.85 * (1 - k)).toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(Math.sin(k * 6 + i) * 10, -96 - k * 90, 10 + k * 16, 0, TAU); ctx.fill();
    }
    ctx.beginPath(); ctx.moveTo(-80, 0); ctx.quadraticCurveTo(-40, -50, -22, -92); ctx.lineTo(22, -92); ctx.quadraticCurveTo(40, -50, 80, 0); ctx.closePath();
    inkFill(ctx, c, 3);
    ctx.beginPath(); ctx.moveTo(-22, -92); ctx.quadraticCurveTo(-26, -76, -14, -72); ctx.quadraticCurveTo(-8, -84, 0, -74); ctx.quadraticCurveTo(10, -66, 12, -80); ctx.quadraticCurveTo(22, -72, 22, -92); ctx.closePath();
    inkFill(ctx, '#ff8a3d', 2);
    ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.ellipse(0, -91, 18, 4, 0, 0, TAU); ctx.fill();
    face(ctx, 0, -42, 1.3, o.mood || 'o', t);
  });

  // Khúc xương (khủng long) nằm trên đất.
  def('bone', function (ctx, t, o) {
    ctx.rotate(o.angle || -0.12);
    ctx.beginPath();
    ctx.arc(-26, -12, 7, 0, TAU); ctx.moveTo(-19, -2); ctx.arc(-26, -2, 7, 0, TAU);
    ctx.moveTo(33, -12); ctx.arc(26, -12, 7, 0, TAU); ctx.moveTo(33, -2); ctx.arc(26, -2, 7, 0, TAU);
    ctx.rect(-26, -12, 52, 10);
    inkFill(ctx, o.color || '#fff4dc', 2);
    if (o.face) face(ctx, 0, -8, 0.4, 'happy');
  });

  // Ngôi sao có mặt lấp lánh (y = đáy). opts.color.
  def('star', function (ctx, t, o, wx) {
    var ph = hash(wx) * 6;
    ctx.translate(0, -22 + Math.sin(t * 2 + ph) * 3);
    var sc = 1 + Math.sin(t * 3 + ph) * 0.06;
    ctx.scale(sc, sc); ctx.rotate(Math.sin(t + ph) * 0.12);
    star(ctx, 0, 0, 20, 9, 0); inkFill(ctx, o.color || '#ffd84a', 2.2);
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.ellipse(-5, -8, 3, 1.8, -0.6, 0, TAU); ctx.fill();
    face(ctx, 0, 1, 0.55, o.mood || 'happy');
  });

  // Hành tinh có vành (y = đáy). opts.color, opts.ring (màu | false).
  def('planet', function (ctx, t, o, wx) {
    var c = o.color || ['#ffb347', '#8fd3ff', '#c59bff', '#7fd08a'][Math.floor(hash(wx) * 4)], r = o.r || 30;
    ctx.translate(0, -r - 6 + Math.sin(t * 1.2 + wx) * 4);
    var ring = o.ring == null ? '#ffe39a' : o.ring;
    if (ring) { ctx.beginPath(); ctx.ellipse(0, 0, r * 1.7, r * 0.45, -0.3, Math.PI, TAU); ctx.strokeStyle = INK; ctx.lineWidth = 9; ctx.stroke(); ctx.strokeStyle = ring; ctx.lineWidth = 4.5; ctx.stroke(); }
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); inkFill(ctx, c, 2.5);
    ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r - 1, 0, TAU); ctx.clip();
    ctx.fillStyle = shade(c, -0.12);
    var sh = wrap(t * 6, r * 2);
    ctx.fillRect(-r, -r * 0.45, r * 2, 6); ctx.fillRect(-r, r * 0.3, r * 2, 5);
    ctx.beginPath(); ctx.arc(-r + sh, -r * 0.05, 4, 0, TAU); ctx.fill();
    ctx.restore();
    if (ring) { ctx.beginPath(); ctx.ellipse(0, 0, r * 1.7, r * 0.45, -0.3, 0, Math.PI); ctx.strokeStyle = INK; ctx.lineWidth = 9; ctx.stroke(); ctx.strokeStyle = ring; ctx.lineWidth = 4.5; ctx.stroke(); }
    face(ctx, 0, -2, r / 26, o.mood, t);
  });

  // Mặt trăng khuyết ngủ gật (y = đáy).
  def('moon', function (ctx, t, o) {
    ctx.translate(0, -36 + Math.sin(t) * 3);
    ctx.beginPath(); ctx.arc(0, 0, 30, 0, TAU);
    inkFill(ctx, o.color || '#fff1a8', 2.5);
    ctx.fillStyle = 'rgba(230,200,110,0.6)'; ctx.beginPath(); ctx.arc(10, 12, 5, 0, TAU); ctx.arc(-12, -14, 3.5, 0, TAU); ctx.fill();
    face(ctx, -2, -2, 1, 'sleep');
  });

  // Tinh thể phát sáng (hang động).
  def('crystal', function (ctx, t, o, wx) {
    var c = o.color || '#9b8cff', g = 0.25 + 0.2 * Math.sin(t * 2.5 + wx);
    ctx.fillStyle = alpha(c, g); ctx.beginPath(); ctx.arc(0, -22, 30, 0, TAU); ctx.fill();
    var cs = [[-14, 30, -0.3], [0, 44, 0], [14, 26, 0.35]];
    cs.forEach(function (p) {
      ctx.save(); ctx.translate(p[0], 0); ctx.rotate(p[2]);
      ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(-7, -p[1] + 8); ctx.lineTo(0, -p[1]); ctx.lineTo(7, -p[1] + 8); ctx.lineTo(7, 0); ctx.closePath();
      inkFill(ctx, c, 2); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(-4, -p[1] + 10, 3, p[1] - 14);
      ctx.restore();
    });
    face(ctx, 0, -18, 0.5, 'happy');
  });

  // Hoa sen trên lá súng (y = mặt nước).
  def('lotus', function (ctx, t, o, wx) {
    ctx.translate(0, Math.sin(t * 1.5 + wx) * 1.5);
    ctx.beginPath(); ctx.ellipse(0, 0, 34, 9, 0, 0, TAU); inkFill(ctx, '#5fbf6a', 2);
    ctx.strokeStyle = '#3f9a45'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(18, -5); ctx.stroke();
    var c = o.color || '#ff9fc1';
    [[-0.9, 16], [0.9, 16], [-0.45, 20], [0.45, 20], [0, 22]].forEach(function (p) {
      ctx.save(); ctx.translate(0, -2); ctx.rotate(p[0]);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-9, -p[1] * 0.6, 0, -p[1]); ctx.quadraticCurveTo(9, -p[1] * 0.6, 0, 0); ctx.closePath();
      inkFill(ctx, p[0] === 0 ? shade(c, 0.2) : c, 1.8); ctx.restore();
    });
    face(ctx, 0, -10, 0.45, 'happy');
  });

  // Bụi tre đung đưa.
  def('bamboo', function (ctx, t, o, wx) {
    var c = o.color || '#7cc35a';
    for (var k = 0; k < 3; k++) {
      var bx = (k - 1) * 14, hgt = 120 + hash(wx + k) * 50, sw = Math.sin(t * 1.3 + k + wx * 0.01) * 6;
      ctx.save(); ctx.translate(bx, 0);
      for (var y = 0; y > -hgt; y -= 24) {
        var f = -y / hgt;
        rr(ctx, -5 + sw * f, y - 24, 10, 23, 3); inkFill(ctx, k === 1 ? shade(c, 0.1) : c, 1.6);
      }
      ctx.fillStyle = shade(c, -0.1);
      ctx.beginPath(); ctx.ellipse(8 + sw, -hgt + 10, 12, 4, -0.5, 0, TAU); ctx.ellipse(-8 + sw, -hgt + 30, 12, 4, 0.5, 0, TAU); ctx.fill(); outline(ctx, 1.4);
      ctx.restore();
    }
  });

  // Sóng biển cuộn có mặt (y = mặt nước). opts.color.
  def('wave', function (ctx, t, o, wx) {
    var c = o.color || '#4fb3e8', ph = hash(wx) * 6, b = Math.sin(t * 2 + ph) * 4;
    ctx.translate(0, b);
    ctx.beginPath(); ctx.moveTo(-40, 0); ctx.quadraticCurveTo(-36, -34, 0, -40); ctx.quadraticCurveTo(26, -42, 30, -24); ctx.quadraticCurveTo(22, -32, 10, -26);
    ctx.quadraticCurveTo(6, -16, 20, -8); ctx.quadraticCurveTo(34, 0, 44, 0); ctx.closePath();
    inkFill(ctx, c, 2.5);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(26, -26, 4, 0, TAU); ctx.arc(18, -34, 3, 0, TAU); ctx.arc(-14, -36, 3, 0, TAU); ctx.fill();
    face(ctx, -12, -18, 0.75, o.mood || 'grin', t);
  });

  // ===========================================================================
  // LỚP PARALLAX (không gian màn hình). layer: {kind, parallax, y, height, color, spacing, ...}
  // ===========================================================================
  function Ly(L, d) { return L.y == null ? d : L.y; }
  // Bề rộng phủ hết các ô trong list (từ mép trái ô đầu tới mép phải ô cuối).
  function spanW(list) { return list[list.length - 1].x + list[0].w - list[0].x + 2; }
  function Lh(L, d) { return L.height == null ? d : L.height; }

  // Đồi tròn (cache). L.flowers: rải chấm hoa; L.color2: màu vệt sáng.
  registerTiled('hills', {
    parallax: 0.3, variants: 4,
    period: function (L) { return L.spacing || 360; },
    band: function (L) { return [Ly(L, 420) - Lh(L, 70) - 8, H]; },
    paint: function (ctx, L, list) {
      var y = Ly(L, 420), hgt = Lh(L, 70), c = L.color || '#8fd27a';
      ctx.beginPath();
      list.forEach(function (tl) {
        var hh = hgt * (0.75 + 0.25 * hash(tl.v + 11)), cx = tl.x + tl.w / 2;
        ctx.moveTo(cx - tl.w * 0.62, y); ctx.ellipse(cx, y, tl.w * 0.62, hh, 0, Math.PI, TAU);
      });
      ctx.lineWidth = 6; ctx.strokeStyle = shade(c, -0.18); ctx.stroke();
      ctx.fillStyle = c; ctx.fill();
      ctx.fillRect(list[0].x - 2, y - 1, spanW(list), H - y + 1);
      ctx.fillStyle = L.color2 || shade(c, 0.2);
      list.forEach(function (tl) {
        var hh = hgt * (0.75 + 0.25 * hash(tl.v + 11)), cx = tl.x + tl.w / 2;
        ctx.beginPath(); ctx.ellipse(cx - tl.w * 0.18, y - hh * 0.72, tl.w * 0.14, hh * 0.12, -0.25, 0, TAU); ctx.fill();
      });
      if (L.flowers) {
        list.forEach(function (tl) {
          for (var i = 0; i < 6; i++) {
            ctx.fillStyle = ['#ffffff', '#ffd23f', '#ff9fc1'][i % 3];
            ctx.beginPath(); ctx.arc(tl.x + hash(tl.v * 7 + i) * tl.w, y - hgt * 0.15 + hash(tl.v * 3 + i) * (H - y) * 0.5, 2.5, 0, TAU); ctx.fill();
          }
        });
      }
    }
  });

  // Dãy núi (cache). L.snow: chóp tuyết; L.face: 1 ngọn có mặt.
  registerTiled('mountains', {
    parallax: 0.15, variants: 3,
    period: function (L) { return L.spacing || 300; },
    band: function (L) { return [Ly(L, 430) - Lh(L, 160) - 10, H]; },
    paint: function (ctx, L, list) {
      var y = Ly(L, 430), hgt = Lh(L, 160), c = L.color || '#7fa4c9';
      var peaks = list.map(function (tl) { return { x: tl.x + tl.w / 2, h: hgt * (0.7 + 0.3 * hash(tl.v + 5)), w: tl.w }; });
      ctx.beginPath();
      ctx.moveTo(list[0].x - 2, H);
      peaks.forEach(function (p) {
        ctx.lineTo(p.x - p.w / 2, y);
        ctx.quadraticCurveTo(p.x - p.w * 0.2, y - p.h * 0.75, p.x - 8, y - p.h);
        ctx.quadraticCurveTo(p.x, y - p.h - 6, p.x + 8, y - p.h);
        ctx.quadraticCurveTo(p.x + p.w * 0.2, y - p.h * 0.75, p.x + p.w / 2, y);
      });
      ctx.lineTo(peaks[peaks.length - 1].x + peaks[0].w, H); ctx.closePath();
      ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = shade(c, -0.2); ctx.stroke();
      ctx.fillStyle = c; ctx.fill();
      ctx.fillStyle = shade(c, -0.1);
      peaks.forEach(function (p) {
        ctx.beginPath(); ctx.moveTo(p.x + 4, y - p.h + 2); ctx.quadraticCurveTo(p.x + p.w * 0.2, y - p.h * 0.7, p.x + p.w / 2, y); ctx.lineTo(p.x + 6, y); ctx.closePath(); ctx.fill();
      });
      if (L.snow) {
        ctx.fillStyle = L.snowColor || '#ffffff';
        peaks.forEach(function (p) {
          var sh = p.h * 0.28;
          ctx.beginPath(); ctx.moveTo(p.x - 8, y - p.h); ctx.quadraticCurveTo(p.x, y - p.h - 6, p.x + 8, y - p.h);
          ctx.lineTo(p.x + sh * 0.55, y - p.h + sh); ctx.lineTo(p.x + 6, y - p.h + sh * 0.7); ctx.lineTo(p.x - 4, y - p.h + sh); ctx.lineTo(p.x - sh * 0.6, y - p.h + sh * 0.8); ctx.closePath(); ctx.fill();
        });
      }
      if (L.face) peaks.forEach(function (p, i) { if (list[i].v === 0) face(ctx, p.x, y - p.h * 0.45, 1.1, 'sleep'); });
    }
  });

  // Sóng nước động. L.color, L.foam (màu bọt), L.speed.
  S.registerLayer('waves', function (ctx, L, cam, t) {
    var px = L.parallax == null ? 0.4 : L.parallax, y = Ly(L, 440), c = L.color || '#4fb3e8', sp = L.speed || 2;
    if (L.alpha != null) ctx.globalAlpha *= L.alpha;
    function band(dy, col, amp, ph) {
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(0, H);
      for (var x = 0; x <= W + 12; x += 12) ctx.lineTo(x, y + dy + Math.sin((x + cam * px) / 38 + t * sp + ph) * amp);
      ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    }
    band(-6, shade(c, 0.25), 5, 1.4);
    band(0, c, 6, 0);
    ctx.strokeStyle = L.foam || 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var sx = wrap(i * 131 - cam * px * 1.2 + t * 12, W + 80) - 40, sy = y + 16 + (i % 3) * 12;
      ctx.moveTo(sx, sy); ctx.quadraticCurveTo(sx + 8, sy - 4, sx + 16, sy);
    }
    ctx.stroke();
  });

  // Rải decor lặp lại ở xa: {kind:'decorRow', decor:'bush', y, scale, spacing, parallax, opts}. Chỉ vẽ phần thấy được.
  S.registerLayer('decorRow', function (ctx, L, cam, t) {
    var px = L.parallax == null ? 0.3 : L.parallax, span = L.spacing || 220;
    if (L.alpha != null) ctx.globalAlpha *= L.alpha;
    var off = cam * px, first = Math.floor((off - 120) / span);
    for (var i = first; i * span - off < W + 120; i++) {
      var o = L.opts || {};
      if (L.jitter) o = Object.assign({}, o);
      S.drawDecor(ctx, L.decor || 'bush', i * span - off + (L.jitter ? (hash(i) - 0.5) * span * 0.5 : 0), Ly(L, 430), L.scale || 0.8, t, o);
    }
  });

  // Mây có mặt cười trôi chậm (động; ảnh mây được cache). L: y, height(dải dọc), count, color, speed, scale, face.
  function drawSkyCloud(ctx, x, y, sc, color, mood) {
    var key = 'cloud|' + color + '|' + sc.toFixed(2) + '|' + mood;
    var w = 110 * sc, h = 70 * sc;
    drawSprite(ctx, key, x, y, w, h, w / 2, h - 6 * sc, function (g) {
      g.scale(sc, sc);
      cloudShape(g, color, 0);
      if (mood !== 'none') face(g, 0, -14, 0.75, mood);
    });
  }
  Decor.drawSkyCloud = drawSkyCloud;
  S.registerLayer('clouds', function (ctx, L, cam, t) {
    var px = L.parallax == null ? 0.12 : L.parallax, n = L.count || 5, y = Ly(L, 130), spread = Lh(L, 80);
    var span = W + 260, sp = L.speed == null ? 8 : L.speed, sc0 = L.scale || 1;
    if (L.alpha != null) ctx.globalAlpha *= L.alpha;
    for (var i = 0; i < n; i++) {
      var hx = hash(i + 0.5), sc = sc0 * (0.7 + hash(i + 7) * 0.5);
      var x = wrap(i * span / n + hx * 90 + t * sp * (0.6 + hx * 0.8) - cam * px, span) - 130;
      var mood = L.face === false ? 'none' : ['smile', 'sleep', 'happy', 'o'][i % 4];
      drawSkyCloud(ctx, Math.round(x), Math.round(y - hash(i + 3) * spread + Math.sin(t * 0.6 + i) * 3), Math.round(sc * 10) / 10, L.color || '#ffffff', mood);
    }
  });

  // Thành phố xa (cache): nhà cao tầng, cửa sổ sáng, vài toà có mặt. L.color, L.window.
  registerTiled('city', {
    parallax: 0.2, variants: 5,
    period: function (L) { return L.spacing || 120; },
    band: function (L) { return [Ly(L, 440) - Lh(L, 170) - 30, H]; },
    paint: function (ctx, L, list) {
      var y = Ly(L, 440), hgt = Lh(L, 170), c = L.color || '#8aa0c8', win = L.window || '#fff2b0';
      list.forEach(function (tl) {
        var h = hgt * (0.45 + 0.55 * hash(tl.v + 21)), w = tl.w * (0.7 + 0.2 * hash(tl.v + 4)), x = tl.x + (tl.w - w) / 2;
        var col = tl.v % 2 ? c : shade(c, -0.08);
        rr(ctx, x, y - h, w, h + (H - y), 6);
        ctx.lineWidth = 4; ctx.strokeStyle = shade(c, -0.25); ctx.stroke(); ctx.fillStyle = col; ctx.fill();
        if (tl.v === 2) { ctx.fillStyle = col; ctx.fillRect(x + w / 2 - 2, y - h - 22, 4, 22); ctx.beginPath(); ctx.arc(x + w / 2, y - h - 24, 4, 0, TAU); ctx.fillStyle = '#ff6f6f'; ctx.fill(); }
        if (tl.v === 4) { ctx.beginPath(); ctx.moveTo(x - 4, y - h); ctx.lineTo(x + w / 2, y - h - 26); ctx.lineTo(x + w + 4, y - h); ctx.closePath(); ctx.fillStyle = shade(c, -0.15); ctx.fill(); }
        ctx.fillStyle = win;
        for (var wy = y - h + 14; wy < y - 10; wy += 22) for (var wx2 = x + 9; wx2 < x + w - 14; wx2 += 18) if (hash(tl.v * 31 + wy * 0.7 + wx2) > 0.35) ctx.fillRect(wx2, wy, 9, 11);
        if (tl.v === 1 && h > 80) face(ctx, x + w / 2, y - h * 0.5, 1, 'happy');
      });
    }
  });

  // Biển ở đường chân trời (động, nhẹ): mặt nước + lấp lánh. L.color, L.y.
  S.registerLayer('sea', function (ctx, L, cam, t) {
    var y = Ly(L, 380), c = L.color || '#5cc4ec', px = L.parallax == null ? 0.1 : L.parallax;
    if (L.alpha != null) ctx.globalAlpha *= L.alpha;
    var g = ctx.createLinearGradient(0, y, 0, H);
    g.addColorStop(0, shade(c, 0.2)); g.addColorStop(1, shade(c, -0.15));
    ctx.fillStyle = g; ctx.fillRect(0, y, W, H - y);
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(0, y, W, 3);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath();
    for (var i = 0; i < 16; i++) {
      var sy = y + 10 + hash(i) * (H - y - 20), d = (sy - y) / (H - y);
      var sx = wrap(hash(i + 3) * W * 1.5 - cam * px * (1 + d * 2) + Math.sin(t + i) * 6, W + 60) - 30, len = 8 + d * 18;
      ctx.moveTo(sx, sy); ctx.lineTo(sx + len, sy);
    }
    ctx.stroke();
  });

  // Đồi cát sa mạc (cache). L.color.
  registerTiled('dunes', {
    parallax: 0.25, variants: 3,
    period: function (L) { return L.spacing || 420; },
    band: function (L) { return [Ly(L, 440) - Lh(L, 60) - 8, H]; },
    paint: function (ctx, L, list) {
      var y = Ly(L, 440), hgt = Lh(L, 60), c = L.color || '#f2c46d';
      ctx.beginPath(); ctx.moveTo(list[0].x, H);
      list.forEach(function (tl) {
        var hh = hgt * (0.6 + 0.4 * hash(tl.v + 2));
        ctx.lineTo(tl.x, y); ctx.bezierCurveTo(tl.x + tl.w * 0.3, y - hh, tl.x + tl.w * 0.55, y - hh, tl.x + tl.w, y);
      });
      ctx.lineTo(list[list.length - 1].x + list[0].w, H); ctx.closePath();
      ctx.lineWidth = 5; ctx.strokeStyle = shade(c, -0.2); ctx.stroke(); ctx.fillStyle = c; ctx.fill();
      ctx.strokeStyle = shade(c, 0.3); ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      ctx.beginPath();
      list.forEach(function (tl) { ctx.moveTo(tl.x + tl.w * 0.3, y - 6); ctx.quadraticCurveTo(tl.x + tl.w * 0.45, y - 14, tl.x + tl.w * 0.6, y - 6); });
      ctx.stroke();
    }
  });

  // Rừng cây tròn (cache). L.color, L.trunk.
  registerTiled('forest', {
    parallax: 0.3, variants: 4,
    period: function (L) { return L.spacing || 90; },
    band: function (L) { return [Ly(L, 440) - Lh(L, 120) - 40, H]; },
    paint: function (ctx, L, list) {
      var y = Ly(L, 440), hgt = Lh(L, 120), c = L.color || '#4f9e5b';
      ctx.fillStyle = L.trunk || shade(c, -0.35);
      list.forEach(function (tl) { ctx.fillRect(tl.x + tl.w / 2 - 5, y - hgt * 0.5, 10, hgt * 0.5 + 2); });
      ctx.beginPath();
      list.forEach(function (tl) {
        var hh = hgt * (0.7 + 0.3 * hash(tl.v + 9)), cx = tl.x + tl.w / 2, r = tl.w * 0.62;
        ctx.moveTo(cx + r, y - hh + r); ctx.arc(cx, y - hh + r, r, 0, TAU);
        ctx.moveTo(cx + r * 0.9, y - hh + r * 1.8); ctx.arc(cx, y - hh + r * 1.8, r * 0.9, 0, TAU);
      });
      ctx.lineWidth = 5; ctx.strokeStyle = shade(c, -0.25); ctx.stroke(); ctx.fillStyle = c; ctx.fill();
      ctx.fillStyle = shade(c, 0.15);
      list.forEach(function (tl) { var hh = hgt * (0.7 + 0.3 * hash(tl.v + 9)), cx = tl.x + tl.w / 2, r = tl.w * 0.62; ctx.beginPath(); ctx.arc(cx - r * 0.3, y - hh + r * 0.7, r * 0.3, 0, TAU); ctx.fill(); });
      ctx.fillStyle = shade(c, -0.1); ctx.fillRect(list[0].x, y, spanW(list), H - y);
    }
  });

  // Đồi tuyết (cache) + thông nhỏ. L.color, L.trees.
  registerTiled('snowHills', {
    parallax: 0.25, variants: 3,
    period: function (L) { return L.spacing || 340; },
    band: function (L) { return [Ly(L, 430) - Lh(L, 80) - 40, H]; },
    paint: function (ctx, L, list) {
      var y = Ly(L, 430), hgt = Lh(L, 80), c = L.color || '#f4fbff';
      ctx.beginPath();
      list.forEach(function (tl) { var hh = hgt * (0.7 + 0.3 * hash(tl.v + 13)), cx = tl.x + tl.w / 2; ctx.moveTo(cx - tl.w * 0.62, y); ctx.ellipse(cx, y, tl.w * 0.62, hh, 0, Math.PI, TAU); });
      ctx.lineWidth = 5; ctx.strokeStyle = '#a9cde6'; ctx.stroke(); ctx.fillStyle = c; ctx.fill();
      ctx.fillRect(list[0].x, y - 1, spanW(list), H - y + 1);
      ctx.fillStyle = 'rgba(169,205,230,0.45)';
      list.forEach(function (tl) { var cx = tl.x + tl.w / 2; ctx.beginPath(); ctx.ellipse(cx + tl.w * 0.25, y - 6, tl.w * 0.3, 10, 0, 0, TAU); ctx.fill(); });
      if (L.trees !== false) {
        list.forEach(function (tl) {
          if (hash(tl.v + 40) < 0.4) return;
          var tx = tl.x + tl.w * 0.3, hh = hgt * (0.7 + 0.3 * hash(tl.v + 13)), ty = y - hh * 0.75;
          ctx.fillStyle = L.treeColor || '#4f9e8a';
          ctx.beginPath(); ctx.moveTo(tx - 12, ty); ctx.lineTo(tx, ty - 34); ctx.lineTo(tx + 12, ty); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(tx - 5, ty - 20); ctx.lineTo(tx, ty - 34); ctx.lineTo(tx + 5, ty - 20); ctx.closePath(); ctx.fill();
        });
      }
    }
  });

  // Bầu trời sao (động: nhấp nháy + sao băng). L.count, L.color, L.y (giới hạn dưới).
  S.registerLayer('stars', function (ctx, L, cam, t) {
    var n = L.count || 60, maxY = Ly(L, 360), px = L.parallax == null ? 0.04 : L.parallax;
    if (L.alpha != null) ctx.globalAlpha *= L.alpha;
    ctx.fillStyle = L.color || '#ffffff';
    for (var i = 0; i < n; i++) {
      var sx = wrap(hash(i) * W * 1.3 - cam * px, W), sy = hash(i + 100) * maxY, tw = Math.sin(t * (1.5 + hash(i + 7) * 2) + i);
      var r = 1 + hash(i + 50) * 1.6 + tw * 0.5;
      if (r <= 0.3) continue;
      if (i % 9 === 0) { star(ctx, sx, sy, r * 2.4, r, 0); ctx.fill(); }
      else ctx.fillRect(sx - r / 2, sy - r / 2, r, r);
    }
    // sao băng mỗi ~7 giây
    var k = wrap(t, 7);
    if (k < 0.8) {
      var sx0 = 200 + hash(Math.floor(t / 7)) * 600, sy0 = 40 + hash(Math.floor(t / 7) + 1) * 100, d = k * 260;
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.9 * (1 - k / 0.8)).toFixed(2) + ')'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(sx0 + d, sy0 + d * 0.4); ctx.lineTo(sx0 + d - 50, sy0 + d * 0.4 - 20); ctx.stroke();
    }
  });

  // Dãy núi lửa xa (cache phần núi; khói động). L.color.
  registerTiled('volcanoes', {
    parallax: 0.15, variants: 2,
    period: function (L) { return L.spacing || 480; },
    band: function (L) { return [Ly(L, 430) - Lh(L, 150) - 10, H]; },
    paint: function (ctx, L, list) {
      var y = Ly(L, 430), hgt = Lh(L, 150), c = L.color || '#8a6a5c';
      list.forEach(function (tl) {
        var hh = hgt * (tl.v ? 0.75 : 1), cx = tl.x + tl.w / 2, top = y - hh;
        ctx.beginPath(); ctx.moveTo(cx - tl.w * 0.45, y); ctx.quadraticCurveTo(cx - 40, top + hh * 0.4, cx - 24, top); ctx.lineTo(cx + 24, top); ctx.quadraticCurveTo(cx + 40, top + hh * 0.4, cx + tl.w * 0.45, y); ctx.lineTo(cx + tl.w * 0.45, H); ctx.lineTo(cx - tl.w * 0.45, H); ctx.closePath();
        ctx.lineWidth = 5; ctx.strokeStyle = shade(c, -0.25); ctx.stroke(); ctx.fillStyle = c; ctx.fill();
        ctx.fillStyle = '#ff8a3d'; ctx.beginPath(); ctx.moveTo(cx - 24, top); ctx.lineTo(cx + 24, top); ctx.lineTo(cx + 14, top + 16); ctx.lineTo(cx + 4, top + 8); ctx.lineTo(cx - 8, top + 22); ctx.lineTo(cx - 16, top + 10); ctx.closePath(); ctx.fill();
      });
    },
    live: function (ctx, L, cam, t) {
      // khói tròn bay lên trên miệng núi lửa
      var y = Ly(L, 430), hgt = Lh(L, 150), span = L.spacing || 480, px = L.parallax == null ? 0.15 : L.parallax;
      var off = cam * px;
      for (var i = Math.floor(off / span) - 1; i * span - off < W + span; i++) {
        var v = wrap(i, 2), cx = i * span - off + span / 2, top = y - hgt * (v ? 0.75 : 1);
        for (var k = 0; k < 3; k++) {
          var f = wrap(t * 0.25 + k / 3 + v * 0.1, 1);
          ctx.fillStyle = 'rgba(230,226,236,' + (0.7 * (1 - f)).toFixed(2) + ')';
          ctx.beginPath(); ctx.arc(cx + Math.sin(f * 5 + k) * 10, top - 10 - f * 70, 9 + f * 16, 0, TAU); ctx.fill();
        }
      }
    }
  });

  // Núi đá vôi giữa biển (Hạ Long, cache). L.color, L.green.
  registerTiled('karsts', {
    parallax: 0.18, variants: 4,
    period: function (L) { return L.spacing || 200; },
    band: function (L) { return [Ly(L, 430) - Lh(L, 180) - 20, Ly(L, 430) + 4]; },
    paint: function (ctx, L, list) {
      var y = Ly(L, 430), hgt = Lh(L, 180), c = L.color || '#98b3b0', g = L.green || '#6fae7a';
      list.forEach(function (tl) {
        var hh = hgt * (0.45 + 0.55 * hash(tl.v + 31)), w = tl.w * (0.4 + 0.25 * hash(tl.v + 2)), cx = tl.x + tl.w / 2;
        ctx.beginPath(); ctx.moveTo(cx - w / 2, y + 4); ctx.bezierCurveTo(cx - w * 0.62, y - hh * 0.6, cx - w * 0.5, y - hh, cx - w * 0.05, y - hh);
        ctx.bezierCurveTo(cx + w * 0.4, y - hh, cx + w * 0.6, y - hh * 0.6, cx + w / 2, y + 4); ctx.closePath();
        ctx.lineWidth = 4; ctx.strokeStyle = shade(c, -0.22); ctx.stroke(); ctx.fillStyle = c; ctx.fill();
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx - w * 0.08, y - hh + 4, w * 0.3, 8, 0, 0, TAU); ctx.fill();
      });
    }
  });

  // Ruộng bậc thang / đồng lúa xa (cache). L.color.
  registerTiled('fields', {
    parallax: 0.2, variants: 2,
    period: function (L) { return L.spacing || 320; },
    band: function (L) { return [Ly(L, 420) - Lh(L, 70) - 6, H]; },
    paint: function (ctx, L, list) {
      var y = Ly(L, 420), hgt = Lh(L, 70), c = L.color || '#9fd86a';
      for (var r = 0; r < 4; r++) {
        var ry = y - hgt + r * (hgt / 3), col = r % 2 ? c : shade(c, 0.12);
        ctx.beginPath(); ctx.moveTo(list[0].x, H);
        list.forEach(function (tl) { ctx.lineTo(tl.x, ry + 6 * Math.sin(tl.v * 2 + r)); ctx.quadraticCurveTo(tl.x + tl.w / 2, ry - 10, tl.x + tl.w, ry + 6 * Math.sin((tl.v + 1) * 2 + r)); });
        ctx.lineTo(list[list.length - 1].x + list[0].w, H); ctx.closePath();
        ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = shade(c, -0.2); ctx.lineWidth = 2.5; ctx.stroke();
      }
    }
  });

  // ---- Lớp riêng cho chủ đề gốc v1 (cũng dùng chung được) ----

  // Tường bếp (cache): gạch men, cửa sổ rèm, tủ bếp có mặt, kệ lọ gia vị, đồng hồ.
  registerTiled('kitchenWall', {
    parallax: 0.12, variants: 4,
    period: function (L) { return L.spacing || 300; },
    band: function () { return [0, H]; },
    paint: function (ctx, L, list) {
      var c = L.color || '#ffd9a8', tile = L.tile || '#fff1d6', y0 = L.y == null ? 300 : L.y;
      var x0 = list[0].x, x1 = list[list.length - 1].x + list[0].w;
      // giấy dán tường sọc chấm
      ctx.fillStyle = c; ctx.fillRect(x0, 0, x1 - x0, H);
      ctx.fillStyle = shade(c, 0.18);
      for (var sx = x0; sx < x1; sx += 40) ctx.fillRect(sx, 0, 16, y0);
      // gạch men dưới
      ctx.fillStyle = tile; ctx.fillRect(x0, y0, x1 - x0, H - y0);
      ctx.strokeStyle = shade(tile, -0.12); ctx.lineWidth = 2; ctx.beginPath();
      for (var gy = y0; gy < H; gy += 30) { ctx.moveTo(x0, gy); ctx.lineTo(x1, gy); }
      for (var gx = x0; gx < x1; gx += 30) { ctx.moveTo(gx, y0); ctx.lineTo(gx, H); }
      ctx.stroke();
      ctx.fillStyle = shade(c, -0.18); ctx.fillRect(x0, y0 - 8, x1 - x0, 8);
      list.forEach(function (tl) {
        var x = tl.x;
        if (tl.v === 0) {
          // cửa sổ có rèm và mây ngoài trời
          rr(ctx, x + 70, 70, 150, 120, 14); inkFill(ctx, '#9ce7f1', 3);
          ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x + 120, 120, 14, 0, TAU); ctx.arc(x + 140, 112, 18, 0, TAU); ctx.arc(x + 160, 122, 12, 0, TAU); ctx.fill();
          ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x + 145, 70); ctx.lineTo(x + 145, 190); ctx.moveTo(x + 70, 130); ctx.lineTo(x + 220, 130); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x + 62, 62); ctx.quadraticCurveTo(x + 92, 120, x + 74, 196); ctx.lineTo(x + 62, 196); ctx.closePath();
          ctx.moveTo(x + 228, 62); ctx.quadraticCurveTo(x + 198, 120, x + 216, 196); ctx.lineTo(x + 228, 196); ctx.closePath();
          inkFill(ctx, '#ff8fa3', 2);
          rr(ctx, x + 56, 54, 178, 12, 6); inkFill(ctx, '#c98b4f', 2);
          rr(ctx, x + 66, 190, 158, 10, 4); inkFill(ctx, '#ffffff', 2);
          // chậu cây nhỏ trên bậu cửa
          rr(ctx, x + 172, 172, 22, 18, 4); inkFill(ctx, '#f27a43', 1.5);
          ctx.beginPath(); ctx.arc(x + 183, 166, 9, 0, TAU); inkFill(ctx, '#6cc35a', 1.5);
        } else if (tl.v === 1) {
          // tủ bếp treo có mặt
          rr(ctx, x + 40, 50, 220, 130, 12); inkFill(ctx, L.cabinet || '#f6c36a', 3);
          ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + 150, 56); ctx.lineTo(x + 150, 174); ctx.stroke();
          rr(ctx, x + 136, 104, 6, 26, 3); inkFill(ctx, '#ffffff', 1.5); rr(ctx, x + 158, 104, 6, 26, 3); inkFill(ctx, '#ffffff', 1.5);
          face(ctx, x + 95, 112, 1.2, 'happy'); face(ctx, x + 205, 112, 1.2, 'smile');
        } else if (tl.v === 2) {
          // kệ gia vị với lọ có mặt
          rr(ctx, x + 40, 170, 220, 12, 5); inkFill(ctx, '#c98b4f', 2.5);
          var jars = [['#ff8a5c', 36], ['#7fd08a', 44], ['#8fd3ff', 30], ['#ffd23f', 40]];
          for (var j = 0; j < jars.length; j++) {
            var jx = x + 60 + j * 52, jh = jars[j][1];
            rr(ctx, jx, 170 - jh, 34, jh, 8); inkFill(ctx, '#ffffff', 2);
            rr(ctx, jx + 4, 170 - jh + 10, 26, jh - 14, 6); ctx.fillStyle = jars[j][0]; ctx.fill();
            rr(ctx, jx + 3, 170 - jh - 7, 28, 9, 3); inkFill(ctx, '#b97945', 1.5);
            face(ctx, jx + 17, 170 - jh * 0.5, 0.55, j % 2 ? 'happy' : 'smile');
          }
          // chảo treo
          ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + 150, 40); ctx.lineTo(x + 150, 70); ctx.stroke();
          ctx.beginPath(); ctx.arc(x + 150, 98, 26, 0, TAU); inkFill(ctx, '#5b6378', 2.5);
          ctx.fillStyle = '#7a8399'; ctx.beginPath(); ctx.arc(x + 146, 94, 16, 0, TAU); ctx.fill();
        } else {
          // đồng hồ treo tường có mặt
          ctx.beginPath(); ctx.arc(x + 150, 110, 42, 0, TAU); inkFill(ctx, '#fff6df', 3);
          ctx.beginPath(); ctx.arc(x + 150, 110, 34, 0, TAU); ctx.strokeStyle = '#f27a43'; ctx.lineWidth = 4; ctx.stroke();
          face(ctx, x + 150, 112, 1.1, 'smile');
          ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + 150, 110); ctx.lineTo(x + 150, 84); ctx.moveTo(x + 150, 110); ctx.lineTo(x + 168, 102); ctx.stroke();
        }
      });
    }
  });

  // Quầy bếp phía sau (cache): tủ dưới, bếp nướng, bồn rửa, tủ lạnh có mặt. L.y = mặt quầy.
  registerTiled('kitchenCounter', {
    parallax: 0.35, variants: 3,
    period: function (L) { return L.spacing || 420; },
    band: function (L) { return [Ly(L, 380) - 170, H]; },
    paint: function (ctx, L, list) {
      var y = Ly(L, 380), c = L.color || '#f6c36a', top = L.top || '#fff1d6';
      list.forEach(function (tl) {
        var x = tl.x;
        if (tl.v === 2) {
          // tủ lạnh cao
          rr(ctx, x + 40, y - 160, 120, 260, 18); inkFill(ctx, L.fridge || '#e8f6ff', 3);
          ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + 40, y - 70); ctx.lineTo(x + 160, y - 70); ctx.stroke();
          rr(ctx, x + 140, y - 140, 8, 50, 4); inkFill(ctx, '#b8c8d8', 1.5);
          face(ctx, x + 100, y - 118, 1.3, 'grin');
          ctx.fillStyle = '#ff6f6f'; ctx.beginPath(); ctx.arc(x + 70, y - 40, 7, 0, TAU); ctx.fill();
          ctx.fillStyle = '#ffd23f'; star(ctx, x + 92, y - 30, 8, 3.5, 0); ctx.fill();
          rr(ctx, x + 170, y, 250, H - y, 4); inkFill(ctx, c, 2.5);
          rr(ctx, x + 166, y - 12, 258, 14, 6); inkFill(ctx, top, 2.5);
          return;
        }
        rr(ctx, x, y, tl.w, H - y, 4); inkFill(ctx, c, 2.5);
        for (var d = 0; d < 3; d++) {
          rr(ctx, x + 14 + d * (tl.w / 3), y + 18, tl.w / 3 - 24, 70, 8); ctx.strokeStyle = shade(c, -0.3); ctx.lineWidth = 2.5; ctx.stroke();
          rr(ctx, x + d * (tl.w / 3) + tl.w / 6 - 10, y + 26, 20, 5, 2.5); ctx.fillStyle = '#ffffff'; ctx.fill();
        }
        rr(ctx, x - 4, y - 12, tl.w + 8, 14, 6); inkFill(ctx, top, 2.5);
        if (tl.v === 0) {
          // bếp + nồi
          rr(ctx, x + 60, y - 20, 120, 10, 4); inkFill(ctx, '#5b6378', 2);
          rr(ctx, x + 80, y - 66, 80, 46, 12); inkFill(ctx, '#ff8a5c', 2.5);
          rr(ctx, x + 72, y - 72, 96, 12, 6); inkFill(ctx, '#d9663b', 2);
          face(ctx, x + 120, y - 44, 1, 'happy');
          // bồn rửa + vòi
          ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(x + 290, y - 12); ctx.lineTo(x + 290, y - 44); ctx.quadraticCurveTo(x + 290, y - 56, x + 306, y - 52); ctx.stroke();
          ctx.strokeStyle = '#c8d4e2'; ctx.lineWidth = 3; ctx.stroke();
        } else {
          // lọ bánh quy + thớt
          rr(ctx, x + 60, y - 70, 64, 70, 16); inkFill(ctx, '#d9f0ff', 2.5);
          ctx.fillStyle = '#c98b4f'; ctx.beginPath(); ctx.arc(x + 82, y - 22, 9, 0, TAU); ctx.arc(x + 104, y - 18, 9, 0, TAU); ctx.arc(x + 92, y - 36, 9, 0, TAU); ctx.fill();
          rr(ctx, x + 56, y - 80, 72, 14, 6); inkFill(ctx, '#ff8fa3', 2);
          face(ctx, x + 92, y - 52, 0.8, 'wink');
          rr(ctx, x + 220, y - 50, 110, 40, 10); inkFill(ctx, '#e0a96d', 2.5);
          ctx.beginPath(); ctx.arc(x + 316, y - 30, 5, 0, TAU); ctx.fillStyle = shade('#e0a96d', 0.3); ctx.fill();
        }
      });
    }
  });

  // Dãy nhà xa trên mái (cache): thân nhà, mái tam giác, ống khói, cửa sổ sáng đèn. L.color.
  registerTiled('roofHouses', {
    parallax: 0.3, variants: 4,
    period: function (L) { return L.spacing || 210; },
    band: function (L) { return [Ly(L, 480) - Lh(L, 160) - 70, H]; },
    paint: function (ctx, L, list) {
      var y = Ly(L, 480), hgt = Lh(L, 160), c = L.color || '#c97a5e';
      list.forEach(function (tl) {
        var hh = hgt * (0.55 + 0.45 * hash(tl.v + 17)), x = tl.x + 10, w = tl.w - 30, top = y - hh;
        var col = tl.v % 2 ? c : shade(c, -0.12);
        ctx.lineJoin = 'round';
        ctx.fillStyle = shade(c, -0.3); ctx.fillRect(x + w * 0.7, top - 52, 20, 40);
        ctx.beginPath(); ctx.rect(x, top, w, hh + (H - y)); ctx.moveTo(x - 12, top + 1); ctx.lineTo(x + w / 2, top - 55); ctx.lineTo(x + w + 12, top + 1); ctx.closePath();
        ctx.lineWidth = 4; ctx.strokeStyle = shade(c, -0.35); ctx.stroke(); ctx.fillStyle = col; ctx.fill();
        ctx.fillStyle = L.window || 'rgba(255,240,200,0.85)';
        rr(ctx, x + w * 0.18, top + 24, 26, 24, 5); ctx.fill(); rr(ctx, x + w * 0.62, top + 24, 26, 24, 5); ctx.fill();
        if (tl.v === 1) face(ctx, x + w / 2, top + 72, 1, 'happy');
      });
    }
  });

  // Trần hang thạch nhũ (cache). L.color.
  registerTiled('caveCeiling', {
    parallax: 0.25, variants: 4,
    period: function (L) { return L.spacing || 110; },
    band: function (L) { return [0, Lh(L, 120) + 10]; },
    paint: function (ctx, L, list) {
      var c = L.color || '#1b1530', hgt = Lh(L, 120);
      ctx.fillStyle = c; ctx.fillRect(list[0].x, 0, spanW(list), 18);
      ctx.beginPath();
      list.forEach(function (tl) {
        var len = hgt * (0.35 + 0.65 * hash(tl.v + 3)), cx = tl.x + tl.w / 2;
        ctx.moveTo(cx - 28, 0); ctx.quadraticCurveTo(cx - 8, len * 0.6, cx, len); ctx.quadraticCurveTo(cx + 8, len * 0.6, cx + 28, 0);
      });
      ctx.closePath(); ctx.fillStyle = c; ctx.fill();
      ctx.fillStyle = 'rgba(155,140,255,0.25)';
      list.forEach(function (tl) { var len = hgt * (0.35 + 0.65 * hash(tl.v + 3)); ctx.beginPath(); ctx.arc(tl.x + tl.w / 2, len - 4, 3, 0, TAU); ctx.fill(); });
    }
  });

  // Tảng đá tròn trong hang (cache). L.color.
  registerTiled('caveRocks', {
    parallax: 0.35, variants: 3,
    period: function (L) { return L.spacing || 240; },
    band: function (L) { return [Ly(L, 480) - Lh(L, 110) - 6, H]; },
    paint: function (ctx, L, list) {
      var y = Ly(L, 480), hgt = Lh(L, 110), c = L.color || 'rgba(27,21,48,0.55)';
      ctx.fillStyle = c;
      list.forEach(function (tl) {
        ctx.beginPath(); ctx.ellipse(tl.x + tl.w / 2, y, tl.w * 0.5, hgt * (0.6 + 0.4 * hash(tl.v + 8)), 0, Math.PI, TAU); ctx.fill();
      });
    }
  });

  // Những đôi mắt gián lấp ló trong bóng tối (động, dễ thương: chớp mắt). L.color.
  S.registerLayer('roachEyes', function (ctx, L, cam, t) {
    var px = L.parallax == null ? 0.32 : L.parallax, n = L.count || 7;
    for (var e = 0; e < n; e++) {
      if (Math.sin(t * 1.3 + e * 2.1) > 0.85) continue;
      var ex = wrap(e * 170 + 60 - cam * px, W + 140) - 70, ey = (L.y || 170) + ((e * 53) % (L.height || 200));
      var look = Math.sin(t * 0.8 + e) * 1.5;
      ctx.fillStyle = L.color || '#ffe35c';
      ctx.beginPath(); ctx.ellipse(ex, ey, 5, 4, 0, 0, TAU); ctx.ellipse(ex + 14, ey, 5, 4, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#17233d';
      ctx.beginPath(); ctx.arc(ex + look, ey, 1.8, 0, TAU); ctx.arc(ex + 14 + look, ey, 1.8, 0, TAU); ctx.fill();
    }
  });

  Decor.ready = true;
})();
