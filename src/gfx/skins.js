// @ts-check
/* ============================================================================
 * OG.Sprites.skinGfx — BẢNG PHỤ KIỆN THEO SKIN + ĐĂNG KÝ SKIN MỚI CỦA OGGY
 * ----------------------------------------------------------------------------
 * Vai trò:      Khai báo skin (bộ trang phục) nào vẽ thêm phụ kiện gì (mũ, áo choàng, khăn...), và đăng ký
 *               các skin mới của Oggy vào OG.Data để Shop bán được. Chạy MỘT LẦN lúc load file.
 * Khái niệm:    data-driven design (thiết kế hướng dữ liệu: muốn thêm skin chỉ cần thêm 1 dòng dữ liệu,
 *               không sửa hàm vẽ) · tách "dữ liệu" (file này) khỏi "bộ vẽ" (sprites.js) · registry (sổ đăng ký)
 *               · đăng ký phòng thủ (không ghi đè, bọc try/catch)
 * Bài học:      docs/learn/07-ve-canvas-procedural-cache.md, docs/learn/12-data-driven-man-cau-do-hanh-trinh.md
 * Phụ thuộc:    OG.Data.registerSkin / OG.Data.getSkin (đọc lúc LOAD — nên load SAU src/data/characters.js).
 *               Load SAU src/gfx/sprites.js, TRƯỚC scenery.js; nhưng thứ tự với sprites.js không bắt buộc
 *               vì file tự tạo OG.Sprites nếu chưa có.
 * Event:        (không)
 * API công khai: OG.Sprites.skinGfx[skinId], OG.Sprites.OGGY_SKINS
 * Đọc tiếp:     src/gfx/sprites.js (hàm skinGfx() đọc bảng này, drawCat() vẽ từng phụ kiện)
 *               → src/data/characters.js (định nghĩa skin gốc, resolveColors)
 * Dữ liệu:      SkinGfx (typedef bên dưới), skin = {id, charId, name, price, desc, colors, gfx}
 *
 * Skin của Oggy (id dùng trong Save.equippedSkins / Shop):
 *   oggy_default   Cổ điển            — mèo xanh nguyên bản
 *   oggy_chef      Oggy Đầu Bếp       — mũ đầu bếp, tạp dề, khăn cổ đỏ, dép trắng
 *   oggy_super     Siêu Mèo Oggy      — áo choàng đỏ bay, mặt nạ, huy hiệu ngôi sao, thắt lưng vàng, ủng đỏ
 *   oggy_ninja     Oggy Ninja         — lông tối, băng đô đỏ có dải bay, khăn che mặt (skin có sẵn trong data)
 *   oggy_gold      Oggy Hoàng Kim     — lông vàng + vương miện (skin có sẵn trong data)
 *   oggy_explorer  Oggy Thám Hiểm     — mũ thám hiểm + ba lô (v2, hành trình Vòng quanh thế giới)
 *   oggy_astronaut Oggy Phi Hành Gia  — mũ kính + áo du hành + bình dưỡng khí (v2, Khoa học & Vũ trụ)
 *   oggy_scientist Oggy Nhà Khoa Học  — áo blouse trắng + kính bảo hộ trên trán (v2)
 *
 * Hợp đồng: skin đăng ký sau có thể tự khai báo trường `gfx` trong đối tượng skin; Sprites ưu tiên skin.gfx
 * hơn bảng skinGfx ở đây. Phụ kiện chỉ áp cho nhân vật dạng mèo.
 * ========================================================================== */

/**
 * Phụ kiện vẽ thêm của một skin. Mọi trường đều tuỳ chọn; màu là chuỗi '#rrggbb'.
 * @typedef {Object} SkinGfx
 * @property {'chef'|'crown'|'beret'} [hat]  loại mũ của skin
 * @property {string} [hatColor]
 * @property {string} [cape]      màu áo choàng (bay theo tư thế)
 * @property {string} [mask]      màu mặt nạ che mắt
 * @property {string} [emblem]    màu huy hiệu ngôi sao trên ngực
 * @property {string} [belt]      màu thắt lưng
 * @property {string} [belly]     màu bụng (đè màu mặc định)
 * @property {string} [headband]  màu băng đô ninja
 * @property {string} [faceMask]  màu khăn che mặt (che luôn mũi + miệng)
 * @property {boolean} [apron]    có tạp dề
 * @property {string} [scarf]     màu khăn cổ tam giác
 * @property {boolean} [bow]      có nơ (dùng màu accent của nhân vật)
 * @property {string} [coat]      màu áo blouse
 * @property {boolean} [goggles]  kính bảo hộ đẩy lên trán
 * @property {'nonla'|'beret'|'helmet'|'scarf'|'spacesuit'|'explorer'} [accessory]
 *           phụ kiện hành trình; opts.accessory của drawCharacter được ưu tiên hơn trường này
 */
