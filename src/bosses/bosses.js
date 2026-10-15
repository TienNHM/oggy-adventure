/* OG.Bosses — registry trùm + bộ công cụ dùng chung (OG.Bosses.kit) + bộ điều khiển trận độc lập.
 * Chủ sở hữu: agent Bosses (src/bosses/). Các trùm cụ thể nằm ở joey.js, marky.js, deedee.js, trio.js
 * và gọi OG.Bosses.register(def) khi load.
 *
 * HỢP ĐỒNG (docs/ARCHITECTURE.md mục 8.3):
 *   init()  register(def)  has(id)  list()  getInfo(id)  getArena(id)  create(id, arena)
 *   def = { id, name, maxHp, arena?: {width, platforms:[[x,y,w,h]], spawn:{x,y}, theme}, create(arena) -> BossInstance }
 *   BossInstance = { id, name, hp, maxHp, phase, x, y, w, h, update(dt, arena), draw(ctx, arena),
 *                    getHurtboxes() -> [rect], getWeakspot() -> rect|null, onHit(dmg, arena), isDefeated() }
 *
 * MỞ RỘNG (tuỳ chọn, scene 'boss' của Tích hợp KHÔNG cần dùng):
 *   OG.Bosses.start(bossId, arenaLike) -> fight | null   — tự lo giẫm/chạm/emit boss:start|hit|defeated
 *   OG.Bosses.update(dt)  OG.Bosses.draw(ctx)  OG.Bosses.stop()  OG.Bosses.active()
 *   OG.Bosses.factories[id](arena, cfg) — hàm tạo trùm có cấu hình (trio dùng lại joey/marky/deedee)
 *
 * Cơ chế chung của mọi trùm:
 *   - Có 2–3 pha theo ngưỡng máu (phaseAt). Đổi pha: trùm gầm (bất tử ngắn) và tự phát 'boss:phase'.
 *   - Mọi đòn đều có báo trước (chấm than, vùng đỏ trên sàn, mũi tên, bóng đổ).
 *   - Điểm yếu: giẫm lên đầu khi trùm lộ sơ hở (có mũi tên vàng "GIẪM!"), hoặc nhấn E/J (nút ✦)
 *     gần đạn có thể phản (nắp chai, cờ lê) để đánh bật nó về phía trùm.
 *   - Sau khi trúng đòn: bất tử 1,2 s và không gây sát thương khi chạm trong 0,9 s (công bằng sau cú giẫm). */
