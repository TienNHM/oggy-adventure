#!/usr/bin/env node
/* ============================================================================
 * tools/learn-site/build.mjs — DỰNG SẴN (PRE-RENDER) TRANG WEB GIÁO TRÌNH /learn/
 * ----------------------------------------------------------------------------
 * Vai trò:      Đọc các file Markdown của giáo trình (docs/learn/, docs/learn/solutions/, docs/design/)
 *               rồi sinh ra trang HTML tĩnh cho từng bài, một landing page cho khoá học, sitemap
 *               và copy CSS/ảnh. Chạy lúc deploy (CI) hoặc trên máy bạn để xem trước.
 * Khái niệm:    static site generation (SSG: sinh HTML một lần lúc build thay vì render bằng JS
 *               phía trình duyệt) · SEO/GEO (nội dung có sẵn trong HTML nên máy tìm kiếm và trợ lý AI
 *               đọc được ngay) · dữ liệu có cấu trúc JSON-LD · kiểm tra link lúc build (fail fast)
 * Bài học:      docs/learn/13-kiem-thu-ci.md (CI chạy script này sau smoke test)
 * Phụ thuộc:    marked (Markdown → HTML), marked-gfm-heading-id (id cho heading GIỐNG GitHub, để
 *               link #anchor viết cho GitHub vẫn đúng), highlight.js (tô màu code lúc build).
 *               Chỉ cài trong tools/learn-site/ — game KHÔNG phụ thuộc gì và vẫn chạy qua file://.
 * Cách chạy:    cd tools/learn-site && npm ci
 *               node build.mjs --out ../../_site                (tạo ../../_site/learn/...)
 *               python -m http.server -d ../../_site 8000       (mở http://localhost:8000/learn/)
 * Tuỳ chọn:     --out <thư mục>      bắt buộc; trang khoá học nằm ở <thư mục>/learn/
 *               --base-url <url>     địa chỉ site cho canonical/sitemap (mặc định site thật)
 *               --allow-broken       link gãy chỉ in CẢNH BÁO thay vì thoát mã 1 (dùng khi đang
 *                                    viết dở tài liệu; CI KHÔNG dùng cờ này)
 * Đầu ra:       <out>/learn/index.html, <out>/learn/<slug>/index.html, <out>/learn/sitemap.xml,
 *               <out>/sitemap.xml (ghi đè bằng bản đầy đủ: URL trong sitemap.xml gốc + mọi trang learn)
 * Đọc tiếp:     tools/learn-site/check-site.mjs (crawl trang đã build để tìm link hỏng)
 * ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Marked } from 'marked';
import { gfmHeadingId, getHeadingList } from 'marked-gfm-heading-id';
import hljs from 'highlight.js';

// ---------------------------------------------------------------------------
// 1. Cấu hình
// ---------------------------------------------------------------------------

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');          // gốc repo
const LEARN_DIR = path.join(ROOT, 'docs', 'learn');
const DESIGN_DIR = path.join(ROOT, 'docs', 'design');

const REPO = 'https://github.com/TienNHM/oggy-adventure';
const BRANCH = 'master';
const COURSE_NAME = 'Học lập trình game với Oggy';
const MERMAID_CDN = 'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js';

/** Đọc tham số dòng lệnh dạng --ten giá-trị. */
function parseArgs(argv) {
  const out = { out: null, baseUrl: 'https://oggy-adventure.tiennhm.io.vn', allowBroken: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') out.out = argv[++i];
    else if (a === '--base-url') out.baseUrl = argv[++i];
    else if (a === '--allow-broken') out.allowBroken = true;
    else { console.error('Tham số lạ: ' + a); process.exit(2); }
  }
  if (!out.out) {
    console.error('Thiếu --out <thư mục>. Ví dụ: node build.mjs --out ../../_site');
    process.exit(2);
  }
  out.baseUrl = out.baseUrl.replace(/\/+$/, '');
  out.out = path.resolve(process.cwd(), out.out);
  return out;
}

const ARGS = parseArgs(process.argv.slice(2));
const OUT = ARGS.out;
const SITE = ARGS.baseUrl;                                // vd https://oggy-adventure.tiennhm.io.vn
const abs = (u) => SITE + u;                              // URL tuyệt đối từ đường dẫn bắt đầu bằng "/"

// ---------------------------------------------------------------------------
// 2. Tiện ích nhỏ
// ---------------------------------------------------------------------------

/** Escape chữ trước khi ghép vào HTML (nội dung và thuộc tính). */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Đường dẫn repo dạng "docs/learn/02-...md" (luôn dùng "/" kể cả trên Windows). */
const toRel = (file) => path.relative(ROOT, file).split(path.sep).join('/');

/**
 * Bỏ cú pháp Markdown để lấy chữ thuần (dùng cho meta description, mô tả thẻ).
 * Chỉ xử lý các cú pháp có trong giáo trình: **đậm**, `code`, [link](url), thẻ HTML.
 */
function plain(md) {
  return String(md)
    .replace(/<[^>]+>/g, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|\s)[*_]([^*_]+)[*_](?=\s|$|[.,;:])/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Cắt chuỗi ở ranh giới từ, tối đa n ký tự, thêm "…" khi bị cắt. */
function clip(s, n) {
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 1);
  return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:.\s]+$/, '') + '…';
}

/**
 * Ngày sửa cuối của file theo git log (ISO 8601). File chưa commit (untracked) hoặc máy không có git
 * thì lấy mtime trên đĩa.
 * ⚠️ Bẫy: CI clone "nông" (fetch-depth: 1) thì mọi file đều mang ngày của commit cuối → pages.yml
 *   đặt fetch-depth: 0 để lastmod đúng.
 */
function lastModified(file) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cI', '--', toRel(file)], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    if (out) return out;
  } catch (e) { /* không có git → dùng mtime */ }
  return fs.statSync(file).mtime.toISOString();
}

/** Số phút đọc ước lượng: chữ thường ~230 tiếng/phút, code ~40 dòng/phút (đọc code chậm hơn). */
function readingMinutes(md) {
  let codeLines = 0;
  const prose = md.replace(/```[\s\S]*?```/g, (m) => { codeLines += m.split('\n').length; return ' '; });
  const words = plain(prose).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 230 + codeLines / 40));
}

/** Chuỗi "2 giờ" / "1,5 giờ" → thời lượng ISO 8601 (PT2H, PT1H30M) cho JSON-LD. */
function isoDuration(hoursText) {
  const h = parseFloat(String(hoursText).replace(',', '.'));
  if (!isFinite(h)) return undefined;
  const H = Math.floor(h), M = Math.round((h - H) * 60);
  const body = (H ? H + 'H' : '') + (M ? M + 'M' : '');
  return 'PT' + (body || '0M');
}

/** JSON-LD an toàn để nhúng trong <script>: "</script>" trong chữ không được đóng thẻ sớm. */
const jsonLd = (obj) => '<script type="application/ld+json">' +
  JSON.stringify(obj, null, 0).replace(/</g, '\\u003c') + '</script>';

function writeFile(rel, content) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

// ---------------------------------------------------------------------------
// 3. Danh mục trang: file .md nào thành URL nào
// ---------------------------------------------------------------------------
// 💡 Khái niệm: "routing tĩnh" — quyết định URL của mọi trang TRƯỚC khi render, để lúc đổi link
//   tương đối "../02-game-loop-delta-time.md" ta biết ngay nó thành "/learn/02-game-loop-delta-time/".

/** @type {Map<string, Page>} khoá = đường dẫn repo của file .md */
const pagesBySrc = new Map();
/** @type {Page[]} */
const pages = [];

/**
 * @typedef {Object} Page
 * @property {string} kind      'lesson' | 'solution' | 'guide' | 'doc' | 'design'
 * @property {string} src       đường dẫn tuyệt đối file .md
 * @property {string} rel       đường dẫn repo của file .md
 * @property {string} url       đường dẫn trên site, luôn kết thúc bằng "/"
 * @property {string} slug
 * @property {string} [num]     số bài "02" (lesson, solution)
 */
function addPage(kind, file, url, extra) {
  const p = Object.assign({ kind, src: file, rel: toRel(file), url, slug: path.basename(file, '.md') }, extra || {});
  pagesBySrc.set(p.rel, p);
  pages.push(p);
  return p;
}

const listMd = (dir) => fs.existsSync(dir)
  ? fs.readdirSync(dir).filter((f) => /\.md$/i.test(f)).sort((a, b) => a.localeCompare(b))
  : [];

