#!/usr/bin/env python3
"""Công cụ lấy ẢNH CHỤP THỰC TẾ (có giấy phép tự do) cho thẻ kiến thức của Oggy Adventure.

Chỉ dùng thư viện chuẩn của Python 3 + Pillow. Không chạy trong game — chỉ dùng lúc chuẩn bị nội dung.
Kết quả: assets/photos/<journeyId>/<cardId>.webp  +  assets/photos/<journeyId>/credits.js (ghi công).

CÁC LỆNH
  search "<từ khoá>" [--limit 8]
      Tìm file trên Wikimedia Commons (namespace 6 = File:). In kích thước, giấy phép, tác giả và
      OK/TỪ CHỐI theo danh sách trắng giấy phép.
  get "File:Tên.jpg" <journeyId> <cardId> [--focus X,Y] [--force]
      Tải bản thu nhỏ ~1200px, thu nhỏ tiếp còn cạnh dài <= 800px, lưu WebP (quality 78), ghi entry ghi công
      (từ extmetadata của Commons) vào _entries.json. Giấy phép ngoài danh sách trắng → TỪ CHỐI, thoát mã 2.
  url "<link ảnh trực tiếp>" <journeyId> <cardId> --author "..." --license "Unsplash License" --source-url "..."
      [--license-url ...] [--source Unsplash|Pexels|NASA] [--title "..."] [--focus X,Y] [--force]
      Ảnh Unsplash / Pexels / NASA tìm thủ công. Chỉ nhận link từ images.unsplash.com, images.pexels.com,
      *.nasa.gov, upload.wikimedia.org.
  write <journeyId>
      Gom các entry trong _entries.json thành credits.js (đẹp, có comment). PHẢI chạy sau get/url/remove.
  list <journeyId>            In các entry hiện có.
  remove <journeyId> <cardId> Xoá entry + file ảnh (nhớ chạy write sau đó).

QUY ƯỚC
  - Đường dẫn ảnh: assets/photos/<journeyId>/<cardId>.webp — cardId PHẢI có trong src/journeys/<id>/content.js.
  - _entries.json là file tạm (đã .gitignore); nếu mất, công cụ tự dựng lại từ credits.js (khối BEGIN/END-ENTRIES).
  - Giấy phép nhận: Public Domain (kể cả PD-USGov/NASA), CC0, CC BY (mọi bản), CC BY-SA (mọi bản),
    Unsplash License, Pexels License. Từ chối: NC, ND, GFDL, fair use, không rõ.
  - Tôn trọng Wikimedia: gửi User-Agent có thông tin liên hệ, nghỉ ~1 giây giữa các request, lùi lại khi bị 429.

VÍ DỤ
  python tools/photos/fetch_commons.py search "Hoan Kiem Lake Turtle Tower"
  python tools/photos/fetch_commons.py get "File:Thap Rua.jpg" vietnam hn_hoguom
  python tools/photos/fetch_commons.py write vietnam
"""
import argparse
import html
import io
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

try:
    from PIL import Image, ImageOps
except ImportError:  # pragma: no cover - chỉ báo lỗi dễ hiểu
    sys.exit('Cần Pillow: pip install Pillow')

# Windows: in tiếng Việt / emoji ra console không bị lỗi mã hoá.
try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PHOTOS = os.path.join(ROOT, 'assets', 'photos')
JOURNEYS = ('home', 'vietnam', 'world', 'science')
API = 'https://commons.wikimedia.org/w/api.php'
# Chính sách User-Agent của Wikimedia: tên công cụ/phiên bản + cách liên hệ (URL dự án).
USER_AGENT = 'OggyAdventureEdu/1.0 (https://oggy-adventure.tiennhm.io.vn; educational kids game) Python-urllib'
THUMB_REQUEST = 1200   # xin Commons bản rộng ~1200px (đỡ tải file gốc hàng chục MB)
MAX_SIDE = 800         # cạnh dài tối đa của file lưu
WEBP_QUALITY = 78
PAUSE = 1.0            # giây nghỉ giữa các request
NOTE = 'Đã thu nhỏ, chuyển sang WebP'

