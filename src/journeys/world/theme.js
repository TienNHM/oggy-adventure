/* Hành trình "world" — CẢNH NỀN theo chủ đề. Chủ sở hữu v2: agent journey-world (CHỈ src/journeys/world/).
 * Hợp đồng ThemeDef: docs/STORY.md mục 4. Id chủ đề có tiền tố 'world-'.
 * BẢN STUB: 1 chủ đề mẫu. Agent journey-world thêm chủ đề cho mọi khu: egypt (Ai Cập) · france (Pháp) · japan (Nhật Bản) · amazon (rừng Amazon) · arctic (Bắc Cực). */
(function () {
  'use strict';
  var OG = window.OG;
  var S = OG.Scenery;

  // Ai Cập: trời nắng, đồi cát.
  S.registerTheme('world-egypt', {
    name: 'Ai Cập', base: 'roof',
    sky: { top: '#ffd27a', bottom: '#fff1c9', sun: { x: 800, y: 100, r: 56, color: '#fff7c2' }, clouds: false },
    layers: [
      { kind: 'mountains', parallax: 0.12, y: 430, height: 150, color: '#e8b866' },
      { kind: 'hills', parallax: 0.3, y: 440, height: 50, color: '#f0c97a' }
    ],
    platformStyle: { floor: { fill: '#e2b15f', top: '#f6d58c', topH: 8 }, ledge: { fill: '#c8954a', top: '#f6d58c', radius: 6 } },
    decor: [{ kind: 'rock', every: 520, start: 300, opts: { color: '#d9a85a' } }]
  });
})();
