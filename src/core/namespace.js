// @ts-check
/* ============================================================================
 * OG (namespace.js) — NAMESPACE GỐC, HẰNG SỐ, BẢNG MÀU VÀ TIỆN ÍCH DÙNG CHUNG
 * ----------------------------------------------------------------------------
 * Vai trò:      File ĐẦU TIÊN được load (xem thứ tự <script> trong index.html). Tạo object toàn cục
 *               window.OG để mọi module khác gắn vào (OG.Events, OG.Save, OG.Player...), đồng thời
 *               cung cấp hằng số vật lý (OG.Config), bảng màu (OG.Palette) và hàm tiện ích (OG.util).
 * Khái niệm:    module pattern IIFE (hàm tự gọi ngay để có phạm vi riêng) · namespace toàn cục ·
 *               'use strict' · cấu hình tập trung (single source of truth) · cô lập lỗi (error isolation) ·
 *               gọi "mềm" module tuỳ chọn (OG.util.call) · AABB overlap
 * Bài học:      docs/learn/01-module-pattern-iife-namespace.md, docs/learn/04-vat-ly-va-cham-aabb.md (overlap)
 * Phụ thuộc:    (không) — file này không được đọc module nào khác vì chưa module nào tồn tại lúc nó chạy
 * Event:        phát: (không) · nghe: (không)
 * API công khai: OG.VERSION, OG.FONT, OG.font(px, weight), OG.W, OG.H, OG.FLOOR_Y, OG.Config, OG.Palette,
 *               OG.time, OG.util.{clamp, lerp, rand, randInt, choice, now, roundRectPath, fillRound,
 *               safe, call, escapeHtml, overlap, formatTime}
 * Đọc tiếp:     src/core/events.js (module thứ hai: event bus dùng OG.util.safe) → src/core/main.js (boot)
 * ========================================================================== */

