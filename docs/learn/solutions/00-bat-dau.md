# Lời giải — Bài 00: Bắt đầu

> ✋ **Hãy tự làm trước.** Lời giải chỉ có ích khi bạn đã thử và bị kẹt ít nhất 15 phút. Đọc lời giải quá sớm sẽ lấy mất phần
> "à, ra thế!", mà đó lại là lúc bạn học được nhiều nhất.
>
> Quay lại bài học: [00-bat-dau.md](../00-bat-dau.md)

---

## ⭐ Bản đồ namespace

```js
var withInit = Object.keys(OG).filter(function (k) {
  return OG[k] && typeof OG[k].init === 'function';
});
console.log(withInit);

var notInList = withInit.filter(function (k) { return OG.FEATURE_INIT_ORDER.indexOf(k) < 0; });
console.log(notInList);
```

Kết quả `notInList` gồm các module **core**: `DOM`, `Input`, `Progress`, cùng với `Journeys`.

**Giải thích.** Đọc hàm `boot` trong [src/core/main.js](../../../src/core/main.js):

- `OG.DOM.init()`, `OG.Input.init(canvas)`, `OG.Progress.init()` được gọi **trực tiếp, đúng thứ tự cố định**. Đây là phần core:
  thiếu chúng thì game không chạy, nên không cần "gọi mềm".
- `OG.Journeys.init()` được gọi riêng bằng `OG.util.call('Journeys', 'init')` **sau** mọi module tính năng. Lý do (comment trong
  `boot`): nó kiểm tra dữ liệu hành trình, mà dữ liệu đó tham chiếu tới trùm/nhân vật do module khác đăng ký.
- Còn `OG.Save` thì không có `init` mà có `load()`, cũng được `boot` gọi trực tiếp.

Ý chính rút ra: **core init cứng, tính năng init mềm**. Bài 01 giải thích "mềm" nghĩa là gì.

---

## ⭐⭐ Cố ý làm sai thứ tự nạp

Sau khi đổi chỗ, phần đầu `index.html` thành:

```html
<script src="src/core/events.js"></script>
<script src="src/core/namespace.js"></script>
```

**Điều quan sát được:**

- Console trình duyệt báo lỗi đầu tiên ở `events.js`, kiểu
  `Uncaught TypeError: Cannot set properties of undefined (setting 'EV')`. Câu chữ có thể khác một chút tuỳ trình duyệt.
- Sau đó là **hàng loạt lỗi dây chuyền** ở các file sau: `OG.Events` không tồn tại nên mọi file gọi `OG.Events.on(...)` lúc nạp
  đều lỗi theo.
- Smoke test in dòng `✗ Lỗi khi load src/core/events.js: TypeError: ...` và kết thúc ĐỎ.

**Giải thích.** `events.js` mở đầu bằng `var OG = window.OG;`. Lúc này `namespace.js` chưa chạy nên `window.OG` là `undefined`.
Lệnh gán đầu tiên vào `OG.EV` ném `TypeError` và **cả IIFE dừng lại**: `OG.Events` không bao giờ được tạo. Không có `import`,
trình duyệt không biết `events.js` cần `namespace.js`. Ta phải tự xếp thứ tự.

> Bài học rút ra: lỗi đầu tiên mới là lỗi thật, các lỗi sau thường chỉ là hệ quả. Luôn đọc console **từ trên xuống**.

Nhớ trả `index.html` về như cũ và chạy `node tests/smoke.js` cho XANH.

---

## ⭐⭐⭐ Thêm file `src/dev/scene-logger.js`

```js
/* ============================================================================
 * scene-logger.js — IN RA CONSOLE MỖI LẦN ĐỔI SCENE (công cụ học tập)
 * ----------------------------------------------------------------------------
 * Vai trò:      Nghe 'scene:change' và in "[scene] từ → tới". Không sửa trạng thái game.
 * Khái niệm:    module chỉ NGHE event (observer) · đăng ký lúc nạp file
 * Bài học:      docs/learn/00-bat-dau.md
 * Phụ thuộc:    OG.Events.on (đọc LÚC NẠP → file phải đứng sau src/core/events.js)
 * Event:        phát: (không) · nghe: 'scene:change'
 * ========================================================================== */
(function () {
  'use strict';
  var OG = window.OG;

  OG.Events.on('scene:change', function (e) {
    // push/pop: scene đè lên (pause, câu đố...) hay gỡ xuống — in thêm để thấy scene stack hoạt động.
    var kind = e.push ? ' (push)' : e.pop ? ' (pop)' : '';
    console.log('[scene] ' + (e.from || '(chưa có)') + ' → ' + e.to + kind);
  });
})();
```

Thêm thẻ script vào `index.html`, ví dụ ngay **trước** nhóm 12 (`main.js`):

```html
<script src="src/dev/scene-logger.js"></script>
```

**Vì sao đặt ở đây?**

- File gọi `OG.Events.on` **ngay lúc nạp**, nên điều kiện tối thiểu là đứng sau `src/core/events.js`.
- Nhưng đặt cạnh các file tính năng, trước `main.js`, thì người đọc `index.html` hiểu ngay đây là một "module phụ". Hơn nữa nó
  nghe được cả lần `Scenes.go('boot')` đầu tiên trong `boot()`.
- Nếu đặt **sau** `main.js`: trên trình duyệt `boot` vẫn chờ `DOMContentLoaded` nên thường vẫn kịp. Nhưng `index.html` đã ghi rõ
  quy ước "main.js LUÔN CUỐI", và khi `boot()` chạy ngay (trang đã nạp xong) thì file của bạn sẽ bỏ lỡ event đầu tiên. Đừng
  dựa vào may mắn.

**Kiểm tra:** mở game → console in `[scene] (chưa có) → boot`, `[scene] boot → menu`... Bấm Esc trong màn chơi để thấy `(push)`
và `(pop)`. Chạy `node tests/smoke.js`: vẫn XANH, nhưng output có thêm rất nhiều dòng `[scene]` vì test đi qua hàng trăm scene.
Đây là lý do code thật nên có cờ bật/tắt. Thử bọc `console.log` trong `if (OG.Config.DEBUG)` xem sao.

> Xong bài tập thì xoá thẻ script đó (hoặc giữ lại có cờ DEBUG). `src/` đã được đóng gói khi deploy
> (`.github/workflows/pages.yml`) nên không cần sửa workflow.
