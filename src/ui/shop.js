// @ts-check
/* ============================================================================
 * OG.Shop — CỬA HÀNG: vật phẩm hỗ trợ, skin, mở khoá nhân vật + áp vật phẩm vào gameplay qua Modifiers
 * ----------------------------------------------------------------------------
 * Vai trò:      Bán/mở khoá bằng xu (ghi OG.Save), và khi vào màn thì "tiêu thụ" vật phẩm đã bật mang theo,
 *               trả về Modifiers (bộ chỉnh chỉ số) cho OG.Game/Player. Scene 'shop' là panel DOM dùng chung
 *               bộ tiện ích OG.Menus.ui. Main gọi OG.Shop.init() sau OG.Menus.init().
 * Khái niệm:    data-driven catalog (danh mục = bảng dữ liệu) · modifiers (gói chỉnh chỉ số cộng dồn, thay vì
 *               sửa chỉ số gốc) · mua 2 bước chống bấm nhầm · chống gọi trùng trong cùng frame · event bus
 *               ('shop:purchase', 'shop:use') · DOM overlay với uỷ quyền sự kiện (data-act)
 * Bài học:      docs/learn/12-data-driven-man-cau-do-hanh-trinh.md (danh mục, perk) · docs/learn/11-luu-tru-migrate.md
 *               (ghi save, namespace ext.shop) · docs/learn/06-event-bus-observer.md (event mua/dùng)
 * Phụ thuộc:    OG.Data.registerSkin (đọc lúc LOAD — file phải nằm sau src/data/characters.js) ·
 *               lúc CHẠY: OG.Save (ns, spendCoins, addItem, getItemCount, commit), OG.Data (skins, characters,
 *               getSkin, getCharacter, playable), OG.Scenes, OG.Input, OG.Config.JUMP_VELOCITY, OG.Menus.ui.
 *               Load SAU src/ui/hud.js (dùng OG.Menus.ui từ menus.js).
 * Event:        phát: 'shop:purchase', 'shop:use', 'char:unlock', 'char:select', 'skin:equip',
 *               'player:jump' (nhảy đôi, có double:true) · nghe: 'player:hurt', 'level:start', 'game:start', 'save:reset'
 * API công khai: OG.Shop.init(), listItems(kind?), buy(itemId), getRunModifiers(charId),
 *               getLevelModifiers(levelId, charId), getCharPerk, getActive, getActiveSummary, tickPlayer,
 *               isLoadoutOn, setLoadout, items, perks, lastError
 * Đọc tiếp:     src/game/game.js (newRun / startLevel gọi get*Modifiers) → src/game/player.js (đọc shield, magnet)
 *               → src/ui/menus.js (bộ tiện ích panel OG.Menus.ui)
 * Dữ liệu:      ShopItem, Modifiers, ActiveItems (typedef bên dưới)
 *
 * Hợp đồng (docs/ARCHITECTURE.md mục 8.5):
 *   OG.Shop.init()                          — đăng ký scene 'shop' (params.back, params.backParams).
 *   OG.Shop.listItems(kind?) -> [ShopItem]  — {id, kind:'skin'|'char'|'consumable', name, desc, price, icon, owned, count, ...}
 *   OG.Shop.buy(itemId) -> bool             — trừ xu, ghi Save, phát 'shop:purchase' {itemId, cost, kind}.
 *   OG.Shop.getRunModifiers(charId)         — gọi bởi OG.Game.newRun(): đặc tính nhân vật + tim dự phòng.
 *   OG.Shop.getLevelModifiers(levelId, charId) — gọi khi vào màn/boss: khiên, giày, nam châm (tiêu thụ kho).
 *
 * MỞ RỘNG (không bắt buộc với bên gọi):
 *   OG.Shop.getCharPerk(charId) -> {label, desc, mods}
 *   OG.Shop.getActive() -> trạng thái vật phẩm đang dùng trong màn
 *   OG.Shop.getActiveSummary() -> [{id, icon, name}]
 *   OG.Shop.tickPlayer(player, dt) — xử lý NHẢY ĐÔI (giày lò xo). An toàn khi gọi nhiều lần / frame.
 *       Hiện được gọi từ OG.Menus.drawHud (fallback). Tích hợp nên gọi thêm ở cuối OG.Player.update.
 *   OG.Shop.isLoadoutOn(itemId) / setLoadout(itemId, bool) — bật/tắt "mang theo" từng vật phẩm.
 *   Event mới: 'shop:use' {itemId, levelId|null} khi một vật phẩm được tiêu thụ.
 *
 * Mã item: vật phẩm 'shield' | 'boots' | 'magnet' | 'heart'; skin = id skin (vd 'oggy_gold', chấp nhận cả
 * 'skin:oggy_gold'); nhân vật = 'char:<charId>'.
 * ========================================================================== */

