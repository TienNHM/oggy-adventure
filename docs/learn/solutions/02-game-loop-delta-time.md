# Lời giải — Bài 02: Game loop và delta time

> ✋ **Hãy tự làm trước.** Lời giải chỉ có ích khi bạn đã thử và bị kẹt ít nhất 15 phút. Đọc lời giải quá sớm sẽ lấy mất phần
> "à, ra thế!", mà đó lại là lúc bạn học được nhiều nhất.
>
> Quay lại bài học: [02-game-loop-delta-time.md](../02-game-loop-delta-time.md)

---

## ⭐ Đếm frame một giây

```js
var n = 0, start = null;
function count(t) {
  if (start === null) start = t;   // t = timestamp rAF, ms
  n++;
  if (t - start < 1000) requestAnimationFrame(count);
  else console.log('frame trong 1 giây:', n, '· OG.Loop.fps:', OG.Loop.fps.toFixed(1));
}
requestAnimationFrame(count);
```

**Kết quả** (màn 60 Hz): `n` khoảng 60–61, `OG.Loop.fps` khoảng 59–60. Màn 144 Hz cho khoảng 144.

**Giải thích.** Mọi callback rAF đăng ký trước lần vẽ kế tiếp đều được trình duyệt gọi **trong cùng một lượt**, với **cùng**
timestamp `t`. Vòng đếm của bạn và `OG.Loop` vì thế chạy cùng nhịp. Hai số lệch nhau một chút vì `OG.Loop.fps` là trung bình
trượt (EMA): nó phản ứng chậm với thay đổi, không phải số đếm chính xác.

---

## ⭐⭐ Slow motion bằng time scale

```js
var origUpdate = OG.Scenes.update;
OG.Scenes.update = function (dt) { origUpdate.call(OG.Scenes, dt * 0.3); };

// ... chơi thử ...

OG.Scenes.update = origUpdate; // trả lại như cũ
```

**Quan sát và giải thích:**

| Thứ | Chậm theo? | Vì sao |
|---|---|---|
| Nhân vật, gián, hạt | ✅ | Đều được update bên trong scene với `dt` đã nhân 0.3 |
| Đồng hồ HUD | ✅ | `OG.Game.tickTime(dt)` được scene `level` gọi với dt đã nhân |
| `OG.time` | ❌ | `OG.time += dt` nằm trong `tick`, **trước** `OG.Scenes.update` |
| Rung màn hình | ❌ | `OG.Camera.update(dt)` cũng nằm trong `tick` |
| Một vài hoạt ảnh vẽ | ❌ một phần | `OG.Player.draw` truyền `t` (lấy từ `OG.time`) cho Sprites, nên chuyển động phụ theo thời gian thật vẫn nhanh |

Đây là **time scale**: nhân dt của *một phần* thế giới với một hệ số. Phần nào nhận dt nào là một quyết định thiết kế. Trận trùm
dùng đúng ý này: [src/game/boss-scene.js](../../../src/game/boss-scene.js) nhân dt của trùm với `OG.Difficulty.bossTimeScale()`
để chế độ Bé chơi đánh chậm hơn, còn người chơi vẫn di chuyển ở tốc độ thật.

Kỹ thuật "giữ hàm gốc rồi bọc lại" gọi là **monkey patching**. Nó rất tiện khi thử nghiệm trong console, nhưng **đừng** dùng trong
code thật: người đọc `scenes.js` sẽ không biết hàm đã bị thay.

---

## ⭐⭐⭐ Fixed timestep với accumulator

File `fixed-step.js` (chạy `node fixed-step.js`):

