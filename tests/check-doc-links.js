/* ============================================================================
 * tests/check-doc-links.js — KIỂM TRA LINK TƯƠNG ĐỐI TRONG GIÁO TRÌNH
 * ----------------------------------------------------------------------------
 * Vai trò:      Quét mọi file .md trong docs/learn/ (kể cả solutions/), tìm link
 *               Markdown dạng [chữ](đích) và <a href="đích">, rồi báo link tương
 *               đối nào trỏ tới file KHÔNG tồn tại. Chạy tay hoặc trong CI.
 * Khái niệm:    kiểm tra tĩnh (static check: kiểm tra không cần chạy game) ·
 *               bất biến của tài liệu ("mọi link đều mở được")
 * Bài học:      docs/learn/13-kiem-thu-ci.md
 * Cách chạy:    node tests/check-doc-links.js   → in "SẠCH" và thoát mã 0,
 *               có link gãy thì in danh sách và thoát mã 1.
 * Phạm vi:      chỉ kiểm tra link tương đối tới FILE. Bỏ qua http(s)://, mailto:,
 *               link chỉ có #anchor; phần #anchor sau tên file không được kiểm tra.
 * ========================================================================== */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var LEARN_DIR = path.join(ROOT, 'docs', 'learn');

/** Liệt kê đệ quy mọi file .md dưới thư mục dir. */
function listMarkdown(dir) {
  var out = [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (ent) {
    var full = path.join(dir, ent.name);
    if (ent.isDirectory()) out = out.concat(listMarkdown(full));
    else if (/\.md$/i.test(ent.name)) out.push(full);
  });
  return out;
}

/**
 * Bỏ các khối code ``` ... ``` và code nội dòng `...` để không bắt nhầm
 * "link" nằm trong ví dụ code (vd `arr[i](x)`).
 * ⚠️ Bẫy: thay bằng khoảng trắng cùng số dòng thì số dòng báo lỗi vẫn đúng.
 */
function stripCode(text) {
  return text
    .replace(/```[\s\S]*?```/g, function (m) { return m.replace(/[^\n]/g, ' '); })
    .replace(/`[^`\n]*`/g, function (m) { return ' '.repeat(m.length); });
}

/** Trả về true nếu đích là link ngoài hoặc chỉ là anchor trong cùng file. */
function isSkipped(target) {
  return /^[a-z][a-z0-9+.-]*:/i.test(target) || target.charAt(0) === '#' || target === '';
}

var broken = [];
var checked = 0;
var files = listMarkdown(LEARN_DIR);

files.forEach(function (file) {
  var lines = stripCode(fs.readFileSync(file, 'utf8')).split('\n');
  lines.forEach(function (line, idx) {
    // [chữ](đích "tiêu đề tuỳ chọn") và <a href="đích">
    var re = /\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)|href="([^"]+)"/g;
    var m;
    while ((m = re.exec(line))) {
      var target = m[1] || m[2];
      if (isSkipped(target)) continue;
      var filePart = decodeURIComponent(target.split('#')[0].split('?')[0]);
      checked++;
      var resolved = path.resolve(path.dirname(file), filePart);
      if (!fs.existsSync(resolved)) {
        broken.push(path.relative(ROOT, file).replace(/\\/g, '/') + ':' + (idx + 1) + '  →  ' + target);
      }
    }
  });
});

if (broken.length) {
  console.error('LINK GÃY (' + broken.length + '/' + checked + '):');
  broken.forEach(function (b) { console.error('  ' + b); });
  process.exit(1);
}
console.log('SẠCH — ' + checked + ' link tương đối trong ' + files.length + ' file .md đều trỏ tới file tồn tại.');
