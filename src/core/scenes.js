// @ts-check
/* ============================================================================
 * OG.Scenes — MÁY TRẠNG THÁI SCENE CÓ NGĂN XẾP (scene stack)
 * ----------------------------------------------------------------------------
 * Vai trò:      Quản lý "màn hình" hiện tại của game: menu, bản đồ, màn chơi, trùm, tạm dừng...
 *               Mỗi scene là một trạng thái; OG.Loop gọi Scenes.update/draw mỗi frame, còn các module
 *               gọi go/push/pop để chuyển trạng thái.
 * Khái niệm:    finite state machine (FSM — máy hữu hạn trạng thái) · scene stack (go/push/pop) ·
 *               vòng đời enter/exit/resume · drawBelow (vẽ scene bên dưới làm nền) · registry ghi đè
 *               ("stub rồi ghi đè") · cô lập lỗi vòng đời bằng OG.util.safe
 * Bài học:      docs/learn/05-state-machine-scene.md, docs/learn/01-module-pattern-iife-namespace.md (ghi đè scene)
 * Phụ thuộc:    OG.util.safe, OG.Input.reset, OG.Events.emit (đọc LÚC CHẠY)
 * Event:        phát: 'scene:change' {from, to, params, push?, pop?} · nghe: (không)
 * API công khai: OG.Scenes.register(name, scene), get, has, names, current, base, stackNames,
 *               go(name, params), push(name, params), pop(), update(dt), draw(ctx)
 * Đọc tiếp:     src/game/default-scenes.js (các scene mặc định) → src/game/level.js (scene 'level' và pha st.phase)
 *               → src/game/game.js (luồng màn → trùm → bản đồ)
 *
 * Hợp đồng (docs/ARCHITECTURE.md mục 5):
 *   Scene = { enter(params, fromName), exit(toName), update(dt), draw(ctx), resume(), drawBelow:bool } — mọi field tuỳ chọn.
 *   - go(name, params):   thay TOÀN BỘ stack (exit hết scene cũ → enter scene mới).
 *   - push(name, params): đè scene lên trên (vd pause). Scene dưới KHÔNG update nhưng vẫn được draw
 *                         nếu scene trên có drawBelow !== false.
 *   - pop():              bỏ scene trên cùng, gọi resume() của scene lộ ra.
 *   register() lần sau GHI ĐÈ lần trước → module tính năng thay thế scene mặc định bằng cách đăng ký lại
 *   cùng tên trong init(). Tên scene chuẩn: boot, menu, worldmap, level, boss, pause, gameover, victory,
 *   charselect, shop, settings, leaderboard (+ các scene v2 trong docs/STORY.md mục 6.5).
 * ========================================================================== */

/**
 * @typedef {Object} StackEntry  một tầng của scene stack
 * @property {string} name   tên scene đã đăng ký
 * @property {Scene} scene   object scene
 */
