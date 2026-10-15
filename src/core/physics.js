/* OG.Physics — trọng lực + va chạm nền một chiều (đáp từ trên xuống), giống hệt MVP.
 * Body: {x, y, w, h, vx, vy, ground} — x,y là góc trên-trái hitbox, đơn vị pixel thế giới. */
(function () {
  'use strict';
  var OG = window.OG;

  OG.Physics = {
    // Hình chữ nhật giao nhau.
    aabb: function (a, b) { return OG.util.overlap(a, b); },

    // Di chuyển body 1 bước: áp trọng lực, dịch x (kẹp trong [minX,maxX-w]), dịch y, đáp nền.
    // platforms: [{x,y,w,h}]. opts: {gravity, maxFall, minX, maxX}.
    // Trả về {landed: bool, prevBottom: number}.
    moveBody: function (body, dt, platforms, opts) {
      opts = opts || {};
      var C = OG.Config;
      var g = opts.gravity != null ? opts.gravity : C.GRAVITY;
      var maxFall = opts.maxFall != null ? opts.maxFall : C.MAX_FALL;
      var minX = opts.minX != null ? opts.minX : 0;
      var maxX = opts.maxX != null ? opts.maxX : Infinity;

      body.vy = Math.min(maxFall, body.vy + g * dt);
      var oldY = body.y;
      var wasGround = body.ground;
      body.x = Math.max(minX, Math.min(maxX - body.w, body.x + body.vx * dt));
      body.y += body.vy * dt;
      body.ground = false;
      for (var i = 0; i < platforms.length; i++) {
        var a = platforms[i];
        if (body.vy >= 0 && oldY + body.h <= a.y + 8 && body.y + body.h >= a.y && body.x + body.w > a.x && body.x < a.x + a.w) {
          body.y = a.y - body.h;
          body.vy = 0;
          body.ground = true;
        }
      }
      return { landed: body.ground && !wasGround, prevBottom: oldY + body.h };
    },

    // Kiểm tra "giẫm": body đang rơi và đáy ở frame trước nằm trên đỉnh target (+tolerance).
    isStomp: function (body, prevBottom, target, tolerance) {
      return body.vy > 0 && prevBottom <= target.y + (tolerance == null ? 12 : tolerance) && OG.util.overlap(body, target);
    }
  };
})();
