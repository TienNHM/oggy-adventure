# Oggy Adventure: Kiến trúc và hợp đồng API

Tài liệu này là **hợp đồng chung** giữa 7 agent: 1 agent Tích hợp và 6 agent tính năng làm việc song song.
Ai cũng phải tuân theo. Nếu có mâu thuẫn giữa tài liệu này và chú thích trong code thì **tài liệu này được ưu tiên**.

---

## 0. Ràng buộc kỹ thuật

- Chỉ dùng HTML5 Canvas và JavaScript thuần. **Không** có build step, **không** dùng thư viện ngoài, **không** dùng ảnh hay âm thanh từ bên ngoài.
  Mọi hình vẽ làm bằng Canvas 2D, mọi âm thanh tổng hợp bằng Web Audio API.
- Game phải chạy được khi mở `index.html` qua `file://`, vì vậy **KHÔNG dùng ES modules** (`import`/`export`) và không dùng `fetch` để tải file cục bộ.
- Mỗi file JS là một **IIFE** dùng `'use strict'` và đăng ký vào namespace toàn cục `window.OG`:
  ```js
  (function () {
    'use strict';
    var OG = window.OG;
    OG.Foo = { init: function () {} };
  })();
  ```
- Viết code ES5/ES2015 vừa phải (dùng được `var/let/const`, arrow function, template string). Không dùng cú pháp cần transpile.
- Văn bản trong game viết bằng **tiếng Việt**. Game phải hỗ trợ cả bàn phím và cảm ứng.
- Code dễ đọc, không nén, có comment ngắn ở chỗ cần thiết.
- Sau khi viết xong, chạy `node --check <file>` cho mọi file JS đã tạo hoặc sửa.
- Mọi truy cập `localStorage` phải đi qua `OG.Save`, không gọi trực tiếp.
- Văn bản do người dùng nhập (tên người chơi) phải qua `OG.util.escapeHtml` trước khi chèn vào HTML.

---

## 1. Quyền sở hữu file (BẮT BUỘC)

| Agent | Được sửa | Namespace |
|---|---|---|
| **Tích hợp** | `index.html`, `src/core/**`, `src/game/**`, `src/data/**`, `docs/**`, `README.md` | `OG.Events, OG.Save, OG.Input, OG.Camera, OG.Physics, OG.DOM, OG.Scenes, OG.Loop, OG.Data, OG.Progress, OG.Game, OG.Player, OG.Enemies, OG.Collectibles, OG.Particles, OG.Level` |
| **Sprites** | `src/gfx/**` | `OG.Sprites` |
| **Audio** | `src/audio/**` | `OG.Audio` |
| **Bosses** | `src/bosses/**` | `OG.Bosses` |
| **World & Quests** | `src/world/**` | `OG.World`, `OG.Quests` |
| **Menus & Shop** | `src/ui/**` (kể cả `src/ui/ui.css`) | `OG.Menus`, `OG.Shop` |
| **Social** | `src/social/**` (kể cả `src/social/social.css`) | `OG.Social` |

Quy tắc:
1. Agent tính năng **chỉ** sửa thư mục của mình. Không được sửa `index.html`, `src/core/`, `src/game/`, `src/data/` hay thư mục của agent khác.
2. Không gán đè namespace của agent khác. Được phép **đọc** và **gọi** API công khai của mọi namespace.
3. Nếu cần thay đổi ở phần thuộc agent Tích hợp (thêm thẻ `<script>`, thêm event, sửa core), hãy ghi lại trong
   **`src/<thư-mục-của-bạn>/INTEGRATION.md`**: liệt kê file mới, vị trí trong thứ tự load, event mới và lý do.
   Agent Tích hợp đọc các file đó và áp dụng.
4. Mỗi agent đã có sẵn các file stub được load trong `index.html` (xem mục 2). **Nên viết code vào các file đó**
   để game chạy ngay mà không cần sửa `index.html`. Nếu thêm file mới, ghi vào `INTEGRATION.md`.
5. Thêm dữ liệu vào dữ liệu chung (skin, nhân vật, màn) thì gọi `OG.Data.registerSkin / registerCharacter / registerLevel`
   **từ file của mình**, không sửa `src/data/`.
6. Class CSS phải có tiền tố riêng: `.ui-*` (Menus & Shop), `.social-*` (Social). Không sửa style nội tuyến trong `index.html`.
7. Tên scene thuộc về agent nào thì chỉ agent đó đăng ký (xem mục 5).

---

## 2. Thứ tự load script (index.html)

