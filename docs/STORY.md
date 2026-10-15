# Oggy Adventure v2: Hành trình học tập (hợp đồng v2)

Tài liệu này là **hợp đồng chung** cho giai đoạn v2 (game phiêu lưu GIÁO DỤC có cốt truyện).
Nó bổ sung cho `docs/ARCHITECTURE.md` (mọi quy tắc v1 vẫn áp dụng: IIFE + `window.OG`, không ES module,
không thư viện/asset ngoài, chạy qua `file://`, `node --check`, `node tests/smoke.js` phải XANH).
Khi hai tài liệu mâu thuẫn về phần v2, **tài liệu này được ưu tiên**.

---

## 0. Nguyên tắc v2

- **Đối tượng: trẻ 5–10 tuổi.** Câu ngắn (bong bóng thoại ≤ 90 ký tự, sự thật trên thẻ ≤ 160 ký tự, 1–2 câu),
  từ đơn giản, giọng tích cực. Không bạo lực đáng sợ: gián tinh nghịch, bị giẫm thì "bẹp" hài hước, không máu me.
- **Dễ chơi:** chế độ mặc định `kid` (nhiều mạng, nhảy "dễ dãi", rơi vực không mất mạng, hết mạng không game over).
  Trả lời sai câu đố **không bao giờ bị phạt**: chỉ có gợi ý thân thiện và thử lại.
- **Tiếng Việt chuẩn, có dấu đầy đủ.**
- **Font:** chỉ dùng `OG.FONT` = `"Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif`.
  Trên canvas: `ctx.font = OG.font(18, 'bold')`. **TUYỆT ĐỐI KHÔNG dùng Trebuchet MS** (smoke test sẽ báo lỗi).
- **Phong cách hình:** cartoon dễ thương, hài hước, màu tươi, viền ink `#17233d` dày bo tròn, đồ vật có khuôn mặt
  (`OG.Decor.face(ctx, x, y, s)`), nhân vật giống "Oggy and the Cockroaches" nhưng cường điệu hơn.
- **Bốn cách học, dùng TẤT CẢ trong mỗi hành trình:** (1) thẻ kiến thức sưu tầm, (2) câu đố mở cửa,
  (3) truyện tranh giữa màn, (4) nhân vật dẫn đường.
- Chiến dịch **cổ điển** v1 (4 màn + 3 màn phụ, nút `▶ CHƠI`) giữ nguyên. Hành trình là chế độ mới
  (nút `📖 PHIÊU LƯU HỌC TẬP` → scene `journeySelect`).

---

## 1. Bản đồ module v2

| Namespace | File | Vai trò |
|---|---|---|
| `OG.Scenery` | `src/core/scenery-registry.js` | Sổ đăng ký chủ đề cảnh nền, decor, lớp parallax (+ hình dự phòng an toàn) |
| `OG.Journeys` | `src/core/journeys.js` | Sổ đăng ký hành trình, biên dịch màn, `validate()`, tiến độ |
| `OG.FONT`, `OG.font()` | `src/core/namespace.js` | Font chuẩn |
| `OG.Difficulty` | `src/game/difficulty.js` | Độ khó `kid` / `challenge`, checkpoint, trợ giúp |
| `OG.Level.addHook` | `src/game/level.js` | Cắm hành vi vào màn (trang sách, cổng, NPC, checkpoint…) |
| `OG.Decor` + decor mẫu | `src/gfx/decor.js` | Thư viện decor/lớp parallax dùng chung |
| Bộ vẽ ThemeDef | `src/gfx/scenery.js` | `OG.Sprites.drawBackground/drawPlatform/drawDecor/drawOverlay` đọc ThemeDef |
| `OG.Story` (+ `OG.Story.ui`) | `src/story/story.js` | Điều phối hành trình, truyện tranh; tiện ích vẽ bong bóng/khung/nút |
| `OG.Learn` | `src/story/learn.js` | Thẻ kiến thức, Sổ tay, câu đố |
| `OG.Guide` | `src/story/guide.js` | Nhân vật dẫn đường trong màn |
| Scene v2 | `src/story/scenes.js` | `journeySelect, journeyMap, comic, card, quiz, notebook, journeyEnd` |
| Dữ liệu hành trình | `src/journeys/<id>/{theme,content,extras,journey}.js` | Mỗi hành trình 1 thư mục |

---

## 2. Định dạng dữ liệu HÀNH TRÌNH

Đăng ký lúc load bằng `OG.Journeys.register(def)`. Gọi **nhiều lần cùng `id`** được: các lần sau GỘP vào
(`areas`, `cards`, `quizzes` nối/thay theo `id`; `comics` gộp theo khoá; field khác ghi đè). Nhờ vậy
`content.js` và `journey.js` mỗi file khai báo một phần.

