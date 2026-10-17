// @ts-check
/* ============================================================================
 * Hành trình "home" (Cuốn Bách Khoa Kỳ Diệu) — CẤU TRÚC: KHU, MÀN, TRÙM, NGƯỜI DẪN ĐƯỜNG
 * ----------------------------------------------------------------------------
 * Vai trò:      Khai báo "bộ khung" của hành trình home: thông tin chung (tên, màu, người dẫn đường),
 *               4 khu và 8 màn chơi. Không có logic game nào ở đây — OG.Journeys đọc dữ liệu này,
 *               OG.Level / OG.Learn / OG.Story biến nó thành màn chơi thật.
 * Khái niệm:    data-driven design (thiết kế hướng dữ liệu: nội dung là dữ liệu, engine chỉ "chạy" dữ liệu) ·
 *               đăng ký nhiều lần cùng id rồi gộp (merge by id) · tái sử dụng hình học màn cũ bằng `from` ·
 *               hàm nhà máy (factory) nhỏ để bớt lặp dữ liệu
 * Bài học:      docs/learn/12-data-driven-man-cau-do-hanh-trinh.md
 * Phụ thuộc:    OG.Journeys.register (đọc lúc LOAD — core/journeys.js phải nạp trước).
 *               Tham chiếu theo TÊN (kiểm lúc CHẠY bởi OG.Journeys.validate): chủ đề 'home-*' (theme.js),
 *               thẻ/câu đố/truyện (content.js), trùm deedee/marky/joey/trio, màn v1 kitchen/garden/roof/lair.
 * Event:        (không)
 * API công khai: (không) — chỉ gọi OG.Journeys.register({ id: 'home', ... })
 * Đọc tiếp:     src/journeys/home/content.js (thẻ, câu đố, truyện mà file này tham chiếu)
 *               → src/journeys/home/theme.js (chủ đề cảnh nền 'home-*') → src/core/journeys.js (compileLevel, validate)
 * Dữ liệu:      JourneyDef → AreaDef → LevelDef (src/types.d.ts; đặc tả docs/STORY.md mục 2–2.2)
 *
 * Thứ tự load trong thư mục: theme.js → content.js → extras.js → journey.js (file này, xem index.html).
 *
 * Thiết kế màn (dành cho trẻ 5–10 tuổi):
 *  - 4 khu × 2 màn + 1 trận trùm mỗi khu: Nhà bếp (Dee Dee) → Khu vườn (Marky) → Mái nhà (Joey) → Tầng hầm (bộ ba).
 *  - Màn 1 của mỗi khu: hình học mới, DỄ (bục rộng, bước nhảy thấp, hố ≤ 90 px có bục bắc cầu).
 *  - Màn 2 của mỗi khu: TÍCH HỢP LẠI màn v1 (`from:`) nhưng bớt địch, địch chậm, goal thấp hơn.
 *  - Mỗi màn: 2–3 trang sách (1 trang đặt trên bục cao để thưởng), ≥ 1 cổng câu đố, 2 điểm dẫn đường,
 *    checkpoint giữa màn. Câu đố luôn đặt SAU trang sách chứa kiến thức của nó.
 *
 * Toạ độ trong file: toạ độ THẾ GIỚI (px), gốc góc trên-trái màn chơi; sàn chính ở y = 480.
 *   platforms: [x, y, w, h] (góc trên-trái) · pizzas/coins: [x, y] (tâm) · pages: {x, y} (tâm) ·
 *   exit/quizGate/guideSpots/checkpoints: chỉ cần x (đứng trên sàn).
 * ========================================================================== */
