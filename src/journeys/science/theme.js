/* Hành trình "science" — CẢNH NỀN theo chủ đề. Chủ sở hữu v2: agent journey-science (CHỈ src/journeys/science/).
 * Hợp đồng ThemeDef: docs/STORY.md mục 4. Id chủ đề có tiền tố 'science-'.
 * BẢN STUB: 1 chủ đề mẫu. Agent journey-science thêm chủ đề cho mọi khu: dino (thời khủng long) · body (bên trong cơ thể người) · space (hệ Mặt Trời). */
(function () {
  'use strict';
  var OG = window.OG;
  var S = OG.Scenery;

  // Thời khủng long: núi xa, bụi cây dương xỉ.
  S.registerTheme('science-dino', {
    name: 'Thời khủng long', base: 'garden',
    sky: { top: '#ffb38a', bottom: '#fff0c4', sun: { x: 720, y: 120, r: 50, color: '#ffe08a' } },
    layers: [
      { kind: 'mountains', parallax: 0.1, y: 430, height: 190, color: '#a3836b' },
      { kind: 'decorRow', decor: 'bush', parallax: 0.3, y: 455, scale: 1.1, spacing: 240, opts: { color: '#5fae4e' } }
    ],
    platformStyle: { floor: { fill: '#9c6b45', top: '#7ccf5a', topH: 9 }, ledge: { fill: '#8a6a52', top: '#a7d86a', radius: 10 } },
    decor: [{ kind: 'rock', every: 460, start: 260 }]
  });
})();
