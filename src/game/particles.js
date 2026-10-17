// @ts-check
/* ============================================================================
 * OG.Particles — HỆ HẠT HIỆU ỨNG (particle system) + CHỮ BAY ("+100")
 * ----------------------------------------------------------------------------
 * Vai trò:      Hiệu ứng "trang trí" ngắn: vụn khi giẫm gián, lấp lánh khi nhặt đồ, bụi khi tiếp đất, chữ điểm
 *               bay lên. Level/BossScene gọi spawn/floatText khi có sự kiện, update(dt) mỗi frame và draw(ctx)
 *               sau khi đã áp camera (toạ độ thế giới).
 * Khái niệm:    particle system (nhiều hạt nhỏ, mỗi hạt sống vài phần mười giây) · cập nhật theo delta time ·
 *               tuổi thọ (life) + làm mờ theo tuổi · xoá phần tử khi duyệt ngược mảng · vẽ dự phòng khi module vẽ lỗi
 * Bài học:      docs/learn/02-game-loop-delta-time.md (update dùng dt), docs/learn/07-ve-canvas-procedural-cache.md
 * Phụ thuộc:    OG.Sprites.drawParticle (tuỳ chọn, đọc LÚC CHẠY)
 * Event:        phát: (không) · nghe: (không)
 * API công khai: OG.Particles.spawn(x, y, opts), floatText(x, y, text, color), update(dt), draw(ctx), clear(), count()
 * Đọc tiếp:     src/game/level.js (gọi spawn khi giẫm/nhặt) → src/gfx/sprites.js (drawParticle vẽ hình dust/spark/star)
 *
 * Hợp đồng: spawn(x, y, {color, count, speed, life, size, gravity, lift, shape})
 *   shape: 'dust' | 'spark' | 'star' | 'circle' — vẽ bằng OG.Sprites.drawParticle nếu có, không thì ô vuông.
 * ========================================================================== */

/**
 * @typedef {Object} Particle  một hạt (hoặc một chữ bay)
 * @property {number} x       tâm, px thế giới
 * @property {number} y
 * @property {number} vx      px/giây
 * @property {number} vy      px/giây (âm = bay lên)
 * @property {number} life    giây còn sống
 * @property {number} max     tuổi thọ ban đầu, giây (để tính độ mờ life/max)
 * @property {number} size    cạnh hạt / cỡ chữ, px
 * @property {string} color
 * @property {number} g       gia tốc rơi riêng của hạt, px/giây²
 * @property {string|null} text  có text = chữ bay, không vẽ hình
 * @property {string|null} [shape]
 * @property {number} [seed]  số ngẫu nhiên cố định cho hạt (Sprites dùng làm lệch pha xoay/nhấp nháy)
 */

/**
 * @typedef {Object} SpawnOptions
 * @property {string} [color='#ffffff']
 * @property {number} [count=8]     số hạt
 * @property {number} [speed=160]   tốc độ tối đa, px/giây (mỗi hạt lấy 40–100%)
 * @property {number} [life=0.6]    giây
 * @property {number} [size=4]      px
 * @property {number} [gravity=600] px/giây²
 * @property {number} [lift=80]     cộng thêm vận tốc hướng lên, px/giây (để hạt "phụt" lên rồi rơi)
 * @property {string} [shape]       'dust' | 'spark' | 'star' | 'circle'
 */
