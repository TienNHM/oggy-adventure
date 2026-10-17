// @ts-check
/* ============================================================================
 * OG.Sprites — NHÂN VẬT VẼ PROCEDURAL (procedural drawing) + CACHE KHUNG HÌNH (frame cache)
 * ----------------------------------------------------------------------------
 * Vai trò:      Vẽ mọi nhân vật (mèo, gián, NPC) bằng lệnh Canvas 2D thay vì ảnh PNG. Player, Enemies,
 *               Bosses, Menus gọi OG.Sprites.drawCharacter() mỗi frame; init() nghe event gameplay để
 *               bắn hạt (particles) và chữ hoạt hình "BỐP!".
 * Khái niệm:    procedural drawing (vẽ bằng code, không dùng ảnh) · animation theo thời gian t
 *               (pose = hàm của t) · squash & stretch (co bẹp & giãn dài) · easing (hàm làm mượt) ·
 *               transform + save/restore · hệ toạ độ thiết kế · offscreen canvas (canvas phụ không hiển thị) ·
 *               lượng tử hoá thời gian (quantize) · cache LRU (bỏ khung lâu chưa dùng nhất) · memoization ·
 *               globalCompositeOperation (viền sticker, nháy trắng) · particles · data-driven (bảng NPC)
 * Bài học:      docs/learn/07-ve-canvas-procedural-cache.md (chính), docs/learn/06-event-bus-observer.md (init)
 * Phụ thuộc:    lúc CHẠY: OG.Data (characters/getSkin/resolveColors), OG.Sprites.skinGfx (skins.js),
 *               OG.font/OG.FONT, OG.time, OG.Particles.spawn, OG.Events, OG.Scenes.base, OG.Level.state,
 *               OG.Camera, OG.Game.run. Lúc LOAD không đọc module nào → thứ tự <script> linh hoạt.
 * Event:        phát: (không) · nghe (sau init): 'player:jump', 'player:land', 'item:collect',
 *               'enemy:stomp', 'player:hurt', 'boss:hit', 'boss:defeated'
 * API công khai: OG.Sprites.init(), drawCharacter(ctx, charId, animState, t, opts), getAnimStates(),
 *               drawPortrait(...), drawParticle(ctx, p), drawPopups(ctx), fx.{spawn,dust,puff,sparkle,stars,pop},
 *               listCharacters(), hasCharacter(id), ACCESSORIES, setCacheEnabled/isCacheEnabled/
 *               setCacheLimit/clearCache/cacheStats
 * Đọc tiếp:     src/gfx/skins.js (dữ liệu phụ kiện) → src/game/particles.js (hệ hạt gọi drawParticle)
 *               → src/game/player.js (nơi gọi drawCharacter cho người chơi)
 *               → src/gfx/decor.js (cùng kỹ thuật cache cho đồ trang trí) → docs/sprites-demo.html (xem thử)
 * Dữ liệu:      CharInfo, Pose, QuantizedTime, CachedFrame, DrawCharacterOpts (typedef ngay bên dưới)
 *
 * Hợp đồng (giữ nguyên chữ ký, xem docs/ARCHITECTURE.md mục 8.1 và docs/STORY.md mục 9):
 *   drawCharacter(ctx, charId, animState, t, opts)
 *     - Caller đã ctx.translate tới ĐIỂM CHÂN (giữa-đáy hitbox). Hàm tự save/restore.
 *     - charId: oggy | jack | olivia | joey | marky | deedee | roach | NPC v2 (bob, owl, robot, bee, ladybug,
 *       droplet, buffalo, turtle, lion_dance, camel, toucan, penguin, polar_bear, dino, blood_cell) | id đăng ký thêm
 *     - animState: idle | run | jump | fall | hurt | attack | victory | walk | stunned | dead
 *                  | talk | wave | think | point   (trạng thái lạ -> idle)
 *     - Hình nằm gọn trong [-w/2..w/2] × [-h..0], được tràn ra tối đa ~30%.
 *   Hàm mở rộng (drawPortrait, drawParticle, fx...) là TUỲ CHỌN: bên gọi nên kiểm tra tồn tại.
 *
 * Đường ống vẽ 1 nhân vật (pipeline):
 *   1. computePose(state, t) → "tư thế" Pose (co giãn, góc tay/chân, mắt, miệng, hiệu ứng...) nội suy liên tục.
 *   2. Bộ vẽ riêng từng nhân vật vẽ theo Pose trong hệ toạ độ THIẾT KẾ (chân ở (0,0), nhìn sang phải).
 *   3. Khung được dựng vào offscreen canvas: vẽ hình → tạo viền mực dày kiểu "sticker" quanh bóng hình
 *      → bóng đổ mềm dưới chân → hiệu ứng (sao, hơi nước, vệt tốc độ). Khung lượng tử hoá theo thời gian
 *      và được cache (LRU theo ngân sách điểm ảnh). Lật hướng, alpha, scale, squash tiếp đất áp lúc blit
 *      (blit = chép nguyên khung ảnh có sẵn lên canvas chính bằng drawImage).
 *   4. Chữ (OÁI!, ?, !, BỐP!) vẽ NGOÀI cache và không bị lật, font qua OG.font (đủ dấu tiếng Việt).
 * ========================================================================== */

/**
 * Thông tin đã chuẩn hoá của một nhân vật (gộp OG.Data + bảng dự phòng trong file). Memo theo id.
 * @typedef {Object} CharInfo
 * @property {string} id
 * @property {any} src         bản ghi gốc trong OG.Data.characters (null nếu không có)
 * @property {string} role     'player' | 'enemy' | 'boss' | 'npc'
 * @property {string} kind     bộ vẽ dùng: 'cat' | 'bug' | 'crawler' | 'npc'
 * @property {any} spec        thông số gián đứng (kind 'bug'), ngược lại null
 * @property {any} npc         dòng trong bảng NPC (kind 'npc'), ngược lại null
 * @property {number} w        kích thước hitbox trong game (px)
 * @property {number} h
 * @property {number} dw       kích thước hệ toạ độ THIẾT KẾ của bộ vẽ (đơn vị thiết kế)
 * @property {number} dh
 * @property {boolean} known   có bản ghi trong OG.Data hay không
 * @property {any} style       kiểu dáng mèo (kind 'cat'), ngược lại null
 */

/**
 * Tư thế tại một thời điểm — "bộ thông số" mà mọi bộ vẽ đọc (xem computePose). Góc tính bằng radian,
 * độ dài bằng đơn vị thiết kế; field dạng "mức" (0..1) là cường độ hiệu ứng, 0 = tắt.
 * @typedef {Object} Pose
 * @property {string} state
 * @property {number} t        thời gian trong animation (giây), đã lượng tử hoá nếu dùng cache
 * @property {number} sx       hệ số co giãn ngang (1 = bình thường) — squash & stretch
 * @property {number} sy       hệ số co giãn dọc
 * @property {number} by       dịch dọc cả người (âm = lên trên)
 * @property {number} shakeX   rung ngang cả người
 * @property {number} rot      xoay cả người quanh chân (+ = ngửa ra sau khi ngã)
 * @property {number} lean     nghiêng thân quanh hông (+ = chúi tới)
 * @property {number} headY    nhún đầu theo dọc
 * @property {number} tilt     nghiêng đầu
 * @property {number} legA     độ đưa chân trước (−1..1)
 * @property {number} legB     độ đưa chân sau
 * @property {number} liftA    độ nhấc chân trước
 * @property {number} liftB    độ nhấc chân sau
 * @property {number} armA     góc tay trước tính từ phương thẳng xuống (+ = về phía trước, ≈3 = giơ thẳng lên)
 * @property {number} armB     góc tay sau
 * @property {string} eyes     kiểu mắt: open | wide | squint | half | closed | happy | hurt | x | spiral
 * @property {string} mouth    kiểu miệng: smile | open | o | grin | wobble | frown | grumpy | yawn | chew | hmm | laugh | smirk
 * @property {number} mouthK   độ há miệng (0..1)
 * @property {number|null} look  hướng nhìn ngang (null = mặc định nhìn tới)
 * @property {number} lookY    hướng nhìn dọc
 * @property {number} tail     góc vẫy đuôi
 * @property {number} ant      độ đung đưa râu/anten
 * @property {number} flow     độ bay của vải (áo choàng, khăn) theo gió chuyển động
 * @property {number} wave     pha sóng cho vải/đuôi (radian)
 * @property {number} ph       pha chu kỳ hiện tại (radian)
 * @property {number} flap     pha đập cánh (ong)
 * @property {number} punch    mức vươn nắm đấm (0..1)
 * @property {number} swoosh   tiến độ vệt chém (−1 = không vẽ, 0..1.5)
 * @property {boolean} stars   có sao quay quanh đầu
 * @property {number} starT    góc quay của sao
 * @property {boolean} sparkle lấp lánh chiến thắng
 * @property {number} impact   mức tia va chạm trên đầu (0..1)
 * @property {number} splay    mức chân dạng ra khi gục (gián bò)
 * @property {boolean} moving  đang di chuyển
 * @property {boolean} wheel   chân xoay tít kiểu hoạt hình (mèo chạy)
 * @property {number} speed    vệt tốc độ (0/1)
 * @property {number} ballet   mức tư thế ba lê (Olivia)
 * @property {number} point    chỉ tay (0/1)
 * @property {number} cross    khoanh tay (0/1)
 * @property {number} steam    mức xì hơi nước từ tai
 * @property {number} hearts   mức tim bay
 * @property {number} sweat    giọt mồ hôi (0/1)
 * @property {number} chew     độ nhai (0..1)
 * @property {number} jiggle   bụng rung (−1..1)
 * @property {number} confetti pháo giấy (0/1)
 * @property {number} stiff    cứng đơ như cây sào (0/1)
 * @property {number} scratch  mức gãi bụng (0..1)
 */

/**
 * Kết quả lượng tử hoá thời gian của một animation.
 * @typedef {Object} QuantizedTime
 * @property {number} frame    chỉ số khung (dùng làm một phần khoá cache)
 * @property {number} t        thời gian đã làm tròn về đầu khung (giây) — vẽ bằng t này để khớp khung cache
 * @property {number} loop     chu kỳ (giây) nếu animation lặp, 0 nếu chạy một lần
 * @property {number} raw      thời gian chưa làm tròn (giây) — dùng khi KHÔNG cache để chuyển động mượt hơn
 */

/**
 * Khung hình đã vẽ sẵn vào canvas phụ.
 * @typedef {Object} CachedFrame
 * @property {HTMLCanvasElement} cv  canvas chứa khung (độ phân giải = kích thước thiết kế × res)
 * @property {number} ox   vị trí điểm CHÂN trong khung theo x (đơn vị thiết kế, tính từ mép trái)
 * @property {number} oy   vị trí điểm CHÂN trong khung theo y (đơn vị thiết kế, tính từ mép trên)
 * @property {number} w    kích thước khung khi blit (đơn vị thiết kế)
 * @property {number} h
 * @property {number} px   số điểm ảnh thật của canvas (W×H) — LRU dùng để tính ngân sách bộ nhớ
 */

/**
 * Tuỳ chọn của drawCharacter. Mọi field đều tuỳ chọn.
 * @typedef {Object} DrawCharacterOpts
 * @property {number} [face]    1 = nhìn phải, -1 = nhìn trái (lật ngang)
 * @property {string} [skin]    id skin (OG.Data.skins)
 * @property {Object<string,string>} [colors]  ghi đè màu, vd {body:'#ff0000'}
 * @property {number} [scale]   phóng to cả hình (1 = kích thước hitbox)
 * @property {number} [alpha]   độ trong suốt 0..1
 * @property {boolean} [flash]  phủ trắng (nháy khi bị đánh / bất tử)
 * @property {number} [w]       kích thước cần vẽ (px); mặc định = w/h của nhân vật
 * @property {number} [h]
 * @property {number} [vx]      vận tốc (px/giây). Có vx = "đây là người chơi trong màn" → bật bụi chạy, squash tiếp đất
 * @property {number} [vy]      vận tốc dọc (px/giây, + = rơi xuống) → stretch khi rơi nhanh
 * @property {number} [time]    đồng hồ riêng cho chớp mắt / dấu trên đầu (giây); mặc định = t
 * @property {string|string[]} [accessory]  'nonla'|'beret'|'helmet'|'scarf'|'spacesuit'|'explorer'|'none' (hoặc mảng)
 * @property {string} [mark]    '!' | '?' — dấu trong bong bóng trên đầu
 * @property {boolean} [shadow] false = tắt bóng đổ dưới chân
 * @property {boolean} [noCache] true = luôn vẽ trực tiếp (chậm hơn, mượt hơn)
 * @property {number} [worldX]  toạ độ CHÂN trong THẾ GIỚI (px) — đặt bụi chạy + chữ "BỐP!"
 * @property {number} [worldY]
 */
