// @ts-check
/* ============================================================================
 * OG.Learn — THẺ KIẾN THỨC (trang sách), SỔ TAY KHÁM PHÁ, CÂU ĐỐ MỞ CỬA
 * ----------------------------------------------------------------------------
 * Vai trò:      Phần "học" của hành trình. Trong màn chơi (level hook 'learn'): trang sách bay lơ lửng để nhặt,
 *               cổng câu đố chặn đường. Ngoài màn: mở scene 'card' / 'quiz' / 'notebook', ghi nhận thẻ đã mở
 *               và câu đố đã qua vào save. Scene trong src/story/scenes.js, OG.Guide và smoke test gọi vào đây.
 * Khái niệm:    data-driven design (thẻ/câu đố là dữ liệu trong content.js của hành trình) · level hook ·
 *               scene push (popup đè lên màn chơi, màn chơi đứng yên phía sau) · callback onPass/onClose ·
 *               "tường" va chạm đơn giản bằng kẹp toạ độ · hình dự phòng (fallback) khi thiếu sprite ·
 *               namespace lưu trữ riêng của module
 * Bài học:      docs/learn/12-data-driven-man-cau-do-hanh-trinh.md · docs/learn/05-state-machine-scene.md
 *               · docs/learn/11-luu-tru-migrate.md (OG.Save.ns)
 * Phụ thuộc:    LOAD: OG.util (U). CHẠY: OG.Journeys (getCard/getQuiz/cardsOf/levelsOf), OG.Save.ns/commit,
 *               OG.Scenes.push/go, OG.Level.addHook, OG.Story.ui, OG.Game (hud, addScore), OG.Particles,
 *               OG.Sprites (drawProp/drawPortrait/drawCharacter), OG.Scenery.drawDecor, OG.Photos.preload,
 *               OG.Camera.x, OG.Menus.showsPages, OG.font/OG.FONT
 * Event:        phát: 'card:unlock', 'card:open', 'notebook:open', 'quiz:open', 'quiz:answer', 'quiz:pass',
 *               'page:collect', 'gate:open' · nghe: 'scene:change' (xoá thông báo khi rời màn)
 * API công khai: OG.Learn.init/hasCard/unlockCard/toastCard/listCards/count/whereIs/openCard/openNotebook/
 *               isQuizPassed/openQuiz/answerQuiz/drawIcon/drawCardIcon/drawPage/drawGate
 * Đọc tiếp:     src/story/scenes.js (scene 'card', 'quiz', 'notebook' hiển thị dữ liệu của module này)
 *               → src/journeys/home/content.js (ví dụ dữ liệu thẻ & câu đố) → src/story/photos.js (ảnh thật cho thẻ)
 * Dữ liệu:      CardDef, QuizDef, IconSpec, LevelHook (src/types.d.ts)
 *
 * Hợp đồng: docs/STORY.md mục 6.3.
 *   Lưu: OG.Save.ns('learn') = { cards:{journeyId:{cardId:timestamp ms}}, quizzes:{journeyId:{quizId:{tries, passed}}} }
 *   Trong màn (level hook 'learn'):
 *   - Trang sách bay lơ lửng: chạm vào → +50 điểm, thẻ MỚI thì push scene 'card', thẻ đã có thì chữ nổi.
 *   - Cổng câu đố giữa màn chặn như bức tường; cổng ở EXIT chặn sau khi đủ pizza. Trả lời đúng → cổng mở.
 *   - Thẻ mở khoá ngoài trang sách (người dẫn đường) → thông báo nhỏ trượt vào góc phải.
 * ========================================================================== */

/**
 * @typedef {Object} QuizRecord  kết quả lưu của 1 câu đố
 * @property {number} tries   tổng số lần trả lời (mọi lần mở)
 * @property {boolean} passed đã từng trả lời đúng
 */
/**
 * @typedef {Object} AnswerResult  giá trị trả về của OG.Learn.answerQuiz
 * @property {boolean} correct
 * @property {number} tries        số lần thử trong lần mở câu đố này
 * @property {boolean} firstTry    đúng ngay lần đầu
 * @property {string} hint         gợi ý (khi sai)
 * @property {string} explain      lời giải thích (khi đúng)
 * @property {string|null} cardUnlocked  cardId vừa được mở khoá nhờ câu đố, hoặc null
 */
/**
 * @typedef {Object} LearnPage  một trang sách trong màn (trạng thái chạy, KHÔNG phải dữ liệu gốc)
 * @property {string} card   cardId sẽ mở khoá
 * @property {number} x      toạ độ thế giới, px (tâm)
 * @property {number} y
 * @property {boolean} got   đã nhặt trong lần chơi này
 * @property {boolean} had   thẻ đã có từ trước (vẽ mờ)
 * @property {number} bob    pha dao động lên xuống, radian (mỗi trang lệch nhau cho tự nhiên)
 */
