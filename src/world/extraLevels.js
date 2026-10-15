/* Màn chơi bổ sung của bản đồ thế giới (Tầng hầm, Phòng tắm, Gác mái).
 * Chủ sở hữu: agent World & Quests (src/world/).
 *
 * Định dạng: LevelDef chuẩn (docs/ARCHITECTURE.md mục 7) + vài field mở rộng chỉ World đọc:
 *   zone: tên khu vực trong nhà, mapStyle: kiểu vẽ ô trên bản đồ, bonus: true (màn phụ, không bắt buộc để thắng).
 * Mỗi màn có `requires` tường minh (rẽ nhánh từ màn chính) và `final: false` tường minh —
 * vì các màn này được thêm vào CUỐI OG.Data.levels, nếu không ghi final:false thì
 * OG.Progress.isFinal() sẽ coi màn cuối danh sách là màn chiến thắng.
 *
 * File này chỉ khai báo dữ liệu + gọi OG.Data.registerLevel lúc load (được phép theo hợp đồng),
 * KHÔNG đụng OG.Save. Phải load TRƯỚC src/core/main.js (để Progress.init thấy các màn này).
 * Vật lý tham chiếu: nhảy cao ~116px, bay ngang ~200px → bục cách nhau ≤ 70px theo chiều cao. */
(function () {
  'use strict';
  var OG = window.OG;
  var World = (OG.World = OG.World || {});

  var EXTRA_LEVELS = [
    {
      id: 'basement', name: 'Tầng hầm tối om', icon: '🕯️', theme: 'lair', music: 'lair',
      zone: 'Tầng hầm', mapStyle: 'basement', bonus: true,
      width: 2000, spawn: { x: 70, y: 420 }, goal: 7,
      platforms: [
        [0, 480, 2000, 60],
        [220, 400, 140, 18], [420, 330, 140, 18], [640, 400, 160, 18], [860, 320, 140, 18],
        [1080, 250, 130, 18], [1290, 330, 150, 18], [1520, 400, 160, 18], [1740, 330, 140, 18]
      ],
      pizzas: [[150, 440], [290, 360], [490, 290], [720, 360], [930, 280], [1145, 210], [1365, 290], [1600, 360], [1810, 290]],
      coins: [[380, 440], [410, 440], [600, 300], [1040, 430], [1070, 430], [1250, 200], [1460, 440], [1700, 440]],
      enemies: [
        { type: 'roach', x: 500, speed: 87 },
        { type: 'roach', x: 1000, speed: 87 },
        { type: 'roach', x: 1400, speed: 87 },
        { type: 'roach', x: 1700, range: 80, speed: 87 },
        // gián đứng trên bục (y = mặt bục − 28)
        { type: 'roach', x: 1345, y: 302, range: 45, speed: 60 }
      ],
      exit: { x: 1880 },
      boss: null,
      requires: ['kitchen'],
      final: false,
      map: { x: 300, y: 470 },
      quests: [
        { id: 'basement_stomp', type: 'stomp_n', target: 5, text: 'Giẫm bẹp 5 con gián trong bóng tối', reward: 30 },
        { id: 'basement_coins', type: 'coins_n', target: 6, text: 'Nhặt 6 đồng xu', reward: 25 }
      ]
    },
    {
      id: 'bathroom', name: 'Phòng tắm trơn trượt', icon: '🛁', theme: 'kitchen', music: 'kitchen',
      zone: 'Phòng tắm', mapStyle: 'bathroom', bonus: true,
      width: 2200, spawn: { x: 70, y: 420 }, goal: 8,
      platforms: [
        [0, 480, 2200, 60],
        [200, 400, 130, 18], [400, 330, 130, 18], [600, 260, 130, 18], [820, 330, 150, 18], [1040, 400, 150, 18],
        [1250, 330, 130, 18], [1450, 260, 130, 18], [1660, 330, 140, 18], [1880, 400, 140, 18]
      ],
      pizzas: [[130, 440], [265, 360], [465, 290], [665, 220], [895, 290], [1115, 360], [1315, 290], [1515, 220], [1730, 290], [1950, 360]],
      coins: [[560, 440], [590, 440], [620, 440], [980, 250], [1400, 440], [1430, 440], [1610, 200], [2050, 440]],
      enemies: [
        { type: 'roach', x: 350, speed: 99 },
        { type: 'roach', x: 760, speed: 99 },
        { type: 'roach', x: 1180, speed: 99 },
        { type: 'roach', x: 1600, speed: 99 },
        { type: 'roach', x: 1950, range: 80, speed: 99 },
        { type: 'roach', x: 878, y: 302, range: 40, speed: 60 }
      ],
      exit: { x: 2080 },
      boss: null,
      requires: ['garden'],
      final: false,
      map: { x: 540, y: 420 },
      quests: [
        { id: 'bathroom_fast', type: 'time_under', target: 70, text: 'Về đích dưới 70 giây', reward: 30 },
        { id: 'bathroom_all_pizza', type: 'collect_all', text: 'Ăn sạch 10 miếng pizza', reward: 30 }
      ]
    },
    {
      id: 'attic', name: 'Gác mái bụi bặm', icon: '📦', theme: 'roof', music: 'roof',
      zone: 'Gác mái', mapStyle: 'attic', bonus: true,
      width: 2400, spawn: { x: 70, y: 420 }, goal: 9,
      platforms: [
        [0, 480, 2400, 60],
        [230, 400, 140, 18], [440, 330, 120, 18], [640, 400, 120, 18], [830, 330, 120, 18], [1020, 260, 120, 18],
        [1220, 330, 120, 18], [1420, 260, 120, 18], [1620, 190, 120, 18], [1820, 260, 120, 18], [2020, 330, 120, 18],
        [2200, 400, 110, 18]
      ],
      pizzas: [[160, 440], [300, 360], [500, 290], [700, 360], [890, 290], [1080, 220], [1280, 290], [1480, 220], [1680, 150], [1880, 220], [2080, 290], [2255, 360]],
      coins: [[400, 440], [600, 440], [780, 440], [970, 440], [1170, 440], [1370, 440], [1580, 440], [1780, 440], [1980, 440]],
      enemies: [
        { type: 'roach', x: 520, speed: 111 },
        { type: 'roach', x: 900, speed: 111 },
        { type: 'roach', x: 1300, speed: 111 },
        { type: 'roach', x: 1700, speed: 111 },
        { type: 'roach', x: 2100, range: 90, speed: 111 },
        { type: 'roach', x: 1063, y: 232, range: 22, speed: 50 }
      ],
      exit: { x: 2280 },
      boss: null,
      requires: ['roof'],
      final: false,
      map: { x: 790, y: 140 },
      quests: [
        { id: 'attic_no_damage', type: 'no_damage', text: 'Băng qua gác mái không bị thương', reward: 40 },
        { id: 'attic_stomp', type: 'stomp_n', target: 6, text: 'Giẫm bẹp 6 con gián', reward: 35 }
      ]
    }
  ];

  World.extraLevels = EXTRA_LEVELS;

  // Đăng ký vào dữ liệu chung (idempotent: registerLevel ghi đè theo id).
  World.registerExtraLevels = function () {
    if (!OG.Data || typeof OG.Data.registerLevel !== 'function') return false;
    EXTRA_LEVELS.forEach(function (l) { OG.Data.registerLevel(l); });
    return true;
  };
  World.registerExtraLevels();
})();
