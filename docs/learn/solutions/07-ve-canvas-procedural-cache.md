# Lời giải — Bài 07: Vẽ procedural bằng Canvas và cache khung hình

> ✋ **Hãy tự làm trước.** Lời giải chỉ có ích khi bạn đã thử và bị kẹt ít nhất 15 phút. Đọc lời giải quá sớm sẽ lấy mất phần
> "à, ra thế!", mà đó lại là lúc bạn học được nhiều nhất.
>
> Quay lại bài học: [07-ve-canvas-procedural-cache.md](../07-ve-canvas-procedural-cache.md)

Mọi đoạn dưới đây dán vào Console khi đang ở trong một màn chơi. Hook có `update`/`draw*` chạy ngay từ frame kế tiếp
(bấm "Tiếp tục" nếu game đã tự tạm dừng khi bạn bấm vào Console).

---

## ⭐ Ngôi sao xoay và đập nhịp

```js
OG.Level.addHook({
  id: 'demo-star',
  order: 95,
  drawScreen: function (ctx, st, t) {
    var POINTS = 5, R_OUT = 22, R_IN = 10;           // px
    var pulse = 1 + 0.15 * Math.sin(t * 6);          // nhịp đập: hàm của t
    ctx.save();                                      // mọi transform bên dưới chỉ sống tới restore()
    ctx.translate(900, 110);                         // 1) dời gốc tới tâm ngôi sao
    ctx.rotate(t * 1.5);                             // 2) xoay quanh gốc mới (= tâm)
    ctx.scale(pulse, pulse);                         // 3) phóng to/thu nhỏ quanh tâm
    ctx.beginPath();
    for (var i = 0; i < POINTS * 2; i++) {
      var r = i % 2 ? R_IN : R_OUT;                  // xen kẽ đỉnh ngoài / đỉnh trong
      var a = (i * Math.PI) / POINTS - Math.PI / 2;  // bắt đầu từ đỉnh trên cùng
      if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    // Viền kiểu hoạt hình: stroke nét DÀY trước, fill đè lên → chỉ còn nửa ngoài của nét.
    ctx.lineJoin = 'round';
    ctx.lineWidth = 6; ctx.strokeStyle = '#17233d'; ctx.stroke();
    ctx.fillStyle = '#ffc94a'; ctx.fill();
    ctx.restore();
  }
});
```

Gỡ: `OG.Level.removeHook('demo-star')`.

**Giải thích.**

- **Vẽ quanh gốc, đặt bằng transform.** Toạ độ các đỉnh chỉ phụ thuộc bán kính và góc, không có `900` hay `110` nào. Vị trí, góc xoay
  và độ phóng đều nằm ở ba dòng transform. Đây là cách `sprites.js` vẽ mọi bộ phận (đầu quanh tâm đầu, thân quanh hông...).
- **Thứ tự transform.** `translate → rotate → scale` nghĩa là: tới tâm, xoay, rồi phóng. Đổi `rotate` lên trước `translate` thì sao
  sẽ quay quanh **góc trên-trái màn hình**, vẽ thành một vòng tròn to.
- **`stroke` trước `fill`.** Nét dày 6 px nằm **chính giữa** đường biên: 3 px trong, 3 px ngoài. `fill` sau che mất nửa trong, nên
  còn lại viền ngoài 3 px đều. Làm ngược lại (`fill` rồi `stroke`) thì viền dày 6 px, trong đó 3 px đè lên lòng hình, nên phần màu
  vàng bị thu nhỏ và các mũi sao trông cùn hơn.
- **`save`/`restore` là bắt buộc.** Hook `drawScreen` chạy trước HUD. Thiếu `restore` thì HUD bị xoay theo ngôi sao, và smoke test
  báo "ctx.save/restore lệch".
- **Không phụ thuộc FPS.** Góc là `t * 1.5` (radian/giây × giây), không phải `angle += 0.025` mỗi frame. Máy 30 hay 144 FPS đều
  quay đúng 1,5 rad/giây.

---

## ⭐⭐ Quả bóng nảy có squash & stretch

