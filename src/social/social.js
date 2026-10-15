/* OG.Social — nhập tên, chia sẻ điểm (Web Share API / copy link / ảnh chụp canvas). [STUB — agent Social sẽ viết lại]
 * Chủ sở hữu: agent Social (src/social/).
 *
 * HỢP ĐỒNG:
 *   OG.Social.init()                        — có thể đăng ký scene 'leaderboard' (params.back: scene quay về).
 *   OG.Social.mountResult(panelEl, result)  — được scene gameover/victory gọi sau khi mở panel; chèn thêm
 *                                             ô nhập tên, nút lưu điểm, nút chia sẻ, top 5 vào panelEl (DOM).
 *                                             result = RunResult (xem docs). KHÔNG được xoá nút có sẵn của panel.
 *   OG.Social.getPlayerName() / setPlayerName(name) — lưu Save.playerName (tối đa 16 ký tự, đã trim).
 *   OG.Social.share(result) -> Promise<bool>        — navigator.share nếu có, nếu không copy văn bản/link vào clipboard.
 *   OG.Social.captureCanvas() -> dataURL|null        — ảnh PNG của canvas #game (try/catch).
 *   OG.Social.downloadScreenshot(filename)           — tải ảnh chụp.
 *   Leaderboard: xem src/social/leaderboard.js.
 * Stub: không làm gì. */
(function () {
  'use strict';
  var OG = window.OG;
  OG.Social = OG.Social || {};
  OG.Social.init = function () {};
  OG.Social.mountResult = function (panelEl, result) {};
  OG.Social.getPlayerName = function () { return OG.Save.data.playerName || ''; };
  OG.Social.setPlayerName = function (name) {
    OG.Save.data.playerName = String(name || '').trim().slice(0, 16);
    OG.Save.commit();
    return OG.Save.data.playerName;
  };
  OG.Social.share = function (result) { return Promise.resolve(false); };
  OG.Social.captureCanvas = function () {
    try { return document.getElementById('game').toDataURL('image/png'); } catch (e) { return null; }
  };
  OG.Social.downloadScreenshot = function (filename) {};
})();
