// @ts-check
/* ============================================================================
 * OG.Input — BÀN PHÍM, NÚT CẢM ỨNG VÀ CON TRỎ (input)
 * ----------------------------------------------------------------------------
 * Vai trò:      Gom mọi nguồn điều khiển (bàn phím, nút cảm ứng [data-key], chạm/chuột trên canvas) thành
 *               một bộ "phím logic" duy nhất. Gameplay chỉ hỏi "đang giữ trái?" hay "vừa bấm nhảy?" mà
 *               không cần biết người chơi dùng thiết bị gì. OG.Loop gọi endFrame() cuối mỗi frame.
 * Khái niệm:    trạng thái giữ phím (held) vs cạnh lên (pressed — vừa nhấn đúng frame này) · phím logic & keymap ·
 *               đếm nguồn giữ phím (bàn phím + cảm ứng cùng giữ một phím) · endFrame xoá cờ theo frame ·
 *               đổi toạ độ màn hình CSS → toạ độ logic 960×540 · pha capture của DOM event · autoplay policy (firstGesture)
 * Bài học:      docs/learn/03-input.md
 * Phụ thuộc:    OG.W/OG.H, OG.Events.emit, OG.Scenes.current, OG.Save.data.settings.tapJump (đều đọc LÚC CHẠY)
 * Event:        phát: 'input:firstGesture' {}, 'input:tap' {x, y} (toạ độ logic canvas) · nghe: (không — nghe DOM event)
 * API công khai: OG.Input.keys.<tên>, pressed(k), consume(k), setKey(k, v), reset(), endFrame(), init(canvas),
 *               bindTouch(root), sizeTouch(el), hasGesture(), pointer, canvas, TOUCH_SIZE
 * Đọc tiếp:     src/game/player.js (OG.Player.update dùng keys/pressed + coyote time, jump buffer) → src/core/loop.js (endFrame)
 *
 * Hợp đồng:
 *   Trạng thái giữ phím: OG.Input.keys.<tên>. Bấm 1 lần (cạnh lên): OG.Input.pressed('<tên>').
 *   Tên phím logic: left, right, up, down, jump, action, pause, confirm, back, num1, num2, num3
 *   (num1..3 = phím số 1–3, dùng chọn đáp án câu đố nếu scene muốn).
 *   v2 (trẻ em): chạm nửa PHẢI màn chơi (scene level/boss, ngoài dải HUD trên cùng) = giữ nút nhảy.
 *   Bật/tắt: OG.Save.data.settings.tapJump = 'auto' (mặc định: chỉ khi chạm bằng ngón tay) | 'on' | 'off'.
 *   Nút cảm ứng được phóng to theo OG.Input.TOUCH_SIZE (px).
 * ========================================================================== */
