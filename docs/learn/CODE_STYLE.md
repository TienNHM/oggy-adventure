# Quy ước comment & code cho giáo trình Oggy Adventure

Tài liệu này là **chuẩn chung** cho mọi người (và mọi agent) khi comment, refactor nhẹ và bổ sung kiểu cho code trong `src/`.
Mục tiêu: sinh viên đại học **đã biết JavaScript cơ bản** (biến, hàm, mảng, object, DOM) đọc code để học **khái niệm làm game**
và **design pattern**, rồi tự code theo.

- File mẫu tham chiếu (đã áp dụng đầy đủ chuẩn): [`src/core/loop.js`](../../src/core/loop.js) và [`src/core/events.js`](../../src/core/events.js).
- Hợp đồng API vẫn là [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) và [`docs/STORY.md`](../STORY.md). Comment **không được** mâu thuẫn với hai tài liệu này.
- Kiểu dữ liệu dùng chung: [`src/types.d.ts`](../../src/types.d.ts). Cấu hình kiểm tra kiểu: [`jsconfig.json`](../../jsconfig.json).

---

## 0. Ràng buộc không đổi

- Không build step, không thư viện ngoài, chạy được qua `file://` → **không** ES modules (`import`/`export`), mỗi file vẫn là IIFE gắn vào `window.OG`.
- Font: dùng `OG.font(px, weight)` / `OG.FONT`. Không dùng Trebuchet MS (smoke test quét cả comment trong `src/`, nên **đừng gõ tên font đó** trong comment).
- Văn bản trong game, comment và tài liệu viết **tiếng Việt có dấu**.
- Sau mỗi file sửa: `node --check <file>`. Trước khi bàn giao: `node tests/smoke.js` phải **XANH**.
- Git: không tự `add/commit/checkout/stash/reset`.

---

## 1. Ngôn ngữ trong comment

- Viết tiếng Việt có dấu, câu ngắn, giọng giảng giải ("ta", "mình" đều được, thống nhất trong file).
- **Thuật ngữ kỹ thuật giữ tiếng Anh**, lần đầu xuất hiện TRONG FILE thì kèm giải nghĩa trong ngoặc:
  `delta time (khoảng thời gian giữa 2 frame)`, `hitbox (hình chữ nhật dùng để xét va chạm)`, `telegraph (báo hiệu trước đòn)`.
  Từ lần thứ hai chỉ cần thuật ngữ.
- Đơn vị luôn ghi rõ: **giây** (thời gian game), **ms** (timestamp trình duyệt), **px** (toạ độ logic 960×540), **px/giây** (vận tốc), **px/giây²** (gia tốc).
- Toạ độ: nói rõ **thế giới** (world, đã cộng camera) hay **màn hình** (screen, 0..960). Nói rõ gốc toạ độ (góc trên-trái hay tâm, chân).

---

## 2. KHỐI ĐẦU FILE (bắt buộc)

Mọi file `.js` trong `src/` mở đầu bằng khối dưới đây. Nếu file sạch lỗi kiểu thì dòng 1 là `// @ts-check` (xem mục 7).

```js
// @ts-check
/* ============================================================================
 * OG.TênModule — MÔ TẢ NGẮN BẰNG CHỮ HOA (thuật ngữ tiếng Anh nếu có)
 * ----------------------------------------------------------------------------
 * Vai trò:      1–3 câu: module này làm gì TRONG GAME, ai gọi nó, khi nào.
 * Khái niệm:    các khái niệm / pattern file này minh hoạ, ngăn bằng " · "
 * Bài học:      docs/learn/NN-ten-bai.md (có thể nhiều bài)
 * Phụ thuộc:    OG.X, OG.Y.fn (đọc lúc LOAD hay lúc CHẠY — ghi rõ nếu quan trọng cho thứ tự <script>)
 * Event:        phát: 'a:b', 'c:d' · nghe: 'e:f'   (hoặc "(không)")
 * API công khai: OG.TênModule.fn1(...), OG.TênModule.fn2(...)   (rút gọn; chi tiết ở JSDoc từng hàm)
 * Đọc tiếp:     src/... (file nên đọc tiếp theo và lý do, theo thứ tự)
 * [Tuỳ chọn]
 * Kiểm tra kiểu: không bật @ts-check vì <lý do cụ thể, vd "~40 lỗi do OG.Sprites kit động">
 * Dữ liệu:      cấu trúc chính (tham chiếu @typedef trong src/types.d.ts)
 * ========================================================================== */
```

