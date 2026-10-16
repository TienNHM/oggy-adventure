/* OG.Photos — ẢNH CHỤP THỰC TẾ cho thẻ kiến thức (ví dụ ảnh thật Hồ Gươm bên cạnh hình vẽ cartoon).
 * Chủ sở hữu: agent story-ui (src/story/). Ảnh + ghi công: assets/photos/<journeyId>/ (mỗi agent ảnh một thư mục).
 *
 * VÌ SAO CẦN FILE NÀY?
 *   - Thẻ kiến thức (content.js của mỗi hành trình) chỉ có hình vẽ. Ta muốn thêm ảnh thật mà KHÔNG sửa content.js,
 *     nên ảnh được "gắn" vào thẻ qua cardId trong một registry riêng (giống bảng tra cứu: journeyId + cardId → ảnh).
 *   - Game phải chạy được khi mở thẳng file index.html (file://) → không dùng fetch() đọc JSON. Thay vào đó mỗi
 *     hành trình có một file .js (assets/photos/<id>/credits.js) GỌI OG.Photos.register(...) lúc được nạp.
 *   - Ảnh có giấy phép tự do (CC BY, CC BY-SA...) BẮT BUỘC ghi công: tác giả, giấy phép, nguồn. Registry giữ đủ thông
 *     tin đó để vẽ dòng "📷 tác giả · giấy phép · nguồn" dưới ảnh và để trang docs/credits.html liệt kê.
 *
 * ĐỊNH DẠNG MỘT ENTRY (xem thêm comment đầu assets/photos/<id>/credits.js):
 *   { file: 'hn_hoguom.webp',        // tên file trong assets/photos/<journeyId>/ (mặc định '<cardId>.webp')
 *     w: 800, h: 533,                // kích thước thật của file (để tính tỉ lệ khi ảnh chưa tải xong)
 *     author: 'Nguyễn Văn A',        // tác giả (chữ thuần, không HTML)
 *     license: 'CC BY-SA 4.0',       // tên ngắn của giấy phép (phải thuộc danh sách trắng bên dưới)
 *     licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
 *     source: 'Wikimedia Commons',   // 'Wikimedia Commons' | 'Unsplash' | 'Pexels' | 'NASA'
 *     sourceUrl: 'https://commons.wikimedia.org/wiki/File:...',
 *     title: 'Tên/mô tả gốc của ảnh',
 *     note: 'Đã thu nhỏ, chuyển sang WebP',   // ảnh đã bị chỉnh → là bản phái sinh, phải ghi chú
 *     focus: { x: 0.5, y: 0.4 } }    // (tuỳ chọn) điểm giữ lại khi cắt ảnh cho vừa khung, 0..1
 *
 * API:
 *   register(journeyId, {cardId: entry})  get(journeyId, cardId) -> entry đã chuẩn hoá | null   has(...)
 *   src(journeyId, cardId) -> 'assets/photos/<jid>/<file>' (đường dẫn TƯƠNG ĐỐI từ index.html)
 *   image(journeyId, cardId) -> {img, state:'loading'|'ready'|'error'} | null   (nạp LƯỜI lần đầu gọi)
 *   ready(journeyId, cardId) -> HTMLImageElement đã tải xong | null      preload(journeyId, [cardId])
 *   licenseOk(name) -> bool     creditLine(entry, maxAuthor) -> '📷 ...'     journeys() / entries(journeyId)
 *   drawCover(ctx, img, x, y, w, h, r, focus)  drawContain(...)  drawShimmer(ctx, x, y, w, h, r, t)
 *
 * Không có ảnh, hoặc ảnh lỗi → mọi hàm trả null và giao diện vẽ hình cartoon như cũ (KHÔNG BAO GIỜ làm hỏng game). */