```js
OG.Journeys.register({
  id: 'home',                         // a-z0-9_, bắt đầu bằng chữ. Là tiền tố của id màn/chủ đề/decor riêng
  order: 1,                           // thứ tự trên màn chọn hành trình
  title: 'Cuốn Bách Khoa Kỳ Diệu',
  emoji: '📖',
  description: 'Một câu ngắn giới thiệu.',
  guide: { charId: 'olivia', name: 'Olivia' },     // người dẫn đường (mục 9)
  palette: { primary, secondary, accent, bg, ink }, // màu UI của hành trình (thẻ chọn, khung truyện, sổ tay)
  intro: 'intro',                      // id truyện mở đầu (chiếu lần đầu bắt đầu hành trình)
  ending: { comic: 'ending', title: 'HOÀN THÀNH! 🎉', text: 'Câu chúc mừng.' }, // hoặc ending: 'comicId'
  areas: [AreaDef],
  cards: [CardDef],
  quizzes: [QuizDef],
  comics: { comicId: [PanelDef] }      // hoặc { comicId: { panels: [PanelDef] } }
});
```

### 2.1 AreaDef (khu)
```js
{ id: 'kitchen', name: 'Nhà bếp', emoji: '🍳',
  sceneryTheme: 'home-kitchen',        // id ThemeDef (mục 4) — mặc định cho mọi màn trong khu
  music: 'kitchen',                    // trackId Audio có sẵn: menu|worldmap|kitchen|garden|roof|lair|boss
  intro: 'kitchen_intro',              // truyện chiếu khi vào màn ĐẦU của khu (lần đầu)
  outro: 'kitchen_outro',              // truyện chiếu sau màn CUỐI của khu (lần đầu)
  boss: { bossId: 'deedee',            // trùm đánh sau màn cuối khu (bỏ trống = không trùm)
          arena: { width, platforms, spawn, theme }, // tuỳ chọn, ghi đè đấu trường của OG.Bosses
          intro: 'comicId' },          // (dự phòng cho story-ui: truyện trước trận trùm)
  levels: [JourneyLevelDef] }
```
Đấu trường trùm trong hành trình mặc định dùng **chủ đề cảnh nền của khu**.

### 2.2 JourneyLevelDef (màn)
Đúng định dạng `LevelDef` v1 (`docs/ARCHITECTURE.md` mục 7) cộng field mở rộng:
```js
{ id: 'home-kitchen-1',                // BẮT BUỘC tiền tố '<journeyId>-'; duy nhất toàn game
  name, icon?, theme?, music?,         // theme mặc định = area.sceneryTheme
  from?: 'kitchen',                    // mượn hình học màn v1 (width, spawn, goal, platforms, pizzas, coins, enemies, exit)
  width, spawn:{x,y}, goal, platforms:[[x,y,w,h]], pizzas:[[x,y]], coins:[[x,y]],
  enemies:[{type,x,range?,speed?,dir?}], exit:{x}, quests?,
  // ---- v2 ----
  pages: [{ card: 'k_veggie', x, y }],           // trang sách (tâm x,y) -> mở thẻ kiến thức
  quizGate: { quiz: 'q_veggie', x? },            // 1 cổng; x bỏ trống / 'exit' = cổng ở cửa EXIT
  quizGates: [{ quiz, x?, id? }],                // nhiều cổng (x số = tường chặn giữa màn, x < exit.x)
  guideSpots: [{ x, y?, text | lines:[...], charId?, name?, card? }], // NPC đứng ở x (chân y mặc định 480)
  checkpoints: [x, ...],                         // tuỳ chọn; thiếu thì OG.Difficulty tự đặt (kid)
  comicTriggers: [{ x, comic, once? }],          // truyện chen giữa màn khi người chơi đi qua x
  intro?: 'comicId', outro?: 'comicId',          // truyện trước/sau màn (lần đầu)
  boss?: bossId | null }                         // mặc định: trùm của khu nếu là màn cuối khu
```
Quy ước: sàn là platform đầu tiên `[0,480,width,60]`; được tách sàn thành nhiều đoạn y=480 để tạo **hố**
(chế độ kid rơi hố không mất mạng). `goal` ≤ số pizza. Màn hành trình KHÔNG nằm trong `OG.Data.levels`
(`OG.Data.getLevel(id)` tự tra sang `OG.Journeys.getLevel(id)`; `OG.Data.levelIndex` trả −1).
Mở khoá: màn mở khi màn liền trước **trong hành trình** đã xong (`OG.Journeys.isLevelUnlocked`).

LevelDef sau biên dịch (`OG.Journeys.getLevel`) có thêm: `journey, areaId, areaIndex, indexInArea, journeyIndex,
isLastOfArea, bossArena, quizGates (đã chuẩn hoá [{id, quiz, x}]), final:false`.

### 2.3 CardDef (thẻ kiến thức)
```js
{ id: 'k_veggie', areaId: 'kitchen', title: 'Rau xanh',
  fact: 'Rau xanh có nhiều vitamin giúp em khoẻ mạnh. Mỗi bữa ăn thêm rau nhé!', // 1–2 câu, ≤160 ký tự
  drawIcon: function (ctx, x, y, size, t) { ... },  // ƯU TIÊN: vẽ canvas, (x,y)=tâm, size=cạnh ô; tự save/restore không bắt buộc
  icon: IconSpec }                                  // dự phòng nếu không có drawIcon
```
**IconSpec** (dùng cho thẻ và đáp án câu đố): `function` | `{decor:'kind', opts}` (decor thư viện) |
`{char:'charId'}` (chân dung nhân vật) | `{emoji:'🍜'}` hoặc chuỗi emoji (**chỉ tạm thời** — bản hoàn chỉnh vẽ canvas).

