# Lời giải — Bài 12: Data-driven (màn, câu đố, hành trình)

> ✋ **Hãy tự làm trước.** Lời giải chỉ là *một* cách làm. Nếu bài của bạn khác nhưng chạy đúng và giải thích được vì sao, bài đó vẫn đạt.
> Quay lại bài học: [12-data-driven-man-cau-do-hanh-trinh.md](../12-data-driven-man-cau-do-hanh-trinh.md)

Ba lời giải dưới đây áp dụng được **cùng lúc**. Tự kiểm tra sau mỗi bài: `node tests/smoke.js` phải XANH, `npx -y -p typescript@5.6.3 tsc -p jsconfig.json --noEmit` không in gì, và trong Console `OG.Journeys.validate('home')` (cùng `OG.Journeys.validate('ocean')` sau bài ⭐⭐⭐) không có lỗi lẫn cảnh báo.

---

## ⭐ Thẻ `k_teeth` và câu đố `q_teeth`

**1. Nội dung** trong [src/journeys/home/content.js](../../../src/journeys/home/content.js).

Thêm vào mảng `cards`, sau thẻ `k_hot`:

```js
      { id: 'k_teeth', areaId: 'kitchen', title: 'Răng trắng tinh', icon: '🪥',
        fact: 'Đánh răng hai lần mỗi ngày, buổi sáng và trước khi đi ngủ, giúp răng chắc khoẻ và không bị sâu.' },
```

Thêm vào mảng `quizzes`, sau câu `q_safe`:

```js
      { id: 'q_teeth', areaId: 'kitchen', cardId: 'k_teeth',
        question: 'Mỗi ngày em nên đánh răng mấy lần?',
        choices: [{ text: 'Một tuần một lần', icon: '📅' }, { text: 'Hai lần: sáng và tối', icon: '🪥' }],
        answer: 1, hint: 'Gợi ý: buổi sáng thức dậy và buổi tối trước khi ngủ.',
        explain: 'Đúng rồi! Đánh răng sáng và tối giúp răng luôn khoẻ.' },
```

**2. Đặt vào màn** `home-kitchen-2` trong [src/journeys/home/journey.js](../../../src/journeys/home/journey.js):

```js
            pages: [
              { card: 'k_fruit', x: 625, y: 300 },      // trên bục cao
              { card: 'k_hot', x: 1180, y: 440 },
              { card: 'k_teeth', x: 1250, y: 440 }      // MỚI
            ],
            quizGates: [{ quiz: 'q_vitc', x: 960 }, { quiz: 'q_teeth', x: 1600 }, { quiz: 'q_safe' }], // MỚI: q_teeth sau trang k_teeth
```

**Giải thích vị trí**

| Mốc (x, px thế giới) | Vật |
|---|---|
| 960 | cổng `q_vitc` (có sẵn) |
| 1180, 1250 | trang `k_hot`, trang **`k_teeth`** |
| **1600** | cổng **`q_teeth`**: sau trang chứa đáp án, trước cửa ra |
| 1780 | cửa EXIT (mượn từ màn `kitchen`) + cổng `q_safe` |

`validateLevel` chỉ kiểm tra `x < exit.x`. Còn quy tắc "cổng đặt sau trang sách chứa đáp án" là **quy tắc thiết kế** (ghi trong ⚠️ của journey.js), validate không tự bắt được. Người thiết kế phải tự giữ.

> **Vì sao không đặt vào `home-kitchen-1`?** Lần thử đầu tiên của lời giải đặt trang ở x = 1560 và cổng ở x = 1650 trong `home-kitchen-1`. Game chơi được, nhưng smoke test **đỏ**. Lý do: màn đầu tiên của mỗi hành trình được `detailedLevelChecks` kiểm tra kỹ hơn (dịch chuyển người chơi tới từng trang sách, rồi cho bị thương liên tục để thử hồi sinh), và lực đẩy lùi khi bị thương hất người chơi vào cổng mới. Câu đố bật lên giữa chừng làm kịch bản test lệch. Bài học rút ra: test đầu-cuối cũng mang **giả định** về dữ liệu. Khi test đỏ, hãy đọc kịch bản test để biết đó là lỗi game hay giả định của test (xem [Bài 13](../13-kiem-thu-ci.md)).