(function () {
  'use strict';
  // Ép kiểu any: `window.OG || {}` làm tsc suy ra kiểu {} rỗng và báo lỗi mọi truy cập OG.X.
  var OG = /** @type {any} */ (window.OG = window.OG || {});
  // Không ghi đè OG.Sprites cũ: skins.js (hoặc scenery.js) có thể đã gắn dữ liệu vào trước.
  var S = /** @type {any} */ (OG.Sprites = OG.Sprites || {});

  // "Đơn vị thiết kế": mỗi bộ vẽ tự có hệ toạ độ riêng (vd mèo 34×52, chân ở (0,0), nhìn sang phải).
  // drawCharacter co giãn hệ này về kích thước thật w×h (px) lúc vẽ → bộ vẽ không cần biết cỡ hitbox.
  var TAU = Math.PI * 2;
  var INK = '#17233d';   // màu "mực" của mọi nét viền (xanh đen, mềm hơn đen tuyền)
  var LW = 1.3;          // nét mực bên trong (đơn vị thiết kế)
  var OUTLINE = 1.7;     // viền mực ngoài (sticker), đơn vị thiết kế
  var NOSE = '#ff6f9f';
  var EAR_IN = '#ff9fc1';
  var MOUTH_IN = '#7a1f3d';
  var TONGUE = '#ff7d96';
  var BLUSH = 'rgba(255,110,150,0.42)';
  // Font dự phòng khi OG.font chưa có (vd trang demo chỉ nạp sprites.js).
  var FONT_STACK = '"Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';

  // Squash & stretch toàn thân của NGƯỜI CHƠI (áp lúc blit, không vào cache)
  var LAND_SQUASH_DUR = 0.2;   // giây: thời gian bẹp người sau khi tiếp đất
  var LAND_SQUASH_Y = 0.3;     // bẹp dọc tối đa: sy = 1 - 0.3 ngay lúc chạm đất
  var LAND_SQUASH_X = 0.24;    // phình ngang tối đa: sx = 1 + 0.24
  var FALL_STRETCH_VY = 900;   // px/giây: vận tốc rơi đạt mức giãn dài tối đa
  var FALL_STRETCH_MAX = 0.14; // giãn dọc tối đa khi rơi: sy = 1 + 0.14
  // Chớp mắt
  var BLINK_PERIOD = 3.3;      // giây giữa 2 lần chớp mắt
  var BLINK_DUR = 0.12;        // giây mắt nhắm trong một lần chớp
  var BLINK_SEED_K = 0.137;    // hệ số băm id → độ lệch pha (để các nhân vật không chớp cùng lúc)
  // Bụi chạy + chữ bật lên
  var RUN_DUST_STEP = 0.18;    // giây mỗi bước chạy (nửa chu kỳ run 0.36 s) → 1 cụm bụi
  var POPUP_LIFE = 0.8;        // giây chữ "BỐP!" tồn tại
  var POPUP_MAX = 8;           // số chữ bật lên tối đa cùng lúc
  var FLASH_FILL = 'rgba(255,255,255,0.78)'; // lớp phủ trắng khi nháy (bị đánh / bất tử)

  // ---------------------------------------------------------------------------
  // Tiện ích toán + hàm vẽ hình cơ bản
  // ---------------------------------------------------------------------------
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, k) { return a + (b - a) * k; }
  // 💡 Khái niệm: easing (hàm làm mượt) — biến tiến độ tuyến tính k∈[0,1] thành đường cong.
  //   easeOut: nhanh lúc đầu, chậm dần (bật nhảy, tung đòn); easeIn: chậm rồi nhanh dần (đổ ngã do trọng lực).
  function easeOut(k) { return 1 - (1 - k) * (1 - k); }
  function easeIn(k) { return k * k; }
  function font(px, weight) {
    if (typeof OG.font === 'function') return OG.font(px, weight);
    return (weight ? weight + ' ' : '') + (px | 0) + 'px ' + (OG.FONT || FONT_STACK);
  }

  // Làm tối (amt < 0) hoặc sáng (amt > 0) một màu #rrggbb.
  // 💡 Khái niệm: memoization (nhớ kết quả đã tính) — shade() bị gọi hàng trăm lần mỗi khung với cùng vài cặp
  //   (màu, amt), nên lưu kết quả vào object theo khoá "màu|amt" để lần sau chỉ tra bảng thay vì parse lại chuỗi.
  //   Bảng không có giới hạn kích thước nhưng thực tế vẫn nhỏ, vì game chỉ dùng một số màu có hạn.
  /** @type {Object<string, string>} */
  var shadeMemo = {};
  function shade(hex, amt) {
    var key = hex + '|' + amt;
    if (shadeMemo[key]) return shadeMemo[key];
    var m = /^#([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return hex || '#888888';
    var n = parseInt(m[1], 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    for (var i = 0; i < 3; i++) c[i] = Math.round(amt < 0 ? c[i] * (1 + amt) : c[i] + (255 - c[i]) * amt);
    var out = '#' + ((1 << 24) | (c[0] << 16) | (c[1] << 8) | c[2]).toString(16).slice(1);
    shadeMemo[key] = out;
    return out;
  }

  function ell(ctx, x, y, rx, ry, color, rot) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, TAU);
    ctx.fill();
  }
  function strokeEll(ctx, x, y, rx, ry, color, lw, rot) {
    ctx.strokeStyle = color; ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, TAU);
    ctx.stroke();
  }
  function circle(ctx, x, y, r, color) { ell(ctx, x, y, r, r, color); }
  // Hình tròn có viền mực.
  function dot(ctx, x, y, r, color, lw) {
    ell(ctx, x, y, r, r, color);
    strokeEll(ctx, x, y, r, r, INK, lw || LW);
  }
  // Elip có viền mực (không đổ bóng).
  function ellO(ctx, x, y, rx, ry, color, rot, lw) {
    ell(ctx, x, y, rx, ry, color, rot);
    strokeEll(ctx, x, y, rx, ry, INK, lw || LW, rot);
  }
  function seg(ctx, x1, y1, x2, y2, w, color) {
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  // Chi (tay/chân) có viền mực: vẽ nét mực DÀY HƠN trước, rồi nét màu mảnh hơn đè lên → lộ ra viền 2 bên.
  //   Đây là mẹo viền rẻ nhất trong Canvas: không cần tính đường bao, chỉ cần 2 lần stroke cùng một đoạn.
  function limb(ctx, x1, y1, x2, y2, w, color) {
    seg(ctx, x1, y1, x2, y2, w + LW * 2, INK);
    seg(ctx, x1, y1, x2, y2, w, color);
  }
  function rrectPath(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function rrect(ctx, x, y, w, h, r, color) { rrectPath(ctx, x, y, w, h, r); ctx.fillStyle = color; ctx.fill(); }
  function rrectO(ctx, x, y, w, h, r, color, lw) {
    rrectPath(ctx, x, y, w, h, r); ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = lw || LW; ctx.stroke();
  }
  // Khối tròn có đổ sáng (gradient) + viền mực: dùng cho thân, đầu. lw === 0 → không viền.
  // 💡 Khái niệm: radial gradient lệch tâm về góc trên-trái tạo cảm giác khối 3D có nguồn sáng phía trên-trái;
  //   chỉ cần MỘT màu gốc, sáng/tối được suy ra bằng shade() → đổi skin chỉ cần đổi 1 mã màu.
  function blob(ctx, x, y, rx, ry, color, rot, lw) {
    // ⚠️ Bẫy: ellipse() ném lỗi khi bán kính âm; squash mạnh có thể làm rx/ry ≈ 0 → kẹp tối thiểu 0.1.
    rx = Math.max(0.1, rx); ry = Math.max(0.1, ry);
    var fill = color;
    if (/^#[0-9a-f]{6}$/i.test(color || '') && ctx.createRadialGradient) {
      try {
        var R = Math.max(rx, ry);
        var g = ctx.createRadialGradient(x - rx * 0.35, y - ry * 0.45, R * 0.05, x, y, R * 1.12);
        g.addColorStop(0, shade(color, 0.28)); g.addColorStop(0.55, color); g.addColorStop(1, shade(color, -0.2));
        fill = g;
      } catch (e) { fill = color; }
    }
    ctx.fillStyle = fill;
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, TAU); ctx.fill();
    if (lw !== 0) { ctx.strokeStyle = INK; ctx.lineWidth = lw || LW; ctx.stroke(); }
  }
  // Ngôi sao n cánh (hạt, sao choáng, huy hiệu).
  function starPath(ctx, x, y, rOut, rIn, n, rot) {
    ctx.beginPath();
    for (var i = 0; i < n * 2; i++) {
      var r = i % 2 ? rIn : rOut, a = rot + (i * Math.PI) / n - Math.PI / 2;
      if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
  }
  // Tia lấp lánh 4 cánh.
  function sparkPath(ctx, x, y, r) {
    var k = r * 0.28;
    ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x + k, y - k, x + r, y);
    ctx.quadraticCurveTo(x + k, y + k, x, y + r); ctx.quadraticCurveTo(x - k, y + k, x - r, y);
    ctx.quadraticCurveTo(x - k, y - k, x, y - r); ctx.closePath();
  }
  // Trái tim (tâm x,y, bán kính r).
  function heartPath(ctx, x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x, y + r * 0.9);
    ctx.bezierCurveTo(x - r * 1.5, y - r * 0.1, x - r * 0.7, y - r * 1.25, x, y - r * 0.45);
    ctx.bezierCurveTo(x + r * 0.7, y - r * 1.25, x + r * 1.5, y - r * 0.1, x, y + r * 0.9);
    ctx.closePath();
  }

  // In lỗi MỘT lần cho mỗi nhãn: drawCharacter chạy 60 lần/giây, log mỗi frame sẽ làm treo DevTools.
  /** @type {Object<string, boolean>} */
  var errReported = {};
  function report(label, err) {
    if (errReported[label]) return;
    errReported[label] = true;
    if (window.console) console.error('[OG.Sprites] ' + label + ':', err);
  }

  // ---------------------------------------------------------------------------
  // Thông tin nhân vật (phòng thủ nếu OG.Data còn là stub)
  // ---------------------------------------------------------------------------
  // Bảng dự phòng: game vẫn vẽ được nhân vật gốc ngay cả khi src/data/characters.js lỗi hoặc chưa load.
  // w/h = kích thước hitbox (px), kind = chọn bộ vẽ nào.
  var BUILTIN = {
    oggy:   { w: 34, h: 52, role: 'player', kind: 'cat' },
    jack:   { w: 36, h: 54, role: 'player', kind: 'cat' },
    olivia: { w: 32, h: 50, role: 'player', kind: 'cat' },
    joey:   { w: 30, h: 40, role: 'boss', kind: 'bug' },
    marky:  { w: 30, h: 60, role: 'boss', kind: 'bug' },
    deedee: { w: 50, h: 50, role: 'boss', kind: 'bug' },
    roach:  { w: 34, h: 28, role: 'enemy', kind: 'crawler' }
  };
  var DESIGN = { cat: [34, 52], crawler: [34, 28] }; // bug: theo spec, npc: theo bảng NPC

  // Dee Dee chuyển sang XANH DƯƠNG (đúng bản gốc). Màu cam cũ trong dữ liệu được tự đổi sang xanh.
  var DEEDEE_BLUE = { body: '#3f8de0', shell: '#86c3f7', leg: '#1f4f96', head: '#4f9bea' };
  var DEEDEE_LEGACY = { '#e08a3c': 1, '#f3b277': 1, '#8a4a17': 1 };

  var DEFAULT_COLORS = {
    oggy: { body: '#2877d5', head: '#328be7', ear: '#2471cb', feet: '#263b9b', muzzle: '#ffffff' },
    jack: { body: '#47a53b', head: '#58b84a', ear: '#3f9a35', feet: '#2b6b25', muzzle: '#e6f7d9' },
    olivia: { body: '#efe7dc', head: '#f7f1ea', ear: '#e9ddd0', feet: '#c9b8a6', muzzle: '#ffffff', accent: '#f29bb8' },
    joey: { body: '#b94fcf', shell: '#e08fe8', leg: '#5e2470', nose: '#f08ad8' },
    marky: { body: '#5fae4e', shell: '#9fdc8c', leg: '#2f6b26' },
    deedee: { body: DEEDEE_BLUE.body, shell: DEEDEE_BLUE.shell, leg: DEEDEE_BLUE.leg },
    roach: { body: '#7d3e9b', shell: '#b56bc7', leg: '#4b285d' }
  };

  // Kiểu dáng từng chú mèo (đơn vị thiết kế 34x52, chân ở y=0).
  //  HX/HY/HRX/HRY: tâm + bán kính đầu · BY/BRX/BRY: thân · arm/armW: tay · eyeRx/eyeRy: mắt
  // 💡 Khái niệm: data-driven — ba chú mèo dùng CHUNG một hàm drawCat(); khác biệt chỉ nằm ở bảng số
  //   (CAT_BASE + phần ghi đè CAT_STYLE) và vài cờ bật/tắt chi tiết (brows, lashes, bow...).
  // 🧪 Thử: trong CAT_STYLE.oggy thêm `HRX: 24, eyeRx: 7` — Oggy đầu to mắt lồi hẳn ra, mọi animation vẫn đúng.
  var CAT_BASE = {
    HX: 1, HY: -35, HRX: 18, HRY: 15.5, BY: -14, BRX: 12, BRY: 11, arm: 10, armW: 6,
    eyeRx: 5.4, eyeRy: 7.6, noseRx: 4.6, noseRy: 3.4, muzRx: 10.5, muzRy: 7, footRx: 7.5, footRy: 4.2, legW: 6
  };
  var CAT_STYLE = {
    // Oggy: đầu to, chân ngắn, mắt lồi, mũi hồng to, bụng tròn trắng.
    oggy: { belly: '#f4fbff', tailTip: '#1f5fb3' },
    // Jack: to con, lông mày rậm cau có, cơ bắp phồng, hay xì hơi nước.
    jack: { HY: -38, HRX: 17, HRY: 14.5, BY: -17, BRX: 14, BRY: 13, arm: 11, armW: 7, eyeRx: 4.8, eyeRy: 6.3,
      belly: '#e6f7d9', brows: true, muscles: true, angry: true, noseRx: 4.2, noseRy: 3.1, footRx: 8 },
    // Olivia: thanh mảnh, mi cong, nơ hồng, má hồng, đuôi chóp hồng.
    olivia: { HY: -37, HRX: 16, HRY: 14, BY: -16, BRX: 10, BRY: 11.5, arm: 10, armW: 5, eyeRx: 5, eyeRy: 6.8,
      belly: '#ffffff', lashes: true, bow: true, blush: true, hearts: true, noseRx: 3.2, noseRy: 2.4, legW: 5, footRx: 6, footRy: 3.6 }
  };
  function catStyle(id, extra) {
    var out = {}, k, src = CAT_STYLE[id] || {};
    for (k in CAT_BASE) out[k] = CAT_BASE[k];
    for (k in src) out[k] = src[k];
    if (extra) for (k in extra) out[k] = extra[k];
    return out;
  }

  // Thông số gián đứng. Toạ độ: chân ở y=0, x=0 giữa, nhìn sang phải.
  var BUG_SPECS = {
    // Joey: nhỏ nhất, tím hồng, thủ lĩnh, mũi to, cười ranh mãnh, khoanh tay chỉ huy.
    joey: {
      W: 30, H: 40, headR: 10.5, headX: 2, headY: -28.5, bodyRx: 8, bodyRy: 9, bodyY: -12.5,
      hipY: -5.5, legW: 3, shoulderY: -17.5, armLen: 8, armW: 3, antLen: 12, eyeRx: 3.6, eyeRy: 4.6,
      eyeY: -33, lid: 0.42, mouth: 'smirk', crown: true, nose: 4.2, cross: true
    },
    // Marky: cao gầy, xanh lá, mắt lim dim lạnh lùng, nơ đỏ điệu đà, ngã đổ như cây sào.
    marky: {
      W: 30, H: 60, headR: 8.5, headX: 3, headY: -50, neck: true, bodyRx: 7, bodyRy: 16, bodyY: -27,
      hipY: -12, legW: 2.6, shoulderY: -38, armLen: 12, armW: 2.6, antLen: 17, eyeRx: 3.3, eyeRy: 4.8,
      eyeY: -52, lid: 0.6, mouth: 'flat', bowtie: true, brows: true, nose: 2.4, pole: true
    },
    // Dee Dee: to béo, xanh dương, miệng rộng, lúc nào cũng đói, bụng rung rinh.
    deedee: {
      W: 50, H: 50, headR: 12.5, headX: 7, headY: -37, bodyRx: 21, bodyRy: 18.5, bodyY: -20,
      hipY: -4, legW: 4, shoulderY: -27, armLen: 10, armW: 3.6, antLen: 14, eyeRx: 3.6, eyeRy: 4.3,
      eyeY: -43, lid: 0, mouth: 'hungry', bigBelly: true, nose: 0
    }
  };

  function dataChar(id) {
    try {
      var D = OG.Data;
      if (D && D.characters && D.characters[id]) return D.characters[id];
    } catch (e) { /* stub */ }
    return null;
  }

  /** @type {Object<string, CharInfo>} */
  var infoMemo = {};
  /**
   * Gộp dữ liệu nhân vật từ OG.Data + bảng dự phòng thành CharInfo, chọn bộ vẽ (kind) phù hợp.
   * Id lạ vẫn trả về thông tin hợp lệ (đoán theo role) để drawCharacter không bao giờ "trắng tay".
   * @param {string} id
   * @returns {CharInfo}
   */
  function charInfo(id) {
    var ch = dataChar(id), b = BUILTIN[id];
    var memo = infoMemo[id];
    // Memo kiểm tra cả `src`: nếu OG.Data đăng ký lại nhân vật (bản ghi mới) thì tính lại, không dùng bản cũ.
    if (memo && memo.src === ch) return memo;
    var role = (ch && ch.role) || (b && b.role) || (/roach|gian/i.test(String(id)) ? 'enemy' : 'player');
    var npc = NPC[id] || (ch && ch.spriteBase && NPC[ch.spriteBase]) || null;
    var kind = (ch && ch.sprite) || (b && b.kind) || (npc ? 'npc' : (role === 'player' || role === 'npc' ? 'cat' : role === 'enemy' ? 'crawler' : 'bug'));
    if (kind === 'npc' && !npc) kind = 'cat';
    var spec = null, dw, dh;
    if (kind === 'bug') {
      spec = BUG_SPECS[id] || BUG_SPECS[ch && ch.spriteBase] || BUG_SPECS.joey;
      dw = spec.W; dh = spec.H;
    } else if (kind === 'npc') {
      dw = npc.w; dh = npc.h;
    } else {
      var d = DESIGN[kind] || DESIGN.cat;
      dw = d[0]; dh = d[1];
    }
    var info = {
      id: String(id), src: ch, role: role, kind: kind, spec: spec, npc: kind === 'npc' ? npc : null,
      w: (ch && ch.w) || (b && b.w) || dw, h: (ch && ch.h) || (b && b.h) || dh,
      dw: dw, dh: dh, known: !!ch,
      style: kind === 'cat' ? catStyle(CAT_STYLE[id] ? id : (ch && ch.spriteBase) || id, ch && ch.style) : null
    };
    infoMemo[id] = info;
    return info;
  }

  // Gộp màu theo 4 lớp, lớp sau đè lớp trước: mặc định trong file → OG.Data (màu nhân vật + skin)
  //   → sửa màu Dee Dee cũ → opts.colors của bên gọi.
  function resolveColors(info, skinId, override) {
    var out = {}, k, base = DEFAULT_COLORS[info.id] || (info.npc && info.npc.colors) ||
      (info.kind === 'cat' ? DEFAULT_COLORS.oggy : DEFAULT_COLORS.roach);
    for (k in base) out[k] = base[k];
    if (info.known) {
      try {
        var rc = OG.Data.resolveColors ? OG.Data.resolveColors(info.id, skinId || null) : info.src.colors;
        if (rc) for (k in rc) out[k] = rc[k];
      } catch (e) { /* dùng màu mặc định */ }
    }
    // Dee Dee: dữ liệu cũ còn màu cam -> đổi sang bảng màu xanh dương.
    if (info.id === 'deedee' || (info.src && info.src.spriteBase === 'deedee')) {
      for (k in DEEDEE_BLUE) if (!out[k] || DEEDEE_LEGACY[String(out[k]).toLowerCase()]) out[k] = DEEDEE_BLUE[k];
    }
    if (override) for (k in override) out[k] = override[k];
    return out;
  }

  // Phụ kiện của skin: skin.gfx (nếu skin tự khai báo) hoặc bảng S.skinGfx trong skins.js.
  function skinGfx(skinId) {
    if (!skinId) return null;
    var sk = null;
    try { sk = OG.Data && OG.Data.getSkin ? OG.Data.getSkin(skinId) : null; } catch (e) { sk = null; }
    return (sk && sk.gfx) || (S.skinGfx && S.skinGfx[skinId]) || null;
  }

  // Phụ kiện theo hành trình -> các lớp vẽ {head, neck, back, body}.
  // Mỗi "khe" (slot) chỉ chứa 1 món → phụ kiện sau thay phụ kiện trước cùng khe; 'none' xoá hết.
  // out.key ghép tên các khe để đưa vào khoá cache (đổi phụ kiện = khung khác).
  var ACCESSORIES = ['nonla', 'beret', 'helmet', 'scarf', 'spacesuit', 'explorer'];
  function applyAcc(out, a) {
    switch (a) {
      case 'nonla': case 'beret': case 'helmet': out.head = a; break;
      case 'explorer': out.head = 'explorer'; out.back = 'backpack'; break;
      case 'spacesuit': out.head = 'bubble'; out.back = 'tank'; out.body = 'suit'; break;
      case 'scarf': out.neck = 'scarf'; break;
      case 'none': out.head = out.neck = out.back = out.body = null; break;
    }
  }
  function resolveAcc(info, gfx, optAcc) {
    var out = { head: null, neck: null, back: null, body: null, key: '' };
    var base = info.npc && info.npc.acc;
    if (base) for (var k in base) out[k] = base[k];
    var a = optAcc != null ? optAcc : (gfx && gfx.accessory) || null;
    if (a) {
      var list = Array.isArray(a) ? a : [a];
      for (var i = 0; i < list.length; i++) applyAcc(out, String(list[i]));
    }
    out.key = (out.head || '') + ',' + (out.neck || '') + ',' + (out.back || '') + ',' + (out.body || '');
    return out;
  }

  // ---------------------------------------------------------------------------
  // Animation: thông tin vòng lặp / thời lượng
  // ---------------------------------------------------------------------------
  var ANIMS = ['idle', 'run', 'jump', 'fall', 'hurt', 'attack', 'victory', 'walk', 'stunned', 'dead',
    'talk', 'wave', 'think', 'point'];
  // loop: chu kỳ (giây) + số khung cache; dur: animation một lần (giây) + fps cache (khung/giây).
  // loopAfter/cycle (giây): nếu t là "đồng hồ chạy" (vd trùm truyền OG.time) thì lặp lại thay vì đứng hình.
  // 💡 Khái niệm: animation theo thời gian — không có "danh sách ảnh"; mỗi trạng thái chỉ là một hàm Pose(t).
  //   Bảng này chỉ quyết định cắt hàm liên tục đó thành BAO NHIÊU khung để cache.
  //   Đánh đổi: nhiều khung = mượt hơn nhưng tốn bộ nhớ cache; idle chậm nên 20 khung/2.4 s là đủ.
  // 🧪 Thử: đổi run.frames 12 → 4 rồi chạy: chân Oggy giật cục như phim hoạt hình rẻ tiền.
  var ANIM_INFO = {
    idle: { loop: 2.4, frames: 20 },
    walk: { loop: 0.62, frames: 12 },
    run: { loop: 0.36, frames: 12 },
    fall: { loop: 0.32, frames: 8 },
    victory: { loop: 0.7, frames: 14 },
    stunned: { loop: 1.0, frames: 16 },
    talk: { loop: 0.8, frames: 16 },
    wave: { loop: 0.8, frames: 12 },
    think: { loop: 2.0, frames: 16 },
    point: { loop: 1.2, frames: 12 },
    yawn: { loop: 4.6, frames: 46 },          // nội bộ: mèo đứng yên lâu -> ngáp + gãi bụng
    jump: { dur: 0.3, fps: 30 },
    hurt: { dur: 0.5, fps: 30, loopAfter: 1.5, cycle: 0.6 },
    attack: { dur: 0.3, fps: 40, loopAfter: 1.5, cycle: 0.5 },
    dead: { dur: 0.6, fps: 30 }
  };
  var CRAWLER_LOOP = { run: 0.3, walk: 0.5 };
  var IDLE_LONG = 5;     // giây đứng yên trước khi mèo bắt đầu ngáp
  var YAWN_CYCLE = 9;    // chu kỳ ngáp/gãi bụng/đứng yên

  // Chuẩn hoá tên trạng thái: chấp nhận vài bí danh ('dizzy', 'hit', 'win'...) và đưa tên lạ về 'idle'
  // (hợp đồng STORY mục 9). 'yawn' là trạng thái nội bộ nên bên ngoài không được gọi thẳng.
  function normState(s) {
    if (ANIM_INFO[s] && s !== 'yawn') return s;
    if (s === 'stun' || s === 'dizzy') return 'stunned';
    if (s === 'die' || s === 'defeated') return 'dead';
    if (s === 'hit') return 'hurt';
    if (s === 'win' || s === 'celebrate') return 'victory';
    if (s === 'speak' || s === 'say') return 'talk';
    if (s === 'hello' || s === 'greet') return 'wave';
    return 'idle';
  }

  /**
   * Lượng tử hoá t (làm tròn thời gian về một số hữu hạn khung) để nhiều frame game dùng chung 1 khung cache.
   * @param {string} state  trạng thái đã chuẩn hoá (có thể là 'yawn')
   * @param {number} t      thời gian trong trạng thái (giây)
   * @param {string} kind   loại bộ vẽ (gián bò có chu kỳ chạy riêng)
   * @returns {QuantizedTime}
   */
  function quantize(state, t, kind) {
    // 💡 Khái niệm: lượng tử hoá thời gian — t liên tục có vô số giá trị nên không cache được.
    //   Làm tròn t về đầu khung gần nhất → chỉ còn `frames` giá trị → mỗi giá trị vẽ một lần rồi tái dùng.
    var a = ANIM_INFO[state];
    if (a.loop) {
      var loop = (kind === 'crawler' && CRAWLER_LOOP[state]) || a.loop;
      // ⚠️ Bẫy: `%` của JS giữ dấu số bị chia (-0.1 % 1 = -0.1) → cộng thêm loop rồi % lần nữa để pha luôn ≥ 0.
      var ph = ((t % loop) + loop) % loop;
      var f = Math.floor((ph / loop) * a.frames) % a.frames;
      return { frame: f, t: (f / a.frames) * loop, loop: loop, raw: ph };
    }
    if (a.loopAfter && t > a.loopAfter) t = t % a.cycle;
    // Animation một lần: dừng ở khung cuối (vd 'dead' nằm im), không quay lại đầu.
    var tt = clamp(t, 0, a.dur);
    // + 1e-6 chống sai số dấu phẩy động: vd 0.29 * 100 = 28.999999999999996 → floor nhầm sang khung trước.
    var fi = Math.floor(tt * a.fps + 1e-6);
    return { frame: fi, t: fi / a.fps, loop: 0, raw: tt };
  }

  // ---------------------------------------------------------------------------
  // Tư thế: mọi giá trị nội suy liên tục theo t.
  //  by: dịch dọc, shakeX: rung ngang, lean: nghiêng thân (+ chúi tới), rot: xoay cả người quanh chân,
  //  sx/sy: co giãn, tilt: nghiêng đầu, legA/legB: chân trước/sau, liftA/liftB: nhấc chân,
  //  armA/armB: góc tay trước/sau tính từ phương thẳng xuống (+ về phía trước),
  //  eyes/mouth/mouthK/look/lookY: biểu cảm; wheel: chân xoay tít; ballet: nhảy ba lê; point: chỉ tay;
  //  cross: khoanh tay; steam: xì hơi; hearts: tim bay; sweat: mồ hôi; chew: nhai; jiggle: bụng rung.
  //
  // 💡 Khái niệm: tách "chuyển động" khỏi "hình vẽ". computePose chỉ tính SỐ (không gọi ctx);
  //   mọi bộ vẽ (mèo, gián, 15 NPC) đọc cùng một Pose → thêm nhân vật mới là có ngay đủ 14 animation.
  //   Hàm là một switch lớn theo trạng thái (mỗi case giống một "keyframe bằng công thức"),
  //   cố ý để chung một chỗ cho dễ so sánh các trạng thái với nhau.
  // ---------------------------------------------------------------------------
  /**
   * Tính tư thế của nhân vật tại thời điểm t trong một trạng thái animation.
   * @param {string} state  trạng thái đã chuẩn hoá
   * @param {number} t      thời gian trong trạng thái (giây)
   * @param {string} kind   'cat' | 'bug' | 'crawler' | 'npc'
   * @param {number} loop   chu kỳ thật (giây) từ quantize, 0 nếu animation một lần
   * @param {string} id     charId — vài nhân vật có "tính cách" riêng (Joey khoanh tay, Dee Dee nhai...)
   * @returns {Pose}
   */
  function computePose(state, t, kind, loop, id) {
    // Giá trị mặc định = đứng thẳng, sx = sy = 1. Mỗi case chỉ ghi đè field nó cần.
    var P = {
      state: state, t: t, by: 0, shakeX: 0, lean: 0, rot: 0, sx: 1, sy: 1, headY: 0, tilt: 0,
      legA: 0, legB: 0, liftA: 0, liftB: 0, armA: 0.25, armB: -0.2,
      eyes: 'open', mouth: 'smile', mouthK: 1, look: null, lookY: 0, tail: 0, ant: 0, flow: 0.15, wave: 0, ph: 0,
      punch: 0, swoosh: -1, stars: false, starT: 0, sparkle: false, impact: 0, splay: 0, moving: false,
      wheel: false, speed: 0, ballet: 0, point: 0, cross: 0, steam: 0, hearts: 0, sweat: 0, chew: 0,
      jiggle: 0, confetti: 0, stiff: 0, scratch: 0, flap: t * 57
    };
    var s, k, e, ph, co, d;
    var cat = kind === 'cat';
    switch (state) {
      case 'idle':
        // Thở: một sóng sin chu kỳ 2.4 s. ph (pha) = góc 0..2π trong một chu kỳ.
        ph = (t * TAU) / 2.4; s = Math.sin(ph);
        // sy tăng thì sx giảm (và ngược lại) → "giữ thể tích", nhìn như hít vào/thở ra chứ không như phóng to.
        P.sy = 1 + s * 0.03; P.sx = 1 - s * 0.022; P.headY = s * 0.7;
        P.armA = 0.2 + s * 0.06; P.armB = -0.15 - s * 0.06;
        P.tail = s * 0.35; P.ant = Math.sin(ph * 2) * 0.5; P.wave = ph * 2; P.flow = 0.1; P.ph = ph;
        if (id === 'joey') { P.cross = 1; P.liftA = Math.max(0, Math.sin(ph * 4)) * 2.4; P.mouth = 'smirk'; P.tilt = -0.06; }
        else if (id === 'deedee') { P.chew = Math.abs(Math.sin(ph * 4)); P.mouth = 'chew'; P.jiggle = Math.sin(ph * 4) * 0.7; }
        else if (id === 'marky') { P.armA = -0.5; P.armB = -0.6; P.lean = -0.05; P.tilt = -0.08; }
        else if (id === 'jack') P.mouth = 'grumpy';
        if (cat && id === 'olivia') P.hearts = 0.6;
        break;
      case 'yawn': // chỉ cho mèo: 0–2,2 s ngáp duỗi người, 2,2–4,6 s gãi bụng
        ph = (t * TAU) / 2.4; P.ph = ph; P.wave = ph * 2;
        if (t < 2.2) {
          k = Math.sin((Math.PI * t) / 2.2);
          P.armA = lerp(0.2, 3.0, k); P.armB = lerp(-0.15, 2.75, k);
          P.sy = 1 + 0.1 * k; P.sx = 1 - 0.06 * k; P.tilt = -0.25 * k; P.headY = -1.5 * k; P.lean = -0.07 * k;
          P.eyes = k > 0.25 ? 'closed' : 'open'; P.mouth = k > 0.18 ? 'yawn' : 'smile'; P.mouthK = k;
          P.tail = 0.7 * k;
        } else {
          var u = t - 2.2;
          k = clamp(Math.min(u / 0.3, (2.4 - u) / 0.3), 0, 1);
          var sc = Math.sin(u * TAU * 2);
          P.armA = lerp(0.2, 0.55, k) + sc * 0.3 * k; P.armB = -0.15;
          P.eyes = k > 0.3 ? 'half' : 'open'; P.mouth = 'smile'; P.lean = -0.08 * k; P.sx = 1 + 0.02 * sc * k;
          P.tail = Math.sin(u * 3) * 0.4; P.scratch = k; P.tilt = 0.06 * k;
        }
        break;
      case 'walk':
      case 'run':
        var per = loop || (state === 'run' ? 0.36 : 0.62), amp = state === 'run' ? 1 : 0.6;
        ph = (t * TAU) / per; s = Math.sin(ph); co = Math.cos(ph);
        // Chu kỳ bước: hai chân lệch pha nhau nửa vòng (s và -s); nhấc chân dùng cos → chân nhấc lên lúc đang
        //   đưa ra trước. Thân nhún 2 lần mỗi chu kỳ (cos(2·ph)) vì mỗi chu kỳ có 2 bước.
        P.ph = ph; P.moving = true; P.legA = s * amp; P.legB = -s * amp;
        P.liftA = Math.max(0, co) * 5 * amp; P.liftB = Math.max(0, -co) * 5 * amp;
        P.by = -Math.abs(co) * 3 * amp;
        P.lean = 0.13 * amp; P.armA = -s * 0.9 * amp; P.armB = s * 0.9 * amp;
        P.sy = 1 - 0.05 * Math.cos(2 * ph) * amp; P.sx = 1 + 0.04 * Math.cos(2 * ph) * amp;
        P.tail = -0.5 + s * 0.25; P.ant = -0.6 * amp + Math.sin(ph * 2) * 0.2;
        P.flow = state === 'run' ? 0.9 : 0.45; P.wave = ph * 2;
        if (cat && state === 'run') {
          // chân xoay tít kiểu hoạt hình + người chúi tới + vệt tốc độ
          P.wheel = true; P.speed = 1; P.lean = 0.26; P.by = -2.5 - Math.abs(Math.sin(ph * 3)) * 1.5;
          P.armA = -s * 1.35; P.armB = s * 1.35; P.mouth = 'grin'; P.tail = -0.8;
        }
        if (id === 'deedee') { // chạy lạch bạch
          P.rot = s * 0.13; P.jiggle = Math.cos(ph * 2); P.lean = 0.03; P.by *= 0.4; P.mouth = 'hungry';
          P.sweat = state === 'run' ? 1 : 0;
        } else if (id === 'joey') { P.lean = 0.22; P.mouth = 'smirk'; }
        else if (id === 'marky') { P.lean = 0.04; P.tilt = -0.06; }
        else if (id === 'penguin') { P.rot = s * 0.15; P.lean = 0; }
        break;
      case 'jump':
        // 💡 Khái niệm: squash & stretch — nguyên lý hoạt hình số 1 của Disney. Lúc bật lên nhân vật GIÃN dài
        //   (sy 1.24, sx 0.82) rồi easeOut về gần bình thường trong 0.2 s; mắt người đọc thấy "lực bật" dù
        //   vật lý không đổi. Cú BẸP lúc tiếp đất nằm ở drawCharacter (LAND_SQUASH_*).
        // 🧪 Thử: đổi 1.24 → 1.6 và 0.82 → 0.6: Oggy bật lên như sợi mì dây thun.
        k = clamp(t / 0.2, 0, 1); e = easeOut(k);
        P.sy = 1.24 - 0.2 * e; P.sx = 0.82 + 0.16 * e;     // giãn dọc mạnh khi bật lên
        P.legA = 0.35; P.legB = -0.3; P.liftA = 6; P.liftB = 3;
        P.armA = lerp(0.3, 2.6, e); P.armB = lerp(-0.2, 2.2, e);
        P.mouth = 'open'; P.lean = 0.06; P.tail = 0.7; P.ant = 0.6; P.flow = 0.6; P.wave = t * 14;
        if (id === 'olivia') { // nhảy kiểu ba lê: duỗi thẳng chân, hai tay vòng trên đầu
          P.ballet = e; P.armA = lerp(0.3, 2.95, e); P.armB = lerp(-0.2, 3.05, e);
          P.mouth = 'smile'; P.eyes = 'happy'; P.hearts = 1; P.lean = -0.05; P.tilt = -0.1 * e;
        }
        break;
      case 'fall':
        ph = (t * TAU) / (loop || 0.32); s = Math.sin(ph);
        P.sy = 1.06; P.sx = 0.95;
        P.armA = 2.6 + s * 0.45; P.armB = 2.2 - s * 0.45;   // vung tay loạn xạ
        P.legA = 0.25 + s * 0.3; P.legB = -0.25 - s * 0.3; P.liftA = 2; P.liftB = 1;
        P.eyes = 'wide'; P.mouth = 'o'; P.tail = 1.1 + s * 0.2; P.ant = 1.2 + s * 0.2;
        P.flow = -0.4; P.wave = ph; P.ph = ph; P.sweat = 1;
        if (id === 'olivia') { P.ballet = 0.6; P.eyes = 'open'; P.sweat = 0; }
        break;
      case 'hurt':
        // Bẹp như bánh kếp rồi bật lại, sao quay quanh đầu. Ba pha theo t (giây):
        //   0–0.07 bẹp dần · 0.07–0.3 giữ bẹp · 0.3–0.46 bung lại, kèm `over` vượt quá rồi về (overshoot)
        //   → cảm giác đàn hồi như cao su thay vì dừng cứng.
        var flat = t < 0.07 ? t / 0.07 : t < 0.3 ? 1 : 1 - easeOut(clamp((t - 0.3) / 0.16, 0, 1));
        var over = t >= 0.3 ? Math.sin(clamp((t - 0.3) / 0.2, 0, 1) * Math.PI) * 0.14 : 0;
        P.sy = 1 - 0.5 * flat + over; P.sx = 1 + 0.5 * flat - over * 0.6;
        P.shakeX = flat < 1 && t > 0.3 ? Math.sin(t * 70) * 1.2 * (1 - flat) : 0;
        P.armA = 1.75; P.armB = -1.75; P.legA = 0.9 * flat; P.legB = -0.9 * flat;
        P.eyes = 'hurt'; P.mouth = 'o'; P.tail = 1.2; P.ant = 1.0; P.flow = 0.3; P.impact = 1 - clamp(t / 0.5, 0, 1);
        P.stars = true; P.starT = t * 12; P.steam = 1; P.sweat = 1;
        break;
      case 'attack':
        // Ba pha kinh điển của một đòn: anticipation (lấy đà, ngả ngược) → action (tung đòn) → recovery (thu về).
        //   Pha lấy đà ngắn (0.08 s) nhưng thiếu nó đòn đánh trông "yếu" hẳn.
        if (t < 0.08) {                         // lấy đà
          var w = t / 0.08;
          P.lean = -0.16 * w; P.sx = 1 + 0.12 * w; P.sy = 1 - 0.12 * w;
          P.armA = lerp(0.25, -0.9, w); P.armB = lerp(-0.2, 0.3, w);
        } else if (t < 0.2) {                   // tung đòn
          s = easeOut((t - 0.08) / 0.12);
          P.lean = lerp(-0.16, 0.3, s); P.sx = lerp(1.12, 1.1, s); P.sy = lerp(0.88, 0.96, s);
          P.armA = lerp(-0.9, 1.62, s); P.armB = 0.3; P.punch = s; P.swoosh = s;
          P.legA = 0.6 * s; P.legB = -0.5 * s;
        } else {                                // thu về
          var r = clamp((t - 0.2) / 0.1, 0, 1);
          P.lean = 0.3 * (1 - r); P.armA = lerp(1.62, 0.25, r); P.armB = lerp(0.3, -0.2, r);
          P.punch = 1 - r; P.swoosh = r < 0.5 ? 1 + r : -1;
          P.legA = 0.6 * (1 - r); P.legB = -0.5 * (1 - r);
        }
        P.eyes = 'squint'; P.mouth = 'grin'; P.ant = -0.4; P.flow = 0.5; P.tail = -0.3; P.steam = 1;
        break;
      case 'victory':
        // |sin| tạo các cú nhảy liên tiếp (hop 0 = chạm đất, 1 = đỉnh). g*g lớn nhất lúc chạm đất →
        //   squash chỉ xuất hiện ngay sát mặt đất, ở trên cao thì stretch nhẹ.
        ph = (t * TAU) / 0.7; var hop = Math.abs(Math.sin(ph)), g = 1 - hop;
        P.by = -hop * 14; P.sy = 1 - g * g * 0.16 + hop * 0.07; P.sx = 1 + g * g * 0.13 - hop * 0.04;
        P.armA = 2.7 + Math.sin(ph * 2) * 0.3; P.armB = 2.45 - Math.sin(ph * 2) * 0.3;
        P.liftA = hop * 4; P.liftB = hop * 3; P.legA = 0.15; P.legB = -0.15;
        P.eyes = 'happy'; P.mouth = 'grin'; P.tail = 0.8 + Math.sin(ph * 2) * 0.4;
        P.ant = Math.sin(ph * 2) * 0.6; P.flow = 0.4 + hop * 0.3; P.wave = ph * 2; P.sparkle = true; P.ph = ph;
        if (id === 'joey') { // ăn mừng lố: nhảy cao, đấm tay luân phiên, cười há miệng, pháo giấy
          P.by = -hop * 20; P.armA = 2.9 + Math.sin(ph) * 0.6; P.armB = 2.9 - Math.sin(ph) * 0.6;
          P.mouth = 'laugh'; P.confetti = 1; P.tilt = Math.sin(ph) * 0.15; P.rot = Math.sin(ph) * 0.12;
        } else if (id === 'deedee') { P.jiggle = Math.sin(ph * 2); P.mouth = 'hungry'; P.by = -hop * 8; }
        else if (id === 'marky') { P.by = -hop * 6; P.armA = 2.7; P.armB = -0.5; P.eyes = 'half'; P.mouth = 'smirk'; }
        else if (id === 'olivia') { P.hearts = 1; P.ballet = 0.4 * hop; }
        break;
      case 'stunned':
        ph = (t * TAU) / 1.0; s = Math.sin(ph);
        P.lean = s * 0.14; P.shakeX = s * 1.5; P.armA = 0.1; P.armB = -0.1; P.sy = 0.96;
        P.eyes = 'spiral'; P.mouth = 'wobble'; P.stars = true; P.starT = ph; P.ant = s; P.tail = s * 0.3; P.wave = ph;
        P.sweat = 1; P.tilt = s * 0.1;
        break;
      case 'dead':
        k = clamp(t / 0.4, 0, 1);
        if (id === 'marky') {
          // đổ thẳng đơ như cây sào: tăng tốc dần, nảy nhẹ khi chạm đất
          var kk = clamp(t / 0.45, 0, 1), bounce = t > 0.45 ? Math.sin(clamp((t - 0.45) / 0.15, 0, 1) * Math.PI) * 0.08 : 0;
          P.rot = -1.5 * easeIn(kk) + bounce; P.stiff = 1; P.armA = 0; P.armB = 0; P.legA = 0; P.legB = 0;
        } else {
          e = easeOut(k);
          P.rot = -1.45 * e; P.armA = 1.8; P.armB = 2.2; P.legA = 0.4; P.legB = -0.2; P.splay = e;
        }
        P.eyes = 'x'; P.mouth = 'o'; P.ant = 1; P.tail = 1.3;
        break;
      case 'talk':
        ph = (t * TAU) / 0.8; s = Math.sin(ph);
        var flapM = Math.sin(ph * 4);
        P.mouth = flapM > 0.15 ? 'open' : 'smile'; P.mouthK = 0.6 + 0.4 * Math.abs(flapM);
        P.armA = 0.95 + s * 0.4; P.armB = -0.2 - s * 0.1; P.headY = -Math.abs(Math.sin(ph * 2)) * 0.8;
        P.tilt = s * 0.05; P.sy = 1 + 0.02 * Math.sin(ph * 2); P.ant = Math.sin(ph * 2) * 0.5;
        P.tail = s * 0.3; P.wave = ph * 2; P.ph = ph; P.flow = 0.15;
        if (id === 'jack') P.mouth = flapM > 0.15 ? 'open' : 'grumpy';
        break;
      case 'wave':
        ph = (t * TAU) / 0.8; s = Math.sin(ph);
        P.armA = 2.75 + s * 0.45; P.armB = -0.2; P.eyes = 'happy'; P.mouth = 'grin';
        P.tilt = s * 0.07; P.sy = 1 + Math.abs(s) * 0.03; P.by = -Math.abs(Math.sin(ph)) * 1.2;
        P.tail = 0.5 + s * 0.4; P.ant = s * 0.6; P.wave = ph * 2; P.ph = ph;
        break;
      case 'point':
        ph = (t * TAU) / 1.2; s = Math.sin(ph);
        P.armA = 1.55 + s * 0.05; P.armB = -0.3; P.point = 1; P.lean = 0.08;
        P.mouth = Math.sin(ph * 2) > 0 ? 'open' : 'smile'; P.mouthK = 0.8; P.look = 1;
        P.tail = 0.3 + s * 0.2; P.ant = 0.4; P.wave = ph * 2; P.ph = ph;
        break;
      case 'think':
        ph = (t * TAU) / 2.0; s = Math.sin(ph);
        P.armA = 2.3; P.armB = 0.9; P.tilt = -0.12 + s * 0.04; P.look = -0.1; P.lookY = -0.5;
        P.mouth = 'hmm'; P.sy = 1 + s * 0.02; P.tail = s * 0.4; P.ant = s * 0.3; P.wave = ph * 2; P.ph = ph;
        if (id === 'jack') P.steam = 0.5;
        break;
    }
    if (P.state !== 'hurt' && P.state !== 'attack' && P.state !== 'think') P.steam = 0;
    void d;
    return P;
  }

  // Dịch/xoay/co giãn chung của tư thế (gốc là chân).
  // 💡 Khái niệm: transform tích luỹ — translate/rotate/scale nhân dồn vào ma trận hiện tại của ctx, nên
  //   scale(sx, sy) đặt SAU translate tới chân sẽ co giãn quanh CHÂN: bẹp người mà chân vẫn dính đất.
  //   Đổi thứ tự (scale trước) thì cả người trượt lên xuống khi co giãn.
  function applyBase(ctx, P, thickness) {
    ctx.translate(P.shakeX, P.by);
    if (P.rot) {
      // Nằm xuống: nhấc lên nửa bề dày thân để không lún xuống sàn.
      ctx.translate(0, -thickness * Math.min(1, Math.abs(P.rot) / 1.45));
      ctx.rotate(P.rot);
    }
    ctx.scale(P.sx, P.sy);
  }
  // Xoay quanh một điểm bất kỳ = dời gốc tới điểm đó → xoay → dời ngược lại. leanAt xoay thân quanh HÔNG,
  // headAt xoay đầu quanh TÂM ĐẦU. Bên gọi bọc trong ctx.save()/restore() để phép xoay không lan sang bộ phận khác.
  function leanAt(ctx, P, hipY) { ctx.translate(0, hipY); ctx.rotate(P.lean); ctx.translate(0, -hipY); }
  function headAt(ctx, P, hx, hy) { ctx.translate(hx, hy + P.headY); ctx.rotate(P.tilt || 0); ctx.translate(-hx, -hy); }

  // Hàng đợi hiệu ứng vẽ SAU khi tạo viền (không bị viền, không bị co giãn theo tư thế).
  // Bộ vẽ không vẽ sao/hơi nước ngay mà đẩy một hàm vào POST; buildFrame chạy chúng sau bước viền sticker.
  // POST là biến module (không phải tham số) để mọi hàm vẽ con gọi post() được mà không phải truyền qua 5 tầng.
  // ⚠️ Bẫy: POST chỉ khác null trong lúc renderPose chạy; post() gọi ngoài lúc đó sẽ bị bỏ qua lặng lẽ.
  /** @type {Function[] | null} */
  var POST = null;
  function post(fn) { if (POST) POST.push(fn); }

  // ---------------------------------------------------------------------------
  // Mắt và miệng dùng chung
  // ---------------------------------------------------------------------------
  // mode: open | wide | squint | half | closed | happy | hurt | x | spiral
  function drawEye(ctx, x, y, rx, ry, mode, o) {
    o = o || {};
    var lw = o.lw || LW;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (mode === 'closed' || mode === 'happy') {
      ctx.strokeStyle = INK; ctx.lineWidth = lw + 0.5;
      ctx.beginPath();
      if (mode === 'closed') ctx.arc(x, y - ry * 0.2, rx * 0.9, 0.15 * Math.PI, 0.85 * Math.PI);
      else ctx.arc(x, y + ry * 0.45, rx * 0.95, 1.15 * Math.PI, 1.85 * Math.PI);
      ctx.stroke();
      return;
    }
    if (mode === 'hurt') {
      // > <  (mắt nhắm nghiến)
      var dir = o.front ? -1 : 1;
      ctx.strokeStyle = INK; ctx.lineWidth = lw + 0.6;
      ctx.beginPath();
      ctx.moveTo(x - dir * rx * 0.75, y - ry * 0.5); ctx.lineTo(x + dir * rx * 0.55, y); ctx.lineTo(x - dir * rx * 0.75, y + ry * 0.5);
      ctx.stroke();
      return;
    }
    if (mode === 'x') {
      ctx.strokeStyle = INK; ctx.lineWidth = lw + 0.5;
      ctx.beginPath();
      ctx.moveTo(x - rx * 0.7, y - rx * 0.7); ctx.lineTo(x + rx * 0.7, y + rx * 0.7);
      ctx.moveTo(x + rx * 0.7, y - rx * 0.7); ctx.lineTo(x - rx * 0.7, y + rx * 0.7);
      ctx.stroke();
      return;
    }
    // Mắt mở: lòng trắng + viền + con ngươi.
    var wr = mode === 'wide' ? 1.14 : 1;
    ell(ctx, x, y, rx * wr, ry * wr, '#ffffff');
    strokeEll(ctx, x, y, rx * wr, ry * wr, INK, lw);
    if (mode === 'spiral') {
      ctx.strokeStyle = INK; ctx.lineWidth = lw * 0.8;
      ctx.beginPath();
      for (var i = 0; i <= 18; i++) {
        var a = i * 0.7 + (o.spin || 0), rr = (i / 18) * rx * 0.85;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * (ry / rx));
      }
      ctx.stroke();
      return;
    }
    var pr = mode === 'wide' ? rx * 0.32 : rx * 0.52;
    var look = o.look == null ? rx * 0.3 : o.look * rx * 0.4;
    var ly = ry * 0.12 + (o.lookY || 0) * ry * 0.5;
    circle(ctx, x + look, y + ly, pr, INK);
    circle(ctx, x + look + pr * 0.35, y + ly - pr * 0.3, Math.max(0.5, pr * 0.4), '#ffffff');
    var lid = mode === 'squint' ? Math.max(o.lid || 0, 0.45) : mode === 'half' ? Math.max(o.lid || 0, 0.52) : (o.lid || 0);
    if (lid > 0) {
      // Mí mắt: tô màu da phần trên của mắt.
      // 💡 Khái niệm: ctx.clip() — sau khi clip theo hình elip của mắt, fillRect bên dưới chỉ tô được BÊN TRONG
      //   elip. Nhờ vậy mí mắt là một hình chữ nhật đơn giản mà vẫn khớp viền cong. save/restore để huỷ vùng clip.
      ctx.save();
      ctx.beginPath(); ctx.ellipse(x, y, rx * wr + 0.4, ry * wr + 0.4, 0, 0, TAU); ctx.clip();
      ctx.fillStyle = o.lidColor || '#888';
      ctx.fillRect(x - rx - 2, y - ry - 2, rx * 2 + 4, (ry * 2 + 2) * lid + 1);
      ctx.restore();
      ctx.strokeStyle = INK; ctx.lineWidth = lw;
      ctx.beginPath();
      var lyy = y - ry + ry * 2 * lid;
      ctx.moveTo(x - rx * 0.95, lyy + (o.lidTilt || 0)); ctx.lineTo(x + rx * 0.95, lyy - (o.lidTilt || 0));
      ctx.stroke();
    }
    if (o.lashes) {
      ctx.strokeStyle = INK; ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(x + rx * 0.55, y - ry * 0.8); ctx.lineTo(x + rx * 1.15, y - ry * 1.15);
      ctx.moveTo(x + rx * 0.9, y - ry * 0.45); ctx.lineTo(x + rx * 1.5, y - ry * 0.62);
      ctx.moveTo(x + rx * 0.1, y - ry * 0.98); ctx.lineTo(x + rx * 0.45, y - ry * 1.4);
      ctx.stroke();
    }
  }
  // Hai mắt (mắt sau nhỏ hơn chút), dùng P.eyes / look.
  function eyes2(ctx, P, x1, y1, x2, y2, rx, ry, o) {
    o = o || {};
    var mode = P.eyes, base = { lidColor: o.lidColor, lid: o.lid || 0, lashes: o.lashes, lw: o.lw, look: P.look, lookY: P.lookY, lidTilt: o.lidTilt || 0 };
    base.front = false; drawEye(ctx, x1, y1, rx * 0.92, ry * 0.95, mode, base);
    base.front = true; drawEye(ctx, x2, y2, rx, ry, mode, base);
  }

  // mode: smile | open | o | grin | wobble | frown | grumpy | yawn | chew | hmm | laugh | smirk
  function drawMouth(ctx, x, y, mode, size, k) {
    size = size || 1; k = k == null ? 1 : k;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = INK; ctx.lineWidth = LW + 0.2;
    switch (mode) {
      case 'open':
        ellO(ctx, x, y + 1.8 * size, 3.3 * size, 3.1 * size * k, MOUTH_IN, 0, LW);
        ell(ctx, x + 0.4, y + (1.8 + 1.6 * k) * size, 2 * size, 1.1 * size * k, TONGUE);
        break;
      case 'o':
        ellO(ctx, x, y + 1.6 * size, 2.1 * size, 2.6 * size, MOUTH_IN, 0, LW);
        break;
      case 'yawn':
        ellO(ctx, x - 0.5, y + 3 * size * k, 4.2 * size, (2 + 4.6 * k) * size, MOUTH_IN, 0, LW);
        ell(ctx, x - 0.2, y + (3 + 3.4 * k) * size, 2.6 * size, 1.6 * size * k, TONGUE);
        break;
      case 'grin':
      case 'laugh':
        ctx.fillStyle = MOUTH_IN;
        ctx.beginPath();
        var big = mode === 'laugh' ? 1.35 : 1;
        ctx.moveTo(x - 4.4 * size * big, y - 0.4); ctx.quadraticCurveTo(x, y + 7.5 * size * big, x + 4.8 * size * big, y - 0.8 * size);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        rrect(ctx, x - 3 * size * big, y - 0.2, 6 * size * big, 1.6 * size, 0.6, '#ffffff');
        ell(ctx, x + 0.6 * size, y + 3.4 * size * big, 1.9 * size * big, 1.1 * size, TONGUE);
        break;
      case 'wobble':
        ctx.beginPath();
        ctx.moveTo(x - 4 * size, y + 1.5);
        for (var i = 1; i <= 4; i++) ctx.lineTo(x - 4 * size + i * 2 * size, y + 1.5 + (i % 2 ? -1.2 : 1.2));
        ctx.stroke();
        break;
      case 'frown':
        ctx.beginPath(); ctx.arc(x, y + 4 * size, 3.4 * size, 1.2 * Math.PI, 1.8 * Math.PI); ctx.stroke();
        break;
      case 'grumpy':
        ctx.beginPath(); ctx.moveTo(x - 4 * size, y + 2.2 * size); ctx.quadraticCurveTo(x, y + 0.2 * size, x + 4 * size, y + 2.2 * size); ctx.stroke();
        break;
      case 'hmm':
        ctx.beginPath(); ctx.moveTo(x - 2.5 * size, y + 1.6 * size); ctx.lineTo(x + 2.2 * size, y + 0.8 * size); ctx.stroke();
        break;
      case 'smirk':
        ctx.beginPath(); ctx.moveTo(x - 3.5 * size, y + 0.8 * size); ctx.quadraticCurveTo(x + 1 * size, y + 2.6 * size, x + 4.2 * size, y - 1.4 * size); ctx.stroke();
        break;
      case 'chew':
        if (k > 0.5) ellO(ctx, x, y + 1.2 * size, 2.6 * size, 1.4 * size * k, MOUTH_IN, 0, LW);
        else { ctx.beginPath(); ctx.moveTo(x - 3 * size, y + 1); ctx.quadraticCurveTo(x, y + 2.6, x + 3 * size, y + 1); ctx.stroke(); }
        break;
      default: // smile
        ctx.beginPath(); ctx.arc(x - 0.4, y - 1.4 * size, 3.8 * size, 0.2 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    }
  }

  // ---------------------------------------------------------------------------
  // Hiệu ứng hài hước (trong khung)
  // ---------------------------------------------------------------------------
  function drawSweat(ctx, x, y, s, ph) {
    var dy = ((ph || 0) % 1) * 3;
    ctx.save();
    ctx.translate(x, y + dy);
    ctx.fillStyle = '#9ad8ff'; ctx.strokeStyle = INK; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -3.6 * s); ctx.quadraticCurveTo(2.6 * s, 0, 0, 2 * s); ctx.quadraticCurveTo(-2.6 * s, 0, 0, -3.6 * s);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    circle(ctx, -0.6 * s, 0, 0.6 * s, '#ffffff');
    ctx.restore();
  }
  function drawHeart(ctx, x, y, r, color) {
    heartPath(ctx, x, y, r);
    ctx.fillStyle = color || '#ff6f9f'; ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 0.9; ctx.stroke();
  }
  function drawVictorySparkles(ctx, cx, cy, P) {
    ctx.fillStyle = '#fff3a8';
    for (var i = 0; i < 2; i++) {
      var a = P.ph + i * Math.PI, k = 0.6 + 0.4 * Math.abs(Math.sin(P.ph * 2 + i));
      sparkPath(ctx, cx + Math.cos(a) * 22, cy - 6 + Math.sin(a) * 8, 3.4 * k);
      ctx.fill(); ctx.strokeStyle = 'rgba(23,35,61,0.5)'; ctx.lineWidth = 0.7; ctx.stroke();
    }
  }
  function drawSwoosh(ctx, x, y, r, P) {
    if (P.swoosh < 0) return;
    var s = clamp(P.swoosh, 0, 1.5), alpha = s <= 1 ? 0.9 : clamp(1 - (s - 1) * 2, 0, 1) * 0.9;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.strokeStyle = '#ffffff'; ctx.lineCap = 'round';
    ctx.lineWidth = 3.4;
    ctx.beginPath(); ctx.arc(x, y, r, -1.1, -1.1 + 2.1 * Math.min(1, s)); ctx.stroke();
    ctx.lineWidth = 1.6; ctx.strokeStyle = '#ffe9a8';
    ctx.beginPath(); ctx.arc(x - 2, y, r - 4, -0.9, -0.9 + 1.7 * Math.min(1, s)); ctx.stroke();
    ctx.restore();
  }
  function drawImpact(ctx, x, y, k) {
    if (k < 0.35) return;
    ctx.save();
    ctx.globalAlpha *= clamp((k - 0.35) * 2, 0, 1);
    ctx.fillStyle = '#ffffff';
    starPath(ctx, x, y, 8 * k + 2, 3, 7, k * 2);
    ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.fillStyle = '#ffd84a';
    starPath(ctx, x, y, 4.5 * k + 1, 1.6, 7, k * 2);
    ctx.fill();
    ctx.restore();
  }

  // Hiệu ứng vẽ SAU viền (toạ độ gốc = chân, không co giãn theo tư thế).
  // Các hàm post* đều dùng cùng mẹo: pha ph = (t·tốc độ + lệch) % 1 chạy 0→1 lặp lại; vị trí/độ mờ là hàm của ph
  // → hạt "bay lên rồi tan" vô tận mà không cần lưu trạng thái hạt nào (khác với OG.Particles).
  function postStars(P) {
    post(function (ctx, info) {
      var top = -info.dh * Math.min(1.05, P.sy) - 3 + P.by, r = Math.max(9, info.dw * 0.42);
      for (var i = 0; i < 3; i++) {
        var a = P.starT + (i * TAU) / 3;
        var x = Math.cos(a) * r, y = top + Math.sin(a) * r * 0.3;
        ctx.fillStyle = '#ffd84a'; ctx.strokeStyle = INK; ctx.lineWidth = 1;
        starPath(ctx, x, y, 4, 1.8, 5, a);
        ctx.fill(); ctx.stroke();
      }
    });
  }
  function postSpeed(P) {
    post(function (ctx, info) {
      ctx.save();
      ctx.strokeStyle = 'rgba(23,35,61,0.35)'; ctx.lineCap = 'round';
      for (var i = 0; i < 3; i++) {
        var y = -info.dh * (0.25 + i * 0.22), off = ((P.ph * 0.5 + i * 1.7) % 2) * 3;
        ctx.lineWidth = 1.6 - i * 0.3;
        ctx.beginPath(); ctx.moveTo(-info.dw * 0.55 - off, y); ctx.lineTo(-info.dw * 0.55 - 9 - i * 3 - off, y); ctx.stroke();
      }
      ctx.restore();
    });
  }
  // Hơi nước xì ra từ tai (Jack khi tức). ex/ey: toạ độ hai tai trong khung gốc.
  function postSteam(P, ears) {
    post(function (ctx) {
      ctx.save();
      for (var j = 0; j < ears.length; j++) {
        for (var i = 0; i < 3; i++) {
          var ph = ((P.t * 2.6 + i / 3 + j * 0.17) % 1);
          var x = ears[j][0] + (j ? 1 : -1) * ph * 5, y = ears[j][1] - ph * 13 + P.by;
          var r = 1.8 + ph * 3.2;
          ctx.globalAlpha = (1 - ph) * 0.9 * P.steam;
          ctx.fillStyle = '#ffffff'; ctx.strokeStyle = 'rgba(23,35,61,0.45)'; ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke();
        }
      }
      ctx.restore();
    });
  }
  function postHearts(P, x, y) {
    post(function (ctx) {
      for (var i = 0; i < 2; i++) {
        var ph = ((P.t * 0.7 + i * 0.5) % 1);
        ctx.save();
        ctx.globalAlpha = Math.sin(ph * Math.PI) * P.hearts;
        drawHeart(ctx, x + Math.sin(ph * 6 + i) * 3 + i * 6, y - ph * 16 + P.by, 2.6 + ph * 1.2, i ? '#ff8fb8' : '#ff5f95');
        ctx.restore();
      }
    });
  }
  function postConfetti(P, info) {
    post(function (ctx) {
      var cols = ['#ffd84a', '#52c5ee', '#ff6f9f', '#7ed957', '#f27a43'];
      for (var i = 0; i < 9; i++) {
        var ph = ((P.t * 0.9 + i * 0.113) % 1);
        var x = Math.sin(i * 2.3) * info.dw * 0.9 + Math.sin(ph * 8 + i) * 3, y = -info.dh * 1.3 + ph * info.dh * 0.9;
        ctx.save(); ctx.translate(x, y); ctx.rotate(ph * 9 + i);
        ctx.globalAlpha = 1 - ph * 0.6;
        ctx.fillStyle = cols[i % cols.length]; ctx.fillRect(-1.4, -0.8, 2.8, 1.6);
        ctx.restore();
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Phụ kiện theo hành trình: nón lá, mũ nồi, mũ bảo hộ, mũ thám hiểm, mũ phi hành gia, khăn, ba lô…
  // ---------------------------------------------------------------------------
  // (hx, hy) tâm đầu, hrx/hry bán kính đầu.
  function wearHead(ctx, kind, hx, hy, hrx, hry, P, color) {
    if (!kind) return;
    var top = hy - hry;
    ctx.save();
    ctx.lineJoin = 'round';
    switch (kind) {
      case 'nonla': { // nón lá Việt Nam
        var W = hrx * 1.45, base = top + hry * 0.5, apex = top - hry * 1.05;
        ctx.fillStyle = '#f3d27a';
        if (ctx.createLinearGradient) {
          try {
            var g = ctx.createLinearGradient(hx - W, 0, hx + W, 0);
            g.addColorStop(0, '#e6bd5c'); g.addColorStop(0.45, '#fbe3a0'); g.addColorStop(1, '#d9ab4a');
            ctx.fillStyle = g;
          } catch (e) { /* màu phẳng */ }
        }
        ctx.beginPath();
        ctx.moveTo(hx - W, base); ctx.quadraticCurveTo(hx, base + hry * 0.28, hx + W, base);
        ctx.lineTo(hx + 0.5, apex); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = INK; ctx.lineWidth = LW; ctx.stroke();
        ctx.strokeStyle = 'rgba(150,105,30,0.55)'; ctx.lineWidth = 0.8;
        for (var i = 1; i <= 3; i++) {
          var f = i / 4;
          ctx.beginPath(); ctx.moveTo(lerp(hx + 0.5, hx - W, f), lerp(apex, base, f)); ctx.quadraticCurveTo(hx, lerp(apex, base, f) + hry * 0.1 * f, lerp(hx + 0.5, hx + W, f), lerp(apex, base, f)); ctx.stroke();
        }
        // dải ruy băng đỏ quanh vành
        ctx.strokeStyle = color || '#e5484d'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(hx - W * 0.62, base - hry * 0.28); ctx.quadraticCurveTo(hx, base - hry * 0.12, hx + W * 0.62, base - hry * 0.28); ctx.stroke();
        break;
      }
      case 'beret': // mũ nồi Pháp
        blob(ctx, hx - hrx * 0.08, top + hry * 0.15, hrx * 0.95, hry * 0.42, color || '#d1394a', -0.16);
        limb(ctx, hx - hrx * 0.1, top - hry * 0.25, hx - hrx * 0.05, top - hry * 0.48, 1.6, shade(color || '#d1394a', -0.25));
        break;
      case 'helmet': { // mũ bảo hộ vàng có đèn
        ctx.fillStyle = color || '#ffc94a';
        ctx.beginPath(); ctx.ellipse(hx, top + hry * 0.5, hrx * 1.0, hry * 0.78, 0, Math.PI, TAU); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = INK; ctx.lineWidth = LW; ctx.stroke();
        rrectO(ctx, hx - hrx * 1.18, top + hry * 0.38, hrx * 2.36, 3.4, 1.6, shade(color || '#ffc94a', -0.12));
        seg(ctx, hx - hrx * 0.1, top - hry * 0.2, hx - hrx * 0.1, top + hry * 0.35, 1.4, shade(color || '#ffc94a', -0.25));
        dot(ctx, hx + hrx * 0.62, top + hry * 0.12, 2.6, '#fff6c2', 1);
        break;
      }
      case 'explorer': { // mũ thám hiểm (mũ cối)
        var c = color || '#d9c08a';
        ellO(ctx, hx, top + hry * 0.45, hrx * 1.45, hry * 0.22, shade(c, -0.08));
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.ellipse(hx, top + hry * 0.42, hrx * 0.98, hry * 0.82, 0, Math.PI, TAU); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = INK; ctx.lineWidth = LW; ctx.stroke();
        rrect(ctx, hx - hrx * 0.98, top + hry * 0.12, hrx * 1.96, 2.6, 1, '#8a6a3a');
        dot(ctx, hx, top - hry * 0.38, 1.4, shade(c, -0.2), 0.8);
        break;
      }
      case 'bubble': { // mũ phi hành gia: bong bóng kính
        var R = Math.max(hrx, hry) * 1.28;
        ctx.fillStyle = 'rgba(190,230,255,0.22)';
        ctx.beginPath(); ctx.arc(hx, hy, R, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.2; ctx.stroke();
        ctx.strokeStyle = INK; ctx.lineWidth = LW; ctx.beginPath(); ctx.arc(hx, hy, R + 1.1, 0, TAU); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.arc(hx, hy, R * 0.78, -2.6, -1.9); ctx.stroke();
        rrectO(ctx, hx - R * 0.75, hy + R * 0.82, R * 1.5, 4, 2, '#c9d3df');
        break;
      }
      case 'gradcap': { // mũ tốt nghiệp (Giáo sư Cú)
        var col = '#2b2f45';
        rrectO(ctx, hx - hrx * 0.62, top - 2.5, hrx * 1.24, 5, 1.5, col);
        ctx.fillStyle = col; ctx.strokeStyle = INK; ctx.lineWidth = LW;
        ctx.beginPath();
        ctx.moveTo(hx - hrx * 1.05, top - 2.5); ctx.lineTo(hx + 1, top - 7.5); ctx.lineTo(hx + hrx * 1.1, top - 2.5); ctx.lineTo(hx, top + 1.5);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        var sw = Math.sin(P.wave || 0) * 1.5;
        seg(ctx, hx + 1, top - 3.5, hx + hrx * 0.85 + sw, top + 2.5, 1.1, color || '#ffc94a');
        dot(ctx, hx + hrx * 0.85 + sw, top + 4, 1.6, color || '#ffc94a', 0.8);
        break;
      }
    }
    ctx.restore();
  }
  // Khăn quàng cổ có đuôi bay. (nx, ny) tâm cổ, w bề ngang.
  function wearNeck(ctx, kind, nx, ny, w, color, P) {
    if (kind !== 'scarf') return;
    color = color || '#e5484d';
    var fl = P ? P.flow : 0.2, wv = P ? Math.sin(P.wave) * 1.5 : 0;
    limb(ctx, nx - w * 0.3, ny + 1, nx - w * 0.55 - fl * 6, ny + 8 + wv - fl * 3, 3.8, shade(color, -0.12));
    rrectO(ctx, nx - w / 2, ny - 2.6, w, 5.2, 2.6, color);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1;
    for (var i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(nx + i * w * 0.25, ny - 2); ctx.lineTo(nx + i * w * 0.25 + 1.5, ny + 2); ctx.stroke(); }
  }
  // Ba lô / bình dưỡng khí sau lưng. (bx, by) điểm giữa lưng, s cỡ.
  function wearBack(ctx, kind, bx, by, s) {
    if (kind === 'backpack') {
      rrectO(ctx, bx - s * 0.62, by - s * 0.55, s * 0.72, s * 1.05, 3, '#c7883a');
      rrectO(ctx, bx - s * 0.56, by - s * 0.05, s * 0.6, s * 0.42, 2, '#a96f2a', 1);
      seg(ctx, bx - s * 0.4, by - s * 0.5, bx - s * 0.1, by - s * 0.5, 1.2, '#7c5020');
    } else if (kind === 'tank') {
      rrectO(ctx, bx - s * 0.6, by - s * 0.6, s * 0.62, s * 1.1, s * 0.3, '#dfe6ee');
      rrect(ctx, bx - s * 0.55, by - s * 0.2, s * 0.52, s * 0.18, 1, '#ff7d5c');
    }
  }
  // Áo phi hành gia phủ thân. (x, y) tâm thân, rx/ry bán kính thân.
  function wearBody(ctx, kind, x, y, rx, ry) {
    if (kind !== 'suit') return;
    blob(ctx, x, y, rx * 1.03, ry * 1.03, '#eef3f8');
    rrectO(ctx, x - rx * 0.15, y - ry * 0.45, rx * 0.8, ry * 0.55, 2, '#c9d3df', 1);
    circle(ctx, x + rx * 0.05, y - ry * 0.18, 1.2, '#ff7d5c');
    circle(ctx, x + rx * 0.3, y - ry * 0.18, 1.2, '#7fe0ff');
    circle(ctx, x + rx * 0.52, y - ry * 0.18, 1.2, '#7ed957');
    seg(ctx, x - rx * 0.95, y + ry * 0.55, x + rx * 0.95, y + ry * 0.55, 1.4, '#9fb4c8');
  }

  // ---------------------------------------------------------------------------
  // Tay/chân dùng chung
  // ---------------------------------------------------------------------------
  // Tay: (sx, sy) vai, ang góc từ phương thẳng xuống. Trả về điểm bàn tay.
  function arm(ctx, sx, sy, ang, len, w, color, handC, o) {
    o = o || {};
    var dx = Math.sin(ang), dy = Math.cos(ang);
    var ex = sx + dx * len, ey = sy + dy * len;
    limb(ctx, sx, sy, ex, ey, w, color);
    if (o.muscle) {
      // bắp tay phồng quá đà
      var mx = sx + dx * len * 0.4 - dy * w * 0.35, my = sy + dy * len * 0.4 + dx * w * 0.35;
      blob(ctx, mx, my, w * 0.95, w * 0.68, color, Math.atan2(dy, dx));
    }
    if (o.point) limb(ctx, ex, ey, ex + dx * 4.6, ey + dy * 4.6, 2.2, handC);
    dot(ctx, ex, ey, w * 0.62 + (o.punch || 0) * 1.4, handC);
    return { x: ex, y: ey };
  }
  // Cánh / vây: elip dọc theo hướng tay.
  function wing(ctx, sx, sy, ang, len, w, color) {
    var dx = Math.sin(ang), dy = Math.cos(ang);
    blob(ctx, sx + dx * len * 0.5, sy + dy * len * 0.5, w / 2, len / 2, color, -ang);
    return { x: sx + dx * len, y: sy + dy * len };
  }
  // Hai chân đứng: hông ở (xB|xF, hipY). Vẽ trước thân.
  function legs2(ctx, P, xB, xF, hipY, w, legC, footC, frx, fry) {
    var fbx = xB + P.legB * 6, fby = -fry * 0.8 - P.liftB;
    var ffx = xF + P.legA * 6, ffy = -fry * 0.8 - P.liftA;
    if (P.stiff) { fbx = xB * 0.5; ffx = xF * 0.5; fby = ffy = -fry * 0.8; }
    limb(ctx, xB, hipY, fbx, fby, w, shade(legC, -0.14));
    blob(ctx, fbx + frx * 0.25, fby, frx, fry, shade(footC, -0.12));
    limb(ctx, xF, hipY, ffx, ffy, w, legC);
    blob(ctx, ffx + frx * 0.25, ffy, frx, fry, footC);
  }
  // Chân xoay tít kiểu hoạt hình (mèo chạy).
  function legWheel(ctx, x, y, r, legC, footC, ph) {
    ctx.save();
    ctx.globalAlpha *= 0.3;
    ell(ctx, x, y, r + 3.5, r + 1.8, legC);
    ctx.restore();
    ctx.strokeStyle = shade(legC, -0.25); ctx.lineWidth = 1.2; ctx.lineCap = 'round';
    for (var i = 0; i < 3; i++) {
      var a0 = ph * 1.2 + i * 2.1;
      ctx.beginPath(); ctx.ellipse(x, y, r * (0.55 + i * 0.25), r * (0.4 + i * 0.2), 0, a0, a0 + 1.5); ctx.stroke();
    }
    for (var j = 0; j < 3; j++) {
      var a = ph + j * (TAU / 3);
      var fx = x + Math.cos(a) * r, fy = y + Math.sin(a) * r * 0.75;
      limb(ctx, x, y - 1, fx, fy, 4.2, legC);
      blob(ctx, fx, fy, 5.4, 3.3, footC, a + Math.PI / 2 + 1.2);
    }
  }
  // Mức "giơ chân trước" của thú bốn chân khi vẫy/chỉ/nghĩ.
  function raiseOf(P) {
    var st = P.state;
    if (st !== 'wave' && st !== 'point' && st !== 'think' && st !== 'victory' && st !== 'talk') return 0;
    return clamp((P.armA - 0.6) / 2.2, 0, 1);
  }
  // 4 chân thú (nhìn ngang). xs = [sau-xa, sau-gần, trước-xa, trước-gần]. layer: 'far' | 'near'.
  function legs4(ctx, P, xs, hipY, w, legC, hoofC, layer, raise) {
    for (var i = 0; i < 4; i++) {
      var far = i === 0 || i === 2;
      if ((layer === 'far') !== far) continue;
      var sw = (i === 0 || i === 3) ? P.legA : P.legB;
      var lift = (i === 0 || i === 3) ? P.liftA : P.liftB;
      var x0 = xs[i], fx = x0 + sw * 5, fy = -lift * 0.8;
      if (i === 3 && raise > 0) { fx = x0 + raise * 8 + Math.sin(P.wave) * 1.5 * raise; fy = lerp(0, hipY + 3, raise * 0.75); }
      var col = far ? shade(legC, -0.18) : legC;
      limb(ctx, x0, hipY, fx, fy - 1.6, w, col);
      ellO(ctx, fx + 0.6, fy - 1.4, w * 0.62, 1.9, hoofC, 0, 1);
    }
  }

  // ---------------------------------------------------------------------------
  // MÈO (Oggy, Jack, Olivia) — thiết kế 34x52, nhìn sang phải, chân ở (0,0)
  // ---------------------------------------------------------------------------
  function catEar(ctx, cx, cy, tilt, color, inner, s) {
    s = s || 1;
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(tilt); ctx.scale(s, s);
    ctx.fillStyle = color; ctx.strokeStyle = INK; ctx.lineWidth = LW; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(-7, 6); ctx.quadraticCurveTo(-3, -6, -0.5, -10); ctx.quadraticCurveTo(3, -5, 7, 5); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = inner;
    ctx.beginPath(); ctx.moveTo(-3.4, 4.5); ctx.lineTo(-0.5, -5.5); ctx.lineTo(3.4, 4); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawCape(ctx, color, P, shY) {
    var f = P.flow, w1 = Math.sin(P.wave) * 2, w2 = Math.sin(P.wave + 1.3) * 2.6, y0 = shY - 2;
    var dark = shade(color, -0.25);
    ctx.fillStyle = dark; ctx.strokeStyle = INK; ctx.lineWidth = LW;
    ctx.beginPath();
    ctx.moveTo(6, y0);
    ctx.quadraticCurveTo(-2, y0 + 13, -5 - f * 9, -3 - f * 5 + w1);
    ctx.lineTo(-17 - f * 15, -5 - f * 11 + w2);
    ctx.quadraticCurveTo(-15 - f * 6, y0 + 11 - f * 2, -9, y0);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(6, y0);
    ctx.quadraticCurveTo(-1, y0 + 12, -3 - f * 8, -4 - f * 5 + w1);
    ctx.lineTo(-10 - f * 12, -5 - f * 8 + (w1 + w2) / 2);
    ctx.quadraticCurveTo(-10 - f * 4, y0 + 11, -6, y0);
    ctx.closePath(); ctx.fill();
  }

  // Mũ của skin (chef/crown/beret). (hx, top) = đỉnh đầu.
  function drawHat(ctx, kind, color, hx, top) {
    if (kind === 'chef') {
      ctx.save();
      ctx.translate(hx, top + 3); ctx.rotate(-0.06);
      ctx.strokeStyle = INK; ctx.lineWidth = LW;
      rrectO(ctx, -9, -11, 19, 11, 3, '#ffffff');
      dot(ctx, -5.5, -13, 6, '#ffffff'); dot(ctx, 8.5, -13, 6, '#ffffff'); dot(ctx, 1.5, -16.5, 7.5, '#ffffff');
      ell(ctx, 1.5, -10, 8, 4, '#ffffff');
      ctx.strokeStyle = 'rgba(23,35,61,0.25)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-3, -8); ctx.lineTo(-3, -1); ctx.moveTo(4, -8); ctx.lineTo(4, -1); ctx.stroke();
      rrectO(ctx, -9.5, -3.5, 20, 4.5, 2, '#e9eef5');
      ctx.restore();
    } else if (kind === 'crown') {
      ctx.save();
      ctx.translate(hx, top + 3); ctx.rotate(0.08);
      ctx.fillStyle = color || '#ffc94a';
      ctx.beginPath();
      ctx.moveTo(-9, 1); ctx.lineTo(-10, -9); ctx.lineTo(-5, -4); ctx.lineTo(0, -11);
      ctx.lineTo(5, -4); ctx.lineTo(10, -9); ctx.lineTo(9, 1); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = LW; ctx.lineJoin = 'round'; ctx.stroke();
      circle(ctx, 0, -2.5, 1.6, '#e5484d');
      circle(ctx, -6, -1.5, 1.1, '#52c5ee'); circle(ctx, 6, -1.5, 1.1, '#52c5ee');
      ctx.restore();
    } else if (kind === 'beret') {
      blob(ctx, hx - 2, top + 2, 14, 5, color || '#4f5d33', -0.18);
      circle(ctx, hx - 3, top - 3, 1.8, shade(color || '#4f5d33', -0.3));
      dot(ctx, hx + 5, top + 1, 1.8, '#ffc94a', 0.8);
    }
  }

  function drawBow(ctx, x, y, color, s) {
    s = s || 1;
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = color; ctx.strokeStyle = INK; ctx.lineWidth = 1.1; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-5, -7, -7.5, -3.5); ctx.quadraticCurveTo(-8, 2, -6.5, 4.5); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(5, -7, 7.5, -3.5); ctx.quadraticCurveTo(8, 2, 6.5, 4.5); ctx.closePath(); ctx.fill(); ctx.stroke();
    dot(ctx, 0, 0, 2.2, shade(color, -0.15), 1);
    ctx.restore();
  }

  /**
   * Vẽ một chú mèo theo tư thế P, trong hệ thiết kế 34×52 (chân ở (0,0), nhìn sang phải).
   * Thứ tự vẽ = thứ tự chồng lớp (painter's algorithm — vẽ sau đè lên vẽ trước):
   * chân → áo choàng/ba lô → đuôi → tay sau → thân + đồ mặc → đầu (tai, mặt, mắt, mũi, mũ) → tay trước.
   * @param {CanvasRenderingContext2D} ctx
   * @param {any} c    bảng màu đã gộp (resolveColors), vd {body, head, feet}
   * @param {Pose} P
   * @param {any} st    kiểu dáng mèo (catStyle)
   * @param {any} gfx   phụ kiện skin (SkinGfx trong skins.js)
   * @param {any} acc   phụ kiện hành trình theo khe (resolveAcc)
   */
  function drawCat(ctx, c, P, st, gfx, acc) {
    gfx = /** @type {any} */ (gfx || {});
    var body = c.body, head = c.head || body, earC = c.ear || head, feet = c.feet || shade(body, -0.35);
    var belly = gfx.belly || c.belly || st.belly || c.muzzle || '#ffffff';
    var muzzle = c.muzzle || '#ffffff', hand = c.hand || shade(head, 0.1), accent = c.accent || '#f29bb8';
    var HX = st.HX, HY = st.HY, HRX = st.HRX, HRY = st.HRY, BY = st.BY, BRX = st.BRX, BRY = st.BRY;
    var hipY = BY + BRY * 0.6, shY = BY - BRY * 0.55;
    var legC = shade(body, -0.06);
    applyBase(ctx, P, BRY);

    // --- chân ---
    if (P.wheel) {
      legWheel(ctx, 0, -5.5, 5.8, legC, feet, P.ph);
    } else if (P.ballet > 0.05) {
      // ba lê: chân trước duỗi thẳng mũi chân, chân sau co ra sau
      var b = P.ballet;
      limb(ctx, -3, hipY, lerp(-5, -15, b), lerp(-3, hipY - 1, b), st.legW, shade(legC, -0.12));
      blob(ctx, lerp(-5, -16, b), lerp(-3, hipY - 2, b), st.footRx * 0.8, st.footRy * 0.8, shade(feet, -0.1), -0.5 * b);
      limb(ctx, 3, hipY, lerp(5, 12, b), lerp(-3, hipY + 7, b), st.legW, legC);
      blob(ctx, lerp(6, 14, b), lerp(-3, hipY + 8, b), st.footRx * 0.8, st.footRy * 0.8, feet, 0.7 * b);
    } else {
      legs2(ctx, P, -4.5, 4.5, hipY, st.legW, legC, feet, st.footRx, st.footRy);
    }

    // --- thân trên nghiêng quanh hông ---
    // Chân vẽ TRƯỚC leanAt nên không nghiêng theo: người chúi tới khi chạy mà bàn chân vẫn bám đất.
    ctx.save();
    leanAt(ctx, P, hipY);
    if (gfx.cape) drawCape(ctx, gfx.cape, P, shY);
    wearBack(ctx, acc.back, -BRX + 1, BY - 1, BRY * 1.4);

    // đuôi
    var ta = 0.9 + P.tail * 0.6, tx0 = -BRX + 2, ty0 = BY + 4;
    var tipX = tx0 - 3 - Math.cos(ta) * 15, tipY = ty0 - Math.sin(ta) * 15;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(tx0, ty0); ctx.quadraticCurveTo(tx0 - 13, ty0 + 2, tipX, tipY);
    ctx.strokeStyle = INK; ctx.lineWidth = 4.8 + LW * 2; ctx.stroke();
    ctx.strokeStyle = body; ctx.lineWidth = 4.8; ctx.stroke();
    dot(ctx, tipX, tipY, 2.8, st.blush ? accent : (st.tailTip || shade(body, -0.2)), 1);

    // tay sau
    arm(ctx, -BRX * 0.4, shY, P.armB, st.arm, st.armW, shade(body, -0.14), shade(hand, -0.1), { muscle: st.muscles });

    // thân + bụng tròn trắng
    blob(ctx, 0, BY, BRX, BRY, body);
    ell(ctx, 2, BY + 1.5, BRX * 0.7, BRY * 0.74, belly);
    strokeEll(ctx, 2, BY + 1.5, BRX * 0.7, BRY * 0.74, 'rgba(23,35,61,0.18)', 1);
    if (st.muscles) {
      // ngực vạm vỡ
      ctx.strokeStyle = shade(belly, -0.3); ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.arc(-1, BY - 4, 4, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.arc(6, BY - 4, 4, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    }
    if (P.scratch > 0.2) {
      // vệt gãi bụng
      ctx.strokeStyle = 'rgba(23,35,61,0.4)'; ctx.lineWidth = 0.9;
      for (var si = 0; si < 3; si++) { ctx.beginPath(); ctx.moveTo(-1 + si * 3, BY + 1); ctx.lineTo(1 + si * 3, BY + 4); ctx.stroke(); }
    }
    wearBody(ctx, acc.body, 0, BY, BRX, BRY);

    if (gfx.coat) {
      // áo blouse nhà khoa học
      ctx.save();
      ctx.beginPath(); ctx.ellipse(0, BY, BRX + 0.6, BRY + 0.6, 0, 0, TAU); ctx.clip();
      ctx.fillStyle = gfx.coat; ctx.fillRect(-BRX - 1, BY - BRY - 1, BRX * 2 + 2, BRY * 2 + 2);
      ctx.fillStyle = belly;
      ctx.beginPath(); ctx.moveTo(1, BY - BRY); ctx.lineTo(7, BY - BRY); ctx.lineTo(4, BY + BRY * 0.3); ctx.closePath(); ctx.fill();
      ctx.restore();
      strokeEll(ctx, 0, BY, BRX, BRY, INK, LW);
      seg(ctx, 4, BY + BRY * 0.3, 4, BY + BRY, 1, 'rgba(23,35,61,0.4)');
      rrectO(ctx, -6, BY + 1, 5, 4, 1, '#ffffff', 0.9);
      seg(ctx, -4.5, BY - 0.5, -4.5, BY + 2, 1, '#52c5ee');
    }
    if (gfx.apron) {
      rrectO(ctx, -4, BY - 9, 14, 17, 4, '#ffffff', 1);
      ctx.strokeStyle = 'rgba(23,35,61,0.2)'; ctx.lineWidth = 1;
      ctx.strokeRect(-1, BY, 8, 5);
    }
    if (gfx.emblem) {
      dot(ctx, 3, BY - 4, 5.6, gfx.emblem, 1);
      ctx.fillStyle = gfx.cape || '#e5484d';
      starPath(ctx, 3, BY - 4, 4, 1.7, 5, 0); ctx.fill();
    }
    if (gfx.belt) rrectO(ctx, -BRX, BY + BRY * 0.35, BRX * 2, 3.6, 1.6, gfx.belt, 1);
    if (gfx.scarf) {
      ctx.fillStyle = gfx.scarf; ctx.strokeStyle = INK; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-6, shY); ctx.lineTo(10, shY - 0.5); ctx.lineTo(3, shY + 8); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    wearNeck(ctx, acc.neck, 1, shY - 1, BRX * 1.7, c.scarf, P);
    // vòng cổ màu accent nếu không có phụ kiện khác che
    if (c.accent && !gfx.scarf && !gfx.headband && !st.bow && !gfx.emblem && !acc.neck && !gfx.coat) rrectO(ctx, -BRX * 0.8, shY - 2, BRX * 1.75, 3.6, 1.8, c.accent, 1);

    // --- đầu ---
    ctx.save();
    headAt(ctx, P, HX, HY);
    var earIn = st.blush ? shade(accent, 0.25) : EAR_IN;
    catEar(ctx, HX - HRX * 0.56, HY - HRY + 3.2, -0.32, earC, earIn, 1);
    catEar(ctx, HX + HRX * 0.6, HY - HRY + 2.6, 0.26, earC, earIn, 1.05);
    blob(ctx, HX, HY, HRX, HRY, head);

    if (gfx.headband) {
      // băng đô ninja + 2 dải bay phía sau
      ctx.save();
      ctx.beginPath(); ctx.ellipse(HX, HY, HRX, HRY, 0, 0, TAU); ctx.clip();
      ctx.fillStyle = gfx.headband;
      ctx.beginPath(); ctx.moveTo(HX - 19, HY - 10); ctx.lineTo(HX + 19, HY - 13); ctx.lineTo(HX + 19, HY - 8); ctx.lineTo(HX - 19, HY - 5); ctx.closePath(); ctx.fill();
      ctx.restore();
      var hw = Math.sin(P.wave) * 3, fl = P.flow;
      limb(ctx, HX - 17, HY - 8, HX - 26 - fl * 6, HY - 7 + hw - fl * 2, 2.6, gfx.headband);
      limb(ctx, HX - 17, HY - 7, HX - 24 - fl * 5, HY - 2 + hw * 0.7, 2.6, shade(gfx.headband, -0.15));
    }

    // mõm trắng
    var mzx = HX + 6, mzy = HY + 6;
    if (gfx.faceMask) {
      ctx.save();
      ctx.beginPath(); ctx.ellipse(HX, HY, HRX, HRY, 0, 0, TAU); ctx.clip();
      ell(ctx, HX + 3, HY + 8, 18, 8.5, gfx.faceMask);
      ctx.restore();
    } else {
      ell(ctx, mzx, mzy, st.muzRx, st.muzRy, muzzle);
      strokeEll(ctx, mzx, mzy, st.muzRx, st.muzRy, 'rgba(23,35,61,0.22)', 1);
    }
    if (st.blush || P.state === 'victory' || P.state === 'wave') {
      ell(ctx, HX - 4.5, HY + 5, 3.4, 2.1, BLUSH);
      ell(ctx, HX + 15, HY + 4, 2.4, 1.8, BLUSH);
    }
    if (gfx.mask) rrectO(ctx, HX - 11.5, HY - 12, 26, 8.5, 4, gfx.mask, 1);
    if (gfx.goggles) {
      // kính bảo hộ đẩy lên trán
      seg(ctx, HX - HRX, HY - 10, HX + HRX, HY - 12, 2.2, '#4b6178');
      dot(ctx, HX - 1, HY - 12.5, 3.6, 'rgba(160,225,255,0.95)', 1.1);
      dot(ctx, HX + 7, HY - 13, 3.6, 'rgba(160,225,255,0.95)', 1.1);
    }

    // mắt to lồi
    var eo = { lidColor: head, lashes: st.lashes, lid: P.eyes === 'half' ? 0.55 : 0 };
    eyes2(ctx, P, HX - 3.5, HY - 7.5, HX + 8, HY - 8, st.eyeRx, st.eyeRy, eo);

    if (st.brows) {
      // lông mày rậm cau có của Jack
      var bdn = P.state === 'victory' || P.state === 'wave' ? -1.5 : 0;
      limb(ctx, HX - 9, HY - 16 + bdn, HX - 1, HY - 13 - bdn, 2.4, shade(head, -0.5));
      limb(ctx, HX + 3.5, HY - 13.5 - bdn, HX + 13, HY - 17 + bdn, 2.4, shade(head, -0.5));
    }

    if (!gfx.faceMask) {
      // mũi hồng to
      blob(ctx, mzx + 3, HY + 1.5, st.noseRx, st.noseRy, c.nose || NOSE);
      circle(ctx, mzx + 3 + st.noseRx * 0.25, HY + 1.5 - st.noseRy * 0.35, st.noseRx * 0.28, '#ffffff');
      drawMouth(ctx, mzx + 2.5, HY + 5.6, P.mouth, 1, P.mouthK);
      // râu mèo
      ctx.strokeStyle = 'rgba(23,35,61,0.5)'; ctx.lineWidth = 0.9; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(mzx + 8, HY + 4); ctx.lineTo(mzx + 15, HY + 1.5);
      ctx.moveTo(mzx + 8, HY + 6); ctx.lineTo(mzx + 15, HY + 6.5);
      ctx.moveTo(mzx - 7, HY + 4); ctx.lineTo(mzx - 13, HY + 2);
      ctx.stroke();
    }

    if (st.bow || gfx.bow) drawBow(ctx, HX + HRX * 0.55, HY - HRY + 1.5, accent, 1);
    if (gfx.hat && !acc.head) drawHat(ctx, gfx.hat, gfx.hatColor, HX, HY - HRY);
    wearHead(ctx, acc.head, HX, HY, HRX, HRY, P);
    if (P.impact) drawImpact(ctx, HX + HRX - 2, HY - HRY + 2, P.impact);
    if (P.sweat) drawSweat(ctx, HX - HRX + 1, HY - HRY + 6, 1, P.t * 2);
    ctx.restore(); // đầu

    // tay trước (vẽ đè lên thân) — tay sau đã vẽ trước thân: hai lớp trước/sau tạo chiều sâu mà không cần 3D.
    var fist = arm(ctx, BRX * 0.4, shY, P.armA, st.arm + P.punch * 3, st.armW, body, hand,
      { muscle: st.muscles, point: P.point, punch: P.punch });
    if (P.swoosh >= 0) drawSwoosh(ctx, fist.x - 4, fist.y, 13, P);
    ctx.restore(); // nghiêng

    // Hiệu ứng ngoài thân: đưa vào hàng đợi POST để vẽ sau viền sticker (không bị viền mực bao quanh).
    if (P.sparkle) drawVictorySparkles(ctx, 1, -40, P);
    if (P.stars) postStars(P);
    if (P.speed) postSpeed(P);
    if (P.steam > 0 && st.angry) postSteam(P, [[HX - HRX * 0.6, HY - HRY + 2], [HX + HRX * 0.65, HY - HRY + 1]]);
    if (P.hearts > 0 && st.hearts) postHearts(P, HX + 12, HY - HRY - 2);
  }

  // ---------------------------------------------------------------------------
  // GIÁN ĐỨNG (Joey, Marky, Dee Dee, trùm đăng ký thêm)
  // ---------------------------------------------------------------------------
  function drawBug(ctx, c, P, sp, id, acc) {
    var body = c.body, shell = c.shell || shade(body, 0.3), leg = c.leg || shade(body, -0.45);
    var headC = c.head || shade(body, 0.08);
    var jig = P.jiggle || 0;
    var by = sp.bodyY, bry = sp.bodyRy * (1 + (sp.bigBelly ? jig * 0.05 : 0)), brx = sp.bodyRx * (1 - (sp.bigBelly ? jig * 0.03 : 0));
    applyBase(ctx, P, sp.bodyRx);

    // chân
    legs2(ctx, P, -sp.bodyRx * 0.42, sp.bodyRx * 0.42, sp.hipY, sp.legW, leg, shade(leg, 0.08), 4.2 + sp.legW * 0.3, 2.4);

    ctx.save();
    leanAt(ctx, P, sp.hipY);
    var sb = sp.shoulderY;
    wearBack(ctx, acc.back, -brx * 0.8, by - 2, bry * 1.1);

    // tay sau
    if (!P.cross) arm(ctx, -brx * 0.35, sb, P.stiff ? 0 : P.armB, sp.armLen, sp.armW, shade(leg, -0.1), shade(leg, 0.05));

    // cánh (vỏ lưng) phía sau
    blob(ctx, -brx * 0.38, by - 1, brx * 0.86, bry * 1.06, shell, -0.12);
    ctx.strokeStyle = shade(shell, -0.3); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-brx * 0.35, by - bry); ctx.lineTo(-brx * 0.5, by + bry * 0.95); ctx.stroke();

    // thân + bụng có ngấn
    blob(ctx, 0, by, brx, bry, body);
    var bellyC = shade(body, sp.bigBelly ? 0.42 : 0.3);
    var bx2 = brx * 0.22 + jig * 1.2;
    ell(ctx, bx2, by + 1, brx * (sp.bigBelly ? 0.72 : 0.58), bry * 0.76, bellyC);
    ctx.strokeStyle = shade(body, -0.08); ctx.lineWidth = 1;
    for (var i = -1; i <= 1; i++) {
      var yy = by + i * bry * 0.32 + 1 + jig * 0.6;
      ctx.beginPath();
      ctx.ellipse(bx2, yy, brx * 0.5, 1.6, 0, 0.1 * Math.PI, 0.9 * Math.PI);
      ctx.stroke();
    }
    if (sp.bigBelly) circle(ctx, bx2 + 1, by + 3 + jig, 1.1, shade(body, -0.25)); // rốn
    wearBody(ctx, acc.body, 0, by, brx, bry);

    // cổ (Marky)
    var hx = sp.headX, hy = sp.headY;
    if (sp.neck) limb(ctx, 1, by - bry + 2, hx - 1, hy + sp.headR - 1, 3.6, body);
    wearNeck(ctx, acc.neck, sp.neck ? hx - 1 : 1, sp.neck ? hy + sp.headR + 1 : by - bry + 2, brx * 1.5, null, P);

    // đầu
    ctx.save();
    headAt(ctx, P, hx, hy);
    // râu (anten) — vẽ trước đầu
    var antBase = hy - sp.headR + 2, sway = P.ant * 3;
    for (var j = 0; j < 2; j++) {
      var ax = hx - 3 + j * 5, back = j ? 3 : 6;
      var tx = ax - back + sway * (j ? 1.3 : 1), ty = antBase - sp.antLen + Math.abs(sway) * 0.3;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(ax, antBase);
      ctx.quadraticCurveTo(ax + 2 + sway * 0.4, antBase - sp.antLen * 0.65, tx, ty);
      ctx.strokeStyle = INK; ctx.lineWidth = 1.6 + LW * 1.6; ctx.stroke();
      ctx.strokeStyle = leg; ctx.lineWidth = 1.6; ctx.stroke();
      dot(ctx, tx, ty, 1.9, shade(leg, 0.25), 1);
    }
    blob(ctx, hx, hy, sp.headR, sp.headR, headC);

    // mắt
    var eyes = P.eyes, lid = sp.lid;
    if (eyes === 'wide') lid = 0;
    if (P.state === 'victory' && id !== 'marky') lid = 0;
    var eo = { lidColor: headC, lid: lid, lidTilt: id === 'marky' ? 0.8 : -0.6, lw: 1.2 };
    var pl = P.look == null ? 0.9 : P.look;
    var P2 = { eyes: eyes, look: pl, lookY: P.lookY };
    eyes2(ctx, P2, hx - sp.eyeRx * 0.45, sp.eyeY, hx + sp.eyeRx * 1.75, sp.eyeY, sp.eyeRx, sp.eyeRy, eo);
    if (sp.brows && (eyes === 'open' || eyes === 'squint' || eyes === 'half')) {
      seg(ctx, hx - sp.eyeRx * 1.1, sp.eyeY - sp.eyeRy - 1.6, hx + sp.eyeRx * 0.4, sp.eyeY - sp.eyeRy - 2.3, 1.4, INK);
      seg(ctx, hx + sp.eyeRx * 1.1, sp.eyeY - sp.eyeRy - 2.3, hx + sp.eyeRx * 2.7, sp.eyeY - sp.eyeRy - 1.4, 1.4, INK);
    }

    // mũi
    var mx = hx + sp.headR * 0.45, my = hy + sp.headR * 0.42;
    if (sp.nose) {
      var nx = hx + sp.headR * 0.78, ny = hy + sp.headR * 0.12;
      blob(ctx, nx, ny, sp.nose * 1.05, sp.nose * 0.85, c.nose || shade(body, 0.35));
      circle(ctx, nx + sp.nose * 0.3, ny - sp.nose * 0.35, sp.nose * 0.28, '#ffffff');
      my += sp.nose * 0.35;
    }

    // miệng
    var m = P.mouth;
    if (m === 'smile') m = sp.mouth;
    if (m === 'smirk' && id === 'joey') {
      // nụ cười ranh mãnh lộ răng
      ctx.fillStyle = MOUTH_IN; ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(mx - 3.5, my + 0.6); ctx.quadraticCurveTo(mx + 1, my + 4.2, mx + 4.5, my - 1.5); ctx.quadraticCurveTo(mx + 0.5, my + 1.5, mx - 3.5, my + 0.6);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      rrect(ctx, mx - 1.2, my + 0.9, 3.4, 1.3, 0.5, '#ffffff');
    } else if (m === 'flat') {
      seg(ctx, mx - 2.5, my + 1, mx + 3, my + 0.6, 1.3, INK);
      // ria mép điệu đà của Marky
      ctx.strokeStyle = shade(leg, -0.2); ctx.lineWidth = 1.3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(mx - 3.5, my - 0.4); ctx.quadraticCurveTo(mx, my - 2.6, mx + 4.5, my - 1.2); ctx.quadraticCurveTo(mx + 5.8, my - 0.8, mx + 5.5, my - 2.4); ctx.stroke();
    } else if (m === 'hungry' || (sp.mouth === 'hungry' && (m === 'open' || m === 'grin'))) {
      // Dee Dee: miệng rộng, lưỡi thè, nước dãi
      ellO(ctx, mx, my + 1.5, 6.4, 4.8, MOUTH_IN, 0, 1.2);
      rrect(ctx, mx - 4, my - 2.6, 3, 2.4, 0.8, '#ffffff');
      rrect(ctx, mx + 0.6, my - 2.6, 3, 2.4, 0.8, '#ffffff');
      ell(ctx, mx + 0.8, my + 3.8, 3.6, 2, TONGUE);
      var dr = (Math.sin(P.wave * 0.5) + 1) * 1.5;
      ellO(ctx, mx + 5.5, my + 4.5 + dr, 1.1, 1.6 + dr * 0.4, '#bfe8ff', 0, 0.7);
    } else if (m === 'chew') {
      // má phồng + nhai nhóp nhép + vụn bánh
      ell(ctx, mx + 2.5, my - 0.5, 4 + P.chew * 1.2, 3 + P.chew, shade(headC, 0.12));
      drawMouth(ctx, mx, my, 'chew', 1.1, P.chew);
      ctx.fillStyle = '#c98b3c';
      for (var cr = 0; cr < 3; cr++) circle(ctx, mx + 2 + cr * 2.2, my + 4 + ((P.t * 3 + cr * 0.3) % 1) * 5, 0.8, '#c98b3c');
    } else {
      drawMouth(ctx, mx, my - 1, m, 0.9, P.mouthK);
    }

    if (sp.crown && !acc.head) {
      ctx.save();
      ctx.translate(hx + 1, hy - sp.headR + 1.5); ctx.rotate(0.22);
      ctx.fillStyle = '#ffc94a'; ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(-5, 1); ctx.lineTo(-5.5, -5); ctx.lineTo(-2.5, -2.5); ctx.lineTo(0, -6.5);
      ctx.lineTo(2.5, -2.5); ctx.lineTo(5.5, -5); ctx.lineTo(5, 1); ctx.closePath(); ctx.fill(); ctx.stroke();
      circle(ctx, 0, -1.2, 1, '#e5484d');
      ctx.restore();
    }
    wearHead(ctx, acc.head, hx, hy, sp.headR, sp.headR, P);
    if (P.impact) drawImpact(ctx, hx + sp.headR, hy - sp.headR * 0.6, P.impact);
    if (P.sweat) drawSweat(ctx, hx - sp.headR, hy - sp.headR * 0.4, 0.9, P.t * 2);
    ctx.restore(); // đầu

    if (sp.bowtie) drawBow(ctx, 2, by - bry + 3, '#e5484d', 0.75);

    // tay trước / khoanh tay
    if (P.cross) {
      var cy = sb + 4;
      limb(ctx, -brx * 0.75, cy - 1, brx * 0.95, cy + 1.6, sp.armW + 0.4, leg);
      limb(ctx, -brx * 0.6, cy + 2.4, brx * 1.0, cy - 0.6, sp.armW + 0.4, shade(leg, 0.08));
      dot(ctx, brx * 1.0, cy - 0.6, 2.2, shade(leg, 0.15), 1);
      dot(ctx, -brx * 0.75, cy - 1, 2.1, shade(leg, 0.05), 1);
    } else {
      var hand = arm(ctx, brx * 0.55, sb, P.stiff ? 0 : P.armA, sp.armLen + P.punch * 3, sp.armW, leg, shade(leg, 0.12),
        { point: P.point, punch: P.punch });
      if (P.swoosh >= 0) drawSwoosh(ctx, hand.x - 3, hand.y, 10 + brx * 0.3, P);
    }
    ctx.restore();

    if (P.sparkle) drawVictorySparkles(ctx, hx, hy, P);
    if (P.stars) postStars(P);
    if (P.confetti) postConfetti(P, { dw: sp.W, dh: sp.H });
  }

  // ---------------------------------------------------------------------------
  // GIÁN BÒ (lính tuần tra 'roach') — thiết kế 34x28, dễ thương, mắt to
  // ---------------------------------------------------------------------------
  function drawCrawler(ctx, c, P, acc) {
    var body = c.body, shell = c.shell || shade(body, 0.3), leg = c.leg || shade(body, -0.45);
    var moving = P.moving;
    var bob = moving ? -Math.abs(Math.sin(P.ph)) * 1.6 : P.by * 0.3;
    var down = P.eyes === 'x' || P.eyes === 'hurt';
    ctx.translate(P.shakeX, bob);
    ctx.scale(P.sx, P.sy);

    // 3 cặp chân: chân xa vẽ trước (tối hơn), chân gần vẽ sau.
    function legs(near) {
      for (var i = 0; i < 3; i++) {
        var hx = -9 + i * 9, hy = -8;
        var phase = P.ph + (i % 2 ? Math.PI : 0) + (near ? 0 : Math.PI);
        var swing = moving ? Math.sin(phase) * 4 : 0;
        var lift = moving ? Math.max(0, Math.cos(phase)) * 3 : 0;
        var kx = hx + (i - 1) * 3 + swing * 0.5, ky = hy + (down ? -5 : -1) - lift;
        var fx = hx + (i - 1) * 6 + swing, fy = down ? -9 - P.splay * 4 : -lift;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(kx + (near ? 0 : -1), ky - 3); ctx.lineTo(fx, fy);
        ctx.strokeStyle = INK; ctx.lineWidth = (near ? 2.4 : 2.1) + 1.6; ctx.stroke();
        ctx.strokeStyle = near ? leg : shade(leg, -0.25); ctx.lineWidth = near ? 2.4 : 2.1; ctx.stroke();
        if (near) circle(ctx, fx, fy, 1.5, shade(leg, 0.2));
      }
    }
    legs(false);

    // thân + vỏ cánh tròn bóng
    blob(ctx, -1, -12, 15, 8.8, body);
    blob(ctx, -3.5, -14, 13, 7.2, shell, -0.05);
    ctx.strokeStyle = shade(shell, -0.35); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-16, -14.5); ctx.quadraticCurveTo(-4, -12, 8, -15.5); ctx.stroke();
    ell(ctx, -7, -17.8, 4.6, 1.7, 'rgba(255,255,255,0.55)', -0.1); // bóng sáng
    wearBack(ctx, acc.back, -10, -18, 10);

    // anten cong ngộ nghĩnh
    var sw = P.ant * 2.5;
    ctx.lineCap = 'round';
    var ants = [[15, -16, 20, -25, 25 + sw, -27 + Math.abs(sw) * 0.4], [12.5, -17.5, 14.5, -28, 19 + sw * 0.8, -31]];
    for (var a = 0; a < 2; a++) {
      var A = ants[a];
      ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.quadraticCurveTo(A[2], A[3], A[4], A[5]);
      ctx.strokeStyle = INK; ctx.lineWidth = 3.4; ctx.stroke();
      ctx.strokeStyle = leg; ctx.lineWidth = 1.5; ctx.stroke();
      dot(ctx, A[4], A[5], 1.8, shade(body, 0.35), 0.9);
    }

    // đầu to, mắt to tròn, má hồng
    var hc = shade(body, 0.12);
    blob(ctx, 13, -12, 7.4, 7, hc);
    var eo = { lw: 1.1, lidColor: hc, lid: 0 };
    var P2 = { eyes: P.eyes, look: P.look == null ? 0.8 : P.look, lookY: P.lookY };
    eyes2(ctx, P2, 10.6, -14.6, 16, -14.4, 3.4, 4.3, eo);
    ell(ctx, 18.5, -9.5, 1.9, 1.2, BLUSH);
    if (P.mouth === 'o' || P.mouth === 'open' || P.mouth === 'grin') ellO(ctx, 16.5, -8, 1.6, 1.8, MOUTH_IN, 0, 0.9);
    else {
      ctx.strokeStyle = INK; ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(14.5, -8.6); ctx.quadraticCurveTo(16.5, -6.6, 18.3, -8.8); ctx.stroke();
    }
    wearHead(ctx, acc.head, 13, -12, 7.4, 7, P);
    if (P.sweat) drawSweat(ctx, 7, -19, 0.8, P.t * 2);

    legs(true);
    if (P.stars) postStars(P);
  }

  // ---------------------------------------------------------------------------
  // NPC v2 — người dẫn đường và bạn đồng hành (docs/STORY.md mục 9)
  // Mỗi hàm vẽ trong hệ thiết kế w×h, chân ở (0,0), nhìn sang phải.
  // ---------------------------------------------------------------------------

  // Bob — chó bun hàng xóm: cục cằn nhưng tốt bụng, nón lá, khăn quàng.
  function drawBob(ctx, c, P, acc) {
    var body = c.body, head = c.head || body, ear = c.ear || shade(body, -0.3), feet = c.feet || shade(body, -0.4), muz = c.muzzle || '#f3dcc0';
    applyBase(ctx, P, 12);
    legs2(ctx, P, -7, 7, -8, 6.5, shade(body, -0.08), feet, 7.5, 4.2);
    ctx.save(); leanAt(ctx, P, -8);
    var shY = -23;
    wearBack(ctx, acc.back, -13, -17, 16);
    arm(ctx, -9, shY, P.armB, 10, 6, shade(body, -0.15), shade(head, -0.08));
    blob(ctx, 0, -16, 15, 12.5, body);
    ell(ctx, 3, -14, 9.5, 8.5, muz); strokeEll(ctx, 3, -14, 9.5, 8.5, 'rgba(23,35,61,0.18)', 1);
    wearBody(ctx, acc.body, 0, -16, 15, 12.5);
    wearNeck(ctx, acc.neck, 2, -26.5, 24, c.accent || '#e9c46a', P);
    ctx.save(); headAt(ctx, P, 3, -32);
    // tai cụp
    ctx.fillStyle = ear; ctx.strokeStyle = INK; ctx.lineWidth = LW; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(-10, -42); ctx.quadraticCurveTo(-19, -40, -15, -31); ctx.quadraticCurveTo(-11, -35, -6, -40); ctx.closePath(); ctx.fill(); ctx.stroke();
    blob(ctx, 3, -32, 16.5, 12.5, head);
    ctx.fillStyle = ear;
    ctx.beginPath(); ctx.moveTo(13, -43); ctx.quadraticCurveTo(22, -42, 20, -34); ctx.quadraticCurveTo(17, -37, 10, -40); ctx.closePath(); ctx.fill(); ctx.stroke();
    // nếp nhăn trán
    ctx.strokeStyle = shade(head, -0.3); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(1, -42); ctx.quadraticCurveTo(4, -43.5, 7, -42); ctx.moveTo(2, -40); ctx.quadraticCurveTo(4, -41, 6, -40); ctx.stroke();
    // má xệ
    blob(ctx, 2.5, -25.5, 7, 5.6, muz); blob(ctx, 13.5, -25.5, 7, 5.6, muz);
    eyes2(ctx, P, -1, -35, 9.5, -35.5, 3.7, 4.4, { lidColor: head, lid: P.eyes === 'open' ? 0.22 : 0 });
    // lông mày cau có (nhưng mắt hiền)
    var up = P.state === 'wave' || P.state === 'victory' ? 2 : 0;
    limb(ctx, -5, -42 + up * 0.5, 2, -40 - up, 2, shade(head, -0.45));
    limb(ctx, 6, -40.5 - up, 13.5, -42.5 + up * 0.5, 2, shade(head, -0.45));
    // mũi đen to
    blob(ctx, 8.5, -30.5, 4.8, 3.2, '#2a2230');
    circle(ctx, 9.6, -31.6, 1.2, '#ffffff');
    // miệng móm + răng nanh nhô
    if (P.mouth === 'open' || P.mouth === 'grin' || P.mouth === 'o' || P.mouth === 'laugh') {
      ellO(ctx, 8, -23, 4.4, 2.6 * P.mouthK + 0.8, MOUTH_IN, 0, 1.1);
      ell(ctx, 8.4, -22, 2.4, 1.1, TONGUE);
    } else {
      ctx.strokeStyle = INK; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(2, -23.5); ctx.quadraticCurveTo(8, -21, 14, -23.5); ctx.stroke();
    }
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = INK; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(4.5, -23); ctx.lineTo(5.5, -26.2); ctx.lineTo(6.6, -22.8); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(10, -22.8); ctx.lineTo(11.1, -26.2); ctx.lineTo(12.2, -23); ctx.closePath(); ctx.fill(); ctx.stroke();
    wearHead(ctx, acc.head, 3, -32, 16.5, 12.5, P);
    if (P.sweat) drawSweat(ctx, -12, -38, 1, P.t * 2);
    ctx.restore();
    var h = arm(ctx, 7, shY, P.armA + P.punch, 10 + P.punch * 3, 6, body, head, { point: P.point, punch: P.punch });
    if (P.swoosh >= 0) drawSwoosh(ctx, h.x - 3, h.y, 12, P);
    ctx.restore();
    if (P.sparkle) drawVictorySparkles(ctx, 2, -36, P);
    if (P.stars) postStars(P);
  }

  // Giáo sư Cú — kính tròn, mũ tốt nghiệp, cầm quả địa cầu.
  function drawGlobe(ctx, x, y, r, t) {
    blob(ctx, x, y, r, r, '#4aa3e8');
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.clip();
    var sh = ((t || 0) * 3) % (r * 2);
    ctx.fillStyle = '#6fc16a';
    ell(ctx, x - r * 0.4 + sh * 0.3, y - r * 0.2, r * 0.45, r * 0.3, '#6fc16a', 0.4);
    ell(ctx, x + r * 0.45 - sh * 0.2, y + r * 0.35, r * 0.35, r * 0.22, '#6fc16a', -0.3);
    ctx.restore();
    strokeEll(ctx, x, y, r, r, INK, 1);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.ellipse(x, y, r * 0.45, r, 0, 0, TAU); ctx.stroke();
  }
  function drawOwl(ctx, c, P, acc) {
    var body = c.body, head = c.head || body, face = c.muzzle || '#f4e3c8', feet = c.feet || '#f2a33a';
    applyBase(ctx, P, 14);
    // chân
    var fl = P.liftA, fb = P.liftB;
    ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
    for (var i = 0; i < 2; i++) {
      var fx = i ? 5 + P.legA * 4 : -5 + P.legB * 4, fy = -(i ? fl : fb);
      for (var k = -1; k <= 1; k++) limb(ctx, fx, fy - 3, fx + k * 2.4 + 1, fy, 1.6, feet);
    }
    ctx.save(); leanAt(ctx, P, -6);
    wearBack(ctx, acc.back, -12, -22, 16);
    // cánh sau + quả địa cầu
    var hb = wing(ctx, -9, -27, P.armB + 0.15, 13, 7, shade(body, -0.18));
    drawGlobe(ctx, hb.x - 1, hb.y - 2, 5, P.t);
    // thân hình trứng
    blob(ctx, 0, -20, 15, 18.5, body);
    ell(ctx, 3, -15, 9.5, 11.5, face);
    ctx.strokeStyle = shade(face, -0.3); ctx.lineWidth = 0.9;
    for (var r = 0; r < 3; r++) for (var q = 0; q < 2; q++) {
      var vx = q * 5 + (r % 2) * 2.5, vy = -20 + r * 4.5;
      ctx.beginPath(); ctx.moveTo(vx - 1.6, vy); ctx.lineTo(vx, vy + 1.6); ctx.lineTo(vx + 1.6, vy); ctx.stroke();
    }
    wearBody(ctx, acc.body, 0, -20, 15, 18.5);
    wearNeck(ctx, acc.neck, 2, -27, 22, c.accent, P);
    ctx.save(); headAt(ctx, P, 2, -37);
    // túm lông tai
    ctx.fillStyle = shade(head, -0.15); ctx.strokeStyle = INK; ctx.lineWidth = LW; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(-11, -42); ctx.lineTo(-12, -51); ctx.lineTo(-5, -46); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(15, -43); ctx.lineTo(17, -52); ctx.lineTo(9, -47); ctx.closePath(); ctx.fill(); ctx.stroke();
    blob(ctx, 2, -37, 15, 11.5, head);
    // đĩa mặt
    dot(ctx, -3, -37.5, 6.8, face, 1); dot(ctx, 8, -37.5, 6.8, face, 1);
    eyes2(ctx, P, -3, -37.5, 8, -37.5, 4.4, 4.6, { lidColor: face, lid: P.eyes === 'open' ? 0.1 : 0 });
    // kính tròn
    ctx.strokeStyle = c.accent || '#3f6fb5'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(-3, -37.5, 6, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(8, -37.5, 6, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(3, -38.5); ctx.quadraticCurveTo(2.5, -40, 2, -38.5); ctx.stroke();
    // mỏ
    var open = P.mouth === 'open' || P.mouth === 'grin' || P.mouth === 'o' || P.mouth === 'laugh';
    ctx.fillStyle = '#f2a33a'; ctx.strokeStyle = INK; ctx.lineWidth = 1.1; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(0.2, -32.5); ctx.lineTo(5.6, -32.5); ctx.lineTo(3, -27.5 - (open ? 0 : 0.5)); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (open) { ctx.fillStyle = '#d9822a'; ctx.beginPath(); ctx.moveTo(1.2, -30); ctx.lineTo(4.8, -30); ctx.lineTo(3, -26 + P.mouthK * -0.5); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    wearHead(ctx, acc.head, 2, -37, 15, 11.5, P, acc.head === 'gradcap' ? '#ffc94a' : null);
    if (P.sweat) drawSweat(ctx, -12, -40, 1, P.t * 2);
    ctx.restore();
    // cánh trước
    var h = wing(ctx, 10, -27, P.armA, 13 + P.punch * 2, 7, body);
    if (P.point) limb(ctx, h.x, h.y, h.x + Math.sin(P.armA) * 4, h.y + Math.cos(P.armA) * 4, 2, shade(body, -0.15));
    ctx.restore();
    if (P.sparkle) drawVictorySparkles(ctx, 2, -36, P);
    if (P.stars) postStars(P);
  }

  // Rô-bốt Bíp — rô-bốt tròn, ăng-ten, màn hình mặt cười.
  function drawRobot(ctx, c, P, acc) {
    var body = c.body, head = c.head || shade(body, 0.2), dark = c.feet || shade(body, -0.45), screen = c.muzzle || '#7fe0ff', acc2 = c.accent || '#ff7d5c';
    applyBase(ctx, P, 12);
    // chân piston
    var lb = -6 + P.legB * 5, lf = 6 + P.legA * 5;
    limb(ctx, -6, -12, lb, -4 - P.liftB, 4, shade(body, -0.2));
    rrectO(ctx, lb - 5, -5 - P.liftB, 10, 5, 2.5, shade(dark, -0.1));
    limb(ctx, 6, -12, lf, -4 - P.liftA, 4, shade(body, -0.05));
    rrectO(ctx, lf - 5, -5 - P.liftA, 10, 5, 2.5, dark);
    ctx.save(); leanAt(ctx, P, -12);
    wearBack(ctx, acc.back, -13, -22, 16);
    arm(ctx, -12, -27, P.armB, 10, 3.6, shade(body, -0.2), shade(dark, 0.1));
    // thân
    rrectPath(ctx, -13, -32, 26, 21, 9);
    var g = body;
    try { g = ctx.createLinearGradient(-13, -32, 13, -11); g.addColorStop(0, shade(body, 0.3)); g.addColorStop(1, shade(body, -0.15)); } catch (e) { g = body; }
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = LW; ctx.stroke();
    // bảng đèn trên ngực (nhấp nháy)
    rrectO(ctx, -7, -27, 14, 8, 3, '#2b3a50', 1);
    var lights = ['#ff7d5c', '#7fe0ff', '#ffd84a'];
    for (var i = 0; i < 3; i++) {
      var on = Math.sin(P.t * 6 + i * 2.1) > -0.2;
      circle(ctx, -3.6 + i * 3.6, -23, 1.3, on ? lights[i] : shade(lights[i], -0.5));
    }
    rrect(ctx, -9, -16, 18, 2, 1, shade(body, -0.25));
    wearBody(ctx, acc.body, 0, -21, 13, 10);
    wearNeck(ctx, acc.neck, 0, -33, 16, null, P);
    ctx.save(); headAt(ctx, P, 0, -43);
    // ăng-ten
    var sway = P.ant * 2;
    limb(ctx, 0, -52, sway, -59, 1.4, dark);
    var blinkOn = Math.sin(P.t * 5) > 0;
    dot(ctx, sway, -60, 2.6, blinkOn ? acc2 : shade(acc2, -0.3), 1);
    if (blinkOn) { ctx.save(); ctx.globalAlpha *= 0.35; circle(ctx, sway, -60, 4.5, acc2); ctx.restore(); }
    // tai bu-lông
    dot(ctx, -15, -43, 3, c.ear || shade(body, -0.3)); dot(ctx, 15, -43, 3, c.ear || shade(body, -0.3));
    // đầu + màn hình
    rrectPath(ctx, -14, -53, 28, 20, 8);
    var g2 = head;
    try { g2 = ctx.createLinearGradient(-14, -53, 14, -33); g2.addColorStop(0, shade(head, 0.3)); g2.addColorStop(1, shade(head, -0.12)); } catch (e) { g2 = head; }
    ctx.fillStyle = g2; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = LW; ctx.stroke();
    rrectO(ctx, -11, -50.5, 22, 14.5, 5, '#1b2a3d', 1);
    // mặt trên màn hình
    ctx.strokeStyle = screen; ctx.fillStyle = screen; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    var ex = [-4.5, 5], eyY = -45.5 + (P.lookY || 0) * 1.5, lk = P.look == null ? 0.6 : P.look * 0.8;
    for (var e = 0; e < 2; e++) {
      var x = ex[e] + lk;
      ctx.beginPath();
      switch (P.eyes) {
        case 'happy': ctx.arc(x, eyY + 1.2, 2.2, 1.15 * Math.PI, 1.85 * Math.PI); ctx.stroke(); break;
        case 'closed': case 'half': ctx.moveTo(x - 2, eyY + 0.5); ctx.lineTo(x + 2, eyY + 0.5); ctx.stroke(); break;
        case 'hurt': ctx.moveTo(x - 2, eyY - 1.6); ctx.lineTo(x + 1, eyY); ctx.lineTo(x - 2, eyY + 1.6); ctx.stroke(); break;
        case 'x': ctx.moveTo(x - 1.8, eyY - 1.8); ctx.lineTo(x + 1.8, eyY + 1.8); ctx.moveTo(x + 1.8, eyY - 1.8); ctx.lineTo(x - 1.8, eyY + 1.8); ctx.stroke(); break;
        case 'spiral': ctx.arc(x, eyY, 2, 0, TAU * 0.8); ctx.stroke(); break;
        case 'wide': ctx.arc(x, eyY, 2.6, 0, TAU); ctx.stroke(); circle(ctx, x, eyY, 1, screen); break;
        default: rrect(ctx, x - 1.6, eyY - 2.4, 3.2, 4.8, 1.6, screen);
      }
    }
    var mo = P.mouth, my = -40;
    ctx.beginPath();
    if (mo === 'open' || mo === 'grin' || mo === 'laugh') {
      // sóng âm khi nói
      ctx.moveTo(-5, my);
      for (var w = 1; w <= 8; w++) ctx.lineTo(-5 + w * 1.25, my + (w % 2 ? -1 : 1) * 1.6 * (P.mouthK || 1));
      ctx.stroke();
    } else if (mo === 'o') { ctx.arc(0.5, my, 1.6, 0, TAU); ctx.stroke(); }
    else if (mo === 'hmm' || mo === 'wobble') { ctx.moveTo(-3, my); ctx.lineTo(3, my - 0.6); ctx.stroke(); }
    else { ctx.arc(0.5, my - 2.5, 4, 0.25 * Math.PI, 0.75 * Math.PI); ctx.stroke(); }
    ell(ctx, -7.5, -48.5, 2, 1, 'rgba(255,255,255,0.35)', -0.4);
    wearHead(ctx, acc.head, 0, -43, 14, 10, P);
    if (P.sweat) drawSweat(ctx, -15, -50, 1, P.t * 2);
    ctx.restore();
    var h = arm(ctx, 12, -27, P.armA, 10 + P.punch * 3, 3.6, body, shade(dark, 0.2), { point: P.point, punch: P.punch });
    if (P.swoosh >= 0) drawSwoosh(ctx, h.x - 3, h.y, 12, P);
    ctx.restore();
    if (P.sparkle) drawVictorySparkles(ctx, 0, -40, P);
    if (P.stars) postStars(P);
  }

  // Ong Vàng — bay lơ lửng, cánh đập nhanh.
  function drawBee(ctx, c, P, acc) {
    var body = c.body || '#ffd23f', stripe = c.accent || INK;
    var hover = -6 + Math.sin(P.t * 4) * 1.6;
    ctx.translate(P.shakeX, P.by + hover);
    if (P.rot) ctx.rotate(P.rot * 0.6);
    ctx.scale(P.sx, P.sy);
    ctx.save(); leanAt(ctx, P, -12);
    // cánh (sau)
    var flap = 0.45 + 0.55 * Math.abs(Math.sin(P.flap));
    ctx.save(); ctx.globalAlpha *= 0.75;
    ellO(ctx, -5, -24, 4.5, 7 * flap, '#e8f7ff', -0.5, 1);
    ctx.restore();
    // chân tí hon
    limb(ctx, -2, -7, -3 + P.legB * 2, -3, 1.4, INK);
    limb(ctx, 3, -7, 3 + P.legA * 2, -3, 1.4, INK);
    // thân sọc
    blob(ctx, -1, -14, 11, 9, body);
    ctx.save();
    ctx.beginPath(); ctx.ellipse(-1, -14, 11, 9, 0, 0, TAU); ctx.clip();
    ctx.fillStyle = stripe;
    ctx.fillRect(-9, -24, 3.2, 20); ctx.fillRect(-3.2, -24, 3.2, 20);
    ctx.restore();
    strokeEll(ctx, -1, -14, 11, 9, INK, LW);
    // ngòi tí xíu (tròn, không đáng sợ)
    dot(ctx, -12.5, -13, 1.6, '#ffe9a8', 1);
    wearBody(ctx, acc.body, -1, -14, 11, 9);
    wearNeck(ctx, acc.neck, 3, -7, 12, null, P);
    // anten
    ctx.save(); headAt(ctx, P, 5, -16);
    limb(ctx, 4, -22, 3 + P.ant * 2, -29, 1.2, INK); dot(ctx, 3 + P.ant * 2, -29.5, 1.6, body, 1);
    limb(ctx, 8, -22, 9 + P.ant * 2, -29, 1.2, INK); dot(ctx, 9 + P.ant * 2, -29.5, 1.6, body, 1);
    eyes2(ctx, P, 3.5, -16.5, 8.5, -16.5, 2.5, 3.2, { lidColor: body });
    ell(ctx, 10.5, -11.5, 1.6, 1.1, BLUSH);
    drawMouth(ctx, 7, -12, P.mouth, 0.6, P.mouthK);
    wearHead(ctx, acc.head, 5, -16, 7, 7, P);
    ctx.restore();
    // cánh (trước)
    ctx.save(); ctx.globalAlpha *= 0.85;
    ellO(ctx, 0, -25, 5, 8 * flap, '#ffffff', 0.35, 1);
    ctx.restore();
    // tay ngắn
    arm(ctx, 5, -11, P.armA, 5, 2, body, body, { point: P.point });
    ctx.restore();
    if (P.stars) postStars(P);
  }

  // Bọ Rùa — mai đỏ chấm đen, đầu đen mắt to.
  function drawLadybug(ctx, c, P, acc) {
    var shell = c.body || '#e5484d', headC = c.head || INK;
    var moving = P.moving;
    ctx.translate(P.shakeX, P.by * 0.5 + (moving ? -Math.abs(Math.sin(P.ph)) * 1.2 : 0));
    if (P.rot) ctx.rotate(P.rot);
    ctx.scale(P.sx, P.sy);
    var raise = raiseOf(P);
    for (var i = 0; i < 3; i++) {
      var hx = -7 + i * 7, sw = moving ? Math.sin(P.ph + i * 2) * 3 : 0;
      var fx = hx + sw + (i - 1) * 2, fy = 0;
      if (i === 2 && raise > 0) { fx = hx + 6 * raise; fy = -9 * raise + Math.sin(P.wave) * raise; }
      limb(ctx, hx, -5, fx, fy, 1.6, '#2b2f45');
    }
    // mai
    blob(ctx, -2, -10, 13, 9.5, shell);
    seg(ctx, -2, -19.5, -2, -0.8, 1.2, INK);
    var spots = [[-8, -12, 2.4], [-6, -5, 1.8], [3, -13, 2.2], [4, -5.5, 1.8], [-2, -16, 1.6]];
    for (var s = 0; s < spots.length; s++) circle(ctx, spots[s][0], spots[s][1], spots[s][2], INK);
    ell(ctx, -6, -15.5, 3.2, 1.3, 'rgba(255,255,255,0.55)', -0.3);
    wearBack(ctx, acc.back, -8, -13, 8);
    // đầu
    ctx.save(); headAt(ctx, P, 12, -9);
    limb(ctx, 13, -14, 12 + P.ant * 2, -20, 1, INK); dot(ctx, 12 + P.ant * 2, -20.5, 1.2, INK, 0.6);
    limb(ctx, 15, -14, 17 + P.ant * 2, -19.5, 1, INK); dot(ctx, 17 + P.ant * 2, -20, 1.2, INK, 0.6);
    blob(ctx, 12, -9, 6.6, 6.2, headC);
    eyes2(ctx, P, 10.6, -10.5, 15, -10.5, 2.4, 3, { lidColor: headC });
    ell(ctx, 16.5, -6.5, 1.5, 1, BLUSH);
    ctx.save(); ctx.translate(0, 0);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.1; ctx.lineCap = 'round';
    if (P.mouth === 'open' || P.mouth === 'o' || P.mouth === 'grin') ellO(ctx, 14.5, -5.6, 1.4, 1.3, MOUTH_IN, 0, 0.8);
    else { ctx.beginPath(); ctx.arc(14.2, -7, 1.8, 0.2 * Math.PI, 0.85 * Math.PI); ctx.stroke(); }
    ctx.restore();
    wearHead(ctx, acc.head, 12, -9, 6.6, 6.2, P);
    ctx.restore();
    if (P.stars) postStars(P);
  }

  // Giọt Nước — giọt nước tí hon có mặt cười.
  function drawDroplet(ctx, c, P, acc) {
    var col = c.body || '#6cc6f2';
    applyBase(ctx, P, 10);
    // chân tí hon
    blob(ctx, -5 + P.legB * 3, -1.5 - P.liftB, 3.4, 2, shade(col, -0.25));
    blob(ctx, 5 + P.legA * 3, -1.5 - P.liftA, 3.4, 2, shade(col, -0.2));
    ctx.save(); leanAt(ctx, P, -6);
    arm(ctx, -10, -15, P.armB, 6, 2.4, shade(col, -0.1), shade(col, 0.1));
    // thân giọt nước
    var wob = Math.sin(P.wave) * 1.2;
    ctx.beginPath();
    ctx.moveTo(0 + wob, -36);
    ctx.bezierCurveTo(4 + wob, -28, 13, -23, 13, -13);
    ctx.bezierCurveTo(13, -5, 7, -2, 0, -2);
    ctx.bezierCurveTo(-7, -2, -13, -5, -13, -13);
    ctx.bezierCurveTo(-13, -23, -4 + wob, -28, 0 + wob, -36);
    ctx.closePath();
    var g = col;
    try { g = ctx.createRadialGradient(-4, -18, 1, 0, -14, 16); g.addColorStop(0, shade(col, 0.45)); g.addColorStop(0.6, col); g.addColorStop(1, shade(col, -0.2)); } catch (e) { g = col; }
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = LW; ctx.stroke();
    ell(ctx, -6, -21, 2, 4, 'rgba(255,255,255,0.75)', 0.4);
    circle(ctx, -4, -27, 1.2, 'rgba(255,255,255,0.75)');
    wearBody(ctx, acc.body, 0, -12, 11, 9);
    ctx.save(); headAt(ctx, P, 1, -14);
    eyes2(ctx, P, -3, -15, 5, -15, 2.6, 3.4, { lidColor: col });
    ell(ctx, -6.5, -10.5, 2, 1.2, BLUSH); ell(ctx, 8.5, -10.5, 2, 1.2, BLUSH);
    drawMouth(ctx, 1.5, -10.5, P.mouth, 0.7, P.mouthK);
    wearHead(ctx, acc.head, 0, -20, 9, 12, P);
    ctx.restore();
    wearNeck(ctx, acc.neck, 0, -6, 16, null, P);
    arm(ctx, 10, -15, P.armA, 6, 2.4, col, shade(col, 0.15), { point: P.point });
    ctx.restore();
    if (P.stars) postStars(P);
  }

  // Trâu Con — trâu hiền, sừng cong.
  function drawBuffalo(ctx, c, P, acc) {
    var body = c.body, head = c.head || body, dark = c.feet || shade(body, -0.35), horn = c.accent || '#f2e6c9', muz = c.muzzle || '#9aa0ad';
    var raise = raiseOf(P);
    applyBase(ctx, P, 12);
    var xs = [-15, -10, 9, 14];
    legs4(ctx, P, xs, -15, 5, shade(body, -0.05), dark, 'far', raise);
    ctx.save(); leanAt(ctx, P, -15);
    // đuôi
    limb(ctx, -19, -24, -23 + Math.sin(P.wave) * 2, -14, 1.6, dark);
    dot(ctx, -23 + Math.sin(P.wave) * 2, -13, 1.8, INK, 0.8);
    wearBack(ctx, acc.back, -6, -28, 14);
    blob(ctx, -2, -22, 20, 11, body);
    ell(ctx, 0, -17, 13, 4.5, shade(body, 0.12));
    wearBody(ctx, acc.body, -2, -22, 20, 11);
    ctx.restore();
    legs4(ctx, P, xs, -15, 5, body, dark, 'near', raise);
    ctx.save(); leanAt(ctx, P, -15);
    wearNeck(ctx, acc.neck, 14, -22, 12, null, P);
    ctx.save(); headAt(ctx, P, 18, -28);
    // sừng cong lưỡi liềm
    ctx.fillStyle = horn; ctx.strokeStyle = INK; ctx.lineWidth = LW; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(12, -34); ctx.quadraticCurveTo(2, -36, 4, -45); ctx.quadraticCurveTo(7, -38, 14, -37); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(22, -35); ctx.quadraticCurveTo(31, -37, 30, -46); ctx.quadraticCurveTo(26, -39, 20, -38); ctx.closePath(); ctx.fill(); ctx.stroke();
    // tai
    blob(ctx, 10, -31, 4, 2.2, shade(head, -0.1), 0.4);
    blob(ctx, 27, -32, 4, 2.2, shade(head, -0.1), -0.4);
    blob(ctx, 18, -28, 10, 9, head);
    blob(ctx, 21, -22.5, 7, 5, muz);
    circle(ctx, 18.5, -23, 1, INK); circle(ctx, 23.5, -23, 1, INK);
    eyes2(ctx, P, 14.5, -31, 21, -31.5, 2.6, 3.2, { lidColor: head, lid: P.eyes === 'open' ? 0.25 : 0 });
    ell(ctx, 12, -26, 1.8, 1.1, BLUSH); ell(ctx, 26, -26, 1.8, 1.1, BLUSH);
    if (P.mouth === 'open' || P.mouth === 'grin' || P.mouth === 'o' || P.mouth === 'laugh') ellO(ctx, 21, -19.5, 2.4, 1.2 + P.mouthK, MOUTH_IN, 0, 1);
    else { ctx.strokeStyle = INK; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.arc(21, -21.5, 2.6, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke(); }
    wearHead(ctx, acc.head, 18, -30, 10, 8, P);
    if (P.sweat) drawSweat(ctx, 9, -36, 1, P.t * 2);
    ctx.restore();
    ctx.restore();
    if (P.sparkle) drawVictorySparkles(ctx, 10, -36, P);
    if (P.stars) postStars(P);
  }

  // Rùa Vàng — cụ rùa hiền từ ở Hồ Gươm, mai vàng, râu bạc.
  function drawTurtle(ctx, c, P, acc) {
    var shell = c.body || '#7fb069', skin = c.head || '#a7c957', gold = c.accent || '#e9c46a';
    var raise = raiseOf(P);
    applyBase(ctx, P, 10);
    var xs = [-12, -8, 7, 11];
    legs4(ctx, P, xs, -8, 5.5, shade(skin, -0.05), shade(skin, -0.3), 'far', raise);
    // đuôi
    limb(ctx, -17, -8, -21, -6, 2.4, skin);
    // cổ + đầu
    ctx.save(); headAt(ctx, P, 18, -16);
    limb(ctx, 10, -10, 16, -14, 5.5, skin);
    blob(ctx, 18.5, -16, 6.8, 6, skin);
    eyes2(ctx, P, 17, -18, 21.5, -18, 2.2, 2.7, { lidColor: skin, lid: P.eyes === 'open' ? 0.35 : 0 });
    // lông mày + râu bạc
    seg(ctx, 15.5, -21.5, 18.5, -21.8, 1.2, '#ffffff');
    seg(ctx, 20, -21.8, 23, -21.3, 1.2, '#ffffff');
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = INK; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(19, -12); ctx.quadraticCurveTo(21 + Math.sin(P.wave) * 0.8, -6, 22.5, -11.5); ctx.closePath(); ctx.fill(); ctx.stroke();
    drawMouth(ctx, 22, -14.5, P.mouth, 0.55, P.mouthK);
    wearHead(ctx, acc.head, 18.5, -16, 6.8, 6, P);
    if (P.sweat) drawSweat(ctx, 13, -22, 0.8, P.t * 2);
    ctx.restore();
    // mai
    ctx.save(); leanAt(ctx, P, -6);
    ctx.fillStyle = shell;
    ctx.beginPath(); ctx.ellipse(-2, -9, 17, 15, 0, Math.PI, TAU); ctx.closePath();
    var g = shell;
    try { g = ctx.createRadialGradient(-7, -18, 2, -2, -10, 18); g.addColorStop(0, shade(shell, 0.3)); g.addColorStop(1, shade(shell, -0.15)); } catch (e) { g = shell; }
    ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = LW; ctx.stroke();
    // vảy mai viền vàng
    ctx.strokeStyle = gold; ctx.lineWidth = 1.4;
    var hexes = [[-2, -16, 4], [-10, -12, 3.5], [6, -12, 3.5], [-2, -9, 3]];
    for (var i = 0; i < hexes.length; i++) {
      var H = hexes[i];
      ctx.beginPath();
      for (var k = 0; k < 6; k++) { var a = k * Math.PI / 3; ctx[k ? 'lineTo' : 'moveTo'](H[0] + Math.cos(a) * H[2], H[1] + Math.sin(a) * H[2] * 0.85); }
      ctx.closePath(); ctx.stroke();
    }
    rrectO(ctx, -19.5, -10, 35, 4, 2, gold, 1);
    wearBack(ctx, acc.back, -10, -18, 10);
    ctx.restore();
    legs4(ctx, P, xs, -8, 5.5, skin, shade(skin, -0.3), 'near', raise);
    if (P.sparkle) drawVictorySparkles(ctx, 0, -24, P);
    if (P.stars) postStars(P);
  }

  // Lân Con — đầu lân to sặc sỡ múa Trung thu.
  function drawLion(ctx, c, P, acc) {
    var red = c.body || '#e63946', yel = c.head || '#ffb703', teal = c.accent || '#2a9d8f';
    applyBase(ctx, P, 14);
    // chân người múa (quần vàng, giày đen)
    legs2(ctx, P, -12, 4, -14, 4.6, yel, INK, 5, 2.6);
    ctx.save(); leanAt(ctx, P, -14);
    // thân vải có tua rua
    var w1 = Math.sin(P.wave) * 2;
    ctx.fillStyle = red; ctx.strokeStyle = INK; ctx.lineWidth = LW; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-2, -36); ctx.quadraticCurveTo(-22, -34 + w1, -26, -18 + w1);
    ctx.lineTo(-2, -14); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = yel;
    for (var f = 0; f < 6; f++) { var fx = -24 + f * 4.2; ctx.beginPath(); ctx.arc(fx, -16 + w1 * (1 - f / 6), 2.2, 0, Math.PI); ctx.fill(); ctx.stroke(); }
    ctx.strokeStyle = yel; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-6, -32); ctx.quadraticCurveTo(-16, -30 + w1, -20, -21 + w1); ctx.stroke();
    // đầu lân
    var open = P.mouth === 'open' || P.mouth === 'grin' || P.mouth === 'laugh' || P.mouth === 'o' ? (P.mouthK || 1) : 0;
    var nod = P.state === 'victory' || P.state === 'wave' ? Math.sin(P.wave) * 0.12 : 0;
    ctx.save(); ctx.translate(8, -30 + P.headY); ctx.rotate((P.tilt || 0) + nod); ctx.translate(-8, 30);
    // bờm tua
    var mane = [red, teal, yel];
    for (var m = 0; m < 9; m++) {
      var a = -2.8 + m * 0.42;
      dot(ctx, 8 + Math.cos(a) * 18, -31 + Math.sin(a) * 15, 3.6, mane[m % 3], 1);
    }
    blob(ctx, 8, -30, 17, 14.5, yel);
    // trán đỏ + sừng
    ctx.fillStyle = red;
    ctx.beginPath(); ctx.ellipse(8, -38, 11, 6, 0, Math.PI, TAU); ctx.closePath(); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke();
    dot(ctx, 8, -46, 2.4, teal, 1);
    // gương trên trán
    dot(ctx, 8, -39, 2.2, '#e8f7ff', 0.9);
    // lông mày bông trắng
    ellO(ctx, 2, -35.5, 4.5, 2, '#ffffff', -0.2, 1); ellO(ctx, 15, -36, 4.5, 2, '#ffffff', 0.2, 1);
    // mắt to tròn có mi
    eyes2(ctx, P, 2.5, -31, 14.5, -31, 4, 4.4, { lashes: true, lidColor: yel });
    // mũi đỏ tròn
    blob(ctx, 9, -25, 3.6, 3, red);
    // hàm (há khi nói)
    var jy = -19 + open * 4;
    ctx.fillStyle = MOUTH_IN;
    ctx.beginPath(); ctx.moveTo(-2, -21); ctx.quadraticCurveTo(9, jy + 4, 20, -21); ctx.quadraticCurveTo(9, -18.5, -2, -21); ctx.closePath(); ctx.fill(); ctx.stroke();
    rrect(ctx, 1, -21, 16, 1.8, 0.8, '#ffffff');
    blob(ctx, 9, jy + 2.5, 10, 3, yel);
    // râu
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(4, jy + 4.5); ctx.quadraticCurveTo(5, jy + 9, 3, jy + 12); ctx.moveTo(14, jy + 4.5); ctx.quadraticCurveTo(13, jy + 9, 15, jy + 12); ctx.stroke();
    // má hồng
    ell(ctx, -3, -25, 2.6, 1.6, BLUSH); ell(ctx, 21, -25, 2.6, 1.6, BLUSH);
    wearHead(ctx, acc.head, 8, -30, 17, 14.5, P);
    if (P.sweat) drawSweat(ctx, -8, -40, 1, P.t * 2);
    ctx.restore();
    ctx.restore();
    if (P.sparkle) drawVictorySparkles(ctx, 6, -38, P);
    if (P.stars) postStars(P);
  }

  // Lạc Đà — một bướu, mắt lim dim, môi dày cười hiền.
  function drawCamel(ctx, c, P, acc) {
    var body = c.body || '#d4a373', head = c.head || shade(body, 0.1), dark = c.accent || '#9c6644';
    var raise = raiseOf(P);
    applyBase(ctx, P, 12);
    var xs = [-16, -11, 9, 14];
    legs4(ctx, P, xs, -28, 4.2, shade(body, -0.05), dark, 'far', raise);
    ctx.save(); leanAt(ctx, P, -28);
    limb(ctx, -20, -34, -23 + Math.sin(P.wave) * 1.5, -24, 1.5, dark);
    wearBack(ctx, acc.back, -14, -42, 12);
    // bướu + thân
    blob(ctx, -4, -42, 10, 8.5, body);
    blob(ctx, -2, -33, 19, 9.5, body);
    ell(ctx, -1, -28.5, 12, 3.6, shade(body, 0.15));
    wearBody(ctx, acc.body, -2, -33, 19, 9.5);
    // chăn sặc sỡ trên lưng
    rrectO(ctx, -12, -42, 18, 5, 2, '#e5484d', 1);
    for (var s = 0; s < 4; s++) circle(ctx, -9 + s * 4.5, -39.5, 0.9, '#ffd84a');
    ctx.restore();
    legs4(ctx, P, xs, -28, 4.2, body, dark, 'near', raise);
    ctx.save(); leanAt(ctx, P, -28);
    // cổ cong
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(12, -34); ctx.quadraticCurveTo(22, -38, 21, -48);
    ctx.strokeStyle = INK; ctx.lineWidth = 9 + LW * 2; ctx.stroke();
    ctx.strokeStyle = body; ctx.lineWidth = 9; ctx.stroke();
    wearNeck(ctx, acc.neck, 19, -40, 11, null, P);
    ctx.save(); headAt(ctx, P, 25, -51);
    blob(ctx, 20, -55, 2.6, 4, shade(head, -0.1), -0.3);   // tai
    blob(ctx, 25, -51, 8.5, 6.5, head);
    blob(ctx, 31, -48.5, 5, 4.5, shade(head, 0.08));      // mõm
    circle(ctx, 33.5, -50, 0.9, INK);
    eyes2(ctx, P, 22.5, -53.5, 27, -53.5, 2.4, 3, { lidColor: head, lid: P.eyes === 'open' ? 0.45 : 0, lashes: true });
    // môi dày
    if (P.mouth === 'open' || P.mouth === 'grin' || P.mouth === 'o' || P.mouth === 'laugh') ellO(ctx, 31, -45.5, 2.6, 1 + P.mouthK, MOUTH_IN, 0, 1);
    else { ctx.strokeStyle = INK; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(28, -46); ctx.quadraticCurveTo(31.5, -44, 35, -46.5); ctx.stroke(); }
    wearHead(ctx, acc.head, 25, -51, 8.5, 6.5, P);
    if (P.sweat) drawSweat(ctx, 17, -57, 0.9, P.t * 2);
    ctx.restore();
    ctx.restore();
    if (P.sparkle) drawVictorySparkles(ctx, 10, -48, P);
    if (P.stars) postStars(P);
  }

  // Chim Toucan — thân đen, mỏ khổng lồ cam vàng.
  function drawToucan(ctx, c, P, acc) {
    var body = c.body || '#1d1d2c', beak = c.accent || '#ff9f1c';
    applyBase(ctx, P, 10);
    for (var i = 0; i < 2; i++) {
      var fx = i ? 3 + P.legA * 3 : -3 + P.legB * 3, fy = -(i ? P.liftA : P.liftB);
      limb(ctx, fx, fy - 4, fx, fy - 1, 1.6, '#4a7bd0');
      limb(ctx, fx - 1.5, fy - 1, fx + 2.5, fy - 1, 1.4, '#4a7bd0');
    }
    ctx.save(); leanAt(ctx, P, -5);
    // đuôi
    ctx.fillStyle = body; ctx.strokeStyle = INK; ctx.lineWidth = LW;
    ctx.beginPath(); ctx.moveTo(-8, -10); ctx.lineTo(-15, -2); ctx.lineTo(-10, -1); ctx.lineTo(-4, -7); ctx.closePath(); ctx.fill(); ctx.stroke();
    wearBack(ctx, acc.back, -9, -16, 10);
    wing(ctx, -6, -21, P.armB + 0.2, 11, 5.5, shade(body, 0.12));
    blob(ctx, -1, -15, 9.5, 12.5, body);
    blob(ctx, 3, -20, 6, 6.5, '#fff3b0', 0, 1);
    wearBody(ctx, acc.body, -1, -15, 9.5, 12.5);
    wearNeck(ctx, acc.neck, 1, -22, 14, null, P);
    ctx.save(); headAt(ctx, P, 2, -27);
    blob(ctx, 2, -27, 8, 7.5, body);
    dot(ctx, 5, -28.5, 3.8, '#52c5ee', 1);
    eyes2(ctx, { eyes: P.eyes, look: P.look, lookY: P.lookY }, 5, -28.5, 5, -28.5, 2.2, 2.4, { lidColor: '#52c5ee' });
    // mỏ khổng lồ (há khi nói)
    var open = P.mouth === 'open' || P.mouth === 'grin' || P.mouth === 'o' || P.mouth === 'laugh' ? (P.mouthK || 1) : 0;
    ctx.save(); ctx.translate(8.5, -27); ctx.rotate(open * 0.25);
    ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = INK; ctx.lineWidth = LW;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(9, 1, 15, 3.5); ctx.quadraticCurveTo(8, 3.5, 0, 3.6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.save(); ctx.translate(8.5, -27); ctx.rotate(-open * 0.1);
    ctx.fillStyle = beak;
    ctx.beginPath(); ctx.moveTo(0, -4.2); ctx.quadraticCurveTo(10, -6, 16.5, 2.5); ctx.quadraticCurveTo(9, 1.2, 0, 1.2); ctx.closePath(); ctx.fill(); ctx.stroke();
    ell(ctx, 14.5, 0.5, 2, 1.6, '#e5484d');
    ell(ctx, 5, -3, 3.5, 0.9, 'rgba(255,255,255,0.5)', -0.1);
    ctx.restore();
    wearHead(ctx, acc.head, 1, -27, 8, 7.5, P);
    ctx.restore();
    var h = wing(ctx, 4, -21, P.armA, 11, 5.5, shade(body, 0.2));
    void h;
    ctx.restore();
    if (P.sparkle) drawVictorySparkles(ctx, 2, -30, P);
    if (P.stars) postStars(P);
  }

  // Chim Cánh Cụt — lạch bạch, bụng trắng, mỏ cam.
  function drawPenguin(ctx, c, P, acc) {
    var body = c.body || '#22303f', belly = c.muzzle || '#ffffff', orange = c.accent || '#ffb703';
    applyBase(ctx, P, 12);
    ellO(ctx, -5 + P.legB * 2, -1.8 - P.liftB, 5, 2.2, shade(orange, -0.1));
    ellO(ctx, 5 + P.legA * 2, -1.8 - P.liftA, 5, 2.2, orange);
    ctx.save(); leanAt(ctx, P, -6);
    wearBack(ctx, acc.back, -11, -20, 14);
    wing(ctx, -10, -25, P.armB - 0.15, 12, 5, shade(body, -0.1));
    blob(ctx, 0, -19, 13, 18, body);
    blob(ctx, 3, -15, 9, 13, belly, 0, 0);
    wearBody(ctx, acc.body, 0, -19, 13, 18);
    wearNeck(ctx, acc.neck, 1, -26, 20, '#e5484d', P);
    ctx.save(); headAt(ctx, P, 2, -31);
    // mắt trên mảng trắng
    ell(ctx, 0, -31, 4.2, 4.6, belly); ell(ctx, 8, -31, 4.2, 4.6, belly);
    eyes2(ctx, P, 0, -31, 8, -31, 2.6, 3.2, { lidColor: belly });
    ell(ctx, -3, -26, 2, 1.2, BLUSH); ell(ctx, 12, -26, 2, 1.2, BLUSH);
    var open = P.mouth === 'open' || P.mouth === 'grin' || P.mouth === 'o' || P.mouth === 'laugh';
    ctx.fillStyle = orange; ctx.strokeStyle = INK; ctx.lineWidth = 1.1; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(3, -28.5); ctx.lineTo(10, -27); ctx.lineTo(3, -25.5 + (open ? -0.5 : 0)); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (open) { ctx.beginPath(); ctx.moveTo(3, -25); ctx.lineTo(8.5, -24.5 + P.mouthK); ctx.lineTo(3, -23.5); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    wearHead(ctx, acc.head, 2, -31, 12, 8, P);
    if (P.sweat) drawSweat(ctx, -9, -36, 1, P.t * 2);
    ctx.restore();
    wing(ctx, 9, -25, P.armA + 0.1, 12, 5, shade(body, 0.1));
    ctx.restore();
    if (P.sparkle) drawVictorySparkles(ctx, 1, -32, P);
    if (P.stars) postStars(P);
  }

  // Gấu Bắc Cực — to xác mà hiền, khăn quàng đỏ.
  function drawPolarBear(ctx, c, P, acc) {
    var fur = c.body || '#f4f7fb', head = c.head || '#ffffff', shadeC = c.accent || '#9fb4c8';
    applyBase(ctx, P, 16);
    legs2(ctx, P, -10, 10, -11, 9, shade(fur, -0.05), shade(fur, -0.08), 8.5, 4.5);
    ctx.save(); leanAt(ctx, P, -11);
    wearBack(ctx, acc.back, -18, -24, 20);
    arm(ctx, -15, -28, P.armB, 12, 8, shade(fur, -0.08), shade(fur, -0.05));
    blob(ctx, 0, -20, 21, 16, fur);
    ell(ctx, 3, -17, 12, 10, shade(fur, 0.5));
    strokeEll(ctx, 3, -17, 12, 10, 'rgba(159,180,200,0.6)', 1);
    wearBody(ctx, acc.body, 0, -20, 21, 16);
    wearNeck(ctx, acc.neck || 'scarf', 4, -32, 26, '#e5484d', P);
    ctx.save(); headAt(ctx, P, 6, -38);
    dot(ctx, -4, -47, 4.4, fur); dot(ctx, 16, -47.5, 4.4, fur);
    circle(ctx, -4, -47, 2.2, shadeC); circle(ctx, 16, -47.5, 2.2, shadeC);
    blob(ctx, 6, -38, 14, 11.5, head);
    blob(ctx, 11, -33, 7, 5, '#ffffff');
    blob(ctx, 14, -35, 3, 2.2, INK);
    circle(ctx, 14.8, -35.6, 0.8, '#ffffff');
    eyes2(ctx, P, 2.5, -41, 10.5, -41.5, 2.6, 3.2, { lidColor: head });
    ell(ctx, -1.5, -35, 2.6, 1.6, BLUSH); ell(ctx, 18, -35, 2.2, 1.4, BLUSH);
    drawMouth(ctx, 12, -31.5, P.mouth, 0.75, P.mouthK);
    wearHead(ctx, acc.head, 6, -38, 14, 11.5, P);
    if (P.sweat) drawSweat(ctx, -8, -44, 1, P.t * 2);
    ctx.restore();
    var h = arm(ctx, 13, -28, P.armA, 12 + P.punch * 3, 8, fur, '#ffffff', { point: P.point, punch: P.punch });
    if (P.swoosh >= 0) drawSwoosh(ctx, h.x - 3, h.y, 14, P);
    ctx.restore();
    if (P.sparkle) drawVictorySparkles(ctx, 4, -40, P);
    if (P.stars) postStars(P);
  }

  // Khủng Long Con — khủng long ăn cỏ dễ thương, gai lưng vàng.
  function drawDino(ctx, c, P, acc) {
    var body = c.body || '#7ed957', head = c.head || shade(body, 0.08), plate = c.accent || '#ffd23f';
    applyBase(ctx, P, 13);
    legs2(ctx, P, -6, 6, -10, 7, shade(body, -0.06), shade(body, -0.2), 7, 3.8);
    ctx.save(); leanAt(ctx, P, -10);
    // đuôi
    var tw = Math.sin(P.wave) * 2;
    ctx.fillStyle = body; ctx.strokeStyle = INK; ctx.lineWidth = LW; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(-8, -22); ctx.quadraticCurveTo(-20, -18, -26, -6 + tw); ctx.quadraticCurveTo(-16, -9, -6, -10); ctx.closePath(); ctx.fill(); ctx.stroke();
    // gai lưng
    ctx.fillStyle = plate;
    var plates = [[-17, -14, 0.9], [-11, -21, 1.1], [-4, -28, 1.2], [2, -31, 1]];
    for (var i = 0; i < plates.length; i++) {
      var p = plates[i];
      ctx.beginPath(); ctx.moveTo(p[0] - 3.5 * p[2], p[1] + 2); ctx.lineTo(p[0] - 1, p[1] - 5 * p[2]); ctx.lineTo(p[0] + 3.5 * p[2], p[1] + 2); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    wearBack(ctx, acc.back, -11, -20, 14);
    arm(ctx, -4, -22, P.armB, 6.5, 4, shade(body, -0.12), shade(body, -0.05));
    blob(ctx, 0, -18, 13, 13, body);
    ell(ctx, 4, -15, 7.5, 9.5, shade(plate, 0.45));
    ctx.strokeStyle = shade(plate, -0.15); ctx.lineWidth = 0.9;
    for (var s = 0; s < 3; s++) { ctx.beginPath(); ctx.moveTo(0, -20 + s * 4.5); ctx.quadraticCurveTo(4, -19 + s * 4.5, 9, -20 + s * 4.5); ctx.stroke(); }
    wearBody(ctx, acc.body, 0, -18, 13, 13);
    wearNeck(ctx, acc.neck, 4, -28, 16, null, P);
    ctx.save(); headAt(ctx, P, 8, -35);
    blob(ctx, 7, -35, 12, 10, head);
    blob(ctx, 16, -32.5, 7, 5.6, head);
    circle(ctx, 20, -34.5, 0.9, INK); circle(ctx, 17.8, -35, 0.9, INK);
    eyes2(ctx, P, 4, -38.5, 10.5, -39, 3.4, 4.2, { lidColor: head });
    ell(ctx, 1, -32, 2.4, 1.5, BLUSH);
    drawMouth(ctx, 16, -30, P.mouth, 0.8, P.mouthK);
    wearHead(ctx, acc.head, 7, -35, 12, 10, P);
    if (P.sweat) drawSweat(ctx, -5, -42, 1, P.t * 2);
    ctx.restore();
    var h = arm(ctx, 7, -22, P.armA, 6.5 + P.punch * 2, 4, body, head, { point: P.point, punch: P.punch });
    if (P.swoosh >= 0) drawSwoosh(ctx, h.x - 3, h.y, 10, P);
    ctx.restore();
    if (P.sparkle) drawVictorySparkles(ctx, 4, -36, P);
    if (P.stars) postStars(P);
  }

  // Hồng Cầu — đĩa đỏ lõm giữa, ôm phân tử ô-xy.
  function drawBloodCell(ctx, c, P, acc) {
    var red = c.body || '#e5484d', light = c.head || '#ff6b6b';
    applyBase(ctx, P, 12);
    legs2(ctx, P, -5, 5, -6, 2.6, shade(red, -0.25), shade(red, -0.35), 3.6, 2.2);
    ctx.save(); leanAt(ctx, P, -6);
    // phân tử ô-xy (2 quả cầu xanh) ở tay sau
    var hb = arm(ctx, -12, -19, P.armB, 6, 2.6, shade(red, -0.2), shade(red, -0.05));
    dot(ctx, hb.x - 2.5, hb.y - 1, 2.8, '#7fd0ff', 1); dot(ctx, hb.x + 1.8, hb.y - 2, 2.8, '#7fd0ff', 1);
    wearBack(ctx, acc.back, -12, -18, 12);
    // đĩa lõm
    blob(ctx, 0, -18, 15, 14, red);
    ell(ctx, 0, -18, 9, 8, shade(red, -0.12));
    strokeEll(ctx, 0, -18, 9, 8, shade(red, 0.3), 1.6);
    ell(ctx, -6, -25, 4, 1.8, 'rgba(255,255,255,0.45)', -0.5);
    void light;
    wearBody(ctx, acc.body, 0, -18, 15, 14);
    ctx.save(); headAt(ctx, P, 0, -18);
    eyes2(ctx, P, -4, -21, 4.5, -21, 2.6, 3.3, { lidColor: red });
    ell(ctx, -8.5, -16, 2, 1.3, BLUSH); ell(ctx, 9, -16, 2, 1.3, BLUSH);
    drawMouth(ctx, 0.5, -15.5, P.mouth, 0.75, P.mouthK);
    wearHead(ctx, acc.head, 0, -18, 13, 13, P);
    if (P.sweat) drawSweat(ctx, -13, -28, 0.9, P.t * 2);
    ctx.restore();
    wearNeck(ctx, acc.neck, 0, -6, 16, '#ffffff', P);
    arm(ctx, 12, -19, P.armA, 6, 2.6, red, shade(red, 0.15), { point: P.point });
    ctx.restore();
    if (P.sparkle) drawVictorySparkles(ctx, 0, -24, P);
    if (P.stars) postStars(P);
  }

  // Bảng NPC: w/h thiết kế, hàm vẽ, tâm đầu (tỉ lệ chiều cao từ chân) và vùng hiển thị cho chân dung,
  // màu mặc định (khi OG.Data chưa có), phụ kiện mặc định.
  // 💡 Khái niệm: registry dạng bảng — mỗi NPC là một dòng dữ liệu trỏ tới hàm vẽ của nó (function là giá trị).
  //   renderPose chỉ cần `info.npc.draw(...)`, không có chuỗi if/else theo tên. Thêm NPC = viết 1 hàm + 1 dòng.
  // ⚠️ Bẫy: NPC khai báo bằng `var` ở GIỮA file nhưng charInfo (phía trên) đã dùng. Chạy được vì charInfo chỉ
  //   được GỌI sau khi cả file load xong; nếu gọi charInfo ngay lúc load ở phía trên dòng này, NPC còn undefined.
  var NPC = {
    bob:        { w: 44, h: 46, draw: drawBob, focus: 0.72, span: 0.85, acc: { head: 'nonla', neck: 'scarf' },
      colors: { body: '#c98b52', head: '#d99a5f', ear: '#8a5a32', feet: '#7a4e2b', muzzle: '#f3dcc0', accent: '#e9c46a' } },
    owl:        { w: 40, h: 50, draw: drawOwl, focus: 0.76, span: 0.8, acc: { head: 'gradcap' },
      colors: { body: '#9b7653', head: '#b08a63', ear: '#7a5a3c', feet: '#f2a33a', muzzle: '#f4e3c8', accent: '#3f6fb5' } },
    robot:      { w: 38, h: 52, draw: drawRobot, focus: 0.82, span: 0.75,
      colors: { body: '#9fb4c8', head: '#c6d5e3', ear: '#5d7891', feet: '#4b6178', muzzle: '#7fe0ff', accent: '#ff7d5c' } },
    bee:        { w: 30, h: 30, draw: drawBee, focus: 0.62, span: 1.1, colors: { body: '#ffd23f', head: '#ffd23f', accent: '#17233d' } },
    ladybug:    { w: 30, h: 24, draw: drawLadybug, focus: 0.45, span: 1.25, colors: { body: '#e5484d', head: '#17233d', accent: '#17233d' } },
    droplet:    { w: 28, h: 36, draw: drawDroplet, focus: 0.5, span: 1.0, colors: { body: '#6cc6f2', head: '#8fd6f7', accent: '#ffffff' } },
    buffalo:    { w: 52, h: 44, draw: drawBuffalo, focus: 0.66, span: 0.85,
      colors: { body: '#5b5f6b', head: '#6b707d', ear: '#4a4d57', feet: '#3a3c44', muzzle: '#9aa0ad', accent: '#f2e6c9' } },
    turtle:     { w: 46, h: 34, draw: drawTurtle, focus: 0.5, span: 1.0, colors: { body: '#7fb069', head: '#a7c957', accent: '#e9c46a' } },
    lion_dance: { w: 54, h: 50, draw: drawLion, focus: 0.62, span: 0.9, colors: { body: '#e63946', head: '#ffb703', accent: '#2a9d8f' } },
    camel:      { w: 56, h: 60, draw: drawCamel, focus: 0.72, span: 0.75, colors: { body: '#d4a373', head: '#e0b589', accent: '#9c6644' } },
    toucan:     { w: 30, h: 36, draw: drawToucan, focus: 0.72, span: 0.85, colors: { body: '#1d1d2c', head: '#1d1d2c', accent: '#ff9f1c' } },
    penguin:    { w: 32, h: 42, draw: drawPenguin, focus: 0.68, span: 0.85, colors: { body: '#22303f', head: '#22303f', muzzle: '#ffffff', accent: '#ffb703' } },
    polar_bear: { w: 58, h: 50, draw: drawPolarBear, focus: 0.74, span: 0.75, colors: { body: '#f4f7fb', head: '#ffffff', accent: '#9fb4c8' } },
    dino:       { w: 48, h: 46, draw: drawDino, focus: 0.74, span: 0.8, colors: { body: '#7ed957', head: '#8fe86a', accent: '#ffd23f' } },
    blood_cell: { w: 34, h: 34, draw: drawBloodCell, focus: 0.52, span: 1.0, colors: { body: '#e5484d', head: '#ff6b6b', accent: '#ffffff' } }
  };

  // ---------------------------------------------------------------------------
  // Render theo tư thế (trong hệ toạ độ thiết kế). Trả về {P, post}.
  // ---------------------------------------------------------------------------
  /**
   * Tính Pose rồi gọi đúng bộ vẽ theo info.kind. Hiệu ứng "post" được gom lại, CHƯA vẽ.
   * @param {CanvasRenderingContext2D} ctx  đã đặt gốc tại chân, đơn vị = đơn vị thiết kế
   * @param {CharInfo} info
   * @param {any} colors   bảng màu đã gộp (resolveColors), vd {body, head, feet}
   * @param {any} gfx
   * @param {any} acc
   * @param {string} state
   * @param {number} t      giây
   * @param {boolean} blink đang chớp mắt → ép mắt mở thành nhắm
   * @param {number} loop   chu kỳ thật (giây) từ quantize
   * @returns {{P: Pose, post: Function[]}}
   */
  function renderPose(ctx, info, colors, gfx, acc, state, t, blink, loop) {
    var P = computePose(state, t, info.kind, loop, info.id);
    // Chớp mắt chỉ đè lên các kiểu mắt "mở"; mắt X, xoắn ốc, nhắm vui... giữ nguyên để không mất biểu cảm.
    if (blink && (P.eyes === 'open' || P.eyes === 'wide' || P.eyes === 'squint' || P.eyes === 'half')) P.eyes = 'closed';
    POST = [];
    ctx.save();
    // try/finally: bộ vẽ ném lỗi giữa chừng vẫn restore() đủ → transform của canvas không bị lệch cho frame sau.
    try {
      if (info.kind === 'bug') drawBug(ctx, colors, P, info.spec, info.id, acc);
      else if (info.kind === 'crawler') drawCrawler(ctx, colors, P, acc);
      else if (info.kind === 'npc') info.npc.draw(ctx, colors, P, acc);
      else drawCat(ctx, colors, P, info.style || catStyle('oggy'), gfx || {}, acc);
    } finally {
      ctx.restore();
    }
    var list = POST; POST = null;
    return { P: P, post: list };
  }
  function runPost(ctx, r, info) {
    for (var i = 0; i < r.post.length; i++) {
      ctx.save();
      try { r.post[i](ctx, info, r.P); } catch (e) { report('post', e); }
      ctx.restore();
    }
  }
  // Bóng đổ mềm dưới chân (không vẽ khi đang bay lên/rơi).
  // Hai elip chồng nhau (rộng-nhạt + hẹp-đậm) giả bóng mờ mép mà không cần ctx.filter blur (chậm, không phải
  // trình duyệt nào cũng hỗ trợ). Nhân vật càng nhảy cao (by âm) bóng càng nhỏ và nhạt.
  function drawShadow(ctx, info, P) {
    if (P.state === 'jump' || P.state === 'fall') return;
    var lift = clamp(-(P.by || 0) / 30, 0, 0.6) + (info.id === 'bee' ? 0.35 : 0);
    var rx = info.dw * 0.46 * (1 - lift * 0.6);
    if (P.state === 'dead') rx = Math.max(rx, info.dh * 0.5);
    ell(ctx, 0, -0.5, rx + 3, 3.4, 'rgba(23,35,61,' + (0.1 * (1 - lift)).toFixed(3) + ')');
    ell(ctx, 0, -0.5, rx, 2.4, 'rgba(23,35,61,' + (0.16 * (1 - lift)).toFixed(3) + ')');
  }

  // Chớp mắt mỗi BLINK_PERIOD giây, lệch pha theo nhân vật.
  // Pha suy ra từ id (băm đơn giản bằng mã ký tự) thay vì Math.random → cùng nhân vật luôn chớp đúng nhịp,
  //   kết quả lặp lại được (dễ kiểm thử, dễ dò lỗi), mà hai nhân vật khác nhau thường không chớp cùng lúc.
  function isBlink(clock, id) {
    var seed = 0;
    for (var i = 0; i < id.length; i++) seed += id.charCodeAt(i) * BLINK_SEED_K;
    var p = (clock + seed) % BLINK_PERIOD;
    return p >= 0 && p < BLINK_DUR;
  }

  // ---------------------------------------------------------------------------
  // Cache khung hình (offscreen canvas) — LRU theo ngân sách điểm ảnh
  // ---------------------------------------------------------------------------
  // 💡 Khái niệm: frame cache — vẽ một nhân vật procedural tốn hàng trăm lệnh ctx (cộng 8–12 lần drawImage cho
  //   viền). Thay vì làm lại mỗi frame, ta vẽ MỘT LẦN vào offscreen canvas (canvas phụ tạo bằng
  //   document.createElement('canvas'), không gắn vào trang), rồi các frame sau chỉ cần 1 lệnh drawImage.
  //   Đánh đổi: tốn bộ nhớ → giới hạn bằng LRU (Least Recently Used: khi đầy, bỏ khung lâu nhất chưa dùng).
  // Hai giới hạn vì khung to nhỏ khác nhau: 320 khung nhỏ thì rẻ, nhưng vài khung trùm phóng to đã tốn hàng chục MB.
  // CACHE_MAX / CACHE_MAX_PX là `var` (không phải hằng) vì S.setCacheLimit() đổi được lúc chạy.
  var CACHE_MAX = 320;              // số khung tối đa
  var CACHE_MAX_PX = 16 * 1000 * 1000; // tổng điểm ảnh tối đa, ~64MB RGBA (4 byte/điểm ảnh)
  var cache = {
    // Môi trường không có document (vd Node thuần) → tắt cache, drawCharacter vẽ thẳng lên ctx.
    enabled: typeof document !== 'undefined' && !!document.createElement,
    map: typeof Map === 'function' ? new Map() : null,
    hits: 0, misses: 0, px: 0
  };

  // Canvas tạm được DÙNG LẠI giữa các lần vẽ: tạo canvas mới mỗi frame sẽ sinh rác cho garbage collector
  //   (bộ dọn bộ nhớ) và gây giật hình định kỳ.
  /** @type {HTMLCanvasElement | null} */
  var scratch = null;          // canvas khung dùng lại khi không cache
  /** @type {Array<HTMLCanvasElement | null>} */
  var layers = [null, null];   // 2 canvas tạm: hình + bóng hình (để tạo viền)
  function newCanvas() {
    try { return document.createElement('canvas'); } catch (e) { return null; }
  }
  function sizeCanvas(cv, w, h) {
    if (!cv) return null;
    try {
      cv.width = Math.max(1, Math.ceil(w)); cv.height = Math.max(1, Math.ceil(h)); // gán width cũng xoá canvas
      return cv.getContext('2d') ? cv : null;
    } catch (e) { return null; }
  }
  function makeCanvas(w, h, reuse) {
    if (reuse) { scratch = scratch || newCanvas(); return sizeCanvas(scratch, w, h); }
    return sizeCanvas(newCanvas(), w, h);
  }
  function layerCanvas(i, w, h) {
    layers[i] = layers[i] || newCanvas();
    return sizeCanvas(layers[i], w, h);
  }

  /**
   * Vẽ 1 khung hoàn chỉnh (bóng đổ + viền sticker + hình + hiệu ứng) vào canvas riêng.
   * @param {CharInfo} info
   * @param {any} colors   bảng màu đã gộp (resolveColors), vd {body, head, feet}
   * @param {any} gfx
   * @param {any} acc
   * @param {string} state
   * @param {{t:number, loop:number}} q  thời gian dùng để vẽ (đã lượng tử hoá hoặc thô)
   * @param {boolean} blink
   * @param {boolean} flash   phủ trắng
   * @param {number} res      số điểm ảnh thật cho 1 đơn vị thiết kế (2, 4 hoặc 6) — độ nét của khung
   * @param {boolean} reuse   true = vẽ vào canvas `scratch` dùng chung (khung sẽ bị ghi đè lần sau, KHÔNG được cache)
   * @param {boolean} shadow  vẽ bóng đổ dưới chân
   * @returns {CachedFrame | null} null nếu không tạo được canvas
   */
  function buildFrame(info, colors, gfx, acc, state, q, blink, flash, res, reuse, shadow) {
    var dw = info.dw, dh = info.dh;
    // Lề quanh hình thiết kế: tay giơ cao, áo choàng bay, sao trên đầu... tràn ra ngoài dw×dh.
    // Tư thế 'dead' nằm ngang nên cần lề ngang bằng cả chiều cao nhân vật.
    var padX = Math.ceil(state === 'dead' ? dh + 12 : Math.max(dw * 0.65, dh * 0.45) + 14);
    var padTop = Math.ceil(dh * 0.55 + 20), padBot = 8;
    var fw = dw + padX * 2, fh = dh + padTop + padBot;
    var W = Math.ceil(fw * res), H = Math.ceil(fh * res);
    var cv = makeCanvas(W, H, reuse);
    if (!cv) return null;
    // (ox, oy) = vị trí điểm CHÂN bên trong khung, tính từ góc trên-trái (đơn vị thiết kế).
    var ox = padX + dw / 2, oy = padTop + dh;
    var fc = cv.getContext('2d');
    var a = layerCanvas(0, W, H), b = a ? layerCanvas(1, W, H) : null;
    if (a && b) {
      // 1) vẽ hình lên lớp a
      var ac = a.getContext('2d');
      // setTransform(res, 0, 0, res, dx, dy) = "scale(res) rồi dời gốc tới chân" trong 1 lệnh, và XOÁ mọi
      //   transform cũ còn sót trên canvas dùng lại → bộ vẽ cứ vẽ theo đơn vị thiết kế với chân ở (0,0).
      ac.setTransform(res, 0, 0, res, ox * res, oy * res);
      var r = renderPose(ac, info, colors, gfx, acc, state, q.t, blink, q.loop);
      // 2) bóng hình màu mực trên lớp b
      // 💡 Khái niệm: globalCompositeOperation 'source-in' — lệnh vẽ tiếp theo chỉ giữ lại phần TRÙNG với
      //   điểm ảnh đã có. Chép hình a sang b rồi fillRect màu mực với 'source-in' → được "bóng hình" đặc
      //   màu mực đúng bằng hình dáng nhân vật (silhouette).
      var bc = b.getContext('2d');
      bc.setTransform(1, 0, 0, 1, 0, 0);
      bc.globalCompositeOperation = 'source-over';
      bc.drawImage(a, 0, 0);
      bc.globalCompositeOperation = 'source-in';
      bc.fillStyle = INK; bc.fillRect(0, 0, W, H);
      // ⚠️ Bẫy: phải trả về 'source-over' — canvas b được dùng lại, quên dòng này thì lần sau drawImage(a)
      //   chỉ vẽ được vào phần trùng với nội dung cũ.
      bc.globalCompositeOperation = 'source-over';
      // 3) khung cuối: bóng đổ -> viền (bóng hình lệch nhiều hướng) -> hình -> hiệu ứng
      if (shadow) { fc.setTransform(res, 0, 0, res, ox * res, oy * res); drawShadow(fc, info, r.P); }
      fc.setTransform(1, 0, 0, 1, 0, 0);
      // 💡 Khái niệm: viền sticker — đóng dấu bóng hình lệch đi o điểm ảnh theo n hướng quanh vòng tròn, rồi vẽ
      //   hình thật đè lên giữa → còn lại một vành mực dày đều bao NGOÀI mọi bộ phận (kể cả tay chồng lên thân).
      //   Độ phân giải cao (res ≥ 4) thì vành rộng hơn tính theo điểm ảnh nên cần 12 hướng để không lộ răng cưa.
      // 🧪 Thử: đổi OUTLINE 1.7 → 4 ở đầu file: nhân vật như hình dán sticker viền dày.
      var o = OUTLINE * res, n = res >= 4 ? 12 : 8;
      for (var i = 0; i < n; i++) {
        var ang = (i / n) * TAU;
        fc.drawImage(b, Math.cos(ang) * o, Math.sin(ang) * o);
      }
      fc.drawImage(a, 0, 0);
      fc.setTransform(res, 0, 0, res, ox * res, oy * res);
      runPost(fc, r, info);
    } else {
      // Không tạo được canvas lớp → bỏ viền sticker, vẫn vẽ được nhân vật (xuống cấp nhẹ nhàng).
      fc.setTransform(res, 0, 0, res, ox * res, oy * res);
      var r2 = renderPose(fc, info, colors, gfx, acc, state, q.t, blink, q.loop);
      runPost(fc, r2, info);
    }
    if (flash) {
      // nháy trắng: phủ trắng chỉ lên phần đã vẽ
      // 'source-atop' giữ nguyên độ trong suốt của khung → nền trong suốt xung quanh không bị phủ trắng.
      fc.setTransform(1, 0, 0, 1, 0, 0);
      fc.globalCompositeOperation = 'source-atop';
      fc.fillStyle = FLASH_FILL;
      fc.fillRect(0, 0, W, H);
      fc.globalCompositeOperation = 'source-over';
    }
    fc.setTransform(1, 0, 0, 1, 0, 0);
    return { cv: cv, ox: ox, oy: oy, w: fw, h: fh, px: W * H };
  }

  /**
   * Lấy khung đã cache theo khoá; nếu có thì đánh dấu "vừa dùng".
   * @param {string} key
   * @returns {CachedFrame | null}
   */
  function cacheGet(key) {
    if (!cache.map) return null;
    var fr = cache.map.get(key);
    if (fr) {
      // 💡 Khái niệm: Map làm LRU — Map của JS luôn duyệt khoá theo THỨ TỰ CHÈN. Xoá rồi set lại = dời khoá
      //   xuống cuối ("mới dùng nhất"); khoá đầu tiên của map.keys() luôn là khoá lâu chưa dùng nhất.
      //   Không cần danh sách liên kết hay timestamp như LRU kinh điển.
      cache.map.delete(key); cache.map.set(key, fr);
      cache.hits++;
    }
    return fr || null;
  }
  /**
   * Thêm khung vào cache rồi loại bớt khung cũ nhất cho tới khi về dưới cả hai giới hạn.
   * @param {string} key
   * @param {CachedFrame} fr
   */
  function cachePut(key, fr) {
    if (!cache.map) return;
    cache.map.set(key, fr);
    cache.px += fr.px || 0;
    cache.misses++;
    // `size > 1`: luôn giữ lại khung vừa thêm, kể cả khi riêng nó đã vượt ngân sách điểm ảnh.
    while (cache.map.size > 1 && (cache.map.size > CACHE_MAX || cache.px > CACHE_MAX_PX)) {
      var k = cache.map.keys().next().value, old = cache.map.get(k);
      cache.px -= (old && old.px) || 0;
      cache.map.delete(k);
    }
  }

  // Chép khung lên ctx sao cho điểm chân của khung trùng gốc (0,0) hiện tại. Truyền w/h (đơn vị thiết kế) để
  // drawImage tự thu nhỏ khung độ phân giải cao về đúng cỡ → transform hiện tại của ctx lo phần phóng/lật.
  function blit(ctx, fr) { ctx.drawImage(fr.cv, -fr.ox, -fr.oy, fr.w, fr.h); }

  // ---------------------------------------------------------------------------
  // Chữ hoạt hình ngoài cache: OÁI!, ?, !, BỐP! (không bị lật theo hướng nhìn)
  // ---------------------------------------------------------------------------
  // Chữ vẽ ngoài cache vì: (1) nằm trong khung lật ngang thì chữ bị ngược; (2) chữ phải luôn nét theo font
  // thật của trình duyệt, không bị phóng từ ảnh độ phân giải thấp.
  function comicText(ctx, x, y, text, size, fill, rot, k) {
    k = k == null ? 1 : k;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot || 0); ctx.scale(k, k);
    // nổ hình sao phía sau
    var r = size * (0.55 + text.length * 0.2);
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.lineJoin = 'round';
    starPath(ctx, 0, 0, r, r * 0.68, 9, 0.2);
    ctx.fill(); ctx.stroke();
    ctx.font = font(size, 'bold');
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = size * 0.26; ctx.strokeStyle = INK;
    ctx.strokeText(text, 0, size * 0.04);
    ctx.fillStyle = fill || '#ff5a3c';
    ctx.fillText(text, 0, size * 0.04);
    ctx.restore();
  }
  // Dấu ! / ? trong bong bóng tròn nhỏ.
  function markBubble(ctx, x, y, mark, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = mark === '!' ? '#ffd84a' : '#ffffff'; ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(0, 0, size * 0.72, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-size * 0.2, size * 0.6); ctx.lineTo(-size * 0.45, size * 1.0); ctx.lineTo(size * 0.05, size * 0.68); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.font = font(size, 'bold');
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = INK; ctx.fillText(mark, 0, size * 0.05);
    ctx.restore();
  }
  function drawOverlay(ctx, info, state, t, w, h, opts, clock) {
    var mark = opts.mark || (state === 'think' ? '?' : null);
    if (mark) {
      var bob = Math.sin(clock * 5) * 1.5;
      markBubble(ctx, w * 0.5 + 6, -h - 8 + bob, String(mark).slice(0, 2), 11);
    }
    if (state === 'hurt' && info.kind === 'cat' && t < 0.75) {
      // "Pop-in": phóng tới 1.15 rồi co về 1 trong 0.2 s — overshoot nhỏ làm chữ như bật nảy ra.
      var k = t < 0.1 ? easeOut(t / 0.1) * 1.15 : t < 0.2 ? lerp(1.15, 1, (t - 0.1) / 0.1) : 1;
      ctx.save(); ctx.globalAlpha *= clamp((0.75 - t) / 0.2, 0, 1);
      comicText(ctx, -w * 0.15, -h * 0.75 - 14 - t * 10, 'OÁI!', 11, '#ff5a3c', -0.18, k);
      ctx.restore();
    }
    if (state === 'victory' && info.id === 'joey') {
      var ph = (clock * 1.4) % 1;
      ctx.save(); ctx.globalAlpha *= Math.sin(ph * Math.PI);
      ctx.font = font(10, 'bold'); ctx.textAlign = 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.fillStyle = '#ffd84a';
      ctx.strokeText('HA HA!', w * 0.6, -h - 10 - ph * 8); ctx.fillText('HA HA!', w * 0.6, -h - 10 - ph * 8);
      ctx.restore();
    }
  }

  // Chữ "BỐP!" bật ra tại toạ độ thế giới (giẫm gián, trúng trùm).
  /** @type {Array<{x:number, y:number, text:string, color:string, at:number, rot:number}>} */
  var popups = [];
  // Đồng hồ game (giây). Dùng OG.time thay vì Date.now(): khi pause, OG.time đứng yên → chữ cũng "đóng băng".
  function now() { return typeof OG.time === 'number' ? OG.time : 0; }
  /**
   * Vẽ (và dọn) các chữ hoạt hình "BỐP!" đang sống. Toạ độ chữ là toạ độ THẾ GIỚI, nên ctx phải đang ở
   * hệ thế giới (camera đã áp dụng). drawCharacter của người chơi tự gọi hàm này khi có opts.worldX.
   * @param {CanvasRenderingContext2D} ctx
   */
  S.drawPopups = function (ctx) {
    var tn = now();
    // Duyệt NGƯỢC vì splice() xoá phần tử giữa vòng lặp; duyệt xuôi sẽ bỏ sót phần tử ngay sau phần tử bị xoá.
    for (var i = popups.length - 1; i >= 0; i--) {
      var p = popups[i], age = tn - p.at;
      // age < -1: đồng hồ bị lùi (vd trang demo tự đặt OG.time) → chữ cũ "đến từ tương lai", bỏ luôn.
      if (age > POPUP_LIFE || age < -1) { popups.splice(i, 1); continue; }
      var k = age < 0.1 ? easeOut(age / 0.1) * 1.25 : age < 0.2 ? lerp(1.25, 1, (age - 0.1) / 0.1) : 1;
      ctx.save();
      ctx.globalAlpha *= clamp((POPUP_LIFE - age) / 0.25, 0, 1);
      comicText(ctx, p.x, p.y - age * 22, p.text, 13, p.color, p.rot, k);
      ctx.restore();
    }
  };

  // ---------------------------------------------------------------------------
  // Hiệu ứng hạt qua OG.Particles
  // ---------------------------------------------------------------------------
  // 💡 Khái niệm: particles (hệ hạt) — hiệu ứng bụi/sao/lấp lánh là hàng chục chấm nhỏ, mỗi chấm có vị trí,
  //   vận tốc, tuổi thọ riêng, được OG.Particles cập nhật theo dt rồi tự xoá khi hết tuổi. Sprites chỉ "đặt hàng"
  //   (spawn) với công thức tham số; còn hình dáng từng hạt do S.drawParticle bên dưới vẽ.
  //   Tham số spawn: count (số hạt), speed (px/giây), lift (px/giây hướng lên thêm), gravity (px/giây², âm = bay lên),
  //   life (giây), size (px), shape (hình dạng).
  var fx = /** @type {any} */ (S.fx = S.fx || {});
  // sink(x, y, opts): mặc định là OG.Particles.spawn. Trang demo có thể thay bằng hệ hạt riêng.
  fx.sink = fx.sink || null;
  /**
   * Phát hạt tại (x, y) toạ độ THẾ GIỚI (px), qua fx.sink nếu có, không thì OG.Particles.spawn.
   * Bỏ qua lặng lẽ nếu chưa có hệ hạt hoặc toạ độ không hợp lệ (NaN/Infinity).
   * @param {number} x
   * @param {number} y
   * @param {Object} opts  {color, count, speed, lift, gravity, life, size, shape}
   * @example
   *   OG.Sprites.fx.spawn(400, 300, { color: '#ff6f9f', count: 6, speed: 90, life: 0.6, size: 6, shape: 'heart' });
   */
  fx.spawn = function (x, y, opts) {
    var P = OG.Particles, f = fx.sink || (P && P.spawn);
    if (typeof f !== 'function' || !isFinite(x) || !isFinite(y)) return;
    // f.call(P, ...): spawn là method của OG.Particles, gọi tách rời phải trả lại đúng `this`.
    try { f.call(fx.sink ? null : P, x, y, opts); } catch (e) { report('fx.spawn', e); }
  };
  // Các "công thức" hạt dựng sẵn — (x, y) là toạ độ thế giới (px), n = số hạt.
  // 🧪 Thử: trong fx.stars đổi gravity 520 → -100: sao khi giẫm gián bay vút lên trời thay vì rơi xuống.
  /** Bụi nhỏ dưới chân (bước chạy). @param {number} x @param {number} y @param {number} [n=2] */
  fx.dust = function (x, y, n) {
    fx.spawn(x, y - 2, { color: 'rgba(240,226,196,0.9)', count: n || 2, speed: 45, lift: 22, gravity: -25, life: 0.38, size: 5, shape: 'dust' });
  };
  /** Hai cụm bụi toả sang hai bên chân (nhảy / tiếp đất). @param {number} x @param {number} y @param {number} [n=6] */
  fx.puff = function (x, y, n) {
    fx.spawn(x - 8, y - 2, { color: 'rgba(240,226,196,0.95)', count: Math.ceil((n || 6) / 2), speed: 70, lift: 10, gravity: -10, life: 0.4, size: 6, shape: 'dust' });
    fx.spawn(x + 8, y - 2, { color: 'rgba(240,226,196,0.95)', count: Math.floor((n || 6) / 2), speed: 70, lift: 10, gravity: -10, life: 0.4, size: 6, shape: 'dust' });
  };
  /** Tia lấp lánh (nhặt đồ). @param {number} x @param {number} y @param {string} [color] */
  fx.sparkle = function (x, y, color) {
    fx.spawn(x, y, { color: color || '#fff6c2', count: 7, speed: 130, lift: 40, gravity: 60, life: 0.55, size: 6, shape: 'spark' });
    fx.spawn(x, y, { color: '#ffffff', count: 3, speed: 50, lift: 20, gravity: 0, life: 0.35, size: 5, shape: 'spark' });
  };
  /** Sao văng lên rồi rơi (giẫm, trúng đòn). @param {number} x @param {number} y @param {number} [n=5] @param {string} [color] */
  fx.stars = function (x, y, n, color) {
    fx.spawn(x, y, { color: color || '#ffd84a', count: n || 5, speed: 170, lift: 130, gravity: 520, life: 0.7, size: 8, shape: 'star' });
  };
  /**
   * Thêm chữ hoạt hình bật lên tại toạ độ THẾ GIỚI (px). Chữ được vẽ cùng nhân vật người chơi hoặc qua S.drawPopups(ctx).
   * @param {number} x
   * @param {number} y
   * @param {string} [text='BỐP!']
   * @param {string} [color='#ff5a3c']
   * @example
   *   OG.Sprites.fx.pop(enemy.x + 17, enemy.y - 10, 'BỐP!');
   */
  fx.pop = function (x, y, text, color) {
    if (!isFinite(x) || !isFinite(y)) return;
    popups.push({ x: x, y: y, text: text || 'BỐP!', color: color || '#ff5a3c', at: now(), rot: (Math.random() - 0.5) * 0.4 });
    // Giới hạn số chữ: giẫm liên hoàn cả đàn gián không được phủ kín màn hình. Bỏ chữ CŨ nhất trước.
    if (popups.length > POPUP_MAX) popups.shift();
  };

  /**
   * Vẽ một hạt có hình dạng (OG.Particles gọi nếu p.shape có giá trị). globalAlpha do bên gọi đặt.
   * @param {CanvasRenderingContext2D} ctx  đang ở hệ toạ độ thế giới
   * @param {{x:number, y:number, size?:number, color?:string, shape?:string, life?:number, max?:number, seed?:number}} p
   *        hạt: life = thời gian còn lại (giây), max = tuổi thọ ban đầu (giây), shape: star | spark | dust | circle | heart
   * @returns {boolean} true nếu đã vẽ; false → OG.Particles tự vẽ ô vuông dự phòng
   */
  S.drawParticle = function (ctx, p) {
    if (!p || !p.shape) return false;
    // age đi từ 0 (vừa sinh) → 1 (sắp chết): hạt bụi to dần, sao xoay dần, tia lấp lánh nhấp nháy theo age.
    var a = p.max ? clamp(p.life / p.max, 0, 1) : 1, sz = p.size || 4, age = 1 - a;
    ctx.fillStyle = p.color || '#ffffff';
    switch (p.shape) {
      case 'star':
        starPath(ctx, p.x, p.y, sz * 0.6, sz * 0.26, 5, age * 6 + (p.seed || 0));
        ctx.fill();
        return true;
      case 'spark':
        sparkPath(ctx, p.x, p.y, sz * (0.35 + 0.65 * Math.abs(Math.sin(age * 9))));
        ctx.fill();
        return true;
      case 'dust':
        ctx.beginPath(); ctx.arc(p.x, p.y, sz * (0.45 + age * 0.8), 0, TAU); ctx.fill();
        return true;
      case 'circle':
        ctx.beginPath(); ctx.arc(p.x, p.y, sz * 0.5, 0, TAU); ctx.fill();
        return true;
      case 'heart':
        heartPath(ctx, p.x, p.y, sz * 0.5); ctx.fill();
        return true;
    }
    return false;
  };

  // Vị trí chân người chơi trong thế giới (để đặt bụi/sao). Ưu tiên dữ liệu chính xác của OG.Level.
  var lastFeet = { x: 0, y: 0, at: -99, h: 52 };
  function sceneBase() {
    try { return OG.Scenes && OG.Scenes.base ? OG.Scenes.base() : null; } catch (e) { return null; }
  }
  function levelPlayer() {
    var L = OG.Level;
    if (sceneBase() === 'level' && L && L.state && L.state.player) return L.state.player;
    return null;
  }

  var stepMem = { step: -1 };
  /**
   * Ghi nhận vị trí chân người chơi (toạ độ thế giới) và phát bụi theo từng bước chạy.
   * Thứ tự ưu tiên nguồn vị trí: opts.worldX/worldY → OG.Level.state.player → suy ngược từ ma trận ctx.
   */
  function trackPlayer(ctx, info, state, t, opts, h) {
    var base = sceneBase();
    if (base !== 'level' && base !== 'boss' && opts.worldX == null) return;
    var pos = null, lp = levelPlayer();
    if (opts.worldX != null) pos = { x: +opts.worldX, y: +opts.worldY };
    else if (lp) pos = { x: lp.x + lp.w / 2, y: lp.y + lp.h };
    else if (ctx.getTransform && OG.Camera) {
      // Khung boss: suy ra từ ma trận hiện tại (caller đã translate tới chân, camera đã áp dụng).
      // getTransform().e/.f = vị trí gốc hiện tại tính bằng điểm ảnh MÀN HÌNH; chia tỉ lệ canvas (r) để về
      //   px logic 960×540, rồi cộng lại vị trí camera → toạ độ thế giới. (screen → world)
      var m = ctx.getTransform(), r = ctx.canvas && ctx.canvas.width ? ctx.canvas.width / (OG.W || 960) : 1;
      pos = { x: m.e / r + Math.round(OG.Camera.x || 0) - (OG.Camera.ox || 0), y: m.f / r + Math.round(OG.Camera.y || 0) - (OG.Camera.oy || 0) };
    }
    if (!pos || !isFinite(pos.x) || !isFinite(pos.y)) return;
    lastFeet.x = pos.x; lastFeet.y = pos.y; lastFeet.at = now(); lastFeet.h = h;
    // Bụi theo bước chạy (mỗi nửa chu kỳ chạy = 1 bước). Khi pause, t đứng yên -> không phát thêm.
    if (state === 'run') {
      // Phát hiện "cạnh" (edge detection): chỉ phát bụi khi chỉ số bước THAY ĐỔI, không phải mỗi frame
      //   → số cụm bụi không phụ thuộc FPS (60 Hz hay 144 Hz đều 1 cụm / bước).
      var step = Math.floor(t / RUN_DUST_STEP);
      if (step !== stepMem.step) {
        stepMem.step = step;
        if (step > 0) fx.dust(pos.x - (opts.face < 0 ? -1 : 1) * 7, pos.y, 2);
      }
    } else stepMem.step = -1;
  }

  function currentFeet() {
    var lp = levelPlayer();
    if (lp) return { x: lp.x + lp.w / 2, y: lp.y + lp.h, h: lp.h };
    if (now() - lastFeet.at < 0.5) return { x: lastFeet.x, y: lastFeet.y, h: lastFeet.h };
    return null;
  }

  // Thời điểm tiếp đất gần nhất (giây, theo OG.time) — cho squash khi chạm đất. Event 'player:land' cập nhật
  // (xem init); drawCharacter chỉ ĐỌC. Đây là cầu nối event → animation mà Player không cần biết Sprites.
  var landAt = -99;

  // ---------------------------------------------------------------------------
  // API công khai
  // ---------------------------------------------------------------------------
  // Trả về BẢN SAO (slice) để bên gọi có sửa mảng cũng không làm hỏng bảng nội bộ.
  /**
   * Liệt kê các trạng thái animation hợp lệ (tên khác sẽ được đưa về 'idle').
   * @returns {string[]}
   */
  S.getAnimStates = function () { return ANIMS.slice(); };
  /** Id các phụ kiện hành trình dùng được trong opts.accessory. @type {string[]} */
  S.ACCESSORIES = ACCESSORIES.slice();
  /**
   * Liệt kê charId có hình vẽ riêng (nhân vật gốc + NPC v2).
   * @returns {string[]}
   */
  S.listCharacters = function () {
    var out = Object.keys(BUILTIN);
    for (var k in NPC) out.push(k);
    return out;
  };
  /**
   * Kiểm tra charId có bộ vẽ riêng hay sẽ dùng hình dự phòng.
   * @param {string} id
   * @returns {boolean}
   */
  S.hasCharacter = function (id) { return !!(BUILTIN[id] || NPC[id]); };

  /**
   * Bật/tắt cache khung hình (tắt thì xoá luôn cache). Không có Map thì không bật được.
   * 🧪 Thử: gõ OG.Sprites.setCacheEnabled(false) trong Console khi đang chơi rồi xem OG.Loop.fps tụt
   *   (rõ nhất ở màn đông gián); bật lại bằng setCacheEnabled(true).
   * @param {boolean} on
   */
  S.setCacheEnabled = function (on) { cache.enabled = !!on && !!cache.map; if (!on) S.clearCache(); };
  /** @returns {boolean} cache có đang bật không */
  S.isCacheEnabled = function () { return cache.enabled; };
  /**
   * Đổi giới hạn LRU lúc chạy (có sàn tối thiểu 16 khung / 1 triệu điểm ảnh).
   * @param {number} n     số khung tối đa
   * @param {number} [px]  tổng điểm ảnh tối đa (bỏ qua = giữ nguyên)
   */
  S.setCacheLimit = function (n, px) { CACHE_MAX = Math.max(16, n | 0); if (px) CACHE_MAX_PX = Math.max(1e6, +px); };
  /** Xoá toàn bộ khung đã cache và đặt lại bộ đếm hit/miss. */
  S.clearCache = function () { if (cache.map) cache.map.clear(); cache.hits = 0; cache.misses = 0; cache.px = 0; };
  /**
   * Đọc thống kê cache. hits/misses cho biết tỉ lệ trúng: hits lớn hơn misses nhiều lần là cache đang có ích.
   * @returns {{size:number, max:number, hits:number, misses:number, enabled:boolean, pixels:number, maxPixels:number}}
   * @example
   *   var st = OG.Sprites.cacheStats();
   *   console.log('tỉ lệ trúng', (st.hits / Math.max(1, st.hits + st.misses) * 100).toFixed(1) + '%');
   */
  S.cacheStats = function () {
    return { size: cache.map ? cache.map.size : 0, max: CACHE_MAX, hits: cache.hits, misses: cache.misses,
      enabled: cache.enabled, pixels: cache.px, maxPixels: CACHE_MAX_PX };
  };

  // ---- Hàm con của drawCharacter ----

  /**
   * Tính co giãn toàn thân của người chơi: BẸP khi vừa tiếp đất, GIÃN khi đang rơi nhanh.
   * Áp lúc blit nên không làm tăng số khung cache.
   * @param {string} state
   * @param {DrawCharacterOpts} opts
   * @returns {number[]} [gsx, gsy]
   */
  function computeLandSquash(state, opts) {
    var gsx = 1, gsy = 1;
    var dl = now() - landAt;
    if ((state === 'idle' || state === 'run' || state === 'walk') && dl >= 0 && dl < LAND_SQUASH_DUR) {
      // amt giảm tuyến tính 1 → 0 trong LAND_SQUASH_DUR giây: bẹp mạnh nhất ngay lúc chạm đất rồi bung dần.
      var amt = 1 - dl / LAND_SQUASH_DUR;
      gsy = 1 - LAND_SQUASH_Y * amt; gsx = 1 + LAND_SQUASH_X * amt;
    } else if (state === 'fall' && opts.vy > 0) {
      // gsx = 1/gsy: giữ "diện tích" không đổi → giãn dài thì phải gầy đi, nhìn như có khối lượng thật.
      gsy = 1 + clamp(opts.vy / FALL_STRETCH_VY, 0, 1) * FALL_STRETCH_MAX; gsx = 1 / gsy;
    }
    return [gsx, gsy];
  }

  // Chọn độ phân giải khung (điểm ảnh thật / đơn vị thiết kế) theo mức phóng thực tế s.
  // Chỉ 3 mức (2, 4, 6) thay vì đúng bằng s: một nhân vật phóng 1.0 hay 1.2 vẫn dùng chung khung cache,
  // đổi lại khung hơi dư nét. Hình nhỏ vẫn dùng ×2 để sắc nét trên màn hình mật độ điểm ảnh cao.
  function pickResolution(s) { return s <= 1.25 ? 2 : s <= 2.6 ? 4 : 6; }

  // Khoá cache = ghép MỌI thứ làm khung trông khác đi. ⚠️ Bẫy: thêm một tuỳ chọn ảnh hưởng hình vẽ mà quên
  //   đưa vào khoá → hai cách vẽ khác nhau dùng chung một khung, nhân vật "nhảy" giữa hai bộ đồ.
  function frameKey(info, opts, acc, drawState, q, blink, flash, shadow, res) {
    return [info.id, info.kind, opts.skin || '', opts.colors ? JSON.stringify(opts.colors) : '', acc.key,
      drawState, q.frame, blink ? 1 : 0, flash ? 1 : 0, shadow ? 1 : 0, res].join('|');
  }

  /**
   * Vẽ một nhân vật tại gốc toạ độ hiện tại của ctx (bên gọi đã translate tới ĐIỂM CHÂN, giữa-đáy hitbox).
   * Tự save/restore; không bao giờ ném lỗi — lỗi vẽ thì in 1 lần và vẽ khối màu dự phòng.
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} charId     'oggy', 'jack', 'roach', 'bob'... (id lạ vẫn vẽ được hình dự phòng)
   * @param {string} animState  idle | run | jump | fall | hurt | attack | victory | walk | stunned | dead | talk | wave | think | point
   * @param {number} t          thời gian đã ở trong trạng thái này (giây), bên gọi tự đếm và đặt lại khi đổi trạng thái
   * @param {DrawCharacterOpts} [opts]
   * @example
   *   ctx.save();
   *   ctx.translate(p.x + p.w / 2, p.y + p.h);              // tới điểm chân (toạ độ thế giới)
   *   OG.Sprites.drawCharacter(ctx, 'oggy', 'run', p.animT, { face: p.face, vx: p.vx, vy: p.vy,
   *     worldX: p.x + p.w / 2, worldY: p.y + p.h });
   *   ctx.restore();
   */
  S.drawCharacter = function (ctx, charId, animState, t, opts) {
    opts = opts || {};
    t = +t || 0;
    var info = charInfo(charId || 'oggy');
    var state = normState(animState), drawState = state, dt = t;
    var w = +opts.w || info.w, h = +opts.h || info.h;
    var scale = opts.scale == null ? 1 : (+opts.scale || 1);
    var face = opts.face < 0 ? -1 : 1;
    var colors, gfx, acc;
    try {
      colors = resolveColors(info, opts.skin, opts.colors);
      gfx = info.kind === 'cat' ? skinGfx(opts.skin) : null;
      acc = resolveAcc(info, gfx, opts.accessory);
    } catch (e) { colors = DEFAULT_COLORS.oggy; gfx = null; acc = { key: '' }; }

    // Mèo đứng yên lâu: ngáp, gãi bụng (chu kỳ YAWN_CYCLE giây, phần còn lại là idle thường).
    if (state === 'idle' && info.kind === 'cat' && info.role === 'player' && t >= IDLE_LONG) {
      var yp = (t - IDLE_LONG) % YAWN_CYCLE;
      if (yp < ANIM_INFO.yawn.loop) { drawState = 'yawn'; dt = yp; }
      else dt = yp - ANIM_INFO.yawn.loop;
    }

    // Hiệu ứng ngoài cache: bụi chạy, ghi nhận vị trí người chơi.
    if (info.role === 'player' && opts.vx != null) {
      try { trackPlayer(ctx, info, state, t, opts, h); } catch (e) { report('trackPlayer', e); }
    }

    // Co giãn toàn cục (không vào cache): squash mạnh khi tiếp đất, stretch khi rơi nhanh.
    // 💡 Khái niệm: squash & stretch ở HAI tầng — tầng Pose (trong khung cache, theo t của animation) và tầng
    //   này (áp khi blit, theo sự kiện vật lý thật: lúc chạm đất, vận tốc rơi). Tầng blit "miễn phí" vì chỉ là
    //   một phép ctx.scale, không sinh khung cache mới.
    var gsx = 1, gsy = 1;
    if (info.role === 'player' && opts.vx != null) {
      var squash = computeLandSquash(state, opts);
      gsx = squash[0]; gsy = squash[1];
    }

    var q = quantize(drawState, dt, info.kind);
    var clock = opts.time != null ? +opts.time : t;
    var blink = drawState === 'idle' || drawState === 'run' || drawState === 'walk' || drawState === 'jump' ||
      drawState === 'talk' || drawState === 'point' ? isBlink(clock, info.id) : false;
    var flash = !!opts.flash;
    var shadow = opts.shadow !== false;
    var kx = w / info.dw, ky = h / info.dh;

    ctx.save();
    try {
      if (opts.alpha != null) ctx.globalAlpha *= clamp(+opts.alpha, 0, 1);
      // Chữ "BỐP!" (toạ độ thế giới) vẽ cùng người chơi.
      if (popups.length && info.role === 'player' && opts.worldX != null && isFinite(opts.worldX)) {
        ctx.save(); ctx.translate(-opts.worldX, -opts.worldY); S.drawPopups(ctx); ctx.restore();
      }
      ctx.save();
      // Ba phép scale nhân dồn (gốc vẫn là chân): lật hướng + phóng theo opts → squash tiếp đất →
      //   đổi đơn vị thiết kế sang px. Lật ngang = scale x âm, nên MỌI bộ vẽ chỉ cần vẽ hướng nhìn sang phải.
      ctx.scale(face * scale, scale);
      ctx.scale(gsx, gsy);
      ctx.scale(kx, ky);

      var drawn = false;
      var useCache = cache.enabled && !opts.noCache;
      var res = pickResolution(Math.max(kx, ky) * Math.abs(scale));
      var key = useCache ? frameKey(info, opts, acc, drawState, q, blink, flash, shadow, res) : null;
      var fr = key ? cacheGet(key) : null;
      if (!fr) {
        // Cache miss → dựng khung bằng t ĐÃ lượng tử hoá (q) rồi cất vào cache.
        // Không cache: dựng khung tạm trên canvas dùng lại, với t chính xác (mượt hơn).
        // ⚠️ Bẫy: khung cache phải vẽ bằng q.t (đầu khung), không phải q.raw — nếu không, khung lưu lại sẽ là
        //   tư thế của một thời điểm ngẫu nhiên trong khung, lần phát sau trông giật lùi/giật tới.
        fr = key ? buildFrame(info, colors, gfx, acc, drawState, q, blink, flash, res, false, shadow)
          : buildFrame(info, colors, gfx, acc, drawState, { t: q.raw, loop: q.loop }, blink, flash, res, true, shadow);
        if (fr && key) cachePut(key, fr);
      }
      if (fr) { blit(ctx, fr); drawn = true; }
      if (!drawn) {
        var r = renderPose(ctx, info, colors, gfx, acc, drawState, useCache ? q.t : q.raw, blink, q.loop);
        runPost(ctx, r, info);
      }
      ctx.restore();
      // Chữ/dấu hiệu không lật theo hướng nhìn.
      ctx.save();
      ctx.scale(scale, scale);
      drawOverlay(ctx, info, state, t, w, h, opts, clock);
      ctx.restore();
    } catch (err) {
      report('drawCharacter(' + charId + ')', err);
      // Phương án cuối: khối bo góc màu thân — hợp đồng yêu cầu luôn vẽ được.
      try {
        ctx.globalAlpha = 1;
        rrect(ctx, -info.dw / 2, -info.dh, info.dw, info.dh, 10, (colors && colors.body) || '#2877d5');
      } catch (e2) { /* bỏ qua */ }
    }
    ctx.restore();
  };

  /**
   * Vẽ chân dung tròn của nhân vật (menu chọn nhân vật, hộp thoại). Tái dùng drawCharacter: phóng to rồi
   * dời sao cho phần ĐẦU nằm giữa vòng tròn, cắt (clip) phần thừa.
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} charId
   * @param {number} x     tâm vòng tròn (px, toạ độ màn hình)
   * @param {number} y
   * @param {number} [size=64]  đường kính (px)
   * @param {{skin?:string, colors?:Object, bg?:string|false, ring?:string|false, state?:string, t?:number,
   *          time?:number, face?:number, accessory?:string|string[]}} [opts]  bg/ring = false để tắt nền/viền
   * @example
   *   OG.Sprites.drawPortrait(ctx, 'bob', 120, 400, 80, { state: 'talk', t: OG.time });
   */
  S.drawPortrait = function (ctx, charId, x, y, size, opts) {
    opts = opts || {};
    var info = charInfo(charId || 'oggy');
    var r = (size || 64) / 2;
    // Điểm lấy làm tâm (tỉ lệ chiều cao tính từ chân) và chiều cao cần hiển thị.
    var focus, span;
    if (info.kind === 'cat') { focus = 0.67; span = 0.78; }
    else if (info.kind === 'bug') {
      var sp = info.spec;
      focus = (-sp.headY + sp.headR * 0.2) / sp.H; span = Math.min(1.1, (sp.headR * 4.4) / sp.H);
    } else if (info.kind === 'npc') { focus = info.npc.focus; span = info.npc.span; }
    else { focus = 0.5; span = 1.25; }
    // sc: phóng sao cho `span` (tỉ lệ chiều cao nhân vật) vừa đúng đường kính. Rồi dời gốc (điểm chân) xuống
    //   dưới tâm một đoạn focus·h·sc → điểm ở độ cao `focus` (thường là đầu) rơi đúng tâm vòng tròn.
    var sc = (r * 2) / (info.h * span);
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
    if (opts.bg !== false) { ctx.fillStyle = opts.bg || '#fff6df'; ctx.fill(); }
    ctx.save();
    ctx.clip();
    ctx.translate(x, y + info.h * focus * sc);
    S.drawCharacter(ctx, charId, opts.state || 'idle', opts.t || 0, {
      face: opts.face || 1, skin: opts.skin || null, colors: opts.colors, scale: sc, time: opts.time,
      accessory: opts.accessory, shadow: false
    });
    ctx.restore();
    if (opts.ring !== false) {
      ctx.strokeStyle = opts.ring || INK; ctx.lineWidth = Math.max(2, r * 0.08);
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  };

  var inited = false;
  /**
   * Đăng ký nghe event gameplay để phát hiệu ứng hạt + chữ hoạt hình. Gọi nhiều lần cũng an toàn
   * (cờ `inited` chặn đăng ký trùng — nếu không, mỗi lần gọi lại sẽ nhân đôi số hạt bụi).
   * main.js gọi một lần lúc boot (qua danh sách OG.FEATURE_INIT_ORDER).
   */
  S.init = function () {
    if (inited) return;
    inited = true;
    var E = OG.Events;
    if (!E || typeof E.on !== 'function') return;

    function dims() {
      var lp = levelPlayer();
      if (lp) return { w: lp.w, h: lp.h };
      var id = (OG.Game && OG.Game.run && OG.Game.run.charId) || 'oggy';
      var ci = charInfo(id);
      return { w: ci.w, h: ci.h };
    }

    // 💡 Khái niệm: observer — Player/Level chỉ PHÁT event ('player:land', 'enemy:stomp'...), không biết Sprites
    //   tồn tại. Sprites tự nghe và quyết định hiệu ứng → không gọi init() thì gameplay vẫn chạy bình thường,
    //   chỉ mất bụi, sao và chữ "BỐP!". Bên phát và bên nghe không phụ thuộc nhau.
    // Payload {x, y} của 'player:jump' / 'player:land' là góc trên-trái hitbox → cộng w/2, h để ra điểm CHÂN
    //   (toạ độ thế giới).
    E.on('player:jump', function (e) {
      if (!e) return;
      var d = dims();
      fx.puff(e.x + d.w / 2, e.y + d.h, 4);
    });
    E.on('player:land', function (e) {
      landAt = now();
      if (!e) return;
      var d = dims();
      fx.puff(e.x + d.w / 2, e.y + d.h, 6);
    });
    E.on('item:collect', function (e) {
      if (!e) return;
      if (e.type === 'coin') fx.sparkle(e.x, e.y, '#ffe27a');
      else fx.sparkle(e.x, e.y - 6, '#fff6c2');
    });
    E.on('enemy:stomp', function (e) {
      if (!e) return;
      fx.stars(e.x + 17, e.y + 4, 5);
      fx.pop(e.x + 17, e.y - 10, 'BỐP!', '#ff5a3c');
    });
    E.on('player:hurt', function (e) {
      var f = currentFeet();
      if (!f) return;
      if (e && e.shielded) fx.sparkle(f.x, f.y - f.h * 0.6, '#9be8ff');
      else fx.stars(f.x, f.y - f.h * 0.85, 4, '#ffffff');
    });
    E.on('boss:hit', function () {
      // người chơi vừa giẫm điểm yếu -> sao + "BỐP!" ngay dưới chân
      var f = currentFeet();
      if (!f) return;
      fx.stars(f.x, f.y, 7);
      fx.pop(f.x + 10, f.y - 6, 'BỐP!', '#ff5a3c');
    });
    E.on('boss:defeated', function () {
      var f = currentFeet();
      if (f) fx.sparkle(f.x, f.y - 40, '#ffd84a');
    });
  };
})();
