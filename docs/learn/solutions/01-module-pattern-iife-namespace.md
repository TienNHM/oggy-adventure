# Lời giải — Bài 01: Module pattern IIFE và namespace

> ✋ **Hãy tự làm trước.** Lời giải chỉ có ích khi bạn đã thử và bị kẹt ít nhất 15 phút. Đọc lời giải quá sớm sẽ lấy mất phần
> "à, ra thế!", mà đó lại là lúc bạn học được nhiều nhất.
>
> Quay lại bài học: [01-module-pattern-iife-namespace.md](../01-module-pattern-iife-namespace.md)

---

## ⭐ Đọc khối đầu file

Ví dụ với ba file:

| File | Đọc lúc NẠP | Đọc lúc CHẠY |
|---|---|---|
| `src/core/physics.js` | `window.OG` (dòng `var OG = window.OG;`, rồi gán `OG.Physics`) | `OG.Config.GRAVITY/MAX_FALL`, `OG.util.overlap` |
| `src/core/loop.js` | `window.OG` | `OG.Config.MAX_DT`, `OG.Camera`, `OG.Scenes`, `OG.Input` |
| `src/core/main.js` | `window.OG` (gán `OG.FEATURE_INIT_ORDER`) | gần như mọi thứ, bên trong `boot()` |

**Kết luận.** `physics.js` chỉ dùng `OG.Config` và `OG.util` **bên trong** `moveBody`/`isStomp`. Hai hàm này chỉ được gọi khi game
đã chạy, lúc đó mọi file đã nạp xong. Vì vậy vị trí tương đối giữa `physics.js` và `camera.js` không quan trọng. Nhưng chính
dòng `OG.Physics = {...}` chạy **lúc nạp** và cần `OG` đã tồn tại, nên `physics.js` bắt buộc đứng sau `namespace.js`.

> Quy tắc thực hành: **chỉ thứ đọc lúc nạp mới ràng buộc thứ tự `<script>`**. Muốn file ít phụ thuộc thứ tự, hãy dời việc
> đọc module khác vào trong hàm hoặc vào `init()`.

---

## ⭐⭐ Module `OG.Counter`

```js
(function () {
  'use strict';
  var OG = window.OG;
  var count = 0; // private: chỉ các hàm bên dưới thấy được (closure)

  OG.Counter = {
    /**
     * Cộng thêm vào bộ đếm.
     * @param {number} [n=1]
     * @returns {number} giá trị mới
     */
    inc: function (n) { count += (n == null ? 1 : n); return count; },
    /** @returns {number} */
    get: function () { return count; }
  };

  // Module chỉ NGHE event: Player không cần biết Counter tồn tại.
  OG.Events.on('player:jump', function () { OG.Counter.inc(); });
})();
```

**Kiểm tra trong console:**

```js
OG.Counter.get()      // 0
// ... vào màn, nhảy 3 lần ...
OG.Counter.get()      // 3
OG.Counter.count      // undefined: không có field này trên object công khai
count = 999           // tạo/gán biến `count` ở phạm vi console, KHÔNG phải biến trong IIFE
OG.Counter.get()      // vẫn 3
```

**Giải thích.** Biến `count` sống trong phạm vi của hàm IIFE. Hàm IIFE đã chạy xong từ lâu, nhưng `inc` và `get` vẫn giữ tham
chiếu tới phạm vi đó (closure), nên `count` không bị thu hồi và chỉ hai hàm này đổi được nó. Đây chính là "đóng gói"
(encapsulation) mà không cần `class` hay `#private`.

> Lưu ý: nhảy đôi (vật phẩm Giày lò xo trong cửa hàng) cũng phát `'player:jump'` (kèm `double: true`), nên được đếm như một lần
> nhảy. Muốn bỏ qua thì kiểm tra `function (e) { if (!e.double) OG.Counter.inc(); }`.

---

## ⭐⭐⭐ `OG.FpsMeter` và thử cô lập lỗi

**File `src/dev/fps-meter.js`:**

```js
// @ts-check
/* ============================================================================
 * OG.FpsMeter — HIỆN FPS Ở GÓC MÀN CHƠI (công cụ học tập)
 * ----------------------------------------------------------------------------
 * Vai trò:      Gắn một level hook vẽ "FPS nn" ở góc phải dưới. main.js gọi init() theo FEATURE_INIT_ORDER.
 * Khái niệm:    module tính năng có init() · level hook (plugin) · vẽ ở toạ độ màn hình
 * Bài học:      docs/learn/01-module-pattern-iife-namespace.md, docs/learn/02-game-loop-delta-time.md
 * Phụ thuộc:    LÚC CHẠY: OG.Level.addHook, OG.Loop.fps, OG.font
 * Event:        (không)
 * API công khai: OG.FpsMeter.init()
 * ========================================================================== */
(function () {
  'use strict';
  var OG = window.OG;

  var X = 950;          // mép phải chữ, px màn hình
  var Y = 530;          // đường chân chữ, px màn hình

  OG.FpsMeter = {
    /** Gắn hook vẽ FPS. Gọi một lần lúc boot (main.js). */
    init: function () {
      OG.Level.addHook({
        id: 'fpsMeter',
        order: 95, // vẽ sau các hook khác (order lớn chạy sau)
        /** @param {CanvasRenderingContext2D} ctx */
        drawScreen: function (ctx) {
          ctx.save();
          ctx.font = OG.font(14, 'bold');
          ctx.textAlign = 'right';
          ctx.fillStyle = OG.Palette.ink;
          ctx.fillText('FPS ' + Math.round(OG.Loop.fps), X, Y);
          ctx.restore();
        }
      });
    }
  };
})();
```

**`index.html`**, thêm ngay trước nhóm 12:

```html
<script src="src/dev/fps-meter.js"></script>
```

**`src/core/main.js`**, thêm vào cuối danh sách:

```js
  OG.FEATURE_INIT_ORDER = ['Difficulty', 'Audio', 'Sprites', 'Bosses', 'World', 'Quests', 'Menus', 'Shop', 'Social', 'Learn', 'Guide', 'Story', 'FpsMeter'];
```

**Thử lỗi.** Thêm `throw new Error('thử lỗi');` ở đầu `init`. Kết quả:

- Console: `[OG] Lỗi trong FpsMeter.init: Error: thử lỗi` (đúng **một** dòng).
- Game vẫn vào menu, chơi bình thường, chỉ không có chữ FPS.
- Mọi module đứng **trước** `FpsMeter` trong danh sách đã init xong. Kể cả nếu bạn đặt `'FpsMeter'` ở **đầu** danh sách, các
  module sau nó vẫn init đủ, vì mỗi lời gọi `OG.util.call` có `try/catch` riêng.
- `node tests/smoke.js` báo ĐỎ vì có `console.error`. Đây là hành vi đúng: cô lập lỗi giúp game **sống sót**, không phải để
  **giấu** lỗi.

**Câu hỏi mở rộng.** Không sửa `main.js` được không? Được: `OG.Level` đã có từ lúc nạp (`level.js` nạp trước), nên có thể gọi
`OG.Level.addHook(...)` ngay trong IIFE, không cần `init`. Đánh đổi: hook được gắn **lúc nạp**, trước khi `Save` được load. Với hook
chỉ vẽ FPS thì không sao. Nhưng nếu module cần đọc cài đặt người chơi (`OG.Save.data`) thì bắt buộc phải chờ `init()`
(xem [docs/ARCHITECTURE.md](../../ARCHITECTURE.md) mục 2, "Các giai đoạn chạy").

Xong thì xoá dòng `throw` và chạy smoke test cho XANH.