```js
(function () {
  var PERIOD = 1.1;        // giây cho một lần nảy
  var HEIGHT = 140;        // px: độ cao đỉnh
  var R = 18;              // px: bán kính bóng
  var CONTACT = 0.16;      // phần chu kỳ bóng dính đất (bị bẹp), 0..1
  var MAX_SQUASH = 0.35;   // bẹp dọc tối đa: sy = 1 − 0.35
  var MAX_STRETCH = 0.25;  // giãn dọc tối đa khi bay nhanh nhất

  /**
   * Tính tư thế quả bóng tại thời điểm t (giây). KHÔNG vẽ, KHÔNG nhớ gì giữa các frame.
   * @param {number} t giây
   * @returns {{h:number, sx:number, sy:number}} h = độ cao so với đất (px), sx/sy = hệ số co giãn
   */
  function ballPose(t) {
    var k = (((t % PERIOD) + PERIOD) % PERIOD) / PERIOD; // pha 0..1 (an toàn cả khi t âm)
    var h, sy;
    if (k < CONTACT) {
      // Pha CHẠM ĐẤT: bẹp dần rồi bung lại theo nửa sóng sin (0 → 1 → 0).
      var amt = Math.sin(Math.PI * k / CONTACT);
      h = 0;
      sy = 1 - MAX_SQUASH * amt;
    } else {
      // Pha BAY: u chạy 0..1 trong phần còn lại của chu kỳ.
      var u = (k - CONTACT) / (1 - CONTACT);
      h = 4 * HEIGHT * u * (1 - u);                       // parabol: 0 ở hai đầu, HEIGHT ở giữa
      var speed = Math.abs(1 - 2 * u);                    // |vận tốc| chuẩn hoá: 1 sát đất, 0 ở đỉnh
      sy = 1 + MAX_STRETCH * speed;                       // bay nhanh → giãn dọc
    }
    return { h: h, sx: 1 / sy, sy: sy };                  // sx = 1/sy: giữ "diện tích" không đổi
  }
  window.ballPose = ballPose;

  OG.Level.addHook({
    id: 'demo-ball',
    order: 95,
    drawWorld: function (ctx, st, t) {
      var P = ballPose(t);
      var footX = st.level.spawn.x + 220, footY = OG.FLOOR_Y; // toạ độ THẾ GIỚI (camera đã áp)
      // bóng đổ: nhỏ và nhạt dần khi bóng lên cao
      var near = 1 - P.h / HEIGHT;
      ctx.save();
      ctx.globalAlpha = 0.15 + 0.2 * near;
      ctx.fillStyle = '#17233d';
      ctx.beginPath(); ctx.ellipse(footX, footY - 2, R * (0.6 + 0.5 * near), 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // thân bóng: dời tới CHÂN bóng rồi mới scale → co giãn quanh điểm chạm đất
      ctx.save();
      ctx.translate(footX, footY - P.h);
      ctx.scale(P.sx, P.sy);
      ctx.beginPath(); ctx.arc(0, -R, R, 0, Math.PI * 2);
      ctx.lineWidth = 3; ctx.strokeStyle = '#17233d'; ctx.stroke();
      ctx.fillStyle = '#e5484d'; ctx.fill();
      // đốm sáng lệch trên-trái: cảm giác khối tròn
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath(); ctx.arc(-R * 0.35, -R * 1.35, R * 0.28, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  });
})();
```

Thử trong Console: `ballPose(0)` → `{h: 0, sx: 1, sy: 1}` (vừa chạm đất), `ballPose(0.05)` → bẹp mạnh (`sy ≈ 0,73`),
`ballPose(0.63)` → gần đỉnh (`h ≈ 140`, `sy ≈ 1`), `ballPose(-0.3)` → vẫn hợp lệ.

**Giải thích.**

- **Hàm thuần.** `ballPose` giống `computePose` trong `sprites.js`: chỉ tính số, không vẽ, không nhớ trạng thái. Vì vậy test được
  ngay trong Console, và nếu muốn cache thì chỉ cần lượng tử hoá `t`.
- **Vì sao không mô phỏng vật lý thật** (`vy += g·dt`)? Bóng trang trí không tương tác với gì, nên công thức đóng (closed form) theo
  `t` đơn giản hơn và không bao giờ "trôi" sai số. Nhân vật người chơi thì khác: nó phải phản ứng với input và va chạm, nên phải
  tích phân từng frame (bài 04).
- **Hai pha.** Pha "dính đất" chiếm 16% chu kỳ, `h = 0` nên chân bóng không lún xuống đất. Pha "bay" tự co thang `u` về 0..1 để parabol
  liền mạch với pha chạm đất (cả hai đầu đều `h = 0`). Nếu chỉ "đè" pha bẹp lên một parabol phủ cả chu kỳ, `h` sẽ nhảy cóc từ 0 lên
  khoảng 75 px ở frame bóng rời đất (`4 · 140 · 0,16 · 0,84 ≈ 75`).
- **Giữ diện tích.** `sx = 1/sy` nên diện tích elip (`π·R·sx·R·sy`) không đổi. Thử đặt `sx = 1` cố định: bóng như đang phồng xẹp
  chứ không như cao su.
- **Co giãn quanh chân.** `translate(footX, footY − h)` đưa gốc tới **điểm thấp nhất** của bóng, rồi vẽ tâm ở `(0, −R)`. `scale` vì
  thế giữ điểm chạm đất cố định. Thử vẽ `arc(0, 0, R)` (co giãn quanh tâm) để thấy bóng bẹp mà lơ lửng trên đất.
