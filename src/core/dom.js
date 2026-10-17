// @ts-check
/* ============================================================================
 * OG.DOM — LỚP GIAO DIỆN DOM PHỦ TRÊN CANVAS (panel, toast, HUD)
 * ----------------------------------------------------------------------------
 * Vai trò:      Tiện ích dựng panel (menu, tạm dừng, game over...) trong #overlay, hiện toast ngắn và
 *               ẩn/hiện HUD + nút cảm ứng. Mọi màn hình dạng panel nên dùng OG.DOM.panel() để thống nhất.
 *               Phím Enter kích hoạt nút chính (primary) của panel đang mở.
 * Khái niệm:    kết hợp canvas (vẽ game) + DOM (giao diện chữ/nút, dễ tiếp cận) · "nút chính mặc định" cho bàn phím ·
 *               phát event từ UI (ui:click) để Audio phát tiếng bấm mà UI không cần biết Audio
 * Bài học:      docs/learn/05-state-machine-scene.md (scene dạng panel), docs/learn/06-event-bus-observer.md (ui:click)
 * Phụ thuộc:    OG.Events.emit (đọc LÚC CHẠY); phần tử #gameShell #overlay #hud #toast #mobileControls #pauseBtn trong index.html
 * Event:        phát: 'ui:click' {id}, 'ui:toast' {text} · nghe: (không)
 * API công khai: OG.DOM.init(), panel(opts), button(label, onClick, opts), hidePanel(), isPanelOpen(),
 *               toast(text, seconds), setHudVisible(v), setControlsVisible(v), $(id), shell/overlay/hud/toastEl/controls
 * Đọc tiếp:     src/game/default-scenes.js (scene mặc định dùng panel) → src/ui/menus.js (menu thật)
 * ========================================================================== */

/**
 * @typedef {Object} PanelButton  một nút trong panel
 * @property {string} [id]          id của <button>, cũng là id trong payload ui:click
 * @property {string} label         nội dung nút (HTML được phép, vd emoji)
 * @property {boolean} [primary]    nút chính: Enter sẽ bấm nút này (thiếu thì nút đầu tiên là nút chính)
 * @property {boolean} [secondary]  kiểu nút phụ (màu xanh)
 * @property {(e: MouseEvent) => void} [onClick]
 */

/**
 * @typedef {Object} PanelOptions  tham số của OG.DOM.panel
 * @property {string} [title]      tiêu đề (HTML)
 * @property {string} [html]       nội dung chính (HTML)
 * @property {PanelButton[]} [buttons]
 * @property {string} [small]      dòng chữ nhỏ cuối panel (HTML)
 * @property {string} [className]  class CSS thêm cho .panel
 */
