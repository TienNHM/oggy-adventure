/* Trùm 'trio' — Bộ ba gián: Joey, Marky và Dee Dee cùng lúc (màn lair, trận cuối).
 * Chủ sở hữu: agent Bosses. Load SAU bosses.js, joey.js, marky.js, deedee.js.
 *
 * Cách hoạt động:
 *   - Ba thành viên là bản thu nhỏ của từng trùm (OG.Bosses.factories), mỗi tên 3 máu; máu trận = tổng.
 *   - Lần lượt từng tên ra đòn (Dee Dee → Marky → Joey), hai tên còn lại đi lững thững và có thể bị giẫm.
 *   - Pha = 1 + số tên đã gục. Mỗi lần một tên gục: phát 'boss:phase', các tên còn lại nhanh hơn
 *     và dùng bộ đòn của pha cao hơn.
 *   - getWeakspot() trả về điểm yếu của tên gần người chơi nhất; onHit() trừ máu đúng tên bị giẫm.
 *   - Lính gián chỉ bị dọn khi cả ba đã gục. */
(function () {
  'use strict';
  var OG = window.OG;
  if (!OG || !OG.Bosses || !OG.Bosses.kit) return;
  var K = OG.Bosses.kit;
  var F = OG.Bosses.factories;

  var MEMBER_HP = 3;
  var NAME = 'Bộ ba gián';

  // Bộ đòn rút gọn của từng tên trong trận bộ ba (mỗi phần tử = 1 lượt).
  var PATTERNS = {
    deedee: { 1: ['roll'], 2: ['roll', 'eat'], 3: ['roll3', 'pots', 'eat'] },
    marky: { 1: ['trap', 'slam'], 2: ['wrench', 'slam'], 3: ['wrench', 'slam2', 'trap'] },
    joey: { 1: ['dash', 'throw'], 2: ['dash', 'throw', 'summon'], 3: ['dash', 'hop', 'summon'] }
  };
  var SETUP = [
    { id: 'deedee', scale: 1.5, x: 640 },
    { id: 'marky', scale: 1.5, x: 780 },
    { id: 'joey', scale: 1.7, x: 520 }
  ];

  function create(arena) {
    var members = [];
    var trio;

    // Điều phối lượt đánh: chỉ một tên ra đòn tại một thời điểm, xoay vòng theo thứ tự.
    var ctrl = {
      idx: 0,
      current: function () {
        for (var i = 0; i < members.length; i++) {
          var j = (ctrl.idx + i) % members.length;
          if (!members[j].dead) { ctrl.idx = j; return members[j]; }
        }
        return null;
      },
      request: function (m) { return ctrl.current() === m; },
      release: function (m) {
        if (ctrl.current() === m) ctrl.idx = (ctrl.idx + 1) % members.length;
      }
    };

    function onMemberDeath(m, arena) {
      var alive = members.filter(function (x) { return !x.dead; });
      K.call(arena, 'toast', alive.length ? m.name + ' đã gục! Còn ' + alive.length + ' tên!' : 'Cả bộ ba đã gục!');
      if (!alive.length) K.killMinions(arena);
    }

    SETUP.forEach(function (s) {
      var make = F[s.id];
      if (typeof make !== 'function') return;
      var m = make(arena, {
        scale: s.scale, x: s.x, maxHp: MEMBER_HP, phaseAt: [], emitPhase: false,
        ctrl: ctrl, patterns: PATTERNS[s.id], miniBar: true, onDeath: onMemberDeath,
        summonCount: 1, capCount: 2, speedMul: 0.9
      });
      if (m) members.push(m);
    });
    if (!members.length) return null;

    function aliveMembers() { return members.filter(function (m) { return !m.dead; }); }

    trio = {
      id: 'trio', name: NAME, phase: 1,
      maxHp: MEMBER_HP * members.length, hp: MEMBER_HP * members.length,
      x: 0, y: 0, w: 0, h: 0,
      members: members,

      syncHp: function () {
        var hp = 0;
        for (var i = 0; i < members.length; i++) hp += Math.max(0, members[i].hp);
        trio.hp = hp;
        // khung bao quanh các tên còn sống (cho ai cần x,y,w,h)
        var al = aliveMembers();
        if (al.length) {
          var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
          al.forEach(function (m) { x0 = Math.min(x0, m.x); y0 = Math.min(y0, m.y); x1 = Math.max(x1, m.x + m.w); y1 = Math.max(y1, m.y + m.h); });
          trio.x = x0; trio.y = y0; trio.w = x1 - x0; trio.h = y1 - y0;
        }
      },

      update: function (dt, arena) {
        for (var i = 0; i < members.length; i++) {
          members[i].root = trio;
          members[i].update(dt, arena);
        }
        trio.syncHp();
      },

      draw: function (ctx, arena) {
        ctx.save();
        // tên đã gục vẽ trước, tên đang ra đòn vẽ sau cùng (nổi lên trên)
        var cur = ctrl.current();
        var order = members.slice().sort(function (a, b) {
          var ka = a.dead ? 0 : a === cur ? 2 : 1, kb = b.dead ? 0 : b === cur ? 2 : 1;
          return ka - kb;
        });
        for (var i = 0; i < order.length; i++) order[i].draw(ctx, arena);
        ctx.restore();
      },

      getHurtboxes: function () {
        var out = [];
        for (var i = 0; i < members.length; i++) out = out.concat(members[i].getHurtboxes() || []);
        return out;
      },

      // Điểm yếu của tên gần người chơi nhất (ưu tiên tên đang chồng lên người chơi).
      getWeakspot: function () {
        var p = K.player(trio._arena);
        var px = p.x + p.w / 2, best = null, bestD = Infinity;
        for (var i = 0; i < members.length; i++) {
          var r = members[i].getWeakspot();
          if (!r) continue;
          if (K.overlap(p, r)) return r;
          var d = Math.abs(r.x + r.w / 2 - px);
          if (d < bestD) { bestD = d; best = r; }
        }
        return best;
      },

      // member: tên bị trúng (đạn phản truyền vào); không có thì lấy tên bị người chơi giẫm.
      onHit: function (dmg, arena, member) {
        arena = arena || trio._arena;
        var target = member || null;
        if (!target) {
          var p = K.player(arena), bestD = Infinity;
          for (var i = 0; i < members.length; i++) {
            var r = members[i].getWeakspot();
            if (!r) continue;
            if (K.overlap(p, r)) { target = members[i]; break; }
            var d = Math.abs(members[i].cx() - (p.x + p.w / 2));
            if (d < bestD) { bestD = d; target = members[i]; }
          }
        }
        if (!target || target.dead) return false;
        var ok = target.onHit(dmg, arena);
        if (!ok) return false;
        trio.syncHp();
        if (target.dead) {
          var dead = members.length - aliveMembers().length;
          var np = Math.min(3, 1 + dead);
          if (np > trio.phase && aliveMembers().length) {
            trio.phase = np;
            K.emit(arena, 'boss:phase', { bossId: 'trio', phase: np });
            aliveMembers().forEach(function (m) {
              m.phase = np;
              m.step = 0;
              m.speedMul = 0.9 + 0.2 * (np - 1);
              m.inv = Math.max(m.inv, 1.0);
              m.vx = 0;
              m.setState('roar', 1.0);
            });
            K.call(arena, 'shake', 8, 0.5);
          }
        }
        return true;
      },

      isDefeated: function () { return aliveMembers().length === 0; }
    };
    trio._arena = arena;
    members.forEach(function (m) { m.root = trio; });
    trio.syncHp();
    K.call(arena, 'toast', 'Bộ ba gián xuất trận! Hạ từng tên một — E/J (✦) đánh bật đồ ném!');
    return trio;
  }

  OG.Bosses.factories.trio = create;
  OG.Bosses.register({
    id: 'trio', name: NAME, maxHp: MEMBER_HP * 3,
    arena: {
      width: 960,
      // Hang ổ: 2 bục y=370 và 1 bục cao giữa sân.
      platforms: [[0, 480, 960, 60], [100, 370, 150, 18], [710, 370, 150, 18], [405, 275, 150, 18]],
      spawn: { x: 80, y: 420 },
      theme: 'lair'
    },
    create: function (arena) { return create(arena); }
  });
})();
