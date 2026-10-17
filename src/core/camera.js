// @ts-check
/* ============================================================================
 * OG.Camera — CAMERA CUỘN NGANG + RUNG MÀN HÌNH (screen shake)
 * ----------------------------------------------------------------------------
 * Vai trò:      Quyết định phần nào của thế giới (rộng vài nghìn px) hiện lên canvas 960×540.
 *               Scene level/boss gọi follow() mỗi frame để bám nhân vật, rồi apply(ctx) trước khi vẽ thế giới.
 *               OG.Loop gọi update(dt) mỗi frame để làm tắt dần hiệu ứng rung.
 * Khái niệm:    camera · toạ độ thế giới (world) ↔ toạ độ màn hình (screen) · ctx.translate ·
 *               điểm neo camera (nhân vật luôn ở 38% bề ngang) · screen shake tắt dần · kẹp camera trong biên thế giới
 * Bài học:      docs/learn/08-camera-parallax.md
 * Phụ thuộc:    OG.W, OG.util.clamp (đọc LÚC CHẠY)
 * Event:        phát: (không) · nghe: (không)
 * API công khai: OG.Camera.x, .y, .ox, .oy, .reset(), .follow(target, worldW), .shake(mag, dur),
 *               .update(dt), .apply(ctx), .toWorld(sx, sy)
 * Đọc tiếp:     src/gfx/scenery.js (parallax: lớp xa cuộn chậm hơn Camera.x) → src/game/level.js (gọi follow/apply)
 *
 * 💡 Khái niệm — hai hệ toạ độ:
 *   Thế giới (world): vị trí thật của vật trong màn, x chạy từ 0 tới level.width.
 *   Màn hình (screen): vị trí trên canvas, x từ 0 tới 960.   screenX = worldX − Camera.x.
 *   Thay vì trừ Camera.x ở MỌI lệnh vẽ, ta dịch cả hệ toạ độ một lần bằng ctx.translate (xem apply()).
 * ========================================================================== */
(function () {
  'use strict';
  var OG = window.OG;

  var FOLLOW_ANCHOR = 0.38;      // nhân vật được giữ ở 38% bề ngang màn hình (lệch trái → thấy nhiều đường phía trước hơn)
  var DEFAULT_SHAKE_MAG = 6;     // biên độ rung mặc định, px
  var DEFAULT_SHAKE_DUR = 0.3;   // thời lượng rung mặc định, giây
  var SHAKE_FADE_RATE = 4;       // biên độ bắt đầu giảm khi còn 1/4 = 0.25 giây cuối

  var Camera = (OG.Camera = {
    /** Mép TRÁI của khung nhìn trong toạ độ thế giới, px. Luôn trong [0, worldW − 960]. */
    x: 0,
    /** Mép TRÊN của khung nhìn, px. Game chỉ cuộn ngang nên luôn = 0. */
    y: 0,
    shakeMag: 0,   // biên độ rung hiện tại, px
    shakeTime: 0,  // thời gian rung còn lại, giây
    ox: 0, // độ lệch rung hiện tại theo x, px (cộng vào phép dịch ở apply)
    oy: 0, // độ lệch rung hiện tại theo y, px

    /** Đặt camera về gốc và tắt rung (gọi khi vào màn mới). */
    reset: function () { Camera.x = 0; Camera.y = 0; Camera.shakeMag = 0; Camera.shakeTime = 0; Camera.ox = 0; Camera.oy = 0; },

    /**
     * Đặt camera bám theo một vật: giữ vật ở 38% bề ngang màn hình, không cho nhìn ra ngoài thế giới.
     * @param {{x: number}} target vật cần theo (thường là player), x = toạ độ thế giới, px
     * @param {number} worldW bề rộng thế giới, px
     * @example
     *   OG.Camera.follow(st.player, st.width);
     */
    follow: function (target, worldW) {
      // ⚠️ Bẫy: màn hẹp hơn màn hình (worldW < 960) → worldW − 960 âm; Math.max(0, …) giữ camera ở 0
      //   thay vì để clamp nhận cận trên nhỏ hơn cận dưới.
      var maxX = Math.max(0, worldW - OG.W);
      // 🧪 Thử: đổi FOLLOW_ANCHOR 0.38 → 0.5 — nhân vật đứng giữa màn, thấy ít đường phía trước hơn.
      Camera.x = OG.util.clamp(target.x - OG.W * FOLLOW_ANCHOR, 0, maxX);
    },

    /**
     * Bắt đầu rung màn hình. Gọi chồng nhiều lần thì lấy biên độ/thời lượng LỚN NHẤT (không cộng dồn).
     * @param {number} [mag=6] biên độ, px
     * @param {number} [dur=0.3] thời lượng, giây
     * @example
     *   OG.Camera.shake(10, 0.4); // trùm đập đất
     */
    shake: function (mag, dur) {
      Camera.shakeMag = Math.max(Camera.shakeMag, mag || DEFAULT_SHAKE_MAG);
      Camera.shakeTime = Math.max(Camera.shakeTime, dur || DEFAULT_SHAKE_DUR);
    },

    /**
     * Cập nhật hiệu ứng rung (OG.Loop gọi mỗi frame, trước Scenes.update).
     * @param {number} dt delta time, giây
     */
    update: function (dt) {
      if (Camera.shakeTime > 0) {
        Camera.shakeTime -= dt;
        // 💡 Khái niệm: screen shake tắt dần — độ lệch ngẫu nhiên mỗi frame trong [−m, m], m giảm tuyến tính
        //   về 0 ở 0.25 giây cuối. Rung dừng đột ngột trông "giật"; tắt dần thì mượt và đỡ chóng mặt.
        var m = Camera.shakeMag * Math.max(0, Math.min(1, Camera.shakeTime * SHAKE_FADE_RATE));
        Camera.ox = (Math.random() * 2 - 1) * m;
        Camera.oy = (Math.random() * 2 - 1) * m;
        if (Camera.shakeTime <= 0) { Camera.shakeMag = 0; Camera.ox = 0; Camera.oy = 0; }
      }
    },

    /**
     * Dịch hệ toạ độ của ctx từ thế giới sang màn hình (kèm độ lệch rung).
     * Phải gọi SAU ctx.save() và trả lại bằng ctx.restore() trước khi vẽ HUD (HUD dùng toạ độ màn hình).
     * @param {CanvasRenderingContext2D} ctx
     * @example
     *   ctx.save(); OG.Camera.apply(ctx); drawWorld(ctx); ctx.restore(); drawHud(ctx);
     */
    apply: function (ctx) {
      // ⚠️ Bẫy: làm tròn Camera.x — dịch theo số lẻ (vd 103.4 px) làm mọi hình bị khử răng cưa lệch nửa pixel,
      //   viền nhoè và "rung rinh" khi cuộn chậm.
      ctx.translate(-Math.round(Camera.x) + Camera.ox, -Math.round(Camera.y) + Camera.oy);
    },

    /**
     * Đổi toạ độ màn hình (vd vị trí chạm) sang toạ độ thế giới. Không tính độ lệch rung.
     * @param {number} sx x màn hình, px (0..960)
     * @param {number} sy y màn hình, px (0..540)
     * @returns {Vec2} toạ độ thế giới, px
     */
    toWorld: function (sx, sy) { return { x: sx + Camera.x, y: sy + Camera.y }; }
  });
})();
