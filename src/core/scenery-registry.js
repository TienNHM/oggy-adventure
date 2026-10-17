// @ts-check
/* ============================================================================
 * OG.Scenery — SỔ ĐĂNG KÝ CẢNH NỀN THEO CHỦ ĐỀ (registry) + HÌNH DỰ PHÒNG (fallback)
 * ----------------------------------------------------------------------------
 * Vai trò:      Nơi lưu dữ liệu cảnh nền: chủ đề (ThemeDef), hàm vẽ decor và hàm vẽ lớp parallax.
 *               File này chỉ giữ dữ liệu + vẽ an toàn; bộ vẽ thật nằm ở src/gfx/scenery.js.
 *               - Hành trình (src/journeys/<id>/theme.js) gọi OG.Scenery.registerTheme(id, def) lúc load.
 *               - Thư viện decor (src/gfx/decor*.js) gọi registerDecor/registerLayer lúc load.
 *               - Bộ vẽ (src/gfx/scenery.js: OG.Sprites.drawBackground/drawPlatform/drawDecor) đọc getTheme(id).
 * Khái niệm:    registry pattern (sổ đăng ký theo tên) · data-driven design (chủ đề là dữ liệu) ·
 *               graceful degradation (thiếu thư viện vẫn vẽ được hình đơn giản) · parallax (lớp xa cuộn chậm) ·
 *               cô lập lỗi hàm vẽ + save/restore cân bằng
 * Bài học:      docs/learn/08-camera-parallax.md, docs/learn/12-data-driven-man-cau-do-hanh-trinh.md
 * Phụ thuộc:    OG.W, OG.H (đọc LÚC CHẠY). KHÔNG phụ thuộc src/gfx: load trước gfx nên gfx có chỗ để đăng ký.
 * Event:        phát: (không) · nghe: (không)
 * API công khai: OG.Scenery.BUILTIN, registerTheme(id, def), getTheme(id), has(id), known(id), list(), baseOf(id),
 *               registerDecor(kind, fn), hasDecor, listDecor, drawDecor(ctx, kind, x, y, scale, t, opts),
 *               registerLayer(kind, fn), hasLayer, listLayers, drawLayer(ctx, layer, camX, t, theme),
 *               fallbackDecor, fallbackLayer
 * Đọc tiếp:     src/gfx/scenery.js (bộ vẽ đọc ThemeDef) → src/journeys/home/theme.js (ví dụ một ThemeDef)
 * Dữ liệu:      ThemeDef, SceneryLayer, DecorFn trong src/types.d.ts; hợp đồng đầy đủ docs/STORY.md mục 4.
 * ========================================================================== */

/**
 * Hàm vẽ một lớp parallax đã đăng ký. Không gian MÀN HÌNH, phủ ngang 960 px.
 * @typedef {(ctx: CanvasRenderingContext2D, layer: SceneryLayer, camX: number, t: number, theme: ThemeDef) => void} LayerFn
 */
