# Oggy Adventure

Game phiêu lưu 2D chạy trực tiếp trên trình duyệt, không cần cài engine hoặc backend.

## Chạy local
- Cách nhanh: mở `index.html` bằng Chrome, Edge hoặc Firefox.
- Hoặc chạy server tĩnh:
  - Python: `python -m http.server 8080`
  - Mở http://localhost:8080

## Điều khiển
- PC: A/D hoặc phím mũi tên trái/phải để di chuyển; Space/W/↑ để nhảy.
- Mobile: dùng các nút trên màn hình.
- Thu thập đủ pizza để mở cửa sang màn tiếp theo.

## Nội dung
- 3 màn phiêu lưu: Nhà bếp, Khu vườn, Mái nhà.
- Kẻ địch tuần tra, va chạm, 3 mạng, điểm số và lưu kỷ lục bằng LocalStorage.
- Canvas tự vẽ, không phụ thuộc thư viện hoặc asset bên ngoài.

## Deploy
Đưa thư mục này lên Cloudflare Pages (Direct Upload) hoặc bất kỳ static hosting nào. Build command và output directory không cần cấu hình; thư mục gốc chứa `index.html`.

Lưu ý: Đây là bản fan-made không chính thức; nếu phát hành công khai/thương mại, hãy thay nhân vật, tên và tài sản có bản quyền bằng thiết kế được cấp phép hoặc nguyên bản.

## Cấu trúc mã nguồn
- `index.html`: khung HTML/CSS và danh sách `<script>` theo thứ tự load. Không dùng ES modules nên game chạy được qua `file://`.
- `src/core/`: namespace `OG`, event bus, lưu trữ, input, camera, vật lý, scene, vòng lặp, khởi động.
- `src/data/`: dữ liệu màn chơi và nhân vật/skin.
- `src/game/`: gameplay (player, kẻ địch, vật phẩm, màn, trận trùm, scene mặc định).
- `src/gfx/`, `src/audio/`, `src/bosses/`, `src/world/`, `src/ui/`, `src/social/`: các module tính năng.
- `legacy/index.mvp.html`: bản MVP gốc một file (lưu tham khảo).
- Hợp đồng API, danh sách event và quyền sở hữu file: xem `docs/ARCHITECTURE.md`.
