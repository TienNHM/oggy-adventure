/* OG.Story — điều phối HÀNH TRÌNH: bắt đầu hành trình, truyện tranh trước/sau màn, kết thúc hành trình.
 * Kèm OG.Story.ui: bộ công cụ vẽ dùng chung cho mọi scene v2 (bong bóng thoại có hiệu ứng hiện chữ,
 * khung bo tròn, nút canvas to, ngôi sao, tia sáng, pháo hoa/giấy màu, đọc to bằng giọng nói).
 * Chủ sở hữu v2: agent story-ui (src/story/). Hợp đồng: docs/STORY.md mục 3 và 6. */
(function () {
  'use strict';
  var OG = window.OG;
  var U = OG.util;
  var TAU = Math.PI * 2;
  var INK = '#17233d';
  function J() { return OG.Journeys; }

  function store() {
    var s = OG.Save.ns('story');
    if (!s.seen || typeof s.seen !== 'object') s.seen = {};
    return s;
  }

  // ===========================================================================
  // Bộ công cụ vẽ dùng chung
  // ===========================================================================
  // Vẽ an toàn: luôn cân bằng save/restore, lỗi trong hàm vẽ của dữ liệu không làm sập frame.
  var reported = {};
  function guard(ctx, label, fn) {
    ctx.save();
    try { fn(); } catch (e) {
      if (!reported[label]) { reported[label] = true; console.warn('[OG.Story] lỗi khi vẽ ' + label + ':', e); }
    }
    ctx.restore();
  }

  // Bỏ emoji khi đo/đọc to (giữ chữ tiếng Việt).
  function stripEmoji(s) {
    return String(s || '').replace(/[←-⇿⌀-➿⬀-⯿️‍]|[\ud83c-\ud83e][\udc00-\udfff]/g, '').replace(/\s+/g, ' ').trim();
  }

  var ui = {
    INK: INK,
    guard: guard,
    font: function (px, w) { return OG.font ? OG.font(px, w || 'bold') : (w || 'bold') + ' ' + (px | 0) + 'px "Segoe UI", system-ui, Roboto, Arial, sans-serif'; },

    // Ngắt dòng theo bề rộng (đo bằng ctx.font hiện tại). Hỗ trợ '\n'.
    wrap: function (ctx, text, maxW) {
      var out = [];
      String(text == null ? '' : text).split('\n').forEach(function (para) {
        var words = para.split(/\s+/).filter(Boolean), cur = '';
        for (var i = 0; i < words.length; i++) {
          var test = cur ? cur + ' ' + words[i] : words[i];
          if (cur && ctx.measureText(test).width > maxW) { out.push(cur); cur = words[i]; } else cur = test;
        }
        out.push(cur);
      });
      return out.length ? out : [''];
    },

    // Đo kích thước bong bóng (không vẽ). Trả {w, h, lines, size, lh, pad, nameH}.
    measureBubble: function (ctx, text, opts) {
      opts = opts || {};
      var size = opts.size || 18, maxW = opts.maxW || 300, pad = Math.round(size * 0.7), lh = Math.round(size * 1.32);
      ctx.save();
      ctx.font = ui.font(size, opts.weight || 'bold');
      var lines = ui.wrap(ctx, text, maxW - pad * 2), w = 0;
      lines.forEach(function (l) { w = Math.max(w, ctx.measureText(l).width); });
      ctx.restore();
      var nameH = opts.name ? Math.round(size * 0.5) : 0;
      w = Math.max(opts.minW || 0, Math.min(maxW, Math.ceil(w) + pad * 2), opts.name ? size * 4 : 0);
      return { w: w, h: lines.length * lh + pad * 2 + nameH, lines: lines, size: size, lh: lh, pad: pad, nameH: nameH };
    },

    // Bong bóng thoại kiểu truyện tranh.
    // (x, y) = đầu đuôi bong bóng (chỉ vào người nói). opts:
    //   maxW, size, weight, bg, border, name, nameColor, tail:'down'|'up'|'none', anchor:'left'|'center',
    //   reveal: số ký tự đang hiện (hiệu ứng gõ chữ; null = hiện hết),
    //   bounds: {x,y,w,h} vùng được phép (mặc định cả màn hình), boxX/boxY: ép vị trí góc trên-trái.
    // tail 'none': (x, y) = góc trên-trái (anchor 'left') hoặc giữa-trên của bong bóng.
    // Trả về hộp {x, y, w, h} đã vẽ.
    drawBubble: function (ctx, x, y, text, opts) {
      opts = opts || {};
      var m = ui.measureBubble(ctx, text, opts);
      var B = opts.bounds || { x: 0, y: 0, w: OG.W, h: OG.H };
      var tail = opts.tail || 'down', w = m.w, h = m.h;
      var bx = opts.boxX != null ? opts.boxX : (opts.anchor === 'left' ? x : x - w / 2);
      var by = opts.boxY != null ? opts.boxY : (tail === 'up' ? y + 16 : tail === 'none' ? y : y - 16 - h);
      bx = U.clamp(bx, B.x + 6, B.x + B.w - w - 6);
      by = U.clamp(by, B.y + 6 + (opts.name ? m.size * 0.7 : 0), B.y + B.h - h - 6);
      ctx.save();
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      var r = Math.min(20, h / 2);
      // bóng đổ
      ctx.fillStyle = 'rgba(23,35,61,0.22)';
      U.roundRectPath(ctx, bx + 3, by + 5, w, h, r); ctx.fill();
      // đuôi (vẽ trước thân để thân che chân đuôi)
      ctx.fillStyle = opts.bg || '#ffffff';
      ctx.strokeStyle = opts.border || INK; ctx.lineWidth = 3.5;
      var hasTail = tail !== 'none' && (tail === 'up' ? y < by : y > by + h);
      if (hasTail) {
        var tx = U.clamp(x, bx + 22, bx + w - 22), ty = tail === 'up' ? by + 2 : by + h - 2;
        var mid = (tx + x) / 2;
        ctx.beginPath();
        ctx.moveTo(tx - 11, ty);
        ctx.quadraticCurveTo(mid - 2, (ty + y) / 2, x, y);
        ctx.quadraticCurveTo(mid + 6, (ty + y) / 2, tx + 11, ty);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      U.roundRectPath(ctx, bx, by, w, h, r); ctx.fill(); ctx.stroke();
      if (hasTail) { // xoá vạch viền giữa đuôi và thân
        var tx2 = U.clamp(x, bx + 22, bx + w - 22);
        ctx.fillRect(tx2 - 9, tail === 'up' ? by - 1 : by + h - 3, 18, 4);
      }
      // Bảng tên (pill màu) ở góc trên-trái
      if (opts.name) {
        ctx.font = ui.font(Math.round(m.size * 0.72));
        var nw = ctx.measureText(opts.name).width + 18, nh = Math.round(m.size * 1.15);
        ctx.fillStyle = opts.nameColor || '#ed713c';
        U.roundRectPath(ctx, bx + 10, by - nh * 0.6, nw, nh, nh / 2); ctx.fill();
        ctx.lineWidth = 2.5; ctx.stroke();
        ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(opts.name, bx + 19, by - nh * 0.6 + nh / 2 + 1);
      }
      // Chữ (hiệu ứng gõ: chỉ hiện `reveal` ký tự đầu, bố cục không nhảy)
      ctx.font = ui.font(m.size, opts.weight || 'bold');
      ctx.fillStyle = opts.color || INK; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      var left = opts.reveal == null ? Infinity : Math.max(0, opts.reveal | 0);
      var ty0 = by + m.pad + m.nameH;
      for (var i = 0; i < m.lines.length && left > 0; i++) {
        var line = m.lines[i];
        var shown = left >= line.length ? line : line.slice(0, left);
        left -= line.length + 1;
        var lx = opts.align === 'center' ? bx + (w - ctx.measureText(line).width) / 2 : bx + m.pad;
        ctx.fillText(shown, lx, ty0 + i * m.lh);
      }
      ctx.restore();
      return { x: bx, y: by, w: w, h: h };
    },

    // Khung bo tròn viền dày (panel truyện, thẻ, câu đố).
    drawFrame: function (ctx, x, y, w, h, fill, r, opts) {
      opts = opts || {};
      ctx.save();
      ctx.fillStyle = 'rgba(23,35,61,0.28)';
      U.roundRectPath(ctx, x + 4, y + 7, w, h, r || 18); ctx.fill();
      ctx.fillStyle = fill || '#fff6df';
      ctx.strokeStyle = opts.border || INK; ctx.lineWidth = opts.lineWidth || 4;
      U.roundRectPath(ctx, x, y, w, h, r || 18); ctx.fill(); ctx.stroke();
      if (opts.gloss !== false) { // vệt bóng nhẹ phía trên
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        U.roundRectPath(ctx, x + 8, y + 6, w - 16, Math.min(18, h * 0.12), 9); ctx.fill();
      }
      ctx.restore();
    },

    // Nút vẽ trên canvas (to, bo tròn, có bóng 3D). r = {x,y,w,h}; trả r để hit-test.
    // opts: {color, shadow, text, size, hot, icon, disabled, pulse}
    drawButton: function (ctx, r, label, opts) {
      opts = opts || {};
      ctx.save();
      var lift = opts.pressed ? 2 : 0;
      var s = opts.pulse ? 1 + Math.sin(OG.time * 5) * 0.035 : 1;
      if (s !== 1) { ctx.translate(r.x + r.w / 2, r.y + r.h / 2); ctx.scale(s, s); ctx.translate(-r.x - r.w / 2, -r.y - r.h / 2); }
      ctx.globalAlpha *= opts.disabled ? 0.5 : 1;
      var rad = Math.min(16, r.h / 2);
      ctx.fillStyle = opts.shadow || '#b74b2b';
      U.roundRectPath(ctx, r.x, r.y + 5, r.w, r.h, rad); ctx.fill();
      ctx.fillStyle = opts.color || '#f27a43';
      ctx.strokeStyle = opts.hot ? '#ffffff' : INK; ctx.lineWidth = opts.hot ? 4 : 2.5;
      U.roundRectPath(ctx, r.x, r.y + lift, r.w, r.h, rad); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      U.roundRectPath(ctx, r.x + 6, r.y + lift + 4, r.w - 12, r.h * 0.32, rad / 2); ctx.fill();
      ctx.fillStyle = opts.text || '#ffffff';
      ctx.font = ui.font(opts.size || 20); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, r.x + r.w / 2, r.y + lift + r.h / 2 + 1);
      ctx.restore();
      return r;
    },
    hit: function (r, px, py) { return !!r && px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h; },

    // Phím "tiến tới" chung: Enter, Space, E, → (dùng ở comic/thẻ).
    advancePressed: function () {
      var I = OG.Input;
      return I.pressed('confirm') || I.pressed('jump') || I.pressed('action') || I.pressed('right');
    },

    // Ngôi sao 5 cánh (tâm x,y).
    drawStar: function (ctx, x, y, r, fill, stroke) {
      ctx.save();
      ctx.beginPath();
      for (var i = 0; i < 10; i++) {
        var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.48 : r;
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fillStyle = fill || '#ffc94a'; ctx.fill();
      if (stroke !== false) { ctx.strokeStyle = stroke || INK; ctx.lineWidth = Math.max(1.5, r * 0.16); ctx.lineJoin = 'round'; ctx.stroke(); }
      ctx.restore();
    },

    // Tia sáng xoay sau vật thể (thẻ mới, cúp).
    drawRays: function (ctx, x, y, r, t, color, n) {
      ctx.save();
      ctx.translate(x, y); ctx.rotate(t * 0.5);
      ctx.fillStyle = color || 'rgba(255,214,90,0.45)';
      n = n || 12;
      for (var i = 0; i < n; i++) {
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.arc(0, 0, r, (i / n) * TAU, ((i + 0.5) / n) * TAU);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    },

    // Thanh tiến độ bo tròn.
    drawBar: function (ctx, x, y, w, h, k, fill, bg) {
      ctx.save();
      ctx.fillStyle = bg || 'rgba(23,35,61,0.18)';
      U.roundRectPath(ctx, x, y, w, h, h / 2); ctx.fill();
      if (k > 0) { ctx.fillStyle = fill || '#3fbf6f'; U.roundRectPath(ctx, x, y, Math.max(h, w * U.clamp(k, 0, 1)), h, h / 2); ctx.fill(); }
      ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
      U.roundRectPath(ctx, x, y, w, h, h / 2); ctx.stroke();
      ctx.restore();
    },

    // Độ lệch rung lắc (sai câu đố): giảm dần trong `dur` giây.
    shake: function (t, dur, amp) {
      if (t == null || t < 0 || t > (dur || 0.45)) return 0;
      var k = 1 - t / (dur || 0.45);
      return Math.sin(t * 46) * (amp || 10) * k;
    },
    easeOutBack: function (k) { k = U.clamp(k, 0, 1); var c = 1.70158; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); },
    easeOut: function (k) { k = U.clamp(k, 0, 1); return 1 - (1 - k) * (1 - k); },

    // Màu nhạt/đậm từ mã #rrggbb (k>0 sáng hơn, k<0 tối hơn).
    shade: function (hex, k) {
      var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
      if (!m) return hex || '#cccccc';
      var n = parseInt(m[1], 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (v) {
        v = k >= 0 ? v + (255 - v) * k : v * (1 + k);
        return Math.round(U.clamp(v, 0, 255));
      });
      return '#' + c.map(function (v) { return (v < 16 ? '0' : '') + v.toString(16); }).join('');
    },

    // Bảng màu của hành trình (có mặc định).
    palette: function (jid) {
      var j = J() && J().get(jid), p = (j && j.palette) || {};
      return { primary: p.primary || '#ed713c', secondary: p.secondary || '#52b9df', accent: p.accent || '#ffc94a', bg: p.bg || '#fff6df', ink: p.ink || INK };
    },

    stripEmoji: stripEmoji,

    // ---- Đọc to bằng giọng nói của trình duyệt (cho bé chưa đọc thạo). Chỉ khi có giọng tiếng Việt. ----
    viVoice: function () {
      try {
        var s = window.speechSynthesis;
        if (!s || typeof window.SpeechSynthesisUtterance !== 'function' || !s.getVoices) return null;
        var v = s.getVoices() || [];
        for (var i = 0; i < v.length; i++) if (/^vi/i.test(v[i].lang || '')) return v[i];
      } catch (e) { /* bỏ qua */ }
      return null;
    },
    canSpeak: function () { return !!ui.viVoice(); },
    speak: function (text) {
      var v = ui.viVoice();
      if (!v) return false;
      try {
        window.speechSynthesis.cancel();
        var u = new window.SpeechSynthesisUtterance(stripEmoji(text));
        u.lang = v.lang || 'vi-VN'; u.voice = v; u.rate = 0.9; u.pitch = 1.1;
        window.speechSynthesis.speak(u);
        return true;
      } catch (e) { return false; }
    },
    stopSpeak: function () { try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) { /* bỏ qua */ } }
  };

  // ---------------------------------------------------------------------------
  // Hiệu ứng màn hình: giấy màu + pháo hoa (toạ độ màn hình 960×540). Scene gọi update/draw.
  // ---------------------------------------------------------------------------
  var COLORS = ['#ffc94a', '#f27a43', '#52c5ee', '#3fbf6f', '#f29bb8', '#7b6cf0', '#ffffff'];
  var parts = [];
  ui.fx = {
    // Giấy màu tung lên rồi rơi.
    confetti: function (x, y, n, spread) {
      n = n || 40;
      for (var i = 0; i < n && parts.length < 400; i++) {
        var a = -Math.PI / 2 + (Math.random() - 0.5) * (spread || 2.2), v = 260 + Math.random() * 360;
        parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 620, drag: 0.985, life: 0, max: 1.6 + Math.random() * 0.9,
          size: 6 + Math.random() * 6, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, color: COLORS[i % COLORS.length], shape: i % 3 ? 'rect' : 'circle' });
      }
    },
    // Pháo hoa: vòng sao toả đều.
    firework: function (x, y, n, color) {
      n = n || 22;
      for (var i = 0; i < n && parts.length < 400; i++) {
        var a = (i / n) * TAU, v = 170 + Math.random() * 90;
        parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 160, drag: 0.96, life: 0, max: 0.9 + Math.random() * 0.4,
          size: 7 + Math.random() * 4, rot: 0, vr: 4, color: color || COLORS[(Math.random() * COLORS.length) | 0], shape: 'star' });
      }
    },
    update: function (dt) {
      for (var i = parts.length - 1; i >= 0; i--) {
        var p = parts[i];
        p.life += dt;
        if (p.life >= p.max) { parts.splice(i, 1); continue; }
        p.vx *= p.drag; p.vy = p.vy * p.drag + p.g * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      }
    },
    draw: function (ctx) {
      if (!parts.length) return;
      ctx.save();
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i], a = 1 - Math.max(0, (p.life - p.max * 0.6) / (p.max * 0.4));
        ctx.globalAlpha = U.clamp(a, 0, 1);
        if (p.shape === 'star') { ui.drawStar(ctx, p.x, p.y, p.size, p.color, false); continue; }
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.shape === 'circle') { ctx.beginPath(); ctx.arc(0, 0, p.size / 2, 0, TAU); ctx.fill(); }
        else ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      ctx.restore();
    },
    count: function () { return parts.length; },
    clear: function () { parts.length = 0; }
  };

  // ===========================================================================
  // Điều phối hành trình
  // ===========================================================================
  var Story = (OG.Story = {
    ui: ui,

    init: function () {
      // Hook màn: truyện tranh giữa màn (comicTriggers).
      if (OG.Level && OG.Level.addHook) OG.Level.addHook(comicHook);
    },

    current: function () { return (OG.Game.run && OG.Game.run.journeyId) || null; },
    lastJourney: function () {
      var id = store().last || null;
      return id && J().has(id) ? id : null;
    },

    hasSeen: function (journeyId, comicId) { return !!store().seen[journeyId + ':' + comicId]; },
    markSeen: function (journeyId, comicId) {
      if (!journeyId || !comicId) return;
      store().seen[journeyId + ':' + comicId] = true;
      OG.Save.commit();
    },

    // Bắt đầu (hoặc tiếp tục) một hành trình. opts: {skipIntro, forceIntro}
    startJourney: function (journeyId, opts) {
      opts = opts || {};
      var j = J().get(journeyId);
      if (!j || j.invalid) { OG.DOM.toast('Hành trình này đang được xây dựng 🛠️'); return false; }
      OG.Game.newRun({ journeyId: journeyId });
      store().last = journeyId;
      OG.Save.commit();
      OG.Events.emit('journey:select', { journeyId: journeyId, difficulty: U.call('Difficulty', 'mode') || 'kid' });
      var toMap = { scene: 'journeyMap', params: { journeyId: journeyId } };
      if (j.intro && !opts.skipIntro && (opts.forceIntro || !Story.hasSeen(journeyId, j.intro))) {
        Story.playComic(journeyId, j.intro, { next: toMap });
      } else {
        OG.Scenes.go(toMap.scene, toMap.params);
      }
      return true;
    },

    // Vào một màn của hành trình (chạy truyện mở khu / mở màn nếu chưa xem).
    playLevel: function (levelId) {
      var L = J().getLevel(levelId);
      if (!L) { console.warn('[OG.Story] không có màn ' + levelId); return false; }
      if (!OG.Game.run || OG.Game.run.over || OG.Game.run.journeyId !== L.journey) OG.Game.newRun({ journeyId: L.journey });
      var area = J().getArea(L.journey, L.areaId) || {};
      var queue = [];
      if (L.indexInArea === 0) {
        OG.Events.emit('area:enter', { journeyId: L.journey, areaId: L.areaId, levelId: levelId });
        if (area.intro) queue.push(area.intro);
      }
      if (L.intro) queue.push(L.intro);
      queue = queue.filter(function (c) { return !Story.hasSeen(L.journey, c); });
      Story.playComics(L.journey, queue, { next: { scene: 'level', params: { levelId: levelId }, start: true } });
      return true;
    },

    // Gọi bởi OG.Game.completeLevel cho màn hành trình. Trả true (đã tự chuyển scene).
    afterLevel: function (result) {
      var L = result && J().getLevel(result.levelId);
      if (!L) return false;
      var jid = L.journey, j = J().get(jid) || {}, area = J().getArea(jid, L.areaId) || {};
      var queue = [];
      if (L.outro) queue.push(L.outro);
      if (L.isLastOfArea) {
        OG.Events.emit('area:complete', { journeyId: jid, areaId: L.areaId, levelId: L.id });
        if (area.outro) queue.push(area.outro);
      }
      var final = J().isFinalLevel(L.id);
      var ending = j.ending && (typeof j.ending === 'object' ? j.ending.comic : j.ending);
      if (final && ending) queue.push(ending);
      queue = queue.filter(function (c) { return !Story.hasSeen(jid, c); });
      var next = final ? { fn: function () { Story.finishJourney(jid); } }
        : { scene: 'journeyMap', params: { journeyId: jid, completed: L.id, result: result } };
      Story.playComics(jid, queue, { next: next });
      return true;
    },

    finishJourney: function (journeyId) {
      var count = U.call('Learn', 'count', journeyId) || { have: 0, total: 0 };
      if (OG.Game.run) OG.Game.run.over = true;
      OG.Events.emit('journey:complete', { journeyId: journeyId, cards: count.have, totalCards: count.total });
      if (OG.Scenes.has('journeyEnd')) OG.Scenes.go('journeyEnd', { journeyId: journeyId });
      else OG.Scenes.go('journeyMap', { journeyId: journeyId });
    },

    // Chạy 1 truyện rồi tới `opts.next` ({scene, params, start?} hoặc {fn}).
    playComic: function (journeyId, comicId, opts) { Story.playComics(journeyId, comicId ? [comicId] : [], opts); },
    // Chạy nối tiếp nhiều truyện (mảng rỗng = đi thẳng tới next).
    playComics: function (journeyId, list, opts) {
      opts = opts || {};
      list = (list || []).filter(function (c) { return !!J().getComic(journeyId, c); });
      if (!list.length) { goNext(opts.next); return; }
      var first = list[0], rest = list.slice(1);
      OG.Scenes.go('comic', {
        journeyId: journeyId, comicId: first, part: opts.part || 1,
        onDone: function () { Story.playComics(journeyId, rest, { next: opts.next, part: (opts.part || 1) + 1 }); }
      });
    },
    // Truyện chen giữa màn (push lên scene hiện tại; tự pop khi xong).
    pushComic: function (journeyId, comicId, onDone) {
      if (!J().getComic(journeyId, comicId)) { if (onDone) onDone(); return false; }
      OG.Scenes.push('comic', { journeyId: journeyId, comicId: comicId, overlay: true, onDone: onDone || null });
      return true;
    },

    // Hết mạng ở chế độ 'kid' (OG.Difficulty.softFail gọi). Trả true nếu đã hiện lời động viên.
    onSoftFail: function (info) {
      var msgs = info && info.assist
        ? ['Mình giúp bạn một tay nhé! Cố lên! 💪', 'Có khiên bảo vệ rồi! Đi tiếp nào! 🛡️']
        : ['Không sao đâu! Mình thử lại nhé! 😊', 'Hít một hơi thật sâu, mình làm lại nào!', 'Suýt nữa thôi! Bạn làm được mà! ⭐'];
      return U.call('Guide', 'say', msgs[(Math.random() * msgs.length) | 0], 2.8) === true;
    },

    // Vẽ 1 khung truyện (xem scenes.js). Gán thật ở scenes.js; bản này phòng khi scenes.js chưa load.
    drawComicPanel: function () {}
  });

  function goNext(next) {
    if (!next) { OG.Scenes.go('journeyMap', { journeyId: Story.current() }); return; }
    if (typeof next.fn === 'function') { next.fn(); return; }
    if (next.start && next.scene === 'level') { OG.Game.startLevel(next.params.levelId); return; }
    OG.Scenes.go(next.scene, next.params || {});
  }

  // ---- Level hook: truyện tranh giữa màn ----
  var comicHook = {
    id: 'story-comics', order: 40,
    enter: function (st) {
      st.comicTriggers = st.journeyId ? (st.level.comicTriggers || []).map(function (c) {
        return { x: c.x, comic: c.comic, once: c.once !== false, fired: false };
      }) : [];
    },
    update: function (st, dt, p) {
      var list = st.comicTriggers || [];
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c.fired || p.x + p.w / 2 < c.x) continue;
        c.fired = true;
        if (c.once && Story.hasSeen(st.journeyId, c.comic)) continue;
        if (Story.pushComic(st.journeyId, c.comic)) return true;
      }
    },
    // Dấu "📖" nhỏ lơ lửng báo trước chỗ có truyện (chưa xem).
    drawWorld: function (ctx, st, t) {
      var list = st.comicTriggers || [];
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c.fired || (c.once && Story.hasSeen(st.journeyId, c.comic))) continue;
        var y = OG.FLOOR_Y - 150 + Math.sin(t * 3 + i) * 6;
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = '#ffffff'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(c.x, y, 17, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.font = ui.font(18); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = INK; ctx.fillText('📖', c.x, y + 1);
        ctx.restore();
      }
    }
  };
})();
