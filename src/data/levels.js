/* OG.Data.levels — dữ liệu màn chơi. Chủ sở hữu: agent Tích hợp.
 *
 * Định dạng một màn (LevelDef):
 * {
 *   id: 'kitchen',              // khoá duy nhất (dùng trong Save, World, Quests)
 *   name: 'Nhà bếp náo loạn',   // tên hiển thị
 *   icon: '🍳',                 // emoji cho HUD / bản đồ
 *   theme: 'kitchen',           // Sprites.drawBackground/drawPlatform dùng: kitchen | garden | roof | lair
 *   music: 'kitchen',           // trackId gợi ý cho Audio
 *   width: 1900,                // chiều rộng thế giới (px); chiều cao luôn 540
 *   spawn: {x:70, y:420},       // vị trí xuất phát (góc trên-trái hitbox)
 *   goal: 5,                    // số pizza cần để mở cửa
 *   platforms: [[x,y,w,h],...], // nền một chiều; phần tử đầu là sàn (y=480)
 *   pizzas: [[x,y],...],        // vị trí pizza (tâm)
 *   coins: [[x,y],...],         // vị trí xu (tâm) — 1 xu + 10 điểm
 *   enemies: [{type:'roach', x, range:100, speed:75, dir:-1}],
 *   exit: {x:1780},             // cửa ra (EXIT), qua khi player.x > exit.x
 *   boss: 'deedee' | null,      // boss sau khi qua cửa (OG.Bosses); null = không có
 *   requires: ['kitchen'],      // màn cần hoàn thành để mở khoá (mặc định: màn liền trước)
 *   final: true,                // hoàn thành màn này = chiến thắng (mặc định: màn cuối danh sách)
 *   map: {x, y},                // vị trí nút trên bản đồ thế giới (toạ độ 960x540)
 *   quests: [{id, type, target, text, reward}] // nhiệm vụ của màn (OG.Quests diễn giải)
 * }
 * Loại quest chuẩn: collect_all | no_damage | stomp_n | time_under | coins_n | boss_no_damage | complete
 */
