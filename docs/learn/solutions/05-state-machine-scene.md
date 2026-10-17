# Lời giải — Bài 05: State machine và scene

> ✋ **Hãy tự làm trước.** Lời giải chỉ có ích khi bạn đã thử và bị kẹt ít nhất 15 phút. Đọc lời giải quá sớm sẽ lấy mất phần
> "à, ra thế!", mà đó lại là lúc bạn học được nhiều nhất.
>
> Quay lại bài học: [05-state-machine-scene.md](../05-state-machine-scene.md)

Mọi đoạn dưới đây dán thẳng vào Console của trình duyệt (hoặc đặt vào một file `src/dev/*.js` nạp trước `src/core/main.js`).
Nếu bạn làm file thật, nhớ chạy `node tests/smoke.js`: lời giải ⭐⭐ và ⭐⭐⭐ đổi luồng scene nên chỉ được bật sau cờ
`OG.Config.DEBUG` (xem ô ⚠️ đầu phần Bài tập của bài 05), nếu không test sẽ ĐỎ.

---

## ⭐ Scene "Xin chào"

```js
OG.Scenes.register('hello', {
  enter: function (params, fromName) {
    this.t = 0;                          // giây đã ở trong scene
    this.from = fromName || '(không có)';
    OG.DOM.hidePanel();                  // scene canvas: dọn panel DOM của scene trước
    OG.DOM.setHudVisible(false);
    OG.DOM.setControlsVisible(false);
  },
  update: function (dt) {
    this.t += dt;
    if (OG.Input.pressed('confirm') || OG.Input.pressed('back')) {
      OG.Input.consume('confirm'); OG.Input.consume('back');
      OG.Scenes.go('menu');
    }
  },
  draw: function (ctx) {
    ctx.fillStyle = '#10192b';
    ctx.fillRect(0, 0, OG.W, OG.H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffc94a';
    ctx.font = OG.font(56, 'bold');
    // Chữ nhún lên xuống: vị trí là HÀM của thời gian, không cần biến "vận tốc".
    ctx.fillText('Xin chào, Oggy!', OG.W / 2, OG.H / 2 + Math.sin(this.t * 3) * 12);
    ctx.fillStyle = '#fff6df';
    ctx.font = OG.font(20);
    ctx.fillText('Vào từ scene: ' + this.from + ' · đã ở đây ' + this.t.toFixed(1) + ' giây', OG.W / 2, OG.H / 2 + 60);
    ctx.fillText('Nhấn Enter hoặc Esc để về menu', OG.W / 2, OG.H / 2 + 96);
  }
});
OG.Scenes.go('hello');
```

**Giải thích.**

- Scene chỉ là **object**. `register` cất nó vào `registry`, `go` tra theo tên. Không có lớp cha, không phải "kế thừa" gì cả.
- Trạng thái của scene (`this.t`, `this.from`) được **đặt lại trong `enter`**. Nếu khởi tạo `t: 0` ngay trong object literal thì lần
  vào thứ hai sẽ đếm tiếp từ số cũ, vì registry giữ **cùng một object** qua mọi lần vào.
- Không cần `ctx.save()/restore()` ở đây: `Scenes.draw` đã bọc mỗi scene trong một cặp `save/restore`.

**Không `consume` thì sao?** Trong trường hợp này **không có lỗi**, vì `go()` gọi `OG.Input.reset()` (xoá cả trạng thái giữ phím lẫn
cờ "vừa nhấn") trước khi `enter` scene mới. `consume` vẫn là thói quen tốt: nó báo "cú bấm này đã được xử lý", phòng khi sau này
bạn đổi `go` thành `push`, hoặc thêm code xử lý `confirm` ở phía sau trong cùng `update`.

---

## ⭐⭐ Đếm ngược 3-2-1

```js
OG.Scenes.register('countdown', {
  drawBelow: true,                       // vẫn thấy màn chơi (đứng yên) phía sau
  enter: function (params) {
    this.total = (params && params.seconds) || 3;
    this.left = this.total;              // giây còn lại
  },
  update: function (dt) {
    this.left -= dt;
    if (this.left <= 0) OG.Scenes.pop(); // lộ lại 'level' → level.resume() chạy
  },
  draw: function (ctx) {
    var n = Math.ceil(this.left);
    var k = n - this.left;               // 0 → 1 trong mỗi giây
    var scale = 1.6 - 0.6 * k;           // số to rồi co lại
    ctx.fillStyle = 'rgba(16,25,43,0.35)';
    ctx.fillRect(0, 0, OG.W, OG.H);
    ctx.save();
    ctx.translate(OG.W / 2, OG.H / 2);
    ctx.scale(scale, scale);
    ctx.globalAlpha = 1 - 0.5 * k;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = OG.font(120, 'bold');
    ctx.lineWidth = 10; ctx.strokeStyle = '#17233d';
    ctx.strokeText(String(n), 0, 0);
    ctx.fillStyle = '#ffc94a';
    ctx.fillText(String(n), 0, 0);
    ctx.restore();
  }
});

OG.Level.addHook({
  id: 'countdown-start',
  update: function (st) {
    if (st.countdownDone) return;
    st.countdownDone = true;             // field riêng của hook, nằm trong state của MÀN NÀY
    OG.Scenes.push('countdown', { seconds: 3 });
    return true;                         // dừng frame: scene trên cùng đã đổi
  }
});
```

