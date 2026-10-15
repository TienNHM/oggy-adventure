/* OG.Difficulty — độ khó 'kid' (mặc định, rất dễ cho bé 5–10 tuổi) và 'challenge' (= cảm giác v1).
 * Chủ sở hữu giai đoạn v2: agent difficulty (src/game/). Hợp đồng: docs/STORY.md mục 5.
 *
 * Nơi gọi: Game.newRun (mạng), Player.update (coyote/buffer, trọng lực nhảy giữ nút/rơi chậm),
 * Player.hurt (bất tử, lực đẩy), Enemies.create/hurtbox, scene level/boss (giẫm, chạm sượt, rơi vực,
 * máu & nhịp trùm, arena.difficulty), Game.loseLife (softFail). Checkpoint là level hook 'checkpoints'.
 *
 * Mở rộng ngoài hợp đồng (giữ nguyên chữ ký cũ):
 *   isStomp(p, prevBottom, target, tol, prevTop) -> bool   giẫm rộng lượng + bù chuyển động của mục tiêu
 *   touches(p, box) -> bool                                 chạm "thật" (bỏ qua chạm sượt vài px)
 *   weakenBoss(boss, arena)                                 trợ giúp giữa trận: trùm mất bớt máu
 *   applyAssist(player, levelId)                            khiên/tim trợ giúp khi vào màn/trận
 *
 * Lưu: OG.Save.data.settings.difficulty ('kid'|'challenge'), số lần thua: OG.Save.ns('difficulty').fails */
