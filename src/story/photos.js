// @ts-check
/* ============================================================================
 * OG.Photos — REGISTRY ẢNH CHỤP THỰC TẾ CHO THẺ KIẾN THỨC (nạp lười / lazy-load)
 * ----------------------------------------------------------------------------
 * Vai trò:      Gắn ảnh thật (vd ảnh Hồ Gươm cạnh hình vẽ cartoon) vào thẻ kiến thức qua cặp journeyId + cardId,
 *               nạp ảnh khi cần, và vẽ ảnh lên canvas kiểu "object-fit". Mỗi file assets/photos/<id>/credits.js
 *               gọi OG.Photos.register(...) lúc nạp; scene 'card', 'notebook' (src/story/scenes.js) và trang
 *               docs/credits.html đọc từ đây.
 * Khái niệm:    registry (bảng tra cứu đăng ký từ bên ngoài, gộp nhiều lần) · lazy-load (chỉ tạo new Image()
 *               khi giao diện cần) · cache theo khoá + máy trạng thái loading → ready | error · validate dữ liệu
 *               vào (danh sách trắng giấy phép) · "JSONP" kiểu file:// (dữ liệu là script gọi hàm) ·
 *               object-fit cover/contain bằng drawImage 9 tham số · shimmer (khung chờ tải)
 * Bài học:      docs/learn/12-data-driven-man-cau-do-hanh-trinh.md · docs/learn/07-ve-canvas-procedural-cache.md
 * Phụ thuộc:    KHÔNG cần core lúc LOAD (tự tạo window.OG nếu thiếu — trang credits dùng riêng).
 *               CHẠY (tuỳ chọn): OG.util.roundRectPath, OG.Events.emit, OG.FONT
 * Event:        phát: 'photo:load' {journeyId, cardId} · nghe: (không)
 * API công khai: OG.Photos.ROOT, licenseOk(name), register(jid, map), get/has/src(jid, cardId), journeys(),
 *               entries(jid), image/ready/loading(jid, cardId), preload(jid, [cardId]), creditLine(entry, maxAuthor),
 *               sizeOf(img, entry), drawCover(...), drawContain(...), drawShimmer(...)
 * Đọc tiếp:     assets/photos/home/credits.js (dữ liệu đăng ký thật) → src/story/scenes.js (scene 'card': drawPolaroid,
 *               scene 'notebook': thumbnail) → docs/credits.html (trang ghi công dùng lại module này)
 *
 * VÌ SAO CẦN FILE NÀY?
 *   - Thẻ kiến thức (content.js của mỗi hành trình) chỉ có hình vẽ. Ta muốn thêm ảnh thật mà KHÔNG sửa content.js,
 *     nên ảnh được "gắn" vào thẻ qua cardId trong một registry riêng (giống bảng tra cứu: journeyId + cardId → ảnh).
 *   - Game phải chạy được khi mở thẳng file index.html (file://) → không dùng fetch() đọc JSON. Thay vào đó mỗi
 *     hành trình có một file .js (assets/photos/<id>/credits.js) GỌI OG.Photos.register(...) lúc được nạp.
 *   - Ảnh có giấy phép tự do (CC BY, CC BY-SA...) BẮT BUỘC ghi công: tác giả, giấy phép, nguồn. Registry giữ đủ thông
 *     tin đó để vẽ dòng "📷 tác giả · giấy phép · nguồn" dưới ảnh và để trang docs/credits.html liệt kê.
 *   Không có ảnh, hoặc ảnh lỗi → mọi hàm trả null và giao diện vẽ hình cartoon như cũ (KHÔNG BAO GIỜ làm hỏng game).
 * ========================================================================== */

/**
 * @typedef {Object} PhotoEntry  một ảnh đã chuẩn hoá trong registry (định dạng đầu vào: xem assets/photos/<id>/credits.js)
 * @property {string} journeyId
 * @property {string} cardId
 * @property {string} file        tên file trong assets/photos/<journeyId>/ (mặc định '<cardId>.webp')
 * @property {number} w           bề rộng thật của file, px (để tính tỉ lệ khi ảnh chưa tải xong)
 * @property {number} h           bề cao thật, px
 * @property {string} author      tác giả (chữ thuần, không HTML)
 * @property {string} license     tên ngắn giấy phép (phải qua licenseOk)
 * @property {string} licenseUrl
 * @property {string} source      'Wikimedia Commons' | 'Unsplash' | 'Pexels' | 'NASA'
 * @property {string} sourceUrl
 * @property {string} title       tên/mô tả gốc của ảnh
 * @property {string} note        ghi chú bản phái sinh, vd 'Đã thu nhỏ, chuyển sang WebP'
 * @property {{x:number, y:number}|null} focus  điểm giữ lại khi cắt ảnh cho vừa khung, 0..1 (null = giữa)
 * @property {string} [src]       đường dẫn TƯƠNG ĐỐI từ index.html: 'assets/photos/<jid>/<file>'
 */
