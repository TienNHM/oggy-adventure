// @ts-check
/* ============================================================================
 * OG.Collectibles — VẬT PHẨM NHẶT ĐƯỢC TRONG MÀN (pizza = mục tiêu, coin = xu)
 * ----------------------------------------------------------------------------
 * Vai trò:      Tạo, kiểm tra chạm và vẽ vật phẩm. Scene 'level' tạo item từ LevelDef.pizzas/coins, mỗi frame
 *               gọi touches() để xét nhặt và draw() để vẽ. Thêm loại mới qua OG.Collectibles.registerType().
 * Khái niệm:    registry loại vật phẩm · vùng nhặt theo khoảng cách tâm (không phải AABB đầy đủ) ·
 *               nam châm (magnet) kéo vật phẩm theo dt · hoạt ảnh nhấp nhô bằng sin(t) lệch pha ngẫu nhiên ·
 *               vẽ dự phòng bằng emoji
 * Bài học:      docs/learn/04-vat-ly-va-cham-aabb.md (vùng nhặt), docs/learn/07-ve-canvas-procedural-cache.md (bob)
 * Phụ thuộc:    OG.Sprites.drawProp (tuỳ chọn, đọc LÚC CHẠY)
 * Event:        phát: (không — Level phát 'item:collect') · nghe: (không)
 * API công khai: OG.Collectibles.types, registerType(name, def), create(type, x, y), touches(it, p, dt, magnet), draw(ctx, it, t)
 * Đọc tiếp:     src/game/level.js (hàm collect: cộng điểm, phát item:collect) → src/gfx/sprites.js (drawProp)
 *
 * Hợp đồng: Item = {type, x, y, got, bob} — x,y = TÂM vật phẩm, px thế giới.
 *   Quy tắc nhặt như MVP: |dx| < 29 và |dy| < 38 so với TÂM player.
 * ========================================================================== */

/**
 * @typedef {Object} CollectibleItem  một vật phẩm trong màn
 * @property {string} type   'pizza' | 'coin' | loại đã registerType
 * @property {number} x      tâm, px thế giới
 * @property {number} y      tâm, px thế giới
 * @property {boolean} got   đã nhặt (không vẽ, không xét nữa)
 * @property {number} bob    lệch pha nhấp nhô, radian (ngẫu nhiên để các vật không nhấp nhô đồng loạt)
 */

/**
 * @typedef {Object} CollectibleTypeDef
 * @property {string} [emoji]  vẽ dự phòng khi Sprites.drawProp không vẽ loại này
 * @property {number} [score]  điểm khi nhặt
 */
(function () {
  'use strict';
  var OG = window.OG;

  var PICKUP_HALF_W = 29;     // nửa bề rộng vùng nhặt, px
  var PICKUP_HALF_H = 38;     // nửa chiều cao vùng nhặt, px
  var MAGNET_PULL_SPEED = 420; // tốc độ vật phẩm bay về phía player khi có nam châm, px/giây
  var BOB_MS = 230;           // hệ số chu kỳ nhấp nhô: sin(t_ms / 230) → một vòng ≈ 1.45 giây
  var BOB_AMPLITUDE = 5;      // biên độ nhấp nhô, px
  var BOB_PHASE_RANGE = 6;    // lệch pha ngẫu nhiên tối đa, radian (≈ 2π)

  /** @type {Object<string, CollectibleTypeDef>} */
  var types = {};

  var Collectibles = (OG.Collectibles = {
    types: types,

    /**
     * Đăng ký (hoặc ghi đè) một loại vật phẩm.
     * @param {string} name
     * @param {CollectibleTypeDef} def
     * @returns {CollectibleTypeDef}
     */
    registerType: function (name, def) { types[name] = def; return def; },

    /**
     * Tạo một vật phẩm mới (chưa nhặt).
     * @param {string} type
     * @param {number} x tâm, px thế giới
     * @param {number} y tâm, px thế giới
     * @returns {CollectibleItem}
     */
    create: function (type, x, y) {
      return { type: type, x: x, y: y, got: false, bob: Math.random() * BOB_PHASE_RANGE };
    },

    /**
     * Kiểm tra player chạm vật phẩm. Có magnet thì đồng thời KÉO vật phẩm về phía player (SỬA it.x, it.y).
     * @param {CollectibleItem} it
     * @param {AABB} p hitbox player (x,y = góc trên-trái)
     * @param {number} dt delta time, giây (dùng cho tốc độ kéo của nam châm)
     * @param {number} magnet bán kính hút, px (0 = không có nam châm)
     * @returns {boolean} true nếu đủ gần để nhặt
     */
    touches: function (it, p, dt, magnet) {
      // So sánh từ TÂM player (item dùng toạ độ tâm, còn hitbox player dùng góc trên-trái).
      var cx = p.x + p.w / 2, cy = p.y + p.h / 2;
      if (magnet > 0) {
        var dx = cx - it.x, dy = cy - it.y, d = Math.sqrt(dx * dx + dy * dy);
        // 💡 Khái niệm: di chuyển về đích với tốc độ cố định — mỗi frame đi tối đa 420·dt px theo hướng (dx, dy)/d,
        //   min(d, …) để không vượt quá đích. d > 1 tránh chia cho số gần 0.
        if (d < magnet && d > 1) { var s = Math.min(d, MAGNET_PULL_SPEED * dt) / d; it.x += dx * s; it.y += dy * s; }
      }
      // 💡 Khái niệm: vùng nhặt hình chữ nhật quanh tâm (|dx| < nửa rộng, |dy| < nửa cao) — tương đương AABB
      //   của item kích thước 58×76 nhưng viết gọn hơn. Vùng hơi rộng cho trẻ em dễ nhặt.
      // 🧪 Thử: đổi PICKUP_HALF_W 29 → 80 — nhân vật "hút" pizza từ xa mà chưa cần chạm.
      return Math.abs(cx - it.x) < PICKUP_HALF_W && Math.abs(cy - it.y) < PICKUP_HALF_H;
    },

    /**
     * Vẽ vật phẩm (nhấp nhô lên xuống). Không vẽ nếu đã nhặt.
     * @param {CanvasRenderingContext2D} ctx đã áp camera
     * @param {CollectibleItem} it
     * @param {number} t thời gian, giây
     */
    draw: function (ctx, it, t) {
      if (it.got) return;
      // Chỉ lệch khi VẼ (yy), toạ độ va chạm it.y giữ nguyên — vùng nhặt không "nhảy" theo hoạt ảnh.
      var yy = it.y + Math.sin(t * 1000 / BOB_MS + it.bob) * BOB_AMPLITUDE;
      if (OG.Sprites.drawProp && OG.Sprites.drawProp(ctx, it.type, it.x, yy, t)) return;
      var T = types[it.type];
      ctx.font = '30px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText((T && T.emoji) || '❔', it.x, yy);
    }
  });

  Collectibles.registerType('pizza', { emoji: '🍕', score: 100 });
  Collectibles.registerType('coin', { emoji: '🪙', score: 10 });
})();
