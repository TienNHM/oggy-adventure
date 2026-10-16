/* Hành trình "vietnam" — PHẦN MỞ RỘNG: kẻ địch riêng.
 * Chủ sở hữu v2: agent journey-vietnam (CHỈ src/journeys/vietnam/). Hợp đồng: docs/STORY.md mục 2.8.
 * - Kẻ địch 'vietnam-roach': gián con đội nón lá, đi tuần chậm rãi, giẫm "bẹp" như gián thường.
 *   Tốc độ lấy từ e.speed (OG.Difficulty tự nhân hệ số). Thiếu OG.Enemies -> bỏ qua (màn dùng 'roach' dự phòng).
 * Trùm: dùng trùm có sẵn (joey, marky, deedee, trio) — xem journey.js. */
(function () {
  'use strict';
  var OG = window.OG;
  var INK = '#17233d';

  // Nón lá tí hon: (0,0) = chóp nón ở đỉnh đầu, w = bề rộng vành.
  function tinyHat(ctx, w, tilt) {
    ctx.save();
    ctx.rotate(tilt || 0);
    ctx.beginPath();
    ctx.moveTo(-w / 2, 0); ctx.quadraticCurveTo(0, 4, w / 2, 0); ctx.lineTo(1, -w * 0.45); ctx.lineTo(-1, -w * 0.45); ctx.closePath();
    ctx.fillStyle = '#f3dc9b'; ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.strokeStyle = 'rgba(160,120,50,0.7)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-w * 0.25, -w * 0.22); ctx.lineTo(w * 0.25, -w * 0.22); ctx.stroke();
    ctx.restore();
  }

  if (OG.Enemies && typeof OG.Enemies.registerType === 'function') {
    OG.Enemies.registerType('vietnam-roach', {
      w: 34, h: 28, score: 50,
      update: function (e, dt) {
        e.x += e.dir * e.speed * dt;
        if (e.x - e.base > e.range) { e.x = e.base + e.range; e.dir = -1; }
        else if (e.base - e.x > e.range) { e.x = e.base - e.range; e.dir = 1; }
      },
      draw: function (ctx, e, t) {
        ctx.save();
        ctx.translate(e.x + e.w / 2, e.y + e.h);
        if (!e.alive) {
          // bẹp dí hài hước rồi mờ dần, nón lá bay lên
          ctx.globalAlpha = Math.max(0, 1 - e.deadT * 2);
          ctx.save(); ctx.translate(0, -e.h - 10 - e.deadT * 60); tinyHat(ctx, 26, e.deadT * 6); ctx.restore();
          ctx.scale(1.2, 0.35);
        }
        if (OG.Sprites && OG.Sprites.drawCharacter) {
          OG.Sprites.drawCharacter(ctx, 'roach', e.alive ? 'run' : 'hurt', e.t, { face: e.dir, w: e.w, h: e.h, time: t });
        }
        if (e.alive) {
          var bob = Math.abs(Math.sin(e.t * 8)) * 1.5;
          ctx.save(); ctx.translate(e.dir * 3, -e.h + 4 - bob); tinyHat(ctx, 26, e.dir * 0.12); ctx.restore();
        }
        ctx.restore();
      }
    });
  }
})();
