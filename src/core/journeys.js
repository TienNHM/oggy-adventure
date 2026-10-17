// @ts-check
/* ============================================================================
 * OG.Journeys — SỔ ĐĂNG KÝ HÀNH TRÌNH HỌC TẬP (registry) + BIÊN DỊCH MÀN (compile) + KIỂM TRA DỮ LIỆU (validate)
 * ----------------------------------------------------------------------------
 * Vai trò:      Mỗi hành trình (Nhà của Oggy, Việt Nam, Thế giới, Khoa học...) là DỮ LIỆU THUẦN trong
 *               src/journeys/<id>/, đăng ký vào đây lúc load. Module này gộp dữ liệu, "biên dịch" từng màn
 *               thành LevelDef đầy đủ để scene 'level'/'boss' chạy được, và kiểm tra lỗi dữ liệu lúc boot.
 * Khái niệm:    data-driven design (thêm nội dung = thêm dữ liệu, không sửa engine) · registry + đăng ký nhiều lần
 *               (gộp theo id) · compile dữ liệu gọn → dữ liệu đầy đủ (điền mặc định, kế thừa hình học) ·
 *               cache có vô hiệu hoá (invalidate) · validate dữ liệu với thông báo lỗi có đường dẫn
 * Bài học:      docs/learn/12-data-driven-man-cau-do-hanh-trinh.md
 * Phụ thuộc:    LÚC CHẠY: OG.Data.levels/characters (màn gốc, nhân vật), OG.Scenery.known, OG.Bosses.has,
 *               OG.Progress.isCompleted/getRecord (chỉ sau boot). KHÔNG truy cập OG.Save.data lúc load.
 * Event:        phát: (không) · nghe: (không)
 * API công khai: OG.Journeys.register(def), has, get, list, ids, validate(idOrDef), validateAll(opts), init(),
 *               getLevel, isJourneyLevel, levelsOf, levelIds, areaOf, getArea, nextLevel, isFirstOfArea,
 *               isLastOfArea, isFinalLevel, getCard, getQuiz, getComic, cardsOf, isLevelUnlocked,
 *               isAreaUnlocked, isAreaDone, firstIncomplete, isComplete, progress
 * Đọc tiếp:     src/journeys/home/journey.js (một JourneyDef thật) → src/data/levels.js (OG.Data.getLevel tự tìm
 *               sang đây) → src/game/level.js (dùng LevelDef đã biên dịch)
 * Dữ liệu:      JourneyDef, AreaDef, LevelDef, CardDef, QuizDef, PanelDef, ValidateResult (src/types.d.ts);
 *               hợp đồng đầy đủ docs/STORY.md mục 2–3.
 *
 * Hợp đồng:
 *   - Gọi register nhiều lần cùng id được: các lần sau GỘP vào (cards/quizzes/areas nối theo id, comics gộp khoá).
 *   - Màn của hành trình KHÔNG nằm trong OG.Data.levels (giữ nguyên chiến dịch cổ điển v1);
 *     OG.Data.getLevel(id) tự tìm sang OG.Journeys.getLevel(id).
 * ========================================================================== */

/**
 * @typedef {Object} CompiledCache  kết quả biên dịch mọi hành trình
 * @property {Object<string, LevelDef>} levels   levelId → LevelDef đầy đủ
 * @property {Object<string, string[]>} order    journeyId → levelId theo thứ tự chơi
 */

/**
 * @typedef {Object} QuizGate  cổng câu đố sau khi chuẩn hoá
 * @property {string} id            'gate0', 'gate1'... nếu dữ liệu không ghi
 * @property {string} quiz          id câu đố
 * @property {number|'exit'} x      toạ độ thế giới (px) của cổng, hoặc 'exit' = ngay trước cửa ra
 */

/**
 * @typedef {Object} Validator  trạng thái dùng chung giữa các bước kiểm tra một JourneyDef
 * @property {string} P                         tiền tố đường dẫn lỗi (id hành trình)
 * @property {string[]} errors
 * @property {string[]} warnings
 * @property {(path: string, msg: string) => void} err   ghi lỗi (làm hành trình bị ẩn)
 * @property {(path: string, msg: string) => void} wrn   ghi cảnh báo (vẫn chơi được)
 * @property {Object<string, any>} comics       comicId → panels (đã kiểm tra kiểu object)
 * @property {Object<string, boolean>} areaIds
 * @property {Object<string, CardDef>} cards
 * @property {Object<string, QuizDef>} quizzes
 */