- **Bóng đổ** là một tín hiệu chiều sâu rẻ tiền: chỉ một elip mờ, to và đậm khi bóng gần đất.
- **Ngoài lề:** lúc chạm đất `sy` nhảy từ 1,25 (giãn) sang 1 rồi giảm dần (bẹp). Họa sĩ hoạt hình cũng làm như vậy: frame cuối
  trước va chạm giãn mạnh nhất, frame va chạm bẹp ngay.

---

## ⭐⭐⭐ Huy hiệu procedural với cache LRU tự viết

```js
(function () {
  var BADGE = 120;        // px: cạnh canvas phụ của một huy hiệu ở scale 1
  var CACHE_MAX = 6;      // số huy hiệu tối đa giữ trong cache

  /** Tạo cache LRU dùng Map (Map giữ thứ tự chèn: khoá đầu = lâu chưa dùng nhất). */
  function makeLRU(max) {
    var map = new Map();
    var stats = { hits: 0, misses: 0, evictions: 0 };
    return {
      /** Lấy giá trị theo key; chưa có thì gọi build() để tạo rồi cất vào. */
      get: function (key, build) {
        if (map.has(key)) {
          var v = map.get(key);
          map.delete(key); map.set(key, v);  // dời xuống cuối = "vừa dùng"
          stats.hits++;
          return v;
        }
        stats.misses++;
        var made = build();
        map.set(key, made);
        while (map.size > max) {             // quá giới hạn → bỏ khoá ĐẦU TIÊN (lâu chưa dùng nhất)
          map.delete(map.keys().next().value);
          stats.evictions++;
        }
        return made;
      },
      stats: function () { return { size: map.size, hits: stats.hits, misses: stats.misses, evictions: stats.evictions }; },
      clear: function () { map.clear(); }
    };
  }

  /** Vẽ procedural một huy hiệu quanh gốc (0,0) — tốn nhiều lệnh: 12 tia, gradient, chữ có viền. */
  function paintBadge(g, text, color) {
    var R = 46;
    for (var i = 0; i < 12; i++) {                       // tia nắng phía sau
      g.save();
      g.rotate((i * Math.PI * 2) / 12);
      g.fillStyle = i % 2 ? '#ffe28a' : '#ffc94a';
      g.beginPath(); g.moveTo(-7, -R + 6); g.lineTo(0, -R - 12); g.lineTo(7, -R + 6); g.closePath(); g.fill();
      g.restore();
    }
    var grad = g.createRadialGradient(-R * 0.35, -R * 0.4, 4, 0, 0, R * 1.1);
    grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.35, color); grad.addColorStop(1, '#17233d');
    g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2);
    g.lineWidth = 6; g.strokeStyle = '#17233d'; g.stroke();
    g.fillStyle = grad; g.fill();
    g.font = OG.font(22, 'bold'); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 5; g.strokeStyle = '#17233d'; g.strokeText(text, 0, 2);
    g.fillStyle = '#fff6df'; g.fillText(text, 0, 2);
  }

  var cache = makeLRU(CACHE_MAX);

  /**
   * Vẽ huy hiệu, tâm tại (x, y) px. Hình giống nhau dùng chung một canvas phụ.
   * @param {number} [scale=1]  được LƯỢNG TỬ HOÁ về bước 0.1 trước khi đưa vào khoá
   */
  function drawBadge(ctx, x, y, text, color, scale) {
    var s = Math.round((scale || 1) * 10) / 10;
    var key = text + '|' + color + '|' + s;               // khoá = MỌI thứ làm hình khác đi
    var cv = cache.get(key, function () {
      var c = document.createElement('canvas');
      c.width = Math.ceil(BADGE * s); c.height = Math.ceil(BADGE * s);
      var g = c.getContext('2d');
      g.translate(c.width / 2, c.height / 2);
      g.scale(s, s);
      paintBadge(g, text, color);
      return c;
    });
    // Làm tròn toạ độ: drawImage ở toạ độ lẻ làm ảnh bị nội suy mờ.
    ctx.drawImage(cv, Math.round(x - cv.width / 2), Math.round(y - cv.height / 2));
  }

  OG.Level.addHook({
    id: 'demo-badge',
    order: 95,
    drawScreen: function (ctx, st, t) {
      var have = OG.Game.stage ? OG.Game.stage.pizzas : 0;
      var pulse = 1 + 0.12 * Math.sin(t * 5);   // liên tục, nhưng chỉ sinh vài khoá nhờ lượng tử hoá
      drawBadge(ctx, 880, 470, have + '/' + st.level.goal, have >= st.level.goal ? '#3fbf6f' : '#f27a43', pulse);
    }
  });

  /** So thời gian: vẽ trực tiếp n lần vs vẽ qua cache n lần (trên canvas phụ, không ảnh hưởng game). */
  function benchmark(n) {
    n = n || 2000;
    var c = document.createElement('canvas'); c.width = OG.W; c.height = OG.H;
    var g = c.getContext('2d');
    var t0 = performance.now();
    for (var i = 0; i < n; i++) { g.save(); g.translate(480, 270); paintBadge(g, 'A', '#52c5ee'); g.restore(); }
    var t1 = performance.now();
    for (var j = 0; j < n; j++) drawBadge(g, 480, 270, 'A', '#52c5ee', 1);
    var t2 = performance.now();
    return { direct_ms: +(t1 - t0).toFixed(1), cached_ms: +(t2 - t1).toFixed(1) };
  }

  window.badgeCache = cache;
  window.badgeBenchmark = benchmark;
})();
```

