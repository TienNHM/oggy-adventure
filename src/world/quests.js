// @ts-check
/* ============================================================================
 * OG.Quests — HỆ THỐNG NHIỆM VỤ (quest system): nhiệm vụ màn, nhiệm vụ hằng ngày, thành tựu
 * ----------------------------------------------------------------------------
 * Vai trò:      Đếm tiến độ nhiệm vụ bằng cách NGHE event của gameplay (giẫm gián, nhặt pizza, xong màn...),
 *               tự trao thưởng xu khi đạt mốc và báo cho HUD / bản đồ. Main gọi OG.Quests.init() một lần
 *               lúc khởi động; HUD (menus.js/hud.js) và bản đồ (world.js) chỉ ĐỌC qua getHudLines/getForLevel.
 * Khái niệm:    observer / event bus (nghe event thay vì để gameplay gọi trực tiếp) · data-driven
 *               (nhiệm vụ = bảng dữ liệu {type, target}) · seeded random (ngẫu nhiên có hạt giống, ổn định
 *               theo ngày) · hàng đợi thông báo (toast queue) · lọc event trùng · namespace dữ liệu save
 * Bài học:      docs/learn/06-event-bus-observer.md (chính) · docs/learn/11-luu-tru-migrate.md (ns, seed)
 *               · docs/learn/12-data-driven-man-cau-do-hanh-trinh.md (QuestDef trong LevelDef)
 * Phụ thuộc:    OG.Events (on/emit), OG.Save (ns, commit, addCoins — đọc lúc CHẠY), OG.Data.levels/getLevel,
 *               OG.Game.stage (tiến độ trực tiếp trong màn), OG.Progress (totalStars, isCompleted),
 *               OG.DOM.toast. File load SAU src/world/world.js; init() được main.js gọi sau World.init().
 * Event:        phát: 'quest:progress', 'quest:complete' · nghe: 'level:start', 'item:collect',
 *               'enemy:stomp', 'player:hurt', 'coins:change', 'boss:defeated', 'level:complete', 'save:reset'
 * API công khai: OG.Quests.init(), list(), getForLevel(levelId), getHudLines(levelId), claim(questId),
 *               getDaily(), getAchievements(), getLevelSummary(levelId), takeRecent(), dailyKey()
 * Đọc tiếp:     src/ui/hud.js (HUD hiển thị nhiệm vụ) → src/world/world.js (bảng nhiệm vụ + banner trên bản đồ)
 * Dữ liệu:      QuestDef (src/types.d.ts) · Quest, HudQuestLine, QuestStore (typedef bên dưới)
 *
 * Hợp đồng (docs/ARCHITECTURE.md mục 8.4):
 *   init()                       — gắn listener OG.Events, tạo nhiệm vụ ngày, kiểm tra thành tựu.
 *   list() -> [Quest]            — mọi nhiệm vụ (màn + ngày + thành tựu).
 *   getForLevel(levelId) -> [Quest]
 *   getHudLines(levelId) -> [{id, text, done, progress, target, failed?}]
 *   claim(questId) -> bool       — thưởng được trao TỰ ĐỘNG nên thường trả false.
 *   Mở rộng (ngoài hợp đồng): getDaily(), getAchievements(), getLevelSummary(levelId) -> {done, total},
 *   takeRecent() -> nhiệm vụ vừa xong (World hiện trên banner rồi xoá).
 *
 * Loại nhiệm vụ: collect_all | no_damage | stomp_n | time_under | coins_n | boss_no_damage | complete
 *   + mở rộng cho nhiệm vụ toàn cục: pizza_n | boss_n | stars_n | levels_n | complete_n.
 * Hai cách đánh giá:
 *   - Nhiệm vụ MÀN: chấm điểm một lần bằng LevelResult của 'level:complete'. Trong lúc chơi chỉ HIỂN THỊ
 *     tiến độ đọc thẳng từ OG.Game.stage. Màn nào chưa có time_under được thêm tự động "về đích dưới X giây".
 *   - Nhiệm vụ NGÀY / THÀNH TỰU: cộng dồn theo từng event, hoàn thành ngay khi đạt mốc.
 * ========================================================================== */

