// @ts-check
/* ============================================================================
 * OG.Player — NHÂN VẬT NGƯỜI CHƠI: điều khiển, vật lý, bị thương, trạng thái hoạt ảnh (animation state)
 * ----------------------------------------------------------------------------
 * Vai trò:      Tạo object người chơi từ dữ liệu nhân vật, cập nhật mỗi frame theo input (chạy, nhảy, hành động),
 *               xử lý bị thương và vẽ. Scene 'level' và 'boss' gọi create() khi vào màn, update()/draw() mỗi frame.
 *               Logic giữ nguyên MVP (tốc độ 255, nhảy 590, trọng lực 1500); độ khó (OG.Difficulty) chỉnh thêm.
 * Khái niệm:    đọc input → đặt vận tốc → giao cho vật lý · coyote time (nhảy muộn) & jump buffer (bấm nhảy sớm) ·
 *               nhảy cao theo thời gian giữ phím (variable jump height) · invulnerability frames (bất tử sau khi trúng đòn) ·
 *               knockback · animation state machine suy ra từ trạng thái vật lý · phát event thay vì gọi Audio trực tiếp
 * Bài học:      docs/learn/03-input.md, docs/learn/04-vat-ly-va-cham-aabb.md, docs/learn/06-event-bus-observer.md
 * Phụ thuộc:    OG.Config, OG.Data.getCharacter, OG.Input, OG.Physics.moveBody, OG.Difficulty.get (tuỳ chọn),
 *               OG.Game (run, hud, loseLife, refreshHud), OG.Camera.shake, OG.DOM.toast, OG.Sprites.drawCharacter,
 *               OG.Shop.tickPlayer (tuỳ chọn). OG.Config đọc LÚC LOAD (biến C); còn lại đọc LÚC CHẠY.
 * Event:        phát: 'player:jump' {charId, x, y}, 'player:action' {x, y, face}, 'player:land' {x, y, vy},
 *               'player:hurt' {lives, cause, shielded} · nghe: (không)
 * API công khai: OG.Player.create(charId, x, y, mods, skinId), update(p, dt, world), animState(p), hurt(p, cause), draw(ctx, p, t)
 * Đọc tiếp:     src/core/physics.js (moveBody) → src/game/difficulty.js (coyoteTime, jumpBuffer...) → src/game/level.js
 * Dữ liệu:      Player (src/types.d.ts). x,y = góc TRÊN-TRÁI hitbox, px thế giới; vx/vy px/giây.
 * ========================================================================== */
