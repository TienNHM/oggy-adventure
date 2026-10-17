// @ts-check
/* ============================================================================
 * OG.Physics — TRỌNG LỰC + VA CHẠM NỀN MỘT CHIỀU (one-way platform) + AABB
 * ----------------------------------------------------------------------------
 * Vai trò:      Bộ vật lý tối giản dùng chung cho người chơi, kẻ địch và trùm. Player/Enemies/BossScene
 *               gọi moveBody() mỗi frame để áp trọng lực, di chuyển và đáp xuống nền; Level/BossScene
 *               gọi isStomp() để xét "giẫm" lên kẻ địch.
 * Khái niệm:    trọng lực & vận tốc · tích phân Euler (cập nhật v rồi x theo dt) · AABB (hình chữ nhật thẳng trục) ·
 *               one-way platform (chỉ đáp được từ trên xuống) · terminal velocity · xét giẫm bằng đáy frame TRƯỚC
 * Bài học:      docs/learn/04-vat-ly-va-cham-aabb.md
 * Phụ thuộc:    OG.Config.GRAVITY/MAX_FALL, OG.util.overlap (đọc LÚC CHẠY)
 * Event:        phát: (không) · nghe: (không) — module "thuần tính toán", người gọi tự phát event (vd player:land)
 * API công khai: OG.Physics.moveBody(body, dt, platforms, opts), OG.Physics.aabb(a, b),
 *               OG.Physics.isStomp(body, prevBottom, target, tolerance)
 * Đọc tiếp:     src/game/player.js (dùng moveBody + phát player:land) → src/game/level.js (stompOk, touchOk)
 *               → src/game/difficulty.js (nới hitbox theo độ khó)
 * Dữ liệu:      PhysicsBody, Platform, MoveResult, AABB trong src/types.d.ts.
 *               Hệ toạ độ: px thế giới, x,y = góc TRÊN-TRÁI hitbox, trục y hướng XUỐNG (vy > 0 = đang rơi).
 * ========================================================================== */

/**
 * @typedef {Object} MoveOptions  tuỳ chọn của moveBody (thiếu field nào thì lấy mặc định)
 * @property {number} [gravity]  gia tốc rơi, px/giây² (mặc định OG.Config.GRAVITY)
 * @property {number} [maxFall]  vận tốc rơi tối đa, px/giây (mặc định OG.Config.MAX_FALL)
 * @property {number} [minX]     biên trái, px (mặc định 0)
 * @property {number} [maxX]     biên phải, px — mép PHẢI body không vượt quá (mặc định Infinity)
 */
