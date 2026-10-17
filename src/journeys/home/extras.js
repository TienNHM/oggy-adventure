// @ts-check
/* ============================================================================
 * Hành trình "home" — PHẦN MỞ RỘNG (extension point) tuỳ chọn
 * ----------------------------------------------------------------------------
 * Vai trò:      Chỗ dành sẵn để hành trình đăng ký loại kẻ địch / trùm / decor / NPC RIÊNG. Hành trình home
 *               hiện không cần thêm gì nên file chỉ còn IIFE rỗng — vẫn giữ để cấu trúc 4 file giống các
 *               hành trình khác (sinh viên thêm hành trình mới chỉ việc chép thư mục).
 * Khái niệm:    data-driven design · extension point (điểm mở rộng: engine cho phép "cắm" thêm loại mới
 *               qua registry, không sửa engine) · quy ước tiền tố tên để tránh trùng giữa các hành trình
 * Bài học:      docs/learn/12-data-driven-man-cau-do-hanh-trinh.md
 * Phụ thuộc:    (không) — nếu thêm thì gọi lúc LOAD: OG.Enemies.registerType, OG.Bosses.register,
 *               OG.Scenery.registerDecor/registerLayer, OG.Data.registerCharacter (docs/STORY.md mục 2.8)
 * Event:        (không)
 * API công khai: (không)
 * Đọc tiếp:     src/journeys/science/extras.js (ví dụ có đăng ký kẻ địch riêng) → src/journeys/home/journey.js
 *
 * Hiện KHÔNG cần đăng ký gì thêm:
 *  - Kẻ địch: dùng 'roach' có sẵn (đi chậm, phạm vi ngắn — xem journey.js).
 *  - Trùm: dùng 4 trùm có sẵn deedee / marky / joey / trio (đấu trường tự theo chủ đề cảnh nền của khu).
 *  - Decor riêng 'home-*' (giỏ trái cây, hướng dương, ống khói, thùng rác phân loại, nam châm...) đăng ký
 *    trong theme.js cạnh chủ đề dùng chúng.
 *  - NPC (bee, ladybug, droplet) đã có trong src/data/characters.js; Jack là nhân vật chơi được có sẵn.
 * Nếu thêm sau: tên mới PHẢI có tiền tố 'home-'; kẻ địch/trùm dễ thương, không đáng sợ.
 * ========================================================================== */
(function () {
  'use strict';
  // 💡 Khái niệm: extension point — muốn có kẻ địch riêng thì thêm ở đây, ví dụ:
  //   OG.Enemies.registerType('home-ant', { ... });   rồi trong journey.js dùng { type: 'home-ant', x: 900 }.
  //   Engine tra loại địch theo tên trong registry nên không phải sửa src/game/enemies.js.
})();