### 2.4 QuizDef (câu đố mở cửa)
```js
{ id: 'q_veggie', areaId: 'kitchen', question: 'Món nào giúp em khoẻ mạnh hơn?',
  choices: [{ text: 'Bông cải xanh', icon: IconSpec /* hoặc drawIcon */ }, { text: 'Kẹo ngọt', icon }], // 2–3 lựa chọn, CÓ HÌNH
  answer: 0,                                   // chỉ số đáp án đúng
  hint: 'Gợi ý: món này màu xanh lá…',        // hiện khi sai (thân thiện, gợi mở)
  explain: 'Đúng rồi! Rau xanh có nhiều vitamin.', // hiện khi đúng
  cardId?: 'k_veggie' }                        // trả lời đúng thì mở khoá thẻ này (nếu chưa có)
```

### 2.5 Truyện tranh (PanelDef)
```js
comics: { intro: [
  { bg: 'home-kitchen',                // id chủ đề | 'color:#hex' | {theme, camX} | function(ctx, 0, 0, 960, 540, t)
    chars: [{ id: 'oggy', anim: 'idle', x: 0.3, y?: 0..1, face?: 1|-1, scale?: 1.8 }], // x,y tỉ lệ khung (chân)
    bubbles: [{ who: 'olivia', text: 'Câu thoại ngắn' }],  // who = charId trong panel (có đuôi) | 'narrator'
    caption?: 'Lời dẫn chuyện ở đáy khung' }
] }
```
Mỗi panel phải có `bubbles` hoặc `caption`. Anim gợi ý: `idle, run, jump, hurt, attack, victory, talk, wave, think, point`
(Sprites đưa anim lạ về `idle`).

### 2.6 Kiểm tra dữ liệu
`OG.Journeys.validate(idOrDef) -> {ok, errors:[str], warnings:[str]}` — đường dẫn lỗi dạng
`home.levels.home-kitchen-1.pages[0].card: thẻ "x" không tồn tại`. Kiểm: id, tiêu đề, guide, khu, chủ đề cảnh nền
(cảnh báo nếu chưa đăng ký), trùm (cảnh báo nếu chưa có), thẻ/câu đố/truyện tham chiếu, 2–3 lựa chọn + đáp án,
tiền tố id màn, trùng id (kể cả với màn cổ điển), sàn, exit, goal, toạ độ trang, vị trí cổng, độ dài câu.
`OG.Journeys.validateAll()` chạy lúc boot (`main.js`): hành trình có **lỗi** bị đánh dấu `invalid` và ẩn khỏi màn chọn,
lỗi in bằng `console.warn`. Smoke test yêu cầu cả 4 hành trình `ok` (không lỗi).

### 2.7 API OG.Journeys
```
register(def)  has(id)  get(id)  list()  ids()  validate(idOrDef)  validateAll({verbose})  init()
getLevel(levelId)  isJourneyLevel(id)  levelsOf(jid)  levelIds(jid)  areaOf(levelId)  getArea(jid, areaId)
nextLevel(levelId)  isFirstOfArea(id)  isLastOfArea(id)  isFinalLevel(id)
getCard(jid, cardId)  getQuiz(jid, quizId)  getComic(jid, comicId) -> [PanelDef]|null  cardsOf(jid, areaId?)
isLevelUnlocked(id)  isAreaUnlocked(jid, areaId)  isAreaDone(jid, areaId)  firstIncomplete(jid)  isComplete(jid)
progress(jid) -> {levelsDone, levels, stars, maxStars}
```
Id thẻ/câu đố/truyện là duy nhất **trong** hành trình.

### 2.8 Mở rộng riêng của hành trình (`extras.js`)
Được gọi lúc load: `OG.Enemies.registerType('<jid>-tên', def)`, `OG.Bosses.register({id:'<jid>-tên', ...})`
(hợp đồng BossInstance v1), `OG.Scenery.registerDecor('<jid>-tên', fn)`, `OG.Scenery.registerLayer('<jid>-tên', fn)`,
`OG.Data.registerCharacter({id:'<jid>-tên', role:'npc', ...})`. Tên mới **phải có tiền tố `<jid>-`**.
Kẻ địch/trùm dễ thương, có báo hiệu trước đòn, có khoảng hở để giẫm. Tốc độ địch dùng `e.speed`
(OG.Difficulty tự nhân hệ số).

---

## 3. Luồng chơi hành trình

