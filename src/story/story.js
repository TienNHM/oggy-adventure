// @ts-check
/* ============================================================================
 * OG.Story + OG.Story.ui — ĐIỀU PHỐI HÀNH TRÌNH & BỘ CÔNG CỤ VẼ GIAO DIỆN TRUYỆN
 * ----------------------------------------------------------------------------
 * Vai trò:      (1) Điều phối luồng một HÀNH TRÌNH học tập: bắt đầu hành trình, chiếu truyện tranh
 *               trước/sau màn, chen truyện giữa màn, kết thúc hành trình. OG.Game, OG.Difficulty và các
 *               scene trong src/story/scenes.js gọi vào đây.
 *               (2) OG.Story.ui: "bộ đồ nghề" vẽ canvas dùng chung cho mọi scene v2 (bong bóng thoại hiện
 *               chữ dần, khung bo tròn, nút canvas to, ngôi sao, tia sáng, giấy màu/pháo hoa, đọc to).
 * Khái niệm:    hàng đợi scene (chạy nối tiếp nhiều truyện rồi mới tới đích) · continuation (truyền "việc
 *               làm tiếp theo" dưới dạng dữ liệu {scene}|{fn}) · level hook (cắm hành vi vào màn chơi mà
 *               không sửa level.js) · hiệu ứng gõ chữ (typewriter) · easing · hệ hạt (particle) đơn giản ·
 *               vẽ an toàn (error boundary quanh save/restore) · Web Speech API (đọc to)
 * Bài học:      docs/learn/05-state-machine-scene.md (luồng scene) · docs/learn/12-data-driven-man-cau-do-hanh-trinh.md
 *               · docs/learn/07-ve-canvas-procedural-cache.md (bộ công cụ vẽ)
 * Phụ thuộc:    LOAD: OG.util (U). CHẠY: OG.Journeys, OG.Save.ns/commit, OG.Game (run, newRun, startLevel),
 *               OG.Scenes (go/push/pop/has), OG.Level.addHook, OG.Input, OG.DOM.toast, OG.font, OG.W/H/FLOOR_Y,
 *               OG.time, OG.util.call('Difficulty'|'Learn'|'Guide', ...)
 * Event:        phát: 'journey:select', 'area:enter', 'area:complete', 'journey:complete' · nghe: (không)
 * API công khai: OG.Story.init/current/lastJourney/hasSeen/markSeen/startJourney/playLevel/afterLevel/
 *               finishJourney/playComic/playComics/pushComic/onSoftFail/drawComicPanel
 *               OG.Story.ui.font/wrap/measureBubble/drawBubble/drawFrame/drawButton/hit/advancePressed/
 *               drawStar/drawRays/drawBar/shake/easeOutBack/easeOut/shade/palette/stripEmoji/
 *               viVoice/canSpeak/speak/stopSpeak/guard/fx.*
 * Đọc tiếp:     src/story/scenes.js (các scene dùng bộ công cụ này: comic, card, quiz, notebook)
 *               → src/story/learn.js (thẻ kiến thức + câu đố) → src/story/guide.js (NPC dẫn đường)
 * Dữ liệu:      JourneyDef, AreaDef, LevelDef, PanelDef, LevelHook (src/types.d.ts)
 *
 * Hợp đồng: docs/STORY.md mục 3 (luồng chơi) và 6.2 (API). Lưu trữ: OG.Save.ns('story') = { seen: {'<jid>:<comicId>': true}, last: jid }.
 * ========================================================================== */

/**
 * @typedef {Object} StoryNextStep  "việc làm tiếp" sau khi chiếu xong truyện (continuation dạng dữ liệu)
 * @property {string} [scene]   tên scene sẽ go() tới
 * @property {Object} [params]  params cho scene đó
 * @property {boolean} [start]  true + scene 'level' → gọi OG.Game.startLevel (khởi tạo lượt chơi màn đúng cách)
 * @property {Function} [fn]    hoặc: một hàm tuỳ ý (vd kết thúc hành trình)
 */
/**
 * @typedef {Object} UiRect  hình chữ nhật toạ độ màn hình (px, gốc góc trên-trái)
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 */
/**
 * @typedef {Object} BubbleMetrics  kết quả đo bong bóng thoại
 * @property {number} w      bề rộng hộp (px)
 * @property {number} h      bề cao hộp (px)
 * @property {string[]} lines các dòng chữ sau khi ngắt
 * @property {number} size   cỡ chữ (px)
 * @property {number} lh     chiều cao một dòng (px)
 * @property {number} pad    lề trong (px)
 * @property {number} nameH  phần cao thêm cho bảng tên (px)
 */
/**
 * @typedef {Object} FxParticle  một hạt giấy màu / pháo hoa (toạ độ màn hình)
 * @property {number} x
 * @property {number} y
 * @property {number} vx    vận tốc ngang, px/giây
 * @property {number} vy    vận tốc dọc, px/giây
 * @property {number} g     gia tốc trọng trường riêng của hạt, px/giây²
 * @property {number} drag  hệ số giữ lại vận tốc mỗi frame (0..1)
 * @property {number} life  tuổi hiện tại, giây
 * @property {number} max   tuổi thọ, giây
 * @property {number} size  kích thước, px
 * @property {number} rot   góc xoay, radian
 * @property {number} vr    tốc độ xoay, radian/giây
 * @property {string} color
 * @property {'rect'|'circle'|'star'} shape
 */
