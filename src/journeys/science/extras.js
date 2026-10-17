// @ts-check
/* ============================================================================
 * Hành trình "science" — PHẦN MỞ RỘNG: KẺ ĐỊCH RIÊNG (dễ thương, chậm, giẫm được)
 * ----------------------------------------------------------------------------
 * Vai trò:      Đăng ký 2 loại kẻ địch riêng của hành trình science vào registry của OG.Enemies, để
 *               journey.js chỉ cần ghi { type: 'science-crab', x, range, speed } trong dữ liệu màn.
 * Khái niệm:    extension point / registry loại kẻ địch (strategy pattern: mỗi loại tự mang hàm update + draw,
 *               engine gọi qua cùng một giao diện) · AI tuần tra (patrol) · delta time · kiểm tra phòng thủ
 *               (defensive check: thiếu module thì bỏ qua, không làm vỡ game)
 * Bài học:      docs/learn/09-ai-ke-dich-boss.md · docs/learn/12-data-driven-man-cau-do-hanh-trinh.md
 * Phụ thuộc:    OG.Enemies.registerType (LOAD — thiếu thì cả file bỏ qua) · OG.Sprites.drawCharacter (lúc CHẠY, tuỳ chọn)
 * Event:        (không) — việc phát 'enemy:stomp' do src/game/level.js lo
 * API công khai: (không) — đăng ký loại 'science-crab', 'science-astroroach'
 * Đọc tiếp:     src/game/enemies.js (registerType, roach gốc, vòng đời enemy) → src/journeys/science/journey.js
 * Dữ liệu:      EnemyTypeDef, Enemy, EnemySpawn (src/types.d.ts)
 *
 *   science-crab        cua đỏ đi ngang ở đáy biển (khu ocean)
 *   science-astroroach  gián con đội mũ phi hành gia trong suốt (khu space)
 * Tốc độ dùng e.speed (OG.Difficulty tự nhân hệ số). Thiếu OG.Enemies thì bỏ qua (màn dùng gián thường).
 * Hệ toạ độ: e.x, e.y là góc trên-trái hộp va chạm (thế giới, px); hàm draw dời gốc về TÂM CHÂN
 *   (e.x + e.w/2, e.y + e.h) nên mọi hình vẽ dùng y âm (hướng lên trên).
 * ========================================================================== */
(function () {
  'use strict';
  var OG = window.OG;
  if (!OG.Enemies || typeof OG.Enemies.registerType !== 'function') return;

  var TAU = Math.PI * 2;
  var INK = '#17233d';

  // 💡 Khái niệm: AI tuần tra — mỗi frame tiến e.speed × dt (px/giây × giây = px) theo hướng e.dir;
  //   chạm biên ±range quanh điểm gốc e.base thì kẹp lại và quay đầu. Nhân dt nên tốc độ không phụ thuộc FPS.
  // ⚠️ Bẫy: khi vượt biên, hãy KẸP e.x về biên và gán hướng TUYỆT ĐỐI (dir = -1 / 1). Nếu chỉ đảo dir
  //   (`e.dir *= -1`, như 'roach' gốc trong src/game/enemies.js) mà frame sau dt nhỏ hơn frame trước, địch lùi
  //   chưa đủ để vào lại trong biên → bị đảo hướng lần nữa → đi ra xa hơn, có thể rung tại chỗ ở mép.
  /**
   * Cho kẻ địch đi qua lại ±range quanh base (SỬA trực tiếp e.x, e.dir).
   * @param {Enemy} e
   * @param {number} dt  delta time (khoảng thời gian giữa 2 frame), giây
   */
  function patrol(e, dt) {
    e.x += e.dir * e.speed * dt;
    if (e.x - e.base > e.range) { e.x = e.base + e.range; e.dir = -1; }
    else if (e.base - e.x > e.range) { e.x = e.base - e.range; e.dir = 1; }
  }

  // Bị giẫm: bẹp dẹt rồi mờ dần (hài hước, không đáng sợ).
  // Mờ hết sau 0.5 giây (1 − deadT × 2 = 0) — khớp với lúc OG.Enemies ngừng vẽ xác (deadT > 0.5).
  // scale(1.25, 0.35) quanh gốc = tâm chân nên hình bẹp xuống mặt đất chứ không bẹp lơ lửng.
  function squash(ctx, e) {
    if (e.alive) return;
    ctx.globalAlpha = Math.max(0, 1 - e.deadT * 2);
    ctx.scale(1.25, 0.35);
  }

  // ---- Cua đỏ đi ngang ----
  // Mẫu EnemyTypeDef: w, h = kích thước hộp va chạm (px) · score = điểm khi giẫm · update(e, dt) = AI ·
  // draw(ctx, e, t) = vẽ (toạ độ thế giới). Engine tạo object e từ EnemySpawn rồi gọi các hàm này mỗi frame.
  // 🧪 Thử: đổi h: 26 thành h: 60 rồi vào màn đáy biển: cua vẫn vẽ như cũ nhưng hộp va chạm cao hơn
  //   — Oggy "giẫm" được cả khi chân còn cách mai cua một khoảng (hình và hitbox lệch nhau).
  OG.Enemies.registerType('science-crab', {
    w: 40, h: 26, score: 50,
    update: function (e, dt) { patrol(e, dt); },
    draw: function (ctx, e, t) {
      ctx.save();
      ctx.translate(e.x + e.w / 2, e.y + e.h);
      squash(ctx, e);
      // Hoạt ảnh theo e.t (giây sống của địch, mỗi con lệch pha ngẫu nhiên) → các con không bước đều tăm tắp.
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
    init: function (e) { e.floatT = Math.random() * 3; },   // gọi 1 lần khi tạo địch (sau khi engine dựng e)
    update: function (e, dt) { patrol(e, dt); },
    draw: function (ctx, e, t) {
      ctx.save();
      ctx.translate(e.x + e.w / 2, e.y + e.h);
      squash(ctx, e);
      // Tái dùng hình gián chuẩn của OG.Sprites rồi vẽ thêm mũ; thiếu Sprites thì vẽ hình bầu dục dự phòng.
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
