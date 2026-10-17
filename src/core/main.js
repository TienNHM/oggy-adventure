// @ts-check
/* ============================================================================
 * OG (main.js) — KHỞI ĐỘNG GAME (boot)
 * ----------------------------------------------------------------------------
 * Vai trò:      File được load CUỐI CÙNG trong index.html. Khi DOM sẵn sàng, nó gọi init() của các module
 *               theo đúng thứ tự, vào scene 'boot' rồi khởi động vòng lặp game.
 * Khái niệm:    điểm vào (entry point) · thứ tự khởi tạo có phụ thuộc · module tuỳ chọn (OG.util.call) ·
 *               cô lập lỗi lúc init · tự tạm dừng khi rời tab (blur / visibilitychange)
 * Bài học:      docs/learn/00-bat-dau.md, docs/learn/01-module-pattern-iife-namespace.md
 * Phụ thuộc:    OG.DOM, OG.Save, OG.Input, OG.Progress, OG.Scenes, OG.Loop, OG.Events (đọc LÚC CHẠY, trong boot())
 *               + các module tính năng trong OG.FEATURE_INIT_ORDER (có thì init, thiếu thì bỏ qua)
 * Event:        phát: 'ui:click' {id:'pauseBtn'} · nghe: 'settings:change' (key 'touchControls')
 * API công khai: OG.FEATURE_INIT_ORDER, OG.canvas, OG.ctx (gán trong boot)
 * Đọc tiếp:     src/core/loop.js (vòng lặp được start ở cuối boot) → src/core/scenes.js → src/game/default-scenes.js ('boot')
 *
 * Thứ tự init: DOM → Save → Input → Progress → (module tính năng) → Journeys → boot scene → loop.
 * Mỗi init của module tính năng được bọc try/catch (qua OG.util.call) nên một module lỗi không chặn game.
 * ========================================================================== */
(function () {
  'use strict';
  var OG = window.OG;

  // Thứ tự init module tính năng (tên namespace trên window.OG).
  // v2: Difficulty init trước (Menus/Story đọc mode); Learn/Guide/Story gắn level hook trong init().
  OG.FEATURE_INIT_ORDER = ['Difficulty', 'Audio', 'Sprites', 'Bosses', 'World', 'Quests', 'Menus', 'Shop', 'Social', 'Learn', 'Guide', 'Story'];

  /** Bật/tắt nút cảm ứng theo cài đặt 'auto' | 'on' | 'off' (CSS đọc class trên #gameShell). */
  function applyTouchSetting() {
    var mode = OG.Save.data.settings.touchControls || 'auto';
    var shell = document.getElementById('gameShell');
    if (!shell) return;
    shell.classList.toggle('touch-on', mode === 'on');
    shell.classList.toggle('touch-off', mode === 'off');
  }

  function boot() {
    var canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('game'));
    var ctx = canvas.getContext('2d');
    OG.canvas = canvas;
    OG.ctx = ctx;

    // 💡 Khái niệm: thứ tự khởi tạo có phụ thuộc — Save phải load TRƯỚC Progress (đọc tiến độ đã lưu) và
    //   applyTouchSetting (đọc settings); module tính năng init SAU core để có thể dùng mọi API core.
    // ⚠️ Bẫy: đảo Save.load() xuống dưới Progress.init() → Progress đọc dữ liệu mặc định, người chơi
    //   tưởng mất hết màn đã mở khoá.
    OG.DOM.init();
    OG.Save.load();
    OG.Input.init(canvas);
    OG.Progress.init();
    applyTouchSetting();
    OG.Events.on('settings:change', function (e) { if (e.key === 'touchControls') applyTouchSetting(); });

    // 💡 Khái niệm: module tuỳ chọn — OG.util.call chỉ gọi init nếu module tồn tại và tự bắt lỗi.
    //   Xoá một <script> tính năng khỏi index.html thì game vẫn chạy (chỉ thiếu tính năng đó).
    OG.FEATURE_INIT_ORDER.forEach(function (ns) { OG.util.call(ns, 'init'); });
    // Kiểm tra dữ liệu hành trình SAU khi trùm/nhân vật đã đăng ký (lỗi -> console.warn, hành trình bị ẩn).
    OG.util.call('Journeys', 'init');

    // Tự tạm dừng khi rời tab/cửa sổ trong lúc chơi — chỉ ở scene gameplay, và chỉ khi có scene 'pause'.
    var autoPause = function () {
      var cur = OG.Scenes.current();
      if ((cur === 'level' || cur === 'boss') && OG.Scenes.has('pause')) OG.Scenes.push('pause', { from: cur, auto: true });
    };
    window.addEventListener('blur', autoPause);
    document.addEventListener('visibilitychange', function () { if (document.hidden) autoPause(); });

    // Nút tạm dừng trên HUD (cảm ứng/chuột).
    var pb = document.getElementById('pauseBtn');
    if (pb) pb.addEventListener('click', function () { OG.Events.emit('ui:click', { id: 'pauseBtn' }); autoPause(); });

    OG.Scenes.go('boot');
    // Loop start CUỐI CÙNG: frame đầu tiên chạy khi mọi thứ đã init và đã có scene.
    OG.Loop.start(ctx);
  }

  // Script nằm cuối <body> nên thường DOM đã sẵn sàng; vẫn kiểm tra readyState cho chắc (vd khi bị load async).
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