Dán xong là đếm ngược ngay trong màn hiện tại (hook `update` chạy từ frame kế tiếp), và lặp lại mỗi lần vào màn mới. Gỡ bằng
`OG.Level.removeHook('countdown-start')`.

**Giải thích.**

- **Đóng băng miễn phí.** Trong lúc đếm, stack là `['level', 'countdown']`. `Scenes.update` chỉ gọi `countdown.update`, nên vật lý,
  kẻ địch, `st.t` và đồng hồ `OG.Game.tickTime` đều đứng yên. Không có dòng `if (counting)` nào trong `level.js`.
- **Vẫn thấy màn chơi.** `drawBelow: true` làm `Scenes.draw` vẽ `level` trước rồi mới vẽ lớp phủ.
- **Vì sao push trong `update` mà không trong `enter` của hook?** Hook `enter` được gọi từ `enter` của scene `level`, tức là
  **bên trong** `Scenes.go('level')`. Lúc đó `go` chưa phát `'scene:change'`. Nếu ta `push` ở đây, thứ tự event sẽ là
  `level → countdown (push)` rồi mới tới `→ level (go)`. Audio và các module nghe event sẽ hiểu sai. Ở `update` thì `go` đã xong hẳn.
- **`return true`** báo cho `runUpdateHooks` dừng frame này. (Thật ra nó cũng tự dừng vì `OG.Scenes.current() !== 'level'`, nhưng ghi
  rõ ý định vẫn tốt hơn.)
- **Cờ nằm trên `st`, không nằm trong biến của hook.** "Chơi lại màn" hay vào màn khác đều dựng `st` mới bằng `buildState`, nên
  cờ tự mất mà không cần nghe event nào. Đây là lợi ích của việc tách **dữ liệu màn** (LevelDef) khỏi **trạng thái chạy** (`st`).

**Trả lời câu hỏi kiểm tra.** Giữ → trong lúc đếm: nhân vật không đi, `OG.Level.state.t` không tăng. Khi `pop()`, `Input.reset()`
xoá phím đang giữ. Với nhảy và tạm dừng, người chơi phải nhấn lại. Với ←/→ thì không cần: trên trình duyệt thật, phím đang
giữ được hệ điều hành bắn `keydown` lặp (`e.repeat`), và `bindKeyboard` cố ý cho trái/phải "giữ lại" ngay sau `reset()` (bài 03,
mục Đọc code 4). Vì vậy Oggy đi tiếp gần như ngay khi đếm xong. Sau đó `level.resume()` ẩn panel DOM (nếu có) và phát `'game:resume'`.

**Mở rộng.** Đổi `drawBelow` thành `false` để thấy cách `Scenes.draw` bỏ qua scene dưới. Thử bấm P trong lúc đếm: không có gì xảy ra,
vì `countdown.update` không đọc phím `pause`. Muốn cho phép tạm dừng thì phải tự xử lý, và đó là một quyết định thiết kế.

---

## ⭐⭐⭐ Chuyển cảnh mờ dần

