// @ts-check
/* ============================================================================
 * OG.Game — QUẢN LÝ LƯỢT CHƠI (run): điểm, mạng, nhân vật, chuyển màn, kết thúc game, HUD state
 * ----------------------------------------------------------------------------
 * Vai trò:      "Trọng tài" của game. Giữ trạng thái lượt chơi (run) và màn đang chơi (stage), cộng điểm/xu, trừ mạng,
 *               và điều phối luồng: màn → trùm → hoàn thành → bản đồ / chiến thắng / game over.
 *               Scene 'level'/'boss' gọi addScore, loseLife, tickTime, finishStage; Menus/Story gọi newRun,
 *               startLevel, backToMap, restartLevel, retryRun.
 * Khái niệm:    tách tầng trạng thái (run: cả lượt · stage: một màn · Save: trọn đời) · luồng game như state machine
 *               cấp cao (finishStage → boss | completeLevel → worldmap | victory) · modifier nhân/cộng (Mul vs cộng) ·
 *               dữ liệu kết quả (LevelResult/RunResult) làm hợp đồng giữa các module · HUD state một chiều (refreshHud)
 * Bài học:      docs/learn/05-state-machine-scene.md, docs/learn/06-event-bus-observer.md, docs/learn/11-luu-tru-migrate.md
 * Phụ thuộc:    LÚC LOAD: OG.Config, OG.Events.on. LÚC CHẠY: OG.Save, OG.Data, OG.Scenes, OG.Progress, OG.util.call
 *               tới Shop/Difficulty/Bosses/Story/Quests/Menus (đều tuỳ chọn).
 * Event:        phát: 'game:start', 'score:change', 'lives:change', 'player:die', 'level:complete', 'game:over',
 *               'game:victory' · nghe: 'coins:change' (cập nhật HUD)
 * API công khai: OG.Game.run, stage, hud, newRun(opts), ensureRun(), levelMods(levelId), startLevel(idOrIndex),
 *               beginStage(level), tickTime(dt), addScore(n), pickupCoins(n), loseLife(cause), gainLife(n),
 *               finishStage(levelId), completeLevel(levelId), buildResult(type), gameOver(), victory(), mapScene(),
 *               backToMap(params), restartLevel(), retryRun(), refreshHud()
 * Đọc tiếp:     src/game/level.js (gọi finishStage) → src/game/boss-scene.js → src/game/progress.js (complete)
 * Dữ liệu:      RunState / StageStats bên dưới; LevelResult, RunResult ở docs/ARCHITECTURE.md mục 6 (Kiểu dữ liệu).
 *
 * Một "run" bắt đầu khi bấm Bắt đầu ở menu và kết thúc khi game over / chiến thắng.
 * Điểm và mạng được giữ qua các màn (giống MVP).
 * Điểm số: pizza +100, xu +10 (kèm 1 xu vào ví), giẫm gián +50, đánh trúng trùm +100, hạ trùm +500.
 * ========================================================================== */

/**
 * @typedef {Object} RunMods  hệ số/điểm cộng từ vật phẩm cửa hàng. Field đuôi "Mul" là hệ số NHÂN, còn lại CỘNG.
 * @property {number} extraLives
 * @property {number} speedMul
 * @property {number} jumpMul
 * @property {number} magnet     bán kính nam châm, px
 * @property {number} shield     số lần khiên đỡ đòn
 * @property {number} coinMul
 * @property {number} scoreMul
 */

/**
 * @typedef {Object} RunState  một lượt chơi (OG.Game.run)
 * @property {string} charId
 * @property {string|null} skinId
 * @property {string|null} journeyId   null = chiến dịch cổ điển v1
 * @property {string|null} levelId     màn đang/vừa chơi
 * @property {number} score
 * @property {number} lives
 * @property {number} maxLives
 * @property {number} coinsEarned
 * @property {number} startTime        OG.time lúc bắt đầu, giây
 * @property {number} playTime         giây chơi thật (không tính pause/menu)
 * @property {number} nextLevel        chỉ số màn cổ điển kế tiếp trong OG.Data.levels
 * @property {string[]} levelsCompleted
 * @property {boolean} over
 * @property {RunMods} mods
 * @property {{stomps: number, hurts: number, pizzas: number, coins: number, bosses: number}} stats
 */