```
<link> src/ui/ui.css, src/social/social.css   (sau <style> nội tuyến)

 1. Core         src/core/namespace.js   OG, OG.W/H/FLOOR_Y, OG.Config, OG.Palette, OG.util
                 src/core/events.js      OG.Events, OG.EV
                 src/core/save.js        OG.Save
                 src/core/input.js       OG.Input
                 src/core/camera.js      OG.Camera
                 src/core/physics.js     OG.Physics
                 src/core/dom.js         OG.DOM
                 src/core/scenes.js      OG.Scenes
                 src/core/loop.js        OG.Loop
 2. Data         src/data/characters.js  OG.Data.characters/skins/playable
                 src/data/levels.js      OG.Data.levels
 3. Sprites      src/gfx/sprites.js      OG.Sprites (nhân vật)
                 src/gfx/skins.js        skin oggy_chef/oggy_super + phụ kiện skin (OG.Sprites.skinGfx)
                 src/gfx/scenery.js      OG.Sprites (nền, sàn, đạo cụ)
 4. Audio        src/audio/audio.js      OG.Audio
                 src/audio/music.js      OG.Audio.tracks
 5. Game         src/game/particles.js   OG.Particles
                 src/game/progress.js    OG.Progress
                 src/game/game.js        OG.Game
                 src/game/player.js      OG.Player
                 src/game/enemies.js     OG.Enemies
                 src/game/collectibles.js OG.Collectibles
                 src/game/level.js       scene 'level', OG.Level
                 src/game/boss-scene.js  scene 'boss'
                 src/game/default-scenes.js  scene boot/menu/worldmap/pause/gameover/victory (MẶC ĐỊNH)
 6. Bosses       src/bosses/bosses.js    OG.Bosses (registry)
                 src/bosses/joey.js, marky.js, deedee.js, trio.js
 7. World        src/world/extraLevels.js  3 màn phụ basement/bathroom/attic (registerLevel lúc load)
                 src/world/world.js      OG.World
                 src/world/quests.js     OG.Quests
 8. UI           src/ui/menus.js         OG.Menus
                 src/ui/hud.js           OG.Menus.updateHud/drawHud
                 src/ui/shop.js          OG.Shop
 9. Social       src/social/social.js    OG.Social
                 src/social/leaderboard.js
10. Boot         src/core/main.js        LUÔN CUỐI
```

**Các giai đoạn chạy:**
- *Thời điểm load*: file chỉ khai báo API và có thể gọi `OG.Bosses.register(...)` hoặc `OG.Data.register*`.
  **Không** được truy cập `OG.Save.data`, vì lúc này dữ liệu lưu chưa được load.
- *`main.js` boot*: chạy theo thứ tự `OG.DOM.init()`, `OG.Save.load()`, `OG.Input.init(canvas)`, `OG.Progress.init()`, rồi gọi `init()` của từng module tính năng theo
  thứ tự **`Audio, Sprites, Bosses, World, Quests, Menus, Shop, Social`** (mỗi lời gọi bọc try/catch). Sau đó `OG.Scenes.go('boot')` và `OG.Loop.start()`.
- Các module tính năng **đăng ký scene thay thế bên trong `init()`**. Lần `register` sau ghi đè lần trước.

---

## 3. Quy ước toạ độ, kích thước, thời gian

- Canvas logic có kích thước **960 × 540** (`OG.W`, `OG.H`). CSS co giãn theo khung 16:9, còn toạ độ game không đổi.
- Gốc toạ độ ở góc trên-trái, trục **y hướng xuống**, đơn vị là pixel.
- **Mặt sàn** nằm ở `y = 480` (`OG.FLOOR_Y`). Sàn là platform đầu tiên của mỗi màn: `[0, 480, width, 60]`.
- Thế giới cuộn ngang. `OG.Camera.x` nằm trong khoảng `[0, worldW − 960]`, còn `Camera.y = 0`.
  Camera giữ nhân vật ở 38% bề ngang màn hình.
- **Hitbox** là `{x, y, w, h}`, trong đó `x,y` là **góc trên-trái**. Vật phẩm (`pizza`, `coin`) dùng `x,y` là **tâm**.
- **Điểm neo khi vẽ nhân vật**: người gọi `ctx.translate(x + w/2, y + h)`, tức điểm **giữa-đáy** (chân) của hitbox, rồi mới
  gọi `OG.Sprites.drawCharacter`. Hình vẽ nên nằm gọn trong khoảng `[-w/2..w/2] × [-h..0]` và được tràn ra tối đa khoảng 30%.
- Kích thước hitbox chuẩn (`OG.Data.characters`):

  | charId | role | w × h | speed | jump |
  |---|---|---|---|---|
  | oggy | player | 34 × 52 | 255 | 590 |
  | jack | player | 36 × 54 | 240 | 625 |
  | olivia | player | 32 × 50 | 280 | 575 |
  | roach | enemy | 34 × 28 | 75 + 12 × chỉ số màn | — |
  | joey | boss | 30 × 40 (×scale) | — | — |
  | marky | boss | 30 × 60 (×scale) | — | — |
  | deedee | boss | 50 × 50 (×scale) | — | — |

Bộ ba gián cũng xuất hiện như **kẻ địch thường** trong màn (`enemies[].type` = `joey | marky | deedee`, scale 1, hitbox như bảng trên):
Joey chạy nhanh và thỉnh thoảng lao gấp đôi, Marky đi chậm và nhảy cò cò, Dee Dee đi chậm và dừng lại "ăn". Giẫm được mọi lúc: Joey/Marky +70, Dee Dee +80.

- Vật lý lấy từ `OG.Config`: trọng lực 1500 px/s², rơi tối đa 900, nhảy 590 (đỉnh nhảy khoảng 116 px), di chuyển 255,
  bất tử 1,6 s sau khi bị thương, nảy khi giẫm địch 420. Platform là **một chiều**: chỉ đáp được từ trên xuống.
- Thời gian tính bằng **giây**. `dt` mỗi frame bị kẹp tối đa 0,033. `OG.time` là tổng thời gian kể từ khi khởi động.
- Các hàm `draw` không được làm lộ trạng thái `ctx` ra ngoài: luôn gọi `save()` và `restore()` theo cặp.

