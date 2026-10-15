/* OG.Input — bàn phím, nút cảm ứng (phần tử có data-key) và con trỏ trên canvas.
 * Trạng thái giữ phím: OG.Input.keys.<tên>. Bấm 1 lần (cạnh lên): OG.Input.pressed('<tên>').
 * Tên phím logic: left, right, up, down, jump, action, pause, confirm, back, num1, num2, num3
 * (num1..3 = phím số 1–3, dùng chọn đáp án câu đố nếu scene muốn).
 *
 * v2 (trẻ em): chạm nửa PHẢI màn chơi (scene level/boss, ngoài dải HUD trên cùng) = giữ nút nhảy.
 * Bật/tắt: OG.Save.data.settings.tapJump = 'auto' (mặc định: chỉ khi chạm bằng ngón tay) | 'on' | 'off'.
 * Nút cảm ứng được phóng to theo OG.Input.TOUCH_SIZE (px). */
(function () {
  'use strict';
  var OG = window.OG;

  // Bản đồ mã phím -> phím logic (một mã có thể map nhiều phím logic).
  var KEYMAP = {
    ArrowLeft: ['left'], KeyA: ['left'],
    ArrowRight: ['right'], KeyD: ['right'],
    ArrowUp: ['jump', 'up'], KeyW: ['jump', 'up'], Space: ['jump'],
    ArrowDown: ['down'], KeyS: ['down'],
    KeyE: ['action'], KeyJ: ['action'],
    Escape: ['pause', 'back'], KeyP: ['pause'],
    Enter: ['confirm'], NumpadEnter: ['confirm'],
    Digit1: ['num1'], Numpad1: ['num1'], Digit2: ['num2'], Numpad2: ['num2'], Digit3: ['num3'], Numpad3: ['num3']
  };
  var TAP_SCENES = ['level', 'boss'];  // scene cho phép chạm nửa phải để nhảy
  var HUD_BAND = 70;                   // px logic trên cùng dành cho HUD (không tính là chạm nhảy)
  var PREVENT = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyE'];

  var keys = { left: false, right: false, up: false, down: false, jump: false, action: false, pause: false, confirm: false, back: false, num1: false, num2: false, num3: false };
  var down = {};      // phím vừa nhấn trong frame này
  var sources = {};   // key logic -> số nguồn đang giữ (bàn phím + cảm ứng)
  var gestured = false;

  function firstGesture() {
    if (gestured) return;
    gestured = true;
    OG.Events.emit('input:firstGesture', {});
  }

  function setKey(k, src, v) {
    var id = k + ':' + src;
    var was = keys[k];
    if (v) sources[id] = true; else delete sources[id];
    var any = false;
    for (var s in sources) if (s.indexOf(k + ':') === 0) { any = true; break; }
    keys[k] = any;
    if (any && !was) down[k] = true;
  }

  // Có đang gõ vào ô nhập liệu không (để không cướp phím khi nhập tên).
  function typing(e) {
    var t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  // Chạm nửa phải để nhảy có đang bật cho lần chạm này không.
  function tapJumpOn(e, x, y) {
    var set = OG.Save && OG.Save.data && OG.Save.data.settings ? OG.Save.data.settings.tapJump : 'auto';
    if (set === 'off' || set === false) return false;
    if (set !== 'on' && set !== true && e.pointerType !== 'touch') return false;
    var cur = OG.Scenes && OG.Scenes.current ? OG.Scenes.current() : null;
    return TAP_SCENES.indexOf(cur) >= 0 && x > OG.W / 2 && y > HUD_BAND;
  }

  var Input = (OG.Input = {
    keys: keys,
    TOUCH_SIZE: 74, // px — nút cảm ứng to cho ngón tay bé (CSS gốc 58px)
    // Toạ độ con trỏ theo hệ logic 960x540.
    pointer: { x: 0, y: 0, down: false, justPressed: false, justReleased: false, inside: false },
    canvas: null,

    init: function (canvas) {
      Input.canvas = canvas;
      // Cử chỉ đầu tiên ở BẤT KỲ đâu (kể cả nút DOM trong #overlay, hay Enter/Space bị panel UI chặn
      // ở pha capture) → phát input:firstGesture để Audio mở khoá AudioContext. Đăng ký ở pha capture
      // trên window và trước module UI nên luôn chạy trước.
      window.addEventListener('pointerdown', firstGesture, true);
      window.addEventListener('touchstart', firstGesture, true);
      window.addEventListener('keydown', function (e) { if (!typing(e)) firstGesture(); }, true);
      window.addEventListener('keydown', function (e) {
        if (typing(e)) return;
        firstGesture();
        var map = KEYMAP[e.code];
        if (PREVENT.indexOf(e.code) >= 0) e.preventDefault();
        if (!map) return;
        for (var i = 0; i < map.length; i++) {
          // Phím lặp (đang giữ): chỉ giữ lại trái/phải — sau reset() khi đổi scene (vd màn → trùm) người
          // chơi đang giữ phím vẫn đi tiếp. Không lặp nhảy/tạm dừng để tránh bật-tắt liên tục.
          if (e.repeat && map[i] !== 'left' && map[i] !== 'right') continue;
          setKey(map[i], 'kb', true);
        }
      });
      window.addEventListener('keyup', function (e) {
        var map = KEYMAP[e.code];
        if (!map) return;
        for (var i = 0; i < map.length; i++) setKey(map[i], 'kb', false);
      });
      window.addEventListener('blur', function () { Input.reset(); });

      Input.bindTouch(document);

      if (canvas) {
        var toLogical = function (e) {
          var r = canvas.getBoundingClientRect();
          Input.pointer.x = ((e.clientX - r.left) / r.width) * OG.W;
          Input.pointer.y = ((e.clientY - r.top) / r.height) * OG.H;
        };
        var tapSrc = {}; // pointerId -> nguồn phím 'jump' đang giữ bằng chạm
        canvas.addEventListener('pointerdown', function (e) {
          firstGesture();
          toLogical(e);
          Input.pointer.down = true;
          Input.pointer.justPressed = true;
          if (tapJumpOn(e, Input.pointer.x, Input.pointer.y)) {
            var id = 'tapR' + (e.pointerId != null ? e.pointerId : 0);
            tapSrc[id] = true;
            setKey('jump', id, true);
          }
          OG.Events.emit('input:tap', { x: Input.pointer.x, y: Input.pointer.y });
        });
        var tapUp = function (e) {
          var id = 'tapR' + (e && e.pointerId != null ? e.pointerId : 0);
          if (tapSrc[id]) { delete tapSrc[id]; setKey('jump', id, false); }
        };
        window.addEventListener('pointerup', tapUp);
        window.addEventListener('pointercancel', tapUp);
        canvas.addEventListener('pointermove', function (e) { toLogical(e); Input.pointer.inside = true; });
        canvas.addEventListener('pointerleave', function () { Input.pointer.inside = false; });
        window.addEventListener('pointerup', function () {
          if (Input.pointer.down) Input.pointer.justReleased = true;
          Input.pointer.down = false;
        });
      }
    },

    // Gắn nút cảm ứng: mọi phần tử [data-key] bên trong root (gọi lại được cho nút tạo động).
    bindTouch: function (root) {
      var els = (root || document).querySelectorAll('[data-key]');
      for (var i = 0; i < els.length; i++) {
        var b = els[i];
        if (b.__ogBound) continue;
        b.__ogBound = true;
        Input.sizeTouch(b);
        (function (b) {
          var k = b.getAttribute('data-key');
          var src = 'touch' + Math.random().toString(36).slice(2, 7);
          var on = function (e) { e.preventDefault(); firstGesture(); setKey(k, src, true); b.classList.add('held'); };
          var off = function (e) { e.preventDefault(); setKey(k, src, false); b.classList.remove('held'); };
          b.addEventListener('pointerdown', on);
          b.addEventListener('pointerup', off);
          b.addEventListener('pointerleave', off);
          b.addEventListener('pointercancel', off);
          b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
        })(b);
      }
    },

    // Phóng to một nút cảm ứng (chỉ nút .touch của bộ điều khiển, không đụng nút khác có data-key).
    sizeTouch: function (b) {
      if (!b || !b.style || !b.classList || !b.classList.contains('touch')) return;
      var px = Input.TOUCH_SIZE;
      b.style.width = px + 'px';
      b.style.height = px + 'px';
      b.style.fontSize = Math.round(px * 0.44) + 'px';
      b.style.borderRadius = Math.round(px * 0.3) + 'px';
    },

    // true đúng 1 frame khi phím logic vừa được nhấn.
    pressed: function (k) { return !!down[k]; },
    // Đánh dấu đã xử lý để scene khác trong cùng frame không xử lý lại.
    consume: function (k) { delete down[k]; },
    // Ép trạng thái (dùng cho test/tự động).
    setKey: function (k, v) { setKey(k, 'api', v); },
    // Xoá mọi phím đang giữ (khi đổi scene / mất focus) để tránh kẹt phím.
    reset: function () {
      for (var k in keys) keys[k] = false;
      sources = {};
      down = {};
    },
    // Gọi cuối mỗi frame bởi OG.Loop.
    endFrame: function () {
      down = {};
      Input.pointer.justPressed = false;
      Input.pointer.justReleased = false;
    },
    hasGesture: function () { return gestured; }
  });
})();
