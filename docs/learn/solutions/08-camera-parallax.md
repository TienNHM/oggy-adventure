# Lời giải — Bài 08: Camera và parallax

> ✋ **Hãy tự làm trước.** Lời giải chỉ có ích khi bạn đã thử và bị kẹt ít nhất 15 phút. Đọc lời giải quá sớm sẽ lấy mất phần
> "à, ra thế!", mà đó lại là lúc bạn học được nhiều nhất.
>
> Quay lại bài học: [08-camera-parallax.md](../08-camera-parallax.md)

Mọi đoạn dưới đây dán vào Console khi đang ở trong một màn chơi. Đã chạy thử với codebase hiện tại.

---

## ⭐ Chạm vào đâu, sao bắn ra đó

```js
var offTap = OG.Events.on(OG.EV.INPUT_TAP, function (e) {
  if (OG.Scenes.current() !== 'level') return;
  var w = OG.Camera.toWorld(e.x, e.y);           // e.x, e.y: toạ độ logic MÀN HÌNH (0..960, 0..540)
  OG.Particles.spawn(w.x, w.y, { color: '#ffc94a', count: 14, shape: 'star' }); // Particles dùng toạ độ THẾ GIỚI
  console.log('màn hình', Math.round(e.x), Math.round(e.y),
    '→ thế giới', Math.round(w.x), Math.round(w.y), '(Camera.x =', Math.round(OG.Camera.x) + ')');
});
// Thôi nghe:  offTap();
```

**Giải thích.**

- `'input:tap'` được `src/core/input.js` phát khi `pointerdown` trên canvas, với toạ độ đã quy đổi từ pixel CSS sang toạ độ logic
  960 × 540. Đó là toạ độ **màn hình**: điểm giữa canvas luôn là `(480, 270)`, dù đang ở đâu trong màn.
- Hạt được vẽ trong `drawWorld`, **sau** `OG.Camera.apply(ctx)`, nên vị trí hạt là toạ độ **thế giới**. Truyền thẳng `e.x` vào
  `spawn` thì ở đầu màn trông vẫn đúng (vì `Camera.x = 0`), nhưng càng đi xa, sao càng bắn lệch sang trái đúng bằng `Camera.x`. Đây
  là lỗi kinh điển nhất khi làm camera: **lẫn hai hệ toạ độ**, và chỉ lộ ra khi camera đã dịch.
- Nhấp cùng một chỗ trên màn hình: `(e.x, e.y)` giữ nguyên, còn `w.x` tăng theo `Camera.x`. `w.y = e.y`, vì game chỉ cuộn ngang
  (`Camera.y = 0`).
- `toWorld` **không** tính độ lệch rung (`ox, oy`). Nhấp trong lúc màn hình rung thì sao lệch tối đa vài px so với chỗ nhìn thấy.
  Với hiệu ứng thì chấp nhận được; với UI cần chính xác (vd chọn ô trên bản đồ) thì nên trừ thêm `Camera.ox`.

---

## ⭐⭐ Camera mượt có vùng chết

```js
(function () {
  var C = OG.Camera;
  var original = C.follow;          // giữ bản gốc để khôi phục
  var ANCHOR = 0.38;                // nhân vật ở 38% bề ngang, như bản gốc
  var RATE = 5;                     // 1/giây: camera đuổi kịp ~5 lần khoảng cách mỗi giây
  var DEAD_ZONE = 60;               // px: nhân vật lệch khỏi điểm neo trong ±60 px thì camera đứng yên
  var MAX_DT = 0.05;                // giây: kẹp dt (vừa pause xong, OG.time nhảy xa)
  var lastT = null;

  C.follow = function (target, worldW) {
    var maxX = Math.max(0, worldW - OG.W);
    var wanted = target.x - OG.W * ANCHOR;          // Camera.x "lý tưởng" như bản gốc
    var dt = lastT == null ? MAX_DT : Math.min(MAX_DT, Math.max(0, OG.time - lastT));
    lastT = OG.time;
    // Lệch quá một màn hình (vừa vào màn, vừa hồi sinh ở checkpoint xa) → nhảy thẳng, khỏi trượt dài.
    if (Math.abs(wanted - C.x) > OG.W) { C.x = OG.util.clamp(wanted, 0, maxX); return; }
    // Vùng chết: chỉ đuổi phần vượt ra ngoài ±DEAD_ZONE.
    var goal = C.x;
    if (wanted > C.x + DEAD_ZONE) goal = wanted - DEAD_ZONE;
    else if (wanted < C.x - DEAD_ZONE) goal = wanted + DEAD_ZONE;
    // Lerp độc lập FPS: mỗi frame đi một phần (dt × RATE) của quãng còn lại, kẹp ≤ 1 để không vượt đích.
    C.x += (goal - C.x) * Math.min(1, dt * RATE);
    C.x = OG.util.clamp(C.x, 0, maxX);
  };

  window.restoreCamera = function () { C.follow = original; };
})();
```