---

## 4. Palette màu (`OG.Palette`, biến CSS trên `:root`)

| Token | Màu | Dùng cho |
|---|---|---|
| ink | `#17233d` | chữ, viền, nền pill |
| cream | `#fff6df` | nền panel |
| gold | `#ffc94a` | xu, điểm nhấn |
| blue | `#52c5ee` | điểm nhấn |
| pageBg | `#10192b` | nền trang |
| orange / orangeShadow | `#f27a43` / `#b74b2b` | nút chính |
| secondary / secondaryShadow | `#52b9df` / `#2582aa` | nút phụ |
| titleOrange / titleGlow | `#ed713c` / `#ffd36b` | tiêu đề panel |
| panelText / panelShadow | `#25314a` / `#b87542` | panel |
| skyTop / skyBottom | `#76d8f2` / `#e8f6c7` | bầu trời |
| floor / grass | `#e9a34f` / `#75bd59` | sàn |
| plank / plankTop | `#b97945` / `#f5d28b` | bục |
| portalFrame / portalDoor | `#f4d45b` / `#5b9be8` | cửa EXIT |
| oggyHead / oggyBody / oggyEar / oggyFeet / oggyMuzzle | `#328be7` `#2877d5` `#2471cb` `#263b9b` `#d9f0ff` | Oggy |
| roachBody / roachShell / roachLeg | `#7d3e9b` `#b56bc7` `#4b285d` | gián con |
| joey / marky / deedee | `#c45bd1` / `#5fae4e` / `#e08a3c` | bộ ba gián |
| jack / olivia / oliviaAccent | `#58b84a` / `#f7f1ea` / `#f29bb8` | nhân vật phụ |
| danger / success | `#e5484d` / `#3fbf6f` | trạng thái |

Phong cách chung: hoạt hình phẳng, bo góc lớn, viền tối `ink` khi cần, chữ đậm dùng font hệ thống hỗ trợ đầy đủ tiếng Việt: `"Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif`. KHÔNG dùng Trebuchet MS (thiếu glyph tiếng Việt có dấu thanh như ạ, ữ, ỳ → vỡ font). Trên canvas: `ctx.font = "bold 14px \"Segoe UI\", system-ui, Roboto, Arial, sans-serif"`.

---

## 5. Scene (OG.Scenes)

```
OG.Scenes.register(name, scene)   // ghi đè nếu trùng tên
OG.Scenes.go(name, params)        // thay toàn bộ stack (exit cũ → enter mới), phát 'scene:change'
OG.Scenes.push(name, params)      // đè lên (vd pause); scene dưới không update nhưng vẫn được vẽ
OG.Scenes.pop()                   // gỡ scene trên cùng, gọi resume() của scene lộ ra
OG.Scenes.current() / base() / has(name) / get(name) / stackNames()
scene = { enter(params, fromName), exit(toName), update(dt), draw(ctx), resume(), drawBelow: bool }
```
Mỗi lần đổi scene, `OG.Input.reset()` được gọi để tránh kẹt phím.

| Scene | Chủ sở hữu | Mặc định (MVP) | Yêu cầu |
|---|---|---|---|
| `boot` | Tích hợp | chuyển ngay sang `menu` | — |
| `menu` | **Menus** | panel MVP, nút Bắt đầu | Chơi: `OG.Game.newRun(); OG.Scenes.go('worldmap')` |
| `charselect` | **Menus** | (chưa có) | xem `src/ui/menus.js` |
| `settings` | **Menus** | (chưa có) | |
| `shop` | **Menus & Shop** (`OG.Shop`) | (chưa có) | `params.back` = scene quay về |
| `worldmap` | **World** | tự vào màn `run.nextLevel` | chọn màn rồi gọi `OG.Game.startLevel(id)` |
| `level` | Tích hợp | gameplay | `params.levelId` |
| `boss` | Tích hợp (dùng `OG.Bosses`) | bỏ qua nếu không có trùm | `params.levelId, bossId` |
| `pause` | **Menus** | panel Tạm dừng | push; `drawBelow:true`; phát `game:pause`; Esc/P để tiếp tục (`pop`) |
| `gameover` | **Menus** | panel MVP | `params.result` (RunResult); gọi `OG.Social.mountResult(panel, result)` |
| `victory` | **Menus** | panel MVP | như trên |
| `leaderboard` | **Social** | (chưa có) | `params.back` |

Tiện ích vẽ nền dùng chung: `OG.drawTitleBackdrop(ctx)` (bếp kèm nhân vật đã chọn) và `OG.drawLastPlayScene(ctx)` (khung cảnh màn hoặc boss gần nhất, đứng yên).

**Luồng game:**
```
boot → menu → [newRun] → worldmap → level ─(đủ pizza + chạm EXIT, 0.9s ăn mừng)→ OG.Game.finishStage
   finishStage: level.boss && OG.Bosses.has(boss) ? boss : completeLevel
   boss ─(isDefeated, 1.6s)→ completeLevel
   completeLevel → 'level:complete' → (level.final ? victory : worldmap{completed})
   hết mạng (ở level/boss) → 'game:over' → gameover
   Esc/P/nút ⏸/mất focus → push pause  (pause → push settings{overlay} → pop)
   gameover/victory → Social.mountResult (nhập tên, lưu điểm, chia sẻ) → leaderboard{back, backParams:{result}} → quay lại
```
Menu chính: CHƠI (`newRun` → worldmap), Nhân vật (`charselect`), Cửa hàng (`shop`), Xếp hạng (`leaderboard`), Cài đặt (`settings`).
Màn phụ (`basement`, `bathroom`, `attic`) là tuỳ chọn: lượt chơi kết thúc (victory) khi xong `lair`.

