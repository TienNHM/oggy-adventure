/* OG.DOM — tiện ích cho lớp DOM phủ trên canvas: panel (#overlay), toast, HUD container.
 * Mọi màn hình dạng panel (menu, tạm dừng, game over...) nên dùng OG.DOM.panel() để thống nhất.
 * Phím Enter kích hoạt nút chính (primary) của panel đang mở. */
(function () {
  'use strict';
  var OG = window.OG;
  var $ = function (id) { return document.getElementById(id); };
  var toastTimer = null;
  var primaryBtn = null;

  var DOM = (OG.DOM = {
    $: $,
    shell: null, overlay: null, hud: null, toastEl: null, controls: null,

    init: function () {
      DOM.shell = $('gameShell');
      DOM.overlay = $('overlay');
      DOM.hud = $('hud');
      DOM.toastEl = $('toast');
      DOM.controls = $('mobileControls');
      window.addEventListener('keydown', function (e) {
        var ae = document.activeElement;
        // Đang focus một nút trong panel → để trình duyệt tự kích hoạt đúng nút đó (không ép nút chính).
        var focusedBtn = ae && ae.tagName === 'BUTTON' && DOM.overlay && DOM.overlay.contains(ae);
        if ((e.code === 'Enter' || e.code === 'NumpadEnter') && DOM.isPanelOpen() && primaryBtn && ae && ae.tagName !== 'INPUT' && !focusedBtn) {
          e.preventDefault();
          primaryBtn.click();
        }
      });
    },

    // Mở panel. opts: {title, html, small, buttons:[{id,label,primary,secondary,onClick}], className}
    // Trả về phần tử .panel để module khác gắn thêm nội dung (vd: OG.Social.mountResult).
    panel: function (opts) {
      opts = opts || {};
      var ov = DOM.overlay;
      ov.innerHTML = '';
      ov.style.display = 'grid';
      var p = document.createElement('div');
      p.className = 'panel' + (opts.className ? ' ' + opts.className : '');
      var html = '';
      if (opts.title) html += '<h1>' + opts.title + '</h1>';
      if (opts.html) html += opts.html;
      p.innerHTML = html;
      primaryBtn = null;
      if (opts.buttons && opts.buttons.length) {
        var row = document.createElement('div');
        row.className = 'actions';
        opts.buttons.forEach(function (b, i) {
          var btn = DOM.button(b.label, b.onClick, { id: b.id, secondary: b.secondary });
          row.appendChild(btn);
          if (b.primary || (i === 0 && !primaryBtn)) primaryBtn = btn;
        });
        p.appendChild(row);
      }
      if (opts.small) {
        var s = document.createElement('p');
        s.className = 'small';
        s.innerHTML = opts.small;
        p.appendChild(s);
      }
      ov.appendChild(p);
      return p;
    },

    // Tạo nút chuẩn (phát ui:click khi bấm).
    button: function (label, onClick, opts) {
      opts = opts || {};
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.innerHTML = label;
      if (opts.id) btn.id = opts.id;
      if (opts.secondary) btn.className = 'secondary';
      btn.addEventListener('click', function (e) {
        OG.Events.emit('ui:click', { id: opts.id || label });
        if (onClick) onClick(e);
      });
      return btn;
    },

    hidePanel: function () {
      if (!DOM.overlay) return;
      DOM.overlay.style.display = 'none';
      DOM.overlay.innerHTML = '';
      primaryBtn = null;
    },
    isPanelOpen: function () { return !!DOM.overlay && DOM.overlay.style.display !== 'none'; },

    // Thông báo ngắn giữa màn hình (giống MVP: 1.7 giây).
    toast: function (text, seconds) {
      var el = DOM.toastEl;
      if (!el) return;
      el.textContent = text;
      el.style.opacity = 1;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { el.style.opacity = 0; }, (seconds || 1.7) * 1000);
      OG.Events.emit('ui:toast', { text: text });
    },

    // Ẩn/hiện HUD (kèm nút tạm dừng #pauseBtn).
    setHudVisible: function (v) {
      if (DOM.hud) DOM.hud.style.display = v ? '' : 'none';
      var pb = $('pauseBtn');
      if (pb) pb.style.display = v ? '' : 'none';
    },
    // Ẩn/hiện bộ nút cảm ứng di chuyển (vd: ẩn trong menu). CSS quyết định có hiển thị trên PC không.
    setControlsVisible: function (v) { if (DOM.controls) DOM.controls.classList.toggle('hidden', !v); }
  });
})();
