/* Hành trình "world" — NỘI DUNG HỌC: thẻ kiến thức, câu đố, truyện tranh.
 * Chủ sở hữu v2: agent journey-world (CHỈ src/journeys/world/). Hợp đồng: docs/STORY.md mục 2.
 * BẢN STUB: icon tạm dùng emoji/decor chung — agent journey-world thay bằng drawIcon(ctx, x, y, size, t) vẽ canvas. */
(function () {
  'use strict';
  var OG = window.OG;

  OG.Journeys.register({
    id: 'world',
    cards: [
      { id: 'eg_pyramid', areaId: 'egypt', title: 'Kim tự tháp', fact: 'Kim tự tháp ở Ai Cập được xây từ rất lâu, bằng những khối đá khổng lồ.', icon: { emoji: '🔺' } },
      { id: 'eg_camel', areaId: 'egypt', title: 'Lạc đà', fact: 'Lạc đà sống ở sa mạc. Bướu của nó trữ mỡ để đi đường xa.', icon: { emoji: '🐪' } }
    ],
    quizzes: [
      { id: 'q_pyramid', areaId: 'egypt', question: 'Kim tự tháp có hình gì?',
        choices: [{ text: 'Hình tam giác', icon: { emoji: '🔺' } }, { text: 'Hình tròn', icon: { emoji: '🟠' } }],
        answer: 0, hint: 'Gợi ý: nhìn từ xa, nó nhọn ở trên đỉnh!', explain: 'Chính xác! Mỗi mặt kim tự tháp là một hình tam giác.', cardId: 'eg_pyramid' }
    ],
    comics: {
      intro: [
        { bg: 'world-egypt', chars: [{ id: 'owl', anim: 'idle', x: 0.35 }, { id: 'oggy', anim: 'idle', x: 0.62, face: -1 }],
          bubbles: [{ who: 'owl', text: 'Hu hu! Lũ gián lấy trộm quả địa cầu. Ta cùng bay đi tìm nhé!' }] },
        { bg: 'world-egypt', chars: [{ id: 'joey', anim: 'run', x: 0.7 }, { id: 'marky', anim: 'run', x: 0.82 }],
          caption: 'Lũ gián chạy mất rồi! Đuổi theo thôi!' }
      ],
      ending: [
        { bg: 'world-egypt', chars: [{ id: 'owl', anim: 'victory', x: 0.4 }, { id: 'oggy', anim: 'victory', x: 0.62, face: -1 }],
          bubbles: [{ who: 'owl', text: 'Thế giới thật rộng lớn và kỳ diệu! Cảm ơn bạn nhỏ!' }] }
      ]
    }
  });
})();