/**
 * Một nhiệm vụ đã "dựng" để hiển thị (gộp định nghĩa + tiến độ đã lưu + tiến độ trực tiếp).
 * @typedef {Object} Quest
 * @property {string} id
 * @property {string|null} levelId   null với nhiệm vụ toàn cục (ngày / thành tựu)
 * @property {string} type           loại nhiệm vụ, vd 'stomp_n'
 * @property {string} text
 * @property {number} target         mốc cần đạt (đã quy đổi, luôn ≥ 1)
 * @property {number} reward         số xu thưởng
 * @property {number} progress       tiến độ hiện tại (đã kẹp ≤ target)
 * @property {boolean} done
 * @property {boolean} claimed
 * @property {'level'|'daily'|'achievement'} category
 * @property {boolean} [failed]      nhiệm vụ màn không còn đạt được trong lượt này (bị thương, quá giờ)
 * @property {boolean} [auto]        nhiệm vụ "về đích dưới X giây" do hệ thống tự thêm
 * @property {number|null} [limit]   giới hạn giây của nhiệm vụ ngày loại time_under
 */

/**
 * Định nghĩa nhiệm vụ toàn cục (ngày / thành tựu). target = 'all' nghĩa là "bằng số màn hiện có".
 * @typedef {Object} GlobalQuestDef
 * @property {string} id
 * @property {string} type
 * @property {number|'all'} target
 * @property {string} text
 * @property {number} reward
 * @property {number} [limit]  chỉ với time_under: số giây tối đa
 */

/**
 * Một dòng nhiệm vụ cho HUD (OG.Menus.updateHud).
 * @typedef {Object} HudQuestLine
 * @property {string} id
 * @property {string} text
 * @property {boolean} done
 * @property {number} progress
 * @property {number} target
 * @property {boolean} failed
 */

/**
 * Bản ghi tiến độ của 1 nhiệm vụ trong save.
 * @typedef {Object} QuestRecord
 * @property {number} [progress]
 * @property {boolean} done
 * @property {boolean} claimed
 */

/**
 * Dữ liệu lưu trong OG.Save.ns('quests').
 * @typedef {Object} QuestStore
 * @property {Object<string, QuestRecord>} levels    nhiệm vụ màn: qid -> {done, claimed}
 * @property {Object<string, QuestRecord>} global    thành tựu: qid -> {progress, done, claimed}
 * @property {{date: string, ids: string[], prog: Object<string, QuestRecord>}} daily  bộ nhiệm vụ của ngày `date`
 * @property {boolean} [seeded]  đã lấy giá trị ban đầu từ Save.data.stats chưa
 */
