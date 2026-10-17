// @ts-check
/* ============================================================================
 * OG.Social — TÊN NGƯỜI CHƠI, THẺ THÀNH TÍCH (canvas → PNG), CHIA SẺ (Web Share API), KHỐI KẾT QUẢ
 * ----------------------------------------------------------------------------
 * Vai trò:      Phần "mạng xã hội" sau mỗi lượt chơi: đặt tên, lưu điểm lên bảng xếp hạng, vẽ "thẻ thành tích"
 *               1200×630 bằng Canvas, xuất ra PNG để tải về hoặc chia sẻ. mountResult() được panel gameover /
 *               victory (src/ui/menus.js) và scene journeyEnd (src/story/scenes.js) gọi để chèn khối kết quả.
 * Khái niệm:    Web Share API (navigator.share + canShare files) · chuỗi dự phòng (progressive enhancement):
 *               share → clipboard → execCommand · user activation (thao tác người dùng còn "hiệu lực") ·
 *               canvas → PNG (toDataURL / toBlob, dataURL → Blob) · cache kết quả vẽ theo khoá · tải file bằng
 *               <a download> + object URL · làm sạch dữ liệu nhập (tên) · khử trùng lặp (idempotent submit) ·
 *               lập trình phòng thủ khi module khác có thể chỉ là stub
 * Bài học:      docs/learn/07-ve-canvas-procedural-cache.md (vẽ thẻ, cache) · docs/learn/06-event-bus-observer.md
 *               (nghe game:over/victory để tự lưu) · docs/learn/11-luu-tru-migrate.md (Save.playerName)
 * Phụ thuộc:    LOAD: không (chỉ tạo OG.Social). CHẠY (đều tuỳ chọn, có dự phòng): OG.util (escapeHtml,
 *               formatTime, roundRectPath), OG.Save (data, commit), OG.Events, OG.DOM (toast, button), OG.Palette,
 *               OG.Data (getCharacter, getLevel, levels), OG.Progress.getRecord, OG.Sprites.drawCharacter,
 *               OG.Game.buildResult, OG.Scenes, OG.canvas, OG.FONT. Phần leaderboard (submitScore, getLeaderboard,
 *               renameEntry, initLeaderboard) do src/social/leaderboard.js gắn thêm — file đó nạp SAU file này.
 * Event:        phát: 'social:share' {method, ok}, 'social:nameChange' {name}, 'ui:click' (nút dự phòng)
 *               · nghe: 'game:start', 'level:complete', 'game:over', 'game:victory', 'save:reset'
 * API công khai: OG.Social.init, mountResult, getPlayerName/setPlayerName, share, captureCanvas, downloadScreenshot,
 *               createCard, drawCard, cardDataURL, cardBlob, downloadCard, shareText, copyText, lastShareMethod,
 *               submitResult, getSubmission, entryFromResult, runStars, maxStars, renderList, cleanName,
 *               formatScore, formatDate, NAME_MAX, CARD_W, CARD_H
 * Đọc tiếp:     src/social/leaderboard.js (bảng xếp hạng + adapter backend) → docs/leaderboard-worker.example.js
 *               (máy chủ mẫu cho bảng online)
 * Kiểm tra kiểu: bật @ts-check; OG.Social được ép kiểu any vì là object dựng dần qua 2 file (social.js + leaderboard.js).
 *
 * Hợp đồng (docs/ARCHITECTURE.md mục 8.6):
 *   init()                                 — nghe event, đăng ký scene 'leaderboard' (qua initLeaderboard()).
 *   mountResult(panelEl, result)           — chèn ô nhập tên, nút lưu điểm, chia sẻ, tải ảnh, top 5 vào panel.
 *   getPlayerName() / setPlayerName(name)  — Save.playerName (tối đa 16 ký tự, đã làm sạch).
 *   share(result) -> Promise<bool>         — navigator.share (kèm ảnh nếu được) → clipboard → textarea+execCommand.
 *   captureCanvas() -> dataURL|null        — ảnh PNG của canvas #game.
 *   downloadScreenshot(filename)           — tải ảnh chụp canvas #game.
 * MỞ RỘNG:
 *   createCard(result) -> <canvas> 1200×630   — "thẻ thành tích" vẽ bằng Canvas.
 *   cardDataURL(result) / cardBlob(result) / downloadCard(result, filename)
 *   shareText(result) / copyText(text) -> Promise<bool> / lastShareMethod
 *   submitResult(result, name) -> rank|-1    — lưu (hoặc đổi tên) điểm của một RunResult, không trùng lặp.
 *   runStars(result) -> int                  — tổng sao kiếm được trong lượt chơi.
 * Event mới: 'social:share' {method, ok}, 'social:nameChange' {name}, 'social:onlineSubmit' (xem leaderboard.js).
 * ========================================================================== */

/**
 * @typedef {Object} RunResult  kết quả một lượt chơi (OG.Game.buildResult) — chỉ liệt kê field module này đọc
 * @property {'gameover'|'victory'|string} type
 * @property {number} score
 * @property {string} charId
 * @property {string|null} [skinId]
 * @property {string|null} [levelId]
 * @property {string} [levelName]
 * @property {string[]|number} levelsCompleted  mảng levelId đã qua (hoặc số lượng)
 * @property {number} time        thời gian chơi, giây
 * @property {string} date        ISO 8601 — cùng với type/score/charId tạo khoá chống lưu trùng
 * @property {number} [stars]     có sẵn thì dùng luôn, không thì tự tính (runStars)
 * @property {boolean} [isNewBest]
 * @property {{bosses?:number, stomps?:number}} [stats]
 * @property {string} [journeyId]
 */
/**
 * @typedef {Object} SubmissionRecord  đã lưu kết quả nào lên bảng (khoá = resultKey)
 * @property {string} entryId  id mục trên bảng xếp hạng (để đổi tên sau)
 * @property {number} rank     hạng (1-based) hoặc -1 nếu không vào top
 * @property {string} name
 */
