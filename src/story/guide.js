/* OG.Guide — nhân vật DẪN ĐƯỜNG trong màn (Olivia, Bob, Giáo sư Cú, Rô-bốt Bíp...).
 * Đến gần (hoặc chạm vào) NPC -> bong bóng giải thích ngắn; nhấn E/✦ để nghe câu tiếp theo.
 * Chủ sở hữu v2: agent story-ui (src/story/). Hợp đồng: docs/STORY.md mục 6.
 * BẢN STUB: GIỮ chữ ký API. */
(function () {
  'use strict';
  var OG = window.OG;
  var U = OG.util;
  var TALK_RANGE = 90; // px quanh NPC

  var sayMsg = null; // {text, t, dur, charId, name}

  function guideOf(journeyId) {
    var j = OG.Journeys.get(journeyId);
    return (j && j.guide) || { charId: 'olivia', name: 'Olivia' };
  }
  function ch(id) { return OG.Data.getCharacter(id); }

  var Guide = (OG.Guide = {
    init: function () {
      if (OG.Level && OG.Level.addHook) OG.Level.addHook(guideHook);
      OG.Events.on('scene:change', function (e) { if (e && !e.push && !e.pop) sayMsg = null; });
    },

    guideOf: guideOf,

    // Người dẫn đường nói 1 câu ở góc màn hình trong `seconds` giây. Trả true nếu đang ở màn hành trình.
    say: function (text, seconds) {
      var st = OG.Level && OG.Level.state;
      var jid = (OG.Game.run && OG.Game.run.journeyId) || (st && st.journeyId);
      if (!jid || OG.Scenes.base() !== 'level') return false;
      var g = guideOf(jid);
      sayMsg = { text: text, t: 0, dur: seconds || 2.5, charId: g.charId, name: g.name };
      return true;
    },

    // Phát guide:talk (dùng chung cho điểm dẫn đường trong màn).
    talk: function (st, spot) {
      var text = spot.lines[spot.idx % spot.lines.length];
      OG.Events.emit('guide:talk', { journeyId: st.journeyId, charId: spot.charId, levelId: st.level.id, spot: spot.index, text: text });
      if (spot.card && OG.Learn && !OG.Learn.hasCard(st.journeyId, spot.card)) OG.Learn.unlockCard(st.journeyId, spot.card);
      return text;
    }
  });

  // ===========================================================================
  // Level hook
  // ===========================================================================
  var guideHook = {
    id: 'guide', order: 30,
    enter: function (st) {
      sayMsg = null;
      if (!st.journeyId) { st.guideSpots = []; return; }
      var g = guideOf(st.journeyId);
      st.guideSpots = (st.level.guideSpots || []).map(function (s, i) {
        var id = s.charId || g.charId, c = ch(id);
        return {
          index: i, x: s.x, y: s.y != null ? s.y : OG.FLOOR_Y, charId: id, name: s.name || (s.charId ? c.name : g.name),
          w: c.w, h: c.h, lines: s.lines || [s.text], idx: 0, near: false, talked: false, card: s.card || null
        };
      });
    },

    update: function (st, dt, p) {
      if (sayMsg) { sayMsg.t += dt; if (sayMsg.t > sayMsg.dur) sayMsg = null; }
      var spots = st.guideSpots;
      if (!spots || !spots.length) return;
      var cx = p.x + p.w / 2;
      var tap = OG.Input.pointer.justPressed ? OG.Camera.toWorld(OG.Input.pointer.x, OG.Input.pointer.y) : null;
      for (var i = 0; i < spots.length; i++) {
        var s = spots[i];
        var near = Math.abs(cx - s.x) < TALK_RANGE && Math.abs(p.y + p.h - s.y) < 140;
        var tapped = tap && Math.abs(tap.x - s.x) < s.w && tap.y > s.y - s.h - 20 && tap.y < s.y + 10;
        if ((near && !s.near) || tapped) {
          if (tapped && s.near) s.idx++;
          s.near = true; s.talked = true;
          Guide.talk(st, s);
        } else if (near && OG.Input.pressed('action')) {
          s.idx++;
          Guide.talk(st, s);
        } else if (!near && !tapped) s.near = false;
      }
    },

    drawWorld: function (ctx, st, t) {
      var spots = st.guideSpots, p = st.player;
      if (!spots) return;
      for (var i = 0; i < spots.length; i++) {
        var s = spots[i];
        ctx.save();
        ctx.translate(s.x, s.y);
        OG.Sprites.drawCharacter(ctx, s.charId, s.near ? 'talk' : 'idle', t, { face: p.x + p.w / 2 < s.x ? -1 : 1, w: s.w, h: s.h, time: t });
        ctx.restore();
        if (!s.talked) {
          // Dấu "!" nhún nhảy mời bé lại gần.
          ctx.save();
          ctx.fillStyle = '#ffc94a'; ctx.strokeStyle = '#17233d'; ctx.lineWidth = 3;
          var by = s.y - s.h - 26 + Math.sin(t * 5) * 4;
          ctx.beginPath(); ctx.arc(s.x, by, 13, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#17233d'; ctx.font = OG.font(18, 'bold'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('!', s.x, by + 1);
          ctx.restore();
        }
      }
    },

    drawFront: function (ctx, st) {
      var spots = st.guideSpots;
      if (!spots || !OG.Story) return;
      for (var i = 0; i < spots.length; i++) {
        var s = spots[i];
        if (!s.near) continue;
        OG.Story.ui.drawBubble(ctx, s.x, s.y - s.h - 8, s.lines[s.idx % s.lines.length], { maxW: 300, size: 17, name: s.name });
      }
    },

    drawScreen: function (ctx) {
      if (!sayMsg || !OG.Story) return;
      ctx.save();
      if (OG.Sprites.drawPortrait) OG.Sprites.drawPortrait(ctx, sayMsg.charId, 60, OG.H - 70, 80, {});
      OG.Story.ui.drawBubble(ctx, 108, OG.H - 118, sayMsg.text, { tail: 'none', anchor: 'left', maxW: 360, size: 18, name: sayMsg.name });
      ctx.restore();
    }
  };
})();
