# Oggy Adventure

Game phiêu lưu đi cảnh 2D chạy thẳng trên trình duyệt. Oggy phải lấy lại đồ ăn từ tay ba chú gián Joey, Marky và Dee Dee: đi qua từng phòng trong nhà, nhặt pizza để mở cửa, giẫm gián và hạ trùm.

Game viết bằng HTML5 Canvas và JavaScript thuần. Không có bước build, không dùng thư viện ngoài, không có file ảnh hay âm thanh: hình được vẽ bằng Canvas, tiếng được tổng hợp bằng Web Audio API.

> **Lưu ý bản quyền:** Đây là sản phẩm fan-made, phi thương mại, không liên quan tới chủ sở hữu thương hiệu *Oggy and the Cockroaches* (Xilam). Tên và hình tượng nhân vật thuộc về chủ sở hữu. Nếu muốn phát hành công khai hoặc thương mại, hãy thay nhân vật, tên và mọi yếu tố có bản quyền bằng thiết kế nguyên bản hoặc đã được cấp phép.

## Tính năng

- **Bản đồ thế giới "Ngôi nhà của Oggy"** gồm 4 khu vực chính: Nhà bếp → Khu vườn → Mái nhà → Hang ổ. Ngoài ra có 3 màn phụ không bắt buộc: Tầng hầm, Phòng tắm, Gác mái. Màn sau mở khoá khi xong màn trước.
- **4 trận trùm:** Dee Dee (lăn, ăn bánh hồi máu), Marky (đặt bẫy, đập búa, ném cờ lê), Joey (lao, ném nắp chai, gọi gián con). Trận cuối là cả bộ ba cùng lúc. Trùm nào cũng báo trước đòn đánh. Muốn hạ trùm thì giẫm lên đầu khi có mũi tên vàng **"GIẪM!"**, hoặc bấm E/J để đánh bật nắp chai và cờ lê về phía nó.
- **Kẻ địch trong màn:** gián con đi tuần. Ba chú gián cũng xuất hiện trong màn: Joey lao nhanh, Marky nhảy cò cò, Dee Dee hay đứng lại ăn.
- **3 nhân vật:**
  - Oggy: +10% điểm.
  - Jack: vào màn nào cũng có sẵn 1 khiên. Mở khoá bằng xu.
  - Olivia: nhảy cao hơn. Mở khoá khi qua Khu vườn.
- **Skin và cửa hàng:** mua skin bằng xu. Vật phẩm gồm khiên bong bóng, giày lò xo (nhảy đôi), nam châm (hút pizza/xu) và tim dự phòng (+1 mạng).
- **Nhiệm vụ:**
  - Mỗi màn có nhiệm vụ riêng (ăn hết pizza, không bị thương, về đích nhanh…).
  - Mỗi ngày có 3 nhiệm vụ mới, kèm thêm các thành tựu lâu dài.
  - Mỗi màn chấm tối đa 3 sao.
- **Bảng xếp hạng:** lưu trên máy. Có thẻ thành tích để chia sẻ hoặc tải về dạng ảnh PNG. Bảng xếp hạng online là tuỳ chọn, xem `src/social/INTEGRATION.md`.
- **Âm thanh:** mỗi khu vực, trận trùm, menu và bản đồ có nhạc nền riêng, kèm hiệu ứng âm thanh. Chỉnh âm lượng hoặc tắt tiếng trong Cài đặt.
- **Lưu tiến độ** tự động bằng `localStorage`: xu, màn đã mở, sao, skin, nhiệm vụ, bảng xếp hạng. Trình duyệt chặn `localStorage` thì game vẫn chơi được, chỉ là không lưu.
- **Tạm dừng:** bấm Esc/P hoặc nút ⏸. Game cũng tự dừng khi chuyển tab hay cửa sổ mất focus.

## Điều khiển

| Thao tác | Bàn phím (PC) | Cảm ứng (mobile) |
|---|---|---|
| Đi trái / phải | ← → hoặc A D | ◀ ▶ |
| Nhảy (nhảy đôi khi có giày lò xo) | Space, W hoặc ↑ | ⬆ |
| Tương tác / đánh bật đồ ném của trùm | E hoặc J | ✦ |
| Tạm dừng / tiếp tục | Esc hoặc P | nút ⏸ trên đầu màn hình |
| Bật / tắt tiếng | M | Cài đặt → Tắt tiếng |

Trong menu và bản đồ:
- Chọn: mũi tên hoặc WASD.
- Xác nhận: Enter hoặc Space.
- Quay lại: Esc.
- Mở bảng nhiệm vụ trên bản đồ: E.
- Trên điện thoại: chạm vào màn để đi tới, chạm lần nữa để vào chơi.

Các nút cảm ứng tự hiện trên thiết bị cảm ứng. Muốn bật/tắt cố định thì vào **Cài đặt → Nút cảm ứng**. Trên điện thoại nên xoay ngang màn hình.

### Hướng dẫn chơi nhanh

