/* Hành trình "vietnam" — CẢNH NỀN theo chủ đề. Chủ sở hữu v2: agent journey-vietnam (CHỈ src/journeys/vietnam/).
 * Hợp đồng ThemeDef: docs/STORY.md mục 4. Id chủ đề có tiền tố 'vietnam-'.
 * BẢN STUB: 1 chủ đề mẫu. Agent journey-vietnam thêm chủ đề cho mọi khu: hanoi (Hà Nội) · halong (Hạ Long) · hue (Huế) · hoian (Hội An) · saigon (Sài Gòn) · mientay (miền Tây). */
(function () {
  'use strict';
  var OG = window.OG;
  var S = OG.Scenery;

  // Hà Nội: trời xanh nhạt, mặt hồ, hàng cây.
  S.registerTheme('vietnam-hanoi', {
    name: 'Hà Nội', base: 'garden',
    sky: { top: '#8ed8f8', bottom: '#fdf3d0', sun: { x: 760, y: 110, r: 44, color: '#fff3b0' } },
    layers: [
      { kind: 'hills', parallax: 0.12, y: 420, height: 60, color: '#b9e3a5' },
      { kind: 'waves', parallax: 0.3, y: 448, color: '#7cc7e8' }
    ],
    platformStyle: { floor: { fill: '#d9a066', top: '#7cc35a', topH: 9 }, ledge: { fill: '#c0392b', top: '#f4d35e', radius: 8 } },
    decor: [{ kind: 'flower', every: 420, start: 240, opts: { color: '#ff9fc1' } }]
  });
})();
