/* OG.Loop — vòng lặp requestAnimationFrame. dt kẹp tối đa 0.033s (như MVP).
 * Lỗi trong một frame được log 1 lần và vòng lặp vẫn tiếp tục. */
(function () {
  'use strict';
  var OG = window.OG;
  var last = 0, running = false, lastErr = '';

  var Loop = (OG.Loop = {
    ctx: null,
    fps: 60,

    start: function (ctx) {
      Loop.ctx = ctx;
      if (running) return;
      running = true;
      requestAnimationFrame(frame);
    },

    // Chạy thủ công n frame (dùng để test không cần rAF).
    step: function (dt) { tick(dt); }
  });

  function tick(dt) {
    OG.time += dt;
    OG.Camera.update(dt);
    OG.Scenes.update(dt);
    var ctx = Loop.ctx;
    ctx.save();
    ctx.clearRect(0, 0, OG.W, OG.H);
    OG.Scenes.draw(ctx);
    ctx.restore();
    OG.Input.endFrame();
  }

  function frame(t) {
    requestAnimationFrame(frame);
    var dt = Math.min(OG.Config.MAX_DT, (t - last) / 1000 || 0);
    last = t;
    if (dt > 0) Loop.fps = Loop.fps * 0.95 + (1 / dt) * 0.05;
    try {
      tick(dt);
    } catch (err) {
      var msg = String(err && err.stack || err);
      if (msg !== lastErr) { lastErr = msg; console.error('[OG.Loop] lỗi frame:', err); }
      OG.Input.endFrame();
    }
  }
})();
