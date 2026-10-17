// @ts-check
/* ============================================================================
 * OG.Guide — NHÂN VẬT DẪN ĐƯỜNG (NPC) TRONG MÀN: Olivia, Bob, Giáo sư Cú, Rô-bốt Bíp...
 * ----------------------------------------------------------------------------
 * Vai trò:      Đặt NPC ở guideSpots[].x của màn hành trình; lại gần hoặc chạm vào NPC thì NPC nói (bong bóng
 *               chữ hiện dần), có thể mở khoá thẻ kiến thức. Ngoài ra say(): người dẫn đường nói 1 câu ở góc
 *               màn hình (OG.Story.onSoftFail gọi để động viên khi hồi sinh).
 * Khái niệm:    NPC đối thoại theo khoảng cách (proximity trigger) · trễ (hysteresis) chống nhấp nháy ·
 *               máy trạng thái nhỏ cho NPC (chưa gặp → đang nói → đã nói) · hiệu ứng gõ chữ theo CPS ·
 *               chọn hoạt ảnh theo trạng thái · toạ độ thế giới vs màn hình (Camera.toWorld)
 * Bài học:      docs/learn/05-state-machine-scene.md · docs/learn/08-camera-parallax.md (toWorld, bounds theo camera)
 *               · docs/learn/03-input.md (pressed vs pointer.justPressed)
 * Phụ thuộc:    LOAD: OG.util (U). CHẠY: OG.Journeys.get, OG.Data.getCharacter, OG.Level (addHook, state),
 *               OG.Scenes.base, OG.Game.run, OG.Input (pointer, pressed), OG.Camera (toWorld, x), OG.Sprites
 *               (drawCharacter, drawPortrait), OG.Story.ui, OG.Learn (hasCard, unlockCard), OG.DOM.shell, OG.font
 * Event:        phát: 'guide:talk' · nghe: 'scene:change' (tắt câu say() khi đổi scene)
 * API công khai: OG.Guide.init(), OG.Guide.guideOf(jid), OG.Guide.say(text, seconds), OG.Guide.talk(st, spot),
 *               OG.Guide.drawSay(ctx)
 * Đọc tiếp:     src/story/learn.js (unlockCard được gọi khi nói chuyện) → src/story/scenes.js (scene comic dùng
 *               cùng bộ bong bóng thoại) → src/journeys/home/journey.js (khai báo guideSpots trong màn)
 *
 * Hợp đồng: docs/STORY.md mục 6.4.
 * - NPC đứng ở guideSpots[].x; chưa nói chuyện thì có dấu "!" nhún nhảy và thỉnh thoảng vẫy tay.
 * - Đến gần (≤ 90 px) hoặc chạm vào NPC → bong bóng thoại hiện chữ dần + 'guide:talk'.
 * - Chữ hiện xong → chờ đủ thời gian đọc (READ_BASE + READ_PER_CHAR × số ký tự) rồi TỰ sang câu tiếp;
 *   hết câu cuối thì chờ thêm rồi tự tắt bong bóng (đứng yên tại chỗ cũng không bật lại).
 * - Nhấn E / Space (hoặc chạm vào NPC) → qua câu nhanh: đang hiện chữ thì hiện hết câu, hiện xong rồi thì sang câu tiếp.
 * - Đi xa rồi quay lại → nói lại từ câu 1.
 * - spot.card → nói chuyện xong mở khoá thẻ đó (thông báo "Thẻ mới" góc màn hình).
 * ========================================================================== */