(function () {
  'use strict';
  var OG = window.OG;

  // 💡 Khái niệm: phím logic & keymap — mã phím vật lý (e.code) → tên hành động. Gameplay chỉ biết 'jump',
  //   nên muốn thêm phím K để nhảy chỉ cần thêm một dòng ở đây. Một mã có thể map nhiều phím logic
  //   (↑ vừa là 'jump' trong màn chơi vừa là 'up' trên bản đồ).
  /** @type {Object<string, string[]>} */
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
  // Phím chặn hành vi mặc định của trình duyệt (Space/mũi tên sẽ cuộn trang nếu không chặn).
  var PREVENT = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyE'];
  var TOUCH_FONT_RATIO = 0.44;   // cỡ chữ biểu tượng trên nút cảm ứng = 44% cạnh nút
  var TOUCH_RADIUS_RATIO = 0.3;  // bo góc nút cảm ứng = 30% cạnh nút

  /** @type {Object<string, boolean>} phím logic → đang được giữ (bởi ÍT NHẤT một nguồn) */
  var keys = { left: false, right: false, up: false, down: false, jump: false, action: false, pause: false, confirm: false, back: false, num1: false, num2: false, num3: false };
  /** @type {Object<string, boolean>} phím vừa nhấn trong frame này (xoá ở endFrame) */
  var down = {};
  /** @type {Object<string, boolean>} 'phímLogic:nguồn' → đang giữ, vd 'jump:kb', 'jump:tapR1', 'left:touchab12c' */
  var sources = {};
  var gestured = false;

  function firstGesture() {
    if (gestured) return;
    gestured = true;
    // 💡 Khái niệm: autoplay policy — trình duyệt chỉ cho phát âm thanh SAU thao tác đầu tiên của người dùng.
    //   Input không biết Audio; nó chỉ phát event, Audio tự nghe để mở khoá AudioContext.
    OG.Events.emit('input:firstGesture', {});
  }

  /**
   * Đặt trạng thái giữ của phím logic k từ một nguồn cụ thể, rồi tính lại keys[k] từ MỌI nguồn.
   * @param {string} k phím logic
   * @param {string} src tên nguồn ('kb', 'api', 'tapR<id>', 'touch<ngẫu nhiên>')
   * @param {boolean} v true = đang giữ
   */
  function setKey(k, src, v) {
    var id = k + ':' + src;
    var was = keys[k];
    if (v) sources[id] = true; else delete sources[id];
    // 💡 Khái niệm: đếm nguồn giữ phím — bé giữ nút cảm ứng "nhảy" rồi lỡ chạm thêm nửa phải màn hình.
    //   Nếu chỉ dùng một cờ boolean, nhả MỘT nguồn sẽ tắt luôn phím dù nguồn kia vẫn giữ.
    var any = false;
    for (var s in sources) if (s.indexOf(k + ':') === 0) { any = true; break; }
    keys[k] = any;
    // Cạnh lên (rising edge): chỉ đánh dấu "vừa nhấn" khi chuyển từ không giữ → giữ.
    if (any && !was) down[k] = true;
  }

  /**
   * Có đang gõ vào ô nhập liệu không (để không cướp phím khi nhập tên).
   * @param {Event} e
   * @returns {boolean}
   */
  function typing(e) {
    var t = /** @type {HTMLElement} */ (e.target);
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  /**
   * Chạm nửa phải để nhảy có đang bật cho lần chạm này không.
   * @param {PointerEvent} e
   * @param {number} x toạ độ logic, px
   * @param {number} y toạ độ logic, px
   * @returns {boolean}
   */
  function tapJumpOn(e, x, y) {
    var set = OG.Save && OG.Save.data && OG.Save.data.settings ? OG.Save.data.settings.tapJump : 'auto';
    if (set === 'off' || set === false) return false;
    // 'auto': chỉ ngón tay. Chuột bấm lên canvas trên PC thường là bấm nút/vật thể, không phải muốn nhảy.
    if (set !== 'on' && set !== true && e.pointerType !== 'touch') return false;
    var cur = OG.Scenes && OG.Scenes.current ? OG.Scenes.current() : null;
    return TAP_SCENES.indexOf(cur) >= 0 && x > OG.W / 2 && y > HUD_BAND;
  }

  // ---------------------------------------------------------------------------
  // Gắn listener DOM (các hàm con của Input.init, gọi đúng thứ tự)
  // ---------------------------------------------------------------------------

  /** Cử chỉ đầu tiên ở BẤT KỲ đâu → firstGesture(). */
  function bindFirstGesture() {
    // Cử chỉ đầu tiên ở BẤT KỲ đâu (kể cả nút DOM trong #overlay, hay Enter/Space bị panel UI chặn
    // ở pha capture) → phát input:firstGesture để Audio mở khoá AudioContext.
    // 💡 Khái niệm: pha capture (tham số thứ 3 = true) — listener trên window chạy TRƯỚC listener của phần tử
    //   con, nên kể cả khi UI gọi stopPropagation() thì cử chỉ vẫn được ghi nhận.
    window.addEventListener('pointerdown', firstGesture, true);
    window.addEventListener('touchstart', firstGesture, true);
    window.addEventListener('keydown', function (e) { if (!typing(e)) firstGesture(); }, true);
  }

  /** Bàn phím: keydown/keyup → setKey(..., 'kb', ...). */
  function bindKeyboard() {
    window.addEventListener('keydown', function (e) {
      if (typing(e)) return;
      firstGesture();
      var map = KEYMAP[e.code];
      if (PREVENT.indexOf(e.code) >= 0) e.preventDefault();
      if (!map) return;
      for (var i = 0; i < map.length; i++) {
        // ⚠️ Bẫy: giữ phím lâu thì hệ điều hành bắn keydown lặp (e.repeat). Chỉ giữ lại trái/phải — sau
        //   reset() khi đổi scene (vd màn → trùm) người chơi đang giữ phím vẫn đi tiếp. Không lặp
        //   nhảy/tạm dừng, nếu không giữ Esc sẽ bật-tắt pause liên tục.
        if (e.repeat && map[i] !== 'left' && map[i] !== 'right') continue;
        setKey(map[i], 'kb', true);
      }
    });
    window.addEventListener('keyup', function (e) {
      var map = KEYMAP[e.code];
      if (!map) return;
      for (var i = 0; i < map.length; i++) setKey(map[i], 'kb', false);
    });
  }

  /**
   * Con trỏ/chạm trên canvas: cập nhật Input.pointer (toạ độ logic) và chạm-nửa-phải-để-nhảy.
   * @param {HTMLCanvasElement} canvas
   */
  function bindCanvasPointer(canvas) {
    /** @param {PointerEvent} e */
    var toLogical = function (e) {
      // 💡 Khái niệm: toạ độ CSS (canvas có thể đang hiển thị 1920 px hay 375 px) → toạ độ logic 960×540,
      //   bằng tỉ lệ (vị trí trong khung / bề rộng khung) × bề rộng logic.
      var r = canvas.getBoundingClientRect();
      Input.pointer.x = ((e.clientX - r.left) / r.width) * OG.W;
      Input.pointer.y = ((e.clientY - r.top) / r.height) * OG.H;
    };
    /** @type {Object<string, boolean>} pointerId → nguồn phím 'jump' đang giữ bằng chạm */
    var tapSrc = {};
    canvas.addEventListener('pointerdown', function (e) {
      firstGesture();
      toLogical(e);
      Input.pointer.down = true;
      Input.pointer.justPressed = true;
      if (tapJumpOn(e, Input.pointer.x, Input.pointer.y)) {
        // Mỗi ngón (pointerId) là một nguồn riêng: hai ngón cùng chạm, nhấc một ngón vẫn còn nhảy.
        var id = 'tapR' + (e.pointerId != null ? e.pointerId : 0);
        tapSrc[id] = true;
        setKey('jump', id, true);
      }
      OG.Events.emit('input:tap', { x: Input.pointer.x, y: Input.pointer.y });
    });
    /** @param {PointerEvent} e */
    var tapUp = function (e) {
      var id = 'tapR' + (e && e.pointerId != null ? e.pointerId : 0);
      if (tapSrc[id]) { delete tapSrc[id]; setKey('jump', id, false); }
    };
    // ⚠️ Bẫy: nghe pointerup trên WINDOW chứ không trên canvas — ngón tay trượt ra ngoài canvas rồi mới nhấc
    //   thì canvas không nhận pointerup, phím nhảy sẽ bị kẹt mãi.
    window.addEventListener('pointerup', tapUp);
    window.addEventListener('pointercancel', tapUp);
    canvas.addEventListener('pointermove', function (e) { toLogical(e); Input.pointer.inside = true; });
    canvas.addEventListener('pointerleave', function () { Input.pointer.inside = false; });
    window.addEventListener('pointerup', function () {
      if (Input.pointer.down) Input.pointer.justReleased = true;
      Input.pointer.down = false;
    });
  }

  var Input = (OG.Input = {
    keys: keys,
    TOUCH_SIZE: 74, // px — nút cảm ứng to cho ngón tay bé (CSS gốc 58px)
    /** Con trỏ theo hệ toạ độ logic 960×540 (màn hình, không cộng camera). justPressed/justReleased chỉ đúng 1 frame. */
    pointer: { x: 0, y: 0, down: false, justPressed: false, justReleased: false, inside: false },
    /** @type {HTMLCanvasElement | null} */
    canvas: null,

    /**
     * Gắn mọi listener bàn phím/chạm/chuột. main.js gọi một lần lúc boot.
     * @param {HTMLCanvasElement} [canvas] canvas chính; thiếu thì chỉ có bàn phím và nút [data-key]
     */
    init: function (canvas) {
      Input.canvas = canvas;
      // Thứ tự đăng ký có ý nghĩa: listener capture của firstGesture đăng ký trước module UI nên luôn chạy trước.
      bindFirstGesture();
      bindKeyboard();
      // Mất focus (alt-tab) thì keyup không bao giờ tới → xoá hết phím để nhân vật không tự chạy mãi.
      window.addEventListener('blur', function () { Input.reset(); });

      Input.bindTouch(document);

      if (canvas) bindCanvasPointer(canvas);
    },

    /**
     * Gắn nút cảm ứng: mọi phần tử [data-key="<phím logic>"] bên trong root. Gọi lại được cho nút tạo động
     * (phần tử đã gắn được đánh dấu để không gắn hai lần).
     * @param {ParentNode} [root=document]
     * @example
     *   panelEl.innerHTML = '<button class="touch" data-key="jump">⤒</button>';
     *   OG.Input.bindTouch(panelEl);
     */
    bindTouch: function (root) {
      var els = (root || document).querySelectorAll('[data-key]');
      for (var i = 0; i < els.length; i++) {
        var b = /** @type {any} */ (els[i]);
        if (b.__ogBound) continue;
        b.__ogBound = true;
        Input.sizeTouch(b);
        // IIFE trong vòng lặp: mỗi nút giữ biến b/k/src RIÊNG (với `var`, closure không có IIFE sẽ dùng chung b cuối cùng).
        (function (b) {
          var k = b.getAttribute('data-key');
          // Mỗi nút là một nguồn riêng → hai nút cùng phím logic hoạt động độc lập (xem setKey).
          var src = 'touch' + Math.random().toString(36).slice(2, 7);
          /** @param {Event} e */
          var on = function (e) { e.preventDefault(); firstGesture(); setKey(k, src, true); b.classList.add('held'); };
          /** @param {Event} e */
          var off = function (e) { e.preventDefault(); setKey(k, src, false); b.classList.remove('held'); };
          b.addEventListener('pointerdown', on);
          b.addEventListener('pointerup', off);
          // pointerleave: ngón tay trượt khỏi nút cũng coi như nhả.
          b.addEventListener('pointerleave', off);
          b.addEventListener('pointercancel', off);
          // Chặn menu chuột phải / menu nhấn giữ trên điện thoại.
          b.addEventListener('contextmenu', function (/** @type {Event} */ e) { e.preventDefault(); });
        })(b);
      }
    },

    /**
     * Phóng to một nút cảm ứng theo TOUCH_SIZE (chỉ nút .touch của bộ điều khiển, không đụng nút khác có data-key).
     * @param {HTMLElement} b
     */
    sizeTouch: function (b) {
      if (!b || !b.style || !b.classList || !b.classList.contains('touch')) return;
      var px = Input.TOUCH_SIZE;
      b.style.width = px + 'px';
      b.style.height = px + 'px';
      b.style.fontSize = Math.round(px * TOUCH_FONT_RATIO) + 'px';
      b.style.borderRadius = Math.round(px * TOUCH_RADIUS_RATIO) + 'px';
    },

    /**
     * Kiểm tra phím logic VỪA được nhấn trong frame này (true đúng 1 frame, kể cả khi giữ tiếp).
     * 💡 Khái niệm: held vs pressed — đi trái/phải dùng keys.left (giữ là đi liên tục); nhảy, mở menu dùng
     *   pressed('jump') (giữ phím không được nhảy liên tục).
     * @param {string} k phím logic
     * @returns {boolean}
     * @example
     *   if (OG.Input.pressed('pause')) OG.Scenes.push('pause');
     */
    pressed: function (k) { return !!down[k]; },
    /**
     * Đánh dấu cú bấm đã được xử lý để code khác trong cùng frame không xử lý lại.
     * @param {string} k
     * @example
     *   if (OG.Input.pressed('confirm')) { OG.Input.consume('confirm'); openDoor(); }
     */
    consume: function (k) { delete down[k]; },
    /**
     * Ép trạng thái giữ phím (nguồn 'api') — dùng cho test/tự động.
     * 🧪 Thử: trong console gõ  OG.Input.setKey('right', true)  — nhân vật tự chạy sang phải; setKey('right', false) để dừng.
     * @param {string} k
     * @param {boolean} v
     */
    setKey: function (k, v) { setKey(k, 'api', v); },
    /** Xoá mọi phím đang giữ và mọi cú bấm (khi đổi scene / mất focus) để tránh kẹt phím. */
    reset: function () {
      for (var k in keys) keys[k] = false;
      sources = {};
      down = {};
    },
    /**
     * Xoá các cờ "chỉ đúng 1 frame" (pressed, pointer.justPressed/justReleased).
     * ⚠️ Bẫy: OG.Loop gọi hàm này SAU update + draw. Gọi trước update thì không scene nào thấy được cú bấm.
     */
    endFrame: function () {
      down = {};
      Input.pointer.justPressed = false;
      Input.pointer.justReleased = false;
    },
    /** @returns {boolean} người dùng đã có thao tác đầu tiên chưa (để biết Audio đã mở khoá được chưa) */
    hasGesture: function () { return gestured; }
  });
})();