1. Bấm **▶ CHƠI**, chọn khu vực trên bản đồ rồi bấm Enter.
2. Nhặt đủ số pizza ghi ở góc trên bên trái (🍕 x/y). Đủ rồi thì cửa **EXIT** cuối màn sẽ mở.
3. Giẫm lên gián để tiêu diệt chúng. Chạm ngang vào gián sẽ mất 1 mạng ❤️.
4. Đi qua cửa EXIT để vào trận trùm. Né đòn theo dấu báo trước (chấm than, vùng đỏ, bóng đổ). Khi thấy mũi tên vàng "GIẪM!" thì nhảy lên đầu trùm.
5. Hạ được cả bộ ba ở Hang ổ là thắng. Sau đó nhập tên để lưu điểm lên bảng xếp hạng.

## Chạy game

**Cách 1: mở file trực tiếp.** Nhấp đúp vào `index.html` để mở bằng Chrome, Edge, Firefox hoặc Safari. Game không dùng ES modules nên chạy được qua `file://`.

**Cách 2: dùng server tĩnh.** Một số trình duyệt chặn `localStorage` khi mở qua `file://`, cách này tránh được chuyện đó. Chọn một trong hai lệnh:

```bash
python -m http.server 8080
# hoặc
npx serve .
```

Sau đó mở http://localhost:8080.

## Kiểm thử

```bash
node tests/smoke.js            # chạy toàn bộ luồng game trong Node, thoát mã 1 nếu có lỗi
node tests/smoke.js --verbose  # in từng bước và số lần phát mỗi event
node --check src/core/main.js  # kiểm tra cú pháp một file
```

Không cần cài gì thêm, Node 20 trở lên là đủ.

Smoke test làm những việc sau:
- Dựng DOM, canvas, `localStorage` và `AudioContext` giả (`tests/fake-dom.js`).
- Nạp mọi script đúng thứ tự trong `index.html`.
- Chơi bằng phím, chạm và click qua cả luồng: menu → cài đặt/nhân vật/cửa hàng/xếp hạng → bản đồ → 4 màn + 4 trùm → chiến thắng → nhập tên → bảng xếp hạng. Sau đó chơi thêm màn phụ, game over và chơi lại.
- Chạy thêm các kiểm tra hồi quy (`qaChecks`): tạm dừng, nhạc theo scene, vật phẩm, lưu dữ liệu, rò rỉ listener.

Test chỉ kiểm tra lỗi runtime và lỗi luồng chơi. Hình ảnh, độ khó và âm thanh vẫn phải thử bằng tay.

## Deploy

Đây là site tĩnh: chỉ cần tải lên `index.html`, `src/` và (nếu muốn) `docs/`. Không có bước build.

- **GitHub Pages (đã cấu hình):** `.github/workflows/pages.yml` chạy mỗi khi push lên nhánh `master`.
  1. Chạy `node tests/smoke.js`. Test đỏ thì dừng, không deploy.
  2. Đóng gói `index.html`, `src/`, `docs/`, `CNAME`, `.nojekyll`.
  3. Deploy lên Pages với tên miền trong file `CNAME`.

  Lần đầu dùng, vào **Settings → Pages → Source** và chọn **GitHub Actions**.
- **Cloudflare Pages / Netlify / Vercel:** tạo project kiểu static, để trống build command, output directory là thư mục gốc (nơi có `index.html`). Có thể dùng Direct Upload với cả thư mục.
- **Hosting tĩnh bất kỳ** (nginx, S3…): chép nguyên các file lên là chạy.

## Cấu trúc thư mục

```
index.html              Khung HTML/CSS, HUD, nút cảm ứng, danh sách <script> theo thứ tự load
src/
  core/                 Namespace OG, event bus, Save (localStorage), Input, Camera, Physics, DOM, Scenes, Loop, main.js (khởi động, load cuối)
  data/                 Dữ liệu nhân vật/skin (characters.js) và 4 màn chính (levels.js)
  gfx/                  Sprite nhân vật vẽ bằng Canvas (sprites.js), skin phụ kiện (skins.js), nền và trang trí từng khu vực (scenery.js)
  audio/                Engine âm thanh + hiệu ứng (audio.js), nhạc nền tổng hợp (music.js)
  game/                 Gameplay: player, kẻ địch, vật phẩm, hạt, tiến độ, lượt chơi, scene màn chơi và scene trận trùm
  bosses/               Bộ khung trùm dùng chung (bosses.js) và từng trùm: deedee.js, marky.js, joey.js, trio.js
  world/                Bản đồ thế giới (world.js), 3 màn phụ (extraLevels.js), nhiệm vụ và thành tựu (quests.js)
  ui/                   Menu, chọn nhân vật, cài đặt, tạm dừng, kết quả (menus.js), HUD (hud.js), cửa hàng (shop.js), ui.css
  social/               Thẻ thành tích, chia sẻ (social.js), bảng xếp hạng (leaderboard.js), social.css
tests/                  Smoke test Node: smoke.js, fake-dom.js
docs/                   ARCHITECTURE.md (kiến trúc, hợp đồng API, danh sách event), ví dụ worker bảng xếp hạng online, trang demo sprite
legacy/index.mvp.html   Bản MVP một file ban đầu (chỉ để tham khảo)
.github/workflows/      CI: smoke test và deploy GitHub Pages
```

Mỗi file JS là một IIFE và tự đăng ký vào `window.OG` (ví dụ `OG.Audio`, `OG.World`). Muốn thêm màn hoặc skin thì gọi `OG.Data.registerLevel` / `OG.Data.registerSkin` trong một file được load trước `src/core/main.js`. Chi tiết xem `docs/ARCHITECTURE.md`.
