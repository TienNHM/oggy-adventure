// @ts-check
/* ============================================================================
 * OG.Bosses 'marky' — TRÙM MARKY (gián cao gầy dùng đồ nghề và bẫy, màn garden)
 * ----------------------------------------------------------------------------
 * Vai trò:      Định nghĩa trùm Marky và đăng ký vào OG.Bosses lúc load. Scene 'boss' gọi
 *               OG.Bosses.create('marky', arena); trio.js gọi lại OG.Bosses.factories.marky (bản thu nhỏ).
 * Khái niệm:    boss state machine · telegraph (vùng đỏ điểm rơi, bẫy chưa giương) · bẫy có trạng thái riêng
 *               (chưa giương → giương → sập) · nhảy tới điểm đích sau T giây (tính vận tốc ngược) ·
 *               boomerang bằng gia tốc ngược chiều · hitbox đổi theo tư thế (setHeight khi cúi)
 * Bài học:      docs/learn/09-ai-ke-dich-boss.md · docs/learn/07-ve-canvas-procedural-cache.md (vẽ đồ nghề)
 * Phụ thuộc:    LÚC LOAD: OG.Bosses.kit (load SAU src/bosses/bosses.js), OG.util. LÚC CHẠY: (không thêm)
 * Event:        phát: (chỉ các event chung của kit: 'boss:phase', 'boss:hit' khi cờ lê phản trúng) · nghe: (không)
 * API công khai: OG.Bosses.factories.marky(arena, cfg) · đăng ký trùm id 'marky' · K.drawers.wrench/wave/trap
 * Đọc tiếp:     src/bosses/trio.js (ghép 3 trùm) → src/game/boss-scene.js
 *
 * Đòn đánh (mỗi đòn đều báo trước):
 *   trap   — quỳ xuống đặt bẫy kẹp ở chỗ người chơi đứng (pha 2+: thêm 2 bẫy hai bên).
 *            Bẫy mờ + nhấp nháy 0,8 s rồi mới sập được; giẫm vào bẫy đã giương = bị thương.
 *   slam   — vung búa, vùng đỏ hiện ở điểm rơi, nhảy lên đập đất: rung màn hình và tạo 2 sóng xung kích
 *            chạy dọc sàn sang hai bên (nhảy qua, hoặc đứng trên bục để tránh).
 *            Sau cú đập, búa kẹt dưới đất: Marky cúi người choáng — CƠ HỘI GIẪM ĐẦU.
 *   slam2  — (pha 3) đập liên tiếp 2 lần, lần 2 mới bị kẹt búa.
 *   wrench — (pha 2+) ném cờ lê kiểu boomerang bay sát sàn rồi quay về.
 *            Nhấn E/J (✦) khi cờ lê ở gần để ĐÁNH BẬT nó trúng Marky.
 * Điểm yếu: giẫm đầu khi búa kẹt (hoặc phản cờ lê). Marky cao nên lúc bình thường không giẫm được.
 * Trạng thái: intro · idle · walk · trapWind → trapDone · slamWind → slamAir → (slamWind | stuck) · wrenchWind → wrenchOut
 * ========================================================================== */