Quy tắc:
- Giữ thông tin hữu ích đã có trong comment cũ (danh sách hợp đồng, thứ tự vẽ, ghi chú v2...). Được **sắp xếp lại** vào khối mới hoặc
  để ngay bên dưới khối thành đoạn "Hợp đồng:", không được xoá mất.
- Dòng "Chủ sở hữu: agent ..." cũ có thể bỏ (không còn ý nghĩa với sinh viên) — giữ nếu file vẫn đang chia việc theo agent.
- File dữ liệu thuần (vd `src/journeys/*/content.js`) dùng khối rút gọn: Vai trò, Khái niệm (data-driven), Bài học, Định dạng (typedef), Đọc tiếp.
- File CSS/HTML không bắt buộc khối này; nếu có comment thì theo mục 4.

---

## 3. JSDoc cho hàm & dữ liệu

### 3.1 Hàm công khai (gắn vào `OG.*`) — bắt buộc

```js
/**
 * Một câu mô tả hàm làm gì (động từ ở đầu). Câu thứ hai (tuỳ chọn) nói khi nào dùng / điều kiện.
 * @param {PhysicsBody} body   vật thể cần di chuyển (bị SỬA trực tiếp)
 * @param {number} dt           delta time, giây
 * @param {Platform[]} platforms
 * @param {{gravity?: number, maxFall?: number, minX?: number, maxX?: number}} [opts]  tham số tuỳ chọn
 * @returns {MoveResult} landed = vừa chạm đất ở frame này
 * @example
 *   var r = OG.Physics.moveBody(p, dt, st.platforms, { maxX: st.width });
 *   if (r.landed) OG.Events.emit(OG.EV.PLAYER_LAND, { x: p.x, y: p.y, vy: 0 });
 */
```

- `@param {type} name mô tả` — mô tả nói **ý nghĩa + đơn vị**, không lặp lại tên. Tham số tuỳ chọn: `[name]`; có mặc định: `[name=0]`.
- `@returns` — bỏ nếu hàm không trả gì.
- `@example` — thêm khi cách gọi không hiển nhiên (callback, object tuỳ chọn, giá trị trả về đặc biệt). Ví dụ phải **chạy được thật**.
- Nếu hàm **sửa tham số** (mutate) hoặc **phát event**, nói rõ trong mô tả.
- Kiểu cơ bản: `number`, `string`, `boolean`, `Object`, `Function`, `any`, `CanvasRenderingContext2D`, `HTMLElement`, mảng `T[]`, hợp `A|B`, object nội tuyến `{x:number, y:number}`.

### 3.2 Hàm nội bộ (trong IIFE)

- Hàm ngắn, tên rõ: **không cần** JSDoc.
- Hàm dài / thuật toán / nhận nhiều tham số: JSDoc ngắn (mô tả + `@param`) là đủ.

### 3.3 Kiểu dữ liệu (`@typedef`)

- Cấu trúc **dùng ở nhiều file** khai báo một lần trong `src/types.d.ts` (đã có): `AABB, PhysicsBody, MoveResult, Platform, Vec2, Scene,
  OGListener, Unsubscribe, LevelDef, EnemySpawn, QuestDef, LevelHook, Player, Enemy, EnemyTypeDef, Arena, BossInstance, BossDef,
  JourneyDef, AreaDef, CardDef, QuizDef, PanelDef, IconSpec, DrawIconFn, ValidateResult, ThemeDef, SceneryLayer, PlatformPaint, DecorFn`.
  Dùng thẳng tên trong JSDoc: `@param {LevelDef} level`.
- Cấu trúc **chỉ dùng trong 1 file** khai báo ngay trong file đó, ngay dưới khối đầu file:
  ```js
  /**
   * @typedef {Object} CachedFrame  khung hình đã vẽ sẵn vào canvas phụ
   * @property {HTMLCanvasElement} canvas
   * @property {number} ox  độ lệch gốc vẽ theo x (px)
   * @property {number} bytes  ước lượng bộ nhớ để LRU loại bỏ
   */
  ```