# ---------------------------------------------------------------------------
# Danh sách trắng giấy phép — GIỐNG HỆT OG.Photos.licenseOk (src/story/photos.js).
# ---------------------------------------------------------------------------
LICENSE_BAD = re.compile(r'(\bNC\b|\bND\b|non-?commercial|no-?deriv|GFDL|fair[ _-]?use|all rights reserved|copyright(ed)?\b|unknown)', re.I)
LICENSE_GOOD = re.compile(r'^(public domain|pd([ -]|$)|cc0|cc[ -]?pd|cc[ -]by([ -]sa)?[ -]\d|unsplash license|pexels license)', re.I)


def license_ok(name):
    s = (name or '').strip()
    return bool(s) and not LICENSE_BAD.search(s) and bool(LICENSE_GOOD.match(s))


def license_url_guess(name):
    """Link giấy phép chuẩn khi nguồn không cung cấp (CC BY x.y → creativecommons.org/licenses/by/x.y/)."""
    s = (name or '').strip()
    m = re.match(r'^cc[ -]by(-sa)?[ -](\d\.\d)', s, re.I)
    if m:
        return 'https://creativecommons.org/licenses/by%s/%s/' % ((m.group(1) or '').lower(), m.group(2))
    low = s.lower()
    if low.startswith('cc0'):
        return 'https://creativecommons.org/publicdomain/zero/1.0/'
    if low.startswith('unsplash'):
        return 'https://unsplash.com/license'
    if low.startswith('pexels'):
        return 'https://www.pexels.com/license/'
    if low.startswith('public domain') or low.startswith('pd'):
        return 'https://creativecommons.org/publicdomain/mark/1.0/'
    return ''


# ---------------------------------------------------------------------------
# Mạng
# ---------------------------------------------------------------------------
_last = [0.0]


def http_get(url, binary=False, tries=4):
    """GET có User-Agent, nghỉ giữa các request và lùi lại khi bị giới hạn (429/503)."""
    for attempt in range(tries):
        wait = PAUSE - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, 'Accept-Encoding': 'identity'})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            return data if binary else json.loads(data.decode('utf-8'))
        except urllib.error.HTTPError as e:
            if e.code in (429, 503) and attempt < tries - 1:
                delay = int(e.headers.get('Retry-After') or 0) or 5 * (attempt + 1)
                print('  … máy chủ bận (%d), chờ %ds' % (e.code, delay), file=sys.stderr)
                time.sleep(delay)
                continue
            raise
    raise RuntimeError('Không tải được ' + url)


def api(params):
    q = dict(params, format='json', formatversion='2')
    return http_get(API + '?' + urllib.parse.urlencode(q))


META_KEYS = 'LicenseShortName|LicenseUrl|Artist|Credit|ObjectName|ImageDescription|NonFree|Restrictions|UsageTerms'


def plain(value):
    """Bỏ thẻ HTML, giải mã &amp;..., gộp khoảng trắng (Artist/ImageDescription của Commons là HTML)."""
    s = re.sub(r'<[^>]+>', ' ', value or '')
    s = html.unescape(s)
    return re.sub(r'\s+', ' ', s).strip()


def meta(ii, key):
    v = (ii.get('extmetadata') or {}).get(key) or {}
    return plain(str(v.get('value', '')))


# ---------------------------------------------------------------------------
# Kiểm tra journeyId / cardId
# ---------------------------------------------------------------------------
def card_ids(jid):
    """Đọc cardId trong src/journeys/<jid>/content.js bằng regex (đủ dùng: khối `cards: [ ... ]`)."""
    path = os.path.join(ROOT, 'src', 'journeys', jid, 'content.js')
    try:
        src = open(path, encoding='utf-8').read()
    except OSError:
        return set()
    start = src.find('cards: [')
    end = src.find('quizzes: [', start)
    block = src[start:end if end > 0 else None] if start >= 0 else ''
    return set(re.findall(r"\bid:\s*'([a-z0-9_]+)'", block))