```
menu ─📖→ journeySelect ─chọn→ OG.Story.startJourney(jid)
   → Game.newRun({journeyId}) → 'journey:select' → comic(intro, lần đầu) → journeyMap
journeyMap ─▶ CHƠI TIẾP / chọn màn→ OG.Story.playLevel(levelId)
   → ('area:enter' nếu màn đầu khu) → comic(area.intro, level.intro — lần đầu) → Game.startLevel → level
level: trang sách → push card · NPC → bong bóng · cổng → push quiz · comicTriggers → push comic
   → đủ pizza + qua mọi cổng + chạm EXIT → (trùm của khu) → Game.completeLevel
Game.completeLevel (màn hành trình) → lưu tiến độ, thưởng xu, 'level:complete'{journeyId, areaId}
   → OG.Story.afterLevel(result): comic(level.outro, area.outro, ending nếu màn cuối) 
   → journeyMap{completed} | (màn cuối) Story.finishJourney → 'journey:complete' → journeyEnd
Hết mạng: kid → OG.Difficulty.softFail (đầy mạng, về checkpoint, trợ giúp sau 2 lần) · challenge → gameover
   → THỬ LẠI = OG.Game.retryRun() (hành trình: startJourney(jid,{skipIntro}) → journeyMap)
Pause: "Chơi lại màn" = OG.Game.restartLevel(); "Bản đồ" = OG.Game.backToMap() (journeyMap hoặc worldmap)
```
Truyện đã xem được nhớ trong `OG.Save.ns('story').seen['<jid>:<comicId>']` (chỉ tự chiếu lần đầu).

---

## 4. API cảnh nền theo chủ đề: `OG.Scenery`

Sổ đăng ký nằm ở core (luôn có, không phụ thuộc gfx). Bộ vẽ ở `src/gfx/scenery.js` đọc ThemeDef.
Thiếu decor/lớp trong thư viện → vẽ **hình dự phòng** (bụi cây mặt cười / dãy đồi), không bao giờ lỗi.

```
OG.Scenery.registerTheme(id, ThemeDef)  getTheme(id)  has(id)  known(id)  list()  baseOf(id)
OG.Scenery.registerDecor(kind, fn(ctx, x, y, scale, t, opts))   // x = tâm, y = mặt đất; thế giới
OG.Scenery.drawDecor(ctx, kind, x, y, scale, t, opts) -> bool   // false = đã vẽ dự phòng
OG.Scenery.registerLayer(kind, fn(ctx, layer, camX, t, theme))  // màn hình, phủ ngang 960 px
OG.Scenery.drawLayer(ctx, layer, camX, t, theme)  hasDecor/listDecor  hasLayer/listLayers
OG.Scenery.BUILTIN = ['kitchen','garden','roof','lair','boss']  (chủ đề v1, vẽ sẵn)
```

**ThemeDef**
```js
OG.Scenery.registerTheme('vietnam-halong', {
  name: 'Vịnh Hạ Long',
  base: 'garden',                       // chủ đề v1 dự phòng (nếu chỉ có base -> vẽ y như chủ đề v1 đó)
  sky: { top: '#8ed8f8', bottom: '#fdf3d0', sun?: {x, y, r, color}, stars?: bool,
         clouds?: false | { color, count } },
  layers: [                             // xa -> gần; parallax 0 (đứng yên) .. 1 (theo camera)
    { kind: 'mountains', parallax: 0.12, y: 430, height: 160, color: '#7fa4c9', spacing?: 300 },
    { kind: 'waves', parallax: 0.3, y: 448, color: '#4fb3e8' },
    { kind: 'decorRow', decor: 'bush', parallax: 0.35, y: 455, scale: 0.9, spacing: 260, opts },
    { kind: 'custom', draw: function (ctx, camX, t, layer, theme) {} }
  ],
  platformStyle: { floor: { fill, top, topH?, radius? }, ledge: { fill, top, topH?, radius? }, outline?: bool },
  decor: [                              // thế giới, sau sàn; y mặc định = 480 (chân)
    { kind: 'flower', every: 400, start: 200, scale?: 1, opts? },
    { kind: 'vietnam-lantern', at: [300, 900], y: 300 },
    { kind: 'bush', every: 700, front: true }          // front: vẽ ĐÈ lên người chơi (lớp phủ)
  ],
  ambient?: { kind: 'snow'|'leaves'|'bubbles'|'sparkle', color },  // hạt bay lớp phủ màn hình
  drawCustom?: { background(ctx, camX, t, theme), platform(ctx, plat, t, theme) -> true nếu đã vẽ,
                 decor(ctx, worldW, t, theme) }
});
```
Bộ vẽ dùng: `drawBackground` (sky → layers), `drawPlatform` (platformStyle), `drawDecor` (decor không front),
và **mới** `OG.Sprites.drawOverlay(ctx, theme, camX, t)` (màn hình, sau thế giới: decor `front` + `ambient`; Level gọi nếu có).

**Kind dùng chung** (thư viện `src/gfx/decor*.js`, agent cảnh nền). Hiện có: decor `bush, flower, rock, book`;
lớp `hills, mountains, waves, decorRow`. Agent cảnh nền bổ sung danh sách tối thiểu sau (tên không tiền tố = dùng chung):
- decor: `tree, palm, cloud, house, lamp, fence, bench, cactus, pine, snowman, ice, coral, shell, boat, lantern,
  pagoda, temple, tower, pyramid, sphinx, eiffel, torii, sakura, igloo, fern, volcano, bone, planet, star, crate, bin`