---

## 6. Events (OG.Events)

```
OG.Events.on(name, fn) -> off()   OG.Events.once(name, fn)   OG.Events.off(name, fn)
OG.Events.emit(name, payload)     // listener nhận đúng 1 object; listener lỗi bị bắt lại
OG.Events.on('*', fn(name, payload))  // nghe mọi event (debug)
Hằng tên: OG.EV.*  (src/core/events.js)
```

| Event | Payload | Ai phát | Gợi ý người nghe |
|---|---|---|---|
| `scene:change` | `{from, to, params, push?, pop?}` | Scenes | Audio (đổi nhạc), Menus |
| `game:start` | `{charId, skinId, run}` | Game.newRun | Quests, Social |
| `game:pause` / `game:resume` | `{scene}` | pause scene / level, boss resume | Audio |
| `game:over` | `{result: RunResult}` | Game | Audio (`gameover`), Social |
| `game:victory` | `{result: RunResult}` | Game | Audio (`victory`), Social, Quests |
| `level:start` | `{levelId, index, name, theme, music, boss, quests}` | level | Audio (`playMusic(music)`), Quests |
| `level:exitLocked` | `{levelId, have, need}` | level | Audio (`locked`) |
| `level:clear` | `{levelId}` | level (chạm cửa đủ pizza) | Audio |
| `door:enter` | `{levelId, x, y}` | level | Audio (`door`) |
| `level:complete` | `LevelResult` | Game.completeLevel | Quests, World, Audio |
| `player:jump` | `{charId, x, y}` | Player | Audio (`jump`) |
| `player:land` | `{x, y, vy}` | Player | Audio (`land`), Sprites FX |
| `player:hurt` | `{lives, cause, shielded}` (`cause`: enemy, fall, boss, projectile) | Player.hurt | Audio (`hurt`), Quests |
| `player:action` | `{x, y, face}` (phím E/J, nút ✦) | Player | Bosses (nếu muốn), Audio |
| `player:die` | `{cause}` | Game | Audio |
| `item:collect` | `{type:'pizza'\|'coin', x, y, value, count, goal}` | level | Audio (`collect`/`coin`), Quests |
| `enemy:stomp` | `{type, x, y, score}` | level/boss | Audio (`stomp`), Quests |
| `score:change` | `{score, delta}` | Game | HUD |
| `coins:change` | `{coins, delta, reason}` (`reason`: pickup, level, quest, spend…) | Save.addCoins | HUD, Shop, Audio (`coin`) |
| `lives:change` | `{lives, maxLives}` | Game | HUD |
| `boss:start` | `{bossId, levelId, name, maxHp}` | boss scene | Audio (`playMusic('boss')`) |
| `boss:hit` | `{bossId, hp, maxHp}` | boss scene | Audio (`bossHit`), HUD |
| `boss:phase` | `{bossId, phase}` | **BossInstance** (tự phát) | Audio |
| `boss:defeated` | `{bossId, levelId, time}` | boss scene | Audio (`bossDefeat`), Quests |
| `quest:progress` | `{questId, progress, target}` | Quests | HUD |
| `quest:complete` | `{questId, reward, text}` | Quests | Audio (`quest`), Menus (toast) |
| `shop:purchase` | `{itemId, cost, kind}` | Shop | Audio (`purchase`) |
| `char:select` | `{charId}` | Menus | |
| `char:unlock` | `{charId, reason:'level'\|'shop'}` | Progress / Shop | Menus (toast) |
| `skin:equip` | `{charId, skinId}` | Menus/Shop | |
| `settings:change` | `{key, value}` | Save.setSetting | Audio, main (nút cảm ứng) |
| `leaderboard:submit` | `{entry, rank}` | Social | |
| `ui:click` | `{id}` | OG.DOM.button / panel | Audio (`click`) |
| `ui:toast` | `{text}` | OG.DOM.toast | |
| `input:tap` | `{x, y}` (toạ độ logic) | Input | World map |
| `input:firstGesture` | `{}` | Input (lần chạm/phím đầu tiên) | **Audio**: tạo hoặc resume AudioContext |
| `save:reset` | `{}` | Save.reset | mọi module có cache |
| `boss:heal` | `{bossId, hp, maxHp}` | Bosses (Dee Dee ăn bánh) | HUD |
| `boss:foodStolen` | `{bossId}` | Bosses (người chơi giật bánh) | Audio |
| `world:select` / `world:arrive` | `{levelId}` | World | Audio |
| `shop:use` | `{itemId, levelId\|null}` | Shop (tiêu thụ vật phẩm khi vào màn / đầu lượt) | Audio |
| `social:share` | `{method, ok}` | Social | Audio |
| `social:nameChange` | `{name}` | Social | |
| `social:onlineSubmit` | `{entry, ok, rank}` | Social (chỉ khi bật online) | |
| `leaderboard:clear` | `{}` | Social | |