(function () {
  'use strict';
  var OG = window.OG;

  // Dung sai khi đáp nền, px: đáy body ở frame trước được phép thấp hơn mặt bục tối đa chừng này
  // mà vẫn tính là "đứng trên" — bù sai số làm tròn khi đứng yên trên bục.
  var LAND_TOLERANCE = 8;
  var DEFAULT_STOMP_TOLERANCE = 12; // dung sai mặc định khi xét giẫm, px

  OG.Physics = {
    /**
     * Kiểm tra hai hitbox giao nhau (bí danh của OG.util.overlap).
     * @param {AABB} a
     * @param {AABB} b
     * @returns {boolean}
     */
    aabb: function (a, b) { return OG.util.overlap(a, b); },

    /**
     * Di chuyển body MỘT bước: áp trọng lực, dịch x (kẹp trong [minX, maxX − w]), dịch y, rồi đáp nền.
     * Hàm SỬA trực tiếp body (x, y, vy, ground); không đổi vx.
     * @param {PhysicsBody} body vật thể cần di chuyển (bị SỬA trực tiếp)
     * @param {number} dt delta time (khoảng thời gian giữa 2 frame), giây
     * @param {AABB[]} platforms danh sách nền/bục, toạ độ thế giới
     * @param {MoveOptions} [opts]
     * @returns {MoveResult} landed = vừa chạm đất ở frame này; prevBottom = đáy hitbox ở frame trước
     * @example
     *   var r = OG.Physics.moveBody(p, dt, st.platforms, { maxX: st.width });
     *   if (r.landed) OG.Events.emit(OG.EV.PLAYER_LAND, { x: p.x, y: p.y, vy: 0 });
     */
    moveBody: function (body, dt, platforms, opts) {
      opts = opts || {};
      var C = OG.Config;
      var g = opts.gravity != null ? opts.gravity : C.GRAVITY;
      var maxFall = opts.maxFall != null ? opts.maxFall : C.MAX_FALL;
      var minX = opts.minX != null ? opts.minX : 0;
      var maxX = opts.maxX != null ? opts.maxX : Infinity;

      // 💡 Khái niệm: tích phân Euler bán ẩn (semi-implicit Euler) — cập nhật vận tốc TRƯỚC (v += a·dt)
      //   rồi dùng vận tốc mới để cập nhật vị trí (x += v·dt). Đơn giản, đủ ổn định cho game platformer.
      //   Kẹp vy ở maxFall (terminal velocity — vận tốc rơi giới hạn) để rơi lâu không nhanh vô hạn:
      //   người chơi vẫn kịp nhìn và điều khiển khi rơi từ trên cao.
      body.vy = Math.min(maxFall, body.vy + g * dt);
      var oldY = body.y;
      var wasGround = body.ground;
      body.x = Math.max(minX, Math.min(maxX - body.w, body.x + body.vx * dt));
      body.y += body.vy * dt;
      body.ground = false;
      for (var i = 0; i < platforms.length; i++) {
        var plat = platforms[i];
        // 💡 Khái niệm: one-way platform — chỉ chặn khi (1) đang rơi xuống, (2) frame TRƯỚC đáy body còn ở
        //   trên mặt bục, (3) frame này đáy đã chạm/xuyên mặt bục, (4) chồng nhau theo trục x.
        //   Nhảy từ dưới lên thì điều kiện (2) sai → đi xuyên qua bục như Mario.
        // ⚠️ Bẫy: phải dùng oldY (đáy frame trước) cho điều kiện (2). Nếu dùng body.y mới thì khi rơi nhanh,
        //   một frame đã đi quá mặt bục mỏng → không bao giờ thoả "ở trên" → rơi xuyên.
        var wasAbove = oldY + body.h <= plat.y + LAND_TOLERANCE;
        var reachedTop = body.y + body.h >= plat.y;
        var overlapX = body.x + body.w > plat.x && body.x < plat.x + plat.w;
        if (body.vy >= 0 && wasAbove && reachedTop && overlapX) {
          body.y = plat.y - body.h;  // đặt chân đúng lên mặt bục
          body.vy = 0;
          body.ground = true;
        }
      }
      // 🧪 Thử: đổi OG.Config.MAX_FALL 900 → 3000 trong console rồi rơi từ bục cao: rơi nhanh hơn hẳn,
      //   nhưng nhờ so sánh với oldY vẫn không xuyên sàn.
      return { landed: body.ground && !wasGround, prevBottom: oldY + body.h };
    },

    /**
     * Kiểm tra "giẫm": body đang rơi, đáy ở frame trước nằm trên đỉnh target (+ dung sai) và hai hitbox giao nhau.
     * @param {PhysicsBody} body người giẫm (thường là player)
     * @param {number} prevBottom đáy body ở frame TRƯỚC, px (lấy từ MoveResult.prevBottom)
     * @param {AABB} target hitbox bị giẫm
     * @param {number} [tolerance=12] dung sai, px — lớn hơn thì "dễ giẫm" hơn
     * @returns {boolean}
     * @example
     *   var r = OG.Physics.moveBody(p, dt, plats);
     *   if (OG.Physics.isStomp(p, r.prevBottom, enemy)) { enemy.alive = false; p.vy = -OG.Config.STOMP_BOUNCE; }
     */
    isStomp: function (body, prevBottom, target, tolerance) {
      // 💡 Khái niệm: phân biệt "giẫm" và "bị chạm" bằng HƯỚNG đi tới, không chỉ bằng việc giao nhau:
      //   cùng một lần chồng hitbox, nếu frame trước chân còn ở trên đầu địch thì là giẫm, ngược lại là bị thương.
      return body.vy > 0 && prevBottom <= target.y + (tolerance == null ? DEFAULT_STOMP_TOLERANCE : tolerance) && OG.util.overlap(body, target);
    }
  };
})();
