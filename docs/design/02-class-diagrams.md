# 02 · Sơ đồ lớp của các namespace `OG.*`

Game không có `class` của JavaScript. Mỗi file là một **IIFE** (hàm tự gọi ngay khi nạp) tạo ra **một object** và gắn vào
`window.OG` — đó là **module pattern**. Biến khai báo bên trong IIFE là **nội bộ** (private, ký hiệu `-`), field gắn vào `OG.X`
là **công khai** (public, ký hiệu `+`). Vì mỗi module chỉ có **một** object, ta vẽ nó như một lớp có đúng một thể hiện (singleton).

Phụ thuộc giữa các module ở mức thư mục đã có trong [ARCHITECTURE-DIAGRAMS mục 1](../learn/ARCHITECTURE-DIAGRAMS.md#1-module-và-phụ-thuộc-giữa-các-namespace-og).
Trang này đi vào **bên trong** từng module: dữ liệu, hàm, và các "giao diện" (interface) mà module khác phải tuân theo.

Mục lục:
1. [Scene: interface và máy trạng thái `OG.Scenes`](#1-scene-interface-và-máy-trạng-thái-ogscenes)
2. [Lõi engine: Events, Input, Loop, Camera, Physics](#2-lõi-engine-events-input-loop-camera-physics)
3. [Gameplay: Game, Level + hook, Player, Enemies, Difficulty](#3-gameplay-game-level--hook-player-enemies-difficulty)
4. [Trùm (`OG.Bosses`)](#4-trùm-ogbosses)
5. [Đồ hoạ: Sprites (cache LRU), Scenery, Decor](#5-đồ-hoạ-sprites-cache-lru-scenery-decor)
6. [Âm thanh: Audio + sequencer nhạc](#6-âm-thanh-audio--sequencer-nhạc)
7. [Học tập: Story, Learn, Guide, Photos](#7-học-tập-story-learn-guide-photos)
8. [Lưu trữ và mạng xã hội: Save, Social, backend adapter](#8-lưu-trữ-và-mạng-xã-hội-save-social-backend-adapter)
9. [Bảng tổng hợp design pattern](#9-bảng-tổng-hợp-design-pattern)

---

## 1. Scene: interface và máy trạng thái `OG.Scenes`

```mermaid
classDiagram
  class Scene {
    <<interface>>
    +enter(params, fromName)
    +exit(toName)
    +update(dt)
    +draw(ctx)
    +resume()
    +drawBelow : bool
  }
  class Scenes["OG.Scenes"] {
    -registry : name→Scene
    -stack : StackEntry[]
    +register(name, scene) Scene
    +get(name) Scene
    +has(name) bool
    +current() string
    +base() string
    +stackNames() string[]
    +go(name, params)
    +push(name, params)
    +pop()
    +update(dt)
    +draw(ctx)
  }
  class StackEntry {
    +name : string
    +scene : Scene
  }
  class level["scene 'level'"] {
    drawBelow mặc định
  }
  class boss["scene 'boss'"]
  class pause["scene 'pause'"] {
    drawBelow = true
  }
  class quiz["scene 'quiz'"] {
    drawBelow = true
    +choose(i)
    +finishPass()
    +later()
  }
  class comic["scene 'comic'"] {
    drawBelow = params.overlay
    +advance()
    +back()
    +finish(skipped)
  }
  class card["scene 'card'"] {
    drawBelow = true
    +close()
    +photo()
  }
  Scenes o-- StackEntry : stack
  StackEntry --> Scene
  level ..|> Scene
  boss ..|> Scene
  pause ..|> Scene
  quiz ..|> Scene
  comic ..|> Scene
  card ..|> Scene
```
[(xem SVG)](svg/02-scenes.svg)

**Cách đọc:** mọi scene chỉ là object có (một phần) các hàm của interface `Scene` (khai báo trong [src/types.d.ts](../../src/types.d.ts)).
`OG.Scenes` ([src/core/scenes.js](../../src/core/scenes.js)) giữ một `registry` (tên → scene) và một `stack` (ngăn xếp). `update` chỉ gọi
scene **trên cùng**; `draw` vẽ từ scene thấp nhất còn nhìn thấy (dừng ở scene có `drawBelow === false`) lên đỉnh.

**Pattern:**
- **State** (trạng thái): mỗi scene là một trạng thái, `go/push/pop` là chuyển trạng thái. Các luồng chuyển: [ARCHITECTURE-DIAGRAMS mục 2](../learn/ARCHITECTURE-DIAGRAMS.md#2-state-machine-các-scene).
- **Registry + "stub rồi ghi đè"**: `register` lần sau ghi đè lần trước, nên [src/game/default-scenes.js](../../src/game/default-scenes.js) đăng ký menu/pause mặc định,
  rồi [src/ui/menus.js](../../src/ui/menus.js) đăng ký bản thật trong `init()`.
- **Interface tuỳ chọn**: `OG.Scenes` kiểm tra `if (scene.enter)` trước khi gọi, và bọc bằng `OG.util.safe` → scene lỗi không làm kẹt máy trạng thái.

**Vì sao stack thay vì một biến `currentScene`:** pause, thẻ, câu đố chỉ cần `push` lên trên màn chơi; màn chơi bên dưới tự "đóng băng"
(không được `update`) mà không cần cờ `isPaused` rải khắp code. **Đánh đổi:** phải nhớ `pop` đúng lúc, và callback chạy sau `pop` (vd `onPass`
của câu đố) phải được gọi **sau** khi pop xong (xem `finishPass`, và bẫy "pop TRƯỚC rồi mới gọi cb" trong `comic.finish`).

---

## 2. Lõi engine: Events, Input, Loop, Camera, Physics

```mermaid
classDiagram
  class Events["OG.Events"] {
    -listeners : name→fn[]
    +on(name, fn) Unsubscribe
    +off(name, fn)
    +once(name, fn) Unsubscribe
    +emit(name, payload)
    +clear(name)
  }
  class EV["OG.EV"] {
    <<constants>>
    +SCENE_CHANGE = 'scene:change'
    +PLAYER_JUMP = 'player:jump'
    +PAGE_COLLECT = 'page:collect'
    +... 60+ hằng
  }
  class Input["OG.Input"] {
    +keys : left,right,up,down,jump,action,pause,confirm,back,num1..3
    +pointer : x,y,down,justPressed,justReleased,inside
    -down : vừa nhấn trong frame
    -sources : 'phím:nguồn'→true
    +init(canvas)
    +pressed(k) bool
    +consume(k)
    +setKey(k, v)
    +reset()
    +endFrame()
    +bindTouch(root)
    +hasGesture() bool
  }
  class Loop["OG.Loop"] {
    +ctx
    +fps : EMA
    +start(ctx)
    +step(dt)
    -frame(t)
    -tick(dt)
  }
  class Camera["OG.Camera"] {
    +x, y : px thế giới
    +ox, oy : lệch do rung
    +reset()
    +follow(target, worldW)
    +shake(mag, dur)
    +update(dt)
    +apply(ctx)
    +toWorld(sx, sy) Vec2
  }
  class Physics["OG.Physics"] {
    +moveBody(body, dt, platforms, opts) MoveResult
    +aabb(a, b) bool
    +isStomp(body, prevBottom, target, tolerance) bool
  }
  class AABB {
    +x, y, w, h
  }
  class PhysicsBody {
    +vx, vy : px/giây
    +ground : bool
  }
  class MoveResult {
    +landed : bool
    +prevBottom : number
  }
  PhysicsBody --|> AABB
  Physics ..> PhysicsBody : sửa trực tiếp
  Physics ..> MoveResult : trả về
  Events ..> EV : tên chuẩn
  Input ..> Events : emit firstGesture, tap
  Loop --> Camera : update(dt)
  Loop ..> Input : endFrame() cuối frame
```
[(xem SVG)](svg/02-core.svg)

**Cách đọc:**
- `OG.Events` ([src/core/events.js](../../src/core/events.js)) là **event bus**: `listeners` là bảng tên → mảng hàm. `on` trả về hàm huỷ đăng ký;
  `emit` duyệt trên **bản sao** mảng và bọc từng listener bằng `OG.util.safe`; listener `'*'` nhận mọi event. `OG.EV` là bảng **hằng tên** event.
- `OG.Input` ([src/core/input.js](../../src/core/input.js)) tách **đang giữ** (`keys.*`) khỏi **vừa nhấn** (`down`, đọc bằng `pressed`, xoá ở `endFrame`).
  `sources` đếm **nguồn** giữ phím (bàn phím, nút cảm ứng, chạm nửa phải) để nhả một nguồn không tắt phím khi nguồn kia vẫn giữ.
  Input phát `input:firstGesture` (lần chạm/phím đầu tiên) và `input:tap` nhưng **không biết** ai nghe (Audio dùng cái đầu để mở khoá âm thanh).
- `OG.Loop` ([src/core/loop.js](../../src/core/loop.js)): `frame` (gọi bởi `requestAnimationFrame`) tính `dt`, gọi `tick`; `step(dt)` cho smoke test gọi thẳng `tick`.
- `OG.Physics` ([src/core/physics.js](../../src/core/physics.js)) là **hàm thuần** trên dữ liệu: nhận `PhysicsBody` (một `AABB` có vận tốc), sửa trực tiếp, trả `MoveResult`.
  `Player` và `Enemy` trong [src/types.d.ts](../../src/types.d.ts) đều `extends` các kiểu này.

**Pattern:** **Observer / publish–subscribe** (`Events`), **Facade** nhỏ (`Input` gói bàn phím + chuột + cảm ứng thành phím logic),
**hàm thuần trên dữ liệu** (`Physics`: không giữ trạng thái, dễ test). **Vì sao Physics không là "class Body có method move()":** player, kẻ địch,
trùm có hình dạng dữ liệu khác nhau; chỉ cần có `x, y, w, h, vx, vy, ground` là dùng được `moveBody` (duck typing — "kêu như vịt thì là vịt").

---

## 3. Gameplay: Game, Level + hook, Player, Enemies, Difficulty

```mermaid
classDiagram
  class Game["OG.Game"] {
    +run : RunState
    +stage : StageStats
    +hud : HudState
    +newRun(opts) RunState
    +startLevel(idOrIndex)
    +beginStage(level)
    +tickTime(dt)
    +loseLife(cause) number
    +finishStage(levelId)
    +completeLevel(levelId) LevelResult
    +backToMap(params)
    +restartLevel()
    +retryRun()
    +gameOver()
    +victory()
  }
  class Level["OG.Level"] {
    +state : LevelState
    -hooks : LevelHook[] sắp theo order
    +addHook(hook)
    +removeHook(id)
    +hookIds()
    +drawWorld(ctx, st)
    +stompOk(p, prevBottom, target, tol, prevTop)
    +touchOk(p, box)
  }
  class LevelHook {
    <<interface>>
    +id : string
    +order : number
    +enter(st)
    +update(st, dt, player) bool
    +canExit(st, player) bool
    +drawWorld(ctx, st, t)
    +drawFront(ctx, st, t)
    +drawScreen(ctx, st, t)
  }
  class checkpoints["hook 'checkpoints' (10)"]
  class learn["hook 'learn' (20)"]
  class guide["hook 'guide' (30)"]
  class storyComics["hook 'story-comics' (40)"]
  class Player["OG.Player"] {
    +create(charId, x, y, mods, skinId) Player
    +update(p, dt, world) MoveResult
    +animState(p) string
    +hurt(p, cause) bool
    +draw(ctx, p, t)
  }
  class Enemies["OG.Enemies"] {
    +types : name→EnemyTypeDef
    +registerType(name, def)
    +create(src, index) Enemy
    +update(e, dt, world)
    +hurtbox(e) AABB
    +kill(e)
  }
  class EnemyTypeDef {
    <<interface>>
    +w, h, score, stompable
    +init(e, src)
    +update(e, dt, world)
    +draw(ctx, e, t)
  }
  class Difficulty["OG.Difficulty"] {
    +MODES : kid, challenge
    +ASSIST : 1, 2
    +mode() string
    +set(m)
    +params(levelId) Object
    +get(key, levelId)
    +startLives()
    +scaleEnemy(e)
    +setupBoss(boss, arena)
    +bossTimeScale()
    +onFall(p, world) bool
    +softFail(info) bool
    +recordFail(levelId)
  }
  Level o-- LevelHook : hooks
  checkpoints ..|> LevelHook
  learn ..|> LevelHook
  guide ..|> LevelHook
  storyComics ..|> LevelHook
  Enemies o-- EnemyTypeDef : registry
  Level ..> Player
  Level ..> Enemies
  Level ..> Game : finishStage
  Game ..> Difficulty : util.call softFail
  Player ..> Difficulty : coyoteTime, hurtInvuln
```
[(xem SVG)](svg/02-gameplay.svg)

**Cách đọc:**
- `OG.Game` ([src/game/game.js](../../src/game/game.js)) giữ **lượt chơi** (`run`), **màn hiện tại** (`stage`, dùng chung cho màn và trận trùm ngay sau)
  và quyết định luồng **màn → trùm → bản đồ** (`finishStage`, `completeLevel`, `backToMap`).
- `OG.Level` ([src/game/level.js](../../src/game/level.js)) vừa là scene `'level'` vừa là **điểm cắm** `addHook`. Bốn hook cài interface `LevelHook`
  nằm ở bốn file khác: [difficulty.js](../../src/game/difficulty.js) (`checkpointHook`), [learn.js](../../src/story/learn.js) (`learnHook`),
  [guide.js](../../src/story/guide.js), [story.js](../../src/story/story.js). Số trong ngoặc là `order` (nhỏ chạy trước).
- `OG.Enemies` ([src/game/enemies.js](../../src/game/enemies.js)) là **registry** loại địch: `roach`, `joey`, `marky`, `deedee` có sẵn, hành trình đăng ký thêm
  (`science-crab`, `vietnam-roach`...) trong `extras.js`.

**Pattern:**
- **Plugin / hook** (gần với **template method**): `level.update` cố định thứ tự các bước (người chơi → rơi vực → hook → vật phẩm → kẻ địch → cửa ra);
  hook chỉ điền vào các "khe" `enter/update/canExit/draw*`. `update` trả `true` = dừng frame (vd vừa push câu đố). `level.js` không có dòng nào về
  checkpoint hay trang sách.
- **Strategy + registry** (`EnemyTypeDef`): mỗi loại địch là một bộ hàm `init/update/draw`; `create` tra theo `type` trong dữ liệu màn.
- **Tham số hoá độ khó** (`Difficulty.params`): mọi nơi hỏi `get('coyoteTime')`, `get('enemySpeedMul')`... thay vì `if (kid)`; có cache theo
  khoá `mode | màn | version`.

**Đánh đổi của hook:** thứ tự `order` là hợp đồng ngầm (checkpoint 10 phải chạy trước để cập nhật vị trí an toàn sớm nhất); đọc code `level.js`
một mình không thấy hết hành vi của màn.

---

## 4. Trùm (`OG.Bosses`)

```mermaid
classDiagram
  class Bosses["OG.Bosses"] {
    -defs : id→BossDef
    +factories : id→fn(arena, cfg)
    +kit : K
    +init()
    +register(def)
    +has(id) bool
    +list() string[]
    +getInfo(id)
    +getArena(id)
    +create(id, arena) BossInstance
  }
  class Kit["OG.Bosses.kit (K)"] {
    +createBase(spec, arena, cfg) BossInstance
    +spawnProj(b, p)
    +updateProjectiles(b, dt, arena)
    +diffOf(arena) BossDifficulty
    +drawTelegraph(ctx, b, t, k)
    +drawWarnZone(...)
    +drawStompHint(ctx, x, y, t)
    +normalizeArena(arena)
  }
  class BossInstance {
    +id, name, hp, maxHp, phase
    +state : string
    +stateT, stateDur : giây
    +patterns : phase→action[]
    +update(dt, arena)
    +draw(ctx, arena)
    +setState(s, dur)
    +stateDone() bool
    +choose(arena)
    +onHit(dmg, arena) bool
    +getWeakspot() AABB
    +getHurtboxes() AABB[]
    +isDefeated() bool
  }
  class BossHooks {
    <<interface>>
    +startAction(a, arena)
    +think(dt, arena)
    +isVulnerable() bool
    +isFullHurt() bool
    +onHurt(arena)
    +drawBehind(ctx, arena, t)
    +drawFront(ctx, arena, t)
  }
  class DeeDee["deedee.js"] {
    SPEC phaseAt [3, 1]
  }
  class Joey["joey.js"] {
    SPEC 3 pha
  }
  class Marky["marky.js"] {
    SPEC 3 pha
  }
  class Trio["trio.js (composite)"] {
    -members : BossInstance[3]
    -ctrl : BossTurnCtrl
    +syncHp()
    +onHit(dmg, arena, member)
    +isDefeated() bool
  }
  class BossTurnCtrl {
    +request(member) bool
    +release(member)
  }
  class Arena {
    +levelId, bossId, theme, width, floorY
    +player : Player
    +enemies : Enemy[]
    +difficulty : Object
    +hurtPlayer(cause)
    +overlapsPlayer(rect) bool
    +shake(mag, dur)
    +emit(name, payload)
    +addScore(n)
    +spawnEnemy(src)
  }
  Bosses *-- Kit
  Kit ..> BossInstance : tạo khung
  BossInstance ..> BossHooks : gọi nếu có
  DeeDee ..|> BossHooks
  Joey ..|> BossHooks
  Marky ..|> BossHooks
  Trio o-- BossInstance : 3 thành viên
  Trio *-- BossTurnCtrl
  BossInstance --> Arena : nhận qua tham số
```
[(xem SVG)](svg/02-bosses.svg)

**Cách đọc:**
- [src/bosses/bosses.js](../../src/bosses/bosses.js) có ba phần: **registry** (`register/has/create`), **kit** dùng chung (`K`), và khung trùm `K.createBase`.
- `createBase` dựng một `BossInstance` có sẵn máy trạng thái (`setState`, `stateDone`, `choose`), máu/pha (`onHit`, `computePhase`), vật lý, vẽ.
  Mỗi file trùm ([deedee.js](../../src/bosses/deedee.js), [joey.js](../../src/bosses/joey.js), [marky.js](../../src/bosses/marky.js)) gọi `createBase(SPEC, arena, cfg)`
  rồi **gán thêm** các hàm trong "interface" `BossHooks` (tên interface do sơ đồ đặt, code không có tên này).
- [trio.js](../../src/bosses/trio.js) dùng lại `OG.Bosses.factories.joey/marky/deedee` tạo 3 thành viên nhỏ và gói thành **một** `BossInstance`.
- `Arena` do scene `'boss'` dựng (hàm nội bộ `makeArena` trong [src/game/boss-scene.js](../../src/game/boss-scene.js)).

**Pattern:**
- **Template method**: `b.update` của khung cố định trình tự (giảm bộ đếm → xử lý trạng thái chung `roar/recoil/breather/wait` → còn lại gọi `b.think`
  → `physics` → `updateProjectiles`); trùm chỉ viết phần riêng. Comment trong code ghi rõ "Vòng cập nhật (template method)".
- **Strategy qua hàm gán thêm**: `startAction`, `think`, `isVulnerable`... thay cho kế thừa lớp.
- **Composite**: `trio` trông như một trùm với scene boss; **token / turn-taking** (`BossTurnCtrl`) để chỉ một tên ra đòn một lúc.
- **Dependency injection**: trùm không gọi `OG.Player`, `OG.Camera` trực tiếp mà gọi `arena.hurtPlayer`, `arena.shake`... → thay `arena` giả là test được.
  `K.normalizeArena` bù các hàm còn thiếu.

**Vì sao không dùng `class Boss extends BossBase`:** dự án viết ES5 vừa phải, không transpile; gán hàm vào object làm cùng việc, và trùm ghép
(`trio`) chỉ cần gọi lại factory với `cfg` khác. **Đánh đổi:** không có kiểm tra "đã cài đủ hook chưa" — khung luôn kiểm tra `typeof b.think === 'function'`.
Máy trạng thái của từng trùm: [04-state-machines.md mục 3](04-state-machines.md#3-máy-trạng-thái-trùm).

---

## 5. Đồ hoạ: Sprites (cache LRU), Scenery, Decor

```mermaid
classDiagram
  class Sprites["OG.Sprites (sprites.js)"] {
    -cache : enabled, map: Map, hits, misses, px
    -CACHE_MAX = 320 khung
    -CACHE_MAX_PX = 16 triệu điểm ảnh
    +drawCharacter(ctx, charId, animState, t, opts)
    +getAnimStates() string[]
    +drawPortrait(ctx, charId, x, y, size, opts)
    +setCacheEnabled(on)
    +setCacheLimit(...)
    +clearCache()
    +cacheStats()
    -normState(s) string
    -quantize(state, t, kind) QuantizedTime
    -cacheGet(key) CachedFrame
    -cachePut(key, frame)
  }
  class CachedFrame {
    +cv : canvas phụ
    +ox, oy : vị trí chân
    +w, h
    +px : số điểm ảnh
  }
  class SceneryGfx["OG.Sprites (scenery.js)"] {
    +drawBackground(ctx, theme, camX, t)
    +drawPlatform(ctx, plat, theme, t)
    +drawDecor(ctx, theme, worldW, t)
    +drawOverlay(ctx, theme, camX, t)
    +drawProp(ctx, id, x, y, t, opts) bool
    +resolveTheme(id) ResolvedTheme
  }
  class Scenery["OG.Scenery (core)"] {
    -themes : id→ThemeDef
    -decors : kind→DecorFn
    -layers : kind→LayerFn
    +BUILTIN
    +registerTheme(id, def)
    +getTheme(id)
    +baseOf(id)
    +registerDecor(kind, fn)
    +drawDecor(ctx, kind, x, y, scale, t, opts) bool
    +registerLayer(kind, fn)
    +drawLayer(ctx, layer, camX, t, theme)
    +fallbackDecor
    +fallbackLayer
  }
  class Decor["OG.Decor (decor.js)"] {
    -SPRITE_MAX = 96, TILE_MAX = 28
    +define(kind, fn)
    +registerTiled(kind, spec)
    +sprite(...)
    +drawSprite(...)
    +cacheStats()
    -remember(store, order, max, key, val) FIFO
  }
  Sprites *-- CachedFrame : Map LRU
  SceneryGfx ..> Scenery : đọc ThemeDef, gọi drawLayer, drawDecor
  Decor ..> Scenery : define đăng ký vào registry
```
[(xem SVG)](svg/02-gfx.svg)

**Cách đọc:**
- `OG.Sprites` được **ba file góp vào cùng một object**: [sprites.js](../../src/gfx/sprites.js) (nhân vật), [skins.js](../../src/gfx/skins.js) (`skinGfx`),
  [scenery.js](../../src/gfx/scenery.js) (nền, sàn, prop). Sơ đồ tách thành hai ô cho dễ đọc.
- `drawCharacter` vẽ procedural (bằng lệnh Canvas), nhưng trước đó `quantize` làm tròn thời gian `t` về một số hữu hạn khung (vd `run`: 12 khung / 0,36 s),
  ghép khoá (`frameKey`), tra `cacheGet`; trượt cache thì vẽ vào canvas phụ rồi `cachePut`.
- `cachePut` loại khung cũ nhất khi vượt **một trong hai** giới hạn (số khung hoặc tổng điểm ảnh). `cacheGet` trúng thì `delete` rồi `set` lại khoá →
  khoá được dời xuống cuối `Map` (Map của JS giữ thứ tự chèn) — đó là **LRU không cần danh sách liên kết**.
- `OG.Decor` ([decor.js](../../src/gfx/decor.js)) cache ảnh decor/dải parallax tĩnh bằng **FIFO** (`remember`) — comment trong code so sánh hai cách.
- `OG.Scenery` ([src/core/scenery-registry.js](../../src/core/scenery-registry.js)) là registry ở **core**; mọi hàm vẽ đăng ký bọc `save/restore` + `try/catch`, lỗi thì vẽ hình dự phòng.

**Pattern:** **Registry** (theme/decor/layer), **Memoization / cache** (LRU cho nhân vật, FIFO cho decor), **Null object / fallback** (`fallbackDecor`,
`fallbackLayer`), **mở rộng object qua nhiều file** (`OG.Sprites`). Lý do chọn procedural + cache: [ADR-06](06-design-decisions.md#adr-06-vẽ-procedural-bằng-canvas--cache-khung-hình-lru).

---

## 6. Âm thanh: Audio + sequencer nhạc

```mermaid
classDiagram
  class Audio["OG.Audio (audio.js)"] {
    -ctx : AudioContext hoặc null
    -master, musicBus, sfxBus, compressor : GainNode
    -noiseBuf : 1 giây nhiễu trắng
    -unlocked : bool
    -duck : hệ số giảm nhạc
    +currentTrack : string
    +tracks : id→TrackDef
    +init()
    +unlock() bool
    +isReady() bool
    +playMusic(trackId)
    +stopMusic(fade)
    +sfx(name, opts)
    +setVolume(ch, v)
    +mute(on)
    +toggleMute()
    +setDuck(v)
    -createContext()
    -playSfx(name, opts)
    -tone(ToneOpts)
    -noise(NoiseOpts)
    -applyVolumes()
    -bindEvents()
  }
  class Engine["OG.Audio._engine"] {
    tone, noise, mtof...
  }
  class Music["OG.Audio._music (music.js)"] {
    -compiled : id→CompiledSong
    -cur : MusicVoice
    -LOOKAHEAD = 0.15 giây
    +play(id)
    +stop(fade)
    +resolve(id)
    +list()
    +isPlaying(id)
    -compile(id) CompiledSong
    -tick()
    -playEvent(ev, t, song, bus)
  }
  class TrackDef {
    +bpm, loop, swing
    +extend : id bản gốc
    +transpose
    +lead, bass
  }
  class CompiledSong {
    +id
    +steps : SongEvent[][]
    +total
    +stepDur : giây
  }
  class MusicVoice {
    +song : CompiledSong
    +gain : GainNode
    +step
    +nextTime : giây AudioContext
  }
  Audio *-- Engine
  Audio *-- Music : gắn vào lúc load music.js
  Music ..> Engine : dùng tone/noise
  Music o-- TrackDef : tracks
  Music ..> CompiledSong : compile + cache
  Music *-- MusicVoice : bản đang phát
```
[(xem SVG)](svg/02-audio.svg)

**Cách đọc:** [src/audio/audio.js](../../src/audio/audio.js) sở hữu `AudioContext` và đồ thị âm thanh: nguồn → `sfxBus` / `trackGain → musicBus` → `master` →
`compressor` → loa. Nó **tự nghe event** (`bindEvents`: `player:jump` → `sfx('jump')`...), gameplay không gọi Audio.
[src/audio/music.js](../../src/audio/music.js) là **sequencer**: bản nhạc là dữ liệu (`TrackDef`), được `compile` một lần thành lưới bước; `tick` chạy bằng
`setInterval` và lên lịch trước `LOOKAHEAD` giây các nốt kèm thời điểm chính xác trên đồng hồ của `AudioContext`.

**Pattern:** **Observer** (Audio nghe event bus), **Facade** (`sfx(name)` che hàng chục node Web Audio), **data-driven + compile & cache** (nhạc).
Vì sao tổng hợp âm thanh thay vì file `.mp3`: [ADR-07](06-design-decisions.md#adr-07-âm-thanh-tổng-hợp-bằng-web-audio-không-dùng-file).
Vòng đời `AudioContext`: [04 mục 7](04-state-machines.md#7-audiocontext).

---

## 7. Học tập: Story, Learn, Guide, Photos

```mermaid
classDiagram
  class Story["OG.Story"] {
    +init()
    +current() jid
    +startJourney(jid, opts) bool
    +playLevel(levelId) bool
    +afterLevel(result) bool
    +finishJourney(jid)
    +playComic(jid, comicId, opts)
    +playComics(jid, list, opts)
    +pushComic(jid, comicId, onDone)
    +hasSeen(jid, comicId) bool
    +markSeen(jid, comicId)
    +onSoftFail(info) bool
    +ui : font, wrap, drawBubble, drawButton, hit, fx...
    -goNext(next)
  }
  class StoryNextStep {
    +scene
    +params
    +start : bool
    +fn : Function
  }
  class Learn["OG.Learn"] {
    +hasCard(jid, cardId) bool
    +unlockCard(jid, cardId, opts) bool
    +listCards(jid, areaId)
    +count(jid, areaId)
    +whereIs(jid, cardId)
    +openCard(jid, cardId, opts)
    +openNotebook(jid, back, backParams)
    +isQuizPassed(jid, quizId) bool
    +openQuiz(jid, quizId, opts)
    +answerQuiz(jid, quizId, choice, ctx) AnswerResult
    +drawIcon(ctx, icon, x, y, size, t)
    -learnHook : LevelHook
    -openGate(st, g)
  }
  class Guide["OG.Guide"] {
    +init()
    +guideOf(jid)
    +say(text, seconds) bool
    +talk(st, spot)
    +drawSay(ctx)
  }
  class Photos["OG.Photos"] {
    -registry : jid→cardId→PhotoEntry
    -cache : 'jid/cardId'→PhotoRecord
    +licenseOk(name) bool
    +register(jid, map)
    +get(jid, cardId) PhotoEntry
    +image(jid, cardId) PhotoRecord
    +ready(jid, cardId) img
    +loading(jid, cardId) bool
    +preload(jid, cardIds)
    +creditLine(e, maxAuthor)
    +drawCover(...)
    +drawShimmer(...)
  }
  class Journeys["OG.Journeys (core)"] {
    +register(def)
    +getLevel(id)
    +getCard(jid, id)
    +getQuiz(jid, id)
    +getComic(jid, id)
    +validate(idOrDef)
  }
  Story ..> StoryNextStep : continuation dạng dữ liệu
  Story ..> Journeys
  Learn ..> Journeys
  Learn ..> Photos : preload
  Guide ..> Learn : unlockCard (spot.card)
  Story ..> Learn
```
[(xem SVG)](svg/02-story.svg)

**Cách đọc:**
- `OG.Story` ([src/story/story.js](../../src/story/story.js)) là **người điều phối** hành trình: quyết định truyện nào chiếu, theo thứ tự nào, rồi đi tiếp đâu.
  "Đi tiếp đâu" là một **continuation dạng dữ liệu** `StoryNextStep` (`{scene, params, start}` hoặc `{fn}`), được `goNext` thực hiện.
- `OG.Learn` ([src/story/learn.js](../../src/story/learn.js)) giữ logic học tập (thẻ, sổ tay, câu đố) và hook `learn`; giao diện vẽ nằm trong
  [src/story/scenes.js](../../src/story/scenes.js) (scene `card`, `quiz`, `notebook`).
- `OG.Guide` ([src/story/guide.js](../../src/story/guide.js)): NPC trong màn (hook `guide`). `OG.Photos` ([src/story/photos.js](../../src/story/photos.js)): registry ảnh nạp lười.

**Pattern:** **Mediator / coordinator** (`Story` đứng giữa scene, Game và dữ liệu), **continuation** (truyền "việc làm tiếp" như dữ liệu thay vì
lồng callback), **callback `onPass/onClose`** (closure giữ đúng cổng, đúng màn), **lazy-load + cache** (`Photos`).
**Vì sao tách logic (`learn.js`) khỏi giao diện (`scenes.js`):** smoke test gọi `answerQuiz` trực tiếp để kiểm tra luật "sai không phạt", và giao diện
được làm đẹp mà không đụng luật.

---

## 8. Lưu trữ và mạng xã hội: Save, Social, backend adapter

```mermaid
classDiagram
  class Save["OG.Save"] {
    +data : SaveData
    +available : bool
    -KEY = 'oggyAdventure.save.v1'
    -LEGACY_BEST_KEY = 'oggyBest'
    +load() SaveData
    +commit() bool
    +get(path, fallback)
    +set(path, value)
    +ns(name) Object
    +addCoins(n, reason)
    +spendCoins(n, reason) bool
    +setSetting(key, value)
    +reset()
    -defaults() SaveData
    -merge(base, saved)
  }
  class Social["OG.Social"] {
    +mountResult(panelEl, result)
    +share(result) Promise~bool~
    +createCard(result) canvas
    +cardDataURL(result)
    +cardBlob(result) Blob
    +copyText(text) Promise
    +submitResult(result, name)
    +submitScore(entry) rank
    +getLeaderboard(limit)
    +backend : LeaderboardBackend
    +backends : id→LeaderboardBackend
    +registerBackend(b)
    +setBackend(idOrBackend)
    +createHttpBackend(opts)
    +useOnline(url, opts)
  }
  class LeaderboardBackend {
    <<interface>>
    +id
    +name
    +online : bool
    +submit(entry) Promise
    +list(limit) Promise
    +clear() Promise
  }
  class local["backends.local"] {
    +submitSync(entry) rank
    +listSync(limit)
  }
  class http["createHttpBackend(...)"] {
    +url
    GET url/scores
    POST url/scores
  }
  Social o-- LeaderboardBackend : backends
  local ..|> LeaderboardBackend
  http ..|> LeaderboardBackend
  local ..> Save : ns('social').leaderboard
  Social ..> Save : playerName
```
[(xem SVG)](svg/02-save-social.svg)

**Cách đọc:**
- `OG.Save` ([src/core/save.js](../../src/core/save.js)) là **cổng duy nhất** tới `localStorage` (hợp đồng: không module nào gọi `localStorage` trực tiếp).
- Bảng xếp hạng ([src/social/leaderboard.js](../../src/social/leaderboard.js)) nói chuyện với mọi nơi lưu điểm qua **cùng một giao diện**
  `LeaderboardBackend`. `local` luôn là **nguồn sự thật**; nếu bật online (`useOnline` hoặc `OG.Config.LEADERBOARD_URL`), điểm được gửi kèm
  lên backend HTTP mà không chặn game. Máy chủ mẫu: [docs/leaderboard-worker.example.js](../leaderboard-worker.example.js).

**Pattern:** **Adapter** (mọi backend cùng hình dạng), **Strategy** (chọn backend lúc chạy bằng `setBackend`), **local-first**,
**không tin dữ liệu ngoài** (`sanitize` mọi entry dù đọc từ save hay máy chủ). Thêm Firebase/Supabase = viết một object có `id, submit, list`
rồi `registerBackend`, không sửa scene.

---

## 9. Bảng tổng hợp design pattern

| Pattern | Ở đâu (file · hàm) | Vì sao dùng |
|---|---|---|
| Module pattern (IIFE + namespace) | mọi file `src/**` → `window.OG.X` | chạy được qua `file://`, không build step ([ADR-01](06-design-decisions.md#adr-01-không-build-step-không-es-modules-namespace-og--iife)) |
| Registry | `OG.Scenes.register`, `OG.Journeys.register`, `OG.Bosses.register`, `OG.Enemies.registerType`, `OG.Scenery.register*`, `OG.Photos.register`, `OG.Data.register*` | dữ liệu/module đăng ký từ bên ngoài, core không cần biết danh sách |
| "Stub rồi ghi đè" | [default-scenes.js](../../src/game/default-scenes.js) → [menus.js](../../src/ui/menus.js) `init` | game luôn chạy được kể cả khi thiếu module tính năng |
| Optional call | `OG.util.call(ns, method, ...)` trong [namespace.js](../../src/core/namespace.js) | tầng dưới gọi tầng trên mà không phụ thuộc cứng |
| Observer / pub-sub | [events.js](../../src/core/events.js); Audio, Quests, HUD nghe | tách module ([ADR-03](06-design-decisions.md#adr-03-event-bus-để-tách-module)) |
| State machine | `OG.Scenes`, `st.phase`, `BossInstance.state`, scene `quiz`/`comic` | luồng rõ ràng, mỗi trạng thái một đoạn code ([04](04-state-machines.md)) |
| Template method | `K.createBase` → `b.update` gọi `b.think`; `level.update` gọi hook | cố định trình tự, chỉ cho điền phần riêng |
| Strategy | `EnemyTypeDef`, `BossHooks`, `LeaderboardBackend`, `Difficulty.params` | đổi hành vi bằng dữ liệu/hàm, không `if` theo loại |
| Adapter | `LeaderboardBackend` (`local`, HTTP) | cùng giao diện cho nhiều nơi lưu |
| Composite | [trio.js](../../src/bosses/trio.js) | ba trùm trông như một với scene boss |
| Dependency injection | `Arena` trong [boss-scene.js](../../src/game/boss-scene.js) `makeArena` | trùm không phụ thuộc core, dễ test |
| Memoization / cache | Sprites (LRU `Map`), Decor (FIFO), Photos, Difficulty `computed`, `Social.cardDataURL` | việc tốn kém chỉ làm một lần |
| Continuation | `StoryNextStep` + `goNext` trong [story.js](../../src/story/story.js) | chuỗi truyện → scene tiếp theo không lồng callback |
| Fallback / graceful degradation | `fallbackDecor`, `Photos` → hình cartoon, Audio không hỗ trợ → im lặng | trẻ em không bao giờ thấy màn hình lỗi |
