# World & Quests: ghi chú tích hợp

## 1. Thẻ script mới (nhóm Tích hợp thêm vào index.html)

```html
<script src="src/world/extraLevels.js"></script>   <!-- NGAY TRƯỚC src/world/world.js -->
<script src="src/world/world.js"></script>
<script src="src/world/quests.js"></script>
```

- `extraLevels.js` gọi `OG.Data.registerLevel` cho 3 màn phụ ngay lúc load file: `basement` (Tầng hầm), `bathroom` (Phòng tắm), `attic` (Gác mái).
  File này phải load sau `src/data/levels.js` và trước `src/core/main.js`, để `OG.Progress.init()` thấy được các màn mới.
- File không đụng tới `OG.Save`. Nó chỉ tạo `OG.World.extraLevels`. `world.js` giữ lại field đó vì dùng `OG.World = OG.World || {}`.
- Các màn phụ được nối thêm vào cuối `OG.Data.levels`, nên mỗi màn đều ghi tường minh `requires` (kitchen, garden, roof) và `final: false`.
  Nhờ vậy `Progress.isFinal` vẫn coi `lair` là màn cuối và luồng chiến thắng không đổi.
- Nếu chưa thêm thẻ script này, bản đồ vẫn chạy bình thường với 4 màn gốc.

## 2. Field LevelDef mở rộng (chỉ World đọc, không bắt buộc)

- `zone`: tên khu vực hiện trên bản đồ.
- `mapStyle`: kiểu vẽ ô khu vực. Giá trị: `kitchen`, `garden`, `roof`, `lair`, `basement`, `bathroom`, `attic`.
- `bonus: true`: đánh dấu màn phụ.

Màn gốc không có các field này. World tự suy ra từ `theme`.

## 3. Event mới

| Event | Payload | Ai phát | Ghi chú |
|---|---|---|---|
| `world:select` | `{levelId}` | World | Phát khi bắt đầu vào màn từ bản đồ, trước hiệu ứng khép màn 0,5s. |
| `world:arrive` | `{levelId}` | World | Oggy đi tới một nút trên bản đồ. Audio có thể phát tiếng bước chân. |

`quest:complete` có thêm field `category` (`level`, `daily` hoặc `achievement`) và `levelId`. Các field cũ trong hợp đồng giữ nguyên.

## 4. Âm thanh

- Chọn nút, bấm nút trên bản đồ và đóng/mở bảng nhiệm vụ: World phát `ui:click` (`id` có tiền tố `world_`).
- Bấm vào màn đang khoá: World gọi trực tiếp `OG.util.call('Audio', 'sfx', 'locked')`, vì không có event chuẩn cho trường hợp này. Audio không cần nghe thêm event nào.

## 5. HUD (Menus)

- `OG.Quests.getHudLines(levelId)` trả về `{id, text, done, progress, target, failed}`. Field `failed` là phần thêm: bằng `true` khi nhiệm vụ không còn đạt được trong lượt này (đã bị thương, quá giờ).
- Tiến độ trực tiếp được đọc từ `OG.Game.stage` nên luôn khớp với lần gọi `refreshHud()`.
- Mỗi màn chưa có nhiệm vụ `time_under` sẽ được thêm tự động nhiệm vụ "Về đích dưới X giây" (id `<levelId>_auto_time`).

## 6. Scene

- `worldmap` được đăng ký trong `OG.World.init()`. Khi vào scene: ẩn HUD, ẩn nút cảm ứng, đóng panel.
- Các nút trên canvas: Menu → `go('menu')`; Nhân vật → `go('charselect', {back:'worldmap'})` nếu scene tồn tại; Cửa hàng → `go('shop', {back:'worldmap'})` nếu scene tồn tại.
- Với `params.completed`, scene hiện banner kết quả (sao, xu, nhiệm vụ vừa xong, màn vừa mở khoá), sau đó Oggy tự đi tới màn kế tiếp.
- Đổi con trỏ chuột của `OG.canvas` khi hover và trả lại như cũ khi `exit`.

## 7. Lưu trữ

- Toàn bộ dữ liệu nằm trong `OG.Save.ns('quests')`: `{levels, global, daily:{date, ids, prog}, seeded}`.
- Thưởng được trao tự động bằng `OG.Save.addCoins(n, 'quest')`. Vì vậy `claim()` thường trả về `false`.
- Thành tựu lấy giá trị ban đầu một lần từ `Save.data.stats`: stomps, pizzas, bossesDefeated.