/**
 * @typedef {Object} GuideSpot  trạng thái chạy của một NPC trong màn (tạo ở hook enter từ LevelDef.guideSpots)
 * @property {number} index    vị trí trong mảng guideSpots (gửi kèm 'guide:talk')
 * @property {number} x        toạ độ thế giới của CHÂN NPC, px
 * @property {number} y        mặt đất dưới chân NPC, px (mặc định OG.FLOOR_Y)
 * @property {string} charId
 * @property {string} name     tên hiện trên bảng tên bong bóng
 * @property {number} w        kích thước nhân vật, px (để vẽ và hit-test chạm)
 * @property {number} h
 * @property {string[]} lines  các câu thoại (xoay vòng)
 * @property {number} idx      câu đang nói, 0..lines.length-1 (về 0 khi người chơi đi xa)
 * @property {boolean} near    đang trong trạng thái "đang nói chuyện" (bong bóng hiện)
 * @property {boolean} talked  đã nói ít nhất 1 lần (tắt dấu "!")
 * @property {boolean} closed  đã nói hết các câu và tự tắt; chỉ mở lại khi người chơi đi xa rồi quay lại (hoặc chạm NPC)
 * @property {string|null} card cardId mở khoá khi nói chuyện
 * @property {number} revealT  giây kể từ khi bắt đầu câu hiện tại (hiệu ứng gõ chữ)
 * @property {number} nearT    giây đã đứng gần liên tục (chọn hoạt ảnh vẫy tay lúc mới gặp)
 * @property {number} seed     pha ngẫu nhiên để các NPC không nhún nhảy đồng bộ
 */
