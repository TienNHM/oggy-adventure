/* OG.Save — lưu trữ bền vững, bọc localStorage trong try/catch.
 * Nếu localStorage bị chặn (private mode, file:// trên một số trình duyệt) game vẫn chạy,
 * dữ liệu chỉ sống trong bộ nhớ.
 * Module tính năng lưu dữ liệu riêng qua OG.Save.ns('<tên>') rồi gọi OG.Save.commit(). */
(function () {
  'use strict';
  var OG = window.OG;
  var KEY = 'oggyAdventure.save.v1';
  var LEGACY_BEST_KEY = 'oggyBest'; // key của bản MVP

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
      settings: { masterVolume: 1, musicVolume: 0.6, sfxVolume: 0.8, muted: false, touchControls: 'auto', difficulty: 'kid' },
      stats: { plays: 0, deaths: 0, stomps: 0, pizzas: 0, coins: 0, bossesDefeated: 0, victories: 0 },
      ext: {}                       // vùng riêng cho module tính năng: ext.quests, ext.social, ...
    };
  }

  // Gộp sâu: giữ dữ liệu đã lưu, bổ sung field mới từ defaults.
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

  function storageGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, val) {
    try { window.localStorage.setItem(key, val); return true; } catch (e) { return false; }
  }
  function storageRemove(key) {
    try { window.localStorage.removeItem(key); } catch (e) { /* bỏ qua */ }
  }

  var Save = (OG.Save = {
    data: defaults(),
    available: false, // true nếu localStorage dùng được

    load: function () {
      Save.available = storageSet('oggyAdventure.probe', '1');
      storageRemove('oggyAdventure.probe');
      var d = defaults();
      var raw = storageGet(KEY);
      if (raw) {
        try { d = merge(d, JSON.parse(raw)); } catch (e) { console.warn('[OG.Save] dữ liệu hỏng, dùng mặc định'); }
      }
      // Di chuyển kỷ lục từ MVP.
      var legacy = +(storageGet(LEGACY_BEST_KEY) || 0);
      if (legacy > d.bestScore) d.bestScore = legacy;
      Save.data = d;
      return d;
    },

    // Ghi xuống localStorage. Gọi sau mỗi lần sửa Save.data.
    commit: function () {
      var ok = false;
      try { ok = storageSet(KEY, JSON.stringify(Save.data)); } catch (e) { ok = false; }
      if (Save.data.bestScore) storageSet(LEGACY_BEST_KEY, String(Save.data.bestScore));
      return ok;
    },

    // Đọc theo đường dẫn 'settings.musicVolume'. Trả fallback nếu không có.
    get: function (path, fallback) {
      var parts = String(path).split('.'), cur = Save.data;
      for (var i = 0; i < parts.length; i++) {
        if (cur == null || typeof cur !== 'object' || !(parts[i] in cur)) return fallback;
        cur = cur[parts[i]];
      }
      return cur;
    },

    // Ghi theo đường dẫn và commit ngay.
    set: function (path, value) {
      var parts = String(path).split('.'), cur = Save.data;
      for (var i = 0; i < parts.length - 1; i++) {
        if (cur[parts[i]] == null || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
        cur = cur[parts[i]];
      }
      cur[parts[parts.length - 1]] = value;
      Save.commit();
      return value;
    },

    // Vùng dữ liệu riêng cho module tính năng (object bền vững). Nhớ gọi commit() sau khi sửa.
    ns: function (name) {
      if (!Save.data.ext[name] || typeof Save.data.ext[name] !== 'object') Save.data.ext[name] = {};
      return Save.data.ext[name];
    },

    // ---- Xu (tiền tệ) ----
    getCoins: function () { return Save.data.coins | 0; },
    addCoins: function (n, reason) {
      n = Math.round(n || 0);
      if (!n) return Save.data.coins;
      Save.data.coins = Math.max(0, (Save.data.coins | 0) + n);
      if (n > 0) Save.data.stats.coins += n;
      Save.commit();
      OG.Events.emit('coins:change', { coins: Save.data.coins, delta: n, reason: reason || '' });
      return Save.data.coins;
    },
    // Trừ xu nếu đủ. Trả true/false.
    spendCoins: function (n, reason) {
      n = Math.round(n || 0);
      if (n < 0 || (Save.data.coins | 0) < n) return false;
      Save.addCoins(-n, reason || 'spend');
      return true;
    },

    // ---- Kỷ lục ----
    submitBest: function (score) {
      if (score > (Save.data.bestScore | 0)) { Save.data.bestScore = score; Save.commit(); return true; }
      return false;
    },

    // ---- Kho vật phẩm ----
    getItemCount: function (itemId) { return Save.data.inventory[itemId] | 0; },
    addItem: function (itemId, n) {
      Save.data.inventory[itemId] = Math.max(0, (Save.data.inventory[itemId] | 0) + (n == null ? 1 : n));
      Save.commit();
      return Save.data.inventory[itemId];
    },

    // ---- Cài đặt ----
    setSetting: function (key, value) {
      Save.data.settings[key] = value;
      Save.commit();
      OG.Events.emit('settings:change', { key: key, value: value });
    },

    // Xoá toàn bộ tiến độ.
    reset: function () {
      Save.data = defaults();
      storageRemove(KEY);
      storageRemove(LEGACY_BEST_KEY);
      Save.commit();
      OG.Events.emit('save:reset', {});
    }
  });
})();