---

## ⭐⭐ Màn `home-kitchen-3`

Thêm vào **cuối** mảng `levels` của khu `kitchen` (sau `home-kitchen-2`):

```js
          {
            // Màn tự vẽ hình học. Là màn CUỐI khu → trận Dee Dee chuyển sang màn này.
            id: 'home-kitchen-3', name: 'Tráng miệng trái cây', icon: '🍉',
            width: 1800, spawn: { x: 70, y: 420 }, goal: 4,
            platforms: [[0, 480, 1800, 60], [300, 400, 160, 18], [560, 340, 160, 18], [840, 400, 170, 18],
              [1120, 340, 160, 18], [1400, 400, 170, 18]],
            pizzas: [[200, 440], [380, 360], [640, 300], [925, 360], [1200, 300], [1485, 360]],
            coins: [[1000, 440], [1600, 440]],
            enemies: [roach(760), roach(1300)],
            exit: { x: 1680 },
            pages: [{ card: 'k_water', x: 1050, y: 440 }],
            quizGate: { quiz: 'q_wash' },
            guideSpots: [{ x: 230, lines: ['Món tráng miệng ngon nhất là trái cây tươi!'] }],
            checkpoints: [900]
          }
```

**Kiểm tra thiết kế**

- Sàn `[0, 480, 1800, 60]` là `platforms[0]` (bất biến mà level.js dựa vào).
- Độ cao: sàn (480) → bục 400 là 80 px; bục 400 → bục 340 là 60 px. Cả hai đều dưới đỉnh nhảy ≈ 116 px.
- Pizza trên bục y = 400 đặt ở y = 360, trên bục y = 340 đặt ở y = 300 (cách mặt bục 40 px, là tâm pizza).
- 6 pizza, `goal: 4`: trẻ được bỏ sót 2 miếng mà vẫn qua màn.
- `exit.x = 1680 ≤ width − 40` (luật `EXIT_EDGE_MARGIN` trong validate).
- `roach(760)` dùng factory có sẵn của file: `range` mặc định 70, `speed` mặc định 45.

**Câu 1: trận Dee Dee ở đâu?** Ở `home-kitchen-3`. `compileAll` truyền `li === lvls.length - 1` làm tham số `isLastOfArea`, và `compileLevel` gắn `area.boss.bossId` vào màn cuối khu. Dữ liệu trùm nằm ở **khu**, không nằm ở màn, nên thêm màn vào cuối khu thì trùm tự "dời" theo. `OG.Journeys.getLevel('home-kitchen-2').boss` giờ là `null`.

**Câu 2: save của người chơi cũ.** `isLevelUnlocked` mở một màn khi **màn liền trước theo thứ tự hành trình** đã xong:

```js
      var ids = getCompiled().order[L.journey], i = ids.indexOf(levelId);
      return i <= 0 || isDone(ids[i - 1]);
```

Sau cập nhật, màn liền trước `home-garden-1` là `home-kitchen-3` (chưa chơi), nên **`home-garden-1` bị khoá lại** dù người chơi đã qua nó, và "Chơi tiếp" (`firstIncomplete`) đưa họ về `home-kitchen-3`. Dữ liệu save không hỏng (kỷ lục vẫn nằm trong `progress.levels`), chỉ là trải nghiệm bị "lùi". Cách xử lý tuỳ thiết kế:

- Chấp nhận: màn mới là nội dung bắt buộc.
- Thêm màn mới vào **cuối hành trình** (hoặc một khu mới ở cuối) để không chen vào giữa chuỗi mở khoá.
- Đổi luật mở khoá thành "màn đã từng xong thì luôn mở". Đây là sửa **engine** (`isLevelUnlocked`), cần cập nhật hợp đồng [docs/STORY.md](../../STORY.md).

Đây là cầu nối với [Bài 11](../11-luu-tru-migrate.md): thay đổi **dữ liệu nội dung** cũng có thể ảnh hưởng tới **dữ liệu người chơi**.

