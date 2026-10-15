# src/gfx: yêu cầu cho agent Tích hợp

## 1. Thêm script `skins.js` (bắt buộc để có skin Đầu Bếp và Siêu Mèo)

Trong `index.html`, thêm ngay sau `sprites.js` và trước `scenery.js`:

```html
<script src="src/gfx/sprites.js"></script>
<script src="src/gfx/skins.js"></script>
<script src="src/gfx/scenery.js"></script>
```

`skins.js` gọi `OG.Data.registerSkin` lúc load file (không đụng `OG.Save.data`) để thêm `oggy_chef` và `oggy_super`. Nó cũng khai báo phụ kiện vẽ (`OG.Sprites.skinGfx`) cho `oggy_ninja`, `oggy_gold`, `jack_army` và `olivia_rose`. Nếu thiếu thẻ script này, game vẫn chạy nhưng các skin trên chỉ còn đổi màu.

Skin Oggy do Sprites hỗ trợ: `oggy_default`, `oggy_chef`, `oggy_super`, `oggy_ninja`, `oggy_gold` (danh sách nằm ở `OG.Sprites.OGGY_SKINS`).

## 2. Cho `OG.Particles` vẽ hạt có hình dạng (khuyến nghị)

Sprites phát bụi, lấp lánh và sao qua `OG.Particles.spawn(x, y, {..., shape})`, với `shape` là `dust`, `spark` hoặc `star`. Bản `particles.js` hiện tại bỏ qua `shape` nên các hạt vẫn hiện thành ô vuông. Muốn chúng có hình dạng thì sửa hai chỗ trong `src/game/particles.js`:

```js
// spawn(): giữ lại shape (và seed để mỗi ngôi sao xoay lệch nhau)
list.push({ ..., text: null, shape: opts.shape || null, seed: Math.random() * 6 });

// draw(): trước nhánh fillRect
} else if (p.shape && OG.Sprites && OG.Sprites.drawParticle && OG.Sprites.drawParticle(ctx, p)) {
  // đã vẽ bằng Sprites
} else {
  ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
}
```

`OG.Sprites.drawParticle(ctx, p)` chỉ đọc `p.x, p.y, p.size, p.color, p.shape, p.life, p.max, p.seed`, đặt `fillStyle` và trả về `true` nếu đã vẽ. `globalAlpha` vẫn do Particles đặt như hiện nay.

## 3. Hiệu ứng tự động (không cần làm gì)

`OG.Sprites.init()` nghe các event sau. Gameplay không phải gọi Sprites trực tiếp:

| Event | Hiệu ứng |
|---|---|
| `player:jump` | bụi bật nhảy ở chân |
| `player:land` | bụi tiếp đất, kèm squash 0,18 giây khi vẽ nhân vật |
| `item:collect` | lấp lánh tại vật phẩm (xu màu vàng, pizza màu kem) |
| `enemy:stomp` | sao văng ra từ con gián bị giẫm |
| `player:hurt` | sao trắng quanh đầu, hoặc lấp lánh xanh nếu khiên đỡ đòn |
| `boss:hit` | sao dưới chân người chơi (chỗ vừa giẫm điểm yếu) |
| `boss:defeated` | lấp lánh |

Bụi khi chạy do `drawCharacter` tự phát theo nhịp bước, khi `opts.vx != null` và scene nền là `level` hoặc `boss`. Ở màn thường, vị trí lấy từ `OG.Level.state.player`. Ở khung boss thì Sprites suy ra từ ma trận canvas cộng `OG.Camera`.

`level.js` đang tự gọi `OG.Particles.spawn` khi nhặt pizza và khi giẫm gián (hạt vuông). Phần đó vẫn giữ được, vì Sprites chỉ thêm hạt chứ không thay thế. Nếu thấy quá nhiều hạt thì có thể bỏ hai lời gọi đó.

## 4. Tuỳ chọn: truyền toạ độ thế giới cho khung boss

Để bụi chạy trong khung boss khớp tuyệt đối (không phải suy từ ma trận), `OG.Player.draw` có thể truyền thêm:

```js
OG.Sprites.drawCharacter(ctx, p.charId, p.anim, p.animT, { ..., worldX: p.x + p.w / 2, worldY: p.y + p.h });
```

## 5. API mở rộng (bên gọi phải kiểm tra hàm tồn tại)

- `OG.Sprites.drawPortrait(ctx, charId, x, y, size, {skin, bg, ring, state, t, time})`: chân dung tròn, `x,y` là tâm, `size` là đường kính. Dùng cho chọn nhân vật, HUD trùm, bảng xếp hạng.
- `OG.Sprites.fx.dust(x, y, n)`, `fx.puff(x, y, n)`, `fx.sparkle(x, y, color)`, `fx.stars(x, y, n, color)`: toạ độ thế giới.
- `OG.Sprites.setCacheEnabled(bool)`, `setCacheLimit(n)`, `clearCache()`, `cacheStats()`.
- Trạng thái animation: `idle, run, walk, jump, fall, hurt, attack, victory, stunned, dead`. Trạng thái lạ sẽ quy về `idle`, hoặc theo bí danh `stun/dizzy`, `die/defeated`, `hit`, `win/celebrate`.
- Nhân vật đăng ký thêm qua `OG.Data.registerCharacter` có thể khai báo `sprite: 'cat' | 'bug' | 'crawler'`, `spriteBase: 'joey' | 'marky' | 'deedee'` (dáng trùm để mượn), và `style: {brows, lashes, bow, belly}` cho mèo.

## 6. Trang kiểm tra

Mở `docs/sprites-demo.html` để xem mọi nhân vật nhân mọi trạng thái, sân thử bụi, squash và hạt, cùng chân dung và đạo cụ. Thêm `?t=1.2` vào URL để cố định thời gian khi chụp ảnh.
