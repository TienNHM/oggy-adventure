/* OG.Sprites — nhân vật vẽ procedural bằng Canvas, có animation nội suy và cache khung hình.
 * Chủ sở hữu: agent Sprites (src/gfx/).
 *
 * HỢP ĐỒNG (giữ nguyên chữ ký, xem docs/ARCHITECTURE.md mục 8.1):
 *   OG.Sprites.init()
 *   OG.Sprites.drawCharacter(ctx, charId, animState, t, opts)
 *     - Caller đã ctx.translate tới ĐIỂM CHÂN (giữa-đáy hitbox). Hàm tự save/restore.
 *     - charId: oggy | jack | olivia | joey | marky | deedee | roach | (id đăng ký thêm)
 *     - animState: idle | run | jump | fall | hurt | attack | victory | walk | stunned | dead
 *     - opts: { face, skin, colors, scale, alpha, flash, w, h, vx, vy, time,
 *               noCache (bỏ qua cache), worldX/worldY (toạ độ chân trong thế giới, cho hiệu ứng bụi) }
 *   OG.Sprites.getAnimStates()
 *
 * MỞ RỘNG (tuỳ chọn, bên gọi nên kiểm tra tồn tại):
 *   drawPortrait(ctx, charId, x, y, size, opts)   — chân dung tròn (x,y = tâm, size = đường kính)
 *   drawParticle(ctx, p) -> bool                  — vẽ hạt có p.shape: star | spark | dust | circle
 *   fx.dust / fx.sparkle / fx.stars / fx.puff      — phát hạt qua OG.Particles.spawn
 *   setCacheEnabled(bool), clearCache(), cacheStats()
 *
 * Cách hoạt động:
 *   1. computePose(state, t) -> "tư thế" (độ nghiêng, co giãn, góc tay/chân, mắt, miệng...) nội suy liên tục.
 *   2. renderPose vẽ nhân vật theo tư thế trong hệ toạ độ THIẾT KẾ (kích thước gốc của nhân vật).
 *   3. Thời gian được lượng tử hoá thành khung (frame) để cache vào offscreen canvas; co giãn toàn cục
 *      (tiếp đất, rơi nhanh), lật hướng, alpha, scale được áp lúc blit nên không làm nổ cache. */
