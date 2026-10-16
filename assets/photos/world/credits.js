/* Ảnh chụp thực tế cho thẻ kiến thức — hành trình "world".
 * File này được TẠO bằng công cụ:  python tools/photos/fetch_commons.py write world
 * (sửa tay được, nhưng lần chạy "write" sau sẽ ghi đè — nên sửa qua công cụ).
 *
 * Vì sao là file .js mà không phải .json?  Game phải chạy được khi mở index.html trực tiếp (file://),
 * mà trình duyệt chặn fetch() file JSON ở chế độ đó. Script .js thì nạp bình thường, nên ta GỌI hàm đăng ký.
 *
 * Định dạng: OG.Photos.register('<journeyId>', { <cardId>: entry, ... })  — cardId phải có trong content.js.
 *   entry = { file: '<cardId>.webp',   // ảnh nằm cạnh file này: assets/photos/world/<file>
 *             w, h,                    // kích thước thật của file ảnh (px)
 *             author,                  // tác giả (chữ thuần)
 *             license, licenseUrl,     // vd 'CC BY-SA 4.0' + link giấy phép
 *             source, sourceUrl,       // 'Wikimedia Commons' | 'Unsplash' | 'Pexels' | 'NASA' + link trang gốc
 *             title,                   // tên / mô tả gốc của ảnh
 *             note,                    // 'Đã thu nhỏ, chuyển sang WebP' (bản phái sinh → phải ghi chú)
 *             focus }                  // (tuỳ chọn) {x, y} 0..1: điểm giữ lại khi cắt ảnh cho vừa khung
 * Giấy phép hợp lệ: Public Domain, CC0, CC BY, CC BY-SA, Unsplash License, Pexels License (xem OG.Photos.licenseOk). */
/* AUTO-SUMMARY (tự sinh khi chạy "write")
 * Danh sách (19 ảnh):
 *   eg_pyramid       CC BY-SA 2.0   Ricardo Liberato
 *   eg_nile          CC BY 4.0      Vyacheslav Argenberg
 *   eg_hiero         CC BY-SA 2.0   Bernard DUPONT from FRANCE
 *   eg_camel         CC BY-SA 4.0   لا روسا
 *   fr_eiffel        CC BY 2.0      Fred Romero from Paris, France
 *   fr_croissant     CC BY-SA 3.0   SKopp
 *   fr_louvre        CC BY-SA 4.0   Aliva Sahoo
 *   jp_fuji          CC BY-SA 3.0   名古屋太郎
 *   jp_sakura        CC BY 4.0      Kirin7739
 *   jp_sushi         CC BY-SA 4.0   Joli Rumi
 *   jp_train         CC BY-SA 4.0   MaedaAkihiko
 *   am_forest        CC BY-SA 2.0   lubasi
 *   am_macaw         CC BY-SA 4.0   Charles J. Sharp
 *   am_sloth         CC BY-SA 4.0   Charles J. Sharp
 *   am_frog          CC BY 3.0      Michael Gäbler
 *   ar_bear          CC BY-SA 4.0   Andreas Weith
 *   ar_ice           Public domain  NASA Goddard Space Flight Center from Greenbelt, M
 *   ar_aurora        Public domain  United States Air Force photo by Senior Airman Jos
 *   ar_penguin       CC BY 4.0      John Hardin
 */
