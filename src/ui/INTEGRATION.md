# src/ui — ghi chú cho agent Tích hợp

Module: `OG.Menus` (menus.js + hud.js), `OG.Shop` (shop.js), style `ui.css`.
Không cần thêm thẻ `<script>` hay `<link>` mới: dùng đúng 3 file stub và `ui.css` đã có trong `index.html`.

## Scene đã đăng ký trong `init()`
- `OG.Menus.init()`: `menu`, `charselect`, `settings`, `pause`, `gameover`, `victory`.
- `OG.Shop.init()`: `shop` (params: `back`, `backParams`, `tab: 'consumable'|'skin'|'char'`).
- `settings` có 2 chế độ: `go('settings', {back})` từ menu, hoặc `push('settings', {back:'pause', overlay:true})` từ pause
  (khi đó nút Xong gọi `pop()` và `pause.resume()` vẽ lại panel tạm dừng).

## Hook cần agent Tích hợp thêm (khuyến nghị)

1. **Nhảy đôi (Giày lò xo)**: `OG.Player` chưa hỗ trợ. Hiện `OG.Menus.drawHud` gọi `OG.Shop.tickPlayer(p, dt)` mỗi frame
   như phương án dự phòng (chạy được ở scene `level`). Đề nghị thêm vào cuối `OG.Player.update(p, dt, world)`
   (sau `moveBody`):
   ```js
   OG.util.call('Shop', 'tickPlayer', p, dt);
   ```
   `tickPlayer` tự chống gọi trùng trong cùng frame (theo `OG.time`) nên giữ cả hai chỗ gọi cũng không sao.
   Modifiers trả về từ `getLevelModifiers` có thêm field `doubleJump` (số lần nhảy trên không). `mergeMods` cộng dồn nó
   như các field số khác. Player có thể đọc `mods.doubleJump` trực tiếp nếu muốn tự xử lý; khi đó bỏ lời gọi `tickPlayer`.
2. **Player trong trận trùm**: để nhảy đôi chạy được ở scene `boss` khi chưa có hook (1), hãy mở rộng
   `OG.BossScene` trong `src/game/boss-scene.js`:
   ```js
   getPlayer: function () { return S ? S.arena.player : null; }
   ```
   HUD đã kiểm tra `OG.BossScene.getPlayer` nếu hàm này tồn tại. Nếu đã làm (1) thì không cần bước này.
3. **firstGesture khi bấm panel DOM**: `OG.Input` chỉ phát `input:firstGesture` khi có keydown, pointerdown trên canvas
   hoặc trên nút `[data-key]`. Bấm nút trong `#overlay` (menu) thì không phát, nên nhạc menu có thể chưa bật được trên mobile.
   Đề nghị thêm `pointerdown` trên `document` (hoặc `#gameShell`) để gọi `firstGesture()`.
   Ngoài ra, module UI chặn `keydown` Enter/Space ở pha capture khi panel `.ui-panel` đang mở (để Enter bấm đúng nút đang focus
   thay vì luôn bấm nút primary của OG.DOM). Hệ quả: nếu phím đầu tiên người chơi bấm là Enter hoặc Space trong menu, Input
   sẽ không phát `input:firstGesture`. Các phím khác (mũi tên, WASD) vẫn tới được Input.

## Event mới
| Event | Payload | Ai phát | Ghi chú |
|---|---|---|---|
| `shop:use` | `{itemId, levelId\|null}` | OG.Shop | Khi một vật phẩm tiêu hao được dùng (heart lúc `newRun`, shield, boots, magnet lúc vào màn). Audio có thể phát `purchase` hoặc âm riêng. |

`player:jump` khi nhảy đôi có thêm `double: true`.

## Dữ liệu
- Skin bổ sung đăng ký lúc load qua `OG.Data.registerSkin`: `oggy_candy` (180), `jack_ice` (220), `olivia_night` (220).
- Save: ghi `selectedChar, unlockedChars, ownedSkins, equippedSkins, inventory` (đúng ngoại lệ trong hợp đồng),
  `settings` qua `OG.Save.setSetting`, và `ext.shop.loadout {itemId: bool}` (bật hoặc tắt "mang theo").
- `inventory` dùng các id: `shield`, `boots`, `magnet`, `heart`.

## Đặc tính nhân vật (Shop.getRunModifiers)
Chỉ số gốc giữ nguyên theo `src/data/characters.js` (hợp đồng mục 3). Khác biệt thêm được áp qua Modifiers:
- Oggy "Cân bằng": `scoreMul 1.1`.
- Jack "Da dày" (mạnh hơn, chậm hơn): `shield 1` ở mỗi màn và trận trùm. Speed 240, jump 625 theo data.
- Olivia "Nhẹ như mây" (nhảy cao hơn): `jumpMul 1.12`, tức lực nhảy khoảng 644, cao nhất đội. Speed 280 theo data.

Lưu ý: nhiệm vụ P2 mô tả Olivia "nhảy cao hơn", còn data ghi jump 575. Phần chênh được bù bằng `jumpMul`, không sửa data.

## Cách vật phẩm áp vào gameplay
- `getRunModifiers(charId)` (gọi trong `newRun`): perk + tiêu thụ 1 `heart` thì `extraLives: 1`.
- `getLevelModifiers(levelId, charId)`:
  - Gọi khi `OG.Scenes.current() === 'level'`: kích hoạt mới, tiêu thụ 1 `shield` / `boots` / `magnet` nếu có trong kho và đang bật mang theo.
  - Gọi từ scene `boss` của cùng màn: dùng lại, không tiêu thụ thêm. Khiên mua chỉ còn nếu chưa vỡ ở màn
    (theo dõi qua `player:hurt.shielded`).
  - Trả `{shield, magnet: 170, doubleJump}`. Player đã hỗ trợ sẵn `shield` và `magnet`.
