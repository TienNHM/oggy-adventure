# Lời giải — Bài 06: Event bus và observer

> ✋ **Hãy tự làm trước.** Lời giải chỉ có ích khi bạn đã thử và bị kẹt ít nhất 15 phút. Đọc lời giải quá sớm sẽ lấy mất phần
> "à, ra thế!", mà đó lại là lúc bạn học được nhiều nhất.
>
> Quay lại bài học: [06-event-bus-observer.md](../06-event-bus-observer.md)

Mọi đoạn dưới đây dán thẳng vào Console khi đang ở trong một màn chơi. Đã chạy thử với codebase hiện tại.

---

## ⭐ Đếm cú nhảy, chúc mừng cú giẫm đầu tiên

```js
var jumps = 0;
var offJump = OG.Events.on(OG.EV.PLAYER_JUMP, function (e) {
  jumps++;
  if (jumps % 10 === 0) OG.DOM.toast('Bạn đã nhảy ' + jumps + ' lần! (' + e.charId + ')');
});
OG.Events.once(OG.EV.ENEMY_STOMP, function (e) {
  OG.DOM.toast('Cú giẫm đầu tiên: ' + e.type + ' +' + e.score);
});
// Thôi nghe:  offJump();
```

**Giải thích.**

- Ta không sửa `player.js` hay `level.js`. Cả hai tính năng "cắm" vào từ bên ngoài, đúng tinh thần open/closed.
- `once` chính là `on` + tự `off()` ở lần gọi đầu (xem code `once` trong `src/core/events.js`). Viết tay sẽ như sau:
  `var off = OG.Events.on(name, function (p) { off(); ... })`. Hàm huỷ được gọi **trước** khi xử lý, nên dù phần xử lý có ném lỗi
  thì listener vẫn đã được gỡ.
- `offJump()` gỡ đúng hàm đã đăng ký, vì hàm huỷ "nhớ" tham chiếu `fn` trong closure. Gọi
  `OG.Events.off(OG.EV.PLAYER_JUMP, function (e) {...})` với một hàm ẩn danh **viết lại** sẽ không gỡ được gì, vì đó là một object
  hàm khác.

**Lưu ý.** Nhảy đôi bằng Giày lò xo cũng phát `'player:jump'` (payload có `double: true`, xem ARCHITECTURE mục 6), nên cũng được
đếm. Muốn chỉ đếm cú nhảy từ mặt đất thì thêm `if (e.double) return;`.

---

## ⭐⭐ Combo giẫm liên hoàn

```js
(function () {
  var COMBO_WINDOW = 1.5;   // giây: giẫm con kế tiếp trong khoảng này thì combo tăng
  var COMBO_BONUS = 25;     // điểm thưởng × số combo
  var combo = 0;
  var lastT = -Infinity;    // OG.time lúc giẫm gần nhất, giây

  function reset() { combo = 0; lastT = -Infinity; }

  // Người PHÁT: chỉ biết "vừa có combo", không biết ai sẽ dùng thông tin này.
  OG.Events.on(OG.EV.ENEMY_STOMP, function (e) {
    combo = OG.time - lastT <= COMBO_WINDOW ? combo + 1 : 1;
    lastT = OG.time;
    if (combo >= 2) OG.Events.emit('combo:up', { count: combo, x: e.x, y: e.y });
  });
  OG.Events.on(OG.EV.PLAYER_HURT, reset);
  OG.Events.on(OG.EV.LEVEL_START, reset);

  // Hai người NGHE độc lập: thêm/bớt một cái không ảnh hưởng cái kia.
  OG.Events.on('combo:up', function (c) {
    OG.Particles.floatText(c.x + 17, c.y - 30, 'COMBO x' + c.count, '#ffc94a');
  });
  OG.Events.on('combo:up', function (c) {
    OG.Game.addScore(COMBO_BONUS * c.count);
  });
})();
```

**Giải thích.**

- **Ba tầng tách nhau.** Gameplay phát `'enemy:stomp'` → bộ đếm combo phát `'combo:up'` → hiệu ứng và điểm thưởng nghe
  `'combo:up'`. Muốn thêm âm thanh cho combo thì chỉ cần thêm listener thứ ba, ví dụ
  `OG.Events.on('combo:up', function () { OG.Audio.sfx('coin'); })`. Hai phần kia không đổi.
