#!/usr/bin/env node
/* ============================================================================
 * tests/smoke.js — SMOKE TEST (kiểm thử "khói": chạy thử toàn bộ game xem có gì "bốc khói" không)
 * ----------------------------------------------------------------------------
 * Vai trò:      Chạy TOÀN BỘ game Oggy Adventure trong Node, không trình duyệt, không thư viện ngoài.
 *               CI (.github/workflows/pages.yml) chạy file này trước mỗi lần deploy; đỏ = không deploy.
 *               Cách chạy:  node tests/smoke.js   (thêm --verbose để in từng bước và số lần phát mỗi event)
 * Khái niệm:    smoke test / kiểm thử đầu-cuối (end-to-end) · vm sandbox (môi trường JS cô lập) · test double
 *               (DOM giả) · đồng hồ ảo + timer giả (test tất định, chạy nhanh hơn thời gian thực) · fixed
 *               step qua OG.Loop.step · điều khiển bằng event giả như người chơi · kiểm tra bất biến
 *               (save/restore cân bằng, không rò listener, không chồng nhạc) · PRNG có seed (ngẫu nhiên lặp lại được)
 * Bài học:      docs/learn/13-kiem-thu-ci.md (chính) · docs/learn/00-bat-dau.md (thứ tự <script>)
 *               · docs/learn/02-game-loop-delta-time.md (fixed step)
 * Phụ thuộc:    tests/fake-dom.js · index.html (đọc thân trang + danh sách script) · mọi file trong src/ và
 *               assets/photos/<id>/credits.js (load bằng vm) · docs/credits.html (kiểm tra ảnh)
 * Event:        nghe: '*' (wildcard — đếm MỌI event của game vào evCount / evLast) · phát: chỉ 'quest:complete'
 *               giả trong qaChecks mục 8. Còn lại test gửi event DOM giả (keydown, pointerdown, click...).
 * API công khai: (không) — script chạy thẳng; thoát mã 1 (process.exitCode) nếu có lỗi.
 * Đọc tiếp:     tests/fake-dom.js (DOM giả) → src/core/loop.js (OG.Loop.step) → src/core/input.js (game đọc
 *               event bàn phím/chạm mà test gửi vào ra sao)
 * Kiểm tra kiểu: không bật @ts-check vì jsconfig.json loại trừ tests/ và tsc cần @types/node (thư viện ngoài)
 *               để hiểu require/process/setImmediate; OG trong test lại là any nên lợi ích rất ít.
 *
 * Luồng chạy (main):
 *   1. Dựng window/document/canvas/localStorage/AudioContext giả (tests/fake-dom.js).
 *   2. Đọc index.html, dựng phần thân trang và load MỌI script đúng thứ tự trong index.html bằng vm.
 *   3. Điều khiển game qua sự kiện bàn phím/chạm/click giống người chơi và chạy hàng nghìn frame
 *      (OG.Loop.step) qua các scene: menu → cài đặt/nhân vật/cửa hàng/xếp hạng → bản đồ → 4 màn + 4 trùm
 *      → chiến thắng → nhập tên → bảng xếp hạng; cộng thêm game over, màn phụ, nhân vật khác, tạm dừng.
 *   4. qaChecks (lỗi đã sửa) → journeyChecks (v2 hành trình) → photoChecks (ảnh) → difficultyChecks (độ khó).
 *   Mọi console.error, ngoại lệ trong frame/listener/timer, ctx.save/restore lệch đều tính là LỖI.
 *
 * 💡 Khái niệm — CÁCH VIẾT MỘT CHECK MỚI (công thức 4 bước, xem ví dụ thật ở qaChecks):
 *   1) Đặt `stage = 'qa:ten-check';` — mọi lỗi sau đó được gắn nhãn này, đọc log biết ngay hỏng ở đâu.
 *   2) Đưa game về trạng thái cần thử: OG.Scenes.go(...), OG.Game.startLevel(...), hoặc gán thẳng vị trí
 *      người chơi (p.x = ...). Rồi `await stepAsync(n)` để game chạy n frame (1 frame = 1/60 giây ảo).
 *   3) Tác động như người chơi: press('Space'), click('#overlay [data-act="play"]'), dispatchEvent(...).
 *   4) Khẳng định: check(điều_kiện, 'thông báo tiếng Việt nói rõ ĐIỀU SAI'); expectScene('level', 'ngữ cảnh').
 *      Hoặc đếm event: so evCount['enemy:stomp'] trước/sau, đọc payload cuối ở evLast['level:complete'].
 *   Sau cùng trả game về trạng thái "sạch" (vd OG.Scenes.go('menu')) để check kế tiếp không bị ảnh hưởng.
 * ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const D = require('./fake-dom');

const ROOT = path.resolve(__dirname, '..');
const VERBOSE = process.argv.includes('--verbose');
// 💡 Khái niệm: fixed step — mỗi frame test luôn tiến đúng 1/60 giây ảo, không phụ thuộc máy nhanh hay chậm,
//   nên test TẤT ĐỊNH (deterministic): chạy 100 lần cho cùng kết quả.
// 🧪 Thử: đổi DT thành 1 / 30 rồi chạy test: frame to gấp đôi, xem kiểm tra nào (giẫm địch, nhảy cao) bắt
//   đầu đỏ — đó là những chỗ game nhạy với delta time (khoảng thời gian giữa 2 frame).
const DT = 1 / 60;            // giây ảo mỗi frame

// ---------------------------------------------------------------------------
// Ghi nhận lỗi
// ---------------------------------------------------------------------------
/** @type {string[]} lỗi đã gặp, dạng '[stage] thông báo' — có lỗi thì thoát mã 1 */
const errors = [];
/** @type {string[]} cảnh báo (không làm đỏ test), in tối đa 15 cái ở cuối */
const warnings = [];
// Khử trùng lặp: cùng một lỗi lặp mỗi frame trong cùng stage chỉ ghi một lần (log không bị ngập).
const seen = new Set();
// Nhãn giai đoạn đang chạy ('load', 'boot', 'level:kitchen', 'qa:audio'...) — gắn vào mọi lỗi.
let stage = 'load';
/**
 * Ghi một LỖI (test sẽ đỏ) gắn nhãn stage hiện tại. Không ném ngoại lệ: test chạy tiếp để gom được nhiều lỗi
 * trong một lần chạy.
 * @param {string} msg mô tả điều sai, tiếng Việt
 */
function fail(msg) {
  const key = stage + '|' + msg;
  if (seen.has(key)) return;
  seen.add(key);
  errors.push('[' + stage + '] ' + msg);
  console.log('  ✗ ' + msg);
}
function warn(msg) { warnings.push('[' + stage + '] ' + msg); if (VERBOSE) console.log('  ! ' + msg); }
function log(msg) { if (VERBOSE) console.log('    ' + msg); }
/**
 * Rút gọn một lỗi để in: "TênLỗi: thông báo" rồi tối đa 4 dòng đầu của stack.
 * ⚠️ Bẫy: với lỗi ném ra lúc vm.runInContext NẠP file, V8 đặt vị trí nguồn ("src/x.js:31", dòng code, dấu ^) LÊN TRƯỚC
 *   thông báo lỗi trong e.stack. Chỉ cắt 4 dòng đầu của stack thì mất luôn chữ "TypeError: ..." → phải tự ghép e.message.
 */
function errText(e) {
  if (!e || !e.stack) return String(e);
  const lines = String(e.stack).split('\n').slice(0, 4);
  const head = (e.name || 'Error') + ': ' + e.message;
  if (lines[0] !== head) lines.unshift(head);
  return lines.join('\n      ');
}
D.setListenerErrorHandler((err, type) => fail('Lỗi trong listener "' + type + '": ' + errText(err)));

// ---------------------------------------------------------------------------
// Đồng hồ ảo + timer giả
// ---------------------------------------------------------------------------
// 💡 Khái niệm: đồng hồ ảo. performance.now(), setTimeout/setInterval và AudioContext.currentTime của game
//   đều đọc CÙNG một clock.t do test tự tăng trong step(). Hơn 10 phút chơi ảo chạy xong nhanh hơn nhiều so với thời gian thật,
//   và toast 3 giây hay nhạc nền được lập lịch đúng như trong trình duyệt — không cần sleep.
const clock = { t: 0 };           // giây ảo, chỉ step() được tăng
/** @type {{id: number, fn: Function, at: number, every: number, args: any[]}[]} at = thời điểm chạy (ms ảo); every > 0 = setInterval */
let timers = [];
let timerSeq = 1;
function addTimer(fn, ms, repeat, args) {
  const id = timerSeq++;
  if (typeof fn !== 'function') return id;
  ms = Math.max(0, +ms || 0);
  timers.push({ id, fn, at: clock.t * 1000 + ms, every: repeat ? Math.max(1, ms) : 0, args });
  return id;
}
function clearTimer(id) { timers = timers.filter((x) => x.id !== id); }
// Chạy mọi timer đã đến hạn, theo thứ tự thời điểm (sớm trước) — timer A có thể tạo timer B cũng đến hạn ngay.
// ⚠️ Bẫy: guard 1000 vòng chặn vòng lặp vô hạn khi game lỡ tạo setTimeout(fn, 0) tự gọi lại chính nó.
function runTimers() {
  const now = clock.t * 1000;
  for (let guard = 0; guard < 1000; guard++) {
    const due = timers.filter((x) => x.at <= now).sort((a, b) => a.at - b.at)[0];
    if (!due) break;
    if (due.every) due.at += due.every; else clearTimer(due.id);
    try { due.fn.apply(null, due.args || []); } catch (e) { fail('Lỗi trong timer: ' + errText(e)); }
  }
}

// ---------------------------------------------------------------------------
// Dựng môi trường trình duyệt giả
// ---------------------------------------------------------------------------
const doc = new D.FakeDocument();
const winTarget = new D.FakeEventTarget();
doc.defaultView = winTarget;
const storage = D.makeStorage();
const AudioCtx = D.makeAudioContextClass(clock);

// console của GAME (khác console của test): console.error trong game = LỖI test, console.warn = cảnh báo.
const fakeConsole = {
  log: (...a) => { if (VERBOSE) console.log('    [game]', ...a); },
  info: (...a) => { if (VERBOSE) console.log('    [game]', ...a); },
  debug: () => {},
  warn: (...a) => warn('console.warn: ' + a.map(String).join(' ')),
  error: (...a) => fail('console.error: ' + a.map((x) => (x && x.stack ? errText(x) : String(x))).join(' ')),
  table: () => {}, group: () => {}, groupEnd: () => {}, trace: () => {}
};

// Object toàn cục (globalThis) của game trong vm: chỉ chứa những gì trình duyệt cung cấp mà game có dùng.
// Thiếu thứ gì thì game ném ReferenceError khi load → test báo "Lỗi khi load <file>" (rất dễ thấy).
const sandbox = {
  console: fakeConsole,
  document: doc,
  localStorage: storage,
  sessionStorage: D.makeStorage(),
  navigator: {
    userAgent: 'Mozilla/5.0 (Node smoke test)', language: 'vi-VN', languages: ['vi-VN'], maxTouchPoints: 0, onLine: true,
    clipboard: { writeText: () => Promise.resolve() }
  },
  location: { href: 'file:///D:/repos/oggy-adventure/index.html', protocol: 'file:', origin: 'null', host: '', hostname: '', pathname: '/D:/repos/oggy-adventure/index.html', search: '', hash: '' },
  performance: { now: () => clock.t * 1000 },
  // rAF giả không bao giờ gọi callback: vòng lặp thật của OG.Loop đứng yên, test tự "bơm" frame bằng step().
  requestAnimationFrame: () => 1,
  cancelAnimationFrame: () => {},
  setTimeout: (fn, ms, ...args) => addTimer(fn, ms, false, args),
  clearTimeout: clearTimer,
  setInterval: (fn, ms, ...args) => addTimer(fn, ms, true, args),
  clearInterval: clearTimer,
  queueMicrotask: (fn) => queueMicrotask(fn),
  AudioContext: AudioCtx,
  Blob, File: typeof File !== 'undefined' ? File : Blob, URL,
  Image: function () { this.onload = null; },
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
  getComputedStyle: (el) => el.style,
  devicePixelRatio: 1,
  innerWidth: 1280, innerHeight: 720,
  isSecureContext: false,
  // Hộp thoại chặn của trình duyệt bị hợp đồng cấm (làm đứng game, xấu trên điện thoại) → gọi là LỖI.
  alert: () => fail('Gọi alert() — hợp đồng cấm'),
  prompt: () => { fail('Gọi prompt() — hợp đồng cấm'); return null; },
  confirm: () => { fail('Gọi confirm() — hợp đồng cấm'); return false; },
  addEventListener: (...a) => winTarget.addEventListener(...a),
  removeEventListener: (...a) => winTarget.removeEventListener(...a),
  dispatchEvent: (ev) => winTarget.dispatchEvent(ev),
  focus: () => {}, blur: () => {}, scrollTo: () => {},
  Event: D.FakeEvent, KeyboardEvent: D.FakeEvent, PointerEvent: D.FakeEvent, MouseEvent: D.FakeEvent, CustomEvent: D.FakeEvent
};
// 💡 Khái niệm: vm sandbox. vm.createContext biến object `sandbox` thành globalThis của một "thế giới JS"
//   riêng: code game chạy trong đó thấy `document`, `localStorage`... là bản giả của ta, và KHÔNG đụng được
//   biến của test (require, process, fs). Giống mở game trong một tab trình duyệt tách biệt.
const context = vm.createContext(sandbox);
const win = vm.runInContext('globalThis', context);
// Trong trình duyệt window === self === globalThis; game viết window.OG nên phải nối các tên này lại.
win.window = win;
win.self = win;