- Muốn thêm kiểu dùng chung mới → thêm vào `src/types.d.ts`, **khớp** với `docs/ARCHITECTURE.md` / `docs/STORY.md`, tránh trùng tên kiểu DOM
  (`Body`, `Event`, `Range`, `Animation`, `Text`...). Hai agent cùng sửa `types.d.ts` thì chỉ **thêm** kiểu mới, không sửa kiểu người khác đã viết
  (cần sửa thì ghi chú để Trưởng nhóm gộp).
- Biến module quan trọng: `/** @type {Object<string, Scene>} */ var registry = {};`

---

## 4. Nguyên tắc comment

### 4.1 Giải thích TẠI SAO, không lặp lại CÁI GÌ

| Không nên | Nên |
|---|---|
| `i++; // tăng i` | (không comment) |
| `arr = arr.slice(); // sao chép mảng` | `// Duyệt trên bản sao: listener có thể off() chính nó giữa vòng lặp.` |
| `dt = Math.min(MAX_DT, dt) // lấy min` | `// Kẹp dt: tab ẩn rồi mở lại → dt vài giây → nhân vật xuyên tường.` |

Nội dung đáng comment: **lý do thiết kế**, **đánh đổi** (vì sao chọn cách này, bỏ cách kia), **bẫy thường gặp**, **bất biến**
(điều kiện luôn đúng, vd "platforms[0] luôn là sàn"), **thứ tự phụ thuộc** ("phải gọi sau X"), **đơn vị & hệ toạ độ**.

### 4.2 Ba nhãn đặc biệt

Dùng đúng chữ, đúng biểu tượng để sinh viên (và công cụ tìm kiếm) lọc được:

- `💡 Khái niệm:` — đoạn code minh hoạ một khái niệm làm game / pattern. Giải thích khái niệm bằng 1–3 câu, gắn với chính dòng code bên dưới.
  ```js
  // 💡 Khái niệm: coyote time — cho phép nhảy thêm ~0.1 s sau khi rời mép bục, game "dễ tha thứ" hơn.
  ```
- `⚠️ Bẫy:` — lỗi dễ mắc nếu sinh viên sửa/viết lại đoạn này (và hậu quả cụ thể).
  ```js
  // ⚠️ Bẫy: so sánh với đáy ở frame TRƯỚC (prevBottom), không phải frame này — nếu không, rơi nhanh sẽ xuyên qua bục mỏng.
  ```
- `🧪 Thử:` — gợi ý thay một con số / bật một cờ để **quan sát** hiệu ứng. Phải an toàn (không làm hỏng save), mô tả điều sẽ thấy.
  ```js
  // 🧪 Thử: đổi GRAVITY 1500 → 600 rồi nhảy: nhân vật bay lơ lửng như trên Mặt Trăng.
  ```

Các nhãn có thể đặt trong comment dòng (`//`) hoặc trong JSDoc. Không tự chế nhãn khác.

### 4.3 Mật độ

- Mục tiêu: người đọc lướt qua **chỉ phần comment** vẫn hiểu luồng của file.
- Gợi ý định lượng: khoảng **1 comment ý nghĩa / 5–15 dòng code** ở phần logic; phần dữ liệu (bảng màu, toạ độ màn, nội dung câu đố)
  chỉ comment ở đầu mỗi nhóm.
- Mỗi file nên có **ít nhất 1** `💡 Khái niệm:`; file lõi minh hoạ bài học nên có 3–6. `🧪 Thử:` 1–3 cái / file là đủ.
- Hàm vẽ procedural dài: comment theo **từng bộ phận** ("// thân", "// mắt — vẽ sau thân để đè lên"), không theo từng lệnh `ctx`.
- Chia file dài thành mục bằng tiêu đề:
  ```js
  // ---------------------------------------------------------------------------
  // Va chạm với kẻ địch
  // ---------------------------------------------------------------------------
  ```

### 4.4 Điều không làm

- Không comment giải thích cú pháp JS cơ bản (`var`, `for`, `Array.map`, toán tử 3 ngôi...). Được giải thích các API ít gặp:
  `requestAnimationFrame`, `ctx.save/restore`, `ctx.setTransform`, `OffscreenCanvas`/canvas phụ, `AudioContext`, `GainNode`, `Map` làm LRU...
- Không để comment sai sự thật hoặc mô tả hành vi cũ. Không ghi ngày tháng, tên người, "TODO" mơ hồ.
- Không viết đoạn văn dài giữa code: lý thuyết dài để ở bài học `docs/learn/NN-*.md`, comment chỉ trỏ tới đó.

