#!/usr/bin/env node
/* ============================================================================
 * tools/learn-site/check-site.mjs — CRAWL TRANG ĐÃ BUILD, TÌM LINK HỎNG
 * ----------------------------------------------------------------------------
 * Vai trò:      Đi từ /learn/ theo mọi link nội bộ (href, src) trong thư mục build, báo:
 *               link tới file không tồn tại, #anchor không có id tương ứng, trang không
 *               được link tới (orphan), và vài lỗi HTML cơ bản (thiếu <title>, meta
 *               description, canonical, nhiều <h1>, id trùng, thẻ mở/đóng lệch).
 * Khái niệm:    crawler (trình thu thập: đọc trang → lấy link → đọc tiếp, dùng hàng đợi BFS)
 *               · kiểm tra bất biến "mọi link đều mở được" trên SẢN PHẨM build, không chỉ nguồn
 * Bài học:      docs/learn/13-kiem-thu-ci.md
 * Cách chạy:    node check-site.mjs <thư mục build>     (vd ../../_site) → thoát mã 1 nếu có lỗi
 * Phạm vi:      chỉ kiểm tra link bắt đầu bằng "/" hoặc tương đối. Link ra ngoài (GitHub, CDN)
 *               không được mở (CI không cần mạng); link tới trang ngoài /learn/ (trang chủ game,
 *               /docs/credits.html) chỉ được kiểm tra nếu file có trong thư mục build.
 * ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve(process.argv[2] || '../../_site');
const START = '/learn/';
if (!fs.existsSync(path.join(OUT, 'learn', 'index.html'))) {
  console.error('Không thấy ' + path.join(OUT, 'learn', 'index.html') + ' — hãy chạy build.mjs trước.');
  process.exit(2);
}

/** Đường dẫn URL → file trên đĩa ("/learn/x/" → learn/x/index.html). */
function fileFor(urlPath) {
  let p = decodeURIComponent(urlPath);
  if (p.endsWith('/')) p += 'index.html';
  return path.join(OUT, p.replace(/^\//, ''));
}

/** Gỡ entity HTML hay gặp trong thuộc tính href. */
const unent = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

const errors = [];
const warnings = [];
/** Link tới file ngoài /learn/ chưa có trong thư mục build: đích → số lần (gộp để báo gọn). */
const outside = new Map();
const visited = new Set();
const idsCache = new Map();
const queue = [START];
let linksChecked = 0;
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

function idsOf(file) {
  if (!idsCache.has(file)) {
    const html = fs.readFileSync(file, 'utf8');
    idsCache.set(file, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => unent(m[1]))));
  }
  return idsCache.get(file);
}

/** Kiểm tra HTML cơ bản của một trang. */
function validate(urlPath, html) {
  const where = urlPath + ': ';
  if (!/^<!doctype html>/i.test(html)) errors.push(where + 'thiếu <!doctype html>');
  if (!/<html lang="vi">/.test(html)) errors.push(where + 'thiếu lang="vi"');
  if (!/<title>[^<]{5,}<\/title>/.test(html)) errors.push(where + 'thiếu <title>');
  if (!/<meta name="description" content="[^"]{30,}">/.test(html)) errors.push(where + 'thiếu/ngắn meta description');
  if (!/<link rel="canonical" href="https?:\/\/[^"]+">/.test(html)) errors.push(where + 'thiếu canonical');
  if (!/application\/ld\+json/.test(html)) errors.push(where + 'thiếu JSON-LD');
  const h1 = (html.match(/<h1[\s>]/g) || []).length;
  if (h1 !== 1) errors.push(where + 'có ' + h1 + ' thẻ <h1> (cần đúng 1)');
  // id trùng làm #anchor nhảy sai chỗ.
  const seen = new Map();
  for (const m of html.matchAll(/\sid="([^"]+)"/g)) seen.set(m[1], (seen.get(m[1]) || 0) + 1);
  for (const [id, n] of seen) if (n > 1) errors.push(where + 'id trùng "' + id + '" (' + n + ' lần)');
  // JSON-LD phải parse được.
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(m[1]); } catch (e) { errors.push(where + 'JSON-LD hỏng: ' + e.message); }
  }
  // Cân bằng thẻ: bỏ <script>, <style>, <pre>, comment rồi đếm thẻ mở/đóng (bỏ thẻ rỗng).
  const body = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '').replace(/<pre[\s\S]*?<\/pre>/g, '<pre></pre>');
  const stack = [];
  for (const m of body.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/?)>/g)) {
    const [, close, rawName] = m; const name = rawName.toLowerCase();
    if (VOID.has(name) || m[3] === '/') continue;
    if (!close) { stack.push(name); continue; }
    // Thẻ <p>/<li> có thể đóng ngầm theo chuẩn HTML → bỏ qua khi lệch do chúng.
    while (stack.length && stack[stack.length - 1] !== name && ['p', 'li'].includes(stack[stack.length - 1])) stack.pop();
    if (stack[stack.length - 1] === name) stack.pop();
    else { errors.push(where + 'thẻ đóng </' + name + '> không khớp (đang mở: <' + (stack[stack.length - 1] || '—') + '>)'); break; }
  }
  const left = stack.filter((t) => !['p', 'li'].includes(t));
  if (left.length) errors.push(where + 'thẻ chưa đóng: ' + left.slice(-3).join(', '));
}