**Giải thích.**

- **Ghi đè một hàm công khai** (`OG.Camera.follow`) là đủ: scene `level` và `boss` gọi `OG.Camera.follow(...)` qua object, không giữ
  bản sao hàm cũ, nên bản mới có hiệu lực ngay. Đây cũng là lý do hợp đồng cấm đổi **tên** hàm công khai: người khác phụ thuộc vào
  cái tên đó.
- **Tự tính `dt`.** `follow` không nhận `dt`, nhưng được gọi đúng một lần mỗi frame. Hiệu `OG.time` giữa hai lần gọi chính là `dt`.
  Phải **kẹp**, vì `OG.time` chạy cả khi tạm dừng: dừng 10 giây rồi chơi tiếp, `dt` thô là 10, `min(1, 10 × 5) = 1`, camera nhảy
  thẳng tới đích. Kẹp 0,05 giữ cho bước đó vẫn mượt.
- **Vùng chết.** Khi đứng yên, camera dừng cách điểm neo đúng 60 px (`goal = wanted − 60`), vì ta chỉ đuổi phần **vượt** vùng chết.
  Nhân vật nhích trong khoảng ±60 px thì camera không động đậy. Đó là mục đích của vùng chết.
- **Nhảy thẳng khi lệch xa.** Vào màn mới, `Camera.reset()` đưa `x` về 0. Nếu điểm xuất phát ở xa (hồi sinh tại checkpoint),
  camera sẽ trượt dài vài giây qua cả màn. Ngưỡng "một màn hình" bắt được trường hợp này.
- **Đánh đổi.** Camera mượt **trễ** sau nhân vật: chạy nhanh sang phải thì nhân vật trôi về phía mép phải màn hình, người chơi thấy
  ít đường phía trước hơn. Đó là lý do màn chơi gốc chọn bám cứng, còn bản đồ (nơi không có nguy hiểm) mới dùng camera mượt. Nhiều
  game bù lại bằng **look-ahead**: dời điểm neo theo hướng chạy.

**Nâng cao: vì sao `min(1, dt × RATE)` chỉ là xấp xỉ?** Giả sử đích đứng yên. Ở 60 FPS, mỗi frame còn lại `(1 − 5/60)` khoảng cách,
sau 1 giây còn `(1 − 5/60)^60 ≈ 0,0054`. Ở 30 FPS: `(1 − 5/30)^30 ≈ 0,0042`. Gần bằng nhau nhưng **không** bằng. Công thức đúng
tuyệt đối là `k = 1 − Math.exp(−RATE × dt)`: sau 1 giây luôn còn `e^(−5) ≈ 0,0067` dù FPS là bao nhiêu. Với `RATE × dt` nhỏ thì
`1 − e^(−x) ≈ x`, nên bản xấp xỉ đủ tốt cho game này. Cùng ý tưởng có trong phần damping (giảm chấn) của `b.update`, bên trong
`K.createBase` ở `src/bosses/bosses.js` (`b.vx *= Math.pow(0.1, dt)`).

---

## ⭐⭐⭐ Lớp tiền cảnh parallax > 1, có culling

