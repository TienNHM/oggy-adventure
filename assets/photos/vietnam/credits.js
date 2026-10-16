/* Ảnh chụp thực tế cho thẻ kiến thức — hành trình "vietnam".
 * File này được TẠO bằng công cụ:  python tools/photos/fetch_commons.py write vietnam
 * (sửa tay được, nhưng lần chạy "write" sau sẽ ghi đè — nên sửa qua công cụ).
 *
 * Vì sao là file .js mà không phải .json?  Game phải chạy được khi mở index.html trực tiếp (file://),
 * mà trình duyệt chặn fetch() file JSON ở chế độ đó. Script .js thì nạp bình thường, nên ta GỌI hàm đăng ký.
 *
 * Định dạng: OG.Photos.register('<journeyId>', { <cardId>: entry, ... })  — cardId phải có trong content.js.
 *   entry = { file: '<cardId>.webp',   // ảnh nằm cạnh file này: assets/photos/vietnam/<file>
 *             w, h,                    // kích thước thật của file ảnh (px)
 *             author,                  // tác giả (chữ thuần)
 *             license, licenseUrl,     // vd 'CC BY-SA 4.0' + link giấy phép
 *             source, sourceUrl,       // 'Wikimedia Commons' | 'Unsplash' | 'Pexels' | 'NASA' + link trang gốc
 *             title,                   // tên / mô tả gốc của ảnh
 *             note,                    // 'Đã thu nhỏ, chuyển sang WebP' (bản phái sinh → phải ghi chú)
 *             focus }                  // (tuỳ chọn) {x, y} 0..1: điểm giữ lại khi cắt ảnh cho vừa khung
 * Giấy phép hợp lệ: Public Domain, CC0, CC BY, CC BY-SA, Unsplash License, Pexels License (xem OG.Photos.licenseOk). */
/* AUTO-SUMMARY (tự sinh khi chạy "write")
 * Danh sách (23 ảnh):
 *   hn_hoguom        CC BY 4.0      P. Hughes
 *   hn_pho           CC BY-SA 3.0   Codename5281
 *   hn_oldquarter    CC BY-SA 4.0   Christophe95
 *   hn_puppet        CC BY-SA 4.0   Steven C. Price
 *   hl_islands       CC0            lumoplank
 *   hl_heritage      CC BY-SA 3.0   Thomas Hirsch / User:Ravn
 *   hl_cave          CC BY 4.0      Jakub Hałun
 *   hl_rocks         CC BY-SA 3.0   Nguyễn Thanh Quang
 *   hue_citadel      CC BY 4.0      Supanut Arunoprayote
 *   hue_nonla        CC BY 2.0      terence from Singapore
 *   hue_river        CC BY 4.0      P. Hughes
 *   ha_lantern       CC BY-SA 4.0   Christophe95
 *   ha_oldtown       CC BY-SA 4.0   Steffen Schmitz
 *   ha_bridge        CC BY-SA 4.0   Steffen Schmitz
 *   ha_douc          CC BY-SA 4.0   Charles J. Sharp
 *   sg_city          CC BY 2.0      Jorge Láscar from Australia
 *   sg_banhmi        CC BY-SA 4.0   Minh Nguyen
 *   sg_market        CC BY-SA 4.0   Bahnfrend
 *   sg_cangio        CC BY-SA 3.0   Tho nau
 *   mt_floating      CC BY 4.0      Vyacheslav Argenberg
 *   mt_fruit         CC BY 2.0      McKay Savage from London, UK
 *   mt_mekong        CC BY-SA 2.0   JUMBOROIS
 *   mt_rice          Public domain  Thuydaonguyen
 */