- lớp: `clouds, city, sea, dunes, forest, snowHills, stars, volcanoes`
- prop mới qua `OG.Sprites.drawProp(ctx, id, x, y, t, opts) -> bool` (trả false nếu chưa có → OG.Learn/OG.Difficulty tự vẽ dự phòng):
  `page` (trang sách bay, tâm; `opts.collected` = đã có trong sổ), `gate` (cổng câu đố, x = mép trái, y = mặt sàn,
  `opts.open`), `checkpoint` (cột cờ, x = cột, y = mặt sàn, `opts.reached`).

Hành trình chỉ **tham chiếu kind theo tên**; decor riêng đăng ký trong thư mục hành trình với tiền tố `<jid>-`.

---

## 5. API độ khó: `OG.Difficulty` (`src/game/difficulty.js`)

```
init()  mode() -> 'kid'|'challenge'  isKid()  set(mode)  toggle()  label(mode?)  list()
params(levelId?) -> object (đã áp trợ giúp)   get(key, levelId?)
assistLevel(levelId) -> 0..2   isAssist(levelId)   recordFail(levelId)   recordClear(levelId)
// hook do src/game gọi:
startLives()  scaleEnemy(e)  enemyHurtbox(box) -> box  setupBoss(boss, arena)  bossTimeScale()
trackSafe(p)  onFall(p, world) -> bool  softFail({levelId, cause}) -> bool
MODES, ASSIST
```

| Tham số | kid (mặc định) | challenge (= v1) |
|---|---|---|
| `lives` | 5 | 3 |
| `coyoteTime` (s) | 0.15 | 0.06 |
| `jumpBuffer` (s) | 0.15 | 0.08 |
| `enemyHitboxScale` | 0.7 | 1 |
| `enemySpeedMul` | 0.7 | 1 |
| `bossHpMul` (tối thiểu 2 máu; trùm ghép `members` tự xử lý) | 0.6 | 1 |
| `bossSpeedMul` (dt của `boss.update`) | 0.75 | 1 |
| `hurtInvuln` (s) | 2.2 | 1.6 |
| `checkpoints` / `checkpointSpacing` | true / 600 px | false |
| `fallDamage` (rơi vực mất mạng) | false → hồi về chỗ đứng an toàn | true (như v1) |
| `softFail` (hết mạng trong hành trình) | true → đầy mạng tại checkpoint | false → game over |
| `autoAssistAfter` (số lần thua để bật trợ giúp) | 2 | 3 |

Trợ giúp (`ASSIST[1..2]`, cộng dồn theo số lần thua cùng màn): địch chậm thêm, máu trùm giảm thêm, `shield` khi hồi sinh,
`extraLives`. Thắng màn → xoá đếm thua. Lưu: `settings.difficulty` (qua `OG.Save.setSetting`), số lần thua `OG.Save.ns('difficulty').fails`.
Nơi gọi đã nối sẵn: `Game.newRun` (mạng), `Player.update` (coyote/buffer — nhảy coyote `consume('jump')` để không tính nhảy đôi),
`Player.hurt` (bất tử), `Enemies.create/hurtbox`, scene `level`/`boss` (rơi vực, máu & nhịp trùm, `arena.difficulty`),
`Game.loseLife` (softFail). Checkpoint là một **level hook** (`id:'checkpoints'`). Chiến dịch cổ điển cũng theo độ khó
(trừ `softFail` chỉ áp cho hành trình). Smoke test chạy chiến dịch cổ điển ở `challenge`, hành trình ở `kid`.

---

## 6. Hệ thống Story / Learn / Guide và scene

### 6.1 Level hooks (`src/game/level.js`)
```
OG.Level.addHook({ id, order?(50),
  enter(st), update(st, dt, player) -> true để dừng frame (vd vừa push scene),
  canExit(st, player) -> false để chặn EXIT (hook tự mở câu đố),
  drawWorld(ctx, st, t) /* trước người chơi */, drawFront(ctx, st, t) /* sau người chơi */, drawScreen(ctx, st, t) })
OG.Level.removeHook(id)  OG.Level.hookIds()
```
`st.journeyId` = id hành trình (null ở màn cổ điển). Hook đã có: `checkpoints`(10), `learn`(20), `guide`(30), `story-comics`(40).

### 6.2 OG.Story (`src/story/story.js`)
```
init()  current() -> jid|null  lastJourney()  hasSeen(jid, comicId)  markSeen(jid, comicId)
startJourney(jid, {skipIntro, forceIntro}) -> bool    playLevel(levelId)
afterLevel(result) -> true (Game.completeLevel gọi cho màn hành trình)   finishJourney(jid)
playComic(jid, comicId, {next})  playComics(jid, [ids], {next})   // next = {scene, params, start?} | {fn}
pushComic(jid, comicId, onDone)   onSoftFail(info) -> bool   drawComicPanel(ctx, panel, frameRect, t, appear)
OG.Story.ui: font(px, weight)  wrap(ctx, text, maxW)  drawBubble(ctx, x, y, text, {maxW, size, tail, anchor, bg, name})
             drawFrame(ctx, x, y, w, h, fill, r)  drawButton(ctx, rect, label, opts)  hit(rect, px, py)  advancePressed()
```

