// @ts-check
/* ============================================================================
 * OG.Save — LƯU TRỮ BỀN VỮNG (localStorage + gộp mặc định + migrate)
 * ----------------------------------------------------------------------------
 * Vai trò:      Giữ toàn bộ dữ liệu người chơi (xu, tiến độ màn, cài đặt, thống kê...) trong OG.Save.data
 *               và ghi xuống localStorage. main.js gọi load() lúc boot; module nào sửa dữ liệu thì gọi commit().
 *               Nếu localStorage bị chặn (private mode, file:// trên một số trình duyệt) game vẫn chạy,
 *               dữ liệu chỉ sống trong bộ nhớ.
 * Khái niệm:    localStorage + try/catch · giá trị mặc định + gộp sâu (deep merge) để nâng cấp save cũ ·
 *               migrate dữ liệu bản cũ (kỷ lục MVP) · namespace dữ liệu cho module (ext) · bảo vệ dữ liệu hỏng ·
 *               đường dẫn chấm 'a.b.c' (get/set)
 * Bài học:      docs/learn/11-luu-tru-migrate.md
 * Phụ thuộc:    OG.Events.emit (đọc LÚC CHẠY)
 * Event:        phát: 'coins:change' {coins, delta, reason}, 'settings:change' {key, value}, 'save:reset' {} · nghe: (không)
 * API công khai: OG.Save.data, available, load(), commit(), get(path, fallback), set(path, value), ns(name),
 *               getCoins(), addCoins(n, reason), spendCoins(n, reason), submitBest(score),
 *               getItemCount(id), addItem(id, n), setSetting(key, value), reset()
 * Đọc tiếp:     src/game/progress.js (đọc/ghi progress.*) → src/world/quests.js (ví dụ dùng ns('quests'))
 * Dữ liệu:      SaveData bên dưới; bảng đầy đủ ở docs/ARCHITECTURE.md mục 7 (OG.Save) và docs/STORY.md mục 8.
 *               ⚠️ Định dạng này là hợp đồng: đổi tên field / khoá localStorage = người chơi cũ mất dữ liệu.
 * ========================================================================== */

/**
 * @typedef {Object} SaveSettings
 * @property {number} masterVolume  0..1
 * @property {number} musicVolume   0..1
 * @property {number} sfxVolume     0..1
 * @property {boolean} muted
 * @property {'auto'|'on'|'off'} touchControls
 * @property {'auto'|'on'|'off'} tapJump      v2: chạm nửa phải màn hình để nhảy
 * @property {'kid'|'challenge'} difficulty   v2: chế độ chơi (OG.Difficulty)
 */

/**
 * @typedef {Object} LevelRecord  kỷ lục một màn trong progress.levels
 * @property {boolean} completed
 * @property {number} bestScore
 * @property {number} stars       1..3
 * @property {number} bestTime    giây
 * @property {number} plays
 */

/**
 * @typedef {Object} SaveData  toàn bộ dữ liệu lưu (OG.Save.data)
 * @property {number} v                    phiên bản định dạng save
 * @property {number} coins                xu trong ví
 * @property {number} bestScore
 * @property {string} playerName
 * @property {string} selectedChar
 * @property {string[]} unlockedChars
 * @property {string[]} ownedSkins
 * @property {Object<string, string>} equippedSkins   charId → skinId
 * @property {Object<string, number>} inventory       itemId → số lượng
 * @property {{unlocked: string[], levels: Object<string, LevelRecord>}} progress
 * @property {SaveSettings} settings
 * @property {{plays: number, deaths: number, stomps: number, pizzas: number, coins: number, bossesDefeated: number, victories: number}} stats
 * @property {Object<string, any>} ext     vùng riêng cho module tính năng: ext.quests, ext.social, ext.learn...
 */
