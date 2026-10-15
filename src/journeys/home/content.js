/* Hành trình "home" — NỘI DUNG HỌC: thẻ kiến thức, câu đố, truyện tranh.
 * Chủ sở hữu v2: agent journey-home (CHỈ src/journeys/home/). Hợp đồng: docs/STORY.md mục 2.
 * Gọi OG.Journeys.register({id:'home', cards, quizzes, comics}) — được GỘP với journey.js.
 * BẢN STUB: vài thẻ/câu đố/truyện mẫu. Câu chữ: ngắn, đơn giản, tích cực (trẻ 5–10 tuổi). */
(function () {
  'use strict';
  var OG = window.OG;
  var TAU = Math.PI * 2;
  var INK = '#17233d';

  // ---- Hình minh hoạ thẻ (vẽ bằng canvas, (x,y) = tâm, size = cạnh ô) ----
  function smile(ctx, x, y, s) {
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.arc(x - 6 * s, y, 2.5 * s, 0, TAU); ctx.arc(x + 6 * s, y, 2.5 * s, 0, TAU); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 2 * s; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x, y + 3 * s, 4.5 * s, 0.25, Math.PI - 0.25); ctx.stroke();
  }
  function broccoli(ctx, x, y, size) {
    var s = size / 100;
    ctx.fillStyle = '#7ccf5a'; ctx.strokeStyle = INK; ctx.lineWidth = 4 * s;
    ctx.beginPath(); ctx.moveTo(x - 12 * s, y + 40 * s); ctx.lineTo(x - 8 * s, y); ctx.lineTo(x + 8 * s, y); ctx.lineTo(x + 12 * s, y + 40 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#3fa34d';
    ctx.beginPath(); ctx.arc(x - 20 * s, y - 8 * s, 18 * s, 0, TAU); ctx.arc(x + 20 * s, y - 8 * s, 18 * s, 0, TAU); ctx.arc(x, y - 22 * s, 22 * s, 0, TAU); ctx.fill(); ctx.stroke();
    smile(ctx, x, y - 14 * s, s);
  }
  function pot(ctx, x, y, size) {
    var s = size / 100;
    ctx.fillStyle = '#e5484d'; ctx.strokeStyle = INK; ctx.lineWidth = 4 * s;
    OG.util.roundRectPath(ctx, x - 34 * s, y - 14 * s, 68 * s, 46 * s, 12 * s); ctx.fill(); ctx.stroke();
    ctx.fillRect(x - 42 * s, y - 20 * s, 84 * s, 8 * s); ctx.strokeRect(x - 42 * s, y - 20 * s, 84 * s, 8 * s);
    ctx.strokeStyle = 'rgba(160,170,190,0.9)'; ctx.lineWidth = 4 * s;
    for (var i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(x + i * 16 * s, y - 28 * s); ctx.quadraticCurveTo(x + i * 16 * s + 8 * s, y - 40 * s, x + i * 16 * s, y - 50 * s); ctx.stroke(); }
    smile(ctx, x, y + 6 * s, s);
  }
  function bee(ctx, x, y, size) {
    var s = size / 100;
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.strokeStyle = INK; ctx.lineWidth = 3 * s;
    ctx.beginPath(); ctx.ellipse(x - 10 * s, y - 26 * s, 14 * s, 20 * s, -0.4, 0, TAU); ctx.ellipse(x + 10 * s, y - 26 * s, 14 * s, 20 * s, 0.4, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.ellipse(x, y, 36 * s, 26 * s, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = INK; ctx.fillRect(x - 8 * s, y - 25 * s, 7 * s, 50 * s); ctx.fillRect(x + 10 * s, y - 23 * s, 7 * s, 46 * s);
    ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(x - 26 * s, y, 15 * s, 0, TAU); ctx.fill(); ctx.stroke();
    smile(ctx, x - 26 * s, y - 2 * s, 0.7 * s);
  }
  function cloud(ctx, x, y, size) {
    var s = size / 100;
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = INK; ctx.lineWidth = 4 * s;
    ctx.beginPath(); ctx.arc(x - 24 * s, y + 4 * s, 20 * s, 0, TAU); ctx.arc(x, y - 12 * s, 26 * s, 0, TAU); ctx.arc(x + 26 * s, y + 4 * s, 20 * s, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillRect(x - 24 * s, y + 4 * s, 50 * s, 20 * s);
    ctx.fillStyle = '#6cc6f2';
    for (var i = -1; i <= 1; i++) { ctx.beginPath(); ctx.ellipse(x + i * 18 * s, y + 42 * s, 4 * s, 7 * s, 0, 0, TAU); ctx.fill(); }
    smile(ctx, x, y - 4 * s, s);
  }
  function bottle(ctx, x, y, size) {
    var s = size / 100;
    ctx.fillStyle = '#8fd6f7'; ctx.strokeStyle = INK; ctx.lineWidth = 4 * s;
    OG.util.roundRectPath(ctx, x - 18 * s, y - 24 * s, 36 * s, 64 * s, 12 * s); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#3fbf6f'; ctx.fillRect(x - 8 * s, y - 40 * s, 16 * s, 16 * s); ctx.strokeRect(x - 8 * s, y - 40 * s, 16 * s, 16 * s);
    smile(ctx, x, y + 2 * s, s);
  }
  function candy(ctx, x, y, size) {
    var s = size / 100;
    ctx.fillStyle = '#f29bb8'; ctx.strokeStyle = INK; ctx.lineWidth = 4 * s;
    ctx.beginPath(); ctx.moveTo(x - 26 * s, y); ctx.lineTo(x - 44 * s, y - 14 * s); ctx.lineTo(x - 44 * s, y + 14 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 26 * s, y); ctx.lineTo(x + 44 * s, y - 14 * s); ctx.lineTo(x + 44 * s, y + 14 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ff6f9f'; ctx.beginPath(); ctx.arc(x, y, 26 * s, 0, TAU); ctx.fill(); ctx.stroke();
  }

  OG.Journeys.register({
    id: 'home',
    cards: [
      { id: 'k_veggie', areaId: 'kitchen', title: 'Rau xanh', fact: 'Rau xanh có nhiều vitamin giúp em khoẻ mạnh. Mỗi bữa ăn thêm rau nhé!', drawIcon: broccoli },
      { id: 'k_hot', areaId: 'kitchen', title: 'Bếp nóng', fact: 'Nồi và bếp đang nấu rất nóng. Em nhớ nhờ người lớn giúp khi vào bếp nhé!', drawIcon: pot },
      { id: 'g_bee', areaId: 'garden', title: 'Chú ong chăm chỉ', fact: 'Ong bay từ hoa này sang hoa khác, giúp cây ra quả.', drawIcon: bee },
      { id: 'r_cloud', areaId: 'roof', title: 'Đám mây', fact: 'Mây được tạo từ rất nhiều giọt nước tí hon. Khi giọt nước nặng, trời mưa!', drawIcon: cloud },
      { id: 'b_recycle', areaId: 'basement', title: 'Tái chế', fact: 'Chai nhựa cũ có thể tái chế thành đồ mới. Em hãy bỏ rác đúng thùng nhé!', drawIcon: bottle }
    ],
    quizzes: [
      { id: 'q_veggie', areaId: 'kitchen', question: 'Món nào giúp em khoẻ mạnh hơn?',
        choices: [{ text: 'Bông cải xanh', icon: broccoli }, { text: 'Kẹo ngọt', icon: candy }],
        answer: 0, hint: 'Gợi ý: món này màu xanh lá, trông như một cái cây nhỏ!', explain: 'Đúng rồi! Rau xanh có nhiều vitamin.', cardId: 'k_veggie' },
      { id: 'q_rain', areaId: 'roof', question: 'Mây được tạo từ gì?',
        choices: [{ text: 'Giọt nước', icon: cloud }, { text: 'Kẹo bông', icon: candy }],
        answer: 0, hint: 'Gợi ý: khi mây nặng thì trời đổ mưa!', explain: 'Chính xác! Mây là rất nhiều giọt nước tí hon.' }
    ],
    comics: {
      intro: [
        { bg: 'home-kitchen', chars: [{ id: 'oggy', anim: 'idle', x: 0.32 }, { id: 'olivia', anim: 'idle', x: 0.62, face: -1 }],
          bubbles: [{ who: 'olivia', text: 'Oggy ơi, cuốn Bách Khoa Kỳ Diệu có bao nhiêu điều hay nè!' }] },
        { bg: 'home-kitchen', chars: [{ id: 'oggy', anim: 'hurt', x: 0.25 }, { id: 'joey', anim: 'attack', x: 0.6, face: -1 }, { id: 'deedee', anim: 'run', x: 0.78, face: -1 }],
          bubbles: [{ who: 'joey', text: 'Hí hí! Xé sách chơi nào!' }] },
        { bg: 'home-kitchen', chars: [{ id: 'oggy', anim: 'victory', x: 0.5 }],
          caption: 'Trang sách bay khắp nhà! Cùng Oggy nhặt lại từng trang nhé!' }
      ],
      kitchen_intro: [
        { bg: 'home-kitchen', chars: [{ id: 'olivia', anim: 'idle', x: 0.5 }],
          bubbles: [{ who: 'olivia', text: 'Trang sách rơi vào bếp rồi. Nhặt trang 📄 để học điều mới nhé!' }] }
      ],
      ending: [
        { bg: 'home-garden', chars: [{ id: 'oggy', anim: 'victory', x: 0.35 }, { id: 'olivia', anim: 'victory', x: 0.65, face: -1 }],
          bubbles: [{ who: 'olivia', text: 'Cuốn Bách Khoa đã đầy đủ rồi! Bạn giỏi quá!' }] }
      ]
    }
  });
})();
