/* OG.Quests — hệ thống nhiệm vụ. [STUB — agent World & Quests sẽ viết lại]
 * Chủ sở hữu: agent World & Quests (src/world/). Load SAU src/world/world.js.
 *
 * HỢP ĐỒNG:
 *   OG.Quests.init()                 — đọc quest từ OG.Data.levels[i].quests (+ quest toàn cục tự định nghĩa),
 *                                      lắng nghe OG.Events (level:start, item:collect, enemy:stomp, player:hurt,
 *                                      level:complete, boss:defeated, coins:change ...), lưu tiến độ trong
 *                                      OG.Save.ns('quests'), thưởng xu bằng OG.Save.addCoins(n, 'quest'),
 *                                      phát 'quest:progress' và 'quest:complete'.
 *   OG.Quests.list() -> [Quest]      — mọi quest: {id, levelId|null, type, text, target, reward, progress, done, claimed}
 *   OG.Quests.getForLevel(levelId) -> [Quest]
 *   OG.Quests.getHudLines(levelId) -> [{id, text, done, progress, target}]  — HUD hiển thị (gọi mỗi lần refreshHud)
 *   OG.Quests.claim(questId) -> bool — nhận thưởng (nếu thiết kế cần bấm nhận; nếu tự động thì trả false)
 *   Loại quest chuẩn (type): collect_all | no_damage | stomp_n | time_under | coins_n | boss_no_damage | complete
 *     (đánh giá chủ yếu bằng payload LevelResult của 'level:complete').
 * Stub: không có nhiệm vụ. */
(function () {
  'use strict';
  var OG = window.OG;
  OG.Quests = {
    init: function () {},
    list: function () { return []; },
    getForLevel: function (levelId) { return []; },
    getHudLines: function (levelId) { return []; },
    claim: function (questId) { return false; }
  };
})();