(function () {
  'use strict';
  var OG = window.OG;
  var U = OG.util;
  var TAU = Math.PI * 2;
  var TALK_RANGE = 90;     // khoảng cách ngang từ tâm người chơi tới NPC để bắt đầu nói, px
  var TALK_RANGE_Y = 140;  // chênh lệch độ cao tối đa (chân người chơi ↔ chân NPC), px — đứng trên bục cao thì không tính
  var LEAVE_MARGIN = 40;   // phải đi xa thêm chừng này (px) ngoài TALK_RANGE thì bong bóng mới tắt
  var CPS = 42;            // ký tự mỗi giây của hiệu ứng hiện chữ
  // Thời gian giữ một câu SAU KHI đã hiện hết chữ, trước khi tự sang câu tiếp / tự tắt (giây).
  // 💡 Khái niệm: thời gian đọc tỉ lệ với độ dài câu — câu dài cần lâu hơn; trẻ 5–10 tuổi đọc chậm nên để rộng rãi.
  // 🧪 Thử: đổi READ_PER_CHAR 0.06 → 0.02 rồi lại gần một NPC: câu chuyển nhanh hơn hẳn.
  var READ_BASE = 1.8;
  var READ_PER_CHAR = 0.06;
  function readTime(line) { return READ_BASE + line.length * READ_PER_CHAR; }
  /** Giây tính từ đầu câu tới lúc câu được giữ xong (hiện chữ + thời gian đọc). */
  function lineDuration(line) { return line.length / CPS + readTime(line); }

  /** @type {{text:string, t:number, dur:number, charId:string, name:string}|null} câu say() đang hiện (t, dur: giây) */
  var sayMsg = null;

  /**
   * Lấy người dẫn đường của hành trình (mặc định Olivia nếu dữ liệu thiếu).
   * @param {string} journeyId
   * @returns {{charId:string, name:string}}
   */
  function guideOf(journeyId) {
    var j = OG.Journeys.get(journeyId);
    return (j && j.guide) || { charId: 'olivia', name: 'Olivia' };
  }
  function ch(id) {
    var c = OG.Data.getCharacter && OG.Data.getCharacter(id);
    return c || { name: id, w: 34, h: 50 };
  }
  function ui() { return OG.Story && OG.Story.ui; }
  // Màn hình cảm ứng? (lớp 'touch-on' do UI bật, hoặc con trỏ thô kiểu ngón tay) — để đổi chữ gợi ý "E" thành "✦".
  function isTouch() {
    var shell = OG.DOM && OG.DOM.shell;
    return !!(shell && shell.classList && shell.classList.contains('touch-on')) ||
      !!(window.matchMedia && window.matchMedia('(pointer:coarse)').matches);
  }

  var Guide = (OG.Guide = {
    /** Cắm level hook 'guide' và nghe 'scene:change' (đổi scene thật thì tắt câu say()). */
    init: function () {
      if (OG.Level && OG.Level.addHook) OG.Level.addHook(guideHook);
      OG.Events.on('scene:change', function (e) { if (e && !e.push && !e.pop) sayMsg = null; });
    },

    guideOf: guideOf,

    /**
     * Cho người dẫn đường nói 1 câu ở góc trên-trái màn hình. Chỉ hoạt động khi scene gốc là 'level' của hành trình.
     * Thời lượng thật = max(1,5; seconds) + thời gian gõ hết chữ, để câu dài không biến mất khi chưa hiện xong.
     * @param {string} text
     * @param {number} [seconds=2.5]  thời gian giữ câu sau khi hiện, giây
     * @returns {boolean} true nếu câu được hiện
     * @example
     *   OG.Guide.say('Cố lên! Sắp tới cửa rồi! 🚪', 3);
     */
    say: function (text, seconds) {
      var st = OG.Level && OG.Level.state;
      var jid = (OG.Game.run && OG.Game.run.journeyId) || (st && st.journeyId);
      if (!jid || OG.Scenes.base() !== 'level') return false;
      var g = guideOf(jid);
      sayMsg = { text: String(text || ''), t: 0, dur: Math.max(1.5, seconds || 2.5) + String(text || '').length / CPS, charId: g.charId, name: g.name };
      return true;
    },

    /**
     * Cho một NPC nói câu hiện tại (spot.lines[spot.idx]): reset hiệu ứng gõ chữ, phát 'guide:talk',
     * mở khoá spot.card nếu chưa có (SỬA spot.revealT).
     * @param {any} st  trạng thái màn (OG.Level.state)
     * @param {GuideSpot} spot
     * @returns {string} câu vừa nói
     */
    talk: function (st, spot) {
      var text = spot.lines[spot.idx % spot.lines.length];
      spot.revealT = 0;
      OG.Events.emit('guide:talk', { journeyId: st.journeyId, charId: spot.charId, levelId: st.level.id, spot: spot.index, text: text });
      if (spot.card && OG.Learn && !OG.Learn.hasCard(st.journeyId, spot.card)) OG.Learn.unlockCard(st.journeyId, spot.card);
      return text;
    },

    /**
     * Vẽ bong bóng của say() (không gian MÀN HÌNH): chân dung + bong bóng có bảng tên, hiện/ẩn mờ dần.
     * @param {CanvasRenderingContext2D} ctx
     */
    drawSay: function (ctx) {
      if (!sayMsg || !ui()) return;
      // k: tiến độ hiện ra (0,25 giây đầu); out: tiến độ ẩn đi (0,3 giây cuối).
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
  /**
   * Sang câu tiếp; nếu đã là câu cuối thì tắt bong bóng (trạng thái ĐÃ TẮT, chờ người chơi đi xa rồi quay lại).
   * @param {any} st
   * @param {GuideSpot} s
   */
  function nextLine(st, s) {
    if (s.idx + 1 < s.lines.length) { s.idx++; Guide.talk(st, s); }
    else { s.near = false; s.closed = true; }
  }

  /** @type {LevelHook} */
  var guideHook = {
    id: 'guide', order: 30,
    enter: function (st) {
      sayMsg = null;
      if (!st.journeyId) { st.guideSpots = []; return; }
      var g = guideOf(st.journeyId);
      // Dựng trạng thái chạy cho từng NPC từ dữ liệu màn; NPC không khai charId thì là người dẫn đường của hành trình.
      st.guideSpots = (st.level.guideSpots || []).map(function (s, i) {
        var id = s.charId || g.charId, c = ch(id);
        var lines = (s.lines && s.lines.length ? s.lines : [s.text || '...']).map(String);
        return {
          index: i, x: s.x, y: s.y != null ? s.y : OG.FLOOR_Y, charId: id, name: s.name || (s.charId ? c.name : g.name),
          w: c.w || 34, h: c.h || 50, lines: lines, idx: 0, near: false, talked: false, closed: false, card: s.card || null,
          revealT: 0, nearT: 0, seed: Math.random() * 6
        };
      });
    },

    update: function (st, dt, p) {
      if (sayMsg) { sayMsg.t += dt; if (sayMsg.t > sayMsg.dur) sayMsg = null; }
      /** @type {GuideSpot[]} */
      var spots = st.guideSpots;
      if (!spots || !spots.length) return;
      var cx = p.x + p.w / 2;
      var ptr = OG.Input.pointer;
      // Chạm trên màn hình cho toạ độ MÀN HÌNH → đổi sang toạ độ THẾ GIỚI (cộng camera) để so với vị trí NPC.
      var tap = ptr.justPressed ? OG.Camera.toWorld(ptr.x, ptr.y) : null;
      for (var i = 0; i < spots.length; i++) {
        var s = spots[i];
        s.revealT += dt;
        var near = Math.abs(cx - s.x) < TALK_RANGE && Math.abs(p.y + p.h - s.y) < TALK_RANGE_Y;
        // Vùng chạm: rộng ít nhất 36 px mỗi bên, cao từ trên đầu (1,4 lần chiều cao + 30 px) xuống dưới chân 12 px.
        var tapped = tap && Math.abs(tap.x - s.x) < Math.max(36, s.w) && tap.y > s.y - s.h * 1.4 - 30 && tap.y < s.y + 12;
        if (near) s.nearT += dt; else s.nearT = 0;
        // 💡 Khái niệm: máy trạng thái nhỏ — 3 trạng thái của một NPC:
        //   IM LẶNG (!near, !closed) ──vào gần / chạm──▶ ĐANG NÓI (near) ──hết câu cuối──▶ ĐÃ TẮT (closed)
        //   ĐANG NÓI: hết thời gian đọc → câu tiếp (tự động) · E / Space / chạm → qua câu nhanh.
        //   Đi xa hẳn (ĐANG NÓI hoặc ĐÃ TẮT) → IM LẶNG và quay về câu 1. Cờ s.talked chỉ để tắt dấu "!".
        var farAway = !near && Math.abs(cx - s.x) > TALK_RANGE + LEAVE_MARGIN;
        if (farAway && !tapped) {
          // 💡 Khái niệm: hysteresis (ngưỡng vào ≠ ngưỡng ra) — vào ở 90 px nhưng 130 px mới tính là đi xa,
          //   nên đứng lấp ló ở rìa vùng nói chuyện thì bong bóng không bật/tắt liên tục.
          s.near = false; s.closed = false; s.idx = 0;
        } else if (!s.near && ((near && !s.closed) || tapped)) {
          // Vừa đến gần (hoặc chạm vào NPC, kể cả khi đã tắt): nói từ câu 1
          s.near = true; s.talked = true; s.closed = false; s.idx = 0;
          Guide.talk(st, s);
          if (tapped) ptr.justPressed = false;
        } else if (s.near) {
          var line = s.lines[s.idx];
          var shown = s.revealT * CPS >= line.length;
          // ⚠️ Bẫy: ↑ và W cũng gửi 'jump' (kèm 'up'); chỉ Space gửi 'jump' mà KHÔNG có 'up' → nhận ra Space.
          //   Space vẫn làm Oggy nhảy như thường (không "tiêu thụ" phím) — người chơi không bị kẹt khi đứng cạnh NPC.
          var skip = tapped || (near && (OG.Input.pressed('action') || (OG.Input.pressed('jump') && !OG.Input.pressed('up'))));
          if (skip && !shown) {
            s.revealT = line.length / CPS;          // lần bấm đầu: hiện hết câu ngay
          } else if (skip || s.revealT >= lineDuration(line)) {
            nextLine(st, s);                        // bấm khi đã hiện xong, hoặc hết thời gian đọc
          }
          // ⚠️ Bẫy: không "tiêu thụ" cú chạm thì module khác (vd nút nhảy cảm ứng) xử lý thêm lần nữa.
          if (tapped) ptr.justPressed = false;
        }
      }
    },

    // Không gian THẾ GIỚI, vẽ TRƯỚC người chơi (NPC đứng phía sau Oggy).
    drawWorld: function (ctx, st, t) {
      /** @type {GuideSpot[]} */
      var spots = st.guideSpots;
      var p = st.player;
      if (!spots) return;
      for (var i = 0; i < spots.length; i++) {
        var s = spots[i];
        var line = s.lines[s.idx];
        var talking = s.near && s.revealT * CPS < line.length;
        // Chọn động tác: nói (miệng mấp máy), vẫy tay khi vừa gặp / mời gọi, chỉ tay khi đã nói xong
        var anim = talking ? 'talk' : (s.near && s.nearT < 0.9) ? 'wave'
          : (!s.talked && Math.sin(t * 1.3 + s.seed) > 0.55) ? 'wave' : s.near ? 'point' : 'idle';
        ctx.save();
        // vòng sáng dưới chân
        ctx.fillStyle = s.near ? 'rgba(255,201,74,0.45)' : 'rgba(23,35,61,0.18)';
        ctx.beginPath(); ctx.ellipse(s.x, s.y - 1, s.w * 0.8, 6, 0, 0, TAU); ctx.fill();
        ctx.translate(s.x, s.y);
        // NPC luôn quay mặt về phía người chơi.
        OG.Sprites.drawCharacter(ctx, s.charId, anim, t, { face: p.x + p.w / 2 < s.x ? -1 : 1, w: s.w, h: s.h, time: t });
        ctx.restore();
        if (!s.talked) {
          // Dấu "!" nhún nhảy mời bé lại gần (chỉ phồng lên ở nửa dương của sóng sin → nhịp "bụp bụp").
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

    // Không gian THẾ GIỚI, vẽ SAU người chơi → bong bóng thoại luôn nằm trên Oggy.
    drawFront: function (ctx, st) {
      /** @type {GuideSpot[]} */
      var spots = st.guideSpots;
      if (!spots || !ui()) return;
      // bounds = khung nhìn hiện tại trong toạ độ thế giới → bong bóng bị kẹp trong màn hình dù NPC ở sát mép.
      var bounds = { x: OG.Camera.x, y: 0, w: OG.W, h: OG.H };
      for (var i = 0; i < spots.length; i++) {
        var s = spots[i];
        if (!s.near) continue;
        var line = s.lines[s.idx];
        var box = ui().drawBubble(ctx, s.x, s.y - s.h - 10, line, {
          maxW: 320, size: 18, name: s.name, reveal: Math.floor(s.revealT * CPS), bounds: bounds, minW: 150 });
        // Gợi ý câu tiếp: "1/3  E ▶" (hoặc "✦ ▶" trên màn hình cảm ứng) — chỉ hiện khi chữ đã gõ xong,
        // kèm vạch đếm ngược thời gian còn lại trước khi tự sang câu tiếp / tự tắt.
        // 🧪 Thử: đổi CPS 42 → 10 rồi lại gần một NPC: chữ hiện chậm như đánh máy, gợi ý "E ▶" xuất hiện muộn hơn.
        var revealDone = s.revealT * CPS >= line.length;
        if (revealDone) {
          var left = U.clamp(1 - (s.revealT - line.length / CPS) / readTime(line), 0, 1);
          ctx.save();
          ctx.fillStyle = 'rgba(23,35,61,0.25)';
          U.roundRectPath(ctx, box.x + 14, box.y + box.h - 5, box.w - 28, 3, 2); ctx.fill();
          ctx.fillStyle = '#ffc94a';
          U.roundRectPath(ctx, box.x + 14, box.y + box.h - 5, (box.w - 28) * left, 3, 2); ctx.fill();
          ctx.restore();
        }
        if (s.lines.length > 1 && revealDone) {
          var hint = (s.idx + 1) + '/' + s.lines.length + (isTouch() ? '  ✦ ▶' : '  E ▶');
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