(function () {
  'use strict';
  var OG = window.OG;
  var U = OG.util;
  var defs = {};

  var INV_TIME = 1.2;       // bất tử sau khi trúng đòn
  var STAGGER_TIME = 0.9;   // không gây sát thương khi chạm sau khi trúng đòn
  var REFLECT_RANGE = 80;   // khoảng cách (px) từ tâm người chơi để đánh bật đạn
  var REFLECT_SPEED = 600;

  function gravity() { return (OG.Config && OG.Config.GRAVITY) || 1500; }

  // ---------------------------------------------------------------------------
  // Kit: tiện ích dùng chung cho các file trùm.
  // ---------------------------------------------------------------------------
  var K = {
    actionSeq: 0,          // tăng mỗi khi người chơi nhấn action (E/J/✦)
    INV_TIME: INV_TIME,
    STAGGER_TIME: STAGGER_TIME,
    drawers: {},           // kind -> function(ctx, proj, t) vẽ đạn
    _spriteBroken: false,
    _anims: null
  };

  // Gọi arena[name](...) nếu có.
  K.call = function (arena, name) {
    if (!arena || typeof arena[name] !== 'function') return undefined;
    try { return arena[name].apply(arena, Array.prototype.slice.call(arguments, 2)); }
    catch (e) { console.error('[OG.Bosses] arena.' + name, e); return undefined; }
  };

  K.floorY = function (arena) { return (arena && arena.floorY) || OG.FLOOR_Y || 480; };
  K.width = function (arena) { return (arena && arena.width) || OG.W || 960; };

  var DUMMY_PLAYER = { x: 80, y: 428, w: 34, h: 52, vx: 0, vy: 0, inv: 0 };
  K.player = function (arena) { return (arena && arena.player) || DUMMY_PLAYER; };
  K.pcx = function (arena) { var p = K.player(arena); return p.x + p.w / 2; };
  K.pcy = function (arena) { var p = K.player(arena); return p.y + p.h / 2; };

  K.overlap = function (a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  };
  K.overlapsPlayer = function (arena, rect) {
    if (arena && typeof arena.overlapsPlayer === 'function') return !!K.call(arena, 'overlapsPlayer', rect);
    return K.overlap(K.player(arena), rect);
  };
  K.hurtPlayer = function (arena, cause) { return !!K.call(arena, 'hurtPlayer', cause || 'projectile'); };
  K.emit = function (arena, name, payload) {
    if (arena && typeof arena.emit === 'function') K.call(arena, 'emit', name, payload);
    else if (OG.Events) OG.Events.emit(name, payload);
  };
  K.puff = function (arena, x, y, color, count, speed) {
    K.call(arena, 'particles', x, y, { color: color || '#ffffff', count: count || 8, speed: speed || 160 });
  };
  K.text = function (arena, x, y, text, color) { K.call(arena, 'floatText', x, y, text, color); };

  // Điền các hàm còn thiếu của arena (khi scene khác/stub truyền arena chưa đầy đủ).
  K.normalizeArena = function (arena) {
    arena = arena || {};
    if (!arena.width) arena.width = OG.W || 960;
    if (!arena.height) arena.height = OG.H || 540;
    if (!arena.floorY) arena.floorY = OG.FLOOR_Y || 480;
    if (arena.t == null) arena.t = 0;
    if (!arena.enemies) arena.enemies = [];
    if (!arena.platforms) arena.platforms = [{ x: 0, y: arena.floorY, w: arena.width, h: 60, isFloor: true }];
    if (!arena.player) arena.player = { x: 80, y: arena.floorY - 52, w: 34, h: 52, vx: 0, vy: 0, inv: 0 };
    var fallbacks = {
      hurtPlayer: function (cause) {
        if (OG.Player && OG.Player.hurt) return OG.Player.hurt(arena.player, cause || 'boss');
        return false;
      },
      overlapsPlayer: function (r) { return K.overlap(arena.player, r); },
      shake: function (m, d) { if (OG.Camera && OG.Camera.shake) OG.Camera.shake(m, d); },
      particles: function (x, y, o) { if (OG.Particles && OG.Particles.spawn) OG.Particles.spawn(x, y, o); },
      floatText: function (x, y, s, c) { if (OG.Particles && OG.Particles.floatText) OG.Particles.floatText(x, y, s, c); },
      toast: function (s) { if (OG.DOM && OG.DOM.toast) OG.DOM.toast(s); },
      emit: function (n, p) { if (OG.Events) OG.Events.emit(n, p); },
      addScore: function (n) { if (OG.Game && OG.Game.addScore) OG.Game.addScore(n); },
      spawnEnemy: function (src) {
        if (!OG.Enemies || !OG.Enemies.create) return null;
        var e = OG.Enemies.create(src, arena.enemies.length);
        arena.enemies.push(e);
        return e;
      }
    };
    for (var k in fallbacks) if (typeof arena[k] !== 'function') arena[k] = fallbacks[k];
    return arena;
  };

  // Dời toạ độ tâm cx ra khỏi vùng ngay dưới các bục (platform một chiều chặn người chơi rơi xuống,
  // nên trùm choáng dưới bục sẽ không giẫm được). halfW = nửa bề ngang trùm.
  K.clearSpot = function (arena, cx, halfW) {
    var W = K.width(arena), floorY = K.floorY(arena), list = (arena && arena.platforms) || [];
    for (var pass = 0; pass < 3; pass++) {
      var moved = false;
      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        if (!p || p.isFloor || p.y >= floorY - 1) continue;
        if (cx + halfW > p.x && cx - halfW < p.x + p.w) {
          var l = p.x - halfW - 6, r = p.x + p.w + halfW + 6;
          var okL = l >= halfW, okR = r <= W - halfW;
          cx = okL && (!okR || Math.abs(cx - l) <= Math.abs(cx - r)) ? l : r;
          moved = true;
        }
      }
      if (!moved) break;
    }
    return Math.max(halfW, Math.min(W - halfW, cx));
  };

  // Lính gián còn sống trong arena.
  K.aliveMinions = function (arena) {
    var n = 0, list = (arena && arena.enemies) || [];
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].alive) n++;
    return n;
  };
  // Dọn lính khi trùm gục: ẩn ngay (deadT>0.5 để Enemies.draw bỏ qua) kèm khói.
  K.killMinions = function (arena) {
    var list = (arena && arena.enemies) || [];
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e || !e.alive) continue;
      e.alive = false;
      e.deadT = 0.6;
      K.puff(arena, e.x + e.w / 2, e.y + e.h / 2, '#b56bc7', 8, 140);
    }
  };

  // Bảng animState mà Sprites hỗ trợ; ánh xạ trạng thái tuỳ chọn về trạng thái bắt buộc.
  K.anim = function (want) {
    if (!K._anims) {
      var list = null;
      try { if (OG.Sprites && typeof OG.Sprites.getAnimStates === 'function') list = OG.Sprites.getAnimStates(); } catch (e) { list = null; }
      K._anims = Array.isArray(list) && list.length ? list : ['idle', 'run', 'jump', 'fall', 'hurt', 'attack', 'victory'];
    }
    if (K._anims.indexOf(want) >= 0) return want;
    var map = { walk: 'run', stunned: 'hurt', dead: 'hurt', roll: 'attack' };
    return map[want] || 'idle';
  };

  // Màu trùm (để vẽ fallback và chi tiết phụ).
  K.colorOf = function (charId) {
    var P = OG.Palette || {};
    var c = { joey: P.joey || '#c45bd1', marky: P.marky || '#5fae4e', deedee: P.deedee || '#e08a3c' };
    return c[charId] || P.roachBody || '#7d3e9b';
  };

  // Vẽ thân trùm bằng OG.Sprites.drawCharacter; nếu không có hoặc lỗi thì tự vẽ hình gián đơn giản.
  // Gốc toạ độ hiện tại phải là CHÂN trùm (giữa-đáy hitbox).
  K.drawSprite = function (ctx, b, anim, opts) {
    opts = opts || {};
    var o = {
      face: b.face || 1, scale: b.scale, w: b.baseW, h: b.baseH,
      flash: b.flashT > 0, alpha: opts.alpha != null ? opts.alpha : 1, time: OG.time,
      vx: b.vx, vy: b.vy
    };
    if (opts.colors) o.colors = opts.colors;
    if (!K._spriteBroken && OG.Sprites && typeof OG.Sprites.drawCharacter === 'function') {
      ctx.save();
      try {
        OG.Sprites.drawCharacter(ctx, b.charId, K.anim(anim), b.animT, o);
        ctx.restore();
        return;
      } catch (e) {
        ctx.restore();
        K._spriteBroken = true;
        console.error('[OG.Bosses] OG.Sprites.drawCharacter lỗi, chuyển sang hình dự phòng', e);
      }
    }
    K.drawFallback(ctx, b, o);
  };

  // Hình dự phòng: gián bo tròn theo màu trùm.
  K.drawFallback = function (ctx, b, o) {
    var w = b.baseW * b.scale, h = b.baseH * b.scale;
    var col = o.flash ? '#ffffff' : K.colorOf(b.charId);
    ctx.save();
    ctx.globalAlpha *= o.alpha;
    ctx.scale(o.face < 0 ? -1 : 1, 1);
    U.fillRound(ctx, -w / 2, -h, w, h * 0.92, Math.min(w, h) * 0.4, col);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.ellipse(-w * 0.08, -h * 0.62, w * 0.3, h * 0.22, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(-w * 0.12, -h * 0.78, w * 0.13, 0, 7); ctx.arc(w * 0.18, -h * 0.78, w * 0.13, 0, 7); ctx.fill();
    ctx.fillStyle = '#17233d';
    ctx.beginPath(); ctx.arc(-w * 0.07, -h * 0.77, w * 0.05, 0, 7); ctx.arc(w * 0.23, -h * 0.77, w * 0.05, 0, 7); ctx.fill();
    // râu
    ctx.strokeStyle = '#17233d'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-w * 0.05, -h); ctx.quadraticCurveTo(-w * 0.2, -h * 1.15, -w * 0.35, -h * 1.08);
    ctx.moveTo(w * 0.1, -h); ctx.quadraticCurveTo(w * 0.25, -h * 1.15, w * 0.4, -h * 1.08); ctx.stroke();
    // chân
    ctx.lineWidth = 3;
    for (var i = 0; i < 3; i++) {
      var lx = -w * 0.3 + i * w * 0.3;
      ctx.beginPath(); ctx.moveTo(lx, -h * 0.1); ctx.lineTo(lx - 4, 0); ctx.stroke();
    }
    ctx.restore();
  };

  // ---------- Telegraph & hiệu ứng vẽ ----------

  // Bong bóng chấm than (hoặc biểu tượng) phía trên đầu.
  K.drawBubble = function (ctx, x, y, t, text, color) {
    var bob = Math.sin(t * 10) * 3;
    ctx.save();
    ctx.translate(x, y + bob);
    U.fillRound(ctx, -16, -30, 32, 30, 10, '#ffffff');
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(-5, -1); ctx.lineTo(5, -1); ctx.lineTo(0, 8); ctx.fill();
    ctx.strokeStyle = '#17233d'; ctx.lineWidth = 2;
    U.roundRectPath(ctx, -16, -30, 32, 30, 10); ctx.stroke();
    ctx.fillStyle = color || '#e5484d';
    ctx.font = 'bold 22px "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text || '!', 0, -14);
    ctx.restore();
  };

  // Vùng cảnh báo đỏ trên sàn (sọc nhấp nháy). intensity 0..1 tăng dần khi sắp đánh.
  K.drawWarnZone = function (ctx, x, w, floorY, t, intensity, height) {
    var hgt = height || 26;
    var a = 0.18 + 0.32 * (intensity || 0) + Math.sin(t * 18) * 0.08;
    ctx.save();
    ctx.globalAlpha = Math.max(0.05, Math.min(0.75, a));
    ctx.fillStyle = '#e5484d';
    ctx.fillRect(x, floorY - hgt, w, hgt);
    ctx.globalAlpha *= 0.8;
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.rect(x, floorY - hgt, w, hgt);
    ctx.clip();
    for (var sx = x - hgt; sx < x + w + hgt; sx += 18) {
      ctx.moveTo(sx, floorY); ctx.lineTo(sx + hgt, floorY - hgt);
    }
    ctx.stroke();
    ctx.restore();
  };

  // Mũi tên ngang chỉ hướng lao.
  K.drawArrow = function (ctx, x, y, dir, t, color) {
    var off = Math.sin(t * 14) * 5;
    ctx.save();
    ctx.translate(x + dir * off, y);
    ctx.scale(dir, 1);
    ctx.fillStyle = color || '#e5484d';
    ctx.strokeStyle = '#17233d'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(22, -7); ctx.lineTo(22, -15); ctx.lineTo(40, 0);
    ctx.lineTo(22, 15); ctx.lineTo(22, 7); ctx.lineTo(0, 7); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  };

  // Mũi tên vàng "GIẪM!" báo điểm yếu đang mở.
  K.drawStompHint = function (ctx, x, y, t) {
    var bob = Math.abs(Math.sin(t * 6)) * 8;
    ctx.save();
    ctx.translate(x, y - 18 - bob);
    ctx.fillStyle = '#ffc94a'; ctx.strokeStyle = '#17233d'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-7, -18); ctx.lineTo(7, -18); ctx.lineTo(7, -8); ctx.lineTo(14, -8);
    ctx.lineTo(0, 4); ctx.lineTo(-14, -8); ctx.lineTo(-7, -8); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.font = 'bold 12px "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif'; ctx.textAlign = 'center';
    ctx.lineWidth = 3; ctx.strokeText('GIẪM!', 0, -23);
    ctx.fillStyle = '#ffffff'; ctx.fillText('GIẪM!', 0, -23);
    ctx.restore();
  };

  // Sao xoay quanh đầu khi choáng.
  K.drawStars = function (ctx, x, y, t, r) {
    r = r || 22;
    ctx.save();
    for (var i = 0; i < 3; i++) {
      var a = t * 5 + i * (Math.PI * 2 / 3);
      var sx = x + Math.cos(a) * r, sy = y + Math.sin(a) * r * 0.35;
      ctx.fillStyle = '#ffc94a'; ctx.strokeStyle = '#17233d'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (var k = 0; k < 10; k++) {
        var rr = k % 2 ? 3 : 7, aa = k * Math.PI / 5 - Math.PI / 2;
        ctx.lineTo(sx + Math.cos(aa) * rr, sy + Math.sin(aa) * rr);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  };

  // Bóng đổ trên sàn (đồ vật sắp rơi xuống).
  K.drawShadow = function (ctx, x, floorY, r, alpha) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.fillStyle = '#17233d';
    ctx.beginPath(); ctx.ellipse(x, floorY - 2, r, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha *= 0.8;
    ctx.strokeStyle = '#e5484d'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x, floorY - 2, r + 6, (r + 6) * 0.3, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  };

  // Thanh máu nhỏ trên đầu (dùng cho từng thành viên trận bộ ba).
  K.drawMiniBar = function (ctx, b) {
    var w = Math.max(44, b.w), x = b.x + b.w / 2 - w / 2, y = b.y - 16;
    ctx.save();
    U.fillRound(ctx, x - 2, y - 2, w + 4, 10, 5, '#17233dcc');
    var ratio = b.maxHp ? Math.max(0, b.hp / b.maxHp) : 0;
    if (ratio > 0) U.fillRound(ctx, x, y, Math.max(6, w * ratio), 6, 3, '#e5484d');
    ctx.font = 'bold 11px "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#17233d'; ctx.lineWidth = 3;
    ctx.strokeText(b.name, b.x + b.w / 2, y - 5); ctx.fillText(b.name, b.x + b.w / 2, y - 5);
    ctx.restore();
  };

  // ---------- Đạn / bẫy ----------
  // Proj: {kind, x, y (tâm), r, vx, vy, g, life, reflectable, reflected, bounces, maxBounces,
  //        hurts, dead, t, rect?(p) -> {x,y,w,h}, update?(p, dt, arena, b), onFloor?(p, arena, b)}
  K.spawnProj = function (b, p) {
    p.t = 0; p.dead = false;
    if (p.r == null) p.r = 8;
    if (p.vx == null) p.vx = 0;
    if (p.vy == null) p.vy = 0;
    if (p.g == null) p.g = 0;
    if (p.life == null) p.life = 4;
    if (p.hurts == null) p.hurts = true;
    if (p.bounces == null) p.bounces = 0;
    if (p.maxBounces == null) p.maxBounces = 0;
    p.owner = b;
    b.projectiles.push(p);
    return p;
  };
  K.projRect = function (p) {
    if (typeof p.rect === 'function') return p.rect(p);
    return { x: p.x - p.r, y: p.y - p.r, w: p.r * 2, h: p.r * 2 };
  };

  // Đánh bật đạn khi người chơi nhấn action ở gần.
  // Mỗi cú vung có hồi chiêu 0,5 s để không thể bấm liên tục mà phản mọi thứ (cần canh thời điểm).
  function tryReflect(b, arena, dt) {
    b._reflectCd = Math.max(0, (b._reflectCd || 0) - dt);
    if (b._seenAction === K.actionSeq) return;
    b._seenAction = K.actionSeq;
    if (b._reflectCd > 0) return;
    b._reflectCd = 0.5;
    var px = K.pcx(arena), py = K.pcy(arena);
    for (var i = 0; i < b.projectiles.length; i++) {
      var p = b.projectiles[i];
      if (p.dead || !p.reflectable || p.reflected) continue;
      var dx = p.x - px, dy = p.y - py;
      if (dx * dx + dy * dy > REFLECT_RANGE * REFLECT_RANGE) continue;
      reflect(p, arena);
    }
  }
  function reflect(p, arena) {
    var target = p.owner;
    var tx = target.x + target.w / 2, ty = target.y + target.h * 0.45;
    var dx = tx - p.x, dy = ty - p.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
    p.reflected = true;
    p.g = 0;
    p.ax = 0;
    p.vx = dx / d * REFLECT_SPEED;
    p.vy = dy / d * REFLECT_SPEED;
    p.life = 2;
    K.puff(arena, p.x, p.y, '#7fe0ff', 10, 200);
    K.text(arena, p.x, p.y - 16, 'Phản đòn!', '#7fe0ff');
    K.call(arena, 'shake', 3, 0.12);
  }

  // Đạn phản trúng trùm: trừ máu qua root (trio gộp máu), cộng điểm, phát boss:hit.
  K.reflectHit = function (b, arena) {
    var root = b.root || b;
    var ok = root.onHit(1, arena, b);
    if (!ok) return false;
    K.call(arena, 'addScore', 100);
    K.text(arena, b.x + b.w / 2, b.y - 10, '+100', '#ffc94a');
    K.emit(arena, 'boss:hit', { bossId: root.id, hp: root.hp, maxHp: root.maxHp, source: 'reflect' });
    return true;
  };

  K.updateProjectiles = function (b, dt, arena) {
    if (!b.dead) tryReflect(b, arena, dt);
    var floorY = K.floorY(arena), W = K.width(arena);
    for (var i = b.projectiles.length - 1; i >= 0; i--) {
      var p = b.projectiles[i];
      if (!p) continue; // danh sách có thể bị xoá giữa chừng (trùm gục vì đạn phản)
      p.t += dt;
      p.life -= dt;
      if (b.dead) p.dead = true;
      if (!p.dead && typeof p.update === 'function') p.update(p, dt, arena, b);
      else if (!p.dead) {
        p.vx += (p.ax || 0) * dt;
        p.vy += p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.y + p.r >= floorY && p.vy > 0 && !p.reflected) {
          if (typeof p.onFloor === 'function') p.onFloor(p, arena, b);
          else if (p.bounces < p.maxBounces) {
            p.bounces++;
            p.y = floorY - p.r;
            p.vy = -p.vy * 0.5;
            p.vx *= 0.8;
          } else {
            p.dead = true;
            K.puff(arena, p.x, floorY - 4, '#d9dde3', 5, 90);
          }
        }
      }
      if (p.life <= 0 || p.x < -80 || p.x > W + 80 || p.y > floorY + 120) p.dead = true;
      if (p.dead) { b.projectiles.splice(i, 1); continue; }

      var rect = K.projRect(p);
      if (p.reflected) {
        // Bay về phía trùm chủ; trúng thì trùm mất máu.
        var tb = p.owner;
        if (!tb.dead && K.overlap(rect, { x: tb.x, y: tb.y, w: tb.w, h: tb.h })) {
          p.dead = true;
          K.puff(arena, p.x, p.y, '#ffc94a', 12, 220);
          if (!K.reflectHit(tb, arena)) K.text(arena, p.x, p.y, 'Keng!', '#ffffff');
          b.projectiles.splice(i, 1);
        }
        continue;
      }
      if (p.hurts && (p.armed === undefined || p.armed) && K.overlapsPlayer(arena, rect)) {
        var pl = K.player(arena);
        if (!(pl.inv > 0)) {
          K.hurtPlayer(arena, 'projectile');
          if (typeof p.onHitPlayer === 'function') p.onHitPlayer(p, arena, b);
          else p.dead = true;
          if (p.dead) b.projectiles.splice(i, 1);
        }
      }
    }
  };

  K.drawProjectiles = function (ctx, b) {
    for (var i = 0; i < b.projectiles.length; i++) {
      var p = b.projectiles[i];
      var fn = K.drawers[p.kind];
      ctx.save();
      if (p.reflected) {
        // vệt sáng xanh khi bị đánh bật
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#7fe0ff';
        ctx.beginPath(); ctx.arc(p.x - p.vx * 0.03, p.y - p.vy * 0.03, p.r + 6, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (fn) fn(ctx, p, OG.time || 0, b);
      else { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
  };

  // ---------------------------------------------------------------------------
  // Khung trùm dùng chung. spec = {id, name, charId, maxHp, scale, phaseAt:[hp ngưỡng], phaseLines:{2:'..',3:'..'}}
  // cfg (tuỳ chọn) = {maxHp, scale, phaseAt, emitPhase, speedMul, ctrl, root, x, patterns, miniBar, onDeath}
  // Mỗi trùm gán thêm: think(dt, arena), startAction(name, arena), isVulnerable(), isFullHurt(),
  //                    onHurt(arena), drawBehind(ctx, arena), drawFront(ctx, arena), drawBody(ctx, arena)
  // ---------------------------------------------------------------------------
  K.createBase = function (spec, arena, cfg) {
    cfg = cfg || {};
    var ch = (OG.Data && OG.Data.characters && OG.Data.characters[spec.charId]) || null;
    var baseW = (ch && ch.w) || spec.baseW || 40;
    var baseH = (ch && ch.h) || spec.baseH || 40;
    var scale = cfg.scale || spec.scale || 2;
    var maxHp = cfg.maxHp || spec.maxHp || 5;
    var floorY = K.floorY(arena);
    var b = {
      id: spec.id, name: cfg.name || spec.name, charId: spec.charId,
      hp: maxHp, maxHp: maxHp, phase: 1,
      phaseAt: cfg.phaseAt || spec.phaseAt || [],
      phaseLines: spec.phaseLines || {},
      emitPhase: cfg.emitPhase !== false,
      baseW: baseW, baseH: baseH, scale: scale,
      w: Math.round(baseW * scale), h: Math.round(baseH * scale),
      fullH: Math.round(baseH * scale),
      x: 0, y: 0, vx: 0, vy: 0, face: -1, ground: true, hitWall: 0,
      state: 'intro', stateT: 0, stateDur: 1.2, anim: 'idle', animT: 0, t: 0,
      inv: 0, stagger: 0, flashT: 0,
      dead: false, deadT: 0, spin: 0,
      step: 0, projectiles: [],
      speedMul: cfg.speedMul || 1,
      ctrl: cfg.ctrl || null, hasTurn: false,
      root: cfg.root || null,
      miniBar: !!cfg.miniBar,
      cfg: cfg, arena: arena,
      patterns: cfg.patterns || spec.patterns || { 1: ['idle'] },
      noGravity: false
    };
    b.x = cfg.x != null ? cfg.x : K.width(arena) - 200 - b.w / 2;
    b.y = floorY - b.h;

    b.cx = function () { return b.x + b.w / 2; };
    b.setAnim = function (a) { if (a !== b.anim) { b.anim = a; b.animT = 0; } };
    b.setState = function (s, dur) { b.state = s; b.stateT = 0; b.stateDur = dur || 0; };
    b.stateDone = function () { return b.stateT >= b.stateDur; };
    b.faceToPlayer = function (arena) { b.face = K.pcx(arena) < b.cx() ? -1 : 1; };
    b.dirToPlayer = function (arena) { return K.pcx(arena) < b.cx() ? -1 : 1; };
    // Đổi chiều cao hitbox nhưng giữ nguyên chân (dùng cho tư thế cúi/choáng).
    b.setHeight = function (nh) { var foot = b.y + b.h; b.h = Math.round(nh); b.y = foot - b.h; };
    b.p = function () { return Math.max(1, Math.min(3, b.phase)); };
    // Giá trị theo pha: arr[phase-1]
    b.byPhase = function (arr) { return arr[Math.min(arr.length - 1, b.p() - 1)]; };

    b.computePhase = function () {
      var ph = 1;
      for (var i = 0; i < b.phaseAt.length; i++) if (b.hp <= b.phaseAt[i]) ph = i + 2;
      return Math.max(b.phase, ph); // pha không lùi lại (kể cả khi hồi máu)
    };

    // Chọn đòn tiếp theo theo pattern của pha hiện tại. Trận bộ ba: phải đến lượt mới được đánh.
    b.choose = function (arena) {
      arena = arena || b.arena;
      if (b.ctrl) {
        if (b.hasTurn) { b.ctrl.release(b); b.hasTurn = false; }
        if (!b.ctrl.request(b)) { b.setState('wait', 0.5); return; }
        b.hasTurn = true;
      }
      var list = b.patterns[b.p()] || b.patterns[1] || ['idle'];
      var a = list[b.step % list.length];
      b.step++;
      if (typeof b.startAction === 'function') b.startAction(a, arena);
      else b.setState('idle', 1);
    };

    b.die = function (arena) {
      b.dead = true;
      b.hp = 0;
      b.deadT = 0;
      b.setState('dead', 99);
      b.setAnim('dead');
      b.vy = -420;
      b.vx = -b.dirToPlayer(arena) * 120;
      if (b.fullH && b.h !== b.fullH) b.setHeight(b.fullH);
      for (var i = 0; i < b.projectiles.length; i++) K.puff(arena, b.projectiles[i].x, b.projectiles[i].y, '#ffffff', 5, 100);
      b.projectiles.length = 0;
      K.puff(arena, b.cx(), b.y + b.h / 2, K.colorOf(b.charId), 18, 260);
      K.call(arena, 'shake', 10, 0.5);
      if (typeof cfg.onDeath === 'function') cfg.onDeath(b, arena);
      else K.killMinions(arena);
      if (b.ctrl && b.hasTurn) { b.ctrl.release(b); b.hasTurn = false; }
    };

    b.onHit = function (dmg, arena) {
      arena = arena || b.arena;
      if (b.dead || b.inv > 0) return false;
      dmg = dmg || 1;
      b.hp = Math.max(0, b.hp - dmg);
      b.inv = INV_TIME;
      b.stagger = STAGGER_TIME;
      b.flashT = 0.3;
      K.puff(arena, b.cx(), b.y + 8, '#ffc94a', 12, 220);
      K.text(arena, b.cx(), b.y - 24, U.choice(['Bốp!', 'Á!', 'Ui da!', 'Trúng rồi!']), '#ffffff');
      if (b.hp <= 0) { b.die(arena); return true; }
      var np = b.computePhase();
      if (np > b.phase) {
        b.phase = np;
        b.step = 0;
        if (b.emitPhase) {
          K.emit(arena, 'boss:phase', { bossId: b.id, phase: np });
          if (b.phaseLines[np]) K.call(arena, 'toast', b.phaseLines[np]);
        }
        if (typeof b.onPhase === 'function') b.onPhase(np, arena);
        if (b.fullH && b.h !== b.fullH) b.setHeight(b.fullH);
        b.inv = Math.max(b.inv, 1.4);
        b.vx = 0;
        b.setState('roar', 1.1);
        K.call(arena, 'shake', 8, 0.6);
      } else if (typeof b.onHurt === 'function') {
        b.onHurt(arena);
      } else {
        b.vx = -b.dirToPlayer(arena) * 160;
        b.setState('recoil', 0.6);
      }
      return true;
    };

    b.isDefeated = function () { return b.hp <= 0; };

    b.getWeakspot = function () {
      if (b.dead || b.inv > 0) return null;
      if (b.state === 'roar' || b.state === 'recoil' || b.state === 'intro') return null;
      if (typeof b.isVulnerable === 'function' && !b.isVulnerable()) return null;
      return { x: b.x + b.w * 0.1, y: b.y - 6, w: b.w * 0.8, h: Math.max(16, b.h * 0.35) + 6 };
    };

    b.getHurtboxes = function () {
      if (b.dead || b.stagger > 0 || b.state === 'intro') return [];
      var boxes;
      if (typeof b.isFullHurt === 'function' && b.isFullHurt()) {
        boxes = [{ x: b.x + 4, y: b.y + 4, w: b.w - 8, h: b.h - 6 }];
      } else {
        boxes = [{ x: b.x + b.w * 0.14, y: b.y + b.h * 0.42, w: b.w * 0.72, h: b.h * 0.58 }];
      }
      if (typeof b.extraHurtboxes === 'function') boxes = boxes.concat(b.extraHurtboxes() || []);
      return boxes;
    };

    // Vật lý đơn giản: trọng lực xuống sàn, kẹp trong arena.
    b.physics = function (dt, arena) {
      var floorY = K.floorY(arena), W = K.width(arena);
      if (!b.noGravity) b.vy = Math.min(1100, b.vy + gravity() * dt);
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.hitWall = 0;
      if (b.x < 0) { b.x = 0; b.hitWall = -1; }
      if (b.x + b.w > W) { b.x = W - b.w; b.hitWall = 1; }
      var wasGround = b.ground;
      b.ground = false;
      if (b.y + b.h >= floorY) {
        b.y = floorY - b.h;
        if (b.vy > 0) b.vy = 0;
        b.ground = true;
      }
      b.landed = b.ground && !wasGround;
    };

    b.update = function (dt, arena) {
      arena = arena || b.arena;
      b.arena = arena;
      b.t += dt; b.animT += dt; b.stateT += dt;
      b.inv = Math.max(0, b.inv - dt);
      b.stagger = Math.max(0, b.stagger - dt);
      b.flashT = Math.max(0, b.flashT - dt);
      if (b.dead) {
        b.deadT += dt;
        b.vx *= Math.pow(0.1, dt);
        b.spin = Math.min(Math.PI / 2, b.spin + dt * 5);
        b.physics(dt, arena);
        if (b.ground && b.deadT > 0.4 && Math.random() < dt * 6) K.puff(arena, b.cx(), b.y, '#ffc94a', 1, 40);
        b.projectiles.length = 0;
        return;
      }
      if (b.state === 'roar') {
        // Gầm khi đổi pha: đứng yên, bất tử.
        b.vx = 0;
        b.setAnim('victory');
        b.faceToPlayer(arena);
        if (Math.random() < dt * 10) K.puff(arena, b.cx() + U.rand(-b.w / 2, b.w / 2), b.y + U.rand(0, b.h * 0.5), '#e5484d', 2, 120);
        if (b.stateDone()) b.choose(arena);
      } else if (b.state === 'recoil') {
        b.setAnim('hurt');
        if (b.ground) b.vx *= Math.pow(0.02, dt);
        if (b.stateDone() && b.ground) { b.vx = 0; b.choose(arena); }
      } else if (b.state === 'wait') {
        // Trận bộ ba: chưa đến lượt — đi lững thững tại chỗ.
        b.faceToPlayer(arena);
        b.vx = Math.sin(b.t * 1.7 + b.x * 0.01) * 40 * b.speedMul;
        b.setAnim(Math.abs(b.vx) > 12 ? 'walk' : 'idle');
        if (b.stateDone()) b.choose(arena);
      } else if (typeof b.think === 'function') {
        b.think(dt, arena);
      }
      b.physics(dt, arena);
      K.updateProjectiles(b, dt, arena);
    };

    b.draw = function (ctx, arena) {
      arena = arena || b.arena;
      var t = b.t;
      ctx.save();
      if (!b.dead && typeof b.drawBehind === 'function') b.drawBehind(ctx, arena, t);
      // Thân trùm
      ctx.save();
      var alpha = 1;
      if (b.dead) alpha = Math.max(0, 1 - Math.max(0, b.deadT - 1.0) * 1.5);
      else if (b.inv > 0 && Math.floor(b.inv * 14) % 2 === 0) alpha = 0.55;
      if (alpha > 0) {
        if (!b.dead && typeof b.drawBody === 'function') b.drawBody(ctx, arena, alpha);
        else {
          ctx.translate(b.cx(), b.y + b.h);
          if (b.dead) ctx.rotate(-b.face * b.spin);
          K.drawSprite(ctx, b, b.anim, { alpha: alpha });
        }
      }
      ctx.restore();
      if (b.dead && b.deadT < 1.4) K.drawStars(ctx, b.cx(), b.y - 4, t, b.w * 0.45);
      if (!b.dead) {
        if (typeof b.drawFront === 'function') b.drawFront(ctx, arena, t);
        if (b.state === 'roar') K.drawBubble(ctx, b.cx(), b.y - 12, t, '💢', '#e5484d');
        if (b.getWeakspot()) K.drawStompHint(ctx, b.cx(), b.y, t);
        if (b.miniBar) K.drawMiniBar(ctx, b);
      }
      K.drawProjectiles(ctx, b);
      ctx.restore();
    };

    return b;
  };

  // ---------------------------------------------------------------------------
  // Registry
  // ---------------------------------------------------------------------------
  var fight = null; // trận đang chạy của bộ điều khiển độc lập (start/update/draw)
  var listenersOn = false;

  function bindListeners() {
    if (listenersOn || !OG.Events) return;
    listenersOn = true;
    OG.Events.on('player:action', function () { K.actionSeq++; });
  }
  bindListeners(); // đăng ký ngay lúc load (không đụng Save) để vẫn chạy nếu init() không được gọi

  OG.Bosses = {
    defs: defs,
    kit: K,
    factories: {},

    init: function () {
      bindListeners();
      K._anims = null; // đọc lại danh sách animState sau khi Sprites.init chạy
    },

    register: function (def) {
      if (!def || !def.id || typeof def.create !== 'function') { console.warn('[OG.Bosses] def không hợp lệ', def); return null; }
      defs[def.id] = def;
      return def;
    },
    has: function (id) { return !!defs[id]; },
    list: function () { return Object.keys(defs); },
    getInfo: function (id) { var d = defs[id]; return d ? { id: d.id, name: d.name || d.id, maxHp: d.maxHp || 0 } : null; },
    getArena: function (id) { var d = defs[id]; return (d && d.arena) || null; },
    create: function (id, arena) {
      var d = defs[id];
      if (!d) return null;
      arena = K.normalizeArena(arena);
      try { return d.create(arena) || null; }
      catch (e) { console.error('[OG.Bosses] tạo trùm lỗi: ' + id, e); return null; }
    },

    // ---------- Bộ điều khiển trận độc lập (tuỳ chọn) ----------
    // Dùng khi một scene muốn giao toàn bộ logic trận cho OG.Bosses. Scene 'boss' hiện tại
    // tự xử lý giẫm/chạm/emit nên KHÔNG gọi các hàm này (tránh phát event hai lần).
    start: function (bossId, arenaLike) {
      var arena = K.normalizeArena(arenaLike || {});
      arena.bossId = bossId;
      var boss = OG.Bosses.create(bossId, arena);
      if (!boss) { fight = null; return null; }
      fight = { bossId: bossId, arena: arena, boss: boss, done: false, t: 0 };
      K.emit(arena, 'boss:start', { bossId: bossId, levelId: arena.levelId || null, name: boss.name, maxHp: boss.maxHp });
      return fight;
    },
    update: function (dt) {
      if (!fight) return;
      var A = fight.arena, boss = fight.boss, p = A.player;
      fight.t += dt; A.t += dt;
      U.safe('Bosses.fight.update', boss.update, boss, [dt, A]);
      if (fight.done) return;
      var weak = boss.getWeakspot();
      var prevBottom = p.prevBottom != null ? p.prevBottom : p.y + p.h - (p.vy || 0) * dt;
      var stomp = weak && (OG.Physics ? OG.Physics.isStomp(p, prevBottom, weak, 16) : (p.vy > 0 && K.overlap(p, weak)));
      if (stomp) {
        p.vy = -((OG.Config && OG.Config.STOMP_BOUNCE) || 420) * 1.1;
        p.inv = Math.max(p.inv || 0, 0.3);
        if (boss.onHit(1, A)) {
          K.call(A, 'addScore', 100);
          K.emit(A, 'boss:hit', { bossId: fight.bossId, hp: boss.hp, maxHp: boss.maxHp });
        }
      } else {
        var boxes = boss.getHurtboxes();
        for (var i = 0; i < boxes.length; i++) if (K.overlap(p, boxes[i])) { K.hurtPlayer(A, 'boss'); break; }
      }
      if (boss.isDefeated()) {
        fight.done = true;
        K.call(A, 'addScore', 500);
        K.emit(A, 'boss:defeated', { bossId: fight.bossId, levelId: A.levelId || null, time: fight.t });
      }
    },
    draw: function (ctx) { if (fight) U.safe('Bosses.fight.draw', fight.boss.draw, fight.boss, [ctx, fight.arena]); },
    stop: function () { fight = null; },
    active: function () { return fight; }
  };
})();