def check_target(jid, cid, force):
    if jid not in JOURNEYS:
        sys.exit('journeyId không hợp lệ: %s (chọn một trong %s)' % (jid, ', '.join(JOURNEYS)))
    if not re.match(r'^[a-z0-9_]+$', cid):
        sys.exit('cardId chỉ gồm a-z, 0-9, _: ' + cid)
    ids = card_ids(jid)
    if cid not in ids and not force:
        sys.exit('Không thấy thẻ "%s" trong src/journeys/%s/content.js. Các thẻ: %s' % (cid, jid, ', '.join(sorted(ids))))


# ---------------------------------------------------------------------------
# Lưu entry
# ---------------------------------------------------------------------------
def jdir(jid):
    d = os.path.join(PHOTOS, jid)
    os.makedirs(d, exist_ok=True)
    return d


def credits_path(jid):
    return os.path.join(jdir(jid), 'credits.js')


def entries_path(jid):
    return os.path.join(jdir(jid), '_entries.json')


def load_entries(jid):
    """Đọc _entries.json; nếu chưa có thì dựng lại từ khối BEGIN/END-ENTRIES của credits.js."""
    p = entries_path(jid)
    if os.path.exists(p):
        with open(p, encoding='utf-8') as f:
            return json.load(f)
    try:
        src = open(credits_path(jid), encoding='utf-8').read()
        m = re.search(r'/\* BEGIN-ENTRIES \*/(.*)/\* END-ENTRIES \*/', src, re.S)
        if m:
            return json.loads(m.group(1))
    except (OSError, ValueError) as e:
        print('  ! Không đọc được credits.js (%s) — bắt đầu danh sách rỗng' % e, file=sys.stderr)
    return {}


def save_entries(jid, entries):
    with open(entries_path(jid), 'w', encoding='utf-8', newline='\n') as f:
        json.dump(entries, f, ensure_ascii=False, indent=2)
        f.write('\n')


def parse_focus(s):
    if not s:
        return None
    try:
        x, y = [float(v) for v in s.split(',')]
    except ValueError:
        sys.exit('--focus dạng X,Y (0..1), ví dụ 0.5,0.35')
    return {'x': round(min(1, max(0, x)), 3), 'y': round(min(1, max(0, y)), 3)}


def save_webp(data, jid, cid):
    """Thu nhỏ còn cạnh dài <= MAX_SIDE, xoay theo EXIF, lưu WebP. Trả (w, h, kích thước file)."""
    img = Image.open(io.BytesIO(data))
    img = ImageOps.exif_transpose(img)
    if img.mode not in ('RGB', 'RGBA'):
        img = img.convert('RGBA' if 'A' in img.getbands() or img.mode == 'P' else 'RGB')
    if img.mode == 'RGBA':  # ảnh chụp không cần trong suốt → nền trắng cho nhẹ
        bg = Image.new('RGB', img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[-1])
        img = bg
    img.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
    out = os.path.join(jdir(jid), cid + '.webp')
    img.save(out, 'WEBP', quality=WEBP_QUALITY, method=6)
    return img.size[0], img.size[1], os.path.getsize(out)


def store(jid, cid, entry):
    entries = load_entries(jid)
    entries[cid] = entry
    save_entries(jid, entries)
    print(json.dumps({cid: entry}, ensure_ascii=False, indent=2))
    print('\n✓ Đã lưu assets/photos/%s/%s — nhớ chạy:  python tools/photos/fetch_commons.py write %s' % (jid, entry['file'], jid))


