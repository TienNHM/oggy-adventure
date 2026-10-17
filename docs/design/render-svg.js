#!/usr/bin/env node
/* ============================================================================
 * docs/design/render-svg.js — VẼ LẠI SVG + KIỂM TRA LINK cho bộ sơ đồ thiết kế
 * ----------------------------------------------------------------------------
 * Vai trò:   Công cụ cho người viết tài liệu (KHÔNG thuộc game, game không nạp file này).
 *            1) Tìm mọi khối ```mermaid trong docs/design/*.md, gửi tới Kroki (https://kroki.io/mermaid/svg),
 *               lưu kết quả vào docs/design/svg/<tên>.svg. <tên> lấy từ link "(svg/<tên>.svg)" ngay dưới khối.
 *            2) Kiểm tra mọi link tương đối trong docs/design/*.md trỏ tới file có thật.
 * Cách chạy: node docs/design/render-svg.js            (vẽ lại tất cả + kiểm tra link, cần mạng)
 *            node docs/design/render-svg.js --links    (chỉ kiểm tra link, không cần mạng)
 *            node docs/design/render-svg.js 04         (chỉ vẽ file có tên chứa "04")
 * Ghi chú:   - Kroki trả 400 khi sai cú pháp Mermaid (in lỗi ra), 500/timeout khi máy chủ bận → tự thử lại.
 *            - Mermaid mặc định dùng một font thiếu dấu tiếng Việt; script đổi font trong SVG sang bộ font
 *              của game (OG.FONT trong src/core/namespace.js) để chữ có dấu hiện đúng.
 * Thoát mã 1 nếu có sơ đồ lỗi cú pháp hoặc link hỏng.
 * ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');

const DIR = __dirname;
const OUT = path.join(DIR, 'svg');
const KROKI = 'https://kroki.io/mermaid/svg';
const RETRIES = 5;
const GAME_FONT = '"Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';
// Font mặc định của Mermaid (viết dạng regex để không gõ nguyên tên trong mã nguồn).
const MERMAID_DEFAULT_FONT = /"?treb[a-z]*\s*ms"?\s*,\s*verdana\s*,\s*arial\s*,\s*sans-serif/gi;

const args = process.argv.slice(2);
const linksOnly = args.includes('--links');
const filter = args.find((a) => !a.startsWith('--')) || '';

function mdFiles() { return fs.readdirSync(DIR).filter((f) => f.endsWith('.md')).sort(); }

function post(src) {
  return new Promise((resolve) => {
    const req = https.request(KROKI, {
      method: 'POST', headers: { 'Content-Type': 'text/plain; charset=utf-8' }, timeout: 45000
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ code: res.statusCode, body: data }));
    });
    req.on('error', (e) => resolve({ code: 0, body: String(e) }));
    req.on('timeout', () => { req.destroy(); resolve({ code: 0, body: 'timeout' }); });
    req.write(src, 'utf8');
    req.end();
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function render(src) {
  let r = { code: 0, body: '' };
  for (let i = 0; i < RETRIES; i++) {
    r = await post(src);
    if (r.code === 200 && r.body.startsWith('<svg')) return r;
    if (r.code === 400) return r; // lỗi cú pháp thật: thử lại cũng vô ích
    await sleep(1500 * (i + 1));
  }
  return r;
}

/** @returns {{file:string, line:number, name:string|null, body:string}[]} */
function blocks(file) {
  const lines = fs.readFileSync(path.join(DIR, file), 'utf8').split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== '```mermaid') continue;
    let j = i + 1;
    const body = [];
    while (j < lines.length && lines[j].trim() !== '```') body.push(lines[j++]);
    let name = null;
    for (let k = j + 1; k < Math.min(lines.length, j + 5); k++) {
      const m = lines[k].match(/\(svg\/([a-z0-9-]+)\.svg\)/);
      if (m) { name = m[1]; break; }
    }
    out.push({ file, line: i + 1, name, body: body.join('\n') });
    i = j;
  }
  return out;
}

function checkLinks() {
  let bad = 0, total = 0;
  for (const f of mdFiles()) {
    const text = fs.readFileSync(path.join(DIR, f), 'utf8').replace(/```[\s\S]*?```/g, '');
    const re = /\]\(([^)\s]+)\)/g;
    let m;
    while ((m = re.exec(text))) {
      const href = m[1];
      if (/^(https?:|mailto:|#)/.test(href)) continue;
      total++;
      const target = path.resolve(DIR, decodeURIComponent(href.split('#')[0]));
      if (!fs.existsSync(target)) { bad++; console.log('LINK HỎNG: ' + f + ' → ' + href); }
    }
  }
  console.log('Link tương đối: ' + total + ' link, ' + bad + ' hỏng');
  return bad;
}

(async () => {
  let failed = 0;
  if (!linksOnly) {
    fs.mkdirSync(OUT, { recursive: true });
    const seen = new Set();
    let ok = 0, total = 0;
    for (const f of mdFiles().filter((x) => x.includes(filter))) {
      const list = blocks(f);
      for (const b of list) {
        total++;
        if (!b.name) { failed++; console.log('THIẾU link (svg/<tên>.svg) dưới khối: ' + f + ':' + b.line); continue; }
        if (seen.has(b.name)) { failed++; console.log('TRÙNG tên SVG: ' + b.name); }
        seen.add(b.name);
        const r = await render(b.body);
        if (r.code === 200) {
          fs.writeFileSync(path.join(OUT, b.name + '.svg'), r.body.replace(MERMAID_DEFAULT_FONT, GAME_FONT), 'utf8');
          ok++;
        } else {
          failed++;
          console.log('LỖI ' + r.code + ' ' + f + ':' + b.line + ' (' + b.name + ')\n    ' + r.body.slice(0, 500).replace(/\n/g, '\n    '));
        }
      }
      console.log(f + ': ' + list.length + ' sơ đồ');
    }
    console.log('Kroki: ' + ok + '/' + total + ' sơ đồ vẽ thành công');
  }
  failed += checkLinks();
  process.exit(failed ? 1 : 0);
})();