Bổ sung payload: `player:jump` có `double:true` khi nhảy đôi (giày lò xo); `boss:hit` có `source:'reflect'` khi trúng đạn bị đánh bật;
`quest:complete` có thêm `category` (`level|daily|achievement`) và `levelId`; `leaderboard:submit` có `rename:true` khi chỉ đổi tên.
Hằng tên cho các event mở rộng cũng có trong `OG.EV` (`BOSS_HEAL, WORLD_SELECT, SHOP_USE, SOCIAL_SHARE...`).

Muốn thêm event mới thì đặt tên theo dạng `<module>:<việc>`, ví dụ `world:select`, rồi ghi vào `INTEGRATION.md`.
Event mới do module tự phát và tự nghe không cần sửa core.

### Kiểu dữ liệu

**LevelResult** (payload của `level:complete`):
```
{ levelId, index, name, levelScore, score, pizzas, pizzaTotal, goal, coins, coinTotal, coinsReward,
  stomps, hurts, noDamage, bossId, bossDefeated, bossNoDamage, time, stars (1..3),
  isFinal, firstClear, newlyUnlocked:[levelId], charsUnlocked:[charId] }
stars = 1 + (ăn hết pizza) + (không bị thương ở cả màn và trùm)
coinsReward = 5 + 5*stars (đã cộng vào ví trước khi phát event)
time = stage.playTime: giây chơi thật của màn + trùm, KHÔNG tính lúc tạm dừng/menu
```
**RunResult** (`game:over`, `game:victory`, `params.result` của gameover và victory):
```
{ type:'gameover'|'victory', score, bestScore, isNewBest, levelId, levelIndex, levelName,
  levelsCompleted:[levelId], charId, skinId, coinsEarned, time, stats:{stomps,hurts,pizzas,coins,bosses}, date }
time = run.playTime (không tính lúc tạm dừng). Với victory, levelId là màn final vừa thắng.
```

---

## 7. API của module core và game (agent Tích hợp, các agent khác dùng)

### OG (namespace.js)
`OG.W, OG.H, OG.FLOOR_Y, OG.Config, OG.Palette, OG.time, OG.canvas, OG.ctx`
`OG.util`: `clamp, lerp, rand, randInt, choice, now, roundRectPath(ctx,x,y,w,h,r), fillRound(ctx,x,y,w,h,r,color), safe(label,fn,self,args), call(ns, method, ...args), escapeHtml, overlap(a,b), formatTime(sec)`

### OG.Save
```
load()  commit()  get(path, fallback)  set(path, value)  ns(name) -> object riêng (nhớ commit())
getCoins()  addCoins(n, reason)  spendCoins(n, reason) -> bool  submitBest(score)
getItemCount(id)  addItem(id, n)  setSetting(key, value)  reset()  available:bool
```
Cấu trúc `OG.Save.data` (khoá localStorage `oggyAdventure.save.v1`; kỷ lục MVP `oggyBest` được tự chuyển sang):
```
{ v, coins, bestScore, playerName, selectedChar, unlockedChars:[charId],
  ownedSkins:[skinId], equippedSkins:{charId:skinId}, inventory:{itemId:count},
  progress:{ unlocked:[levelId], levels:{ levelId:{completed,bestScore,stars,bestTime,plays} } },
  settings:{ masterVolume:1, musicVolume:0.6, sfxVolume:0.8, muted:false, touchControls:'auto'|'on'|'off' },
  stats:{ plays, deaths, stomps, pizzas, coins, bossesDefeated, victories },
  ext:{ quests:{...}, social:{...}, ... } }
```
Module tính năng chỉ ghi vào `ext.<tên>` qua `OG.Save.ns()`. Ngoại lệ được phép:
Menus & Shop ghi `selectedChar, unlockedChars, ownedSkins, equippedSkins, inventory`; Social ghi `playerName`;
Audio và Menus ghi `settings` qua `OG.Save.setSetting`.

### OG.Input
```
keys.{left,right,up,down,jump,action,pause,confirm,back}  (đang giữ)
pressed(k) (vừa nhấn trong frame này)  consume(k)  setKey(k, bool)  reset()  bindTouch(rootEl)
pointer {x, y, down, justPressed, justReleased, inside}  (toạ độ logic 960×540)
```
Phím: A/D/←/→ để đi; Space/W/↑ để nhảy (W/↑ cũng là `up`); S/↓ là `down`; E/J là `action`; Esc/P để tạm dừng (Esc cũng là `back`); Enter là `confirm`.
Nút cảm ứng là mọi phần tử có thuộc tính `data-key="<phím logic>"`. Nếu tạo nút động, gọi `OG.Input.bindTouch(el)`.
Khi đang gõ vào `<input>`, Input bỏ qua phím.
`input:firstGesture` phát ở lần `pointerdown`/`touchstart`/`keydown` đầu tiên **ở bất kỳ đâu** (listener pha capture trên `window`), kể cả khi bấm nút DOM trong `#overlay`.

### OG.DOM
```
panel({title, html, buttons:[{id,label,primary,secondary,onClick}], small, className}) -> panelEl
button(label, onClick, {id, secondary}) -> <button> (tự phát ui:click)
hidePanel()  isPanelOpen()  toast(text, seconds=1.7)  setHudVisible(bool)  setControlsVisible(bool)
Phần tử: #gameShell #game #hud #overlay #toast #mobileControls #pauseBtn
```
Enter sẽ bấm nút primary của panel đang mở.

### OG.Camera
`x, y, reset(), follow(target, worldW), shake(mag, dur), update(dt), apply(ctx), toWorld(sx, sy)`