// Dựng phần thân trang từ index.html (bỏ thẻ script), giữ nguyên id/class/style như thật.
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const bodyHtml = (/<body[^>]*>([\s\S]*)<\/body>/i.exec(indexHtml) || [])[1] || '';
D.parseHTML(bodyHtml.replace(/<script[\s\S]*?<\/script>/gi, ''), doc.body, doc);
// Danh sách script đúng THỨ TỰ xuất hiện trong index.html — test load theo đúng thứ tự này.
// ⚠️ Bẫy: regex chỉ nhận dạng chính xác  <script src="..."></script>  (nháy kép, không thuộc tính khác).
//   Thêm defer/async/type hay viết nháy đơn → script bị BỎ QUA trong test (dù trình duyệt vẫn chạy).
//   Ngược lại, chuỗi đó nằm trong comment HTML vẫn bị tính → đừng chép thẻ script vào comment.
const scripts = Array.from(indexHtml.matchAll(/<script\s+src="([^"]+)"\s*><\/script>/g)).map((m) => m[1]);

// Kiểm tra file CSS tham chiếu tồn tại.
Array.from(indexHtml.matchAll(/<link[^>]+href="([^"]+)"/g)).forEach((m) => {
  if (!/^https?:/.test(m[1]) && !fs.existsSync(path.join(ROOT, m[1]))) fail('Thiếu file CSS: ' + m[1]);
});

// ---------------------------------------------------------------------------
// Tiện ích điều khiển
// ---------------------------------------------------------------------------
let OG = null;                    // window.OG của game, có sau khi load xong script
let mainCtx = null;               // ctx 2D giả của canvas #game (đọc depth/underflow để kiểm tra save/restore)
let frames = 0;                   // tổng số frame đã chạy (in ở cuối)

// Nhường cho các Promise/microtask của game chạy xong (vd navigator.clipboard.writeText().then(...)).
// step() là đồng bộ nên Promise chỉ được xử lý khi test await flush() / stepAsync().
async function flush() { await new Promise((r) => setImmediate(r)); }

/**
 * Chạy n frame game: tăng đồng hồ ảo, chạy timer đến hạn, gọi OG.Loop.step(DT), rồi kiểm tra bất biến
 * ctx.save/restore cân bằng sau MỖI frame.
 * @param {number} [n=1] số frame (mỗi frame = DT = 1/60 giây ảo)
 * @example
 *   step(60);   // chơi 1 giây ảo
 */
function step(n) {
  n = n || 1;
  for (let i = 0; i < n; i++) {
    clock.t += DT;
    runTimers();
    // Frame lỗi: ghi lỗi rồi vẫn gọi endFrame() để trạng thái phím "vừa bấm" không kẹt sang frame sau.
    try { OG.Loop.step(DT); } catch (e) { fail('Lỗi frame (scene ' + safeScene() + '): ' + errText(e)); try { OG.Input.endFrame(); } catch (e2) { /* bỏ qua */ } }
    frames++;
    // 💡 Khái niệm: kiểm tra bất biến (invariant) — điều PHẢI luôn đúng sau mỗi frame. Mỗi ctx.save() phải có
    //   một ctx.restore(); lệch là transform/alpha của hình này rò sang hình khác (lỗi vẽ rất khó tìm bằng mắt).
    if (mainCtx.depth !== 0 || mainCtx.underflow) {
      fail('ctx.save/restore lệch sau frame ở scene ' + safeScene() + ' (depth=' + mainCtx.depth + ', underflow=' + mainCtx.underflow + ')');
      mainCtx.depth = 0; mainCtx.underflow = 0;
    }
  }
}
/** Như step(n) rồi nhường cho Promise của game chạy. @param {number} [n=1] */
async function stepAsync(n) { step(n); await flush(); }
// Chồng scene hiện tại dạng 'level>pause>settings' — dùng trong thông báo lỗi.
function safeScene() { try { return OG.Scenes.stackNames().join('>'); } catch (e) { return '?'; } }
function cur() { return OG.Scenes.current(); }

