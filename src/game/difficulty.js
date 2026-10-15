/* OG.Difficulty — độ khó 'kid' (mặc định, rất dễ) và 'challenge' (= cảm giác v1).
 * Chủ sở hữu giai đoạn v2: agent difficulty (src/game/). Hợp đồng: docs/STORY.md mục 5.
 *
 * BẢN STUB: tham số + hook đã nối vào game (Player, Enemies, Level, Boss, Game.loseLife).
 * Agent difficulty tinh chỉnh số liệu, hiệu ứng checkpoint, trợ giúp... nhưng GIỮ chữ ký hàm.
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
      enemyHitboxScale: 0.7,    // hộp gây sát thương của địch thu nhỏ còn 70%
      enemySpeedMul: 0.7,       // địch đi chậm hơn
      bossHpMul: 0.6,           // máu trùm còn 60% (làm tròn, tối thiểu 2)
      bossSpeedMul: 0.75,       // nhịp đòn trùm chậm lại (dt của boss.update nhân hệ số này)
      hurtInvuln: 2.2,          // giây bất tử sau khi bị thương
      checkpoints: true,        // cờ checkpoint tự động
      checkpointSpacing: 600,   // px giữa các cờ tự động (khi màn không khai báo checkpoints)
      fallDamage: false,        // rơi vực: KHÔNG mất mạng, hồi về chỗ đứng an toàn gần nhất
      softFail: true,           // hết mạng trong hành trình: hồi đầy mạng tại checkpoint, không game over
      autoAssistAfter: 2        // thua 2 lần cùng màn -> bật trợ giúp
    },
    challenge: {
      label: 'Thử thách', emoji: '🔥',
      lives: 3, coyoteTime: 0.06, jumpBuffer: 0.08, enemyHitboxScale: 1, enemySpeedMul: 1,
      bossHpMul: 1, bossSpeedMul: 1, hurtInvuln: 1.6, checkpoints: false, checkpointSpacing: 0,
      fallDamage: true, softFail: false, autoAssistAfter: 3
    }
  };
  // Hiệu ứng trợ giúp theo cấp (cộng dồn lên tham số chế độ).
  var ASSIST = [
    null,
    { enemySpeedMul: 0.85, bossHpMul: 0.8, shield: 1, extraLives: 1 },
    { enemySpeedMul: 0.7, bossHpMul: 0.6, shield: 2, extraLives: 2 }
  ];

  var mode = 'kid';

  function store() { return OG.Save.ns('difficulty'); }
  function fails() { var s = store(); if (!s.fails || typeof s.fails !== 'object') s.fails = {}; return s.fails; }
  function curLevelId() { return OG.Game && OG.Game.stage ? OG.Game.stage.levelId : null; }

  var D = (OG.Difficulty = {
    MODES: MODES,
    ASSIST: ASSIST,

    init: function () {
      var m = OG.Save.data.settings && OG.Save.data.settings.difficulty;
      mode = MODES[m] ? m : 'kid';
      OG.Events.on('save:reset', function () { mode = 'kid'; });
      // Thắng màn -> xoá đếm thua. Game over (challenge) -> tính 1 lần thua.
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
      if (OG.Save.data && OG.Save.data.settings) OG.Save.setSetting('difficulty', m);
      OG.Events.emit('difficulty:change', { mode: m, prev: prev });
      return mode;
    },
    toggle: function () { return D.set(mode === 'kid' ? 'challenge' : 'kid'); },

    // Tham số đã áp trợ giúp cho màn (mặc định màn đang chơi). Trả object mới.
    params: function (levelId) {
      var base = MODES[mode], out = {}, k;
      for (k in base) out[k] = base[k];
      out.mode = mode;
      out.shield = 0; out.extraLives = 0;
      var lv = D.assistLevel(levelId == null ? curLevelId() : levelId);
      out.assist = lv;
      var a = ASSIST[lv];
      if (a) {
        out.enemySpeedMul *= a.enemySpeedMul;
        out.bossHpMul *= a.bossHpMul;
        out.shield = a.shield;
        out.extraLives = a.extraLives;
      }
      return out;
    },
    get: function (key, levelId) { return D.params(levelId)[key]; },

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
      OG.Save.commit();
      var after = D.assistLevel(levelId);
      if (after > before) OG.Events.emit('assist:on', { levelId: levelId, level: after, fails: f[levelId] });
      return f[levelId];
    },
    recordClear: function (levelId) {
      var f = fails();
      if (f[levelId]) { delete f[levelId]; OG.Save.commit(); }
    },

    // ---- Hook do src/game gọi ----
    startLives: function () { return MODES[mode].lives; },
    // Gọi trong OG.Enemies.create (sau init loại địch).
    scaleEnemy: function (e) { e.speed *= D.get('enemySpeedMul'); return e; },
    // Thu nhỏ hộp gây sát thương quanh tâm.
    enemyHurtbox: function (box) {
      var s = D.get('enemyHitboxScale');
      if (s === 1) return box;
      var w = box.w * s, h = box.h * s;
      return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h), w: w, h: h };
    },
    // Gọi ngay sau OG.Bosses.create trong scene boss.
    setupBoss: function (boss) {
      var mul = D.get('bossHpMul');
      // Trùm ghép (vd trio: máu = tổng thành viên) tự tính lại hp -> agent difficulty xử lý trong src/bosses.
      if (!boss || mul === 1 || typeof boss.maxHp !== 'number' || boss.members) return boss;
      var hp = Math.max(2, Math.round(boss.maxHp * mul));
      if (hp < boss.maxHp) { boss.maxHp = hp; boss.hp = Math.min(boss.hp, hp); }
      return boss;
    },
    bossTimeScale: function () { return D.get('bossSpeedMul'); },

    // Ghi vị trí đứng an toàn (gọi mỗi frame khi người chơi đứng trên nền).
    trackSafe: function (p) {
      if (p.ground) { p.safeX = p.x; p.safeY = p.y; }
    },
    // Rơi khỏi màn hình. Trả true nếu đã xử lý (không mất mạng).
    onFall: function (p) {
      if (D.get('fallDamage')) return false;
      p.x = p.safeX != null ? p.safeX : 70;
      p.y = (p.safeY != null ? p.safeY : 380) - 40;
      p.vx = 0; p.vy = 0;
      p.inv = Math.max(p.inv, 1.2);
      OG.DOM.toast('Hụt chân rồi! Không sao đâu 😊');
      OG.Events.emit('player:respawn', { cause: 'fall', x: p.x, y: p.y, levelId: curLevelId() });
      return true;
    },
    // Hết mạng. Trả true nếu đã xử lý (chơi tiếp tại checkpoint với đầy mạng).
    softFail: function (info) {
      var run = OG.Game.run;
      if (!run || !run.journeyId || !D.get('softFail')) return false;
      var levelId = (info && info.levelId) || curLevelId();
      D.recordFail(levelId);
      var P = D.params(levelId);
      run.lives = P.lives + P.extraLives;
      run.maxLives = Math.max(run.maxLives, run.lives);
      var p = null, scene = OG.Scenes.base();
      if (scene === 'level' && OG.Level.state) {
        var st = OG.Level.state;
        p = st.player;
        var cp = st.checkpoint || { x: st.level.spawn.x, y: st.level.spawn.y };
        p.x = cp.x; p.y = cp.y;
      } else if (scene === 'boss' && OG.BossScene && OG.BossScene.getPlayer()) {
        p = OG.BossScene.getPlayer();
        p.x = 80; p.y = 300;
      }
      if (p) { p.vx = 0; p.vy = 0; p.inv = 2.5; p.shield = Math.max(p.shield, P.shield); }
      OG.Events.emit('lives:change', { lives: run.lives, maxLives: run.maxLives });
      OG.Events.emit('player:respawn', { cause: 'softfail', x: p ? p.x : 0, y: p ? p.y : 0, levelId: levelId });
      if (!U.call('Story', 'onSoftFail', { levelId: levelId, assist: P.assist })) {
        OG.DOM.toast(P.assist ? 'Cố lên! Bạn được thêm trợ giúp 💪' : 'Không sao! Thử lại nhé 💪', 2);
      }
      return true;
    }
  });

  // ---- Level hook: cờ checkpoint (chỉ khi params.checkpoints) ----
  var checkpointHook = {
    id: 'checkpoints', order: 10,
    enter: function (st) {
      st.checkpoint = null;
      st.checkpoints = [];
      if (!D.get('checkpoints', st.level.id)) return;
      var xs = st.level.checkpoints;
      if (!xs) {
        xs = [];
        var gap = D.get('checkpointSpacing') || 600;
        for (var x = gap; x < st.level.exit.x - 200; x += gap) xs.push(x);
      }
      st.checkpoints = xs.map(function (x, i) { return { x: x, index: i, reached: false }; });
    },
    update: function (st, dt, p) {
      D.trackSafe(p);
      for (var i = 0; i < st.checkpoints.length; i++) {
        var c = st.checkpoints[i];
        if (c.reached || p.x + p.w / 2 < c.x || !p.ground) continue;
        c.reached = true;
        st.checkpoint = { x: c.x - p.w / 2, y: p.y };
        OG.Particles.floatText(c.x, p.y - 20, 'Lưu điểm! 🚩', '#3fbf6f');
        OG.Events.emit('checkpoint:reach', { levelId: st.level.id, index: c.index, x: c.x, y: p.y });
      }
    },
    drawWorld: function (ctx, st, t) {
      for (var i = 0; i < st.checkpoints.length; i++) {
        var c = st.checkpoints[i];
        if (OG.Sprites.drawProp && OG.Sprites.drawProp(ctx, 'checkpoint', c.x, OG.FLOOR_Y, t, { reached: c.reached })) continue;
        // Dự phòng: cột cờ + lá cờ (xanh khi đã tới).
        ctx.save();
        ctx.fillStyle = '#17233d'; ctx.fillRect(c.x - 2, OG.FLOOR_Y - 70, 4, 70);
        ctx.fillStyle = c.reached ? '#3fbf6f' : '#ffc94a';
        ctx.beginPath(); ctx.moveTo(c.x + 2, OG.FLOOR_Y - 70); ctx.lineTo(c.x + 30, OG.FLOOR_Y - 60); ctx.lineTo(c.x + 2, OG.FLOOR_Y - 50); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
  };
})();