(function () {
  'use strict';
  var OG = window.OG;
  var Data = (OG.Data = OG.Data || {});

  Data.levels = [
    {
      id: 'kitchen', name: 'Nhà bếp náo loạn', icon: '🍳', theme: 'kitchen', music: 'kitchen',
      width: 1900, spawn: { x: 70, y: 420 }, goal: 5,
      platforms: [[0, 480, 1900, 60], [260, 405, 150, 18], [500, 345, 160, 18], [760, 415, 170, 18], [1030, 350, 160, 18], [1300, 410, 180, 18], [1570, 340, 160, 18]],
      pizzas: [[180, 440], [315, 365], [555, 305], [820, 375], [1090, 310], [1370, 370], [1630, 300]],
      coins: [[440, 415], [470, 415], [960, 420], [990, 420], [1240, 415], [1520, 290]],
      enemies: [{ type: 'roach', x: 620, speed: 75 }, { type: 'roach', x: 1120, speed: 75 }, { type: 'roach', x: 1490, speed: 75 }],
      exit: { x: 1780 },
      boss: 'deedee',
      map: { x: 150, y: 400 },
      quests: [
        { id: 'kitchen_all_pizza', type: 'collect_all', text: 'Ăn sạch 7 miếng pizza', reward: 20 },
        { id: 'kitchen_no_damage', type: 'no_damage', text: 'Qua màn không bị thương', reward: 30 }
      ]
    },
    {
      id: 'garden', name: 'Khu vườn bí mật', icon: '🌳', theme: 'garden', music: 'garden',
      width: 2100, spawn: { x: 70, y: 420 }, goal: 6,
      platforms: [[0, 480, 2100, 60], [230, 395, 160, 18], [490, 330, 170, 18], [770, 395, 180, 18], [1050, 320, 170, 18], [1330, 390, 180, 18], [1610, 315, 180, 18], [1870, 390, 130, 18]],
      pizzas: [[160, 440], [280, 355], [550, 290], [830, 355], [1110, 280], [1390, 350], [1670, 275], [1910, 350]],
      coins: [[420, 420], [700, 420], [990, 415], [1020, 415], [1560, 420], [1810, 420]],
      enemies: [{ type: 'roach', x: 400, speed: 87 }, { type: 'roach', x: 900, speed: 87 }, { type: 'roach', x: 1260, speed: 87 }, { type: 'roach', x: 1740, speed: 87 }],
      exit: { x: 1980 },
      boss: 'marky',
      map: { x: 380, y: 300 },
      quests: [
        { id: 'garden_stomp', type: 'stomp_n', target: 3, text: 'Giẫm bẹp 3 con gián', reward: 25 },
        { id: 'garden_fast', type: 'time_under', target: 60, text: 'Về đích dưới 60 giây', reward: 30 }
      ]
    },
    {
      id: 'roof', name: 'Cuộc đua trên mái nhà', icon: '🏠', theme: 'roof', music: 'roof',
      width: 2300, spawn: { x: 70, y: 420 }, goal: 7,
      platforms: [[0, 480, 2300, 60], [260, 400, 150, 18], [520, 335, 160, 18], [790, 400, 160, 18], [1060, 330, 160, 18], [1330, 390, 170, 18], [1620, 320, 170, 18], [1900, 390, 170, 18], [2160, 320, 120, 18]],
      pizzas: [[170, 440], [310, 360], [580, 295], [850, 360], [1120, 290], [1390, 350], [1680, 280], [1960, 350], [2190, 280]],
      coins: [[460, 300], [720, 420], [1000, 300], [1270, 300], [1560, 420], [2110, 300]],
      enemies: [{ type: 'roach', x: 450, speed: 99 }, { type: 'roach', x: 970, speed: 99 }, { type: 'roach', x: 1460, speed: 99 }, { type: 'roach', x: 1810, speed: 99 }, { type: 'roach', x: 2080, speed: 99 }],
      exit: { x: 2210 },
      boss: 'joey',
      map: { x: 610, y: 220 },
      quests: [
        { id: 'roof_coins', type: 'coins_n', target: 5, text: 'Nhặt 5 đồng xu', reward: 25 },
        { id: 'roof_boss_clean', type: 'boss_no_damage', text: 'Hạ Joey mà không bị thương', reward: 50 }
      ]
    },
    {
      id: 'lair', name: 'Hang ổ bộ ba gián', icon: '🪳', theme: 'lair', music: 'lair',
      width: 2400, spawn: { x: 70, y: 420 }, goal: 8,
      platforms: [[0, 480, 2400, 60], [230, 400, 150, 18], [480, 330, 150, 18], [740, 400, 150, 18], [990, 320, 150, 18], [1250, 250, 140, 18], [1500, 330, 160, 18], [1770, 400, 160, 18], [2030, 320, 150, 18], [2250, 390, 110, 18]],
      pizzas: [[150, 440], [305, 360], [555, 290], [815, 360], [1065, 280], [1320, 210], [1580, 290], [1850, 360], [2105, 280]],
      coins: [[420, 300], [680, 420], [940, 300], [1200, 420], [1450, 420], [1720, 300], [1990, 420]],
      enemies: [{ type: 'roach', x: 420, speed: 111 }, { type: 'roach', x: 900, speed: 111 }, { type: 'roach', x: 1180, speed: 111 }, { type: 'roach', x: 1420, speed: 111 }, { type: 'roach', x: 1700, speed: 111 }, { type: 'roach', x: 1960, speed: 111 }],
      exit: { x: 2300 },
      boss: 'trio',
      final: true,
      map: { x: 830, y: 330 },
      quests: [
        { id: 'lair_all_pizza', type: 'collect_all', text: 'Thu hồi toàn bộ 9 pizza', reward: 40 },
        { id: 'lair_complete', type: 'complete', text: 'Đánh bại cả bộ ba gián', reward: 100 }
      ]
    }
  ];

  // Tra cứu theo id hoặc chỉ số.
  Data.getLevel = function (idOrIndex) {
    if (typeof idOrIndex === 'number') return Data.levels[idOrIndex] || null;
    for (var i = 0; i < Data.levels.length; i++) if (Data.levels[i].id === idOrIndex) return Data.levels[i];
    return null;
  };
  Data.levelIndex = function (id) {
    for (var i = 0; i < Data.levels.length; i++) if (Data.levels[i].id === id) return i;
    return -1;
  };
  // Thêm màn mới (vd: màn thưởng do module khác định nghĩa). Trả về level.
  Data.registerLevel = function (level) {
    var i = Data.levelIndex(level.id);
    if (i >= 0) Data.levels[i] = level; else Data.levels.push(level);
    return level;
  };
})();