// ---- Bàn phím giả: event được gửi vào phần tử đang focus (giống trình duyệt) rồi nổi bọt lên window ----
// event.code (phím vật lý) → event.key (ký tự) cho các phím test dùng; phím khác dùng code làm key.
const CODE_KEY = { Escape: 'Escape', Enter: 'Enter', Space: ' ', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', KeyE: 'e', KeyP: 'p', KeyM: 'm' };
function keyDown(code) { (doc.activeElement || doc.body).dispatchEvent(new D.FakeEvent('keydown', { code, key: CODE_KEY[code] || code })); }
function keyUp(code) { (doc.activeElement || doc.body).dispatchEvent(new D.FakeEvent('keyup', { code, key: CODE_KEY[code] || code })); }
/**
 * Bấm rồi nhả một phím như người chơi: giữ `hold` frame, nhả, chạy thêm 1 frame.
 * @param {string} code event.code, vd 'Space', 'ArrowRight', 'KeyE', 'Escape', 'Digit2'
 * @param {number} [hold=1] số frame giữ phím
 * @example
 *   await press('Escape');          // mở tạm dừng
 *   await press('ArrowRight', 30);  // giữ → nửa giây
 */
async function press(code, hold) { keyDown(code); step(hold || 1); keyUp(code); await stepAsync(1); }

function $(sel) { return doc.querySelector(sel); }
/**
 * Bấm (click) một phần tử DOM; không tìm thấy thì ghi LỖI kèm scene hiện tại.
 * @param {string|Object} sel selector CSS (đủ cho DOM giả) hoặc chính phần tử
 * @param {string} [label] tên dễ đọc cho thông báo lỗi
 * @returns {boolean} true nếu đã bấm
 * @example
 *   click('#overlay [data-act="play"]', 'CHƠI');
 */
function click(sel, label) {
  const el = typeof sel === 'string' ? $(sel) : sel;
  if (!el) { fail('Không tìm thấy phần tử để bấm: ' + (label || sel) + ' (scene ' + safeScene() + ')'); return false; }
  el.click();
  return true;
}
// Tìm nút trong panel theo chữ hiển thị — dùng khi nút không có data-act riêng.
function findButton(textRe) {
  return doc.querySelectorAll('#overlay button').find((b) => textRe.test(b.textContent)) || null;
}
/**
 * Chạy từng frame tới khi scene trên cùng là `name` (chuyển cảnh có hiệu ứng nên không tức thì).
 * Quá maxFrames thì ghi LỖI.
 * @param {string} name tên scene, vd 'boss', 'worldmap'
 * @param {number} [maxFrames=120] số frame tối đa chờ (120 = 2 giây ảo)
 * @param {string} [label] ngữ cảnh cho thông báo lỗi
 * @returns {Promise<boolean>}
 */
async function waitScene(name, maxFrames, label) {
  for (let i = 0; i < (maxFrames || 120); i++) {
    if (cur() === name) return true;
    step(1);
    if (i % 30 === 0) await flush();
  }
  if (cur() === name) return true;
  fail('Chờ scene "' + name + '" thất bại' + (label ? ' (' + label + ')' : '') + ' — đang ở ' + safeScene());
  return false;
}
/**
 * Khẳng định scene trên cùng NGAY BÂY GIỜ là `name` (không chờ). Sai → ghi LỖI.
 * @param {string} name
 * @param {string} [label] ngữ cảnh, vd 'Esc từ cài đặt'
 * @returns {boolean} dùng trong if để bỏ qua phần kiểm tra phụ thuộc vào scene này
 * @example
 *   if (expectScene('pause', 'Esc trong màn')) { ... }
 */
function expectScene(name, label) {
  if (cur() !== name) { fail('Mong đợi scene "' + name + '"' + (label ? ' (' + label + ')' : '') + ', thực tế: ' + safeScene()); return false; }
  return true;
}
/**
 * Khẳng định (assert) cơ bản: cond sai → ghi LỖI msg. Trả lại cond để viết `if (check(...)) { ... }`.
 * @param {any} cond
 * @param {string} msg nói rõ ĐIỀU SAI và giá trị thực tế, vd 'Xu không được lưu (' + a + ' ≠ ' + b + ')'
 * @returns {boolean}
 */
function check(cond, msg) { if (!cond) fail(msg); return !!cond; }
// "Gian lận" có kiểm soát: giữ đủ mạng để kịch bản dài không bị game over giữa chừng (game over có check riêng).
function keepAlive() { if (OG.Game.run && !OG.Game.run.over && OG.Game.run.lives < 6) { OG.Game.run.lives = 9; OG.Game.hud.lives = 9; } }

// Đếm event để kiểm tra luồng (điền bởi listener wildcard '*' đăng ký ngay sau khi load script).
/** @type {Object<string, number>} tên event → số lần đã phát */
const evCount = {};
/** @type {Object<string, Object>} tên event → payload của lần phát gần nhất */
const evLast = {};

// ---------------------------------------------------------------------------
// Kịch bản con
// ---------------------------------------------------------------------------
// 💡 Khái niệm: test KHÔNG cố "chơi giỏi" như người. Phần chạy tự do dùng input thật để thử AI/vật lý/va
//   chạm; phần cần kết quả chắc chắn (nhặt đồ, giẫm địch, tới cửa) thì DỊCH CHUYỂN người chơi tới đúng chỗ
//   (gán p.x, p.y, p.vy) rồi để game tự xử lý va chạm — vẫn kiểm tra được logic mà không phụ thuộc may rủi.
/**
 * Chơi một màn: chạy tự do một lúc, giẫm 1 kẻ địch, nhặt hết pizza (dịch chuyển), rồi qua cửa EXIT.
 * @param {string} levelId
 * @param {{freeFrames?: number, pause?: boolean}} [opts] freeFrames = số frame chạy tự do (mặc định 240);
 *   pause = thử luồng tạm dừng giữa màn
 */
async function playLevel(levelId, opts) {
  opts = opts || {};
  stage = 'level:' + levelId;
  if (!expectScene('level', 'bắt đầu màn')) return false;
  const st = OG.Level.state;
  check(st && st.level.id === levelId, 'Màn đang chơi là ' + (st && st.level.id) + ', mong đợi ' + levelId);
  const p = st.player;
  // 1) Chạy tự do: giữ phải + nhảy định kỳ + bấm action.
  keyDown('ArrowRight');
  for (let i = 0; i < (opts.freeFrames || 240); i++) {
    keepAlive();
    if (i % 45 === 0) keyDown('Space');
    if (i % 45 === 8) keyUp('Space');
    if (i % 70 === 30) { keyDown('KeyE'); }
    if (i % 70 === 31) { keyUp('KeyE'); }
    step(1);
    if (cur() !== 'level') break;
  }
  keyUp('ArrowRight'); keyUp('Space');
  await flush();
  if (!expectScene('level', 'sau khi chạy tự do')) return false;

  // 2) Giẫm một kẻ địch còn sống (ưu tiên bộ ba gián nếu có).
  const enemies = st.enemies.filter((e) => e.alive);
  const target = enemies.find((e) => e.type !== 'roach') || enemies[0];
  if (target) {
    const before = evCount['enemy:stomp'] || 0;
    for (let tries = 0; tries < 10 && target.alive; tries++) {
      // vy đủ lớn để bắt kịp cả Marky đang nhảy cò cò (rơi tối đa ~6px/frame)
      p.x = target.x + target.w / 2 - p.w / 2; p.y = target.y - p.h - 3; p.vy = 600; p.inv = 0;
      step(1);
    }
    check(!target.alive && (evCount['enemy:stomp'] || 0) > before, 'Không giẫm được kẻ địch loại ' + target.type);
    step(10);
  }
  // 3) Nhặt hết pizza và xu.
  for (const it of st.items) {
    if (it.got) continue;
    keepAlive();
    p.x = it.x - p.w / 2; p.y = it.y - p.h / 2; p.vx = 0; p.vy = 0;
    step(1);
  }
  check(OG.Game.stage.pizzas >= st.level.goal, 'Chưa đủ pizza sau khi nhặt: ' + OG.Game.stage.pizzas + '/' + st.level.goal);
  await flush();
  if (opts.pause) await pauseFlow('level');
  // 4) Qua cửa.
  keepAlive();
  p.x = st.exit.x + 10; p.y = OG.FLOOR_Y - p.h - 1; p.vy = 0; p.inv = 2;
  for (let i = 0; i < 200 && cur() === 'level'; i++) { keepAlive(); step(1); }
  await flush();
  return true;
}

// Tạm dừng: Esc → pause → cài đặt (overlay) → quay lại → tiếp tục; rồi thử nút ⏸ trên HUD.
async function pauseFlow(from) {
  const prev = stage;
  stage = 'pause:' + from;
  await press('Escape');
  if (expectScene('pause', 'Esc trong ' + from)) {
    step(20);
    check(OG.DOM.isPanelOpen(), 'Panel tạm dừng không mở');
    click('#overlay [data-act="settings"]', 'Cài đặt trong pause');
    await stepAsync(10);
    expectScene('settings', 'cài đặt từ pause');
    await press('Escape');
    await stepAsync(5);
    expectScene('pause', 'quay lại pause từ cài đặt');
    click('#overlay [data-act="resume"]', 'Tiếp tục');
    await stepAsync(5);
    expectScene(from, 'tiếp tục sau pause');
  }
  // Nút ⏸ (cảm ứng/chuột)
  const pb = doc.getElementById('pauseBtn');
  check(pb && pb.style.display !== 'none', 'Nút ⏸ đang ẩn trong lúc chơi');
  if (pb) pb.click();
  await stepAsync(5);
  if (expectScene('pause', 'nút ⏸')) { await press('KeyP'); await stepAsync(3); expectScene(from, 'P để tiếp tục'); }
  stage = prev;
}

// Đánh trùm: vờn tự do (kiểm tra AI, đạn, phản đòn) rồi giẫm điểm yếu tới khi thắng.
async function fightBoss(bossId, opts) {
  opts = opts || {};
  stage = 'boss:' + bossId;
  if (!expectScene('boss', 'vào trận ' + bossId)) return false;
  check(OG.Game.hud.boss && OG.Game.hud.boss.id === bossId, 'HUD không có thanh máu trùm ' + bossId);
  const p = OG.BossScene.getPlayer();
  check(!!p, 'OG.BossScene.getPlayer() trả null');
  // 1) Vờn 8 giây với input ngẫu nhiên (seed cố định).
  // 💡 Khái niệm: PRNG (bộ sinh số giả ngẫu nhiên) có seed — công thức Park–Miller (nhân 16807, chia dư 2³¹−1).
  //   Cùng seed → cùng dãy số → mỗi lần chạy test "người chơi" bấm phím y hệt nhau, lỗi tái hiện được.
  //   Không dùng Math.random() ở đây: nó dùng chung với game và không đặt seed được.
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  let dir = 'ArrowRight';
  keyDown(dir);
  for (let i = 0; i < (opts.freeFrames || 480) && cur() === 'boss'; i++) {
    keepAlive();
    if (i % 60 === 0) { keyUp(dir); dir = rnd() < 0.5 ? 'ArrowLeft' : 'ArrowRight'; keyDown(dir); }
    if (i % 37 === 0) keyDown('Space');
    if (i % 37 === 6) keyUp('Space');
    if (i % 23 === 0) keyDown('KeyE');
    if (i % 23 === 1) keyUp('KeyE');
    step(1);
    if (i % 120 === 0) await flush();
  }
  keyUp(dir); keyUp('Space'); keyUp('KeyE');
  await flush();
  if (bossId === 'joey' && !opts.noPause) await pauseFlow('boss');
  // 2) Giẫm điểm yếu cho tới khi hạ trùm (tối đa 120 giây ảo).
  //    Mỗi lần dịch chuyển cách nhau ≥ 0.3 giây ảo: để người chơi nảy lên sau cú giẫm trước và game xử lý
  //    xong va chạm, thay vì kéo người chơi về chỗ cũ mỗi frame.
  const hitsBefore = evCount['boss:hit'] || 0;
  let lastTry = -9;
  for (let i = 0; i < 60 * 120 && cur() === 'boss'; i++) {
    keepAlive();
    const boss = OG.BossScene.getBoss();
    const weak = boss && boss.getWeakspot ? boss.getWeakspot() : null;
    if (weak && clock.t - lastTry > 0.3 && !boss.isDefeated()) {
      lastTry = clock.t;
      p.x = weak.x + weak.w / 2 - p.w / 2; p.y = weak.y - p.h - 2; p.vy = 300; p.vx = 0;
    }
    step(1);
    if (i % 120 === 0) await flush();
  }
  await flush();
  check((evCount['boss:hit'] || 0) > hitsBefore, 'Không có boss:hit nào trong trận ' + bossId);
  log('trận ' + bossId + ': ' + ((evCount['boss:hit'] || 0) - hitsBefore) + ' cú giẫm, phase=' + (evCount['boss:phase'] | 0));
  check(evLast['boss:defeated'] && evLast['boss:defeated'].bossId === bossId, 'Không thấy boss:defeated cho ' + bossId);
  return true;
}

// Từ bản đồ: đóng banner (nếu có), chọn màn, bấm Enter để vào.
async function enterFromMap(levelId) {
  stage = 'worldmap→' + levelId;
  if (!expectScene('worldmap')) return false;
  step(30);
  await press('Enter'); // đóng banner kết quả (nếu đang hiện)
  step(20);
  OG.World.focusLevel(levelId);
  step(150); // Oggy đi bộ tới nút
  await press('Enter');
  if (cur() !== 'level') {
    for (let i = 0; i < 90 && cur() !== 'level'; i++) step(1);
  }
  if (cur() === 'level') log('vào ' + levelId + ' bằng phím Enter trên bản đồ');
  // Dự phòng: Enter không vào được thì thử đường cảm ứng (chạm vào nút màn) — chỉ cảnh báo, không đỏ.
  if (cur() !== 'level') {
    warn('Enter trên bản đồ không vào được ' + levelId + ', thử chạm vào nút màn');
    // Thử chạm trực tiếp vào nút màn trên canvas.
    const node = (OG.World.getNodes() || []).find((n) => n.id === levelId);
    if (node) {
      const cv = doc.getElementById('game');
      for (let k = 0; k < 2 && cur() !== 'level'; k++) {
        cv.dispatchEvent(new D.FakeEvent('pointerdown', { clientX: node.x, clientY: node.y }));
        step(2);
        win.dispatchEvent(new D.FakeEvent('pointerup', {}));
        step(60);
      }
    }
  }
  return waitScene('level', 60, 'vào màn ' + levelId + ' từ bản đồ');
}

// ---------------------------------------------------------------------------
// Chạy
// ---------------------------------------------------------------------------
// Kịch bản chính. Các bước dùng CHUNG một game đang chạy (không khởi động lại giữa chừng), nên THỨ TỰ có ý
// nghĩa: chiến dịch phải xong thì màn phụ mới mở khoá; mua giày lò xo ở menuTour được kiểm tra trong màn
// kitchen của playCampaign; qaChecks mục 7 đọc kết quả chiến thắng của victoryFlow...
// ⚠️ Bẫy: chèn check mới vào GIỮA chuỗi có thể làm hỏng giả định của bước sau (vd đổi nhân vật đang chọn,
//   tiêu hết xu). Check mới nên tự dọn dẹp, hoặc thêm vào cuối một nhóm (qaChecks, difficultyChecks...).
async function main() {
  const t0 = Date.now();
  console.log('Oggy Adventure — smoke test (' + scripts.length + ' script)');

  if (!loadGameScripts()) return finish(t0);
  await bootChecks();
  await menuTour();
  await playCampaign();
  await victoryFlow();
  await extraLevelsFlow();
  await gameOverFlow();

  await qaChecks();
  await journeyChecks();
  await photoChecks();
  await difficultyChecks();

  await resetFlow();
  return finish(t0);
}

// ---- Load script theo thứ tự index.html ----
// 💡 Khái niệm: mỗi file là một IIFE gắn module vào window.OG lúc LOAD, và file sau được phép đọc OG.X của
//   file trước. vm.runInContext lần lượt từng file trong CÙNG context = trình duyệt chạy lần lượt các thẻ
//   script trong cùng một trang. Đảo thứ tự trong index.html là test thấy lỗi ngay ở stage 'load'.
// 🧪 Thử: trong index.html chuyển dòng nạp src/core/namespace.js xuống dưới src/core/events.js rồi chạy test:
//   thông báo "Lỗi khi load src/core/events.js" chỉ đúng file đọc window.OG khi nó chưa tồn tại. Nhớ trả lại như cũ!
/** @returns {boolean} false nếu không có window.OG (không chạy tiếp được) */
function loadGameScripts() {
  stage = 'load';
  for (const src of scripts) {
    const file = path.join(ROOT, src);
    if (!fs.existsSync(file)) { fail('Thiếu file script: ' + src); continue; }
    const code = fs.readFileSync(file, 'utf8');
    // Hợp đồng: không ES modules (file:// chặn import). Bắt ngay ở đây cho thông báo rõ ràng.
    if (/^\s*(import|export)\s/m.test(code)) fail('Có import/export (ES module) trong ' + src);
    // filename giúp stack trace của lỗi ghi đúng tên file game thay vì "evalmachine".
    try { vm.runInContext(code, context, { filename: src }); } catch (e) { fail('Lỗi khi load ' + src + ': ' + errText(e)); }
  }
  OG = win.OG;
  if (!OG) { fail('window.OG không tồn tại'); return false; }
  // Wildcard listener '*' (xem src/core/events.js): đếm mọi event để kiểm tra luồng mà không sửa code game.
  OG.Events.on('*', (name, payload) => { evCount[name] = (evCount[name] || 0) + 1; evLast[name] = payload; });
  return true;
}

// ---- Boot (DOMContentLoaded) ----
async function bootChecks() {
  stage = 'boot';
  // readyState đang 'loading' nên src/core/main.js chờ DOMContentLoaded mới boot → test phát event này thay trình duyệt.
  doc.readyState = 'interactive';
  doc.dispatchEvent(new D.FakeEvent('DOMContentLoaded', {}));
  mainCtx = doc.getElementById('game').getContext('2d');
  check(OG.Loop.ctx === mainCtx, 'OG.Loop chưa được start với ctx của #game');
  // Kiểm tra "đăng ký đủ": module/màn/skin/trùm/scene mà file khác cần đều đã có mặt sau boot.
  ['Audio', 'Sprites', 'Bosses', 'World', 'Quests', 'Menus', 'Shop', 'Social'].forEach((ns) => check(OG[ns] && typeof OG[ns].init === 'function', 'Thiếu module OG.' + ns));
  ['basement', 'bathroom', 'attic'].forEach((id) => check(!!OG.Data.getLevel(id), 'Chưa đăng ký màn phụ ' + id + ' (extraLevels.js)'));
  ['oggy_chef', 'oggy_super'].forEach((id) => check(!!OG.Data.getSkin(id), 'Chưa đăng ký skin ' + id + ' (skins.js)'));
  ['deedee', 'marky', 'joey', 'trio'].forEach((id) => check(OG.Bosses.has(id), 'Chưa đăng ký trùm ' + id));
  ['menu', 'charselect', 'settings', 'shop', 'worldmap', 'level', 'boss', 'pause', 'gameover', 'victory', 'leaderboard'].forEach((s) => check(OG.Scenes.has(s), 'Chưa đăng ký scene ' + s));
  check(OG.Progress.isFinal('lair') && !OG.Progress.isFinal('attic'), 'Màn final sai (lair phải là màn cuối)');
  // v2: mặc định là chế độ 'kid'. Chiến dịch cổ điển bên dưới kiểm tra đúng số liệu v1 nên chạy ở 'challenge';
  // phần hành trình (journeyChecks) chạy ở 'kid'.
  check(OG.Difficulty && OG.Difficulty.mode() === 'kid', 'Độ khó mặc định phải là kid');
  OG.Difficulty.set('challenge');
  await stepAsync(10);
  expectScene('menu', 'sau boot');
}

// ---- Dạo menu: cử chỉ đầu tiên → cài đặt → nhân vật → cửa hàng → xếp hạng → nút cảm ứng ----
async function menuTour() {
  // ---- Cử chỉ đầu tiên (bấm nút DOM) → Audio ----
  // Autoplay policy: trình duyệt chỉ cho phát tiếng sau thao tác đầu tiên của người dùng (bài 10).
  stage = 'menu';
  const gestures = evCount['input:firstGesture'] || 0;
  doc.querySelector('#overlay').dispatchEvent(new D.FakeEvent('pointerdown', {}));
  await stepAsync(2);
  check((evCount['input:firstGesture'] || 0) === gestures + 1, 'pointerdown trên panel DOM không phát input:firstGesture');
  check((AudioCtx.instances | 0) >= 1, 'Audio chưa tạo AudioContext sau cử chỉ đầu tiên');

  // ---- Menu → Cài đặt ----
  click('#overlay [data-act="settings"]', 'Cài đặt');
  await stepAsync(20);
  if (expectScene('settings', 'menu → cài đặt')) {
    const plus = doc.querySelectorAll('#overlay [data-act="vol"]')[1];
    if (plus) { plus.click(); await stepAsync(2); }
    click('#overlay [data-act="mute"]', 'Tắt tiếng'); await stepAsync(2);
    click('#overlay [data-act="mute"]', 'Bật tiếng'); await stepAsync(2);
    await press('Escape');
    await stepAsync(5);
    expectScene('menu', 'Esc từ cài đặt');
  }

  // ---- Menu → Nhân vật ----
  click('#overlay [data-act="chars"]', 'Nhân vật');
  await stepAsync(30);
  if (expectScene('charselect')) {
    await press('ArrowRight'); await press('ArrowDown');
    await press('Escape');
    await stepAsync(5);
    expectScene('menu', 'Esc từ chọn nhân vật');
  }

  // ---- Menu → Cửa hàng: mua giày lò xo (2 bước xác nhận) ----
  OG.Save.addCoins(2000, 'test');
  click('#overlay [data-act="shop"]', 'Cửa hàng');
  await stepAsync(20);
  if (expectScene('shop')) {
    click('#overlay [data-act="buy"][data-arg="boots"]', 'Mua giày'); await stepAsync(2);
    click('#overlay [data-act="buy"][data-arg="boots"]', 'Xác nhận mua giày'); await stepAsync(2);
    check(OG.Save.getItemCount('boots') === 1, 'Mua giày lò xo thất bại (kho=' + OG.Save.getItemCount('boots') + ')');
    click('#overlay [data-act="tab"][data-arg="skin"]', 'Tab trang phục'); await stepAsync(10);
    click('#overlay [data-act="tab"][data-arg="char"]', 'Tab nhân vật'); await stepAsync(10);
    await press('Escape');
    await stepAsync(5);
    expectScene('menu', 'Esc từ cửa hàng');
  }

  // ---- Menu → Bảng xếp hạng ----
  click('#overlay [data-act="lb"]', 'Xếp hạng');
  await stepAsync(10);
  if (expectScene('leaderboard')) { await press('Escape'); await stepAsync(5); expectScene('menu', 'Esc từ bảng xếp hạng'); }

  // ---- Nút cảm ứng ----
  // Không cần step(): OG.Input cập nhật OG.Input.keys ngay trong listener pointerdown/pointerup.
  const touchRight = doc.querySelector('#mobileControls [data-key="right"]');
  touchRight.dispatchEvent(new D.FakeEvent('pointerdown', {}));
  check(OG.Input.keys.right === true, 'Nút cảm ứng ▶ không giữ phím right');
  touchRight.dispatchEvent(new D.FakeEvent('pointerup', {}));
  check(OG.Input.keys.right === false, 'Nút cảm ứng ▶ không nhả phím right');
}

// ---- CHƠI: chiến dịch đầy đủ 4 màn + 4 trùm ----
async function playCampaign() {
  stage = 'campaign';
  click('#overlay [data-act="play"]', 'CHƠI');
  await stepAsync(10);
  expectScene('worldmap', 'CHƠI → bản đồ');
  check(evLast['game:start'] && evLast['game:start'].charId === 'oggy', 'Không phát game:start');

  // Bảng dữ liệu kịch bản [màn, trùm]: thêm màn vào chiến dịch = thêm một dòng ở đây (data-driven test).
  const campaign = [['kitchen', 'deedee'], ['garden', 'marky'], ['roof', 'joey'], ['lair', 'trio']];
  for (let i = 0; i < campaign.length; i++) {
    const [levelId, bossId] = campaign[i];
    if (!(await enterFromMap(levelId))) { OG.Game.startLevel(levelId); await stepAsync(2); }
    if (levelId === 'kitchen') await doubleJumpCheck();
    await playLevel(levelId, { pause: levelId === 'garden' });
    if (!(await waitScene('boss', 120, 'qua cửa ' + levelId))) break;
    await fightBoss(bossId);
    const expectNext = levelId === 'lair' ? 'victory' : 'worldmap';
    await waitScene(expectNext, 240, 'sau trận ' + bossId);
    check(evLast['level:complete'] && evLast['level:complete'].levelId === levelId, 'Không có level:complete cho ' + levelId);
    if (expectNext === 'worldmap') { step(120); }
  }
}

// ---- Chiến thắng → nhập tên → lưu điểm → bảng xếp hạng → quay lại ----
async function victoryFlow() {
  stage = 'victory';
  if (cur() === 'victory') {
    check(evCount['game:victory'] === 1, 'game:victory phát ' + (evCount['game:victory'] | 0) + ' lần');
    await stepAsync(30);
    const box = $('#overlay .social-result');
    check(!!box, 'Panel chiến thắng thiếu khối Social (mountResult)');
    const input = $('#overlay .social-result input');
    if (check(!!input, 'Thiếu ô nhập tên')) {
      // Tên có ký tự HTML: kiểm tra game LƯU nguyên văn nhưng HIỂN THỊ đã escape (chống chèn HTML/XSS).
      input.value = 'Tester <b>&';
      click('#overlay .social-result .social-save', 'LƯU ĐIỂM');
      await stepAsync(2);
      const lb = OG.Social.getLeaderboard(10);
      check(lb.length >= 1 && lb[0].name === 'Tester <b>&', 'Leaderboard chưa lưu tên/điểm');
      check($('#overlay').innerHTML.indexOf('Tester <b>') < 0, 'Tên người chơi chưa được escape khi hiển thị');
    }
    click('#overlay .social-share', 'CHIA SẺ'); await stepAsync(5); await flush(); await stepAsync(2);
    check(evCount['social:share'] >= 1, 'Chia sẻ không phát social:share');
    click('#overlay .social-download', 'TẢI ẢNH'); await stepAsync(2);
    click('#overlay .social-open-board', 'BẢNG XẾP HẠNG'); await stepAsync(10);
    if (expectScene('leaderboard', 'từ panel chiến thắng')) {
      click(findButton(/QUAY LẠI/), 'QUAY LẠI'); await stepAsync(10);
      expectScene('victory', 'quay lại từ bảng xếp hạng');
      check(OG.Social.getLeaderboard(10).length === 1, 'Điểm bị lưu trùng khi quay lại panel kết quả');
    }
    click('#overlay [data-act="menu"]', 'VỀ MENU'); await stepAsync(10);
    expectScene('menu', 'victory → menu');
  }
}

// ---- Màn phụ + nhân vật khác ----
async function extraLevelsFlow() {
  stage = 'extra';
  // Sửa thẳng OG.Save.data để mở khoá nhân vật: nhanh hơn chơi tới lúc mở khoá, và luồng mở khoá đã có check riêng.
  OG.Save.data.unlockedChars = ['oggy', 'jack', 'olivia'];
  OG.Save.commit();
  const extras = [['basement', 'jack', 'oggy_chef'], ['bathroom', 'olivia', null], ['attic', 'oggy', 'oggy_super']];
  for (const [levelId, charId, skin] of extras) {
    stage = 'extra:' + levelId + ':' + charId;
    check(OG.Progress.isUnlocked(levelId), 'Màn phụ ' + levelId + ' chưa mở sau khi xong màn yêu cầu');
    OG.Save.data.selectedChar = charId;
    if (skin) { OG.Save.data.ownedSkins.push(skin); OG.Save.data.equippedSkins[charId] = skin; }
    OG.Game.newRun();
    OG.Scenes.go('worldmap');
    await stepAsync(5);
    if (!(await enterFromMap(levelId))) { OG.Game.startLevel(levelId); await stepAsync(2); }
    check(OG.Level.state.player.charId === charId, 'Nhân vật trong màn là ' + OG.Level.state.player.charId + ', mong đợi ' + charId);
    if (charId === 'jack') check(OG.Level.state.player.shield >= 1, 'Jack không có khiên đặc tính');
    await playLevel(levelId, { freeFrames: 180 });
    await waitScene('worldmap', 240, 'xong màn phụ ' + levelId);
  }
}

// ---- Game over → panel kết quả → thử lại ----
async function gameOverFlow() {
  stage = 'gameover';
  OG.Save.data.selectedChar = 'oggy';
  OG.Scenes.go('menu');
  await stepAsync(5);
  click('#overlay [data-act="play"]', 'CHƠI');
  await stepAsync(5);
  OG.Game.startLevel('kitchen');
  await stepAsync(30);
  if (expectScene('level')) {
    const p = OG.Level.state.player;
    // Rơi khỏi màn hình / chạm gián tới khi hết mạng.
    // Xoá inv (giây bất tử sau khi bị thương) và khiên trước mỗi đòn để đòn nào cũng trúng.
    for (let i = 0; i < 20 && cur() === 'level'; i++) {
      p.inv = 0; p.shield = 0;
      OG.Player.hurt(p, 'enemy');
      step(2);
    }
    await waitScene('gameover', 60, 'hết mạng');
    check(evCount['game:over'] === 1, 'game:over phát ' + (evCount['game:over'] | 0) + ' lần');
    check(!!$('#overlay .social-result'), 'Panel game over thiếu khối Social');
    await stepAsync(30);
    click('#overlay [data-act="again"]', 'THỬ LẠI');
    await stepAsync(10);
    expectScene('worldmap', 'thử lại sau game over');
  }
}

// ---- Quay lại menu, xoá dữ liệu (save:reset) và chạy lại boot ----
async function resetFlow() {
  stage = 'reset';
  OG.Scenes.go('menu'); await stepAsync(5);
  OG.Save.reset();
  OG.Progress.init();
  await stepAsync(30);
  OG.Scenes.go('worldmap'); await stepAsync(60);
  OG.Scenes.go('menu'); await stepAsync(10);

  // Chờ timer còn treo (toast...) chạy hết.
  for (let i = 0; i < 300; i++) step(1);
  await flush();
}

// ---------------------------------------------------------------------------
// Kiểm tra hồi quy (QA): các lỗi đã sửa + luồng ít được đi qua
// ---------------------------------------------------------------------------
// 💡 Khái niệm: regression test (kiểm thử hồi quy) — mỗi lỗi đã sửa có MỘT check đánh số bên dưới, để lỗi
//   cũ không quay lại khi ai đó sửa code sau này. Gặp lỗi mới? Viết check tái hiện nó (thấy ĐỎ) rồi mới sửa
//   game (thấy XANH) — đó là cách chắc chắn nhất để biết mình đã sửa đúng chỗ.

// Tổng số listener DOM đang gắn trên window + document (đọc thẳng _listeners của DOM giả).
function listenerCount() {
  const count = (t) => Object.values(t._listeners || {}).reduce((n, arr) => n + arr.length, 0);
  return count(winTarget) + count(doc);
}
// Số setInterval còn sống — nhạc nền dùng đúng 1 interval làm sequencer; nhiều hơn = nhạc phát chồng.
function intervalCount() { return timers.filter((x) => x.every).length; }

// 13 check chạy nối tiếp (mục 1–3 dùng chung một màn kitchen). Mỗi mục: đặt stage → dựng tình huống → khẳng định.
async function qaChecks() {
  // 1) Thời gian tạm dừng KHÔNG được tính vào thời gian màn (nhiệm vụ "về đích dưới X giây").
  stage = 'qa:pause-time';
  OG.Scenes.go('menu'); await stepAsync(3);
  OG.Game.newRun();
  OG.Game.startLevel('kitchen'); await stepAsync(2);
  if (expectScene('level')) {
    step(60);
    const t1 = OG.Game.stage.playTime;
    await press('Escape');
    expectScene('pause', 'Esc để đo thời gian');
    step(600); // 10 giây đứng ở màn tạm dừng
    await press('Escape');
    expectScene('level', 'Esc để chơi tiếp');
    const t2 = OG.Game.stage.playTime;
    check(t2 - t1 < 1, 'Thời gian màn vẫn chạy khi tạm dừng (' + t1.toFixed(1) + 's → ' + t2.toFixed(1) + 's)');
    check(Math.abs(OG.Game.hud.time - t2) < 0.05, 'Đồng hồ HUD lệch với thời gian màn');
    const q = (OG.Quests.getHudLines('kitchen') || []).find((x) => /_auto_time$/.test(x.id) || /giây/.test(x.text));
    check(q && !q.failed, 'Nhiệm vụ thời gian bị đánh trượt vì thời gian tạm dừng');

    // 2) Pause → "Chơi lại màn" (từ trận trùm) → vào lại màn từ đầu.
    stage = 'qa:restart';
    OG.Game.finishStage('kitchen'); await stepAsync(5);
    if (expectScene('boss', 'vào trùm để thử chơi lại')) {
      await press('Escape');
      click('#overlay [data-act="restart"]', 'Chơi lại màn'); await stepAsync(5);
      expectScene('level', 'chơi lại màn từ trận trùm');
      check(OG.Level.state && OG.Level.state.level.id === 'kitchen' && OG.Game.stage.pizzas === 0, 'Chơi lại màn không đặt lại màn kitchen');
    }

    // 3) Pause → Bản đồ → Về menu: không kẹt scene.
    stage = 'qa:pause-nav';
    await press('Escape');
    click('#overlay [data-act="map"]', 'Bản đồ'); await stepAsync(5);
    expectScene('worldmap', 'pause → bản đồ');
    check(!OG.DOM.isPanelOpen(), 'Panel tạm dừng còn mở trên bản đồ');
    await press('Escape'); await stepAsync(3);
    expectScene('menu', 'Esc trên bản đồ → menu');
  }

  // 4) Tự tạm dừng khi rời tab (visibilitychange) và mất focus (blur).
  stage = 'qa:autopause';
  OG.Game.newRun(); OG.Game.startLevel('garden'); await stepAsync(3);
  doc.hidden = true; doc.dispatchEvent(new D.FakeEvent('visibilitychange', {})); doc.hidden = false;
  await stepAsync(2);
  expectScene('pause', 'ẩn tab khi đang chơi');
  OG.Scenes.pop(); await stepAsync(2);
  win.dispatchEvent(new D.FakeEvent('blur', {})); await stepAsync(2);
  expectScene('pause', 'mất focus cửa sổ');
  OG.Scenes.pop(); await stepAsync(2);

  // 5) Nhạc nền đổi theo scene, chỉ một bộ hẹn giờ sequencer.
  stage = 'qa:audio';
  if (OG.Audio.isReady()) {
    check(OG.Audio.currentTrack === 'garden', 'Nhạc trong màn garden là ' + OG.Audio.currentTrack);
    check(intervalCount() <= 1, 'Có ' + intervalCount() + ' setInterval đang chạy (nhạc phát chồng?)');
    OG.Game.finishStage('garden'); await stepAsync(5);
    check(OG.Audio.currentTrack === 'boss', 'Nhạc trận trùm là ' + OG.Audio.currentTrack);
    check(intervalCount() <= 1, 'Nhiều sequencer chạy cùng lúc khi vào trùm');
  } else warn('AudioContext giả chưa sẵn sàng — bỏ qua kiểm tra nhạc');

  // 6) Thua trong trận trùm → game over → nhạc gameover → về menu.
  stage = 'qa:boss-gameover';
  if (cur() === 'boss') {
    const p = OG.BossScene.getPlayer();
    for (let i = 0; i < 20 && cur() === 'boss'; i++) { p.inv = 0; p.shield = 0; OG.Player.hurt(p, 'boss'); step(2); }
    await waitScene('gameover', 30, 'hết mạng trong trận trùm');
    if (OG.Audio.isReady()) check(OG.Audio.currentTrack === 'gameover', 'Nhạc game over là ' + OG.Audio.currentTrack);
    click('#overlay [data-act="menu"]', 'Về menu'); await stepAsync(5);
    expectScene('menu', 'game over → menu');
    if (OG.Audio.isReady()) check(OG.Audio.currentTrack === 'menu', 'Nhạc menu là ' + OG.Audio.currentTrack);
  }

  // 7) Kết quả chiến thắng ghi đúng màn cuối (không phải màn phụ đăng ký sau nó).
  stage = 'qa:victory-level';
  const vr = evLast['game:victory'] && evLast['game:victory'].result;
  check(vr && vr.levelId === 'lair', 'Kết quả chiến thắng ghi màn ' + (vr && vr.levelId) + ' thay vì lair');

  // 8) Toast nhiệm vụ không bị lặp (Menus + Quests cùng hiện).
  stage = 'qa:quest-toast';
  const toasts = [];
  const offToast = OG.Events.on('ui:toast', (e) => toasts.push(e.text));
  OG.Events.emit('quest:complete', { questId: 'qa_fake', reward: 1, text: 'QA kiểm tra' });
  step(2);
  offToast();
  check(toasts.length === 0, 'quest:complete tạo toast trùng ngoài hàng đợi của Quests: ' + JSON.stringify(toasts));

  // 9) Vật phẩm cửa hàng có tác dụng: khiên chặn 1 đòn, nam châm hút đồ, tim +1 mạng.
  stage = 'qa:items';
  OG.Save.addCoins(500, 'test');
  ['shield', 'magnet', 'heart'].forEach((id) => check(OG.Shop.buy(id), 'Không mua được ' + id));
  OG.Save.data.selectedChar = 'oggy';
  const run = OG.Game.newRun();
  check(run.lives === OG.Config.START_LIVES + 1, 'Tim dự phòng không cộng mạng (lives=' + run.lives + ')');
  OG.Game.startLevel('kitchen'); await stepAsync(3);
  if (expectScene('level')) {
    const p = OG.Level.state.player;
    check(p.shield >= 1 && p.magnet > 0, 'Khiên/nam châm không áp vào người chơi');
    const lives = OG.Game.run.lives;
    p.inv = 0; OG.Player.hurt(p, 'enemy');
    check(OG.Game.run.lives === lives && p.shield === 0, 'Khiên không chặn được đòn');
    const it = OG.Level.state.items.find((x) => !x.got);
    if (it) {
      p.x = it.x - 120; p.y = it.y - p.h / 2; p.vx = 0;
      const d0 = Math.abs(it.x - (p.x + p.w / 2));
      OG.Collectibles.touches(it, p, 0.1, p.magnet);
      check(Math.abs(it.x - (p.x + p.w / 2)) < d0, 'Nam châm không hút vật phẩm');
    }
  }

  // 10) Giữ phím ←/→ qua lúc đổi scene (màn → trùm): phím lặp vẫn giữ được hướng đi.
  stage = 'qa:held-key';
  keyDown('ArrowRight');
  OG.Input.reset(); // giống lúc Scenes.go()
  (doc.activeElement || doc.body).dispatchEvent(new D.FakeEvent('keydown', { code: 'ArrowRight', key: 'ArrowRight', repeat: true }));
  check(OG.Input.keys.right === true, 'Giữ → qua lúc đổi scene thì nhân vật đứng im');
  (doc.activeElement || doc.body).dispatchEvent(new D.FakeEvent('keydown', { code: 'Escape', key: 'Escape', repeat: true }));
  check(!OG.Input.pressed('pause'), 'Phím Esc lặp gây tạm dừng liên tục');
  keyUp('ArrowRight'); keyUp('Escape'); step(1);

  // 11) Enter khi đang focus một nút phụ trong panel không ép bấm nút chính.
  stage = 'qa:enter-focus';
  OG.Scenes.go('leaderboard', { back: 'menu' }); await stepAsync(3);
  const clearBtn = findButton(/XOÁ BẢNG/);
  if (check(!!clearBtn, 'Thiếu nút XOÁ BẢNG')) {
    clearBtn.focus();
    await press('Enter');
    expectScene('leaderboard', 'Enter trên nút XOÁ BẢNG không được quay lại');
  }
  OG.Scenes.go('menu'); await stepAsync(3);

  // 12) Tiến độ & xu được lưu bền vững (đọc lại từ localStorage).
  stage = 'qa:persist';
  OG.Save.commit();
  const before = { coins: OG.Save.getCoins(), done: OG.Progress.isCompleted('lair'), lb: OG.Social.getLeaderboard(10).length };
  const reloaded = JSON.parse(storage.getItem('oggyAdventure.save.v1') || '{}');
  check(reloaded.coins === before.coins, 'Xu không được lưu (' + reloaded.coins + ' ≠ ' + before.coins + ')');
  check(!!(reloaded.progress && reloaded.progress.levels.lair && reloaded.progress.levels.lair.completed) === before.done, 'Tiến độ màn không được lưu');
  check(((reloaded.ext && reloaded.ext.social && reloaded.ext.social.leaderboard) || []).length === before.lb, 'Bảng xếp hạng không được lưu');

  // 13) Không rò rỉ listener khi chơi lại nhiều lượt (menu → bản đồ → màn → game over → thử lại).
  // 💡 Khái niệm: phát hiện memory leak bằng cách ĐẾM. Chụp số listener trước, lặp vòng chơi 3 lần, đếm lại:
  //   phải bằng nhau. Scene nào addEventListener trong enter() mà quên gỡ trong exit() sẽ làm số này tăng.
  stage = 'qa:leaks';
  const l0 = listenerCount();
  for (let k = 0; k < 3; k++) {
    OG.Scenes.go('menu'); await stepAsync(2);
    click('#overlay [data-act="play"]', 'CHƠI'); await stepAsync(3);
    OG.Game.startLevel('kitchen'); await stepAsync(3);
    const p = OG.Level.state.player;
    for (let i = 0; i < 20 && cur() === 'level'; i++) { p.inv = 0; p.shield = 0; OG.Player.hurt(p, 'enemy'); step(2); }
    await waitScene('gameover', 30, 'game over lượt ' + k);
    click('#overlay [data-act="again"]', 'THỬ LẠI'); await stepAsync(3);
  }
  OG.Scenes.go('menu'); await stepAsync(3);
  check(listenerCount() === l0, 'Số listener window/document tăng sau 3 lượt chơi lại: ' + l0 + ' → ' + listenerCount());
  check(intervalCount() <= 1, 'Còn ' + intervalCount() + ' setInterval sau khi chơi lại');
}

// ---------------------------------------------------------------------------
// v2: Hành trình học tập (docs/STORY.md) — chạy ở chế độ 'kid'
// ---------------------------------------------------------------------------
const JOURNEYS = ['home', 'vietnam', 'world', 'science'];

// Đọc HẾT một truyện tranh bằng Enter (vẽ đủ mọi khung → bắt lỗi vẽ); quá dài thì Esc.
async function readComic(maxPresses) {
  const id = OG.Scenes.get('comic') && OG.Scenes.get('comic').p ? OG.Scenes.get('comic').p.comicId : '?';
  for (let i = 0; i < (maxPresses || 80) && cur() === 'comic'; i++) { step(2); await press('Enter'); }
  if (cur() === 'comic') { warn('Truyện ' + id + ' quá dài, bấm Esc'); await press('Escape'); await stepAsync(2); }
}

// Đi qua mọi truyện tranh (đọc hết) cho tới khi tới một trong các scene mong đợi.
async function skipComics(targets, maxLoops) {
  for (let i = 0; i < (maxLoops || 20); i++) {
    if (targets.includes(cur())) return true;
    if (cur() === 'comic') await readComic(); else step(5);
  }
  if (!targets.includes(cur())) fail('Chờ ' + targets.join('|') + ' thất bại — đang ở ' + safeScene());
  return targets.includes(cur());
}

// Trả lời câu đố đang mở: sai 1 lần (không bị phạt) rồi đúng.
// mode 'arrows' = hợp đồng phím (chọn bắt đầu ở 0, → để sang, Enter để chọn); 'digits' = phím số 1–3.
async function answerQuizFlow(mode) {
  if (!expectScene('quiz', 'cổng câu đố')) return false;
  const top = OG.Scenes.get('quiz');
  const q = top.q, n = q.choices.length, ans = q.answer, wrong = (ans + 1) % n;
  const lives = OG.Game.run.lives;
  step(5);
  if (mode === 'digits') await press('Digit' + (wrong + 1));
  else { for (let i = 0; i < wrong; i++) await press('ArrowRight'); await press('Enter'); }
  check(evLast['quiz:answer'] && evLast['quiz:answer'].correct === false, 'Trả lời sai không phát quiz:answer{correct:false} (' + q.id + ')');
  check(cur() === 'quiz' && OG.Game.run.lives === lives, 'Trả lời sai bị phạt hoặc đóng câu đố (' + q.id + ')');
  const passes = evCount['quiz:pass'] || 0;
  step(30); // chờ hiệu ứng rung khi sai
  if (mode === 'digits') await press('Digit' + (ans + 1));
  else { for (let i = 0; i < (ans - wrong + n) % n; i++) await press('ArrowRight'); await press('Enter'); }
  check((evCount['quiz:pass'] || 0) === passes + 1, 'Trả lời đúng không phát quiz:pass (' + q.id + ')');
  step(40);
  await press('Enter');
  await stepAsync(2);
  return expectScene('level', 'đóng câu đố sau khi đúng');
}

// Xử lý các scene chồng lên màn chơi (thẻ mới, truyện chen giữa màn) cho tới khi về lại 'level'.
async function settleOverlays() {
  for (let i = 0; i < 12; i++) {
    const c = cur();
    if (c === 'card') { step(30); await press('Enter'); await stepAsync(2); }
    else if (c === 'comic') await readComic();
    else return c;
  }
  return cur();
}

// Chơi hành trình từ đầu tới cuối: chọn → truyện mở đầu → bản đồ (canvas) → MỌI màn (câu đố sai rồi đúng)
// → trùm mỗi khu (kèm truyện trước trận) → truyện kết → journeyEnd → bảng xếp hạng → sổ tay.
async function playJourney(jid, opts) {
  opts = opts || {};
  stage = 'journey:' + jid;
  OG.Scenes.go('journeySelect', { back: 'menu' }); await stepAsync(3);
  if (!click('#overlay [data-act="journey"][data-arg="' + jid + '"]', 'chọn hành trình ' + jid)) OG.Story.startJourney(jid);
  await stepAsync(3);
  check(evLast['journey:select'] && evLast['journey:select'].journeyId === jid, 'Không phát journey:select cho ' + jid);
  check(OG.Game.run && OG.Game.run.journeyId === jid, 'Run không gắn journeyId');
  if (expectScene('comic', 'truyện mở đầu ' + jid)) {
    const ends = evCount['comic:end'] || 0;
    if (opts.skipIntro) { // kiểm tra nút bỏ qua (Esc) một lần
      step(20); await press('Enter'); step(20);
      await press('Escape'); await stepAsync(3);
      check((evCount['comic:end'] || 0) === ends + 1 && evLast['comic:end'].skipped, 'comic:end{skipped} không phát khi bỏ qua truyện');
    } else {
      await readComic();
      check((evCount['comic:end'] || 0) === ends + 1, 'comic:end không phát khi đọc hết truyện');
    }
  }
  if (!(await skipComics(['journeyMap']))) return;
  const JM = OG.World.journeyMap;
  check(JM && JM.isActive(), 'Bản đồ hành trình không phải bản canvas của src/world');
  if (opts.mapTaps && JM) await journeyMapTaps(jid);

  const ids = OG.Journeys.levelIds(jid);
  for (let i = 0; i < ids.length; i++) {
    const levelId = ids[i];
    stage = 'journey:' + jid + ':' + levelId;
    if (!expectScene('journeyMap', 'bản đồ trước màn ' + levelId)) return;
    check(JM.selected() === levelId, 'Bản đồ không chọn sẵn màn kế tiếp ' + levelId + ' (đang chọn ' + JM.selected() + ')');
    step(70); // Oggy đi bộ tới nút kế tiếp
    await press('Enter'); // ▶ CHƠI màn đang chọn
    await stepAsync(3);
    if (!(await skipComics(['level']))) return;
    const st = OG.Level.state;
    check(st.level.id === levelId && st.journeyId === jid, 'Màn hành trình sai: ' + st.level.id + ' (mong đợi ' + levelId + ')');
    check(OG.Game.hud.pages && OG.Game.hud.pages.total === (st.level.pages || []).length, 'HUD không có số trang sách');
    const pagesPill = doc.getElementById('pages');
    check(pagesPill && pagesPill.style.display !== 'none', 'HUD DOM không hiện số trang sách 📖');
    if (i === 0) {
      check(st.learn && st.learn.pages.length > 0, 'Màn ' + levelId + ' không có trang sách (OG.Learn hook)');
      if (opts.pauseToMap) await pauseToMap(levelId);
      await detailedLevelChecks(jid, levelId);
    } else {
      await collectPages(jid);
    }
    await finishJourneyLevel(jid, levelId, i === 0 ? 'arrows' : 'digits');
    if (errors.length > 20) return; // đã hỏng nặng, dừng sớm
  }
  // Kết thúc hành trình
  stage = 'journey:' + jid + ':end';
  if (expectScene('journeyEnd', 'xong hành trình')) {
    check(evLast['journey:complete'] && evLast['journey:complete'].journeyId === jid, 'Không phát journey:complete');
    check(OG.Journeys.isComplete(jid), 'OG.Journeys.isComplete(' + jid + ') = false sau màn cuối');
    check(!!$('#overlay .social-result'), 'journeyEnd chưa gắn khối kết quả OG.Social (lưu điểm / chia sẻ)');
    if (click('#end_lb', 'Bảng xếp hạng (journeyEnd)')) {
      await stepAsync(3);
      expectScene('leaderboard', 'journeyEnd → bảng xếp hạng');
      await press('Escape'); await stepAsync(3);
      expectScene('journeyEnd', 'bảng xếp hạng → quay lại journeyEnd');
    }
  }
  // Sổ tay
  OG.Learn.openNotebook(jid, cur(), { journeyId: jid });
  await stepAsync(3);
  if (expectScene('notebook', 'mở sổ tay')) {
    await press('Enter'); await stepAsync(2);
    expectScene('card', 'mở thẻ trong sổ tay');
    step(30); await press('Escape'); await stepAsync(2);
    expectScene('notebook', 'đóng thẻ về sổ tay');
    await press('Escape'); await stepAsync(2);
    check(cur() !== 'notebook', 'Esc không rời sổ tay');
  }
}

// Chạm trên bản đồ canvas: nút 📒 Sổ tay → notebook → Esc về bản đồ; chạm nút màn đang khoá → vẫn ở bản đồ.
async function journeyMapTaps(jid) {
  const cv = doc.getElementById('game');
  const tap = async (x, y) => {
    cv.dispatchEvent(new D.FakeEvent('pointerdown', { clientX: x, clientY: y }));
    step(2);
    win.dispatchEvent(new D.FakeEvent('pointerup', {}));
    await stepAsync(2);
  };
  await tap(885, 486); // nút 📒 Sổ tay
  if (expectScene('notebook', 'chạm 📒 trên bản đồ hành trình')) {
    await press('Escape'); await stepAsync(3);
    expectScene('journeyMap', 'sổ tay → bản đồ hành trình');
  }
  const locked = OG.World.journeyMap.getNodes().find((n) => !n.open && !n.boss && n.x > 0 && n.x < OG.W);
  if (locked) {
    await tap(locked.x, locked.y);
    expectScene('journeyMap', 'chạm màn đang khoá');
  }
  // Mũi tên ← → đổi màn rồi trả về màn đầu tiên.
  await press('ArrowRight'); await press('ArrowLeft');
  check(OG.World.journeyMap.selected() === OG.Journeys.firstIncomplete(jid), 'Mũi tên trên bản đồ hành trình làm lệch màn chọn');
}

async function pauseToMap(levelId) {
  await press('Escape');
  if (expectScene('pause', 'Esc trong màn hành trình')) {
    click('#overlay [data-act="map"]', 'Bản đồ (hành trình)'); await stepAsync(3);
    expectScene('journeyMap', 'pause → bản đồ hành trình');
    check(OG.World.journeyMap.selected() === levelId, 'Bản đồ hành trình không giữ màn đang chơi');
    await press('Enter'); await stepAsync(3);
    await skipComics(['level']);
  }
}

// Màn đầu mỗi hành trình: người dẫn đường, rơi vực (kid), trang sách → thẻ, hết mạng → hồi sinh + trợ giúp.
async function detailedLevelChecks(jid, levelId) {
  const st = OG.Level.state, p = st.player;
  const spot = (st.guideSpots || [])[0];
  if (spot) {
    const talks = evCount['guide:talk'] || 0;
    p.x = spot.x - 40; p.y = OG.FLOOR_Y - p.h - 1; p.vy = 0;
    step(3);
    check((evCount['guide:talk'] || 0) > talks, 'Đến gần người dẫn đường không phát guide:talk');
    await press('KeyE');
    check((evCount['guide:talk'] || 0) > talks + 1, 'Nhấn E gần người dẫn đường không sang câu tiếp');
  }
  // Rơi vực (kid): không mất mạng, hồi về chỗ cũ.
  const lives0 = OG.Game.run.lives;
  p.x = 200; p.y = OG.FLOOR_Y - p.h - 1; p.vy = 0; step(5);
  p.y = OG.H + 100; p.vy = 300; step(2);
  check(OG.Game.run.lives === lives0 && evLast['player:respawn'] && evLast['player:respawn'].cause === 'fall', 'Rơi vực ở chế độ kid vẫn mất mạng');
  check(p.y < OG.H, 'Không hồi về chỗ đứng an toàn sau khi rơi');
  await collectPages(jid);
  check(evLast['page:collect'] && evLast['page:collect'].journeyId === jid, 'Không phát page:collect');
  // Hết mạng (kid): hồi đầy mạng tại checkpoint; thua 2 lần -> trợ giúp.
  const assists = evCount['assist:on'] || 0;
  for (let k = 0; k < 2; k++) {
    for (let i = 0; i < 12 && OG.Game.run.lives > 0 && cur() === 'level'; i++) {
      const before = OG.Game.run.lives;
      p.inv = 0; p.shield = 0; OG.Player.hurt(p, 'enemy'); step(1);
      if (OG.Game.run.lives > before) break; // vừa hồi đầy mạng
    }
    await stepAsync(2);
    check(cur() === 'level' && OG.Game.run.lives > 0, 'Hết mạng ở chế độ kid lại game over (' + safeScene() + ')');
  }
  check(evLast['player:respawn'] && evLast['player:respawn'].cause === 'softfail', 'Không có player:respawn{softfail}');
  check((evCount['assist:on'] || 0) > assists && OG.Difficulty.isAssist(levelId), 'Thua 2 lần không bật trợ giúp');
}

// Nhặt mọi trang sách (thẻ mới → đóng thẻ).
async function collectPages(jid) {
  const st = OG.Level.state, p = st.player;
  for (const pg of st.learn.pages) {
    if (pg.got) continue;
    const was = OG.Learn.hasCard(jid, pg.card);
    p.x = pg.x - p.w / 2; p.y = pg.y - p.h / 2; p.vx = 0; p.vy = 0; p.inv = 2;
    step(1);
    check(OG.Learn.hasCard(jid, pg.card), 'Nhặt trang không mở khoá thẻ ' + pg.card);
    if (!was) check(cur() === 'card' || cur() === 'comic', 'Thẻ mới ' + pg.card + ' không mở scene card');
    await settleOverlays();
    if (!expectScene('level', 'đóng thẻ ' + pg.card)) return;
  }
}

// Phần còn lại của màn: pizza + xu → cổng câu đố giữa màn → EXIT (+ câu đố) → (truyện trước trùm) → trùm → truyện → bản đồ.
async function finishJourneyLevel(jid, levelId, quizMode) {
  const st = OG.Level.state, p = st.player;
  // Nhặt đồ theo từng đoạn: đồ TRƯỚC cổng → qua cổng (câu đố sai rồi đúng) → đồ sau cổng (giống bé chơi thật).
  const gates = st.learn.gates.filter((g) => g.x !== 'exit').sort((a, b) => a.x - b.x);
  const grab = async (maxX) => {
    for (const it of st.items) {
      if (it.got || it.x >= maxX) continue;
      p.x = it.x - p.w / 2; p.y = it.y - p.h / 2; p.vx = 0; p.vy = 0; p.inv = 2;
      step(1);
      if ((await settleOverlays()) !== 'level') { fail('Rời màn khi đang nhặt đồ: ' + safeScene()); return false; }
    }
    return true;
  };
  for (const g of gates) {
    if (!(await grab(g.x - 30))) return;
    p.x = g.x - 60; p.y = OG.FLOOR_Y - p.h - 1; p.vy = 0; p.inv = 2;
    if ((await settleOverlays()) !== 'level') break;
    keyDown('ArrowRight');
    for (let i = 0; i < 120 && cur() === 'level'; i++) step(1);
    keyUp('ArrowRight'); await stepAsync(1);
    if (cur() === 'comic') { await settleOverlays(); p.x = g.x - 60; keyDown('ArrowRight'); for (let i = 0; i < 120 && cur() === 'level'; i++) step(1); keyUp('ArrowRight'); await stepAsync(1); }
    check(p.x + p.w <= g.x + 1, 'Cổng câu đố giữa màn không chặn đường (' + levelId + ')');
    await answerQuizFlow(quizMode);
    check(g.open, 'Cổng không mở sau khi trả lời đúng (' + levelId + ')');
  }
  if (!(await grab(Infinity))) return;
  check(OG.Game.stage.pizzas >= st.level.goal, 'Chưa đủ pizza ở ' + levelId + ': ' + OG.Game.stage.pizzas + '/' + st.level.goal);
  // EXIT (có thể có câu đố ở cửa), truyện chen giữa, truyện trước trùm, trùm.
  const L = OG.Journeys.getLevel(levelId);
  const passes = evCount['quiz:pass'] || 0;
  let fought = false;
  for (let k = 0; k < 30; k++) {
    const c = cur();
    if (c === 'journeyMap' || c === 'journeyEnd') break;
    if (c === 'level') {
      p.x = st.exit.x + 10; p.y = OG.FLOOR_Y - p.h - 1; p.vy = 0; p.vx = 0; p.inv = 2;
      for (let i = 0; i < 90 && cur() === 'level'; i++) { keepAlive(); step(1); }
      await flush();
    } else if (c === 'quiz') await answerQuizFlow(quizMode);
    else if (c === 'card' || c === 'comic') await settleOverlays();
    else if (c === 'boss') {
      const A = OG.BossScene.getArena();
      check(A.journeyId === jid && A.theme === L.theme, 'Đấu trường trùm không theo chủ đề khu (' + levelId + ')');
      await fightBoss(L.boss, { freeFrames: 120, noPause: true });
      fought = true;
      stage = 'journey:' + jid + ':' + levelId;
      for (let i = 0; i < 150 && cur() === 'boss'; i++) step(1);
    } else step(5);
  }
  if (st.learn.gates.some((g) => g.x === 'exit')) check((evCount['quiz:pass'] || 0) > passes, 'Không qua được câu đố ở cửa EXIT (' + levelId + ')');
  const bossIntro = L.bossIntro;
  if (L.boss && OG.Bosses.has(L.boss)) {
    check(fought, 'Màn cuối khu ' + levelId + ' không vào trận trùm ' + L.boss);
    if (bossIntro) check(OG.Story.hasSeen(jid, bossIntro), 'Truyện trước trận trùm "' + bossIntro + '" chưa chiếu');
  }
  if (!(await skipComics(['journeyMap', 'journeyEnd'], 40))) return;
  check(evLast['level:complete'] && evLast['level:complete'].journeyId === jid && evLast['level:complete'].levelId === levelId, 'level:complete sai cho ' + levelId);
  check(OG.Progress.isCompleted(levelId), 'Tiến độ màn hành trình không được lưu: ' + levelId);
  const area = OG.Journeys.getArea(jid, L.areaId) || {};
  if (L.isLastOfArea && area.outro) check(OG.Story.hasSeen(jid, area.outro), 'Truyện kết khu "' + area.outro + '" chưa chiếu');
}

// Menu → Chọn chế độ (nhớ lựa chọn) → Chọn hành trình; Cài đặt có chế độ chơi; Sổ tay khám phá.
async function menuFlowChecks() {
  stage = 'journey:menu';
  OG.Scenes.go('menu'); await stepAsync(3);
  const hero = $('#overlay [data-act="journey"]');
  check(hero && hero.hasAttribute('data-primary'), 'Nút PHIÊU LƯU HỌC TẬP phải là nút chính của menu');
  check(!!$('#overlay [data-act="notebook"]'), 'Menu chính thiếu nút Sổ tay khám phá');
  if (click('#overlay [data-act="journey"]', 'PHIÊU LƯU HỌC TẬP')) {
    await stepAsync(3);
    if (expectScene('modeSelect', 'menu → chọn chế độ')) {
      check(!!$('#overlay [data-act="mode"][data-arg="kid"].is-on'), 'Chọn chế độ không sáng sẵn chế độ đã nhớ (kid)');
      click('#overlay [data-act="mode"][data-arg="challenge"]', 'Thử thách'); await stepAsync(3);
      expectScene('journeySelect', 'chọn chế độ → chọn hành trình');
      check(OG.Difficulty.mode() === 'challenge' && OG.Save.data.settings.difficulty === 'challenge', 'Chọn Thử thách không được lưu');
      await press('Escape'); await stepAsync(2);
      expectScene('modeSelect', 'Esc từ chọn hành trình → chọn chế độ');
      check(!!$('#overlay [data-act="mode"][data-arg="challenge"][data-primary]'), 'Chọn chế độ không nhớ lựa chọn trước (challenge)');
      click('#overlay [data-act="mode"][data-arg="kid"]', 'Bé chơi'); await stepAsync(3);
      expectScene('journeySelect', 'Bé chơi → chọn hành trình');
      check(OG.Difficulty.mode() === 'kid', 'Chọn Bé chơi không đổi độ khó');
      await press('Escape'); await stepAsync(2);
      await press('Escape'); await stepAsync(2);
      expectScene('menu', 'Esc 2 lần → menu');
    }
  }
  // Cài đặt: chế độ chơi + chạm để nhảy
  stage = 'journey:settings';
  if (click('#overlay [data-act="settings"]', 'Cài đặt')) {
    await stepAsync(3);
    click('#overlay [data-act="diff"][data-arg="challenge"]', 'Cài đặt: Thử thách'); await stepAsync(2);
    check(OG.Difficulty.mode() === 'challenge', 'Cài đặt không đổi chế độ chơi');
    click('#overlay [data-act="diff"][data-arg="kid"]', 'Cài đặt: Bé chơi'); await stepAsync(2);
    check(OG.Difficulty.mode() === 'kid', 'Cài đặt không đổi về Bé chơi');
    click('#overlay [data-act="tapjump"][data-arg="off"]', 'Chạm để nhảy: Tắt'); await stepAsync(2);
    check(OG.Save.data.settings.tapJump === 'off', 'Không lưu settings.tapJump');
    click('#overlay [data-act="tapjump"][data-arg="auto"]', 'Chạm để nhảy: Tự động'); await stepAsync(2);
    await press('Escape'); await stepAsync(2);
    expectScene('menu', 'cài đặt → menu');
  }
  // Sổ tay khám phá
  stage = 'journey:notebookHub';
  if (click('#overlay [data-act="notebook"]', 'Sổ tay khám phá')) {
    await stepAsync(3);
    if (expectScene('notebookHub', 'menu → sổ tay khám phá')) {
      check(countMatches('#overlay [data-act="book"]') === JOURNEYS.length, 'Sổ tay khám phá không liệt kê đủ ' + JOURNEYS.length + ' hành trình');
      click('#overlay [data-act="book"][data-arg="home"]', 'Sổ tay: home'); await stepAsync(3);
      expectScene('notebook', 'sổ tay khám phá → sổ tay home');
      await press('Escape'); await stepAsync(2);
      expectScene('notebookHub', 'sổ tay → sổ tay khám phá');
      await press('Escape'); await stepAsync(2);
      expectScene('menu', 'sổ tay khám phá → menu');
    }
  }
}
function countMatches(sel) { return doc.querySelectorAll(sel).length; }

// Cấm Trebuchet MS ở MỌI file trong src/ và index.html (bỏ qua câu ghi chú "KHÔNG dùng Trebuchet").
// 💡 Khái niệm: kiểm tra TĨNH (static check) — đọc mã nguồn như văn bản, không chạy. Rẻ, nhanh, chặn được
//   cả những thứ chạy thử không lộ ra (font chỉ sai khi nhìn bằng mắt). Cùng ý tưởng với lint.
// ⚠️ Bẫy: quét cả COMMENT. Viết tên font cấm trong comment ở src/ hay index.html cũng làm test đỏ —
//   hãy gọi nó là "font cấm" (xem docs/learn/CODE_STYLE.md mục 0).
function fontChecks() {
  const files = ['index.html'];
  (function walk(dir) {
    for (const name of fs.readdirSync(path.join(ROOT, dir))) {
      const rel = dir + '/' + name, st = fs.statSync(path.join(ROOT, rel));
      if (st.isDirectory()) walk(rel); else files.push(rel);
    }
  })('src');
  let scanned = 0;
  files.forEach((f) => {
    if (!/\.(js|css|html|md|json|txt)$/i.test(f)) return;
    scanned++;
    const txt = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/không dùng trebuchet/gi, '');
    if (/trebuchet/i.test(txt)) fail('Dùng font Trebuchet MS trong ' + f);
  });
  // Tự kiểm tra chính check: nếu đường dẫn/regex hỏng mà quét 0 file thì check trên "xanh giả".
  check(scanned > 60, 'Quét font quá ít file (' + scanned + ')');
}