---

## ⭐⭐⭐ Hành trình mới `ocean`

### Danh sách file

| File | Việc |
|---|---|
| `src/journeys/ocean/theme.js` | **mới**: chủ đề `ocean-beach` |
| `src/journeys/ocean/content.js` | **mới**: 7 thẻ, 2 câu đố, truyện `intro` |
| `src/journeys/ocean/journey.js` | **mới**: 2 khu × 3 màn |
| `assets/photos/ocean/credits.js` | **mới**: danh sách ảnh rỗng (hợp đồng của `photoChecks`) |
| `index.html` | thêm 4 thẻ `<script>` |
| `docs/credits.html` | thêm 1 thẻ `<script>` |
| `tests/smoke.js` | thêm `'ocean'` vào `JOURNEYS` |

Không phải sửa file nào trong `src/core`, `src/game`, `src/story`. Đó chính là data-driven.

### `src/journeys/ocean/theme.js`

```js
// @ts-check
/* ============================================================================
 * Hành trình "ocean" — CHỦ ĐỀ CẢNH NỀN 'ocean-beach' (chỉ dữ liệu ThemeDef, không vẽ tay)
 * ----------------------------------------------------------------------------
 * Vai trò:      Đăng ký chủ đề bãi biển dùng cho khu 'shore'. Mọi lớp/decor là loại CÓ SẴN.
 * Khái niệm:    data-driven design · kế thừa chủ đề (base) · tái sử dụng decor của hành trình khác
 * Bài học:      docs/learn/12-data-driven-man-cau-do-hanh-trinh.md · docs/learn/08-camera-parallax.md
 * Phụ thuộc:    OG.Scenery.registerTheme (LOAD) · decor 'science-shell' (src/journeys/science/theme.js, nạp TRƯỚC)
 * Đọc tiếp:     src/journeys/ocean/content.js
 * ========================================================================== */
(function () {
  'use strict';
  var OG = window.OG;
  OG.Scenery.registerTheme('ocean-beach', {
    name: 'Bãi biển', base: 'garden',                 // thiếu phần nào thì mượn của 'garden'
    sky: { top: '#7fd3ff', bottom: '#fff2c4' },
    layers: [
      // Hai dải "đồi" màu nước biển: lớp xa cuộn chậm (parallax nhỏ) hơn lớp gần.
      { kind: 'hills', parallax: 0.15, y: 440, height: 30, color: '#4fb3e8', spacing: 360 },
      { kind: 'hills', parallax: 0.35, y: 470, height: 24, color: '#2f8fd0', spacing: 260 }
    ],
    platformStyle: { floor: { fill: '#e8c98a', top: '#fbe7b5', topH: 10 } },
    decor: [{ kind: 'science-shell', every: 700, start: 400, scale: 0.9 }]
  });
})();
```

> Lần thử đầu dùng `sceneryTheme: 'beach'` (tên lấy từ `@example` của `registerTheme`). Validate báo **cảnh báo** `chủ đề "beach" chưa đăng ký (sẽ vẽ nền mặc định)`. Nó chỉ là ví dụ trong JSDoc, chưa ai đăng ký. Cảnh báo không làm test đỏ, nhưng là dấu hiệu bạn đang tham chiếu một thứ không tồn tại.

### `src/journeys/ocean/content.js`