/**
 * @typedef {Object} PhotoRecord  trạng thái nạp của một ảnh (mục trong cache)
 * @property {HTMLImageElement|null} img
 * @property {'loading'|'ready'|'error'} state
 */
(function () {
  'use strict';
  // Trang docs/credits.html nạp file này mà không có src/core → tự tạo window.OG nếu chưa có.
  // (Ép kiểu any: object rỗng {} sẽ được các module khác gắn thêm field lúc chạy.)
  var OG = /** @type {any} */ (window.OG = window.OG || {});

  var ROOT = 'assets/photos/';
  /** @type {Object<string, Object<string, PhotoEntry>>} registry[journeyId][cardId] = entry đã chuẩn hoá */
  var registry = {};
  // 💡 Khái niệm: cache theo khoá — mỗi ảnh chỉ tạo new Image() MỘT lần, dù draw() hỏi 60 lần/giây.
  /** @type {Object<string, PhotoRecord>} cache['jid/cardId'] */
  var cache = {};

  // ---------------------------------------------------------------------------
  // Danh sách trắng giấy phép. Dùng chung với tools/photos/fetch_commons.py và tests/smoke.js.
  //   NHẬN: Public Domain (kể cả PD-USGov/NASA), CC0, CC BY (mọi bản), CC BY-SA (mọi bản), Unsplash, Pexels.
  //   TỪ CHỐI: NC (phi thương mại), ND (không phái sinh — ta thu nhỏ ảnh nên là bản phái sinh!), GFDL, fair use...
  // 💡 Khái niệm: danh sách trắng (allowlist) an toàn hơn danh sách đen — chuỗi lạ mặc định bị TỪ CHỐI.
  //   Ở đây dùng thêm LICENSE_BAD làm lớp chặn phụ: chuỗi có phần đầu hợp lệ nhưng kèm NC/ND/GFDL...
  //   (vd 'CC BY-SA 4.0, NC') vẫn bị từ chối.
  // ---------------------------------------------------------------------------
  var LICENSE_BAD = /(\bNC\b|\bND\b|non-?commercial|no-?deriv|GFDL|fair[ _-]?use|all rights reserved|copyright(ed)?\b|unknown)/i;
  var LICENSE_GOOD = /^(public domain|pd([ -]|$)|cc0|cc[ -]?pd|cc[ -]by([ -]sa)?[ -]\d|unsplash license|pexels license)/i;
  /**
   * Kiểm tra tên giấy phép có được phép hiển thị trong game không.
   * @param {any} name  tên ngắn, vd 'CC BY-SA 4.0'
   * @returns {boolean}
   * @example
   *   OG.Photos.licenseOk('CC BY-SA 4.0');    // true
   *   OG.Photos.licenseOk('CC BY-NC-SA 4.0'); // false (phi thương mại)
   */
  function licenseOk(name) {
    var s = String(name == null ? '' : name).trim();
    return !!s && !LICENSE_BAD.test(s) && LICENSE_GOOD.test(s);
  }

  function str(v) { return v == null ? '' : String(v).trim(); }
  function key(jid, cid) { return jid + '/' + cid; }

  // Cắt ngắn chuỗi theo số ký tự. Array.from tách theo code point → không cắt đôi emoji (cặp surrogate).
  function clip(s, n) {
    var a = Array.from(str(s));
    return a.length > n ? a.slice(0, Math.max(1, n - 1)).join('').trim() + '…' : a.join('');
  }

  // Đường viền bo góc — dùng OG.util nếu có (trong game), tự vẽ nếu không (trang credits).
  function rr(ctx, x, y, w, h, r) {
    if (OG.util && OG.util.roundRectPath) { OG.util.roundRectPath(ctx, x, y, w, h, r); return; }
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  var Photos = (OG.Photos = {
    ROOT: ROOT,
    licenseOk: licenseOk,

    /**
     * Đăng ký (hoặc gộp thêm) ảnh cho một hành trình. Gọi nhiều lần cùng journeyId được (cardId trùng → ghi đè).
     * Entry thiếu tác giả/nguồn hoặc giấy phép không hợp lệ bị BỎ QUA kèm cảnh báo console.
     * @param {string} journeyId
     * @param {Object<string, Object>} map  {cardId: entry thô} — định dạng ở đầu assets/photos/<id>/credits.js
     * @example
     *   OG.Photos.register('home', { k_veggie: { file: 'k_veggie.webp', w: 800, h: 533, author: 'A',
     *     license: 'CC BY-SA 4.0', source: 'Wikimedia Commons', sourceUrl: 'https://commons.wikimedia.org/...' } });
     */
    register: function (journeyId, map) {
      if (!journeyId) { console.warn('[OG.Photos] register cần journeyId'); return; }
      var dst = registry[journeyId] || (registry[journeyId] = {});
      Object.keys(map || {}).forEach(function (cardId) {
        var e = map[cardId] || {};
        // 💡 Khái niệm: chuẩn hoá ở CỔNG VÀO — mọi field là chuỗi đã trim, số là số. Code vẽ phía sau
        //   không phải kiểm tra kiểu nữa (dữ liệu do công cụ sinh hoặc người sửa tay có thể sai kiểu).
        var n = {
          journeyId: journeyId, cardId: cardId,
          file: str(e.file) || cardId + '.webp',
          w: +e.w || 0, h: +e.h || 0,
          author: str(e.author), license: str(e.license), licenseUrl: str(e.licenseUrl),
          source: str(e.source), sourceUrl: str(e.sourceUrl),
          title: str(e.title), note: str(e.note),
          focus: e.focus && typeof e.focus === 'object' ? { x: +e.focus.x || 0.5, y: e.focus.y == null ? 0.5 : +e.focus.y } : null
        };
        // Ảnh thiếu ghi công hoặc giấy phép không hợp lệ thì KHÔNG hiển thị (an toàn pháp lý trước tiên).
        if (!licenseOk(n.license) || !n.author || !n.sourceUrl) {
          console.warn('[OG.Photos] Bỏ qua ảnh ' + key(journeyId, cardId) + ': thiếu ghi công hoặc giấy phép không hợp lệ (' + n.license + ')');
          return;
        }
        n.src = ROOT + journeyId + '/' + n.file;
        dst[cardId] = n;
        delete cache[key(journeyId, cardId)]; // đăng ký lại → nạp lại ảnh mới
      });
    },
    /**
     * @param {string} journeyId
     * @param {string} cardId
     * @returns {PhotoEntry|null} entry đã chuẩn hoá, null nếu thẻ không có ảnh
     */
    get: function (journeyId, cardId) { return (registry[journeyId] && registry[journeyId][cardId]) || null; },
    /** @param {string} journeyId @param {string} cardId @returns {boolean} thẻ có ảnh đã đăng ký */
    has: function (journeyId, cardId) { return !!Photos.get(journeyId, cardId); },
    /** @param {string} journeyId @param {string} cardId @returns {string|null} đường dẫn tương đối từ index.html */
    src: function (journeyId, cardId) { var e = Photos.get(journeyId, cardId); return e ? e.src : null; },
    /** @returns {string[]} các journeyId đã có ảnh */
    journeys: function () { return Object.keys(registry); },
    /**
     * Liệt kê entry của một hành trình (theo thứ tự đăng ký) — trang credits dùng để in bảng ghi công.
     * @param {string} journeyId
     * @returns {PhotoEntry[]}
     */
    entries: function (journeyId) {
      var m = registry[journeyId] || {};
      return Object.keys(m).map(function (k) { return m[k]; });
    },

    /**
     * Lấy (và nạp LƯỜI nếu cần) ảnh của thẻ. Lần gọi đầu tạo new Image(); các lần sau trả lại record trong cache.
     * Phát 'photo:load' khi tải xong.
     * 💡 Khái niệm: lazy-load + máy trạng thái — record đi loading → ready | error đúng một lần.
     *   Vì sao không cần "vẽ lại" thủ công khi onload? Vòng lặp game (OG.Loop) vẽ lại canvas MỖI frame,
     *   nên frame kế tiếp sau onload sẽ tự thấy state 'ready' và vẽ ảnh. Ta chỉ phát event cho ai quan tâm.
     * 🧪 Thử: đổi tên một file .webp trong assets/photos/home/ rồi mở thẻ đó trong Sổ tay — record sang 'error',
     *   thẻ tự quay về bố cục hình vẽ cartoon, game vẫn chạy bình thường.
     * @param {string} journeyId
     * @param {string} cardId
     * @returns {PhotoRecord|null} null nếu thẻ không có ảnh
     * @example
     *   var rec = OG.Photos.image('home', 'k_veggie');
     *   if (rec && rec.state === 'ready') ctx.drawImage(rec.img, 0, 0);
     */
    image: function (journeyId, cardId) {
      var e = Photos.get(journeyId, cardId);
      if (!e) return null;
      var k = key(journeyId, cardId), rec = cache[k];
      if (rec) return rec;
      rec = cache[k] = { img: null, state: 'loading' };
      try {
        var img = new Image();
        img.decoding = 'async'; // giải mã ảnh ngoài luồng chính → không giật frame khi ảnh lớn tải xong
        img.onload = function () {
          rec.state = 'ready';
          if (OG.Events && OG.Events.emit) OG.Events.emit('photo:load', { journeyId: journeyId, cardId: cardId });
        };
        // Lỗi mạng / thiếu file: đánh dấu 'error' → giao diện quay về hình vẽ cartoon, không thử lại liên tục.
        img.onerror = function () { rec.state = 'error'; };
        rec.img = img;
        // ⚠️ Bẫy: gán onload/onerror TRƯỚC src. Trình duyệt hiện đại phát 'load' bất đồng bộ nên gán ngay sau
        //   (cùng đoạn code) thường vẫn kịp, nhưng nếu việc gán bị lùi lại (setTimeout, await...) mà ảnh đã có
        //   trong bộ nhớ đệm thì event đã qua → record kẹt mãi ở 'loading'. Gán trước là thói quen an toàn.
        img.src = e.src; // đường dẫn tương đối → chạy được cả qua file:// lẫn GitHub Pages
      } catch (err) {
        rec.state = 'error';
      }
      return rec;
    },
    /**
     * @param {string} journeyId
     * @param {string} cardId
     * @returns {HTMLImageElement|null} ảnh đã tải xong để vẽ, hoặc null (chưa có / đang tải / lỗi). Gọi hàm này cũng kích hoạt nạp lười.
     */
    ready: function (journeyId, cardId) {
      var rec = Photos.image(journeyId, cardId);
      return rec && rec.state === 'ready' ? rec.img : null;
    },
    /**
     * @param {string} journeyId
     * @param {string} cardId
     * @returns {boolean} true khi có ảnh nhưng chưa tải xong (để vẽ khung shimmer)
     */
    loading: function (journeyId, cardId) {
      var rec = Photos.image(journeyId, cardId);
      return !!rec && rec.state === 'loading';
    },
    /**
     * Bắt đầu tải trước vài ảnh (ví dụ ảnh của các trang sách trong màn sắp chơi) để popup hiện ngay. Thẻ không có ảnh bị bỏ qua.
     * @param {string} journeyId
     * @param {string[]} cardIds
     */
    preload: function (journeyId, cardIds) {
      (cardIds || []).forEach(function (cid) { if (Photos.has(journeyId, cid)) Photos.image(journeyId, cid); });
    },

    /**
     * Tạo dòng ghi công ngắn: "📷 Tác giả · CC BY-SA 4.0 · Wikimedia Commons". Tác giả dài thì cắt bớt.
     * @param {PhotoEntry|null} e
     * @param {number} [maxAuthor=26]  số ký tự tối đa của tên tác giả
     * @returns {string} '' nếu e rỗng
     */
    creditLine: function (e, maxAuthor) {
      if (!e) return '';
      return '📷 ' + clip(e.author, maxAuthor || 26) + ' · ' + e.license + ' · ' + (e.source || 'Nguồn mở');
    },

    // -------------------------------------------------------------------------
    // Vẽ
    // -------------------------------------------------------------------------
    /**
     * Lấy kích thước gốc của ảnh: ưu tiên số đo thật của trình duyệt, rồi tới w/h trong registry, cuối cùng tỉ lệ 4:3.
     * @param {HTMLImageElement|null} img
     * @param {PhotoEntry|null} [e]
     * @returns {{w:number, h:number}} px
     */
    sizeOf: function (img, e) {
      return { w: (img && img.naturalWidth) || (e && e.w) || 4, h: (img && img.naturalHeight) || (e && e.h) || 3 };
    },
    /**
     * Vẽ ảnh giống CSS "object-fit: cover": phủ kín khung, giữ tỉ lệ, cắt phần thừa quanh điểm focus (mặc định giữa).
     * 💡 Khái niệm: drawImage 9 tham số (sx, sy, sw, sh → dx, dy, dw, dh) — chọn một VÙNG của ảnh gốc
     *   rồi kéo vừa khung đích; thay đổi vùng nguồn là cách "cắt ảnh" không cần canvas phụ.
     * @param {CanvasRenderingContext2D} ctx
     * @param {HTMLImageElement} img  ảnh đã tải xong
     * @param {number} x  khung đích, góc trên-trái, px
     * @param {number} y
     * @param {number} w
     * @param {number} h
     * @param {number} [r=0]  bán kính bo góc khung, px
     * @param {{x:number, y:number}|null} [focus]  điểm giữ lại, 0..1
     * @param {PhotoEntry} [e]  entry để lấy w/h dự phòng
     */
    drawCover: function (ctx, img, x, y, w, h, r, focus, e) {
      var s = Photos.sizeOf(img, e);
      var k = Math.max(w / s.w, h / s.h);          // tỉ lệ phóng để phủ kín khung
      var sw = w / k, sh = h / k;                  // phần ảnh gốc thật sự được dùng
      var fx = focus ? focus.x : 0.5, fy = focus ? focus.y : 0.5;
      // Đặt tâm vùng nguồn tại điểm focus rồi kẹp vào trong ảnh (không lấy vùng ngoài mép ảnh).
      var sx = Math.min(Math.max(0, s.w * fx - sw / 2), s.w - sw);
      var sy = Math.min(Math.max(0, s.h * fy - sh / 2), s.h - sh);
      ctx.save();
      rr(ctx, x, y, w, h, r || 0); ctx.clip();
      ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
      ctx.restore();
    },
    /**
     * Vẽ ảnh giống "object-fit: contain": cả bức ảnh nằm gọn trong khung, căn giữa (dùng khi phóng to toàn màn hình).
     * @param {CanvasRenderingContext2D} ctx
     * @param {HTMLImageElement} img
     * @param {number} x  khung chứa, px
     * @param {number} y
     * @param {number} w
     * @param {number} h
     * @param {number} [r=0]  bo góc, px
     * @param {PhotoEntry} [e]
     * @returns {{x:number, y:number, w:number, h:number}} hình chữ nhật thật sự của ảnh (để vẽ viền đúng mép ảnh)
     */
    drawContain: function (ctx, img, x, y, w, h, r, e) {
      var s = Photos.sizeOf(img, e);
      var k = Math.min(w / s.w, h / s.h);
      var dw = s.w * k, dh = s.h * k, dx = x + (w - dw) / 2, dy = y + (h - dh) / 2;
      ctx.save();
      rr(ctx, dx, dy, dw, dh, r || 0); ctx.clip();
      ctx.drawImage(img, dx, dy, dw, dh);
      ctx.restore();
      return { x: dx, y: dy, w: dw, h: dh };
    },
    /**
     * Vẽ khung "đang tải": nền xám nhạt với một dải sáng chạy chéo qua (hiệu ứng shimmer), lặp mỗi ~1,8 giây.
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} x  px
     * @param {number} y
     * @param {number} w
     * @param {number} h
     * @param {number} [r=0]  bo góc, px
     * @param {number} [t=0]  thời gian, giây
     */
    drawShimmer: function (ctx, x, y, w, h, r, t) {
      ctx.save();
      rr(ctx, x, y, w, h, r || 0); ctx.clip();
      ctx.fillStyle = '#e6ebf3'; ctx.fillRect(x, y, w, h);
      // Vị trí dải sáng: pha = (t·0,9) mod 1,6, quy về 0..1 rồi quét từ trước mép trái tới sau mép phải.
      var band = w * 0.5, pos = x - band + (((t || 0) * 0.9) % 1.6) / 1.6 * (w + band * 2);
      var g = ctx.createLinearGradient(pos - band / 2, y, pos + band / 2, y + h * 0.3);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.75)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
      // biểu tượng máy ảnh mờ ở giữa cho bé biết "ảnh đang tới"
      ctx.globalAlpha *= 0.35;
      ctx.font = Math.round(Math.min(w, h) * 0.22) + 'px ' + (OG.FONT || 'sans-serif');
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#17233d';
      ctx.fillText('📷', x + w / 2, y + h / 2);
      ctx.restore();
    },

    // Chỉ dùng trong test: xoá một entry (để smoke test thử giao diện với ảnh giả rồi dọn lại).
    _unregister: function (journeyId, cardId) {
      if (registry[journeyId]) delete registry[journeyId][cardId];
      delete cache[key(journeyId, cardId)];
    },
    _cache: function (journeyId, cardId) { return cache[key(journeyId, cardId)] || null; }
  });
})();