// Bài học 00–13 và lời giải cùng tên.
for (const f of listMd(LEARN_DIR)) {
  const file = path.join(LEARN_DIR, f);
  const slug = f.replace(/\.md$/i, '');
  const m = /^(\d{2})-/.exec(f);
  if (m) addPage('lesson', file, '/learn/' + slug + '/', { num: m[1] });
  else if (f === 'README.md') addPage('guide', file, '/learn/huong-dan/', { slug: 'huong-dan' });
  else if (f === 'ARCHITECTURE-DIAGRAMS.md') addPage('doc', file, '/learn/architecture/', { slug: 'architecture' });
  else if (f === 'CODE_STYLE.md') addPage('doc', file, '/learn/code-style/', { slug: 'code-style' });
  else {
    // File mới thêm sau này vẫn có trang, slug viết thường, "_" → "-".
    const s = slug.toLowerCase().replace(/_/g, '-');
    addPage('doc', file, '/learn/' + s + '/', { slug: s });
  }
}
for (const f of listMd(path.join(LEARN_DIR, 'solutions'))) {
  const file = path.join(LEARN_DIR, 'solutions', f);
  const slug = f.replace(/\.md$/i, '');
  const m = /^(\d{2})-/.exec(f);
  addPage('solution', file, '/learn/solutions/' + slug + '/', { num: m ? m[1] : undefined });
}
// Tài liệu thiết kế: lấy MỌI file .md có mặt lúc build (thư mục có thể đang được viết thêm).
for (const f of listMd(DESIGN_DIR)) {
  const file = path.join(DESIGN_DIR, f);
  const slug = f.replace(/\.md$/i, '').toLowerCase();
  addPage('design', file, f === 'README.md' ? '/learn/design/' : '/learn/design/' + slug + '/',
    { slug: f === 'README.md' ? 'design' : slug, isIndex: f === 'README.md' });
}

const lessons = pages.filter((p) => p.kind === 'lesson');
const solutions = pages.filter((p) => p.kind === 'solution');
const designs = pages.filter((p) => p.kind === 'design').sort((a, b) => (b.isIndex ? 1 : 0) - (a.isIndex ? 1 : 0));
const guidePage = pages.find((p) => p.kind === 'guide');

// Các trang sinh ra không từ một file .md riêng.
const LANDING_URL = '/learn/';
const SOLUTIONS_INDEX_URL = '/learn/solutions/';

// ---------------------------------------------------------------------------
// 4. Đổi link tương đối trong Markdown
// ---------------------------------------------------------------------------
// Quy tắc (theo thứ tự):
//   - http(s):, mailto:, "#anchor" → giữ nguyên.
//   - File .md có trang → URL trang (+ #anchor). README.md của giáo trình: không anchor → landing
//     /learn/, có anchor → /learn/huong-dan/#... (trang hiển thị đầy đủ README).
//   - Thư mục giáo trình/thiết kế → trang mục lục tương ứng.
//   - Ảnh (.svg .png .jpg .gif .webp) → copy sang <out>/learn/media/... và link tới bản copy.
//   - Trang HTML đã deploy trong docs/ (vd docs/credits.html) → đường dẫn trên site.
//   - Còn lại (mã nguồn, tests/, tools/, index.html, .md khác) → xem trên GitHub.
// ⚠️ Bẫy: đích không tồn tại thì GHI LỖI (build thoát mã 1) thay vì lặng lẽ sinh link chết.

const IMAGE_RE = /\.(svg|png|jpe?g|gif|webp|avif)$/i;
/** @type {Map<string, string>} ảnh cần copy: đường dẫn repo → đường dẫn trên site */
const mediaToCopy = new Map();
/** @type {string[]} */
const linkErrors = [];
/** File .md đang được render — walkTokens cần biết để giải link tương đối. */
let currentSrc = null;

function mediaUrlFor(rel) {
  // docs/design/svg/x.svg → /learn/design/svg/x.svg; docs/learn/a.png → /learn/a.png; khác → /learn/media/<rel>
  let u;
  if (rel.startsWith('docs/design/')) u = '/learn/design/' + rel.slice('docs/design/'.length);
  else if (rel.startsWith('docs/learn/')) u = '/learn/' + rel.slice('docs/learn/'.length);
  else u = '/learn/media/' + rel;
  mediaToCopy.set(rel, u);
  return encodeURI(u);
}

function rewriteHref(href, fromFile) {
  if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#') || href.startsWith('//')) return href;
  const hashAt = href.indexOf('#');
  const hash = hashAt >= 0 ? href.slice(hashAt) : '';
  const filePart = (hashAt >= 0 ? href.slice(0, hashAt) : href).split('?')[0];
  let target;
  try { target = path.resolve(path.dirname(fromFile), decodeURIComponent(filePart)); }
  catch (e) { target = path.resolve(path.dirname(fromFile), filePart); }
  if (!fs.existsSync(target)) {
    linkErrors.push(toRel(fromFile) + '  →  ' + href);
    return href;
  }
  const rel = toRel(target);
  const isDir = fs.statSync(target).isDirectory();

  if (isDir) {
    if (rel === 'docs/learn') return LANDING_URL + hash;
    if (rel === 'docs/learn/solutions') return SOLUTIONS_INDEX_URL + hash;
    if (rel === 'docs/design') return '/learn/design/' + hash;
    return REPO + '/tree/' + BRANCH + '/' + encodeURI(rel) + hash;
  }
  if (rel === 'docs/learn/README.md') return (hash ? guidePage.url : LANDING_URL) + hash;
  const page = pagesBySrc.get(rel);
  if (page) return page.url + hash;
  if (IMAGE_RE.test(rel)) return mediaUrlFor(rel);
  if (/^docs\/[^/]+\.html$/i.test(rel)) return '/' + rel + hash;
  return REPO + '/blob/' + BRANCH + '/' + encodeURI(rel) + hash;
}

/** Đổi href="..." / src="..." trong khối HTML thô viết trong Markdown. */
const rewriteHtmlAttrs = (html, fromFile) =>
  html.replace(/\b(href|src)="([^"]*)"/g, (m, attr, v) => attr + '="' + esc(rewriteHref(v, fromFile)) + '"');

// ---------------------------------------------------------------------------
// 5. Bộ chuyển Markdown → HTML
// ---------------------------------------------------------------------------

/** Tên ngôn ngữ trong ```lang → tên highlight.js. */
/** Thẻ HTML được phép viết thẳng trong Markdown; thẻ khác bị escape thành chữ. */
const KNOWN_TAGS = new Set(('a abbr b br code dd del details div dl dt em h1 h2 h3 h4 h5 h6 hr i img ins kbd li mark ol p pre ' +
  'q s samp small span strong sub summary sup table tbody td th thead tr u ul var picture source figure figcaption').split(' '));
const LANG_ALIAS = { js: 'javascript', jsonc: 'json', ts: 'typescript', html: 'xml', text: 'plaintext', sh: 'bash', yml: 'yaml' };

const md = new Marked(
  gfmHeadingId(),
  {
    gfm: true,
    // walkTokens chạy trên MỌI token trước khi render: chỗ hợp lý để đổi link một lần.
    walkTokens(token) {
      if (!currentSrc) return;
      if (token.type === 'link' || token.type === 'image') token.href = rewriteHref(token.href, currentSrc);
      else if (token.type === 'html') {
        // ⚠️ Bẫy: Markdown viết "Lỗi khi load <file>" thì marked coi <file> là thẻ HTML và trình duyệt
        //   nuốt mất chữ. GitHub lọc thẻ lạ; ở đây ta escape để chữ hiện đúng như người viết muốn.
        const tag = /^<\/?([a-zA-Z][\w-]*)/.exec(token.text.trim());
        if (tag && !KNOWN_TAGS.has(tag[1].toLowerCase())) { token.text = esc(token.text); if (token.raw) token.raw = token.text; return; }
        token.text = rewriteHtmlAttrs(token.text, currentSrc);
        if (token.raw) token.raw = token.text;
      }
    },
    renderer: {
      code({ text, lang }) {
        const name = String(lang || '').trim().split(/\s+/)[0].toLowerCase();
        // 💡 Khái niệm: Mermaid giữ NGUYÊN chữ nguồn trong HTML (máy tìm kiếm đọc được), trình duyệt mới vẽ.
        if (name === 'mermaid') {
          return '<div class="diagram"><pre class="mermaid">' + esc(fixMermaid(text)) + '</pre></div>\n';
        }
        const hl = LANG_ALIAS[name] || name || 'plaintext';
        let body;
        if (hl !== 'plaintext' && hljs.getLanguage(hl)) {
          body = hljs.highlight(text, { language: hl, ignoreIllegals: true }).value;
        } else body = esc(text);
        const label = name && name !== 'text' ? name : 'text';
        return '<div class="code"><div class="code-head"><span class="code-lang">' + esc(label) +
          '</span><button type="button" class="copy-btn" aria-label="Sao chép đoạn code">Sao chép</button></div>' +
          '<pre><code class="hljs language-' + esc(hl) + '">' + body + '</code></pre></div>\n';
      }
    }
  }
);

/**
 * Sửa lỗi cú pháp Mermaid hay gặp, CHỈ trong bản HTML (file .md gốc không đổi).
 * ⚠️ Bẫy: trong stateDiagram, nhãn chuyển trạng thái "A --> B : nhãn" kết thúc ở dấu ":" đầu tiên;
 *   nhãn có thêm ":" (vd tên event 'level:clear') làm Mermaid 11 báo "Parse error". Ta thay các dấu ":"
 *   trong nhãn bằng mã thực thể "#58;" mà Mermaid tự đổi lại thành ":" khi vẽ.
 */