```js
// @ts-check
/* ============================================================================
 * Hành trình "ocean" (Đại dương xanh) — NỘI DUNG HỌC: THẺ, CÂU ĐỐ, TRUYỆN TRANH
 * ----------------------------------------------------------------------------
 * Vai trò:      Dữ liệu thuần: 7 thẻ kiến thức, 2 câu đố, 1 truyện mở đầu. Được GỘP với journey.js (cùng id).
 * Khái niệm:    data-driven design · tham chiếu chéo bằng id (thẻ ↔ câu đố ↔ màn)
 * Bài học:      docs/learn/12-data-driven-man-cau-do-hanh-trinh.md
 * Định dạng:    CardDef, QuizDef, PanelDef (src/types.d.ts)
 * Đọc tiếp:     src/journeys/ocean/journey.js
 * ========================================================================== */
(function () {
  'use strict';
  var OG = window.OG;

  OG.Journeys.register({
    id: 'ocean',
    // Thẻ dùng icon emoji (IconSpec dạng chuỗi) cho nhanh; muốn đẹp thì viết drawIcon như home/content.js.
    cards: [
      { id: 'o_turtle', areaId: 'shore', title: 'Rùa biển', icon: '🐢',
        fact: 'Rùa biển lên bãi cát để đẻ trứng. Rùa con nở ra sẽ bò ngay về phía biển.' },
      { id: 'o_plastic', areaId: 'shore', title: 'Biển sạch', icon: '🗑️',
        fact: 'Rác nhựa trôi ra biển có thể làm hại rùa và cá. Hãy bỏ rác vào thùng nhé!' },
      { id: 'o_salt', areaId: 'shore', title: 'Nước biển mặn', icon: '🧂',
        fact: 'Nước biển mặn vì có muối hoà tan. Vì vậy chúng ta không uống nước biển được.' },
      { id: 'o_crab', areaId: 'shore', title: 'Bạn cua', icon: '🦀',
        fact: 'Cua có mười chân và thường bò ngang. Lớp vỏ cứng giúp cua tự bảo vệ.' },
      { id: 'o_gills', areaId: 'reef', title: 'Cá thở bằng mang', icon: '🐟',
        fact: 'Cá thở bằng mang. Mang lấy khí ô-xy có trong nước nên cá sống được dưới nước.' },
      { id: 'o_coral', areaId: 'reef', title: 'San hô', icon: '🪸',
        fact: 'San hô trông giống đá nhưng thật ra là những con vật nhỏ xíu sống thành đàn.' },
      { id: 'o_whale', areaId: 'reef', title: 'Cá voi xanh', icon: '🐋',
        fact: 'Cá voi xanh là con vật lớn nhất trên Trái Đất. Nó thở bằng phổi nên phải ngoi lên mặt nước.' }
    ],
    quizzes: [
      { id: 'q_plastic', areaId: 'shore', cardId: 'o_plastic',
        question: 'Ăn kem xong ở bãi biển, em bỏ vỏ kem ở đâu?',
        choices: [{ text: 'Thả xuống biển', icon: '🌊' }, { text: 'Bỏ vào thùng rác', icon: '🗑️' }],
        answer: 1, hint: 'Gợi ý: rùa biển không thích ăn nhầm rác đâu!',
        explain: 'Đúng rồi! Bỏ rác đúng chỗ giúp biển luôn sạch.' },
      { id: 'q_gills', areaId: 'reef', cardId: 'o_gills',
        question: 'Cá thở bằng gì?',
        choices: [{ text: 'Bằng mang', icon: '🐟' }, { text: 'Bằng mũi', icon: '👃' }, { text: 'Bằng vây', icon: '🐠' }],
        answer: 0, hint: 'Gợi ý: hai bên đầu cá có khe nhỏ mở ra khép vào.',
        explain: 'Chính xác! Mang giúp cá lấy ô-xy từ nước.' }
    ],
    comics: {
      intro: [
        { bg: 'ocean-beach', chars: [{ id: 'oggy', anim: 'idle', x: 0.3 }, { id: 'olivia', anim: 'wave', x: 0.66, face: -1 }],
          bubbles: [{ who: 'olivia', text: 'Oggy ơi, ra biển chơi nào! Biển có bao nhiêu điều thú vị.' },
                    { who: 'oggy', text: 'Đi thôi! Mình mang theo cả sổ tay nữa.' }] }
      ]
    }
  });
})();
```

### `src/journeys/ocean/journey.js`