(function () {
  'use strict';
  var OG = window.OG;
  var C = OG.Config;

  var ATTACK_TIME = 0.3;          // thời gian giữ trạng thái 'attack' sau khi bấm hành động, giây
  var HURT_ANIM_TIME = 0.4;       // 0.4 giây ĐẦU của thời gian bất tử hiện hoạt ảnh 'hurt', giây
  var SHIELD_INVULN = 1.0;        // bất tử sau khi khiên đỡ đòn, giây
  var HURT_SHAKE_MAG = 5;         // rung màn hình khi bị thương, px
  var HURT_SHAKE_DUR = 0.25;      // giây
  var RUN_SPEED_MIN = 1;          // |vx| lớn hơn mức này (px/giây) mới coi là đang chạy
  var BLINK_RATE = 12;            // số nửa-chu-kỳ nhấp nháy mỗi giây khi bất tử
  var BLINK_ALPHA = 0.45;         // độ trong suốt ở pha "tắt" của nhấp nháy
  var SHIELD_PULSE_SPEED = 6;     // tốc độ nhấp nháy viền khiên, radian/giây

  /**
   * Đọc tham số độ khó (an toàn khi OG.Difficulty chưa có hoặc lỗi).
   * @param {string} key vd 'coyoteTime'
   * @param {number} fallback giá trị khi không có
   * @returns {number}
   */
  function diff(key, fallback) {
    var v = OG.Difficulty && OG.Difficulty.get ? OG.util.safe('Difficulty.get', OG.Difficulty.get, OG.Difficulty, [key]) : undefined;
    return typeof v === 'number' ? v : fallback;
  }

  var Player = (OG.Player = {
    /**
     * Tạo object người chơi mới đứng tại (x, y).
     * @param {string} charId id nhân vật (id lạ → Oggy)
     * @param {number} x góc trên-trái hitbox, px thế giới
     * @param {number} y góc trên-trái hitbox, px thế giới
     * @param {{shield?: number, magnet?: number, speedMul?: number, jumpMul?: number}} [mods] chỉ số cộng thêm
     *   từ vật phẩm cửa hàng (OG.Game.levelMods): số khiên, bán kính nam châm (px), hệ số tốc độ/nhảy
     * @param {string | null} [skinId]
     * @returns {Player}
     * @example
     *   var p = OG.Player.create('oggy', level.spawn.x, level.spawn.y, OG.Game.levelMods(level.id), run.skinId);
     */
    create: function (charId, x, y, mods, skinId) {
      var ch = OG.Data.getCharacter(charId);
      mods = mods || {};
      return {
        charId: ch.id, skin: skinId || null,
        x: x, y: y, w: ch.w, h: ch.h, vx: 0, vy: 0, ground: false, face: 1, inv: 0,
        shield: mods.shield | 0, magnet: mods.magnet || 0,
        speed: (ch.speed || C.MOVE_SPEED) * (mods.speedMul || 1),
        jumpV: (ch.jump || C.JUMP_VELOCITY) * (mods.jumpMul || 1),
        anim: 'idle', animT: 0, prevBottom: y + ch.h, celebrate: false, attackT: 0,
        coyote: 0, jumpBuf: 0, invMax: C.HURT_INVULN, safeX: x, safeY: y
      };
    },

    /**
     * Cập nhật người chơi 1 frame: input → vận tốc → nhảy → vật lý → hoạt ảnh. SỬA trực tiếp p.
     * Phát 'player:jump', 'player:action', 'player:land' khi các việc đó xảy ra.
     * @param {Player} p
     * @param {number} dt delta time (khoảng thời gian giữa 2 frame), giây
     * @param {{platforms: Platform[], width: number}} world nền/bục và bề rộng thế giới (px)
     * @returns {MoveResult} kết quả moveBody — prevBottom dùng để xét giẫm kẻ địch
     */
    update: function (p, dt, world) {
      var keys = OG.Input.keys;
      p.inv = Math.max(0, p.inv - dt);
      p.attackT = Math.max(0, p.attackT - dt);

      // ---- Chạy ngang: không có gia tốc/quán tính, buông phím là dừng ngay (dễ điều khiển cho trẻ em) ----
      // Giữ cả trái lẫn phải → move = 0 (hai phím triệt tiêu nhau).
      var move = p.celebrate ? 0 : (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      p.vx = move * p.speed;
      if (move) p.face = /** @type {1|-1} */ (move);

      // ---- Nhảy ----
      // 💡 Khái niệm: coyote time — vẫn cho nhảy thêm một chút sau khi rời mép bục (như con sói trong
      //   phim hoạt hình chạy quá mép vực mới rơi). Jump buffer — bấm nhảy hơi SỚM trước khi chạm đất vẫn được
      //   tính. Cả hai là đồng hồ đếm ngược (giây); độ dài lấy từ OG.Difficulty (chế độ 'kid' dài hơn).
      var coyoteT = diff('coyoteTime', 0), bufT = diff('jumpBuffer', 0);
      p.coyote = p.ground ? coyoteT : Math.max(0, p.coyote - dt);
      p.jumpBuf = OG.Input.pressed('jump') ? bufT : Math.max(0, p.jumpBuf - dt);
      // Nhảy khi: (đang giữ nhảy VÀ đứng trên đất) hoặc (có cú bấm trong buffer VÀ đứng đất/còn coyote).
      // ⚠️ Bẫy: điều kiện thứ nhất dùng keys.jump (GIỮ) nên giữ phím nhảy thì vừa chạm đất là nảy tiếp — hành vi
      //   kế thừa từ MVP (bé chỉ cần giữ nút). Đổi sang pressed() sẽ đổi cảm giác điều khiển của cả game.
      if (!p.celebrate && ((keys.jump && p.ground) || (p.jumpBuf > 0 && (p.ground || p.coyote > 0)))) {
        if (!p.ground) OG.Input.consume('jump'); // nhảy coyote: không tính là nhảy đôi (Shop)
        p.vy = -p.jumpV;  // y hướng xuống nên nhảy lên = vận tốc ÂM
        p.ground = false;
        p.coyote = 0; p.jumpBuf = 0;
        OG.Events.emit('player:jump', { charId: p.charId, x: p.x, y: p.y });
      }
      if (!p.celebrate && OG.Input.pressed('action')) {
        p.attackT = ATTACK_TIME;
        OG.Events.emit('player:action', { x: p.x + p.w / 2, y: p.y + p.h / 2, face: p.face });
      }

      // ---- Trọng lực theo độ khó ----
      // 💡 Khái niệm: variable jump height — khi đang bay lên mà vẫn GIỮ nút nhảy, trọng lực nhỏ hơn
      //   (jumpHoldGravityMul < 1) → bay cao hơn; buông sớm → nhảy thấp. Lúc rơi có thể rơi chậm hơn (kid).
      var g = C.GRAVITY;
      if (p.vy < 0 && keys.jump && !p.celebrate) g *= diff('jumpHoldGravityMul', 1);
      else if (p.vy >= 0) g *= diff('fallGravityMul', 1);
      var res = OG.Physics.moveBody(p, dt, world.platforms, {
        minX: 0, maxX: world.width, gravity: g, maxFall: C.MAX_FALL * diff('maxFallMul', 1)
      });
      p.prevBottom = res.prevBottom;
      // Player chỉ "thông báo" tiếp đất; Audio phát tiếng, Sprites/Level tạo bụi — loose coupling qua event bus.
      if (res.landed) OG.Events.emit('player:land', { x: p.x, y: p.y, vy: 0 });
      // Vật phẩm cửa hàng cần chạy mỗi frame (Giày lò xo = nhảy đôi). Shop tự chống gọi trùng trong 1 frame.
      OG.util.call('Shop', 'tickPlayer', p, dt);

      // ---- Hoạt ảnh: đổi trạng thái thì đếm lại animT từ 0 để hoạt ảnh mới chạy từ khung đầu ----
      var anim = Player.animState(p);
      if (anim !== p.anim) { p.anim = anim; p.animT = 0; } else p.animT += dt;
      return res;
    },

    /**
     * Suy ra tên hoạt ảnh từ trạng thái hiện tại của người chơi.
     * 💡 Khái niệm: animation state machine "suy diễn" — không lưu cờ isJumping/isRunning riêng, mà đọc thẳng
     *   từ vật lý (ground, vy, vx) theo thứ tự ưu tiên. Không bao giờ lệch giữa hình vẽ và trạng thái thật.
     * @param {Player} p
     * @returns {'victory'|'hurt'|'attack'|'jump'|'fall'|'run'|'idle'}
     */
    animState: function (p) {
      if (p.celebrate) return 'victory';
      if (p.inv > (p.invMax || C.HURT_INVULN) - HURT_ANIM_TIME) return 'hurt';
      if (p.attackT > 0) return 'attack';
      if (!p.ground) return p.vy < 0 ? 'jump' : 'fall';
      if (Math.abs(p.vx) > RUN_SPEED_MIN) return 'run';
      return 'idle';
    },

    /**
     * Xử lý người chơi bị thương: khiên đỡ (nếu có), hoặc bất tử + bật lùi + mất mạng (OG.Game.loseLife).
     * Phát 'player:hurt' (và gián tiếp 'lives:change', có thể 'player:die' / 'game:over' qua OG.Game).
     * @param {Player} p (bị SỬA: inv, vx, vy, shield)
     * @param {string} cause 'enemy' | 'fall' | 'boss' | 'projectile' ...
     * @returns {boolean} true nếu mất mạng (false nếu đang bất tử hoặc khiên đỡ)
     */
    hurt: function (p, cause) {
      // 💡 Khái niệm: invulnerability frames — trong p.inv giây sau khi trúng đòn, mọi đòn khác bị bỏ qua.
      //   Không có nó, đứng chồng lên gián một giây = mất cả 3 mạng (mỗi frame một lần trúng).
      if (p.inv > 0) return false;
      if (p.shield > 0) {
        p.shield--;
        p.inv = SHIELD_INVULN;
        OG.Game.hud.shield = p.shield;
        OG.Events.emit('player:hurt', { lives: OG.Game.run ? OG.Game.run.lives : 0, cause: cause, shielded: true });
        OG.Game.refreshHud();
        return false;
      }
      // 🧪 Thử: trong console gõ  OG.Config.HURT_BOUNCE = 800  rồi chạm gián — Oggy bị hất bổng lên cao.
      p.inv = p.invMax = diff('hurtInvuln', C.HURT_INVULN);
      p.vy = -C.HURT_BOUNCE;
      // Knockback (bật lùi) ngược hướng mặt: ý đồ là đẩy người chơi ra khỏi kẻ địch.
      // ⚠️ Bẫy: update() frame sau gán lại p.vx = move * speed (không có quán tính) nên vx đặt ở đây bị ghi đè
      //   ngay — knockback NGANG gần như không có tác dụng, chỉ cú bật lên (vy) là thấy rõ. Muốn bật lùi thật
      //   phải có bộ đếm "đang bị đẩy" và tạm bỏ qua input trong lúc đó (đổi hành vi, cân nhắc kỹ).
      p.vx = -p.face * C.HURT_KNOCKBACK * diff('hurtKnockMul', 1);
      OG.Camera.shake(HURT_SHAKE_MAG, HURT_SHAKE_DUR);
      // ⚠️ Bẫy: phát player:hurt TRƯỚC loseLife để thứ tự event là hurt -> (die -> game:over).
      //   Vì vậy payload phải "đoán trước" số mạng còn lại (predicted) thay vì đọc sau khi trừ.
      var predicted = Math.max(0, (OG.Game.run ? OG.Game.run.lives : 1) - 1);
      OG.Events.emit('player:hurt', { lives: predicted, cause: cause, shielded: false });
      var lives = OG.Game.loseLife(cause);
      if (lives > 0) {
        var name = OG.Data.getCharacter(p.charId).name;
        OG.DOM.toast(cause === 'fall' ? 'Ối! ' + name + ' rơi mất rồi!'
          : cause === 'boss' ? 'Ối! Trúng đòn của trùm!'
          : cause === 'projectile' ? 'Ối! Coi chừng đồ bay tới!'
          : 'Ôi! Cẩn thận mấy chú gián!');
      }
      return true;
    },

    /**
     * Vẽ nhân vật (gọi trong không gian thế giới, sau OG.Camera.apply). Cân bằng save/restore.
     * @param {CanvasRenderingContext2D} ctx
     * @param {Player} p
     * @param {number} t thời gian, giây
     */
    draw: function (ctx, p, t) {
      ctx.save();
      // Điểm neo vẽ = GIỮA-ĐÁY hitbox (chân) — hợp đồng với OG.Sprites (docs/ARCHITECTURE.md mục 3).
      ctx.translate(p.x + p.w / 2, p.y + p.h);
      // Nhấp nháy khi bất tử: floor(inv·12) chẵn/lẻ đổi 12 lần mỗi giây → báo cho người chơi "đang được bảo vệ".
      var blink = p.inv > 0 && Math.floor(p.inv * BLINK_RATE) % 2 === 0;
      OG.Sprites.drawCharacter(ctx, p.charId, p.anim, p.animT, {
        face: p.face, skin: p.skin, w: p.w, h: p.h, alpha: blink ? BLINK_ALPHA : 1,
        flash: p.anim === 'hurt', vx: p.vx, vy: p.vy, time: t,
        worldX: p.x + p.w / 2, worldY: p.y + p.h // vị trí chân trong thế giới (bụi chạy của Sprites)
      });
      // Viền khiên: elip nhấp nháy quanh thân (toạ độ đã dịch về chân nên tâm thân ở y = −h/2).
      if (p.shield > 0) {
        ctx.strokeStyle = '#7fe0ff'; ctx.lineWidth = 3; ctx.globalAlpha = 0.6 + Math.sin(t * SHIELD_PULSE_SPEED) * 0.2;
        ctx.beginPath(); ctx.ellipse(0, -p.h / 2, p.w * 0.9, p.h * 0.7, 0, 0, 7); ctx.stroke();
      }
      ctx.restore();
    }
  });
})();
