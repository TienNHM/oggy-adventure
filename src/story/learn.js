/* OG.Learn — thẻ kiến thức (trang sách), Sổ tay khám phá, câu đố mở cửa.
 * Chủ sở hữu v2: agent story-ui (src/story/). Hợp đồng: docs/STORY.md mục 6.
 * Lưu: OG.Save.ns('learn') = { cards:{journeyId:{cardId:ngàyMở}}, quizzes:{journeyId:{quizId:{tries, passed}}} }
 * BẢN STUB: đầy đủ luồng (nhặt trang -> thẻ -> sổ tay; cổng câu đố chặn đường). GIỮ chữ ký API. */
(function () {
  'use strict';
  var OG = window.OG;
  var U = OG.util;
  var TAU = Math.PI * 2;
  var INK = '#17233d';

  function J() { return OG.Journeys; }
  function store() {
    var s = OG.Save.ns('learn');
    if (!s.cards || typeof s.cards !== 'object') s.cards = {};
    if (!s.quizzes || typeof s.quizzes !== 'object') s.quizzes = {};
    return s;
  }
  function cardsOf(jid) { var s = store(); return s.cards[jid] || (s.cards[jid] = {}); }
  function quizRec(jid, qid) {
    var s = store(), m = s.quizzes[jid] || (s.quizzes[jid] = {});
    return m[qid] || (m[qid] = { tries: 0, passed: false });
  }

  // Trang sách dự phòng (khi OG.Sprites.drawProp('page') chưa có): tờ giấy bay phấp phới có mặt cười.
  function drawPageFallback(ctx, x, y, t, faded) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(t * 3) * 0.15);
    ctx.globalAlpha *= faded ? 0.45 : 1;
    ctx.fillStyle = '#fffdf4'; ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(-13, -16); ctx.lineTo(8, -16); ctx.lineTo(14, -10); ctx.lineTo(14, 16); ctx.lineTo(-13, 16); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#9fb4c8'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-8, 6); ctx.lineTo(9, 6); ctx.moveTo(-8, 11); ctx.lineTo(6, 11); ctx.stroke();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(-4, -5, 1.8, 0, TAU); ctx.arc(4, -5, 1.8, 0, TAU); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, -3, 3, 0.3, Math.PI - 0.3); ctx.stroke();
    ctx.restore();
  }

  // Cổng câu đố dự phòng: khung cửa vàng + dấu "?" lớn (mở: cửa trượt lên).
  function drawGateFallback(ctx, x, floorY, t, open) {
    ctx.save();
    var h = 150, w = 46;
    ctx.fillStyle = '#f4d45b'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    U.roundRectPath(ctx, x - 6, floorY - h - 10, w + 12, h + 10, 10); ctx.fill(); ctx.stroke();
    if (!open) {
      ctx.fillStyle = '#7b6cf0'; U.roundRectPath(ctx, x, floorY - h, w, h, 8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.font = OG.font(38, 'bold'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('?', x + w / 2, floorY - h / 2 + Math.sin(t * 4) * 3);
    }
    ctx.restore();
  }

  var Learn = (OG.Learn = {
    init: function () {
      if (OG.Level && OG.Level.addHook) OG.Level.addHook(learnHook);
    },

    // ---- Thẻ kiến thức ----
    hasCard: function (journeyId, cardId) { return !!cardsOf(journeyId)[cardId]; },
    // Mở khoá thẻ. Trả true nếu là thẻ MỚI.
    unlockCard: function (journeyId, cardId) {
      if (!J().getCard(journeyId, cardId)) return false;
      var m = cardsOf(journeyId);
      if (m[cardId]) return false;
      m[cardId] = Date.now();
      OG.Save.commit();
      var c = Learn.count(journeyId);
      OG.Events.emit('card:unlock', { journeyId: journeyId, cardId: cardId, count: c.have, total: c.total });
      return true;
    },
    // [{card, unlocked}] theo thứ tự khai báo.
    listCards: function (journeyId, areaId) {
      return J().cardsOf(journeyId, areaId).map(function (c) { return { card: c, unlocked: Learn.hasCard(journeyId, c.id) }; });
    },
    count: function (journeyId) {
      var all = J().cardsOf(journeyId), have = 0;
      all.forEach(function (c) { if (Learn.hasCard(journeyId, c.id)) have++; });
      return { have: have, total: all.length };
    },
    // Mở thẻ (push scene 'card' lên trên scene hiện tại). opts: {isNew, from:'level'|'notebook', onClose}
    openCard: function (journeyId, cardId, opts) {
      opts = opts || {};
      OG.Events.emit('card:open', { journeyId: journeyId, cardId: cardId, from: opts.from || 'level' });
      OG.Scenes.push('card', { journeyId: journeyId, cardId: cardId, isNew: !!opts.isNew, onClose: opts.onClose || null });
    },
    openNotebook: function (journeyId, back, backParams) {
      OG.Events.emit('notebook:open', { journeyId: journeyId });
      OG.Scenes.go('notebook', { journeyId: journeyId, back: back || 'journeyMap', backParams: backParams || { journeyId: journeyId } });
    },

    // ---- Câu đố ----
    isQuizPassed: function (journeyId, quizId) { return !!quizRec(journeyId, quizId).passed; },
    // opts: {levelId, gateId, onPass, onClose}
    openQuiz: function (journeyId, quizId, opts) {
      opts = opts || {};
      OG.Events.emit('quiz:open', { journeyId: journeyId, quizId: quizId, levelId: opts.levelId || null, gateId: opts.gateId || null });
      OG.Scenes.push('quiz', { journeyId: journeyId, quizId: quizId, levelId: opts.levelId || null, gateId: opts.gateId || null, onPass: opts.onPass || null, onClose: opts.onClose || null });
    },
    // Ghi nhận câu trả lời. Trả {correct, tries, firstTry, hint, explain}. KHÔNG phạt khi sai.
    answerQuiz: function (journeyId, quizId, choice, ctx) {
      var q = J().getQuiz(journeyId, quizId);
      if (!q) return { correct: false, tries: 0, hint: '', explain: '' };
      var rec = quizRec(journeyId, quizId);
      rec.tries++;
      var correct = choice === q.answer;
      var firstTry = correct && rec.tries === 1;
      if (correct) rec.passed = true;
      OG.Save.commit();
      OG.Events.emit('quiz:answer', { journeyId: journeyId, quizId: quizId, choice: choice, correct: correct, tries: rec.tries });
      if (correct) {
        OG.Events.emit('quiz:pass', { journeyId: journeyId, quizId: quizId, tries: rec.tries, firstTry: firstTry,
          levelId: ctx && ctx.levelId || null, gateId: ctx && ctx.gateId || null });
        if (q.cardId) Learn.unlockCard(journeyId, q.cardId);
      }
      return { correct: correct, tries: rec.tries, firstTry: firstTry, hint: q.hint || 'Gần đúng rồi! Thử lại nhé!', explain: q.explain || 'Chính xác!' };
    },

    // ---- Vẽ ----
    // Vẽ biểu tượng: fn(ctx,x,y,size,t) | {decor, opts} | {char} | {emoji} | 'emoji'. (x,y) = tâm.
    drawIcon: function (ctx, icon, x, y, size, t) {
      ctx.save();
      try {
        if (typeof icon === 'function') icon(ctx, x, y, size, t || 0);
        else if (icon && icon.decor) OG.Scenery.drawDecor(ctx, icon.decor, x, y + size * 0.4, size / 60, t || 0, icon.opts);
        else if (icon && icon.char && OG.Sprites.drawPortrait) OG.Sprites.drawPortrait(ctx, icon.char, x, y, size, {});
        else if (icon && (icon.emoji || typeof icon === 'string')) {
          ctx.font = (size * 0.8 | 0) + 'px ' + OG.FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(icon.emoji || icon, x, y);
        } else drawPageFallback(ctx, x, y, t || 0, false);
      } catch (e) {
        drawPageFallback(ctx, x, y, t || 0, false);
      }
      ctx.restore();
    },
    drawCardIcon: function (ctx, card, x, y, size, t) { Learn.drawIcon(ctx, card && (card.drawIcon || card.icon), x, y, size, t); },
    drawPage: function (ctx, x, y, t, opts) {
      if (OG.Sprites.drawProp && OG.Sprites.drawProp(ctx, 'page', x, y, t, opts || {})) return;
      drawPageFallback(ctx, x, y, t, opts && opts.collected);
    },
    drawGate: function (ctx, x, floorY, t, open) {
      if (OG.Sprites.drawProp && OG.Sprites.drawProp(ctx, 'gate', x, floorY, t, { open: open })) return;
      drawGateFallback(ctx, x, floorY, t, open);
    }
  });

  // ===========================================================================
  // Level hook: trang sách + cổng câu đố
  // ===========================================================================
  var learnHook = {
    id: 'learn', order: 20,
    enter: function (st) {
      if (!st.journeyId) { st.learn = null; return; }
      var jid = st.journeyId;
      st.learn = {
        pages: (st.level.pages || []).map(function (p) { return { card: p.card, x: p.x, y: p.y, got: false, had: Learn.hasCard(jid, p.card), bob: Math.random() * 6 }; }),
        gates: (st.level.quizGates || []).map(function (g) { return { id: g.id, quiz: g.quiz, x: g.x, open: false }; }),
        cooldown: 0
      };
      OG.Game.hud.pages = { have: 0, total: st.learn.pages.length };
    },

    update: function (st, dt, p) {
      var L = st.learn;
      if (!L) return;
      L.cooldown = Math.max(0, L.cooldown - dt);
      var cx = p.x + p.w / 2, cy = p.y + p.h / 2;
      // Trang sách
      for (var i = 0; i < L.pages.length; i++) {
        var pg = L.pages[i];
        if (pg.got || Math.abs(cx - pg.x) > 30 || Math.abs(cy - pg.y) > 40) continue;
        pg.got = true;
        var isNew = Learn.unlockCard(st.journeyId, pg.card);
        OG.Game.hud.pages = { have: L.pages.filter(function (q) { return q.got; }).length, total: L.pages.length };
        OG.Game.addScore(50);
        OG.Events.emit('page:collect', { journeyId: st.journeyId, levelId: st.level.id, cardId: pg.card, x: pg.x, y: pg.y, isNew: isNew });
        if (isNew) { Learn.openCard(st.journeyId, pg.card, { isNew: true, from: 'level' }); return true; }
        OG.Particles.floatText(pg.x, pg.y - 20, 'Đã có trong Sổ tay 📒', '#52c5ee');
      }
      // Cổng câu đố giữa màn: chặn như bức tường cho tới khi trả lời đúng.
      for (var k = 0; k < L.gates.length; k++) {
        var g = L.gates[k];
        if (g.open || g.x === 'exit') continue;
        if (p.x + p.w > g.x - 4) {
          p.x = g.x - 4 - p.w;
          if (L.cooldown <= 0) { L.cooldown = 1.2; openGate(st, g); return true; }
        }
      }
    },

    canExit: function (st, p) {
      var L = st.learn;
      if (!L) return true;
      for (var k = 0; k < L.gates.length; k++) {
        var g = L.gates[k];
        if (g.open || g.x !== 'exit') continue;
        p.x = Math.min(p.x, st.exit.x - p.w - 2); // lùi lại trước cửa
        if (L.cooldown <= 0) { L.cooldown = 1.2; openGate(st, g); }
        return false;
      }
      return true;
    },

    drawWorld: function (ctx, st, t) {
      var L = st.learn;
      if (!L) return;
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
          ctx.save();
          ctx.fillStyle = '#7b6cf0'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(st.exit.x + 24, OG.FLOOR_Y - 175 + Math.sin(t * 4) * 3, 16, 0, TAU); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#fff'; ctx.font = OG.font(20, 'bold'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('?', st.exit.x + 24, OG.FLOOR_Y - 174 + Math.sin(t * 4) * 3);
          ctx.restore();
        } else Learn.drawGate(ctx, g.x, OG.FLOOR_Y, t, g.open);
      }
    },

    drawScreen: function (ctx, st) {
      var L = st.learn;
      if (!L || !L.pages.length) return;
      var have = L.pages.filter(function (q) { return q.got; }).length;
      ctx.save();
      ctx.fillStyle = 'rgba(23,35,61,0.85)'; ctx.strokeStyle = '#fff4d6'; ctx.lineWidth = 2;
      U.roundRectPath(ctx, 14, 58, 104, 30, 15); ctx.fill(); ctx.stroke();
      Learn.drawPage(ctx, 34, 73, 0, {});
      ctx.fillStyle = '#fff'; ctx.font = OG.font(16, 'bold'); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(have + '/' + L.pages.length, 56, 74);
      ctx.restore();
    }
  };

  function openGate(st, g) {
    Learn.openQuiz(st.journeyId, g.quiz, {
      levelId: st.level.id, gateId: g.id,
      onPass: function () {
        g.open = true;
        OG.Events.emit('gate:open', { levelId: st.level.id, gateId: g.id, quizId: g.quiz, x: g.x === 'exit' ? st.exit.x : g.x });
      }
    });
  }

  Learn._drawPageFallback = drawPageFallback;
})();