### 6.3 OG.Learn (`src/story/learn.js`)
```
init()  hasCard(jid, cardId)  unlockCard(jid, cardId) -> isNew  listCards(jid, areaId?) -> [{card, unlocked}]
count(jid) -> {have, total}  openCard(jid, cardId, {isNew, from, onClose})  openNotebook(jid, back, backParams)
isQuizPassed(jid, quizId)  openQuiz(jid, quizId, {levelId, gateId, onPass, onClose})
answerQuiz(jid, quizId, choice, {levelId, gateId}) -> {correct, tries, firstTry, hint, explain}
drawIcon(ctx, IconSpec, x, y, size, t)  drawCardIcon(ctx, card, x, y, size, t)  drawPage(ctx, x, y, t, opts)  drawGate(ctx, x, floorY, t, open)
```
Lưu `OG.Save.ns('learn')` = `{ cards: {jid: {cardId: timestamp}}, quizzes: {jid: {quizId: {tries, passed}}} }`.
Trong màn: nhặt trang (+50 điểm) → thẻ mới thì push `card`; thẻ đã có thì chữ "Đã có trong Sổ tay". Cổng giữa màn chặn như tường;
cổng EXIT chặn sau khi đủ pizza. Cổng hỏi lại mỗi lần vào màn (ôn tập). HUD: `OG.Game.hud.pages = {have, total}` + pill vẽ canvas.

### 6.4 OG.Guide (`src/story/guide.js`)
```
init()  guideOf(jid) -> {charId, name}  say(text, seconds) -> bool (bong bóng góc màn hình, chỉ trong màn)  talk(st, spot)
```
Đến gần NPC (≤ 90 px) hoặc chạm vào NPC → bong bóng + `guide:talk`; nhấn E/✦ (hoặc chạm lại) → câu tiếp theo.
NPC chưa nói chuyện có dấu "!" nhún nhảy. `spot.card` → nói chuyện xong mở khoá thẻ đó.

### 6.5 Scene v2 (chủ sở hữu: story-ui) — GIỮ tên, params, phím

| Scene | Cách vào | params | Phím / chạm |
|---|---|---|---|
| `journeySelect` | `go` | `{back}` | panel DOM: nút `[data-act="journey"][data-arg="<jid>"]`, đổi độ khó; Esc = back |
| `journeyMap` | `go` | `{journeyId, completed?, result?}` | Enter = ▶ CHƠI TIẾP (màn chưa xong đầu tiên); nút màn `[data-act="level"][data-arg]`; Sổ tay; Esc → journeySelect |
| `comic` | `go` (giữa cảnh) / `push` (`overlay:true`, giữa màn) | `{journeyId, comicId, onDone?, overlay?}` | Enter/Space/E/→/chạm = khung tiếp; Esc hoặc nút "Bỏ qua ⏭" = bỏ qua; luôn phát `comic:end` |
| `card` | `push` | `{journeyId, cardId, isNew, onClose?}` | sau 0,35 s: Enter/Space/E/→/Esc/chạm = đóng (pop) |
| `quiz` | `push` | `{journeyId, quizId, levelId, gateId, onPass?, onClose?}` | lựa chọn bắt đầu ở **0**; ←/→/↑/↓ đổi; Enter/Space/E chọn; chạm đáp án; sai = gợi ý + gạch lựa chọn, ở lại; đúng = giải thích, Enter/chạm → pop + onPass; Esc = để sau (pop, cổng vẫn khoá) |
| `notebook` | `go` | `{journeyId, back, backParams}` | mũi tên chọn, Enter mở thẻ đã có (push card), Esc/nút ↩ = về back |
| `journeyEnd` | `go` | `{journeyId}` | panel DOM: Sổ tay (primary), Bản đồ hành trình, Về menu |

Smoke test điều khiển các scene này bằng đúng phím/selector trên — đổi giao diện thoải mái nhưng giữ hợp đồng này.

---

## 7. Event mới (hằng trong `OG.EV`)

| Event | Payload | Ai phát |
|---|---|---|
| `journey:select` | `{journeyId, difficulty}` | Story.startJourney |
| `journey:complete` | `{journeyId, cards, totalCards}` | Story.finishJourney |
| `area:enter` / `area:complete` | `{journeyId, areaId, levelId?}` | Story |
| `page:collect` | `{journeyId, levelId, cardId, x, y, isNew}` | Learn (level hook) |
| `card:unlock` | `{journeyId, cardId, count, total}` | Learn.unlockCard (chỉ lần đầu) |
| `card:open` | `{journeyId, cardId, from:'level'\|'notebook'}` | Learn.openCard |
| `quiz:open` | `{journeyId, quizId, levelId, gateId}` | Learn.openQuiz |
| `quiz:answer` | `{journeyId, quizId, choice, correct, tries}` | Learn.answerQuiz |
| `quiz:pass` | `{journeyId, quizId, tries, firstTry, levelId, gateId}` | Learn.answerQuiz |
| `gate:open` | `{levelId, gateId, quizId, x}` | Learn (level hook) |
| `comic:start` / `comic:end` | `{journeyId, comicId, panels}` / `{journeyId, comicId, skipped}` | scene comic |
| `guide:talk` | `{journeyId, charId, levelId, spot, text}` | Guide |
| `notebook:open` | `{journeyId}` | Learn.openNotebook |
| `checkpoint:reach` | `{levelId, index, x, y}` | Difficulty (hook) |
| `player:respawn` | `{cause:'fall'\|'softfail', x, y, levelId}` | Difficulty |
| `difficulty:change` | `{mode, prev}` | Difficulty.set |
| `assist:on` | `{levelId, level, fails}` | Difficulty.recordFail |