// 💡 Khái niệm: IIFE (Immediately Invoked Function Expression) — bọc cả file trong một hàm rồi gọi ngay.
//   Biến khai báo bên trong (vd `reported`) là RIÊNG của module, không lọt ra window; chỉ những gì gắn
//   vào OG mới là API công khai. Đây là cách "module hoá" khi không dùng ES modules (để chạy được qua file://).
(function () {
  'use strict';
  // `window.OG || {}`: nếu vì lý do nào đó OG đã có (vd test nạp lại), giữ nguyên thay vì xoá trắng.
  /** @type {any} namespace được dựng dần từng field nên khai `any` (giống src/types.d.ts) */
  var OG = (window.OG = window.OG || {});

  OG.VERSION = '2.0.0-dev';

  // Font chuẩn, đủ glyph tiếng Việt có dấu (ạ, ữ, ỳ...). Mọi chỗ vẽ chữ lên canvas đều dùng OG.font
  // thay vì gõ tên font riêng → đổi font cả game chỉ cần sửa một dòng này.
  OG.FONT = '"Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';

  /**
   * Tạo chuỗi cho ctx.font.
   * @param {number} px cỡ chữ, px (bị làm tròn xuống thành số nguyên)
   * @param {string} [weight] độ đậm CSS, vd 'bold', '900'
   * @returns {string}
   * @example
   *   ctx.font = OG.font(18, 'bold'); // 'bold 18px "Segoe UI", ...'
   */
  OG.font = function (px, weight) { return (weight ? weight + ' ' : '') + (px | 0) + 'px ' + OG.FONT; };

  // Kích thước LOGIC của canvas, px. CSS co giãn canvas theo khung 16:9 nhưng toạ độ game luôn là 960×540,
  // nên code gameplay không bao giờ phải quan tâm màn hình thật to hay nhỏ.
  OG.W = 960;
  OG.H = 540;
  OG.FLOOR_Y = 480; // y (px, toạ độ thế giới, trục y hướng XUỐNG) của mặt sàn chuẩn mọi màn

  // 💡 Khái niệm: cấu hình tập trung — mọi hằng số vật lý ở MỘT chỗ. Player, Physics, Level, Boss đều đọc
  //   từ đây nên chỉnh "cảm giác" game (feel) không phải lục từng file.
  // 🧪 Thử: trong console trình duyệt gõ  OG.Config.GRAVITY = 600  rồi nhảy: nhân vật bay lơ lửng như trên Mặt Trăng.
  OG.Config = {
    GRAVITY: 1500,         // gia tốc trọng trường, px/giây²
    MAX_FALL: 900,         // vận tốc rơi tối đa (terminal velocity), px/giây
    MOVE_SPEED: 255,       // tốc độ chạy mặc định, px/giây
    JUMP_VELOCITY: 590,    // vận tốc ban đầu khi nhảy, px/giây (đỉnh nhảy ≈ v²/2g ≈ 116 px)
    HURT_INVULN: 1.6,      // giây bất tử (invulnerability) sau khi bị thương
    HURT_BOUNCE: 330,      // vận tốc bật lên khi bị thương, px/giây
    HURT_KNOCKBACK: 220,   // vận tốc bị đẩy lùi ngang khi bị thương, px/giây
    STOMP_BOUNCE: 420,     // vận tốc nảy lên khi giẫm kẻ địch, px/giây
    START_LIVES: 3,        // số mạng đầu lượt chơi
    MAX_DT: 0.033,         // delta time (khoảng thời gian giữa 2 frame) tối đa, giây — xem src/core/loop.js
    DEBUG: false           // true → OG.Events in mọi event ra console
  };

  // Bảng màu chung (token → mã màu). Module vẽ nên dùng token thay vì gõ mã hex để giữ phong cách đồng bộ.
  // Bảng giải thích từng token: docs/ARCHITECTURE.md mục 4.
  OG.Palette = {
    ink: '#17233d', cream: '#fff6df', gold: '#ffc94a', blue: '#52c5ee',
    pageBg: '#10192b', shellBorder: '#fff0c9',
    orange: '#f27a43', orangeShadow: '#b74b2b', titleOrange: '#ed713c', titleGlow: '#ffd36b',
    secondary: '#52b9df', secondaryShadow: '#2582aa', panelText: '#25314a', panelShadow: '#b87542',
    skyTop: '#76d8f2', skyBottom: '#e8f6c7', cloud: '#ffffff99',
    floor: '#e9a34f', grass: '#75bd59', plank: '#b97945', plankTop: '#f5d28b',
    kitchenWall: '#f4a66f', kitchenWindow: '#9ce7f1', kitchenCabinet: '#f6c36a', kitchenDecor: '#f5c75f',
    treeTrunk: '#4a9d62', treeTop: '#328454', gardenDecor: '#6dbd69',
    portalFrame: '#f4d45b', portalDoor: '#5b9be8',
    // Nhân vật (gợi ý cho Sprites; Sprites có thể tinh chỉnh)
    oggyHead: '#328be7', oggyBody: '#2877d5', oggyEar: '#2471cb', oggyFeet: '#263b9b', oggyMuzzle: '#d9f0ff',
    roachBody: '#7d3e9b', roachShell: '#b56bc7', roachLeg: '#4b285d',
    joey: '#c45bd1', marky: '#5fae4e', deedee: '#3f8de0', // v2: Dee Dee màu xanh dương như bản gốc
    jack: '#58b84a', olivia: '#f7f1ea', oliviaAccent: '#f29bb8',
    danger: '#e5484d', success: '#3fbf6f', white: '#ffffff'
  };

  // ---------------------------------------------------------------------------
  // Tiện ích toán học & ngẫu nhiên
  // ---------------------------------------------------------------------------
  /** @type {any} gắn thêm hàm dần bên dưới; `any` vì object được dựng từng field một */
  var U = (OG.util = {});

  /**
   * Kẹp v vào đoạn [a, b].
   * @param {number} v
   * @param {number} a cận dưới
   * @param {number} b cận trên
   * @returns {number}
   */
  U.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };

  /**
   * Nội suy tuyến tính (linear interpolation): t = 0 → a, t = 1 → b, t = 0.5 → giữa.
   * @param {number} a
   * @param {number} b
   * @param {number} t tỉ lệ, thường trong [0, 1]
   * @returns {number}
   */
  U.lerp = function (a, b, t) { return a + (b - a) * t; };

  /**
   * Số thực ngẫu nhiên trong [a, b).
   * @param {number} a
   * @param {number} b
   * @returns {number}
   */
  U.rand = function (a, b) { return a + Math.random() * (b - a); };

  /**
   * Số nguyên ngẫu nhiên trong [a, b] (CÓ lấy b).
   * @param {number} a
   * @param {number} b
   * @returns {number}
   */
  U.randInt = function (a, b) { return Math.floor(U.rand(a, b + 1)); };

  /**
   * Chọn ngẫu nhiên một phần tử của mảng.
   * @template T
   * @param {T[]} arr
   * @returns {T}
   */
  U.choice = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };

  /**
   * Lấy thời điểm hiện tại, ms. Ưu tiên performance.now() (chính xác dưới 1 ms, không bị nhảy khi đổi giờ máy).
   * @returns {number}
   */
  U.now = function () { return (window.performance && performance.now) ? performance.now() : Date.now(); };

  // ---------------------------------------------------------------------------
  // Tiện ích vẽ
  // ---------------------------------------------------------------------------

  /**
   * Tạo path hình chữ nhật bo góc (chưa tô). Tự viết bằng arcTo vì ctx.roundRect không có trên trình duyệt cũ.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x góc trên-trái, px
   * @param {number} y góc trên-trái, px
   * @param {number} w rộng, px
   * @param {number} h cao, px
   * @param {number} r bán kính bo góc, px (tự kẹp ≤ nửa cạnh ngắn)
   */
  U.roundRectPath = function (ctx, x, y, w, h, r) {
    // ⚠️ Bẫy: r lớn hơn nửa cạnh thì arcTo vẽ ra hình méo — kẹp lại trước.
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  /**
   * Tô một hình chữ nhật bo góc. Lưu ý: hàm ĐỔI ctx.fillStyle (không save/restore).
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   * @param {number} r bán kính bo góc, px
   * @param {string} color màu CSS
   */
  U.fillRound = function (ctx, x, y, w, h, r, color) {
    ctx.fillStyle = color;
    U.roundRectPath(ctx, x, y, w, h, r);
    ctx.fill();
  };

  // ---------------------------------------------------------------------------
  // Cô lập lỗi giữa các module
  // ---------------------------------------------------------------------------
  /** @type {Object<string, boolean>} nhãn đã báo lỗi — mỗi nhãn chỉ in console MỘT lần */
  var reported = {};

  /**
   * Gọi fn trong try/catch: lỗi chỉ được log (một lần cho mỗi nhãn), không ném ra ngoài.
   * 💡 Khái niệm: cô lập lỗi (error isolation) — game gồm nhiều module viết song song; một module tính năng
   *   lỗi (vd Social) không được làm sập vòng lặp game. Event bus và OG.util.call đều đi qua hàm này.
   * @param {string} label nhãn để nhận ra nguồn lỗi trong console
   * @param {Function} fn
   * @param {any} [self] giá trị `this` khi gọi fn
   * @param {any[]} [args]
   * @returns {any} kết quả của fn, hoặc undefined nếu fn ném lỗi
   * @example
   *   OG.util.safe('vẽ HUD', OG.Hud.draw, OG.Hud, [ctx]);
   */
  U.safe = function (label, fn, self, args) {
    try {
      return fn.apply(self || null, args || []);
    } catch (err) {
      // ⚠️ Bẫy: lỗi trong hàm gọi mỗi frame sẽ lặp 60 lần/giây → chỉ in lần đầu để console còn đọc được.
      if (!reported[label]) {
        reported[label] = true;
        console.error('[OG] Lỗi trong ' + label + ':', err);
      }
      return undefined;
    }
  };

  /**
   * Gọi OG[ns][method](...args) NẾU module và hàm đó tồn tại; lỗi bị cô lập như OG.util.safe.
   * 💡 Khái niệm: gọi "mềm" module tuỳ chọn — core không cần biết module tính năng đã được load hay chưa,
   *   thiếu module thì lời gọi đơn giản là không làm gì (trả undefined).
   *   Các tham số sau `method` được truyền tiếp nguyên vẹn (đọc qua `arguments` vì code viết kiểu ES5).
   * @param {string} ns tên module trong OG, vd 'Shop'
   * @param {string} method tên hàm
   * @returns {any}
   * @example
   *   OG.util.call('Shop', 'tickPlayer', p, dt); // không lỗi kể cả khi chưa có OG.Shop
   */
  U.call = function (ns, method) {
    var mod = OG[ns];
    if (!mod || typeof mod[method] !== 'function') return undefined;
    return U.safe(ns + '.' + method, mod[method], mod, Array.prototype.slice.call(arguments, 2));
  };

  /**
   * Escape ký tự HTML đặc biệt cho văn bản người dùng nhập (tên trên leaderboard...), chống chèn HTML (XSS).
   * @param {any} s
   * @returns {string}
   */
  U.escapeHtml = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  // ---------------------------------------------------------------------------
  // Hình học & thời gian
  // ---------------------------------------------------------------------------

  /**
   * Kiểm tra hai hình chữ nhật có giao nhau không.
   * 💡 Khái niệm: AABB (Axis-Aligned Bounding Box — hình chữ nhật không xoay, cạnh song song trục toạ độ).
   *   Hai AABB giao nhau ⇔ chồng nhau trên CẢ trục x LẪN trục y. Chỉ 4 phép so sánh nên rất rẻ.
   * ⚠️ Bẫy: dùng `<` chứ không `<=` — hai hộp chỉ chạm mép (a.x + a.w === b.x) KHÔNG tính là giao.
   * @param {AABB} a x,y = góc trên-trái
   * @param {AABB} b
   * @returns {boolean}
   */
  U.overlap = function (a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  };

  /**
   * Định dạng số giây thành "m:ss".
   * @param {number} sec giây (số âm/thiếu coi như 0, phần lẻ bị bỏ)
   * @returns {string}
   * @example
   *   OG.util.formatTime(75.4); // '1:15'
   */
  U.formatTime = function (sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  };

  OG.time = 0; // tổng thời gian game, giây — OG.Loop cộng dt mỗi frame
})();