/**
 * Một dòng hàng trong cửa hàng (kết quả listItems).
 * @typedef {Object} ShopItem
 * @property {string} id       mã item (xem "Mã item" ở trên)
 * @property {'consumable'|'skin'|'char'} kind
 * @property {string} name
 * @property {string} desc
 * @property {number} price    xu
 * @property {string} icon
 * @property {boolean} owned
 * @property {number} count    số đang có (skin/nhân vật: 0 hoặc 1)
 * @property {number} [max]    vật phẩm: số tối đa được giữ
 * @property {boolean} [loadout]  vật phẩm: có bật "mang theo" không
 * @property {string} [charId]
 * @property {Object} [unlock] nhân vật: điều kiện mở khoá {type:'free'|'coins'|'level', cost?, levelId?}
 * @property {boolean} [buyable]  nhân vật: mở khoá được bằng xu
 */

/**
 * Modifiers — gói chỉnh chỉ số trả cho OG.Game; field nào thiếu = không đổi. OG.Game cộng dồn
 * (mergeMods) nhiều gói lại rồi Player đọc.
 * @typedef {Object} Modifiers
 * @property {number} [scoreMul]   nhân điểm
 * @property {number} [jumpMul]    nhân lực nhảy
 * @property {number} [speedMul]   nhân tốc độ chạy
 * @property {number} [extraLives] mạng cộng thêm cho lượt chơi
 * @property {number} [shield]     số đòn được chặn
 * @property {number} [magnet]     px — bán kính hút pizza/xu
 * @property {number} [doubleJump] số lần nhảy thêm trên không (field mở rộng, xem tickPlayer)
 */

/**
 * Vật phẩm đang có tác dụng trong màn hiện tại.
 * @typedef {Object} ActiveItems
 * @property {string} levelId
 * @property {number} shieldItem   khiên MUA còn lại (0/1)
 * @property {number} perkShield   khiên từ đặc tính nhân vật (Jack)
 * @property {number} shieldUsed   số khiên đã vỡ trong màn (đếm từ 'player:hurt'.shielded)
 * @property {number} doubleJump
 * @property {number} magnet       px
 * @property {string[]} used       id vật phẩm đã tiêu thụ khi vào màn
 */