(function () {
  'use strict';
  var OG = window.OG;
  var KEY = 'oggyAdventure.save.v1';
  var LEGACY_BEST_KEY = 'oggyBest'; // key của bản MVP (chỉ lưu một con số kỷ lục)
  var PROBE_KEY = 'oggyAdventure.probe'; // key tạm để thử localStorage có ghi được không

  /**
   * Tạo dữ liệu save mặc định MỚI (object mới mỗi lần gọi).
   * ⚠️ Bẫy: dùng hàm thay vì một hằng object — nếu dùng chung một object, reset() rồi sửa data sẽ sửa luôn
   *   "bản mặc định", lần reset sau không còn sạch nữa.
   * @returns {SaveData}
   */
  function defaults() {
    return {
      v: 1,
      coins: 0,
      bestScore: 0,
      playerName: '',
      selectedChar: 'oggy',
      unlockedChars: ['oggy'],
      ownedSkins: ['oggy_default', 'jack_default', 'olivia_default'],
      equippedSkins: {},            // charId -> skinId
      inventory: {},                // itemId -> số lượng (vật phẩm cửa hàng)
      progress: {
        unlocked: [],               // levelId đã mở (Progress tự thêm màn đầu tiên)
        levels: {}                  // levelId -> {completed, bestScore, stars, bestTime, plays}
      },
      settings: { masterVolume: 1, musicVolume: 0.6, sfxVolume: 0.8, muted: false, touchControls: 'auto', tapJump: 'auto', difficulty: 'kid' },
      stats: { plays: 0, deaths: 0, stomps: 0, pizzas: 0, coins: 0, bossesDefeated: 0, victories: 0 },
      ext: {}                       // vùng riêng cho module tính năng: ext.quests, ext.social, ...
    };
  }

  /**
   * Gộp sâu saved vào base: giữ dữ liệu đã lưu, bổ sung field mới từ defaults. SỬA trực tiếp base.
   * 💡 Khái niệm: nâng cấp save bằng deep merge — bản v2 thêm settings.tapJump; người chơi có save cũ
   *   (thiếu field này) sau khi gộp vẫn nhận giá trị mặc định 'auto' mà không cần viết code migrate riêng.
   * ⚠️ Bẫy: MẢNG được thay nguyên (không gộp từng phần tử) — gộp mảng unlockedChars theo chỉ số sẽ trộn
   *   danh sách mặc định với danh sách đã lưu thành dữ liệu sai.
   * @param {any} base object mặc định (bị SỬA)
   * @param {any} saved dữ liệu đọc từ localStorage
   * @returns {any} chính base
   */
  function merge(base, saved) {
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return base;
    for (var k in saved) {
      if (!Object.prototype.hasOwnProperty.call(saved, k)) continue;
      var b = base[k], s = saved[k];
      if (b && typeof b === 'object' && !Array.isArray(b) && s && typeof s === 'object' && !Array.isArray(s)) {
        base[k] = merge(b, s);
      } else {
        base[k] = s;
      }
    }
    return base;
  }

  // ---------------------------------------------------------------------------
  // Bọc localStorage: mọi truy cập đều có thể ném lỗi (bị chặn, đầy bộ nhớ, private mode)
  // ---------------------------------------------------------------------------
  /** @param {string} key @returns {string | null} */
  function storageGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  /** @param {string} key @param {string} val @returns {boolean} ghi được hay không */
  function storageSet(key, val) {
    try { window.localStorage.setItem(key, val); return true; } catch (e) { return false; }
  }
  /** @param {string} key */
  function storageRemove(key) {
    try { window.localStorage.removeItem(key); } catch (e) { /* bỏ qua */ }
  }

  var Save = (OG.Save = {
    /** @type {SaveData} dữ liệu đang dùng. Sửa trực tiếp được, nhớ gọi commit() sau đó. */
    data: defaults(),
    available: false, // true nếu localStorage dùng được

    /**
     * Đọc save từ localStorage, gộp với mặc định và migrate kỷ lục bản MVP. main.js gọi một lần lúc boot.
     * @returns {SaveData}
     */
    load: function () {
      // Thử ghi một key tạm: cách chắc chắn nhất để biết localStorage có dùng được không.
      Save.available = storageSet(PROBE_KEY, '1');
      storageRemove(PROBE_KEY);
      var d = defaults();
      var raw = storageGet(KEY);
      if (raw) {
        // 💡 Khái niệm: bảo vệ dữ liệu hỏng — JSON sửa tay sai cú pháp thì JSON.parse ném lỗi; ta bắt lại và
        //   dùng mặc định thay vì để game trắng màn hình ngay lúc khởi động.
        try { d = merge(d, JSON.parse(raw)); } catch (e) { console.warn('[OG.Save] dữ liệu hỏng, dùng mặc định'); }
      }
      // 💡 Khái niệm: migrate — bản MVP chỉ lưu kỷ lục ở key 'oggyBest'. Đọc nó và giữ số lớn hơn,
      //   nên người chơi bản cũ không mất kỷ lục khi lên bản mới.
      var legacy = +(storageGet(LEGACY_BEST_KEY) || 0);
      if (legacy > d.bestScore) d.bestScore = legacy;
      Save.data = d;
      return d;
    },

    /**
     * Ghi Save.data xuống localStorage. Gọi sau mỗi lần sửa Save.data.
     * 🧪 Thử: chơi xong một màn, mở DevTools → Application → Local Storage để xem chuỗi JSON 'oggyAdventure.save.v1'.
     * @returns {boolean} ghi thành công hay không (false nếu localStorage bị chặn)
     */
    commit: function () {
      var ok = false;
      try { ok = storageSet(KEY, JSON.stringify(Save.data)); } catch (e) { ok = false; }
      // Vẫn ghi key cũ để bản MVP (nếu người chơi mở lại) thấy kỷ lục mới.
      if (Save.data.bestScore) storageSet(LEGACY_BEST_KEY, String(Save.data.bestScore));
      return ok;
    },

    /**
     * Đọc giá trị theo đường dẫn chấm.
     * @param {string} path vd 'settings.musicVolume'
     * @param {any} [fallback] trả về nếu đường dẫn không tồn tại
     * @returns {any}
     * @example
     *   var vol = OG.Save.get('settings.musicVolume', 0.6);
     */
    get: function (path, fallback) {
      /** @type {any} */
      var cur = Save.data;
      var parts = String(path).split('.');
      for (var i = 0; i < parts.length; i++) {
        if (cur == null || typeof cur !== 'object' || !(parts[i] in cur)) return fallback;
        cur = cur[parts[i]];
      }
      return cur;
    },

    /**
     * Ghi giá trị theo đường dẫn chấm (tự tạo object trung gian nếu thiếu) và commit ngay.
     * @param {string} path vd 'ext.story.last'
     * @param {any} value
     * @returns {any} chính value
     */
    set: function (path, value) {
      /** @type {any} */
      var cur = Save.data;
      var parts = String(path).split('.');
      for (var i = 0; i < parts.length - 1; i++) {
        if (cur[parts[i]] == null || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
        cur = cur[parts[i]];
      }
      cur[parts[parts.length - 1]] = value;
      Save.commit();
      return value;
    },

    /**
     * Lấy vùng dữ liệu riêng Save.data.ext[name] của một module (tạo {} nếu chưa có).
     * 💡 Khái niệm: namespace dữ liệu — mỗi module chỉ ghi vào "ngăn" của mình nên hai module không bao giờ
     *   ghi đè field của nhau, và thêm module mới không phải sửa defaults().
     * @param {string} name tên module, vd 'quests'
     * @returns {Object<string, any>} object BỀN VỮNG (sửa trực tiếp rồi gọi commit())
     * @example
     *   var my = OG.Save.ns('quests'); my.done = (my.done || 0) + 1; OG.Save.commit();
     */
    ns: function (name) {
      if (!Save.data.ext[name] || typeof Save.data.ext[name] !== 'object') Save.data.ext[name] = {};
      return Save.data.ext[name];
    },

    // ---- Xu (tiền tệ) ----
    /** @returns {number} số xu trong ví */
    getCoins: function () { return Save.data.coins | 0; },
    /**
     * Cộng (hoặc trừ, n âm) xu vào ví, commit và phát 'coins:change'. Ví không bao giờ âm.
     * @param {number} n số xu (làm tròn)
     * @param {string} [reason] lý do, vd 'pickup', 'level', 'spend'
     * @returns {number} số xu sau khi cộng
     */
    addCoins: function (n, reason) {
      n = Math.round(n || 0);
      if (!n) return Save.data.coins;
      Save.data.coins = Math.max(0, (Save.data.coins | 0) + n);
      // Thống kê chỉ đếm xu KIẾM được, không trừ khi tiêu.
      if (n > 0) Save.data.stats.coins += n;
      Save.commit();
      OG.Events.emit('coins:change', { coins: Save.data.coins, delta: n, reason: reason || '' });
      return Save.data.coins;
    },
    /**
     * Trừ xu nếu đủ (phát 'coins:change' khi trừ được).
     * @param {number} n
     * @param {string} [reason='spend']
     * @returns {boolean} true nếu đã trừ
     */
    spendCoins: function (n, reason) {
      n = Math.round(n || 0);
      if (n < 0 || (Save.data.coins | 0) < n) return false;
      Save.addCoins(-n, reason || 'spend');
      return true;
    },

    // ---- Kỷ lục ----
    /**
     * Ghi kỷ lục nếu score cao hơn kỷ lục cũ.
     * @param {number} score
     * @returns {boolean} true nếu là kỷ lục mới
     */
    submitBest: function (score) {
      if (score > (Save.data.bestScore | 0)) { Save.data.bestScore = score; Save.commit(); return true; }
      return false;
    },

    // ---- Kho vật phẩm ----
    /** @param {string} itemId @returns {number} số lượng vật phẩm đang có */
    getItemCount: function (itemId) { return Save.data.inventory[itemId] | 0; },
    /**
     * Thêm (n âm = bớt) vật phẩm vào kho, không xuống dưới 0, rồi commit.
     * @param {string} itemId
     * @param {number} [n=1]
     * @returns {number} số lượng sau khi thêm
     */
    addItem: function (itemId, n) {
      Save.data.inventory[itemId] = Math.max(0, (Save.data.inventory[itemId] | 0) + (n == null ? 1 : n));
      Save.commit();
      return Save.data.inventory[itemId];
    },

    // ---- Cài đặt ----
    /**
     * Đổi một cài đặt, commit và phát 'settings:change' để module liên quan (Audio, main.js...) tự áp dụng.
     * @param {string} key tên field trong settings, vd 'musicVolume'
     * @param {any} value
     */
    setSetting: function (key, value) {
      /** @type {any} */ (Save.data.settings)[key] = value;
      Save.commit();
      OG.Events.emit('settings:change', { key: key, value: value });
    },

    /** Xoá toàn bộ tiến độ (cả key MVP), ghi bản mặc định và phát 'save:reset'. */
    reset: function () {
      Save.data = defaults();
      storageRemove(KEY);
      storageRemove(LEGACY_BEST_KEY);
      Save.commit();
      OG.Events.emit('save:reset', {});
    }
  });
})();