### OG.Physics
`moveBody(body, dt, platforms, {gravity,maxFall,minX,maxX}) -> {landed, prevBottom}`, `aabb(a,b)`, `isStomp(body, prevBottom, target, tol)`

### OG.Data
```
characters{id: {id,name,role,w,h,speed,jump,desc,unlock,colors}}  playable:[charId]
skins:[{id,charId,name,price,colors}]  levels:[LevelDef]
getCharacter(id) getSkin(id) skinsFor(charId) resolveColors(charId, skinId)
registerSkin(skin) registerCharacter(ch) getLevel(idOrIndex) levelIndex(id) registerLevel(level)
```
`unlock` của nhân vật có một trong ba dạng: `{type:'free'}`, `{type:'coins', cost}`, `{type:'level', levelId}`. Dạng `level` được Progress tự mở khoá, dạng `coins` do Shop xử lý.
Các khoá màu nhân vật gồm `body, head, ear, feet, muzzle, accent`. Gián và trùm dùng `body, shell, leg`.

### LevelDef (src/data/levels.js)
```
{ id, name, icon, theme, music, width, spawn:{x,y}, goal, platforms:[[x,y,w,h]], pizzas:[[x,y]],
  coins:[[x,y]], enemies:[{type,x,range,speed,dir}], exit:{x}, boss:bossId|null,
  requires:[levelId]?, final:bool?, map:{x,y}, quests:[{id,type,target?,text,reward}] }
```
Bốn màn hiện có:

| Màn | Trùm | Giao diện |
|---|---|---|
| `kitchen` (Nhà bếp náo loạn) | `deedee` | `kitchen` |
| `garden` (Khu vườn bí mật) | `marky` | `garden` |
| `roof` (Cuộc đua trên mái nhà) | `joey` | `roof` |
| `lair` (Hang ổ bộ ba gián, `final`) | `trio` | `lair` |
| `basement` (Tầng hầm tối om, phụ) | — | `lair` · `requires: ['kitchen']` |
| `bathroom` (Phòng tắm trơn trượt, phụ) | — | `kitchen` · `requires: ['garden']` |
| `attic` (Gác mái bụi bặm, phụ) | — | `roof` · `requires: ['roof']` |

Mặc định mỗi màn chỉ mở khi màn liền trước đã hoàn thành. Ba màn phụ do `src/world/extraLevels.js` đăng ký, ghi `requires` tường minh và `final: false`
(field mở rộng chỉ World đọc: `zone`, `mapStyle`, `bonus`). `Progress.maxStars()` = 7 × 3 = 21.

### OG.Progress
`init() isUnlocked(id) isCompleted(id) getRecord(id) unlock(id) refreshUnlocks() complete(id, result) nextLevelId(id) firstIncomplete() allCompleted() totalStars() maxStars() isFinal(id)`

### OG.Game
```
run: { charId, skinId, score, lives, maxLives, coinsEarned, startTime, playTime, nextLevel(index), levelsCompleted, over, mods, stats }
stage: { levelId, levelScore, pizzas, pizzaTotal, goal, coins, coinTotal, stomps, hurts, bossHurts, bossId, bossDefeated, startTime, playTime }
hud: HudState (mục 8, UI)
newRun({charId?, skinId?})  ensureRun()  startLevel(idOrIndex)  finishStage(levelId)  completeLevel(levelId)
tickTime(dt) /* scene level|boss gọi mỗi frame: cộng playTime, cập nhật hud.time */  addScore(n)  pickupCoins(n)  loseLife(cause)  gainLife(n)  gameOver()  victory()  buildResult(type)  refreshHud()  levelMods(levelId)
```
Điểm số: pizza +100, xu +10 (kèm 1 xu vào ví), giẫm gián +50, đánh trúng trùm +100, hạ trùm +500.

### Khác
`OG.Player.create/update/hurt/draw/animState` — cuối `update` gọi `OG.util.call('Shop','tickPlayer', p, dt)` (nhảy đôi; Shop tự chống gọi trùng),
`draw` truyền `worldX/worldY` (chân, toạ độ thế giới) cho Sprites để đặt bụi chạy.
`OG.BossScene.isActive() / draw(ctx) / getPlayer() / getArena() / getBoss()` (trận đang diễn ra hoặc null).
`OG.Enemies` có sẵn loại `roach, joey, marky, deedee`. `OG.Particles.spawn` nhận thêm `shape` (`dust|spark|star|circle`) và vẽ qua `OG.Sprites.drawParticle` nếu có.
 `OG.Enemies.registerType(name, {w,h,score,stompable,init,update,draw}) / create / kill / hurtbox`,
`OG.Collectibles.registerType(name, {emoji, score}) / create / touches / draw`, `OG.Particles.spawn(x,y,opts) / floatText(x,y,text,color)`,
`OG.Level.state / drawWorld(ctx)`.

---

## 8. API của module tính năng (các stub đã có sẵn và được gọi từ core/game)

Mọi lời gọi từ core hoặc game vào module tính năng đi qua `OG.util.call(ns, method, ...)`. Nếu hàm không tồn tại hoặc ném lỗi thì
game vẫn chạy. Tuy vậy, **phải giữ đúng tên và chữ ký hàm**.

