# Lời giải — Bài 03: Input

> ✋ **Hãy tự làm trước.** Lời giải chỉ có ích khi bạn đã thử và bị kẹt ít nhất 15 phút. Đọc lời giải quá sớm sẽ lấy mất phần
> "à, ra thế!", mà đó lại là lúc bạn học được nhiều nhất.
>
> Quay lại bài học: [03-input.md](../03-input.md)

---

## ⭐ Thêm phím K để nhảy và L để tương tác

Trong [src/core/input.js](../../../src/core/input.js), hằng `KEYMAP`, thêm hai mục (giữ nguyên các dòng cũ):

```js
    ArrowUp: ['jump', 'up'], KeyW: ['jump', 'up'], Space: ['jump'], KeyK: ['jump'],
    ArrowDown: ['down'], KeyS: ['down'],
    KeyE: ['action'], KeyJ: ['action'], KeyL: ['action'],
```

**Giải thích.**

- Không phải sửa `player.js`, `bindKeyboard` hay bất kỳ hàm nào: keymap là **dữ liệu**. `bindKeyboard` tra `KEYMAP[e.code]` rồi gọi
  `setKey` cho từng phím logic, kể cả phím mới.
- K **không** map sang `'up'` như W, vì trên bản đồ người chơi không mong K là "đi lên".
- `PREVENT` (chặn hành vi mặc định của trình duyệt) chỉ thật sự cần cho Space và mũi tên, vì chúng cuộn trang. Phím chữ thì
  không cuộn, nên thêm K/L vào `PREVENT` là tuỳ bạn. Dù thêm hay không, ô nhập tên trên bảng xếp hạng vẫn gõ được K/L: `typing(e)`
  cho listener thoát sớm trước khi xét `PREVENT`.

Chạy `node --check src/core/input.js` rồi `node tests/smoke.js`: XANH.

---

## ⭐⭐ Bảng debug input trên màn chơi

File `src/dev/input-debug.js` (nạp trước `main.js`), hoặc dán phần trong IIFE vào console:

```js
(function () {
  'use strict';
  var OG = window.OG;

  var X = 16, Y = 500, LINE = 20;   // góc trái dưới, px màn hình; khoảng cách dòng, px
  /** @type {Object<string, number>} phím logic → số lần pressed từ lúc vào màn */
  var counts = {};

  OG.Level.addHook({
    id: 'inputDebug',
    enter: function () { counts = {}; },           // mỗi màn đếm lại từ đầu
    update: function () {
      for (var k in OG.Input.keys) {
        if (OG.Input.pressed(k)) counts[k] = (counts[k] || 0) + 1;
      }
    },
    drawScreen: function (ctx) {
      var held = [], hits = [];
      for (var k in OG.Input.keys) if (OG.Input.keys[k]) held.push(k);
      for (var c in counts) hits.push(c + '×' + counts[c]);
      ctx.save();
      ctx.font = OG.font(14, 'bold');
      ctx.textAlign = 'left';
      ctx.fillStyle = OG.Palette.ink;
      ctx.fillText('GIỮ: ' + (held.join(' ') || '—'), X, Y);
      ctx.fillText('NHẤN: ' + (hits.join(' ') || '—'), X, Y + LINE);
      ctx.restore();
    }
  });
})();
```

Gỡ hook bằng `OG.Level.removeHook('inputDebug')`.

**Quan sát.** Giữ Space 2 giây: dòng `GIỮ` có `jump` suốt 2 giây, còn `NHẤN` chỉ tăng **1**. Lý do: `bindKeyboard` bỏ qua `keydown`
lặp (`e.repeat`) của phím nhảy, và `setKey` chỉ đặt `down[k]` khi phím chuyển từ nhả sang giữ. Nhấn ↑ thì cả `jump` lẫn `up` cùng
tăng, vì một mã phím ứng với hai phím logic.