async function journeyChecks() {
  stage = 'journey:setup';
  ['Journeys', 'Scenery', 'Difficulty', 'Story', 'Learn', 'Guide'].forEach((ns) => check(!!OG[ns], 'Thiếu module OG.' + ns));
  ['journeySelect', 'journeyMap', 'comic', 'card', 'quiz', 'notebook', 'journeyEnd', 'modeSelect', 'notebookHub'].forEach((s) => check(OG.Scenes.has(s), 'Chưa đăng ký scene ' + s));
  check(OG.Scenes.get('journeyMap') === OG.World.journeyMap.scene, "Scene 'journeyMap' chưa dùng bản canvas của src/world");
  check(JSON.stringify(OG.Journeys.ids().slice().sort()) === JSON.stringify(JOURNEYS.slice().sort()), 'Danh sách hành trình khác mong đợi: ' + OG.Journeys.ids().join(','));
  JOURNEYS.forEach((id) => {
    const r = OG.Journeys.validate(id);
    check(r.ok, 'Hành trình ' + id + ' lỗi dữ liệu: ' + r.errors.join(' | '));
    if (r.warnings.length) log('Cảnh báo dữ liệu ' + id + ' (' + r.warnings.length + '): ' + r.warnings.join(' | '));
    check(OG.Journeys.get(id) && !OG.Journeys.get(id).invalid, 'Hành trình ' + id + ' bị đánh dấu invalid');
    check(OG.Journeys.levelIds(id).length >= 6, 'Hành trình ' + id + ' quá ít màn');
  });
  check(!OG.Journeys.validate({ id: 'Bad', areas: [] }).ok, 'Validator không bắt lỗi dữ liệu sai');
  check(OG.Data.levels.every((l) => !l.journey), 'Màn hành trình lọt vào OG.Data.levels (chiến dịch cổ điển)');
  check(OG.Data.characters.deedee.colors.body === '#3f8de0', 'Dee Dee phải màu xanh dương');
  fontChecks();

  OG.Difficulty.set('kid');
  check(evLast['difficulty:change'] && evLast['difficulty:change'].mode === 'kid', 'Không phát difficulty:change');
  await menuFlowChecks();
  for (let i = 0; i < JOURNEYS.length; i++) {
    await playJourney(JOURNEYS[i], { pauseToMap: i === 0, mapTaps: i === 0, skipIntro: i === 1 });
  }
  check((evCount['journey:complete'] | 0) >= JOURNEYS.length, 'Chưa chơi hết cả ' + JOURNEYS.length + ' hành trình (journey:complete=' + (evCount['journey:complete'] | 0) + ')');
  JOURNEYS.forEach((id) => check(OG.Journeys.isComplete(id), 'Hành trình ' + id + ' chưa hoàn thành'));

  // Chế độ thử thách trong hành trình: hết mạng -> game over -> THỬ LẠI về bản đồ hành trình.
  stage = 'journey:challenge-gameover';
  OG.Difficulty.set('challenge');
  OG.Story.startJourney('vietnam', { skipIntro: true }); await stepAsync(2);
  expectScene('journeyMap', 'bắt đầu hành trình bỏ qua truyện');
  OG.Story.playLevel(OG.Journeys.levelIds('vietnam')[0]); await stepAsync(3);
  await skipComics(['level']);
  if (cur() === 'level') {
    const p = OG.Level.state.player;
    for (let i = 0; i < 20 && cur() === 'level'; i++) { p.inv = 0; p.shield = 0; OG.Player.hurt(p, 'enemy'); step(2); }
    await waitScene('gameover', 30, 'hết mạng (challenge) trong hành trình');
    check(evLast['game:over'] && evLast['game:over'].result.journeyId === 'vietnam', 'Kết quả game over thiếu journeyId');
    await stepAsync(30);
    click('#overlay [data-act="again"]', 'THỬ LẠI (hành trình)'); await stepAsync(5);
    expectScene('journeyMap', 'thử lại hành trình → bản đồ hành trình');
  }
  OG.Difficulty.set('kid');
  OG.Scenes.go('menu'); await stepAsync(3);
}

