/* OG.Sprites.skinGfx — phụ kiện vẽ thêm theo skin + đăng ký skin mới của Oggy.
 * Chủ sở hữu: agent Sprites (src/gfx/). Load SAU src/gfx/sprites.js, TRƯỚC scenery.js
 * (thứ tự không bắt buộc: file tự tạo OG.Sprites nếu chưa có).
 *
 * Skin của Oggy (id dùng trong Save.equippedSkins / Shop):
 *   oggy_default  Cổ điển          — mèo xanh nguyên bản
 *   oggy_chef     Oggy Đầu Bếp     — mũ đầu bếp, tạp dề, khăn cổ đỏ, dép trắng
 *   oggy_super    Siêu Mèo Oggy    — áo choàng đỏ bay, mặt nạ, huy hiệu ngôi sao, thắt lưng vàng, ủng đỏ
 *   oggy_ninja    Oggy Ninja       — lông tối, băng đô đỏ có dải bay, khăn che mặt (skin có sẵn trong data)
 *   oggy_gold     Oggy Hoàng Kim   — lông vàng + vương miện (skin có sẵn trong data)
 *
 * Phụ kiện (gfx) mà Sprites hiểu (chỉ áp cho mèo):
 *   hat: 'chef' | 'crown' | 'beret'   hatColor
 *   cape: màu áo choàng   mask: màu mặt nạ che mắt   emblem: màu huy hiệu ngực   belt: màu thắt lưng
 *   belly: màu bụng (đè)   headband: màu băng đô   faceMask: màu khăn che mặt   apron: bool   scarf: màu khăn cổ   bow: bool (nơ dùng màu accent)
 * Skin đăng ký sau có thể tự khai báo trường `gfx` trong đối tượng skin, Sprites sẽ ưu tiên dùng nó. */
(function () {
  'use strict';
  var OG = (window.OG = window.OG || {});
  var S = (OG.Sprites = OG.Sprites || {});

  var GFX = {
    oggy_default: {},
    oggy_chef: { hat: 'chef', apron: true, scarf: '#e5484d' },
    oggy_super: { cape: '#e5484d', mask: '#e5484d', emblem: '#ffc94a', belt: '#ffc94a' },
    oggy_ninja: { headband: '#e5484d', faceMask: '#1d2029', belly: '#4a5160' },
    oggy_gold: { hat: 'crown', hatColor: '#ffd84a', belly: '#fff3c4' },
    jack_army: { hat: 'beret', hatColor: '#4f5d33' },
    olivia_rose: { bow: true }
  };

  S.skinGfx = S.skinGfx || {};
  for (var k in GFX) if (!S.skinGfx[k]) S.skinGfx[k] = GFX[k];

  // Danh sách id skin của Oggy do Sprites hỗ trợ (để Shop/Menus/demo tham khảo).
  S.OGGY_SKINS = ['oggy_default', 'oggy_chef', 'oggy_super', 'oggy_ninja', 'oggy_gold'];

  // Skin mới — đăng ký vào OG.Data (nếu Data đã có). Không ghi đè skin cùng id đã tồn tại.
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
    }
  ];

  var D = OG.Data;
  if (D && typeof D.registerSkin === 'function') {
    for (var i = 0; i < NEW_SKINS.length; i++) {
      try {
        var exists = typeof D.getSkin === 'function' ? D.getSkin(NEW_SKINS[i].id) : null;
        if (!exists) D.registerSkin(NEW_SKINS[i]);
      } catch (e) {
        if (window.console) console.error('[OG.Sprites] không đăng ký được skin ' + NEW_SKINS[i].id, e);
      }
    }
  }
})();
