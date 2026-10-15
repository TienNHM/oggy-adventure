/* OG.Shop — cửa hàng: mở khoá nhân vật, mua skin, vật phẩm hỗ trợ. [STUB — agent UI sẽ viết lại]
 * Chủ sở hữu: agent Menus & Shop (src/ui/). Load SAU src/ui/hud.js.
 *
 * HỢP ĐỒNG:
 *   OG.Shop.init()                         — đăng ký scene 'shop' (params.back: tên scene quay về, mặc định 'menu').
 *   OG.Shop.listItems() -> [ShopItem]      — ShopItem: {id, kind:'skin'|'char'|'consumable'|'upgrade', name, desc, price, icon, owned, count}
 *   OG.Shop.buy(itemId) -> bool            — OG.Save.spendCoins(price) + ghi Save (ownedSkins / unlockedChars / inventory);
 *                                            emit 'shop:purchase' {itemId, cost, kind}.
 *   OG.Shop.getRunModifiers(charId) -> Modifiers     — gọi 1 lần lúc OG.Game.newRun() (vd: extraLives).
 *   OG.Shop.getLevelModifiers(levelId, charId) -> Modifiers — gọi lúc vào mỗi màn/boss; được phép TIÊU THỤ
 *                                            vật phẩm trong Save.inventory (vd khiên dùng 1 lần).
 *   Modifiers (mọi field tuỳ chọn): { extraLives:int, speedMul:number, jumpMul:number, magnet:px,
 *                                     shield:int (số đòn chặn), coinMul:number, scoreMul:number }
 *   Giá skin lấy từ OG.Data.skins[].price; giá nhân vật từ OG.Data.characters[id].unlock.cost.
 * Stub: không có vật phẩm, không modifiers. */
(function () {
  'use strict';
  var OG = window.OG;
  OG.Shop = {
    init: function () {},
    listItems: function () { return []; },
    buy: function (itemId) { return false; },
    getRunModifiers: function (charId) { return {}; },
    getLevelModifiers: function (levelId, charId) { return {}; }
  };
})();