// ---------------------------------------------------------------------------
// Ảnh chụp thực tế (OG.Photos + assets/photos/<id>/credits.js)
// ---------------------------------------------------------------------------
// Danh sách trắng giấy phép: dùng CHÍNH hàm của game (OG.Photos.licenseOk) để test và game không lệch nhau.
const PHOTO_MAX_BYTES = 400 * 1024;
const IMAGE_EXT = /\.(webp|jpe?g|png|gif|avif)$/i;

// Đọc khối JSON thô giữa /* BEGIN-ENTRIES */ ... /* END-ENTRIES */ của credits.js (kể cả entry mà
// OG.Photos.register đã loại vì sai giấy phép — để test báo lỗi thay vì lặng lẽ bỏ qua).
// ⚠️ Bẫy: hai dấu mốc này là HỢP ĐỒNG giữa 3 bên: tools/photos/fetch_commons.py (ghi), file này (đọc) và
//   chính credits.js. Sửa tay credits.js mà xoá/đổi dấu mốc → test đỏ và công cụ không dựng lại được entry.
function rawPhotoEntries(jid) {
  const file = path.join(ROOT, 'assets', 'photos', jid, 'credits.js');
  if (!fs.existsSync(file)) { fail('Thiếu assets/photos/' + jid + '/credits.js'); return {}; }
  const m = /\/\* BEGIN-ENTRIES \*\/([\s\S]*)\/\* END-ENTRIES \*\//.exec(fs.readFileSync(file, 'utf8'));
  if (!m) { fail('credits.js của ' + jid + ' thiếu khối BEGIN-ENTRIES/END-ENTRIES'); return {}; }
  try { return JSON.parse(m[1]); } catch (e) { fail('credits.js của ' + jid + ' không phải JSON hợp lệ: ' + e.message); return {}; }
}