/**
 * @typedef {Object} LearnGate  một cổng câu đố trong màn
 * @property {string} id
 * @property {string} quiz   quizId
 * @property {number|'exit'} x  toạ độ thế giới (mép trái cổng, px) hoặc 'exit' = gắn vào cửa EXIT
 * @property {boolean} open
 * @property {number} openT  giây kể từ lúc mở (-1 = chưa mở) — dùng cho hoạt ảnh mờ dần
 */
(function () {
  'use strict';
  var OG = window.OG;
  var U = OG.util;
  var TAU = Math.PI * 2;
  var INK = '#17233d';

  var PAGE_SCORE = 50;          // điểm thưởng mỗi trang sách
  var PAGE_PICK_HALF_W = 32;    // nửa bề rộng vùng nhặt trang quanh tâm người chơi, px (rộng rãi cho bé)
  var PAGE_PICK_HALF_H = 44;    // nửa bề cao vùng nhặt, px
  var GATE_COOLDOWN = 1.2;      // giây chờ trước khi cổng tự mở lại câu đố (sau khi bấm "Để sau")
  var GATE_PAD = 4;             // khe hở trước mặt cổng, px
  var GATE_BLOCK_W = 50;        // bề dày "bức tường" cổng, px
  var GATE_VANISH_T = 1.2;      // giây sau khi mở thì cổng biến mất hẳn
  var GATE_HINT_RANGE = 220;    // khoảng cách ngang tới cổng để hiện bong bóng mời trả lời, px
  var MAX_TOASTS = 4;           // số thông báo "Thẻ mới" xếp hàng tối đa

  function J() { return OG.Journeys; }
  function ui() { return OG.Story && OG.Story.ui; }
  // 💡 Khái niệm: namespace lưu trữ — module chỉ đụng vào OG.Save.ns('learn'), không biết cấu trúc save
  //   của module khác. Hàm store() cũng "tự chữa" dữ liệu hỏng/thiếu field (save cũ, người dùng sửa tay).
  function store() {
    var s = OG.Save.ns('learn');
    if (!s.cards || typeof s.cards !== 'object') s.cards = {};
    if (!s.quizzes || typeof s.quizzes !== 'object') s.quizzes = {};
    return s;
  }
  function cardsOf(jid) { var s = store(); return s.cards[jid] || (s.cards[jid] = {}); }
  /** @returns {QuizRecord} bản ghi câu đố (tạo mới nếu chưa có — tham chiếu thật trong save, sửa là lưu) */
  function quizRec(jid, qid) {
    var s = store(), m = s.quizzes[jid] || (s.quizzes[jid] = {});
    return m[qid] || (m[qid] = { tries: 0, passed: false });
  }
  function font(px, w) { return OG.font(px, w || 'bold'); }

  // ---------------------------------------------------------------------------
  // Hình dự phòng
  // 💡 Khái niệm: fallback — module đồ hoạ (OG.Sprites.drawProp) có thể chưa vẽ 'page'/'gate'.
  //   Module này tự mang theo hình đơn giản để game KHÔNG BAO GIỜ thiếu hình, dù module khác chậm tiến độ.
  // ---------------------------------------------------------------------------
  /**
   * Vẽ trang sách: tờ giấy bay phấp phới có mặt cười + cánh nhỏ. (x, y) = tâm, px.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x
   * @param {number} y
   * @param {number} t  thời gian, giây (cho hoạt ảnh lắc, vỗ cánh)
   * @param {boolean} faded  true = vẽ mờ (thẻ đã có trong Sổ tay)
   */
  function drawPageFallback(ctx, x, y, t, faded) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(t * 3) * 0.15);
    ctx.globalAlpha *= faded ? 0.5 : 1;
    // quầng sáng
    if (!faded) {
      ctx.fillStyle = 'rgba(255,233,140,0.45)';
      ctx.beginPath(); ctx.arc(0, 0, 26 + Math.sin(t * 5) * 2, 0, TAU); ctx.fill();
    }
    // cánh — vẽ 1 lần, lật gương bằng scale(-1, 1) để có cánh còn lại
    var flap = Math.sin(t * 12) * 0.5;
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
    [-1, 1].forEach(function (s) {
      ctx.save(); ctx.scale(s, 1); ctx.rotate(flap * 0.6);
      ctx.beginPath(); ctx.ellipse(18, -8, 10, 5, -0.5, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.restore();
    });
    // tờ giấy gấp góc + hai dòng chữ giả
    ctx.fillStyle = '#fffdf4'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(-13, -16); ctx.lineTo(8, -16); ctx.lineTo(14, -10); ctx.lineTo(14, 16); ctx.lineTo(-13, 16); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#9fb4c8'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-8, 7); ctx.lineTo(9, 7); ctx.moveTo(-8, 11); ctx.lineTo(6, 11); ctx.stroke();
    // mặt cười: mắt, miệng, má hồng
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(-4, -5, 1.9, 0, TAU); ctx.arc(4, -5, 1.9, 0, TAU); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(0, -3, 3.2, 0.3, Math.PI - 0.3); ctx.stroke();
    ctx.fillStyle = '#f29bb8'; ctx.beginPath(); ctx.arc(-8, -1, 2, 0, TAU); ctx.arc(8, -1, 2, 0, TAU); ctx.fill();
    ctx.restore();
  }

  /**
   * Vẽ cổng câu đố: khung cửa vàng + cánh cửa tím có dấu "?" và mặt cười (mở: cửa trượt lên).
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x       mép trái cánh cửa, toạ độ thế giới px
   * @param {number} floorY  mặt sàn (chân cổng), px
   * @param {number} t       giây
   * @param {boolean} open
   */
  function drawGateFallback(ctx, x, floorY, t, open) {
    ctx.save();
    var h = 150, w = 46;
    ctx.lineJoin = 'round';
    // khung cửa + lòng cửa tối
    ctx.fillStyle = '#f4d45b'; ctx.strokeStyle = INK; ctx.lineWidth = 3.5;
    U.roundRectPath(ctx, x - 8, floorY - h - 14, w + 16, h + 14, 12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#2b3a5c'; U.roundRectPath(ctx, x, floorY - h, w, h, 8); ctx.fill();
    // cánh cửa: clip() vào lòng cửa rồi dịch lên → phần trượt ra ngoài khung tự bị cắt, trông như cửa cuốn.
    var lift = open ? h - 18 : 0;
    ctx.save();
    U.roundRectPath(ctx, x, floorY - h, w, h, 8); ctx.clip();
    ctx.fillStyle = '#7b6cf0';
    U.roundRectPath(ctx, x, floorY - h - lift, w, h, 8); ctx.fill(); ctx.stroke();
    if (!open) {
      ctx.fillStyle = '#ffffff'; ctx.font = font(34); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('?', x + w / 2, floorY - h + 42 + Math.sin(t * 4) * 3);
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.arc(x + w / 2 - 8, floorY - 60, 2.6, 0, TAU); ctx.arc(x + w / 2 + 8, floorY - 60, 2.6, 0, TAU); ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.arc(x + w / 2, floorY - 56, 5, 0.3, Math.PI - 0.3); ctx.stroke();
    }
    ctx.restore();
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Thông báo "Thẻ mới" trượt vào góc phải (trong màn, toạ độ màn hình)
  // ---------------------------------------------------------------------------
  /** @type {{jid:string, cardId:string, t:number}[]} hàng đợi thông báo; chỉ phần tử đầu được hiện và đếm giờ */
  var toasts = [];
  var TOAST_DUR = 3.2;   // thời gian hiện mỗi thông báo, giây
  var TOAST_ANIM = 0.3;  // thời gian trượt vào / trượt ra, giây
  function drawToasts(ctx) {
    if (!toasts.length) return;
    var tt = toasts[0], c = J().getCard(tt.jid, tt.cardId);
    if (!c) { toasts.shift(); return; }
    // k = 0..1: mức "đã trượt vào". Vào bằng easeOutBack (nảy nhẹ), ra tuyến tính.
    var k = tt.t < TOAST_ANIM ? ui().easeOutBack(tt.t / TOAST_ANIM) : tt.t > TOAST_DUR - TOAST_ANIM ? (TOAST_DUR - tt.t) / TOAST_ANIM : 1;
    var w = 290, h = 74, x = OG.W - (w + 14) * k, y = 62;
    ctx.save();
    ui().drawFrame(ctx, x, y, w, h, '#ffffff', 16, { lineWidth: 3 });
    ctx.fillStyle = ui().palette(tt.jid).primary;
    U.roundRectPath(ctx, x + 8, y + 8, 58, 58, 12); ctx.fill();
    Learn.drawCardIcon(ctx, c, x + 37, y + 37, 50, OG.time);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#3fbf6f'; ctx.font = font(14);
    ctx.fillText('📒 THẺ MỚI!', x + 76, y + 12);
    ctx.fillStyle = INK; ctx.font = font(18);
    ctx.fillText(ui().wrap(ctx, c.title, w - 90)[0], x + 76, y + 32);
    ctx.restore();
  }

  // ===========================================================================
  // API
  // ===========================================================================
  var Learn = (OG.Learn = {
    /** Cắm level hook 'learn' và nghe 'scene:change' để dọn thông báo khi rời màn chơi. */
    init: function () {
      if (OG.Level && OG.Level.addHook) OG.Level.addHook(learnHook);
      // push/pop (mở thẻ, câu đố) KHÔNG xoá thông báo — chỉ xoá khi thật sự rời màn chơi.
      OG.Events.on('scene:change', function (e) { if (e && !e.push && !e.pop && e.to !== 'level') toasts.length = 0; });
    },

    // ---- Thẻ kiến thức ----
    /**
     * @param {string} journeyId
     * @param {string} cardId
     * @returns {boolean} true nếu thẻ đã được mở khoá
     */
    hasCard: function (journeyId, cardId) { return !!cardsOf(journeyId)[cardId]; },
    /**
     * Mở khoá thẻ, ghi save và phát 'card:unlock'. Thẻ không tồn tại hoặc đã có → không làm gì.
     * @param {string} journeyId
     * @param {string} cardId
     * @param {{silent?:boolean}} [opts]  silent = không hiện thông báo góc màn hình (vd đã có popup thẻ)
     * @returns {boolean} true nếu là thẻ MỚI
     * @example
     *   if (OG.Learn.unlockCard('home', 'k_veggie', { silent: true })) OG.Learn.openCard('home', 'k_veggie', { isNew: true });
     */
    unlockCard: function (journeyId, cardId, opts) {
      if (!J().getCard(journeyId, cardId)) return false;
      var m = cardsOf(journeyId);
      if (m[cardId]) return false;
      m[cardId] = Date.now();
      OG.Save.commit();
      var c = Learn.count(journeyId);
      OG.Events.emit('card:unlock', { journeyId: journeyId, cardId: cardId, count: c.have, total: c.total });
      if (!(opts && opts.silent)) Learn.toastCard(journeyId, cardId);
      return true;
    },
    /**
     * Xếp hàng thông báo "Thẻ mới" (chỉ thấy khi đang ở trong màn, tối đa MAX_TOASTS chờ).
     * @param {string} journeyId
     * @param {string} cardId
     */
    toastCard: function (journeyId, cardId) {
      if (toasts.length < MAX_TOASTS) toasts.push({ jid: journeyId, cardId: cardId, t: 0 });
    },
    /**
     * Liệt kê thẻ theo thứ tự khai báo trong dữ liệu, kèm trạng thái mở khoá.
     * @param {string} journeyId
     * @param {string} [areaId]  chỉ lấy thẻ của một khu
     * @returns {{card: CardDef, unlocked: boolean}[]}
     */
    listCards: function (journeyId, areaId) {
      return J().cardsOf(journeyId, areaId).map(function (c) { return { card: c, unlocked: Learn.hasCard(journeyId, c.id) }; });
    },
    /**
     * Đếm số thẻ đã có / tổng số thẻ.
     * @param {string} journeyId
     * @param {string} [areaId]
     * @returns {{have:number, total:number}}
     */
    count: function (journeyId, areaId) {
      var all = J().cardsOf(journeyId, areaId), have = 0;
      all.forEach(function (c) { if (Learn.hasCard(journeyId, c.id)) have++; });
      return { have: have, total: all.length };
    },
    /**
     * Tìm nơi kiếm được thẻ (để Sổ tay gợi ý cho bé): trang sách, người dẫn đường, hay câu đố ở màn nào.
     * Thứ tự ưu tiên trong mỗi màn: trang sách → người dẫn đường → câu đố ở cổng; cuối cùng là câu đố không gắn màn.
     * @param {string} journeyId
     * @param {string} cardId
     * @returns {{levelId:string|null, levelName:string, kind:'page'|'quiz'|'guide'}|null} null = không tìm thấy (thẻ bí mật)
     */
    whereIs: function (journeyId, cardId) {
      var lv = J().levelsOf(journeyId), q = (J().get(journeyId) || {}).quizzes || [];
      for (var i = 0; i < lv.length; i++) {
        var L = lv[i];
        if ((L.pages || []).some(function (p) { return p.card === cardId; })) return { levelId: L.id, levelName: L.name, kind: 'page' };
        if ((L.guideSpots || []).some(function (s) { return s.card === cardId; })) return { levelId: L.id, levelName: L.name, kind: 'guide' };
        for (var k = 0; k < (L.quizGates || []).length; k++) {
          var qz = J().getQuiz(journeyId, L.quizGates[k].quiz);
          if (qz && qz.cardId === cardId) return { levelId: L.id, levelName: L.name, kind: 'quiz' };
        }
      }
      return q.some(function (x) { return x.cardId === cardId; }) ? { levelId: null, levelName: '', kind: 'quiz' } : null;
    },
    /**
     * Mở thẻ: PUSH scene 'card' lên trên scene hiện tại (màn chơi đứng yên phía sau). Phát 'card:open'.
     * @param {string} journeyId
     * @param {string} cardId
     * @param {{isNew?:boolean, from?:'level'|'notebook', onClose?:Function}} [opts]
     *   isNew = hiện pháo hoa + ruy băng "THẺ MỚI"; from mặc định 'level'; onClose gọi sau khi pop
     */
    openCard: function (journeyId, cardId, opts) {
      opts = opts || {};
      OG.Events.emit('card:open', { journeyId: journeyId, cardId: cardId, from: opts.from || 'level' });
      // `from` cho scene biết đang mở từ Sổ tay (ảnh lớn + phóng to) hay từ màn chơi (popup gọn).
      OG.Scenes.push('card', { journeyId: journeyId, cardId: cardId, isNew: !!opts.isNew, from: opts.from || 'level', onClose: opts.onClose || null });
    },
    /**
     * Mở Sổ tay khám phá (go scene 'notebook'). Phát 'notebook:open'.
     * @param {string} journeyId
     * @param {string} [back='journeyMap']  scene quay về khi bấm ↩ / Esc
     * @param {Object} [backParams]  params cho scene quay về (mặc định {journeyId})
     */
    openNotebook: function (journeyId, back, backParams) {
      OG.Events.emit('notebook:open', { journeyId: journeyId });
      OG.Scenes.go('notebook', { journeyId: journeyId, back: back || 'journeyMap', backParams: backParams || { journeyId: journeyId } });
    },

    // ---- Câu đố ----
    /**
     * @param {string} journeyId
     * @param {string} quizId
     * @returns {boolean} true nếu đã từng trả lời đúng
     */
    isQuizPassed: function (journeyId, quizId) { return !!quizRec(journeyId, quizId).passed; },
    /**
     * Mở câu đố: PUSH scene 'quiz'. Phát 'quiz:open'.
     * @param {string} journeyId
     * @param {string} quizId
     * @param {{levelId?:string, gateId?:string, onPass?:Function, onClose?:Function}} [opts]
     *   onPass = gọi khi trả lời đúng và bấm "Đi tiếp"; onClose = gọi khi bấm "Để sau" (cổng vẫn khoá)
     * @example
     *   OG.Learn.openQuiz('home', 'q_vitc', { levelId: 'home-kitchen-2', onPass: function () { console.log('cổng mở!'); } });
     */
    openQuiz: function (journeyId, quizId, opts) {
      opts = opts || {};
      OG.Events.emit('quiz:open', { journeyId: journeyId, quizId: quizId, levelId: opts.levelId || null, gateId: opts.gateId || null });
      OG.Scenes.push('quiz', { journeyId: journeyId, quizId: quizId, levelId: opts.levelId || null, gateId: opts.gateId || null, onPass: opts.onPass || null, onClose: opts.onClose || null });
    },
    /**
     * Ghi nhận một câu trả lời, ghi save, phát 'quiz:answer' (và 'quiz:pass' + mở khoá thẻ nếu đúng).
     * KHÔNG phạt khi sai — chỉ trả gợi ý (thiết kế cho trẻ em: sai là một phần của học).
     * @param {string} journeyId
     * @param {string} quizId
     * @param {number} choice  chỉ số đáp án được chọn
     * @param {{attempt?:number, levelId?:string, gateId?:string}} [ctx]  attempt = số lần thử trong lần mở này
     *   (scene quiz truyền); thiếu thì dùng tổng số lần thử đã lưu
     * @returns {AnswerResult}
     */
    answerQuiz: function (journeyId, quizId, choice, ctx) {
      var q = J().getQuiz(journeyId, quizId);
      if (!q) return { correct: false, tries: 0, firstTry: false, hint: '', explain: '', cardUnlocked: null };
      var rec = quizRec(journeyId, quizId);
      rec.tries++;
      var attempt = ctx && ctx.attempt ? ctx.attempt : rec.tries;
      var correct = choice === q.answer;
      var firstTry = correct && attempt === 1;
      if (correct) rec.passed = true;
      OG.Save.commit();
      OG.Events.emit('quiz:answer', { journeyId: journeyId, quizId: quizId, choice: choice, correct: correct, tries: attempt });
      var unlocked = null;
      if (correct) {
        OG.Events.emit('quiz:pass', { journeyId: journeyId, quizId: quizId, tries: attempt, firstTry: firstTry,
          levelId: (ctx && ctx.levelId) || null, gateId: (ctx && ctx.gateId) || null });
        if (q.cardId && Learn.unlockCard(journeyId, q.cardId, { silent: true })) unlocked = q.cardId;
      }
      return { correct: correct, tries: attempt, firstTry: firstTry, hint: q.hint || 'Gần đúng rồi! Thử lại nhé!', explain: q.explain || 'Chính xác!', cardUnlocked: unlocked };
    },

    // ---- Vẽ ----
    /**
     * Vẽ biểu tượng theo IconSpec: hàm vẽ | {decor, opts, scale} | {char, anim} | {emoji} | chuỗi emoji. Lỗi → vẽ trang sách dự phòng.
     * 💡 Khái niệm: một kiểu dữ liệu "đa hình" (union) cho biểu tượng — người soạn nội dung chọn cách dễ nhất
     *   (emoji tạm, decor có sẵn, hay hàm vẽ riêng); hàm này phân loại và gọi đúng bộ vẽ.
     * @param {CanvasRenderingContext2D} ctx
     * @param {any} icon  IconSpec (src/types.d.ts)
     * @param {number} x  tâm, px
     * @param {number} y
     * @param {number} size  cạnh ô vuông chứa biểu tượng, px
     * @param {number} [t=0]  giây
     * @example
     *   OG.Learn.drawIcon(ctx, '🍎', 100, 100, 64, OG.time);
     *   OG.Learn.drawIcon(ctx, { char: 'olivia' }, 200, 100, 64, OG.time);
     */
    drawIcon: function (ctx, icon, x, y, size, t) {
      ctx.save();
      try {
        if (typeof icon === 'function') icon(ctx, x, y, size, t || 0);
        else if (icon && icon.decor) {
          if (!OG.Scenery || !OG.Scenery.drawDecor) throw new Error('no scenery');
          // decor có gốc vẽ ở CHÂN → dời gốc xuống 0,42·size để hình nằm giữa ô; size/70 quy đổi về ô chuẩn 70 px.
          OG.Scenery.drawDecor(ctx, icon.decor, x, y + size * 0.42, (icon.scale || 1) * size / 70, t || 0, icon.opts || {});
        } else if (icon && icon.char) {
          if (OG.Sprites.drawPortrait) OG.Sprites.drawPortrait(ctx, icon.char, x, y, size * 0.9, { t: t || 0, state: icon.anim || 'idle' });
          else { ctx.translate(x, y + size * 0.45); OG.Sprites.drawCharacter(ctx, icon.char, 'idle', t || 0, { scale: size / 70 }); }
        } else if (icon && (icon.emoji || typeof icon === 'string')) {
          ctx.font = (size * 0.72 | 0) + 'px ' + OG.FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = INK;
          ctx.fillText(icon.emoji || icon, x, y + size * 0.04);
        } else drawPageFallback(ctx, x, y, t || 0, false);
      } catch (e) {
        // ⚠️ Bẫy: hàm vẽ lỗi giữa chừng có thể đã đổi transform/màu. restore() rồi save() lại để vẽ
        //   hình dự phòng trên trạng thái SẠCH, và vẫn giữ đúng một cặp save/restore cho lệnh restore cuối.
        ctx.restore(); ctx.save();
        drawPageFallback(ctx, x, y, t || 0, false);
      }
      ctx.restore();
    },
    /**
     * Vẽ biểu tượng của một thẻ (ưu tiên card.drawIcon, rồi card.icon).
     * @param {CanvasRenderingContext2D} ctx
     * @param {CardDef|null} card
     * @param {number} x  tâm, px
     * @param {number} y
     * @param {number} size  px
     * @param {number} [t]  giây
     */
    drawCardIcon: function (ctx, card, x, y, size, t) { Learn.drawIcon(ctx, card && (card.drawIcon || card.icon), x, y, size, t); },
    /**
     * Vẽ trang sách bay (ưu tiên sprite 'page' của OG.Sprites, thiếu thì hình dự phòng).
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} x  tâm, toạ độ thế giới px
     * @param {number} y
     * @param {number} t  giây
     * @param {{collected?:boolean}} [opts]  collected = thẻ đã có (vẽ mờ)
     */
    drawPage: function (ctx, x, y, t, opts) {
      if (OG.Sprites.drawProp && OG.Sprites.drawProp(ctx, 'page', x, y, t, opts || {})) return;
      drawPageFallback(ctx, x, y, t, opts && opts.collected);
    },
    /**
     * Vẽ cổng câu đố (ưu tiên sprite 'gate', thiếu thì hình dự phòng).
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} x       mép trái cánh cửa, toạ độ thế giới px
     * @param {number} floorY  mặt sàn, px
     * @param {number} t       giây
     * @param {boolean} open
     */
    drawGate: function (ctx, x, floorY, t, open) {
      if (OG.Sprites.drawProp && OG.Sprites.drawProp(ctx, 'gate', x, floorY, t, { open: open })) return;
      drawGateFallback(ctx, x, floorY, t, open);
    }
  });

  // ===========================================================================
  // Level hook: trang sách + cổng câu đố
  // ===========================================================================
  function pagesHave(L) { var n = 0; L.pages.forEach(function (q) { if (q.got) n++; }); return n; }

  /** @type {LevelHook} */
  var learnHook = {
    id: 'learn', order: 20,
    enter: function (st) {
      if (!st.journeyId) { st.learn = null; return; }
      var jid = st.journeyId;
      // Trạng thái chạy (st.learn) tách khỏi dữ liệu màn (st.level): dữ liệu gốc giữ nguyên cho lần chơi sau.
      st.learn = {
        /** @type {LearnPage[]} */
        pages: (st.level.pages || []).map(function (p) {
          return { card: p.card, x: p.x, y: p.y, got: false, had: Learn.hasCard(jid, p.card), bob: Math.random() * 6 };
        }),
        // Cổng hỏi lại mỗi lần vào màn (ôn tập).
        /** @type {LearnGate[]} */
        gates: (st.level.quizGates || []).map(function (g) { return { id: g.id, quiz: g.quiz, x: g.x, open: false, openT: -1 }; }),
        cooldown: 0
      };
      OG.Game.hud.pages = { have: 0, total: st.learn.pages.length };
      // Tải trước ảnh thật của các thẻ trong màn này → khi bé nhặt trang sách, popup có ảnh ngay (không phải chờ).
      if (OG.Photos) OG.Photos.preload(jid, st.learn.pages.map(function (p) { return p.card; }));
    },

    update: function (st, dt, p) {
      // Chỉ thông báo đầu hàng đợi được đếm giờ → các thông báo hiện lần lượt, không chồng lên nhau.
      toasts.forEach(function (x, i) { if (i === 0) x.t += dt; });
      if (toasts.length && toasts[0].t > TOAST_DUR) toasts.shift();
      if (ui()) ui().fx.update(dt);
      var L = st.learn;
      if (!L) return;
      L.cooldown = Math.max(0, L.cooldown - dt);
      L.gates.forEach(function (g) { if (g.openT >= 0) g.openT += dt; });
      var cx = p.x + p.w / 2, cy = p.y + p.h / 2;
      // Trang sách: so khoảng cách tâm-tâm theo từng trục (hình chữ nhật quanh tâm) — rẻ và rộng rãi cho bé.
      for (var i = 0; i < L.pages.length; i++) {
        var pg = L.pages[i];
        if (pg.got || Math.abs(cx - pg.x) > PAGE_PICK_HALF_W || Math.abs(cy - pg.y) > PAGE_PICK_HALF_H) continue;
        pg.got = true;
        var isNew = Learn.unlockCard(st.journeyId, pg.card, { silent: true });
        OG.Game.hud.pages = { have: pagesHave(L), total: L.pages.length };
        OG.Game.addScore(PAGE_SCORE);
        OG.Particles.spawn(pg.x, pg.y, { color: '#ffe27a', count: 14, shape: 'star' });
        OG.Particles.floatText(pg.x, pg.y - 26, '+50', '#ffc94a');
        OG.Events.emit('page:collect', { journeyId: st.journeyId, levelId: st.level.id, cardId: pg.card, x: pg.x, y: pg.y, isNew: isNew });
        // Thẻ mới → push scene 'card' và trả true để level.js dừng frame (không xử lý tiếp dưới popup).
        if (isNew) { Learn.openCard(st.journeyId, pg.card, { isNew: true, from: 'level' }); return true; }
        OG.Particles.floatText(pg.x, pg.y - 48, 'Đã có trong Sổ tay 📒', '#52c5ee');
      }
      // Cổng câu đố giữa màn: chặn như bức tường cho tới khi trả lời đúng.
      for (var k = 0; k < L.gates.length; k++) {
        var g = L.gates[k];
        if (g.open || g.x === 'exit') continue;
        var gx = /** @type {number} */ (g.x);
        if (p.x + p.w > gx - GATE_PAD && p.x < gx + GATE_BLOCK_W) {
          // 💡 Khái niệm: "tường" đơn giản nhất — chồng lấn thì đẩy người chơi về sát mép trái và triệt vận tốc
          //   hướng vào tường. Không cần thêm platform vào hệ vật lý.
          p.x = gx - GATE_PAD - p.w;
          if (p.vx > 0) p.vx = 0;
          // ⚠️ Bẫy: thiếu cooldown thì bấm "Để sau" xong, frame kế tiếp người chơi vẫn chạm cổng → câu đố mở lại ngay, kẹt vĩnh viễn.
          if (L.cooldown <= 0) { L.cooldown = GATE_COOLDOWN; openGate(st, g); return true; }
        }
      }
    },

    // level.js hỏi trước khi cho qua cửa EXIT: false = chặn (cổng câu đố gắn ở EXIT chưa mở).
    canExit: function (st, p) {
      var L = st.learn;
      if (!L) return true;
      for (var k = 0; k < L.gates.length; k++) {
        var g = L.gates[k];
        if (g.open || g.x !== 'exit') continue;
        p.x = Math.min(p.x, st.exit.x - p.w - 2); // lùi lại trước cửa
        if (L.cooldown <= 0) { L.cooldown = GATE_COOLDOWN; openGate(st, g); }
        return false;
      }
      return true;
    },

    // Vẽ trong không gian THẾ GIỚI (camera đã translate) — trước người chơi.
    drawWorld: function (ctx, st, t) {
      var L = st.learn;
      if (!L) return;
      var p = st.player, px = p.x + p.w / 2;
      for (var i = 0; i < L.pages.length; i++) {
        var pg = L.pages[i];
        if (pg.got) continue;
        Learn.drawPage(ctx, pg.x, pg.y + Math.sin(t * 3 + pg.bob) * 5, t, { collected: pg.had });
      }
      for (var k = 0; k < L.gates.length; k++) {
        var g = L.gates[k];
        if (g.x === 'exit') {
          if (g.open) continue;
          // Biển "?" trên cửa EXIT: cần trả lời câu đố.
          var ex = st.exit.x + 24, ey = OG.FLOOR_Y - 178 + Math.sin(t * 4) * 4;
          ctx.save();
          ctx.fillStyle = '#7b6cf0'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(ex, ey, 18, 0, TAU); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#fff'; ctx.font = font(22); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('?', ex, ey + 1);
          ctx.restore();
          continue;
        }
        if (g.open && g.openT > GATE_VANISH_T) continue; // cổng đã mở hẳn: biến mất
        ctx.save();
        // Mờ dần trong nửa sau của quãng biến mất (0,6 → 1,2 giây sau khi mở).
        if (g.open) ctx.globalAlpha = U.clamp(1 - (g.openT - 0.6) / 0.6, 0, 1);
        Learn.drawGate(ctx, g.x, OG.FLOOR_Y, t, g.open);
        ctx.restore();
        // Lại gần cổng đóng: bong bóng mời trả lời. bounds theo camera để bong bóng không trôi khỏi màn hình.
        if (!g.open && ui() && Math.abs(px - g.x) < GATE_HINT_RANGE) {
          ui().drawBubble(ctx, g.x + 23, OG.FLOOR_Y - 172, '❓ Trả lời câu đố để mở cửa!', {
            size: 15, maxW: 230, bg: '#f1edff', bounds: { x: OG.Camera.x, y: 0, w: OG.W, h: OG.H } });
        }
      }
    },

    // Vẽ trong không gian MÀN HÌNH (sau khi camera đã restore) — HUD, thông báo, hiệu ứng.
    drawScreen: function (ctx, st) {
      var L = st.learn;
      // Số trang sách đã hiện trên HUD DOM (OG.Menus.updateHud đọc hud.pages) → không vẽ pill canvas nữa.
      if (L && L.pages.length && !(OG.Menus && OG.Menus.showsPages)) {
        // Pill trang sách: icon + "2/3" + chấm tiến độ
        var have = pagesHave(L), n = L.pages.length, w = 70 + n * 14;
        ctx.save();
        ctx.fillStyle = 'rgba(23,35,61,0.86)'; ctx.strokeStyle = '#fff4d6'; ctx.lineWidth = 2;
        U.roundRectPath(ctx, 14, 58, w, 34, 17); ctx.fill(); ctx.stroke();
        drawPageFallback(ctx, 34, 75, 0, false);
        ctx.fillStyle = '#fff'; ctx.font = font(16); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(have + '/' + n, 52, 76);
        for (var i = 0; i < n; i++) {
          ctx.fillStyle = i < have ? '#ffc94a' : 'rgba(255,255,255,0.3)';
          ctx.beginPath(); ctx.arc(w + 14 - (n - i) * 14 + 2, 75, 4.5, 0, TAU); ctx.fill();
        }
        ctx.restore();
      }
      drawToasts(ctx);
      if (ui()) ui().fx.draw(ctx);
    }
  };

  /**
   * Mở câu đố của một cổng; callback onPass mở cổng + hiệu ứng + phát 'gate:open'.
   * 💡 Khái niệm: callback (closure) giữ tham chiếu tới `g` và `st` — khi scene quiz pop sau vài giây,
   *   onPass vẫn sửa đúng cổng đó của đúng màn đó.
   * @param {any} st  trạng thái màn (OG.Level.state)
   * @param {LearnGate} g
   */
  function openGate(st, g) {
    Learn.openQuiz(st.journeyId, g.quiz, {
      levelId: st.level.id, gateId: g.id,
      onPass: function () {
        g.open = true; g.openT = 0;
        var gx = g.x === 'exit' ? st.exit.x + 24 : g.x + 23;
        OG.Particles.spawn(gx, OG.FLOOR_Y - 90, { color: '#b9a8ff', count: 18, shape: 'star' });
        OG.Particles.floatText(gx, OG.FLOOR_Y - 170, 'Cửa đã mở! 🎉', '#3fbf6f');
        OG.Events.emit('gate:open', { levelId: st.level.id, gateId: g.id, quizId: g.quiz, x: g.x === 'exit' ? st.exit.x : g.x });
      }
    });
  }

  // Lộ hình dự phòng cho trang demo / module khác tái dùng (tiền tố _ = nội bộ, không thuộc hợp đồng).
  OG.Learn._drawPageFallback = drawPageFallback;
  OG.Learn._drawGateFallback = drawGateFallback;
})();