# ---------------------------------------------------------------------------
# Lệnh
# ---------------------------------------------------------------------------
def cmd_search(a):
    data = api({
        'action': 'query', 'generator': 'search', 'gsrsearch': a.query + ' filetype:bitmap', 'gsrnamespace': 6,
        'gsrlimit': a.limit, 'prop': 'imageinfo', 'iiprop': 'size|url|extmetadata|mime',
        'iiextmetadatafilter': META_KEYS,
    })
    pages = sorted((data.get('query') or {}).get('pages') or [], key=lambda p: p.get('index', 0))
    if not pages:
        print('Không có kết quả.')
        return
    for i, p in enumerate(pages, 1):
        ii = (p.get('imageinfo') or [{}])[0]
        lic = meta(ii, 'LicenseShortName')
        ok = license_ok(lic) and meta(ii, 'NonFree').lower() != 'true'
        w, h = ii.get('width', 0), ii.get('height', 0)
        shape = 'ngang' if w > h else ('dọc' if h > w else 'vuông')
        print('%2d. %s %s' % (i, '✓ OK     ' if ok else '✗ TỪ CHỐI', p.get('title')))
        print('    %dx%d (%s) · %s · %s' % (w, h, shape, lic or '(không rõ giấy phép)', (meta(ii, 'Artist') or '(không rõ tác giả)')[:70]))
        restr = meta(ii, 'Restrictions')
        if restr:
            print('    ! Hạn chế: ' + restr)
        print('    ' + (ii.get('descriptionurl') or ''))


def cmd_get(a):
    check_target(a.journey, a.card, a.force)
    title = a.file if a.file.startswith('File:') else 'File:' + a.file
    data = api({
        'action': 'query', 'titles': title, 'prop': 'imageinfo', 'iiprop': 'size|url|extmetadata|mime',
        'iiurlwidth': THUMB_REQUEST, 'iiextmetadatafilter': META_KEYS,
    })
    pages = (data.get('query') or {}).get('pages') or []
    if not pages or pages[0].get('missing') or not pages[0].get('imageinfo'):
        sys.exit('Không tìm thấy %s trên Commons' % title)
    ii = pages[0]['imageinfo'][0]
    lic = meta(ii, 'LicenseShortName')
    if not license_ok(lic) or meta(ii, 'NonFree').lower() == 'true':
        print('✗ TỪ CHỐI: giấy phép "%s" không thuộc danh sách trắng (PD, CC0, CC BY, CC BY-SA).' % lic, file=sys.stderr)
        sys.exit(2)
    if not str(ii.get('mime', '')).startswith('image/'):
        sys.exit('Không phải ảnh: ' + str(ii.get('mime')))
    author = meta(ii, 'Artist') or meta(ii, 'Credit')
    if not author:
        if re.match(r'^(public domain|pd|cc0)', lic, re.I):
            author = 'Không rõ tác giả (phạm vi công cộng)'
        else:
            sys.exit('✗ Ảnh thiếu tên tác giả — không ghi công được, hãy chọn ảnh khác.')
    restr = meta(ii, 'Restrictions')
    if restr:
        print('! Lưu ý hạn chế (thương hiệu/nhân thân...): ' + restr, file=sys.stderr)
    img_url = ii.get('thumburl') or ii.get('url')
    w, h, size = save_webp(http_get(img_url, binary=True), a.journey, a.card)
    desc = meta(ii, 'ObjectName') or meta(ii, 'ImageDescription') or title[5:]
    entry = {
        'file': a.card + '.webp', 'w': w, 'h': h,
        'author': author[:120],
        'license': lic,
        'licenseUrl': meta(ii, 'LicenseUrl') or license_url_guess(lic),
        'source': 'Wikimedia Commons',
        'sourceUrl': ii.get('descriptionurl') or 'https://commons.wikimedia.org/wiki/' + urllib.parse.quote(title.replace(' ', '_')),
        'title': desc[:160],
        'note': NOTE,
    }
    focus = parse_focus(a.focus)
    if focus:
        entry['focus'] = focus
    print('  %dx%d, %.0f KB' % (w, h, size / 1024), file=sys.stderr)
    store(a.journey, a.card, entry)


