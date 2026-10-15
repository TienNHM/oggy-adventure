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