### 8.1 OG.Sprites (src/gfx/), agent Sprites
```
init()
drawCharacter(ctx, charId, animState, t, opts)   // BẮT BUỘC luôn vẽ được thứ gì đó cho mọi charId
   charId: oggy | jack | olivia | joey | marky | deedee | roach | (đăng ký thêm)
   animState: idle | run | jump | fall | hurt | attack | victory   (+ tuỳ chọn: walk, stunned, dead)
   t: giây kể từ khi bắt đầu animState (player) hoặc đồng hồ chạy (địch)
   opts: { face:1|-1, skin:skinId|null, colors:{} (đè), scale:1, alpha:1, flash:bool, w, h, vx, vy, time }
   Gốc toạ độ = chân (giữa-đáy hitbox). Phải tự save/restore.
getAnimStates() -> [animState]
drawBackground(ctx, theme, camX, t)        // không gian MÀN HÌNH, phủ kín 960×540, có parallax theo camX
drawPlatform(ctx, plat{x,y,w,h,isFloor}, theme, t)   // không gian thế giới
drawDecor(ctx, theme, worldW, t)           // không gian thế giới, sau sàn
drawProp(ctx, propId, x, y, t, opts) -> bool   // pizza|coin (tâm) · exit (x=mép trái, y=mặt sàn, opts.open) · heart|shield|star
   theme: kitchen | garden | roof | lair | boss   (roof: hoàng hôn + mái ngói; lair: hang tối + mắt gián)
```
Trùm thường gọi `OG.Sprites.drawCharacter(ctx, 'joey', 'attack', t, {scale: 2.2, face: -1, flash})`.
Sprites có thể cung cấp thêm hàm tuỳ chọn, ví dụ `drawPortrait(ctx, charId, x, y, size)` cho menu chọn nhân vật. **Bên gọi phải kiểm tra hàm tồn tại trước khi gọi.**

### 8.2 OG.Audio (src/audio/), agent Audio
```
init()  playMusic(trackId)  stopMusic()  sfx(name)  setVolume('music'|'sfx', v)  getVolume(ch)
mute(bool)  isMuted()  toggleMute()  currentTrack  tracks
trackId: menu | worldmap | kitchen | garden | roof | lair | boss | victory | gameover
sfx:     jump | collect | coin | hurt | stomp | door | locked | bossHit | bossDefeat | click | victory |
         gameover | pause | quest | purchase | land
```
Audio **tự lắng nghe event** để phát âm thanh, gameplay không gọi Audio trực tiếp. Bảng ánh xạ gợi ý:
`scene:change` sang menu, worldmap, victory hoặc gameover thì đổi nhạc tương ứng; `level:start` phát `playMusic(music)`; `boss:start` phát `boss`;
`player:jump` phát `jump`; `item:collect` phát `collect` hoặc `coin`; `player:hurt` phát `hurt`; `enemy:stomp` phát `stomp`; `door:enter` phát `door`;
`level:exitLocked` phát `locked`; `boss:hit` phát `bossHit`; `boss:defeated` phát `bossDefeat`; `ui:click` phát `click`;
`game:victory` phát `victory`; `game:over` phát `gameover`; `game:pause` phát `pause` (giảm nhạc); `quest:complete` phát `quest`; `shop:purchase` phát `purchase`.
AudioContext chỉ được tạo hoặc resume sau `input:firstGesture`. Cài đặt lưu ở `OG.Save.data.settings`.

### 8.3 OG.Bosses (src/bosses/), agent Bosses
```
init()  register(def)  has(id)  list()  getInfo(id)  getArena(id)  create(id, arena)
def = { id, name, maxHp, arena?: {width, platforms:[[x,y,w,h]], spawn:{x,y}, theme}, create(arena) -> BossInstance }
BossInstance = { id, name, hp, maxHp, phase, x, y, w, h,
   update(dt, arena), draw(ctx, arena) /* không gian thế giới */,
   getHurtboxes() -> [rect], getWeakspot() -> rect|null, onHit(dmg, arena), isDefeated() -> bool }
Arena = { levelId, bossId, theme, width, height, floorY, t, platforms, player, enemies,
   hurtPlayer(cause), overlapsPlayer(rect), shake(mag,dur), particles(x,y,opts), floatText(x,y,text,color),
   toast(text), emit(name,payload), addScore(n), spawnEnemy({type,x,range,speed}) }
```
Trùm cần làm: `deedee` (màn kitchen), `marky` (garden), `joey` (roof), `trio` (lair, cả ba cùng lúc, trận cuối).
Scene boss lo phần giẫm điểm yếu (`boss:hit`, nảy người chơi, +100), phần chạm hurtbox, thanh máu trên HUD và phát `boss:start` / `boss:defeated`.
Trùm tự xử lý đạn của mình bằng `arena.overlapsPlayer` và `arena.hurtPlayer('projectile')`, đồng thời tự phát `boss:phase`.
Mỗi trùm nên có 2–3 phase, có khoảng hở để người chơi giẫm, và có báo hiệu trước mỗi đòn đánh (telegraph). Màn hình đấu mặc định rộng 960 px, có 2 bục ở y=370.

