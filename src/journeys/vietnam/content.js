/* Hành trình "vietnam" — NỘI DUNG HỌC: thẻ kiến thức, câu đố, truyện tranh.
 * Chủ sở hữu v2: agent journey-vietnam (CHỈ src/journeys/vietnam/). Hợp đồng: docs/STORY.md mục 2.
 * Hình minh hoạ thẻ: phần lớn dùng lại decor 'vietnam-*' (theme.js) qua OG.Scenery.drawDecor (tự có hình dự phòng);
 * hình phụ của câu đố (lều tuyết, tủ lạnh, quả bóng...) vẽ tại đây.
 * Kiến thức: câu ngắn, chính xác, số liệu làm tròn an toàn, phù hợp trẻ 5–10 tuổi. */
(function () {
  'use strict';
  var OG = window.OG;
  var TAU = Math.PI * 2;
  var INK = '#17233d';

  // ---- Tiện ích vẽ ----
  function ink(ctx, w) { ctx.strokeStyle = INK; ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); }
  function fillInk(ctx, c, w) { ctx.fillStyle = c; ctx.fill(); ink(ctx, w); }
  function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }
  // Viền ngoài cho hình ghép nhiều vòng tròn.
  function fillOut(ctx, c, w) { ink(ctx, w * 2); ctx.fillStyle = c; ctx.fill(); }
  function face(ctx, x, y, s, mood) {
    if (OG.Decor && typeof OG.Decor.face === 'function') { OG.Decor.face(ctx, x, y, s, mood); return; }
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.arc(x - 6 * s, y, 2.4 * s, 0, TAU); ctx.arc(x + 6 * s, y, 2.4 * s, 0, TAU); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.8 * s;
    ctx.beginPath(); ctx.arc(x, y + 3 * s, 4 * s, 0.25, Math.PI - 0.25); ctx.stroke();
  }

  // Icon từ decor 'vietnam-<kind>': k = tỉ lệ so với ô 100 px, dy = vị trí mặt đất (tỉ lệ ô, tính từ tâm).
  function dec(kind, k, dy, opts) {
    return function (ctx, x, y, size, t) {
      ctx.save();
      OG.Scenery.drawDecor(ctx, 'vietnam-' + kind, x, y + size * (dy == null ? 0.42 : dy), (size / 100) * (k || 0.75), t || 0, opts || {});
      ctx.restore();
    };
  }
  // Icon tự vẽ trong hệ toạ độ ô 100 px quanh tâm.
  function icon(fn) {
    return function (ctx, x, y, size, t) {
      ctx.save(); ctx.translate(x, y); ctx.scale(size / 100, size / 100);
      fn(ctx, t || 0);
      ctx.restore();
    };
  }

  // ---- Hình phụ cho lựa chọn câu đố ----
  var igloo = icon(function (ctx) {
    ctx.beginPath(); ctx.arc(0, 20, 40, Math.PI, 0); ctx.closePath(); fillInk(ctx, '#eaf6ff', 4);
    ctx.strokeStyle = 'rgba(80,140,200,0.5)'; ctx.lineWidth = 2;
    [4, -10].forEach(function (y) { ctx.beginPath(); ctx.moveTo(-36, y); ctx.lineTo(36, y); ctx.stroke(); });
    ctx.beginPath(); ctx.arc(0, 20, 14, Math.PI, 0); ctx.closePath(); fillInk(ctx, '#5b6b8a', 3);
    face(ctx, 0, -16, 0.9);
    // chim cánh cụt nhỏ
    ctx.beginPath(); ctx.ellipse(38, 8, 10, 14, 0, 0, TAU); fillInk(ctx, '#22303f', 3);
    ctx.beginPath(); ctx.ellipse(38, 11, 6, 9, 0, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.fillStyle = '#ffb703'; ctx.beginPath(); ctx.moveTo(36, 2); ctx.lineTo(42, 2); ctx.lineTo(39, 6); ctx.fill();
  });
  var fridge = icon(function (ctx) {
    OG.util.roundRectPath(ctx, -26, -42, 52, 84, 8); fillInk(ctx, '#e8f1fb', 4);
    ctx.beginPath(); ctx.moveTo(-26, -12); ctx.lineTo(26, -12); ink(ctx, 3);
    ctx.beginPath(); ctx.moveTo(18, -34); ctx.lineTo(18, -20); ctx.moveTo(18, -4); ctx.lineTo(18, 14); ink(ctx, 4);
    face(ctx, -2, 12, 1, 'o');
    ctx.fillStyle = '#9fe0ff'; circle(ctx, -14, -28, 4); ctx.fill(); circle(ctx, -4, -30, 3); ctx.fill();
  });
  var ball = icon(function (ctx) {
    circle(ctx, 0, 0, 36); fillInk(ctx, '#ffffff', 4);
    ctx.fillStyle = INK;
    ctx.beginPath(); for (var i = 0; i < 5; i++) { var a = -Math.PI / 2 + i * TAU / 5; ctx.lineTo(Math.cos(a) * 12, Math.sin(a) * 12); } ctx.closePath(); ctx.fill();
    for (var k = 0; k < 5; k++) { var b = -Math.PI / 2 + k * TAU / 5; circle(ctx, Math.cos(b) * 30, Math.sin(b) * 30, 7); ctx.fill(); }
    ctx.fillStyle = '#7ccf5a'; ctx.fillRect(-46, 36, 92, 8);
  });
  var whale = icon(function (ctx, t) {
    ctx.beginPath(); ctx.moveTo(-40, 6); ctx.bezierCurveTo(-40, -30, 30, -30, 34, 0); ctx.lineTo(48, -16); ctx.lineTo(46, 14); ctx.lineTo(32, 10); ctx.bezierCurveTo(20, 26, -40, 28, -40, 6); ctx.closePath();
    fillInk(ctx, '#5f8fd6', 4);
    ctx.beginPath(); ctx.ellipse(-8, 14, 22, 8, 0, 0, Math.PI); ctx.fillStyle = '#cfe2ff'; ctx.fill();
    face(ctx, -18, -2, 0.9);
    ctx.strokeStyle = '#5fc0e8'; ctx.lineWidth = 3;
    var k = Math.sin(t * 4) * 3;
    ctx.beginPath(); ctx.moveTo(-6, -24); ctx.quadraticCurveTo(-14, -40 + k, -20, -36); ctx.moveTo(-6, -24); ctx.quadraticCurveTo(2, -42 + k, 8, -36); ctx.stroke();
  });
  function chick(ctx, dir) {
    ctx.save(); ctx.scale(dir, 1);
    ctx.beginPath(); ctx.ellipse(0, 10, 22, 20, 0, 0, TAU); fillInk(ctx, '#ffffff', 3.5);
    circle(ctx, 8, -16, 13); fillInk(ctx, '#ffffff', 3.5);
    ctx.beginPath(); ctx.arc(4, -30, 5, 0, TAU); ctx.arc(10, -31, 5, 0, TAU); fillInk(ctx, '#e5484d', 2.5);
    ctx.beginPath(); ctx.moveTo(20, -18); ctx.lineTo(30, -14); ctx.lineTo(20, -10); ctx.closePath(); fillInk(ctx, '#ffc94a', 2.5);
    ctx.fillStyle = INK; circle(ctx, 12, -18, 2.5); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-20, 0); ctx.quadraticCurveTo(-34, -14, -26, -24); ink(ctx, 3);
    ctx.restore();
  }
  var chickens = icon(function (ctx) {
    ctx.save(); ctx.translate(-24, 12); chick(ctx, 1); ctx.restore();
    ctx.save(); ctx.translate(24, 12); chick(ctx, -1); ctx.restore();
  });
  function catHead(ctx) {
    ctx.beginPath(); ctx.moveTo(-30, -14); ctx.lineTo(-26, -40); ctx.lineTo(-10, -26); ctx.lineTo(10, -26); ctx.lineTo(26, -40); ctx.lineTo(30, -14);
    ctx.quadraticCurveTo(34, 24, 0, 26); ctx.quadraticCurveTo(-34, 24, -30, -14); ctx.closePath();
    fillInk(ctx, '#ffb86b', 4);
    face(ctx, 0, -2, 1.2);
    ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-14, 6); ctx.lineTo(-32, 2); ctx.moveTo(-14, 10); ctx.lineTo(-32, 12); ctx.moveTo(14, 6); ctx.lineTo(32, 2); ctx.moveTo(14, 10); ctx.lineTo(32, 12); ctx.stroke();
  }
  // Đôi mèo (câu Hòn Trống Mái).
  var cats = icon(function (ctx) {
    ctx.save(); ctx.translate(-24, 4); ctx.scale(0.7, 0.7); catHead(ctx); ctx.restore();
    ctx.save(); ctx.translate(24, 4); ctx.scale(0.7, 0.7); catHead(ctx); ctx.restore();
  });
  // Chín con mèo (câu Cửu Long): 1 mèo + nhãn ×9.
  var nineCats = icon(function (ctx) {
    ctx.save(); ctx.translate(0, -6); catHead(ctx); ctx.restore();
    OG.util.roundRectPath(ctx, -20, 26, 40, 18, 6); fillInk(ctx, '#ffd23f', 3);
    ctx.fillStyle = INK; ctx.font = OG.font(15, 'bold'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('×9', 0, 36);
  });
  var soupBowl = icon(function (ctx, t) {
    ctx.beginPath(); ctx.moveTo(-40, -6); ctx.quadraticCurveTo(-36, 34, 0, 34); ctx.quadraticCurveTo(36, 34, 40, -6); ctx.closePath(); fillInk(ctx, '#ffffff', 4);
    ctx.beginPath(); ctx.ellipse(0, -6, 40, 9, 0, 0, TAU); fillInk(ctx, '#ff9f43', 3);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 3;
    for (var k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(k * 14, -18); ctx.quadraticCurveTo(k * 14 + Math.sin(t * 3 + k) * 6, -28, k * 14, -40); ctx.stroke(); }
    face(ctx, 0, 14, 1, 'o');
  });
  var snowman = icon(function (ctx) {
    circle(ctx, 0, 18, 26); fillInk(ctx, '#ffffff', 4);
    circle(ctx, 0, -20, 18); fillInk(ctx, '#ffffff', 4);
    face(ctx, 0, -22, 0.9);
    ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(14, -15); ctx.lineTo(0, -14); ctx.closePath(); ctx.fillStyle = '#ff9f43'; ctx.fill();
    ctx.fillStyle = INK; OG.util.roundRectPath(ctx, -14, -48, 28, 12, 3); ctx.fill(); ctx.fillRect(-20, -38, 40, 4);
    ctx.fillStyle = '#e5484d'; ctx.fillRect(-16, -6, 32, 6);
  });
  var cottonCandy = icon(function (ctx) {
    ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(0, 46); ink(ctx, 5);
    ctx.beginPath(); ctx.arc(-14, -6, 18, 0, TAU); ctx.moveTo(32, -6); ctx.arc(14, -6, 18, 0, TAU); ctx.moveTo(20, -24); ctx.arc(0, -24, 20, 0, TAU); ctx.moveTo(16, 4); ctx.arc(0, 4, 16, 0, TAU);
    fillOut(ctx, '#ffb3d9', 3);
    face(ctx, 0, -8, 1);
  });
  var windmill = icon(function (ctx, t) {
    ctx.beginPath(); ctx.moveTo(-18, 44); ctx.lineTo(-10, -18); ctx.lineTo(10, -18); ctx.lineTo(18, 44); ctx.closePath(); fillInk(ctx, '#e8d3b0', 4);
    face(ctx, 0, 12, 0.9);
    ctx.save(); ctx.translate(0, -20); ctx.rotate(t * 1.5);
    for (var i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); OG.util.roundRectPath(ctx, -5, -44, 10, 40, 3); fillInk(ctx, '#ffffff', 3); }
    circle(ctx, 0, 0, 5); fillInk(ctx, '#e5484d', 2);
    ctx.restore();
  });
  var cloud = icon(function (ctx) {
    ctx.beginPath(); ctx.arc(-22, 8, 20, 0, TAU); ctx.moveTo(26, -8); ctx.arc(0, -8, 26, 0, TAU); ctx.moveTo(44, 8); ctx.arc(24, 8, 20, 0, TAU); ctx.rect(-22, 8, 46, 20);
    fillOut(ctx, '#ffffff', 3);
    face(ctx, 0, 4, 1);
  });

  // ---- Hình thẻ kiến thức ----
  var ICON = {
    turtletower: dec('turtletower', 0.7, 0.4),
    pho: dec('pho', 0.75, 0.44),
    tubehouse: dec('tubehouse', 0.62, 0.44, { color: '#f4c95d', h: 110 }),
    puppet: dec('puppet', 0.8, 0.42),
    karst: dec('karst', 0.68, 0.42, { h: 115, w: 48 }),
    heritage: dec('heritage', 0.85, 0.44),
    cave: dec('cave', 0.78, 0.42),
    kissrocks: dec('kissrocks', 0.72, 0.42),
    ngomon: dec('ngomon', 0.46, 0.3),
    nonla: dec('nonla', 0.85, 0.28),
    dragonboat: dec('dragonboat', 0.5, 0.24),
    saola: dec('saola', 0.68, 0.4),
    lantern: dec('lantern', 0.8, 0.46),
    yellowhouse: dec('yellowhouse', 0.7, 0.4, { c: 0 }),
    chuacau: dec('chuacau', 0.46, 0.28),
    douc: dec('douc', 0.88, 0.42),
    scooter: dec('scooter', 0.8, 0.34, { color: '#ff6b6b' }),
    banhmi: dec('banhmi', 0.82, 0.24),
    benthanh: dec('benthanh', 0.4, 0.3),
    monkey: dec('monkey', 0.82, 0.42),
    floatboat: dec('floatboat', 0.58, 0.42),
    fruits: dec('fruits', 0.9, 0.4),
    dragon: dec('dragon', 0.76, 0.3),
    rice: dec('rice', 1.05, 0.38),
    coconut: dec('coconut', 0.58, 0.42),
    junk: dec('junk', 0.62, 0.36)
  };

  OG.Journeys.register({
    id: 'vietnam',
    cards: [
      // ---- Hà Nội ----
      { id: 'hn_hoguom', areaId: 'hanoi', title: 'Hồ Gươm', drawIcon: ICON.turtletower,
        fact: 'Hồ Gươm nằm ở trung tâm thủ đô Hà Nội. Giữa hồ có Tháp Rùa nhỏ xinh, ai đến Hà Nội cũng muốn ghé thăm.' },
      { id: 'hn_pho', areaId: 'hanoi', title: 'Phở', drawIcon: ICON.pho,
        fact: 'Phở là món ăn nổi tiếng của Việt Nam, có bánh phở mềm, nước dùng thơm và rau thơm. Nhiều bạn nước ngoài cũng rất thích phở!' },
      { id: 'hn_oldquarter', areaId: 'hanoi', title: 'Phố cổ Hà Nội', drawIcon: ICON.tubehouse,
        fact: 'Phố cổ Hà Nội có nhiều phố tên “Hàng” như Hàng Bạc, Hàng Đường. Ngày xưa, mỗi phố thường bán một loại hàng.' },
      { id: 'hn_puppet', areaId: 'hanoi', title: 'Múa rối nước', drawIcon: ICON.puppet,
        fact: 'Múa rối nước là nghệ thuật dân gian rất xưa của Việt Nam. Các con rối nhảy múa ngay trên mặt nước!' },
      // ---- Hạ Long ----
      { id: 'hl_islands', areaId: 'halong', title: 'Đảo đá vôi', drawIcon: ICON.karst,
        fact: 'Vịnh Hạ Long có hơn một nghìn hòn đảo đá vôi. Tên “Hạ Long” có nghĩa là “rồng hạ xuống”!' },
      { id: 'hl_heritage', areaId: 'halong', title: 'Di sản thế giới', drawIcon: ICON.heritage,
        fact: 'Vịnh Hạ Long được UNESCO công nhận là Di sản thiên nhiên thế giới. Mình cùng giữ cho vịnh luôn sạch đẹp nhé!' },
      { id: 'hl_cave', areaId: 'halong', title: 'Hang động', drawIcon: ICON.cave,
        fact: 'Nhiều đảo ở Hạ Long có hang động bên trong. Trong hang có thạch nhũ đủ hình thù, như một cung điện đá!' },
      { id: 'hl_rocks', areaId: 'halong', title: 'Hòn Trống Mái', drawIcon: ICON.kissrocks,
        fact: 'Hòn Trống Mái là hai tảng đá đứng sát nhau giữa vịnh, trông như một đôi gà đứng quay mặt vào nhau.' },
      // ---- Huế ----
      { id: 'hue_citadel', areaId: 'hue', title: 'Kinh thành Huế', drawIcon: ICON.ngomon,
        fact: 'Huế từng là kinh đô của Việt Nam thời nhà Nguyễn. Ngọ Môn là cổng chính rất to và đẹp của Hoàng thành Huế.' },
      { id: 'hue_nonla', areaId: 'hue', title: 'Nón lá', drawIcon: ICON.nonla,
        fact: 'Nón lá làm từ lá cây, giúp che nắng che mưa. Nón bài thơ xứ Huế giấu hình và thơ giữa các lớp lá!' },
      { id: 'hue_river', areaId: 'hue', title: 'Sông Hương', drawIcon: ICON.dragonboat,
        fact: 'Sông Hương chảy hiền hoà qua thành phố Huế. Du khách thích ngồi thuyền rồng ngắm cảnh trên sông.' },
      { id: 'hue_saola', areaId: 'hue', title: 'Sao la', drawIcon: ICON.saola,
        fact: 'Sao la là loài thú rất hiếm, sống trong rừng núi Trường Sơn. Sao la có hai chiếc sừng dài và thẳng.' },
      // ---- Hội An ----
      { id: 'ha_lantern', areaId: 'hoian', title: 'Đèn lồng Hội An', drawIcon: ICON.lantern,
        fact: 'Hội An nổi tiếng với đèn lồng nhiều màu. Buổi tối, đèn thắp sáng khắp phố cổ, lung linh như cổ tích!' },
      { id: 'ha_oldtown', areaId: 'hoian', title: 'Phố cổ Hội An', drawIcon: ICON.yellowhouse,
        fact: 'Phố cổ Hội An có những ngôi nhà tường vàng, mái ngói cổ. Nơi đây là Di sản văn hoá thế giới.' },
      { id: 'ha_bridge', areaId: 'hoian', title: 'Chùa Cầu', drawIcon: ICON.chuacau,
        fact: 'Chùa Cầu là cây cầu có mái che, xây từ rất lâu ở Hội An. Hình Chùa Cầu được in trên tờ tiền 20.000 đồng!' },
      { id: 'ha_douc', areaId: 'hoian', title: 'Voọc chà vá chân nâu', drawIcon: ICON.douc,
        fact: 'Voọc chà vá chân nâu có bộ lông nhiều màu như mặc áo. Nhiều chú voọc sống ở bán đảo Sơn Trà, Đà Nẵng, gần Hội An.' },
      // ---- TP. Hồ Chí Minh ----
      { id: 'sg_city', areaId: 'saigon', title: 'TP. Hồ Chí Minh', drawIcon: ICON.scooter,
        fact: 'TP. Hồ Chí Minh là thành phố đông dân nhất Việt Nam. Đường phố lúc nào cũng nhộn nhịp xe máy!' },
      { id: 'sg_banhmi', areaId: 'saigon', title: 'Bánh mì', drawIcon: ICON.banhmi,
        fact: 'Bánh mì Việt Nam có vỏ giòn rụm, kẹp thịt, pa-tê, rau thơm và đồ chua. Nhiều du khách nước ngoài rất mê!' },
      { id: 'sg_market', areaId: 'saigon', title: 'Chợ Bến Thành', drawIcon: ICON.benthanh,
        fact: 'Chợ Bến Thành là ngôi chợ nổi tiếng ở TP. Hồ Chí Minh. Cổng chính của chợ có một tháp đồng hồ.' },
      { id: 'sg_cangio', areaId: 'saigon', title: 'Rừng Cần Giờ', drawIcon: ICON.monkey,
        fact: 'Rừng Cần Giờ là rừng ngập mặn rộng lớn ở TP. Hồ Chí Minh. Ở đây có rất nhiều chú khỉ tinh nghịch!' },
      // ---- Miền Tây ----
      { id: 'mt_floating', areaId: 'mientay', title: 'Chợ nổi', drawIcon: ICON.floatboat,
        fact: 'Ở miền Tây có chợ nổi: người ta mua bán ngay trên thuyền! Thuyền bán gì thì treo món đó lên cây sào cao.' },
      { id: 'mt_fruit', areaId: 'mientay', title: 'Vườn trái cây', drawIcon: ICON.fruits,
        fact: 'Miền Tây có rất nhiều vườn trái cây: xoài, chôm chôm, sầu riêng, măng cụt… Ngọt ơi là ngọt!' },
      { id: 'mt_mekong', areaId: 'mientay', title: 'Sông Mê Kông', drawIcon: ICON.dragon,
        fact: 'Sông Mê Kông chảy qua sáu nước. Ở Việt Nam, sông chia nhiều nhánh đổ ra biển, gọi là Cửu Long, nghĩa là “chín con rồng”.' },
      { id: 'mt_rice', areaId: 'mientay', title: 'Vựa lúa', drawIcon: ICON.rice,
        fact: 'Đồng bằng sông Cửu Long là vựa lúa lớn nhất Việt Nam. Gạo ở đây được bán đi nhiều nước trên thế giới!' }
    ],

    quizzes: [
      { id: 'q_hn_capital', areaId: 'hanoi', cardId: 'hn_hoguom', question: 'Thủ đô của Việt Nam là thành phố nào?',
        choices: [{ text: 'Hà Nội', icon: ICON.turtletower }, { text: 'Bắc Cực', icon: igloo }],
        answer: 0, hint: 'Gợi ý: thành phố này có Hồ Gươm và Tháp Rùa đó!', explain: 'Đúng rồi! Hà Nội là thủ đô của Việt Nam.' },
      { id: 'q_hn_puppet', areaId: 'hanoi', cardId: 'hn_puppet', question: 'Múa rối nước biểu diễn ở đâu?',
        choices: [{ text: 'Trên mặt nước', icon: ICON.puppet }, { text: 'Trên ngọn cây', icon: dec('tree', 0.8, 0.45, { own: true }) }, { text: 'Trong tủ lạnh', icon: fridge }],
        answer: 0, hint: 'Gợi ý: tên của nó có chữ “nước” đó!', explain: 'Giỏi quá! Con rối nhảy múa ngay trên mặt nước.' },
      { id: 'q_hl_heritage', areaId: 'halong', cardId: 'hl_heritage', question: 'UNESCO công nhận Vịnh Hạ Long là gì?',
        choices: [{ text: 'Di sản thiên nhiên thế giới', icon: ICON.heritage }, { text: 'Sân bóng khổng lồ', icon: ball }],
        answer: 0, hint: 'Gợi ý: cả thế giới cùng nhau giữ gìn nơi này!', explain: 'Chính xác! Hạ Long là Di sản thiên nhiên thế giới.' },
      { id: 'q_hl_rocks', areaId: 'halong', cardId: 'hl_rocks', question: 'Hòn Trống Mái trông giống đôi con vật nào?',
        choices: [{ text: 'Đôi cá voi', icon: whale }, { text: 'Đôi gà', icon: chickens }, { text: 'Đôi mèo', icon: cats }],
        answer: 1, hint: 'Gợi ý: con vật này gáy “ò ó o” mỗi sáng!', explain: 'Đúng rồi! Hai hòn đá trông như một đôi gà.' },
      { id: 'q_hue_nonla', areaId: 'hue', cardId: 'hue_nonla', question: 'Nón lá giúp chúng ta làm gì?',
        choices: [{ text: 'Che nắng, che mưa', icon: ICON.nonla }, { text: 'Đựng canh nóng', icon: soupBowl }],
        answer: 0, hint: 'Gợi ý: mình đội nón lá lên đầu khi trời nắng!', explain: 'Đúng rồi! Nón lá che nắng, che mưa rất tốt.' },
      { id: 'q_hue_capital', areaId: 'hue', cardId: 'hue_citadel', question: 'Thành phố nào từng là kinh đô thời nhà Nguyễn?',
        choices: [{ text: 'Hạ Long', icon: ICON.karst }, { text: 'Huế', icon: ICON.ngomon }],
        answer: 1, hint: 'Gợi ý: nơi có Ngọ Môn và sông Hương!', explain: 'Chính xác! Huế từng là kinh đô của Việt Nam.' },
      { id: 'q_ha_lantern', areaId: 'hoian', cardId: 'ha_lantern', question: 'Buổi tối, phố cổ Hội An lung linh nhờ gì?',
        choices: [{ text: 'Đèn lồng', icon: ICON.lantern }, { text: 'Người tuyết', icon: snowman }],
        answer: 0, hint: 'Gợi ý: thứ này tròn tròn, nhiều màu và phát sáng!', explain: 'Đúng rồi! Đèn lồng làm Hội An sáng lung linh.' },
      { id: 'q_ha_bridge', areaId: 'hoian', cardId: 'ha_bridge', question: 'Chùa Cầu ở Hội An là gì?',
        choices: [{ text: 'Thuyền buồm', icon: ICON.junk }, { text: 'Cây cầu có mái che', icon: ICON.chuacau }],
        answer: 1, hint: 'Gợi ý: trong tên có chữ “Cầu” đó!', explain: 'Giỏi quá! Chùa Cầu là cây cầu có mái che rất xưa.' },
      { id: 'q_sg_banhmi', areaId: 'saigon', cardId: 'sg_banhmi', question: 'Vỏ bánh mì Việt Nam như thế nào?',
        choices: [{ text: 'Mềm như kẹo bông', icon: cottonCandy }, { text: 'Giòn rụm', icon: ICON.banhmi }],
        answer: 1, hint: 'Gợi ý: cắn vào nghe “rộp rộp” đó!', explain: 'Đúng rồi! Bánh mì Việt Nam giòn rụm, thơm phức.' },
      { id: 'q_sg_market', areaId: 'saigon', cardId: 'sg_market', question: 'Cổng chính chợ Bến Thành có gì?',
        choices: [{ text: 'Tháp đồng hồ', icon: ICON.benthanh }, { text: 'Cối xay gió', icon: windmill }],
        answer: 0, hint: 'Gợi ý: thứ này cho mình biết bây giờ là mấy giờ!', explain: 'Chính xác! Chợ Bến Thành có tháp đồng hồ ở cổng chính.' },
      { id: 'q_mt_floating', areaId: 'mientay', cardId: 'mt_floating', question: 'Ở chợ nổi, người ta mua bán ở đâu?',
        choices: [{ text: 'Trên thuyền', icon: ICON.floatboat }, { text: 'Trên mây', icon: cloud }, { text: 'Trên cây dừa', icon: ICON.coconut }],
        answer: 0, hint: 'Gợi ý: chợ nổi ở ngay trên sông đó!', explain: 'Đúng rồi! Ở chợ nổi, mọi người mua bán trên thuyền.' },
      { id: 'q_mt_mekong', areaId: 'mientay', cardId: 'mt_mekong', question: '“Cửu Long” có nghĩa là gì?',
        choices: [{ text: 'Chín con mèo', icon: nineCats }, { text: 'Chín con rồng', icon: ICON.dragon }],
        answer: 1, hint: 'Gợi ý: “Long” nghĩa là con rồng!', explain: 'Giỏi quá! Cửu Long nghĩa là chín con rồng.' }
    ],

    comics: {
      // ---- Mở đầu hành trình ----
      intro: [
        { bg: 'vietnam-hanoi', chars: [{ id: 'bob', anim: 'wave', x: 0.34 }, { id: 'oggy', anim: 'idle', x: 0.62, face: -1 }],
          bubbles: [{ who: 'bob', text: 'Gâu! Oggy ơi, mình dẫn bạn đi vòng quanh Việt Nam nhé!' }] },
        { bg: 'vietnam-hanoi', chars: [{ id: 'oggy', anim: 'victory', x: 0.4 }, { id: 'bob', anim: 'talk', x: 0.66, face: -1 }],
          bubbles: [{ who: 'oggy', text: 'Tuyệt quá! Mình mang theo cuốn Sổ tay Du lịch rồi!' }] },
        { bg: 'vietnam-hanoi', chars: [{ id: 'oggy', anim: 'hurt', x: 0.22 }, { id: 'joey', anim: 'run', x: 0.56, accessory: 'nonla' }, { id: 'marky', anim: 'run', x: 0.7 }, { id: 'deedee', anim: 'run', x: 0.86 }],
          bubbles: [{ who: 'joey', text: 'Hí hí! Sổ tay đẹp quá, cho tụi tớ mượn đi chơi nha!' }] },
        { bg: 'vietnam-hanoi', chars: [{ id: 'oggy', anim: 'think', x: 0.4 }],
          caption: 'Gió thổi tung các trang sổ tay bay khắp Việt Nam, từ Bắc vào Nam!' },
        { bg: 'vietnam-hanoi', chars: [{ id: 'bob', anim: 'point', x: 0.4 }, { id: 'oggy', anim: 'victory', x: 0.64, face: -1 }],
          bubbles: [{ who: 'bob', text: 'Đừng lo! Mình cùng nhặt lại từng trang. Xuất phát từ Hà Nội nào!' }] }
      ],

      // ---- Hà Nội ----
      hanoi_intro: [
        { bg: 'vietnam-hanoi', chars: [{ id: 'bob', anim: 'talk', x: 0.3 }, { id: 'turtle', anim: 'wave', x: 0.66, face: -1 }],
          bubbles: [{ who: 'bob', text: 'Hà Nội đây rồi! Kia là Hồ Gươm và Tháp Rùa xinh xắn.' }, { who: 'turtle', text: 'Chào các cháu! Ta thấy Joey chạy vào phố cổ đó.' }] }
      ],
      hanoi_outro: [
        { bg: 'vietnam-hanoi', chars: [{ id: 'joey', anim: 'hurt', x: 0.6, face: -1 }, { id: 'oggy', anim: 'victory', x: 0.3 }],
          bubbles: [{ who: 'joey', text: 'Ối, Oggy nhanh quá! Tụi mình ra vịnh Hạ Long thôi!' }] },
        { bg: 'vietnam-hanoi', chars: [{ id: 'bob', anim: 'point', x: 0.5 }],
          bubbles: [{ who: 'bob', text: 'Lên xe đi Hạ Long nào! Biển xanh đang chờ mình đó!' }] }
      ],

      // ---- Hạ Long ----
      halong_intro: [
        { bg: 'vietnam-halong', chars: [{ id: 'oggy', anim: 'victory', x: 0.3 }, { id: 'bob', anim: 'point', x: 0.55, face: -1 }],
          bubbles: [{ who: 'oggy', text: 'Oa! Bao nhiêu là đảo đá nhô lên giữa biển!' }] },
        { bg: 'vietnam-halong', chars: [{ id: 'marky', anim: 'victory', x: 0.62, face: -1 }],
          bubbles: [{ who: 'marky', text: 'Hòn đảo nào cũng đẹp như mình vậy! Đuổi theo mình đi!' }] }
      ],
      halong_cave: [
        { bg: 'vietnam-halongcave', chars: [{ id: 'deedee', anim: 'talk', x: 0.66, face: -1 }, { id: 'oggy', anim: 'think', x: 0.3 }],
          bubbles: [{ who: 'deedee', text: 'Ê-hê-hê! Ê-hê... ê-hê... ê-hê...' }] },
        { bg: 'vietnam-halongcave', chars: [{ id: 'bob', anim: 'talk', x: 0.4 }, { id: 'oggy', anim: 'idle', x: 0.62, face: -1 }],
          bubbles: [{ who: 'bob', text: 'Đó là tiếng vọng! Trong hang rộng, tiếng nói dội lại nhiều lần.' }] }
      ],
      halong_outro: [
        { bg: 'vietnam-halong', chars: [{ id: 'marky', anim: 'hurt', x: 0.62, face: -1 }, { id: 'oggy', anim: 'victory', x: 0.3 }],
          bubbles: [{ who: 'marky', text: 'Ướt hết bộ cánh rồi! Mình vào Huế tìm nón lá đẹp đây!' }] }
      ],

      // ---- Huế ----
      hue_intro: [
        { bg: 'vietnam-hue', chars: [{ id: 'bob', anim: 'point', x: 0.32 }, { id: 'oggy', anim: 'idle', x: 0.56, face: -1 }],
          bubbles: [{ who: 'bob', text: 'Huế từng là kinh đô. Nhìn Ngọ Môn kìa, to và đẹp quá!' }] },
        { bg: 'vietnam-hue', chars: [{ id: 'deedee', anim: 'victory', x: 0.62, face: -1, accessory: 'nonla' }],
          bubbles: [{ who: 'deedee', text: 'Đội nón lá đi ăn bún bò Huế thôi! Ngon quá đi mất!' }] }
      ],
      hue_outro: [
        { bg: 'vietnam-hue', chars: [{ id: 'deedee', anim: 'hurt', x: 0.62, face: -1 }, { id: 'bob', anim: 'talk', x: 0.32 }],
          bubbles: [{ who: 'deedee', text: 'Hì hì, trả bạn trang sổ tay nè. Hội An gặp lại nha!' }, { who: 'bob', text: 'Đi tiếp vào Hội An thôi!' }] }
      ],

      // ---- Hội An ----
      hoian_intro: [
        { bg: 'vietnam-hoian', chars: [{ id: 'lion_dance', anim: 'victory', x: 0.66, face: -1 }, { id: 'oggy', anim: 'idle', x: 0.3 }],
          bubbles: [{ who: 'lion_dance', text: 'Tùng tùng xèng! Chào mừng tới phố cổ Hội An!' }] },
        { bg: 'vietnam-hoian', chars: [{ id: 'joey', anim: 'run', x: 0.6 }, { id: 'bob', anim: 'think', x: 0.3 }],
          bubbles: [{ who: 'joey', text: 'Đèn lồng đẹp quá! Tụi mình mang về nhà hết!' }, { who: 'bob', text: 'Ấy! Đèn lồng là để cả phố cùng ngắm mà!' }] }
      ],
      hoian_outro: [
        { bg: 'vietnam-hoian', chars: [{ id: 'joey', anim: 'think', x: 0.62, face: -1 }, { id: 'oggy', anim: 'idle', x: 0.3 }],
          bubbles: [{ who: 'joey', text: 'Thôi được rồi... tụi mình treo đèn lồng lại chỗ cũ.' }] },
        { bg: 'vietnam-hoian', chars: [{ id: 'bob', anim: 'victory', x: 0.5 }],
          bubbles: [{ who: 'bob', text: 'Giỏi lắm! Giờ mình bay vào TP. Hồ Chí Minh nhé!' }] }
      ],

      // ---- TP. Hồ Chí Minh ----
      saigon_intro: [
        { bg: 'vietnam-saigon', chars: [{ id: 'bob', anim: 'talk', x: 0.3 }, { id: 'oggy', anim: 'idle', x: 0.55, face: -1 }],
          bubbles: [{ who: 'bob', text: 'TP. Hồ Chí Minh nhộn nhịp quá! Xe máy chạy khắp nơi.' }] },
        { bg: 'vietnam-saigon', chars: [{ id: 'deedee', anim: 'victory', x: 0.62, face: -1 }],
          bubbles: [{ who: 'deedee', text: 'Bánh mì giòn rụm! Mình ăn mười ổ luôn!' }] }
      ],
      saigon_market: [
        { bg: 'vietnam-saigon', chars: [{ id: 'deedee', anim: 'run', x: 0.7 }, { id: 'oggy', anim: 'run', x: 0.3 }],
          caption: 'Dee Dee chui tọt vào chợ Bến Thành tìm đồ ăn ngon!' },
        { bg: 'vietnam-saigon', chars: [{ id: 'oggy', anim: 'think', x: 0.4 }, { id: 'bob', anim: 'point', x: 0.62, face: -1 }],
          bubbles: [{ who: 'bob', text: 'Nhìn tháp đồng hồ kìa! Chợ Bến Thành ở ngay phía trước.' }] }
      ],
      saigon_outro: [
        { bg: 'vietnam-saigon', chars: [{ id: 'deedee', anim: 'hurt', x: 0.62, face: -1 }, { id: 'oggy', anim: 'victory', x: 0.3 }],
          bubbles: [{ who: 'deedee', text: 'No căng bụng rồi... Tụi mình trốn xuống miền Tây đây!' }] }
      ],

      // ---- Miền Tây ----
      mientay_intro: [
        { bg: 'vietnam-mientay', chars: [{ id: 'bob', anim: 'point', x: 0.3 }, { id: 'buffalo', anim: 'wave', x: 0.66, face: -1 }],
          bubbles: [{ who: 'bob', text: 'Chợ nổi miền Tây! Người ta bán hàng ngay trên thuyền.' }, { who: 'buffalo', text: 'Nghé ọ! Bộ ba gián trốn trên thuyền dưa hấu đó!' }] }
      ],

      // ---- Kết thúc hành trình ----
      ending: [
        { bg: 'vietnam-mientay', chars: [{ id: 'joey', anim: 'think', x: 0.5 }, { id: 'marky', anim: 'think', x: 0.64 }, { id: 'deedee', anim: 'think', x: 0.8 }, { id: 'oggy', anim: 'idle', x: 0.24 }],
          bubbles: [{ who: 'joey', text: 'Tụi mình xin lỗi. Tụi mình chỉ muốn được đi du lịch thôi.' }] },
        { bg: 'vietnam-mientay', chars: [{ id: 'bob', anim: 'talk', x: 0.36 }, { id: 'joey', anim: 'idle', x: 0.66, face: -1 }],
          bubbles: [{ who: 'bob', text: 'Muốn đi chơi thì rủ nhau đi cùng, đừng giành đồ của bạn nhé!' }] },
        { bg: 'vietnam-mientay', chars: [{ id: 'oggy', anim: 'victory', x: 0.24 }, { id: 'bob', anim: 'victory', x: 0.42 }, { id: 'joey', anim: 'victory', x: 0.6 }, { id: 'marky', anim: 'victory', x: 0.72 }, { id: 'deedee', anim: 'victory', x: 0.86 }],
          caption: 'Cả nhóm cùng ăn trái cây trên chợ nổi. Sổ tay Du lịch đã đầy đủ rồi!' },
        { bg: 'vietnam-mientay', chars: [{ id: 'bob', anim: 'wave', x: 0.5 }],
          bubbles: [{ who: 'bob', text: 'Việt Nam mình đẹp quá! Hẹn gặp lại bạn ở chuyến đi sau nhé!' }] }
      ]
    }
  });
})();