(function () {
  'use strict';
  var OG = window.OG;
  var U = OG.util;

  // ---------------------------------------------------------------------------
  // Danh mục (data-driven: thêm hàng = thêm 1 object, giao diện tự hiện)
  // ---------------------------------------------------------------------------
  // 🧪 Thử: đổi price của 'shield' 40 → 1 rồi vào 🛒 Cửa hàng: mua khiên gần như miễn phí (save vẫn hợp lệ).
  var CONSUMABLES = [
    { id: 'shield', icon: '🛡️', name: 'Khiên bong bóng', price: 40, max: 9,
      desc: 'Chặn 1 đòn trong màn kế tiếp (kể cả trận trùm của màn đó).' },
    { id: 'boots', icon: '👟', name: 'Giày lò xo', price: 60, max: 9,
      desc: 'Cho phép nhảy đôi trên không trong 1 màn.' },
    { id: 'magnet', icon: '🧲', name: 'Nam châm', price: 50, max: 9,
      desc: 'Hút pizza và xu ở gần trong 1 màn.' },
    { id: 'heart', icon: '❤️', name: 'Tim dự phòng', price: 80, max: 5,
      desc: '+1 mạng cho lượt chơi kế tiếp.' }
  ];
  var MAGNET_RANGE = 170;     // px
  var DOUBLE_JUMP_MUL = 0.88; // lực nhảy lần 2 so với lực nhảy gốc

  // Đặc tính riêng từng nhân vật (áp vào run qua getRunModifiers).
  // 💡 Khái niệm: modifiers — KHÔNG sửa chỉ số gốc trong src/data/characters.js; chỉ khai báo "nhân 1.12 lực nhảy".
  //   Nhiều nguồn (đặc tính, vật phẩm, độ khó) cùng trả gói modifiers, Game gộp lại → bỏ một nguồn là gỡ sạch
  //   hiệu ứng của nó, không sợ chỉ số bị cộng dồn sai qua nhiều lượt chơi.
  var PERKS = {
    oggy: { label: 'Cân bằng', desc: 'Được thưởng thêm 10% điểm.', mods: { scoreMul: 1.1 } },
    jack: { label: 'Da dày', desc: 'Mỗi màn bắt đầu với 1 khiên chặn đòn.', mods: { shield: 1 } },
    olivia: { label: 'Nhẹ như mây', desc: 'Nhảy cao nhất đội (+12% lực nhảy).', mods: { jumpMul: 1.12 } }
  };

  // Skin bổ sung (đăng ký lúc load, hợp lệ theo hợp đồng). Chỉ cần bảng màu — hàm vẽ nhân vật procedural
  // tô theo `colors`, nên một skin mới không cần thêm ảnh nào.
  if (OG.Data && typeof OG.Data.registerSkin === 'function') {
    OG.Data.registerSkin({ id: 'oggy_candy', charId: 'oggy', name: 'Oggy Kẹo Ngọt', price: 180,
      colors: { body: '#f58fb7', head: '#ffa9cb', ear: '#ef7fab', feet: '#b34a78', muzzle: '#fff0f6' } });
    OG.Data.registerSkin({ id: 'jack_ice', charId: 'jack', name: 'Jack Băng Giá', price: 220,
      colors: { body: '#5aa9d6', head: '#7cc3ea', ear: '#4f9bc7', feet: '#2b5f84', muzzle: '#eaf7ff' } });
    OG.Data.registerSkin({ id: 'olivia_night', charId: 'olivia', name: 'Olivia Đêm Sao', price: 220,
      colors: { body: '#6c5aa8', head: '#8572c4', ear: '#5d4c96', feet: '#3a2f66', muzzle: '#efe9ff', accent: '#ffd36b' } });
  }

  // ---------------------------------------------------------------------------
  // Tiện ích tra cứu
  // ---------------------------------------------------------------------------
  function save() { return (OG.Save && OG.Save.data) || null; }
  // Dữ liệu riêng của module trong save (Save.data.ext.shop) — vá field thiếu khi save cũ chưa có.
  function shopNs() {
    var ns = OG.Save.ns('shop');
    if (!ns.loadout || typeof ns.loadout !== 'object') ns.loadout = {};
    return ns;
  }
  function getConsumable(id) {
    for (var i = 0; i < CONSUMABLES.length; i++) if (CONSUMABLES[i].id === id) return CONSUMABLES[i];
    return null;
  }
  function count(id) { return OG.Save && OG.Save.getItemCount ? OG.Save.getItemCount(id) : 0; }
  function ownsSkin(skinId) {
    var sk = OG.Data.getSkin(skinId);
    if (sk && !sk.price) return true; // skin giá 0 (mặc định) luôn "có"
    var s = save();
    return !!(s && (s.ownedSkins || []).indexOf(skinId) >= 0);
  }
  function hasChar(id) {
    var s = save();
    return !!(s && (s.unlockedChars || []).indexOf(id) >= 0);
  }

  // Phân giải itemId -> {kind, price, ...}. Một chỗ duy nhất hiểu định dạng mã item ('char:', 'skin:'),
  // mọi hàm khác (buy, fkFor, scene) đi qua đây. null = mã không hợp lệ / nhân vật không bán bằng xu.
  function resolve(itemId) {
    itemId = String(itemId || '');
    var c = getConsumable(itemId);
    if (c) return { kind: 'consumable', id: c.id, price: c.price, def: c };
    if (itemId.indexOf('char:') === 0) {
      var cid = itemId.slice(5), ch = OG.Data.characters[cid];
      if (!ch || !ch.unlock || ch.unlock.type !== 'coins') return null;
      return { kind: 'char', id: itemId, charId: cid, price: ch.unlock.cost | 0, def: ch };
    }
    var skinId = itemId.indexOf('skin:') === 0 ? itemId.slice(5) : itemId;
    var sk = OG.Data.getSkin(skinId);
    if (sk) return { kind: 'skin', id: sk.id, price: sk.price | 0, def: sk };
    return null;
  }

  // ---------------------------------------------------------------------------
  // Trạng thái vật phẩm đang dùng trong màn hiện tại (RAM, không lưu)
  // ---------------------------------------------------------------------------
  /** @type {ActiveItems|null} */
  var active = null;
  var heartUsedRun = false; // lượt chơi này đã dùng tim dự phòng chưa (để báo toast lúc game:start)
  // Nhảy đôi: player đang theo dõi, số lần đã nhảy trên không, frame trước có chạm đất không,
  // và OG.time của lần tick gần nhất (chống gọi trùng).
  var dj = { player: null, airJumps: 0, wasGround: true, lastT: -1 };

  var Shop = (OG.Shop = {
    items: CONSUMABLES,
    perks: PERKS,
    lastError: null,  // 'coins' | 'owned' | 'max' | 'unknown' sau lần buy() thất bại

    // ------------------------------------------------------------------
    /**
     * Liệt kê hàng trong cửa hàng, kèm trạng thái sở hữu đọc từ save.
     * @param {string} [kind]  'consumable' | 'skin' | 'char'; bỏ trống = tất cả
     * @returns {ShopItem[]}
     */
    listItems: function (kind) {
      var out = [];
      if (!kind || kind === 'consumable') {
        CONSUMABLES.forEach(function (c) {
          out.push({ id: c.id, kind: 'consumable', name: c.name, desc: c.desc, price: c.price, icon: c.icon,
            owned: count(c.id) > 0, count: count(c.id), max: c.max, loadout: Shop.isLoadoutOn(c.id) });
        });
      }
      if (!kind || kind === 'skin') {
        (OG.Data.skins || []).forEach(function (sk) {
          if (!sk.price) return; // skin mặc định không bán
          out.push({ id: sk.id, kind: 'skin', name: sk.name, desc: 'Trang phục cho ' + OG.Data.getCharacter(sk.charId).name,
            price: sk.price | 0, icon: '👕', owned: ownsSkin(sk.id), count: ownsSkin(sk.id) ? 1 : 0, charId: sk.charId });
        });
      }
      if (!kind || kind === 'char') {
        (OG.Data.playable || []).forEach(function (cid) {
          var ch = OG.Data.characters[cid];
          if (!ch) return;
          var u = ch.unlock || { type: 'free' };
          out.push({ id: 'char:' + cid, kind: 'char', name: ch.name, desc: ch.desc || '',
            price: u.type === 'coins' ? (u.cost | 0) : 0, icon: '🐱', owned: hasChar(cid), count: hasChar(cid) ? 1 : 0,
            charId: cid, unlock: u, buyable: u.type === 'coins' });
        });
      }
      return out;
    },

    /**
     * Mua một item: kiểm tra điều kiện → trừ xu → ghi save → phát 'shop:purchase' (và 'char:unlock' nếu là nhân vật).
     * Thất bại thì trả false và đặt Shop.lastError = 'coins' | 'owned' | 'max' | 'unknown'.
     * @param {string} itemId  vd 'shield', 'oggy_candy', 'char:jack'
     * @returns {boolean}
     * @example
     *   if (!OG.Shop.buy('shield')) console.log('Không mua được:', OG.Shop.lastError);
     */
    buy: function (itemId) {
      Shop.lastError = null;
      var it = resolve(itemId);
      var s = save();
      // Kiểm tra mọi điều kiện TRƯỚC khi trừ xu: spendCoins là bước không hoàn tác.
      if (!it || !s) { Shop.lastError = 'unknown'; return false; }
      if (it.kind === 'consumable' && count(it.id) >= it.def.max) { Shop.lastError = 'max'; return false; }
      if (it.kind === 'skin' && ownsSkin(it.id)) { Shop.lastError = 'owned'; return false; }
      if (it.kind === 'char' && hasChar(it.charId)) { Shop.lastError = 'owned'; return false; }
      if (!OG.Save.spendCoins(it.price, 'shop')) { Shop.lastError = 'coins'; return false; }
      if (it.kind === 'consumable') {
        OG.Save.addItem(it.id, 1);
      } else if (it.kind === 'skin') {
        if (!Array.isArray(s.ownedSkins)) s.ownedSkins = [];
        s.ownedSkins.push(it.id);
        OG.Save.commit();
      } else if (it.kind === 'char') {
        if (!Array.isArray(s.unlockedChars)) s.unlockedChars = ['oggy'];
        s.unlockedChars.push(it.charId);
        OG.Save.commit();
        OG.Events.emit('char:unlock', { charId: it.charId, reason: 'shop' });
      }
      OG.Events.emit('shop:purchase', { itemId: it.id, cost: it.price, kind: it.kind });
      return true;
    },

    // ------------------------------------------------------------------
    /**
     * Cho biết vật phẩm có đang bật "mang theo" (tự dùng khi vào màn) không.
     * Mặc định BẬT: chỉ lưu khi người chơi tắt (`!== false`), save cũ không có field vẫn đúng.
     * @param {string} itemId
     * @returns {boolean}
     */
    isLoadoutOn: function (itemId) {
      if (!save()) return true;
      var l = shopNs().loadout;
      return l[itemId] !== false;
    },
    /**
     * Bật/tắt "mang theo" một vật phẩm và ghi save.
     * @param {string} itemId
     * @param {boolean} on
     */
    setLoadout: function (itemId, on) {
      shopNs().loadout[itemId] = !!on;
      OG.Save.commit();
    },

    /**
     * Lấy đặc tính của nhân vật.
     * @param {string} charId
     * @returns {{label: string, desc: string, mods: Modifiers}|null}
     */
    getCharPerk: function (charId) { return PERKS[charId] || null; },

    /**
     * Tạo modifiers cho cả LƯỢT CHƠI: đặc tính nhân vật + tiêu thụ 1 tim dự phòng (nếu bật mang theo).
     * Gọi đúng 1 lần trong OG.Game.newRun(). Có thể SỬA save (trừ tim) và phát 'shop:use'.
     * @param {string} charId
     * @returns {Modifiers}
     */
    getRunModifiers: function (charId) {
      var m = {};
      var perk = PERKS[charId];
      if (perk) for (var k in perk.mods) m[k] = perk.mods[k];
      heartUsedRun = false;
      active = null;
      if (save() && Shop.isLoadoutOn('heart') && count('heart') > 0) {
        OG.Save.addItem('heart', -1);
        m.extraLives = (m.extraLives | 0) + 1;
        heartUsedRun = true;
        OG.Events.emit('shop:use', { itemId: 'heart', levelId: null });
      }
      return m;
    },

    /**
     * Tạo modifiers cho MỘT MÀN. Gọi khi vào màn (scene 'level') hoặc trận trùm (scene 'boss') của màn đó.
     * Vào màn = kích hoạt mới (tiêu thụ kho, SỬA save, phát 'shop:use'). Vào trùm cùng màn = dùng lại,
     * không tiêu thụ thêm; khiên mua chỉ còn nếu chưa vỡ ở phần màn trước đó.
     * ⚠️ Bẫy: hàm phân biệt "vào màn" hay "vào trùm" bằng OG.Scenes.current() — phải gọi SAU khi scene
     *   tương ứng đã thành scene hiện tại, nếu không vào trùm sẽ bị tính là vào màn mới và trừ kho lần nữa.
     * @param {string} levelId
     * @param {string} charId
     * @returns {Modifiers}
     */
    getLevelModifiers: function (levelId, charId) {
      if (!save()) return {};
      var scene = OG.Scenes && OG.Scenes.current ? OG.Scenes.current() : null;
      var perkShield = (PERKS[charId] && PERKS[charId].mods.shield) | 0;
      var reuse = active && active.levelId === levelId && scene !== 'level';
      if (reuse) {
        // Khiên của đặc tính nhân vật được làm mới; khiên mua chỉ còn phần chưa dùng.
        // Khiên vỡ được tính trừ vào khiên đặc tính TRƯỚC (shieldUsed − perkShield), phần dư mới trừ khiên mua.
        var itemLeft = Math.max(0, active.shieldItem - Math.max(0, active.shieldUsed - active.perkShield));
        active.shieldItem = itemLeft;
        active.perkShield = perkShield;
        active.shieldUsed = 0;
      } else {
        active = { levelId: levelId, shieldItem: 0, perkShield: perkShield, shieldUsed: 0, doubleJump: 0, magnet: 0, used: [] };
        ['shield', 'boots', 'magnet'].forEach(function (id) {
          if (!Shop.isLoadoutOn(id) || count(id) <= 0) return;
          OG.Save.addItem(id, -1);
          active.used.push(id);
          if (id === 'shield') active.shieldItem = 1;
          if (id === 'boots') active.doubleJump = 1;
          if (id === 'magnet') active.magnet = MAGNET_RANGE;
          OG.Events.emit('shop:use', { itemId: id, levelId: levelId });
        });
      }
      dj.player = null;
      var mods = {};
      if (active.shieldItem) mods.shield = active.shieldItem;
      if (active.magnet) mods.magnet = active.magnet;
      if (active.doubleJump) mods.doubleJump = active.doubleJump; // field mở rộng (Player chưa đọc; xem tickPlayer)
      return mods;
    },

    /** @returns {ActiveItems|null} vật phẩm đang có tác dụng (null khi chưa vào màn nào trong lượt) */
    getActive: function () { return active; },
    /** @returns {{id: string, icon: string, name: string}[]} danh sách gọn để hiện ở HUD / màn tạm dừng */
    getActiveSummary: function () {
      if (!active) return [];
      var out = [];
      if (active.shieldItem) out.push({ id: 'shield', icon: '🛡️', name: 'Khiên' });
      if (active.doubleJump) out.push({ id: 'boots', icon: '👟', name: 'Nhảy đôi' });
      if (active.magnet) out.push({ id: 'magnet', icon: '🧲', name: 'Nam châm' });
      return out;
    },

    /**
     * Xử lý NHẢY ĐÔI (giày lò xo) cho player: đang trên không mà vừa nhấn nhảy thì bật lên lần nữa.
     * Gọi mỗi frame SAU khi Player.update chạy (hoặc ở cuối Player.update). SỬA p.vy, phát 'player:jump'.
     * @param {Player} p
     * @param {number} dt  giây (hiện chưa dùng, giữ cho chữ ký giống các hàm update)
     */
    tickPlayer: function (p, dt) {
      if (!p || !active || !active.doubleJump) return;
      // 💡 Khái niệm: chống gọi trùng trong cùng frame — hàm được gọi từ 2 nơi (HUD và có thể cả Player).
      //   OG.time chỉ đổi một lần mỗi frame, nên "đã chạy với OG.time này rồi" = đã chạy trong frame này.
      if (dj.lastT === OG.time) return;
      dj.lastT = OG.time;
      // Object player khác lần trước (vd vào màn mới) → bắt đầu đếm lại, bỏ qua frame đầu.
      if (dj.player !== p) { dj.player = p; dj.airJumps = 0; dj.wasGround = !!p.ground; return; }
      if (p.ground) {
        dj.airJumps = 0;
      } else if (!dj.wasGround && !p.celebrate && OG.Input.pressed('jump') && dj.airJumps < active.doubleJump) {
        // ⚠️ Bẫy: phải kiểm tra frame TRƯỚC cũng đang trên không (!dj.wasGround). Frame vừa rời đất do cú nhảy
        //   thường thì pressed('jump') vẫn đang true → không có điều kiện này, cú nhảy thường bị "nuốt" thành nhảy đôi.
        dj.airJumps++;
        p.vy = -(p.jumpV || OG.Config.JUMP_VELOCITY) * DOUBLE_JUMP_MUL;
        OG.Events.emit('player:jump', { charId: p.charId, x: p.x, y: p.y, double: true });
        U.call('Particles', 'spawn', p.x + p.w / 2, p.y + p.h, { color: '#ffffff', count: 8 });
      }
      dj.wasGround = !!p.ground;
    },

    // ------------------------------------------------------------------
    /**
     * Gắn listener (khiên vỡ, báo vật phẩm mang theo, reset) và đăng ký scene 'shop'.
     * Gọi một lần từ main.js, SAU OG.Menus.init() (scene cần OG.Menus.ui).
     */
    init: function () {
      // Theo dõi khiên vỡ để trận trùm biết khiên mua còn hay không.
      OG.Events.on('player:hurt', function (e) { if (e && e.shielded && active) active.shieldUsed++; });
      // Báo vật phẩm đang dùng khi vào màn.
      OG.Events.on('level:start', function (e) {
        if (!active || active.levelId !== (e && e.levelId) || !active.used.length) return;
        var names = active.used.map(function (id) { var c = getConsumable(id); return c.icon + ' ' + c.name; });
        // Trễ 900 ms: đợi màn chơi hiện ra hẳn rồi mới báo, để bé kịp để ý.
        setTimeout(function () { U.call('DOM', 'toast', 'Mang theo: ' + names.join(' · '), 2.2); }, 900);
      });
      OG.Events.on('game:start', function () {
        if (heartUsedRun) setTimeout(function () { U.call('DOM', 'toast', '❤️ Tim dự phòng: +1 mạng!', 2); }, 300);
      });
      OG.Events.on('save:reset', function () { active = null; heartUsedRun = false; });
      if (OG.Scenes && OG.Menus && OG.Menus.ui) OG.Scenes.register('shop', shopScene());
    }
  });

  // ======================================================================
  // Scene 'shop' — giao diện DOM (panel trong #overlay), không vẽ canvas trừ nền
  // ======================================================================
  // Mỗi thao tác → đổi trạng thái (S.tab, S.pending) → render() dựng lại TOÀN BỘ HTML panel, rồi trả focus
  // về đúng nút vừa bấm qua selector data-fk ("focus key"). Đơn giản kiểu "vẽ lại hết" như canvas,
  // nhưng nhờ data-fk người dùng bàn phím không bị nhảy focus về đầu sau mỗi lần bấm.
  function shopScene() {
    var UI = OG.Menus.ui;
    var TABS = [
      { id: 'consumable', label: '🎒 Vật phẩm' },
      { id: 'skin', label: '👕 Trang phục' },
      { id: 'char', label: '🐱 Nhân vật' }
    ];

    var S = {
      back: 'menu', backParams: null, tab: 'consumable', pending: null,

      enter: function (params) {
        params = params || {};
        UI.hideGameUi();
        S.back = params.back || 'menu';
        S.backParams = params.backParams || null;
        S.tab = params.tab || S.tab || 'consumable';
        S.pending = null;
        S.render('[data-fk="tab-' + S.tab + '"]');
      },

      buyLabel: function (it, extra) {
        var afford = UI.coins() >= it.price;
        return '<span class="ui-price' + (afford ? '' : ' is-poor') + '">' + (extra || '') + UI.fmt(it.price) + ' 🪙</span>';
      },

      // Thẻ hàng: [data-act] = tên handler, [data-arg] = tham số, [data-id] = id cho 'ui:click' (âm thanh/test),
      // [data-fk] = khoá focus. aria-hidden trên emoji để trình đọc màn hình chỉ đọc tên món, không đọc tên emoji.
      cardConsumable: function (it) {
        var full = it.count >= it.max;
        var confirm = S.pending === it.id;
        return '<div class="ui-card ui-item">' +
          '<div class="ui-item-icon" aria-hidden="true">' + it.icon + '</div>' +
          '<b class="ui-card-name">' + UI.esc(it.name) + '</b>' +
          '<p class="ui-item-desc">' + UI.esc(it.desc) + '</p>' +
          '<div class="ui-item-own">Đang có: <b>' + it.count + '</b>/' + it.max + '</div>' +
          '<div class="ui-item-actions">' +
            '<button type="button" class="' + (full ? 'secondary is-dim' : (confirm ? 'is-confirm' : '')) + '" data-act="buy" data-arg="' + it.id +
              '" data-fk="buy-' + it.id + '" data-id="buy_' + it.id + '">' +
              (full ? 'Đã đầy' : confirm ? 'Xác nhận?' : 'Mua ' + S.buyLabel(it)) + '</button>' +
            '<button type="button" class="ui-mini-toggle ' + (it.loadout ? 'is-on' : 'secondary') + '" data-act="loadout" data-arg="' + it.id +
              '" data-fk="lo-' + it.id + '" data-id="loadout_' + it.id + '" title="Tự động dùng khi vào màn">' +
              (it.loadout ? '✔ Mang theo' : '✖ Để lại') + '</button>' +
          '</div></div>';
      },

      cardSkin: function (it) {
        var equipped = UI.equippedSkin(it.charId) === it.id;
        var confirm = S.pending === it.id;
        var label = equipped ? '✔ Đang dùng' : it.owned ? 'Trang bị' : confirm ? 'Xác nhận?' : 'Mua ' + S.buyLabel(it);
        return '<div class="ui-card ui-item ui-skin-card' + (equipped ? ' is-selected' : '') + '">' +
          UI.previewHtml(it.charId, it.id, 70, equipped ? 'victory' : 'idle') +
          '<b class="ui-card-name">' + UI.esc(it.name) + '</b>' +
          '<p class="ui-item-desc">' + UI.esc(it.desc) + (hasChar(it.charId) ? '' : ' <small>(chưa mở khoá)</small>') + '</p>' +
          '<div class="ui-item-actions"><button type="button" class="' + (equipped ? 'secondary is-dim' : (it.owned ? 'secondary' : (confirm ? 'is-confirm' : ''))) +
            '" data-act="skin" data-arg="' + UI.esc(it.id) + '" data-fk="skin-' + UI.esc(it.id) + '" data-id="skin_' + UI.esc(it.id) + '">' + label + '</button></div>' +
          '</div>';
      },

      cardChar: function (it) {
        var confirm = S.pending === it.id;
        var u = it.unlock || {};
        var btn;
        if (it.owned) btn = '<button type="button" class="secondary" data-act="choose" data-arg="' + UI.esc(it.charId) + '" data-fk="ch-' + UI.esc(it.charId) +
          '" data-id="choose_' + UI.esc(it.charId) + '">' + ((save() || {}).selectedChar === it.charId ? '✔ Đang chọn' : 'Chọn') + '</button>';
        else if (it.buyable) btn = '<button type="button" class="' + (confirm ? 'is-confirm' : '') + '" data-act="buy" data-arg="' + UI.esc(it.id) +
          '" data-fk="ch-' + UI.esc(it.charId) + '" data-id="buy_' + UI.esc(it.id) + '">' + (confirm ? 'Xác nhận?' : 'Mở khoá ' + S.buyLabel(it)) + '</button>';
        else btn = '<span class="ui-tag ui-tag-lock">🔒 Qua màn: ' + UI.esc(UI.levelName(u.levelId)) + '</span>';
        var perk = PERKS[it.charId];
        return '<div class="ui-card ui-item ui-char-card' + (it.owned ? '' : ' is-locked') + '">' +
          UI.previewHtml(it.charId, UI.equippedSkin(it.charId), 70, 'idle', it.owned ? '' : 'is-locked') +
          '<b class="ui-card-name">' + UI.esc(it.name) + '</b>' +
          (perk ? '<span class="ui-perk">' + UI.esc(perk.label) + '</span>' : '') +
          '<div class="ui-stats-bars">' + UI.statBars(it.charId) + '</div>' +
          '<div class="ui-item-actions">' + btn + '</div></div>';
      },

      render: function (focusSel) {
        var tabs = TABS.map(function (t) {
          return '<button type="button" class="ui-tab' + (S.tab === t.id ? ' is-on' : ' secondary') + '" data-act="tab" data-arg="' + t.id +
            '" data-fk="tab-' + t.id + '" data-id="tab_' + t.id + '" role="tab" aria-selected="' + (S.tab === t.id) + '">' + t.label + '</button>';
        }).join('');
        var items = Shop.listItems(S.tab);
        var body = items.map(function (it) {
          if (it.kind === 'consumable') return S.cardConsumable(it);
          if (it.kind === 'skin') return S.cardSkin(it);
          return S.cardChar(it);
        }).join('');
        var tip = S.tab === 'consumable'
          ? 'Vật phẩm "Mang theo" được tự dùng khi vào màn (tim: khi bắt đầu lượt chơi mới).'
          : S.tab === 'skin' ? 'Mua xong có thể đổi trang phục ở mục Nhân vật.' : 'Mỗi nhân vật có chỉ số và đặc tính riêng.';
        var html =
          '<div class="ui-topbar"><span>🪙 <b class="ui-coin-val">' + UI.fmt(UI.coins()) + '</b></span></div>' +
          '<div class="ui-tabs" role="tablist">' + tabs + '</div>' +
          '<div class="ui-shop-grid ui-shop-' + S.tab + '">' + (body || '<p class="ui-note">Chưa có gì để bán.</p>') + '</div>' +
          '<p class="ui-note">' + tip + '</p>' +
          '<div class="actions"><button type="button" data-act="back" data-id="shop_back" data-primary>⬅ QUAY LẠI</button></div>';
        UI.open({
          title: 'CỬA HÀNG',
          className: 'ui-wide ui-shop',
          html: html,
          focus: focusSel,
          handlers: {
            tab: function (id) { S.tab = id; S.pending = null; S.render('[data-fk="tab-' + id + '"]'); },
            buy: function (id) { S.buy(id); },
            skin: function (id) { S.skin(id); },
            loadout: function (id) {
              Shop.setLoadout(id, !Shop.isLoadoutOn(id));
              S.render('[data-fk="lo-' + id + '"]');
            },
            choose: function (cid) {
              var s = save();
              if (s.selectedChar !== cid) {
                s.selectedChar = cid; OG.Save.commit();
                OG.Events.emit('char:select', { charId: cid });
                UI.toast('Đã chọn ' + UI.charName(cid) + '!');
              }
              S.render('[data-fk="ch-' + cid + '"]');
            },
            back: function () { S.leave(); }
          }
        });
      },

      fkFor: function (id) {
        var it = resolve(id);
        if (!it) return null;
        if (it.kind === 'char') return '[data-fk="ch-' + it.charId + '"]';
        if (it.kind === 'skin') return '[data-fk="skin-' + it.id + '"]';
        return '[data-fk="buy-' + it.id + '"]';
      },

      failMsg: function (it) {
        if (Shop.lastError === 'coins') return 'Chưa đủ xu! Cần ' + UI.fmt(it.price) + ' 🪙 (đang có ' + UI.fmt(UI.coins()) + ')';
        if (Shop.lastError === 'max') return 'Túi đã đầy vật phẩm này.';
        if (Shop.lastError === 'owned') return 'Bạn đã có rồi!';
        return 'Không mua được.';
      },

      // Mua 2 bước: lần 1 hiện "Xác nhận?", lần 2 mới trừ xu.
      // 💡 Khái niệm: xác nhận thao tác không hoàn tác ngay trên chính nút bấm (không bật hộp thoại riêng) —
      //   trẻ em hay bấm nhầm/bấm liên tục; S.pending nhớ item đang chờ xác nhận, đổi tab hay chọn món khác là huỷ.
      buy: function (id) {
        var it = resolve(id);
        if (!it) return;
        var fk = S.fkFor(id);
        if (it.kind === 'consumable' && count(it.id) >= it.def.max) { UI.toast('Túi đã đầy vật phẩm này.'); return; }
        if (UI.coins() < it.price) { Shop.lastError = 'coins'; UI.toast(S.failMsg(it)); S.pending = null; S.render(fk); return; }
        if (S.pending !== it.id) { S.pending = it.id; S.render(fk); return; }
        S.pending = null;
        if (Shop.buy(id)) {
          UI.toast(it.kind === 'char' ? '🎉 Đã mở khoá ' + it.def.name + '!' : '🛍️ Đã mua ' + (it.def.name || id) + '!');
        } else {
          UI.toast(S.failMsg(it));
        }
        S.render(fk);
      },

      skin: function (id) {
        var it = resolve(id);
        if (!it || it.kind !== 'skin') return;
        if (!ownsSkin(it.id)) { S.buy(id); return; }
        if (!hasChar(it.def.charId)) { UI.toast('Mở khoá ' + UI.charName(it.def.charId) + ' để dùng skin này.'); return; }
        var s = save();
        if (!s.equippedSkins) s.equippedSkins = {};
        s.equippedSkins[it.def.charId] = it.id;
        OG.Save.commit();
        OG.Events.emit('skin:equip', { charId: it.def.charId, skinId: it.id });
        UI.toast('Đã trang bị ' + it.def.name + '!');
        S.render(S.fkFor(id));
      },

      leave: function () {
        var to = OG.Scenes.has(S.back) ? S.back : 'menu';
        OG.Scenes.go(to, S.backParams || { back: 'menu' });
      },

      exit: function () { UI.close(); },
      // Panel DOM tự xử lý chuột/Enter/mũi tên (menus.js); update() chỉ cần bắt Esc qua OG.Input.
      // consume('back') để scene vừa chuyển tới không thấy lại cùng cú nhấn Esc trong frame này.
      update: function () {
        if (OG.Input.pressed('back')) { OG.Input.consume('back'); S.leave(); }
      },
      draw: function (ctx) { UI.drawBackdrop(ctx); UI.drawPreviews(OG.time); }
    };
    return S;
  }
})();