---

## 5. Refactor được phép (KHÔNG đổi hành vi)

Được làm:
1. **Số ma thuật → hằng có tên** (`UPPER_SNAKE_CASE`) khai báo ở **đầu module** (ngay sau `var OG = window.OG;`), mỗi hằng có comment đơn vị/ý nghĩa.
   Giá trị phải **giữ nguyên chính xác** (đừng viết `1 - 0.05` thay cho `0.95`; tách thành hai hằng nếu cần).
   Số hiển nhiên (`0`, `1`, `2` khi chia đôi, `Math.PI * 2`) và toạ độ trong dữ liệu màn/vẽ hình **không cần** đổi.
   Hằng đã có trong `OG.Config` thì dùng lại, không tạo bản sao.
2. **Tách hàm quá dài** (> ~60 dòng) thành các hàm con có tên rõ (động từ + danh từ: `updateEnemies`, `drawHealthBar`), giữ đúng thứ tự gọi.
   Hàm con là hàm nội bộ trong IIFE, không gắn vào `OG`.
3. **Đổi tên biến 1 chữ cái khó hiểu** thành tên có nghĩa (`a` → `plat`, `e` → `enemy`, `s` → `scene`).
   Giữ các tên quen thuộc: `i, j, k, x, y, w, h, t, dt, ctx, p` (player, khi file đã quen dùng), `e` (event DOM / enemy trong vòng lặp ngắn), `OG, U, C`.
4. Thêm biến trung gian có tên để biểu thức dài dễ đọc (không đổi thứ tự tính toán có tác dụng phụ).

**CẤM**:
- Đổi API công khai: tên/chữ ký `OG.X.fn`, tên field của object công khai (`OG.Level.state`, `OG.Game.run`...), tên scene, tên event / giá trị chuỗi trong `OG.EV`.
- Đổi định dạng dữ liệu save (`OG.Save.data`, key `localStorage`), dữ liệu hành trình, LevelDef, ThemeDef.
- Đổi **giá trị số** bất kỳ (kể cả "làm tròn cho đẹp"), đổi **thứ tự logic** (thứ tự update, thứ tự vẽ, thứ tự emit event, thứ tự gọi `Math.random()`).
- Chuyển `var` ↔ `let/const` hàng loạt, đổi `function` ↔ arrow (dễ đổi `this` / hoisting). Chỉ làm khi thật cần cho dễ đọc và chắc chắn tương đương.
- Thêm thư viện, ES modules, cú pháp cần transpile.

Nghi ngờ refactor có đổi hành vi không → **đừng làm**, chỉ comment.

---

## 6. Quy trình cho mỗi file

1. Đọc file + phần tài liệu hợp đồng liên quan (ARCHITECTURE/STORY).
2. Viết khối đầu file (mục 2).
3. JSDoc cho hàm công khai, `@typedef` cho cấu trúc cục bộ (mục 3).
4. Comment phần logic theo mục 4; refactor nhẹ theo mục 5.
5. Thử bật `// @ts-check` (mục 7).
6. `node --check <file>`; xong cả lô thì `node tests/smoke.js` → **XANH**.
7. `git diff` tự rà: phần code (không tính comment) chỉ được khác ở hằng/tên/hàm con đã nêu.

---

## 7. Kiểm tra kiểu với JSDoc + TypeScript (không build step)

- `jsconfig.json` ở gốc repo: `allowJs`, **`checkJs: false`** toàn cục, `target ES2019`, `lib [ES2019, DOM]`, `noEmit`, không strict.
  Nhờ `checkJs: false`, tsc **chỉ báo lỗi file có dòng `// @ts-check`** ở đầu → bật dần từng file, không bị ngập lỗi.
- `src/types.d.ts` khai báo `interface Window { OG: any }`, `declare var OG: any` và các kiểu dùng chung. Trình duyệt không load file này.
- Lệnh kiểm tra (cần mạng lần đầu để npx tải TypeScript; đã thử chạy được):
  ```
  npx -y -p typescript@5.6.3 tsc -p jsconfig.json --noEmit
  ```
  Không in gì và mã thoát 0 = sạch.
