/* OG.Menus (phần HUD) — điểm, mạng, pizza, xu, vật phẩm đang dùng, nhiệm vụ, thanh máu trùm.
 * Chủ sở hữu: agent Menus & Shop (src/ui/). Load SAU src/ui/menus.js.
 *
 * HỢP ĐỒNG (BẮT BUỘC):
 *   OG.Menus.updateHud(hud)    — gọi khi HUD state đổi. Dựng lại (một lần) rồi cập nhật DOM trong #hud.
 *   OG.Menus.drawHud(ctx, hud) — gọi MỖI FRAME sau khi vẽ thế giới, KHÔNG GIAN MÀN HÌNH (960x540):
 *                                đồng hồ, thanh máu trùm, banner phase, viền cảnh báo khi còn 1 mạng.
 *   HudState: { scene, levelId, levelName, icon, pizzas, goal, lives, maxLives, score, coins, shield,
 *               time, boss: null|{id,name,hp,maxHp}, quests:[{id,text,done,progress,target}] }
 * drawHud cũng gọi OG.Shop.tickPlayer (nhảy đôi) như phương án dự phòng khi Player chưa có hook. */
(function () {
  'use strict';
  var OG = window.OG;
  var U = OG.util;
  var Menus = (OG.Menus = OG.Menus || {});

  function fmt(n) { return String(Math.round(+n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function setText(el, s) { if (el && el.textContent !== s) el.textContent = s; }
  function setHtml(el, s) { if (el && el.__html !== s) { el.__html = s; el.innerHTML = s; } }
  // Chạy lại animation CSS (thêm/xoá class).
  function bump(el, cls) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth; // ép reflow để animation chạy lại
    el.classList.add(cls);
  }

  // ---------------------------------------------------------------------
  // HUD DOM
  // ---------------------------------------------------------------------
  var refs = null;
  var last = { score: null, lives: null, coins: null, pizzas: null };

  function buildHud() {
    var hud = document.getElementById('hud');
    if (!hud) return null;
    if (refs && refs.root === hud && hud.querySelector('.ui-hud-left')) return refs;
    hud.classList.add('ui-hud');
    hud.innerHTML =
      '<div class="ui-hud-col ui-hud-left">' +
        '<div class="ui-hud-row">' +
          '<div class="pill ui-pill ui-pill-level" id="level"></div>' +
          '<div class="pill ui-pill ui-goal" id="objective"><span class="ui-goal-text"></span><i class="ui-goal-bar"><b></b></i></div>' +
        '</div>' +
        '<div class="ui-items"></div>' +
      '</div>' +
      '<div class="ui-hud-col ui-hud-right">' +
        '<div class="ui-hud-row">' +
          '<div class="pill ui-pill" id="coins"></div>' +
          '<div class="pill ui-pill ui-lives" id="lives"></div>' +
          '<div class="pill ui-pill ui-score" id="score"></div>' +
        '</div>' +
        '<ul class="ui-quests"></ul>' +
      '</div>';
    refs = {
      root: hud,
      level: hud.querySelector('#level'),
      goal: hud.querySelector('#objective'),
      goalText: hud.querySelector('.ui-goal-text'),
      goalBar: hud.querySelector('.ui-goal-bar b'),
      items: hud.querySelector('.ui-items'),
      coins: hud.querySelector('#coins'),
      lives: hud.querySelector('#lives'),
      score: hud.querySelector('#score'),
      quests: hud.querySelector('.ui-quests')
    };
    last = { score: null, lives: null, coins: null, pizzas: null };
    return refs;
  }

  function livesHtml(lives, max) {
    lives = Math.max(0, lives | 0);
    max = Math.max(lives, max | 0);
    if (max > 6) return '❤️<span class="ui-x">×' + lives + '</span>';
    var s = '';
    for (var i = 0; i < max; i++) s += i < lives ? '<span class="ui-heart">❤️</span>' : '<span class="ui-heart is-empty">🖤</span>';
    return s;
  }

  Menus.updateHud = function (h) {
    if (!h) return;
    var r = buildHud();
    if (!r) return;
    var inBoss = h.scene === 'boss';

    setText(r.level, (h.icon || '📍') + ' ' + (h.levelName || ''));

    // Mục tiêu pizza (ẩn trong trận trùm).
    r.goal.style.display = inBoss ? 'none' : '';
    var goal = Math.max(1, h.goal | 0), piz = h.pizzas | 0;
    setText(r.goalText, '🍕 ' + piz + '/' + (h.goal | 0));
    r.goalBar.style.width = Math.min(100, (piz / goal) * 100).toFixed(0) + '%';
    r.goal.classList.toggle('is-done', piz >= goal && goal > 0);
    if (last.pizzas !== null && piz > last.pizzas) bump(r.goal, 'ui-bump');
    last.pizzas = piz;

    // Xu
    setText(r.coins, '🪙 ' + fmt(h.coins));
    if (last.coins !== null && h.coins > last.coins) bump(r.coins, 'ui-bump');
    last.coins = h.coins;

    // Mạng
    setHtml(r.lives, livesHtml(h.lives, h.maxLives));
    if (last.lives !== null && h.lives < last.lives) bump(r.lives, 'ui-hurt');
    else if (last.lives !== null && h.lives > last.lives) bump(r.lives, 'ui-bump');
    r.lives.classList.toggle('is-low', (h.lives | 0) === 1);
    last.lives = h.lives;

    // Điểm
    setText(r.score, '⭐ ' + fmt(h.score));
    if (last.score !== null && h.score > last.score) bump(r.score, 'ui-bump');
    last.score = h.score;

    // Vật phẩm đang có tác dụng
    var chips = '';
    if ((h.shield | 0) > 0) chips += '<span class="ui-chip" title="Khiên">🛡️<b>' + (h.shield | 0) + '</b></span>';
    var act = U.call('Shop', 'getActive');
    if (act && act.levelId === h.levelId) {
      if (act.doubleJump) chips += '<span class="ui-chip" title="Nhảy đôi">👟<b>×2</b></span>';
      if (act.magnet) chips += '<span class="ui-chip" title="Nam châm">🧲</span>';
    }
    setHtml(r.items, chips);

    // Nhiệm vụ (tối đa 3 dòng)
    var qs = Array.isArray(h.quests) ? h.quests.slice(0, 3) : [];
    var UI = Menus.ui;
    setHtml(r.quests, qs.map(function (q) {
      if (UI && UI.questLine) return UI.questLine(q, h.levelId);
      return '<li class="' + (q.done ? 'is-done' : '') + '">' + (q.done ? '✅ ' : '◻️ ') + U.escapeHtml(q.text || '') + '</li>';
    }).join(''));
  };

  // ---------------------------------------------------------------------
  // HUD canvas
  // ---------------------------------------------------------------------
  var FONT = '"Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';
  var bossFx = { id: null, lagHp: 0, shownHp: 0, flash: 0, lastT: 0 };
  var phaseBanner = { text: '', t: 0 };

  OG.Events.on('boss:phase', function (e) {
    if (!e) return;
    phaseBanner.text = 'GIAI ĐOẠN ' + (e.phase | 0 || e.phase);
    phaseBanner.t = 1.8;
  });
  OG.Events.on('boss:start', function () { bossFx.id = null; phaseBanner.t = 0; });

  // Lấy player đang chơi (để xử lý nhảy đôi).
  function currentPlayer(h) {
    var cur = OG.Scenes.current();
    if (cur === 'level' && OG.Level && OG.Level.state) return OG.Level.state.player;
    if (cur === 'boss' && OG.BossScene) {
      if (typeof OG.BossScene.getPlayer === 'function') return U.safe('BossScene.getPlayer', OG.BossScene.getPlayer, OG.BossScene);
      if (OG.BossScene.arena && OG.BossScene.arena.player) return OG.BossScene.arena.player;
    }
    return null;
  }

  function pill(ctx, x, y, w, h, fill, stroke) {
    U.fillRound(ctx, x, y, w, h, h / 2, fill);
    if (stroke) {
      ctx.lineWidth = 2; ctx.strokeStyle = stroke;
      U.roundRectPath(ctx, x, y, w, h, h / 2); ctx.stroke();
    }
  }

  function drawTimer(ctx, h) {
    var text = '⏱ ' + U.formatTime(h.time);
    ctx.font = 'bold 15px ' + FONT;
    var w = Math.max(70, ctx.measureText(text).width + 22);
    var x = (OG.W - w) / 2, y = 62;
    pill(ctx, x, y, w, 26, 'rgba(23,35,61,0.72)', 'rgba(255,244,214,0.8)');
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, OG.W / 2, y + 14);
  }

  function drawBossBar(ctx, b, dt) {
    var maxHp = Math.max(1, b.maxHp | 0 || 1);
    var hp = U.clamp(+b.hp || 0, 0, maxHp);
    if (bossFx.id !== b.id) { bossFx.id = b.id; bossFx.lagHp = hp; bossFx.shownHp = hp; bossFx.flash = 0; }
    if (hp < bossFx.shownHp) bossFx.flash = 0.35;
    bossFx.shownHp = hp;
    // Thanh "trễ" giảm dần về máu thật.
    bossFx.lagHp = Math.max(hp, bossFx.lagHp - Math.max(0.6, (bossFx.lagHp - hp) * 2.5) * dt);
    bossFx.flash = Math.max(0, bossFx.flash - dt);

    var W = 380, H = 18, x = (OG.W - W) / 2, y = 82;
    var t = OG.time;
    ctx.save();
    // Khung
    U.fillRound(ctx, x - 52, y - 26, W + 64, H + 38, 16, 'rgba(23,35,61,0.86)');
    ctx.lineWidth = 3; ctx.strokeStyle = '#fff4d6';
    U.roundRectPath(ctx, x - 52, y - 26, W + 64, H + 38, 16); ctx.stroke();

    // Chân dung trùm
    var ch = OG.Data.characters[b.id];
    var col = (ch && ch.colors && ch.colors.body) || OG.Palette.danger;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x - 26, y + 3, 21, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#fff4d6'; ctx.stroke();
    if (ch && OG.Sprites && typeof OG.Sprites.drawCharacter === 'function') {
      ctx.save();
      ctx.beginPath(); ctx.arc(x - 26, y + 3, 19, 0, Math.PI * 2); ctx.clip();
      var sc = Math.min(30 / ch.w, 34 / ch.h);
      ctx.translate(x - 26, y + 20);
      ctx.scale(sc, sc);
      U.safe('Sprites.drawCharacter(bossHud)', OG.Sprites.drawCharacter, OG.Sprites,
        [ctx, b.id, bossFx.flash > 0 ? 'hurt' : 'idle', t, { face: 1, w: ch.w, h: ch.h, time: t }]);
      ctx.restore();
    }

    // Tên
    ctx.font = 'bold 14px ' + FONT;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ffd36b';
    ctx.fillText('👑 ' + (b.name || b.id), x, y - 7);
    ctx.textAlign = 'right'; ctx.fillStyle = '#fff6df';
    ctx.fillText(Math.ceil(hp) + '/' + maxHp, x + W, y - 7);

    // Thanh máu
    U.fillRound(ctx, x, y, W, H, H / 2, '#3a2333');
    var lagW = W * (bossFx.lagHp / maxHp);
    if (lagW > 1) U.fillRound(ctx, x, y, Math.max(H, lagW), H, H / 2, '#ffd36b');
    var hpW = W * (hp / maxHp);
    if (hpW > 1) {
      var g = ctx.createLinearGradient(0, y, 0, y + H);
      g.addColorStop(0, bossFx.flash > 0 ? '#ffffff' : '#ff6b6f');
      g.addColorStop(1, bossFx.flash > 0 ? '#ffd0d0' : '#c9343a');
      U.fillRound(ctx, x, y, Math.max(H, hpW), H, H / 2, g);
      // vệt sáng
      U.fillRound(ctx, x + 4, y + 3, Math.max(4, hpW - 8), 4, 2, 'rgba(255,255,255,0.35)');
    }
    // Vạch chia theo HP (nếu ít máu)
    if (maxHp <= 24) {
      ctx.fillStyle = 'rgba(23,35,61,0.55)';
      for (var i = 1; i < maxHp; i++) ctx.fillRect(Math.round(x + (W * i) / maxHp) - 1, y + 2, 2, H - 4);
    }
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,244,214,0.9)';
    U.roundRectPath(ctx, x, y, W, H, H / 2); ctx.stroke();
    ctx.restore();
  }

  function drawPhaseBanner(ctx, dt) {
    if (phaseBanner.t <= 0) return;
    phaseBanner.t -= dt;
    var a = U.clamp(Math.min(phaseBanner.t, 1.8 - phaseBanner.t) * 4, 0, 1);
    var sc = 1 + Math.max(0, phaseBanner.t - 1.5) * 1.2;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(OG.W / 2, 170);
    ctx.scale(sc, sc);
    ctx.font = '900 38px ' + FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 8; ctx.strokeStyle = '#17233d';
    ctx.strokeText(phaseBanner.text, 0, 0);
    ctx.fillStyle = '#ffd36b';
    ctx.fillText(phaseBanner.text, 0, 0);
    ctx.restore();
  }

  function drawLowLife(ctx) {
    var a = 0.22 + Math.sin(OG.time * 5) * 0.1;
    ctx.save();
    var g = ctx.createRadialGradient(OG.W / 2, OG.H / 2, OG.H * 0.42, OG.W / 2, OG.H / 2, OG.W * 0.62);
    g.addColorStop(0, 'rgba(229,72,77,0)');
    g.addColorStop(1, 'rgba(229,72,77,' + a.toFixed(3) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, OG.W, OG.H);
    ctx.restore();
  }

  Menus.drawHud = function (ctx, h) {
    if (!ctx || !h) return;
    var now = OG.time;
    var dt = U.clamp(now - (bossFx.lastT || now), 0, 0.05);
    bossFx.lastT = now;

    // Nhảy đôi (dự phòng): chỉ khi scene chơi đang ở trên cùng (không phải lúc pause).
    var p = currentPlayer(h);
    if (p) U.call('Shop', 'tickPlayer', p, dt);

    var playing = h.scene === 'level' || h.scene === 'boss';
    ctx.save();
    if (playing && (h.lives | 0) === 1) drawLowLife(ctx);
    if (h.boss) drawBossBar(ctx, h.boss, dt);
    else if (h.scene === 'level') drawTimer(ctx, h);
    drawPhaseBanner(ctx, dt);
    ctx.restore();
  };
})();