(function () {
  'use strict';
  var OG = window.OG;
  var TAU = Math.PI * 2;

  // Tham số mặc định của lớp đồi dự phòng (khi SceneryLayer thiếu field)
  var FALLBACK_PARALLAX = 0.3;   // cuộn bằng 30% tốc độ camera
  var FALLBACK_BASE_Y = 400;     // chân đồi, px màn hình
  var FALLBACK_HILL_H = 60;      // độ cao đỉnh đồi, px
  var FALLBACK_SPACING = 320;    // khoảng cách giữa hai đỉnh đồi, px
  var FALLBACK_STEP = 16;        // bước nối điểm khi vẽ đường cong, px

  /** @type {Object<string, ThemeDef>} id → ThemeDef */
  var themes = {};
  /** @type {Object<string, DecorFn>} kind → hàm vẽ decor (x = tâm, y = mặt đất/chân) */
  var decors = {};
  /** @type {Object<string, LayerFn>} kind → hàm vẽ lớp (không gian màn hình) */
  var layers = {};

  // Chủ đề gốc của v1 do src/gfx/scenery.js vẽ sẵn (không cần ThemeDef).
  var BUILTIN = ['kitchen', 'garden', 'roof', 'lair', 'boss'];

  /**
   * In cảnh báo đúng MỘT lần cho mỗi key (hàm vẽ lỗi sẽ bị gọi 60 lần/giây).
   * @param {string} key
   * @param {string} msg
   */
  function warnOnce(key, msg) {
    if (warnOnce.seen[key]) return;
    warnOnce.seen[key] = true;
    if (window.console && console.warn) console.warn('[OG.Scenery] ' + msg);
  }
  /** @type {Object<string, boolean>} */
  warnOnce.seen = {};

  /**
   * Hình dự phòng cho decor chưa có trong thư viện: bụi cây tròn có mặt cười.
   * @type {DecorFn}
   */
  function fallbackDecor(ctx, x, y, s, t, opts) {
    var c = (opts && opts.color) || '#7cc96a';
    ctx.save();
    // Dịch gốc về chân decor rồi scale: toạ độ bên dưới tính quanh (0,0) = tâm-chân, y âm = lên trên.
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = c;
    ctx.strokeStyle = '#17233d';
    ctx.lineWidth = 3;
    // tán lá: ba hình tròn chồng nhau + một dải chữ nhật làm đáy phẳng
    ctx.beginPath();
    ctx.arc(-14, -14, 14, 0, TAU); ctx.arc(0, -22, 17, 0, TAU); ctx.arc(15, -14, 14, 0, TAU);
    ctx.fill();
    ctx.fillRect(-26, -14, 52, 14);
    // mặt cười (mắt + miệng)
    ctx.fillStyle = '#17233d';
    ctx.beginPath(); ctx.arc(-6, -18, 2, 0, TAU); ctx.arc(6, -18, 2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.lineWidth = 2; ctx.arc(0, -14, 5, 0.2, Math.PI - 0.2); ctx.stroke();
    ctx.restore();
  }

  /**
   * Lớp parallax dự phòng: dãy đồi lượn sóng (dùng cho mọi kind chưa biết).
   * @param {CanvasRenderingContext2D} ctx
   * @param {SceneryLayer} L lớp cần vẽ
   * @param {number} camX Camera.x, px thế giới
   * @param {number} [t] thời gian, giây (không dùng — giữ để cùng chữ ký với LayerFn)
   */
  function fallbackLayer(ctx, L, camX, t) {
    var W = OG.W, H = OG.H;
    var px = L.parallax == null ? FALLBACK_PARALLAX : L.parallax;
    var baseY = L.y == null ? FALLBACK_BASE_Y : L.y;
    var amp = L.height == null ? FALLBACK_HILL_H : L.height;
    var span = L.spacing || FALLBACK_SPACING;
    // 💡 Khái niệm: parallax — lớp xa cuộn chậm hơn camera (camX * px với px < 1) nên trông như ở xa.
    //   Lấy phần dư (%) theo span vì hoạ tiết lặp lại mỗi span px: chỉ cần vẽ 1 màn hình + 2 chu kỳ đệm,
    //   không phụ thuộc thế giới rộng bao nhiêu.
    var off = -((camX * px) % span);
    ctx.save();
    ctx.fillStyle = L.color || '#9fd88a';
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (var x = off - span; x <= W + span; x += FALLBACK_STEP) {
      var k = (x - off) / span;
      // |sin| tạo các "vòm" liên tiếp: mỗi span px một ngọn đồi.
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
    /**
     * Đăng ký (hoặc ghi đè) một chủ đề cảnh nền. Gắn def.id = id (SỬA def).
     * @param {string} id
     * @param {ThemeDef} def
     * @returns {ThemeDef | null} null nếu id không hợp lệ
     * @example
     *   OG.Scenery.registerTheme('beach', { base: 'garden', sky: { top: '#7fd3ff', bottom: '#fff2c4' } });
     */
    registerTheme: function (id, def) {
      if (!id || typeof id !== 'string') { warnOnce('bad-id', 'registerTheme cần id chuỗi'); return null; }
      def = def || {};
      def.id = id;
      themes[id] = def;
      return def;
    },
    /** @param {string} id @returns {ThemeDef | null} */
    getTheme: function (id) { return themes[id] || null; },
    /** @param {string} id @returns {boolean} đã có ThemeDef đăng ký */
    has: function (id) { return !!themes[id]; },
    /** @param {string} id @returns {boolean} vẽ được (đã đăng ký hoặc là chủ đề gốc v1) */
    known: function (id) { return !!themes[id] || BUILTIN.indexOf(id) >= 0; },
    /** @returns {string[]} id các chủ đề đã đăng ký */
    list: function () { return Object.keys(themes); },
    /**
     * Tìm chủ đề v1 gần nhất để vẽ khi bộ vẽ chưa hỗ trợ ThemeDef (def.base hoặc 'garden').
     * @param {string} id
     * @returns {string} một id trong BUILTIN
     */
    baseOf: function (id) {
      if (BUILTIN.indexOf(id) >= 0) return id;
      var d = themes[id];
      return (d && d.base && BUILTIN.indexOf(d.base) >= 0) ? d.base : 'garden';
    },

    // ---- Decor (đồ vật trang trí, có thể có mặt cười) ----
    /**
     * Đăng ký hàm vẽ decor. fn(ctx, x, y, scale, t, opts): x = tâm ngang, y = mặt đất (chân), toạ độ thế giới.
     * @param {string} kind
     * @param {DecorFn} fn
     * @returns {DecorFn}
     */
    registerDecor: function (kind, fn) { if (typeof fn === 'function') decors[kind] = fn; return fn; },
    /** @param {string} kind @returns {boolean} */
    hasDecor: function (kind) { return !!decors[kind]; },
    /** @returns {string[]} */
    listDecor: function () { return Object.keys(decors); },
    /**
     * Vẽ một decor an toàn: dùng thư viện nếu có, lỗi hoặc thiếu thì vẽ hình dự phòng.
     * @param {CanvasRenderingContext2D} ctx
     * @param {string} kind
     * @param {number} x tâm ngang, px thế giới
     * @param {number} y mặt đất (chân), px thế giới
     * @param {number} [scale=1]
     * @param {number} [t=0] thời gian, giây (hoạt ảnh)
     * @param {Object} [opts]
     * @returns {boolean} true nếu vẽ bằng thư viện, false nếu dùng hình dự phòng
     */
    drawDecor: function (ctx, kind, x, y, scale, t, opts) {
      var fn = decors[kind];
      // ⚠️ Bẫy: save trước try, restore ở MỌI nhánh — hàm vẽ ném lỗi giữa chừng mà không restore thì
      //   transform/alpha dở dang "rò" sang mọi thứ vẽ sau (cả HUD bị lệch).
      ctx.save();
      try {
        if (fn) { fn(ctx, x, y, scale || 1, t || 0, opts || {}); ctx.restore(); return true; }
      } catch (e) {
        warnOnce('decor-' + kind, 'decor "' + kind + '" lỗi: ' + (e && e.message));
      }
      ctx.restore();
      // 💡 Khái niệm: graceful degradation — thiếu/lỗi thư viện decor thì vẫn hiện một bụi cây,
      //   màn chơi không bị "lủng" chỗ trống hay sập.
      ctx.save();
      fallbackDecor(ctx, x, y, scale || 1, t || 0, opts);
      ctx.restore();
      return false;
    },

    // ---- Lớp parallax ----
    /**
     * Đăng ký hàm vẽ một loại lớp parallax (không gian MÀN HÌNH, phủ ngang 960 px).
     * @param {string} kind
     * @param {LayerFn} fn
     * @returns {LayerFn}
     */
    registerLayer: function (kind, fn) { if (typeof fn === 'function') layers[kind] = fn; return fn; },
    /** @param {string} kind @returns {boolean} */
    hasLayer: function (kind) { return !!layers[kind]; },
    /** @returns {string[]} */
    listLayers: function () { return Object.keys(layers); },
    /**
     * Vẽ một lớp parallax. Ưu tiên: layer.draw riêng → hàm đã đăng ký theo kind → dãy đồi dự phòng.
     * @param {CanvasRenderingContext2D} ctx
     * @param {SceneryLayer} layer
     * @param {number} camX Camera.x, px thế giới
     * @param {number} t thời gian, giây
     * @param {ThemeDef} theme chủ đề chứa lớp này
     * 🧪 Thử: thêm vào layers của một ThemeDef  { kind: 'khongco', parallax: 0.8, color: '#f9a' }  — lớp lạ sẽ
     *   được vẽ thành dãy đồi hồng cuộn gần bằng tốc độ camera.
     */
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
