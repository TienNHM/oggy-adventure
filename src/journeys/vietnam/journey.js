/* Hành trình "vietnam" — Vòng quanh Việt Nam. CẤU TRÚC: khu, màn, trùm, người dẫn đường.
 * Chủ sở hữu v2: agent journey-vietnam (CHỈ src/journeys/vietnam/). Hợp đồng: docs/STORY.md mục 2–3.
 * Thứ tự load trong thư mục: theme.js → content.js → extras.js → journey.js (file này).
 *
 * 6 khu × 2 màn + 1 trận trùm/khu (trận cuối: bộ ba 'trio'). Màn DỄ cho trẻ 5–10 tuổi:
 *  - sàn y=480, bục thấp (y=400) rồi bục cao (y≈335) — mỗi bậc ≤ 80 px, khoảng cách ngang ≤ 80 px;
 *  - hố tối đa 90 px và luôn có bục gỗ bắc ngang phía trên; ít địch, đi chậm;
 *  - 2 trang sổ tay/màn: 1 trang dưới đất dễ thấy, 1 trang trên bục cao (thưởng cho bé khéo tay);
 *  - 1 cổng câu đố/màn: màn 1 = cổng giữa màn (sau trang liên quan), màn 2 = cổng ở cửa EXIT;
 *  - 2 điểm người dẫn đường/màn, 1 checkpoint giữa màn. */