/**
 * @typedef {Object} StageStats  thống kê một màn (OG.Game.stage), dùng chung cho màn + trận trùm sau nó
 * @property {string} levelId
 * @property {number} startTime
 * @property {number} playTime
 * @property {number} levelScore
 * @property {number} pizzas
 * @property {number} pizzaTotal
 * @property {number} goal
 * @property {number} coins
 * @property {number} coinTotal
 * @property {number} stomps
 * @property {number} hurts
 * @property {number} bossHurts
 * @property {string|null} bossId
 * @property {boolean} bossDefeated
 */
(function () {
  'use strict';
  var OG = window.OG;
  var C = OG.Config;

  var BASE_REWARD = 5;       // xu thưởng khi xong màn: 5 + 5 × số sao
  var REWARD_PER_STAR = 5;

  /**
   * Modifier mặc định (không có vật phẩm nào) — OG.Shop có thể trả về các field này (xem docs).
   * @returns {RunMods}
   */
  function baseMods() {
    return { extraLives: 0, speedMul: 1, jumpMul: 1, magnet: 0, shield: 0, coinMul: 1, scoreMul: 1 };
  }
  /**
   * Gộp modifier m vào base (SỬA base): field đuôi "Mul" nhân vào, field khác cộng vào; bỏ qua giá trị không phải số.
   * 💡 Khái niệm: hai kiểu cộng dồn chỉ số — hệ số (×1.2 rồi ×1.1 = ×1.32) và điểm cộng (+1 mạng rồi +1 = +2).
   *   Quy ước theo TÊN field giúp Shop thêm vật phẩm mới mà không phải sửa hàm này.
   * @param {any} base
   * @param {any} m
   * @returns {RunMods}
   */
  function mergeMods(base, m) {
    if (!m || typeof m !== 'object') return base;
    for (var k in m) {
      if (typeof m[k] !== 'number') continue;
      if (/Mul$/.test(k)) base[k] = (base[k] || 1) * m[k];
      else base[k] = (base[k] || 0) + m[k];
    }
    return base;
  }

  /** @type {{run: any, levelId: string, mods: Object, reuse: boolean} | null} vật phẩm cửa hàng của lần vào màn gần nhất */
  var shopCache = null;
  /** Sao chép nông (shallow copy) một object. @param {any} o @returns {any} */
  function copy(o) { /** @type {any} */ var r = {}; for (var k in o) r[k] = o[k]; return r; }
  /**
   * Lấy modifier vật phẩm cửa hàng cho màn. Shop.getLevelModifiers TIÊU THỤ vật phẩm (trừ kho), nên khi "Chơi lại
   * màn" ta dùng lại bản đã lưu trong shopCache thay vì gọi Shop lần nữa.
   * @param {string} levelId
   * @returns {Object}
   */
  function shopLevelMods(levelId) {
    var run = Game.run;
    var inLevel = OG.Scenes.current() === 'level';
    if (inLevel && shopCache && shopCache.reuse && shopCache.run === run && shopCache.levelId === levelId) {
      shopCache.reuse = false;
      return copy(shopCache.mods);
    }
    var m = OG.util.call('Shop', 'getLevelModifiers', levelId, run ? run.charId : 'oggy');
    m = m && typeof m === 'object' ? m : {};
    if (inLevel) shopCache = { run: run, levelId: levelId, mods: copy(m), reuse: false };
    return m;
  }

  var Game = (OG.Game = {
    /** @type {RunState | null} */
    run: null,
    /** @type {StageStats | null} thống kê màn đang chơi (dùng chung cho màn + boss) */
    stage: null,

    // HUD state — OG.Menus.updateHud(hud) được gọi mỗi khi thay đổi (qua refreshHud()).
    // 💡 Khái niệm: dữ liệu một chiều — gameplay chỉ GHI vào hud rồi gọi refreshHud(); module giao diện chỉ ĐỌC.
    //   Đổi giao diện HUD (DOM hay canvas) không phải sửa một dòng gameplay nào.
    /** @type {any} */
    hud: {
      scene: 'menu', levelId: null, levelName: '', icon: '', pizzas: 0, goal: 0,
      lives: 3, maxLives: 3, score: 0, coins: 0, shield: 0, time: 0,
      boss: null,   // {id, name, hp, maxHp} khi đang đánh boss
      quests: []    // [{id, text, done, progress, target}] do OG.Quests cung cấp
    },

    /**
     * Tạo lượt chơi mới (điểm 0, mạng đầy) và phát 'game:start'.
     * journeyId != null -> lượt chơi HÀNH TRÌNH v2 (OG.Story điều phối), null -> chiến dịch cổ điển v1.
     * @param {{charId?: string, skinId?: string, journeyId?: string}} [opts] nhân vật chưa mở khoá → về Oggy
     * @returns {RunState}
     * @example
     *   OG.Game.newRun(); OG.Scenes.go('worldmap');
     */
    newRun: function (opts) {
      opts = opts || {};
      var save = OG.Save.data;
      var charId = opts.charId || save.selectedChar || 'oggy';
      if (!OG.Data.characters[charId] || save.unlockedChars.indexOf(charId) < 0) charId = 'oggy';
      var skinId = opts.skinId || save.equippedSkins[charId] || null;
      var runMods = mergeMods(baseMods(), OG.util.call('Shop', 'getRunModifiers', charId));
      var baseLives = OG.util.call('Difficulty', 'startLives') || C.START_LIVES;
      var lives = baseLives + (runMods.extraLives | 0);
      // maxLives không thấp hơn số mạng gốc, để HUD luôn vẽ đủ ô trái tim của chế độ đang chơi.
      Game.run = {
        charId: charId, skinId: skinId,
        journeyId: opts.journeyId || null, levelId: null,
        score: 0, lives: lives, maxLives: Math.max(lives, baseLives),
        coinsEarned: 0, startTime: OG.time, playTime: 0, nextLevel: 0,
        levelsCompleted: [], over: false, mods: runMods,
        stats: { stomps: 0, hurts: 0, pizzas: 0, coins: 0, bosses: 0 }
      };
      save.stats.plays++;
      OG.Save.commit();
      Game.hud.score = 0; Game.hud.lives = lives; Game.hud.maxLives = Game.run.maxLives;
      OG.Events.emit('game:start', { charId: charId, skinId: skinId, run: Game.run, journeyId: Game.run.journeyId });
      return Game.run;
    },
    /** Đảm bảo có lượt chơi đang hoạt động (tạo mới nếu chưa có hoặc đã kết thúc). @returns {RunState} */
    ensureRun: function () { if (!Game.run || Game.run.over) Game.newRun(); return Game.run; },

    /**
     * Tính modifier cho một màn/boss: modifier của run + OG.Shop.getLevelModifiers() (vật phẩm dùng một lần).
     * @param {string} levelId
     * @returns {RunMods}
     */
    levelMods: function (levelId) {
      var m = mergeMods(baseMods(), null);
      var r = Game.run && Game.run.mods;
      if (r) { m.speedMul = r.speedMul; m.jumpMul = r.jumpMul; m.magnet = r.magnet; m.coinMul = r.coinMul; m.scoreMul = r.scoreMul; m.shield = r.shield; }
      return mergeMods(m, shopLevelMods(levelId));
    },

    /**
     * Bắt đầu chơi một màn (chuyển sang scene 'level').
     * @param {string | number} idOrIndex id màn hoặc chỉ số trong OG.Data.levels
     * @example
     *   OG.Game.startLevel('garden');
     */
    startLevel: function (idOrIndex) {
      Game.ensureRun();
      var level = OG.Data.getLevel(idOrIndex);
      if (!level) { console.error('[OG.Game] không có màn', idOrIndex); return; }
      OG.Scenes.go('level', { levelId: level.id });
    },

    /**
     * Đặt lại thống kê màn (scene level gọi khi vào màn).
     * @param {LevelDef} level
     * @returns {StageStats}
     */
    beginStage: function (level) {
      Game.stage = {
        levelId: level.id, startTime: OG.time, playTime: 0, levelScore: 0,
        pizzas: 0, pizzaTotal: level.pizzas.length, goal: level.goal,
        coins: 0, coinTotal: (level.coins || []).length,
        stomps: 0, hurts: 0, bossHurts: 0, bossId: level.boss || null, bossDefeated: false
      };
      Game.run.levelId = level.id;
      var idx = OG.Data.levelIndex(level.id);
      if (idx >= 0) Game.run.nextLevel = idx; // màn hành trình không có chỉ số trong Data.levels
      return Game.stage;
    },

    /**
     * Cộng thời gian chơi thật (scene level/boss gọi mỗi frame; KHÔNG tính lúc tạm dừng hay ở menu).
     * stage.playTime dùng cho đồng hồ HUD, nhiệm vụ "về đích dưới X giây" và kỷ lục thời gian màn.
     * 💡 Khái niệm: thời gian chơi = tổng các dt ở scene gameplay, KHÔNG phải (bây giờ − lúc bắt đầu). Vì scene
     *   pause nằm trên đỉnh stack nên scene level không được update → thời gian tự "đứng" khi tạm dừng.
     * @param {number} dt delta time, giây
     */
    tickTime: function (dt) {
      if (Game.stage) Game.stage.playTime = (Game.stage.playTime || 0) + dt;
      if (Game.run) Game.run.playTime = (Game.run.playTime || 0) + dt;
      Game.hud.time = Game.stage ? Game.stage.playTime : 0;
    },

    /**
     * Cộng điểm (đã nhân scoreMul, làm tròn) cho lượt và màn, phát 'score:change'.
     * @param {number} n điểm gốc
     * @param {number} [x] (không dùng — giữ để tương thích chữ ký cũ)
     * @param {number} [y] (không dùng)
     */
    addScore: function (n, x, y) {
      if (!Game.run) return;
      n = Math.round(n * ((Game.run.mods && Game.run.mods.scoreMul) || 1));
      Game.run.score += n;
      if (Game.stage) Game.stage.levelScore += n;
      Game.hud.score = Game.run.score;
      OG.Events.emit('score:change', { score: Game.run.score, delta: n });
      Game.refreshHud();
    },

    /**
     * Nhặt xu trong màn: cộng ngay vào ví (OG.Save, phát 'coins:change'). Luôn được ít nhất 1 xu.
     * @param {number} n số xu gốc (nhân coinMul)
     */
    pickupCoins: function (n) {
      var mul = (Game.run && Game.run.mods && Game.run.mods.coinMul) || 1;
      n = Math.max(1, Math.round(n * mul));
      if (Game.run) { Game.run.coinsEarned += n; Game.run.stats.coins += n; }
      // stage.coins đếm SỐ ĐỒNG XU đã nhặt (để so với coinTotal), không phải số xu nhận được.
      if (Game.stage) Game.stage.coins += 1;
      OG.Save.addCoins(n, 'pickup');
    },

    /**
     * Trừ 1 mạng, phát 'lives:change'. Hết mạng → (chế độ kid: softFail hồi mạng) hoặc 'player:die' + gameOver().
     * @param {string} cause lý do, vd 'enemy', 'fall', 'boss'
     * @returns {number} số mạng còn lại
     */
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
        // Chế độ 'kid' trong hành trình: hồi đầy mạng tại checkpoint thay vì game over.
        if (OG.util.call('Difficulty', 'softFail', { levelId: Game.stage ? Game.stage.levelId : null, cause: cause }) === true) {
          Game.hud.lives = run.lives; Game.hud.maxLives = run.maxLives;
          Game.refreshHud();
          return run.lives;
        }
        OG.Events.emit('player:die', { cause: cause });
        Game.gameOver();
      }
      return run.lives;
    },
    /**
     * Cộng mạng (có thể vượt maxLives cũ — maxLives tăng theo). Phát 'lives:change'.
     * @param {number} [n=1]
     */
    gainLife: function (n) {
      var run = Game.run;
      if (!run) return;
      run.lives += n || 1;
      run.maxLives = Math.max(run.maxLives, run.lives);
      Game.hud.lives = run.lives; Game.hud.maxLives = run.maxLives;
      OG.Events.emit('lives:change', { lives: run.lives, maxLives: run.maxLives });
      Game.refreshHud();
    },

    /**
     * Người chơi chạm cửa với đủ pizza → boss (nếu có, kèm truyện tranh mở đầu lần đầu) hoặc hoàn thành màn.
     * 💡 Khái niệm: luồng game là một state machine cấp cao — level ─(qua cửa)→ boss? ─(thắng)→ completeLevel
     *   → worldmap | victory. Mỗi mũi tên là một lời gọi Scenes.go(), quyết định tập trung ở file này.
     * @param {string} levelId
     */
    finishStage: function (levelId) {
      var level = OG.Data.getLevel(levelId);
      if (level && level.boss && OG.util.call('Bosses', 'has', level.boss)) {
        var toBoss = { scene: 'boss', params: { levelId: levelId, bossId: level.boss } };
        // Hành trình v2: truyện trước trận trùm (area.boss.intro), chỉ chiếu lần đầu.
        var jid = level.journey, intro = level.bossIntro;
        if (jid && intro && OG.Story && OG.Story.playComic && !OG.Story.hasSeen(jid, intro)) {
          OG.Story.playComic(jid, intro, { next: toBoss });
          return;
        }
        OG.Scenes.go(toBoss.scene, toBoss.params);
      } else {
        Game.completeLevel(levelId);
      }
    },

    /**
     * Hoàn thành màn: tính kết quả, lưu tiến độ, thưởng xu, phát 'level:complete', chuyển scene.
     * @param {string} levelId
     * @returns {any} LevelResult (docs/ARCHITECTURE.md mục 6)
     */
    completeLevel: function (levelId) {
      var run = Game.ensureRun();
      var level = OG.Data.getLevel(levelId);
      var st = Game.stage || Game.beginStage(level);
      var allPizza = st.pizzas >= st.pizzaTotal;
      var noDamage = st.hurts === 0;
      // Sao: 1 (qua màn) + 1 (ăn hết pizza) + 1 (không bị thương cả màn lẫn trùm — stage dùng chung cho cả hai).
      var stars = 1 + (allPizza ? 1 : 0) + (noDamage ? 1 : 0);
      var reward = BASE_REWARD + stars * REWARD_PER_STAR;
      /** @type {any} */
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
      if (level.journey) { result.journeyId = level.journey; result.areaId = level.areaId; result.isFinal = false; }
      var pr = OG.Progress.complete(level.id, result);
      result.firstClear = pr.firstClear;
      result.newlyUnlocked = pr.newlyUnlocked;
      result.charsUnlocked = pr.charsUnlocked;
      run.levelsCompleted.push(level.id);
      // ⚠️ Bẫy: thứ tự cộng xu → submitBest → emit('level:complete') → chuyển scene là hợp đồng (docs: "coinsReward
      //   đã cộng vào ví trước khi phát event"). Listener của level:complete đọc ví/kỷ lục và phải thấy số mới.
      if (level.journey) {
        // Hành trình v2: OG.Story quyết định cảnh tiếp theo (truyện tranh, bản đồ hành trình, kết thúc).
        OG.Save.addCoins(reward, 'level');
        run.coinsEarned += reward;
        OG.Save.submitBest(run.score);
        OG.Events.emit('level:complete', result);
        Game.stage = null;
        if (OG.util.call('Story', 'afterLevel', result) !== true) Game.backToMap({ completed: level.id, result: result });
        return result;
      }
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

    /**
     * Tạo kết quả cuối lượt (RunResult) cho gameover/victory, leaderboard, chia sẻ.
     * @param {'gameover'|'victory'} type
     * @returns {any} RunResult (docs/ARCHITECTURE.md mục 6)
     */
    buildResult: function (type) {
      // Chưa có run (vd mở thẳng scene gameover khi test) → dùng run giả rỗng để không lỗi.
      /** @type {any} */
      var run = Game.run || { score: 0, charId: 'oggy', stats: {}, coinsEarned: 0, startTime: OG.time, levelsCompleted: [] };
      var idx = run.nextLevel | 0;
      var level = (run.journeyId && run.levelId && OG.Data.getLevel(run.levelId)) || OG.Data.getLevel(idx) || OG.Data.levels[0];
      return {
        type: type, journeyId: run.journeyId || null, score: run.score, bestScore: OG.Save.data.bestScore,
        isNewBest: run.score > 0 && run.score >= OG.Save.data.bestScore,
        levelId: level.id, levelIndex: idx, levelName: level.name,
        levelsCompleted: run.levelsCompleted.slice(), charId: run.charId, skinId: run.skinId || null,
        coinsEarned: run.coinsEarned, time: run.playTime != null ? run.playTime : OG.time - run.startTime, stats: run.stats,
        date: new Date().toISOString()
      };
    },

    /**
     * Kết thúc lượt vì hết mạng: thống kê, kỷ lục, phát 'game:over', sang scene 'gameover'. Gọi lần 2 không làm gì.
     * 🧪 Thử: đang chơi, gõ trong console  OG.Game.gameOver()  để xem màn game over (chỉ cộng 1 vào thống kê deaths).
     */
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

    /** Kết thúc lượt vì thắng màn final: thống kê, kỷ lục, phát 'game:victory', sang scene 'victory'. */
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

    // ---- Điều hướng dùng chung (Menus/Story gọi; hiểu cả cổ điển lẫn hành trình) ----
    // Scene bản đồ của lượt hiện tại: 'journeyMap' (hành trình) hoặc 'worldmap' (cổ điển).
    /** @returns {string} 'journeyMap' (lượt hành trình, nếu scene có) hoặc 'worldmap' */
    mapScene: function () {
      return Game.run && Game.run.journeyId && OG.Scenes.has('journeyMap') ? 'journeyMap' : 'worldmap';
    },
    /**
     * Về bản đồ phù hợp với lượt hiện tại (tự thêm journeyId cho journeyMap).
     * @param {any} [params] truyền cho scene bản đồ, vd {completed: levelId, result}
     */
    backToMap: function (params) {
      params = params || {};
      var sc = Game.mapScene();
      if (sc === 'journeyMap' && !params.journeyId) params.journeyId = Game.run.journeyId;
      OG.Scenes.go(sc, params);
    },
    /**
     * Chơi lại màn đang/vừa chơi. Vật phẩm cửa hàng (khiên/giày/nam châm) của lần vào màn này được
     * DÙNG LẠI, không trừ kho thêm lần nữa ("Chơi lại màn" từ pause không được tiêu thêm vật phẩm).
     */
    restartLevel: function () {
      var run = Game.run;
      var id = run && run.levelId && OG.Data.getLevel(run.levelId) ? run.levelId : null;
      if (id && shopCache && shopCache.run === run && shopCache.levelId === id) shopCache.reuse = true;
      if (id) Game.startLevel(id);
      else Game.startLevel(run ? (run.nextLevel | 0) : 0);
    },
    /** Bắt đầu lượt mới cùng chế độ (hành trình hoặc cổ điển) — nút "Chơi lại" sau game over / chiến thắng. */
    retryRun: function () {
      var jid = Game.run && Game.run.journeyId;
      if (jid && OG.Story && OG.Story.startJourney) { OG.Story.startJourney(jid, { skipIntro: true }); return; }
      Game.newRun();
      OG.Scenes.go('worldmap');
    },

    /** Đồng bộ HUD state (xu, điểm, mạng, nhiệm vụ) rồi đẩy ra OG.Menus.updateHud. */
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
