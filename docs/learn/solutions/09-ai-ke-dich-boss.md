# Lời giải — Bài 09: AI kẻ địch và trùm

> ✋ **Hãy tự làm trước.** Lời giải chỉ có ích khi bạn đã thử và bị kẹt ít nhất 15 phút. Đọc lời giải quá sớm sẽ lấy mất phần
> "à, ra thế!", mà đó lại là lúc bạn học được nhiều nhất.
>
> Quay lại bài học: [09-ai-ke-dich-boss.md](../09-ai-ke-dich-boss.md)

Hai bài đầu dán vào Console khi đang ở trong một màn chơi. Bài ba dán ở bất kỳ đâu rồi gọi `OG.Game.ensureRun()` và
`OG.Scenes.go('boss', ...)` (thiếu `ensureRun()` khi chưa bấm "Chơi" thì `boss.enter` báo lỗi, xem bài 09 "Thử ngay" bước 1).

---

## ⭐ Ốc sên

```js
OG.Enemies.registerType('snail', {
  w: 36, h: 24, score: 30,
  init: function (e) { e.speed *= 0.4; },          // chậm hơn gián: 75 → 30 px/giây (trước khi độ khó nhân thêm)
  update: function (e, dt) {
    e.x += e.dir * e.speed * dt;
    if (e.x - e.base > e.range) { e.x = e.base + e.range; e.dir = -1; }      // kẹp biên rồi quay đầu
    else if (e.base - e.x > e.range) { e.x = e.base - e.range; e.dir = 1; }
  },
  draw: function (ctx, e, t) {
    ctx.save();
    ctx.translate(e.x + e.w / 2, e.y + e.h);        // gốc = chân (giữa-đáy hitbox), toạ độ thế giới
    if (!e.alive) {                                 // bị giẫm: bẹp + mờ dần (Enemies.draw tự ẩn sau 0.5 s)
      ctx.globalAlpha = Math.max(0, 1 - e.deadT * 2);
      ctx.scale(1.3, 0.3);
    }
    ctx.scale(e.dir, 1);                            // vẽ hướng phải, scale(-1) lật sang trái
    ctx.lineWidth = 2.5; ctx.strokeStyle = '#17233d';
    // thân (vẽ trước) → vỏ (đè lên) → mắt trên cọng (sau cùng)
    var crawl = Math.sin(e.t * 6) * 2;              // thân co duỗi khi bò
    ctx.fillStyle = '#c9e27a';
    ctx.beginPath(); ctx.ellipse(2, -5, 18 + crawl, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#d98b4a';
    ctx.beginPath(); ctx.arc(-3, -13, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(-3, -13, 5, 0, Math.PI * 1.5); ctx.stroke();      // vân xoắn
    ctx.beginPath(); ctx.moveTo(14, -8); ctx.lineTo(17, -22); ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(17, -23, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
});

// Thả một con trước mặt người chơi (đang ở trong màn):
var st = OG.Level.state;
st.enemies.push(OG.Enemies.create({ type: 'snail', x: st.player.x + 250, range: 80 }, st.enemies.length));
```

**Giải thích.**

- **Không sửa dòng nào của `level.js` hay `enemies.js`.** `Enemies.create` tra `types['snail']`, `Enemies.update/draw` gọi
  `T.update/T.draw`, còn `updateEnemies` trong `level.js` lo giẫm (`e.stompable`, mặc định `true`) và chạm (`OG.Enemies.hurtbox(e)`)
  cho **mọi** loại. Đó là sức mạnh của strategy + registry.
- **`init` chạy trước `scaleEnemy`.** Trong `create`, thứ tự là `T.init(e, src)` rồi mới `OG.util.call('Difficulty', 'scaleEnemy', e)`.
  Ta giảm tốc độ **gốc**, độ khó vẫn được áp đúng lên trên (chế độ Bé chơi ×0,7 nữa).
