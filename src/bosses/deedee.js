// @ts-check
/* ============================================================================
 * OG.Bosses 'deedee' — TRÙM DEE DEE (gián to béo phàm ăn, màn kitchen, trùm đầu tiên)
 * ----------------------------------------------------------------------------
 * Vai trò:      Định nghĩa trùm Dee Dee và đăng ký vào OG.Bosses lúc load. Scene 'boss' gọi
 *               OG.Bosses.create('deedee', arena); trio.js gọi lại OG.Bosses.factories.deedee để tạo bản thu nhỏ.
 * Khái niệm:    boss state machine (switch theo b.state) · telegraph → đòn → khoảng hở (roll → dizzy) ·
 *               phase đổi bộ đòn · cơ chế rủi ro/phần thưởng (giật bánh trước khi trùm hồi máu) ·
 *               squash & stretch khi gồng/ăn · đăng ký hàm vẽ đạn theo loại (K.drawers.pot)
 * Bài học:      docs/learn/09-ai-ke-dich-boss.md (ví dụ roll → dizzy) · docs/learn/07-ve-canvas-procedural-cache.md
 * Phụ thuộc:    LÚC LOAD: OG.Bosses.kit (phải load SAU src/bosses/bosses.js), OG.util. LÚC CHẠY: OG.font.
 * Event:        phát: 'boss:heal' (ăn xong hồi máu), 'boss:foodStolen' (người chơi giật bánh lúc trùm đang đi ăn)
 *               + các event chung của kit ('boss:phase') · nghe: (không)
 * API công khai: OG.Bosses.factories.deedee(arena, cfg) · đăng ký trùm id 'deedee' · K.drawers.pot
 * Đọc tiếp:     src/bosses/joey.js (thêm đạn phản được) → src/bosses/marky.js (bẫy + sóng xung kích)
 *
 * Đồ thị trạng thái (state machine):
 *   intro → choose() ─┬→ walk ──(hết giờ)──────────────────────────→ choose()
 *                     ├→ rollWind (telegraph) → roll ─(đâm tường)─┬→ roll (roll3: dội lại 1 lần)
 *                     │                                           └→ dizzy (KHOẢNG HỞ) → choose()
 *                     ├→ potsHop → (chạm đất: rơi xoong) → idle → choose()
 *                     └→ eatWalk → eating ─(xong: +1 máu)→ idle │ (bị giật bánh) → angry → choose()
 *   Trạng thái chung do kit lo: roar (đổi pha), recoil (trúng đòn), breather (kid), wait (trio).
 *
 * Đòn đánh (mỗi đòn đều báo trước):
 *   roll   — cuộn tròn, rung người + mũi tên đỏ chỉ hướng, rồi lăn húc qua sân. Đâm tường thì choáng
 *            (sao xoay) — CƠ HỘI GIẪM ĐẦU. Pha 2+: cú đâm tường làm xoong nồi rơi từ trên kệ (có bóng đổ báo trước).
 *   roll3  — (pha 3) lăn dội tường 1 lần rồi lăn tiếp, lần đâm thứ 2 mới choáng.
 *   pots   — (pha 2+) nhảy dậm bụng, xoong nồi rơi xuống nhiều chỗ (bóng đỏ trên sàn).
 *   eat    — (pha 2+) một miếng bánh rơi xuống; Dee Dee lạch bạch tới ăn để HỒI 1 MÁU.
 *            Người chơi chạm vào bánh trước để giật mất (+50 điểm), hoặc giẫm lúc hắn đang ăn.
 * Điểm yếu: giẫm đầu khi Dee Dee đi bộ, choáng hoặc đang ăn (mũi tên vàng "GIẪM!"). Khi lăn thì chạm là đau.
 * ========================================================================== */

/**
 * @typedef {Object} DeeDeeFood  miếng bánh đang rơi / nằm trên sàn. (x, y) = giữa-ĐÁY miếng bánh, toạ độ thế giới.
 * @property {number} x
 * @property {number} y
 * @property {number} vy  px/giây
 * @property {boolean} landed  đã chạm sàn
 */
