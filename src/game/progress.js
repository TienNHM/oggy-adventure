// @ts-check
/* ============================================================================
 * OG.Progress — TIẾN ĐỘ CHIẾN DỊCH (mở khoá màn, sao, kỷ lục từng màn)
 * ----------------------------------------------------------------------------
 * Vai trò:      Quyết định màn nào đã mở / đã xong và ghi kỷ lục khi hoàn thành. Dữ liệu nằm trong
 *               OG.Save.data.progress. main.js gọi init() sau Save.load(); OG.Game gọi complete() khi xong màn;
 *               World/Quests/Menus chỉ ĐỌC qua API này.
 * Khái niệm:    đồ thị phụ thuộc mở khoá (requires) · giá trị mặc định ngầm (màn liền trước) ·
 *               kỷ lục "giữ giá trị tốt nhất" (max/min) · dữ liệu dẫn xuất (sao tối đa) không lưu mà tính lại
 * Bài học:      docs/learn/11-luu-tru-migrate.md, docs/learn/05-state-machine-scene.md (luồng hoàn thành màn)
 * Phụ thuộc:    OG.Save.data.progress / unlockedChars, OG.Save.commit, OG.Data.levels/levelIndex/getLevel/characters,
 *               OG.Events.emit (đều đọc LÚC CHẠY)
 * Event:        phát: 'char:unlock' {charId, reason:'level'} · nghe: (không)
 * API công khai: OG.Progress.init(), isUnlocked(id), isCompleted(id), getRecord(id), unlock(id), refreshUnlocks(),
 *               complete(id, result), nextLevelId(id), firstIncomplete(), allCompleted(), totalStars(), maxStars(), isFinal(id)
 * Đọc tiếp:     src/game/game.js (completeLevel gọi complete) → src/core/save.js (nơi dữ liệu được ghi)
 * Dữ liệu:      LevelRecord {completed, bestScore, stars, bestTime, plays} — xem typedef trong src/core/save.js.
 * ========================================================================== */
