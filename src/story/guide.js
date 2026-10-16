/* OG.Guide — nhân vật DẪN ĐƯỜNG trong màn (Olivia, Bob, Giáo sư Cú, Rô-bốt Bíp...).
 * Chủ sở hữu v2: agent story-ui (src/story/). Hợp đồng: docs/STORY.md mục 6.4.
 *
 * - NPC đứng ở guideSpots[].x; chưa nói chuyện thì có dấu "!" nhún nhảy và thỉnh thoảng vẫy tay.
 * - Đến gần (≤ 90 px) hoặc chạm vào NPC -> bong bóng thoại hiện chữ dần + 'guide:talk'.
 * - Nhấn E/✦ (hoặc chạm lại) -> câu tiếp theo (hết câu thì quay lại câu đầu).
 * - spot.card -> nói chuyện xong mở khoá thẻ đó (thông báo "Thẻ mới" góc màn hình).
 * - say(text, sec): người dẫn đường nói 1 câu ở góc trên màn hình (động viên khi hồi sinh...). */
(function () {
  'use strict';
  var OG = window.OG;
  var U = OG.util;
  var TAU = Math.PI * 2;
  var TALK_RANGE = 90;  // px quanh NPC
  var CPS = 42;         // ký tự mỗi giây của hiệu ứng hiện chữ

  var sayMsg = null; // {text, t, dur, charId, name}

  function guideOf(journeyId) {
    var j = OG.Journeys.get(journeyId);
    return (j && j.guide) || { charId: 'olivia', name: 'Olivia' };
  }
  function ch(id) {
    var c = OG.Data.getCharacter && OG.Data.getCharacter(id);
    return c || { name: id, w: 34, h: 50 };
  }
  function ui() { return OG.Story && OG.Story.ui; }
  function isTouch() {
    var shell = OG.DOM && OG.DOM.shell;
    return !!(shell && shell.classList && shell.classList.contains('touch-on')) ||
      !!(window.matchMedia && window.matchMedia('(pointer:coarse)').matches);
  }

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
      sayMsg = { text: String(text || ''), t: 0, dur: Math.max(1.5, seconds || 2.5) + String(text || '').length / CPS, charId: g.charId, name: g.name };
      return true;
    },

    // Phát guide:talk cho 1 điểm dẫn đường (câu hiện tại = spot.lines[spot.idx]).
    talk: function (st, spot) {
      var text = spot.lines[spot.idx % spot.lines.length];
      spot.revealT = 0;
      OG.Events.emit('guide:talk', { journeyId: st.journeyId, charId: spot.charId, levelId: st.level.id, spot: spot.index, text: text });
      if (spot.card && OG.Learn && !OG.Learn.hasCard(st.journeyId, spot.card)) OG.Learn.unlockCard(st.journeyId, spot.card);
      return text;
    },

    // Vẽ bong bóng "say". Không gian màn hình.
    drawSay: function (ctx) {
      if (!sayMsg || !ui()) return;
      var k = Math.min(1, sayMsg.t / 0.25), out = sayMsg.dur - sayMsg.t < 0.3 ? (sayMsg.dur - sayMsg.t) / 0.3 : 1;
      ctx.save();
      ctx.globalAlpha = U.clamp(Math.min(k, out), 0, 1);
      var px = 58, py = 140 - (1 - ui().easeOutBack(k)) * 30;
      if (OG.Sprites.drawPortrait) {
        ctx.fillStyle = 'rgba(23,35,61,0.25)';
        ctx.beginPath(); ctx.arc(px + 2, py + 4, 38, 0, TAU); ctx.fill();
        OG.Sprites.drawPortrait(ctx, sayMsg.charId, px, py, 76, { t: sayMsg.t, state: 'talk', bg: '#fff6df' });
      }
      ui().drawBubble(ctx, px + 46, py - 36, sayMsg.text, {
        tail: 'none', anchor: 'left', maxW: 400, size: 19, name: sayMsg.name, reveal: Math.floor(sayMsg.t * CPS * 1.4) });
      ctx.restore();
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
        var lines = (s.lines && s.lines.length ? s.lines : [s.text || '...']).map(String);
        return {
          index: i, x: s.x, y: s.y != null ? s.y : OG.FLOOR_Y, charId: id, name: s.name || (s.charId ? c.name : g.name),
          w: c.w || 34, h: c.h || 50, lines: lines, idx: 0, near: false, talked: false, card: s.card || null,
          revealT: 0, nearT: 0, seed: Math.random() * 6
        };
      });
    },

    update: function (st, dt, p) {
      if (sayMsg) { sayMsg.t += dt; if (sayMsg.t > sayMsg.dur) sayMsg = null; }
      var spots = st.guideSpots;
      if (!spots || !spots.length) return;
      var cx = p.x + p.w / 2;
      var ptr = OG.Input.pointer;
      var tap = ptr.justPressed ? OG.Camera.toWorld(ptr.x, ptr.y) : null;
      for (var i = 0; i < spots.length; i++) {
        var s = spots[i];
        s.revealT += dt;
        var near = Math.abs(cx - s.x) < TALK_RANGE && Math.abs(p.y + p.h - s.y) < 140;
        var tapped = tap && Math.abs(tap.x - s.x) < Math.max(36, s.w) && tap.y > s.y - s.h * 1.4 - 30 && tap.y < s.y + 12;
        if (near) s.nearT += dt; else s.nearT = 0;
        if ((near && !s.near) || (tapped && !s.near)) {
          // Vừa đến gần / chạm lần đầu: nói câu hiện tại
          s.near = true; s.talked = true;
          Guide.talk(st, s);
        } else if (s.near && (tapped || (near && OG.Input.pressed('action')))) {
          // Đang nói: sang câu tiếp theo
          s.idx++; Guide.talk(st, s);
          if (tapped) ptr.justPressed = false; // chạm NPC không tính là chạm khác
        } else if (!near && !tapped && s.near && Math.abs(cx - s.x) > TALK_RANGE + 40) {
          s.near = false; // đi xa hẳn mới tắt bong bóng (tránh nhấp nháy ở rìa)
        }
      }
    },

    drawWorld: function (ctx, st, t) {
      var spots = st.guideSpots, p = st.player;
      if (!spots) return;
      for (var i = 0; i < spots.length; i++) {
        var s = spots[i];
        var line = s.lines[s.idx % s.lines.length];
        var talking = s.near && s.revealT * CPS < line.length;
        // Chọn động tác: nói (miệng mấp máy), vẫy tay khi vừa gặp / mời gọi, chỉ tay khi đã nói xong
        var anim = talking ? 'talk' : (s.near && s.nearT < 0.9) ? 'wave'
          : (!s.talked && Math.sin(t * 1.3 + s.seed) > 0.55) ? 'wave' : s.near ? 'point' : 'idle';
        ctx.save();
        // vòng sáng dưới chân
        ctx.fillStyle = s.near ? 'rgba(255,201,74,0.45)' : 'rgba(23,35,61,0.18)';
        ctx.beginPath(); ctx.ellipse(s.x, s.y - 1, s.w * 0.8, 6, 0, 0, TAU); ctx.fill();
        ctx.translate(s.x, s.y);
        OG.Sprites.drawCharacter(ctx, s.charId, anim, t, { face: p.x + p.w / 2 < s.x ? -1 : 1, w: s.w, h: s.h, time: t });
        ctx.restore();
        if (!s.talked) {
          // Dấu "!" nhún nhảy mời bé lại gần.
          ctx.save();
          var by = s.y - s.h - 30 + Math.sin(t * 5 + s.seed) * 5, sc = 1 + Math.max(0, Math.sin(t * 5 + s.seed)) * 0.12;
          ctx.translate(s.x, by); ctx.scale(sc, sc);
          ctx.fillStyle = '#ffc94a'; ctx.strokeStyle = '#17233d'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(0, 0, 15, 0, TAU); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#17233d'; ctx.font = OG.font(20, 'bold'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('!', 0, 1);
          ctx.restore();
        }
      }
    },

    drawFront: function (ctx, st) {
      var spots = st.guideSpots;
      if (!spots || !ui()) return;
      var bounds = { x: OG.Camera.x, y: 0, w: OG.W, h: OG.H };
      for (var i = 0; i < spots.length; i++) {
        var s = spots[i];
        if (!s.near) continue;
        var line = s.lines[s.idx % s.lines.length];
        var box = ui().drawBubble(ctx, s.x, s.y - s.h - 10, line, {
          maxW: 320, size: 18, name: s.name, reveal: Math.floor(s.revealT * CPS), bounds: bounds, minW: 150 });
        // Gợi ý câu tiếp: "1/3  E ▶" (hoặc "✦ ▶" trên màn hình cảm ứng)
        if (s.lines.length > 1 && s.revealT * CPS >= line.length) {
          var hint = ((s.idx % s.lines.length) + 1) + '/' + s.lines.length + (isTouch() ? '  ✦ ▶' : '  E ▶');
          ctx.save();
          ctx.font = OG.font(13, 'bold');
          var hw = ctx.measureText(hint).width + 16, hx = box.x + box.w - hw - 8, hy = box.y + box.h - 11;
          ctx.fillStyle = '#17233d';
          U.roundRectPath(ctx, hx, hy, hw, 20, 10); ctx.fill();
          ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.globalAlpha = 0.75 + Math.sin(OG.time * 6) * 0.25;
          ctx.fillText(hint, hx + hw / 2, hy + 11);
          ctx.restore();
        }
      }
    },

    drawScreen: function (ctx) { Guide.drawSay(ctx); }
  };
})();
