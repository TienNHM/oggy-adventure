/* OG.Game — quản lý lượt chơi (run): điểm, mạng, nhân vật, chuyển màn, kết thúc game, HUD state.
 * Chủ sở hữu: agent Tích hợp.
 *
 * Một "run" bắt đầu khi bấm Bắt đầu ở menu và kết thúc khi game over / chiến thắng.
 * Điểm và mạng được giữ qua các màn (giống MVP). */
(function () {
  'use strict';
  var OG = window.OG;
  var C = OG.Config;

  // Modifiers mặc định — OG.Shop có thể trả về các field này (xem docs).
  function baseMods() {
    return { extraLives: 0, speedMul: 1, jumpMul: 1, magnet: 0, shield: 0, coinMul: 1, scoreMul: 1 };
  }
  function mergeMods(base, m) {
    if (!m || typeof m !== 'object') return base;
    for (var k in m) {
      if (typeof m[k] !== 'number') continue;
      if (/Mul$/.test(k)) base[k] = (base[k] || 1) * m[k];
      else base[k] = (base[k] || 0) + m[k];
    }
    return base;
  }

  var Game = (OG.Game = {
    run: null,     // RunState hoặc null
    stage: null,   // LevelStats của màn đang chơi (dùng chung cho màn + boss)

    // HUD state — OG.Menus.updateHud(hud) được gọi mỗi khi thay đổi (qua refreshHud()).
    hud: {
      scene: 'menu', levelId: null, levelName: '', icon: '', pizzas: 0, goal: 0,
      lives: 3, maxLives: 3, score: 0, coins: 0, shield: 0, time: 0,
      boss: null,   // {id, name, hp, maxHp} khi đang đánh boss
      quests: []    // [{id, text, done, progress, target}] do OG.Quests cung cấp
    },

    // Tạo run mới. opts: {charId, skinId}
    newRun: function (opts) {
      opts = opts || {};
      var save = OG.Save.data;
      var charId = opts.charId || save.selectedChar || 'oggy';
      if (!OG.Data.characters[charId] || save.unlockedChars.indexOf(charId) < 0) charId = 'oggy';
      var skinId = opts.skinId || save.equippedSkins[charId] || null;
      var runMods = mergeMods(baseMods(), OG.util.call('Shop', 'getRunModifiers', charId));
      var lives = C.START_LIVES + (runMods.extraLives | 0);
      Game.run = {
        charId: charId, skinId: skinId,
        score: 0, lives: lives, maxLives: Math.max(lives, C.START_LIVES),
        coinsEarned: 0, startTime: OG.time, playTime: 0, nextLevel: 0,
        levelsCompleted: [], over: false, mods: runMods,
        stats: { stomps: 0, hurts: 0, pizzas: 0, coins: 0, bosses: 0 }
      };
      save.stats.plays++;
      OG.Save.commit();
      Game.hud.score = 0; Game.hud.lives = lives; Game.hud.maxLives = Game.run.maxLives;
      OG.Events.emit('game:start', { charId: charId, skinId: skinId, run: Game.run });
      return Game.run;
    },
    ensureRun: function () { if (!Game.run || Game.run.over) Game.newRun(); return Game.run; },

    // Modifiers cho một màn/boss: modifiers của run + OG.Shop.getLevelModifiers().
    levelMods: function (levelId) {
      var m = mergeMods(baseMods(), null);
      var r = Game.run && Game.run.mods;
      if (r) { m.speedMul = r.speedMul; m.jumpMul = r.jumpMul; m.magnet = r.magnet; m.coinMul = r.coinMul; m.scoreMul = r.scoreMul; m.shield = r.shield; }
      return mergeMods(m, OG.util.call('Shop', 'getLevelModifiers', levelId, Game.run ? Game.run.charId : 'oggy'));
    },

    // Bắt đầu chơi một màn (id hoặc chỉ số).
    startLevel: function (idOrIndex) {
      Game.ensureRun();
      var level = OG.Data.getLevel(idOrIndex);
      if (!level) { console.error('[OG.Game] không có màn', idOrIndex); return; }
      OG.Scenes.go('level', { levelId: level.id });
    },

    // Gọi bởi scene level khi bắt đầu màn — reset thống kê màn.
    beginStage: function (level) {
      Game.stage = {
        levelId: level.id, startTime: OG.time, playTime: 0, levelScore: 0,
        pizzas: 0, pizzaTotal: level.pizzas.length, goal: level.goal,
        coins: 0, coinTotal: (level.coins || []).length,
        stomps: 0, hurts: 0, bossHurts: 0, bossId: level.boss || null, bossDefeated: false
      };
      Game.run.nextLevel = OG.Data.levelIndex(level.id);
      return Game.stage;
    },

    // Cộng thời gian chơi thật (scene level/boss gọi mỗi frame; KHÔNG tính lúc tạm dừng hay ở menu).
    // stage.playTime dùng cho đồng hồ HUD, nhiệm vụ "về đích dưới X giây" và kỷ lục thời gian màn.
    tickTime: function (dt) {
      if (Game.stage) Game.stage.playTime = (Game.stage.playTime || 0) + dt;
      if (Game.run) Game.run.playTime = (Game.run.playTime || 0) + dt;
      Game.hud.time = Game.stage ? Game.stage.playTime : 0;
    },

    addScore: function (n, x, y) {
      if (!Game.run) return;
      n = Math.round(n * ((Game.run.mods && Game.run.mods.scoreMul) || 1));
      Game.run.score += n;
      if (Game.stage) Game.stage.levelScore += n;
      Game.hud.score = Game.run.score;
      OG.Events.emit('score:change', { score: Game.run.score, delta: n });
      Game.refreshHud();
    },

    // Nhặt xu trong màn: cộng ngay vào ví (OG.Save).
    pickupCoins: function (n) {
      var mul = (Game.run && Game.run.mods && Game.run.mods.coinMul) || 1;
      n = Math.max(1, Math.round(n * mul));
      if (Game.run) { Game.run.coinsEarned += n; Game.run.stats.coins += n; }
      if (Game.stage) Game.stage.coins += 1;
      OG.Save.addCoins(n, 'pickup');
    },

    // Trừ 1 mạng. Trả về số mạng còn lại. Hết mạng → gameOver().
    loseLife: function (cause) {
      var run = Game.run;
      if (!run || run.over) return 0;
      run.lives = Math.max(0, run.lives - 1);
      run.stats.hurts++;
      if (Game.stage) { Game.stage.hurts++; if (OG.Scenes.current() === 'boss') Game.stage.bossHurts++; }
      Game.hud.lives = run.lives;
      OG.Events.emit('lives:change', { lives: run.lives, maxLives: run.maxLives });
      Game.refreshHud();
      if (run.lives <= 0) {
        OG.Events.emit('player:die', { cause: cause });
        Game.gameOver();
      }
      return run.lives;
    },
    gainLife: function (n) {
      var run = Game.run;
      if (!run) return;
      run.lives += n || 1;
      run.maxLives = Math.max(run.maxLives, run.lives);
      Game.hud.lives = run.lives; Game.hud.maxLives = run.maxLives;
      OG.Events.emit('lives:change', { lives: run.lives, maxLives: run.maxLives });
      Game.refreshHud();
    },

    // Người chơi chạm cửa với đủ pizza → boss (nếu có) hoặc hoàn thành màn.
    finishStage: function (levelId) {
      var level = OG.Data.getLevel(levelId);
      if (level && level.boss && OG.util.call('Bosses', 'has', level.boss)) {
        OG.Scenes.go('boss', { levelId: levelId, bossId: level.boss });
      } else {
        Game.completeLevel(levelId);
      }
    },

    // Hoàn thành màn: tính kết quả, lưu tiến độ, thưởng xu, phát level:complete, chuyển scene.
    completeLevel: function (levelId) {
      var run = Game.ensureRun();
      var level = OG.Data.getLevel(levelId);
      var st = Game.stage || Game.beginStage(level);
      var allPizza = st.pizzas >= st.pizzaTotal;
      var noDamage = st.hurts === 0;
      var stars = 1 + (allPizza ? 1 : 0) + (noDamage ? 1 : 0);
      var reward = 5 + stars * 5;
      var result = {
        levelId: level.id, index: OG.Data.levelIndex(level.id), name: level.name,
        levelScore: st.levelScore, score: run.score,
        pizzas: st.pizzas, pizzaTotal: st.pizzaTotal, goal: st.goal,
        coins: st.coins, coinTotal: st.coinTotal, coinsReward: reward,
        stomps: st.stomps, hurts: st.hurts, noDamage: noDamage,
        bossId: st.bossId, bossDefeated: st.bossDefeated, bossNoDamage: st.bossDefeated && st.bossHurts === 0,
        time: st.playTime != null ? st.playTime : OG.time - st.startTime, stars: stars,
        isFinal: OG.Progress.isFinal(level.id), firstClear: false, newlyUnlocked: []
      };
      var pr = OG.Progress.complete(level.id, result);
      result.firstClear = pr.firstClear;
      result.newlyUnlocked = pr.newlyUnlocked;
      result.charsUnlocked = pr.charsUnlocked;
      run.levelsCompleted.push(level.id);
      var next = OG.Progress.nextLevelId(level.id);
      // Màn cuối (final) giữ nguyên chỉ số: buildResult('victory') phải ghi đúng màn vừa thắng
      // (danh sách còn màn phụ đăng ký SAU màn cuối, vd basement).
      run.nextLevel = next && !result.isFinal ? OG.Data.levelIndex(next) : OG.Data.levelIndex(level.id);
      OG.Save.addCoins(reward, 'level');
      run.coinsEarned += reward;
      OG.Save.submitBest(run.score);
      OG.Events.emit('level:complete', result);
      Game.stage = null;
      if (result.isFinal) Game.victory();
      else OG.Scenes.go('worldmap', { completed: level.id, result: result });
      return result;
    },

    // Kết quả cuối run (cho gameover/victory, leaderboard, chia sẻ).
    buildResult: function (type) {
      var run = Game.run || { score: 0, charId: 'oggy', stats: {}, coinsEarned: 0, startTime: OG.time, levelsCompleted: [] };
      var idx = run.nextLevel | 0;
      var level = OG.Data.getLevel(idx) || OG.Data.levels[0];
      return {
        type: type, score: run.score, bestScore: OG.Save.data.bestScore,
        isNewBest: run.score > 0 && run.score >= OG.Save.data.bestScore,
        levelId: level.id, levelIndex: idx, levelName: level.name,
        levelsCompleted: run.levelsCompleted.slice(), charId: run.charId, skinId: run.skinId || null,
        coinsEarned: run.coinsEarned, time: run.playTime != null ? run.playTime : OG.time - run.startTime, stats: run.stats,
        date: new Date().toISOString()
      };
    },

    gameOver: function () {
      var run = Game.run;
      if (!run || run.over) return;
      run.over = true;
      OG.Save.data.stats.deaths++;
      OG.Save.submitBest(run.score);
      var result = Game.buildResult('gameover');
      OG.Events.emit('game:over', { result: result });
      OG.Scenes.go('gameover', { result: result });
    },

    victory: function () {
      var run = Game.run;
      if (!run || run.over) return;
      run.over = true;
      OG.Save.data.stats.victories++;
      OG.Save.submitBest(run.score);
      OG.Save.commit();
      var result = Game.buildResult('victory');
      OG.Events.emit('game:victory', { result: result });
      OG.Scenes.go('victory', { result: result });
    },

    // Đẩy HUD state ra OG.Menus.
    refreshHud: function () {
      var h = Game.hud;
      h.coins = OG.Save.getCoins();
      if (Game.run) { h.score = Game.run.score; h.lives = Game.run.lives; h.maxLives = Game.run.maxLives; }
      var q = OG.util.call('Quests', 'getHudLines', h.levelId);
      h.quests = Array.isArray(q) ? q : [];
      OG.util.call('Menus', 'updateHud', h);
    }
  });

  // Xu thay đổi (mua đồ, thưởng quest) → cập nhật HUD.
  OG.Events.on('coins:change', function () { Game.refreshHud(); });
})();
