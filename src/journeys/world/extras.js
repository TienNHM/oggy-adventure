/* Hành trình "world" — PHẦN MỞ RỘNG: kẻ địch riêng của hành trình.
 * Chủ sở hữu v2: agent journey-world (CHỈ src/journeys/world/). Hợp đồng: docs/STORY.md mục 2.8.
 *
 * 'world-roach': gián con "đi du lịch", mặc đồ theo từng xứ (tinh nghịch, không đáng sợ, giẫm được).
 *   Trong LevelDef: { type: 'world-roach', x, range?, speed?, costume: 'mummy'|'beret'|'headband'|'leaf'|'earmuff' }
 *   Hành vi giống 'roach' (đi qua lại ±range); tốc độ dùng e.speed nên OG.Difficulty tự nhân hệ số. */
(function () {
  'use strict';
  var OG = window.OG;
  if (!OG.Enemies || !OG.Enemies.registerType) return; // phòng thủ: module địch chưa có
  var TAU = Math.PI * 2;
  var INK = '#17233d';

  // Màu thân theo trang phục (gián vẫn tím quen thuộc, riêng xác ướp màu vải).
  var COLORS = {
    mummy: { body: '#e9dcbc', shell: '#f6eedb', leg: '#9c8a66' },
    earmuff: { body: '#7d3e9b', shell: '#b56bc7', leg: '#4b285d' }
  };

  function ell(ctx, x, y, rx, ry, fill, lw) {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (lw) { ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.stroke(); }
  }

  // Phụ kiện vẽ trong hệ toạ độ gián (nhìn sang phải, chân ở y=0, đầu quanh (13,-11)).
  function costume(ctx, kind, t) {
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (kind === 'mummy') {
      // vài dải băng quấn chéo + một dải bay phấp phới
      ctx.strokeStyle = '#c9b88f'; ctx.lineWidth = 1.5;
      for (var i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-14 + i * 7, -20); ctx.lineTo(-10 + i * 7, -5); ctx.stroke(); }
      ctx.strokeStyle = '#f6eedb'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-14, -14); ctx.quadraticCurveTo(-22, -18 + Math.sin(t * 8) * 3, -28, -12 + Math.sin(t * 8 + 1) * 3); ctx.stroke();
    } else if (kind === 'beret') {
      ell(ctx, 13, -18, 8, 3.5, '#2b2b3a', 1.5);
      ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(13, -21); ctx.lineTo(14, -24); ctx.stroke();
      // ria mép nhỏ cho vui
      ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(16, -8); ctx.quadraticCurveTo(19, -6, 21, -9); ctx.stroke();
    } else if (kind === 'headband') {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(7, -17, 12, 3.5);
      ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.strokeRect(7, -17, 12, 3.5);
      ell(ctx, 13, -15.3, 1.6, 1.6, '#e5484d', 0);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(7, -15); ctx.lineTo(1, -13 + Math.sin(t * 9) * 2); ctx.stroke();
    } else if (kind === 'leaf') {
      ctx.save(); ctx.translate(12, -18); ctx.rotate(-0.3 + Math.sin(t * 3) * 0.1);
      ctx.beginPath(); ctx.moveTo(-9, 0); ctx.quadraticCurveTo(0, -9, 9, 0); ctx.quadraticCurveTo(0, 4, -9, 0);
      ctx.fillStyle = '#4caf50'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.3; ctx.stroke();
      ctx.restore();
    } else if (kind === 'earmuff') {
      ctx.strokeStyle = '#e63946'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(13, -12, 7.5, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      ell(ctx, 7, -12, 2.8, 2.8, '#ff8fb1', 1);
      // khăn quàng
      ctx.fillStyle = '#e63946'; ctx.fillRect(4, -7, 10, 3);
      ctx.beginPath(); ctx.moveTo(5, -6); ctx.lineTo(1, -1 + Math.sin(t * 7)); ctx.lineTo(4, -1); ctx.closePath(); ctx.fill();
    }
  }

  OG.Enemies.registerType('world-roach', {
    w: 34, h: 28, score: 50,
    init: function (e, src) { e.costume = src.costume || null; },
    update: function (e, dt) {
      e.x += e.dir * e.speed * dt;
      if (e.x - e.base > e.range) { e.x = e.base + e.range; e.dir = -1; }
      else if (e.base - e.x > e.range) { e.x = e.base - e.range; e.dir = 1; }
    },
    draw: function (ctx, e, t) {
      ctx.save();
      ctx.translate(e.x + e.w / 2, e.y + e.h);
      if (!e.alive) {
        ctx.globalAlpha = Math.max(0, 1 - e.deadT * 2);
        ctx.scale(1.2, 0.35);
      }
      var opts = { face: e.dir, w: e.w, h: e.h, time: t };
      if (COLORS[e.costume]) opts.colors = COLORS[e.costume];
      if (OG.Sprites && OG.Sprites.drawCharacter) OG.Sprites.drawCharacter(ctx, 'roach', e.alive ? 'run' : 'hurt', e.t, opts);
      if (e.costume && e.alive) {
        ctx.save();
        ctx.scale(e.dir < 0 ? -1 : 1, 1);
        try { costume(ctx, e.costume, e.t); } catch (err) { /* phụ kiện hỏng thì bỏ qua */ }
        ctx.restore();
      }
      ctx.restore();
    }
  });
})();