function fixMermaid(src) {
  // ⚠️ Bẫy (sequenceDiagram): ";" là dấu ngắt câu lệnh, nên "A->>B: x; y" bị tách đôi → thay bằng "#59;".
  if (/^\s*sequenceDiagram/.test(src)) {
    return src.split('\n').map((line) => {
      const m = /^(\s*[^:]*?(?:->>|-->>|->|-->|-x|--x|-\)|--\))[^:]*?:)(.*)$/.exec(line);
      return m && m[2].includes(';') ? m[1] + m[2].replace(/;/g, '#59;') : line;
    }).join('\n');
  }
  if (!/^\s*stateDiagram/.test(src)) return src;
  return src.split('\n').map((line) => {
    const m = /^(\s*[^:]*?-->[^:]*?:)(.*)$/.exec(line);
    return m && m[2].includes(':') ? m[1] + m[2].replace(/:/g, '#58;') : line;
  }).join('\n');
}

/**
 * Hậu xử lý HTML: bọc bảng để cuộn ngang, tô màu callout theo emoji đầu khối trích dẫn,
 * thêm class cho <details> gợi ý và ký hiệu # để lấy link tới từng mục.
 */
function postProcess(html) {
  return html
    .replace(/<table>/g, '<div class="table-wrap" role="region" aria-label="Bảng (cuộn ngang nếu cần)" tabindex="0"><table>')
    .replace(/<\/table>/g, '</table></div>')
    .replace(/<blockquote>\s*<p>(\s*)(⚠️|⚠|💡|🧪|✋|📌|ℹ️|✅|❗)/gu, (m, sp, emo) => {
      const kind = { '⚠️': 'warn', '⚠': 'warn', '❗': 'warn', '💡': 'tip', '🧪': 'try', '✋': 'stop', '✅': 'ok' }[emo] || 'note';
      return '<blockquote class="callout callout-' + kind + '">\n<p>' + sp + emo;
    })
    .replace(/<blockquote>/g, '<blockquote class="callout callout-note">')
    .replace(/<details>/g, '<details class="hint">')
    .replace(/<h([23]) id="([^"]+)">([\s\S]*?)<\/h\1>/g,
      (m, lv, id, inner) => '<h' + lv + ' id="' + id + '">' + inner +
        ' <a class="anchor" href="#' + id + '" aria-label="Liên kết tới mục này">#</a></h' + lv + '>');
}

/**
 * Render một file Markdown.
 * @returns {{html: string, headings: Array<{level:number,text:string,id:string}>, h1: string, srcMd: string}}
 */
function renderFile(file, { stripLessonMeta = false } = {}) {
  let src = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const h1m = /^#\s+(.+)$/m.exec(src);
  const h1 = h1m ? h1m[1].trim() : path.basename(file, '.md');
  // H1 do khung trang hiển thị riêng → bỏ khỏi thân bài.
  if (h1m) src = src.replace(h1m[0], '');
  // Dòng "> Thuộc giáo trình ... · Mục lục · Lời giải" đã có breadcrumbs và nút riêng → bỏ.
  if (stripLessonMeta) src = src.replace(/^> Thuộc giáo trình[^\n]*\n/m, '');
  currentSrc = file;
  const raw = md.parse(src);
  const headings = getHeadingList()
    .filter((h) => h.level === 2 || h.level === 3)
    .map((h) => ({ level: h.level, text: h.text, id: h.id }));
  currentSrc = null;
  return { html: postProcess(raw), headings, h1, srcMd: src };
}

/** Render Markdown một dòng (dùng cho dữ liệu lấy từ README hiển thị trên landing). */
function inline(mdText, fromFile) {
  currentSrc = fromFile;
  const h = md.parseInline(mdText);
  currentSrc = null;
  return h;
}