while (queue.length) {
  const urlPath = queue.shift();
  if (visited.has(urlPath)) continue;
  visited.add(urlPath);
  const file = fileFor(urlPath);
  const html = fs.readFileSync(file, 'utf8');
  validate(urlPath, html);
  const baseDir = urlPath.endsWith('/') ? urlPath : path.posix.dirname(urlPath) + '/';
  for (const m of html.matchAll(/\s(?:href|src)="([^"]*)"/g)) {
    const raw = unent(m[1]);
    if (!raw || /^(https?:|mailto:|data:|javascript:)/i.test(raw) || raw.startsWith('//')) continue;
    linksChecked++;
    const [pathPart, hash] = raw.split('#');
    let target = pathPart === '' ? urlPath : pathPart.startsWith('/') ? pathPart : path.posix.normalize(baseDir + pathPart);
    target = target.split('?')[0];
    let tf = fileFor(target);
    if (!fs.existsSync(tf) && !target.endsWith('/') && fs.existsSync(path.join(tf, 'index.html'))) tf = path.join(tf, 'index.html');
    if (!fs.existsSync(tf)) {
      // Trang ngoài /learn/ (trò chơi, /docs/...) chỉ có khi build đầy đủ như CI; build riêng learn thì chỉ cảnh báo.
      if (target.startsWith('/learn/')) errors.push(urlPath + ': link hỏng → ' + raw);
      else outside.set(target, (outside.get(target) || 0) + 1);
      continue;
    }
    if (hash && /\.html$/.test(tf) && !idsOf(tf).has(decodeURIComponent(hash))) {
      errors.push(urlPath + ': anchor không tồn tại → ' + raw);
    }
    if (target.startsWith('/learn/') && (target.endsWith('/') || target.endsWith('.html'))) queue.push(target);
  }
}

// Trang có trên đĩa nhưng không ai link tới.
const all = [];
(function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full);
    else if (ent.name === 'index.html') all.push('/' + path.relative(OUT, path.dirname(full)).split(path.sep).join('/') + '/');
  }
})(path.join(OUT, 'learn'));
for (const u of all) if (!visited.has(u)) warnings.push('trang không được link tới (orphan): ' + u);

// Sitemap phải liệt kê đủ mọi trang.
const sm = fs.readFileSync(path.join(OUT, 'learn', 'sitemap.xml'), 'utf8');
for (const u of all) if (!sm.includes(u + '</loc>')) errors.push('sitemap thiếu ' + u);

console.log('check-site: ' + visited.size + ' trang đã crawl / ' + all.length + ' trang có trên đĩa, ' + linksChecked + ' link nội bộ đã kiểm tra.');
for (const [t, n] of outside) warnings.unshift('chưa có trong thư mục build (bình thường nếu chỉ build riêng /learn/): ' + t + ' (' + n + ' link)');
for (const w of warnings) console.warn('  cảnh báo: ' + w);
if (errors.length) {
  console.error('LỖI (' + errors.length + '):');
  for (const e of errors.slice(0, 200)) console.error('  ' + e);
  process.exit(1);
}
console.log('SẠCH — không có link hỏng, anchor hỏng hay lỗi HTML cơ bản.');