(function () {
  'use strict';
  var OG = window.OG;

  // 💡 Khái niệm: hàm nhà máy (factory) cho DỮ LIỆU — mỗi màn chỉ ghi roach(950, 70, 45) thay vì
  //   lặp lại cả object { type, x, range, speed }. Muốn đổi loại địch của cả hành trình chỉ sửa 1 chỗ.
  /**
   * Tạo dữ liệu một con gián "hiền" (đi chậm, phạm vi tuần tra ngắn).
   * OG.Difficulty ở chế độ 'kid' còn nhân thêm tốc độ × 0.7.
   * @param {number} x        vị trí xuất phát, toạ độ thế giới (px)
   * @param {number} [range=70]  nửa quãng tuần tra quanh x (px)
   * @param {number} [speed=45]  tốc độ đi (px/giây)
   * @returns {EnemySpawn}
   */
  function roach(x, range, speed) { return { type: 'roach', x: x, range: range || 70, speed: speed || 45 }; }

  // 💡 Khái niệm: đăng ký nhiều lần cùng id — file này chỉ khai "khung" (areas), content.js khai
  //   cards/quizzes/comics với cùng id 'home'; OG.Journeys GỘP lại (mảng gộp theo id, field khác ghi đè).
  OG.Journeys.register({
    id: 'home',
    order: 1,
    title: 'Cuốn Bách Khoa Kỳ Diệu',
    emoji: '📖',
    description: 'Lũ gián làm tung trang sách khắp nhà! Cùng Olivia nhặt lại và khám phá điều kỳ diệu.',
    guide: { charId: 'olivia', name: 'Olivia' },   // người dẫn đường: charId phải có trong src/data/characters.js
    // Màu UI riêng của hành trình (thẻ chọn, khung truyện, sổ tay) — UI đọc từ dữ liệu, không hard-code theo id.
    palette: { primary: '#ed713c', secondary: '#52b9df', accent: '#ffc94a', bg: '#fff6df', ink: '#17233d' },
    intro: 'intro',                                // id truyện tranh trong content.js (chiếu lần đầu)
    ending: { comic: 'ending', title: 'CUỐN SÁCH ĐÃ LÀNH! 📖',
      text: 'Bạn đã nhặt lại mọi trang sách và học được bao điều kỳ diệu. Giỏi quá!' },
    areas: [
      // =====================================================================
      // KHU 1 — NHÀ BẾP: dinh dưỡng, uống nước, rửa tay, an toàn bếp
      // =====================================================================
      // Mẫu AreaDef: sceneryTheme là chủ đề mặc định cho mọi màn trong khu (và cho đấu trường trùm);
      // intro/outro/boss.intro là id truyện tranh; bossId tham chiếu trùm đã đăng ký trong src/bosses/.
      {
        id: 'kitchen', name: 'Nhà bếp', emoji: '🍳', sceneryTheme: 'home-kitchen', music: 'kitchen',
        intro: 'kitchen_intro', outro: 'kitchen_outro',
        boss: { bossId: 'deedee', intro: 'kitchen_boss' },
        levels: [
          // Mẫu LevelDef đầy đủ (màn tự vẽ hình học). id BẮT BUỘC có tiền tố 'home-' và duy nhất toàn game.
          {
            id: 'home-kitchen-1', name: 'Bữa sáng cầu vồng', icon: '🥕',
            width: 2000, spawn: { x: 70, y: 420 }, goal: 5,   // goal = số pizza cần ăn để mở EXIT (≤ số pizza)
            // ⚠️ Bẫy: platforms[0] nên là sàn y = 480 (validate cảnh báo nếu không). Muốn có hố thì TÁCH sàn thành
            //   nhiều đoạn y = 480 (xem khu vườn bên dưới), đừng xoá sàn.
            platforms: [[0, 480, 2000, 60], [280, 400, 170, 18], [520, 340, 170, 18], [800, 400, 190, 18],
              [1060, 340, 170, 18], [1480, 400, 180, 18], [1700, 340, 160, 18]],
            pizzas: [[170, 440], [365, 360], [880, 360], [1145, 300], [1420, 440], [1570, 360], [1780, 300]],
            coins: [[1000, 440], [1040, 440], [1300, 440], [1880, 440]],
            enemies: [roach(950, 70, 45), roach(1610, 80, 45)],
            exit: { x: 1880 },
            // ---- field v2 của hành trình ----
            // pages: trang sách (tâm x, y) — chạm vào thì OG.Learn mở thẻ `card` (id trong content.js).
            pages: [
              { card: 'k_veggie', x: 470, y: 440 },
              { card: 'k_water', x: 760, y: 440 },
              { card: 'k_handwash', x: 625, y: 300 }    // trên bục cao: trang "thưởng"
            ],
            // Cổng câu đố: x số = tường chặn giữa màn; bỏ x = cổng đặt ở cửa EXIT.
            // ⚠️ Bẫy: đặt cổng TRƯỚC trang sách chứa đáp án thì bé phải đoán mò — luôn đặt sau (x lớn hơn).
            quizGate: { quiz: 'q_wash', x: 1330 },
            // NPC đứng ở x; thiếu charId/name thì dùng người dẫn đường của hành trình (Olivia).
            guideSpots: [
              { x: 230, lines: ['Chào bạn! Mình là Olivia. Cùng nhặt trang sách nhé!',
                'Chạm vào trang sách 📄 để mở thẻ kiến thức.',
                'Ăn đủ pizza 🍕 thì cửa EXIT mới mở đó!'] },
              { x: 1230, charId: 'droplet', name: 'Giọt Nước', lines: ['Mình là Giọt Nước! Uống nước giúp em mát và khoẻ.',
                'Phía trước có cổng dấu hỏi. Sai cũng không sao, cứ thử lại!'] }
            ],
            checkpoints: [700, 1380]   // x của cột cờ hồi sinh; chỉ hiện ở chế độ "Bé chơi" (kid) — thiếu thì OG.Difficulty tự cắm mỗi 600 px
          },
          {
            // Tích hợp lại màn v1 "Nhà bếp náo loạn" (hình học), bớt địch và hạ goal.
            // 💡 Khái niệm: `from` — compileLevel chép width, spawn, goal, platforms, pizzas, coins, enemies, exit từ màn v1
            //   'kitchen' rồi GHI ĐÈ bằng field khai ở đây (goal, enemies) → tái sử dụng dữ liệu, không chép tay.
            // 🧪 Thử: xoá dòng `enemies` bên dưới rồi chơi màn này: lũ gián của màn v1 gốc quay lại.
            id: 'home-kitchen-2', name: 'Bếp nóng, bé an toàn', icon: '🍲', from: 'kitchen', goal: 4,
            enemies: [roach(640, 60, 45), roach(1460, 60, 45)],
            pages: [
              { card: 'k_fruit', x: 625, y: 300 },      // trên bục cao
              { card: 'k_hot', x: 1180, y: 440 }
            ],
            quizGates: [{ quiz: 'q_vitc', x: 960 }, { quiz: 'q_safe' }], // cổng giữa màn + cổng ở EXIT
            guideSpots: [
              { x: 380, lines: ['Ổi, cam, kiwi đều có nhiều vitamin C đấy!',
                'Mỗi ngày ăn một ít trái cây là khoẻ re!'] },
              { x: 1240, lines: ['Nồi đang nóng lắm! Đừng chạm vào nhé.',
                'Muốn nấu ăn thì luôn nhờ người lớn giúp.'] }
            ],
            checkpoints: [900, 1350]
          }
        ]
      },

      // =====================================================================
      // KHU 2 — KHU VƯỜN: quang hợp, hạt mầm, ong, bọ rùa, vòng tuần hoàn nước
      // =====================================================================
      {
        id: 'garden', name: 'Khu vườn', emoji: '🌻', sceneryTheme: 'home-garden', music: 'garden',
        intro: 'garden_intro', outro: 'garden_outro',
        boss: { bossId: 'marky', intro: 'garden_boss' },
        levels: [
          {
            id: 'home-garden-1', name: 'Vườn hoa nắng vàng', icon: '🌱',
            width: 2200, spawn: { x: 70, y: 420 }, goal: 5,
            // Một hố nhỏ (1100–1190) có bục bắc ngang phía trên.
            platforms: [[0, 480, 1100, 60], [1190, 480, 1010, 60], [260, 400, 170, 18], [500, 335, 170, 18],
              [760, 400, 180, 18], [1060, 400, 170, 18], [1340, 340, 170, 18], [1600, 400, 170, 18], [1840, 340, 160, 18]],
            pizzas: [[180, 440], [345, 360], [585, 295], [850, 360], [1145, 360], [1380, 300], [1685, 360], [1920, 300]],
            coins: [[680, 440], [720, 440], [1260, 440], [1540, 440], [2040, 440]],
            enemies: [roach(900, 60, 45), roach(1790, 60, 45)],
            exit: { x: 2080 },
            pages: [
              { card: 'g_plant', x: 470, y: 440 },
              { card: 'g_seed', x: 1010, y: 440 },
              { card: 'g_bee', x: 1460, y: 300 }        // trên bục cao
            ],
            quizGate: { quiz: 'q_plant', x: 1300 },
            guideSpots: [
              { x: 240, lines: ['Lá cây giống như nhà bếp tí hon đó!',
                'Lá dùng ánh nắng để tự làm thức ăn.'] },
              { x: 1600, charId: 'bee', name: 'Ong Vàng', lines: ['Bzz! Mình là Ong Vàng.',
                'Mình mang phấn hoa giúp cây ra quả. Ngọt ngào ghê!'] }
            ],
            comicTriggers: [{ x: 720, comic: 'garden_ladybug', once: true }],
            checkpoints: [700, 1250, 1750]
          },
          {
            // Tích hợp lại màn v1 "Khu vườn bí mật".
            id: 'home-garden-2', name: 'Bạn nhỏ của khu vườn', icon: '🐞', from: 'garden', goal: 5,
            enemies: [roach(620, 60, 45), roach(1520, 60, 45)],
            pages: [
              { card: 'g_ladybug', x: 900, y: 440 },
              { card: 'g_water', x: 1740, y: 275 }      // trên bục cao
            ],
            quizGates: [{ quiz: 'q_bee', x: 1200 }, { quiz: 'q_water' }],
            guideSpots: [
              { x: 300, charId: 'ladybug', name: 'Bọ Rùa', lines: ['Chào bạn! Mình là Bọ Rùa chấm bi.',
                'Mình ăn lũ rệp nhỏ xíu hại cây. Nhà vườn quý mình lắm!'] },
              { x: 1350, charId: 'droplet', name: 'Giọt Nước', lines: ['Mình đi một vòng mãi không thôi!',
                'Nắng đưa mình lên thành mây, mưa đưa mình về đất.'] }
            ],
            checkpoints: [1000, 1450]
          }
        ]
      },

      // =====================================================================
      // KHU 3 — MÁI NHÀ: mây, mưa, gió, cầu vồng · ban đêm: Mặt Trời là ngôi sao, Mặt Trăng
      // =====================================================================
      {
        id: 'roof', name: 'Mái nhà', emoji: '🌈', sceneryTheme: 'home-roof', music: 'roof',
        intro: 'roof_intro', outro: 'roof_outro',
        boss: { bossId: 'joey', intro: 'roof_boss' },
        levels: [
          {
            id: 'home-roof-1', name: 'Mây, gió và cầu vồng', icon: '🌦️',
            width: 2300, spawn: { x: 70, y: 420 }, goal: 5,
            // Ba mái nhà cách nhau 2 khe nhỏ (90 px), mỗi khe có gờ ống khói bắc cầu.
            platforms: [[0, 480, 700, 60], [790, 480, 640, 60], [1520, 480, 780, 60], [300, 400, 150, 18], [540, 330, 150, 18],
              [690, 400, 110, 18], [980, 400, 170, 18], [1220, 330, 160, 18], [1420, 400, 110, 18], [1700, 400, 170, 18], [1940, 340, 160, 18]],
            pizzas: [[180, 440], [375, 360], [615, 290], [1065, 360], [1260, 290], [1650, 440], [1785, 360], [2020, 300]],
            coins: [[470, 440], [900, 440], [940, 440], [1580, 440], [2120, 440]],
            enemies: [roach(1100, 60, 45), roach(1890, 70, 45)],
            exit: { x: 2180 },
            pages: [
              { card: 'r_cloud', x: 520, y: 440 },
              { card: 'r_wind', x: 1000, y: 440 },
              { card: 'r_rainbow', x: 1340, y: 290 }    // trên bục cao
            ],
            quizGates: [{ quiz: 'q_rain', x: 1600 }, { quiz: 'q_rainbow' }],
            guideSpots: [
              { x: 230, charId: 'droplet', name: 'Giọt Nước', lines: ['Chào! Mây là rất nhiều giọt nước tí hon như mình đó!',
                'Khi tụi mình to và nặng, tụi mình rơi xuống thành mưa.'] },
              { x: 880, lines: ['Gió đang thổi đấy! Gió là không khí chuyển động.',
                'Có khe hở giữa hai mái nhà. Nhảy lên gờ ống khói nhé!'] }
            ],
            checkpoints: [820, 1560]
          },
          {
            // Tích hợp lại màn v1 "Cuộc đua trên mái nhà" — nay là buổi tối ngắm trăng sao.
            id: 'home-roof-2', name: 'Đêm trăng đầy sao', icon: '🌙', from: 'roof', goal: 5,
            theme: 'home-roof-night', intro: 'roof_night',
            enemies: [roach(700, 60, 45), roach(1500, 60, 45)],
            pages: [
              { card: 'r_sun', x: 560, y: 440 },
              { card: 'r_moon', x: 1740, y: 280 }       // trên bục cao
            ],
            quizGate: { quiz: 'q_moon' },
            guideSpots: [
              { x: 300, lines: ['Ban ngày ta thấy Mặt Trời. Nó cũng là một ngôi sao đó!',
                'Nhớ nhé: đừng bao giờ nhìn thẳng vào Mặt Trời.'] },
              { x: 1300, lines: ['Mặt Trăng không tự sáng đâu.',
                'Nó sáng nhờ ánh nắng Mặt Trời chiếu vào đấy!'] }
            ],
            checkpoints: [900, 1600]
          }
        ]
      },

      // =====================================================================
      // KHU 4 — TẦNG HẦM: nam châm, điện an toàn, tái chế, phân loại rác (trùm cuối: bộ ba)
      // =====================================================================
      {
        id: 'basement', name: 'Tầng hầm', emoji: '🔧', sceneryTheme: 'home-basement', music: 'lair',
        intro: 'basement_intro',
        boss: { bossId: 'trio', intro: 'basement_boss' },
        levels: [
          {
            id: 'home-basement-1', name: 'Xưởng của anh Jack', icon: '🧲',
            width: 2200, spawn: { x: 70, y: 420 }, goal: 5,
            platforms: [[0, 480, 1300, 60], [1390, 480, 810, 60], [260, 400, 170, 18], [500, 335, 170, 18],
              [760, 400, 180, 18], [1020, 340, 170, 18], [1290, 400, 170, 18], [1560, 340, 170, 18], [1820, 400, 170, 18]],
            pizzas: [[170, 440], [345, 360], [585, 295], [850, 360], [1080, 300], [1345, 360], [1645, 300], [1905, 360]],
            coins: [[700, 440], [740, 440], [1200, 440], [1480, 440], [2000, 440]],
            enemies: [roach(950, 60, 45), roach(1720, 60, 45)],
            exit: { x: 2080 },
            pages: [
              { card: 'b_magnet', x: 460, y: 440 },
              { card: 'b_poles', x: 640, y: 440 },
              { card: 'b_electric', x: 1150, y: 300 }   // trên bục cao
            ],
            quizGates: [{ quiz: 'q_magnet', x: 1500 }, { quiz: 'q_electric' }],
            guideSpots: [
              { x: 240, charId: 'jack', name: 'Anh Jack', lines: ['Chào em! Xưởng của anh đầy đồ thú vị.',
                'Nam châm hút đồ bằng sắt. Đoán xem nó hút được gì nhé!'] },
              { x: 1230, lines: ['Ổ điện rất nguy hiểm. Không bao giờ chọc tay hay que vào nhé!',
                'Tay ướt thì lau khô trước, và nhờ người lớn giúp.'] }
            ],
            checkpoints: [700, 1450]
          },
          {
            // Tích hợp lại màn v1 "Hang ổ bộ ba gián" — nay là kho đồ tái chế.
            id: 'home-basement-2', name: 'Cỗ máy của bộ ba gián', icon: '♻️', from: 'lair', goal: 5,
            enemies: [roach(640, 60, 45), roach(1420, 60, 45), roach(1950, 60, 50)],
            pages: [
              { card: 'b_recycle', x: 600, y: 440 },
              { card: 'b_sort', x: 1370, y: 210 }       // trên bục cao nhất
            ],
            quizGates: [{ quiz: 'q_recycle', x: 1100 }, { quiz: 'q_sort' }],
            guideSpots: [
              { x: 300, charId: 'jack', name: 'Anh Jack', lines: ['Chai, lon, giấy cũ đừng vứt bừa nhé!',
                'Bỏ đúng thùng thì chúng được tái chế thành đồ mới.'] },
              { x: 1650, lines: ['Vỏ trái cây là rác hữu cơ, ủ thành phân bón cho cây.',
                'Cố lên! Bộ ba gián ở ngay phía trước!'] }
            ],
            comicTriggers: [{ x: 880, comic: 'basement_peek', once: true }],
            checkpoints: [900, 1600]
          }
        ]
      }
    ]
  });
})();