OG.Photos.register("vietnam", /* BEGIN-ENTRIES */ {
  "hn_hoguom": {
    "file": "hn_hoguom.webp",
    "w": 800,
    "h": 538,
    "author": "P. Hughes",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Hanoi_-_Turtle_Tower_(Th%C3%A1p_R%C3%B9a),_Ho%C3%A0n_Ki%E1%BA%BFm_Lake.jpg",
    "title": "Hanoi - Turtle Tower (Tháp Rùa), Hoàn Kiếm Lake",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "hn_pho": {
    "file": "hn_pho.webp",
    "w": 800,
    "h": 533,
    "author": "Codename5281",
    "license": "CC BY-SA 3.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/3.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Ph%E1%BB%9F_b%C3%B2,_C%E1%BA%A7u_Gi%E1%BA%A5y,_H%C3%A0_N%E1%BB%99i.jpg",
    "title": "Phở bò, Cầu Giấy, Hà Nội",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "hn_oldquarter": {
    "file": "hn_oldquarter.webp",
    "w": 800,
    "h": 600,
    "author": "Christophe95",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:H%C3%A0ng_B%E1%BA%A1c_and_H%C3%A0ng_B%E1%BB%93_streets.jpg",
    "title": "Hàng Bạc and Hàng Bồ streets",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "hn_puppet": {
    "file": "hn_puppet.webp",
    "w": 800,
    "h": 423,
    "author": "Steven C. Price",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Water-Puppet-Show3.jpg",
    "title": "Water-Puppet-Show3",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "hl_islands": {
    "file": "hl_islands.webp",
    "w": 800,
    "h": 534,
    "author": "lumoplank",
    "license": "CC0",
    "licenseUrl": "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Ha_Long_Bay_-_Halong1407.jpg",
    "title": "Ha Long Bay - Halong1407",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "hl_heritage": {
    "file": "hl_heritage.webp",
    "w": 800,
    "h": 600,
    "author": "Thomas Hirsch / User:Ravn",
    "license": "CC BY-SA 3.0",
    "licenseUrl": "http://creativecommons.org/licenses/by-sa/3.0/",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Halong_Bay_in_Vietnam.jpg",
    "title": "Halong Bay in Vietnam",
    "note": "Đã thu nhỏ, chuyển sang WebP",
    "focus": {
      "x": 0.45,
      "y": 0.5
    }
  },
  "hl_cave": {
    "file": "hl_cave.webp",
    "w": 800,
    "h": 534,
    "author": "Jakub Hałun",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Sung_Sot_Cave,_Ha_Long_Bay,_Vietnam,_20240128_1623_3921.jpg",
    "title": "Sung Sot Cave, Ha Long Bay, Vietnam, 20240128 1623 3921",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "hl_rocks": {
    "file": "hl_rocks.webp",
    "w": 800,
    "h": 600,
    "author": "Nguyễn Thanh Quang",
    "license": "CC BY-SA 3.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/3.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Ha_Long_bay_The_Kissing_Rocks.jpg",
    "title": "Ha Long bay The Kissing Rocks",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "hue_citadel": {
    "file": "hue_citadel.webp",
    "w": 800,
    "h": 450,
    "author": "Supanut Arunoprayote",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Meridian_Gate,_Hue_(I).jpg",
    "title": "Meridian Gate, Hue (I)",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "hue_nonla": {
    "file": "hue_nonla.webp",
    "w": 800,
    "h": 532,
    "author": "terence from Singapore",
    "license": "CC BY 2.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/2.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:N%C3%B3n_l%C3%A1_%C4%91%E1%BB%93_ch%C6%A1i.jpg",
    "title": "Nón lá đồ chơi",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "hue_river": {
    "file": "hue_river.webp",
    "w": 800,
    "h": 531,
    "author": "P. Hughes",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Hu%E1%BA%BF_-_Vietnamese_dragon_boat_operating_as_a_tourist_vessel_on_the_Perfume_River.jpg",
    "title": "Huế - Vietnamese dragon boat operating as a tourist vessel on the Perfume River",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "ha_lantern": {
    "file": "ha_lantern.webp",
    "w": 800,
    "h": 600,
    "author": "Christophe95",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Lanterns_in_Hoi_An_5.jpg",
    "title": "Lanterns in Hoi An 5",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "ha_oldtown": {
    "file": "ha_oldtown.webp",
    "w": 800,
    "h": 514,
    "author": "Steffen Schmitz",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:H%E1%BB%99i_An,_Ancient_Town,_2020-01_CN-06.jpg",
    "title": "Hội An, Ancient Town, 2020-01 CN-06",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "ha_bridge": {
    "file": "ha_bridge.webp",
    "w": 800,
    "h": 548,
    "author": "Steffen Schmitz",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:H%E1%BB%99i_An,_Ch%C3%B9a_C%E1%BA%A7u,_2020-01_CN-01.jpg",
    "title": "Hội An, Chùa Cầu, 2020-01 CN-01",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "ha_douc": {
    "file": "ha_douc.webp",
    "w": 800,
    "h": 533,
    "author": "Charles J. Sharp",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Red-shanked_douc_langur_(Pygathrix_nemaeus)_female_Son_Tra_2.jpg",
    "title": "Red-shanked douc langur (Pygathrix nemaeus) female Son Tra 2",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "sg_city": {
    "file": "sg_city.webp",
    "w": 800,
    "h": 600,
    "author": "Jorge Láscar from Australia",
    "license": "CC BY 2.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/2.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Lascar_Ho_Chi_Minh_City_The_Capital_of_Motorbikes_(4607948894).jpg",
    "title": "Lascar Ho Chi Minh City The Capital of Motorbikes (4607948894)",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "sg_banhmi": {
    "file": "sg_banhmi.webp",
    "w": 800,
    "h": 600,
    "author": "Minh Nguyen",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:B%C3%A1nh_m%C3%AC_th%E1%BB%8Bt_ngu%E1%BB%99i.jpg",
    "title": "Bánh mì thịt nguội",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "sg_market": {
    "file": "sg_market.webp",
    "w": 800,
    "h": 799,
    "author": "Bahnfrend",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Ben_Thanh_Market,_2023_(02).jpg",
    "title": "Ben Thanh Market, 2023 (02)",
    "note": "Đã thu nhỏ, chuyển sang WebP",
    "focus": {
      "x": 0.5,
      "y": 0.45
    }
  },
  "sg_cangio": {
    "file": "sg_cangio.webp",
    "w": 800,
    "h": 600,
    "author": "Tho nau",
    "license": "CC BY-SA 3.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/3.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Mangrove_in_Can_Gio_forest.jpg",
    "title": "Mangrove in Can Gio forest",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "mt_floating": {
    "file": "mt_floating.webp",
    "w": 800,
    "h": 533,
    "author": "Vyacheslav Argenberg",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Can_Tho,_Vietnam,_Floating_Market.jpg",
    "title": "Can Tho, Vietnam, Floating Market",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "mt_fruit": {
    "file": "mt_fruit.webp",
    "w": 800,
    "h": 600,
    "author": "McKay Savage from London, UK",
    "license": "CC BY 2.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/2.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Vietnam_08_-_164_-_rambutam_and_fruit_at_the_market_(3186660549).jpg",
    "title": "Vietnam 08 - 164 - rambutam and fruit at the market (3186660549)",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "mt_mekong": {
    "file": "mt_mekong.webp",
    "w": 800,
    "h": 532,
    "author": "JUMBOROIS",
    "license": "CC BY-SA 2.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/2.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Mekong_River,_C%E1%BA%A7n_Th%C6%A1,_Vietnam_(16803696762).jpg",
    "title": "Mekong River, Cần Thơ, Vietnam (16803696762)",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "mt_rice": {
    "file": "mt_rice.webp",
    "w": 800,
    "h": 600,
    "author": "Thuydaonguyen",
    "license": "Public domain",
    "licenseUrl": "https://creativecommons.org/publicdomain/mark/1.0/",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Ru%E1%BB%99ng_t%E1%BA%A1i_H%C3%B2n_%C4%90%E1%BA%A5t.jpg",
    "title": "Ruộng tại Hòn Đất",
    "note": "Đã thu nhỏ, chuyển sang WebP",
    "focus": {
      "x": 0.5,
      "y": 0.45
    }
  }
} /* END-ENTRIES */);
