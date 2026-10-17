# 03 · Các luồng quan trọng (sequence diagram)

Mỗi sơ đồ dưới đây đọc **từ trên xuống theo thời gian**. Cột là module/scene; mũi tên liền là lời gọi hàm hoặc `emit`,
mũi tên đứt là giá trị trả về. Tên hàm, scene, event lấy nguyên văn từ code.

Vòng đời **một frame** (Loop → Scenes → Player → Physics → draw) đã có ở
[ARCHITECTURE-DIAGRAMS mục 4](../learn/ARCHITECTURE-DIAGRAMS.md#4-vòng-đời-một-frame-sequence-diagram); các luồng ở đây giả định bạn đã hiểu nó.

Mục lục:
- [(a) Khởi động game](#a-khởi-động-game)
- [(b) Nhặt trang sách → mở thẻ → lưu Sổ tay](#b-nhặt-trang-sách--mở-thẻ--lưu-sổ-tay)
- [(c) Cổng câu đố: sai → gợi ý → đúng → mở cửa](#c-cổng-câu-đố-sai--gợi-ý--đúng--mở-cửa)
- [(d) Một trận trùm](#d-một-trận-trùm)
- [(e) Hết mạng ở chế độ Bé chơi](#e-hết-mạng-ở-chế-độ-bé-chơi)
- [(f) Lưu, tải và migrate dữ liệu](#f-lưu-tải-và-migrate-dữ-liệu)
- [(g) Tải ảnh lười (lazy) cho thẻ + fallback](#g-tải-ảnh-lười-lazy-cho-thẻ--fallback)
- [(h) Chia sẻ điểm](#h-chia-sẻ-điểm)

---

## (a) Khởi động game

```mermaid
sequenceDiagram
  autonumber
  participant B as Trình duyệt
  participant F as Các file src (IIFE)
  participant M as main.js boot()
  participant Sv as OG.Save
  participant Ft as Module tính năng
  participant J as OG.Journeys
  participant Sc as OG.Scenes
  participant L as OG.Loop

  B->>F: nạp từng thẻ script theo thứ tự trong index.html
  Note over F: Lúc LOAD: chỉ khai báo OG.X và đăng ký<br/>(Scenes.register, Bosses.register,<br/>Journeys.register, Photos.register...)<br/>KHÔNG đọc OG.Save.data
  F->>M: main.js nạp CUỐI
  alt document.readyState === 'loading'
    M->>B: chờ DOMContentLoaded
  end
  M->>M: OG.canvas, OG.ctx = canvas 960x540
  M->>M: OG.DOM.init()
  M->>Sv: load()
  Sv-->>M: OG.Save.data (đã gộp mặc định)
  M->>M: OG.Input.init(canvas) rồi OG.Progress.init()
  M->>M: applyTouchSetting()
  loop ns trong OG.FEATURE_INIT_ORDER
    M->>Ft: OG.util.call(ns, 'init')
    Note right of Ft: Difficulty, Audio, Sprites, Bosses, World,<br/>Quests, Menus, Shop, Social, Learn, Guide, Story<br/>(lỗi một module không chặn module khác)
  end
  M->>J: OG.util.call('Journeys', 'init')
  J->>J: validateAll() rồi compileAll()
  M->>B: nghe blur, visibilitychange (autoPause)
  M->>Sc: go('boot')
  M->>L: start(ctx)
  L->>B: requestAnimationFrame(frame)
  B->>L: frame(t) đầu tiên
  L->>Sc: update(dt)
  Sc->>Sc: scene 'boot'.update → go('menu')
```
[(xem SVG)](svg/03-a-boot.svg)

**Code:** [index.html](../../index.html) (thứ tự `<script>`), [src/core/main.js](../../src/core/main.js) (`boot`, `OG.FEATURE_INIT_ORDER`, `applyTouchSetting`),
[src/core/save.js](../../src/core/save.js) (`load`), [src/core/journeys.js](../../src/core/journeys.js) (`init`), [src/game/default-scenes.js](../../src/game/default-scenes.js) (scene `boot`).

**Vì sao có hai giai đoạn "load" và "boot":** lúc nạp script, dữ liệu lưu chưa được đọc và các module khác có thể chưa tồn tại; nên file chỉ được
**đăng ký** (registry). Mọi việc cần dữ liệu thật dồn vào `boot()`, theo đúng thứ tự phụ thuộc: `Save.load` **trước** `Progress.init`
(⚠️ đảo lại thì Progress làm việc trên dữ liệu mặc định rồi `commit` ghi đè save thật — comment trong `main.js`).
`Journeys.init` chạy **sau** các module tính năng vì `validate` cần biết trùm/nhân vật nào đã đăng ký.
`Loop.start` cuối cùng: frame đầu tiên chỉ chạy khi đã có scene. Lúc này `AudioContext` **chưa** được tạo (chờ cử chỉ đầu tiên, [04 mục 7](04-state-machines.md#7-audiocontext)).

---

## (b) Nhặt trang sách → mở thẻ → lưu Sổ tay

```mermaid
sequenceDiagram
  autonumber
  participant Lv as scene 'level'
  participant H as learnHook
  participant Ln as OG.Learn
  participant Sv as OG.Save
  participant Ev as OG.Events
  participant Au as OG.Audio
  participant Sc as OG.Scenes
  participant Cd as scene 'card'

  Lv->>H: runUpdateHooks: update(st, dt, player)
  H->>H: tâm người chơi gần tâm trang (PAGE_PICK_HALF_W/H)
  H->>H: pg.got = true
  H->>Ln: unlockCard(jid, pg.card, {silent: true})
  alt thẻ chưa có
    Ln->>Sv: ns('learn').cards[jid][cardId] = Date.now()
    Ln->>Sv: commit()
    Ln->>Ev: emit('card:unlock', {journeyId, cardId, count, total})
    Ev->>Au: sfx 'quest'
    Ln-->>H: true (isNew)
  else đã có từ trước
    Ln-->>H: false
  end
  H->>H: Game.hud.pages, Game.addScore(PAGE_SCORE = 50), hạt sao
  H->>Ev: emit('page:collect', {journeyId, levelId, cardId, x, y, isNew})
  Ev->>Au: sfx 'collect'
  alt isNew
    H->>Ln: openCard(jid, cardId, {isNew: true, from: 'level'})
    Ln->>Ev: emit('card:open', {journeyId, cardId, from})
    Ln->>Sc: push('card', {journeyId, cardId, isNew, from, onClose})
    Sc->>Cd: enter(params) (pháo hoa, bắt đầu tải ảnh)
    H-->>Lv: return true (dừng frame này)
    Note over Lv,Cd: scene 'level' đứng yên phía dưới (drawBelow)
    Cd->>Cd: 0,35 giây đầu bỏ qua phím
    Cd->>Sc: bé bấm hoặc chạm → close() → pop()
    Sc->>Lv: resume() → emit('game:resume')
  else đã có
    H->>H: chữ nổi "Đã có trong Sổ tay 📒"
  end
```
[(xem SVG)](svg/03-b-page.svg)

**Code:** [src/story/learn.js](../../src/story/learn.js) (`learnHook.update`, `unlockCard`, `openCard`), [src/story/scenes.js](../../src/story/scenes.js) (scene `card`: `enter`, `update`, `close`),
[src/game/level.js](../../src/game/level.js) (hàm nội bộ `runUpdateHooks`), [src/audio/audio.js](../../src/audio/audio.js) (`bindEvents`).

**Đọc thế nào:** "lưu Sổ tay" chính là bước 5–6: Sổ tay (scene `notebook`) **không có dữ liệu riêng**, nó đọc lại `ext.learn.cards` qua `OG.Learn.listCards`.
Thẻ được lưu **ngay lúc nhặt** chứ không đợi qua màn → bé thoát giữa chừng vẫn giữ thẻ.

**Vì sao `return true`:** hook vừa `push` một scene; nếu `level.update` chạy tiếp (vật phẩm, kẻ địch) trong cùng frame thì kẻ địch có thể
đánh trúng bé ngay dưới popup. **Vì sao khoá phím 0,35 giây:** phím/chạm vừa dùng để nhặt trang không được đóng luôn thẻ vừa mở.

---

## (c) Cổng câu đố: sai → gợi ý → đúng → mở cửa

```mermaid
sequenceDiagram
  autonumber
  actor Be as Bé
  participant H as learnHook
  participant Ln as OG.Learn
  participant Sc as OG.Scenes
  participant Q as scene 'quiz'
  participant Ev as OG.Events
  participant Au as OG.Audio

  H->>H: người chơi chồng lấn cổng (g.open = false)
  H->>H: đẩy về mép trái cổng, vx = 0 (tường)
  H->>H: L.cooldown = GATE_COOLDOWN (1,2 giây)
  H->>Ln: openGate(st, g) → openQuiz(jid, g.quiz, {levelId, gateId, onPass})
  Ln->>Ev: emit('quiz:open', {...})
  Ln->>Sc: push('quiz', {journeyId, quizId, levelId, gateId, onPass, onClose})
  H-->>H: return true (dừng frame)
  Be->>Q: chọn đáp án sai (mũi tên + Enter, phím 1-3 hoặc chạm)
  Q->>Q: choose(i): attempt++
  Q->>Ln: answerQuiz(jid, quizId, i, {attempt, levelId, gateId})
  Ln->>Ln: rec.tries++ , correct = (i === q.answer) → false
  Ln->>Ev: emit('quiz:answer', {correct: false, tries})
  Ev->>Au: sfx 'select' trầm nhẹ (KHÔNG có âm thua)
  Ln-->>Q: {correct: false, hint}
  Q->>Q: wrong[i] = true (gạch lựa chọn), msg = hint
  Note over Q: Không trừ mạng, không trừ điểm.<br/>Ở lại câu đố để thử tiếp.
  Be->>Q: chọn đáp án đúng
  Q->>Ln: answerQuiz(...)
  Ln->>Ln: rec.passed = true , Save.commit()
  Ln->>Ev: emit('quiz:answer', {correct: true})
  Ln->>Ev: emit('quiz:pass', {tries, firstTry, levelId, gateId})
  Ev->>Au: sfx 'victory' nhỏ
  opt q.cardId chưa có
    Ln->>Ln: unlockCard(jid, q.cardId, {silent: true})
  end
  Ln-->>Q: {correct: true, explain, cardUnlocked}
  Q->>Q: passed = true, hiện lời giải thích + pháo hoa
  Be->>Q: Enter hoặc chạm (sau 0,4 giây)
  Q->>Sc: finishPass() → pop()
  Q->>H: onPass() (closure giữ đúng g và st)
  H->>H: g.open = true , g.openT = 0
  H->>Ev: emit('gate:open', {levelId, gateId, quizId, x})
  Ev->>Au: sfx 'unlock'
  Note over H: Cổng mờ dần rồi biến mất sau GATE_VANISH_T (1,2 giây)
```
[(xem SVG)](svg/03-c-quiz.svg)

**Code:** [src/story/learn.js](../../src/story/learn.js) (`learnHook.update`, `canExit`, `openGate`, `openQuiz`, `answerQuiz`),
[src/story/scenes.js](../../src/story/scenes.js) (scene `quiz`: `choose`, `finishPass`, `later`).

**Nhánh không vẽ:** bấm **"Để sau ✕"** hoặc Esc → `later()` → `pop()` + `onClose` (cổng giữa màn không truyền `onClose`), cổng vẫn khoá;
nhờ `cooldown` 1,2 giây câu đố không bật lại ngay frame sau (⚠️ thiếu cooldown = kẹt vĩnh viễn). Cổng ở cửa EXIT (`x: 'exit'`) đi đường khác:
`level.js` hỏi `canExit` của hook → `false` = chặn và mở câu đố.

**Vì sao thiết kế như vậy:** luật giáo dục "sai không bao giờ bị phạt" ([`STORY.md` mục 0](../STORY.md)) được đặt trong **logic** `answerQuiz` chứ không chỉ
ở giao diện, nên smoke test kiểm tra được. Cổng **hỏi lại mỗi lần vào màn** (`gates` dựng mới trong `learnHook.enter`) để bé ôn tập;
`ext.learn.quizzes` chỉ ghi lịch sử (`tries`, `passed`) cho Sổ tay và thống kê.

---

## (d) Một trận trùm

Chia hai phần: **(d1)** vào trận và một chu kỳ đòn đánh; **(d2)** trúng đòn → đổi pha → gục → truyện → bản đồ.
Ví dụ dùng **Dee Dee** ([src/bosses/deedee.js](../../src/bosses/deedee.js)) ở chế độ Bé chơi.

### (d1) Vào trận, telegraph, tấn công, nghỉ thở

```mermaid
sequenceDiagram
  autonumber
  participant Lv as scene 'level'
  participant G as OG.Game
  participant St as OG.Story
  participant Bs as scene 'boss'
  participant Bo as OG.Bosses
  participant D as OG.Difficulty
  participant B as BossInstance (deedee)
  participant Ev as OG.Events

  Lv->>Lv: st.phase 'clear' → 'done' sau CLEAR_DELAY
  Lv->>G: finishStage(levelId)
  alt màn hành trình có bossIntro chưa xem
    G->>St: playComic(jid, bossIntro, {next: {scene: 'boss', params}})
    St-->>Bs: (xem truyện xong) Scenes.go('boss', {levelId, bossId})
  else
    G->>Bs: Scenes.go('boss', {levelId, bossId})
  end
  Bs->>Bs: enter: makeArena(level, bossId) (difficulty = D.params)
  Bs->>Bo: create(bossId, arena)
  Bo->>B: factory → K.createBase(SPEC, arena, cfg) , state 'intro'
  Bs->>D: setupBoss(boss, arena) , applyAssist(player, levelId)
  Bs->>Ev: emit('boss:start', {bossId, levelId, name, maxHp})
  loop mỗi frame (phase 'fight')
    Bs->>D: bossTimeScale() → bdt = dt × bossSpeedMul (0,75 ở kid)
    Bs->>B: update(bdt, arena)
  end
  B->>B: 'intro' xong → choose() → startAction('roll')
  B->>B: setState('rollWind', dur × telegraph) (báo trước: vùng đỏ, mũi tên)
  B->>B: stateDone → setState('roll', 4) (lăn, cả thân gây đau)
  B->>B: hitWall → endRollAtWall → setState('dizzy') (sơ hở, giẫm được)
  B->>B: stateDone → choose()
  opt kid: đòn vừa rồi không phải walk/idle và rest > 0
    B->>B: setState('breather', rest) (đứng thở, giẫm được)
  end
```
[(xem SVG)](svg/03-d1-boss-start.svg)

### (d2) Trúng đòn → đổi pha → gục → truyện → bản đồ

```mermaid
sequenceDiagram
  autonumber
  participant P as Người chơi
  participant Bs as scene 'boss'
  participant B as BossInstance
  participant Ev as OG.Events
  participant G as OG.Game
  participant St as OG.Story
  participant Sc as OG.Scenes

  Bs->>B: getWeakspot() (khác null khi 'dizzy', 'breather'...)
  Bs->>Bs: stomp(p, prevBottom, weak, WEAKSPOT_TOLERANCE, prevWeakTop)
  Bs->>P: vy = -STOMP_BOUNCE × 1,1 , inv = 0,3 giây
  Bs->>B: onHit(1, arena)
  B->>B: hp-- , inv = INV_TIME , stagger
  alt computePhase() > phase
    B->>B: phase = np , step = 0
    B->>Ev: K.emit → arena.emit('boss:phase', {bossId, phase})
    B->>B: toast phaseLines[np] , setState('roar') (bất tử)
  else vẫn pha cũ
    B->>B: onHurt() hoặc setState('recoil')
  end
  Bs->>G: addScore(BOSS_HIT_SCORE = 100)
  Bs->>Ev: emit('boss:hit', {bossId, hp, maxHp})
  Note over Bs,B: ...lặp lại cho tới khi hp = 0
  B->>B: die(): state 'dead', xoá đạn, killMinions
  Bs->>B: isDefeated() → true
  Bs->>Bs: checkBossDefeated: phase = 'end' , stats, addScore(500)
  Bs->>Ev: emit('boss:defeated', {bossId, levelId, time})
  Bs->>Bs: endT > END_DELAY (1,6 giây) → finish()
  Bs->>G: battle = null , completeLevel(levelId)
  G->>G: Progress.complete, Save.addCoins(reward)
  G->>Ev: emit('level:complete', result)
  alt màn hành trình
    G->>St: afterLevel(result)
    St->>Sc: playComics(outro, area.outro) → go('comic')
    St->>Sc: hết truyện → goNext → go('journeyMap', {completed, result})
  else chiến dịch cổ điển
    G->>Sc: go('worldmap', {completed, result}) hoặc victory()
  end
```
[(xem SVG)](svg/03-d2-boss-end.svg)

**Code:** [src/game/game.js](../../src/game/game.js) (`finishStage`, `completeLevel`), [src/game/boss-scene.js](../../src/game/boss-scene.js) (`makeArena`, `stompBossOrGetHurt`,
`checkBossDefeated`, `finish`), [src/bosses/bosses.js](../../src/bosses/bosses.js) (`K.createBase`: `setState`, `choose`, `onHit`, `die`, `getWeakspot`),
[src/bosses/deedee.js](../../src/bosses/deedee.js) (`startAction`, `think`, `endRollAtWall`), [src/game/difficulty.js](../../src/game/difficulty.js) (`setupBoss`, `bossTimeScale`),
[src/story/story.js](../../src/story/story.js) (`afterLevel`, `playComics`).

**Vì sao:**
- **Telegraph** (báo hiệu trước đòn) luôn là một trạng thái riêng tên kết thúc bằng `Wind`; `setState` tự nhân thời lượng với `diff.telegraph`
  (1,3 ở kid). Một quy ước tên thay cho cờ rải rác — đánh đổi: đặt sai tên (vd `rollPrep`) là mất hiệu ứng ở chế độ kid.
- **Time scale**: trùm nhận `bdt` đã nhân hệ số nên *mọi* bộ đếm giờ của trùm chậm lại đồng loạt, người chơi vẫn chạy tốc độ thật.
- `battle = null` **trước** `completeLevel`: để `OG.BossScene.isActive()` là `false` khi scene đổi.
- `stage` dùng chung cho màn và trận trùm sau nó → sao "không bị thương" tính cả hai.

---

## (e) Hết mạng ở chế độ Bé chơi

### (e1) Bị thương đến hết mạng → softFail → hồi sinh ở checkpoint

```mermaid
sequenceDiagram
  autonumber
  participant Ck as checkpointHook
  participant Lv as scene 'level'
  participant P as OG.Player
  participant G as OG.Game
  participant D as OG.Difficulty
  participant Sv as OG.Save
  participant Ev as OG.Events
  participant St as OG.Story

  Ck->>Ck: update: tâm người chơi vượt c.x → c.reached = true
  Ck->>Ck: st.checkpoint = {x, y} (điểm hồi sinh)
  Ck->>Ev: emit('checkpoint:reach', {levelId, index, x, y})
  Note over Lv: ...một lúc sau, chạm gián
  Lv->>P: hurt(p, 'enemy')
  alt p.inv > 0 hoặc còn khiên
    P-->>Lv: false (bỏ qua / khiên đỡ)
  else
    P->>P: inv = hurtInvuln (2,2 giây ở kid), bật lên
    P->>Ev: emit('player:hurt', {lives: dự đoán, cause, shielded: false})
    P->>G: loseLife('enemy')
    G->>G: run.lives-- (= 0)
    G->>Ev: emit('lives:change', {lives, maxLives})
    G->>D: OG.util.call('Difficulty', 'softFail', {levelId, cause})
    alt hành trình và get('softFail') (kid)
      D->>D: recordFail(levelId) → fails[levelId]++ , version++
      D->>Sv: commit()
      opt assistLevel tăng (thua 2 lần)
        D->>Ev: emit('assist:on', {levelId, level, fails})
      end
      D->>D: run.lives = lives + extraLives (đầy mạng)
      D->>Lv: player về st.checkpoint (hoặc spawn), inv 2,5 giây, khiên
      D->>Ev: emit('lives:change') , emit('player:respawn', {cause: 'softfail'})
      D->>St: onSoftFail({levelId, assist})
      D-->>G: true
      G-->>P: số mạng mới (không game over)
    else challenge hoặc chiến dịch cổ điển
      D-->>G: false
      G->>Ev: emit('player:die', {cause})
      G->>G: gameOver() → emit('game:over') → Scenes.go('gameover')
    end
  end
```
[(xem SVG)](svg/03-e1-softfail.svg)

### (e2) Rơi xuống hố

```mermaid
sequenceDiagram
  autonumber
  participant Lv as scene 'level'
  participant D as OG.Difficulty
  participant P as OG.Player
  participant Ev as OG.Events

  Note over Lv,D: mỗi frame checkpointHook gọi D.trackSafe(p, st)<br/>ghi p.safeX, p.safeY khi đứng vững, xa kẻ địch
  Lv->>Lv: handleFall: p.y > OG.H + FALL_MARGIN
  Lv->>D: OG.util.call('Difficulty', 'onFall', p, st)
  alt kid (fallDamage = false)
    D->>D: p về (safeX, safeY - FALL_DROP), inv FALL_INVULN
    D->>Ev: emit('player:respawn', {cause: 'fall', x, y, levelId})
    D-->>Lv: true (không mất mạng)
  else challenge
    D-->>Lv: false
    Lv->>P: hurt(p, 'fall') → mất 1 mạng như v1
  end
```
[(xem SVG)](svg/03-e2-fall.svg)

**Code:** [src/game/player.js](../../src/game/player.js) (`hurt`), [src/game/game.js](../../src/game/game.js) (`loseLife`, `gameOver`),
[src/game/difficulty.js](../../src/game/difficulty.js) (`softFail`, `recordFail`, `onFall`, `trackSafe`, `checkpointHook`), [src/game/level.js](../../src/game/level.js) (`handleFall`),
[src/story/story.js](../../src/story/story.js) (`onSoftFail`).

**Vì sao:** chế độ cho trẻ 5–10 tuổi "không bao giờ game over" nhưng vẫn có cảm giác thử thách (mất tim, quay lại checkpoint).
**DDA** (dynamic difficulty adjustment — tự điều chỉnh độ khó): thua cùng màn nhiều lần → `assistLevel` tăng → địch chậm hơn, trùm ít máu hơn, có khiên.
Lời gọi đi qua `OG.util.call` nên `game.js` không phụ thuộc cứng `difficulty.js`. ⚠️ Bẫy trong `player.js`: `player:hurt` phát **trước** `loseLife`
nên payload phải "đoán trước" số mạng.

---

## (f) Lưu, tải và migrate dữ liệu

```mermaid
sequenceDiagram
  autonumber
  participant M as main.js
  participant Sv as OG.Save
  participant LS as localStorage
  participant Ln as Module (vd OG.Learn)
  participant Ev as OG.Events

  M->>Sv: load()
  Sv->>LS: storageSet('oggyAdventure.probe', '1') rồi xoá
  LS-->>Sv: ghi được? → Save.available
  Sv->>Sv: d = defaults() (object MỚI, v: 1)
  Sv->>LS: storageGet('oggyAdventure.save.v1')
  alt có chuỗi JSON
    alt JSON.parse thành công
      Sv->>Sv: d = merge(d, saved) (deep merge, mảng thay nguyên)
    else JSON hỏng
      Sv->>Sv: console.warn, giữ mặc định
    end
  end
  Sv->>LS: storageGet('oggyBest') (kỷ lục bản MVP)
  Sv->>Sv: nếu lớn hơn thì d.bestScore = legacy
  Sv-->>M: Save.data = d
  Note over Ln: ...khi chơi
  Ln->>Sv: ns('learn') → Save.data.ext.learn (tạo {} nếu thiếu)
  Ln->>Ln: sửa trực tiếp object trả về
  Ln->>Sv: commit()
  Sv->>LS: storageSet(KEY, JSON.stringify(data)) (try/catch)
  Sv->>LS: storageSet('oggyBest', bestScore) (tương thích ngược)
  Note over Sv: Xoá dữ liệu (Cài đặt)
  M->>Sv: reset()
  Sv->>Sv: data = defaults()
  Sv->>LS: xoá KEY và 'oggyBest', rồi commit()
  Sv->>Ev: emit('save:reset', {})
  Note over Ev: Audio, Difficulty, Social, Shop,<br/>journey-map, Quests tự xoá cache của mình
```
[(xem SVG)](svg/03-f-save.svg)

**Code:** [src/core/save.js](../../src/core/save.js) (`load`, `commit`, `ns`, `reset`, hàm nội bộ `defaults`, `merge`, `storageGet`, `storageSet`, `storageRemove`).

**Vì sao:**
- `defaults()` là **hàm** trả object mới (không phải hằng) → `reset()` rồi sửa `data` không làm bẩn "bản mặc định".
- **Deep merge** = cơ chế nâng cấp: thêm field mới vào `defaults()` là save cũ tự có giá trị mặc định, không cần viết code migrate cho mỗi field.
  Migrate thật (khoá khác, định dạng khác) chỉ có một trường hợp: `oggyBest` của bản MVP.
- Mọi truy cập `localStorage` bọc `try/catch` vì nó **có thể ném lỗi** (bị chặn, đầy, private mode); game vẫn chạy với dữ liệu trong RAM.
- `save:reset` dùng **event** để các module tự dọn cache: `Save` không cần biết module nào có cache.

**Đánh đổi:** `commit()` ghi **toàn bộ** object mỗi lần (đơn giản, dữ liệu nhỏ nên nhanh). Nếu save lớn lên nhiều, cần gộp nhiều lần ghi (debounce).
Xem thêm bài học [11-luu-tru-migrate.md](../learn/11-luu-tru-migrate.md).

---

## (g) Tải ảnh lười (lazy) cho thẻ + fallback

```mermaid
sequenceDiagram
  autonumber
  participant H as learnHook
  participant Ph as OG.Photos
  participant Img as new Image()
  participant B as Trình duyệt
  participant Cd as scene 'card'
  participant Ev as OG.Events

  H->>Ph: enter: preload(jid, [cardId của các trang trong màn])
  loop mỗi cardId có ảnh (has)
    Ph->>Ph: image(jid, cardId): cache chưa có
    Ph->>Ph: rec = {img, state: 'loading'}
    Ph->>Img: gán onload, onerror TRƯỚC, rồi src = 'assets/photos/jid/file'
    Img->>B: tải bất đồng bộ (decoding async)
  end
  Note over Cd: Bé nhặt trang → push 'card'
  Cd->>Ph: enter: image(jid, cardId) (trả rec trong cache)
  loop mỗi frame draw()
    Cd->>Ph: photo(): get() + image()
    alt thẻ không có ảnh (get = null)
      Cd->>Cd: drawClassic (hình vẽ cartoon)
    else rec.state 'loading'
      Cd->>Ph: drawShimmer(...) trong khung polaroid
    else rec.state 'ready'
      Cd->>Ph: drawCover(ctx, img, ..., focus) + creditLine(e)
    else rec.state 'error'
      Cd->>Cd: photo() = null → drawClassic
    end
  end
  B-->>Img: load xong
  Img->>Ph: onload → rec.state = 'ready'
  Ph->>Ev: emit('photo:load', {journeyId, cardId})
  Note over Cd: frame kế tiếp tự thấy 'ready' và vẽ ảnh<br/>(không cần "vẽ lại" thủ công)
```
[(xem SVG)](svg/03-g-photo.svg)

**Code:** [src/story/photos.js](../../src/story/photos.js) (`preload`, `image`, `ready`, `drawCover`, `drawShimmer`, `creditLine`),
[src/story/learn.js](../../src/story/learn.js) (`learnHook.enter`), [src/story/scenes.js](../../src/story/scenes.js) (scene `card`: `enter`, `photo`, `draw`; hàm `drawPolaroid`).

**Vì sao:**
- **Lazy-load**: 4 hành trình có hơn 70 ảnh; tải hết lúc khởi động là lãng phí trên điện thoại. `preload` chỉ tải ảnh của **màn đang chơi**,
  nên khi bé nhặt trang, ảnh thường đã sẵn sàng.
- **Máy trạng thái 3 trạng thái** (`loading → ready | error`, đúng một lần) + cache theo khoá `'jid/cardId'` → mỗi ảnh chỉ `new Image()` một lần
  dù `draw` hỏi 60 lần/giây; lỗi không thử lại liên tục.
- **Không cần callback vẽ lại** vì game vẽ lại toàn bộ canvas mỗi frame (immediate mode).
- **Fallback**: thiếu ảnh hay lỗi mạng → bố cục cartoon cũ, game không bao giờ hỏng. ⚠️ Gán `onload/onerror` trước `src` (comment trong `image`).
- Dòng ghi công **không được bỏ**: tràn chỗ thì cắt ngắn tên tác giả dần (vòng `for` quanh `creditLine` trong `drawPolaroid`).

---

## (h) Chia sẻ điểm

```mermaid
sequenceDiagram
  autonumber
  actor U as Người chơi
  participant R as Khối kết quả (mountResult)
  participant S as OG.Social
  participant Cv as canvas 1200x630
  participant N as navigator
  participant Ev as OG.Events

  U->>R: bấm "📤 CHIA SẺ" (handler click)
  R->>S: share(result) NGAY trong handler
  S->>S: text = shareText(result)
  alt không có navigator.share
    S->>S: fallback() → copyText(text)
  else có navigator.share
    opt có canShare và File
      S->>S: cardBlob(result)
      S->>S: cardDataURL: cache theo resultKey + tên
      opt cache trượt
        S->>Cv: createCard(result) → drawCard(ctx, result, name)
        Cv-->>S: toDataURL('image/png')
      end
      S->>S: dataURLToBlob (đồng bộ: atob → Uint8Array → Blob)
      S->>N: canShare({files: [File png]})
      N-->>S: true → data.files = [file]
    end
    S->>N: share({title, text, files?})
    alt người dùng chia sẻ xong
      N-->>S: resolve → lastShareMethod = 'share' , ok = true
    else AbortError (tự huỷ)
      N-->>S: reject → 'cancel' , ok = false
    else lỗi khác (NotAllowedError...)
      N-->>S: reject → fallback() → copyText
    end
  end
  Note over S,N: copyText: navigator.clipboard.writeText (cần secure context)<br/>lỗi → textarea ẩn + document.execCommand('copy')
  S->>Ev: emit('social:share', {method, ok})
  S-->>R: Promise ok → toast "Đã chia sẻ!" / "Đã sao chép..."
```
[(xem SVG)](svg/03-h-share.svg)

**Code:** [src/social/social.js](../../src/social/social.js) (`mountResult`, `share`, `shareText`, `copyText`, `cardBlob`, `cardDataURL`, `createCard`, hàm nội bộ
`drawCard`, `dataURLToBlob`, `execCopy`). Nút "🖼️ TẢI ẢNH" bên cạnh dùng `downloadCard` (thẻ `<a download>`).

**Vì sao:**
- **Progressive enhancement** (nâng cấp dần): `navigator.share` (điện thoại) → Clipboard API → `execCommand` (trình duyệt cũ, `file://`).
  Không có gì thì vẫn còn nút tải ảnh.
- **User activation**: `navigator.share` chỉ được gọi "ngay" trong xử lý cú bấm. `canvas.toBlob` là bất đồng bộ, đợi nó có thể làm hết hạn quyền
  (Safari rất chặt) → code giải mã base64 **đồng bộ** (`dataURLToBlob`) để giữ mọi thứ trong cùng một lượt xử lý.
- **Cache thẻ** theo `resultKey` + tên: `toDataURL` ảnh 1200×630 tốn hàng chục ms, không vẽ lại khi bấm chia sẻ nhiều lần.