(function () {
  'use strict';
  var OG = window.OG;

  // Giá trị mặc định khi biên dịch màn (màn hành trình được phép viết rất gọn)
  var DEFAULT_LEVEL_WIDTH = 1600;   // px
  var DEFAULT_SPAWN_X = 70;         // px thế giới
  var DEFAULT_SPAWN_Y = 420;        // px thế giới
  var DEFAULT_EXIT_MARGIN = 120;    // cửa ra cách mép phải màn, px
  var DEFAULT_GOAL_MAX = 3;         // số pizza cần ăn mặc định (không vượt số pizza có trong màn)
  var DEFAULT_ORDER = 99;           // thứ tự hiển thị khi hành trình không ghi order
  var STARS_PER_LEVEL = 3;

  // Ngưỡng kiểm tra dữ liệu (nội dung dành cho trẻ em → câu phải ngắn)
  var MAX_LINE_CHARS = 90;          // bong bóng thoại / lời dẫn, ký tự
  var MAX_FACT_CHARS = 160;         // câu sự thật trên thẻ, ký tự
  var MIN_LEVEL_WIDTH = 960;        // màn ít nhất rộng bằng một màn hình, px
  var FLOOR_MIN_Y = 470;            // platform[0] cao hơn mức này thì nghi là quên khai báo sàn (sàn chuẩn y=480)
  var EXIT_EDGE_MARGIN = 40;        // exit.x phải cách mép phải ít nhất chừng này, px

  /** @type {Object<string, JourneyDef>} id → JourneyDef (đã gộp) */
  var defs = {};
  /** @type {CompiledCache | null} cache biên dịch; null = cần biên dịch lại */
  var compiled = null;

  var ID_RE = /^[a-z][a-z0-9_]*$/;

  /** @param {any} a */
  function isArr(a) { return Array.isArray(a); }
  /** @param {any} s @returns {boolean} chuỗi không rỗng */
  function isStr(s) { return typeof s === 'string' && s.length > 0; }
  /** @param {any} n @returns {boolean} số hữu hạn (không NaN/Infinity) */
  function isNum(n) { return typeof n === 'number' && isFinite(n); }
  /** Sao chép sâu dữ liệu JSON thuần (không chứa hàm). @param {any} o */
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }

  /**
   * Gộp mảng theo id: phần tử cùng id bị THAY, phần tử mới nối vào cuối. Không sửa base.
   * 💡 Khái niệm: đăng ký nhiều lần (gộp theo id) — content.js đăng ký thẻ/câu đố, journey.js đăng ký khu/màn,
   *   extras.js có thể ghi đè một thẻ cụ thể. Mỗi file chỉ lo phần của mình, thứ tự load không làm mất dữ liệu.
   * @param {any[]} [base]
   * @param {any[]} [add]
   * @returns {any[]}
   */
  function mergeById(base, add) {
    var out = (base || []).slice();
    (add || []).forEach(function (it) {
      if (!it) return;
      var i = -1;
      for (var k = 0; k < out.length; k++) if (out[k] && out[k].id === it.id) { i = k; break; }
      if (i >= 0) out[i] = it; else out.push(it);
    });
    return out;
  }

  /**
   * Chuẩn hoá truyện tranh: chấp nhận mảng panel hoặc {panels:[...]}.
   * @param {any} c
   * @returns {PanelDef[] | null}
   */
  function comicPanels(c) {
    if (!c) return null;
    if (isArr(c)) return c;
    if (isArr(c.panels)) return c.panels;
    return null;
  }

  // ---------------------------------------------------------------------------
  // Biên dịch: JourneyDef -> LevelDef đầy đủ (dùng được bởi scene 'level' và 'boss').
  // ---------------------------------------------------------------------------
  // Các field "hình học" được mượn từ màn v1 khi màn hành trình ghi from:'<id màn v1>'.
  var GEOMETRY = ['width', 'spawn', 'goal', 'platforms', 'pizzas', 'coins', 'enemies', 'exit'];

  /**
   * Biên dịch một màn của hành trình thành LevelDef đầy đủ (điền mặc định, mượn hình học, gắn trùm của khu).
   * Không sửa lv: kết quả là object mới L.
   * @param {JourneyDef} j
   * @param {AreaDef} area khu chứa màn
   * @param {number} ai chỉ số khu trong hành trình
   * @param {LevelDef} lv dữ liệu màn như tác giả viết
   * @param {number} li chỉ số màn trong khu
   * @param {number} gi chỉ số màn trong CẢ hành trình
   * @param {boolean} isLastOfArea màn cuối khu (nơi đặt trùm)
   * @returns {LevelDef}
   */
  function compileLevel(j, area, ai, lv, li, gi, isLastOfArea) {
    /** @type {any} LevelDef đang dựng dần (field được thêm từng bước) */
    var L = {};
    // 💡 Khái niệm: kế thừa dữ liệu — màn hành trình có thể ghi from:'kitchen' để MƯỢN bục/pizza/kẻ địch
    //   của màn v1 rồi chỉ ghi đè vài field. clone() để sửa L không làm hỏng màn gốc.
    if (lv.from) {
      var src = null;
      var list = (OG.Data && OG.Data.levels) || [];
      for (var i = 0; i < list.length; i++) if (list[i].id === lv.from) { src = list[i]; break; }
      if (src) GEOMETRY.forEach(function (k) { if (src[k] != null) L[k] = clone(src[k]); });
    }
    for (var key in lv) if (Object.prototype.hasOwnProperty.call(lv, key)) L[key] = lv[key];
    // Field "vị trí trong hành trình" — các scene/HUD dùng để biết màn thuộc khu nào, thứ mấy.
    L.journey = j.id;
    L.areaId = area.id;
    L.areaIndex = ai;
    L.indexInArea = li;
    L.journeyIndex = gi;
    // Điền mặc định: màn thiếu field vẫn chơi được (ưu tiên màn → khu → hành trình → giá trị cứng).
    L.name = L.name || area.name;
    L.icon = L.icon || area.emoji || j.emoji || '📍';
    L.theme = L.theme || area.sceneryTheme || 'garden';
    L.music = L.music || area.music || null;
    L.width = L.width || DEFAULT_LEVEL_WIDTH;
    L.spawn = L.spawn || { x: DEFAULT_SPAWN_X, y: DEFAULT_SPAWN_Y };
    // ⚠️ Bẫy: platforms[0] luôn là SÀN chính (y = 480, cao 60) — level.js và boss-scene.js dựa vào bất biến này
    //   để đánh dấu isFloor (sàn được vẽ và xử lý khác bục).
    L.platforms = L.platforms || [[0, 480, L.width, 60]];
    L.pizzas = L.pizzas || [];
    L.coins = L.coins || [];
    L.enemies = L.enemies || [];
    L.exit = L.exit || { x: L.width - DEFAULT_EXIT_MARGIN };
    L.goal = L.goal != null ? L.goal : Math.min(DEFAULT_GOAL_MAX, L.pizzas.length);
    L.quests = L.quests || [];
    L.final = false; // kết thúc hành trình do OG.Story xử lý, không phải Game.victory của v1
    L.pages = L.pages || [];
    L.quizGates = normalizeGates(L);
    L.guideSpots = L.guideSpots || [];
    L.checkpoints = L.checkpoints || null;
    L.comicTriggers = L.comicTriggers || [];
    // Trùm của khu: gắn vào màn cuối khu (trừ khi màn tự khai báo boss — kể cả boss: null để tắt trùm).
    if (L.boss === undefined) L.boss = (isLastOfArea && area.boss && area.boss.bossId) || null;
    if (L.boss && isLastOfArea && area.boss && area.boss.bossId === L.boss) {
      L.bossArena = area.boss.arena || null;
      L.bossIntro = area.boss.intro || null;
    }
    L.isLastOfArea = !!isLastOfArea;
    return L;
  }

  /**
   * Chuẩn hoá quizGate (1 cổng) hoặc quizGates (mảng) → [{quiz, x:number|'exit', id}].
   * @param {any} L màn đang biên dịch
   * @returns {QuizGate[]}
   */
  function normalizeGates(L) {
    /** @type {any[]} */
    var arr = [];
    if (L.quizGate) arr.push(L.quizGate);
    if (isArr(L.quizGates)) arr = arr.concat(L.quizGates);
    return arr.map(function (g, i) {
      // Cho phép viết tắt quizGate: 'q_id' thay vì { quiz: 'q_id' }.
      if (typeof g === 'string') g = { quiz: g };
      return { id: g.id || ('gate' + i), quiz: g.quiz || g.quizId, x: g.x == null ? 'exit' : g.x };
    });
  }

  /** Biên dịch MỌI hành trình vào cache. @returns {CompiledCache} */
  function compileAll() {
    /** @type {CompiledCache} */
    var out = { levels: {}, order: {} };
    compiled = out;
    Object.keys(defs).forEach(function (jid) {
      var j = defs[jid], gi = 0;
      out.order[jid] = [];
      (j.areas || []).forEach(function (area, ai) {
        var lvls = area.levels || [];
        lvls.forEach(function (lv, li) {
          if (!lv || !lv.id) return;
          var L = compileLevel(j, area, ai, lv, li, gi++, li === lvls.length - 1);
          out.levels[L.id] = L;
          out.order[jid].push(L.id);
        });
      });
    });
    return out;
  }

  /**
   * Lấy cache biên dịch, biên dịch lại nếu cache đã bị vô hiệu hoá.
   * 💡 Khái niệm: cache lười (lazy) + invalidate — register()/validateAll() chỉ đặt compiled = null;
   *   lần đọc kế tiếp mới biên dịch lại. Đăng ký 20 lần lúc load cũng chỉ tốn MỘT lần biên dịch.
   * @returns {CompiledCache}
   */
  function getCompiled() { return compiled || compileAll(); }

  // ---------------------------------------------------------------------------
  // Kiểm tra dữ liệu (validate). Mỗi bước ghi lỗi vào V theo đúng thứ tự: phần đầu → truyện tranh → khu
  // → thẻ → câu đố → màn. Lỗi (err) làm hành trình bị ẩn; cảnh báo (wrn) chỉ in khi verbose.
  // ---------------------------------------------------------------------------

  /**
   * Kiểm tra truyện tranh tham chiếu bởi id có tồn tại. id null/undefined = không tham chiếu → bỏ qua.
   * @param {Validator} V
   * @param {string} path
   * @param {any} id
   */
  function comicRef(V, path, id) { if (id != null && !V.comics[id]) V.err(path, 'truyện tranh "' + id + '" không tồn tại'); }

  /** Field cấp hành trình: id, tiêu đề, người dẫn đường, bảng màu. @param {JourneyDef} j @param {Validator} V */
  function validateHeader(j, V) {
    var P = V.P;
    if (!isStr(j.id) || !ID_RE.test(j.id)) V.err(P + '.id', 'phải là chuỗi a-z0-9_ bắt đầu bằng chữ');
    ['title', 'emoji', 'description'].forEach(function (k) { if (!isStr(j[k])) V.err(P + '.' + k, 'thiếu chuỗi'); });
    if (!j.guide || !isStr(j.guide.charId) || !isStr(j.guide.name)) V.err(P + '.guide', 'cần {charId, name}');
    else if (OG.Data && OG.Data.characters && !OG.Data.characters[j.guide.charId]) V.wrn(P + '.guide.charId', 'nhân vật "' + j.guide.charId + '" chưa đăng ký trong OG.Data.characters (Sprites vẫn vẽ dự phòng)');
    if (j.palette && typeof j.palette !== 'object') V.err(P + '.palette', 'phải là object màu');
  }

  /** Truyện tranh: cấu trúc panel, độ dài thoại; rồi các tham chiếu intro/ending. @param {JourneyDef} j @param {Validator} V */
  function validateComics(j, V) {
    var P = V.P;
    var comics = j.comics || {};
    if (typeof comics !== 'object' || isArr(comics)) { V.err(P + '.comics', 'phải là object {comicId: panels}'); comics = {}; }
    V.comics = comics;
    Object.keys(comics).forEach(function (cid) {
      var panels = comicPanels(comics[cid]);
      var cp = P + '.comics.' + cid;
      if (!panels || !panels.length) { V.err(cp, 'cần mảng panels không rỗng'); return; }
      panels.forEach(function (pn, pi) {
        var pp = cp + '[' + pi + ']';
        if (!pn || typeof pn !== 'object') { V.err(pp, 'panel phải là object'); return; }
        if (pn.chars && !isArr(pn.chars)) V.err(pp + '.chars', 'phải là mảng');
        (pn.chars || []).forEach(function (c, ci) { if (!c || !isStr(c.id)) V.err(pp + '.chars[' + ci + ']', 'thiếu id nhân vật'); });
        if (pn.bubbles && !isArr(pn.bubbles)) V.err(pp + '.bubbles', 'phải là mảng');
        (pn.bubbles || []).forEach(function (b, bi) {
          if (!b || !isStr(b.text)) V.err(pp + '.bubbles[' + bi + ']', 'thiếu text');
          else if (b.text.length > MAX_LINE_CHARS) V.wrn(pp + '.bubbles[' + bi + ']', 'câu dài ' + b.text.length + ' ký tự (nên ≤ 90 cho trẻ nhỏ)');
        });
        if (!(pn.bubbles && pn.bubbles.length) && !isStr(pn.caption)) V.wrn(pp, 'panel không có bong bóng thoại hay caption');
      });
    });
    comicRef(V, P + '.intro', j.intro);
    // ending có hai dạng: chuỗi comicId, hoặc object {comic, title, text}.
    var ending = /** @type {any} */ (j.ending);
    if (ending && typeof ending === 'object') comicRef(V, P + '.ending.comic', ending.comic);
    else if (ending != null) comicRef(V, P + '.ending', ending);
  }

  /** Khu: id duy nhất, tên, chủ đề cảnh nền, trùm, có màn. @param {JourneyDef} j @param {Validator} V */
  function validateAreas(j, V) {
    var P = V.P;
    if (!isArr(j.areas) || !j.areas.length) V.err(P + '.areas', 'cần ít nhất 1 khu');
    (j.areas || []).forEach(function (a, ai) {
      var ap = P + '.areas[' + ai + ']';
      if (!a || !isStr(a.id)) { V.err(ap + '.id', 'thiếu id'); return; }
      // Đã có id → đường dẫn lỗi dùng id (dễ tìm trong file dữ liệu hơn chỉ số).
      ap = P + '.areas.' + a.id;
      if (V.areaIds[a.id]) V.err(ap, 'trùng id khu');
      V.areaIds[a.id] = true;
      if (!isStr(a.name)) V.err(ap + '.name', 'thiếu tên');
      if (!isStr(a.sceneryTheme)) V.err(ap + '.sceneryTheme', 'thiếu chủ đề cảnh nền');
      else if (OG.Scenery && !OG.Scenery.known(a.sceneryTheme)) V.wrn(ap + '.sceneryTheme', 'chủ đề "' + a.sceneryTheme + '" chưa đăng ký (sẽ vẽ nền mặc định)');
      comicRef(V, ap + '.intro', a.intro);
      comicRef(V, ap + '.outro', a.outro);
      if (a.boss != null) {
        if (!a.boss || !isStr(a.boss.bossId)) V.err(ap + '.boss', 'cần {bossId}');
        else if (OG.Bosses && OG.Bosses.has && !OG.Bosses.has(a.boss.bossId)) V.wrn(ap + '.boss.bossId', 'trùm "' + a.boss.bossId + '" chưa đăng ký (trận trùm sẽ bị bỏ qua)');
        if (a.boss && a.boss.intro) comicRef(V, ap + '.boss.intro', a.boss.intro);
      }
      if (!isArr(a.levels) || !a.levels.length) V.err(ap + '.levels', 'cần ít nhất 1 màn');
    });
  }

  /** Thẻ kiến thức: id duy nhất, tiêu đề, câu sự thật ngắn, khu hợp lệ. @param {JourneyDef} j @param {Validator} V */
  function validateCards(j, V) {
    var P = V.P;
    (j.cards || []).forEach(function (c, i) {
      var cp = P + '.cards[' + i + ']';
      if (!c || !isStr(c.id)) { V.err(cp, 'thiếu id'); return; }
      cp = P + '.cards.' + c.id;
      if (V.cards[c.id]) V.err(cp, 'trùng id thẻ');
      V.cards[c.id] = c;
      if (!isStr(c.title)) V.err(cp + '.title', 'thiếu tiêu đề');
      if (!isStr(c.fact)) V.err(cp + '.fact', 'thiếu câu sự thật');
      else if (c.fact.length > MAX_FACT_CHARS) V.wrn(cp + '.fact', 'dài ' + c.fact.length + ' ký tự (nên ≤ 160, 1–2 câu ngắn)');
      if (c.areaId && !V.areaIds[c.areaId]) V.err(cp + '.areaId', 'khu "' + c.areaId + '" không tồn tại');
      if (typeof c.drawIcon !== 'function' && !c.icon) V.wrn(cp, 'không có drawIcon hay icon (sẽ vẽ hình trang sách mặc định)');
    });
  }

  /** Câu đố: 2–3 lựa chọn, chỉ số đáp án hợp lệ, có gợi ý/giải thích. @param {JourneyDef} j @param {Validator} V */
  function validateQuizzes(j, V) {
    var P = V.P;
    (j.quizzes || []).forEach(function (q, i) {
      var qp = P + '.quizzes[' + i + ']';
      if (!q || !isStr(q.id)) { V.err(qp, 'thiếu id'); return; }
      qp = P + '.quizzes.' + q.id;
      if (V.quizzes[q.id]) V.err(qp, 'trùng id câu đố');
      V.quizzes[q.id] = q;
      if (!isStr(q.question)) V.err(qp + '.question', 'thiếu câu hỏi');
      // Trẻ nhỏ: tối đa 3 lựa chọn (khớp phím số 1–3 và ba nút lớn trên màn hình).
      if (!isArr(q.choices) || q.choices.length < 2 || q.choices.length > 3) V.err(qp + '.choices', 'cần 2–3 lựa chọn');
      else q.choices.forEach(function (ch, ci) { if (!ch || !isStr(ch.text)) V.err(qp + '.choices[' + ci + ']', 'thiếu text'); });
      if (!isNum(q.answer) || !isArr(q.choices) || q.answer < 0 || q.answer >= q.choices.length) V.err(qp + '.answer', 'chỉ số đáp án không hợp lệ');
      if (!isStr(q.hint)) V.wrn(qp + '.hint', 'nên có gợi ý thân thiện khi trả lời sai');
      if (!isStr(q.explain)) V.wrn(qp + '.explain', 'nên có lời giải thích khi trả lời đúng');
      if (q.cardId && !V.cards[q.cardId]) V.wrn(qp + '.cardId', 'thẻ "' + q.cardId + '" không tồn tại');
    });
  }

  /**
   * Kiểm tra một màn (trên bản ĐÃ BIÊN DỊCH, để bắt cả lỗi do giá trị mặc định/mượn từ màn gốc).
   * @param {JourneyDef} j
   * @param {AreaDef} a
   * @param {LevelDef} lv
   * @param {number} li
   * @param {Object<string, boolean>} seen id màn đã gặp (phát hiện trùng)
   * @param {Validator} V
   */
  function validateLevel(j, a, lv, li, seen, V) {
    var P = V.P, cards = V.cards, quizzes = V.quizzes;
    var lp = P + '.areas.' + a.id + '.levels[' + li + ']';
    if (!lv || !isStr(lv.id)) { V.err(lp + '.id', 'thiếu id'); return; }
    lp = P + '.levels.' + lv.id;
    // Id màn có tiền tố hành trình để không đụng màn cổ điển trong save (progress.levels dùng chung).
    if (lv.id.indexOf(j.id + '-') !== 0) V.err(lp + '.id', 'id màn phải bắt đầu bằng "' + j.id + '-"');
    if (seen[lv.id]) V.err(lp, 'trùng id màn');
    seen[lv.id] = true;
    if (OG.Data && OG.Data.levels) {
      for (var k = 0; k < OG.Data.levels.length; k++) if (OG.Data.levels[k].id === lv.id) V.err(lp, 'trùng id với màn cổ điển');
    }
    if (lv.from && !(OG.Data && OG.Data.levels && OG.Data.levels.some(function (/** @type {LevelDef} */ l) { return l.id === lv.from; }))) V.err(lp + '.from', 'màn gốc "' + lv.from + '" không có');
    /** @type {any} */
    var L = compileLevel(j, a, 0, lv, li, 0, li === a.levels.length - 1);
    // Hình học: sàn, bề rộng, cửa ra, số pizza cần ăn.
    if (!isArr(L.platforms) || !L.platforms.length) V.err(lp + '.platforms', 'cần ít nhất sàn');
    else {
      var f = L.platforms[0];
      if (!isArr(f) || f.length !== 4) V.err(lp + '.platforms[0]', 'phải là [x,y,w,h]');
      else if (f[1] < FLOOR_MIN_Y) V.wrn(lp + '.platforms[0]', 'platform đầu tiên nên là sàn y=480');
    }
    if (!isNum(L.width) || L.width < MIN_LEVEL_WIDTH) V.err(lp + '.width', 'phải ≥ 960');
    if (!L.exit || !isNum(L.exit.x) || L.exit.x > L.width - EXIT_EDGE_MARGIN) V.err(lp + '.exit', 'exit.x phải nằm trong màn');
    // ⚠️ Bẫy: goal > số pizza → người chơi KHÔNG BAO GIỜ mở được cửa ra; lỗi này bắt buộc phải chặn.
    if (L.goal > L.pizzas.length) V.err(lp + '.goal', 'goal (' + L.goal + ') lớn hơn số pizza (' + L.pizzas.length + ')');
    // Nội dung học tập gắn vào màn: trang sách (thẻ), cổng câu đố, điểm người dẫn đường, truyện tranh.
    L.pages.forEach(function (/** @type {any} */ pg, /** @type {number} */ pi) {
      var pp = lp + '.pages[' + pi + ']';
      if (!pg || !isStr(pg.card)) V.err(pp, 'cần {card, x, y}');
      else if (!cards[pg.card]) V.err(pp + '.card', 'thẻ "' + pg.card + '" không tồn tại');
      else if (cards[pg.card].areaId && cards[pg.card].areaId !== a.id) V.wrn(pp + '.card', 'thẻ thuộc khu khác (' + cards[pg.card].areaId + ')');
      if (pg && (!isNum(pg.x) || !isNum(pg.y))) V.err(pp, 'thiếu toạ độ x, y');
    });
    L.quizGates.forEach(function (/** @type {QuizGate} */ g, /** @type {number} */ gi) {
      var gp = lp + '.quizGates[' + gi + ']';
      if (!quizzes[g.quiz]) V.err(gp + '.quiz', 'câu đố "' + g.quiz + '" không tồn tại');
      if (g.x !== 'exit' && (!isNum(g.x) || g.x >= L.exit.x)) V.err(gp + '.x', 'phải là số < exit.x hoặc "exit"');
    });
    L.guideSpots.forEach(function (/** @type {any} */ s, /** @type {number} */ si) {
      var sp = lp + '.guideSpots[' + si + ']';
      var lines = s && (s.lines || (s.text ? [s.text] : null));
      if (!s || !isNum(s.x)) V.err(sp + '.x', 'thiếu x');
      if (!lines || !lines.length) V.err(sp, 'cần text hoặc lines');
      else lines.forEach(function (/** @type {any} */ t) { if (isStr(t) && t.length > MAX_LINE_CHARS) V.wrn(sp, 'câu dài ' + t.length + ' ký tự (nên ≤ 90)'); });
      if (s && s.card && !cards[s.card]) V.wrn(sp + '.card', 'thẻ "' + s.card + '" không tồn tại');
    });
    L.comicTriggers.forEach(function (/** @type {any} */ ct, /** @type {number} */ ci) {
      if (!ct || !isNum(ct.x)) V.err(lp + '.comicTriggers[' + ci + ']', 'cần {x, comic}');
      else comicRef(V, lp + '.comicTriggers[' + ci + '].comic', ct.comic);
    });
    comicRef(V, lp + '.intro', lv.intro);
    comicRef(V, lp + '.outro', lv.outro);
    if (lv.checkpoints != null && !isArr(lv.checkpoints)) V.err(lp + '.checkpoints', 'phải là mảng x');
  }

  /**
   * Kiểm tra toàn bộ một JourneyDef.
   * 💡 Khái niệm: validate dữ liệu — dữ liệu do người (hoặc sinh viên) viết tay chắc chắn có lỗi gõ.
   *   Bắt lỗi lúc boot với đường dẫn rõ ràng ('home.levels.home-1.goal: ...') tốt hơn nhiều so với để game
   *   sập giữa màn chơi. Lỗi nặng → ẩn hành trình; cảnh báo → vẫn chơi được.
   * @param {JourneyDef} j
   * @returns {ValidateResult}
   */
  function validateDef(j) {
    /** @type {string[]} */ var errors = [];
    /** @type {string[]} */ var warnings = [];
    if (!j || typeof j !== 'object') return { ok: false, errors: ['hành trình không phải object'], warnings: [] };
    /** @type {Validator} */
    var V = {
      P: j.id || '?',
      errors: errors,
      warnings: warnings,
      err: function (path, msg) { errors.push(path + ': ' + msg); },
      wrn: function (path, msg) { warnings.push(path + ': ' + msg); },
      comics: {},
      areaIds: {},
      cards: {},
      quizzes: {}
    };
    validateHeader(j, V);
    validateComics(j, V);
    validateAreas(j, V);
    // Thẻ phải kiểm tra TRƯỚC câu đố và màn: hai bước sau tra V.cards / V.quizzes để bắt tham chiếu sai.
    validateCards(j, V);
    validateQuizzes(j, V);
    /** @type {Object<string, boolean>} */
    var seen = {};
    (j.areas || []).forEach(function (a) {
      if (!a || !isArr(a.levels)) return;
      a.levels.forEach(function (lv, li) { validateLevel(j, a, lv, li, seen, V); });
    });
    return { ok: errors.length === 0, errors: errors, warnings: warnings };
  }

  // ---------------------------------------------------------------------------
  // API công khai
  // ---------------------------------------------------------------------------
  var J = (OG.Journeys = {
    /**
     * Đăng ký (hoặc GỘP vào) một hành trình. Gọi lúc load file dữ liệu.
     * areas/cards/quizzes gộp theo id; comics gộp theo khoá; field khác bị ghi đè. Vô hiệu hoá cache biên dịch.
     * @param {Partial<JourneyDef> & {id: string}} def
     * @returns {JourneyDef | null} bản đã gộp (null nếu thiếu id)
     * @example
     *   OG.Journeys.register({ id: 'home', cards: [{ id: 'c_fridge', areaId: 'kitchen', title: 'Tủ lạnh', fact: '...' }] });
     */
    register: function (def) {
      if (!def || !isStr(def.id)) { console.warn('[OG.Journeys] register cần id'); return null; }
      /** @type {any} */
      var cur = defs[def.id];
      if (!cur) { cur = defs[def.id] = /** @type {any} */ ({ id: def.id, areas: [], cards: [], quizzes: [], comics: {} }); }
      for (var k in def) {
        if (!Object.prototype.hasOwnProperty.call(def, k)) continue;
        if (k === 'areas' || k === 'cards' || k === 'quizzes') cur[k] = mergeById(cur[k], def[k]);
        else if (k === 'comics') { for (var c in def.comics) cur.comics[c] = def.comics[c]; }
        else cur[k] = def[k];
      }
      compiled = null;
      return cur;
    },
    /** @param {string} id @returns {boolean} */
    has: function (id) { return !!defs[id]; },
    /** @param {string} id @returns {JourneyDef | null} */
    get: function (id) { return defs[id] || null; },
    /**
     * Liệt kê hành trình theo order (thiếu = 99) rồi theo id.
     * @returns {JourneyDef[]}
     */
    list: function () {
      return Object.keys(defs).map(function (k) { return defs[k]; })
        .sort(function (a, b) { return ((a.order || DEFAULT_ORDER) - (b.order || DEFAULT_ORDER)) || (a.id < b.id ? -1 : 1); });
    },
    /** @returns {string[]} id hành trình theo thứ tự của list() */
    ids: function () { return J.list().map(function (j) { return j.id; }); },

    // ---- Kiểm tra ----
    /**
     * Kiểm tra một hành trình (theo id đã đăng ký, hoặc truyền thẳng object).
     * 🧪 Thử: trong console gõ  OG.Journeys.validate('home')  để xem errors/warnings của hành trình Nhà.
     * @param {string | JourneyDef} idOrDef
     * @returns {ValidateResult}
     */
    validate: function (idOrDef) {
      var j = typeof idOrDef === 'string' ? defs[idOrDef] : idOrDef;
      if (!j) return { ok: false, errors: ['không có hành trình "' + idOrDef + '"'], warnings: [] };
      return validateDef(j);
    },
    /**
     * Kiểm tra tất cả (gọi lúc boot). Lỗi → console.warn và đánh dấu def.invalid = true (ẩn khỏi màn chọn).
     * @param {{verbose?: boolean}} [opts] verbose = in cả cảnh báo
     * @returns {Object<string, ValidateResult>} journeyId → kết quả
     */
    validateAll: function (opts) {
      /** @type {Object<string, ValidateResult>} */
      var out = {};
      Object.keys(defs).forEach(function (id) {
        var r = validateDef(defs[id]);
        out[id] = r;
        defs[id].invalid = !r.ok;
        if (!r.ok) console.warn('[OG.Journeys] "' + id + '" có ' + r.errors.length + ' lỗi dữ liệu:\n  ' + r.errors.join('\n  '));
        if (opts && opts.verbose && r.warnings.length) console.warn('[OG.Journeys] "' + id + '" cảnh báo:\n  ' + r.warnings.join('\n  '));
      });
      compiled = null;
      return out;
    },
    /** Kiểm tra rồi biên dịch sẵn mọi hành trình. main.js gọi SAU khi trùm/nhân vật đã đăng ký. */
    init: function () { J.validateAll(); compileAll(); },

    // ---- Màn ----
    /** @param {string} levelId @returns {LevelDef | null} LevelDef đã biên dịch */
    getLevel: function (levelId) { return getCompiled().levels[levelId] || null; },
    /** @param {string} levelId @returns {boolean} */
    isJourneyLevel: function (levelId) { return !!getCompiled().levels[levelId]; },
    /** @param {string} journeyId @returns {LevelDef[]} theo thứ tự chơi */
    levelsOf: function (journeyId) { return (getCompiled().order[journeyId] || []).map(function (id) { return getCompiled().levels[id]; }); },
    /** @param {string} journeyId @returns {string[]} bản sao (sửa thoải mái) */
    levelIds: function (journeyId) { return (getCompiled().order[journeyId] || []).slice(); },
    /** @param {string} levelId @returns {AreaDef | null} khu chứa màn */
    areaOf: function (levelId) {
      var L = J.getLevel(levelId);
      if (!L) return null;
      return J.getArea(L.journey, L.areaId);
    },
    /** @param {string} journeyId @param {string} areaId @returns {AreaDef | null} */
    getArea: function (journeyId, areaId) {
      var j = defs[journeyId];
      if (!j) return null;
      for (var i = 0; i < j.areas.length; i++) if (j.areas[i].id === areaId) return j.areas[i];
      return null;
    },
    /**
     * Lấy màn kế tiếp trong hành trình (vượt qua ranh giới khu).
     * @param {string} levelId
     * @returns {string | null} null nếu là màn cuối hoặc không phải màn hành trình
     */
    nextLevel: function (levelId) {
      var L = J.getLevel(levelId);
      if (!L) return null;
      var ids = getCompiled().order[L.journey];
      return ids[ids.indexOf(levelId) + 1] || null;
    },
    /** @param {string} levelId @returns {boolean} */
    isFirstOfArea: function (levelId) { var L = J.getLevel(levelId); return !!L && L.indexInArea === 0; },
    /** @param {string} levelId @returns {boolean} */
    isLastOfArea: function (levelId) { var L = J.getLevel(levelId); return !!L && L.isLastOfArea; },
    /** @param {string} levelId @returns {boolean} màn cuối của cả hành trình */
    isFinalLevel: function (levelId) { var L = J.getLevel(levelId); return !!L && !J.nextLevel(levelId); },

    // ---- Nội dung ----
    /** @param {string} journeyId @param {string} cardId @returns {CardDef | null} */
    getCard: function (journeyId, cardId) { return find(defs[journeyId] && defs[journeyId].cards, cardId); },
    /** @param {string} journeyId @param {string} quizId @returns {QuizDef | null} */
    getQuiz: function (journeyId, quizId) { return find(defs[journeyId] && defs[journeyId].quizzes, quizId); },
    /**
     * Lấy truyện tranh dạng mảng panel (đã chuẩn hoá).
     * @param {string} journeyId
     * @param {string} comicId
     * @returns {PanelDef[] | null}
     */
    getComic: function (journeyId, comicId) {
      var j = defs[journeyId];
      return j && comicId ? comicPanels(j.comics[comicId]) : null;
    },
    /** @param {string} journeyId @param {string} [areaId] lọc theo khu; bỏ trống = mọi thẻ @returns {CardDef[]} */
    cardsOf: function (journeyId, areaId) {
      var j = defs[journeyId];
      if (!j) return [];
      return j.cards.filter(function (c) { return !areaId || c.areaId === areaId; });
    },

    // ---- Tiến độ (đọc OG.Progress; chỉ gọi sau boot) ----
    /**
     * Màn mở khi là màn đầu hành trình hoặc màn liền trước đã xong (mở khoá tuần tự).
     * @param {string} levelId
     * @returns {boolean}
     */
    isLevelUnlocked: function (levelId) {
      var L = J.getLevel(levelId);
      if (!L) return false;
      var ids = getCompiled().order[L.journey], i = ids.indexOf(levelId);
      return i <= 0 || isDone(ids[i - 1]);
    },
    /** @param {string} journeyId @param {string} areaId @returns {boolean} màn đầu của khu đã mở */
    isAreaUnlocked: function (journeyId, areaId) {
      var lv = J.levelsOf(journeyId).filter(function (l) { return l.areaId === areaId; })[0];
      return !!lv && J.isLevelUnlocked(lv.id);
    },
    /** @param {string} journeyId @param {string} areaId @returns {boolean} mọi màn của khu đã xong */
    isAreaDone: function (journeyId, areaId) {
      var lv = J.levelsOf(journeyId).filter(function (l) { return l.areaId === areaId; });
      return lv.length > 0 && lv.every(function (l) { return isDone(l.id); });
    },
    /**
     * Tìm màn đầu tiên chưa xong (hoặc màn cuối nếu đã xong hết) — nút "Chơi tiếp".
     * @param {string} journeyId
     * @returns {string | null}
     */
    firstIncomplete: function (journeyId) {
      var ids = getCompiled().order[journeyId] || [];
      for (var i = 0; i < ids.length; i++) if (!isDone(ids[i])) return ids[i];
      return ids[ids.length - 1] || null;
    },
    /** @param {string} journeyId @returns {boolean} */
    isComplete: function (journeyId) {
      var ids = getCompiled().order[journeyId] || [];
      return ids.length > 0 && ids.every(isDone);
    },
    /**
     * Tổng hợp tiến độ một hành trình.
     * @param {string} journeyId
     * @returns {{levelsDone: number, levels: number, stars: number, maxStars: number}}
     */
    progress: function (journeyId) {
      var ids = getCompiled().order[journeyId] || [], done = 0, stars = 0;
      ids.forEach(function (id) {
        if (isDone(id)) done++;
        var r = OG.Progress && OG.Progress.getRecord ? OG.Progress.getRecord(id) : null;
        stars += r ? (r.stars | 0) : 0;
      });
      return { levelsDone: done, levels: ids.length, stars: stars, maxStars: ids.length * STARS_PER_LEVEL };
    }
  });

  /** @param {any[] | undefined} arr @param {string} id @returns {any} phần tử có id khớp, hoặc null */
  function find(arr, id) {
    if (!arr) return null;
    for (var i = 0; i < arr.length; i++) if (arr[i] && arr[i].id === id) return arr[i];
    return null;
  }
  /** @param {string} levelId */
  function isDone(levelId) { return !!(OG.Progress && OG.Progress.isCompleted && OG.Progress.isCompleted(levelId)); }
})();
