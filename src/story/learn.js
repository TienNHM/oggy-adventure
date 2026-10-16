/* OG.Learn — thẻ kiến thức (trang sách), Sổ tay khám phá, câu đố mở cửa.
 * Chủ sở hữu v2: agent story-ui (src/story/). Hợp đồng: docs/STORY.md mục 6.3.
 * Lưu: OG.Save.ns('learn') = { cards:{journeyId:{cardId:ngàyMở}}, quizzes:{journeyId:{quizId:{tries, passed}}} }
 *
 * Trong màn (level hook 'learn'):
 *   - Trang sách bay lơ lửng: chạm vào -> +50 điểm, thẻ MỚI thì push scene 'card', thẻ đã có thì chữ nổi.
 *   - Cổng câu đố giữa màn chặn như bức tường; cổng ở EXIT chặn sau khi đủ pizza. Trả lời đúng -> cổng mở.
 *   - Thẻ mở khoá ngoài trang sách (người dẫn đường) -> thông báo nhỏ trượt vào góc phải. */
(function () {
  'use strict';
  var OG = window.OG;
  var U = OG.util;
  var TAU = Math.PI * 2;
  var INK = '#17233d';

  function J() { return OG.Journeys; }
  function ui() { return OG.Story && OG.Story.ui; }
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
  function font(px, w) { return OG.font(px, w || 'bold'); }

  // ---------------------------------------------------------------------------
  // Hình dự phòng
  // ---------------------------------------------------------------------------
  // Trang sách (khi OG.Sprites.drawProp('page') chưa có): tờ giấy bay phấp phới có mặt cười + cánh nhỏ.
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
    // cánh
    var flap = Math.sin(t * 12) * 0.5;
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
    [-1, 1].forEach(function (s) {
      ctx.save(); ctx.scale(s, 1); ctx.rotate(flap * 0.6);
      ctx.beginPath(); ctx.ellipse(18, -8, 10, 5, -0.5, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.restore();
    });
    ctx.fillStyle = '#fffdf4'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(-13, -16); ctx.lineTo(8, -16); ctx.lineTo(14, -10); ctx.lineTo(14, 16); ctx.lineTo(-13, 16); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#9fb4c8'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-8, 7); ctx.lineTo(9, 7); ctx.moveTo(-8, 11); ctx.lineTo(6, 11); ctx.stroke();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(-4, -5, 1.9, 0, TAU); ctx.arc(4, -5, 1.9, 0, TAU); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(0, -3, 3.2, 0.3, Math.PI - 0.3); ctx.stroke();
    ctx.fillStyle = '#f29bb8'; ctx.beginPath(); ctx.arc(-8, -1, 2, 0, TAU); ctx.arc(8, -1, 2, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // Cổng câu đố dự phòng: khung cửa vàng + cánh cửa tím có dấu "?" và mặt cười (mở: cửa trượt lên).
  function drawGateFallback(ctx, x, floorY, t, open) {
    ctx.save();
    var h = 150, w = 46;
    ctx.lineJoin = 'round';
    ctx.fillStyle = '#f4d45b'; ctx.strokeStyle = INK; ctx.lineWidth = 3.5;
    U.roundRectPath(ctx, x - 8, floorY - h - 14, w + 16, h + 14, 12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#2b3a5c'; U.roundRectPath(ctx, x, floorY - h, w, h, 8); ctx.fill();
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
  // Thông báo "Thẻ mới" trượt vào góc phải (trong màn)
  // ---------------------------------------------------------------------------
  var toasts = []; // {jid, cardId, t}
  var TOAST_DUR = 3.2;
  function drawToasts(ctx) {
    if (!toasts.length) return;
    var tt = toasts[0], c = J().getCard(tt.jid, tt.cardId);
    if (!c) { toasts.shift(); return; }
    var k = tt.t < 0.3 ? ui().easeOutBack(tt.t / 0.3) : tt.t > TOAST_DUR - 0.3 ? (TOAST_DUR - tt.t) / 0.3 : 1;
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
    init: function () {
      if (OG.Level && OG.Level.addHook) OG.Level.addHook(learnHook);
      OG.Events.on('scene:change', function (e) { if (e && !e.push && !e.pop && e.to !== 'level') toasts.length = 0; });
    },

    // ---- Thẻ kiến thức ----
    hasCard: function (journeyId, cardId) { return !!cardsOf(journeyId)[cardId]; },
    // Mở khoá thẻ. Trả true nếu là thẻ MỚI. opts.silent = không hiện thông báo góc màn hình.
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
    // Hiện thông báo "Thẻ mới" (chỉ thấy khi đang ở trong màn).
    toastCard: function (journeyId, cardId) {
      if (toasts.length < 4) toasts.push({ jid: journeyId, cardId: cardId, t: 0 });
    },
    // [{card, unlocked}] theo thứ tự khai báo.
    listCards: function (journeyId, areaId) {
      return J().cardsOf(journeyId, areaId).map(function (c) { return { card: c, unlocked: Learn.hasCard(journeyId, c.id) }; });
    },
    count: function (journeyId, areaId) {
      var all = J().cardsOf(journeyId, areaId), have = 0;
      all.forEach(function (c) { if (Learn.hasCard(journeyId, c.id)) have++; });
      return { have: have, total: all.length };
    },
    // Nơi tìm thẻ (để Sổ tay gợi ý): {levelId, levelName, kind:'page'|'quiz'|'guide'} | null
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
    // Ghi nhận câu trả lời. Trả {correct, tries, firstTry, hint, explain, cardUnlocked}. KHÔNG phạt khi sai.
    // `tries` đếm trong lần mở câu đố này (ctx.attempt do scene quiz truyền) hoặc tổng nếu không có.
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
    // Vẽ biểu tượng: fn(ctx,x,y,size,t) | {decor, opts} | {char} | {emoji} | 'emoji'. (x,y) = tâm, size = cạnh ô.
    drawIcon: function (ctx, icon, x, y, size, t) {
      ctx.save();
      try {
        if (typeof icon === 'function') icon(ctx, x, y, size, t || 0);
        else if (icon && icon.decor) {
          if (!OG.Scenery || !OG.Scenery.drawDecor) throw new Error('no scenery');
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
        ctx.restore(); ctx.save();
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
  function pagesHave(L) { var n = 0; L.pages.forEach(function (q) { if (q.got) n++; }); return n; }

  var learnHook = {
    id: 'learn', order: 20,
    enter: function (st) {
      if (!st.journeyId) { st.learn = null; return; }
      var jid = st.journeyId;
      st.learn = {
        pages: (st.level.pages || []).map(function (p) {
          return { card: p.card, x: p.x, y: p.y, got: false, had: Learn.hasCard(jid, p.card), bob: Math.random() * 6 };
        }),
        // Cổng hỏi lại mỗi lần vào màn (ôn tập).
        gates: (st.level.quizGates || []).map(function (g) { return { id: g.id, quiz: g.quiz, x: g.x, open: false, openT: -1 }; }),
        cooldown: 0
      };
      OG.Game.hud.pages = { have: 0, total: st.learn.pages.length };
    },

    update: function (st, dt, p) {
      toasts.forEach(function (x, i) { if (i === 0) x.t += dt; });
      if (toasts.length && toasts[0].t > TOAST_DUR) toasts.shift();
      if (ui()) ui().fx.update(dt);
      var L = st.learn;
      if (!L) return;
      L.cooldown = Math.max(0, L.cooldown - dt);
      L.gates.forEach(function (g) { if (g.openT >= 0) g.openT += dt; });
      var cx = p.x + p.w / 2, cy = p.y + p.h / 2;
      // Trang sách (vùng nhặt rộng rãi cho bé)
      for (var i = 0; i < L.pages.length; i++) {
        var pg = L.pages[i];
        if (pg.got || Math.abs(cx - pg.x) > 32 || Math.abs(cy - pg.y) > 44) continue;
        pg.got = true;
        var isNew = Learn.unlockCard(st.journeyId, pg.card, { silent: true });
        OG.Game.hud.pages = { have: pagesHave(L), total: L.pages.length };
        OG.Game.addScore(50);
        OG.Particles.spawn(pg.x, pg.y, { color: '#ffe27a', count: 14, shape: 'star' });
        OG.Particles.floatText(pg.x, pg.y - 26, '+50', '#ffc94a');
        OG.Events.emit('page:collect', { journeyId: st.journeyId, levelId: st.level.id, cardId: pg.card, x: pg.x, y: pg.y, isNew: isNew });
        if (isNew) { Learn.openCard(st.journeyId, pg.card, { isNew: true, from: 'level' }); return true; }
        OG.Particles.floatText(pg.x, pg.y - 48, 'Đã có trong Sổ tay 📒', '#52c5ee');
      }
      // Cổng câu đố giữa màn: chặn như bức tường cho tới khi trả lời đúng.
      for (var k = 0; k < L.gates.length; k++) {
        var g = L.gates[k];
        if (g.open || g.x === 'exit') continue;
        if (p.x + p.w > g.x - 4 && p.x < g.x + 50) {
          p.x = g.x - 4 - p.w;
          if (p.vx > 0) p.vx = 0;
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
        if (g.open && g.openT > 1.2) continue; // cổng đã mở hẳn: biến mất
        ctx.save();
        if (g.open) ctx.globalAlpha = U.clamp(1 - (g.openT - 0.6) / 0.6, 0, 1);
        Learn.drawGate(ctx, g.x, OG.FLOOR_Y, t, g.open);
        ctx.restore();
        // Lại gần cổng đóng: bong bóng mời trả lời
        if (!g.open && ui() && Math.abs(px - g.x) < 220) {
          ui().drawBubble(ctx, g.x + 23, OG.FLOOR_Y - 172, '❓ Trả lời câu đố để mở cửa!', {
            size: 15, maxW: 230, bg: '#f1edff', bounds: { x: OG.Camera.x, y: 0, w: OG.W, h: OG.H } });
        }
      }
    },

    drawScreen: function (ctx, st) {
      var L = st.learn;
      if (L && L.pages.length) {
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

  Learn._drawPageFallback = drawPageFallback;
  Learn._drawGateFallback = drawGateFallback;
})();