(function () {
  'use strict';
  var OG = window.OG;
  if (!OG || !OG.Bosses || !OG.Bosses.kit) return;
  var K = OG.Bosses.kit;
  var U = OG.util;

  /** @type {BossSpec} */
  var SPEC = {
    id: 'marky', name: 'Marky', charId: 'marky', maxHp: 6, scale: 1.75, baseW: 30, baseH: 60,
    phaseAt: [4, 2],
    phaseLines: {
      2: 'Marky rút cờ lê ra! Nhấn E/J (✦) để đánh bật nó!',
      3: 'Marky đập đất liên hoàn! Canh nhịp mà nhảy!'
    },
    patterns: {
      1: ['walk', 'trap', 'walk', 'slam'],
      2: ['wrench', 'walk', 'trap', 'slam'],
      3: ['wrench', 'slam2', 'trap', 'wrench', 'slam']
    }
  };

  var MAX_TRAPS = 4;          // số bẫy chưa sập tối đa trên sân
  var TRAP_MIN_GAP = 40;      // px: không đặt bẫy mới chồng lên bẫy cũ
  var TRAP_ARM_TIME = 0.8;    // giây từ lúc đặt tới lúc bẫy giương (nguy hiểm) — chính là telegraph của bẫy
  var TRAP_SIDE_OFFSET = 150; // px: pha 2+ đặt thêm 2 bẫy cách người chơi chừng này về hai bên
  var SLAM_FLIGHT_TIME = 0.7; // giây bay của cú nhảy đập búa
  var SLAM_GRAVITY = 1500;    // px/giây²: trọng lực dùng để tính vận tốc nhảy đập búa
  var WRENCH_PULL = 820;      // px/giây²: gia tốc kéo cờ lê quay về (boomerang)
  var CROUCH_RATIO = 0.64;    // chiều cao hitbox khi cúi (búa kẹt) so với chiều cao đầy đủ

  // ---------------------------------------------------------------------------
  // Vẽ đồ nghề (gốc toạ độ tự đặt; bosses.js bọc save/restore quanh mỗi hàm trong K.drawers)
  // ---------------------------------------------------------------------------

  /**
   * Vẽ búa gỗ: (x, y) = điểm cầm ở ĐÁY cán, angle = góc xoay (radian), s = tỉ lệ.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x
   * @param {number} y
   * @param {number} angle
   * @param {number} [s=1]
   */
  function drawMallet(ctx, x, y, angle, s) {
    s = s || 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(s, s);
    // cán gỗ → đầu búa kim loại → vệt sáng
    U.fillRound(ctx, -3, -44, 6, 46, 3, '#8a5a2b');
    U.fillRound(ctx, -15, -58, 30, 18, 6, '#8d98a8');
    ctx.strokeStyle = '#17233d'; ctx.lineWidth = 2;
    U.roundRectPath(ctx, -15, -58, 30, 18, 6); ctx.stroke();
    ctx.fillStyle = '#c9ced6'; ctx.fillRect(-12, -55, 24, 4);
    ctx.restore();
  }

  // Hình cờ lê nằm ngang quanh gốc (0, 0), dài 2r; bên gọi tự translate/rotate trước.
  function drawWrenchShape(ctx, r, color) {
    ctx.fillStyle = color; ctx.strokeStyle = '#17233d'; ctx.lineWidth = 1.5;
    U.roundRectPath(ctx, -r, -3.5, r * 2, 7, 3); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(r, 0, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(-r, 0, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#17233d';
    ctx.fillRect(r + 1, -2.5, 8, 5); // ngàm mở
  }

  K.drawers.wrench = function (ctx, p) {
    ctx.translate(p.x, p.y);
    ctx.rotate(p.t * 16);
    drawWrenchShape(ctx, p.r * 0.8, p.reflected ? '#7fe0ff' : '#aeb7c4');
  };

  // Sóng xung kích: vòng cung đất/bụi chạy dọc sàn. Gốc = (p.x, mặt sàn); lật theo hướng chạy.
  K.drawers.wave = function (ctx, p) {
    var h = p.hgt, dir = p.vx < 0 ? -1 : 1;
    ctx.translate(p.x, p.floorY);
    ctx.scale(dir, 1);
    ctx.globalAlpha = Math.min(1, p.life * 2); // mờ dần trong 0,5 s cuối đời
    // khối đất + lõi sáng
    ctx.fillStyle = '#c98a4b';
    ctx.strokeStyle = '#17233d'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-22, 0);
    ctx.quadraticCurveTo(-10, -h * 0.6, 4, -h);
    ctx.quadraticCurveTo(14, -h * 0.5, 18, 0);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffd36b';
    ctx.beginPath(); ctx.moveTo(-8, 0); ctx.quadraticCurveTo(0, -h * 0.5, 6, -h * 0.65); ctx.quadraticCurveTo(10, -h * 0.3, 12, 0); ctx.fill();
    // bụi phía sau
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (var i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.arc(-26 - i * 10, -4 - (i % 2) * 5, 5 - i, 0, Math.PI * 2); ctx.fill();
    }
  };

  // Bẫy kẹp: chưa giương thì mờ, giương rồi có đèn đỏ nhấp nháy, sập thì khép hàm. Gốc = (p.x, mặt sàn).
  // Hình ảnh phản ánh đúng 3 trạng thái của bẫy (armed / snapped / chưa giương) → người chơi "đọc" được luật.
  K.drawers.trap = function (ctx, p, t) {
    ctx.translate(p.x, p.floorY);
    var armed = p.armed, snapped = p.snapped;
    ctx.globalAlpha = armed || snapped ? Math.min(1, p.life * 2) : 0.45 + Math.sin(t * 20) * 0.2;
    U.fillRound(ctx, -20, -5, 40, 6, 3, '#5b6472');
    ctx.strokeStyle = '#17233d'; ctx.lineWidth = 2;
    ctx.fillStyle = '#aeb7c4';
    // hai hàm kẹp đối xứng: vẽ một bên rồi scale(-1, 1) để có bên kia; open = độ mở hàm
    var open = snapped ? 0.15 : 1;
    for (var side = -1; side <= 1; side += 2) {
      ctx.save();
      ctx.scale(side, 1);
      ctx.beginPath();
      ctx.moveTo(2, -4);
      ctx.lineTo(18, -4 - 10 * open);
      ctx.lineTo(18, -4);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      // răng
      ctx.beginPath();
      for (var k = 0; k < 3; k++) { var tx = 6 + k * 4; ctx.moveTo(tx, -4 - 3 * open * (tx / 18) * 3); ctx.lineTo(tx + 2, -4 - 6 * open * (tx / 18) * 2); }
      ctx.stroke();
      ctx.restore();
    }
    if (armed && Math.floor(t * 6) % 2 === 0) {
      ctx.fillStyle = '#e5484d';
      ctx.beginPath(); ctx.arc(0, -8, 3, 0, Math.PI * 2); ctx.fill();
    }
    if (!armed && !snapped) {
      // vòng đếm ngược trước khi giương
      ctx.strokeStyle = '#e5484d'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, -20, 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - p.armT / p.armMax)); ctx.stroke();
    }
  };

  /**
   * Tạo một Marky (dùng cho trận đơn và cho trio).
   * @param {Object} arena  đấu trường (Arena)
   * @param {BossCfg} [cfg]
   * @returns {Object} BossInstance
   */
  function create(arena, cfg) {
    cfg = cfg || {};
    var b = K.createBase(SPEC, arena, cfg);
    var floorY = K.floorY(arena);
    var crouchH = Math.round(b.fullH * CROUCH_RATIO);
    b.slamTx = 0;        // tâm x điểm đáp của cú đập búa (px, thế giới)
    b.slamsLeft = 0;     // số cú đập còn lại trong chuỗi (slam = 1, slam2 = 2)
    b.wrenchOut = null;  // cờ lê đang bay (BossProjectile) — Marky đứng chờ cho tới khi nó quay về

    function spd(arr) { return b.byPhase(arr) * b.speedMul; }

    function countTraps() {
      var n = 0;
      for (var i = 0; i < b.projectiles.length; i++) if (b.projectiles[i].kind === 'trap' && !b.projectiles[i].snapped) n++;
      return n;
    }

    /**
     * Đặt một bẫy kẹp tại x (bỏ qua nếu đã đủ MAX_TRAPS hoặc đã có bẫy gần đó).
     * 💡 Khái niệm: bẫy là một state machine thu nhỏ gắn trong dữ liệu đạn: chưa giương (armed=false, vô hại,
     *   đếm ngược armT) → giương (armed=true, chạm là đau) → sập (snapped, tự biến mất sau 0,6 s).
     *   kit.updateProjectiles chỉ gây thương khi armed !== false nên bẫy chưa giương an toàn.
     */
    function placeTrap(arena, x) {
      var W = K.width(arena);
      x = U.clamp(x, 30, W - 30);
      if (countTraps() >= MAX_TRAPS) return;
      // không đặt chồng bẫy
      for (var i = 0; i < b.projectiles.length; i++) {
        var q = b.projectiles[i];
        if (q.kind === 'trap' && Math.abs(q.x - x) < TRAP_MIN_GAP) return;
      }
      K.spawnProj(b, {
        kind: 'trap', x: x, y: floorY - 6, r: 10, floorY: floorY, life: 7,
        armT: TRAP_ARM_TIME, armMax: TRAP_ARM_TIME, armed: false, snapped: false,
        rect: function (p) { return { x: p.x - 16, y: floorY - 12, w: 32, h: 12 }; },
        update: function (p, dt) {
          if (!p.armed && !p.snapped) { p.armT -= dt; if (p.armT <= 0) p.armed = true; }
        },
        onHitPlayer: function (p, arena) {
          // Sập rồi thì vô hại (armed = false) — chỉ cắn một lần.
          p.armed = false; p.snapped = true; p.life = 0.6;
          K.text(arena, p.x, floorY - 30, 'Sập bẫy!', '#e5484d');
        }
      });
      K.puff(arena, x, floorY - 4, '#aeb7c4', 6, 90);
    }

    // Hai sóng xung kích chạy ra hai bên từ chỗ búa đập; cao & nhanh dần theo pha.
    function spawnWaves(arena) {
      var hgt = b.byPhase([26, 30, 34]);
      var sp = spd([300, 360, 420]);
      var W = K.width(arena);
      for (var dir = -1; dir <= 1; dir += 2) {
        K.spawnProj(b, {
          kind: 'wave', x: b.cx() + dir * (b.w / 2), y: floorY - hgt / 2, r: 14, vx: dir * sp, hgt: hgt, floorY: floorY, life: 4,
          rect: function (p) { return { x: p.x - 14, y: floorY - p.hgt, w: 28, h: p.hgt }; },
          // update riêng: chỉ chạy ngang dọc sàn (không trọng lực, không nảy như vật lý mặc định)
          update: function (p, dt) {
            p.x += p.vx * dt;
            if (p.x < -30 || p.x > W + 30) p.dead = true;
          },
          onHitPlayer: function () { /* sóng đi tiếp */ }
        });
      }
    }

    /**
     * Ném cờ lê boomerang về hướng mặt.
     * 💡 Khái niệm: boomerang = gia tốc NGƯỢC chiều vận tốc ban đầu (ax = −dir · WRENCH_PULL). Cờ lê chậm dần,
     *   dừng lại rồi tự bay ngược về — không cần trạng thái "đi"/"về" riêng, chỉ một công thức vật lý.
     */
    function throwWrench(arena) {
      var dir = b.face;
      var W = K.width(arena);
      var v0 = spd([520, 560, 620]);
      b.wrenchOut = K.spawnProj(b, {
        kind: 'wrench', x: b.cx() + dir * b.w * 0.5, y: floorY - 32, r: 14, vx: dir * v0, ax: -dir * WRENCH_PULL,
        life: 4.5, reflectable: true,
        update: function (p, dt, arena, bb) {
          p.vx += (p.ax || 0) * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          if (p.reflected) return;
          // Chạm tường: dội lại (mất 20% tốc độ) và đảo gia tốc để vẫn quay về phía Marky.
          if ((p.x < p.r && p.vx < 0) || (p.x > W - p.r && p.vx > 0)) { p.vx = -p.vx * 0.8; p.ax = -p.ax; }
          // Quay về tay Marky thì bắt lấy (p.t > 0.5 để không "bắt" ngay lúc vừa ném ra).
          if (p.t > 0.5 && Math.abs(p.x - bb.cx()) < bb.w * 0.6) {
            p.dead = true;
            K.puff(arena, p.x, p.y, '#aeb7c4', 4, 60);
          }
        },
        onHitPlayer: function () { /* boomerang tiếp tục bay */ }
      });
    }

    b.isVulnerable = function () { return b.state === 'stuck' || b.state === 'wait'; };
    b.isFullHurt = function () { return b.state === 'slamAir' || b.state === 'walk'; };

    b.startAction = function (a, arena) {
      b.faceToPlayer(arena);
      switch (a) {
        case 'walk':
          b.setState('walk', b.byPhase([1.1, 0.9, 0.8]));
          break;
        case 'trap':
          b.setState('trapWind', b.byPhase([0.6, 0.55, 0.5]));
          break;
        case 'slam':
        case 'slam2':
          b.slamsLeft = a === 'slam2' ? 2 : 1;
          beginSlam(arena, b.byPhase([0.75, 0.65, 0.55]));
          break;
        case 'wrench':
          b.setState('wrenchWind', b.byPhase([0.6, 0.55, 0.45]));
          break;
        default:
          b.setState('idle', 0.6);
      }
    };

    // Chốt điểm đáp (tại chỗ người chơi, ngoài vùng dưới bục) rồi vào trạng thái báo trước 'slamWind'.
    function beginSlam(arena, wind) {
      var W = K.width(arena);
      b.slamTx = U.clamp(K.pcx(arena), b.w / 2 + 4, W - b.w / 2 - 4);
      // Không đáp xuống ngay dưới bục: lúc kẹt búa phải giẫm được từ trên xuống.
      b.slamTx = K.clearSpot(arena, b.slamTx, b.w / 2 + 4);
      b.faceToPlayer(arena);
      b.setState('slamWind', wind / Math.max(0.5, b.speedMul));
    }

    b.think = function (dt, arena) {
      var s = b.state;
      switch (s) {
        case 'intro':
          b.vx = 0; b.setAnim('victory'); b.faceToPlayer(arena);
          if (b.stateT > 0.05 && !b._introToast) {
            b._introToast = true;
            if (!b.ctrl) K.call(arena, 'toast', 'Marky: "Để tao sửa mày!" — Giẫm đầu khi búa của hắn bị kẹt!');
          }
          if (b.stateDone()) b.choose(arena);
          break;
        case 'idle':
          b.vx = 0; b.setAnim('idle'); b.faceToPlayer(arena);
          if (b.stateDone()) b.choose(arena);
          break;
        case 'walk':
          b.faceToPlayer(arena);
          b.vx = b.face * spd([70, 85, 100]);
          if (Math.abs(K.pcx(arena) - b.cx()) < 30) b.vx = 0;
          b.setAnim('walk');
          if (b.stateDone()) { b.vx = 0; b.choose(arena); }
          break;
        case 'trapWind':
          b.vx = 0; b.setAnim('attack');
          if (b.stateDone()) {
            var px = K.pcx(arena);
            placeTrap(arena, px);
            if (b.p() >= 2) { placeTrap(arena, px - TRAP_SIDE_OFFSET); placeTrap(arena, px + TRAP_SIDE_OFFSET); }
            b.setState('trapDone', 0.35);
          }
          break;
        case 'trapDone':
          b.vx = 0; b.setAnim('idle');
          if (b.stateDone()) b.choose(arena);
          break;
        case 'slamWind':
          b.vx = 0; b.setAnim('attack');
          if (b.stateDone()) {
            // 💡 Khái niệm: nhảy tới đích sau đúng T giây. Lên rồi xuống về cùng độ cao mất T giây khi
            //   vy0 = −½·g·T; vận tốc ngang vx = quãng đường / T. Điểm đáp luôn trùng vùng đỏ đã báo trước.
            // ⚠️ Bẫy: SLAM_GRAVITY phải bằng trọng lực thật trong b.physics (OG.Config.GRAVITY, mặc định 1500).
            //   Đổi một bên mà quên bên kia → Marky đáp lệch khỏi vùng cảnh báo.
            var T = SLAM_FLIGHT_TIME;
            b.vy = -0.5 * SLAM_GRAVITY * T;
            b.vx = (b.slamTx - b.cx()) / T;
            b.setState('slamAir', 3);
          }
          break;
        case 'slamAir':
          b.setAnim(b.vy < 0 ? 'jump' : 'fall');
          if (b.ground && b.stateT > 0.1) {
            b.vx = 0;
            K.call(arena, 'shake', 10, 0.35);
            K.puff(arena, b.cx(), floorY - 6, '#c98a4b', 16, 240);
            spawnWaves(arena);
            b.slamsLeft--;
            // Còn cú đập → telegraph ngắn (0,45 s) cho cú tiếp; hết → búa kẹt: cúi thấp (hitbox thấp) và choáng.
            if (b.slamsLeft > 0) beginSlam(arena, 0.45);
            else { b.setHeight(crouchH); b.setState('stuck', b.byPhase([2.0, 1.7, 1.4]) / b.speedMul); }
          }
          break;
        case 'stuck':
          b.vx = 0; b.setAnim('stunned');
          if (b.stateDone()) {
            // ⚠️ Bẫy: luôn trả hitbox về chiều cao đầy đủ khi rời trạng thái cúi (ở đây, onHurt, và kit khi đổi pha/gục);
            //   quên một chỗ là Marky "lùn" vĩnh viễn và weakspot/hurtbox lệch so với hình vẽ.
            b.setHeight(b.fullH);
            K.puff(arena, b.cx() + b.face * 30, floorY - 6, '#c98a4b', 6, 100);
            b.choose(arena);
          }
          break;
        case 'wrenchWind':
          b.vx = 0; b.setAnim('attack'); b.faceToPlayer(arena);
          if (b.stateDone()) { throwWrench(arena); b.setState('wrenchOut', 3); }
          break;
        case 'wrenchOut':
          b.vx = 0; b.setAnim('idle');
          if (!b.wrenchOut || b.wrenchOut.dead || b.stateDone()) { b.wrenchOut = null; b.setState('idle', 0.35); }
          break;
        default:
          b.setState('idle', 0.5);
      }
    };

    b.onHurt = function (arena) {
      if (b.h !== b.fullH) b.setHeight(b.fullH);
      b.vx = -b.dirToPlayer(arena) * 180;
      b.vy = -200;
      b.setState('recoil', 0.7);
    };

    // Lớp sau thân: vùng đỏ tại điểm đáp (đậm dần, giữ đậm nhất khi đang bay) + dải mờ báo sóng dọc sàn.
    b.drawBehind = function (ctx, arena, t) {
      if (b.state === 'slamWind' || b.state === 'slamAir') {
        var k = b.state === 'slamAir' ? 1 : b.stateT / Math.max(0.01, b.stateDur);
        K.drawWarnZone(ctx, b.slamTx - 70, 140, floorY, t, k, 22);
        // dải mờ báo sóng xung kích sẽ lan dọc sàn
        ctx.save();
        ctx.globalAlpha = 0.25 * k;
        ctx.fillStyle = '#e5484d';
        ctx.fillRect(0, floorY - 6, K.width(arena), 6);
        ctx.restore();
      }
    };

    // Thân: cúi thấp khi búa kẹt (scale dọc theo h / fullH khớp với hitbox); búa vẽ kèm theo trạng thái.
    b.drawBody = function (ctx, arena, alpha) {
      var s = b.state;
      ctx.save();
      ctx.translate(b.cx(), b.y + b.h);
      if (s === 'stuck') {
        drawMallet(ctx, b.face * (b.w * 0.75), 0, b.face * 0.5, 1.1);
        ctx.scale(1.15, b.h / b.fullH);
      }
      K.drawSprite(ctx, b, b.anim, { alpha: alpha });
      ctx.restore();
      // Đồ nghề cầm tay — vẽ SAU thân (đè lên), toạ độ thế giới nên mở save/restore riêng.
      ctx.save();
      if (s === 'slamWind') {
        // búa vung dần ra sau lưng theo tiến độ telegraph k
        var k = Math.min(1, b.stateT / Math.max(0.01, b.stateDur));
        drawMallet(ctx, b.cx() - b.face * 8, b.y + b.h * 0.35, -b.face * (0.3 + k * 1.6), 1.1);
      } else if (s === 'slamAir') {
        drawMallet(ctx, b.cx() + b.face * 8, b.y + b.h * 0.35, b.face * (b.vy < 0 ? -0.6 : 1.2), 1.1);
      } else if (s === 'wrenchWind') {
        ctx.translate(b.cx() - b.face * 14, b.y + b.h * 0.25);
        ctx.rotate(-b.face * (0.6 + b.stateT * 4));
        drawWrenchShape(ctx, 11, '#aeb7c4');
      }
      ctx.restore();
    };

    b.drawFront = function (ctx, arena, t) {
      var s = b.state;
      if (s === 'slamWind' || s === 'wrenchWind') K.drawBubble(ctx, b.cx(), b.y - 10, t, '!');
      else if (s === 'trapWind') K.drawBubble(ctx, b.cx(), b.y - 10, t, '🔧', '#17233d');
      else if (s === 'stuck') K.drawStars(ctx, b.cx(), b.y - 6, t, b.w * 0.5);
    };

    return b;
  }

  // 🧪 Thử: đổi TRAP_ARM_TIME 0.8 → 2 — bẫy nhấp nháy lâu hơn nhiều trước khi nguy hiểm, dễ nhảy qua.
  //   Đổi WRENCH_PULL 820 → 400: cờ lê bay xa hơn hẳn trước khi quay về (thường đập tường rồi dội lại).
  OG.Bosses.factories.marky = create;
  OG.Bosses.register({
    id: 'marky', name: 'Marky', maxHp: SPEC.maxHp,
    arena: {
      width: 960,
      // Vườn: 2 bục gỗ y=370 — đứng trên bục để tránh sóng xung kích.
      platforms: [[0, 480, 960, 60], [130, 370, 160, 18], [670, 370, 160, 18]],
      spawn: { x: 80, y: 420 },
      theme: 'garden'
    },
    create: function (arena) { return create(arena, { x: 740 }); }
  });
})();
