// @ts-check
/* ============================================================================
 * OG.World — BẢN ĐỒ THẾ GIỚI CỔ ĐIỂN "Ngôi nhà của Oggy" (scene 'worldmap', vẽ toàn bộ bằng canvas)
 * ----------------------------------------------------------------------------
 * Vai trò:      Hiện các màn như những NÚT của một đồ thị (graph), nối bằng con đường theo quan hệ
 *               `requires`. Người chơi chọn nút bằng phím/chuột/chạm, Oggy đi bộ theo đường tới đó rồi
 *               vào màn qua OG.Game.startLevel(id). Main gọi OG.World.init() để đăng ký scene; Game quay về
 *               đây với params.completed sau mỗi màn (hiện banner kết quả).
 * Khái niệm:    đồ thị nút–cạnh (graph) + danh sách kề (adjacency list) · tìm đường BFS (breadth-first
 *               search) · đường cong Bézier bậc 2 · scene với các "mode" con (map / quests / banner) ·
 *               UI vẽ trên canvas + tự làm hit-test (xét điểm chạm rơi vào nút nào) · điều hướng bàn phím
 *               theo hướng (spatial navigation) · hiệu ứng chuyển cảnh iris (vòng tròn khép/mở)
 * Bài học:      docs/learn/05-state-machine-scene.md (scene, mode) · docs/learn/12-data-driven-man-cau-do-hanh-trinh.md
 *               (bản đồ dựng từ dữ liệu LevelDef) · docs/learn/03-input.md (pressed, pointer)
 * Phụ thuộc:    OG.Data.levels/getLevel/characters, OG.Progress (isUnlocked, isCompleted, getRecord...),
 *               OG.Scenes, OG.Input, OG.DOM (toast, ẩn HUD), OG.Sprites.drawCharacter, OG.Quests (tuỳ chọn),
 *               OG.util (call, safe, fillRound, clamp) — tất cả đọc lúc CHẠY. File load SAU extraLevels.js.
 * Event:        phát: 'world:select' {levelId}, 'world:arrive' {levelId}, 'ui:click' {id:'world_*'} · nghe: (không)
 * API công khai: OG.World.init(), OG.World.enabled, OG.World.focusLevel(id), OG.World.isActive(),
 *               OG.World.getNodes()
 * Đọc tiếp:     src/world/journey-map.js (bản đồ v2 cuộn ngang, có camera) → src/world/quests.js (bảng nhiệm vụ)
 *               → src/ui/menus.js (so sánh: UI bằng DOM overlay thay vì canvas)
 * Dữ liệu:      MapNode, CanvasButton (typedef bên dưới) · LevelDef, Scene (src/types.d.ts)
 *
 * Hợp đồng (docs/ARCHITECTURE.md mục 8.4):
 *   OG.World.init()             — đăng ký scene 'worldmap' (thay bản mặc định).
 *   OG.World.enabled            — true khi bản đồ thật đã sẵn sàng.
 *   OG.World.focusLevel(id)     — đặt con trỏ chọn (và Oggy) vào màn.
 * Mở rộng: OG.World.isActive(), OG.World.getNodes(), OG.World.extraLevels (src/world/extraLevels.js).
 *
 * Bản đồ: mỗi màn là một "ô khu vực" (Nhà bếp, Khu vườn, Mái nhà, Hang ổ, Tầng hầm…) đặt tại level.map,
 * nối với nhau theo `requires` (mặc định: màn liền trước — giống OG.Progress). Khoá/mở/sao lấy từ OG.Progress.
 * Điều khiển (mọi thao tác đều có cả đường bàn phím lẫn đường chạm — trẻ em dùng máy tính bảng):
 *   Bàn phím: ←↑→↓ / WASD chọn màn · Enter/Space chơi · E/J bảng nhiệm vụ · Esc về menu.
 *   Chạm/chuột: chạm ô để đi tới, chạm lần nữa (hoặc chạm thẻ thông tin / nút CHƠI) để vào màn.
 * Toạ độ: mọi thứ ở toạ độ MÀN HÌNH logic 960×540, gốc góc trên-trái (bản đồ không cuộn, không có camera).
 * ========================================================================== */

/**
 * Một nút trên bản đồ = một màn chơi.
 * @typedef {Object} MapNode
 * @property {string} id         = level.id
 * @property {LevelDef} level
 * @property {number} index      vị trí trong OG.Data.levels
 * @property {number} x          tâm nút, px màn hình
 * @property {number} y
 * @property {boolean} unlocked
 * @property {boolean} completed
 * @property {Object|null} record  kỷ lục từ OG.Progress.getRecord ({stars, bestScore, bestTime...})
 * @property {string|null} boss
 * @property {string[]} requires  id các màn phải xong trước (= cạnh đi VÀO nút này)
 * @property {{key: string, s: {label: string, fill: string, dark: string, light: string}}} style
 * @property {number} [shakeT]   giây rung còn lại khi bấm vào nút đang khoá
 */

/**
 * Nút bấm vẽ trên canvas (hình chữ nhật toạ độ màn hình, góc trên-trái x, y).
 * @typedef {Object} CanvasButton
 * @property {string} id
 * @property {string} label
 * @property {number} [x]
 * @property {number} [y]
 * @property {number} [w]
 * @property {number} [h]
 * @property {boolean} [primary]   nút chính (to, màu cam)
 * @property {boolean} [disabled]
 */
