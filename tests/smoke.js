#!/usr/bin/env node
/* Smoke test toàn bộ game Oggy Adventure trong Node (không cần trình duyệt, không thư viện ngoài).
 *
 * Cách chạy:   node tests/smoke.js            (thêm --verbose để in từng bước)
 *
 * - Dựng window/document/canvas/localStorage/AudioContext giả (tests/fake-dom.js).
 * - Đọc index.html, dựng phần <body> và load MỌI <script src> đúng thứ tự bằng vm.
 * - Điều khiển game qua sự kiện bàn phím/chạm/click giống người chơi và chạy hàng nghìn frame
 *   (OG.Loop.step) qua các scene: menu → cài đặt/nhân vật/cửa hàng/xếp hạng → bản đồ → 4 màn + 4 trùm
 *   → chiến thắng → nhập tên → bảng xếp hạng; cộng thêm game over, màn phụ, nhân vật khác, tạm dừng.
 * - Mọi console.error, ngoại lệ trong frame/listener/timer, ctx.save/restore lệch đều tính là LỖI.
 * Thoát mã 1 nếu có lỗi. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const D = require('./fake-dom');

const ROOT = path.resolve(__dirname, '..');
const VERBOSE = process.argv.includes('--verbose');
const DT = 1 / 60;

// ---------------------------------------------------------------------------
// Ghi nhận lỗi
// ---------------------------------------------------------------------------
const errors = [];
const warnings = [];
const seen = new Set();
let stage = 'load';
function fail(msg) {
  const key = stage + '|' + msg;
  if (seen.has(key)) return;
  seen.add(key);
  errors.push('[' + stage + '] ' + msg);
  console.log('  ✗ ' + msg);
}
function warn(msg) { warnings.push('[' + stage + '] ' + msg); if (VERBOSE) console.log('  ! ' + msg); }
function log(msg) { if (VERBOSE) console.log('    ' + msg); }
function errText(e) { return e && e.stack ? String(e.stack).split('\n').slice(0, 4).join('\n      ') : String(e); }
D.setListenerErrorHandler((err, type) => fail('Lỗi trong listener "' + type + '": ' + errText(err)));

// ---------------------------------------------------------------------------
// Đồng hồ ảo + timer giả
// ---------------------------------------------------------------------------
const clock = { t: 0 };           // giây
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

const fakeConsole = {
  log: (...a) => { if (VERBOSE) console.log('    [game]', ...a); },
  info: (...a) => { if (VERBOSE) console.log('    [game]', ...a); },
  debug: () => {},
  warn: (...a) => warn('console.warn: ' + a.map(String).join(' ')),
  error: (...a) => fail('console.error: ' + a.map((x) => (x && x.stack ? errText(x) : String(x))).join(' ')),
  table: () => {}, group: () => {}, groupEnd: () => {}, trace: () => {}
};

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
  alert: () => fail('Gọi alert() — hợp đồng cấm'),
  prompt: () => { fail('Gọi prompt() — hợp đồng cấm'); return null; },
  confirm: () => { fail('Gọi confirm() — hợp đồng cấm'); return false; },
  addEventListener: (...a) => winTarget.addEventListener(...a),
  removeEventListener: (...a) => winTarget.removeEventListener(...a),
  dispatchEvent: (ev) => winTarget.dispatchEvent(ev),
  focus: () => {}, blur: () => {}, scrollTo: () => {},
  Event: D.FakeEvent, KeyboardEvent: D.FakeEvent, PointerEvent: D.FakeEvent, MouseEvent: D.FakeEvent, CustomEvent: D.FakeEvent
};
const context = vm.createContext(sandbox);
const win = vm.runInContext('globalThis', context);
win.window = win;
win.self = win;

// Dựng <body> từ index.html (bỏ <script>), giữ nguyên id/class/style như thật.
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const bodyHtml = (/<body[^>]*>([\s\S]*)<\/body>/i.exec(indexHtml) || [])[1] || '';
D.parseHTML(bodyHtml.replace(/<script[\s\S]*?<\/script>/gi, ''), doc.body, doc);
const scripts = Array.from(indexHtml.matchAll(/<script\s+src="([^"]+)"\s*><\/script>/g)).map((m) => m[1]);

// Kiểm tra file CSS tham chiếu tồn tại.
Array.from(indexHtml.matchAll(/<link[^>]+href="([^"]+)"/g)).forEach((m) => {
  if (!/^https?:/.test(m[1]) && !fs.existsSync(path.join(ROOT, m[1]))) fail('Thiếu file CSS: ' + m[1]);
});

// ---------------------------------------------------------------------------
// Tiện ích điều khiển
// ---------------------------------------------------------------------------
let OG = null;
let mainCtx = null;
let frames = 0;

async function flush() { await new Promise((r) => setImmediate(r)); }

function step(n) {
  n = n || 1;
  for (let i = 0; i < n; i++) {
    clock.t += DT;
    runTimers();
    try { OG.Loop.step(DT); } catch (e) { fail('Lỗi frame (scene ' + safeScene() + '): ' + errText(e)); try { OG.Input.endFrame(); } catch (e2) { /* bỏ qua */ } }
    frames++;
    if (mainCtx.depth !== 0 || mainCtx.underflow) {
      fail('ctx.save/restore lệch sau frame ở scene ' + safeScene() + ' (depth=' + mainCtx.depth + ', underflow=' + mainCtx.underflow + ')');
      mainCtx.depth = 0; mainCtx.underflow = 0;
    }
  }
}
async function stepAsync(n) { step(n); await flush(); }
function safeScene() { try { return OG.Scenes.stackNames().join('>'); } catch (e) { return '?'; } }
function cur() { return OG.Scenes.current(); }

