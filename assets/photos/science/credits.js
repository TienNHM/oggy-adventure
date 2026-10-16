/* Ảnh chụp thực tế cho thẻ kiến thức — hành trình "science".
 * File này được TẠO bằng công cụ:  python tools/photos/fetch_commons.py write science
 * (sửa tay được, nhưng lần chạy "write" sau sẽ ghi đè — nên sửa qua công cụ).
 *
 * Vì sao là file .js mà không phải .json?  Game phải chạy được khi mở index.html trực tiếp (file://),
 * mà trình duyệt chặn fetch() file JSON ở chế độ đó. Script .js thì nạp bình thường, nên ta GỌI hàm đăng ký.
 *
 * Định dạng: OG.Photos.register('<journeyId>', { <cardId>: entry, ... })  — cardId phải có trong content.js.
 *   entry = { file: '<cardId>.webp',   // ảnh nằm cạnh file này: assets/photos/science/<file>
 *             w, h,                    // kích thước thật của file ảnh (px)
 *             author,                  // tác giả (chữ thuần)
 *             license, licenseUrl,     // vd 'CC BY-SA 4.0' + link giấy phép
 *             source, sourceUrl,       // 'Wikimedia Commons' | 'Unsplash' | 'Pexels' | 'NASA' + link trang gốc
 *             title,                   // tên / mô tả gốc của ảnh
 *             note,                    // 'Đã thu nhỏ, chuyển sang WebP' (bản phái sinh → phải ghi chú)
 *             focus }                  // (tuỳ chọn) {x, y} 0..1: điểm giữ lại khi cắt ảnh cho vừa khung
 * Giấy phép hợp lệ: Public Domain, CC0, CC BY, CC BY-SA, Unsplash License, Pexels License (xem OG.Photos.licenseOk). */
/* AUTO-SUMMARY (tự sinh khi chạy "write")
 * Danh sách (13 ảnh):
 *   dn_herbivore     CC BY 3.0      Matt Wedel
 *   dn_trex          CC BY 4.0      Larry D. Moore
 *   dn_fossil        CC BY 2.0      Becks
 *   dn_bird          CC0            Petr Kratochvil
 *   oc_ocean         Public domain  NASA/Apollo 17 crew; taken by either Harrison Schm
 *   oc_octopus       CC BY 4.0      Pauline Walsh Jacobson
 *   oc_glow          Public domain  Magic5227 at English Wikipedia
 *   oc_whale         CC BY-SA 3.0   Don Ramey Logan
 *   sp_sun           Public domain  NASA/SDO (AIA)
 *   sp_moon          CC BY-SA 3.0   Gregory H. Revera
 *   sp_astronaut     Public domain  NASA
 *   sp_planets       CC BY-SA 3.0   WP
 *   sp_jupiter       Public domain  NASA/STSCI (S.T.A.R.S)
 */
OG.Photos.register("science", /* BEGIN-ENTRIES */ {
  "dn_herbivore": {
    "file": "dn_herbivore.webp",
    "w": 800,
    "h": 669,
    "author": "Matt Wedel",
    "license": "CC BY 3.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/3.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Brachiosaurus_mount.jpg",
    "title": "Brachiosaurus mount",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "dn_trex": {
    "file": "dn_trex.webp",
    "w": 800,
    "h": 533,
    "author": "Larry D. Moore",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Tyrannosaurus_Model_Dinosaur_Valley_State_Park_Texas_2023.jpg",
    "title": "Tyrannosaurus Model Dinosaur Valley State Park Texas 2023",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "dn_fossil": {
    "file": "dn_fossil.webp",
    "w": 800,
    "h": 600,
    "author": "Becks",
    "license": "CC BY 2.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/2.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Ammonite_fossil_(8606998286).jpg",
    "title": "Ammonite fossil (8606998286)",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "dn_bird": {
    "file": "dn_bird.webp",
    "w": 533,
    "h": 800,
    "author": "Petr Kratochvil",
    "license": "CC0",
    "licenseUrl": "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Yellow_Chick.jpg",
    "title": "Yellow Chick",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "oc_ocean": {
    "file": "oc_ocean.webp",
    "w": 799,
    "h": 800,
    "author": "NASA/Apollo 17 crew; taken by either Harrison Schmitt or Ron Evans",
    "license": "Public domain",
    "licenseUrl": "https://creativecommons.org/publicdomain/mark/1.0/",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:The_Earth_seen_from_Apollo_17.jpg",
    "title": "The Blue Marble",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "oc_octopus": {
    "file": "oc_octopus.webp",
    "w": 800,
    "h": 600,
    "author": "Pauline Walsh Jacobson",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Octopus_cyanea_251606691.jpg",
    "title": "Octopus cyanea 251606691",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "oc_glow": {
    "file": "oc_glow.webp",
    "w": 800,
    "h": 600,
    "author": "Magic5227 at English Wikipedia",
    "license": "Public domain",
    "licenseUrl": "https://creativecommons.org/publicdomain/mark/1.0/",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Jelly_4.JPG",
    "title": "Jelly 4",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "oc_whale": {
    "file": "oc_whale.webp",
    "w": 800,
    "h": 475,
    "author": "Don Ramey Logan",
    "license": "CC BY-SA 3.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/3.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Large_Blue_Whale_Off_Southern_California_Coast_Photo_Don_Ramey_Logan.jpg",
    "title": "Large Blue Whale Off Southern California Coast Photo Don Ramey Logan",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "sp_sun": {
    "file": "sp_sun.webp",
    "w": 800,
    "h": 764,
    "author": "NASA/SDO (AIA)",
    "license": "Public domain",
    "licenseUrl": "https://creativecommons.org/publicdomain/mark/1.0/",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:The_Sun_by_the_Atmospheric_Imaging_Assembly_of_NASA%27s_Solar_Dynamics_Observatory_-_20100819.jpg",
    "title": "The Sun by the Atmospheric Imaging Assembly of NASA's Solar Dynamics Observatory - 20100819",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "sp_moon": {
    "file": "sp_moon.webp",
    "w": 800,
    "h": 760,
    "author": "Gregory H. Revera",
    "license": "CC BY-SA 3.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/3.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:FullMoon2010.jpg",
    "title": "FullMoon2010",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "sp_astronaut": {
    "file": "sp_astronaut.webp",
    "w": 800,
    "h": 528,
    "author": "NASA",
    "license": "Public domain",
    "licenseUrl": "https://creativecommons.org/publicdomain/mark/1.0/",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:STS-116_spacewalk_1.jpg",
    "title": "STS-116 spacewalk 1",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "sp_planets": {
    "file": "sp_planets.webp",
    "w": 800,
    "h": 472,
    "author": "WP",
    "license": "CC BY-SA 3.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/3.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Planets2013-unlabeled.jpg",
    "title": "Planets2013-unlabeled",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "sp_jupiter": {
    "file": "sp_jupiter.webp",
    "w": 800,
    "h": 724,
    "author": "NASA/STSCI (S.T.A.R.S)",
    "license": "Public domain",
    "licenseUrl": "https://creativecommons.org/publicdomain/mark/1.0/",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Jupiter_OPAL_2024.png",
    "title": "Jupiter OPAL 2024",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  }
} /* END-ENTRIES */);