(function () {
  'use strict';
  var OG = window.OG;
  var U = OG.util;
  // `OG.World || {}`: giữ field extraLevels mà extraLevels.js (load trước) đã gắn. Ép any vì namespace
  // được nhiều file gắn thêm field lúc chạy.
  var World = /** @type {any} */ (OG.World = OG.World || {});

  // ---------------------------------------------------------------------------
  // Hằng số (thời gian: giây · khoảng cách: px màn hình)
  // ---------------------------------------------------------------------------
  var FONT = OG.FONT;        // font chuẩn đủ dấu tiếng Việt (src/core/namespace.js)
  var NODE_R = 28;           // bán kính nút màn
  // 💡 Khái niệm: vùng chạm (hit area) LỚN hơn hình vẽ. Ngón tay trẻ em to và kém chính xác;
  //   hướng dẫn accessibility khuyên vùng chạm tối thiểu ~44 px, nên bán kính 46 > NODE_R 28.
  var HIT_R = 46;            // bán kính vùng chạm nút (≥ 44px)
  var WALK_SPEED = 300;      // px/giây khi Oggy đi giữa các nút
  var LEAVE_TIME = 0.5;      // giây hiệu ứng khép màn trước khi vào màn
  var INTRO_TIME = 0.45;     // giây hiệu ứng mở màn khi vừa vào bản đồ
  var IRIS_MAX_R = 1100;     // px — bán kính đủ lớn để vòng iris phủ hết 960×540 từ bất kỳ điểm nào
  var UNLOCK_FX_TIME = 1.6;  // giây hiệu ứng "vừa mở khoá" quanh nút
  var LOCKED_SHAKE_TIME = 0.45; // giây rung nút khi bấm vào màn đang khoá
  var BANNER_MIN_TIME = 0.35;   // giây — banner chưa nhận thao tác đóng (tránh cú chạm vào màn trước đóng luôn)
  var BANNER_AUTO_CLOSE = 6;    // giây — tự đóng banner nếu bé không bấm gì
  var QUESTS_TAP_GUARD = 0.15;  // giây — bảng nhiệm vụ mới mở chưa nhận chạm (chính cú chạm mở bảng)
  var CURVE_BEND = 0.18;     // độ cong đường đi: điểm điều khiển lệch 18% chiều dài đoạn
  var PATH_LEN_FACTOR = 1.08; // đường cong dài hơn đoạn thẳng ~8% → tốc độ đi bộ trông đều hơn
  var DIR_MIN_COS = 0.3;     // điều hướng phím: nút phải lệch < ~72° so với hướng bấm
  var DIR_ANGLE_PENALTY = 2.2; // điều hướng phím: phạt nút lệch hướng (càng lớn càng ưu tiên nút thẳng hàng)

  function pal(k, fb) { return (OG.Palette && OG.Palette[k]) || fb; }

  // Kiểu vẽ ô khu vực theo mapStyle / theme (dữ liệu màu, thêm khu mới = thêm 1 dòng).
  var STYLES = {
    kitchen: { label: 'Nhà bếp', fill: '#f4a66f', dark: '#c97a45', light: '#ffd7b0' },
    garden: { label: 'Khu vườn', fill: '#9bd47a', dark: '#4a9d62', light: '#d8f3b5' },
    roof: { label: 'Mái nhà', fill: '#e88a66', dark: '#a24a35', light: '#ffc3a6' },
    lair: { label: 'Hang ổ gián', fill: '#5a3b6e', dark: '#2f1d3d', light: '#9a72b3' },
    basement: { label: 'Tầng hầm', fill: '#7a6650', dark: '#4a3b2c', light: '#a89277' },
    bathroom: { label: 'Phòng tắm', fill: '#9fdcef', dark: '#4ea6c4', light: '#e3f7fd' },
    attic: { label: 'Gác mái', fill: '#c9a06a', dark: '#8a6a3c', light: '#ead1a5' },
    boss: { label: 'Đấu trường', fill: '#e5484d', dark: '#9c2a2e', light: '#ffb0b2' }
  };
  var ID_STYLE = { basement: 'basement', bathroom: 'bathroom', attic: 'attic' };

  function styleOf(level) {
    var key = level.mapStyle || ID_STYLE[level.id] || level.theme || 'kitchen';
    return STYLES[key] ? { key: key, s: STYLES[key] } : { key: 'kitchen', s: STYLES.kitchen };
  }
  function zoneLabel(level) { return level.zone || styleOf(level).s.label; }

  // ---------------------------------------------------------------------------
  // Trạng thái
  // ---------------------------------------------------------------------------
  // S được tạo mới trong enter() và đặt null trong exit(): mọi hàm bên dưới coi "S != null" là "đang ở bản đồ".
  var S = null;              // trạng thái scene (null khi không ở bản đồ) — xem newState()
  var pendingFocus = null;   // focusLevel() gọi trước khi vào scene → nhớ lại, dùng ở initialFocus()

  // Gọi OG.Progress.<method>(...) an toàn: module thiếu thì trả undefined thay vì ném lỗi.
  function progress(method) {
    var args = Array.prototype.slice.call(arguments, 1);
    return U.call.apply(null, ['Progress', method].concat(args));
  }
  function levels() { return (OG.Data && Array.isArray(OG.Data.levels)) ? OG.Data.levels : []; }

  function requiresOf(level, index) {
    if (Array.isArray(level.requires)) return level.requires;
    return index > 0 ? [levels()[index - 1].id] : [];
  }

  function bossName(id) {
    if (!id) return '';
    var info = U.call('Bosses', 'getInfo', id);
    if (info && info.name) return info.name;
    if (id === 'trio') return 'Bộ ba gián';
    var ch = OG.Data.characters && OG.Data.characters[id];
    return ch ? ch.name : id;
  }

  // ---------------------------------------------------------------------------
  // Đồ thị màn chơi
  // ---------------------------------------------------------------------------
  /**
   * Dựng đồ thị nút + cạnh từ OG.Data.levels, ghi vào S.nodes / S.byId / S.edges / S.adj.
   * 💡 Khái niệm: graph (đồ thị) — nút = màn, cạnh = "màn A phải xong trước màn B" (requires).
   *   Ta giữ 2 dạng: `edges` (danh sách cạnh [from, to]) để VẼ đường, và `adj` (danh sách kề,
   *   id → các id hàng xóm) để TÌM ĐƯỜNG. Cùng một dữ liệu, mỗi dạng tiện cho một việc.
   * 🧪 Thử: xoá `map` của một màn trong src/data/levels.js → nút đó tự xếp theo hàng ngang mặc định.
   */
  function buildGraph() {
    var ls = levels();
    var nodes = [], byId = {}, edges = [];
    ls.forEach(function (l, i) {
      // Màn thiếu `map`: rải đều trên đoạn x = 120..840, y = 300 (bản đồ vẫn dùng được với dữ liệu tối thiểu).
      var m = l.map || { x: 120 + (ls.length > 1 ? i * (720 / (ls.length - 1)) : 360), y: 300 };
      var n = {
        id: l.id, level: l, index: i, x: m.x, y: m.y,
        unlocked: !!progress('isUnlocked', l.id),
        completed: !!progress('isCompleted', l.id),
        record: progress('getRecord', l.id) || null,
        boss: l.boss || null,
        requires: requiresOf(l, i),
        style: styleOf(l)
      };
      nodes.push(n);
      byId[l.id] = n;
    });
    nodes.forEach(function (n) {
      n.requires.forEach(function (r) { if (byId[r]) edges.push([byId[r], n]); });
    });
    S.nodes = nodes; S.byId = byId; S.edges = edges;
    // Danh sách kề VÔ HƯỚNG: quan hệ khoá/mở có hướng, nhưng Oggy đi bộ được cả hai chiều trên đường.
    S.adj = {};
    nodes.forEach(function (n) { S.adj[n.id] = []; });
    edges.forEach(function (e) { S.adj[e[0].id].push(e[1].id); S.adj[e[1].id].push(e[0].id); });
  }

  // ---------------------------------------------------------------------------
  // Hình học đường đi (Bézier bậc 2, cùng một đường cho cả hai chiều)
  // ---------------------------------------------------------------------------
  // Điểm điều khiển của đường cong a–b: trung điểm, đẩy lệch theo pháp tuyến (vuông góc với đoạn a→b).
  // ⚠️ Bẫy: luôn sắp (a, b) theo id trước khi tính. Nếu không, đi a→b cong lên còn b→a cong xuống —
  //   Oggy sẽ đi lệch khỏi con đường đã vẽ khi quay ngược lại.
  function ctrlPoint(a, b) {
    var p = a.id < b.id ? a : b, q = p === a ? b : a;
    var dx = q.x - p.x, dy = q.y - p.y, len = Math.sqrt(dx * dx + dy * dy) || 1;
    var k = CURVE_BEND * len;
    return { x: (p.x + q.x) / 2 - dy / len * k, y: (p.y + q.y) / 2 + dx / len * k };
  }
  // 💡 Khái niệm: Bézier bậc 2 — B(t) = (1−t)²·A + 2(1−t)t·C + t²·B, t chạy 0 → 1. Cùng công thức với
  //   ctx.quadraticCurveTo trong drawEdges, nên vị trí Oggy khớp đúng nét đường trên màn hình.
  function curveAt(a, b, t) {
    var c = ctrlPoint(a, b), u = 1 - t;
    return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
  }
  function dist(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }

  /**
   * Tìm đường ngắn nhất (ít cạnh nhất) giữa hai nút, chỉ đi qua nút đã mở khoá (riêng nút đích được phép).
   * 💡 Khái niệm: BFS (breadth-first search, tìm theo chiều rộng) — duyệt hàng đợi theo từng "lớp" khoảng cách,
   *   nên lần đầu chạm tới đích chính là đường ít bước nhất. `prev` ghi "đến nút này từ nút nào"
   *   để lần ngược ra đường đi.
   * @param {string} fromId
   * @param {string} toId
   * @returns {string[]|null} mảng id các nút phải đi qua (KHÔNG gồm nút xuất phát), null nếu không có đường
   */
  function findPath(fromId, toId) {
    if (fromId === toId) return [];
    var prev = {}, queue = [fromId], seen = {};
    seen[fromId] = true;
    while (queue.length) {
      var cur = queue.shift();
      var nb = S.adj[cur] || [];
      for (var i = 0; i < nb.length; i++) {
        var id = nb[i];
        if (seen[id]) continue;
        var n = S.byId[id];
        if (!n || (!n.unlocked && id !== toId)) continue;
        seen[id] = true;
        prev[id] = cur;
        if (id === toId) {
          var path = [id];
          while (prev[path[0]] !== fromId) path.unshift(prev[path[0]]);
          return path;
        }
        queue.push(id);
      }
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Hành động
  // ---------------------------------------------------------------------------
  function sfx(name) { U.call('Audio', 'sfx', name); }
  // Phát 'ui:click' thay vì gọi Audio trực tiếp: module nào cần (âm thanh, thống kê) tự nghe.
  function click(id) { OG.Events.emit('ui:click', { id: 'world_' + id }); }

  // Đặt lộ trình cho Oggy tới nút `id`. Oggy đi theo từng ĐOẠN (seg = một cạnh), path = các nút còn lại.
  function walkTo(id) {
    var o = S.oggy, target = S.byId[id];
    if (!target || !target.unlocked) return;
    // Đang đi giữa đường thì tìm đường từ đầu kia của đoạn hiện tại (đi nốt đoạn này rồi rẽ).
    var from = o.seg ? o.seg.to.id : o.nodeId;
    var path = findPath(from, id);
    o.path = path ? path : [id]; // không có đường → đi thẳng
    if (!o.seg) nextSegment();
  }

  function nextSegment() {
    var o = S.oggy;
    if (!o.path.length) { o.seg = null; return; }
    var from = S.byId[o.nodeId], to = S.byId[o.path.shift()];
    if (!from || !to) { o.seg = null; return; }
    o.seg = { from: from, to: to, t: 0, len: Math.max(1, dist(from, to) * PATH_LEN_FACTOR) };
    if (to.x !== from.x) o.face = to.x > from.x ? 1 : -1;
  }

  function isWalking() { return !!(S.oggy.seg || S.oggy.path.length); }

  function select(id, opts) {
    var n = S.byId[id];
    if (!n) return;
    opts = opts || {};
    if (S.sel !== id) click('select');
    S.sel = id;
    if (n.unlocked) { if (opts.walk !== false) walkTo(id); }
    else if (opts.feedback) lockedFeedback(n);
  }

  // Phản hồi khi bấm màn đang khoá: rung + âm thanh + chữ nói rõ CẦN LÀM GÌ (không chỉ "bị khoá").
  // Ba kênh cùng lúc (hình, tiếng, chữ) để bé nào cũng nhận ra, kể cả khi tắt tiếng.
  function lockedFeedback(n) {
    n.shakeT = LOCKED_SHAKE_TIME;
    sfx('locked');
    var names = n.requires.map(function (r) { var l = OG.Data.getLevel(r); return l ? l.name : r; });
    OG.DOM.toast('🔒 Cần hoàn thành: ' + (names.join(', ') || 'màn trước'));
  }

  // "Chơi" nút đang chọn. Oggy chưa đứng ở đó → đi tới trước, ghi pendingStart để updateWalk vào màn khi tới nơi.
  function confirmSelection() {
    var n = S.byId[S.sel];
    if (!n) return;
    if (!n.unlocked) { lockedFeedback(n); return; }
    if (S.oggy.nodeId === n.id && !isWalking()) startLeaving(n.id);
    else { S.pendingStart = n.id; walkTo(n.id); }
  }

  // Bắt đầu hiệu ứng khép iris; LEAVE_TIME giây sau update() mới gọi OG.Game.startLevel.
  function startLeaving(id) {
    if (S.leaving) return;
    S.leaving = { id: id, t: 0 };
    S.pendingStart = null;
    click('play');
    OG.Events.emit('world:select', { levelId: id });
  }

  /**
   * Chọn nút theo hướng phím mũi tên (dx, dy) tính từ nút đang chọn.
   * 💡 Khái niệm: spatial navigation (điều hướng theo không gian) — nút trên bản đồ không xếp thành lưới,
   *   nên "nút bên phải" = nút có góc lệch nhỏ (cos lớn) VÀ gần. Điểm = khoảng cách × (1 + phạt lệch góc),
   *   lấy điểm nhỏ nhất. Nhờ vậy bản đồ chơi được hoàn toàn bằng bàn phím (accessibility).
   * 🧪 Thử: đổi DIR_ANGLE_PENALTY 2.2 → 0 rồi bấm →: nút gần nhất trong nửa bên phải được chọn,
   *   kể cả khi nó nằm chéo lên trên.
   * @param {number} dx  -1 trái, 1 phải, 0
   * @param {number} dy  -1 lên, 1 xuống, 0
   */
  function moveSelection(dx, dy) {
    var cur = S.byId[S.sel];
    if (!cur) return;
    var best = null, bestScore = Infinity;
    S.nodes.forEach(function (n) {
      if (n === cur) return;
      var vx = n.x - cur.x, vy = n.y - cur.y, d = Math.sqrt(vx * vx + vy * vy) || 1;
      var cos = (vx * dx + vy * dy) / d; // tích vô hướng với vector hướng đơn vị = cos góc lệch
      if (cos < DIR_MIN_COS) return; // phải nằm đúng hướng
      var score = d * (1 + DIR_ANGLE_PENALTY * (1 - cos));
      if (score < bestScore) { bestScore = score; best = n; }
    });
    // Không có nút theo hướng ←/→: đi theo thứ tự danh sách cho dễ dùng.
    if (!best && dy === 0) {
      var i = cur.index + (dx > 0 ? 1 : -1);
      if (S.nodes[i]) best = S.nodes[i];
    }
    if (best) select(best.id, { walk: true });
  }

  // ---------------------------------------------------------------------------
  // Bố cục nút bấm trên canvas
  // ---------------------------------------------------------------------------
  // 💡 Khái niệm: canvas UI — canvas chỉ là một tấm ảnh, KHÔNG có <button> thật. Ta tự giữ danh sách
  //   hình chữ nhật {x, y, w, h} (toạ độ màn hình), dùng chung cho cả VẼ (drawButtons) lẫn XÉT CHẠM (hit).
  //   Tính lại mỗi frame từ cùng một hàm nên hình vẽ và vùng bấm không bao giờ lệch nhau.
  //   Đánh đổi so với DOM (src/ui/menus.js): tự do hình ảnh, nhưng phải tự lo focus, con trỏ, phím tắt.
  /** @returns {CanvasButton[]} */
  function buttons() {
    /** @type {CanvasButton[]} */
    var list = [{ id: 'menu', x: 14, y: 10, w: 118, h: 52, label: '◀ Menu' }];
    // Nhóm nút bên phải xếp từ mép phải vào trong; x/y/w/h điền sau trong vòng lặp.
    /** @type {CanvasButton[]} */
    var right = [];
    right.push({ id: 'quests', label: '📜 Nhiệm vụ' });
    if (OG.Scenes.has('charselect')) right.push({ id: 'chars', label: '🐱 Nhân vật' });
    if (OG.Scenes.has('shop')) right.push({ id: 'shop', label: '🛒 Cửa hàng' });
    var x = OG.W - 14;
    for (var i = right.length - 1; i >= 0; i--) {
      var b = right[i];
      b.w = 132; b.h = 52; b.y = 10; x -= b.w; b.x = x; x -= 8;
      list.push(b);
    }
    var sel = S && S.byId[S.sel];
    list.push({
      id: 'play', x: OG.W - 14 - 228, y: OG.H - 14 - 62, w: 228, h: 62, primary: true,
      label: sel && !sel.unlocked ? '🔒 CHƯA MỞ' : '▶ CHƠI', disabled: !!(sel && !sel.unlocked)
    });
    return list;
  }

  // Hit-test: điểm (x, y) có nằm trong hình chữ nhật b không — dạng "điểm trong hộp" của phép xét AABB.
  function hit(b, x, y) { return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h; }

  function onButton(id) {
    click(id);
    if (id === 'menu') { OG.Scenes.go('menu'); return; }
    if (id === 'quests') { openQuests(); return; }
    if (id === 'shop') { OG.Scenes.go('shop', { back: 'worldmap' }); return; }
    if (id === 'chars') { OG.Scenes.go('charselect', { back: 'worldmap' }); return; }
    if (id === 'play') confirmSelection();
  }

  function openQuests() { S.mode = 'quests'; S.questsT = 0; }

  // Nút GẦN NHẤT trong bán kính HIT_R quanh điểm chạm (không phải nút đầu tiên trùng) —
  // hai vùng chạm chồng nhau thì vẫn chọn đúng nút bé định bấm.
  function nodeAt(x, y) {
    var best = null, bd = HIT_R;
    S.nodes.forEach(function (n) { var d = dist(n, { x: x, y: y }); if (d < bd) { bd = d; best = n; } });
    return best;
  }

  // ---------------------------------------------------------------------------
  // Banner sau khi hoàn thành màn
  // ---------------------------------------------------------------------------
  // Gom dữ liệu hiển thị MỘT lần từ LevelResult (params.result) → hàm vẽ chỉ đọc, không tra cứu lại mỗi frame.
  function makeBanner(params) {
    var r = params.result || null;
    var level = OG.Data.getLevel(params.completed);
    if (!level) return null;
    var recent = U.call('Quests', 'takeRecent');
    var unlocked = (r && r.newlyUnlocked) || [];
    return {
      t: 0, level: level,
      stars: r ? (r.stars | 0) : ((progress('getRecord', level.id) || {}).stars | 0),
      reward: r ? (r.coinsReward | 0) : 0,
      score: r ? (r.levelScore | 0) : 0,
      time: r ? r.time : 0,
      bossDefeated: !!(r && r.bossDefeated),
      quests: Array.isArray(recent) ? recent : [],
      unlocked: unlocked.map(function (id) { var l = OG.Data.getLevel(id); return l ? l.name : id; }),
      unlockedIds: unlocked.slice(),
      chars: ((r && r.charsUnlocked) || []).map(function (c) { var ch = OG.Data.characters[c]; return ch ? ch.name : c; })
    };
  }

  function closeBanner() {
    var b = S.banner;
    S.banner = null;
    S.mode = 'map';
    if (!b) return;
    b.unlockedIds.forEach(function (id) {
      if (S.byId[id]) S.unlockFx[id] = 0;
    });
    if (b.unlocked.length) OG.DOM.toast('🔓 Đã mở khoá: ' + b.unlocked.join(', '));
    // Đi tới màn tiếp theo hợp lý, theo thứ tự ưu tiên: màn kế (nếu mở & chưa xong) → màn vừa mở khoá
    // → màn chưa xong đầu tiên. Bé không phải tự tìm "chơi gì tiếp".
    var next = progress('nextLevelId', b.level.id);
    var target = null;
    if (next && S.byId[next] && S.byId[next].unlocked && !S.byId[next].completed) target = next;
    else if (b.unlockedIds.length && S.byId[b.unlockedIds[0]]) target = b.unlockedIds[0];
    else target = progress('firstIncomplete');
    if (target && S.byId[target]) select(target, { walk: true });
  }

  // ---------------------------------------------------------------------------
  // Scene
  // ---------------------------------------------------------------------------
  // Trạng thái scene mới. mode: 'map' (chọn màn) | 'quests' (bảng nhiệm vụ) | 'banner' (kết quả màn) —
  // một state machine nhỏ bên trong scene: update() xử lý input theo đúng mode đang bật.
  function newState() {
    return {
      t: 0, introT: 0, mode: 'map', sel: null, hover: null, hoverBtn: null,
      nodes: [], byId: {}, edges: [], adj: {},
      oggy: { nodeId: null, x: 0, y: 0, face: 1, path: [], seg: null },
      pendingStart: null, leaving: null, banner: null, unlockFx: {}, questsT: 0
    };
  }

  // Nút được chọn khi mở bản đồ: focusLevel() đã hẹn → màn kế của lượt chơi → màn chưa xong đầu tiên → nút đầu.
  function initialFocus() {
    if (pendingFocus && S.byId[pendingFocus]) { var f = pendingFocus; pendingFocus = null; return f; }
    var run = OG.Game && OG.Game.run;
    if (run && !run.over) {
      var l = OG.Data.getLevel(run.nextLevel | 0);
      if (l && S.byId[l.id] && S.byId[l.id].unlocked && !S.byId[l.id].completed) return l.id;
    }
    var fi = progress('firstIncomplete');
    if (fi && S.byId[fi]) return fi;
    return S.nodes.length ? S.nodes[0].id : null;
  }

  function placeOggy(id) {
    var n = S.byId[id];
    if (!n) return;
    var o = S.oggy;
    o.nodeId = id; o.x = n.x; o.y = n.y; o.path = []; o.seg = null;
  }

  /** @type {Scene} */
  var scene = {
    enter: function (params) {
      params = params || {};
      S = newState();
      buildGraph();
      // Bản đồ tự vẽ mọi thứ trên canvas → giấu lớp DOM (HUD, nút cảm ứng, panel) để không che/bắt nhầm chạm.
      if (OG.DOM) {
        OG.DOM.hidePanel();
        OG.DOM.setHudVisible(false);
        OG.DOM.setControlsVisible(false);
      }
      if (!S.nodes.length) return;
      if (params.completed && S.byId[params.completed]) {
        placeOggy(params.completed);
        S.sel = params.completed;
        S.banner = makeBanner(params);
        if (S.banner) S.mode = 'banner';
        else closeBanner();
      } else {
        U.call('Quests', 'takeRecent'); // bỏ thông báo cũ, banner chỉ hiện nhiệm vụ của màn vừa xong
        var f = initialFocus();
        placeOggy(f);
        S.sel = f;
      }
    },

    exit: function () {
      // ⚠️ Bẫy: con trỏ 'pointer' là thuộc tính của <canvas> dùng chung. Quên trả lại khi rời scene
      //   thì cả màn chơi hiện bàn tay dù không có gì để bấm.
      if (OG.canvas) OG.canvas.style.cursor = '';
      S = null;
    },

    resume: function () { if (OG.DOM) OG.DOM.hidePanel(); },

    update: function (dt) {
      if (!S) return;
      S.t += dt;
      S.introT += dt;
      var I = OG.Input, ptr = I.pointer;

      tickNodeFx(dt);

      // Đang rời bản đồ để vào màn: bỏ qua mọi input cho tới khi iris khép xong.
      if (S.leaving) {
        S.leaving.t += dt;
        if (S.leaving.t >= LEAVE_TIME) {
          var id = S.leaving.id;
          S.leaving = null;
          OG.Game.startLevel(id);
        }
        return;
      }

      updateWalk(dt);

      // ⚠️ Bẫy: phím logic 'jump' gồm cả Space, W và ↑. Ở bản đồ ↑/W dùng để CHỌN nút lên trên,
      //   nên chỉ coi là "xác nhận" khi VỪA NHẤN 'jump' (pressed) mà không đang giữ 'up' — tức là Space.
      var spaceOnly = I.pressed('jump') && !I.keys.up; // Space (không phải ↑/W)
      // Gom input của frame này một lần; các hàm con bên dưới chỉ đọc.
      var inp = {
        tapped: ptr.justPressed,
        px: ptr.x, py: ptr.y,
        confirmKey: I.pressed('confirm') || spaceOnly
      };

      if (S.mode === 'banner') { updateBannerMode(dt, I, inp); return; }
      if (S.mode === 'quests') { updateQuestsMode(dt, I, inp); return; }
      updateMapMode(I, ptr, inp);
    },

    draw: function (ctx) {
      if (!S) { drawBackdrop(ctx, OG.time || 0); return; }
      var t = S.t;
      // Thứ tự vẽ = thứ tự lớp (painter's algorithm): nền → đường → ô khu → nút → Oggy → UI → bảng phủ → iris.
      drawBackdrop(ctx, t);
      drawEdges(ctx, t);
      S.nodes.forEach(function (n) { drawZone(ctx, n, t); });
      S.nodes.forEach(function (n) { drawNode(ctx, n, t); });
      drawOggy(ctx, t);
      drawTopBar(ctx);
      drawCard(ctx, t);
      drawButtons(ctx);
      if (S.mode === 'quests') drawQuestBoard(ctx, t);
      if (S.mode === 'banner' && S.banner) drawBanner(ctx, S.banner, t);
      drawIris(ctx);
    }
  };

  // Đếm lùi hiệu ứng "vừa mở khoá" và rung nút khoá.
  function tickNodeFx(dt) {
    for (var k in S.unlockFx) { S.unlockFx[k] += dt; if (S.unlockFx[k] > UNLOCK_FX_TIME) delete S.unlockFx[k]; }
    S.nodes.forEach(function (n) { if (n.shakeT) n.shakeT = Math.max(0, n.shakeT - dt); });
  }

  // Mode 'banner': đợi BANNER_MIN_TIME giây rồi mới nhận chạm/phím để đóng; tự đóng sau BANNER_AUTO_CLOSE giây.
  function updateBannerMode(dt, I, inp) {
    if (S.banner) S.banner.t += dt;
    if ((S.banner && S.banner.t > BANNER_MIN_TIME && (inp.tapped || inp.confirmKey || I.pressed('action') || I.pressed('back'))) || (S.banner && S.banner.t > BANNER_AUTO_CLOSE)) {
      click('banner');
      closeBanner();
    }
  }

  // Mode 'quests': đóng bằng Esc / E / Enter, chạm nút ✕ hoặc chạm RA NGOÀI bảng (thói quen quen thuộc
  // với hộp thoại trên điện thoại).
  function updateQuestsMode(dt, I, inp) {
    S.questsT += dt;
    if (I.pressed('back') || I.pressed('action') || inp.confirmKey) { click('closeQuests'); S.mode = 'map'; return; }
    if (inp.tapped && S.questsT > QUESTS_TAP_GUARD) {
      var box = questsBox();
      var close = { x: box.x + box.w - 62, y: box.y + 8, w: 54, h: 54 };
      if (hit(close, inp.px, inp.py) || !hit(box, inp.px, inp.py)) { click('closeQuests'); S.mode = 'map'; }
    }
  }

  // Mode 'map': hover chuột → chạm/click → phím. Mỗi frame chỉ xử lý MỘT hành động (return sớm).
  function updateMapMode(I, ptr, inp) {
    var tapped = inp.tapped, px = inp.px, py = inp.py;
    // Di chuột: nút được hover. Thứ tự ưu tiên giống thứ tự vẽ ngược: nút UI (vẽ trên) thắng nút màn.
    S.hover = null; S.hoverBtn = null;
    var btns = buttons();
    if (ptr.inside || tapped) {
      for (var b = 0; b < btns.length; b++) if (hit(btns[b], px, py)) { S.hoverBtn = btns[b].id; break; }
      if (!S.hoverBtn) { var hn = nodeAt(px, py); if (hn) S.hover = hn.id; }
    }
    if (OG.canvas) OG.canvas.style.cursor = (S.hover || S.hoverBtn || (ptr.inside && cardHit(px, py))) ? 'pointer' : '';

    if (tapped) {
      if (S.hoverBtn) { onButton(S.hoverBtn); return; }
      var n = nodeAt(px, py);
      if (n) {
        // Chạm lần 1 = chọn + đi tới, chạm lần 2 vào cùng nút = chơi (không cần nhắm nút CHƠI nhỏ ở góc).
        if (n.id === S.sel && n.unlocked) confirmSelection();
        else select(n.id, { walk: true, feedback: true });
        return;
      }
      if (cardHit(px, py)) { confirmSelection(); return; }
    }

    if (I.pressed('back')) { click('menu'); OG.Scenes.go('menu'); return; }
    if (I.pressed('action')) { click('quests'); openQuests(); return; }
    if (inp.confirmKey) { confirmSelection(); return; }
    if (I.pressed('left')) moveSelection(-1, 0);
    else if (I.pressed('right')) moveSelection(1, 0);
    else if (I.pressed('up')) moveSelection(0, -1);
    else if (I.pressed('down')) moveSelection(0, 1);
  }

  /**
   * Cho Oggy đi dọc đoạn đường hiện tại. Tham số t của đoạn tăng theo QUÃNG ĐƯỜNG (WALK_SPEED·dt / len)
   * chứ không cộng thẳng dt — nhờ vậy đoạn dài hay ngắn Oggy đều đi cùng tốc độ px/giây.
   * Tới cuối đoạn: còn path thì sang đoạn kế, hết path thì phát 'world:arrive'.
   * @param {number} dt  giây
   */
  function updateWalk(dt) {
    var o = S.oggy;
    if (!o.seg) {
      if (o.path.length) nextSegment();
      else if (S.pendingStart && S.pendingStart === o.nodeId) startLeaving(o.nodeId);
      return;
    }
    var seg = o.seg;
    seg.t = Math.min(1, seg.t + WALK_SPEED * dt / seg.len);
    var p = curveAt(seg.from, seg.to, seg.t);
    if (Math.abs(p.x - o.x) > 0.3) o.face = p.x > o.x ? 1 : -1;
    o.x = p.x; o.y = p.y;
    if (seg.t >= 1) {
      o.nodeId = seg.to.id;
      o.seg = null;
      if (o.path.length) nextSegment();
      else OG.Events.emit('world:arrive', { levelId: o.nodeId });
    }
  }

  // ---------------------------------------------------------------------------
  // Vẽ — tiện ích chữ & hình
  // ---------------------------------------------------------------------------
  // Vẽ một dòng chữ căn giữa theo chiều dọc tại (x, y). Mặc định đậm, căn trái.
  function text(ctx, str, x, y, size, color, align, weight) {
    ctx.font = (weight || 'bold') + ' ' + size + 'px ' + FONT;
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(str, x, y);
  }
  // Cắt chữ cho vừa bề rộng (thêm "…"). Canvas không tự xuống dòng/cắt chữ như CSS, phải đo bằng measureText.
  // ⚠️ Bẫy: measureText đo theo ctx.font HIỆN TẠI — phải đặt ctx.font đúng cỡ chữ trước khi gọi fit().
  function fit(ctx, str, maxW) {
    str = String(str);
    if (ctx.measureText(str).width <= maxW) return str;
    while (str.length > 1 && ctx.measureText(str + '…').width > maxW) str = str.slice(0, -1);
    return str + '…';
  }

  // Ngôi sao 5 cánh tâm (x, y): 10 đỉnh xen kẽ bán kính ngoài r và trong 0.45r.
  function drawStar(ctx, x, y, r, filled, color) {
    ctx.save();
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = filled ? (color || pal('gold', '#ffc94a')) : '#ffffff55';
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, r * 0.22);
    ctx.strokeStyle = filled ? '#b87542' : '#17233d55';
    ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Vẽ — nền, đường, ô khu, nút
  // ---------------------------------------------------------------------------
  // Nền: bầu trời, đồi, ngôi nhà cắt ngang, mặt đất và tầng hầm. Vẽ procedural (bằng lệnh, không dùng ảnh),
  // hoạt ảnh (mây, khói) chỉ phụ thuộc thời gian t → không cần lưu trạng thái riêng cho từng đám mây.
  function drawBackdrop(ctx, t) {
    var W = OG.W, H = OG.H;
    ctx.save();
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, pal('skyTop', '#76d8f2'));
    g.addColorStop(1, pal('skyBottom', '#e8f6c7'));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // mây trôi: x = (vị trí gốc + t·tốc độ) % (bề rộng + lề) → trôi khỏi mép phải thì vòng lại từ mép trái
    ctx.fillStyle = '#ffffffb0';
    for (var c = 0; c < 4; c++) {
      var cx = ((c * 290 + t * (8 + c * 3)) % (W + 240)) - 120, cy = 92 + (c % 2) * 38;
      ctx.beginPath();
      ctx.arc(cx, cy, 20, 0, Math.PI * 2); ctx.arc(cx + 24, cy - 9, 24, 0, Math.PI * 2); ctx.arc(cx + 50, cy, 18, 0, Math.PI * 2);
      ctx.fill();
    }

    // đồi
    ctx.fillStyle = '#8fd07a';
    ctx.beginPath(); ctx.moveTo(0, 430);
    ctx.quadraticCurveTo(200, 340, 420, 420); ctx.quadraticCurveTo(650, 350, 960, 410);
    ctx.lineTo(960, 470); ctx.lineTo(0, 470); ctx.closePath(); ctx.fill();

    // ngôi nhà (cắt ngang, nhạt để nổi các ô khu vực)
    ctx.globalAlpha = 0.55;
    U.fillRound(ctx, 70, 168, 820, 292, 18, '#fbe3bd');
    // mái
    ctx.fillStyle = '#d9694a';
    ctx.beginPath(); ctx.moveTo(40, 178); ctx.lineTo(480, 58); ctx.lineTo(920, 178); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#b8553a';
    ctx.fillRect(690, 74, 46, 70); // ống khói
    // sàn tầng
    ctx.fillStyle = '#c99a6a';
    ctx.fillRect(70, 312, 820, 8);
    // cửa sổ
    ctx.fillStyle = '#bfeef7';
    [[120, 200], [260, 200], [660, 200], [800, 200], [470, 350]].forEach(function (w) { U.fillRound(ctx, w[0], w[1], 50, 46, 8, '#bfeef7'); });
    ctx.globalAlpha = 1;
    // khói ống khói
    ctx.fillStyle = '#ffffff80';
    for (var s = 0; s < 3; s++) {
      var k = ((t * 0.5 + s / 3) % 1);
      ctx.beginPath(); ctx.arc(713 + Math.sin(k * 6 + s) * 6, 70 - k * 50, 6 + k * 10, 0, Math.PI * 2); ctx.fill();
    }

    // mặt đất + đất dưới tầng hầm
    ctx.fillStyle = pal('grass', '#75bd59');
    ctx.fillRect(0, 456, W, 10);
    ctx.fillStyle = '#8a5a35';
    ctx.fillRect(0, 466, W, H - 466);
    ctx.fillStyle = '#7a4d2c';
    for (var r = 0; r < 14; r++) {
      ctx.beginPath(); ctx.arc((r * 137) % W, 488 + (r * 53) % 44, 4 + (r % 3), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // Đường nối các nút. Đường đã mở: 3 nét chồng (viền nâu, lòng vàng, vạch trắng chạy nhờ lineDashOffset
  // giảm theo t → "kiến bò" chỉ hướng đi). Đường khoá: nét chấm mờ.
  function drawEdges(ctx, t) {
    ctx.save();
    ctx.lineCap = 'round';
    S.edges.forEach(function (e) {
      var a = e[0], b = e[1], c = ctrlPoint(a, b);
      var open = a.unlocked && b.unlocked;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(c.x, c.y, b.x, b.y);
      if (open) {
        ctx.strokeStyle = '#8a5a35'; ctx.lineWidth = 16; ctx.setLineDash([]); ctx.stroke();
        ctx.strokeStyle = '#f5d28b'; ctx.lineWidth = 11; ctx.stroke();
        ctx.strokeStyle = '#ffffffcc'; ctx.lineWidth = 3; ctx.setLineDash([10, 12]);
        ctx.lineDashOffset = -t * 20;
        ctx.stroke();
      } else {
        ctx.strokeStyle = '#17233d55'; ctx.lineWidth = 6; ctx.setLineDash([4, 12]);
        ctx.lineDashOffset = 0;
        ctx.stroke();
      }
    });
    ctx.setLineDash([]);
    ctx.restore();
  }

  // Ô khu vực sau mỗi nút (mẫu vẽ theo khu).
  function drawZone(ctx, n, t) {
    var st = n.style.s, key = n.style.key;
    var x = n.x - 76, y = n.y - 64, w = 152, h = 126;
    ctx.save();
    ctx.globalAlpha = n.unlocked ? 1 : 0.6;
    U.fillRound(ctx, x + 3, y + 5, w, h, 22, '#17233d33');
    U.fillRound(ctx, x, y, w, h, 22, st.fill);
    // clip() giới hạn vùng vẽ trong khung bo góc → hoa văn tràn ra ngoài tự bị cắt. save/restore riêng
    // để bỏ vùng clip ngay sau khi vẽ hoa văn (clip không "tắt" được bằng lệnh nào khác).
    ctx.save();
    U.roundRectPath(ctx, x, y, w, h, 22);
    ctx.clip();
    drawPattern(ctx, key, st, x, y, w, h, t);
    ctx.restore();
    ctx.lineWidth = 4;
    ctx.strokeStyle = st.dark;
    U.roundRectPath(ctx, x, y, w, h, 22);
    ctx.stroke();
    // nhãn khu
    ctx.font = 'bold 13px ' + FONT;
    var label = zoneLabel(n.level).toUpperCase();
    var lw = Math.min(w - 16, ctx.measureText(label).width + 18);
    U.fillRound(ctx, n.x - lw / 2, y + h - 22, lw, 18, 9, st.dark);
    text(ctx, fit(ctx, label, lw - 10), n.x, y + h - 13, 12, '#fff6df', 'center');
    if (n.level.bonus) {
      U.fillRound(ctx, x + 6, y + 6, 48, 18, 9, '#17233dcc');
      text(ctx, 'PHỤ', x + 30, y + 15, 11, '#ffd36b', 'center');
    }
    ctx.restore();
  }

  // Hoa văn riêng từng khu (gạch bếp, cỏ, ngói, mắt gián trong bóng tối...). Toạ độ góc trên-trái (x, y).
  // `globalAlpha *= k` thay vì `= k` để giữ độ mờ của ô khoá (0.6) mà drawZone đã đặt.
  function drawPattern(ctx, key, st, x, y, w, h, t) {
    var i, j;
    ctx.fillStyle = st.light;
    if (key === 'kitchen') {
      ctx.globalAlpha *= 0.45;
      for (i = 0; i < w; i += 20) for (j = 0; j < h; j += 20) if (((i + j) / 20) % 2 === 0) ctx.fillRect(x + i, y + j, 20, 20);
    } else if (key === 'garden') {
      for (i = 0; i < 9; i++) {
        var gx = x + 10 + i * 17, gy = y + h - 30 - (i % 3) * 30;
        ctx.fillStyle = st.dark;
        ctx.beginPath(); ctx.moveTo(gx, gy + 8); ctx.lineTo(gx + 4, gy - 4); ctx.lineTo(gx + 8, gy + 8); ctx.fill();
        if (i % 3 === 1) { ctx.fillStyle = i % 2 ? '#ff8fb1' : '#fff27a'; ctx.beginPath(); ctx.arc(gx + 4, gy - 8, 4, 0, Math.PI * 2); ctx.fill(); }
      }
    } else if (key === 'roof') {
      ctx.strokeStyle = st.dark; ctx.globalAlpha *= 0.5; ctx.lineWidth = 2;
      for (j = 0; j < h; j += 16) for (i = (j / 16) % 2 ? -12 : 0; i < w; i += 24) {
        ctx.beginPath(); ctx.arc(x + i + 12, y + j, 12, 0, Math.PI); ctx.stroke();
      }
    } else if (key === 'lair') {
      for (i = 0; i < 5; i++) {
        var ex = x + 18 + (i * 31) % (w - 30), ey = y + 18 + (i * 47) % (h - 50);
        var blink = Math.sin(t * 2 + i * 1.7) > 0.92 ? 0.15 : 1;
        ctx.fillStyle = '#ffe36b';
        ctx.beginPath(); ctx.ellipse(ex, ey, 3, 3 * blink, 0, 0, Math.PI * 2); ctx.ellipse(ex + 9, ey, 3, 3 * blink, 0, 0, Math.PI * 2); ctx.fill();
      }
    } else if (key === 'basement') {
      ctx.strokeStyle = st.dark; ctx.lineWidth = 2; ctx.globalAlpha *= 0.6;
      for (j = 0; j < h; j += 16) {
        ctx.beginPath(); ctx.moveTo(x, y + j); ctx.lineTo(x + w, y + j); ctx.stroke();
        for (i = (j / 16) % 2 ? 16 : 0; i < w; i += 32) { ctx.beginPath(); ctx.moveTo(x + i, y + j); ctx.lineTo(x + i, y + j + 16); ctx.stroke(); }
      }
      // ánh nến
      ctx.globalAlpha = 0.35 + Math.sin(t * 6) * 0.08;
      var rg = ctx.createRadialGradient(x + w / 2, y + h / 2, 5, x + w / 2, y + h / 2, 80);
      rg.addColorStop(0, '#ffd36b'); rg.addColorStop(1, '#ffd36b00');
      ctx.fillStyle = rg; ctx.fillRect(x, y, w, h);
    } else if (key === 'bathroom') {
      ctx.globalAlpha *= 0.7;
      for (i = 0; i < 7; i++) {
        var by = y + h - ((t * 22 + i * 37) % (h + 20)), bx = x + 14 + (i * 23) % (w - 24);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(bx, by, 4 + (i % 3) * 2, 0, Math.PI * 2); ctx.stroke();
      }
    } else if (key === 'attic') {
      ctx.strokeStyle = st.dark; ctx.lineWidth = 2; ctx.globalAlpha *= 0.55;
      for (i = 0; i < w; i += 22) { ctx.beginPath(); ctx.moveTo(x + i, y); ctx.lineTo(x + i, y + h); ctx.stroke(); }
      // mạng nhện góc trên phải
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
      for (i = 1; i <= 3; i++) { ctx.beginPath(); ctx.arc(x + w, y, i * 12, Math.PI / 2, Math.PI); ctx.stroke(); }
      for (i = 0; i < 4; i++) { var a = Math.PI / 2 + i * Math.PI / 6; ctx.beginPath(); ctx.moveTo(x + w, y); ctx.lineTo(x + w + Math.cos(a) * 40, y + Math.sin(a) * 40); ctx.stroke(); }
    }
  }

  // Nút màn: vòng chọn xoay → bóng → thân (màu theo trạng thái) → biểu tượng → khoá/dấu tích → sao → trùm → hiệu ứng mở khoá.
  // Trạng thái được báo bằng NHIỀU dấu hiệu (màu + biểu tượng ổ khoá/dấu tích), không chỉ màu —
  // người mù màu vẫn phân biệt được màn khoá / đã xong.
  function drawNode(ctx, n, t) {
    // rung ngang ±5 px bằng sin khi vừa bấm vào nút khoá
    var x = n.x + (n.shakeT ? Math.sin(n.shakeT * 60) * 5 : 0), y = n.y;
    var selected = n.id === S.sel, hovered = n.id === S.hover;
    ctx.save();
    // vòng chọn
    if (selected) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(t * 1.2);
      ctx.setLineDash([8, 7]);
      ctx.lineWidth = 4;
      ctx.strokeStyle = pal('gold', '#ffc94a');
      ctx.beginPath(); ctx.arc(0, 0, NODE_R + 9 + Math.sin(t * 5) * 2, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    // bóng
    ctx.fillStyle = '#17233d40';
    ctx.beginPath(); ctx.ellipse(x, y + NODE_R - 2, NODE_R * 0.95, 8, 0, 0, Math.PI * 2); ctx.fill();
    // thân nút
    var ring = !n.unlocked ? '#5c6577' : n.completed ? pal('success', '#3fbf6f') : n.boss ? pal('danger', '#e5484d') : pal('orange', '#f27a43');
    ctx.fillStyle = ring;
    ctx.beginPath(); ctx.arc(x, y, NODE_R + (hovered ? 3 : 0), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = n.unlocked ? pal('cream', '#fff6df') : '#a3abb9';
    ctx.beginPath(); ctx.arc(x, y, NODE_R - 6, 0, Math.PI * 2); ctx.fill();
    // biểu tượng màn
    ctx.globalAlpha = n.unlocked ? 1 : 0.35;
    ctx.font = '24px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#17233d';
    ctx.fillText(n.level.icon || '📍', x, y + 1);
    ctx.globalAlpha = 1;
    if (!n.unlocked) drawPadlock(ctx, x, y + 2);
    // dấu hoàn thành
    if (n.completed) {
      ctx.fillStyle = pal('success', '#3fbf6f');
      ctx.beginPath(); ctx.arc(x - NODE_R + 4, y - NODE_R + 6, 10, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - NODE_R - 1, y - NODE_R + 6); ctx.lineTo(x - NODE_R + 3, y - NODE_R + 10); ctx.lineTo(x - NODE_R + 10, y - NODE_R + 2); ctx.stroke();
    }
    // sao (từ OG.Progress)
    var stars = (n.record && n.record.stars) | 0;
    for (var i = 0; i < 3; i++) drawStar(ctx, x - 20 + i * 20, y + NODE_R + 12, 8, i < stars);
    // trùm
    if (n.boss) drawBossMarker(ctx, n, x, y, t);
    // hiệu ứng vừa mở khoá
    var fx = S.unlockFx[n.id];
    if (fx != null) {
      var k = Math.min(1, fx / 1.2);
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = pal('gold', '#ffc94a'); ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(x, y, NODE_R + k * 50, 0, Math.PI * 2); ctx.stroke();
      for (var s = 0; s < 8; s++) {
        var a = s * Math.PI / 4 + fx;
        drawStar(ctx, x + Math.cos(a) * (NODE_R + k * 60), y + Math.sin(a) * (NODE_R + k * 60), 6, true);
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function drawPadlock(ctx, x, y) {
    ctx.save();
    ctx.strokeStyle = '#17233d'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(x, y - 6, 7, Math.PI, 0); ctx.stroke();
    U.fillRound(ctx, x - 11, y - 6, 22, 17, 4, '#17233d');
    ctx.fillStyle = pal('gold', '#ffc94a');
    ctx.beginPath(); ctx.arc(x, y + 1, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Trùm nhỏ đứng cạnh nút (mờ đi khi đã hạ).
  function drawBossMarker(ctx, n, x, y, t) {
    var ids = n.boss === 'trio' ? ['joey', 'marky', 'deedee'] : [n.boss];
    var beaten = n.completed;
    ctx.save();
    ctx.globalAlpha = beaten ? 0.45 : (n.unlocked ? 1 : 0.7);
    ids.forEach(function (id, i) {
      var ch = OG.Data.characters && OG.Data.characters[id];
      if (!ch) return;
      var bx = x + NODE_R + 10 + i * 16, by = y + 10 - i * 4;
      ctx.save();
      ctx.translate(bx, by);
      U.safe('World.drawBoss', OG.Sprites && OG.Sprites.drawCharacter, OG.Sprites, [ctx, id, beaten ? 'hurt' : 'idle', t + i, { face: -1, w: ch.w, h: ch.h, scale: 0.55 }]);
      ctx.restore();
    });
    // huy hiệu kiếm
    ctx.globalAlpha = 1;
    ctx.fillStyle = beaten ? '#5c6577' : pal('danger', '#e5484d');
    ctx.beginPath(); ctx.arc(x + NODE_R - 2, y - NODE_R + 4, 11, 0, Math.PI * 2); ctx.fill();
    text(ctx, beaten ? '✓' : '!', x + NODE_R - 2, y - NODE_R + 5, 14, '#fff', 'center');
    ctx.restore();
  }

  function oggyChar() {
    var run = OG.Game && OG.Game.run;
    var save = (OG.Save && OG.Save.data) || {};
    var charId = (run && run.charId) || save.selectedChar || 'oggy';
    var skin = (run && run.skinId) || (save.equippedSkins && save.equippedSkins[charId]) || null;
    var ch = (OG.Data.getCharacter && OG.Data.getCharacter(charId)) || { w: 34, h: 52 };
    return { id: charId, skin: skin, w: ch.w || 34, h: ch.h || 52 };
  }

  function drawOggy(ctx, t) {
    var o = S.oggy;
    if (!o.nodeId) return;
    // gần nút thì đứng trên nút, giữa đường thì đứng trên đường
    var near = Infinity;
    S.nodes.forEach(function (n) { near = Math.min(near, dist(n, o)); });
    var lift = 4 + 20 * Math.max(0, 1 - near / 40);
    var c = oggyChar();
    var walking = isWalking();
    var anim = walking ? 'run' : (S.mode === 'banner' ? 'victory' : 'idle');
    ctx.save();
    ctx.translate(o.x, o.y - lift);
    ctx.fillStyle = '#17233d40';
    ctx.beginPath(); ctx.ellipse(0, 2, 16, 5, 0, 0, Math.PI * 2); ctx.fill();
    // U.safe: lỗi trong module Sprites không làm sập cả bản đồ (cô lập lỗi module).
    var ok = U.safe('World.drawOggy', OG.Sprites && OG.Sprites.drawCharacter, OG.Sprites, [ctx, c.id, anim, t, { face: o.face, skin: c.skin, w: c.w, h: c.h, scale: 0.8, vx: walking ? o.face * WALK_SPEED : 0 }]);
    if (ok === undefined && !(OG.Sprites && OG.Sprites.drawCharacter)) {
      // dự phòng khi không có Sprites: chấm tròn xanh
      ctx.fillStyle = pal('oggyBody', '#2877d5');
      ctx.beginPath(); ctx.arc(0, -18, 14, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Vẽ — lớp UI trên canvas (thanh trên, nút, thẻ thông tin)
  // ---------------------------------------------------------------------------
  function drawTopBar(ctx) {
    ctx.save();
    U.fillRound(ctx, 6, 4, OG.W - 12, 64, 18, '#fff6dfe6');
    ctx.lineWidth = 3; ctx.strokeStyle = '#b87542';
    U.roundRectPath(ctx, 6, 4, OG.W - 12, 64, 18); ctx.stroke();
    var x0 = 146;
    text(ctx, '🏠 Ngôi nhà của Oggy', x0, 24, 21, pal('titleOrange', '#ed713c'));
    var stars = progress('totalStars') | 0, maxStars = progress('maxStars') | 0;
    var coins = OG.Save && OG.Save.getCoins ? OG.Save.getCoins() : 0;
    var line = '⭐ ' + stars + '/' + maxStars + '   🪙 ' + coins;
    var run = OG.Game && OG.Game.run;
    if (run && !run.over) line += '   ❤ ' + run.lives + '   Điểm ' + run.score;
    ctx.font = 'bold 14px ' + FONT;
    text(ctx, fit(ctx, line, 380), x0, 50, 14, pal('panelText', '#25314a'));
    ctx.restore();
  }

  function drawButtons(ctx) {
    var btns = buttons();
    var daily = U.call('Quests', 'getDaily');
    btns.forEach(function (b) {
      var hov = S.hoverBtn === b.id;
      var face = b.disabled ? '#8a94a6' : b.primary ? pal('orange', '#f27a43') : pal('secondary', '#52b9df');
      var shadow = b.disabled ? '#5c6577' : b.primary ? pal('orangeShadow', '#b74b2b') : pal('secondaryShadow', '#2582aa');
      // Nút "lún" 3 px khi đang nhấn: phản hồi bằng hình thay cho hiệu ứng :active của CSS.
      var pressY = hov && OG.Input.pointer.down ? 3 : 0;
      ctx.save();
      U.fillRound(ctx, b.x, b.y + 5, b.w, b.h, 16, shadow);
      U.fillRound(ctx, b.x, b.y + pressY, b.w, b.h, 16, face);
      if (hov) { ctx.lineWidth = 3; ctx.strokeStyle = '#ffffff'; U.roundRectPath(ctx, b.x, b.y + pressY, b.w, b.h, 16); ctx.stroke(); }
      ctx.font = 'bold ' + (b.primary ? 24 : 16) + 'px ' + FONT;
      text(ctx, fit(ctx, b.label, b.w - 14), b.x + b.w / 2, b.y + b.h / 2 + pressY + 1, b.primary ? 24 : 16, '#ffffff', 'center');
      // chấm báo nhiệm vụ ngày chưa xong
      if (b.id === 'quests' && Array.isArray(daily)) {
        var left = daily.filter(function (q) { return !q.done; }).length;
        if (left > 0) {
          ctx.fillStyle = pal('danger', '#e5484d');
          ctx.beginPath(); ctx.arc(b.x + b.w - 6, b.y + 6, 11, 0, Math.PI * 2); ctx.fill();
          text(ctx, String(left), b.x + b.w - 6, b.y + 7, 13, '#fff', 'center');
        }
      }
      ctx.restore();
    });
  }

  // Bố cục thẻ thông tin của nút đang chọn: đặt bên PHẢI nút nếu nút ở nửa trái màn hình và ngược lại,
  // rồi kẹp trong màn hình. Dùng chung cho drawCard (vẽ) và cardHit (xét chạm) — một nguồn sự thật.
  function cardLayout() {
    var n = S && S.byId[S.sel];
    if (!n) return null;
    var quests = U.call('Quests', 'getForLevel', n.id);
    quests = Array.isArray(quests) ? quests.slice(0, 4) : [];
    var w = 300, h = 112 + (n.boss ? 20 : 0) + quests.length * 22 + 30;
    var x = n.x < OG.W / 2 ? n.x + 92 : n.x - 92 - w;
    var y = U.clamp(n.y - h / 2, 76, OG.H - h - 10);
    x = U.clamp(x, 8, OG.W - w - 8);
    return { n: n, x: x, y: y, w: w, h: h, quests: quests };
  }
  function cardHit(px, py) {
    if (!S || S.mode !== 'map') return false;
    var c = cardLayout();
    return !!(c && c.n.unlocked && px >= c.x && px <= c.x + c.w && py >= c.y && py <= c.y + c.h);
  }

  function drawCard(ctx, t) {
    var c = cardLayout();
    if (!c || S.mode !== 'map') return;
    var n = c.n, L = n.level, x = c.x, y = c.y, w = c.w;
    ctx.save();
    ctx.globalAlpha = 0.97;
    U.fillRound(ctx, x + 3, y + 6, w, c.h, 18, '#17233d44');
    U.fillRound(ctx, x, y, w, c.h, 18, pal('cream', '#fff6df'));
    ctx.lineWidth = 3; ctx.strokeStyle = n.style.s.dark;
    U.roundRectPath(ctx, x, y, w, c.h, 18); ctx.stroke();
    U.fillRound(ctx, x, y, w, 34, 18, n.style.s.fill);
    ctx.fillStyle = n.style.s.fill; ctx.fillRect(x, y + 18, w, 16);
    ctx.font = 'bold 17px ' + FONT;
    text(ctx, fit(ctx, (L.icon || '') + ' ' + L.name, w - 20), x + 12, y + 18, 17, '#17233d');
    var yy = y + 50;
    ctx.font = 'bold 13px ' + FONT;
    text(ctx, zoneLabel(L) + (L.bonus ? ' · Màn phụ' : '') + ' · Cần ' + (L.goal || 0) + ' 🍕', x + 12, yy, 13, '#25314a');
    yy += 22;
    if (n.boss) {
      text(ctx, '⚔ Trùm: ' + bossName(n.boss) + (n.completed ? ' (đã hạ)' : ''), x + 12, yy, 13, n.completed ? '#3f8f5a' : '#c0392b');
      yy += 20;
    }
    var rec = n.record;
    var stars = (rec && rec.stars) | 0;
    for (var i = 0; i < 3; i++) drawStar(ctx, x + 22 + i * 24, yy, 10, i < stars);
    var info = rec && rec.completed ? 'Kỷ lục ' + (rec.bestScore | 0) + (rec.bestTime ? ' · ⏱ ' + U.formatTime(rec.bestTime) : '') : (n.unlocked ? 'Chưa hoàn thành' : 'Đang khoá');
    ctx.font = 'bold 12px ' + FONT;
    text(ctx, fit(ctx, info, w - 100), x + 92, yy, 12, '#25314a');
    yy += 22;
    // nhiệm vụ màn
    c.quests.forEach(function (q) {
      var col = q.done ? '#2e8b57' : '#25314a';
      text(ctx, q.done ? '✔' : '○', x + 14, yy, 14, col);
      ctx.font = (q.done ? 'bold ' : '') + '12px ' + FONT;
      var label = q.text + (q.reward ? '  +' + q.reward + '🪙' : '');
      text(ctx, fit(ctx, label, w - 46), x + 32, yy, 12, col, 'left', q.done ? 'bold' : 'normal');
      yy += 22;
    });
    // chân thẻ
    var foot;
    if (!n.unlocked) {
      var names = n.requires.map(function (r) { var l = OG.Data.getLevel(r); return l ? l.name : r; });
      foot = '🔒 Cần xong: ' + (names.join(', ') || 'màn trước');
    } else {
      foot = '▶ Enter / Space / chạm để chơi';
    }
    ctx.font = 'bold 12px ' + FONT;
    U.fillRound(ctx, x + 8, y + c.h - 30, w - 16, 22, 11, n.unlocked ? '#ffe7a8' : '#e3e6ec');
    text(ctx, fit(ctx, foot, w - 28), x + w / 2, y + c.h - 19, 12, n.unlocked ? '#b74b2b' : '#5c6577', 'center');
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Bảng nhiệm vụ (mode 'quests') — chỉ ĐỌC dữ liệu từ OG.Quests, không tự đếm gì
  // ---------------------------------------------------------------------------
  function questsBox() { return { x: 90, y: 56, w: OG.W - 180, h: 452 }; }

  function drawQuestRow(ctx, q, x, y, w) {
    var h = 36;
    U.fillRound(ctx, x, y, w, h, 12, q.done ? '#dff5e6' : '#ffffff');
    // ô tick
    ctx.fillStyle = q.done ? pal('success', '#3fbf6f') : '#d7dbe3';
    ctx.beginPath(); ctx.arc(x + 18, y + h / 2, 11, 0, Math.PI * 2); ctx.fill();
    if (q.done) text(ctx, '✓', x + 18, y + h / 2 + 1, 15, '#fff', 'center');
    ctx.font = 'bold 13px ' + FONT;
    text(ctx, fit(ctx, q.text, w - 130), x + 36, y + 13, 13, '#25314a');
    // thanh tiến độ
    var bw = w - 130, k = q.target ? Math.min(1, q.progress / q.target) : 0;
    U.fillRound(ctx, x + 36, y + 24, bw, 6, 3, '#e3e6ec');
    if (k > 0) U.fillRound(ctx, x + 36, y + 24, Math.max(6, bw * k), 6, 3, q.done ? pal('success', '#3fbf6f') : pal('gold', '#ffc94a'));
    text(ctx, Math.min(q.progress, q.target) + '/' + q.target, x + w - 86, y + 13, 12, '#5c6577', 'center');
    text(ctx, '🪙' + q.reward, x + w - 36, y + 13, 12, '#b87542', 'center');
    if (q.done) text(ctx, 'ĐÃ NHẬN', x + w - 60, y + 27, 10, '#2e8b57', 'center');
  }

  function drawQuestBoard(ctx, t) {
    var b = questsBox();
    var k = Math.min(1, S.questsT * 6); // 0 → 1 trong ~0.17 giây đầu
    ctx.save();
    ctx.fillStyle = 'rgba(16,25,43,' + (0.55 * k) + ')';
    ctx.fillRect(0, 0, OG.W, OG.H);
    // Phóng to quanh TÂM hộp = translate tới tâm → scale → translate ngược lại.
    // Gọi scale trực tiếp thì hộp phóng to quanh góc (0, 0) của canvas và trượt lệch đi.
    ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
    ctx.scale(0.9 + 0.1 * k, 0.9 + 0.1 * k);
    ctx.translate(-(b.x + b.w / 2), -(b.y + b.h / 2));
    U.fillRound(ctx, b.x, b.y + 6, b.w, b.h, 24, '#b87542');
    U.fillRound(ctx, b.x, b.y, b.w, b.h, 24, pal('cream', '#fff6df'));
    text(ctx, '📜 Nhiệm vụ & Thành tựu', b.x + 24, b.y + 34, 24, pal('titleOrange', '#ed713c'));
    // nút đóng
    var cx = b.x + b.w - 62, cy = b.y + 8;
    U.fillRound(ctx, cx, cy + 4, 54, 50, 14, pal('secondaryShadow', '#2582aa'));
    U.fillRound(ctx, cx, cy, 54, 50, 14, pal('secondary', '#52b9df'));
    text(ctx, '✕', cx + 27, cy + 26, 24, '#fff', 'center');

    var daily = U.call('Quests', 'getDaily') || [];
    var ach = U.call('Quests', 'getAchievements') || [];
    var y = b.y + 72;
    text(ctx, '☀ Hôm nay (đổi mới mỗi ngày)', b.x + 24, y, 15, '#25314a');
    y += 16;
    if (!daily.length) { text(ctx, 'Chưa có nhiệm vụ.', b.x + 24, y + 14, 13, '#5c6577', 'left', 'normal'); y += 30; }
    daily.forEach(function (q) { drawQuestRow(ctx, q, b.x + 20, y, b.w - 40); y += 40; });
    y += 10;
    var achDone = ach.filter(function (q) { return q.done; }).length;
    text(ctx, '🏆 Thành tựu (' + achDone + '/' + ach.length + ')', b.x + 24, y, 15, '#25314a');
    y += 16;
    var colW = (b.w - 50) / 2;
    ach.forEach(function (q, i) {
      var col = i % 2, row = Math.floor(i / 2);
      drawQuestRow(ctx, q, b.x + 20 + col * (colW + 10), y + row * 40, colW);
    });
    text(ctx, 'Esc / E / chạm ra ngoài để đóng', b.x + b.w / 2, b.y + b.h - 14, 12, '#5c6577', 'center', 'normal');
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Banner hoàn thành màn (mode 'banner')
  // ---------------------------------------------------------------------------
  function drawBanner(ctx, B, t) {
    var k = Math.min(1, B.t * 4);
    var lines = B.quests.length + (B.unlocked.length ? 1 : 0) + (B.chars.length ? 1 : 0);
    var w = 520, h = 210 + lines * 24;
    var x = (OG.W - w) / 2, y = Math.max(70, (OG.H - h) / 2);
    ctx.save();
    ctx.fillStyle = 'rgba(16,25,43,' + (0.5 * k) + ')';
    ctx.fillRect(0, 0, OG.W, OG.H);
    ctx.translate(OG.W / 2, y + h / 2);
    // easing "ease-out cubic" 1 − (1 − k)³: phóng nhanh lúc đầu rồi chậm dần, trông "bật" ra tự nhiên.
    var s = 0.7 + 0.3 * (1 - Math.pow(1 - k, 3));
    ctx.scale(s, s);
    ctx.translate(-OG.W / 2, -(y + h / 2));
    U.fillRound(ctx, x, y + 7, w, h, 26, '#b87542');
    U.fillRound(ctx, x, y, w, h, 26, pal('cream', '#fff6df'));
    text(ctx, '🎉 Hoàn thành màn!', OG.W / 2, y + 32, 28, pal('titleOrange', '#ed713c'), 'center');
    ctx.font = 'bold 17px ' + FONT;
    text(ctx, fit(ctx, (B.level.icon || '') + ' ' + B.level.name, w - 40), OG.W / 2, y + 64, 17, '#25314a', 'center');
    // sao bật lần lượt: sao thứ i bắt đầu sau 0.3 + 0.25·i giây, st chạy 0 → 1 trong 0.2 giây, cộng nảy sin
    for (var i = 0; i < 3; i++) {
      var st = Math.max(0, Math.min(1, (B.t - 0.3 - i * 0.25) * 5));
      var r = 20 * (i < B.stars ? (0.6 + 0.4 * st + (st < 1 ? 0.3 * Math.sin(st * Math.PI) : 0)) : 1);
      drawStar(ctx, OG.W / 2 - 56 + i * 56, y + 106, r, i < B.stars && st > 0);
    }
    var info = '+' + B.reward + ' 🪙 thưởng   ·   ' + B.score + ' điểm' + (B.time ? '   ·   ⏱ ' + U.formatTime(B.time) : '');
    text(ctx, info, OG.W / 2, y + 144, 15, '#25314a', 'center');
    var yy = y + 172;
    B.quests.forEach(function (q) {
      ctx.font = 'bold 14px ' + FONT;
      text(ctx, fit(ctx, '✅ ' + q.text + '  +' + q.reward + '🪙', w - 50), OG.W / 2, yy, 14, '#2e8b57', 'center');
      yy += 24;
    });
    if (B.unlocked.length) { ctx.font = 'bold 14px ' + FONT; text(ctx, fit(ctx, '🔓 Mở khoá: ' + B.unlocked.join(', '), w - 50), OG.W / 2, yy, 14, '#b74b2b', 'center'); yy += 24; }
    if (B.chars.length) { ctx.font = 'bold 14px ' + FONT; text(ctx, fit(ctx, '🐱 Nhân vật mới: ' + B.chars.join(', '), w - 50), OG.W / 2, yy, 14, '#b74b2b', 'center'); yy += 24; }
    var blink = 0.55 + 0.45 * Math.sin(t * 5);
    ctx.globalAlpha = blink;
    text(ctx, 'Chạm hoặc nhấn Enter để tiếp tục', OG.W / 2, y + h - 20, 13, '#5c6577', 'center', 'normal');
    ctx.restore();
  }

  // Hiệu ứng iris (vòng tròn khép/mở quanh Oggy) khi vào và rời bản đồ.
  // 💡 Khái niệm: tô "màn hình TRỪ một hình tròn" = vẽ chung một path gồm hình chữ nhật + hình tròn
  //   rồi fill với quy tắc 'evenodd' — vùng nằm trong cả hai hình bị tính 2 lần nên bị khoét rỗng.
  // 🧪 Thử: đổi LEAVE_TIME 0.5 → 2 rồi chọn một màn: vòng tròn khép chậm như phim hoạt hình cũ.
  function drawIris(ctx) {
    var r = null;
    if (S.leaving) r = (1 - Math.min(1, S.leaving.t / LEAVE_TIME)) * IRIS_MAX_R;
    else if (S.introT < INTRO_TIME) r = (S.introT / INTRO_TIME) * IRIS_MAX_R;
    if (r == null) return;
    var o = S.oggy;
    ctx.save();
    ctx.fillStyle = pal('pageBg', '#10192b');
    ctx.beginPath();
    ctx.rect(0, 0, OG.W, OG.H);
    ctx.arc(o.x || OG.W / 2, (o.y || OG.H / 2) - 20, Math.max(0, r), 0, Math.PI * 2, true);
    ctx.fill('evenodd');
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // API công khai
  // ---------------------------------------------------------------------------
  World.enabled = false;

  /**
   * Đăng ký scene 'worldmap' (ghi đè bản mặc định của src/game/default-scenes.js) và scene 'journeyMap'.
   * Gọi một lần từ src/core/main.js. Đặt OG.World.enabled = true khi thành công.
   */
  World.init = function () {
    if (!OG.Scenes || !OG.Scenes.register) return;
    OG.Scenes.register('worldmap', scene);
    World.enabled = true;
    // v2: bản đồ hành trình vẽ canvas (src/world/journey-map.js) thay bản panel DOM của src/story.
    if (World.journeyMap && typeof World.journeyMap.register === 'function') U.safe('World.journeyMap.register', World.journeyMap.register, World.journeyMap);
  };

  /**
   * Chọn sẵn một màn trên bản đồ. Đang ở bản đồ → chọn ngay và cho Oggy đi tới; chưa ở bản đồ →
   * nhớ lại để lần vào scene kế tiếp chọn màn đó.
   * @param {string} levelId
   * @example
   *   OG.World.focusLevel('garden'); OG.Scenes.go('worldmap');
   */
  World.focusLevel = function (levelId) {
    if (S && S.byId[levelId]) {
      S.sel = levelId;
      if (S.byId[levelId].unlocked) walkTo(levelId);
    } else {
      pendingFocus = levelId;
    }
  };

  /** Cho biết scene 'worldmap' có đang mở không. @returns {boolean} */
  World.isActive = function () { return !!S; };
  /**
   * Liệt kê các nút đang hiển thị (cho test / tự động hoá bấm vào nút). Toạ độ màn hình 960×540.
   * @returns {{id: string, x: number, y: number, unlocked: boolean, completed: boolean}[]} [] khi không ở bản đồ
   */
  World.getNodes = function () {
    return S ? S.nodes.map(function (n) { return { id: n.id, x: n.x, y: n.y, unlocked: n.unlocked, completed: n.completed }; }) : [];
  };
})();
