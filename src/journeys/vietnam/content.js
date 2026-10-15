/* Hành trình "vietnam" — NỘI DUNG HỌC: thẻ kiến thức, câu đố, truyện tranh.
 * Chủ sở hữu v2: agent journey-vietnam (CHỈ src/journeys/vietnam/). Hợp đồng: docs/STORY.md mục 2.
 * BẢN STUB: icon tạm dùng emoji/decor chung — agent journey-vietnam thay bằng drawIcon(ctx, x, y, size, t) vẽ canvas. */
(function () {
  'use strict';
  var OG = window.OG;

  OG.Journeys.register({
    id: 'vietnam',
    cards: [
      { id: 'hn_turtle', areaId: 'hanoi', title: 'Hồ Gươm', fact: 'Hồ Gươm nằm giữa lòng Hà Nội. Trên hồ có Tháp Rùa nhỏ xinh.', icon: { decor: 'rock', opts: { color: '#7fb069' } } },
      { id: 'hn_pho', areaId: 'hanoi', title: 'Phở Hà Nội', fact: 'Phở là món ăn nổi tiếng của Việt Nam, có bánh phở mềm và nước dùng thơm.', icon: { emoji: '🍜' } }
    ],
    quizzes: [
      { id: 'q_capital', areaId: 'hanoi', question: 'Thủ đô của Việt Nam là thành phố nào?',
        choices: [{ text: 'Hà Nội', icon: { emoji: '🏯' } }, { text: 'Đà Lạt', icon: { emoji: '🌲' } }, { text: 'Cà Mau', icon: { emoji: '🐟' } }],
        answer: 0, hint: 'Gợi ý: thành phố này có Hồ Gươm và Tháp Rùa!', explain: 'Đúng rồi! Hà Nội là thủ đô của Việt Nam.', cardId: 'hn_turtle' }
    ],
    comics: {
      intro: [
        { bg: 'vietnam-hanoi', chars: [{ id: 'bob', anim: 'idle', x: 0.35 }, { id: 'oggy', anim: 'idle', x: 0.62, face: -1 }],
          bubbles: [{ who: 'bob', text: 'Gâu gâu! Lũ gián lái xe đi khắp Việt Nam rồi. Mình đuổi theo nhé!' }] },
        { bg: 'vietnam-hanoi', chars: [{ id: 'joey', anim: 'run', x: 0.7 }, { id: 'marky', anim: 'run', x: 0.82 }],
          caption: 'Lũ gián chạy mất rồi! Đuổi theo thôi!' }
      ],
      ending: [
        { bg: 'vietnam-hanoi', chars: [{ id: 'bob', anim: 'victory', x: 0.4 }, { id: 'oggy', anim: 'victory', x: 0.62, face: -1 }],
          bubbles: [{ who: 'bob', text: 'Chuyến đi thật vui! Việt Nam mình đẹp quá!' }] }
      ]
    }
  });
})();