(function () {
  'use strict';
  var OG = (window.OG = window.OG || {});
  var S = (OG.Sprites = OG.Sprites || {});

  var TAU = Math.PI * 2;
  var INK = '#17233d';
  var LINE = 'rgba(23,35,61,0.55)';
  var NOSE = '#ff6f9f';
  var EAR_IN = '#ff9fc1';
  var MOUTH_IN = '#7a1f3d';
  var TONGUE = '#ff7d96';

  // ---------------------------------------------------------------------------
  // Tiện ích
  // ---------------------------------------------------------------------------
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function easeOut(k) { return 1 - (1 - k) * (1 - k); }

  // Làm tối (amt < 0) hoặc sáng (amt > 0) một màu #rrggbb. Có memo vì gọi rất nhiều.
  var shadeMemo = {};
  function shade(hex, amt) {
    var key = hex + '|' + amt;
    if (shadeMemo[key]) return shadeMemo[key];
    var m = /^#([0-9a-f]{6})/i.exec(hex || '');
    if (!m) return hex || '#888888';
    var n = parseInt(m[1], 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    for (var i = 0; i < 3; i++) c[i] = Math.round(amt < 0 ? c[i] * (1 + amt) : c[i] + (255 - c[i]) * amt);
    var out = '#' + ((1 << 24) | (c[0] << 16) | (c[1] << 8) | c[2]).toString(16).slice(1);
    shadeMemo[key] = out;
    return out;
  }

  function ell(ctx, x, y, rx, ry, color, rot) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, TAU);
    ctx.fill();
  }
  function strokeEll(ctx, x, y, rx, ry, color, lw, rot) {
    ctx.strokeStyle = color; ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, TAU);
    ctx.stroke();
  }
  function circle(ctx, x, y, r, color) { ell(ctx, x, y, r, r, color); }
  function seg(ctx, x1, y1, x2, y2, w, color) {
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  function rrect(ctx, x, y, w, h, r, color) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }
  // Ngôi sao n cánh (dùng cho hạt, sao choáng, huy hiệu).
  function starPath(ctx, x, y, rOut, rIn, n, rot) {
    ctx.beginPath();
    for (var i = 0; i < n * 2; i++) {
      var r = i % 2 ? rIn : rOut, a = rot + (i * Math.PI) / n - Math.PI / 2;
      if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
  }
  // Tia lấp lánh 4 cánh.
  function sparkPath(ctx, x, y, r) {
    var k = r * 0.28;
    ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x + k, y - k, x + r, y);
    ctx.quadraticCurveTo(x + k, y + k, x, y + r); ctx.quadraticCurveTo(x - k, y + k, x - r, y);
    ctx.quadraticCurveTo(x - k, y - k, x, y - r); ctx.closePath();
  }

  var errReported = {};
  function report(label, err) {
    if (errReported[label]) return;
    errReported[label] = true;
    if (window.console) console.error('[OG.Sprites] ' + label + ':', err);
  }

  // ---------------------------------------------------------------------------
  // Thông tin nhân vật (phòng thủ nếu OG.Data còn là stub)
  // ---------------------------------------------------------------------------
  // dw/dh: kích thước THIẾT KẾ (hệ toạ độ vẽ). Hình được co giãn tới opts.w/opts.h.
  var BUILTIN = {
    oggy:   { w: 34, h: 52, role: 'player', kind: 'cat' },
    jack:   { w: 36, h: 54, role: 'player', kind: 'cat' },
    olivia: { w: 32, h: 50, role: 'player', kind: 'cat' },
    joey:   { w: 30, h: 40, role: 'boss', kind: 'bug' },
    marky:  { w: 30, h: 60, role: 'boss', kind: 'bug' },
    deedee: { w: 50, h: 50, role: 'boss', kind: 'bug' },
    roach:  { w: 34, h: 28, role: 'enemy', kind: 'crawler' }
  };
  var DESIGN = { cat: [34, 52], crawler: [34, 28] }; // bug: lấy theo spec

  var DEFAULT_COLORS = {
    oggy: { body: '#2877d5', head: '#328be7', ear: '#2471cb', feet: '#263b9b', muzzle: '#d9f0ff' },
    jack: { body: '#47a53b', head: '#58b84a', ear: '#3f9a35', feet: '#2b6b25', muzzle: '#e6f7d9' },
    olivia: { body: '#efe7dc', head: '#f7f1ea', ear: '#e9ddd0', feet: '#c9b8a6', muzzle: '#ffffff', accent: '#f29bb8' },
    joey: { body: '#c45bd1', shell: '#e08fe8', leg: '#6b2d75' },
    marky: { body: '#5fae4e', shell: '#8fd37f', leg: '#2f6b26' },
    deedee: { body: '#e08a3c', shell: '#f3b277', leg: '#8a4a17' },
    roach: { body: '#7d3e9b', shell: '#b56bc7', leg: '#4b285d' }
  };

  // Kiểu riêng của từng mèo.
  var CAT_STYLE = {
    oggy: { belly: '#f4fbff' },
    jack: { brows: true, belly: '#e6f7d9' },
    olivia: { lashes: true, bow: true, belly: '#ffffff' }
  };

  // Thông số dáng gián đứng (trùm). Toạ độ: chân ở y=0, x=0 giữa, nhìn sang phải.
  var BUG_SPECS = {
    joey: {
      W: 30, H: 40, headR: 9.5, headX: 2, headY: -29, bodyRx: 9, bodyRy: 10.5, bodyY: -13.5,
      hipY: -5, legLen: 5, shoulderY: -19, armLen: 8, antLen: 13, eyeRx: 3.6, eyeRy: 4.6,
      eyeY: -31, lid: 0.42, mouth: 'smirk', crown: true
    },
    marky: {
      W: 30, H: 60, headR: 8.5, headX: 3, headY: -50, neck: true, bodyRx: 8, bodyRy: 15.5, bodyY: -27,
      hipY: -12, legLen: 12, shoulderY: -37, armLen: 12, antLen: 17, eyeRx: 3.3, eyeRy: 4.8,
      eyeY: -51.5, lid: 0.55, mouth: 'flat', bowtie: true, brows: true
    },
    deedee: {
      W: 50, H: 50, headR: 12, headX: 7, headY: -37, bodyRx: 21, bodyRy: 18.5, bodyY: -20,
      hipY: -4, legLen: 4, shoulderY: -27, armLen: 10, antLen: 14, eyeRx: 3.4, eyeRy: 4,
      eyeY: -42.5, lid: 0, mouth: 'hungry', bigBelly: true
    }
  };

  function dataChar(id) {
    try {
      var D = OG.Data;
      if (D && D.characters && D.characters[id]) return D.characters[id];
    } catch (e) { /* stub */ }
    return null;
  }

  // Trả về {id, w, h, role, kind, dw, dh, spec, known}
  var infoMemo = {};
  function charInfo(id) {
    var ch = dataChar(id), b = BUILTIN[id];
    // Bộ nhớ đệm chỉ khi dữ liệu không đổi (so sánh tham chiếu đối tượng nhân vật).
    var memo = infoMemo[id];
    if (memo && memo.src === ch) return memo;
    var role = (ch && ch.role) || (b && b.role) || (/roach|gian/i.test(String(id)) ? 'enemy' : 'player');
    // NPC v2 (role 'npc') chưa có hình riêng -> vẽ dự phòng kiểu mèo theo màu.
    var kind = (ch && ch.sprite) || (b && b.kind) || (role === 'player' || role === 'npc' ? 'cat' : role === 'enemy' ? 'crawler' : 'bug');
    var spec = null, dw, dh;
    if (kind === 'bug') {
      spec = BUG_SPECS[id] || BUG_SPECS[ch && ch.spriteBase] || BUG_SPECS.joey;
      dw = spec.W; dh = spec.H;
    } else {
      var d = DESIGN[kind] || DESIGN.cat;
      dw = d[0]; dh = d[1];
    }
    var info = {
      id: String(id), src: ch, role: role, kind: kind, spec: spec,
      w: (ch && ch.w) || (b && b.w) || dw, h: (ch && ch.h) || (b && b.h) || dh,
      dw: dw, dh: dh, known: !!ch,
      // Nhân vật tự đăng ký có thể khai báo ch.style cho mèo.
      style: (ch && ch.style) || CAT_STYLE[id] || {}
    };
    infoMemo[id] = info;
    return info;
  }

  function resolveColors(info, skinId, override) {
    var out = {}, k, base = DEFAULT_COLORS[info.id] || (info.kind === 'cat' ? DEFAULT_COLORS.oggy : DEFAULT_COLORS.roach);
    for (k in base) out[k] = base[k];
    if (info.known) {
      try {
        var rc = OG.Data.resolveColors ? OG.Data.resolveColors(info.id, skinId || null) : info.src.colors;
        if (rc) for (k in rc) out[k] = rc[k];
      } catch (e) { /* dùng màu mặc định */ }
    }
    if (override) for (k in override) out[k] = override[k];
    return out;
  }

  // Phụ kiện của skin: skin.gfx (nếu skin tự khai báo) hoặc bảng S.skinGfx trong skins.js.
  function skinGfx(skinId) {
    if (!skinId) return null;
    var sk = null;
    try { sk = OG.Data && OG.Data.getSkin ? OG.Data.getSkin(skinId) : null; } catch (e) { sk = null; }
    return (sk && sk.gfx) || (S.skinGfx && S.skinGfx[skinId]) || null;
  }

  // ---------------------------------------------------------------------------
  // Animation: thông tin vòng lặp / thời lượng và tư thế
  // ---------------------------------------------------------------------------
  var ANIMS = ['idle', 'run', 'jump', 'fall', 'hurt', 'attack', 'victory', 'walk', 'stunned', 'dead'];
  // loop: chu kỳ (giây) + số khung cache; dur: animation một lần + fps cache.
  // loopAfter/cycle: nếu t là "đồng hồ chạy" (vd trùm truyền OG.time) thì lặp lại thay vì đứng hình.
  var ANIM_INFO = {
    idle: { loop: 2.4, frames: 20 },
    walk: { loop: 0.62, frames: 12 },
    run: { loop: 0.36, frames: 12 },
    fall: { loop: 0.32, frames: 8 },
    victory: { loop: 0.7, frames: 14 },
    stunned: { loop: 1.0, frames: 16 },
    jump: { dur: 0.3, fps: 30 },
    hurt: { dur: 0.45, fps: 30, loopAfter: 1.5, cycle: 0.6 },
    attack: { dur: 0.3, fps: 40, loopAfter: 1.5, cycle: 0.5 },
    dead: { dur: 0.4, fps: 30 }
  };
  // Gián bò có nhịp chân nhanh hơn.
  var CRAWLER_LOOP = { run: 0.3, walk: 0.5 };

  function normState(s) {
    if (ANIM_INFO[s]) return s;
    if (s === 'stun' || s === 'dizzy') return 'stunned';
    if (s === 'die' || s === 'defeated') return 'dead';
    if (s === 'hit') return 'hurt';
    if (s === 'win' || s === 'celebrate') return 'victory';
    return 'idle';
  }

  // Lượng tử hoá t -> {frame, t}. Trả về t đã làm tròn để tư thế khớp đúng khung cache.
  function quantize(state, t, kind) {
    var a = ANIM_INFO[state];
    if (a.loop) {
      var loop = (kind === 'crawler' && CRAWLER_LOOP[state]) || a.loop;
      var ph = ((t % loop) + loop) % loop;
      var f = Math.floor((ph / loop) * a.frames) % a.frames;
      return { frame: f, t: (f / a.frames) * loop, loop: loop, raw: t };
    }
    if (a.loopAfter && t > a.loopAfter) t = t % a.cycle;
    var tt = clamp(t, 0, a.dur);
    var fi = Math.floor(tt * a.fps + 1e-6);
    return { frame: fi, t: fi / a.fps, loop: 0, raw: tt };
  }

  // Tư thế: mọi giá trị nội suy liên tục theo t.
  //  by: dịch dọc, shakeX: rung ngang, lean: nghiêng thân (rad, + là chúi tới trước), rot: xoay cả người,
  //  sx/sy: co giãn, legA/legB: chân trước/sau (-1..1), liftA/liftB: nhấc chân (px),
  //  armA/armB: góc tay trước/sau tính từ phương thẳng xuống (+ là về phía trước),
  //  eyes/mouth: biểu cảm, tail/ant: đuôi/râu, flow/wave: áo choàng & băng đô bay.
  function computePose(state, t, kind, loop) {
    var P = {
      by: 0, shakeX: 0, lean: 0, rot: 0, sx: 1, sy: 1, headY: 0,
      legA: 0, legB: 0, liftA: 0, liftB: 0, armA: 0.25, armB: -0.2,
      eyes: 'open', mouth: 'smile', tail: 0, ant: 0, flow: 0.15, wave: 0, ph: 0,
      punch: 0, swoosh: -1, stars: false, starT: 0, sparkle: false, impact: 0, splay: 0, moving: false
    };
    var s, k, e, ph, co;
    switch (state) {
      case 'idle':
        ph = (t * TAU) / 2.4; s = Math.sin(ph);
        P.sy = 1 + s * 0.025; P.sx = 1 - s * 0.018; P.headY = s * 0.6;
        P.armA = 0.2 + s * 0.06; P.armB = -0.15 - s * 0.06;
        P.tail = s * 0.35; P.ant = Math.sin(ph * 2) * 0.5; P.wave = ph * 2; P.flow = 0.1; P.ph = ph;
        break;
      case 'walk':
      case 'run':
        var per = loop || (state === 'run' ? 0.36 : 0.62), amp = state === 'run' ? 1 : 0.6;
        ph = (t * TAU) / per; s = Math.sin(ph); co = Math.cos(ph);
        P.ph = ph; P.moving = true; P.legA = s * amp; P.legB = -s * amp;
        P.liftA = Math.max(0, co) * 5 * amp; P.liftB = Math.max(0, -co) * 5 * amp;
        P.by = -Math.abs(co) * 3 * amp;
        P.lean = 0.13 * amp; P.armA = -s * 0.9 * amp; P.armB = s * 0.9 * amp;
        P.sy = 1 - 0.035 * Math.cos(2 * ph) * amp; P.sx = 1 + 0.03 * Math.cos(2 * ph) * amp;
        P.tail = -0.5 + s * 0.25; P.ant = -0.6 * amp + Math.sin(ph * 2) * 0.2;
        P.flow = state === 'run' ? 0.9 : 0.45; P.wave = ph * 2;
        break;
      case 'jump':
        k = clamp(t / 0.18, 0, 1); e = easeOut(k);
        P.sy = 1.14 - 0.1 * e; P.sx = 0.9 + 0.08 * e;     // giãn dọc khi bật lên
        P.legA = 0.35; P.legB = -0.3; P.liftA = 6; P.liftB = 3;
        P.armA = lerp(0.3, 2.5, e); P.armB = lerp(-0.2, 2.1, e);
        P.mouth = 'open'; P.lean = 0.06; P.tail = 0.7; P.ant = 0.6; P.flow = 0.6; P.wave = t * 14;
        break;
      case 'fall':
        ph = (t * TAU) / (loop || 0.32); s = Math.sin(ph);
        P.sy = 1.05; P.sx = 0.96;
        P.armA = 2.55 + s * 0.35; P.armB = 2.15 - s * 0.35;   // vung tay
        P.legA = 0.2 + s * 0.2; P.legB = -0.2 - s * 0.2; P.liftA = 2; P.liftB = 1;
        P.eyes = 'wide'; P.mouth = 'o'; P.tail = 1.1 + s * 0.2; P.ant = 1.2 + s * 0.2;
        P.flow = -0.4; P.wave = ph; P.ph = ph;
        break;
      case 'hurt':
        k = clamp(t / 0.45, 0, 1); var d = 1 - k;
        P.shakeX = Math.sin(t * 75) * 2.2 * d; P.lean = -0.3 * (0.5 + 0.5 * d);
        P.sx = 1 + 0.16 * d; P.sy = 1 - 0.14 * d;               // bẹp ra khi trúng đòn
        P.armA = 2.0; P.armB = 2.4; P.legA = 0.45; P.legB = -0.35; P.liftA = 3;
        P.eyes = 'hurt'; P.mouth = 'o'; P.tail = 1.2; P.ant = 1.0; P.flow = 0.3; P.impact = d;
        break;
      case 'attack':
        if (t < 0.08) {                         // lấy đà
          var w = t / 0.08;
          P.lean = -0.12 * w; P.sx = 1 + 0.08 * w; P.sy = 1 - 0.08 * w;
          P.armA = lerp(0.25, -0.8, w); P.armB = lerp(-0.2, 0.3, w);
        } else if (t < 0.2) {                   // tung đòn
          s = easeOut((t - 0.08) / 0.12);
          P.lean = lerp(-0.12, 0.24, s); P.sx = lerp(1.08, 1.06, s); P.sy = lerp(0.92, 0.97, s);
          P.armA = lerp(-0.8, 1.62, s); P.armB = 0.3; P.punch = s; P.swoosh = s;
          P.legA = 0.55 * s; P.legB = -0.45 * s;
        } else {                                // thu về
          var r = clamp((t - 0.2) / 0.1, 0, 1);
          P.lean = 0.24 * (1 - r); P.armA = lerp(1.62, 0.25, r); P.armB = lerp(0.3, -0.2, r);
          P.punch = 1 - r; P.swoosh = r < 0.5 ? 1 + r : -1;
          P.legA = 0.55 * (1 - r); P.legB = -0.45 * (1 - r);
        }
        P.eyes = 'squint'; P.mouth = 'grin'; P.ant = -0.4; P.flow = 0.5; P.tail = -0.3;
        break;
      case 'victory':
        ph = (t * TAU) / 0.7; var hop = Math.abs(Math.sin(ph)), g = 1 - hop;
        P.by = -hop * 12; P.sy = 1 - g * g * 0.12 + hop * 0.05; P.sx = 1 + g * g * 0.1 - hop * 0.03;
        P.armA = 2.7 + Math.sin(ph * 2) * 0.3; P.armB = 2.45 - Math.sin(ph * 2) * 0.3;
        P.liftA = hop * 4; P.liftB = hop * 3; P.legA = 0.15; P.legB = -0.15;
        P.eyes = 'happy'; P.mouth = 'grin'; P.tail = 0.8 + Math.sin(ph * 2) * 0.4;
        P.ant = Math.sin(ph * 2) * 0.6; P.flow = 0.4 + hop * 0.3; P.wave = ph * 2; P.sparkle = true; P.ph = ph;
        break;
      case 'stunned':
        ph = (t * TAU) / 1.0; s = Math.sin(ph);
        P.lean = s * 0.12; P.shakeX = s * 1.5; P.armA = 0.1; P.armB = -0.1; P.sy = 0.97;
        P.eyes = 'spiral'; P.mouth = 'wobble'; P.stars = true; P.starT = ph; P.ant = s; P.tail = s * 0.3; P.wave = ph;
        break;
      case 'dead':
        k = clamp(t / 0.4, 0, 1); e = easeOut(k);
        P.rot = -1.45 * e; P.eyes = 'x'; P.mouth = 'o'; P.armA = 1.8; P.armB = 2.2;
        P.legA = 0.4; P.legB = -0.2; P.ant = 1; P.tail = 1.3; P.splay = e;
        break;
    }
    return P;
  }

  // Dịch/xoay/co giãn chung của tư thế (gốc là chân).
  function applyBase(ctx, P, thickness) {
    ctx.translate(P.shakeX, P.by);
    if (P.rot) {
      // Nằm xuống: nhấc lên nửa bề dày thân để không lún xuống sàn.
      ctx.translate(0, -thickness * Math.min(1, Math.abs(P.rot) / 1.45));
      ctx.rotate(P.rot);
    }
    ctx.scale(P.sx, P.sy);
  }

  // ---------------------------------------------------------------------------
  // Mắt và miệng dùng chung
  // ---------------------------------------------------------------------------
  // mode: open | wide | squint | closed | happy | hurt | x | spiral
  function drawEye(ctx, x, y, rx, ry, mode, o) {
    o = o || {};
    var lw = o.lw || 1.4;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (mode === 'closed' || mode === 'happy') {
      ctx.strokeStyle = INK; ctx.lineWidth = lw + 0.2;
      ctx.beginPath();
      if (mode === 'closed') ctx.arc(x, y - ry * 0.2, rx * 0.9, 0.15 * Math.PI, 0.85 * Math.PI);
      else ctx.arc(x, y + ry * 0.45, rx * 0.95, 1.15 * Math.PI, 1.85 * Math.PI);
      ctx.stroke();
      return;
    }
    if (mode === 'hurt') {
      // > <  (mắt nhắm nghiến)
      var dir = o.front ? -1 : 1;
      ctx.strokeStyle = INK; ctx.lineWidth = lw + 0.3;
      ctx.beginPath();
      ctx.moveTo(x - dir * rx * 0.7, y - ry * 0.5); ctx.lineTo(x + dir * rx * 0.55, y); ctx.lineTo(x - dir * rx * 0.7, y + ry * 0.5);
      ctx.stroke();
      return;
    }
    if (mode === 'x') {
      ctx.strokeStyle = INK; ctx.lineWidth = lw + 0.3;
      ctx.beginPath();
      ctx.moveTo(x - rx * 0.7, y - rx * 0.7); ctx.lineTo(x + rx * 0.7, y + rx * 0.7);
      ctx.moveTo(x + rx * 0.7, y - rx * 0.7); ctx.lineTo(x - rx * 0.7, y + rx * 0.7);
      ctx.stroke();
      return;
    }
    // Mắt mở: lòng trắng + viền + con ngươi.
    var wr = mode === 'wide' ? 1.12 : 1;
    ell(ctx, x, y, rx * wr, ry * wr, '#ffffff');
    strokeEll(ctx, x, y, rx * wr, ry * wr, LINE, lw * 0.8);
    if (mode === 'spiral') {
      ctx.strokeStyle = INK; ctx.lineWidth = lw * 0.8;
      ctx.beginPath();
      for (var i = 0; i <= 18; i++) {
        var a = i * 0.7 + (o.spin || 0), rr = (i / 18) * rx * 0.85;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * (ry / rx));
      }
      ctx.stroke();
      return;
    }
    var pr = mode === 'wide' ? rx * 0.34 : rx * 0.5, look = o.look == null ? rx * 0.3 : o.look;
    circle(ctx, x + look, y + ry * 0.12, pr, INK);
    circle(ctx, x + look + pr * 0.35, y - pr * 0.25, Math.max(0.5, pr * 0.38), '#ffffff');
    var lid = mode === 'squint' ? Math.max(o.lid || 0, 0.45) : (o.lid || 0);
    if (lid > 0) {
      // Mí mắt: tô màu da phần trên của mắt.
      ctx.save();
      ctx.beginPath(); ctx.ellipse(x, y, rx * wr + 0.4, ry * wr + 0.4, 0, 0, TAU); ctx.clip();
      ctx.fillStyle = o.lidColor || '#888';
      ctx.fillRect(x - rx - 2, y - ry - 2, rx * 2 + 4, (ry * 2 + 2) * lid + 1);
      ctx.restore();
      ctx.strokeStyle = INK; ctx.lineWidth = lw * 0.9;
      ctx.beginPath();
      var ly = y - ry + ry * 2 * lid;
      ctx.moveTo(x - rx * 0.95, ly + (o.lidTilt || 0)); ctx.lineTo(x + rx * 0.95, ly - (o.lidTilt || 0));
      ctx.stroke();
    }
    if (o.lashes) {
      ctx.strokeStyle = INK; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + rx * 0.6, y - ry * 0.75); ctx.lineTo(x + rx * 1.15, y - ry * 1.05);
      ctx.moveTo(x + rx * 0.9, y - ry * 0.4); ctx.lineTo(x + rx * 1.45, y - ry * 0.55);
      ctx.stroke();
    }
  }

  // mode: smile | open | o | grin | wobble | frown
  function drawMouth(ctx, x, y, mode, size) {
    size = size || 1;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = INK; ctx.lineWidth = 1.4;
    switch (mode) {
      case 'open':
        ell(ctx, x, y + 1.8 * size, 3.2 * size, 3 * size, MOUTH_IN);
        ell(ctx, x + 0.4, y + 3.2 * size, 2 * size, 1.2 * size, TONGUE);
        break;
      case 'o':
        ell(ctx, x, y + 1.6 * size, 2 * size, 2.5 * size, MOUTH_IN);
        break;
      case 'grin':
        ctx.fillStyle = MOUTH_IN;
        ctx.beginPath();
        ctx.moveTo(x - 4.2 * size, y); ctx.quadraticCurveTo(x, y + 7 * size, x + 4.6 * size, y - 0.6 * size);
        ctx.closePath(); ctx.fill();
        ell(ctx, x + 0.6 * size, y + 3 * size, 1.8 * size, 1 * size, TONGUE);
        break;
      case 'wobble':
        ctx.beginPath();
        ctx.moveTo(x - 4 * size, y + 1.5);
        for (var i = 1; i <= 4; i++) ctx.lineTo(x - 4 * size + i * 2 * size, y + 1.5 + (i % 2 ? -1.2 : 1.2));
        ctx.stroke();
        break;
      case 'frown':
        ctx.beginPath(); ctx.arc(x, y + 4 * size, 3.4 * size, 1.2 * Math.PI, 1.8 * Math.PI); ctx.stroke();
        break;
      default: // smile
        ctx.beginPath(); ctx.arc(x - 0.4, y - 1.4 * size, 3.8 * size, 0.2 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    }
  }

  // Hiệu ứng phụ vẽ cùng nhân vật (nằm trong khung cache).
  function drawStunStars(ctx, cx, cy, P, r) {
    for (var i = 0; i < 3; i++) {
      var a = P.starT + (i * TAU) / 3;
      var x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.32;
      ctx.fillStyle = '#ffd84a';
      starPath(ctx, x, y, 3.4, 1.5, 5, a);
      ctx.fill();
    }
  }
  function drawVictorySparkles(ctx, cx, cy, P) {
    ctx.fillStyle = '#fff6c2';
    for (var i = 0; i < 2; i++) {
      var a = P.ph * 1 + i * Math.PI, k = 0.6 + 0.4 * Math.abs(Math.sin(P.ph * 2 + i));
      sparkPath(ctx, cx + Math.cos(a) * 22, cy - 6 + Math.sin(a) * 8, 3.2 * k);
      ctx.fill();
    }
  }
  function drawSwoosh(ctx, x, y, r, P) {
    if (P.swoosh < 0) return;
    var s = clamp(P.swoosh, 0, 1.5), alpha = s <= 1 ? 0.85 : clamp(1 - (s - 1) * 2, 0, 1) * 0.85;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.strokeStyle = '#ffffff'; ctx.lineCap = 'round';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, r, -1.1, -1.1 + 2.1 * Math.min(1, s)); ctx.stroke();
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#ffe9a8';
    ctx.beginPath(); ctx.arc(x - 2, y, r - 4, -0.9, -0.9 + 1.7 * Math.min(1, s)); ctx.stroke();
    ctx.restore();
  }
  function drawImpact(ctx, x, y, k) {
    if (k < 0.35) return;
    ctx.save();
    ctx.globalAlpha *= clamp((k - 0.35) * 2, 0, 1);
    ctx.fillStyle = '#ffffff';
    starPath(ctx, x, y, 7 * k + 2, 3, 6, k * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd84a';
    starPath(ctx, x, y, 4 * k + 1, 1.6, 6, k * 2);
    ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // MÈO (Oggy, Jack, Olivia) — thiết kế 34x52, nhìn sang phải, chân ở (0,0)
  // ---------------------------------------------------------------------------
  function catArm(ctx, sx, sy, ang, len, color, hand, punch) {
    var ex = sx + Math.sin(ang) * len, ey = sy + Math.cos(ang) * len;
    seg(ctx, sx, sy, ex, ey, 6.4, color);
    circle(ctx, ex, ey, 3.7 + punch * 1.3, hand);
    return { x: ex, y: ey };
  }

  function catEar(ctx, cx, cy, tilt, color, inner) {
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(tilt);
    ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(-6.5, 6); ctx.lineTo(-0.5, -9); ctx.lineTo(6.5, 5); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = inner;
    ctx.beginPath(); ctx.moveTo(-3.2, 4.5); ctx.lineTo(-0.4, -4.5); ctx.lineTo(3.4, 4); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawCape(ctx, color, P) {
    var f = P.flow, w1 = Math.sin(P.wave) * 2, w2 = Math.sin(P.wave + 1.3) * 2.6;
    var dark = shade(color, -0.25);
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(6, -31);
    ctx.quadraticCurveTo(-2, -18, -5 - f * 9, -3 - f * 5 + w1);
    ctx.lineTo(-17 - f * 15, -5 - f * 11 + w2);
    ctx.quadraticCurveTo(-15 - f * 6, -20 - f * 2, -9, -31);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(6, -31);
    ctx.quadraticCurveTo(-1, -19, -3 - f * 8, -4 - f * 5 + w1);
    ctx.lineTo(-10 - f * 12, -5 - f * 8 + (w1 + w2) / 2);
    ctx.quadraticCurveTo(-10 - f * 4, -20, -6, -31);
    ctx.closePath(); ctx.fill();
  }

  function drawHat(ctx, kind, color, P) {
    if (kind === 'chef') {
      ctx.save();
      ctx.translate(1, -51); ctx.rotate(-0.06);
      rrect(ctx, -9, -11, 19, 11, 3, '#ffffff');
      circle(ctx, -5.5, -13, 6, '#ffffff');
      circle(ctx, 1.5, -16.5, 7.5, '#ffffff');
      circle(ctx, 8.5, -13, 6, '#ffffff');
      ctx.strokeStyle = 'rgba(23,35,61,0.25)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-3, -8); ctx.lineTo(-3, -1); ctx.moveTo(4, -8); ctx.lineTo(4, -1); ctx.stroke();
      rrect(ctx, -9.5, -3.5, 20, 4.5, 2, '#e9eef5');
      ctx.restore();
    } else if (kind === 'crown') {
      ctx.save();
      ctx.translate(1, -51); ctx.rotate(0.08);
      ctx.fillStyle = color || '#ffc94a';
      ctx.beginPath();
      ctx.moveTo(-9, 1); ctx.lineTo(-10, -9); ctx.lineTo(-5, -4); ctx.lineTo(0, -11);
      ctx.lineTo(5, -4); ctx.lineTo(10, -9); ctx.lineTo(9, 1); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = shade(color || '#ffc94a', -0.3); ctx.lineWidth = 1; ctx.stroke();
      circle(ctx, 0, -2.5, 1.6, '#e5484d');
      circle(ctx, -6, -1.5, 1.1, '#52c5ee'); circle(ctx, 6, -1.5, 1.1, '#52c5ee');
      ctx.restore();
    } else if (kind === 'beret') {
      ell(ctx, -1, -51, 14, 5, color || '#4f5d33', -0.18);
      circle(ctx, -2, -56, 1.8, shade(color || '#4f5d33', -0.3));
      circle(ctx, 6, -52, 1.8, '#ffc94a');
    }
  }

  function drawBow(ctx, x, y, color) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 6, y - 4.5); ctx.lineTo(x - 6, y + 4); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 6, y - 4.5); ctx.lineTo(x + 6, y + 4); ctx.closePath(); ctx.fill();
    circle(ctx, x, y, 2, shade(color, -0.2));
  }

  function drawCat(ctx, c, P, style, gfx) {
    gfx = gfx || {};
    var body = c.body, head = c.head || body, earC = c.ear || head, feet = c.feet || shade(body, -0.35);
    var belly = gfx.belly || c.belly || style.belly || c.muzzle || '#ffffff';
    var muzzle = c.muzzle || '#ffffff';
    var hand = c.hand || shade(head, 0.12);
    var backArmC = shade(body, -0.14);
    applyBase(ctx, P, 12);

    // --- chân (không nghiêng theo thân) ---
    var fbx = -6 + P.legB * 7, fby = -4 - P.liftB;
    var ffx = 6 + P.legA * 7, ffy = -4 - P.liftA;
    seg(ctx, -4, -9, fbx, fby - 1, 6, shade(body, -0.18));
    ell(ctx, fbx + 1.5, fby, 7, 4.3, shade(feet, -0.1));
    seg(ctx, 4, -9, ffx, ffy - 1, 6, shade(body, -0.06));

    // --- thân trên nghiêng quanh hông ---
    ctx.save();
    ctx.translate(0, -10); ctx.rotate(P.lean); ctx.translate(0, 10);

    if (gfx.cape) drawCape(ctx, gfx.cape, P);

    // đuôi
    var ta = 0.9 + P.tail * 0.6;
    ctx.strokeStyle = body; ctx.lineWidth = 4.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-10, -11);
    ctx.quadraticCurveTo(-24, -9, -11 - Math.cos(ta) * 15, -11 - Math.sin(ta) * 15);
    ctx.stroke();
    circle(ctx, -11 - Math.cos(ta) * 15, -11 - Math.sin(ta) * 15, 2.6, shade(body, -0.15));

    // tay sau
    catArm(ctx, -5, -27, P.armB, 11, backArmC, shade(hand, -0.12), 0);

    // thân + bụng trắng
    ell(ctx, 0, -20, 13.5, 14.5, body);
    strokeEll(ctx, 0, -20, 13.5, 14.5, 'rgba(23,35,61,0.16)', 1);
    ell(ctx, 2.5, -18, 8.6, 10.2, belly);

    if (gfx.apron) {
      rrect(ctx, -4, -25, 14, 18, 4, '#ffffff');
      ctx.strokeStyle = 'rgba(23,35,61,0.2)'; ctx.lineWidth = 1;
      ctx.strokeRect(-1, -16, 8, 5);
    }
    if (gfx.emblem) {
      circle(ctx, 3, -21, 5.6, gfx.emblem);
      ctx.fillStyle = gfx.cape || '#e5484d';
      starPath(ctx, 3, -21, 4, 1.7, 5, 0); ctx.fill();
    }
    if (gfx.belt) rrect(ctx, -13, -12.5, 26, 3.6, 1.6, gfx.belt);
    if (gfx.scarf) {
      ctx.fillStyle = gfx.scarf;
      ctx.beginPath(); ctx.moveTo(-6, -26); ctx.lineTo(10, -26.5); ctx.lineTo(3, -18); ctx.closePath(); ctx.fill();
    }
    // vòng cổ màu accent (mặc định kiểu MVP) nếu không có phụ kiện khác che
    if (c.accent && !gfx.scarf && !gfx.headband && !style.bow && !gfx.emblem) rrect(ctx, -10, -27.5, 22, 3.6, 1.8, c.accent);

    // --- đầu ---
    ctx.save();
    ctx.translate(0, P.headY);
    catEar(ctx, -10, -48.5, -0.25, earC, EAR_IN);
    catEar(ctx, 11, -49.5, 0.2, earC, EAR_IN);
    ell(ctx, 1, -38, 18.2, 15.2, head);
    strokeEll(ctx, 1, -38, 18.2, 15.2, 'rgba(23,35,61,0.18)', 1);

    if (gfx.headband) {
      // băng đô ninja + 2 dải bay phía sau
      ctx.save();
      ctx.beginPath(); ctx.ellipse(1, -38, 18.4, 15.4, 0, 0, TAU); ctx.clip();
      ctx.fillStyle = gfx.headband;
      ctx.beginPath(); ctx.moveTo(-18, -48); ctx.lineTo(20, -51); ctx.lineTo(20, -46); ctx.lineTo(-18, -43); ctx.closePath(); ctx.fill();
      ctx.restore();
      var hw = Math.sin(P.wave) * 3, fl = P.flow;
      seg(ctx, -16, -46, -25 - fl * 6, -45 + hw - fl * 2, 3, gfx.headband);
      seg(ctx, -16, -45, -23 - fl * 5, -40 + hw * 0.7, 3, shade(gfx.headband, -0.15));
    }

    // mặt
    if (gfx.faceMask) {
      ctx.save();
      ctx.beginPath(); ctx.ellipse(1, -38, 18.4, 15.4, 0, 0, TAU); ctx.clip();
      ell(ctx, 4, -30, 17, 8.5, gfx.faceMask);
      ctx.restore();
    } else {
      ell(ctx, 5, -32, 10.5, 6.2, muzzle);
    }
    if (gfx.mask) rrect(ctx, -10.5, -46.5, 25, 8.5, 4, gfx.mask);

    var lidColor = head;
    drawEye(ctx, -4, -42, 4.8, 6.8, P.eyes, { lidColor: lidColor, lashes: style.lashes, front: false });
    drawEye(ctx, 8, -42, 5.2, 7, P.eyes, { lidColor: lidColor, lashes: style.lashes, front: true });

    if (style.brows) {
      // lông mày cau có của Jack
      seg(ctx, -8, -50.5, -0.5, -48.5, 2, shade(head, -0.45));
      seg(ctx, 4, -48.5, 12, -51, 2, shade(head, -0.45));
    }

    if (!gfx.faceMask) {
      ell(ctx, 6, -35.6, 3.3, 2.3, c.nose || NOSE);
      circle(ctx, 6.9, -36.3, 0.8, '#ffffff');
      drawMouth(ctx, 6, -33.4, P.mouth, 1);
      // râu mèo
      ctx.strokeStyle = 'rgba(23,35,61,0.45)'; ctx.lineWidth = 0.9; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(13, -34); ctx.lineTo(20, -36.5);
      ctx.moveTo(13, -32); ctx.lineTo(20, -31.5);
      ctx.moveTo(-2, -34); ctx.lineTo(-8, -36);
      ctx.stroke();
    }

    if (style.bow || gfx.bow) drawBow(ctx, 12, -50, c.accent || '#f29bb8');
    if (gfx.hat) drawHat(ctx, gfx.hat, gfx.hatColor, P);

    if (P.stars) drawStunStars(ctx, 1, -57, P, 13);
    if (P.impact) drawImpact(ctx, 16, -48, P.impact);
    ctx.restore(); // đầu

    // tay trước (vẽ đè lên thân)
    var fist = catArm(ctx, 5, -27, P.armA, 11 + P.punch * 3, body, hand, P.punch);
    if (P.swoosh >= 0) drawSwoosh(ctx, fist.x - 4, fist.y, 13, P);
    ctx.restore(); // nghiêng

    // bàn chân trước vẽ sau cùng để đè lên thân
    ell(ctx, ffx + 1.5, ffy, 7.4, 4.5, feet);

    if (P.sparkle) drawVictorySparkles(ctx, 1, -40, P);
  }

  // ---------------------------------------------------------------------------
  // GIÁN ĐỨNG (Joey, Marky, Dee Dee, trùm đăng ký thêm)
  // ---------------------------------------------------------------------------
  function drawBug(ctx, c, P, sp, id) {
    var body = c.body, shell = c.shell || shade(body, 0.3), leg = c.leg || shade(body, -0.45);
    var headC = c.head || shade(body, 0.08);
    var bx = 0, by = sp.bodyY;
    applyBase(ctx, P, sp.bodyRx);

    // chân
    var hipL = -sp.bodyRx * 0.42, hipR = sp.bodyRx * 0.42, sw = 4 + sp.legLen * 0.25;
    var fbx = hipL + P.legB * sw, fby = -2 - P.liftB * 0.7;
    var ffx = hipR + P.legA * sw, ffy = -2 - P.liftA * 0.7;
    seg(ctx, hipL, sp.hipY, fbx, fby, 3.2, shade(leg, -0.15));
    ell(ctx, fbx + 2, fby + 0.4, 4.2, 2.3, shade(leg, -0.15));
    seg(ctx, hipR, sp.hipY, ffx, ffy, 3.4, leg);
    ell(ctx, ffx + 2, ffy + 0.4, 4.4, 2.4, leg);

    ctx.save();
    ctx.translate(0, sp.hipY); ctx.rotate(P.lean); ctx.translate(0, -sp.hipY);

    // tay sau + đôi chân giữa (gián có 6 chi)
    var sb = sp.shoulderY;
    var a2 = P.armB;
    seg(ctx, -sp.bodyRx * 0.35, sb, -sp.bodyRx * 0.35 + Math.sin(a2) * sp.armLen, sb + Math.cos(a2) * sp.armLen, 2.6, shade(leg, -0.1));
    var midY = by + sp.bodyRy * 0.25;
    seg(ctx, -sp.bodyRx * 0.85, midY, -sp.bodyRx * 1.2 - P.legB * 2, midY + 6, 2.2, shade(leg, -0.1));

    // cánh (vỏ lưng) phía sau
    ell(ctx, bx - sp.bodyRx * 0.35, by - 1, sp.bodyRx * 0.88, sp.bodyRy * 1.08, shell, -0.12);
    ctx.strokeStyle = shade(shell, -0.25); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(bx - sp.bodyRx * 0.35, by - sp.bodyRy); ctx.lineTo(bx - sp.bodyRx * 0.5, by + sp.bodyRy * 0.95); ctx.stroke();

    // thân
    ell(ctx, bx, by, sp.bodyRx, sp.bodyRy, body);
    var bellyC = shade(body, sp.bigBelly ? 0.4 : 0.28);
    ell(ctx, bx + sp.bodyRx * 0.22, by + 1, sp.bodyRx * (sp.bigBelly ? 0.72 : 0.58), sp.bodyRy * 0.76, bellyC);
    ctx.strokeStyle = shade(body, -0.05); ctx.lineWidth = 1;
    for (var i = -1; i <= 1; i++) {
      var yy = by + i * sp.bodyRy * 0.32 + 1;
      ctx.beginPath();
      ctx.ellipse(bx + sp.bodyRx * 0.22, yy, sp.bodyRx * 0.5, 1.6, 0, 0.1 * Math.PI, 0.9 * Math.PI);
      ctx.stroke();
    }
    seg(ctx, sp.bodyRx * 0.85, midY, sp.bodyRx * 1.15 + P.legA * 2, midY + 6, 2.2, leg);

    // cổ (Marky)
    var hx = sp.headX, hy = sp.headY + P.headY;
    if (sp.neck) seg(ctx, bx + 1, by - sp.bodyRy + 2, hx - 1, hy + sp.headR - 1, 4.2, body);

    // râu (anten) — vẽ trước đầu
    var antBase = hy - sp.headR + 2, sway = P.ant * 3;
    ctx.strokeStyle = leg; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    for (var j = 0; j < 2; j++) {
      var ax = hx - 3 + j * 5, back = j ? 3 : 6;
      var tx = ax - back + sway * (j ? 1.3 : 1), ty = antBase - sp.antLen + Math.abs(sway) * 0.3;
      ctx.beginPath(); ctx.moveTo(ax, antBase);
      ctx.quadraticCurveTo(ax + 2 + sway * 0.4, antBase - sp.antLen * 0.65, tx, ty);
      ctx.stroke();
      circle(ctx, tx, ty, 1.8, shade(leg, 0.15));
    }

    // đầu
    circle(ctx, hx, hy, sp.headR, headC);
    strokeEll(ctx, hx, hy, sp.headR, sp.headR, 'rgba(23,35,61,0.2)', 1);

    // mắt
    var eyes = P.eyes, lid = sp.lid;
    if (eyes === 'wide') lid = 0;
    var eo = { lidColor: headC, lid: lid, lidTilt: id === 'marky' ? 0.8 : -0.6, front: false, lw: 1.2, look: sp.eyeRx * 0.35 };
    drawEye(ctx, hx - sp.eyeRx * 0.4, sp.eyeY + P.headY, sp.eyeRx * 0.9, sp.eyeRy * 0.95, eyes, eo);
    eo.front = true;
    drawEye(ctx, hx + sp.eyeRx * 1.75, sp.eyeY + P.headY, sp.eyeRx, sp.eyeRy, eyes, eo);
    if (sp.brows && (eyes === 'open' || eyes === 'squint')) {
      seg(ctx, hx - sp.eyeRx * 1.1, sp.eyeY - sp.eyeRy - 1.6, hx + sp.eyeRx * 0.4, sp.eyeY - sp.eyeRy - 2.3, 1.3, INK);
      seg(ctx, hx + sp.eyeRx * 1.1, sp.eyeY - sp.eyeRy - 2.3, hx + sp.eyeRx * 2.7, sp.eyeY - sp.eyeRy - 1.4, 1.3, INK);
    }

    // miệng
    var mx = hx + sp.headR * 0.45, my = hy + sp.headR * 0.42;
    var m = P.mouth;
    if (m === 'smile' || m === 'open') m = sp.mouth === 'hungry' ? 'hungry' : (m === 'open' ? 'open' : sp.mouth);
    if (m === 'smirk') {
      ctx.strokeStyle = INK; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(mx - 3, my + 0.5); ctx.quadraticCurveTo(mx + 1, my + 2.2, mx + 4, my - 1.2); ctx.stroke();
    } else if (m === 'flat') {
      seg(ctx, mx - 2.5, my + 1, mx + 3, my + 0.6, 1.3, INK);
      // ria mép điệu đà của Marky
      ctx.strokeStyle = shade(leg, -0.2); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(mx - 3, my - 1); ctx.quadraticCurveTo(mx, my - 2.8, mx + 4, my - 1.4); ctx.stroke();
    } else if (m === 'hungry') {
      // Dee Dee: miệng há to, lưỡi thè, nước dãi
      ell(ctx, mx, my + 1.5, 6, 4.6, MOUTH_IN);
      rrect(ctx, mx - 4, my - 2.6, 3, 2.4, 0.8, '#ffffff');
      rrect(ctx, mx + 0.6, my - 2.6, 3, 2.4, 0.8, '#ffffff');
      ell(ctx, mx + 0.8, my + 3.6, 3.4, 2, TONGUE);
      if (P.mouth === 'smile') {
        var dr = (Math.sin(P.wave * 0.5) + 1) * 1.5;
        ell(ctx, mx + 5, my + 4 + dr, 1.1, 1.6 + dr * 0.4, '#bfe8ff');
      }
    } else {
      drawMouth(ctx, mx, my - 1, m, 0.9);
    }

    if (sp.crown) {
      ctx.save();
      ctx.translate(hx + 1, hy - sp.headR + 1.5); ctx.rotate(0.22);
      ctx.fillStyle = '#ffc94a';
      ctx.beginPath();
      ctx.moveTo(-5, 1); ctx.lineTo(-5.5, -5); ctx.lineTo(-2.5, -2.5); ctx.lineTo(0, -6.5);
      ctx.lineTo(2.5, -2.5); ctx.lineTo(5.5, -5); ctx.lineTo(5, 1); ctx.closePath(); ctx.fill();
      circle(ctx, 0, -1.2, 1, '#e5484d');
      ctx.restore();
    }
    if (sp.bowtie) {
      var tx2 = bx + 2, ty2 = by - sp.bodyRy + 3;
      drawBow(ctx, tx2, ty2, '#e5484d');
    }

    if (P.stars) drawStunStars(ctx, hx, hy - sp.headR - 5, P, sp.headR + 4);
    if (P.impact) drawImpact(ctx, hx + sp.headR, hy - sp.headR * 0.6, P.impact);

    // tay trước
    var sa = sp.bodyRx * 0.55, ang = P.armA, L = sp.armLen + P.punch * 3;
    var ex = sa + Math.sin(ang) * L, ey = sb + Math.cos(ang) * L;
    seg(ctx, sa, sb, ex, ey, 2.8, leg);
    circle(ctx, ex, ey, 2.2 + P.punch, shade(leg, 0.1));
    if (P.swoosh >= 0) drawSwoosh(ctx, ex - 3, ey, 10 + sp.bodyRx * 0.3, P);
    ctx.restore();

    if (P.sparkle) drawVictorySparkles(ctx, hx, hy, P);
  }

  // ---------------------------------------------------------------------------
  // GIÁN BÒ (lính tuần tra 'roach') — thiết kế 34x28, nhìn ngang sang phải
  // ---------------------------------------------------------------------------
  function drawCrawler(ctx, c, P) {
    var body = c.body, shell = c.shell || shade(body, 0.3), leg = c.leg || shade(body, -0.45);
    var moving = P.moving;
    var bob = moving ? -Math.abs(Math.sin(P.ph)) * 1.4 : P.by * 0.3;
    var down = P.eyes === 'x' || P.eyes === 'hurt';
    ctx.translate(P.shakeX, bob);
    ctx.scale(P.sx, P.sy);

    // 3 cặp chân: dáng tripod — chân xa vẽ trước (tối hơn), chân gần vẽ sau.
    function legs(near) {
      for (var i = 0; i < 3; i++) {
        var hx = -9 + i * 9, hy = -8;
        var phase = P.ph + (i % 2 ? Math.PI : 0) + (near ? 0 : Math.PI);
        var swing = moving ? Math.sin(phase) * 4 : 0;
        var lift = moving ? Math.max(0, Math.cos(phase)) * 3 : 0;
        var kx = hx + (i - 1) * 3 + swing * 0.5, ky = hy + (down ? -5 : -1) - lift;
        var fx = hx + (i - 1) * 6 + swing, fy = down ? -9 - P.splay * 4 : -lift;
        ctx.strokeStyle = near ? leg : shade(leg, -0.25); ctx.lineWidth = near ? 2.2 : 2;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(kx + (near ? 0 : -1), ky - 3); ctx.lineTo(fx, fy); ctx.stroke();
      }
    }
    legs(false);

    // thân + vỏ cánh
    ell(ctx, -1, -12, 15.5, 8.6, body);
    ell(ctx, -3.5, -14.2, 13.4, 7, shell, -0.05);
    ctx.strokeStyle = shade(shell, -0.3); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-16, -14.5); ctx.quadraticCurveTo(-4, -12, 8, -15.5); ctx.stroke();
    ell(ctx, -6, -17.5, 5, 1.8, shade(shell, 0.35), -0.1); // bóng sáng

    // anten
    var sw = P.ant * 2.5;
    ctx.strokeStyle = leg; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(15, -16); ctx.quadraticCurveTo(20, -24, 25 + sw, -26 + Math.abs(sw) * 0.4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(12.5, -17); ctx.quadraticCurveTo(15, -27, 20 + sw * 0.8, -30); ctx.stroke();

    // đầu
    circle(ctx, 13, -11.5, 6.6, shade(body, 0.1));
    var eyes = P.eyes;
    drawEye(ctx, 11, -14.5, 2.6, 3.4, eyes, { front: false, lw: 1.1, look: 0.9, lidColor: shade(body, 0.1), lid: 0.2 });
    drawEye(ctx, 15.5, -14, 3.2, 4, eyes, { front: true, lw: 1.1, look: 1.1, lidColor: shade(body, 0.1), lid: 0.2 });
    // hàm nhỏ
    if (P.mouth === 'o' || P.mouth === 'open') ell(ctx, 17.5, -8.5, 1.6, 1.9, MOUTH_IN);
    else {
      ctx.strokeStyle = INK; ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(15.5, -8.5); ctx.quadraticCurveTo(17.5, -7, 19, -9); ctx.stroke();
    }

    legs(true);
    if (P.stars) drawStunStars(ctx, 6, -24, P, 10);
  }

  // ---------------------------------------------------------------------------
  // Render theo tư thế (trong hệ toạ độ thiết kế)
  // ---------------------------------------------------------------------------
  function renderPose(ctx, info, colors, gfx, state, t, blink, loop) {
    var P = computePose(state, t, info.kind, loop);
    if (blink && (P.eyes === 'open' || P.eyes === 'wide' || P.eyes === 'squint')) P.eyes = 'closed';
    if (info.kind === 'bug') drawBug(ctx, colors, P, info.spec, info.id);
    else if (info.kind === 'crawler') drawCrawler(ctx, colors, P);
    else drawCat(ctx, colors, P, info.style || {}, gfx);
  }

  // Chớp mắt ~mỗi 3,3 giây, lệch pha theo nhân vật.
  function isBlink(clock, id) {
    var seed = 0;
    for (var i = 0; i < id.length; i++) seed += id.charCodeAt(i) * 0.137;
    var p = (clock + seed) % 3.3;
    return p >= 0 && p < 0.12;
  }

  // ---------------------------------------------------------------------------
  // Cache khung hình (offscreen canvas)
  // ---------------------------------------------------------------------------
  // ~240 khung × ~140KB (res 2) ≈ 30MB tối đa. Trong game chỉ vài nhân vật nên tỉ lệ trúng cache rất cao.
  var CACHE_MAX = 240;
  var cache = {
    enabled: typeof document !== 'undefined' && !!document.createElement,
    map: typeof Map === 'function' ? new Map() : null,
    hits: 0, misses: 0
  };

  var scratch = null; // canvas dùng lại khi không cache (vd flash lúc tắt cache)
  function makeCanvas(w, h, reuse) {
    try {
      var cv = reuse && scratch ? scratch : document.createElement('canvas');
      if (reuse) scratch = cv;
      cv.width = Math.max(1, Math.ceil(w)); cv.height = Math.max(1, Math.ceil(h)); // gán width cũng xoá canvas
      return cv.getContext('2d') ? cv : null;
    } catch (e) { return null; }
  }

  // Vẽ 1 khung vào canvas riêng. Trả về {cv, ox, oy, w, h} theo đơn vị thiết kế.
  function buildFrame(info, colors, gfx, state, q, blink, flash, res, reuse) {
    var dw = info.dw, dh = info.dh;
    var padX = Math.ceil(state === 'dead' ? dh + 10 : Math.max(dw * 0.62, dh * 0.4) + 10);
    var padTop = Math.ceil(dh * 0.42 + 14), padBot = 8;
    var fw = dw + padX * 2, fh = dh + padTop + padBot;
    var cv = makeCanvas(fw * res, fh * res, reuse);
    if (!cv) return null;
    var c2 = cv.getContext('2d');
    c2.setTransform(1, 0, 0, 1, 0, 0);
    c2.scale(res, res);
    c2.translate(padX + dw / 2, padTop + dh);
    renderPose(c2, info, colors, gfx, state, q.t, blink, q.loop);
    if (flash) {
      // nháy trắng: phủ trắng chỉ lên phần đã vẽ
      c2.setTransform(1, 0, 0, 1, 0, 0);
      c2.globalCompositeOperation = 'source-atop';
      c2.fillStyle = 'rgba(255,255,255,0.78)';
      c2.fillRect(0, 0, cv.width, cv.height);
      c2.globalCompositeOperation = 'source-over';
    }
    return { cv: cv, ox: padX + dw / 2, oy: padTop + dh, w: fw, h: fh };
  }

  function cacheGet(key) {
    if (!cache.map) return null;
    var fr = cache.map.get(key);
    if (fr) {
      // LRU: đưa lên cuối
      cache.map.delete(key); cache.map.set(key, fr);
      cache.hits++;
    }
    return fr || null;
  }
  function cachePut(key, fr) {
    if (!cache.map) return;
    cache.map.set(key, fr);
    cache.misses++;
    while (cache.map.size > CACHE_MAX) cache.map.delete(cache.map.keys().next().value);
  }

  function blit(ctx, fr) { ctx.drawImage(fr.cv, -fr.ox, -fr.oy, fr.w, fr.h); }

  // ---------------------------------------------------------------------------
  // Hiệu ứng hạt qua OG.Particles
  // ---------------------------------------------------------------------------
  var fx = (S.fx = S.fx || {});
  // sink(x, y, opts): mặc định là OG.Particles.spawn. Trang demo có thể thay bằng hệ hạt riêng.
  fx.sink = fx.sink || null;
  fx.spawn = function (x, y, opts) {
    var P = OG.Particles, f = fx.sink || (P && P.spawn);
    if (typeof f !== 'function' || !isFinite(x) || !isFinite(y)) return;
    try { f.call(fx.sink ? null : P, x, y, opts); } catch (e) { report('fx.spawn', e); }
  };
  // Bụi khi chạy: bay ngược hướng chạy, nhẹ, bốc lên chậm.
  fx.dust = function (x, y, n) {
    fx.spawn(x, y - 2, { color: 'rgba(240,226,196,0.9)', count: n || 2, speed: 45, lift: 22, gravity: -25, life: 0.38, size: 5, shape: 'dust' });
  };
  // Bụi tiếp đất / bật nhảy: toả ngang hai bên.
  fx.puff = function (x, y, n) {
    fx.spawn(x - 8, y - 2, { color: 'rgba(240,226,196,0.95)', count: Math.ceil((n || 6) / 2), speed: 70, lift: 10, gravity: -10, life: 0.4, size: 6, shape: 'dust' });
    fx.spawn(x + 8, y - 2, { color: 'rgba(240,226,196,0.95)', count: Math.floor((n || 6) / 2), speed: 70, lift: 10, gravity: -10, life: 0.4, size: 6, shape: 'dust' });
  };
  // Lấp lánh khi nhặt đồ.
  fx.sparkle = function (x, y, color) {
    fx.spawn(x, y, { color: color || '#fff6c2', count: 7, speed: 130, lift: 40, gravity: 60, life: 0.55, size: 6, shape: 'spark' });
    fx.spawn(x, y, { color: '#ffffff', count: 3, speed: 50, lift: 20, gravity: 0, life: 0.35, size: 5, shape: 'spark' });
  };
  // Sao khi va chạm (giẫm gián, trúng đòn).
  fx.stars = function (x, y, n, color) {
    fx.spawn(x, y, { color: color || '#ffd84a', count: n || 5, speed: 170, lift: 130, gravity: 520, life: 0.7, size: 8, shape: 'star' });
  };

  // Vẽ một hạt có hình dạng (OG.Particles gọi nếu p.shape có giá trị; xem src/gfx/INTEGRATION.md).
  // p: {x, y, size, color, shape, life, max}. globalAlpha do bên gọi đặt. Trả về true nếu đã vẽ.
  S.drawParticle = function (ctx, p) {
    if (!p || !p.shape) return false;
    var a = p.max ? clamp(p.life / p.max, 0, 1) : 1, sz = p.size || 4, age = 1 - a;
    ctx.fillStyle = p.color || '#ffffff';
    switch (p.shape) {
      case 'star':
        starPath(ctx, p.x, p.y, sz * 0.6, sz * 0.26, 5, age * 6 + (p.seed || 0));
        ctx.fill();
        return true;
      case 'spark':
        sparkPath(ctx, p.x, p.y, sz * (0.35 + 0.65 * Math.abs(Math.sin(age * 9))));
        ctx.fill();
        return true;
      case 'dust':
        ctx.beginPath(); ctx.arc(p.x, p.y, sz * (0.45 + age * 0.8), 0, TAU); ctx.fill();
        return true;
      case 'circle':
        ctx.beginPath(); ctx.arc(p.x, p.y, sz * 0.5, 0, TAU); ctx.fill();
        return true;
    }
    return false;
  };

  // Vị trí chân người chơi trong thế giới (để đặt bụi/sao). Ưu tiên dữ liệu chính xác của OG.Level.
  var lastFeet = { x: 0, y: 0, at: -99, h: 52 };
  function sceneBase() {
    try { return OG.Scenes && OG.Scenes.base ? OG.Scenes.base() : null; } catch (e) { return null; }
  }
  function levelPlayer() {
    var L = OG.Level;
    if (sceneBase() === 'level' && L && L.state && L.state.player) return L.state.player;
    return null;
  }
  function now() { return typeof OG.time === 'number' ? OG.time : 0; }

  function trackPlayer(ctx, info, state, t, opts, h) {
    var base = sceneBase();
    if (base !== 'level' && base !== 'boss' && opts.worldX == null) return;
    var pos = null, lp = levelPlayer();
    if (opts.worldX != null) pos = { x: +opts.worldX, y: +opts.worldY };
    else if (lp) pos = { x: lp.x + lp.w / 2, y: lp.y + lp.h };
    else if (ctx.getTransform && OG.Camera) {
      // Khung boss: suy ra từ ma trận hiện tại (caller đã translate tới chân, camera đã áp dụng).
      var m = ctx.getTransform(), r = ctx.canvas && ctx.canvas.width ? ctx.canvas.width / (OG.W || 960) : 1;
      pos = { x: m.e / r + Math.round(OG.Camera.x || 0) - (OG.Camera.ox || 0), y: m.f / r + Math.round(OG.Camera.y || 0) - (OG.Camera.oy || 0) };
    }
    if (!pos) return;
    lastFeet.x = pos.x; lastFeet.y = pos.y; lastFeet.at = now(); lastFeet.h = h;
    // Bụi theo bước chạy (mỗi nửa chu kỳ chạy = 1 bước). Khi pause, t đứng yên -> không phát thêm.
    if (state === 'run') {
      var step = Math.floor(t / 0.18);
      if (step !== stepMem.step) {
        stepMem.step = step;
        if (step > 0) fx.dust(pos.x - (opts.face < 0 ? -1 : 1) * 7, pos.y, 2);
      }
    } else stepMem.step = -1;
  }
  var stepMem = { step: -1 };

  function currentFeet() {
    var lp = levelPlayer();
    if (lp) return { x: lp.x + lp.w / 2, y: lp.y + lp.h, h: lp.h };
    if (now() - lastFeet.at < 0.5) return { x: lastFeet.x, y: lastFeet.y, h: lastFeet.h };
    return null;
  }

  // Thời điểm tiếp đất gần nhất (cho squash khi chạm đất).
  var landAt = -99;

  // ---------------------------------------------------------------------------
  // API công khai
  // ---------------------------------------------------------------------------
  S.getAnimStates = function () { return ANIMS.slice(); };

  S.setCacheEnabled = function (on) { cache.enabled = !!on && !!cache.map; if (!on) S.clearCache(); };
  S.isCacheEnabled = function () { return cache.enabled; };
  S.setCacheLimit = function (n) { CACHE_MAX = Math.max(16, n | 0); };
  S.clearCache = function () { if (cache.map) cache.map.clear(); cache.hits = 0; cache.misses = 0; };
  S.cacheStats = function () { return { size: cache.map ? cache.map.size : 0, max: CACHE_MAX, hits: cache.hits, misses: cache.misses, enabled: cache.enabled }; };

  S.drawCharacter = function (ctx, charId, animState, t, opts) {
    opts = opts || {};
    t = +t || 0;
    var info = charInfo(charId || 'oggy');
    var state = normState(animState);
    var w = +opts.w || info.w, h = +opts.h || info.h;
    var scale = opts.scale == null ? 1 : (+opts.scale || 1);
    var face = opts.face < 0 ? -1 : 1;
    var colors, gfx;
    try {
      colors = resolveColors(info, opts.skin, opts.colors);
      gfx = info.kind === 'cat' ? skinGfx(opts.skin) : null;
    } catch (e) { colors = DEFAULT_COLORS.oggy; gfx = null; }

    // Hiệu ứng ngoài cache: bụi chạy, ghi nhận vị trí người chơi.
    if (info.role === 'player' && opts.vx != null) {
      try { trackPlayer(ctx, info, state, t, opts, h); } catch (e) { report('trackPlayer', e); }
    }

    // Co giãn toàn cục (không vào cache): squash khi tiếp đất, stretch khi rơi nhanh.
    var gsx = 1, gsy = 1;
    if (info.role === 'player' && opts.vx != null) {
      var dl = now() - landAt;
      if ((state === 'idle' || state === 'run') && dl >= 0 && dl < 0.18) {
        var amt = 1 - dl / 0.18;
        gsy = 1 - 0.2 * amt; gsx = 1 + 0.16 * amt;
      } else if (state === 'fall' && opts.vy > 0) {
        gsy = 1 + clamp(opts.vy / 900, 0, 1) * 0.09; gsx = 1 / gsy;
      }
    }

    var q = quantize(state, t, info.kind);
    var clock = opts.time != null ? +opts.time : t;
    var blink = state === 'idle' || state === 'run' || state === 'walk' || state === 'jump' ? isBlink(clock, info.id) : false;
    var flash = !!opts.flash;
    var kx = w / info.dw, ky = h / info.dh;

    ctx.save();
    try {
      if (opts.alpha != null) ctx.globalAlpha *= clamp(+opts.alpha, 0, 1);
      ctx.scale(face * scale, scale);
      ctx.scale(gsx, gsy);
      ctx.scale(kx, ky);

      var drawn = false;
      var useCache = cache.enabled && !opts.noCache;
      if (useCache || flash) {
        var s = Math.max(kx, ky) * Math.abs(scale);
        var res = s <= 1.25 ? 2 : s <= 2.6 ? 4 : 6;
        var key = useCache ? [info.id, info.kind, opts.skin || '', opts.colors ? JSON.stringify(opts.colors) : '',
          state, q.frame, blink ? 1 : 0, flash ? 1 : 0, res].join('|') : null;
        var fr = key ? cacheGet(key) : null;
        if (!fr) {
          // Không cache: dựng khung tạm trên canvas dùng lại, với t chính xác (mượt hơn).
          fr = key ? buildFrame(info, colors, gfx, state, q, blink, flash, res, false)
            : buildFrame(info, colors, gfx, state, { t: q.raw, loop: q.loop }, blink, flash, res, true);
          if (fr && key) cachePut(key, fr);
        }
        if (fr) { blit(ctx, fr); drawn = true; }
      }
      if (!drawn) renderPose(ctx, info, colors, gfx, state, useCache ? q.t : q.raw, blink, q.loop);
    } catch (err) {
      report('drawCharacter(' + charId + ')', err);
      // Phương án cuối: khối bo góc màu thân — hợp đồng yêu cầu luôn vẽ được.
      try {
        ctx.globalAlpha = 1;
        rrect(ctx, -info.dw / 2, -info.dh, info.dw, info.dh, 10, (colors && colors.body) || '#2877d5');
      } catch (e2) { /* bỏ qua */ }
    }
    ctx.restore();
  };

  // Chân dung tròn: x,y = tâm, size = đường kính. opts: {skin, colors, bg, ring, state, t, face}
  S.drawPortrait = function (ctx, charId, x, y, size, opts) {
    opts = opts || {};
    var info = charInfo(charId || 'oggy');
    var r = (size || 64) / 2;
    // Điểm cần lấy làm tâm (tỉ lệ chiều cao tính từ chân) và chiều cao cần hiển thị.
    var focus, span;
    if (info.kind === 'cat') { focus = 0.68; span = 0.75; }
    else if (info.kind === 'bug') {
      var sp = info.spec;
      focus = (-sp.headY + sp.headR * 0.2) / sp.H; span = Math.min(1.1, (sp.headR * 4.4) / sp.H);
    }
    else { focus = 0.5; span = 1.25; }
    var sc = (r * 2) / (info.h * span);
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
    if (opts.bg !== false) { ctx.fillStyle = opts.bg || '#fff6df'; ctx.fill(); }
    ctx.save();
    ctx.clip();
    ctx.translate(x, y + info.h * focus * sc);
    S.drawCharacter(ctx, charId, opts.state || 'idle', opts.t || 0, {
      face: opts.face || 1, skin: opts.skin || null, colors: opts.colors, scale: sc, time: opts.time
    });
    ctx.restore();
    if (opts.ring !== false) {
      ctx.strokeStyle = opts.ring || INK; ctx.lineWidth = Math.max(2, r * 0.08);
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  };

  // init: nghe event gameplay để phát hiệu ứng hạt. Gọi nhiều lần cũng an toàn.
  var inited = false;
  S.init = function () {
    if (inited) return;
    inited = true;
    var E = OG.Events;
    if (!E || typeof E.on !== 'function') return;

    function dims() {
      var lp = levelPlayer();
      if (lp) return { w: lp.w, h: lp.h };
      var id = (OG.Game && OG.Game.run && OG.Game.run.charId) || 'oggy';
      var ci = charInfo(id);
      return { w: ci.w, h: ci.h };
    }

    E.on('player:jump', function (e) {
      if (!e) return;
      var d = dims();
      fx.puff(e.x + d.w / 2, e.y + d.h, 4);
    });
    E.on('player:land', function (e) {
      landAt = now();
      if (!e) return;
      var d = dims();
      fx.puff(e.x + d.w / 2, e.y + d.h, 6);
    });
    E.on('item:collect', function (e) {
      if (!e) return;
      if (e.type === 'coin') fx.sparkle(e.x, e.y, '#ffe27a');
      else fx.sparkle(e.x, e.y - 6, '#fff6c2');
    });
    E.on('enemy:stomp', function (e) {
      if (!e) return;
      fx.stars(e.x + 17, e.y + 4, 5);
    });
    E.on('player:hurt', function (e) {
      var f = currentFeet();
      if (!f) return;
      if (e && e.shielded) fx.sparkle(f.x, f.y - f.h * 0.6, '#9be8ff');
      else fx.stars(f.x, f.y - f.h * 0.85, 4, '#ffffff');
    });
    E.on('boss:hit', function () {
      // người chơi vừa giẫm điểm yếu -> sao bung ngay dưới chân
      var f = currentFeet();
      if (f) fx.stars(f.x, f.y, 7);
    });
    E.on('boss:defeated', function () {
      var f = currentFeet();
      if (f) fx.sparkle(f.x, f.y - 40, '#ffd84a');
    });
  };
})();