ALLOWED_HOSTS = ('images.unsplash.com', 'images.pexels.com', 'upload.wikimedia.org')


def cmd_url(a):
    check_target(a.journey, a.card, a.force)
    host = urllib.parse.urlparse(a.url).hostname or ''
    if not (host in ALLOWED_HOSTS or host == 'nasa.gov' or host.endswith('.nasa.gov')):
        sys.exit('✗ TỪ CHỐI nguồn "%s". Chỉ nhận ảnh trực tiếp từ: %s, *.nasa.gov' % (host, ', '.join(ALLOWED_HOSTS)))
    if not license_ok(a.license):
        print('✗ TỪ CHỐI: giấy phép "%s" không thuộc danh sách trắng.' % a.license, file=sys.stderr)
        sys.exit(2)
    if not a.author.strip() or not a.source_url.strip():
        sys.exit('Cần --author và --source-url (trang gốc của ảnh) để ghi công.')
    source = a.source or ('Unsplash' if 'unsplash' in host else 'Pexels' if 'pexels' in host
                          else 'NASA' if 'nasa.gov' in host else 'Wikimedia Commons')
    w, h, size = save_webp(http_get(a.url, binary=True), a.journey, a.card)
    entry = {
        'file': a.card + '.webp', 'w': w, 'h': h,
        'author': plain(a.author)[:120],
        'license': a.license.strip(),
        'licenseUrl': a.license_url or license_url_guess(a.license),
        'source': source,
        'sourceUrl': a.source_url.strip(),
        'title': plain(a.title or '')[:160],
        'note': NOTE,
    }
    focus = parse_focus(a.focus)
    if focus:
        entry['focus'] = focus
    print('  %dx%d, %.0f KB' % (w, h, size / 1024), file=sys.stderr)
    store(a.journey, a.card, entry)


def js_str(s):
    return json.dumps(s, ensure_ascii=False)


def cmd_write(a):
    jid = a.journey
    if jid not in JOURNEYS:
        sys.exit('journeyId không hợp lệ: ' + jid)
    entries = load_entries(jid)
    # Bỏ entry mà file ảnh đã mất (tránh ghi công cho ảnh không tồn tại).
    for cid in list(entries):
        if not os.path.exists(os.path.join(jdir(jid), entries[cid].get('file', cid + '.webp'))):
            print('! Bỏ %s: thiếu file ảnh' % cid, file=sys.stderr)
            del entries[cid]
    # Sắp theo thứ tự thẻ trong content.js cho dễ đọc.
    order = []
    src_path = os.path.join(ROOT, 'src', 'journeys', jid, 'content.js')
    if os.path.exists(src_path):
        order = re.findall(r"\bid:\s*'([a-z0-9_]+)'", open(src_path, encoding='utf-8').read())
    entries = dict(sorted(entries.items(), key=lambda kv: (order.index(kv[0]) if kv[0] in order else 9999, kv[0])))
    save_entries(jid, entries)
    body = json.dumps(entries, ensure_ascii=False, indent=2)
    # Thụt lề + chú thích từng ảnh (tên + giấy phép) để sinh viên đọc file dễ hơn — vẫn là JSON hợp lệ bên trong khối.
    # Giữ nguyên comment đầu file cũ (phần trước dòng gọi register CUỐI CÙNG — comment cũng nhắc tới register).
    old = open(credits_path(jid), encoding='utf-8').read() if os.path.exists(credits_path(jid)) else ''
    cut = old.rfind('\nOG.Photos.register(')
    header = old[:cut + 1] if cut >= 0 else ''
    if not header.strip():
        header = '/* Ảnh chụp thực tế cho thẻ kiến thức — hành trình "%s". Tạo bằng tools/photos/fetch_commons.py write %s */\n' % (jid, jid)
    summary = ''.join(' *   %-16s %-14s %s\n' % (cid, e['license'], e['author'][:50]) for cid, e in entries.items())
    summary = (' * Danh sách (%d ảnh):\n' % len(entries) + summary) if entries else ' * (Chưa có ảnh nào — hình vẽ cartoon được dùng như cũ.)\n'
    header = re.sub(r'\n/\* AUTO-SUMMARY.*?\*/\n', '\n', header, flags=re.S)
    out = header.rstrip('\n') + '\n/* AUTO-SUMMARY (tự sinh khi chạy "write")\n' + summary + ' */\n' + \
        'OG.Photos.register(%s, /* BEGIN-ENTRIES */ %s /* END-ENTRIES */);\n' % (js_str(jid), body)
    with open(credits_path(jid), 'w', encoding='utf-8', newline='\n') as f:
        f.write(out)
    print('✓ Đã ghi assets/photos/%s/credits.js (%d ảnh)' % (jid, len(entries)))


