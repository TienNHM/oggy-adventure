// @ts-check
/* ============================================================================
 * OG.Bosses 'trio' — TRÙM BỘ BA GIÁN (Joey + Marky + Dee Dee cùng lúc, màn lair, trận cuối)
 * ----------------------------------------------------------------------------
 * Vai trò:      Ghép 3 trùm có sẵn thành một BossInstance duy nhất để scene 'boss' dùng như mọi trùm khác.
 *               Đăng ký id 'trio' lúc load.
 * Khái niệm:    composite pattern (nhiều trùm con trông như một trùm) · điều phối lượt (turn-taking / token)
 *               để chỉ một tên ra đòn tại một thời điểm · tái sử dụng factory với cấu hình (cfg) ·
 *               pha theo số thành viên đã gục · sắp xếp thứ tự vẽ (painter's algorithm)
 * Bài học:      docs/learn/09-ai-ke-dich-boss.md
 * Phụ thuộc:    LÚC LOAD: OG.Bosses.kit, OG.Bosses.factories.joey/marky/deedee — phải load SAU bosses.js,
 *               joey.js, marky.js, deedee.js (thiếu factory nào thì trận chỉ có các tên còn lại).
 * Event:        phát: 'boss:phase' (tự phát thay cho thành viên, vì thành viên tạo với emitPhase:false) · nghe: (không)
 * API công khai: OG.Bosses.factories.trio(arena) · đăng ký trùm id 'trio' · trio.onHit(dmg, arena, member?)
 * Đọc tiếp:     src/game/boss-scene.js (scene dùng trio như trùm thường) → src/game/difficulty.js
 *
 * Cách hoạt động:
 *   - Ba thành viên là bản thu nhỏ của từng trùm (OG.Bosses.factories), mỗi tên 3 máu; máu trận = tổng.
 *   - Lần lượt từng tên ra đòn (Dee Dee → Marky → Joey), hai tên còn lại đi lững thững và có thể bị giẫm.
 *   - Pha = 1 + số tên đã gục. Mỗi lần một tên gục: phát 'boss:phase', các tên còn lại nhanh hơn
 *     và dùng bộ đòn của pha cao hơn.
 *   - getWeakspot() trả về điểm yếu của tên gần người chơi nhất; onHit() trừ máu đúng tên bị giẫm.
 *   - Lính gián chỉ bị dọn khi cả ba đã gục.
 * ========================================================================== */
