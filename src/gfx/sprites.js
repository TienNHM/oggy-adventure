/* OG.Sprites — vẽ nhân vật bằng Canvas. [STUB — agent Sprites sẽ viết lại]
 * Chủ sở hữu: agent Sprites (src/gfx/).
 *
 * HỢP ĐỒNG (bắt buộc giữ nguyên chữ ký):
 *   OG.Sprites.init()
 *   OG.Sprites.drawCharacter(ctx, charId, animState, t, opts)
 *     - Trước khi gọi, caller đã ctx.translate tới ĐIỂM CHÂN: giữa-đáy hitbox (x + w/2, y + h).
 *     - charId: oggy | jack | olivia | joey | marky | deedee | roach | (id đăng ký thêm)
 *     - animState: idle | run | jump | fall | hurt | attack | victory  (tuỳ chọn: stunned, dead, walk)
 *     - t: thời gian (giây) để chạy animation
 *     - opts: { face: 1|-1, skin: skinId|null, colors: {...} (đè màu), scale: 1, alpha: 1,
 *               flash: false (nháy trắng khi trúng đòn), w, h (kích thước hitbox), vx, vy }
 *     - Không được làm rò trạng thái ctx (luôn save/restore).
 *   OG.Sprites.getAnimStates() -> mảng animState hỗ trợ
 * Bản stub dưới đây vẽ lại đúng hình Oggy và gián của MVP (đổi màu theo skin). */
(function () {
  'use strict';
  var OG = window.OG;
  var fillRound = OG.util.fillRound;

  // Oggy kiểu MVP, khung 34x52, gốc toạ độ góc trên-trái.
  function drawCat(ctx, c) {
    fillRound(ctx, 5, 43, 13, 10, 5, c.feet);
    fillRound(ctx, 20, 43, 13, 10, 5, c.feet);
    fillRound(ctx, 3, 16, 31, 32, 13, c.body);
    ctx.fillStyle = c.ear; ctx.beginPath(); ctx.arc(4, 8, 9, 0, 7); ctx.arc(32, 8, 9, 0, 7); ctx.fill();
    ctx.fillStyle = c.head; ctx.beginPath(); ctx.ellipse(18, 14, 21, 19, 0, 0, 7); ctx.fill();
    ctx.fillStyle = c.muzzle; ctx.beginPath(); ctx.ellipse(18, 20, 13, 8, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'white'; ctx.beginPath(); ctx.ellipse(12, 9, 6, 8, 0, 0, 7); ctx.ellipse(24, 9, 6, 8, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#17233d'; ctx.beginPath(); ctx.arc(13, 10, 2.5, 0, 7); ctx.arc(25, 10, 2.5, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(18, 20, 2, 0, 7); ctx.fill();
    ctx.strokeStyle = '#17233d'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(18, 23, 5, 0.15, 2.8); ctx.stroke();
    if (c.accent) { ctx.fillStyle = c.accent; ctx.fillRect(3, 30, 31, 4); }
  }

  // Gián kiểu MVP, khung 34x33 (thân 8..29, chân tới 33), gốc góc trên-trái.
  function drawRoach(ctx, c) {
    fillRound(ctx, 0, 8, 34, 21, 11, c.body);
    ctx.fillStyle = c.shell; ctx.beginPath(); ctx.arc(16, 10, 13, Math.PI, 0); ctx.fill();
    ctx.fillStyle = 'white'; ctx.beginPath(); ctx.arc(11, 9, 5, 0, 7); ctx.arc(23, 9, 5, 0, 7); ctx.fill();
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(12, 10, 2, 0, 7); ctx.arc(24, 10, 2, 0, 7); ctx.fill();
    ctx.strokeStyle = c.leg; ctx.lineWidth = 2;
    for (var i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.moveTo(4 + i * 3, 26); ctx.lineTo(-3 + i * 3, 33); ctx.moveTo(24 + i * 3, 26); ctx.lineTo(31 + i * 3, 33); ctx.stroke();
    }
  }

  var ANIMS = ['idle', 'run', 'jump', 'fall', 'hurt', 'attack', 'victory'];

  OG.Sprites = {
    init: function () {},
    getAnimStates: function () { return ANIMS.slice(); },

    drawCharacter: function (ctx, charId, animState, t, opts) {
      opts = opts || {};
      var ch = OG.Data.getCharacter(charId);
      var colors = OG.Data.resolveColors(ch.id, opts.skin);
      if (opts.colors) for (var k in opts.colors) colors[k] = opts.colors[k];
      var w = opts.w || ch.w, h = opts.h || ch.h;
      var scale = opts.scale || 1;
      ctx.save();
      if (opts.alpha != null) ctx.globalAlpha *= opts.alpha;
      // Nhún nhẹ khi chạy (stub đơn giản).
      var bob = animState === 'run' ? Math.abs(Math.sin(t * 14)) * -2 : 0;
      ctx.translate(0, bob);
      ctx.scale((opts.face || 1) < 0 ? -scale : scale, scale);
      if (ch.role === 'player') {
        ctx.scale(w / 34, h / 52);
        ctx.translate(-17, -52);
        drawCat(ctx, colors);
      } else {
        // Gián: co giãn theo hitbox.
        ctx.scale(w / 34, h / 28);
        ctx.translate(-17, -33);
        drawRoach(ctx, colors);
      }
      ctx.restore();
    }
  };
})();
