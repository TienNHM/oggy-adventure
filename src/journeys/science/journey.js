/* Hành trình "science" — Khoa học & Vũ trụ. CẤU TRÚC: khu, màn, trùm, người dẫn đường.
 * Chủ sở hữu v2: agent journey-science (CHỈ src/journeys/science/). Hợp đồng: docs/STORY.md mục 2–3.
 * Thứ tự load trong thư mục: theme.js → content.js → extras.js → journey.js (file này).
 * Id màn PHẢI bắt đầu bằng 'science-'.
 * BẢN STUB: 1 khu, 1 màn mẫu. Khu dự kiến: dino (thời khủng long) · body (bên trong cơ thể người) · space (hệ Mặt Trời). */
(function () {
  'use strict';
  var OG = window.OG;

  OG.Journeys.register({
    id: 'science',
    order: 4,
    title: 'Khoa học & Vũ trụ',
    emoji: '🚀',
    description: 'Lũ gián lái cỗ máy thời gian! Cùng Rô-bốt Bíp về thời khủng long và bay vào vũ trụ.',
    guide: { charId: 'robot', name: 'Rô-bốt Bíp' },
    palette: { primary: '#7b6cf0', secondary: '#52c5ee', accent: '#ff7d5c', bg: '#f1f4ff', ink: '#17233d' },
    intro: 'intro',
    ending: { comic: 'ending', title: 'HOÀN THÀNH HÀNH TRÌNH! 🎉', text: 'Bạn đã khám phá khoa học và vũ trụ. Tuyệt vời!' },
    areas: [
      {
        id: 'dino', name: 'Thời khủng long', emoji: '🦕', sceneryTheme: 'science-dino', music: 'garden',
        boss: { bossId: 'joey' }, // tạm dùng trùm v1; có thể đăng ký trùm riêng 'science-...' trong extras.js
        levels: [
          {
            id: 'science-dino-1', name: 'Thời khủng long', width: 1600, spawn: { x: 70, y: 420 }, goal: 3,
            platforms: [[0, 480, 1600, 60], [300, 400, 160, 18], [560, 340, 160, 18], [860, 400, 180, 18], [1120, 340, 160, 18]],
            pizzas: [[200, 440], [380, 360], [640, 300], [950, 360], [1200, 300]],
            coins: [[480, 420], [760, 420], [1050, 420]],
            enemies: [{ type: 'roach', x: 700, speed: 70 }, { type: 'roach', x: 1250, speed: 70 }],
            exit: { x: 1480 },
            pages: [{ card: 'dn_herbivore', x: 520, y: 440 }, { card: 'dn_fossil', x: 1050, y: 300 }],
            guideSpots: [{ x: 260, text: 'Bíp bíp! Mình là Rô-bốt Bíp. Khủng long sống cách đây rất rất lâu!' }],
            quizGate: { quiz: 'q_dino_food' }
          }
        ]
      }
    ]
  });
})();