- Quy ước:
  - Làm sạch được (sửa bằng JSDoc / ép kiểu `/** @type {X} */ (expr)`, không đổi hành vi) → thêm `// @ts-check` ở **dòng 1**.
  - Quá nhiều lỗi (vd > ~15 lỗi, hoặc lỗi đến từ object dựng động) → **không** thêm, ghi lý do ở dòng `Kiểm tra kiểu:` trong khối đầu file.
  - Không dùng `// @ts-ignore` / `// @ts-nocheck` để "lách" — nếu phải dùng thì comment lý do ngay bên cạnh (tối đa vài chỗ / file).
  - `OG` là `any` nên gọi `OG.X.fn` không được kiểm tra; giá trị lấy từ OG muốn có kiểu thì gán qua JSDoc:
    `/** @type {Player} */ var p = st.player;`
- VS Code tự đọc `jsconfig.json` → gợi ý field, hover JSDoc hoạt động cả với file không bật `@ts-check`.

---

## 8. Bản đồ bài học (dự kiến)

Mỗi bài là một file `docs/learn/NN-ten-bai.md`. Khối đầu file trong code trỏ về đúng tên bài này (dòng `Bài học:`).

| Bài | File bài học | Khái niệm chính | File / hàm minh hoạ |
|---|---|---|---|
| 00 | `00-bat-dau.md` | Chạy game qua `file://`, cấu trúc thư mục, đọc code theo thứ tự `<script>`, chạy smoke test | `index.html` (thứ tự `<script>`), `src/core/main.js` (`boot`, thứ tự `init`), `docs/ARCHITECTURE.md` |
| 01 | `01-module-pattern-iife-namespace.md` | Module pattern IIFE, namespace `window.OG`, `'use strict'`, thứ tự load, cô lập lỗi module, "stub rồi ghi đè" | `src/core/namespace.js` (`OG.util.safe`, `OG.util.call`, `OG.Config`, `OG.Palette`), `src/core/main.js`, `src/game/default-scenes.js` (scene mặc định bị module tính năng ghi đè) |
| 02 | `02-game-loop-delta-time.md` | Game loop, `requestAnimationFrame`, delta time, kẹp dt, tách update/draw, fixed step để test, EMA FPS | `src/core/loop.js` (`frame`, `tick`, `OG.Loop.step`), `src/game/particles.js` (`update` dùng dt) |
| 03 | `03-input.md` | Trạng thái giữ phím vs cạnh lên (pressed), phím logic & keymap, đếm nguồn giữ phím (bàn phím + cảm ứng), `endFrame`, coyote time & jump buffer | `src/core/input.js` (`KEYMAP`, `setKey`, `pressed`, `consume`, `endFrame`, `tapJumpOn`), `src/game/player.js` (`OG.Player.update`) |
| 04 | `04-vat-ly-va-cham-aabb.md` | Trọng lực & vận tốc, tích phân Euler, AABB, nền một chiều (one-way platform), xét "giẫm" bằng đáy frame trước, hitbox vs hurtbox | `src/core/physics.js` (`moveBody`, `isStomp`, `aabb`), `src/core/namespace.js` (`OG.util.overlap`), `src/game/level.js` (`stompOk`, `touchOk`, `collect`), `src/game/difficulty.js` (`isStomp`, `enemyHurtbox`) |
| 05 | `05-state-machine-scene.md` | Finite state machine, scene stack (go/push/pop), vòng đời enter/exit/resume, `drawBelow`, pha trong scene | `src/core/scenes.js` (`go`, `push`, `pop`, `draw`), `src/game/level.js` (`st.phase`: play → clear), `src/game/game.js` (`finishStage`, `completeLevel` — luồng màn → trùm → bản đồ) |
| 06 | `06-event-bus-observer.md` | Observer / publish–subscribe, loose coupling, hằng tên event, huỷ đăng ký & memory leak, wildcard | `src/core/events.js` (`on/off/once/emit`, `OG.EV`), `src/audio/audio.js` (nghe event phát SFX), `src/world/quests.js` (nghe event đếm nhiệm vụ), `src/ui/hud.js` |
| 07 | `07-ve-canvas-procedural-cache.md` | Vẽ procedural bằng Canvas 2D (path, transform, `save/restore`), hoạt ảnh theo `t`, squash & stretch, cache khung hình vào canvas phụ, lượng tử hoá thời gian, LRU | `src/gfx/sprites.js` (`drawCharacter`, `cacheGet`, cache LRU), `src/gfx/decor.js` (`sprite`, `drawSprite`, `registerTiled`, `cacheStats`), `src/game/particles.js` |
| 08 | `08-camera-parallax.md` | Camera theo nhân vật, toạ độ thế giới ↔ màn hình, `ctx.translate`, rung màn hình, parallax nhiều lớp, chỉ vẽ phần nhìn thấy (culling) | `src/core/camera.js` (`follow`, `apply`, `shake`, `toWorld`), `src/gfx/scenery.js` (`drawBackground`, `drawLayer`, `visibleRange`), `src/core/scenery-registry.js` (lớp dự phòng) |
| 09 | `09-ai-ke-dich-boss.md` | AI tuần tra, registry loại kẻ địch (strategy), boss state machine (`setState`/`stateDone`), telegraph, phase theo máu, khoảng hở để giẫm, điều chỉnh độ khó | `src/game/enemies.js` (`registerType`, `patrol`), `src/bosses/bosses.js` (`kit`, `setState`), `src/bosses/deedee.js` (roll → dizzy), `src/game/boss-scene.js`, `src/game/difficulty.js` (`setupBoss`, `bossTimeScale`) |
| 10 | `10-web-audio.md` | `AudioContext`, mở khoá sau thao tác đầu tiên (autoplay policy), oscillator & envelope, noise buffer, bus âm lượng (`GainNode`), sequencer với lookahead scheduling, MIDI → tần số | `src/audio/audio.js` (`createContext`, `unlock`, `tone`, `noise`, `mtof`, `applyVolumes`), `src/audio/music.js` (`compile`, `tick`, `LOOKAHEAD`, `playEvent`) |
| 11 | `11-luu-tru-migrate.md` | `localStorage` + try/catch, giá trị mặc định & gộp sâu (deep merge) để nâng cấp save, migrate dữ liệu bản cũ, namespace dữ liệu module (`ext`), bảo vệ dữ liệu hỏng | `src/core/save.js` (`defaults`, `merge`, `load`, `commit`, `ns`, `LEGACY_BEST_KEY`), `src/game/progress.js` |
| 12 | `12-data-driven-man-cau-do-hanh-trinh.md` | Data-driven design, registry + đăng ký nhiều lần (gộp theo id), biên dịch dữ liệu (compile), validate dữ liệu, hook mở rộng; thực hành thêm màn / câu đố / thẻ / hành trình mới | `src/core/journeys.js` (`register`, `mergeById`, `compileLevel`, `validateDef`), `src/journeys/home/` (`journey.js`, `content.js`, `theme.js`, `extras.js`), `src/data/levels.js`, `src/game/level.js` (`addHook`), `src/story/learn.js` |
| 13 | `13-kiem-thu-ci.md` | Smoke test trong Node bằng DOM giả, `vm` load script đúng thứ tự, điều khiển game bằng event giả + `OG.Loop.step`, kiểm tra bất biến (save/restore cân bằng, font), CI GitHub Actions, kiểm tra kiểu JSDoc + tsc | `tests/smoke.js` (`step`, `click`, `expectScene`, `fontChecks`), `tests/fake-dom.js`, `.github/workflows/pages.yml`, `jsconfig.json`, `src/types.d.ts` |

Ghi chú phân công: một file có thể thuộc nhiều bài (vd `level.js` ở bài 04, 05, 12) — dòng `Bài học:` liệt kê **bài chính trước**.

---

## 9. Checklist bàn giao (mỗi agent)

- [ ] Mọi file được giao có khối đầu file đủ mục (mục 2), dòng `Bài học:` trỏ đúng tên bài ở mục 8.
- [ ] Hàm công khai có JSDoc; cấu trúc dữ liệu quan trọng có `@typedef` / dùng kiểu trong `types.d.ts`.
- [ ] Có `💡 Khái niệm:`, `⚠️ Bẫy:`, `🧪 Thử:` ở chỗ phù hợp; không comment từng dòng.
- [ ] Refactor chỉ trong phạm vi mục 5; `git diff` không đổi số, không đổi API, không đổi thứ tự logic.
- [ ] File nào bật `// @ts-check` thì `npx -y -p typescript@5.6.3 tsc -p jsconfig.json --noEmit` sạch; file nào không bật có ghi lý do.
- [ ] `node --check` từng file; `node tests/smoke.js` **XANH**.
- [ ] Không gõ tên font cấm trong `src/`; không commit.
