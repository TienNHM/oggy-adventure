# Lời giải — Bài 04: Vật lý và va chạm AABB

> ✋ **Hãy tự làm trước.** Lời giải chỉ có ích khi bạn đã thử và bị kẹt ít nhất 15 phút. Đọc lời giải quá sớm sẽ lấy mất phần
> "à, ra thế!", mà đó lại là lúc bạn học được nhiều nhất.
>
> Quay lại bài học: [04-vat-ly-va-cham-aabb.md](../04-vat-ly-va-cham-aabb.md)

---

## ⭐ Đo đỉnh nhảy thật

Dán vào console khi đang ở trong một màn chơi:

```js
var startY = null, minY = 0;
// Lúc phát 'player:jump', Player.update chưa gọi moveBody → p.y vẫn là vị trí đứng trên đất.
OG.Events.on('player:jump', function () {
  var p = OG.Level.state.player;
  startY = p.y; minY = p.y;
});
// Hook update chạy SAU Player.update mỗi frame → thấy vị trí đã cập nhật.
OG.Level.addHook({
  id: 'jumpMeter',
  update: function (st, dt, p) { if (startY !== null && p.y < minY) minY = p.y; }
});
OG.Events.on('player:land', function () {
  if (startY === null) return;
  console.log('Đỉnh nhảy:', (startY - minY).toFixed(1), 'px');
  startY = null;
});
```

**Kết quả** (Oggy, máy chạy 60 FPS):

| Trường hợp | Đo được | Công thức `v² / 2g` |
|---|---|---|
| Thử thách, giữ nút | ≈ 111 px | 590² / (2 · 1500) ≈ 116 px |
| Bé chơi, **giữ** nút | ≈ 156 px | 590² / (2 · 1500 · 0,72) ≈ 161 px |
| Bé chơi, bấm nhanh rồi thả | ≈ 111–120 px, tuỳ lúc thả | — |

**Giải thích.**

- **Số đo thấp hơn công thức** vì game dùng semi-implicit Euler theo từng bước dt (bài 02): ngay bước đầu, vận tốc đi lên đã bị trọng
  lực trừ đi `g · dt` trước khi kịp dời vị trí. Sai lệch ≈ `v · dt / 2` ≈ 5 px ở 60 FPS. Máy chạy 144 FPS sẽ đo được cao hơn một
  chút (≈ 114 px).
- **Bé chơi giữ nút cao hơn** vì `Player.update` nhân trọng lực với `jumpHoldGravityMul = 0.72` khi **đang bay lên và vẫn giữ** nút
  nhảy. Thả nút sớm thì trọng lực trở lại bình thường, nên cú nhảy thấp hơn. Đây là **variable jump height**: người chơi điều khiển
  được độ cao bằng thời gian giữ nút, và đó là lý do điều kiện dùng `keys.jump` (held) chứ không phải `pressed`.
- Ở chế độ Thử thách, `jumpHoldGravityMul = 1` nên giữ hay thả đều như nhau.
- Nếu Oggy đáp lên một bục cao hơn chỗ xuất phát thì số đo vẫn đúng, vì ta đo từ `startY` lên `minY`.

Dọn dẹp: `OG.Level.removeHook('jumpMeter')`. Hai listener `on` vẫn còn: muốn gỡ thì giữ hàm `off` mà `OG.Events.on` trả về
(bài 06), hoặc tải lại trang.

---

## ⭐⭐ Chế độ xem hitbox

File `src/dev/debug-boxes.js` (nạp trước `main.js`), hoặc dán phần thân IIFE vào console:

