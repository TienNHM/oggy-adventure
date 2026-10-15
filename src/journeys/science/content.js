/* Hành trình "science" — NỘI DUNG HỌC: thẻ kiến thức, câu đố, truyện tranh.
 * Chủ sở hữu v2: agent journey-science (CHỈ src/journeys/science/). Hợp đồng: docs/STORY.md mục 2.
 * BẢN STUB: icon tạm dùng emoji/decor chung — agent journey-science thay bằng drawIcon(ctx, x, y, size, t) vẽ canvas. */
(function () {
  'use strict';
  var OG = window.OG;

  OG.Journeys.register({
    id: 'science',
    cards: [
      { id: 'dn_herbivore', areaId: 'dino', title: 'Khủng long ăn cỏ', fact: 'Khủng long cổ dài thích ăn lá cây trên cao. Chúng rất to nhưng hiền lành.', icon: { emoji: '🦕' } },
      { id: 'dn_fossil', areaId: 'dino', title: 'Hoá thạch', fact: 'Nhờ hoá thạch trong đá, các nhà khoa học biết khủng long trông thế nào.', icon: { decor: 'rock' } }
    ],
    quizzes: [
      { id: 'q_dino_food', areaId: 'dino', question: 'Khủng long cổ dài thích ăn gì?',
        choices: [{ text: 'Lá cây', icon: { decor: 'bush' } }, { text: 'Kem dâu', icon: { emoji: '🍦' } }],
        answer: 0, hint: 'Gợi ý: cổ dài giúp nó với tới ngọn cây!', explain: 'Đúng rồi! Khủng long cổ dài ăn lá cây.', cardId: 'dn_herbivore' }
    ],
    comics: {
      intro: [
        { bg: 'science-dino', chars: [{ id: 'robot', anim: 'idle', x: 0.35 }, { id: 'oggy', anim: 'idle', x: 0.62, face: -1 }],
          bubbles: [{ who: 'robot', text: 'Bíp bíp! Lũ gián lấy cỗ máy thời gian rồi! Mau đuổi theo!' }] },
        { bg: 'science-dino', chars: [{ id: 'joey', anim: 'run', x: 0.7 }, { id: 'marky', anim: 'run', x: 0.82 }],
          caption: 'Lũ gián chạy mất rồi! Đuổi theo thôi!' }
      ],
      ending: [
        { bg: 'science-dino', chars: [{ id: 'robot', anim: 'victory', x: 0.4 }, { id: 'oggy', anim: 'victory', x: 0.62, face: -1 }],
          bubbles: [{ who: 'robot', text: 'Bíp! Nhiệm vụ hoàn thành! Khoa học thật thú vị!' }] }
      ]
    }
  });
})();