(function () {
  'use strict';
  var OG = window.OG;
  if (!OG || !OG.Bosses || !OG.Bosses.kit) return;
  var K = OG.Bosses.kit;
  var F = OG.Bosses.factories;

  var MEMBER_HP = 3;           // máu mỗi tên ở độ khó thường
  var NAME = 'Bộ ba gián';
  var MEMBER_SPEED_MUL = 0.9;  // hệ số tốc độ của mỗi tên ở pha 1 (chậm hơn trùm đơn một chút)
  var SPEED_PER_PHASE = 0.2;   // mỗi pha tăng thêm chừng này vào hệ số tốc độ

  // Bộ đòn rút gọn của từng tên trong trận bộ ba (mỗi phần tử = 1 lượt).
  var PATTERNS = {
    deedee: { 1: ['roll'], 2: ['roll', 'eat'], 3: ['roll3', 'pots', 'eat'] },
    marky: { 1: ['trap', 'slam'], 2: ['wrench', 'slam'], 3: ['wrench', 'slam2', 'trap'] },
    joey: { 1: ['dash', 'throw'], 2: ['dash', 'throw', 'summon'], 3: ['dash', 'hop', 'summon'] }
  };
  // Thứ tự trong mảng = thứ tự giữ lượt; x = vị trí xuất phát (px, góc trái hitbox).
  var SETUP = [
    { id: 'deedee', scale: 1.5, x: 640 },
    { id: 'marky', scale: 1.5, x: 780 },
    { id: 'joey', scale: 1.7, x: 520 }
  ];

  /**
   * Tạo trùm bộ ba.
   * @param {Object} arena  đấu trường (Arena)
   * @returns {BossInstance|null} null nếu không tạo được thành viên nào
   */
  function create(arena) {
    /** @type {Object[]} các trùm con (BossInstance của joey/marky/deedee) */
    var members = [];
    /** @type {BossInstance} */
    var trio;
    // Độ khó (arena.difficulty): máu mỗi tên = 3 × bossHpMul, tối thiểu 2 (kid: 2 máu/tên).
    var dz = K.diffOf ? K.diffOf(arena) : { hpMul: 1 };
    var memberHp = Math.max(2, Math.round(MEMBER_HP * dz.hpMul));

    // 💡 Khái niệm: điều phối lượt (turn-taking). ctrl giữ chỉ số idx của tên đang "cầm lượt"; tên nào muốn ra đòn
    //   phải request() — không phải lượt mình thì vào trạng thái 'wait'. Đánh xong release() chuyển lượt cho tên kế.
    //   Nhờ vậy 3 trùm không dồn đòn cùng lúc (quá khó), mà vẫn dùng NGUYÊN code AI của từng trùm.
    /** @type {BossTurnCtrl & {idx: number, current: function(): Object}} */
    var ctrl = {
      idx: 0,
      // Tên đang giữ lượt = tên còn sống đầu tiên tính từ idx (bỏ qua tên đã gục).
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

    // 💡 Khái niệm: tái sử dụng factory với cấu hình — cùng hàm tạo Dee Dee của trận đơn, chỉ khác cfg
    //   (nhỏ hơn, ít máu hơn, không tự phát 'boss:phase', dùng chung ctrl, bộ đòn rút gọn).
    SETUP.forEach(function (s) {
      var make = F[s.id];
      if (typeof make !== 'function') return;
      var m = make(arena, {
        scale: s.scale, x: s.x, maxHp: memberHp, phaseAt: [], emitPhase: false,
        ctrl: ctrl, patterns: PATTERNS[s.id], miniBar: true, onDeath: onMemberDeath,
        summonCount: 1, capCount: 2, speedMul: MEMBER_SPEED_MUL
      });
      if (m) members.push(m);
    });
    if (!members.length) return null;

    function aliveMembers() { return members.filter(function (m) { return !m.dead; }); }

    trio = {
      id: 'trio', name: NAME, phase: 1,
      maxHp: memberHp * members.length, hp: memberHp * members.length,
      x: 0, y: 0, w: 0, h: 0,
      members: members, diffApplied: true,

      // Tính lại tổng máu và khung bao quanh các tên còn sống (cho ai cần x, y, w, h như một trùm thường).
      syncHp: function () {
        var hp = 0;
        for (var i = 0; i < members.length; i++) hp += Math.max(0, members[i].hp);
        trio.hp = hp;
        var al = aliveMembers();
        if (al.length) {
          var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
          al.forEach(function (m) { x0 = Math.min(x0, m.x); y0 = Math.min(y0, m.y); x1 = Math.max(x1, m.x + m.w); y1 = Math.max(y1, m.y + m.h); });
          trio.x = x0; trio.y = y0; trio.w = x1 - x0; trio.h = y1 - y0;
        }
      },

      update: function (dt, arena) {
        for (var i = 0; i < members.length; i++) {
          // Gán lại root mỗi frame: đạn phản / Dee Dee hồi máu đều báo về trio qua m.root.
          members[i].root = trio;
          members[i].update(dt, arena);
        }
        trio.syncHp();
      },

      draw: function (ctx, arena) {
        ctx.save();
        // 💡 Khái niệm: painter's algorithm — thứ tự vẽ quyết định ai nằm trên. Tên đã gục vẽ trước (khoá 0),
        //   tên đang chờ (1), tên đang ra đòn vẽ sau cùng (2) để telegraph của nó không bị che.
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
      // Scene chỉ nhận MỘT weakspot/frame nên trio phải chọn hộ cái hợp lý nhất.
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

      /**
       * Trừ máu đúng thành viên bị trúng; tên gục thì tăng pha và PHÁT 'boss:phase'.
       * @param {number} dmg  số máu trừ
       * @param {Object} [arena]
       * @param {Object} [member]  tên bị trúng (đạn phản truyền vào); không có thì lấy tên bị người chơi giẫm
       * @returns {boolean} true nếu đòn được tính
       */
      onHit: function (dmg, arena, member) {
        arena = arena || trio._arena;
        var target = member || null;
        if (!target) {
          // Cùng tiêu chí với getWeakspot(): tên chồng lên người chơi, không có thì tên gần nhất.
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
            // Các tên còn sống cùng "lên pha": reset pattern, nhanh hơn, gầm (bất tử 1 s) để người chơi kịp thở.
            aliveMembers().forEach(function (m) {
              m.phase = np;
              m.step = 0;
              m.speedMul = MEMBER_SPEED_MUL + SPEED_PER_PHASE * (np - 1);
              m.inv = Math.max(m.inv, 1.0);
              m.vx = 0;
              m.setState('roar', 1.0);
            });
            K.call(arena, 'shake', 8, 0.5);
          }
        }
        return true;
      },

      // Thắng khi cả ba gục (không dựa vào hp: Dee Dee có thể hồi máu nhưng tên đã gục không sống lại).
      isDefeated: function () { return aliveMembers().length === 0; }
    };
    trio._arena = arena;
    members.forEach(function (m) { m.root = trio; });
    trio.syncHp();
    K.call(arena, 'toast', 'Bộ ba gián xuất trận! Hạ từng tên một — E/J (✦) đánh bật đồ ném!');
    return trio;
  }

  // 🧪 Thử: đổi thứ tự SETUP (đưa joey lên đầu) — Joey sẽ ra đòn trước tiên; hoặc MEMBER_HP 3 → 2 (thấp nhất có tác dụng,
  //   vì memberHp bị kẹp tối thiểu 2) để thử nhanh luồng "một tên gục → các tên còn lại gầm và lên pha".
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