def cmd_list(a):
    entries = load_entries(a.journey)
    if not entries:
        print('(trống)')
    for cid, e in entries.items():
        print('%-16s %4dx%-4d %-14s %s · %s' % (cid, e.get('w', 0), e.get('h', 0), e.get('license'), e.get('author', '')[:40], e.get('sourceUrl')))


def cmd_remove(a):
    entries = load_entries(a.journey)
    e = entries.pop(a.card, None)
    f = os.path.join(jdir(a.journey), (e or {}).get('file', a.card + '.webp'))
    if os.path.exists(f):
        os.remove(f)
    save_entries(a.journey, entries)
    print('✓ Đã xoá %s/%s — nhớ chạy write %s' % (a.journey, a.card, a.journey))


def main():
    ap = argparse.ArgumentParser(description='Lấy ảnh có giấy phép tự do cho thẻ kiến thức (xem docstring đầu file).')
    sub = ap.add_subparsers(dest='cmd', required=True)
    s = sub.add_parser('search', help='tìm ảnh trên Wikimedia Commons')
    s.add_argument('query')
    s.add_argument('--limit', type=int, default=8)
    s.set_defaults(fn=cmd_search)
    g = sub.add_parser('get', help='tải 1 file Commons cho 1 thẻ')
    g.add_argument('file')
    g.add_argument('journey')
    g.add_argument('card')
    g.add_argument('--focus', help='điểm giữ lại khi cắt khung, X,Y trong 0..1 (mặc định giữa)')
    g.add_argument('--force', action='store_true', help='bỏ qua kiểm tra cardId')
    g.set_defaults(fn=cmd_get)
    u = sub.add_parser('url', help='tải ảnh Unsplash/Pexels/NASA từ link trực tiếp')
    u.add_argument('url')
    u.add_argument('journey')
    u.add_argument('card')
    u.add_argument('--author', required=True)
    u.add_argument('--license', required=True)
    u.add_argument('--source-url', required=True)
    u.add_argument('--license-url')
    u.add_argument('--source')
    u.add_argument('--title')
    u.add_argument('--focus')
    u.add_argument('--force', action='store_true')
    u.set_defaults(fn=cmd_url)
    w = sub.add_parser('write', help='ghi credits.js từ _entries.json')
    w.add_argument('journey')
    w.set_defaults(fn=cmd_write)
    li = sub.add_parser('list', help='liệt kê entry')
    li.add_argument('journey')
    li.set_defaults(fn=cmd_list)
    r = sub.add_parser('remove', help='xoá 1 entry + file ảnh')
    r.add_argument('journey')
    r.add_argument('card')
    r.set_defaults(fn=cmd_remove)
    a = ap.parse_args()
    try:
        a.fn(a)
    except urllib.error.URLError as e:
        sys.exit('Lỗi mạng: %s' % e)


if __name__ == '__main__':
    main()