### 8.4 OG.World và OG.Quests (src/world/), agent World & Quests
```
OG.World: init() (đăng ký scene 'worldmap'), enabled, focusLevel(levelId)
OG.Quests: init(), list(), getForLevel(levelId), getHudLines(levelId) -> [{id,text,done,progress,target}], claim(questId)
Quest = {id, levelId|null, type, text, target, reward, progress, done, claimed}
type: collect_all | no_damage | stomp_n | time_under | coins_n | boss_no_damage | complete
      (mở rộng cho nhiệm vụ ngày / thành tựu: pizza_n | boss_n | stars_n | levels_n | complete_n)
getHudLines còn trả field 'failed' (không còn đạt được trong lượt này).
```
Bản đồ thế giới đọc `OG.Data.levels[].map` và `OG.Progress`, điều khiển được bằng bàn phím lẫn chạm, rồi gọi `OG.Game.startLevel(id)`.
Quests lưu trong `OG.Save.ns('quests')` và thưởng qua `OG.Save.addCoins(n, 'quest')`.

### 8.5 OG.Menus và OG.Shop (src/ui/), agent Menus & Shop
```
OG.Menus: init() (đăng ký menu, charselect, settings, pause, gameover, victory)
          updateHud(hud)   // BẮT BUỘC; gọi khi HUD đổi; được thay toàn bộ nội dung #hud
          drawHud(ctx, hud) // BẮT BUỘC; mỗi frame, không gian màn hình (thanh máu trùm...)
OG.Shop:  init() (đăng ký 'shop'), listItems(), buy(itemId) -> bool,
          getRunModifiers(charId) -> Modifiers, getLevelModifiers(levelId, charId) -> Modifiers
HudState = { scene, levelId, levelName, icon, pizzas, goal, lives, maxLives, score, coins, shield, time,
             boss:null|{id,name,hp,maxHp}, quests:[{id,text,done,progress,target}] }
Modifiers = { extraLives, speedMul, jumpMul, magnet(px), shield(int), coinMul, scoreMul }
```
Scene gameover và victory **phải** gọi `OG.Social.mountResult(panelEl, result)`.

### 8.6 OG.Social (src/social/), agent Social
```
init() (có thể đăng ký 'leaderboard')  mountResult(panelEl, result)
getPlayerName()  setPlayerName(name)  share(result) -> Promise<bool>  captureCanvas() -> dataURL|null
downloadScreenshot(filename)  submitScore(entry) -> rank|-1  getLeaderboard(limit)  clearLeaderboard()
entry = {name, score, charId, levelId, levelsCompleted, time, date, type}
```
Leaderboard lưu trong `OG.Save.ns('social').leaderboard`, tối đa 10 mục. Khi chia sẻ, ưu tiên `navigator.share`. Nếu không có, dùng
`navigator.clipboard.writeText`, và nếu vẫn không được thì dùng `<textarea>` cùng `execCommand('copy')`. Nếu có thể, chia sẻ kèm ảnh chụp canvas.

---

## 9. Checklist cho mỗi agent tính năng

1. Chỉ sửa thư mục của mình. Giữ nguyên tên file stub, vì các file đó đã nằm trong `index.html`.
2. Giữ đúng chữ ký API ở mục 8 và đăng ký scene trong `init()`.
3. Không truy cập `OG.Save.data` lúc load file. Chỉ truy cập trong `init()` hoặc sau đó.
4. Mọi thao tác DOM nằm trong `#gameShell`. Không dùng `alert` hay `prompt`.
5. Phải chơi được bằng bàn phím và bằng cảm ứng. Kích thước chạm tối thiểu khoảng 44 px.
6. Chạy `node --check` cho mọi file JS đã sửa.
7. Nếu cần agent Tích hợp làm gì, ghi vào `src/<dir>/INTEGRATION.md`.

---

## 10. Kiểm thử

- `node --check <file>` cho mọi file JS.
- **Smoke test**: `node tests/smoke.js` (thêm `--verbose` để xem từng bước). Không cần thư viện ngoài:
  `tests/fake-dom.js` dựng window/document (parser HTML + selector đơn giản, event capture/bubble, form submit),
  canvas 2D giả (Proxy, theo dõi cân bằng `save/restore`), `localStorage`, `AudioContext` giả và đồng hồ/timer ảo.
  Test đọc `index.html`, load mọi `<script src>` theo đúng thứ tự bằng `vm`, rồi chơi qua: menu → cài đặt / nhân vật /
  cửa hàng (mua giày lò xo) / xếp hạng → bản đồ (Enter) → 4 màn + 4 trùm (giẫm điểm yếu) → chiến thắng → nhập tên → bảng xếp hạng → chia sẻ;
  tạm dừng (Esc, nút ⏸, P, cài đặt chồng lên pause), nhảy đôi, 3 màn phụ với Jack/Olivia và skin, game over, xoá dữ liệu.
  Phần `qaChecks()` kiểm tra hồi quy: thời gian tạm dừng không tính vào màn, chơi lại màn từ trận trùm, pause → bản đồ,
  tự tạm dừng khi ẩn tab/mất focus, nhạc đổi theo scene (một sequencer), thua trong trận trùm, kết quả chiến thắng ghi đúng màn,
  toast nhiệm vụ không lặp, khiên/nam châm/tim có tác dụng, giữ phím ←/→ qua lúc đổi scene, Enter trên nút đang focus,
  dữ liệu lưu vào localStorage, và số listener/setInterval không tăng sau nhiều lượt chơi lại.
  Mọi `console.error`, ngoại lệ trong frame/listener/timer, `ctx.save/restore` lệch và lời gọi `alert/confirm/prompt` đều là lỗi (thoát mã 1).