(function () {
  'use strict';
  var OG = window.OG;

  // ---------------------------------------------------------------------------
  // Hằng số
  // ---------------------------------------------------------------------------
  var DAILY_COUNT = 3;          // số nhiệm vụ ngày được chọn mỗi ngày
  var AUTO_TIME_REWARD = 20;    // xu thưởng của nhiệm vụ "về đích dưới X giây" tự thêm
  var DEFAULT_LEVEL_WIDTH = 2000; // px — dùng khi LevelDef thiếu width
  var PAR_RUN_SPEED = 255;      // px/giây — tốc độ chạy giả định để ước lượng thời gian chuẩn
  var PAR_SLOW_FACTOR = 3;      // trẻ em chơi chậm, dừng nhặt đồ → nhân 3 lần thời gian chạy thẳng
  var PAR_EXTRA_SEC = 20;       // giây cộng thêm cho phần đánh nhau / do dự
  var PAR_ROUND_SEC = 5;        // làm tròn lên bội số 5 giây cho dễ đọc
  var TOAST_SEC = 2.2;          // giây hiện mỗi thông báo
  var TOAST_GAP_MS = 2300;      // ms chờ trước khi hiện thông báo kế (lớn hơn TOAST_SEC để không đè nhau)
  var RECENT_MAX = 20;          // giữ tối đa 20 nhiệm vụ vừa xong chờ World đọc

  // ---------------------------------------------------------------------------
  // Định nghĩa nhiệm vụ toàn cục (dữ liệu thuần — thêm nhiệm vụ = thêm 1 dòng)
  // ---------------------------------------------------------------------------
  // Thành tựu: vĩnh viễn, cộng dồn qua mọi lượt chơi.
  /** @type {GlobalQuestDef[]} */
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

  // Kho nhiệm vụ ngày: mỗi ngày chọn DAILY_COUNT cái (cố định trong ngày, xem ensureDaily).
  /** @type {GlobalQuestDef[]} */
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

  // ---------------------------------------------------------------------------
  // Trạng thái phiên (chỉ trong RAM, không lưu)
  // ---------------------------------------------------------------------------
  /** @type {{id: string, text: string, reward: number, category: string, levelId: string|null}[]} */
  var recent = [];          // nhiệm vụ vừa hoàn thành (World đọc qua takeRecent)
  /** @type {string[]} */
  var toastQueue = [];
  var toastBusy = false;
  /** @type {Object<string, number>} questId -> progress đã phát (tránh phát quest:progress trùng) */
  var lastProgress = {};
  var inited = false;

  // ---------------------------------------------------------------------------
  // Tiện ích
  // ---------------------------------------------------------------------------
  function hasSave() { return !!(OG.Save && OG.Save.data && OG.Save.data.ext); }

  /**
   * Lấy vùng save của module và "vá" field thiếu/hỏng.
   * ⚠️ Bẫy: save cũ hoặc bị sửa tay có thể thiếu field / sai kiểu. Luôn kiểm tra trước khi dùng,
   *   nếu không `s.daily.ids.length` sẽ ném lỗi và cả hệ nhiệm vụ ngừng chạy.
   * @returns {QuestStore}
   */
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

  /** @returns {LevelDef[]} */
  function levels() { return (OG.Data && Array.isArray(OG.Data.levels)) ? OG.Data.levels : []; }

  // Khoá ngày theo giờ MÁY người chơi, dạng 'YYYY-MM-DD' (qua nửa đêm là sang bộ nhiệm vụ mới).
  function todayKey() {
    var d = new Date();
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  // 💡 Khái niệm: seeded random — từ cùng một "hạt giống" luôn sinh ra cùng dãy số. Băm chuỗi ngày thành
  //   hạt giống → mọi lần mở game trong ngày đều chọn ra đúng 3 nhiệm vụ như nhau, không cần lưu thêm gì.
  // Băm chuỗi → số nguyên 32-bit không dấu (thuật toán FNV-1a; 2166136261 và 16777619 là hằng chuẩn của FNV).
  function hashStr(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  // Bộ sinh số ngẫu nhiên LCG (linear congruential generator) trả số trong [0, 1).
  // Math.imul nhân số nguyên 32-bit không bị mất chính xác như phép * của số thực.
  function seededRandom(seed) {
    var s = seed || 1;
    return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  }

  // Quy đổi target trong dữ liệu ra số: 'all' = số màn hiện có (thêm màn thì mốc tự tăng).
  function resolveTarget(t) {
    if (t === 'all') return Math.max(1, levels().length);
    return Math.max(1, +t || 1);
  }

  // Thời gian chuẩn (giây) của nhiệm vụ tự thêm: chạy hết chiều dài màn ×3 + 20 giây, làm tròn lên bội 5.
  // 🧪 Thử: đổi PAR_SLOW_FACTOR 3 → 1 rồi mở bảng nhiệm vụ của một màn: mốc "Về đích dưới X giây" giảm hẳn.
  function parTime(level) {
    var w = level.width || DEFAULT_LEVEL_WIDTH;
    return Math.ceil((w / PAR_RUN_SPEED * PAR_SLOW_FACTOR + PAR_EXTRA_SEC) / PAR_ROUND_SEC) * PAR_ROUND_SEC;
  }

  // ---------------------------------------------------------------------------
  // Nhiệm vụ màn
  // ---------------------------------------------------------------------------
  /**
   * Danh sách định nghĩa nhiệm vụ của một màn, kèm nhiệm vụ "về đích dưới X giây" tự thêm nếu màn chưa có.
   * @param {LevelDef} level
   * @returns {Array<QuestDef & {auto?: boolean}>}
   */
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
      out.push({ id: level.id + '_auto_time', type: 'time_under', target: par, text: 'Về đích dưới ' + par + ' giây', reward: AUTO_TIME_REWARD, auto: true });
    }
    return out;
  }

  // Mốc của nhiệm vụ màn: loại "có/không" (no_damage...) có mốc 1; collect_all = số pizza của màn.
  function levelTarget(def, level) {
    switch (def.type) {
      case 'collect_all': return (level.pizzas || []).length || 1;
      case 'no_damage': case 'boss_no_damage': case 'complete': return 1;
      default: return resolveTarget(def.target);
    }
  }

  /**
   * Tiến độ TRỰC TIẾP trong màn đang chơi, đọc thẳng từ OG.Game.stage (không cần event).
   * 💡 Khái niệm: tách "hiển thị" khỏi "chấm điểm" — HUD chỉ cần con số gần đúng mỗi lần vẽ lại,
   *   còn kết quả chính thức chỉ chấm một lần bằng LevelResult (evalLevelQuest) khi xong màn.
   * @returns {{progress: number, failed: boolean, live: boolean}} live=false nếu màn này không đang chơi
   */
  function liveLevelProgress(def, level) {
    var G = OG.Game, st = G && G.stage;
    if (!st || st.levelId !== level.id) return { progress: 0, failed: false, live: false };
    // Thời gian chơi thật, giây (không tính lúc tạm dừng); dự phòng bằng đồng hồ tổng nếu thiếu.
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

  // Chấm nhiệm vụ màn bằng LevelResult r khi xong màn. Trả true = đạt.
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

  /**
   * Gộp định nghĩa + bản ghi save + tiến độ trực tiếp thành một Quest để hiển thị.
   * @returns {Quest}
   */
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

  // ---------------------------------------------------------------------------
  // Nhiệm vụ toàn cục (ngày + thành tựu)
  // ---------------------------------------------------------------------------
  // Chọn (hoặc lấy lại) bộ nhiệm vụ của hôm nay. Sang ngày mới thì tiến độ ngày cũ bị bỏ.
  function ensureDaily() {
    var s = store();
    var key = todayKey();
    if (s.daily.date === key && s.daily.ids.length) return s.daily;
    var rnd = seededRandom(hashStr('oggy-' + key));
    var pool = DAILY_POOL.slice();
    var ids = [];
    // Rút không hoàn lại (splice) để 3 nhiệm vụ trong ngày không bao giờ trùng nhau.
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

  // Bản ghi tiến độ (tạo mới nếu chưa có). Nhiệm vụ ngày lưu riêng trong daily.prog để sang ngày là "xoá sạch".
  /** @returns {QuestRecord} */
  function globalRecord(def, category) {
    var s = store();
    var bucket = category === 'daily' ? ensureDaily().prog : s.global;
    var rec = bucket[def.id];
    if (!rec || typeof rec !== 'object') rec = bucket[def.id] = { progress: 0, done: false, claimed: false };
    return rec;
  }

  /** @returns {Quest} */
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

  /**
   * Mọi nhiệm vụ toàn cục đang hoạt động (thành tựu + 3 nhiệm vụ của hôm nay).
   * @returns {{def: GlobalQuestDef, category: 'daily'|'achievement'}[]}
   */
  function activeGlobals() {
    /** @type {{def: GlobalQuestDef, category: 'daily'|'achievement'}[]} */
    var out = ACHIEVEMENTS.map(function (d) { return { def: d, category: /** @type {'achievement'} */ ('achievement') }; });
    ensureDaily().ids.forEach(function (id) {
      var d = dailyDef(id);
      if (d) out.push({ def: d, category: 'daily' });
    });
    return out;
  }

  // ---------------------------------------------------------------------------
  // Hoàn thành & thông báo
  // ---------------------------------------------------------------------------
  // 💡 Khái niệm: hàng đợi (queue) thông báo — xong 3 nhiệm vụ cùng lúc thì hiện LẦN LƯỢT từng cái,
  //   thay vì 3 toast đè lên nhau chỉ đọc được cái cuối. toastBusy là "khoá" cho biết đang hiện một cái.
  function pumpToast() {
    if (toastBusy || !toastQueue.length) return;
    toastBusy = true;
    var text = toastQueue.shift();
    if (OG.DOM && OG.DOM.toast) OG.DOM.toast(text, TOAST_SEC);
    setTimeout(function () { toastBusy = false; pumpToast(); }, TOAST_GAP_MS);
  }
  function notify(text) {
    toastQueue.push(text);
    pumpToast();
  }

  /**
   * Đánh dấu xong + trao thưởng + thông báo. SỬA rec, cộng xu, phát 'quest:complete'.
   * ⚠️ Bẫy: phải đặt rec.done = true TRƯỚC khi cộng xu và phát event. addCoins phát 'coins:change' và
   *   emit chạy listener ĐỒNG BỘ; nếu một listener nào đó gọi lại bump()/sweepGlobals() khi rec chưa done,
   *   nhiệm vụ này sẽ bị trao thưởng lần hai.
   * @param {Quest} q
   * @param {QuestRecord} rec
   */
  function awardQuest(q, rec) {
    rec.done = true;
    rec.claimed = true; // trao thưởng tự động
    commit();
    if (q.reward > 0 && OG.Save.addCoins) OG.Save.addCoins(q.reward, 'quest');
    recent.push({ id: q.id, text: q.text, reward: q.reward, category: q.category, levelId: q.levelId || null });
    if (recent.length > RECENT_MAX) recent.shift();
    notify('✅ Nhiệm vụ hoàn thành: ' + q.text + (q.reward > 0 ? ' (+' + q.reward + ' xu)' : ''));
    OG.Events.emit('quest:complete', { questId: q.id, reward: q.reward, text: q.text, category: q.category, levelId: q.levelId || null });
  }

  // Chỉ phát 'quest:progress' khi con số THỰC SỰ đổi → listener (HUD, âm thanh) không bị gọi thừa mỗi event.
  function emitProgress(id, progress, target) {
    if (lastProgress[id] === progress) return;
    lastProgress[id] = progress;
    OG.Events.emit('quest:progress', { questId: id, progress: progress, target: target });
  }

  /**
   * Cộng tiến độ cho MỌI nhiệm vụ toàn cục thuộc loại `type`; trao thưởng cái nào vừa đạt mốc.
   * @param {string} type  loại nhiệm vụ, vd 'stomp_n'
   * @param {number} amount
   * @param {boolean} [absolute]  true = gán giá trị tuyệt đối (giữ max), vd tổng sao; false = cộng thêm
   * @param {function(GlobalQuestDef): boolean} [filter]  lọc thêm, vd time_under theo limit
   */
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

  // Migrate: lần đầu chạy bản có Quests, lấy giá trị ban đầu của thành tựu từ thống kê cũ (Save.data.stats)
  // để người chơi lâu năm không phải đếm lại từ 0. Cờ `seeded` đảm bảo chỉ làm MỘT lần.
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

  // Quét các nhiệm vụ đã đạt mốc nhưng chưa trao (vd sau khi seed, hoặc số màn thay đổi làm mốc 'all' đổi).
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

  // Phát quest:progress cho nhiệm vụ của màn đang chơi (gọi sau mỗi event làm stage thay đổi).
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

  // ---------------------------------------------------------------------------
  // Listener — nơi "quest system nghe event" thể hiện rõ nhất
  // ---------------------------------------------------------------------------
  // Chấm nhiệm vụ màn bằng LevelResult, rồi cộng các nhiệm vụ toàn cục liên quan.
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

  // 💡 Khái niệm: observer — Quests không hề được Player/Level gọi trực tiếp. Gameplay chỉ phát event
  //   ("vừa giẫm gián"), Quests tự đăng ký nghe. Muốn thêm loại nhiệm vụ mới: thêm 1 listener ở đây,
  //   KHÔNG phải sửa code gameplay.
  // 🧪 Thử: gõ trong console trình duyệt  OG.Events.emit('enemy:stomp', {})  vài lần rồi mở bảng 📜 Nhiệm vụ
  //   trên bản đồ cổ điển: thanh tiến độ "đạp gián" tăng dù bạn không chơi màn nào.
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
      // ⚠️ Bẫy: thưởng nhiệm vụ cũng phát coins:change. Không lọc reason 'quest' thì xong nhiệm vụ →
      //   được xu → cộng vào nhiệm vụ "kiếm xu" → có thể xong tiếp → vòng lặp thưởng chồng thưởng.
      if (p.reason === 'quest') return;
      bump('coins_n', p.delta);
    });
    E.on('boss:defeated', function () { bump('boss_n', 1); emitLevelProgress(); });
    E.on('level:complete', onLevelComplete);
    E.on('save:reset', function () { recent = []; lastProgress = {}; toastQueue = []; });
  }

  // ---------------------------------------------------------------------------
  // API công khai
  // ---------------------------------------------------------------------------
  var Quests = (OG.Quests = {
    /**
     * Gắn listener, chọn nhiệm vụ ngày, seed thành tựu từ thống kê cũ. Gọi một lần lúc khởi động
     * (gọi lại không gắn listener trùng nhờ cờ `inited`). Có thể phát 'quest:complete' nếu có mốc đã đạt sẵn.
     */
    init: function () {
      if (inited) return;
      inited = true;
      attach();
      if (!hasSave()) return;
      ensureDaily();
      seedFromStats();
      sweepGlobals();
    },

    /**
     * Liệt kê mọi nhiệm vụ: của từng màn, của hôm nay, và thành tựu.
     * @returns {Quest[]}
     */
    list: function () {
      if (!hasSave()) return [];
      /** @type {Quest[]} */
      var out = [];
      levels().forEach(function (l) { out = out.concat(Quests.getForLevel(l.id)); });
      return out.concat(Quests.getDaily(), Quests.getAchievements());
    },

    /**
     * Lấy nhiệm vụ của một màn (kèm nhiệm vụ thời gian tự thêm), có tiến độ trực tiếp nếu màn đang chơi.
     * @param {string} levelId
     * @returns {Quest[]} [] nếu không tìm thấy màn hoặc chưa có save
     */
    getForLevel: function (levelId) {
      if (!hasSave() || !OG.Data || !OG.Data.getLevel) return [];
      var level = OG.Data.getLevel(levelId);
      if (!level) return [];
      return levelQuestDefs(level).map(function (def) { return buildLevelQuest(def, level); });
    },

    /**
     * Lấy các dòng nhiệm vụ gọn cho HUD. `done` ở đây "lạc quan": loại đếm được (pizza, gián, xu) hiện ✅
     * ngay khi đủ số trong màn, dù phần thưởng chỉ trao khi về đích.
     * @param {string|null} levelId
     * @returns {HudQuestLine[]}
     * @example
     *   OG.Quests.getHudLines('kitchen').forEach(function (q) { console.log(q.done ? '✅' : '◻️', q.text); });
     */
    getHudLines: function (levelId) {
      if (levelId == null) return [];
      return Quests.getForLevel(levelId).map(function (q) {
        return { id: q.id, text: q.text, done: q.done || (!q.failed && q.progress >= q.target && countable(q.type)), progress: q.progress, target: q.target, failed: q.failed };
      });
    },

    /**
     * Nhận thưởng thủ công (hiếm: thưởng thường được trao tự động). Cộng xu nếu nhiệm vụ đã xong mà chưa nhận.
     * @param {string} questId
     * @returns {boolean} true nếu vừa trao thưởng
     */
    claim: function (questId) {
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
    /**
     * Lấy 3 nhiệm vụ của hôm nay (chọn mới nếu vừa sang ngày).
     * @returns {Quest[]}
     */
    getDaily: function () {
      if (!hasSave()) return [];
      return ensureDaily().ids.map(dailyDef).filter(Boolean).map(function (d) { return buildGlobalQuest(d, 'daily'); });
    },
    /**
     * Lấy mọi thành tựu cùng tiến độ cộng dồn.
     * @returns {Quest[]}
     */
    getAchievements: function () {
      if (!hasSave()) return [];
      return ACHIEVEMENTS.map(function (d) { return buildGlobalQuest(d, 'achievement'); });
    },
    /**
     * Đếm số nhiệm vụ màn đã xong / tổng.
     * @param {string} levelId
     * @returns {{done: number, total: number}}
     */
    getLevelSummary: function (levelId) {
      var qs = Quests.getForLevel(levelId);
      var done = 0;
      qs.forEach(function (q) { if (q.done) done++; });
      return { done: done, total: qs.length };
    },
    /**
     * Lấy rồi XOÁ danh sách nhiệm vụ vừa hoàn thành (World hiện trên banner kết quả).
     * @returns {{id: string, text: string, reward: number, category: string, levelId: string|null}[]}
     */
    takeRecent: function () { var r = recent; recent = []; return r; },
    /** Trả khoá ngày hiện tại 'YYYY-MM-DD' (giờ máy). */
    dailyKey: todayKey
  });

  // Loại nhiệm vụ "đếm được" — đủ số là coi như xong trên HUD (khác no_damage/time_under chỉ biết khi về đích).
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
