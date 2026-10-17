# Social: ghi chú cho nhóm Tích hợp

## Không cần sửa index.html
Code nằm trong 2 file stub đã có: `src/social/social.js` và `src/social/leaderboard.js` (đúng thứ tự load hiện tại),
cùng `src/social/social.css`. Không thêm file script mới.

## Các điểm nối
- `main.js` gọi `OG.Social.init()`. Hàm này nghe event và đăng ký scene `leaderboard`.
- Scene `gameover` / `victory` gọi `OG.Social.mountResult(panelEl, result)`. Khối Social được chèn **trước** hàng
  `.actions` (hoặc `.ui-actions`) của panel và không xoá nút nào.
- Menu chính nên có nút vào bảng xếp hạng: `OG.Scenes.go('leaderboard', {back: 'menu'})`
  (nhóm Menus kiểm tra `OG.Scenes.has('leaderboard')`).
- Params của scene leaderboard: `{back, backParams, highlightId, tab: 'local'|'online'}`. Thoát bằng Esc hoặc nút QUAY LẠI,
  khi đó gọi `OG.Scenes.go(back, backParams)`. Nếu mở từ panel kết quả thì `backParams = {result}`, nên scene
  gameover/victory sẽ được dựng lại với cùng RunResult. Điểm không bị lưu trùng vì có khoá theo result.

## Event mới (Social tự phát, không cần core)
| Event | Payload |
|---|---|
| `social:share` | `{method: 'share'\|'clipboard'\|'execCommand'\|'cancel'\|null, ok}` |
| `social:nameChange` | `{name}` |
| `social:onlineSubmit` | `{entry, ok, rank}` (chỉ khi bật backend online) |
| `leaderboard:clear` | `{}` |
| `leaderboard:submit` | như hợp đồng; thêm `rename: true` khi chỉ đổi tên mục đã lưu |

Gợi ý cho Audio: phát `click` hoặc `quest` khi nhận `social:share` có `ok: true` (không bắt buộc).

## Hành vi lưu điểm
- Khi nhận `game:over` / `game:victory`, nếu người chơi đã có tên và `score > 0` thì điểm được tự lưu.
  Nếu chưa có tên, panel kết quả sẽ hiện ô nhập tên.
- Đổi tên sau khi đã lưu chỉ cập nhật mục cũ (theo `id`), không tạo mục mới.
- Entry lưu thêm các trường `id, stars, skinId, levelName`. `stars` là tổng sao của lượt chơi, lấy từ các `level:complete` trong lượt.

## Leaderboard online (tuỳ chọn, mặc định TẮT)
- Adapter nằm ở `OG.Social.backend`. Đăng ký backend tuỳ biến bằng `registerBackend({id, name, online, submit, list})`, sau đó gọi `setBackend(id)`.
- Có sẵn backend HTTP. Có 3 cách bật:
  `window.OG_LEADERBOARD_URL = 'https://...'` (đặt trước `main.js`), `OG.Config.LEADERBOARD_URL`,
  hoặc `OG.Social.useOnline(url, {persist: true})`.
- Máy chủ mẫu (Cloudflare Worker + KV): `docs/leaderboard-worker.example.js`. Game không load file này.