```js
'use strict';
var GRAVITY = 1500;      // px/giây², giống OG.Config.GRAVITY
var MAX_FALL = 900;      // px/giây, giống OG.Config.MAX_FALL
var JUMP_V = 590;        // px/giây, cú nhảy của Oggy

/**
 * Tạo hàm advance(dt) chạy step(fixedDt) đủ số lần cho dt thật.
 * @param {(h: number) => void} step  một bước mô phỏng, h = fixedDt (giây)
 * @param {number} fixedDt            độ dài bước cố định, giây
 * @param {number} maxSteps           số bước tối đa mỗi frame (chống spiral of death)
 * @returns {(dt: number) => number}  trả alpha = phần dư / fixedDt (0..1), dùng để nội suy khi vẽ
 */
function makeFixedStepper(step, fixedDt, maxSteps) {
  var acc = 0;
  return function advance(dt) {
    acc += dt;
    var n = 0;
    while (acc >= fixedDt && n < maxSteps) {
      step(fixedDt);
      acc -= fixedDt;
      n++;
    }
    // Máy quá chậm: bỏ phần nợ thay vì cố "đuổi kịp" (đuổi kịp → frame sau còn nhiều bước hơn → càng chậm).
    if (n === maxSteps) acc = 0;
    return acc / fixedDt;
  };
}

/** Một cú nhảy, trả về độ cao đỉnh (px). useFixed = true → đi qua accumulator. */
function jumpPeak(frameDt, useFixed) {
  var y = 0, vy = -JUMP_V, top = 0;
  function step(h) {
    vy = Math.min(MAX_FALL, vy + GRAVITY * h); // semi-implicit Euler: v trước ...
    y += vy * h;                               // ... rồi x dùng v MỚI (giống OG.Physics.moveBody)
    if (y < top) top = y;
  }
  var advance = makeFixedStepper(step, 1 / 120, 8);
  for (var t = 0; t < 1; t += frameDt) {
    if (useFixed) advance(frameDt); else step(frameDt);
  }
  return -top;
}

[30, 60, 144].forEach(function (fps) {
  console.log(fps + ' FPS · dt biến đổi: ' + jumpPeak(1 / fps, false).toFixed(1) + ' px'
    + ' · fixed 1/120: ' + jumpPeak(1 / fps, true).toFixed(1) + ' px');
});
console.log('Công thức liên tục v²/2g: ' + (JUMP_V * JUMP_V / (2 * GRAVITY)).toFixed(1) + ' px');
```

**Kết quả:**

```
30 FPS · dt biến đổi: 106.3 px · fixed 1/120: 113.6 px
60 FPS · dt biến đổi: 111.2 px · fixed 1/120: 113.6 px
144 FPS · dt biến đổi: 114.0 px · fixed 1/120: 113.6 px
Công thức liên tục v²/2g: 116.0 px
```

**Giải thích.**

- Semi-implicit Euler cộng gia tốc **trước** rồi mới dời vị trí. Ngay bước đầu, vận tốc đi lên đã bị trọng lực "ăn" mất `g·dt`.
  Bước càng to thì phần bị mất càng lớn, nên đỉnh càng thấp. Sai số tỉ lệ với dt: đỉnh ≈ v²/2g − v·dt/2.
- Qua accumulator, mô phỏng **luôn** đi những bước 1/120 giây, bất kể frame dài bao nhiêu, nên đỉnh nhảy giống hệt nhau ở mọi FPS.
  Vẫn lệch 116 một chút vì vẫn là Euler, nhưng giờ là lệch **tất định**.
- `maxSteps` chặn **spiral of death** (vòng xoáy chết): máy chậm → frame dài → phải chạy nhiều bước hơn → frame còn dài hơn...
- Giá trị trả về `alpha` dùng để **nội suy khi vẽ**: vẽ ở `lerp(vị trí bước trước, vị trí bước sau, alpha)`, để hình không giật khi
  tần số bước và tần số màn hình không khớp nhau.

**Ghép vào `src/core/loop.js` thì sao?** Chỗ hợp lý là trong `tick`, thay dòng `OG.Scenes.update(dt)` bằng `advance(dt)` với
`step = function (h) { OG.Scenes.update(h); }`. Những thứ **phải giữ dt thật hoặc chạy đúng 1 lần mỗi frame**:

- Vẽ (`OG.Scenes.draw`): chỉ một lần mỗi frame. Vẽ 2 lần trong một frame là phí công.
- `OG.Input.endFrame()`: nếu một frame có 2 bước, `pressed('jump')` đúng ở **cả hai** bước, nên một cú bấm bị xử lý 2 lần (chưa
  kể khi frame có **0** bước thì cú bấm bị nuốt mất). Cách xử lý thường gặp: chỉ xoá cờ "vừa bấm" sau bước **đầu tiên** có chạy,
  hoặc chuyển input sang hàng đợi sự kiện có đánh số bước.
- `OG.time`, rung camera: có thể giữ dt thật vì chỉ là hiệu ứng hình ảnh.

Dự án này **không** dùng fixed timestep cho gameplay (chênh 8 px không đáng so với độ phức tạp thêm vào). Smoke test thì đạt
được tính tất định bằng cách khác: luôn gọi `OG.Loop.step(1 / 60)`.