- **Tên event mới** theo quy ước `'<chủ thể>:<việc>'` (ARCHITECTURE mục 6: "event mới do module tự phát và tự nghe không cần sửa
  core"). Nếu đưa vào dự án thật, nên thêm hằng `COMBO_UP: 'combo:up'` vào `OG.EV` và ghi payload vào `INTEGRATION.md` của module.
- **Event lồng nhau.** `addScore` phát `'score:change'` **bên trong** listener của `'combo:up'`, mà `'combo:up'` lại được phát bên trong
  listener của `'enemy:stomp'`. Mọi thứ chạy xong, đồng bộ, trước khi `updateEnemies` sang con gián kế tiếp.
- **Điểm thưởng thực nhận** có thể khác `25 × count` một chút: `OG.Game.addScore` nhân thêm `run.mods.scoreMul` (hệ số điểm của nhân
  vật/vật phẩm) rồi làm tròn.
- `-Infinity` cho `lastT` làm phép trừ `OG.time - lastT` luôn ra `Infinity`, lớn hơn mọi cửa sổ, nên lần đầu luôn là combo 1 mà
  không cần cờ riêng.

**Trả lời câu hỏi.** Chữ bay **vẫn hiện**. `emit` gọi từng listener qua `OG.util.safe` (bắt lỗi, ghi log, đi tiếp), nên một
listener hỏng không chặn listener khác. Thứ tự gọi là thứ tự **đăng ký**: chữ bay đăng ký trước nên chạy trước. Nhưng kể cả đảo thứ
tự thì nó cũng vẫn chạy.

**Bẫy nhỏ.** `OG.time` vẫn tăng khi tạm dừng. Giẫm một con, bấm P 2 giây, chơi tiếp rồi giẫm con nữa thì combo bị mất. Muốn "thời
gian chơi thật" thì dùng `OG.Level.state.t` (chỉ tăng khi scene `level` được update, xem bài 05).

---

## ⭐⭐⭐ Bảng log event, không rò rỉ

```js
(function () {
  var MAX_LINES = 6;
  var LINE_LIFE = 4;                       // giây một dòng còn hiện
  var IGNORE = { 'score:change': true, 'quest:progress': true };
  var lines = [];                          // {name, t}
  var off = null;                          // hàm huỷ đăng ký của listener đang sống (null = không nghe)

  function stopListening() { if (off) { off(); off = null; } }

  OG.Level.addHook({
    id: 'event-log',
    order: 99,                             // vẽ sau các hook khác
    enter: function () {
      // ⚠️ Hook KHÔNG có exit(): enter() chạy lại mỗi lần vào màn (kể cả "Chơi lại màn").
      //   Quên dòng dưới → mỗi lần vào màn thêm 1 listener, mỗi event bị ghi 2, 3, 4 lần.
      stopListening();
      lines = [];
      off = OG.Events.on('*', function (name) {
        if (IGNORE[name]) return;
        lines.push({ name: name, t: OG.time });
        if (lines.length > MAX_LINES) lines.shift();
      });
    },
    drawScreen: function (ctx, st, t) {
      ctx.save();
      ctx.font = OG.font(14, 'bold');
      ctx.textAlign = 'left';
      for (var i = 0; i < lines.length; i++) {
        var age = t - lines[i].t;
        if (age > LINE_LIFE) continue;
        ctx.globalAlpha = Math.max(0, 1 - age / LINE_LIFE);
        var y = 120 + i * 20;
        ctx.fillStyle = 'rgba(16,25,43,0.7)';
        ctx.fillRect(12, y - 14, 200, 18);
        ctx.fillStyle = '#fff6df';
        ctx.fillText(lines[i].name, 18, y);
      }
      ctx.restore();
    }
  });

  // Rời hẳn màn chơi (go sang scene khác) → thôi nghe. push/pop (pause, truyện chen giữa) thì vẫn giữ.
  OG.Events.on(OG.EV.SCENE_CHANGE, function (e) {
    if (!e.push && !e.pop && e.to !== 'level') stopListening();
  });

  window.eventLogLines = function () { return lines.slice(); };
})();
OG.Game.restartLevel();   // vào lại màn để enter() của hook chạy
```

Gỡ hẳn: `OG.Level.removeHook('event-log')`. (Listener `'scene:change'` vẫn còn, nhưng vô hại: nó chỉ gọi `stopListening`.)

**Kiểm chứng.**

```js
OG.Game.restartLevel(); OG.Game.restartLevel(); OG.Game.restartLevel();
OG.Events.emit('door:enter', { levelId: 'x' });
eventLogLines().filter(function (l) { return l.name === 'door:enter'; }).length;   // → 1
```

Xoá dòng `stopListening();` trong `enter`, tải lại trang, dán lại rồi lặp thí nghiệm. Kết quả là **4**:

- `restartLevel()` ở dòng cuối đoạn code chạy `enter` lần 1 → listener thứ nhất. Ba lần chơi lại sau đó thêm ba listener nữa.
- Listener `'scene:change'` **không** cứu được: chơi lại màn là `go('level')` từ `level` sang `level`, mà ta chỉ dọn khi
  `e.to !== 'level'`.
- `lines = []` ở mỗi `enter` chỉ xoá **dữ liệu** cũ. Cả 4 listener vẫn sống và cùng `push` vào biến `lines` (closure đọc biến, không
  giữ mảng cũ), nên một event bị ghi 4 lần.

Mỗi lần chơi lại, con số tăng thêm 1. Đây là dấu hiệu điển hình của **rò rỉ listener**: hành vi sai tăng dần theo thời gian chơi, nên
lúc test nhanh thường không thấy.

**Giải thích các quyết định.**

- **`off` sống trong closure**, không gắn lên `st`. `st` bị bỏ đi khi chơi lại màn, mà ta cần chính hàm huỷ của lần **trước** để gỡ.
- **Hai điểm dọn dẹp.** `enter` dọn khi vào màn lần nữa. Listener `'scene:change'` dọn khi rời hẳn màn. Lọc `!e.push && !e.pop` để
  tạm dừng (push `pause`) hay truyện chen giữa màn không làm mất log. Đây đúng là cách `OG.Learn.init` dọn thông báo.
- **Không dùng `OG.Events.clear('*')`.** Hàm đó xoá **mọi** listener wildcard, kể cả của người khác (smoke test dùng `'*'` để đếm
  event). Chỉ được gỡ thứ **mình** đã đăng ký.
- **Giới hạn bộ nhớ.** `lines.shift()` giữ mảng tối đa 6 phần tử. Một bộ log không giới hạn cũng là một kiểu rò rỉ: chơi lâu, mảng
  phình mãi.

**Mở rộng.** Đếm số event mỗi giây theo từng tên (dùng một `Object<string, number>` và đặt lại mỗi giây) và vẽ thành thanh ngang.
Bạn sẽ thấy event nào "ồn" nhất. Đó là dữ liệu để quyết định có cần **event queue** hay gộp event không.
