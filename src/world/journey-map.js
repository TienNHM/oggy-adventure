/* Bản đồ HÀNH TRÌNH vẽ bằng canvas — scene 'journeyMap' (thay bản panel DOM dự phòng trong src/story/scenes.js).
 * Chủ sở hữu: agent Tích hợp (src/world/). Hợp đồng scene: docs/STORY.md mục 6.5.
 *
 * Ý tưởng cho trẻ em: mỗi KHU của hành trình là một "ô tranh" vẽ bằng chính chủ đề cảnh nền của khu
 * (OG.Sprites.drawBackground), trên đó có các nút màn to nối nhau bằng con đường chấm, cuối khu là trùm gián.
 * Oggy đứng ở màn đang chọn và tự đi bộ tới màn kế tiếp sau khi thắng. Người dẫn đường nói một câu ở góc dưới.
 *
 * Điều khiển:
 *   ←/→/↑/↓  chọn màn đã mở           Enter / Space / E  ▶ CHƠI màn đang chọn (mặc định: màn chưa xong đầu tiên)
 *   Esc      về chọn hành trình       Chạm: nút màn (chạm 2 lần = chơi), nút ▶ CHƠI TIẾP, 📒 Sổ tay, ↩, mũi tên cuộn
 * params: {journeyId, completed?: levelId vừa thắng, result?: LevelResult}
 *
 * Đăng ký: OG.World.init() gọi OG.World.journeyMap.register() (file này load ngay sau world.js). */