Bổ sung payload cũ: `game:start` có `journeyId`; `LevelResult` có `journeyId, areaId` (màn hành trình, `isFinal:false`);
`RunResult` có `journeyId`. Gợi ý Audio (Tích hợp nối sau): `page:collect`→`collect`, `card:unlock`→`quest`,
`quiz:answer{correct:false}`→âm nhẹ (KHÔNG dùng âm "thua"), `quiz:pass`→`victory` ngắn, `checkpoint:reach`→`coin`, `guide:talk`→`click`.

---

## 8. Lưu trữ (OG.Save)

| Vùng | Nội dung |
|---|---|
| `settings.difficulty` | `'kid'` (mặc định) \| `'challenge'` |
| `progress.levels[levelId]` | dùng chung cho màn hành trình (id có tiền tố nên không đụng màn cổ điển); `Progress.totalStars()` chỉ tính màn cổ điển |
| `ext.story` | `{ seen: {'<jid>:<comicId>': true}, last: jid }` |
| `ext.learn` | `{ cards, quizzes }` (mục 6.3) |
| `ext.difficulty` | `{ fails: {levelId: n} }` |

---

## 9. Nhân vật cần vẽ (agent characters)

Dữ liệu (`role:'npc'`, w×h, colors) đã đăng ký trong `src/data/characters.js`; Sprites hiện vẽ **dự phòng kiểu mèo** theo màu.
Mỗi nhân vật cần: `idle`, `talk` (miệng mấp máy), `wave`, `victory`, `think`, `point`, `run` (truyện tranh), hoạt động với
`drawCharacter` (gốc = chân) và `drawPortrait`. Phong cách: tròn trịa, mắt to, viền ink dày, cường điệu hài hước.

| charId | Tên | w×h | Mô tả |
|---|---|---|---|
| `olivia` | Olivia (có sẵn) | 32×50 | **Dẫn đường "home"** — thêm anim `talk, wave, point, think` |
| `bob` | Bob | 44×46 | **Dẫn đường "vietnam"** — chó bun nâu hàng xóm, đội nón lá, khăn quàng |
| `owl` | Giáo sư Cú | 40×50 | **Dẫn đường "world"** — cú mèo kính tròn, mũ tốt nghiệp, cầm quả địa cầu |
| `robot` | Rô-bốt Bíp | 38×52 | **Dẫn đường "science"** — rô-bốt tròn, ăng-ten, màn hình mặt cười |
| `bee` | Ong Vàng | 30×30 | NPC phụ "home" (vườn) |
| `ladybug` | Bọ Rùa | 30×24 | NPC phụ "home" |
| `droplet` | Giọt Nước | 28×36 | NPC phụ "home" (vòng tuần hoàn nước, mái nhà) |
| `buffalo` | Trâu Con | 52×44 | NPC phụ "vietnam" (miền quê, miền Tây) |
| `turtle` | Rùa Vàng | 46×34 | NPC phụ "vietnam" (Hồ Gươm) |
| `lion_dance` | Lân Con | 54×50 | NPC phụ "vietnam" (Trung thu, Hội An) |
| `camel` | Lạc Đà | 56×60 | NPC phụ "world" (Ai Cập) |
| `toucan` | Chim Toucan | 30×36 | NPC phụ "world" (Amazon) |
| `penguin` | Chim Cánh Cụt | 32×42 | NPC phụ "world" (Bắc Cực/vùng băng) |
| `polar_bear` | Gấu Bắc Cực | 58×50 | NPC phụ "world" (Bắc Cực) |
| `dino` | Khủng Long Con | 48×46 | NPC phụ "science" (thời khủng long) |
| `blood_cell` | Hồng Cầu | 34×34 | NPC phụ "science" (cơ thể người) |

Thêm (tuỳ chọn, agent characters): `opts.accessory` cho mọi nhân vật — `'nonla' | 'beret' | 'helmet' | 'scarf' | 'spacesuit' | 'explorer'`
(gián đội nón lá ở Việt Nam, mũ nồi ở Pháp, đồ phi hành gia ở vũ trụ…); skin mới qua `OG.Data.registerSkin` trong `skins.js`:
`oggy_explorer` (mũ thám hiểm), `oggy_astronaut`, `oggy_scientist` (áo blouse) — giá xu do Integrator quyết.

---

## 10. Quyền sở hữu file — giai đoạn SONG SONG v2 (BẮT BUỘC)