```js
// @ts-check
/* ============================================================================
 * Hành trình "ocean" (Đại dương xanh) — CẤU TRÚC: 2 KHU × 3 MÀN
 * ----------------------------------------------------------------------------
 * Vai trò:      Khung hành trình: thông tin chung, khu, màn. Mọi màn MƯỢN hình học màn v1 bằng `from`
 *               nên chỉ cần ghi phần học tập (pages, quizGate, guideSpots).
 * Khái niệm:    data-driven design · kế thừa dữ liệu bằng `from` · factory cho dữ liệu
 * Bài học:      docs/learn/12-data-driven-man-cau-do-hanh-trinh.md
 * Định dạng:    JourneyDef → AreaDef → LevelDef (src/types.d.ts)
 * Đọc tiếp:     src/core/journeys.js (compileLevel, validateDef)
 * ========================================================================== */
(function () {
  'use strict';
  var OG = window.OG;

  /** @param {number} x @returns {EnemySpawn} gián hiền, toạ độ thế giới px */
  function roach(x) { return { type: 'roach', x: x, range: 60, speed: 45 }; }

  OG.Journeys.register({
    id: 'ocean',
    order: 5,
    title: 'Đại dương xanh',
    emoji: '🌊',
    description: 'Cùng Olivia khám phá bãi biển và rạn san hô!',
    guide: { charId: 'olivia', name: 'Olivia' },
    palette: { primary: '#1f8fd6', secondary: '#38c3b5', accent: '#ffd166', bg: '#eaf8ff', ink: '#17233d' },
    intro: 'intro',
    ending: { title: 'BIỂN XANH THẬT ĐẸP! 🌊', text: 'Bạn đã hiểu thêm về biển và các bạn sinh vật biển.' },
    areas: [
      {
        id: 'shore', name: 'Bãi biển', emoji: '🏖️', sceneryTheme: 'ocean-beach', music: 'garden',
        levels: [
          { id: 'ocean-shore-1', name: 'Dấu chân rùa con', icon: '🐢', from: 'kitchen', goal: 3,
            enemies: [roach(1000)],
            pages: [{ card: 'o_turtle', x: 470, y: 440 }, { card: 'o_plastic', x: 1150, y: 440 }],
            quizGate: { quiz: 'q_plastic' },   // bỏ x = cổng ở cửa EXIT, SAU trang o_plastic
            guideSpots: [{ x: 230, lines: ['Chào bạn! Hôm nay mình đi biển nhé!', 'Nhặt trang sách 📄 để mở thẻ kiến thức.'] }],
            checkpoints: [900] },
          { id: 'ocean-shore-2', name: 'Sóng vỗ rì rào', icon: '🌊', from: 'garden', goal: 3,
            enemies: [roach(900)],
            pages: [{ card: 'o_salt', x: 700, y: 440 }] },
          { id: 'ocean-shore-3', name: 'Lâu đài cát', icon: '🏰', from: 'bathroom', goal: 3,
            enemies: [roach(1200)],
            pages: [{ card: 'o_crab', x: 650, y: 440 }] }   // ⚠️ mỗi màn hành trình nên có ≥ 1 trang (smoke test kiểm HUD 📖)
        ]
      },
      {
        id: 'reef', name: 'Rạn san hô', emoji: '🪸', sceneryTheme: 'science-ocean', music: 'garden',
        boss: { bossId: 'deedee' },          // trùm gắn vào màn CUỐI khu (ocean-reef-3)
        levels: [
          { id: 'ocean-reef-1', name: 'Đàn cá nhỏ', icon: '🐟', from: 'roof', goal: 3,
            enemies: [roach(1100)],
            pages: [{ card: 'o_gills', x: 600, y: 440 }],
            quizGate: { quiz: 'q_gills', x: 1500 } },   // x < exit.x (2210) và SAU trang o_gills (600)
          { id: 'ocean-reef-2', name: 'Vườn san hô', icon: '🪸', from: 'attic', goal: 3,
            enemies: [roach(1300)],
            pages: [{ card: 'o_coral', x: 800, y: 440 }] },
          { id: 'ocean-reef-3', name: 'Bài hát cá voi', icon: '🐋', from: 'lair', goal: 3,
            enemies: [roach(1400)],
            pages: [{ card: 'o_whale', x: 900, y: 440 }] }
        ]
      }
    ]
  });
})();
```

