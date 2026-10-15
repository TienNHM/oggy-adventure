/* OG.Events — event bus đơn giản (on/off/once/emit).
 * Listener bị lỗi sẽ được bắt lại, không ảnh hưởng listener khác hay gameplay.
 * Danh sách event chuẩn: OG.EV (xem docs/ARCHITECTURE.md mục "Events"). */
(function () {
  'use strict';
  var OG = window.OG;
  var listeners = {}; // name -> [fn]

  // Hằng tên event chuẩn. Dùng OG.EV.X hoặc chuỗi trực tiếp đều được.
  OG.EV = {
    SCENE_CHANGE: 'scene:change',       // {from, to, params}
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
    LEADERBOARD_CLEAR: 'leaderboard:clear' // {}
  };

  OG.Events = {
    // Đăng ký listener. Trả về hàm huỷ đăng ký.
    on: function (name, fn) {
      (listeners[name] = listeners[name] || []).push(fn);
      return function () { OG.Events.off(name, fn); };
    },
    off: function (name, fn) {
      var arr = listeners[name];
      if (!arr) return;
      var i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
    },
    once: function (name, fn) {
      var off = OG.Events.on(name, function (p) { off(); fn(p); });
      return off;
    },
    // Phát event. Listener nhận đúng 1 tham số payload (object).
    emit: function (name, payload) {
      if (OG.Config && OG.Config.DEBUG) console.log('[OG.Events]', name, payload);
      var arr = listeners[name];
      if (arr) {
        arr = arr.slice();
        for (var i = 0; i < arr.length; i++) {
          OG.util.safe('listener ' + name, arr[i], null, [payload || {}]);
        }
      }
      // Listener wildcard '*' nhận (name, payload) — tiện cho debug/analytics.
      var all = listeners['*'];
      if (all) {
        all = all.slice();
        for (var j = 0; j < all.length; j++) OG.util.safe('listener *', all[j], null, [name, payload || {}]);
      }
    },
    clear: function (name) { if (name) delete listeners[name]; else listeners = {}; }
  };
})();
