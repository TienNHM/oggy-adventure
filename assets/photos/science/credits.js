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
 * Danh sách (18 ảnh):
 *   dn_herbivore     CC BY 3.0      Matt Wedel
 *   dn_trex          CC BY-SA 4.0   Zissoudisctrucker
 *   dn_fossil        CC BY-SA 3.0   Drake411
 *   dn_bird          CC BY-SA 4.0   Emily Willoughby
 *   bd_heart         CC BY 4.0      Dguendel
 *   bd_blood         CC BY-SA 3.0   Rogeriopfm
 *   bd_lungs         CC0            Eboelen
 *   bd_bones         CC BY 3.0      Jason Hickey
 *   bd_teeth         Public domain  Sebastian Wallroth
 *   oc_ocean         Public domain  NASA/Apollo 17 crew; taken by either Harrison Schm
 *   oc_octopus       CC BY 2.0      Kārlis Dambrāns (janitors)
 *   oc_glow          CC BY-SA 2.0   NOAA Ocean Explorer from USA
 *   oc_whale         Public domain  NOAA Photo Library
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
    "h": 600,
    "author": "Zissoudisctrucker",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:FMNH_Tyrannosaurus_rex_Sue.jpg",
    "title": "FMNH Tyrannosaurus rex Sue",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "dn_fossil": {
    "file": "dn_fossil.webp",
    "w": 800,
    "h": 600,
    "author": "Drake411",
    "license": "CC BY-SA 3.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/3.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Sauropod_Skull_Articulated_Neck,_Wall_of_Bones,_Dinosaur_National_Monument,_Quarry_Building_2012.JPG",
    "title": "Sauropod Skull Articulated Neck, Wall of Bones, Dinosaur National Monument, Quarry Building 2012",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "dn_bird": {
    "file": "dn_bird.webp",
    "w": 670,
    "h": 800,
    "author": "Emily Willoughby",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Berlin_Archaeopteryx.jpg",
    "title": "Berlin Archaeopteryx",
    "note": "Đã thu nhỏ, chuyển sang WebP",
    "focus": {
      "x": 0.5,
      "y": 0.45
    }
  },
  "bd_heart": {
    "file": "bd_heart.webp",
    "w": 578,
    "h": 800,
    "author": "Dguendel",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Dresden,_Deutsches_Hygiene-Museum,_anatomisches_Modell,_Herz.jpg",
    "title": "Dresden, Deutsches Hygiene-Museum, anatomisches Modell, Herz",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "bd_blood": {
    "file": "bd_blood.webp",
    "w": 800,
    "h": 500,
    "author": "Rogeriopfm",
    "license": "CC BY-SA 3.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/3.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Erythrocyte_oxy.jpg",
    "title": "Erythrocyte oxy",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "bd_lungs": {
    "file": "bd_lungs.webp",
    "w": 800,
    "h": 629,
    "author": "Eboelen",
    "license": "CC0",
    "licenseUrl": "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:3d_model_of_lungs_airways_ribs.jpg",
    "title": "3d model of lungs airways ribs",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "bd_bones": {
    "file": "bd_bones.webp",
    "w": 541,
    "h": 800,
    "author": "Jason Hickey",
    "license": "CC BY 3.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/3.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:X-ray_child%27s_hand.jpg",
    "title": "X-ray child's hand",
    "note": "Đã thu nhỏ, chuyển sang WebP",
    "focus": {
      "x": 0.5,
      "y": 0.4
    }
  },
  "bd_teeth": {
    "file": "bd_teeth.webp",
    "w": 800,
    "h": 600,
    "author": "Sebastian Wallroth",
    "license": "Public domain",
    "licenseUrl": "https://creativecommons.org/publicdomain/mark/1.0/",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Deciduous_teeths.jpg",
    "title": "Deciduous teeths",
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
    "h": 533,
    "author": "Kārlis Dambrāns (janitors)",
    "license": "CC BY 2.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/2.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Giant_Pacific_octopus_in_exhibit_at_Monterey_Bay_Aquarium.jpg",
    "title": "Giant Pacific octopus in exhibit at Monterey Bay Aquarium",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "oc_glow": {
    "file": "oc_glow.webp",
    "w": 600,
    "h": 399,
    "author": "NOAA Ocean Explorer from USA",
    "license": "CC BY-SA 2.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/2.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Atolla_wyvillei_(Operation_Deep_Scope_2004).jpg",
    "title": "Atolla wyvillei (Operation Deep Scope 2004)",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "oc_whale": {
    "file": "oc_whale.webp",
    "w": 800,
    "h": 554,
    "author": "NOAA Photo Library",
    "license": "Public domain",
    "licenseUrl": "https://creativecommons.org/publicdomain/mark/1.0/",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Anim1754_-_Flickr_-_NOAA_Photo_Library.jpg",
    "title": "Anim1754 - Flickr - NOAA Photo Library",
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