(function () {
  'use strict';
  var OG = window.OG;
  var ROACH = 'vietnam-roach'; // gián đội nón lá (extras.js); thiếu thì Enemies dùng 'roach'

  function roach(x, range, speed) { return { type: ROACH, x: x, range: range || 60, speed: speed || 55 }; }

  OG.Journeys.register({
    id: 'vietnam',
    order: 2,
    title: 'Vòng quanh Việt Nam',
    emoji: '⭐', // cờ 🇻🇳 hiện thành chữ "VN" trên Windows
    description: 'Theo chân Bob đi khắp Việt Nam: phố cổ, vịnh biển, món ngon và chợ nổi!',
    guide: { charId: 'bob', name: 'Bob' },
    palette: { primary: '#e63946', secondary: '#2a9d8f', accent: '#ffb703', bg: '#fff6df', ink: '#17233d' },
    intro: 'intro',
    ending: { comic: 'ending', title: 'HOÀN THÀNH HÀNH TRÌNH! 🎉', text: 'Bạn đã đi khắp Việt Nam từ Bắc vào Nam. Tuyệt vời!' },
    areas: [
      // =====================================================================
      // HÀ NỘI
      // =====================================================================
      {
        id: 'hanoi', name: 'Hà Nội', emoji: '🐢', sceneryTheme: 'vietnam-hanoi', music: 'garden',
        intro: 'hanoi_intro', outro: 'hanoi_outro',
        boss: { bossId: 'joey' },
        levels: [
          {
            id: 'vietnam-hanoi-1', name: 'Dạo quanh Hồ Gươm', width: 2000, spawn: { x: 70, y: 420 }, goal: 4,
            platforms: [[0, 480, 2000, 60], [300, 400, 180, 18], [560, 340, 170, 18], [820, 400, 200, 18],
              [1200, 400, 180, 18], [1420, 340, 170, 18], [1660, 400, 180, 18]],
            pizzas: [[200, 440], [390, 360], [645, 300], [920, 360], [1290, 360], [1460, 300], [1750, 360]],
            coins: [[480, 440], [510, 440], [1060, 440], [1090, 440], [1600, 440]],
            enemies: [roach(940, 50), roach(1560, 60)],
            exit: { x: 1880 },
            pages: [{ card: 'hn_hoguom', x: 540, y: 440 }, { card: 'hn_pho', x: 1545, y: 292 }],
            quizGate: { quiz: 'q_hn_capital', x: 1150 },
            checkpoints: [1270],
            guideSpots: [
              { x: 250, lines: ['Gâu! Chào bạn! Mình là Bob, hướng dẫn viên của bạn đây!', 'Nhặt trang sổ tay 📄 để học điều hay về Việt Nam nhé!'] },
              { x: 770, charId: 'turtle', lines: ['Chào cháu! Ta là Rùa Vàng ở Hồ Gươm.', 'Cổng phía trước sẽ hỏi bài. Nhớ đọc trang sổ tay nhé!'] }
            ]
          },
          {
            id: 'vietnam-hanoi-2', name: 'Phố cổ rộn ràng', width: 2200, spawn: { x: 70, y: 420 }, goal: 5,
            platforms: [[0, 480, 1150, 60], [1240, 480, 960, 60], [280, 400, 180, 18], [520, 335, 160, 18], [760, 400, 180, 18],
              [1110, 395, 160, 18], [1400, 400, 180, 18], [1640, 335, 170, 18], [1880, 400, 160, 18]],
            pizzas: [[180, 440], [370, 360], [600, 295], [850, 360], [1190, 355], [1490, 360], [1680, 295], [1960, 360]],
            coins: [[470, 440], [500, 440], [1000, 440], [1030, 440], [1580, 440], [1610, 440]],
            enemies: [roach(960, 60), roach(1520, 70)],
            exit: { x: 2080 },
            pages: [{ card: 'hn_puppet', x: 680, y: 440 }, { card: 'hn_oldquarter', x: 1770, y: 288 }],
            quizGate: { quiz: 'q_hn_puppet' },
            checkpoints: [1300],
            guideSpots: [
              { x: 220, lines: ['Đây là phố cổ Hà Nội! Nhà ở đây hẹp và dài, gọi là nhà ống.', 'Phía trước có cái hố nhỏ. Nhảy lên bục gỗ để qua cho dễ nhé!'] },
              { x: 1330, lines: ['Múa rối nước có chú Tễu bụng tròn, cười rất vui!', 'Trang sổ tay trên bục cao kể về phố cổ đó. Nhảy khéo nhé!'] }
            ]
          }
        ]
      },

      // =====================================================================
      // VỊNH HẠ LONG
      // =====================================================================
      {
        id: 'halong', name: 'Vịnh Hạ Long', emoji: '⛵', sceneryTheme: 'vietnam-halong', music: 'worldmap',
        intro: 'halong_intro', outro: 'halong_outro',
        boss: { bossId: 'marky' },
        levels: [
          {
            id: 'vietnam-halong-1', name: 'Ra khơi ngắm đảo', width: 2200, spawn: { x: 70, y: 420 }, goal: 5,
            platforms: [[0, 480, 900, 60], [990, 480, 700, 60], [1780, 480, 420, 60], [300, 400, 170, 18], [540, 340, 160, 18],
              [870, 400, 150, 18], [1150, 400, 180, 18], [1390, 335, 170, 18], [1660, 400, 150, 18], [1950, 400, 150, 18]],
            pizzas: [[200, 440], [385, 360], [620, 300], [945, 360], [1240, 360], [1430, 295], [1735, 360], [2025, 360]],
            coins: [[480, 440], [510, 440], [760, 440], [1080, 440], [1110, 440], [1880, 440]],
            enemies: [roach(700, 60), roach(1290, 50)],
            exit: { x: 2080 },
            pages: [{ card: 'hl_heritage', x: 500, y: 440 }, { card: 'hl_islands', x: 1520, y: 288 }],
            quizGate: { quiz: 'q_hl_heritage', x: 1600 },
            checkpoints: [1060],
            guideSpots: [
              { x: 240, lines: ['Chào mừng tới Vịnh Hạ Long! Nhìn kìa, bao nhiêu là đảo đá!', 'Lỡ rơi xuống nước cũng đừng lo, bạn sẽ quay lại ngay.'] },
              { x: 1080, lines: ['Mỗi hòn đảo có một hình dáng riêng, rất ngộ nghĩnh!', 'Có hòn trông giống con gà, có hòn giống con cóc đó!'] }
            ]
          },
          {
            id: 'vietnam-halong-2', name: 'Hang động kỳ thú', theme: 'vietnam-halongcave', music: 'lair',
            width: 2300, spawn: { x: 70, y: 420 }, goal: 5,
            platforms: [[0, 480, 1000, 60], [1090, 480, 1210, 60], [260, 400, 170, 18], [500, 335, 160, 18], [740, 400, 170, 18],
              [980, 395, 130, 18], [1250, 400, 170, 18], [1490, 335, 160, 18], [1730, 400, 170, 18], [1980, 340, 150, 18]],
            pizzas: [[180, 440], [345, 360], [580, 295], [825, 360], [1045, 355], [1335, 360], [1570, 295], [1815, 360], [2010, 300]],
            coins: [[450, 440], [480, 440], [1180, 440], [1210, 440], [1650, 440], [1680, 440]],
            enemies: [roach(860, 50, 50), roach(1640, 60)],
            exit: { x: 2180 },
            pages: [{ card: 'hl_rocks', x: 640, y: 440 }, { card: 'hl_cave', x: 2100, y: 292 }],
            quizGate: { quiz: 'q_hl_rocks' },
            checkpoints: [1200],
            comicTriggers: [{ x: 1150, comic: 'halong_cave', once: true }],
            guideSpots: [
              { x: 220, lines: ['Ồ, hang động! Nhìn những nhũ đá lấp lánh kìa!', 'Thạch nhũ lớn lên rất, rất chậm, mất rất nhiều năm đó.'] },
              { x: 1400, lines: ['Sắp ra khỏi hang rồi! Ngoài kia là Hòn Trống Mái.', 'Trang sổ tay cuối nằm trên bục cao gần cửa ra đó!'] }
            ]
          }
        ]
      },

      // =====================================================================
      // HUẾ
      // =====================================================================
      {
        id: 'hue', name: 'Cố đô Huế', emoji: '🏯', sceneryTheme: 'vietnam-hue', music: 'garden',
        intro: 'hue_intro', outro: 'hue_outro',
        boss: { bossId: 'deedee' },
        levels: [
          {
            id: 'vietnam-hue-1', name: 'Kinh thành Huế', width: 2200, spawn: { x: 70, y: 420 }, goal: 5,
            platforms: [[0, 480, 2200, 60], [280, 400, 200, 18], [540, 335, 170, 18], [800, 400, 180, 18],
              [1120, 400, 200, 18], [1380, 335, 170, 18], [1640, 400, 180, 18], [1880, 335, 160, 18]],
            pizzas: [[190, 440], [380, 360], [625, 295], [890, 360], [1220, 360], [1420, 295], [1730, 360], [1960, 295]],
            coins: [[500, 440], [530, 440], [960, 440], [990, 440], [1860, 440]],
            enemies: [roach(1250, 50), roach(1780, 50)],
            exit: { x: 2080 },
            pages: [{ card: 'hue_nonla', x: 720, y: 440 }, { card: 'hue_citadel', x: 1510, y: 288 }],
            quizGate: { quiz: 'q_hue_nonla', x: 1590 },
            checkpoints: [1100],
            guideSpots: [
              { x: 230, lines: ['Đây là Kinh thành Huế, nơi các vua nhà Nguyễn từng sống.', 'Kinh thành rất rộng, có tường thành bao quanh và nhiều cổng.'] },
              { x: 1060, lines: ['Nhìn nón lá của mình nè! Nón lá nhẹ mà che nắng rất tốt.', 'Cổng phía trước sẽ hỏi về nón lá đó!'] }
            ]
          },
          {
            id: 'vietnam-hue-2', name: 'Thuyền rồng sông Hương', width: 2300, spawn: { x: 70, y: 420 }, goal: 5,
            platforms: [[0, 480, 820, 60], [910, 480, 660, 60], [1660, 480, 640, 60], [260, 400, 180, 18], [500, 335, 160, 18],
              [790, 395, 150, 18], [1050, 400, 180, 18], [1300, 335, 160, 18], [1540, 395, 150, 18], [1820, 400, 180, 18], [2050, 340, 140, 18]],
            pizzas: [[180, 440], [350, 360], [580, 295], [865, 355], [1140, 360], [1340, 295], [1615, 355], [1910, 360], [2120, 300]],
            coins: [[460, 440], [700, 440], [730, 440], [990, 440], [1240, 440], [1750, 440]],
            enemies: [roach(650, 60), roach(1230, 50)],
            exit: { x: 2180 },
            pages: [{ card: 'hue_river', x: 1000, y: 440 }, { card: 'hue_saola', x: 1425, y: 288 }],
            quizGate: { quiz: 'q_hue_capital' },
            checkpoints: [1150],
            guideSpots: [
              { x: 220, lines: ['Đây là sông Hương thơ mộng. Thuyền rồng chở khách đi ngắm cảnh đó!', 'Huế từng là kinh đô của các vua nhà Nguyễn đó. Nhớ nhé!'] },
              { x: 1760, lines: ['Bên bờ sông có chùa Thiên Mụ với ngọn tháp bảy tầng.', 'Cửa ra ở phía trước rồi. Cố lên nào!'] }
            ]
          }
        ]
      },

      // =====================================================================
      // HỘI AN
      // =====================================================================
      {
        id: 'hoian', name: 'Phố cổ Hội An', emoji: '🏮', sceneryTheme: 'vietnam-hoian', music: 'roof',
        intro: 'hoian_intro', outro: 'hoian_outro',
        boss: { bossId: 'joey' },
        levels: [
          {
            id: 'vietnam-hoian-1', name: 'Phố đèn lồng', width: 2200, spawn: { x: 70, y: 420 }, goal: 5,
            platforms: [[0, 480, 2200, 60], [300, 400, 180, 18], [540, 335, 170, 18], [800, 400, 200, 18],
              [1150, 400, 180, 18], [1390, 335, 170, 18], [1640, 400, 180, 18], [1890, 400, 150, 18]],
            pizzas: [[200, 440], [390, 360], [625, 295], [900, 360], [1240, 360], [1430, 295], [1730, 360], [1965, 360]],
            coins: [[500, 440], [960, 440], [990, 440], [1590, 440], [1850, 440]],
            enemies: [roach(700, 50), roach(1800, 50)],
            exit: { x: 2080 },
            pages: [{ card: 'ha_lantern', x: 520, y: 440 }, { card: 'ha_oldtown', x: 1515, y: 288 }],
            quizGate: { quiz: 'q_ha_lantern', x: 1600 },
            checkpoints: [1120],
            guideSpots: [
              { x: 240, lines: ['Hội An lúc chiều tối đẹp như tranh vẽ! Đèn lồng sáng khắp nơi.', 'Đèn lồng Hội An làm bằng khung tre và vải lụa nhiều màu.'] },
              { x: 1080, charId: 'lion_dance', lines: ['Tùng tùng xèng! Lân Con múa chào bạn nè!', 'Tết Trung thu, các bạn nhỏ rước đèn ông sao và xem múa lân.'] }
            ]
          },
          {
            id: 'vietnam-hoian-2', name: 'Qua Chùa Cầu', width: 2300, spawn: { x: 70, y: 420 }, goal: 5,
            platforms: [[0, 480, 1000, 60], [1090, 480, 1210, 60], [260, 400, 180, 18], [500, 335, 160, 18], [750, 400, 170, 18],
              [970, 395, 150, 18], [1250, 400, 180, 18], [1500, 335, 160, 18], [1750, 400, 170, 18], [1990, 340, 150, 18]],
            pizzas: [[180, 440], [350, 360], [580, 295], [835, 360], [1045, 355], [1340, 360], [1580, 295], [1835, 360], [2030, 300]],
            coins: [[460, 440], [490, 440], [1180, 440], [1210, 440], [1680, 440]],
            enemies: [roach(880, 50), roach(1650, 60)],
            exit: { x: 2180 },
            pages: [{ card: 'ha_bridge', x: 690, y: 440 }, { card: 'ha_douc', x: 2100, y: 292 }],
            quizGate: { quiz: 'q_ha_bridge' },
            checkpoints: [1200],
            guideSpots: [
              { x: 220, lines: ['Phía trước là Chùa Cầu, biểu tượng của Hội An đó!', 'Chùa Cầu có mái ngói cong và những ô cửa nhỏ xinh.'] },
              { x: 1420, lines: ['Voọc chà vá chân nâu được gọi là “nữ hoàng linh trưởng” đó!', 'Trang sổ tay về voọc ở trên bục cao gần cửa ra.'] }
            ]
          }
        ]
      },

      // =====================================================================
      // TP. HỒ CHÍ MINH
      // =====================================================================
      {
        id: 'saigon', name: 'TP. Hồ Chí Minh', emoji: '🥖', sceneryTheme: 'vietnam-saigon', music: 'kitchen',
        intro: 'saigon_intro', outro: 'saigon_outro',
        boss: { bossId: 'deedee' },
        levels: [
          {
            id: 'vietnam-saigon-1', name: 'Phố phường nhộn nhịp', width: 2200, spawn: { x: 70, y: 420 }, goal: 5,
            platforms: [[0, 480, 2200, 60], [300, 400, 180, 18], [540, 335, 170, 18], [800, 400, 200, 18],
              [1150, 400, 180, 18], [1390, 335, 170, 18], [1640, 400, 180, 18], [1890, 335, 150, 18]],
            pizzas: [[200, 440], [390, 360], [625, 295], [900, 360], [1240, 360], [1430, 295], [1730, 360], [1965, 295]],
            coins: [[500, 440], [530, 440], [960, 440], [990, 440], [1580, 440]],
            enemies: [roach(720, 50, 60), roach(1780, 50, 60)],
            exit: { x: 2080 },
            pages: [{ card: 'sg_banhmi', x: 520, y: 440 }, { card: 'sg_city', x: 1515, y: 288 }],
            quizGate: { quiz: 'q_sg_banhmi', x: 1600 },
            checkpoints: [1120],
            guideSpots: [
              { x: 240, lines: ['Chào mừng tới TP. Hồ Chí Minh! Nơi này còn được gọi là Sài Gòn.', 'Nghe tiếng xe máy kìa: bim bim! Nhộn nhịp quá!'] },
              { x: 1080, lines: ['Thơm quá! Mùi bánh mì nóng giòn từ xe đẩy đó.', 'Bánh mì là món ăn sáng rất quen thuộc ở Việt Nam.'] }
            ]
          },
          {
            id: 'vietnam-saigon-2', name: 'Chợ Bến Thành', width: 2300, spawn: { x: 70, y: 420 }, goal: 5,
            platforms: [[0, 480, 1000, 60], [1090, 480, 1210, 60], [260, 400, 180, 18], [500, 335, 160, 18], [750, 400, 170, 18],
              [970, 395, 150, 18], [1250, 400, 180, 18], [1500, 335, 160, 18], [1750, 400, 170, 18], [1990, 340, 150, 18]],
            pizzas: [[180, 440], [350, 360], [580, 295], [835, 360], [1045, 355], [1340, 360], [1580, 295], [1835, 360], [2030, 300]],
            coins: [[460, 440], [490, 440], [1180, 440], [1210, 440], [1680, 440]],
            enemies: [roach(880, 50, 60), roach(1650, 60, 60)],
            exit: { x: 2180 },
            pages: [{ card: 'sg_market', x: 690, y: 440 }, { card: 'sg_cangio', x: 2100, y: 292 }],
            quizGate: { quiz: 'q_sg_market' },
            checkpoints: [1200],
            comicTriggers: [{ x: 1150, comic: 'saigon_market', once: true }],
            guideSpots: [
              { x: 220, lines: ['Chợ Bến Thành có đủ thứ: quần áo, đồ ăn, trái cây…', 'Cổng chính của chợ có tháp đồng hồ rất dễ nhận ra!'] },
              { x: 1420, lines: ['Thành phố còn có rừng Cần Giờ, nhà của rất nhiều chú khỉ.', 'Rừng ngập mặn giúp che chắn bờ biển và là nhà của nhiều con vật.'] }
            ]
          }
        ]
      },

      // =====================================================================
      // MIỀN TÂY
      // =====================================================================
      {
        id: 'mientay', name: 'Miền Tây sông nước', emoji: '🛶', sceneryTheme: 'vietnam-mientay', music: 'garden',
        intro: 'mientay_intro',
        boss: { bossId: 'trio' },
        levels: [
          {
            id: 'vietnam-mientay-1', name: 'Chợ nổi Cái Răng', width: 2300, spawn: { x: 70, y: 420 }, goal: 5,
            platforms: [[0, 480, 800, 60], [890, 480, 700, 60], [1680, 480, 620, 60], [280, 400, 180, 18], [520, 335, 160, 18],
              [770, 395, 150, 18], [1050, 400, 180, 18], [1290, 335, 170, 18], [1560, 395, 150, 18], [1830, 400, 170, 18], [2060, 340, 140, 18]],
            pizzas: [[190, 440], [370, 360], [600, 295], [845, 355], [1140, 360], [1330, 295], [1635, 355], [1915, 360], [2130, 300]],
            coins: [[480, 440], [700, 440], [960, 440], [1240, 440], [1770, 440], [1990, 440]],
            enemies: [roach(640, 60), roach(1220, 50)],
            exit: { x: 2180 },
            pages: [{ card: 'mt_floating', x: 980, y: 440 }, { card: 'mt_fruit', x: 1420, y: 288 }],
            quizGate: { quiz: 'q_mt_floating', x: 1500 },
            checkpoints: [1150],
            guideSpots: [
              { x: 220, lines: ['Chợ nổi Cái Răng ở Cần Thơ đây! Thuyền nào cũng chở đầy hàng.', 'Nhìn cây sào cao kìa: treo trái gì là bán trái đó!'] },
              { x: 1780, charId: 'buffalo', lines: ['Nghé ọ! Trâu Con chào bạn!', 'Ở miền quê, trâu giúp các bác nông dân cày ruộng đó.'] }
            ]
          },
          {
            id: 'vietnam-mientay-2', name: 'Dòng Mê Kông', width: 2400, spawn: { x: 70, y: 420 }, goal: 5,
            platforms: [[0, 480, 900, 60], [990, 480, 700, 60], [1780, 480, 620, 60], [280, 400, 180, 18], [520, 335, 160, 18],
              [870, 395, 150, 18], [1100, 400, 180, 18], [1340, 335, 170, 18], [1660, 395, 150, 18], [1920, 400, 170, 18], [2120, 340, 120, 18]],
            pizzas: [[190, 440], [370, 360], [600, 295], [945, 355], [1190, 360], [1380, 295], [1735, 355], [2005, 360], [2150, 300]],
            coins: [[480, 440], [760, 440], [1050, 440], [1560, 440], [1860, 440], [2240, 440]],
            enemies: [roach(700, 60), roach(1500, 60), roach(2060, 40, 50)],
            exit: { x: 2280 },
            pages: [{ card: 'mt_mekong', x: 1050, y: 440 }, { card: 'mt_rice', x: 2215, y: 290 }],
            quizGate: { quiz: 'q_mt_mekong' },
            checkpoints: [1200],
            guideSpots: [
              { x: 220, lines: ['Đây là sông Mê Kông, dòng sông dài chảy qua sáu nước.', 'Nước sông màu nâu vì chở nhiều phù sa, giúp ruộng đồng tốt tươi.'] },
              { x: 1840, charId: 'buffalo', lines: ['Bộ ba gián trốn ở cuối dòng sông đó! Cố lên nào!', 'Nhìn ruộng lúa vàng óng kìa! Gạo ở đây thơm ngon lắm.'] }
            ]
          }
        ]
      }
    ]
  });
})();
