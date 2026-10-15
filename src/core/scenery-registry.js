/* OG.Scenery — SỔ ĐĂNG KÝ cảnh nền theo chủ đề (chỉ dữ liệu + fallback an toàn).
 * Chủ sở hữu: agent Tích hợp (src/core/). Hợp đồng đầy đủ: docs/STORY.md mục 4.
 *
 * Ai dùng:
 *   - Hành trình (src/journeys/<id>/theme.js) gọi OG.Scenery.registerTheme(id, def) lúc load.
 *   - Thư viện decor (src/gfx/decor*.js, agent cảnh nền) gọi registerDecor/registerLayer lúc load.
 *   - Bộ vẽ (src/gfx/scenery.js: OG.Sprites.drawBackground/drawPlatform/drawDecor) đọc getTheme(id).
 * File này KHÔNG phụ thuộc gfx: nếu thư viện decor chưa có thì drawDecor/drawLayer vẽ hình đơn giản. */
(function () {
  'use strict';
  var OG = window.OG;
  var TAU = Math.PI * 2;

  var themes = {};   // id -> ThemeDef
  var decors = {};   // kind -> fn(ctx, x, y, scale, t, opts)  (x = tâm, y = mặt đất/chân)
  var layers = {};   // kind -> fn(ctx, layer, camX, t, theme)  (không gian màn hình)

  // Chủ đề gốc của v1 do src/gfx/scenery.js vẽ sẵn.
  var BUILTIN = ['kitchen', 'garden', 'roof', 'lair', 'boss'];

  function warnOnce(key, msg) {
    if (warnOnce.seen[key]) return;
    warnOnce.seen[key] = true;
    if (window.console && console.warn) console.warn('[OG.Scenery] ' + msg);
  }
  warnOnce.seen = {};

  // Hình dự phòng cho decor chưa có trong thư viện: bụi cây tròn có mặt cười.
  function fallbackDecor(ctx, x, y, s, t, opts) {
    var c = (opts && opts.color) || '#7cc96a';
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = c;
    ctx.strokeStyle = '#17233d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(-14, -14, 14, 0, TAU); ctx.arc(0, -22, 17, 0, TAU); ctx.arc(15, -14, 14, 0, TAU);
    ctx.fill();
    ctx.fillRect(-26, -14, 52, 14);
    ctx.fillStyle = '#17233d';
    ctx.beginPath(); ctx.arc(-6, -18, 2, 0, TAU); ctx.arc(6, -18, 2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.lineWidth = 2; ctx.arc(0, -14, 5, 0.2, Math.PI - 0.2); ctx.stroke();
    ctx.restore();
  }

  // Lớp parallax dự phòng: dãy đồi lượn sóng (dùng cho mọi kind chưa biết).
  function fallbackLayer(ctx, L, camX, t) {
    var W = OG.W, H = OG.H;
    var px = L.parallax == null ? 0.3 : L.parallax;
    var baseY = L.y == null ? 400 : L.y;
    var amp = L.height == null ? 60 : L.height;
    var span = L.spacing || 320;
    var off = -((camX * px) % span);
    ctx.save();
    ctx.fillStyle = L.color || '#9fd88a';
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (var x = off - span; x <= W + span; x += 16) {
      var k = (x - off) / span;
      ctx.lineTo(x, baseY - Math.abs(Math.sin(k * Math.PI)) * amp);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  var Scenery = (OG.Scenery = {
    BUILTIN: BUILTIN.slice(),

    // ---- Chủ đề ----
    // def: ThemeDef (docs/STORY.md mục 4). Đăng ký lại cùng id = ghi đè.
    registerTheme: function (id, def) {
      if (!id || typeof id !== 'string') { warnOnce('bad-id', 'registerTheme cần id chuỗi'); return null; }
      def = def || {};
      def.id = id;
      themes[id] = def;
      return def;
    },
    getTheme: function (id) { return themes[id] || null; },
    has: function (id) { return !!themes[id]; },
    // true nếu id vẽ được (đã đăng ký hoặc là chủ đề gốc v1).
    known: function (id) { return !!themes[id] || BUILTIN.indexOf(id) >= 0; },
    list: function () { return Object.keys(themes); },
    // Chủ đề v1 gần nhất để vẽ khi bộ vẽ chưa hỗ trợ ThemeDef (def.base hoặc 'garden').
    baseOf: function (id) {
      if (BUILTIN.indexOf(id) >= 0) return id;
      var d = themes[id];
      return (d && d.base && BUILTIN.indexOf(d.base) >= 0) ? d.base : 'garden';
    },

    // ---- Decor (đồ vật trang trí, có thể có mặt cười) ----
    // fn(ctx, x, y, scale, t, opts): x = tâm ngang, y = mặt đất (chân). Không gian thế giới. Tự save/restore.
    registerDecor: function (kind, fn) { if (typeof fn === 'function') decors[kind] = fn; return fn; },
    hasDecor: function (kind) { return !!decors[kind]; },
    listDecor: function () { return Object.keys(decors); },
    // Vẽ 1 decor an toàn. Trả về true nếu vẽ bằng thư viện, false nếu dùng hình dự phòng.
    drawDecor: function (ctx, kind, x, y, scale, t, opts) {
      var fn = decors[kind];
      ctx.save();
      try {
        if (fn) { fn(ctx, x, y, scale || 1, t || 0, opts || {}); ctx.restore(); return true; }
      } catch (e) {
        warnOnce('decor-' + kind, 'decor "' + kind + '" lỗi: ' + (e && e.message));
      }
      ctx.restore();
      ctx.save();
      fallbackDecor(ctx, x, y, scale || 1, t || 0, opts);
      ctx.restore();
      return false;
    },

    // ---- Lớp parallax ----
    // fn(ctx, layer, camX, t, theme): không gian MÀN HÌNH, phủ ngang 960 px. Tự save/restore.
    registerLayer: function (kind, fn) { if (typeof fn === 'function') layers[kind] = fn; return fn; },
    hasLayer: function (kind) { return !!layers[kind]; },
    listLayers: function () { return Object.keys(layers); },
    drawLayer: function (ctx, layer, camX, t, theme) {
      ctx.save();
      try {
        if (typeof layer.draw === 'function') layer.draw(ctx, camX, t, layer, theme);
        else if (layers[layer.kind]) layers[layer.kind](ctx, layer, camX, t, theme);
        else fallbackLayer(ctx, layer, camX, t);
      } catch (e) {
        warnOnce('layer-' + layer.kind, 'lớp "' + layer.kind + '" lỗi: ' + (e && e.message));
      }
      ctx.restore();
    },

    // Hình dự phòng (để bộ vẽ khác dùng lại).
    fallbackDecor: fallbackDecor,
    fallbackLayer: fallbackLayer
  });
})();
