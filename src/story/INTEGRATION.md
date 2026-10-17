# story-ui → nhóm Tích hợp

Nhóm story-ui chỉ sửa `src/story/`. Các việc dưới đây nằm ngoài thư mục này, nhóm Tích hợp cần làm.

## File
- Không thêm script mới. `index.html` đã load đủ: `story.css` (trong `<head>`), sau đó `story.js → learn.js → guide.js → scenes.js` (mục 10).
- Trang xem thử: `src/story/story-demo.html` (cùng DOM và thứ tự script như `index.html`, thêm thanh công cụ để mở từng scene).
  Nếu muốn đặt ở `docs/story-demo.html` thì chép file sang và đổi tiền tố `../../` thành `../`.
  Khi thêm script mới vào `index.html` (ví dụ `src/gfx/decor-home.js`, `decor-places.js`), nhớ thêm vào trang demo.

## Menu (`src/ui/`)
- Nút `📖 PHIÊU LƯU HỌC TẬP` đã có (`menus.js`). Hợp đồng v2 đề nghị đưa nút này thành nút chính (to nhất, đặt trước `▶ CHƠI`).

## HUD
- `OG.Game.hud.pages = {have, total}` được cập nhật ở hook `learn`. Hook này cũng tự vẽ một pill trang sách trên canvas (14, 58).
  Nếu HUD DOM hiển thị `hud.pages`, có thể bỏ phần vẽ canvas trong `learnHook.drawScreen`.
- Các scene `card`, `quiz` và `comic` (khi `overlay`) được push lên trên màn chơi. Chúng ẩn HUD và nút cảm ứng lúc mở,
  rồi bật lại trong `exit(to)` khi `to` là `level` hoặc `boss`. Lý do: `level.resume()` hiện không bật lại HUD.
  Nếu sau này `level.resume()` tự bật HUD thì có thể bỏ `restoreChrome` trong `scenes.js`.

## Âm thanh (`src/audio/`), theo STORY.md mục 7
Hiện chưa có âm cho các event v2. Ánh xạ đề nghị:
`page:collect`→`collect`, `card:unlock`→`quest`, `quiz:answer{correct:false}`→âm nhẹ (không dùng âm "thua"),
`quiz:pass`→`victory` (ngắn), `gate:open`→`coin`, `guide:talk`→`click`, `comic:start`→`click`.

## Bàn phím
- Câu đố: chọn bắt đầu ở 0, đổi bằng ←→↑↓, chọn bằng Enter/Space/E. Phím số **1–3** (`num1..num3` trong `input.js`) chọn thẳng đáp án.
  Sau khi chọn sai, ô chọn đứng yên (smoke test dựa vào điều này).

## Dữ liệu hành trình (gửi nhóm journey-vietnam)
- Emoji cờ `🇻🇳` (cặp ký tự regional indicator) hiện thành chữ "VN" trên Windows (Segoe UI Emoji không có cờ quốc gia).
  Nên đổi `emoji` của hành trình sang ký tự khác, ví dụ `🏮` hoặc `⭐`.