/** Lấy phần thân của một mục "## <tiêu đề>" (tới mục ## kế tiếp). */
function section(mdText, headingRe) {
  const lines = mdText.split('\n');
  const start = lines.findIndex((l) => /^##\s/.test(l) && headingRe.test(l));
  if (start < 0) return '';
  let end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
  if (end < 0) end = lines.length;
  return lines.slice(start + 1, end).join('\n');
}

/** Các gạch đầu dòng (- hoặc 1.) của một đoạn Markdown, đã bỏ ký hiệu đầu dòng. */
// ⚠️ Bẫy: một gạch đầu dòng có thể xuống dòng (dòng sau thụt lề) → phải nối lại, không chỉ lấy dòng đầu.
function bullets(mdText) {
  const out = [];
  for (const l of mdText.split('\n')) {
    if (/^(?:[-*]|\d+\.)\s+/.test(l)) out.push(l.replace(/^(?:[-*]|\d+\.)\s+/, '').trim());
    else if (out.length && /^\s+\S/.test(l)) out[out.length - 1] += ' ' + l.trim();
    else if (!l.trim()) continue;
    else if (out.length) break;          // gặp đoạn văn thường sau danh sách → hết danh sách
  }
  return out;
}

/** Đoạn văn đầu tiên (không phải heading, trích dẫn, bảng, code, danh sách). */
function firstParagraph(mdText) {
  const paras = mdText.replace(/```[\s\S]*?```/g, '').split(/\n\s*\n/);
  for (const p of paras) {
    const t = p.trim();
    if (!t || /^(#|>|\||<|-|\*|\d+\.|---)/.test(t)) continue;
    return t;
  }
  return '';
}

// ---------------------------------------------------------------------------
// 6. Dữ liệu khoá học lấy từ docs/learn/README.md (không chép tay lần hai)
// ---------------------------------------------------------------------------

const README_FILE = path.join(LEARN_DIR, 'README.md');
const README = fs.readFileSync(README_FILE, 'utf8').replace(/\r\n/g, '\n');

/** Bảng "Lộ trình 14 bài": | **00** | [Bắt đầu](00-bat-dau.md) | khái niệm | code | thời lượng | cần học trước | */
const roadmap = new Map();
for (const line of README.split('\n')) {
  const m = /^\|\s*\*\*(\d{2})\*\*\s*\|/.exec(line);
  if (!m) continue;
  const cells = line.split('|').slice(1, -1).map((c) => c.trim());
  const link = /\[([^\]]+)\]\(([^)]+)\)/.exec(cells[1]) || [];
  roadmap.set(m[1], {
    short: link[1] || '', concepts: cells[2] || '', code: cells[3] || '',
    hours: cells[4] || '', prereq: cells[5] || ''
  });
}

const totalMatch = /Tổng cộng khoảng \*\*(\d+) giờ\*\*, tức chừng ([^.\n]+)\./.exec(README);
const COURSE_HOURS = totalMatch ? totalMatch[1] : '36';
const COURSE_WEEKS = totalMatch ? totalMatch[2].trim() : '6–8 tuần nếu học 5 giờ mỗi tuần';

const audienceMatch = /\*\*Dành cho ai:\*\*([\s\S]*?)\n\s*\n/.exec(README);
const AUDIENCE_MD = audienceMatch ? audienceMatch[1].replace(/\s*\n\s*/g, ' ').trim() : '';

/** Ba hướng học: - **Gameplay** (khoảng 15 giờ): 00 → 01 → ... */
const tracks = [];
for (const line of README.split('\n')) {
  const m = /^- \*\*(.+?)\*\* \(khoảng (\d+) giờ\): (.+)$/.exec(line);
  if (m) tracks.push({ name: m[1], hours: m[2], nums: m[3].match(/\d{2}/g) || [] });
}

/** Bảng công cụ ở mục 2.1. */
const tools = [];
{
  const sec = (/### 2\.1[^\n]*\n([\s\S]*?)\n###/.exec(README) || [])[1] || '';
  for (const line of sec.split('\n')) {
    if (!/^\|/.test(line) || /^\|\s*-/.test(line) || /Công cụ/.test(line)) continue;
    const c = line.split('|').slice(1, -1).map((x) => x.trim());
    tools.push({ tool: c[0], use: c[1], required: c[2] });
  }
}

const ROUTE_MERMAID = (/```mermaid\n([\s\S]*?)```/.exec(section(README, /Lộ trình/)) || [])[1] || '';

// 💡 Khái niệm: mức độ suy ra từ dữ liệu có sẵn thay vì gõ tay cho 14 bài.
//   Bài 00–02 là "Nền tảng" (README ghi bắt buộc), bài ≥ 4 giờ là "Nâng cao", còn lại "Trung bình".
function levelOf(num, hoursText) {
  if (+num <= 2) return 'Nền tảng';
  return parseFloat(String(hoursText).replace(',', '.')) >= 4 ? 'Nâng cao' : 'Trung bình';
}

// ---------------------------------------------------------------------------
// 7. Render nội dung từng trang, rút meta
// ---------------------------------------------------------------------------

for (const p of pages) {
  const r = renderFile(p.src, { stripLessonMeta: p.kind === 'lesson' });
  Object.assign(p, r);
  p.lastmod = lastModified(p.src);
  p.minutes = readingMinutes(r.srcMd);
  p.title = r.h1.replace(/^Bài \d{2}\s*[—–-]\s*/, '').replace(/^Lời giải\s*[—–-]\s*/, '');
  p.titleText = plain(p.title);

  if (p.kind === 'lesson') {
    const meta = roadmap.get(p.num) || {};
    p.short = meta.short || p.titleText;
    p.hours = meta.hours || '';
    p.prereq = meta.prereq || '';
    p.concepts = meta.concepts || '';
    p.level = levelOf(p.num, p.hours);
    const goals = bullets(section(r.srcMd, /Mục tiêu/)).map(plain);
    p.goals = goals;
    // Mô tả 1 dòng cho thẻ: mục tiêu đầu tiên. Meta description: ghép vài mục tiêu, ≤ 158 ký tự.
    p.summary = goals[0] || plain(firstParagraph(r.srcMd));
    const goalText = goals.map((g) => g.replace(/[.;:]+$/, '')).map((g) => g.charAt(0).toLowerCase() + g.slice(1));
    p.description = clip('Bài ' + p.num + ' ' + p.titleText + ': ' + goalText.join('; ') + '.', 158);
    p.exercises = (r.srcMd.match(/^###\s+⭐/gm) || []).length;
  } else if (p.kind === 'solution') {
    const lesson = lessons.find((l) => l.num === p.num);
    p.lesson = lesson;
    p.titleText = plain(r.h1.replace(/^Lời giải\s*[—–-]\s*/, ''));
    p.description = clip('Lời giải và giải thích chi tiết các bài tập ⭐ ⭐⭐ ⭐⭐⭐ của ' + p.titleText +
      ' trong khoá Học lập trình game với Oggy. Hãy tự làm trước khi xem.', 158);
  } else {
    p.description = clip(plain(firstParagraph(r.srcMd)) || p.titleText, 158);
  }
}
for (const s of solutions) if (s.lesson) s.lesson.solution = s;

const TOTAL_EXERCISES = lessons.reduce((n, l) => n + (l.exercises || 0), 0);
const COURSE_DESCRIPTION = clip('Giáo trình miễn phí bằng tiếng Việt cho sinh viên đã biết JavaScript cơ bản: ' +
  lessons.length + ' bài học khái niệm làm game và design pattern (game loop, delta time, va chạm AABB, state machine, ' +
  'event bus, Canvas, Web Audio, kiểm thử và CI) qua mã nguồn thật của game Oggy Adventure.', 300);

// ---------------------------------------------------------------------------
// 8. Khung trang chung
// ---------------------------------------------------------------------------

const FAVICON = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#f27a43"/>' +
  '<text x="32" y="45" font-size="36" text-anchor="middle" font-family="Segoe UI,system-ui,Arial" font-weight="800" fill="#fff">{ }</text></svg>');
const OG_IMAGE = '/learn/assets/og-oggy.jpg';
const CSS_FILE = path.join(HERE, 'assets', 'learn.css');
// 💡 Khái niệm: cache busting — gắn ?v=<hash nội dung> vào link CSS. Sửa CSS thì hash đổi, trình duyệt
//   buộc phải tải bản mới thay vì dùng bản cũ trong cache (GitHub Pages cho cache 10 phút).
const CSS_VERSION = createHash('sha256').update(fs.readFileSync(CSS_FILE)).digest('hex').slice(0, 10);
const OG_IMAGE_SRC = path.join(ROOT, 'docs', 'screenshots', '01-menu.jpg');

/** Script nhỏ trong <head>: đặt theme đã lưu TRƯỚC khi vẽ trang (tránh nháy sáng/tối). */
const HEAD_SCRIPT = `<script>(function(){var d=document.documentElement;d.className+=' js';try{var t=localStorage.getItem('oggyLearn.theme');if(t==='dark'||t==='light')d.setAttribute('data-theme',t);}catch(e){}})();</script>`;

/**
 * JS phía trình duyệt (nhúng inline cuối <body>). Toàn bộ là tăng cường (progressive enhancement):
 * tắt JS thì nội dung, mục lục, link vẫn dùng được; chỉ mất nút sao chép, đánh dấu đã học, đổi theme.
 * ⚠️ Bẫy: localStorage có thể bị chặn (chế độ riêng tư, file://) → mọi lần đọc/ghi bọc try/catch.
 */
const BODY_SCRIPT = `<script>
(function () {
  'use strict';
  var d = document.documentElement;
  var KEY = 'oggyLearn.progress.v1';
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
  function save(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) {} }

  // ----- Theme sáng/tối: mặc định theo hệ điều hành, nút bấm ghi đè và nhớ lựa chọn -----
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function isDark() { var t = d.getAttribute('data-theme'); return t ? t === 'dark' : !!(mq && mq.matches); }
  function syncThemeBtn() {
    var b = document.getElementById('themeBtn'); if (!b) return;
    var dark = isDark();
    b.setAttribute('aria-pressed', String(dark));
    b.textContent = dark ? '☀️' : '🌙';
    b.setAttribute('aria-label', dark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối');
    b.title = b.getAttribute('aria-label');
  }
  var themeBtn = document.getElementById('themeBtn');
  if (themeBtn) themeBtn.addEventListener('click', function () {
    var next = isDark() ? 'light' : 'dark';
    d.setAttribute('data-theme', next);
    try { localStorage.setItem('oggyLearn.theme', next); } catch (e) {}
    syncThemeBtn(); renderMermaid();
  });
  if (mq && mq.addEventListener) mq.addEventListener('change', function () { syncThemeBtn(); renderMermaid(); });
  syncThemeBtn();

  // ----- Menu mục lục khoá học trên điện thoại -----
  var navBtn = document.getElementById('navBtn');
  function setNav(open) {
    document.body.classList.toggle('nav-open', open);
    if (navBtn) navBtn.setAttribute('aria-expanded', String(open));
  }
  if (navBtn) navBtn.addEventListener('click', function () { setNav(!document.body.classList.contains('nav-open')); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setNav(false); });
  var scrim = document.getElementById('scrim');
  if (scrim) scrim.addEventListener('click', function () { setNav(false); });

  // Mục lục trong trang: màn hẹp thì thu gọn sẵn để không đẩy nội dung xuống quá xa.
  var toc = document.querySelector('.toc details');
  if (toc && window.matchMedia && window.matchMedia('(max-width: 1240px)').matches) toc.removeAttribute('open');

  // ----- Tiến độ đã học -----
  function paint() {
    var p = load(), n = 0, total = 0;
    document.querySelectorAll('[data-lesson]').forEach(function (el) {
      var done = !!p[el.getAttribute('data-lesson')];
      el.classList.toggle('is-done', done);
    });
    document.querySelectorAll('[data-lesson-card]').forEach(function (el) {
      total++; if (p[el.getAttribute('data-lesson-card')]) n++;
    });
    var bar = document.getElementById('progress');
    if (bar && total) {
      bar.hidden = n === 0;
      var next = document.querySelector('[data-lesson-card]:not(.is-done) a');
      bar.querySelector('[data-count]').textContent = n + '/' + total;
      bar.querySelector('progress').value = n; bar.querySelector('progress').max = total;
      var link = bar.querySelector('[data-next]');
      if (next) { link.href = next.getAttribute('href'); link.textContent = 'Học tiếp: ' + next.getAttribute('data-title'); link.hidden = false; }
      else { link.hidden = true; }
    }
    var btn = document.getElementById('doneBtn');
    if (btn) {
      var on = !!p[btn.getAttribute('data-slug')];
      btn.setAttribute('aria-pressed', String(on));
      btn.textContent = on ? '✓ Đã học xong' : 'Đánh dấu đã học';
    }
  }
  var doneBtn = document.getElementById('doneBtn');
  if (doneBtn) doneBtn.addEventListener('click', function () {
    var p = load(), s = doneBtn.getAttribute('data-slug');
    if (p[s]) delete p[s]; else p[s] = Date.now();
    save(p); paint();
  });
  paint();

  // ----- Nút sao chép code -----
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (ok, fail) {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy') ? ok() : fail(); } catch (e) { fail(e); }
      document.body.removeChild(ta);
    });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.copy-btn');
    if (!b) return;
    var code = b.closest('.code').querySelector('code');
    copyText(code.innerText).then(function () { b.textContent = 'Đã chép ✓'; }, function () { b.textContent = 'Không chép được'; });
    setTimeout(function () { b.textContent = 'Sao chép'; }, 1800);
  });

  // ----- Mermaid: nạp từ CDN chỉ khi trang có sơ đồ; vẽ lại khi đổi theme -----
  var diagrams = Array.prototype.slice.call(document.querySelectorAll('pre.mermaid'));
  diagrams.forEach(function (el) { el.setAttribute('data-src', el.textContent); });
  var mermaidState = 0; // 0 chưa nạp, 1 đang nạp, 2 sẵn sàng
  function renderMermaid() {
    if (!diagrams.length) return;
    if (mermaidState === 0) {
      mermaidState = 1;
      var s = document.createElement('script');
      s.src = '${MERMAID_CDN}';
      s.onload = function () { mermaidState = 2; renderMermaid(); };
      s.onerror = function () { mermaidState = 0; };
      document.head.appendChild(s);
      return;
    }
    if (mermaidState !== 2 || !window.mermaid) return;
    diagrams.forEach(function (el) { el.removeAttribute('data-processed'); el.textContent = el.getAttribute('data-src'); });
    window.mermaid.initialize({
      startOnLoad: false, securityLevel: 'strict', theme: isDark() ? 'dark' : 'default',
      fontFamily: '"Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif'
    });
    window.mermaid.run({ nodes: diagrams, suppressErrors: true }).then(function () {
      // Giữ sơ đồ ở cỡ chữ thật (không co cho vừa khung): sơ đồ lớn thì khung .diagram cuộn ngang,
      // chữ vẫn đọc được trên điện thoại thay vì bị thu nhỏ li ti.
      diagrams.forEach(function (el) {
        var svg = el.querySelector('svg');
        if (svg && svg.style.maxWidth) { svg.style.width = svg.style.maxWidth; svg.style.maxWidth = 'none'; }
      });
    }).catch(function (err) { console.warn('Mermaid:', err); });
  }
  renderMermaid();
})();
</script>`;

/** Thanh trên cùng (giống nhau mọi trang). */
function topbar({ withNavBtn }) {
  return `<header class="topbar">
  <div class="topbar-in">
    ${withNavBtn ? '<button type="button" class="icon-btn nav-btn" id="navBtn" aria-controls="sidebar" aria-expanded="false" aria-label="Mở mục lục khoá học">☰</button>' : ''}
    <a class="brand" href="${LANDING_URL}"><span class="brand-logo" aria-hidden="true">🐱</span><span>Học lập trình game <b>với Oggy</b></span></a>
    <nav class="topnav" aria-label="Điều hướng chính">
      <a href="${LANDING_URL}#lo-trinh">Lộ trình</a>
      <a href="/learn/architecture/">Kiến trúc</a>
      <a href="/learn/design/">Thiết kế</a>
      <a href="${SITE}/" class="topnav-play" aria-label="Chơi game Oggy Adventure"><span aria-hidden="true">🎮</span><span class="tp-text"> Chơi game</span></a>
    </nav>
    <button type="button" class="icon-btn" id="themeBtn" aria-label="Đổi giao diện sáng/tối" aria-pressed="false">🌙</button>
  </div>
</header>`;
}

function footer() {
  return `<footer class="site-footer">
  <div class="footer-in">
    <p><b>${esc(COURSE_NAME)}</b> · giáo trình miễn phí dùng mã nguồn game <a href="${SITE}/">Oggy Adventure</a> ·
      <a href="${REPO}">Mã nguồn trên GitHub</a></p>
    <p class="muted">Oggy Adventure là dự án <b>fan-made phi thương mại</b>, không chính thức. <i>Oggy and the Cockroaches</i> ©
      Xilam Animation. Ảnh chụp trong game dùng giấy phép tự do, xem <a href="/docs/credits.html">ghi công ảnh</a>.</p>
  </div>
</footer>`;
}

/**
 * Bọc <html> đầy đủ: meta SEO, Open Graph, Twitter card, JSON-LD.
 * @param {{title:string, description:string, url:string, type?:string, ld?:Object[], body:string,
 *          bodyClass?:string, alternateMd?:string, modified?:string, published?:string}} o
 */
function htmlPage(o) {
  const canonical = abs(o.url);
  const lds = (o.ld || []).map(jsonLd).join('\n');
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="author" content="TienNHM">
<meta name="theme-color" content="#fff8ec" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#10192b" media="(prefers-color-scheme: dark)">
<meta property="og:type" content="${o.type || 'article'}">
<meta property="og:site_name" content="${esc(COURSE_NAME)}">
<meta property="og:locale" content="vi_VN">
<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${abs(OG_IMAGE)}">
<meta property="og:image:alt" content="Menu chính của game Oggy Adventure">
${o.modified ? `<meta property="article:modified_time" content="${esc(o.modified)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(o.title)}">
<meta name="twitter:description" content="${esc(o.description)}">
<meta name="twitter:image" content="${abs(OG_IMAGE)}">
${o.alternateMd ? `<link rel="alternate" type="text/markdown" href="${esc(o.alternateMd)}" title="Bản Markdown gốc">` : ''}
<link rel="icon" href="${FAVICON}">
<link rel="sitemap" type="application/xml" href="/learn/sitemap.xml">
<link rel="stylesheet" href="/learn/assets/learn.css?v=${CSS_VERSION}">
${HEAD_SCRIPT}
${lds}
</head>
<body class="${o.bodyClass || ''}">
<a class="skip-link" href="#main">Bỏ qua, tới nội dung chính</a>
${o.body}
${BODY_SCRIPT}
</body>
</html>
`;
}

// ----- Các khối dữ liệu có cấu trúc dùng lại -----

const COURSE_ID = abs(LANDING_URL) + '#course';
const PUBLISHER = { '@type': 'Organization', name: 'Oggy Adventure', url: SITE + '/', sameAs: [REPO] };
const AUTHOR = { '@type': 'Person', name: 'TienNHM', url: 'https://github.com/TienNHM' };

/** BreadcrumbList cho JSON-LD + HTML breadcrumbs. items: [{name, url}] (url cuối có thể bỏ trống). */
function breadcrumbs(items) {
  const html = '<nav class="crumbs" aria-label="Breadcrumb"><ol>' + items.map((it, i) =>
    i === items.length - 1
      ? '<li><span aria-current="page">' + esc(it.name) + '</span></li>'
      : '<li><a href="' + esc(it.url) + '">' + esc(it.name) + '</a></li>').join('') + '</ol></nav>';
  const ld = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: it.url.startsWith('http') ? it.url : abs(it.url) }))
  };
  return { html, ld };
}