async function photoChecks() {
  stage = 'photos:registry';
  const P = OG.Photos;
  if (!check(P && typeof P.register === 'function', 'Thiếu module OG.Photos (src/story/photos.js)')) return;
  // Thứ tự script: photos.js trước mọi credits.js.
  const iPhotos = scripts.indexOf('src/story/photos.js');
  check(iPhotos >= 0, 'index.html chưa nạp src/story/photos.js');
  const creditsFile = path.join(ROOT, 'docs', 'credits.html');
  const creditsPage = fs.existsSync(creditsFile) ? fs.readFileSync(creditsFile, 'utf8') : '';
  check(!!creditsPage, 'Thiếu trang docs/credits.html');
  // Giấy phép: vài ca chuẩn để chắc danh sách trắng không bị sửa hỏng.
  ['CC BY-SA 4.0', 'CC BY 2.0', 'CC0', 'Public domain', 'PD-USGov-NASA', 'Unsplash License', 'Pexels License']
    .forEach((l) => check(P.licenseOk(l), 'licenseOk từ chối giấy phép hợp lệ: ' + l));
  ['CC BY-NC 4.0', 'CC BY-NC-SA 2.0', 'CC BY-ND 4.0', 'GFDL', 'Fair use', '', 'All rights reserved']
    .forEach((l) => check(!P.licenseOk(l), 'licenseOk nhận giấy phép bị cấm: "' + l + '"'));

  let total = 0;
  JOURNEYS.forEach((jid) => {
    const rel = 'assets/photos/' + jid + '/credits.js';
    check(scripts.indexOf(rel) > iPhotos, rel + ' phải được nạp trong index.html, SAU src/story/photos.js');
    check(creditsPage.includes('../' + rel), 'docs/credits.html chưa nạp ../' + rel);
    const raw = rawPhotoEntries(jid);
    const dir = path.join(ROOT, 'assets', 'photos', jid);
    const used = new Set();
    Object.keys(raw).forEach((cid) => {
      const e = raw[cid] || {}, tag = jid + '/' + cid;
      const file = e.file || cid + '.webp';
      used.add(file);
      total++;
      check(!!OG.Journeys.getCard(jid, cid), 'Ảnh ' + tag + ': cardId không có trong hành trình ' + jid);
      const fp = path.join(dir, file);
      if (check(fs.existsSync(fp), 'Ảnh ' + tag + ': thiếu file assets/photos/' + jid + '/' + file)) {
        const kb = Math.round(fs.statSync(fp).size / 1024);
        check(kb * 1024 <= PHOTO_MAX_BYTES, 'Ảnh ' + tag + ' quá nặng (' + kb + ' KB > 400 KB)');
      }
      check(P.licenseOk(e.license), 'Ảnh ' + tag + ': giấy phép không thuộc danh sách trắng: "' + e.license + '"');
      check(!!String(e.author || '').trim(), 'Ảnh ' + tag + ': thiếu tác giả');
      check(/^https:\/\//.test(String(e.sourceUrl || '')), 'Ảnh ' + tag + ': sourceUrl phải là link https tới trang gốc');
      check(!!String(e.licenseUrl || '').trim(), 'Ảnh ' + tag + ': thiếu licenseUrl');
      check(!!String(e.source || '').trim(), 'Ảnh ' + tag + ': thiếu tên nguồn (source)');
      check(!/<[a-z][^>]*>/i.test(String(e.author || '') + String(e.title || '')), 'Ảnh ' + tag + ': tác giả/tiêu đề còn thẻ HTML');
      check(+e.w > 0 && +e.h > 0 && Math.max(+e.w, +e.h) <= 1200, 'Ảnh ' + tag + ': w/h không hợp lệ (' + e.w + 'x' + e.h + ')');
      check(!!P.get(jid, cid), 'Ảnh ' + tag + ' có trong credits.js nhưng OG.Photos không nhận');
    });
    // File ảnh "mồ côi" (không có ghi công) sẽ bị deploy mà không ghi tác giả → vi phạm giấy phép.
    if (fs.existsSync(dir)) {
      fs.readdirSync(dir).filter((f) => IMAGE_EXT.test(f) && !used.has(f))
        .forEach((f) => fail('File ảnh không có ghi công: assets/photos/' + jid + '/' + f + ' (chạy fetch_commons.py write hoặc xoá file)'));
    }
  });
  log('OG.Photos: ' + total + ' ảnh đã đăng ký');

  // ---- Giao diện: dùng entry giả để chạy mọi nhánh vẽ (shimmer → ảnh → phóng to → ảnh lỗi) ----
  // Image giả không bao giờ tự tải: test tự gọi img.onload() / img.onerror() để đi vào từng nhánh,
  // nhờ vậy nhánh "ảnh lỗi" hiếm gặp ngoài đời cũng được chạy mỗi lần test.
  stage = 'photos:ui';
  const jid = 'vietnam';
  const cards = OG.Journeys.cardsOf(jid);
  const real = cards.find((c) => P.has(jid, c.id));
  const target = real || cards[0];
  const spare = cards.find((c) => c !== target && !P.has(jid, c.id));
  const temp = [];
  const fakeEntry = {
    w: 800, h: 533, author: 'Smoke test', license: 'CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    source: 'Test', sourceUrl: 'https://example.org/test', title: 'Ảnh giả'
  };
  if (!real) { P.register(jid, { [target.id]: fakeEntry }); temp.push(target.id); }
  if (spare) { P.register(jid, { [spare.id]: fakeEntry }); temp.push(spare.id); }
  check(OG.Menus.ui.photoCreditsLink().includes('docs/credits.html'), 'Thiếu link "Ghi công ảnh" khi đã có ảnh');
  const rec = P.image(jid, target.id);
  if (!check(rec && rec.img && rec.state === 'loading', 'OG.Photos.image không tạo new Image() / state loading')) return;
  check(P.image(jid, target.id) === rec, 'OG.Photos.image không cache ảnh');
  check(String(rec.img.src).startsWith('assets/photos/' + jid + '/'), 'Đường dẫn ảnh phải tương đối assets/photos/<id>/: ' + rec.img.src);

  // 1) Popup trong màn (from:'level'): đang tải → khung shimmer. Mở trên Sổ tay (canvas) để phím Enter
  //    không lọt xuống nút DOM của menu bên dưới.
  OG.Learn.openNotebook(jid, 'menu', {}); await stepAsync(10);
  if (doc.activeElement && doc.activeElement.blur) doc.activeElement.blur();
  OG.Learn.openCard(jid, target.id, { from: 'level' }); await stepAsync(30);
  expectScene('card', 'mở thẻ có ảnh (đang tải)');
  // 2) Ảnh tải xong → polaroid
  rec.img.naturalWidth = 800; rec.img.naturalHeight = 533;
  if (typeof rec.img.onload === 'function') rec.img.onload();
  check(rec.state === 'ready' && evLast['photo:load'] && evLast['photo:load'].cardId === target.id,
    'onload không chuyển ảnh sang ready / không phát photo:load');
  await stepAsync(20);
  await press('ArrowDown'); await stepAsync(2);
  check(!OG.Scenes.get('card').zoom, 'Popup trong màn không được phóng to ảnh (chỉ Sổ tay)');
  await press('Enter'); await stepAsync(3);
  expectScene('notebook', 'đóng thẻ có ảnh');

  // 3) Sổ tay: lưới có thumbnail ảnh; chi tiết thẻ có ảnh lớn + phóng to
  OG.Learn.unlockCard(jid, target.id, { silent: true });
  OG.Learn.openNotebook(jid, 'menu', {}); await stepAsync(20);
  if (expectScene('notebook', 'mở Sổ tay để thử ảnh')) {
    OG.Learn.openCard(jid, target.id, { from: 'notebook' }); await stepAsync(30);
    const sc = OG.Scenes.get('card');
    await press('ArrowDown'); await stepAsync(20);
    check(sc.zoom === true, 'Phím ↓ không phóng to ảnh trong Sổ tay');
    await press('Enter'); await stepAsync(3);
    check(!sc.zoom && cur() === 'card', 'Enter khi đang phóng to phải đóng ảnh (không đóng thẻ)');
    const r = sc.photoRect;
    if (check(r, 'Thẻ có ảnh chưa lưu photoRect để chạm')) {
      const cv = doc.getElementById('game');
      const tapAt = async (x, y) => {
        cv.dispatchEvent(new D.FakeEvent('pointerdown', { clientX: x, clientY: y }));
        step(2); win.dispatchEvent(new D.FakeEvent('pointerup', {})); await stepAsync(20);
      };
      await tapAt(r.x + r.w / 2, r.y + r.h / 2);
      check(sc.zoom === true, 'Chạm vào ảnh không phóng to');
      await tapAt(100, 100);
      check(!sc.zoom && cur() === 'card', 'Chạm lần nữa phải đóng ảnh phóng to');
    }
    await press('Escape'); await stepAsync(3);
    expectScene('notebook', 'đóng thẻ → Sổ tay');
    // 4) Ảnh lỗi → quay về bố cục hình vẽ cũ, không lỗi
    if (spare) {
      const r2 = P.image(jid, spare.id);
      if (typeof r2.img.onerror === 'function') r2.img.onerror();
      check(r2.state === 'error' && !P.ready(jid, spare.id), 'onerror không đánh dấu ảnh lỗi');
      OG.Learn.openCard(jid, spare.id, { from: 'notebook' }); await stepAsync(20);
      check(OG.Scenes.get('card').photo() === null, 'Ảnh lỗi phải quay về hình vẽ cartoon');
      await press('Escape'); await stepAsync(3);
    }
    await press('Escape'); await stepAsync(3);
  }
  temp.forEach((cid) => P._unregister(jid, cid));
  OG.Scenes.go('menu'); await stepAsync(3);
}

// ---------------------------------------------------------------------------
// v2: Độ khó cho trẻ em (OG.Difficulty, docs/STORY.md mục 5) + các lỗi tồn đọng đã sửa
// ---------------------------------------------------------------------------
async function difficultyChecks() {
  const Dif = OG.Difficulty;
  // 1) Pause → "Chơi lại màn" KHÔNG tiêu thêm vật phẩm cửa hàng.
  stage = 'difficulty:restart-items';
  Dif.set('challenge');
  OG.Scenes.go('menu'); await stepAsync(2);
  OG.Save.addItem('shield', 3 - OG.Save.getItemCount('shield'));
  OG.Shop.setLoadout('shield', true);
  OG.Game.newRun();
  OG.Game.startLevel('kitchen'); await stepAsync(2);
  const n0 = OG.Save.getItemCount('shield');
  check(n0 === 2 && OG.Level.state.player.shield >= 1, 'Vào màn không dùng khiên từ kho (kho=' + n0 + ')');
  for (let k = 0; k < 2; k++) {
    await press('Escape');
    if (!expectScene('pause', 'pause để chơi lại')) break;
    click('#overlay [data-act="restart"]', 'Chơi lại màn'); await stepAsync(3);
    expectScene('level', 'chơi lại màn');
  }
  check(OG.Save.getItemCount('shield') === n0, 'Chơi lại màn từ pause tiêu thêm khiên (' + n0 + ' → ' + OG.Save.getItemCount('shield') + ')');
  check(OG.Level.state.player.shield >= 1, 'Chơi lại màn mất khiên đã mang theo');
  OG.Shop.setLoadout('shield', false);

  // 2) Marky đang nhảy cò cò (bay lên) vẫn giẫm được — cả 'challenge' lẫn 'kid'.
  for (const m of ['challenge', 'kid']) {
    stage = 'difficulty:marky-' + m;
    Dif.set(m);
    const e = OG.Enemies.create({ type: 'marky', x: 400 }, 0);
    e.y = 380; e.prevY = 392; // vừa bay lên 12px trong frame này
    const p = { x: 398, y: 380 - 52 + 14, w: 34, h: 52, vy: 240 };
    const prevBottom = 380 + 16; // đáy frame trước: thấp hơn đỉnh HIỆN TẠI 16px, nhưng vẫn trên đỉnh cũ
    check(OG.Level.stompOk(p, prevBottom, e, 12, e.prevY), 'Không giẫm được Marky đang nhảy lên (' + m + ')');
  }

  // 3) Chạm sượt: kid bỏ qua, challenge vẫn tính.
  stage = 'difficulty:graze';
  const pl = { x: 100, y: 100, w: 34, h: 52 };
  const box = { x: 131, y: 120, w: 30, h: 30 }; // chồng lấn 3px theo chiều ngang
  Dif.set('kid');
  check(!Dif.touches(pl, box), 'Chế độ kid: chạm sượt 3px vẫn bị thương');
  check(Dif.touches(pl, { x: 110, y: 120, w: 30, h: 30 }), 'Chế độ kid: chạm thật không tính');
  Dif.set('challenge');
  check(Dif.touches(pl, box), 'Chế độ challenge: chạm sượt phải tính như v1');

  // 4) Kid: giữ nút nhảy -> nhảy cao hơn; challenge giữ nguyên v1 (~116px).
  stage = 'difficulty:jump';
  const apex = (mode, hold) => {
    Dif.set(mode);
    OG.Input.reset();
    const world = { platforms: [{ x: 0, y: 480, w: 2000, h: 60 }], width: 2000 };
    const p = OG.Player.create('oggy', 100, 480 - 52, {}, null);
    OG.Physics.moveBody(p, 0.016, world.platforms, {});
    let minY = p.y;
    OG.Input.setKey('jump', true);
    for (let i = 0; i < 90; i++) {
      if (!hold && i === 2) OG.Input.setKey('jump', false);
      OG.Player.update(p, 1 / 60, world);
      OG.Input.endFrame();
      minY = Math.min(minY, p.y);
      if (i > 5 && p.ground) break;
    }
    OG.Input.setKey('jump', false);
    OG.Input.reset();
    return 428 - minY;
  };
  const kidHold = apex('kid', true), kidTap = apex('kid', false), chHold = apex('challenge', true);
  check(kidHold > kidTap + 15, 'Kid: giữ nút nhảy không cao hơn (' + kidHold.toFixed(0) + ' vs ' + kidTap.toFixed(0) + ')');
  check(kidTap >= 105, 'Kid: nhảy chạm nhẹ thấp hơn v1 (' + kidTap.toFixed(0) + 'px)');
  check(Math.abs(chHold - 116) < 10, 'Challenge: độ cao nhảy khác v1 (' + chHold.toFixed(0) + 'px)');
  log('độ cao nhảy: kid giữ=' + kidHold.toFixed(0) + ' kid chạm=' + kidTap.toFixed(0) + ' challenge=' + chHold.toFixed(0));

  // 5) Trùm kid: máu ít hơn, có nghỉ thở; trùm ghép 2 máu/tên.
  stage = 'difficulty:boss';
  const mk = (id, mode) => {
    Dif.set(mode);
    const arena = { difficulty: Dif.params('kitchen'), platforms: [{ x: 0, y: 480, w: 960, h: 60, isFloor: true }] };
    return OG.Bosses.create(id, arena);
  };
  ['deedee', 'marky', 'joey'].forEach((id) => {
    const a = mk(id, 'challenge'), b = mk(id, 'kid');
    check(a && b && b.maxHp < a.maxHp && b.maxHp >= 2, 'Trùm ' + id + ' ở kid không ít máu hơn (' + (b && b.maxHp) + ' / ' + (a && a.maxHp) + ')');
    check(b && b.diffApplied, 'Trùm ' + id + ' không đánh dấu diffApplied');
  });
  const trio = mk('trio', 'kid');
  check(trio && trio.members.every((m) => m.maxHp === 2), 'Trùm ghép trio ở kid: mỗi tên phải 2 máu');
  {
    const b = mk('deedee', 'kid');
    let rested = false;
    const A = b.arena;
    for (let i = 0; i < 60 * 12 && !rested; i++) { A.t += 1 / 60; b.update(1 / 60, A); if (b.state === 'breather') rested = true; }
    check(rested, 'Trùm ở kid không có khoảng nghỉ thở sau đòn');
  }

  // 6) Chạm nửa phải màn chơi = nhảy (cảm ứng); nút cảm ứng to hơn.
  stage = 'difficulty:touch';
  Dif.set('kid');
  OG.Game.newRun();
  OG.Game.startLevel('kitchen'); await stepAsync(2);
  if (expectScene('level', 'màn thử chạm nhảy')) {
    const cv = doc.getElementById('game');
    cv.dispatchEvent(new D.FakeEvent('pointerdown', { clientX: 800, clientY: 300, pointerType: 'touch', pointerId: 7 }));
    check(OG.Input.keys.jump === true, 'Chạm nửa phải màn hình không nhảy');
    win.dispatchEvent(new D.FakeEvent('pointerup', { pointerId: 7 }));
    check(OG.Input.keys.jump === false, 'Thả tay không nhả nút nhảy');
    cv.dispatchEvent(new D.FakeEvent('pointerdown', { clientX: 200, clientY: 300, pointerType: 'touch', pointerId: 8 }));
    check(OG.Input.keys.jump === false, 'Chạm nửa trái lại nhảy');
    win.dispatchEvent(new D.FakeEvent('pointerup', { pointerId: 8 }));
    step(2);
  }
  const jb = doc.querySelector('#mobileControls [data-key="jump"]');
  check(jb && parseInt(jb.style.width, 10) >= 70, 'Nút cảm ứng chưa được phóng to');

  // 7) Checkpoint (kid, hành trình): chạm cờ -> hết mạng hồi sinh tại cờ, thẻ đã nhặt vẫn còn.
  stage = 'difficulty:checkpoint';
  const jid = 'home', lid = OG.Journeys.levelIds(jid)[0];
  OG.Story.startJourney(jid, { skipIntro: true }); await stepAsync(2);
  OG.Story.playLevel(lid); await stepAsync(3);
  await skipComics(['level']);
  if (cur() === 'level') {
    const st = OG.Level.state, p = st.player;
    check(st.checkpoints.length > 0, 'Màn hành trình (kid) không có cờ checkpoint');
    const c = st.checkpoints[0];
    if (c) {
      const reached = evCount['checkpoint:reach'] || 0;
      p.x = c.x + 5; p.y = c.y - p.h - 1; p.vy = 0; p.inv = 2;
      step(2);
      check((evCount['checkpoint:reach'] || 0) > reached && st.checkpoint, 'Không chạm được cờ checkpoint');
      const cards = OG.Learn.listCards ? JSON.stringify(OG.Learn.listCards(jid)) : '';
      p.x = c.x + 300; step(1);
      for (let i = 0; i < 12 && cur() === 'level'; i++) {
        const before = OG.Game.run.lives;
        p.inv = 0; p.shield = 0; OG.Player.hurt(p, 'enemy'); step(1);
        if (OG.Game.run.lives > before) break;
      }
      check(cur() === 'level' && st.checkpoint && Math.abs(p.x - st.checkpoint.x) < 40, 'Hết mạng không hồi sinh tại checkpoint');
      if (cards) check(JSON.stringify(OG.Learn.listCards(jid)) === cards, 'Hết mạng làm mất thẻ đã nhặt');
    }
  }
  Dif.set('kid');
  OG.Scenes.go('menu'); await stepAsync(3);
}

let doubleJumpDone = false;
async function doubleJumpCheck() {
  if (doubleJumpDone) return;
  doubleJumpDone = true;
  const prev = stage;
  stage = 'shop:boots';
  const p = OG.Level.state.player;
  check(OG.Save.getItemCount('boots') === 0, 'Giày lò xo chưa bị tiêu thụ khi vào màn');
  step(30); // đứng trên sàn
  const before = evCount['player:jump'] || 0;
  await press('Space');
  step(8);
  const doubles = () => (evCount['player:jump'] || 0) - before;
  await press('Space');
  check(doubles() >= 2 && evLast['player:jump'] && evLast['player:jump'].double, 'Nhảy đôi (giày lò xo) không hoạt động');
  step(90);
  stage = prev;
  void p;
}

// In tổng kết. Đặt process.exitCode (không gọi process.exit) để Node in hết log rồi mới thoát;
// mã 1 làm bước "Smoke test" của CI đỏ → GitHub Actions không deploy.
function finish(t0) {
  stage = 'end';
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const sc = OG && OG.Sprites && OG.Sprites.cacheStats ? OG.Sprites.cacheStats() : null;
  console.log('');
  console.log('Đã chạy ' + frames + ' frame (' + (frames * DT).toFixed(0) + ' giây ảo) trong ' + secs + ' s.');
  console.log('Event: ' + Object.keys(evCount).length + ' loại; ví dụ level:complete=' + (evCount['level:complete'] | 0) +
    ', boss:defeated=' + (evCount['boss:defeated'] | 0) + ', enemy:stomp=' + (evCount['enemy:stomp'] | 0) +
    ', quest:complete=' + (evCount['quest:complete'] | 0) + (sc ? ', sprite cache=' + sc.size : ''));
  if (VERBOSE) console.log('Chi tiết event: ' + JSON.stringify(evCount));
  if (warnings.length) {
    console.log('Cảnh báo (' + warnings.length + '):');
    warnings.slice(0, 15).forEach((w) => console.log('  - ' + w));
  }
  if (errors.length) {
    console.log('\nTHẤT BẠI — ' + errors.length + ' lỗi:');
    errors.forEach((e) => console.log('  - ' + e));
    process.exitCode = 1;
  } else {
    console.log('\nXANH — không có lỗi runtime.');
  }
}

main().catch((e) => { fail('Ngoại lệ ngoài kịch bản: ' + errText(e)); finish(Date.now()); });