(function () {
  'use strict';
  var OG = window.OG;
  if (!OG || !OG.Bosses || !OG.Bosses.kit) return;
  var K = OG.Bosses.kit;
  var U = OG.util;

  /** @type {BossSpec} */
  var SPEC = {
    id: 'deedee', name: 'Dee Dee', charId: 'deedee', maxHp: 5, scale: 1.8, baseW: 50, baseH: 50,
    phaseAt: [3, 1],
    phaseLines: {
      2: 'Dee Dee đói bụng rồi! Giật đồ ăn trước khi hắn hồi máu!',
      3: 'Dee Dee lăn như bánh xe! Coi chừng xoong nồi!'
    },
    // Bộ đòn theo pha: mỗi lần choose() lấy phần tử kế tiếp, hết mảng thì quay lại đầu.
    patterns: {
      1: ['walk', 'roll', 'walk', 'roll'],
      2: ['roll', 'eat', 'walk', 'roll', 'pots'],
      3: ['roll3', 'eat', 'pots', 'roll3']
    }
  };

  var POT_G = 900;             // px/giây²: trọng lực riêng của xoong nồi rơi
  var FOOD_G = 700;            // px/giây²: trọng lực của miếng bánh (rơi chậm hơn để người chơi kịp chạy tới)
  var POT_MIN_GAP = 100;       // px: hai xoong rơi cách nhau ít nhất chừng này để luôn có chỗ né
  var FOOD_STEAL_SCORE = 50;   // điểm thưởng khi giật được bánh

  // Vẽ xoong nồi rơi: (p.x, p.y) = tâm. Hàm được bosses.js bọc save/restore nên tự do translate/rotate.
  K.drawers.pot = function (ctx, p) {
    // bóng đổ báo điểm rơi, càng gần sàn càng đậm (520 px ≈ độ cao rơi lớn nhất)
    var dist = Math.max(0, p.floorY - p.y);
    ctx.save();
    K.drawShadow(ctx, p.x, p.floorY, p.r + 4, 0.25 + 0.5 * (1 - Math.min(1, dist / 520)));
    ctx.restore();
    // thân nồi lắc lư khi rơi
    ctx.translate(p.x, p.y);
    ctx.rotate(Math.sin(p.t * 8) * 0.25);
    ctx.fillStyle = '#4d5666'; ctx.strokeStyle = '#17233d'; ctx.lineWidth = 2;
    U.roundRectPath(ctx, -p.r, -p.r * 0.7, p.r * 2, p.r * 1.5, 6); ctx.fill(); ctx.stroke();
    U.fillRound(ctx, -p.r - 3, -p.r * 0.85, p.r * 2 + 6, 6, 3, '#6c7789');
    ctx.fillStyle = '#17233d';
    ctx.fillRect(p.r, -p.r * 0.4, 9, 4); // cán
  };

  /**
   * Vẽ miếng bánh (đồ ăn hồi máu): bóng đổ khi đang rơi, nhún nhẹ và lấp lánh khi đã nằm trên sàn.
   * @param {CanvasRenderingContext2D} ctx
   * @param {DeeDeeFood} f
   * @param {number} floorY
   * @param {number} t  giây
   */
  function drawFood(ctx, f, floorY, t) {
    if (!f.landed) K.drawShadow(ctx, f.x, floorY, 16, 0.4);
    ctx.save();
    ctx.translate(f.x, f.y);
    var bob = f.landed ? Math.sin(t * 4) * 1.5 : 0;
    ctx.translate(0, bob);
    // miếng bánh tam giác: ruột bánh → lớp kem hồng → quả dâu
    ctx.fillStyle = '#fff6df'; ctx.strokeStyle = '#17233d'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(18, 0); ctx.lineTo(18, -16); ctx.lineTo(-18, -24); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f29bb8';
    ctx.beginPath(); ctx.moveTo(-18, -24); ctx.lineTo(18, -16); ctx.lineTo(18, -11); ctx.lineTo(-18, -18); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e5484d';
    ctx.beginPath(); ctx.arc(-4, -25, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // lấp lánh để người chơi chú ý (bật/tắt 4 lần mỗi giây)
    if (Math.floor(t * 4) % 2 === 0) {
      ctx.fillStyle = '#ffc94a';
      ctx.font = OG.font(14, 'bold'); ctx.textAlign = 'center';
      ctx.fillText('✦', 16, -30);
    }
    ctx.restore();
  }

  /**
   * Tạo một Dee Dee (dùng cho trận đơn và cho trio).
   * @param {Object} arena  đấu trường (Arena)
   * @param {BossCfg} [cfg]
   * @returns {Object} BossInstance
   */
  function create(arena, cfg) {
    cfg = cfg || {};
    var b = K.createBase(SPEC, arena, cfg);
    var floorY = K.floorY(arena);
    b.rollDir = -1;     // hướng lăn: 1 = phải, -1 = trái
    b.rollsLeft = 0;    // số lần còn được đâm tường trước khi choáng (roll = 1, roll3 = 2)
    b.rollAngle = 0;    // góc quay khi lăn (radian), chỉ để vẽ
    /** @type {DeeDeeFood|null} */
    b.food = null;

    // Tốc độ theo pha × hệ số tốc độ (trio chậm hơn ở pha đầu).
    function spd(arr) { return b.byPhase(arr) * b.speedMul; }

    /**
     * Thả n xoong nồi: cái đầu tiên ngay trên đầu người chơi, các cái sau ở chỗ ngẫu nhiên cách nhau ≥ POT_MIN_GAP.
     * Xoong sau bắt đầu cao hơn (y âm hơn) → rơi lần lượt, không cùng lúc.
     */
    function dropPots(arena, n) {
      var W = K.width(arena), px = K.pcx(arena);
      var xs = [U.clamp(px, 30, W - 30)];
      // guard: giới hạn số lần thử — sân hẹp có thể không đủ chỗ cho n vị trí, tránh vòng lặp vô hạn.
      var guard = 0;
      while (xs.length < n && guard++ < 40) {
        var x = U.rand(40, W - 40), ok = true;
        for (var i = 0; i < xs.length; i++) if (Math.abs(xs[i] - x) < POT_MIN_GAP) ok = false;
        if (ok) xs.push(x);
      }
      for (var k = 0; k < xs.length; k++) {
        K.spawnProj(b, {
          kind: 'pot', x: xs[k], y: -40 - k * 70, r: 16, g: POT_G, life: 4, floorY: floorY,
          onFloor: function (p, arena) {
            p.dead = true;
            K.puff(arena, p.x, floorY - 8, '#6c7789', 10, 200);
            K.call(arena, 'shake', 3, 0.12);
          }
        });
      }
    }

    // Thả bánh ở phía xa người chơi (để Dee Dee phải đi, người chơi phải chạy đua).
    function spawnFood(arena) {
      var W = K.width(arena), px = K.pcx(arena);
      var away = -b.dirToPlayer(arena);
      var x = U.clamp(b.cx() + away * 170, 60, W - 60);
      if (Math.abs(x - px) < 200) x = U.clamp(px + (px < W / 2 ? 320 : -320), 60, W - 60);
      // Bánh không rơi dưới mặt quầy: Dee Dee ăn dưới quầy thì người chơi không giẫm được (lỗi "Dee Dee ở bếp").
      x = K.clearSpot(arena, x, b.w / 2 + 4);
      b.food = { x: x, y: -30, vy: 0, landed: false };
      K.text(arena, x, 120, 'Bánh kem!', '#f29bb8');
    }

    // Bánh rơi + kiểm tra người chơi giật bánh. Chạy mỗi frame (cả khi nghỉ thở) — xem b.onBreather.
    function updateFood(dt, arena) {
      var f = b.food;
      if (!f) return;
      if (!f.landed) {
        f.vy += FOOD_G * dt;
        f.y += f.vy * dt;
        if (f.y >= floorY) { f.y = floorY; f.landed = true; K.puff(arena, f.x, floorY - 4, '#fff6df', 6, 90); }
      }
      // Người chơi giật bánh (hitbox 36 × 28 px phía trên điểm đáy f.y).
      if (K.overlapsPlayer(arena, { x: f.x - 18, y: f.y - 28, w: 36, h: 28 })) {
        b.food = null;
        K.call(arena, 'addScore', FOOD_STEAL_SCORE);
        K.text(arena, f.x, f.y - 30, 'Giật được! +50', '#ffc94a');
        K.puff(arena, f.x, f.y - 10, '#f29bb8', 10, 160);
        if (b.state === 'eatWalk' || b.state === 'eating') {
          b.setState('angry', 0.8);
          K.emit(arena, 'boss:foodStolen', { bossId: (b.root || b).id });
        }
      }
    }

    // Đâm tường khi lăn: còn lượt thì dội ngược lại, hết lượt thì (pha 2+) rơi xoong và choáng.
    function endRollAtWall(arena) {
      K.call(arena, 'shake', 9, 0.35);
      K.puff(arena, b.rollDir > 0 ? b.x + b.w : b.x, b.y + b.h / 2, '#ffffff', 12, 220);
      b.rollsLeft--;
      if (b.rollsLeft > 0) {
        b.rollDir = -b.rollDir;
        b.face = b.rollDir;
        b.setState('roll', 4);
      } else {
        var n = b.byPhase([0, 2, 3]);
        if (n) dropPots(arena, n);
        // bật ngược nhẹ khỏi tường rồi choáng — khoảng hở chính của trận
        b.vx = -b.rollDir * 140;
        b.vy = -260;
        b.setState('dizzy', b.byPhase([1.9, 1.6, 1.3]) / b.speedMul);
      }
    }

    // Ăn xong: hồi 1 máu (không vượt maxHp), báo cho trùm gốc (trio) đồng bộ tổng máu, PHÁT 'boss:heal'.
    function finishEating(arena) {
      b.food = null;
      var before = b.hp;
      b.hp = Math.min(b.maxHp, b.hp + 1);
      var root = b.root || b;
      if (typeof root.syncHp === 'function') root.syncHp();
      if (b.hp > before) {
        K.text(arena, b.cx(), b.y - 20, '+1 ❤', '#3fbf6f');
        K.puff(arena, b.cx(), b.y + 10, '#3fbf6f', 12, 160);
        K.call(arena, 'toast', b.name + ' ăn no, hồi 1 máu!');
        K.emit(arena, 'boss:heal', { bossId: root.id, hp: root.hp, maxHp: root.maxHp });
      } else {
        K.text(arena, b.cx(), b.y - 20, 'Ngon!', '#ffffff');
      }
      b.setState('idle', 0.5);
    }

    // Trạng thái nào giẫm được (weakspot bật) — lăn và gồng lăn thì KHÔNG.
    b.isVulnerable = function () {
      return ['walk', 'dizzy', 'eating', 'eatWalk', 'wait', 'idle', 'angry'].indexOf(b.state) >= 0;
    };
    // Trạng thái cả thân gây đau (hurtbox phủ gần hết thân).
    b.isFullHurt = function () { return b.state === 'roll' || b.state === 'rollWind' || b.state === 'potsHop'; };

    // Bắt đầu một đòn: chỉ ĐẶT trạng thái đầu tiên (thường là "...Wind" để báo trước); think() lo phần còn lại.
    b.startAction = function (a, arena) {
      b.faceToPlayer(arena);
      switch (a) {
        case 'walk':
          b.setState('walk', b.byPhase([1.4, 1.1, 0.9]));
          break;
        case 'roll':
        case 'roll3':
          b.rollsLeft = a === 'roll3' ? 2 : 1;
          b.rollDir = b.dirToPlayer(arena);
          b.face = b.rollDir;
          // Telegraph ngắn dần theo pha; chia speedMul (tối thiểu 0.5) để trùm nhanh hơn cũng báo trước ngắn hơn.
          b.setState('rollWind', b.byPhase([0.9, 0.75, 0.6]) / Math.max(0.5, b.speedMul));
          break;
        case 'pots':
          b.vy = -380;
          b.setState('potsHop', 3);
          break;
        case 'eat':
          if (b.food) { b.setState('eatWalk', 5); break; }
          spawnFood(arena);
          b.setState('eatWalk', 5);
          break;
        default:
          b.setState('idle', 0.6);
      }
    };

    // 💡 Khái niệm: mỗi case của switch = một trạng thái của FSM. Mỗi case làm 3 việc: đặt vận tốc/animation
    //   cho frame này, sinh hiệu ứng, và kiểm tra ĐIỀU KIỆN CHUYỂN (stateDone(), hitWall, ground...) để setState mới.
    b.think = function (dt, arena) {
      updateFood(dt, arena);
      var s = b.state;
      switch (s) {
        case 'intro':
          b.vx = 0; b.setAnim('victory'); b.faceToPlayer(arena);
          // Toast lời thoại sau ~0,05 s (không phải ngay lúc tạo trùm); cờ _introToast đảm bảo chỉ hiện 1 lần.
          // Trong trio (có ctrl) thì bỏ: trio tự toast một câu chung cho cả bộ ba.
          if (b.stateT > 0.05 && !b._introToast) {
            b._introToast = true;
            if (!b.ctrl) K.call(arena, 'toast', 'Dee Dee: "Ăn hết! Ăn hết!" — Giẫm đầu khi hắn choáng!');
          }
          if (b.stateDone()) b.choose(arena);
          break;
        case 'idle':
        case 'angry':
          b.vx = 0; b.setAnim(s === 'angry' ? 'attack' : 'idle'); b.faceToPlayer(arena);
          if (b.stateDone()) b.choose(arena);
          break;
        case 'walk':
          // Đi về phía người chơi nhưng dừng ở chỗ trống (không chui xuống dưới quầy — ở đó không giẫm được).
          var tx = K.clearSpot(arena, K.pcx(arena), b.w / 2 + 4);
          b.face = tx < b.cx() ? -1 : 1;
          b.vx = b.face * spd([55, 65, 75]);
          if (Math.abs(tx - b.cx()) < 20) { b.vx = 0; b.faceToPlayer(arena); }
          b.setAnim(b.vx ? 'walk' : 'idle');
          if (b.stateDone()) { b.vx = 0; b.choose(arena); }
          break;
        case 'rollWind':
          // Telegraph: đứng yên gồng người, bụi tung sau lưng; vùng đỏ + mũi tên vẽ ở drawBehind/drawFront.
          b.vx = 0; b.setAnim('attack');
          b.face = b.rollDir;
          if (Math.random() < dt * 16) K.puff(arena, b.cx() - b.rollDir * b.w * 0.45, floorY - 4, '#e8d7b0', 2, 80);
          if (b.stateDone()) { b.rollAngle = 0; b.setState('roll', 4); }
          break;
        case 'roll':
          b.vx = b.rollDir * spd([430, 500, 570]);
          // Góc lăn = quãng đường / bán kính (lăn không trượt), bán kính = nửa chiều cao.
          b.rollAngle += b.vx * dt / (b.h / 2);
          b.setAnim('roll');
          if (Math.random() < dt * 18) K.puff(arena, b.cx() - b.rollDir * b.w * 0.4, floorY - 4, '#e8d7b0', 1, 60);
          // stateDone() (4 s) là lưới an toàn: lỡ không bao giờ chạm tường thì vẫn thoát khỏi trạng thái lăn.
          if (b.hitWall === b.rollDir || b.stateDone()) endRollAtWall(arena);
          break;
        case 'dizzy':
          if (b.ground) b.vx *= Math.pow(0.02, dt);
          b.setAnim('stunned');
          if (b.stateDone()) { b.vx = 0; b.choose(arena); }
          break;
        case 'potsHop':
          b.vx = 0; b.setAnim(b.vy < 0 ? 'jump' : 'fall');
          // stateT > 0.1: lưới an toàn — chỉ xét "chạm đất" sau 0,1 s để không nhầm với lúc vừa bật nhảy.
          if (b.ground && b.stateT > 0.1) {
            K.call(arena, 'shake', 8, 0.3);
            K.puff(arena, b.cx(), floorY - 6, '#e8d7b0', 12, 200);
            dropPots(arena, b.byPhase([2, 3, 4]));
            b.setState('idle', 0.7);
          }
          break;
        case 'eatWalk':
          if (!b.food) { b.setState('idle', 0.4); break; }
          var dx = b.food.x - b.cx();
          b.face = dx < 0 ? -1 : 1;
          if (b.food.landed && Math.abs(dx) < 24) {
            b.vx = 0;
            b.setState('eating', b.byPhase([1.7, 1.5, 1.3]) / b.speedMul);
          } else {
            b.vx = Math.abs(dx) < 10 ? 0 : b.face * spd([95, 105, 120]);
            b.setAnim('walk');
          }
          if (b.state === 'eatWalk' && b.stateDone()) b.setState('idle', 0.4);
          break;
        case 'eating':
          b.vx = 0; b.setAnim('attack');
          if (!b.food) { b.setState('angry', 0.6); break; }
          if (Math.random() < dt * 8) K.puff(arena, b.cx() + b.face * b.w * 0.4, b.y + b.h * 0.3, '#fff6df', 1, 60);
          if (b.stateDone()) finishEating(arena);
          break;
        default:
          // ⚠️ Bẫy: luôn có default. Trạng thái lạ (gõ sai tên trong setState) sẽ quay về idle thay vì kẹt mãi.
          b.setState('idle', 0.5);
      }
    };

    b.onHurt = function (arena) {
      if (b.food && b.state === 'eating') {
        // Bị giẫm lúc đang ăn: bánh văng mất.
        K.puff(arena, b.food.x, b.food.y - 10, '#f29bb8', 10, 180);
        K.text(arena, b.food.x, b.food.y - 30, 'Bánh văng mất!', '#f29bb8');
        b.food = null;
      }
      b.vx = -b.dirToPlayer(arena) * 160;
      b.vy = -180;
      b.setState('recoil', 0.7);
    };

    b.onPhase = function () { /* giữ nguyên đồ ăn nếu đang rơi */ };
    b.onBreather = updateFood; // bánh vẫn rơi / vẫn giật được khi Dee Dee nghỉ thở

    // Lớp sau thân: bánh và vùng cảnh báo đường lăn (từ trùm tới tường theo hướng lăn).
    b.drawBehind = function (ctx, arena, t) {
      if (b.food) drawFood(ctx, b.food, floorY, t);
      if (b.state === 'rollWind') {
        var k = b.stateT / Math.max(0.01, b.stateDur);
        var W = K.width(arena);
        var x0 = b.rollDir > 0 ? b.x + b.w : 0, x1 = b.rollDir > 0 ? W : b.x;
        K.drawWarnZone(ctx, x0, x1 - x0, floorY, t, k, b.h * 0.6);
      }
    };

    // Thân: lăn thì xoay quanh TÂM thân (translate tới tâm → rotate → dời gốc về chân để drawSprite vẽ đúng).
    // 💡 Khái niệm: squash & stretch — khi gồng, thân bè ra (1.06) và lùn xuống (0.9); khi ăn, thân "phập phồng"
    //   ngược pha giữa 2 trục (+sin / −sin) nên trông như đang nhai mà thể tích gần như không đổi.
    b.drawBody = function (ctx, arena, alpha) {
      ctx.save();
      if (b.state === 'roll') {
        ctx.translate(b.cx(), b.y + b.h / 2);
        ctx.rotate(b.rollAngle);
        ctx.translate(0, b.h / 2);
        ctx.scale(0.9, 0.9);
      } else if (b.state === 'rollWind') {
        // run rẩy: lệch ngang ±2,5 px với tần số cao
        ctx.translate(b.cx() + Math.sin(b.t * 60) * 2.5, b.y + b.h);
        ctx.scale(1.06, 0.9);
      } else {
        ctx.translate(b.cx(), b.y + b.h);
        if (b.state === 'eating') ctx.scale(1 + Math.sin(b.t * 18) * 0.03, 1 - Math.sin(b.t * 18) * 0.03);
      }
      K.drawSprite(ctx, b, b.anim, { alpha: alpha });
      ctx.restore();
    };

    // Lớp trước thân: telegraph và biểu tượng trạng thái.
    b.drawFront = function (ctx, arena, t) {
      var s = b.state;
      if (s === 'rollWind') {
        K.drawBubble(ctx, b.cx(), b.y - 10, t, '!');
        K.drawArrow(ctx, b.cx() + b.rollDir * (b.w * 0.6), b.y + b.h * 0.5, b.rollDir, t);
      } else if (s === 'potsHop') {
        K.drawBubble(ctx, b.cx(), b.y - 10, t, '!');
      } else if (s === 'dizzy') {
        K.drawStars(ctx, b.cx(), b.y - 4, t, b.w * 0.4);
      } else if (s === 'eating') {
        // vòng tiến độ: ăn xong là hồi máu — cho người chơi thấy còn bao lâu để kịp giẫm
        var k = Math.min(1, b.stateT / Math.max(0.01, b.stateDur));
        ctx.save();
        ctx.translate(b.cx(), b.y - 28);
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#3fbf6f'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(0, 0, 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
        ctx.font = OG.font(14); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#17233d'; ctx.fillText('😋', 0, 1);
        ctx.restore();
      } else if (s === 'eatWalk') {
        K.drawBubble(ctx, b.cx(), b.y - 10, t, '🍰', '#17233d');
      } else if (s === 'angry') {
        K.drawBubble(ctx, b.cx(), b.y - 10, t, '💢', '#e5484d');
      }
    };

    return b;
  }

  // 🧪 Thử: đổi phase 1 trong SPEC.patterns thành ['roll'] — Dee Dee lăn liên tục không đi bộ xen giữa;
  //   hoặc đổi thời gian 'dizzy' [1.9, 1.6, 1.3] → [4, 4, 4] để thấy khoảng hở dài giúp trận dễ thế nào.
  OG.Bosses.factories.deedee = create;
  OG.Bosses.register({
    id: 'deedee', name: 'Dee Dee', maxHp: SPEC.maxHp,
    arena: {
      width: 960,
      // Nhà bếp: 2 mặt quầy y=370 để tránh cú lăn; đặt xa tường vì Dee Dee choáng sát tường
      // (đứng dưới quầy thì không giẫm được).
      platforms: [[0, 480, 960, 60], [220, 370, 150, 18], [590, 370, 150, 18]],
      spawn: { x: 80, y: 420 },
      theme: 'kitchen'
    },
    create: function (arena) { return create(arena, { x: 740 }); }
  });
})();
