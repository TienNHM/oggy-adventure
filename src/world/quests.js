/* OG.Quests — hệ thống nhiệm vụ: nhiệm vụ màn, nhiệm vụ hằng ngày và thành tựu.
 * Chủ sở hữu: agent World & Quests (src/world/). Load SAU src/world/world.js.
 *
 * HỢP ĐỒNG (docs/ARCHITECTURE.md mục 8.4):
 *   init()                       — gắn listener OG.Events, tạo nhiệm vụ ngày, kiểm tra thành tựu.
 *   list() -> [Quest]            — mọi nhiệm vụ (màn + ngày + thành tựu).
 *   getForLevel(levelId) -> [Quest]
 *   getHudLines(levelId) -> [{id, text, done, progress, target, failed?}]
 *   claim(questId) -> bool       — thưởng được trao TỰ ĐỘNG nên thường trả false.
 *   Quest = {id, levelId|null, type, text, target, reward, progress, done, claimed, category}
 *     category: 'level' | 'daily' | 'achievement' (field mở rộng).
 *
 * Mở rộng (ngoài hợp đồng):
 *   getDaily(), getAchievements(), getLevelSummary(levelId) -> {done, total},
 *   takeRecent() -> [{id, text, reward, category, levelId}] (nhiệm vụ vừa xong, World hiển thị rồi xoá).
 *
 * Loại nhiệm vụ: collect_all | no_damage | stomp_n | time_under | coins_n | boss_no_damage | complete
 *   + mở rộng cho nhiệm vụ toàn cục: pizza_n | boss_n | stars_n | levels_n | complete_n.
 * Nhiệm vụ màn: đánh giá bằng LevelResult của 'level:complete' (trong màn chỉ hiện tiến độ trực tiếp
 *   lấy từ OG.Game.stage). Mỗi màn được bổ sung tự động nhiệm vụ "về đích dưới X giây" nếu chưa có.
 * Nhiệm vụ ngày/thành tựu: cộng dồn theo event, hoàn thành ngay khi đạt.
 * Lưu trong OG.Save.ns('quests'): {levels:{qid:{done,claimed}}, global:{qid:{progress,done,claimed}},
 *   daily:{date, ids:[], prog:{qid:{progress,done,claimed}}}, seeded:bool}. */
