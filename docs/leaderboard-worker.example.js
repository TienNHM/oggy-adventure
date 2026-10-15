/* VÍ DỤ máy chủ leaderboard online cho Oggy Adventure — Cloudflare Worker + Workers KV.
 * KHÔNG được game load. Game mặc định dùng leaderboard cục bộ (OG.Save); file này chỉ là mẫu
 * để cắm vào adapter OG.Social.createHttpBackend (src/social/leaderboard.js).
 *
 * API (khớp với HttpBackend phía client):
 *   GET  /scores?limit=N   -> 200 {scores:[entry]}            (N: 1..100, mặc định 10)
 *   POST /scores  (JSON entry) -> 200 {rank, scores}          (rank = -1 nếu không lọt top)
 *   OPTIONS *              -> CORS preflight
 *   entry = {id, name, score, charId, skinId, levelId, levelName, levelsCompleted, stars, time, date, type}
 *
 * TRIỂN KHAI:
 *   1. npm i -g wrangler && wrangler login
 *   2. wrangler kv namespace create LEADERBOARD      → chép id vào wrangler.toml:
 *        name = "oggy-leaderboard"
 *        main = "leaderboard-worker.example.js"
 *        compatibility_date = "2024-09-01"
 *        [[kv_namespaces]]
 *        binding = "LEADERBOARD"
 *        id = "<id vừa tạo>"
 *        [vars]
 *        ALLOWED_ORIGIN = "*"        # hoặc "https://ten-mien-game.cua-ban"
 *   3. wrangler deploy
 *   4. Trong game (trước main.js hoặc trong console):
 *        window.OG_LEADERBOARD_URL = 'https://oggy-leaderboard.<tài-khoản>.workers.dev';
 *      hoặc: OG.Social.useOnline('https://...workers.dev', {persist: true});
 *
 * LƯU Ý:
 *   - Game chạy qua file:// gửi header Origin: null → để ALLOWED_ORIGIN = "*" nếu muốn hỗ trợ.
 *   - KV là "eventually consistent" và không có giao dịch: hai lượt POST cùng lúc có thể ghi đè nhau.
 *     Đủ cho game vui; muốn chặt chẽ hãy dùng Durable Objects hoặc D1.
 *   - Điểm do client gửi nên KHÔNG chống gian lận được hoàn toàn. Worker chỉ kiểm tra hợp lệ cơ bản,
 *     giới hạn tần suất theo IP và chặn điểm phi lý.
 */

const TOP_KEY = 'top';
const KEEP = 100;               // số mục lưu trên máy chủ
const MAX_SCORE = 1000000;      // điểm vượt mức này coi là không hợp lệ
const RATE_LIMIT = 10;          // số POST tối đa mỗi IP mỗi phút
const NAME_MAX = 16;

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': (env && env.ALLOWED_ORIGIN) || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Max-Age': '86400'
  };
}

function json(data, status, env) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, corsHeaders(env))
  });
}

function cleanStr(v, max) {
  return String(v == null ? '' : v)
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}
function slug(v, fb) {
  const s = String(v == null ? '' : v).slice(0, 24);
  return /^[a-zA-Z0-9_-]+$/.test(s) ? s : fb;
}
function num(v, min, max) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
}

// Kiểm tra + chuẩn hoá entry. Trả null nếu không hợp lệ.
function validate(e) {
  if (!e || typeof e !== 'object') return null;
  const score = Math.round(Number(e.score));
  if (!Number.isFinite(score) || score <= 0 || score > MAX_SCORE) return null;
  const name = cleanStr(e.name, NAME_MAX);
  if (!name) return null;
  const id = slug(e.id, null);
  if (!id) return null;
  const date = new Date(e.date);
  return {
    id,
    name,
    score,
    charId: slug(e.charId, 'oggy'),
    skinId: e.skinId ? slug(e.skinId, null) : null,
    levelId: e.levelId ? slug(e.levelId, null) : null,
    levelName: cleanStr(e.levelName, 40),
    levelsCompleted: Math.round(num(e.levelsCompleted, 0, 99)),
    stars: Math.round(num(e.stars, 0, 999)),
    time: Math.round(num(e.time, 0, 360000) * 10) / 10,
    date: (isNaN(date.getTime()) || date.getTime() > Date.now() + 86400000 ? new Date() : date).toISOString(),
    type: e.type === 'victory' ? 'victory' : 'gameover'
  };
}

// Cùng thứ tự với client (OG.Social.compareEntries).
function compare(a, b) {
  return (b.score - a.score) || (b.stars - a.stars) || ((a.time || 1e9) - (b.time || 1e9)) ||
    (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
}

async function readTop(env) {
  const list = await env.LEADERBOARD.get(TOP_KEY, 'json');
  return Array.isArray(list) ? list : [];
}

async function rateLimited(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const key = 'rl:' + ip + ':' + Math.floor(Date.now() / 60000);
  const count = Number(await env.LEADERBOARD.get(key)) || 0;
  if (count >= RATE_LIMIT) return true;
  await env.LEADERBOARD.put(key, String(count + 1), { expirationTtl: 120 });
  return false;
}

async function handleList(url, env) {
  const limit = Math.round(num(url.searchParams.get('limit') || 10, 1, KEEP));
  const list = await readTop(env);
  return json({ scores: list.slice(0, limit) }, 200, env);
}

async function handleSubmit(request, env) {
  if (await rateLimited(request, env)) return json({ error: 'Gửi quá nhanh, thử lại sau.' }, 429, env);
  let body;
  try {
    const text = await request.text();
    if (text.length > 4096) return json({ error: 'Dữ liệu quá lớn.' }, 413, env);
    body = JSON.parse(text);
  } catch (err) {
    return json({ error: 'JSON không hợp lệ.' }, 400, env);
  }
  const entry = validate(body);
  if (!entry) return json({ error: 'Điểm không hợp lệ.' }, 400, env);

  let list = await readTop(env);
  const existing = list.find((x) => x.id === entry.id);
  if (existing) {
    // Chỉ cho phép đổi TÊN của mục đã có (cùng id, cùng điểm, cùng ngày) — không cho sửa điểm.
    if (existing.score !== entry.score || existing.date !== entry.date) {
      return json({ error: 'Không được sửa điểm đã gửi.' }, 409, env);
    }
    existing.name = entry.name;
  } else {
    list.push(entry);
  }
  list.sort(compare);
  list = list.slice(0, KEEP);
  await env.LEADERBOARD.put(TOP_KEY, JSON.stringify(list));
  const idx = list.findIndex((x) => x.id === entry.id);
  return json({ rank: idx >= 0 ? idx + 1 : -1, scores: list.slice(0, 10) }, 200, env);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(env) });
    try {
      if (url.pathname === '/scores' && request.method === 'GET') return await handleList(url, env);
      if (url.pathname === '/scores' && request.method === 'POST') return await handleSubmit(request, env);
      if (url.pathname === '/' && request.method === 'GET') return json({ ok: true, name: 'oggy-leaderboard' }, 200, env);
      return json({ error: 'Không tìm thấy.' }, 404, env);
    } catch (err) {
      return json({ error: 'Lỗi máy chủ.' }, 500, env);
    }
  }
};