const CRUMB_HOME = { name: 'Oggy Adventure', url: SITE + '/' };
const CRUMB_COURSE = { name: 'Khoá học', url: LANDING_URL };

// ---------------------------------------------------------------------------
// 9. Thanh bên (mục lục khoá) và trang tài liệu
// ---------------------------------------------------------------------------

function sidebar(current) {
  const link = (url, label, extra = '') => {
    const cur = current && current.url === url;
    return `<li><a href="${esc(url)}"${cur ? ' aria-current="page"' : ''}${extra}>${label}</a></li>`;
  };
  const lessonItems = lessons.map((l) => {
    const cur = current && (current === l || current.lesson === l);
    return `<li><a href="${l.url}" data-lesson="${esc(l.slug)}"${cur ? ' aria-current="page"' : ''}>` +
      `<span class="sb-num">${l.num}</span><span class="sb-title">${esc(l.short)}</span>` +
      `<span class="sb-done" aria-hidden="true">✓</span><span class="sr-done">(đã học)</span></a></li>`;
  }).join('');
  const inDesign = current && current.kind === 'design';
  const designItems = inDesign
    ? '<ul class="sb-sub">' + designs.filter((d) => !d.isIndex).map((d) => link(d.url, esc(d.titleText))).join('') + '</ul>'
    : '';
  const designCur = current && current.kind === 'design' && current.isIndex;
  return `<aside class="sidebar" id="sidebar" aria-label="Mục lục khoá học">
  <div class="sb-in">
    <p class="sb-head">Bắt đầu</p>
    <ul>
      ${link(LANDING_URL, 'Giới thiệu khoá học')}
      ${guidePage ? link(guidePage.url, 'Hướng dẫn học & cài đặt') : ''}
    </ul>
    <p class="sb-head">Lộ trình ${lessons.length} bài</p>
    <ol class="sb-lessons">${lessonItems}</ol>
    <p class="sb-head">Tài liệu</p>
    <ul>
      ${link('/learn/architecture/', 'Sơ đồ kiến trúc')}
      <li><a href="/learn/design/"${designCur ? ' aria-current="page"' : ''}>Thiết kế chi tiết</a>${designItems}</li>
      ${link('/learn/code-style/', 'Quy ước code & comment')}
      ${link(SOLUTIONS_INDEX_URL, 'Lời giải bài tập')}
    </ul>
  </div>
</aside>
<div class="scrim" id="scrim" aria-hidden="true"></div>`;
}

function tocBlock(headings) {
  if (!headings || headings.length < 2) return '';
  const items = headings.map((h) =>
    `<li class="toc-l${h.level}"><a href="#${esc(h.id)}">${h.text.replace(/<a [^>]*>|<\/a>/g, '')}</a></li>`).join('');
  return `<nav class="toc" aria-label="Mục lục trong trang"><details open><summary>Trong trang này</summary><ol>${items}</ol></details></nav>`;
}

function prevNext(prev, next) {
  if (!prev && !next) return '';
  const card = (p, dir) => p
    ? `<a class="pn pn-${dir}" href="${esc(p.url)}" rel="${dir}"><span class="pn-dir">${dir === 'prev' ? '← Trước' : 'Tiếp theo →'}</span><span class="pn-title">${esc(p.label)}</span></a>`
    : '<span></span>';
  return `<nav class="prevnext" aria-label="Bài trước và bài sau">${card(prev, 'prev')}${card(next, 'next')}</nav>`;
}

const editUrl = (p) => REPO + '/edit/' + BRANCH + '/' + encodeURI(p.rel);
const lessonLabel = (l) => 'Bài ' + l.num + ': ' + l.short;

