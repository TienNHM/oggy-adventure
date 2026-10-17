# src/bosses — ghi chú tích hợp (nhóm Bosses)

## Không cần sửa index.html
Vẫn dùng đúng 5 file stub theo thứ tự load hiện có:
`bosses.js` → `joey.js` → `marky.js` → `deedee.js` → `trio.js` (trio dùng `OG.Bosses.factories` của 3 file trước).
Không có file mới, không có CSS.

## Tương thích scene `boss` (src/game/boss-scene.js)
Đã chạy được với scene hiện tại, không cần sửa. Scene vẫn lo: giẫm weakspot, chạm hurtbox,
phát `boss:start` / `boss:hit` / `boss:defeated`, +100/+500 điểm.
Trùm tự lo: AI, đạn và bẫy (`arena.hurtPlayer('projectile')`), phát `boss:phase`, gọi lính qua `arena.spawnEnemy`.

Chi tiết cần biết:
- `getHurtboxes()` trả về `[]` trong 0,9 s sau khi trùm trúng đòn, để người chơi vừa giẫm xong
  không bị thương oan khi rơi lại xuống.
- Khi người chơi **đánh bật đạn** (nhấn `action` gần nắp chai hoặc cờ lê) và đạn trúng trùm, OG.Bosses tự gọi `onHit`,
  tự `arena.addScore(100)` và tự phát `boss:hit` với payload `{bossId, hp, maxHp, source:'reflect'}`.
  Scene đồng bộ `hud.boss.hp` mỗi frame nên không cần sửa gì.
- `trio.onHit(dmg, arena, member?)` có thêm tham số thứ 3, tuỳ chọn. Scene gọi `onHit(1, arena)` vẫn đúng.
- Dee Dee có thể **hồi máu**. `hp` tăng thì scene vẫn đồng bộ HUD được, vì nó chỉ so sánh `hud.boss.hp !== boss.hp`.
- Khi trùm gục, lính gián còn sống được ẩn đi (`alive=false`, `deadT=0.6`).

## Event mới (do module tự phát, không bắt buộc ai nghe)
| Event | Payload | Gợi ý |
|---|---|---|
| `boss:heal` | `{bossId, hp, maxHp}` | Dee Dee ăn bánh hồi 1 máu. Audio có thể phát `collect` hoặc `quest` |
| `boss:foodStolen` | `{bossId}` | Người chơi giật bánh của Dee Dee (+50 điểm). Audio có thể phát `coin` |

Có thể thêm `BOSS_HEAL: 'boss:heal'` và `BOSS_FOOD_STOLEN: 'boss:foodStolen'` vào `OG.EV` cho tiện (không bắt buộc).

## Input
Đánh bật đạn dùng phím logic `action` (E/J, nút ✦), nghe qua event `player:action`. OG.Bosses đăng ký listener ngay khi load
(chỉ dùng OG.Events, không đụng Save). Mỗi cú vung có hồi chiêu 0,5 s.

## Arena (OG.Bosses.getArena)
| Trùm | theme | platforms (ngoài sàn) |
|---|---|---|
| deedee | kitchen | `[220,370,150,18]`, `[590,370,150,18]`: đặt xa tường vì Dee Dee choáng sát tường |
| marky | garden | `[130,370,160,18]`, `[670,370,160,18]` |
| joey | roof | `[120,370,170,18]`, `[670,370,170,18]`, `[395,265,170,18]` |
| trio | lair | `[100,370,150,18]`, `[710,370,150,18]`, `[405,275,150,18]` |

Mọi arena rộng 960, spawn `{x:80, y:420}`. Platform là một chiều nên trùm đứng dưới bục sẽ không giẫm được.
Vì vậy Marky luôn chọn điểm đập đất nằm ngoài vùng dưới bục (`kit.clearSpot`).

## API mở rộng (tuỳ chọn)
- `OG.Bosses.start(bossId, arenaLike)`, `update(dt)`, `draw(ctx)`, `stop()`, `active()`: bộ điều khiển trận độc lập,
  tự xử lý giẫm, chạm và phát `boss:start/hit/defeated`. **Scene `boss` hiện tại KHÔNG được gọi các hàm này**,
  nếu gọi thì event sẽ bị phát hai lần. Chỉ dành cho scene khác muốn giao toàn bộ trận cho OG.Bosses.
- `OG.Bosses.factories[id](arena, cfg)`: tạo trùm với cấu hình riêng (scale, maxHp, phaseAt, speedMul...).
- `OG.Bosses.kit`: tiện ích vẽ telegraph, đạn và khung trùm dùng chung.

## Gợi ý cho Sprites
Trùm gọi `OG.Sprites.drawCharacter(ctx, id, anim, t, {face, scale, w, h, flash, alpha, time, vx, vy})`, trong đó `w,h` là
kích thước gốc trong `OG.Data` (ví dụ joey 30×40) và `scale` khoảng 1,5–2.
- animState dùng: `idle, run, jump, fall, hurt, attack, victory`.
- Các trạng thái `walk, stunned, dead, roll` chỉ được dùng nếu `getAnimStates()` có liệt kê. Nếu không, chúng tự quy về `run`/`hurt`/`attack`.
- Nếu `drawCharacter` ném lỗi, trùm chuyển sang hình vẽ dự phòng.
