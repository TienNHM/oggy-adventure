// @ts-check
/* ============================================================================
 * OG.Bosses 'joey' — TRÙM JOEY (thủ lĩnh nhỏ con, nhanh nhẹn, màn roof)
 * ----------------------------------------------------------------------------
 * Vai trò:      Định nghĩa trùm Joey và đăng ký vào OG.Bosses lúc load. Scene 'boss' gọi
 *               OG.Bosses.create('joey', arena); trio.js gọi lại OG.Bosses.factories.joey (bản thu nhỏ).
 * Khái niệm:    boss state machine · telegraph (cúi người + mũi tên, giơ nắp chai) · ngắm bắn parabol
 *               (giải phương trình chuyển động để đạn rơi đúng chỗ sau T giây) · đạn phản được (reflect) ·
 *               gọi lính có giới hạn (spawn cap) · "chạy trốn" sau khi trúng đòn
 * Bài học:      docs/learn/09-ai-ke-dich-boss.md
 * Phụ thuộc:    LÚC LOAD: OG.Bosses.kit (load SAU src/bosses/bosses.js), OG.util. LÚC CHẠY: OG.font,
 *               arena.spawnEnemy (scene cung cấp; thiếu thì đòn 'summon' đổi thành 'throw').
 * Event:        phát: (chỉ các event chung của kit: 'boss:phase', 'boss:hit' khi đạn phản trúng) · nghe: (không)
 * API công khai: OG.Bosses.factories.joey(arena, cfg) · đăng ký trùm id 'joey' · K.drawers.cap
 * Đọc tiếp:     src/bosses/marky.js (bẫy, sóng, boomerang) → src/bosses/trio.js
 *
 * Đòn đánh (mỗi đòn đều báo trước):
 *   dash   — cúi người + mũi tên đỏ (0,55/0,45/0,35 s) rồi lao vụt qua sân tới tường.
 *   throw  — giơ tay cầm nắp chai + chấm than, ném 1 (pha 1) / 3 (pha 2–3) nắp chai theo đường vòng cung.
 *            Nắp chai có thể ĐÁNH BẬT bằng E/J (nút ✦) để bay ngược trúng Joey.
 *   hop    — (pha 3) nhảy lên rồi rải 3 nắp chai từ trên không.
 *   summon — (pha 2+) thổi còi 📣, gọi 1–2 gián con (tối đa 3 con cùng lúc).
 *   rest   — thở dốc sau chuỗi đòn: cơ hội giẫm đầu.
 * Điểm yếu: giẫm đầu bất cứ lúc nào Joey không lao/nhảy (mũi tên vàng "GIẪM!").
 * Sau khi trúng đòn Joey bật nhảy trốn sang phía bên kia sân.
 * Trạng thái: intro · idle · dashWind → dash → skid · throwWind → throw · hop · summonWind → summon · rest · flee
 * ========================================================================== */