/** Trang tài liệu chung (bài học, lời giải, tài liệu, thiết kế). */
function docPage(p) {
  let crumbs, kicker = '', actions = '', after = '', prev = null, next = null, ld = [], titleTag, pageType = 'article';
  const dateMod = p.lastmod;

  if (p.kind === 'lesson') {
    const i = lessons.indexOf(p);
    crumbs = breadcrumbs([CRUMB_HOME, CRUMB_COURSE, { name: 'Bài ' + p.num, url: p.url }]);
    kicker = `<p class="kicker"><span class="badge">Bài ${p.num}</span>` +
      (p.hours ? `<span>⏱ ${esc(p.hours)}</span>` : '') +
      `<span class="lvl lvl-${p.level === 'Nâng cao' ? 3 : p.level === 'Trung bình' ? 2 : 1}">${esc(p.level)}</span>` +
      `<span>📖 ${p.minutes} phút đọc</span></p>`;
    actions = `<div class="doc-actions">
      <button type="button" class="btn btn-done" id="doneBtn" data-slug="${esc(p.slug)}" aria-pressed="false">Đánh dấu đã học</button>
      ${p.solution ? `<a class="btn btn-ghost" href="${p.solution.url}">🔑 Xem lời giải</a>` : ''}
      <a class="btn btn-ghost" href="${editUrl(p)}">✏️ Sửa trang này trên GitHub</a>
    </div>
    ${p.prereq ? `<p class="prereq">Cần học trước: ${inline(p.prereq.replace(/\b(\d{2})\b/g, (m) => {
      const l = lessons.find((x) => x.num === m); return l ? `[${m}](${path.basename(l.src)})` : m;
    }), p.src)}</p>` : ''}`;
    if (p.solution) {
      after = `<aside class="callout callout-stop solution-cta">
        <p><b>✋ Hãy tự làm bài tập trước.</b> Lời giải chỉ có ích khi bạn đã thử và bị kẹt ít nhất 15 phút,
        và khi smoke test của bạn đã XANH. So sánh với lời giải sau đó để học thêm cách làm khác.</p>
        <p><a class="btn btn-ghost" href="${p.solution.url}">🔑 Xem lời giải bài ${p.num}</a></p>
      </aside>`;
    }
    prev = i > 0 ? { url: lessons[i - 1].url, label: lessonLabel(lessons[i - 1]) }
      : (guidePage ? { url: guidePage.url, label: 'Hướng dẫn học & cài đặt' } : null);
    next = i < lessons.length - 1 ? { url: lessons[i + 1].url, label: lessonLabel(lessons[i + 1]) }
      : { url: '/learn/architecture/', label: 'Sơ đồ kiến trúc' };
    titleTag = 'Bài ' + p.num + ': ' + p.titleText + ' · ' + COURSE_NAME;
    ld.push({
      '@context': 'https://schema.org',
      '@type': ['TechArticle', 'LearningResource'],
      '@id': abs(p.url) + '#article',
      headline: clip('Bài ' + p.num + ': ' + p.titleText, 110),
      name: 'Bài ' + p.num + ': ' + p.titleText,
      description: p.description,
      url: abs(p.url), mainEntityOfPage: abs(p.url),
      inLanguage: 'vi', isAccessibleForFree: true,
      dateModified: dateMod, author: AUTHOR, publisher: PUBLISHER,
      image: abs(OG_IMAGE),
      learningResourceType: 'Bài học', educationalLevel: p.level,
      timeRequired: isoDuration(p.hours),
      teaches: plain(p.concepts) || undefined,
      position: +p.num + 1,
      proficiencyLevel: p.level === 'Nền tảng' ? 'Beginner' : 'Expert',
      isPartOf: { '@type': 'Course', '@id': COURSE_ID, name: COURSE_NAME, url: abs(LANDING_URL) },
      ...(p.solution ? { hasPart: { '@type': 'LearningResource', name: 'Lời giải bài ' + p.num, url: abs(p.solution.url) } } : {})
    });
  } else if (p.kind === 'solution') {
    const i = solutions.indexOf(p);
    crumbs = breadcrumbs([CRUMB_HOME, CRUMB_COURSE, { name: 'Lời giải', url: SOLUTIONS_INDEX_URL }, { name: 'Bài ' + p.num, url: p.url }]);
    kicker = `<p class="kicker"><span class="badge badge-sol">Lời giải</span>${p.num ? `<span>Bài ${p.num}</span>` : ''}<span>📖 ${p.minutes} phút đọc</span></p>`;
    actions = `<div class="doc-actions">
      ${p.lesson ? `<a class="btn" href="${p.lesson.url}">← Quay lại bài ${p.num}</a>` : ''}
      <a class="btn btn-ghost" href="${editUrl(p)}">✏️ Sửa trang này trên GitHub</a>
    </div>`;
    const lab = (s) => 'Lời giải bài ' + s.num;
    prev = i > 0 ? { url: solutions[i - 1].url, label: lab(solutions[i - 1]) } : null;
    next = i < solutions.length - 1 ? { url: solutions[i + 1].url, label: lab(solutions[i + 1]) } : null;
    titleTag = 'Lời giải ' + p.titleText + ' · ' + COURSE_NAME;
    ld.push({
      '@context': 'https://schema.org', '@type': 'LearningResource',
      name: 'Lời giải — ' + p.titleText, description: p.description,
      url: abs(p.url), inLanguage: 'vi', isAccessibleForFree: true, dateModified: dateMod,
      learningResourceType: 'Lời giải bài tập', author: AUTHOR, publisher: PUBLISHER,
      isPartOf: { '@type': 'Course', '@id': COURSE_ID, name: COURSE_NAME, url: abs(LANDING_URL) },
      ...(p.lesson ? { isBasedOn: abs(p.lesson.url) } : {})
    });
  } else {
    const isDesign = p.kind === 'design';
    const trail = [CRUMB_HOME, CRUMB_COURSE];
    if (isDesign && !p.isIndex) trail.push({ name: 'Thiết kế', url: '/learn/design/' });
    trail.push({ name: p.titleText, url: p.url });
    crumbs = breadcrumbs(trail);
    kicker = `<p class="kicker"><span class="badge badge-doc">${isDesign ? 'Thiết kế' : p.kind === 'guide' ? 'Hướng dẫn' : 'Tài liệu'}</span><span>📖 ${p.minutes} phút đọc</span></p>`;
    actions = `<div class="doc-actions"><a class="btn btn-ghost" href="${editUrl(p)}">✏️ Sửa trang này trên GitHub</a></div>`;
    if (isDesign) {
      const i = designs.indexOf(p);
      const lab = (d) => d.titleText;
      prev = i > 0 ? { url: designs[i - 1].url, label: lab(designs[i - 1]) } : null;
      next = i < designs.length - 1 ? { url: designs[i + 1].url, label: lab(designs[i + 1]) } : null;
    } else if (p.kind === 'guide') {
      next = lessons[0] ? { url: lessons[0].url, label: lessonLabel(lessons[0]) } : null;
    }
    titleTag = p.titleText + ' · ' + COURSE_NAME;
    ld.push({
      '@context': 'https://schema.org', '@type': 'TechArticle',
      headline: clip(p.titleText, 110), description: p.description, url: abs(p.url),
      inLanguage: 'vi', isAccessibleForFree: true, dateModified: dateMod, author: AUTHOR, publisher: PUBLISHER,
      image: abs(OG_IMAGE),
      isPartOf: { '@type': 'Course', '@id': COURSE_ID, name: COURSE_NAME, url: abs(LANDING_URL) }
    });
  }
  ld.push(crumbs.ld);

  const h1 = p.kind === 'lesson' ? `<span class="h1-num">Bài ${p.num}</span> ${inline(p.title, p.src)}`
    : p.kind === 'solution' ? `Lời giải: ${inline(p.title.replace(/^Bài \d{2}:\s*/, ''), p.src)}`
      : inline(p.title, p.src);

  const body = `${topbar({ withNavBtn: true })}
<div class="page">
  <main id="main" class="doc" tabindex="-1">
    <header class="doc-head">
      ${crumbs.html}
      ${kicker}
      <h1>${h1}</h1>
      ${actions}
    </header>
    ${tocBlock(p.headings)}
    <article class="prose">
${p.html}
    </article>
    <div class="doc-foot">
      ${after}
      ${prevNext(prev, next)}
      <p class="muted small">Cập nhật: <time datetime="${esc(dateMod)}">${esc(dateMod.slice(0, 10))}</time> ·
        <a href="${editUrl(p)}">Sửa trang này trên GitHub</a> ·
        <a href="${REPO}/blob/${BRANCH}/${encodeURI(p.rel)}">Xem bản Markdown gốc</a></p>
    </div>
  </main>
  ${sidebar(p)}
</div>
${footer()}`;

  return htmlPage({
    title: titleTag, description: p.description, url: p.url, ld, body,
    bodyClass: 'kind-' + p.kind, modified: dateMod, type: pageType,
    alternateMd: '/' + p.rel
  });
}

// ---------------------------------------------------------------------------
// 10. Landing page /learn/
// ---------------------------------------------------------------------------