OG.Photos.register("world", /* BEGIN-ENTRIES */ {
  "eg_pyramid": {
    "file": "eg_pyramid.webp",
    "w": 800,
    "h": 532,
    "author": "Ricardo Liberato",
    "license": "CC BY-SA 2.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/2.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:All_Gizah_Pyramids.jpg",
    "title": "All Gizah Pyramids",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "eg_nile": {
    "file": "eg_nile.webp",
    "w": 800,
    "h": 533,
    "author": "Vyacheslav Argenberg",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Nile_River,_Feluccas,_Aswan,_Egypt.jpg",
    "title": "Nile River, Feluccas, Aswan, Egypt",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "eg_hiero": {
    "file": "eg_hiero.webp",
    "w": 800,
    "h": 532,
    "author": "Bernard DUPONT from FRANCE",
    "license": "CC BY-SA 2.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/2.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Colorful_Hieroglyphs_and_Starred_Ceiling_..._(36473972566).jpg",
    "title": "Colorful Hieroglyphs and Starred Ceiling ... (36473972566)",
    "note": "Đã thu nhỏ, chuyển sang WebP",
    "focus": {
      "x": 0.45,
      "y": 0.6
    }
  },
  "eg_camel": {
    "file": "eg_camel.webp",
    "w": 800,
    "h": 533,
    "author": "لا روسا",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Camel_Nuweibaa_00_(12).JPG",
    "title": "Camel Nuweibaa 00 (12)",
    "note": "Đã thu nhỏ, chuyển sang WebP",
    "focus": {
      "x": 0.45,
      "y": 0.65
    }
  },
  "fr_eiffel": {
    "file": "fr_eiffel.webp",
    "w": 800,
    "h": 533,
    "author": "Fred Romero from Paris, France",
    "license": "CC BY 2.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/2.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Paris_-_Jardins_du_Trocad%C3%A9ro_%26_Tour_Eiffel_(26804140054).jpg",
    "title": "Paris - Jardins du Trocadéro & Tour Eiffel (26804140054)",
    "note": "Đã thu nhỏ, chuyển sang WebP",
    "focus": {
      "x": 0.75,
      "y": 0.4
    }
  },
  "fr_croissant": {
    "file": "fr_croissant.webp",
    "w": 800,
    "h": 600,
    "author": "SKopp",
    "license": "CC BY-SA 3.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/3.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Croissant,_whole.jpg",
    "title": "Croissant, whole",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "fr_louvre": {
    "file": "fr_louvre.webp",
    "w": 800,
    "h": 531,
    "author": "Aliva Sahoo",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Louvre_Pyramid_from_Cour_Napol%C3%A9on,_Paris.jpg",
    "title": "Louvre Pyramid from Cour Napoléon, Paris",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "jp_fuji": {
    "file": "jp_fuji.webp",
    "w": 800,
    "h": 536,
    "author": "名古屋太郎",
    "license": "CC BY-SA 3.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/3.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Kodaki_fuji_frm_shojinko.jpg",
    "title": "Kodaki fuji frm shojinko",
    "note": "Đã thu nhỏ, chuyển sang WebP",
    "focus": {
      "x": 0.5,
      "y": 0.4
    }
  },
  "jp_sakura": {
    "file": "jp_sakura.webp",
    "w": 800,
    "h": 550,
    "author": "Kirin7739",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Cherry_blossoms_and_boat_at_Chidorigafuchi.jpg",
    "title": "Cherry blossoms and boat at Chidorigafuchi",
    "note": "Đã thu nhỏ, chuyển sang WebP",
    "focus": {
      "x": 0.5,
      "y": 0.4
    }
  },
  "jp_sushi": {
    "file": "jp_sushi.webp",
    "w": 800,
    "h": 450,
    "author": "Joli Rumi",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Sushi_platter,_Nikko,_Japan.jpg",
    "title": "Sushi platter, Nikko, Japan",
    "note": "Đã thu nhỏ, chuyển sang WebP",
    "focus": {
      "x": 0.45,
      "y": 0.6
    }
  },
  "jp_train": {
    "file": "jp_train.webp",
    "w": 800,
    "h": 534,
    "author": "MaedaAkihiko",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Series-N700S-J2.jpg",
    "title": "Series-N700S-J2",
    "note": "Đã thu nhỏ, chuyển sang WebP",
    "focus": {
      "x": 0.35,
      "y": 0.6
    }
  },
  "am_forest": {
    "file": "am_forest.webp",
    "w": 800,
    "h": 491,
    "author": "lubasi",
    "license": "CC BY-SA 2.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/2.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Aerial_view_of_the_Amazon_Rainforest.jpg",
    "title": "Aerial view of the Amazon Rainforest",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "am_macaw": {
    "file": "am_macaw.webp",
    "w": 800,
    "h": 533,
    "author": "Charles J. Sharp",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Scarlet_macaw_(Ara_macao_cyanopterus)_Copan.jpg",
    "title": "Scarlet macaw (Ara macao cyanopterus) Copan",
    "note": "Đã thu nhỏ, chuyển sang WebP",
    "focus": {
      "x": 0.45,
      "y": 0.45
    }
  },
  "am_sloth": {
    "file": "am_sloth.webp",
    "w": 800,
    "h": 533,
    "author": "Charles J. Sharp",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Brown-throated_sloth_(Bradypus_variegatus)_female.jpg",
    "title": "Brown-throated sloth (Bradypus variegatus) female",
    "note": "Đã thu nhỏ, chuyển sang WebP",
    "focus": {
      "x": 0.4,
      "y": 0.5
    }
  },
  "am_frog": {
    "file": "am_frog.webp",
    "w": 800,
    "h": 618,
    "author": "Michael Gäbler",
    "license": "CC BY 3.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/3.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Dendrobates_azureus_(Dendrobates_tinctorius)_Edit.jpg",
    "title": "Dendrobates azureus (Dendrobates tinctorius) Edit",
    "note": "Đã thu nhỏ, chuyển sang WebP",
    "focus": {
      "x": 0.6,
      "y": 0.5
    }
  },
  "ar_bear": {
    "file": "ar_bear.webp",
    "w": 800,
    "h": 450,
    "author": "Andreas Weith",
    "license": "CC BY-SA 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Polar_bear_(Ursus_maritimus)_in_the_drift_ice_region_north_of_Svalbard.jpg",
    "title": "Polar bear (Ursus maritimus) in the drift ice region north of Svalbard",
    "note": "Đã thu nhỏ, chuyển sang WebP",
    "focus": {
      "x": 0.45,
      "y": 0.35
    }
  },
  "ar_ice": {
    "file": "ar_ice.webp",
    "w": 800,
    "h": 533,
    "author": "NASA Goddard Space Flight Center from Greenbelt, MD, USA",
    "license": "Public domain",
    "licenseUrl": "https://creativecommons.org/publicdomain/mark/1.0/",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Sea_Ice_in_the_Chukchi_Sea_(7348953402).jpg",
    "title": "Sea Ice in the Chukchi Sea (7348953402)",
    "note": "Đã thu nhỏ, chuyển sang WebP",
    "focus": {
      "x": 0.5,
      "y": 0.6
    }
  },
  "ar_aurora": {
    "file": "ar_aurora.webp",
    "w": 800,
    "h": 521,
    "author": "United States Air Force photo by Senior Airman Joshua Strang",
    "license": "Public domain",
    "licenseUrl": "https://creativecommons.org/publicdomain/mark/1.0/",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Aurora_borealis_over_Eielson_Air_Force_Base,_Alaska.jpg",
    "title": "Aurora borealis over Eielson Air Force Base, Alaska",
    "note": "Đã thu nhỏ, chuyển sang WebP"
  },
  "ar_penguin": {
    "file": "ar_penguin.webp",
    "w": 800,
    "h": 600,
    "author": "John Hardin",
    "license": "CC BY 4.0",
    "licenseUrl": "https://creativecommons.org/licenses/by/4.0",
    "source": "Wikimedia Commons",
    "sourceUrl": "https://commons.wikimedia.org/wiki/File:Three_Ad%C3%A9lie_penguins.jpg",
    "title": "Three Adélie penguins",
    "note": "Đã thu nhỏ, chuyển sang WebP",
    "focus": {
      "x": 0.5,
      "y": 0.6
    }
  }
} /* END-ENTRIES */);