(function () {
  'use strict';
  var OG = window.OG;

  var DEFAULT_TOAST_SECONDS = 1.7; // thời gian hiện toast mặc định, giây (giống MVP)
  var MS_PER_SECOND = 1000;        // setTimeout nhận ms

  /** @param {string} id */
  var $ = function (id) { return document.getElementById(id); };
  /** @type {any} id của setTimeout đang chờ ẩn toast */
  var toastTimer = null;
  /** @type {HTMLButtonElement | null} nút Enter sẽ bấm trong panel đang mở */
  var primaryBtn = null;

  var DOM = (OG.DOM = {
    $: $,
    /** @type {HTMLElement | null} */ shell: null,
    /** @type {HTMLElement | null} */ overlay: null,
    /** @type {HTMLElement | null} */ hud: null,
    /** @type {HTMLElement | null} */ toastEl: null,
    /** @type {HTMLElement | null} */ controls: null,

    /** Tìm các phần tử giao diện và gắn phím Enter → nút chính. main.js gọi một lần lúc boot. */
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
        // ⚠️ Bẫy: không bỏ qua khi đang gõ trong <input> thì Enter lúc nhập tên sẽ bấm luôn nút chính.
        if ((e.code === 'Enter' || e.code === 'NumpadEnter') && DOM.isPanelOpen() && primaryBtn && ae && ae.tagName !== 'INPUT' && !focusedBtn) {
          e.preventDefault();
          primaryBtn.click();
        }
      });
    },

    /**
     * Mở panel trong #overlay (thay nội dung panel cũ nếu có).
     * @param {PanelOptions} [opts]
     * @returns {HTMLDivElement} phần tử .panel để module khác gắn thêm nội dung (vd OG.Social.mountResult)
     * @example
     *   OG.DOM.panel({ title: 'Tạm dừng', buttons: [{ id: 'resume', label: 'Tiếp tục', onClick: function () { OG.Scenes.pop(); } }] });
     */
    panel: function (opts) {
      opts = opts || {};
      var ov = DOM.overlay;
      ov.innerHTML = '';
      ov.style.display = 'grid';
      var p = document.createElement('div');
      p.className = 'panel' + (opts.className ? ' ' + opts.className : '');
      // Ghép HTML một lần rồi gán innerHTML (gán += nhiều lần sẽ phân tích lại DOM mỗi lần).
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
          // 💡 Khái niệm: nút mặc định — panel nào cũng có một nút "Enter để chọn", người chơi bàn phím
          //   không cần chuột. Nút đánh dấu primary thắng; không có thì lấy nút đầu tiên.
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

    /**
     * Tạo nút chuẩn. Khi bấm: phát 'ui:click' {id} TRƯỚC, rồi mới gọi onClick.
     * @param {string} label nội dung nút (HTML)
     * @param {(e: MouseEvent) => void} [onClick]
     * @param {{id?: string, secondary?: boolean}} [opts]
     * @returns {HTMLButtonElement}
     */
    button: function (label, onClick, opts) {
      opts = opts || {};
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.innerHTML = label;
      if (opts.id) btn.id = opts.id;
      if (opts.secondary) btn.className = 'secondary';
      btn.addEventListener('click', function (e) {
        // UI chỉ "thông báo" có cú bấm; Audio tự nghe 'ui:click' để phát tiếng (loose coupling).
        OG.Events.emit('ui:click', { id: opts.id || label });
        if (onClick) onClick(e);
      });
      return btn;
    },

    /** Ẩn và xoá nội dung panel đang mở. */
    hidePanel: function () {
      if (!DOM.overlay) return;
      DOM.overlay.style.display = 'none';
      DOM.overlay.innerHTML = '';
      primaryBtn = null;
    },
    /** @returns {boolean} true nếu #overlay đang hiển thị */
    isPanelOpen: function () { return !!DOM.overlay && DOM.overlay.style.display !== 'none'; },

    /**
     * Hiện thông báo ngắn giữa màn hình rồi tự mờ đi. Phát 'ui:toast' {text}.
     * Gọi liên tiếp thì thông báo mới thay thông báo cũ và đếm giờ lại từ đầu.
     * @param {string} text
     * @param {number} [seconds=1.7] thời gian hiện, giây
     */
    toast: function (text, seconds) {
      var el = DOM.toastEl;
      if (!el) return;
      el.textContent = text;
      // CSS transition trên opacity làm hiệu ứng mờ dần; ở đây chỉ bật/tắt giá trị đích.
      el.style.opacity = /** @type {any} */ (1);
      // ⚠️ Bẫy: quên clearTimeout thì hẹn giờ của toast CŨ sẽ ẩn mất toast MỚI quá sớm.
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { el.style.opacity = /** @type {any} */ (0); }, (seconds || DEFAULT_TOAST_SECONDS) * MS_PER_SECOND);
      OG.Events.emit('ui:toast', { text: text });
    },

    /**
     * Ẩn/hiện HUD (kèm nút tạm dừng #pauseBtn).
     * @param {boolean} v
     */
    setHudVisible: function (v) {
      if (DOM.hud) DOM.hud.style.display = v ? '' : 'none';
      var pb = $('pauseBtn');
      if (pb) pb.style.display = v ? '' : 'none';
    },
    /**
     * Ẩn/hiện bộ nút cảm ứng di chuyển (vd ẩn trong menu). CSS quyết định có hiển thị trên PC không.
     * @param {boolean} v
     */
    setControlsVisible: function (v) { if (DOM.controls) DOM.controls.classList.toggle('hidden', !v); }
  });
})();
