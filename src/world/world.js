/* OG.World — bản đồ thế giới chọn màn. [STUB — agent World & Quests sẽ viết lại]
 * Chủ sở hữu: agent World & Quests (src/world/).
 *
 * HỢP ĐỒNG:
 *   OG.World.init()   — đăng ký scene 'worldmap' thay thế bản mặc định:
 *        OG.Scenes.register('worldmap', { enter(params), exit(), update(dt), draw(ctx) })
 *        params: {} khi vào từ menu | {completed: levelId, result: LevelResult} sau khi thắng màn
 *        Scene phải: hiển thị các màn (OG.Data.levels, vị trí level.map), trạng thái khoá/mở/sao
 *        (OG.Progress.isUnlocked/getRecord), cho chọn màn bằng phím (←/→, Enter/Space) VÀ chạm/chuột
 *        (OG.Input.pointer hoặc DOM), rồi gọi OG.Game.startLevel(levelId). Nút quay về: OG.Scenes.go('menu').
 *        Có lối vào Shop/Nhân vật nếu scene tồn tại: OG.Scenes.has('shop') → OG.Scenes.go('shop', {back:'worldmap'}).
 *   OG.World.enabled  — true khi bản đồ thật đã sẵn sàng.
 *   OG.World.focusLevel(levelId) — (tuỳ chọn) đặt con trỏ chọn vào màn.
 * Stub: dùng scene 'worldmap' mặc định (src/game/default-scenes.js) — tự vào màn kế tiếp. */
(function () {
  'use strict';
  var OG = window.OG;
  OG.World = {
    enabled: false,
    init: function () {},
    focusLevel: function (levelId) {}
  };
})();
