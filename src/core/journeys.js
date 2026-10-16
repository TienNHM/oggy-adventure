/* OG.Journeys — sổ đăng ký HÀNH TRÌNH học tập (dữ liệu), biên dịch màn, kiểm tra dữ liệu.
 * Chủ sở hữu: agent Tích hợp (src/core/). Hợp đồng đầy đủ: docs/STORY.md mục 2–3.
 *
 * - Mỗi hành trình đăng ký từ thư mục riêng src/journeys/<id>/ bằng OG.Journeys.register(def).
 *   Gọi register nhiều lần cùng id được: các lần sau GỘP vào (cards/quizzes/areas nối theo id, comics gộp khoá).
 * - Màn của hành trình KHÔNG nằm trong OG.Data.levels (giữ nguyên chiến dịch cổ điển v1);
 *   OG.Data.getLevel(id) tự tìm sang OG.Journeys.getLevel(id).
 * - Không truy cập OG.Save.data lúc load. */
(function () {
  'use strict';
  var OG = window.OG;

  var defs = {};        // id -> JourneyDef (đã gộp)
  var compiled = null;  // cache: {levels:{id:LevelDef}, order:{journeyId:[levelId]}}

  var ID_RE = /^[a-z][a-z0-9_]*$/;

  function isArr(a) { return Array.isArray(a); }
  function isStr(s) { return typeof s === 'string' && s.length > 0; }
  function isNum(n) { return typeof n === 'number' && isFinite(n); }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }

  // Gộp mảng theo id: phần tử cùng id bị thay, phần tử mới nối vào cuối.
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

  // Chuẩn hoá truyện tranh: chấp nhận mảng panel hoặc {panels:[...]}.
  function comicPanels(c) {
    if (!c) return null;
    if (isArr(c)) return c;
    if (isArr(c.panels)) return c.panels;
    return null;
  }

  // ---------------------------------------------------------------------------
  // Biên dịch: JourneyDef -> LevelDef đầy đủ (dùng được bởi scene 'level' và 'boss').
  // ---------------------------------------------------------------------------
  var GEOMETRY = ['width', 'spawn', 'goal', 'platforms', 'pizzas', 'coins', 'enemies', 'exit'];

  function compileLevel(j, area, ai, lv, li, gi, isLastOfArea) {
    var L = {};
    // Mượn hình học từ màn v1 (vd from:'kitchen') rồi ghi đè bằng field của màn.
    if (lv.from) {
      var src = null;
      var list = (OG.Data && OG.Data.levels) || [];
      for (var i = 0; i < list.length; i++) if (list[i].id === lv.from) { src = list[i]; break; }
      if (src) GEOMETRY.forEach(function (k) { if (src[k] != null) L[k] = clone(src[k]); });
    }
    for (var key in lv) if (Object.prototype.hasOwnProperty.call(lv, key)) L[key] = lv[key];
    L.journey = j.id;
    L.areaId = area.id;
    L.areaIndex = ai;
    L.indexInArea = li;
    L.journeyIndex = gi;
    L.name = L.name || area.name;
    L.icon = L.icon || area.emoji || j.emoji || '📍';
    L.theme = L.theme || area.sceneryTheme || 'garden';
    L.music = L.music || area.music || null;
    L.width = L.width || 1600;
    L.spawn = L.spawn || { x: 70, y: 420 };
    L.platforms = L.platforms || [[0, 480, L.width, 60]];
    L.pizzas = L.pizzas || [];
    L.coins = L.coins || [];
    L.enemies = L.enemies || [];
    L.exit = L.exit || { x: L.width - 120 };
    L.goal = L.goal != null ? L.goal : Math.min(3, L.pizzas.length);
    L.quests = L.quests || [];
    L.final = false; // kết thúc hành trình do OG.Story xử lý, không phải Game.victory của v1
    L.pages = L.pages || [];
    L.quizGates = normalizeGates(L);
    L.guideSpots = L.guideSpots || [];
    L.checkpoints = L.checkpoints || null;
    L.comicTriggers = L.comicTriggers || [];
    // Trùm của khu: gắn vào màn cuối khu (trừ khi màn tự khai báo boss).
    if (L.boss === undefined) L.boss = (isLastOfArea && area.boss && area.boss.bossId) || null;
    if (L.boss && isLastOfArea && area.boss && area.boss.bossId === L.boss) {
      L.bossArena = area.boss.arena || null;
      L.bossIntro = area.boss.intro || null;
    }
    L.isLastOfArea = !!isLastOfArea;
    return L;
  }

  // quizGate (1 cổng) hoặc quizGates (mảng) -> [{quiz, x:number|'exit', id}]
  function normalizeGates(L) {
    var arr = [];
    if (L.quizGate) arr.push(L.quizGate);
    if (isArr(L.quizGates)) arr = arr.concat(L.quizGates);
    return arr.map(function (g, i) {
      if (typeof g === 'string') g = { quiz: g };
      return { id: g.id || ('gate' + i), quiz: g.quiz || g.quizId, x: g.x == null ? 'exit' : g.x };
    });
  }

  function compileAll() {
    compiled = { levels: {}, order: {} };
    Object.keys(defs).forEach(function (jid) {
      var j = defs[jid], gi = 0;
      compiled.order[jid] = [];
      (j.areas || []).forEach(function (area, ai) {
        var lvls = area.levels || [];
        lvls.forEach(function (lv, li) {
          if (!lv || !lv.id) return;
          var L = compileLevel(j, area, ai, lv, li, gi++, li === lvls.length - 1);
          compiled.levels[L.id] = L;
          compiled.order[jid].push(L.id);
        });
      });
    });
    return compiled;
  }
  function C() { return compiled || compileAll(); }

  // ---------------------------------------------------------------------------
  // Kiểm tra dữ liệu
  // ---------------------------------------------------------------------------
  function validateDef(j) {
    var errors = [], warnings = [];
    function err(path, msg) { errors.push(path + ': ' + msg); }
    function wrn(path, msg) { warnings.push(path + ': ' + msg); }
    if (!j || typeof j !== 'object') return { ok: false, errors: ['hành trình không phải object'], warnings: [] };
    var P = j.id || '?';
    if (!isStr(j.id) || !ID_RE.test(j.id)) err(P + '.id', 'phải là chuỗi a-z0-9_ bắt đầu bằng chữ');
    ['title', 'emoji', 'description'].forEach(function (k) { if (!isStr(j[k])) err(P + '.' + k, 'thiếu chuỗi'); });
    if (!j.guide || !isStr(j.guide.charId) || !isStr(j.guide.name)) err(P + '.guide', 'cần {charId, name}');
    else if (OG.Data && OG.Data.characters && !OG.Data.characters[j.guide.charId]) wrn(P + '.guide.charId', 'nhân vật "' + j.guide.charId + '" chưa đăng ký trong OG.Data.characters (Sprites vẫn vẽ dự phòng)');
    if (j.palette && typeof j.palette !== 'object') err(P + '.palette', 'phải là object màu');

    // comics
    var comics = j.comics || {};
    if (typeof comics !== 'object' || isArr(comics)) { err(P + '.comics', 'phải là object {comicId: panels}'); comics = {}; }
    Object.keys(comics).forEach(function (cid) {
      var panels = comicPanels(comics[cid]);
      var cp = P + '.comics.' + cid;
      if (!panels || !panels.length) { err(cp, 'cần mảng panels không rỗng'); return; }
      panels.forEach(function (pn, pi) {
        var pp = cp + '[' + pi + ']';
        if (!pn || typeof pn !== 'object') { err(pp, 'panel phải là object'); return; }
        if (pn.chars && !isArr(pn.chars)) err(pp + '.chars', 'phải là mảng');
        (pn.chars || []).forEach(function (c, ci) { if (!c || !isStr(c.id)) err(pp + '.chars[' + ci + ']', 'thiếu id nhân vật'); });
        if (pn.bubbles && !isArr(pn.bubbles)) err(pp + '.bubbles', 'phải là mảng');
        (pn.bubbles || []).forEach(function (b, bi) {
          if (!b || !isStr(b.text)) err(pp + '.bubbles[' + bi + ']', 'thiếu text');
          else if (b.text.length > 90) wrn(pp + '.bubbles[' + bi + ']', 'câu dài ' + b.text.length + ' ký tự (nên ≤ 90 cho trẻ nhỏ)');
        });
        if (!(pn.bubbles && pn.bubbles.length) && !isStr(pn.caption)) wrn(pp, 'panel không có bong bóng thoại hay caption');
      });
    });
    function comicRef(path, id) { if (id != null && !comics[id]) err(path, 'truyện tranh "' + id + '" không tồn tại'); }
    comicRef(P + '.intro', j.intro);
    if (j.ending && typeof j.ending === 'object') comicRef(P + '.ending.comic', j.ending.comic);
    else if (j.ending != null) comicRef(P + '.ending', j.ending);

    // areas
    var areaIds = {};
    if (!isArr(j.areas) || !j.areas.length) err(P + '.areas', 'cần ít nhất 1 khu');
    (j.areas || []).forEach(function (a, ai) {
      var ap = P + '.areas[' + ai + ']';
      if (!a || !isStr(a.id)) { err(ap + '.id', 'thiếu id'); return; }
      ap = P + '.areas.' + a.id;
      if (areaIds[a.id]) err(ap, 'trùng id khu');
      areaIds[a.id] = true;
      if (!isStr(a.name)) err(ap + '.name', 'thiếu tên');
      if (!isStr(a.sceneryTheme)) err(ap + '.sceneryTheme', 'thiếu chủ đề cảnh nền');
      else if (OG.Scenery && !OG.Scenery.known(a.sceneryTheme)) wrn(ap + '.sceneryTheme', 'chủ đề "' + a.sceneryTheme + '" chưa đăng ký (sẽ vẽ nền mặc định)');
      comicRef(ap + '.intro', a.intro);
      comicRef(ap + '.outro', a.outro);
      if (a.boss != null) {
        if (!a.boss || !isStr(a.boss.bossId)) err(ap + '.boss', 'cần {bossId}');
        else if (OG.Bosses && OG.Bosses.has && !OG.Bosses.has(a.boss.bossId)) wrn(ap + '.boss.bossId', 'trùm "' + a.boss.bossId + '" chưa đăng ký (trận trùm sẽ bị bỏ qua)');
        if (a.boss && a.boss.intro) comicRef(ap + '.boss.intro', a.boss.intro);
      }
      if (!isArr(a.levels) || !a.levels.length) err(ap + '.levels', 'cần ít nhất 1 màn');
    });

    // cards & quizzes
    var cards = {}, quizzes = {};
    (j.cards || []).forEach(function (c, i) {
      var cp = P + '.cards[' + i + ']';
      if (!c || !isStr(c.id)) { err(cp, 'thiếu id'); return; }
      cp = P + '.cards.' + c.id;
      if (cards[c.id]) err(cp, 'trùng id thẻ');
      cards[c.id] = c;
      if (!isStr(c.title)) err(cp + '.title', 'thiếu tiêu đề');
      if (!isStr(c.fact)) err(cp + '.fact', 'thiếu câu sự thật');
      else if (c.fact.length > 160) wrn(cp + '.fact', 'dài ' + c.fact.length + ' ký tự (nên ≤ 160, 1–2 câu ngắn)');
      if (c.areaId && !areaIds[c.areaId]) err(cp + '.areaId', 'khu "' + c.areaId + '" không tồn tại');
      if (typeof c.drawIcon !== 'function' && !c.icon) wrn(cp, 'không có drawIcon hay icon (sẽ vẽ hình trang sách mặc định)');
    });
    (j.quizzes || []).forEach(function (q, i) {
      var qp = P + '.quizzes[' + i + ']';
      if (!q || !isStr(q.id)) { err(qp, 'thiếu id'); return; }
      qp = P + '.quizzes.' + q.id;
      if (quizzes[q.id]) err(qp, 'trùng id câu đố');
      quizzes[q.id] = q;
      if (!isStr(q.question)) err(qp + '.question', 'thiếu câu hỏi');
      if (!isArr(q.choices) || q.choices.length < 2 || q.choices.length > 3) err(qp + '.choices', 'cần 2–3 lựa chọn');
      else q.choices.forEach(function (ch, ci) { if (!ch || !isStr(ch.text)) err(qp + '.choices[' + ci + ']', 'thiếu text'); });
      if (!isNum(q.answer) || !isArr(q.choices) || q.answer < 0 || q.answer >= q.choices.length) err(qp + '.answer', 'chỉ số đáp án không hợp lệ');
      if (!isStr(q.hint)) wrn(qp + '.hint', 'nên có gợi ý thân thiện khi trả lời sai');
      if (!isStr(q.explain)) wrn(qp + '.explain', 'nên có lời giải thích khi trả lời đúng');
      if (q.cardId && !cards[q.cardId]) wrn(qp + '.cardId', 'thẻ "' + q.cardId + '" không tồn tại');
    });

    // levels
    var seen = {};
    (j.areas || []).forEach(function (a) {
      if (!a || !isArr(a.levels)) return;
      a.levels.forEach(function (lv, li) {
        var lp = P + '.areas.' + a.id + '.levels[' + li + ']';
        if (!lv || !isStr(lv.id)) { err(lp + '.id', 'thiếu id'); return; }
        lp = P + '.levels.' + lv.id;
        if (lv.id.indexOf(j.id + '-') !== 0) err(lp + '.id', 'id màn phải bắt đầu bằng "' + j.id + '-"');
        if (seen[lv.id]) err(lp, 'trùng id màn');
        seen[lv.id] = true;
        if (OG.Data && OG.Data.levels) {
          for (var k = 0; k < OG.Data.levels.length; k++) if (OG.Data.levels[k].id === lv.id) err(lp, 'trùng id với màn cổ điển');
        }
        if (lv.from && !(OG.Data && OG.Data.levels && OG.Data.levels.some(function (l) { return l.id === lv.from; }))) err(lp + '.from', 'màn gốc "' + lv.from + '" không có');
        var L = compileLevel(j, a, 0, lv, li, 0, li === a.levels.length - 1);
        if (!isArr(L.platforms) || !L.platforms.length) err(lp + '.platforms', 'cần ít nhất sàn');
        else {
          var f = L.platforms[0];
          if (!isArr(f) || f.length !== 4) err(lp + '.platforms[0]', 'phải là [x,y,w,h]');
          else if (f[1] < 470) wrn(lp + '.platforms[0]', 'platform đầu tiên nên là sàn y=480');
        }
        if (!isNum(L.width) || L.width < 960) err(lp + '.width', 'phải ≥ 960');
        if (!L.exit || !isNum(L.exit.x) || L.exit.x > L.width - 40) err(lp + '.exit', 'exit.x phải nằm trong màn');
        if (L.goal > L.pizzas.length) err(lp + '.goal', 'goal (' + L.goal + ') lớn hơn số pizza (' + L.pizzas.length + ')');
        L.pages.forEach(function (pg, pi) {
          var pp = lp + '.pages[' + pi + ']';
          if (!pg || !isStr(pg.card)) err(pp, 'cần {card, x, y}');
          else if (!cards[pg.card]) err(pp + '.card', 'thẻ "' + pg.card + '" không tồn tại');
          else if (cards[pg.card].areaId && cards[pg.card].areaId !== a.id) wrn(pp + '.card', 'thẻ thuộc khu khác (' + cards[pg.card].areaId + ')');
          if (pg && (!isNum(pg.x) || !isNum(pg.y))) err(pp, 'thiếu toạ độ x, y');
        });
        L.quizGates.forEach(function (g, gi) {
          var gp = lp + '.quizGates[' + gi + ']';
          if (!quizzes[g.quiz]) err(gp + '.quiz', 'câu đố "' + g.quiz + '" không tồn tại');
          if (g.x !== 'exit' && (!isNum(g.x) || g.x >= L.exit.x)) err(gp + '.x', 'phải là số < exit.x hoặc "exit"');
        });
        L.guideSpots.forEach(function (s, si) {
          var sp = lp + '.guideSpots[' + si + ']';
          var lines = s && (s.lines || (s.text ? [s.text] : null));
          if (!s || !isNum(s.x)) err(sp + '.x', 'thiếu x');
          if (!lines || !lines.length) err(sp, 'cần text hoặc lines');
          else lines.forEach(function (t) { if (isStr(t) && t.length > 90) wrn(sp, 'câu dài ' + t.length + ' ký tự (nên ≤ 90)'); });
          if (s && s.card && !cards[s.card]) wrn(sp + '.card', 'thẻ "' + s.card + '" không tồn tại');
        });
        L.comicTriggers.forEach(function (ct, ci) {
          if (!ct || !isNum(ct.x)) err(lp + '.comicTriggers[' + ci + ']', 'cần {x, comic}');
          else comicRef(lp + '.comicTriggers[' + ci + '].comic', ct.comic);
        });
        comicRef(lp + '.intro', lv.intro);
        comicRef(lp + '.outro', lv.outro);
        if (lv.checkpoints != null && !isArr(lv.checkpoints)) err(lp + '.checkpoints', 'phải là mảng x');
      });
    });
    return { ok: errors.length === 0, errors: errors, warnings: warnings };
  }

  // ---------------------------------------------------------------------------
  // API công khai
  // ---------------------------------------------------------------------------
  var J = (OG.Journeys = {
    // Đăng ký / gộp một hành trình (gọi lúc load file).
    register: function (def) {
      if (!def || !isStr(def.id)) { console.warn('[OG.Journeys] register cần id'); return null; }
      var cur = defs[def.id];
      if (!cur) { cur = defs[def.id] = { id: def.id, areas: [], cards: [], quizzes: [], comics: {} }; }
      for (var k in def) {
        if (!Object.prototype.hasOwnProperty.call(def, k)) continue;
        if (k === 'areas' || k === 'cards' || k === 'quizzes') cur[k] = mergeById(cur[k], def[k]);
        else if (k === 'comics') { for (var c in def.comics) cur.comics[c] = def.comics[c]; }
        else cur[k] = def[k];
      }
      compiled = null;
      return cur;
    },
    has: function (id) { return !!defs[id]; },
    get: function (id) { return defs[id] || null; },
    // Danh sách hành trình theo order rồi theo id.
    list: function () {
      return Object.keys(defs).map(function (k) { return defs[k]; })
        .sort(function (a, b) { return ((a.order || 99) - (b.order || 99)) || (a.id < b.id ? -1 : 1); });
    },
    ids: function () { return J.list().map(function (j) { return j.id; }); },

    // ---- Kiểm tra ----
    // validate(idOrDef) -> {ok, errors:[str], warnings:[str]}
    validate: function (idOrDef) {
      var j = typeof idOrDef === 'string' ? defs[idOrDef] : idOrDef;
      if (!j) return { ok: false, errors: ['không có hành trình "' + idOrDef + '"'], warnings: [] };
      return validateDef(j);
    },
    // Kiểm tra tất cả (gọi lúc boot). Lỗi -> console.warn và đánh dấu def.invalid = true (ẩn khỏi màn chọn).
    validateAll: function (opts) {
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
    init: function () { J.validateAll(); compileAll(); },

    // ---- Màn ----
    getLevel: function (levelId) { return C().levels[levelId] || null; },
    isJourneyLevel: function (levelId) { return !!C().levels[levelId]; },
    levelsOf: function (journeyId) { return (C().order[journeyId] || []).map(function (id) { return C().levels[id]; }); },
    levelIds: function (journeyId) { return (C().order[journeyId] || []).slice(); },
    areaOf: function (levelId) {
      var L = J.getLevel(levelId);
      if (!L) return null;
      return J.getArea(L.journey, L.areaId);
    },
    getArea: function (journeyId, areaId) {
      var j = defs[journeyId];
      if (!j) return null;
      for (var i = 0; i < j.areas.length; i++) if (j.areas[i].id === areaId) return j.areas[i];
      return null;
    },
    // Màn kế tiếp trong hành trình (null nếu là màn cuối).
    nextLevel: function (levelId) {
      var L = J.getLevel(levelId);
      if (!L) return null;
      var ids = C().order[L.journey];
      return ids[ids.indexOf(levelId) + 1] || null;
    },
    isFirstOfArea: function (levelId) { var L = J.getLevel(levelId); return !!L && L.indexInArea === 0; },
    isLastOfArea: function (levelId) { var L = J.getLevel(levelId); return !!L && L.isLastOfArea; },
    isFinalLevel: function (levelId) { var L = J.getLevel(levelId); return !!L && !J.nextLevel(levelId); },

    // ---- Nội dung ----
    getCard: function (journeyId, cardId) { return find(defs[journeyId] && defs[journeyId].cards, cardId); },
    getQuiz: function (journeyId, quizId) { return find(defs[journeyId] && defs[journeyId].quizzes, quizId); },
    // Trả về mảng panel (đã chuẩn hoá) hoặc null.
    getComic: function (journeyId, comicId) {
      var j = defs[journeyId];
      return j && comicId ? comicPanels(j.comics[comicId]) : null;
    },
    cardsOf: function (journeyId, areaId) {
      var j = defs[journeyId];
      if (!j) return [];
      return j.cards.filter(function (c) { return !areaId || c.areaId === areaId; });
    },

    // ---- Tiến độ (đọc OG.Progress; chỉ gọi sau boot) ----
    isLevelUnlocked: function (levelId) {
      var L = J.getLevel(levelId);
      if (!L) return false;
      var ids = C().order[L.journey], i = ids.indexOf(levelId);
      return i <= 0 || isDone(ids[i - 1]);
    },
    isAreaUnlocked: function (journeyId, areaId) {
      var lv = J.levelsOf(journeyId).filter(function (l) { return l.areaId === areaId; })[0];
      return !!lv && J.isLevelUnlocked(lv.id);
    },
    isAreaDone: function (journeyId, areaId) {
      var lv = J.levelsOf(journeyId).filter(function (l) { return l.areaId === areaId; });
      return lv.length > 0 && lv.every(function (l) { return isDone(l.id); });
    },
    // Màn đầu tiên đã mở mà chưa xong (hoặc màn cuối nếu đã xong hết).
    firstIncomplete: function (journeyId) {
      var ids = C().order[journeyId] || [];
      for (var i = 0; i < ids.length; i++) if (!isDone(ids[i])) return ids[i];
      return ids[ids.length - 1] || null;
    },
    isComplete: function (journeyId) {
      var ids = C().order[journeyId] || [];
      return ids.length > 0 && ids.every(isDone);
    },
    // {levelsDone, levels, stars, maxStars}
    progress: function (journeyId) {
      var ids = C().order[journeyId] || [], done = 0, stars = 0;
      ids.forEach(function (id) {
        if (isDone(id)) done++;
        var r = OG.Progress && OG.Progress.getRecord ? OG.Progress.getRecord(id) : null;
        stars += r ? (r.stars | 0) : 0;
      });
      return { levelsDone: done, levels: ids.length, stars: stars, maxStars: ids.length * 3 };
    }
  });

  function find(arr, id) {
    if (!arr) return null;
    for (var i = 0; i < arr.length; i++) if (arr[i] && arr[i].id === id) return arr[i];
    return null;
  }
  function isDone(levelId) { return !!(OG.Progress && OG.Progress.isCompleted && OG.Progress.isCompleted(levelId)); }
})();