Thử: chơi vài giây rồi gõ `badgeCache.stats()`. Bạn sẽ thấy khoảng 3 khoá (`pulse` từ 0,88 đến 1,12 làm tròn thành 0,9 / 1 / 1,1),
`hits` hàng trăm, `misses` = 3. Nhặt pizza: mỗi con số mới (`1/5`, `2/5`...) sinh thêm vài khoá. Cache giới hạn 6 nên các khoá cũ bị
đẩy ra (`evictions` tăng). Rồi gõ `badgeBenchmark(2000)`: trên máy thông thường, bản cache nhanh hơn vẽ trực tiếp nhiều lần. Con số
chính xác tuỳ máy và trình duyệt.

**Giải thích.**

- **LRU bằng Map** dựa vào một đảm bảo của ngôn ngữ: Map duyệt khoá theo **thứ tự chèn**. `delete + set` đưa khoá xuống cuối, nên
  khoá đầu luôn là khoá lâu chưa dùng nhất. Cả `get` lẫn loại bỏ đều O(1), không cần danh sách liên kết như LRU trong sách giáo khoa.
- **Lượng tử hoá.** Nếu đưa `pulse` thô vào khoá, mỗi frame có một số thực mới, nên mỗi frame một canvas mới: 60 lần
  `createElement` mỗi giây, cache luôn trượt và luôn đẩy khung cũ ra (thrashing). Làm tròn về bước 0,1 đổi lấy "nhịp đập hơi bậc
  thang" (khó thấy ở cỡ 120 px). Đây đúng là đánh đổi mà `quantize` trong `sprites.js` thực hiện với thời gian, và lớp mây trong
  `decor.js` thực hiện với tỉ lệ.
- **Kích thước canvas phụ theo `s`.** Ta vẽ sẵn ở đúng cỡ hiển thị, nên `drawImage` không phải co giãn ảnh. Ảnh vì vậy sắc nét và
  nhanh hơn. Cách khác là cache ở cỡ lớn nhất rồi `drawImage(cv, x, y, w, h)` co lại: ít khoá hơn nhưng mỗi lần vẽ tốn công nội suy.
- **`Math.round` toạ độ** khi `drawImage`: ảnh đặt lệch nửa điểm ảnh sẽ bị trình duyệt nội suy, nét viền nhoè (xem `⚠️ Bẫy` trong
  `drawSprite` của `decor.js`).

**Trả lời câu hỏi 5.** Khoá gồm `text | color | s`. Quên `color`: khi số pizza đạt mục tiêu, text đổi (vd `5/5`) nên đó là khoá mới,
và lần này ảnh vẫn đúng màu xanh. Nhưng nếu có hai lúc **cùng text, khác màu** (vd đặt mục tiêu khác cho cùng con số, hoặc thêm hiệu
ứng nháy đỏ khi bị thương), cache trả về ảnh màu **cũ**. Đây là loại lỗi khó tìm, vì nó chỉ xuất hiện khi thứ tự vẽ "đúng kiểu". Quy
tắc an toàn ở `frameKey` của `sprites.js`: **mọi** tham số ảnh hưởng tới hình đều phải vào khoá.

**Mở rộng.**

- Dùng `OG.Decor.drawSprite(ctx, key, x, y, w, h, ox, oy, paint)` có sẵn thay cho cache tự viết. Đọc `sprite()` để thấy nó xử lý
  thêm trường hợp tạo canvas **thất bại** (`false`) như thế nào.
- So sánh hành vi LRU và FIFO: viết `makeFIFO(max)` (như `remember` trong `decor.js`), cho cả hai cùng chạy một chuỗi truy cập kiểu
  `A B A C A D A E...`. Với LRU, `A` luôn còn trong cache; với FIFO, `A` cũng bị đẩy ra định kỳ dù được dùng liên tục.
