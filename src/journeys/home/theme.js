/* Hành trình "home" — CẢNH NỀN theo chủ đề. Chủ sở hữu v2: agent journey-home (CHỈ src/journeys/home/).
 * Hợp đồng ThemeDef: docs/STORY.md mục 4. Đăng ký lúc load bằng OG.Scenery.registerTheme.
 * Dùng decor của thư viện chung theo TÊN (bush, flower, book...) — thiếu thì tự có hình dự phòng.
 * BẢN STUB: agent journey-home vẽ đẹp hơn (layers, decor riêng qua OG.Scenery.registerDecor('home-...')). */
(function () {
  'use strict';
  var OG = window.OG;
  var S = OG.Scenery;

  // Nhà bếp: tạm dùng bộ vẽ v1 'kitchen'.
  S.registerTheme('home-kitchen', { base: 'kitchen', name: 'Nhà bếp' });

  // Khu vườn: trời xanh, đồi, hoa.
  S.registerTheme('home-garden', {
    name: 'Khu vườn', base: 'garden',
    sky: { top: '#7fd6f5', bottom: '#e9f8cf', sun: { x: 800, y: 100, r: 46, color: '#fff1a8' } },
    layers: [
      { kind: 'hills', parallax: 0.15, y: 410, height: 90, color: '#a6dd8a' },
      { kind: 'decorRow', decor: 'bush', parallax: 0.35, y: 455, scale: 0.9, spacing: 260 }
    ],
    platformStyle: { floor: { fill: '#c98b4f', top: '#6cc35a', topH: 10 }, ledge: { fill: '#b97945', top: '#8fdc6a', radius: 9 } },
    decor: [{ kind: 'flower', every: 380, start: 200 }, { kind: 'rock', every: 900, start: 520, scale: 0.8 }]
  });

  // Mái nhà: tạm dùng bộ vẽ v1 'roof' (hoàng hôn).
  S.registerTheme('home-roof', { base: 'roof', name: 'Mái nhà' });

  // Tầng hầm: tạm dùng bộ vẽ v1 'lair'.
  S.registerTheme('home-basement', { base: 'lair', name: 'Tầng hầm' });
})();
