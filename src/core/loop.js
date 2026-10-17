// @ts-check
/* ============================================================================
 * OG.Loop — VÒNG LẶP GAME (game loop)
 * ----------------------------------------------------------------------------
 * Vai trò:      "Trái tim" của game. Mỗi lần trình duyệt sắp vẽ lại màn hình (~60 lần/giây), Loop gọi
 *               update(dt) để tính trạng thái mới rồi draw(ctx) để vẽ lại toàn bộ canvas.
 * Khái niệm:    game loop · requestAnimationFrame · delta time · kẹp dt (clamp) · tách update/draw ·
 *               fixed step để test · error boundary (cô lập lỗi) · trung bình trượt (EMA) cho FPS
 * Bài học:      docs/learn/02-game-loop-delta-time.md
 * Phụ thuộc:    OG.Config.MAX_DT, OG.Camera, OG.Scenes, OG.Input (chỉ đọc LÚC CHẠY, không đọc lúc load file)
 * Event:        phát: (không) · nghe: (không)
 * API công khai: OG.Loop.start(ctx), OG.Loop.step(dt), OG.Loop.ctx, OG.Loop.fps
 * Đọc tiếp:     src/core/scenes.js (scene nhận update/draw từ đây) → src/core/main.js (nơi gọi start)
 *               → tests/smoke.js (dùng step() để chạy hàng nghìn frame không cần trình duyệt)
 * ========================================================================== */
(function () {
  'use strict';
  var OG = window.OG;

  var MS_PER_SECOND = 1000;   // requestAnimationFrame đưa thời gian theo mili-giây, game tính theo GIÂY
  var FPS_OLD_WEIGHT = 0.95;  // trọng số giá trị FPS cũ trong trung bình trượt
  var FPS_NEW_WEIGHT = 0.05;  // trọng số FPS đo được ở frame này

  var lastTimestamp = 0;      // timestamp (ms) của frame trước
  var running = false;        // chống gọi start() hai lần → hai vòng lặp chạy song song
  var lastErr = '';           // lỗi frame gần nhất đã in (để không spam console 60 lần/giây)

  var Loop = (OG.Loop = {
    /** @type {CanvasRenderingContext2D | null} context 2D của canvas chính, main.js truyền vào qua start(). */
    ctx: null,
    /** FPS ước lượng (đã làm mượt). Chỉ để hiển thị/debug, gameplay KHÔNG dựa vào số này. */
    fps: 60,

    /**
     * Bắt đầu vòng lặp. Gọi nhiều lần vẫn an toàn: chỉ đổi ctx, không tạo vòng lặp thứ hai.
     * @param {CanvasRenderingContext2D} ctx
     */
    start: function (ctx) {
      Loop.ctx = ctx;
      if (running) return;
      running = true;
      requestAnimationFrame(frame);
    },

    /**
     * Chạy THỦ CÔNG đúng 1 frame với dt cho trước — không cần requestAnimationFrame.
     * 💡 Khái niệm: tách "một bước mô phỏng" (tick) khỏi "ai gọi bước đó" (rAF) giúp test được game trong Node.
     * @param {number} dt delta time, đơn vị giây
     * @example
     *   for (var i = 0; i < 60; i++) OG.Loop.step(1 / 60); // tua nhanh 1 giây game
     */
    step: function (dt) { tick(dt); }
  });

  /**
   * Một bước của game: cập nhật mọi thứ theo dt rồi vẽ lại cả khung hình.
   * Thứ tự có chủ đích: Camera → Scene.update → xoá canvas → Scene.draw → Input.endFrame.
   * @param {number} dt giây trôi qua kể từ frame trước
   */
  function tick(dt) {
    OG.time += dt;
    OG.Camera.update(dt);
    OG.Scenes.update(dt);
    var ctx = Loop.ctx;
    // 💡 Khái niệm: mỗi frame vẽ lại TỪ ĐẦU (immediate mode). save/restore bao quanh để
    //   scene nào quên reset transform/alpha cũng không làm lệch frame sau.
    ctx.save();
    ctx.clearRect(0, 0, OG.W, OG.H);
    OG.Scenes.draw(ctx);
    ctx.restore();
    // ⚠️ Bẫy: endFrame() xoá cờ "vừa bấm" (Input.pressed). Phải gọi SAU update — gọi trước thì
    //   scene không bao giờ thấy được cú bấm.
    OG.Input.endFrame();
  }

  /**
   * Callback của requestAnimationFrame. Trình duyệt truyền timestamp t (ms, tăng dần).
   * @param {number} t
   */
  function frame(t) {
    // Xin frame kế tiếp NGAY ĐẦU hàm: nếu tick() bên dưới ném lỗi, vòng lặp vẫn sống.
    requestAnimationFrame(frame);
    // 💡 Khái niệm: delta time (khoảng thời gian giữa 2 frame). Mọi chuyển động nhân với dt
    //   (vd x += vx * dt) nên game chạy cùng tốc độ trên màn 60 Hz lẫn 144 Hz.
    // ⚠️ Bẫy: khi tab bị ẩn rồi mở lại, dt có thể là vài GIÂY → nhân vật "dịch chuyển" xuyên tường.
    //   Vì vậy dt bị kẹp tối đa OG.Config.MAX_DT (0.033 s ≈ 30 FPS). `|| 0` chặn NaN ở frame đầu tiên.
    // 🧪 Thử: đổi OG.Config.MAX_DT thành 0.2 rồi chuyển tab qua lại — xem nhân vật rơi xuyên sàn.
    var dt = Math.min(OG.Config.MAX_DT, (t - lastTimestamp) / MS_PER_SECOND || 0);
    lastTimestamp = t;
    // 💡 Khái niệm: trung bình trượt hàm mũ (EMA) — FPS hiển thị không nhảy loạn từng frame.
    if (dt > 0) Loop.fps = Loop.fps * FPS_OLD_WEIGHT + (1 / dt) * FPS_NEW_WEIGHT;
    // 💡 Khái niệm: error boundary — lỗi trong 1 frame chỉ được log, game không đứng hình.
    try {
      tick(dt);
    } catch (err) {
      var msg = String(err && err.stack || err);
      if (msg !== lastErr) { lastErr = msg; console.error('[OG.Loop] lỗi frame:', err); }
      // Vẫn xoá input của frame lỗi, nếu không một cú bấm sẽ bị "kẹt" và lặp lại mãi.
      OG.Input.endFrame();
    }
  }
})();
