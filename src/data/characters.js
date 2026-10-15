/* OG.Data.characters / OG.Data.skins — dữ liệu nhân vật và skin.
 * Chủ sở hữu: agent Tích hợp. Agent tính năng thêm skin/nhân vật qua
 * OG.Data.registerSkin() / OG.Data.registerCharacter() trong file của mình (không sửa file này). */
(function () {
  'use strict';
  var OG = window.OG;
  var P = OG.Palette;
  var Data = (OG.Data = OG.Data || {});

  // role: 'player' (chơi được), 'boss', 'enemy'.
  // w,h: kích thước hitbox (px). speed/jump: vận tốc di chuyển/nhảy (px/s).
  // unlock: điều kiện mở khoá (Shop/Menus diễn giải): {type:'free'} | {type:'coins', cost} | {type:'level', levelId}
  Data.characters = {
    oggy: {
      id: 'oggy', name: 'Oggy', role: 'player', w: 34, h: 52, speed: 255, jump: 590,
      desc: 'Chú mèo xanh hiền lành, cân bằng mọi mặt.',
      unlock: { type: 'free' },
      colors: { body: P.oggyBody, head: P.oggyHead, ear: P.oggyEar, feet: P.oggyFeet, muzzle: P.oggyMuzzle }
    },
    jack: {
      id: 'jack', name: 'Jack', role: 'player', w: 36, h: 54, speed: 240, jump: 625,
      desc: 'Anh họ nóng tính — nhảy cao hơn, chạy chậm hơn.',
      unlock: { type: 'coins', cost: 150 },
      colors: { body: '#47a53b', head: P.jack, ear: '#3f9a35', feet: '#2b6b25', muzzle: '#e6f7d9' }
    },
    olivia: {
      id: 'olivia', name: 'Olivia', role: 'player', w: 32, h: 50, speed: 280, jump: 575,
      desc: 'Cô mèo trắng nhanh nhẹn — chạy nhanh hơn.',
      unlock: { type: 'level', levelId: 'garden' },
      colors: { body: '#efe7dc', head: P.olivia, ear: '#e9ddd0', feet: '#c9b8a6', muzzle: '#ffffff', accent: P.oliviaAccent }
    },
    joey: {
      id: 'joey', name: 'Joey', role: 'boss', w: 30, h: 40,
      desc: 'Thủ lĩnh nhỏ con, ranh mãnh của bộ ba gián.',
      colors: { body: P.joey, shell: '#e08fe8', leg: '#6b2d75' }
    },
    marky: {
      id: 'marky', name: 'Marky', role: 'boss', w: 30, h: 60,
      desc: 'Gián cao gầy, điệu đà.',
      colors: { body: P.marky, shell: '#8fd37f', leg: '#2f6b26' }
    },
    deedee: {
      id: 'deedee', name: 'Dee Dee', role: 'boss', w: 50, h: 50,
      desc: 'Gián béo phàm ăn, lúc nào cũng đói.',
      colors: { body: P.deedee, shell: '#f3b277', leg: '#8a4a17' }
    },
    roach: {
      id: 'roach', name: 'Gián con', role: 'enemy', w: 34, h: 28,
      desc: 'Lính gián tuần tra.',
      colors: { body: P.roachBody, shell: P.roachShell, leg: P.roachLeg }
    }
  };

  // ---- v2: nhân vật DẪN ĐƯỜNG và NPC phụ (role 'npc': không chơi được, không gây sát thương). ----
  // Agent nhân vật vẽ chúng trong src/gfx/sprites.js (danh sách + mô tả: docs/STORY.md mục 9).
  // Khi chưa có hình riêng, Sprites vẽ dự phòng kiểu mèo theo colors.
  function npc(id, name, w, h, desc, colors) {
    Data.characters[id] = { id: id, name: name, role: 'npc', w: w, h: h, desc: desc, colors: colors };
  }
  npc('bob', 'Bob', 44, 46, 'Chú chó bun hàng xóm, dẫn đường Vòng quanh Việt Nam (đội nón lá).',
    { body: '#c98b52', head: '#d99a5f', ear: '#8a5a32', feet: '#7a4e2b', muzzle: '#f3dcc0', accent: '#e9c46a' });
  npc('owl', 'Giáo sư Cú', 40, 50, 'Cú mèo thông thái đeo kính tròn, dẫn đường Vòng quanh thế giới.',
    { body: '#9b7653', head: '#b08a63', ear: '#7a5a3c', feet: '#f2a33a', muzzle: '#f4e3c8', accent: '#3f6fb5' });
  npc('robot', 'Rô-bốt Bíp', 38, 52, 'Rô-bốt tròn vo có màn hình mặt cười, dẫn đường Khoa học & Vũ trụ.',
    { body: '#9fb4c8', head: '#c6d5e3', ear: '#5d7891', feet: '#4b6178', muzzle: '#7fe0ff', accent: '#ff7d5c' });
  // NPC phụ (xuất hiện trong truyện tranh / điểm dẫn đường).
  npc('bee', 'Ong Vàng', 30, 30, 'Chú ong chăm chỉ trong khu vườn (hành trình Nhà Oggy).', { body: '#ffd23f', head: '#ffd23f', accent: '#17233d' });
  npc('ladybug', 'Bọ Rùa', 30, 24, 'Cô bọ rùa đỏ chấm đen, bạn của khu vườn.', { body: '#e5484d', head: '#17233d', accent: '#17233d' });
  npc('droplet', 'Giọt Nước', 28, 36, 'Giọt nước tí hon kể chuyện vòng tuần hoàn nước.', { body: '#6cc6f2', head: '#8fd6f7', accent: '#ffffff' });
  npc('buffalo', 'Trâu Con', 52, 44, 'Chú trâu hiền lành ở đồng quê Việt Nam.', { body: '#5b5f6b', head: '#6b707d', ear: '#4a4d57', feet: '#3a3c44', muzzle: '#9aa0ad', accent: '#f2e6c9' });
  npc('turtle', 'Rùa Vàng', 46, 34, 'Cụ rùa hiền từ ở Hồ Gươm, Hà Nội.', { body: '#7fb069', head: '#a7c957', accent: '#e9c46a' });
  npc('lion_dance', 'Lân Con', 54, 50, 'Chú lân múa vui đêm Trung thu ở Hội An.', { body: '#e63946', head: '#ffb703', accent: '#2a9d8f' });
  npc('camel', 'Lạc Đà', 56, 60, 'Lạc đà vui tính ở sa mạc Ai Cập.', { body: '#d4a373', head: '#e0b589', accent: '#9c6644' });
  npc('toucan', 'Chim Toucan', 30, 36, 'Chim mỏ to sặc sỡ ở rừng Amazon.', { body: '#1d1d2c', head: '#1d1d2c', accent: '#ff9f1c' });
  npc('penguin', 'Chim Cánh Cụt', 32, 42, 'Bạn cánh cụt lạch bạch ở vùng băng giá.', { body: '#22303f', head: '#22303f', muzzle: '#ffffff', accent: '#ffb703' });
  npc('polar_bear', 'Gấu Bắc Cực', 58, 50, 'Gấu trắng to xác mà hiền ở Bắc Cực.', { body: '#f4f7fb', head: '#ffffff', accent: '#9fb4c8' });
  npc('dino', 'Khủng Long Con', 48, 46, 'Bé khủng long ăn cỏ thân thiện thời tiền sử.', { body: '#7ed957', head: '#8fe86a', accent: '#ffd23f' });
  npc('blood_cell', 'Hồng Cầu', 34, 34, 'Tế bào hồng cầu chở ô-xy đi khắp cơ thể.', { body: '#e5484d', head: '#ff6b6b', accent: '#ffffff' });

  // Thứ tự hiển thị nhân vật chơi được.
  Data.playable = ['oggy', 'jack', 'olivia'];

  // Skin: đổi màu nhân vật (Sprites đọc skin.colors đè lên character.colors).
  // price: giá xu (Shop dùng). id duy nhất toàn cục.
  Data.skins = [
    { id: 'oggy_default', charId: 'oggy', name: 'Cổ điển', price: 0, colors: {} },
    { id: 'oggy_gold', charId: 'oggy', name: 'Oggy Hoàng Kim', price: 200, colors: { body: '#e3a91c', head: '#f2c230', ear: '#d99b14', feet: '#9a6b08' } },
    { id: 'oggy_ninja', charId: 'oggy', name: 'Oggy Ninja', price: 300, colors: { body: '#2b2f3a', head: '#3a4050', ear: '#2b2f3a', feet: '#14161c', accent: '#e5484d' } },
    { id: 'jack_default', charId: 'jack', name: 'Cổ điển', price: 0, colors: {} },
    { id: 'jack_army', charId: 'jack', name: 'Jack Quân Nhân', price: 250, colors: { body: '#5b6b3a', head: '#6f8046', feet: '#3a4426', accent: '#c8b15a' } },
    { id: 'olivia_default', charId: 'olivia', name: 'Cổ điển', price: 0, colors: {} },
    { id: 'olivia_rose', charId: 'olivia', name: 'Olivia Hoa Hồng', price: 250, colors: { body: '#f6c6d6', head: '#fbd9e4', accent: '#d94f7c' } }
  ];

  Data.getCharacter = function (id) { return Data.characters[id] || Data.characters.oggy; };
  Data.getSkin = function (id) {
    for (var i = 0; i < Data.skins.length; i++) if (Data.skins[i].id === id) return Data.skins[i];
    return null;
  };
  Data.skinsFor = function (charId) {
    return Data.skins.filter(function (s) { return s.charId === charId; });
  };
  // Thêm/ghi đè skin (dùng từ file của agent tính năng).
  Data.registerSkin = function (skin) {
    for (var i = 0; i < Data.skins.length; i++) {
      if (Data.skins[i].id === skin.id) { Data.skins[i] = skin; return skin; }
    }
    Data.skins.push(skin);
    return skin;
  };
  Data.registerCharacter = function (ch) {
    Data.characters[ch.id] = ch;
    if (ch.role === 'player' && Data.playable.indexOf(ch.id) < 0) Data.playable.push(ch.id);
    return ch;
  };
  // Màu cuối cùng của nhân vật sau khi áp skin.
  Data.resolveColors = function (charId, skinId) {
    var ch = Data.getCharacter(charId), out = {}, k;
    for (k in ch.colors) out[k] = ch.colors[k];
    var skin = skinId ? Data.getSkin(skinId) : null;
    if (skin && skin.colors) for (k in skin.colors) out[k] = skin.colors[k];
    return out;
  };
})();
