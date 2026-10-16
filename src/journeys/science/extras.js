/* Hành trình "science" — PHẦN MỞ RỘNG: kẻ địch riêng (dễ thương, chậm, giẫm được).
 * Chủ sở hữu v2: agent journey-science (CHỈ src/journeys/science/). Hợp đồng: docs/STORY.md mục 2.8.
 *   science-crab        cua đỏ đi ngang ở đáy biển (khu ocean)
 *   science-astroroach  gián con đội mũ phi hành gia trong suốt (khu space)
 * Tốc độ dùng e.speed (OG.Difficulty tự nhân hệ số). Thiếu OG.Enemies thì bỏ qua (màn dùng gián thường). */
(function () {
  'use strict';
  var OG = window.OG;
  if (!OG.Enemies || typeof OG.Enemies.registerType !== 'function') return;

  var TAU = Math.PI * 2;
  var INK = '#17233d';

  // Đi qua lại ±range quanh base.
  function patrol(e, dt) {
    e.x += e.dir * e.speed * dt;
    if (e.x - e.base > e.range) { e.x = e.base + e.range; e.dir = -1; }
    else if (e.base - e.x > e.range) { e.x = e.base - e.range; e.dir = 1; }
  }

  // Bị giẫm: bẹp dẹt rồi mờ dần (hài hước, không đáng sợ).
  function squash(ctx, e) {
    if (e.alive) return;
    ctx.globalAlpha = Math.max(0, 1 - e.deadT * 2);
    ctx.scale(1.25, 0.35);
  }

  // ---- Cua đỏ đi ngang ----
  OG.Enemies.registerType('science-crab', {
    w: 40, h: 26, score: 50,
    update: function (e, dt) { patrol(e, dt); },
    draw: function (ctx, e, t) {
      ctx.save();
      ctx.translate(e.x + e.w / 2, e.y + e.h);
      squash(ctx, e);
      var step = e.alive ? Math.sin(e.t * 14) * 3 : 0;
      ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineCap = 'round';
      // chân
      for (var i = -1; i <= 1; i += 2) {
        for (var k = 0; k < 3; k++) {
          ctx.beginPath(); ctx.moveTo(i * 10, -8); ctx.lineTo(i * (18 + k * 3), -2 + (k % 2 ? step : -step) * 0.6); ctx.stroke();
        }
      }
      // càng giơ lên vẫy
      var wave = e.alive ? Math.sin(e.t * 5) * 0.3 : 0;
      for (var c = -1; c <= 1; c += 2) {
        ctx.save(); ctx.translate(c * 16, -16); ctx.rotate(c * (0.5 + wave));
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -8); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, -12, 6, 0.6, TAU - 0.6); ctx.lineTo(0, -12); ctx.closePath();
        ctx.fillStyle = '#ff6b4a'; ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      // thân
      ctx.beginPath(); ctx.ellipse(0, -10, 16, 11, 0, 0, TAU); ctx.fillStyle = '#ff6b4a'; ctx.fill(); ctx.stroke();
      // mắt trên cuống
      for (var m = -1; m <= 1; m += 2) {
        ctx.beginPath(); ctx.moveTo(m * 5, -18); ctx.lineTo(m * 6, -25); ctx.stroke();
        ctx.beginPath(); ctx.arc(m * 6, -27, 4, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.stroke();
        ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(m * 6 + e.dir, -27, 1.8, 0, TAU); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(0, -9, 4, 0.2, Math.PI - 0.2); ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = 'rgba(255,200,200,0.7)'; ctx.beginPath(); ctx.arc(-9, -7, 2.5, 0, TAU); ctx.arc(9, -7, 2.5, 0, TAU); ctx.fill();
      ctx.restore();
    }
  });

  // ---- Gián phi hành gia ----
  OG.Enemies.registerType('science-astroroach', {
    w: 34, h: 28, score: 50,
    init: function (e) { e.floatT = Math.random() * 3; },
    update: function (e, dt) { patrol(e, dt); },
    draw: function (ctx, e, t) {
      ctx.save();
      ctx.translate(e.x + e.w / 2, e.y + e.h);
      squash(ctx, e);
      if (OG.Sprites && OG.Sprites.drawCharacter) {
        OG.Sprites.drawCharacter(ctx, 'roach', e.alive ? 'run' : 'hurt', e.t, { face: e.dir, w: e.w, h: e.h, accessory: 'helmet' });
      } else {
        ctx.beginPath(); ctx.ellipse(0, -12, 16, 11, 0, 0, TAU); ctx.fillStyle = '#8a5a32'; ctx.fill();
      }
      // mũ kính trong suốt + ăng-ten nhỏ
      ctx.beginPath(); ctx.arc(e.dir * 9, -20, 12, 0, TAU);
      ctx.fillStyle = 'rgba(190,235,255,0.35)'; ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(e.dir * 9, -20, 8, -2.4, -1.6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(e.dir * 9, -32); ctx.lineTo(e.dir * 9, -38); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = Math.sin(e.t * 6) > 0 ? '#ff7d5c' : '#ffd23f';
      ctx.beginPath(); ctx.arc(e.dir * 9, -40, 3, 0, TAU); ctx.fill();
      ctx.restore();
    }
  });
})();
