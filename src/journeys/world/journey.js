/* Hành trình "world" — Vòng quanh thế giới. CẤU TRÚC: khu, màn, trùm, người dẫn đường.
 * Chủ sở hữu v2: agent journey-world (CHỈ src/journeys/world/). Hợp đồng: docs/STORY.md mục 2–3.
 * Thứ tự load trong thư mục: theme.js → content.js → extras.js → journey.js (file này).
 *
 * 5 khu × 2 màn + 1 trùm/khu: egypt (Joey) · france (Marky) · japan (Dee Dee) · amazon (Joey) · arctic (bộ ba).
 * Thiết kế màn cho trẻ 5–10 tuổi: bục rộng (≥160 px), bậc cao 70–80 px, hố ≤ 90 px, ít gián, gián đi chậm,
 * 2 checkpoint/màn, trang sách dễ thấy (1 trang đặt trên bục cao để thưởng).
 * Truyện trước trận trùm chiếu bằng comicTriggers gần cửa ra của màn cuối khu. */
(function () {
  'use strict';
  var OG = window.OG;

  // Gián du lịch (extras.js). Dự phòng 'roach' nếu loại riêng chưa đăng ký.
  function roach(x, range, costume) {
    var hasType = OG.Enemies && OG.Enemies.types && OG.Enemies.types['world-roach'];
    return { type: hasType ? 'world-roach' : 'roach', x: x, range: range || 70, speed: 55, costume: costume };
  }

  OG.Journeys.register({
    id: 'world',
    order: 3,
    title: 'Vòng quanh thế giới',
    emoji: '🌍',
    description: 'Cùng Giáo sư Cú bay qua sa mạc, thành phố, núi tuyết và rừng xanh khắp thế giới!',
    guide: { charId: 'owl', name: 'Giáo sư Cú' },
    palette: { primary: '#3f6fb5', secondary: '#f2a33a', accent: '#ffd23f', bg: '#fff6df', ink: '#17233d' },
    intro: 'intro',
    ending: { comic: 'ending', title: 'VÒNG QUANH THẾ GIỚI! 🎉', text: 'Bạn đã tìm đủ 5 mảnh địa cầu và khám phá khắp thế giới. Tuyệt vời!' },
    areas: [
      // =====================================================================
      // AI CẬP
      // =====================================================================
      {
        id: 'egypt', name: 'Ai Cập', emoji: '🐪', sceneryTheme: 'world-egypt', music: 'roof',
        intro: 'egypt_intro', outro: 'egypt_outro',
        boss: { bossId: 'joey' },
        levels: [
          {
            id: 'world-egypt-1', name: 'Kim tự tháp Giza', width: 2400, spawn: { x: 70, y: 420 }, goal: 5,
            platforms: [[0, 480, 1100, 60], [1180, 480, 1220, 60],
              [380, 400, 200, 18], [640, 330, 180, 18], [960, 400, 180, 18],
              [1400, 400, 200, 18], [1660, 330, 200, 18], [1950, 400, 180, 18]],
            pizzas: [[300, 440], [480, 360], [730, 290], [1050, 360], [1500, 360], [1720, 290], [2040, 360]],
            coins: [[580, 440], [630, 440], [1140, 380], [1300, 440], [1350, 440], [2150, 440]],
            enemies: [roach(820, 80, 'mummy'), roach(1600, 90, 'mummy')],
            exit: { x: 2260 },
            checkpoints: [700, 1450],
            pages: [{ card: 'eg_pyramid', x: 520, y: 440 }, { card: 'eg_nile', x: 1820, y: 288 }],
            guideSpots: [
              { x: 240, lines: ['Chào em! Ta là Giáo sư Cú. Nhặt trang sách để học điều mới nhé!', 'Ăn đủ pizza rồi mới tới cửa ra. Cố lên nào!'] },
              { x: 1260, charId: 'camel', lines: ['Chào bạn! Tớ là Lạc Đà. Sa mạc nóng lắm, nhớ uống nước nhé!', 'Bí mật nè: bướu của tớ không chứa nước đâu!'] }
            ],
            quizGate: { quiz: 'q_pyramid' }
          },
          {
            id: 'world-egypt-2', name: 'Bờ sông Nile', width: 2600, spawn: { x: 70, y: 420 }, goal: 5,
            platforms: [[0, 480, 900, 60], [980, 480, 800, 60], [1860, 480, 740, 60],
              [300, 400, 180, 18], [540, 330, 180, 18], [800, 400, 160, 18],
              [1080, 400, 180, 18], [1400, 330, 180, 18], [1620, 400, 160, 18], [2000, 400, 200, 18]],
            pizzas: [[390, 360], [630, 290], [880, 360], [1170, 360], [1490, 290], [1700, 360], [2100, 360]],
            coins: [[200, 440], [940, 380], [1500, 440], [1820, 380], [2300, 440]],
            enemies: [roach(700, 60, 'mummy'), roach(1480, 70, 'mummy'), roach(2160, 70, 'mummy')],
            exit: { x: 2460 },
            checkpoints: [1000, 1900],
            pages: [{ card: 'eg_hiero', x: 600, y: 440 }, { card: 'eg_camel', x: 1560, y: 288 }],
            guideSpots: [
              { x: 220, lines: ['Người Ai Cập xưa viết bằng hình vẽ đấy. Thú vị không?', 'Phía trước có cổng câu đố. Nhớ đọc kỹ trang sách nha!'] },
              { x: 1960, charId: 'camel', lines: ['Tớ đi bộ qua sa mạc cả ngày mà không mệt!', 'Joey đang trốn ở cuối đường. Cẩn thận nhé!'] }
            ],
            quizGates: [{ quiz: 'q_hiero', x: 1300 }, { quiz: 'q_camel' }],
            comicTriggers: [{ x: 1120, comic: 'egypt_mid' }, { x: 2280, comic: 'egypt_boss' }]
          }
        ]
      },

      // =====================================================================
      // PHÁP
      // =====================================================================
      {
        id: 'france', name: 'Pháp', emoji: '🥐', sceneryTheme: 'world-france', music: 'garden',
        intro: 'france_intro', outro: 'france_outro',
        boss: { bossId: 'marky' },
        levels: [
          {
            id: 'world-france-1', name: 'Tháp Eiffel', width: 2500, spawn: { x: 70, y: 420 }, goal: 5,
            platforms: [[0, 480, 1300, 60], [1390, 480, 1110, 60],
              [350, 400, 200, 18], [620, 330, 180, 18], [900, 400, 200, 18],
              [1500, 400, 200, 18], [1780, 330, 180, 18], [2050, 400, 180, 18]],
            pizzas: [[260, 440], [450, 360], [710, 290], [1000, 360], [1600, 360], [1900, 290], [2140, 360]],
            coins: [[800, 440], [860, 440], [1345, 380], [1450, 440], [2300, 440]],
            enemies: [roach(760, 80, 'beret'), roach(1700, 90, 'beret')],
            exit: { x: 2370 },
            checkpoints: [700, 1500],
            pages: [{ card: 'fr_eiffel', x: 560, y: 440 }, { card: 'fr_louvre', x: 1820, y: 288 }],
            guideSpots: [
              { x: 240, lines: ['Bonjour! Paris có tháp Eiffel nổi tiếng khắp thế giới.', 'Tháp làm bằng gì nhỉ? Nhặt trang sách để biết nhé!'] },
              { x: 1450, lines: ['Bảo tàng Louvre có hàng nghìn bức tranh và bức tượng.', 'Nàng Mona Lisa mỉm cười với mọi người ghé thăm!'] }
            ],
            quizGate: { quiz: 'q_eiffel' }
          },
          {
            id: 'world-france-2', name: 'Phố Paris', width: 2600, spawn: { x: 70, y: 420 }, goal: 5,
            platforms: [[0, 480, 1000, 60], [1080, 480, 1520, 60],
              [300, 400, 180, 18], [560, 330, 180, 18], [820, 400, 160, 18],
              [1200, 400, 200, 18], [1460, 330, 180, 18], [1900, 400, 200, 18], [2160, 330, 160, 18]],
            pizzas: [[390, 360], [650, 290], [900, 360], [1300, 360], [1550, 290], [2000, 360], [2200, 290]],
            coins: [[200, 440], [1040, 380], [1660, 440], [1700, 440], [2420, 440]],
            enemies: [roach(760, 60, 'beret'), roach(1350, 80, 'beret'), roach(2050, 70, 'beret')],
            exit: { x: 2470 },
            checkpoints: [1100, 1800],
            pages: [{ card: 'fr_croissant', x: 600, y: 440 }, { card: 'fr_bonjour', x: 2285, y: 288 }],
            guideSpots: [
              { x: 220, lines: ['Người Pháp rất thích bánh mì que dài, gọi là bánh baguette.', 'Còn bánh sừng bò thì cong cong, giòn rụm!'] },
              { x: 1760, lines: ['Nói thử với ta nào: Bonjour!', 'Hoạ sĩ Marky đang vẽ tranh ở phía trước đấy.'] }
            ],
            quizGate: { quiz: 'q_croissant' },
            comicTriggers: [{ x: 1150, comic: 'france_mid' }, { x: 2320, comic: 'france_boss' }]
          }
        ]
      },

      // =====================================================================
      // NHẬT BẢN
      // =====================================================================
      {
        id: 'japan', name: 'Nhật Bản', emoji: '🗻', sceneryTheme: 'world-japan', music: 'worldmap',
        intro: 'japan_intro', outro: 'japan_outro',
        boss: { bossId: 'deedee' },
        levels: [
          {
            id: 'world-japan-1', name: 'Núi Phú Sĩ', width: 2500, spawn: { x: 70, y: 420 }, goal: 5,
            platforms: [[0, 480, 1200, 60], [1280, 480, 1220, 60],
              [320, 400, 200, 18], [600, 330, 180, 18], [880, 400, 180, 18],
              [1400, 400, 200, 18], [1660, 330, 200, 18], [1960, 400, 180, 18]],
            pizzas: [[250, 440], [420, 360], [690, 290], [970, 360], [1500, 360], [1700, 290], [2050, 360]],
            coins: [[760, 440], [1240, 380], [1330, 440], [1600, 440], [2200, 440]],
            enemies: [roach(800, 80, 'headband'), roach(1850, 90, 'headband')],
            exit: { x: 2370 },
            checkpoints: [750, 1450],
            pages: [{ card: 'jp_fuji', x: 540, y: 440 }, { card: 'jp_sushi', x: 1820, y: 288 }],
            guideSpots: [
              { x: 240, lines: ['Konnichiwa! Nhật Bản là đất nước gồm rất nhiều hòn đảo.', 'Nhìn kìa, núi Phú Sĩ đang ngủ say dưới mũ tuyết!'] },
              { x: 1350, lines: ['Người Nhật thường cúi chào khi gặp nhau.', 'Sushi ngon lắm, đừng để Dee Dee ăn hết nhé!'] }
            ],
            quizGate: { quiz: 'q_fuji' }
          },
          {
            id: 'world-japan-2', name: 'Vườn hoa anh đào', width: 2600, spawn: { x: 70, y: 420 }, goal: 5,
            platforms: [[0, 480, 950, 60], [1030, 480, 850, 60], [1960, 480, 640, 60],
              [300, 400, 180, 18], [540, 330, 180, 18], [800, 400, 150, 18],
              [1120, 400, 200, 18], [1400, 330, 180, 18], [1720, 400, 140, 18], [2060, 400, 200, 18]],
            pizzas: [[390, 360], [630, 290], [875, 360], [1220, 360], [1440, 290], [1790, 360], [2160, 360]],
            coins: [[200, 440], [990, 380], [1920, 380], [2350, 440]],
            enemies: [roach(680, 70, 'headband'), roach(1300, 70, 'headband'), roach(2250, 70, 'headband')],
            exit: { x: 2460 },
            checkpoints: [1060, 2000],
            pages: [{ card: 'jp_sakura', x: 450, y: 440 }, { card: 'jp_train', x: 1545, y: 288 }],
            guideSpots: [
              { x: 220, lines: ['Mùa xuân ở Nhật, cả thành phố hồng rực hoa anh đào.', 'Nhặt trang sách trước khi tới cổng câu đố nhé!'] },
              { x: 1090, lines: ['Tàu Shinkansen chạy rất nhanh mà vẫn êm ru.', 'Dee Dee đang ăn sushi ở cuối đường kìa!'] }
            ],
            quizGates: [{ quiz: 'q_sakura', x: 1650 }],
            comicTriggers: [{ x: 1200, comic: 'japan_mid' }, { x: 2300, comic: 'japan_boss' }]
          }
        ]
      },

      // =====================================================================
      // RỪNG AMAZON
      // =====================================================================
      {
        id: 'amazon', name: 'Rừng Amazon', emoji: '🦜', sceneryTheme: 'world-amazon', music: 'garden',
        intro: 'amazon_intro', outro: 'amazon_outro',
        boss: { bossId: 'joey' },
        levels: [
          {
            id: 'world-amazon-1', name: 'Rừng mưa', width: 2500, spawn: { x: 70, y: 420 }, goal: 5,
            platforms: [[0, 480, 1100, 60], [1180, 480, 1320, 60],
              [330, 400, 200, 18], [600, 330, 180, 18], [880, 400, 160, 18],
              [1300, 400, 200, 18], [1560, 330, 180, 18], [1850, 400, 200, 18]],
            pizzas: [[250, 440], [430, 360], [690, 290], [960, 360], [1400, 360], [1600, 290], [1950, 360]],
            coins: [[780, 440], [1140, 380], [1500, 440], [2200, 440]],
            enemies: [roach(800, 70, 'leaf'), roach(1750, 80, 'leaf')],
            exit: { x: 2370 },
            checkpoints: [720, 1350],
            pages: [{ card: 'am_forest', x: 540, y: 440 }, { card: 'am_sloth', x: 1705, y: 288 }],
            guideSpots: [
              { x: 240, lines: ['Rừng Amazon rộng mênh mông, có vô số loài cây và con vật.', 'Nhảy lên những cành cây to để hái pizza nhé!'] },
              { x: 1260, charId: 'toucan', lines: ['Chào! Tớ là chim Toucan, mỏ tớ to và nhiều màu.', 'Bạn Lười ở phía trước. Bạn ấy làm gì cũng chậm lắm!'] }
            ],
            quizGate: { quiz: 'q_sloth' }
          },
          {
            id: 'world-amazon-2', name: 'Bờ sông Amazon', width: 2600, spawn: { x: 70, y: 420 }, goal: 5,
            platforms: [[0, 480, 1000, 60], [1080, 480, 820, 60], [1980, 480, 620, 60],
              [300, 400, 180, 18], [560, 330, 180, 18], [820, 400, 160, 18],
              [1150, 400, 200, 18], [1420, 330, 180, 18], [1700, 400, 160, 18], [2080, 400, 200, 18]],
            pizzas: [[390, 360], [600, 290], [900, 360], [1250, 360], [1510, 290], [1780, 360], [2180, 360]],
            coins: [[200, 440], [1040, 380], [1940, 380], [2400, 440]],
            enemies: [roach(760, 60, 'leaf'), roach(1320, 80, 'leaf'), roach(2250, 70, 'leaf')],
            exit: { x: 2460 },
            checkpoints: [1100, 2000],
            pages: [{ card: 'am_macaw', x: 700, y: 288 }, { card: 'am_frog', x: 1620, y: 440 }],
            guideSpots: [
              { x: 220, lines: ['Vẹt đuôi dài kêu rất to trên những ngọn cây.', 'Nhìn kỹ lá cây, có thể có ếch nhỏ trốn ở đó!'] },
              { x: 2060, charId: 'toucan', lines: ['Ếch phi tiêu đẹp lắm, nhưng chỉ nên ngắm thôi nhé!', 'Joey đang đu dây leo ở cuối rừng đấy!'] }
            ],
            quizGate: { quiz: 'q_frog' },
            comicTriggers: [{ x: 1200, comic: 'amazon_mid' }, { x: 2300, comic: 'amazon_boss' }]
          }
        ]
      },

      // =====================================================================
      // BẮC CỰC (khu cuối — trùm bộ ba)
      // =====================================================================
      {
        id: 'arctic', name: 'Bắc Cực', emoji: '🐻‍❄️', sceneryTheme: 'world-arctic', music: 'roof',
        intro: 'arctic_intro',
        boss: { bossId: 'trio' },
        levels: [
          {
            id: 'world-arctic-1', name: 'Biển băng', width: 2500, spawn: { x: 70, y: 420 }, goal: 5,
            platforms: [[0, 480, 1150, 60], [1230, 480, 1270, 60],
              [330, 400, 200, 18], [600, 330, 180, 18], [880, 400, 180, 18],
              [1340, 400, 200, 18], [1600, 330, 180, 18], [1900, 400, 180, 18]],
            pizzas: [[250, 440], [430, 360], [690, 290], [970, 360], [1440, 360], [1640, 290], [1990, 360]],
            coins: [[780, 440], [1190, 380], [1520, 440], [2200, 440]],
            enemies: [roach(800, 70, 'earmuff'), roach(1800, 70, 'earmuff')],
            exit: { x: 2370 },
            checkpoints: [720, 1400],
            pages: [{ card: 'ar_bear', x: 540, y: 440 }, { card: 'ar_ice', x: 1745, y: 288 }],
            guideSpots: [
              { x: 240, lines: ['Brrr! Chào mừng tới Bắc Cực, vùng băng tuyết ở đỉnh Trái Đất.', 'Mặt băng trơn lắm, nhảy cẩn thận nha!'] },
              { x: 1300, charId: 'polar_bear', lines: ['Tớ bơi giỏi lắm, bơi được rất xa trong nước lạnh!', 'Lông tớ dày nên tớ chẳng thấy lạnh chút nào.'] }
            ],
            quizGate: { quiz: 'q_bear' }
          },
          {
            id: 'world-arctic-2', name: 'Bầu trời cực quang', width: 2700, spawn: { x: 70, y: 420 }, goal: 5,
            platforms: [[0, 480, 1000, 60], [1080, 480, 900, 60], [2060, 480, 640, 60],
              [300, 400, 180, 18], [560, 330, 180, 18], [820, 400, 160, 18],
              [1150, 400, 200, 18], [1420, 330, 180, 18], [1720, 400, 160, 18], [2160, 400, 200, 18]],
            pizzas: [[390, 360], [650, 290], [900, 360], [1250, 360], [1460, 290], [1800, 360], [2260, 360]],
            coins: [[200, 440], [1040, 380], [2020, 380], [2500, 440]],
            enemies: [roach(700, 70, 'earmuff'), roach(1300, 70, 'earmuff'), roach(2350, 70, 'earmuff')],
            exit: { x: 2560 },
            checkpoints: [1100, 2080],
            pages: [{ card: 'ar_penguin', x: 450, y: 440 }, { card: 'ar_aurora', x: 1570, y: 288 }],
            guideSpots: [
              { x: 220, lines: ['Đây là chặng cuối cùng rồi! Em giỏi lắm!', 'Cả ba chú gián đang đợi ở cuối đường đấy.'] },
              { x: 1120, charId: 'penguin', lines: ['Tớ là Cánh Cụt, đang đi du lịch xa nhà nè!', 'Nhà tớ ở nửa phía nam Trái Đất, xa lắm luôn!'] }
            ],
            quizGates: [{ quiz: 'q_penguin', x: 1650 }, { quiz: 'q_aurora' }],
            comicTriggers: [{ x: 1250, comic: 'arctic_mid' }, { x: 2400, comic: 'arctic_boss' }]
          }
        ]
      }
    ]
  });
})();