Nếu đã làm bài tập ⭐⭐ của [Bài 10](10-web-audio.md) (bản nhạc `beach`), đổi `music: 'garden'` của khu `shore` thành `music: 'beach'`.

### `assets/photos/ocean/credits.js`

```js
/* Ảnh chụp thực tế cho thẻ kiến thức — hành trình "ocean" (chưa có ảnh nào).
 * Khi có ảnh: python tools/photos/fetch_commons.py write ocean  (công cụ ghi lại khối bên dưới).
 */
OG.Photos.register("ocean", /* BEGIN-ENTRIES */ {} /* END-ENTRIES */);
```

### Nối dây

[index.html](../../../index.html): thêm dòng credits ngay sau `assets/photos/science/credits.js`, và 3 dòng hành trình ngay sau `src/journeys/science/journey.js`:

```html
<script src="assets/photos/ocean/credits.js"></script>
```

```html
<script src="src/journeys/ocean/theme.js"></script>
<script src="src/journeys/ocean/content.js"></script>
<script src="src/journeys/ocean/journey.js"></script>
```

[docs/credits.html](../../../docs/credits.html): sau dòng `../assets/photos/science/credits.js`:

```html
<script src="../assets/photos/ocean/credits.js"></script>
```

[tests/smoke.js](../../../tests/smoke.js):

```js
const JOURNEYS = ['home', 'vietnam', 'world', 'science', 'ocean'];
```

> Để ý: check của sổ tay so sánh với `JOURNEYS.length`, nhưng thông báo lỗi của nó vẫn viết cứng chữ "đủ 4 hành trình". Thông báo test cũng là code và cũng có thể "cũ". Nếu sửa, hãy ghép số từ `JOURNEYS.length` vào chuỗi.

### Hành trình này phải thoả những hợp đồng nào?

Mỗi hợp đồng dưới đây được tìm ra bằng cách **chạy smoke test và đọc lỗi**, không phải đoán trước:

| Hợp đồng | Ai kiểm tra | Nếu vi phạm |
|---|---|---|
| Danh sách hành trình đúng bằng `JOURNEYS` | `journeyChecks` | "Danh sách hành trình khác mong đợi" |
| ≥ 6 màn | `journeyChecks` | "Hành trình ocean quá ít màn" |
| Có truyện `intro` | `playJourney` (`expectScene('comic', ...)`) | "Mong đợi scene comic" |
| Mọi màn có ≥ 1 trang sách | `playJourney` (HUD 📖) | "HUD DOM không hiện số trang sách" (lần thử đầu, `ocean-shore-3` có `pages: []`) |
| `assets/photos/ocean/credits.js` nạp **sau** `photos.js` và có khối `BEGIN-ENTRIES/END-ENTRIES` | `photoChecks` | "Thiếu assets/photos/ocean/credits.js" |
| `docs/credits.html` nạp file credits | `photoChecks` | "docs/credits.html chưa nạp ..." |
| Id màn có tiền tố `ocean-`, `goal ≤` số pizza, tham chiếu id đúng... | `OG.Journeys.validate` | hành trình bị ẩn + lỗi có đường dẫn |

**Không** phải sửa [.github/workflows/pages.yml](../../../.github/workflows/pages.yml): bước đóng gói đã `cp -r` cả `src`, `docs` và `assets`.

**Vì sao `from` giúp rất nhiều?** Sáu màn chỉ tốn khoảng 25 dòng dữ liệu, vì bục, pizza, xu và cửa ra đều mượn của màn cổ điển. `from` chỉ chép các field trong `GEOMETRY`, không chép `boss`, `quests` hay `theme` của màn gốc. Vì vậy `ocean-reef-3` (mượn `lair`, vốn có trùm `trio`) vẫn đấu với trùm của **khu** là Dee Dee, và vẫn dùng cảnh nền `science-ocean` của khu.

Smoke test chạy lâu hơn một chút, vì nó chơi trọn cả hành trình mới: đọc truyện, nhặt trang, trả lời câu đố (sai rồi đúng), đánh trùm, mở sổ tay.
