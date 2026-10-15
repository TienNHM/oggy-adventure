/* OG.Menus — menu chính, chọn nhân vật & skin, cài đặt, tạm dừng, màn kết quả. [STUB — agent UI sẽ viết lại]
 * Chủ sở hữu: agent Menus & Shop (src/ui/).
 *
 * HỢP ĐỒNG:
 *   OG.Menus.init() — đăng ký các scene THAY THẾ bản mặc định (src/game/default-scenes.js):
 *     'menu'       : nút Chơi → OG.Game.newRun(); OG.Scenes.go('worldmap')
 *                    + lối vào 'charselect', 'shop', 'settings', 'leaderboard' (nếu OG.Scenes.has(...)).
 *     'charselect' : chọn nhân vật trong OG.Data.playable (khoá nếu chưa có trong Save.unlockedChars),
 *                    chọn skin trong OG.Data.skinsFor(charId) đã sở hữu (Save.ownedSkins);
 *                    lưu Save.selectedChar / Save.equippedSkins[charId]; emit 'char:select', 'skin:equip'.
 *     'settings'   : âm lượng nhạc/sfx (OG.Audio.setVolume), tắt tiếng (OG.Audio.mute),
 *                    nút cảm ứng (Save.settings.touchControls: 'auto'|'on'|'off'), xoá dữ liệu (OG.Save.reset()).
 *     'pause'      : push lên trên level/boss (drawBelow:true). TIẾP TỤC → OG.Scenes.pop();
 *                    CHƠI LẠI MÀN → OG.Game.startLevel(OG.Game.run.nextLevel); BẢN ĐỒ → go('worldmap'); MENU → go('menu').
 *                    Phím pause (Esc/P) lần nữa = tiếp tục. Phải emit 'game:pause' khi vào.
 *     'gameover'   : params.result (RunResult). Gọi OG.Social.mountResult(panelEl, result).
 *                    THỬ LẠI → OG.Game.newRun(); go('worldmap').
 *     'victory'    : giống gameover. Nền có thể vẽ bằng OG.drawLastPlayScene(ctx).
 *   Panel DOM nên dùng OG.DOM.panel()/OG.DOM.button() (tự phát 'ui:click').
 *   HUD: xem src/ui/hud.js.
 * Stub: không đăng ký gì → dùng scene mặc định (giao diện MVP). */
(function () {
  'use strict';
  var OG = window.OG;
  OG.Menus = OG.Menus || {};
  OG.Menus.init = function () {};
})();