(function () {
  'use strict';
  var OG = window.OG;
  if (!OG || !OG.Bosses || !OG.Bosses.kit) return;
  var K = OG.Bosses.kit;
  var U = OG.util;

  /** @type {BossSpec} */
  var SPEC = {
    id: 'joey', name: 'Joey', charId: 'joey', maxHp: 6, scale: 2, baseW: 30, baseH: 40,
    phaseAt: [4, 2],
    phaseLines: {
      2: 'Joey nổi điên! Hắn gọi cả đàn gián con!',
      3: 'Joey tăng tốc tối đa! Coi chừng mưa nắp chai!'
    },
    // Mỗi chuỗi kết thúc bằng 'rest' → luôn có khoảng hở định kỳ, kể cả ở pha 3.
    patterns: {
      1: ['dash', 'throw', 'rest'],
      2: ['dash', 'throw', 'summon', 'dash', 'throw', 'rest'],
      3: ['dash', 'hop', 'summon', 'dash', 'throw', 'rest']
    }
  };

  var CAP_G = 900;       // px/giây²: trọng lực riêng của nắp chai (bay vòng cung dễ đọc)
  var MAX_MINIONS = 3;   // số gián con tối đa cùng lúc trên sân

  // Vẽ nắp chai: đĩa bạc viền răng cưa, xoay khi bay (chiều xoay theo hướng bay). Gốc = tâm nắp.
  K.drawers.cap = function (ctx, p) {
    ctx.translate(p.x, p.y);
    ctx.rotate(p.t * 14 * (p.vx < 0 ? -1 : 1));
    ctx.fillStyle = p.reflected ? '#7fe0ff' : '#c9ced6';
    ctx.strokeStyle = '#17233d'; ctx.lineWidth = 1.5;
    // viền răng cưa: 16 đỉnh xen kẽ bán kính r và r − 2,5
    ctx.beginPath();
    for (var k = 0; k < 16; k++) {
      var rr = k % 2 ? p.r : p.r - 2.5, a = k * Math.PI / 8;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e5484d';
    ctx.beginPath(); ctx.arc(0, 0, p.r * 0.45, 0, Math.PI * 2); ctx.fill();
  };

  /**
   * Tạo một Joey (dùng cho trận đơn và cho trio).
   * @param {Object} arena  đấu trường (Arena)
   * @param {BossCfg} [cfg]  ngoài các field chung còn đọc cfg.summonCount, cfg.capCount
   * @returns {Object} BossInstance
   */
  function create(arena, cfg) {
    cfg = cfg || {};
    var b = K.createBase(SPEC, arena, cfg);
    var floorY = K.floorY(arena);
    b.dashDir = -1;     // hướng lao: 1 = phải, -1 = trái (chốt lúc bắt đầu telegraph)
    b.thrown = false;   // đòn 'hop' đã rải nắp chai chưa (chỉ rải 1 lần ở đỉnh cú nhảy)

    function speed(arr) { return b.byPhase(arr) * b.speedMul; }

    // Tay cầm nắp chai (để ném & vẽ), toạ độ thế giới.
    function handPos() { return { x: b.cx() + b.face * b.w * 0.35, y: b.y + b.h * 0.2 }; }

    /**
     * Ném n nắp chai về phía người chơi theo cung parabol, rải cách nhau `spread` px quanh vị trí người chơi.
     * 💡 Khái niệm: ngắm bắn bằng phương trình chuyển động. Muốn đạn tới điểm (tx, py) sau đúng T giây:
     *   x(T) = x0 + vx·T  →  vx = (tx − x0) / T
     *   y(T) = y0 + vy·T + ½·g·T²  →  vy = (py − y0 − ½·g·T²) / T
     *   T cố định nên mọi cú ném có cùng "nhịp" — người chơi đọc được thời điểm né.
     * @param {Object} arena
     * @param {number} n  số nắp chai
     * @param {number} spread  khoảng cách giữa các điểm rơi (px)
     * @param {number} [flight=0.85]  thời gian bay T (giây)
     */
    function throwCaps(arena, n, spread, flight) {
      var h = handPos();
      var px = K.pcx(arena), py = K.player(arena).y + K.player(arena).h * 0.5;
      var T = flight || 0.85;
      for (var i = 0; i < n; i++) {
        // off: lệch đối xứng quanh người chơi, vd n = 3 → −spread, 0, +spread
        var off = (i - (n - 1) / 2) * spread;
        var tx = U.clamp(px + off, 20, K.width(arena) - 20);
        K.spawnProj(b, {
          kind: 'cap', x: h.x, y: h.y, r: 9,
          vx: (tx - h.x) / T,
          vy: (py - h.y - 0.5 * CAP_G * T * T) / T,
          g: CAP_G, life: 3.5, maxBounces: 1, reflectable: true
        });
      }
      K.puff(arena, h.x, h.y, '#ffffff', 4, 80);
    }

    // Gọi lính: số lượng theo pha, nhưng không vượt MAX_MINIONS con sống cùng lúc (spawn cap).
    function summon(arena) {
      var count = b.cfg.summonCount || (b.p() >= 3 ? 2 : 1);
      var room = Math.max(0, MAX_MINIONS - K.aliveMinions(arena));
      count = Math.min(count, room);
      if (!count) { K.text(arena, b.cx(), b.y - 20, 'Hết lính rồi?!', '#ffffff'); return; }
      var W = K.width(arena), px = K.pcx(arena);
      // Xuất hiện ở phía xa người chơi; base đủ xa mép để tuần tra trong sân.
      var spots = px < W / 2 ? [W - 230, W - 380] : [230, 380];
      for (var i = 0; i < count; i++) {
        var x = spots[i % spots.length];
        K.call(arena, 'spawnEnemy', { type: 'roach', x: x, range: 150, speed: 85 + 15 * b.p(), dir: x < px ? 1 : -1 });
        K.puff(arena, x + 17, floorY - 14, '#b56bc7', 12, 180);
        K.text(arena, x + 17, floorY - 40, 'Gián con!', '#f29bb8');
      }
    }

    // Joey dễ giẫm: mọi trạng thái trừ lao / nhảy / chạy trốn.
    b.isVulnerable = function () {
      return ['rest', 'throwWind', 'throw', 'summonWind', 'summon', 'skid', 'wait', 'idle'].indexOf(b.state) >= 0;
    };
    b.isFullHurt = function () { return b.state === 'dash' || b.state === 'hop' || b.state === 'flee'; };

    b.startAction = function (a, arena) {
      b.faceToPlayer(arena);
      switch (a) {
        case 'dash':
          // Chốt hướng lao NGAY lúc telegraph: người chơi né sang chỗ khác thì Joey vẫn lao theo hướng cũ.
          b.dashDir = b.dirToPlayer(arena);
          b.face = b.dashDir;
          b.setState('dashWind', b.byPhase([0.55, 0.45, 0.35]));
          break;
        case 'throw':
          b.setState('throwWind', b.byPhase([0.65, 0.55, 0.45]));
          break;
        case 'hop':
          b.vy = -640;
          b.vx = 0;
          b.thrown = false;
          b.setState('hop', 3);
          break;
        case 'summon':
          // Sân đã đủ lính hoặc scene không cho gọi lính → thay bằng đòn ném (AI luôn có phương án dự phòng).
          if (K.aliveMinions(arena) >= MAX_MINIONS || typeof arena.spawnEnemy !== 'function') { b.startAction('throw', arena); return; }
          b.setState('summonWind', 0.8);
          break;
        case 'rest':
          b.setState('rest', b.byPhase([1.9, 1.5, 1.2]) / b.speedMul);
          break;
        default:
          b.setState('idle', 0.6);
      }
    };

    b.think = function (dt, arena) {
      var s = b.state;
      // Luôn quay mặt về người chơi, TRỪ khi đang lao / trượt / chạy trốn (hướng đã chốt).
      if (s !== 'dash' && s !== 'flee' && s !== 'skid') b.faceToPlayer(arena);
      switch (s) {
        case 'intro':
          b.vx = 0; b.setAnim('victory');
          if (b.stateT > 0.05 && !b._introToast) {
            b._introToast = true;
            if (!b.ctrl) K.call(arena, 'toast', 'Joey: "Bắt được tao không?" — Mẹo: E/J (✦) đánh bật nắp chai!');
          }
          if (b.stateDone()) b.choose(arena);
          break;
        case 'idle':
          b.vx = 0; b.setAnim('idle');
          if (b.stateDone()) b.choose(arena);
          break;
        case 'dashWind':
          b.vx = 0; b.setAnim('attack');
          if (Math.random() < dt * 14) K.puff(arena, b.cx() - b.dashDir * b.w * 0.4, floorY - 4, '#e8d7b0', 2, 70);
          if (b.stateDone()) b.setState('dash', 3);
          break;
        case 'dash':
          b.face = b.dashDir;
          b.vx = b.dashDir * speed([400, 480, 560]);
          b.setAnim('run');
          if (Math.random() < dt * 20) K.puff(arena, b.cx() - b.dashDir * b.w * 0.5, floorY - 4, '#e8d7b0', 1, 60);
          if (b.hitWall === b.dashDir || b.stateDone()) {
            K.call(arena, 'shake', 4, 0.15);
            b.setState('skid', 0.35);
          }
          break;
        case 'skid':
          // Phanh gấp: còn 1% vận tốc sau 1 giây (damping độc lập frame rate).
          b.vx *= Math.pow(0.01, dt); b.setAnim('idle');
          if (b.stateDone()) { b.vx = 0; b.choose(arena); }
          break;
        case 'throwWind':
          b.vx = 0; b.setAnim('attack');
          if (b.stateDone()) {
            var n = b.cfg.capCount || b.byPhase([1, 3, 3]);
            throwCaps(arena, n, 80, b.byPhase([0.9, 0.85, 0.72]));
            b.setState('throw', 0.4);
          }
          break;
        case 'throw':
          b.vx = 0; b.setAnim('attack');
          if (b.stateDone()) b.choose(arena);
          break;
        case 'hop':
          b.vx = 0;
          b.setAnim(b.vy < 0 ? 'jump' : 'fall');
          // vy đổi dấu từ âm sang ≥ 0 = vừa qua ĐỈNH cú nhảy → rải nắp chai đúng một lần (cờ b.thrown).
          if (!b.thrown && b.vy >= 0) { b.thrown = true; throwCaps(arena, 3, 110, 0.6); }
          if (b.ground && b.stateT > 0.15) { K.call(arena, 'shake', 3, 0.15); b.setState('idle', 0.3); }
          break;
        case 'summonWind':
          b.vx = 0; b.setAnim('victory');
          if (b.stateDone()) { summon(arena); b.setState('summon', 0.45); }
          break;
        case 'summon':
          b.vx = 0; b.setAnim('idle');
          if (b.stateDone()) b.choose(arena);
          break;
        case 'rest':
          b.vx = 0; b.setAnim('idle');
          if (Math.random() < dt * 3) K.puff(arena, b.cx() + b.face * 10, b.y + 10, '#9ce7f1', 1, 40);
          if (b.stateDone()) b.choose(arena);
          break;
        case 'flee':
          b.setAnim(b.vy < 0 ? 'jump' : 'fall');
          if (b.ground && b.stateT > 0.15) { b.vx = 0; b.choose(arena); }
          break;
        default:
          b.setState('idle', 0.5);
      }
    };

    // Trúng đòn: bật nhảy trốn sang phía có nhiều chỗ trống hơn (đang ở nửa trái → nhảy sang phải).
    b.onHurt = function (arena) {
      var W = K.width(arena);
      var dir = b.cx() < W / 2 ? 1 : -1;
      b.vx = dir * 300 * b.speedMul;
      b.vy = -560;
      b.face = dir;
      b.setState('flee', 3);
    };

    // Lớp sau thân: vùng đỏ trên đường lao (từ Joey tới tường), đậm dần theo tiến độ telegraph.
    b.drawBehind = function (ctx, arena, t) {
      if (b.state === 'dashWind') {
        var k = b.stateT / Math.max(0.01, b.stateDur);
        var W = K.width(arena);
        var x0 = b.dashDir > 0 ? b.x + b.w : 0, x1 = b.dashDir > 0 ? W : b.x;
        K.drawWarnZone(ctx, x0, x1 - x0, floorY, t, k, 18);
      }
    };

    // Lớp trước thân: bong bóng, mũi tên, nắp chai trên tay, nốt nhạc còi, giọt mồ hôi.
    b.drawFront = function (ctx, arena, t) {
      var s = b.state;
      if (s === 'dashWind') {
        K.drawBubble(ctx, b.cx(), b.y - 10, t, '!');
        K.drawArrow(ctx, b.cx() + b.dashDir * (b.w * 0.6), b.y + b.h * 0.45, b.dashDir, t);
      } else if (s === 'throwWind') {
        K.drawBubble(ctx, b.cx(), b.y - 10, t, '!');
        var h = handPos();
        // ⚠️ Bẫy: drawers.cap tự translate/rotate mà không restore → phải bọc save/restore, nếu không
        //   mọi thứ vẽ sau (thanh máu, đạn) sẽ bị lệch và xoay theo.
        ctx.save();
        K.drawers.cap(ctx, { x: h.x, y: h.y - 6 - Math.sin(b.stateT * 20) * 3, r: 9, t: 0, vx: 0 });
        ctx.restore();
      } else if (s === 'summonWind') {
        K.drawBubble(ctx, b.cx(), b.y - 10, t, '📣', '#17233d');
        ctx.save();
        ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#17233d'; ctx.lineWidth = 3;
        ctx.font = OG.font(18, 'bold'); ctx.textAlign = 'center';
        // nốt nhạc bay chéo lên theo stateT
        var nx = b.cx() + b.face * (30 + b.stateT * 50), ny = b.y + 6 - b.stateT * 30;
        ctx.strokeText('♪', nx, ny); ctx.fillText('♪', nx, ny);
        ctx.restore();
      } else if (s === 'rest') {
        // giọt mồ hôi chảy xuống, lặp mỗi 20 px
        ctx.save();
        ctx.fillStyle = '#9ce7f1';
        var dy = (b.stateT * 40) % 20;
        ctx.beginPath(); ctx.ellipse(b.cx() - b.face * b.w * 0.45, b.y + 8 + dy, 4, 6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    };

    return b;
  }

  // 🧪 Thử: đổi CAP_G 900 → 300 — nắp chai bay theo cung PHẲNG hơn nhưng vẫn rơi đúng chỗ người chơi sau
  //   cùng T giây (vì vy được tính lại theo g). Đổi MAX_MINIONS 3 → 1 để trận pha 2 bớt rối.
  OG.Bosses.factories.joey = create;
  OG.Bosses.register({
    id: 'joey', name: 'Joey', maxHp: SPEC.maxHp,
    arena: {
      width: 960,
      // Mái nhà: 2 ống khói làm bục ở y=370, 1 bục cao giữa sân để né mưa nắp chai.
      platforms: [[0, 480, 960, 60], [120, 370, 170, 18], [670, 370, 170, 18], [395, 265, 170, 18]],
      spawn: { x: 80, y: 420 },
      theme: 'roof'
    },
    create: function (arena) { return create(arena, { x: 760 }); }
  });
})();