(function () {
  'use strict';
  var OG = window.OG;
  /** @type {Object<string, Scene>} tên scene → object scene */
  var registry = {};
  /** @type {StackEntry[]} phần tử cuối = scene đang hoạt động (top) */
  var stack = [];

  function topEntry() { return stack[stack.length - 1] || null; }

  var Scenes = (OG.Scenes = {
    /**
     * Đăng ký (hoặc GHI ĐÈ) một scene theo tên.
     * @param {string} name
     * @param {Scene} scene
     * @returns {Scene} chính scene vừa đăng ký (tiện viết `var S = OG.Scenes.register('x', {...})`)
     */
    register: function (name, scene) {
      registry[name] = scene;
      return scene;
    },
    /**
     * Lấy scene đã đăng ký.
     * @param {string} name
     * @returns {Scene | null}
     */
    get: function (name) { return registry[name] || null; },
    /**
     * Kiểm tra scene đã được đăng ký chưa.
     * @param {string} name
     * @returns {boolean}
     */
    has: function (name) { return !!registry[name]; },
    /** @returns {string[]} tên mọi scene đã đăng ký */
    names: function () { return Object.keys(registry); },

    /** @returns {string | null} tên scene trên cùng stack (đang nhận update) */
    current: function () { var t = topEntry(); return t ? t.name : null; },
    /** @returns {string | null} scene "nền" (đáy stack) — vd 'level' khi đang pause */
    base: function () { return stack.length ? stack[0].name : null; },
    /** @returns {string[]} tên các scene trong stack, từ đáy lên đỉnh */
    stackNames: function () { return stack.map(function (e) { return e.name; }); },

    /**
     * Chuyển hẳn sang scene khác: exit mọi scene trong stack (từ trên xuống), rồi enter scene mới.
     * Phát 'scene:change'.
     * @param {string} name
     * @param {Object} [params] truyền cho scene.enter(params, fromName); thiếu thì là {}
     * @example
     *   OG.Scenes.go('level', { levelId: 'kitchen' });
     */
    go: function (name, params) {
      var scene = registry[name];
      if (!scene) { console.error('[OG.Scenes] chưa đăng ký scene: ' + name); return; }
      var from = Scenes.current();
      while (stack.length) {
        var e = stack.pop();
        if (e.scene.exit) OG.util.safe('scene ' + e.name + '.exit', e.scene.exit, e.scene, [name]);
      }
      // ⚠️ Bẫy: không reset input khi đổi scene thì phím đang giữ (vd Enter để bấm nút menu) "lọt" sang
      //   scene mới và bị xử lý thêm lần nữa — vd vừa vào màn đã bấm nhầm nút.
      OG.Input.reset();
      stack.push({ name: name, scene: scene });
      // 💡 Khái niệm: vòng đời (lifecycle) — scene tự khởi tạo trong enter() và dọn dẹp trong exit()
      //   (vd huỷ listener event). Bọc safe để scene lỗi không làm kẹt cả máy trạng thái.
      if (scene.enter) OG.util.safe('scene ' + name + '.enter', scene.enter, scene, [params || {}, from]);
      OG.Events.emit('scene:change', { from: from, to: name, params: params || {} });
    },

    /**
     * Đè một scene lên trên scene hiện tại (scene dưới tạm dừng update). Phát 'scene:change' kèm push: true.
     * @param {string} name
     * @param {Object} [params]
     * @example
     *   OG.Scenes.push('pause', { from: 'level' });
     */
    push: function (name, params) {
      var scene = registry[name];
      if (!scene) { console.error('[OG.Scenes] chưa đăng ký scene: ' + name); return; }
      var from = Scenes.current();
      OG.Input.reset();
      stack.push({ name: name, scene: scene });
      if (scene.enter) OG.util.safe('scene ' + name + '.enter', scene.enter, scene, [params || {}, from]);
      OG.Events.emit('scene:change', { from: from, to: name, params: params || {}, push: true });
    },

    /**
     * Gỡ scene trên cùng và gọi resume() của scene lộ ra. Không làm gì nếu stack chỉ còn 1 scene.
     * Phát 'scene:change' kèm pop: true.
     */
    pop: function () {
      // Không bao giờ pop scene đáy: stack rỗng thì Loop không còn gì để update/draw.
      if (stack.length <= 1) return;
      var e = stack.pop();
      if (e.scene.exit) OG.util.safe('scene ' + e.name + '.exit', e.scene.exit, e.scene, [Scenes.current()]);
      OG.Input.reset();
      var t = topEntry();
      if (t.scene.resume) OG.util.safe('scene ' + t.name + '.resume', t.scene.resume, t.scene, []);
      OG.Events.emit('scene:change', { from: e.name, to: t.name, params: {}, pop: true });
    },

    /**
     * Cập nhật CHỈ scene trên cùng (OG.Loop gọi mỗi frame).
     * 💡 Khái niệm: scene stack — khi 'pause' được push lên trên 'level', chỉ pause nhận update nên
     *   gameplay bên dưới "đóng băng" mà không cần cờ isPaused rải khắp code.
     * @param {number} dt delta time (khoảng thời gian giữa 2 frame), giây
     */
    update: function (dt) {
      var t = topEntry();
      // Không bọc safe ở đây: lỗi update để OG.Loop bắt (error boundary của frame) và log.
      if (t && t.scene.update) t.scene.update(dt);
    },

    /**
     * Vẽ các scene từ dưới lên: bắt đầu từ scene thấp nhất còn "nhìn thấy" tới scene trên cùng.
     * @param {CanvasRenderingContext2D} ctx
     */
    draw: function (ctx) {
      // Đi từ đỉnh xuống, dừng ở scene đầu tiên có drawBelow === false (scene đó che kín phần dưới).
      // 🧪 Thử: trong console gõ  OG.Scenes.get('pause').drawBelow = false  rồi bấm P — nền màn chơi biến mất.
      var start = stack.length - 1;
      while (start > 0 && stack[start].scene.drawBelow !== false) start--;
      for (var i = start; i < stack.length; i++) {
        var s = stack[i].scene;
        // save/restore quanh từng scene: scene này đổi transform/alpha cũng không ảnh hưởng scene vẽ sau.
        if (s.draw) { ctx.save(); s.draw(ctx); ctx.restore(); }
      }
    }
  });
})();