```js
(function () {
  var FADE_DUR = 0.4;   // giây cho mỗi nửa (tối dần / sáng dần)
  var COLOR = '16,25,43';

  OG.Scenes.register('fade', {
    drawBelow: true,
    enter: function (params) {
      this.p = params || {};
      this.mode = this.p.mode || 'out';  // 'out' = tối dần, 'in' = sáng dần
      this.dur = this.p.dur || FADE_DUR;
      this.t = 0;
    },
    update: function (dt) {
      this.t += dt;
      if (this.t < this.dur) return;
      if (this.mode === 'out') {
        var p = this.p, dur = this.dur;
        // Đổi scene THẬT ở giữa hiệu ứng (lúc màn hình đen kịt) → người chơi không thấy chỗ "nối".
        if (typeof p.fn === 'function') p.fn();
        else OG.Scenes.go(p.to, p.params || {});
        // go() đã exit cả stack (kể cả fade này). Đè fade mới lên scene vừa vào để sáng dần.
        OG.Scenes.push('fade', { mode: 'in', dur: dur });
      } else {
        OG.Scenes.pop();
      }
    },
    draw: function (ctx) {
      var k = Math.min(1, this.t / this.dur);
      var a = this.mode === 'out' ? k : 1 - k;
      ctx.fillStyle = 'rgba(' + COLOR + ',' + a.toFixed(3) + ')';
      ctx.fillRect(0, 0, OG.W, OG.H);
    }
  });

  /**
   * Chuyển scene có hiệu ứng mờ dần.
   * @param {string|Function} to  tên scene, hoặc hàm tự chuyển (vd vào màn phải qua OG.Game.startLevel)
   * @param {Object} [params]
   */
  window.fadeTo = function (to, params) {
    if (OG.Scenes.current() === 'fade') return;   // đang chuyển cảnh thì bỏ qua cú bấm thứ hai
    OG.Scenes.push('fade', typeof to === 'function' ? { fn: to } : { to: to, params: params });
  };
})();
// Ví dụ: fadeTo('menu');   fadeTo(function () { OG.Game.startLevel('garden'); });
```

**Diễn biến của stack** khi đang chơi và gọi `fadeTo('menu')`:

```
['level']                → push fade(out)  → ['level', 'fade']     màn chơi tối dần (đứng yên)
hết 0,4 s: go('menu')    → exit level, fade → ['menu']
           push fade(in) →                    ['menu', 'fade']      menu sáng dần
hết 0,4 s: pop()         →                    ['menu']              gọi menu.resume() nếu scene có hàm này
```

**Giải thích.**

- **Hai pha trong một scene.** `mode` là một FSM hai trạng thái, giống `st.phase` của `level`. Không cần hai scene `fadeOut` và
  `fadeIn` riêng.
- **Chặn input.** Lúc `fade` nằm trên, scene dưới không được `update`, nên người chơi không bấm nhầm được gì trong 0,8 giây.
- **Chống bấm đúp.** Kiểm tra `current() === 'fade'` ngay đầu `fadeTo`. Không có dòng này, gọi hai lần liên tiếp sẽ cho stack
  `['level', 'fade', 'fade']`. Stack không hỏng hẳn, vì fade trên cùng gọi `go()` và xoá cả hai. Nhưng hai mục đó là **cùng một
  object**: lần `push` thứ hai gọi `enter()` đặt `t` về 0 và đổi đích sang đích của lần bấm sau, còn lớp tối bị vẽ hai lần nên đậm
  gấp đôi. Xem thêm câu (b) bên dưới.
- **Vì sao hỗ trợ `fn`?** Vào màn chơi phải qua `OG.Game.startLevel(id)`: nó đảm bảo có lượt chơi (`ensureRun`), tìm `LevelDef`, rồi mới
  `go('level')`. Quy ước này có ghi trong `goNext` của `src/story/story.js`. Truyền hàm giúp `fadeTo` không cần biết những quy tắc đó.

**Trả lời câu hỏi.**

- **(a) Panel DOM không mờ.** `fade` vẽ lên **canvas**, còn menu dựng panel bằng **DOM** trong `#overlay`, một lớp HTML nằm **trên**
  canvas. Canvas không thể vẽ đè lên DOM. Muốn mờ cả panel thì phải đổi `opacity` của `#overlay` bằng CSS. Đây là cái giá của thiết
  kế "DOM cho menu, canvas cho gameplay" (khối đầu `src/ui/menus.js` giải thích lý do chọn).
- **(b) Một object, hai lần trong stack.** Có. Ở frame đổi cảnh, `update` của fade(out) gọi `go()` (exit chính nó) rồi `push('fade')`.
  `enter` chạy trên **cùng object** nên ghi đè `this.mode`, `this.t`, `this.p`. May là ta đã chép `p` và `dur` ra biến cục bộ trước
  khi `go`. Nếu đọc `this.p.to` **sau** `push` thì sẽ nhận giá trị của fade(in). Nếu cùng lúc có hai fade **sống** trong stack (vd
  `push` fade lên trên một fade khác) thì cả hai chia nhau một bộ trạng thái và chạy sai. Cách an toàn hơn cho scene có thể lồng nhau:
  đăng ký một **factory** (hàm tạo object mới) thay vì một object, hoặc lưu trạng thái vào `params` riêng của từng lần push.

**Mở rộng.**

- Thay `rgba` phẳng bằng **iris wipe** (vòng tròn co lại quanh nhân vật): vẽ hình tròn bằng `ctx.arc` với
  `globalCompositeOperation = 'destination-out'` trên một canvas phụ (xem bài 07).
- Dùng **easing** cho `k` (vd `k * k * (3 - 2 * k)`, smoothstep) để đầu và cuối hiệu ứng mềm hơn.
