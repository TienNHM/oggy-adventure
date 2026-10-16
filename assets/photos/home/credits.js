/* Ảnh chụp thực tế cho thẻ kiến thức — hành trình "home".
 * File này được TẠO bằng công cụ:  python tools/photos/fetch_commons.py write home
 * (sửa tay được, nhưng lần chạy "write" sau sẽ ghi đè — nên sửa qua công cụ).
 *
 * Vì sao là file .js mà không phải .json?  Game phải chạy được khi mở index.html trực tiếp (file://),
 * mà trình duyệt chặn fetch() file JSON ở chế độ đó. Script .js thì nạp bình thường, nên ta GỌI hàm đăng ký.
 *
 * Định dạng: OG.Photos.register('<journeyId>', { <cardId>: entry, ... })  — cardId phải có trong content.js.
 *   entry = { file: '<cardId>.webp',   // ảnh nằm cạnh file này: assets/photos/home/<file>
 *             w, h,                    // kích thước thật của file ảnh (px)
 *             author,                  // tác giả (chữ thuần)
 *             license, licenseUrl,     // vd 'CC BY-SA 4.0' + link giấy phép
 *             source, sourceUrl,       // 'Wikimedia Commons' | 'Unsplash' | 'Pexels' | 'NASA' + link trang gốc
 *             title,                   // tên / mô tả gốc của ảnh
 *             note,                    // 'Đã thu nhỏ, chuyển sang WebP' (bản phái sinh → phải ghi chú)
 *             focus }                  // (tuỳ chọn) {x, y} 0..1: điểm giữ lại khi cắt ảnh cho vừa khung
 * Giấy phép hợp lệ: Public Domain, CC0, CC BY, CC BY-SA, Unsplash License, Pexels License (xem OG.Photos.licenseOk). */
/* AUTO-SUMMARY (tự sinh khi chạy "write")
 * Danh sách (16 ảnh):
 *   k_veggie         CC BY-SA 4.0   Dietmar Rabich
 *   k_water          CC BY 2.0      Shixart1985
 *   k_handwash       CC BY-SA 4.0   Davyimage
 *   k_fruit          CC BY-SA 4.0   PattayaPatrol
 *   g_plant          CC BY-SA 3.0   Fasaxc
 *   g_seed           CC BY-SA 4.0   B. Domangue
 *   g_bee            Public domain  John Severns ( Severnjc )
 *   g_ladybug        CC BY-SA 4.0   Andrea Bonifazi
 *   r_cloud          CC BY-SA 4.0   Michal Klajban
 *   r_wind           CC BY-SA 2.0   achille.ballabeni
 *   r_rainbow        CC BY-SA 4.0   Basile Morin
 *   r_sun            Public domain  NASA Goddard Space Flight Center from Greenbelt, M
 *   r_moon           CC0            Cbaile19
 *   b_magnet         CC BY-SA 4.0   Maciej J. Mrowinski
 *   b_recycle        CC BY-SA 4.0   Grendelkhan
 *   b_sort           CC0            M!dgard
 */