```js
(function () {
  'use strict';
  var OG = window.OG;
  var COLORS = { platform: '#3b82f6', hitbox: '#ffc94a', hurtbox: '#e5484d', ground: '#3fbf6f', air: '#d946ef' };

  OG.Level.addHook({
    id: 'debugBoxes',
    order: 99, // vẽ sau các hook khác để khung nằm trên cùng
    // drawFront: toạ độ THẾ GIỚI (camera đã áp), vẽ sau người chơi.
    drawFront: function (ctx, st) {
      ctx.save();
      ctx.lineWidth = 1;
      ctx.strokeStyle = COLORS.platform;
      for (var i = 0; i < st.platforms.length; i++) {
        var pl = st.platforms[i];
        ctx.strokeRect(pl.x, pl.y, pl.w, pl.h);
      }
      ctx.lineWidth = 2;
      for (var k = 0; k < st.enemies.length; k++) {
        var e = st.enemies[k];
        if (!e.alive) continue;            // gián đã bẹp vẫn còn trong mảng để chạy hoạt ảnh
        ctx.strokeStyle = COLORS.hitbox;
        ctx.strokeRect(e.x, e.y, e.w, e.h);
        var hb = OG.Enemies.hurtbox(e);    // object MỚI, không sửa e
        ctx.strokeStyle = COLORS.hurtbox;
        ctx.strokeRect(hb.x, hb.y, hb.w, hb.h);
      }
      var p = st.player;
      ctx.strokeStyle = p.ground ? COLORS.ground : COLORS.air;
      ctx.strokeRect(p.x, p.y, p.w, p.h);
      ctx.restore();
    }
  });
})();
```

Tắt bằng `OG.Level.removeHook('debugBoxes')`.

**Quan sát.**

- Ở **Thử thách**, khung đỏ (hurtbox) nhỏ hơn khung vàng (hitbox) đúng 3 px ở hai bên và phía trên (`HURTBOX_INSET`). Đáy giữ nguyên.
- Ở **Bé chơi**, khung đỏ chỉ còn 70% (`enemyHitboxScale: 0.7`), **giữ đáy** và co đều hai bên (`enemyHurtbox` trong
  `difficulty.js`). Đầu gián "thấp xuống", nên vừa dễ giẫm vừa khó bị chạm oan.
- Khi đứng yên, khung người chơi xanh lá ổn định, không nhấp nháy sang màu "trên không". Mỗi frame `moveBody` đặt `ground = false`,
  để trọng lực kéo body xuống một chút, rồi phép thử đáp bục đặt nó lên lại mặt bục và bật `ground = true`, tất cả trong **cùng một
  lời gọi**. Code bên ngoài (kể cả hook vẽ) không bao giờ thấy trạng thái "tạm thời trên không" đó.
- Với Dee Dee (`hurtTop`), phần trên của hurtbox bị cắt bớt (bụng mềm, giẫm được).

**Vì sao `drawFront` mà không `drawScreen`?** `Level.drawWorld` gọi `OG.Camera.apply(ctx)` (một phép `translate` ngược vị trí camera)
trước khi chạy `drawWorld`/`drawFront` của hook, rồi `restore` trước `drawScreen`. Hitbox lưu theo toạ độ **thế giới**, nên phải vẽ
khi camera đang được áp. Vẽ ở `drawScreen` thì khung bị lệch đúng một đoạn `OG.Camera.x`, và lệch càng xa khi màn cuộn. Nếu
bắt buộc vẽ ở `drawScreen`, phải tự đổi toạ độ: `screenX = worldX − OG.Camera.x` (bài 08).

---

## ⭐⭐⭐ Bục "đụng đầu" (solid platform)

**1. `src/core/physics.js`**, trong `moveBody`, ngay **sau** vòng `for` đáp bục và **trước** dòng `return`:

```js
      // Bục đặc (solid): nhảy từ dưới lên thì đụng đầu. Đối xứng với 4 điều kiện đáp bục ở trên.
      for (var j = 0; j < platforms.length; j++) {
        var solid = /** @type {Platform} */ (platforms[j]);
        if (!solid.solid) continue;
        var bottom = solid.y + solid.h;               // mặt DƯỚI của bục, px thế giới
        var wasBelow = oldY >= bottom;                // (2) frame trước đỉnh đầu còn ở dưới đáy bục
        var reachedBottom = body.y < bottom;          // (3) frame này đỉnh đầu đã lên quá đáy bục
        var overlapSolidX = body.x + body.w > solid.x && body.x < solid.x + solid.w; // (4)
        if (body.vy < 0 && wasBelow && reachedBottom && overlapSolidX) {           // (1) đang đi lên
          body.y = bottom;  // đặt đỉnh đầu sát đáy bục
          body.vy = 0;      // mất hết vận tốc đi lên → frame sau trọng lực kéo xuống
        }
      }
```

