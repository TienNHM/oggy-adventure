/* Khởi động game — LOAD CUỐI CÙNG trong index.html.
 * Thứ tự init: DOM → Save → Input → Progress → (module tính năng) → boot scene → loop.
 * Module tính năng init theo thứ tự cố định dưới đây; mỗi init được bọc try/catch nên
 * một module lỗi không chặn game. */
(function () {
  'use strict';
  var OG = window.OG;

  // Thứ tự init module tính năng (namespace trên window.OG).
  // v2: Difficulty init trước (Menus/Story đọc mode); Learn/Guide/Story gắn level hook trong init().
  OG.FEATURE_INIT_ORDER = ['Difficulty', 'Audio', 'Sprites', 'Bosses', 'World', 'Quests', 'Menus', 'Shop', 'Social', 'Learn', 'Guide', 'Story'];

  function applyTouchSetting() {
    var mode = OG.Save.data.settings.touchControls || 'auto';
    var shell = document.getElementById('gameShell');
    if (!shell) return;
    shell.classList.toggle('touch-on', mode === 'on');
    shell.classList.toggle('touch-off', mode === 'off');
  }

  function boot() {
    var canvas = document.getElementById('game');
    var ctx = canvas.getContext('2d');
    OG.canvas = canvas;
    OG.ctx = ctx;

    OG.DOM.init();
    OG.Save.load();
    OG.Input.init(canvas);
    OG.Progress.init();
    applyTouchSetting();
    OG.Events.on('settings:change', function (e) { if (e.key === 'touchControls') applyTouchSetting(); });

    OG.FEATURE_INIT_ORDER.forEach(function (ns) { OG.util.call(ns, 'init'); });
    // Kiểm tra dữ liệu hành trình SAU khi trùm/nhân vật đã đăng ký (lỗi -> console.warn, hành trình bị ẩn).
    OG.util.call('Journeys', 'init');

    // Tự tạm dừng khi rời tab/cửa sổ trong lúc chơi.
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
    OG.Loop.start(ctx);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
