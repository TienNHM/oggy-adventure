# 01 · Mô hình dữ liệu

Game là **data-driven** (hướng dữ liệu): phần lớn nội dung (màn chơi, thẻ kiến thức, câu đố, truyện tranh, cảnh nền, ảnh,
nhiệm vụ) là **object JavaScript thuần** được "đăng ký" vào một registry lúc nạp file. Code engine chỉ đọc dữ liệu đó.
Trang này vẽ hình dạng của các object ấy và quan hệ giữa chúng.

Kiểu dữ liệu dùng chung được khai báo một lần trong [src/types.d.ts](../../src/types.d.ts); kiểu chỉ dùng trong một file nằm ở
`@typedef` đầu file đó. Hợp đồng gốc: [`docs/STORY.md` mục 2, 4, 8](../STORY.md) và [`docs/ARCHITECTURE.md` mục 7](../ARCHITECTURE.md).

Mục lục:
1. [Nội dung một hành trình](#1-nội-dung-một-hành-trình)
2. [Bên trong một màn (LevelDef)](#2-bên-trong-một-màn-leveldef)
3. [Dữ liệu gốc → bản biên dịch → trạng thái chạy](#3-dữ-liệu-gốc--bản-biên-dịch--trạng-thái-chạy)
4. [Trùm](#4-trùm)
5. [Chủ đề cảnh nền (ThemeDef)](#5-chủ-đề-cảnh-nền-themedef)
6. [Ảnh chụp cho thẻ (Photo entry)](#6-ảnh-chụp-cho-thẻ-photo-entry)
7. [Nhân vật, skin, cửa hàng](#7-nhân-vật-skin-cửa-hàng)
8. [Nhiệm vụ (Quest)](#8-nhiệm-vụ-quest)
9. [Dữ liệu lưu (SaveData trong localStorage)](#9-dữ-liệu-lưu-savedata-trong-localstorage)
10. [Các thế hệ dữ liệu lưu và cách nâng cấp](#10-các-thế-hệ-dữ-liệu-lưu-và-cách-nâng-cấp)

Ký hiệu ER: đường **liền** = dữ liệu **lồng** bên trong (mảng/field con); đường **đứt** = tham chiếu bằng **id chuỗi**
(phải tra cứu, có thể sai — vì vậy mới cần `validate`). Cách đọc ký hiệu số lượng: [README](README.md#er-diagram-sơ-đồ-thực-thể--quan-hệ).

---

## 1. Nội dung một hành trình

```mermaid
erDiagram
  JourneyDef ||--|{ AreaDef : "areas"
  JourneyDef ||--o{ CardDef : "cards"
  JourneyDef ||--o{ QuizDef : "quizzes"
  JourneyDef ||--o{ Comic : "comics[comicId]"
  JourneyDef ||--|| Guide : "guide"
  AreaDef ||--|{ LevelDef : "levels"
  AreaDef ||--o| AreaBoss : "boss"
  QuizDef ||--|{ Choice : "choices 2-3"
  Comic ||--|{ PanelDef : "panels"
  PanelDef ||--o{ PanelChar : "chars"
  PanelDef ||--o{ Bubble : "bubbles"
  CardDef }o..|| AreaDef : "areaId"
  QuizDef }o..|| AreaDef : "areaId"
  QuizDef }o..o| CardDef : "cardId"
  JourneyDef }o..o| Comic : "intro, ending"
  AreaDef }o..o| Comic : "intro, outro"
  AreaBoss }o..o| Comic : "intro"
  JourneyDef {
    string id PK "a-z0-9_, tiền tố mọi id riêng"
    number order "thứ tự trên màn chọn"
    string title
    string emoji
    string description
    object palette "primary, secondary, accent, bg, ink"
    string intro FK "comicId"
    mixed ending "comicId hoặc {comic, title, text}"
    bool invalid "validateAll gắn khi có lỗi"
  }
  Guide {
    string charId FK "olivia, bob, owl, robot"
    string name
  }
  AreaDef {
    string id PK "duy nhất trong hành trình"
    string name
    string emoji
    string sceneryTheme FK "ThemeDef id"
    string music "trackId Audio"
    string intro FK
    string outro FK
  }
  AreaBoss {
    string bossId FK "OG.Bosses id"
    object arena "width, platforms, spawn, theme"
    string intro FK "truyện trước trận"
  }
  CardDef {
    string id PK
    string areaId FK
    string title
    string fact "1-2 câu, tối đa 160 ký tự"
    fn drawIcon "ưu tiên: vẽ canvas"
    mixed icon "IconSpec dự phòng"
  }
  QuizDef {
    string id PK
    string areaId FK
    string question
    number answer "chỉ số đáp án đúng"
    string hint "hiện khi sai"
    string explain "hiện khi đúng"
    string cardId FK "mở khoá thẻ khi đúng"
  }
  Choice {
    string text
    mixed icon "IconSpec hoặc drawIcon"
  }
  PanelDef {
    mixed bg "theme id, color:#hex, {theme, camX}, hàm vẽ"
    string caption "lời dẫn"
  }
  PanelChar {
    string id FK "charId"
    string anim "idle, talk, wave..."
    number x "0..1 tỉ lệ khung"
    number y
    number face "1 hoặc -1"
    number scale
  }
  Bubble {
    string who "charId trong panel hoặc narrator"
    string text "tối đa 90 ký tự"
  }
```
[(xem SVG)](svg/01-journey-content.svg)

**Cách đọc:** một `JourneyDef` (hành trình, vd `home`) chứa nhiều khu (`AreaDef`, vd `kitchen`), mỗi khu nhiều màn.
Thẻ kiến thức (`CardDef`) và câu đố (`QuizDef`) nằm **phẳng** ở cấp hành trình rồi trỏ ngược về khu bằng `areaId`;
truyện tranh nằm trong object `comics` với **khoá** là `comicId`.

**Vì sao thiết kế như vậy:**
- Thẻ/câu đố để phẳng (không lồng trong khu) để **một file** [`content.js`](../../src/journeys/home/content.js) khai báo mọi nội dung học tập,
  còn [`journey.js`](../../src/journeys/home/journey.js) khai báo khu/màn. Cả hai gọi `OG.Journeys.register` với cùng `id`;
  hàm nội bộ `mergeById` trong [src/core/journeys.js](../../src/core/journeys.js) **gộp** `areas/cards/quizzes` theo `id`, `comics` gộp theo khoá.
- Tham chiếu bằng id chuỗi (đường đứt) giúp người soạn nội dung viết dữ liệu dễ (không cần lồng object), đổi lại **có thể gõ sai**.
  Vì thế `OG.Journeys.validate` (hàm nội bộ `validateCards`, `validateQuizzes`, `validateComics`, `validateLevel`) kiểm tra mọi id tham chiếu;
  hành trình có lỗi bị gắn `invalid = true` và ẩn khỏi màn chọn (`validateAll`), game không sập.
- `IconSpec` là kiểu **hợp** (union): hàm vẽ | `{decor}` | `{char}` | `{emoji}` | chuỗi emoji. Người soạn chọn cách dễ nhất;
  `OG.Learn.drawIcon` trong [src/story/learn.js](../../src/story/learn.js) phân loại và gọi đúng bộ vẽ.

**Đánh đổi:** không có kiểm tra kiểu lúc chạy như cơ sở dữ liệu thật; mọi ràng buộc ("2–3 lựa chọn", "≤ 160 ký tự") nằm trong code `validate*`.

---

## 2. Bên trong một màn (LevelDef)

```mermaid
erDiagram
  LevelDef ||--o{ Page : "pages"
  LevelDef ||--o{ QuizGateDef : "quizGate / quizGates"
  LevelDef ||--o{ GuideSpotDef : "guideSpots"
  LevelDef ||--o{ CheckpointX : "checkpoints"
  LevelDef ||--o{ ComicTrigger : "comicTriggers"
  LevelDef ||--o{ EnemySpawn : "enemies"
  LevelDef ||--o{ QuestDef : "quests"
  LevelDef }o..o| ClassicLevel : "from"
  Page }o..|| CardDef : "card"
  QuizGateDef }o..|| QuizDef : "quiz"
  GuideSpotDef }o..o| CardDef : "card"
  GuideSpotDef }o..o| CharacterDef : "charId"
  ComicTrigger }o..|| Comic : "comic"
  EnemySpawn }o..|| EnemyTypeDef : "type"
  LevelDef {
    string id PK "jid-area-n, duy nhất toàn game"
    string name
    string theme FK "mặc định area.sceneryTheme"
    string music
    number width "px"
    object spawn "x, y"
    number goal "số pizza cần, nhỏ hơn hoặc bằng số pizza"
    array platforms "[x,y,w,h], phần tử 0 là sàn y=480"
    array pizzas "[x,y] tâm"
    array coins "[x,y] tâm"
    object exit "x"
    string boss FK "mặc định: trùm của khu nếu là màn cuối"
    string intro FK
    string outro FK
  }
  Page {
    string card FK
    number x "tâm, px thế giới"
    number y
  }
  QuizGateDef {
    string quiz FK
    mixed x "số = tường giữa màn, bỏ trống hoặc exit = ở cửa"
    string id "mặc định gate0, gate1"
  }
  GuideSpotDef {
    number x "chân NPC"
    number y "mặc định 480"
    string text
    string[] lines "hoặc nhiều câu"
    string charId FK "mặc định người dẫn đường"
    string name
    string card FK "mở khoá thẻ sau khi nói"
  }
  CheckpointX {
    number x "thiếu thì Difficulty tự đặt mỗi 600 px"
  }
  ComicTrigger {
    number x "đi qua x thì chiếu"
    string comic FK
    bool once
  }
  EnemySpawn {
    string type FK "roach, joey, jid-ten..."
    number x
    number range
    number speed
    number dir "1 hoặc -1"
  }
  QuestDef {
    string id
    string type "collect_all, no_damage..."
    number target
    string text
    number reward "xu"
  }
  ClassicLevel {
    string id PK "kitchen, garden, roof, lair..."
  }
```
[(xem SVG)](svg/01-level-def.svg)

**Cách đọc:** `LevelDef` của hành trình **đúng định dạng màn cổ điển v1** (`platforms`, `pizzas`, `exit`...) cộng thêm các mảng v2:
trang sách (`pages`), cổng câu đố, NPC dẫn đường, checkpoint, truyện chen giữa màn. Field `from` cho phép **mượn hình học** của một
màn cổ điển (vd `from: 'kitchen'`) rồi chỉ thêm phần học tập.

**Vì sao:**
- Dùng lại định dạng v1 nên scene `level` ([src/game/level.js](../../src/game/level.js), hàm nội bộ `buildState`) **không cần biết** màn đó thuộc hành trình
  hay chiến dịch cổ điển. Phần v2 được xử lý bởi **level hook** (`OG.Level.addHook`): `checkpoints` ([src/game/difficulty.js](../../src/game/difficulty.js)),
  `learn` ([src/story/learn.js](../../src/story/learn.js)), `guide` ([src/story/guide.js](../../src/story/guide.js)), `story-comics` ([src/story/story.js](../../src/story/story.js)).
- Toạ độ dạng mảng `[x, y, w, h]` cho gọn khi soạn hàng chục màn; `buildState` đổi sang object `{x, y, w, h, isFloor}` một lần lúc vào màn.
- `quizGate` (một cổng) và `quizGates` (nhiều cổng) đều được chấp nhận; hàm nội bộ `normalizeGates` trong [src/core/journeys.js](../../src/core/journeys.js)
  chuẩn hoá thành một mảng `[{id, quiz, x}]` để phía sau chỉ xử lý một dạng.

---

## 3. Dữ liệu gốc → bản biên dịch → trạng thái chạy

Cùng một màn tồn tại ở **ba dạng**. Phân biệt ba dạng này là chìa khoá để hiểu vì sao chơi lại màn vẫn "sạch".

```mermaid
flowchart LR
  subgraph SRC["1 · Dữ liệu gốc (lúc LOAD)"]
    jdef["JourneyDef<br/>journey.js + content.js<br/>register() nhiều lần"]
  end
  subgraph CMP["2 · Bản biên dịch (sau boot)"]
    lvl["LevelDef đã compile<br/>+ journey, areaId, areaIndex,<br/>indexInArea, journeyIndex,<br/>isLastOfArea, bossArena, bossIntro,<br/>quizGates chuẩn hoá, final=false"]
  end
  subgraph RUN["3 · Trạng thái chạy (mỗi lần vào màn)"]
    st["OG.Level.state (LevelState)<br/>platforms, items, enemies,<br/>player, phase, t"]
    learn["st.learn<br/>pages: LearnPage[] (got, had, bob)<br/>gates: LearnGate[] (open, openT)"]
    cps["st.checkpoints: Checkpoint[]<br/>(reached, raiseT)<br/>st.checkpoint (điểm hồi sinh)"]
    gs["st.guideSpots: GuideSpot[]<br/>(idx, near, talked)"]
  end
  jdef -->|"OG.Journeys.init():<br/>validateAll → compileAll"| lvl
  lvl -->|"OG.Journeys.getLevel(id)<br/>(OG.Data.getLevel tự tra sang)"| st
  st --> learn & cps & gs
  st -.->|"KHÔNG ghi ngược"| lvl
```
[(xem SVG)](svg/01-data-runtime.svg)

**Cách đọc từ trái sang phải:**
1. **Dữ liệu gốc** là thứ người soạn viết. `register` có thể gọi nhiều lần cho cùng hành trình.
2. **Bản biên dịch**: `OG.Journeys.init()` (do [src/core/main.js](../../src/core/main.js) gọi trong `boot`, *sau* khi trùm và nhân vật đã đăng ký)
   chạy `validateAll` rồi hàm nội bộ `compileAll` → `compileLevel`: điền giá trị mặc định (`theme` lấy từ khu, `exit` mặc định...),
   chép hình học từ màn `from`, gắn field điều hướng (`journeyIndex`, `isLastOfArea`...). Kết quả cache trong `CompiledCache`
   (`levels`, `order`); `register` lần nữa sẽ xoá cache (`compiled = null`).
3. **Trạng thái chạy**: mỗi lần vào màn, `buildState` tạo `LevelState` mới; các hook tạo `st.learn`, `st.checkpoints`, `st.guideSpots`.

**Vì sao tách ba dạng:** nếu hook ghi `got = true` thẳng vào `LevelDef.pages`, lần chơi sau trang sách biến mất mãi mãi.
Comment trong hook `story-comics` nói đúng điều này: "KHÔNG ghi `fired` vào dữ liệu gốc". **Bất biến**: dữ liệu biên dịch là *chỉ đọc* trong lúc chơi.

**Đánh đổi:** tốn thêm một bước compile và bộ nhớ cho bản sao (`clone` bằng `JSON.parse(JSON.stringify(...))` khi mượn `from`),
nhưng đổi lại code gameplay đơn giản và không có lỗi "dữ liệu bị bẩn".

---

## 4. Trùm

```mermaid
erDiagram
  AreaBoss }o..|| BossDef : "bossId"
  LevelDef }o..o| BossDef : "boss"
  BossDef ||--o| BossArenaDef : "arena"
  BossDef ||--|| BossSpec : "create dùng SPEC"
  BossSpec ||--|{ PhasePattern : "patterns[phase]"
  BossSpec ||--o{ PhaseLine : "phaseLines[phase]"
  BossDef {
    string id PK "deedee, marky, joey, trio, jid-ten"
    string name
    number maxHp
    fn create "create(arena) trả BossInstance"
  }
  BossArenaDef {
    number width "px, mặc định 960"
    array platforms "[x,y,w,h]"
    object spawn "x, y người chơi"
    string theme
  }
  BossSpec {
    string id
    string charId "bộ vẽ OG.Sprites"
    number maxHp
    number scale
    number[] phaseAt "vd [3,1]: hp nhỏ hơn hoặc bằng 3 sang pha 2"
  }
  PhasePattern {
    number phase "1, 2, 3"
    string[] actions "vd walk, roll, walk, roll"
  }
  PhaseLine {
    number phase
    string text "toast khi đổi pha"
  }
```
[(xem SVG)](svg/01-boss-data.svg)

**Cách đọc:** `BossDef` là bản đăng ký trong `OG.Bosses.register` ([src/bosses/bosses.js](../../src/bosses/bosses.js)). Mỗi file trùm
([deedee.js](../../src/bosses/deedee.js), [joey.js](../../src/bosses/joey.js), [marky.js](../../src/bosses/marky.js)) khai báo một hằng `SPEC`
(`BossSpec`) gồm **bộ đòn theo pha** (`patterns`) và ngưỡng máu đổi pha (`phaseAt`). Ví dụ Dee Dee:
`patterns: { 1: ['walk','roll','walk','roll'], 2: ['roll','eat','walk','roll','pots'], 3: ['roll3','eat','pots','roll3'] }`, `phaseAt: [3, 1]`.

**Vì sao:** bộ đòn là **dữ liệu** chứ không phải `if/else` → đổi nhịp trùm chỉ cần sửa mảng (`🧪 Thử` trong `deedee.js`).
Trùm hành trình dùng chung trùm có sẵn; khu chỉ cần ghi `boss: {bossId}` và tuỳ chọn `arena` riêng. Trạng thái chạy của trùm
(`BossInstance`, `Arena`) là **object có hành vi**, nên vẽ ở [02-class-diagrams.md mục 4](02-class-diagrams.md#4-trùm-ogbosses).

---

## 5. Chủ đề cảnh nền (ThemeDef)

```mermaid
erDiagram
  AreaDef }o..|| ThemeDef : "sceneryTheme"
  ThemeDef }o..o| BuiltinTheme : "base"
  ThemeDef ||--o| Sky : "sky"
  ThemeDef ||--o{ SceneryLayer : "layers xa đến gần"
  ThemeDef ||--o| PlatformStyle : "platformStyle"
  PlatformStyle ||--o{ PlatformPaint : "floor, ledge"
  ThemeDef ||--o{ DecorPlacement : "decor"
  ThemeDef ||--o| Ambient : "ambient"
  ThemeDef ||--o| DrawCustom : "drawCustom"
  SceneryLayer }o..o| LayerFn : "kind"
  DecorPlacement }o..|| DecorFn : "kind"
  ThemeDef {
    string id PK "vd vietnam-halong"
    string name
    string base FK "chủ đề v1 dự phòng"
  }
  BuiltinTheme {
    string id PK "kitchen, garden, roof, lair, boss"
  }
  Sky {
    string top "màu"
    string bottom
    object sun "x, y, r, color"
    bool stars
    mixed clouds "false hoặc {color, count}"
  }
  SceneryLayer {
    string kind FK "mountains, waves, decorRow, custom..."
    number parallax "0 đứng yên .. 1 theo camera"
    number y "px màn hình"
    number height
    string color
    number spacing
    fn draw "chỉ với kind custom"
  }
  PlatformPaint {
    string fill
    string top
    number topH
    number radius
  }
  DecorPlacement {
    string kind FK
    number every "lặp mỗi N px"
    number start
    number[] at "hoặc vị trí cố định"
    number y "mặc định 480 chân"
    bool front "vẽ đè lên người chơi"
  }
  Ambient {
    string kind "snow, leaves, bubbles, sparkle"
    string color
  }
  DrawCustom {
    fn background
    fn platform "trả true nếu đã vẽ"
    fn decor
  }
  LayerFn {
    string kind PK "registerLayer"
  }
  DecorFn {
    string kind PK "registerDecor hoặc Decor.define"
  }
```
[(xem SVG)](svg/01-theme-def.svg)

**Cách đọc:** khu trỏ tới chủ đề bằng `sceneryTheme`. Chủ đề mô tả bầu trời, các **lớp parallax** (lớp xa cuộn chậm, lớp gần cuộn nhanh),
kiểu sàn, đồ trang trí rải theo `every`/`at`, hạt bay lớp phủ. `kind` của lớp/decor là **tên** tra trong registry `OG.Scenery`
([src/core/scenery-registry.js](../../src/core/scenery-registry.js)); hàm vẽ thật nằm trong [src/gfx/decor.js](../../src/gfx/decor.js) và các file `decor-*.js`.

**Vì sao:**
- Registry nằm ở **core** (luôn có), bộ vẽ ở **gfx**: dữ liệu hành trình chỉ cần tên, không phụ thuộc file vẽ nào.
- `base` + hàm `fallbackDecor` / `fallbackLayer` = **graceful degradation**: thiếu decor thì vẽ bụi cây mặt cười, thiếu chủ đề thì
  `baseOf(id)` trả chủ đề v1 (mặc định `garden`). Không bao giờ có màn trống trơn hay lỗi.
- `drawCustom` là "lối thoát hiểm" cho chủ đề cần vẽ đặc biệt mà không phải sửa bộ vẽ chung.

---

## 6. Ảnh chụp cho thẻ (Photo entry)

```mermaid
erDiagram
  CardDef ||..o| PhotoEntry : "journeyId + cardId"
  PhotoEntry ||--o| PhotoRecord : "cache jid/cardId"
  PhotoEntry }o--|| CreditsFile : "register(jid, map)"
  CreditsFile {
    string path PK "assets/photos/jid/credits.js"
    string journeyId
  }
  PhotoEntry {
    string journeyId FK
    string cardId FK
    string file "mặc định cardId.webp"
    string src "assets/photos/jid/file"
    number w "px thật của file"
    number h
    string author "bắt buộc"
    string license "phải qua licenseOk"
    string licenseUrl
    string source "Wikimedia Commons, Unsplash, Pexels, NASA"
    string sourceUrl "bắt buộc"
    string title
    string note "Đã thu nhỏ, chuyển sang WebP"
    object focus "x, y 0..1 điểm giữ khi cắt"
  }
  PhotoRecord {
    object img "HTMLImageElement"
    string state "loading, ready, error"
  }
```
[(xem SVG)](svg/01-photo-entry.svg)

**Cách đọc:** ảnh **không** nằm trong `CardDef`. Mỗi `assets/photos/<jid>/credits.js` gọi `OG.Photos.register(jid, {cardId: entry})`
lúc nạp ([src/story/photos.js](../../src/story/photos.js), hàm `register`). Cặp `(journeyId, cardId)` nối ảnh với thẻ.
`PhotoRecord` chỉ có trong RAM, tạo lần đầu khi `OG.Photos.image` được gọi (nạp lười, xem [03 luồng g](03-sequence-flows.md#g-tải-ảnh-lười-lazy-cho-thẻ--fallback)).

**Vì sao:**
- Thêm ảnh **không cần sửa** `content.js` (người soạn nội dung học tập và người tìm ảnh làm việc độc lập).
- `register` **chuẩn hoá ở cổng vào** (chuỗi được `trim`, số được ép kiểu) và **từ chối** entry thiếu `author`/`sourceUrl` hoặc giấy phép
  không qua `licenseOk` (danh sách trắng: Public Domain, CC0, CC BY, CC BY-SA, Unsplash, Pexels; chặn NC/ND/GFDL...). An toàn pháp lý trước.
- Dữ liệu là `.js` chứ không phải `.json` vì `fetch()` file cục bộ bị chặn qua `file://` (xem [ADR-01](06-design-decisions.md#adr-01-không-build-step-không-es-modules-namespace-og--iife)).
  File `_entries.json` cạnh ảnh chỉ là file tạm của công cụ, CI xoá trước khi deploy.

---

## 7. Nhân vật, skin, cửa hàng

```mermaid
erDiagram
  CharacterDef ||--o{ SkinDef : "charId"
  SkinDef ||--o| SkinGfx : "OG.Sprites.skinGfx[skinId]"
  CharacterDef ||--o| Unlock : "unlock"
  CharacterDef ||--o| Perk : "Shop PERKS[charId]"
  ShopItem }o..o| SkinDef : "kind skin"
  ShopItem }o..o| CharacterDef : "kind char, id char:charId"
  ShopItem }o..o| Consumable : "kind consumable"
  Consumable ||--|| Modifiers : "tác dụng khi vào màn"
  Perk ||--|| Modifiers : "mods"
  CharacterDef {
    string id PK "oggy, jack, olivia, joey, bob..."
    string name
    string role "player, enemy, boss, npc"
    number w "px hitbox"
    number h
    number speed "px/giây, chỉ player"
    number jump "px/giây"
    object colors "body, head, ear, feet, muzzle, accent"
  }
  Unlock {
    string type "free, coins, level"
    number cost
    string levelId
  }
  SkinDef {
    string id PK "vd oggy_gold"
    string charId FK
    string name
    number price "xu, 0 = có sẵn"
    object colors "chỉ ghi khoá muốn đổi"
  }
  SkinGfx {
    string hat "chef, crown, beret"
    string cape
    string mask
    bool apron
  }
  Consumable {
    string id PK "shield, boots, magnet, heart"
    number price
    number max "số tối đa được giữ"
  }
  ShopItem {
    string id PK
    string kind "consumable, skin, char"
    number price
    bool owned
    number count
    bool loadout "mang theo vào màn"
  }
  Modifiers {
    number extraLives
    number speedMul
    number jumpMul
    number magnet "px"
    number shield
    number doubleJump
  }
  Perk {
    string label
    string desc
  }
```
[(xem SVG)](svg/01-char-shop.svg)

**Cách đọc:** `OG.Data.characters` ([src/data/characters.js](../../src/data/characters.js)) là registry nhân vật (hitbox, tốc độ, màu);
skin chỉ là **bộ màu thay thế** (+ phụ kiện vẽ trong [src/gfx/skins.js](../../src/gfx/skins.js)). `ShopItem` là **view** (khung nhìn) mà
`OG.Shop.listItems` ([src/ui/shop.js](../../src/ui/shop.js)) dựng ra lúc chạy từ ba nguồn (vật phẩm `CONSUMABLES`, skin, nhân vật);
hàm nội bộ `resolve(itemId)` là chỗ **duy nhất** hiểu mã `'char:'`, `'skin:'`.

**Vì sao:** skin = dữ liệu màu nên thêm skin chỉ cần `OG.Data.registerSkin` (không vẽ lại nhân vật). Vật phẩm và đặc tính nhân vật quy về
**một kiểu `Modifiers`** (hệ số `*Mul` nhân, còn lại cộng) → `OG.Game.newRun` / `levelMods` ([src/game/game.js](../../src/game/game.js)) gộp mọi nguồn bằng
`mergeMods` mà không cần biết vật phẩm cụ thể.

---

## 8. Nhiệm vụ (Quest)

```mermaid
erDiagram
  LevelDef ||--o{ QuestDef : "quests"
  QuestDef ||--|| Quest : "getForLevel dựng"
  GlobalQuestDef ||--|| Quest : "getDaily, getAchievements dựng"
  QuestStore ||--o{ QuestRecord : "levels[qid]"
  QuestStore ||--o{ QuestRecord : "global[qid]"
  QuestStore ||--|| Daily : "daily"
  Daily ||--o{ QuestRecord : "prog[qid]"
  Quest }o..o| QuestRecord : "id"
  GlobalQuestDef {
    string id PK "ach_..., daily_..."
    string type "stomp_n, pizza_n, stars_n..."
    mixed target "số hoặc all"
    number reward
    number limit "chỉ time_under, giây"
  }
  Quest {
    string id
    string levelId "null nếu toàn cục"
    string category "level, daily, achievement"
    number progress
    number target
    bool done
    bool claimed
    bool failed
  }
  QuestStore {
    bool seeded "đã lấy số liệu từ stats"
  }
  Daily {
    string date "YYYY-MM-DD giờ máy"
    string[] ids "3 nhiệm vụ của ngày"
  }
  QuestRecord {
    number progress
    bool done
    bool claimed
  }
```
[(xem SVG)](svg/01-quest.svg)

**Cách đọc:** có ba nguồn định nghĩa: nhiệm vụ màn (`LevelDef.quests`), thành tựu (`ACHIEVEMENTS`) và kho nhiệm vụ ngày (`DAILY_POOL`)
trong [src/world/quests.js](../../src/world/quests.js). Thứ được lưu chỉ là **tiến độ** (`QuestStore` trong `OG.Save.ns('quests')`);
object `Quest` đầy đủ được dựng lại mỗi lần `list()` / `getForLevel()`.

**Vì sao:** tách *định nghĩa* (trong code, đổi được khi cập nhật game) khỏi *tiến độ* (trong save) → sửa câu chữ hay phần thưởng
không làm hỏng save cũ. Nhiệm vụ ngày chọn bằng **seeded random** từ chuỗi ngày (`hashStr` FNV-1a + `seededRandom`) nên chỉ cần lưu `date` và `ids`.

---

## 9. Dữ liệu lưu (SaveData trong localStorage)

```mermaid
classDiagram
  direction LR
  class SaveData {
    +v : number = 1
    +coins : number
    +bestScore : number
    +playerName : string
    +selectedChar : string
    +unlockedChars : string[]
    +ownedSkins : string[]
    +equippedSkins : charId→skinId
    +inventory : itemId→count
  }
  class SaveSettings {
    +masterVolume : 0..1
    +musicVolume : 0..1
    +sfxVolume : 0..1
    +muted : bool
    +touchControls : auto|on|off
    +tapJump : auto|on|off
    +difficulty : kid|challenge
  }
  class Progress["progress"] {
    +unlocked : levelId[]
    +levels : levelId→LevelRecord
  }
  class LevelRecord {
    +completed : bool
    +bestScore : number
    +stars : 1..3
    +bestTime : giây
    +plays : number
  }
  class Stats["stats"] {
    +plays, deaths, stomps
    +pizzas, coins
    +bossesDefeated, victories
  }
  class Ext["ext (OG.Save.ns)"] {
    +quests : QuestStore
    +story : seen, last
    +learn : cards, quizzes
    +difficulty : fails
    +social : leaderboard, onlineUrl
    +shop : loadout
  }
  class LearnStore["ext.learn"] {
    +cards : jid→cardId→timestamp ms
    +quizzes : jid→quizId→QuizRecord
  }
  class QuizRecord {
    +tries : number
    +passed : bool
  }
  class StoryStore["ext.story"] {
    +seen : 'jid:comicId'→true
    +last : jid
  }
  class SocialStore["ext.social"] {
    +leaderboard : LeaderboardEntry[] tối đa 10
    +onlineUrl : string
  }
  SaveData *-- SaveSettings : settings
  SaveData *-- Progress : progress
  Progress *-- LevelRecord : levels
  SaveData *-- Stats : stats
  SaveData *-- Ext : ext
  Ext *-- LearnStore
  LearnStore *-- QuizRecord
  Ext *-- StoryStore
  Ext *-- SocialStore
```
[(xem SVG)](svg/01-save-data.svg)

**Cách đọc:** toàn bộ dữ liệu người chơi là **một object** `OG.Save.data` (kiểu `SaveData` trong [src/core/save.js](../../src/core/save.js)),
được `JSON.stringify` và ghi vào `localStorage` dưới khoá **`oggyAdventure.save.v1`**. Phần trên (`coins`, `settings`, `progress`...) là của core;
phần `ext` chia thành **ngăn riêng cho từng module**, lấy bằng `OG.Save.ns(name)`:

| Ngăn | Module ghi | Nội dung |
|---|---|---|
| `ext.quests` | [src/world/quests.js](../../src/world/quests.js) | `QuestStore` (mục 8) |
| `ext.story` | [src/story/story.js](../../src/story/story.js) | truyện đã xem `seen['<jid>:<comicId>']`, hành trình gần nhất `last` |
| `ext.learn` | [src/story/learn.js](../../src/story/learn.js) | thẻ đã mở (thời điểm ms), kết quả câu đố |
| `ext.difficulty` | [src/game/difficulty.js](../../src/game/difficulty.js) | số lần thua mỗi màn `fails[levelId]` (để bật trợ giúp) |
| `ext.social` | [src/social/leaderboard.js](../../src/social/leaderboard.js) | bảng xếp hạng cục bộ (tối đa 10 `LeaderboardEntry`), URL máy chủ online nếu đã bật |
| `ext.shop` | [src/ui/shop.js](../../src/ui/shop.js) | `loadout[itemId]`: bật/tắt "mang theo" vật phẩm |

Khoá `localStorage` khác: `oggyBest` (kỷ lục của bản MVP, vẫn được ghi để tương thích ngược) và `oggyAdventure.probe` (khoá tạm để thử ghi được không).

**Vì sao:**
- **Một khoá, một object**: ghi/đọc một lần, dễ xoá (`OG.Save.reset`), dễ xem trong DevTools.
- **Namespace `ext`**: hai module không bao giờ ghi đè field của nhau; thêm module mới không phải sửa `defaults()`.
- `progress.levels` dùng chung cho màn cổ điển và màn hành trình (id màn hành trình có tiền tố `<jid>-` nên không đụng nhau).

**Đánh đổi:** `localStorage` đồng bộ (chặn luồng chính), giới hạn ~5 MB và có thể bị chặn (private mode) → mọi truy cập bọc `try/catch`
(hàm nội bộ `storageGet/storageSet`), `OG.Save.available` cho biết có lưu thật được không. Mỗi module tự "vá" ngăn của mình khi thiếu field
(vd hàm `store()` trong `quests.js`) vì save có thể bị sửa tay.

---

## 10. Các thế hệ dữ liệu lưu và cách nâng cấp

```mermaid
flowchart LR
  mvp[("Bản MVP<br/>localStorage 'oggyBest'<br/>= một con số kỷ lục")]
  v1[("v1<br/>'oggyAdventure.save.v1'<br/>SaveData v: 1")]
  v2[("v2 (hành trình)<br/>cùng khoá, cùng v: 1<br/>+ settings.tapJump, settings.difficulty<br/>+ ext.story, ext.learn, ext.difficulty")]
  mvp -->|"load(): đọc 'oggyBest',<br/>giữ số lớn hơn vào bestScore"| v1
  v1 -->|"load(): merge(defaults(), saved)<br/>field mới tự nhận mặc định"| v2
  v2 -.->|"commit(): vẫn ghi lại 'oggyBest'<br/>để bản cũ đọc được"| mvp
```
[(xem SVG)](svg/01-save-generations.svg)

**Cách đọc:** chưa từng có thay đổi phá vỡ định dạng, nên chiến lược nâng cấp là **deep merge với mặc định**
(hàm nội bộ `merge` trong [src/core/save.js](../../src/core/save.js)): save cũ thiếu `settings.tapJump` → sau khi gộp có `'auto'`.
Mảng được **thay nguyên** (không gộp theo chỉ số). Kỷ lục của bản MVP được **migrate** một chiều bằng cách đọc khoá `oggyBest`.

**Suy luận cần lưu ý:** field `v` (= 1) có trong `defaults()` nhưng **chưa có đoạn code nào rẽ nhánh theo `v`**. Nó được để sẵn cho ngày
cần đổi định dạng thật (vd đổi tên field): khi đó `load()` sẽ cần `if (saved.v < 2) { ...chuyển đổi... }` trước khi `merge`.
Luồng chi tiết của `load/commit`: [03 luồng f](03-sequence-flows.md#f-lưu-tải-và-migrate-dữ-liệu).