(function () {
  'use strict';
  var OG = window.OG;
  var U = OG.util;

  // Tham số mỗi chế độ. 'challenge' giữ đúng giá trị v1 (smoke test chạy chế độ này cho chiến dịch cổ điển).
  var MODES = {
    kid: {
      label: 'Bé chơi', emoji: '🧸',
      lives: 5,                 // số mạng đầu lượt
      coyoteTime: 0.15,         // giây vẫn nhảy được sau khi rời mép
      jumpBuffer: 0.15,         // giây nhớ phím nhảy bấm sớm trước khi chạm đất
      jumpHoldGravityMul: 0.72, // giữ nút nhảy khi đang lên: trọng lực nhẹ hơn -> nhảy cao hơn (~150px thay vì 116px)
      fallGravityMul: 0.86,     // rơi chậm hơn một chút
      maxFallMul: 0.8,          // tốc độ rơi tối đa thấp hơn (dễ canh đáp)
      enemyHitboxScale: 0.7,    // hộp gây sát thương của địch thu nhỏ còn 70%
      enemySpeedMul: 0.7,       // địch đi chậm hơn
      grazePx: 6,               // chạm sượt dưới 6px không tính
      stompTolerance: 24,       // px: đáy người chơi (frame trước) chỉ cần cao hơn đỉnh địch + chừng này
      hurtKnockMul: 0.7,        // bị đẩy lùi nhẹ hơn
      bossHpMul: 0.6,           // máu trùm còn 60% (làm tròn, tối thiểu 2)
      bossSpeedMul: 0.75,       // nhịp đòn trùm chậm lại (dt của boss.update nhân hệ số này)
      bossTelegraphMul: 1.3,    // thời gian báo trước đòn (state *Wind) dài hơn
      bossStunMul: 1.35,        // thời gian trùm choáng / sơ hở dài hơn
      bossRest: 0.9,            // giây nghỉ thở sau mỗi đòn (trùm đứng yên, giẫm được)
      hurtInvuln: 2.2,          // giây bất tử sau khi bị thương
      checkpoints: true,        // cờ checkpoint tự động
      checkpointSpacing: 600,   // px giữa các cờ tự động (khi màn không khai báo checkpoints)
      fallDamage: false,        // rơi vực: KHÔNG mất mạng, hồi về chỗ đứng an toàn gần nhất
      softFail: true,           // hết mạng trong hành trình: hồi đầy mạng tại checkpoint, không game over
      autoAssistAfter: 2        // thua 2 lần cùng màn -> bật trợ giúp
    },
    challenge: {
      label: 'Thử thách', emoji: '🔥',
      lives: 3, coyoteTime: 0.06, jumpBuffer: 0.08,
      jumpHoldGravityMul: 1, fallGravityMul: 1, maxFallMul: 1,
      enemyHitboxScale: 1, enemySpeedMul: 1, grazePx: 0, stompTolerance: 12, hurtKnockMul: 1,
      bossHpMul: 1, bossSpeedMul: 1, bossTelegraphMul: 1, bossStunMul: 1, bossRest: 0,
      hurtInvuln: 1.6, checkpoints: false, checkpointSpacing: 0,
      fallDamage: true, softFail: false, autoAssistAfter: 3
    }
  };
  // Hiệu ứng trợ giúp theo cấp (cộng dồn lên tham số chế độ).
  var ASSIST = [
    null,
    { enemySpeedMul: 0.85, bossHpMul: 0.8, bossSpeedMul: 0.9, shield: 1, extraLives: 1 },
    { enemySpeedMul: 0.7, bossHpMul: 0.6, bossSpeedMul: 0.8, shield: 2, extraLives: 2 }
  ];
  var CHEER = [
    'Cố lên! Bạn làm được mà! 💪',
    'Giỏi lắm! Thử lại lần nữa nhé! 🌟',
    'Không sao cả! Mình cùng thử lại nào! 😊'
  ];

  var mode = 'kid';
  var version = 0;          // tăng khi mode/số lần thua đổi -> làm mới bộ nhớ đệm params
  var cache = { key: '', val: null };

  function store() { return OG.Save.ns('difficulty'); }
  function fails() { var s = store(); if (!s.fails || typeof s.fails !== 'object') s.fails = {}; return s.fails; }
  function curLevelId() { return OG.Game && OG.Game.stage ? OG.Game.stage.levelId : null; }
  function toast(text, sec) { if (OG.DOM && OG.DOM.toast) OG.DOM.toast(text, sec); }

  // Tham số đã áp trợ giúp (đối tượng dùng chung, KHÔNG sửa). Đệm theo mode + màn + phiên bản.
  function computed(levelId) {
    if (levelId == null) levelId = curLevelId();
    var key = mode + '|' + levelId + '|' + version;
    if (cache.key === key && cache.val) return cache.val;
    var base = MODES[mode], out = {}, k;
    for (k in base) out[k] = base[k];
    out.mode = mode;
    out.shield = 0; out.extraLives = 0;
    var lv = D.assistLevel(levelId);
    out.assist = lv;
    var a = ASSIST[lv];
    if (a) {
      out.enemySpeedMul *= a.enemySpeedMul;
      out.bossHpMul *= a.bossHpMul;
      out.bossSpeedMul *= a.bossSpeedMul;
      out.shield = a.shield;
      out.extraLives = a.extraLives;
    }
    cache = { key: key, val: out };
    return out;
  }

  var D = (OG.Difficulty = {
    MODES: MODES,
    ASSIST: ASSIST,

    init: function () {
      var m = OG.Save.data.settings && OG.Save.data.settings.difficulty;
      mode = MODES[m] ? m : 'kid';
      version++;
      OG.Events.on('save:reset', function () { mode = 'kid'; version++; });
      // Thắng màn -> xoá đếm thua. Game over (challenge / cổ điển) -> tính 1 lần thua.
      OG.Events.on('level:complete', function (r) { if (r && r.levelId) D.recordClear(r.levelId); });
      OG.Events.on('game:over', function (e) { var id = e && e.result && e.result.levelId; if (id) D.recordFail(id); });
      // Checkpoint là một level hook (OG.Level.addHook) — xem cuối file.
      if (OG.Level && OG.Level.addHook) OG.Level.addHook(checkpointHook);
    },

    mode: function () { return mode; },
    isKid: function () { return mode === 'kid'; },
    label: function (m) { var d = MODES[m || mode]; return d ? d.emoji + ' ' + d.label : String(m); },
    list: function () { return Object.keys(MODES); },
    set: function (m) {
      if (!MODES[m] || m === mode) return mode;
      var prev = mode;
      mode = m;
      version++;
      if (OG.Save.data && OG.Save.data.settings) OG.Save.setSetting('difficulty', m);
      OG.Events.emit('difficulty:change', { mode: m, prev: prev });
      return mode;
    },
    toggle: function () { return D.set(mode === 'kid' ? 'challenge' : 'kid'); },

    // Tham số đã áp trợ giúp cho màn (mặc định màn đang chơi). Trả object mới.
    params: function (levelId) {
      var src = computed(levelId), out = {};
      for (var k in src) out[k] = src[k];
      return out;
    },
    get: function (key, levelId) { return computed(levelId)[key]; },

    // ---- Trợ giúp tự động ----
    assistLevel: function (levelId) {
      if (!levelId || !OG.Save.data) return 0;
      var n = fails()[levelId] | 0, every = MODES[mode].autoAssistAfter || 2;
      return Math.min(ASSIST.length - 1, Math.floor(n / every));
    },
    isAssist: function (levelId) { return D.assistLevel(levelId) > 0; },
    recordFail: function (levelId) {
      if (!levelId) return 0;
      var before = D.assistLevel(levelId);
      var f = fails();
      f[levelId] = (f[levelId] | 0) + 1;
      version++;
      OG.Save.commit();
      var after = D.assistLevel(levelId);
      if (after > before) OG.Events.emit('assist:on', { levelId: levelId, level: after, fails: f[levelId] });
      return f[levelId];
    },
    recordClear: function (levelId) {
      var f = fails();
      if (f[levelId]) { delete f[levelId]; version++; OG.Save.commit(); }
    },

    // ---- Hook do src/game gọi ----
    startLives: function () { return MODES[mode].lives; },
    // Gọi trong OG.Enemies.create (sau init loại địch).
    scaleEnemy: function (e) { e.speed *= D.get('enemySpeedMul'); return e; },
    // Thu nhỏ hộp gây sát thương: giữ đáy, co đều hai bên (đầu địch thấp xuống -> dễ giẫm, khó bị chạm oan).
    enemyHurtbox: function (box) {
      var s = D.get('enemyHitboxScale');
      if (s === 1) return box;
      var w = box.w * s, h = box.h * s;
      return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h), w: w, h: h };
    },

    // Giẫm: người chơi đang rơi (hoặc mục tiêu đang bay lên đụng chân) và đáy frame trước ở trên đỉnh mục tiêu.
    // prevTop = đỉnh mục tiêu ở frame trước (bù cho địch nhảy lên như Marky — lỗi "khó đạp khi đang nhảy").
    // Chế độ kid: dung sai lớn hơn và chạm vào nửa trên khi đang rơi cũng tính là giẫm.
    isStomp: function (p, prevBottom, target, tol, prevTop) {
      if (!target || !U.overlap(p, target)) return false;
      var top = prevTop != null ? Math.max(target.y, prevTop) : target.y;
      var rising = prevTop != null && target.y < prevTop - 0.5;
      if (!(p.vy > 0 || (rising && p.vy > -120))) return false;
      var t = Math.max(tol == null ? 12 : tol, D.get('stompTolerance') || 12);
      if (prevBottom <= top + t) return true;
      // kid: rơi trúng nửa trên của mục tiêu
      return D.isKid() && p.vy > 60 && p.y + p.h <= target.y + target.h * 0.45;
    },
    // Va chạm gây sát thương: bỏ qua chạm sượt (chồng lấn < grazePx theo một trục).
    touches: function (p, box) {
      if (!box || !U.overlap(p, box)) return false;
      var g = D.get('grazePx') || 0;
      if (g <= 0) return true;
      var ox = Math.min(p.x + p.w, box.x + box.w) - Math.max(p.x, box.x);
      var oy = Math.min(p.y + p.h, box.y + box.h) - Math.max(p.y, box.y);
      return ox > Math.min(g, box.w / 3) && oy > Math.min(g, box.h / 3);
    },

    // Gọi ngay sau OG.Bosses.create trong scene boss. Trùm tự đọc arena.difficulty thì đánh dấu diffApplied.
    setupBoss: function (boss, arena) {
      var mul = D.get('bossHpMul');
      // Trùm ghép (trio: máu = tổng thành viên) tự tính lại hp trong src/bosses/trio.js.
      if (!boss || boss.diffApplied || mul === 1 || typeof boss.maxHp !== 'number' || boss.members) return boss;
      var hp = Math.max(2, Math.round(boss.maxHp * mul));
      if (hp < boss.maxHp) { boss.maxHp = hp; boss.hp = Math.min(boss.hp, hp); }
      boss.diffApplied = true;
      return boss;
    },
    bossTimeScale: function () { return D.get('bossSpeedMul'); },

    // Trợ giúp giữa trận: mỗi trùm (hoặc thành viên còn sống) mất 1 máu, không bao giờ về 0.
    weakenBoss: function (boss, arena) {
      if (!boss) return false;
      var hit = false;
      var list = boss.members ? boss.members : [boss];
      list.forEach(function (m) {
        if (!m || m.dead || !(m.hp > 1)) return;
        m.hp -= 1; hit = true;
        if (m.speedMul) m.speedMul *= 0.9;
        if (arena && arena.floatText && m.w) arena.floatText(m.x + m.w / 2, m.y - 20, '-1 ❤', '#ffc94a');
      });
      if (boss.members && typeof boss.syncHp === 'function') boss.syncHp();
      if (hit && OG.Game && OG.Game.hud.boss) { OG.Game.hud.boss.hp = boss.hp; OG.Game.refreshHud(); }
      return hit;
    },

    // Khiên + tim trợ giúp khi vào màn/trận (chỉ khi đang có trợ giúp). Trả cấp trợ giúp.
    applyAssist: function (p, levelId) {
      var P = computed(levelId);
      if (!P.assist) return 0;
      if (p) p.shield = Math.max(p.shield | 0, P.shield);
      var run = OG.Game && OG.Game.run;
      var want = P.lives + P.extraLives;
      if (run && !run.over && run.lives < want) {
        run.lives = want;
        run.maxLives = Math.max(run.maxLives, want);
        OG.Events.emit('lives:change', { lives: run.lives, maxLives: run.maxLives });
      }
      if (OG.Game) { OG.Game.hud.shield = p ? p.shield : 0; OG.Game.refreshHud(); }
      return P.assist;
    },

    // Ghi vị trí đứng an toàn: đứng vững trên nền (cả hai chân), không sát kẻ địch.
    // world (tuỳ chọn): {platforms, enemies}. Gọi mỗi frame.
    trackSafe: function (p, world) {
      if (!p || !p.ground) return;
      if (world && world.platforms) {
        var foot = p.y + p.h, ok = false;
        for (var i = 0; i < world.platforms.length; i++) {
          var a = world.platforms[i];
          if (Math.abs(a.y - foot) < 2 && p.x >= a.x + 6 && p.x + p.w <= a.x + a.w - 6) { ok = true; break; }
        }
        if (!ok) return;
        var es = world.enemies || [];
        for (var k = 0; k < es.length; k++) {
          var e = es[k];
          if (e && e.alive && Math.abs(e.x + e.w / 2 - (p.x + p.w / 2)) < 90 && Math.abs(e.y - p.y) < 120) return;
        }
      }
      p.safeX = p.x; p.safeY = p.y;
    },
    // Rơi khỏi màn hình. Trả true nếu đã xử lý (không mất mạng): Oggy "rơi từ trên trời" xuống chỗ an toàn.
    onFall: function (p, world) {
      if (D.get('fallDamage')) return false;
      p.x = p.safeX != null ? p.safeX : 70;
      p.y = (p.safeY != null ? p.safeY : 380) - 70;
      p.vx = 0; p.vy = 0;
      p.inv = Math.max(p.inv, 1.5);
      p.invMax = Math.max(p.invMax || 0, p.inv + 1); // nhấp nháy nhưng không đổi sang dáng "đau"
      var cx = p.x + p.w / 2;
      if (OG.Particles) {
        OG.Particles.spawn(cx, p.y + p.h, { color: '#ffffff', count: 10, speed: 140 });
        OG.Particles.floatText(cx, p.y - 16, U.choice(['Bùm! Về chỗ cũ! 😄', 'Hụt chân rồi! 🙈', 'Oáp! Không sao! 😆']), '#ffc94a');
      }
      toast('Hụt chân rồi! Không sao đâu 😊');
      OG.Events.emit('player:respawn', { cause: 'fall', x: p.x, y: p.y, levelId: curLevelId() });
      return true;
    },
    // Hết mạng. Trả true nếu đã xử lý (chơi tiếp tại checkpoint với đầy mạng; thẻ/trang đã nhặt vẫn giữ).
    softFail: function (info) {
      var run = OG.Game.run;
      if (!run || !run.journeyId || !D.get('softFail')) return false;
      var levelId = (info && info.levelId) || curLevelId();
      var assistBefore = D.assistLevel(levelId);
      D.recordFail(levelId);
      var P = computed(levelId);
      var assistUp = P.assist > assistBefore;
      run.lives = P.lives + P.extraLives;
      run.maxLives = Math.max(run.maxLives, run.lives);
      var p = null, scene = OG.Scenes.base();
      if (scene === 'level' && OG.Level.state) {
        var st = OG.Level.state;
        p = st.player;
        var cp = st.checkpoint || { x: st.level.spawn.x, y: st.level.spawn.y };
        p.x = cp.x; p.y = cp.y;
        p.safeX = cp.x; p.safeY = cp.y;
      } else if (scene === 'boss' && OG.BossScene && OG.BossScene.getPlayer()) {
        p = OG.BossScene.getPlayer();
        var A = OG.BossScene.getArena();
        p.x = 80; p.y = 300;
        // Trợ giúp vừa bật giữa trận: trùm yếu đi.
        if (assistUp && A) D.weakenBoss(OG.BossScene.getBoss(), A);
      }
      if (p) {
        p.vx = 0; p.vy = 0; p.inv = 2.5; p.invMax = 3;
        p.shield = Math.max(p.shield | 0, P.shield);
        if (OG.Game) OG.Game.hud.shield = p.shield;
        if (OG.Particles) OG.Particles.spawn(p.x + p.w / 2, p.y + p.h / 2, { color: '#ffc94a', count: 14, speed: 180 });
      }
      OG.Events.emit('lives:change', { lives: run.lives, maxLives: run.maxLives });
      OG.Events.emit('player:respawn', { cause: 'softfail', x: p ? p.x : 0, y: p ? p.y : 0, levelId: levelId });
      if (!U.call('Story', 'onSoftFail', { levelId: levelId, assist: P.assist })) {
        toast(assistUp ? 'Cố lên! Bạn được thêm tim và khiên nè 💪' : U.choice(CHEER), 2.2);
      }
      return true;
    }
  });

  // ---- Level hook: cờ checkpoint (chỉ khi params.checkpoints) + vị trí an toàn + trợ giúp lúc vào màn ----
  // Tìm mặt nền tại x (ưu tiên nền thấp nhất = sàn). Trả y mặt nền hoặc null nếu là hố.
  function groundAt(st, x) {
    var best = null;
    for (var i = 0; i < st.platforms.length; i++) {
      var a = st.platforms[i];
      if (x >= a.x + 10 && x <= a.x + a.w - 10 && (best == null || a.y > best)) best = a.y;
    }
    return best;
  }
  // Dời x sang phải tới chỗ có nền (tránh cắm cờ giữa hố).
  function solidX(st, x) {
    for (var dx = 0; dx < 400; dx += 20) {
      if (groundAt(st, x + dx) != null) return x + dx;
      if (x - dx > 40 && groundAt(st, x - dx) != null) return x - dx;
    }
    return x;
  }

  function drawFlag(ctx, c, gy, t) {
    // Cột cờ + lá cờ có mặt cười (vẫy theo gió), dựng lên khi chạm tới.
    var raise = c.reached ? Math.min(1, c.raiseT / 0.5) : 0;
    var top = gy - 78, fy = top + 2 + (1 - raise) * 40;
    var col = c.reached ? '#3fbf6f' : '#ffc94a';
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // đế
    ctx.fillStyle = '#17233d';
    ctx.beginPath(); ctx.ellipse(c.x, gy - 2, 13, 5, 0, 0, Math.PI * 2); ctx.fill();
    // cột
    U.fillRound(ctx, c.x - 4, top - 2, 8, gy - top, 4, '#17233d');
    U.fillRound(ctx, c.x - 2, top, 4, gy - top - 2, 2, '#f4f1e8');
    // lá cờ vẫy
    var wave = Math.sin(t * 5 + c.x) * 3;
    ctx.beginPath();
    ctx.moveTo(c.x + 3, fy);
    ctx.quadraticCurveTo(c.x + 20, fy - 4 + wave, c.x + 40, fy + 4 + wave);
    ctx.quadraticCurveTo(c.x + 36, fy + 15, c.x + 40, fy + 26 - wave);
    ctx.quadraticCurveTo(c.x + 20, fy + 20 - wave, c.x + 3, fy + 26);
    ctx.closePath();
    ctx.fillStyle = col; ctx.fill();
    ctx.strokeStyle = '#17233d'; ctx.lineWidth = 3; ctx.stroke();
    // mặt cười trên lá cờ
    var fx = c.x + 20, fyc = fy + 12 + wave * 0.3;
    ctx.fillStyle = '#17233d';
    ctx.beginPath(); ctx.arc(fx - 5, fyc - 2, 2, 0, Math.PI * 2); ctx.arc(fx + 5, fyc - 2, 2, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (c.reached) ctx.arc(fx, fyc + 1, 5, 0.15 * Math.PI, 0.85 * Math.PI);
    else { ctx.moveTo(fx - 3, fyc + 4); ctx.lineTo(fx + 3, fyc + 4); }
    ctx.stroke();
    // núm cột
    ctx.fillStyle = '#ffc94a';
    ctx.beginPath(); ctx.arc(c.x, top - 3, 5, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2; ctx.stroke();
    // lấp lánh khi vừa dựng cờ
    if (c.reached && c.raiseT < 1.2) {
      var k = c.raiseT / 1.2;
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = '#ffd36b';
      for (var i = 0; i < 6; i++) {
        var a = i * Math.PI / 3 + t * 2, r = 20 + k * 30;
        ctx.beginPath(); ctx.arc(c.x + Math.cos(a) * r, fy + 10 + Math.sin(a) * r, 3.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  var checkpointHook = {
    id: 'checkpoints', order: 10,
    enter: function (st) {
      st.checkpoint = null;
      st.checkpoints = [];
      // Trợ giúp (sau khi thua nhiều lần): khiên + tim ngay khi vào màn.
      if (D.applyAssist(st.player, st.level.id)) toast(U.choice(CHEER) + ' (có trợ giúp)', 2);
      if (!D.get('checkpoints', st.level.id)) return;
      var xs = st.level.checkpoints;
      if (!xs) {
        xs = [];
        var gap = D.get('checkpointSpacing') || 600;
        for (var x = gap; x < st.level.exit.x - 200; x += gap) xs.push(x);
      }
      st.checkpoints = xs.map(function (x, i) {
        var sx = solidX(st, x);
        var gy = groundAt(st, sx);
        return { x: sx, y: gy != null ? gy : OG.FLOOR_Y, index: i, reached: false, raiseT: 0 };
      });
    },
    update: function (st, dt, p) {
      D.trackSafe(p, st);
      for (var i = 0; i < st.checkpoints.length; i++) {
        var c = st.checkpoints[i];
        if (c.reached) { c.raiseT += dt; continue; }
        if (p.x + p.w / 2 < c.x) continue;
        c.reached = true;
        c.raiseT = 0;
        // Hồi sinh: đứng trên mặt nền tại cờ.
        st.checkpoint = { x: c.x - p.w / 2, y: c.y - p.h - 2 };
        OG.Particles.floatText(c.x, c.y - 96, 'Lưu điểm! 🚩', '#3fbf6f');
        OG.Particles.spawn(c.x + 20, c.y - 70, { color: '#3fbf6f', count: 10, speed: 150 });
        OG.Events.emit('checkpoint:reach', { levelId: st.level.id, index: c.index, x: c.x, y: c.y });
      }
    },
    drawWorld: function (ctx, st, t) {
      for (var i = 0; i < st.checkpoints.length; i++) {
        var c = st.checkpoints[i];
        if (OG.Sprites.drawProp && OG.Sprites.drawProp(ctx, 'checkpoint', c.x, c.y, t, { reached: c.reached, raise: Math.min(1, c.raiseT / 0.5) })) continue;
        drawFlag(ctx, c, c.y, t);
      }
    }
  };
})();