(function () {
  'use strict';
  var OG = window.OG;

  var STARS_PER_LEVEL = 3;
  var TIME_DECIMALS = 10; // làm tròn bestTime tới 0,1 giây (nhân 10 → round → chia 10)

  /** @returns {{unlocked: string[], levels: Object<string, any>}} vùng tiến độ trong save (đọc lại mỗi lần vì Save.reset() thay object) */
  function prog() { return OG.Save.data.progress; }
  /** @returns {LevelDef[]} */
  function levels() { return OG.Data.levels; }

  /**
   * Danh sách màn cần hoàn thành trước (mặc định: màn liền trước).
   * 💡 Khái niệm: đồ thị phụ thuộc — mỗi màn trỏ tới các màn "cha" phải xong trước. Mặc định là một chuỗi
   *   thẳng (màn i cần màn i−1); màn phụ ghi requires tường minh để rẽ nhánh (vd basement cần kitchen).
   * @param {LevelDef} level
   * @returns {string[]}
   */
  function requiresOf(level) {
    if (level.requires) return level.requires;
    var i = OG.Data.levelIndex(level.id);
    return i > 0 ? [levels()[i - 1].id] : [];
  }

  var Progress = (OG.Progress = {
    /** Chuẩn hoá dữ liệu tiến độ, mở các màn không có yêu cầu và màn đã đủ điều kiện, rồi commit. */
    init: function () {
      var p = prog();
      // Save hỏng/cũ có thể thiếu mảng này — sửa ngay để mọi hàm phía dưới yên tâm dùng indexOf/push.
      if (!Array.isArray(p.unlocked)) p.unlocked = [];
      // Màn không có yêu cầu luôn mở.
      levels().forEach(function (l) {
        if (requiresOf(l).length === 0 && p.unlocked.indexOf(l.id) < 0) p.unlocked.push(l.id);
      });
      Progress.refreshUnlocks();
      OG.Save.commit();
    },

    /** @param {string} id @returns {boolean} */
    isUnlocked: function (id) { return prog().unlocked.indexOf(id) >= 0; },
    /** @param {string} id @returns {boolean} */
    isCompleted: function (id) { var r = prog().levels[id]; return !!(r && r.completed); },
    /** @param {string} id @returns {any} kỷ lục {completed, bestScore, stars, bestTime, plays} hoặc null */
    getRecord: function (id) { return prog().levels[id] || null; },

    /**
     * Mở khoá một màn (bỏ qua điều kiện requires) và commit.
     * @param {string} id
     * @returns {boolean} true nếu vừa mở (false nếu đã mở từ trước)
     */
    unlock: function (id) {
      if (!Progress.isUnlocked(id)) { prog().unlocked.push(id); OG.Save.commit(); return true; }
      return false;
    },

    /**
     * Mở các màn đã đủ điều kiện (mọi màn trong requires đã xong). KHÔNG tự commit — người gọi commit.
     * @returns {string[]} id các màn vừa mở
     */
    refreshUnlocks: function () {
      var opened = [];
      levels().forEach(function (l) {
        if (Progress.isUnlocked(l.id)) return;
        var ok = requiresOf(l).every(function (r) { return Progress.isCompleted(r); });
        if (ok) { prog().unlocked.push(l.id); opened.push(l.id); }
      });
      return opened;
    },

    /**
     * Ghi nhận hoàn thành màn: cập nhật kỷ lục, mở màn mới, mở khoá nhân vật theo màn. Commit, rồi phát
     * 'char:unlock' cho từng nhân vật vừa mở.
     * @param {string} id
     * @param {{levelScore: number, stars: number, time: number}} result LevelResult (chỉ dùng 3 field này)
     * @returns {{firstClear: boolean, newlyUnlocked: string[], charsUnlocked: string[]}}
     * @example
     *   var r = OG.Progress.complete('kitchen', { levelScore: 900, stars: 3, time: 52.3 });
     *   if (r.firstClear) OG.DOM.toast('Lần đầu qua màn!');
     */
    complete: function (id, result) {
      var p = prog();
      var rec = p.levels[id] || (p.levels[id] = { completed: false, bestScore: 0, stars: 0, bestTime: 0, plays: 0 });
      var firstClear = !rec.completed;
      // Kỷ lục chỉ được cải thiện, không bao giờ tụt: điểm/sao lấy max, thời gian lấy min (0 = chưa có).
      rec.completed = true;
      rec.plays = (rec.plays | 0) + 1;
      rec.bestScore = Math.max(rec.bestScore | 0, result.levelScore | 0);
      rec.stars = Math.max(rec.stars | 0, result.stars | 0);
      if (!rec.bestTime || result.time < rec.bestTime) rec.bestTime = Math.round(result.time * TIME_DECIMALS) / TIME_DECIMALS;
      var opened = Progress.refreshUnlocks();
      // Mở khoá nhân vật có unlock {type:'level', levelId: id} (vd Olivia mở khi xong 'garden').
      var chars = [];
      var all = OG.Data.characters;
      for (var cid in all) {
        var u = all[cid].unlock;
        if (u && u.type === 'level' && u.levelId === id && OG.Save.data.unlockedChars.indexOf(cid) < 0) {
          OG.Save.data.unlockedChars.push(cid);
          chars.push(cid);
        }
      }
      // ⚠️ Bẫy: commit TRƯỚC khi phát event — listener (vd Menus) có thể đọc lại Save ngay trong lúc nghe.
      OG.Save.commit();
      chars.forEach(function (c) { OG.Events.emit('char:unlock', { charId: c, reason: 'level' }); });
      return { firstClear: firstClear, newlyUnlocked: opened, charsUnlocked: chars };
    },

    /** @param {string} id @returns {string | null} màn kế tiếp theo thứ tự danh sách */
    nextLevelId: function (id) {
      var i = OG.Data.levelIndex(id);
      var n = levels()[i + 1];
      return n ? n.id : null;
    },
    /** @returns {string} màn đầu tiên đã mở mà chưa hoàn thành (hoặc màn cuối nếu đã xong hết) */
    firstIncomplete: function () {
      var ls = levels();
      for (var i = 0; i < ls.length; i++) if (Progress.isUnlocked(ls[i].id) && !Progress.isCompleted(ls[i].id)) return ls[i].id;
      return ls[ls.length - 1].id;
    },
    /** @returns {boolean} */
    allCompleted: function () { return levels().every(function (l) { return Progress.isCompleted(l.id); }); },
    /**
     * Tổng sao đã đạt. Chỉ tính màn cổ điển (OG.Data.levels); sao của hành trình xem OG.Journeys.progress(id).
     * 🧪 Thử: trong console gõ  OG.Progress.totalStars() + '/' + OG.Progress.maxStars()  (chỉ đọc, không đổi save).
     * @returns {number}
     */
    totalStars: function () {
      var s = 0, p = prog().levels;
      levels().forEach(function (l) { if (p[l.id]) s += p[l.id].stars | 0; });
      return s;
    },
    /** @returns {number} 3 sao × số màn — tính lại mỗi lần (dữ liệu dẫn xuất) nên thêm màn không phải sửa save */
    maxStars: function () { return levels().length * STARS_PER_LEVEL; },
    /**
     * Màn này có phải màn kết thúc chiến dịch không: theo field final nếu có, không thì là màn cuối danh sách.
     * @param {string} id
     * @returns {boolean}
     */
    isFinal: function (id) {
      var l = OG.Data.getLevel(id);
      if (!l) return false;
      if (l.final != null) return !!l.final;
      return OG.Data.levelIndex(id) === levels().length - 1;
    }
  });
})();