(function () {
  'use strict';
  var OG = window.OG;
  /** @type {any} OG.Social dựng dần: file này + leaderboard.js cùng gắn field */
  var S = (OG.Social = OG.Social || {});

  var NAME_MAX = 16;                 // số ký tự (code point) tối đa của tên người chơi
  // 1200×630 = tỉ lệ ~1.91:1 chuẩn ảnh xem trước (Open Graph) của Facebook/Zalo/Twitter → không bị cắt khi chia sẻ.
  var CARD_W = 1200, CARD_H = 630;
  var REVOKE_URL_MS = 5000;          // ms chờ trước khi thu hồi object URL của file tải về

  // ---------------------------------------------------------------------------
  // Tiện ích phòng thủ (module khác có thể vẫn là stub)
  // 💡 Khái niệm: lập trình phòng thủ — mọi lời gọi sang module khác đều kiểm tra tồn tại + bọc try/catch.
  //   Social là tính năng "phụ": lỗi ở đây KHÔNG được làm hỏng màn hình kết quả của trò chơi.
  // ---------------------------------------------------------------------------
  function esc(s) {
    if (OG.util && typeof OG.util.escapeHtml === 'function') return OG.util.escapeHtml(s);
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function saveData() { return OG.Save && OG.Save.data ? OG.Save.data : null; }
  function emit(name, payload) {
    try { if (OG.Events && OG.Events.emit) OG.Events.emit(name, payload); } catch (e) { /* bỏ qua */ }
  }
  function toast(text, sec) {
    try { if (OG.DOM && OG.DOM.toast) OG.DOM.toast(text, sec); } catch (e) { /* bỏ qua */ }
  }
  function pal(key, fb) { return (OG.Palette && OG.Palette[key]) || fb; }
  // Mọi phần tử DOM tạm (link tải, textarea copy) gắn vào #gameShell — quy ước ARCHITECTURE mục 9.
  function shell() { return document.getElementById('gameShell') || document.body; }

  function charInfo(id) {
    var ch = null;
    try { ch = OG.Data && OG.Data.getCharacter ? OG.Data.getCharacter(id) : null; } catch (e) { ch = null; }
    return ch || { id: id || 'oggy', name: id ? String(id) : 'Oggy', w: 34, h: 52, colors: {} };
  }
  function levelInfo(id) {
    try { return (OG.Data && OG.Data.getLevel && OG.Data.getLevel(id)) || null; } catch (e) { return null; }
  }
  function levelCount() {
    return (OG.Data && Array.isArray(OG.Data.levels) && OG.Data.levels.length) || 4;
  }
  function formatTime(sec) {
    if (OG.util && OG.util.formatTime) return OG.util.formatTime(sec);
    sec = Math.max(0, Math.floor(sec || 0));
    return Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2);
  }
  /**
   * Định dạng điểm kiểu Việt Nam: 12345 → '12.345'.
   * @param {number} n
   * @returns {string}
   */
  function formatScore(n) {
    n = Math.max(0, Math.round(+n || 0));
    // Ngăn cách hàng nghìn bằng dấu chấm (kiểu Việt Nam) — không phụ thuộc Intl.
    // Regex: \B = vị trí giữa 2 chữ số, (?=(\d{3})+(?!\d)) = phía sau còn bội số của 3 chữ số tới hết chuỗi.
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
  /**
   * Định dạng ngày dd/mm/yyyy (giờ địa phương). Chuỗi hỏng → ngày hôm nay.
   * @param {string} [iso]
   * @returns {string}
   */
  function formatDate(iso) {
    var d = new Date(iso || Date.now());
    if (isNaN(d.getTime())) d = new Date();
    return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear();
  }
  S.formatScore = formatScore;
  S.formatDate = formatDate;

  /**
   * Làm sạch tên: bỏ ký tự điều khiển / ký tự vô hình / ký tự đảo chiều chữ, gộp khoảng trắng, cắt theo code point.
   * ⚠️ Bẫy: cắt bằng s.slice(0, 16) đếm theo đơn vị UTF-16 → có thể cắt đôi emoji (cặp surrogate) thành ký tự
   *   lỗi "�". Array.from tách theo code point nên an toàn hơn.
   * @param {any} name
   * @returns {string} tối đa NAME_MAX ký tự, có thể rỗng
   */
  function cleanName(name) {
    var s = String(name == null ? '' : name)
      .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    var chars = Array.from ? Array.from(s) : s.split('');
    return chars.slice(0, NAME_MAX).join('').trim();
  }
  S.cleanName = cleanName;
  S.NAME_MAX = NAME_MAX;

  // ---------------------------------------------------------------------------
  // Tên người chơi
  // ---------------------------------------------------------------------------
  /** @returns {string} tên đã lưu ('' nếu chưa đặt hoặc Save chưa sẵn sàng) */
  S.getPlayerName = function () {
    var d = saveData();
    return d && typeof d.playerName === 'string' ? d.playerName : '';
  };
  /**
   * Làm sạch rồi lưu tên người chơi vào Save.playerName; phát 'social:nameChange' nếu tên đổi.
   * @param {string} name
   * @returns {string} tên sau khi làm sạch (có thể '')
   */
  S.setPlayerName = function (name) {
    var clean = cleanName(name);
    var d = saveData();
    if (!d) return clean;
    if (d.playerName !== clean) {
      d.playerName = clean;
      if (OG.Save.commit) OG.Save.commit();
      emit('social:nameChange', { name: clean });
    }
    return clean;
  };

  // ---------------------------------------------------------------------------
  // Theo dõi sao trong lượt chơi (RunResult không có trường stars)
  // 💡 Khái niệm: observer — module tự nghe 'level:complete' để ghi sao từng màn, không bắt OG.Game phải
  //   thêm field mới vào RunResult (giảm phụ thuộc giữa hai module).
  // ---------------------------------------------------------------------------
  /** @type {Object<string, number>} levelId → số sao đạt được trong lượt hiện tại */
  var runLevelStars = {};

  /**
   * Tính tổng sao kiếm được trong một lượt chơi.
   * Ưu tiên: result.stars → sao ghi nhận trong lượt (event) → sao tốt nhất đã lưu → 1 sao/màn.
   * @param {RunResult|null} result
   * @returns {number}
   */
  S.runStars = function (result) {
    if (!result) return 0;
    if (typeof result.stars === 'number') return result.stars | 0;
    var done = Array.isArray(result.levelsCompleted) ? result.levelsCompleted : [];
    var total = 0;
    for (var i = 0; i < done.length; i++) {
      var id = done[i];
      if (runLevelStars[id] != null) total += runLevelStars[id] | 0;
      else {
        // Dự phòng: sao tốt nhất đã lưu của màn đó.
        var rec = null;
        try { rec = OG.Progress && OG.Progress.getRecord ? OG.Progress.getRecord(id) : null; } catch (e) { rec = null; }
        total += rec ? rec.stars | 0 : 1;
      }
    }
    return total;
  };
  /** @returns {number} số sao tối đa của chiến dịch (3 sao × số màn) */
  S.maxStars = function () { return levelCount() * 3; };

  // ---------------------------------------------------------------------------
  // Chuyển RunResult -> entry leaderboard; lưu không trùng lặp
  // ---------------------------------------------------------------------------
  /** @type {Object<string, SubmissionRecord>} resultKey → bản ghi đã lưu */
  var submitted = {};
  /** @type {RunResult|null} kết quả gần nhất (để nút chia sẻ/tải ảnh dùng khi không truyền result) */
  var lastResult = null;

  // 💡 Khái niệm: khoá định danh (identity key) cho một kết quả — RunResult không có id, nên ghép các field
  //   gần như duy nhất. Nhờ đó gọi submitResult nhiều lần (tự lưu + bấm nút) vẫn chỉ tạo MỘT mục (idempotent).
  function resultKey(r) {
    return [r.type, r.score | 0, r.charId, r.date].join('|');
  }
  function randomId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /**
   * Chuyển RunResult thành entry bảng xếp hạng (id ngẫu nhiên mới; levelsCompleted đổi thành SỐ màn).
   * @param {RunResult} result
   * @param {string} name
   * @returns {Object} entry {id, name, score, charId, skinId, levelId, levelName, levelsCompleted, stars, time, date, type}
   */
  S.entryFromResult = function (result, name) {
    var r = /** @type {RunResult} */ (result || {});
    var lv = levelInfo(r.levelId);
    return {
      id: randomId(),
      name: cleanName(name) || 'Ẩn danh',
      score: Math.max(0, Math.round(+r.score || 0)),
      charId: r.charId || 'oggy',
      skinId: r.skinId || null,
      levelId: r.levelId || null,
      levelName: r.levelName || (lv && lv.name) || '',
      levelsCompleted: Array.isArray(r.levelsCompleted) ? r.levelsCompleted.length : (r.levelsCompleted | 0),
      stars: S.runStars(r),
      time: Math.round((+r.time || 0) * 10) / 10,
      date: r.date || new Date().toISOString(),
      type: r.type === 'victory' ? 'victory' : 'gameover'
    };
  };

  /**
   * Lưu điểm của result với tên cho trước. Gọi lại với tên khác sẽ ĐỔI TÊN mục đã lưu (không tạo mục mới).
   * Điểm 0 hoặc thiếu tên (và chưa có tên đã lưu) → không lưu.
   * @param {RunResult} result
   * @param {string} [name]  thiếu thì dùng tên người chơi đã lưu
   * @returns {number} hạng 1-based, hoặc -1 (không lưu / không vào top 10)
   * @example
   *   var rank = OG.Social.submitResult(OG.Game.buildResult('victory'), 'Bé Na');
   */
  S.submitResult = function (result, name) {
    if (!result || (result.score | 0) <= 0) return -1;
    var clean = cleanName(name) || S.getPlayerName();
    if (!clean) return -1;
    var key = resultKey(result);
    var prev = submitted[key];
    var rank;
    if (prev) {
      if (prev.name === clean) return prev.rank;
      rank = typeof S.renameEntry === 'function' ? S.renameEntry(prev.entryId, clean) : prev.rank;
      prev.name = clean;
      prev.rank = rank;
      return rank;
    }
    var entry = S.entryFromResult(result, clean);
    rank = typeof S.submitScore === 'function' ? S.submitScore(entry) : -1;
    submitted[key] = { entryId: entry.id, rank: rank, name: clean };
    return rank;
  };
  /**
   * @param {RunResult|null} result
   * @returns {SubmissionRecord|null} bản ghi nếu kết quả này đã được lưu trong phiên
   */
  S.getSubmission = function (result) { return result ? submitted[resultKey(result)] || null : null; };

  // ---------------------------------------------------------------------------
  // Thẻ thành tích (canvas 1200×630, tỉ lệ ảnh xem trước mạng xã hội)
  // ---------------------------------------------------------------------------
  // Dùng lại font chung của game (OG.FONT); chuỗi dự phòng giống hệt, chỉ dùng khi module chạy riêng lẻ.
  var FONT = OG.FONT || '"Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';

  function roundRect(ctx, x, y, w, h, r) {
    if (OG.util && OG.util.roundRectPath) { OG.util.roundRectPath(ctx, x, y, w, h, r); return; }
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function fillRound(ctx, x, y, w, h, r, color) {
    ctx.fillStyle = color;
    roundRect(ctx, x, y, w, h, r);
    ctx.fill();
  }
  function starPath(ctx, cx, cy, rOut, rIn) {
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var r = i % 2 ? rIn : rOut;
      var a = -Math.PI / 2 + i * Math.PI / 5;
      ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.closePath();
  }
  function drawStar(ctx, cx, cy, size, filled) {
    ctx.save();
    starPath(ctx, cx, cy, size, size * 0.48);
    ctx.fillStyle = filled ? pal('gold', '#ffc94a') : '#e7dcc2';
    ctx.fill();
    ctx.lineWidth = Math.max(2, size * 0.14);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = filled ? '#c98a12' : '#c8b994';
    ctx.stroke();
    ctx.restore();
  }
  // Viết chữ, tự thu nhỏ cỡ chữ (bước 2 px, tối thiểu 12 px) để vừa maxW. Trả cỡ chữ cuối cùng.
  function fitText(ctx, text, x, y, maxW, size, weight) {
    var s = size;
    ctx.font = (weight || '900') + ' ' + s + 'px ' + FONT;
    while (s > 12 && ctx.measureText(text).width > maxW) {
      s -= 2;
      ctx.font = (weight || '900') + ' ' + s + 'px ' + FONT;
    }
    ctx.fillText(text, x, y);
    return s;
  }

  // Vẽ nhân vật bằng OG.Sprites (gốc ở chân: footX, footY); nếu lỗi thì vẽ hình mèo đơn giản.
  function drawHero(ctx, charId, anim, skinId, footX, footY, scale) {
    var ch = charInfo(charId);
    ctx.save();
    ctx.translate(footX, footY);
    ctx.scale(scale, scale);
    var ok = false;
    if (OG.Sprites && typeof OG.Sprites.drawCharacter === 'function') {
      try {
        ctx.save();
        OG.Sprites.drawCharacter(ctx, ch.id, anim, (OG.time || 0) % 1 + 0.4, {
          face: 1, skin: skinId || null, w: ch.w, h: ch.h, scale: 1, alpha: 1, time: OG.time || 0
        });
        ctx.restore();
        ok = true;
      } catch (e) {
        // ⚠️ Bẫy: lỗi giữa chừng → save() bên trong chưa được restore(); restore bù để ngăn xếp trạng thái cân bằng.
        try { ctx.restore(); } catch (e2) { /* bỏ qua */ }
        ok = false;
      }
    }
    if (!ok) {
      // Hình dự phòng: thân bo tròn + đầu + mõm + 2 mắt, theo màu của nhân vật.
      var c = ch.colors || {};
      var w = ch.w || 34, h = ch.h || 52;
      fillRound(ctx, -w / 2, -h * 0.62, w, h * 0.62, 12, c.body || pal('oggyBody', '#2877d5'));
      ctx.fillStyle = c.head || pal('oggyHead', '#328be7');
      ctx.beginPath(); ctx.arc(0, -h * 0.72, w * 0.55, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = c.muzzle || '#d9f0ff';
      ctx.beginPath(); ctx.ellipse(0, -h * 0.64, w * 0.32, w * 0.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = pal('ink', '#17233d');
      ctx.beginPath(); ctx.arc(-w * 0.18, -h * 0.8, 2.6, 0, Math.PI * 2); ctx.arc(w * 0.18, -h * 0.8, 2.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  /**
   * Vẽ thẻ thành tích lên ctx kích thước CARD_W×CARD_H (px). Bố cục: nhân vật bên trái, bảng thông tin bên phải.
   * 💡 Khái niệm: ảnh chia sẻ là vẽ procedural — không cần file ảnh mẫu; đổi tên/điểm là vẽ lại trong vài ms.
   * @param {CanvasRenderingContext2D} ctx
   * @param {RunResult} result
   * @param {string} name  tên in trên thẻ ('' = "Người chơi bí ẩn")
   */
  function drawCard(ctx, result, name) {
    var r = /** @type {RunResult} */ (result || {});
    var W = CARD_W, H = CARD_H;
    var ink = pal('ink', '#17233d');
    var victory = r.type === 'victory';
    var ch = charInfo(r.charId);
    var stars = S.runStars(r);
    var maxStars = S.maxStars();
    var done = Array.isArray(r.levelsCompleted) ? r.levelsCompleted.length : (r.levelsCompleted | 0);
    var st = r.stats || {};

    ctx.save();
    // Nền trời
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, pal('skyTop', '#76d8f2'));
    g.addColorStop(1, pal('skyBottom', '#e8f6c7'));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Mây: mỗi đám = 3 hình tròn chồng nhau; dữ liệu [x, y, tỉ lệ]
    ctx.fillStyle = '#ffffffb0';
    [[120, 90, 1], [420, 60, 0.8], [1050, 110, 1.1]].forEach(function (c) {
      var x = c[0], y = c[1], k = c[2];
      ctx.beginPath();
      ctx.arc(x, y, 34 * k, 0, Math.PI * 2);
      ctx.arc(x + 40 * k, y - 14 * k, 42 * k, 0, Math.PI * 2);
      ctx.arc(x + 86 * k, y, 32 * k, 0, Math.PI * 2);
      ctx.fill();
    });
    // Vầng sáng sau nhân vật
    var floorY = H - 88;
    var halo = ctx.createRadialGradient(250, floorY - 150, 20, 250, floorY - 150, 230);
    halo.addColorStop(0, pal('titleGlow', '#ffd36b'));
    halo.addColorStop(1, 'rgba(255,211,107,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, 520, H);
    // Sàn + cỏ
    ctx.fillStyle = pal('floor', '#e9a34f');
    ctx.fillRect(0, floorY, W, H - floorY);
    ctx.fillStyle = pal('grass', '#75bd59');
    ctx.fillRect(0, floorY, W, 16);
    ctx.fillStyle = '#00000014';
    for (var i = 0; i < W; i += 80) ctx.fillRect(i, floorY + 30, 44, 10);

    // Nhân vật: phóng sao cho cao ~250 px (tối đa ×4,6)
    var hh = ch.h || 52;
    var scale = Math.min(4.6, 250 / hh);
    drawHero(ctx, ch.id, victory ? 'victory' : 'idle', r.skinId, 250, floorY + 4, scale);

    // Nhãn tên nhân vật
    ctx.font = '900 30px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var chLabel = ch.name || 'Oggy';
    var lw = Math.max(140, ctx.measureText(chLabel).width + 48);
    fillRound(ctx, 250 - lw / 2, floorY + 22, lw, 48, 24, ink);
    ctx.fillStyle = '#fff';
    ctx.fillText(chLabel, 250, floorY + 47);

    // Thẻ thông tin bên phải
    var px = 500, py = 44, pw = 656, ph = 470;
    fillRound(ctx, px, py + 14, pw, ph, 40, pal('panelShadow', '#b87542'));
    fillRound(ctx, px, py, pw, ph, 40, pal('cream', '#fff6df'));
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#ffffff';
    roundRect(ctx, px, py, pw, ph, 40);
    ctx.stroke();

    var cx = px + pw / 2;
    // Tiêu đề game (vẽ 2 lần lệch 3 px: lớp vàng phía sau làm bóng chữ)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '900 50px ' + FONT;
    ctx.fillStyle = pal('titleGlow', '#ffd36b');
    ctx.fillText('OGGY ADVENTURE', cx + 3, py + 72);
    ctx.fillStyle = pal('titleOrange', '#ed713c');
    ctx.fillText('OGGY ADVENTURE', cx, py + 69);

    // Huy hiệu kết quả
    var badge = victory ? 'CHIẾN THẮNG!' : 'HẾT LƯỢT!';
    ctx.font = '900 26px ' + FONT;
    var bw = ctx.measureText(badge).width + 48;
    fillRound(ctx, cx - bw / 2, py + 88, bw, 42, 21, victory ? pal('success', '#3fbf6f') : pal('orange', '#f27a43'));
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.fillText(badge, cx, py + 110);

    // Tên người chơi
    ctx.fillStyle = pal('panelText', '#25314a');
    fitText(ctx, name ? name : 'Người chơi bí ẩn', cx, py + 162, pw - 80, 34, '900');

    // Điểm
    ctx.fillStyle = ink;
    ctx.textBaseline = 'alphabetic';
    fitText(ctx, formatScore(r.score), cx, py + 268, pw - 120, 104, '900');
    ctx.font = '900 22px ' + FONT;
    ctx.fillStyle = '#8a6a48';
    ctx.fillText('ĐIỂM', cx, py + 296);

    // Sao: vẽ 3 sao lớn theo tỉ lệ sao/tối đa + số cụ thể (có ít nhất 1 sao thì sáng ít nhất 1 ngôi)
    var ratio = maxStars ? stars / maxStars : 0;
    var bigFilled = stars <= 0 ? 0 : Math.max(1, Math.round(ratio * 3));
    for (var s = 0; s < 3; s++) drawStar(ctx, cx - 150 + s * 56, py + 340, 24, s < bigFilled);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '900 32px ' + FONT;
    ctx.fillStyle = ink;
    ctx.fillText(stars + ' / ' + maxStars + ' sao', cx + 20, py + 342);

    // Ô thống kê: 4 ô chia đều bề rộng bảng (lề 30 px, khe 12 px)
    var cells = [
      ['Màn đã qua', done + '/' + levelCount()],
      ['Thời gian', formatTime(r.time)],
      ['Trùm hạ gục', String(st.bosses | 0)],
      ['Gián bị giẫm', String(st.stomps | 0)]
    ];
    var cw = (pw - 60 - 3 * 12) / 4;
    for (var k = 0; k < cells.length; k++) {
      var x0 = px + 30 + k * (cw + 12), y0 = py + 382;
      fillRound(ctx, x0, y0, cw, 66, 18, '#f3e3bf');
      ctx.textAlign = 'center';
      ctx.fillStyle = '#8a6a48';
      ctx.font = '700 17px ' + FONT;
      ctx.fillText(cells[k][0], x0 + cw / 2, y0 + 20);
      ctx.fillStyle = ink;
      ctx.font = '900 26px ' + FONT;
      ctx.fillText(cells[k][1], x0 + cw / 2, y0 + 47);
    }

    // Kỷ lục mới (nhãn nghiêng ở góc trên-trái)
    if (r.isNewBest && (r.score | 0) > 0) {
      ctx.save();
      ctx.translate(92, 66);
      ctx.rotate(-0.14);
      fillRound(ctx, -82, -26, 164, 52, 26, pal('danger', '#e5484d'));
      ctx.fillStyle = '#fff';
      ctx.font = '900 24px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('KỶ LỤC MỚI!', 0, 1);
      ctx.restore();
    }

    // Chân thẻ
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = '900 24px ' + FONT;
    ctx.fillStyle = ink;
    ctx.fillText('Bạn có vượt qua được không? · ' + formatDate(r.date), W - 40, H - 34);
    ctx.restore();
  }

  S.CARD_W = CARD_W;
  S.CARD_H = CARD_H;
  /**
   * Vẽ thẻ thành tích lên ctx có sẵn (kích thước CARD_W×CARD_H).
   * @param {CanvasRenderingContext2D} ctx
   * @param {RunResult} result
   * @param {string} [name]  thiếu (null/undefined) thì dùng tên người chơi đã lưu
   */
  S.drawCard = function (ctx, result, name) { drawCard(ctx, result, name == null ? S.getPlayerName() : name); };

  /**
   * Tạo canvas thẻ thành tích (KHÔNG gắn vào DOM — canvas ngoài màn hình vẫn vẽ và xuất ảnh được).
   * @param {RunResult} [result]  thiếu thì dùng kết quả gần nhất
   * @param {{name?:string}} [opts]
   * @returns {HTMLCanvasElement} 1200×630 px
   * @example
   *   document.body.appendChild(OG.Social.createCard(OG.Game.buildResult('victory')));
   */
  S.createCard = function (result, opts) {
    opts = opts || {};
    var c = document.createElement('canvas');
    c.width = CARD_W;
    c.height = CARD_H;
    var ctx = c.getContext('2d');
    if (!ctx) return c;
    try {
      drawCard(ctx, result || lastResult || fallbackResult(), opts.name != null ? opts.name : S.getPlayerName());
    } catch (e) {
      console.error('[OG.Social] lỗi vẽ thẻ thành tích:', e);
    }
    return c;
  };

  // 💡 Khái niệm: cache theo khoá — toDataURL của ảnh 1200×630 tốn hàng chục ms; chỉ vẽ + mã hoá lại khi
  //   kết quả (resultKey) hoặc tên người chơi đổi. Blob được suy ra từ đúng dataURL đang cache.
  /** @type {{key:string|null, name:string|null, dataURL:string|null, blob:Blob|null}} */
  var cardCache = { key: null, name: null, dataURL: null, blob: null };
  /**
   * Xuất thẻ thành tích ra PNG dạng data URL ('data:image/png;base64,...'), có cache.
   * 💡 Khái niệm: canvas → PNG — canvas.toDataURL('image/png') mã hoá điểm ảnh thành chuỗi base64 dùng được
   *   ngay làm src của <img> hay href để tải về.
   * @param {RunResult} [result]
   * @returns {string|null} null nếu trình duyệt chặn (vd canvas bị "taint" bởi ảnh khác nguồn)
   */
  S.cardDataURL = function (result) {
    result = result || lastResult || fallbackResult();
    var key = resultKey(result), name = S.getPlayerName();
    if (cardCache.key === key && cardCache.name === name && cardCache.dataURL) return cardCache.dataURL;
    var url = null;
    try { url = S.createCard(result).toDataURL('image/png'); } catch (e) { url = null; }
    cardCache = { key: key, name: name, dataURL: url, blob: null };
    return url;
  };
  // Chuyển dataURL sang Blob ĐỒNG BỘ (giữ "user activation" cho navigator.share).
  // ⚠️ Bẫy: navigator.share chỉ chạy khi được gọi "ngay" trong xử lý cú bấm của người dùng. canvas.toBlob là
  //   BẤT ĐỒNG BỘ (callback) → tới lúc có blob, "user activation" (quyền tạm thời sinh ra từ cú bấm) có thể đã
  //   hết hạn — Safari rất chặt, Chrome cho vài giây — và share bị chặn với lỗi NotAllowedError.
  //   Giải mã base64 thủ công (atob → Uint8Array → Blob) giữ mọi thứ trong cùng một lượt xử lý.
  function dataURLToBlob(url) {
    try {
      var parts = url.split(',');
      var mime = (parts[0].match(/data:([^;]+)/) || [])[1] || 'image/png';
      var bin = atob(parts[1]);
      var arr = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return new Blob([arr], { type: mime });
    } catch (e) { return null; }
  }
  /**
   * Lấy thẻ thành tích dưới dạng Blob PNG (đồng bộ, có cache) — để đính kèm khi chia sẻ.
   * @param {RunResult} [result]
   * @returns {Blob|null}
   */
  S.cardBlob = function (result) {
    var url = S.cardDataURL(result);
    if (!url) return null;
    if (cardCache.dataURL === url && cardCache.blob) return cardCache.blob;
    var b = dataURLToBlob(url);
    if (cardCache.dataURL === url) cardCache.blob = b;
    return b;
  };

  // ---------------------------------------------------------------------------
  // Tải file
  // ---------------------------------------------------------------------------
  // 💡 Khái niệm: tải file không cần máy chủ — tạo <a href=... download="tên.png">, gọi click() bằng code,
  //   rồi gỡ phần tử. Trình duyệt hiểu thuộc tính download là "lưu về máy" thay vì mở link.
  function clickDownload(href, filename) {
    var a = document.createElement('a');
    a.href = href;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    shell().appendChild(a);
    a.click();
    setTimeout(function () { if (a.parentNode) a.parentNode.removeChild(a); }, 0);
  }
  // Dấu thời gian cho tên file: yyyymmdd-hhmmss (giờ địa phương).
  function stamp() {
    var d = new Date();
    return d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2) + '-' +
      ('0' + d.getHours()).slice(-2) + ('0' + d.getMinutes()).slice(-2) + ('0' + d.getSeconds()).slice(-2);
  }
  /**
   * Tải canvas về máy dạng PNG. Ưu tiên toBlob + object URL (không phải giữ chuỗi base64 khổng lồ trong bộ nhớ),
   * thiếu thì dùng toDataURL.
   * @param {HTMLCanvasElement} canvas
   * @param {string} filename
   * @returns {boolean} false nếu trình duyệt chặn
   */
  function downloadCanvas(canvas, filename) {
    try {
      if (canvas.toBlob && window.URL && URL.createObjectURL) {
        canvas.toBlob(function (blob) {
          if (!blob) { clickDownload(canvas.toDataURL('image/png'), filename); return; }
          var u = URL.createObjectURL(blob);
          clickDownload(u, filename);
          // ⚠️ Bẫy: object URL giữ blob trong bộ nhớ tới khi revoke; revoke NGAY thì có trình duyệt chưa kịp
          //   bắt đầu tải → chờ vài giây rồi mới thu hồi.
          setTimeout(function () { URL.revokeObjectURL(u); }, REVOKE_URL_MS);
        }, 'image/png');
      } else {
        clickDownload(canvas.toDataURL('image/png'), filename);
      }
      return true;
    } catch (e) {
      console.warn('[OG.Social] không tải được ảnh:', e);
      return false;
    }
  }

  /**
   * Chụp canvas game (#game) thành PNG data URL.
   * @returns {string|null}
   */
  S.captureCanvas = function () {
    try {
      var c = OG.canvas || document.getElementById('game');
      return c ? c.toDataURL('image/png') : null;
    } catch (e) { return null; }
  };
  /**
   * Tải ảnh chụp canvas game về máy.
   * @param {string} [filename]  mặc định 'oggy-adventure-<yyyymmdd-hhmmss>.png'
   * @returns {boolean}
   */
  S.downloadScreenshot = function (filename) {
    var c = OG.canvas || document.getElementById('game');
    if (!c) return false;
    return downloadCanvas(c, filename || ('oggy-adventure-' + stamp() + '.png'));
  };
  /**
   * Tải thẻ thành tích về máy.
   * @param {RunResult} [result]
   * @param {string} [filename]  mặc định 'oggy-thanh-tich-<yyyymmdd-hhmmss>.png'
   * @returns {boolean}
   */
  S.downloadCard = function (result, filename) {
    var c = S.createCard(result || lastResult || fallbackResult());
    return downloadCanvas(c, filename || ('oggy-thanh-tich-' + stamp() + '.png'));
  };

  // ---------------------------------------------------------------------------
  // Chia sẻ
  // ---------------------------------------------------------------------------
  // Chỉ kèm link khi game chạy trên web thật (http/https); mở bằng file:// thì link vô nghĩa với người nhận.
  function shareUrl() {
    try {
      var p = window.location.protocol;
      if (p === 'http:' || p === 'https:') return window.location.href.split('#')[0];
    } catch (e) { /* bỏ qua */ }
    return '';
  }
  /**
   * Soạn câu chia sẻ (khác nhau cho thắng / thua), kèm link game nếu chạy trên web.
   * @param {RunResult} [result]
   * @returns {string}
   */
  S.shareText = function (result) {
    var r = result || lastResult || fallbackResult();
    var ch = charInfo(r.charId);
    var stars = S.runStars(r);
    var done = Array.isArray(r.levelsCompleted) ? r.levelsCompleted.length : (r.levelsCompleted | 0);
    var name = S.getPlayerName();
    var who = name ? name + ' vừa' : 'Mình vừa';
    var text = r.type === 'victory'
      ? who + ' phá đảo Oggy Adventure cùng ' + ch.name + ' với ' + formatScore(r.score) + ' điểm và ' + stars + ' sao! 🏆'
      : who + ' đạt ' + formatScore(r.score) + ' điểm trong Oggy Adventure cùng ' + ch.name +
        ' (qua ' + done + '/' + levelCount() + ' màn, ' + stars + ' sao) 🍕';
    text += ' Bạn có vượt qua được không?';
    var url = shareUrl();
    return url ? text + ' ' + url : text;
  };

  // Copy văn bản kiểu cũ: textarea ẩn + select() + document.execCommand('copy').
  // execCommand đã lỗi thời nhưng vẫn chạy ở trình duyệt cũ / trang không an toàn (http, file://)
  // nơi Clipboard API bị tắt — nên giữ làm phương án cuối.
  function execCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', ''); // readonly: không bật bàn phím ảo trên điện thoại
    ta.style.position = 'absolute';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    var root = shell();
    root.appendChild(ta);
    var ok = false;
    try {
      ta.select();
      ta.setSelectionRange(0, text.length); // iOS Safari cần chọn vùng tường minh
      ok = document.execCommand('copy');
    } catch (e) { ok = false; }
    root.removeChild(ta);
    return ok;
  }
  /**
   * Sao chép văn bản vào clipboard: Clipboard API (cần secure context) → execCommand. Ghi S.lastShareMethod.
   * @param {string} text
   * @returns {Promise<boolean>} true nếu sao chép được
   */
  S.copyText = function (text) {
    text = String(text || '');
    var nav = window.navigator;
    if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function' && window.isSecureContext !== false) {
      return nav.clipboard.writeText(text).then(function () {
        S.lastShareMethod = 'clipboard';
        return true;
      }, function () {
        var ok = execCopy(text);
        S.lastShareMethod = ok ? 'execCommand' : null;
        return ok;
      });
    }
    var ok = execCopy(text);
    S.lastShareMethod = ok ? 'execCommand' : null;
    return Promise.resolve(ok);
  };

  S.lastShareMethod = null; // 'share' | 'clipboard' | 'execCommand' | 'cancel' | null

  /**
   * Chia sẻ kết quả. Phát 'social:share' {method, ok} khi xong.
   * 💡 Khái niệm: progressive enhancement (nâng cấp dần) — dùng tính năng xịn nhất trình duyệt có:
   *   1) Web Share API (bảng chia sẻ của hệ điều hành, kèm ảnh nếu canShare({files}) cho phép)
   *   2) Clipboard API → 3) textarea + execCommand. Không có gì → báo thất bại, nút "Tải ảnh" vẫn còn.
   * ⚠️ Bẫy: phải gọi trực tiếp trong handler của cú bấm (user activation); gọi sau setTimeout/await dài sẽ bị chặn.
   * @param {RunResult} [result]
   * @returns {Promise<boolean>} true nếu đã chia sẻ hoặc đã sao chép
   * @example
   *   button.onclick = function () { OG.Social.share().then(function (ok) { console.log(ok, OG.Social.lastShareMethod); }); };
   */
  S.share = function (result) {
    var r = result || lastResult || fallbackResult();
    var text = S.shareText(r);
    var nav = window.navigator;
    function finish(ok) {
      emit('social:share', { method: S.lastShareMethod, ok: !!ok });
      return !!ok;
    }
    function fallback() { return S.copyText(text).then(finish); }

    if (!nav || typeof nav.share !== 'function') return fallback();

    /** @type {{title:string, text:string, files?:File[]}} */
    var data = { title: 'Oggy Adventure', text: text };
    // Kèm ảnh thẻ thành tích nếu trình duyệt cho phép chia sẻ file.
    try {
      if (typeof nav.canShare === 'function' && typeof File === 'function') {
        var blob = S.cardBlob(r);
        if (blob) {
          var file = new File([blob], 'oggy-adventure.png', { type: 'image/png' });
          if (nav.canShare({ files: [file] })) data.files = [file];
        }
      }
    } catch (e) { /* không chia sẻ được file → chỉ văn bản */ }

    var p;
    try { p = nav.share(data); } catch (e) { return fallback(); }
    return Promise.resolve(p).then(function () {
      S.lastShareMethod = 'share';
      return finish(true);
    }, function (err) {
      // Người dùng tự huỷ hộp thoại chia sẻ → không copy.
      if (err && err.name === 'AbortError') { S.lastShareMethod = 'cancel'; return finish(false); }
      return fallback();
    });
  };

  // ---------------------------------------------------------------------------
  // Khối kết quả trên panel gameover/victory
  // ---------------------------------------------------------------------------
  /** @returns {RunResult} kết quả dựng tạm khi không ai truyền result (vd gọi share() từ console) */
  function fallbackResult() {
    try {
      if (OG.Game && typeof OG.Game.buildResult === 'function') return OG.Game.buildResult('gameover');
    } catch (e) { /* bỏ qua */ }
    return { type: 'gameover', score: 0, charId: 'oggy', levelsCompleted: [], time: 0, stats: {}, date: new Date().toISOString() };
  }

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  // Tạo nút: ưu tiên OG.DOM.button (đồng bộ giao diện + 'ui:click'), thiếu thì tự dựng <button>.
  function makeBtn(label, cls, onClick, id) {
    var b;
    if (OG.DOM && typeof OG.DOM.button === 'function') {
      b = OG.DOM.button(label, onClick, { id: id, secondary: /secondary/.test(cls) });
    } else {
      b = el('button', '', label);
      b.type = 'button';
      b.addEventListener('click', function (e) { emit('ui:click', { id: id || label }); if (onClick) onClick(e); });
    }
    b.className = ((b.className || '') + ' social-btn ' + cls).trim();
    if (id) b.removeAttribute('id'); // tránh trùng id khi panel dựng lại; id chỉ dùng cho ui:click
    return b;
  }

  /**
   * Dựng HTML danh sách xếp hạng (dùng chung cho mountResult và scene leaderboard). Mọi chuỗi đều được escape.
   * ⚠️ Bẫy: tên người chơi (và dữ liệu từ máy chủ online) là dữ liệu NGOÀI — ghép thẳng vào innerHTML mà
   *   không esc() là lỗ hổng XSS (tên kiểu "<img onerror=...>" sẽ chạy script).
   * @param {Object[]} entries  entry đã sanitize, đã sắp xếp
   * @param {{highlightId?:string, emptyText?:string, compact?:boolean}} [opts]  compact = chỉ hạng, tên, điểm
   * @returns {string} HTML
   */
  S.renderList = function (entries, opts) {
    opts = opts || {};
    if (!entries || !entries.length) {
      return '<p class="social-empty">' + esc(opts.emptyText || 'Chưa có ai trên bảng xếp hạng. Hãy là người đầu tiên!') + '</p>';
    }
    var medals = ['🥇', '🥈', '🥉'];
    var html = '<ol class="social-list' + (opts.compact ? ' social-list-compact' : '') + '">';
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var mine = opts.highlightId && e.id === opts.highlightId;
      html += '<li class="social-row' + (mine ? ' social-row-me' : '') + '">' +
        '<span class="social-rank">' + (i < 3 ? medals[i] : (i + 1)) + '</span>' +
        '<span class="social-name">' + esc(e.name) + '</span>' +
        (opts.compact ? '' :
          '<span class="social-char">' + esc(charInfo(e.charId).name) + '</span>' +
          '<span class="social-stars">★ ' + (e.stars | 0) + '</span>' +
          '<span class="social-date">' + esc(formatDate(e.date)) + '</span>') +
        '<span class="social-score">' + esc(formatScore(e.score)) + '</span>' +
        '</li>';
    }
    return html + '</ol>';
  };

  /**
   * Chèn khối kết quả (ảnh xem trước thẻ, ô nhập tên + LƯU ĐIỂM, nút chia sẻ / tải ảnh / bảng xếp hạng, top 5)
   * vào panel kết quả, ngay TRƯỚC hàng nút có sẵn. Gọi lại trên cùng panel sẽ thay khối cũ.
   * Đã có tên người chơi → tự lưu điểm luôn (không cần bấm).
   * @param {HTMLElement} panelEl  panel do OG.DOM.panel tạo
   * @param {RunResult} [result]
   * @returns {HTMLElement|null} khối đã chèn
   * @example
   *   var panel = OG.DOM.panel({ title: 'CHIẾN THẮNG!' });
   *   OG.Social.mountResult(panel, OG.Game.buildResult('victory'));
   */
  S.mountResult = function (panelEl, result) {
    if (!panelEl || typeof panelEl.appendChild !== 'function') return null;
    var r = result || fallbackResult();
    lastResult = r;

    var old = panelEl.querySelector('.social-result');
    if (old && old.parentNode) old.parentNode.removeChild(old);

    var box = el('div', 'social-result');
    var canScore = (r.score | 0) > 0;

    // Ảnh xem trước thẻ thành tích (bấm để phóng to / thu nhỏ)
    var preview = el('div', 'social-preview');
    preview.setAttribute('role', 'button');
    preview.setAttribute('tabindex', '0');
    preview.setAttribute('aria-label', 'Xem thẻ thành tích');
    /** @type {HTMLCanvasElement|null} */
    var cardCanvas = null;
    // Vẽ lại vào CÙNG một canvas (tạo lần đầu) khi tên đổi — CSS co canvas 1200×630 về khung xem trước.
    function redrawPreview() {
      try {
        if (!cardCanvas) {
          cardCanvas = document.createElement('canvas');
          cardCanvas.width = CARD_W;
          cardCanvas.height = CARD_H;
          cardCanvas.className = 'social-card';
          preview.appendChild(cardCanvas);
        }
        var cx = cardCanvas.getContext('2d');
        cx.clearRect(0, 0, CARD_W, CARD_H);
        drawCard(cx, r, S.getPlayerName());
      } catch (e) { /* không có canvas → bỏ ảnh xem trước */ }
    }
    redrawPreview();
    var togglePreview = function () { preview.classList.toggle('social-preview-big'); };
    preview.addEventListener('click', togglePreview);
    // role="button" trên <div> thì phải tự hỗ trợ Space/Enter (nút thật có sẵn) — khả năng tiếp cận bàn phím.
    preview.addEventListener('keydown', function (e) {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); togglePreview(); }
    });
    box.appendChild(preview);

    // Hàng nhập tên + lưu điểm
    var form = el('form', 'social-name-row');
    form.setAttribute('novalidate', '');
    var label = el('label', 'social-label');
    label.appendChild(document.createTextNode('Tên của bạn'));
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'social-input';
    input.maxLength = NAME_MAX * 2; // cắt chính xác theo code point khi lưu
    input.placeholder = 'Nhập tên…';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('enterkeyhint', 'done');
    input.setAttribute('aria-label', 'Tên người chơi');
    input.value = S.getPlayerName();
    label.appendChild(input);
    var saveBtn = makeBtn('LƯU ĐIỂM', 'social-save', null, 'socialSave');
    saveBtn.type = 'submit';
    form.appendChild(label);
    form.appendChild(saveBtn);

    var status = el('div', 'social-status');
    status.setAttribute('aria-live', 'polite'); // trình đọc màn hình đọc lại khi trạng thái đổi
    var listBox = el('div', 'social-top');

    function refreshList() {
      var sub = S.getSubmission(r);
      var top = typeof S.getLeaderboard === 'function' ? S.getLeaderboard(5) : [];
      listBox.innerHTML = '<div class="social-subtitle">Top 5</div>' +
        S.renderList(top, { compact: true, highlightId: sub && sub.entryId });
    }
    function showSaved(rank) {
      var name = S.getPlayerName();
      if (rank > 0) {
        status.innerHTML = 'Đã lưu cho <b>' + esc(name) + '</b> · Hạng <b>#' + rank + '</b>' + (rank === 1 ? ' 🏆' : '');
        status.className = 'social-status social-ok';
      } else {
        status.innerHTML = 'Đã ghi nhận <b>' + esc(name) + '</b>, nhưng chưa đủ điểm vào top 10. Cố lên!';
        status.className = 'social-status';
      }
      saveBtn.innerHTML = 'ĐỔI TÊN';
    }
    function doSave() {
      var name = cleanName(input.value);
      if (!name) {
        status.textContent = 'Hãy nhập tên (tối đa ' + NAME_MAX + ' ký tự).';
        status.className = 'social-status social-warn';
        try { input.focus(); } catch (e) { /* bỏ qua */ }
        return;
      }
      input.value = name;
      S.setPlayerName(name);
      var rank = S.submitResult(r, name);
      showSaved(rank);
      refreshList();
      redrawPreview();
      try { input.blur(); } catch (e) { /* bỏ qua */ }
    }
    // Dùng <form> + submit: Enter trên bàn phím (kể cả nút "Xong" của bàn phím ảo) tự kích hoạt lưu.
    form.addEventListener('submit', function (e) { e.preventDefault(); doSave(); });
    input.addEventListener('keydown', function (e) {
      // Không để Enter/Esc lọt ra panel (Enter sẽ bấm nút chính của panel).
      // ⚠️ Bẫy: thiếu stopPropagation thì gõ phím "e", "p"... trong ô tên cũng bị OG.Input hiểu là phím điều khiển.
      e.stopPropagation();
      if (e.key === 'Escape') input.blur();
    });

    if (canScore) {
      box.appendChild(form);
      var sub = S.getSubmission(r);
      if (sub) showSaved(sub.rank);
      else if (S.getPlayerName()) showSaved(S.submitResult(r, S.getPlayerName())); // tự lưu nếu đã có tên
      else {
        status.textContent = 'Nhập tên để lưu điểm lên bảng xếp hạng!';
        status.className = 'social-status';
      }
    } else {
      status.textContent = 'Ghi được điểm để có tên trên bảng xếp hạng nhé!';
      status.className = 'social-status';
    }
    box.appendChild(status);

    // Nút chia sẻ / tải ảnh / bảng xếp hạng
    var actions = el('div', 'social-actions');
    actions.appendChild(makeBtn('📤 CHIA SẺ', 'secondary social-share', function () {
      // Gọi share() ngay trong handler click → còn user activation cho navigator.share.
      S.share(r).then(function (ok) {
        var m = S.lastShareMethod;
        if (ok && m === 'share') toast('Đã chia sẻ! 🎉');
        else if (ok) toast('Đã sao chép nội dung chia sẻ! 📋');
        else if (m !== 'cancel') toast('Không chia sẻ được, hãy thử tải ảnh nhé.');
      });
    }, 'socialShare'));
    actions.appendChild(makeBtn('🖼️ TẢI ẢNH', 'secondary social-download', function () {
      if (S.downloadCard(r)) toast('Đang tải thẻ thành tích…');
      else toast('Trình duyệt không cho tải ảnh.');
    }, 'socialDownload'));
    if (OG.Scenes && OG.Scenes.has && OG.Scenes.has('leaderboard')) {
      actions.appendChild(makeBtn('🏆 BẢNG XẾP HẠNG', 'secondary social-open-board', function () {
        // back + backParams.result: từ bảng xếp hạng quay về đúng màn kết quả này (khối kết quả dựng lại, không lưu trùng).
        var back = (OG.Scenes.current && OG.Scenes.current()) || 'menu';
        var sub = S.getSubmission(r);
        OG.Scenes.go('leaderboard', { back: back, backParams: { result: r }, highlightId: sub && sub.entryId });
      }, 'socialBoard'));
    }
    box.appendChild(actions);
    box.appendChild(listBox);
    refreshList();

    // Chèn trước hàng nút có sẵn của panel (không xoá nút nào).
    var anchor = null;
    for (var i = 0; i < panelEl.children.length; i++) {
      var c = panelEl.children[i];
      if (c.classList && (c.classList.contains('actions') || c.classList.contains('ui-actions'))) anchor = c;
    }
    if (anchor) panelEl.insertBefore(box, anchor);
    else panelEl.appendChild(box);
    return box;
  };

  // ---------------------------------------------------------------------------
  // Khởi tạo
  // ---------------------------------------------------------------------------
  var inited = false;
  /**
   * Đăng ký các listener (sao từng màn, tự lưu điểm khi kết thúc lượt, dọn dẹp khi xoá save) và
   * khởi tạo bảng xếp hạng (scene 'leaderboard', backend online nếu có cấu hình). Gọi nhiều lần vẫn an toàn.
   */
  S.init = function () {
    // Cờ inited: init() lỡ bị gọi 2 lần sẽ đăng ký listener 2 lần → mỗi lượt lưu điểm 2 lần (xem bài 06).
    if (inited) return;
    inited = true;
    if (OG.Events && OG.Events.on) {
      OG.Events.on('game:start', function () { runLevelStars = {}; });
      OG.Events.on('level:complete', function (res) {
        if (res && res.levelId) runLevelStars[res.levelId] = res.stars | 0;
      });
      // Tự lưu điểm ngay khi kết thúc lượt nếu người chơi đã có tên (không cần UI).
      var autoSubmit = function (e) {
        var res = e && e.result;
        if (!res) return;
        lastResult = res;
        if (S.getPlayerName() && (res.score | 0) > 0) S.submitResult(res, S.getPlayerName());
      };
      OG.Events.on('game:over', autoSubmit);
      OG.Events.on('game:victory', autoSubmit);
      // Xoá save → quên mọi trạng thái tạm trong bộ nhớ, nếu không sẽ "đổi tên" một mục đã không còn tồn tại.
      OG.Events.on('save:reset', function () {
        submitted = {};
        runLevelStars = {};
        cardCache = { key: null, name: null, dataURL: null, blob: null };
      });
    }
    if (typeof S.initLeaderboard === 'function') {
      try { S.initLeaderboard(); } catch (e) { console.error('[OG.Social] initLeaderboard lỗi:', e); }
    }
  };
})();