(function () {
  'use strict';
  var OG = window.OG;
  var U = OG.util;
  var TAU = Math.PI * 2;
  var INK = '#17233d';               // màu "mực" viền/chữ dùng chung cho mọi scene v2

  var MAX_FX_PARTICLES = 400;        // trần số hạt hiệu ứng cùng lúc (giữ FPS ổn trên máy yếu)
  var SHAKE_DUR = 0.45;              // thời lượng rung mặc định, giây
  var SHAKE_FREQ = 46;               // tần số góc của dao động rung, radian/giây
  var SHAKE_AMP = 10;                // biên độ rung mặc định, px
  var EASE_BACK_OVERSHOOT = 1.70158; // hằng số chuẩn của easeOutBack (vượt quá ~10% rồi bật lại)
  var SPEECH_RATE = 0.9;             // tốc độ đọc (1 = bình thường) — chậm một chút cho bé nghe kịp
  var SPEECH_PITCH = 1.1;            // cao độ giọng (1 = bình thường) — hơi cao cho vui tai

  function J() { return OG.Journeys; }

  // Vùng lưu riêng của module trong save (namespace 'story'); tự sửa nếu dữ liệu cũ bị hỏng kiểu.
  function store() {
    var s = OG.Save.ns('story');
    if (!s.seen || typeof s.seen !== 'object') s.seen = {};
    return s;
  }

  // ===========================================================================
  // Bộ công cụ vẽ dùng chung
  // ===========================================================================
  // 💡 Khái niệm: error boundary cho hàm vẽ — dữ liệu hành trình có thể chứa hàm vẽ do người khác viết.
  //   Bọc trong try/catch và LUÔN restore() để một lỗi nhỏ không làm lệch transform của cả frame.
  /** @type {Object<string, boolean>} nhãn đã báo lỗi (chỉ cảnh báo 1 lần / nhãn, tránh spam 60 lần/giây) */
  var reported = {};
  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} label  tên phần đang vẽ (để in cảnh báo)
   * @param {Function} fn   hàm vẽ có thể ném lỗi
   */
  function guard(ctx, label, fn) {
    ctx.save();
    try { fn(); } catch (e) {
      if (!reported[label]) { reported[label] = true; console.warn('[OG.Story] lỗi khi vẽ ' + label + ':', e); }
    }
    ctx.restore();
  }

  // Bỏ emoji khi đo/đọc to (giữ chữ tiếng Việt): giọng đọc sẽ đọc tên emoji ("mặt cười") nếu không lọc.
  function stripEmoji(s) {
    return String(s || '').replace(/[←-⇿⌀-➿⬀-⯿️‍]|[\ud83c-\ud83e][\udc00-\udfff]/g, '').replace(/\s+/g, ' ').trim();
  }

  var ui = {
    INK: INK,
    guard: guard,
    /**
     * Trả chuỗi ctx.font. Ưu tiên OG.font (font chung của game); chuỗi dự phòng chỉ dùng khi chạy trang demo thiếu core.
     * @param {number} px  cỡ chữ, px
     * @param {string} [w='bold']  độ đậm CSS ('bold', '600', '900'...)
     * @returns {string}
     */
    font: function (px, w) { return OG.font ? OG.font(px, w || 'bold') : (w || 'bold') + ' ' + (px | 0) + 'px "Segoe UI", system-ui, Roboto, Arial, sans-serif'; },

    /**
     * Ngắt chữ thành nhiều dòng theo bề rộng tối đa (đo bằng ctx.font HIỆN TẠI). Hỗ trợ '\n' để xuống dòng cứng.
     * ⚠️ Bẫy: phải đặt ctx.font TRƯỚC khi gọi — đo bằng font khác font vẽ thì chữ tràn khung.
     * @param {CanvasRenderingContext2D} ctx
     * @param {string} text
     * @param {number} maxW  bề rộng tối đa một dòng, px
     * @returns {string[]} luôn có ít nhất 1 phần tử
     */
    wrap: function (ctx, text, maxW) {
      var out = [];
      String(text == null ? '' : text).split('\n').forEach(function (para) {
        var words = para.split(/\s+/).filter(Boolean), cur = '';
        // Thuật toán tham lam: thêm từng từ vào dòng hiện tại, tràn thì đẩy dòng ra và bắt đầu dòng mới.
        for (var i = 0; i < words.length; i++) {
          var test = cur ? cur + ' ' + words[i] : words[i];
          if (cur && ctx.measureText(test).width > maxW) { out.push(cur); cur = words[i]; } else cur = test;
        }
        out.push(cur);
      });
      return out.length ? out : [''];
    },

    /**
     * Đo kích thước bong bóng thoại mà KHÔNG vẽ (để bố trí nhiều bong bóng tránh đè nhau).
     * @param {CanvasRenderingContext2D} ctx
     * @param {string} text
     * @param {{size?:number, maxW?:number, weight?:string, name?:string|null, minW?:number}} [opts]
     *   size = cỡ chữ px (18), maxW = rộng tối đa px (300), name = bảng tên người nói, minW = rộng tối thiểu px
     * @returns {BubbleMetrics}
     */
    measureBubble: function (ctx, text, opts) {
      opts = opts || {};
      // Lề và khoảng dòng tỉ lệ theo cỡ chữ → đổi size là cả bong bóng co giãn hài hoà.
      var size = opts.size || 18, maxW = opts.maxW || 300, pad = Math.round(size * 0.7), lh = Math.round(size * 1.32);
      ctx.save();
      ctx.font = ui.font(size, opts.weight || 'bold');
      var lines = ui.wrap(ctx, text, maxW - pad * 2), w = 0;
      lines.forEach(function (l) { w = Math.max(w, ctx.measureText(l).width); });
      ctx.restore();
      var nameH = opts.name ? Math.round(size * 0.5) : 0;
      w = Math.max(opts.minW || 0, Math.min(maxW, Math.ceil(w) + pad * 2), opts.name ? size * 4 : 0);
      return { w: w, h: lines.length * lh + pad * 2 + nameH, lines: lines, size: size, lh: lh, pad: pad, nameH: nameH };
    },

    /**
     * Vẽ bong bóng thoại kiểu truyện tranh (toạ độ màn hình). (x, y) = ĐẦU ĐUÔI bong bóng (chỉ vào người nói).
     * Với tail 'none': (x, y) = góc trên-trái (anchor 'left') hoặc giữa-trên của bong bóng.
     * 💡 Khái niệm: hiệu ứng gõ chữ (typewriter) — opts.reveal = số ký tự đang hiện. Bố cục tính trên TOÀN BỘ chữ
     *   (measureBubble), chỉ phần vẽ bị cắt, nên bong bóng không "nhảy" kích thước khi chữ hiện dần.
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} x  px
     * @param {number} y  px
     * @param {string} text
     * @param {Object} [opts]  maxW, size, weight, bg, border, color, name, nameColor, align:'center',
     *   tail:'down'|'up'|'none', anchor:'left'|'center', reveal (null = hiện hết), minW,
     *   bounds {x,y,w,h} vùng được phép (mặc định cả màn hình), boxX/boxY ép vị trí góc trên-trái
     * @returns {UiRect} hộp bong bóng đã vẽ (để xếp bong bóng kế tiếp)
     * @example
     *   OG.Story.ui.drawBubble(ctx, npc.x, npc.y - 60, 'Xin chào!', { name: 'Olivia', reveal: Math.floor(t * 40) });
     */
    drawBubble: function (ctx, x, y, text, opts) {
      opts = opts || {};
      var m = ui.measureBubble(ctx, text, opts);
      var B = opts.bounds || { x: 0, y: 0, w: OG.W, h: OG.H };
      var tail = opts.tail || 'down', w = m.w, h = m.h;
      // Vị trí hộp: đặt phía trên/dưới đầu đuôi 16 px, rồi kẹp vào bounds (lề 6 px) để không tràn khung.
      var bx = opts.boxX != null ? opts.boxX : (opts.anchor === 'left' ? x : x - w / 2);
      var by = opts.boxY != null ? opts.boxY : (tail === 'up' ? y + 16 : tail === 'none' ? y : y - 16 - h);
      bx = U.clamp(bx, B.x + 6, B.x + B.w - w - 6);
      by = U.clamp(by, B.y + 6 + (opts.name ? m.size * 0.7 : 0), B.y + B.h - h - 6);
      ctx.save();
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      var r = Math.min(20, h / 2);
      // bóng đổ
      ctx.fillStyle = 'rgba(23,35,61,0.22)';
      U.roundRectPath(ctx, bx + 3, by + 5, w, h, r); ctx.fill();
      // đuôi (vẽ trước thân để thân che chân đuôi)
      ctx.fillStyle = opts.bg || '#ffffff';
      ctx.strokeStyle = opts.border || INK; ctx.lineWidth = 3.5;
      // Chỉ vẽ đuôi khi đầu đuôi thật sự nằm ngoài hộp (hộp bị kẹp đè lên người nói thì bỏ đuôi).
      var hasTail = tail !== 'none' && (tail === 'up' ? y < by : y > by + h);
      if (hasTail) {
        var tx = U.clamp(x, bx + 22, bx + w - 22), ty = tail === 'up' ? by + 2 : by + h - 2;
        var mid = (tx + x) / 2;
        // Hai đường cong bậc 2 lệch nhau một chút → đuôi hơi cong như vẽ tay.
        ctx.beginPath();
        ctx.moveTo(tx - 11, ty);
        ctx.quadraticCurveTo(mid - 2, (ty + y) / 2, x, y);
        ctx.quadraticCurveTo(mid + 6, (ty + y) / 2, tx + 11, ty);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      U.roundRectPath(ctx, bx, by, w, h, r); ctx.fill(); ctx.stroke();
      if (hasTail) { // xoá vạch viền giữa đuôi và thân
        var tx2 = U.clamp(x, bx + 22, bx + w - 22);
        ctx.fillRect(tx2 - 9, tail === 'up' ? by - 1 : by + h - 3, 18, 4);
      }
      // Bảng tên (pill màu) ở góc trên-trái
      if (opts.name) {
        ctx.font = ui.font(Math.round(m.size * 0.72));
        var nw = ctx.measureText(opts.name).width + 18, nh = Math.round(m.size * 1.15);
        ctx.fillStyle = opts.nameColor || '#ed713c';
        U.roundRectPath(ctx, bx + 10, by - nh * 0.6, nw, nh, nh / 2); ctx.fill();
        ctx.lineWidth = 2.5; ctx.stroke();
        ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(opts.name, bx + 19, by - nh * 0.6 + nh / 2 + 1);
      }
      // Chữ (hiệu ứng gõ: chỉ hiện `reveal` ký tự đầu, bố cục không nhảy)
      ctx.font = ui.font(m.size, opts.weight || 'bold');
      ctx.fillStyle = opts.color || INK; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      var left = opts.reveal == null ? Infinity : Math.max(0, opts.reveal | 0);
      var ty0 = by + m.pad + m.nameH;
      for (var i = 0; i < m.lines.length && left > 0; i++) {
        var line = m.lines[i];
        var shown = left >= line.length ? line : line.slice(0, left);
        left -= line.length + 1; // +1 = dấu cách đã bị wrap() "nuốt" ở chỗ ngắt dòng
        var lx = opts.align === 'center' ? bx + (w - ctx.measureText(line).width) / 2 : bx + m.pad;
        ctx.fillText(shown, lx, ty0 + i * m.lh);
      }
      ctx.restore();
      return { x: bx, y: by, w: w, h: h };
    },

    /**
     * Vẽ khung bo tròn viền dày có bóng đổ (panel truyện, thẻ, câu đố).
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} x  góc trên-trái, px
     * @param {number} y
     * @param {number} w  px
     * @param {number} h  px
     * @param {string} [fill='#fff6df']
     * @param {number} [r=18]  bán kính bo góc, px
     * @param {{border?:string, lineWidth?:number, gloss?:boolean}} [opts]  gloss:false = tắt vệt bóng phía trên
     */
    drawFrame: function (ctx, x, y, w, h, fill, r, opts) {
      opts = opts || {};
      ctx.save();
      ctx.fillStyle = 'rgba(23,35,61,0.28)';
      U.roundRectPath(ctx, x + 4, y + 7, w, h, r || 18); ctx.fill();
      ctx.fillStyle = fill || '#fff6df';
      ctx.strokeStyle = opts.border || INK; ctx.lineWidth = opts.lineWidth || 4;
      U.roundRectPath(ctx, x, y, w, h, r || 18); ctx.fill(); ctx.stroke();
      if (opts.gloss !== false) { // vệt bóng nhẹ phía trên
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        U.roundRectPath(ctx, x + 8, y + 6, w - 16, Math.min(18, h * 0.12), 9); ctx.fill();
      }
      ctx.restore();
    },

    /**
     * Vẽ nút trên canvas (to, bo tròn, có "đế" 3D phía dưới). Trả lại chính rect để scene lưu và hit-test.
     * 💡 Khái niệm: nút canvas không có sự kiện click như DOM — scene tự lưu rect lúc vẽ rồi so với toạ độ
     *   chạm ở update() (hit-test). Vì vậy vẽ và hit-test phải dùng CÙNG một rect.
     * @param {CanvasRenderingContext2D} ctx
     * @param {UiRect} r  vị trí nút, px màn hình
     * @param {string} label
     * @param {Object} [opts]  color, shadow (màu đế), text (màu chữ), size (cỡ chữ px), hot (viền trắng),
     *   disabled (mờ 50%), pulse (phập phồng mời bấm), pressed (lún xuống 2 px)
     * @returns {UiRect}
     */
    drawButton: function (ctx, r, label, opts) {
      opts = opts || {};
      ctx.save();
      var lift = opts.pressed ? 2 : 0;
      var s = opts.pulse ? 1 + Math.sin(OG.time * 5) * 0.035 : 1;
      // Phóng to quanh TÂM nút: dời gốc về tâm → scale → dời lại (mẫu translate-scale-translate).
      if (s !== 1) { ctx.translate(r.x + r.w / 2, r.y + r.h / 2); ctx.scale(s, s); ctx.translate(-r.x - r.w / 2, -r.y - r.h / 2); }
      ctx.globalAlpha *= opts.disabled ? 0.5 : 1;
      var rad = Math.min(16, r.h / 2);
      ctx.fillStyle = opts.shadow || '#b74b2b';
      U.roundRectPath(ctx, r.x, r.y + 5, r.w, r.h, rad); ctx.fill();
      ctx.fillStyle = opts.color || '#f27a43';
      ctx.strokeStyle = opts.hot ? '#ffffff' : INK; ctx.lineWidth = opts.hot ? 4 : 2.5;
      U.roundRectPath(ctx, r.x, r.y + lift, r.w, r.h, rad); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      U.roundRectPath(ctx, r.x + 6, r.y + lift + 4, r.w - 12, r.h * 0.32, rad / 2); ctx.fill();
      ctx.fillStyle = opts.text || '#ffffff';
      ctx.font = ui.font(opts.size || 20); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, r.x + r.w / 2, r.y + lift + r.h / 2 + 1);
      ctx.restore();
      return r;
    },
    /**
     * Kiểm tra điểm (px, py) có nằm trong rect không (hit-test nút canvas). rect null → false.
     * @param {UiRect|null} r
     * @param {number} px  toạ độ màn hình logic 960×540 (OG.Input.pointer đã quy đổi sẵn)
     * @param {number} py
     * @returns {boolean}
     */
    hit: function (r, px, py) { return !!r && px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h; },

    /**
     * Trả true nếu frame này vừa nhấn phím "tiến tới" chung: Enter, Space/↑ (jump), E (action), → (dùng ở comic/thẻ).
     * @returns {boolean}
     */
    advancePressed: function () {
      var I = OG.Input;
      return I.pressed('confirm') || I.pressed('jump') || I.pressed('action') || I.pressed('right');
    },

    /**
     * Vẽ ngôi sao 5 cánh.
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} x  tâm, px
     * @param {number} y
     * @param {number} r  bán kính đỉnh ngoài, px
     * @param {string} [fill='#ffc94a']
     * @param {string|false} [stroke]  màu viền; false = không viền
     */
    drawStar: function (ctx, x, y, r, fill, stroke) {
      ctx.save();
      ctx.beginPath();
      // 10 đỉnh xen kẽ ngoài/trong (bán kính trong = 48% ngoài), bắt đầu từ đỉnh trên cùng (-90°).
      for (var i = 0; i < 10; i++) {
        var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.48 : r;
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fillStyle = fill || '#ffc94a'; ctx.fill();
      if (stroke !== false) { ctx.strokeStyle = stroke || INK; ctx.lineWidth = Math.max(1.5, r * 0.16); ctx.lineJoin = 'round'; ctx.stroke(); }
      ctx.restore();
    },

    /**
     * Vẽ tia sáng xoay chậm phía sau vật thể (thẻ mới, cúp).
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} x  tâm, px
     * @param {number} y
     * @param {number} r  độ dài tia, px
     * @param {number} t  thời gian, giây (góc xoay = t × 0,5 radian)
     * @param {string} [color]
     * @param {number} [n=12]  số tia
     */
    drawRays: function (ctx, x, y, r, t, color, n) {
      ctx.save();
      ctx.translate(x, y); ctx.rotate(t * 0.5);
      ctx.fillStyle = color || 'rgba(255,214,90,0.45)';
      n = n || 12;
      for (var i = 0; i < n; i++) {
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.arc(0, 0, r, (i / n) * TAU, ((i + 0.5) / n) * TAU);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    },

    /**
     * Vẽ thanh tiến độ bo tròn.
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} x  px
     * @param {number} y
     * @param {number} w
     * @param {number} h
     * @param {number} k  tỉ lệ đầy 0..1 (tự kẹp)
     * @param {string} [fill]
     * @param {string} [bg]
     */
    drawBar: function (ctx, x, y, w, h, k, fill, bg) {
      ctx.save();
      ctx.fillStyle = bg || 'rgba(23,35,61,0.18)';
      U.roundRectPath(ctx, x, y, w, h, h / 2); ctx.fill();
      if (k > 0) { ctx.fillStyle = fill || '#3fbf6f'; U.roundRectPath(ctx, x, y, Math.max(h, w * U.clamp(k, 0, 1)), h, h / 2); ctx.fill(); }
      ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
      U.roundRectPath(ctx, x, y, w, h, h / 2); ctx.stroke();
      ctx.restore();
    },

    /**
     * Tính độ lệch ngang của hiệu ứng rung lắc (vd chọn sai câu đố): dao động sin, biên độ giảm tuyến tính về 0.
     * @param {number|null|undefined} t  giây kể từ lúc bắt đầu rung (null/âm = không rung)
     * @param {number} [dur=0.45]  thời lượng rung, giây
     * @param {number} [amp=10]    biên độ ban đầu, px
     * @returns {number} độ lệch, px (cộng vào x khi vẽ)
     * @example
     *   ctx.translate(OG.Story.ui.shake(this.shakeT, 0.45, 12), 0);
     */
    shake: function (t, dur, amp) {
      if (t == null || t < 0 || t > (dur || SHAKE_DUR)) return 0;
      var k = 1 - t / (dur || SHAKE_DUR);
      return Math.sin(t * SHAKE_FREQ) * (amp || SHAKE_AMP) * k;
    },
    /**
     * Hàm easing "vượt quá rồi bật lại": 0 → ~1,1 → 1. Hợp với hiệu ứng nảy ra (pop-in) của thẻ, nút.
     * 💡 Khái niệm: easing — biến tiến độ tuyến tính k (0..1) thành đường cong chuyển động tự nhiên hơn.
     * 🧪 Thử: thay easeOutBack bằng easeOut ở scene 'card' (hàm flip) → thẻ mở ra "phẳng", hết cảm giác nảy.
     * @param {number} k  tiến độ 0..1 (tự kẹp)
     * @returns {number}
     */
    easeOutBack: function (k) { k = U.clamp(k, 0, 1); var c = EASE_BACK_OVERSHOOT; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); },
    /**
     * Easing chậm dần (quadratic ease-out).
     * @param {number} k  tiến độ 0..1 (tự kẹp)
     * @returns {number}
     */
    easeOut: function (k) { k = U.clamp(k, 0, 1); return 1 - (1 - k) * (1 - k); },

    /**
     * Làm sáng/tối một màu #rrggbb. k > 0: pha về trắng; k < 0: nhân tối về đen.
     * @param {string} hex  '#rrggbb' (sai định dạng → trả nguyên, hoặc '#cccccc' nếu rỗng)
     * @param {number} k    -1..1
     * @returns {string} '#rrggbb'
     * @example
     *   OG.Story.ui.shade('#ed713c', -0.3); // cam đậm hơn 30%
     */
    shade: function (hex, k) {
      var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
      if (!m) return hex || '#cccccc';
      var n = parseInt(m[1], 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (v) {
        v = k >= 0 ? v + (255 - v) * k : v * (1 + k);
        return Math.round(U.clamp(v, 0, 255));
      });
      return '#' + c.map(function (v) { return (v < 16 ? '0' : '') + v.toString(16); }).join('');
    },

    /**
     * Lấy bảng màu của hành trình, field nào thiếu thì dùng mặc định (dữ liệu hành trình không bắt buộc khai báo đủ).
     * @param {string} jid  id hành trình
     * @returns {{primary:string, secondary:string, accent:string, bg:string, ink:string}}
     */
    palette: function (jid) {
      var j = J() && J().get(jid), p = (j && j.palette) || {};
      return { primary: p.primary || '#ed713c', secondary: p.secondary || '#52b9df', accent: p.accent || '#ffc94a', bg: p.bg || '#fff6df', ink: p.ink || INK };
    },

    stripEmoji: stripEmoji,

    // ---- Đọc to bằng Web Speech API (cho bé chưa đọc thạo). Chỉ bật khi máy có giọng tiếng Việt. ----
    /**
     * Tìm giọng đọc tiếng Việt của trình duyệt.
     * ⚠️ Bẫy: getVoices() có thể trả mảng rỗng ở lần gọi đầu (trình duyệt nạp giọng bất đồng bộ) → nút 🔊
     *   có thể chưa hiện ở frame đầu; vì hàm được gọi lại mỗi frame nên nút tự xuất hiện khi giọng nạp xong.
     * @returns {SpeechSynthesisVoice|null}
     */
    viVoice: function () {
      try {
        var s = window.speechSynthesis;
        if (!s || typeof window.SpeechSynthesisUtterance !== 'function' || !s.getVoices) return null;
        var v = s.getVoices() || [];
        for (var i = 0; i < v.length; i++) if (/^vi/i.test(v[i].lang || '')) return v[i];
      } catch (e) { /* bỏ qua */ }
      return null;
    },
    /** @returns {boolean} true nếu đọc to được (có giọng tiếng Việt) */
    canSpeak: function () { return !!ui.viVoice(); },
    /**
     * Đọc to một câu bằng giọng tiếng Việt (huỷ câu đang đọc trước đó). Emoji bị lọc bỏ.
     * @param {string} text
     * @returns {boolean} false nếu không có giọng / trình duyệt chặn
     */
    speak: function (text) {
      var v = ui.viVoice();
      if (!v) return false;
      try {
        window.speechSynthesis.cancel();
        var u = new window.SpeechSynthesisUtterance(stripEmoji(text));
        u.lang = v.lang || 'vi-VN'; u.voice = v; u.rate = SPEECH_RATE; u.pitch = SPEECH_PITCH;
        window.speechSynthesis.speak(u);
        return true;
      } catch (e) { return false; }
    },
    /** Dừng đọc (scene gọi trong exit() để giọng không đọc tiếp khi đã đóng thẻ). */
    stopSpeak: function () { try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) { /* bỏ qua */ } }
  };

  // ---------------------------------------------------------------------------
  // Hiệu ứng màn hình: giấy màu + pháo hoa (toạ độ màn hình 960×540). Scene gọi update/draw.
  // 💡 Khái niệm: hệ hạt (particle system) tối giản — mỗi hạt là object {vị trí, vận tốc, tuổi};
  //   update tích phân Euler theo dt, hết tuổi thì xoá. Xem bản đầy đủ hơn ở src/game/particles.js.
  // ---------------------------------------------------------------------------
  var COLORS = ['#ffc94a', '#f27a43', '#52c5ee', '#3fbf6f', '#f29bb8', '#7b6cf0', '#ffffff'];
  /** @type {FxParticle[]} */
  var parts = [];
  ui.fx = {
    /**
     * Tung giấy màu lên rồi rơi (hình chữ nhật/tròn xoay). Tổng số hạt không vượt MAX_FX_PARTICLES.
     * @param {number} x  điểm phát, px màn hình
     * @param {number} y
     * @param {number} [n=40]  số hạt
     * @param {number} [spread=2.2]  độ toả của chùm quanh hướng thẳng đứng lên trên, radian
     */
    confetti: function (x, y, n, spread) {
      n = n || 40;
      for (var i = 0; i < n && parts.length < MAX_FX_PARTICLES; i++) {
        var a = -Math.PI / 2 + (Math.random() - 0.5) * (spread || 2.2), v = 260 + Math.random() * 360;
        // g = 620 px/giây² (rơi nhanh như giấy), drag 0.985/frame (lơ lửng nhẹ).
        parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 620, drag: 0.985, life: 0, max: 1.6 + Math.random() * 0.9,
          size: 6 + Math.random() * 6, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, color: COLORS[i % COLORS.length], shape: i % 3 ? 'rect' : 'circle' });
      }
    },
    /**
     * Bắn pháo hoa: một vòng sao toả đều 360°.
     * @param {number} x  tâm nổ, px màn hình
     * @param {number} y
     * @param {number} [n=22]  số sao
     * @param {string} [color]  không truyền = mỗi sao một màu ngẫu nhiên
     */
    firework: function (x, y, n, color) {
      n = n || 22;
      for (var i = 0; i < n && parts.length < MAX_FX_PARTICLES; i++) {
        var a = (i / n) * TAU, v = 170 + Math.random() * 90;
        parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 160, drag: 0.96, life: 0, max: 0.9 + Math.random() * 0.4,
          size: 7 + Math.random() * 4, rot: 0, vr: 4, color: color || COLORS[(Math.random() * COLORS.length) | 0], shape: 'star' });
      }
    },
    /**
     * Cập nhật mọi hạt theo delta time.
     * @param {number} dt  delta time (khoảng thời gian giữa 2 frame), giây
     */
    update: function (dt) {
      // Duyệt NGƯỢC để splice() xoá hạt hết tuổi mà không làm lệch chỉ số các hạt chưa duyệt.
      for (var i = parts.length - 1; i >= 0; i--) {
        var p = parts[i];
        p.life += dt;
        if (p.life >= p.max) { parts.splice(i, 1); continue; }
        // ⚠️ Bẫy: drag nhân THEO FRAME (không nhân dt) → ở 120 Hz hạt chậm lại nhanh gấp đôi so với 60 Hz.
        //   Chấp nhận được cho hiệu ứng trang trí; gameplay thì không nên làm vậy.
        p.vx *= p.drag; p.vy = p.vy * p.drag + p.g * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      }
    },
    /**
     * Vẽ mọi hạt (mờ dần ở 40% cuối đời).
     * @param {CanvasRenderingContext2D} ctx
     */
    draw: function (ctx) {
      if (!parts.length) return;
      ctx.save();
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i], a = 1 - Math.max(0, (p.life - p.max * 0.6) / (p.max * 0.4));
        ctx.globalAlpha = U.clamp(a, 0, 1);
        if (p.shape === 'star') { ui.drawStar(ctx, p.x, p.y, p.size, p.color, false); continue; }
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.shape === 'circle') { ctx.beginPath(); ctx.arc(0, 0, p.size / 2, 0, TAU); ctx.fill(); }
        else ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      ctx.restore();
    },
    /** @returns {number} số hạt đang sống (smoke test dùng để kiểm tra hiệu ứng có chạy) */
    count: function () { return parts.length; },
    /** Xoá mọi hạt (scene gọi trong enter() để hiệu ứng scene trước không "lọt" sang). */
    clear: function () { parts.length = 0; }
  };

  // ===========================================================================
  // Điều phối hành trình
  // ===========================================================================
  var Story = (OG.Story = {
    ui: ui,

    /** Cắm level hook 'story-comics' (truyện tranh giữa màn). main.js gọi một lần lúc khởi động. */
    init: function () {
      // Hook màn: truyện tranh giữa màn (comicTriggers).
      if (OG.Level && OG.Level.addHook) OG.Level.addHook(comicHook);
    },

    /** @returns {string|null} id hành trình của lượt chơi hiện tại (null = chế độ cổ điển) */
    current: function () { return (OG.Game.run && OG.Game.run.journeyId) || null; },
    /** @returns {string|null} id hành trình chơi gần nhất (đã lưu), null nếu hành trình đó không còn tồn tại */
    lastJourney: function () {
      var id = store().last || null;
      return id && J().has(id) ? id : null;
    },

    /**
     * Kiểm tra một truyện đã được xem chưa (truyện chỉ tự chiếu LẦN ĐẦU).
     * @param {string} journeyId
     * @param {string} comicId
     * @returns {boolean}
     */
    hasSeen: function (journeyId, comicId) { return !!store().seen[journeyId + ':' + comicId]; },
    /**
     * Đánh dấu đã xem truyện và ghi save ngay.
     * @param {string} journeyId
     * @param {string} comicId
     */
    markSeen: function (journeyId, comicId) {
      if (!journeyId || !comicId) return;
      store().seen[journeyId + ':' + comicId] = true;
      OG.Save.commit();
    },

    /**
     * Bắt đầu (hoặc tiếp tục) một hành trình: tạo lượt chơi mới, nhớ hành trình gần nhất, chiếu truyện mở đầu
     * (lần đầu) rồi tới bản đồ hành trình. Phát 'journey:select'.
     * @param {string} journeyId
     * @param {{skipIntro?:boolean, forceIntro?:boolean}} [opts]  skipIntro = bỏ truyện mở đầu (vd THỬ LẠI);
     *   forceIntro = chiếu lại dù đã xem
     * @returns {boolean} false nếu hành trình không tồn tại hoặc dữ liệu lỗi (invalid)
     * @example
     *   OG.Story.startJourney('home');                      // từ màn chọn hành trình
     *   OG.Story.startJourney('home', { skipIntro: true }); // chơi lại sau gameover
     */
    startJourney: function (journeyId, opts) {
      opts = opts || {};
      var j = J().get(journeyId);
      if (!j || j.invalid) { OG.DOM.toast('Hành trình này đang được xây dựng 🛠️'); return false; }
      OG.Game.newRun({ journeyId: journeyId });
      store().last = journeyId;
      OG.Save.commit();
      OG.Events.emit('journey:select', { journeyId: journeyId, difficulty: U.call('Difficulty', 'mode') || 'kid' });
      var toMap = { scene: 'journeyMap', params: { journeyId: journeyId } };
      if (j.intro && !opts.skipIntro && (opts.forceIntro || !Story.hasSeen(journeyId, j.intro))) {
        Story.playComic(journeyId, j.intro, { next: toMap });
      } else {
        OG.Scenes.go(toMap.scene, toMap.params);
      }
      return true;
    },

    /**
     * Vào một màn của hành trình: chiếu truyện mở khu (nếu là màn đầu khu) + truyện mở màn (chưa xem) rồi bắt đầu màn.
     * Phát 'area:enter' khi là màn đầu tiên của khu.
     * @param {string} levelId
     * @returns {boolean} false nếu không tìm thấy màn
     */
    playLevel: function (levelId) {
      var L = J().getLevel(levelId);
      if (!L) { console.warn('[OG.Story] không có màn ' + levelId); return false; }
      // Lượt chơi phải thuộc đúng hành trình của màn (vd người chơi đổi hành trình từ menu).
      if (!OG.Game.run || OG.Game.run.over || OG.Game.run.journeyId !== L.journey) OG.Game.newRun({ journeyId: L.journey });
      var area = J().getArea(L.journey, L.areaId) || {};
      // 💡 Khái niệm: hàng đợi (queue) truyện — gom mọi truyện cần chiếu theo đúng thứ tự kể chuyện,
      //   lọc truyện đã xem, rồi chiếu nối tiếp. Logic "chiếu gì" tách khỏi logic "chiếu thế nào" (playComics).
      var queue = [];
      if (L.indexInArea === 0) {
        OG.Events.emit('area:enter', { journeyId: L.journey, areaId: L.areaId, levelId: levelId });
        if (area.intro) queue.push(area.intro);
      }
      if (L.intro) queue.push(L.intro);
      queue = queue.filter(function (c) { return !Story.hasSeen(L.journey, c); });
      Story.playComics(L.journey, queue, { next: { scene: 'level', params: { levelId: levelId }, start: true } });
      return true;
    },

    /**
     * Xử lý sau khi thắng một màn hành trình (OG.Game.completeLevel gọi): chiếu truyện kết màn / kết khu / kết thúc,
     * rồi về bản đồ — hoặc kết thúc hành trình nếu là màn cuối. Phát 'area:complete' khi xong màn cuối khu.
     * @param {{levelId:string}} result  LevelResult (xem docs/ARCHITECTURE.md)
     * @returns {boolean} true = đã tự chuyển scene (Game không cần làm gì thêm); false = không phải màn hành trình
     */
    afterLevel: function (result) {
      var L = result && J().getLevel(result.levelId);
      if (!L) return false;
      var jid = L.journey, j = J().get(jid) || {}, area = J().getArea(jid, L.areaId) || {};
      var queue = [];
      if (L.outro) queue.push(L.outro);
      if (L.isLastOfArea) {
        OG.Events.emit('area:complete', { journeyId: jid, areaId: L.areaId, levelId: L.id });
        if (area.outro) queue.push(area.outro);
      }
      var final = J().isFinalLevel(L.id);
      // ending có 2 dạng (xem JourneyDef): chuỗi comicId, hoặc object {comic, title, text}.
      var ending = j.ending && (typeof j.ending === 'object' ? j.ending.comic : j.ending);
      if (final && ending) queue.push(ending);
      queue = queue.filter(function (c) { return !Story.hasSeen(jid, c); });
      var next = final ? { fn: function () { Story.finishJourney(jid); } }
        : { scene: 'journeyMap', params: { journeyId: jid, completed: L.id, result: result } };
      Story.playComics(jid, queue, { next: next });
      return true;
    },

    /**
     * Kết thúc hành trình: đóng lượt chơi, phát 'journey:complete', chuyển sang scene 'journeyEnd' (hoặc bản đồ nếu chưa có).
     * @param {string} journeyId
     */
    finishJourney: function (journeyId) {
      var count = U.call('Learn', 'count', journeyId) || { have: 0, total: 0 };
      if (OG.Game.run) OG.Game.run.over = true;
      OG.Events.emit('journey:complete', { journeyId: journeyId, cards: count.have, totalCards: count.total });
      if (OG.Scenes.has('journeyEnd')) OG.Scenes.go('journeyEnd', { journeyId: journeyId });
      else OG.Scenes.go('journeyMap', { journeyId: journeyId });
    },

    /**
     * Chiếu một truyện rồi làm `opts.next`.
     * @param {string} journeyId
     * @param {string|null} comicId  null/rỗng = đi thẳng tới next
     * @param {{next?:StoryNextStep, part?:number}} [opts]
     */
    playComic: function (journeyId, comicId, opts) { Story.playComics(journeyId, comicId ? [comicId] : [], opts); },
    /**
     * Chiếu nối tiếp nhiều truyện (go scene 'comic' cho từng truyện), xong hết thì làm `opts.next`.
     * Truyện không tồn tại trong dữ liệu bị bỏ qua lặng lẽ. Mảng rỗng = đi thẳng tới next.
     * 💡 Khái niệm: continuation — mỗi scene comic nhận onDone "chiếu phần còn lại"; đệ quy trên `rest`
     *   tạo thành chuỗi comic → comic → ... → next mà không cần vòng lặp chờ (game loop không bị chặn).
     * @param {string} journeyId
     * @param {string[]} list  danh sách comicId theo thứ tự chiếu
     * @param {{next?:StoryNextStep, part?:number}} [opts]  part = số thứ tự phần (hiển thị), tự tăng
     * @example
     *   var j = OG.Journeys.get('home');
     *   OG.Story.playComics('home', [j.intro], { next: { scene: 'journeyMap', params: { journeyId: 'home' } } });
     */
    playComics: function (journeyId, list, opts) {
      opts = opts || {};
      list = (list || []).filter(function (c) { return !!J().getComic(journeyId, c); });
      if (!list.length) { goNext(opts.next); return; }
      var first = list[0], rest = list.slice(1);
      OG.Scenes.go('comic', {
        journeyId: journeyId, comicId: first, part: opts.part || 1,
        onDone: function () { Story.playComics(journeyId, rest, { next: opts.next, part: (opts.part || 1) + 1 }); }
      });
    },
    /**
     * Chen truyện giữa màn: PUSH scene 'comic' (overlay) lên màn đang chơi; scene comic tự pop khi xong.
     * ⚠️ Bẫy: dùng push chứ không phải go — go sẽ exit() màn chơi và mất toàn bộ trạng thái (vị trí, pizza đã nhặt).
     * @param {string} journeyId
     * @param {string} comicId
     * @param {Function} [onDone]  gọi sau khi pop về màn chơi
     * @returns {boolean} false nếu truyện không tồn tại (onDone vẫn được gọi ngay)
     */
    pushComic: function (journeyId, comicId, onDone) {
      if (!J().getComic(journeyId, comicId)) { if (onDone) onDone(); return false; }
      OG.Scenes.push('comic', { journeyId: journeyId, comicId: comicId, overlay: true, onDone: onDone || null });
      return true;
    },

    /**
     * Hiện lời động viên của người dẫn đường khi hết mạng ở chế độ 'kid' (OG.Difficulty.softFail gọi).
     * @param {{assist?:boolean}} [info]  assist = vừa bật trợ giúp (khiên)
     * @returns {boolean} true nếu đã hiện lời động viên
     */
    onSoftFail: function (info) {
      var msgs = info && info.assist
        ? ['Mình giúp bạn một tay nhé! Cố lên! 💪', 'Có khiên bảo vệ rồi! Đi tiếp nào! 🛡️']
        : ['Không sao đâu! Mình thử lại nhé! 😊', 'Hít một hơi thật sâu, mình làm lại nào!', 'Suýt nữa thôi! Bạn làm được mà! ⭐'];
      return U.call('Guide', 'say', msgs[(Math.random() * msgs.length) | 0], 2.8) === true;
    },

    /**
     * Vẽ 1 khung truyện (bản thật gán ở scenes.js). Đây là stub rỗng phòng khi scenes.js chưa load
     * (mẫu "stub rồi ghi đè", xem docs/learn/01-module-pattern-iife-namespace.md).
     */
    drawComicPanel: function () {}
  });

  /**
   * Thực hiện bước tiếp theo của chuỗi truyện.
   * @param {StoryNextStep} [next]  thiếu = về bản đồ hành trình hiện tại
   */
  function goNext(next) {
    if (!next) { OG.Scenes.go('journeyMap', { journeyId: Story.current() }); return; }
    if (typeof next.fn === 'function') { next.fn(); return; }
    // Vào màn chơi phải qua Game.startLevel (reset mạng, HUD, nhạc...) chứ không go('level') trần.
    if (next.start && next.scene === 'level') { OG.Game.startLevel(next.params.levelId); return; }
    OG.Scenes.go(next.scene, next.params || {});
  }

  // ---------------------------------------------------------------------------
  // Level hook: truyện tranh giữa màn
  // 💡 Khái niệm: level hook — level.js gọi enter/update/drawWorld của mọi hook đã đăng ký theo `order`.
  //   Tính năng mới (truyện giữa màn) cắm vào mà không sửa một dòng nào của level.js (open/closed principle).
  // ---------------------------------------------------------------------------
  /** @type {LevelHook} */
  var comicHook = {
    id: 'story-comics', order: 40,
    enter: function (st) {
      // Sao chép trigger từ LevelDef sang trạng thái màn (st) — KHÔNG ghi `fired` vào dữ liệu gốc,
      // nếu không lần chơi sau truyện sẽ không bao giờ bật lại.
      st.comicTriggers = st.journeyId ? (st.level.comicTriggers || []).map(function (c) {
        return { x: c.x, comic: c.comic, once: c.once !== false, fired: false };
      }) : [];
    },
    update: function (st, dt, p) {
      var list = st.comicTriggers || [];
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        // Trigger theo toạ độ thế giới: tâm người chơi vượt qua x của trigger.
        if (c.fired || p.x + p.w / 2 < c.x) continue;
        c.fired = true;
        if (c.once && Story.hasSeen(st.journeyId, c.comic)) continue;
        // Trả true = báo level.js dừng xử lý frame này (vừa push scene mới lên trên).
        if (Story.pushComic(st.journeyId, c.comic)) return true;
      }
    },
    // Dấu "📖" nhỏ lơ lửng báo trước chỗ có truyện (chưa xem). Toạ độ thế giới (camera đã translate).
    drawWorld: function (ctx, st, t) {
      var list = st.comicTriggers || [];
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c.fired || (c.once && Story.hasSeen(st.journeyId, c.comic))) continue;
        var y = OG.FLOOR_Y - 150 + Math.sin(t * 3 + i) * 6;
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = '#ffffff'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(c.x, y, 17, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.font = ui.font(18); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = INK; ctx.fillText('📖', c.x, y + 1);
        ctx.restore();
      }
    }
  };
})();