(function () {
  'use strict';
  var OG = window.OG;

  // ---------- Định nghĩa nhiệm vụ toàn cục ----------
  // Thành tựu: vĩnh viễn, cộng dồn.
  var ACHIEVEMENTS = [
    { id: 'ach_stomp_50', type: 'stomp_n', target: 50, text: 'Đạp bẹp 50 con gián', reward: 100 },
    { id: 'ach_stomp_200', type: 'stomp_n', target: 200, text: 'Đạp bẹp 200 con gián', reward: 300 },
    { id: 'ach_pizza_100', type: 'pizza_n', target: 100, text: 'Ăn 100 miếng pizza', reward: 120 },
    { id: 'ach_coins_1000', type: 'coins_n', target: 1000, text: 'Thu thập 1000 xu', reward: 250 },
    { id: 'ach_boss_4', type: 'boss_n', target: 4, text: 'Hạ gục 4 trùm gián', reward: 200 },
    { id: 'ach_nodmg_5', type: 'no_damage', target: 5, text: 'Qua 5 màn không bị thương', reward: 150 },
    { id: 'ach_allpizza_5', type: 'collect_all', target: 5, text: 'Ăn sạch pizza ở 5 màn', reward: 120 },
    { id: 'ach_stars_15', type: 'stars_n', target: 15, text: 'Đạt tổng cộng 15 sao', reward: 200 },
    { id: 'ach_explorer', type: 'levels_n', target: 'all', text: 'Khám phá mọi ngóc ngách trong nhà', reward: 300 }
  ];

  // Kho nhiệm vụ ngày: mỗi ngày chọn 3 (theo ngày, cố định trong ngày).
  var DAILY_POOL = [
    { id: 'daily_stomp_10', type: 'stomp_n', target: 10, text: 'Hôm nay: đạp 10 con gián', reward: 30 },
    { id: 'daily_pizza_20', type: 'pizza_n', target: 20, text: 'Hôm nay: ăn 20 miếng pizza', reward: 30 },
    { id: 'daily_coins_60', type: 'coins_n', target: 60, text: 'Hôm nay: kiếm 60 xu', reward: 35 },
    { id: 'daily_clear_3', type: 'complete_n', target: 3, text: 'Hôm nay: hoàn thành 3 màn', reward: 40 },
    { id: 'daily_nodmg_1', type: 'no_damage', target: 1, text: 'Hôm nay: qua 1 màn không bị thương', reward: 40 },
    { id: 'daily_boss_1', type: 'boss_n', target: 1, text: 'Hôm nay: hạ gục 1 trùm', reward: 50 },
    { id: 'daily_fast_1', type: 'time_under', target: 1, limit: 45, text: 'Hôm nay: về đích một màn dưới 45 giây', reward: 40 },
    { id: 'daily_allpizza_2', type: 'collect_all', target: 2, text: 'Hôm nay: ăn sạch pizza ở 2 màn', reward: 40 }
  ];
  var DAILY_COUNT = 3;

  // ---------- Trạng thái phiên (không lưu) ----------
  var recent = [];          // nhiệm vụ vừa hoàn thành (World đọc qua takeRecent)
  var toastQueue = [];
  var toastBusy = false;
  var lastProgress = {};    // questId -> progress đã phát (tránh phát quest:progress trùng)
  var inited = false;

  // ---------- Tiện ích ----------
  function hasSave() { return !!(OG.Save && OG.Save.data && OG.Save.data.ext); }

  function store() {
    var s = OG.Save.ns('quests');
    if (!s.levels || typeof s.levels !== 'object') s.levels = {};
    if (!s.global || typeof s.global !== 'object') s.global = {};
    if (!s.daily || typeof s.daily !== 'object') s.daily = { date: '', ids: [], prog: {} };
    if (!Array.isArray(s.daily.ids)) s.daily.ids = [];
    if (!s.daily.prog || typeof s.daily.prog !== 'object') s.daily.prog = {};
    return s;
  }

  function commit() { if (OG.Save && OG.Save.commit) OG.Save.commit(); }

  function levels() { return (OG.Data && Array.isArray(OG.Data.levels)) ? OG.Data.levels : []; }

  function todayKey() {
    var d = new Date();
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  // Hash chuỗi → số (để chọn nhiệm vụ ngày ổn định theo ngày).
  function hashStr(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function seededRandom(seed) {
    var s = seed || 1;
    return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  }

  function resolveTarget(t) {
    if (t === 'all') return Math.max(1, levels().length);
    return Math.max(1, +t || 1);
  }

  // Thời gian chuẩn của màn (giây) cho nhiệm vụ tự thêm: chạy hết chiều dài ×3 + 20s, làm tròn 5.
  function parTime(level) {
    var w = level.width || 2000;
    return Math.ceil((w / 255 * 3 + 20) / 5) * 5;
  }

  // ---------- Nhiệm vụ màn ----------
  // Danh sách định nghĩa nhiệm vụ của một màn (kèm nhiệm vụ tự thêm).
  function levelQuestDefs(level) {
    var src = Array.isArray(level.quests) ? level.quests : [];
    var out = [];
    var types = {};
    src.forEach(function (q) {
      if (!q || !q.id) return;
      types[q.type] = true;
      out.push(q);
    });
    if (!types.time_under) {
      var par = parTime(level);
      out.push({ id: level.id + '_auto_time', type: 'time_under', target: par, text: 'Về đích dưới ' + par + ' giây', reward: 20, auto: true });
    }
    return out;
  }

  function levelTarget(def, level) {
    switch (def.type) {
      case 'collect_all': return (level.pizzas || []).length || 1;
      case 'no_damage': case 'boss_no_damage': case 'complete': return 1;
      default: return resolveTarget(def.target);
    }
  }

  // Tiến độ trực tiếp trong màn (đọc từ OG.Game.stage). Trả {progress, failed, live}.
  function liveLevelProgress(def, level) {
    var G = OG.Game, st = G && G.stage;
    if (!st || st.levelId !== level.id) return { progress: 0, failed: false, live: false };
    // Thời gian chơi thật (không tính lúc tạm dừng); dự phòng bằng đồng hồ tổng nếu thiếu.
    var elapsed = typeof st.playTime === 'number' ? st.playTime : Math.max(0, (OG.time || 0) - (st.startTime || 0));
    switch (def.type) {
      case 'collect_all': return { progress: st.pizzas | 0, failed: false, live: true };
      case 'stomp_n': return { progress: st.stomps | 0, failed: false, live: true };
      case 'coins_n': return { progress: st.coins | 0, failed: false, live: true };
      case 'pizza_n': return { progress: st.pizzas | 0, failed: false, live: true };
      case 'no_damage': return { progress: 0, failed: (st.hurts | 0) > 0, live: true };
      case 'boss_no_damage': return { progress: st.bossDefeated ? 1 : 0, failed: (st.bossHurts | 0) > 0, live: true };
      case 'time_under': return { progress: Math.floor(elapsed), failed: elapsed > resolveTarget(def.target), live: true };
      default: return { progress: 0, failed: false, live: true };
    }
  }

  // Đánh giá nhiệm vụ màn khi xong màn.
  function evalLevelQuest(def, r) {
    var target = resolveTarget(def.target);
    switch (def.type) {
      case 'collect_all': return (r.pizzas | 0) >= (r.pizzaTotal | 0);
      case 'no_damage': return !!r.noDamage || (r.hurts | 0) === 0;
      case 'stomp_n': return (r.stomps | 0) >= target;
      case 'time_under': return (+r.time || 0) <= target;
      case 'coins_n': return (r.coins | 0) >= target;
      case 'pizza_n': return (r.pizzas | 0) >= target;
      case 'boss_no_damage': return !!(r.bossDefeated && r.bossNoDamage);
      case 'complete': return true;
      default: return false;
    }
  }

  function buildLevelQuest(def, level) {
    var rec = hasSave() ? store().levels[def.id] : null;
    var target = levelTarget(def, level);
    var done = !!(rec && rec.done);
    var progress = done ? target : 0;
    var failed = false;
    if (!done) {
      var live = liveLevelProgress(def, level);
      progress = Math.min(target, live.progress);
      failed = live.failed;
    }
    return {
      id: def.id, levelId: level.id, type: def.type, text: def.text || def.id,
      target: target, reward: def.reward | 0, progress: progress,
      done: done, claimed: !!(rec && rec.claimed), failed: failed,
      category: 'level', auto: !!def.auto
    };
  }

  // ---------- Nhiệm vụ toàn cục (ngày + thành tựu) ----------
  function ensureDaily() {
    var s = store();
    var key = todayKey();
    if (s.daily.date === key && s.daily.ids.length) return s.daily;
    var rnd = seededRandom(hashStr('oggy-' + key));
    var pool = DAILY_POOL.slice();
    var ids = [];
    while (ids.length < DAILY_COUNT && pool.length) {
      var i = Math.floor(rnd() * pool.length);
      ids.push(pool.splice(i, 1)[0].id);
    }
    s.daily = { date: key, ids: ids, prog: {} };
    commit();
    return s.daily;
  }

  function dailyDef(id) {
    for (var i = 0; i < DAILY_POOL.length; i++) if (DAILY_POOL[i].id === id) return DAILY_POOL[i];
    return null;
  }

  function globalRecord(def, category) {
    var s = store();
    var bucket = category === 'daily' ? ensureDaily().prog : s.global;
    var rec = bucket[def.id];
    if (!rec || typeof rec !== 'object') rec = bucket[def.id] = { progress: 0, done: false, claimed: false };
    return rec;
  }

  function buildGlobalQuest(def, category) {
    var rec = globalRecord(def, category);
    var target = resolveTarget(def.target);
    return {
      id: def.id, levelId: null, type: def.type, text: def.text,
      target: target, reward: def.reward | 0,
      progress: Math.min(target, rec.progress | 0), done: !!rec.done, claimed: !!rec.claimed,
      category: category, limit: def.limit || null
    };
  }

  // Mọi nhiệm vụ toàn cục đang hoạt động: [{def, category}]
  function activeGlobals() {
    var out = ACHIEVEMENTS.map(function (d) { return { def: d, category: 'achievement' }; });
    ensureDaily().ids.forEach(function (id) {
      var d = dailyDef(id);
      if (d) out.push({ def: d, category: 'daily' });
    });
    return out;
  }

  // ---------- Hoàn thành & thông báo ----------
  function pumpToast() {
    if (toastBusy || !toastQueue.length) return;
    toastBusy = true;
    var text = toastQueue.shift();
    if (OG.DOM && OG.DOM.toast) OG.DOM.toast(text, 2.2);
    setTimeout(function () { toastBusy = false; pumpToast(); }, 2300);
  }
  function notify(text) {
    toastQueue.push(text);
    pumpToast();
  }

  function awardQuest(q, rec) {
    rec.done = true;
    rec.claimed = true; // trao thưởng tự động
    commit();
    if (q.reward > 0 && OG.Save.addCoins) OG.Save.addCoins(q.reward, 'quest');
    recent.push({ id: q.id, text: q.text, reward: q.reward, category: q.category, levelId: q.levelId || null });
    if (recent.length > 20) recent.shift();
    notify('✅ Nhiệm vụ hoàn thành: ' + q.text + (q.reward > 0 ? ' (+' + q.reward + ' xu)' : ''));
    OG.Events.emit('quest:complete', { questId: q.id, reward: q.reward, text: q.text, category: q.category, levelId: q.levelId || null });
  }

  function emitProgress(id, progress, target) {
    if (lastProgress[id] === progress) return;
    lastProgress[id] = progress;
    OG.Events.emit('quest:progress', { questId: id, progress: progress, target: target });
  }

  // Cộng tiến độ cho mọi nhiệm vụ toàn cục loại `type`. absolute: gán thay vì cộng.
  // filter(def) → bool để lọc thêm (vd: time_under theo limit).
  function bump(type, amount, absolute, filter) {
    if (!hasSave()) return;
    var changed = false;
    activeGlobals().forEach(function (g) {
      var def = g.def;
      if (def.type !== type) return;
      if (filter && !filter(def)) return;
      var rec = globalRecord(def, g.category);
      if (rec.done) return;
      var target = resolveTarget(def.target);
      var before = rec.progress | 0;
      rec.progress = absolute ? Math.max(before, amount | 0) : before + (amount | 0);
      if (rec.progress !== before) changed = true;
      emitProgress(def.id, Math.min(target, rec.progress), target);
      if (rec.progress >= target) awardQuest(buildGlobalQuest(def, g.category), rec);
    });
    if (changed) commit();
  }

  // Seed thành tựu từ thống kê cũ (lần đầu chạy bản có Quests).
  function seedFromStats() {
    var s = store();
    if (s.seeded) return;
    s.seeded = true;
    var st = (OG.Save.data && OG.Save.data.stats) || {};
    ACHIEVEMENTS.forEach(function (def) {
      var rec = globalRecord(def, 'achievement');
      if (def.type === 'stomp_n') rec.progress = Math.max(rec.progress | 0, st.stomps | 0);
      if (def.type === 'pizza_n') rec.progress = Math.max(rec.progress | 0, st.pizzas | 0);
      if (def.type === 'boss_n') rec.progress = Math.max(rec.progress | 0, st.bossesDefeated | 0);
    });
    commit();
  }

  // Kiểm tra những nhiệm vụ đạt mốc nhưng chưa trao (vd sau khi seed, hoặc số màn thay đổi).
  function sweepGlobals() {
    if (OG.Progress && OG.Progress.totalStars) bump('stars_n', OG.Progress.totalStars() | 0, true);
    bump('levels_n', countCompleted(), true);
    activeGlobals().forEach(function (g) {
      var rec = globalRecord(g.def, g.category);
      if (!rec.done && (rec.progress | 0) >= resolveTarget(g.def.target)) awardQuest(buildGlobalQuest(g.def, g.category), rec);
    });
  }

  function countCompleted() {
    if (!OG.Progress || !OG.Progress.isCompleted) return 0;
    var n = 0;
    levels().forEach(function (l) { if (OG.Progress.isCompleted(l.id)) n++; });
    return n;
  }

  // Phát quest:progress cho nhiệm vụ màn đang chơi (sau khi stage thay đổi).
  function emitLevelProgress() {
    var st = OG.Game && OG.Game.stage;
    if (!st) return;
    var level = OG.Data.getLevel(st.levelId);
    if (!level) return;
    levelQuestDefs(level).forEach(function (def) {
      var q = buildLevelQuest(def, level);
      if (!q.done) emitProgress(q.id, q.progress, q.target);
    });
  }

  // ---------- Listener ----------
  function onLevelComplete(r) {
    if (!r || !hasSave()) return;
    var level = OG.Data.getLevel(r.levelId);
    if (level) {
      var s = store();
      levelQuestDefs(level).forEach(function (def) {
        var rec = s.levels[def.id];
        if (rec && rec.done) return;
        if (!evalLevelQuest(def, r)) return;
        rec = s.levels[def.id] = { done: false, claimed: false };
        awardQuest(buildLevelQuest(def, level), rec);
      });
    }
    // Toàn cục
    bump('complete_n', 1);
    if (r.noDamage || (r.hurts | 0) === 0) bump('no_damage', 1);
    if ((r.pizzas | 0) >= (r.pizzaTotal | 0)) bump('collect_all', 1);
    if (r.bossDefeated && r.bossNoDamage) bump('boss_no_damage', 1);
    var t = +r.time || 0;
    bump('time_under', 1, false, function (def) { return def.limit ? t <= def.limit : false; });
    sweepGlobals();
  }

  function attach() {
    var E = OG.Events;
    E.on('level:start', function () { lastProgress = {}; });
    E.on('item:collect', function (p) {
      if (!p) return;
      if (p.type === 'pizza') bump('pizza_n', 1);
      emitLevelProgress();
    });
    E.on('enemy:stomp', function () { bump('stomp_n', 1); emitLevelProgress(); });
    E.on('player:hurt', function () { emitLevelProgress(); });
    E.on('coins:change', function (p) {
      if (!p || !(p.delta > 0)) return;
      if (p.reason === 'quest') return; // không tự cộng thưởng nhiệm vụ vào nhiệm vụ xu
      bump('coins_n', p.delta);
    });
    E.on('boss:defeated', function () { bump('boss_n', 1); emitLevelProgress(); });
    E.on('level:complete', onLevelComplete);
    E.on('save:reset', function () { recent = []; lastProgress = {}; toastQueue = []; });
  }

  // ---------- API công khai ----------
  var Quests = (OG.Quests = {
    init: function () {
      if (inited) return;
      inited = true;
      attach();
      if (!hasSave()) return;
      ensureDaily();
      seedFromStats();
      sweepGlobals();
    },

    list: function () {
      if (!hasSave()) return [];
      var out = [];
      levels().forEach(function (l) { out = out.concat(Quests.getForLevel(l.id)); });
      return out.concat(Quests.getDaily(), Quests.getAchievements());
    },

    getForLevel: function (levelId) {
      if (!hasSave() || !OG.Data || !OG.Data.getLevel) return [];
      var level = OG.Data.getLevel(levelId);
      if (!level) return [];
      return levelQuestDefs(level).map(function (def) { return buildLevelQuest(def, level); });
    },

    getHudLines: function (levelId) {
      if (levelId == null) return [];
      return Quests.getForLevel(levelId).map(function (q) {
        return { id: q.id, text: q.text, done: q.done || (!q.failed && q.progress >= q.target && countable(q.type)), progress: q.progress, target: q.target, failed: q.failed };
      });
    },

    claim: function (questId) {
      // Thưởng được trao tự động khi hoàn thành → chỉ xử lý trường hợp hiếm done mà chưa nhận.
      if (!hasSave()) return false;
      var s = store();
      var gl = activeGlobals();
      for (var i = 0; i < gl.length; i++) {
        if (gl[i].def.id !== questId) continue;
        var rec = globalRecord(gl[i].def, gl[i].category);
        if (rec.done && !rec.claimed) {
          rec.claimed = true; commit();
          OG.Save.addCoins(gl[i].def.reward | 0, 'quest');
          return true;
        }
        return false;
      }
      var lr = s.levels[questId];
      if (lr && lr.done && !lr.claimed) {
        var q = findLevelQuest(questId);
        lr.claimed = true; commit();
        if (q) OG.Save.addCoins(q.reward | 0, 'quest');
        return true;
      }
      return false;
    },

    // --- mở rộng ---
    getDaily: function () {
      if (!hasSave()) return [];
      return ensureDaily().ids.map(dailyDef).filter(Boolean).map(function (d) { return buildGlobalQuest(d, 'daily'); });
    },
    getAchievements: function () {
      if (!hasSave()) return [];
      return ACHIEVEMENTS.map(function (d) { return buildGlobalQuest(d, 'achievement'); });
    },
    // Số nhiệm vụ màn đã xong / tổng.
    getLevelSummary: function (levelId) {
      var qs = Quests.getForLevel(levelId);
      var done = 0;
      qs.forEach(function (q) { if (q.done) done++; });
      return { done: done, total: qs.length };
    },
    // Lấy và xoá danh sách nhiệm vụ vừa hoàn thành.
    takeRecent: function () { var r = recent; recent = []; return r; },
    dailyKey: todayKey
  });

  function countable(type) {
    return type === 'collect_all' || type === 'stomp_n' || type === 'coins_n' || type === 'pizza_n';
  }

  function findLevelQuest(id) {
    var ls = levels();
    for (var i = 0; i < ls.length; i++) {
      var defs = levelQuestDefs(ls[i]);
      for (var j = 0; j < defs.length; j++) if (defs[j].id === id) return defs[j];
    }
    return null;
  }
})();
