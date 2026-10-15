/* OG.Progress — tiến độ chiến dịch (mở khoá màn, sao, kỷ lục từng màn). Lưu trong OG.Save.data.progress.
 * Chủ sở hữu: agent Tích hợp. World/Quests/Menus chỉ ĐỌC qua API này. */
(function () {
  'use strict';
  var OG = window.OG;

  function prog() { return OG.Save.data.progress; }
  function levels() { return OG.Data.levels; }

  // Danh sách màn cần hoàn thành trước (mặc định: màn liền trước).
  function requiresOf(level) {
    if (level.requires) return level.requires;
    var i = OG.Data.levelIndex(level.id);
    return i > 0 ? [levels()[i - 1].id] : [];
  }

  var Progress = (OG.Progress = {
    init: function () {
      var p = prog();
      if (!Array.isArray(p.unlocked)) p.unlocked = [];
      // Màn không có yêu cầu luôn mở.
      levels().forEach(function (l) {
        if (requiresOf(l).length === 0 && p.unlocked.indexOf(l.id) < 0) p.unlocked.push(l.id);
      });
      Progress.refreshUnlocks();
      OG.Save.commit();
    },

    isUnlocked: function (id) { return prog().unlocked.indexOf(id) >= 0; },
    isCompleted: function (id) { var r = prog().levels[id]; return !!(r && r.completed); },
    // {completed, bestScore, stars, bestTime, plays} hoặc null
    getRecord: function (id) { return prog().levels[id] || null; },

    unlock: function (id) {
      if (!Progress.isUnlocked(id)) { prog().unlocked.push(id); OG.Save.commit(); return true; }
      return false;
    },

    // Mở các màn đã đủ điều kiện. Trả về mảng id vừa mở.
    refreshUnlocks: function () {
      var opened = [];
      levels().forEach(function (l) {
        if (Progress.isUnlocked(l.id)) return;
        var ok = requiresOf(l).every(function (r) { return Progress.isCompleted(r); });
        if (ok) { prog().unlocked.push(l.id); opened.push(l.id); }
      });
      return opened;
    },

    // Ghi nhận hoàn thành màn. result: LevelResult. Trả {firstClear, newlyUnlocked, charsUnlocked}.
    complete: function (id, result) {
      var p = prog();
      var rec = p.levels[id] || (p.levels[id] = { completed: false, bestScore: 0, stars: 0, bestTime: 0, plays: 0 });
      var firstClear = !rec.completed;
      rec.completed = true;
      rec.plays = (rec.plays | 0) + 1;
      rec.bestScore = Math.max(rec.bestScore | 0, result.levelScore | 0);
      rec.stars = Math.max(rec.stars | 0, result.stars | 0);
      if (!rec.bestTime || result.time < rec.bestTime) rec.bestTime = Math.round(result.time * 10) / 10;
      var opened = Progress.refreshUnlocks();
      // Mở khoá nhân vật theo màn.
      var chars = [];
      var all = OG.Data.characters;
      for (var cid in all) {
        var u = all[cid].unlock;
        if (u && u.type === 'level' && u.levelId === id && OG.Save.data.unlockedChars.indexOf(cid) < 0) {
          OG.Save.data.unlockedChars.push(cid);
          chars.push(cid);
        }
      }
      OG.Save.commit();
      chars.forEach(function (c) { OG.Events.emit('char:unlock', { charId: c, reason: 'level' }); });
      return { firstClear: firstClear, newlyUnlocked: opened, charsUnlocked: chars };
    },

    // Màn kế tiếp theo thứ tự danh sách (hoặc null).
    nextLevelId: function (id) {
      var i = OG.Data.levelIndex(id);
      var n = levels()[i + 1];
      return n ? n.id : null;
    },
    // Màn đầu tiên đã mở mà chưa hoàn thành (hoặc màn cuối nếu đã xong hết).
    firstIncomplete: function () {
      var ls = levels();
      for (var i = 0; i < ls.length; i++) if (Progress.isUnlocked(ls[i].id) && !Progress.isCompleted(ls[i].id)) return ls[i].id;
      return ls[ls.length - 1].id;
    },
    allCompleted: function () { return levels().every(function (l) { return Progress.isCompleted(l.id); }); },
    totalStars: function () {
      var s = 0, p = prog().levels;
      for (var k in p) s += p[k].stars | 0;
      return s;
    },
    maxStars: function () { return levels().length * 3; },
    isFinal: function (id) {
      var l = OG.Data.getLevel(id);
      if (!l) return false;
      if (l.final != null) return !!l.final;
      return OG.Data.levelIndex(id) === levels().length - 1;
    }
  });
})();
