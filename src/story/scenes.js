/* Scene của hệ thống Hành trình v2:
 *   journeySelect · journeyMap · comic · card · quiz · notebook · journeyEnd
 * Chủ sở hữu v2: agent story-ui (src/story/). Hợp đồng (params, phím, event): docs/STORY.md mục 6.
 * BẢN STUB: chạy được, giao diện đơn giản. Agent story-ui làm đẹp nhưng GIỮ tên scene, params và phím. */
(function () {
  'use strict';
  var OG = window.OG;
  var U = OG.util;
  var TAU = Math.PI * 2;
  var INK = '#17233d';

  function J() { return OG.Journeys; }
  function ui() { return OG.Story.ui; }
  function esc(s) { return U.escapeHtml(s); }
  function I() { return OG.Input; }
  function tapped() { return I().pointer.justPressed; }
  function pt() { return I().pointer; }
  function backPressed() {
    if (I().pressed('back') || I().pressed('pause')) { I().consume('back'); I().consume('pause'); return true; }
    return false;
  }

  // Gắn click cho mọi [data-act] trong panel DOM.
  function bindActs(panel, handlers) {
    var els = panel.querySelectorAll('[data-act]');
    for (var i = 0; i < els.length; i++) {
      (function (el) {
        el.addEventListener('click', function () {
          var act = el.getAttribute('data-act'), arg = el.getAttribute('data-arg');
          OG.Events.emit('ui:click', { id: act + (arg ? ':' + arg : '') });
          if (handlers[act]) handlers[act](arg, el);
        });
      })(els[i]);
    }
  }

  function backdrop(ctx, theme) {
    OG.Sprites.drawBackground(ctx, theme || 'garden', OG.time * 20, OG.time);
    ctx.fillStyle = 'rgba(16,25,43,0.35)'; ctx.fillRect(0, 0, OG.W, OG.H);
  }
  function firstTheme(jid) {
    var j = J().get(jid);
    return (j && j.areas[0] && j.areas[0].sceneryTheme) || 'garden';
  }

  // ===========================================================================
  // journeySelect — chọn hành trình + độ khó.  params: {back}
  // ===========================================================================
  var journeySelect = {
    enter: function (params) {
      this.back = (params && params.back) || 'menu';
      OG.DOM.setHudVisible(false);
      OG.DOM.setControlsVisible(false);
      this.render();
    },
    render: function () {
      var self = this;
      var list = J().list().filter(function (j) { return !j.invalid; });
      var html = '<div class="story-journeys">' + list.map(function (j) {
        var pr = J().progress(j.id), c = OG.Learn.count(j.id);
        return '<button type="button" class="story-journey" data-act="journey" data-arg="' + esc(j.id) + '">' +
          '<span class="story-emoji">' + esc(j.emoji) + '</span>' +
          '<b>' + esc(j.title) + '</b><small>' + esc(j.description) + '</small>' +
          '<small class="story-prog">🏁 ' + pr.levelsDone + '/' + pr.levels + ' · 📒 ' + c.have + '/' + c.total + '</small></button>';
      }).join('') + '</div>';
      var diff = OG.Difficulty ? OG.Difficulty.label() : '';
      var panel = OG.DOM.panel({
        title: 'CHỌN HÀNH TRÌNH',
        className: 'story-panel',
        html: html,
        buttons: [
          { id: 'story_diff', label: 'Độ khó: ' + diff, secondary: true, onClick: function () { U.call('Difficulty', 'toggle'); self.render(); } },
          { id: 'story_back', label: '↩ Quay lại', secondary: true, onClick: function () { OG.Scenes.go(self.back); } }
        ]
      });
      bindActs(panel, { journey: function (id) { OG.Story.startJourney(id); } });
    },
    exit: function () { OG.DOM.hidePanel(); },
    update: function () { if (backPressed()) OG.Scenes.go(this.back); },
    draw: function (ctx) { backdrop(ctx, 'garden'); }
  };

  // ===========================================================================
  // journeyMap — các khu & màn của 1 hành trình.  params: {journeyId, completed?, result?}
  // ===========================================================================
  var journeyMap = {
    enter: function (params) {
      params = params || {};
      this.jid = params.journeyId || OG.Story.current() || OG.Story.lastJourney();
      var j = J().get(this.jid);
      OG.DOM.setHudVisible(false);
      OG.DOM.setControlsVisible(false);
      if (!j) { OG.Scenes.go('journeySelect'); return; }
      if (!OG.Game.run || OG.Game.run.over || OG.Game.run.journeyId !== this.jid) OG.Game.newRun({ journeyId: this.jid });
      if (params.completed) OG.DOM.toast('Giỏi quá! Hoàn thành màn 🎉');
      this.render();
    },
    render: function () {
      var jid = this.jid, j = J().get(jid);
      var next = J().firstIncomplete(jid);
      var html = j.areas.map(function (a) {
        var lv = J().levelsOf(jid).filter(function (l) { return l.areaId === a.id; });
        return '<div class="story-area"><h3>' + esc(a.emoji || '📍') + ' ' + esc(a.name) + (J().isAreaDone(jid, a.id) ? ' ✅' : '') + '</h3>' +
          lv.map(function (l, i) {
            var open = J().isLevelUnlocked(l.id), done = OG.Progress.isCompleted(l.id);
            return '<button type="button" class="' + (open ? '' : 'secondary') + '" data-act="level" data-arg="' + esc(l.id) + '"' + (open ? '' : ' disabled') + '>' +
              (done ? '⭐ ' : open ? '▶ ' : '🔒 ') + esc(l.name || ('Màn ' + (i + 1))) + '</button>';
          }).join('') + '</div>';
      }).join('');
      var c = OG.Learn.count(jid);
      var panel = OG.DOM.panel({
        title: esc(j.emoji) + ' ' + esc(j.title),
        className: 'story-panel',
        html: '<div class="story-map">' + html + '</div>',
        buttons: [
          { id: 'story_play', label: '▶ CHƠI TIẾP', primary: true, onClick: function () { OG.Story.playLevel(next); } },
          { id: 'story_notebook', label: '📒 Sổ tay ' + c.have + '/' + c.total, secondary: true, onClick: function () { OG.Learn.openNotebook(jid, 'journeyMap', { journeyId: jid }); } },
          { id: 'story_select', label: '↩ Hành trình khác', secondary: true, onClick: function () { OG.Scenes.go('journeySelect'); } }
        ]
      });
      bindActs(panel, { level: function (id) { if (J().isLevelUnlocked(id)) OG.Story.playLevel(id); } });
    },
    exit: function () { OG.DOM.hidePanel(); },
    update: function () { if (backPressed()) OG.Scenes.go('journeySelect'); },
    draw: function (ctx) { backdrop(ctx, firstTheme(this.jid)); }
  };

  // ===========================================================================
  // comic — truyện tranh dạng khung.  params: {journeyId, comicId, onDone?, overlay?}
  //   Lướt: chạm / Enter / Space / E / →.  Bỏ qua: Esc hoặc nút "Bỏ qua ⏭".
  //   overlay:true = được push lên màn đang chơi, tự pop khi xong.
  // ===========================================================================
  var FRAME = { x: 40, y: 28, w: 880, h: 430 };
  var SKIP = { x: 820, y: 476, w: 120, h: 44 };
  var comic = {
    drawBelow: false,
    enter: function (params) {
      this.p = params || {};
      this.panels = J().getComic(this.p.journeyId, this.p.comicId) || [];
      this.i = 0; this.t = 0; this.done = false;
      OG.DOM.hidePanel();
      OG.DOM.setHudVisible(false);
      OG.DOM.setControlsVisible(false);
      OG.Events.emit('comic:start', { journeyId: this.p.journeyId, comicId: this.p.comicId, panels: this.panels.length });
      if (!this.panels.length) this.finish(true);
    },
    finish: function (skipped) {
      if (this.done) return;
      this.done = true;
      OG.Story.markSeen(this.p.journeyId, this.p.comicId);
      OG.Events.emit('comic:end', { journeyId: this.p.journeyId, comicId: this.p.comicId, skipped: !!skipped });
      var cb = this.p.onDone;
      if (this.p.overlay) { OG.Scenes.pop(); if (cb) cb(); return; }
      if (cb) cb(); else OG.Scenes.go('journeyMap', { journeyId: this.p.journeyId });
    },
    resume: function () { OG.DOM.setHudVisible(false); },
    update: function (dt) {
      if (this.done) return;
      this.t += dt;
      if (backPressed() || (tapped() && ui().hit(SKIP, pt().x, pt().y))) { this.finish(true); return; }
      if (this.t > 0.25 && (ui().advancePressed() || tapped())) {
        this.i++; this.t = 0;
        if (this.i >= this.panels.length) this.finish(false);
      }
    },
    draw: function (ctx) {
      ctx.fillStyle = '#10192b'; ctx.fillRect(0, 0, OG.W, OG.H);
      var pn = this.panels[Math.min(this.i, this.panels.length - 1)];
      if (!pn) return;
      drawComicPanel(ctx, pn, FRAME, OG.time, Math.min(1, this.t / 0.25));
      // chấm tiến độ + gợi ý + nút bỏ qua
      for (var k = 0; k < this.panels.length; k++) {
        ctx.fillStyle = k === this.i ? '#ffc94a' : 'rgba(255,255,255,0.4)';
        ctx.beginPath(); ctx.arc(OG.W / 2 - (this.panels.length - 1) * 10 + k * 20, 486, 6, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = ui().font(15); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText('Chạm hoặc nhấn Enter để xem tiếp ▶', 40, 505);
      ui().drawButton(ctx, SKIP, 'Bỏ qua ⏭', { color: '#52b9df', shadow: '#2582aa', size: 16 });
    }
  };

  // Vẽ 1 khung truyện. pn: {bg, chars:[{id, anim, x, y?, face?, scale?}], bubbles:[{who, text}], caption?}
  function drawComicPanel(ctx, pn, F, t, appear) {
    ui().drawFrame(ctx, F.x, F.y, F.w, F.h, '#ffffff', 16);
    ctx.save();
    U.roundRectPath(ctx, F.x + 6, F.y + 6, F.w - 12, F.h - 12, 12); ctx.clip();
    ctx.translate(F.x + 6, F.y + 6);
    var sw = (F.w - 12) / OG.W, sh = (F.h - 12) / OG.H;
    ctx.save();
    ctx.scale(sw, sh);
    var bg = pn.bg;
    if (typeof bg === 'function') bg(ctx, 0, 0, OG.W, OG.H, t);
    else if (typeof bg === 'string' && bg.indexOf('color:') === 0) { ctx.fillStyle = bg.slice(6); ctx.fillRect(0, 0, OG.W, OG.H); }
    else {
      var theme = (bg && bg.theme) || bg || 'kitchen';
      OG.Sprites.drawBackground(ctx, theme, (bg && bg.camX) || 0, t);
      OG.Sprites.drawPlatform(ctx, { x: 0, y: 480, w: OG.W, h: 60, isFloor: true }, theme, t);
    }
    // Nhân vật: x 0..1 theo bề ngang khung; chân ở y (0..1, mặc định mặt sàn).
    var heads = {};
    (pn.chars || []).forEach(function (c) {
      var ch = OG.Data.getCharacter(c.id), sc = (c.scale || 1.8) * (0.85 + 0.15 * appear);
      var cx = (c.x == null ? 0.5 : c.x) * OG.W, cy = c.y == null ? OG.FLOOR_Y : c.y * OG.H;
      ctx.save(); ctx.translate(cx, cy);
      OG.Sprites.drawCharacter(ctx, c.id, c.anim || 'idle', t, { face: c.face || 1, scale: sc, w: ch.w, h: ch.h, time: t });
      ctx.restore();
      heads[c.id] = { x: cx * sw, y: (cy - ch.h * sc - 6) * sh };
    });
    ctx.restore();
    // Bong bóng thoại (toạ độ khung).
    (pn.bubbles || []).forEach(function (b, i) {
      var h = heads[b.who];
      var name = b.who && b.who !== 'narrator' ? (OG.Data.characters[b.who] ? OG.Data.getCharacter(b.who).name : null) : null;
      if (h) ui().drawBubble(ctx, h.x, h.y, b.text, { maxW: 330, size: 20, name: name });
      else ui().drawBubble(ctx, (F.w - 12) / 2, 14 + i * 70, b.text, { tail: 'none', maxW: 640, size: 20, bg: '#fff3c4' });
    });
    if (pn.caption) ui().drawBubble(ctx, (F.w - 12) / 2, F.h - 70, pn.caption, { tail: 'none', maxW: 700, size: 18, bg: '#fff3c4' });
    ctx.restore();
  }

  // ===========================================================================
  // card — thẻ kiến thức (push).  params: {journeyId, cardId, isNew, onClose?}
  //   Đóng: Enter / Space / E / Esc / chạm (sau 0,35 giây).
  // ===========================================================================
  var card = {
    drawBelow: true,
    enter: function (params) { this.p = params || {}; this.t = 0; this.c = J().getCard(this.p.journeyId, this.p.cardId); },
    update: function (dt) {
      this.t += dt;
      if (this.t < 0.35) return;
      if (backPressed() || ui().advancePressed() || tapped()) {
        var cb = this.p.onClose;
        OG.Scenes.pop();
        if (cb) cb();
      }
    },
    draw: function (ctx) {
      ctx.fillStyle = 'rgba(16,25,43,0.6)'; ctx.fillRect(0, 0, OG.W, OG.H);
      var c = this.c;
      if (!c) return;
      var k = Math.min(1, this.t / 0.25), w = 560, h = 380, x = (OG.W - w) / 2, y = (OG.H - h) / 2 + (1 - k) * 40;
      ctx.save();
      ctx.globalAlpha = k;
      ui().drawFrame(ctx, x, y, w, h, '#fff6df', 22);
      if (this.p.isNew) ui().drawButton(ctx, { x: x + w - 190, y: y - 18, w: 170, h: 36 }, 'MỚI! 📒', { color: '#3fbf6f', shadow: '#2b8c4f', size: 16 });
      OG.Learn.drawCardIcon(ctx, c, x + 110, y + 140, 130, OG.time);
      ctx.fillStyle = '#ed713c'; ctx.font = ui().font(28); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      var tl = ui().wrap(ctx, c.title, w - 230);
      tl.forEach(function (l, i) { ctx.fillText(l, x + 200, y + 40 + i * 34); });
      ctx.fillStyle = INK; ctx.font = ui().font(20, '600');
      ui().wrap(ctx, c.fact, w - 230).forEach(function (l, i) { ctx.fillText(l, x + 200, y + 50 + tl.length * 34 + i * 27); });
      ctx.font = ui().font(15); ctx.fillStyle = 'rgba(23,35,61,0.6)'; ctx.textAlign = 'center';
      ctx.fillText(this.p.isNew ? 'Đã thêm vào Sổ tay khám phá! Chạm để chơi tiếp ▶' : 'Chạm để đóng', x + w / 2, y + h - 34);
      ctx.restore();
    }
  };

  // ===========================================================================
  // quiz — câu đố mở cửa (push).  params: {journeyId, quizId, levelId, gateId, onPass?, onClose?}
  //   Chọn: ←/→ (hoặc ↑/↓) + Enter/Space/E, hoặc chạm vào đáp án. Lựa chọn bắt đầu ở 0.
  //   Sai: gợi ý thân thiện, gạch lựa chọn đó, thử lại (KHÔNG phạt). Đúng: lời giải thích -> chạm/Enter để đi tiếp.
  //   Esc: "Để sau" (đóng, cổng vẫn khoá).
  // ===========================================================================
  var quiz = {
    drawBelow: true,
    enter: function (params) {
      this.p = params || {};
      this.q = J().getQuiz(this.p.journeyId, this.p.quizId);
      this.sel = 0; this.t = 0; this.wrong = {}; this.msg = null; this.passed = false; this.rects = [];
      if (!this.q) { OG.Scenes.pop(); }
    },
    choose: function (i) {
      if (this.passed || this.wrong[i]) return;
      var r = OG.Learn.answerQuiz(this.p.journeyId, this.p.quizId, i, { levelId: this.p.levelId, gateId: this.p.gateId });
      if (r.correct) { this.passed = true; this.msg = r.explain; this.t = 0; }
      else { this.wrong[i] = true; this.msg = r.hint; }
    },
    update: function (dt) {
      this.t += dt;
      var n = this.q.choices.length, inp = I();
      if (this.passed) {
        if (this.t > 0.4 && (ui().advancePressed() || tapped() || backPressed())) {
          var cb = this.p.onPass;
          OG.Scenes.pop();
          if (cb) cb();
        }
        return;
      }
      if (backPressed()) { var cc = this.p.onClose; OG.Scenes.pop(); if (cc) cc(); return; }
      if (inp.pressed('left') || inp.pressed('up')) this.sel = (this.sel + n - 1) % n;
      if (inp.pressed('right') || inp.pressed('down')) this.sel = (this.sel + 1) % n;
      if (inp.pressed('confirm') || inp.pressed('jump') || inp.pressed('action')) this.choose(this.sel);
      if (tapped()) {
        for (var i = 0; i < this.rects.length; i++) if (ui().hit(this.rects[i], pt().x, pt().y)) { this.sel = i; this.choose(i); }
      }
    },
    draw: function (ctx) {
      ctx.fillStyle = 'rgba(16,25,43,0.6)'; ctx.fillRect(0, 0, OG.W, OG.H);
      var q = this.q;
      if (!q) return;
      var F = { x: 90, y: 30, w: 780, h: 480 };
      ui().drawFrame(ctx, F.x, F.y, F.w, F.h, '#fff6df', 22);
      ctx.fillStyle = '#7b6cf0'; ctx.font = ui().font(18); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('❓ CÂU ĐỐ MỞ CỬA', OG.W / 2, F.y + 16);
      ctx.fillStyle = INK; ctx.font = ui().font(26);
      ui().wrap(ctx, q.question, F.w - 80).forEach(function (l, i) { ctx.fillText(l, OG.W / 2, F.y + 48 + i * 32); });
      var n = q.choices.length, cw = 200, gap = 30, x0 = OG.W / 2 - (n * cw + (n - 1) * gap) / 2, cy = F.y + 140;
      this.rects = [];
      for (var i = 0; i < n; i++) {
        var r = { x: x0 + i * (cw + gap), y: cy, w: cw, h: 200 }, ch = q.choices[i];
        this.rects.push(r);
        var right = this.passed && i === q.answer, bad = this.wrong[i];
        ctx.save();
        ctx.globalAlpha = bad ? 0.45 : 1;
        ui().drawFrame(ctx, r.x, r.y, r.w, r.h, right ? '#c9f2d4' : i === this.sel ? '#ffe7a6' : '#ffffff', 16);
        if (i === this.sel && !this.passed) { ctx.strokeStyle = '#f27a43'; ctx.lineWidth = 5; U.roundRectPath(ctx, r.x - 4, r.y - 4, r.w + 8, r.h + 8, 18); ctx.stroke(); }
        OG.Learn.drawIcon(ctx, ch.drawIcon || ch.icon, r.x + r.w / 2, r.y + 75, 90, OG.time);
        ctx.fillStyle = INK; ctx.font = ui().font(19); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ui().wrap(ctx, ch.text, r.w - 20).forEach(function (l, k) { ctx.fillText(l, r.x + r.w / 2, r.y + 135 + k * 23); });
        if (bad) { ctx.strokeStyle = '#e5484d'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(r.x + 30, r.y + 30); ctx.lineTo(r.x + r.w - 30, r.y + r.h - 30); ctx.stroke(); }
        ctx.restore();
      }
      if (this.msg) {
        var g = OG.Guide.guideOf(this.p.journeyId);
        if (OG.Sprites.drawPortrait) OG.Sprites.drawPortrait(ctx, g.charId, F.x + 60, F.y + F.h - 60, 76, {});
        ui().drawBubble(ctx, F.x + 110, F.y + F.h - 108, (this.passed ? '🎉 ' : '💡 ') + this.msg, { tail: 'none', anchor: 'left', maxW: 560, size: 19, name: g.name, bg: this.passed ? '#e2f8e8' : '#ffffff' });
      } else {
        ctx.fillStyle = 'rgba(23,35,61,0.6)'; ctx.font = ui().font(15); ctx.textAlign = 'center';
        ctx.fillText('Chọn bằng ← → rồi nhấn Enter, hoặc chạm vào đáp án · Esc: để sau', OG.W / 2, F.y + F.h - 40);
      }
    }
  };

  // ===========================================================================
  // notebook — Sổ tay khám phá.  params: {journeyId, back, backParams}
  //   ←/→/↑/↓ chọn, Enter mở thẻ đã có, Esc quay lại. Chạm: chọn/mở; nút "↩" góc trái.
  // ===========================================================================
  var COLS = 5, CW = 160, CH = 118, GX = 16, GY = 14;
  var notebook = {
    enter: function (params) {
      this.p = params || {};
      this.jid = this.p.journeyId || OG.Story.current() || OG.Story.lastJourney();
      this.list = OG.Learn.listCards(this.jid);
      this.sel = 0; this.rects = [];
      OG.DOM.hidePanel();
      OG.DOM.setHudVisible(false);
      OG.DOM.setControlsVisible(false);
    },
    resume: function () { this.list = OG.Learn.listCards(this.jid); },
    goBack: function () { OG.Scenes.go(this.p.back || 'journeyMap', this.p.backParams || { journeyId: this.jid }); },
    open: function (i) {
      var it = this.list[i];
      if (it && it.unlocked) OG.Learn.openCard(this.jid, it.card.id, { from: 'notebook' });
      else OG.DOM.toast('Hãy tìm trang sách này trong màn chơi nhé! 🔎');
    },
    update: function () {
      var n = this.list.length, inp = I();
      if (backPressed()) { this.goBack(); return; }
      if (!n) return;
      if (inp.pressed('left')) this.sel = (this.sel + n - 1) % n;
      if (inp.pressed('right')) this.sel = (this.sel + 1) % n;
      if (inp.pressed('up')) this.sel = Math.max(0, this.sel - COLS);
      if (inp.pressed('down')) this.sel = Math.min(n - 1, this.sel + COLS);
      if (inp.pressed('confirm') || inp.pressed('action')) this.open(this.sel);
      if (tapped()) {
        if (ui().hit({ x: 20, y: 20, w: 60, h: 44 }, pt().x, pt().y)) { this.goBack(); return; }
        for (var i = 0; i < this.rects.length; i++) if (this.rects[i] && ui().hit(this.rects[i], pt().x, pt().y)) { this.sel = i; this.open(i); }
      }
    },
    draw: function (ctx) {
      var j = J().get(this.jid);
      backdrop(ctx, firstTheme(this.jid));
      ui().drawFrame(ctx, 10, 10, OG.W - 20, OG.H - 20, '#fff6df', 22);
      ui().drawButton(ctx, { x: 20, y: 20, w: 60, h: 44 }, '↩', { color: '#52b9df', shadow: '#2582aa' });
      var c = OG.Learn.count(this.jid);
      ctx.fillStyle = '#ed713c'; ctx.font = ui().font(28); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('📒 Sổ tay khám phá' + (j ? ' — ' + j.title : ''), OG.W / 2, 44);
      ctx.fillStyle = INK; ctx.font = ui().font(16);
      ctx.fillText('Đã sưu tầm ' + c.have + '/' + c.total + ' thẻ', OG.W / 2, 76);
      var x0 = (OG.W - (COLS * CW + (COLS - 1) * GX)) / 2, row = Math.floor(this.sel / COLS), first = Math.max(0, row - 2) * COLS;
      this.rects = [];
      for (var i = first; i < Math.min(this.list.length, first + COLS * 3); i++) {
        var k = i - first, r = { x: x0 + (k % COLS) * (CW + GX), y: 100 + Math.floor(k / COLS) * (CH + GY), w: CW, h: CH };
        this.rects[i] = r;
        var it = this.list[i];
        ui().drawFrame(ctx, r.x, r.y, r.w, r.h, it.unlocked ? '#ffffff' : '#d8dde6', 14);
        if (i === this.sel) { ctx.strokeStyle = '#f27a43'; ctx.lineWidth = 5; U.roundRectPath(ctx, r.x - 4, r.y - 4, r.w + 8, r.h + 8, 16); ctx.stroke(); }
        if (it.unlocked) {
          OG.Learn.drawCardIcon(ctx, it.card, r.x + r.w / 2, r.y + 46, 58, OG.time);
          ctx.fillStyle = INK; ctx.font = ui().font(14); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(ui().wrap(ctx, it.card.title, r.w - 12)[0] || '', r.x + r.w / 2, r.y + r.h - 18);
        } else {
          ctx.fillStyle = 'rgba(23,35,61,0.35)'; ctx.font = ui().font(44); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('?', r.x + r.w / 2, r.y + r.h / 2);
        }
      }
    }
  };

  // ===========================================================================
  // journeyEnd — kết thúc hành trình.  params: {journeyId}
  // ===========================================================================
  var journeyEnd = {
    enter: function (params) {
      var jid = this.jid = (params && params.journeyId) || OG.Story.lastJourney();
      var j = J().get(jid) || {}, c = OG.Learn.count(jid);
      var end = (typeof j.ending === 'object' && j.ending) || {};
      OG.DOM.setHudVisible(false);
      OG.DOM.setControlsVisible(false);
      OG.DOM.panel({
        title: esc(end.title || 'HOÀN THÀNH! 🎉'),
        className: 'story-panel',
        html: '<p>' + esc(end.text || ('Bạn đã đi hết hành trình ' + (j.title || '') + '!')) + '</p><p>📒 Thẻ kiến thức: ' + c.have + '/' + c.total + '</p>',
        buttons: [
          { id: 'end_notebook', label: '📒 Xem Sổ tay', primary: true, onClick: function () { OG.Learn.openNotebook(jid, 'journeyEnd', { journeyId: jid }); } },
          { id: 'end_map', label: '🗺️ Bản đồ hành trình', secondary: true, onClick: function () { OG.Scenes.go('journeyMap', { journeyId: jid }); } },
          { id: 'end_menu', label: '🏠 Về menu', secondary: true, onClick: function () { OG.Scenes.go('menu'); } }
        ]
      });
    },
    exit: function () { OG.DOM.hidePanel(); },
    update: function () { if (backPressed()) OG.Scenes.go('menu'); },
    draw: function (ctx) { backdrop(ctx, firstTheme(this.jid)); }
  };

  // Đăng ký ngay lúc load (agent story-ui có thể đăng ký lại trong init()).
  OG.Scenes.register('journeySelect', journeySelect);
  OG.Scenes.register('journeyMap', journeyMap);
  OG.Scenes.register('comic', comic);
  OG.Scenes.register('card', card);
  OG.Scenes.register('quiz', quiz);
  OG.Scenes.register('notebook', notebook);
  OG.Scenes.register('journeyEnd', journeyEnd);

  OG.Story.drawComicPanel = drawComicPanel;
})();