const FAQ = [
  ['Học khoá này như thế nào?',
    'Đi lần lượt bài 00 → 02 (bắt buộc), sau đó theo mũi tên "cần học trước" hoặc một trong ba hướng học. Mỗi bài có mục tiêu, khái niệm, phần dẫn đọc đúng file trong mã nguồn, thí nghiệm 🧪 làm ngay trong DevTools và 3 bài tập từ dễ đến khó. Làm mỗi bài tập trên một nhánh Git riêng.'],
  ['Cần cài những gì?',
    'Một trình duyệt mới (Chrome, Edge hoặc Firefox), Git và Node.js 20 trở lên để chạy smoke test. Nên dùng VS Code. Dự án không có package.json, không cần npm install: mở index.html là chơi được.'],
  ['Cần biết gì trước khi học?',
    'JavaScript cơ bản: biến, hàm, mảng, object, vòng lặp, callback và DOM (getElementById, addEventListener). Giáo trình không dạy lại cú pháp JS.'],
  ['Có lời giải bài tập không?',
    'Có. Mỗi bài có một trang lời giải riêng, giải thích vì sao làm như vậy. Hãy tự làm trước và chỉ mở lời giải để so sánh sau khi smoke test của bạn đã XANH, vì phần tự tìm ra mới là lúc học được nhiều nhất.'],
  ['Khoá học có mất phí không?',
    'Không. Giáo trình và mã nguồn đều miễn phí. Oggy Adventure là dự án fan-made phi thương mại.'],
  ['Mất bao lâu để học xong?',
    'Khoảng ' + COURSE_HOURS + ' giờ, tức chừng ' + COURSE_WEEKS + '. Nếu ít thời gian, chọn một hướng học khoảng 15 giờ: Gameplay, Đồ hoạ và âm thanh, hoặc Kiến trúc phần mềm.']
];

