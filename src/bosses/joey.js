/* Trùm 'joey' — Joey, thủ lĩnh nhỏ con và nhanh nhẹn (màn roof).
 * Chủ sở hữu: agent Bosses. Load SAU src/bosses/bosses.js.
 *
 * Đòn đánh (mỗi đòn đều báo trước):
 *   dash   — cúi người + mũi tên đỏ (0,55/0,45/0,35 s) rồi lao vụt qua sân tới tường.
 *   throw  — giơ tay cầm nắp chai + chấm than, ném 1 (pha 1) / 3 (pha 2–3) nắp chai theo đường vòng cung.
 *            Nắp chai có thể ĐÁNH BẬT bằng E/J (nút ✦) để bay ngược trúng Joey.
 *   hop    — (pha 3) nhảy lên rồi rải 3 nắp chai từ trên không.
 *   summon — (pha 2+) thổi còi 📣, gọi 1–2 gián con (tối đa 3 con cùng lúc).
 *   rest   — thở dốc sau chuỗi đòn: cơ hội giẫm đầu.
 * Điểm yếu: giẫm đầu bất cứ lúc nào Joey không lao/nhảy (mũi tên vàng "GIẪM!").
 * Sau khi trúng đòn Joey bật nhảy trốn sang phía bên kia sân. */
(function () {
  'use strict';
  var OG = window.OG;
  if (!OG || !OG.Bosses || !OG.Bosses.kit) return;
  var K = OG.Bosses.kit;
  var U = OG.util;

  var SPEC = {
    id: 'joey', name: 'Joey', charId: 'joey', maxHp: 6, scale: 2, baseW: 30, baseH: 40,
    phaseAt: [4, 2],
    phaseLines: {
      2: 'Joey nổi điên! Hắn gọi cả đàn gián con!',
      3: 'Joey tăng tốc tối đa! Coi chừng mưa nắp chai!'
    },
    patterns: {
      1: ['dash', 'throw', 'rest'],
      2: ['dash', 'throw', 'summon', 'dash', 'throw', 'rest'],
      3: ['dash', 'hop', 'summon', 'dash', 'throw', 'rest']
    }
  };

  var CAP_G = 900; // trọng lực riêng của nắp chai (bay vòng cung dễ đọc)

  // Vẽ nắp chai: đĩa bạc viền răng cưa, xoay khi bay.
  K.drawers.cap = function (ctx, p) {
    ctx.translate(p.x, p.y);
    ctx.rotate(p.t * 14 * (p.vx < 0 ? -1 : 1));
    ctx.fillStyle = p.reflected ? '#7fe0ff' : '#c9ced6';
    ctx.strokeStyle = '#17233d'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (var k = 0; k < 16; k++) {
      var rr = k % 2 ? p.r : p.r - 2.5, a = k * Math.PI / 8;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e5484d';
    ctx.beginPath(); ctx.arc(0, 0, p.r * 0.45, 0, Math.PI * 2); ctx.fill();
  };

  function create(arena, cfg) {
    cfg = cfg || {};
    var b = K.createBase(SPEC, arena, cfg);
    var floorY = K.floorY(arena);
    b.dashDir = -1;
    b.thrown = false;

    function speed(arr) { return b.byPhase(arr) * b.speedMul; }

    // Tay cầm nắp chai (để ném & vẽ).
    function handPos() { return { x: b.cx() + b.face * b.w * 0.35, y: b.y + b.h * 0.2 }; }

    // Ném n nắp chai về phía người chơi theo cung parabol, rải theo khoảng cách spread.
    function throwCaps(arena, n, spread, flight) {
      var h = handPos();
      var px = K.pcx(arena), py = K.player(arena).y + K.player(arena).h * 0.5;
      var T = flight || 0.85;
      for (var i = 0; i < n; i++) {
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

    function summon(arena) {
      var count = b.cfg.summonCount || (b.p() >= 3 ? 2 : 1);
      var room = Math.max(0, 3 - K.aliveMinions(arena));
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

    b.isVulnerable = function () {
      return ['rest', 'throwWind', 'throw', 'summonWind', 'summon', 'skid', 'wait', 'idle'].indexOf(b.state) >= 0;
    };
    b.isFullHurt = function () { return b.state === 'dash' || b.state === 'hop' || b.state === 'flee'; };

    b.startAction = function (a, arena) {
      b.faceToPlayer(arena);
      switch (a) {
        case 'dash':
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
          if (K.aliveMinions(arena) >= 3 || typeof arena.spawnEnemy !== 'function') { b.startAction('throw', arena); return; }
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

    // Trúng đòn: bật nhảy trốn sang phía có nhiều chỗ trống hơn.
    b.onHurt = function (arena) {
      var W = K.width(arena);
      var dir = b.cx() < W / 2 ? 1 : -1;
      b.vx = dir * 300 * b.speedMul;
      b.vy = -560;
      b.face = dir;
      b.setState('flee', 3);
    };

    b.drawBehind = function (ctx, arena, t) {
      if (b.state === 'dashWind') {
        var k = b.stateT / Math.max(0.01, b.stateDur);
        var W = K.width(arena);
        var x0 = b.dashDir > 0 ? b.x + b.w : 0, x1 = b.dashDir > 0 ? W : b.x;
        K.drawWarnZone(ctx, x0, x1 - x0, floorY, t, k, 18);
      }
    };

    b.drawFront = function (ctx, arena, t) {
      var s = b.state;
      if (s === 'dashWind') {
        K.drawBubble(ctx, b.cx(), b.y - 10, t, '!');
        K.drawArrow(ctx, b.cx() + b.dashDir * (b.w * 0.6), b.y + b.h * 0.45, b.dashDir, t);
      } else if (s === 'throwWind') {
        K.drawBubble(ctx, b.cx(), b.y - 10, t, '!');
        var h = handPos();
        ctx.save(); // drawers.cap tự translate/rotate nên phải bọc save/restore
        K.drawers.cap(ctx, { x: h.x, y: h.y - 6 - Math.sin(b.stateT * 20) * 3, r: 9, t: 0, vx: 0 });
        ctx.restore();
      } else if (s === 'summonWind') {
        K.drawBubble(ctx, b.cx(), b.y - 10, t, '📣', '#17233d');
        ctx.save();
        ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#17233d'; ctx.lineWidth = 3;
        ctx.font = 'bold 18px "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif'; ctx.textAlign = 'center';
        var nx = b.cx() + b.face * (30 + b.stateT * 50), ny = b.y + 6 - b.stateT * 30;
        ctx.strokeText('♪', nx, ny); ctx.fillText('♪', nx, ny);
        ctx.restore();
      } else if (s === 'rest') {
        // giọt mồ hôi
        ctx.save();
        ctx.fillStyle = '#9ce7f1';
        var dy = (b.stateT * 40) % 20;
        ctx.beginPath(); ctx.ellipse(b.cx() - b.face * b.w * 0.45, b.y + 8 + dy, 4, 6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    };

    return b;
  }

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