- **Hitbox mặc định đặt trên sàn.** `create` đặt `y = OG.FLOOR_Y − h` khi dữ liệu không ghi `y`. Ốc sên thả trên một đoạn hố (sàn bị
  ngắt) sẽ "bò trên không", vì AI tuần tra này không xét sàn bên dưới. Muốn chuẩn thì phải dò `world.platforms` như hàm `underLedge`
  của Dee Dee.
- **Vẽ một lần, cho cả hai hướng.** `ctx.scale(e.dir, 1)` lật toàn bộ hình. Hàm vẽ chỉ cần nghĩ "nhìn sang phải".
- **Thứ tự lớp** (painter's algorithm): thân → vỏ đè lên thân → cọng mắt sau cùng.

---

## ⭐⭐ Gián "đuổi bắt"

```js
(function () {
  var SEE_X = 260;          // px: thấy người chơi trong khoảng ngang này
  var SEE_Y = 120;          // px: và lệch dọc không quá chừng này (đứng trên bục cao thì không thấy)
  var ALERT_TIME = 0.6;     // giây telegraph: đứng lại, hiện "!"
  var CHASE_TIME = 2.5;     // giây đuổi
  var CHASE_MUL = 2.2;      // tốc độ đuổi = 2.2 × tốc độ tuần tra
  var TIRED_TIME = 1.2;     // giây mệt: đứng thở, KHÔNG gây đau (khoảng hở)

  function setMode(e, mode) { e.mode = mode; e.modeT = 0; e.hurts = mode !== 'tired'; }

  OG.Enemies.registerType('chaser', {
    w: 34, h: 28, score: 90,
    init: function (e) { setMode(e, 'patrol'); },
    update: function (e, dt, world) {
      var p = world && world.player;
      e.modeT += dt;
      var dx = p ? (p.x + p.w / 2) - (e.x + e.w / 2) : Infinity;
      var sees = p && Math.abs(dx) < SEE_X && Math.abs((p.y + p.h) - (e.y + e.h)) < SEE_Y;
      switch (e.mode) {
        case 'patrol':
          e.x += e.dir * e.speed * dt;
          if (e.x - e.base > e.range) { e.x = e.base + e.range; e.dir = -1; }
          else if (e.base - e.x > e.range) { e.x = e.base - e.range; e.dir = 1; }
          if (sees) setMode(e, 'alert');
          break;
        case 'alert':                                   // telegraph: quay về phía người chơi, đứng yên
          e.dir = dx < 0 ? -1 : 1;
          if (e.modeT >= ALERT_TIME) setMode(e, 'chase');
          break;
        case 'chase':
          e.dir = dx < 0 ? -1 : 1;
          e.x += e.dir * e.speed * CHASE_MUL * dt;
          if (world && world.width) e.x = Math.max(0, Math.min(world.width - e.w, e.x)); // không chạy khỏi màn
          if (e.modeT >= CHASE_TIME) setMode(e, 'tired');
          break;
        case 'tired':
          if (e.modeT >= TIRED_TIME) { e.base = e.x; setMode(e, 'patrol'); } // tuần tra quanh chỗ mới
          break;
      }
    },
    draw: function (ctx, e, t) {
      var anim = !e.alive ? 'hurt' : e.mode === 'chase' ? 'attack' : e.mode === 'tired' ? 'stunned'
        : e.mode === 'alert' ? 'idle' : 'run';
      ctx.save();
      ctx.translate(e.x + e.w / 2, e.y + e.h);
      if (!e.alive) { ctx.globalAlpha = Math.max(0, 1 - e.deadT * 2); ctx.scale(1.2, 0.35); }
      OG.Sprites.drawCharacter(ctx, 'roach', anim, e.t, { face: e.dir, w: e.w, h: e.h, colors: { body: '#c0392b' } });
      ctx.restore();
      if (e.alive && e.mode === 'alert') {               // dấu "!" nhấp nháy phía trên đầu
        ctx.save();
        ctx.font = OG.font(26, 'bold'); ctx.textAlign = 'center';
        ctx.lineWidth = 5; ctx.strokeStyle = '#17233d'; ctx.fillStyle = '#e5484d';
        var y = e.y - 10 - Math.abs(Math.sin(e.modeT * 12)) * 6;
        ctx.strokeText('!', e.x + e.w / 2, y); ctx.fillText('!', e.x + e.w / 2, y);
        ctx.restore();
      }
    }
  });
})();
var st = OG.Level.state;
st.enemies.push(OG.Enemies.create({ type: 'chaser', x: st.player.x + 400, range: 120 }, st.enemies.length));
```

**Giải thích.**

- **Một hàm `setMode` cho mọi phép chuyển.** Đặt lại `modeT` và cập nhật `e.hurts` ở **một chỗ**, nên không bao giờ quên. Đây là
  phiên bản mini của `b.setState` trong `K.createBase`. Ở đây đếm **lên** (`modeT += dt`, so với thời lượng) thay vì đếm xuống như
  Joey. Hai cách tương đương; đếm lên tiện hơn khi cần biết "đã ở trạng thái này bao lâu" (dùng cho hiệu ứng nhấp nháy của "!").
- **Telegraph phải nhìn thấy được.** `alert` vừa có dấu "!" vừa đổi animation sang `idle` (đứng khựng). 0,6 giây đủ để bé kịp nhảy.
  Thử giảm `ALERT_TIME` xuống 0,1: trò chơi lập tức trở nên "bất công", dù AI không mạnh hơn chút nào.
- **Khoảng hở thật sự an toàn.** `e.hurts = false` trong `tired` nên chạm vào không đau, mà vẫn giẫm được (`stompable`). Người chơi
  được **thưởng** vì né được cú lao.
- **"Thấy" theo cả hai trục.** Chỉ xét khoảng ngang thì gián dưới sàn sẽ "thấy" người chơi đứng trên bục cao rồi lao qua lao lại bên
  dưới. Điều kiện dọc `SEE_Y` loại trường hợp đó.
- **Vẽ chữ ngoài phép lật.** "!" được vẽ **sau** `ctx.restore()`, tức ngoài `face`, nên không bị ngược. `drawCharacter` của Sprites
  cũng làm vậy với chữ "OÁI!".
- **`colors: { body: ... }`** đổi màu thân gián. `colors` nằm trong khoá cache của `sprites.js` (bài 07), nên gián đỏ và gián tím
  không dùng nhầm khung của nhau.

**Mở rộng.** Thêm điều kiện "mất dấu": trong `chase`, nếu người chơi ra khỏi `SEE_X × 1,5` thì chuyển sớm sang `tired`. Khoảng
"thấy" (260) nhỏ hơn khoảng "mất dấu" (390) là **hysteresis** (trễ), giúp AI không chập chờn bật/tắt đuổi khi người chơi đứng đúng
ở mép tầm nhìn. `src/story/guide.js` dùng cùng ý tưởng cho NPC.

---

## ⭐⭐⭐ Trùm "Gián Khổng Lồ"

```js
(function () {
  var K = OG.Bosses.kit;
  /** @type {BossSpec} */
  var SPEC = {
    id: 'bigroach', name: 'Gián Khổng Lồ', charId: 'roach', maxHp: 4, scale: 2.6,
    phaseAt: [2],                                     // hp ≤ 2 → pha 2
    phaseLines: { 2: 'Gián Khổng Lồ nổi điên! Lao nhanh hơn!' },
    patterns: { 1: ['walk', 'charge'], 2: ['charge', 'charge', 'walk'] }
  };
  var WALK_SPEED = 60;            // px/giây
  var CHARGE_SPEED = [420, 540];  // px/giây theo pha
  var WIND_TIME = [0.9, 0.6];     // giây telegraph theo pha
  var DIZZY_TIME = 1.6;           // giây choáng sau khi đâm tường (khoảng hở chính)

  function create(arena, cfg) {
    var b = K.createBase(SPEC, arena, cfg);
    b.chargeDir = -1;

    // Trạng thái nào giẫm được / trạng thái nào cả thân gây đau.
    b.isVulnerable = function () { return b.state === 'walk' || b.state === 'dizzy'; };
    b.isFullHurt = function () { return b.state === 'charge'; };

    // Bắt đầu một đòn: chỉ ĐẶT trạng thái đầu tiên; think() lo phần còn lại.
    b.startAction = function (a, arena) {
      b.faceToPlayer(arena);
      if (a === 'charge') {
        b.chargeDir = b.dirToPlayer(arena);
        b.setState('chargeWind', b.byPhase(WIND_TIME));   // tên kết thúc bằng "Wind" → kid mode kéo dài
      } else {
        b.setState('walk', 1.5);
      }
    };

    // Mỗi case = một trạng thái: đặt vận tốc/animation, rồi kiểm tra điều kiện chuyển.
    b.think = function (dt, arena) {
      switch (b.state) {
        case 'intro':
          b.vx = 0; b.setAnim('idle'); b.faceToPlayer(arena);
          if (b.stateDone()) b.choose(arena);
          break;
        case 'walk':
          b.face = b.dirToPlayer(arena);
          b.vx = b.face * WALK_SPEED;
          b.setAnim('run');
          if (b.stateDone()) { b.vx = 0; b.choose(arena); }
          break;
        case 'chargeWind':
          b.vx = 0; b.face = b.chargeDir; b.setAnim('attack');
          if (b.stateDone()) b.setState('charge', 3);
          break;
        case 'charge':
          b.vx = b.chargeDir * b.byPhase(CHARGE_SPEED);
          b.setAnim('run');
          // stateDone() là lưới an toàn: lỡ không chạm tường thì 3 giây sau vẫn thoát.
          if (b.hitWall === b.chargeDir || b.stateDone()) {
            b.vx = 0;
            K.call(arena, 'shake', 8, 0.3);
            K.puff(arena, b.cx(), b.y + b.h / 2, '#ffffff', 12, 220);
            b.setState('dizzy', DIZZY_TIME);              // 'dizzy' có trong STUN_STATES → kid mode choáng lâu hơn
          }
          break;
        case 'dizzy':
          b.vx = 0; b.setAnim('stunned');
          if (b.stateDone()) b.choose(arena);
          break;
      }
    };

    // Telegraph vẽ SAU LƯNG trùm: vùng đỏ trên sàn theo hướng sắp lao, đậm dần theo tiến độ.
    b.drawBehind = function (ctx, arena, t) {
      if (b.state !== 'chargeWind') return;
      var x0 = b.chargeDir > 0 ? b.x + b.w : 0;
      var w = b.chargeDir > 0 ? K.width(arena) - x0 : b.x;
      K.drawWarnZone(ctx, x0, w, K.floorY(arena), t, b.stateT / Math.max(0.01, b.stateDur));
    };
    b.drawFront = function (ctx, arena, t) {
      if (b.state === 'chargeWind') K.drawArrow(ctx, b.cx() + b.chargeDir * b.w * 0.6, b.y + b.h * 0.4, b.chargeDir, t);
    };
    return b;
  }

  OG.Bosses.factories.bigroach = create;
  OG.Bosses.register({ id: SPEC.id, name: SPEC.name, maxHp: SPEC.maxHp, create: function (arena) { return create(arena); } });
})();
// Đánh thử (ghi tiến độ màn kitchen vào save khi thắng):
// OG.Game.ensureRun(); OG.Scenes.go('boss', { levelId: 'kitchen', bossId: 'bigroach' });
```

Trong một lần chạy thử, chuỗi trạng thái ghi được là `intro → walk → chargeWind → charge → dizzy → recoil → ... → roar → ... → dead`.
`recoil` (bị đẩy lùi khi trúng đòn), `roar` (gầm khi sang pha 2) và `dead` là trạng thái **chung** do `K.createBase` tự lo, ta không
viết dòng nào cho chúng.

**Giải thích.**

- **Ta chỉ viết phần "riêng".** Máu, pha, toast đổi pha, phát `'boss:phase'` (HUD tự hiện banner "GIAI ĐOẠN 2" nhờ nghe event này),
  i-frames, nháy trắng khi trúng đòn, weakspot/hurtbox, mũi tên "GIẪM!", vật lý, chết và văng ra đều có sẵn trong khung. Đó là
  **template method**: `b.update` gọi `b.think` của ta ở đúng chỗ trong một quy trình cố định.
- **Phân vai rõ ràng.** `startAction` = "bắt đầu đòn nào" (chỉ đặt trạng thái đầu). `think` = "mỗi frame, trạng thái hiện tại làm gì
  và khi nào chuyển". `choose` (của khung) = "đòn kế tiếp là gì". Tách như vậy, thêm đòn mới chỉ cần thêm một nhánh trong
  `startAction` và vài `case` trong `think`.
- **Mỗi trạng thái có lối thoát theo giờ.** `charge` thoát khi đụng tường **hoặc** sau 3 giây. Nếu lỡ đặt trùm ở giữa một arena
  không có tường (vd arena hành trình rộng hơn), FSM vẫn không bao giờ kẹt.
- **Telegraph có ba lớp tín hiệu:** đứng khựng + animation `attack`, vùng đỏ đậm dần trên sàn (`K.drawWarnZone`, tiến độ
  `stateT / stateDur`), mũi tên chỉ hướng (`K.drawArrow`). Ở chế độ Bé chơi, khung còn vẽ thêm vòng đếm ngược (`K.drawTelegraph`) cho
  **mọi** trạng thái `...Wind`.
- **Dependency injection.** Trùm rung màn hình bằng `K.call(arena, 'shake', ...)`, không phải `OG.Camera.shake`. Trùm này chạy được
  với bất kỳ arena nào có (hoặc không có) hàm `shake`, kể cả arena giả trong test.

**Vì sao chế độ Bé chơi tự dễ hơn mà không cần thêm code?**

1. `scene 'boss'` nhân `dt` của trùm với `bossTimeScale()` = 0,75: mọi thứ (đi bộ, lao, đếm giờ) chậm lại 25%.
2. `b.setState('chargeWind', ...)`: tên khớp `/Wind$/` nên thời lượng × `bossTelegraphMul` (1,3).
3. `b.setState('dizzy', ...)`: `'dizzy'` nằm trong `STUN_STATES` nên thời lượng × `bossStunMul` (1,35).
4. `K.createBase` co máu theo `bossHpMul` (0,6): 4 × 0,6 = 2,4, làm tròn còn **2** máu, và ngưỡng pha co theo (`[2]` thành `[1]`).
5. `b.choose` chèn `breather` 0,9 giây sau mỗi `charge` (vì `'charge'` không nằm trong `CALM_ACTIONS`).

Nếu bạn đặt tên `chargePrep` thay vì `chargeWind`, hay `stunned` thay vì `dizzy`, thì (2) hoặc (3) **im lặng không xảy ra**. Đó là
cái giá của "quy ước thay cho cấu hình" mà `⚠️ Bẫy` trong `b.setState` cảnh báo.

**Mở rộng.**

- Thêm đòn thứ ba `'stomp'`: nhảy lên (`b.vy = -500`), khi `b.landed` thì sinh **sóng xung kích** chạy dọc sàn bằng `K.spawnProj`.
  Đọc `slamWind` và sóng trong `src/bosses/marky.js` để tham khảo. Nhớ telegraph (`stompWind`) trước.
- Cho Gián Khổng Lồ gọi lính bằng `arena.spawnEnemy({ type: 'chaser', x: ..., range: 100 })` (kẻ địch của bài ⭐⭐). Scene `boss`
  tự cập nhật và xét va chạm cho `arena.enemies`.
- Đăng ký trùm vào một màn thật: trong dữ liệu màn, `boss: 'bigroach'`. `OG.Game.finishStage` sẽ tự đưa người chơi vào trận khi qua
  cửa (xem bài 05 và bài 12).