function landingPage() {
  const first = lessons[0];
  const dateMod = pages.map((p) => p.lastmod).sort().pop();

  const cards = lessons.map((l) => {
    const lv = l.level === 'Nâng cao' ? 3 : l.level === 'Trung bình' ? 2 : 1;
    return `<li class="lesson-card" data-lesson-card="${esc(l.slug)}" data-lesson="${esc(l.slug)}">
      <a href="${l.url}" data-title="Bài ${l.num} · ${esc(l.short)}">
        <span class="lc-top"><span class="lc-num">${l.num}</span><span class="lc-check" aria-hidden="true">✓</span><span class="sr-done">(đã học)</span></span>
        <span class="lc-title">${esc(l.titleText)}</span>
        <span class="lc-desc">${esc(clip(l.summary, 150))}</span>
        <span class="lc-meta"><span>⏱ ${esc(l.hours)}</span><span class="lvl lvl-${lv}">${esc(l.level)}</span>${l.exercises ? `<span>✍️ ${l.exercises} bài tập</span>` : ''}</span>
      </a>
    </li>`;
  }).join('\n');

  // "Bạn sẽ học được gì": 2 khái niệm đầu của mỗi bài trong bảng lộ trình README.
  const learn = lessons.map((l) => {
    const cs = l.concepts.split(/,\s+/).slice(0, 2).map((c) => inline(c, README_FILE)).join(', ');
    return `<li><a href="${l.url}"><span class="lc-num sm">${l.num}</span><span>${cs}</span></a></li>`;
  }).join('');

  const trackHtml = tracks.map((t) => `<li class="track"><h3>${esc(t.name)}</h3><p class="muted">khoảng ${esc(t.hours)} giờ</p>
    <p class="chain">${t.nums.map((n) => {
      const l = lessons.find((x) => x.num === n);
      return l ? `<a href="${l.url}" title="${esc(l.short)}">${n}</a>` : n;
    }).join('<span aria-hidden="true">→</span>')}</p></li>`).join('');

  const toolRows = tools.map((t) => `<tr><td>${inline(t.tool, README_FILE)}</td><td>${inline(t.use, README_FILE)}</td><td>${inline(t.required, README_FILE)}</td></tr>`).join('');

  const designList = designs.filter((d) => !d.isIndex).map((d) => `<li><a href="${d.url}">${esc(d.titleText)}</a></li>`).join('');

  const faqHtml = FAQ.map(([q, a]) => `<details class="faq"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('');

  const crumbs = breadcrumbs([CRUMB_HOME, { name: 'Khoá học lập trình game', url: LANDING_URL }]);

  const courseLd = {
    '@context': 'https://schema.org', '@type': 'Course', '@id': COURSE_ID,
    name: COURSE_NAME, alternateName: 'Lập trình game trình duyệt với Oggy Adventure',
    description: COURSE_DESCRIPTION, url: abs(LANDING_URL), inLanguage: 'vi',
    provider: PUBLISHER, author: AUTHOR, isAccessibleForFree: true,
    image: abs(OG_IMAGE), dateModified: dateMod,
    educationalLevel: 'Đại học (đã biết JavaScript cơ bản)',
    coursePrerequisites: plain(AUDIENCE_MD) || 'JavaScript cơ bản',
    timeRequired: 'PT' + COURSE_HOURS + 'H',
    numberOfCredits: undefined,
    teaches: lessons.map((l) => plain(l.concepts)).filter(Boolean),
    offers: { '@type': 'Offer', price: 0, priceCurrency: 'VND', category: 'Free', availability: 'https://schema.org/InStock' },
    hasCourseInstance: {
      '@type': 'CourseInstance', courseMode: 'online', inLanguage: 'vi',
      courseWorkload: 'PT' + COURSE_HOURS + 'H', courseSchedule: { '@type': 'Schedule', repeatFrequency: 'P1W', duration: 'PT5H' }
    },
    syllabusSections: lessons.map((l) => ({
      '@type': 'Syllabus', name: 'Bài ' + l.num + ': ' + l.titleText, description: l.summary,
      timeRequired: isoDuration(l.hours), url: abs(l.url)
    })),
    hasPart: lessons.map((l) => ({ '@type': 'LearningResource', '@id': abs(l.url) + '#article', name: 'Bài ' + l.num + ': ' + l.titleText, url: abs(l.url) }))
  };
  const faqLd = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } }))
  };

  const body = `${topbar({ withNavBtn: false })}
<main id="main" class="landing" tabindex="-1">
  <section class="hero">
    <div class="hero-in">
      <div class="hero-text">
        ${crumbs.html}
        <p class="eyebrow">Giáo trình miễn phí · Tiếng Việt · ${lessons.length} bài · ${TOTAL_EXERCISES} bài tập</p>
        <h1>${esc(COURSE_NAME)}</h1>
        <p class="lead">Học <b>game loop</b>, <b>va chạm</b>, <b>state machine</b>, <b>event bus</b> và nhiều design pattern khác bằng cách
          đọc, thử và sửa <b>mã nguồn thật</b> của một game trình duyệt hoàn chỉnh: không build step, không thư viện ngoài, không "hộp đen".</p>
        <div class="hero-cta">
          <a class="btn btn-lg" href="${first ? first.url : '#lo-trinh'}">🚀 Bắt đầu bài 00</a>
          <a class="btn btn-lg btn-alt" href="${SITE}/">🎮 Chơi game</a>
        </div>
        <p class="hero-sub"><a href="${REPO}">Mã nguồn trên GitHub ↗</a> · <a href="${guidePage ? guidePage.url : '#'}">Hướng dẫn học & cài đặt</a></p>
        <div class="progress-box" id="progress" hidden>
          <p>Bạn đã học <b data-count>0/${lessons.length}</b> bài. <a data-next href="#lo-trinh">Học tiếp</a></p>
          <progress max="${lessons.length}" value="0" aria-label="Tiến độ khoá học"></progress>
        </div>
      </div>
      <figure class="hero-art">
        <img src="${OG_IMAGE}" width="960" height="540" alt="Màn hình menu chính của game Oggy Adventure: mèo Oggy và ba chú gián" fetchpriority="high">
        <figcaption>Game bạn sẽ đọc code: <b>Oggy Adventure</b> (~70 file JS, 38 màn, 4 trùm)</figcaption>
      </figure>
    </div>
  </section>

  <section class="band stats" aria-label="Tóm tắt khoá học">
    <ul class="stat-list">
      <li><b>${lessons.length}</b><span>bài học</span></li>
      <li><b>~${esc(COURSE_HOURS)} giờ</b><span>${esc(COURSE_WEEKS.replace(/ nếu.*/, ''))}</span></li>
      <li><b>${TOTAL_EXERCISES}</b><span>bài tập có lời giải</span></li>
      <li><b>0 đ</b><span>miễn phí, mã nguồn mở</span></li>
    </ul>
  </section>

  <section class="band" id="hoc-duoc-gi" aria-labelledby="h-learn">
    <div class="wrap">
      <h2 id="h-learn">Bạn sẽ học được gì</h2>
      <p class="section-lead">Mỗi khái niệm gắn với code thật trong <code>src/</code>. Bạn đọc, chạy thí nghiệm trong DevTools rồi tự viết tính năng mới.</p>
      <ul class="learn-grid">${learn}</ul>
    </div>
  </section>

  <section class="band band-alt" id="yeu-cau" aria-labelledby="h-req">
    <div class="wrap two-col">
      <div>
        <h2 id="h-req">Yêu cầu đầu vào</h2>
        <p>${inline(AUDIENCE_MD, README_FILE)}</p>
        <h3>Thời lượng ước tính</h3>
        <p>Tổng cộng khoảng <b>${esc(COURSE_HOURS)} giờ</b>, tức chừng ${esc(COURSE_WEEKS)}. Thời lượng từng bài đã gồm đọc bài,
          đọc code, làm thí nghiệm và bài tập.</p>
      </div>
      <div>
        <h3>Cần cài gì</h3>
        <div class="table-wrap" role="region" aria-label="Bảng công cụ cần cài" tabindex="0"><table>
          <thead><tr><th>Công cụ</th><th>Dùng để</th><th>Bắt buộc?</th></tr></thead><tbody>${toolRows}</tbody>
        </table></div>
      </div>
    </div>
  </section>

  <section class="band" id="lo-trinh" aria-labelledby="h-route">
    <div class="wrap">
      <h2 id="h-route">Lộ trình ${lessons.length} bài</h2>
      <p class="section-lead">Bài 00–02 là nền tảng, nên học đúng thứ tự. Bấm <b>Đánh dấu đã học</b> ở cuối mỗi bài,
        dấu ✓ sẽ hiện ở đây (lưu trên trình duyệt của bạn).</p>
      <ol class="lesson-grid">
${cards}
      </ol>
      <div class="route-more">
        <h3>Chọn hướng học khi không đủ thời gian</h3>
        <ul class="tracks">${trackHtml}</ul>
        ${ROUTE_MERMAID ? `<details class="hint route-diagram"><summary>Sơ đồ "cần học trước" giữa các bài</summary>
          <div class="diagram"><pre class="mermaid">${esc(ROUTE_MERMAID)}</pre></div></details>` : ''}
      </div>
    </div>
  </section>

  <section class="band band-alt" id="tai-lieu" aria-labelledby="h-docs">
    <div class="wrap">
      <h2 id="h-docs">Tài liệu kiến trúc & thiết kế</h2>
      <ul class="doc-grid">
        <li><a class="doc-card" href="/learn/architecture/"><span class="dc-ico" aria-hidden="true">🗺️</span><b>Sơ đồ kiến trúc</b>
          <span>Phụ thuộc giữa các module, máy trạng thái scene, luồng event, vòng đời một frame, cây thư mục.</span></a></li>
        <li><a class="doc-card" href="/learn/design/"><span class="dc-ico" aria-hidden="true">📐</span><b>Thiết kế chi tiết</b>
          <span>Mô hình dữ liệu, sơ đồ lớp, luồng tuần tự, máy trạng thái, triển khai và quyết định thiết kế.</span></a>
          ${designList ? `<ul class="doc-sub">${designList}</ul>` : ''}</li>
        <li><a class="doc-card" href="/learn/code-style/"><span class="dc-ico" aria-hidden="true">🧹</span><b>Quy ước code & comment</b>
          <span>Khối đầu file, JSDoc, nhãn 💡 ⚠️ 🧪, refactor an toàn. Bắt buộc đọc trước bài tập đầu tiên.</span></a></li>
        <li><a class="doc-card" href="${SOLUTIONS_INDEX_URL}"><span class="dc-ico" aria-hidden="true">🔑</span><b>Lời giải bài tập</b>
          <span>Lời giải có giải thích cho cả ${TOTAL_EXERCISES} bài tập. Hãy tự làm trước!</span></a></li>
      </ul>
    </div>
  </section>

  <section class="band" id="faq" aria-labelledby="h-faq">
    <div class="wrap narrow">
      <h2 id="h-faq">Câu hỏi thường gặp</h2>
      ${faqHtml}
      <p class="cta-end"><a class="btn btn-lg" href="${first ? first.url : '#lo-trinh'}">🚀 Bắt đầu bài 00</a></p>
    </div>
  </section>
</main>
${footer()}`;

  return htmlPage({
    title: COURSE_NAME + ': giáo trình lập trình game JavaScript miễn phí',
    description: clip(COURSE_DESCRIPTION, 158), url: LANDING_URL, type: 'website',
    ld: [courseLd, faqLd, crumbs.ld], body, bodyClass: 'kind-landing', modified: dateMod,
    alternateMd: '/docs/learn/README.md'
  });
}

/** Trang mục lục lời giải /learn/solutions/. */
function solutionsIndexPage() {
  const crumbs = breadcrumbs([CRUMB_HOME, CRUMB_COURSE, { name: 'Lời giải', url: SOLUTIONS_INDEX_URL }]);
  const items = solutions.map((s) => `<li><a href="${s.url}"><span class="lc-num sm">${esc(s.num || '')}</span> ${esc(s.titleText)}</a>
    ${s.lesson ? ` · <a class="muted" href="${s.lesson.url}">đề bài</a>` : ''}</li>`).join('');
  const body = `${topbar({ withNavBtn: true })}
<div class="page">
  <main id="main" class="doc" tabindex="-1">
    <header class="doc-head">${crumbs.html}<p class="kicker"><span class="badge badge-sol">Lời giải</span></p><h1>Lời giải bài tập</h1></header>
    <article class="prose">
      <blockquote class="callout callout-stop"><p>✋ <b>Hãy tự làm trước.</b> Lời giải chỉ có ích khi bạn đã thử và bị kẹt ít nhất 15 phút.
      Mở lời giải để so sánh sau khi smoke test của bạn đã XANH.</p></blockquote>
      <ol class="sol-list">${items}</ol>
    </article>
  </main>
  ${sidebar({ url: SOLUTIONS_INDEX_URL, kind: 'index' })}
</div>
${footer()}`;
  return htmlPage({
    title: 'Lời giải bài tập · ' + COURSE_NAME, url: SOLUTIONS_INDEX_URL, body,
    description: 'Lời giải có giải thích cho ' + TOTAL_EXERCISES + ' bài tập của ' + lessons.length + ' bài trong khoá ' + COURSE_NAME + '. Hãy tự làm trước khi xem.',
    ld: [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Lời giải bài tập', url: abs(SOLUTIONS_INDEX_URL), inLanguage: 'vi',
      isPartOf: { '@type': 'Course', '@id': COURSE_ID, name: COURSE_NAME } }, crumbs.ld],
    type: 'website'
  });
}

// ---------------------------------------------------------------------------
// 11. Ghi file
// ---------------------------------------------------------------------------

fs.rmSync(path.join(OUT, 'learn'), { recursive: true, force: true });

/** @type {Array<{url:string, lastmod:string, priority:string, changefreq:string}>} */
const sitemapEntries = [];
const addSitemap = (url, lastmod, priority, changefreq = 'monthly') =>
  sitemapEntries.push({ url, lastmod: lastmod.slice(0, 10), priority, changefreq });

writeFile('learn/index.html', landingPage());
addSitemap(LANDING_URL, pages.map((p) => p.lastmod).sort().pop(), '0.9', 'weekly');

for (const p of pages) {
  writeFile(p.url.replace(/^\//, '') + 'index.html', docPage(p));
  addSitemap(p.url, p.lastmod, p.kind === 'lesson' ? '0.8' : p.kind === 'solution' ? '0.5' : '0.6');
}
if (solutions.length) {
  writeFile('learn/solutions/index.html', solutionsIndexPage());
  addSitemap(SOLUTIONS_INDEX_URL, solutions.map((s) => s.lastmod).sort().pop(), '0.4');
}

// CSS + ảnh OG + ảnh được link trong tài liệu.
writeFile('learn/assets/learn.css', fs.readFileSync(CSS_FILE));
if (fs.existsSync(OG_IMAGE_SRC)) writeFile(OG_IMAGE.slice(1), fs.readFileSync(OG_IMAGE_SRC));
for (const [rel, url] of mediaToCopy) writeFile(url.slice(1), fs.readFileSync(path.join(ROOT, rel)));

// Sitemap: /learn/sitemap.xml (chỉ trang khoá học) và /sitemap.xml đầy đủ.
const urlXml = (e) => `  <url>\n    <loc>${esc(abs(e.url))}</loc>\n    <lastmod>${e.lastmod}</lastmod>\n` +
  `    <changefreq>${e.changefreq}</changefreq>\n    <priority>${e.priority}</priority>\n  </url>`;
const urlset = (blocks) => '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  blocks.join('\n') + '\n</urlset>\n';
writeFile('learn/sitemap.xml', urlset(sitemapEntries.map(urlXml)));
// 💡 Khái niệm: sitemap.xml gốc trong repo vẫn là nguồn cho các trang ngoài /learn/ (trang chủ, ghi công).
//   Ở đây chỉ GHI ĐÈ bản trong thư mục build bằng bản gộp, file trong repo không đổi.
{
  const rootSitemap = path.join(ROOT, 'sitemap.xml');
  const baseBlocks = fs.existsSync(rootSitemap)
    ? (fs.readFileSync(rootSitemap, 'utf8').match(/<url>[\s\S]*?<\/url>/g) || [])
      .filter((b) => !b.includes(abs('/learn/'))).map((b) => '  ' + b.trim())
    : [];
  writeFile('sitemap.xml', urlset(baseBlocks.concat(sitemapEntries.map(urlXml))));
}

// ---------------------------------------------------------------------------
// 12. Báo cáo
// ---------------------------------------------------------------------------

const total = pages.length + 1 + (solutions.length ? 1 : 0);
console.log('learn-site: ' + total + ' trang HTML (' + lessons.length + ' bài, ' + solutions.length + ' lời giải, ' +
  designs.length + ' thiết kế), ' + mediaToCopy.size + ' ảnh → ' + path.join(OUT, 'learn'));
if (linkErrors.length) {
  const head = ARGS.allowBroken ? 'CẢNH BÁO — link tương đối trỏ tới file không tồn tại' : 'LỖI — link tương đối trỏ tới file không tồn tại';
  console.error(head + ' (' + linkErrors.length + '):');
  for (const e of linkErrors) console.error('  ' + e);
  if (!ARGS.allowBroken) process.exit(1);
}
