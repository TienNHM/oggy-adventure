// @ts-check
/* ============================================================================
 * Hành trình "vietnam" — PHẦN MỞ RỘNG: KẺ ĐỊCH RIÊNG 'vietnam-roach'
 * ----------------------------------------------------------------------------
 * Vai trò:      Đăng ký loại kẻ địch "gián đội nón lá" vào registry OG.Enemies để journey.js dùng theo tên.
 * Khái niệm:    registry loại kẻ địch (strategy pattern: mỗi loại mang update + draw riêng) · AI tuần tra ·
 *               delta time · tái dùng sprite có sẵn rồi vẽ thêm phụ kiện · hoạt ảnh chết theo deadT
 * Bài học:      docs/learn/09-ai-ke-dich-boss.md · docs/learn/12-data-driven-man-cau-do-hanh-trinh.md
 * Phụ thuộc:    OG.Enemies.registerType (LOAD; thiếu thì bỏ qua) · OG.Sprites.drawCharacter (lúc CHẠY)
 * Event:        (không)
 * API công khai: (không) — đăng ký loại 'vietnam-roach'
 * Đọc tiếp:     src/game/enemies.js (create, update, vòng đời) → src/journeys/science/extras.js (thêm 2 loại khác)
 * Dữ liệu:      EnemyTypeDef, Enemy (src/types.d.ts)
 *
 * - Kẻ địch 'vietnam-roach': gián con đội nón lá, đi tuần chậm rãi, giẫm "bẹp" như gián thường.
 *   Tốc độ lấy từ e.speed (OG.Difficulty tự nhân hệ số). Thiếu OG.Enemies -> bỏ qua (màn dùng 'roach' dự phòng).
 * Trùm: dùng trùm có sẵn (joey, marky, deedee, trio) — xem journey.js.
 * Hệ toạ độ: e.x, e.y = góc trên-trái hộp va chạm (thế giới, px); draw dời gốc về tâm chân (y âm = lên trên).
 * ========================================================================== */
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
      // 💡 Khái niệm: AI tuần tra dùng delta time — quãng đi mỗi frame = speed (px/giây) × dt (giây), nên
      //   máy 30 FPS hay 144 FPS thì gián vẫn đi cùng tốc độ. Chạm biên ±range quanh e.base: kẹp lại rồi quay đầu.
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
          // deadT = số giây kể từ lúc bị giẫm: alpha về 0 sau 0.5 giây, nón bay lên 60 px/giây và xoay dần.
          // Nón vẽ TRƯỚC scale(1.2, 0.35) để không bị bẹp theo thân.
          ctx.globalAlpha = Math.max(0, 1 - e.deadT * 2);
          ctx.save(); ctx.translate(0, -e.h - 10 - e.deadT * 60); tinyHat(ctx, 26, e.deadT * 6); ctx.restore();
          ctx.scale(1.2, 0.35);
        }
        if (OG.Sprites && OG.Sprites.drawCharacter) {
          OG.Sprites.drawCharacter(ctx, 'roach', e.alive ? 'run' : 'hurt', e.t, { face: e.dir, w: e.w, h: e.h, time: t });
        }
        if (e.alive) {
          // 🧪 Thử: đổi hệ số 1.5 thành 8 — nón lá nảy tưng tưng trên đầu theo nhịp bước chân.
          var bob = Math.abs(Math.sin(e.t * 8)) * 1.5;
          ctx.save(); ctx.translate(e.dir * 3, -e.h + 4 - bob); tinyHat(ctx, 26, e.dir * 0.12); ctx.restore();
        }
        ctx.restore();
      }
    });
  }
})();