```js
(function () {
  var PARALLAX = 1.35;      // > 1: gần người xem hơn mặt sàn → trôi NHANH hơn thế giới
  var SPACING = 240;        // px (toạ độ của lớp): mỗi ô có thể có một khóm cỏ
  var JITTER = 120;         // px: lệch ngẫu nhiên-ổn-định trong ô
  var TUFT_HALF_W = 50;     // px: nửa bề ngang lớn nhất của một khóm (để tính lề culling)
  var EMPTY_RATE = 0.35;    // 35% ô bỏ trống cho đỡ rối
  var drawnLastFrame = 0;

  // Số giả ngẫu nhiên ỔN ĐỊNH: cùng i luôn ra cùng số 0..1 → khóm cỏ không "nhảy" giữa các frame.
  function hash(n) { var s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

  /** Một khóm cỏ: gốc (x, y) = chân, toạ độ MÀN HÌNH; lá đung đưa theo t. */
  function tuft(ctx, x, y, s, t, seed) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = '#2f7d3a';
    ctx.strokeStyle = '#17233d'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
    for (var k = -2; k <= 2; k++) {
      var sway = Math.sin(t * 2 + seed + k) * 6;   // ngọn lá lắc
      ctx.beginPath();
      ctx.moveTo(k * 12 - 8, 0);
      ctx.quadraticCurveTo(k * 14, -40, k * 18 + sway, -70 + Math.abs(k) * 12);
      ctx.quadraticCurveTo(k * 14 + 6, -40, k * 12 + 8, 0);
      ctx.closePath();
      ctx.stroke(); ctx.fill();
    }
    ctx.restore();
  }

  OG.Level.addHook({
    id: 'foreground',
    order: 97,
    // drawScreen: ĐÃ bỏ camera → tự tính vị trí từ Camera.x (giống drawBackground).
    drawScreen: function (ctx, st, t) {
      var off = OG.Camera.x * PARALLAX;                  // lớp dịch đi off px khi camera dịch Camera.x
      // Culling: chỉ duyệt những ô có thể lọt vào [−TUFT_HALF_W, 960 + TUFT_HALF_W].
      var first = Math.floor((off - JITTER - TUFT_HALF_W) / SPACING);
      var last = Math.ceil((off + OG.W + TUFT_HALF_W) / SPACING);
      drawnLastFrame = 0;
      for (var i = first; i <= last; i++) {
        if (hash(i) < EMPTY_RATE) continue;
        var sx = i * SPACING + hash(i + 9) * JITTER - off; // vị trí trên màn hình
        tuft(ctx, sx, OG.H + 8, 0.8 + hash(i + 3) * 0.5, t, i);
        drawnLastFrame++;
      }
    }
  });

  window.foregroundDrawn = function () { return drawnLastFrame; };
})();
```

Gỡ: `OG.Level.removeHook('foreground')`. Thử `foregroundDrawn()` ở đầu màn và cuối màn: luôn chỉ vài khóm (khoảng 3 tới 6).

**Giải thích.**

- **Parallax > 1.** Sàn trôi đúng `Camera.x` (hệ số 1). Lớp cỏ trôi `1,35 × Camera.x`, tức nhanh hơn sàn 35%. Mắt người hiểu đó là
  vật **gần** hơn sàn, đứng giữa người xem và nhân vật. Chỉ một con số mà tạo được chiều sâu "trước mặt".
- **Vì sao vẽ trong `drawScreen`?** `drawWorld`/`drawFront` đã áp camera (hệ số cố định là 1). Muốn hệ số khác 1 thì phải tự dịch
  từ toạ độ màn hình, giống `drawBackground`. Đặt ở `drawScreen` còn đảm bảo cỏ được vẽ **sau** người chơi, tức là đè lên trên.
- **Culling bằng số học.** Thay vì duyệt mọi khóm từ đầu màn và kiểm tra từng cái, ta tính thẳng `first` và `last`. Lề trái phải
  trừ thêm `JITTER`, vì khóm `i` có thể nằm lệch tới 120 px về bên phải ô của nó. Thiếu khoản này thì đôi khi một khóm vừa nhô vào
  mép trái bị bỏ sót và "bật" ra đột ngột. Màn dài 4000 px hay 40 000 px thì số khóm vẽ mỗi frame vẫn như nhau.
- **Ổn định nhờ hash.** Dùng `Math.random()` trong hàm vẽ thì mỗi frame ra vị trí khác, cỏ nhấp nháy loạn xạ. `hash(i)` là hàm thuần
  của `i`, nên mỗi khóm luôn ở đúng chỗ của nó mà không cần lưu mảng toạ độ nào (xem 💡 ở hàm `hash` trong `src/gfx/scenery.js`).

**Trả lời câu 5.** `wrap` (modulo) dùng khi lớp là **một hoạ tiết lặp lại y hệt** mỗi `span` px. Lúc đó chỉ cần biết độ lệch trong
một chu kỳ, và vẽ lại cùng một dải. Lớp cỏ này **không lặp**: khóm `i` khác khóm `i + 1` (vị trí, kích thước, ô trống đều theo
`hash(i)`). Ta cần **chỉ số tuyệt đối** `i` để tra hash, nên dùng `floor(off / SPACING)` thay vì `off % SPACING`. Nếu chỉ dùng
`wrap`, mọi ô sẽ có cùng `i` và cùng hình dạng. Ngược lại, nếu lớp lặp được (như `drawTiled` với dải đã cache), `wrap` giữ con số nhỏ
và gọn, khỏi phải nghĩ tới chỉ số ô.

**Mở rộng.**

- Làm mờ nhẹ tiền cảnh (`ctx.globalAlpha = 0.85`) hoặc tô màu tối hơn, để người chơi không nhầm cỏ là bục. Đây là quy ước thị giác
  của hầu hết game platformer: tiền cảnh tối, hậu cảnh nhạt.
- Thêm hệ số cho trục y (`Camera.y` hiện luôn là 0). Nếu sau này game cuộn dọc, lớp tiền cảnh cũng phải dịch theo `Camera.y × 1,35`.
