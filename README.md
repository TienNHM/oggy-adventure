# Oggy Adventure

Game phiêu lưu 2D chạy trực tiếp trên trình duyệt, không cần cài engine hoặc backend.

## Chạy local
- Cách nhanh: mở `index.html` bằng Chrome, Edge hoặc Firefox.
- Hoặc chạy server tĩnh:
  - Python: `python -m http.server 8080`
  - Mở http://localhost:8080

## Điều khiển
- PC: A/D hoặc ←/→ để di chuyển; Space/W/↑ để nhảy; E/J để tương tác (đánh bật đạn của trùm); Esc/P để tạm dừng; M để bật/tắt tiếng.
- Menu và bản đồ: mũi tên/WASD để chọn, Enter/Space để xác nhận, Esc để quay lại.
- Mobile: dùng các nút ◀ ▶ ✦ ⬆ trên màn hình và nút ⏸ để tạm dừng.
- Thu thập đủ pizza để mở cửa EXIT, rồi đánh bại trùm gián ở cuối mỗi khu vực.

## Nội dung
- Bản đồ thế giới với 4 khu vực chính (Nhà bếp, Khu vườn, Mái nhà, Hang ổ) và 3 màn phụ (Tầng hầm, Phòng tắm, Gác mái).
- 4 trận trùm: Dee Dee, Marky, Joey và trận cuối cả bộ ba; bộ ba gián cũng đi tuần trong các màn.
- 3 nhân vật (Oggy, Jack, Olivia) với đặc tính riêng, skin, cửa hàng vật phẩm (khiên, giày lò xo, nam châm, tim).
- Nhiệm vụ màn, nhiệm vụ hằng ngày và thành tựu; sao và kỷ lục từng màn.
- Bảng xếp hạng trên máy, thẻ thành tích chia sẻ được; nhạc nền và hiệu ứng âm thanh tổng hợp bằng Web Audio.
- Mọi hình vẽ bằng Canvas, không phụ thuộc thư viện hoặc asset bên ngoài. Tiến độ lưu bằng LocalStorage.

## Kiểm thử
- `node tests/smoke.js`: smoke test chạy toàn bộ luồng game trong Node (DOM/canvas giả, không cần cài gì).
- Bảng xếp hạng online (tuỳ chọn): xem `src/social/INTEGRATION.md` và `docs/leaderboard-worker.example.js`.

## Deploy
Đưa thư mục này lên Cloudflare Pages (Direct Upload) hoặc bất kỳ static hosting nào. Build command và output directory không cần cấu hình; thư mục gốc chứa `index.html`.

Lưu ý: Đây là bản fan-made không chính thức; nếu phát hành công khai/thương mại, hãy thay nhân vật, tên và tài sản có bản quyền bằng thiết kế được cấp phép hoặc nguyên bản.

## Cấu trúc mã nguồn
- `index.html`: khung HTML/CSS và danh sách `<script>` theo thứ tự load. Không dùng ES modules nên game chạy được qua `file://`.
- `tests/`: smoke test Node (`smoke.js`, `fake-dom.js`).
- `src/core/`: namespace `OG`, event bus, lưu trữ, input, camera, vật lý, scene, vòng lặp, khởi động.
- `src/data/`: dữ liệu màn chơi và nhân vật/skin.
- `src/game/`: gameplay (player, kẻ địch, vật phẩm, màn, trận trùm, scene mặc định).
- `src/gfx/`, `src/audio/`, `src/bosses/`, `src/world/`, `src/ui/`, `src/social/`: các module tính năng.
- `legacy/index.mvp.html`: bản MVP gốc một file (lưu tham khảo).
- Hợp đồng API, danh sách event và quyền sở hữu file: xem `docs/ARCHITECTURE.md`.
