// @ts-check
/* ============================================================================
 * OG.Events + OG.EV — EVENT BUS (kênh sự kiện dùng chung)
 * ----------------------------------------------------------------------------
 * Vai trò:      Cho các module "nói chuyện" với nhau mà KHÔNG cần biết nhau. Vd Player chỉ cần
 *               emit('player:jump'); Audio, Quests, Social... ai quan tâm thì tự on('player:jump').
 * Khái niệm:    observer pattern / publish–subscribe · loose coupling (giảm phụ thuộc giữa module) ·
 *               hằng tên event (tránh gõ sai chuỗi) · cô lập lỗi listener · wildcard listener
 * Bài học:      docs/learn/06-event-bus-observer.md
 * Phụ thuộc:    OG.util.safe (namespace.js), OG.Config.DEBUG
 * Event:        định nghĩa TOÀN BỘ tên event chuẩn trong OG.EV (payload ghi ở comment cuối mỗi dòng).
 *               Bảng đầy đủ: docs/ARCHITECTURE.md mục 6 và docs/STORY.md mục 7.
 * API công khai: OG.Events.on/off/once/emit/clear, OG.EV.*
 * Đọc tiếp:     src/audio/audio.js (ví dụ module chỉ NGHE event) → src/world/quests.js (nghe để đếm nhiệm vụ)
 *               → src/game/player.js (ví dụ module PHÁT event)
 *
 * 💡 Khái niệm — vì sao dùng event bus thay vì gọi hàm trực tiếp?
 *   Gọi trực tiếp: Player phải biết Audio, Quests, Hud, Social... → thêm 1 module là phải sửa Player.
 *   Event bus: Player chỉ phát "tôi vừa nhảy". Module mới chỉ cần đăng ký nghe → mở rộng KHÔNG sửa code cũ.
 *   Đánh đổi: khó lần theo "ai xử lý event này" hơn → bù lại bằng bảng OG.EV + tìm kiếm tên event trong dự án.
 * ========================================================================== */