| Agent | CHỈ được sửa | Ghi chú |
|---|---|---|
| **journey-home** | `src/journeys/home/` | |
| **journey-vietnam** | `src/journeys/vietnam/` | |
| **journey-world** | `src/journeys/world/` | |
| **journey-science** | `src/journeys/science/` | |
| **story-ui** | `src/story/` | Cần đổi menu (`src/ui/`)? Ghi vào `src/story/INTEGRATION.md`, KHÔNG sửa |
| **characters** | `src/gfx/sprites.js`, `src/gfx/skins.js`, `docs/sprites-demo.html` | |
| **scenery** | `src/gfx/scenery.js`, `src/gfx/decor*.js` (file mới), `docs/scenery-demo.html` | `drawProp` page/gate/checkpoint ở `scenery.js` |
| **difficulty** | `src/game/`, `src/bosses/`, `src/data/characters.js`, `src/core/input.js` | |
| **Integrator** (sau) | `index.html`, `src/core/` (trừ `input.js`), `src/data/levels.js`, `src/world/`, `src/ui/`, `docs/`, `tests/` | đọc mọi `INTEGRATION.md` |

Quy tắc:
1. Không sửa file ngoài phạm vi; không gán đè namespace người khác. Được **đọc/gọi** mọi API công khai.
2. Mỗi hành trình đã có sẵn 4 file trong `index.html` theo thứ tự `theme.js → content.js → extras.js → journey.js`.
   **Viết vào 4 file đó** để không phải sửa `index.html`. Cần file mới (vd `decor-asia.js`, `levels-hue.js`) → ghi
   `src/<thư-mục>/INTEGRATION.md` (tên file, vị trí load, lý do).
3. Tên riêng (chủ đề, decor, lớp, kẻ địch, trùm, NPC) có tiền tố `<jid>-`. Id màn `<jid>-<area>-<n>`.
4. Lúc load chỉ đăng ký; KHÔNG đọc `OG.Save.data`. Không `alert/prompt`. Không `localStorage` trực tiếp.
5. Mọi file JS sửa phải qua `node --check`; `node tests/smoke.js` phải XANH trước khi bàn giao.
   Smoke test chơi **màn đầu tiên của mỗi hành trình** (khu đầu): phải có ít nhất 1 trang sách; nếu có trùm thì trùm phải giẫm được.
   `OG.Journeys.validate(jid).ok` phải true. Cảnh báo (`warnings`) nên dọn sạch.
6. KHÔNG tự chạy `git add/commit/checkout/stash/reset`. Server tĩnh tự mở thì chỉ dừng đúng PID của mình.

### Việc của từng agent (tóm tắt)
- **journey-<id>**: đủ khu (home: kitchen, garden, roof, basement · vietnam: hanoi, halong, hue, hoian, saigon, mientay ·
  world: egypt, france, japan, amazon, arctic · science: dino, body, space), 2–3 màn/khu, mỗi màn 2–3 trang sách,
  ≥ 1 cổng câu đố mỗi khu, ≥ 1 điểm dẫn đường mỗi màn, truyện mở/đóng mỗi khu + mở đầu/kết thúc hành trình,
  thẻ có `drawIcon` vẽ canvas, chủ đề cảnh nền cho từng khu. Nội dung chính xác, phù hợp trẻ em.
- **story-ui**: làm đẹp 7 scene (canvas/DOM, chạm ≥ 44 px), hiệu ứng mở thẻ, bản đồ hành trình trực quan,
  sổ tay theo khu, bong bóng thoại đẹp; giữ hợp đồng mục 6.
- **characters**: vẽ NPC mục 9 + anim `talk/wave/think/point`, phụ kiện, skin mới.
- **scenery**: bộ vẽ ThemeDef đẹp, thư viện decor/lớp mục 4, prop `page/gate/checkpoint`, `docs/scenery-demo.html`.
- **difficulty**: tinh chỉnh mục 5 (cảm giác nhảy, checkpoint đẹp, trợ giúp, trùm đọc `arena.difficulty`, trùm ghép `trio`),
  `input.js` nếu cần (vd phím số 1–3 cho câu đố: báo story-ui qua tài liệu).
- **Integrator**: bố cục menu (đưa PHIÊU LƯU làm nút chính), HUD trang sách, Audio cho event v2, đổi độ khó trong Cài đặt,
  áp `INTEGRATION.md`, cập nhật docs/tests.

---

## 11. Kiểm thử

`node tests/smoke.js` (thêm `--verbose` để xem cảnh báo dữ liệu hành trình). Phần v2 (`journeyChecks`):
validate 4 hành trình, cấm Trebuchet MS, menu → journeySelect, mỗi hành trình: chọn → truyện mở đầu (lướt + bỏ qua) →
journeyMap → Enter → (truyện khu) → màn: người dẫn đường (đến gần + E), rơi vực không mất mạng, nhặt trang → thẻ → đóng,
hết mạng 2 lần → hồi sinh + trợ giúp, cổng câu đố (sai 1 lần không phạt → đúng), EXIT, trùm theo chủ đề khu,
`level:complete{journeyId}`, (màn cuối → journeyEnd + `journey:complete`), sổ tay (mở thẻ, Esc);
pause → Bản đồ về journeyMap; chế độ challenge: game over → THỬ LẠI về journeyMap.
