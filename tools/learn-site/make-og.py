"""
make-og.py — Tạo ảnh chia sẻ (Open Graph) 1200×630 cho trang khoá học /learn/.

Vai trò:   Khi dán link https://oggy-adventure.tiennhm.io.vn/learn/ vào Facebook, Zalo, Discord...,
           mạng xã hội đọc thẻ <meta property="og:image"> để hiện ảnh xem trước. Ảnh này do
           build.mjs trỏ tới (OG_IMAGE) và được copy vào _site/learn/assets/ lúc build.
💡 Khái niệm: 1200×630 (tỉ lệ ~1.91:1) là kích thước khuyến nghị của Open Graph / Twitter
           "summary_large_image"; chữ quan trọng nên nằm trong vùng giữa vì một số nơi cắt ảnh.
Cách chạy: python tools/learn-site/make-og.py      (cần Pillow; chạy trên máy có font Segoe UI —
           ảnh kết quả được COMMIT vào repo nên CI không cần chạy lại script này).
Đầu vào:   docs/screenshots/01-menu.jpg (ảnh menu game).
Đầu ra:    tools/learn-site/assets/og-learn.png
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

# ⚠️ Bẫy: console Windows mặc định dùng bảng mã cp1252 → print() tiếng Việt bị UnicodeEncodeError.
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
SRC = os.path.join(ROOT, 'docs', 'screenshots', '01-menu.jpg')
OUT = os.path.join(HERE, 'assets', 'og-learn.png')

W, H = 1200, 630
# Bảng màu lấy từ learn.css để ảnh chia sẻ đồng bộ với trang web.
CREAM, INK, ORANGE, TEAL, MUTED = '#fff3dc', '#17233d', '#c2410c', '#0e7490', '#5b6475'

# ⚠️ Bẫy: font phải có đủ glyph tiếng Việt (ạ, ữ, ỳ...). Segoe UI có; Trebuchet MS thì không.
FONT_DIR = os.environ.get('OG_FONT_DIR', r'C:\Windows\Fonts')
def font(name, size):
    return ImageFont.truetype(os.path.join(FONT_DIR, name), size)

img = Image.new('RGB', (W, H), CREAM)
d = ImageDraw.Draw(img)

# Hai vòng tròn trang trí mờ (giống hero của landing page).
deco = Image.new('RGBA', (W, H), (0, 0, 0, 0))
dd = ImageDraw.Draw(deco)
dd.ellipse((-120, -140, 300, 280), fill=(255, 214, 102, 150))
dd.ellipse((930, 380, 1330, 780), fill=(122, 199, 196, 110))
img.paste(deco, (0, 0), deco)

# Ảnh game bên phải: thu nhỏ, bo góc, viền tối như khung máy tính bảng, đổ bóng mềm.
shot = Image.open(SRC).convert('RGB')
sw = 500
shot = shot.resize((sw, int(shot.height * sw / shot.width)), Image.LANCZOS)
pad = 18
frame = Image.new('RGBA', (sw + pad * 2, shot.height + pad * 2), (0, 0, 0, 0))
ImageDraw.Draw(frame).rounded_rectangle((0, 0, frame.width - 1, frame.height - 1), 30, fill=INK)
mask = Image.new('L', shot.size, 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, shot.width - 1, shot.height - 1), 16, fill=255)
frame.paste(shot, (pad, pad), mask)
frame = frame.rotate(-3, expand=True, resample=Image.BICUBIC)
# Đặt ảnh ngay bên phải khối chữ (đo bằng textlength) để tiêu đề không bị che.
TITLE_SIZE = 58
fx = 64 + int(ImageDraw.Draw(img).textlength('Học lập trình game', font=font('segoeuib.ttf', TITLE_SIZE))) + 36
fy = (H - frame.height) // 2 + 10
shadow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
shadow.paste((23, 35, 61, 90), (fx + 14, fy + 22, fx + frame.width + 14, fy + frame.height + 22), frame.split()[3])
img.paste(shadow.filter(ImageFilter.GaussianBlur(18)), (0, 0), shadow.filter(ImageFilter.GaussianBlur(18)))
img.paste(frame, (fx, fy), frame)

# Khối chữ bên trái.
x = 64
d.rounded_rectangle((x, 70, x + 418, 116), 23, fill='#ffe1c7')
d.text((x + 20, 79), 'Miễn phí · Tiếng Việt · 14 bài', font=font('segoeuib.ttf', 24), fill=ORANGE)
title = font('segoeuib.ttf', TITLE_SIZE)
d.text((x, 140), 'Học lập trình game', font=title, fill=INK)
d.text((x, 210), 'với Oggy', font=title, fill=ORANGE)
body = font('segoeui.ttf', 28)
for i, line in enumerate(['Game loop · Va chạm · State machine', 'Event bus · Canvas · Web Audio', 'bằng mã nguồn thật của một game JS']):
    d.text((x, 326 + i * 42), line, font=body, fill=MUTED if i == 2 else INK)
# "Nút" giả và tên miền ở chân.
d.rounded_rectangle((x, 480, x + 268, 538), 18, fill=ORANGE)
d.text((x + 26, 489), '{ }  Bắt đầu học', font=font('segoeuib.ttf', 28), fill='#ffffff')
d.text((x, 560), 'oggy-adventure.tiennhm.io.vn/learn', font=font('segoeuisb.ttf' if os.path.exists(os.path.join(FONT_DIR, 'segoeuisb.ttf')) else 'segoeuib.ttf', 24), fill=TEAL)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
img.save(OUT, optimize=True)
print('Đã tạo', OUT, img.size, os.path.getsize(OUT) // 1024, 'KB')