(function () {
  'use strict';
  var OG = window.OG;
  /** @type {Object<string, OGListener[]>} tên event -> danh sách listener (theo thứ tự đăng ký) */
  var listeners = {};

  // Hằng tên event chuẩn. Dùng OG.EV.X hoặc chuỗi trực tiếp đều được (giá trị chuỗi là API công khai — KHÔNG đổi).
  // Quy ước tên: '<chủ thể>:<việc vừa xảy ra>' ở thì quá khứ/hoàn thành, vd 'item:collect', 'boss:defeated'.
  // Comment cuối dòng = các field của payload.
  OG.EV = {
    SCENE_CHANGE: 'scene:change',       // {from, to, params, push?, pop?}  push/pop: true khi Scenes.push/pop (go() không có)
    GAME_START: 'game:start',           // {charId, run}
    GAME_PAUSE: 'game:pause',           // {scene}
    GAME_RESUME: 'game:resume',         // {scene}
    GAME_OVER: 'game:over',             // {result}
    GAME_VICTORY: 'game:victory',       // {result}
    LEVEL_START: 'level:start',         // {levelId, index, name, theme, music, boss, quests}
    LEVEL_EXIT_LOCKED: 'level:exitLocked', // {levelId, have, need}
    LEVEL_CLEAR: 'level:clear',         // {levelId} — chạm cửa đủ pizza (trước boss nếu có)
    LEVEL_COMPLETE: 'level:complete',   // LevelResult (xem docs)
    DOOR_ENTER: 'door:enter',           // {levelId, x, y}
    PLAYER_JUMP: 'player:jump',         // {charId, x, y}
    PLAYER_LAND: 'player:land',         // {x, y, vy}
    PLAYER_HURT: 'player:hurt',         // {lives, cause, shielded}
    PLAYER_ACTION: 'player:action',     // {x, y, face}
    PLAYER_DIE: 'player:die',           // {cause}
    ITEM_COLLECT: 'item:collect',       // {type, x, y, value, count, goal}
    ENEMY_STOMP: 'enemy:stomp',         // {type, x, y, score}
    SCORE_CHANGE: 'score:change',       // {score, delta}
    COINS_CHANGE: 'coins:change',       // {coins, delta, reason}
    LIVES_CHANGE: 'lives:change',       // {lives, maxLives}
    BOSS_START: 'boss:start',           // {bossId, levelId, name, maxHp}
    BOSS_HIT: 'boss:hit',               // {bossId, hp, maxHp}
    BOSS_PHASE: 'boss:phase',           // {bossId, phase}
    BOSS_DEFEATED: 'boss:defeated',     // {bossId, levelId, time}
    QUEST_PROGRESS: 'quest:progress',   // {questId, progress, target}
    QUEST_COMPLETE: 'quest:complete',   // {questId, reward, text}
    SHOP_PURCHASE: 'shop:purchase',     // {itemId, cost, kind}
    CHAR_SELECT: 'char:select',         // {charId}
    CHAR_UNLOCK: 'char:unlock',         // {charId, reason:'level'|'shop'}
    SKIN_EQUIP: 'skin:equip',           // {charId, skinId}
    SETTINGS_CHANGE: 'settings:change', // {key, value}
    LEADERBOARD_SUBMIT: 'leaderboard:submit', // {entry, rank}
    UI_CLICK: 'ui:click',               // {id}
    UI_TOAST: 'ui:toast',               // {text}
    INPUT_TAP: 'input:tap',             // {x, y} toạ độ logic canvas
    INPUT_FIRST_GESTURE: 'input:firstGesture', // {} — để Audio mở khoá AudioContext
    SAVE_RESET: 'save:reset',           // {}

    // ---- Event mở rộng do module tính năng tự phát (xem src/<module>/INTEGRATION.md) ----
    BOSS_HEAL: 'boss:heal',             // {bossId, hp, maxHp} — Dee Dee ăn bánh hồi máu
    BOSS_FOOD_STOLEN: 'boss:foodStolen', // {bossId} — người chơi giật bánh của Dee Dee
    WORLD_SELECT: 'world:select',       // {levelId} — vào màn từ bản đồ
    WORLD_ARRIVE: 'world:arrive',       // {levelId} — Oggy đi tới một nút trên bản đồ
    SHOP_USE: 'shop:use',               // {itemId, levelId|null} — tiêu thụ vật phẩm
    SOCIAL_SHARE: 'social:share',       // {method, ok}
    SOCIAL_NAME_CHANGE: 'social:nameChange', // {name}
    SOCIAL_ONLINE_SUBMIT: 'social:onlineSubmit', // {entry, ok, rank}
    LEADERBOARD_CLEAR: 'leaderboard:clear', // {}

    // ---- v2: Hành trình học tập (docs/STORY.md mục 7) ----
    JOURNEY_SELECT: 'journey:select',     // {journeyId, difficulty}
    JOURNEY_COMPLETE: 'journey:complete', // {journeyId, cards, totalCards}
    AREA_ENTER: 'area:enter',             // {journeyId, areaId, levelId}
    AREA_COMPLETE: 'area:complete',       // {journeyId, areaId}
    PAGE_COLLECT: 'page:collect',         // {journeyId, levelId, cardId, x, y, isNew}
    CARD_UNLOCK: 'card:unlock',           // {journeyId, cardId, count, total}
    CARD_OPEN: 'card:open',               // {journeyId, cardId, from:'level'|'notebook'}
    QUIZ_OPEN: 'quiz:open',               // {journeyId, quizId, levelId, gateId}
    QUIZ_ANSWER: 'quiz:answer',           // {journeyId, quizId, choice, correct, tries}
    QUIZ_PASS: 'quiz:pass',               // {journeyId, quizId, tries, firstTry, levelId, gateId}
    GATE_OPEN: 'gate:open',               // {levelId, gateId, quizId, x}
    COMIC_START: 'comic:start',           // {journeyId, comicId, panels}
    COMIC_END: 'comic:end',               // {journeyId, comicId, skipped}
    GUIDE_TALK: 'guide:talk',             // {journeyId, charId, levelId, spot, text}
    NOTEBOOK_OPEN: 'notebook:open',       // {journeyId}
    CHECKPOINT_REACH: 'checkpoint:reach', // {levelId, index, x, y}
    PLAYER_RESPAWN: 'player:respawn',     // {cause:'fall'|'softfail', x, y, levelId}
    DIFFICULTY_CHANGE: 'difficulty:change', // {mode, prev}
    ASSIST_ON: 'assist:on'                // {levelId, level, fails}
  };

  OG.Events = {
    /**
     * Đăng ký listener cho một event.
     * @param {string} name tên event, nên dùng hằng OG.EV.X; '*' = nghe MỌI event (listener nhận (name, payload))
     * @param {OGListener} fn hàm nhận đúng 1 tham số payload (object)
     * @returns {Unsubscribe} gọi hàm này để huỷ đăng ký
     * @example
     *   var off = OG.Events.on(OG.EV.PLAYER_JUMP, function (p) { console.log('nhảy tại', p.x); });
     *   off(); // thôi nghe
     */
    on: function (name, fn) {
      (listeners[name] = listeners[name] || []).push(fn);
      // ⚠️ Bẫy: scene/module đăng ký trong enter() mà không off() trong exit() → mỗi lần vào scene
      //   lại thêm 1 listener, event bị xử lý 2, 3, 4 lần (memory leak). Giữ hàm off trả về để huỷ.
      return function () { OG.Events.off(name, fn); };
    },

    /**
     * Huỷ đăng ký. Phải truyền ĐÚNG tham chiếu hàm đã on() (hàm ẩn danh viết lại sẽ không khớp).
     * @param {string} name
     * @param {OGListener} fn
     */
    off: function (name, fn) {
      var arr = listeners[name];
      if (!arr) return;
      var i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
    },

    /**
     * Nghe event đúng MỘT lần rồi tự huỷ.
     * @param {string} name
     * @param {OGListener} fn
     * @returns {Unsubscribe} huỷ sớm nếu event chưa xảy ra
     */
    once: function (name, fn) {
      var off = OG.Events.on(name, function (p) { off(); fn(p); });
      return off;
    },

    /**
     * Phát event tới mọi listener đã đăng ký (đồng bộ: chạy xong hết listener mới return).
     * @param {string} name
     * @param {Object} [payload] dữ liệu kèm theo; thiếu thì listener nhận {} (không bao giờ undefined)
     * @example
     *   OG.Events.emit(OG.EV.COINS_CHANGE, { coins: 12, delta: 2, reason: 'pickup' });
     */
    emit: function (name, payload) {
      if (OG.Config && OG.Config.DEBUG) console.log('[OG.Events]', name, payload);
      var arr = listeners[name];
      if (arr) {
        // ⚠️ Bẫy: listener có thể off() chính nó (vd once) trong lúc đang duyệt mảng → splice làm
        //   bỏ sót listener kế tiếp. Duyệt trên BẢN SAO (slice) để tránh.
        arr = arr.slice();
        for (var i = 0; i < arr.length; i++) {
          // 💡 Khái niệm: cô lập lỗi — một listener ném lỗi không chặn listener khác và không làm sập frame.
          OG.util.safe('listener ' + name, arr[i], null, [payload || {}]);
        }
      }
      // Listener wildcard '*' nhận (name, payload) — tiện cho debug/analytics.
      // 🧪 Thử: gõ trong console trình duyệt  OG.Events.on('*', function (n, p) { console.log(n, p); })  rồi chơi.
      var all = listeners['*'];
      if (all) {
        all = all.slice();
        for (var j = 0; j < all.length; j++) OG.util.safe('listener *', all[j], null, [name, payload || {}]);
      }
    },

    /**
     * Xoá listener của một event, hoặc TẤT CẢ nếu không truyền name (dùng khi reset/test).
     * @param {string} [name]
     */
    clear: function (name) { if (name) delete listeners[name]; else listeners = {}; }
  };
})();