**Kiểu dữ liệu** (vì `physics.js` có `// @ts-check`), dùng cách "thêm, không sửa":

- `src/types.d.ts`: `interface Platform extends AABB { isFloor?: boolean; solid?: boolean }`
- JSDoc của `moveBody`: đổi `@param {AABB[]} platforms` thành `@param {Platform[]} platforms`. Người gọi đang truyền mảng
  `{x, y, w, h}` vẫn hợp lệ, vì mọi field mới đều tuỳ chọn.

Cập nhật luôn dòng tiêu đề và `Khái niệm:` trong khối đầu file (ví dụ thêm "bục đặc đụng đầu"), để comment không nói sai về code.

**2. Thử trong game:** `OG.Level.state.platforms[1].solid = true`, đứng dưới bục đó rồi nhảy. Oggy đụng đầu và rơi xuống. Nhảy từ
ngoài mép rồi đáp lên **trên** bục thì vẫn đứng được như cũ.

**3. Trả lời câu hỏi.**

- *Vì sao so với `oldY`?* Cùng lý do với đáp bục: đi lên với 590 px/giây và dt 0,033 giây thì mỗi frame đi được ≈ 20 px. Một bục
  mỏng hơn 20 px có thể bị **nhảy vọt qua** trong một frame. Khi đó vị trí mới không còn "nằm trong" bục nên phép thử chỉ dựa trên
  `body.y` bỏ sót. So "frame trước ở dưới, frame này ở trên" thì không bao giờ sót. Điều kiện `wasBelow` còn đảm bảo nhân vật
  **đang đứng trên** bục đặc rồi nhảy lên sẽ không bị coi là "đụng đầu" chính cái bục dưới chân.
- *Có hỏng kẻ địch/trùm không?* Không. Không bục nào trong dữ liệu màn có `solid` (field chỉ được gán bằng tay trong console), nên
  `if (!solid.solid) continue;` bỏ qua mọi bục. Hành vi cũ giữ nguyên 100%. Tính năng mới mặc định **tắt**.
- *Thứ tự hai vòng lặp có quan trọng không?* Hai vòng loại trừ nhau theo dấu của `vy` (đáp bục cần `vy >= 0`, đụng đầu cần
  `vy < 0`), nên trong cùng một frame chỉ một vòng có tác dụng.

**4. Kiểm tra:**

```bash
node --check src/core/physics.js
npx -y -p typescript@5.6.3 tsc -p jsconfig.json --noEmit
node tests/smoke.js
```

Cả ba phải sạch: `node --check` và `tsc` không in gì (mã thoát 0), smoke test in `XANH`. Nếu tsc báo lỗi ở `physics.js`, đọc lại ý
về `src/types.d.ts` ở trên. Nếu smoke test đỏ, đọc dòng `✗` đầu tiên: nó cho biết bước kiểm tra nào hỏng và đang ở scene nào.

**Mở rộng để suy nghĩ.** Muốn màn chơi khai báo bục đặc bằng **dữ liệu**, thì `LevelDef.platforms` hiện là mảng `[x, y, w, h]` nên
không có chỗ cho cờ. Bạn sẽ phải mở rộng định dạng (ví dụ phần tử thứ 5 là `{ solid: true }`) và sửa `buildState` trong `level.js`
để chép cờ sang. Đổi định dạng dữ liệu là đổi **hợp đồng** (`docs/ARCHITECTURE.md`, `docs/STORY.md`), nên cần cân nhắc kỹ. Bài
12 bàn về chuyện này.
