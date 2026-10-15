/* Hành trình "home" — Cuốn Bách Khoa Kỳ Diệu. CẤU TRÚC: khu, màn, trùm, người dẫn đường.
 * Chủ sở hữu v2: agent journey-home (CHỈ src/journeys/home/). Hợp đồng: docs/STORY.md mục 2–3.
 * Thứ tự load trong thư mục: theme.js → content.js → extras.js → journey.js (file này).
 *
 * Màn dùng định dạng LevelDef v1 + field mở rộng. `from: '<màn v1>'` mượn hình học (sàn, bục, pizza,
 * xu, kẻ địch, cửa) của màn cổ điển rồi ghi đè. Id màn PHẢI bắt đầu bằng 'home-'.
 * BẢN STUB: mỗi khu 1 màn mượn hình học v1. Agent journey-home thiết kế màn riêng (2–3 màn/khu). */
(function () {
  'use strict';
  var OG = window.OG;

  OG.Journeys.register({
    id: 'home',
    order: 1,
    title: 'Cuốn Bách Khoa Kỳ Diệu',
    emoji: '📖',
    description: 'Lũ gián xé tung cuốn bách khoa của Oggy! Nhặt lại trang sách khắp nhà.',
    guide: { charId: 'olivia', name: 'Olivia' },
    palette: { primary: '#ed713c', secondary: '#52b9df', accent: '#ffc94a', bg: '#fff6df', ink: '#17233d' },
    intro: 'intro',
    ending: { comic: 'ending', title: 'CUỐN SÁCH ĐÃ LÀNH! 📖', text: 'Bạn đã nhặt lại trang sách khắp nhà Oggy. Giỏi quá!' },
    areas: [
      {
        id: 'kitchen', name: 'Nhà bếp', emoji: '🍳', sceneryTheme: 'home-kitchen', music: 'kitchen',
        intro: 'kitchen_intro',
        boss: { bossId: 'deedee' },
        levels: [
          {
            id: 'home-kitchen-1', name: 'Bếp lộn xộn', from: 'kitchen', goal: 3,
            pages: [{ card: 'k_veggie', x: 700, y: 440 }, { card: 'k_hot', x: 1450, y: 440 }],
            guideSpots: [{ x: 380, lines: ['Chào bạn! Mình là Olivia.', 'Nhặt trang sách 📄 để mở thẻ kiến thức nhé!'] }],
            quizGate: { quiz: 'q_veggie' } // x bỏ trống = cổng ở cửa EXIT
          }
        ]
      },
      {
        id: 'garden', name: 'Khu vườn', emoji: '🌻', sceneryTheme: 'home-garden', music: 'garden',
        boss: { bossId: 'marky' },
        levels: [
          { id: 'home-garden-1', name: 'Vườn hoa rộn ràng', from: 'garden', goal: 3,
            pages: [{ card: 'g_bee', x: 640, y: 440 }],
            guideSpots: [{ x: 300, text: 'Nghe kìa, tiếng ong vo ve! Ong là bạn của hoa đấy.' }] }
        ]
      },
      {
        id: 'roof', name: 'Mái nhà', emoji: '🌤️', sceneryTheme: 'home-roof', music: 'roof',
        boss: { bossId: 'joey' },
        levels: [
          { id: 'home-roof-1', name: 'Ngắm bầu trời', from: 'roof', goal: 3,
            pages: [{ card: 'r_cloud', x: 720, y: 440 }],
            quizGate: { quiz: 'q_rain', x: 1500 } }
        ]
      },
      {
        id: 'basement', name: 'Tầng hầm', emoji: '🔬', sceneryTheme: 'home-basement', music: 'lair',
        levels: [
          { id: 'home-basement-1', name: 'Phòng thí nghiệm nhỏ', from: 'basement', goal: 3,
            pages: [{ card: 'b_recycle', x: 600, y: 440 }] }
        ]
      }
    ]
  });
})();
