/* Hành trình "science" — Khoa học & Vũ trụ. CẤU TRÚC: khu, màn, trùm, người dẫn đường.
 * Chủ sở hữu v2: agent journey-science (CHỈ src/journeys/science/). Hợp đồng: docs/STORY.md mục 2–3.
 * Thứ tự load trong thư mục: theme.js → content.js → extras.js → journey.js (file này).
 *
 * Cốt truyện: Rô-bốt Bíp chế cỗ máy thời gian; Joey, Marky, Dee Dee lấy mất và bấm lung tung.
 * Oggy cùng Bíp đuổi theo qua 4 khu, mỗi khu 2 màn + 1 trận trùm:
 *   dino (Joey) → body (Marky) → ocean (Dee Dee) → space (cả bộ ba, trận cuối).
 *
 * Thiết kế màn cho trẻ 5–10 tuổi: bục rộng (≥140 px), cao vừa (405 rồi 345), hố ngắn 80 px có bục bắc qua,
 * 2 kẻ địch chậm mỗi màn, 2 checkpoint, trang sách chủ yếu ở mặt sàn (1 trang trên bục cao để thưởng).
 * Màn đầu tiên không có hố và không có truyện chen giữa. */
(function () {
  'use strict';
  var OG = window.OG;
  if (!OG.Journeys) return;

  var BIP = 'Rô-bốt Bíp';
  var DINO = { charId: 'dino', name: 'Khủng Long Con' };
  var CELL = { charId: 'blood_cell', name: 'Hồng Cầu' };

  // Điểm nói chuyện của NPC phụ (charId + name riêng).
  function npc(who, x, lines, extra) {
    var s = { x: x, lines: lines, charId: who.charId, name: who.name };
    if (extra) for (var k in extra) s[k] = extra[k];
    return s;
  }

  OG.Journeys.register({
    id: 'science',
    order: 4,
    title: 'Khoa học & Vũ trụ',
    emoji: '🚀',
    description: 'Lũ gián lái cỗ máy thời gian! Cùng Rô-bốt Bíp về thời khủng long, vào cơ thể, xuống biển sâu và bay vào vũ trụ.',
    guide: { charId: 'robot', name: BIP },
    palette: { primary: '#7b6cf0', secondary: '#52c5ee', accent: '#ff7d5c', bg: '#f1f4ff', ink: '#17233d' },
    intro: 'intro',
    ending: { comic: 'ending', title: 'NHÀ KHOA HỌC NHÍ! 🚀', text: 'Bạn đã đi từ thời khủng long tới tận vũ trụ. Tuyệt vời quá!' },
    areas: [
      // =====================================================================
      // KHU 1 — THỜI KHỦNG LONG (trùm: Joey)
      // =====================================================================
      {
        id: 'dino', name: 'Thời khủng long', emoji: '🦕', sceneryTheme: 'science-dino', music: 'garden',
        intro: 'dino_intro', outro: 'dino_outro',
        boss: { bossId: 'joey' },
        levels: [
          {
            id: 'science-dino-1', name: 'Thung lũng dương xỉ', width: 2200, spawn: { x: 70, y: 420 }, goal: 4,
            platforms: [[0, 480, 2200, 60],
              [300, 405, 170, 18], [560, 350, 160, 18], [880, 405, 180, 18],
              [1260, 405, 170, 18], [1500, 345, 160, 18], [1780, 405, 170, 18]],
            pizzas: [[180, 440], [385, 365], [640, 310], [970, 365], [1345, 365], [1620, 305], [1865, 365], [2000, 440]],
            coins: [[520, 440], [550, 440], [1180, 440], [1210, 440], [1700, 440]],
            enemies: [{ type: 'roach', x: 820, range: 60, speed: 55 }, { type: 'roach', x: 1420, range: 60, speed: 55 }],
            exit: { x: 2080 },
            checkpoints: [1220, 1720],
            pages: [{ card: 'dn_herbivore', x: 700, y: 440 }, { card: 'dn_trex', x: 1550, y: 300 }],
            quizGate: { quiz: 'q_dn_food', x: 1100 },
            guideSpots: [
              { x: 240, lines: ['Bíp bíp! Nhặt trang sách để mở thẻ kiến thức nhé!', 'Ăn đủ pizza để mở cửa EXIT. Cố lên!'] },
              npc(DINO, 1000, ['Mình là khủng long ăn cỏ. Lá cây ngon lắm!', 'Cổng phía trước sẽ hỏi một câu. Dễ thôi!'])
            ]
          },
          {
            id: 'science-dino-2', name: 'Bãi hoá thạch', width: 2400, spawn: { x: 70, y: 420 }, goal: 5,
            platforms: [[0, 480, 1180, 60], [1260, 480, 1140, 60],
              [320, 400, 170, 18], [600, 345, 160, 18], [900, 405, 170, 18], [1140, 400, 160, 18],
              [1480, 405, 170, 18], [1700, 345, 170, 18], [1980, 405, 170, 18]],
            pizzas: [[200, 440], [405, 360], [680, 305], [985, 365], [1220, 360], [1565, 365], [1740, 305], [2065, 365], [2180, 440]],
            coins: [[560, 440], [590, 440], [1380, 440], [1410, 440], [1900, 440]],
            enemies: [{ type: 'roach', x: 780, range: 60, speed: 55 }, { type: 'roach', x: 1620, range: 70, speed: 55 }],
            exit: { x: 2280 },
            checkpoints: [1320, 1900],
            pages: [{ card: 'dn_fossil', x: 520, y: 440 }, { card: 'dn_bird', x: 1820, y: 300 }],
            quizGate: { quiz: 'q_dn_fossil' },
            comicTriggers: [{ x: 860, comic: 'dino_dig', once: true }],
            guideSpots: [
              { x: 260, lines: ['Hoá thạch nằm sâu trong đá.', 'Nhảy lên bục để qua hố nhé. Rơi xuống cũng không sao!'] },
              npc(DINO, 1420, ['Bạn biết không? Chim là họ hàng của khủng long đấy!'])
            ]
          }
        ]
      },

      // =====================================================================
      // KHU 2 — BÊN TRONG CƠ THỂ (trùm: Marky)
      // =====================================================================
      {
        id: 'body', name: 'Bên trong cơ thể', emoji: '❤️', sceneryTheme: 'science-body', music: 'kitchen',
        intro: 'body_intro', outro: 'body_outro',
        boss: { bossId: 'marky' },
        levels: [
          {
            id: 'science-body-1', name: 'Nhịp tim thình thịch', width: 2200, spawn: { x: 70, y: 420 }, goal: 4,
            platforms: [[0, 480, 1650, 60], [1730, 480, 470, 60],
              [280, 405, 170, 18], [540, 350, 160, 18], [820, 405, 170, 18],
              [1220, 405, 170, 18], [1460, 350, 160, 18], [1620, 405, 140, 18], [1880, 405, 140, 18]],
            pizzas: [[180, 440], [365, 365], [620, 310], [905, 365], [1305, 365], [1580, 310], [1690, 365], [1950, 365]],
            coins: [[700, 440], [730, 440], [1160, 440], [1820, 440]],
            enemies: [{ type: 'roach', x: 700, range: 50, speed: 50 }, { type: 'roach', x: 1360, range: 60, speed: 55 }],
            exit: { x: 2080 },
            checkpoints: [1200, 1800],
            pages: [{ card: 'bd_heart', x: 480, y: 440 }, { card: 'bd_lungs', x: 1510, y: 285 }],
            quizGate: { quiz: 'q_bd_heart', x: 1080 },
            guideSpots: [
              { x: 230, lines: ['Đây là mô hình cơ thể khổng lồ! Giống hệt cơ thể thật.', 'Nghe kìa: thình thịch! Tim đang làm việc đấy.'] },
              npc(CELL, 960, ['Mình là Hồng Cầu! Mình chở ô-xy đi khắp người.', 'Tim bơm máu, đẩy mình chạy vèo vèo!'], { card: 'bd_blood' })
            ]
          },
          {
            id: 'science-body-2', name: 'Hang răng trắng tinh', width: 2300, spawn: { x: 70, y: 420 }, goal: 5,
            platforms: [[0, 480, 1100, 60], [1180, 480, 1120, 60],
              [300, 405, 170, 18], [560, 345, 160, 18], [860, 405, 170, 18], [1060, 395, 160, 18],
              [1400, 405, 170, 18], [1660, 345, 160, 18], [1940, 405, 160, 18]],
            pizzas: [[190, 440], [385, 365], [640, 305], [945, 365], [1140, 355], [1485, 365], [1740, 305], [2020, 365], [2120, 440]],
            coins: [[760, 440], [1240, 440], [1270, 440], [1880, 440]],
            enemies: [{ type: 'roach', x: 760, range: 60, speed: 55 }, { type: 'roach', x: 1840, range: 60, speed: 55 }],
            exit: { x: 2180 },
            checkpoints: [1240, 1800],
            pages: [{ card: 'bd_bones', x: 520, y: 440 }, { card: 'bd_teeth', x: 1330, y: 440 }],
            quizGate: { quiz: 'q_bd_teeth' },
            comicTriggers: [{ x: 1250, comic: 'body_teeth', once: true }],
            guideSpots: [
              { x: 250, lines: ['Xương giúp em đứng thẳng và chạy nhảy.', 'Uống sữa, vận động để xương chắc khoẻ nhé!'] },
              npc(CELL, 1560, ['Đánh răng sáng và tối để răng luôn trắng sáng nhé!'])
            ]
          }
        ]
      },

      // =====================================================================
      // KHU 3 — ĐẠI DƯƠNG SÂU (trùm: Dee Dee)
      // =====================================================================
      {
        id: 'ocean', name: 'Đại dương sâu', emoji: '🐙', sceneryTheme: 'science-ocean', music: 'worldmap',
        intro: 'ocean_intro', outro: 'ocean_outro',
        boss: { bossId: 'deedee' },
        levels: [
          {
            id: 'science-ocean-1', name: 'Rạn san hô', width: 2300, spawn: { x: 70, y: 420 }, goal: 5,
            platforms: [[0, 480, 1400, 60], [1480, 480, 820, 60],
              [300, 405, 170, 18], [580, 350, 160, 18], [880, 405, 170, 18], [1140, 350, 160, 18],
              [1360, 400, 160, 18], [1640, 405, 170, 18], [1900, 350, 160, 18]],
            pizzas: [[190, 440], [385, 365], [660, 310], [965, 365], [1220, 310], [1440, 360], [1725, 365], [1980, 310], [2100, 440]],
            coins: [[500, 440], [1060, 440], [1290, 440], [1560, 440]],
            enemies: [{ type: 'science-crab', x: 760, range: 60, speed: 50 }, { type: 'science-crab', x: 1820, range: 60, speed: 50 }],
            exit: { x: 2180 },
            checkpoints: [1000, 1720],
            pages: [{ card: 'oc_ocean', x: 520, y: 440 }, { card: 'oc_octopus', x: 1220, y: 270 }],
            quizGate: { quiz: 'q_oc_octopus', x: 1600 },
            guideSpots: [
              { x: 240, lines: ['Biển phủ phần lớn Trái Đất đó!', 'Chú cua này bò ngang chậm rì. Giẫm nhẹ lên là xong!'] },
              { x: 1060, lines: ['Bạn bạch tuộc trốn trên rạn san hô cao kìa!', 'Nhảy lên bục tím để tìm trang sách nhé.'] }
            ]
          },
          {
            id: 'science-ocean-2', name: 'Vực sâu phát sáng', width: 2400, spawn: { x: 70, y: 420 }, goal: 5,
            platforms: [[0, 480, 900, 60], [980, 480, 1420, 60],
              [280, 405, 170, 18], [540, 345, 160, 18], [860, 400, 160, 18], [1150, 405, 170, 18],
              [1420, 345, 160, 18], [1700, 405, 170, 18], [1980, 350, 160, 18]],
            pizzas: [[180, 440], [365, 365], [620, 305], [940, 360], [1235, 365], [1545, 305], [1785, 365], [2060, 310], [2200, 440]],
            coins: [[470, 440], [1060, 440], [1090, 440], [1620, 440]],
            enemies: [{ type: 'science-crab', x: 1300, range: 60, speed: 50 }, { type: 'science-crab', x: 1900, range: 60, speed: 50 }],
            exit: { x: 2280 },
            checkpoints: [1060, 1760],
            pages: [{ card: 'oc_glow', x: 700, y: 440 }, { card: 'oc_whale', x: 1470, y: 275 }],
            quizGate: { quiz: 'q_oc_whale' },
            comicTriggers: [{ x: 1120, comic: 'ocean_whale', once: true }],
            guideSpots: [
              { x: 220, lines: ['Ở đây tối quá! May mà có cá tự phát sáng.', 'Bíp! Mình cũng có đèn trên đầu nè!'] },
              { x: 1640, lines: ['Cá voi xanh thở bằng phổi, phải ngoi lên mặt nước để thở.'] }
            ]
          }
        ]
      },

      // =====================================================================
      // KHU 4 — HỆ MẶT TRỜI (trùm cuối: bộ ba gián)
      // =====================================================================
      {
        id: 'space', name: 'Hệ Mặt Trời', emoji: '🪐', sceneryTheme: 'science-space', music: 'lair',
        intro: 'space_intro',
        boss: { bossId: 'trio' },
        levels: [
          {
            id: 'science-space-1', name: 'Dạo bước trên Mặt Trăng', width: 2300, spawn: { x: 70, y: 420 }, goal: 4,
            platforms: [[0, 480, 1300, 60], [1380, 480, 920, 60],
              [300, 405, 170, 18], [560, 345, 160, 18], [1100, 405, 170, 18], [1260, 395, 160, 18],
              [1560, 405, 170, 18], [1820, 345, 160, 18]],
            pizzas: [[190, 440], [385, 365], [640, 305], [1185, 365], [1340, 355], [1645, 365], [1940, 305], [2080, 440]],
            coins: [[760, 440], [790, 440], [1460, 440], [2000, 440]],
            enemies: [{ type: 'science-astroroach', x: 760, range: 60, speed: 50 }, { type: 'science-astroroach', x: 1720, range: 60, speed: 50 }],
            exit: { x: 2180 },
            checkpoints: [1040, 1640],
            pages: [{ card: 'sp_sun', x: 480, y: 440 }, { card: 'sp_astronaut', x: 1500, y: 440 }, { card: 'sp_moon', x: 1860, y: 280 }],
            quizGates: [{ quiz: 'q_sp_sun', x: 900, id: 'sun' }, { quiz: 'q_sp_moon', id: 'moon' }],
            comicTriggers: [{ x: 680, comic: 'space_earth', once: true }],
            guideSpots: [
              { x: 240, lines: ['Ngôi sao gần chúng ta nhất chính là Mặt Trời!', 'Nó ở rất xa nhưng vẫn sưởi ấm Trái Đất.'] },
              { x: 1440, lines: ['Mặt Trăng quay quanh Trái Đất đó.', 'Lên bục cao để nhặt trang Mặt Trăng nhé!'] }
            ]
          },
          {
            id: 'science-space-2', name: 'Đường tới Sao Mộc', width: 2400, spawn: { x: 70, y: 420 }, goal: 5,
            platforms: [[0, 480, 1000, 60], [1080, 480, 1320, 60],
              [280, 405, 170, 18], [540, 345, 160, 18], [800, 405, 170, 18], [960, 395, 160, 18],
              [1300, 405, 170, 18], [1560, 345, 160, 18], [1840, 405, 170, 18], [2060, 345, 140, 18]],
            pizzas: [[180, 440], [365, 365], [620, 305], [885, 365], [1040, 355], [1385, 365], [1680, 305], [1925, 365], [2130, 305]],
            coins: [[480, 440], [1160, 440], [1190, 440], [1780, 440]],
            enemies: [{ type: 'science-astroroach', x: 700, range: 60, speed: 50 }, { type: 'science-astroroach', x: 1720, range: 60, speed: 50 }],
            exit: { x: 2280 },
            checkpoints: [1140, 1800],
            pages: [{ card: 'sp_planets', x: 480, y: 440 }, { card: 'sp_jupiter', x: 1600, y: 285 }],
            quizGate: { quiz: 'q_sp_planets' },
            guideSpots: [
              { x: 240, lines: ['Có 8 hành tinh quay quanh Mặt Trời.', 'Trái Đất là hành tinh thứ ba. Nhà của chúng ta!'] },
              { x: 1200, lines: ['Sắp tới Sao Mộc rồi! Nó to khổng lồ luôn!', 'Bộ ba gián đang trốn ở phía trước. Cẩn thận nhé!'] }
            ]
          }
        ]
      }
    ]
  });
})();
