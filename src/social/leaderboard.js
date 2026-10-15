/* OG.Social (phần bảng xếp hạng cục bộ). [STUB — agent Social sẽ viết lại]
 * Chủ sở hữu: agent Social (src/social/). Load SAU src/social/social.js.
 *
 * HỢP ĐỒNG:
 *   OG.Social.submitScore(entry) -> rank (1-based) | -1
 *        entry = {name, score, charId, levelId, levelsCompleted:int, time, date, type:'victory'|'gameover'}
 *        Lưu trong OG.Save.ns('social').leaderboard (tối đa 10 mục, sắp giảm dần theo score).
 *        Emit 'leaderboard:submit' {entry, rank}.
 *   OG.Social.getLeaderboard(limit) -> [entry]
 *   OG.Social.clearLeaderboard()
 * Stub: không lưu gì. */
(function () {
  'use strict';
  var OG = window.OG;
  OG.Social = OG.Social || {};
  OG.Social.submitScore = function (entry) { return -1; };
  OG.Social.getLeaderboard = function (limit) { return []; };
  OG.Social.clearLeaderboard = function () {};
})();