(function () {
  'use strict';
  // Ép kiểu any: `window.OG || {}` làm tsc suy ra kiểu {} rỗng và báo lỗi mọi truy cập OG.X.
  var OG = /** @type {any} */ (window.OG = window.OG || {});
  // 💡 Khái niệm: "stub rồi ghi đè" — tạo OG.Sprites nếu sprites.js chưa chạy, để thứ tự <script> giữa
  //   hai file không quan trọng. sprites.js cũng viết `OG.Sprites = OG.Sprites || {}` nên không xoá mất dữ liệu này.
  var S = /** @type {any} */ (OG.Sprites = OG.Sprites || {});

  // ---------------------------------------------------------------------------
  // Bảng phụ kiện: skinId -> SkinGfx
  // ---------------------------------------------------------------------------
  // 🧪 Thử: đổi oggy_default thành { hat: 'crown', cape: '#7ed957' } rồi mở docs/sprites-demo.html —
  //   Oggy cổ điển đội vương miện và khoác áo choàng xanh lá, không cần sửa dòng code vẽ nào.
  /** @type {Object<string, SkinGfx>} */
  var GFX = {
    oggy_default: {},
    oggy_chef: { hat: 'chef', apron: true, scarf: '#e5484d' },
    oggy_super: { cape: '#e5484d', mask: '#e5484d', emblem: '#ffc94a', belt: '#ffc94a' },
    oggy_ninja: { headband: '#e5484d', faceMask: '#1d2029', belly: '#4a5160' },
    oggy_gold: { hat: 'crown', hatColor: '#ffd84a', belly: '#fff3c4' },
    oggy_explorer: { accessory: 'explorer' },
    oggy_astronaut: { accessory: 'spacesuit' },
    oggy_scientist: { coat: '#ffffff', goggles: true },
    jack_army: { hat: 'beret', hatColor: '#4f5d33' },
    olivia_rose: { bow: true }
  };

  /** @type {Object<string, SkinGfx>} */
  S.skinGfx = S.skinGfx || {};
  // Chỉ điền id còn trống: nếu module khác (hoặc bản mod) đã đặt phụ kiện cho skin này thì giữ nguyên của họ.
  for (var k in GFX) if (!S.skinGfx[k]) S.skinGfx[k] = GFX[k];

  /** Danh sách id skin của Oggy mà Sprites vẽ được (Shop/Menus/trang demo đọc để liệt kê). */
  S.OGGY_SKINS = ['oggy_default', 'oggy_chef', 'oggy_super', 'oggy_ninja', 'oggy_gold',
    'oggy_explorer', 'oggy_astronaut', 'oggy_scientist'];

  // ---------------------------------------------------------------------------
  // Skin mới — đăng ký vào OG.Data (registry skin của game)
  // ---------------------------------------------------------------------------
  // `colors` chỉ ghi các màu KHÁC bản gốc; OG.Data.resolveColors gộp chúng lên màu mặc định của nhân vật.
  // `gfx` trỏ thẳng vào bảng GFX ở trên để hai nơi không lệch nhau.
  var NEW_SKINS = [
    {
      id: 'oggy_chef', charId: 'oggy', name: 'Oggy Đầu Bếp', price: 150,
      desc: 'Mũ đầu bếp trắng tinh, sẵn sàng nấu cả nồi pizza.',
      colors: { feet: '#eef2f7', belly: '#ffffff' },
      gfx: GFX.oggy_chef
    },
    {
      id: 'oggy_super', charId: 'oggy', name: 'Siêu Mèo Oggy', price: 400,
      desc: 'Áo choàng đỏ tung bay — gián nhìn thấy là chạy mất dép.',
      colors: { body: '#2a6fd6', feet: '#d63b42', belly: '#e9f4ff' },
      gfx: GFX.oggy_super
    },
    // Các skin v2 — giá xu có thể chỉnh lại khi cân bằng Shop.
    {
      id: 'oggy_explorer', charId: 'oggy', name: 'Oggy Thám Hiểm', price: 300,
      desc: 'Mũ thám hiểm và ba lô, sẵn sàng đi vòng quanh thế giới.',
      colors: {},
      gfx: GFX.oggy_explorer
    },
    {
      id: 'oggy_astronaut', charId: 'oggy', name: 'Oggy Phi Hành Gia', price: 450,
      desc: 'Mũ kính tròn và áo du hành, bay lên vũ trụ thôi!',
      colors: { feet: '#c9d3df' },
      gfx: GFX.oggy_astronaut
    },
    {
      id: 'oggy_scientist', charId: 'oggy', name: 'Oggy Nhà Khoa Học', price: 350,
      desc: 'Áo blouse trắng và kính bảo hộ, cùng làm thí nghiệm nào.',
      colors: {},
      gfx: GFX.oggy_scientist
    }
  ];

  var D = OG.Data;
  // ⚠️ Bẫy: OG.Data có thể vẫn là stub (characters.js lỗi hoặc chưa load) → kiểm tra hàm tồn tại trước khi gọi.
  //   Mỗi skin bọc try/catch riêng: một skin dữ liệu hỏng không được làm mất các skin còn lại.
  if (D && typeof D.registerSkin === 'function') {
    for (var i = 0; i < NEW_SKINS.length; i++) {
      try {
        // Không ghi đè skin cùng id đã tồn tại (vd characters.js đã khai báo sẵn bản chi tiết hơn).
        var exists = typeof D.getSkin === 'function' ? D.getSkin(NEW_SKINS[i].id) : null;
        if (!exists) D.registerSkin(NEW_SKINS[i]);
      } catch (e) {
        if (window.console) console.error('[OG.Sprites] không đăng ký được skin ' + NEW_SKINS[i].id, e);
      }
    }
  }
})();