const CODE_KEY = { Escape: 'Escape', Enter: 'Enter', Space: ' ', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', KeyE: 'e', KeyP: 'p', KeyM: 'm' };
function keyDown(code) { (doc.activeElement || doc.body).dispatchEvent(new D.FakeEvent('keydown', { code, key: CODE_KEY[code] || code })); }
function keyUp(code) { (doc.activeElement || doc.body).dispatchEvent(new D.FakeEvent('keyup', { code, key: CODE_KEY[code] || code })); }
async function press(code, hold) { keyDown(code); step(hold || 1); keyUp(code); await stepAsync(1); }

function $(sel) { return doc.querySelector(sel); }
function click(sel, label) {
  const el = typeof sel === 'string' ? $(sel) : sel;
  if (!el) { fail('Không tìm thấy phần tử để bấm: ' + (label || sel) + ' (scene ' + safeScene() + ')'); return false; }
  el.click();
  return true;
}
function findButton(textRe) {
  return doc.querySelectorAll('#overlay button').find((b) => textRe.test(b.textContent)) || null;
}
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
function expectScene(name, label) {
  if (cur() !== name) { fail('Mong đợi scene "' + name + '"' + (label ? ' (' + label + ')' : '') + ', thực tế: ' + safeScene()); return false; }
  return true;
}
function check(cond, msg) { if (!cond) fail(msg); return !!cond; }
function keepAlive() { if (OG.Game.run && !OG.Game.run.over && OG.Game.run.lives < 6) { OG.Game.run.lives = 9; OG.Game.hud.lives = 9; } }

// Đếm event để kiểm tra luồng.
const evCount = {};
const evLast = {};

// ---------------------------------------------------------------------------
// Kịch bản con
// ---------------------------------------------------------------------------
// Chơi một màn: chạy tự do một lúc, nhặt hết pizza (dịch chuyển), giẫm 1 kẻ địch, rồi qua cửa EXIT.
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
async function fightBoss(bossId) {
  stage = 'boss:' + bossId;
  if (!expectScene('boss', 'vào trận ' + bossId)) return false;
  check(OG.Game.hud.boss && OG.Game.hud.boss.id === bossId, 'HUD không có thanh máu trùm ' + bossId);
  const p = OG.BossScene.getPlayer();
  check(!!p, 'OG.BossScene.getPlayer() trả null');
  // 1) Vờn 8 giây với input ngẫu nhiên (seed cố định).
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  let dir = 'ArrowRight';
  keyDown(dir);
  for (let i = 0; i < 480 && cur() === 'boss'; i++) {
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
  if (bossId === 'joey') await pauseFlow('boss');
  // 2) Giẫm điểm yếu cho tới khi hạ trùm (tối đa 120 giây ảo).
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
async function main() {
  const t0 = Date.now();
  console.log('Oggy Adventure — smoke test (' + scripts.length + ' script)');

  // ---- Load script theo thứ tự index.html ----
  stage = 'load';
  for (const src of scripts) {
    const file = path.join(ROOT, src);
    if (!fs.existsSync(file)) { fail('Thiếu file script: ' + src); continue; }
    const code = fs.readFileSync(file, 'utf8');
    if (/^\s*(import|export)\s/m.test(code)) fail('Có import/export (ES module) trong ' + src);
    try { vm.runInContext(code, context, { filename: src }); } catch (e) { fail('Lỗi khi load ' + src + ': ' + errText(e)); }
  }
  OG = win.OG;
  if (!OG) { fail('window.OG không tồn tại'); return finish(t0); }
  OG.Events.on('*', (name, payload) => { evCount[name] = (evCount[name] || 0) + 1; evLast[name] = payload; });

  // ---- Boot (DOMContentLoaded) ----
  stage = 'boot';
  doc.readyState = 'interactive';
  doc.dispatchEvent(new D.FakeEvent('DOMContentLoaded', {}));
  mainCtx = doc.getElementById('game').getContext('2d');
  check(OG.Loop.ctx === mainCtx, 'OG.Loop chưa được start với ctx của #game');
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

  // ---- Cử chỉ đầu tiên (bấm nút DOM) → Audio ----
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
  const touchRight = doc.querySelector('#mobileControls [data-key="right"]');
  touchRight.dispatchEvent(new D.FakeEvent('pointerdown', {}));
  check(OG.Input.keys.right === true, 'Nút cảm ứng ▶ không giữ phím right');
  touchRight.dispatchEvent(new D.FakeEvent('pointerup', {}));
  check(OG.Input.keys.right === false, 'Nút cảm ứng ▶ không nhả phím right');

  // ---- CHƠI: chiến dịch đầy đủ 4 màn + 4 trùm ----
  stage = 'campaign';
  click('#overlay [data-act="play"]', 'CHƠI');
  await stepAsync(10);
  expectScene('worldmap', 'CHƠI → bản đồ');
  check(evLast['game:start'] && evLast['game:start'].charId === 'oggy', 'Không phát game:start');

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

  // ---- Chiến thắng → nhập tên → lưu điểm → bảng xếp hạng → quay lại ----
  stage = 'victory';
  if (cur() === 'victory') {
    check(evCount['game:victory'] === 1, 'game:victory phát ' + (evCount['game:victory'] | 0) + ' lần');
    await stepAsync(30);
    const box = $('#overlay .social-result');
    check(!!box, 'Panel chiến thắng thiếu khối Social (mountResult)');
    const input = $('#overlay .social-result input');
    if (check(!!input, 'Thiếu ô nhập tên')) {
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

  // ---- Màn phụ + nhân vật khác ----
  stage = 'extra';
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

  // ---- Game over → panel kết quả → thử lại ----
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

  await qaChecks();
  await journeyChecks();

  // ---- Quay lại menu, xoá dữ liệu (save:reset) và chạy lại boot ----
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
  return finish(t0);
}

// ---------------------------------------------------------------------------
// Kiểm tra hồi quy (QA): các lỗi đã sửa + luồng ít được đi qua
// ---------------------------------------------------------------------------
function listenerCount() {
  const count = (t) => Object.values(t._listeners || {}).reduce((n, arr) => n + arr.length, 0);
  return count(winTarget) + count(doc);
}
function intervalCount() { return timers.filter((x) => x.every).length; }

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

// Bỏ qua mọi truyện tranh đang chiếu (Esc) cho tới khi tới một trong các scene mong đợi.
async function skipComics(targets, maxLoops) {
  for (let i = 0; i < (maxLoops || 20); i++) {
    if (targets.includes(cur())) return true;
    if (cur() === 'comic') { await press('Escape'); await stepAsync(2); } else step(5);
  }
  if (!targets.includes(cur())) fail('Chờ ' + targets.join('|') + ' thất bại — đang ở ' + safeScene());
  return targets.includes(cur());
}

// Trả lời câu đố đang mở: sai 1 lần (không bị phạt) rồi đúng. Hợp đồng phím: chọn bắt đầu ở 0, → để sang, Enter để chọn.
async function answerQuizFlow() {
  if (!expectScene('quiz', 'cổng câu đố')) return false;
  const top = OG.Scenes.get('quiz');
  const q = top.q, n = q.choices.length, ans = q.answer, wrong = (ans + 1) % n;
  const lives = OG.Game.run.lives;
  step(5);
  for (let i = 0; i < wrong; i++) await press('ArrowRight');
  await press('Enter');
  check(evLast['quiz:answer'] && evLast['quiz:answer'].correct === false, 'Trả lời sai không phát quiz:answer{correct:false}');
  check(cur() === 'quiz' && OG.Game.run.lives === lives, 'Trả lời sai bị phạt hoặc đóng câu đố');
  for (let i = 0; i < (ans - wrong + n) % n; i++) await press('ArrowRight');
  const passes = evCount['quiz:pass'] || 0;
  await press('Enter');
  check((evCount['quiz:pass'] || 0) === passes + 1, 'Trả lời đúng không phát quiz:pass');
  step(40);
  await press('Enter');
  await stepAsync(2);
  return expectScene('level', 'đóng câu đố sau khi đúng');
}

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
    step(20); await press('Enter'); step(20);
    await press('Escape'); await stepAsync(3);
    check((evCount['comic:end'] || 0) === ends + 1, 'comic:end không phát khi bỏ qua truyện');
  }
  if (!(await skipComics(['journeyMap']))) return;
  const levelId = OG.Journeys.levelIds(jid)[0];
  await press('Enter'); // ▶ CHƠI TIẾP (nút primary)
  await stepAsync(3);
  if (!(await skipComics(['level']))) return;
  const st = OG.Level.state;
  check(st.level.id === levelId && st.journeyId === jid, 'Màn hành trình sai: ' + st.level.id);
  check(st.learn && st.learn.pages.length > 0, 'Màn ' + levelId + ' không có trang sách (OG.Learn hook)');
  if (opts.pauseToMap) {
    await press('Escape');
    if (expectScene('pause', 'Esc trong màn hành trình')) {
      click('#overlay [data-act="map"]', 'Bản đồ (hành trình)'); await stepAsync(3);
      expectScene('journeyMap', 'pause → bản đồ hành trình');
      await press('Enter'); await stepAsync(3);
      await skipComics(['level']);
    }
  }
  return playInLevel(jid, levelId);
}

async function playInLevel(jid, levelId) {
  const st = OG.Level.state, p = st.player;
  // Người dẫn đường
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
  // Trang sách -> thẻ kiến thức
  for (const pg of st.learn.pages) {
    const was = OG.Learn.hasCard(jid, pg.card);
    p.x = pg.x - p.w / 2; p.y = pg.y - p.h / 2; p.vx = 0; p.vy = 0; p.inv = 2;
    step(1);
    check(OG.Learn.hasCard(jid, pg.card), 'Nhặt trang không mở khoá thẻ ' + pg.card);
    if (!was && expectScene('card', 'thẻ mới ' + pg.card)) { step(30); await press('Enter'); await stepAsync(2); expectScene('level', 'đóng thẻ'); }
  }
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
  // Pizza + xu
  for (const it of st.items) {
    if (it.got) continue;
    p.x = it.x - p.w / 2; p.y = it.y - p.h / 2; p.vx = 0; p.vy = 0; p.inv = 2;
    step(1);
  }
  // Cổng câu đố giữa màn
  for (const g of st.learn.gates) {
    if (g.x === 'exit') continue;
    p.x = g.x - 60; p.y = OG.FLOOR_Y - p.h - 1; p.vy = 0; p.inv = 2;
    keyDown('ArrowRight');
    for (let i = 0; i < 30 && cur() === 'level'; i++) step(1);
    keyUp('ArrowRight'); await stepAsync(1);
    check(p.x + p.w <= g.x, 'Cổng câu đố giữa màn không chặn đường');
    await answerQuizFlow();
    check(g.open, 'Cổng không mở sau khi trả lời đúng');
  }
  // Cửa EXIT (có thể kèm câu đố)
  p.x = st.exit.x + 10; p.y = OG.FLOOR_Y - p.h - 1; p.vy = 0; p.inv = 2;
  step(2);
  if (st.learn.gates.some((g) => g.x === 'exit')) {
    await answerQuizFlow();
    p.x = st.exit.x + 10; p.y = OG.FLOOR_Y - p.h - 1; p.vy = 0; p.inv = 2;
  }
  for (let i = 0; i < 200 && cur() === 'level'; i++) { keepAlive(); step(1); }
  await flush();
  const L = OG.Journeys.getLevel(levelId);
  if (L.boss && OG.Bosses.has(L.boss) && (await waitScene('boss', 60, 'trùm hành trình ' + jid))) {
    const A = OG.BossScene.getArena();
    check(A.journeyId === jid && A.theme === L.theme, 'Đấu trường trùm không theo chủ đề khu');
    await fightBoss(L.boss);
    stage = 'journey:' + jid;
  }
  await skipComics(['journeyMap', 'journeyEnd'], 40);
  check(evLast['level:complete'] && evLast['level:complete'].journeyId === jid, 'level:complete không có journeyId');
  check(OG.Progress.isCompleted(levelId), 'Tiến độ màn hành trình không được lưu');
  if (OG.Journeys.isFinalLevel(levelId)) {
    expectScene('journeyEnd', 'xong hành trình');
    check(evLast['journey:complete'] && evLast['journey:complete'].journeyId === jid, 'Không phát journey:complete');
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

async function journeyChecks() {
  stage = 'journey:setup';
  ['Journeys', 'Scenery', 'Difficulty', 'Story', 'Learn', 'Guide'].forEach((ns) => check(!!OG[ns], 'Thiếu module OG.' + ns));
  ['journeySelect', 'journeyMap', 'comic', 'card', 'quiz', 'notebook', 'journeyEnd'].forEach((s) => check(OG.Scenes.has(s), 'Chưa đăng ký scene ' + s));
  JOURNEYS.forEach((id) => {
    const r = OG.Journeys.validate(id);
    check(r.ok, 'Hành trình ' + id + ' lỗi dữ liệu: ' + r.errors.join(' | '));
    if (r.warnings.length) log('Cảnh báo dữ liệu ' + id + ' (' + r.warnings.length + '): ' + r.warnings.join(' | '));
    check(OG.Journeys.get(id) && !OG.Journeys.get(id).invalid, 'Hành trình ' + id + ' bị đánh dấu invalid');
  });
  check(!OG.Journeys.validate({ id: 'Bad', areas: [] }).ok, 'Validator không bắt lỗi dữ liệu sai');
  check(OG.Data.levels.every((l) => !l.journey), 'Màn hành trình lọt vào OG.Data.levels (chiến dịch cổ điển)');
  // Font: cấm Trebuchet MS trong mọi file đã load (bỏ qua câu ghi chú "KHÔNG dùng Trebuchet").
  scripts.concat(['index.html', 'src/ui/ui.css', 'src/social/social.css', 'src/story/story.css']).forEach((f) => {
    const fp = path.join(ROOT, f);
    if (!fs.existsSync(fp)) return;
    const txt = fs.readFileSync(fp, 'utf8').replace(/không dùng trebuchet/gi, '');
    if (/trebuchet/i.test(txt)) fail('Dùng font Trebuchet MS trong ' + f);
  });

  OG.Difficulty.set('kid');
  check(evLast['difficulty:change'] && evLast['difficulty:change'].mode === 'kid', 'Không phát difficulty:change');
  OG.Scenes.go('menu'); await stepAsync(3);
  stage = 'journey:menu';
  if (click('#overlay [data-act="journey"]', 'PHIÊU LƯU HỌC TẬP')) {
    await stepAsync(3);
    expectScene('journeySelect', 'menu → chọn hành trình');
    await press('Escape'); await stepAsync(2);
    expectScene('menu', 'Esc từ chọn hành trình');
  }
  for (let i = 0; i < JOURNEYS.length; i++) await playJourney(JOURNEYS[i], { pauseToMap: i === 0 });

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