(function () {
  'use strict';
  var OG = window.OG;
  var U = OG.util;
  var World = (OG.World = OG.World || {});
  var TAU = Math.PI * 2;
  var INK = '#17233d';

  // ---- Bố cục (toạ độ logic 960×540) ----
  var TOP_H = 70;                                   // thanh trên
  var ZONE = { y: 80, w: 330, h: 336, gap: 18, pad: 22 }; // ô khu
  var NODE_R = 30;                                  // bán kính nút màn
  var HIT_R = 48;                                   // vùng chạm nút (≥ 44px)
  var WALK_SPEED = 320;                             // px/s Oggy đi giữa các nút
  var BTN = {
    back: { x: 12, y: 8, w: 64, h: 56 },
    play: { x: 596, y: 448, w: 214, h: 76 },
    book: { x: 822, y: 448, w: 126, h: 76 },
    left: { x: 6, y: 206, w: 56, h: 84 },
    right: { x: 898, y: 206, w: 56, h: 84 }
  };

  function J() { return OG.Journeys; }
  function ui() { return OG.Story && OG.Story.ui; }
  function font(px, w) { return OG.font(px, w || 'bold'); }
  function hit(r, x, y) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }

  // Vẽ an toàn: lỗi trong hàm vẽ của module khác không làm sập frame, save/restore luôn cân bằng.
  var reported = {};
  function guard(ctx, label, fn) {
    ctx.save();
    try { fn(); } catch (e) {
      if (!reported[label]) { reported[label] = true; console.warn('[OG.World.journeyMap] lỗi khi vẽ ' + label + ':', e); }
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Ảnh thu nhỏ chủ đề cảnh nền của khu (vẽ 1 lần vào canvas phụ rồi dùng lại → nhẹ máy)
  // ---------------------------------------------------------------------------
  var thumbs = {};
  var THUMB_RES = 2; // vẽ gấp đôi để nét khi canvas được phóng to
  function drawThemeInto(c, theme, w, h) {
    var k = h / OG.H;                               // co cảnh 960×540 theo chiều cao ô
    c.scale(k, k);
    c.translate(-(OG.W - w / k) / 2, 0);            // lấy phần giữa cảnh
    OG.Sprites.drawBackground(c, theme, 0, 0);
    OG.Sprites.drawPlatform(c, { x: 0, y: OG.FLOOR_Y, w: OG.W, h: 60, isFloor: true }, theme, 0);
  }
  function thumbOf(theme) {
    if (thumbs[theme] !== undefined) return thumbs[theme];
    var cv = null;
    try {
      cv = document.createElement('canvas');
      cv.width = ZONE.w * THUMB_RES; cv.height = ZONE.h * THUMB_RES;
      var c = cv.getContext && cv.getContext('2d');
      if (!c) cv = null;
      else guard(c, 'ảnh khu ' + theme, function () { c.scale(THUMB_RES, THUMB_RES); drawThemeInto(c, theme, ZONE.w, ZONE.h); });
    } catch (e) { cv = null; }
    thumbs[theme] = cv; // null = không tạo được canvas phụ → vẽ trực tiếp
    return cv;
  }
  // Xoá ảnh cũ khi đổi dữ liệu (vd demo nạp lại chủ đề).
  OG.Events.on('save:reset', function () { thumbs = {}; });

  // ---------------------------------------------------------------------------
  // Dựng bố cục: khu → ô, màn → nút (toạ độ "bản đồ", chưa trừ camera)
  // ---------------------------------------------------------------------------
  function bossChar(bossId) {
    if (OG.Data.characters && OG.Data.characters[bossId]) return bossId;
    return 'joey'; // 'trio' hoặc trùm riêng của hành trình: dùng chân dung Joey (thủ lĩnh bộ ba)
  }

  function buildLayout(jid) {
    var j = J().get(jid), levels = J().levelsOf(jid);
    var zones = [], nodes = [], byId = {};
    (j.areas || []).forEach(function (a, ai) {
      var zx = 74 + ai * (ZONE.w + ZONE.gap);
      var lv = levels.filter(function (l) { return l.areaId === a.id; });
      var hasBoss = !!(a.boss && a.boss.bossId);
      var count = lv.length + (hasBoss ? 1 : 0);
      var span = ZONE.w - ZONE.pad * 2 - NODE_R * 2;
      var z = {
        id: a.id, area: a, index: ai, x: zx, y: ZONE.y, w: ZONE.w, h: ZONE.h,
        theme: a.sceneryTheme || (lv[0] && lv[0].theme) || 'garden',
        unlocked: J().isAreaUnlocked(jid, a.id), done: J().isAreaDone(jid, a.id), nodes: []
      };
      for (var i = 0; i < count; i++) {
        var isBoss = hasBoss && i === lv.length;
        var nx = zx + ZONE.pad + NODE_R + (count > 1 ? (span * i) / (count - 1) : span / 2);
        var ny = ZONE.y + ZONE.h - 92 - (i % 2 ? 62 : 0);    // zig-zag cho vui mắt
        var n = { x: nx, y: ny, zone: z, boss: isBoss };
        if (isBoss) {
          n.id = 'boss:' + a.id; n.bossId = a.boss.bossId; n.char = bossChar(a.boss.bossId);
          n.levelId = lv.length ? lv[lv.length - 1].id : null;
          n.done = z.done; n.open = z.unlocked;
        } else {
          var L = lv[i];
          n.id = L.id; n.level = L; n.num = i + 1;
          n.open = J().isLevelUnlocked(L.id); n.done = OG.Progress.isCompleted(L.id);
          var rec = OG.Progress.getRecord ? OG.Progress.getRecord(L.id) : null;
          n.stars = rec ? rec.stars | 0 : 0;
          byId[L.id] = n;
        }
        z.nodes.push(n); nodes.push(n);
      }
      zones.push(z);
    });
    var last = zones[zones.length - 1];
    var width = last ? last.x + last.w + 74 : OG.W;
    return { zones: zones, nodes: nodes, byId: byId, width: Math.max(OG.W, width) };
  }

  // ---------------------------------------------------------------------------
  // Trạng thái scene
  // ---------------------------------------------------------------------------
  var S = null;

  function openLevels() {
    return S.nodes.filter(function (n) { return !n.boss && n.open; });
  }
  function camFor(n) { return U.clamp(n.x - OG.W / 2, 0, S.width - OG.W); }

  // Chọn màn + cho Oggy đi tới đó.
  function select(id, opts) {
    var n = S.byId[id];
    if (!n) return;
    var changed = S.selId && S.selId !== id;
    S.selId = id;
    S.manualCam = false;
    S.bubbleT = 0;
    // Bé đổi màn: người dẫn đường đọc tên màn (thay vì bong bóng nổi che nhãn khu).
    if (changed) S.msg = n.num + '. “' + n.level.name + '” ' + (n.done ? '⭐'.repeat(n.stars || 1) + ' Chơi lại nhé?' : 'Bấm ▶ CHƠI để bắt đầu nhé!');
    if (!(opts && opts.teleport)) { S.oggy.target = { x: n.x, y: n.y }; }
    else { S.oggy.x = n.x; S.oggy.y = n.y; S.oggy.target = null; }
  }

  function play(id) {
    if (!id || !J().isLevelUnlocked(id)) {
      OG.DOM.toast('Hoàn thành màn trước để mở màn này nhé! 🔒');
      U.call('Audio', 'sfx', 'locked');
      return;
    }
    OG.Events.emit('ui:click', { id: 'jmap_play' });
    OG.Story.playLevel(id);
  }

  function guideMessage() {
    var jid = S.jid, done = J().isComplete(jid), pr = J().progress(jid);
    var nextL = J().getLevel(J().firstIncomplete(jid));
    var doneL = S.completed && J().getLevel(S.completed);
    if (doneL) return 'Giỏi quá! Bạn vừa xong “' + doneL.name + '”! ' + (done ? 'Hết hành trình rồi! 🏆' : 'Đi tiếp nào! 🎉');
    if (done) return 'Bạn đã đi hết hành trình! Chơi lại để lấy thêm sao nhé! ⭐';
    if (pr.levelsDone === 0) return 'Chào bạn! Bấm ▶ CHƠI TIẾP để bắt đầu nhé!';
    return 'Màn tiếp theo: “' + (nextL ? nextL.name : '') + '”. Đi nào!';
  }

  var scene = {
    enter: function (params) {
      params = params || {};
      var jid = params.journeyId || OG.Story.current() || OG.Story.lastJourney();
      var j = jid && J().get(jid);
      OG.DOM.hidePanel();
      OG.DOM.setHudVisible(false);
      OG.DOM.setControlsVisible(false);
      if (!j || j.invalid) { S = null; OG.Scenes.go('journeySelect'); return; }
      if (!OG.Game.run || OG.Game.run.over || OG.Game.run.journeyId !== jid) OG.Game.newRun({ journeyId: jid });
      var lay = buildLayout(jid);
      S = {
        jid: jid, j: j, zones: lay.zones, nodes: lay.nodes, byId: lay.byId, width: lay.width,
        completed: params.completed || null, result: params.result || null,
        t: 0, bubbleT: 0, camX: 0, manualCam: false, hover: null, msg: '',
        pal: ui() ? ui().palette(jid) : { primary: '#ed713c', secondary: '#52b9df', accent: '#ffc94a', bg: '#fff6df' },
        oggy: { x: 0, y: 0, target: null, face: 1, moving: false }
      };
      var done = J().isComplete(jid), ids = J().levelIds(jid);
      var startId = done ? ids[0] : J().firstIncomplete(jid);
      // Vừa thắng: Oggy đứng ở màn vừa xong rồi tự đi tới màn kế tiếp.
      var from = S.completed && S.byId[S.completed] ? S.completed : startId;
      select(from, { teleport: true });
      if (from !== startId && S.byId[startId]) { S.selId = startId; S.oggy.target = { x: S.byId[startId].x, y: S.byId[startId].y }; S.walkDelay = 0.8; }
      S.camX = camFor(S.byId[from] || S.nodes[0]);
      S.msg = guideMessage();
      if (ui()) ui().fx.clear();
      if (S.completed) {
        if (ui()) ui().fx.confetti(OG.W / 2, OG.H * 0.6, 70, 2.6);
        var L = J().getLevel(S.completed);
        OG.DOM.toast('Giỏi quá! Hoàn thành ' + (L ? '“' + L.name + '”' : 'màn') + ' 🎉', 2.2);
      }
    },

    exit: function () {
      if (OG.canvas && OG.canvas.style) OG.canvas.style.cursor = '';
      if (ui()) ui().fx.clear();
      S = null;
    },

    update: function (dt) {
      if (!S) return;
      var I = OG.Input, ptr = I.pointer;
      S.t += dt; S.bubbleT += dt;
      if (ui()) ui().fx.update(dt);

      // Oggy đi bộ
      var o = S.oggy;
      o.moving = false;
      if (S.walkDelay > 0) S.walkDelay -= dt;
      else if (o.target) {
        var dx = o.target.x - o.x, dy = o.target.y - o.y, d = Math.sqrt(dx * dx + dy * dy);
        var step = WALK_SPEED * dt;
        if (d <= step) { o.x = o.target.x; o.y = o.target.y; o.target = null; }
        else { o.x += (dx / d) * step; o.y += (dy / d) * step; o.moving = true; if (Math.abs(dx) > 1) o.face = dx > 0 ? 1 : -1; }
      }
      // Camera: theo Oggy (trừ khi bé đang tự cuộn bằng nút mũi tên)
      var goal = S.manualCam ? S.camTarget : U.clamp(o.x - OG.W / 2, 0, S.width - OG.W);
      S.camX += (goal - S.camX) * Math.min(1, dt * 6);

      if (I.pressed('back') || I.pressed('pause')) {
        I.consume('back'); I.consume('pause');
        OG.Scenes.go('journeySelect');
        return;
      }
      // Bàn phím: đổi màn
      var open = openLevels(), idx = -1;
      for (var i = 0; i < open.length; i++) if (open[i].id === S.selId) idx = i;
      var dir = (I.pressed('left') || I.pressed('up')) ? -1 : (I.pressed('right') || I.pressed('down')) ? 1 : 0;
      if (dir && open.length) {
        var ni = U.clamp((idx < 0 ? 0 : idx) + dir, 0, open.length - 1);
        if (open[ni].id !== S.selId) { select(open[ni].id); OG.Events.emit('ui:click', { id: 'jmap_sel' }); }
      }
      // Enter / Space / E = chơi (↑/W cũng là 'jump' nhưng dùng để chọn nên bỏ qua)
      if (I.pressed('confirm') || I.pressed('action') || (I.pressed('jump') && !I.pressed('up'))) { play(S.selId); return; }

      // Chuột / cảm ứng
      var px = ptr.x, py = ptr.y;
      S.hover = null;
      // Chạm luôn được xử lý (trên cảm ứng 'pointerleave' đặt inside=false sau mỗi lần chạm);
      // inside chỉ dùng để hiện con trỏ khi rê chuột.
      if (ptr.inside !== false || ptr.justPressed) {
        for (var k in BTN) if (hit(BTN[k], px, py) && btnVisible(k)) S.hover = 'btn:' + k;
        if (!S.hover && py > TOP_H && py < ZONE.y + ZONE.h + 6) {
          var n = nodeAt(px, py);
          if (n) S.hover = 'node:' + n.id;
        }
      }
      if (OG.canvas && OG.canvas.style) OG.canvas.style.cursor = S.hover ? 'pointer' : '';
      if (ptr.justPressed && S.hover) {
        if (S.hover.indexOf('btn:') === 0) { onButton(S.hover.slice(4)); return; }
        onNode(S.byId[S.hover.slice(5)] || nodeById(S.hover.slice(5)));
      }
    },

    draw: function (ctx) {
      if (!S) { ctx.fillStyle = '#10192b'; ctx.fillRect(0, 0, OG.W, OG.H); return; }
      drawSky(ctx);
      ctx.save();
      ctx.translate(-Math.round(S.camX), 0);
      for (var i = 0; i < S.zones.length; i++) drawZone(ctx, S.zones[i]);
      drawRoad(ctx);
      for (var k = 0; k < S.nodes.length; k++) drawNode(ctx, S.nodes[k]);
      drawOggy(ctx);
      ctx.restore();
      drawTopBar(ctx);
      drawBottom(ctx);
      drawArrows(ctx);
      if (ui()) ui().fx.draw(ctx);
    }
  };

  function nodeById(id) { for (var i = 0; i < S.nodes.length; i++) if (S.nodes[i].id === id) return S.nodes[i]; return null; }
  function nodeAt(px, py) {
    var wx = px + S.camX;
    for (var i = 0; i < S.nodes.length; i++) {
      var n = S.nodes[i], dx = wx - n.x, dy = py - n.y;
      if (dx * dx + dy * dy <= HIT_R * HIT_R) return n;
    }
    return null;
  }
  function btnVisible(k) {
    if (k === 'left') return S.width > OG.W && S.camX > 4;
    if (k === 'right') return S.width > OG.W && S.camX < S.width - OG.W - 4;
    return true;
  }
  function onButton(k) {
    OG.Events.emit('ui:click', { id: 'jmap_' + k });
    if (k === 'back') { OG.Scenes.go('journeySelect'); return; }
    if (k === 'book') { OG.Learn.openNotebook(S.jid, 'journeyMap', { journeyId: S.jid }); return; }
    if (k === 'play') {
      var done = J().isComplete(S.jid);
      play(S.selId || (done ? J().levelIds(S.jid)[0] : J().firstIncomplete(S.jid)));
      return;
    }
    if (k === 'left' || k === 'right') {
      S.manualCam = true;
      S.camTarget = U.clamp((S.manualCam ? S.camX : 0) + (k === 'left' ? -1 : 1) * (ZONE.w + ZONE.gap), 0, S.width - OG.W);
    }
  }
  function onNode(n) {
    if (!n) return;
    if (n.boss) {
      OG.DOM.toast(n.done ? 'Đã thắng trùm khu này! 🏆' : 'Trùm gián chờ ở cuối khu này! Qua hết các màn nhé 👾', 2);
      return;
    }
    if (!n.open) { OG.DOM.toast('Hoàn thành màn trước để mở màn này nhé! 🔒'); U.call('Audio', 'sfx', 'locked'); return; }
    if (S.selId === n.id) { play(n.id); return; } // chạm lần 2 = chơi
    OG.Events.emit('ui:click', { id: 'jmap_node' });
    select(n.id);
  }

  // ---------------------------------------------------------------------------
  // Vẽ
  // ---------------------------------------------------------------------------
  function shade(hex, k) { return ui() ? ui().shade(hex, k) : hex; }

  function drawSky(ctx) {
    var g = ctx.createLinearGradient(0, 0, 0, OG.H);
    g.addColorStop(0, shade(S.pal.secondary, 0.35));
    g.addColorStop(1, shade(S.pal.bg, 0.2));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, OG.W, OG.H);
    // Mây mặt cười trôi chậm (parallax nhẹ)
    for (var i = 0; i < 5; i++) {
      var x = ((i * 260 + S.t * 12 - S.camX * 0.2) % 1300 + 1300) % 1300 - 170, y = 90 + (i % 3) * 120;
      guard(ctx, 'mây', function () {
        if (OG.Scenery && OG.Scenery.drawDecor) {
          ctx.globalAlpha = 0.55;
          OG.Scenery.drawDecor(ctx, 'cloud', x, y, 0.9, S.t, {});
        }
      });
    }
  }

  function drawZone(ctx, z) {
    if (z.x + z.w < S.camX - 10 || z.x > S.camX + OG.W + 10) return; // ngoài màn hình
    var cur = !J().isComplete(S.jid) && z.nodes.some(function (n) { return n.id === J().firstIncomplete(S.jid); });
    ctx.save();
    // bóng + khung
    U.fillRound(ctx, z.x + 4, z.y + 8, z.w, z.h, 26, 'rgba(23,35,61,0.28)');
    ctx.save();
    U.roundRectPath(ctx, z.x, z.y, z.w, z.h, 26); ctx.clip();
    var th = thumbOf(z.theme);
    if (th) ctx.drawImage(th, z.x, z.y, z.w, z.h);
    else guard(ctx, 'khu ' + z.theme, function () { ctx.translate(z.x, z.y); drawThemeInto(ctx, z.theme, z.w, z.h); });
    if (!z.unlocked) { ctx.fillStyle = 'rgba(40,48,70,0.55)'; ctx.fillRect(z.x, z.y, z.w, z.h); }
    ctx.restore();
    // viền (khu hiện tại nhấp nháy vàng)
    ctx.lineWidth = cur ? 6 : 4;
    ctx.strokeStyle = cur ? (Math.sin(S.t * 4) > 0 ? '#ffc94a' : '#ffffff') : z.done ? '#3fbf6f' : INK;
    U.roundRectPath(ctx, z.x, z.y, z.w, z.h, 26); ctx.stroke();
    // nhãn tên khu
    var label = (z.area.emoji ? z.area.emoji + ' ' : '') + z.area.name;
    ctx.font = font(20);
    var lw = Math.min(z.w - 24, ctx.measureText(label).width + 30);
    U.fillRound(ctx, z.x + (z.w - lw) / 2, z.y + 12, lw, 40, 20, '#ffffff');
    ctx.lineWidth = 3; ctx.strokeStyle = INK;
    U.roundRectPath(ctx, z.x + (z.w - lw) / 2, z.y + 12, lw, 40, 20); ctx.stroke();
    ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, z.x + z.w / 2, z.y + 33, z.w - 40);
    // huy hiệu trạng thái
    if (z.done) badge(ctx, z.x + z.w - 26, z.y + 24, '✅', '#3fbf6f');
    else if (!z.unlocked) {
      ctx.font = font(64); ctx.fillText('🔒', z.x + z.w / 2, z.y + z.h / 2 - 20);
    }
    // số thẻ đã có trong khu
    var c = U.call('Learn', 'count', S.jid, z.id);
    if (c && c.total) {
      var txt = '📒 ' + c.have + '/' + c.total;
      ctx.font = font(15);
      var tw = ctx.measureText(txt).width + 20;
      U.fillRound(ctx, z.x + 12, z.y + z.h - 38, tw, 28, 14, 'rgba(23,35,61,0.8)');
      ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
      ctx.fillText(txt, z.x + 22, z.y + z.h - 23);
    }
    ctx.restore();
  }

  function badge(ctx, x, y, text, color) {
    ctx.save();
    ctx.fillStyle = color; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, 18, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.font = font(18); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
    ctx.fillText(text, x, y + 1);
    ctx.restore();
  }

  // Con đường chấm nối các nút (đoạn đã đi qua tô vàng).
  function drawRoad(ctx) {
    var ns = S.nodes;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (var i = 0; i < ns.length - 1; i++) {
      var a = ns[i], b = ns[i + 1];
      if (Math.max(a.x, b.x) < S.camX - 40 || Math.min(a.x, b.x) > S.camX + OG.W + 40) continue;
      var mx = (a.x + b.x) / 2, my = Math.min(a.y, b.y) - 34; // cong nhẹ lên trên
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(mx, my, b.x, b.y);
      ctx.strokeStyle = INK; ctx.lineWidth = 16; ctx.setLineDash([]); ctx.stroke();
      ctx.strokeStyle = a.done ? '#ffd36b' : '#fff6df'; ctx.lineWidth = 10; ctx.stroke();
      ctx.strokeStyle = a.done ? '#f2a93b' : 'rgba(23,35,61,0.25)'; ctx.lineWidth = 4; ctx.setLineDash([2, 14]); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawNode(ctx, n) {
    if (n.x < S.camX - 60 || n.x > S.camX + OG.W + 60) return;
    var hov = S.hover === 'node:' + n.id, sel = S.selId === n.id && !n.boss;
    var isNext = !n.boss && n.id === J().firstIncomplete(S.jid) && !J().isComplete(S.jid);
    var r = NODE_R * (hov ? 1.08 : 1) * (isNext ? 1 + Math.sin(S.t * 5) * 0.05 : 1);
    ctx.save();
    // vòng sáng màn được chọn
    if (sel) {
      ctx.fillStyle = 'rgba(255,201,74,0.45)';
      ctx.beginPath(); ctx.arc(n.x, n.y, r + 12 + Math.sin(S.t * 4) * 3, 0, TAU); ctx.fill();
    }
    // bóng
    ctx.fillStyle = 'rgba(23,35,61,0.3)';
    ctx.beginPath(); ctx.ellipse(n.x, n.y + r * 0.9, r * 0.9, r * 0.3, 0, 0, TAU); ctx.fill();
    var fill = n.boss ? (n.done ? '#ffc94a' : '#7b6cf0') : n.done ? '#3fbf6f' : n.open ? S.pal.primary : '#9aa3b5';
    ctx.fillStyle = shade(fill, -0.3);
    ctx.beginPath(); ctx.arc(n.x, n.y + 5, r, 0, TAU); ctx.fill();
    ctx.fillStyle = fill; ctx.strokeStyle = INK; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.ellipse(n.x - r * 0.25, n.y - r * 0.45, r * 0.45, r * 0.22, -0.4, 0, TAU); ctx.fill();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (n.boss) {
      if (n.done) { ctx.font = font(30); ctx.fillText('🏆', n.x, n.y + 2); }
      else if (OG.Sprites && OG.Sprites.drawPortrait) {
        guard(ctx, 'trùm ' + n.char, function () { OG.Sprites.drawPortrait(ctx, n.char, n.x, n.y, r * 1.7, { t: S.t, state: 'idle', ring: false }); });
      } else { ctx.font = font(28); ctx.fillText('👾', n.x, n.y + 2); }
      if (n.bossId === 'trio' && !n.done) badge(ctx, n.x + r * 0.8, n.y - r * 0.8, '×3', '#e5484d');
    } else if (!n.open) {
      ctx.font = font(26); ctx.fillText('🔒', n.x, n.y + 2);
    } else {
      ctx.font = font(28, '900'); ctx.fillStyle = '#ffffff';
      ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.strokeText(String(n.num), n.x, n.y + 2);
      ctx.fillText(String(n.num), n.x, n.y + 2);
      // sao dưới nút (màn đã xong)
      if (n.done) {
        for (var s = 0; s < 3; s++) {
          var sx = n.x + (s - 1) * 20, sy = n.y + r + 14 - (s === 1 ? 4 : 0);
          if (ui()) ui().drawStar(ctx, sx, sy, 9, s < n.stars ? '#ffc94a' : '#e7e1d2');
        }
      } else if (isNext) {
        // chữ "MỚI" nhún nhảy
        var by = n.y - r - 18 + Math.sin(S.t * 6) * 3;
        U.fillRound(ctx, n.x - 26, by - 13, 52, 26, 13, '#e5484d');
        ctx.font = font(14, '900'); ctx.fillStyle = '#fff'; ctx.fillText('MỚI', n.x, by + 1);
      }
    }
    ctx.restore();
  }

  function drawOggy(ctx) {
    var o = S.oggy, run = OG.Game.run;
    var charId = (run && run.charId) || 'oggy';
    var bob = o.moving ? Math.abs(Math.sin(S.t * 12)) * -4 : 0;
    var anim = o.moving ? 'run' : (S.completed && S.t < 2.5 ? 'victory' : 'idle');
    guard(ctx, 'Oggy trên bản đồ', function () {
      ctx.translate(o.x, o.y - NODE_R + 6 + bob);
      OG.Sprites.drawCharacter(ctx, charId, anim, S.t, { face: o.face, skin: run && run.skinId, scale: 1.05, time: S.t });
    });
  }

  function drawTopBar(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(23,35,61,0.88)';
    ctx.fillRect(0, 0, OG.W, TOP_H);
    ctx.fillStyle = S.pal.primary; ctx.fillRect(0, TOP_H - 5, OG.W, 5);
    button(ctx, BTN.back, '↩', { color: '#52b9df', shadow: '#2582aa', size: 28 });
    var title = (S.j.emoji ? S.j.emoji + ' ' : '') + S.j.title;
    ctx.font = font(28, '900'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.strokeText(title, OG.W / 2 - 40, TOP_H / 2, 520);
    ctx.fillStyle = '#ffd36b'; ctx.fillText(title, OG.W / 2 - 40, TOP_H / 2, 520);
    var pr = J().progress(S.jid), c = U.call('Learn', 'count', S.jid) || { have: 0, total: 0 };
    pill(ctx, OG.W - 236, 15, 110, '⭐ ' + pr.stars + '/' + pr.maxStars);
    pill(ctx, OG.W - 118, 15, 106, '📒 ' + c.have + '/' + c.total);
    ctx.restore();
  }
  function pill(ctx, x, y, w, text) {
    U.fillRound(ctx, x, y, w, 40, 20, '#fff6df');
    ctx.lineWidth = 3; ctx.strokeStyle = INK; U.roundRectPath(ctx, x, y, w, 40, 20); ctx.stroke();
    ctx.font = font(18); ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + 21, w - 10);
  }

  function button(ctx, r, label, opts) {
    opts = opts || {};
    var hov = S.hover === 'btn:' + keyOf(r);
    if (ui()) { ui().drawButton(ctx, r, label, { color: opts.color, shadow: opts.shadow, size: opts.size || 22, hot: hov, pulse: opts.pulse }); return; }
    U.fillRound(ctx, r.x, r.y, r.w, r.h, 16, opts.color || '#f27a43');
    ctx.font = font(opts.size || 22); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2);
  }
  function keyOf(r) { for (var k in BTN) if (BTN[k] === r) return k; return ''; }

  function drawBottom(ctx) {
    ctx.save();
    var y0 = ZONE.y + ZONE.h + 12;
    // người dẫn đường + lời nói
    var g = (OG.Guide && OG.Guide.guideOf) ? OG.Guide.guideOf(S.jid) : (S.j.guide || { charId: 'olivia', name: '' });
    var gx = 62, gy = y0 + 54;
    U.fillRound(ctx, gx - 44, gy - 44, 88, 88, 44, '#fff6df');
    ctx.lineWidth = 4; ctx.strokeStyle = INK;
    ctx.beginPath(); ctx.arc(gx, gy, 44, 0, TAU); ctx.stroke();
    if (OG.Sprites && OG.Sprites.drawPortrait) {
      guard(ctx, 'chân dung ' + g.charId, function () { OG.Sprites.drawPortrait(ctx, g.charId, gx, gy, 82, { t: S.t, state: 'talk', ring: false, bg: '#fff6df' }); });
    }
    if (ui()) {
      ui().drawBubble(ctx, 0, 0, S.msg, {
        tail: 'none', anchor: 'left', boxX: 122, boxY: y0 + 14, size: 18, maxW: 460, name: g.name || '',
        nameColor: S.pal.primary, bounds: { x: 112, y: y0, w: 476, h: OG.H - y0 }
      });
    }
    var done = J().isComplete(S.jid);
    var selDone = S.byId[S.selId] && S.byId[S.selId].done;
    button(ctx, BTN.play, done || selDone ? '🔁 CHƠI LẠI' : '▶ CHƠI TIẾP', { color: '#3fbf6f', shadow: '#2a8a4f', size: 26, pulse: !S.oggy.moving });
    button(ctx, BTN.book, '📒 Sổ tay', { color: '#52b9df', shadow: '#2582aa', size: 20 });
    ctx.restore();
  }

  function drawArrows(ctx) {
    if (btnVisible('left')) button(ctx, BTN.left, '◀', { color: '#17233d', shadow: '#080e1c', size: 28 });
    if (btnVisible('right')) button(ctx, BTN.right, '▶', { color: '#17233d', shadow: '#080e1c', size: 28 });
  }

  // ---------------------------------------------------------------------------
  // API (OG.World.journeyMap)
  // ---------------------------------------------------------------------------
  World.journeyMap = {
    scene: scene,
    register: function () { OG.Scenes.register('journeyMap', scene); },
    isActive: function () { return !!S; },
    // Nút trên bản đồ (toạ độ màn hình) — cho test/tự động hoá.
    getNodes: function () {
      if (!S) return [];
      return S.nodes.map(function (n) {
        return { id: n.id, levelId: n.boss ? n.levelId : n.id, boss: n.boss, x: n.x - S.camX, y: n.y, open: n.open, done: n.done };
      });
    },
    selected: function () { return S ? S.selId : null; },
    clearCache: function () { thumbs = {}; }
  };
})();
