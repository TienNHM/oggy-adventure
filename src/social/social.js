/* OG.Social — tên người chơi, thẻ thành tích (ảnh canvas), chia sẻ, khối kết quả trên panel gameover/victory.
 * Chủ sở hữu: agent Social (src/social/). Phần bảng xếp hạng + adapter backend + scene 'leaderboard'
 * nằm ở src/social/leaderboard.js (load SAU file này).
 *
 * HỢP ĐỒNG (docs/ARCHITECTURE.md mục 8.6):
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
 * Event mới: 'social:share' {method, ok}, 'social:nameChange' {name}, 'social:onlineSubmit' (xem leaderboard.js). */
(function () {
  'use strict';
  var OG = window.OG;
  var S = (OG.Social = OG.Social || {});

  var NAME_MAX = 16;
  var CARD_W = 1200, CARD_H = 630;

  // ---------------------------------------------------------------------------
  // Tiện ích phòng thủ (module khác có thể vẫn là stub)
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
  function formatScore(n) {
    n = Math.max(0, Math.round(+n || 0));
    // Ngăn cách hàng nghìn bằng dấu chấm (kiểu Việt Nam) — không phụ thuộc Intl.
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
  function formatDate(iso) {
    var d = new Date(iso || Date.now());
    if (isNaN(d.getTime())) d = new Date();
    return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear();
  }
  S.formatScore = formatScore;
  S.formatDate = formatDate;

  // Làm sạch tên: bỏ ký tự điều khiển, gộp khoảng trắng, cắt theo code point.
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
  S.getPlayerName = function () {
    var d = saveData();
    return d && typeof d.playerName === 'string' ? d.playerName : '';
  };
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
  // ---------------------------------------------------------------------------
  var runLevelStars = {}; // levelId -> stars trong lượt hiện tại

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
  S.maxStars = function () { return levelCount() * 3; };

  // ---------------------------------------------------------------------------
  // Chuyển RunResult -> entry leaderboard; lưu không trùng lặp
  // ---------------------------------------------------------------------------
  var submitted = {}; // resultKey -> {entryId, rank, name}
  var lastResult = null;

  function resultKey(r) {
    return [r.type, r.score | 0, r.charId, r.date].join('|');
  }
  function randomId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  S.entryFromResult = function (result, name) {
    var r = result || {};
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

  // Lưu điểm của result với tên cho trước. Gọi lại với tên khác sẽ ĐỔI TÊN mục đã lưu (không tạo mục mới).
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
  S.getSubmission = function (result) { return result ? submitted[resultKey(result)] || null : null; };

  // ---------------------------------------------------------------------------
  // Thẻ thành tích (canvas 1200×630, tỉ lệ ảnh xem trước mạng xã hội)
  // ---------------------------------------------------------------------------
  var FONT = '"Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';

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
  // Viết chữ, tự thu nhỏ cỡ chữ để vừa maxW.
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

  // Vẽ nhân vật bằng OG.Sprites; nếu lỗi thì vẽ hình mèo đơn giản.
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
        try { ctx.restore(); } catch (e2) { /* bỏ qua */ }
        ok = false;
      }
    }
    if (!ok) {
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

  // Vẽ thẻ thành tích lên ctx kích thước CARD_W×CARD_H.
  function drawCard(ctx, result, name) {
    var r = result || {};
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
    // Mây
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

    // Nhân vật
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
    // Tiêu đề game
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

    // Sao: vẽ 3 sao lớn theo tỉ lệ sao/tối đa + số cụ thể
    var ratio = maxStars ? stars / maxStars : 0;
    var bigFilled = stars <= 0 ? 0 : Math.max(1, Math.round(ratio * 3));
    for (var s = 0; s < 3; s++) drawStar(ctx, cx - 150 + s * 56, py + 340, 24, s < bigFilled);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '900 32px ' + FONT;
    ctx.fillStyle = ink;
    ctx.fillText(stars + ' / ' + maxStars + ' sao', cx + 20, py + 342);

    // Ô thống kê
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

    // Kỷ lục mới
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
  S.drawCard = function (ctx, result, name) { drawCard(ctx, result, name == null ? S.getPlayerName() : name); };

  // Tạo canvas thẻ thành tích (không gắn vào DOM).
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

  var cardCache = { key: null, name: null, dataURL: null, blob: null };
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
  function stamp() {
    var d = new Date();
    return d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2) + '-' +
      ('0' + d.getHours()).slice(-2) + ('0' + d.getMinutes()).slice(-2) + ('0' + d.getSeconds()).slice(-2);
  }
  function downloadCanvas(canvas, filename) {
    try {
      if (canvas.toBlob && window.URL && URL.createObjectURL) {
        canvas.toBlob(function (blob) {
          if (!blob) { clickDownload(canvas.toDataURL('image/png'), filename); return; }
          var u = URL.createObjectURL(blob);
          clickDownload(u, filename);
          setTimeout(function () { URL.revokeObjectURL(u); }, 5000);
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

  S.captureCanvas = function () {
    try {
      var c = OG.canvas || document.getElementById('game');
      return c ? c.toDataURL('image/png') : null;
    } catch (e) { return null; }
  };
  S.downloadScreenshot = function (filename) {
    var c = OG.canvas || document.getElementById('game');
    if (!c) return false;
    return downloadCanvas(c, filename || ('oggy-adventure-' + stamp() + '.png'));
  };
  S.downloadCard = function (result, filename) {
    var c = S.createCard(result || lastResult || fallbackResult());
    return downloadCanvas(c, filename || ('oggy-thanh-tich-' + stamp() + '.png'));
  };

  // ---------------------------------------------------------------------------
  // Chia sẻ
  // ---------------------------------------------------------------------------
  function shareUrl() {
    try {
      var p = window.location.protocol;
      if (p === 'http:' || p === 'https:') return window.location.href.split('#')[0];
    } catch (e) { /* bỏ qua */ }
    return '';
  }
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

  // Copy văn bản: clipboard API → textarea + execCommand.
  function execCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'absolute';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    var root = shell();
    root.appendChild(ta);
    var ok = false;
    try {
      ta.select();
      ta.setSelectionRange(0, text.length);
      ok = document.execCommand('copy');
    } catch (e) { ok = false; }
    root.removeChild(ta);
    return ok;
  }
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

  // Danh sách top N (HTML) — dùng chung cho mountResult và scene leaderboard.
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
    var cardCanvas = null;
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
    status.setAttribute('aria-live', 'polite');
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
    form.addEventListener('submit', function (e) { e.preventDefault(); doSave(); });
    input.addEventListener('keydown', function (e) {
      // Không để Enter/Esc lọt ra panel (Enter sẽ bấm nút chính của panel).
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
  S.init = function () {
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
