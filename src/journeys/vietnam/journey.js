/* Hành trình "vietnam" — Vòng quanh Việt Nam. CẤU TRÚC: khu, màn, trùm, người dẫn đường.
 * Chủ sở hữu v2: agent journey-vietnam (CHỈ src/journeys/vietnam/). Hợp đồng: docs/STORY.md mục 2–3.
 * Thứ tự load trong thư mục: theme.js → content.js → extras.js → journey.js (file này).
 * Id màn PHẢI bắt đầu bằng 'vietnam-'.
 * BẢN STUB: 1 khu, 1 màn mẫu. Khu dự kiến: hanoi (Hà Nội) · halong (Hạ Long) · hue (Huế) · hoian (Hội An) · saigon (Sài Gòn) · mientay (miền Tây). */
(function () {
  'use strict';
  var OG = window.OG;

  OG.Journeys.register({
    id: 'vietnam',
    order: 2,
    title: 'Vòng quanh Việt Nam',
    emoji: '🇻🇳',
    description: 'Theo chân Bob đi khắp Việt Nam: phố cổ, vịnh biển, món ngon và lễ hội!',
    guide: { charId: 'bob', name: 'Bob' },
    palette: { primary: '#e63946', secondary: '#2a9d8f', accent: '#ffb703', bg: '#fff6df', ink: '#17233d' },
    intro: 'intro',
    ending: { comic: 'ending', title: 'HOÀN THÀNH HÀNH TRÌNH! 🎉', text: 'Bạn đã khám phá khắp Việt Nam. Tuyệt vời!' },
    areas: [
      {
        id: 'hanoi', name: 'Hà Nội', emoji: '🏯', sceneryTheme: 'vietnam-hanoi', music: 'garden',
        boss: { bossId: 'joey' }, // tạm dùng trùm v1; có thể đăng ký trùm riêng 'vietnam-...' trong extras.js
        levels: [
          {
            id: 'vietnam-hanoi-1', name: 'Hà Nội', width: 1600, spawn: { x: 70, y: 420 }, goal: 3,
            platforms: [[0, 480, 1600, 60], [300, 400, 160, 18], [560, 340, 160, 18], [860, 400, 180, 18], [1120, 340, 160, 18]],
            pizzas: [[200, 440], [380, 360], [640, 300], [950, 360], [1200, 300]],
            coins: [[480, 420], [760, 420], [1050, 420]],
            enemies: [{ type: 'roach', x: 700, speed: 70 }, { type: 'roach', x: 1250, speed: 70 }],
            exit: { x: 1480 },
            pages: [{ card: 'hn_turtle', x: 520, y: 440 }, { card: 'hn_pho', x: 1050, y: 300 }],
            guideSpots: [{ x: 260, text: 'Chào bạn! Mình là Bob. Hà Nội có nhiều hồ đẹp lắm!' }],
            quizGate: { quiz: 'q_capital' }
          }
        ]
      }
    ]
  });
})();