(function () {
  'use strict';
  // Trang docs/credits.html nạp file này mà không có src/core → tự tạo window.OG nếu chưa có.
  var OG = (window.OG = window.OG || {});

  var ROOT = 'assets/photos/';
  var registry = {};   // registry[journeyId][cardId] = entry đã chuẩn hoá
  var cache = {};      // cache['jid/cardId'] = {img, state} — mỗi ảnh chỉ tạo new Image() MỘT lần

  // ---------------------------------------------------------------------------
  // Danh sách trắng giấy phép. Dùng chung với tools/photos/fetch_commons.py và tests/smoke.js.
  //   NHẬN: Public Domain (kể cả PD-USGov/NASA), CC0, CC BY (mọi bản), CC BY-SA (mọi bản), Unsplash, Pexels.
  //   TỪ CHỐI: NC (phi thương mại), ND (không phái sinh — ta thu nhỏ ảnh nên là bản phái sinh!), GFDL, fair use...
  // ---------------------------------------------------------------------------
  var LICENSE_BAD = /(\bNC\b|\bND\b|non-?commercial|no-?deriv|GFDL|fair[ _-]?use|all rights reserved|copyright(ed)?\b|unknown)/i;
  var LICENSE_GOOD = /^(public domain|pd([ -]|$)|cc0|cc[ -]?pd|cc[ -]by([ -]sa)?[ -]\d|unsplash license|pexels license)/i;
  function licenseOk(name) {
    var s = String(name == null ? '' : name).trim();
    return !!s && !LICENSE_BAD.test(s) && LICENSE_GOOD.test(s);
  }

  function str(v) { return v == null ? '' : String(v).trim(); }
  function key(jid, cid) { return jid + '/' + cid; }

  // Cắt ngắn chuỗi theo số ký tự (đếm theo "ký tự hiển thị" để không cắt đôi emoji/chữ có dấu tổ hợp).
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

    // Đăng ký (hoặc gộp thêm) ảnh cho một hành trình. Gọi nhiều lần cùng journeyId được.
    register: function (journeyId, map) {
      if (!journeyId) { console.warn('[OG.Photos] register cần journeyId'); return; }
      var dst = registry[journeyId] || (registry[journeyId] = {});
      Object.keys(map || {}).forEach(function (cardId) {
        var e = map[cardId] || {};
        // Chuẩn hoá: mọi field là chuỗi đã trim; số là số. Giữ cả bản gốc để test có thể soi.
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
    get: function (journeyId, cardId) { return (registry[journeyId] && registry[journeyId][cardId]) || null; },
    has: function (journeyId, cardId) { return !!Photos.get(journeyId, cardId); },
    src: function (journeyId, cardId) { var e = Photos.get(journeyId, cardId); return e ? e.src : null; },
    journeys: function () { return Object.keys(registry); },
    // Danh sách entry của một hành trình (theo thứ tự đăng ký).
    entries: function (journeyId) {
      var m = registry[journeyId] || {};
      return Object.keys(m).map(function (k) { return m[k]; });
    },

    // Nạp ảnh LƯỜI: chỉ khi giao diện cần vẽ mới tạo new Image(). Kết quả được cache.
    // Vì sao không cần "vẽ lại" thủ công khi onload? Vòng lặp game (OG.Loop) vẽ lại canvas MỖI frame,
    // nên frame kế tiếp sau onload sẽ tự thấy state 'ready' và vẽ ảnh. Ta chỉ phát event cho ai quan tâm.
    image: function (journeyId, cardId) {
      var e = Photos.get(journeyId, cardId);
      if (!e) return null;
      var k = key(journeyId, cardId), rec = cache[k];
      if (rec) return rec;
      rec = cache[k] = { img: null, state: 'loading' };
      try {
        var img = new Image();
        img.decoding = 'async';
        img.onload = function () {
          rec.state = 'ready';
          if (OG.Events && OG.Events.emit) OG.Events.emit('photo:load', { journeyId: journeyId, cardId: cardId });
        };
        // Lỗi mạng / thiếu file: đánh dấu 'error' → giao diện quay về hình vẽ cartoon, không thử lại liên tục.
        img.onerror = function () { rec.state = 'error'; };
        rec.img = img;
        img.src = e.src; // đường dẫn tương đối → chạy được cả qua file:// lẫn GitHub Pages
      } catch (err) {
        rec.state = 'error';
      }
      return rec;
    },
    // Ảnh đã sẵn sàng để vẽ (hoặc null).
    ready: function (journeyId, cardId) {
      var rec = Photos.image(journeyId, cardId);
      return rec && rec.state === 'ready' ? rec.img : null;
    },
    // true khi có ảnh nhưng chưa tải xong (để vẽ khung shimmer).
    loading: function (journeyId, cardId) {
      var rec = Photos.image(journeyId, cardId);
      return !!rec && rec.state === 'loading';
    },
    // Bắt đầu tải trước vài ảnh (ví dụ ảnh của các trang sách trong màn sắp chơi) để popup hiện ngay.
    preload: function (journeyId, cardIds) {
      (cardIds || []).forEach(function (cid) { if (Photos.has(journeyId, cid)) Photos.image(journeyId, cid); });
    },

    // Dòng ghi công ngắn: "📷 Tác giả · CC BY-SA 4.0 · Wikimedia Commons". Tác giả dài thì cắt bớt.
    creditLine: function (e, maxAuthor) {
      if (!e) return '';
      return '📷 ' + clip(e.author, maxAuthor || 26) + ' · ' + e.license + ' · ' + (e.source || 'Nguồn mở');
    },

    // -------------------------------------------------------------------------
    // Vẽ
    // -------------------------------------------------------------------------
    // Kích thước gốc của ảnh (ưu tiên số đo thật của trình duyệt, rồi tới w/h trong registry).
    sizeOf: function (img, e) {
      return { w: (img && img.naturalWidth) || (e && e.w) || 4, h: (img && img.naturalHeight) || (e && e.h) || 3 };
    },
    // Giống CSS "object-fit: cover": phủ kín khung, giữ tỉ lệ, cắt phần thừa quanh điểm focus (mặc định giữa).
    drawCover: function (ctx, img, x, y, w, h, r, focus, e) {
      var s = Photos.sizeOf(img, e);
      var k = Math.max(w / s.w, h / s.h);          // tỉ lệ phóng để phủ kín khung
      var sw = w / k, sh = h / k;                  // phần ảnh gốc thật sự được dùng
      var fx = focus ? focus.x : 0.5, fy = focus ? focus.y : 0.5;
      var sx = Math.min(Math.max(0, s.w * fx - sw / 2), s.w - sw);
      var sy = Math.min(Math.max(0, s.h * fy - sh / 2), s.h - sh);
      ctx.save();
      rr(ctx, x, y, w, h, r || 0); ctx.clip();
      ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
      ctx.restore();
    },
    // Giống "object-fit: contain": cả bức ảnh nằm gọn trong khung (dùng khi phóng to toàn màn hình).
    // Trả về hình chữ nhật thật sự của ảnh {x,y,w,h}.
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
    // Khung "đang tải": nền xám nhạt với một dải sáng chạy chéo qua (hiệu ứng shimmer).
    drawShimmer: function (ctx, x, y, w, h, r, t) {
      ctx.save();
      rr(ctx, x, y, w, h, r || 0); ctx.clip();
      ctx.fillStyle = '#e6ebf3'; ctx.fillRect(x, y, w, h);
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