OG.Photos.register("home", /* BEGIN-ENTRIES */ {
  "k_veggie": {
    "file": "k_veggie.webp",
    "w": 800,
    "h": 533,
    "author": "Dietmar Rabich",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:M%C3%BCnster,_Wochenmarkt_--_2017_--_2333.jpg",
    "title": "Münster, Wochenmarkt -- 2017 -- 2333",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "k_water": {
    "file": "k_water.webp",
    "w": 800,
    "h": 533,
    "author": "Shixart1985",
    "license": "CC BY 2.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/2.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Person_pours_water_from_a_bottle_into_a_glass_in_a_kitchen.jpg",
    "title": "Person pours water from a bottle into a glass in a kitchen",
    "note": "Đã thu nhỏ, chuyển sang WebP",
    "focus": {
      "x": 0.52,
      "y": 0.55
    }
  },
  "k_handwash": {
    "file": "k_handwash.webp",
    "w": 800,
    "h": 533,
    "author": "Davyimage",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Washing_hand_with_soap_in_prevention_of_covid-19.jpg",
    "title": "Washing hand with soap in prevention of covid-19",
    "note": "Đã thu nhỏ, chuyển sang WebP",
    "focus": {
      "x": 0.6,
      "y": 0.45
    }
  },
  "k_fruit": {
    "file": "k_fruit.webp",
    "w": 800,
    "h": 533,
    "author": "PattayaPatrol",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:DFC_3945_A_pile_of_glossy_green_guavas_with_one_sliced_open_to_reveal_its_bright_pink_seed-speckled_interior.jpg",
    "title": "DFC 3945 A pile of glossy green guavas with one sliced open to reveal its bright pink seed-speckled interior",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "g_plant": {
    "file": "g_plant.webp",
    "w": 800,
    "h": 533,
    "author": "Fasaxc",
    "license": "CC BY-SA 3.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/3.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Backlit_green_poinsettia_leaf.jpg",
    "title": "Backlit green poinsettia leaf",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "g_seed": {
    "file": "g_seed.webp",
    "w": 800,
    "h": 571,
    "author": "B. Domangue",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Navy_Bean_Seed_to_Seedling_Germination.jpg",
    "title": "Navy Bean Seed to Seedling Germination",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "g_bee": {
    "file": "g_bee.webp",
    "w": 800,
    "h": 632,
    "author": "John Severns ( Severnjc )",
    "license": "Public domain",
    "licenseUrl": "https://creativecommons.org/publicdomain/mark/1.0/",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:European_honey_bee_extracts_nectar.jpg",
    "title": "European honey bee extracts nectar",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "g_ladybug": {
    "file": "g_ladybug.webp",
    "w": 800,
    "h": 599,
    "author": "Andrea Bonifazi",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Close_up_of_a_Coccinella_septempunctata_on_a_leaf.jpg",
    "title": "Close up of a Coccinella septempunctata on a leaf",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "r_cloud": {
    "file": "r_cloud.webp",
    "w": 800,
    "h": 443,
    "author": "Michal Klajban",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Rain_over_Beinn_Eich,_Luss_Hills,_Scotland.jpg",
    "title": "Rain over Beinn Eich, Luss Hills, Scotland",
    "note": "Đã thu nhỏ, chuyển sang WebP",
    "focus": {
      "x": 0.5,
      "y": 0.4
    }
  },
  "r_wind": {
    "file": "r_wind.webp",
    "w": 800,
    "h": 450,
    "author": "achille.ballabeni",
    "license": "CC BY-SA 2.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/2.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Sky_full_of_kites,_Cervia_2007.jpg",
    "title": "Sky full of kites, Cervia 2007",
    "note": "Đã thu nhỏ, chuyển sang WebP",
    "focus": {
      "x": 0.5,
      "y": 0.4
    }
  },
  "r_rainbow": {
    "file": "r_rainbow.webp",
    "w": 800,
    "h": 500,
    "author": "Basile Morin",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Landscape_with_rainbow_and_the_Old_Bridge_over_the_Nam_Khan_river_in_Luang_Prabang_Laos.jpg",
    "title": "Landscape with rainbow and the Old Bridge over the Nam Khan river in Luang Prabang Laos",
    "note": "Đã thu nhỏ, chuyển sang WebP",
    "focus": {
      "x": 0.35,
      "y": 0.5
    }
  },
  "r_sun": {
    "file": "r_sun.webp",
    "w": 800,
    "h": 450,
    "author": "NASA Goddard Space Flight Center from Greenbelt, MD, USA",
    "license": "Public domain",
    "licenseUrl": "https://creativecommons.org/publicdomain/mark/1.0/",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:SDO_AIA_Full-Disk_View_of_Launching_Filament_(4540790187).jpg",
    "title": "SDO AIA Full-Disk View of Launching Filament (4540790187)",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "r_moon": {
    "file": "r_moon.webp",
    "w": 800,
    "h": 600,
    "author": "Cbaile19",
    "license": "CC0",
    "licenseUrl": "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Waxing_gibbous_moon,_2022-10-04.jpg",
    "title": "Waxing gibbous moon, 2022-10-04",
    "note": "Đã thu nhỏ, chuyển sang WebP",
    "focus": {
      "x": 0.32,
      "y": 0.5
    }
  },
  "b_magnet": {
    "file": "b_magnet.webp",
    "w": 800,
    "h": 533,
    "author": "Maciej J. Mrowinski",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Horseshoe_magnet_metal_shavings.jpg",
    "title": "Horseshoe magnet metal shavings",
    "note": "Đã thu nhỏ, chuyển sang WebP",
    "focus": {
      "x": 0.65,
      "y": 0.4
    }
  },
  "b_recycle": {
    "file": "b_recycle.webp",
    "w": 800,
    "h": 600,
    "author": "Grendelkhan",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Bales_of_PET_bottles_closeup.jpg",
    "title": "Bales of PET bottles closeup",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "b_sort": {
    "file": "b_sort.webp",
    "w": 800,
    "h": 600,
    "author": "M!dgard",
    "license": "CC0",
    "licenseUrl": "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:NMBS-SNCB_three_bins.jpg",
    "title": "NMBS-SNCB three bins",
    "note": "Đã thu nhỏ, chuyển sang WebP",
    "focus": {
      "x": 0.5,
      "y": 0.45
    }
  }
} /* END-ENTRIES */);
