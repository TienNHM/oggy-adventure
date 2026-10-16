/* Oggy Adventure — namespace gốc, hằng số, bảng màu và tiện ích dùng chung.
 * File đầu tiên được load. Mọi module khác đăng ký vào window.OG.
 * Chủ sở hữu: agent Tích hợp (src/core/). */
(function () {
  'use strict';
  var OG = (window.OG = window.OG || {});

  OG.VERSION = '2.0.0-dev';

  // Font chuẩn (đủ glyph tiếng Việt). KHÔNG dùng Trebuchet MS.
  OG.FONT = '"Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';
  // Tạo chuỗi ctx.font: OG.font(18, 'bold') -> 'bold 18px "Segoe UI", ...'
  OG.font = function (px, weight) { return (weight ? weight + ' ' : '') + (px | 0) + 'px ' + OG.FONT; };

  // Kích thước logic của canvas (CSS sẽ co giãn, toạ độ game luôn là 960x540).
  OG.W = 960;
  OG.H = 540;
  OG.FLOOR_Y = 480; // mặt sàn chuẩn của mọi màn

  // Hằng số vật lý — giữ nguyên giá trị của MVP.
  OG.Config = {
    GRAVITY: 1500,
    MAX_FALL: 900,
    MOVE_SPEED: 255,
    JUMP_VELOCITY: 590,
    HURT_INVULN: 1.6,      // giây bất tử sau khi bị thương
    HURT_BOUNCE: 330,
    HURT_KNOCKBACK: 220,
    STOMP_BOUNCE: 420,     // nảy lên khi giẫm kẻ địch
    START_LIVES: 3,
    MAX_DT: 0.033,
    DEBUG: false
  };

  // Bảng màu chung (lấy từ MVP). Các agent nên dùng các token này để đồng bộ phong cách.
  OG.Palette = {
    ink: '#17233d', cream: '#fff6df', gold: '#ffc94a', blue: '#52c5ee',
    pageBg: '#10192b', shellBorder: '#fff0c9',
    orange: '#f27a43', orangeShadow: '#b74b2b', titleOrange: '#ed713c', titleGlow: '#ffd36b',
    secondary: '#52b9df', secondaryShadow: '#2582aa', panelText: '#25314a', panelShadow: '#b87542',
    skyTop: '#76d8f2', skyBottom: '#e8f6c7', cloud: '#ffffff99',
    floor: '#e9a34f', grass: '#75bd59', plank: '#b97945', plankTop: '#f5d28b',
    kitchenWall: '#f4a66f', kitchenWindow: '#9ce7f1', kitchenCabinet: '#f6c36a', kitchenDecor: '#f5c75f',
    treeTrunk: '#4a9d62', treeTop: '#328454', gardenDecor: '#6dbd69',
    portalFrame: '#f4d45b', portalDoor: '#5b9be8',
    // Nhân vật (gợi ý cho Sprites; Sprites có thể tinh chỉnh)
    oggyHead: '#328be7', oggyBody: '#2877d5', oggyEar: '#2471cb', oggyFeet: '#263b9b', oggyMuzzle: '#d9f0ff',
    roachBody: '#7d3e9b', roachShell: '#b56bc7', roachLeg: '#4b285d',
    joey: '#c45bd1', marky: '#5fae4e', deedee: '#3f8de0', // v2: Dee Dee màu xanh dương như bản gốc
    jack: '#58b84a', olivia: '#f7f1ea', oliviaAccent: '#f29bb8',
    danger: '#e5484d', success: '#3fbf6f', white: '#ffffff'
  };

  // Tiện ích nhỏ dùng chung.
  var U = (OG.util = {});
  U.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  U.lerp = function (a, b, t) { return a + (b - a) * t; };
  U.rand = function (a, b) { return a + Math.random() * (b - a); };
  U.randInt = function (a, b) { return Math.floor(U.rand(a, b + 1)); };
  U.choice = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
  U.now = function () { return (window.performance && performance.now) ? performance.now() : Date.now(); };

  // Đường bo góc tương thích trình duyệt cũ (không có ctx.roundRect).
  U.roundRectPath = function (ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };
  // Tương đương hàm rounded() của MVP.
  U.fillRound = function (ctx, x, y, w, h, r, color) {
    ctx.fillStyle = color;
    U.roundRectPath(ctx, x, y, w, h, r);
    ctx.fill();
  };

  // Gọi hàm an toàn: lỗi trong module tính năng không làm sập game.
  var reported = {};
  U.safe = function (label, fn, self, args) {
    try {
      return fn.apply(self || null, args || []);
    } catch (err) {
      if (!reported[label]) {
        reported[label] = true;
        console.error('[OG] Lỗi trong ' + label + ':', err);
      }
      return undefined;
    }
  };
  // Gọi OG.<ns>.<method>(...args) nếu tồn tại, an toàn.
  U.call = function (ns, method) {
    var mod = OG[ns];
    if (!mod || typeof mod[method] !== 'function') return undefined;
    return U.safe(ns + '.' + method, mod[method], mod, Array.prototype.slice.call(arguments, 2));
  };

  // Escape HTML cho văn bản người dùng nhập (tên trên leaderboard...).
  U.escapeHtml = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  // Giao nhau hai hình chữ nhật {x,y,w,h}.
  U.overlap = function (a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  };

  // Định dạng thời gian mm:ss.
  U.formatTime = function (sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  };

  OG.time = 0; // tổng thời gian game (giây), do Loop cập nhật
})();