(function () {
  'use strict';
  var OG = window.OG;

  var DEFAULT_COUNT = 8;
  var DEFAULT_SPEED = 160;        // px/giây
  var SPEED_MIN_RATIO = 0.4;      // mỗi hạt chạy 40%..100% tốc độ → chùm hạt không đều, trông tự nhiên
  var SPEED_RANDOM_RATIO = 0.6;
  var DEFAULT_LIFT = 80;          // px/giây
  var DEFAULT_LIFE = 0.6;         // giây
  var DEFAULT_SIZE = 4;           // px
  var DEFAULT_GRAVITY = 600;      // px/giây² — nhẹ hơn trọng lực nhân vật (1500) để hạt lơ lửng lâu hơn
  var SEED_RANGE = 6;
  var FLOAT_TEXT_SPEED = 60;      // chữ bay lên đều, px/giây
  var FLOAT_TEXT_LIFE = 0.9;      // giây
  var FLOAT_TEXT_SIZE = 16;       // cỡ chữ, px

  /** @type {Particle[]} mọi hạt đang sống */
  var list = [];
  var shapeBroken = false; // Sprites.drawParticle lỗi 1 lần -> quay về ô vuông

  /**
   * Thử vẽ hạt bằng Sprites. Lỗi một lần thì tắt hẳn (tránh ném lỗi hàng trăm lần/giây).
   * @param {CanvasRenderingContext2D} ctx
   * @param {Particle} p
   * @returns {boolean} true nếu Sprites đã vẽ
   */
  function drawShaped(ctx, p) {
    if (shapeBroken) return false;
    try { return !!OG.Sprites.drawParticle(ctx, p); } catch (e) { shapeBroken = true; console.error('[OG.Particles] drawParticle lỗi:', e); return false; }
  }

  OG.Particles = {
    /**
     * Phụt ra một chùm hạt theo mọi hướng từ (x, y).
     * @param {number} x px thế giới
     * @param {number} y px thế giới
     * @param {SpawnOptions} [opts]
     * @example
     *   OG.Particles.spawn(e.x + e.w / 2, e.y, { color: '#ffc94a', count: 12, shape: 'star' });
     */
    spawn: function (x, y, opts) {
      opts = opts || {};
      var n = opts.count || DEFAULT_COUNT;
      for (var i = 0; i < n; i++) {
        // Hướng ngẫu nhiên trên vòng tròn rồi tách thành (vx, vy) bằng cos/sin.
        var angle = Math.random() * Math.PI * 2, speed = (opts.speed || DEFAULT_SPEED) * (SPEED_MIN_RATIO + Math.random() * SPEED_RANDOM_RATIO);
        list.push({
          x: x, y: y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - (opts.lift || DEFAULT_LIFT),
          life: opts.life || DEFAULT_LIFE, max: opts.life || DEFAULT_LIFE, size: opts.size || DEFAULT_SIZE,
          color: opts.color || '#ffffff', g: opts.gravity != null ? opts.gravity : DEFAULT_GRAVITY, text: null,
          shape: opts.shape || null, seed: Math.random() * SEED_RANGE
        });
      }
    },
    /**
     * Thêm chữ bay lên rồi mờ dần (vd "+100" khi nhặt pizza).
     * @param {number} x tâm chữ, px thế giới
     * @param {number} y đường chân chữ, px thế giới
     * @param {string} text
     * @param {string} [color='#ffffff']
     */
    floatText: function (x, y, text, color) {
      list.push({ x: x, y: y, vx: 0, vy: -FLOAT_TEXT_SPEED, life: FLOAT_TEXT_LIFE, max: FLOAT_TEXT_LIFE, size: FLOAT_TEXT_SIZE, color: color || '#ffffff', g: 0, text: text });
    },
    /**
     * Cập nhật vị trí mọi hạt và xoá hạt hết tuổi.
     * @param {number} dt delta time (khoảng thời gian giữa 2 frame), giây
     */
    update: function (dt) {
      // ⚠️ Bẫy: duyệt NGƯỢC vì splice() trong lúc duyệt. Duyệt xuôi thì sau khi xoá phần tử i, phần tử i+1
      //   dồn về vị trí i và bị bỏ qua ở frame này.
      for (var i = list.length - 1; i >= 0; i--) {
        var p = list[i];
        p.life -= dt;
        if (p.life <= 0) { list.splice(i, 1); continue; }
        // 💡 Khái niệm: chuyển động theo delta time — v += a·dt, x += v·dt. Nhờ nhân dt, hạt bay cùng quãng đường
        //   dù máy chạy 30 hay 144 FPS.
        p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      }
    },
    /**
     * Vẽ mọi hạt (gọi SAU OG.Camera.apply vì toạ độ là toạ độ thế giới). Trả globalAlpha về 1 khi xong.
     * @param {CanvasRenderingContext2D} ctx
     */
    draw: function (ctx) {
      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        // 💡 Khái niệm: mờ theo tuổi — alpha = life/max đi từ 1 về 0, hạt "tan" dần thay vì biến mất đột ngột.
        ctx.globalAlpha = Math.max(0, p.life / p.max);
        ctx.fillStyle = p.color;
        if (p.text) {
          ctx.font = 'bold ' + p.size + 'px "Segoe UI", system-ui, Roboto, Arial, sans-serif';
          ctx.textAlign = 'center';
          // Viền tối trước, chữ màu sau → chữ đọc được trên mọi nền.
          ctx.strokeStyle = '#17233d'; ctx.lineWidth = 3;
          ctx.strokeText(p.text, p.x, p.y); ctx.fillText(p.text, p.x, p.y);
        } else if (p.shape && OG.Sprites && OG.Sprites.drawParticle && drawShaped(ctx, p)) {
          // đã vẽ bằng Sprites (bụi, lấp lánh, sao)
        } else {
          // Dự phòng: ô vuông đặc, tâm tại (x, y).
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
      }
      ctx.globalAlpha = 1;
    },
    /**
     * Xoá mọi hạt (khi vào màn mới).
     * 🧪 Thử: trong console gõ  OG.Particles.count()  ngay sau khi giẫm một con gián để xem số hạt đang sống.
     */
    clear: function () { list.length = 0; },
    /** @returns {number} số hạt đang sống */
    count: function () { return list.length; }
  };
})();