**Vì sao `pressed` vẫn đúng trong `drawScreen`?** Thứ tự trong `tick` (file `src/core/loop.js`) là `Scenes.update` → `Scenes.draw` →
`Input.endFrame()`. Lúc vẽ, cờ "vừa nhấn" của frame hiện tại **chưa** bị xoá. Nếu ai đó dời `endFrame()` lên trước `draw` thì vẽ
không thấy cú bấm. Còn nếu dời lên trước `update` thì cả gameplay cũng không thấy (xem `⚠️ Bẫy` trong `tick`).

**Vì sao có thể đếm hụt?** Trong scene `level`, `OG.Player.update` chạy **trước** các hook. Khi Oggy nhảy nhờ coyote time, Player
gọi `OG.Input.consume('jump')`, nên lúc hook chạy, `pressed('jump')` đã là `false`. Đây chính là tác dụng mong muốn của
`consume`: chỗ khác trong cùng frame (ở đây là vật phẩm Giày lò xo trong `OG.Shop.tickPlayer`) không xử lý lại cú bấm đó thành
nhảy đôi.

---

## ⭐⭐⭐ Phím logic `'run'`

**1. `src/core/input.js`.** Thêm vào `KEYMAP`:

```js
    ShiftLeft: ['run'], ShiftRight: ['run'],
```

và vào object `keys` khởi tạo (cuối danh sách):

```js
  var keys = { left: false, right: false, up: false, down: false, jump: false, action: false, pause: false, confirm: false, back: false, num1: false, num2: false, num3: false, run: false };
```

Vì sao phải thêm vào `keys` dù `setKey` tự tạo `keys[k]`? Vì `reset()` duyệt `for (var k in keys)`, mà phím chưa từng được bấm thì
chưa có trong object. Ngoài ra, khai báo sẵn giúp người đọc thấy **đủ** danh sách phím logic ở một chỗ. Nhớ cập nhật luôn dòng
"Tên phím logic" trong khối `Hợp đồng` đầu file.

**2. `src/game/player.js`.** Thêm hằng cạnh các hằng khác ở đầu module:

```js
  var RUN_MUL = 1.6;              // hệ số tốc độ ngang khi giữ phím logic 'run' (không đơn vị)
```

Sửa dòng đặt vận tốc ngang trong `OG.Player.update`:

```js
      p.vx = move * p.speed * (keys.run ? RUN_MUL : 1);
```

Dùng **held** (`keys.run`) chứ không phải `pressed`: chạy nhanh là trạng thái kéo dài.

**3. `index.html`.** Thêm một nút vào nhóm bên phải của `#mobileControls`:

```html
    <div class="pad"><button class="touch" data-key="run" aria-label="Chạy nhanh">🏃</button><button class="touch" data-key="action" aria-label="Tương tác">✦</button><button class="touch" data-key="jump" aria-label="Nhảy">⬆</button></div>
```

Không cần JavaScript mới: lúc init, `OG.Input.bindTouch(document)` tìm **mọi** `[data-key]`, phóng to theo `TOUCH_SIZE` và gắn
`pointerdown/up/leave/cancel` → `setKey('run', 'touch...', ...)`. Mỗi nút là một **nguồn** riêng, nên giữ 🏃 bằng một ngón và ▶ bằng
ngón khác hoạt động độc lập.

**4. Vì sao smoke test vẫn XANH?** Test chỉ gửi những phím nó dùng (mũi tên, Space, Enter, Esc...) và không bao giờ gửi Shift.
`keys.run` luôn `false`, hệ số là 1, nên hành vi trùng 100% với trước. Đây là một bài học thiết kế: **tính năng mới mặc định tắt
thì không phá hành vi cũ**. Ngược lại, test cũng **không chứng minh** tính năng mới chạy đúng. Muốn vậy phải viết thêm một check:
`OG.Input.setKey('run', true)` rồi đo `p.vx` (xem công thức 4 bước ở đầu `tests/smoke.js`, bài 13).

**Mở rộng để suy nghĩ.** Chạy nhanh làm cú nhảy xa hơn, nên một số khoảng trống trong màn được thiết kế cho tốc độ 255 px/giây sẽ
trở nên quá dễ. Thay đổi input là thay đổi **thiết kế màn**.
