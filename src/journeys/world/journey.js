/* Hành trình "world" — Vòng quanh thế giới. CẤU TRÚC: khu, màn, trùm, người dẫn đường.
 * Chủ sở hữu v2: agent journey-world (CHỈ src/journeys/world/). Hợp đồng: docs/STORY.md mục 2–3.
 * Thứ tự load trong thư mục: theme.js → content.js → extras.js → journey.js (file này).
 * Id màn PHẢI bắt đầu bằng 'world-'.
 * BẢN STUB: 1 khu, 1 màn mẫu. Khu dự kiến: egypt (Ai Cập) · france (Pháp) · japan (Nhật Bản) · amazon (rừng Amazon) · arctic (Bắc Cực). */
(function () {
  'use strict';
  var OG = window.OG;

  OG.Journeys.register({
    id: 'world',
    order: 3,
    title: 'Vòng quanh thế giới',
    emoji: '🌍',
    description: 'Cùng Giáo sư Cú bay qua sa mạc, núi tuyết và rừng xanh khắp thế giới!',
    guide: { charId: 'owl', name: 'Giáo sư Cú' },
    palette: { primary: '#3f6fb5', secondary: '#f2a33a', accent: '#ffd23f', bg: '#fff6df', ink: '#17233d' },
    intro: 'intro',
    ending: { comic: 'ending', title: 'HOÀN THÀNH HÀNH TRÌNH! 🎉', text: 'Bạn đã khám phá khắp thế giới. Tuyệt vời!' },
    areas: [
      {
        id: 'egypt', name: 'Ai Cập', emoji: '🐪', sceneryTheme: 'world-egypt', music: 'garden',
        boss: { bossId: 'joey' }, // tạm dùng trùm v1; có thể đăng ký trùm riêng 'world-...' trong extras.js
        levels: [
          {
            id: 'world-egypt-1', name: 'Ai Cập', width: 1600, spawn: { x: 70, y: 420 }, goal: 3,
            platforms: [[0, 480, 1600, 60], [300, 400, 160, 18], [560, 340, 160, 18], [860, 400, 180, 18], [1120, 340, 160, 18]],
            pizzas: [[200, 440], [380, 360], [640, 300], [950, 360], [1200, 300]],
            coins: [[480, 420], [760, 420], [1050, 420]],
            enemies: [{ type: 'roach', x: 700, speed: 70 }, { type: 'roach', x: 1250, speed: 70 }],
            exit: { x: 1480 },
            pages: [{ card: 'eg_pyramid', x: 520, y: 440 }, { card: 'eg_camel', x: 1050, y: 300 }],
            guideSpots: [{ x: 260, text: 'Hu hu! Ta là Giáo sư Cú. Sa mạc rất nóng, nhớ uống nước nhé!' }],
            quizGate: { quiz: 'q_pyramid' }
          }
        ]
      }
    ]
  });
})();
