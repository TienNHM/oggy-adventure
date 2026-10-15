/* OG.Story — điều phối HÀNH TRÌNH: bắt đầu hành trình, truyện tranh trước/sau màn, kết thúc hành trình.
 * Kèm OG.Story.ui: tiện ích vẽ dùng chung (bong bóng thoại, khung truyện, nút canvas, ngắt dòng).
 * Chủ sở hữu v2: agent story-ui (src/story/). Hợp đồng: docs/STORY.md mục 6.
 * BẢN STUB: chạy được đầy đủ luồng; agent story-ui làm đẹp/hoàn thiện nhưng GIỮ chữ ký API. */
(function () {
  'use strict';
  var OG = window.OG;
  var U = OG.util;
  var J = function () { return OG.Journeys; };

  function store() {
    var s = OG.Save.ns('story');
    if (!s.seen || typeof s.seen !== 'object') s.seen = {};
    return s;
  }

  // ===========================================================================
  // Tiện ích vẽ dùng chung (comic, quiz, thẻ, người dẫn đường)
  // ===========================================================================
  var INK = '#17233d';
  var ui = {
    font: function (px, w) { return OG.font ? OG.font(px, w || 'bold') : (w || 'bold') + ' ' + px + 'px "Segoe UI", system-ui, Roboto, Arial, sans-serif'; },

    // Ngắt dòng theo bề rộng (đo bằng ctx.font hiện tại).
    wrap: function (ctx, text, maxW) {
      var words = String(text || '').split(/\s+/), lines = [], cur = '';
      for (var i = 0; i < words.length; i++) {
        var test = cur ? cur + ' ' + words[i] : words[i];
        if (cur && ctx.measureText(test).width > maxW) { lines.push(cur); cur = words[i]; } else cur = test;
      }
      if (cur) lines.push(cur);
      return lines;
    },

    // Bong bóng thoại. (x, y) = đầu đuôi bong bóng (chỉ vào người nói). opts: {maxW, size, tail:'down'|'up'|'none', bg, name, anchor:'left'}
    // tail 'none': (x, y) = góc trên (anchor 'left') hoặc giữa-trên của bong bóng.
    // Trả về hộp {x, y, w, h} đã vẽ.
    drawBubble: function (ctx, x, y, text, opts) {
      opts = opts || {};
      var size = opts.size || 18, maxW = opts.maxW || 300, pad = 12, lh = size * 1.3;
      ctx.save();
      ctx.font = ui.font(size);
      var lines = ui.wrap(ctx, text, maxW - pad * 2);
      var w = 0;
      lines.forEach(function (l) { w = Math.max(w, ctx.measureText(l).width); });
      w = Math.min(maxW, w + pad * 2);
      var h = lines.length * lh + pad * 2 + (opts.name ? size * 0.9 : 0);
      var tail = opts.tail || 'down';
      var bx = U.clamp(opts.anchor === 'left' ? x : x - w / 2, 8, OG.W - w - 8);
      var by = tail === 'up' ? y + 14 : tail === 'none' ? y : y - 14 - h;
      by = U.clamp(by, 6, OG.H - h - 6);
      ctx.fillStyle = opts.bg || '#ffffff';
      ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineJoin = 'round';
      U.roundRectPath(ctx, bx, by, w, h, 14); ctx.fill(); ctx.stroke();
      if (tail !== 'none') {
        var tx = U.clamp(x, bx + 18, bx + w - 18), ty = tail === 'up' ? by : by + h;
        ctx.beginPath();
        ctx.moveTo(tx - 9, ty); ctx.lineTo(x, y); ctx.lineTo(tx + 9, ty); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.fillRect(tx - 7, ty - (tail === 'up' ? -1 : 3), 14, 4); // che đường viền giữa đuôi và thân
      }
      ctx.fillStyle = INK; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      var ty0 = by + pad;
      if (opts.name) { ctx.font = ui.font(size * 0.75); ctx.fillStyle = opts.nameColor || '#ed713c'; ctx.fillText(opts.name, bx + pad, ty0); ty0 += size * 0.9; ctx.fillStyle = INK; ctx.font = ui.font(size); }
      lines.forEach(function (l, i) { ctx.fillText(l, bx + pad, ty0 + i * lh); });
      ctx.restore();
      return { x: bx, y: by, w: w, h: h };
    },

    // Khung bo tròn viền dày (panel truyện, thẻ, câu đố).
    drawFrame: function (ctx, x, y, w, h, fill, r) {
      ctx.save();
      ctx.fillStyle = 'rgba(23,35,61,0.25)';
      U.roundRectPath(ctx, x + 4, y + 6, w, h, r || 18); ctx.fill();
      ctx.fillStyle = fill || '#fff6df';
      ctx.strokeStyle = INK; ctx.lineWidth = 4;
      U.roundRectPath(ctx, x, y, w, h, r || 18); ctx.fill(); ctx.stroke();
      ctx.restore();
    },

    // Nút vẽ trên canvas. r = {x,y,w,h}; trả r để hit-test.
    drawButton: function (ctx, r, label, opts) {
      opts = opts || {};
      ctx.save();
      ctx.fillStyle = opts.shadow || '#b74b2b';
      U.roundRectPath(ctx, r.x, r.y + 4, r.w, r.h, 14); ctx.fill();
      ctx.fillStyle = opts.hot ? (opts.hotColor || '#ff9a5c') : (opts.color || '#f27a43');
      ctx.strokeStyle = opts.hot ? '#ffffff' : 'rgba(0,0,0,0)'; ctx.lineWidth = 3;
      U.roundRectPath(ctx, r.x, r.y, r.w, r.h, 14); ctx.fill(); ctx.stroke();
      ctx.fillStyle = opts.text || '#ffffff';
      ctx.font = ui.font(opts.size || 18); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + 1);
      ctx.restore();
      return r;
    },
    hit: function (r, px, py) { return !!r && px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h; },

    // Phím "tiến tới" chung: Enter, Space, E, → (dùng ở comic/thẻ).
    advancePressed: function () {
      var I = OG.Input;
      return I.pressed('confirm') || I.pressed('jump') || I.pressed('action') || I.pressed('right');
    }
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
    lastJourney: function () { return store().last || null; },

    hasSeen: function (journeyId, comicId) { return !!store().seen[journeyId + ':' + comicId]; },
    markSeen: function (journeyId, comicId) { store().seen[journeyId + ':' + comicId] = true; OG.Save.commit(); },

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
      var L = J().getLevel(result.levelId);
      if (!L) return false;
      var jid = L.journey, j = J().get(jid), area = J().getArea(jid, L.areaId) || {};
      var queue = [];
      if (L.outro) queue.push(L.outro);
      if (L.isLastOfArea) {
        OG.Events.emit('area:complete', { journeyId: jid, areaId: L.areaId });
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
        journeyId: journeyId, comicId: first,
        onDone: function () { Story.playComics(journeyId, rest, opts); }
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
      var msg = info && info.assist ? 'Mình giúp bạn một tay nhé! Cố lên!' : 'Không sao đâu! Mình thử lại nhé!';
      return U.call('Guide', 'say', msg, 2.5) === true;
    }
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
      st.comicTriggers = st.journeyId ? (st.level.comicTriggers || []).map(function (c) { return { x: c.x, comic: c.comic, once: c.once !== false, fired: false }; }) : [];
    },
    update: function (st, dt, p) {
      for (var i = 0; i < st.comicTriggers.length; i++) {
        var c = st.comicTriggers[i];
        if (c.fired || p.x + p.w / 2 < c.x) continue;
        c.fired = true;
        if (c.once && Story.hasSeen(st.journeyId, c.comic)) continue;
        if (Story.pushComic(st.journeyId, c.comic)) return true;
      }
    }
  };
})();
