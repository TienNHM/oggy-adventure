/* OG.Camera — camera cuộn ngang (giống MVP) + rung màn hình. */
(function () {
  'use strict';
  var OG = window.OG;

  var Camera = (OG.Camera = {
    x: 0,
    y: 0,
    shakeMag: 0,
    shakeTime: 0,
    ox: 0, // độ lệch rung hiện tại
    oy: 0,

    reset: function () { Camera.x = 0; Camera.y = 0; Camera.shakeMag = 0; Camera.shakeTime = 0; Camera.ox = 0; Camera.oy = 0; },

    // Theo nhân vật: giữ nhân vật ở 38% chiều ngang màn hình (như MVP).
    follow: function (target, worldW) {
      var maxX = Math.max(0, worldW - OG.W);
      Camera.x = OG.util.clamp(target.x - OG.W * 0.38, 0, maxX);
    },

    // Rung màn hình: mag (px), dur (giây).
    shake: function (mag, dur) {
      Camera.shakeMag = Math.max(Camera.shakeMag, mag || 6);
      Camera.shakeTime = Math.max(Camera.shakeTime, dur || 0.3);
    },

    update: function (dt) {
      if (Camera.shakeTime > 0) {
        Camera.shakeTime -= dt;
        var m = Camera.shakeMag * Math.max(0, Math.min(1, Camera.shakeTime * 4));
        Camera.ox = (Math.random() * 2 - 1) * m;
        Camera.oy = (Math.random() * 2 - 1) * m;
        if (Camera.shakeTime <= 0) { Camera.shakeMag = 0; Camera.ox = 0; Camera.oy = 0; }
      }
    },

    // Áp dụng phép dịch thế giới -> màn hình. Gọi sau ctx.save().
    apply: function (ctx) {
      ctx.translate(-Math.round(Camera.x) + Camera.ox, -Math.round(Camera.y) + Camera.oy);
    },

    // Chuyển toạ độ màn hình -> thế giới.
    toWorld: function (sx, sy) { return { x: sx + Camera.x, y: sy + Camera.y }; }
  });
})();
